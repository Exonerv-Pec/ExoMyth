import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Workspace from '../src/components/Workspace.svelte';
import Dialog from '../src/components/Dialog.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { pageYears } from '../src/core/years';
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
  if (!('PointerEvent' in window)) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = class extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string } = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'mouse';
      }
    } as unknown as typeof MouseEvent;
  }
});

let mounted: ReturnType<typeof mount>[] = [];
afterEach(() => {
  mounted.forEach((m) => unmount(m));
  mounted = [];
  document.body.innerHTML = '';
  app.closeVault();
  app.byYear = false;
  app.setMode('split');
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

async function boot(mode: 'timeline' | 'graph' | 'cards' | 'preview', files: Record<string, string> = DEMO_FILES) {
  app.lang = 'en';
  app.setMode(mode);
  const vault = await Vault.open(new MemoryStorage(`tl-${Math.random()}`, files));
  app.setVault(vault);
  app.setByYear(false);
  app.current = 'Characters/Kira Vale.md';
  const target = document.createElement('div');
  document.body.append(target);
  mounted.push(mount(Workspace, { target }), mount(Dialog, { target: document.body }));
  flushSync();
  await wait(80);
  flushSync();
  return { target, vault };
}

const rowTitles = (t: HTMLElement) => [...t.querySelectorAll('.tl-row .tl-title')].map((e) => e.textContent);

describe('the timeline', () => {
  it('shows dated pages grouped by folder, in order, with bars and one-year events', async () => {
    const { target } = await boot('timeline');
    expect([...target.querySelectorAll('.tl-group-name')].map((e) => e.firstChild?.nextSibling?.textContent)).toEqual([
      'Characters',
      'Events',
      'Organizations',
      'Places',
    ]);
    const titles = rowTitles(target);
    expect(titles.slice(0, 3)).toEqual(['Oren Vale', 'Ysolde Vale', 'Arn Vale']);
    expect(titles).toContain('Siege of Rivertown');
    expect(titles).not.toContain('Welcome');
    const flood = target.querySelector('.tl-row[data-path="Events/The Great Flood.md"]')!;
    expect(flood.querySelector('.tl-point')).toBeTruthy();
    expect(flood.querySelector('.tl-years')!.textContent).toBe('405');
    const arn = target.querySelector('.tl-row[data-path="Characters/Arn Vale.md"]')!;
    expect(arn.querySelector('.tl-years')!.textContent).toBe('349 – 430');
    // Kira is alive: her bar runs on to the end.
    expect(target.querySelector('.tl-row[data-path="Characters/Kira Vale.md"] .tl-bar.open-end')).toBeTruthy();
    expect(target.querySelector('.tl-note')!.textContent).toContain('Without years');
    expect(target.querySelectorAll('.tl-tick').length).toBeGreaterThan(2);
  });

  it('places bars by year', async () => {
    const { target } = await boot('timeline');
    const left = (path: string) => parseFloat(target.querySelector<HTMLElement>(`.tl-row[data-path="${path}"] .tl-bar`)!.style.left);
    const width = (path: string) => parseFloat(target.querySelector<HTMLElement>(`.tl-row[data-path="${path}"] .tl-bar`)!.style.width);
    expect(left('Characters/Arn Vale.md')).toBeLessThan(left('Characters/Kira Vale.md'));
    // Arn lived 82 years, the siege lasted two: the bars keep that proportion.
    expect(width('Characters/Arn Vale.md') / width('Events/Siege of Rivertown.md')).toBeCloseTo(82 / 2, 0);
  });

  it('selects a page with a click and opens it with a double click', async () => {
    const { target } = await boot('timeline');
    const label = target.querySelector<HTMLButtonElement>('.tl-row[data-path="Characters/Arn Vale.md"] .tl-label')!;
    label.click();
    await wait();
    flushSync();
    expect(app.current).toBe('Characters/Arn Vale.md');
    expect(app.mode).toBe('timeline');
    expect(label.closest('.tl-row')!.classList.contains('selected')).toBe(true);
    label.click();
    await wait();
    expect(app.mode).toBe(app.textMode);
  });

  it('picks a year from the axis and fades what did not exist then', async () => {
    const { target } = await boot('timeline');
    const ticks = target.querySelector<HTMLElement>('.tl-ticks')!;
    ticks.dispatchEvent(new window.PointerEvent('pointerdown', { bubbles: true, clientX: 0, pointerId: 2 } as PointerEventInit));
    flushSync();
    expect(app.byYear).toBe(true);
    expect(app.year).toBe(300); // the axis starts a little before the first year, which is clamped
    app.setYear(420);
    flushSync();
    const faded = (path: string) => target.querySelector(`.tl-row[data-path="${path}"]`)!.classList.contains('faded');
    expect(faded('Characters/Kira Vale.md')).toBe(false);
    expect(faded('Events/Siege of Rivertown.md')).toBe(true);
    expect(target.querySelector('.tl-cursor')).toBeTruthy();
    expect(target.querySelector('.year-bar .year-value')!.textContent).toBe('420');
    // Keyboard on the axis moves a year at a time.
    ticks.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    flushSync();
    expect(app.year).toBe(421);
  });

  it('explains how to add years when no page has them', async () => {
    const { target } = await boot('timeline', { 'Welcome.md': '# Hi', 'Kira.md': '---\ntags: [x]\n---\nText' });
    expect(target.querySelector('.tl-empty')!.textContent).toContain('born: 412');
    expect(target.querySelector('.tl-row')).toBeNull();
  });
});

describe('the year everywhere', () => {
  it('fades pages on the graph and cards that do not exist in the chosen year', async () => {
    const { target } = await boot('graph');
    await wait(80);
    flushSync();
    app.setByYear(true);
    app.setYear(390);
    flushSync();
    const node = (title: string) => target.querySelector(`.node[aria-label="${title}"]`)!;
    expect(node('Kira Vale').classList.contains('muted')).toBe(true); // born 412
    expect(node('Arn Vale').classList.contains('muted')).toBe(false);
    expect(node('Welcome').classList.contains('muted')).toBe(false); // no years: always there
    expect(target.querySelector('.year-bar .year-hidden')!.textContent).toMatch(/\d/);

    app.setMode('cards');
    flushSync();
    await wait();
    flushSync();
    // Kira's dossier: she is faded, and so is her enemy Eva (born 401); her father Arn is not.
    expect(target.querySelector('.dossier-hero')!.classList.contains('faded')).toBe(true);
    const card = (title: string) => [...target.querySelectorAll<HTMLElement>('.page-card')].find((c) => c.title === title)!;
    expect(card('Eva Crow').classList.contains('faded')).toBe(true);
    expect(card('Arn Vale').classList.contains('faded')).toBe(false);
    // The switch in the cards view turns it off again.
    target.querySelector<HTMLInputElement>('.cards-view .year-bar input[type="checkbox"]')!.click();
    flushSync();
    expect(app.byYear).toBe(false);
    expect(card('Eva Crow').classList.contains('faded')).toBe(false);
  });

  it('remembers the year per world', async () => {
    await boot('graph');
    app.setByYear(true);
    app.setYear(412);
    const vault = app.vault!;
    app.closeVault();
    app.byYear = false;
    app.year = 0;
    app.setVault(vault);
    expect(app.byYear).toBe(true);
    expect(app.year).toBe(412);
  });

  it('map pins without years follow the years of their page', async () => {
    const files = {
      ...DEMO_FILES,
      'Maps/Silver Coast.md': DEMO_FILES['Maps/Silver Coast.md']!.replace('    from: 300\n', ''),
    };
    const { target } = await boot('preview', files);
    app.current = 'Maps/Silver Coast.md';
    flushSync();
    await wait();
    flushSync();
    app.setByYear(true);
    app.setYear(250);
    flushSync();
    const shown = () => [...target.querySelectorAll('.pin:not(.ghost) .pin-label')].map((e) => e.textContent);
    expect(shown()).toEqual(['Old Watchtower']); // Rivertown was founded in 300
    app.setYear(300);
    flushSync();
    expect(shown()).toContain('Rivertown');
  });
});

describe('editing years in the panel', () => {
  it('writes the years into the page, keeping the words the page uses', async () => {
    const { target, vault } = await boot('preview');
    app.current = 'Characters/Liara Vale.md';
    flushSync();
    await wait();
    flushSync();
    const inputs = target.querySelectorAll<HTMLInputElement>('.years-edit input');
    expect([...target.querySelectorAll('.years-field > span')].map((s) => s.textContent)).toEqual(['born', 'to']);
    expect(inputs[0]!.value).toBe('381');
    inputs[1]!.focus();
    inputs[1]!.value = '452';
    inputs[1]!.dispatchEvent(new Event('input', { bubbles: true }));
    inputs[1]!.blur();
    await wait(80);
    const page = vault.getPage('Characters/Liara Vale.md')!;
    expect(pageYears(page)).toMatchObject({ from: 381, to: 452, fromKey: 'born', toKey: 'to' });
    expect(page.raw).toContain('born: 381\n');
    expect(page.raw).toContain('to: 452\n');
  });

  it('rejects text that is not a year', async () => {
    const { target, vault } = await boot('preview');
    const before = vault.getPage('Characters/Kira Vale.md')!.raw;
    const input = target.querySelector<HTMLInputElement>('.years-edit input')!;
    input.focus();
    input.value = 'long ago';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
    await wait(60);
    flushSync();
    expect(target.querySelector('.years-edit .form-error')).toBeTruthy();
    expect(vault.getPage('Characters/Kira Vale.md')!.raw).toBe(before);
  });
});
