/**
 * seedRememberedTilt — author a large remembered tilt through the body arm's own
 * steps (a pan drag to unlatch, then repeated orbit-drag look steps), the way
 * every tilt-mapping fixture primes its memory before tracing the band. The
 * memory threads through the loop and lands back on the harness, so the frames
 * that follow read what the drags authored. Unit-radius, h/R 0.15 — inside the
 * band, where the handles write the memory (w = 1) and the ceiling is open.
 */

import { surfaceStep } from '../../../src/services/camera/surfaceStep';
import type { CameraSimHarness } from './CameraSimHarness';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { SurfaceMemory } from '../../../src/@types/camera/SurfaceMemory';
import type { Mat3 } from '../../../src/@types/math/Mat3';

const NADIR: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, -1];
const CTX = {
  viewportPx: [100, 100] as const,
  fovYRad: Math.PI / 2,
  bodyRadiusM: 1,
  sceneUpLocal: [0, 0, 1] as const,
};

export function seedRememberedTilt(
  h: CameraSimHarness,
  options: { readonly targetRad?: number; readonly guard?: number; readonly pxStep?: number } = {},
): void {
  const { targetRad = 0.35, guard = 6, pxStep = 2 } = options;
  let mem: SurfaceMemory = h.state.cameraRuntime.surface;
  let p: BodyFixedPose = {
    bodyId: 'earth',
    anchorLocalM: [0, 0, 0],
    eyeRelAnchorM: [0, 0, 1.15],
    basisLocal: NADIR,
  };
  mem = { ...mem, pointerDown: true, gesture: null };
  const unlatch = surfaceStep(
    mem,
    p,
    { kind: 'drag', mode: 'pan', startPx: [50, 50], endPx: [50, 30] },
    CTX,
  );
  p = unlatch.pose;
  mem = { ...unlatch.next, pointerDown: false, gesture: null };
  for (let g = 0; g < guard && mem.rememberedTiltRad < targetRad; g += 1) {
    mem = { ...mem, pointerDown: true, gesture: null };
    for (let px = 5; px < 90 && mem.rememberedTiltRad < targetRad; px += pxStep) {
      const out = surfaceStep(
        mem,
        p,
        { kind: 'drag', mode: 'orbit', startPx: [50, px], endPx: [50, px + pxStep] },
        CTX,
      );
      p = out.pose;
      mem = out.next;
    }
    mem = { ...mem, pointerDown: false, gesture: null };
  }
  h.state.cameraRuntime = { ...h.state.cameraRuntime, surface: mem };
}
