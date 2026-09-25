/**
 * blackHoleLensEnvelopeM — a hole's lens covering radius, in metres, as
 * `bodyDrawRadiusM`'s envelope row sees it: a ray is lensed exactly when its
 * impact parameter is under `edgeFadeEndRs`, so the sphere of that radius
 * around the hole IS the envelope every drawn ray needs a body's slab near
 * plane and visibility culls to know about (the lens pass itself is a
 * per-view fullscreen triangle, so there is no billboard geometry to
 * bound). Zero outside the row's capture band, where the pass never draws.
 */

import type { SlabRow } from '../../../@types/engine/frame/SlabRow';
import type { BlackHoleRow } from '../@types/BlackHoleRow';
import { SCALE_UNITS } from '../../../data/scaleUnits';
import { CUBEMAP_CAPTURES } from '../../../data/rendering/cubemapCaptures';
import { schwarzschildRadiusM } from '../../../utils/physics/schwarzschildRadiusM';
import { lensEdgeFadeEndRs } from '../../../utils/lensing/lensEdgeFadeEndRs';
import { MAX_IMPACT_PARAM_RS } from '../../../data/lensing/schwarzschildLutDomain';

export function blackHoleLensEnvelopeM(row: BlackHoleRow): SlabRow['drawRadiusM'] {
  const schwarzschildM = schwarzschildRadiusM(row.massSolar);
  const band = CUBEMAP_CAPTURES[row.capture].band;

  return (distM: number, pxPerRad: number): number => {
    const distMpc = distM * SCALE_UNITS.M_TO_MPC;
    if (distMpc >= band.goneAt) return 0;

    const distRs = distM / schwarzschildM;
    return lensEdgeFadeEndRs(distRs, pxPerRad, MAX_IMPACT_PARAM_RS) * schwarzschildM;
  };
}
