/**
 * Orbit-camera distance limits + the shared clamp policy.
 *
 * The limits here are the single source of truth for how far the orbit camera
 * may sit from its target — wheel zoom, pinch zoom, focus tweens, and initial
 * framing all route through `clampDistance` so the envelope can never drift.
 * The floor takes the orbited body's physical radius and stands off from its
 * surface (a framed body's target is its CENTRE), so `pivotRadiusMpc` is a
 * REQUIRED `number | null` param — optional would let a call site silently
 * fall back to the global floor, the drift this module exists to prevent.
 */

// ─── Distance limits ──────────────────────────────────────────────────────────

/**
 * Absolute floor for `cam.distance` in Mpc — 1e-17 Mpc ≈ 309 km. A degeneracy
 * backstop, NOT a surface stop (`SURFACE_STANDOFF_RADII` handles that): this
 * only keeps distance strictly positive with no pivot radius to stand off
 * from, and floors bodies smaller than ~309 km. Sits below the galaxy-focus
 * tween's minimum end distance (0.15 Mpc), so `clampDistance` never ratchets
 * a focus-on tween back outward.
 */
export const MIN_DISTANCE_MPC = 1e-17;

/**
 * Where the camera stops relative to the pivot's surface, as a multiple of its
 * radius. Sized for the 0.15 m/texel EOX imagery — ~15 m of altitude gets
 * close enough to resolve it, while staying above the surface shading's own
 * ~10 m hard limit: `earth/fragment.wesl`'s ocean-glint view vector is
 * `u.camPosLocal - in.normalLocal`, both ~1.0-magnitude f32 values in the
 * unit-sphere local frame, so this is a near-cancellation whose headroom gets
 * thin below ~10 m of altitude — no depth-buffer floor to raise, an f32
 * subtraction floor. Must stay strictly above 1.0: the standoff needs a
 * horizon — `planEarthTiles` returns an empty plan at or below 1.0 radii,
 * where there is none to plan against.
 *
 * The near plane no longer couples to this ratio directly: `deriveSlabs`
 * (`slabs.ts`) now keys `foregroundFrustum`'s bracket off ALTITUDE
 * (`cam.distance - pivotRadiusMpc`) rather than raw distance, so the floors
 * compare directly — this must stay comfortably above `foregroundFrustum.ts:
 * MIN_NEAR_MPC` (~6 m) or the near plane clips the ground, as `20fed8e31`
 * found the hard way.
 *
 * A RATIO applies the same floor to every body, which was only validated
 * visually over Earth. Revisit if a close Moon/Sun approach looks wrong.
 */
export const SURFACE_STANDOFF_RADII = 1.0000024;

/**
 * Maximum allowed `cam.distance` in Mpc.
 *
 * 30 Gpc keeps the wheel zoom in sync with `FAR_CLIP_MPC` so the user
 * can pull the camera out far enough to see the full Milliquas tail
 * (linear-Hubble distance `4282.75 · z`, z ≈ 7 → ~30 Gpc).  Beyond
 * this the cloud is a single dot and the user has lost all spatial
 * intuition, so we stop the wheel here rather than letting the camera
 * drift into the lonely abyss.
 */
export const MAX_DISTANCE_MPC = 30000;

/**
 * Clamp a candidate distance to the zoom envelope: ceiling `MAX_DISTANCE_MPC`,
 * floor `max(MIN_DISTANCE_MPC, pivotRadiusMpc · SURFACE_STANDOFF_RADII)`.
 *
 * @param d               Candidate `cam.distance`, Mpc.
 * @param pivotRadiusMpc  Physical radius of the orbit pivot, Mpc, or `null` when
 *   it has no surface to stand off from (empty space, a galaxy, a structure,
 *   the Milky Way — volumes the camera flies INTO, never a floor).
 */
export function clampDistance(d: number, pivotRadiusMpc: number | null): number {
  const floor =
    pivotRadiusMpc === null
      ? MIN_DISTANCE_MPC
      : Math.max(MIN_DISTANCE_MPC, pivotRadiusMpc * SURFACE_STANDOFF_RADII);
  if (d < floor) return floor;
  if (d > MAX_DISTANCE_MPC) return MAX_DISTANCE_MPC;
  return d;
}
