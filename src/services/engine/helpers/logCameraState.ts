/**
 * logCameraState — debug aid for tuning initial camera framing + reset target.
 *
 * Prints the current orbit-camera state in copy-paste-friendly form so
 * the values can be pasted directly into `cameraFraming.ts` (initial
 * camera) or wherever a reset/home target is hard-coded.  Two prints
 * per call — a structured object for human reading, and a flat
 * one-liner for fast paste-into-source.
 *
 * Pre-extraction this lived as a method body inside the public
 * `EngineHandle` literal in `engine.ts`.  Lifting it out trades nothing
 * (the method still exists, it just delegates) for one small gain: the
 * orchestrator file no longer carries 30 lines of console.log
 * formatting that it has no other reason to know about.
 *
 * Why accept `OrbitCamera | null` rather than `EngineState`: the only
 * datum the function needs is the camera, so widening the parameter
 * to the whole state would be a false dependency that obscures the
 * true reach.  The null branch keeps the early-invocation guard
 * (engine destroyed, or camera not yet built) self-contained — callers
 * pass `state.cam` and forget about it.
 */

import type { OrbitCamera } from '../../../@types';

export function logCameraState(cam: OrbitCamera | null): void {
  if (!cam) {
    console.log('[engine] logCameraState: camera not ready yet');
    return;
  }
  const out = {
    target: [
      Number(cam.target[0].toFixed(2)),
      Number(cam.target[1].toFixed(2)),
      Number(cam.target[2].toFixed(2)),
    ],
    distance: Number(cam.distance.toFixed(2)),
    yaw: Number(cam.yaw.toFixed(4)),
    pitch: Number(cam.pitch.toFixed(4)),
    fovYRad: Number(cam.fovYRad.toFixed(4)),
  };
  console.log('[engine] camera state:', out);
  console.log(
    `[engine] one-liner: target: [${out.target.join(', ')}], distance: ${out.distance}, yaw: ${out.yaw}, pitch: ${out.pitch}, fovYRad: ${out.fovYRad}`,
  );
}
