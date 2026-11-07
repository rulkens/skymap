/** dropSmallParts — polygons under `minKm2` removed and holes under it filled: the detail an atlas
 * engraver left out (an enclave of a few villages, a sliver where two sources disagree). */

import type { LonLatPolygons } from '../@types/LonLatPolygons';
import { ringAreaKm2 } from './ringAreaKm2';

export function dropSmallParts(polygons: LonLatPolygons, minKm2: number, radiusKm: number): LonLatPolygons {
  return polygons
    .filter((rings) => ringAreaKm2(rings[0]!, radiusKm) >= minKm2)
    .map((rings) => [rings[0]!, ...rings.slice(1).filter((hole) => ringAreaKm2(hole, radiusKm) >= minKm2)]);
}
