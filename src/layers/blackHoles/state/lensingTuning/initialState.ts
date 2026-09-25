/**
 * The Sgr A* lens pass's DebugPanel tuning defaults — this literal IS their
 * source of truth (deletion-audit N1: `BlackHoleRow` no longer carries a
 * per-row `emission`, since only tuning's one global knob reads it; a per-row
 * field returns together with a per-row reader when M87* lands).
 * `cubemapResolutionPx` seeds the `sky-cubemap` render-target row's declared
 * size (1024).
 */

import type { BlackHoleLensingTuning } from '../../@types/BlackHoleLensingTuning';

export const initialState: BlackHoleLensingTuning = {
  // ISCO out to the EHT photon ring; Schwarzschild, no spin.
  innerRs: 3,
  outerRs: 6,
  inclinationRad: 0.35, // ~20°, inside EHT polarimetry's ≲30° from face-on
  positionAngleRad: 2.21, // major axis, E of N; observationally unconstrained
  flickerAmp: 0.15, // ±15%; taste, no published NIR variability index
  flickerTimescaleS: 120, // Sgr A*'s own minute-scale NIR flares
  diskScaleHeightRs: 0.4,
  edgeFadeStartFraction: 0.7,
  dopplerStrength: 0.6,
  emissionStrength: 1,
  emissionTint: [1, 1, 1],
  cubemapResolutionPx: 1024,
};
