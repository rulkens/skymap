/**
 * discWarpShear — the galactic warp, linearised at one radius into the shear
 * an analytic Gaussian can carry.
 *
 * `generate.wesl`'s `warpOffset` displaces a star's y by
 *   W = A(R) * sin(atan2(z, x) - n(R)),  A = warpStrength*outerRadius*0.4*rel^2
 * which is not affine, so no closed-form line integral survives it. The
 * angle-sum rule rewrites it as (A(R)/R) * (z*cos n - x*sin n), LINEAR in x and
 * z once R is fixed — a shear, which is affine and integrates exactly.
 */
import type { GalaxyDescription } from '../../@types/galaxy/GalaxyDescription';
import type { Vec2 } from '../../@types/math/Vec2';

/**
 * The two off-diagonal entries of the world -> unwarped map
 * `y' = y + shearX*x + shearZ*z`, which inverts the generator's displacement.
 * Its determinant is 1, so a Gaussian sheared by it keeps its integral.
 *
 * `rel` is deliberately NOT clamped above 1: `warpOffset` does not clamp it
 * either, and a component whose radius sits past `outerRadius` must bend as
 * hard as the stars out there do.
 */
export function discWarpShear(radius: number, geometry: GalaxyDescription): Vec2 {
  const { warpStrength, warpTwist, warpStartRadius, outerRadius } = geometry;
  if (warpStrength <= 0 || radius <= warpStartRadius) return [0, 0];
  const rel = (radius - warpStartRadius) / Math.max(1e-4, outerRadius - warpStartRadius);
  const node = warpTwist * rel;
  const slope = (warpStrength * outerRadius * 0.4 * rel * rel) / radius;
  return [slope * Math.sin(node), -slope * Math.cos(node)];
}
