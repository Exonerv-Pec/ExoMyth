import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import Workspace from '../src/components/Workspace.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { EditorView } from '@codemirror/view';
import { mediaInState } from '../src/editorMedia';

beforeAll(() => {
  const rect = { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) };
  Range.prototype.getBoundingClientRect = () => rect as DOMRect;
  Range.prototype.getClientRects = () => ({ length: 0, item: () => null, [Symbol.iterator]: function* () {} }) as unknown as DOMRectList;
  Element.prototype.scrollIntoView = () => {};
  (globalThis as unknown as { ResizeObserver: unknown }).ResizeObserver ??= class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
  URL.createObjectURL = () => 'blob:test/1';
  URL.revokeObjectURL = () => {};
});

let mounted: ReturnType<typeof mount> | undefined;
afterEach(() => {
  if (mounted) unmount(mounted);
  mounted = undefined;
  document.body.innerHTML = '';
  app.closeVault();
  app.setMode('split');
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

async function boot(mode: 'edit' | 'split') {
  app.lang = 'en';
  app.setMode(mode);
  const vault = await Vault.open(
    new MemoryStorage('t', {
      'Page.md': '---\nimage: crest.png\n---\nIntro\n\n![[map.png|300]]\n\n`![[not-this.png]]`\n\n![[theme.mp3]] ![[gone.png]]\n',
      'attachments/map.png': 'p',
      'attachments/crest.png': 'c',
      'attachments/theme.mp3': 'a',
    }),
  );
  app.setVault(vault);
  app.current = 'Page.md';
  const target = document.createElement('div');
  document.body.append(target);
  mounted = mount(Workspace, { target });
  flushSync();
  await wait();
  return target;
}

describe('media in the text editor', () => {
  it('shows pictures and players under their lines in Text mode', async () => {
    const target = await boot('edit');
    const editor = target.querySelector<HTMLElement>('.cm-editor')!;
    const view = EditorView.findFromDOM(editor)!;
    // The image: field, the map, the audio and a missing file; the one inside inline code is ignored.
    expect(mediaInState(view.state)).toEqual([
      { target: 'crest.png', kind: 'image', found: true },
      { target: 'map.png', kind: 'image', found: true, width: 300 },
      { target: 'theme.mp3', kind: 'audio', found: true },
      { target: 'gone.png', kind: 'image', found: false },
    ]);
    // Drawn in the editor (jsdom only lays out the first screen of it).
    const first = editor.querySelector('.cm-media img')!;
    expect(first.getAttribute('src')).toMatch(/^blob:/);
    expect(editor.querySelector<HTMLImageElement>('.cm-media img[alt="map.png"]')!.style.width).toBe('300px');
    // The text itself is untouched.
    expect(view.state.doc.toString()).toContain('![[map.png|300]]');
  });

  it('leaves them to the reading pane in Side by side mode, and brings them back in Text mode', async () => {
    const target = await boot('split');
    const view = EditorView.findFromDOM(target.querySelector<HTMLElement>('.cm-editor')!)!;
    expect(mediaInState(view.state)).toEqual([]);
    expect(target.querySelectorAll('.cm-editor .cm-media').length).toBe(0);
    expect(target.querySelector('.reading .embed[data-embed="map.png"]')).toBeTruthy();
    app.setMode('edit');
    flushSync();
    await wait();
    expect(mediaInState(view.state).length).toBe(4);
    expect(target.querySelectorAll('.cm-editor .cm-media').length).toBeGreaterThan(0);
  });
});
