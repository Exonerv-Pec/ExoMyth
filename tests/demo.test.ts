import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DEMO_FILES, DEMO_MEDIA } from '../src/demo';
import { MemoryStorage } from '../src/core/storage';
import { Vault } from '../src/core/vault';
import { isPlaylist, parsePlaylist } from '../src/core/playlist';
import { boardOf } from '../src/core/board';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('demo world', () => {
  it('bundles exactly the files in examples/demo-world', () => {
    const onDisk = walk('examples/demo-world').map((p) => relative('examples/demo-world', p).split('\\').join('/'));
    expect([...Object.keys(DEMO_FILES), ...Object.keys(DEMO_MEDIA)].sort()).toEqual(onDisk.sort());
    for (const p of onDisk) {
      if (p in DEMO_MEDIA) expect(Buffer.from(DEMO_MEDIA[p]!).equals(readFileSync(join('examples/demo-world', p)))).toBe(true);
      else expect(DEMO_FILES[p]).toBe(readFileSync(join('examples/demo-world', p), 'utf8'));
    }
  });

  it('has three short tracks of its own, in a playlist page that finds all of them', async () => {
    expect(Object.keys(DEMO_MEDIA)).toEqual(['attachments/Dawn over the river.wav', 'attachments/Fiddle in the rain.wav', 'attachments/Last call.wav']);
    for (const data of Object.values(DEMO_MEDIA)) {
      expect(String.fromCharCode(...data.slice(0, 4))).toBe('RIFF');
      expect(data.length).toBeLessThan(100_000);
    }
    const storage = new MemoryStorage('demo-music', DEMO_FILES);
    for (const [path, data] of Object.entries(DEMO_MEDIA)) await storage.writeBytes(path, data);
    const vault = await Vault.open(storage);
    const page = vault.getPage('Music/Rivertown Evening.md')!;
    expect(isPlaylist(page)).toBe(true);
    const tracks = parsePlaylist(page.body);
    expect(tracks).toHaveLength(3);
    for (const t of tracks) expect(vault.resolveFile(t.target)).toBeTruthy();
  });

  it('has a mood board whose pictures and pages all exist', async () => {
    const vault = await Vault.open(new MemoryStorage('demo-board', DEMO_FILES));
    const board = boardOf(vault.getPage('Boards/The Look of Rivertown.md')!)!;
    expect(board.items.map((i) => i.kind).sort()).toEqual(['color', 'color', 'color', 'color', 'image', 'image', 'image', 'note', 'note', 'page', 'page', 'page', 'quote']);
    for (const i of board.items) {
      if (i.image) expect(vault.resolveFile(i.image), i.image).toBeTruthy();
      if (i.page) expect(vault.index.resolve(i.page), i.page).toBeTruthy();
    }
  });

  it('is in English and has no broken links or header errors', async () => {
    const vault = await Vault.open(new MemoryStorage('demo', DEMO_FILES));
    expect(vault.pages.length).toBe(24);
    expect(vault.resolveFile("rivertown map.svg")?.path).toBe("attachments/rivertown map.svg");
    expect(vault.index.brokenLinks()).toEqual([]);
    expect(vault.pages.filter((p) => p.parseError)).toEqual([]);
    expect(Object.values(DEMO_FILES).join('\n')).not.toMatch(/[А-Яа-яЁё]/);
    expect(vault.settings.relationTypes.map((t) => t.id)).toContain('born in');
  });
});
