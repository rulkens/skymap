/**
 * diveUntilEngaged — wheel-in over `body` until its displayed h/R crosses
 * `engageHR * factor` (default the engage edge itself), guard-bounded so a
 * broken regime fails the test instead of hanging it. A threshold rather than
 * a fixed notch count keeps the dive past engage regardless of its value.
 */

import { hrOverBody } from './hrOverBody';
import { DEFAULT_CAMERA_TUNING } from '../../../src/data/camera/cameraTuning';
import type { CameraSimHarness } from './CameraSimHarness';
import type { SimBodyId } from './SimBodyId';

export function diveUntilEngaged(
  h: CameraSimHarness,
  options: { readonly body?: SimBodyId; readonly factor?: number; readonly guard?: number } = {},
): void {
  const { body = 'earth', factor = 1, guard = 60 } = options;
  const bodyState = h.bodies.get(body)!;
  const radiusM = h.radiusM(body);
  let i = 0;
  while (
    hrOverBody(h.state, bodyState, radiusM) > DEFAULT_CAMERA_TUNING.engageHR * factor &&
    i < guard
  ) {
    h.wheel(-100);
    i += 1;
  }
}
