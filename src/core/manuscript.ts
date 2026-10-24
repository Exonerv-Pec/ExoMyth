/**
 * Books: the story itself, written scene by scene. A book is an ordinary page with
 * `manuscript: true` in its header. Its text is the table of contents: `##` headings are chapters,
 * and list items with a link are the scenes, in reading order:
 *
 *   ---
 *   manuscript: true
 *   ---
 *   # The Silver Thread
 *
 *   ## Chapter 1: The River
 *   - [[Arrival at Rivertown]]
 *   - [[The Market]]
 *
 * Scenes are ordinary pages. Their header can say how far along they are (`status: draft`), whose
 * eyes we see through (`pov:`), a one-line `summary:`, and a year for the timeline. Anything else in
 * the book page (notes, other headings) is kept exactly as written by every edit.
 */
import type { VaultIndex } from './index';
import type { Page } from './types';
import { parseLinkText } from './parse';
import { compareText } from './names';
import { excerpt } from './preview';
import { wordCount } from './writing';
import { cleanText } from './critic';

export interface BookScene {
  /** Link target as written. */
  target: string;
  /** The page, when it exists. */
  path?: string;
  /** Line of the list item in the book page's text (0-based). */
  line: number;
}

export interface BookChapter {
  /** Heading text; '' for scenes that come before the first chapter heading. */
  title: string;
  /** Line of the `##` heading, or -1 for the scenes before the first heading. */
  line: number;
  scenes: BookScene[];
}

export interface Book {
  path: string;
  title: string;
  chapters: BookChapter[];
}

/** Whether a page is a book (its header says `manuscript: true`, or `yes`, or `книга`). */
export function isBook(page: Pick<Page, 'frontmatter'>): boolean {
  const v = page.frontmatter.manuscript;
  return v === true || (typeof v === 'string' && /^(true|yes|да|book|книга)$/i.test(v.trim()));
}

const HEADER = /^﻿?---[ \t]*\r?\n(?:[\s\S]*?\r?\n)?---[ \t]*(?:\r?\n|$)/;
const CHAPTER = /^##[ \t]+(.+?)[ \t]*#*[ \t]*$/;
const SCENE = /^[ \t]*(?:[-*+]|\d+[.)])[ \t]+.*?\[\[([^\]\n]+)\]\]/;
const FENCE = /^[ \t]*(```|~~~)/;

function lines(text: string): string[] {
  return text.split(/\r?\n/);
}

/** First line after the page header. */
function bodyStart(text: string): number {
  const m = HEADER.exec(text);
  return m ? lines(m[0].replace(/\r?\n$/, '')).length : 0;
}

/** The chapters and scenes of a book's text. Links are resolved when an index is given. */
export function parseBookText(text: string, index?: VaultIndex): BookChapter[] {
  const ls = lines(text);
  const chapters: BookChapter[] = [];
  let current: BookChapter | undefined;
  let fence = false;
  for (let i = bodyStart(text); i < ls.length; i++) {
    const l = ls[i]!;
    if (FENCE.test(l)) fence = !fence;
    if (fence) continue;
    const ch = CHAPTER.exec(l);
    if (ch) {
      current = { title: ch[1]!.trim(), line: i, scenes: [] };
      chapters.push(current);
      continue;
    }
    const sc = SCENE.exec(l);
    if (!sc) continue;
    const target = parseLinkText(sc[1]!).target;
    if (!target) continue;
    if (!current) {
      current = { title: '', line: -1, scenes: [] };
      chapters.push(current);
    }
    const scene: BookScene = { target, line: i };
    const page = index?.resolve(target);
    if (page) scene.path = page.path;
    current.scenes.push(scene);
  }
  return chapters;
}

/** A book's title: its first `#` heading, or else the page's title. */
export function parseBook(page: Page, index?: VaultIndex): Book {
  const h1 = /^#[ \t]+(.+?)[ \t]*#*[ \t]*$/m.exec(page.body);
  return { path: page.path, title: h1 ? h1[1]!.trim() : page.title, chapters: parseBookText(page.raw, index) };
}

/** Every book of the world, by title. */
export function worldBooks(index: VaultIndex): Book[] {
  return index.worldPages
    .filter(isBook)
    .map((p) => parseBook(p, index))
    .sort((a, b) => compareText(a.title, b.title) || compareText(a.path, b.path));
}

export interface ScenePlace {
  book: Book;
  chapter: number;
  /** Position among all scenes of the book (0-based) and how many there are. */
  position: number;
  total: number;
  prev?: BookScene;
  next?: BookScene;
}

/** Where a page stands in a book (the first book that has it). */
export function scenePlace(books: readonly Book[], path: string): ScenePlace | undefined {
  for (const book of books) {
    const all = book.chapters.flatMap((c, ci) => c.scenes.map((s) => ({ s, ci })));
    const i = all.findIndex((x) => x.s.path === path);
    if (i === -1) continue;
    const place: ScenePlace = { book, chapter: all[i]!.ci, position: i, total: all.length };
    if (i > 0) place.prev = all[i - 1]!.s;
    if (i + 1 < all.length) place.next = all[i + 1]!.s;
    return place;
  }
  return undefined;
}

/* ----------------------------------------------------------------- scenes */

export type SceneStatus = 'idea' | 'draft' | 'revised' | 'done';

const STATUS_WORDS: Record<SceneStatus, string[]> = {
  idea: ['idea', 'planned', 'plan', 'outline', 'идея', 'план', 'задумка'],
  draft: ['draft', 'drafting', 'writing', 'черновик', 'пишется', 'в работе'],
  revised: ['revised', 'revision', 'revising', 'edit', 'editing', 'правка', 'правки', 'редактура', 'отредактировано'],
  done: ['done', 'final', 'finished', 'complete', 'готово', 'готова', 'готов', 'финал'],
};

export const STATUSES: readonly SceneStatus[] = ['idea', 'draft', 'revised', 'done'];

export function statusOf(value: unknown): SceneStatus | undefined {
  if (typeof value !== 'string') return undefined;
  const v = value.trim().toLocaleLowerCase();
  return STATUSES.find((s) => STATUS_WORDS[s].includes(v));
}

export interface SceneInfo {
  status?: SceneStatus;
  /** The status as written, when it is not one of the known words. */
  statusText?: string;
  pov?: string;
  summary: string;
  words: number;
  year?: string;
}

function plain(value: unknown): string | undefined {
  if (typeof value === 'number') return String(value);
  if (typeof value !== 'string' || !value.trim()) return undefined;
  return value.trim().replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a: string, b?: string) => b ?? a);
}

