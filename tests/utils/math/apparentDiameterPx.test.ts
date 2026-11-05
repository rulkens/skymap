import { describe, it, expect } from 'vitest';
import { apparentDiameterPx } from '../../../src/utils/math/apparentDiameterPx';

describe('apparentDiameterPx', () => {
  it('matches a hand-computed case at fovY = 90° (pxPerRad = 1000 / (2·tan(45°)) = 500)', () => {
    // angular = 1/100 rad → 5 px.
    expect(apparentDiameterPx(1, 100, 500)).toBeCloseTo(5, 10);
  });

  it('clamps non-positive distance to a tiny floor — enormous but finite (camera at the object)', () => {
    for (const dist of [0, -5]) {
      const px = apparentDiameterPx(1, dist, 500);
      expect(Number.isFinite(px)).toBe(true);
      expect(px).toBeGreaterThan(1e6);
    }
  });
});
