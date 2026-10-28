/**
 * Lays out the graph away from the window, so a first layout of a big world never freezes the app
 * (see `layoutInBackground`). The same code as on the main thread, so the result is the same.
 */
import { layoutGraph, type StoredLayout } from './core/layout';
import type { WorldGraph } from './core/graph';

const scope = self as unknown as {
  onmessage: ((e: MessageEvent<{ id: number; graph: WorldGraph; stored: StoredLayout }>) => void) | null;
  postMessage(message: unknown): void;
};

scope.onmessage = (e) => {
  const { id, graph, stored } = e.data;
  scope.postMessage({ id, result: layoutGraph(graph, stored) });
};
