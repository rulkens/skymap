import { describe, expect, it } from 'vitest';

import { stellarStreamsVisibility } from '../../../../src/layers/stellarStreams/visibility';
import { smoothstep } from '../../../../src/utils/math/smoothstep';
import { STREAM_FOCUS_DISTANCE_PER_RADIUS } from '../../../../tools/streams/data/streamFrameCap.constants';
import { cappedFrameRadiusKpc } from '../../../../tools/streams/utils/cappedFrameRadiusKpc';

const [OUT_FROM, OUT_TO] = stellarStreamsVisibility[0].bands.streams.out;
const shownAt = (sunKpc: number): number => 1 - smoothstep(OUT_FROM * 1e3, OUT_TO * 1e3, sunKpc);

describe('cappedFrameRadiusKpc', () => {
  it.each([0, 5, 18, 27, 34, 50])(
    'a large stream anchored %d kpc out settles fully shown on either side',
    (anchor) => {
      const distance = cappedFrameRadiusKpc(200, anchor) * STREAM_FOCUS_DISTANCE_PER_RADIUS;
      expect(shownAt(anchor + distance)).toBeGreaterThanOrEqual(0.95 - 1e-9);
    },
  );

  it('keeps a small stream as it is, and one anchored past the range', () => {
    expect(cappedFrameRadiusKpc(1, 10)).toBe(1);
    expect(cappedFrameRadiusKpc(40, 95)).toBe(40);
  });
});
