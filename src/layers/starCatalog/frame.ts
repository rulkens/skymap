/**
 * starCatalogPlanner — the Layer's once-per-frame CPU row: reduce the frame to
 * the GPU cut's inputs and set them on the renderer for `star-cut` to encode
 * and every pass to draw (capture faces read it too). The cut and its LOD fades
 * live on the GPU, so the wake vote is a timer: the fades can still be moving
 * for `NODE_FADE_MS` after the cut last moved past a slack from where the timer
 * armed. `settling: false` always: a capture face draws its own fade-less cut.
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { FrameView } from '../../@types/engine/frame/FrameView';
import type { PassState } from '../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';
import type { StarCutSpec } from './@types/StarCutSpec';
import type { StarCatalogRuntime } from './@types/StarCatalogRuntime';
import { NODE_FADE_MS } from '../../data/starNodeFade';
import { starCutInputs } from './render/cut/starCutInputs';
import { sameStarCut } from './render/cut/sameStarCut';

export function starCatalogPlanner(
  runtime: StarCatalogRuntime,
): Extract<FrameContentPlanner<void>, { scope: 'once' }> {
  let anchor: StarCutSpec | null = null;
  let changedAtMs = -Infinity;
  return {
    name: 'star-catalog',
    scope: 'once',
    plan(_snapshot: ReadyFrameContext, views: readonly FrameView[], state: PassState) {
      const inputs = starCutInputs(runtime, state.settings.starCatalogs, views);
      const nowMs = views[0]!.snapshot.nowMs;
      if (nowMs < changedAtMs) changedAtMs = nowMs;
      if (inputs === null) anchor = null;
      else if (anchor === null || !sameStarCut(inputs.cut, anchor)) {
        anchor = inputs.cut;
        changedAtMs = nowMs;
      }
      runtime.renderer.setFrameCut(inputs);
      const awake = inputs !== null && nowMs - changedAtMs < NODE_FADE_MS;
      return { value: undefined, awake, settling: false };
    },
  };
}
