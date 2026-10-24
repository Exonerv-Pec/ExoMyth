import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { DEMO_FILES } from '../src/demo';

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

let mounted: ReturnType<typeof mount>[] = [];
afterEach(() => {
  mounted.forEach((m) => unmount(m));
  mounted = [];
  document.body.innerHTML = '';
  app.resetFeatures();
  app.lookupOpen = false;
  app.closeVault();
  app.setMode('split');
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const press = (target: EventTarget, init: KeyboardEventInit) => {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  flushSync();
};
const ctrlK = () => press(document.body, { key: 'k', code: 'KeyK', ctrlKey: true });

async function boot(mode: 'split' | 'graph' | 'preview' = 'split') {
  app.lang = 'en';
  app.setMode(mode);
  app.setVault(await Vault.open(new MemoryStorage(`l-${Math.random()}`, DEMO_FILES)));
  app.current = 'Characters/Kira Vale.md';
  const target = document.createElement('div');
  document.body.append(target);
  mounted.push(mount(App, { target }));
  flushSync();
  await wait();
  flushSync();
  return target;
}

const lookup = () => document.querySelector<HTMLElement>('.dialog.lookup');
const field = () => document.querySelector<HTMLInputElement>('.dialog.lookup input')!;
async function type(text: string) {
  field().value = text;
  field().dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  await wait();
  flushSync();
}
const titles = () => [...document.querySelectorAll('.lookup-hit .t')].map((e) => e.textContent);

describe('quick look-up', () => {
  it('opens with Ctrl+K over any view, focuses the field and closes with Ctrl+K or Esc', async () => {
    await boot('graph');
    ctrlK();
    await wait();
    expect(lookup()).toBeTruthy();
    expect(app.mode).toBe('graph');
    expect(document.activeElement).toBe(field());
    ctrlK();
    expect(lookup()).toBeNull();
    ctrlK();
    expect(lookup()).toBeTruthy();
    press(window, { key: 'Escape' });
    expect(lookup()).toBeNull();
    expect(app.current).toBe('Characters/Kira Vale.md');
  });

  it('finds pages as you type and previews the chosen one without leaving the page', async () => {
    await boot('preview');
    ctrlK();
    await wait();
    await type('rivertown');
    expect(titles()).toContain('Rivertown');
    const chosen = document.querySelector('.lookup-hit[aria-selected="true"]')!;
    expect(chosen).toBe(document.querySelectorAll('.lookup-hit')[0]);
    const preview = document.querySelector('.lookup-preview')!;
    expect(preview.querySelector('h3')!.textContent).toBe(chosen.querySelector('.t')!.textContent);
    expect(preview.textContent).toMatch(/relations?/i);
    // Nothing was opened.
    expect(app.current).toBe('Characters/Kira Vale.md');
    await type('zzzzzz');
    expect(document.querySelector('.lookup-preview')).toBeNull();
    expect(document.querySelector('.lookup-list')!.textContent).toContain('Nothing found');
  });

  it('moves with the arrows and opens the chosen page with Enter', async () => {
    await boot('preview');
    ctrlK();
    await wait();
    await type('vale');
    const hits = [...document.querySelectorAll('.lookup-hit')];
    expect(hits.length).toBeGreaterThan(2);
    press(field(), { key: 'ArrowDown' });
    press(field(), { key: 'ArrowDown' });
    const selected = () => [...document.querySelectorAll('.lookup-hit')].findIndex((h) => h.getAttribute('aria-selected') === 'true');
    expect(selected()).toBe(2);
    expect(field().getAttribute('aria-activedescendant')).toBe('lookup-opt-2');
    press(field(), { key: 'ArrowUp' });
    expect(selected()).toBe(1);
    // Past the first result it wraps to the last one.
    press(field(), { key: 'ArrowUp' });
    press(field(), { key: 'ArrowUp' });
    expect(selected()).toBe(hits.length - 1);
    press(field(), { key: 'ArrowDown' });
    const title = hits[0]!.querySelector('.t')!.textContent!;
    press(field(), { key: 'Enter' });
    await wait();
    flushSync();
    expect(lookup()).toBeNull();
    expect(app.vault!.getPage(app.current!)!.title).toBe(title);
  });

  it('clicking a result opens it; pointing at one chooses it', async () => {
    await boot('preview');
    ctrlK();
    await wait();
    await type('vale');
    const hits = [...document.querySelectorAll<HTMLElement>('.lookup-hit')];
    hits[1]!.dispatchEvent(new MouseEvent('mousemove', { bubbles: true }));
    flushSync();
    expect(document.querySelectorAll('.lookup-hit')[1]!.getAttribute('aria-selected')).toBe('true');
    const title = hits[1]!.querySelector('.t')!.textContent!;
    hits[1]!.click();
    await wait();
    flushSync();
    expect(lookup()).toBeNull();
    expect(app.vault!.getPage(app.current!)!.title).toBe(title);
  });

  it('keeps focus mode and gives the focus back to the text on Esc', async () => {
    const target = await boot('split');
    app.setFocus(true);
    flushSync();
    const text = target.querySelector<HTMLElement>('.cm-content')!;
    text.focus();
    ctrlK();
    await wait();
    expect(app.focus).toBe(true);
    expect(document.activeElement).toBe(field());
    // Esc closes the look-up only; focus mode stays.
    press(window, { key: 'Escape' });
    expect(lookup()).toBeNull();
    expect(app.focus).toBe(true);
    expect(document.activeElement).toBe(text);
    press(window, { key: 'Escape' });
    expect(app.focus).toBe(false);
  });

  it('opens from the top bar button', async () => {
    const target = await boot('split');
    target.querySelector<HTMLButtonElement>('.topbar button[aria-label="Quick look-up"]')!.click();
    flushSync();
    expect(lookup()).toBeTruthy();
  });

  it('can be switched off; Ctrl+K then goes to the search field in the sidebar', async () => {
    const target = await boot('split');
    app.setFeature('quickLookup', false);
    flushSync();
    expect(target.querySelector('.topbar button[aria-label="Quick look-up"]')).toBeNull();
    ctrlK();
    await wait();
    flushSync();
    expect(lookup()).toBeNull();
    expect(document.activeElement).toBe(target.querySelector('#search'));
    // Switching it off while it is open closes it.
    app.setFeature('quickLookup', true);
    ctrlK();
    expect(lookup()).toBeTruthy();
    app.setFeature('quickLookup', false);
    flushSync();
    expect(lookup()).toBeNull();
  });

  it('does not open over a dialog or the settings', async () => {
    await boot('split');
    app.settingsOpen = true;
    flushSync();
    ctrlK();
    expect(lookup()).toBeNull();
    app.settingsOpen = false;
    app.askNewPage();
    flushSync();
    ctrlK();
    expect(lookup()).toBeNull();
  });
});
