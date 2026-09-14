/**
 * atmosphereShellUniforms — the entry→`AtmosphereUniforms` mapping, one contract
 * shared by every consumer of that record: a second builder is the drift
 * `packAtmosphereUniforms` exists to prevent, one level up. The MVP pair rides
 * the slab's f64 `vp` and the SAME `ctx.bodyPose` closure `deriveSlabs` built
 * that `vp` from (see `composeBodySlabMvp`).
 */

import type { AtmosphereDrawEntry } from '../../../@types/engine/frame/AtmosphereDrawEntry';
import type { BodyId } from '../../../@types/data/body/BodyId';
import type { PassState } from '../../../@types/engine/frame/PassState';
import type { ReadyFrameContext } from '../../../@types/engine/frame/ReadyFrameContext';
import type { Slab } from '../../../@types/engine/frame/Slab';
import { mat4d } from 'wgpu-matrix';
import { SCENE_RINGS } from '../../../data/bodies/sceneRings';
import { composeBodySlabMvp } from '../../../utils/camera/composeBodySlabMvp';
import { packAtmosphereUniforms } from '../../../utils/gpu/packAtmosphereUniforms';
import { narrowMat4 } from '../../../utils/math/narrowMat4';

export function atmosphereShellUniforms(
  entry: AtmosphereDrawEntry,
  slab: Slab,
  ctx: ReadyFrameContext,
  state: PassState,
): Float32Array {
  const { body, params, atmosphereTopM, camLocal, sunLocal } = entry;
  const pose = ctx.bodyPose(body.id as BodyId);
  if (pose === null) {
    throw new Error(
      `atmosphereShellUniforms: no pose for body '${body.id}' — an entry exists only where ctx.bodyPose resolved`,
    );
  }

  // Scaling the unit proxy sphere by the ATMOSPHERE-TOP radius (metres) puts the
  // mesh in the body-m slab frame's unit — the one `camLocal` is already in.
  const mvp = composeBodySlabMvp(slab.vp, pose.eyeRelBodyM, atmosphereTopM);
  // Inverted from the UN-narrowed f64 mvp (dst-last, fresh Float64Array) for the
  // inside-shell entry points' screen→local unproject. Narrowing first would
  // reintroduce the per-element rounding the slab seam exists to avoid.
  const invMvp = mat4d.inverse(mvp);
  // Ground/atmosphere-top radius ratio ∈ (0,1): in the proxy's local frame the
  // atmosphere top is the unit sphere and the ground sphere has this radius.
  const bottomRadius = params.planetRadiusKm / params.atmosphereTopKm;
  // The one Earth-keyed branch: Earth alone carries a live Settings slider, read
  // from the store each frame so a drag overrides the limb without a reload.
  const exposure = body.id === 'earth' ? state.settings.earth.atmosphereExposure : params.exposure;
  // The host's ring annulus in LOCAL units (atmosphere top = 1), so the fragment
  // can keep a ring in FRONT of the shell from being darkened by its over-blend.
  // No `SCENE_RINGS` row ⇒ both ratios 0, the no-ring sentinel.
  const ring = SCENE_RINGS.find((r) => r.bodyId === body.id);
  const ringInnerRatio = ring === undefined ? 0 : ring.innerRadiusKm / params.atmosphereTopKm;
  const ringOuterRatio = ring === undefined ? 0 : ring.outerRadiusKm / params.atmosphereTopKm;

  return packAtmosphereUniforms(
    // Narrow here, at the GPU uniform write — composeBodySlabMvp returns f64.
    narrowMat4(mvp),
    narrowMat4(invMvp),
    sunLocal,
    camLocal,
    bottomRadius,
    exposure,
    ringInnerRatio,
    ringOuterRatio,
  );
}
