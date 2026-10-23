import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { DEMO_FILES } from '../src/demo';
import { MemoryStorage } from '../src/core/storage';
import { Vault } from '../src/core/vault';

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : [p];
  });
}

describe('demo world', () => {
  it('bundles exactly the files in examples/demo-world', () => {
    const onDisk = walk('examples/demo-world').map((p) => relative('examples/demo-world', p).split('\\').join('/'));
    expect(Object.keys(DEMO_FILES).sort()).toEqual(onDisk.sort());
    for (const p of onDisk) expect(DEMO_FILES[p]).toBe(readFileSync(join('examples/demo-world', p), 'utf8'));
  });

  it('is in English and has no broken links or header errors', async () => {
    const vault = await Vault.open(new MemoryStorage('demo', DEMO_FILES));
    expect(vault.pages.length).toBe(14);
    expect(vault.resolveFile("rivertown map.svg")?.path).toBe("attachments/rivertown map.svg");
    expect(vault.index.brokenLinks()).toEqual([]);
    expect(vault.pages.filter((p) => p.parseError)).toEqual([]);
    expect(Object.values(DEMO_FILES).join('\n')).not.toMatch(/[А-Яа-яЁё]/);
    expect(vault.settings.relationTypes.map((t) => t.id)).toContain('born in');
  });
});
