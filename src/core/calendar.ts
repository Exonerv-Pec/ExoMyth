/**
 * Calendars: the months, weeks and eras a world counts time in, and dates written with them.
 *
 * A world's calendar is a page with `calendar: true` in its header (the first one, by path):
 *
 *   calendar: true
 *   months:
 *     - Frostmonth: 30          # a month and its days
 *     - name: Thaw
 *       days: 28
 *     - Seedtime                # 30 days when not said
 *   week: [Moonday, Tideday, Stoneday, Fireday, Restday]
 *   eras:
 *     - name: Age of the River
 *       short: AR
 *       start: 1                # the year (counted from the start of time) that is year 1 of the era
 *
 * Without such a page, years have the twelve months of the common calendar (365 days, no leap years).
 *
 * Dates in page headers can then be written as people write them: `412`, `412 AR`, `Frostmonth 412`,
 * `3 Frostmonth 412`, `Frostmonth 3, 412`, `412-01-03`. Inside the app a date is a number: the year
 * plus the part of it gone by (day 1 of a year is the whole year), so timelines and "by year" views
 * keep working with numbers. Nothing here knows about the interface.
 */
import type { Page } from './types';

export interface Month {
  name: string;
  days: number;
  /** Other ways the month is written (a short name, a grammatical form), for reading dates. */
  aliases?: string[];
}

export interface Era {
  name: string;
  /** What follows a year of this era, like `AR`; the name when there is none. */
  short?: string;
  /** The year, counted from the start of time, that is year 1 of this era. */
  start: number;
}

export interface Calendar {
  months: Month[];
  /** Names of the days of the week, from the first. Empty: no weeks. */
  week: string[];
  /** In the order they start. */
  eras: Era[];
  /** The page the calendar comes from; none for the common calendar. */
  path?: string;
}

export type Precision = 'year' | 'month' | 'day';

/** A date: a number of years (see above), and how much of it was written. */
export interface When {
  value: number;
  precision: Precision;
}

const EN_MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const RU_MONTHS = ['январь', 'февраль', 'март', 'апрель', 'май', 'июнь', 'июль', 'август', 'сентябрь', 'октябрь', 'ноябрь', 'декабрь'];
/** "3 марта": the form a Russian date uses. */
const RU_OF = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const DAYS = [31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];

/** The common calendar: twelve months, 365 days, month names in English or Russian. */
export function commonCalendar(lang: 'en' | 'ru' = 'en'): Calendar {
  const months = DAYS.map((days, i) => {
    const en = EN_MONTHS[i]!;
    const ru = RU_MONTHS[i]!;
    const main = lang === 'ru' ? RU_OF[i]! : en;
    return { name: main, days, aliases: [en, en.slice(0, 3), ru, RU_OF[i]!, ru.slice(0, 3)].filter((a) => a.toLocaleLowerCase() !== main.toLocaleLowerCase()) };
  });
  return { months, week: [], eras: [] };
}

export function daysInYear(cal: Calendar): number {
  return cal.months.reduce((n, m) => n + m.days, 0) || 1;
}

/* ------------------------------------------------------------- reading a calendar */

const TRUE = /^(true|yes|да|calendar|календарь)$/i;

/** Whether a page is a calendar (its header says `calendar: true`). */
export function isCalendar(page: Pick<Page, 'frontmatter'>): boolean {
  const v = page.frontmatter.calendar;
  return v === true || (typeof v === 'string' && TRUE.test(v.trim()));
}

const text = (v: unknown) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim() : '');
const count = (v: unknown, fallback: number) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isInteger(n) && n >= 1 && n <= 1000 ? n : fallback;
};
const yearNumber = (v: unknown) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && /^\s*[-−]?\d+\s*$/.test(v) ? Number(v.replace('−', '-')) : NaN;
  return Number.isInteger(n) ? n : undefined;
};

function readMonth(item: unknown): Month | undefined {
  if (typeof item === 'string' || typeof item === 'number') {
    const name = text(item);
    return name ? { name, days: 30 } : undefined;
  }
  if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
  const o = item as Record<string, unknown>;
  if ('name' in o) {
    const name = text(o.name);
    if (!name) return undefined;
    const month: Month = { name, days: count(o.days, 30) };
    const aliases = (Array.isArray(o.aliases) ? o.aliases : o.short !== undefined ? [o.short] : []).map(text).filter(Boolean);
    if (aliases.length) month.aliases = aliases;
    return month;
  }
  // `- Frostmonth: 30`
  const keys = Object.keys(o);
  if (keys.length !== 1) return undefined;
  const name = keys[0]!.trim();
  return name ? { name, days: count(o[keys[0]!], 30) } : undefined;
}

