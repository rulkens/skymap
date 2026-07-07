import { describe, it, expect } from 'vitest';
import { apparentDiameterPx } from '../../../src/utils/math/apparentDiameterPx';

describe('apparentDiameterPx', () => {
  it('matches a hand-computed case at fovY = 90° (tan(fovY/2) = 1)', () => {
    // pxPerRad = 1000 / (2·tan(45°)) = 500; angular = 1/100 rad → 5 px.
    expect(apparentDiameterPx(1, 100, Math.PI / 2, 1000)).toBeCloseTo(5, 10);
  });

  it('matches a hand-computed case at the project-default 60° fov', () => {
    // pxPerRad = 720 / (2·tan(30°)) = 360/tan(30°); angular = 0.06/3 = 0.02 rad.
    const expected = 0.02 * (360 / Math.tan(Math.PI / 6));
    expect(apparentDiameterPx(0.06, 3, Math.PI / 3, 720)).toBeCloseTo(expected, 10);
  });

  it('scales linearly with diameter and inversely with distance', () => {
    const base = apparentDiameterPx(1, 100, Math.PI / 2, 1000);
    expect(apparentDiameterPx(2, 100, Math.PI / 2, 1000)).toBeCloseTo(base * 2, 10);
    expect(apparentDiameterPx(1, 200, Math.PI / 2, 1000)).toBeCloseTo(base / 2, 10);
  });

  it('clamps non-positive distance to a tiny floor — enormous but finite (camera at the object)', () => {
    for (const dist of [0, -5]) {
      const px = apparentDiameterPx(1, dist, Math.PI / 2, 1000);
      expect(Number.isFinite(px)).toBe(true);
      expect(px).toBeGreaterThan(1e6);
    }
  });
});
