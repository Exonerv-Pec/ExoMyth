import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { PROFILES } from '../src/core/profiles';

beforeAll(() => {
  // jsdom has no layout engine; CodeMirror only needs these to exist.
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Element.prototype.scrollIntoView = () => {};
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  URL.createObjectURL = () => 'blob:x';
  URL.revokeObjectURL = () => {};
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

describe('story projects in the app', () => {
  let mounted: ReturnType<typeof mount>[] = [];
  afterEach(() => {
    mounted.forEach((m) => unmount(m));
    mounted = [];
    document.body.innerHTML = '';
    app.resetFeatures();
    app.closeVault();
    app.dialog = null;
    app.setMode('split');
  });

  async function boot(files: Record<string, string> = { 'Note.md': '# Note\n\nHello.\n' }) {
    app.lang = 'en';
    app.setMode('split');
    const storage = new MemoryStorage(`t-${Math.random()}`, files);
    app.setVault(await Vault.open(storage));
    app.current = Object.keys(files)[0] ?? null;
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(App, { target }));
    flushSync();
    await wait();
    flushSync();
    return { storage, target };
  }

  it('is offered in the new page window, asks for a name and sets up the folders', async () => {
    const { storage } = await boot();
    app.askNewPage();
    flushSync();
    const link = [...document.querySelectorAll<HTMLButtonElement>('.new-page .link-btn')].find((b) => b.textContent === 'Or set up a whole story project…')!;
    expect(link).toBeTruthy();
    link.click();
    flushSync();
    expect(document.querySelector('.new-page')).toBeNull();
    expect(app.dialog?.kind).toBe('prompt');
    if (app.dialog?.kind !== 'prompt') return;
    expect(app.dialog.title).toBe('New story project');
    await app.dialog.onSubmit('Ember Sea');
    await wait();
    flushSync();
    expect(app.current).toBe('Ember Sea/Ember Sea.md');
    const paths = (app.vault?.pages ?? []).map((p) => p.path).sort();
    expect(paths).toHaveLength(10);
    expect(paths).toContain('Ember Sea/3 Drafts/Ember Sea — Draft.md');
    expect(await storage.exists('Ember Sea/8 Playlist/Ember Sea — Playlist.md')).toBe(true);
    expect(app.toast?.text).toBe('Project “Ember Sea” created');
  });

  it('never overwrites: an existing page stays as it is, and asking again changes nothing', async () => {
    await boot({ 'Ember Sea/Ember Sea.md': '# Ember Sea\n\nMy own overview.\n' });
    await app.createProject('Ember Sea');
    expect(app.vault?.pages).toHaveLength(9);
    expect(app.vault?.getPage('Ember Sea/Ember Sea.md')?.body).toContain('My own overview.');
    await app.createProject('Ember Sea');
    expect(app.toast?.text).toBe('Project “Ember Sea” already exists: nothing changed');
    expect(app.vault?.pages).toHaveLength(9);
  });

  it('has a button on the empty screen and a switch in Settings, and goes with the feature', async () => {
    const { target } = await boot({});
    app.current = null;
    flushSync();
    const empty = [...target.querySelectorAll<HTMLButtonElement>('.empty-state button')].map((b) => b.textContent);
    expect(empty).toContain('New story project');

    app.settingsOpen = true;
    flushSync();
    const row = [...document.querySelectorAll<HTMLLabelElement>('.settings .setting')].find((l) => l.querySelector('.setting-name')!.textContent === 'Story projects')!;
    expect(row.querySelector('input')!.checked).toBe(true);
    app.settingsOpen = false;

    app.setFeature('storyProjects', false);
    flushSync();
    app.askProject();
    expect(app.dialog).toBeNull();
    expect([...target.querySelectorAll<HTMLButtonElement>('.empty-state button')].map((b) => b.textContent)).not.toContain('New story project');
    app.askNewPage();
    flushSync();
    expect(document.querySelector('.new-page .link-btn')?.textContent).not.toBe('Or set up a whole story project…');
  });

  it('is kept for writers and dropped by the profiles for world building, games and notes', () => {
    expect(PROFILES.find((p) => p.id === 'writer')!.off).not.toContain('storyProjects');
    for (const id of ['worldbuilder', 'gamemaster', 'notes']) expect(PROFILES.find((p) => p.id === id)!.off).toContain('storyProjects');
  });

  it('ignores a name that is nothing once made safe', async () => {
    await boot();
    expect(await app.createProject('///')).toBeUndefined();
    expect(app.vault?.pages).toHaveLength(1);
  });
});