/** The text of a scene without its header and without a first heading that repeats its title. */
export function sceneText(page: Page): string {
  const m = /^\s*#[ \t]+(.+?)[ \t]*#*[ \t]*(\r?\n|$)/.exec(page.body);
  // Comments are notes for the writer: the book view and exports show the text without them.
  return cleanText(m && m[1]!.trim().toLocaleLowerCase() === page.title.trim().toLocaleLowerCase() ? page.body.slice(m[0].length) : page.body).trim();
}

export function sceneInfo(page: Page): SceneInfo {
  const fm = page.frontmatter;
  const info: SceneInfo = { summary: '', words: wordCount(page.body) };
  const status = statusOf(fm.status);
  if (status) info.status = status;
  else if (plain(fm.status)) info.statusText = plain(fm.status)!;
  const povRel = page.relations.find((r) => /^(pov|point of view|рассказчик|глазами)$/i.test(r.type.trim()));
  const pov = povRel ? (povRel.link.alias ?? povRel.link.target) : plain(fm.pov ?? fm['point of view']);
  if (pov) info.pov = pov;
  const summary = plain(fm.summary ?? fm.synopsis ?? fm['кратко']);
  info.summary = summary ?? excerpt(sceneText(page), 160).markdown.replace(/\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g, (_, a: string, b?: string) => b ?? a);
  const year = plain(fm.year ?? fm.date);
  if (year) info.year = year;
  return info;
}

/* ------------------------------------------------------------------ edits */

function eolOf(text: string): string {
  return /\r\n/.test(text) ? '\r\n' : '\n';
}

/** Where a new scene line goes at position `at` of chapter `c` (after removal of any moving line). */
function insertionLine(text: string, chapters: BookChapter[], c: number, at: number): number {
  const ch = chapters[c]!;
  if (at < ch.scenes.length) return ch.scenes[at]!.line;
  if (ch.scenes.length) return ch.scenes[ch.scenes.length - 1]!.line + 1;
  // An empty chapter: right under its heading (after a blank line if there is one).
  const ls = lines(text);
  let i = ch.line + 1;
  if (i < ls.length && !ls[i]!.trim()) i++;
  return i;
}

function splice(text: string, at: number, insert: string[], remove = 0): string {
  const eol = eolOf(text);
  const ls = lines(text);
  ls.splice(at, remove, ...insert);
  return ls.join(eol);
}

