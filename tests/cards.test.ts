import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { parsePage } from '../src/core/parse';
import { VaultIndex } from '../src/core/index';
import { dossier, folderCards, folderTabs, initialsOf, pageImage } from '../src/core/cards';
import { folderColorSlots } from '../src/core/layout';
import { MemoryStorage } from '../src/core/storage';
import { Vault } from '../src/core/vault';
import { DEMO_FILES } from '../src/demo';
import { app } from '../src/app.svelte';
import Workspace from '../src/components/Workspace.svelte';
import Dialog from '../src/components/Dialog.svelte';

const page = (path: string, text: string) => parsePage(path, text, 1);
const demoIndex = () =>
  new VaultIndex(
    Object.entries(DEMO_FILES)
      .filter(([p]) => p.endsWith('.md'))
      .map(([p, t]) => page(p, t)),
    JSON.parse(DEMO_FILES['.exomyth/settings.json']!),
  );

describe('card models', () => {
  it('finds a page picture in the image field or the first embedded image', () => {
    expect(pageImage(page('A.md', '---\nimage: crest.png\n---\n'))).toBe('crest.png');
    expect(pageImage(page('A.md', '---\nimage: "[[crest.png|200]]"\n---\n'))).toBe('crest.png');
    expect(pageImage(page('A.md', 'Text ![[song.mp3]] then ![[face.webp|120]]'))).toBe('face.webp');
    expect(pageImage(page('A.md', '![x](https://example.com/a.png) ![y](maps/b.png)'))).toBe('maps/b.png');
    expect(pageImage(page('A.md', 'no pictures'))).toBeUndefined();
  });

  it('makes initials for pages without a picture', () => {
    expect(initialsOf('Kira Vale')).toBe('KV');
    expect(initialsOf('Order of the Silver River')).toBe('OR');
    expect(initialsOf('Ривертаун')).toBe('Р');
    expect(initialsOf('  ')).toBe('');
  });

  it('lists folders as tabs, root last', () => {
    const tabs = folderTabs(demoIndex());
    expect(tabs).toEqual([
      { folder: 'Characters', count: 10 },
      { folder: 'Events', count: 2 },
      { folder: 'Manuscript', count: 1 },
      { folder: 'Maps', count: 1 },
      { folder: 'Music', count: 1 },
      { folder: 'Organizations', count: 1 },
      { folder: 'Places', count: 1 },
      { folder: 'Scenes', count: 4 },
      { folder: '', count: 1 },
    ]);
    expect(folderCards(demoIndex(), 'Characters').map((c) => c.title)).toEqual([
      'Arn Vale',
      'Bo Tarn',
      'Brother Tomas',
      'Dax Morn',
      'Eva Crow',
      'Kira Vale',
      'Liara Vale',
      'Mara Holt',
      'Oren Vale',
      'Ysolde Vale',
    ]);
  });

  it('builds the dossier of an organization: leader, members and allies as cards, in panel order', () => {
    const d = dossier(demoIndex(), 'Organizations/Order of the Silver River.md')!;
    expect(d.page.image).toBe('order emblem.svg');
    expect(d.page.allFacts.map((f) => f.key)).toEqual(['founded', 'seat']);
    const groups = d.groups.map((g) => [g.section, g.inverseLabel ?? g.type, g.items.map((i) => i.title)]);
    expect(groups.slice(0, 3)).toEqual([
      ['relations', 'ally', ['Dax Morn', 'Kira Vale']],
      ['relations', 'led by', ['Arn Vale']],
      ['inverse', 'members', ['Brother Tomas', 'Mara Holt']],
    ]);
    const mara = d.groups[2]!.items[1]!;
    expect(mara).toMatchObject({ folder: 'Characters', group: 'Characters', initials: 'MH' });
    expect(mara.facts.map((f) => f.key)).toEqual(['rank', 'born']);
  });

  it('keeps folder colours identical to the graph', () => {
    expect(folderColorSlots(['Places', 'Characters', '', 'Places'])).toEqual({ Characters: 0, Places: 1 });
    expect(folderColorSlots(['Places', 'Items'], { Places: 5 })).toEqual({ Items: 0, Places: 5 });
  });
});

