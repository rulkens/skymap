/**
 * destroy — WebGPU releases nothing on GC, so every renderer is destroyed by
 * hand, in reverse construction order.
 */

import type { StarCatalogRuntime } from './@types/StarCatalogRuntime';

export function destroy(runtime: StarCatalogRuntime): void {
  runtime.aggregateUpsample.destroy();
  runtime.starPointRenderer.destroy();
  runtime.starRenderer.destroy();
  runtime.pickRenderer.destroy();
  runtime.renderer.destroy();
}
