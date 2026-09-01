import { describe, expect, it } from 'vitest';
import { orientationCoherenceStats } from '../../../../../tools/galaxy-renderer/src/engine/ismMap/orientationCoherenceStats';

describe('orientationCoherenceStats', () => {
  it('reports mean/max coherence from packed (cos2theta, sin2theta) texels, at f32 precision', () => {
    // A 1x2 grid of packed (cos2t, sin2t): lengths 0.6 and 1.0. Float32Array
    // rounds 0.6, so the mean is compared at f32 precision, not f64.
    const stats = orientationCoherenceStats(new Float32Array([0.6, 0, 0, 1]));
    expect(stats.mean).toBeCloseTo(0.8, 6);
    expect(stats.max).toBe(1);
  });
});
