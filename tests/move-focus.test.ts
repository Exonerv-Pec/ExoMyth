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

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

describe('moving a page to another folder', () => {
  const files = {
    'Characters/Arn.md': '# Arn\n',
    'Places/Rivertown.md': '---\nrelations:\n  ruled by: "[[Arn]]"\n  founded by: Characters/Arn\n---\nSee [[Characters/Arn|the king]] and ![[Characters/Arn]].\n',
    'Kira.md': '---\nrelations:\n  father: "[[Arn]]"\n---\n[[Arn#Youth]]\n',
  };

  it('keeps the name, updates links that spell out the folder, and leaves name links alone', async () => {
    const vault = await Vault.open(new MemoryStorage('m', files));
    const before = vault.getPage('Kira.md')!.raw;
    const newPath = await vault.movePage('Characters/Arn.md', 'People/Royals');
    expect(newPath).toBe('People/Royals/Arn.md');
    expect(vault.getPage('Characters/Arn.md')).toBeUndefined();
    expect(vault.getPage(newPath)!.raw).toBe('# Arn\n');
    const town = vault.getPage('Places/Rivertown.md')!.raw;
    expect(town).toContain('See [[People/Royals/Arn|the king]] and ![[People/Royals/Arn]].');
    expect(town).toContain('ruled by: "[[Arn]]"');
    expect(town).toContain('founded by: People/Royals/Arn');
    expect(vault.getPage('Kira.md')!.raw).toBe(before);
    expect(vault.index.brokenLinks()).toEqual([]);
    expect(vault.folders()).toEqual(['People', 'People/Royals', 'Places']);
  });

  it('moves to the top of the world and refuses to overwrite a page', async () => {
    const vault = await Vault.open(new MemoryStorage('m2', { ...files, 'Places/Arn.md': '# Other Arn\n' }));
    expect(await vault.movePage('Characters/Arn.md', '')).toBe('Arn.md');
    await expect(vault.movePage('Arn.md', 'Places')).rejects.toThrow(/already exists/);
    // Folder names are cleaned like page names: no hidden folders, no empty parts.
    expect(await vault.movePage('Arn.md', '.trash')).toBe('trash/Arn.md');
    expect(await vault.movePage('trash/Arn.md', ' / ')).toBe('Arn.md');
  });
});

describe('focus mode, spell check and moving from the sidebar', () => {
  let mounted: ReturnType<typeof mount>[] = [];
  afterEach(() => {
    mounted.forEach((m) => unmount(m));
    mounted = [];
    document.body.innerHTML = '';
    app.closeVault();
    app.setMode('split');
  });

  async function boot() {
    app.lang = 'en';
    app.setMode('split');
    const vault = await Vault.open(new MemoryStorage(`f-${Math.random()}`, DEMO_FILES));
    app.setVault(vault);
    app.current = 'Characters/Kira Vale.md';
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(App, { target }));
    flushSync();
    await wait();
    flushSync();
    return { target, vault };
  }

  it('shows only the text in focus mode and comes back to the same view', async () => {
    const { target } = await boot();
    window.dispatchEvent(new KeyboardEvent('keydown', { key: '.', code: 'Period', ctrlKey: true, bubbles: true }));
    flushSync();
    expect(app.focus).toBe(true);
    expect(app.mode).toBe('edit');
    expect(target.querySelector('.workspace')!.classList.contains('focus')).toBe(true);
    expect(target.querySelector('.focus-words')!.textContent).toMatch(/words/);
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    flushSync();
    expect(app.focus).toBe(false);
    expect(app.mode).toBe('split');
    // The button in the top bar does the same.
    target.querySelector<HTMLButtonElement>('.topbar button[aria-label="Focus mode"]')!.click();
    flushSync();
    expect(app.focus).toBe(true);
    target.querySelector<HTMLButtonElement>('.focus-exit')!.click();
    flushSync();
    expect(app.focus).toBe(false);
  });

  it('turns the spell checker off and on, and remembers it', async () => {
    const { target } = await boot();
    const content = () => target.querySelector('.cm-content')!;
    const was = app.spellcheck;
    if (!was) app.toggleSpellcheck();
    flushSync();
    expect(content().getAttribute('spellcheck')).toBe('true');
    target.querySelector<HTMLButtonElement>('.topbar button[aria-label="Spell check"]')!.click();
    flushSync();
    expect(content().getAttribute('spellcheck')).toBe('false');
    expect(localStorage.getItem('exomyth:spellcheck')).toBe('0');
    app.toggleSpellcheck();
    flushSync();
    expect(content().getAttribute('spellcheck')).toBe('true');
  });

  it('moves a page with the folder dialog', async () => {
    const { target, vault } = await boot();
    const row = [...target.querySelectorAll('.sidebar .tree-row')].find((r) => r.textContent?.trim() === 'Kira Vale')!;
    row.querySelector<HTMLButtonElement>('button[aria-label="Move to another folder"]')!.click();
    flushSync();
    const input = document.querySelector<HTMLInputElement>('.dialog input')!;
    expect(input.value).toBe('Characters');
    expect([...document.querySelectorAll('#dialog-suggestions option')].map((o) => o.getAttribute('value'))).toContain('Places');
    input.value = 'Characters/Heroes';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    document.querySelector<HTMLFormElement>('.dialog form')!.requestSubmit();
    await wait(80);
    flushSync();
    expect(vault.getPage('Characters/Heroes/Kira Vale.md')).toBeTruthy();
    expect(app.current).toBe('Characters/Heroes/Kira Vale.md');
    expect(vault.index.brokenLinks()).toEqual([]);
  });
});
