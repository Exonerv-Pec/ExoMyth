/**
 * Shows images, video and audio right inside the text editor, under the line that embeds them
 * (`![[file]]`, `![alt](path)` or the `image:` field of the header). The text stays editable;
 * the media are drawn below it. Files come from the world's own storage.
 */
import { Compartment, StateEffect, StateField, type EditorState, type Extension, type Range } from '@codemirror/state';
import { Decoration, EditorView, WidgetType, type DecorationSet } from '@codemirror/view';
import { app } from './app.svelte';
import { isExternal, mediaKind, parseEmbedOptions, type MediaKind } from './core/media';
import { mediaUrl } from './embeds';

/** Dispatch to re-check files (for example after a file was added to the world). */
export const refreshMedia = StateEffect.define<null>();

class MediaWidget extends WidgetType {
  constructor(
    readonly target: string,
    readonly kind: MediaKind,
    /** Identifies the file version, so the widget redraws only when the file changes. */
    readonly stamp: string,
    readonly width?: number,
    readonly height?: number,
  ) {
    super();
  }

  override eq(other: MediaWidget): boolean {
    return (
      other.target === this.target &&
      other.kind === this.kind &&
      other.stamp === this.stamp &&
      other.width === this.width &&
      other.height === this.height
    );
  }

  override get estimatedHeight(): number {
    return this.kind === 'audio' ? 64 : 220;
  }

  override toDOM(): HTMLElement {
    const wrap = document.createElement('div');
    wrap.className = `cm-media cm-media-${this.kind}`;
    if (this.stamp === 'missing') {
      wrap.classList.add('missing');
      wrap.textContent = app.t('media.missing', this.target);
      return wrap;
    }
    void mediaUrl(this.target).then((url) => {
      if (!url) {
        wrap.classList.add('missing');
        wrap.textContent = app.t('media.missing', this.target);
        return;
      }
      let el: HTMLImageElement | HTMLVideoElement | HTMLAudioElement;
      if (this.kind === 'video') {
        el = document.createElement('video');
        el.controls = true;
        el.preload = 'metadata';
      } else if (this.kind === 'audio') {
        el = document.createElement('audio');
        el.controls = true;
        el.preload = 'metadata';
      } else {
        const img = document.createElement('img');
        img.alt = this.target;
        img.decoding = 'async';
        el = img;
      }
      el.src = url;
      if (this.width) el.style.width = `${this.width}px`;
      if (this.height) el.style.height = `${this.height}px`;
      wrap.replaceChildren(el);
    });
    return wrap;
  }

  /** Let the media controls (play, seek, volume) receive their own clicks. */
  override ignoreEvent(): boolean {
    return true;
  }
}

const EMBED = /!\[\[([^\[\]\n]+?)\]\]|!\[[^\]\n]*\]\(([^)\s]+)\)/g;

function widgetFor(rawTarget: string, extra?: string): MediaWidget | undefined {
  let target = rawTarget.trim();
  try {
    target = decodeURI(target);
  } catch {
    /* keep as written */
  }
  target = target.replace(/^\.\//, '');
  const kind = mediaKind(target);
  if (!kind || isExternal(target)) return undefined;
  const file = app.vault?.resolveFile(target);
  const opts = parseEmbedOptions(extra);
  return new MediaWidget(target, kind, file ? `${file.path}:${file.mtime}` : 'missing', opts.width, opts.height);
}

function build(state: EditorState): DecorationSet {
  const doc = state.doc;
  const ranges: Range<Decoration>[] = [];
  let inFence = false;
  let inHeader = doc.lines > 1 && doc.line(1).text.trim() === '---';
  for (let i = 1; i <= doc.lines; i++) {
    const line = doc.line(i);
    const text = line.text;
    if (inHeader) {
      if (i > 1 && text.trim() === '---') {
        inHeader = false;
        continue;
      }
      // The picture of the page, from its `image:` field.
      const m = /^image:\s*["']?(?:!?\[\[)?([^"'\]|]+)(?:\|([^\]"']*))?/.exec(text);
      const w = m ? widgetFor(m[1]!, m[2]) : undefined;
      if (w) ranges.push(Decoration.widget({ widget: w, block: true, side: 1 }).range(line.to));
      continue;
    }
    if (/^\s*(```|~~~)/.test(text)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    const plain = text.replace(/`[^`]*`/g, (s) => ' '.repeat(s.length)); // ignore inline code
    for (const m of plain.matchAll(EMBED)) {
      let w: MediaWidget | undefined;
      if (m[1] !== undefined) {
        const pipe = m[1].indexOf('|');
        w = widgetFor(pipe === -1 ? m[1] : m[1].slice(0, pipe), pipe === -1 ? undefined : m[1].slice(pipe + 1));
      } else if (m[2] !== undefined) {
        w = widgetFor(m[2]);
      }
      if (w) ranges.push(Decoration.widget({ widget: w, block: true, side: 1 }).range(line.to));
    }
  }
  return Decoration.set(ranges, true);
}

const mediaField = StateField.define<DecorationSet>({
  create: build,
  update(deco, tr) {
    if (tr.docChanged || tr.effects.some((e) => e.is(refreshMedia))) return build(tr.state);
    return deco;
  },
  provide: (f) => EditorView.decorations.from(f),
});

/** The media shown in an editor state, top to bottom (for tests and tooling). */
export function mediaInState(state: EditorState): { target: string; kind: MediaKind; found: boolean; width?: number }[] {
  const out: { target: string; kind: MediaKind; found: boolean; width?: number }[] = [];
  const set = state.field(mediaField, false);
  if (!set) return out;
  const cursor = set.iter();
  while (cursor.value) {
    const w = cursor.value.spec.widget as MediaWidget;
    const item: { target: string; kind: MediaKind; found: boolean; width?: number } = { target: w.target, kind: w.kind, found: w.stamp !== 'missing' };
    if (w.width) item.width = w.width;
    out.push(item);
    cursor.next();
  }
  return out;
}

/** Turns the inline media on or off (they are off when the reading pane already shows them). */
export const mediaCompartment = new Compartment();

export function inlineMedia(enabled: boolean): Extension {
  return enabled ? mediaField : [];
}
