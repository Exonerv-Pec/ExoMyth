<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../app.svelte';
  import { buildGraph, neighbourhood, type GraphEdge, type WorldGraph } from '../core/graph';
  import { layoutGraph, SHELF_CELL, type LayoutResult, type Point } from '../core/layout';
  import { stripMd } from '../core/names';
  import { rectOf } from '../actions';
  import Icon from './Icon.svelte';

  const t = app.t;

  /* ------------------------------------------------------------------ state */

  let wrap = $state<HTMLDivElement>();
  let svg = $state<SVGSVGElement>();
  let width = $state(800);
  let height = $state(600);
  /** Screen = world × k + (x, y). */
  let view = $state({ x: 0, y: 0, k: 1 });
  let viewReady = false;

  type Scope = 0 | 1 | 2;
  const savedFilters = (() => {
    try {
      return JSON.parse(app.worldPref('graphFilters') ?? '{}') as Partial<{ mentions: boolean; shelf: boolean; scope: Scope }>;
    } catch {
      return {};
    }
  })();
  let showMentions = $state(savedFilters.mentions ?? true);
  let showShelf = $state(savedFilters.shelf ?? true);
  let scope = $state<Scope>(savedFilters.scope ?? 0);
  let tag = $state('');
  let hovered = $state<string | null>(null);
  let dragPos = $state<{ id: string; x: number; y: number } | null>(null);
  let result = $state.raw<LayoutResult | null>(null);
  let computing = $state(false);

  $effect(() => {
    app.setWorldPref('graphFilters', JSON.stringify({ mentions: showMentions, shelf: showShelf, scope }));
  });

  /* ------------------------------------------------------------------ model */

  const graph = $derived.by<WorldGraph | null>(() => {
    app.version;
    return app.vault ? buildGraph(app.vault.index) : null;
  });

  // Lay out whenever the pages or the saved layout change. Big first layouts run after a
  // paint, so the "laying out" note shows instead of a frozen window.
  let layoutRun = 0;
  $effect(() => {
    const g = graph;
    const stored = app.layout;
    if (!g || !stored) return;
    const unplaced = g.nodes.filter((n) => !stored.nodes[n.id]).length;
    const run = ++layoutRun;
    const compute = () => {
      if (run !== layoutRun) return;
      const r = layoutGraph(g, stored);
      result = r;
      computing = false;
      // A dropped node now has its saved place; stop showing the temporary drag position.
      if (!gesture) dragPos = null;
      if (r.changed) app.setLayout(r.stored);
    };
    if (unplaced > 120) {
      computing = true;
      setTimeout(compute, 30);
    } else compute();
  });

  const adjacency = $derived.by(() => {
    const adj = new Map<string, Set<string>>();
    for (const e of graph?.edges ?? []) {
      (adj.get(e.a) ?? adj.set(e.a, new Set()).get(e.a)!).add(e.b);
      (adj.get(e.b) ?? adj.set(e.b, new Set()).get(e.b)!).add(e.a);
    }
    return adj;
  });

  const local = $derived.by(() =>
    scope > 0 && graph && app.current && graph.nodes.some((n) => n.id === app.current)
      ? neighbourhood(graph, app.current, scope)
      : null,
  );
  const tagged = $derived.by(() => (tag && graph ? new Set(graph.nodes.filter((n) => n.tags.includes(tag)).map((n) => n.id)) : null));
  const allTags = $derived.by(() => {
    app.version;
    return app.vault?.index.allTags().map((x) => x.tag) ?? [];
  });

  /** The best-connected pages keep their labels even when zoomed far out. */
  const hubs = $derived.by(() => {
    const nodes = [...(graph?.nodes ?? [])].filter((n) => n.degree > 0).sort((a, b) => b.degree - a.degree);
    return new Set(nodes.slice(0, Math.max(5, Math.round(nodes.length * 0.08))).map((n) => n.id));
  });

  function pos(id: string): Point | undefined {
    if (dragPos && dragPos.id === id) return dragPos;
    return result?.positions.get(id);
  }

  function radius(degree: number, shelved: boolean): number {
    return shelved ? 5 : Math.min(18, 6 + 2.2 * Math.sqrt(degree));
  }

  function isOut(id: string): boolean {
    if (local && !local.has(id)) return true;
    return !showShelf && !!result?.shelved.has(id);
  }

  function edgeVisible(e: GraphEdge): boolean {
    if (!showMentions && e.types.length === 0) return false;
    return !isOut(e.a) && !isOut(e.b);
  }

  const focusSet = $derived.by(() => {
    if (!hovered) return null;
    const s = new Set(adjacency.get(hovered) ?? []);
    s.add(hovered);
    return s;
  });

  function colorOf(group: string): string {
    const slot = result?.groups[group];
    return slot === undefined ? 'var(--g-root)' : `var(--g${slot})`;
  }

  const legend = $derived.by(() => {
    const groups = result?.groups ?? {};
    const present = new Set(graph?.nodes.map((n) => n.group) ?? []);
    const items = Object.keys(groups)
      .filter((g) => present.has(g))
      .sort((a, b) => a.localeCompare(b))
      .map((g) => ({ name: g, color: colorOf(g) }));
    if (present.has('')) items.push({ name: t('graph.root'), color: 'var(--g-root)' });
    return items;
  });

  const shelfCount = $derived(result?.shelved.size ?? 0);

  /* ------------------------------------------------------------------- view */

  function visibleBounds(): { minX: number; minY: number; maxX: number; maxY: number } | undefined {
    if (!graph || !result) return undefined;
    let b: { minX: number; minY: number; maxX: number; maxY: number } | undefined;
    for (const n of graph.nodes) {
      if (isOut(n.id)) continue;
      const p = result.positions.get(n.id);
      if (!p) continue;
      const extra = result.shelved.has(n.id) ? SHELF_CELL.w : 0;
      if (!b) b = { minX: p.x, minY: p.y, maxX: p.x + extra, maxY: p.y };
      else {
        b.minX = Math.min(b.minX, p.x);
        b.minY = Math.min(b.minY, p.y);
        b.maxX = Math.max(b.maxX, p.x + extra);
        b.maxY = Math.max(b.maxY, p.y);
      }
    }
    if (b && showShelf && shelfCount > 0 && !local && result) b.minY = Math.min(b.minY, result.shelf.y - 50);
    return b;
  }

  const reduceMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
  let anim = 0;

  function animateTo(target: { x: number; y: number; k: number }) {
    cancelAnimationFrame(anim);
    if (reduceMotion) {
      view = target;
      return;
    }
    const from = { ...view };
    const start = performance.now();
    const step = (now: number) => {
      const u = Math.min(1, (now - start) / 280);
      const e = 1 - Math.pow(1 - u, 3);
      view = { x: from.x + (target.x - from.x) * e, y: from.y + (target.y - from.y) * e, k: from.k + (target.k - from.k) * e };
      if (u < 1) anim = requestAnimationFrame(step);
    };
    anim = requestAnimationFrame(step);
  }

  function fit(animate = true) {
    const b = visibleBounds();
    if (!b) return;
    const pad = 70;
    const bw = Math.max(1, b.maxX - b.minX);
    const bh = Math.max(1, b.maxY - b.minY);
    const k = Math.min(1.4, Math.max(0.12, Math.min((width - pad * 2) / bw, (height - pad * 2) / bh)));
    const target = { k, x: width / 2 - ((b.minX + b.maxX) / 2) * k, y: height / 2 - ((b.minY + b.maxY) / 2) * k };
    if (animate) animateTo(target);
    else view = target;
  }

  function centerOn(id: string, onlyIfHidden: boolean) {
    const p = result?.positions.get(id);
    if (!p) return;
    const sx = p.x * view.k + view.x;
    const sy = p.y * view.k + view.y;
    const margin = 80;
    if (onlyIfHidden && sx > margin && sx < width - margin && sy > margin && sy < height - margin) return;
    const k = Math.max(view.k, 0.7);
    animateTo({ k, x: width / 2 - p.x * k, y: height / 2 - p.y * k });
  }

  function zoomBy(factor: number, cx = width / 2, cy = height / 2) {
    const k = Math.min(4, Math.max(0.08, view.k * factor));
    const f = k / view.k;
    view = { k, x: cx - (cx - view.x) * f, y: cy - (cy - view.y) * f };
  }

  // First view: the last one used in this world, or the whole world.
  $effect(() => {
    if (viewReady || !result || width < 10) return;
    viewReady = true;
    try {
      const saved = JSON.parse(app.worldPref('graphView') ?? 'null') as typeof view | null;
      if (saved && [saved.x, saved.y, saved.k].every(Number.isFinite)) {
        view = saved;
        return;
      }
    } catch {
      /* fall through to fitting */
    }
    fit(false);
  });

  let saveViewTimer: ReturnType<typeof setTimeout> | undefined;
  $effect(() => {
    const v = { x: Math.round(view.x), y: Math.round(view.y), k: Math.round(view.k * 1000) / 1000 };
    if (!viewReady) return;
    clearTimeout(saveViewTimer);
    saveViewTimer = setTimeout(() => app.setWorldPref('graphView', JSON.stringify(v)), 400);
  });

  // Requests from elsewhere (panel button, selecting a page) bring the page into view.
  let lastFocusSeq = 0;
  $effect(() => {
    const f = app.graphFocus;
    if (!f || !result || f.seq === lastFocusSeq || !viewReady) return;
    lastFocusSeq = f.seq;
    if (scope === 0) centerOn(f.path, true); // in neighbour mode the effect below refits instead
  });

  // Changing what is shown (or whose neighbours) refits the view to it.
  const scopeKey = () => `${scope}|${showShelf}|${scope > 0 ? app.current : ''}`;
  let lastScopeKey = scopeKey();
  $effect(() => {
    const key = scopeKey();
    if (key === lastScopeKey) return;
    lastScopeKey = key;
    if (viewReady) queueMicrotask(() => fit());
  });

  /* ----------------------------------------------------------- interaction */

  interface Gesture {
    kind: 'pan' | 'node';
    id?: string;
    startX: number;
    startY: number;
    viewX: number;
    viewY: number;
    nodeStart?: Point;
    moved: boolean;
  }
  let gesture: Gesture | null = null;
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; k: number; mx: number; my: number; vx: number; vy: number } | null = null;
  let lastClick = { id: '', time: 0 };

  function local2(e: PointerEvent | WheelEvent): { x: number; y: number } {
    const r = svg!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  function onPointerDown(e: PointerEvent, id?: string) {
    if (e.button !== 0 && e.pointerType === 'mouse') return;
    e.stopPropagation();
    const p = local2(e);
    pointers.set(e.pointerId, p);
    try {
      svg!.setPointerCapture(e.pointerId);
    } catch {
      /* Synthetic events (tests, some assistive tools) have no capturable pointer. */
    }
    app.hoverClose();
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [Point, Point];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y), k: view.k, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, vx: view.x, vy: view.y };
      gesture = null;
      dragPos = null;
      return;
    }
    const g: Gesture = { kind: id ? 'node' : 'pan', startX: p.x, startY: p.y, viewX: view.x, viewY: view.y, moved: false };
    if (id) {
      g.id = id;
      const np = result?.positions.get(id);
      if (np) g.nodeStart = { ...np };
    }
    gesture = g;
  }

  function onPointerMove(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    const p = local2(e);
    pointers.set(e.pointerId, p);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [Point, Point];
      const k = Math.min(4, Math.max(0.08, (pinch.k * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist));
      const f = k / pinch.k;
      view = { k, x: pinch.mx - (pinch.mx - pinch.vx) * f, y: pinch.my - (pinch.my - pinch.vy) * f };
      return;
    }
    const g = gesture;
    if (!g) return;
    const dx = p.x - g.startX;
    const dy = p.y - g.startY;
    if (!g.moved && Math.hypot(dx, dy) < 4) return;
    g.moved = true;
    if (g.kind === 'pan') view = { ...view, x: g.viewX + dx, y: g.viewY + dy };
    else if (g.id && g.nodeStart) dragPos = { id: g.id, x: g.nodeStart.x + dx / view.k, y: g.nodeStart.y + dy / view.k };
  }

  function onPointerUp(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    const g = gesture;
    gesture = null;
    if (!g) return;
    if (g.kind === 'node' && g.id) {
      if (g.moved && dragPos && app.layout) {
        const id = g.id;
        const flag = app.layout.nodes[id]?.[2] ?? (result?.shelved.has(id) ? 1 : 0);
        // The layout effect clears dragPos once the saved position is in place.
        app.setLayout({ ...app.layout, nodes: { ...app.layout.nodes, [id]: [Math.round(dragPos.x), Math.round(dragPos.y), flag] } });
      } else if (!g.moved) {
        const now = performance.now();
        if (lastClick.id === g.id && now - lastClick.time < 400) {
          lastClick = { id: '', time: 0 };
          void app.openText(g.id);
        } else {
          lastClick = { id: g.id, time: now };
          void app.open(g.id);
        }
      }
    }
  }

  function onKeyDown(e: KeyboardEvent) {
    if (e.target !== svg) return;
    const step = 60;
    const keys: Record<string, () => void> = {
      ArrowLeft: () => (view = { ...view, x: view.x + step }),
      ArrowRight: () => (view = { ...view, x: view.x - step }),
      ArrowUp: () => (view = { ...view, y: view.y + step }),
      ArrowDown: () => (view = { ...view, y: view.y - step }),
      '+': () => zoomBy(1.25),
      '=': () => zoomBy(1.25),
      '-': () => zoomBy(0.8),
      '0': () => fit(),
    };
    const fn = keys[e.key];
    if (fn) {
      e.preventDefault();
      fn();
    }
  }

  function nodeKey(e: KeyboardEvent, id: string) {
    if (e.key === 'Enter') {
      e.preventDefault();
      void app.openText(id);
    } else if (e.key === ' ') {
      e.preventDefault();
      void app.open(id);
    }
  }

  function nodeEnter(e: Event, id: string) {
    if (gesture || pinch) return;
    hovered = id;
    const el = e.currentTarget as SVGGElement;
    app.hoverStart(stripMd(id), undefined, () => {
      const c = el.querySelector('circle');
      return c && c.isConnected ? rectOf(c) : undefined;
    });
  }

  function nodeLeave(id: string) {
    if (hovered === id) hovered = null;
    app.hoverEnd();
  }

  function relayout() {
    app.dialog = {
      kind: 'confirm',
      title: t('graph.relayout.title'),
      message: t('graph.relayout.text'),
      confirmLabel: t('graph.relayout.confirm'),
      onConfirm: () => {
        viewReady = true;
        app.resetLayout();
        setTimeout(() => fit(), 80);
      },
    };
  }

  onMount(() => {
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      app.hoverClose();
      const p = local2(e);
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomBy(Math.exp(-delta * 0.0016), p.x, p.y);
    };
    svg!.addEventListener('wheel', wheel, { passive: false });
    return () => {
      svg?.removeEventListener('wheel', wheel);
      cancelAnimationFrame(anim);
      clearTimeout(saveViewTimer);
    };
  });

  const labelsFar = $derived(view.k < 0.55);
  /** The chart grid behind the graph moves and scales with it, so panning feels like moving a map. */
  const gridSize = $derived.by(() => {
    let size = 120 * view.k;
    while (size < 36) size *= 2;
    while (size > 144) size /= 2;
    return size;
  });
