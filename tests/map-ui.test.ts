import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Workspace from '../src/components/Workspace.svelte';
import Dialog from '../src/components/Dialog.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { mapOf } from '../src/core/maps';
import { DEMO_FILES } from '../src/demo';

beforeAll(() => {
  Element.prototype.scrollIntoView = () => {};
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  URL.createObjectURL = () => 'blob:map';
  URL.revokeObjectURL = () => {};
  if (!('PointerEvent' in window)) {
    (window as unknown as { PointerEvent: typeof MouseEvent }).PointerEvent = class extends MouseEvent {
      pointerId: number;
      pointerType: string;
      constructor(type: string, init: MouseEventInit & { pointerId?: number; pointerType?: string } = {}) {
        super(type, init);
        this.pointerId = init.pointerId ?? 1;
        this.pointerType = init.pointerType ?? 'mouse';
      }
    } as unknown as typeof MouseEvent;
  }
});

let mounted: ReturnType<typeof mount>[] = [];
afterEach(() => {
  mounted.forEach((m) => unmount(m));
  mounted = [];
  document.body.innerHTML = '';
  app.closeVault();
  app.setMode('split');
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));
const MAP = 'Maps/Silver Coast.md';
const pointer = (type: string, x = 0, y = 0) =>
  new window.PointerEvent(type, { bubbles: true, clientX: x, clientY: y, button: 0, pointerId: 3 } as PointerEventInit);

async function boot() {
  app.lang = 'en';
  app.setMode('preview');
  const vault = await Vault.open(new MemoryStorage('map-test', DEMO_FILES));
  app.setVault(vault);
  app.current = MAP;
  const target = document.createElement('div');
  document.body.append(target);
  mounted.push(mount(Workspace, { target }), mount(Dialog, { target: document.body }));
  flushSync();
  await wait();
  flushSync();
  return { target, vault };
}

const labels = (t: HTMLElement) => [...t.querySelectorAll('.pin:not(.ghost) .pin-label')].map((e) => e.textContent);

