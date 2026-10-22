/** A wiki link such as `[[Page#Heading|alias]]`. */
export interface WikiLink {
  /** Target page name or path as written (without heading or alias). */
  target: string;
  heading?: string;
  alias?: string;
}

/** A typed relation declared in the `relations:` block of a page's frontmatter. */
export interface Relation {
  type: string;
  link: WikiLink;
}

export interface Page {
  /** Path relative to the vault root, always with forward slashes, e.g. `Characters/Arn.md`. */
  path: string;
  /** File name without extension. */
  name: string;
  /** `title` from frontmatter, falling back to the file name. */
  title: string;
  aliases: string[];
  tags: string[];
  frontmatter: Record<string, unknown>;
  /** Markdown body without the frontmatter block. */
  body: string;
  /** The complete file text as stored on disk (frontmatter + body). */
  raw: string;
  /** Typed relations from `relations:` in the frontmatter. */
  relations: Relation[];
  /** Untyped links found in the body and in other frontmatter fields. */
  mentions: WikiLink[];
  /** Link targets pinned to the top of the relations panel (from `pinned:`). */
  pinned: string[];
  /** Set when the frontmatter block could not be parsed. */
  parseError?: string;
  mtime: number;
}

export interface FileEntry {
  path: string;
  mtime: number;
  size: number;
}

export interface RelationTypeDef {
  id: string;
  /** Label shown for the reverse direction, e.g. `отец` -> `ребёнок`. */
  inverse?: string;
  /** Symmetric relations (e.g. allies) are shown in one group for both sides. */
  symmetric?: boolean;
}

export interface VaultSettings {
  /** Defines the order of relation groups in the panel and their reverse labels. */
  relationTypes: RelationTypeDef[];
}

export const DEFAULT_SETTINGS: VaultSettings = { relationTypes: [] };
