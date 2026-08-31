/**
 * star — turns one generated `FamousStarRow` into a drawable `StarBody`.
 *
 * The star table is GENERATED from the seed JSON, so the maker no longer names
 * authored columns for legibility — it converts each row's catalogue units into
 * the canonical draw-space frame at a single boundary:
 *
 *   - `temperatureK` → linear-RGB `color` along the blackbody locus
 *     (`temperatureToLinearRgb`), replacing the retired spectral-class palette
 *     buckets — every star is tinted from its own effective temperature.
 *   - `radiusSolar` → `radiusM` against the Sun's real radius. The generated
 *     row is a wire format in km; the authored/runtime convention is metres,
 *     so this is the one place that boundary is crossed.
 *
 * The row's RA/Dec/distance are NOT read here: a star's position is a root of
 * the focus graph, so it becomes a `SCENE_ANCHORS` row via `starAnchor` rather
 * than a field on the drawn record.
 *
 * Lives beside `SCENE_STARS` in `makers/` rather than in `src/utils/`: it is
 * authoring policy, has a single consumer (the stars table), and maker and
 * table change together.
 */

import { SCALE_UNITS } from '../../scaleUnits';
import { SOLAR_RADIUS_KM } from '../solarRadiusKm';
import { temperatureToLinearRgb } from '../../../utils/color/temperatureToLinearRgb';
import type { FamousStarRow } from '../../../@types/data/FamousStarRow';
import type { StarBody } from '../../../@types/scene/StarBody';

export function star(row: FamousStarRow): StarBody {
  return {
    id: row.id,
    label: row.commonName,
    absMag: row.absMag,
    color: temperatureToLinearRgb(row.temperatureK),
    radiusM: row.radiusSolar * SOLAR_RADIUS_KM * SCALE_UNITS.KM_TO_M,
    // Absent oblateness stays absent — no `oblateness: undefined` key.
    ...(row.oblateness !== undefined ? { oblateness: row.oblateness } : {}),
  };
}
