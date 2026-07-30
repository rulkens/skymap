/**
 * atmosphereShellBound — the `[tNear, tFar]` segment of a unit-direction
 * view ray that lies INSIDE the atmosphere shell of a planet centred at the
 * origin: bounded above by the atmosphere-top sphere (`topRadius`) and
 * clipped where the ray first strikes the ground sphere (`bottomRadius`),
 * since the opaque surface occludes the far side of the atmosphere.
 *
 * This is a thin COMPOSITION over `raySphereRoots` (plan D), NOT a second
 * solver: two calls to the shared quadratic — one for the top sphere, one
 * for the ground sphere — plus the clamp/occlusion logic that is the only
 * new code here. The quadratic itself is never duplicated. The atmosphere
 * fragment (plan E, Task 5) re-expresses the SAME clamp in WESL, reusing the
 * SAME GPU quadratic `lib/util.wesl::raySphere` that `raySphereRoots`
 * mirrors on the CPU; the WESL clamp is modelled on
 * `horizonShell/fragment.wesl`. This TS home is the unit-testable source of
 * truth for the clamp: the inside/outside/miss cases are subtle and a silent
 * bug there is an invisible-or-wrong limb with no other guard, the same
 * WGSL↔TS-parity justification the `pack*Uniforms` byte-layout tests carry.
 *
 * The three pieces of logic under test:
 *
 *  - Two-sphere bound. `raySphereRoots(..., topRadius)` gives the entry/exit
 *    of the atmosphere; its far root is the default `tFar`.
 *  - Ground occlusion. If the ray also hits the ground sphere and enters it
 *    ahead of `tNear`, the visible atmosphere ends at that ground entry:
 *    `tFar = min(tFar, tGround)`.
 *  - `tNear → 0` inside clamp. When the origin sits inside the shell the top
 *    near root is negative (behind the camera); we clamp `tNear` to 0 so the
 *    march starts at the origin (spec §8.3 inside/outside robustness).
 *
 * Returns `null` when the ray never enters the atmosphere: it misses the top
 * sphere (`raySphereRoots` returns `null`), or the whole shell is behind the
 * origin (both top roots < 0 — the divergence `raySphereRoots` documents and
 * deliberately does NOT early-out, leaving the sign test to callers like this
 * one). Both radii are in the same units as `rayOriginLocal`.
 *
 * `rayDirLocal` MUST be unit length — the caller renormalizes after the
 * inverse-model transform (a scaled model breaks unit length; the house
 * trap), exactly as the WESL twin assumes.
 */
import type { Vec3 } from '../../@types/math/Vec3';
import { raySphereRoots } from './raySphereRoots';

const ORIGIN: Readonly<Vec3> = [0, 0, 0];

export function atmosphereShellBound(
  rayOriginLocal: Readonly<Vec3>,
  rayDirLocal: Readonly<Vec3>,
  bottomRadius: number,
  topRadius: number,
): { tNear: number; tFar: number } | null {
  const top = raySphereRoots(rayOriginLocal, rayDirLocal, ORIGIN, topRadius);
  // Miss the top sphere, or the whole shell behind us → the ray never enters.
  if (top === null || top[1] < 0) return null;

  const tNear = Math.max(0, top[0]);
  let tFar = top[1];

  // Ground occlusion: the opaque surface caps the visible atmosphere at the
  // first ground crossing, when that crossing lies ahead of tNear.
  const ground = raySphereRoots(rayOriginLocal, rayDirLocal, ORIGIN, bottomRadius);
  if (ground !== null && ground[0] > tNear) {
    tFar = Math.min(tFar, ground[0]);
  }

  return { tNear, tFar };
}
