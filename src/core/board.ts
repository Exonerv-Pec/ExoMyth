/**
 * Mood boards: a page becomes a board when its header says `moodboard: true`. The `board:` list
 * holds what is pinned on it and where: pictures, colours, quotes and cards of other pages. It is
 * plain YAML, so the board can be read, edited and kept like any other page:
 *
 *   moodboard: true
 *   board:
 *     - image: storm coast.jpg
 *       caption: Where it starts
 *       x: 0.05
 *       y: 0.04
 *       w: 0.4
 *     - color: "#a86214"
 *       x: 0.5
 *       y: 0.04
 *       w: 0.12
 *       h: 0.12
 *     - quote: The sea keeps what it is given.
 *       source: Old saying
 *       x: 0.5
 *       y: 0.25
 *       w: 0.3
 *     - page: "[[Kira Vale]]"
 *       x: 0.1
 *       y: 0.5
 *       w: 0.2
 *     - note: Storms come from the west.
 *       tint: "#f3e3a1"
 *       x: 0.4
 *       y: 0.5
 *       w: 0.2
 *
 * Positions and sizes are fractions of the board's width, so the board looks the same on a wide
 * screen and a narrow one (`y` is measured downwards in the same unit, so the board grows as you
 * pin things lower). Items later in the list lie on top of earlier ones. A picture's height follows
 * the picture unless it has an `h`, which crops it to that height. Colours always have a `h`.
 */
import { isMap, isSeq, type YAMLMap, type YAMLSeq } from 'yaml';
import type { Page } from './types';
import { editFrontmatter, findWikiLinks, parseLinkText } from './parse';

export type BoardKind = 'image' | 'color' | 'quote' | 'page' | 'note';

export const MIN_WIDTH = 0.06;
export const MAX_DEPTH = 8;
/** The least height a board is drawn with, in widths. */
export const MIN_BOARD_HEIGHT = 0.6;

export interface BoardItem {
  /** Position in the `board:` list; edits refer to items by it. */
  index: number;
  kind: BoardKind;
  x: number;
  y: number;
  w: number;
  /** Colours always; pictures when they are cropped to a height. */
  h?: number;
  /** Image file as written, for pictures. */
  image?: string;
  /** A colour such as `#a86214`, for colours. */
  color?: string;
  quote?: string;
  /** Who said it, for quotes. */
  source?: string;
  /** Target page as written (without brackets), for page cards. */
  page?: string;
  /** Free text, for notes. */
  note?: string;
  /** Background colour of a note. */
  tint?: string;
  /** A line under a picture or a colour. */
  caption?: string;
}

export interface BoardModel {
  items: BoardItem[];
}

/** What can be stored for an item; fields that are not set are left out of the file. */
export type BoardData = Omit<BoardItem, 'index'>;

const TRUE = /^(true|yes|да|moodboard|мудборд)$/i;

/** Whether a page is a board (its header says `moodboard: true`, or `yes`, or `да`). */
export function isBoard(page: Pick<Page, 'frontmatter'>): boolean {
  const v = page.frontmatter.moodboard;
  return v === true || (typeof v === 'string' && TRUE.test(v.trim()));
}

/** A colour as `#rrggbb` or `#rgb` in lower case, or undefined for anything else. */
export function cleanColor(value: unknown): string | undefined {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim()) ? value.trim().toLowerCase() : undefined;
}

function text(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function number(value: unknown): number | undefined {
  const n = typeof value === 'string' && value.trim() !== '' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined;
}

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));
const round = (n: number) => Math.round(n * 10000) / 10000;

/** Keeps a position or size inside the board and its limits. */
function place(d: { x: number; y: number; w: number; h?: number }): { x: number; y: number; w: number; h?: number } {
  const w = clamp(d.w, MIN_WIDTH, 1);
  const out: { x: number; y: number; w: number; h?: number } = {
    w: round(w),
    x: round(clamp(d.x, 0, 1 - w)),
    y: round(clamp(d.y, 0, MAX_DEPTH)),
  };
  if (d.h !== undefined) out.h = round(clamp(d.h, 0.04, 2));
  return out;
}

function records(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && !Array.isArray(p)) : [];
}

function pageTarget(value: unknown): string | undefined {
  const s = text(value);
  if (!s) return undefined;
  const link = s.includes('[[') ? findWikiLinks(s)[0] : parseLinkText(s);
  return link?.target || undefined;
}

