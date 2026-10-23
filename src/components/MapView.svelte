<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../app.svelte';
  import { mapLayers, mapOf, pinCount, regionCentre, regionCount, type Pin, type Region } from '../core/maps';
  import { existsIn, pageYears } from '../core/years';
  import YearSlider from './YearSlider.svelte';
  import { folderColorSlots } from '../core/layout';
  import { stripMd } from '../core/names';
  import { mediaUrl } from '../embeds';
  import { rectOf } from '../actions';

  let { path }: { path: string } = $props();
  const t = app.t;

  const page = $derived.by(() => {
    app.version;
    return app.vault?.getPage(path);
  });
  const model = $derived(page ? mapOf(page) : undefined);

  /* --------------------------------------------------------------- image */

  let url = $state<string | undefined>();
  let imageMissing = $state(false);
  $effect(() => {
    app.version;
    const image = model?.image;
    imageMissing = false;
    if (!image) return;
    let alive = true;
    void mediaUrl(image).then((u) => {
      if (!alive) return;
      url = u;
      imageMissing = !u;
    });
    return () => {
      alive = false;
    };
  });

  /* ---------------------------------------------------------- pins, colours */

  const slots = $derived.by(() => {
    app.version;
    const folders = (app.vault?.pages ?? []).map((p) => (p.path.includes('/') ? p.path.slice(0, p.path.indexOf('/')) : ''));
    return folderColorSlots(folders, app.layout?.groups);
  });

  function pinTarget(pin: Pin) {
    return pin.page ? app.vault?.index.resolve(pin.page) : undefined;
  }

  function pinColor(pin: Pin): string {
    const target = pinTarget(pin);
    if (!target) return pin.page ? 'var(--broken)' : 'var(--ink-soft)';
    const group = target.path.includes('/') ? target.path.slice(0, target.path.indexOf('/')) : '';
    return slots[group] === undefined ? 'var(--g-root)' : `var(--g${slots[group]})`;
  }

  function regionTarget(r: Region) {
    return r.page ? app.vault?.index.resolve(r.page) : undefined;
  }

  /** A region's own colour, or its page's folder colour, or the accent colour. */
  function regionColor(r: Region): string {
    if (r.color) return r.color;
    const target = regionTarget(r);
    if (!target) return 'var(--accent)';
    const group = target.path.includes('/') ? target.path.slice(0, target.path.indexOf('/')) : '';
    return slots[group] === undefined ? 'var(--g-root)' : `var(--g${slots[group]})`;
  }

  function regionTitle(r: Region): string {
    return r.label ?? regionTarget(r)?.title ?? r.page ?? t('map.region.untitled');
  }

  /* ------------------------------------------------------------ layers */

  const layers = $derived(model ? mapLayers(model) : []);
  /** Layers switched off on this map, remembered per world in this browser. */
  let hiddenLayers = $state<string[]>(
    (() => {
      try {
        const v = JSON.parse(app.worldPref(`mapLayers:${path}`) ?? '[]') as unknown;
        return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
      } catch {
        return [];
      }
    })(),
  );
  const layerShown = (layer: string | undefined) => !layer || !hiddenLayers.includes(layer);
  function toggleLayer(layer: string, on: boolean) {
    hiddenLayers = on ? hiddenLayers.filter((l) => l !== layer) : [...hiddenLayers, layer];
    app.setWorldPref(`mapLayers:${path}`, JSON.stringify(hiddenLayers));
  }

  function pinTitle(pin: Pin): string {
    return pin.label ?? pinTarget(pin)?.title ?? pin.page ?? t('map.pin.untitled');
  }

  /* ------------------------------------------------------------ years */

  /** A pin's own years, or else the years of the page it points to (a city pin follows its city). */
  function pinYears(pin: Pin): { from?: number; to?: number } | undefined {
    if (pin.from !== undefined || pin.to !== undefined) return pin;
    const target = pinTarget(pin);
    return target ? pageYears(target) : undefined;
  }
  function regionYears(r: Region): { from?: number; to?: number } | undefined {
    if (r.from !== undefined || r.to !== undefined) return r;
    const target = regionTarget(r);
    return target ? pageYears(target) : undefined;
  }
  const inYear = (span: { from?: number; to?: number } | undefined) => !app.byYear || !app.on('years') || existsIn(span, app.year);
  const visible = (pin: Pin) => layerShown(pin.layer) && inYear(pinYears(pin));
  const regionVisible = (r: Region) => layerShown(r.layer) && inYear(regionYears(r));
  const hiddenCount = $derived.by(() => {
    app.version;
    if (!model || !app.byYear) return 0;
    return model.pins.filter((p) => !inYear(pinYears(p))).length + model.regions.filter((r) => !inYear(regionYears(r))).length;
  });

  /* ------------------------------------------------------- pan and zoom */

  let viewport = $state<HTMLDivElement>();
  let stage = $state<HTMLDivElement>();
  let vw = $state(0);
  let vh = $state(0);
  let sw = $state(0);
  let sh = $state(0);
  let view = $state({ x: 0, y: 0, k: 1 });
  let full = $state(false);
  let fitted = false;

  /** Scale at which the whole map fits the viewport. */
  const fitK = $derived(sw > 0 && sh > 0 && vw > 0 && vh > 0 ? Math.min(vw / sw, vh / sh, 1) : 1);

  function fit() {
    const k = fitK;
    view = { k, x: (vw - sw * k) / 2, y: (vh - sh * k) / 2 };
  }

  $effect(() => {
    if (!fitted && sw > 0 && sh > 0 && vw > 0 && vh > 0) {
      fitted = true;
      fit();
    }
  });

  // Refit when switching full screen on or off.
  let lastFull = false;
  $effect(() => {
    if (full !== lastFull) {
      lastFull = full;
      queueMicrotask(fit);
    }
  });

  function zoomAt(factor: number, cx = vw / 2, cy = vh / 2) {
    const k = Math.min(8, Math.max(fitK * 0.6, view.k * factor));
    const f = k / view.k;
    view = { k, x: cx - (cx - view.x) * f, y: cy - (cy - view.y) * f };
  }

  /* ------------------------------------------------------------ editing */

  let editing = $state(false);
  let selected = $state<number | null>(null);
  /** The selected region while editing (a pin and a region are never selected together). */
  let selectedRegion = $state<number | null>(null);
  const selRegion = $derived(model && selectedRegion !== null ? model.regions.find((r) => r.index === selectedRegion) : undefined);
  /** Corners of a region being drawn (null when not drawing). */
  let drawing = $state<[number, number][] | null>(null);
  let dragVertex = $state<{ i: number; x: number; y: number } | null>(null);

  // Fields of the selected region.
  let rPage = $state('');
  let rLabel = $state('');
  let rLayer = $state('');
  let rColor = $state('');
  let rFrom = $state('');
  let rTo = $state('');
  let lastRegion: number | null = null;
  $effect(() => {
    const r = selRegion;
    if (selectedRegion === lastRegion && r) return;
    lastRegion = selectedRegion;
    rPage = r?.page ?? '';
    rLabel = r?.label ?? '';
    rLayer = r?.layer ?? '';
    rColor = r?.color ?? '';
    rFrom = r?.from?.toString() ?? '';
    rTo = r?.to?.toString() ?? '';
  });

  function selectPin(index: number | null) {
    selected = index;
    if (index !== null) selectedRegion = null;
  }

  function selectRegion(index: number | null) {
    selectedRegion = index;
    if (index !== null) selected = null;
  }

  async function saveRegion() {
    const r = selRegion;
    if (!r || selectedRegion === null) return;
    const patch = {
      page: rPage.trim() || undefined,
      label: rLabel.trim() || undefined,
      layer: rLayer.trim() || undefined,
      color: rColor.trim() || undefined,
      from: yearValue(rFrom),
      to: yearValue(rTo),
    };
    if (
      patch.page === r.page &&
      patch.label === r.label &&
      patch.layer === r.layer &&
      patch.color === r.color &&
      patch.from === r.from &&
      patch.to === r.to
    )
      return;
    await app.changeRegion(path, selectedRegion, patch);
  }

  async function deleteRegion() {
    if (selectedRegion === null) return;
    const index = selectedRegion;
    selectedRegion = null;
    await app.removeRegion(path, index);
  }

  function startDrawing() {
    void saveFields();
    void saveRegion();
    selectPin(null);
    selectRegion(null);
    drawing = [];
  }

  async function finishDrawing() {
    const pts = drawing;
    drawing = null;
    if (!pts || pts.length < 3 || !page) return;
    const region: { points: [number, number][]; from?: number } = { points: pts };
    if (app.byYear && app.on('years')) region.from = app.year;
    const index = regionCount(page);
    if (await app.addRegion(path, region)) selectRegion(index);
  }
  const selectedPin = $derived(model && selected !== null ? model.pins.find((p) => p.index === selected) : undefined);

  // Fields of the selected pin (strings, as typed).
  let fPage = $state('');
  let fLabel = $state('');
  let fLayer = $state('');
  let fFrom = $state('');
  let fTo = $state('');
  let pageInput = $state<HTMLInputElement>();
  let lastSelected: number | null = null;
  $effect(() => {
    const p = selectedPin;
    if (selected === lastSelected && p) return;
    lastSelected = selected;
    fPage = p?.page ?? '';
    fLabel = p?.label ?? '';
    fLayer = p?.layer ?? '';
    fFrom = p?.from?.toString() ?? '';
    fTo = p?.to?.toString() ?? '';
  });

  const pageNames = $derived.by(() => {
    app.version;
    return (app.vault?.index.worldPages ?? []).map((p) => p.name);
  });

  function yearValue(s: string): number | undefined {
    return /^\s*-?\d+\s*$/.test(s) ? Number(s) : undefined;
  }

  async function saveFields() {
    if (selected === null || !selectedPin) return;
    const patch = {
      page: fPage.trim() || undefined,
      label: fLabel.trim() || undefined,
      layer: fLayer.trim() || undefined,
      from: yearValue(fFrom),
      to: yearValue(fTo),
    };
    const p = selectedPin;
    if (patch.page === p.page && patch.label === p.label && patch.layer === p.layer && patch.from === p.from && patch.to === p.to) return;
    await app.changePin(path, selected, patch);
  }

  async function deleteSelected() {
    if (selected === null) return;
    const index = selected;
    selected = null;
    await app.removePin(path, index);
  }

  function stopEditing() {
    void saveFields();
    void saveRegion();
    editing = false;
    drawing = null;
    selected = null;
    selectedRegion = null;
  }

  /* ---------------------------------------------------- pointer gestures */

  interface Gesture {
    kind: 'pan' | 'pin' | 'place' | 'region' | 'vertex';
    pin?: number;
    region?: number;
    vertex?: number;
    startX: number;
    startY: number;
    view: { x: number; y: number; k: number };
    moved: boolean;
  }
  let gesture: Gesture | null = null;
  let dragPin = $state<{ index: number; x: number; y: number } | null>(null);
  const pointers = new Map<number, { x: number; y: number }>();
  let pinch: { dist: number; k: number; mx: number; my: number; vx: number; vy: number } | null = null;

  function local(e: PointerEvent | WheelEvent) {
    const r = viewport!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  /** Fraction of the map under a screen point. */
  function fractionAt(e: PointerEvent) {
    const r = stage!.getBoundingClientRect();
    return {
      x: Math.min(1, Math.max(0, (e.clientX - r.left) / (r.width || 1))),
      y: Math.min(1, Math.max(0, (e.clientY - r.top) / (r.height || 1))),
    };
  }

  function down(e: PointerEvent, pin?: Pin, other?: { region?: number; vertex?: number }) {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.stopPropagation();
    const p = local(e);
    pointers.set(e.pointerId, p);
    try {
      viewport!.setPointerCapture(e.pointerId);
    } catch {
      /* synthetic events */
    }
    app.hoverClose();
    if (pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      pinch = { dist: Math.hypot(a.x - b.x, a.y - b.y) || 1, k: view.k, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2, vx: view.x, vy: view.y };
      gesture = null;
      return;
    }
    const kind: Gesture['kind'] = pin
      ? 'pin'
      : other?.vertex !== undefined
        ? 'vertex'
        : editing && drawing
          ? 'place'
          : other?.region !== undefined
            ? 'region'
            : editing
              ? 'place'
              : 'pan';
    gesture = {
      kind,
      startX: p.x,
      startY: p.y,
      view: { ...view },
      moved: false,
      ...(pin ? { pin: pin.index } : {}),
      ...(other?.region !== undefined ? { region: other.region } : {}),
      ...(other?.vertex !== undefined ? { vertex: other.vertex } : {}),
    };
  }

  function move(e: PointerEvent) {
    if (!pointers.has(e.pointerId)) return;
    const p = local(e);
    pointers.set(e.pointerId, p);
    if (pinch && pointers.size === 2) {
      const [a, b] = [...pointers.values()] as [{ x: number; y: number }, { x: number; y: number }];
      const k = Math.min(8, Math.max(fitK * 0.6, (pinch.k * Math.hypot(a.x - b.x, a.y - b.y)) / pinch.dist));
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
    if (g.kind === 'pin' && editing && g.pin !== undefined) {
      const f = fractionAt(e);
      dragPin = { index: g.pin, x: f.x, y: f.y };
    } else if (g.kind === 'vertex' && g.vertex !== undefined) {
      const f = fractionAt(e);
      dragVertex = { i: g.vertex, x: f.x, y: f.y };
    } else if (g.kind !== 'pin' || !editing) {
      // Dragging the background (or a pin outside editing) moves the map.
      view = { ...view, x: g.view.x + dx, y: g.view.y + dy };
    }
  }

  async function up(e: PointerEvent) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinch = null;
    const g = gesture;
    gesture = null;
    if (!g) return;
    if (g.kind === 'pin' && g.pin !== undefined) {
      if (editing && g.moved && dragPin) {
        const d = dragPin;
        await app.changePin(path, d.index, { x: d.x, y: d.y });
        dragPin = null;
        selectPin(d.index);
      } else if (!g.moved) {
        if (editing) {
          await saveFields();
          await saveRegion();
          selectPin(g.pin);
        } else {
          openPin(model?.pins.find((p) => p.index === g.pin));
        }
      }
    } else if (g.kind === 'vertex') {
      if (g.moved && dragVertex && selRegion && selectedRegion !== null) {
        const d = dragVertex;
        const points = selRegion.points.map((p, i): [number, number] => (i === d.i ? [d.x, d.y] : p));
        await app.changeRegion(path, selectedRegion, { points });
      } else if (!g.moved && drawing && g.vertex === 0) {
        await finishDrawing();
      }
      dragVertex = null;
    } else if (g.kind === 'region' && !g.moved && g.region !== undefined) {
      const r = model?.regions.find((x) => x.index === g.region);
      if (editing) {
        await saveFields();
        await saveRegion();
        selectRegion(g.region);
      } else if (r) openRegion(r);
    } else if (g.kind === 'place' && !g.moved && model && drawing) {
      // Drawing an area: each click adds a corner.
      const f = fractionAt(e);
      drawing = [...drawing, [f.x, f.y]];
    } else if (g.kind === 'place' && !g.moved && model) {
      // A click on the map while editing places a new pin there.
      await saveFields();
      await saveRegion();
      selectRegion(null);
      const f = fractionAt(e);
      const pin: { x: number; y: number; from?: number } = { x: f.x, y: f.y };
      if (app.byYear) pin.from = app.year;
      const index = page ? pinCount(page) : model.pins.length;
      if (await app.addPin(path, pin)) {
        selectPin(index);
        queueMicrotask(() => pageInput?.focus());
      }
    }
  }

  function openPin(pin: Pin | undefined) {
    if (!pin?.page) return;
    const target = pinTarget(pin);
    if (target) void app.open(target.path);
    else app.confirmCreate(pin.page);
  }

  function openRegion(r: Region) {
    if (!r.page) return;
    const target = regionTarget(r);
    if (target) void app.open(target.path);
    else app.confirmCreate(r.page);
  }

  function regionEnter(e: Event, r: Region) {
    if (gesture || !r.page || editing) return;
    const target = regionTarget(r);
    const el = e.currentTarget as Element;
    app.hoverStart(target ? stripMd(target.path) : r.page, undefined, () => (el.isConnected ? rectOf(el) : undefined));
  }

  function regionKey(e: KeyboardEvent, r: Region) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (editing) selectRegion(r.index);
    else openRegion(r);
  }

  const svgPoints = (pts: readonly [number, number][]) => pts.map(([x, y]) => `${x * 1000},${y * 1000}`).join(' ');

  function pinKey(e: KeyboardEvent, pin: Pin) {
    if (!editing) {
      if (e.key === 'Enter') {
        e.preventDefault();
        openPin(pin);
      }
      return;
    }
    const step = e.shiftKey ? 0.02 : 0.005;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const m = moves[e.key];
    if (m) {
      e.preventDefault();
      selectPin(pin.index);
      void app.changePin(path, pin.index, { x: pin.x + m[0], y: pin.y + m[1] });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectPin(pin.index);
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      selectPin(pin.index);
      void deleteSelected();
    }
  }

  function pinEnter(e: Event, pin: Pin) {
    if (gesture || !pin.page) return;
    const target = pinTarget(pin);
    const el = e.currentTarget as HTMLElement;
    app.hoverStart(target ? stripMd(target.path) : pin.page, undefined, () => (el.isConnected ? rectOf(el) : undefined));
  }

  onMount(() => {
    const wheel = (e: WheelEvent) => {
      e.preventDefault();
      app.hoverClose();
      const p = local(e);
      const delta = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaY;
      zoomAt(Math.exp(-delta * 0.0016), p.x, p.y);
    };
    viewport!.addEventListener('wheel', wheel, { passive: false });
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && drawing) drawing = null;
      else if (e.key === 'Enter' && drawing && drawing.length >= 3) void finishDrawing();
      else if (e.key === 'Escape' && full) full = false;
    };
    window.addEventListener('keydown', esc);
    return () => {
      viewport?.removeEventListener('wheel', wheel);
      window.removeEventListener('keydown', esc);
    };
  });
