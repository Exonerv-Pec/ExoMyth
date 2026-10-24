import { describe, expect, it } from 'vitest';
import { MemoryStorage } from '../src/core/storage';
import { Vault } from '../src/core/vault';
import { worldToZip } from '../src/core/archive';
import { unzipSync } from 'fflate';
import {
  AUTO_GAP_MS,
  cleanVersionName,
  dueForVersion,
  pageVersions,
  parseVersion,
  stamp,
  versionFile,
  versionsToThin,
  type PageVersion,
} from '../src/core/versions';
import { diffStats, diffText, withContext } from '../src/core/diff';

const HOUR = 3600_000;
const t0 = new Date(2026, 9, 24, 15, 30, 5).getTime();

describe('version files', () => {
  it('are named by local time, with an optional name, under the page path', () => {
    expect(stamp(t0)).toBe('2026-10-24 15.30.05');
    expect(versionFile('Scenes/The Duel.md', t0)).toBe('.exomyth/versions/Scenes/The Duel.md/2026-10-24 15.30.05.md');
    expect(versionFile('Scenes/The Duel.md', t0, 'Before: the "rewrite"?')).toBe('.exomyth/versions/Scenes/The Duel.md/2026-10-24 15.30.05 Before the rewrite.md');
    expect(cleanVersionName('  ..a/b  ')).toBe('a b');
    expect(cleanVersionName('x'.repeat(100))).toHaveLength(60);
  });

  it('are read back from their names; other files are not versions', () => {
    const f = versionFile('A.md', t0, 'Draft 2');
    expect(parseVersion({ path: f, mtime: 0, size: 10 })).toEqual({ file: f, time: t0, name: 'Draft 2', size: 10 });
    expect(parseVersion({ path: '.exomyth/versions/A.md/notes.txt', mtime: 0, size: 1 })).toBeUndefined();
    const list = pageVersions('A.md', [
      { path: versionFile('A.md', t0), mtime: 0, size: 1 },
      { path: versionFile('A.md', t0 + HOUR), mtime: 0, size: 1 },
      // A page "A/B.md" keeps its versions in "A.md"'s neighbour folder "A/B.md", never inside "A.md".
      { path: versionFile('A/B.md', t0), mtime: 0, size: 1 },
    ]);
    expect(list.map((v) => v.time)).toEqual([t0 + HOUR, t0]);
  });

  it('thins versions saved by themselves evenly, keeping the oldest, the newest and named ones', () => {
    const v = (h: number, name?: string): PageVersion => ({ file: `f${h}${name ?? ''}`, time: t0 + h * HOUR, size: 1, ...(name ? { name } : {}) });
    // Many close together at the start, a few spread out later.
    const all = [v(0), v(0.5), v(1), v(1.5), v(2), v(50), v(100), v(150), v(1, 'kept')];
    const gone = versionsToThin(all, 5);
    expect(gone).toHaveLength(3);
    const left = all.filter((x) => !gone.includes(x));
    expect(left.map((x) => x.file)).toEqual(['f0', 'f2', 'f50', 'f100', 'f150', 'f1kept']);
    expect(versionsToThin(all, 20)).toEqual([]);
  });

  it('a version is due after a pause long enough', () => {
    expect(dueForVersion(undefined, t0)).toBe(true);
    expect(dueForVersion(t0, t0 + AUTO_GAP_MS - 1)).toBe(false);
    expect(dueForVersion(t0, t0 + AUTO_GAP_MS)).toBe(true);
  });
});

