/**
 * Engine — the Facade over the whole render system.
 *
 * Constructed once (via `createEngine`) with a canvas and the app store, it owns
 * the WebGPU device, the velocity field, the RenderGraph, the orbit camera, and
 * the instantiated visualizations, and runs the per-frame loop. The React layer
 * never touches any of that — it only `start()`s / `stop()`s / `dispose()`s the
 * engine and communicates the rest through the store. That one-way arrow (UI →
 * store → engine, engine → store → labels) is the hexagonal seam.
 *
 * `start` begins the requestAnimationFrame loop; `stop` halts it (idempotent);
 * `dispose` stops then releases every GPU resource (visualizations, render
 * graph, field).
 */
export type Engine = {
  start(): void;
  stop(): void;
  dispose(): void;
};
