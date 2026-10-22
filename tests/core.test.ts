import { describe, expect, it } from 'vitest';
import {
  addRelationToText,
  findWikiLinks,
  mapWikiLinks,
  parsePage,
  removeRelationFromText,
  splitFrontmatter,
} from '../src/core/parse';
import { VaultIndex } from '../src/core/index';
import { MemoryStorage } from '../src/core/storage';
import { Vault } from '../src/core/vault';
import type { Page, VaultSettings } from '../src/core/types';

const page = (path: string, text: string) => parsePage(path, text, 1);

describe('frontmatter', () => {
  it('splits and parses YAML, tolerating CRLF and BOM', () => {
    const r = splitFrontmatter('﻿---\r\ntitle: Arn\r\ntags: [hero]\r\n---\r\nBody');
    expect(r.data.title).toBe('Arn');
    expect(r.body).toBe('Body');
  });
  it('handles an empty frontmatter block and a missing one', () => {
    expect(splitFrontmatter('---\n---\nx').body).toBe('x');
    expect(splitFrontmatter('no fm').frontmatterRaw).toBeNull();
  });
  it('reports broken YAML without throwing', () => {
    const p = page('A.md', '---\ntitle: [unclosed\n---\nBody');
    expect(p.parseError).toBeTruthy();
    expect(p.body).toBe('Body');
  });
});

describe('wiki links', () => {
  it('parses target, heading and alias', () => {
    expect(findWikiLinks('[[A]] [[B#H]] [[C|see]] [[D#H|x]]')).toEqual([
      { target: 'A' },
      { target: 'B', heading: 'H' },
      { target: 'C', alias: 'see' },
      { target: 'D', heading: 'H', alias: 'x' },
    ]);
  });
  it('ignores code, embeds', () => {
    const text = 'a `[[inline]]`\n```\n[[fenced]]\n```\n![[img.png]] [[real]]';
    expect(findWikiLinks(text)).toEqual([{ target: 'real' }]);
  });
  it('rewrites only requested links and keeps the rest byte-for-byte', () => {
    const out = mapWikiLinks('x [[Old]] `[[Old]]` [[Old#H|al]] [[Other]]', (l) =>
      l.target === 'Old' ? `New${l.heading ? '#' + l.heading : ''}${l.alias ? '|' + l.alias : ''}` : undefined,
    );
    expect(out).toBe('x [[New]] `[[Old]]` [[New#H|al]] [[Other]]');
  });
});

describe('page parsing', () => {
  it('reads typed relations in every YAML shape, including unquoted [[links]]', () => {
    const p = page(
      'Kira.md',
      [
        '---',
        'relations:',
        '  father: "[[Arn]]"',
        '  allies: ["[[Bo]]", "[[Cy|Cyrus]]"]',
        '  mentor: Dax',
        '  rival: [[Eve]]',
        '---',
        'Text with [[Mention]].',
      ].join('\n'),
    );
    const flat = p.relations.map((r) => `${r.type}:${r.link.target}${r.link.alias ? '|' + r.link.alias : ''}`);
    expect(flat).toEqual(['father:Arn', 'allies:Bo', 'allies:Cy|Cyrus', 'mentor:Dax', 'rival:Eve']);
    expect(p.mentions.map((m) => m.target)).toEqual(['Mention']);
  });
  it('collects tags from frontmatter and body, aliases from string or list', () => {
    const p = page('A.md', '---\ntags: [a, b]\naliases: Al, Bee\n---\n#c and #123 and # heading');
    expect(p.tags.sort()).toEqual(['a', 'b', 'c']);
    expect(p.aliases).toEqual(['Al', 'Bee']);
  });
  it('treats links in other frontmatter fields as mentions', () => {
    const p = page('A.md', '---\nlocation: "[[Rivertown]]"\n---\n');
    expect(p.mentions.map((m) => m.target)).toEqual(['Rivertown']);
  });
});

