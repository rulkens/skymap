/**
 * CompileFault — a post-walk validator's refusal, naming the compiled objects at
 * fault (base segments, composite tracks, scene cues) by identity. The validators
 * never see effect paths; `compileClip` maps each culprit back to the effect that
 * emitted it and rethrows a `ClipCompileError` with the same message.
 */
import type { ClipCompileReason } from '../../../@types/animation/ClipCompileReason';

export class CompileFault extends Error {
  readonly reason: ClipCompileReason;
  readonly culprits: readonly object[];

  constructor(message: string, reason: ClipCompileReason, culprits: readonly object[]) {
    super(message);
    this.name = 'CompileFault';
    this.reason = reason;
    this.culprits = culprits;
  }
}
