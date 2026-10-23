import { parseDocument, Document, isMap, isSeq, isScalar, type YAMLMap } from 'yaml';
import type { Page, Relation, WikiLink } from './types';
import { baseName, normalizeName } from './names';

/* ---------------------------------------------------------------- frontmatter */

export interface SplitFile {
  /** Raw YAML text between the `---` fences, or null when the file has none. */
  frontmatterRaw: string | null;
  /** Everything after the closing fence. */
  body: string;
  /** Parsed YAML as a plain object (empty when missing or invalid). */
  data: Record<string, unknown>;
  error?: string;
}

const FM_RE = /^﻿?---[ \t]*\r?\n(?:([\s\S]*?)\r?\n)?---[ \t]*(?:\r?\n|$)/;

export function splitFrontmatter(text: string): SplitFile {
  const m = FM_RE.exec(text);
  if (!m) return { frontmatterRaw: null, body: text, data: {} };
  const raw = m[1] ?? '';
  const body = text.slice(m[0].length);
  const doc = parseDocument(raw);
  if (doc.errors.length > 0) {
    return { frontmatterRaw: raw, body, data: {}, error: doc.errors[0]?.message ?? 'Invalid YAML' };
  }
  const js: unknown = doc.toJS();
  const data = js && typeof js === 'object' && !Array.isArray(js) ? (js as Record<string, unknown>) : {};
  return { frontmatterRaw: raw, body, data };
}

/* ------------------------------------------------------------------ wiki links */

