import type { Vec3 } from '../../../@types/math/Vec3';

/** The main belt's band tints under colour by semi-major axis, linear RGB; the middle band is their mix. */
export type AsteroidBeltRamp = {
  readonly inner: Vec3;
  readonly outer: Vec3;
};
