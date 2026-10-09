import { describe, expect, it } from 'vitest';
import { tessellateTrack } from '../../../src/utils/orbit/tessellateTrack';
import { hermiteTrackAt } from '../../../src/utils/orbit/hermiteTrackAt';
import type { SampledTrack } from '../../../src/@types/scene/SampledTrack';

// A circle of radius R km sampled every 30 degrees, one revolution in 12 days.
const R = 1e6;
const N = 13;
const PERIOD_DAYS = 12;

function circle(): SampledTrack {
  const tDays = new Float64Array(N);
  const posKm = new Float64Array(3 * N);
  const velKmS = new Float32Array(3 * N);
  const w = (2 * Math.PI) / (PERIOD_DAYS * 86400);
  for (let i = 0; i < N; i++) {
    const a = (2 * Math.PI * i) / (N - 1);
    tDays[i] = i;
    posKm.set([R * Math.cos(a), R * Math.sin(a), 0], 3 * i);
    velKmS.set([-R * w * Math.sin(a), R * w * Math.cos(a), 0], 3 * i);
  }
  return { id: 'x', tDays, posKm, velKmS };
}

describe('tessellateTrack', () => {
  it('keeps chord sag within tolerance', () => {
    const track = circle();
    const tol = 10;
    const { tDays, posKm } = tessellateTrack(track, tol);
    expect(tDays.length).toBeGreaterThan(N);
    for (let i = 0; i + 1 < tDays.length; i++) {
      const mid = hermiteTrackAt(track, 0.5 * (tDays[i]! + tDays[i + 1]!));
      const c = [0, 1, 2].map((k) => 0.5 * (posKm[3 * i + k]! + posKm[3 * (i + 1) + k]!));
      expect(Math.hypot(mid[0] - c[0]!, mid[1] - c[1]!, mid[2] - c[2]!)).toBeLessThanOrEqual(tol);
    }
  });

  it('keeps every original sample and leaves a straight track unsubdivided', () => {
    const out = tessellateTrack(circle(), 10);
    for (const t of circle().tDays) expect(out.tDays).toContain(t);
    const line: SampledTrack = {
      id: 'l',
      tDays: Float64Array.of(0, 1, 2),
      posKm: Float64Array.of(0, 0, 0, 86400, 0, 0, 172800, 0, 0),
      velKmS: Float32Array.of(1, 0, 0, 1, 0, 0, 1, 0, 0),
    };
    expect(tessellateTrack(line, 10).tDays.length).toBe(3);
  });
});
