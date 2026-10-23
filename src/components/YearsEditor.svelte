<script lang="ts">
  import { app } from '../app.svelte';
  import { pageYears, parseYear } from '../core/years';

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
    fFrom = y?.from === undefined ? '' : String(y.from);
    fTo = y?.to === undefined ? '' : String(y.to);
  });

  /** Field names shown above the inputs: the ones the page already uses ("born", "died"…). */
  const fromName = $derived(years?.pointKey ?? years?.fromKey ?? t('years.from'));
  const toName = $derived(years?.pointKey ? t('years.to') : (years?.toKey ?? t('years.to')));

  function read(s: string): number | undefined | null {
    if (!s.trim()) return undefined;
    const y = parseYear(s.trim());
    return y === undefined || !/^\s*[-−]?\d+\s*$/.test(s) ? null : y;
  }

  async function save() {
    const from = read(fFrom);
    const to = read(fTo);
    if (from === null || to === null) {
      error = true;
      return;
    }
    error = false;
    if (from === years?.from && to === years?.to) return;
    const span: { from?: number; to?: number } = {};
    if (from !== undefined) span.from = from;
    if (to !== undefined) span.to = to;
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
    <input type="text" inputmode="numeric" bind:value={fFrom} onfocus={() => (focused = true)} onblur={blur} aria-invalid={error} placeholder="—" />
  </label>
  <span class="years-dash" aria-hidden="true">–</span>
  <label class="years-field">
    <span>{toName}</span>
    <input type="text" inputmode="numeric" bind:value={fTo} onfocus={() => (focused = true)} onblur={blur} aria-invalid={error} placeholder="—" />
  </label>
  {#if years && app.on('timeline')}
    <button type="button" class="btn ghost years-go" onclick={() => app.showOnTimeline(path)}>{t('years.onTimeline')}</button>
  {/if}
  <button type="submit" hidden>{t('dialog.confirm')}</button>
  {#if error}<p class="form-error" role="alert">{t('years.invalid')}</p>{/if}
</form>
