/**
 * Comments and suggested changes written in the page text with the open CriticMarkup notation:
 *
 *   {==marked words==}{>>a comment on them<<}    a comment on a passage
 *   {>>a comment<<}                              a comment at one point
 *   {>>a comment<<}{>>a reply<<}{>>another<<}    comments right after a comment are replies to it
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
  /** Replies to the comment, in order: comments written right after it. */
  replies: string[];
  /** Suggestions: the text before and after the change. */
  before: string;
  after: string;
}

/** Any character except the start of an empty line: marks stay inside one paragraph. */
const C = String.raw`(?:(?!\n[ \t]*\n)[\s\S])`;
const MARK_RE = new RegExp(
  [
    String.raw`\{==(${C}+?)==\}((?:\{>>${C}*?<<\})*)`,
    String.raw`((?:\{>>${C}*?<<\})+)`,
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

/** The words of each `{>>…<<}` in a run of comments. */
function commentsIn(run: string): string[] {
  return [...run.matchAll(new RegExp(String.raw`\{>>(${C}*?)<<\}`, 'g'))].map((m) => (m[1] ?? '').trim());
}

function markOf(m: RegExpExecArray, offset: number): CriticMark {
  const from = offset + m.index;
  const to = from + m[0].length;
  const base = { from, to, text: '', comment: '', replies: [] as string[], before: '', after: '' };
  if (m[1] !== undefined) {
    const [comment = '', ...replies] = commentsIn(m[2] ?? '');
    return { ...base, kind: 'comment', text: m[1], comment, replies };
  }
  if (m[3] !== undefined) {
    const [comment = '', ...replies] = commentsIn(m[3]);
    return { ...base, kind: 'comment', comment, replies };
  }
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
    case 'comment': {
      const thread = [mark.comment, ...mark.replies].map((c) => `{>>${c}<<}`).join('');
      return mark.text ? `{==${mark.text}==}${mark.comment || mark.replies.length ? thread : ''}` : thread;
    }
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

/** Changes the words of a comment, keeping its passage and replies. An emptied comment is resolved with them. */
export function editComment(text: string, mark: CriticMark, raw: string, comment: string): string {
  const m = locate(text, mark, raw);
  if (!m || m.kind !== 'comment') return text;
  const c = safeComment(comment);
  if (!c) return resolveComment(text, m, text.slice(m.from, m.to));
  return text.slice(0, m.from) + markSource({ ...m, comment: c }) + text.slice(m.to);
}

/** Adds a reply at the end of a comment's thread. */
export function addReply(text: string, mark: CriticMark, raw: string, reply: string): string {
  const m = locate(text, mark, raw);
  const r = safeComment(reply);
  if (!m || m.kind !== 'comment' || !r) return text;
  // A marked passage without any comment yet: the reply becomes its comment.
  const next = m.comment ? { ...m, replies: [...m.replies, r] } : { ...m, comment: r };
  return text.slice(0, m.from) + markSource(next) + text.slice(m.to);
}

/** Changes one reply; an empty one is removed. */
export function editReply(text: string, mark: CriticMark, raw: string, index: number, reply: string): string {
  const m = locate(text, mark, raw);
  if (!m || m.kind !== 'comment' || index < 0 || index >= m.replies.length) return text;
  const r = safeComment(reply);
  const replies = r ? m.replies.map((x, i) => (i === index ? r : x)) : m.replies.filter((_, i) => i !== index);
  return text.slice(0, m.from) + markSource({ ...m, replies }) + text.slice(m.to);
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

/* ---------------------------------------------------------- suggesting changes */

/** One replacement of the text, and where the cursor goes after it. */
export interface SuggestedEdit {
  from: number;
  to: number;
  insert: string;
  cursor: number;
}

/** Marks in the paragraph(s) around `from`..`to`: marks never cross an empty line, so that is all that matters. */
function marksAround(text: string, from: number, to: number, start: number): CriticMark[] {
  const blank = /\n[ \t]*\n/g;
  let lo = start;
  let hi = text.length;
  for (let m; (m = blank.exec(text)); ) {
    const end = m.index + m[0].length;
    if (end <= from) lo = Math.max(lo, end);
    else if (m.index >= to) {
      hi = m.index;
      break;
    }
  }
  return scan(text.slice(0, hi), lo).map((m) => markOf(m, lo));
}

const contentOf = (m: CriticMark) => ({ from: m.from + 3, to: m.to - 3 });

/** Wraps removed text, keeping empty lines outside (a mark cannot hold one). */
function wrapRemoved(s: string): string {
  return s
    .split(/(\n[ \t]*\n)/)
    .map((part, i) => (i % 2 === 1 || !part ? part : `{--${part}--}`))
    .join('');
}

/**
 * Turns an edit typed while suggesting into marks: new text becomes `{++…++}` and removed text stays
 * as `{--…--}`. Text inside one's own suggested addition is edited directly, a removal next to
 * another one joins it, and the cursor moves the way it would have. Returns undefined when the edit
 * should go through as it is: in the header, a new paragraph, or typing inside a comment.
 *
 * `direction` is how text was removed: `backward` (Backspace), `forward` (Delete), or `none`.
 */
export function suggestEdit(text: string, from: number, to: number, insert: string, direction: 'backward' | 'forward' | 'none' = 'none'): SuggestedEdit | undefined {
  const start = bodyStart(text);
  if (from < start) return undefined;
  const marks = marksAround(text, from, to, start);
  const containing = (pos: number, strict = true) => marks.find((m) => (strict ? m.from < pos && pos < m.to : m.from <= pos && pos <= m.to));
  const inComment = (pos: number) =>
    marks.some((m) => {
      if (m.kind !== 'comment') return false;
      const passageEnd = m.text ? m.from + 3 + m.text.length + 3 : m.from;
      return pos > passageEnd && pos < m.to;
    });

  /* ---------------------------------------------------------- adding text */
  if (from === to) {
    if (!insert) return undefined;
    const own = marks.find((m) => m.kind === 'insert' && contentOf(m).from <= from && from <= contentOf(m).to);
    if (own) {
      // A line break inside one's own addition ends it first, so it never holds an empty line.
      if (insert.includes('\n')) return { from: own.to, to: own.to, insert, cursor: own.to + insert.length };
      return undefined;
    }
    if (insert.includes('\n') || inComment(from)) return undefined;
    // Right before or after one's own addition: continue it.
    const before = marks.find((m) => m.kind === 'insert' && m.to === from);
    if (before) return { from: before.to - 3, to: before.to - 3, insert, cursor: before.to - 3 + insert.length };
    const after = marks.find((m) => m.kind === 'insert' && m.from === from);
    if (after) return { from: after.from + 3, to: after.from + 3, insert, cursor: after.from + 3 + insert.length };
    // Inside a removal or a mark's own signs: the addition goes after it.
    const holder = containing(from);
    const at = holder && holder.kind !== 'comment' ? holder.to : from;
    const wrapped = `{++${insert}++}`;
    return { from: at, to: at, insert: wrapped, cursor: at + 3 + insert.length };
  }

  /* ------------------------------------------------------- removing text */
  // Inside one's own addition (Backspace in it, a completed [[link]]): an ordinary edit, unless it
  // empties the addition, which then goes as a whole.
  const ownRange = marks.find((m) => m.kind === 'insert' && contentOf(m).from <= from && to <= contentOf(m).to);
  if (ownRange && !/\n[ \t]*\n/.test(insert)) {
    const c = contentOf(ownRange);
    if (from === c.from && to === c.to && !insert) return { from: ownRange.from, to: ownRange.to, insert: '', cursor: ownRange.from };
    return undefined;
  }
  let a = from;
  let b = to;
  // One key press inside a mark's signs means the character next to the mark.
  if (b - a === 1 && direction !== 'none') {
    const m = containing(direction === 'backward' ? b : a, false);
    if (m && m.kind !== 'comment') {
      const c = contentOf(m);
      const inSigns = a < c.from || b > c.to;
      if (m.kind === 'insert' && inSigns) {
        // Into one's own addition: its last (or first) letter.
        if (direction === 'backward' && b > c.to) [a, b] = [c.to - 1, c.to];
        else if (direction === 'forward' && a < c.from) [a, b] = [c.from, c.from + 1];
      } else if (m.kind !== 'insert' && (inSigns || m.kind === 'delete' || m.kind === 'replace')) {
        // Past a removal: the letter before (or after) it.
        if (direction === 'backward') [a, b] = [m.from - 1, m.from];
        else [a, b] = [m.to, m.to + 1];
      }
      if (a < start || b > text.length || a >= b) return { from, to: from, insert: '', cursor: direction === 'backward' ? Math.max(start, m.from) : m.to };
      if (text.slice(a, b) === '\n' && m.kind !== 'insert') return { from, to: from, insert: '', cursor: direction === 'backward' ? m.from : m.to };
    }
  }

  if (insert && /\n[ \t]*\n/.test(insert)) return undefined;
  // The stretch to rewrite: the removed range, widened to whole marks it touches or borders.
  const touched = marksAround(text, a, b, start).filter((m) => m.from <= b && m.to >= a);
  let lo = a;
  let hi = b;
  for (const m of touched) {
    lo = Math.min(lo, m.from);
    hi = Math.max(hi, m.to);
  }
  let out = '';
  let pos = lo;
  for (const m of touched.sort((x, y) => x.from - y.from)) {
    const plain = text.slice(pos, m.from);
    out += wrapPart(plain, pos);
    if (m.kind === 'insert') {
      // Removing one's own new words removes them for good.
      const c = contentOf(m);
      const kept = text.slice(c.from, Math.max(c.from, Math.min(a, c.to))) + text.slice(Math.min(c.to, Math.max(b, c.from)), c.to);
      out += kept ? `{++${kept}++}` : '';
    } else out += text.slice(m.from, m.to);
    pos = m.to;
  }
  out += wrapPart(text.slice(pos, hi), pos);

  function wrapPart(part: string, at: number): string {
    // Only the part inside the removed range is marked; the rest stays as it was.
    const s = Math.max(0, a - at);
    const e = Math.max(s, Math.min(part.length, b - at));
    return part.slice(0, s) + (e > s ? wrapRemoved(part.slice(s, e)) : '') + part.slice(e);
  }

  // Removals side by side become one.
  out = out.replace(/--\}\{--/g, '');
  let cursor: number;
  if (insert) {
    // Typed over a selection: the new words follow what they replace.
    const endOfRemoved = out.lastIndexOf('--}');
    const at = endOfRemoved === -1 ? out.length : endOfRemoved + 3;
    out = out.slice(0, at) + `{++${insert}++}` + out.slice(at);
    cursor = lo + at + 3 + insert.length;
  } else if (direction === 'backward') {
    // Before the removal, so the next Backspace takes the letter in front of it.
    const first = out.indexOf('{--');
    const removedAt = text.slice(lo, a).length;
    cursor = lo + (first === -1 ? removedAt : Math.min(first, removedAt + 0));
  } else {
    const last = out.lastIndexOf('--}');
    cursor = lo + (last === -1 ? out.length : last + 3);
  }
  if (out === text.slice(lo, hi)) return { from, to: from, insert: '', cursor: direction === 'backward' ? a : b };
  return { from: lo, to: hi, insert: out, cursor };
}

/* ------------------------------------------------- commenting from the reading view */

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Finds a passage selected in the reading view in the page's text. Between words the text may hold
 * what the reading view does not show (emphasis signs, the target of a [[link|shown text]], line
 * breaks). `nth` picks among several places with the same words (0 = the first). A passage that
 * starts or ends inside a [[link]] is widened to the whole link, so the link stays intact.
 */
export function findPassage(text: string, selected: string, nth = 0): { from: number; to: number } | undefined {
  const words = selected.trim().split(/\s+/).filter(Boolean);
  if (!words.length) return undefined;
  const start = bodyStart(text);
  const between = String.raw`(?:[\s*_~\`]|\[\[(?:[^\]|\n]*\|)?|\]\])+`;
  const re = new RegExp(words.map(escapeRe).join(between), 'g');
  const body = text.slice(start);
  const hits: { from: number; to: number }[] = [];
  for (let m; (m = re.exec(body)); ) {
    hits.push({ from: start + m.index, to: start + m.index + m[0].length });
    if (m[0].length === 0) re.lastIndex++;
  }
  const hit = hits[Math.min(Math.max(0, nth), hits.length - 1)];
  if (!hit) return undefined;
  let { from, to } = hit;
  // Inside a [[link]]: take the whole link.
  for (const link of body.matchAll(/!?\[\[[^\]\n]+\]\]/g)) {
    const a = start + link.index!;
    const b = a + link[0].length;
    if ((from > a && from < b) || (to > a && to < b)) {
      from = Math.min(from, a);
      to = Math.max(to, b);
    }
  }
  return { from, to };
}

/** How many times `needle` occurs in `hay` (words compared with spaces made even). */
export function occurrences(hay: string, needle: string): number {
  const h = hay.replace(/\s+/g, ' ');
  const n = needle.trim().replace(/\s+/g, ' ');
  if (!n) return 0;
  let count = 0;
  for (let i = h.indexOf(n); i !== -1; i = h.indexOf(n, i + n.length)) count++;
  return count;
}
