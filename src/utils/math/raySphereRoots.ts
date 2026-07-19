/**
 * raySphereRoots — analytic ray↔sphere intersection, returning the two
 * roots (tNear ≤ tFar) of `|ro + t·rd − center|² = radius²`, or `null` on a
 * miss.
 *
 * This is the CPU twin of the WESL primitive `lib/util.wesl::raySphere`
 * (util.wesl:116-143). Both solve the identical quadratic: with
 * `m = ro − center` and `rd` assumed unit-length,
 *
 *   a = dot(rd, rd) = 1
 *   b = dot(m, rd)
 *   c = dot(m, m) − r²
 *   discr = b² − c
 *   roots = −b ∓ sqrt(discr)
 *
 * The two live in different languages by necessity — the shadow-ray march
 * runs in the cloud-shadow fragment (WESL), while this TS copy is the
 * genuinely unit-testable source of truth for that same algebra and plan
 * E's atmosphere march-bound will be its second consumer. That is why it
 * earns a shared util rather than a one-off inline: like the
 * `packLitBodyUniforms` ↔ `LitBodyUniforms` pair, we accept a hand-verified
 * TS↔WESL mirror (checked against each other in code review + the tests
 * here) rather than a single generated source, because WGSL and TS have no
 * shared compilation path.
 *
 * Two deliberate divergences from the WESL sentinel posture:
 *
 *  - The WESL version returns `vec2(-1, -1)` both on a true miss (discr < 0)
 *    AND as an early-out when the sphere is entirely behind an outside
 *    origin (`c > 0 && b > 0`), so its callers test `hits.y > 0` before
 *    using. This TS util omits that early-out: a sphere fully behind the
 *    origin is still a mathematical hit (both roots negative), and we return
 *    those roots so a caller can test the sign it actually needs. `null` is
 *    reserved for the genuine miss (`discr < 0`).
 *  - An origin INSIDE the sphere yields `tNear < 0 < tFar` — the shadow-ray
 *    case, where the surface point sits inside the cloud shell and `tFar` is
 *    the crossing toward the sun.
 *
 * `rd` is assumed unit-length; the caller renormalizes (a non-unit `rd`
 * rescales `t` in units of `|rd|`, exactly as it would in the WESL twin).
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
  return [-b - s, -b + s];
}
