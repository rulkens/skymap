/**
 * sampledDepthKmFrame — the `{ sample }` step's depth row resolved into the
 * pair a fragment unprojects its texels with. Null for any row that cannot be
 * unprojected (no row, a non-`body-m` frame, a body this frame cannot pose);
 * callers must then bind the far-cleared placeholder, so the shader's
 * `FAR_DEPTH` early-out — not an assumption about who cleared what — is what
 * keeps an unresolved frame safe.
 */

import { mat4d } from 'wgpu-matrix';

import type { ReadyFrameContext } from '../../@types/engine/frame/ReadyFrameContext';
import type { SampledDepthKmFrame } from '../../@types/rendering/SampledDepthKmFrame';
import type { Slab } from '../../@types/engine/frame/Slab';
import { composeBodySlabMvp } from './composeBodySlabMvp';
import { bodySlabCamLocal } from './bodySlabCamLocal';
import { narrowMat4 } from '../math/narrowMat4';
import { SCALE_UNITS } from '../../data/scaleUnits';

export function sampledDepthKmFrame(
  row: Slab | null,
  bodyPose: ReadyFrameContext['bodyPose'],
): SampledDepthKmFrame | null {
  if (row === null || row.frame.kind !== 'body-m') return null;
  const pose = bodyPose(row.frame.bodyId);
  if (pose === null) return null;
  // The row's OWN f64 vp, scaled by metres-per-km so the reconstructed
  // distances land in the km the callers measure their subjects in.
  return {
    invMvp: narrowMat4(
      mat4d.inverse(composeBodySlabMvp(row.vp, pose.eyeRelBodyM, SCALE_UNITS.KM_TO_M)),
    ),
    camPosKm: bodySlabCamLocal(pose.eyeRelBodyM, SCALE_UNITS.KM_TO_M),
  };
}