</script>

<div class="graph-view">
  <div class="graph-tools">
    <div class="seg" role="group" aria-label={t('graph.scope')}>
      {#each [0, 1, 2] as s (s)}
        <button aria-pressed={scope === s} onclick={() => (scope = s as Scope)} disabled={s > 0 && !app.current}>
          {t(`graph.scope.${s}` as 'graph.scope.0')}
        </button>
      {/each}
    </div>
    <label class="tool-check"><input type="checkbox" bind:checked={showMentions} /> {t('graph.mentions')}</label>
    <label class="tool-check"><input type="checkbox" bind:checked={showShelf} /> {t('graph.showShelf')}</label>
    {#if allTags.length > 0}
      <label class="tool-select">
        <span class="sr-only">{t('graph.tag')}</span>
        <select bind:value={tag}>
          <option value="">{t('graph.tag.all')}</option>
          {#each allTags as tg (tg)}<option value={tg}>#{tg}</option>{/each}
        </select>
      </label>
    {/if}
    <span class="grow"></span>
    <button class="icon-btn" title={t('graph.zoomOut')} aria-label={t('graph.zoomOut')} onclick={() => zoomBy(0.8)}>−</button>
    <button class="icon-btn" title={t('graph.zoomIn')} aria-label={t('graph.zoomIn')} onclick={() => zoomBy(1.25)}><Icon name="plus" /></button>
    <button class="btn ghost" onclick={() => fit()}>{t('graph.fit')}</button>
    <button class="btn ghost" disabled={!app.current} onclick={() => app.current && centerOn(app.current, false)}>{t('graph.toCurrent')}</button>
    <button class="btn ghost" onclick={relayout}>{t('graph.relayout')}</button>
  </div>

  <div
    class="graph-canvas"
    bind:this={wrap}
    bind:clientWidth={width}
    bind:clientHeight={height}
    style:background-size="{gridSize}px {gridSize}px"
    style:background-position="{view.x}px {view.y}px"
  >

  {#if graph && graph.nodes.length === 0}
    <div class="graph-note">{t('graph.empty')}</div>
  {:else if !result || computing}
    <div class="graph-note" role="status">{t('graph.loading')}</div>
  {/if}
  {#if scope > 0 && !app.current}
    <div class="graph-note">{t('graph.noCurrent')}</div>
  {/if}

  <!-- The canvas takes focus so it can be panned and zoomed from the keyboard (role="application"). -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex, a11y_no_noninteractive_element_interactions -->
  <svg
    bind:this={svg}
    class="graph"
    class:far={labelsFar}
    class:focusing={!!focusSet}
    role="application"
    aria-label={t('graph.label')}
    tabindex="0"
    onpointerdown={(e) => onPointerDown(e)}
    onpointermove={onPointerMove}
    onpointerup={onPointerUp}
    onpointercancel={onPointerUp}
    onkeydown={onKeyDown}
  >
    {#if result && graph}
      <g transform="translate({view.x} {view.y}) scale({view.k})" style:--k={view.k}>
        {#if showShelf && shelfCount > 0 && !local}
          <g class="shelf-head">
            <line
              x1={result.shelf.x - 20}
              x2={result.shelf.x + result.shelf.cols * SHELF_CELL.w}
              y1={result.shelf.y - 44}
              y2={result.shelf.y - 44}
            />
            <text x={result.shelf.x - 20} y={result.shelf.y - 56}>{t('graph.shelf', shelfCount)}</text>
          </g>
        {/if}

        <g class="edges">
          {#each graph.edges as e (e.a + '\u0000' + e.b)}
            {#if edgeVisible(e)}
              {@const a = pos(e.a)}
              {@const b = pos(e.b)}
              {#if a && b}
                {@const hot = hovered === e.a || hovered === e.b}
                {@const sel = app.current === e.a || app.current === e.b}
                <line
                  class="edge"
                  class:typed={e.types.length > 0}
                  class:hot
                  class:sel
                  class:muted={!!tagged && !(tagged.has(e.a) && tagged.has(e.b))}
                  x1={a.x}
                  y1={a.y}
                  x2={b.x}
                  y2={b.y}
                />
                {#if hot && e.types.length > 0}
                  <text class="edge-label" x={(a.x + b.x) / 2} y={(a.y + b.y) / 2}>{e.types.join(', ')}</text>
                {/if}
              {/if}
            {/if}
          {/each}
        </g>

        <g class="nodes">
          {#each graph.nodes as n (n.id)}
            {@const p = pos(n.id)}
            {#if p && !isOut(n.id)}
              {@const shelved = result.shelved.has(n.id)}
              {@const r = radius(n.degree, shelved)}
              <g
                class="node"
                class:shelved
                class:hub={hubs.has(n.id)}
                class:selected={app.current === n.id}
                class:lit={!!focusSet?.has(n.id)}
                class:muted={!!tagged && !tagged.has(n.id)}
                transform="translate({p.x} {p.y})"
                role="button"
                tabindex="0"
                aria-label={n.title}
                aria-pressed={app.current === n.id}
                onpointerdown={(e) => onPointerDown(e, n.id)}
                onpointerenter={(e) => nodeEnter(e, n.id)}
                onpointerleave={() => nodeLeave(n.id)}
                onfocus={(e) => nodeEnter(e, n.id)}
                onblur={() => nodeLeave(n.id)}
                onkeydown={(e) => nodeKey(e, n.id)}
              >
                <circle {r} style:--c={colorOf(n.group)} />
                {#if app.current === n.id}<circle class="ring" r={r + 5} />{/if}
                <text class="label" x={shelved ? r + 7 : 0} y={shelved ? 0 : r + 4} class:side={shelved}>{n.title}</text>
              </g>
            {/if}
          {/each}
        </g>
      </g>
    {/if}
  </svg>

  {#if legend.length > 1}
    <div class="graph-legend" aria-label={t('graph.legend')}>
      <span class="legend-title">{t('graph.legend')}</span>
      {#each legend as l (l.name)}
        <span class="legend-item"><span class="dot" style:background={l.color}></span>{l.name}</span>
      {/each}
    </div>
  {/if}
  <p class="graph-help">{t('graph.help')}</p>
  </div>
</div>
