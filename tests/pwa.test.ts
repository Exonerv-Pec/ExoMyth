import { describe, expect, it } from 'vitest';
import { cachedFiles, serviceWorkerSource } from '../src/pwa/worker';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';

/** Runs the service worker's text against a pretend browser and returns what it set up. */
function runWorker(files: string[]) {
  const handlers: Record<string, (e: unknown) => void> = {};
  const stores = new Map<string, Map<string, string>>([['exomyth-app-old', new Map()], ['other-site-cache', new Map()]]);
  const fetched: string[] = [];
  let skipped = false;
  let claimed = false;
  const origin = 'https://example.org';
  const scope = `${origin}/Exomyth/`;
  const key = (r: string | { url: string }) => new URL(typeof r === 'string' ? r : r.url, scope).href;
  const caches = {
    keys: async () => [...stores.keys()],
    delete: async (k: string) => stores.delete(k),
    open: async (name: string) => {
      const store = stores.get(name) ?? new Map<string, string>();
      stores.set(name, store);
      return {
        addAll: async (reqs: { url: string }[]) => reqs.forEach((r) => store.set(key(r), `copy of ${key(r)}`)),
        match: async (r: string | { url: string }) => {
          const k = key(r).replace(/\?.*$/, '');
          return store.has(k) ? { body: store.get(k) } : undefined;
        },
      };
    },
  };
  const self = {
    location: new URL(`${scope}sw.js`),
    clients: { claim: async () => void (claimed = true) },
    skipWaiting: () => void (skipped = true),
    addEventListener: (type: string, fn: (e: unknown) => void) => void (handlers[type] = fn),
  };
  class FakeRequest {
    url: string;
    constructor(url: string) {
      this.url = key(url);
    }
  }
  const fakeFetch = async (r: { url: string }) => {
    fetched.push(r.url);
    return { body: 'from the network' };
  };
  new Function('self', 'caches', 'Request', 'fetch', 'URL', serviceWorkerSource(files, 'v2'))(self, caches, FakeRequest, fakeFetch, URL);
  const wait = async (type: string, extra: object = {}) => {
    let done: Promise<unknown> | undefined;
    let answer: Promise<unknown> | undefined;
    handlers[type]!({ waitUntil: (p: Promise<unknown>) => (done = p), respondWith: (p: Promise<unknown>) => (answer = p), ...extra });
    await done;
    return answer;
  };
  return { handlers, stores, fetched, wait, skipped: () => skipped, claimed: () => claimed, scope, origin };
}

describe('the files kept for working offline', () => {
  it('are every file of the build the app needs, and the start address', () => {
    expect(cachedFiles(['index.html', 'assets/index-1.js', 'assets/index-1.js.map', 'sw.js', 'icon.svg', 'guide/en/start.webp', '.DS_Store'])).toEqual([
      './',
      'assets/index-1.js',
      'guide/en/start.webp',
      'icon.svg',
      'index.html',
    ]);
  });
});

describe('the service worker', () => {
  it('keeps a copy of the app, drops older copies and takes charge', async () => {
    const w = runWorker(['./', 'index.html', 'assets/app.js']);
    await w.wait('install');
    expect([...w.stores.get('exomyth-app-v2')!.keys()]).toEqual([w.scope, `${w.scope}index.html`, `${w.scope}assets/app.js`]);
    await w.wait('activate');
    expect(w.stores.has('exomyth-app-old')).toBe(false);
    // Caches that are not the app's own are left alone.
    expect(w.stores.has('other-site-cache')).toBe(true);
    expect(w.claimed()).toBe(true);
  });

  it('starts the app from the copy, without the network', async () => {
    const w = runWorker(['./', 'index.html', 'assets/app.js']);
    await w.wait('install');
    const page = (await w.wait('fetch', { request: { method: 'GET', mode: 'navigate', url: `${w.scope}?world=1` } })) as { body: string };
    expect(page.body).toBe(`copy of ${w.scope}`);
    const script = (await w.wait('fetch', { request: { method: 'GET', mode: 'cors', url: `${w.scope}assets/app.js` } })) as { body: string };
    expect(script.body).toBe(`copy of ${w.scope}assets/app.js`);
    expect(w.fetched).toEqual([]);
    // Something not in the copy still comes from the server.
    await w.wait('fetch', { request: { method: 'GET', mode: 'cors', url: `${w.scope}new.txt` } });
    expect(w.fetched).toEqual([`${w.scope}new.txt`]);
  });

  it('leaves other sites and anything but reading alone', async () => {
    const w = runWorker(['./']);
    expect(await w.wait('fetch', { request: { method: 'GET', mode: 'cors', url: 'https://elsewhere.example/x.js' } })).toBeUndefined();
    expect(await w.wait('fetch', { request: { method: 'POST', mode: 'cors', url: `${w.scope}x` } })).toBeUndefined();
  });

  it('waits for the person before a new version takes over', async () => {
    const w = runWorker(['./']);
    await w.wait('install');
    expect(w.skipped()).toBe(false);
    w.handlers.message!({ data: 'exomyth:update' });
    expect(w.skipped()).toBe(true);
  });
});

describe('reloading into a new version', () => {
  it('comes back to the same world and page, once', async () => {
    app.setVault(await Vault.open(new MemoryStorage('Coast', { 'A.md': '# A' })));
    app.current = 'A.md';
    app.rememberForReload();
    expect(app.takeReopen()).toEqual({ kind: 'memory', label: 'Coast', page: 'A.md' });
    expect(app.takeReopen()).toBeNull();
    app.closeVault();
  });
});
