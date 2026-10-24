/**
 * Comments and suggested changes written in the page text with the open CriticMarkup notation:
 *
 *   {==marked words==}{>>a comment on them<<}    a comment on a passage
 *   {>>a comment<<}                              a comment at one point
 *   {++added++}  {--removed--}  {~~old~>new~~}   suggested changes
 *
 * Keeping them in the text means a comment moves with its passage when the text is edited, copied
 * or opened in another program. Nothing here knows about the interface.
 */
import { editFrontmatter, maskCode, splitFrontmatter } from './parse';

export type MarkKind = 'comment' | 'insert' | 'delete' | 'replace';

/** One comment or suggestion, with its place in the full page text (header included). */
export interface CriticMark {
  kind: MarkKind;
  from: number;
  to: number;
  /** The marked passage of a comment; '' for a comment at one point. */
  text: string;
  /** The comment itself (comments only). */
  comment: string;
  /** Suggestions: the text before and after the change. */
  before: string;
  after: string;
}

/** Any character except the start of an empty line: marks stay inside one paragraph. */
const C = String.raw`(?:(?!\n[ \t]*\n)[\s\S])`;
const MARK_RE = new RegExp(
  [
    String.raw`\{==(${C}+?)==\}(?:\{>>(${C}*?)<<\})?`,
    String.raw`\{>>(${C}*?)<<\}`,
    String.raw`\{\+\+(${C}+?)\+\+\}`,
    String.raw`\{--(${C}+?)--\}`,
    String.raw`\{~~(${C}*?)~>(${C}*?)~~\}`,
  ].join('|'),
  'g',
);

/** Where the text after the YAML header starts. */
function bodyStart(text: string): number {
  const { frontmatterRaw, body } = splitFrontmatter(text);
  return frontmatterRaw === null ? 0 : text.length - body.length;
}

function markOf(m: RegExpExecArray, offset: number): CriticMark {
  const from = offset + m.index;
  const to = from + m[0].length;
  const base = { from, to, text: '', comment: '', before: '', after: '' };
  if (m[1] !== undefined) return { ...base, kind: 'comment', text: m[1], comment: (m[2] ?? '').trim() };
  if (m[3] !== undefined) return { ...base, kind: 'comment', comment: m[3].trim() };
  if (m[4] !== undefined) return { ...base, kind: 'insert', after: m[4] };
  if (m[5] !== undefined) return { ...base, kind: 'delete', before: m[5] };
  return { ...base, kind: 'replace', before: m[6] ?? '', after: m[7] ?? '' };
}

/**
 * Matches marks in `text` from `start`, skipping code. The search runs on a copy with code blanked
 * out; each hit is then read again from the real text, so a passage keeps its own characters.
 */
function scan(text: string, start: number): RegExpExecArray[] {
  const body = text.slice(start);
  const masked = maskCode(body);
  const out: RegExpExecArray[] = [];
  const re = new RegExp(MARK_RE.source, 'g');
  const real = new RegExp(MARK_RE.source, 'y');
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    real.lastIndex = m.index;
    const r = real.exec(body);
    out.push(r && r[0].length === m[0].length ? r : m);
  }
  return out;
}

/** Comments and suggestions in a page's text, in reading order. Marks in the header or in code are not counted. */
export function findMarks(text: string): CriticMark[] {
  const start = bodyStart(text);
  return scan(text, start).map((m) => markOf(m, start));
}