describe('relation editing preserves the rest of the file', () => {
  const src = '---\n# keep this comment\ntitle: Kira\ntags: [hero]\n---\n# Kira\n\nBody [[Arn]].\n';
  it('adds, dedupes and removes relations', () => {
    const a = addRelationToText(src, 'father', { target: 'Arn' });
    expect(a).toContain('# keep this comment');
    expect(a).toContain('Body [[Arn]].');
    expect(page('Kira.md', a).relations).toEqual([{ type: 'father', link: { target: 'Arn' } }]);
    expect(addRelationToText(a, 'father', { target: 'arn' })).toBe(a);
    const b = addRelationToText(a, 'father', { target: 'Bo' });
    expect(page('Kira.md', b).relations.map((r) => r.link.target)).toEqual(['Arn', 'Bo']);
    const c = removeRelationFromText(b, 'father', 'Arn');
    expect(page('Kira.md', c).relations.map((r) => r.link.target)).toEqual(['Bo']);
    const d = removeRelationFromText(c, 'father', 'Bo');
    expect(d).not.toContain('relations');
    expect(d).toContain('# keep this comment');
  });
  it('creates frontmatter when the file has none', () => {
    const out = addRelationToText('Just text\n', 'ally', { target: 'Bo' });
    expect(out.startsWith('---\n')).toBe(true);
    expect(out.endsWith('Just text\n')).toBe(true);
  });
});

const SETTINGS: VaultSettings = {
  relationTypes: [
    { id: 'father', inverse: 'child' },
    { id: 'ally', symmetric: true },
  ],
};

function world(): Page[] {
  return [
    page('People/Kira.md', '---\nrelations:\n  father: "[[Arn]]"\n  ally: ["[[Zed]]", "[[Bo]]"]\n  rival: "[[Eve]]"\n---\nLives in [[Rivertown]], met [[Ghost]].'),
    page('People/Arn.md', '---\naliases: [The Old King]\n---\nRuler of [[Rivertown]].'),
    page('People/Bo.md', '---\nrelations:\n  ally: "[[Kira]]"\n---\n'),
    page('People/Zed.md', 'Hello [[Kira]] [[Kira]]'),
    page('People/Eve.md', '---\nrelations:\n  father: "[[Arn]]"\n---\n'),
    page('People/Mira.md', 'x [[Kira]] y [[Kira]]'),
    page('Places/Rivertown.md', 'A town.'),
  ];
}

describe('relations panel', () => {
  it('groups, orders and resolves deterministically', () => {
    const idx = new VaultIndex(world(), SETTINGS);
    const kira = idx.panel('People/Kira.md');
    const rel = kira.sections.find((s) => s.id === 'relations')!;
    // Configured types first (father, ally), unknown after (rival).
    expect(rel.groups.map((g) => g.type)).toEqual(['father', 'ally', 'rival']);
    // Items sorted alphabetically; symmetric ally merges Bo's reverse declaration.
    expect(rel.groups[1]!.items.map((i) => i.title)).toEqual(['Bo', 'Zed']);
    const arn = idx.panel('People/Arn.md');
    const inv = arn.sections.find((s) => s.id === 'inverse')!;
    expect(inv.groups.map((g) => [g.type, g.inverseLabel])).toEqual([['father', 'child']]);
    expect(inv.groups[0]!.items.map((i) => i.title)).toEqual(['Eve', 'Kira']);
  });

  it('is identical no matter in which order pages were loaded', () => {
    const base = world();
    const expected = JSON.stringify(new VaultIndex(base, SETTINGS).panel('People/Kira.md'));
    for (let i = 0; i < 20; i++) {
      const shuffled = [...base].sort(() => Math.random() - 0.5);
      expect(JSON.stringify(new VaultIndex(shuffled, SETTINGS).panel('People/Kira.md'))).toBe(expected);
    }
  });

  it('marks broken links and counts repeated mentions', () => {
    const idx = new VaultIndex(world(), SETTINGS);
    const links = idx.panel('People/Kira.md').sections.find((s) => s.id === 'links')!;
    const ghost = links.groups[0]!.items.find((i) => i.title === 'Ghost')!;
    expect(ghost.exists).toBe(false);
    const mentions = idx.panel('People/Kira.md').sections.find((s) => s.id === 'mentions')!;
    expect(mentions.groups[0]!.items.find((i) => i.title === 'Mira')?.count).toBe(2);
  });

  it('does not repeat a typed relation among plain mentions', () => {
    const idx = new VaultIndex(world(), SETTINGS);
    const mentions = idx.panel('People/Kira.md').sections.find((s) => s.id === 'mentions')!;
    expect(mentions.groups.flatMap((g) => g.items.map((i) => i.title))).not.toContain('Bo');
  });

  it('resolves aliases and pins items to the top of their group', () => {
    const pages = world();
    pages[0] = page(
      'People/Kira.md',
      '---\nrelations:\n  ally: ["[[Zed]]", "[[Bo]]"]\n  father: "[[The Old King]]"\npinned: ["[[Zed]]"]\n---\n',
    );
    const idx = new VaultIndex(pages, SETTINGS);
    const rel = idx.panel('People/Kira.md').sections[0]!;
    expect(rel.groups.find((g) => g.type === 'father')!.items[0]!.path).toBe('People/Arn.md');
    expect(rel.groups.find((g) => g.type === 'ally')!.items.map((i) => i.title)).toEqual(['Zed', 'Bo']);
  });

  it('ambiguous names resolve to the shallowest path', () => {
    const idx = new VaultIndex(
      [page('Deep/Er/Same.md', ''), page('Same.md', ''), page('Other/Same.md', '')],
      SETTINGS,
    );
    expect(idx.resolve('same')?.path).toBe('Same.md');
    expect(idx.resolve('Other/Same')?.path).toBe('Other/Same.md');
  });
});

