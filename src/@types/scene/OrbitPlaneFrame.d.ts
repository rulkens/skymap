/**
 * OrbitPlaneFrame — the reference plane a body's orbital elements (i, Ω, ω) are
 * measured in, as an orthonormal right-handed basis in the scene's
 * equatorial-world frame.
 *
 * `xAxis` is the in-plane reference direction the ascending node Ω is measured
 * from, `yAxis` is 90° ahead of it in-plane, and `normal` is the plane normal
 * (the body's north pole). Planets and Earth's Moon use the ecliptic frame; a
 * planet's own moons use that planet's equatorial (Laplace) frame — see
 * `data/bodies/orbitPlaneFrames`.
 */

import type { Vec3 } from '../math/Vec3';

export type OrbitPlaneFrame = {
  readonly xAxis: Vec3;
  readonly yAxis: Vec3;
  readonly normal: Vec3;
};
