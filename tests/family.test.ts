import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { parsePage } from '../src/core/parse';
import { VaultIndex } from '../src/core/index';
import { familyTree, hasFamily, kinOf, kinship } from '../src/core/family';
import { DEMO_FILES } from '../src/demo';

const demo = () =>
  new VaultIndex(
    Object.entries(DEMO_FILES)
      .filter(([p]) => p.endsWith('.md') && !p.startsWith('.exomyth/'))
      .map(([p, t]) => parsePage(p, t, 1)),
    { relationTypes: JSON.parse(DEMO_FILES['.exomyth/settings.json']!).relationTypes },
  );

const names = (index: VaultIndex, units: string[][]) => units.map((u) => u.map((p) => index.get(p)!.title));

describe('family relations', () => {
  it('recognises family words in English and Russian, and settings can override them', () => {
    expect(kinOf('father')).toBe('parent');
    expect(kinOf('Mother')).toBe('parent');
    expect(kinOf('дочь')).toBe('child');
    expect(kinOf('жена')).toBe('spouse');
    expect(kinOf('сестра')).toBe('sibling');
    expect(kinOf('ally')).toBeUndefined();
    const settings = { relationTypes: [{ id: 'sire', family: 'parent' as const }, { id: 'father', family: 'none' as const }] };
    expect(kinOf('sire', settings)).toBe('parent');
    expect(kinOf('father', settings)).toBeUndefined(); // e.g. "father" as a priest's title
  });

  it('reads who is whose parent, child, spouse and sibling from both sides', () => {
    const index = new VaultIndex([
      parsePage('A.md', '---\nrelations:\n  son: "[[B]]"\n  wife: "[[C]]"\n---\n', 1),
      parsePage('B.md', '---\nrelations:\n  sister: "[[D]]"\n---\n', 1),
      parsePage('C.md', '', 1),
      parsePage('D.md', '---\nrelations:\n  mother: "[[C]]"\n---\n', 1),
      parsePage('E.md', '---\nrelations:\n  ally: "[[A]]"\n---\n', 1),
    ]);
    const k = kinship(index);
    expect([...k.parents.get('B.md')!]).toEqual(['A.md']);
    expect([...k.children.get('C.md')!]).toEqual(['D.md']);
    expect([...k.spouses.get('C.md')!]).toEqual(['A.md']);
    expect([...k.siblings.get('D.md')!]).toEqual(['B.md']);
    expect(hasFamily(k, 'E.md')).toBe(false);
  });
});

describe('the family tree of a person', () => {
  it('draws the Vales around Kira: grandparents, parents, her half-sister', () => {
    const index = demo();
    const tree = familyTree(index, 'Characters/Kira Vale.md')!;
    expect(tree.rows.map((r) => r.gen)).toEqual([-2, -1, 0]);
    expect(names(index, tree.rows[0]!.units)).toEqual([['Oren Vale', 'Ysolde Vale']]);
    expect(names(index, tree.rows[1]!.units)).toEqual([['Arn Vale', 'Liara Vale']]);
    // Siblings by birth: Eva (401) before Kira (412).
    expect(names(index, tree.rows[2]!.units)).toEqual([['Eva Crow'], ['Kira Vale']]);
    const link = (p: string) => tree.links.find((l) => l.child === p)?.parents.map((x) => index.get(x)!.title);
    expect(link('Characters/Kira Vale.md')).toEqual(['Arn Vale', 'Liara Vale']);
    expect(link('Characters/Eva Crow.md')).toEqual(['Arn Vale']); // a half-sister: only her father is known
    expect(link('Characters/Arn Vale.md')).toEqual(['Oren Vale', 'Ysolde Vale']);
    expect(tree.couples.map(([a, b]) => [index.get(a)!.title, index.get(b)!.title])).toEqual([
      ['Oren Vale', 'Ysolde Vale'],
      ['Arn Vale', 'Liara Vale'],
    ]);
  });

  it('shows a person with spouse, children and grandchildren, and stays the same every time', () => {
    const index = demo();
    const tree = familyTree(index, 'Characters/Oren Vale.md')!;
    expect(tree.rows.map((r) => r.gen)).toEqual([0, 1, 2]);
    expect(names(index, tree.rows[0]!.units)).toEqual([['Oren Vale', 'Ysolde Vale']]);
    expect(names(index, tree.rows[1]!.units)).toEqual([['Arn Vale', 'Liara Vale']]);
    expect(names(index, tree.rows[2]!.units)).toEqual([['Eva Crow'], ['Kira Vale']]);
    expect(familyTree(index, 'Characters/Oren Vale.md')).toEqual(tree);
  });

  it('has no tree for pages without family, and survives loops in the data', () => {
    const index = demo();
    expect(familyTree(index, 'Places/Rivertown.md')).toBeUndefined();
    const loop = new VaultIndex([
      parsePage('A.md', '---\nrelations:\n  father: "[[B]]"\n---\n', 1),
      parsePage('B.md', '---\nrelations:\n  father: "[[A]]"\n---\n', 1),
    ]);
    const tree = familyTree(loop, 'A.md')!;
    expect(tree.rows.flatMap((r) => r.units.flat()).sort()).toEqual(['A.md', 'B.md']);
  });
});


