/**
 * The desktop app (src-tauri) seen from the window: the commands it sends and what it does with the
 * answers. A small fake of the Rust side stands in for Tauri, with the same command names and
 * arguments, and keeps files in memory.
 */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { DEMO_FILES } from '../src/demo';

type Args = Record<string, unknown> | Uint8Array;
interface Folder {
  id: string;
  name: string;
  path: string;
  lastOpened: number;
}

const calls: { cmd: string; args: Args; headers: Record<string, string> }[] = [];
const disks = new Map<string, Map<string, Uint8Array>>();
let folders: Folder[] = [];
let picked: { name: string; path: string } | null = null;
let latest = 'v1.0.0';

function disk(id: string): Map<string, Uint8Array> {
  if (!folders.some((f) => f.id === id)) throw new Error('This folder is not open in Exomyth');
  if (!disks.has(id)) disks.set(id, new Map());
  return disks.get(id)!;
}

function remember(name: string, path: string): Folder {
  const f = { id: `f${folders.length + 1}`, name, path, lastOpened: Date.now() };
  folders.push(f);
  return f;
}

/** What src-tauri/src/lib.rs answers, command by command. */
function rust(cmd: string, args: Args, headers: Record<string, string>): unknown {
  const a = args as Record<string, string>;
  const h = (k: string) => decodeURIComponent(headers[k] ?? '');
  switch (cmd) {
    case 'folders_list':
      return [...folders].sort((x, y) => y.lastOpened - x.lastOpened);
    case 'folder_pick':
      return picked ? remember(picked.name, picked.path) : null;
    case 'folder_create':
      return picked ? remember(a.name!, `${picked.path}/${a.name}`) : null;
    case 'folder_open': {
      const f = folders.find((x) => x.id === a.id);
      if (!f) throw new Error('This folder is not in the list');
      return f;
    }
    case 'folder_forget':
      folders = folders.filter((x) => x.id !== a.id);
      return null;
    case 'fs_list': {
      const all = [...disk(a.folder!).entries()].map(([path, d]) => ({ path, mtime: 1, size: d.byteLength }));
      return a.dir ? all.filter((e) => e.path.startsWith(a.dir + '/')) : all.filter((e) => !e.path.startsWith('.exomyth/versions/'));
    }
    case 'fs_stat': {
      const d = disk(a.folder!).get(a.path!);
      return d ? { path: a.path, mtime: 1, size: d.byteLength } : null;
    }
    case 'fs_exists':
      return disk(a.folder!).has(a.path!);
    case 'fs_read': {
      const d = disk(a.folder!).get(a.path!);
      if (!d) throw new Error(`File not found: ${a.path}`);
      return d.slice().buffer;
    }
    case 'fs_write':
      disk(h('x-folder')).set(h('x-path'), (args as Uint8Array).slice());
      return null;
    case 'fs_remove':
      disk(a.folder!).delete(a.path!);
      return null;
    case 'save_file':
      return true;
    case 'update_check':
      return { current: '1.0.0', latest: latest.replace(/^v/, ''), newer: latest !== 'v1.0.0' };
    case 'open_releases':
      return null;
    default:
      throw new Error(`Unknown command ${cmd}`);
  }
}

