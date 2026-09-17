/**
 * The marker's whole point is to stay READABLE across the 40 km → 100 m band
 * the terrain pick spans, so the law that has to hold is "same pixels at any
 * range" — not any particular metre figure.
 */

import { describe, expect, it } from 'vitest';
import { TERRAIN_PICK_MARKER_RADIUS_PX } from '../../../src/data/debug/terrainPickMarkerRadiusPx';
import { terrainPickMarkerRadiusM } from '../../../src/utils/camera/terrainPickMarkerRadiusM';

const FOV_Y_RAD = Math.PI / 4;
const VIEWPORT_H = 1080;

/** The screen radius the sphere ends up with: subtended half-angle × px/rad. */
function apparentRadiusPx(rangeM: number): number {
  const radiusM = terrainPickMarkerRadiusM(rangeM, FOV_Y_RAD, VIEWPORT_H);
  const pxPerRad = VIEWPORT_H / (2 * Math.tan(FOV_Y_RAD / 2));
  return Math.atan(radiusM / rangeM) * pxPerRad;
}

describe('terrainPickMarkerRadiusM', () => {
  it('holds one apparent size from 100 m to 40 km', () => {
    const near = apparentRadiusPx(100);
    const far = apparentRadiusPx(40_000);
    expect(far).toBeCloseTo(near, 6);
    // The tangent-vs-linear discrepancy is what "close to" absorbs; the size
    // itself must still be the constant that was asked for.
    expect(near).toBeCloseTo(TERRAIN_PICK_MARKER_RADIUS_PX, 1);
  });

  it('answers 0 for a degenerate viewport rather than Infinity', () => {
    // A zero-height viewport reaches the GPU as NaN geometry otherwise, which
    // takes the whole body pass down rather than just the marker.
    expect(terrainPickMarkerRadiusM(1_000, FOV_Y_RAD, 0)).toBe(0);
  });
});
