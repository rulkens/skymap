/**
 * star — turns one generated `FamousStarRow` into a drawable `StarBody`.
 *
 * The star table is now GENERATED from the seed JSON, so the maker no longer
 * names authored columns for legibility — it converts each row's catalogue units
 * into the canonical draw-space frame at a single boundary:
 *
 *   - RA/Dec/distance → `positionMpc` via `raDecDistToCartesian`, the same
 *     right-handed equatorial J2000 conversion the galaxy build pipeline uses,
 *     so the seeded neighbourhood is not rotated against the real sky.
 *   - `temperatureK` → linear-RGB `color` along the blackbody locus
 *     (`temperatureToLinearRgb`), replacing the retired spectral-class palette
 *     buckets — every star is now tinted from its own effective temperature.
 *   - `radiusSolar` → `radiusKm` against the Sun's real radius, retiring the
 *     old one-solar-radius placeholder every star used to carry.
 *
 * Lives beside `SCENE_STARS` in `makers/` rather than in `src/utils/`: it is
 * authoring policy, has a single consumer (the stars table), and maker and
 * table change together.
 */

import { SCALE_UNITS } from '../../scaleUnits';
import { raDecDistToCartesian } from '../../../utils/math/raDecDistToCartesian';
import { temperatureToLinearRgb } from '../../../utils/color/temperatureToLinearRgb';
import type { FamousStarRow } from '../../../@types/data/FamousStarRow';
import type { StarBody } from '../../../@types/scene/StarBody';

// The Sun's real radius in kilometres — the anchor `radiusSolar` scales from.
// Module-local to the maker: `star()` is its only reader, and it cannot live in
// the stars table file without a circular import.
const SOLAR_RADIUS_KM = 696340;

export function star(row: FamousStarRow): StarBody {
  return {
    id: row.id,
    label: row.commonName,
    positionMpc: raDecDistToCartesian(
      row.raDeg,
      row.decDeg,
      row.distancePc * SCALE_UNITS.PC_TO_MPC,
    ),
    absMag: row.absMag,
    color: temperatureToLinearRgb(row.temperatureK),
    radiusKm: row.radiusSolar * SOLAR_RADIUS_KM,
    // Absent oblateness stays absent — no `oblateness: undefined` key.
    ...(row.oblateness !== undefined ? { oblateness: row.oblateness } : {}),
  };
}
