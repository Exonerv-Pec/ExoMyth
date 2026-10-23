/**
 * The demo world. Its pages live as real files in `examples/demo-world/`, so the same world can
 * be opened as a folder (in Exomyth or any Markdown editor) and is bundled into the app for
 * "Open the demo world". Edit the files there; nothing here needs to change.
 */

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
