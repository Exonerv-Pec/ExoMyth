/**
 * Models for the "Cards" view: a card per page, folder collections, and the dossier of one page
 * (the page itself plus everything related to it, grouped by relation). Built on the relations
 * panel model, so cards appear in exactly the same, stable order as the panel.
 */
import type { PanelSectionId, VaultIndex } from './index';
import type { Page } from './types';
import { compareText } from './names';
import { mediaKind } from './media';
import { excerpt, pageFacts, type Fact } from './preview';

export interface CardModel {
  /** Path of the page, or undefined when the link points to a page that does not exist yet. */
  path?: string;
  /** Link target as written (used to create a missing page). */
  target: string;
  title: string;
  exists: boolean;
  /** Folder the page is in ('' for the root), and its top-level folder (for the colour). */
  folder: string;
  group: string;
  /** Image file to show on the card, as written in the page. */
  image?: string;
  /** One or two letters for pages without an image. */
  initials: string;
  facts: Fact[];
  tags: string[];
}

export interface DossierItem extends CardModel {
  key: string;
  /** How many times this page is linked (shown as ×n when more than one). */
  count: number;
  heading?: string;
}

export interface DossierGroup {
  /** Stable key, same as the relations panel's group key. */
  key: string;
  section: PanelSectionId;
  /** Relation type (or the section id for plain mentions and links). */
  type: string;
  /** Reverse label from the world settings, e.g. "members" for "member of". */
  inverseLabel?: string;
  items: DossierItem[];
}

export interface Dossier {
  page: CardModel & { aliases: string[]; excerpt: string; truncated: boolean; allFacts: Fact[] };
  groups: DossierGroup[];
}

const EMBED = /!\[\[([^\[\]\n|]+)(?:\|[^\]\n]*)?\]\]|!\[[^\]\n]*\]\(([^)\s]+)\)/g;

/** The picture for a page: its `image:` field, or else the first image embedded in its text. */
export function pageImage(page: Page): string | undefined {
  const field = page.frontmatter.image;
  const first = Array.isArray(field) ? field[0] : field;
  if (typeof first === 'string' && first.trim()) {
    const m = /^!?\[\[([^\]|]+)/.exec(first.trim());
    return (m ? m[1]! : first).trim();
  }
  for (const m of page.body.matchAll(EMBED)) {
    const target = (m[1] ?? m[2] ?? '').trim();
    if (target && !/^[a-z][a-z0-9+.-]*:/i.test(target) && mediaKind(target) === 'image') return target;
  }
  return undefined;
}

export function initialsOf(title: string): string {
  const words = title.split(/[\s\-_.]+/u).filter((w) => /\p{L}|\p{N}/u.test(w));
  const letters = words.length > 1 ? [words[0]!, words[words.length - 1]!] : words.slice(0, 1);
  return letters
    .map((w) => [...w].find((ch) => /\p{L}|\p{N}/u.test(ch)) ?? '')
    .join('')
    .toLocaleUpperCase();
}

function folderOf(path: string): string {
  const i = path.lastIndexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

function topFolderOf(path: string): string {
  const i = path.indexOf('/');
  return i === -1 ? '' : path.slice(0, i);
}

export function cardOf(page: Page, factCount = 2): CardModel {
  const card: CardModel = {
    path: page.path,
    target: page.name,
    title: page.title,
    exists: true,
    folder: folderOf(page.path),
    group: topFolderOf(page.path),
    initials: initialsOf(page.title),
    facts: pageFacts(page).slice(0, factCount),
    tags: page.tags,
  };
  const image = pageImage(page);
  if (image) card.image = image;
  return card;
}

function missingCard(target: string): CardModel {
  return { target, title: target, exists: false, folder: '', group: '', initials: initialsOf(target), facts: [], tags: [] };
}

/** Top-level folders with their page counts, alphabetically; pages in the root come last as ''. */
export function folderTabs(index: VaultIndex): { folder: string; count: number }[] {
  const counts = new Map<string, number>();
  for (const p of index.pages) counts.set(topFolderOf(p.path), (counts.get(topFolderOf(p.path)) ?? 0) + 1);
  return [...counts.entries()]
    .map(([folder, count]) => ({ folder, count }))
    .sort((a, b) => (a.folder === '' ? 1 : b.folder === '' ? -1 : compareText(a.folder, b.folder)));
}

/** Cards for every page under a top-level folder ('' = pages in the root), by title. */
export function folderCards(index: VaultIndex, folder: string): CardModel[] {
  return index.pages
    .filter((p) => topFolderOf(p.path) === folder)
    .map((p) => cardOf(p))
    .sort((a, b) => compareText(a.title, b.title) || compareText(a.path ?? '', b.path ?? ''));
}

/** The dossier of one page: a large card for it and a card for every related page, grouped like the panel. */
export function dossier(index: VaultIndex, path: string): Dossier | undefined {
  const page = index.get(path);
  if (!page) return undefined;
  const ex = excerpt(page.body, 480);
  const allFacts = pageFacts(page);
  const main = { ...cardOf(page, allFacts.length), aliases: page.aliases, excerpt: ex.markdown, truncated: ex.truncated, allFacts };

  const groups: DossierGroup[] = [];
  for (const section of index.panel(path).sections) {
    for (const g of section.groups) {
      const items: DossierItem[] = g.items.map((it) => {
        const target = it.path ? index.get(it.path) : undefined;
        const base = target ? cardOf(target) : missingCard(it.target);
        const item: DossierItem = { ...base, key: it.key, count: it.count };
        if (it.heading) item.heading = it.heading;
        return item;
      });
      const group: DossierGroup = { key: g.key, section: section.id, type: g.type, items };
      if (g.inverseLabel) group.inverseLabel = g.inverseLabel;
      groups.push(group);
    }
  }
  return { page: main, groups };
}
