import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { app, FEATURES } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { parsePage } from '../src/core/parse';
import { isBook } from '../src/core/manuscript';
import { PROFILES, starterFiles } from '../src/core/profiles';
import { DEMO_FILES } from '../src/demo';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  URL.createObjectURL = () => 'blob:x';
  URL.revokeObjectURL = () => {};
});

let mounted: ReturnType<typeof mount>[] = [];
afterEach(() => {
  mounted.forEach((m) => unmount(m));
  mounted = [];
  document.body.innerHTML = '';
  app.closeVault();
  app.setMode('split');
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

async function boot(files: Record<string, string>, name = `p-${Math.random()}`) {
  app.lang = 'en';
  app.setMode('split');
  const vault = await Vault.open(new MemoryStorage(name, files));
  app.setVault(vault);
  const target = document.createElement('div');
  document.body.append(target);
  mounted.push(mount(App, { target }));
  flushSync();
  await wait();
  flushSync();
  return { target, vault };
}

const card = (name: string) => [...document.querySelectorAll<HTMLButtonElement>('.profile-card')].find((c) => c.querySelector('.pf-name')!.textContent === name)!;

describe('start profiles', () => {
  it('every profile switches only known parts and makes valid starting pages', () => {
    for (const p of PROFILES) {
      for (const f of p.off) expect(FEATURES as readonly string[]).toContain(f);
      for (const lang of ['en', 'ru'] as const) {
        for (const f of starterFiles(p.id, lang, 'My World')) expect(parsePage(f.path, f.text, 1).parseError).toBeUndefined();
      }
    }
    expect(PROFILES.find((p) => p.id === 'worldbuilder')!.off).toContain('manuscript');
  });

  it('asks what a new, empty world is for; a writer gets a book and no graph or maps', async () => {
    const { target, vault } = await boot({}, 'My Novel');
    expect(document.querySelector('.dialog.profiles')).toBeTruthy();
    card('Writer').click();
    await wait(80);
    flushSync();
    expect(document.querySelector('.dialog.profiles')).toBeNull();
    expect(app.on('graph')).toBe(false);
    expect(app.on('maps')).toBe(false);
    expect(app.on('manuscript')).toBe(true);
    const modes = [...target.querySelectorAll('.topbar .seg button')].map((b) => b.textContent?.trim());
    expect(modes).toContain('Book');
    expect(modes).not.toContain('Graph');
    const book = vault.getPage('Manuscript/My Novel.md')!;
    expect(isBook(book)).toBe(true);
    expect(app.bookPath).toBe(book.path);
    expect(app.current).toBe('Start here.md');
    expect(vault.getPage('Start here.md')!.raw).toContain('[[My Novel]]');
  });

  it('a worldbuilder has no Book; a game master gets a Session template', async () => {
    await boot({}, 'Campaign');
    card('Game master').click();
    await wait(80);
    expect(app.on('manuscript')).toBe(false);
    expect(app.vault!.getPage('Templates/Session.md')!.raw).toContain('folder: Sessions');
    app.closeVault();
    await boot({}, 'Atlas');
    card('Worldbuilder').click();
    await wait(80);
    expect(app.on('manuscript')).toBe(false);
    expect(app.on('graph')).toBe(true);
  });

  it('each world keeps its own parts, and worlds with pages are not asked', async () => {
    const { vault } = await boot({}, 'Notes world');
    card('Just notes').click();
    await wait(80);
    expect(app.on('timeline')).toBe(false);
    app.closeVault();
    // Another world (with pages) still has everything.
    await boot(DEMO_FILES, 'Demo world');
    expect(document.querySelector('.dialog.profiles')).toBeNull();
    expect(app.on('timeline')).toBe(true);
    app.closeVault();
    app.setVault(vault);
    expect(app.on('timeline')).toBe(false);
    expect(app.profile).toBe('notes');
  });

  it('can be changed from Settings without adding pages; skipping keeps everything on', async () => {
    const { vault } = await boot(DEMO_FILES);
    app.settingsOpen = true;
    flushSync();
    document.querySelector<HTMLButtonElement>('.profile-row button')!.click();
    flushSync();
    expect(app.settingsOpen).toBe(false);
    expect(document.querySelector<HTMLInputElement>('.pf-starter input')!.checked).toBe(false);
    const before = vault.pages.length;
    card('Worldbuilder').click();
    await wait(80);
    expect(vault.pages.length).toBe(before);
    expect(app.on('manuscript')).toBe(false);
    app.closeVault();
    await boot({}, 'Skipped');
    document.querySelector<HTMLButtonElement>('.profiles .shortcuts-head button')!.click();
    flushSync();
    expect(document.querySelector('.dialog.profiles')).toBeNull();
    expect(FEATURES.every((f) => app.on(f))).toBe(true);
  });
});
