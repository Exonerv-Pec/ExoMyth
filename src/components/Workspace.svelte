<script lang="ts">
  import { app } from '../app.svelte';
  import Sidebar from './Sidebar.svelte';
  import Editor from './Editor.svelte';
  import Preview from './Preview.svelte';
  import RelationsPanel from './RelationsPanel.svelte';
  import GraphView from './GraphView.svelte';
  import CardsView from './CardsView.svelte';
  import Icon from './Icon.svelte';
  import { MEDIA_ACCEPT } from '../core/media';

  const t = app.t;

  let { searchInput = $bindable() }: { searchInput?: HTMLInputElement } = $props();

  const page = $derived.by(() => {
    app.version;
    return app.current ? app.vault?.getPage(app.current) : undefined;
  });
  const statusText = $derived(t(`save.${app.saveStatus}` as 'save.saved'));
  const modes = ['edit', 'split', 'preview', 'graph', 'cards'] as const;
  /** Graph and cards show the whole world, not one page's text. */
  const inGraph = $derived(app.mode === 'graph' || app.mode === 'cards');
  let mediaInput = $state<HTMLInputElement>();
</script>

<div class="workspace" style:--sidebar-w="{app.sidebarW}px" style:--panel-w="{app.panelW}px">
  <Sidebar bind:searchInput />

  <main class="center">
    <div class="topbar">
      <button class="icon-btn mobile-only" aria-label={t('nav.sidebar')} title={t('nav.sidebar')} onclick={() => (app.sidebarOpen = !app.sidebarOpen)}>
        <Icon name="menu" />
      </button>
      <button class="icon-btn" aria-label={t('nav.back')} title={t('nav.back')} disabled={!app.canGoBack} onclick={() => app.back()}>
        <Icon name="back" />
      </button>
      <div class="crumb">
        {#if inGraph}
          <span class="name">{app.mode === 'cards' ? t('mode.cards') : t('graph.title')}</span>
          {#if page}<span class="where">{page.title}</span>{/if}
        {:else if page}
          <span class="name">{page.title}</span>
          <span class="where">{page.path}</span>
        {/if}
      </div>
      {#if page && app.canInsert}
        <button class="icon-btn" title={t('media.insert')} aria-label={t('media.insert')} onclick={() => mediaInput?.click()}>
          <Icon name="image" />
        </button>
        <input
          bind:this={mediaInput}
          type="file"
          multiple
          accept={MEDIA_ACCEPT}
          hidden
          onchange={(e) => {
            const input = e.currentTarget;
            const files = [...(input.files ?? [])];
            input.value = '';
            if (files.length) void app.insertMedia(files);
          }}
        />
      {/if}
      {#if page && !inGraph}
        <span class="status" class:error={app.saveStatus === 'error'} role="status">{statusText}</span>
      {/if}
      {#if page || inGraph}
        <div class="seg" role="group" aria-label="{t('mode.edit')} / {t('mode.preview')} / {t('mode.graph')}">
          {#each modes as m (m)}
            <button aria-pressed={app.mode === m} onclick={() => app.setMode(m)} disabled={m !== 'graph' && m !== 'cards' && !page}>
              {t(`mode.${m}` as 'mode.edit')}
            </button>
          {/each}
        </div>
      {/if}
      <button class="icon-btn mobile-only" aria-label={t('nav.panel')} title={t('nav.panel')} onclick={() => (app.panelOpen = !app.panelOpen)}>
        <Icon name="relations" />
      </button>
    </div>

    {#if app.mode === 'graph'}
      <GraphView />
    {:else if app.mode === 'cards'}
      <CardsView />
    {:else if page && app.current}
      <div class="stage" class:split={app.mode === 'split'}>
        {#if app.mode !== 'preview'}
          {#key app.current}
            <Editor path={app.current} />
          {/key}
        {/if}
        {#if app.mode !== 'edit'}
          <Preview path={app.current} />
        {/if}
      </div>
    {:else}
      <div class="empty-state">
        <div>
          <h2>{t('page.empty.title')}</h2>
          <p>{t('page.empty.text')}</p>
          <button class="btn primary" onclick={() => app.askNewPage()}>{t('side.newPage')}</button>
        </div>
      </div>
    {/if}
  </main>

  <RelationsPanel path={app.current} />
</div>
