import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { EditorView } from '@codemirror/view';
import App from '../src/App.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { PROFILES } from '../src/core/profiles';
import { dayKey, emptyStats, serializeStats, setGoal, addWords, parseStats } from '../src/core/stats';

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
const STATS_FILE = '.exomyth/writing.json';

describe('writing stats in the app', () => {
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

  async function boot(files: Record<string, string> = {}) {
    app.lang = 'en';
    app.setMode('split');
    const storage = new MemoryStorage(`t-${Math.random()}`, { 'Story.md': '# Story\n\nOne two three.\n', ...files });
    app.setVault(await Vault.open(storage));
    app.current = 'Story.md';
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(App, { target }));
    flushSync();
    await wait();
    flushSync();
    const view = EditorView.findFromDOM(target.querySelector<HTMLElement>('.cm-editor')!)!;
    const type = (text: string) => {
      view.dispatch({ changes: { from: view.state.doc.length, insert: text }, userEvent: 'input.type' });
      flushSync();
    };
    return { storage, target, view, type };
  }

  const today = () => app.stats.days[dayKey()];

  it('counts the words a save adds and the time between keystrokes, and keeps them in the world', async () => {
    const { storage, type } = await boot();
    expect(app.stats.days).toEqual({});
    type('\nFour five six seven.\n');
    await wait(20);
    type('Eight nine.');
    await app.flush();
    expect(today()?.words).toBe(6);
    expect(today()?.seconds).toBeGreaterThan(0);
    expect(today()?.seconds).toBeLessThan(5);
    const saved = parseStats(await storage.readText(STATS_FILE));
    expect(saved.days[dayKey()]?.words).toBe(6);
  });

  it('does not subtract the words that are deleted', async () => {
    const { view, type } = await boot();
    type(' Four five.');
    await app.flush();
    expect(today()?.words).toBe(2);
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '# Story\n' }, userEvent: 'delete.selection' });
    await app.flush();
    expect(today()?.words).toBe(2);
  });

  it('reads the stats saved with the world', async () => {
    const saved = setGoal(addWords(emptyStats(), dayKey(), 321), 500);
    await boot({ [STATS_FILE]: serializeStats(saved) });
    expect(today()?.words).toBe(321);
    expect(app.stats.goal).toBe(500);
  });

  it('shows the day in the top bar and opens the stats from it', async () => {
    const { target, type } = await boot();
    expect(target.querySelector('.stats-chip')).toBeNull();
    type(' Four five.');
    await app.flush();
    flushSync();
    const chip = target.querySelector<HTMLButtonElement>('.stats-chip')!;
    expect(chip.textContent).toBe('+2 today');
    app.setGoal('500');
    flushSync();
    expect(target.querySelector('.stats-chip')!.textContent).toBe('2 of 500 today');

    expect(document.querySelector('.dialog.stats')).toBeNull();
    target.querySelector<HTMLButtonElement>('button[aria-label="Writing stats"]')!.click();
    flushSync();
    expect(document.querySelector('.dialog.stats')).not.toBeNull();
  });

  it('shows the tiles, the goal and 30 bars, and closes with Escape', async () => {
    const { type } = await boot();
    type(' Four five.');
    await app.flush();
    app.statsOpen = true;
    flushSync();
    const dialog = document.querySelector('.dialog.stats')!;
    const tiles = [...dialog.querySelectorAll('.st-tile')].map((t) => t.textContent);
    expect(tiles).toHaveLength(4);
    expect(tiles[0]).toContain('2 words');
    expect(tiles[2]).toContain('1 day');
    expect(dialog.querySelectorAll('.st-bars li')).toHaveLength(30);
    expect(dialog.querySelectorAll('.st-bars li.today')).toHaveLength(1);
    expect(dialog.querySelector('.st-progress')).toBeNull();

    const input = dialog.querySelector<HTMLInputElement>('#stats-goal')!;
    input.value = '4';
    input.dispatchEvent(new Event('change', { bubbles: true }));
    flushSync();
    expect(app.stats.goal).toBe(4);
    expect(dialog.querySelector('.st-progress')!.getAttribute('aria-valuenow')).toBe('2');
    type(' Six seven.');
    await app.flush();
    flushSync();
    expect(dialog.textContent).toContain('Goal reached');

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    flushSync();
    expect(document.querySelector('.dialog.stats')).toBeNull();
    expect(app.statsOpen).toBe(false);
  });

  it('says so when nothing was written yet', async () => {
    await boot();
    app.statsOpen = true;
    flushSync();
    expect(document.querySelector('.dialog.stats')!.textContent).toContain('Nothing written yet');
    expect(document.querySelector<HTMLButtonElement>('.dialog.stats .settings-foot button')!.disabled).toBe(true);
  });

  it('clears the stats only after a confirmation', async () => {
    const { storage, type } = await boot();
    type(' Four five.');
    await app.flush();
    app.statsOpen = true;
    flushSync();
    document.querySelector<HTMLButtonElement>('.dialog.stats .settings-foot button')!.click();
    flushSync();
    expect(app.dialog?.kind).toBe('confirm');
    expect(today()?.words).toBe(2);
    // Escape closes the question, not the stats behind it.
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    flushSync();
    expect(app.statsOpen).toBe(true);
    if (app.dialog?.kind === 'confirm') await app.dialog.onConfirm();
    app.dialog = null;
    flushSync();
    expect(app.stats.days).toEqual({});
    expect(parseStats(await storage.readText(STATS_FILE)).days).toEqual({});
  });

  it('stops counting and hides everything when the switch is off', async () => {
    const { target, type } = await boot();
    app.statsOpen = true;
    flushSync();
    expect(document.querySelector('.dialog.stats')).not.toBeNull();
    app.setFeature('writingStats', false);
    flushSync();
    expect(document.querySelector('.dialog.stats')).toBeNull();
    expect(app.statsOpen).toBe(false);
    type(' Four five.');
    await app.flush();
    flushSync();
    expect(app.stats.days).toEqual({});
    expect(target.querySelector('.stats-chip')).toBeNull();
    expect(target.querySelector('button[aria-label="Writing stats"]')).toBeNull();
  });

  it('is a switch under Settings, kept for writers and dropped by the world-building profiles', async () => {
    await boot();
    app.settingsOpen = true;
    flushSync();
    const row = [...document.querySelectorAll<HTMLLabelElement>('.settings .setting')].find((l) => l.querySelector('.setting-name')!.textContent === 'Writing stats');
    expect(row?.querySelector('input')?.checked).toBe(true);
    app.settingsOpen = false;
    expect(PROFILES.find((p) => p.id === 'writer')!.off).not.toContain('writingStats');
    for (const id of ['worldbuilder', 'gamemaster', 'notes']) expect(PROFILES.find((p) => p.id === id)!.off).toContain('writingStats');
  });
});
