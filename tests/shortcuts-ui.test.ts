import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
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
  app.shortcutsOpen = false;
  app.setMode('split');
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const press = (target: EventTarget, init: KeyboardEventInit) => {
  target.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, ...init }));
  flushSync();
};

async function boot() {
  app.lang = 'en';
  app.setMode('preview');
  app.setVault(await Vault.open(new MemoryStorage(`k-${Math.random()}`, DEMO_FILES)));
  const target = document.createElement('div');
  document.body.append(target);
  mounted.push(mount(App, { target }));
  flushSync();
  await wait();
  flushSync();
  return target;
}

describe('keyboard shortcuts list', () => {
  it('opens with Ctrl+/ or "?", lists the shortcuts and closes with Esc', async () => {
    await boot();
    press(document.body, { key: '/', code: 'Slash', ctrlKey: true });
    const dialog = document.querySelector('.dialog.shortcuts')!;
    expect(dialog).toBeTruthy();
    expect(dialog.querySelector('h2')!.textContent).toBe('Keyboard shortcuts');
    const text = dialog.textContent!;
    expect(text).toContain('Search the world');
    expect(text).toContain('Quick note to the Inbox');
    expect(text).toContain('Move the selected pin');
    expect(dialog.querySelectorAll('kbd').length).toBeGreaterThan(20);
    press(window, { key: 'Escape' });
    expect(document.querySelector('.dialog.shortcuts')).toBeNull();

    press(document.body, { key: '?' });
    expect(document.querySelector('.dialog.shortcuts')).toBeTruthy();
  });

  it('lets "?" be typed in text fields', async () => {
    const target = await boot();
    const search = target.querySelector<HTMLInputElement>('.sidebar input')!;
    press(search, { key: '?' });
    expect(document.querySelector('.dialog.shortcuts')).toBeNull();
  });

  it('opens from the keyboard button in the sidebar', async () => {
    const target = await boot();
    target.querySelector<HTMLButtonElement>('.side-foot button[aria-label="Keyboard shortcuts"]')!.click();
    flushSync();
    expect(document.querySelector('.dialog.shortcuts')).toBeTruthy();
    document.querySelector<HTMLButtonElement>('.shortcuts-head button')!.click();
    flushSync();
    expect(document.querySelector('.dialog.shortcuts')).toBeNull();
  });
});
