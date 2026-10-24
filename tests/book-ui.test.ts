import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { parseBookText } from '../src/core/manuscript';
import { DEMO_FILES } from '../src/demo';

let blobs: Blob[] = [];
beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  URL.createObjectURL = (b: Blob) => {
    blobs.push(b);
    return 'blob:book';
  };
  URL.revokeObjectURL = () => {};
});

let mounted: ReturnType<typeof mount>[] = [];
afterEach(() => {
  mounted.forEach((m) => unmount(m));
  mounted = [];
  document.body.innerHTML = '';
  app.dialog = null;
  app.resetFeatures();
  app.closeVault();
  app.setMode('split');
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const BOOK = 'Manuscript/The Silver Thread.md';

async function boot(mode: 'book' | 'preview' = 'book', files: Record<string, string> = DEMO_FILES, current = 'Welcome.md') {
  app.lang = 'en';
  app.setMode(mode);
  const vault = await Vault.open(new MemoryStorage(`b-${Math.random()}`, files));
  app.setVault(vault);
  app.current = current;
  const target = document.createElement('div');
  document.body.append(target);
  mounted.push(mount(App, { target }));
  flushSync();
  await wait();
  flushSync();
  return { target, vault };
}

const columns = (t: HTMLElement) =>
  [...t.querySelectorAll('.book-col:not(.book-col-new)')].map((c) => [
    c.querySelector('h3')!.textContent,
    [...c.querySelectorAll('.sc-title')].map((s) => s.textContent),
  ]);
const contents = async (vault: Vault) => parseBookText(await vault.readRaw(BOOK)).map((c) => [c.title, c.scenes.map((s) => s.target)]);

describe('the book view', () => {
  it('shows chapters and scenes with their status, point of view and words', async () => {
    const { target } = await boot();
    expect(target.querySelector('.book-name')!.textContent).toBe('The Silver Thread');
    expect(columns(target)).toEqual([
      ['Chapter 1: The River', ['Arrival at Rivertown', 'The Market']],
      ['Chapter 2: The Siege', ['The Walls', 'The Last Night']],
    ]);
    const card = (title: string) => [...target.querySelectorAll<HTMLElement>('.scene-card')].find((c) => c.querySelector('.sc-title')!.textContent === title)!;
    expect(card('Arrival at Rivertown').querySelector('.sc-status')!.textContent).toBe('Done');
    expect(card('Arrival at Rivertown').querySelector('.sc-meta')!.textContent).toContain('Kira Vale');
    expect(card('The Last Night').querySelector('.sc-summary')!.textContent).toContain('Arn holds the gate');
    expect(target.querySelectorAll('.book-progress .bp').length).toBe(4);
    expect(target.querySelector('.book-stats')!.textContent).toMatch(/\d+ words · 4 scenes/);
  });

  it('moves scenes with Alt+arrows and writes the order into the book page', async () => {
    const { target, vault } = await boot();
    const market = [...target.querySelectorAll<HTMLElement>('.scene-card')].find((c) => c.textContent?.includes('The Market'))!;
    market.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', altKey: true, bubbles: true }));
    await wait(80);
    flushSync();
    expect(await contents(vault)).toEqual([
      ['Chapter 1: The River', ['Arrival at Rivertown']],
      ['Chapter 2: The Siege', ['The Market', 'The Walls', 'The Last Night']],
    ]);
    const walls = [...target.querySelectorAll<HTMLElement>('.scene-card')].find((c) => c.textContent?.includes('The Walls'))!;
    walls.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', altKey: true, bubbles: true }));
    await wait(80);
    expect((await contents(vault))[1]![1]).toEqual(['The Walls', 'The Market', 'The Last Night']);
    expect(await vault.readRaw(BOOK)).toContain('A short novel set during the [[Siege of Rivertown]]');
  });

  it('adds a scene from the Scene template and a chapter', async () => {
    const { target, vault } = await boot();
    target.querySelectorAll<HTMLButtonElement>('.book-add')[1]!.click();
    flushSync();
    const input = document.querySelector<HTMLInputElement>('.dialog input')!;
    input.value = 'Smoke over the Harbour';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    document.querySelector<HTMLFormElement>('.dialog form')!.requestSubmit();
    await wait(80);
    flushSync();
    expect((await contents(vault))[1]![1]).toEqual(['The Walls', 'The Last Night', 'Smoke over the Harbour']);
    const scene = vault.getPage('Scenes/Smoke over the Harbour.md')!;
    expect(scene.raw).toContain('status: draft');
    expect(scene.raw).toContain('## Conflict');
    expect(app.mode).toBe('book'); // the board stays open

    target.querySelector<HTMLButtonElement>('.book-col-new')!.click();
    flushSync();
    const ch = document.querySelector<HTMLInputElement>('.dialog input')!;
    ch.value = 'Chapter 3: After';
    ch.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    document.querySelector<HTMLFormElement>('.dialog form')!.requestSubmit();
    await wait(80);
    flushSync();
    expect(columns(target).map((c) => c[0])).toEqual(['Chapter 1: The River', 'Chapter 2: The Siege', 'Chapter 3: After']);
  });

  it('reads the whole book straight through and downloads it', async () => {
    const { target } = await boot();
    [...target.querySelectorAll<HTMLButtonElement>('.book-tools .seg button')].find((b) => b.textContent === 'Read')!.click();
    flushSync();
    await wait();
    const text = target.querySelector('.book-text')!;
    expect([...text.querySelectorAll('h2')].map((h) => h.textContent)).toEqual(['Chapter 1: The River', 'Chapter 2: The Siege']);
    expect(text.textContent).toContain('This is home');
    expect(text.querySelector('.spoiler')).toBeTruthy();
    blobs = [];
    [...target.querySelectorAll<HTMLButtonElement>('.book-tools button')].find((b) => b.textContent === 'Download (.md)')!.click();
    await wait();
    const md = await new Promise<string>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(String(r.result));
      r.readAsText(blobs[0]!);
    });
    expect(md.startsWith('# The Silver Thread\n\n## Chapter 1: The River\n\n### Arrival at Rivertown')).toBe(true);
    expect(md).toContain('She had come back for her father.');
    expect(md).not.toContain('[[');
  });

  it('explains books when there are none, and creates one', async () => {
    const { target, vault } = await boot('book', { 'Welcome.md': '# Hi' });
    expect(target.querySelector('.book-view')!.textContent).toContain('Your book will be here');
    target.querySelector<HTMLButtonElement>('.book-view .btn.primary')!.click();
    flushSync();
    const input = document.querySelector<HTMLInputElement>('.dialog input')!;
    input.value = 'My Novel';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    document.querySelector<HTMLFormElement>('.dialog form')!.requestSubmit();
    await wait(80);
    flushSync();
    expect(vault.getPage('Manuscript/My Novel.md')!.raw).toContain('manuscript: true');
    expect(columns(target)).toEqual([['Chapter 1', []]]);
  });

  it('can be switched off in the settings', async () => {
    const { target } = await boot();
    app.setFeature('manuscript', false);
    flushSync();
    expect(app.mode).toBe('split');
    expect([...target.querySelectorAll('.topbar .seg button')].map((b) => b.textContent?.trim())).not.toContain('Book');
  });
});

describe('a scene page', () => {
  it('shows its place in the book, steps to the next scene and sets its status', async () => {
    const { target, vault } = await boot('preview', DEMO_FILES, 'Scenes/The Market.md');
    const nav = target.querySelector('.scene-nav')!;
    const text = () => target.querySelector('.scene-nav')!.textContent!.replace(/\s+/g, ' ');
    expect(text()).toContain('The Silver Thread');
    expect(text()).toContain('Chapter 1: The River · Scene 2 of 4');
    expect(nav.querySelector('.sc-status[aria-pressed="true"]')!.textContent).toBe('Revised');
    [...nav.querySelectorAll<HTMLButtonElement>('.sc-status')].find((b) => b.textContent === 'Done')!.click();
    await wait(80);
    expect(vault.getPage('Scenes/The Market.md')!.raw).toContain('status: done');
    [...nav.querySelectorAll<HTMLButtonElement>('.scene-nav-steps button')][1]!.click();
    await wait();
    expect(app.current).toBe('Scenes/The Walls.md');
    flushSync();
    expect(text()).toContain('Scene 3 of 4');
  });
});
