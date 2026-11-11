/** One star particle of the Vasiliev+ 2021 Sagittarius snapshot (columns the build reads). */
export type VasilievStar = {
  /** Galactocentric position, kpc, galactic axes (Sun at x = −8). */
  readonly x: number;
  readonly y: number;
  readonly z: number;
  /** Galactocentric velocity, km/s, same axes. */
  readonly vx: number;
  readonly vy: number;
  readonly vz: number;
  /** ICRS, degrees. */
  readonly ra: number;
  readonly dec: number;
  readonly distanceKpc: number;
  /** 0 = still bound; negative = Gyr since it last left 5 kpc of the remnant. */
  readonly tStripGyr: number;
};
