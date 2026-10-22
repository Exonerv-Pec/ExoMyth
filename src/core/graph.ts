import type { VaultIndex } from './index';
import { compareText, normalizeName } from './names';

export interface GraphNode {
  /** Page path; the node's stable identity. */
  id: string;
  title: string;
  /** Top-level folder ('' for pages in the root). Used for colour and the legend. */
  group: string;
  /** Number of distinct pages this page is connected to. */
  degree: number;
  tags: string[];
}

export interface GraphEdge {
  /** Endpoints in a fixed order (`a` sorts before `b`), so each pair appears once. */
  a: string;
  b: string;
  /** Typed relations between the two pages, from either side, in panel order. */
  types: string[];
  /** True when one page also links to the other in its text. */
  mention: boolean;
}

export interface WorldGraph {
  nodes: GraphNode[];
  edges: GraphEdge[];
  /** Pages with at least one connection, typed or plain. Everything else is unconnected. */
  connected: Set<string>;
}

function topFolder(path: string): string {
  const i = path.indexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/**
 * Builds the page graph from the index: one node per page, one edge per connected pair.
 * Output order depends only on paths, never on load order.
 */
export function buildGraph(index: VaultIndex): WorldGraph {
  const edges = new Map<string, GraphEdge>();
  const typeOrder = index.relationTypes();
  const rank = new Map(typeOrder.map((t, i) => [normalizeName(t), i]));

  const edgeFor = (x: string, y: string): GraphEdge => {
    const [a, b] = compareText(x, y) <= 0 ? [x, y] : [y, x];
    const key = `${a}\u0000${b}`;
    let e = edges.get(key);
    if (!e) {
      e = { a, b, types: [], mention: false };
      edges.set(key, e);
    }
    return e;
  };

  for (const page of index.pages) {
    for (const r of page.relations) {
      const target = index.resolve(r.link.target);
      if (!target || target.path === page.path) continue;
      const e = edgeFor(page.path, target.path);
      if (!e.types.some((t) => normalizeName(t) === normalizeName(r.type))) e.types.push(r.type);
    }
    for (const l of page.mentions) {
      const target = index.resolve(l.target);
      if (!target || target.path === page.path) continue;
      edgeFor(page.path, target.path).mention = true;
    }
  }

  const list = [...edges.values()].sort((x, y) => compareText(x.a, y.a) || compareText(x.b, y.b));
  const degree = new Map<string, number>();
  for (const e of list) {
    e.types.sort((x, y) => (rank.get(normalizeName(x)) ?? 1e9) - (rank.get(normalizeName(y)) ?? 1e9) || compareText(x, y));
    degree.set(e.a, (degree.get(e.a) ?? 0) + 1);
    degree.set(e.b, (degree.get(e.b) ?? 0) + 1);
  }

  const nodes: GraphNode[] = index.pages.map((p) => ({
    id: p.path,
    title: p.title,
    group: topFolder(p.path),
    degree: degree.get(p.path) ?? 0,
    tags: p.tags,
  }));
  nodes.sort((x, y) => compareText(x.id, y.id));

  return { nodes, edges: list, connected: new Set(degree.keys()) };
}

/** Pages within `depth` steps of `start` (including `start`). */
export function neighbourhood(graph: WorldGraph, start: string, depth: number): Set<string> {
  const adj = new Map<string, string[]>();
  for (const e of graph.edges) {
    (adj.get(e.a) ?? adj.set(e.a, []).get(e.a)!).push(e.b);
    (adj.get(e.b) ?? adj.set(e.b, []).get(e.b)!).push(e.a);
  }
  const seen = new Set([start]);
  let frontier = [start];
  for (let d = 0; d < depth; d++) {
    const next: string[] = [];
    for (const id of frontier) {
      for (const n of adj.get(id) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return seen;
}
