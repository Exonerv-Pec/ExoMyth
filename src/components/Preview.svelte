<script lang="ts">
  import { app } from '../app.svelte';
  import { renderMarkdown, headingSlug } from '../core/render';
  import { pageFacts } from '../core/preview';
  import { previewLinks } from '../actions';
  import { embeds } from '../embeds';
  import type { Page } from '../core/types';
  import { pageImage } from '../core/cards';
  import MediaThumb from './MediaThumb.svelte';
  import MapView from './MapView.svelte';
  import PlaylistPlayer from './PlaylistPlayer.svelte';
  import MoodBoard from './MoodBoard.svelte';
  import { isBoard } from '../core/board';
  import { mapOf } from '../core/maps';
  import { isPlaylist, withoutTracks } from '../core/playlist';

  let { path }: { path: string } = $props();
  const t = app.t;

  let container = $state<HTMLElement>();

  const page = $derived.by<Page | undefined>(() => {
    app.version;
    return app.vault?.getPage(path);
  });

  /** The page's own first heading is not repeated when it only says the page title again. */
  function withoutTitleHeading(body: string, title: string): string {
    const m = /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(\r?\n|$)/.exec(body);
    return m && m[1]!.trim().toLocaleLowerCase() === title.trim().toLocaleLowerCase() ? body.slice(m[0].length) : body;
  }

  /** A page with `playlist: true` shows a player; its track lines are listed there instead of in the text. */
  const playlist = $derived.by(() => {
    app.version;
    return !!page && app.on('playlists') && isPlaylist(page);
  });

  const html = $derived.by(() => {
    app.version;
    if (!page || !app.vault) return '';
    const body = playlist ? withoutTracks(page.body) : page.body;
    return renderMarkdown(withoutTitleHeading(body, page.title), app.vault.index);
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
      {#if playlist}
        <PlaylistPlayer {path} />
      {/if}
      {#if app.on('moodBoards') && isBoard(page)}
        <MoodBoard {path} />
      {/if}
      {#if mapOf(page)}
        {#if app.on('maps')}<MapView {path} />{/if}
      {/if}
      {#if facts.length > 0 || pageImage(page)}
        <aside class="infobox">
          {#if pageImage(page)}
            <div class="infobox-image"><MediaThumb target={pageImage(page)} alt={page.title} /></div>
          {/if}
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
