import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { MemoryStorage } from '../src/core/storage';
import { DEMO_FILES, updateDemoWorld } from '../src/demo';
import { Vault } from '../src/core/vault';

/** The demo as version 0.3.0 shipped it, read from git when available. */
function oldDemo(): Record<string, string> | undefined {
  try {
    const files = execSync('git ls-tree -r --name-only a038397 -- examples/demo-world').toString().trim().split('\n');
    return Object.fromEntries(
      files.map((f) => [f.slice('examples/demo-world/'.length), execSync(`git show "a038397:${f}"`).toString()]),
    );
  } catch {
    return undefined;
  }
}

describe('updating a demo world saved by an earlier version', () => {
  const old = oldDemo();
  it.skipIf(!old)('adds new files, refreshes untouched ones and keeps the owner’s edits', async () => {
    const files = { ...old! };
    files['Characters/Kira Vale.md'] += '\nMy own note.\n'; // an edit by the owner (Kira is unchanged in the demo anyway)
    files['Places/Rivertown.md'] += '\nMy own note about the harbour.\n'; // an edited file that the demo also changed
    files['My page.md'] = 'Mine';
    const storage = new MemoryStorage('old-demo', files);

    const written = await updateDemoWorld(storage);
    expect(written).toBeGreaterThan(0);
    expect(await storage.readText('attachments/order emblem.svg')).toBe(DEMO_FILES['attachments/order emblem.svg']);
    expect(await storage.readText('Organizations/Order of the Silver River.md')).toBe(
      DEMO_FILES['Organizations/Order of the Silver River.md'],
    );
    expect(await storage.readText('Places/Rivertown.md')).toContain('My own note about the harbour.');
    expect(await storage.readText('Characters/Kira Vale.md')).toContain('My own note.');
    expect(await storage.readText('My page.md')).toBe('Mine');

    const vault = await Vault.open(storage);
    expect(vault.settings.relationTypes.map((t) => t.id)).toContain('member of');
    expect(vault.index.resolve('Mara Holt')).toBeTruthy();
    // Running it again changes nothing.
    expect(await updateDemoWorld(storage)).toBe(0);
  });

  it('does nothing to a demo that is already current', async () => {
    expect(await updateDemoWorld(new MemoryStorage('cur', DEMO_FILES))).toBe(0);
  });
});
