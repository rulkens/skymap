/**
 * BodySpec — the authored fields a seeded solar-system sphere needs BEYOND what
 * its `ORBITAL_ELEMENTS` row already carries (its position derives from the
 * elements). Named fields so the numeric columns can't be mis-ordered at the
 * call site, the way a positional `(datumRadiusM, r, g, b)` tuple could.
 * `reliefM` defaults to `[0, 0]`; a body with a measured height source (Mars)
 * passes that source's extremes, never a hand-picked guess.
 */
import type { Vec3 } from '../math/Vec3';

export type BodySpec = {
  readonly id: string;
  readonly label: string;
  readonly datumRadiusM: number;
  readonly albedo: Vec3;
  readonly reliefM?: readonly [number, number];
};
