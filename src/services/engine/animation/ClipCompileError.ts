/**
 * ClipCompileError — a draft error `compileClip` refuses, addressed to the
 * effects at fault by `EffectPath`. Programmer errors (an unresolved focus
 * effect) stay plain `Error`s.
 */
import type { ClipCompileReason } from '../../../@types/animation/ClipCompileReason';
import type { EffectPath } from '../../../@types/animation/EffectPath';

export class ClipCompileError extends Error {
  readonly reason: ClipCompileReason;
  /** Never empty. */
  readonly paths: readonly EffectPath[];

  constructor(
    message: string,
    reason: ClipCompileReason,
    paths: readonly EffectPath[],
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ClipCompileError';
    this.reason = reason;
    this.paths = paths;
  }
}
