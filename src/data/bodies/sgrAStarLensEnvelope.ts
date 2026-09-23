/**
 * sgrAStarLensEnvelope — the Sgr A* lens's covering radius, in metres, as
 * `bodyDrawRadiusM`'s envelope row sees it: a ray is lensed exactly when its
 * impact parameter is under `edgeFadeEndRs`, so the sphere of that radius
 * around the hole IS the envelope every drawn ray needs a body's slab near
 * plane and visibility culls to know about (the lens pass itself is a
 * per-view fullscreen triangle, so there is no billboard geometry to
 * bound). Zero outside the lensing fade band, where the pass never draws.
 */

import { SCALE_UNITS } from '../scaleUnits';
import { SCALE_FADE_BANDS } from '../../services/engine/presentation/scaleFadeBands';
import { schwarzschildRadiusM } from '../../utils/physics/schwarzschildRadiusM';
import { lensEdgeFadeEndRs } from '../../utils/lensing/lensEdgeFadeEndRs';
import { MAX_IMPACT_PARAM_RS } from '../lensing/schwarzschildLutDomain';
import { SGR_A_STAR_MASS_SOLAR } from './sgrAStarMassSolar';

const SCHWARZSCHILD_RADIUS_M = schwarzschildRadiusM(SGR_A_STAR_MASS_SOLAR);

export function sgrAStarLensEnvelopeM(distM: number, pxPerRad: number): number {
  const distMpc = distM * SCALE_UNITS.M_TO_MPC;
  if (distMpc >= SCALE_FADE_BANDS.sgrAStarLensing.goneAt) return 0;

  const distRs = distM / SCHWARZSCHILD_RADIUS_M;
  return lensEdgeFadeEndRs(distRs, pxPerRad, MAX_IMPACT_PARAM_RS) * SCHWARZSCHILD_RADIUS_M;
}
