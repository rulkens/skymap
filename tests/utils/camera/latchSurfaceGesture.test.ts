/**
 * latchSurfaceGesture — the drag latch's anchor (F2, spec §8.1/§12). A peak
 * fixture proves the anchor sits on the resident terrain, not the flat datum
 * a `pickOnBody` regression would silently fall back to.
 */

import { describe, it, expect } from 'vitest';

import { latchSurfaceGesture } from '../../../src/utils/camera/latchSurfaceGesture';
import type { BodyFixedPose } from '../../../src/@types/camera/BodyFixedPose';
import type { DragStep } from '../../../src/@types/camera/DragStep';
import type { GroundRadiusLookup } from '../../../src/@types/camera/GroundRadiusLookup';
import type { Mat3 } from '../../../src/@types/math/Mat3';
import type { Vec2 } from '../../../src/@types/math/Vec2';
import type { Vec3 } from '../../../src/@types/math/Vec3';

// Earth-scale bounds matching raycastTerrain.test.ts's own fixtures.
const DATUM_M = 6_371_000;
const PEAK_HEIGHT_M = 8000;
const INNER_RADIUS_M = DATUM_M - 500;
const OUTER_RADIUS_M = DATUM_M + 9000;
const VIEWPORT: Vec2 = [100, 100];
const FOV = Math.PI / 2;
const NADIR: Mat3 = [1, 0, 0, 0, 1, 0, 0, 0, -1];

/** A peak directly under the eye's nadir; flat datum everywhere else. */
const peakField: GroundRadiusLookup = (p) => {
  const angleRad = Math.atan2(p[0], p[2]);
  return Math.abs(angleRad) < (2 * Math.PI) / 180 ? DATUM_M + PEAK_HEIGHT_M : DATUM_M;
};

const arm: BodyFixedPose = {
  bodyId: 'earth',
  anchorLocalM: [0, 0, 0],
  eyeRelAnchorM: [0, 0, DATUM_M + 100_000],
  basisLocal: NADIR,
};

describe('latchSurfaceGesture', () => {
  it('latches over a peak on the resident terrain, not the flat datum', () => {
    const step: DragStep = { kind: 'drag', mode: 'orbit', startPx: [50, 50], endPx: [55, 50] };
    const gesture = latchSurfaceGesture(
      arm,
      step,
      VIEWPORT,
      FOV,
      DATUM_M,
      peakField,
      INNER_RADIUS_M,
      OUTER_RADIUS_M,
    );
    // A `pickOnBody`-against-the-datum regression reads exactly DATUM_M here.
    expect(gesture.anchorRadiusM).toBeGreaterThan(DATUM_M);
    expect(gesture.anchorLocalM).not.toBeNull();
    expect(gesture.anchorRadiusM).toBe(Math.hypot(...(gesture.anchorLocalM as Vec3)));
  });
});
