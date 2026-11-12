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
  readonly asteroidClass: AsteroidClass;
  readonly neo: boolean;
  readonly pha: boolean;
  readonly name: string | null;
};
