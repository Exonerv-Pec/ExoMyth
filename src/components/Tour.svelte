<script lang="ts">
  import { tick } from 'svelte';
  import { app } from '../app.svelte';
  import { onScreen, placeHint, TOUR_STEPS, type Rect } from '../core/tour';
  import type { Key } from '../i18n';

  const t = app.t;
  const step = $derived(app.tourStep === null ? undefined : TOUR_STEPS[app.tourStep]);
  const last = $derived(app.tourStep === TOUR_STEPS.length - 1);

  let hint = $state<HTMLElement>();
  let target = $state<Rect | null>(null);
  let pos = $state<{ left: number; top: number; side: string }>({ left: 0, top: 0, side: 'middle' });

  // The first time a world is opened in this browser, once nothing else asks for attention.
  let asked = false;
  $effect(() => {
    if (asked || !app.vault || app.profilePicker || app.dialog || app.guideOpen || app.tourStep !== null || !app.tourDue) return;
    asked = true;
    const timer = setTimeout(() => {
      if (app.vault && !app.profilePicker && !app.dialog && app.tourStep === null) app.tourStep = 0;
    }, 700);
    return () => clearTimeout(timer);
  });

  /** Finds the part the step points at and puts the hint beside it. */
  function measure() {
    if (!step) return;
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    target = null;
    for (const name of step.targets) {
      const el = document.querySelector<HTMLElement>(`[data-tour="${name}"]`);
      const r = el?.getBoundingClientRect();
      if (r && onScreen(r, vw, vh)) {
        target = { left: r.left, top: r.top, width: r.width, height: r.height };
        break;
      }
    }
    const size = hint ? { width: hint.offsetWidth || 320, height: hint.offsetHeight || 160 } : { width: 320, height: 160 };
    pos = placeHint(target, size, vw, vh);
  }

  $effect(() => {
    app.tourStep;
    if (!step) return;
    void tick().then(() => {
      measure();
      // Once more after the hint has its size for this step's words.
      requestAnimationFrame(measure);
      hint?.querySelector<HTMLButtonElement>('.tour-next')?.focus();
    });
  });

  function next() {
    if (app.tourStep === null) return;
    if (last) app.endTour();
    else app.tourStep++;
  }
  function back() {
    if (app.tourStep) app.tourStep--;
  }
  function keydown(e: KeyboardEvent) {
    if (app.tourStep === null) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      app.endTour();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      next();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      back();
    }
  }
  const pad = 6;
</script>

<svelte:window onkeydowncapture={keydown} onresize={measure} />

{#if step}
  <div class="tour" role="presentation">
    {#if target}
      <div
        class="tour-spot"
        aria-hidden="true"
        style:left="{target.left - pad}px"
        style:top="{target.top - pad}px"
        style:width="{target.width + pad * 2}px"
        style:height="{target.height + pad * 2}px"
      ></div>
    {:else}
      <div class="tour-dim" aria-hidden="true"></div>
    {/if}
    <div class="tour-hint side-{pos.side}" bind:this={hint} role="dialog" aria-modal="true" aria-label={t('tour.label')} aria-describedby="tour-text" style:left="{pos.left}px" style:top="{pos.top}px">
      <p class="tour-count">{t('tour.step', (app.tourStep ?? 0) + 1, TOUR_STEPS.length)}</p>
      <h2>{t(`tour.${step.id}.title` as Key)}</h2>
      <p id="tour-text">{t(`tour.${step.id}.text` as Key)}</p>
      <div class="tour-actions">
        {#if !last}<button class="btn ghost" onclick={() => app.endTour()}>{t('tour.skip')}</button>{/if}
        <span class="tour-space"></span>
        {#if app.tourStep}<button class="btn" onclick={back}>{t('tour.back')}</button>{/if}
        <button class="btn primary tour-next" onclick={next}>{last ? t('tour.done') : t('tour.next')}</button>
      </div>
    </div>
  </div>
{/if}
