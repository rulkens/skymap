/**
 * FrameStepSpec — one line of `FRAME_ORDER`, the hand-authored frame order.
 * Order and roster are the same artifact: a line names the passes it draws, in
 * draw order, so there is no second table for it to disagree with.
 *
 * Three kinds carry runtime expansion (`capture`, `foreground`, `lens`) — the
 * per-frame lists the frame used to pass as separate program parameters.
 */

import type { BloomStepSpec } from './BloomStepSpec';
import type { CaptureStepSpec } from './CaptureStepSpec';
import type { CompositeStepSpec } from './CompositeStepSpec';
import type { ComputeStepSpec } from './ComputeStepSpec';
import type { ForegroundStepSpec } from './ForegroundStepSpec';
import type { LensStepSpec } from './LensStepSpec';
import type { RenderStepSpec } from './RenderStepSpec';
import type { TonemapStepSpec } from './TonemapStepSpec';

export type FrameStepSpec =
  | ComputeStepSpec
  | CaptureStepSpec
  | RenderStepSpec
  | ForegroundStepSpec
  | LensStepSpec
  | CompositeStepSpec
  | BloomStepSpec
  | TonemapStepSpec;