function readEra(item: unknown): Era | undefined {
  if (!item || typeof item !== 'object' || Array.isArray(item)) return undefined;
  const o = item as Record<string, unknown>;
  const name = text(o.name);
  const start = yearNumber(o.start);
  if (!name || start === undefined) return undefined;
  const era: Era = { name, start };
  const short = text(o.short);
  if (short) era.short = short;
  return era;
}

/** The calendar a page describes, or undefined when it is not a calendar or names no months. */
export function calendarOf(page: Pick<Page, 'frontmatter' | 'path'>): Calendar | undefined {
  if (!isCalendar(page)) return undefined;
  const fm = page.frontmatter;
  const months = (Array.isArray(fm.months) ? fm.months : []).map(readMonth).filter((m): m is Month => !!m);
  const week = (Array.isArray(fm.week) ? fm.week : []).map(text).filter(Boolean);
  const eras = (Array.isArray(fm.eras) ? fm.eras : []).map(readEra).filter((e): e is Era => !!e).sort((a, b) => a.start - b.start);
  if (months.length === 0 && eras.length === 0) return undefined;
  return { months: months.length ? months : commonCalendar().months, week, eras, path: page.path };
}

/** The calendar of a world: its first calendar page by path, or undefined (the common calendar). */
export function worldCalendar(pages: Iterable<Pick<Page, 'frontmatter' | 'path'>>): Calendar | undefined {
  let best: Calendar | undefined;
  for (const page of pages) {
    const cal = calendarOf(page);
    if (cal && (!best || page.path < best.path!)) best = cal;
  }
  return best;
}

/* ---------------------------------------------------------- the world's calendar */

let worldCal: Calendar | undefined;
let lang: 'en' | 'ru' = 'en';
let active: Calendar = commonCalendar(lang);

/**
 * Sets the open world's calendar (undefined: the common calendar). Pages, the timeline and the
 * panel all read and write dates through it. The world sets it whenever its pages change.
 */
export function useCalendar(cal: Calendar | undefined): void {
  worldCal = cal;
  active = cal ?? commonCalendar(lang);
}

/** The language the common calendar names its months in. */
export function useCalendarLanguage(next: 'en' | 'ru'): void {
  lang = next;
  if (!worldCal) active = commonCalendar(lang);
}

export function activeCalendar(): Calendar {
  return active;
}

/** Whether the world has a calendar of its own. */
export function hasOwnCalendar(): boolean {
  return !!worldCal;
}

/* ------------------------------------------------------------------ reading dates */

