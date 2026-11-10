/** A `ClipCompileError` as plain data, so it can sit in a memoised timeline: why, and which effects. */
import type { Channel } from '../../../../../src/@types/animation/Channel';
import type { ClipCompileReason } from '../../../../../src/@types/animation/ClipCompileReason';
import type { EffectPath } from '../../../../../src/@types/animation/EffectPath';

export type ClipCompileErrorInfo = {
  readonly reason: ClipCompileReason;
  readonly paths: readonly EffectPath[];
  readonly channel?: Channel;
  readonly message: string;
};