describe('vault operations', () => {
  it('renames a page and rewrites links, including relations and plain values', async () => {
    const storage = new MemoryStorage('t', {
      'Kira.md': '---\nrelations:\n  father: "[[Arn]]"\n  mentor: Arn\n  ally: ["[[Arn|the king]]"]\n---\nSee [[Arn#Life]] and `[[Arn]]` and [[The Old King]].',
      'Arn.md': '---\naliases: [The Old King]\n---\nself [[Arn]]',
    });
    const vault = await Vault.open(storage);
    const newPath = await vault.renamePage('Arn.md', 'Arnulf');
    expect(newPath).toBe('Arnulf.md');
    expect(await storage.exists('Arn.md')).toBe(false);
    const kira = await storage.readText('Kira.md');
    expect(kira).toContain('"[[Arnulf]]"');
    expect(kira).toContain('mentor: Arnulf');
    expect(kira).toContain('[[Arnulf|the king]]');
    expect(kira).toContain('[[Arnulf#Life]]');
    expect(kira).toContain('`[[Arn]]`'); // untouched inside code
    expect(kira).toContain('[[The Old King]]'); // alias links stay valid
    expect(await storage.readText('Arnulf.md')).toContain('self [[Arnulf]]');
    expect(vault.index.resolve('Arnulf')?.path).toBe('Arnulf.md');
    expect(vault.index.brokenLinks()).toEqual([]);
  });

  it('refuses to overwrite an existing page when renaming', async () => {
    const vault = await Vault.open(new MemoryStorage('t', { 'A.md': '', 'B.md': '' }));
    await expect(vault.renamePage('A.md', 'b')).rejects.toThrow(/already exists/);
  });

  it('creates unique pages and moves deleted pages to .trash', async () => {
    const storage = new MemoryStorage('t', { 'Arn.md': 'x' });
    const vault = await Vault.open(storage);
    const p = await vault.createPage('Arn');
    expect(p.path).toBe('Arn 2.md');
    await vault.trashPage('Arn.md');
    expect(await storage.exists('.trash/Arn.md')).toBe(true);
    expect(vault.pages.map((x) => x.path)).toEqual(['Arn 2.md']);
  });

  it('adds relations through the vault and picks up external edits on refresh', async () => {
    const storage = new MemoryStorage('t', { 'A.md': 'hi', 'B.md': 'there' });
    const vault = await Vault.open(storage);
    await vault.addRelation('A.md', 'ally', { target: 'B' });
    expect(vault.getPage('A.md')!.relations).toHaveLength(1);
    await storage.writeText('B.md', 'changed [[A]]');
    await vault.refresh();
    expect(vault.index.backlinkPaths('A.md')).toEqual(['B.md']);
    await vault.togglePin('A.md', 'B');
    expect(vault.getPage('A.md')!.pinned).toEqual(['B']);
    await vault.togglePin('A.md', 'B');
    expect(vault.getPage('A.md')!.pinned).toEqual([]);
  });
});