beforeAll(() => {
  (window as unknown as { __TAURI_INTERNALS__: unknown }).__TAURI_INTERNALS__ = {
    invoke: async (cmd: string, args: Args = {}, options?: { headers?: Record<string, string> }) => {
      const headers = options?.headers ?? {};
      calls.push({ cmd, args, headers });
      return rust(cmd, args, headers);
    },
    transformCallback: () => 0,
  };
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
afterEach(async () => {
  const { app } = await import('../src/app.svelte');
  mounted.forEach((m) => unmount(m));
  mounted = [];
  document.body.innerHTML = '';
  app.settingsOpen = false;
  app.closeVault();
  calls.length = 0;
  folders = [];
  disks.clear();
  picked = null;
  latest = 'v1.0.0';
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const button = (text: string) => [...document.querySelectorAll('button')].find((b) => b.textContent?.trim() === text);

async function start() {
  const { app } = await import('../src/app.svelte');
  const { default: App } = await import('../src/App.svelte');
  app.lang = 'en';
  const target = document.createElement('div');
  document.body.append(target);
  mounted.push(mount(App, { target }));
  await wait();
  flushSync();
  return app;
}

describe('desktop app', () => {
  it('knows it runs on the desktop', async () => {
    const desktop = await import('../src/desktop');
    expect(desktop.isDesktop).toBe(true);
  });

  it('keeps a world in a folder through the Rust side', async () => {
    const desktop = await import('../src/desktop');
    const folder = remember('Silver Coast', '/home/me/Worlds/Silver Coast');
    const storage = new desktop.DesktopStorage(folder);
    expect(storage.kind).toBe('folder');
    expect(storage.label).toBe('Silver Coast');

    await storage.writeText('Персонажи/Кира Вейл.md', '# Кира Вейл\n');
    await storage.writeText('.exomyth/versions/Персонажи/Кира Вейл.md/1.md', 'old');
    expect(await storage.readText('Персонажи/Кира Вейл.md')).toBe('# Кира Вейл\n');
    const write = calls.find((c) => c.cmd === 'fs_write')!;
    expect(ArrayBuffer.isView(write.args)).toBe(true);
    expect(decodeURIComponent(write.headers['x-path']!)).toBe('Персонажи/Кира Вейл.md');

    expect((await storage.list()).map((e) => e.path)).toEqual(['Персонажи/Кира Вейл.md']);
    expect((await storage.listDir('.exomyth/versions/')).map((e) => e.path)).toEqual(['.exomyth/versions/Персонажи/Кира Вейл.md/1.md']);
    expect((await storage.stat('Персонажи/Кира Вейл.md'))?.size).toBeGreaterThan(0);
    expect(await storage.stat('Nowhere.md')).toBeUndefined();
    expect(await storage.exists('Персонажи/Кира Вейл.md')).toBe(true);
    await storage.remove('Персонажи/Кира Вейл.md');
    expect(await storage.exists('Персонажи/Кира Вейл.md')).toBe(false);
  });

  it('opens a recent folder from the welcome screen', async () => {
    const f = remember('Silver Coast', '/home/me/Worlds/Silver Coast');
    const files = disk(f.id);
    for (const [path, text] of Object.entries(DEMO_FILES)) files.set(path, new TextEncoder().encode(text));
    const app = await start();
    const world = button('Silver Coast')!;
    expect(world.title).toBe('/home/me/Worlds/Silver Coast');
    world.click();
    await wait(120);
    flushSync();
    expect(app.vault?.storage.label).toBe('Silver Coast');
    expect(app.vault?.getPage('Characters/Kira Vale.md')).toBeDefined();
    expect(calls.some((c) => c.cmd === 'folder_open')).toBe(true);
  });

  it('makes a new world as a new folder', async () => {
    picked = { name: 'Worlds', path: '/home/me/Worlds' };
    const app = await start();
    expect(document.body.textContent).toContain('Create a world in a new folder on this computer');
    const input = document.querySelector<HTMLInputElement>('#new-world')!;
    input.value = 'Ashen Isles';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    button('Create')!.click();
    await wait(120);
    flushSync();
    const create = calls.find((c) => c.cmd === 'folder_create')!;
    expect(create.args).toMatchObject({ name: 'Ashen Isles', title: 'Where should the folder for “Ashen Isles” go?' });
    expect(app.vault?.storage.kind).toBe('folder');
    expect(app.vault?.storage.label).toBe('Ashen Isles');
  });

  it('asks where to save files made in the app', async () => {
    const { saveToDevice } = await import('../src/save');
    expect(await saveToDevice(new Uint8Array([1, 2, 3]), 'Кира Вейл.png', 'image/png')).toBe(true);
    const save = calls.find((c) => c.cmd === 'save_file')!;
    expect(decodeURIComponent(save.headers['x-name']!)).toBe('Кира Вейл.png');
    expect([...(save.args as Uint8Array)]).toEqual([1, 2, 3]);
  });

  it('checks for updates only when asked', async () => {
    latest = 'v1.1.0';
    const app = await start();
    app.settingsOpen = true;
    flushSync();
    expect(document.body.textContent).toContain('Exomyth for the desktop');
    expect(document.body.textContent).toContain(`Version ${__EXOMYTH_VERSION__}.`);
    expect(document.body.textContent).not.toContain('The app on this device');
    expect(calls.some((c) => c.cmd === 'update_check')).toBe(false);

    button('Check for updates')!.click();
    await wait();
    flushSync();
    expect(calls.filter((c) => c.cmd === 'update_check')).toHaveLength(1);
    expect(document.body.textContent).toContain('Version 1.1.0 is out.');
    button('Download')!.click();
    await wait();
    expect(calls.some((c) => c.cmd === 'open_releases')).toBe(true);
  });

  it('says so when it already is the latest version', async () => {
    const app = await start();
    app.settingsOpen = true;
    flushSync();
    button('Check for updates')!.click();
    await wait();
    flushSync();
    expect(document.body.textContent).toContain('This is the latest version.');
    expect(button('Download')).toBeUndefined();
  });
});
