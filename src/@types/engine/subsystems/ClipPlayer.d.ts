/**
 * ClipPlayer — the tick-phase Resource that evaluates a playing clip's scene at the clip clock,
 * publishes its changes to the subsystems that animate them, and runs the end of the play. NOT a
 * camera driver: the pose comes from the pure clip driver. Eager (no GPU dep), so it is non-null
 * from t=0.
 */

import type { VisibilityAddress } from '../../animation/VisibilityAddress';
import type { CameraEpochs } from '../camera/CameraEpochs';
import type { Destroyable } from '../../rendering/Destroyable';
import type { RootState } from '../../../store/types';

export type ClipPlayer = {
  /**
   * runFrame's FIRST statement, by contract: a step's frame roll must be in the store before the
   * frame derives its basis. Advances `clipEpoch` against the live `camera.clip`; the frame
   * threads the result into `advanceEpochs`.
   */
  tick(
    clipEpoch: CameraEpochs['clip'],
    nowMs: number,
  ): { readonly clipEpoch: CameraEpochs['clip'] };

  /** Ends the play at the current t by its `atEnd`, then fires the end-resolver — cancellation RESOLVES `playClip`. */
  stop(): void;

  /** Register BEFORE `clipStarted`, or a zero-duration clip completes with no resolver. */
  registerEndResolver(onEnd: () => void): void;

  /** The clip factor at the current t; 1 with no clip, or for an address the clip never fades. */
  clipOpacityOf(address: VisibilityAddress): number;

  /** `root` with the live clip's scene at the current t folded in; `root` itself with no clip. Memoized. */
  view(root: RootState): RootState;

  /** The clock the last tick evaluated; `held` when a running transport is clamped at its end. Null with no clip. */
  clipAt(): { readonly sec: number; readonly held: boolean } | null;
} & Destroyable;
