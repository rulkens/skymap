/**
 * CompileFault — a post-walk validator's refusal, naming the compiled objects at
 * fault (base segments, composite tracks, scene cues) by identity. The validators
 * never see effect paths; `compileClip` maps each culprit back to the effect that
 * emitted it and rethrows a `ClipCompileError` with the same message.
 */
import type { Channel } from '../../../@types/animation/Channel';
import type { ClipCompileReason } from '../../../@types/animation/ClipCompileReason';

export class CompileFault extends Error {
  readonly reason: ClipCompileReason;
  readonly culprits: readonly object[];
  readonly channel?: Channel;

  constructor(
    message: string,
    reason: ClipCompileReason,
    culprits: readonly object[],
    channel?: Channel,
  ) {
    super(message);
    this.name = 'CompileFault';
    this.reason = reason;
    this.culprits = culprits;
    if (channel !== undefined) this.channel = channel;
  }
}
