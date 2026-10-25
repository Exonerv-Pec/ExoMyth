import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { parsePage } from '../src/core/parse';
import { pageYears } from '../src/core/years';
import { isBook } from '../src/core/manuscript';
import { PROFILES } from '../src/core/profiles';
import { applyTemplate, builtInTemplateFiles, templateGroup, worldTemplates } from '../src/core/templates';
import { structureTemplates, STRUCTURE_GROUP } from '../src/core/structures';

describe('story structure templates', () => {
  it('are five shapes in each language, with the same number of parts and checks', () => {
    const en = structureTemplates('en');
    const ru = structureTemplates('ru');
    expect(en.map((t) => t.name)).toEqual(['Three acts', 'Five acts', "Hero's journey", 'Seven points', 'Kishōtenketsu']);
    expect(ru.map((t) => t.name)).toEqual(['Три акта', 'Пять актов', 'Путь героя', 'Семь точек', 'Кисётэнкэцу']);
    const count = (text: string, re: RegExp) => (text.match(re) ?? []).length;
    en.forEach((t, i) => {
      expect(count(t.text, /^## /gm)).toBe(count(ru[i]!.text, /^## /gm));
      expect(count(t.text, /^- \[ \] /gm)).toBe(count(ru[i]!.text, /^- \[ \] /gm));
      expect(count(t.text, /^> /gm)).toBe(count(t.text, /^## /gm) - 1);
    });
    expect(en.map((t) => count(t.text, /^> /gm))).toEqual([9, 5, 12, 7, 4]);
  });

  it('make valid, plain pages: no leftovers of the template, nothing that looks like a relation or a year', () => {
    for (const lang of ['en', 'ru'] as const) {
      for (const tpl of structureTemplates(lang)) {
        expect(tpl.group).toBe(STRUCTURE_GROUP);
        expect(tpl.folder).toBe(lang === 'ru' ? 'Структуры' : 'Outlines');
        const page = parsePage(`${tpl.folder}/My plan.md`, applyTemplate(tpl.text, { title: 'My plan' }), 1);
        expect(page.parseError).toBeUndefined();
        expect(page.raw).not.toContain('template:');
        expect(page.raw).not.toContain('group:');
        expect(page.raw).not.toContain('{{');
        expect(page.raw).toContain('# My plan');
        expect(page.relations).toEqual([]);
        expect(page.mentions).toEqual([]);
        expect(pageYears(page)).toBeUndefined();
        expect(isBook(page)).toBe(false);
        expect(page.tags).toHaveLength(1);
      }
    }
  });

  it('end with a checklist to check a draft against', () => {
    for (const tpl of structureTemplates('en')) {
      const [, checks = ''] = tpl.text.split('## Check the draft\n');
      expect(checks.trim().split('\n')).toHaveLength(4);
      expect(checks).toMatch(/^- \[ \] .+\?|^- \[ \] .+\./m);
    }
  });

  it('read their group from a world’s own copy, and come along when the templates are added to a world', () => {
    expect(templateGroup('---\ntemplate:\n  folder: X\n  group: structure\n---\n')).toBe('structure');
    expect(templateGroup('---\ntemplate:\n  folder: X\n---\n')).toBeUndefined();
    expect(templateGroup('---\ngroup: structure\n---\n')).toBeUndefined();
    const files = builtInTemplateFiles('en');
    expect(files).toHaveLength(8 + 5);
    expect(new Set(files.map((f) => f.path)).size).toBe(files.length);
    const own = worldTemplates(files.map((f) => parsePage(f.path, f.text, 1)));
    expect(own.filter((t) => t.group === STRUCTURE_GROUP).map((t) => t.name).sort()).toEqual(['Five acts', "Hero's journey", 'Kishōtenketsu', 'Seven points', 'Three acts']);
    expect(own.find((t) => t.name === 'Character')!.group).toBeUndefined();
  });

  it('are kept for writers and dropped by the world building, game and notes profiles', () => {
    expect(PROFILES.find((p) => p.id === 'writer')!.off).not.toContain('storyStructures');
    for (const id of ['worldbuilder', 'gamemaster', 'notes']) expect(PROFILES.find((p) => p.id === id)!.off).toContain('storyStructures');
  });
});

describe('in the New page window', () => {
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
    app.closeVault();
    app.dialog = null;
    app.setMode('split');
  });

  const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

  async function boot(files: Record<string, string> = { 'Note.md': '# Note\n\nHello.\n' }) {
    app.lang = 'en';
    app.setMode('split');
    app.setVault(await Vault.open(new MemoryStorage(`t-${Math.random()}`, files)));
    app.current = 'Note.md';
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(App, { target }));
    flushSync();
    await wait();
    flushSync();
  }

  const groups = () => [...document.querySelectorAll('.template-pick')].map((g) => ({ title: g.querySelector('legend')!.textContent, chips: [...g.querySelectorAll('.template-chips button')].map((b) => b.textContent) }));

  it('show the shapes in a group of their own, below the usual templates', async () => {
    await boot();
    app.askNewPage();
    flushSync();
    const [usual, shapes] = groups();
    expect(usual!.chips).toContain('Character');
    expect(usual!.chips).not.toContain('Three acts');
    expect(shapes).toEqual({ title: 'Story structure', chips: ['Three acts', 'Five acts', "Hero's journey", 'Seven points', 'Kishōtenketsu'] });
  });

  it('are still offered when the world has templates of its own, and its own copy of one wins', async () => {
    await boot({
      'Note.md': '# Note\n',
      'Templates/Idea.md': '---\ntemplate:\n  folder: Ideas\n---\n# {{title}}\n',
      'Templates/Three acts.md': '---\ntemplate:\n  folder: Plans\n  group: structure\n---\n# {{title}}\n\nMy own three acts.\n',
    });
    app.askNewPage();
    flushSync();
    const [usual, shapes] = groups();
    expect(usual!.chips).toEqual(['Blank page', 'Idea']);
    // The world's own copy takes the place of the built-in one, so each shape appears once.
    expect(shapes!.chips).toEqual(['Three acts', 'Five acts', "Hero's journey", 'Seven points', 'Kishōtenketsu']);
    const own = [...document.querySelectorAll<HTMLButtonElement>('.template-pick .template-chips button')].find((b) => b.textContent === 'Three acts')!;
    own.click();
    flushSync();
    expect((document.querySelector('.new-page input[list]') as HTMLInputElement).value).toBe('Plans');
  });

  it('can be switched off, and are not offered then', async () => {
    await boot();
    app.setFeature('storyStructures', false);
    app.askNewPage();
    flushSync();
    expect(groups().map((g) => g.title)).toEqual(['Template']);
    expect(document.querySelector('.new-page')!.textContent).not.toContain('Story structure');
  });

  it('make a page in Outlines that is ready to fill in, from a click on a shape', async () => {
    await boot();
    app.askNewPage();
    flushSync();
    const input = document.querySelector<HTMLInputElement>('.new-page input[type="text"]')!;
    input.value = 'Plan of Ember Sea';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    [...document.querySelectorAll<HTMLButtonElement>('.template-chips button')].find((b) => b.textContent === 'Five acts')!.click();
    flushSync();
    expect((document.querySelector('.new-page input[list]') as HTMLInputElement).value).toBe('Outlines');
    document.querySelector<HTMLFormElement>('.new-page')!.requestSubmit();
    await wait(80);
    flushSync();
    const page = app.vault!.getPage('Outlines/Plan of Ember Sea.md')!;
    expect(page).toBeTruthy();
    expect(page.body).toMatch(/^# Plan of Ember Sea/);
    expect(page.body).toContain('## Climax\n> What is the peak');
    expect(app.current).toBe('Outlines/Plan of Ember Sea.md');
  });

  it('are listed in Settings with their own switch', async () => {
    await boot();
    app.settingsOpen = true;
    flushSync();
    const row = [...document.querySelectorAll<HTMLLabelElement>('.settings .setting')].find((l) => l.querySelector('.setting-name')!.textContent === 'Story structures');
    expect(row?.querySelector('input')?.checked).toBe(true);
  });
});
