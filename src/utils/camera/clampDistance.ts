/**
 * Orbit-camera distance limits + the shared clamp policy.
 *
 * `clampDistance` is the ENVELOPE — a ceiling, and a positivity floor for a
 * degenerate pose. It is deliberately NOT the surface stop: `distance` is
 * measured to the orbit target, which drifts off the body centre the moment a
 * pan or a zoom-to-cursor strafes the pivot, and a floor in that currency then
 * walls off a zoom the eye has plenty of altitude for. The surface stop lives
 * in EYE currency in `zoomedEyeStep`, against `surfaceStandoffRadii.ts`.
 */

// ─── Distance limits ──────────────────────────────────────────────────────────

/**
 * Absolute floor for `cam.distance` in Mpc — 1e-17 Mpc ≈ 309 km. A degeneracy
 * backstop, NOT a surface stop (`SURFACE_STANDOFF_RADII` handles that, in eye
 * currency): it only keeps `distance` strictly positive, which a pivot that
 * strafes past the eye could otherwise break. Sits below the galaxy-focus
 * tween's minimum end distance (0.15 Mpc), so `clampDistance` never ratchets
 * a focus-on tween back outward.
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
 * Clamp a candidate distance to the zoom envelope: `[MIN_DISTANCE_MPC,
 * MAX_DISTANCE_MPC]`. The surface stop is not here — see the module header.
 */
export function clampDistance(d: number): number {
  if (d < MIN_DISTANCE_MPC) return MIN_DISTANCE_MPC;
  if (d > MAX_DISTANCE_MPC) return MAX_DISTANCE_MPC;
  return d;
}
