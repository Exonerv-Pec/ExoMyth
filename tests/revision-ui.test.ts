import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { EditorView } from '@codemirror/view';
import App from '../src/App.svelte';
import { app } from '../src/app.svelte';
import { Vault } from '../src/core/vault';
import { MemoryStorage } from '../src/core/storage';
import { PROFILES } from '../src/core/profiles';
import { featureUsage } from '../src/core/usage';
import { versionFile } from '../src/core/versions';

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
  URL.createObjectURL = () => 'blob:x';
  URL.revokeObjectURL = () => {};
});

const wait = (ms = 40) => new Promise((r) => setTimeout(r, ms));

const SCENE = `---
status: draft
revision:
  - Raise the stakes
  - "[x] Fix the year"
---
# Duel

Arn drew {==his old sword==}{>>Which sword? Name it.<<} and waited.{>>Slow here<<} The crowd {++fell ++}silent. He was {--very --}calm and {~~sad~>ready~~}.
`;

describe('editing workspace', () => {
  let mounted: ReturnType<typeof mount>[] = [];
  afterEach(() => {
    mounted.forEach((m) => unmount(m));
    mounted = [];
    document.body.innerHTML = '';
    app.closeVault();
    app.resetFeatures(); // with no world open: the choice for the whole browser
    app.dialog = null;
    app.revisionOpen = false;
    app.setMode('split');
  });

  async function boot(mode: 'preview' | 'split' = 'preview', files: Record<string, string> = { 'Scenes/Duel.md': SCENE, 'Other.md': '# Other\n\nA {>>note<<} here.\n' }) {
    app.lang = 'en';
    app.setMode(mode);
    const storage = new MemoryStorage(`t-${Math.random()}`, files);
    const vault = await Vault.open(storage);
    app.setVault(vault);
    app.current = Object.keys(files)[0] ?? null;
    const target = document.createElement('div');
    document.body.append(target);
    mounted.push(mount(App, { target }));
    flushSync();
    await wait();
    flushSync();
    return { storage, vault, target };
  }

  const click = (el: Element | null | undefined) => {
    expect(el).toBeTruthy();
    (el as HTMLElement).click();
    flushSync();
  };
  const button = (text: string, root: ParentNode = document) => [...root.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent?.trim() === text);
  const openPanel = () => click(document.querySelector('button[aria-label="Editing"]'));
  const file = (storage: MemoryStorage, path = 'Scenes/Duel.md') => storage.readText(path);
  const editor = () => EditorView.findFromDOM(document.querySelector('.cm-editor') as HTMLElement)!;

  it('shows comments and suggested changes in the reading view', async () => {
    await boot();
    const prose = document.querySelector('.prose')!;
    expect(prose.querySelector('mark.critic-mark')!.textContent).toBe('his old sword');
    const notes = [...prose.querySelectorAll('.critic-note')];
    expect(notes.map((n) => n.querySelector('.critic-num')!.textContent)).toEqual(['1', '2']);
    expect(notes[0]!.querySelector('.critic-tip')!.textContent).toBe('Which sword? Name it.');
    expect([...prose.querySelectorAll('ins.critic-ins')].map((e) => e.textContent)).toEqual(['fell ', 'ready']);
    expect([...prose.querySelectorAll('del.critic-del')].map((e) => e.textContent)).toEqual(['very ', 'sad']);
    // Clicking a comment opens its words (for touch screens).
    click(notes[0]);
    expect(notes[0]!.classList.contains('open')).toBe(true);
    // Notes from the header are not facts of the page.
    expect(document.querySelector('.infobox')?.textContent ?? '').not.toContain('Raise');
  });

  it('switched off, the reading view shows the text without comments', async () => {
    app.setFeature('revision', false);
    await boot();
    const prose = document.querySelector('.prose')!;
    expect(prose.querySelector('.critic-note, mark, ins, del')).toBeNull();
    expect(prose.textContent).toContain('Arn drew his old sword and waited. The crowd silent. He was very calm and sad.');
  });

  it('the editing panel lists comments, changes, notes and other pages with open work', async () => {
    await boot();
    expect(document.querySelector('.revpanel')).toBeNull();
    openPanel();
    const panel = document.querySelector('.revpanel')!;
    expect(panel).toBeTruthy();
    expect(document.querySelector('.relpanel:not(.revpanel)')).toBeNull(); // in the relations panel's place
    const comments = [...panel.querySelectorAll('[data-item^="c"]')];
    expect(comments.map((c) => c.querySelector('.rev-num')!.textContent)).toEqual(['1', '2']);
    expect(comments[0]!.querySelector('.rev-quote')!.textContent).toBe('his old sword');
    expect(comments[0]!.querySelector('.rev-comment')!.textContent).toBe('Which sword? Name it.');
    expect([...panel.querySelectorAll('.rev-change .rev-comment')].map((c) => c.textContent)).toEqual(['Add “fell”', 'Remove “very”', '“sad” → “ready”']);
    expect([...panel.querySelectorAll('.rev-notes li')].map((li) => [li.textContent?.trim(), li.classList.contains('done')])).toEqual([
      ['Raise the stakes', false],
      ['Fix the year', true],
    ]);
    expect([...panel.querySelectorAll('.rev-world li .link-btn')].map((b) => b.textContent)).toEqual(['Duel', 'Other']);
    // Without the editor there is nothing to select.
    expect(button('+ Comment', panel)!.disabled).toBe(true);
    // Closing brings the relations panel back.
    click(panel.querySelector('button[aria-label="Close editing"]'));
    expect(document.querySelector('.revpanel')).toBeNull();
    expect(document.querySelector('.relpanel')).toBeTruthy();
  });

  it('resolves comments and settles changes, straight in the file when no editor is open', async () => {
    const { storage } = await boot();
    openPanel();
    click(document.querySelector('[data-item="c1"] button[aria-label^="Resolve"]'));
    await wait();
    expect(await file(storage)).toContain('Arn drew his old sword and waited.{>>Slow here<<}');
    flushSync();
    click(button('Accept', document.querySelector('[data-item="k1"]')!));
    await wait();
    expect(await file(storage)).toContain('The crowd fell silent.');
    flushSync();
    click(button('Reject all'));
    await wait();
    expect(await file(storage)).toContain('He was very calm and sad.');
  });

  it('adds, ticks and clears notes', async () => {
    const { storage } = await boot();
    openPanel();
    const input = document.querySelector<HTMLInputElement>('.rev-add input')!;
    input.value = 'Cut the first line';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
    click(button('Add', document.querySelector('.rev-add')!));
    await wait();
    flushSync();
    expect(await file(storage)).toContain('  - Cut the first line');
    const box = document.querySelectorAll<HTMLInputElement>('.rev-notes input[type="checkbox"]')[0]!;
    box.checked = true;
    box.dispatchEvent(new Event('change', { bubbles: true }));
    await wait();
    flushSync();
    expect(await file(storage)).toContain('[x] Raise the stakes');
    click(button('Remove done'));
    await wait();
    expect(await file(storage)).toMatch(/revision:\n {2}- Cut the first line\n---/);
  });

  it('comments on the selection in the editor with Ctrl+Alt+M, as one step to undo', async () => {
    const { storage } = await boot('split', { 'Scene.md': 'The river was cold.\n' });
    const view = editor();
    view.dispatch({ selection: { anchor: 4, head: 9 } });
    view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: 'm', code: 'KeyM', ctrlKey: true, altKey: true, bubbles: true, cancelable: true }));
    flushSync();
    expect(app.dialog?.kind).toBe('prompt');
    if (app.dialog?.kind === 'prompt') {
      expect(app.dialog.label).toBe('Comment on the selection');
      await app.dialog.onSubmit('Which river?');
    }
    expect(view.state.doc.toString()).toBe('The {==river==}{>>Which river?<<} was cold.\n');
    await app.flush();
    expect(await file(storage, 'Scene.md')).toBe('The {==river==}{>>Which river?<<} was cold.\n');
    // The panel's button does the same, at the cursor this time.
    openPanel();
    view.dispatch({ selection: { anchor: view.state.doc.length - 1 } });
    click(button('+ Comment'));
    if (app.dialog?.kind === 'prompt') {
      expect(app.dialog.label).toBe('Comment at the cursor');
      await app.dialog.onSubmit('End?');
    }
    expect(view.state.doc.toString()).toBe('The {==river==}{>>Which river?<<} was cold.{>>End?<<}\n');
    await wait();
    flushSync();
    expect(document.querySelectorAll('.revpanel [data-item^="c"]')).toHaveLength(2);
  });

  it('keeps a version before the first save and not again for a while; lists and compares it', async () => {
    const { storage, vault } = await boot('split', { 'Scene.md': '# Scene\n\nThe river was cold.\n' });
    const view = editor();
    view.dispatch({ changes: { from: view.state.doc.length, insert: 'Arn waited.\n' } });
    await app.flush();
    let versions = await vault.versions('Scene.md');
    expect(versions).toHaveLength(1);
    expect(await vault.readVersion(versions[0]!.file)).toBe('# Scene\n\nThe river was cold.\n');
    view.dispatch({ changes: { from: view.state.doc.length, insert: 'More.\n' } });
    await app.flush();
    expect(await vault.versions('Scene.md')).toHaveLength(1);

    openPanel();
    await wait();
    flushSync();
    const row = document.querySelector('.rev-versions li')!;
    expect(row.querySelector('.rv-name')!.textContent).toBe('saved by itself');
    expect(document.querySelector('[aria-labelledby="rev-versions"] .rev-about')!.textContent).toContain('1 version');
    click(button('Compare', row));
    await wait();
    flushSync();
    const dialog = document.querySelector('.dialog.compare')!;
    expect(dialog).toBeTruthy();
    expect([...dialog.querySelectorAll('.diff ins')].map((e) => e.textContent)).toEqual(['Arn waited.\nMore.\n']);
    expect(dialog.querySelector('.cmp-stats')!.textContent).toContain('+3');

    // Restoring keeps the current text as a version first.
    click(button('Restore “Before”', dialog));
    expect(app.dialog?.kind).toBe('confirm');
    if (app.dialog?.kind === 'confirm') await app.dialog.onConfirm();
    await app.flush();
    expect(await file(storage, 'Scene.md')).toBe('# Scene\n\nThe river was cold.\n');
    versions = await vault.versions('Scene.md');
    expect(versions).toHaveLength(2);
    expect(await vault.readVersion(versions[0]!.file)).toBe('# Scene\n\nThe river was cold.\nArn waited.\nMore.\n');
    expect(app.compare).toBeNull();
  });

  it('saves a named version, names and deletes versions', async () => {
    const { vault } = await boot();
    openPanel();
    await wait();
    flushSync();
    expect(document.querySelector('.revpanel')!.textContent).toContain('No versions yet');
    click(button('Save version…'));
    if (app.dialog?.kind === 'prompt') await app.dialog.onSubmit('Before the rewrite');
    await wait();
    flushSync();
    const versions = await vault.versions('Scenes/Duel.md');
    expect(versions.map((v) => v.name)).toEqual(['Before the rewrite']);
    expect(await vault.readVersion(versions[0]!.file)).toBe(SCENE);
    expect(document.querySelector('.rev-versions .rv-name')!.textContent).toBe('Before the rewrite');
    click(document.querySelector('.rev-versions button[aria-label="Version name"]'));
    if (app.dialog?.kind === 'prompt') await app.dialog.onSubmit('Draft one');
    await wait();
    flushSync();
    expect((await vault.versions('Scenes/Duel.md'))[0]!.name).toBe('Draft one');
    click(document.querySelector('.rev-versions button[aria-label="Delete version"]'));
    if (app.dialog?.kind === 'confirm') await app.dialog.onConfirm();
    await wait();
    flushSync();
    expect(await vault.versions('Scenes/Duel.md')).toEqual([]);
  });

  it('versions switched off: nothing is kept by itself and the panel has no versions', async () => {
    app.setFeature('versions', false);
    const { vault } = await boot('split', { 'Scene.md': 'Old.\n' });
    const view = editor();
    view.dispatch({ changes: { from: 0, insert: 'New. ' } });
    await app.flush();
    expect(await vault.versions('Scene.md')).toEqual([]);
    openPanel();
    expect(document.querySelector('#rev-versions')).toBeNull();
    expect(document.querySelector('#rev-comments')).toBeTruthy();
  });

  it('both parts off: no editing button', async () => {
    app.setFeature('versions', false);
    app.setFeature('revision', false);
    await boot();
    expect(document.querySelector('button[aria-label="Editing"]')).toBeNull();
  });

  it('a version of the demo world can be compared with its scene', async () => {
    const { DEMO_FILES } = await import('../src/demo');
    const vault = await Vault.open(new MemoryStorage('demo-versions', DEMO_FILES));
    const versions = await vault.versions('Scenes/The Market.md');
    expect(versions.map((v) => v.name)).toEqual(['First draft']);
    expect(versions[0]!.file).toBe(versionFile('Scenes/The Market.md', versions[0]!.time, 'First draft'));
    expect(vault.pages.some((p) => p.path.startsWith('.exomyth'))).toBe(false);
  });

  it('suggests changes while typing when switched on with Ctrl+Shift+E', async () => {
    const { storage } = await boot('split', { 'Scene.md': 'The old sea.\n' });
    const view = editor();
    const key = (k: string, extra: KeyboardEventInit) => view.contentDOM.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
    key('E', { code: 'KeyE', keyCode: 69, ctrlKey: true, shiftKey: true });
    flushSync();
    expect(app.suggesting).toBe(true);
    expect(document.querySelector('.suggest-chip')).toBeTruthy();
    expect(document.querySelector('.cm-editor.cm-suggesting')).toBeTruthy();
    // Typing "grey " before "sea", then Backspace over "old".
    view.dispatch({ selection: { anchor: 8 } });
    view.dispatch(view.state.update({ changes: { from: 8, insert: 'g' }, selection: { anchor: 9 }, userEvent: 'input.type' }));
    const at = view.state.selection.main.head;
    view.dispatch(view.state.update({ changes: { from: at, insert: 'rey ' }, selection: { anchor: at + 4 }, userEvent: 'input.type' }));
    expect(view.state.doc.toString()).toBe('The old {++grey ++}sea.\n');
    view.dispatch({ selection: { anchor: 7 } });
    for (let i = 0; i < 3; i++) {
      const head = view.state.selection.main.head;
      view.dispatch(view.state.update({ changes: { from: head - 1, to: head }, selection: { anchor: head - 1 }, userEvent: 'delete.backward' }));
    }
    expect(view.state.doc.toString()).toBe('The {--old--} {++grey ++}sea.\n');
    await app.flush();
    expect(await file(storage, 'Scene.md')).toBe('The {--old--} {++grey ++}sea.\n');
    // Undo is never turned into a suggestion, and the panel lists both changes.
    openPanel();
    await wait();
    flushSync();
    expect([...document.querySelectorAll('.rev-change .rev-comment')].map((c) => c.textContent)).toEqual(['Remove “old”', 'Add “grey”']);
    // Accepting from the panel while suggesting really changes the text.
    click(button('Accept all'));
    await wait();
    expect(view.state.doc.toString()).toBe('The grey sea.\n');
    // Off again from the chip; typing is plain.
    click(document.querySelector('.suggest-chip'));
    expect(app.suggesting).toBe(false);
    view.dispatch(view.state.update({ changes: { from: 0, insert: 'X' }, userEvent: 'input.type' }));
    expect(view.state.doc.toString()).toBe('XThe grey sea.\n');
  });

  it('replies to a comment, shows the thread, and edits a reply', async () => {
    const { storage } = await boot();
    openPanel();
    const first = () => document.querySelector('[data-item="c1"]')!;
    click(button('Reply', first()));
    expect(app.dialog?.kind).toBe('prompt');
    if (app.dialog?.kind === 'prompt') await app.dialog.onSubmit('The one from his father.');
    await wait();
    flushSync();
    expect(await file(storage)).toContain('{==his old sword==}{>>Which sword? Name it.<<}{>>The one from his father.<<}');
    expect([...first().querySelectorAll('.rev-replies li')].map((li) => li.textContent?.trim())).toEqual(['The one from his father.']);
    // The reading view shows the reply under the comment, and how many there are.
    const note = document.querySelector('.prose .critic-note')!;
    expect(note.querySelector('.critic-count')!.textContent).toBe('+1');
    expect(note.querySelector('.critic-reply')!.textContent).toBe('The one from his father.');
    click(first().querySelector('.rev-replies button[aria-label="Edit reply"]'));
    if (app.dialog?.kind === 'prompt') await app.dialog.onSubmit('');
    await wait();
    expect(await file(storage)).toContain('{==his old sword==}{>>Which sword? Name it.<<} and waited.');
  });

  it('comments on words selected in the reading view', async () => {
    const { storage } = await boot('preview', { 'Scene.md': '# Scene\n\nThe river was cold. The **river** was wide.\n' });
    const prose = document.querySelector('.prose')!;
    // Select the second "river" (inside the bold text).
    const strong = prose.querySelector('strong')!;
    const range = document.createRange();
    range.selectNodeContents(strong);
    const sel = document.getSelection()!;
    sel.removeAllRanges();
    sel.addRange(range);
    document.dispatchEvent(new Event('selectionchange'));
    flushSync();
    const btn = document.querySelector<HTMLButtonElement>('.sel-comment')!;
    expect(btn.textContent).toContain('Comment');
    click(btn);
    expect(app.dialog?.kind).toBe('prompt');
    if (app.dialog?.kind === 'prompt') {
      expect(app.dialog.label).toBe('Comment on “river”');
      await app.dialog.onSubmit('Which one?');
    }
    await wait();
    expect(await file(storage, 'Scene.md')).toBe('# Scene\n\nThe river was cold. The **{==river==}{>>Which one?<<}** was wide.\n');
    expect(document.querySelector('.sel-comment')).toBeNull();
  });

  it('is in Settings, the profiles and the usage list', async () => {
    const { vault } = await boot();
    expect(featureUsage(vault.index).revision.map((p) => p.title)).toEqual(['Duel', 'Other']);
    expect(PROFILES.find((p) => p.id === 'gamemaster')!.off).toContain('revision');
    expect(PROFILES.find((p) => p.id === 'gamemaster')!.off).not.toContain('versions');
    expect(PROFILES.find((p) => p.id === 'notes')!.off).toEqual(expect.arrayContaining(['revision', 'versions']));
    expect(PROFILES.find((p) => p.id === 'writer')!.off).not.toContain('revision');
    app.settingsOpen = true;
    flushSync();
    const names = [...document.querySelectorAll('.settings .setting-name')].map((n) => n.textContent);
    expect(names).toEqual(expect.arrayContaining(['Editing: comments and notes', 'Page versions']));
    app.settingsOpen = false;
  });
});
