import { describe, expect, it } from 'vitest';

import { streamFocusBoost } from '../../../../tools/streams/utils/streamFocusBoost';
import { STREAM_FOCUS_BOOST_CAP } from '../../../../tools/streams/data/streamsBuild.constants';

const particles = (n: number, luminosity: number, sizeKpc: number) => ({
  luminosity: new Float32Array(n).fill(luminosity),
  sizeMpc: new Float32Array(n).fill(sizeKpc / 1e3),
});

describe('streamFocusBoost', () => {
  it('a thin sparse track is lifted more than a dense wide stream, which stays at 1', () => {
    const thin = streamFocusBoost(particles(1000, 0.6, 0.05), 16.7, 0.043);
    const wide = streamFocusBoost(particles(60_000, 0.75, 0.44), 262, 5.2);
    expect(wide).toBe(1);
    expect(thin).toBeGreaterThan(wide);
  });

  it('never dims a stream and never lifts one past the cap', () => {
    expect(streamFocusBoost(particles(10_000, 1, 0.3), 1, 0.1)).toBe(1);
    expect(streamFocusBoost(particles(10, 0.1, 0.05), 50, 0.3)).toBe(STREAM_FOCUS_BOOST_CAP);
  });

  it('a stream of zero width or no particles takes a finite factor', () => {
    expect(Number.isFinite(streamFocusBoost(particles(0, 1, 0.3), 0, 0))).toBe(true);
  });
});
