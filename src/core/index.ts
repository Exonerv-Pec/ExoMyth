import type { Page, RelationTypeDef, VaultSettings, WikiLink } from './types';
import { DEFAULT_SETTINGS } from './types';
import { compareText, normalizeName, stripMd } from './names';
import { isTemplatePath } from './templates';

/* ------------------------------------------------------------------ panel model */

export interface PanelItem {
  /** Stable key: resolved path, or the normalised target for broken links. */
  key: string;
  /** Link target as written (used to create a missing page). */
  target: string;
  title: string;
  path?: string;
  exists: boolean;
  pinned: boolean;
  /** How many times this item is linked. */
  count: number;
  /** True when this page itself declares the relation (so it can be removed here). */
  own: boolean;
  heading?: string;
  alias?: string;
}

export interface PanelGroup {
  /** Stable key, e.g. `relations:father`. Safe to use for remembering collapsed state. */
  key: string;
  type: string;
  /** Label for the reverse direction when defined in settings. */
  inverseLabel?: string;
  items: PanelItem[];
}

export type PanelSectionId = 'relations' | 'inverse' | 'mentions' | 'links';

export interface PanelSection {
  id: PanelSectionId;
  groups: PanelGroup[];
}

export interface PanelModel {
  sections: PanelSection[];
}

interface Incoming {
  from: Page;
  type: string;
  link: WikiLink;
}

/**
 * Immutable snapshot of all pages with resolved links.
 *
 * The relations panel is a pure function of the page set: every ordering rule below is
 * deterministic and never depends on load order, edit time or window layout. Opening the
 * same page twice always shows the same groups in the same order.
 */
export class VaultIndex {
  /** Every page, templates included (for the file list and opening pages). */
  readonly pages: readonly Page[];
  /** The world itself: every page except templates. Graph, cards, timeline and counts use these. */
  readonly worldPages: readonly Page[];
  readonly settings: VaultSettings;

  private readonly byPath = new Map<string, Page>();
  private readonly byName = new Map<string, Page[]>();
  private readonly byAlias = new Map<string, Page[]>();
  private readonly incomingRelations = new Map<string, Incoming[]>();
  private readonly incomingMentions = new Map<string, Incoming[]>();
  private readonly typeOrder = new Map<string, number>();

  constructor(pages: Iterable<Page>, settings: VaultSettings = DEFAULT_SETTINGS) {
    this.settings = settings;
    this.pages = [...pages].sort((a, b) => compareText(a.path, b.path));
    // Templates are only patterns for new pages: links never lead to them and they link nowhere.
    this.worldPages = this.pages.filter((p) => !isTemplatePath(p.path));

    settings.relationTypes.forEach((def, i) => this.typeOrder.set(normalizeName(def.id), i));

    for (const p of this.pages) this.byPath.set(p.path, p);
    for (const p of this.worldPages) {
      push(this.byName, normalizeName(p.name), p);
      for (const a of p.aliases) push(this.byAlias, normalizeName(a), p);
    }
    const byShallowPath = (a: Page, b: Page) =>
      a.path.split('/').length - b.path.split('/').length || compareText(a.path, b.path);
    for (const list of this.byName.values()) list.sort(byShallowPath);
    for (const list of this.byAlias.values()) list.sort(byShallowPath);

    for (const p of this.worldPages) {
      for (const r of p.relations) {
        const target = this.resolve(r.link.target);
        if (target) push(this.incomingRelations, target.path, { from: p, type: r.type, link: r.link });
      }
      for (const link of p.mentions) {
        const target = this.resolve(link.target);
        if (target && target.path !== p.path) {
          push(this.incomingMentions, target.path, { from: p, type: '', link });
        }
      }
    }
  }

  get(path: string): Page | undefined {
    return this.byPath.get(path);
  }

  /** Resolves a link target (name, alias or partial path) to a page. Ambiguity resolves to the shallowest path. */
  resolve(target: string): Page | undefined {
    const n = normalizeName(stripMd(target));
    if (!n) return undefined;
    if (n.includes('/')) {
      const last = n.slice(n.lastIndexOf('/') + 1);
      const candidates = this.byName.get(last) ?? [];
      return candidates.find((p) => {
        const full = normalizeName(stripMd(p.path));
        return full === n || full.endsWith('/' + n);
      });
    }
    return this.byName.get(n)?.[0] ?? this.byAlias.get(n)?.[0];
  }

