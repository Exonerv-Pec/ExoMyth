<script lang="ts">
  import { app } from '../app.svelte';
  import { diffStats, diffText, withContext, type DiffPart, type DiffSkip } from '../core/diff';
  import type { PageVersion } from '../core/versions';
  import { countLines, formatTime } from '../i18n';

  const t = app.t;
  const close = () => (app.compare = null);
  const num = (n: number) => n.toLocaleString(app.lang === 'ru' ? 'ru-RU' : 'en-US');

  const cmp = $derived(app.on('versions') ? app.compare : null);
  const page = $derived.by(() => {
    app.version;
    return cmp ? app.vault?.getPage(cmp.path) : undefined;
  });

  let versions = $state<PageVersion[]>([]);
  let fromText = $state<string | null>(null);
  let toVersionText = $state<string | null>(null);
  let only = $state(true);
  /** Hidden unchanged stretches that were opened, by position. */
  let opened = $state<Set<number>>(new Set());

  $effect(() => {
    app.versionsSeq;
    const c = cmp;
    const vault = app.vault;
    if (!c || !vault) return;
    let live = true;
    void vault.versions(c.path).then((list) => live && (versions = list)).catch(() => undefined);
    return () => {
      live = false;
    };
  });

  $effect(() => {
    const c = cmp;
    const vault = app.vault;
    fromText = null;
    toVersionText = null;
    opened = new Set();
    if (!c || !vault) return;
    let live = true;
    void vault.readVersion(c.from).then((s) => live && (fromText = s), () => live && close());
    if (c.to) void vault.readVersion(c.to).then((s) => live && (toVersionText = s), () => live && close());
    return () => {
      live = false;
    };
  });

  const toText = $derived(cmp?.to ? toVersionText : (page?.raw ?? null));
  const parts = $derived(fromText !== null && toText !== null ? diffText(fromText, toText) : null);
  const stats = $derived(parts ? diffStats(parts) : null);
  const same = $derived(!!parts && parts.every((p) => p.op === 'same'));
  const shown = $derived<(DiffPart | DiffSkip)[]>(parts ? (only ? withContext(parts) : parts) : []);
  const fromVersion = $derived(versions.find((v) => v.file === cmp?.from));

  const label = (v: PageVersion) => `${formatTime(app.lang, v.time)}${v.name ? ' · ' + v.name : ''}`;

  function setFrom(file: string) {
    if (cmp) app.compare = { ...cmp, from: file };
  }
  function setTo(file: string) {
    if (cmp) app.compare = { ...cmp, to: file || null };
  }
  function open(i: number) {
    opened = new Set([...opened, i]);
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && cmp && !app.dialog && close()} />

{#if cmp && page}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
  <div class="scrim" onclick={(e) => e.target === e.currentTarget && close()}>
    <div class="dialog compare" role="dialog" aria-modal="true" aria-labelledby="compare-title">
      <div class="shortcuts-head">
        <h2 id="compare-title">{t('cmp.title')}<span class="panel-page">{' · '}{page.title}</span></h2>
        <button class="btn ghost" onclick={close}>{t('keys.done')}</button>
      </div>

      <div class="cmp-bar">
        <label class="cmp-pick">
          <span>{t('cmp.from')}</span>
          <select value={cmp.from} onchange={(e) => setFrom(e.currentTarget.value)}>
            {#each versions as v (v.file)}<option value={v.file}>{label(v)}</option>{/each}
            {#if !versions.some((v) => v.file === cmp.from)}<option value={cmp.from}>…</option>{/if}
          </select>
        </label>
        <label class="cmp-pick">
          <span>{t('cmp.to')}</span>
          <select value={cmp.to ?? ''} onchange={(e) => setTo(e.currentTarget.value)}>
            <option value="">{t('cmp.current')}</option>
            {#each versions as v (v.file)}<option value={v.file}>{label(v)}</option>{/each}
          </select>
        </label>
        <label class="cmp-only"><input type="checkbox" bind:checked={only} /> {t('cmp.only')}</label>
        {#if stats}
          <span class="cmp-stats" title={t('cmp.statsTitle')}>
            <span class="add">+{num(stats.added)}</span> · <span class="del">−{num(stats.removed)}</span>
          </span>
        {/if}
      </div>

      <div class="cmp-body">
        {#if !parts}
          <p class="rev-empty">{t('cmp.loading')}</p>
        {:else if same}
          <p class="rev-empty">{t('cmp.same')}</p>
        {:else}
          <p class="cmp-legend" aria-hidden="true"><del>{t('cmp.legend.del')}</del> <ins>{t('cmp.legend.add')}</ins></p>
          <div class="diff">{#each shown as p, i (i)}{#if p.op === 'skip'}{#if opened.has(i)}<span>{p.text}</span>{:else}<button class="diff-skip" onclick={() => open(i)}>{t('cmp.skip', countLines(app.lang, p.lines))}</button>{/if}{:else if p.op === 'add'}<ins>{p.text}</ins>{:else if p.op === 'del'}<del>{p.text}</del>{:else}<span>{p.text}</span>{/if}{/each}</div>
        {/if}
      </div>

      <div class="settings-foot cmp-foot">
        {#if fromVersion && !same && parts}
          <button class="btn primary" onclick={() => app.askRestoreVersion(cmp.path, fromVersion)}>{t('cmp.restore')}</button>
        {/if}
      </div>
    </div>
  </div>
{/if}
