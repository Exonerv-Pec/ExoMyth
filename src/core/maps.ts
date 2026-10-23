/**
 * Maps: a page becomes a map when its header names an image with `map:`. Its `pins:` list places
 * markers on that image. Positions are fractions of the image (0 = left/top, 1 = right/bottom), so
 * they stay right when the picture is replaced by a larger copy. A pin can point to a page, carry a
 * label, and have the years it exists in (`from`, `to`, both included).
 *
 * `regions:` draws areas on the map (countries, forests, flooded land): a polygon of points (the same
 * fractions), with an optional page, label, colour and years. Pins and regions can be put on named
 * `layer`s (politics, terrain…) that are switched on and off together.
 *
 *   map: silver coast.svg
 *   pins:
 *     - page: "[[Rivertown]]"
 *       x: 0.42
 *       y: 0.63
 *       from: 300
 */
import { isMap, isSeq, type Document, type YAMLMap, type YAMLSeq } from 'yaml';
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
  layer?: string;
}

export interface Region {
  /** Position in the `regions:` list; edits refer to regions by it. */
  index: number;
  page?: string;
  label?: string;
  layer?: string;
  /** A colour such as `#a86214`; without one the region takes its page's folder colour. */
  color?: string;
  /** Corners of the area, as fractions of the picture, in drawing order. */
  points: [number, number][];
  from?: number;
  to?: number;
}

export interface MapModel {
  /** Image file of the map, as written. */
  image: string;
  pins: Pin[];
  regions: Region[];
}

function nonEmpty(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function colour(value: unknown): string | undefined {
  return typeof value === 'string' && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(value.trim()) ? value.trim() : undefined;
}

/** Points of a region: pairs of fractions; anything else is skipped. */
function points(value: unknown): [number, number][] {
  if (!Array.isArray(value)) return [];
  const out: [number, number][] = [];
  for (const p of value) {
    if (!Array.isArray(p) || p.length < 2) continue;
    const x = fraction(p[0]);
    const y = fraction(p[1]);
    if (x !== undefined && y !== undefined) out.push([x, y]);
  }
  return out;
}

/** The region entries of a header value. */
function regionRecords(value: unknown): Record<string, unknown>[] {
  return pinRecords(value);
}

/** Number of region entries, i.e. the index the next added region will get. */
export function regionCount(page: Page): number {
  return regionRecords(page.frontmatter.regions).length;
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
  const regions: Region[] = [];
  regionRecords(page.frontmatter.regions).forEach((o, index) => {
    const pts = points(o.points);
    if (pts.length < 3) return;
    const region: Region = { index, points: pts };
    const target = linkTarget(o.page);
    if (target) region.page = target;
    const label = nonEmpty(o.label);
    if (label) region.label = label;
    const layer = nonEmpty(o.layer);
    if (layer) region.layer = layer;
    const c = colour(o.color);
    if (c) region.color = c;
    const from = year(o.from);
    const to = year(o.to);
    if (from !== undefined) region.from = from;
    if (to !== undefined) region.to = to;
    regions.push(region);
  });
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
    const layer = nonEmpty(o.layer);
    if (layer) pin.layer = layer;
    pins.push(pin);
  });
  return { image, pins, regions };
}

/** The named layers of a map, alphabetically ('' is not a layer: things without one are always shown). */
export function mapLayers(model: MapModel): string[] {
  const names = new Set<string>();
  for (const p of model.pins) if (p.layer) names.add(p.layer);
  for (const r of model.regions) if (r.layer) names.add(r.layer);
  return [...names].sort((a, b) => a.localeCompare(b));
}

/** The middle of a region, for its label (the centre of its area, or of its corners when it has none). */
export function regionCentre(points: readonly [number, number][]): [number, number] {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0; i < points.length; i++) {
    const [x0, y0] = points[i]!;
    const [x1, y1] = points[(i + 1) % points.length]!;
    const f = x0 * y1 - x1 * y0;
    a += f;
    cx += (x0 + x1) * f;
    cy += (y0 + y1) * f;
  }
  if (Math.abs(a) < 1e-9) {
    const n = points.length || 1;
    return [points.reduce((s, p) => s + p[0], 0) / n, points.reduce((s, p) => s + p[1], 0) / n];
  }
  return [cx / (3 * a), cy / (3 * a)];
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
  layer?: string;
}

