import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import App from '../src/App.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { PROFILES } from '../src/core/profiles';
import { boardOf } from '../src/core/board';
import { builtInTemplates } from '../src/core/templates';
import { featureUsage } from '../src/core/usage';

beforeAll(() => {
  // jsdom has no layout engine; CodeMirror only needs these to exist.
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Element.prototype.scrollIntoView = () => {};
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  URL.createObjectURL = () => 'blob:x';
  URL.revokeObjectURL = () => {};
  // The board is measured against its width: pretend it is 1000 pixels wide.
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', { configurable: true, get: () => 1000 });
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

const BOARD = `---
moodboard: true
board:
  - quote: |
      The sea keeps what it is given.
    source: Old saying
    x: 0.1
    y: 0.1
    w: 0.3
  - color: "#a86214"
    caption: Rust
    x: 0.5
    y: 0.1
    w: 0.15
    h: 0.15
  - page: "[[Kira]]"
    x: 0.1
    y: 0.4
    w: 0.2
  - image: missing.png
    x: 0.5
    y: 0.4
    w: 0.3
---
Words under the board.
`;

describe('mood boards in the app', () => {
  let mounted: ReturnType<typeof mount>[] = [];
  afterEach(() => {
    mounted.forEach((m) => unmount(m));
    mounted = [];
    document.body.innerHTML = '';
    app.resetFeatures();
    app.closeVault();
    app.dialog = null;
    app.setMode('split');
  });

  async function boot(files: Record<string, string> = { 'Boards/Coast.md': BOARD, 'Kira.md': '# Kira\n' }) {
    app.lang = 'en';
    app.setMode('preview');
    const storage = new MemoryStorage(`t-${Math.random()}`, files);
    app.setVault(await Vault.open(storage));
    app.current = Object.keys(files)[0] ?? null;
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(App, { target }));
    flushSync();
    await wait();
    flushSync();
    return { storage, target };
  }

  const items = () => [...document.querySelectorAll<HTMLElement>('.b-item')];
  const saved = async (storage: MemoryStorage, path = 'Boards/Coast.md') => boardOf({ frontmatter: (await Vault.open(storage)).getPage(path)!.frontmatter })!.items;
  const click = (el: Element | null | undefined) => {
    (el as HTMLElement).click();
    flushSync();
  };

  it('shows what is pinned, with the text of the page under it', async () => {
    await boot();
    expect(items().map((i) => i.className.match(/b-(image|color|quote|page)\b/)![1])).toEqual(['quote', 'color', 'page', 'image']);
    const quote = items()[0]!;
    expect(quote.querySelector('blockquote p')!.textContent).toBe('The sea keeps what it is given.');
    expect(quote.querySelector('footer')!.textContent).toBe('— Old saying');
    expect(quote.style.left).toBe('calc(10cqw)');
    expect(quote.style.width).toBe('calc(30cqw)');
    expect((items()[1]!.querySelector('.b-swatch') as HTMLElement).style.background).toBe('rgb(168, 98, 20)');
    expect(items()[1]!.querySelector('figcaption')!.textContent).toBe('Rust');
    expect(items()[2]!.querySelector('.b-card-title')!.textContent).toBe('Kira');
    expect(items()[3]!.textContent).toContain('No file “missing.png”');
    expect(document.querySelector('.prose')!.textContent).toContain('Words under the board.');
    // No editing tools until asked for.
    expect(document.querySelector('.b-tools')).toBeNull();
    expect(document.querySelector('.board-bar')!.textContent).toContain('Edit board');
  });

  it('does not show the board fields as facts of the page', async () => {
    await boot();
    expect(document.querySelector('.infobox')?.textContent ?? '').not.toMatch(/moodboard|board/);
  });

  it('opens a pinned page when it is clicked, and says when the page is missing', async () => {
    await boot({ 'Boards/Coast.md': BOARD.replace('[[Kira]]', '[[Nobody]]'), 'Kira.md': '# Kira\n' });
    const card = document.querySelector<HTMLButtonElement>('button.b-card')!;
    expect(card.classList.contains('broken')).toBe(true);
    expect(card.textContent).toContain('Nobody');
  });

  it('needs Edit board before it can be changed, then offers what can be pinned', async () => {
    await boot();
    click([...document.querySelectorAll<HTMLButtonElement>('.board-bar button')].find((b) => b.textContent!.includes('Edit board')));
    const bar = [...document.querySelectorAll('.board-bar button')].map((b) => b.textContent);
    expect(bar).toEqual(['Done', '+ Picture', '+ From the world', '+ Colour', '+ Quote', '+ Note', '+ Page', '−', '100%', '+', 'Save as picture']);
    expect(document.querySelectorAll('.b-tools')).toHaveLength(4);
    expect(document.querySelector('.board-hint')).not.toBeNull();
    click(document.querySelector('.board-bar button'));
    expect(document.querySelector('.b-tools')).toBeNull();
  });

  it('pins a colour, a quote and a page, saving them in the page header', async () => {
    const { storage } = await boot();
    click([...document.querySelectorAll<HTMLButtonElement>('.board-bar button')].find((b) => b.textContent!.includes('Edit board')));
    click([...document.querySelectorAll<HTMLButtonElement>('.board-bar button')].find((b) => b.textContent === '+ Colour'));
    await wait();
    flushSync();
    expect(items()).toHaveLength(5);

    app.askBoardQuote('Boards/Coast.md');
    if (app.dialog?.kind === 'prompt') await app.dialog.onSubmit('Be water.\n— Someone');
    await wait();
    app.askBoardPage('Boards/Coast.md');
    if (app.dialog?.kind === 'prompt') await app.dialog.onSubmit('Kira');
    await wait();
    flushSync();
    const all = await saved(storage);
    expect(all).toHaveLength(7);
    expect(all[4]).toMatchObject({ kind: 'color', w: 0.15, h: 0.15 });
    expect(all[5]).toMatchObject({ kind: 'quote', quote: 'Be water.', source: 'Someone' });
    expect(all[6]).toMatchObject({ kind: 'page', page: 'Kira' });
    // Each lands a step from the last, so none hides another.
    expect(new Set(all.slice(4).map((i) => `${i.x},${i.y}`)).size).toBe(3);
    expect(items()).toHaveLength(7);
  });

  it('moves an item with the keyboard and lifts it on top', async () => {
    const { storage } = await boot();
    click([...document.querySelectorAll<HTMLButtonElement>('.board-bar button')].find((b) => b.textContent!.includes('Edit board')));
    const grab = items()[0]!.querySelector<HTMLButtonElement>('.b-grab')!;
    expect(grab.getAttribute('aria-label')).toBe('Move: quote The sea keeps what it is given.');
    grab.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await wait();
    flushSync();
    const all = await saved(storage);
    // The quote is now last in the file, so it lies on top, and one hundredth further right.
    expect(all.map((i) => i.kind)).toEqual(['color', 'page', 'image', 'quote']);
    expect(all[3]!.x).toBe(0.11);
    items().at(-1)!.querySelector<HTMLButtonElement>('.b-grab')!.dispatchEvent(new KeyboardEvent('keydown', { key: '+', bubbles: true }));
    await wait();
    expect((await saved(storage)).at(-1)!.w).toBe(0.32);
  });

  it('moves an item by dragging it, and resizes a colour from its corner', async () => {
    const { storage } = await boot();
    click([...document.querySelectorAll<HTMLButtonElement>('.board-bar button')].find((b) => b.textContent!.includes('Edit board')));
    const swatch = items()[1]!;
    const down = (el: Element, x: number, y: number) => el.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: x, clientY: y, button: 0 }));
    // Alt: placed exactly where it is dropped, without lining up with the others.
    const move = (x: number, y: number) => window.dispatchEvent(new MouseEvent('pointermove', { clientX: x, clientY: y, altKey: true }));
    down(swatch, 600, 200);
    move(700, 260); // 100 px right, 60 down: a tenth and 6 hundredths of the 1000 px board
    flushSync();
    expect(swatch.style.left).toBe('calc(60cqw)');
    window.dispatchEvent(new MouseEvent('pointerup'));
    await wait();
    flushSync();
    let colour = (await saved(storage)).at(-1)!;
    expect(colour).toMatchObject({ kind: 'color', x: 0.6, y: 0.16 });

    const handle = items().at(-1)!.querySelector('.b-handle')!;
    down(handle, 0, 0);
    move(50, 30);
    window.dispatchEvent(new MouseEvent('pointerup'));
    await wait();
    colour = (await saved(storage)).at(-1)!;
    expect(colour).toMatchObject({ w: 0.2, h: 0.18 });
  });

  it('does not write anything for a click that did not move the item', async () => {
    const { storage } = await boot();
    const before = await storage.readText('Boards/Coast.md');
    click([...document.querySelectorAll<HTMLButtonElement>('.board-bar button')].find((b) => b.textContent!.includes('Edit board')));
    items()[0]!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10, button: 0 }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    await wait();
    expect(await storage.readText('Boards/Coast.md')).toBe(before);
  });

  it('removes an item, edits a quote and a caption, and changes a colour', async () => {
    const { storage, target } = await boot();
    click([...document.querySelectorAll<HTMLButtonElement>('.board-bar button')].find((b) => b.textContent!.includes('Edit board')));
    click(items()[3]!.querySelector('button[aria-label="Remove from the board"]'));
    await wait();
    expect((await saved(storage)).map((i) => i.kind)).toEqual(['quote', 'color', 'page']);

    click(items()[0]!.querySelector('button[aria-label="Edit text"]'));
    expect(app.dialog?.kind).toBe('prompt');
    if (app.dialog?.kind === 'prompt') {
      expect(app.dialog.value).toBe('The sea keeps what it is given.\n— Old saying');
      await app.dialog.onSubmit('Be water.');
    }
    click(items()[1]!.querySelector('button[aria-label="Edit text"]'));
    if (app.dialog?.kind === 'prompt') {
      expect(app.dialog.value).toBe('Rust');
      await app.dialog.onSubmit('');
    }
    const picker = items()[1]!.querySelector<HTMLInputElement>('input[type="color"]')!;
    picker.value = '#00ff00';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    await wait();
    flushSync();
    const all = await saved(storage);
    expect(all[0]).toMatchObject({ quote: 'Be water.' });
    expect(all[0]!.source).toBeUndefined();
    expect(all[1]).toMatchObject({ color: '#00ff00' });
    expect(all[1]!.caption).toBeUndefined();
    expect(target.querySelectorAll('.b-item')).toHaveLength(3);
  });

  it('saves pictures into the world and pins them, one after the other', async () => {
    const { storage } = await boot();
    const png = (name: string) => new File([new Uint8Array([137, 80, 78, 71])], name, { type: 'image/png' });
    await app.addBoardPictures('Boards/Coast.md', [png('shore.png'), png('cliff.png'), new File(['x'], 'notes.txt', { type: 'text/plain' })]);
    await wait();
    const all = await saved(storage);
    expect(all.slice(4).map((i) => i.image)).toEqual(['shore.png', 'cliff.png']);
    expect(await storage.exists('attachments/shore.png')).toBe(true);
    expect(new Set(all.slice(4).map((i) => `${i.x},${i.y}`)).size).toBe(2);
  });

  it('asks for a picture of the world by name, with the pictures offered', async () => {
    const { storage } = await boot({ 'Boards/Coast.md': BOARD, 'Kira.md': '# Kira\n', 'attachments/shore.png': 'x' });
    app.askBoardPicture('Boards/Coast.md');
    expect(app.dialog?.kind === 'prompt' && app.dialog.suggestions).toEqual(['shore.png']);
    if (app.dialog?.kind === 'prompt') {
      await app.dialog.onSubmit('nothing.png');
      expect(app.toast?.text).toBe('There is no picture “nothing.png” in this world');
      await app.dialog.onSubmit('shore.png');
    }
    await wait();
    expect((await saved(storage)).at(-1)).toMatchObject({ kind: 'image', image: 'shore.png' });
  });

  it('is hidden when switched off, and the page is still a plain page', async () => {
    await boot();
    app.setFeature('moodBoards', false);
    flushSync();
    expect(document.querySelector('.board')).toBeNull();
    expect(document.querySelector('.prose')!.textContent).toContain('Words under the board.');
  });

  it('has a Mood board template that makes a board, offered only while boards are on', async () => {
    await boot();
    app.askNewPage();
    flushSync();
    expect([...document.querySelectorAll('.template-pick')[0]!.querySelectorAll('.template-chips button')].map((b) => b.textContent)).toContain('Mood board');
    app.dialog = null;
    const tpl = builtInTemplates('en').find((t) => t.name === 'Mood board')!;
    const path = await app.createPage('Storm look', tpl.folder, tpl);
    expect(path).toBe('Boards/Storm look.md');
    flushSync();
    await wait();
    expect(app.vault!.getPage(path!)!.frontmatter.moodboard).toBe(true);
    expect(document.querySelector('.board')).not.toBeNull();
    expect(document.querySelector('.board-empty')!.textContent).toContain('Nothing is pinned yet');
    app.setFeature('moodBoards', false);
    app.askNewPage();
    flushSync();
    expect([...document.querySelectorAll('.template-chips button')].map((b) => b.textContent)).not.toContain('Mood board');
  });

  it('pins a note, edits its words and changes its colour', async () => {
    const { storage } = await boot();
    click([...document.querySelectorAll<HTMLButtonElement>('.board-bar button')].find((b) => b.textContent!.includes('Edit board')));
    click([...document.querySelectorAll<HTMLButtonElement>('.board-bar button')].find((b) => b.textContent === '+ Note'));
    expect(app.dialog?.kind).toBe('prompt');
    if (app.dialog?.kind === 'prompt') await app.dialog.onSubmit('Storms come\nfrom the west');
    await wait();
    flushSync();
    let note = (await saved(storage)).at(-1)!;
    expect(note).toMatchObject({ kind: 'note', note: 'Storms come\nfrom the west', tint: '#f3e3a1', w: 0.22 });
    const el = items().at(-1)!;
    expect(el.querySelector('.b-notecard p')!.textContent).toBe('Storms come\nfrom the west');
    click(el.querySelector('button[aria-label="Edit text"]'));
    if (app.dialog?.kind === 'prompt') {
      expect(app.dialog.value).toBe('Storms come\nfrom the west');
      await app.dialog.onSubmit('Calm sea');
    }
    await wait();
    flushSync();
    const picker = items().at(-1)!.querySelector<HTMLInputElement>('input[aria-label="Note colour"]')!;
    picker.value = '#2d3b45';
    picker.dispatchEvent(new Event('change', { bubbles: true }));
    await wait();
    flushSync();
    note = (await saved(storage)).at(-1)!;
    expect(note).toMatchObject({ note: 'Calm sea', tint: '#2d3b45' });
    // Light text on a dark note.
    expect((items().at(-1)!.querySelector('.b-notecard') as HTMLElement).style.color).toBe('rgb(255, 255, 255)');
  });

  it('lines a dragged item up with its neighbours and shows the line while it moves', async () => {
    const { storage } = await boot();
    click([...document.querySelectorAll<HTMLButtonElement>('.board-bar button')].find((b) => b.textContent!.includes('Edit board')));
    const swatch = items()[1]!; // the colour at x 0.5
    swatch.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 500, clientY: 100, button: 0 }));
    // 95 px left: its left edge comes to 0.405, near the quote's right edge (0.4).
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 405, clientY: 100 }));
    flushSync();
    expect(swatch.style.left).toBe('calc(40cqw)');
    expect((document.querySelector('.b-guide-x') as HTMLElement).style.left).toBe('calc(40cqw)');
    window.dispatchEvent(new MouseEvent('pointerup'));
    await wait();
    flushSync();
    expect(document.querySelector('.b-guide-x')).toBeNull();
    expect((await saved(storage)).at(-1)).toMatchObject({ kind: 'color', x: 0.4 });
  });

  it('crops a picture with Shift on its corner, and shows it whole again', async () => {
    const { storage } = await boot({ 'Boards/Coast.md': '---\nmoodboard: true\nboard:\n  - image: sea.png\n    x: 0.1\n    y: 0.1\n    w: 0.4\n---\n', 'sea.png': 'png' });
    click([...document.querySelectorAll<HTMLButtonElement>('.board-bar button')].find((b) => b.textContent!.includes('Edit board')));
    const handle = items()[0]!.querySelector('.b-handle')!;
    handle.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, button: 0 }));
    // Shift, 100 px up: the picture (0.3 tall until measured) becomes 0.2 tall.
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 0, clientY: -100, shiftKey: true, altKey: true }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    await wait();
    flushSync();
    let pic = (await saved(storage))[0]!;
    expect(pic).toMatchObject({ kind: 'image', w: 0.4, h: 0.2 });
    expect((items()[0]!.querySelector('.b-crop') as HTMLElement).style.height).toBe('calc(20cqw)');
    // Without Shift a cropped picture keeps its shape.
    items()[0]!.querySelector('.b-handle')!.dispatchEvent(new MouseEvent('pointerdown', { bubbles: true, clientX: 0, clientY: 0, button: 0 }));
    window.dispatchEvent(new MouseEvent('pointermove', { clientX: 200, clientY: 0, altKey: true }));
    window.dispatchEvent(new MouseEvent('pointerup'));
    await wait();
    flushSync();
    pic = (await saved(storage))[0]!;
    expect(pic).toMatchObject({ w: 0.6, h: 0.3 });
    click(items()[0]!.querySelector('button[aria-label="Show the whole picture"]'));
    await wait();
    flushSync();
    expect((await saved(storage))[0]!.h).toBeUndefined();
    expect(items()[0]!.querySelector('.b-crop')).toBeNull();
  });

  it('zooms the board in steps and remembers it for the page', async () => {
    await boot();
    const frame = () => document.querySelector<HTMLElement>('.board-frame')!;
    expect(frame().style.width).toBe('calc(100%)');
    click(document.querySelector('.board-zoom button[aria-label^="Zoom in"]'));
    click(document.querySelector('.board-zoom button[aria-label^="Zoom in"]'));
    expect(frame().style.width).toBe('calc(150%)');
    expect(document.querySelector('.board-zoom-value')!.textContent).toBe('150%');
    expect(app.worldPref('boardZoom:Boards/Coast.md')).toBe('1.5');
    // Ctrl + wheel zooms out.
    document.querySelector('.board-scroll')!.dispatchEvent(new WheelEvent('wheel', { deltaY: 100, ctrlKey: true, bubbles: true, cancelable: true }));
    flushSync();
    expect(document.querySelector('.board-zoom-value')!.textContent).toBe('125%');
    click(document.querySelector('.board-zoom-value'));
    expect(frame().style.width).toBe('calc(100%)');
  });

  it('is listed in Settings with the pages that use it, and dropped by the Just notes profile', async () => {
    await boot();
    app.settingsOpen = true;
    flushSync();
    const row = [...document.querySelectorAll<HTMLLabelElement>('.settings .setting')].find((l) => l.querySelector('.setting-name')!.textContent === 'Mood boards')!;
    expect(row.querySelector('input')!.checked).toBe(true);
    expect(featureUsage(app.vault!.index).moodBoards.map((p) => p.path)).toEqual(['Boards/Coast.md']);
    expect(document.querySelector('.settings')!.textContent).toContain('Used on 1 page of this world');
    expect(PROFILES.find((p) => p.id === 'writer')!.off).not.toContain('moodBoards');
    expect(PROFILES.find((p) => p.id === 'worldbuilder')!.off).not.toContain('moodBoards');
    expect(PROFILES.find((p) => p.id === 'notes')!.off).toContain('moodBoards');
  });
});
