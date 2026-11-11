/**
 * ClipCompileError — a draft error `compileClip` refuses, addressed to the
 * effects at fault by `EffectPath` and carrying every span walked before the
 * throw, so an editor can mark the culprits and still draw the rest at true
 * times. Programmer errors (an unresolved focus effect) stay plain `Error`s.
 */
import type { ClipCompileReason } from '../../../@types/animation/ClipCompileReason';
import type { EffectPath } from '../../../@types/animation/EffectPath';
import type { EffectSpan } from '../../../@types/animation/EffectSpan';

export class ClipCompileError extends Error {
  readonly reason: ClipCompileReason;
  /** Never empty. */
  readonly paths: readonly EffectPath[];
  readonly spans: readonly EffectSpan[];

  constructor(
    message: string,
    reason: ClipCompileReason,
    paths: readonly EffectPath[],
    spans: readonly EffectSpan[],
    cause?: unknown,
  ) {
    super(message, cause === undefined ? undefined : { cause });
    this.name = 'ClipCompileError';
    this.reason = reason;
    this.paths = paths;
    this.spans = spans;
  }
}