describe('versions in a world', () => {
  async function world() {
    const storage = new MemoryStorage('W', { 'Scenes/Duel.md': '# Duel\n\nOne.\n', 'Other.md': 'Links to [[Duel]].\n' });
    return { storage, vault: await Vault.open(storage) };
  }

  it('saves, lists, names and deletes versions; they never show up as pages or files', async () => {
    const { vault } = await world();
    const a = await vault.saveVersion('Scenes/Duel.md', 'old text', undefined, t0);
    const b = await vault.saveVersion('Scenes/Duel.md', 'older?', undefined, t0);
    expect(b.time).toBe(t0 + 1000); // the same second: filed a second on
    await vault.saveVersion('Scenes/Duel.md', 'named', 'First draft', t0 + HOUR);
    const list = await vault.versions('Scenes/Duel.md');
    expect(list.map((v) => v.name ?? '')).toEqual(['First draft', '', '']);
    expect(await vault.readVersion(a.file)).toBe('old text');
    await vault.refresh();
    expect(vault.pages.map((p) => p.path).sort()).toEqual(['Other.md', 'Scenes/Duel.md']);
    expect(vault.allFiles.some((f) => f.path.includes('versions'))).toBe(false);

    const named = await vault.renameVersion(a, 'Scenes/Duel.md', 'Keep: me');
    expect(named.name).toBe('Keep me');
    expect(await vault.readVersion(named.file)).toBe('old text');
    await vault.deleteVersion(b.file);
    expect((await vault.versions('Scenes/Duel.md')).map((v) => v.name)).toEqual(['First draft', 'Keep me']);
  });

  it('keeps at most the limit of versions saved by themselves', async () => {
    const { vault } = await world();
    for (let i = 0; i < 8; i++) await vault.saveVersion('Scenes/Duel.md', `v${i}`, undefined, t0 + i * HOUR, 5);
    await vault.saveVersion('Scenes/Duel.md', 'named', 'Mine', t0 + 9 * HOUR, 5);
    const list = await vault.versions('Scenes/Duel.md');
    expect(list.filter((v) => !v.name)).toHaveLength(5);
    expect(list.some((v) => v.name === 'Mine')).toBe(true);
    expect(list.at(-1)!.time).toBe(t0); // the oldest stays
  });

  it('versions follow their page when it is renamed, moved or put in the trash', async () => {
    const { storage, vault } = await world();
    await vault.saveVersion('Scenes/Duel.md', 'old', undefined, t0);
    const renamed = await vault.renamePage('Scenes/Duel.md', 'The Duel');
    expect((await vault.versions(renamed)).length).toBe(1);
    expect((await vault.versions('Scenes/Duel.md')).length).toBe(0);
    const moved = await vault.movePage(renamed, 'Book');
    expect(moved).toBe('Book/The Duel.md');
    expect((await vault.versions(moved)).length).toBe(1);
    await vault.trashPage(moved);
    expect((await vault.versions(moved)).length).toBe(0);
    expect(await storage.exists(`.trash/${versionFile(moved, t0)}`)).toBe(true);
  });

  it('a downloaded world includes the versions', async () => {
    const { storage, vault } = await world();
    await vault.saveVersion('Scenes/Duel.md', 'old', 'Draft', t0);
    const zip = unzipSync((await worldToZip(storage)).data);
    expect(Object.keys(zip)).toContain(`W/${versionFile('Scenes/Duel.md', t0, 'Draft')}`);
  });
});

describe('comparing texts', () => {
  const join = (parts: { op: string; text: string }[], ...ops: string[]) => parts.filter((p) => ops.includes(p.op)).map((p) => p.text).join('');

  it('marks the words that changed and gives both texts back', () => {
    const a = 'The river was cold and grey.\nArn waited.\n';
    const b = 'The river was warm and grey.\nArn waited.\nThen he left.\n';
    const parts = diffText(a, b);
    expect(join(parts, 'same', 'del')).toBe(a);
    expect(join(parts, 'same', 'add')).toBe(b);
    expect(parts.filter((p) => p.op === 'del').map((p) => p.text)).toEqual(['cold']);
    expect(parts.filter((p) => p.op === 'add').map((p) => p.text)).toEqual(['warm', 'Then he left.\n']);
    expect(diffStats(parts)).toEqual({ added: 4, removed: 1 });
  });

  it('works on Cyrillic and with nothing changed', () => {
    const parts = diffText('Арн вошёл в зал.', 'Арн тихо вошёл в зал.');
    expect(parts.filter((p) => p.op !== 'same').map((p) => [p.op, p.text])).toEqual([['add', 'тихо ']]);
    expect(diffText('same', 'same')).toEqual([{ op: 'same', text: 'same' }]);
    expect(diffText('', 'new')).toEqual([{ op: 'add', text: 'new' }]);
  });

  it('round-trips random edits of a long text', () => {
    let seed = 7;
    const rnd = (n: number) => ((seed = (seed * 1103515245 + 12345) % 2 ** 31), seed % n);
    const words = ['river', 'Arn', 'cold', 'the', 'and', 'Мира', 'город', '.', ',', '\n', '\n\n'];
    const a = Array.from({ length: 3000 }, () => words[rnd(words.length)]).join(' ');
    const bArr = a.split(' ');
    for (let i = 0; i < 200; i++) bArr.splice(rnd(bArr.length), rnd(3), ...(rnd(2) ? [words[rnd(words.length)]!] : []));
    const b = bArr.join(' ');
    const parts = diffText(a, b);
    expect(join(parts, 'same', 'del')).toBe(a);
    expect(join(parts, 'same', 'add')).toBe(b);
  });

  it('hides long unchanged stretches but keeps a few lines around each change', () => {
    const lines = Array.from({ length: 30 }, (_, i) => `Line ${i}\n`);
    const b = [...lines];
    b[15] = 'Changed\n';
    const view = withContext(diffText(lines.join(''), b.join('')));
    const skips = view.filter((p) => p.op === 'skip');
    expect(skips).toHaveLength(2);
    expect(view.map((p) => p.text).join('')).toContain('Line 13\nLine 14\n');
    // Nothing is lost: the hidden text plus the shown text is the whole.
    expect(view.filter((p) => p.op !== 'add').map((p) => p.text).join('')).toBe(lines.join(''));
  });
});
