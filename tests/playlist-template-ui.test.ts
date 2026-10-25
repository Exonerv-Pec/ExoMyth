import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { builtInTemplates } from '../src/core/templates';
import { isPlaylist, parsePlaylist } from '../src/core/playlist';

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

describe('the Playlist template', () => {
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

  async function boot(lang: 'en' | 'ru' = 'en') {
    app.lang = lang;
    app.setMode('split');
    app.setVault(await Vault.open(new MemoryStorage(`t-${Math.random()}`, { 'Note.md': '# Note\n\nHello.\n' })));
    app.current = 'Note.md';
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(App, { target }));
    flushSync();
    await wait();
    flushSync();
  }

  const chips = () => [...document.querySelectorAll('.template-pick')[0]!.querySelectorAll('.template-chips button')].map((b) => b.textContent);

  it('is offered with the built-in templates while playlists are on, and not when they are off', async () => {
    await boot();
    app.askNewPage();
    flushSync();
    expect(chips()).toEqual(['Blank page', 'Character', 'Place', 'Organization', 'Event', 'Scene', 'Playlist', 'Mood board', 'Calendar']);
    app.dialog = null;
    app.setFeature('playlists', false);
    flushSync();
    app.askNewPage();
    flushSync();
    expect(chips()).not.toContain('Playlist');
    expect(chips()).toContain('Scene');
  });

  it('makes a page in Music that is a playlist and says how to add tracks', async () => {
    await boot();
    const tpl = builtInTemplates('en').find((t) => t.name === 'Playlist')!;
    const path = await app.createPage('Tavern nights', tpl.folder, tpl);
    expect(path).toBe('Music/Tavern nights.md');
    const page = app.vault!.getPage(path!)!;
    expect(isPlaylist(page)).toBe(true);
    expect(page.raw).not.toContain('template:');
    expect(page.tags).toEqual(['music']);
    expect(page.body).toContain('`- ![[Name of a file.mp3]]`');
    // The explanation is not a track: the new playlist starts empty.
    expect(parsePlaylist(page.body)).toEqual([]);
  });

  it('comes in Russian', async () => {
    await boot('ru');
    app.askNewPage();
    flushSync();
    expect(chips()).toContain('Плейлист');
    const tpl = builtInTemplates('ru').find((t) => t.name === 'Плейлист')!;
    expect(await app.createPage('Таверна', tpl.folder, tpl)).toBe('Музыка/Таверна.md');
  });
});
