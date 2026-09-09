/**
 * recedeUntilDisengaged — wheel-out over `body` until its displayed h/R
 * crosses `disengageHR * factor` (default the disengage edge itself),
 * guard-bounded (default 40, the value the round-18 fixture measured it at).
 */

import { hrOverBody } from './hrOverBody';
import { SURFACE_REGIME } from '../../../src/data/camera/surfaceRegime';
import type { CameraSimHarness } from './CameraSimHarness';
import type { SimBodyId } from './SimBodyId';

export function recedeUntilDisengaged(
  h: CameraSimHarness,
  options: { readonly body?: SimBodyId; readonly factor?: number; readonly guard?: number } = {},
): void {
  const { body = 'earth', factor = 1, guard = 40 } = options;
  const bodyState = h.bodies.get(body)!;
  const radiusM = h.radiusM(body);
  let i = 0;
  while (
    hrOverBody(h.state, bodyState, radiusM) < SURFACE_REGIME.disengageHR * factor &&
    i < guard
  ) {
    h.wheel(100);
    i += 1;
  }
}
