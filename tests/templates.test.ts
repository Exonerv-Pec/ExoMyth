import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { parsePage } from '../src/core/parse';
import { VaultIndex } from '../src/core/index';
import { buildGraph } from '../src/core/graph';
import { folderTabs } from '../src/core/cards';
import { pageYears } from '../src/core/years';
import {
  applyTemplate,
  builtInTemplateFiles,
  builtInTemplates,
  isTemplatePath,
  templateFolder,
  worldTemplates,
} from '../src/core/templates';
import { DEMO_FILES } from '../src/demo';

const when = new Date(2026, 9, 23, 12, 0);

describe('templates', () => {
  it('knows which pages are templates', () => {
    expect(isTemplatePath('Templates/Character.md')).toBe(true);
    expect(isTemplatePath('templates/Sub/Scene.md')).toBe(true);
    expect(isTemplatePath('Шаблоны/Персонаж.md')).toBe(true);
    expect(isTemplatePath('Characters/Templates.md')).toBe(false);
    expect(isTemplatePath('Templates.md')).toBe(false);
  });

  it('fills in the title and date and drops the template block, keeping the rest exactly', () => {
    const text = '---\ntemplate:\n  folder: Characters   # where they go\n\ntags: [character]\nborn:            # year\nrelations:\n  father:\n---\n# {{title}}\n\nMade {{ date }}.\n';
    expect(templateFolder(text)).toBe('Characters');
    expect(applyTemplate(text, { title: 'Kira', date: when })).toBe(
      '---\ntags: [character]\nborn:            # year\nrelations:\n  father:\n---\n# Kira\n\nMade 2026-10-23.\n',
    );
    // A header with nothing but the template block disappears; titles with $ are taken literally.
    expect(applyTemplate('---\ntemplate:\n  folder: X\n---\n# {{title}}\n', { title: 'Cost $1' })).toBe('# Cost $1\n');
    expect(applyTemplate('No header {{title}}', { title: 'A' })).toBe('No header A');
    expect(templateFolder('---\ntags: [x]\n---\n')).toBeUndefined();
  });

  it('ships a built-in set in both languages that makes valid pages', () => {
    for (const lang of ['en', 'ru'] as const) {
      const set = builtInTemplates(lang);
      expect(set.length).toBe(5);
      for (const tpl of set) {
        expect(tpl.folder).toBeTruthy();
        const page = parsePage(`${tpl.folder}/New.md`, applyTemplate(tpl.text, { title: 'New', date: when }), 1);
        expect(page.parseError).toBeUndefined();
        expect(page.raw).not.toContain('template:');
        expect(page.raw).not.toContain('{{');
        expect(page.relations).toEqual([]); // empty relation fields are there to fill in
        expect(pageYears(page)).toBeUndefined();
      }
    }
    expect(builtInTemplates('en').map((t) => t.name)).toEqual(['Character', 'Place', 'Organization', 'Event', 'Scene']);
    expect(builtInTemplateFiles('ru')[0]!.path).toBe('Шаблоны/Персонаж.md');
  });

  it('keeps templates out of the world: no links to them, not on the graph, cards or tags', () => {
    const pages = [
      parsePage('Templates/Character.md', builtInTemplates('en')[0]!.text, 1),
      parsePage('Templates/Place.md', '---\ntags: [place]\n---\nSee [[Nowhere]] and [[Kira]]\n', 1),
      parsePage('Kira.md', '---\ntags: [hero]\n---\nKira. Not a [[Character]].\n', 1),
    ];
    const index = new VaultIndex(pages);
    expect(index.pages.length).toBe(3);
    expect(index.worldPages.map((p) => p.path)).toEqual(['Kira.md']);
    expect(index.resolve('Character')).toBeUndefined();
    expect(index.get('Templates/Character.md')).toBeTruthy();
    expect(index.backlinkPaths('Kira.md')).toEqual([]);
    expect(index.allTags().map((t) => t.tag)).toEqual(['hero']);
    expect(index.brokenLinks().map((b) => b.link.target)).toEqual(['Character']);
    expect(buildGraph(index).nodes.map((n) => n.id)).toEqual(['Kira.md']);
    expect(folderTabs(index).map((t) => t.folder)).toEqual(['']);
    expect(worldTemplates(pages).map((t) => [t.name, t.folder])).toEqual([
      ['Character', 'Characters'],
      ['Place', undefined],
    ]);
  });
});

