/**
 * HorizonsVectorRow — one JPL Horizons vector row, heliocentric-or-centre-relative equatorial
 * ICRF in km, time-tagged by its UT Julian date. Velocities (km/s) are present only for a
 * VEC_TABLE=2 result.
 */

export type HorizonsVectorRow = {
  readonly jd: number;
  readonly xKm: number;
  readonly yKm: number;
  readonly zKm: number;
  readonly vxKmS?: number;
  readonly vyKmS?: number;
  readonly vzKmS?: number;
};
