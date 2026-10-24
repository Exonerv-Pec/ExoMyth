/**
 * Writing stats: how many words are added each day, how long you type, and streaks of days. The
 * numbers live in the world, in `.exomyth/writing.json`, one line per day, and never leave the
 * device. A day is the writer's own calendar day (local time).
 *
 *   {
 *     "version": 1,
 *     "goal": 500,
 *     "days": {
 *       "2026-10-23": { "words": 412, "seconds": 1830 },
 *       "2026-10-24": { "words": 96, "seconds": 410 }
 *     }
 *   }
 *
 * Words are the new words of a page each time it is saved (deleting text never subtracts), and
 * seconds are the time between keystrokes, as long as the pause stays short.
 */

export interface DayStat {
  words: number;
  seconds: number;
}

export interface WritingStats {
  version: 1;
  /** Words per day to aim for; none when unset. */
  goal?: number;
  /** `YYYY-MM-DD` → what was written that day. */
  days: Record<string, DayStat>;
}

/** A pause longer than this is not counted as writing time. */
export const IDLE_SECONDS = 60;

export const MAX_GOAL = 100_000;

export function emptyStats(): WritingStats {
  return { version: 1, days: {} };
}

const DAY = /^(\d{4})-(\d{2})-(\d{2})$/;

/** The calendar day of a moment, in local time: `2026-10-24`. */
export function dayKey(date: Date = new Date()): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())}`;
}

/** Whether `key` is a real calendar day written as `YYYY-MM-DD`. */
export function isDayKey(key: string): boolean {
  const m = DAY.exec(key);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const date = new Date(Date.UTC(y, mo - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === mo - 1 && date.getUTCDate() === d;
}

/** The day `delta` days away from `key`. Calendar arithmetic, so daylight saving never skips a day. */
export function shiftDay(key: string, delta: number): string {
  const m = DAY.exec(key)!;
  const date = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3]) + delta));
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getUTCFullYear()}-${p(date.getUTCMonth() + 1)}-${p(date.getUTCDate())}`;
}

/** A goal from the settings field: whole words per day, or none for empty, zero or nonsense. */
export function cleanGoal(value: unknown): number | undefined {
  const n = typeof value === 'string' ? Number(value.trim()) : typeof value === 'number' ? value : NaN;
  if (!Number.isFinite(n) || n < 1) return undefined;
  return Math.min(Math.floor(n), MAX_GOAL);
}

/** Reads the file. Anything that is not understood is left out rather than failing. */
export function parseStats(text: string): WritingStats {
  const out = emptyStats();
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return out;
  }
  if (!raw || typeof raw !== 'object') return out;
  const { goal, days } = raw as { goal?: unknown; days?: unknown };
  const g = cleanGoal(goal);
  if (g !== undefined) out.goal = g;
  if (days && typeof days === 'object') {
    for (const [key, v] of Object.entries(days as Record<string, unknown>)) {
      if (!isDayKey(key) || !v || typeof v !== 'object') continue;
      const w = Number((v as DayStat).words);
      const s = Number((v as DayStat).seconds);
      const words = Number.isFinite(w) && w > 0 ? Math.floor(w) : 0;
      const seconds = Number.isFinite(s) && s > 0 ? Math.round(s) : 0;
      if (words > 0 || seconds > 0) out.days[key] = { words, seconds };
    }
  }
  return out;
}

/** The file text: days in order and one per line, so a world kept in Git shows tidy changes. */
export function serializeStats(stats: WritingStats): string {
  const lines = Object.keys(stats.days)
    .sort()
    .map((key) => {
      const d = stats.days[key]!;
      return `    ${JSON.stringify(key)}: { "words": ${Math.floor(d.words)}, "seconds": ${Math.round(d.seconds)} }`;
    });
  const head = ['{', '  "version": 1,'];
  if (stats.goal !== undefined) head.push(`  "goal": ${stats.goal},`);
  return [...head, lines.length ? '  "days": {' : '  "days": {}', ...(lines.length ? [lines.join(',\n'), '  }'] : []), '}', ''].join('\n');
}

function withDay(stats: WritingStats, day: string, change: (d: DayStat) => DayStat): WritingStats {
  const before = stats.days[day] ?? { words: 0, seconds: 0 };
  return { ...stats, days: { ...stats.days, [day]: change(before) } };
}

export function addWords(stats: WritingStats, day: string, words: number): WritingStats {
  if (!(words > 0)) return stats;
  return withDay(stats, day, (d) => ({ ...d, words: d.words + Math.floor(words) }));
}

export function addSeconds(stats: WritingStats, day: string, seconds: number): WritingStats {
  if (!(seconds > 0)) return stats;
  return withDay(stats, day, (d) => ({ ...d, seconds: d.seconds + seconds }));
}

export function setGoal(stats: WritingStats, goal: number | undefined): WritingStats {
  const { goal: _old, ...rest } = stats;
  return goal === undefined ? rest : { ...rest, goal };
}

/** Two sets of days added together (what was saved earlier plus what was written while it loaded). */
export function mergeStats(saved: WritingStats, recent: WritingStats): WritingStats {
  const days: Record<string, DayStat> = { ...saved.days };
  for (const [key, d] of Object.entries(recent.days)) {
    const s = days[key];
    days[key] = s ? { words: s.words + d.words, seconds: s.seconds + d.seconds } : { ...d };
  }
  const goal = recent.goal ?? saved.goal;
  return { version: 1, ...(goal !== undefined ? { goal } : {}), days };
}

export interface DayRow extends DayStat {
  day: string;
}

/** The last `n` days up to and including `today`, oldest first; days without writing are zeros. */
export function lastDays(stats: WritingStats, today: string, n: number): DayRow[] {
  const out: DayRow[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const day = shiftDay(today, -i);
    out.push({ day, ...(stats.days[day] ?? { words: 0, seconds: 0 }) });
  }
  return out;
}

export interface StatsSummary {
  today: DayStat;
  week: DayStat;
  total: DayStat;
  /** Days with any words or time. */
  activeDays: number;
  /** Words a day has to reach to count for the streak: the goal, or else any word at all. */
  needed: number;
  /** Days in a row up to today that reached `needed`. Today may still be on its way: it does not break the streak. */
  streak: number;
  longest: number;
  goalReached: boolean;
}

export function summarize(stats: WritingStats, today: string): StatsSummary {
  const needed = stats.goal ?? 1;
  const reached = (day: string) => (stats.days[day]?.words ?? 0) >= needed;

  const sum = (rows: DayStat[]): DayStat => rows.reduce((a, d) => ({ words: a.words + d.words, seconds: a.seconds + d.seconds }), { words: 0, seconds: 0 });
  const all = Object.values(stats.days);

  // The streak counts back from today, or from yesterday while today has not reached the mark yet.
  let streak = 0;
  for (let day = reached(today) ? today : shiftDay(today, -1); reached(day); day = shiftDay(day, -1)) streak++;

  let longest = 0;
  let run = 0;
  let previous = '';
  for (const day of Object.keys(stats.days).sort()) {
    if (!reached(day)) continue;
    run = previous && shiftDay(previous, 1) === day ? run + 1 : 1;
    previous = day;
    longest = Math.max(longest, run);
  }

  return {
    today: stats.days[today] ?? { words: 0, seconds: 0 },
    week: sum(lastDays(stats, today, 7)),
    total: sum(all),
    activeDays: all.filter((d) => d.words > 0 || d.seconds > 0).length,
    needed,
    streak,
    longest,
    goalReached: stats.goal !== undefined && reached(today),
  };
}
