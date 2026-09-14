/**
 * BodySpec — the authored fields a seeded solar-system sphere needs BEYOND what
 * its `ORBITAL_ELEMENTS` row already carries (its position derives from the
 * elements). Named fields so the numeric columns can't be mis-ordered at the
 * call site, the way a positional `(datumRadiusM, r, g, b)` tuple could.
 * A seed authors a datum only; relief is compiled, never hand-written (§3.4e).
 */
import type { Vec3 } from '../math/Vec3';

export type BodySpec = {
  readonly id: string;
  readonly label: string;
  readonly datumRadiusM: number;
  readonly albedo: Vec3;
};
