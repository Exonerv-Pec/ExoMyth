/**
 * Family trees, read from ordinary relations. A relation counts as family when its type says so:
 * `father`, `mother`, `parent` (the linked page is a parent), `son`, `daughter`, `children` (a child),
 * `spouse`, `wife`, `husband` (a spouse), `brother`, `sister`, `sibling`, and the same words in
 * Russian. The world settings can mark any other type (`"family": "parent"`), or keep one out
 * (`"family": "none"`).
 *
 * The tree around one person shows up to three generations of ancestors, their siblings (full and
 * half), their spouses, and two generations of descendants. Everything is ordered by birth year and
 * name, so the same world always draws the same tree.
 */
import type { VaultIndex } from './index';
import type { Page, VaultSettings } from './types';
import { compareText, normalizeName } from './names';
import { pageYears } from './years';

export type Kin = 'parent' | 'child' | 'spouse' | 'sibling';

const WORDS: Record<Kin, string[]> = {
  parent: ['father', 'mother', 'parent', 'parents', 'dad', 'mom', 'mum', 'отец', 'мать', 'родитель', 'родители', 'папа', 'мама'],
  child: ['child', 'children', 'son', 'sons', 'daughter', 'daughters', 'сын', 'сыновья', 'дочь', 'дочери', 'ребёнок', 'ребенок', 'дети'],
  spouse: ['spouse', 'wife', 'husband', 'consort', 'partner', 'супруг', 'супруга', 'жена', 'муж'],
  sibling: ['sibling', 'siblings', 'brother', 'sister', 'brothers', 'sisters', 'брат', 'сестра', 'братья', 'сёстры', 'сестры'],
};

/** What a relation type means in a family, if anything. */
export function kinOf(type: string, settings?: VaultSettings): Kin | undefined {
  const n = normalizeName(type);
  const def = settings?.relationTypes.find((d) => normalizeName(d.id) === n);
  if (def?.family) return def.family === 'none' ? undefined : def.family;
  return (Object.keys(WORDS) as Kin[]).find((k) => WORDS[k].includes(n));
}

export interface Kinship {
  parents: Map<string, Set<string>>;
  children: Map<string, Set<string>>;
  spouses: Map<string, Set<string>>;
  siblings: Map<string, Set<string>>;
}

function add(map: Map<string, Set<string>>, a: string, b: string): void {
  (map.get(a) ?? map.set(a, new Set()).get(a)!).add(b);
}

/** Who is whose parent, child, spouse and sibling, from the relations of every page of the world. */
export function kinship(index: VaultIndex): Kinship {
  const k: Kinship = { parents: new Map(), children: new Map(), spouses: new Map(), siblings: new Map() };
  for (const page of index.worldPages) {
    for (const r of page.relations) {
      const kin = kinOf(r.type, index.settings);
      if (!kin) continue;
      const other = index.resolve(r.link.target);
      if (!other || other.path === page.path) continue;
      const [me, them] = [page.path, other.path];
      if (kin === 'parent') {
        add(k.parents, me, them);
        add(k.children, them, me);
      } else if (kin === 'child') {
        add(k.parents, them, me);
        add(k.children, me, them);
      } else if (kin === 'spouse') {
        add(k.spouses, me, them);
        add(k.spouses, them, me);
      } else {
        add(k.siblings, me, them);
        add(k.siblings, them, me);
      }
    }
  }
  return k;
}

/** Whether a page has any family relation at all. */
export function hasFamily(k: Kinship, path: string): boolean {
  return [k.parents, k.children, k.spouses, k.siblings].some((m) => (m.get(path)?.size ?? 0) > 0);
}

export interface FamilyRow {
  /** Generation relative to the person: -1 parents, 0 the person's own, 1 children. */
  gen: number;
  /** Groups shown side by side: a person with their spouse(s), or a pair of parents. */
  units: string[][];
}

export interface FamilyTree {
  focus: string;
  rows: FamilyRow[];
  /** A line from each child to their parents who are on the tree. */
  links: { child: string; parents: string[] }[];
  /** Married couples next to each other (drawn joined). */
  couples: [string, string][];
}

/**
 * The tree around `focus`. `up` and `down` limit the generations shown above and below.
 * Returns undefined when the page has no family relations.
 */
export function familyTree(index: VaultIndex, focus: string, k: Kinship = kinship(index), up = 3, down = 2): FamilyTree | undefined {
  if (!index.get(focus) || !hasFamily(k, focus)) return undefined;
  const set = (m: Map<string, Set<string>>, p: string) => [...(m.get(p) ?? [])];
  const born = (p: string) => {
    const page = index.get(p);
    return (page && pageYears(page as Page)?.from) ?? Number.POSITIVE_INFINITY;
  };
  const byAge = (a: string, b: string) => born(a) - born(b) || compareText(index.get(a)?.title ?? a, index.get(b)?.title ?? b);
  const shown = new Set<string>();
  const rows = new Map<number, string[][]>();
  const put = (gen: number, unit: string[]) => {
    const fresh = unit.filter((p) => !shown.has(p));
    if (!fresh.length) return;
    fresh.forEach((p) => shown.add(p));
    const row = rows.get(gen) ?? rows.set(gen, []).get(gen)!;
    // Parents already on this row (from an older sibling) get the other parent beside them.
    const host = row.find((u) => unit.some((p) => u.includes(p)));
    if (host) host.push(...fresh);
    else row.push(fresh);
  };
  /** A person and their spouses, the person first. */
  const withSpouses = (p: string) => [p, ...set(k.spouses, p).sort(byAge)];
  /** Parents in a stable order, with a married pair kept together. */
  const parentUnit = (child: string) => set(k.parents, child).sort(byAge);

  // The person's own generation: brothers and sisters (by either parent, or named directly) in
  // order of birth, the person among them with their spouses.
  const siblings = new Set<string>(set(k.siblings, focus));
  for (const parent of set(k.parents, focus)) for (const c of set(k.children, parent)) if (c !== focus) siblings.add(c);
  const generation = [focus, ...siblings].sort(byAge);
  for (const p of generation) put(0, p === focus ? withSpouses(p) : [p]);

  // Ancestors, generation by generation, in the order of the people below them.
  for (let gen = -1; gen >= -up; gen--) {
    for (const unit of rows.get(gen + 1) ?? []) for (const p of unit) put(gen, parentUnit(p));
    if (!rows.get(gen)) break;
  }

  // Descendants of the person (and of their spouses together with them).
  let parents = [focus];
  for (let gen = 1; gen <= down; gen++) {
    const kids = new Set<string>();
    for (const p of parents) for (const c of set(k.children, p)) kids.add(c);
    const ordered = [...kids].sort(byAge);
    for (const c of ordered) put(gen, gen < down ? withSpouses(c) : [c]);
    parents = ordered;
    if (!ordered.length) break;
  }

  const links: FamilyTree['links'] = [];
  for (const p of shown) {
    const ps = set(k.parents, p).filter((x) => shown.has(x));
    if (ps.length) links.push({ child: p, parents: ps.sort(byAge) });
  }
  links.sort((a, b) => compareText(a.child, b.child));

  const ordered = [...rows.entries()].sort(([a], [b]) => a - b);
  const couples: [string, string][] = [];
  for (const [, units] of ordered) {
    for (const unit of units) {
      for (let i = 0; i + 1 < unit.length; i++) if (k.spouses.get(unit[i]!)?.has(unit[i + 1]!)) couples.push([unit[i]!, unit[i + 1]!]);
    }
  }

  return {
    focus,
    rows: ordered.map(([gen, units]) => ({ gen, units })),
    links,
    couples,
  };
}
