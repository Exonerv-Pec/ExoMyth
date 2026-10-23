/**
 * Maps: a page becomes a map when its header names an image with `map:`. Its `pins:` list places
 * markers on that image. Positions are fractions of the image (0 = left/top, 1 = right/bottom), so
 * they stay right when the picture is replaced by a larger copy. A pin can point to a page, carry a
 * label, and have the years it exists in (`from`, `to`, both included).
 *
 *   map: silver coast.svg
 *   pins:
 *     - page: "[[Rivertown]]"
 *       x: 0.42
 *       y: 0.63
 *       from: 300
 */
import type { Page } from './types';
import { editFrontmatter, findWikiLinks, parseLinkText } from './parse';

export interface Pin {
  /** Position of the pin in the `pins:` list; edits refer to pins by it. */
  index: number;
  /** Target page as written (without brackets), if the pin points to a page. */
  page?: string;
  label?: string;
  x: number;
  y: number;
  from?: number;
  to?: number;
}

export interface MapModel {
  /** Image file of the map, as written. */
  image: string;
  pins: Pin[];
}

/** The pin entries of a header value; anything that is not a key/value entry is ignored. */
function pinRecords(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.filter((p): p is Record<string, unknown> => !!p && typeof p === 'object' && !Array.isArray(p)) : [];
}

/** Number of pin entries, i.e. the index the next added pin will get. */
export function pinCount(page: Page): number {
  return pinRecords(page.frontmatter.pins).length;
}

function linkTarget(value: unknown): string | undefined {
  if (typeof value !== 'string' || !value.trim()) return undefined;
  const s = value.trim();
  const link = s.includes('[[') ? findWikiLinks(s)[0] : parseLinkText(s);
  return link?.target || undefined;
}

function year(value: unknown): number | undefined {
  if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
  if (typeof value === 'string' && /^\s*-?\d+\s*$/.test(value)) return Number(value);
  return undefined;
}

function fraction(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value) : value;
  return typeof n === 'number' && Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : undefined;
}

/** The map of a page, or undefined when the page is not a map. Invalid pins are skipped. */
export function mapOf(page: Page): MapModel | undefined {
  const raw = page.frontmatter.map;
  const image = typeof raw === 'string' ? raw.trim().replace(/^!?\[\[([^\]|]+).*$/, '$1').trim() : undefined;
  if (!image) return undefined;
  const pins: Pin[] = [];
  const list = pinRecords(page.frontmatter.pins);
  list.forEach((o, index) => {
    const x = fraction(o.x);
    const y = fraction(o.y);
    if (x === undefined || y === undefined) return;
    const pin: Pin = { index, x, y };
    const target = linkTarget(o.page);
    if (target) pin.page = target;
    if (typeof o.label === 'string' && o.label.trim()) pin.label = o.label.trim();
    const from = year(o.from);
    const to = year(o.to);
    if (from !== undefined) pin.from = from;
    if (to !== undefined) pin.to = to;
    pins.push(pin);
  });
  return { image, pins };
}

/** Whether a pin exists in `y` (pins without years always do). */
export function existsIn(pin: { from?: number; to?: number }, y: number): boolean {
  return (pin.from === undefined || y >= pin.from) && (pin.to === undefined || y <= pin.to);
}

/** The span of years mentioned by the pins, or undefined when none has years. */
export function yearSpan(pins: readonly Pin[]): { min: number; max: number } | undefined {
  const years = pins.flatMap((p) => [p.from, p.to]).filter((y): y is number => y !== undefined);
  if (years.length === 0) return undefined;
  return { min: Math.min(...years), max: Math.max(...years) };
}

/** What can be stored for a pin; missing fields are left out of the file. */
export interface PinData {
  page?: string;
  label?: string;
  x: number;
  y: number;
  from?: number;
  to?: number;
}

function toYaml(pin: PinData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (pin.page?.trim()) out.page = `[[${pin.page.trim().replace(/^\[\[|\]\]$/g, '')}]]`;
  if (pin.label?.trim()) out.label = pin.label.trim();
  out.x = Math.round(Math.min(1, Math.max(0, pin.x)) * 10000) / 10000;
  out.y = Math.round(Math.min(1, Math.max(0, pin.y)) * 10000) / 10000;
  if (pin.from !== undefined && Number.isFinite(pin.from)) out.from = Math.trunc(pin.from);
  if (pin.to !== undefined && Number.isFinite(pin.to)) out.to = Math.trunc(pin.to);
  return out;
}

/**
 * Applies `change` to the pin list in the header of `text` and writes it back, keeping the rest of
 * the header (comments, other fields) as it was. `change` receives the current pins in file order.
 */
export function updatePinsInText(text: string, change: (pins: PinData[]) => PinData[]): string {
  return editFrontmatter(text, (doc) => {
    const current = doc.toJS() as Record<string, unknown> | null;
    const pins: PinData[] = pinRecords(current?.pins).map((o) => {
        const d: PinData = { x: fraction(o.x) ?? 0.5, y: fraction(o.y) ?? 0.5 };
        const target = linkTarget(o.page);
        if (target) d.page = target;
        if (typeof o.label === 'string') d.label = o.label;
        const from = year(o.from);
        const to = year(o.to);
        if (from !== undefined) d.from = from;
        if (to !== undefined) d.to = to;
        return d;
      });
    const next = change(pins);
    if (next.length === 0) doc.delete('pins');
    else doc.set('pins', doc.createNode(next.map(toYaml)));
  });
}

export function addPin(text: string, pin: PinData): string {
  return updatePinsInText(text, (pins) => [...pins, pin]);
}

export function changePin(text: string, index: number, patch: Partial<PinData>): string {
  return updatePinsInText(text, (pins) =>
    pins.map((p, i) => {
      if (i !== index) return p;
      const next: PinData = { ...p, ...patch };
      for (const k of ['page', 'label', 'from', 'to'] as const) if (k in patch && patch[k] === undefined) delete next[k];
      return next;
    }),
  );
}

export function removePin(text: string, index: number): string {
  return updatePinsInText(text, (pins) => pins.filter((_, i) => i !== index));
}
