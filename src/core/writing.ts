/** Small helpers for writers: counting words and catching ideas in an inbox page. */
import { cleanText } from './critic';

/** Markdown syntax that is not part of the text a reader sees. */
function readableText(markdown: string): string {
  return cleanText(markdown)
    .replace(/^(```|~~~).*$/gm, ' ')
    .replace(/!\[\[[^\]\n]*\]\]/g, ' ') // embedded files
    .replace(/!\[[^\]\n]*\]\([^)\n]*\)/g, ' ') // images
    .replace(/\[\[[^\]|\n]*\|([^\]\n]+)\]\]/g, '$1') // [[Page|shown text]]
    .replace(/\[\[([^\]#|\n]*)(?:#[^\]\n]*)?\]\]/g, '$1') // [[Page]], [[Page#Heading]]
    .replace(/\[([^\]\n]*)\]\([^)\n]*\)/g, '$1') // [text](url)
    .replace(/<[^>\n]+>/g, ' ')
    .replace(/\b[a-z][a-z0-9+.-]*:\/\/\S+/gi, ' ');
}

type Segmenter = { segment(text: string): Iterable<{ isWordLike?: boolean }> };
let segmenter: Segmenter | null | undefined;

function wordSegmenter(): Segmenter | null {
  if (segmenter === undefined) {
    const Ctor = (Intl as unknown as { Segmenter?: new (locale?: string, opts?: { granularity: 'word' }) => Segmenter }).Segmenter;
    segmenter = Ctor ? new Ctor(undefined, { granularity: 'word' }) : null;
  }
  return segmenter;
}

/** Words in a page's text (without its header), in any language. Numbers count as words. */
export function wordCount(markdown: string): number {
  const text = readableText(markdown);
  const seg = wordSegmenter();
  if (seg) {
    let n = 0;
    for (const s of seg.segment(text)) if (s.isWordLike) n++;
    return n;
  }
  return text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
}

/** "2026-10-23 21:40" in local time. */
export function stamp(date: Date): string {
  const p = (n: number) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${p(date.getMonth() + 1)}-${p(date.getDate())} ${p(date.getHours())}:${p(date.getMinutes())}`;
}

/**
 * Adds an idea to the end of an inbox page as a dated list item. Lines after the first are indented
 * so the whole idea stays one item. Everything already on the page is kept as it was.
 */
export function appendIdea(pageText: string, idea: string, when: Date): string {
  const lines = idea.trim().replace(/\r\n?/g, '\n').split('\n');
  const item = [`- **${stamp(when)}** — ${lines[0]}`, ...lines.slice(1).map((l) => (l.trim() ? `  ${l}` : ''))].join('\n');
  const eol = /\r\n/.test(pageText) ? '\r\n' : '\n';
  const base = pageText.replace(/\r\n?/g, '\n').replace(/\s+$/, '');
  // Right after another list item the new one joins the same list; otherwise it starts a new one.
  const last = base.slice(base.lastIndexOf('\n') + 1);
  const sep = /^(\s*[-*+] |\s{2,}\S)/.test(last) ? '\n' : '\n\n';
  const text = base ? `${base}${sep}${item}\n` : `${item}\n`;
  return eol === '\n' ? text : text.replace(/\n/g, eol);
}
