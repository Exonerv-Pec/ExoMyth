import { describe, expect, it } from 'vitest';
import { parsePage } from '../src/core/parse';
import { VaultIndex } from '../src/core/index';
import { buildGraph, neighbourhood } from '../src/core/graph';
import { EDGE_LENGTH, layoutGraph, parseLayout, serializeLayout } from '../src/core/layout';
import type { Page } from '../src/core/types';
import { DEMO_FILES } from '../src/demo';

const page = (path: string, text: string) => parsePage(path, text, 1);
const demoPages = (): Page[] =>
  Object.entries(DEMO_FILES)
    .filter(([p]) => p.endsWith('.md'))
    .map(([p, t]) => page(p, t));
const graphOf = (pages: Page[]) => buildGraph(new VaultIndex(pages));
const dist = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

describe('graph model', () => {
  it('merges both directions and both link kinds into one edge per pair', () => {
    const g = graphOf([
      page('A.md', '---\nrelations:\n  ally: "[[B]]"\n---\nsee [[B]]'),
      page('B.md', '---\nrelations:\n  friend: "[[A]]"\n---\n'),
      page('C.md', 'alone'),
    ]);
    expect(g.edges).toEqual([{ a: 'A.md', b: 'B.md', types: ['ally', 'friend'], mention: true }]);
    expect([...g.connected].sort()).toEqual(['A.md', 'B.md']);
    expect(g.nodes.find((n) => n.id === 'C.md')!.degree).toBe(0);
  });

  it('ignores broken links and self links', () => {
    const g = graphOf([page('A.md', '[[A]] [[Nowhere]]')]);
    expect(g.edges).toEqual([]);
    expect(g.connected.size).toBe(0);
  });

  it('finds the neighbourhood of a page', () => {
    const g = graphOf([page('A.md', '[[B]]'), page('B.md', '[[C]]'), page('C.md', '[[D]]'), page('D.md', '')]);
    expect([...neighbourhood(g, 'A.md', 1)].sort()).toEqual(['A.md', 'B.md']);
    expect([...neighbourhood(g, 'A.md', 2)].sort()).toEqual(['A.md', 'B.md', 'C.md']);
  });
});

