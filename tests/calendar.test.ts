import { afterEach, describe, expect, it } from 'vitest';
import { parsePage } from '../src/core/parse';
import {
  axisTicks,
  calendarOf,
  commonCalendar,
  dateParts,
  dateValue,
  daysInYear,
  endOf,
  formatWhen,
  formatYear,
  parseSpan,
  parseWhen,
  useCalendar,
  weekday,
  worldCalendar,
} from '../src/core/calendar';
import { existsIn, formatYears, pageYears, setYearsInText, timelineModel } from '../src/core/years';
import { MemoryStorage } from '../src/core/storage';
import { Vault } from '../src/core/vault';

const CAL_PAGE = `---
calendar: true
months:
  - Frostmonth: 30
  - name: Thaw
    days: 28
    short: Th
  - Seedtime
  - Highsun: 40
week: [Moonday, Tideday, Stoneday, Fireday, Restday]
eras:
  - name: Second Age
    short: SA
    start: 301
  - name: First Age
    short: FA
    start: 1
---
# Calendar of the Coast
`;
const coast = calendarOf(parsePage('World/Calendar.md', CAL_PAGE, 1))!;

afterEach(() => useCalendar(undefined));

describe('a calendar page', () => {
  it('reads months in every way they are written, the week and the eras in order', () => {
    expect(coast.months).toEqual([
      { name: 'Frostmonth', days: 30 },
      { name: 'Thaw', days: 28, aliases: ['Th'] },
      { name: 'Seedtime', days: 30 },
      { name: 'Highsun', days: 40 },
    ]);
    expect(daysInYear(coast)).toBe(128);
    expect(coast.week).toHaveLength(5);
    expect(coast.eras.map((e) => e.short)).toEqual(['FA', 'SA']);
    expect(coast.path).toBe('World/Calendar.md');
  });

  it('is not a calendar without the flag, or with nothing in it', () => {
    expect(calendarOf(parsePage('a.md', '---\nmonths: [A]\n---\n', 1))).toBeUndefined();
    expect(calendarOf(parsePage('a.md', '---\ncalendar: true\n---\n', 1))).toBeUndefined();
    // Only eras: the common months.
    expect(calendarOf(parsePage('a.md', '---\ncalendar: true\neras:\n  - name: Age\n    start: 1\n---\n', 1))!.months).toHaveLength(12);
  });

  it('the world uses its first calendar page by path, never a template', async () => {
    const vault = await Vault.open(
      new MemoryStorage('cal', {
        'B.md': CAL_PAGE,
        'A.md': '---\ncalendar: true\nmonths: [Only]\n---\n',
        'Templates/Calendar.md': '---\ntemplate: true\ncalendar: true\nmonths: [Template]\n---\n',
      }),
    );
    expect(worldCalendar(vault.index.worldPages)!.path).toBe('A.md');
    expect(formatWhen(parseWhen('Only 5')!)).toBe('Only 5');
  });
});

