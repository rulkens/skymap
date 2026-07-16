/**
 * logCameraState — debug aid for tuning initial camera framing + reset target.
 *
 * Prints the current orbit-camera state in copy-paste-friendly form so
 * the values can be pasted directly into `cameraFraming.ts` (initial
 * camera) or wherever a reset/home target is hard-coded.  Two prints
 * per call — a structured object for human reading, and a flat
 * one-liner for fast paste-into-source.
 *
 * target/distance use `toPrecision(8)` rather than fixed-decimal
 * rounding: units are Mpc and the interesting scales span from inside
 * the Milky Way (~1e-17 Mpc) to the cosmic web (~1e2 Mpc), so a fixed
 * number of decimal places rounds every deep-zoom value to zero.
 * Significant figures survive at any scale, and wrapping in `Number()`
 * keeps the pasted value a plain numeric literal (e.g. `1.2345678e-7`
 * is valid TS). yaw/pitch/fovYRad are angles in radians with a bounded
 * range, so fixed-decimal stays adequate there.
 *
 * The public `EngineHandle` method delegates here so the orchestrator
 * file doesn't carry console.log formatting it has no other reason to
 * know about.
 *
 * Why accept `OrbitCamera | null` rather than `EngineState`: the only
 * datum the function needs is the camera, so widening the parameter
 * to the whole state would be a false dependency that obscures the
 * true reach.  The null branch keeps the early-invocation guard
 * (engine destroyed, or camera not yet built) self-contained — callers
 * pass `state.cam` and forget about it.
 */

import type { OrbitCamera } from '../../../@types/camera/OrbitCamera';

export function logCameraState(cam: OrbitCamera | null): void {
  if (!cam) {
    console.log('[engine] logCameraState: camera not ready yet');
    return;
  }
  const out = {
    target: [
      Number(cam.target[0].toPrecision(8)),
      Number(cam.target[1].toPrecision(8)),
      Number(cam.target[2].toPrecision(8)),
    ],
    distance: Number(cam.distance.toPrecision(8)),
    yaw: Number(cam.yaw.toFixed(4)),
    pitch: Number(cam.pitch.toFixed(4)),
    fovYRad: Number(cam.fovYRad.toFixed(4)),
  };
  console.log('[engine] camera state:', out);
  console.log(
    `[engine] one-liner: target: [${out.target.join(', ')}], distance: ${out.distance}, yaw: ${out.yaw}, pitch: ${out.pitch}, fovYRad: ${out.fovYRad}`,
  );
}
