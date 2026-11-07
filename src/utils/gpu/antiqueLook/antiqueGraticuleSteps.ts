/**
 * antiqueGraticuleSteps — one RA and one Dec ruling interval for the whole
 * plate, judged at the view's centre, so every meridian runs edge to edge (a
 * per-pixel choice stopped and started them mid-field) and the border can be
 * numbered exactly where the rulings meet it.
 */

import type { ViewBasis } from '../../../@types/camera/projection/ViewBasis';
import type { ViewFrustum } from '../../../@types/camera/projection/ViewFrustum';
import type { Size } from '../../../@types/rendering/Size';
import {
  ANTIQUE_RULING_STEPS_DEG,
  ANTIQUE_RULING_GAP_UNITS,
} from '../../../data/rendering/antiqueLook';

export function antiqueGraticuleSteps(
  basis: ViewBasis,
  frustum: ViewFrustum,
  size: Size,
  unitPx: number,
): { readonly raDeg: number; readonly decDeg: number } {
  const radPerPx = (frustum.tanUp - frustum.tanDown) / size.height;
  const degPerPx = (radPerPx * 180) / Math.PI;
  const f = basis.forward;
  const cosDec = Math.max(Math.hypot(f[0], f[1]) / Math.hypot(f[0], f[1], f[2]), 0.05);
  const want = ANTIQUE_RULING_GAP_UNITS * unitPx * degPerPx;
  const pick = (deg: number): number => ANTIQUE_RULING_STEPS_DEG.find((s) => s >= deg) ?? 90;
  return { raDeg: pick(want / cosDec), decDeg: pick(want) };
}
