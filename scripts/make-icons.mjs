// Makes the app icons (public/icon-*.png) from public/icon.svg, with the browser Playwright brings.
// The maskable icon has a wider margin, because phones cut it into circles and other shapes.
//
//   node scripts/make-icons.mjs
import { readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';

let chromium;
try {
  ({ chromium } = await import('playwright'));
} catch {
  ({ chromium } = createRequire(import.meta.url)('playwright'));
}
const svg = readFileSync('public/icon.svg', 'utf8');
const browser = await chromium.launch();
const page = await browser.newPage();
/** `round`: the corners stay see-through; otherwise the square is filled (phones round it themselves). */
const make = async (file, size, inner, round) => {
  await page.setViewportSize({ width: size, height: size });
  await page.setContent(
    `<body style="margin:0;background:${round ? "transparent" : "#0e1a21"};width:${size}px;height:${size}px;display:grid;place-items:center">` +
      `<div style="width:${inner}px;height:${inner}px;padding:0">${svg.replace('<svg ', `<svg width="${inner}" height="${inner}" `)}</div></body>`,
  );
  await page.screenshot({ path: file, omitBackground: round });
};
await make('public/icon-192.png', 192, 192, true);
await make('public/icon-512.png', 512, 512, true);
await make('public/icon-maskable-512.png', 512, 360, false);
await make('public/apple-touch-icon.png', 180, 180, false);
await browser.close();