function toYaml(pin: PinData): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (pin.page?.trim()) out.page = `[[${pin.page.trim().replace(/^\[\[|\]\]$/g, '')}]]`;
  if (pin.label?.trim()) out.label = pin.label.trim();
  out.x = Math.round(Math.min(1, Math.max(0, pin.x)) * 10000) / 10000;
  out.y = Math.round(Math.min(1, Math.max(0, pin.y)) * 10000) / 10000;
  if (pin.from !== undefined && Number.isFinite(pin.from)) out.from = Math.trunc(pin.from);
  if (pin.to !== undefined && Number.isFinite(pin.to)) out.to = Math.trunc(pin.to);
  if (pin.layer?.trim()) out.layer = pin.layer.trim();
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
        const layer = nonEmpty(o.layer);
        if (layer) d.layer = layer;
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
      for (const k of ['page', 'label', 'from', 'to', 'layer'] as const) if (k in patch && patch[k] === undefined) delete next[k];
      return next;
    }),
  );
}

export function removePin(text: string, index: number): string {
  return updatePinsInText(text, (pins) => pins.filter((_, i) => i !== index));
}

/* ------------------------------------------------------------------ regions */

/** What can be stored for a region; missing fields are left out of the file. */
export interface RegionData {
  page?: string;
  label?: string;
  layer?: string;
  color?: string;
  points: [number, number][];
  from?: number;
  to?: number;
}

const round = (n: number) => Math.round(Math.min(1, Math.max(0, n)) * 10000) / 10000;

function regionYaml(doc: Document, r: RegionData): unknown {
  const out: Record<string, unknown> = {};
  if (r.page?.trim()) out.page = `[[${r.page.trim().replace(/^\[\[|\]\]$/g, '')}]]`;
  if (r.label?.trim()) out.label = r.label.trim();
  if (r.layer?.trim()) out.layer = r.layer.trim();
  const c = colour(r.color);
  if (c) out.color = c;
  if (r.from !== undefined && Number.isFinite(r.from)) out.from = Math.trunc(r.from);
  if (r.to !== undefined && Number.isFinite(r.to)) out.to = Math.trunc(r.to);
  const node = doc.createNode(out) as YAMLMap;
  // Corners stay on one line: [[0.1, 0.2], [0.3, 0.4], ...]
  const pts = doc.createNode(r.points.map(([x, y]) => [round(x), round(y)])) as YAMLSeq;
  pts.flow = true;
  node.set('points', pts);
  return node;
}

/** The `regions:` list of a header (created when asked for). */
function regionsSeq(doc: Document, create: boolean): YAMLSeq | undefined {
  let seq = doc.get('regions', true);
  if (!isSeq(seq)) {
    if (!create) return undefined;
    doc.set('regions', doc.createNode([]));
    seq = doc.get('regions', true);
  }
  return isSeq(seq) ? seq : undefined;
}

/** The `index`-th key/value entry of the list (the same numbering as `mapOf`). */
function nthEntry(seq: YAMLSeq, index: number): YAMLMap | undefined {
  return seq.items.filter((i): i is YAMLMap => isMap(i))[index];
}

/** Adds a region at the end of the list; everything already in the header stays as written. */
export function addRegion(text: string, region: RegionData): string {
  return editFrontmatter(text, (doc) => {
    regionsSeq(doc, true)!.items.push(regionYaml(doc, region) as never);
  });
}

/** Changes some fields of one region in place (comments and other fields stay); undefined removes a field. */
export function changeRegion(text: string, index: number, patch: Partial<RegionData>): string {
  return editFrontmatter(text, (doc) => {
    const seq = regionsSeq(doc, false);
    const entry = seq && nthEntry(seq, index);
    if (!entry) return;
    for (const [k, v] of Object.entries(patch) as [keyof RegionData, unknown][]) {
      if (v === undefined || (typeof v === 'string' && !v.trim())) {
        entry.delete(k);
      } else if (k === 'points') {
        const pts = doc.createNode((v as [number, number][]).map(([x, y]) => [round(x), round(y)])) as YAMLSeq;
        pts.flow = true;
        entry.set('points', pts);
      } else if (k === 'page') {
        entry.set('page', `[[${String(v).trim().replace(/^\[\[|\]\]$/g, '')}]]`);
      } else if (k === 'color') {
        const c = colour(v);
        if (c) entry.set('color', c);
        else entry.delete('color');
      } else if (k === 'from' || k === 'to') {
        if (Number.isFinite(v)) entry.set(k, Math.trunc(v as number));
      } else {
        entry.set(k, String(v).trim());
      }
    }
  });
}

export function removeRegion(text: string, index: number): string {
  return editFrontmatter(text, (doc) => {
    const seq = regionsSeq(doc, false);
    const entry = seq && nthEntry(seq, index);
    if (!seq || !entry) return;
    seq.items.splice(seq.items.indexOf(entry), 1);
    if (seq.items.length === 0) doc.delete('regions');
  });
}
