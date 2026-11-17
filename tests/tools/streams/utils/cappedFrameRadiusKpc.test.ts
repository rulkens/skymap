import { describe, expect, it } from 'vitest';

import { stellarStreamsVisibility } from '../../../../src/layers/stellarStreams/visibility';
import { smoothstep } from '../../../../src/utils/math/smoothstep';
import { STREAM_FOCUS_DISTANCE_PER_RADIUS } from '../../../../tools/streams/data/streamFrameCap.constants';
import { cappedFrameRadiusKpc } from '../../../../tools/streams/utils/cappedFrameRadiusKpc';

const [OUT_FROM, OUT_TO] = stellarStreamsVisibility[0].bands.streams.out;
const [IN_FROM, IN_TO] = stellarStreamsVisibility[0].bands.streams.in;
const shownIn = (sunKpc: number): number => smoothstep(IN_FROM * 1e3, IN_TO * 1e3, sunKpc);
const shownAt = (sunKpc: number): number => 1 - smoothstep(OUT_FROM * 1e3, OUT_TO * 1e3, sunKpc);

describe('cappedFrameRadiusKpc', () => {
  it.each([0, 5, 18, 26])(
    'a large stream anchored %d kpc out settles fully shown on either side',
    (anchor) => {
      const distance = cappedFrameRadiusKpc(200, anchor) * STREAM_FOCUS_DISTANCE_PER_RADIUS;
      expect(shownAt(anchor + distance)).toBeGreaterThanOrEqual(0.95 - 1e-9);
    },
  );

  it.each([0.5, 2, 10, 20, 26])(
    'a small stream anchored %d kpc out settles outside the in band on the Sun side',
    (anchor) => {
      const distance = cappedFrameRadiusKpc(0.3, anchor) * STREAM_FOCUS_DISTANCE_PER_RADIUS;
      expect(shownIn(Math.abs(distance - anchor))).toBeGreaterThanOrEqual(0.95 - 1e-9);
    },
  );

  it('keeps a mid-sized stream as it is, and lets the floor win where cap and floor clash', () => {
    expect(cappedFrameRadiusKpc(10, 18)).toBe(10);
    const distance = cappedFrameRadiusKpc(200, 34) * STREAM_FOCUS_DISTANCE_PER_RADIUS;
    expect(shownIn(distance - 34)).toBeGreaterThanOrEqual(0.95 - 1e-9);
    expect(shownAt(34 + distance)).toBeLessThan(0.95);
  });
});
