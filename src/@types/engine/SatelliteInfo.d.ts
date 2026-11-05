import type { SatelliteClass } from '../satellites/SatelliteClass';
import type { Vec3 } from '../math/Vec3';

/**
 * SatelliteInfo — the display-ready projection of a selected or hovered satellite: what its card
 * shows, read off the catalog row and its SGP4 position at extract time, so the card needs no
 * orbital mechanics.
 */
export type SatelliteInfo = {
  readonly type: 'satellite';
  readonly noradId: number;
  readonly label: string;
  /** COSPAR international designator, `''` when CelesTrak lists none. */
  readonly cosparId: string;
  readonly satelliteClass: SatelliteClass;
  readonly positionMpc: Vec3;
  /** Height above Earth's mean radius at extract time, km. */
  readonly altitudeKm: number;
  readonly periodMin: number;
  readonly inclinationDeg: number;
  /** When CelesTrak's orbit was fitted, Unix ms. */
  readonly epochMs: number;
};
