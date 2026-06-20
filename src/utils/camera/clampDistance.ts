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
 * Minimum allowed `cam.distance` in Mpc.
 *
 * 0.05 Mpc = 50 kpc — below the focus-on tween's end distance (0.12 Mpc,
 * see `galaxyFocusDistance.ts`) so that focus snaps the camera
 * to its target framing without `clampDistance` ratcheting it back out
 * the next time the user wheel-zooms.  At this distance the camera is
 * sitting inside the Local-Group footprint of a typical galaxy — close
 * enough that the disk's 30-kpc-diameter texture fills a substantial
 * fraction of the screen but not so close we're inside the disk plane
 * itself (which would expose perspective artefacts the billboard
 * approximation isn't built for).  Hard floor; the orbit-camera near
 * plane (engine.ts: 0.01 Mpc) handles the much-closer case where the
 * tween briefly puts the camera right on top of the galaxy mid-flight.
 */
export const MIN_DISTANCE_MPC = 0.05;

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
