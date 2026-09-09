/**
 * ClipPlayer — the tick-phase Resource that fires a clip's scene cues, owns
 * the `clipOpacity` channel and runs clip-completion lifecycle. NOT a camera
 * driver: the pose comes from the pure clip driver. Eager (no GPU dep), so
 * it is non-null from t=0.
 */

import type { VisibilityLayerKey } from '../../animation/VisibilityLayerKey';
import type { CameraEpochs } from '../camera/CameraEpochs';
import type { Destroyable } from '../../rendering/Destroyable';

export type ClipPlayer = {
  /**
   * runFrame's FIRST statement, by contract: a cue's `frameTween` must be in
   * the store before the frame derives its basis. Advances `clipEpoch` against
   * the live `camera.clip`; the frame threads the result into `advanceEpochs`.
   */
  tick(
    clipEpoch: CameraEpochs['clip'],
    nowMs: number,
  ): { readonly clipEpoch: CameraEpochs['clip'] };

  /** Dispatches `clipEnded()` and fires the end-resolver — cancellation RESOLVES `playClip`. */
  stop(): void;

  /** Register BEFORE `clipStarted`, or a zero-duration clip completes with no resolver. */
  registerEndResolver(onEnd: () => void): void;

  /** 1 for any layer the current clip never touched; back to 1 when the clip ends. */
  clipOpacityOf(layer: VisibilityLayerKey, nowMs: number): number;
} & Destroyable;
