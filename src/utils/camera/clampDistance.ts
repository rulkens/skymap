/**
 * Orbit-camera distance limits + the shared clamp policy.
 *
 * The min/max here are the single source of truth for how far the orbit
 * camera may sit from its target. Wheel zoom, pinch zoom, focus tweens, and
 * initial framing all route through `clampDistance` so the envelope can never
 * drift between call sites.
 */

// ─── Distance limits ──────────────────────────────────────────────────────────

/**
 * Minimum allowed `cam.distance` in Mpc: 1e-17 Mpc ≈ Earth-surface scale
 * (Earth's radius 6371 km ≈ 2.06e-17 Mpc).  Close enough that the orbit
 * camera can sit just off Earth's surface during the "zoom to Earth"
 * foreground descent past the Milky Way.
 *
 * Sits below the galaxy-focus tween's minimum end distance (0.15 Mpc,
 * `galaxyFocusDistance.ts: MIN_FOCUS_DISTANCE_MPC`), so `clampDistance`
 * never ratchets a focus-on tween back outward — `clampDistance(0.15)`
 * returns 0.15 unchanged. The renderer's near plane and the foreground
 * viewport handle depth precision at sub-kpc scales; this constant is only
 * the wheel-zoom floor, not a depth-buffer guarantee.
 */
export const MIN_DISTANCE_MPC = 1e-17;

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
 * Clamp a candidate distance to `[MIN_DISTANCE_MPC, MAX_DISTANCE_MPC]`.
 *
 * Centralised so wheel zoom, focus tweens and initial framing all share
 * the same policy — drift here would be hard to debug.
 */
export function clampDistance(d: number): number {
  if (d < MIN_DISTANCE_MPC) return MIN_DISTANCE_MPC;
  if (d > MAX_DISTANCE_MPC) return MAX_DISTANCE_MPC;
  return d;
}