/** True when the text holds any comment or suggestion (quick check before the full search). */
export function hasMarks(text: string): boolean {
  return /\{(==|>>|\+\+|--|~~)/.test(text) && findMarks(text).length > 0;
}

/**
 * The text as a reader should see it: comments taken out, marked passages kept, and suggestions
 * left as they were before (only accepted changes become part of the text).
 * Used for word counts, previews, the book view and exports.
 */
export function cleanText(text: string): string {
  if (!/\{(==|>>|\+\+|--|~~)/.test(text)) return text;
  let out = '';
  let last = 0;
  for (const m of scan(text, 0)) {
    const mark = markOf(m, 0);
    out += text.slice(last, mark.from);
    if (mark.kind === 'comment' && !mark.text) out = trimPointComment(out, text, mark.to);
    else out += keptText(mark, 'reject');
    last = mark.to;
  }
  return out + text.slice(last);
}

/** A comment at one point leaves one space between the words around it, not two. */
function trimPointComment(before: string, text: string, to: number): string {
  const next = text[to] ?? '';
  return / $/.test(before) && (next === ' ' || next === '' || /[.,;:!?)\n]/.test(next)) ? before.slice(0, -1) : before;
}

/** What stays of a mark when it is settled. */
function keptText(mark: CriticMark, how: 'accept' | 'reject'): string {
  switch (mark.kind) {
    case 'comment':
      return mark.text;
    case 'insert':
      return how === 'accept' ? mark.after : '';
    case 'delete':
      return how === 'accept' ? '' : mark.before;
    case 'replace':
      return how === 'accept' ? mark.after : mark.before;
  }
}

/** Finds the mark again in `text` (it may have moved since it was listed). */
function locate(text: string, mark: Pick<CriticMark, 'from' | 'to'> & { raw?: string }, raw: string): CriticMark | undefined {
  const marks = findMarks(text);
  const exact = marks.find((m) => m.from === mark.from && m.to === mark.to && text.slice(m.from, m.to) === raw);
  if (exact) return exact;
  // Moved: the nearest mark with the same text.
  const same = marks.filter((m) => text.slice(m.from, m.to) === raw);
  same.sort((a, b) => Math.abs(a.from - mark.from) - Math.abs(b.from - mark.from));
  return same[0];
}

/** The written form of a mark, as it appears in the text. */
export function markSource(mark: CriticMark): string {
  switch (mark.kind) {
    case 'comment':
      return mark.text ? `{==${mark.text}==}{>>${mark.comment}<<}` : `{>>${mark.comment}<<}`;
    case 'insert':
      return `{++${mark.after}++}`;
    case 'delete':
      return `{--${mark.before}--}`;
    case 'replace':
      return `{~~${mark.before}~>${mark.after}~~}`;
  }
}

function settle(text: string, mark: CriticMark, raw: string, how: 'accept' | 'reject'): string {
  const m = locate(text, mark, raw);
  if (!m) return text;
  let before = text.slice(0, m.from);
  const kept = keptText(m, how);
  // Removing a whole mark between two words would leave two spaces.
  if (!kept && / $/.test(before) && /^[ .,;:!?)\n]|^$/.test(text.slice(m.to, m.to + 1))) before = before.slice(0, -1);
  return before + kept + text.slice(m.to);
}

/**
 * Settles a comment: the comment goes, the passage it was on stays as it is.
 * `raw` is the mark as written (`text.slice(from, to)` when it was listed), to find it if it moved.
 */
export function resolveComment(text: string, mark: CriticMark, raw: string): string {
  return settle(text, mark, raw, 'accept');
}

/** Makes a suggested change part of the text. */
export function acceptChange(text: string, mark: CriticMark, raw: string): string {
  return settle(text, mark, raw, 'accept');
}

/** Drops a suggested change and keeps the text as it was. */
export function rejectChange(text: string, mark: CriticMark, raw: string): string {
  return settle(text, mark, raw, 'reject');
}

/** Characters that would end a comment or a passage early, made harmless. */
function safeComment(comment: string): string {
  return comment
    .replace(/\r\n?/g, '\n')
    .replace(/\n[ \t]*\n+/g, '\n') // an empty line would end the paragraph, and the mark with it
    .replace(/<<\}/g, '<< }')
    .trim();
}

/**
 * Adds a comment on `text.slice(from, to)`, or at one point when the range is empty.
 * A passage that already holds marks, or spans paragraphs, gets a comment after it instead.
 */
export function addComment(text: string, from: number, to: number, comment: string): { text: string; at: number } {
  const c = safeComment(comment);
  if (!c) return { text, at: from };
  let a = Math.max(0, Math.min(from, to));
  let b = Math.min(text.length, Math.max(from, to));
  // Spaces at the ends of a selection are not part of the passage.
  while (a < b && /\s/.test(text[a]!)) a++;
  while (b > a && /\s/.test(text[b - 1]!)) b--;
  const passage = text.slice(a, b);
  const insideMark = findMarks(text).some((m) => a < m.to && b > m.from);
  if (insideMark) {
    // Never nest marks: put a point comment after the mark that holds the selection.
    const holder = findMarks(text).filter((m) => a < m.to && b > m.from).pop()!;
    const insert = `{>>${c}<<}`;
    return { text: text.slice(0, holder.to) + insert + text.slice(holder.to), at: holder.to };
  }
  if (!passage || /\n[ \t]*\n/.test(passage) || /==\}|\{==/.test(passage)) {
    const at = b;
    const insert = `{>>${c}<<}`;
    return { text: text.slice(0, at) + insert + text.slice(at), at };
  }
  const insert = `{==${passage}==}{>>${c}<<}`;
  return { text: text.slice(0, a) + insert + text.slice(b), at: a };
}

