<script lang="ts">
  import { app } from '../app.svelte';
  import { compareText, baseName, dirName } from '../core/names';
  import { searchPages } from '../core/search';
  import type { Page } from '../core/types';
  import Icon from './Icon.svelte';
  import Resizer from './Resizer.svelte';

  const t = app.t;

  let { searchInput = $bindable() }: { searchInput?: HTMLInputElement } = $props();

  let tab = $state<'files' | 'tags'>('files');
  let query = $state('');
  let activeTag = $state<string | null>(null);

  interface Node {
    name: string;
    path: string;
    folders: Node[];
    pages: Page[];
  }

  const pages = $derived.by(() => {
    app.version;
    return app.vault?.pages ?? [];
  });

  const root = $derived.by(() => {
    const top: Node = { name: '', path: '', folders: [], pages: [] };
    const folderMap = new Map<string, Node>([['', top]]);
    const ensure = (dir: string): Node => {
      const known = folderMap.get(dir);
      if (known) return known;
      const parent = ensure(dirName(dir));
      const node: Node = { name: baseName(dir + '.md'), path: dir, folders: [], pages: [] };
      parent.folders.push(node);
      folderMap.set(dir, node);
      return node;
    };
    for (const p of pages) ensure(dirName(p.path)).pages.push(p);
    const sort = (n: Node) => {
      n.folders.sort((a, b) => compareText(a.name, b.name));
      n.pages.sort((a, b) => compareText(a.title, b.title) || compareText(a.path, b.path));
      n.folders.forEach(sort);
    };
    sort(top);
    return top;
  });

  const results = $derived(query.trim() ? searchPages(pages, query) : []);
  const tags = $derived.by(() => {
    app.version;
    return app.vault?.index.allTags() ?? [];
  });
  const taggedPages = $derived(
    activeTag ? pages.filter((p) => p.tags.includes(activeTag!)).sort((a, b) => compareText(a.title, b.title)) : [],
  );

  function openHit(path: string) {
    query = '';
    void app.open(path);
  }

  function searchKey(e: KeyboardEvent) {
    if (e.key === 'Enter' && results[0]) openHit(results[0].page.path);
    else if (e.key === 'Escape') query = '';
  }
</script>

<aside class="sidebar" class:open={app.sidebarOpen} aria-label={t('side.files')}>
  <Resizer edge="sidebar-edge" value={app.sidebarW} onresize={(w) => app.setSidebarW(w)} label={t('side.files')} />
  <div class="side-head">
    <span class="world" title={app.vault?.storage.label}>{app.vault?.storage.label}</span>
    <button class="icon-btn" title="{t('inbox.title')} (Alt+I)" aria-label={t('inbox.title')} onclick={() => app.askIdea()}>
      <Icon name="bulb" />
    </button>
    <button class="icon-btn" title={t('zip.download')} aria-label={t('zip.download')} onclick={() => app.downloadWorld()}>
      <Icon name="download" />
    </button>
    <button class="icon-btn" title={t('side.newPage')} aria-label={t('side.newPage')} onclick={() => app.askNewPage()}>
      <Icon name="plus" />
    </button>
  </div>

  <div class="side-search">
    <label class="sr-only" for="search">{t('side.search')}</label>
    <input
      id="search"
      type="search"
      placeholder="{t('side.search')} (Ctrl+K)"
      bind:value={query}
      bind:this={searchInput}
      onkeydown={searchKey}
      autocomplete="off"
    />
  </div>

  <div class="side-tabs" role="tablist">
    <button role="tab" aria-selected={tab === 'files'} onclick={() => (tab = 'files')}>{t('side.files')}</button>
    <button role="tab" aria-selected={tab === 'tags'} onclick={() => (tab = 'tags')}>{t('side.tags')}</button>
  </div>

  <div class="side-body">
    {#if query.trim()}
      {#if results.length === 0}
        <p class="side-note">{t('side.search.empty')}</p>
      {:else}
        {#each results as hit (hit.page.path)}
          <button class="hit" onclick={() => openHit(hit.page.path)}>
            <span class="t">{hit.page.title}</span>
            {#if hit.snippet}<span class="s">{hit.snippet}</span>{/if}
          </button>
        {/each}
      {/if}
    {:else if tab === 'files'}
      {#if pages.length === 0}
        <p class="side-note">{t('side.noPages')}</p>
      {:else}
        {@render folder(root)}
      {/if}
    {:else if tags.length === 0}
      <p class="side-note">{t('side.tag.empty')}</p>
    {:else}
      <div class="tag-list">
        {#each tags as tg (tg.tag)}
          <button
            class="chip"
            aria-pressed={activeTag === tg.tag}
            onclick={() => (activeTag = activeTag === tg.tag ? null : tg.tag)}
          >
            {tg.tag} <span class="n">{tg.count}</span>
          </button>
        {/each}
      </div>
      {#each taggedPages as p (p.path)}
        <button class="hit" onclick={() => openHit(p.path)}><span class="t">{p.title}</span></button>
      {/each}
    {/if}
  </div>

  <div class="side-foot">
    <button class="btn ghost grow" onclick={() => { void app.flush().then(() => app.closeVault()); }}>
      <Icon name="swap" /> {t('side.changeWorld')}
    </button>
    <button class="icon-btn" title={t(`theme.${app.theme}` as 'theme.auto')} aria-label={t(`theme.${app.theme}` as 'theme.auto')} onclick={() => app.cycleTheme()}>
      <Icon name="theme" />
    </button>
    <button class="btn ghost" onclick={() => app.toggleLang()}>{t('lang.switch')}</button>
  </div>
</aside>

{#snippet folder(node: Node)}
  <ul class="tree">
    {#each node.folders as f (f.path)}
      {@const closed = app.collapsed['dir:' + f.path]}
      <li>
        <div class="tree-row">
          <button class="tree-item" aria-expanded={!closed} onclick={() => app.toggleCollapsed('dir:' + f.path)}>
            <span class="caret" class:open={!closed}>▸</span>
            <span class="label">{f.name}</span>
          </button>
          <span class="row-actions">
            <button class="icon-btn" title={t('side.newInFolder')} aria-label={t('side.newInFolder')} onclick={() => app.askNewPage(f.path)}>
              <Icon name="plus" />
            </button>
          </span>
        </div>
        {#if !closed}{@render folder(f)}{/if}
      </li>
    {/each}
    {#each node.pages as p (p.path)}
      <li>
        <div class="tree-row" class:active={app.current === p.path}>
          <button class="tree-item" onclick={() => app.open(p.path)} aria-current={app.current === p.path ? 'page' : undefined}>
            <span class="caret"></span>
            <span class="label">{p.title}</span>
          </button>
          <span class="row-actions">
            <button class="icon-btn" title={t('dialog.rename')} aria-label={t('dialog.rename')} onclick={() => app.askRename(p.path)}>
              <Icon name="pencil" />
            </button>
            <button class="icon-btn" title={t('dialog.delete.confirm')} aria-label={t('dialog.delete.confirm')} onclick={() => app.askTrash(p.path)}>
              <Icon name="trash" />
            </button>
          </span>
        </div>
      </li>
    {/each}
  </ul>
{/snippet}
