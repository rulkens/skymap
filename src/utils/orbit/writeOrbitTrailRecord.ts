/**
 * writeOrbitTrailRecord — packs one conic into the orbit-trail renderer's 46-float instance record
 * at `out[base..)`, or writes nothing and returns false when the orbit is deep sub-pixel or wholly
 * behind the camera. Byte offsets mirror the renderer's INSTANCE_ATTRIBUTES:
 *   floats 0..11  — the three Ginv columns (loc1/2/3 at byte 0/16/32)
 *   floats 12..15 — colour.rgb + eccentricity (loc4 at byte 48)
 *   floats 16..19 — mean anomaly + fade alpha + viewportPx.xy (loc5 at byte 64)
 *   floats 20..31 — clip basis Cc/Ac/Bc (loc6/7/8 at byte 80/96/112)
 *   floats 32..33 — the visible arc eStart/eSpan (loc9 at byte 128)
 *   floats 34..45 — eye-relative 3D basis, km (loc10/11/12 at byte 136/152/168)
 * HARD INVARIANT: `slabVp` is `view.slab.vp`, NOT `view.vp` (see `composeOrbitConic`).
 */

import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';
import { RENDER_ORIGIN_MPC } from '../../data/renderOrigin';
import { CULL_PX, FULL_PX } from '../../data/bodies/orbitTrailConstants';
import { composeOrbitConic } from '../camera/composeOrbitConic';
import { apparentSizePx } from '../math/apparentSizePx';
import { eyeRelativeOrbitBasisKm } from './eyeRelativeOrbitBasisKm';

export function writeOrbitTrailRecord(
  input: {
    readonly slabVp: Float64Array;
    readonly viewportPx: Readonly<Vec2>;
    readonly eyeMpc: Readonly<Vec3>;
    readonly pxPerRad: number;
    readonly centerMpc: Readonly<Vec3>;
    readonly semiMajorMpc: Readonly<Vec3>;
    readonly semiMinorMpc: Readonly<Vec3>;
    readonly eccentricity: number;
    readonly meanAnomalyRad: number;
    readonly color: Readonly<Vec3>;
    readonly fade: number;
  },
  out: Float32Array,
  base: number,
): boolean {
  const { eyeMpc, centerMpc, semiMajorMpc, semiMinorMpc, viewportPx } = input;
  const distanceMpc = Math.hypot(
    centerMpc[0] - eyeMpc[0],
    centerMpc[1] - eyeMpc[1],
    centerMpc[2] - eyeMpc[2],
  );
  const semiMajorLenMpc = Math.hypot(semiMajorMpc[0], semiMajorMpc[1], semiMajorMpc[2]);
  const diameterPx = apparentSizePx({
    diameterKpc: 2 * semiMajorLenMpc * 1000,
    distanceMpc,
    pxPerRad: input.pxPerRad,
  });
  if (diameterPx < CULL_PX) return false;
  const alpha = Math.min(1, (diameterPx - CULL_PX) / (FULL_PX - CULL_PX)) * input.fade;

  const { ginv, clipBasis, arc } = composeOrbitConic(
    input.slabVp,
    centerMpc,
    semiMajorMpc,
    semiMinorMpc,
    viewportPx,
    RENDER_ORIGIN_MPC,
  );
  if (arc[1] <= 0) return false;
  out.set(ginv, base);
  out[base + 12] = input.color[0];
  out[base + 13] = input.color[1];
  out[base + 14] = input.color[2];
  out[base + 15] = input.eccentricity;
  out[base + 16] = input.meanAnomalyRad;
  out[base + 17] = alpha;
  out[base + 18] = viewportPx[0]; // ribbon vertex stage's divisor
  out[base + 19] = viewportPx[1];
  out.set(clipBasis[0], base + 20);
  out.set(clipBasis[1], base + 24);
  out.set(clipBasis[2], base + 28);
  out[base + 32] = arc[0];
  out[base + 33] = arc[1];
  eyeRelativeOrbitBasisKm({ eyeMpc, centerMpc, semiMajorMpc, semiMinorMpc }, out, base + 34);
  return true;
}
