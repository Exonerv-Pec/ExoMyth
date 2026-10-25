<script lang="ts">
  import { app } from '../app.svelte';
  import { calendarOf, dateValue, daysInYear, formatYear, weekday, worldCalendar } from '../core/calendar';

  let { path }: { path: string } = $props();
  const t = app.t;

  const cal = $derived.by(() => {
    app.version;
    const page = app.vault?.getPage(path);
    return page ? calendarOf(page) : undefined;
  });
  /** Another calendar page comes first: this one is not the world's calendar. */
  const inUse = $derived.by(() => {
    app.version;
    return worldCalendar(app.vault?.index.worldPages ?? [])?.path === path;
  });

  /** The year whose weeks are shown: the chosen year, or the first year of the world, or 1. */
  let year = $state<number | null>(null);
  const shownYear = $derived(year ?? (app.byYear ? app.year : (app.yearSpan?.min ?? 1)));
  let yearText = $state('');
  $effect(() => {
    yearText = String(shownYear);
  });

  /** The days of a month in rows of a week, with empty cells before the first day. */
  function weeks(m: number): (number | null)[][] {
    const c = cal!;
    const days = c.months[m]!.days;
    if (!c.week.length) {
      // No weeks: rows of ten days.
      const rows: (number | null)[][] = [];
      for (let d = 1; d <= days; d += 10) rows.push(Array.from({ length: Math.min(10, days - d + 1) }, (_, i) => d + i));
      return rows;
    }
    const first = weekday(dateValue(shownYear, m, 1, c), c) ?? 0;
    const cells: (number | null)[] = [...Array<null>(first).fill(null), ...Array.from({ length: days }, (_, i) => i + 1)];
    const rows: (number | null)[][] = [];
    for (let i = 0; i < cells.length; i += c.week.length) rows.push(cells.slice(i, i + c.week.length));
    return rows;
  }
  const short = (name: string) => (name.length > 3 ? name.slice(0, 2) : name);
</script>

{#if cal}
  <section class="calendar" aria-label={t('calendar.title')}>
    <div class="cal-head">
      <p class="cal-summary">
        {t('calendar.summary', cal.months.length, daysInYear(cal))}{#if cal.week.length}{' · '}{t('calendar.week', cal.week.length)}{/if}
      </p>
      <label class="cal-year">
        {t('calendar.year')}
        <input
          type="number"
          step="1"
          bind:value={yearText}
          onchange={() => {
            const n = Number(yearText);
            if (Number.isInteger(n)) year = n;
          }}
        />
        <span class="cal-year-name">{formatYear(shownYear, cal)}</span>
      </label>
    </div>
    {#if !inUse}<p class="cal-note">{t('calendar.notUsed')}</p>{/if}

    {#if cal.eras.length}
      <ol class="cal-eras" aria-label={t('calendar.eras')}>
        {#each cal.eras as era, i (era.name)}
          {@const next = cal.eras[i + 1]}
          <li>
            <strong>{era.name}</strong>{#if era.short}<span class="cal-short">{era.short}</span>{/if}
            <span class="cal-era-years">{t('calendar.eraFrom', era.start)}{#if next}{' '}{t('calendar.eraTo', next.start - 1, next.start - era.start)}{/if}</span>
          </li>
        {/each}
      </ol>
    {/if}

    <div class="cal-months">
      {#each cal.months as month, m (m)}
        <div class="cal-month">
          <h3>{month.name}<span class="cal-days">{t('calendar.days', month.days)}</span></h3>
          <table>
            {#if cal.week.length}
              <thead>
                <tr>{#each cal.week as d (d)}<th scope="col" title={d}>{short(d)}</th>{/each}</tr>
              </thead>
            {/if}
            <tbody>
              {#each weeks(m) as row, r (r)}
                <tr>{#each row as d, c (c)}<td>{d ?? ''}</td>{/each}</tr>
              {/each}
            </tbody>
          </table>
        </div>
      {/each}
    </div>
  </section>
{/if}
