/**
 * tourFrameCap — the frame budget the recorder allocates for a slice of
 * beats, in virtual frames at the take's fps.
 *
 * Sums the SAME authored-seconds figure `tools/animation/tourLength.ts`
 * prints per beat (enter + dwell via `clipDurationSec`; see that module for
 * why stubbing id-bearing cues stays duration-exact), then hands the sum to
 * `frameCapFor` for the runaway-guard margin. Caller slices `beats` to the
 * requested `--range` first; this function sums whatever slice it's given.
 */
import type { BeatData } from '../../../src/@types/animation/tour/BeatData';
import { clipDurationSec } from '../animation/clipDurationSec';
import { frameCapFor } from './frameCapFor';

export function tourFrameCap(beats: readonly BeatData[], fps: number): number {
  const authoredSec = beats.reduce((sum, beat) => {
    const enter = beat.enterClip ? clipDurationSec(beat.enterClip) : 0;
    const dwell = clipDurationSec(beat.dwellClip);
    return sum + enter + dwell;
  }, 0);
  return frameCapFor(authoredSec, fps);
}