describe('stable layout', () => {
  it('is deterministic for the same world, whatever the load order', () => {
    const pages = demoPages();
    const first = serializeLayout(layoutGraph(graphOf(pages)).stored);
    const shuffled = [...pages].reverse();
    expect(serializeLayout(layoutGraph(graphOf(shuffled)).stored)).toBe(first);
  });

  it('keeps connected pages near each other and apart from each other', () => {
    const r = layoutGraph(graphOf(demoPages()));
    const kira = r.positions.get('Characters/Kira Vale.md')!;
    const arn = r.positions.get('Characters/Arn Vale.md')!;
    expect(dist(kira, arn)).toBeLessThan(EDGE_LENGTH * 3);
    const all = [...r.positions.entries()].filter(([id]) => !r.shelved.has(id));
    for (let i = 0; i < all.length; i++)
      for (let j = i + 1; j < all.length; j++) expect(dist(all[i]![1], all[j]![1])).toBeGreaterThan(EDGE_LENGTH * 0.3);
  });

  it('reuses saved positions: adding a page moves nothing that was already placed', () => {
    const pages = demoPages();
    const before = layoutGraph(graphOf(pages));
    const stored = parseLayout(serializeLayout(before.stored));
    const withNew = [...pages, page('Characters/Newcomer.md', '---\nrelations:\n  ally: "[[Kira Vale]]"\n---\n')];
    const after = layoutGraph(graphOf(withNew), stored);
    expect(after.changed).toBe(true);
    for (const [id, p] of before.positions) expect(after.positions.get(id)).toEqual(p);
    const kira = after.positions.get('Characters/Kira Vale.md')!;
    expect(dist(after.positions.get('Characters/Newcomer.md')!, kira)).toBeLessThan(EDGE_LENGTH * 3);
    // Opening again with the saved result changes nothing.
    const again = layoutGraph(graphOf(withNew), parseLayout(serializeLayout(after.stored)));
    expect(again.changed).toBe(false);
  });

  it('puts unconnected pages on a shelf below the graph, in title order', () => {
    const pages = [...demoPages(), page('Notes/Zebra.md', 'x'), page('Notes/Apple.md', 'y')];
    const r = layoutGraph(graphOf(pages));
    expect(r.shelved.has('Notes/Apple.md')).toBe(true);
    const graphMaxY = Math.max(...[...r.positions].filter(([id]) => !r.shelved.has(id)).map(([, p]) => p.y));
    const a = r.positions.get('Notes/Apple.md')!;
    const b = r.positions.get('Notes/Zebra.md')!;
    expect(a.y).toBeGreaterThan(graphMaxY);
    expect(a.y === b.y ? a.x < b.x : a.y < b.y).toBe(true);
  });

  it('a new unconnected page takes a free shelf slot without moving others', () => {
    const pages = [page('A.md', 'x'), page('B.md', 'y')];
    const first = layoutGraph(graphOf(pages));
    const second = layoutGraph(graphOf([...pages, page('C.md', 'z')]), first.stored);
    expect(second.positions.get('A.md')).toEqual(first.positions.get('A.md'));
    expect(second.positions.get('B.md')).toEqual(first.positions.get('B.md'));
    const c = second.positions.get('C.md')!;
    expect([...first.positions.values()].some((p) => p.x === c.x && p.y === c.y)).toBe(false);
  });

  it('moves a page off the shelf once it gets a connection, and leaves the rest alone', () => {
    const base = [page('A.md', '[[B]]'), page('B.md', ''), page('C.md', 'alone')];
    const first = layoutGraph(graphOf(base));
    expect(first.shelved.has('C.md')).toBe(true);
    const second = layoutGraph(graphOf([page('A.md', '[[B]] [[C]]'), page('B.md', ''), page('C.md', 'alone')]), first.stored);
    expect(second.shelved.has('C.md')).toBe(false);
    expect(second.positions.get('A.md')).toEqual(first.positions.get('A.md'));
    expect(second.positions.get('B.md')).toEqual(first.positions.get('B.md'));
  });

  it('places a whole new group beside the existing graph, not on top of it', () => {
    const base = [page('A.md', '[[B]]'), page('B.md', '')];
    const first = layoutGraph(graphOf(base));
    const second = layoutGraph(graphOf([...base, page('X.md', '[[Y]]'), page('Y.md', '')]), first.stored);
    const maxX = Math.max(first.positions.get('A.md')!.x, first.positions.get('B.md')!.x);
    expect(second.positions.get('X.md')!.x).toBeGreaterThan(maxX);
  });

  it('forgets pages that no longer exist', () => {
    const first = layoutGraph(graphOf([page('A.md', '[[B]]'), page('B.md', '')]));
    const second = layoutGraph(graphOf([page('A.md', '')]), first.stored);
    expect(second.changed).toBe(true);
    expect(Object.keys(second.stored.nodes)).toEqual(['A.md']);
  });

  it('lays out a large world in reasonable time', () => {
    const pages: Page[] = [];
    for (let i = 0; i < 600; i++) {
      const links = [1, 7, 31].map((d) => `[[P${(i + d) % 600}]]`).join(' ');
      pages.push(page(`P${i}.md`, links));
    }
    const started = performance.now();
    const r = layoutGraph(graphOf(pages));
    expect(r.positions.size).toBe(600);
    expect(performance.now() - started).toBeLessThan(8000);
  });

  it('gives each folder its own colour and keeps it when a new folder appears', () => {
    const first = layoutGraph(graphOf([page('Places/A.md', '[[B]]'), page('People/B.md', '')]));
    expect(first.groups).toEqual({ People: 0, Places: 1 });
    const second = layoutGraph(
      graphOf([page('Places/A.md', '[[B]]'), page('People/B.md', ''), page('Items/C.md', '')]),
      parseLayout(serializeLayout(first.stored)),
    );
    expect(second.groups).toEqual({ Items: 2, People: 0, Places: 1 });
  });

  it('rejects malformed saved data gracefully', () => {
    const l = parseLayout('{"version":1,"nodes":{"A.md":[1,2,1],"B.md":"bad","C.md":[null,3]}}');
    expect(l.nodes).toEqual({ 'A.md': [1, 2, 1] });
  });
});
