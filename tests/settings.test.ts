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
  app.resetFeatures();
  app.settingsOpen = false;
  app.closeVault();
  app.setMode('split');
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

async function boot(mode: 'split' | 'graph' = 'split') {
  app.lang = 'en';
  app.setMode(mode);
  app.setVault(await Vault.open(new MemoryStorage(`s-${Math.random()}`, DEMO_FILES)));
  app.current = 'Characters/Kira Vale.md';
  const target = document.createElement('div');
  document.body.append(target);
  mounted.push(mount(App, { target }));
  flushSync();
  await wait();
  flushSync();
  return target;
}

const toggle = (label: string) => {
  const row = [...document.querySelectorAll<HTMLLabelElement>('.settings .setting')].find((l) => l.querySelector('.setting-name')!.textContent === label)!;
  row.querySelector<HTMLInputElement>('input')!.click();
  flushSync();
};
const modes = (t: HTMLElement) => [...t.querySelectorAll('.topbar .seg button')].map((b) => b.textContent!.trim());

describe('settings', () => {
  it('opens with Ctrl+, and from the gear button, everything on by default', async () => {
    const target = await boot();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: ',', code: 'Comma', ctrlKey: true, bubbles: true }));
    flushSync();
    expect(document.querySelector('.dialog.settings')).toBeTruthy();
    const switches = [...document.querySelectorAll<HTMLInputElement>('.settings input[role="switch"]')];
    expect(switches.length).toBe(20);
    expect(switches.every((s) => s.checked)).toBe(true);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(document.querySelector('.dialog.settings')).toBeNull();
    target.querySelector<HTMLButtonElement>('.side-foot button[aria-label="Settings"]')!.click();
    flushSync();
    expect(document.querySelector('.dialog.settings')).toBeTruthy();
  });

  it('turning off a view removes it, and leaves it when it is open', async () => {
    const target = await boot('graph');
    expect(modes(target)).toContain('Graph');
    app.settingsOpen = true;
    flushSync();
    toggle('Graph');
    expect(app.mode).toBe('split');
    expect(modes(target)).not.toContain('Graph');
    expect(target.querySelector('.relpanel .icon-btn[aria-label="Show on graph"]')).toBeNull();
    // Kept for this world only.
    const key = `exomyth:memory:${app.vault!.storage.label}:features`;
    expect(JSON.parse(localStorage.getItem(key)!)).toEqual({ graph: false });
  });

  it('hides the relations panel, years, word count, quick notes and focus mode', async () => {
    const target = await boot();
    app.setByYear(true);
    app.setYear(390);
    expect(app.outOfTime?.size).toBeGreaterThan(0);
    app.settingsOpen = true;
    flushSync();
    toggle('Years');
    expect(app.outOfTime).toBeNull();
    expect(target.querySelector('.years-edit')).toBeNull();
    toggle('Relations panel');
    expect(target.querySelector('.relpanel')).toBeNull();
    expect(target.querySelector('.workspace')!.classList.contains('no-panel')).toBe(true);
    toggle('Word count');
    expect(target.querySelector('.topbar .words')).toBeNull();
    toggle('Quick notes');
    expect(target.querySelector('.side-head button[aria-label="Quick note"]')).toBeNull();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'i', code: 'KeyI', altKey: true, bubbles: true }));
    expect(app.dialog).toBeNull();
    toggle('Focus mode');
    expect(target.querySelector('.topbar button[aria-label="Focus mode"]')).toBeNull();
    // Everything back with one button.
    document.querySelector<HTMLButtonElement>('.settings-foot button')!.click();
    flushSync();
    expect(target.querySelector('.relpanel')).toBeTruthy();
    expect(target.querySelector('.topbar .words')).toBeTruthy();
  });

  it('family trees need cards; previews can be switched off; theme and language are here too', async () => {
    const target = await boot();
    app.settingsOpen = true;
    flushSync();
    toggle('Cards');
    const family = [...document.querySelectorAll<HTMLLabelElement>('.settings .setting')].find((l) => l.textContent!.includes('Family trees'))!;
    expect(family.querySelector('input')!.disabled).toBe(true);
    expect(family.textContent).toContain('Needs Cards to be on');
    toggle('Previews on hover');
    app.hoverStart('Kira Vale', undefined, () => ({ left: 0, top: 0, right: 1, bottom: 1 }));
    await wait(500);
    expect(app.hover).toBeNull();
    [...document.querySelectorAll<HTMLButtonElement>('.settings .seg button')].find((b) => b.textContent === 'Dark')!.click();
    flushSync();
    expect(app.theme).toBe('dark');
    [...document.querySelectorAll<HTMLButtonElement>('.settings .seg button')].find((b) => b.textContent === 'Русский')!.click();
    flushSync();
    expect(document.querySelector('#settings-title')!.textContent).toBe('Настройки');
    app.setLang('en');
    app.setTheme('auto');
    void target;
  });
});

import { featureUsage } from '../src/core/usage';
import { countPages } from '../src/i18n';

describe('what switching off affects', () => {
  it('finds the pages each part shows something on', async () => {
    const vault = await Vault.open(new MemoryStorage('usage', DEMO_FILES));
    const u = featureUsage(vault.index);
    expect(u.maps.map((p) => p.title)).toEqual(['Silver Coast']);
    expect(u.family.map((p) => p.title)).toEqual(['Arn Vale', 'Eva Crow', 'Kira Vale', 'Liara Vale', 'Oren Vale', 'Ysolde Vale']);
    expect(u.timeline.length).toBe(18);
    expect(u.years.length).toBe(19); // the map's pins have years too
    expect(u.years.map((p) => p.title)).toContain('Silver Coast');
  });

  it('says it in both languages', () => {
    expect(countPages('en', 1)).toBe('1 page');
    expect(countPages('en', 3)).toBe('3 pages');
    expect(countPages('ru', 1)).toBe('1 странице');
    expect(countPages('ru', 21)).toBe('21 странице');
    expect(countPages('ru', 11)).toBe('11 страницах');
    expect(countPages('ru', 5)).toBe('5 страницах');
  });

  it('shows the count under each switch, with a list of pages to open', async () => {
    await boot();
    app.settingsOpen = true;
    flushSync();
    const usage = (label: string) =>
      [...document.querySelectorAll<HTMLLabelElement>('.settings .setting')]
        .find((l) => l.querySelector('.setting-name')!.textContent === label)!
        .nextElementSibling as HTMLDetailsElement | null;
    expect(usage('Interactive maps')!.querySelector('summary')!.textContent).toContain('Used on 1 page');
    expect(usage('Family trees')!.textContent).toContain('6 pages');
    expect(usage('Word count')?.classList.contains('setting-usage')).toBeFalsy();
    toggle('Interactive maps');
    expect(usage('Interactive maps')!.classList.contains('warn')).toBe(true);
    expect(usage('Interactive maps')!.querySelector('summary')!.textContent).toContain('Off, while 1 page');
    usage('Interactive maps')!.querySelector<HTMLButtonElement>('li button')!.click();
    await wait();
    flushSync();
    expect(app.settingsOpen).toBe(false);
    expect(app.current).toBe('Maps/Silver Coast.md');
  });
});
