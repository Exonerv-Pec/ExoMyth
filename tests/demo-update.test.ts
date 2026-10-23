import { describe, expect, it } from 'vitest';
import { execSync } from 'node:child_process';
import { MemoryStorage } from '../src/core/storage';
import { DEMO_FILES, updateDemoWorld } from '../src/demo';
import { Vault } from '../src/core/vault';

/** The demo as an earlier version shipped it (0.3.0 by default), read from git when available. */
function oldDemo(rev = 'a038397'): Record<string, string> | undefined {
  try {
    const files = execSync(`git ls-tree -r --name-only ${rev} -- examples/demo-world`).toString().trim().split('\n');
    return Object.fromEntries(
      files.map((f) => [f.slice('examples/demo-world/'.length), execSync(`git show "${rev}:${f}"`).toString()]),
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

  const v061 = oldDemo('e2ceb37');
  it.skipIf(!v061)('brings a 0.6 demo to the current one, with years and events', async () => {
    const storage = new MemoryStorage('demo-061', { ...v061! });
    await updateDemoWorld(storage);
    for (const [path, text] of Object.entries(DEMO_FILES)) expect(await storage.readText(path)).toBe(text);
    const vault = await Vault.open(storage);
    expect(vault.index.resolve('Siege of Rivertown')?.path).toBe('Events/Siege of Rivertown.md');
  });

  it('does nothing to a demo that is already current', async () => {
    expect(await updateDemoWorld(new MemoryStorage('cur', DEMO_FILES))).toBe(0);
  });
});
