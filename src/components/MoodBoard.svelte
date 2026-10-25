<script lang="ts">
  import { app } from '../app.svelte';
  import {
    boardHeight,
    boardOf,
    cleanZoom,
    estimatedHeight,
    inkOn,
    itemCount,
    MIN_WIDTH,
    snapDistance,
    snapMove,
    snapSize,
    SWATCHES,
    zoomStep,
    type BoardItem,
    type Box,
  } from '../core/board';
  import { pageImage } from '../core/cards';
  import { boardPicture, saveBlob } from '../boardPicture';
  import MediaThumb from './MediaThumb.svelte';

  let { path }: { path: string } = $props();
  const t = app.t;

  const page = $derived.by(() => {
    app.version;
    return app.vault?.getPage(path);
  });
  const model = $derived(page ? boardOf(page) : undefined);
  const items = $derived(model?.items ?? []);

  let editing = $state(false);
  let fileInput = $state<HTMLInputElement>();
  let canvasEl = $state<HTMLElement>();
  /** Width of the board in pixels; items are measured against it. */
  let frameW = $state(0);
  /** Real heights of the items, in widths, so the board is as tall as what is on it. */
  let measured = $state<Record<number, number>>({});
  /** The item being dragged or resized, with its position and size while the pointer is down. */
  let live = $state<{ index: number; x: number; y: number; w: number; h?: number } | undefined>();
  /** Lines the item being moved has lined up with, drawn while it moves. */
  let guides = $state<{ x?: number; y?: number }>({});
  let saving = $state(false);

  /** Zoom of this board, remembered for this page in this browser. */
  let zoom = $state(1);
  $effect(() => {
    zoom = cleanZoom(app.worldPref(`boardZoom:${path}`));
  });
  function setZoom(z: number) {
    zoom = z;
    app.setWorldPref(`boardZoom:${path}`, String(z));
  }

  const shown = $derived(items.map((i) => (live && live.index === i.index ? { ...i, ...live } : i)));
  const heights = $derived(new Map(Object.entries(measured).map(([k, v]) => [Number(k), v])));
  const height = $derived(boardHeight(shown, heights));

  /** Keeps the real height of an item up to date as pictures load and text wraps. */
  function measure(node: HTMLElement, index: number) {
    let current = index;
    const update = () => {
      if (frameW > 0 && node.offsetHeight > 0) measured[current] = node.offsetHeight / frameW;
    };
    update();
    const observer = typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(update);
    observer?.observe(node);
    return {
      update(next: number) {
        current = next;
        update();
      },
      destroy() {
        observer?.disconnect();
      },
    };
  }

  /** Ctrl + wheel over the board zooms it (the wheel alone still scrolls the page). */
  function wheelZoom(node: HTMLElement) {
    const onWheel = (e: WheelEvent) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      const next = zoomStep(zoom, e.deltaY < 0 ? 1 : -1);
      if (next !== zoom) setZoom(next);
    };
    node.addEventListener('wheel', onWheel, { passive: false });
    return { destroy: () => node.removeEventListener('wheel', onWheel) };
  }

  const label = (i: BoardItem): string =>
    i.kind === 'image'
      ? (i.caption ?? i.image ?? '')
      : i.kind === 'color'
        ? (i.caption ?? i.color ?? '')
        : i.kind === 'quote'
          ? (i.quote ?? '').slice(0, 40)
          : i.kind === 'note'
            ? (i.note ?? '').slice(0, 40)
            : (app.vault?.index.resolve(i.page ?? '')?.title ?? i.page ?? '');
  const kindName = (i: BoardItem) => t(`board.kind.${i.kind}` as 'board.kind.image');

  /** `#abc` as `#aabbcc`, the form a colour input wants. */
  const full = (c: string) => (c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c);

  /** The boxes of all items but one, for lining up with. */
  const othersThan = (index: number): Box[] =>
    items.filter((i) => i.index !== index).map((i) => ({ x: i.x, y: i.y, w: i.w, h: heights.get(i.index) ?? estimatedHeight(i) }));

  /* ------------------------------------------------------------ drag, resize */

  type Gesture = {
    kind: 'move' | 'size';
    item: BoardItem;
    startX: number;
    startY: number;
    moved: boolean;
    /** Height of the item, in widths, when the gesture began. */
    startH: number;
    /** A picture shown whole when the resize began: its own height, for cropping with Shift. */
    pictureH?: number;
    others: Box[];
  };
  let gesture: Gesture | undefined;

  function begin(e: PointerEvent, item: BoardItem, kind: Gesture['kind']) {
    if (!editing || e.button > 0 || frameW <= 0) return;
    const target = e.target as HTMLElement | null;
    if (kind === 'move' && target?.closest('.b-tools, .b-handle, input')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    const li = (e.currentTarget as HTMLElement).closest('.b-item');
    const img = li?.querySelector('img');
    gesture = {
      kind,
      item,
      startX: e.clientX,
      startY: e.clientY,
      moved: false,
      startH: heights.get(item.index) ?? estimatedHeight(item),
      ...(item.kind === 'image' && img && img.offsetHeight > 0 ? { pictureH: img.offsetHeight / frameW } : {}),
      others: othersThan(item.index),
    };
    live = { index: item.index, x: item.x, y: item.y, w: item.w, ...(item.h !== undefined ? { h: item.h } : {}) };
  }

  function drag(e: PointerEvent) {
    if (!gesture || !live) return;
    const dx = (e.clientX - gesture.startX) / frameW;
    const dy = (e.clientY - gesture.startY) / frameW;
    if (Math.abs(dx) + Math.abs(dy) > 0.002) gesture.moved = true;
    const i = gesture.item;
    // Alt lets an item go anywhere, without lining up with the others.
    const distance = e.altKey ? 0 : snapDistance(frameW);
    if (gesture.kind === 'move') {
      const x = Math.min(1 - i.w, Math.max(0, i.x + dx));
      const y = Math.max(0, i.y + dy);
      const s = snapMove({ x, y, w: i.w, h: gesture.startH }, gesture.others, distance);
      live = { ...live, x: Math.min(1 - i.w, Math.max(0, s.x)), y: Math.max(0, s.y) };
      guides = { x: s.guideX, y: s.guideY };
      return;
    }
    let w = Math.min(1 - i.x, Math.max(MIN_WIDTH, i.w + dx));
    let h: number | undefined;
    if (i.kind === 'color') h = Math.max(0.04, (i.h ?? i.w) + dy);
    else if (i.kind === 'image' && (e.shiftKey || i.h !== undefined)) {
      // Shift crops a picture to a height; a cropped picture keeps its shape unless Shift is held.
      const base = i.h ?? gesture.pictureH ?? i.w * 0.75;
      h = e.shiftKey ? Math.max(0.04, base + dy) : Math.max(0.04, base * (w / i.w));
    }
    const s = snapSize({ x: i.x, y: i.y, w, h: h ?? 0 }, gesture.others, distance, h !== undefined && (i.kind === 'color' || e.shiftKey));
    w = Math.min(1 - i.x, Math.max(MIN_WIDTH, s.w));
    if (h !== undefined && (i.kind === 'color' || e.shiftKey)) h = Math.max(0.04, s.h);
    guides = { x: s.guideX, y: s.guideY };
    const { h: _old, ...rest } = live;
    void _old;
    live = { ...rest, w, ...(h !== undefined ? { h } : {}) };
  }

  async function drop() {
    const g = gesture;
    const l = live;
    gesture = undefined;
    guides = {};
    if (!g || !l) return;
    if (g.moved) {
      const patch = g.kind === 'move' ? { x: l.x, y: l.y } : { w: l.w, ...(l.h !== undefined ? { h: l.h } : {}) };
      await app.changeBoardItem(path, g.item.index, patch, true);
    }
    live = undefined;
  }

  function key(e: KeyboardEvent, item: BoardItem) {
    const step = e.shiftKey ? 0.05 : 0.01;
    const arrows: Record<string, [number, number]> = { ArrowLeft: [-step, 0], ArrowRight: [step, 0], ArrowUp: [0, -step], ArrowDown: [0, step] };
    const move = arrows[e.key];
    if (move) {
      e.preventDefault();
      void app.changeBoardItem(path, item.index, { x: item.x + move[0], y: item.y + move[1] }, true);
    } else if (e.key === '+' || e.key === '=' || e.key === '-' || e.key === '_') {
      e.preventDefault();
      const d = e.key === '+' || e.key === '=' ? 0.02 : -0.02;
      const w = item.w + d;
      // A cropped picture keeps its shape; a colour grows on both sides.
      const h = item.h === undefined ? undefined : item.kind === 'image' ? item.h * (w / item.w) : item.h + d;
      void app.changeBoardItem(path, item.index, { w, ...(h !== undefined ? { h } : {}) });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      void app.removeBoardItem(path, item.index);
    }
  }

  function editText(item: BoardItem) {
    if (item.kind === 'quote') app.askBoardQuote(path, item.index, { quote: item.quote ?? '', ...(item.source ? { source: item.source } : {}) });
    else if (item.kind === 'note') app.askBoardNote(path, item.index, item.note ?? '');
    else app.askBoardCaption(path, item.index, item.caption ?? '');
  }

  function addColor() {
    const n = itemCount(page!);
    const spot = 0.04 + 0.04 * (n % 8);
    void app.addBoardItem(path, { kind: 'color', color: SWATCHES[n % SWATCHES.length]!, x: spot, y: spot, w: 0.15, h: 0.15 });
  }

  function picked(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const files = [...(input.files ?? [])];
    input.value = '';
    if (files.length) void app.addBoardPictures(path, files);
  }

  /** Saves the board as one PNG picture, drawn on this device. */
  async function savePicture() {
    if (!canvasEl || saving) return;
    saving = true;
    try {
      const blob = await boardPicture({ items, heights, screenWidth: frameW, styleFrom: canvasEl });
      const name = `${(page?.title ?? 'Board').replace(/[\\/:*?"<>|]+/g, ' ').trim() || 'Board'}.png`;
      saveBlob(blob, name);
      app.notify(t('board.png.saved', name));
    } catch (e) {
      app.fail(e);
    } finally {
      saving = false;
    }
  }

  /** A pinned page card's page, when it exists. */
  const cardPage = (i: BoardItem) => (i.page ? app.vault?.index.resolve(i.page) : undefined);
</script>

<svelte:window onpointermove={drag} onpointerup={() => void drop()} onpointercancel={() => void drop()} />

{#if model}
  <section class="board" aria-label={t('board.title')}>
    <div class="board-bar">
      <button class="btn" class:primary={editing} aria-pressed={editing} onclick={() => (editing = !editing)}>
        {editing ? t('board.done') : t('board.edit')}
      </button>
      {#if editing}
        <button class="btn ghost" onclick={() => fileInput?.click()}>+ {t('board.add.picture')}</button>
        <button class="btn ghost" onclick={() => app.askBoardPicture(path)}>+ {t('board.add.world')}</button>
        <button class="btn ghost" onclick={addColor}>+ {t('board.add.color')}</button>
        <button class="btn ghost" onclick={() => app.askBoardQuote(path)}>+ {t('board.add.quote')}</button>
        <button class="btn ghost" onclick={() => app.askBoardNote(path)}>+ {t('board.add.note')}</button>
        <button class="btn ghost" onclick={() => app.askBoardPage(path)}>+ {t('board.add.page')}</button>
        <input bind:this={fileInput} type="file" accept="image/*" multiple hidden onchange={picked} />
      {/if}
      <span class="board-tools-right">
        <span class="board-zoom" role="group" aria-label={t('board.zoom')}>
          <button class="icon-btn" aria-label={t('board.zoom.out')} title={t('board.zoom.out')} disabled={zoom <= 0.5} onclick={() => setZoom(zoomStep(zoom, -1))}>−</button>
          <button class="board-zoom-value" title={t('board.zoom.reset')} onclick={() => setZoom(1)}>{Math.round(zoom * 100)}%</button>
          <button class="icon-btn" aria-label={t('board.zoom.in')} title={t('board.zoom.in')} disabled={zoom >= 3} onclick={() => setZoom(zoomStep(zoom, 1))}>+</button>
        </span>
        {#if items.length > 0}
          <button class="btn ghost" disabled={saving} onclick={() => void savePicture()}>{t('board.png')}</button>
        {/if}
      </span>
    </div>
    {#if editing}<p class="board-hint">{t('board.hint')}</p>{/if}

    <div class="board-scroll" use:wheelZoom>
      <div class="board-frame" bind:clientWidth={frameW} style:width="calc(100% * {zoom})" style:min-width="calc(34rem * {zoom})">
        <ul class="board-canvas" class:editing style:height="calc({height} * 100cqw)" bind:this={canvasEl}>
          {#each shown as item (item.index)}
            <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
            <li
              class="b-item b-{item.kind}"
              class:lifted={live?.index === item.index}
              style:left="calc({item.x} * 100cqw)"
              style:top="calc({item.y} * 100cqw)"
              style:width="calc({item.w} * 100cqw)"
              onpointerdown={(e) => begin(e, item, 'move')}
              use:measure={item.index}
            >
              {#if item.kind === 'image'}
                <figure>
                  {#if item.h !== undefined}
                    <div class="b-crop" style:height="calc({item.h} * 100cqw)">
                      <MediaThumb target={item.image} alt={item.caption ?? ''}>
                        {#snippet fallback()}<span class="b-missing">{t('board.missing', item.image ?? '')}</span>{/snippet}
                      </MediaThumb>
                    </div>
                  {:else}
                    <MediaThumb target={item.image} alt={item.caption ?? ''}>
                      {#snippet fallback()}<span class="b-missing">{t('board.missing', item.image ?? '')}</span>{/snippet}
                    </MediaThumb>
                  {/if}
                  {#if item.caption}<figcaption>{item.caption}</figcaption>{/if}
                </figure>
              {:else if item.kind === 'color'}
                <figure>
                  <div class="b-swatchwrap">
                    <div class="b-swatch" style:background={item.color} style:height="calc({item.h ?? item.w} * 100cqw)"></div>
                    {#if editing}
                      <input class="b-colorpick" type="color" value={full(item.color ?? '#000000')} aria-label={t('board.color.change')} title={t('board.color.change')} onchange={(e) => void app.changeBoardItem(path, item.index, { color: e.currentTarget.value })} />
                    {/if}
                  </div>
                  {#if item.caption}<figcaption>{item.caption}</figcaption>{/if}
                </figure>
              {:else if item.kind === 'quote'}
                <blockquote>
                  <p>{item.quote}</p>
                  {#if item.source}<footer>— {item.source}</footer>{/if}
                </blockquote>
              {:else if item.kind === 'note'}
                <div class="b-notecard" style:background={item.tint ?? '#f3e3a1'} style:color={inkOn(item.tint ?? '#f3e3a1')}>
                  <p>{item.note}</p>
                  {#if editing}
                    <input class="b-colorpick" type="color" value={full(item.tint ?? '#f3e3a1')} aria-label={t('board.tint.change')} title={t('board.tint.change')} onchange={(e) => void app.changeBoardItem(path, item.index, { tint: e.currentTarget.value })} />
                  {/if}
                </div>
              {:else}
                {@const target = cardPage(item)}
                {#if editing}
                  <div class="b-card" class:broken={!target}>
                    {#if target && pageImage(target)}<div class="b-card-image"><MediaThumb target={pageImage(target)} /></div>{/if}
                    <span class="b-card-title">{target?.title ?? item.page}</span>
                  </div>
                {:else}
                  <button class="b-card" class:broken={!target} onclick={() => void app.openTarget(item.page ?? '')}>
                    {#if target && pageImage(target)}<div class="b-card-image"><MediaThumb target={pageImage(target)} /></div>{/if}
                    <span class="b-card-title">{target?.title ?? item.page}</span>
                  </button>
                {/if}
              {/if}

              {#if editing}
                <div class="b-tools">
                  <button class="b-grab" aria-label={t('board.move', `${kindName(item)} ${label(item)}`.trim())} title={t('board.move', `${kindName(item)} ${label(item)}`.trim())} onkeydown={(e) => key(e, item)}>✥</button>
                  {#if item.kind !== 'page'}
                    <button aria-label={t('board.text')} title={t('board.text')} onclick={() => editText(item)}>✎</button>
                  {/if}
                  {#if item.kind === 'image' && item.h !== undefined}
                    <button aria-label={t('board.crop.reset')} title={t('board.crop.reset')} onclick={() => void app.changeBoardItem(path, item.index, { h: undefined })}>↺</button>
                  {/if}
                  <button aria-label={t('board.remove')} title={t('board.remove')} onclick={() => void app.removeBoardItem(path, item.index)}>×</button>
                </div>
                <span class="b-handle" aria-hidden="true" onpointerdown={(e) => begin(e, item, 'size')}></span>
              {/if}
            </li>
          {/each}
          {#if guides.x !== undefined}<li class="b-guide b-guide-x" aria-hidden="true" style:left="calc({guides.x} * 100cqw)"></li>{/if}
          {#if guides.y !== undefined}<li class="b-guide b-guide-y" aria-hidden="true" style:top="calc({guides.y} * 100cqw)"></li>{/if}
        </ul>
        {#if items.length === 0 && !editing}<p class="board-empty">{t('board.empty')}</p>{/if}
      </div>
    </div>
  </section>
{/if}
