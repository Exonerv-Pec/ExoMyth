import { describe, expect, it } from 'vitest';
import { parsePage } from '../src/core/parse';
import {
  existsIn,
  formatYears,
  pageYears,
  parseYear,
  setYearsInText,
  timelineModel,
  worldYearSpan,
  yearTicks,
} from '../src/core/years';

const page = (path: string, header: string, body = 'Text.') => parsePage(path, `---\n${header}\n---\n${body}\n`, 1);

describe('page years', () => {
  it('reads whole years from numbers and text', () => {
    expect(parseYear(412)).toBe(412);
    expect(parseYear('412')).toBe(412);
    expect(parseYear('412 AE')).toBe(412);
    expect(parseYear('-50')).toBe(-50);
    expect(parseYear('−50')).toBe(-50);
    expect(parseYear(41.7)).toBe(41);
    expect(parseYear('4.5')).toBeUndefined();
    expect(parseYear('spring')).toBeUndefined();
    expect(parseYear(null)).toBeUndefined();
  });

  it('understands from/to and the words writers use', () => {
    expect(pageYears(page('a.md', 'from: 371\nto: 430'))).toMatchObject({ from: 371, to: 430, fromKey: 'from', toKey: 'to' });
    expect(pageYears(page('a.md', 'born: 412\ndied: "455 AE"'))).toMatchObject({ from: 412, to: 455, fromKey: 'born', toKey: 'died' });
    expect(pageYears(page('a.md', 'Founded: 300'))).toMatchObject({ from: 300, fromKey: 'Founded' });
    expect(pageYears(page('a.md', 'родился: 400\nумер: 460'))).toMatchObject({ from: 400, to: 460 });
    expect(pageYears(page('a.md', 'year: 430'))).toMatchObject({ from: 430, to: 430, pointKey: 'year' });
    expect(pageYears(page('a.md', 'years: 429-430'))).toMatchObject({ from: 429, to: 430, pointKey: 'years' });
    expect(pageYears(page('a.md', 'years: "-20 – -5"'))).toMatchObject({ from: -20, to: -5 });
    expect(pageYears(page('a.md', 'from: 500\nto: 400'))).toMatchObject({ from: 400, to: 500 });
  });

  it('ignores pages without usable years', () => {
    expect(pageYears(page('a.md', 'tags: [x]'))).toBeUndefined();
    expect(pageYears(page('a.md', 'born: long ago'))).toBeUndefined();
    expect(pageYears(parsePage('a.md', 'No header.', 1))).toBeUndefined();
  });

  it('tells whether something exists in a year', () => {
    expect(existsIn({ from: 400, to: 410 }, 405)).toBe(true);
    expect(existsIn({ from: 400, to: 410 }, 411)).toBe(false);
    expect(existsIn({ from: 400 }, 9999)).toBe(true);
    expect(existsIn({ to: 400 }, -9999)).toBe(true);
    expect(existsIn(undefined, 1)).toBe(true);
  });

  it('formats spans', () => {
    expect(formatYears({ from: 371, to: 430 })).toBe('371 – 430');
    expect(formatYears({ from: 430, to: 430 })).toBe('430');
    expect(formatYears({ from: 412 })).toBe('412 –');
    expect(formatYears({ to: 405 })).toBe('– 405');
  });
});

describe('writing years', () => {
  it('adds from/to to a page without years and keeps the rest of the header', () => {
    const text = '---\n# who she is\ntags: [hero]\n---\nBody\n';
    const out = setYearsInText(text, { from: 412, to: 455 });
    expect(out).toBe('---\n# who she is\ntags: [hero]\nfrom: 412\nto: 455\n---\nBody\n');
  });

  it('keeps the fields a page already uses', () => {
    const out = setYearsInText('---\nborn: 412\n---\nB', { from: 410, to: 470 });
    expect(out).toContain('born: 410');
    expect(out).toContain('to: 470');
    expect(setYearsInText('---\nborn: 412\ndied: 470\n---\nB', { from: 412 })).toBe('---\nborn: 412\n---\nB');
  });

  it('writes a single year as year:, and splits it when it becomes a span', () => {
    expect(setYearsInText('---\ntags: [event]\n---\n', { from: 430, to: 430 })).toContain('year: 430');
    const span = setYearsInText('---\nyear: 430\n---\n', { from: 429, to: 431 });
    expect(span).toBe('---\nfrom: 429\nto: 431\n---\n');
    expect(setYearsInText('---\nyears: 429-430\n---\n', { from: 431, to: 431 })).toBe('---\nyear: 431\n---\n');
  });

  it('removes years and the header when nothing is left', () => {
    expect(setYearsInText('---\nfrom: 1\nto: 2\n---\nBody', {})).toBe('Body');
  });

  it('keeps Windows line endings', () => {
    expect(setYearsInText('---\r\ntags: [a]\r\n---\r\nB', { from: 5 })).toBe('---\r\ntags: [a]\r\nfrom: 5\r\n---\r\nB');
  });
});

describe('the world over time', () => {
  const pages = [
    page('Characters/Kira.md', 'born: 412'),
    page('Characters/Arn.md', 'born: 350\ndied: 430'),
    page('Events/Siege.md', 'years: 429-430'),
    page('Events/Flood.md', 'year: 405'),
    page('Welcome.md', 'tags: [intro]'),
    page('Maps/Coast.md', 'map: coast.svg\npins:\n  - label: Tower\n    x: 0.1\n    y: 0.1\n    from: 210\n    to: 405'),
    page('Note.md', 'from: 500'),
  ];

  it('spans every page and map pin', () => {
    expect(worldYearSpan(pages)).toEqual({ min: 210, max: 500 });
    expect(worldYearSpan([page('a.md', 'tags: [x]')])).toBeUndefined();
  });

  it('groups dated pages by folder (root last) and orders them by start', () => {
    const m = timelineModel(pages);
    expect(m.groups.map((g) => g.group)).toEqual(['Characters', 'Events', '']);
    expect(m.groups[0]!.items.map((i) => i.title)).toEqual(['Arn', 'Kira']);
    expect(m.groups[1]!.items.map((i) => [i.title, i.point])).toEqual([
      ['Flood', true],
      ['Siege', false],
    ]);
    expect(m.span).toEqual({ min: 350, max: 500 });
    expect(m.undated).toBe(2);
  });

  it('picks round, readable axis steps', () => {
    expect(yearTicks(371, 430, 10).step).toBe(10);
    expect(yearTicks(371, 430, 10).ticks).toEqual([380, 390, 400, 410, 420, 430]);
    expect(yearTicks(0, 3000, 0.1).step).toBe(1000);
    expect(yearTicks(1, 3, 100).step).toBe(1);
    expect(yearTicks(-25, 25, 2, 40).ticks).toEqual([-20, 0, 20]);
  });
});