describe('the family tree view', () => {
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
    app.cardsTab = 'dossier';
    app.setMode('split');
  });
  const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

  async function boot(current: string) {
    app.lang = 'en';
    app.setMode('preview');
    app.setVault(await Vault.open(new MemoryStorage(`fam-${Math.random()}`, DEMO_FILES)));
    app.current = current;
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(App, { target }));
    flushSync();
    await wait();
    flushSync();
    return target;
  }
  const rows = (t: HTMLElement) =>
    [...t.querySelectorAll('.family-row')].map((r) => [r.querySelector('.family-gen')!.textContent, [...r.querySelectorAll('.fc-name')].map((n) => n.textContent)]);

  it('opens from the relations panel and walks the family by clicking', async () => {
    const target = await boot('Characters/Kira Vale.md');
    target.querySelector<HTMLButtonElement>('.relpanel .icon-btn[aria-label="Family tree"]')!.click();
    await wait();
    flushSync();
    expect(app.mode).toBe('cards');
    expect(target.querySelector('.cards-tabs [aria-selected="true"]')!.textContent).toContain('Family tree');
    expect(rows(target)).toEqual([
      ['Grandparents', ['Oren Vale', 'Ysolde Vale']],
      ['Parents', ['Arn Vale', 'Liara Vale']],
      ['Siblings', ['Eva Crow', 'Kira Vale']],
    ]);
    expect(target.querySelector('.family-card.focus .fc-name')!.textContent).toBe('Kira Vale');
    expect(target.querySelector('.family-card.focus .fc-years')!.textContent).toBe('412 AR –');
    const arn = [...target.querySelectorAll<HTMLButtonElement>('.family-card')].find((c) => c.textContent?.includes('Arn Vale'))!;
    arn.click();
    await wait();
    flushSync();
    expect(app.current).toBe('Characters/Arn Vale.md');
    expect(rows(target)[1]).toEqual(['Siblings', ['Arn Vale', 'Liara Vale']]);
    expect(rows(target)[2]).toEqual(['Children', ['Eva Crow', 'Kira Vale']]);
  });

  it('explains how to make a tree for a page without family, and offers families', async () => {
    const target = await boot('Places/Rivertown.md');
    app.cardsTab = 'family';
    app.setMode('cards');
    flushSync();
    await wait();
    flushSync();
    expect(target.querySelector('.family-empty')!.textContent).toContain('has no family relations yet');
    expect(target.querySelector('.relpanel .icon-btn[aria-label="Family tree"]')).toBeNull();
    const chip = [...target.querySelectorAll<HTMLButtonElement>('.family-empty .chip')].find((c) => c.textContent === 'Kira Vale')!;
    chip.click();
    await wait();
    flushSync();
    expect(target.querySelectorAll('.family-card').length).toBe(6);
  });
});
