/**
 * destroy — WebGPU releases nothing on GC, so every renderer and the committed
 * hi-res pair are destroyed by hand, subsystems before the renderers they hold.
 */

import type { GalaxyCatalogRuntime } from './@types/GalaxyCatalogRuntime';

export function destroy(runtime: GalaxyCatalogRuntime): void {
  runtime.biasCorrection.destroy();
  // Impostor teardown order matters: texturedDisks subscribes to galaxyAtlas's
  // eviction handler (destroy it first); the hi-res planner subscribes to its
  // texture's evict handler (planner before texture); galaxyAtlas releases its
  // GPU texture last.
  runtime.texturedDisks.destroy();
  const pair = runtime.hiResFamous.committed()?.value ?? null;
  pair?.subsystem.destroy();
  pair?.texture.destroy();
  runtime.proceduralDisks.destroy();
  runtime.diskPlannerWalk.destroy();
  runtime.galaxyAtlas.destroy();

  runtime.pickRenderer.destroy();
  runtime.proceduralDiskRenderer.destroy();
  runtime.texturedDiskRenderer.destroy();
  runtime.pointRenderer.destroy();

  runtime.catalogs.clear();
}
