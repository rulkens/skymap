import type { Vec3 } from '../../../@types/math/Vec3';
import type { OrbitPlaneBasis } from './OrbitPlaneBasis';

/** One system's orbits and habitable zone, as the orbit-plane renderer draws them. */
export type ExoplanetOrbitPlane = OrbitPlaneBasis & {
  /** The host relative to the eye, in au: small enough for f32 at any range it draws at. */
  readonly hostRelEyeAu: Vec3;
  readonly orbitsAu: readonly number[];
  readonly habitableZoneAu: readonly [number, number] | null;
  readonly alpha: number;
};
