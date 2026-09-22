/**
 * starCatalogPlanner — the Layer's once-per-frame CPU planning row: advance
 * the LOD fade ramps once, then set the resulting cut on the renderer for
 * every real-frame pass to read (`starCutFor`). `settling: false` always: a
 * capture face walks fresh at opacity 1 (`computeStarCut`'s capture path), so
 * a mid-fade frame view can never stale a sky bake.
 */

import type { FrameContentPlanner } from '../../@types/engine/frame/FrameContentPlanner';
import type { FrameView } from '../../@types/engine/frame/FrameView';
import type { PassState } from '../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';
import type { StarCatalogRuntime } from './@types/StarCatalogRuntime';
import { advanceStarFades } from './render/cut/advanceStarFades';
import { computeStarCut } from './render/cut/computeStarCut';

export function starCatalogPlanner(
  runtime: StarCatalogRuntime,
): Extract<FrameContentPlanner<void>, { scope: 'once' }> {
  return {
    name: 'star-catalog',
    scope: 'once',
    plan(_snapshot: ReadyFrameContext, views: readonly FrameView[], state: PassState) {
      const awake = advanceStarFades(runtime, state.settings.starCatalogs, views);
      runtime.renderer.setFrameCut(computeStarCut(runtime, state.settings.starCatalogs, views));
      return { value: undefined, awake, settling: false };
    },
  };
}
