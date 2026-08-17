import { describe, expect, it } from 'vitest';
import { loopCycleFrameCount } from '../../../../tools/utils/record/loopCycleFrameCount';

describe('loopCycleFrameCount', () => {
  it('rounds an exact cycle to the whole-frame count', () => {
    // earthUniverseLoop's real numbers: 148 s at 60 fps is exactly 8880
    // frames — the case the grill session's decision was checked against.
    const frames = loopCycleFrameCount(148, 60);
    expect(frames).toBe(8880);
    // Exclusive-endpoint property (Q1): the recorder captures frame indices
    // 0..frames-1, whose virtual timestamps run 0..(frames-1)/fps. The last
    // one must stay strictly under duration, or the mp4 loop splice
    // duplicates the seam frame (pose(duration) ≡ pose(0)).
    expect((frames - 1) / 60).toBeLessThan(148);
  });

  it('rounds an off-grid cycle to the nearest frame instead of erroring', () => {
    // 10.02 s at 30 fps is 300.6 frames — not on the fps grid — and must
    // round to the nearest frame rather than floor/ceil or throw (Q4).
    expect(loopCycleFrameCount(10.02, 30)).toBe(301);
  });
});
