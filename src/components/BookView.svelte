<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../app.svelte';
  import { sceneInfo, sceneText, STATUSES, worldBooks, type BookScene, type SceneInfo } from '../core/manuscript';
  import { renderMarkdown } from '../core/render';
  import { stripMd } from '../core/names';
  import { wordCount } from '../core/writing';
  import { countWords, type Key } from '../i18n';
  import { previewLinks, previewOn } from '../actions';
  import { embeds } from '../embeds';

  const t = app.t;

  const index = $derived.by(() => {
    app.version;
    return app.vault?.index;
  });
  const books = $derived(index ? worldBooks(index) : []);
  const book = $derived(books.find((b) => b.path === app.bookPath) ?? books[0]);

  let tab = $state<'board' | 'read'>('board');
  let sceneTitles = $state(true);

  /* --------------------------------------------------------- scenes */

  const infoCache = new WeakMap<object, SceneInfo>();
  function info(scene: BookScene): SceneInfo | undefined {
    const page = scene.path ? index?.get(scene.path) : undefined;
    if (!page) return undefined;
    return infoCache.get(page) ?? infoCache.set(page, sceneInfo(page)).get(page);
  }
  const title = (scene: BookScene) => (scene.path ? (index?.get(scene.path)?.title ?? scene.target) : scene.target);

  const totals = $derived.by(() => {
    const counts: Record<string, number> = { idea: 0, draft: 0, revised: 0, done: 0, none: 0 };
    let words = 0;
    let scenes = 0;
    for (const ch of book?.chapters ?? []) {
      for (const s of ch.scenes) {
        scenes++;
        const i = info(s);
        words += i?.words ?? 0;
        counts[i?.status ?? 'none'] = (counts[i?.status ?? 'none'] ?? 0) + 1;
      }
    }
    return { counts, words, scenes };
  });
  const chapterWords = (c: number) => book?.chapters[c]?.scenes.reduce((n, s) => n + (info(s)?.words ?? 0), 0) ?? 0;

  /* ------------------------------------------------------ drag and drop */

  let drag = $state<{ c: number; s: number; path?: string } | null>(null);
  let dropAt = $state<{ c: number; s: number } | null>(null);

  function dragStart(e: DragEvent, c: number, s: number, scene: BookScene) {
    drag = { c, s, ...(scene.path ? { path: scene.path } : {}) };
    e.dataTransfer?.setData('text/plain', `[[${scene.target}]]`);
    if (e.dataTransfer) e.dataTransfer.effectAllowed = 'move';
  }

  /** Where in a chapter the dragged scene would land, counted without the scene itself. */
  function dragOver(e: DragEvent, c: number) {
    if (!drag) return;
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move';
    const column = e.currentTarget as HTMLElement;
    const cards = [...column.querySelectorAll<HTMLElement>('.scene-card')].filter((el) => !(drag!.c === c && Number(el.dataset.s) === drag!.s));
    let at = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const r = cards[i]!.getBoundingClientRect();
      if (e.clientY < r.top + r.height / 2) {
        at = i;
        break;
      }
    }
    if (dropAt?.c !== c || dropAt.s !== at) dropAt = { c, s: at };
  }

  async function drop(e: DragEvent) {
    e.preventDefault();
    const from = drag;
    const to = dropAt;
    drag = null;
    dropAt = null;
    if (!from || !to || !book) return;
    if (from.c === to.c && from.s === to.s) return;
    await app.moveScene(book.path, { c: from.c, s: from.s }, to);
  }

  function dragEnd() {
    drag = null;
    dropAt = null;
  }

  /** Position (in the shown list, without the dragged card) where the drop line goes. */
  const lineBefore = (c: number, s: number) => {
    if (!drag || !dropAt || dropAt.c !== c) return false;
    const shown = drag.c === c && s > drag.s ? s - 1 : s;
    return !(drag.c === c && s === drag.s) && shown === dropAt.s;
  };
  const lineAtEnd = (c: number) => {
    if (!drag || !dropAt || dropAt.c !== c || !book) return false;
    const count = book.chapters[c]!.scenes.length - (drag.c === c ? 1 : 0);
    return dropAt.s >= count;
  };

  /* --------------------------------------------------------- keyboard */

  async function cardKey(e: KeyboardEvent, c: number, s: number, scene: BookScene) {
    if (!book) return;
    if (e.key === 'Enter') {
      e.preventDefault();
      if (scene.path) void app.openText(scene.path);
      else app.confirmCreate(scene.target);
      return;
    }
    if (!e.altKey) return;
    const chapters = book.chapters;
    let to: { c: number; s: number } | undefined;
    if (e.key === 'ArrowUp' && s > 0) to = { c, s: s - 1 };
    else if (e.key === 'ArrowDown' && s < chapters[c]!.scenes.length - 1) to = { c, s: s + 1 };
    else if (e.key === 'ArrowLeft' && c > 0) to = { c: c - 1, s: chapters[c - 1]!.scenes.length };
    else if (e.key === 'ArrowRight' && c < chapters.length - 1) to = { c: c + 1, s: 0 };
    if (!to) return;
    e.preventDefault();
    await app.moveScene(book.path, { c, s }, to);
    await tick();
    // Keep the keyboard on the moved scene.
    [...document.querySelectorAll<HTMLElement>('.scene-card')].find((el) => scene.path && el.dataset.path === scene.path)?.focus();
  }

  let lastClick = { key: '', time: 0 };
  function choose(scene: BookScene) {
    if (!scene.path) {
      app.confirmCreate(scene.target);
      return;
    }
    const now = performance.now();
    if (lastClick.key === scene.path && now - lastClick.time < 400) {
      lastClick = { key: '', time: 0 };
      void app.openText(scene.path);
      return;
    }
    lastClick = { key: scene.path, time: now };
    void app.open(scene.path);
  }

  function askRemove(c: number, s: number, scene: BookScene) {
    if (!book) return;
    const path = book.path;
    app.dialog = {
      kind: 'confirm',
      title: t('book.scene.remove'),
      message: t('book.scene.removeConfirm', title(scene)),
      confirmLabel: t('book.scene.remove'),
      onConfirm: () => void app.removeScene(path, c, s),
    };
  }

  /* ------------------------------------------------------------ reading */

  const reading = $derived.by(() => {
    if (tab !== 'read' || !book || !index) return [];
    return book.chapters.map((ch) => ({
      title: ch.title,
      scenes: ch.scenes.map((s) => {
        const page = s.path ? index.get(s.path) : undefined;
        const text = page ? sceneText(page) : '';
        return { scene: s, title: title(s), html: text ? renderMarkdown(text, index) : '', words: text ? wordCount(text) : 0 };
      }),
    }));
  });

  function readClick(e: MouseEvent) {
    const el = e.target as HTMLElement | null;
    const spoiler = el?.closest<HTMLElement>('.spoiler');
    if (spoiler) {
      spoiler.classList.toggle('revealed');
      return;
    }
    const link = el?.closest<HTMLAnchorElement>('a.wikilink');
    if (link) {
      e.preventDefault();
      void app.openTarget(link.dataset.target ?? '', link.dataset.heading);
    }
  }
