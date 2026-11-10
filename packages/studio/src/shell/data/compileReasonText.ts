import type { ClipCompileReason } from '../../../../../src/@types/animation/ClipCompileReason';

/** The top bar's wording for each compile refusal: a few words, no sentence. */
export const COMPILE_REASON_TEXT: Record<ClipCompileReason, string> = {
  twoWriters: '2 writers',
  threeWriters: '3 writers',
  blendWindow: 'blend too long',
  joinRefused: 'join refused',
  seqOverlap: 'overlap too long',
  cueOrder: 'cue out of order',
  compositeClash: 'clash',
  flyPath: 'path invalid',
};
