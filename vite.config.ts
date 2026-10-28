import { defineConfig, type Plugin } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { viteSingleFile } from 'vite-plugin-singlefile';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { join, relative } from 'node:path';
import { cachedFiles, serviceWorkerSource } from './src/pwa/worker';

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

/** Every file under a folder, as paths relative to it with forward slashes. */
function walk(dir: string, root = dir): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path, root) : [relative(root, path).split('\\').join('/')];
  });
}

/**
 * Writes `sw.js`, the service worker that keeps every file of the build for working offline (see
 * src/pwa/worker.ts). Its version is a fingerprint of all those files, so any change to the app,
 * even a new picture in the guide, makes browsers fetch the new version.
 */
function serviceWorker(): Plugin {
  let outDir = 'dist';
  return {
    name: 'exomyth-service-worker',
    apply: 'build',
    configResolved(config) {
      outDir = config.build.outDir;
    },
    // After everything else is written, so the list and the fingerprint see the final files.
    closeBundle() {
      const names = walk(outDir).filter((n) => n !== 'sw.js').sort();
      const hash = createHash('sha256');
      for (const name of names) hash.update(name).update(readFileSync(join(outDir, name)));
      // The worker's own code counts too.
      hash.update(serviceWorkerSource(cachedFiles(names), ''));
      writeFileSync(join(outDir, 'sw.js'), serviceWorkerSource(cachedFiles(names), hash.digest('hex').slice(0, 16)));
    },
  };
}

const single = process.env.SINGLE_FILE === '1';

export default defineConfig({
  plugins: [svelte(), ...(single ? [viteSingleFile()] : [contentSecurityPolicy(), serviceWorker()])],
  // The single-file copy runs from anywhere (even a file), where an offline service worker cannot.
  define: { __EXOMYTH_PWA__: JSON.stringify(!single && !process.env.VITEST) },
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