function imageName(value: unknown): string | undefined {
  const s = text(value);
  return s?.replace(/^!?\[\[([^\]|]+).*$/, '$1').trim() || undefined;
}

/** Reads one `board:` entry; entries that name nothing to show are skipped. */
function readItem(o: Record<string, unknown>, index: number): BoardItem | undefined {
  const base = { x: number(o.x) ?? 0.05, y: number(o.y) ?? 0.05, w: number(o.w) ?? 0.25 };
  const image = imageName(o.image);
  const color = cleanColor(o.color);
  const quote = text(o.quote);
  const page = pageTarget(o.page);
  const note = text(o.note);
  const caption = text(o.caption);
  if (image) {
    const h = number(o.h);
    const item: BoardItem = { index, kind: 'image', image, ...place(h !== undefined ? { ...base, h } : base) };
    if (caption) item.caption = caption;
    return item;
  }
  if (color) {
    const item: BoardItem = { index, kind: 'color', color, ...place({ ...base, h: number(o.h) ?? base.w }) };
    if (caption) item.caption = caption;
    return item;
  }
  if (quote) {
    const item: BoardItem = { index, kind: 'quote', quote, ...place(base) };
    const source = text(o.source);
    if (source) item.source = source;
    return item;
  }
  if (note) {
    const item: BoardItem = { index, kind: 'note', note, ...place(base) };
    const tint = cleanColor(o.tint);
    if (tint) item.tint = tint;
    return item;
  }
  if (page) return { index, kind: 'page', page, ...place(base) };
  return undefined;
}

/** The board of a page, or undefined when the page is not one. Entries that cannot be shown are skipped. */
export function boardOf(page: Pick<Page, 'frontmatter'>): BoardModel | undefined {
  if (!isBoard(page)) return undefined;
  const items: BoardItem[] = [];
  records(page.frontmatter.board).forEach((o, index) => {
    const item = readItem(o, index);
    if (item) items.push(item);
  });
  return { items };
}

/** Number of entries in `board:`, i.e. the index the next added item gets. */
export function itemCount(page: Pick<Page, 'frontmatter'>): number {
  return records(page.frontmatter.board).length;
}

/* ------------------------------------------------------------------ drawing */

/** A guess at an item's height, in widths, until the real one is measured. */
export function estimatedHeight(item: BoardItem): number {
  if (item.kind === 'color') return item.h ?? item.w;
  if (item.kind === 'image') return item.h ?? item.w * 0.75;
  if (item.kind === 'quote' || item.kind === 'note') return 0.14;
  return 0.1;
}

/** How tall the board is drawn, in widths: down to the lowest item, with a margin, never below the minimum. */
export function boardHeight(items: readonly BoardItem[], measured: ReadonlyMap<number, number> = new Map()): number {
  let bottom = 0;
  for (const item of items) bottom = Math.max(bottom, item.y + (measured.get(item.index) ?? estimatedHeight(item)));
  return round(Math.max(MIN_BOARD_HEIGHT, bottom + 0.05));
}

/** Where the next item goes: a little further down and right for each one already there, so none hides another. */
export function nextSpot(count: number): { x: number; y: number } {
  const step = count % 8;
  return { x: round(0.04 + 0.04 * step), y: round(0.04 + 0.04 * step) };
}

/** A few pleasant colours to start a swatch from, in turn. */
export const SWATCHES = ['#a86214', '#1f7a6d', '#5b3f8c', '#b0432f', '#3b6ea8', '#6b7a3a', '#c9a227', '#2d3b45'];

/** Pale paper colours for notes, in turn; dark text stays readable on all of them. */
export const NOTE_TINTS = ['#f3e3a1', '#d7ead2', '#f2d4cf', '#d3e2f2', '#e6dcf0'];

/** Dark or light text for a background, whichever reads better on it. */
export function inkOn(background: string): '#17262f' | '#ffffff' {
  const c = cleanColor(background) ?? '#ffffff';
  const hex = c.length === 4 ? c.slice(1).split('').map((d) => d + d).join('') : c.slice(1);
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255) as [number, number, number];
  const lin = (v: number) => (v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
  const lum = 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
  return lum > 0.4 ? '#17262f' : '#ffffff';
}

/* ------------------------------------------------------------- snapping */

/** A box on the board, in widths. */
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** How close (in widths) an edge must come to a line before it snaps to it, for a board `px` pixels wide. */
export const snapDistance = (px: number) => (px > 0 ? 8 / px : 0);

/** Lines other items offer to line up with: their edges and middles, and the board's edges and middle. */
export function snapLines(others: readonly Box[]): { xs: number[]; ys: number[] } {
  const xs = [0, 0.5, 1];
  const ys = [0];
  for (const o of others) {
    xs.push(o.x, o.x + o.w / 2, o.x + o.w);
    ys.push(o.y, o.y + o.h / 2, o.y + o.h);
  }
  return { xs, ys };
}

/** The line nearest to any of `points` within `distance`, and how far to shift to meet it. */
function nearest(points: readonly number[], lines: readonly number[], distance: number): { shift: number; line: number } | undefined {
  let best: { shift: number; line: number } | undefined;
  for (const p of points)
    for (const l of lines) {
      const d = l - p;
      if (Math.abs(d) <= distance && (!best || Math.abs(d) < Math.abs(best.shift))) best = { shift: d, line: l };
    }
  return best;
}

/**
 * Lines a moving box up with the others: its left, middle or right edge goes to the nearest line
 * within `distance`, and the same for top, middle and bottom. Returns the place and the lines it met.
 */
export function snapMove(box: Box, others: readonly Box[], distance: number): { x: number; y: number; guideX?: number; guideY?: number } {
  const { xs, ys } = snapLines(others);
  const sx = nearest([box.x, box.x + box.w / 2, box.x + box.w], xs, distance);
  const sy = nearest([box.y, box.y + box.h / 2, box.y + box.h], ys, distance);
  const out: { x: number; y: number; guideX?: number; guideY?: number } = { x: box.x + (sx?.shift ?? 0), y: box.y + (sy?.shift ?? 0) };
  if (sx) out.guideX = sx.line;
  if (sy) out.guideY = sy.line;
  return out;
}

/** Lines the right edge (and, with a height, the bottom edge) of a box being resized up with the others. */
export function snapSize(box: Box, others: readonly Box[], distance: number, withHeight: boolean): { w: number; h: number; guideX?: number; guideY?: number } {
  const { xs, ys } = snapLines(others);
  const sx = nearest([box.x + box.w], xs, distance);
  const sy = withHeight ? nearest([box.y + box.h], ys, distance) : undefined;
  const out: { w: number; h: number; guideX?: number; guideY?: number } = { w: box.w + (sx?.shift ?? 0), h: box.h + (sy?.shift ?? 0) };
  if (sx) out.guideX = sx.line;
  if (sy) out.guideY = sy.line;
  return out;
}

/* ----------------------------------------------------------------- zoom */

/** Steps of the board's zoom; 1 is the width of the page. */
export const ZOOMS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3] as const;

