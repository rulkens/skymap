/**
 * diveUntilEngaged — wheel-in over `body` until its displayed h/R crosses
 * `engageHR * factor` (default the engage edge itself), guard-bounded so a
 * broken regime fails the test instead of hanging it. Several fixtures used
 * to dive a fixed notch count (32) chosen only to land comfortably past
 * engage; this is that intent made explicit.
 */

import { hrOverBody } from './hrOverBody';
import { SURFACE_REGIME } from '../../../src/data/camera/surfaceRegime';
import type { CameraSimHarness, SimBodyId } from './makeCameraSimHarness';

export function diveUntilEngaged(
  h: CameraSimHarness,
  options: { readonly body?: SimBodyId; readonly factor?: number; readonly guard?: number } = {},
): void {
  const { body = 'earth', factor = 1, guard = 60 } = options;
  const bodyState = h.bodies.get(body)!;
  const radiusM = h.radiusM(body);
  let i = 0;
  while (hrOverBody(h.state, bodyState, radiusM) > SURFACE_REGIME.engageHR * factor && i < guard) {
    h.wheel(-100);
    i += 1;
  }
}
