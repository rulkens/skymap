/**
 * frame — the Layer's per-frame prelude: advance the LOD fade ramps once,
 * then set the resulting cut on the renderer for every real-frame pass to
 * read (`starCutFor`). `settling: false` always: a capture face walks fresh
 * at opacity 1 (`computeStarCut`'s capture path), so a mid-fade frame view
 * can never stale a sky bake.
 */

import type { FrameView } from '../../@types/engine/frame/FrameView';
import type { PassState } from '../../@types/engine/frame/PassState';
import type { LayerFrameVote } from '../../@types/engine/layer/LayerFrameVote';
import type { StarCatalogRuntime } from './@types/StarCatalogRuntime';
import { advanceStarFades } from './render/cut/advanceStarFades';
import { computeStarCut } from './render/cut/computeStarCut';

export function frame(
  runtime: StarCatalogRuntime,
): (views: readonly FrameView[], state: PassState) => LayerFrameVote {
  return (views, state) => {
    const awake = advanceStarFades(runtime, state.settings.starCatalogs, views);
    runtime.renderer.setFrameCut(computeStarCut(runtime, state.settings.starCatalogs, views));
    return { awake, settling: false };
  };
}