/** Moves the scene `s` of chapter `c` to position `toAt` of chapter `toC` (positions counted without it). */
export function moveSceneInText(text: string, from: { c: number; s: number }, to: { c: number; s: number }): string {
  const chapters = parseBookText(text);
  const scene = chapters[from.c]?.scenes[from.s];
  if (!scene || !chapters[to.c]) return text;
  const line = lines(text)[scene.line]!;
  const without = splice(text, scene.line, [], 1);
  const after = parseBookText(without);
  // Removing the only scene before the first heading removes that implicit chapter.
  const shift = after.length < chapters.length && to.c > from.c ? -1 : 0;
  const target = to.c + shift;
  if (!after[target]) return text;
  const at = Math.min(to.s, after[target]!.scenes.length);
  const insertAt = insertionLine(without, after, target, at);
  const needsBlank = after[target]!.scenes.length === 0 && at === 0 && lines(without)[insertAt - 1]?.trim() !== '' && insertAt === after[target]!.line + 1;
  return splice(without, insertAt, needsBlank ? ['', line] : [line]);
}

/** Adds a scene link at the end of chapter `c`. */
export function addSceneToText(text: string, c: number, target: string): string {
  const chapters = parseBookText(text);
  const ch = chapters[c];
  const line = `- [[${target}]]`;
  if (!ch) return addChapterToText(text, '', [line]);
  const at = insertionLine(text, chapters, c, ch.scenes.length);
  const needsBlank = ch.scenes.length === 0 && at === ch.line + 1;
  return splice(text, at, needsBlank ? ['', line] : [line]);
}

/** Adds a chapter at the end of the book (with scene lines in it, if given). */
export function addChapterToText(text: string, title: string, sceneLines: string[] = []): string {
  const eol = eolOf(text);
  const base = text.replace(/\s+$/, '');
  const heading = title.trim() ? [`## ${title.trim()}`, ''] : [];
  const block = [...heading, ...sceneLines].join(eol);
  return `${base}${eol}${eol}${block}${eol}`;
}

export function renameChapterInText(text: string, c: number, title: string): string {
  const ch = parseBookText(text)[c];
  if (!ch || ch.line < 0 || !title.trim()) return text;
  return splice(text, ch.line, [`## ${title.trim()}`], 1);
}

/** Takes a scene out of the book (the scene page itself stays). */
export function removeSceneFromText(text: string, c: number, s: number): string {
  const scene = parseBookText(text)[c]?.scenes[s];
  return scene ? splice(text, scene.line, [], 1) : text;
}

/** Moves chapter `from` to position `to` (the scenes before the first heading stay where they are). */
export function moveChapterInText(text: string, from: number, to: number): string {
  const chapters = parseBookText(text);
  const headed = chapters.filter((c) => c.line >= 0);
  const offset = chapters.length - headed.length;
  const f = from - offset;
  const t = to - offset;
  if (f < 0 || t < 0 || f >= headed.length || t >= headed.length || f === t) return text;
  const ls = lines(text);
  const starts = headed.map((c) => c.line);
  const blocks = starts.map((s, i) => {
    const block = ls.slice(s, i + 1 < starts.length ? starts[i + 1] : ls.length);
    while (block.length && !block[block.length - 1]!.trim()) block.pop();
    return block;
  });
  const [moving] = blocks.splice(f, 1);
  blocks.splice(t, 0, moving!);
  const head = ls.slice(0, starts[0]);
  while (head.length && !head[head.length - 1]!.trim()) head.pop();
  const eol = eolOf(text);
  return [...head, '', ...blocks.flatMap((b, i) => (i ? ['', ...b] : b))].join(eol) + eol;
}

/* ---------------------------------------------------------------- export */

/** The whole book as one Markdown text: chapters as headings, scenes' text in order, links as plain words. */
export function bookMarkdown(book: Book, index: VaultIndex, opts: { sceneTitles?: boolean } = {}): string {
  const out: string[] = [`# ${book.title}`, ''];
  for (const ch of book.chapters) {
    if (ch.title) out.push(`## ${ch.title}`, '');
    for (const s of ch.scenes) {
      const page = s.path ? index.get(s.path) : undefined;
      if (opts.sceneTitles) out.push(`### ${page?.title ?? s.target}`, '');
      if (!page) continue;
      const text = sceneText(page)
        .replace(/!\[\[[^\]\n]*\]\]/g, '')
        .replace(/\[\[([^\]|#\n]+)(?:#[^\]|\n]*)?(?:\|([^\]\n]+))?\]\]/g, (_, a: string, b?: string) => b ?? a)
        .replace(/\|\|([^|\n]+)\|\|/g, '$1')
        .trim();
      if (text) out.push(text, '');
    }
  }
  return out.join('\n').replace(/\n{3,}/g, '\n\n').trim() + '\n';
}
