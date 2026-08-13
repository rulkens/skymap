/**
 * ZoneOfAvoidanceTuning — the Zone-of-Avoidance guide band's per-frame LOOK
 * knobs, kept apart from `ZoneOfAvoidanceSettings` (adds `enabled`) so a
 * knob patch can never flip the layer's visibility by accident — the same
 * split `MilkyWayTuning` makes.
 *
 * Values here are visual-pass placeholders (Task 9/11 checkpoints, Task 13
 * DebugPanel section dial them for real); the shape and the direction of
 * each knob are the load-bearing part.
 */

import type { Vec3 } from '../math/Vec3';

export type ZoneOfAvoidanceTuning = {
  /** Additive brightness of the band at full presence (galactic plane, b=0). */
  intensity: number;
  /** E-folding length, as a fraction of the band's radial span, of the density decay from the inner rim outward. */
  radialFalloff: number;
  /** Feather width, in degrees of galactic latitude, of `edgeBandMask`'s fade at the band's b-limit. */
  edgeSharpness: number;
  /** Veil tint, linear RGB. */
  color: Vec3;
  /** Curved-lettering tint, linear RGB (same currency as `color`). */
  labelColor: Vec3;
};
