import type { VaultIndex } from './index';
import type { Page } from './types';
import { headingSlug } from './slug';

/** Frontmatter keys that describe the page's structure rather than its subject. */
export const STRUCTURAL_KEYS = new Set(['title', 'aliases', 'tags', 'relations', 'pinned', 'image', 'map', 'pins', 'playlist', 'moodboard', 'board']);

export interface Fact {
  key: string;
  /** Markdown text of the value (may contain [[links]]). */
  value: string;
}

/** Simple facts from the header for an infobox: every non-structural field with a plain value. */
export function pageFacts(page: Page): Fact[] {
  const out: Fact[] = [];
  const plain = (v: unknown): string => {
    if (Array.isArray(v)) return v.map(plain).filter(Boolean).join(', ');
    if (v && typeof v === 'object') return '';
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    return v == null ? '' : String(v);
  };
  for (const [key, value] of Object.entries(page.frontmatter)) {
    if (STRUCTURAL_KEYS.has(key)) continue;
    const text = plain(value).trim();
    if (text) out.push({ key, value: text });
  }
  return out;
}

const HEADING = /^(#{1,6})[ \t]+(.+?)[ \t]*#*[ \t]*$/;

/** The text of one section: from the heading line to the next heading of the same or a higher level. */
export function sectionText(body: string, heading: string): string | undefined {
  const want = headingSlug(heading);
  const lines = body.split(/\r?\n/);
  let start = -1;
  let level = 0;
  let inFence = false;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    if (/^(```|~~~)/.test(line)) inFence = !inFence;
    if (inFence) continue;
    const m = HEADING.exec(line);
    if (!m) continue;
    if (start === -1) {
      if (headingSlug(m[2] ?? '') === want) {
        start = i + 1;
        level = m[1]!.length;
      }
    } else if (m[1]!.length <= level) {
      return lines.slice(start, i).join('\n');
    }
  }
  return start === -1 ? undefined : lines.slice(start).join('\n');
}

/**
 * The opening of a text for previews: whole paragraphs (and lists) until about `budget`
 * characters, skipping the page's own title heading. Never cuts a [[link]] or ||spoiler|| in half.
 */
export function excerpt(text: string, budget = 360): { markdown: string; truncated: boolean } {
  const blocks = text
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((b) => b.trim())
    .filter(Boolean);
  const out: string[] = [];
  let used = 0;
  let truncated = false;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i]!;
    if (out.length === 0 && /^#\s/.test(b) && !b.includes('\n')) continue; // the title heading
    if (/^(```|~~~)/.test(b) || /^\|.*\|$/m.test(b) || /^<\w/.test(b)) {
      // Code, tables and raw HTML do not shorten well; stop before them.
      truncated = true;
      break;
    }
    if (used > 0 && used + b.length > budget) {
      truncated = true;
      break;
    }
    if (used === 0 && b.length > budget * 1.6) {
      out.push(cutBlock(b, Math.round(budget * 1.4)));
      truncated = true;
      break;
    }
    out.push(b);
    used += b.length;
    if (i < blocks.length - 1 && used >= budget) {
      truncated = true;
      break;
    }
  }
  return { markdown: out.join('\n\n'), truncated };
}

/** Shortens one paragraph at a word boundary, never inside [[...]] or ||...||. */
function cutBlock(block: string, max: number): string {
  let cut = block.lastIndexOf(' ', max);
  if (cut < max * 0.5) cut = max;
  const head = block.slice(0, cut);
  const openLink = head.lastIndexOf('[[') > head.lastIndexOf(']]');
  const spoilers = (head.match(/\|\|/g) ?? []).length % 2 === 1;
  let safe = head;
  if (openLink) safe = safe.slice(0, safe.lastIndexOf('[['));
  if (spoilers) safe = safe.slice(0, safe.lastIndexOf('||'));
  return safe.trimEnd() + '…';
}

export interface PagePreview {
  exists: boolean;
  /** Link target as written. */
  target: string;
  path?: string;
  title: string;
  aliases: string[];
  tags: string[];
  folder: string;
  facts: Fact[];
  /** Markdown to render. */
  excerpt: string;
  truncated: boolean;
  /** Set when the preview shows one section of the page. */
  heading?: string;
  /** Typed relations declared on the page. */
  relations: number;
  /** Pages that link here, in any way. */
  backlinks: number;
}

/** Everything a hover card needs to describe the page a link points to. */
export function pagePreview(index: VaultIndex, target: string, heading?: string, facts = 4): PagePreview {
  const page = index.resolve(target);
  if (!page) {
    return {
      exists: false,
      target,
      title: target,
      aliases: [],
      tags: [],
      folder: '',
      facts: [],
      excerpt: '',
      truncated: false,
      relations: 0,
      backlinks: 0,
    };
  }
  const section = heading ? sectionText(page.body, heading) : undefined;
  const ex = excerpt(section ?? page.body);
  const preview: PagePreview = {
    exists: true,
    target,
    path: page.path,
    title: page.title,
    aliases: page.aliases,
    tags: page.tags,
    folder: page.path.includes('/') ? page.path.slice(0, page.path.lastIndexOf('/')) : '',
    facts: section ? [] : pageFacts(page).slice(0, facts),
    excerpt: ex.markdown,
    truncated: ex.truncated,
    relations: page.relations.length,
    backlinks: index.backlinkPaths(page.path).length,
  };
  if (section !== undefined && heading) preview.heading = heading;
  return preview;
}
