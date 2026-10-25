<script lang="ts">
  import { app } from '../app.svelte';
  import { pageYears } from '../core/years';
  import { activeCalendar, formatWhen, parseWhen, type When } from '../core/calendar';

  let { path }: { path: string } = $props();
  const t = app.t;

  const years = $derived.by(() => {
    app.version;
    const page = app.vault?.getPage(path);
    return page ? pageYears(page) : undefined;
  });

  let fFrom = $state('');
  let fTo = $state('');
  let focused = $state(false);
  let error = $state(false);

  // Show what the page says, unless the fields are being edited (or hold a mistake to fix).
  $effect(() => {
    const y = years;
    if (focused || error) return;
    fFrom = y?.fromWhen ? formatWhen(y.fromWhen) : '';
    fTo = y?.toWhen ? formatWhen(y.toWhen) : '';
  });

  /** Field names shown above the inputs: the ones the page already uses ("born", "died"…). */
  const fromName = $derived(years?.pointKey ?? years?.fromKey ?? t('years.from'));
  const toName = $derived(years?.pointKey ? t('years.to') : (years?.toKey ?? t('years.to')));

  /** A field's date: undefined when empty, null when it is not a date of the world's calendar. */
  function read(s: string): When | undefined | null {
    if (!s.trim()) return undefined;
    const w = parseWhen(s.trim());
    // A year alone must be just a year here (no words after it), so a typo is not taken for one.
    if (!w || (w.precision === 'year' && !activeCalendar().eras.length && !/^\s*[-−]?\d+\s*$/.test(s))) return null;
    return w;
  }

  /** How a date is written into the page: a year typed as a number stays a number, other dates are words. */
  const written = (w: When, typed: string) => (w.precision === 'year' && /^\s*[-−]?\d+\s*$/.test(typed) ? w.value : formatWhen(w));
  /** What the header says now for a field, to keep an end that did not change exactly as written. */
  const asWritten = (key: string | undefined) => {
    const v = key ? app.vault?.getPage(path)?.frontmatter[key] : undefined;
    return typeof v === 'number' || typeof v === 'string' ? v : undefined;
  };
  const same = (a: When | undefined, b: When | undefined) => (!a && !b) || (!!a && !!b && a.value === b.value && a.precision === b.precision);

  async function save() {
    const from = read(fFrom);
    const to = read(fTo);
    if (from === null || to === null) {
      error = true;
      return;
    }
    error = false;
    if (same(from, years?.fromWhen) && same(to, years?.toWhen)) return;
    const span: { from?: number | string; to?: number | string } = {};
    const keep = !years?.pointKey;
    if (from) span.from = (keep && same(from, years?.fromWhen) ? asWritten(years?.fromKey) : undefined) ?? written(from, fFrom);
    if (to) span.to = (keep && same(to, years?.toWhen) ? asWritten(years?.toKey) : undefined) ?? written(to, fTo);
    await app.setPageYears(path, span);
  }

  function blur(e: FocusEvent) {
    // Moving between the two fields is not leaving them.
    const to = e.relatedTarget as Node | null;
    if (to && (e.currentTarget as HTMLElement).closest('.years-edit')?.contains(to)) return;
    focused = false;
    void save();
  }
</script>

<form class="years-edit" onsubmit={(e) => (e.preventDefault(), void save())}>
  <span class="years-title">{t('years.title')}</span>
  <label class="years-field">
    <span>{fromName}</span>
    <input type="text" size={Math.max(6, fFrom.length + 1)} bind:value={fFrom} onfocus={() => (focused = true)} onblur={blur} aria-invalid={error} placeholder="—" />
  </label>
  <span class="years-dash" aria-hidden="true">–</span>
  <label class="years-field">
    <span>{toName}</span>
    <input type="text" size={Math.max(6, fTo.length + 1)} bind:value={fTo} onfocus={() => (focused = true)} onblur={blur} aria-invalid={error} placeholder="—" />
  </label>
  {#if years && app.on('timeline')}
    <button type="button" class="btn ghost years-go" onclick={() => app.showOnTimeline(path)}>{t('years.onTimeline')}</button>
  {/if}
  <button type="submit" hidden>{t('dialog.confirm')}</button>
  {#if error}<p class="form-error" role="alert">{t('years.invalid')}</p>{/if}
</form>
