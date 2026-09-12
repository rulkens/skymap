/**
 * raySphereRoots — the two roots (tNear ≤ tFar) of
 * `|ro + t·rd − center|² = radius²` for a unit-length `rd`, `null` on a miss.
 * An origin inside the sphere gives `tNear < 0 < tFar`.
 *
 * f64 twin of `lib/util.wesl::raySphere`, which diverges twice: its miss
 * sentinel is `vec2(-1, -1)`, and it early-outs a sphere wholly behind an
 * outside origin to that same sentinel, where this returns the real (both
 * negative) roots so the caller can test the sign it needs.
 *
 * Roots come as the stable pair `q = −(b + sign(b)·s)`, since `−b − s` cancels
 * once b² ≫ c — an eye metres above a planet-radius sphere.
 */
import type { Vec2 } from '../../@types/math/Vec2';
import type { Vec3 } from '../../@types/math/Vec3';

export function raySphereRoots(
  ro: Readonly<Vec3>,
  rd: Readonly<Vec3>,
  center: Readonly<Vec3>,
  radius: number,
): Vec2 | null {
  const mx = ro[0] - center[0];
  const my = ro[1] - center[1];
  const mz = ro[2] - center[2];

  const b = mx * rd[0] + my * rd[1] + mz * rd[2];
  const c = mx * mx + my * my + mz * mz - radius * radius;

  const discr = b * b - c;
  if (discr < 0) return null;

  const s = Math.sqrt(discr);
  const q = -(b + (b < 0 ? -s : s));
  // q == 0 needs b = s = 0, hence c = 0: a ray leaving the surface along the
  // tangent, touching only where it started.
  if (q === 0) return [0, 0];
  const other = c / q;
  return q < other ? [q, other] : [other, q];
}
