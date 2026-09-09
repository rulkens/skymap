/**
 * seedRememberedTilt — author a large remembered tilt through the surface
 * controller's own handles (a pan drag to unlatch, then repeated orbit-drag
 * look steps), the way every tilt-mapping fixture primes its memory before
 * tracing the band. Unit-radius, h/R 0.15 — inside the band, where the
 * handles write the memory (w = 1) and the tilt ceiling is open.
 */

import type { CameraSimHarness } from './CameraSimHarness';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { Mat3 } from '../../../src/@types/math/Mat3';

const NADIR: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, -1];

export function seedRememberedTilt(
  h: CameraSimHarness,
  options: { readonly targetRad?: number; readonly guard?: number; readonly pxStep?: number } = {},
): void {
  const { targetRad = 0.35, guard = 6, pxStep = 2 } = options;
  const c = h.state.cameraRuntime.surface;
  let p: BodyFixedPose = {
    bodyId: 'earth',
    anchorLocalM: [0, 0, 0],
    eyeRelAnchorM: [0, 0, 1.15],
    basisLocal: NADIR,
  };
  c.onGestureStart();
  p = c.apply(
    p,
    { kind: 'drag', mode: 'pan', startPx: [50, 50], endPx: [50, 30] },
    [100, 100],
    Math.PI / 2,
    1,
    [0, 0, 1],
  );
  c.onGestureEnd();
  for (let g = 0; g < guard && c.rememberedTiltRad() < targetRad; g += 1) {
    c.onGestureStart();
    for (let px = 5; px < 90 && c.rememberedTiltRad() < targetRad; px += pxStep) {
      p = c.apply(
        p,
        { kind: 'drag', mode: 'orbit', startPx: [50, px], endPx: [50, px + pxStep] },
        [100, 100],
        Math.PI / 2,
        1,
        [0, 0, 1],
      );
    }
    c.onGestureEnd();
  }
}
