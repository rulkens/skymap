/**
 * bodySlabFlooredPick — the metre-native twin of `drawFlooredSpherePick`, for
 * a body-m row's pick pass: floor the pick radius to the shared clickable
 * minimum, compose the mvp/camPosLocal PAIR from that SAME floored radius
 * (the invariant `drawFlooredSpherePick`'s header names — a mismatched pair
 * would shrink the apparent pick disc back below the floor), and narrow for
 * the GPU upload. `earthLayer` and `planetsLayer` each carried this exact
 * recipe inline; `view.slab.vp` there is eye-relative metres, not
 * `drawFlooredSpherePick`'s Mpc/world-relative frame, so that helper doesn't
 * apply here — this one composes via `composeBodySlabMvp`/`bodySlabCamLocal`
 * instead.
 *
 * The floored `pickRadiusM` can exceed `bodySlabRow`'s near-plane margin for a
 * small, distant body, pushing the proxy's near cap in front of the row's own
 * near plane — safe ONLY because `bodyPickRenderer`'s sphere pipeline culls
 * FRONT faces, so the clipped near cap is never the fragment that's rasterised.
 */

import type { Vec3 } from '../../../@types/math/Vec3';
import { composeBodySlabMvp } from '../../../utils/camera/composeBodySlabMvp';
import { bodySlabCamLocal } from '../../../utils/camera/bodySlabCamLocal';
import { narrowMat4 } from '../../../utils/math/narrowMat4';
import { BODY_PICK_MIN_RADIUS_PX } from './minPickRadiusMpc';

export function bodySlabFlooredPick(
  slabVp: Float64Array,
  eyeRelBodyM: Readonly<Vec3>,
  radiusM: number,
  drawPxPerRad: number,
): { readonly mvp: Float32Array; readonly camPosLocal: Vec3 } {
  const dM = Math.hypot(eyeRelBodyM[0], eyeRelBodyM[1], eyeRelBodyM[2]);
  const pickRadiusM = Math.max(radiusM, (BODY_PICK_MIN_RADIUS_PX / drawPxPerRad) * dM);
  const mvp = composeBodySlabMvp(slabVp, eyeRelBodyM, pickRadiusM);
  const camPosLocal = bodySlabCamLocal(eyeRelBodyM, pickRadiusM);
  return { mvp: narrowMat4(mvp), camPosLocal };
}
