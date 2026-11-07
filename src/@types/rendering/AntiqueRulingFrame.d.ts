/**
 * AntiqueRulingFrame — one coordinate frame the plate is ruled and numbered in:
 * its axes, its prime meridian, its intervals, and the globe it is cast on (null
 * for the sky, where the view ray itself is the coordinate). The shader's
 * graticule and ladder (`io.wesl` `RulingFrame`) and `placeAntiqueNumerals` read
 * the same value, so lines, ladder and numbers cannot disagree.
 */

import type { Mat3 } from '../math/Mat3';
import type { Vec3 } from '../math/Vec3';
import type { AntiqueRulingStep } from './AntiqueRulingStep';

export type AntiqueRulingFrame = {
  /** Frame-local → world, column-major; columns: longitude 0, longitude 90° east, the pole. */
  readonly axes: Readonly<Mat3>;
  /** Added to the frame's longitude before it is ruled and numbered: its prime meridian. */
  readonly lonOffsetDeg: number;
  /** Eye → the globe's centre, in its radii (f64 subtraction), or null for the sky. */
  readonly globeCentre: Readonly<Vec3> | null;
  /** Ink of the net inside the plate, 0..1; the border reads the frame at any value. */
  readonly net: number;
  readonly lon: AntiqueRulingStep;
  readonly lat: AntiqueRulingStep;
};
