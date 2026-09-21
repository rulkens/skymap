/**
 * zoneOfAvoidance — the Layer's externally-read default, seeding
 * `zoneOfAvoidanceSlice.initialState`'s tuning knobs and re-used by the
 * DebugPanel's "paste defaults" affordance and its slider-field test.
 */

import type { ZoneOfAvoidanceTuning } from '../../../@types/settings/ZoneOfAvoidanceTuning';

/**
 * Zone-of-Avoidance look-knob starting values, tuned live via the
 * DebugPanel's tuning section — a dim pale lavender-blue veil (blue-heavy
 * linear RGB below), not a warm interstellar-dust extinction color.
 *
 * `radialFalloff` is a normalised [0, 1] fraction of the shell's radial span
 * (`outerRadiusMpc - innerRadiusMpc`, see `ZONE_OF_AVOIDANCE_SHELL`) — the
 * renderer converts it to an absolute Mpc e-folding length before it
 * reaches the shader, which decays density from the inner rim
 * outward (`exp(-(r - inner) / radialFalloffMpc)`). 0.1 (~38 Mpc) collapses
 * the veil to a puff hugging the inner rim; the shipped default, 0.46
 * (~173 Mpc), keeps haze visible across the catalog volume while still
 * clearly fading toward the outer radius.
 */
export const DEFAULT_ZONE_OF_AVOIDANCE_TUNING: ZoneOfAvoidanceTuning = {
  intensity: 0.37,
  radialFalloff: 0.46,
  edgeSharpness: 5,
  color: [0.5333, 0.5089, 1],
  labelColor: [0.2307, 0.2502, 0.6795],
};
