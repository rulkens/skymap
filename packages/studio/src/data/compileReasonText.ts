/** Each compile refusal in words, one entry per reason so a new reason fails to compile here. */
import type { ClipCompileReason } from '../../../../src/@types/animation/ClipCompileReason';
import type { ReasonText } from '../@types/rows/ReasonText';

export const COMPILE_REASON_TEXT: Record<ClipCompileReason, ReasonText> = {
  twoWriters: { short: '2 writers', long: 'Two steps move the same channel at once' },
  threeWriters: { short: '3 writers', long: 'Three steps move the same channel at once' },
  blendWindow: { short: 'blend too long', long: 'Blend is longer than the steps it joins' },
  joinRefused: { short: 'join refused', long: 'These two steps cannot join' },
  seqOverlap: { short: 'overlap too long', long: 'Blend is longer than the steps it joins' },
  cueOrder: { short: 'cue out of order', long: 'A cue is out of order' },
  compositeClash: { short: 'clash', long: 'A path and another step move the same channel' },
  flyPath: { short: 'path invalid', long: 'This path cannot be flown' },
};
