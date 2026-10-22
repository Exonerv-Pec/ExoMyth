import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Workspace from '../src/components/Workspace.svelte';
import Dialog from '../src/components/Dialog.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { DEMO_FILES } from '../src/demo';

// jsdom has no layout engine; CodeMirror only needs these to exist.
beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Element.prototype.scrollIntoView = () => {};
});

let mounted: ReturnType<typeof mount>[] = [];
afterEach(() => {
  mounted.forEach((m) => unmount(m));
  mounted = [];
  document.body.innerHTML = '';
  app.closeVault();
  app.dialog = null;
});

const tick = () => new Promise((r) => setTimeout(r, 30));

async function boot(files: Record<string, string> = DEMO_FILES, current = 'Characters/Kira Vale.md') {
  app.lang = 'en';
  const vault = await Vault.open(new MemoryStorage('test', files));
  app.setVault(vault);
  app.current = current;
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(Workspace, { target }));
  mounted.push(mount(Dialog, { target: document.body }));
  flushSync();
  await tick();
  return { vault, target };
}

const texts = (nodes: NodeListOf<Element> | Element[]) => [...nodes].map((n) => n.textContent?.replace(/\s+/g, ' ').trim() ?? '');

describe('relations panel (rendered)', () => {
  it('shows groups in the configured order with sorted items', async () => {
    const { target } = await boot();
    const sections = target.querySelectorAll('.relpanel .rel-section');
    expect(sections.length).toBeGreaterThan(0);
    const groups = texts(target.querySelectorAll('.relpanel .rel-section:first-of-type .group-title'));
    // Settings order: father, mother, spouse, ally, enemy, mentor, rules, led by, born in
    const names = groups.map((g) => g.replace(/[▸\d]/g, '').trim());
    expect(names).toEqual(['father', 'mother', 'ally', 'enemy', 'mentor', 'born in']);
    const allies = target.querySelectorAll('.relpanel .rel-group')[2]!;
    expect(texts(allies.querySelectorAll('.rel-link'))).toEqual(['Bo Tarn', 'Order of the Silver River']);
  });

  it('renders the same panel after navigating away and back', async () => {
    const { target } = await boot();
    const before = target.querySelector('.relpanel .panel-scroll')!.innerHTML;
    await app.open('Characters/Arn Vale.md');
    flushSync();
    await tick();
    expect(target.querySelector('.relpanel .panel-scroll')!.innerHTML).not.toBe(before);
    await app.open('Characters/Kira Vale.md');
    flushSync();
    await tick();
    expect(target.querySelector('.relpanel .panel-scroll')!.innerHTML).toBe(before);
  });

  it('adds a relation from the form, creating the missing page, and writes it to the file', async () => {
    const { target, vault } = await boot();
    const inputs = target.querySelectorAll<HTMLInputElement>('.add-rel input[type="text"]');
    inputs[0]!.value = 'companion';
    inputs[0]!.dispatchEvent(new Event('input', { bubbles: true }));
    inputs[1]!.value = 'Xai the Griffin';
    inputs[1]!.dispatchEvent(new Event('input', { bubbles: true }));
    target.querySelector<HTMLFormElement>('.add-rel')!.requestSubmit();
    await tick();
    await tick();
    // New pages are created next to the current page.
    expect(vault.index.resolve('Xai the Griffin')?.path).toBe('Characters/Xai the Griffin.md');
    const raw = await vault.readRaw('Characters/Kira Vale.md');
    expect(raw).toContain('companion');
    expect(raw).toContain('[[Xai the Griffin]]');
    flushSync();
    expect(target.querySelector('.relpanel')!.textContent).toContain('companion');
  });

  it('removes a relation and pins an item', async () => {
    const { target, vault } = await boot();
    const removeButtons = target.querySelectorAll<HTMLButtonElement>('.relpanel .rel-item .icon-btn[aria-label="Remove relation"]');
    expect(removeButtons.length).toBeGreaterThan(0);
    // First removable item is the father (Arn Vale).
    removeButtons[0]!.click();
    await tick();
    expect(vault.getPage('Characters/Kira Vale.md')!.relations.some((r) => r.type === 'father')).toBe(false);

    const pin = target.querySelector<HTMLButtonElement>('.relpanel .rel-group:nth-of-type(1) .icon-btn[aria-pressed]')!;
    pin.click();
    await tick();
    expect(vault.getPage('Characters/Kira Vale.md')!.pinned.length).toBe(1);
  });

  it('remembers collapsed groups per world, not per page', async () => {
    const { target } = await boot();
    const firstTitle = target.querySelector<HTMLButtonElement>('.relpanel .rel-group .group-title')!;
    firstTitle.click();
    flushSync();
    await app.open('Characters/Bo Tarn.md');
    flushSync();
    await tick();
    expect(app.collapsed[Object.keys(app.collapsed).find((k) => k.startsWith('relations:'))!]).toBe(true);
  });
});

describe('workspace', () => {
  it('lists pages in the sidebar and opens one on click', async () => {
    const { target } = await boot();
    const labels = texts(target.querySelectorAll('.sidebar .tree .label'));
    expect(labels).toContain('Rivertown');
    const item = [...target.querySelectorAll<HTMLButtonElement>('.sidebar .tree-item')].find((b) =>
      b.textContent?.includes('Rivertown'),
    )!;
    item.click();
    await tick();
    expect(app.current).toBe('Places/Rivertown.md');
  });

  it('renames through the dialog and rewrites links', async () => {
    const { target, vault } = await boot();
    app.askRename('Places/Rivertown.md');
    flushSync();
    await tick();
    const input = document.querySelector<HTMLInputElement>('.dialog input')!;
    input.value = 'Rivertown-on-Silver';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    document.querySelector<HTMLFormElement>('.dialog form')!.requestSubmit();
    await tick();
    await tick();
    expect(vault.getPage('Places/Rivertown-on-Silver.md')).toBeTruthy();
    expect(await vault.readRaw('Characters/Kira Vale.md')).toContain('"[[Rivertown-on-Silver]]"');
    expect(vault.index.brokenLinks()).toEqual([]);
    void target;
  });

  it('renders markdown with wiki links and hides spoilers until clicked', async () => {
    const { target } = await boot();
    app.setMode('preview');
    flushSync();
    await tick();
    const link = target.querySelector<HTMLAnchorElement>('.prose a.wikilink')!;
    expect(link.dataset.path).toBeTruthy();
    const spoiler = target.querySelector<HTMLElement>('.prose .spoiler')!;
    expect(spoiler.classList.contains('revealed')).toBe(false);
    spoiler.click();
    expect(spoiler.classList.contains('revealed')).toBe(true);
    // Infobox shows plain facts but not structural keys.
    const dts = texts(target.querySelectorAll('.infobox dt'));
    expect(dts).toContain('born');
    expect(dts).not.toContain('relations');
  });

  it('survives a page with broken frontmatter', async () => {
    const { target } = await boot({ 'Bad.md': '---\ntitle: [oops\n---\nText' }, 'Bad.md');
    app.setMode('preview');
    flushSync();
    await tick();
    expect(target.querySelector('.notice')).toBeTruthy();
  });
});
