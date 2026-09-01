/**
 * reanchoredPose — shrink a body-fixed pose's stored magnitudes by moving the
 * anchor toward the eye (spec §5.3), keeping `anchor + eyeRel` naming the same
 * point. Built now for the deep-zoom anchors that want it; the shipped centre
 * anchor (`[0,0,0]`) has zero magnitude and so never crosses the trigger below.
 *
 * The shift is quantized to the ulp grid of `|anchorLocalM|` first:
 * `anchorLocalM + d` then lands on a grid it already occupies (no rounding),
 * and `eyeRelAnchorM − d` is just that grid's remainder (exact) — so
 * `anchor + eyeRel` rounds to the identical bit pattern before and after.
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../@types/math/Vec3';

// Below this fraction of |anchorLocalM|, the remaining range is close enough
// to the anchor's own ulp floor (spec §5.3: ~1nm at Earth-radius magnitude)
// that re-anchoring buys headroom before that floor becomes visible.
const TRIGGER_FRACTION = 1e-3;

/**
 * `nextafter(magnitude) - magnitude`, via direct mantissa increment rather
 * than `Math.log2` — a power-of-two magnitude can land one ulp short of
 * `log2`'s true value (see `earthLevelFittingWidth`'s header), which would
 * pick a grid one binade off and break the exactness this function exists for.
 */
function ulpAt(magnitude: number): number {
  if (magnitude === 0) return 0;
  const buf = new ArrayBuffer(8);
  const view = new DataView(buf);
  view.setFloat64(0, magnitude);
  const lo = (view.getUint32(4) + 1) >>> 0;
  view.setUint32(4, lo);
  if (lo === 0) view.setUint32(0, (view.getUint32(0) + 1) >>> 0);
  return view.getFloat64(0) - magnitude;
}

export function reanchoredPose(pose: BodyFixedPose): BodyFixedPose {
  const { anchorLocalM, eyeRelAnchorM } = pose;
  const anchorMagM = Math.hypot(anchorLocalM[0], anchorLocalM[1], anchorLocalM[2]);
  const rangeM = Math.hypot(eyeRelAnchorM[0], eyeRelAnchorM[1], eyeRelAnchorM[2]);
  if (rangeM >= anchorMagM * TRIGGER_FRACTION) return pose;

  const grid = ulpAt(anchorMagM);
  const d: Vec3 = [
    Math.round(eyeRelAnchorM[0] / grid) * grid,
    Math.round(eyeRelAnchorM[1] / grid) * grid,
    Math.round(eyeRelAnchorM[2] / grid) * grid,
  ];

  return {
    ...pose,
    anchorLocalM: [anchorLocalM[0] + d[0], anchorLocalM[1] + d[1], anchorLocalM[2] + d[2]],
    eyeRelAnchorM: [eyeRelAnchorM[0] - d[0], eyeRelAnchorM[1] - d[1], eyeRelAnchorM[2] - d[2]],
  };
}
