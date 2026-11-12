import type { AsteroidClass } from '../../../@types/asteroids/AsteroidClass';
import type { Vec3 } from '../../../@types/math/Vec3';

/** The tint of each asteroid class, linear RGB. */
export type AsteroidClassColors = Readonly<Record<AsteroidClass, Vec3>>;
