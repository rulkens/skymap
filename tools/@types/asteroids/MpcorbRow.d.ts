import type { AsteroidClass } from '../../../src/@types/asteroids/AsteroidClass';

/**
 * MpcorbRow — one numbered line of MPCORB.DAT, angles in degrees (ecliptic J2000), a in AU. `h` and `g`
 * are null where MPC leaves the column blank; `name` is null for a row known only by its provisional
 * designation.
 */
export type MpcorbRow = {
  readonly number: number;
  readonly h: number | null;
  readonly g: number | null;
  readonly epochJd: number;
  readonly meanAnomalyDeg: number;
  readonly argPeriDeg: number;
  readonly nodeDeg: number;
  readonly inclDeg: number;
  readonly e: number;
  readonly aAu: number;
  /** MPCORB's orbit type (flags low 6 bits); 0 is unset and lands in the main belt. */
  readonly orbitType: number;
  /** null for a row this Layer leaves out (orbit type 10); written as ABSENT. */
  readonly asteroidClass: AsteroidClass | null;
  readonly neo: boolean;
  readonly pha: boolean;
  readonly name: string | null;
};
