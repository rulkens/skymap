/**
 * Orbit-camera distance limits + the shared clamp policy.
 *
 * The min/max here are the single source of truth for how far the orbit
 * camera may sit from its target. Wheel zoom, pinch zoom, focus tweens, and
 * initial framing all route through `clampDistance` so the envelope can never
 * drift between call sites.
 */

import { hasUrlGate } from '../url/hasUrlGate';

// ─── Distance limits ──────────────────────────────────────────────────────────

/**
 * The releasable wheel-zoom floor: 0.05 Mpc ≈ 150 kpc.  This is the default
 * envelope a production page-load runs with.  It sits far below the
 * galaxy-focus tween's minimum end distance (0.15 Mpc) so focus tweens are
 * never ratcheted outward, yet it stops the descent before the debug
 * foreground bodies (Sun/Earth stand-ins) grow past sub-pixel — so nothing
 * unreleasable is reachable without the gate.
 */
const RELEASABLE_MIN_DISTANCE_MPC = 0.05;

/**
 * The `?deepZoom` wheel-zoom floor: 1e-17 Mpc ≈ Earth-surface scale (Earth's
 * radius 6371 km ≈ 2.06e-17 Mpc).  Close enough that the orbit camera can sit
 * just off Earth's surface during the "zoom to Earth" foreground descent.
 */
const DEEP_ZOOM_MIN_DISTANCE_MPC = 1e-17;

/**
 * Minimum allowed `cam.distance` in Mpc.
 *
 * The default `0.05` Mpc is the releasable envelope; `?deepZoom` lowers it to
 * `1e-17` Mpc for the zoom-to-Earth descent past the Milky Way.  Without the
 * gate the debug foreground bodies stay sub-pixel and unreachable, so nothing
 * unreleasable is shown.
 *
 * The floor is read once at module load — a page-load constant, like the
 * project's other URL gates, so the value can't change without a reload.
 *
 * Both floors sit below the galaxy-focus tween's minimum end distance
 * (0.15 Mpc, `galaxyFocusDistance.ts: MIN_FOCUS_DISTANCE_MPC`), so
 * `clampDistance` never ratchets a focus-on tween back outward —
 * `clampDistance(0.15)` returns 0.15 unchanged under either floor.  The
 * renderer's near plane and the foreground viewport handle depth precision at
 * sub-kpc scales; this constant is only the wheel-zoom floor, not a
 * depth-buffer guarantee.
 */
export const MIN_DISTANCE_MPC = hasUrlGate('deepZoom')
  ? DEEP_ZOOM_MIN_DISTANCE_MPC
  : RELEASABLE_MIN_DISTANCE_MPC;

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