/** Changes the words of a comment, keeping its passage. */
export function editComment(text: string, mark: CriticMark, raw: string, comment: string): string {
  const m = locate(text, mark, raw);
  if (!m || m.kind !== 'comment') return text;
  const c = safeComment(comment);
  if (!c) return resolveComment(text, m, text.slice(m.from, m.to));
  return text.slice(0, m.from) + markSource({ ...m, comment: c }) + text.slice(m.to);
}

/** Settles every comment and suggestion at once: `accept` takes the changes, `reject` drops them. */
export function settleAll(text: string, how: 'accept' | 'reject', kinds: readonly MarkKind[] = ['comment', 'insert', 'delete', 'replace']): string {
  const marks = findMarks(text).filter((m) => kinds.includes(m.kind));
  let out = text;
  for (const m of marks.reverse()) out = settle(out, m, out.slice(m.from, m.to), m.kind === 'comment' ? 'accept' : how);
  return out;
}

/* ------------------------------------------------------------- revision notes */

/** A note on what to change in the next pass, kept in the page header under `revision:`. */
export interface RevisionNote {
  text: string;
  done: boolean;
}

const DONE_RE = /^\[([ xX✓])\]\s*/;

/** Notes are plain lines, `[x]` in front of the ones that are done: `- "[x] Check the flood year"`. */
export function revisionNotes(frontmatter: Record<string, unknown>): RevisionNote[] {
  const raw = frontmatter.revision;
  const list = Array.isArray(raw) ? raw : typeof raw === 'string' && raw.trim() ? [raw] : [];
  const out: RevisionNote[] = [];
  for (const item of list) {
    if (typeof item !== 'string' && typeof item !== 'number') continue;
    const s = String(item).trim();
    if (!s) continue;
    const m = DONE_RE.exec(s);
    out.push({ text: m ? s.slice(m[0].length).trim() : s, done: !!m && m[1] !== ' ' });
  }
  return out;
}

function noteLine(n: RevisionNote): string {
  const text = n.text.replace(/\s+/g, ' ').trim();
  return n.done ? `[x] ${text}` : text;
}

/** Rewrites the `revision:` list with `fn`; an empty list removes the key. */
function editNotes(text: string, fn: (notes: RevisionNote[]) => RevisionNote[]): string {
  const notes = fn(revisionNotes(splitFrontmatter(text).data));
  return editFrontmatter(text, (doc) => {
    const lines = notes.filter((n) => n.text.trim()).map(noteLine);
    if (lines.length) doc.set('revision', doc.createNode(lines));
    else doc.delete('revision');
  });
}

export function addNote(text: string, note: string): string {
  const clean = note.replace(/\s+/g, ' ').trim();
  if (!clean) return text;
  return editNotes(text, (notes) => [...notes, { text: clean, done: false }]);
}

export function setNoteDone(text: string, index: number, done: boolean): string {
  return editNotes(text, (notes) => notes.map((n, i) => (i === index ? { ...n, done } : n)));
}

export function changeNote(text: string, index: number, note: string): string {
  const clean = note.replace(/\s+/g, ' ').trim();
  return editNotes(text, (notes) => (clean ? notes.map((n, i) => (i === index ? { ...n, text: clean } : n)) : notes.filter((_, i) => i !== index)));
}

export function removeNote(text: string, index: number): string {
  return editNotes(text, (notes) => notes.filter((_, i) => i !== index));
}

/** Takes away the notes that are done. */
export function clearDoneNotes(text: string): string {
  return editNotes(text, (notes) => notes.filter((n) => !n.done));
}

/** Open work on a page: comments, suggestions and notes not yet done. */
export interface RevisionCount {
  comments: number;
  changes: number;
  notes: number;
}

export function revisionCount(page: { raw: string; frontmatter: Record<string, unknown> }): RevisionCount {
  const marks = /\{(==|>>|\+\+|--|~~)/.test(page.raw) ? findMarks(page.raw) : [];
  return {
    comments: marks.filter((m) => m.kind === 'comment').length,
    changes: marks.filter((m) => m.kind !== 'comment').length,
    notes: revisionNotes(page.frontmatter).filter((n) => !n.done).length,
  };
}