const fold = (s: string) => s.normalize('NFC').toLocaleLowerCase().replace(/ё/g, 'е');
const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
/** A name as whole words, not part of a longer word (letters of any script count). */
const wordRe = (name: string) => new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(fold(name))}(?=$|[^\\p{L}\\p{N}])`, 'u');

/** Finds the longest of `names` in `s`; returns its index and `s` without it. */
function findName(s: string, names: { i: number; name: string }[]): { i: number; rest: string } | undefined {
  const sorted = [...names].sort((a, b) => b.name.length - a.name.length);
  for (const { i, name } of sorted) {
    if (!name.trim()) continue;
    const m = wordRe(name).exec(s);
    if (m) return { i, rest: s.slice(0, m.index) + m[1] + ' ' + s.slice(m.index + m[0].length) };
  }
  return undefined;
}

function monthNames(cal: Calendar) {
  return cal.months.flatMap((m, i) => [m.name, ...(m.aliases ?? [])].map((name) => ({ i, name: fold(name) })));
}

function eraNames(cal: Calendar) {
  return cal.eras.flatMap((e, i) => [e.name, e.short ?? ''].filter(Boolean).map((name) => ({ i, name: fold(name) })));
}

/** Days of the year before month `m` (0-based). */
function daysBefore(cal: Calendar, m: number): number {
  let n = 0;
  for (let i = 0; i < m; i++) n += cal.months[i]!.days;
  return n;
}

/** The number for a year, month (0-based) and day (1-based). */
export function dateValue(year: number, month: number, day: number, cal: Calendar = active): number {
  return year + (daysBefore(cal, month) + day - 1) / daysInYear(cal);
}

/** Year, month (0-based) and day (1-based) of a date number. */
export function dateParts(value: number, cal: Calendar = active): { year: number; month: number; day: number } {
  const year = Math.floor(value + 1e-9);
  const total = daysInYear(cal);
  let d = Math.min(total - 1, Math.max(0, Math.round((value - year) * total)));
  let month = 0;
  while (month < cal.months.length - 1 && d >= cal.months[month]!.days) d -= cal.months[month++]!.days;
  return { year, month, day: d + 1 };
}

/**
 * Reads a date written in a page header, or undefined. A year alone is any whole number with
 * anything after it ignored, as before calendars ("412", "412 AE", "-50"); a month and a day must
 * be names or numbers the calendar knows.
 */
export function parseWhen(input: unknown, cal: Calendar = active): When | undefined {
  if (typeof input === 'number') return Number.isFinite(input) ? { value: Math.trunc(input), precision: 'year' } : undefined;
  if (input instanceof Date) {
    // YAML reads 2026-03-05 as a date of our own calendar: year, month and day as written.
    const y = input.getUTCFullYear();
    const m = input.getUTCMonth();
    const d = input.getUTCDate();
    return m < cal.months.length && d <= cal.months[m]!.days ? { value: dateValue(y, m, d, cal), precision: 'day' } : { value: y, precision: 'year' };
  }
  if (typeof input !== 'string') return undefined;
  let s = ` ${fold(input).replace(/−/g, '-')} `;

  // Year-month-day in numbers: 412-03-05, 412-03 (a month and a year).
  const iso = /^\s*(-?\d{1,7})-(\d{1,2})(?:-(\d{1,2}))?\s*$/.exec(s);
  if (iso) {
    const y = Number(iso[1]);
    const m = Number(iso[2]) - 1;
    const d = iso[3] === undefined ? undefined : Number(iso[3]);
    // "429-430" is two years, not a month.
    if (m >= 0 && m < cal.months.length && Number(iso[2]) < Math.abs(y) && (d === undefined || (d >= 1 && d <= cal.months[m]!.days))) {
      return d === undefined ? { value: dateValue(y, m, 1, cal), precision: 'month' } : { value: dateValue(y, m, d, cal), precision: 'day' };
    }
  }

  const era = findName(s, eraNames(cal));
  if (era) {
    // "Year 112 of the Second Age": with an era named, such words carry nothing.
    s = era.rest.replace(/(^|[^\p{L}])(year|of|the|in|год|года|году|г\.?)(?=$|[^\p{L}])/gu, '$1 ');
  }
  const month = findName(s, monthNames(cal));
  if (month) s = month.rest;
  // Words such as "year", "of the" and "год" carry nothing.
  const numbers = [...s.matchAll(/(^|[^\p{L}\p{N}])(-?\d{1,7})(?![\d.])/gu)].map((m) => Number(m[2]));
  if (!month) {
    // A year alone must come first, as before ("412 AE", but not "c. 412" or "the 3rd").
    const lead = /^\s*(-?\d{1,7})(?![\d.,])/.exec(s);
    if (!lead) return undefined;
    return { value: toAbsolute(Number(lead[1]), era ? cal.eras[era.i] : undefined), precision: 'year' };
  }
  if (numbers.length === 0) return undefined;
  const year = toAbsolute(numbers[numbers.length - 1]!, era ? cal.eras[era.i] : undefined);
  if (numbers.length === 1) return { value: dateValue(year, month.i, 1, cal), precision: 'month' };
  const day = numbers[0]!;
  if (day < 1 || day > cal.months[month.i]!.days) return undefined;
  return { value: dateValue(year, month.i, day, cal), precision: 'day' };
}

/** A year of an era as a year counted from the start of time. */
function toAbsolute(n: number, era: Era | undefined): number {
  return era ? era.start + n - 1 : n;
}

/**
 * Both ends of a span written in one field: "429-430", "429 – 430", "3 Frostmonth 429 – Thaw 430".
 * Undefined when the field holds one date.
 */
export function parseSpan(input: unknown, cal: Calendar = active): [When, When] | undefined {
  if (typeof input !== 'string') return undefined;
  const plain = /^\s*([-−]?\d{1,7})\s*(?:-|–|—|\.\.)\s*([-−]?\d{1,7})\s*(\D.*)?$/.exec(input);
  if (plain && !(Number(plain[2]!.replace('−', '-')) < Math.abs(Number(plain[1]!.replace('−', '-'))) && /^\s*[-−]?\d+-\d{1,2}(-\d{1,2})?\s*$/.test(input))) {
    // Two plain years, maybe with an era after them ("429-430 AR").
    const tail = plain[3] ?? '';
    const a = parseWhen(`${plain[1]} ${tail}`, cal);
    const b = parseWhen(`${plain[2]} ${tail}`, cal);
    if (a && b) return [a, b];
  }
  const parts = input.split(/\s*(?:–|—|\.\.)\s*|\s+-\s+/);
  if (parts.length !== 2) return undefined;
  const a = parseWhen(parts[0], cal);
  const b = parseWhen(parts[1], cal);
  return a && b ? [a, b] : undefined;
}

/* ------------------------------------------------------------------ writing dates */

/** A year as the world counts it: "412 AR" in an era, "412" otherwise (before the first era too). */
export function formatYear(year: number, cal: Calendar = active): string {
  const era = [...cal.eras].reverse().find((e) => year >= e.start);
  return era ? `${year - era.start + 1} ${era.short ?? era.name}` : String(year);
}

/** A date as it is written back: "412", "Frostmonth 412", "3 Frostmonth 412", with the era if any. */
export function formatWhen(when: When, cal: Calendar = active): string {
  const { year, month, day } = dateParts(when.value, cal);
  const y = formatYear(year, cal);
  if (when.precision === 'year') return y;
  const name = cal.months[month]?.name ?? String(month + 1);
  return when.precision === 'month' ? `${name} ${y}` : `${day} ${name} ${y}`;
}

/** The first moment after a date: the next year, month or day. */
export function endOf(when: When, cal: Calendar = active): number {
  if (when.precision === 'year') return Math.floor(when.value + 1e-9) + 1;
  const total = daysInYear(cal);
  if (when.precision === 'day') return when.value + 1 / total;
  const { year, month } = dateParts(when.value, cal);
  return dateValue(year, month, 1, cal) + cal.months[month]!.days / total;
}

/** Day of the week of a date (0 = the first day of `week`), counting from day 1 of year 1. */
export function weekday(value: number, cal: Calendar = active): number | undefined {
  if (!cal.week.length) return undefined;
  const { year, month, day } = dateParts(value, cal);
  const days = (year - 1) * daysInYear(cal) + daysBefore(cal, month) + day - 1;
  return ((days % cal.week.length) + cal.week.length) % cal.week.length;
}

/* ------------------------------------------------------------------ the axis */

export interface Tick {
  value: number;
  /** How long the stretch it labels is, in years (a year, or a month). */
  span: number;
  label: string;
  /** A year (or a month while months are shown). */
  major: boolean;
}

/**
 * Ticks for a timeline axis from `min` to `max` (in years) at `pxPerYear`: round numbers of
 * years, or every month of each year once the axis is wide enough for month names.
 */
export function axisTicks(min: number, max: number, pxPerYear: number, cal: Calendar = active, minGap = 64): Tick[] {
  const total = daysInYear(cal);
  // Months once an average month is wide enough; a very short one (a few festival days) keeps its
  // tick but goes without a name.
  if ((pxPerYear * (total / cal.months.length)) / total >= minGap && cal.months.length > 1) {
    const out: Tick[] = [];
    for (let y = Math.floor(min); y <= max; y++) {
      cal.months.forEach((m, i) => {
        const v = dateValue(y, i, 1, cal);
        const wide = (pxPerYear * m.days) / total >= minGap * 0.75;
        const label = i === 0 ? `${m.name} ${formatYear(y, cal)}` : wide ? m.name : '';
        if (v >= min && v <= max + 1) out.push({ value: v, span: m.days / total, label, major: i === 0 });
      });
    }
    return out;
  }
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
  const out: Tick[] = [];
  for (let y = Math.ceil(min / step) * step; y <= max; y += step) out.push({ value: y, span: 1, label: formatYear(y, cal), major: true });
  return out;
}
