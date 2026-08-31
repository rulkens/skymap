/**
 * BodySpec — the authored fields a seeded solar-system sphere needs BEYOND what
 * its `ORBITAL_ELEMENTS` row already carries (its position derives from the
 * elements). Named fields so the numeric columns can't be mis-ordered at the
 * call site, the way a positional `(radiusM, r, g, b)` tuple could.
 */
import type { Vec3 } from '../math/Vec3';

export type BodySpec = {
  readonly id: string;
  readonly label: string;
  readonly radiusM: number;
  readonly albedo: Vec3;
};
