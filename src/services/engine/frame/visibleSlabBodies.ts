import type { BodyState } from '../../../@types/scene/BodyState';
import type { EarthBody } from '../../../@types/scene/EarthBody';
import type { PlanetBody } from '../../../@types/scene/PlanetBody';
import type { SceneBody } from '../../../@types/scene/SceneBody';
import type { Vec3 } from '../../../@types/math/Vec3';
import { bodyApparentDiameterPx } from '../../../utils/scene/bodyApparentDiameterPx';
import { SUB_PIXEL_BODY_CULL_PX } from './subPixelBodyCullPx';

/**
 * visibleSlabBodies — which of `[earth, ...planets]` get a body slab row this
 * frame: every body whose apparent diameter clears `SUB_PIXEL_BODY_CULL_PX`
 * (spec §4), the same floor `earthLayer`/`planetsLayer`/`ringsLayer` already
 * apply per-layer. A visible body always renders through its slab at every
 * distance above that floor — there is no separate activation threshold.
 *
 * A body missing from `bodyStates` (should not happen — every registry body
 * gets a snapshot entry) is dropped rather than crashing, since this feeds a
 * slab COUNT the frame program sizes a fixed pool from (spec §6).
 */
export function visibleSlabBodies(input: {
  readonly earth: EarthBody | null;
  readonly planets: readonly PlanetBody[];
  readonly bodyStates: ReadonlyMap<string, BodyState>;
  readonly camPosMpc: Readonly<Vec3>;
  readonly viewportHeightPx: number;
  readonly fovYRad: number;
}): readonly SceneBody[] {
  const { earth, planets, bodyStates, camPosMpc, viewportHeightPx, fovYRad } = input;
  const candidates: readonly SceneBody[] = earth === null ? planets : [earth, ...planets];

  return candidates.filter((body) => {
    const state = bodyStates.get(body.id);
    if (state === undefined) return false;
    const diameterPx = bodyApparentDiameterPx({
      positionMpc: state.positionMpc,
      radiusM: body.radiusM,
      camPosMpc,
      viewportHeightPx,
      fovYRad,
    });
    return diameterPx >= SUB_PIXEL_BODY_CULL_PX;
  });
}
