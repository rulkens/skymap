/**
 * HorizonsVectorRow — one JPL Horizons state-vector row (VEC_TABLE=1: position only),
 * heliocentric equatorial ICRF in km, time-tagged by its UT Julian date.
 */

export type HorizonsVectorRow = {
  readonly jd: number;
  readonly xKm: number;
  readonly yKm: number;
  readonly zKm: number;
};