</script>

{#if model}
  <section class="map-wrap" class:full class:editing aria-label={t('map.label', page?.title ?? '')}>
    <div class="map-tools">
      {#if app.yearSpan && app.on('years')}
        <label class="tool-check"><input type="checkbox" checked={app.byYear} onchange={(e) => app.setByYear(e.currentTarget.checked)} /> {t('map.byYear')}</label>
      {/if}
      {#if layers.length}
        <details class="map-layers">
          <summary>{t('map.layers')}{#if hiddenLayers.some((l) => layers.includes(l))}<span class="count"> {layers.filter(layerShown).length}/{layers.length}</span>{/if}</summary>
          <div class="map-layers-menu">
            {#each layers as layer (layer)}
              <label class="tool-check"><input type="checkbox" checked={layerShown(layer)} onchange={(e) => toggleLayer(layer, e.currentTarget.checked)} /> {layer}</label>
            {/each}
          </div>
        </details>
      {/if}
      <span class="grow"></span>
      <span class="map-count">{t('map.pins', model.pins.length)}{#if model.regions.length} · {t('map.regions', model.regions.length)}{/if}</span>
      <button class="icon-btn" title={t('graph.zoomOut')} aria-label={t('graph.zoomOut')} onclick={() => zoomAt(0.8)}>−</button>
      <button class="icon-btn" title={t('graph.zoomIn')} aria-label={t('graph.zoomIn')} onclick={() => zoomAt(1.25)}>+</button>
      <button class="btn ghost" onclick={fit}>{t('map.fit')}</button>
      <button class="btn ghost" onclick={() => (full = !full)}>{full ? t('map.exitFull') : t('map.full')}</button>
      {#if editing}
        {#if drawing}
          <button class="btn primary" disabled={drawing.length < 3} onclick={finishDrawing}>{t('map.region.finish')}</button>
          <button class="btn ghost" onclick={() => (drawing = null)}>{t('dialog.cancel')}</button>
        {:else}
          <button class="btn" onclick={startDrawing}>{t('map.region.draw')}</button>
          <button class="btn primary" onclick={stopEditing}>{t('map.done')}</button>
        {/if}
      {:else}
        <button class="btn" onclick={() => (editing = true)}>{t('map.edit')}</button>
      {/if}
    </div>

    {#if editing}<p class="map-hint">{drawing ? t('map.region.drawHint', drawing.length) : t('map.editHint')}</p>{/if}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="map-viewport"
      bind:this={viewport}
      bind:clientWidth={vw}
      bind:clientHeight={vh}
      onpointerdown={(e) => down(e)}
      onpointermove={move}
      onpointerup={up}
      onpointercancel={up}
    >
      {#if imageMissing}
        <p class="map-missing">{t('map.missingImage', model.image)}</p>
      {/if}
      <div
        class="map-stage"
        bind:this={stage}
        bind:clientWidth={sw}
        bind:clientHeight={sh}
        style:transform="translate({view.x}px, {view.y}px) scale({view.k})"
        style:--inv={1 / view.k}
      >
        {#if url}<img src={url} alt="" draggable="false" />{/if}
        <!-- Areas: drawn in a 1000×1000 box stretched over the picture, so corners are fractions too. -->
        <svg class="map-regions" viewBox="0 0 1000 1000" preserveAspectRatio="none">
          {#each model.regions as r (r.index)}
            {@const shown = regionVisible(r)}
            {#if shown || (editing && layerShown(r.layer))}
              {@const pts = dragVertex && selectedRegion === r.index ? r.points.map((p, i): [number, number] => (i === dragVertex!.i ? [dragVertex!.x, dragVertex!.y] : p)) : r.points}
              <polygon
                class="region"
                class:ghost={!shown}
                class:selected={editing && selectedRegion === r.index}
                class:linked={!!r.page}
                points={svgPoints(pts)}
                style:--c={regionColor(r)}
                role="button"
                tabindex="0"
                aria-label={regionTitle(r)}
                onpointerdown={(e) => down(e, undefined, { region: r.index })}
                onpointerenter={(e) => regionEnter(e, r)}
                onpointerleave={() => app.hoverEnd()}
                onkeydown={(e) => regionKey(e, r)}
              />
            {/if}
          {/each}
          {#if drawing && drawing.length}
            <polyline class="region-draft" points={svgPoints(drawing)} />
          {/if}
        </svg>
        {#each model.regions as r (r.index)}
          {#if regionVisible(r) || (editing && selectedRegion === r.index)}
            {@const [cx, cy] = regionCentre(r.points)}
            <span class="region-label" style:left="{cx * 100}%" style:top="{cy * 100}%" style:--c={regionColor(r)}>{regionTitle(r)}</span>
          {/if}
        {/each}
        {#if editing && selRegion && !drawing}
          {#each selRegion.points as [x, y], i (i)}
            {@const at = dragVertex && dragVertex.i === i ? dragVertex : { x, y }}
            <button
              class="vertex"
              style:left="{at.x * 100}%"
              style:top="{at.y * 100}%"
              aria-label={t('map.region.corner', i + 1)}
              onpointerdown={(e) => down(e, undefined, { vertex: i })}
            ></button>
          {/each}
        {/if}
        {#if drawing}
          {#each drawing as [x, y], i (i)}
            <button
              class="vertex draft"
              class:first={i === 0 && drawing.length >= 3}
              style:left="{x * 100}%"
              style:top="{y * 100}%"
              aria-label={i === 0 ? t('map.region.finish') : t('map.region.corner', i + 1)}
              onpointerdown={(e) => down(e, undefined, { vertex: i })}
            ></button>
          {/each}
        {/if}
        {#each model.pins as pin (pin.index)}
          {@const pos = dragPin && dragPin.index === pin.index ? dragPin : pin}
          {@const shown = visible(pin)}
          {#if shown || (editing && layerShown(pin.layer))}
            <button
              class="pin"
              class:ghost={!shown}
              class:selected={editing && selected === pin.index}
              class:missing={!!pin.page && !pinTarget(pin)}
              style:left="{pos.x * 100}%"
              style:top="{pos.y * 100}%"
              style:--c={pinColor(pin)}
              aria-label={pinTitle(pin)}
              onpointerdown={(e) => down(e, pin)}
              onpointerenter={(e) => pinEnter(e, pin)}
              onpointerleave={() => app.hoverEnd()}
              onfocus={(e) => pinEnter(e, pin)}
              onblur={() => app.hoverEnd()}
              onkeydown={(e) => pinKey(e, pin)}
            >
              <svg class="pin-mark" viewBox="0 0 24 32" aria-hidden="true">
                <path d="M12 31 C12 31 2 18.5 2 11.5 A10 10 0 0 1 22 11.5 C22 18.5 12 31 12 31 Z" />
                <circle cx="12" cy="11.5" r="4" />
              </svg>
              <span class="pin-label">{pinTitle(pin)}</span>
            </button>
          {/if}
        {/each}
      </div>
    </div>

    <YearSlider id="map-{path}" hidden={hiddenCount} />

    {#if editing && selectedPin}
      <form class="pin-editor" onsubmit={(e) => (e.preventDefault(), void saveFields())}>
        <h3>{t('map.pin.title')}: {pinTitle(selectedPin)}</h3>
        <div class="pin-fields">
          <label class="field">{t('map.pin.page')}
            <input type="text" list="map-pages-{path}" bind:value={fPage} bind:this={pageInput} onblur={saveFields} autocomplete="off" />
          </label>
          <label class="field">{t('map.pin.label')}
            <input type="text" bind:value={fLabel} onblur={saveFields} autocomplete="off" />
          </label>
          <label class="field">{t('map.layer')}
            <input type="text" list="map-layers-{path}" bind:value={fLayer} onblur={saveFields} autocomplete="off" placeholder={t('map.layer.none')} />
          </label>
          <label class="field">{t('map.pin.from')}
            <input type="text" inputmode="numeric" bind:value={fFrom} onblur={saveFields} />
          </label>
          <label class="field">{t('map.pin.to')}
            <input type="text" inputmode="numeric" bind:value={fTo} onblur={saveFields} />
          </label>
        </div>
        <p class="map-hint">{t('map.yearsHint')}</p>
        <div class="pin-actions">
          {#if selectedPin.page && pinTarget(selectedPin)}
            <button type="button" class="btn ghost" onclick={() => openPin(selectedPin)}>{t('map.pin.open')}</button>
          {/if}
          <button type="button" class="btn danger" onclick={deleteSelected}>{t('map.pin.delete')}</button>
          <button type="submit" class="btn primary">{t('dialog.confirm')}</button>
        </div>
      </form>
    {/if}

    {#if editing && selRegion && !drawing}
      <form class="pin-editor" onsubmit={(e) => (e.preventDefault(), void saveRegion())}>
        <h3>{t('map.region.title')}: {regionTitle(selRegion)}</h3>
        <div class="pin-fields">
          <label class="field">{t('map.pin.page')}
            <input type="text" list="map-pages-{path}" bind:value={rPage} onblur={saveRegion} autocomplete="off" />
          </label>
          <label class="field">{t('map.pin.label')}
            <input type="text" bind:value={rLabel} onblur={saveRegion} autocomplete="off" />
          </label>
          <label class="field">{t('map.layer')}
            <input type="text" list="map-layers-{path}" bind:value={rLayer} onblur={saveRegion} autocomplete="off" placeholder={t('map.layer.none')} />
          </label>
          <div class="field">
            <span>{t('map.region.color')}</span>
            <div class="region-colors">
              <button type="button" class="swatch auto" aria-pressed={!rColor} title={t('map.region.colorAuto')} onclick={() => ((rColor = ''), void saveRegion())}>{t('map.region.auto')}</button>
              {#each ['#2f63a8', '#a86214', '#1f7a6d', '#7b4a9e', '#b2443a', '#66771b', '#4e5f6b'] as c (c)}
                <button type="button" class="swatch" aria-pressed={rColor === c} style:--c={c} aria-label={c} onclick={() => ((rColor = c), void saveRegion())}></button>
              {/each}
            </div>
          </div>
          <label class="field">{t('map.pin.from')}
            <input type="text" inputmode="numeric" bind:value={rFrom} onblur={saveRegion} />
          </label>
          <label class="field">{t('map.pin.to')}
            <input type="text" inputmode="numeric" bind:value={rTo} onblur={saveRegion} />
          </label>
        </div>
        <p class="map-hint">{t('map.region.editHint')}</p>
        <div class="pin-actions">
          {#if selRegion.page && regionTarget(selRegion)}
            <button type="button" class="btn ghost" onclick={() => selRegion && openRegion(selRegion)}>{t('map.pin.open')}</button>
          {/if}
          <button type="button" class="btn danger" onclick={deleteRegion}>{t('map.region.delete')}</button>
          <button type="submit" class="btn primary">{t('dialog.confirm')}</button>
        </div>
      </form>
    {/if}
    <datalist id="map-pages-{path}">{#each pageNames as n (n)}<option value={n}></option>{/each}</datalist>
    <datalist id="map-layers-{path}">{#each layers as l (l)}<option value={l}></option>{/each}</datalist>
  </section>
{/if}
