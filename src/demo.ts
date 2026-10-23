/**
 * The demo world. Its pages live as real files in `examples/demo-world/`, so the same world can
 * be opened as a folder (in Exomyth or any Markdown editor) and is bundled into the app for
 * "Open the demo world". Edit the files there; nothing here needs to change.
 */

import type { VaultStorage } from './core/storage';
import { contentHash } from './core/hash';

/** Name of the browser-stored world that "Open the demo world" creates. */
export const DEMO_WORLD_NAME = 'Demo world';

const PREFIX = '../examples/demo-world/';

// Dot-folders are not matched by `**`, so the settings file is listed on its own.
const files = {
  ...import.meta.glob('../examples/demo-world/**/*.md', { query: '?raw', import: 'default', eager: true }),
  ...import.meta.glob('../examples/demo-world/.exomyth/settings.json', { query: '?raw', import: 'default', eager: true }),
  // Media of the demo are text formats (SVG), so they can be bundled the same way as pages.
  ...import.meta.glob('../examples/demo-world/attachments/*.svg', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>;

/** Path inside the world → file text. */
export const DEMO_FILES: Record<string, string> = Object.fromEntries(
  Object.entries(files)
    .map(([path, text]) => [path.slice(PREFIX.length), text] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1)),
);

/**
 * Fingerprints of earlier versions of the demo files. A stored demo file that matches one of
 * these was never edited by its owner, so it is safe to replace with the current version.
 * Add the old fingerprint here whenever a demo file changes.
 */
const DEMO_HISTORY: Record<string, string[]> = {
  '.exomyth/settings.json': ['g6-f2c86461'],
  'Organizations/Order of the Silver River.md': ['50-fc67a0b8'],
  'Places/Rivertown.md': ['5k-99396e61', '6c-d6c4526e'],
  'Welcome.md': ['iq-8864ffcc', 'ir-a0430db9', 'lm-e11e2110', 'ln-31dd7d01', 'q1-6bd26b98'],
};

/**
 * Brings a demo world saved by an earlier version up to date: adds files that are new in the demo
 * and replaces files that are still exactly as an earlier version shipped them. Anything the owner
 * changed or added is left alone. Returns the number of files written.
 */
export async function updateDemoWorld(storage: VaultStorage): Promise<number> {
  let written = 0;
  for (const [path, text] of Object.entries(DEMO_FILES)) {
    const exists = await storage.exists(path);
    if (exists) {
      const current = await storage.readText(path);
      if (current === text || !DEMO_HISTORY[path]?.includes(contentHash(current))) continue;
    }
    await storage.writeText(path, text);
    written++;
  }
  return written;
}
