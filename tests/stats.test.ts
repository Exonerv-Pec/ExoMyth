import { describe, expect, it } from 'vitest';
import {
  addSeconds,
  addWords,
  cleanGoal,
  dayKey,
  emptyStats,
  isDayKey,
  lastDays,
  mergeStats,
  parseStats,
  serializeStats,
  setGoal,
  shiftDay,
  summarize,
  type WritingStats,
} from '../src/core/stats';
import { countDays, formatDay, formatDuration } from '../src/i18n';

const stats = (days: Record<string, number>, goal?: number): WritingStats => ({
  version: 1,
  ...(goal !== undefined ? { goal } : {}),
  days: Object.fromEntries(Object.entries(days).map(([d, words]) => [d, { words, seconds: words * 2 }])),
});

describe('days', () => {
  it('are the local calendar day', () => {
    expect(dayKey(new Date(2026, 9, 24, 0, 5))).toBe('2026-10-24');
    expect(dayKey(new Date(2026, 9, 24, 23, 59))).toBe('2026-10-24');
    expect(dayKey(new Date(2027, 0, 3))).toBe('2027-01-03');
  });

  it('are checked as real dates', () => {
    expect(isDayKey('2026-10-24')).toBe(true);
    expect(isDayKey('2028-02-29')).toBe(true);
    expect(isDayKey('2026-02-29')).toBe(false);
    expect(isDayKey('2026-13-01')).toBe(false);
    expect(isDayKey('26-10-24')).toBe(false);
    expect(isDayKey('today')).toBe(false);
  });

  it('move by whole calendar days across months, years and clock changes', () => {
    expect(shiftDay('2026-10-24', -1)).toBe('2026-10-23');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
    expect(shiftDay('2028-03-01', -1)).toBe('2028-02-29');
    expect(shiftDay('2026-12-31', 1)).toBe('2027-01-01');
    // The clocks change on these nights in many countries; a day is still a day.
    expect(shiftDay('2026-03-29', 1)).toBe('2026-03-30');
    expect(shiftDay('2026-10-25', -1)).toBe('2026-10-24');
    expect(shiftDay('2026-10-24', -30)).toBe('2026-09-24');
  });
});

describe('the goal', () => {
  it('is a whole number of words, or nothing', () => {
    expect(cleanGoal('500')).toBe(500);
    expect(cleanGoal(' 250.9 ')).toBe(250);
    expect(cleanGoal(1000)).toBe(1000);
    expect(cleanGoal('')).toBeUndefined();
    expect(cleanGoal('0')).toBeUndefined();
    expect(cleanGoal(-5)).toBeUndefined();
    expect(cleanGoal('many')).toBeUndefined();
    expect(cleanGoal(1e12)).toBe(100000);
    expect(cleanGoal(undefined)).toBeUndefined();
  });

  it('is set and removed without touching the days', () => {
    const base = stats({ '2026-10-24': 10 });
    expect(setGoal(base, 300).goal).toBe(300);
    expect(setGoal(setGoal(base, 300), undefined)).toEqual(base);
    expect('goal' in setGoal(setGoal(base, 300), undefined)).toBe(false);
  });
});

