<script lang="ts">
  import { app } from '../app.svelte';
  import { defaultStartPage, sitePages, topFolder } from '../core/site';

  let { onclose }: { onclose: () => void } = $props();
  const t = app.t;

  const index = app.vault!.index;
  const saved = app.savedSiteOptions();
  const pages = index.worldPages;

  /** The top-level folders of the world; `''` for pages outside any folder. */
  const folders = [...new Set(pages.map((p) => topFolder(p.path)))].sort((a, b) => (a === '' ? -1 : b === '' ? 1 : a.localeCompare(b)));

  let title = $state(typeof saved.title === 'string' && saved.title.trim() ? saved.title : (app.vault?.storage.label ?? ''));
  let hiddenTag = $state(typeof saved.hiddenTag === 'string' ? saved.hiddenTag : 'secret');
  let spoilers = $state<'click' | 'remove'>(saved.spoilers === 'remove' ? 'remove' : 'click');
  const savedStart = typeof saved.start === 'string' && index.get(saved.start) ? saved.start : undefined;
  let start = $state(saved.start === '' ? '' : (savedStart ?? defaultStartPage(index) ?? ''));
  const savedHidden = Array.isArray(saved.hiddenFolders) ? saved.hiddenFolders.filter((f): f is string => typeof f === 'string') : [];
  let shown = $state<Record<string, boolean>>(Object.fromEntries(folders.map((f) => [f, !savedHidden.includes(f)])));

  const hiddenFolders = $derived(folders.filter((f) => !shown[f]));
  const count = $derived(sitePages(index, { hiddenTag, hiddenFolders }).length);
  const startPages = $derived(sitePages(index, { hiddenTag, hiddenFolders }).slice().sort((a, b) => a.title.localeCompare(b.title)));
  let busy = $state(false);

  async function submit(e: Event) {
    e.preventDefault();
    if (busy || count === 0) return;
    busy = true;
    const options = { title: title.trim() || (app.vault?.storage.label ?? 'World'), hiddenTag: hiddenTag.trim(), hiddenFolders, spoilers, start: startPages.some((p) => p.path === start) ? start : '' };
    onclose();
    await app.downloadSite(options);
  }
</script>

<form class="new-page site-form" onsubmit={submit}>
  <h2 id="dlg-title">{t('site.title')}</h2>
  <p>{t('site.intro')}</p>

  <label>
    {t('site.name')}
    <input type="text" bind:value={title} autocomplete="off" />
  </label>

  <label>
    {t('site.start')}
    <select bind:value={start}>
      <option value="">{t('site.start.none')}</option>
      {#each startPages as p (p.path)}<option value={p.path}>{p.title}</option>{/each}
    </select>
  </label>

  {#if folders.length > 1 || folders[0] !== ''}
    <fieldset class="template-pick">
      <legend>{t('site.folders')}</legend>
      <div class="site-folders">
        {#each folders as f (f)}
          <label class="tool-check"><input type="checkbox" bind:checked={shown[f]} /> {f || t('graph.root')}</label>
        {/each}
      </div>
    </fieldset>
  {/if}

  <label>
    {t('site.hiddenTag')}
    <input type="text" bind:value={hiddenTag} autocomplete="off" placeholder="secret" />
    <span class="dialog-hint">{t('site.hiddenTag.hint')}</span>
  </label>

  <fieldset class="template-pick">
    <legend>{t('site.spoilers')}</legend>
    <div class="template-chips" role="radiogroup" aria-label={t('site.spoilers')}>
      <button type="button" role="radio" aria-checked={spoilers === 'click'} onclick={() => (spoilers = 'click')}>{t('site.spoilers.click')}</button>
      <button type="button" role="radio" aria-checked={spoilers === 'remove'} onclick={() => (spoilers = 'remove')}>{t('site.spoilers.remove')}</button>
    </div>
  </fieldset>

  <p class="site-count" aria-live="polite">{t('site.count', count, pages.length)}</p>
  <p class="dialog-hint">{t('site.howTo')}</p>

  <div class="actions">
    <button type="button" class="btn ghost" onclick={onclose}>{t('dialog.cancel')}</button>
    <button type="submit" class="btn primary" disabled={busy || count === 0}>{t('site.download')}</button>
  </div>
</form>
