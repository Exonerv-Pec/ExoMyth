import { layoutGraph, type LayoutResult, type StoredLayout } from './core/layout';
import type { WorldGraph } from './core/graph';

/**
 * Graph layout in a background thread (a Web Worker from the app's own files, which the security
 * policy allows). Where workers cannot start (tests, the single-file copy), the layout runs here.
 */
let worker: Worker | null | undefined;
let seq = 0;

function start(): Worker | null {
  if (worker !== undefined) return worker;
  try {
    worker = typeof Worker === 'function' ? new Worker(new URL('./layout.worker.ts', import.meta.url), { type: 'module' }) : null;
  } catch {
    worker = null;
  }
  return worker;
}

export function layoutInBackground(graph: WorldGraph, stored: StoredLayout): Promise<LayoutResult> {
  const w = start();
  if (!w) return Promise.resolve(layoutGraph(graph, stored));
  const id = ++seq;
  return new Promise((resolve) => {
    const done = () => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
    };
    const onMessage = (e: MessageEvent<{ id: number; result: LayoutResult }>) => {
      if (e.data?.id !== id) return;
      done();
      resolve(e.data.result);
    };
    // A worker that cannot load or fails: do it here instead, and from now on always here.
    const onError = (e: Event) => {
      e.preventDefault();
      done();
      worker = null;
      w.terminate();
      resolve(layoutGraph(graph, stored));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    try {
      // Plain copies: the saved layout may be a reactive object, which cannot be sent as it is.
      w.postMessage({ id, graph, stored: JSON.parse(JSON.stringify(stored)) as StoredLayout });
    } catch {
      done();
      resolve(layoutGraph(graph, stored));
    }
  });
}
