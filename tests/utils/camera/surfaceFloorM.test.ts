/**
 * surfaceFloorM — the descent floor, in metres, tracks the shared standoff
 * ratio rather than restating it (spec §10: the two arms — Mpc-space
 * `clampDistance` and metre-space surface descent — must agree on where the
 * ground is).
 */

import { describe, it, expect } from 'vitest';

import { surfaceFloorM } from '../../../src/utils/camera/surfaceFloorM';
import { SURFACE_STANDOFF_RADII } from '../../../src/utils/camera/clampDistance';

describe('surfaceFloorM', () => {
  it('tracks the shared standoff ratio', () => {
    for (const radiusM of [6_371_000, 1000]) {
      expect(surfaceFloorM(radiusM) / radiusM).toBe(SURFACE_STANDOFF_RADII);
    }
  });
});
