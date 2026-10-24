import { Compartment, EditorState, type Extension, type Range, type Text } from '@codemirror/state';
import { Decoration, EditorView, ViewPlugin, type DecorationSet, type ViewUpdate } from '@codemirror/view';

/**
 * Typewriter scrolling for focus mode: the line being written stays in the middle of the screen,
 * and the paragraphs around the one being written are dimmed a little. It only changes how the
 * text is shown; the text itself is never touched.
 */

export const typewriterCompartment = new Compartment();

/** The paragraph around `pos`: its lines, up to the blank lines before and after. */
export function paragraphAround(doc: Text, pos: number): { from: number; to: number } {
  const line = doc.lineAt(pos);
  // On a blank line the "paragraph" is just that line, so a new paragraph starts with the old one dimmed.
  if (!line.text.trim()) return { from: line.from, to: line.to };
  let first = line.number;
  while (first > 1 && doc.line(first - 1).text.trim()) first--;
  let last = line.number;
  while (last < doc.lines && doc.line(last + 1).text.trim()) last++;
  return { from: doc.line(first).from, to: doc.line(last).to };
}

const dimmed = Decoration.line({ class: 'cm-tw-dim' });

/** Dims the visible lines outside the paragraph (or paragraphs, for a selection) being written. */
const dimOthers = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = this.build(view);
    }
    update(u: ViewUpdate) {
      if (u.docChanged || u.selectionSet || u.viewportChanged) this.decorations = this.build(u.view);
    }
    build(view: EditorView): DecorationSet {
      const { doc, selection } = view.state;
      const { from: a, to: b } = selection.main;
      const start = paragraphAround(doc, a).from;
      const end = paragraphAround(doc, b).to;
      const out: Range<Decoration>[] = [];
      let lastLine = -1;
      for (const { from, to } of view.visibleRanges) {
        let pos = from;
        while (pos <= to) {
          const line = doc.lineAt(pos);
          if (line.from > lastLine && (line.to < start || line.from > end)) out.push(dimmed.range(line.from));
          lastLine = Math.max(lastLine, line.from);
          pos = line.to + 1;
        }
      }
      return Decoration.set(out);
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

/** Typing and moving with the keyboard bring the cursor line back to the middle; a click does not. */
const keepCentered = EditorState.transactionExtender.of((tr) => {
  const moved = tr.selection !== undefined && tr.isUserEvent('select') && !tr.isUserEvent('select.pointer');
  if (!tr.docChanged && !moved) return null;
  return { effects: EditorView.scrollIntoView(tr.newSelection.main.head, { y: 'center' }) };
});

export function typewriter(): Extension {
  return [dimOthers, keepCentered];
}

/** Brings the cursor line to the middle of the screen now. */
export function centerCursor(view: EditorView): void {
  view.dispatch({ effects: EditorView.scrollIntoView(view.state.selection.main.head, { y: 'center' }) });
}
