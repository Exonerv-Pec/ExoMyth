<script lang="ts">
  import { app, WORLD_MODES } from '../app.svelte';
  import Sidebar from './Sidebar.svelte';
  import Editor from './Editor.svelte';
  import Preview from './Preview.svelte';
  import RelationsPanel from './RelationsPanel.svelte';
  import GraphView from './GraphView.svelte';
  import CardsView from './CardsView.svelte';
  import TimelineView from './TimelineView.svelte';
  import BookView from './BookView.svelte';
  import Icon from './Icon.svelte';
  import { MEDIA_ACCEPT } from '../core/media';
  import { wordCount } from '../core/writing';
  import { countWords } from '../i18n';
  import { dayKey } from '../core/stats';
  import type { Page } from '../core/types';

  const t = app.t;

  let { searchInput = $bindable() }: { searchInput?: HTMLInputElement } = $props();

  const page = $derived.by(() => {
    app.version;
    return app.current ? app.vault?.getPage(app.current) : undefined;
  });
  const statusText = $derived(t(`save.${app.saveStatus}` as 'save.saved'));
  const modes = ['edit', 'split', 'preview', 'graph', 'cards', 'timeline', 'book'] as const;
  /** Graph, cards and the timeline show the whole world, not one page's text. */
  const inGraph = $derived(WORLD_MODES.includes(app.mode));
  const worldTitle = $derived(app.mode === 'cards' ? t('mode.cards') : app.mode === 'timeline' ? t('timeline.title') : app.mode === 'book' ? t('book.title') : t('graph.title'));
  let mediaInput = $state<HTMLInputElement>();
  // A page object is replaced whenever the page changes, so its count can be remembered until then.
  const counted = new WeakMap<Page, number>();
  const wordsOf = (p: Page) => counted.get(p) ?? counted.set(p, wordCount(p.body)).get(p)!;
  const pageWords = $derived(page ? wordsOf(page) : 0);
  const worldWords = $derived.by(() => {
    app.version;
    return page ? (app.vault?.index.worldPages ?? []).reduce((n, p) => n + wordsOf(p), 0) : 0;
  });
  /** "+120 today", or "120 of 500 today" with a goal; nothing until there is something to say. */
  const todayText = $derived.by(() => {
    if (!app.on('writingStats')) return '';
    const words = app.stats.days[dayKey()]?.words ?? 0;
    const goal = app.stats.goal;
    const num = (n: number) => n.toLocaleString(app.lang === 'ru' ? 'ru-RU' : 'en-US');
    if (goal) return t('stats.chip.goal', num(words), num(goal));
    return words > 0 ? t('stats.chip.today', num(words)) : '';
  });
</script>

<div class="workspace" class:focus={app.focus} class:typewriter={app.focus && app.on('typewriter')} class:no-panel={!app.on('relationsPanel')} style:--sidebar-w="{app.sidebarW}px" style:--panel-w="{app.panelW}px">
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
          <span class="name">{worldTitle}</span>
          {#if page}<span class="where">{page.title}</span>{/if}
        {:else if page}
          <span class="name">{page.title}</span>
          <span class="where">{page.path}</span>
        {/if}
      </div>
      {#if app.on('quickLookup')}
        <button class="icon-btn" title="{t('lookup.title')} (Ctrl+K)" aria-label={t('lookup.title')} onclick={() => (app.lookupOpen = true)}>
          <Icon name="search" />
        </button>
      {/if}
      {#if app.on('writingStats')}
        <button class="icon-btn" title={t('stats.title')} aria-label={t('stats.title')} onclick={() => (app.statsOpen = true)}>
          <Icon name="chart" />
        </button>
      {/if}
      {#if page && app.canInsert}
        <button
          class="icon-btn"
          class:on={app.spellcheck}
          title={app.spellcheck ? t('spell.off') : t('spell.on')}
          aria-label={t('spell.label')}
          aria-pressed={app.spellcheck}
          onclick={() => app.toggleSpellcheck()}
        >
          <Icon name="spell" />
        </button>
        {#if app.on('focusMode')}
          <button class="icon-btn" title="{t('focus.enter')} (Ctrl+.)" aria-label={t('focus.enter')} onclick={() => app.setFocus(true)}>
            <Icon name="focus" />
          </button>
        {/if}
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
        <span class="page-meta">
          <span class="status" class:error={app.saveStatus === 'error'} role="status">{statusText}</span>
          <span class="meta-line">
            {#if app.on('wordCount')}
              <span class="words" title={t('words.world', countWords(app.lang, worldWords))}>{countWords(app.lang, pageWords)}</span>
            {/if}
            {#if todayText}
              <button class="stats-chip" title={t('stats.chip.title')} onclick={() => (app.statsOpen = true)}>{todayText}</button>
            {/if}
          </span>
        </span>
      {/if}
      {#if page || inGraph}
        <div class="seg" role="group" aria-label="{t('mode.edit')} / {t('mode.preview')} / {t('mode.graph')}">
          {#each modes.filter((m) => app.modeOn(m)) as m (m)}
            <button aria-pressed={app.mode === m} onclick={() => app.setMode(m)} disabled={!WORLD_MODES.includes(m) && !page}>
              {t(`mode.${m}` as 'mode.edit')}
            </button>
          {/each}
        </div>
      {/if}
      {#if app.on('relationsPanel')}
        <button class="icon-btn mobile-only" aria-label={t('nav.panel')} title={t('nav.panel')} onclick={() => (app.panelOpen = !app.panelOpen)}>
          <Icon name="relations" />
        </button>
      {/if}
    </div>

    {#if app.mode === 'graph' && app.modeOn('graph')}
      <GraphView />
    {:else if app.mode === 'cards' && app.modeOn('cards')}
      <CardsView />
    {:else if app.mode === 'timeline' && app.modeOn('timeline')}
      <TimelineView />
    {:else if app.mode === 'book' && app.modeOn('book')}
      <BookView />
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
          {#if app.on('storyProjects')}
            <button class="btn ghost" onclick={() => app.askProject()}>{t('project.new')}</button>
          {/if}
        </div>
      </div>
    {/if}
  </main>

  {#if app.on('relationsPanel')}<RelationsPanel path={app.current} />{/if}

  {#if app.focus}
    <button class="focus-exit btn ghost" onclick={() => app.setFocus(false)} title="{t('focus.exit')} (Esc)">
      <Icon name="focus" /> {t('focus.exit')}
    </button>
    {#if page && (app.on('wordCount') || todayText)}
      <span class="focus-words" aria-live="polite">
        {#if app.on('wordCount')}{countWords(app.lang, pageWords)}{/if}{#if app.on('wordCount') && todayText}{' · '}{/if}{todayText}
      </span>
    {/if}
  {/if}
</div>
