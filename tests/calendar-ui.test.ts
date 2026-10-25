import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { DEMO_FILES } from '../src/demo';
import { builtInTemplates } from '../src/core/templates';
import { calendarOf } from '../src/core/calendar';
import { pageYears } from '../src/core/years';
import { parsePage } from '../src/core/parse';

beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Element.prototype.scrollIntoView = () => {};
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  URL.createObjectURL = () => 'blob:x';
  URL.revokeObjectURL = () => {};
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

describe('calendars in the app', () => {
  let mounted: ReturnType<typeof mount>[] = [];
  afterEach(() => {
    mounted.forEach((m) => unmount(m));
    mounted = [];
    document.body.innerHTML = '';
    app.closeVault();
    app.resetFeatures();
    app.setMode('split');
  });

  async function boot(current: string, mode: 'preview' | 'timeline' = 'preview') {
    app.lang = 'en';
    app.setMode(mode);
    const vault = await Vault.open(new MemoryStorage(`c-${Math.random()}`, DEMO_FILES));
    app.setVault(vault);
    app.current = current;
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(App, { target }));
    flushSync();
    await wait();
    flushSync();
    return { vault, target };
  }

  it('shows a calendar page as its months, weeks and eras', async () => {
    const { target } = await boot('World/Calendar of the Coast.md');
    const cal = target.querySelector('.calendar')!;
    expect(cal.querySelector('.cal-summary')!.textContent).toBe('Months: 13 · days in a year: 365 · days in a week: 6');
    expect([...cal.querySelectorAll('.cal-month h3')].map((h) => h.firstChild!.textContent)).toContain('The Long Night');
    expect(cal.querySelector('.cal-eras')!.textContent).toContain('Age of the River');
    // The first month of year 1 starts on the first day of the week.
    const set = (y: number) => {
      const input = cal.querySelector<HTMLInputElement>('.cal-year input')!;
      input.value = String(y);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
      flushSync();
    };
    set(1);
    const firstRow = () => [...cal.querySelectorAll('.cal-month')[0]!.querySelectorAll('tbody tr')[0]!.querySelectorAll('td')].map((td) => td.textContent);
    expect(firstRow()[0]).toBe('1');
    expect(cal.querySelector('.cal-year-name')!.textContent).toBe('1 AR');
    // A year later the days have moved on by 365 % 6 = 5.
    set(2);
    expect(firstRow().slice(0, 6)).toEqual(['', '', '', '', '', '1']);
    // The header lists are not facts of the page.
    expect(target.querySelector('.infobox')?.textContent ?? '').not.toContain('Frostmonth');
  });

  it('takes a date in words in the Years fields and writes it as words', async () => {
    const { target, vault } = await boot('Characters/Liara Vale.md');
    const inputs = target.querySelectorAll<HTMLInputElement>('.years-edit input');
    inputs[0]!.focus();
    inputs[0]!.value = '3 Frostmonth 381';
    inputs[0]!.dispatchEvent(new Event('input', { bubbles: true }));
    inputs[0]!.blur();
    await wait(80);
    flushSync();
    const page = vault.getPage('Characters/Liara Vale.md')!;
    expect(page.raw).toContain('born: 3 Frostmonth 381 AR');
    expect(pageYears(page)!.fromWhen).toMatchObject({ precision: 'day' });
    expect(target.querySelector<HTMLInputElement>('.years-edit input')!.value).toBe('3 Frostmonth 381 AR');
    // A day the month does not have is a mistake.
    inputs[0]!.focus();
    inputs[0]!.value = '33 Frostmonth 381';
    inputs[0]!.dispatchEvent(new Event('input', { bubbles: true }));
    inputs[0]!.blur();
    await wait(60);
    flushSync();
    expect(target.querySelector('.years-edit .form-error')).toBeTruthy();
  });

  it('shows dates with their months on the timeline', async () => {
    const { target } = await boot('Welcome.md', 'timeline');
    const siege = target.querySelector('.tl-row[data-path="Events/Siege of Rivertown.md"] .tl-years')!;
    expect(siege.textContent).toBe('28 Leaffall 429 – Thaw 430 AR');
  });

  it('has a Calendar template that makes a calendar page', () => {
    for (const lang of ['en', 'ru'] as const) {
      const tpl = builtInTemplates(lang).find((t) => t.feature === 'years')!;
      const cal = calendarOf(parsePage('x.md', tpl.text.replace('{{title}}', 'X'), 1))!;
      expect(cal.months).toHaveLength(12);
      expect(cal.week).toHaveLength(7);
      expect(cal.eras).toHaveLength(1);
    }
  });
});
