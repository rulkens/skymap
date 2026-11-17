import type { AsteroidBeltRamp } from '../../@types/AsteroidBeltRamp';

/** The belt ramp's colour rows, by end. */
export const ASTEROID_BELT_RAMP_LABELS: Readonly<Record<keyof AsteroidBeltRamp, string>> = {
  inner: 'Inner belt',
  outer: 'Outer belt',
};
