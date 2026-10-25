<script lang="ts">
  import { app } from '../app.svelte';
  import { formatYear } from '../core/calendar';

  let {
    id,
    hidden = 0,
    toggle = false,
  }: {
    /** Unique id for the slider's label. */
    id: string;
    /** How many things the chosen year hides (shown as a note). */
    hidden?: number;
    /** Also show the "Show by year" switch (when the view has no toolbar of its own for it). */
    toggle?: boolean;
  } = $props();

  const t = app.t;
  const span = $derived(app.yearSpan);
  const step = (d: number) => span && app.setYear(Math.min(span.max, Math.max(span.min, app.year + d)));
</script>

{#if span && app.on('years') && (app.byYear || toggle)}
  <div class="year-bar">
    {#if toggle}
      <label class="tool-check"><input type="checkbox" checked={app.byYear} onchange={(e) => app.setByYear(e.currentTarget.checked)} /> {t('map.byYear')}</label>
    {/if}
    {#if app.byYear}
      <label for="year-{id}">{t('map.year')}</label>
      <button class="icon-btn" aria-label={t('year.prev')} title={t('year.prev')} onclick={() => step(-1)}>‹</button>
      <input
        id="year-{id}"
        type="range"
        min={span.min}
        max={span.max}
        step="1"
        value={app.year}
        oninput={(e) => app.setYear(Number(e.currentTarget.value))}
      />
      <button class="icon-btn" aria-label={t('year.next')} title={t('year.next')} onclick={() => step(1)}>›</button>
      <output class="year-value" for="year-{id}">{(app.version, formatYear(app.year))}</output>
      {#if hidden > 0}<span class="year-hidden">{t('map.hidden', hidden)}</span>{/if}
    {/if}
  </div>
{/if}
