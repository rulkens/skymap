/**
 * destroy — WebGPU releases nothing on GC, so every renderer is destroyed by
 * hand, in reverse construction order; the chunk streams go first, so no
 * landing chunk writes into a destroyed renderer.
 */

import type { StarCatalogRuntime } from './@types/StarCatalogRuntime';

export function destroy(runtime: StarCatalogRuntime): void {
  for (const stream of runtime.chunkStreams.values()) stream.destroy();
  runtime.chunkStreams.clear();
  runtime.aggregateUpsample.destroy();
  runtime.starPointRenderer.destroy();
  runtime.starRenderer.destroy();
  runtime.pickRenderer.destroy();
  runtime.renderer.destroy();
}
