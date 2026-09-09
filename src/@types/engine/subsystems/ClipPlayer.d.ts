/**
 * ClipPlayer — the tick-phase Resource that fires a clip's scene cues, owns
 * the `clipOpacity` channel and runs clip-completion lifecycle. NOT a camera
 * driver: the pose comes from the pure clip driver in the table. Eager (no
 * GPU dep), so it is non-null from t=0.
 */

import type { VisibilityLayerKey } from '../../animation/VisibilityLayerKey';
import type { CameraEpochs } from '../camera/CameraEpochs';
import type { Destroyable } from '../../rendering/Destroyable';

export type ClipPlayer = {
  /**
   * The FIRST statement of `runFrame`, by contract: cues fired here (and a
   * `frameTween` they dispatch) must be in the store before the frame derives
   * masks, demand or the pose. Advances `clipEpoch` against the live
   * `camera.clip` and hands it back, rebased on a loop wrap; the frame threads
   * it into `advanceEpochs`.
   */
  tick(
    clipEpoch: CameraEpochs['clip'],
    nowMs: number,
  ): { readonly clipEpoch: CameraEpochs['clip'] };

  /**
   * Abort now: dispatches `clipEnded()`, resets, then fires the end-resolver on
   * the same edge natural completion uses — so cancellation RESOLVES `playClip`.
   */
  stop(): void;

  /**
   * One-shot callback for the clip's end edge (natural or `stop()`). Register
   * BEFORE dispatching `clipStarted` so a zero-duration clip cannot complete
   * before the resolver is in place.
   */
  registerEndResolver(onEnd: () => void): void;

  /** 1 for any layer the current clip never touched; back to 1 when the clip ends. */
  clipOpacityOf(layer: VisibilityLayerKey, nowMs: number): number;
} & Destroyable;
