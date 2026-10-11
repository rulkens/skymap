/**
 * starCatalogPlanner — the Layer's once-per-frame CPU row: reduce the frame to
 * the GPU cut's inputs, set them on the renderer for `star-cut` to encode and
 * every pass to draw (capture faces read it too), and plan each octree
 * source's chunks. The cut and its LOD fades live on the GPU, so the wake vote
 * is a timer: the fades can still be moving for `NODE_FADE_MS` after the cut
 * last moved past a slack, or a chunk landed or left; it also holds while a
 * chunk is in flight. `settling: false` always: a capture face draws its own
 * fade-less cut.
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { FrameView } from '../../@types/engine/frame/FrameView';
import type { PassState } from '../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';
import type { StarCutSpec } from './@types/StarCutSpec';
import type { StarCatalogRuntime } from './@types/StarCatalogRuntime';
import type { StarChunkStream } from './@types/StarChunkStream';
import { NODE_FADE_MS } from '../../data/starNodeFade';
import { starCutInputs } from './render/cut/starCutInputs';
import { sameStarCut } from './render/cut/sameStarCut';
import { planStarChunks } from '../../utils/star/planStarChunks';
import { starOctreeIndex } from '../../utils/star/starOctreeIndex';

export function starCatalogPlanner(
  runtime: StarCatalogRuntime,
): Extract<FrameContentPlanner<void>, { scope: 'once' }> {
  let anchor: StarCutSpec | null = null;
  let changedAtMs = -Infinity;
  // The pool's LRU clock; any strictly increasing count serves.
  let frameIndex = 0;
  // A landing chunk changes the cut without changing `sameStarCut`'s inputs.
  const seenEpoch = new WeakMap<StarChunkStream, number>();
  return {
    name: 'star-catalog',
    scope: 'once',
    plan(_snapshot: ReadyFrameContext, views: readonly FrameView[], state: PassState) {
      const inputs = starCutInputs(runtime, state.settings.starCatalogs, views);
      const nowMs = views[0]!.snapshot.nowMs;
      if (nowMs < changedAtMs) changedAtMs = nowMs;
      frameIndex++;

      let inFlight = 0;
      let residencyChanged = false;
      if (inputs !== null) {
        for (const { source, octree } of runtime.renderer.loadedCatalogs()) {
          const stream = runtime.chunkStreams.get(source);
          if (stream === undefined || !inputs.cut.sources.some((s) => s.source === source)) {
            continue;
          }
          const index = starOctreeIndex(octree.nodes, octree.grid);
          const { touched, requests } = planStarChunks(
            octree,
            index,
            inputs.cut,
            stream.isResident,
            stream.slots,
          );
          stream.update(frameIndex, touched, requests);
          inFlight += stream.inFlightCount();
          const epoch = stream.epoch();
          if (seenEpoch.get(stream) !== epoch) {
            seenEpoch.set(stream, epoch);
            residencyChanged = true;
          }
        }
      }

      if (inputs === null) anchor = null;
      else if (residencyChanged || anchor === null || !sameStarCut(inputs.cut, anchor)) {
        anchor = inputs.cut;
        changedAtMs = nowMs;
      }
      runtime.renderer.setFrameCut(inputs);
      const awake = inputs !== null && (nowMs - changedAtMs < NODE_FADE_MS || inFlight > 0);
      return { value: undefined, awake, settling: false };
    },
  };
}
