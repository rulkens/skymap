/**
 * flyoutDriver — THROWAWAY SPIKE (branch worktree-fly-to-edge-spike).
 *
 * A single-purpose camera driver that performs the "fly to the edge"
 * pull-back for a screen recording: a continuous outward dolly from the
 * user's current framing (the Local Group) out past the Milliquas quasar
 * shell to the observable-universe horizon shell at ~14.3 Gpc. It is the
 * smallest possible slice of the parked cinematic tour — ONE leg, fixed
 * target, no beats/effects/captions/store.
 *
 * ### The one hard constraint (why this isn't just a distance lerp)
 *
 * The framing distance spans ~5 orders of magnitude (a few hundred kpc →
 * ~20 Gpc). A linear lerp of raw distance spends almost the entire clip
 * crawling across the last decade and lurches through the first — the
 * "lurch-then-crawl" the tour docs warn about three times. The Eames
 * "Powers of Ten" dolly instead moves at a uniform number of *decades per
 * second*, which means interpolating `ln(distance)`, not distance:
 *
 *     distance(t) = exp( lerp( ln(D0), ln(D1), ease(t) ) )
 *
 * That single line is the whole trick. Everything else here is plumbing.
 *
 * ### How it's driven
 *
 * The driver owns its own tiny state machine and binds a `keydown`
 * listener. Press `g` ("go") to arm; the next frame captures the start
 * distance from wherever the camera currently sits, then dollies out over
 * `durationMs`. Press `g` again any time to restart (re-captures D0 from
 * the live camera, so you can re-aim between takes). The camera target,
 * pitch, fov are left untouched — only distance grows (plus an optional
 * whisper of yaw drift so the wide end isn't dead-still).
 *
 * Because it is the highest-priority driver (90, above the store movers —
 * orbitDrag 80, tween 60, autoRotate 20 — the slot the real tour will
 * eventually own), while it runs it outranks them and owns the camera
 * outright. While armed-or-running its `isActive` returns true, which wins
 * the per-frame arbitration. The render loop's keep-alive predicate
 * (`shouldKeepTicking`) reads camera liveness off the STORE, so it can't see
 * a spike driver — the driver therefore pokes `requestRender` every frame
 * (and on `keydown`) to keep itself animating.
 *
 * Attached ONLY when `?flyout` is present (see startLoop wiring), so it can
 * never interfere with a normal session.
 */

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { CameraPose } from '../../../@types/camera/CameraPose';
import { clampDistance } from '../../camera/orbitCamera';

/**
 * Where the pull-back ends, in Mpc. The horizon shell fades in around
 * 14.3 Gpc (HORIZON_RADIUS_GPC), so we stop a little beyond it (~20 Gpc)
 * to frame the shell as a clear sphere rather than flying straight through
 * it. Clamped to MAX_DISTANCE_MPC (30 Gpc) for safety.
 */
const FAR_DISTANCE_MPC = 29_500;

/** Default clip length. Override with `?flyout=<seconds>`. */
const DEFAULT_DURATION_MS = 22_000;

/**
 * Total yaw drift across the whole pull-back, radians. A slow quarter-turn
 * keeps the wide end alive (the cloud rotates gently) without reading as a
 * spin. Set to 0 for a pure straight-back dolly.
 */
const TOTAL_YAW_DRIFT = 1.1;

/** Smooth ease-in-out so the dolly starts and stops gently. */
function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function clamp01(x: number): number {
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

type Phase = 'idle' | 'armed' | 'running';

/**
 * Build the flyout driver. `requestRender` wakes a sleeping render loop
 * when the user arms a take. `durationMs` is the clip length.
 */
export function createFlyoutDriver(
  requestRender: () => void,
  durationMs: number = DEFAULT_DURATION_MS,
): CameraDriver {
  let phase: Phase = 'idle';
  let startMs = 0;
  let logD0 = 0;
  const logD1 = Math.log(clampDistance(FAR_DISTANCE_MPC));
  let yaw0 = 0;

  // Self-contained trigger: `g` arms (or restarts) a take. No form-field
  // guard — this is a recording spike, not production input.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'g' || e.key === 'G') {
      phase = 'armed';
      requestRender();
    }
  });

  return {
    id: 'flyout-spike',
    // Above the store movers (orbitDrag 80 …) so the take owns the camera.
    priority: 90,
    isActive: () => phase !== 'idle',
    pose: (_s, cam): CameraPose => {
      // Self-clocked: the driver-table elapsed clock only serves tween /
      // autoRotate, so this spike reads the wall clock itself.
      const nowMs = performance.now();

      // First frame of a take: latch the start from the LIVE camera so the
      // dolly begins from whatever the user framed, and stamp the clock.
      if (phase === 'armed') {
        startMs = nowMs;
        logD0 = Math.log(clampDistance(cam.distance));
        yaw0 = cam.yaw;
        phase = 'running';
      }

      const t = clamp01((nowMs - startMs) / durationMs);
      const e = easeInOutCubic(t);

      // Author a fresh pose: target + pitch carry through from the live camera
      // (flyout only grows distance + drifts yaw); the log-dolly distance is
      // uniform decades/sec, the whole point of the spike.
      const out: CameraPose = {
        target: [cam.target[0], cam.target[1], cam.target[2]],
        yaw: yaw0 + TOTAL_YAW_DRIFT * e,
        pitch: cam.pitch,
        distance: clampDistance(Math.exp(logD0 + (logD1 - logD0) * e)),
      };

      // Land and release control back to the normal drivers.
      if (t >= 1) phase = 'idle';

      // Self-sustain the loop (shouldKeepTicking can't see a spike driver).
      requestRender();

      return out;
    },
  };
}
