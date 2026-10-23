/**
 * Years of pages: when a character lived, when a city was founded, when an event happened. They
 * are read from the page header, so a writer can use the words that fit the page:
 *
 *   from: 371          to: 430          (any page)
 *   born: 412          died: 455        (characters)
 *   founded: 300       destroyed: 431   (places, organizations)
 *   year: 430                           (an event on one year)
 *   years: 429-430                      (an event over several years)
 *
 * Only whole years are understood ("412", "412 AE", "-50"); anything else is ignored. A page
 * with a start but no end still exists (it is ongoing); a page without years always exists.
 */
import type { Page } from './types';
import { editFrontmatter } from './parse';
import { compareText } from './names';
import { mapOf } from './maps';

const START_KEYS = ['from', 'born', 'founded', 'built', 'established', 'formed', 'began', 'start', 'родился', 'родилась', 'основан', 'основана', 'основано', 'построен', 'построена'];
const END_KEYS = ['to', 'died', 'dissolved', 'destroyed', 'fell', 'abandoned', 'ended', 'end', 'умер', 'умерла', 'погиб', 'погибла', 'распущен', 'распущена', 'разрушен', 'разрушена'];
const POINT_KEYS = ['year', 'years', 'год', 'годы'];

export interface PageYears {
  from?: number;
  to?: number;
  /** The header field the start came from (as written), so edits update the same field. */
  fromKey?: string;
  toKey?: string;
  /** The years came from `year:`/`years:`, one field for both ends. */
  pointKey?: string;
}

/** A whole year from a header value, or undefined. */
export function parseYear(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? Math.trunc(value) : undefined;
  if (typeof value !== 'string') return undefined;
  const m = /^\s*([-−]?\d{1,7})(?![\d.,])/.exec(value);
  return m ? Number(m[1]!.replace('−', '-')) : undefined;
}

/** "429-430", "429 – 430", "429..430": both ends of a span written in one field. */
function parseRange(value: unknown): [number, number] | undefined {
  if (typeof value !== 'string') return undefined;
  const m = /^\s*([-−]?\d{1,7})\s*(?:-|–|—|\.\.)\s*([-−]?\d{1,7})\b/.exec(value);
  if (!m) return undefined;
  return [Number(m[1]!.replace('−', '-')), Number(m[2]!.replace('−', '-'))];
}

function findKey(fm: Record<string, unknown>, names: readonly string[]): string | undefined {
  const keys = Object.keys(fm);
  for (const name of names) {
    const k = keys.find((key) => key.trim().toLocaleLowerCase() === name);
    if (k !== undefined && (parseYear(fm[k]) !== undefined || parseRange(fm[k]))) return k;
  }
  return undefined;
}

/** The years of a page, or undefined when its header has none. */
export function pageYears(page: Pick<Page, 'frontmatter'>): PageYears | undefined {
  return yearsOf(page.frontmatter);
}

function yearsOf(fm: Record<string, unknown>): PageYears | undefined {
  const out: PageYears = {};
  const fromKey = findKey(fm, START_KEYS);
  const toKey = findKey(fm, END_KEYS);
  if (fromKey !== undefined) {
    out.from = parseYear(fm[fromKey]);
    out.fromKey = fromKey;
  }
  if (toKey !== undefined) {
    out.to = parseYear(fm[toKey]);
    out.toKey = toKey;
  }
  if (out.from === undefined && out.to === undefined) {
    const pointKey = findKey(fm, POINT_KEYS);
    if (pointKey === undefined) return undefined;
    const range = parseRange(fm[pointKey]);
    const single = parseYear(fm[pointKey]);
    out.from = range ? range[0] : single;
    out.to = range ? range[1] : single;
    out.pointKey = pointKey;
  }
  if (out.from !== undefined && out.to !== undefined && out.from > out.to) [out.from, out.to] = [out.to, out.from];
  return out;
}

/** Whether something with these years exists in year `y` (no years: always). */
export function existsIn(span: { from?: number; to?: number } | undefined, y: number): boolean {
  if (!span) return true;
  return (span.from === undefined || y >= span.from) && (span.to === undefined || y <= span.to);
}

/** "371 – 430", "412 –", "– 405", "430". */
export function formatYears(span: { from?: number; to?: number }): string {
  const { from, to } = span;
  if (from !== undefined && to !== undefined) return from === to ? String(from) : `${from} – ${to}`;
  if (from !== undefined) return `${from} –`;
  if (to !== undefined) return `– ${to}`;
  return '';
}

/**
 * Writes the years of a page into its header. Fields the page already uses are kept (a character
 * keeps `born:`/`died:`); new years go into `from:`/`to:`, or `year:` for a single year. An
 * undefined end removes that field.
 */
