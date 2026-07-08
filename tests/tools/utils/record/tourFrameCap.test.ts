import { describe, expect, it } from 'vitest';
import { tourFrameCap } from '../../../../tools/utils/record/tourFrameCap';
import { dwellDrift } from '../../../../src/state/tour/dwellDrift';
import type { BeatData } from '../../../../src/@types/animation/tour/BeatData';
import type { ClipData } from '../../../../src/@types/animation/ClipData';

// Narration clip: empty timeline, no id-bearing cues — matches the fixture
// shape guidedTourSaga.test.ts builds its beats from, so an enter clip's
// duration is exactly its authored `wait`/`hold` total with nothing to stub.
const NARRATION_CLIP: ClipData = {
  start: 'live',
  timeline: [],
};

describe('tourFrameCap', () => {
  it('sums enter+dwell over the beats and applies the margin formula', () => {
    const beats: readonly BeatData[] = [
      { enterClip: NARRATION_CLIP, caption: { title: 'B1' }, dwellClip: dwellDrift(8) },
      { caption: null, dwellClip: dwellDrift(5) }, // no enterClip — dwell only
    ];
    const fps = 30;

    // Hand-computed, NOT re-derived from the implementation's formula:
    //   beat 1: enter = NARRATION_CLIP (empty timeline)      = 0 s
    //           dwell = dwellDrift(8) (one 8 s `all` node)    = 8 s
    //   beat 2: no enterClip                                  = 0 s
    //           dwell = dwellDrift(5)                         = 5 s
    //   authoredSec = 13
    //   cap = ceil((13 × 1.25 + 10) × 30) = ceil(26.25 × 30) = ceil(787.5)
    expect(tourFrameCap(beats, fps)).toBe(788);
  });
});