/** The next zoom step in or out from `zoom`. */
export function zoomStep(zoom: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOMS.find((z) => z > zoom + 1e-6) ?? ZOOMS[ZOOMS.length - 1]!;
  return [...ZOOMS].reverse().find((z) => z < zoom - 1e-6) ?? ZOOMS[0]!;
}

/** A saved zoom, or 1 for anything that is not one of the steps. */
export function cleanZoom(value: unknown): number {
  const n = Number(value);
  return (ZOOMS as readonly number[]).includes(n) ? n : 1;
}

/* -------------------------------------------------------- saving as a picture */

/**
 * Breaks text into lines no wider than `max`, using `measure` for the width of a piece of text.
 * Existing line breaks are kept; a word longer than a line is cut where it must be.
 */
export function wrapLines(text: string, max: number, measure: (s: string) => number): string[] {
  const out: string[] = [];
  for (const para of text.replace(/\r\n?/g, '\n').split('\n')) {
    let line = '';
    for (const word of para.split(/\s+/).filter(Boolean)) {
      const tryLine = line ? `${line} ${word}` : word;
      if (measure(tryLine) <= max) {
        line = tryLine;
        continue;
      }
      if (line) out.push(line);
      // A single word wider than the line: cut it into pieces that fit.
      let rest = word;
      while (measure(rest) > max && rest.length > 1) {
        let cut = rest.length - 1;
        while (cut > 1 && measure(rest.slice(0, cut)) > max) cut--;
        out.push(rest.slice(0, cut));
        rest = rest.slice(cut);
      }
      line = rest;
    }
    out.push(line);
  }
  return out;
}

/** Where each item is drawn in a picture `width` pixels wide, and how tall the picture is. */
export function pictureLayout(items: readonly BoardItem[], heights: ReadonlyMap<number, number>, width: number): { height: number; boxes: (Box & { item: BoardItem })[] } {
  const boxes = items.map((item) => ({ item, x: item.x * width, y: item.y * width, w: item.w * width, h: (heights.get(item.index) ?? estimatedHeight(item)) * width }));
  return { height: Math.round(boardHeight(items, heights) * width), boxes };
}

/* ------------------------------------------------------------------ editing */

function boardSeq(doc: Parameters<Parameters<typeof editFrontmatter>[1]>[0], create: boolean): YAMLSeq | undefined {
  let seq = doc.get('board', true);
  if (!isSeq(seq)) {
    if (!create) return undefined;
    doc.set('board', doc.createNode([]));
    seq = doc.get('board', true);
  }
  return isSeq(seq) ? seq : undefined;
}

/** The `index`-th key/value entry of the list (the same numbering as `boardOf`). */
function nthEntry(seq: YAMLSeq, index: number): YAMLMap | undefined {
  return seq.items.filter((i): i is YAMLMap => isMap(i))[index];
}

