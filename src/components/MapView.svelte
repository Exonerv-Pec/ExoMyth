<script lang="ts">
  import { onMount } from 'svelte';
  import { app } from '../app.svelte';
  import { existsIn, mapOf, pinCount, yearSpan, type Pin } from '../core/maps';
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

  function pinTitle(pin: Pin): string {
    return pin.label ?? pinTarget(pin)?.title ?? pin.page ?? t('map.pin.untitled');
  }

  /* ------------------------------------------------------------ years */

  const span = $derived(model ? yearSpan(model.pins) : undefined);
  let byYear = $state(false);
  let year = $state(0);
  $effect(() => {
    // Start the slider at the earliest year once a map with years is shown.
    if (span && (year < span.min || year > span.max)) year = span.min;
  });
  const visible = (pin: Pin) => !byYear || existsIn(pin, year);
  const hiddenCount = $derived(model && byYear ? model.pins.filter((p) => !existsIn(p, year)).length : 0);

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
  const selectedPin = $derived(model && selected !== null ? model.pins.find((p) => p.index === selected) : undefined);

  // Fields of the selected pin (strings, as typed).
  let fPage = $state('');
  let fLabel = $state('');
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
    fFrom = p?.from?.toString() ?? '';
    fTo = p?.to?.toString() ?? '';
  });

  const pageNames = $derived.by(() => {
    app.version;
    return (app.vault?.pages ?? []).map((p) => p.name);
  });

  function yearValue(s: string): number | undefined {
    return /^\s*-?\d+\s*$/.test(s) ? Number(s) : undefined;
  }

  async function saveFields() {
    if (selected === null || !selectedPin) return;
    const patch = {
      page: fPage.trim() || undefined,
      label: fLabel.trim() || undefined,
      from: yearValue(fFrom),
      to: yearValue(fTo),
    };
    const p = selectedPin;
    if (patch.page === p.page && patch.label === p.label && patch.from === p.from && patch.to === p.to) return;
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
    editing = false;
    selected = null;
  }

  /* ---------------------------------------------------- pointer gestures */

  interface Gesture {
    kind: 'pan' | 'pin' | 'place';
    pin?: number;
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

  function down(e: PointerEvent, pin?: Pin) {
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
    gesture = {
      kind: pin ? 'pin' : editing ? 'place' : 'pan',
      startX: p.x,
      startY: p.y,
      view: { ...view },
      moved: false,
      ...(pin ? { pin: pin.index } : {}),
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
        selected = d.index;
      } else if (!g.moved) {
        if (editing) {
          await saveFields();
          selected = g.pin;
        } else {
          openPin(model?.pins.find((p) => p.index === g.pin));
        }
      }
    } else if (g.kind === 'place' && !g.moved && model) {
      // A click on the map while editing places a new pin there.
      await saveFields();
      const f = fractionAt(e);
      const pin: { x: number; y: number; from?: number } = { x: f.x, y: f.y };
      if (byYear) pin.from = year;
      const index = page ? pinCount(page) : model.pins.length;
      if (await app.addPin(path, pin)) {
        selected = index;
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
      selected = pin.index;
      void app.changePin(path, pin.index, { x: pin.x + m[0], y: pin.y + m[1] });
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selected = pin.index;
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      e.preventDefault();
      selected = pin.index;
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
      if (e.key === 'Escape' && full) full = false;
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
      {#if span}
        <label class="tool-check"><input type="checkbox" bind:checked={byYear} /> {t('map.byYear')}</label>
      {/if}
      <span class="grow"></span>
      <span class="map-count">{t('map.pins', model.pins.length)}</span>
      <button class="icon-btn" title={t('graph.zoomOut')} aria-label={t('graph.zoomOut')} onclick={() => zoomAt(0.8)}>−</button>
      <button class="icon-btn" title={t('graph.zoomIn')} aria-label={t('graph.zoomIn')} onclick={() => zoomAt(1.25)}>+</button>
      <button class="btn ghost" onclick={fit}>{t('map.fit')}</button>
      <button class="btn ghost" onclick={() => (full = !full)}>{full ? t('map.exitFull') : t('map.full')}</button>
      {#if editing}
        <button class="btn primary" onclick={stopEditing}>{t('map.done')}</button>
      {:else}
        <button class="btn" onclick={() => (editing = true)}>{t('map.edit')}</button>
      {/if}
    </div>

    {#if editing}<p class="map-hint">{t('map.editHint')}</p>{/if}

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
        {#each model.pins as pin (pin.index)}
          {@const pos = dragPin && dragPin.index === pin.index ? dragPin : pin}
          {@const shown = visible(pin)}
          {#if shown || editing}
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

    {#if span && byYear}
      <div class="map-years">
        <label for="map-year-{path}">{t('map.year')}</label>
        <button class="icon-btn" aria-label="−1" onclick={() => (year = Math.max(span.min, year - 1))}>‹</button>
        <input id="map-year-{path}" type="range" min={span.min} max={span.max} step="1" bind:value={year} />
        <button class="icon-btn" aria-label="+1" onclick={() => (year = Math.min(span.max, year + 1))}>›</button>
        <output class="map-year" for="map-year-{path}">{year}</output>
        {#if hiddenCount > 0}<span class="map-hidden">{t('map.hidden', hiddenCount)}</span>{/if}
      </div>
    {/if}

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
        <datalist id="map-pages-{path}">{#each pageNames as n (n)}<option value={n}></option>{/each}</datalist>
      </form>
    {/if}
  </section>
{/if}
