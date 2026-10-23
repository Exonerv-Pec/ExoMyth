<script lang="ts">
  import { app } from '../app.svelte';
  import { renderMarkdown, headingSlug } from '../core/render';
  import { pageFacts } from '../core/preview';
  import { previewLinks } from '../actions';
  import { embeds } from '../embeds';
  import type { Page } from '../core/types';

  let { path }: { path: string } = $props();
  const t = app.t;

  let container = $state<HTMLElement>();

  const page = $derived.by<Page | undefined>(() => {
    app.version;
    return app.vault?.getPage(path);
  });

  const html = $derived.by(() => {
    app.version;
    return page && app.vault ? renderMarkdown(page.body, app.vault.index) : '';
  });

  /** Facts for the infobox: every non-structural field with a simple value. */
  const facts = $derived.by(() => {
    app.version;
    if (!page || !app.vault) return [];
    const index = app.vault.index;
    return pageFacts(page).map((f) => ({
      key: f.key,
      html: renderMarkdown(f.value, index).replace(/^<p>([\s\S]*)<\/p>\s*$/, '$1'),
    }));
  });

  function onclick(e: MouseEvent) {
    const el = e.target as HTMLElement | null;
    if (!el) return;
    const spoiler = el.closest<HTMLElement>('.spoiler');
    if (spoiler) {
      spoiler.classList.toggle('revealed');
      return;
    }
    const link = el.closest<HTMLAnchorElement>('a');
    if (!link) return;
    if (link.classList.contains('wikilink')) {
      e.preventDefault();
      void app.openTarget(link.dataset.target ?? '', link.dataset.heading);
    } else if (/^https?:/i.test(link.getAttribute('href') ?? '')) {
      e.preventDefault();
      window.open(link.href, '_blank', 'noopener,noreferrer');
    } else if (link.getAttribute('href') === '#') {
      e.preventDefault();
    }
  }

  function onkeydown(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    if ((e.key === 'Enter' || e.key === ' ') && el?.classList.contains('spoiler')) {
      e.preventDefault();
      el.classList.toggle('revealed');
    }
  }

  // Scroll to a heading after following [[Page#Heading]].
  $effect(() => {
    html;
    const heading = app.pendingHeading;
    if (!heading || !container) return;
    queueMicrotask(() => {
      const target = container?.querySelector(`#${CSS.escape(headingSlug(heading))}`);
      if (target) {
        target.scrollIntoView({ block: 'start' });
        app.pendingHeading = null;
      }
    });
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_noninteractive_element_interactions -->
<article class="reading" bind:this={container} {onclick} {onkeydown} use:previewLinks use:embeds={[html, facts]}>
  {#if page}
    <div class="reading-inner">
      <h1 class="page-title">{page.title}</h1>
      {#if page.aliases.length > 0}
        <p class="aka">{t('page.aliases', page.aliases.join(', '))}</p>
      {/if}
      {#if page.tags.length > 0}
        <div class="tag-row">
          {#each page.tags as tag (tag)}<span class="chip">{tag}</span>{/each}
        </div>
      {/if}
      {#if page.parseError}
        <p class="notice" role="alert">{t('page.parseError', page.parseError)}</p>
      {/if}
      {#if facts.length > 0}
        <aside class="infobox">
          <dl>
            {#each facts as f (f.key)}
              <dt>{f.key}</dt>
              <dd>{@html f.html}</dd>
            {/each}
          </dl>
        </aside>
      {/if}
      <div class="prose">{@html html}</div>
    </div>
  {/if}
</article>
