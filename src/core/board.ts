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
 *
 * Positions and sizes are fractions of the board's width, so the board looks the same on a wide
 * screen and a narrow one (`y` is measured downwards in the same unit, so the board grows as you
 * pin things lower). Items later in the list lie on top of earlier ones. Only a picture's width is
 * stored; its height follows the picture. Only colours have a `h`.
 */
import { isMap, isSeq, type YAMLMap, type YAMLSeq } from 'yaml';
import type { Page } from './types';
import { editFrontmatter, findWikiLinks, parseLinkText } from './parse';

export type BoardKind = 'image' | 'color' | 'quote' | 'page';

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
  /** Only for colours. */
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
  const caption = text(o.caption);
  if (image) {
    const item: BoardItem = { index, kind: 'image', image, ...place(base) };
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
  if (item.kind === 'image') return item.w * 0.75;
  if (item.kind === 'quote') return 0.14;
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

const FIELDS = ['image', 'color', 'quote', 'source', 'page', 'caption'] as const;

function dataToYaml(d: Partial<BoardData>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (d.kind === 'image' && d.image?.trim()) out.image = d.image.trim().replace(/^!?\[\[|\]\]$/g, '');
  else if (d.kind === 'color') {
    const c = cleanColor(d.color);
    if (c) out.color = c;
  } else if (d.kind === 'quote' && d.quote?.trim()) out.quote = d.quote.trim();
  else if (d.kind === 'page' && d.page?.trim()) out.page = `[[${d.page.trim().replace(/^\[\[|\]\]$/g, '')}]]`;
  if (d.kind === 'quote' && d.source?.trim()) out.source = d.source.trim();
  if ((d.kind === 'image' || d.kind === 'color') && d.caption?.trim()) out.caption = d.caption.trim();
  const p = place({ x: d.x ?? 0.05, y: d.y ?? 0.05, w: d.w ?? 0.25, ...(d.kind === 'color' ? { h: d.h ?? d.w ?? 0.25 } : {}) });
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
    if ('h' in patch && geometry.h !== undefined) entry.set('h', geometry.h);
    for (const k of FIELDS) {
      if (!(k in patch)) continue;
      const v = patch[k];
      if (v === undefined || (typeof v === 'string' && !v.trim())) entry.delete(k);
      else if (k === 'color') {
        const c = cleanColor(v);
        if (c) entry.set('color', c);
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
