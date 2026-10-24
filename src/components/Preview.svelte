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
    return renderMarkdown(withoutTitleHeading(body, page.title), app.vault.index, { comments: app.on('revision') });
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
    if (showComment(el)) return;
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

  let placed: HTMLElement | null = null;
  /** Keeps a comment's words inside the window: near an edge they are moved sideways. */
  function placeTip(e: Event) {
    const note = (e.target as HTMLElement | null)?.closest?.<HTMLElement>('.critic-note');
    const tip = note?.querySelector<HTMLElement>('.critic-tip');
    if (!tip || (e.type === 'mouseover' && note === placed)) return;
    placed = note!;
    tip.style.transform = '';
    requestAnimationFrame(() => {
      const r = tip.getBoundingClientRect();
      if (!r.width) return;
      const margin = 8;
      const dx = r.left < margin ? margin - r.left : r.right > window.innerWidth - margin ? window.innerWidth - margin - r.right : 0;
      if (dx) tip.style.transform = `translateX(calc(-50% + ${Math.round(dx)}px))`;
    });
  }

  /** A comment in the text: its words open on touch, and the editing panel points to it. */
  function showComment(el: HTMLElement): boolean {
    const hit = el.closest<HTMLElement>('.critic-note, .critic-mark');
    if (!hit) return false;
    const n = Number(hit.dataset.critic);
    const note = hit.classList.contains('critic-note') ? hit : (hit.nextElementSibling as HTMLElement | null);
    for (const open of container?.querySelectorAll('.critic-note.open') ?? []) if (open !== note) open.classList.remove('open');
    if (note?.classList.contains('critic-note')) {
      note.classList.toggle('open');
      placeTip({ target: note } as unknown as Event);
    }
    // An open editing panel points out the same comment.
    if (n > 0) app.revisionFocus = { n, seq: (app.revisionFocus?.seq ?? 0) + 1 };
    return true;
  }

  function onkeydown(e: KeyboardEvent) {
    const el = e.target as HTMLElement | null;
    if ((e.key === 'Enter' || e.key === ' ') && el?.classList.contains('critic-note')) {
      e.preventDefault();
      showComment(el);
      return;
    }
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
<article class="reading" bind:this={container} {onclick} {onkeydown} onmouseover={placeTip} onfocusin={placeTip} use:previewLinks use:embeds={[html, facts]}>
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
