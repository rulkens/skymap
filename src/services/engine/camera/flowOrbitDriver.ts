/**
 * flowOrbitDriver — THROWAWAY SPIKE (branch worktree-fly-to-edge-spike).
 *
 * The companion to flyoutDriver, for capturing the "cosmic flows" clip: a
 * slow, seamless orbit around the CF4++ peculiar-velocity field while the
 * flow ribbons advect on their own. Where the fly-to-edge is a log-dolly
 * (distance changes, orientation fixed), this is the inverse — distance
 * fixed, orientation sweeps — because the flow field already supplies the
 * motion; the camera's only job is to add PARALLAX so the 3D structure of
 * the streaming reads (the Laniakea "rotate the velocity field" move).
 *
 * ### Framing
 *
 * The flow cube is 1000 Mpc per edge, centered on the Milky Way, with a
 * soft spherical fade near ~500 Mpc radius. To frame the whole basin
 * (Great Attractor ~65 Mpc, Shapley ~200 Mpc — both well inside) you sit
 * ~1000–1500 Mpc out and look in. The driver does NOT set that framing or
 * enable the flow layer: aim the camera (press `h` for home → origin
 * target, wheel out to ~1200 Mpc), turn flows on and tune intensity in the
 * normal UI, THEN start the orbit. Keeping the driver a pure camera mover
 * is what makes it composable with whatever scene you've dialed in.
 *
 * ### Seamless loop
 *
 * Yaw advances at a CONSTANT angular rate (no ease): one full revolution
 * every `periodSec`, so the orientation at t=period is identical to t=0 —
 * the clip loops with no visible seam (an ease would put a velocity
 * discontinuity at the loop point). Pitch rides a single sine period on
 * top, returning exactly to its start each revolution, so the gentle
 * up/down "look around" also loops cleanly. It is time-based (driven by
 * `nowMs`), not per-frame, so the orbit rate is unaffected if the recorder
 * drops the canvas below 60 fps.
 *
 * Press `g` to start; press `g` again to stop (toggle). It runs
 * indefinitely so you can record one revolution or several and pick the
 * best loop in editing. Attached ONLY when `?floworbit` is present.
 */

import type { CameraDriver } from '../../../@types/engine/camera/CameraDriver';
import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';
import { updatePosition } from '../../camera/orbitCamera';

/** Seconds per full 360° revolution. Override with `?floworbit=<seconds>`. */
const DEFAULT_PERIOD_SEC = 30;

/**
 * Pitch sweep amplitude, radians (~7°). A small rise-and-fall over each
 * revolution that reveals depth without tilting so far the orbit reads as
 * a tumble. Returns to the start pitch every period for a seamless loop.
 * Set to 0 for a dead-level orbit.
 */
const PITCH_AMP_RAD = 0.12;

const TWO_PI = Math.PI * 2;

type Phase = 'idle' | 'armed' | 'running';

/**
 * Build the flow-orbit driver. `requestRender` wakes a sleeping loop when
 * the user starts an orbit. `periodSec` is the revolution period.
 */
export function createFlowOrbitDriver(
  requestRender: () => void,
  periodSec: number = DEFAULT_PERIOD_SEC,
): CameraDriver {
  let phase: Phase = 'idle';
  let startMs = 0;
  let yaw0 = 0;
  let pitch0 = 0;

  // `g` toggles: idle → start a take; running → stop and freeze the camera.
  window.addEventListener('keydown', (e) => {
    if (e.key === 'g' || e.key === 'G') {
      phase = phase === 'idle' ? 'armed' : 'idle';
      requestRender();
    }
  });

  return {
    id: 'flow-orbit-spike',
    priority: 80,
    isActive: () => phase !== 'idle',
    apply: (cam: OrbitCamera, nowMs: number) => {
      // First frame of a take: latch the orbit center from the live camera
      // so the sweep is relative to whatever framing the user dialed in.
      if (phase === 'armed') {
        startMs = nowMs;
        yaw0 = cam.yaw;
        pitch0 = cam.pitch;
        phase = 'running';
      }

      // Constant angular rate → seamless loop every `periodSec`.
      const theta = TWO_PI * ((nowMs - startMs) / 1000 / periodSec);
      cam.yaw = yaw0 + theta;
      cam.pitch = pitch0 + PITCH_AMP_RAD * Math.sin(theta);
      updatePosition(cam);
    },
  };
}
