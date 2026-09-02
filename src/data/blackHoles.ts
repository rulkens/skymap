/**
 * `BLACK_HOLES` — each scene black hole's disk-emission parameters. Sgr A*
 * only today; a second row (M87*) is data, not code. Inclination, position
 * angle and flicker are visual taste, not measurements.
 */

import type { BlackHoleRow } from '../@types/data/BlackHoleRow';

export const BLACK_HOLES: readonly BlackHoleRow[] = [
  {
    bodyId: 'sgr-a-star',
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
