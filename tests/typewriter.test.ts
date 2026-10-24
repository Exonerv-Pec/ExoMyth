import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { EditorState, Text } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import App from '../src/App.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { paragraphAround, typewriter } from '../src/editorTypewriter';
import { PROFILES } from '../src/core/profiles';

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
});

describe('paragraphAround', () => {
  const doc = Text.of(['First line', 'still first', '', 'Second', '', '', 'Third one', 'and more']);
  const word = (pos: number) => {
    const p = paragraphAround(doc, pos);
    return doc.sliceString(p.from, p.to);
  };

  it('spans the lines up to the blank lines around it', () => {
    expect(word(3)).toBe('First line\nstill first');
    expect(word(doc.line(2).from + 2)).toBe('First line\nstill first');
    expect(word(doc.line(4).from)).toBe('Second');
    expect(word(doc.line(8).to)).toBe('Third one\nand more');
  });

  it('is just the line itself on a blank line, so a new paragraph starts alone', () => {
    const p = paragraphAround(doc, doc.line(5).from);
    expect(p).toEqual({ from: doc.line(5).from, to: doc.line(5).to });
  });
});

describe('keeping the line in the middle', () => {
  const doc = 'one\n\ntwo\n\nthree';
  const plain = EditorState.create({ doc });
  const state = EditorState.create({ doc, extensions: [typewriter()] });

  it('brings the cursor back to the middle after typing and keyboard moves, not after a click', () => {
    expect(plain.update({ changes: { from: 0, insert: 'x' }, userEvent: 'input.type' }).effects.length).toBe(0);
    expect(state.update({ changes: { from: 0, insert: 'x' }, userEvent: 'input.type' }).effects.length).toBe(1);
    expect(state.update({ selection: { anchor: 6 }, userEvent: 'select' }).effects.length).toBe(1);
    expect(state.update({ selection: { anchor: 6 }, userEvent: 'select.pointer' }).effects.length).toBe(0);
    expect(state.update({}).effects.length).toBe(0);
  });
});

describe('in focus mode', () => {
  let mounted: ReturnType<typeof mount>[] = [];
  afterEach(() => {
    mounted.forEach((m) => unmount(m));
    mounted = [];
    document.body.innerHTML = '';
    app.resetFeatures();
    app.closeVault();
    app.setMode('split');
  });

  const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

  async function boot() {
    app.lang = 'en';
    app.setMode('split');
    const text = '# Story\n\nThe first paragraph\nruns two lines.\n\nThe second paragraph.\n\nThe third paragraph.\n';
    app.setVault(await Vault.open(new MemoryStorage(`t-${Math.random()}`, { 'Story.md': text })));
    app.current = 'Story.md';
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(App, { target }));
    flushSync();
    await wait();
    flushSync();
    const view = EditorView.findFromDOM(target.querySelector<HTMLElement>('.cm-editor')!)!;
    return { target, view, text };
  }

  const dimmed = (target: HTMLElement) => [...target.querySelectorAll('.cm-line')].filter((l) => l.classList.contains('cm-tw-dim')).map((l) => l.textContent);

  it('dims the other paragraphs and follows the cursor, and is off outside focus mode', async () => {
    const { target, view, text } = await boot();
    expect(dimmed(target)).toEqual([]);
    expect(target.querySelector('.workspace')!.classList.contains('typewriter')).toBe(false);

    app.setFocus(true);
    flushSync();
    await wait();
    expect(target.querySelector('.workspace')!.classList.contains('typewriter')).toBe(true);

    view.dispatch({ selection: { anchor: text.indexOf('The second') + 4 } });
    flushSync();
    expect(dimmed(target)).toEqual(['# Story', '', 'The first paragraph', 'runs two lines.', '', '', 'The third paragraph.', '']);

    view.dispatch({ selection: { anchor: text.indexOf('runs two') + 2 } });
    flushSync();
    const dim = dimmed(target);
    expect(dim).not.toContain('The first paragraph');
    expect(dim).not.toContain('runs two lines.');
    expect(dim).toContain('The second paragraph.');

    // The text itself is never changed.
    expect(view.state.doc.toString()).toBe(text);

    app.setFocus(false);
    flushSync();
    await wait();
    expect(dimmed(target)).toEqual([]);
    expect(target.querySelector('.workspace')!.classList.contains('typewriter')).toBe(false);
  });

  it('can be switched off in Settings while focus mode stays', async () => {
    const { target } = await boot();
    app.setFocus(true);
    flushSync();
    await wait();
    expect(target.querySelector('.workspace')!.classList.contains('typewriter')).toBe(true);
    app.setFeature('typewriter', false);
    flushSync();
    await wait();
    expect(app.focus).toBe(true);
    expect(target.querySelector('.workspace')!.classList.contains('typewriter')).toBe(false);
    expect(dimmed(target)).toEqual([]);
  });

  it('is a switch under focus mode in Settings, and writers keep it while other profiles drop it', async () => {
    await boot();
    app.settingsOpen = true;
    flushSync();
    const row = [...document.querySelectorAll<HTMLLabelElement>('.settings .setting')].find((l) => l.querySelector('.setting-name')!.textContent === 'Typewriter scrolling')!;
    expect(row.querySelector('input')!.checked).toBe(true);
    app.setFeature('focusMode', false);
    flushSync();
    expect(row.querySelector('input')!.disabled).toBe(true);
    expect(row.textContent).toContain('Needs Focus mode to be on');
    app.settingsOpen = false;
    expect(PROFILES.find((p) => p.id === 'writer')!.off).not.toContain('typewriter');
    for (const id of ['worldbuilder', 'gamemaster', 'notes']) expect(PROFILES.find((p) => p.id === id)!.off).toContain('typewriter');
  });
});
