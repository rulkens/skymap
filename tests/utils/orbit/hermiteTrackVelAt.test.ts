import { describe, expect, it } from 'vitest';

import type { SampledTrack } from '../../../src/@types/scene/SampledTrack';
import { hermiteTrackVelAt } from '../../../src/utils/orbit/hermiteTrackVelAt';
import { hermiteTrackAt } from '../../../src/utils/orbit/hermiteTrackAt';
import FLYBY from '../../fixtures/voyager2NeptuneFlyby.json';

const track: SampledTrack = {
  id: 'voyager2',
  tDays: Float64Array.from(FLYBY.track.tDays),
  posKm: Float64Array.from(FLYBY.track.posKm),
  velKmS: Float32Array.from(FLYBY.track.velKmS),
};

describe('hermiteTrackVelAt', () => {
  it('returns the sampled velocity at every interior node, to 1e-6 relative', () => {
    for (let i = 0; i < track.tDays.length - 1; i++) {
      const v = hermiteTrackVelAt(track, track.tDays[i]!);
      const want = [0, 1, 2].map((k) => track.velKmS[3 * i + k]!);
      expect(Math.hypot(...v.map((x, k) => x - want[k]!)) / Math.hypot(...want)).toBeLessThan(1e-6);
    }
  });

  it('is the derivative of hermiteTrackAt mid-interval', () => {
    const t = (track.tDays[10]! + track.tDays[11]!) / 2;
    const h = 1e-4;
    const a = hermiteTrackAt(track, t - h);
    const b = hermiteTrackAt(track, t + h);
    const v = hermiteTrackVelAt(track, t);
    for (let k = 0; k < 3; k++) {
      expect(v[k]!).toBeCloseTo((b[k]! - a[k]!) / (2 * h * 86_400), 4);
    }
  });
});
