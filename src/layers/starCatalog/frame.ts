/**
 * starCatalogPlanner — the Layer's once-per-frame CPU row: reduce the frame to
 * the GPU cut's inputs and set them on the renderer for `star-cut` to encode
 * and every real-frame pass to draw. The cut and its LOD fades live on the GPU,
 * so the wake vote is a clock: the fades can still be moving for `NODE_FADE_MS`
 * after the last frame whose inputs differed from the one before. `settling:
 * false` always: a capture face draws its own fade-less cut.
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { FrameView } from '../../@types/engine/frame/FrameView';
import type { PassState } from '../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';
import type { StarCatalogRuntime } from './@types/StarCatalogRuntime';
import { NODE_FADE_MS } from '../../data/starNodeFade';
import { starCutFrame } from './render/cut/starCutFrame';
import { sameStarCut } from './render/cut/sameStarCut';

export function starCatalogPlanner(
  runtime: StarCatalogRuntime,
): Extract<FrameContentPlanner<void>, { scope: 'once' }> {
  let changedAtMs = -Infinity;
  return {
    name: 'star-catalog',
    scope: 'once',
    plan(_snapshot: ReadyFrameContext, views: readonly FrameView[], state: PassState) {
      const frame = starCutFrame(runtime, state.settings.starCatalogs, views);
      const nowMs = views[0]!.snapshot.nowMs;
      if (!sameStarCut(frame, runtime.renderer.getFrameCut())) changedAtMs = nowMs;
      runtime.renderer.setFrameCut(frame);
      const awake = frame !== null && nowMs - changedAtMs < NODE_FADE_MS;
      return { value: undefined, awake, settling: false };
    },
  };
}
