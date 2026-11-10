/** One line per compile-refusal reason, for the chip on the offending row. */
import type { ClipCompileReason } from '../../../../../src/@types/animation/ClipCompileReason';

export const REASON_TEXT: Record<ClipCompileReason, string> = {
  twoWriters: 'Two steps move the same channel at once',
  threeWriters: 'Three steps move the same channel at once',
  blendWindow: 'Blend is longer than the steps it joins',
  joinRefused: 'These two steps cannot join',
  seqOverlap: 'Blend is longer than the steps it joins',
  cueOrder: 'A cue is out of order',
  compositeClash: 'A path and another step move the same channel',
  flyPath: 'This path cannot be flown',
};
