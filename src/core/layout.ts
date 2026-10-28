/**
 * Stable layout for the relations graph.
 *
 * Positions are computed once, saved in the world (`.exomyth/graph.json`) and then reused, so
 * the map of a world looks the same every time it is opened. Only pages without a saved
 * position are placed: next to their neighbours when they have any, otherwise on the
 * "shelf" of unconnected pages below the graph. Nothing that already has a place moves,
 * unless the user explicitly asks for a fresh layout.
 *
 * The first layout of each connected group uses a spring model of the classic
 * force-directed kind (connected pages pull together, all pages push apart, the pull of the
 * group's centre keeps it compact, and step sizes shrink over a fixed number of rounds).
 * Everything is deterministic: no randomness and no clock, so the same world always gets
 * the same first layout.
 */
import type { WorldGraph } from './graph';
import { compareText } from './names';

export interface Point {
  x: number;
  y: number;
}

export interface ShelfSpec {
  /** Top-left corner of the first cell. */
  x: number;
  y: number;
  cols: number;
}

/** What is saved to disk. `[x, y, onShelf]`, rounded to whole units. */
export interface StoredLayout {
  version: 1;
  shelf?: ShelfSpec;
  /** Colour slot of each top-level folder. Kept so colours never swap when folders are added. */
  groups?: Record<string, number>;
  nodes: Record<string, [number, number, 0 | 1]>;
}

/** Number of distinct folder colours. */
export const GROUP_COLORS = 8;

export interface LayoutResult {
  positions: Map<string, Point>;
  shelf: ShelfSpec;
  /** Colour slot per top-level folder ('' is the vault root and has no slot). */
  groups: Record<string, number>;
  /** Ids that sit on the shelf of unconnected pages. */
  shelved: Set<string>;
  /** True when anything was placed or removed, so the stored layout should be saved. */
  changed: boolean;
  stored: StoredLayout;
}

/** Ideal distance between two connected pages, in layout units (about one screen pixel at 100%). */
export const EDGE_LENGTH = 110;
export const SHELF_CELL = { w: 170, h: 46 };
const SHELF_GAP = 140;
const COMPONENT_GAP = 120;

export function emptyLayout(): StoredLayout {
  return { version: 1, nodes: {} };
}

export function parseLayout(text: string): StoredLayout {
  const raw = JSON.parse(text) as Partial<StoredLayout>;
  const out = emptyLayout();
  if (raw.shelf && [raw.shelf.x, raw.shelf.y, raw.shelf.cols].every((n) => Number.isFinite(n)) && raw.shelf.cols >= 1) {
    out.shelf = { x: raw.shelf.x, y: raw.shelf.y, cols: Math.floor(raw.shelf.cols) };
  }
  if (raw.groups && typeof raw.groups === 'object') {
    for (const [g, n] of Object.entries(raw.groups)) {
      if (Number.isInteger(n) && n >= 0 && n < GROUP_COLORS) (out.groups ??= {})[g] = n;
    }
  }
  if (raw.nodes && typeof raw.nodes === 'object') {
    for (const [id, v] of Object.entries(raw.nodes)) {
      if (Array.isArray(v) && Number.isFinite(v[0]) && Number.isFinite(v[1])) {
        out.nodes[id] = [v[0], v[1], v[2] === 1 ? 1 : 0];
      }
    }
  }
  return out;
}

export function serializeLayout(layout: StoredLayout): string {
  // Sorted keys keep the file diff-friendly for people who keep their world in Git.
  const nodes: Record<string, [number, number, 0 | 1]> = {};
  for (const id of Object.keys(layout.nodes).sort(compareText)) nodes[id] = layout.nodes[id]!;
  const out: StoredLayout = { version: 1, nodes };
  if (layout.shelf) out.shelf = layout.shelf;
  if (layout.groups && Object.keys(layout.groups).length > 0) {
    const groups: Record<string, number> = {};
    for (const g of Object.keys(layout.groups).sort(compareText)) groups[g] = layout.groups[g]!;
    out.groups = groups;
  }
  return JSON.stringify(out, null, 1) + '\n';
}

/**
 * Colour slot for each top-level folder ('' = the world's root, which has no slot).
 * Folders keep the slot they were saved with; a new folder takes the first free slot.
 * The graph and the cards use this, so a folder has the same colour everywhere.
 */
