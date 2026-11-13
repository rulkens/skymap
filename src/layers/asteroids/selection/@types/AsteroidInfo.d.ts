import type { AsteroidClass } from '../../../../@types/asteroids/AsteroidClass';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { AsteroidNow } from './AsteroidNow';

/**
 * AsteroidInfo — the display-ready projection of a selected or hovered asteroid: the catalog row's
 * elements and the CPU-mirror position at extract time, so the card needs no orbital mechanics.
 */
export type AsteroidInfo = {
  readonly type: 'asteroid';
  readonly number: number;
  /** `(433) Eros`, or `(123456)` when unnamed. */
  readonly label: string;
  readonly asteroidClass: AsteroidClass;
  readonly positionMpc: Vec3;
  readonly semiMajorAu: number;
  readonly eccentricity: number;
  /** To the ecliptic. */
  readonly inclinationDeg: number;
  readonly periodYears: number;
  /** Null when MPC gives no H. */
  readonly absoluteMagnitude: number | null;
  /** The elements' epoch, JD (TT). */
  readonly epochJd: number;
  /** Null outside the drawn window, where a two-body position would look precise and be wrong. */
  readonly now: AsteroidNow | null;
};