describe('dates', () => {
  it('reads years as before, and dates with month names, numbers and eras', () => {
    useCalendar(coast);
    expect(parseWhen(412)).toEqual({ value: 412, precision: 'year' });
    expect(parseWhen('412 AE')).toEqual({ value: 412, precision: 'year' });
    expect(parseWhen('-50')).toEqual({ value: -50, precision: 'year' });
    expect(parseWhen('c. 412')).toBeUndefined();
    expect(parseWhen('long ago')).toBeUndefined();
    // Eras: year 112 of the Second Age is year 412 from the start of time.
    expect(parseWhen('112 SA')).toEqual({ value: 412, precision: 'year' });
    expect(parseWhen('Year 112 of the Second Age')!.value).toBe(412);
    expect(parseWhen('SA 112')!.value).toBe(412);
    // Months and days.
    expect(parseWhen('Thaw 412')).toEqual({ value: 412 + 30 / 128, precision: 'month' });
    expect(parseWhen('3 Thaw 412')).toEqual({ value: 412 + 32 / 128, precision: 'day' });
    expect(parseWhen('Thaw 3, 412')!.value).toBe(412 + 32 / 128);
    expect(parseWhen('3 th 112 SA')!.value).toBe(412 + 32 / 128);
    expect(parseWhen('412-02-03')!.value).toBe(412 + 32 / 128);
    expect(parseWhen('412-02')).toEqual({ value: 412 + 30 / 128, precision: 'month' });
    // A day the month does not have.
    expect(parseWhen('29 Thaw 412')).toBeUndefined();
    expect(parseWhen('412-02-29')).toEqual({ value: 412, precision: 'year' });
  });

  it('reads the common calendar in English and Russian, with the Russian date form', () => {
    expect(parseWhen('5 March 412')!.value).toBe(dateValue(412, 2, 5, commonCalendar()));
    expect(parseWhen('5 марта 412')!.value).toBe(dateValue(412, 2, 5, commonCalendar()));
    expect(parseWhen('Mar 412')!.precision).toBe('month');
    expect(formatWhen({ value: dateValue(412, 2, 5, commonCalendar()), precision: 'day' })).toBe('5 March 412');
    useCalendar(undefined);
    const ru = commonCalendar('ru');
    expect(formatWhen({ value: dateValue(412, 2, 5, ru), precision: 'day' }, ru)).toBe('5 марта 412');
  });

  it('reads spans in one field', () => {
    useCalendar(coast);
    expect(parseSpan('429-430')!.map((w) => w.value)).toEqual([429, 430]);
    expect(parseSpan('-20 – -5')!.map((w) => w.value)).toEqual([-20, -5]);
    expect(parseSpan('128-130 SA')!.map((w) => w.value)).toEqual([428, 430]);
    expect(parseSpan('3 Thaw 429 – Highsun 430')!.map((w) => w.precision)).toEqual(['day', 'month']);
    expect(parseSpan('412-02-03')).toBeUndefined();
    expect(parseSpan('412')).toBeUndefined();
  });

  it('writes dates back with the era of their year', () => {
    useCalendar(coast);
    expect(formatYear(412)).toBe('112 SA');
    expect(formatYear(300)).toBe('300 FA');
    expect(formatYear(-5)).toBe('-5');
    expect(formatWhen({ value: 412 + 32 / 128, precision: 'day' })).toBe('3 Thaw 112 SA');
    expect(formatWhen({ value: 412 + 30 / 128, precision: 'month' })).toBe('Thaw 112 SA');
    // What is written reads back as the same date.
    for (const s of ['3 Thaw 112 SA', 'Highsun 5 FA', '40 Highsun 12 FA']) expect(formatWhen(parseWhen(s)!)).toBe(s);
  });

  it('knows the parts of a date, its end and its day of the week', () => {
    const v = dateValue(412, 3, 40, coast);
    expect(dateParts(v, coast)).toEqual({ year: 412, month: 3, day: 40 });
    expect(dateParts(-3.5, coast).year).toBe(-4);
    expect(endOf({ value: 412, precision: 'year' }, coast)).toBe(413);
    expect(endOf({ value: dateValue(412, 1, 1, coast), precision: 'month' }, coast)).toBeCloseTo(dateValue(412, 2, 1, coast));
    expect(endOf({ value: v, precision: 'day' }, coast)).toBeCloseTo(413);
    expect(weekday(dateValue(1, 0, 1, coast), coast)).toBe(0);
    expect(weekday(dateValue(1, 0, 7, coast), coast)).toBe(1);
    expect(weekday(dateValue(2, 0, 1, coast), coast)).toBe(128 % 5);
    expect(weekday(1, commonCalendar())).toBeUndefined();
  });

  it('labels the axis with years, or with months when there is room', () => {
    useCalendar(coast);
    expect(axisTicks(400, 420, 10).map((t) => t.label)).toEqual(['100 SA', '110 SA', '120 SA']);
    const months = axisTicks(412, 413, 2000);
    expect(months.slice(0, 4).map((t) => t.label)).toEqual(['Frostmonth 112 SA', 'Thaw', 'Seedtime', 'Highsun']);
    expect(months[1]!.major).toBe(false);
    expect(months[1]!.span).toBeCloseTo(28 / 128);
  });
});

describe('page years with a calendar', () => {
  const page = (fm: string) => parsePage('a.md', `---\n${fm}\n---\n`, 1);

  it('read dates from the header and show them as written', () => {
    useCalendar(coast);
    const y = pageYears(page('born: 3 Thaw 112 SA\ndied: 130 SA'))!;
    expect(y.from).toBe(412 + 32 / 128);
    expect(y.to).toBe(430);
    expect(formatYears(y)).toBe('3 Thaw 112 – 130 SA');
    expect(pageYears(page('year: Highsun 112 SA'))).toMatchObject({ pointKey: 'year', from: 412 + 88 / 128 });
    expect(pageYears(page('years: 3 Thaw 429 – Highsun 430'))!.toWhen!.precision).toBe('month');
  });

  it('a date counts for its whole year', () => {
    expect(existsIn({ from: 412.5, to: 413.2 }, 412)).toBe(true);
    expect(existsIn({ from: 412.5, to: 413.2 }, 413)).toBe(true);
    expect(existsIn({ from: 412.5, to: 413.2 }, 414)).toBe(false);
  });

  it('keep a date written in words when the panel changes it', () => {
    const t = setYearsInText('---\nborn: 400\n---\n', { from: '3 Thaw 112 SA', to: 430 });
    expect(t).toContain('born: 3 Thaw 112 SA');
    expect(t).toContain('to: 430');
    expect(setYearsInText('---\nyear: 1\n---\n', { from: 'Thaw 5', to: 'Thaw 5' })).toContain('year: Thaw 5');
  });

  it('end bars at the end of their last year, month or day', () => {
    useCalendar(coast);
    const m = timelineModel([parsePage('E.md', '---\nyear: 3 Thaw 112 SA\n---\n', 1), parsePage('R.md', '---\nfrom: 400\nto: Thaw 410\n---\n', 1)]);
    const items = m.groups[0]!.items;
    const event = items.find((i) => i.path === 'E.md')!;
    expect(event.point).toBe(true);
    expect(event.end! - event.from!).toBeCloseTo(1 / 128);
    const reign = items.find((i) => i.path === 'R.md')!;
    expect(reign.end).toBeCloseTo(410 + 58 / 128);
  });
});

