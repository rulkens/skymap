/**
 * `BLACK_HOLES` — the scene's black holes. Sgr A* only today; a second row
 * (M87*) is data, not code. Inclination, position angle and flicker are
 * visual taste, not measurements.
 */

import type { BlackHoleRow } from '../@types/BlackHoleRow';
import { GALACTIC_CENTRE_ANCHOR } from '../../../data/places/galacticCentre';
import { SGR_A_STAR_MASS_SOLAR } from '../../../data/bodies/sgrAStarMassSolar';
import { SGR_A_STAR_ENTRY } from '../sources/sgrAStar';
import { SCALE_FADE_BANDS } from '../../../services/engine/presentation/scaleFadeBands';

export const BLACK_HOLES: readonly BlackHoleRow[] = [
  {
    id: SGR_A_STAR_ENTRY.id,
    anchorId: GALACTIC_CENTRE_ANCHOR.id,
    massSolar: SGR_A_STAR_MASS_SOLAR,
    band: SCALE_FADE_BANDS.sgrAStarLensing,
    standoffRadii: 2.0,
    focusDistanceRadii: 30.4,
    emission: {
      // ISCO out to the EHT photon ring; Schwarzschild, no spin.
      innerRs: 3,
      outerRs: 6,
      inclinationRad: 0.35, // ~20°, inside EHT polarimetry's ≲30° from face-on
      positionAngleRad: 2.21, // major axis, E of N; observationally unconstrained
      flickerAmp: 0.15, // ±15%; taste, no published NIR variability index
      flickerTimescaleS: 120, // Sgr A*'s own minute-scale NIR flares
    },
  },
];
