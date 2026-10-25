import { defineConfig, type Plugin } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';

/**
 * Production builds ship a Content Security Policy that only allows resources from the app's own
 * origin. The app therefore cannot contact other servers, even by accident or through a dependency.
 * (Skipped in the dev server, whose hot-reload client needs more, and in the single-file preview.)
 */
function contentSecurityPolicy(): Plugin {
  const policy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "font-src 'self' data:",
    "connect-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
  ].join('; ');
  return {
    name: 'exomyth-csp',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html.replace(
          '<title>',
          `<meta http-equiv="Content-Security-Policy" content="${policy}" />\n    <title>`,
        );
      },
    },
  };
}

const single = process.env.SINGLE_FILE === '1';

export default defineConfig({
  plugins: [svelte(), ...(single ? [viteSingleFile()] : [contentSecurityPolicy()])],
  // Relative base so the built app works from any folder or static host.
  base: './',
  build: { target: 'es2022', outDir: single ? 'dist-single' : 'dist' },
  // Tests run in jsdom: make Svelte resolve its browser build there.
  resolve: process.env.VITEST ? { conditions: ['browser'] } : undefined,
  test: {
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    setupFiles: ['tests/setup.ts'],
  },
});
