import type { PoseFrame } from '../../camera/pose/PoseFrame';
import type { BaseSegment } from './BaseSegment';

/** One stretch of clip time whose tweens share a reference frame (`buildFrameLegs`). */
export type FrameLeg = {
  readonly frame: PoseFrame;
  readonly startSec: number;
  /** The endpoint that opened the leg — the memo key for its converted start. */
  readonly anchor: BaseSegment | null;
};
