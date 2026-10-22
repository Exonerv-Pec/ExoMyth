import { describe, expect, it } from 'vitest';
import { migrateLocalStorage } from '../src/migrate';
import { MemoryStorage } from '../src/core/storage';
import { Vault } from '../src/core/vault';

describe('rename from Mythloom to Exomyth', () => {
  it('moves browser preferences to the new names without overwriting newer ones', () => {
    localStorage.clear();
    localStorage.setItem('mythloom:theme', 'dark');
    localStorage.setItem('mythloom:lang', 'ru');
    localStorage.setItem('exomyth:lang', 'en');
    localStorage.setItem('unrelated', 'x');
    expect(migrateLocalStorage()).toBe(1);
    expect(localStorage.getItem('exomyth:theme')).toBe('dark');
    expect(localStorage.getItem('exomyth:lang')).toBe('en');
    expect(localStorage.getItem('mythloom:theme')).toBeNull();
    expect(localStorage.getItem('unrelated')).toBe('x');
  });

  it('reads settings and graph positions saved in a world folder under the old name', async () => {
    const storage = new MemoryStorage('t', {
      'A.md': '[[B]]',
      'B.md': '',
      '.mythloom/settings.json': JSON.stringify({ relationTypes: [{ id: 'ally', symmetric: true }] }),
      '.mythloom/graph.json': JSON.stringify({ version: 1, nodes: { 'A.md': [10, 20, 0] } }),
    });
    const vault = await Vault.open(storage);
    expect(vault.settings.relationTypes[0]!.id).toBe('ally');
    expect((await vault.loadLayout()).nodes['A.md']).toEqual([10, 20, 0]);
    // Old metadata files are not shown as pages or files of the world.
    expect(vault.allFiles.map((f) => f.path)).toEqual(['A.md', 'B.md']);
    // New saves go to the new folder; the old file is left untouched.
    await vault.saveLayout({ version: 1, nodes: { 'A.md': [1, 2, 0] } });
    expect(await storage.exists('.exomyth/graph.json')).toBe(true);
    expect(await storage.exists('.mythloom/graph.json')).toBe(true);
    expect((await vault.loadLayout()).nodes['A.md']).toEqual([1, 2, 0]);
  });
});
