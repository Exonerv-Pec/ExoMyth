import type { Page } from './types';
import { compareText, normalizeName } from './names';

export interface SearchHit {
  page: Page;
  score: number;
  /** Short text excerpt around the first body match, if the body matched. */
  snippet?: string;
}

function snippetAround(body: string, needle: string): string | undefined {
  const i = body.toLowerCase().indexOf(needle);
  if (i === -1) return undefined;
  const start = Math.max(0, i - 40);
  const end = Math.min(body.length, i + needle.length + 80);
  return (start > 0 ? '…' : '') + body.slice(start, end).replace(/\s+/g, ' ').trim() + (end < body.length ? '…' : '');
}

/**
 * Small in-memory search: title and alias matches rank above tags, which rank above body text.
 * Every query term must match somewhere on the page.
 */
export function searchPages(pages: readonly Page[], query: string, limit = 50): SearchHit[] {
  const terms = normalizeName(query).split(' ').filter(Boolean);
  if (terms.length === 0) return [];
  const hits: SearchHit[] = [];

  for (const page of pages) {
    const title = normalizeName(page.title);
    const name = normalizeName(page.name);
    const aliases = page.aliases.map(normalizeName);
    const tags = page.tags.map(normalizeName);
    const body = page.body.toLowerCase();
    let score = 0;
    let ok = true;

    for (const term of terms) {
      let s = 0;
      if (title === term || name === term) s = 100;
      else if (title.startsWith(term) || name.startsWith(term)) s = 60;
      else if (aliases.some((a) => a === term)) s = 55;
      else if (title.includes(term) || name.includes(term) || aliases.some((a) => a.includes(term))) s = 40;
      else if (tags.some((t) => t === term || t.startsWith(term))) s = 25;
      else if (body.includes(term)) s = 5;
      if (s === 0) {
        ok = false;
        break;
      }
      score += s;
    }
    if (!ok) continue;

    const hit: SearchHit = { page, score };
    const snippet = snippetAround(page.body, terms[0] ?? '');
    if (snippet) hit.snippet = snippet;
    hits.push(hit);
  }

  hits.sort((a, b) => b.score - a.score || compareText(a.page.title, b.page.title) || compareText(a.page.path, b.page.path));
  return hits.slice(0, limit);
}
