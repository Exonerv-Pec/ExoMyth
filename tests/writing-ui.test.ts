import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { unzipSync, zipSync } from 'fflate';
import Workspace from '../src/components/Workspace.svelte';
import Welcome from '../src/components/Welcome.svelte';
import Dialog from '../src/components/Dialog.svelte';
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
  URL.revokeObjectURL = () => {};
});

let mounted: ReturnType<typeof mount>[] = [];
afterEach(() => {
  mounted.forEach((m) => unmount(m));
  mounted = [];
  document.body.innerHTML = '';
  app.closeVault();
  app.dialog = null;
  app.setMode('split');
  vi.restoreAllMocks();
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

async function boot(files: Record<string, string> = DEMO_FILES) {
  app.lang = 'en';
  app.setMode('preview');
  const vault = await Vault.open(new MemoryStorage(`w-${Math.random()}`, files));
  app.setVault(vault);
  app.current = 'Characters/Kira Vale.md';
  const target = document.createElement('div');
  document.body.append(target);
  mounted.push(mount(Workspace, { target }), mount(Dialog, { target: document.body }));
  flushSync();
  await wait();
  flushSync();
  return { target, vault };
}

describe('word count', () => {
  it('shows the words of the page, and of the whole world on hover', async () => {
    const { target } = await boot({ 'A.md': '# Alpha\n\nOne two three.', 'B.md': 'Four five' });
    app.current = 'A.md';
    flushSync();
    const words = target.querySelector<HTMLElement>('.words')!;
    expect(words.textContent).toBe('4 words');
    expect(words.title).toBe('In the whole world: 6 words');
  });
});

describe('reading view', () => {
  it('does not repeat the page title when the text starts with it', async () => {
    const { target } = await boot({ 'Kira.md': '# Kira\n\nText.', 'Welcome.md': '# Welcome to the world\n\nHi.' });
    app.current = 'Kira.md';
    flushSync();
    const headings = () => [...target.querySelectorAll('.reading h1, .reading h2')].map((h) => h.textContent?.trim());
    expect(headings()).toEqual(['Kira']);
    app.current = 'Welcome.md';
    flushSync();
    expect(headings()).toEqual(['Welcome', 'Welcome to the world']);
  });
});

describe('quick ideas', () => {
  it('catches ideas on an Inbox page, creating it the first time', async () => {
    const { vault } = await boot();
    app.askIdea();
    flushSync();
    await wait();
    const area = document.querySelector<HTMLTextAreaElement>('.dialog textarea')!;
    expect(document.activeElement).toBe(area);
    area.value = 'A dragon that hoards maps';
    area.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    // Ctrl+Enter saves, a plain Enter would only start a new line.
    area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', ctrlKey: true, bubbles: true }));
    await wait(80);
    const inbox = vault.getPage('Inbox.md')!;
    expect(inbox.body).toMatch(/^# Inbox\n\nQuick notes:.*\n\n- \*\*\d{4}-\d\d-\d\d \d\d:\d\d\*\* — A dragon that hoards maps\n$/s);
    expect(app.dialog).toBeNull();

    await app.addIdea('Eva knew all along');
    const again = vault.getPage('Inbox.md')!;
    expect(again.body.match(/^- \*\*/gm)!.length).toBe(2);
    expect(vault.pages.filter((p) => p.name === 'Inbox').length).toBe(1);
  });
});

describe('the world as a .zip', () => {
  it('downloads every file of the world', async () => {
    let blob: Blob | undefined;
    URL.createObjectURL = (b: Blob) => ((blob = b), 'blob:zip');
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      expect(this.download).toMatch(/^w-.*\.zip$/);
      expect(this.href).toBe('blob:zip');
    });
    const { target } = await boot();
    await app.downloadWorld();
    expect(click).toHaveBeenCalledOnce();
    expect(blob!.type).toBe('application/zip');
    const bytes = await new Promise<Uint8Array>((resolve) => {
      const r = new FileReader();
      r.onload = () => resolve(new Uint8Array(r.result as ArrayBuffer));
      r.readAsArrayBuffer(blob!);
    });
    const names = Object.keys(unzipSync(new Uint8Array([...bytes])));
    expect(names.length).toBe(Object.keys(DEMO_FILES).length);
    expect(names.every((n) => n.startsWith(`${app.vault!.storage.label}/`))).toBe(true);
    expect(app.toast?.text).toContain('.zip');
  });

  it('opens a .zip as a new world', async () => {
    app.lang = 'en';
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(Welcome, { target }));
    flushSync();
    const enc = (s: string) => new Uint8Array([...new TextEncoder().encode(s)]);
    const data = zipSync({ 'Silver/Welcome.md': enc('# Hello\n\nSee [[Kira]].'), 'Silver/Kira.md': enc('# Kira'), 'Silver/../../x.md': enc('!') });
    const file = new File([new Uint8Array([...data])], 'Silver Coast.zip', { type: 'application/zip' });
    const input = target.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [file], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    for (let i = 0; i < 20 && !app.vault; i++) await wait(20);
    expect(app.vault?.storage.label).toBe('Silver Coast');
    expect(app.vault!.pages.map((p) => p.path).sort()).toEqual(['Kira.md', 'Welcome.md']);
    expect(app.toast?.text).toContain('Unsafe paths skipped in the archive: 1');
  });

  it('explains when a .zip has no pages', async () => {
    app.lang = 'en';
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(Welcome, { target }));
    flushSync();
    const data = zipSync({ 'photo.png': new Uint8Array([1, 2, 3]) });
    const input = target.querySelector<HTMLInputElement>('input[type="file"]')!;
    Object.defineProperty(input, 'files', { value: [new File([new Uint8Array([...data])], 'x.zip')], configurable: true });
    input.dispatchEvent(new Event('change', { bubbles: true }));
    await wait(80);
    flushSync();
    expect(app.vault).toBeNull();
    expect(target.querySelector('.error')!.textContent).toContain('no pages');
  });
});
