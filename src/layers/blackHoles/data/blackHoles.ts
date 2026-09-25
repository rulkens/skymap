/**
 * `BLACK_HOLES` — the scene's black holes. Sgr A* only today; a second row
 * (M87*) is data, not code. Inclination, position angle and flicker are
 * visual taste, not measurements.
 */

import type { BlackHoleRow } from '../@types/BlackHoleRow';
import { SGR_A_STAR_MASS_SOLAR } from '../../../data/bodies/sgrAStarMassSolar';
import { SGR_A_STAR_ENTRY } from '../sources/sgrAStar';

export const BLACK_HOLES: readonly BlackHoleRow[] = [
  {
    id: SGR_A_STAR_ENTRY.id,
    massSolar: SGR_A_STAR_MASS_SOLAR,
    capture: 'sgrAStar',
    standoffRadii: 2.0,
    focusDistanceRadii: 30.4,
    // Warm orange, tuned to read against the additive HDR field it shares with
    // the seeded-body glints.
    glintTint: [1, 0.55, 0.2],
    glintBaseIntensity: 0.8,
  },
];
