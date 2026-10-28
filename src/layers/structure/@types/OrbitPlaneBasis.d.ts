import type { Vec3 } from '../../../@types/math/Vec3';

/** Orthonormal world axes spanning an orbital plane. */
export type OrbitPlaneBasis = {
  /** Where a transiting planet sits at mid-transit: from the host toward the Sun. */
  readonly u: Vec3;
  /** The line of nodes, along which the plane crosses our sky. */
  readonly v: Vec3;
};