describe('maps in the reading view', () => {
  it('draws the map with its pins in place', async () => {
    const { target } = await boot();
    expect(target.querySelector('.map-stage img')!.getAttribute('src')).toBe('blob:map');
    expect(labels(target)).toEqual(['Rivertown', 'Fortress of the Order', 'Old Watchtower', "Smugglers' Cove"]);
    const rivertown = target.querySelector<HTMLElement>('.pin[aria-label="Rivertown"]')!;
    expect(rivertown.style.left).toBe('52%');
    expect(rivertown.style.top).toBe('62%');
  });

  it('moves through the years with the slider', async () => {
    const { target } = await boot();
    target.querySelector<HTMLInputElement>('.map-tools input[type="checkbox"]')!.click();
    flushSync();
    const slider = target.querySelector<HTMLInputElement>('.year-bar input[type="range"]')!;
    expect([slider.min, slider.max]).toEqual(['210', '430']);
    const setYear = (y: number) => {
      slider.value = String(y);
      slider.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
    };
    setYear(300);
    expect(labels(target)).toEqual(['Rivertown', 'Old Watchtower']);
    setYear(400);
    expect(labels(target)).toEqual(['Rivertown', 'Fortress of the Order', 'Old Watchtower', "Smugglers' Cove"]);
    setYear(405);
    expect(target.querySelector('.year-value')!.textContent).toBe('405 AR');
    // Switching the year view off shows everything again.
    target.querySelector<HTMLInputElement>('.map-tools input[type="checkbox"]')!.click();
    flushSync();
    expect(labels(target).length).toBe(4);
  });

  it('opens the pinned page on click', async () => {
    const { target } = await boot();
    const pin = target.querySelector<HTMLElement>('.pin[aria-label="Rivertown"]')!;
    pin.dispatchEvent(pointer('pointerdown'));
    target.querySelector('.map-viewport')!.dispatchEvent(pointer('pointerup'));
    await wait();
    expect(app.current).toBe('Places/Rivertown.md');
  });

  it('places, edits, moves and deletes pins, writing them into the page header', async () => {
    const { target, vault } = await boot();
    const button = (text: string) => [...target.querySelectorAll<HTMLButtonElement>('.map-wrap button')].find((b) => b.textContent?.trim() === text)!;
    button('Edit map').click();
    flushSync();
    const viewport = target.querySelector('.map-viewport')!;
    viewport.dispatchEvent(pointer('pointerdown', 10, 10));
    viewport.dispatchEvent(pointer('pointerup', 10, 10));
    await wait();
    flushSync();
    let pins = mapOf(vault.getPage(MAP)!)!.pins;
    expect(pins.length).toBe(5);

    // The new pin is selected; give it a page and years.
    const fields = target.querySelectorAll<HTMLInputElement>('.pin-editor input');
    const set = (el: HTMLInputElement, v: string) => {
      el.value = v;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      flushSync();
    };
    set(fields[0]!, 'Kira Vale');
    set(fields[3]!, '412'); // page, label, layer, from, to
    target.querySelector<HTMLFormElement>('.pin-editor')!.requestSubmit();
    await wait();
    flushSync();
    pins = mapOf(vault.getPage(MAP)!)!.pins;
    expect(pins[4]).toMatchObject({ page: 'Kira Vale', from: 412 });
    expect(await vault.readRaw(MAP)).toContain('page: "[[Kira Vale]]"');

    // Drag the Rivertown pin somewhere else.
    const rivertown = target.querySelector<HTMLElement>('.pin[aria-label="Rivertown"]')!;
    rivertown.dispatchEvent(pointer('pointerdown', 0, 0));
    viewport.dispatchEvent(pointer('pointermove', 40, 40));
    viewport.dispatchEvent(pointer('pointerup', 40, 40));
    await wait();
    const moved = mapOf(vault.getPage(MAP)!)!.pins[0]!;
    expect([moved.x, moved.y]).not.toEqual([0.52, 0.62]);

    // Delete the selected pin (Rivertown, after the drag).
    button('Delete pin').click();
    await wait();
    pins = mapOf(vault.getPage(MAP)!)!.pins;
    expect(pins.map((p) => p.label ?? p.page)).toEqual(['Fortress of the Order', 'Old Watchtower', "Smugglers' Cove", 'Kira Vale']);
    // The rest of the page is untouched.
    expect(await vault.readRaw(MAP)).toContain('# The Silver Coast');
  });

  it('draws areas on layers that can be switched off', async () => {
    const { target, vault } = await boot();
    const labels2 = () => [...target.querySelectorAll('.region-label')].map((e) => e.textContent);
    expect(labels2()).toEqual(['Kingdom of the Vales', 'Lands of the Order', 'Westwood', 'Flooded Lowlands']);
    expect(target.querySelector('.map-count')!.textContent).toContain('Areas: 4');
    // Switching off the History layer hides its area and its pin.
    target.querySelector<HTMLElement>('.map-layers summary')!.click();
    const history = [...target.querySelectorAll<HTMLLabelElement>('.map-layers-menu label')].find((l) => l.textContent?.trim() === 'History')!;
    history.querySelector('input')!.click();
    flushSync();
    expect(labels2()).not.toContain('Flooded Lowlands');
    expect(labels(target)).not.toContain('Old Watchtower');
    // In the flood year only, the lowlands follow their event page's year.
    history.querySelector('input')!.click();
    app.setByYear(true);
    app.setYear(404);
    flushSync();
    expect(labels2()).not.toContain('Flooded Lowlands');
    app.setYear(405);
    flushSync();
    expect(labels2()).toContain('Flooded Lowlands');
    app.setByYear(false);

    // Draw a new area: three clicks and "Done".
    const button = (text: string) => [...target.querySelectorAll<HTMLButtonElement>('.map-wrap button')].find((b) => b.textContent?.trim() === text)!;
    button('Edit map').click();
    flushSync();
    button('Draw an area').click();
    flushSync();
    const viewport = target.querySelector('.map-viewport')!;
    for (const [x, y] of [[5, 5], [30, 5], [30, 30]]) {
      viewport.dispatchEvent(pointer('pointerdown', x, y));
      viewport.dispatchEvent(pointer('pointerup', x, y));
      await wait(10);
      flushSync();
    }
    expect(target.querySelectorAll('.vertex.draft').length).toBe(3);
    button('Done, close it').click();
    await wait();
    flushSync();
    let regions = mapOf(vault.getPage(MAP)!)!.regions;
    expect(regions.length).toBe(5);
    expect(regions[4]!.points.length).toBe(3);
    // It is selected: name it and put it on a layer.
    const fields = target.querySelectorAll<HTMLInputElement>('.pin-editor input');
    fields[1]!.value = 'Northern Marches';
    fields[1]!.dispatchEvent(new Event('input', { bubbles: true }));
    fields[2]!.value = 'Politics';
    fields[2]!.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    target.querySelector<HTMLFormElement>('.pin-editor')!.requestSubmit();
    await wait();
    regions = mapOf(vault.getPage(MAP)!)!.regions;
    expect(regions[4]).toMatchObject({ label: 'Northern Marches', layer: 'Politics' });
    expect(await vault.readRaw(MAP)).toContain('Kingdom of the Vales');
    button('Delete area').click();
    await wait();
    expect(mapOf(vault.getPage(MAP)!)!.regions.length).toBe(4);
  });
});
