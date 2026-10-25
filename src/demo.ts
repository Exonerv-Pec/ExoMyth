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
  // A saved version of a scene, to try comparing versions.
  ...import.meta.glob('../examples/demo-world/.exomyth/versions/**/*.md', { query: '?raw', import: 'default', eager: true }),
  // Pictures of the demo are SVG, which is text, so they can be bundled the same way as pages.
  ...import.meta.glob('../examples/demo-world/attachments/*.svg', { query: '?raw', import: 'default', eager: true }),
} as Record<string, string>;

// The demo's music is binary. It is bundled as base64 inside the app (never fetched), then decoded.
const audio = import.meta.glob('../examples/demo-world/attachments/*.wav', { query: '?inline', import: 'default', eager: true }) as Record<string, string>;

function fromDataUri(uri: string): Uint8Array {
  const binary = atob(uri.slice(uri.indexOf(',') + 1));
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Path inside the world → bytes of a media file that is not text (the demo's tracks). */
export const DEMO_MEDIA: Record<string, Uint8Array> = Object.fromEntries(
  Object.entries(audio)
    .map(([path, uri]) => [path.slice(PREFIX.length), fromDataUri(uri)] as const)
    .sort(([a], [b]) => (a < b ? -1 : 1)),
);

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
  '.exomyth/settings.json': ['g6-f2c86461', 'hz-23f968d2'],
  'Boards/The Look of Rivertown.md': ['12w-fa6c7d4b'],
  'Characters/Arn Vale.md': ['6a-cebe2b76', '8g-de0a8f9a'],
  'Characters/Bo Tarn.md': ['41-eb3e58b6'],
  'Characters/Brother Tomas.md': ['6t-8fec7ebc'],
  'Characters/Dax Morn.md': ['4p-4a0d94de'],
  'Characters/Eva Crow.md': ['4m-e2efbe11'],
  'Characters/Liara Vale.md': ['4c-dbc7cf0c'],
  'Maps/Silver Coast.md': ['jw-aa184c42'],
  'Organizations/Order of the Silver River.md': ['50-fc67a0b8'],
  'Places/Rivertown.md': ['5k-99396e61', '6c-d6c4526e', '71-7d01481b'],
  'Scenes/The Market.md': ['ar-353adf61'],
  'Welcome.md': ['1rm-8b7dfc26', '1o3-7a142736', '1kq-ce16be2f', 'iq-8864ffcc', 'ir-a0430db9', 'lm-e11e2110', 'ln-31dd7d01', 'q0-bf260e99', 'q1-6bd26b98', 'tc-52e44f6f', '127-6683dd3b', '18o-51165fba', '1ci-819efe5c', '1gh-30f2f325'],
};

/**
 * Brings a demo world saved by an earlier version up to date: adds files that are new in the demo
 * (the tracks too) and replaces files that are still exactly as an earlier version shipped them. Anything the owner
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
  // Tracks are never replaced, only added when they are missing.
  for (const [path, data] of Object.entries(DEMO_MEDIA)) {
    if (await storage.exists(path)) continue;
    await storage.writeBytes(path, data);
    written++;
  }
  return written;
}