describe('cards view', () => {
  beforeAll(() => {
    (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
    URL.createObjectURL ??= () => 'blob:test';
  });

  let mounted: ReturnType<typeof mount>[] = [];
  afterEach(() => {
    mounted.forEach((m) => unmount(m));
    mounted = [];
    document.body.innerHTML = '';
    app.closeVault();
    app.setMode('split');
  });

  const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

  async function boot(current: string) {
    app.lang = 'en';
    app.setVault(await Vault.open(new MemoryStorage('cards-test', DEMO_FILES)));
    app.current = current;
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(Workspace, { target }), mount(Dialog, { target: document.body }));
    flushSync();
    [...target.querySelectorAll<HTMLButtonElement>('.topbar .seg button')].find((b) => b.textContent?.trim() === 'Cards')!.click();
    flushSync();
    await wait();
    return target;
  }

  it('shows the dossier of the current page with its related pages as cards', async () => {
    const target = await boot('Organizations/Order of the Silver River.md');
    expect(target.querySelector('.hero-title')!.textContent).toBe('Order of the Silver River');
    const groups = [...target.querySelectorAll('.cards-group')].map((h) => h.firstChild!.textContent!.trim());
    expect(groups.slice(0, 3)).toEqual(['ally', 'led by', 'members']);
    const members = target.querySelectorAll('.cards-section')[2]!;
    expect([...members.querySelectorAll('.pc-title')].map((e) => e.textContent!.trim())).toEqual(['Brother Tomas', 'Mara Holt']);
  });

  it('walks to another dossier on click and opens the text on double click', async () => {
    const target = await boot('Organizations/Order of the Silver River.md');
    const mara = [...target.querySelectorAll<HTMLButtonElement>('.page-card')].find((c) => c.textContent?.includes('Mara Holt'))!;
    mara.click();
    await wait();
    flushSync();
    expect(app.current).toBe('Characters/Mara Holt.md');
    expect(app.mode).toBe('cards');
    expect(target.querySelector('.hero-title')!.textContent).toBe('Mara Holt');
    const order = [...target.querySelectorAll<HTMLButtonElement>('.page-card')].find((c) => c.textContent?.includes('Order of the Silver River'))!;
    order.dispatchEvent(new MouseEvent('dblclick', { bubbles: true }));
    await wait();
    expect(app.mode).toBe('split');
    expect(app.current).toBe('Organizations/Order of the Silver River.md');
  });

  it('shows every page of a folder in its tab', async () => {
    const target = await boot('Welcome.md');
    [...target.querySelectorAll<HTMLButtonElement>('.cards-tabs button')].find((b) => b.textContent?.includes('Characters'))!.click();
    flushSync();
    expect(target.querySelectorAll('.card-grid .page-card').length).toBe(10);
    expect(target.querySelector('.hero-title')).toBeNull();
  });
});

describe('pictures on cards', () => {
  it('shows the Order emblem in its dossier instead of initials', async () => {
    URL.createObjectURL = () => 'blob:emblem';
    app.lang = 'en';
    app.setVault(await Vault.open(new MemoryStorage('cards-img', DEMO_FILES)));
    app.current = 'Organizations/Order of the Silver River.md';
    app.setMode('cards');
    const target = document.createElement('div');
    document.body.append(target);
    const m = mount(Workspace, { target });
    flushSync();
    await new Promise((r) => setTimeout(r, 60));
    flushSync();
    expect(target.querySelector('.hero-media img')?.getAttribute('src')).toBe('blob:emblem');
    expect(target.querySelector('.hero-initials')).toBeNull();
    unmount(m);
    target.remove();
    app.closeVault();
    app.setMode('split');
  });
});
