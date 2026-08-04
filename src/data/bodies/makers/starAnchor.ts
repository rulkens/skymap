/**
 * starAnchor — turns one generated `FamousStarRow` into its `AnchorBody`.
 *
 * A star has a position but no orbit, so it is a root of the focus graph rather
 * than a leaf: `raDecDistToCartesian` converts the row's catalogue RA/Dec at so
 * many parsecs into the canonical Megaparsec draw frame — the SAME right-handed
 * equatorial J2000 conversion the galaxy build pipeline uses, so the seeded
 * neighbourhood is not rotated against the real sky the catalogues paint.
 *
 * Split from `star` (which makes the same row's photometry) because the two
 * halves feed different tables; both stay in `makers/` as authoring policy.
 */

import { SCALE_UNITS } from '../../scaleUnits';
import { raDecDistToCartesian } from '../../../utils/math/raDecDistToCartesian';
import type { FamousStarRow } from '../../../@types/data/FamousStarRow';
import type { AnchorBody } from '../../../@types/scene/AnchorBody';

export function starAnchor(row: FamousStarRow): AnchorBody {
  return {
    id: row.id,
    positionMpc: raDecDistToCartesian(
      row.raDeg,
      row.decDeg,
      row.distancePc * SCALE_UNITS.PC_TO_MPC,
    ),
  };
}