const FIELDS = ['image', 'color', 'quote', 'source', 'page', 'caption', 'note', 'tint'] as const;

function dataToYaml(d: Partial<BoardData>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (d.kind === 'image' && d.image?.trim()) out.image = d.image.trim().replace(/^!?\[\[|\]\]$/g, '');
  else if (d.kind === 'color') {
    const c = cleanColor(d.color);
    if (c) out.color = c;
  } else if (d.kind === 'quote' && d.quote?.trim()) out.quote = d.quote.trim();
  else if (d.kind === 'page' && d.page?.trim()) out.page = `[[${d.page.trim().replace(/^\[\[|\]\]$/g, '')}]]`;
  else if (d.kind === 'note' && d.note?.trim()) {
    out.note = d.note.trim();
    const tint = cleanColor(d.tint);
    if (tint) out.tint = tint;
  }
  if (d.kind === 'quote' && d.source?.trim()) out.source = d.source.trim();
  if ((d.kind === 'image' || d.kind === 'color') && d.caption?.trim()) out.caption = d.caption.trim();
  const h = d.kind === 'color' ? (d.h ?? d.w ?? 0.25) : d.kind === 'image' ? d.h : undefined;
  const p = place({ x: d.x ?? 0.05, y: d.y ?? 0.05, w: d.w ?? 0.25, ...(h !== undefined ? { h } : {}) });
  out.x = p.x;
  out.y = p.y;
  out.w = p.w;
  if (p.h !== undefined) out.h = p.h;
  return out;
}

/**
 * Pins a new item at the end of the list (so on top). The page becomes a board if it was not one.
 * The rest of the header, comments included, stays as it was written.
 */
export function addItem(source: string, data: BoardData): string {
  return editFrontmatter(source, (doc) => {
    if (!doc.has('moodboard')) doc.set('moodboard', true);
    boardSeq(doc, true)!.items.push(doc.createNode(dataToYaml(data)) as never);
  });
}

/**
 * Changes some fields of one item in place (comments and the other fields stay). A field set to
 * undefined or to empty text is removed. With `raise`, the item also moves to the end of the list,
 * which puts it on top.
 */
export function changeItem(source: string, index: number, patch: Partial<BoardData>, raise = false): string {
  return editFrontmatter(source, (doc) => {
    const seq = boardSeq(doc, false);
    const entry = seq && nthEntry(seq, index);
    if (!seq || !entry) return;
    const current = readItem(entry.toJSON() as Record<string, unknown>, index);
    const geometry = place({
      x: patch.x ?? current?.x ?? 0.05,
      y: patch.y ?? current?.y ?? 0.05,
      w: patch.w ?? current?.w ?? 0.25,
      ...(patch.h !== undefined || current?.h !== undefined ? { h: patch.h ?? current?.h } : {}),
    });
    for (const k of ['x', 'y', 'w'] as const) if (k in patch || patch.w !== undefined) entry.set(k, geometry[k]);
    if ('h' in patch && patch.h === undefined && current?.kind !== 'color') entry.delete('h'); // a picture back to its own shape
    else if ('h' in patch && geometry.h !== undefined) entry.set('h', geometry.h);
    for (const k of FIELDS) {
      if (!(k in patch)) continue;
      const v = patch[k];
      if (v === undefined || (typeof v === 'string' && !v.trim())) entry.delete(k);
      else if (k === 'color' || k === 'tint') {
        const c = cleanColor(v);
        if (c) entry.set(k, c);
      } else if (k === 'page') entry.set('page', `[[${String(v).trim().replace(/^\[\[|\]\]$/g, '')}]]`);
      else entry.set(k, String(v).trim());
    }
    if (raise && seq.items[seq.items.length - 1] !== entry) {
      seq.items.splice(seq.items.indexOf(entry), 1);
      seq.items.push(entry);
    }
  });
}

export function removeItem(source: string, index: number): string {
  return editFrontmatter(source, (doc) => {
    const seq = boardSeq(doc, false);
    const entry = seq && nthEntry(seq, index);
    if (!seq || !entry) return;
    seq.items.splice(seq.items.indexOf(entry), 1);
    if (seq.items.length === 0) doc.delete('board');
  });
}

/** Splits a quote typed in one box: a last line that starts with a dash is who said it. */
export function splitQuote(input: string): { quote: string; source?: string } {
  const lines = input.trim().split(/\r?\n/);
  const last = lines.length > 1 ? /^\s*(?:—|–|--|-)\s*(.+?)\s*$/.exec(lines[lines.length - 1]!) : null;
  if (last) return { quote: lines.slice(0, -1).join('\n').trim(), source: last[1]! };
  return { quote: lines.join('\n').trim() };
}