/** Replaces code spans/blocks with spaces (keeping offsets) so links inside them are ignored. */
export function maskCode(text: string): string {
  return text.replace(/```[\s\S]*?```|~~~[\s\S]*?~~~|`[^`\n]*`/g, (m) => m.replace(/[^\n]/g, ' '));
}

const LINK_SOURCE = String.raw`(!?)\[\[([^\[\]\n|#]+?)(?:#([^\[\]\n|]*))?(?:\|([^\[\]\n]*))?\]\]`;

export function parseLinkText(inner: string): WikiLink {
  let alias: string | undefined;
  let rest = inner;
  const pipe = rest.indexOf('|');
  if (pipe !== -1) {
    alias = rest.slice(pipe + 1).trim() || undefined;
    rest = rest.slice(0, pipe);
  }
  let heading: string | undefined;
  const hash = rest.indexOf('#');
  if (hash !== -1) {
    heading = rest.slice(hash + 1).trim() || undefined;
    rest = rest.slice(0, hash);
  }
  const link: WikiLink = { target: rest.trim() };
  if (heading) link.heading = heading;
  if (alias) link.alias = alias;
  return link;
}

/** Finds all `[[wiki links]]` in `text`, ignoring code and `![[embeds]]`. */
export function findWikiLinks(text: string): WikiLink[] {
  const out: WikiLink[] = [];
  const re = new RegExp(LINK_SOURCE, 'g');
  const masked = maskCode(text);
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    if (m[1] === '!') continue;
    const link: WikiLink = { target: (m[2] ?? '').trim() };
    if (m[3]?.trim()) link.heading = m[3].trim();
    if (m[4]?.trim()) link.alias = m[4].trim();
    if (link.target) out.push(link);
  }
  return out;
}

/**
 * Rewrites wiki links in `text`. `fn` receives each link and returns the replacement
 * `[[...]]` inner text, or undefined to leave the link untouched.
 */
export function mapWikiLinks(
  text: string,
  fn: (link: WikiLink) => string | undefined,
  options: { embeds?: boolean } = {},
): string {
  const re = new RegExp(LINK_SOURCE, 'g');
  const masked = maskCode(text);
  let out = '';
  let last = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(masked))) {
    if (m[1] === '!' && !options.embeds) continue;
    const link: WikiLink = { target: (m[2] ?? '').trim() };
    if (m[3]?.trim()) link.heading = m[3].trim();
    if (m[4]?.trim()) link.alias = m[4].trim();
    const replacement = fn(link);
    if (replacement === undefined) continue;
    out += text.slice(last, m.index) + `${m[1] ?? ''}[[${replacement}]]`;
    last = m.index + m[0].length;
  }
  return out + text.slice(last);
}

export function formatLink(link: WikiLink): string {
  return `[[${link.target}${link.heading ? '#' + link.heading : ''}${link.alias ? '|' + link.alias : ''}]]`;
}

/* ----------------------------------------------------------- frontmatter values */

/**
 * Collects link leaves from a `relations` value. Accepts `"[[A]]"`, `A`, lists of those,
 * and the nested lists YAML produces for an unquoted `[[A]]`.
 */
function linksFromValue(value: unknown): WikiLink[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(linksFromValue);
  if (typeof value === 'string' || typeof value === 'number') {
    const s = String(value).trim();
    if (!s) return [];
    if (s.includes('[[')) return findWikiLinks(s);
    const link = parseLinkText(s);
    return link.target ? [link] : [];
  }
  return [];
}

function deepStrings(value: unknown, out: string[] = []): string[] {
  if (typeof value === 'string') out.push(value);
  else if (Array.isArray(value)) value.forEach((v) => deepStrings(v, out));
  else if (value && typeof value === 'object') Object.values(value).forEach((v) => deepStrings(v, out));
  return out;
}

export function extractRelations(data: Record<string, unknown>): Relation[] {
  const rel = data.relations;
  if (!rel || typeof rel !== 'object' || Array.isArray(rel)) return [];
  const out: Relation[] = [];
  for (const [rawType, value] of Object.entries(rel)) {
    const type = rawType.trim();
    if (!type) continue;
    for (const link of linksFromValue(value)) out.push({ type, link });
  }
  return out;
}

function stringList(value: unknown): string[] {
  if (value == null) return [];
  if (Array.isArray(value)) return value.flatMap(stringList);
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }
  return [String(value)];
}

const INLINE_TAG = /(^|\s)#([\p{L}\p{N}_][\p{L}\p{N}_\-/]*)/gu;

function inlineTags(body: string): string[] {
  const out: string[] = [];
  const masked = maskCode(body);
  let m: RegExpExecArray | null;
  const re = new RegExp(INLINE_TAG.source, INLINE_TAG.flags);
  while ((m = re.exec(masked))) {
    const tag = m[2] ?? '';
    // "#123" is more likely an issue number or a heading anchor than a tag.
    if (tag && !/^\d+$/.test(tag)) out.push(tag);
  }
  return out;
}

/* ------------------------------------------------------------------- page build */

export function parsePage(path: string, text: string, mtime = 0): Page {
  const { data, body, error } = splitFrontmatter(text);
  const name = baseName(path);

  const title = typeof data.title === 'string' && data.title.trim() ? data.title.trim() : name;
  const aliases = stringList(data.aliases);
  const tags = [...new Set([...stringList(data.tags).map((t) => t.replace(/^#/, '')), ...inlineTags(body)])];
  const relations = extractRelations(data);

  const { relations: _relations, pinned: _pinned, ...otherFields } = data;
  void _relations;
  void _pinned;
  const mentions = [...findWikiLinks(body), ...deepStrings(otherFields).flatMap((s) => findWikiLinks(s))];

  const pinned = linksFromValue(data.pinned).map((l) => l.target);

  const page: Page = {
    path,
    name,
    title,
    aliases,
    tags,
    frontmatter: data,
    body,
    raw: text,
    relations,
    mentions,
    pinned,
    mtime,
  };
  if (error) page.parseError = error;
  return page;
}

/* ----------------------------------------------------- comment-preserving YAML edits */

/**
 * Applies `mutate` to the frontmatter of `text` while preserving comments and formatting
 * of untouched fields. Creates a frontmatter block when the file has none.
 */
export function editFrontmatter(text: string, mutate: (doc: Document) => void): string {
  const m = FM_RE.exec(text);
  const raw = m ? (m[1] ?? '') : '';
  const doc = parseDocument(raw);
  if (doc.errors.length > 0) throw new Error(doc.errors[0]?.message ?? 'Invalid frontmatter');
  if (!doc.contents) doc.contents = doc.createNode({}) as never;
  if (!isMap(doc.contents)) {
    throw new Error('The page header must be a list of "key: value" lines');
  }
  mutate(doc);
  // Keep the file's own line endings so Windows users do not get mixed endings.
  const eol = /\r\n/.test(m ? m[0] : text) ? '\r\n' : '\n';
  const yaml = doc.toString({ lineWidth: 0, flowCollectionPadding: false }).replace(/\n+$/, '').replace(/\r?\n/g, eol);
  const block = yaml ? `---${eol}${yaml}${eol}---${eol}` : '';
  const body = m ? text.slice(m[0].length) : text;
  return block + body;
}

function getMap(doc: Document, key: string, create: boolean): YAMLMap | undefined {
  const root = doc.contents;
  if (!isMap(root)) return undefined;
  let node = root.get(key, true);
  if (!isMap(node)) {
    if (!create) return undefined;
    doc.set(key, doc.createNode({}));
    node = root.get(key, true);
  }
  return isMap(node) ? node : undefined;
}

/** Sets (or removes, when `links` is empty) one relation type in the `relations` block. */
export function setRelationInText(text: string, type: string, links: WikiLink[]): string {
  return editFrontmatter(text, (doc) => {
    const rel = getMap(doc, 'relations', links.length > 0);
    if (!rel) return;
    if (links.length === 0) {
      rel.delete(type);
      if (rel.items.length === 0) doc.delete('relations');
      return;
    }
    const strings = links.map(formatLink);
    rel.set(type, doc.createNode(strings.length === 1 ? strings[0] : strings));
  });
}

export function addRelationToText(text: string, type: string, link: WikiLink): string {
  const split = splitFrontmatter(text);
  const existing = extractRelations(split.data)
    .filter((r) => r.type === type)
    .map((r) => r.link);
  const key = normalizeName(link.target) + '#' + (link.heading ?? '');
  if (existing.some((l) => normalizeName(l.target) + '#' + (l.heading ?? '') === key)) return text;
  return setRelationInText(text, type, [...existing, link]);
}

export function removeRelationFromText(text: string, type: string, target: string): string {
  const split = splitFrontmatter(text);
  const n = normalizeName(target);
  const remaining = extractRelations(split.data)
    .filter((r) => r.type === type && normalizeName(r.link.target) !== n)
    .map((r) => r.link);
  return setRelationInText(text, type, remaining);
}

export function setPinnedInText(text: string, targets: string[]): string {
  return editFrontmatter(text, (doc) => {
    if (targets.length === 0) doc.delete('pinned');
    else doc.set('pinned', doc.createNode(targets.map((t) => `[[${t}]]`)));
  });
}

/**
 * Renames plain (unbracketed) relation values such as `father: Arn` after a page rename.
 * Bracketed links are handled by `mapWikiLinks`.
 */
export function renamePlainRelations(text: string, matches: (target: string) => boolean, newName: string): string {
  const split = splitFrontmatter(text);
  if (split.frontmatterRaw === null || split.error) return text;
  let changed = false;
  const result = editFrontmatter(text, (doc) => {
    const rel = getMap(doc, 'relations', false);
    if (!rel) return;
    const visit = (node: unknown): void => {
      if (isScalar(node) && typeof node.value === 'string' && !node.value.includes('[[')) {
        const link = parseLinkText(node.value);
        if (link.target && matches(link.target)) {
          node.value = formatLink({ ...link, target: newName }).slice(2, -2);
          changed = true;
        }
      } else if (isSeq(node)) {
        node.items.forEach(visit);
      }
    };
    for (const pair of rel.items) visit(pair.value);
  });
  return changed ? result : text;
}
