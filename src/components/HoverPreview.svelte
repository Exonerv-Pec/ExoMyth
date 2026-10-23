<script lang="ts">
  import { app } from '../app.svelte';
  import { pagePreview } from '../core/preview';
  import { renderMarkdown } from '../core/render';
  import { embeds } from '../embeds';

  const t = app.t;
  let card = $state<HTMLElement>();
  let pos = $state<{ left: number; top: number; below: boolean } | null>(null);

  const preview = $derived.by(() => {
    app.version;
    const h = app.hover;
    return h && app.vault ? pagePreview(app.vault.index, h.target, h.heading) : null;
  });

  const body = $derived.by(() => {
    app.version;
    return preview?.excerpt && app.vault ? renderMarkdown(preview.excerpt, app.vault.index) : '';
  });

  const facts = $derived.by(() => {
    app.version;
    if (!preview || !app.vault) return [];
    const index = app.vault.index;
    return preview.facts.map((f) => ({
      key: f.key,
      html: renderMarkdown(f.value, index).replace(/^<p>([\s\S]*)<\/p>\s*$/, '$1'),
    }));
  });

  // Place the card under the link, or above it when there is more room there; keep it on screen.
  $effect(() => {
    const h = app.hover;
    preview;
    if (!h || !card) {
      pos = null;
      return;
    }
    const w = card.offsetWidth;
    const ht = card.offsetHeight;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const margin = 8;
    if (h.placement === 'corner') {
      // Pinned inside the top-right corner of the given area (the graph), clear of what is hovered.
      pos = {
        left: Math.max(h.rect.left + margin, h.rect.right - w - 12),
        top: Math.max(margin, h.rect.top + 12),
        below: true,
      };
      return;
    }
    const spaceBelow = vh - h.rect.bottom;
    const below = spaceBelow >= ht + margin * 2 || spaceBelow >= h.rect.top;
    const top = below ? h.rect.bottom + 6 : Math.max(margin, h.rect.top - ht - 6);
    const left = Math.min(Math.max(margin, h.rect.left), Math.max(margin, vw - w - margin));
    pos = { left, top: Math.min(top, Math.max(margin, vh - ht - margin)), below };
  });

  function onclick(e: MouseEvent) {
    const el = e.target as HTMLElement | null;
    const spoiler = el?.closest<HTMLElement>('.spoiler');
    if (spoiler) {
      spoiler.classList.toggle('revealed');
      return;
    }
    const link = el?.closest<HTMLAnchorElement>('a.wikilink');
    if (link) {
      e.preventDefault();
      app.hoverClose();
      void app.openTarget(link.dataset.target ?? '', link.dataset.heading);
    }
  }

  function openPage() {
    const p = preview;
    app.hoverClose();
    if (p?.path) void app.openText(p.path, p.heading);
  }

  function createPage() {
    const p = preview;
    app.hoverClose();
    if (p) app.confirmCreate(p.target, app.current?.includes('/') ? app.current.slice(0, app.current.lastIndexOf('/')) : '');
  }
</script>

<svelte:window onkeydown={(e) => e.key === 'Escape' && app.hover && app.hoverClose()} />

{#if app.hover && preview}
  <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
  <section
    class="hovercard"
    class:placed={!!pos}
    class:above={pos && !pos.below}
    class:corner={app.hover.placement === 'corner'}
    bind:this={card}
    style:left="{pos?.left ?? -9999}px"
    style:top="{pos?.top ?? -9999}px"
    aria-label={t('preview.label', preview.title)}
    onmouseenter={() => app.hoverKeep()}
    onmouseleave={() => app.hoverEnd()}
    {onclick}
  >
    {#if preview.exists}
      <header>
        <h3>{preview.title}</h3>
        {#if preview.heading}
          <p class="meta">{t('preview.section', preview.heading)}</p>
        {:else if preview.folder || preview.aliases.length}
          <p class="meta">
            {preview.folder}{#if preview.folder && preview.aliases.length}<span class="sep" aria-hidden="true"></span>{/if}{#if preview.aliases.length}{t('page.aliases', preview.aliases.join(', '))}{/if}
          </p>
        {/if}
      </header>
      {#if facts.length > 0}
        <dl class="facts" use:embeds={facts}>
          {#each facts as f (f.key)}
            <dt>{f.key}</dt>
            <dd>{@html f.html}</dd>
          {/each}
        </dl>
      {/if}
      {#if body}
        <div class="prose excerpt" class:faded={preview.truncated} use:embeds={body}>{@html body}</div>
      {/if}
      <footer>
        <span>{t('preview.relations', preview.relations)}</span>
        <span>{t('preview.backlinks', preview.backlinks)}</span>
        <button class="btn ghost" onclick={openPage}>{t('preview.open')}</button>
      </footer>
    {:else}
      <header><h3 class="missing">{preview.title}</h3></header>
      <p class="meta">{t('preview.missing')}</p>
      <footer><button class="btn" onclick={createPage}>{t('panel.create')}</button></footer>
    {/if}
  </section>
{/if}
