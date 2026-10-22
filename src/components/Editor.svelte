<script lang="ts">
  import { onMount } from 'svelte';
  import { EditorState, type Range } from '@codemirror/state';
  import {
    EditorView,
    Decoration,
    MatchDecorator,
    ViewPlugin,
    keymap,
    drawSelection,
    type DecorationSet,
    type ViewUpdate,
  } from '@codemirror/view';
  import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
  import { markdown } from '@codemirror/lang-markdown';
  import { autocompletion, type CompletionContext, type CompletionResult } from '@codemirror/autocomplete';
  import { app } from '../app.svelte';
  import { dirName } from '../core/names';
  import { headingSlug } from '../core/render';
  import { parseLinkText } from '../core/parse';

  let { path }: { path: string } = $props();

  let host: HTMLDivElement;
  let view: EditorView | undefined;
  let dirty = false;
  let applyingExternal = false;
  let saveTimer: ReturnType<typeof setTimeout> | undefined;

  /* ------------------------------------------------------------- saving */

  async function save(): Promise<void> {
    clearTimeout(saveTimer);
    if (!view || !dirty || !app.vault) return;
    const text = view.state.doc.toString();
    app.saveStatus = 'saving';
    try {
      await app.vault.savePage(path, text);
      if (view && view.state.doc.toString() === text) {
        dirty = false;
        app.saveStatus = 'saved';
      } else {
        schedule();
      }
    } catch (e) {
      app.saveStatus = 'error';
      app.fail(e);
    }
  }

  function schedule() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => void save(), 600);
  }

  /* -------------------------------------------------------- completion */

  function wikiCompletion(ctx: CompletionContext): CompletionResult | null {
    const m = ctx.matchBefore(/\[\[[^\[\]\n|#]*/);
    if (!m || !app.vault) return null;
    const start = m.from + 2;
    const pages = app.vault.index.pages;
    const options = [];
    for (const p of pages) {
      options.push({ label: p.name, detail: dirName(p.path) || undefined, type: 'text', boost: 1 });
      for (const alias of p.aliases) options.push({ label: alias, detail: `→ ${p.name}`, type: 'text', boost: 0 });
    }
    return {
      from: start,
      options: options.map((o) => ({
        ...o,
        apply: (v: EditorView, _c: unknown, from: number, to: number) => {
          const after = v.state.sliceDoc(to, to + 2);
          const insert = after === ']]' ? o.label : `${o.label}]]`;
          const cursor = from + o.label.length + 2;
          v.dispatch({ changes: { from, to, insert }, selection: { anchor: cursor } });
        },
      })),
      validFor: /^[^\[\]\n|#]*$/,
    };
  }

  /* ----------------------------------------------------- decorations */

  const linkMatcher = new MatchDecorator({
    regexp: /\[\[[^\[\]\n]+\]\]/g,
    decoration: Decoration.mark({ class: 'cm-wikilink' }),
  });
  const spoilerMatcher = new MatchDecorator({
    regexp: /\|\|[^|\n]+\|\|/g,
    decoration: Decoration.mark({ class: 'cm-spoiler' }),
  });

  const matchPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(v: EditorView) {
        this.decorations = this.build(v);
      }
      build(v: EditorView): DecorationSet {
        return mergeDecos(linkMatcher.createDeco(v), spoilerMatcher.createDeco(v));
      }
      update(u: ViewUpdate) {
        if (u.docChanged || u.viewportChanged) this.decorations = this.build(u.view);
      }
    },
    { decorations: (v) => v.decorations },
  );

  function mergeDecos(a: DecorationSet, b: DecorationSet): DecorationSet {
    const ranges: Range<Decoration>[] = [];
    for (const set of [a, b]) {
      const cursor = set.iter();
      while (cursor.value) {
        ranges.push(cursor.value.range(cursor.from, cursor.to));
        cursor.next();
      }
    }
    return Decoration.set(ranges, true);
  }

  /** Marks the YAML block at the top so it reads as metadata, not prose. */
  const frontmatterPlugin = ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(v: EditorView) {
        this.decorations = this.build(v);
      }
      build(v: EditorView): DecorationSet {
        const doc = v.state.doc;
        if (doc.lines < 2 || doc.line(1).text.trim() !== '---') return Decoration.none;
        let end = 0;
        for (let i = 2; i <= doc.lines; i++) {
          if (doc.line(i).text.trim() === '---') {
            end = i;
            break;
          }
        }
        if (!end) return Decoration.none;
        const ranges = [];
        for (let i = 1; i <= end; i++) {
          ranges.push(Decoration.line({ class: 'cm-fm' }).range(doc.line(i).from));
        }
        return Decoration.set(ranges);
      }
      update(u: ViewUpdate) {
        if (u.docChanged) this.decorations = this.build(u.view);
      }
    },
    { decorations: (v) => v.decorations },
  );

  /** The [[link]] under the pointer, if any, with its document range. */
  function linkAt(v: EditorView, e: MouseEvent) {
    const pos = v.posAtCoords({ x: e.clientX, y: e.clientY });
    if (pos == null) return undefined;
    const line = v.state.doc.lineAt(pos);
    const re = /\[\[([^\[\]\n]+)\]\]/g;
    let m: RegExpExecArray | null;
    while ((m = re.exec(line.text))) {
      const from = line.from + m.index;
      const to = from + m[0].length;
      if (pos >= from && pos <= to) return { from, to, link: parseLinkText(m[1] ?? '') };
    }
    return undefined;
  }

  let hoverKey = '';

  const linkEvents = EditorView.domEventHandlers({
    /** Ctrl/Cmd + click on a [[link]] opens that page. */
    mousedown(e, v) {
      if (!(e.ctrlKey || e.metaKey)) return false;
      const hit = linkAt(v, e);
      if (!hit) return false;
      void app.openTarget(hit.link.target, hit.link.heading);
      e.preventDefault();
      return true;
    },
    /** Hovering a [[link]] shows a preview of the page it points to. */
    mousemove(e, v) {
      const hit = linkAt(v, e);
      const key = hit ? `${hit.from}:${hit.to}` : '';
      if (key === hoverKey) return false;
      hoverKey = key;
      if (!hit) {
        app.hoverEnd();
        return false;
      }
      app.hoverStart(hit.link.target, hit.link.heading, () => {
        if (!view) return undefined;
        const a = view.coordsAtPos(hit.from);
        const b = view.coordsAtPos(hit.to);
        if (!a || !b) return undefined;
        return { left: a.left, top: Math.min(a.top, b.top), right: Math.max(a.right, b.right), bottom: Math.max(a.bottom, b.bottom) };
      });
      return false;
    },
    mouseleave() {
      if (hoverKey) {
        hoverKey = '';
        app.hoverEnd();
      }
      return false;
    },
    keydown() {
      if (app.hover) app.hoverClose();
      hoverKey = '';
      return false;
    },
  });

  const theme = EditorView.theme({
    '&': { height: '100%', backgroundColor: 'transparent', color: 'var(--ink)' },
    '&.cm-focused': { outline: 'none' },
    '.cm-scroller': { fontFamily: 'var(--font-text)', lineHeight: '1.72', overflow: 'auto' },
    '.cm-content': {
      maxWidth: '46rem',
      margin: '0 auto',
      padding: '2rem clamp(1rem, 4vw, 2.5rem) 8rem',
      fontSize: '1.0625rem',
      caretColor: 'var(--accent)',
    },
    '.cm-line': { padding: '0' },
    '.cm-cursor': { borderLeftColor: 'var(--accent)', borderLeftWidth: '2px' },
    '.cm-selectionBackground, &.cm-focused .cm-selectionBackground': { backgroundColor: 'var(--selection) !important' },
    '.cm-wikilink': { color: 'var(--accent)', textDecoration: 'underline', textDecorationColor: 'color-mix(in srgb, var(--accent) 45%, transparent)' },
    '.cm-spoiler': { backgroundColor: 'var(--accent-soft)', borderRadius: '3px' },
    '.cm-fm': { fontFamily: 'var(--font-mono)', fontSize: '0.86rem', color: 'var(--ink-soft)', lineHeight: '1.6' },
    '.cm-tooltip': {
      backgroundColor: 'var(--surface)',
      color: 'var(--ink)',
      border: '1px solid var(--line-strong)',
      borderRadius: '6px',
      boxShadow: 'var(--shadow)',
      fontFamily: 'var(--font-ui)',
    },
    '.cm-tooltip-autocomplete > ul > li[aria-selected]': { backgroundColor: 'var(--accent)', color: 'var(--accent-ink)' },
    '.cm-completionDetail': { marginLeft: '0.6em', opacity: '0.7', fontStyle: 'normal' },
  });

  /* ------------------------------------------------------------ lifecycle */

  function jumpToHeading(heading: string) {
    if (!view) return;
    const doc = view.state.doc;
    for (let i = 1; i <= doc.lines; i++) {
      const line = doc.line(i);
      const m = /^#{1,6}\s+(.*)$/.exec(line.text);
      if (m && headingSlug(m[1] ?? '') === headingSlug(heading)) {
        view.dispatch({ selection: { anchor: line.from }, effects: EditorView.scrollIntoView(line.from, { y: 'start', yMargin: 40 }) });
        return;
      }
    }
  }

  onMount(() => {
    const page = app.vault?.getPage(path);
    view = new EditorView({
      parent: host,
      state: EditorState.create({
        doc: page?.raw ?? '',
        extensions: [
          history(),
          drawSelection(),
          EditorView.lineWrapping,
          markdown(),
          keymap.of([...defaultKeymap, ...historyKeymap, indentWithTab]),
          autocompletion({ override: [wikiCompletion], icons: false }),
          matchPlugin,
          frontmatterPlugin,
          linkEvents,
          theme,
          EditorView.contentAttributes.of({ 'aria-label': path, spellcheck: 'true' }),
          EditorView.updateListener.of((u) => {
            if (!u.docChanged || applyingExternal) return;
            dirty = true;
            app.saveStatus = 'dirty';
            schedule();
          }),
        ],
      }),
    });

    const unregister = app.registerFlusher(save);
    if (app.pendingHeading) {
      jumpToHeading(app.pendingHeading);
      app.pendingHeading = null;
    }

    return () => {
      unregister();
      clearTimeout(saveTimer);
      // The caller flushes before navigating, so nothing unsaved is dropped here.
      view?.destroy();
      view = undefined;
    };
  });

  // Pick up changes made elsewhere (relations panel, other programs) unless the user has unsaved edits.
  $effect(() => {
    app.version;
    const page = app.vault?.getPage(path);
    if (!view || !page || dirty) return;
    const current = view.state.doc.toString();
    if (current === page.raw) return;
    applyingExternal = true;
    const sel = view.state.selection.main;
    view.dispatch({
      changes: { from: 0, to: current.length, insert: page.raw },
      selection: { anchor: Math.min(sel.anchor, page.raw.length) },
    });
    applyingExternal = false;
  });
</script>

<div class="editor-host" bind:this={host}></div>
