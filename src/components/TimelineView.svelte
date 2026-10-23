<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { app } from '../app.svelte';
  import { existsIn, formatYears, timelineModel, yearTicks, type TimelineItem } from '../core/years';
  import { folderColorSlots } from '../core/layout';
  import { stripMd } from '../core/names';
  import { previewOn } from '../actions';
  import Icon from './Icon.svelte';
  import YearSlider from './YearSlider.svelte';

  const t = app.t;

  const model = $derived.by(() => {
    app.version;
    return timelineModel(app.vault?.index.worldPages ?? []);
  });
  const slots = $derived.by(() => {
    app.version;
    const folders = (app.vault?.pages ?? []).map((p) => (p.path.includes('/') ? p.path.slice(0, p.path.indexOf('/')) : ''));
    return folderColorSlots(folders, app.layout?.groups);
  });
  const colorOf = (group: string) => (slots[group] === undefined ? 'var(--g-root)' : `var(--g${slots[group]})`);

  /* ------------------------------------------------------------------ scale */

  /** The axis runs a little past the first and last year, so bars never touch the edges. */
  const range = $derived.by(() => {
    const s = model.span;
    if (!s) return undefined;
    const pad = Math.max(1, Math.round((s.max - s.min) * 0.04));
    return { min: s.min - pad, max: s.max + pad };
  });

  let scroller = $state<HTMLDivElement>();
  let viewW = $state(0);
  /** Pixels per year. 0 until the first fit. */
  let ppy = $state(0);
  /** Width of the column of page names (narrower on phones). */
  const LABEL_W = $derived(viewW < 560 ? 150 : 208);

  const years = $derived(range ? range.max - range.min + 1 : 1);
  const trackW = $derived(Math.max(1, Math.round(years * ppy)));
  const x = (year: number) => (range ? (year - range.min) * ppy : 0);
  const axis = $derived(range && ppy > 0 ? yearTicks(range.min, range.max, ppy) : { step: 1, ticks: [] });

  function fitPpy(): number {
    const avail = Math.max(120, (viewW || 800) - LABEL_W - 24);
    return Math.min(120, Math.max(0.02, avail / years));
  }

  /** Until the reader zooms, the timeline keeps fitting the window (and the world's years). */
  let userZoomed = false;

  function fit() {
    userZoomed = false;
    ppy = fitPpy();
    if (scroller) scroller.scrollLeft = 0;
  }

  /** Zooms around a point of the track (in pixels from its left edge, as seen on screen). */
  function zoomBy(factor: number, at?: number) {
    if (!scroller || !range) return;
    const anchorScreen = at ?? (scroller.clientWidth - LABEL_W) / 2;
    const anchorYear = range.min + (scroller.scrollLeft + anchorScreen) / ppy;
    const next = Math.min(240, Math.max(fitPpy() * 0.5, ppy * factor));
    userZoomed = true;
    ppy = next;
    void tick().then(() => {
      if (scroller) scroller.scrollLeft = (anchorYear - range.min) * next - anchorScreen;
    });
  }

  $effect(() => {
    void viewW;
    void range;
    if (range && !userZoomed) ppy = fitPpy();
  });

  /* ---------------------------------------------------------- rows and bars */

  interface Bar {
    left: number;
    width: number;
    openStart: boolean;
    openEnd: boolean;
  }

  function barOf(item: TimelineItem): Bar {
    const r = range!;
    const from = item.from ?? r.min;
    const to = item.to ?? r.max;
    return {
      left: x(from),
      width: Math.max(8, (to - from + 1) * ppy),
      openStart: item.from === undefined,
      openEnd: item.to === undefined,
    };
  }

  const faded = (item: TimelineItem) => app.byYear && !existsIn(item, app.year);
  const hiddenCount = $derived(app.byYear ? model.groups.reduce((n, g) => n + g.items.filter(faded).length, 0) : 0);
  const itemCount = $derived(model.groups.reduce((n, g) => n + g.items.length, 0));

  let lastClick = { path: '', time: 0 };
  function choose(item: TimelineItem) {
    const now = performance.now();
    if (lastClick.path === item.path && now - lastClick.time < 400) {
      lastClick = { path: '', time: 0 };
      void app.openText(item.path);
      return;
    }
    lastClick = { path: item.path, time: now };
    void app.open(item.path);
  }

  function rowKey(e: KeyboardEvent, item: TimelineItem) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void app.openText(item.path);
    }
  }

  /* ------------------------------------------------- choosing a year on the axis */

  let scrubbing = false;
  function yearAt(e: PointerEvent): number | undefined {
    if (!range) return undefined;
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const y = range.min + Math.floor((e.clientX - box.left) / ppy);
    return Math.min(model.span!.max, Math.max(model.span!.min, y));
  }
  function axisDown(e: PointerEvent) {
    const y = yearAt(e);
    if (y === undefined) return;
    scrubbing = true;
    try {
      (e.currentTarget as HTMLElement).setPointerCapture(e.pointerId);
    } catch {
      /* Synthetic events have no capturable pointer. */
    }
    if (!app.byYear) app.setByYear(true);
    app.setYear(y);
  }
  function axisMove(e: PointerEvent) {
    if (!scrubbing) return;
    const y = yearAt(e);
    if (y !== undefined && y !== app.year) app.setYear(y);
  }
  function axisUp() {
    scrubbing = false;
  }

  function axisKey(e: KeyboardEvent) {
    const span = model.span;
    if (!span) return;
    const d = e.key === 'ArrowLeft' || e.key === 'ArrowDown' ? -1 : e.key === 'ArrowRight' || e.key === 'ArrowUp' ? 1 : 0;
    if (!d) return;
    e.preventDefault();
    if (!app.byYear) app.setByYear(true);
    app.setYear(Math.min(span.max, Math.max(span.min, app.year + d * (e.shiftKey ? 10 : 1))));
  }

  /* ------------------------------------------------------ bring a page into view */

  let lastFocusSeq = 0;
  $effect(() => {
    const f = app.timelineFocus;
    if (!f || f.seq === lastFocusSeq || ppy === 0) return;
    lastFocusSeq = f.seq;
    void tick().then(() => {
      const row = [...(scroller?.querySelectorAll<HTMLElement>('.tl-row') ?? [])].find((r) => r.dataset.path === f.path);
      const bar = row?.querySelector<HTMLElement>('.tl-bar, .tl-point');
      if (!row || !scroller) return;
      row.scrollIntoView?.({ block: 'nearest' });
      if (bar) {
        const left = bar.offsetLeft;
        if (left < scroller.scrollLeft || left > scroller.scrollLeft + scroller.clientWidth - LABEL_W - 40) {
          scroller.scrollLeft = Math.max(0, left - 60);
        }
      }
    });
  });

  onMount(() => {
    const wheel = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey) || !scroller) return;
      e.preventDefault();
      app.hoverClose();
      const box = scroller.getBoundingClientRect();
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomBy(Math.exp(-delta * 0.002), e.clientX - box.left - LABEL_W);
    };
    scroller?.addEventListener('wheel', wheel, { passive: false });
    return () => scroller?.removeEventListener('wheel', wheel);
  });