  /** Every page that links to `path`, in any way. */
  backlinkPaths(path: string): string[] {
    const set = new Set<string>();
    for (const i of this.incomingRelations.get(path) ?? []) set.add(i.from.path);
    for (const i of this.incomingMentions.get(path) ?? []) set.add(i.from.path);
    return [...set].sort(compareText);
  }

  /** All relation types in use, ordered as in the panel: configured types first, then alphabetical. */
  relationTypes(): string[] {
    const set = new Map<string, string>();
    for (const def of this.settings.relationTypes) set.set(normalizeName(def.id), def.id);
    for (const p of this.worldPages) {
      for (const r of p.relations) if (!set.has(normalizeName(r.type))) set.set(normalizeName(r.type), r.type);
    }
    return this.sortTypes([...set.values()]);
  }

  allTags(): { tag: string; count: number }[] {
    const counts = new Map<string, number>();
    for (const p of this.worldPages) for (const t of p.tags) counts.set(t, (counts.get(t) ?? 0) + 1);
    return [...counts.entries()]
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => compareText(a.tag, b.tag));
  }

  brokenLinks(): { page: Page; link: WikiLink }[] {
    const out: { page: Page; link: WikiLink }[] = [];
    for (const p of this.worldPages) {
      for (const r of p.relations) if (!this.resolve(r.link.target)) out.push({ page: p, link: r.link });
      for (const l of p.mentions) if (!this.resolve(l.target)) out.push({ page: p, link: l });
    }
    return out;
  }

  orphans(): Page[] {
    return this.worldPages.filter((p) => this.backlinkPaths(p.path).length === 0 && !hasOutgoing(this, p));
  }

  /* ------------------------------------------------------------- panel building */

  private typeDef(type: string): RelationTypeDef | undefined {
    const n = normalizeName(type);
    return this.settings.relationTypes.find((d) => normalizeName(d.id) === n);
  }

  private sortTypes(types: string[]): string[] {
    return [...types].sort((a, b) => {
      const ia = this.typeOrder.get(normalizeName(a));
      const ib = this.typeOrder.get(normalizeName(b));
      if (ia !== undefined && ib !== undefined) return ia - ib;
      if (ia !== undefined) return -1;
      if (ib !== undefined) return 1;
      return compareText(a, b);
    });
  }

  private makeItem(link: WikiLink, pinnedKeys: Set<string>, known?: Page): PanelItem {
    const count = 1;
    const target = known ?? this.resolve(link.target);
    const key = target ? target.path : 'missing:' + normalizeName(link.target);
    const item: PanelItem = {
      key,
      target: link.target,
      title: target ? target.title : link.target,
      exists: !!target,
      pinned: pinnedKeys.has(key),
      count,
      own: !known,
    };
    if (target) item.path = target.path;
    if (link.heading) item.heading = link.heading;
    if (link.alias) item.alias = link.alias;
    return item;
  }

  private sortItems(items: PanelItem[], pinOrder: string[]): PanelItem[] {
    const pinIndex = new Map(pinOrder.map((k, i) => [k, i]));
    return items.sort((a, b) => {
      const pa = pinIndex.get(a.key);
      const pb = pinIndex.get(b.key);
      if (pa !== undefined && pb !== undefined) return pa - pb;
      if (pa !== undefined) return -1;
      if (pb !== undefined) return 1;
      return compareText(a.title, b.title) || compareText(a.key, b.key);
    });
  }

  /** Builds the panel for `path`. The result depends only on the page set and settings. */
  panel(path: string): PanelModel {
    const page = this.byPath.get(path);
    if (!page) return { sections: [] };

    // Pins are resolved to keys so renaming a pinned page does not matter.
    const pinOrder: string[] = [];
    for (const t of page.pinned) {
      const r = this.resolve(t);
      pinOrder.push(r ? r.path : 'missing:' + normalizeName(t));
    }
    const pinnedKeys = new Set(pinOrder);

    /* Outgoing typed relations, plus the reverse side of symmetric types. */
    const outgoing = new Map<string, Map<string, PanelItem>>();
    const addOut = (type: string, link: WikiLink, known?: Page) => {
      const tn = normalizeName(type);
      const group = outgoing.get(tn) ?? new Map<string, PanelItem>();
      outgoing.set(tn, group);
      const item = this.makeItem(link, pinnedKeys, known);
      const existing = group.get(item.key);
      if (!existing) group.set(item.key, item);
      // The other side of a symmetric relation confirms it rather than repeating it.
      else if (known) return;
      else if (existing.own) existing.count += 1;
      else existing.own = true;
    };
    const typeNames = new Map<string, string>();
    for (const r of page.relations) {
      typeNames.set(normalizeName(r.type), r.type);
      addOut(r.type, r.link);
    }

    const inverse = new Map<string, Map<string, PanelItem>>();
    for (const inc of this.incomingRelations.get(path) ?? []) {
      const def = this.typeDef(inc.type);
      const from: WikiLink = { target: inc.from.name };
      if (def?.symmetric) {
        typeNames.set(normalizeName(inc.type), inc.type);
        addOut(inc.type, from, inc.from);
        continue;
      }
      const tn = normalizeName(inc.type);
      typeNames.set(tn, inc.type);
      const group = inverse.get(tn) ?? new Map<string, PanelItem>();
      inverse.set(tn, group);
      const item = this.makeItem(from, pinnedKeys, inc.from);
      const existing = group.get(item.key);
      if (existing) existing.count += 1;
      else group.set(item.key, item);
    }

    const toGroups = (section: PanelSectionId, src: Map<string, Map<string, PanelItem>>): PanelGroup[] =>
      this.sortTypes([...src.keys()].map((tn) => typeNames.get(tn) ?? tn)).map((type) => {
        const items = this.sortItems([...(src.get(normalizeName(type))?.values() ?? [])], pinOrder);
        const group: PanelGroup = { key: `${section}:${normalizeName(type)}`, type, items };
        const inv = this.typeDef(type)?.inverse;
        if (section === 'inverse' && inv) group.inverseLabel = inv;
        return group;
      });

    /* Plain mentions: who links here, and where this page links to. */
    const mentionIn = new Map<string, PanelItem>();
    for (const inc of this.incomingMentions.get(path) ?? []) {
      const item = this.makeItem({ target: inc.from.name }, pinnedKeys, inc.from);
      const existing = mentionIn.get(item.key);
      if (existing) existing.count += 1;
      else mentionIn.set(item.key, item);
    }
    // A page that already appears through a typed relation is not repeated among mentions.
    const typedKeys = new Set<string>();
    for (const g of [...outgoing.values(), ...inverse.values()]) for (const k of g.keys()) typedKeys.add(k);

    const mentionOut = new Map<string, PanelItem>();
    for (const link of page.mentions) {
      const item = this.makeItem(link, pinnedKeys);
      if (item.path === path) continue;
      const existing = mentionOut.get(item.key);
      if (existing) existing.count += 1;
      else mentionOut.set(item.key, item);
    }

    const single = (section: PanelSectionId, src: Map<string, PanelItem>): PanelGroup[] => {
      const items = this.sortItems(
        [...src.values()].filter((i) => !typedKeys.has(i.key)),
        pinOrder,
      );
      return items.length > 0 ? [{ key: section, type: section, items }] : [];
    };

    return {
      sections: [
        { id: 'relations', groups: toGroups('relations', outgoing) },
        { id: 'inverse', groups: toGroups('inverse', inverse) },
        { id: 'mentions', groups: single('mentions', mentionIn) },
        { id: 'links', groups: single('links', mentionOut) },
      ],
    };
  }
}

function hasOutgoing(index: VaultIndex, p: Page): boolean {
  return (
    p.relations.some((r) => index.resolve(r.link.target)) || p.mentions.some((l) => index.resolve(l.target))
  );
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V): void {
  const list = map.get(key);
  if (list) list.push(value);
  else map.set(key, [value]);
}
