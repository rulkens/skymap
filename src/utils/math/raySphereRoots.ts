/**
 * raySphereRoots — the two roots (tNear ≤ tFar) of
 * `|ro + t·rd − center|² = radius²`, or `null` on a miss. CPU twin of
 * `lib/util.wesl::raySphere`, and it diverges from that WESL sentinel posture
 * on both counts: `null` means a GENUINE miss only — a sphere entirely behind
 * the origin returns its two negative roots and an origin INSIDE returns
 * `tNear < 0 < tFar`, leaving the sign test to callers. `rd` must be unit
 * length, or every `t` comes back scaled by `|rd|`.
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

  // The discriminant as `radius² − |perpendicular|²`, not the textbook
  // `b² − (|m|² − radius²)`: identical for unit `rd` (|m|² − b² = |m − b·rd|²),
  // but the textbook form puts |m|² 17 decades above radius² for Earth seen
  // from 2.4e12 km, flushing the body out of the arithmetic and turning clean
  // hits into misses.
  const px = mx - b * rd[0];
  const py = my - b * rd[1];
  const pz = mz - b * rd[2];

  const discr = radius * radius - (px * px + py * py + pz * pz);
  if (discr < 0) return null;

  const s = Math.sqrt(discr);
  return [-b - s, -b + s];
}
