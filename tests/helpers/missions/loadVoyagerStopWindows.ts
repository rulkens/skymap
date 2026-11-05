/**
 * loadVoyagerStopWindows — registers both Voyager tracks as the fixture holds them: every real
 * sample within about a month of each mission event, plus each window's outer neighbours, so a
 * Hermite span inside a window is the full track's own. Between windows the tracks are coarse.
 */

import { trajectoryRegistry } from '../../../src/services/bodies/trajectoryRegistry';
import WINDOWS from '../../fixtures/voyagerStopWindows.json';

export function loadVoyagerStopWindows(): void {
  for (const id of ['voyager1', 'voyager2'] as const) {
    const t = WINDOWS[id];
    trajectoryRegistry.set({
      id,
      tDays: Float64Array.from(t.tDays),
      posKm: Float64Array.from(t.posKm),
      velKmS: Float32Array.from(t.velKmS),
    });
  }
}
