/**
 * clipDurationSec — the compiled wall-clock length of a clip, in seconds,
 * measured statically (no catalog data, no camera, no playback).
 *
 * Unresolved id-bearing cues are stubbed duration-neutrally first (see
 * `stubResolveClipFoci` for why that is exact), then the real `compileClip`
 * reports `durationSec` — the same value `visitBeatSaga` uses for the dwell
 * timer and countdown ring. A beat's wall time is
 * `clipDurationSec(enterClip) + clipDurationSec(dwellClip)`.
 */

import type { ClipData } from '../../../src/@types/animation/ClipData';
import { compileClip } from '../../../src/services/engine/animation/compileClip';
import { stubResolveClipFoci } from './stubResolveClipFoci';

export function clipDurationSec(clip: ClipData): number {
  return compileClip(stubResolveClipFoci(clip)).durationSec;
}