</script>

<div class="timeline-view">
  <div class="graph-tools">
    {#if app.yearSpan}
      <label class="tool-check"><input type="checkbox" checked={app.byYear} onchange={(e) => app.setByYear(e.currentTarget.checked)} /> {t('map.byYear')}</label>
    {/if}
    <span class="grow"></span>
    {#if model.undated > 0 && itemCount > 0}<span class="tl-note">{t('timeline.undated', model.undated)}</span>{/if}
    {#if range}
      <button class="icon-btn" title={t('graph.zoomOut')} aria-label={t('graph.zoomOut')} onclick={() => zoomBy(0.75)}>−</button>
      <button class="icon-btn" title={t('graph.zoomIn')} aria-label={t('graph.zoomIn')} onclick={() => zoomBy(1.33)}><Icon name="plus" /></button>
      <button class="btn ghost" onclick={fit}>{t('timeline.fit')}</button>
    {/if}
  </div>

  {#if !range}
    <div class="tl-empty">
      <div>
        <h2>{t('timeline.empty.title')}</h2>
        <p>{t('timeline.empty.text')}</p>
        <pre class="tl-example">born: 412
died: 455

founded: 300

year: 430</pre>
        <p>{t('timeline.empty.panel')}</p>
      </div>
    </div>
  {:else}
    <div class="tl-scroll" bind:this={scroller} bind:clientWidth={viewW} style:--label-w="{LABEL_W}px">
      <div class="tl-inner" style:width="{LABEL_W + trackW}px">
        <!-- Lines behind the rows at every labelled year. -->
        <div class="tl-grid" aria-hidden="true">
          {#each axis.ticks as y (y)}<span style:left="{x(y) + ppy / 2}px"></span>{/each}
        </div>
        {#if app.byYear}
          <div class="tl-cursor" style:left="{LABEL_W + x(app.year) + ppy / 2}px" aria-hidden="true"></div>
        {/if}

        <div class="tl-axis">
          <div class="tl-corner">{t('timeline.pages')}</div>
          <!-- The axis is a scrubber: press and drag along it to move through the years. -->
          <div
            class="tl-ticks"
            role="slider"
            tabindex="0"
            aria-label={t('map.year')}
            aria-valuemin={model.span?.min}
            aria-valuemax={model.span?.max}
            aria-valuenow={app.byYear ? app.year : undefined}
            title={t('timeline.axisHint')}
            style:width="{trackW}px"
            onpointerdown={axisDown}
            onpointermove={axisMove}
            onpointerup={axisUp}
            onpointercancel={axisUp}
            onkeydown={axisKey}
          >
            {#each axis.ticks as y (y)}
              <span class="tl-tick" style:left="{x(y) + ppy / 2}px">{y}</span>
            {/each}
          </div>
        </div>

        {#each model.groups as g (g.group)}
          <div class="tl-group" style:--c={colorOf(g.group)}>
            <span class="tl-group-name"><span class="tab-dot"></span>{g.group || t('graph.root')}<span class="count">{g.items.length}</span></span>
          </div>
          {#each g.items as item (item.path)}
            {@const bar = barOf(item)}
            <div class="tl-row" class:selected={app.current === item.path} class:faded={faded(item)} style:--c={colorOf(item.group)} data-path={item.path}>
              <button
                class="tl-label"
                onclick={() => choose(item)}
                onkeydown={(e) => rowKey(e, item)}
                use:previewOn={{ target: stripMd(item.path) }}
              >
                <span class="tl-title">{item.title}</span>
                <span class="tl-years">{formatYears(item)}</span>
              </button>
              <div class="tl-track" style:width="{trackW}px">
                {#if item.point}
                  <button
                    class="tl-point"
                    style:left="{bar.left + ppy / 2}px"
                    tabindex="-1"
                    aria-label="{item.title}, {formatYears(item)}"
                    onclick={() => choose(item)}
                    use:previewOn={{ target: stripMd(item.path) }}
                  ></button>
                {:else}
                  <button
                    class="tl-bar"
                    class:open-start={bar.openStart}
                    class:open-end={bar.openEnd}
                    class:short={bar.width < 24}
                    style:left="{bar.left}px"
                    style:width="{bar.width}px"
                    tabindex="-1"
                    aria-label="{item.title}, {formatYears(item)}"
                    onclick={() => choose(item)}
                    use:previewOn={{ target: stripMd(item.path) }}
                  >
                    {#if bar.width > 90}<span class="tl-bar-text">{item.title}</span>{/if}
                  </button>
                {/if}
              </div>
            </div>
          {/each}
        {/each}
      </div>
    </div>
    <p class="tl-help">{t('timeline.help')}</p>
  {/if}
  <YearSlider id="timeline" hidden={hiddenCount} />
</div>
