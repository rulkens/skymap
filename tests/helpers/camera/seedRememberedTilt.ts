/**
 * seedRememberedTilt — author a large remembered tilt through the body arm's own
 * steps (a pan drag to unlatch, then repeated orbit-drag look steps), the way
 * every tilt-mapping fixture primes its memory before tracing the band. The
 * memory threads through the loop and lands back on the harness, so the frames
 * that follow read what the drags authored. Unit-radius, h/R 0.15 — inside the
 * blend band, where the handles write the memory (w > 0).
 */

import {
  EMPTY_SURFACE_GESTURE_MEMORY,
  surfaceStep,
} from '../../../src/services/camera/surfaceStep';
import { frameKey } from '../../../src/services/engine/camera/rungs/frameKey';
import { surfaceGestureEdge } from '../../../src/utils/camera/surfaceGestureEdge';
import { SURFACE_STANDOFF_RADII } from '../../../src/utils/camera/clampDistance';
import { DEFAULT_CAMERA_TUNING } from '../../../src/data/camera/cameraTuning';
import type { CameraSimHarness } from './CameraSimHarness';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { SurfaceGestureMemory } from '../../../src/@types/camera/SurfaceGestureMemory';
import type { TiltMemory } from '../../../src/@types/camera/TiltMemory';
import type { Mat3 } from '../../../src/@types/math/Mat3';

const NADIR: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, -1];
const CTX = {
  viewportPx: [100, 100] as const,
  fovYRad: Math.PI / 2,
  bodyRadiusM: 1,
  standoffRadii: SURFACE_STANDOFF_RADII,
  groundRadiusAtM: () => 1,
  // A no-relief fixture body: tight enough to bracket the flat field without
  // standing in for any real terrain shell.
  innerBoundRadiusM: 1 - 1e-6,
  outerBoundRadiusM: 1 + 1e-6,
  sceneUpLocal: [0, 0, 1] as const,
  focusPivotM: null,
  tuning: DEFAULT_CAMERA_TUNING,
};

export function seedRememberedTilt(
  h: CameraSimHarness,
  options: { readonly targetRad?: number; readonly guard?: number; readonly pxStep?: number } = {},
): void {
  const { targetRad = 0.35, guard = 6, pxStep = 2 } = options;
  let mem: SurfaceGestureMemory =
    h.state.cameraRuntime.gesture.value ?? EMPTY_SURFACE_GESTURE_MEMORY;
  let tilt: TiltMemory = h.state.cameraRuntime.tilt;
  let p: BodyFixedPose = {
    bodyId: 'earth',
    anchorLocalM: [0, 0, 0],
    eyeRelAnchorM: [0, 0, 1.15],
    basisLocal: NADIR,
  };
  mem = surfaceGestureEdge(true);
  const unlatch = surfaceStep(
    mem,
    tilt,
    p,
    { kind: 'drag', mode: 'pan', startPx: [50, 50], endPx: [50, 30] },
    CTX,
  );
  p = unlatch.pose;
  tilt = unlatch.tilt;
  mem = surfaceGestureEdge(false);
  for (let g = 0; g < guard && tilt.rememberedTiltRad < targetRad; g += 1) {
    mem = surfaceGestureEdge(true);
    for (let px = 5; px < 90 && tilt.rememberedTiltRad < targetRad; px += pxStep) {
      const out = surfaceStep(
        mem,
        tilt,
        p,
        { kind: 'drag', mode: 'orbit', startPx: [50, px], endPx: [50, px + pxStep] },
        CTX,
      );
      p = out.pose;
      mem = out.gesture;
      tilt = out.tilt;
    }
    mem = surfaceGestureEdge(false);
  }
  const runtime = h.state.cameraRuntime;
  h.state.cameraRuntime = {
    ...runtime,
    gesture: { key: frameKey(runtime.register.pose.frame), value: mem },
    tilt,
  };
}