describe('the file', () => {
  it('writes one line per day in date order and reads back the same', () => {
    const s = addSeconds(addWords(addWords(setGoal(emptyStats(), 500), '2026-10-24', 96), '2026-10-23', 412), '2026-10-23', 1830);
    const text = serializeStats(s);
    expect(text).toBe(
      [
        '{',
        '  "version": 1,',
        '  "goal": 500,',
        '  "days": {',
        '    "2026-10-23": { "words": 412, "seconds": 1830 },',
        '    "2026-10-24": { "words": 96, "seconds": 0 }',
        '  }',
        '}',
        '',
      ].join('\n'),
    );
    expect(JSON.parse(text)).toBeTruthy();
    expect(parseStats(text)).toEqual(s);
  });

  it('is valid JSON when empty or without a goal', () => {
    expect(JSON.parse(serializeStats(emptyStats()))).toEqual({ version: 1, days: {} });
    expect(parseStats(serializeStats(emptyStats()))).toEqual(emptyStats());
    expect(JSON.parse(serializeStats(stats({ '2026-10-24': 1 })))).toEqual({ version: 1, days: { '2026-10-24': { words: 1, seconds: 2 } } });
  });

  it('rounds seconds and drops what is not understood instead of failing', () => {
    expect(parseStats('not json')).toEqual(emptyStats());
    expect(parseStats('null')).toEqual(emptyStats());
    expect(parseStats('[1,2]')).toEqual(emptyStats());
    const messy = JSON.stringify({
      goal: '500',
      days: {
        '2026-10-24': { words: 12.9, seconds: 59.6 },
        '2026-02-30': { words: 5, seconds: 5 },
        yesterday: { words: 5, seconds: 5 },
        '2026-10-22': { words: -4, seconds: 'x' },
        '2026-10-21': 'lots',
        '2026-10-20': { words: 0, seconds: 90 },
      },
    });
    expect(parseStats(messy)).toEqual({
      version: 1,
      goal: 500,
      days: { '2026-10-24': { words: 12, seconds: 60 }, '2026-10-20': { words: 0, seconds: 90 } },
    });
  });
});

describe('counting', () => {
  it('adds to a day without changing the older stats', () => {
    const a = emptyStats();
    const b = addWords(a, '2026-10-24', 40);
    const c = addSeconds(addWords(b, '2026-10-24', 2), '2026-10-24', 5.5);
    expect(a.days).toEqual({});
    expect(b.days['2026-10-24']).toEqual({ words: 40, seconds: 0 });
    expect(c.days['2026-10-24']).toEqual({ words: 42, seconds: 5.5 });
  });

  it('ignores nothing-to-add', () => {
    const a = emptyStats();
    expect(addWords(a, '2026-10-24', 0)).toBe(a);
    expect(addWords(a, '2026-10-24', -3)).toBe(a);
    expect(addSeconds(a, '2026-10-24', 0)).toBe(a);
    expect(addWords(a, '2026-10-24', NaN)).toBe(a);
  });

  it('merges what was saved with what was written while it loaded', () => {
    const saved = stats({ '2026-10-23': 100, '2026-10-24': 10 }, 300);
    const recent = addWords(emptyStats(), '2026-10-24', 5);
    const merged = mergeStats(saved, recent);
    expect(merged.days['2026-10-23']).toEqual({ words: 100, seconds: 200 });
    expect(merged.days['2026-10-24']).toEqual({ words: 15, seconds: 20 });
    expect(merged.goal).toBe(300);
    expect(mergeStats(saved, setGoal(recent, 50)).goal).toBe(50);
  });
});

describe('the last days', () => {
  it('are listed oldest first, with zeros for days without writing', () => {
    const rows = lastDays(stats({ '2026-10-24': 7, '2026-10-22': 3 }), '2026-10-24', 4);
    expect(rows.map((r) => [r.day, r.words])).toEqual([
      ['2026-10-21', 0],
      ['2026-10-22', 3],
      ['2026-10-23', 0],
      ['2026-10-24', 7],
    ]);
    expect(lastDays(emptyStats(), '2026-10-24', 30)).toHaveLength(30);
  });
});