describe('the new page dialog', () => {
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
    app.dialog = null;
    app.closeVault();
    app.setMode('split');
  });

  const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

  async function boot(files: Record<string, string> = DEMO_FILES) {
    app.lang = 'en';
    app.setMode('preview');
    const vault = await Vault.open(new MemoryStorage(`t-${Math.random()}`, files));
    app.setVault(vault);
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(App, { target }));
    flushSync();
    await wait();
    flushSync();
    return { target, vault };
  }

  const chip = (label: string) => [...document.querySelectorAll<HTMLButtonElement>('.template-chips button')].find((b) => b.textContent === label)!;
  const fields = () => document.querySelectorAll<HTMLInputElement>('.new-page input[type="text"]');
  const type = (input: HTMLInputElement, text: string) => {
    input.value = text;
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
  };

  it('creates a page from a built-in template, in the folder the template suggests', async () => {
    const { vault } = await boot();
    app.askNewPage();
    flushSync();
    expect(chip('Blank page').getAttribute('aria-checked')).toBe('true');
    type(fields()[0]!, 'Wren Ashdown');
    chip('Character').click();
    flushSync();
    expect(fields()[1]!.value).toBe('Characters');
    document.querySelector<HTMLFormElement>('.new-page')!.requestSubmit();
    await wait(80);
    const page = vault.getPage('Characters/Wren Ashdown.md')!;
    expect(page.raw).toContain('# Wren Ashdown');
    expect(page.raw).toContain('## Personality');
    expect(page.raw).not.toContain('template:');
    expect(app.current).toBe('Characters/Wren Ashdown.md');
  });

  it('keeps a folder chosen on purpose, and still makes blank pages', async () => {
    const { vault } = await boot();
    app.askNewPage('Places');
    flushSync();
    type(fields()[0]!, 'Harbour');
    chip('Character').click();
    flushSync();
    expect(fields()[1]!.value).toBe('Places');
    chip('Blank page').click();
    flushSync();
    document.querySelector<HTMLFormElement>('.new-page')!.requestSubmit();
    await wait(80);
    expect(vault.getPage('Places/Harbour.md')!.raw).toBe('# Harbour\n\n');
  });

  it('adds the templates to the world, then offers the world’s own', async () => {
    const { vault } = await boot();
    app.askNewPage();
    flushSync();
    [...document.querySelectorAll<HTMLButtonElement>('.new-page .link-btn')][0]!.click();
    await wait(120);
    flushSync();
    expect(vault.getPage('Templates/Character.md')).toBeTruthy();
    expect(vault.getPage('Templates/Scene.md')).toBeTruthy();
    expect(app.current).toBe('Templates/Character.md');
    // The world's templates are not part of the world itself.
    expect(vault.index.worldPages.some((p) => p.path.startsWith('Templates/'))).toBe(false);
    // A template of one's own shows up in the dialog.
    await vault.createPage('Ship', 'Templates', '---\ntemplate:\n  folder: Ships\n---\n# {{title}}\n\n## Crew\n');
    app.askNewPage();
    flushSync();
    expect(document.querySelector('.new-page')!.textContent).toContain('Open the templates');
    type(fields()[0]!, 'Silver Gull');
    chip('Ship').click();
    flushSync();
    document.querySelector<HTMLFormElement>('.new-page')!.requestSubmit();
    await wait(80);
    expect(vault.getPage('Ships/Silver Gull.md')!.raw).toBe('# Silver Gull\n\n## Crew\n');
  });

  it('offers templates when creating a page a link points to', async () => {
    await boot();
    app.confirmCreate('Old Lighthouse', 'Places');
    flushSync();
    expect(document.querySelector('.new-page')!.textContent).toContain('does not exist');
    expect(fields()[0]!.value).toBe('Old Lighthouse');
    chip('Place').click();
    flushSync();
    expect(fields()[1]!.value).toBe('Places');
  });
});
