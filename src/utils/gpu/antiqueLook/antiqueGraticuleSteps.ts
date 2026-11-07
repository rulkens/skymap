/**
 * antiqueGraticuleSteps — one longitude and one latitude rung of
 * `ANTIQUE_RULING_STEPS` for a whole ruling frame, judged at one anchor ray,
 * so every meridian runs edge to edge (a per-pixel choice stopped and started
 * them mid-field) and the border is numbered where the rulings meet it. The
 * anchor is the view's centre or, for a globe the centre misses, the ray to the
 * globe's centre. The rung is read off the coordinate's change across one pixel
 * there, so longitude widens toward the pole and a globe's net with distance.
 */

import type { ViewBasis } from '../../../@types/camera/projection/ViewBasis';
import type { ViewFrustum } from '../../../@types/camera/projection/ViewFrustum';
import type { Vec3 } from '../../../@types/math/Vec3';
import type { AntiqueRulingFrame } from '../../../@types/rendering/AntiqueRulingFrame';
import type { AntiqueRulingStep } from '../../../@types/rendering/AntiqueRulingStep';
import type { Size } from '../../../@types/rendering/Size';
import {
  ANTIQUE_RULING_GAP_UNITS,
  ANTIQUE_RULING_STEPS,
} from '../../../data/rendering/antiqueRulings';
import { rayThroughPx } from '../../camera/projection/rayThroughPx';
import { cross3 } from '../../math/cross3';
import { normalize3 } from '../../math/normalize3';
import { rulingLonLat } from './rulingLonLat';

const COARSEST = ANTIQUE_RULING_STEPS[ANTIQUE_RULING_STEPS.length - 1]!;

export function antiqueGraticuleSteps(
  frame: Pick<AntiqueRulingFrame, 'axes' | 'lonOffsetDeg' | 'globeCentre'>,
  basis: ViewBasis,
  frustum: ViewFrustum,
  size: Size,
  unitPx: number,
): { readonly lon: AntiqueRulingStep; readonly lat: AntiqueRulingStep } {
  const c = frame.globeCentre;
  const centre = rayThroughPx([size.width / 2, size.height / 2], basis, frustum, size);
  const anchor = c !== null && rulingLonLat(frame, centre) === null ? c : centre;
  // Turn the anchor by one pixel's angle at the centre, both ways across it.
  const radPerPx = (frustum.tanUp - frustum.tanDown) / size.height;
  const n = normalize3(anchor);
  const across = cross3(n, basis.up);
  const e1 = Math.hypot(...across) > 1e-6 ? normalize3(across) : basis.right;
  const e2 = cross3(e1, n);
  const nudged = (e: Readonly<Vec3>) =>
    rulingLonLat(frame, [n[0] + e[0] * radPerPx, n[1] + e[1] * radPerPx, n[2] + e[2] * radPerPx]);
  const x = nudged(e1);
  const y = nudged(e2);
  const o = rulingLonLat(frame, n);
  if (o === null || x === null || y === null) return { lon: COARSEST, lat: COARSEST };
  const wrap = (deg: number) => deg - 360 * Math.round(deg / 360);
  const lonPerPx = Math.hypot(wrap(x[0] - o[0]), wrap(y[0] - o[0]));
  const latPerPx = Math.hypot(x[1] - o[1], y[1] - o[1]);
  const gapPx = ANTIQUE_RULING_GAP_UNITS * unitPx;
  const pick = (deg: number) => ANTIQUE_RULING_STEPS.find((r) => r.stepDeg >= deg) ?? COARSEST;
  return { lon: pick(gapPx * lonPerPx), lat: pick(gapPx * latPerPx) };
}
