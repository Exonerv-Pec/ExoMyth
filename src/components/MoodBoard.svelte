<script lang="ts">
  import { app } from '../app.svelte';
  import { boardHeight, boardOf, itemCount, MIN_WIDTH, SWATCHES, type BoardItem } from '../core/board';
  import { pageImage } from '../core/cards';
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
  /** Width of the board in pixels; items are measured against it. */
  let frameW = $state(0);
  /** Real heights of the items, in widths, so the board is as tall as what is on it. */
  let measured = $state<Record<number, number>>({});
  /** The item being dragged or resized, with its position and size while the pointer is down. */
  let live = $state<{ index: number; x: number; y: number; w: number; h?: number } | undefined>();

  const shown = $derived(items.map((i) => (live && live.index === i.index ? { ...i, ...live } : i)));
  const height = $derived(boardHeight(shown, new Map(Object.entries(measured).map(([k, v]) => [Number(k), v]))));

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

  const label = (i: BoardItem): string =>
    i.kind === 'image' ? (i.caption ?? i.image ?? '') : i.kind === 'color' ? (i.caption ?? i.color ?? '') : i.kind === 'quote' ? (i.quote ?? '').slice(0, 40) : (app.vault?.index.resolve(i.page ?? '')?.title ?? i.page ?? '');
  const kindName = (i: BoardItem) => t(`board.kind.${i.kind}` as 'board.kind.image');

  /** `#abc` as `#aabbcc`, the form a colour input wants. */
  const full = (c: string) => (c.length === 4 ? `#${c[1]}${c[1]}${c[2]}${c[2]}${c[3]}${c[3]}` : c);

  /* ------------------------------------------------------------ drag, resize */

  type Gesture = { kind: 'move' | 'size'; item: BoardItem; startX: number; startY: number; moved: boolean };
  let gesture: Gesture | undefined;

  function begin(e: PointerEvent, item: BoardItem, kind: Gesture['kind']) {
    if (!editing || e.button > 0 || frameW <= 0) return;
    const target = e.target as HTMLElement | null;
    if (kind === 'move' && target?.closest('.b-tools, .b-handle, input')) return;
    e.preventDefault();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    gesture = { kind, item, startX: e.clientX, startY: e.clientY, moved: false };
    live = { index: item.index, x: item.x, y: item.y, w: item.w, ...(item.h !== undefined ? { h: item.h } : {}) };
  }

  function drag(e: PointerEvent) {
    if (!gesture || !live) return;
    const dx = (e.clientX - gesture.startX) / frameW;
    const dy = (e.clientY - gesture.startY) / frameW;
    if (Math.abs(dx) + Math.abs(dy) > 0.002) gesture.moved = true;
    const i = gesture.item;
    if (gesture.kind === 'move') {
      live = { ...live, x: Math.min(1 - i.w, Math.max(0, i.x + dx)), y: Math.max(0, i.y + dy) };
    } else {
      const w = Math.min(1 - i.x, Math.max(MIN_WIDTH, i.w + dx));
      live = { ...live, w, ...(i.h !== undefined ? { h: Math.max(0.04, i.h + dy) } : {}) };
    }
  }

  async function drop() {
    const g = gesture;
    const l = live;
    gesture = undefined;
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
      void app.changeBoardItem(path, item.index, { w: item.w + d, ...(item.h !== undefined ? { h: item.h + d } : {}) });
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      void app.removeBoardItem(path, item.index);
    }
  }

  function editText(item: BoardItem) {
    if (item.kind === 'quote') app.askBoardQuote(path, item.index, { quote: item.quote ?? '', ...(item.source ? { source: item.source } : {}) });
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
        <button class="btn ghost" onclick={() => app.askBoardPage(path)}>+ {t('board.add.page')}</button>
        <input bind:this={fileInput} type="file" accept="image/*" multiple hidden onchange={picked} />
      {/if}
    </div>
    {#if editing}<p class="board-hint">{t('board.hint')}</p>{/if}

    <div class="board-scroll">
      <div class="board-frame" bind:clientWidth={frameW}>
        <ul class="board-canvas" class:editing style:height="calc({height} * 100cqw)">
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
                  <MediaThumb target={item.image} alt={item.caption ?? ''}>
                    {#snippet fallback()}<span class="b-missing">{t('board.missing', item.image ?? '')}</span>{/snippet}
                  </MediaThumb>
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
                  <button aria-label={t('board.remove')} title={t('board.remove')} onclick={() => void app.removeBoardItem(path, item.index)}>×</button>
                </div>
                <span class="b-handle" aria-hidden="true" onpointerdown={(e) => begin(e, item, 'size')}></span>
              {/if}
            </li>
          {/each}
        </ul>
        {#if items.length === 0 && !editing}<p class="board-empty">{t('board.empty')}</p>{/if}
      </div>
    </div>
  </section>
{/if}
