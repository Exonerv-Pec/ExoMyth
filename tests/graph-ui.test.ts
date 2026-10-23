import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Workspace from '../src/components/Workspace.svelte';
import Dialog from '../src/components/Dialog.svelte';
import HoverPreview from '../src/components/HoverPreview.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { parseLayout } from '../src/core/layout';
import { DEMO_FILES } from '../src/demo';

beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Element.prototype.scrollIntoView = () => {};
  // bind:clientWidth uses ResizeObserver, which jsdom lacks.
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  if (!('PointerEvent' in window)) {
    // jsdom has no PointerEvent; mouse events with a pointerId are enough for these handlers.
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
  app.dialog = null;
  app.setMode('split');
});

const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));

async function boot(extra: Record<string, string> = {}) {
  app.lang = 'en';
  const storage = new MemoryStorage('graph-test', { ...DEMO_FILES, ...extra });
  const vault = await Vault.open(storage);
  app.setVault(vault);
  app.current = 'Characters/Kira Vale.md';
  const target = document.createElement('div');
  document.body.appendChild(target);
  mounted.push(mount(Workspace, { target }));
  mounted.push(mount(Dialog, { target: document.body }));
  mounted.push(mount(HoverPreview, { target: document.body }));
  flushSync();
  await wait();
  return { vault, storage, target };
}

async function openGraph(target: HTMLElement) {
  const btn = [...target.querySelectorAll<HTMLButtonElement>('.topbar .seg button')].find((b) => b.textContent?.trim() === 'Graph')!;
  btn.click();
  flushSync();
  await wait(60); // layout file loads asynchronously
  flushSync();
}

const pointer = (type: string, x = 0, y = 0) =>
  new window.PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 7 } as PointerEventInit);

describe('graph view', () => {
  it('draws every page, joins related ones, and shelves unconnected ones', async () => {
    const { target } = await boot({ 'Notes/Stray idea.md': 'Links to nobody.' });
    await openGraph(target);
    const nodes = target.querySelectorAll('svg.graph .node');
    expect(nodes.length).toBe(13);
    const lonely = [...nodes].find((n) => n.getAttribute('aria-label') === 'Stray idea')!;
    expect(lonely.classList.contains('shelved')).toBe(true);
    expect(target.querySelector('.shelf-head text')!.textContent).toContain('No connections · 1');
    expect(target.querySelectorAll('svg.graph .edge').length).toBeGreaterThan(8);
    expect(target.querySelectorAll('.graph-legend .legend-item').length).toBeGreaterThanOrEqual(3);
  });

  it('saves positions into the world so the graph opens the same way next time', async () => {
    const { target, storage } = await boot();
    await openGraph(target);
    await wait(650);
    const saved = parseLayout(await storage.readText('.exomyth/graph.json'));
    expect(Object.keys(saved.nodes)).toContain('Characters/Kira Vale.md');
    const kira = target.querySelector('svg.graph .node[aria-label="Kira Vale"]')!;
    const [x, y] = saved.nodes['Characters/Kira Vale.md']!;
    expect(kira.getAttribute('transform')).toBe(`translate(${x} ${y})`);
  });

  it('selects a page with a click and opens it with a double click', async () => {
    const { target } = await boot();
    await openGraph(target);
    const arn = () => target.querySelector<SVGGElement>('svg.graph .node[aria-label="Arn Vale"]')!;
    arn().dispatchEvent(pointer('pointerdown'));
    target.querySelector('svg.graph')!.dispatchEvent(pointer('pointerup'));
    await wait();
    expect(app.current).toBe('Characters/Arn Vale.md');
    expect(app.mode).toBe('graph');
    flushSync();
    expect(arn().classList.contains('selected')).toBe(true);
    // Relations panel follows the selection.
    expect(target.querySelector('.relpanel .panel-title')!.textContent).toContain('Arn Vale');

    arn().dispatchEvent(pointer('pointerdown'));
    target.querySelector('svg.graph')!.dispatchEvent(pointer('pointerup'));
    await wait();
    expect(app.mode).toBe('split');
  });

  it('dragging a node moves only that node and remembers its new place', async () => {
    const { target } = await boot();
    await openGraph(target);
    const before = new Map(
      [...target.querySelectorAll('svg.graph .node')].map((n) => [n.getAttribute('aria-label'), n.getAttribute('transform')]),
    );
    const svg = target.querySelector('svg.graph')!;
    const bo = target.querySelector<SVGGElement>('svg.graph .node[aria-label="Bo Tarn"]')!;
    bo.dispatchEvent(pointer('pointerdown', 100, 100));
    svg.dispatchEvent(pointer('pointermove', 160, 140));
    svg.dispatchEvent(pointer('pointerup', 160, 140));
    flushSync();
    await wait();
    flushSync();
    const after = new Map(
      [...target.querySelectorAll('svg.graph .node')].map((n) => [n.getAttribute('aria-label'), n.getAttribute('transform')]),
    );
    for (const [label, tr] of before) {
      if (label === 'Bo Tarn') expect(after.get(label)).not.toBe(tr);
      else expect(after.get(label)).toBe(tr);
    }
    expect(app.layout!.nodes['Characters/Bo Tarn.md']).toBeTruthy();
  });

  it('shows only the neighbourhood of the selected page when asked, without moving anyone', async () => {
    const { target } = await boot({ 'Places/Far Harbour.md': 'Ships sail to [[Rivertown]].' });
    await openGraph(target);
    const before = target.querySelector('svg.graph .node[aria-label="Kira Vale"]')!.getAttribute('transform');
    const neighbours = [...target.querySelectorAll<HTMLButtonElement>('.graph-tools .seg button')].find(
      (b) => b.textContent?.trim() === 'Neighbours',
    )!;
    neighbours.click();
    flushSync();
    const labels = [...target.querySelectorAll('svg.graph .node')].map((n) => n.getAttribute('aria-label'));
    expect(labels).toContain('Kira Vale');
    expect(labels).toContain('Arn Vale');
    expect(labels).not.toContain('Far Harbour'); // two steps away
    expect(target.querySelector('svg.graph .node[aria-label="Kira Vale"]')!.getAttribute('transform')).toBe(before);
  });

  it('shows a hovered page in the corner of the graph, not on top of its connections', async () => {
    const { target } = await boot();
    await openGraph(target);
    const node = target.querySelector<SVGGElement>('svg.graph .node[aria-label="Arn Vale"]')!;
    node.dispatchEvent(new window.PointerEvent('pointerenter', { bubbles: false }));
    await wait(500);
    flushSync();
    expect(app.hover?.placement).toBe('corner');
    const card = document.querySelector('.hovercard')!;
    expect(card.classList.contains('corner')).toBe(true);
    expect(card.querySelector('h3')!.textContent).toBe('Arn Vale');
    app.hoverClose();
  });

  it('opens on the graph from the relations panel', async () => {
    const { target } = await boot();
    target.querySelector<HTMLButtonElement>('.relpanel .panel-head .icon-btn')!.click();
    await wait();
    flushSync();
    expect(app.mode).toBe('graph');
    expect(target.querySelector('svg.graph')).toBeTruthy();
  });
});

