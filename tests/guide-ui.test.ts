import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { DEMO_FILES } from '../src/demo';

beforeAll(() => {
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

describe('the guide in the app', () => {
  let mounted: ReturnType<typeof mount>[] = [];
  afterEach(() => {
    mounted.forEach((m) => unmount(m));
    mounted = [];
    document.body.innerHTML = '';
    app.guideOpen = false;
    app.guideTopic = null;
    app.closeVault();
    app.resetFeatures();
    app.setMode('split');
  });

  async function boot(withWorld = true) {
    app.lang = 'en';
    if (withWorld) {
      app.setVault(await Vault.open(new MemoryStorage(`g-${Math.random()}`, DEMO_FILES)));
      app.current = 'Welcome.md';
    }
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(App, { target }));
    flushSync();
    await wait();
    flushSync();
  }
  const click = (el: Element | null | undefined) => {
    expect(el).toBeTruthy();
    (el as HTMLElement).click();
    flushSync();
  };
  const topics = () => [...document.querySelectorAll('.guide-nav li button')].map((b) => b.textContent!.trim());

  it('opens with F1 and from the sidebar, with every topic and its picture', async () => {
    await boot();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'F1', bubbles: true, cancelable: true }));
    flushSync();
    expect(app.guideOpen).toBe(true);
    expect(topics()[0]).toBe('Getting started');
    expect(topics()).toContain('Mood boards');
    expect(topics().length).toBeGreaterThanOrEqual(20);
    expect(document.querySelector('.guide-topic h3')!.textContent).toBe('Getting started');
    expect(document.querySelector<HTMLImageElement>('.guide-shot')!.getAttribute('src')).toBe('/guide/en/start.webp');
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(app.guideOpen).toBe(false);
    click(document.querySelector('.side-foot button[aria-label="Guide"]'));
    expect(app.guideOpen).toBe(true);
  });

  it('shows a topic, and Try it takes you there', async () => {
    await boot();
    app.openGuide();
    flushSync();
    click([...document.querySelectorAll('.guide-nav li button')].find((b) => b.textContent!.trim() === 'Graph'));
    expect(document.querySelector('.guide-topic h3')!.textContent).toBe('Graph');
    expect(document.querySelector('.guide-text')!.textContent).toContain('Lay out again');
    click([...document.querySelectorAll('.guide-topic button')].find((b) => b.textContent === 'Try it'));
    await wait();
    flushSync();
    expect(app.guideOpen).toBe(false);
    expect(app.mode).toBe('graph');
  });

  it('opens a demo page with its panel, or says it is in the demo world', async () => {
    await boot();
    app.openGuide('editing');
    flushSync();
    click([...document.querySelectorAll('.guide-topic button')].find((b) => b.textContent === 'Try it'));
    await wait();
    flushSync();
    expect(app.current).toBe('Scenes/The Market.md');
    expect(app.revisionOpen).toBe(true);
    app.revisionOpen = false;
  });

  it('says when a part is switched off and switches it on', async () => {
    await boot();
    app.setFeature('moodBoards', false);
    app.openGuide('boards');
    flushSync();
    expect(document.querySelector('.guide-note')!.textContent).toContain('Switched off in Settings.');
    expect([...document.querySelectorAll('.guide-topic button')].some((b) => b.textContent === 'Try it')).toBe(false);
    click([...document.querySelectorAll('.guide-topic button')].find((b) => b.textContent === 'Switch on'));
    expect(app.on('moodBoards')).toBe(true);
    expect([...document.querySelectorAll('.guide-topic button')].some((b) => b.textContent === 'Try it')).toBe(true);
  });

  it('finds topics by words, in the chosen language', async () => {
    await boot();
    app.openGuide();
    flushSync();
    const search = document.querySelector<HTMLInputElement>('.guide-nav input')!;
    search.value = 'crop';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(topics()).toEqual(['Mood boards']);
    search.value = 'zzzz';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(document.querySelector('.guide-nav')!.textContent).toContain('Nothing found.');
    app.lang = 'ru';
    search.value = '';
    search.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    expect(topics()[0]).toBe('С чего начать');
    expect(document.querySelector<HTMLImageElement>('.guide-shot')!.getAttribute('src')).toBe('/guide/ru/start.webp');
    app.lang = 'en';
  });

  it('opens from the start screen too, without Try it buttons', async () => {
    await boot(false);
    click([...document.querySelectorAll('.welcome button')].find((b) => b.textContent === 'Guide'));
    expect(app.guideOpen).toBe(true);
    app.guideTopic = 'graph';
    flushSync();
    expect([...document.querySelectorAll('.guide-topic button')].some((b) => b.textContent === 'Try it')).toBe(false);
  });
});
