/**
 * sgrAStarLensQuad — the Sgr A* lens billboard's covering radius, in metres,
 * as `bodyDrawRadiusM`'s envelope row sees it: a body's slab near plane and
 * visibility culls must know about this pass's quad, which can reach up to
 * 8× the anchor distance (`lensQuadPlaneRadiusRs`'s cap), or the near plane
 * clips it and the culls drop it mid-band (fix A, dome-fisheye). Zero outside
 * the lensing fade band, where the pass never draws.
 */

import { SCALE_UNITS } from '../scaleUnits';
import { SCALE_FADE_BANDS } from '../../services/engine/presentation/scaleFadeBands';
import { schwarzschildRadiusM } from '../../utils/physics/schwarzschildRadiusM';
import { lensQuadPlaneRadiusRs } from '../../utils/lensing/lensQuadPlaneRadiusRs';
import { lensEdgeFadeEndRs } from '../../utils/lensing/lensEdgeFadeEndRs';
import { MAX_IMPACT_PARAM_RS } from '../lensing/schwarzschildLutDomain';
import { SGR_A_STAR_MASS_SOLAR } from './sgrAStarMassSolar';

/** Mirrors `LENS_QUAD_MARGIN` in `shaders/bodies/sgrAStarLensing/vertex.wesl`
 *  (parity-tested) — slack on the exact fade-covering radius so a body's own
 *  drawn envelope, not just the shader's billboard, clears the fade with room. */
export const SGR_A_STAR_LENS_QUAD_MARGIN = 1.1;

const SCHWARZSCHILD_RADIUS_M = schwarzschildRadiusM(SGR_A_STAR_MASS_SOLAR);

export function sgrAStarLensQuadRadiusM(distM: number, pxPerRad: number): number {
  const distMpc = distM * SCALE_UNITS.M_TO_MPC;
  if (distMpc >= SCALE_FADE_BANDS.sgrAStarLensing.goneAt) return 0;

  const distRs = distM / SCHWARZSCHILD_RADIUS_M;
  const edgeFadeEndRs = lensEdgeFadeEndRs(distRs, pxPerRad, MAX_IMPACT_PARAM_RS);
  return lensQuadPlaneRadiusRs(edgeFadeEndRs, distRs) * SCHWARZSCHILD_RADIUS_M * SGR_A_STAR_LENS_QUAD_MARGIN;
}
