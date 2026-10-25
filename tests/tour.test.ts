import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { DEMO_FILES } from '../src/demo';
import { onScreen, placeHint, TOUR_KEY, TOUR_STEPS } from '../src/core/tour';

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

describe('placing the hints', () => {
  it('knows what is on screen', () => {
    expect(onScreen({ left: 0, top: 0, width: 270, height: 800 }, 1280, 800)).toBe(true);
    expect(onScreen({ left: -280, top: 0, width: 270, height: 800 }, 390, 780)).toBe(false); // a closed drawer
    expect(onScreen({ left: 10, top: 10, width: 0, height: 0 }, 1280, 800)).toBe(false);
  });

  it('puts a hint beside its part, inside the window, or in the middle', () => {
    const hint = { width: 320, height: 160 };
    // Below a bar at the top, lined up with it but never past the edge.
    expect(placeHint({ left: 290, top: 50, width: 470, height: 30 }, hint, 1280, 800)).toEqual({ left: 365, top: 92, side: 'below' });
    // A tall panel on the left: to its right.
    expect(placeHint({ left: 0, top: 0, width: 272, height: 800 }, hint, 1280, 800)).toMatchObject({ left: 284, side: 'right' });
    // A tall panel on the right: to its left.
    expect(placeHint({ left: 940, top: 0, width: 340, height: 800 }, hint, 1280, 800)).toMatchObject({ left: 608, side: 'left' });
    // A button at the bottom: above it.
    expect(placeHint({ left: 180, top: 750, width: 30, height: 30 }, hint, 1280, 800)).toMatchObject({ top: 578, side: 'above', left: 35 });
    expect(placeHint(null, hint, 1280, 800)).toEqual({ left: 480, top: 320, side: 'middle' });
    // Too big a part on a small screen: over it, in the middle.
    expect(placeHint({ left: 0, top: 0, width: 390, height: 780 }, hint, 390, 780).side).toBe('middle');
  });
});

describe('the tour', () => {
  let mounted: ReturnType<typeof mount>[] = [];
  afterEach(() => {
    mounted.forEach((m) => unmount(m));
    mounted = [];
    document.body.innerHTML = '';
    app.tourStep = null;
    app.guideOpen = false;
    app.closeVault();
    localStorage.setItem(TOUR_KEY, 'done');
  });

  async function boot() {
    app.lang = 'en';
    app.setVault(await Vault.open(new MemoryStorage(`t-${Math.random()}`, DEMO_FILES)));
    app.current = 'Welcome.md';
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(App, { target }));
    flushSync();
  }
  const hint = () => document.querySelector('.tour-hint');
  const press = (key: string) => {
    window.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    flushSync();
  };
  const button = (text: string) => [...document.querySelectorAll<HTMLButtonElement>('.tour-hint button')].find((b) => b.textContent === text)!;

  it('starts by itself the first time a world opens, and walks through every step', async () => {
    localStorage.removeItem(TOUR_KEY);
    await boot();
    expect(hint()).toBeNull();
    await wait(800);
    flushSync();
    expect(hint()!.querySelector('h2')!.textContent).toBe('Welcome to Exomyth');
    expect(hint()!.querySelector('.tour-count')!.textContent).toBe(`Step 1 of ${TOUR_STEPS.length}`);
    expect(button('Back')).toBeUndefined();
    button('Next').click();
    flushSync();
    expect(hint()!.querySelector('h2')!.textContent).toBe('The pages of the world');
    press('ArrowRight');
    press('ArrowLeft');
    expect(app.tourStep).toBe(1);
    for (let i = 1; i < TOUR_STEPS.length - 1; i++) press('ArrowRight');
    expect(hint()!.querySelector('h2')!.textContent).toBe('The guide');
    expect(button('Skip')).toBeUndefined();
    button('Done').click();
    flushSync();
    expect(hint()).toBeNull();
    expect(localStorage.getItem(TOUR_KEY)).toBe('done');
  });

  it('can be skipped with Esc, and does not come back by itself', async () => {
    localStorage.removeItem(TOUR_KEY);
    await boot();
    await wait(800);
    flushSync();
    press('Escape');
    expect(hint()).toBeNull();
    expect(app.tourDue).toBe(false);
  });

  it('never starts by itself once seen', async () => {
    await boot();
    await wait(800);
    flushSync();
    expect(hint()).toBeNull();
  });

  it('starts again from the guide', async () => {
    await boot();
    app.openGuide();
    flushSync();
    [...document.querySelectorAll<HTMLButtonElement>('.dialog.guide button')].find((b) => b.textContent === 'Show the tour')!.click();
    flushSync();
    await wait();
    flushSync();
    expect(app.guideOpen).toBe(false);
    expect(hint()!.querySelector('h2')!.textContent).toBe('Welcome to Exomyth');
  });
});
