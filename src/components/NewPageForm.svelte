<script lang="ts">
  import { onMount } from 'svelte';
  import { app, type DialogState } from '../app.svelte';
  import { builtInTemplates, TEMPLATE_DIRS, worldTemplates, type TemplateChoice } from '../core/templates';

  let { d, onclose }: { d: Extract<DialogState, { kind: 'newPage' }>; onclose: () => void } = $props();
  const t = app.t;

  // svelte-ignore state_referenced_locally (the dialog is created anew for every request)
  let name = $state(d.name);
  // svelte-ignore state_referenced_locally
  let folder = $state(d.folder);
  /** -1: a blank page. */
  let choice = $state(-1);
  // svelte-ignore state_referenced_locally
  let folderTouched = d.lockFolder;
  let nameInput = $state<HTMLInputElement>();

  const own = $derived.by(() => {
    app.version;
    return worldTemplates(app.vault?.pages ?? []);
  });
  /** The world's own templates, or the built-in set until it has some. */
  const templates = $derived<TemplateChoice[]>(own.length ? own : builtInTemplates(app.lang));
  const folders = $derived.by(() => {
    app.version;
    return (app.vault?.folders() ?? []).filter((f) => !TEMPLATE_DIRS.some((dir) => f === dir || f.startsWith(dir + '/')));
  });

  function pick(i: number) {
    choice = i;
    // A template knows where its pages usually go, unless a folder was chosen on purpose.
    if (!folderTouched) folder = (i >= 0 ? templates[i]?.folder : undefined) ?? d.folder;
  }

  async function submit(e: Event) {
    e.preventDefault();
    if (!name.trim()) return;
    const template = choice >= 0 ? templates[choice] : undefined;
    onclose();
    await app.createPage(name, folder, template);
  }

  async function addToWorld() {
    onclose();
    await app.addTemplatesToWorld();
  }

  async function openTemplates() {
    const first = own[0]?.path;
    onclose();
    if (first) await app.openText(first);
  }

  onMount(() => {
    nameInput?.focus();
    nameInput?.select();
  });
</script>

<form class="new-page" onsubmit={submit}>
  <h2 id="dlg-title">{d.title}</h2>
  {#if d.message}<p>{d.message}</p>{/if}

  <label>
    {t('newPage.name')}
    <input type="text" bind:this={nameInput} bind:value={name} autocomplete="off" />
  </label>

  <fieldset class="template-pick">
    <legend>{t('newPage.template')}</legend>
    <div class="template-chips" role="radiogroup" aria-label={t('newPage.template')}>
      <button type="button" role="radio" aria-checked={choice === -1} onclick={() => pick(-1)}>{t('newPage.blank')}</button>
      {#each templates as tpl, i (tpl.path ?? tpl.name)}
        <button type="button" role="radio" aria-checked={choice === i} onclick={() => pick(i)}>{tpl.name}</button>
      {/each}
    </div>
    <p class="dialog-hint">
      {#if own.length}
        {t('newPage.ownTemplates')}
        <button type="button" class="link-btn" onclick={openTemplates}>{t('newPage.editTemplates')}</button>
      {:else}
        {t('newPage.builtIn')}
        <button type="button" class="link-btn" onclick={addToWorld}>{t('newPage.addTemplates')}</button>
      {/if}
    </p>
  </fieldset>

  <label>
    {t('newPage.folder')}
    <input
      type="text"
      bind:value={folder}
      list="new-page-folders"
      placeholder={t('newPage.root')}
      autocomplete="off"
      oninput={() => (folderTouched = true)}
    />
    <datalist id="new-page-folders">{#each folders as f (f)}<option value={f}></option>{/each}</datalist>
  </label>

  <div class="actions">
    <button type="button" class="btn ghost" onclick={onclose}>{t('dialog.cancel')}</button>
    <button type="submit" class="btn primary" disabled={!name.trim()}>{t('dialog.create')}</button>
  </div>
</form>
