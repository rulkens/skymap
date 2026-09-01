/**
 * Orbit-camera distance limits + the shared clamp policy.
 *
 * The limits here are the single source of truth for how far the orbit camera
 * may sit from its target — wheel zoom, pinch zoom, focus tweens, and initial
 * framing all route through `clampDistance` so the envelope can never drift.
 * The floor stands off from the orbited body's surface (a framed body's target
 * is its CENTRE); callers precompute it via `PivotFraming.floorMpc` rather than
 * passing a radius here, so this module has no pivot-radius branch to drift.
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
 * horizon — `cutSurfaceTiles` returns an empty plan at or below 1.0 radii,
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
 * floor `floorMpc`.
 *
 * `floorMpc` is precomputed by the caller (`PivotFraming.floorMpc`, built in
 * `pivotRadiusMpc.ts`'s `pivotFraming`) as `max(MIN_DISTANCE_MPC,
 * (radiusMpc ?? 0) * standoffRadii)` — this function no longer knows about a
 * pivot radius or a standoff ratio, only the resulting number.
 *
 * @param d         Candidate `cam.distance`, Mpc.
 * @param floorMpc  Precomputed distance floor, Mpc.
 */
export function clampDistance(d: number, floorMpc: number): number {
  if (d < floorMpc) return floorMpc;
  if (d > MAX_DISTANCE_MPC) return MAX_DISTANCE_MPC;
  return d;
}
