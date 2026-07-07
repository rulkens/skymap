/**
 * tourFrameCap — the frame budget the recorder allocates for a slice of
 * beats, in virtual frames at the take's fps.
 *
 * The recorder drives the tour's virtual clock rather than wall time (see the
 * Task 1 spike), so it needs an upper bound on how many frames a take could
 * possibly need — otherwise a beat stuck on an unmet `waitUntil` readiness
 * gate (catalog foci not yet loaded) would spin the recorder forever instead
 * of failing loudly. The bound is derived from the SAME authored-seconds sum
 * `tools/animation/tourLength.ts` prints per beat (enter + dwell, measured
 * statically via `clipDurationSec` — see that module for why stubbing
 * id-bearing cues is duration-exact), then padded:
 *
 *   - ×1.25 — the authored clip length is a lower bound, not a guarantee.
 *     Real playback burns extra wall time on `waitUntil` readiness gates and
 *     load-dissolve tails that don't exist in the static compile.
 *   - +10 flat seconds — a margin sized to the WHOLE take rather than
 *     per-beat, so a single short beat isn't starved by a percentage of an
 *     already-small number.
 *
 * The caller is responsible for slicing `beats` to the requested `--range`
 * first; this function sums whatever slice it's given.
 */
import type { BeatData } from '../../../src/@types/animation/tour/BeatData';
import { clipDurationSec } from '../animation/clipDurationSec';

export function tourFrameCap(beats: readonly BeatData[], fps: number): number {
  const authoredSec = beats.reduce((sum, beat) => {
    const enter = beat.enterClip ? clipDurationSec(beat.enterClip) : 0;
    const dwell = clipDurationSec(beat.dwellClip);
    return sum + enter + dwell;
  }, 0);
  return Math.ceil((authoredSec * 1.25 + 10) * fps);
}
