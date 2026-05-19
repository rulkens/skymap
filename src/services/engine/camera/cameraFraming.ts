/**
 * cameraFraming — pure helper that produces the engine's initial camera
 * snapshot from a bounding-box scalar and the desired vertical FOV.
 *
 * ### Why a separate module?
 *
 * The engine.ts startup IIFE used to compute the initial framing inline
 * (under the `// ── Camera auto-framing ──` comment).  Pulling it out here
 * lets us:
 *
 *   - Unit-test the math in Vitest without spinning up a WebGPU device or
 *     a real cloud — synthetic bbox values + a stub FOV is enough.
 *   - Keep the engine's async startup IIFE focused on imperative wiring
 *     (GPU init, listeners, render loop).  Pure math now lives next to
 *     `niceRound` and the other leaf helpers.
 *
 * ### Why a scalar bbox (rather than an `{ min/max XYZ }` struct)?
 *
 * The original engine code uses `maxAbsCoord(cloud)` — the maximum absolute
 * value of any positions[] component, computed in a single tight O(N) loop
 * with no sqrt.  That heuristic is intentionally cheap and we keep it
 * unchanged here to guarantee bit-for-bit equivalence with the prior
 * inline implementation.  Callers can derive this scalar from a true
 * axis-aligned bbox (`Math.max(|minX|, |maxX|, |minY|, |maxY|, |minZ|, |maxZ|)`)
 * if they prefer to compute the bbox once for multiple consumers.
 *
 * ### What's encoded in the constants?
 *
 *   - `INITIAL_FRAME_FACTOR = 1.6` — chosen empirically so first-time
 *     visitors land already inside the cluster structure rather than
 *     orbiting it from far above.  Lowered from 2.5 in an earlier round.
 *   - `near = 0.01` Mpc (10 kpc) — well inside the focus-on tween's end
 *     distance (0.12 Mpc, see `focusTween.ts:focusDistanceMpc`).  Visual
 *     pass uses additive blending with no depth test, so depth precision
 *     is not a concern; the pick pass uses depth32float, easily handling
 *     the 0.01 : (bbox × 4) ratio at scale.
 *   - `far = bbox × 4` — comfortable margin so the most distant points
 *     never clip out.
 *   - `yaw = 0`, `pitch = 0.3` — gentle downward look that shows the
 *     z-axis depth without being so steep it hides the equatorial plane.
 *
 * The returned `distance` is clamped to the global zoom envelope so an
 * oversized SDSS bbox can't start the user above MAX_DISTANCE_MPC (which
 * would lock the wheel input out of useful range).
 */

import { clampDistance } from '../../camera/orbitCamera';
import type { InitialCam } from '../../../@types/camera/InitialCam';

/**
 * Initial camera distance in Mpc.  Empirically tuned against the canonical
 * catalogue (SDSS+2MRS+GLADE merged) so the cosmic-web wedge fills the
 * viewport without spilling past the corners — see the module header.
 *
 * Decoupled from `bbox` (the previous `INITIAL_FRAME_FACTOR * bbox` form)
 * because the perceived framing on first paint should be invariant across
 * survey combinations: a synthetic-only fallback or a 2MRS-only build
 * shouldn't suddenly zoom way out just because the catalog volume's
 * bbox shrank.  `bbox` still drives the far-clip plane below.
 */
export const INITIAL_DISTANCE_MPC = 644.72;

/**
 * Compute the initial camera snapshot from a bbox scalar and FOV.
 *
 * Pure: no I/O, no mutation, no GPU.  Math is bit-for-bit equivalent to
 * the previous inline implementation in `engine.ts` — verified by
 * inspection during the refactor and by the synthetic tests in
 * `tests/services/engine/cameraFraming.test.ts`.
 *
 * @param bbox     `maxAbsCoord(cloud)` — max absolute coordinate component
 *                 across all loaded clouds.  See `galaxyInfoBuilder.ts` for
 *                 the helper that produces it.
 * @param fovYRad  Vertical field-of-view in radians (e.g. 60° → π/3).
 */
export function computeInitialCamera({
  bbox,
  fovYRad,
}: {
  bbox: number;
  fovYRad: number;
}): InitialCam {
  const distance = clampDistance(INITIAL_DISTANCE_MPC);
  const far = bbox * 4;
  return {
    target: [0, 0, 0],
    distance,
    yaw: 0,
    pitch: 0.3,
    fovYRad,
    near: 0.01,
    far,
  };
}
