/**
 * Regression tests for issues found in the v0.1 code review.
 * Each test names the problem it guards against.
 */
import { describe, expect, it } from 'vitest';
import { addRelationToText, mapWikiLinks, parsePage } from '../src/core/parse';
import { VaultIndex } from '../src/core/index';
import { MemoryStorage } from '../src/core/storage';
import { Vault } from '../src/core/vault';
import { excerpt, pagePreview, sectionText } from '../src/core/preview';

const page = (path: string, text: string) => parsePage(path, text, 1);

describe('code review fixes', () => {
  it('partial-path links only match whole path segments', () => {
    const idx = new VaultIndex([page('Other/Same.md', ''), page('Mother/Same.md', '')]);
    expect(idx.resolve('her/Same')).toBeUndefined();
    expect(idx.resolve('Mother/Same')?.path).toBe('Mother/Same.md');
    expect(idx.resolve('Other/Same')?.path).toBe('Other/Same.md');
  });

  it('a symmetric relation declared on both sides is shown once, without a ×2 count', () => {
    const idx = new VaultIndex(
      [page('A.md', '---\nrelations:\n  ally: "[[B]]"\n---\n'), page('B.md', '---\nrelations:\n  ally: "[[A]]"\n---\n')],
      { relationTypes: [{ id: 'ally', symmetric: true }] },
    );
    const item = idx.panel('A.md').sections[0]!.groups[0]!.items[0]!;
    expect(item.count).toBe(1);
    expect(item.own).toBe(true);
  });

  it('renaming only the letter case does not leave a duplicate file', async () => {
    const storage = new MemoryStorage('t', { 'arn.md': 'x', 'B.md': '[[arn]]' });
    const vault = await Vault.open(storage);
    const p = await vault.renamePage('arn.md', 'Arn');
    expect(p).toBe('Arn.md');
    expect((await storage.list()).map((e) => e.path).sort()).toEqual(['Arn.md', 'B.md']);
    expect(await storage.readText('B.md')).toBe('[[Arn]]');
  });

  it('a markdown link to an anchor is not read as a tag', () => {
    expect(page('A.md', 'See [part two](#part-two) and #real').tags).toEqual(['real']);
  });

  it('editing relations keeps Windows line endings in the header', () => {
    const out = addRelationToText('---\r\ntitle: A\r\n---\r\nBody\r\n', 'ally', { target: 'B' });
    expect(out).toMatch(/^---\r\ntitle: A\r\nrelations:\r\n {2}ally: "\[\[B\]\]"\r\n---\r\nBody\r\n$/);
  });

  it('adding a relation to a page whose header is not a key/value block reports an error', () => {
    expect(() => addRelationToText('---\njust a sentence\n---\nBody', 'ally', { target: 'B' })).toThrow();
  });

  it('renaming a page also updates ![[embeds]] of it', async () => {
    const storage = new MemoryStorage('t', { 'Map.md': 'x', 'B.md': '![[Map]] and [[Map]]' });
    const vault = await Vault.open(storage);
    await vault.renamePage('Map.md', 'World map');
    expect(await storage.readText('B.md')).toBe('![[World map]] and [[World map]]');
  });

  it('mapWikiLinks can include embeds when asked and skips them by default', () => {
    const fn = () => 'X';
    expect(mapWikiLinks('![[A]] [[A]]', fn)).toBe('![[A]] [[X]]');
    expect(mapWikiLinks('![[A]] [[A]]', fn, { embeds: true })).toBe('![[X]] [[X]]');
  });

  it('a refresh running during a page creation does not drop the new page', async () => {
    const storage = new MemoryStorage('t', { 'A.md': 'a' });
    const vault = await Vault.open(storage);
    const refreshing = vault.refresh();
    const created = vault.createPage('New');
    await Promise.all([refreshing, created]);
    expect(vault.getPage('New.md')).toBeTruthy();
    expect(vault.pages.map((p) => p.path)).toContain('New.md');
  });

  it('pinning via an alias and unpinning via the real name toggle the same item', async () => {
    const storage = new MemoryStorage('t', { 'A.md': '[[B]]', 'B.md': '---\naliases: [Bee]\n---\n' });
    const vault = await Vault.open(storage);
    await vault.togglePin('A.md', 'Bee');
    expect(vault.getPage('A.md')!.pinned).toEqual(['Bee']);
    await vault.togglePin('A.md', 'B');
    expect(vault.getPage('A.md')!.pinned).toEqual([]);
  });
});


describe('page previews', () => {
  const idx = () =>
    new VaultIndex([
      page(
        'People/Kira.md',
        '---\naliases: [K]\ntags: [hero]\nborn: 412\nrelations:\n  ally: "[[Bo]]"\n---\n# Kira\n\nFirst paragraph with [[Bo]].\n\nSecond.\n\n## Secret\n\nShe knows ||a thing||.\n\n### Detail\n\nMore.\n\n## Later\n\nEnd.',
      ),
      page('Bo.md', 'Hi [[Kira]]'),
    ]);

  it('describes an existing page: title, facts, opening text and link counts', () => {
    const p = pagePreview(idx(), 'K');
    expect(p.exists).toBe(true);
    expect(p.title).toBe('Kira');
    expect(p.folder).toBe('People');
    expect(p.facts).toEqual([{ key: 'born', value: '412' }]);
    expect(p.excerpt.startsWith('First paragraph with [[Bo]].')).toBe(true);
    expect(p.excerpt).not.toContain('# Kira');
    expect(p.relations).toBe(1);
    expect(p.backlinks).toBe(1);
  });

  it('shows just the linked section for [[Page#Heading]]', () => {
    const p = pagePreview(idx(), 'Kira', 'Secret');
    expect(p.heading).toBe('Secret');
    expect(p.excerpt).toContain('She knows ||a thing||.');
    expect(p.excerpt).toContain('More.');
    expect(p.excerpt).not.toContain('End.');
    expect(p.facts).toEqual([]);
  });

  it('describes a missing page without throwing', () => {
    expect(pagePreview(idx(), 'Ghost')).toMatchObject({ exists: false, title: 'Ghost' });
  });

  it('never cuts a link or spoiler in half', () => {
    const long = 'word '.repeat(150) + '[[Some Long Page Name]] and ||a spoiler that runs on||';
    const ex = excerpt(long, 100);
    expect(ex.truncated).toBe(true);
    expect((ex.markdown.match(/\[\[/g) ?? []).length).toBe((ex.markdown.match(/\]\]/g) ?? []).length);
    expect((ex.markdown.match(/\|\|/g) ?? []).length % 2).toBe(0);
  });

  it('ignores headings inside code blocks when finding a section', () => {
    expect(sectionText('```\n## Fake\n```\n## Real\ntext', 'Fake')).toBeUndefined();
    expect(sectionText('## Real\ntext', 'real')).toBe('text');
  });
});
