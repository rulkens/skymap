import { describe, expect, it } from 'vitest';
import { tourFrameCap } from '../../../../tools/utils/record/tourFrameCap';
import { clipDurationSec } from '../../../../tools/utils/animation/clipDurationSec';
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

    const authoredSec = beats.reduce((sum, beat) => {
      const enter = beat.enterClip ? clipDurationSec(beat.enterClip) : 0;
      const dwell = clipDurationSec(beat.dwellClip);
      return sum + enter + dwell;
    }, 0);
    const expected = Math.ceil((authoredSec * 1.25 + 10) * fps);

    expect(tourFrameCap(beats, fps)).toBe(expected);
  });
});
