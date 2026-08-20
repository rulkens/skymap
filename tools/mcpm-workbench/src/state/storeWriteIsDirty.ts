import type { AppState } from '../../@types/AppState';

/**
 * storeWriteIsDirty — did a store write change anything the frame loop draws? Every
 * slice reducer returns a fresh object only on a real change (createStore.ts's own
 * docstring), so reference comparisons are exact and free. `view.fps` is compared OUT:
 * it's the loop's own FPS-badge push (Viewport.tsx's `setFps`), and counting it would
 * wake render-on-demand right back up on its own write every 500ms. Every other `view`
 * field is compared by its own nested reference rather than `prev.view !== next.view`,
 * since an fps-only write still replaces that outer object.
 */
export function storeWriteIsDirty(prev: AppState, next: AppState): boolean {
  if (prev === next) return false;
  return (
    prev.catalog !== next.catalog ||
    prev.grid !== next.grid ||
    prev.sim !== next.sim ||
    prev.histogram !== next.histogram ||
    prev.view.layers !== next.view.layers ||
    prev.view.galaxies !== next.view.galaxies ||
    prev.view.agents !== next.view.agents ||
    prev.view.camera !== next.view.camera ||
    prev.view.raymarch !== next.view.raymarch ||
    prev.view.pathTracer !== next.view.pathTracer
  );
}