export function folderColorSlots(folderNames: Iterable<string>, saved: Record<string, number> = {}): Record<string, number> {
  const groups: Record<string, number> = {};
  const folders = [...new Set([...folderNames].filter(Boolean))].sort(compareText);
  for (const f of folders) if (saved[f] !== undefined) groups[f] = saved[f]!;
  for (const f of folders) {
    if (groups[f] !== undefined) continue;
    const used = new Set(Object.values(groups));
    let slot = 0;
    while (used.has(slot) && slot < GROUP_COLORS) slot++;
    groups[f] = slot < GROUP_COLORS ? slot : hash(f) % GROUP_COLORS;
  }
  return groups;
}

/* ------------------------------------------------------------------- helpers */

/** 32-bit FNV-1a: a tiny, well-known string hash used to give each page a fixed "random" angle. */
function hash(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function angleOf(id: string): number {
  return ((hash(id) % 3600) / 3600) * Math.PI * 2;
}

interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

function boundsOf(points: Iterable<Point>): Bounds | undefined {
  let b: Bounds | undefined;
  for (const p of points) {
    if (!b) b = { minX: p.x, minY: p.y, maxX: p.x, maxY: p.y };
    else {
      b.minX = Math.min(b.minX, p.x);
      b.minY = Math.min(b.minY, p.y);
      b.maxX = Math.max(b.maxX, p.x);
      b.maxY = Math.max(b.maxY, p.y);
    }
  }
  return b;
}

function adjacency(graph: WorldGraph): Map<string, string[]> {
  const adj = new Map<string, string[]>();
  for (const n of graph.nodes) adj.set(n.id, []);
  for (const e of graph.edges) {
    adj.get(e.a)?.push(e.b);
    adj.get(e.b)?.push(e.a);
  }
  for (const list of adj.values()) list.sort(compareText);
  return adj;
}

/** Connected groups of pages, largest first; ties broken by the first page path. */
function components(ids: string[], adj: Map<string, string[]>): string[][] {
  const seen = new Set<string>();
  const out: string[][] = [];
  for (const id of ids) {
    if (seen.has(id)) continue;
    const comp: string[] = [];
    const stack = [id];
    seen.add(id);
    while (stack.length) {
      const cur = stack.pop()!;
      comp.push(cur);
      for (const n of adj.get(cur) ?? []) {
        if (!seen.has(n)) {
          seen.add(n);
          stack.push(n);
        }
      }
    }
    comp.sort(compareText);
    out.push(comp);
  }
  return out.sort((a, b) => b.length - a.length || compareText(a[0]!, b[0]!));
}

/* -------------------------------------------------------------- spring model */

interface SpringOptions {
  /** Nodes that keep their position; only the others move. */
  fixed?: Set<string>;
  iterations?: number;
  /** Starting step size limit; shrinks linearly to a small value. */
  temperature?: number;
}

/**
 * Runs the spring model on `ids` in place. Repulsion is computed against every node in
 * `pos` that is close enough (a uniform grid keeps this fast for large worlds).
 */
function relax(ids: string[], pos: Map<string, Point>, adj: Map<string, string[]>, opts: SpringOptions = {}): void {
  // Work on flat arrays: this loop runs hundreds of times over every page of a large world.
  const all = [...pos.keys()].sort(compareText);
  const index = new Map(all.map((id, i) => [id, i]));
  const n = all.length;
  const xs = new Float64Array(n);
  const ys = new Float64Array(n);
  all.forEach((id, i) => {
    const p = pos.get(id)!;
    xs[i] = p.x;
    ys[i] = p.y;
  });
  const group = ids.map((id) => index.get(id)!);
  const moving = ids.filter((id) => !opts.fixed?.has(id)).map((id) => index.get(id)!);
  if (moving.length === 0) return;
  const neighbours = moving.map((i) =>
    Int32Array.from((adj.get(all[i]!) ?? []).map((id) => index.get(id) ?? -1).filter((j) => j >= 0)),
  );
  // A fixed pseudo-random direction per pair, for pages that start on the same spot.
  const tieAngle = moving.map((i) => angleOf(all[i]!));

  const k = EDGE_LENGTH;
  const k2 = k * k;
  const cutoff = k * 4;
  const cutoff2 = cutoff * cutoff;
  // Big groups start from a good spiral and need fewer rounds; each round costs more there.
  const iterations = opts.iterations ?? (ids.length <= 300 ? Math.min(420, 160 + ids.length * 2) : Math.max(150, Math.round((420 * 300) / ids.length)));
  const t0 = opts.temperature ?? k * 1.5;
  const dx = new Float64Array(moving.length);
  const dy = new Float64Array(moving.length);
  const grid = new Map<number, number[]>();
  const cellKey = (gx: number, gy: number) => (gx + 50_000) * 100_000 + (gy + 50_000);

  for (let it = 0; it < iterations; it++) {
    const temp = t0 * (1 - it / iterations) + 0.5;

    grid.clear();
    for (let i = 0; i < n; i++) {
      const key = cellKey(Math.floor(xs[i]! / cutoff), Math.floor(ys[i]! / cutoff));
      const cell = grid.get(key);
      if (cell) cell.push(i);
      else grid.set(key, [i]);
    }

    // Centre of this group; a gentle pull towards it keeps groups compact.
    let cx = 0;
    let cy = 0;
    for (const i of group) {
      cx += xs[i]!;
      cy += ys[i]!;
    }
    cx /= group.length;
    cy /= group.length;

    for (let m = 0; m < moving.length; m++) {
      const i = moving[m]!;
      const px = xs[i]!;
      const py = ys[i]!;
      let fx = 0;
      let fy = 0;
      const gx = Math.floor(px / cutoff);
      const gy = Math.floor(py / cutoff);
      for (let ox = -1; ox <= 1; ox++) {
        for (let oy = -1; oy <= 1; oy++) {
          const cell = grid.get(cellKey(gx + ox, gy + oy));
          if (!cell) continue;
          for (const j of cell) {
            if (j === i) continue;
            let vx = px - xs[j]!;
            let vy = py - ys[j]!;
            let d2 = vx * vx + vy * vy;
            if (d2 > cutoff2) continue;
            if (d2 < 0.01) {
              const a = tieAngle[m]! + j;
              vx = Math.cos(a);
              vy = Math.sin(a);
              d2 = 1;
            }
            // Push apart with strength k²/d: (vx, vy) has length d, so scale by k²/d².
            const f = k2 / d2;
            fx += vx * f;
            fy += vy * f;
          }
        }
      }
      // Pull connected pages together with strength d²/k: scale (vx, vy) by d/k.
      const nb = neighbours[m]!;
      for (let t = 0; t < nb.length; t++) {
        const j = nb[t]!;
        const vx = xs[j]! - px;
        const vy = ys[j]! - py;
        const f = Math.sqrt(vx * vx + vy * vy) / k;
        fx += vx * f;
        fy += vy * f;
      }
      if (group.length > 1) {
        fx += (cx - px) * 0.03;
        fy += (cy - py) * 0.03;
      }
      dx[m] = fx;
      dy[m] = fy;
    }

    for (let m = 0; m < moving.length; m++) {
      const len = Math.sqrt(dx[m]! * dx[m]! + dy[m]! * dy[m]!);
      if (len < 1e-9) continue;
      const step = Math.min(len, temp) / len;
      const i = moving[m]!;
      xs[i] = xs[i]! + dx[m]! * step;
      ys[i] = ys[i]! + dy[m]! * step;
    }
  }

  for (const i of moving) {
    const p = pos.get(all[i]!)!;
    p.x = xs[i]!;
    p.y = ys[i]!;
  }
}

/** Lays out one connected group from scratch, centred on (0, 0). */
function layoutComponent(ids: string[], adj: Map<string, string[]>): Map<string, Point> {
  const pos = new Map<string, Point>();
  if (ids.length === 1) {
    pos.set(ids[0]!, { x: 0, y: 0 });
    return pos;
  }
  // Start from a spiral in breadth-first order around the best-connected page, so
  // neighbours begin close together and the springs only have to tidy up.
  const start = [...ids].sort(
    (a, b) => (adj.get(b)?.length ?? 0) - (adj.get(a)?.length ?? 0) || compareText(a, b),
  )[0]!;
  const order: string[] = [];
  const seen = new Set([start]);
  const queue = [start];
  while (queue.length) {
    const cur = queue.shift()!;
    order.push(cur);
    for (const n of adj.get(cur) ?? []) {
      if (!seen.has(n)) {
        seen.add(n);
        queue.push(n);
      }
    }
  }
  const golden = Math.PI * (3 - Math.sqrt(5));
  order.forEach((id, i) => {
    const r = EDGE_LENGTH * 0.7 * Math.sqrt(i);
    pos.set(id, { x: r * Math.cos(i * golden), y: r * Math.sin(i * golden) });
  });
  relax(ids, pos, adj);

  const b = boundsOf(pos.values())!;
  const mx = (b.minX + b.maxX) / 2;
  const my = (b.minY + b.maxY) / 2;
  for (const p of pos.values()) {
    p.x -= mx;
    p.y -= my;
  }
  return pos;
}

/** Places groups in rows, largest first, like books on shelves. Returns the occupied bounds. */
function packComponents(groups: Map<string, Point>[], origin: Point, rowWidth: number, out: Map<string, Point>): Bounds | undefined {
  let x = origin.x;
  let y = origin.y;
  let rowH = 0;
  for (const g of groups) {
    const b = boundsOf(g.values())!;
    const w = b.maxX - b.minX + EDGE_LENGTH;
    const h = b.maxY - b.minY + EDGE_LENGTH;
    if (x > origin.x && x + w > origin.x + rowWidth) {
      x = origin.x;
      y += rowH + COMPONENT_GAP;
      rowH = 0;
    }
    for (const [id, p] of g) out.set(id, { x: x + (p.x - b.minX) + EDGE_LENGTH / 2, y: y + (p.y - b.minY) + EDGE_LENGTH / 2 });
    x += w + COMPONENT_GAP;
    rowH = Math.max(rowH, h);
  }
  return boundsOf(out.values());
}

/* --------------------------------------------------------------------- main */

/**
 * Computes positions for every page, reusing `stored` positions wherever they are still valid.
 * Pass no `stored` layout (or an empty one) for a fresh layout.
 */
export function layoutGraph(graph: WorldGraph, stored: StoredLayout = emptyLayout()): LayoutResult {
  const adj = adjacency(graph);
  const ids = graph.nodes.map((n) => n.id); // already sorted by path
  const titles = new Map(graph.nodes.map((n) => [n.id, n.title]));
  const positions = new Map<string, Point>();
  const shelved = new Set<string>();
  let changed = false;

  // 1. Keep every saved position whose page still exists and is still in the same place kind.
  for (const id of ids) {
    const s = stored.nodes[id];
    const isConnected = graph.connected.has(id);
    if (s && (s[2] === 1) === !isConnected) {
      positions.set(id, { x: s[0], y: s[1] });
      if (!isConnected) shelved.add(id);
    }
  }
  if (Object.keys(stored.nodes).some((id) => !positions.has(id))) changed = true;

  // 2. Place connected pages that have no position yet.
  const connectedIds = ids.filter((id) => graph.connected.has(id));
  const newConnected = connectedIds.filter((id) => !positions.has(id));
  if (newConnected.length > 0) {
    changed = true;
    const comps = components(connectedIds, adj);
    const brandNew: Map<string, Point>[] = [];
    for (const comp of comps) {
      const missing = comp.filter((id) => !positions.has(id));
      if (missing.length === 0) continue;
      if (missing.length === comp.length) {
        brandNew.push(layoutComponent(comp, adj));
        continue;
      }
      placeNextToNeighbours(missing, comp, positions, adj);
    }
    if (brandNew.length > 0) {
      const existing = boundsOf([...positions.entries()].filter(([id]) => !shelved.has(id)).map(([, p]) => p));
      const totalArea = brandNew.reduce((sum, g) => {
        const b = boundsOf(g.values())!;
        return sum + (b.maxX - b.minX + EDGE_LENGTH) * (b.maxY - b.minY + EDGE_LENGTH);
      }, 0);
      const widest = Math.max(...brandNew.map((g) => {
        const b = boundsOf(g.values())!;
        return b.maxX - b.minX + EDGE_LENGTH;
      }));
      const rowWidth = Math.max(widest, Math.sqrt(totalArea) * 1.4);
      // New groups go to the right of what is already there, so nothing existing is covered.
      const origin = existing ? { x: existing.maxX + COMPONENT_GAP * 1.5, y: existing.minY } : { x: 0, y: 0 };
      const placed = new Map<string, Point>();
      packComponents(brandNew, origin, rowWidth, placed);
      for (const [id, p] of placed) positions.set(id, p);
    }
  }

  // 3. The shelf of unconnected pages, under the graph. Its grid is fixed once created.
  const graphBounds = boundsOf(connectedIds.map((id) => positions.get(id)!).filter(Boolean));
  let shelf = stored.shelf;
  const unconnected = ids.filter((id) => !graph.connected.has(id));
  if (!shelf) {
    const width = graphBounds ? graphBounds.maxX - graphBounds.minX : 0;
    const cols = Math.max(4, Math.min(10, Math.round(width / SHELF_CELL.w) || Math.ceil(Math.sqrt(unconnected.length * 2))));
    shelf = {
      x: Math.round(graphBounds ? graphBounds.minX : 0),
      y: Math.round(graphBounds ? graphBounds.maxY + SHELF_GAP : 0),
      cols,
    };
    if (unconnected.length > 0) changed = true;
  }
  const newShelved = unconnected
    .filter((id) => !positions.has(id))
    .sort((a, b) => compareText(titles.get(a) ?? a, titles.get(b) ?? b) || compareText(a, b));
  if (newShelved.length > 0) {
    changed = true;
    const taken = new Set<string>();
    for (const id of shelved) {
      const p = positions.get(id)!;
      taken.add(`${Math.round((p.x - shelf.x) / SHELF_CELL.w)},${Math.round((p.y - shelf.y) / SHELF_CELL.h)}`);
    }
    let slot = 0;
    for (const id of newShelved) {
      let col = 0;
      let row = 0;
      do {
        col = slot % shelf.cols;
        row = Math.floor(slot / shelf.cols);
        slot++;
      } while (taken.has(`${col},${row}`));
      taken.add(`${col},${row}`);
      positions.set(id, { x: shelf.x + col * SHELF_CELL.w, y: shelf.y + row * SHELF_CELL.h });
      shelved.add(id);
    }
  }

  // 4. Folder colours: a new folder takes the first free slot; existing folders keep theirs.
  const groups = folderColorSlots(graph.nodes.map((n) => n.group), stored.groups);
  const sameKeys = (a: Record<string, number>, b: Record<string, number> = {}) =>
    Object.keys(a).length === Object.keys(b).length && Object.entries(a).every(([k, v]) => b[k] === v);
  if (!sameKeys(groups, stored.groups)) changed = true;

  const result: StoredLayout = { version: 1, shelf, groups, nodes: {} };
  for (const id of ids) {
    const p = positions.get(id)!;
    p.x = Math.round(p.x);
    p.y = Math.round(p.y);
    result.nodes[id] = [p.x, p.y, shelved.has(id) ? 1 : 0];
  }
  return { positions, shelf, groups, shelved, changed, stored: result };
}

/**
 * Places pages that joined an existing group: each starts beside the neighbours that already
 * have a place, then only the newcomers are nudged into comfortable spots.
 */
function placeNextToNeighbours(missing: string[], comp: string[], positions: Map<string, Point>, adj: Map<string, string[]>): void {
  const pending = new Set(missing);
  while (pending.size > 0) {
    // Next: the page with the most already-placed neighbours (ties by path).
    let best: string | undefined;
    let bestCount = -1;
    for (const id of [...pending].sort(compareText)) {
      const count = (adj.get(id) ?? []).filter((n) => positions.has(n)).length;
      if (count > bestCount) {
        best = id;
        bestCount = count;
      }
    }
    const id = best!;
    const placed = (adj.get(id) ?? []).map((n) => positions.get(n)).filter((p): p is Point => !!p);
    // The group already has placed pages, so breadth-first growth always finds a placed neighbour.
    const base = placed.length
      ? { x: placed.reduce((s, p) => s + p.x, 0) / placed.length, y: placed.reduce((s, p) => s + p.y, 0) / placed.length }
      : { x: 0, y: 0 };
    const a = angleOf(id);
    const r = placed.length === 1 ? EDGE_LENGTH : EDGE_LENGTH * 0.6;
    positions.set(id, { x: base.x + Math.cos(a) * r, y: base.y + Math.sin(a) * r });
    pending.delete(id);
  }
  const fixed = new Set(comp.filter((id) => !missing.includes(id)));
  // Repulsion from every placed page (other groups too) so newcomers do not land on anyone.
  relax(comp, positions, adj, { fixed, iterations: 80, temperature: EDGE_LENGTH * 0.6 });
}