</script>

<div class="book-view">
  {#if !book}
    <div class="tl-empty">
      <div>
        <h2>{t('book.empty.title')}</h2>
        <p>{t('book.empty.text')}</p>
        <pre class="tl-example">---
manuscript: true
---
# The Silver Thread

## Chapter 1
- [[Arrival at Rivertown]]
- [[The Market]]</pre>
        <button class="btn primary" onclick={() => app.askBook()}>{t('book.empty.create')}</button>
      </div>
    </div>
  {:else}
    <div class="graph-tools book-tools">
      {#if books.length > 1}
        <label class="tool-select">
          <span class="sr-only">{t('book.choose')}</span>
          <select value={book.path} onchange={(e) => app.setBook(e.currentTarget.value)}>
            {#each books as b (b.path)}<option value={b.path}>{b.title}</option>{/each}
          </select>
        </label>
      {:else}
        <strong class="book-name">{book.title}</strong>
      {/if}
      <div class="seg" role="group" aria-label={t('book.title')}>
        <button aria-pressed={tab === 'board'} onclick={() => (tab = 'board')}>{t('book.board')}</button>
        <button aria-pressed={tab === 'read'} onclick={() => (tab = 'read')}>{t('book.read')}</button>
      </div>
      <span class="book-stats">{t('book.words', countWords(app.lang, totals.words), totals.scenes)}</span>
      {#if totals.scenes}
        <span class="book-progress" aria-hidden="true">
          {#each [...STATUSES, 'none'] as st (st)}
            {#if totals.counts[st]}<span class="bp bp-{st}" style:flex={totals.counts[st]}></span>{/if}
          {/each}
        </span>
      {/if}
      <span class="grow"></span>
      {#if tab === 'read'}
        <label class="tool-check"><input type="checkbox" bind:checked={sceneTitles} /> {t('book.sceneTitles')}</label>
      {/if}
      <button class="btn ghost" onclick={() => app.downloadBook(book.path, sceneTitles)}>{t('book.download')}</button>
      <button class="btn ghost" onclick={() => app.openText(book.path)}>{t('cards.open')}</button>
      <button class="btn ghost" onclick={() => app.askBook()}>{t('book.new')}</button>
    </div>

    {#if tab === 'board'}
      <div class="book-board" role="list">
        {#each book.chapters as ch, c (ch.line + ':' + c)}
          <section
            class="book-col"
            class:drop-target={dropAt?.c === c}
            role="listitem"
            aria-label={ch.title || t('book.noChapter')}
            ondragover={(e) => dragOver(e, c)}
            ondrop={drop}
          >
            <header class="book-col-head">
              <h3>{ch.title || t('book.noChapter')}</h3>
              <span class="book-col-meta">{countWords(app.lang, chapterWords(c))} · {ch.scenes.length}</span>
              {#if ch.line >= 0}
                <span class="book-col-acts">
                  <button class="icon-btn" title={t('book.chapter.left')} aria-label={t('book.chapter.left')} disabled={c === 0 || book.chapters[c - 1]!.line < 0} onclick={() => app.moveChapter(book.path, c, c - 1)}>‹</button>
                  <button class="icon-btn" title={t('book.chapter.rename')} aria-label={t('book.chapter.rename')} onclick={() => app.askChapter(book.path, c, ch.title)}>✎</button>
                  <button class="icon-btn" title={t('book.chapter.right')} aria-label={t('book.chapter.right')} disabled={c === book.chapters.length - 1} onclick={() => app.moveChapter(book.path, c, c + 1)}>›</button>
                </span>
              {/if}
            </header>
            <div class="book-col-cards">
              {#each ch.scenes as scene, s (scene.line)}
                {@const i = info(scene)}
                {#if lineBefore(c, s)}<div class="drop-line"></div>{/if}
                <div class="scene-wrap">
                  <button
                    class="scene-card"
                    class:missing={!scene.path}
                    class:selected={!!scene.path && scene.path === app.current}
                    class:dragging={drag?.c === c && drag.s === s}
                    data-s={s}
                    data-path={scene.path}
                    draggable="true"
                    ondragstart={(e) => dragStart(e, c, s, scene)}
                    ondragend={dragEnd}
                    onclick={() => choose(scene)}
                    onkeydown={(e) => cardKey(e, c, s, scene)}
                    use:previewOn={scene.path ? { target: stripMd(scene.path) } : null}
                  >
                    <span class="sc-top">
                      <span class="sc-title">{title(scene)}</span>
                      {#if i?.status}<span class="sc-status st-{i.status}">{t(`status.${i.status}` as Key)}</span>
                      {:else if i?.statusText}<span class="sc-status">{i.statusText}</span>{/if}
                    </span>
                    {#if i}
                      {#if i.summary}<span class="sc-summary">{i.summary}</span>{/if}
                      <span class="sc-meta">
                        {#if i.pov}<span>👁 {i.pov}</span>{/if}
                        {#if i.year}<span>⏳ {i.year}</span>{/if}
                        <span>{countWords(app.lang, i.words)}</span>
                      </span>
                    {:else}
                      <span class="sc-summary">{t('book.scene.missing')}</span>
                    {/if}
                  </button>
                  <button class="icon-btn sc-remove" title={t('book.scene.remove')} aria-label={t('book.scene.remove')} onclick={() => askRemove(c, s, scene)}>×</button>
                </div>
              {/each}
              {#if lineAtEnd(c)}<div class="drop-line"></div>{/if}
            </div>
            <button class="btn ghost book-add" onclick={() => app.askScene(book.path, c)}>{t('book.scene.add')}</button>
          </section>
        {/each}
        <button class="book-col book-col-new" onclick={() => app.askChapter(book.path)}>+ {t('book.chapter.new')}</button>
      </div>
      <p class="tl-help">{t('book.help')}</p>
    {:else}
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <div class="book-read" onclick={readClick}>
        <article class="prose book-text" use:previewLinks use:embeds={reading}>
          <h1>{book.title}</h1>
          {#if !reading.some((ch) => ch.scenes.some((s) => s.html))}
            <p class="cards-note">{t('book.readEmpty')}</p>
          {/if}
          {#each reading as ch, c (c)}
            {#if ch.title}<h2>{ch.title}</h2>{/if}
            {#each ch.scenes as s, si (si)}
              {#if sceneTitles}
                <h3 class="book-scene-title">
                  <button
                    class="link-btn"
                    use:previewOn={s.scene.path ? { target: stripMd(s.scene.path) } : null}
                    onclick={() => (s.scene.path ? void app.openText(s.scene.path) : app.confirmCreate(s.scene.target))}>{s.title}</button
                  >
                </h3>
              {/if}
              {#if s.html}{@html s.html}{/if}
            {/each}
          {/each}
        </article>
      </div>
    {/if}
  {/if}
</div>