export function setYearsInText(text: string, span: { from?: number; to?: number }): string {
  return editFrontmatter(text, (doc) => {
    const fm = (doc.toJS() ?? {}) as Record<string, unknown>;
    const now = yearsOf(fm);
    let { from, to } = span;
    if (from !== undefined && to !== undefined && from > to) [from, to] = [to, from];
    const single = from !== undefined && from === to;

    if (now?.pointKey !== undefined) doc.delete(now.pointKey);
    if (single && (now === undefined || now.pointKey !== undefined)) {
      doc.set(now?.pointKey && !/s$|ы$/.test(now.pointKey) ? now.pointKey : 'year', from);
      return;
    }
    const fromKey = now?.fromKey ?? 'from';
    const toKey = now?.toKey ?? 'to';
    if (from === undefined) doc.delete(fromKey);
    else doc.set(fromKey, from);
    if (to === undefined) doc.delete(toKey);
    else doc.set(toKey, to);
  });
}

/* ------------------------------------------------------------- the whole world */

/** The earliest and latest year mentioned by pages and map pins, or undefined when there are none. */
export function worldYearSpan(pages: readonly Page[]): { min: number; max: number } | undefined {
  let min = Infinity;
  let max = -Infinity;
  const add = (y: number | undefined) => {
    if (y === undefined) return;
    if (y < min) min = y;
    if (y > max) max = y;
  };
  for (const page of pages) {
    const y = pageYears(page);
    if (y) {
      add(y.from);
      add(y.to);
    }
    for (const pin of mapOf(page)?.pins ?? []) {
      add(pin.from);
      add(pin.to);
    }
  }
  return min <= max ? { min, max } : undefined;
}

export interface TimelineItem {
  path: string;
  title: string;
  /** Top-level folder ('' for the root): the row group and the colour. */
  group: string;
  from?: number;
  to?: number;
  /** One year only (an event). */
  point: boolean;
}

export interface TimelineGroup {
  group: string;
  items: TimelineItem[];
}

export interface TimelineModel {
  groups: TimelineGroup[];
  /** Earliest and latest year on the timeline (undefined when no page has years). */
  span?: { min: number; max: number };
  /** Pages without years (not on the timeline). */
  undated: number;
}

function topFolder(path: string): string {
  const i = path.indexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

/**
 * Pages with years, grouped by top-level folder (alphabetically, the root last) and ordered by
 * when they start, so the timeline reads top-down in time within each group.
 */
export function timelineModel(pages: readonly Page[]): TimelineModel {
  const byGroup = new Map<string, TimelineItem[]>();
  let undated = 0;
  let min = Infinity;
  let max = -Infinity;
  for (const page of pages) {
    const y = pageYears(page);
    if (!y || (y.from === undefined && y.to === undefined)) {
      undated++;
      continue;
    }
    const item: TimelineItem = { path: page.path, title: page.title, group: topFolder(page.path), point: y.from !== undefined && y.from === y.to };
    if (y.from !== undefined) item.from = y.from;
    if (y.to !== undefined) item.to = y.to;
    for (const v of [y.from, y.to]) {
      if (v === undefined) continue;
      min = Math.min(min, v);
      max = Math.max(max, v);
    }
    const list = byGroup.get(item.group) ?? byGroup.set(item.group, []).get(item.group)!;
    list.push(item);
  }
  const start = (i: TimelineItem) => i.from ?? i.to ?? 0;
  const groups = [...byGroup.entries()]
    .sort(([a], [b]) => (a === '' ? 1 : b === '' ? -1 : compareText(a, b)))
    .map(([group, items]) => ({
      group,
      items: items.sort((a, b) => start(a) - start(b) || (a.to ?? Infinity) - (b.to ?? Infinity) || compareText(a.title, b.title)),
    }));
  const model: TimelineModel = { groups, undated };
  if (min <= max) model.span = { min, max };
  return model;
}

/**
 * Years to label on a timeline axis: a round step (1, 2, 5, 10, 20, 50, …) wide enough that
 * labels are at least `minGap` pixels apart at `pxPerYear`.
 */
export function yearTicks(min: number, max: number, pxPerYear: number, minGap = 64): { step: number; ticks: number[] } {
  let step = 1;
  for (let mag = 1; ; mag *= 10) {
    const s = [1, 2, 5].map((m) => m * mag).find((c) => c * pxPerYear >= minGap);
    if (s !== undefined) {
      step = s;
      break;
    }
    if (mag > 1e7) {
      step = mag;
      break;
    }
  }
  const ticks: number[] = [];
  for (let y = Math.ceil(min / step) * step; y <= max; y += step) ticks.push(y);
  return { step, ticks };
}
