import { describe, expect, it } from 'vitest';

import { orientTrackByMotion } from '../../../../tools/streams/utils/orientTrackByMotion';
import { galstreamsTrackFixture as track } from '../../../helpers/streams/galstreamsTrackFixture';

// 20 mas/yr at 10 kpc is ~950 km/s, well above the ~250 km/s solar reflex the motion includes.
describe('orientTrackByMotion', () => {
  it('orientTrackByMotion flips a track listed against its proper motion', () => {
    const t = track({ pmRaCosDec: Array.from({ length: 61 }, () => -20) });
    const oriented = orientTrackByMotion(t);
    expect(oriented.ra).toEqual([...t.ra].reverse());
    expect(oriented.pmRaCosDec).toEqual([...t.pmRaCosDec].reverse());
  });

  it('keeps one listed along it', () => {
    const t = track({ pmRaCosDec: Array.from({ length: 61 }, () => 20) });
    expect(orientTrackByMotion(t)).toBe(t);
  });
});
