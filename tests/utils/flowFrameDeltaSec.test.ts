import { describe, it, expect } from 'vitest';
import { flowFrameDeltaSec } from '../../src/utils/flowFrameDeltaSec';
import { MAX_FRAME_DELTA_SEC } from '../../src/data/flow/flowFieldConstants';

describe('flowFrameDeltaSec', () => {
  it('returns 0 on the first frame (no prior timestamp)', () => {
    expect(flowFrameDeltaSec(1000, null)).toBe(0);
  });

  it('returns elapsed seconds for a normal frame gap', () => {
    expect(flowFrameDeltaSec(1016.7, 1000)).toBeCloseTo(0.0167, 4);
  });

  it('clamps a long stall to MAX_FRAME_DELTA_SEC', () => {
    expect(flowFrameDeltaSec(3000, 1000)).toBe(MAX_FRAME_DELTA_SEC);
  });

  it('returns 0 for a backwards (non-monotonic) clock', () => {
    expect(flowFrameDeltaSec(1000, 2000)).toBe(0);
  });
});
