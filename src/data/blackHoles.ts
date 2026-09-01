/**
 * `BLACK_HOLES` — static registry of supermassive black holes in the scene.
 *
 * Append-only table binding each black hole identity to its disk-emission parameters.
 * Today holding only Sgr A* (our Galactic Centre); M87* is data (not code) once a
 * data-driven catalog exists. Emission tuning (inclination, position angle, flicker)
 * is visual taste until observational anchoring data becomes available.
 */

import type { BlackHoleRow } from '../@types/data/BlackHoleRow';

export const BLACK_HOLES: readonly BlackHoleRow[] = [
  {
    bodyId: 'sgr-a-star',
    emission: {
      // ISCO (innermost stable circular orbit) to EHT photon ring (Event Horizon
      // Telescope's nominal imaging radius). Hard constraint: no physical spin,
      // Schwarzschild only.
      innerRs: 3,
      outerRs: 6,
      // Face-on view is ≲30° per EHT polarimetry. Chosen value at ~20°; the exact
      // angle is unconstrained but fixed for reproducible renders.
      inclinationRad: 0.35, // ~20°
      // Major-axis position angle (E of N, standard astronomical convention).
      // Entirely unconstrained; tuned via the lens tuning debug panel.
      positionAngleRad: 2.21,
      // Stochastic brightening/dimming at minute-to-hour timescales (Sgr A* manifests
      // minute-scale near-IR flares; we borrow that timescale). Amplitude is tasteful
      // dev tuning — no published NIR variability-index texture yet. Range 0..1.
      flickerAmp: 0.15, // ±15% brightness modulation
      flickerTimescaleS: 120, // ~2 minutes
    },
  },
];
