<script lang="ts">
  import { app } from '../app.svelte';
  import { countDays, countWords, formatDay, formatDuration } from '../i18n';
  import { dayKey, lastDays, summarize } from '../core/stats';

  const t = app.t;
  const close = () => (app.statsOpen = false);
  const num = (n: number) => n.toLocaleString(app.lang === 'ru' ? 'ru-RU' : 'en-US');

  const today = $derived(app.statsOpen ? dayKey() : '');
  const sum = $derived(app.statsOpen ? summarize(app.stats, today) : null);
  const rows = $derived(app.statsOpen ? lastDays(app.stats, today, 30) : []);
  /** The tallest bar: the best day, or the goal when that is higher. */
  const top = $derived(Math.max(app.stats.goal ?? 0, ...rows.map((r) => r.words), 1));
  const goal = $derived(app.stats.goal);
  const started = $derived(!!sum && sum.activeDays > 0);
  const progress = $derived(goal && sum ? Math.min(100, Math.round((sum.today.words / goal) * 100)) : 0);

  const height = (words: number) => (words <= 0 ? 0 : Math.max(3, (words / top) * 100));
  const label = (day: string, words: number, seconds: number) => t('stats.bar', formatDay(app.lang, day), countWords(app.lang, words), formatDuration(app.lang, seconds));

  function askClear() {
    app.dialog = {
      kind: 'confirm',
      title: t('stats.reset.title'),
      message: t('stats.reset.text'),
      confirmLabel: t('stats.reset.confirm'),
      danger: true,
      onConfirm: () => app.clearStats(),
    };
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && app.statsOpen && !app.dialog && close()} />

{#if app.statsOpen && app.on('writingStats') && app.vault && sum}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={(e) => e.target === e.currentTarget && close()}>
    <div class="dialog stats" role="dialog" aria-modal="true" aria-labelledby="stats-title">
      <div class="shortcuts-head">
        <h2 id="stats-title">{t('stats.title')}</h2>
        <button class="btn ghost" onclick={close}>{t('keys.done')}</button>
      </div>
      <div class="stats-body">
        <p class="settings-note">{t('stats.note')}</p>

        <div class="st-tiles">
          <div class="st-tile">
            <span class="st-label">{t('stats.today')}</span>
            <strong>{countWords(app.lang, sum.today.words)}</strong>
            <span class="st-sub">{formatDuration(app.lang, sum.today.seconds)}</span>
          </div>
          <div class="st-tile">
            <span class="st-label">{t('stats.week')}</span>
            <strong>{countWords(app.lang, sum.week.words)}</strong>
            <span class="st-sub">{formatDuration(app.lang, sum.week.seconds)}</span>
          </div>
          <div class="st-tile">
            <span class="st-label">{t('stats.streak')}</span>
            <strong>{countDays(app.lang, sum.streak)}</strong>
            <span class="st-sub">{t('stats.longest', countDays(app.lang, sum.longest))}</span>
          </div>
          <div class="st-tile">
            <span class="st-label">{t('stats.total')}</span>
            <strong>{countWords(app.lang, sum.total.words)}</strong>
            <span class="st-sub">{formatDuration(app.lang, sum.total.seconds)}, {t('stats.over', countDays(app.lang, sum.activeDays))}</span>
          </div>
        </div>

        <div class="st-goal">
          <label for="stats-goal">{t('stats.goal')}</label>
          <input
            id="stats-goal"
            type="number"
            min="0"
            step="50"
            inputmode="numeric"
            value={goal ?? ''}
            onchange={(e) => app.setGoal(e.currentTarget.value)}
          />
          <p class="st-about">{t('stats.goal.about')}</p>
          {#if goal}
            <div class="st-progress" role="progressbar" aria-label={t('stats.goal')} aria-valuemin="0" aria-valuemax={goal} aria-valuenow={Math.min(sum.today.words, goal)}>
              <span style:width="{progress}%"></span>
            </div>
            <p class="st-about" class:met={sum.goalReached}>
              {sum.goalReached ? t('stats.goal.reached') : t('stats.goal.progress', num(sum.today.words), num(goal))}
            </p>
          {/if}
        </div>

        <section>
          <h3>{t('stats.chart')}</h3>
          {#if !started}<p class="st-about">{t('stats.empty')}</p>{/if}
          <div class="st-chart">
            <ol class="st-bars">
              {#each rows as r (r.day)}
                <li class:today={r.day === today} class:met={r.words > 0 && r.words >= sum.needed} title={label(r.day, r.words, r.seconds)}>
                  <span class="bar" style:height="{height(r.words)}%"></span>
                  <span class="sr-only">{label(r.day, r.words, r.seconds)}</span>
                </li>
              {/each}
            </ol>
            {#if goal}<span class="st-goalline" style:bottom="{(goal / top) * 100}%" aria-hidden="true"></span>{/if}
          </div>
          <div class="st-axis" aria-hidden="true">
            <span>{formatDay(app.lang, rows[0]!.day)}</span>
            <span>{formatDay(app.lang, today)}</span>
          </div>
        </section>

        <div class="settings-foot">
          <button class="btn ghost" disabled={!started && goal === undefined} onclick={askClear}>{t('stats.reset')}</button>
        </div>
      </div>
    </div>
  </div>
{/if}
