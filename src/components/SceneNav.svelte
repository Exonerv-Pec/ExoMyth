<script lang="ts">
  import { app } from '../app.svelte';
  import { scenePlace, statusOf, STATUSES, worldBooks, type BookScene } from '../core/manuscript';
  import { stripMd } from '../core/names';
  import { previewOn } from '../actions';
  import type { Key } from '../i18n';

  let { path }: { path: string } = $props();
  const t = app.t;

  const place = $derived.by(() => {
    app.version;
    const index = app.vault?.index;
    return index ? scenePlace(worldBooks(index), path) : undefined;
  });
  const status = $derived.by(() => {
    app.version;
    return statusOf(app.vault?.getPage(path)?.frontmatter.status);
  });
  const name = (s: BookScene) => (s.path ? (app.vault?.getPage(s.path)?.title ?? s.target) : s.target);

  function go(s: BookScene | undefined) {
    if (!s) return;
    if (s.path) void app.openText(s.path);
    else app.confirmCreate(s.target);
  }

  function showBook() {
    if (!place) return;
    app.setBook(place.book.path);
    app.setMode('book');
  }
</script>

{#if place}
  {@const chapter = place.book.chapters[place.chapter]}
  <section class="scene-nav" aria-label={t('book.title')}>
    <button class="link-btn scene-nav-book" onclick={showBook}>📖 {place.book.title}</button>
    <p class="scene-nav-where">
      {#if chapter?.title}{`${chapter.title} · `}{/if}{t('book.inBook', place.position + 1, place.total)}
    </p>
    <div class="scene-nav-steps">
      <button
        class="btn ghost"
        disabled={!place.prev}
        title={place.prev ? name(place.prev) : t('book.prev')}
        use:previewOn={place.prev?.path ? { target: stripMd(place.prev.path) } : null}
        onclick={() => go(place.prev)}>‹ {t('book.prev')}</button
      >
      <button
        class="btn ghost"
        disabled={!place.next}
        title={place.next ? name(place.next) : t('book.next')}
        use:previewOn={place.next?.path ? { target: stripMd(place.next.path) } : null}
        onclick={() => go(place.next)}>{t('book.next')} ›</button
      >
    </div>
    <div class="scene-nav-status" role="group" aria-label={t('book.status')}>
      {#each STATUSES as st (st)}
        <button class="sc-status st-{st}" aria-pressed={status === st} onclick={() => app.setSceneStatus(path, st)}>{t(`status.${st}` as Key)}</button>
      {/each}
    </div>
  </section>
{/if}
