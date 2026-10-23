<script lang="ts">
  import { app } from '../app.svelte';
  import { dossier, folderCards, folderTabs, type DossierGroup } from '../core/cards';
  import { folderColorSlots } from '../core/layout';
  import { renderMarkdown } from '../core/render';
  import { embeds } from '../embeds';
  import { previewLinks } from '../actions';
  import MediaThumb from './MediaThumb.svelte';
  import PageCard from './PageCard.svelte';

  const t = app.t;

  /** `null`: the dossier of the current page. A folder name: all pages of that folder. */
  let folder = $state<string | null>(null);

  const index = $derived.by(() => {
    app.version;
    return app.vault?.index;
  });
  const tabs = $derived(index ? folderTabs(index) : []);
  const slots = $derived(folderColorSlots(tabs.map((x) => x.folder), app.layout?.groups));
  const colorOf = (group: string) => (slots[group] === undefined ? 'var(--g-root)' : `var(--g${slots[group]})`);

  const doc = $derived(index && app.current && folder === null ? dossier(index, app.current) : undefined);
  const collection = $derived(index && folder !== null ? folderCards(index, folder) : []);
  const excerptHtml = $derived(doc && index ? renderMarkdown(doc.page.excerpt, index) : '');

  // Following a link elsewhere (sidebar, panel) shows that page's dossier.
  let lastCurrent = app.current;
  $effect(() => {
    if (app.current !== lastCurrent) {
      lastCurrent = app.current;
      folder = null;
    }
  });

  function groupLabel(g: DossierGroup): string {
    if (g.section === 'mentions') return t('panel.section.mentions');
    if (g.section === 'links') return t('panel.section.links');
    if (g.section === 'inverse') return g.inverseLabel ?? `← ${g.type}`;
    return g.type;
  }

  function select(path: string | undefined, target: string) {
    if (path) {
      folder = null;
      void app.open(path);
    } else {
      app.confirmCreate(target);
    }
  }

  function openText(path: string | undefined) {
    if (path) void app.openText(path);
  }
</script>

<div class="cards-view">
  <div class="cards-tabs" role="tablist" aria-label={t('cards.tabs')}>
    <button role="tab" aria-selected={folder === null} onclick={() => (folder = null)} disabled={!app.current}>
      {t('cards.dossier')}
    </button>
    {#each tabs as tab (tab.folder)}
      <button role="tab" aria-selected={folder === tab.folder} onclick={() => (folder = tab.folder)} style:--c={colorOf(tab.folder)}>
        <span class="tab-dot"></span>{tab.folder || t('graph.root')}<span class="tab-count">{tab.count}</span>
      </button>
    {/each}
  </div>

  <div class="cards-scroll">
    {#if folder !== null}
      <section class="cards-section" aria-label={folder || t('graph.root')}>
        <div class="card-grid">
          {#each collection as card (card.path)}
            <PageCard
              {card}
              color={colorOf(card.group)}
              selected={card.path === app.current}
              onselect={() => select(card.path, card.target)}
              onopen={() => openText(card.path)}
            />
          {/each}
        </div>
      </section>
    {:else if doc}
      <article class="dossier-hero" style:--c={colorOf(doc.page.group)}>
        <div class="hero-media" aria-hidden="true">
          <MediaThumb target={doc.page.image} alt="">
            {#snippet fallback()}
              <span class="hero-initials">{doc.page.initials}</span>
            {/snippet}
          </MediaThumb>
        </div>
        <div class="hero-body">
          <p class="hero-folder"><span class="tab-dot"></span>{doc.page.folder || t('graph.root')}</p>
          <h2 class="hero-title">{doc.page.title}</h2>
          {#if doc.page.aliases.length}<p class="hero-aka">{t('page.aliases', doc.page.aliases.join(', '))}</p>{/if}
          {#if doc.page.tags.length}
            <div class="tag-row">{#each doc.page.tags as tag (tag)}<span class="chip">{tag}</span>{/each}</div>
          {/if}
          {#if doc.page.allFacts.length}
            <dl class="hero-facts">
              {#each doc.page.allFacts as f (f.key)}
                <div><dt>{f.key}</dt><dd>{f.value.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a, b) => b ?? a)}</dd></div>
              {/each}
            </dl>
          {/if}
          {#if excerptHtml}
            <div class="prose hero-excerpt" class:faded={doc.page.truncated} use:previewLinks use:embeds={excerptHtml}>
              <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
              <div
                onclick={(e) => {
                  const a = (e.target as HTMLElement).closest<HTMLAnchorElement>('a.wikilink');
                  if (a) {
                    e.preventDefault();
                    void app.openTarget(a.dataset.target ?? '', a.dataset.heading);
                  }
                }}
              >
                {@html excerptHtml}
              </div>
            </div>
          {/if}
          <div class="hero-actions">
            <button class="btn primary" onclick={() => openText(doc.page.path)}>{t('cards.open')}</button>
            <button class="btn ghost" onclick={() => app.showOnGraph(doc.page.path ?? null)}>{t('panel.onGraph')}</button>
          </div>
        </div>
      </article>

      {#if doc.groups.length === 0}
        <p class="cards-note">{t('cards.empty')}</p>
      {/if}
      {#each doc.groups as g (g.key)}
        <section class="cards-section">
          <h3 class="cards-group">
            {groupLabel(g)}<span class="count">{g.items.length}</span>
            {#if g.section === 'inverse' && g.inverseLabel}<span class="sub">({t('panel.inverse', g.type)})</span>{/if}
          </h3>
          <div class="card-grid">
            {#each g.items as item (item.key)}
              <PageCard
                card={item}
                color={colorOf(item.group)}
                count={item.count}
                onselect={() => select(item.path, item.target)}
                onopen={() => openText(item.path)}
              />
            {/each}
          </div>
        </section>
      {/each}
    {:else}
      <p class="cards-note">{t('cards.select')}</p>
    {/if}
  </div>
</div>
