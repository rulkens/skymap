/**
 * The cardinal points, hand-computed. This is where an east/west sign error
 * dies: 90°E must land on +Y, not −Y.
 */

import { describe, expect, it } from 'vitest';

import { surfacePointBodyFixed } from '../../../src/utils/scene/surfacePointBodyFixed';

const R = 3_389_500;

describe('surfacePointBodyFixed', () => {
  it('places the cardinal points', () => {
    const [px, py, pz] = surfacePointBodyFixed(0, 0, R);
    expect(px).toBeCloseTo(R, 6);
    expect(py).toBeCloseTo(0, 6);
    expect(pz).toBeCloseTo(0, 6);

    const [ex, ey, ez] = surfacePointBodyFixed(0, 90, R);
    expect(ex).toBeCloseTo(0, 6);
    expect(ey).toBeCloseTo(R, 6);
    expect(ez).toBeCloseTo(0, 6);

    // At the pole longitude drops out, so an arbitrary one must still give +Z.
    const [nx, ny, nz] = surfacePointBodyFixed(90, 137, R);
    expect(nx).toBeCloseTo(0, 6);
    expect(ny).toBeCloseTo(0, 6);
    expect(nz).toBeCloseTo(R, 6);
  });
});
