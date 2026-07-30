/**
 * orbitRadPerPixel — the yaw/pitch sensitivity of an orbit drag, in radians per
 * CSS pixel, damped by altitude above a focused body's surface.
 *
 * ### Why a flat rate breaks close to a surface
 *
 * The orbit drag has always rotated `cam.yaw` / `cam.pitch` about the target by a
 * flat `ORBIT_MAX_RAD_PER_PX` per CSS pixel, with no altitude term — the same rate
 * whether the camera sits a light-year out or is skimming a planet's crust. That
 * rate rotates the world about the target's CENTRE, so the ground distance it
 * sweeps is proportional to the pivot's radius, not to how far the camera is from
 * that ground. At Earth (radius 6371 km) one pixel of the flat rate sweeps the
 * surface by `6371 * ORBIT_MAX_RAD_PER_PX` ≈ 32 km — but at the standoff floor
 * (127 km altitude, `SURFACE_STANDOFF_RADII`) the whole screen only spans about
 * 92 km of ground. One pixel of drag was moving the ground by roughly a third of
 * a screen width: about 350x too fast to track the cursor the way Google Earth
 * does.
 *
 * ### The fix: rate the drag against the ground, not the centre
 *
 * `2 * tan(fovYRad / 2) * h / cssHeight` is the same pixel-to-world conversion
 * the pan path already uses (`pxToWorld` in `orbitControls.ts`), except evaluated
 * at altitude `h = distance - pivotRadiusMpc` instead of at `distance`: the pan
 * path moves the orbit TARGET, which sits at `distance` from the camera, while an
 * orbit drag sweeps the GROUND, which sits at `h` from the camera (the target
 * distance minus the body's radius). That is the one place this differs from the
 * pan conversion. Dividing by the pivot's radius turns "world distance swept at
 * the ground" into "radians of rotation about the centre that produces it" — the
 * same unit yaw/pitch are already in.
 *
 * The result is capped at `ORBIT_MAX_RAD_PER_PX`, today's flat rate, so this is
 * never a global sensitivity change: the two terms cross at about 7 body radii of
 * altitude. Above that the cap binds and the feel is exactly what shipped before;
 * below it, the ground-tracking term takes over and the drag slows continuously
 * as the camera descends, with no threshold or mode switch at the crossover.
 *
 * `pivotRadiusMpc === null` means there is no surface to damp against (empty
 * space, a galaxy, a structure, the Milky Way — see `clampDistance`'s docstring
 * for the same distinction), so this degenerates to the flat rate exactly, not
 * approximately.
 *
 * ### What this does NOT do
 *
 * This rates the drag correctly for the point at SCREEN CENTRE — the ground
 * under the middle of the viewport tracks the cursor at 1:1. Off-centre the
 * approximation drifts, because a real fix needs a cursor-to-surface raycast
 * (unproject the cursor, intersect the body's sphere, rotate about THAT point)
 * rather than a single scalar rate applied uniformly across the drag. That
 * raycast doesn't exist anywhere in this codebase yet — the pick path resolves
 * an identity, not a world hit point — and is tracked as its own deferred item,
 * `docs/backlog/2026-07-30-surface-directed-zoom.md`, which is about the zoom
 * path but describes exactly the missing piece an exact orbit fix would also
 * need. This function is the cheap approximation that fixes the 350x-too-fast
 * case without that machinery.
 */

/**
 * Ceiling on orbit-drag sensitivity, in radians per CSS pixel — today's flat
 * rate, unchanged for every gesture far from a surface (or with no pivot radius
 * at all). 0.005 rad/px means a 100 px drag sweeps ~28.6°, about 1/12 of a full
 * orbit: fast enough to reorient in a few gestures, slow enough for precise
 * positioning on a typical laptop trackpad.
 */
export const ORBIT_MAX_RAD_PER_PX = 0.005;

/**
 * Orbit-drag sensitivity for the current gesture, in radians per CSS pixel.
 *
 * @param fovYRad         Camera vertical field of view, radians (`cam.fovYRad`).
 * @param distance        Camera distance to the orbit target, Mpc (`cam.distance`).
 * @param cssHeight       Canvas CSS height in pixels (`canvas.clientHeight`).
 * @param pivotRadiusMpc  Physical radius of whatever sits at the orbit pivot, Mpc,
 *   or `null` when it has no surface to damp against (see module docstring).
 */
export function orbitRadPerPixel(
  fovYRad: number,
  distance: number,
  cssHeight: number,
  pivotRadiusMpc: number | null,
): number {
  if (pivotRadiusMpc === null) return ORBIT_MAX_RAD_PER_PX;

  const h = distance - pivotRadiusMpc;
  if (h <= 0) return ORBIT_MAX_RAD_PER_PX;

  const groundTrackingRate = (2 * Math.tan(fovYRad / 2) * h) / (cssHeight * pivotRadiusMpc);
  return Math.min(ORBIT_MAX_RAD_PER_PX, groundTrackingRate);
}