describe('hover previews', () => {
  it('shows a card for a link in the reading view, then hides it', async () => {
    const { target } = await boot();
    app.setMode('preview');
    flushSync();
    await wait();
    const link = [...target.querySelectorAll<HTMLAnchorElement>('.prose a.wikilink')].find((a) => a.dataset.target === 'Arn Vale')!;
    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await wait(500);
    flushSync();
    const card = document.querySelector('.hovercard')!;
    expect(card.querySelector('h3')!.textContent).toBe('Arn Vale');
    expect(card.textContent).toContain('King of Rivertown');
    link.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }));
    await wait(320);
    flushSync();
    expect(document.querySelector('.hovercard')).toBeNull();
  });

  it('shows a card for items in the relations panel', async () => {
    const { target } = await boot();
    const item = [...target.querySelectorAll<HTMLButtonElement>('.relpanel .rel-link')].find((b) =>
      b.textContent?.includes('Rivertown'),
    )!;
    item.dispatchEvent(new MouseEvent('mouseenter'));
    await wait(500);
    flushSync();
    const card = document.querySelector('.hovercard')!;
    expect(card.querySelector('h3')!.textContent).toBe('Rivertown');
    // Facts from the page header are shown.
    expect(card.querySelector('.facts')!.textContent).toContain('population');
  });

  it('offers to create a page that does not exist yet', async () => {
    const { target } = await boot({ 'Draft.md': 'Soon there will be [[City of Shadows]] here.' });
    app.current = 'Draft.md';
    app.setMode('preview');
    flushSync();
    await wait();
    const link = target.querySelector<HTMLAnchorElement>('.prose a.wikilink.broken')!;
    link.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    await wait(500);
    flushSync();
    const card = document.querySelector('.hovercard')!;
    expect(card.textContent).toContain('This page does not exist yet');
    card.querySelector<HTMLButtonElement>('footer .btn')!.click();
    flushSync();
    expect(app.dialog?.kind).toBe('confirm');
  });
});
