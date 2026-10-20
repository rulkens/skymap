/**
 * starCatalogPlanner — the Layer's once-per-frame CPU row: reduce the frame to
 * the GPU cut's inputs, set them on the renderer for `star-cut` to encode and
 * every pass to draw (capture faces read it too), and plan each octree
 * source's chunks (every fourth frame; a moving cut re-cuts every other). The cut and its LOD fades live on the GPU, so the wake vote
 * is a timer: the fades can still be moving for `NODE_FADE_MS` after the cut
 * last moved past a slack, or a chunk landed or left; it also holds while a
 * chunk is in flight. `settling: false` always: a capture face draws its own
 * fade-less cut.
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { FrameView } from '../../@types/engine/frame/FrameView';
import type { PassState } from '../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';
import type { Octree } from '../../@types/octree/Octree';
import type { OctreeCutSpec } from '../../@types/octree/OctreeCutSpec';
import type { StarCatalogRuntime } from './@types/StarCatalogRuntime';
import type { OctreeChunkStream } from '../../@types/octree/OctreeChunkStream';
import { NODE_FADE_MS } from '../../data/octree/octreeNodeFade';
import { STAR_PLAN_INTERVAL_FRAMES } from '../../data/starPlanIntervalFrames';
import { starCutInputs } from './render/cut/starCutInputs';
import { sameOctreeCut } from '../../utils/octree/sameOctreeCut';
import { resizeStarPools } from './load/resizeStarPools';
import { planOctreeChunks } from '../../utils/octree/planOctreeChunks';
import type { StarColumns } from '../../@types/data/starCatalog/StarColumns';

export function starCatalogPlanner(
  runtime: StarCatalogRuntime,
): Extract<FrameContentPlanner<void, 'starCatalog'>, { scope: 'once' }> {
  let anchor: OctreeCutSpec | null = null;
  let changedAtMs = -Infinity;
  // The pool's LRU clock; any strictly increasing count serves.
  let frameIndex = 0;
  // A landing chunk changes the cut without changing `sameOctreeCut`'s inputs.
  const seenEpoch = new WeakMap<OctreeChunkStream<StarColumns>, number>();
  // The cut and frame of the last chunk plan, and whether it left chunks wanted.
  let plannedCut: OctreeCutSpec | null = null;
  let plannedFrame = 0;
  let wantedChunks = false;
  let recutLast = true;
  // The debug chunk-pool size last applied; a change re-installs the pools from the loaded octrees.
  let appliedSlots: number | null = null;
  const observeEpoch = (stream: OctreeChunkStream<StarColumns>): boolean => {
    const epoch = stream.epoch();
    if (seenEpoch.get(stream) === epoch) return false;
    seenEpoch.set(stream, epoch);
    return true;
  };
  return {
    name: 'star-catalog',
    scope: 'once',
    fade: 'starCatalog',
    plan(_snapshot: ReadyFrameContext, views: readonly FrameView[], state: PassState, fade) {
      const slotsOverride = state.settings.starCatalogs.chunkSlotsOverride;
      if (slotsOverride !== appliedSlots) {
        appliedSlots = slotsOverride;
        runtime.publish({ chunkSlotsError: resizeStarPools(runtime, slotsOverride) });
        plannedCut = null; // the new streams know nothing of the last plan
      }
      const inputs = starCutInputs(runtime, state.settings.starCatalogs, fade, views);
      const nowMs = views[0]!.snapshot.nowMs;
      if (nowMs < changedAtMs) changedAtMs = nowMs;
      frameIndex++;

      let inFlight = 0;
      let residencyChanged = false;
      if (inputs === null) plannedCut = null;
      else {
        const streams: { stream: OctreeChunkStream<StarColumns>; octree: Octree<StarColumns> }[] =
          [];
        for (const { source, octree } of runtime.renderer.loadedCatalogs()) {
          const stream = runtime.chunkStreams.get(source);
          if (stream === undefined || !inputs.cut.sources.some((s) => s.source === source)) {
            continue;
          }
          streams.push({ stream, octree });
          residencyChanged ||= observeEpoch(stream);
        }
        // Between plans the pool keeps its last requests. A landing or eviction re-plans at
        // once; a moved cut, or chunks wanted or in flight, every STAR_PLAN_INTERVAL_FRAMES, so
        // a moving eye pays one plan per interval and a stopped one still gets a plan at rest.
        for (const { stream } of streams) inFlight += stream.inFlightCount();
        const due =
          plannedCut === null ||
          residencyChanged ||
          (frameIndex - plannedFrame >= STAR_PLAN_INTERVAL_FRAMES &&
            (wantedChunks || inFlight > 0 || !sameOctreeCut(inputs.cut, plannedCut)));
        if (due) {
          plannedCut = inputs.cut;
          plannedFrame = frameIndex;
          wantedChunks = false;
          for (const { stream, octree } of streams) {
            const { touched, requests } = planOctreeChunks(
              octree,
              inputs.cut,
              stream.resident,
              stream.hasFailed,
              stream.slots,
            );
            stream.update(frameIndex, touched, requests);
            wantedChunks ||= requests.length > 0;
          }
          // The update may have enqueued fetches or evicted for them.
          inFlight = 0;
          for (const { stream } of streams) {
            inFlight += stream.inFlightCount();
            residencyChanged ||= observeEpoch(stream);
          }
        }
      }

      // A moving cut re-cuts every other frame: the kept lists still draw about this frame's
      // eye, and a skipped frame's fade time rides the next cut's step. A landing re-cuts at once.
      let moving = false;
      if (inputs === null) anchor = null;
      else if (residencyChanged || anchor === null || !sameOctreeCut(inputs.cut, anchor)) {
        moving = anchor !== null && !residencyChanged;
        anchor = inputs.cut;
        changedAtMs = nowMs;
      }
      const recut = !(moving && recutLast);
      recutLast = recut;
      runtime.renderer.setFrameCut(inputs, recut);
      const awake = inputs !== null && (nowMs - changedAtMs < NODE_FADE_MS || inFlight > 0);
      return { value: undefined, awake, settling: false };
    },
  };
}
