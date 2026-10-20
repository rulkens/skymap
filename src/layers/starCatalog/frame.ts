/**
 * starCatalogPlanner — the Layer's once-per-frame CPU row: reduce the frame to
 * the GPU cut's inputs, set them on the renderer for `star-cut` to encode and
 * every pass to draw (capture faces read it too), and plan each octree
 * source's chunks (every fourth frame; a moving cut re-cuts every other). The cut and its LOD fades live on the GPU, so the wake vote
 * is a timer: the fades can still be moving for `NODE_FADE_MS` after the cut
 * last moved past a slack, or a chunk landed or left; it also holds while a
 * chunk is in flight. `settling` holds while a chunk is in flight or a landing
 * fades in: `settled()` waits for it, and a sky capture re-bakes until then (its
 * own fade-less cut draws the resident chunks, so a bake before a landing lacks it).
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { FrameView } from '../../@types/engine/frame/FrameView';
import type { PassState } from '../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';
import type { OctreeDriverStream } from '../../@types/octree/OctreeDriverStream';
import type { StarCatalogRuntime } from './@types/StarCatalogRuntime';
import { OCTREE_PLAN_INTERVAL_FRAMES } from '../../data/octree/octreePlanIntervalFrames';
import { starCutInputs } from './render/cut/starCutInputs';
import { resizeStarPools } from './load/resizeStarPools';
import { createOctreeFrameDriver } from '../../services/octree/createOctreeFrameDriver';
import type { StarColumns } from '../../@types/data/starCatalog/StarColumns';

export function starCatalogPlanner(
  runtime: StarCatalogRuntime,
): Extract<FrameContentPlanner<void, 'starCatalog'>, { scope: 'once' }> {
  const driver = createOctreeFrameDriver<StarColumns>(OCTREE_PLAN_INTERVAL_FRAMES);
  // The debug chunk-pool size last applied; a change re-installs the pools from the loaded octrees.
  let appliedSlots: number | null = null;
  return {
    name: 'star-catalog',
    scope: 'once',
    fade: 'starCatalog',
    plan(_snapshot: ReadyFrameContext, views: readonly FrameView[], state: PassState, fade) {
      const slotsOverride = state.settings.starCatalogs.chunkSlotsOverride;
      if (slotsOverride !== appliedSlots) {
        appliedSlots = slotsOverride;
        runtime.publish({ chunkSlotsError: resizeStarPools(runtime, slotsOverride) });
        driver.reset(); // the new streams know nothing of the last plan
      }
      const inputs = starCutInputs(runtime, state.settings.starCatalogs, fade, views);
      const streams: OctreeDriverStream<StarColumns>[] = [];
      if (inputs !== null) {
        for (const { source, octree } of runtime.renderer.loadedCatalogs()) {
          const stream = runtime.chunkStreams.get(source);
          if (stream !== undefined && inputs.cut.sources.some((s) => s.source === source)) {
            streams.push({ stream, octree });
          }
        }
      }
      const { recut, awake, settling } = driver.step(
        views[0]!.snapshot.nowMs,
        inputs?.cut ?? null,
        streams,
      );
      runtime.renderer.setFrameCut(inputs, recut);
      return { value: undefined, awake, settling };
    },
  };
}
