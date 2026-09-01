/**
 * reanchoredPose — moves a body-fixed pose's anchor toward the eye (spec
 * §5.3), keeping `anchor + eyeRel` bit-identical while both magnitudes
 * shrink. Quantizing the shift to ulp(|anchorLocalM|) first makes both
 * `anchor + d` and `eyeRel − d` exact on that grid, so the sum rounds
 * identically before and after. `[0,0,0]` (body centre) has zero magnitude,
 * so it never crosses the trigger below.
 */

import type { BodyFixedPose } from '../../@types/camera/BodyFixedPose';
import type { Vec3 } from '../../@types/math/Vec3';

// ulp(anchor) starts to matter below this fraction of |anchorLocalM| (spec
// §5.3: ~1nm at Earth-radius magnitude) — re-anchor ahead of that floor.
const TRIGGER_FRACTION = 1e-3;

/**
 * `nextafter(magnitude) - magnitude` via mantissa increment — `Math.log2`
 * can miss a power-of-two boundary by one ulp (`earthLevelFittingWidth`).
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