describe('the summary', () => {
  const today = '2026-10-24';

  it('adds up today, the last 7 days and everything', () => {
    const s = summarize(stats({ '2026-10-24': 50, '2026-10-20': 100, '2026-10-18': 1000, '2026-10-17': 5 }), today);
    expect(s.today).toEqual({ words: 50, seconds: 100 });
    // The 7 days are 18 to 24 October.
    expect(s.week.words).toBe(1150);
    expect(s.total.words).toBe(1155);
    expect(s.activeDays).toBe(4);
    expect(summarize(emptyStats(), today)).toMatchObject({ today: { words: 0 }, streak: 0, longest: 0, activeDays: 0, goalReached: false });
  });

  it('counts a streak of days in a row, and a quiet day breaks it', () => {
    expect(summarize(stats({ '2026-10-24': 1, '2026-10-23': 9, '2026-10-22': 4 }), today).streak).toBe(3);
    expect(summarize(stats({ '2026-10-24': 1, '2026-10-23': 9, '2026-10-21': 4, '2026-10-20': 4 }), today).streak).toBe(2);
    expect(summarize(stats({ '2026-10-24': 1, '2026-10-22': 4 }), today).streak).toBe(1);
  });

  it('is not broken by a today that has not started yet', () => {
    const s = summarize(stats({ '2026-10-23': 9, '2026-10-22': 4 }), today);
    expect(s.streak).toBe(2);
    // But a whole quiet day ends it.
    expect(summarize(stats({ '2026-10-22': 9, '2026-10-21': 4 }), today).streak).toBe(0);
  });

  it('remembers the longest streak ever', () => {
    const s = summarize(stats({ '2026-10-24': 1, '2026-10-10': 1, '2026-10-11': 1, '2026-10-12': 1, '2026-10-13': 1, '2026-10-02': 1 }), today);
    expect(s.streak).toBe(1);
    expect(s.longest).toBe(4);
  });

  it('counts only days that reach the goal when there is one', () => {
    const days = { '2026-10-24': 300, '2026-10-23': 520, '2026-10-22': 499, '2026-10-21': 800 };
    const s = summarize(stats(days, 500), today);
    expect(s.needed).toBe(500);
    expect(s.goalReached).toBe(false);
    // Today is short of the goal but still on its way, so the streak stands at yesterday.
    expect(s.streak).toBe(1);
    expect(s.longest).toBe(1);
    expect(summarize(stats({ ...days, '2026-10-24': 500 }, 500), today)).toMatchObject({ goalReached: true, streak: 2 });
    expect(summarize(stats(days), today)).toMatchObject({ needed: 1, goalReached: false, streak: 4 });
  });

  it('works across a month and a year boundary', () => {
    const s = summarize(stats({ '2027-01-02': 1, '2027-01-01': 1, '2026-12-31': 1, '2026-12-30': 1 }), '2027-01-02');
    expect(s.streak).toBe(4);
    expect(s.longest).toBe(4);
  });
});

describe('words for people', () => {
  it('count days in both languages', () => {
    expect(countDays('en', 1)).toBe('1 day');
    expect(countDays('en', 12)).toBe('12 days');
    expect(countDays('ru', 1)).toBe('1 день');
    expect(countDays('ru', 3)).toBe('3 дня');
    expect(countDays('ru', 5)).toBe('5 дней');
    expect(countDays('ru', 11)).toBe('11 дней');
    expect(countDays('ru', 21)).toBe('21 день');
    expect(countDays('ru', 112)).toBe('112 дней');
  });

  it('say how long you wrote', () => {
    expect(formatDuration('en', 0)).toBe('under a minute');
    expect(formatDuration('en', 59)).toBe('under a minute');
    expect(formatDuration('en', 60)).toBe('1 min');
    expect(formatDuration('en', 42 * 60 + 30)).toBe('42 min');
    expect(formatDuration('en', 3600)).toBe('1 h');
    expect(formatDuration('en', 3600 + 5 * 60)).toBe('1 h 5 min');
    expect(formatDuration('ru', 10)).toBe('меньше минуты');
    expect(formatDuration('ru', 3900)).toBe('1 ч 5 мин');
  });

  it('write a day short', () => {
    expect(formatDay('en', '2026-10-24')).toBe('Oct 24');
    expect(formatDay('ru', '2026-10-24')).toMatch(/24\s+окт/);
  });
});
