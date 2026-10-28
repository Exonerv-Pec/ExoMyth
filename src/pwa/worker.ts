/**
 * The service worker that lets Exomyth run without a connection: on the first visit it keeps a copy
 * of every file of this version of the app, and from then on the app starts from that copy, online
 * or not. A new version is fetched in the background and waits until the person chooses to reload
 * (see `src/pwa.svelte.ts`), so it never changes under someone who is writing.
 *
 * It only ever touches the app's own files: worlds are not files of the app (they live in a folder or
 * in the browser's own storage), and requests to anywhere else are not handled (the app makes none).
 *
 * The source is made at build time by the Vite plugin in vite.config.ts, with the list of files.
 */

/** Files of a build that the app does not need to run. */
export function cachedFiles(files: Iterable<string>): string[] {
  const out = new Set<string>(['./']);
  for (const f of files) {
    if (/\.map$/.test(f) || f === 'sw.js' || f.startsWith('.')) continue;
    out.add(f);
  }
  return [...out].sort();
}

/** The text of `sw.js` for one version of the app. */
export function serviceWorkerSource(files: readonly string[], version: string): string {
  return `// Exomyth: keeps this version of the app for working offline. Made at build time.
'use strict';
const VERSION = ${JSON.stringify(version)};
const CACHE = 'exomyth-app-' + VERSION;
const FILES = ${JSON.stringify(files)};

self.addEventListener('install', (event) => {
  // "reload": the copy must come from the server, not from the browser's ordinary cache.
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(FILES.map((f) => new Request(f, { cache: 'reload' })))));
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k.startsWith('exomyth-app-') && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// The app asks for this when the person presses "Reload" on the notice of a new version.
self.addEventListener('message', (event) => {
  if (event.data === 'exomyth:update') self.skipWaiting();
  if (event.data === 'exomyth:version' && event.source) event.source.postMessage({ type: 'exomyth:version', version: VERSION });
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  if (request.mode === 'navigate') {
    // Any page of the app opens the app itself, from the copy.
    event.respondWith(caches.open(CACHE).then((cache) => cache.match('./', { ignoreVary: true })).then((hit) => hit || fetch(request)));
    return;
  }
  event.respondWith(caches.open(CACHE).then((cache) => cache.match(request, { ignoreSearch: true, ignoreVary: true })).then((hit) => hit || fetch(request)));
});
`;
}
