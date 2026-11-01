/**
 * atmosphereShellUniforms — the entry→`AtmosphereUniforms` mapping shared by every
 * consumer of that record; a second builder would drift. The MVP pair rides the slab's
 * f64 `vp` and the SAME `ctx.bodyPose` closure `deriveSlabs` built it from.
 */

import type { AtmosphereDrawEntry } from '../@types/AtmosphereDrawEntry';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { FrameView } from '../../../@types/engine/frame/FrameView';
import type { Slab } from '../../../@types/engine/frame/Slab';
import { mat4d } from 'wgpu-matrix';
import { FROXEL_SLICE_KM } from './froxelVolume';
import { SCENE_RINGS } from '../../../data/bodies/sceneRings';
import { composeBodySlabMvp } from '../../../utils/camera/composeBodySlabMvp';
import { packAtmosphereUniforms } from '../render/packAtmosphereUniforms';
import { narrowMat4 } from '../../../utils/math/narrowMat4';

export function atmosphereShellUniforms(
  entry: AtmosphereDrawEntry,
  slab: Slab,
  ctx: FrameView,
  state: PassState,
): Float32Array {
  const { body, params, atmosphereTopM, camLocal, sunLocal } = entry;
  // An entry exists only where bodyPose resolved (atmosphereDrawList skips a body with no pose).
  const pose = ctx.bodyPose(body.id)!;

  const mvp = composeBodySlabMvp(slab.vp, pose.eyeRelBodyM, atmosphereTopM);
  // Inverted before narrowing (see narrowMat4).
  const invMvp = mat4d.inverse(mvp);
  // Ground/atmosphere-top radius ratio ∈ (0,1): in the proxy's local frame the
  // atmosphere top is the unit sphere and the ground sphere has this radius.
  const bottomRadius = params.planetRadiusKm / params.atmosphereTopKm;
  // Earth alone has a live exposure slider.
  const exposure = body.id === 'earth' ? state.settings.earth.atmosphereExposure : params.exposure;
  // Ring annulus in LOCAL units (atmosphere top = 1); no `SCENE_RINGS` row ⇒ both
  // ratios 0, the no-ring sentinel — keeps a ring in front of the shell unblended.
  const ring = SCENE_RINGS.find((r) => r.bodyId === body.id);
  const ringInnerRatio = ring === undefined ? 0 : ring.innerRadiusKm / params.atmosphereTopKm;
  const ringOuterRatio = ring === undefined ? 0 : ring.outerRadiusKm / params.atmosphereTopKm;

  return packAtmosphereUniforms(
    narrowMat4(mvp),
    narrowMat4(invMvp),
    sunLocal,
    camLocal,
    bottomRadius,
    exposure,
    ringInnerRatio,
    ringOuterRatio,
    FROXEL_SLICE_KM,
  );
}
