/**
 * FrameStepSpec — one line of `FRAME_ORDER`, the hand-authored frame order.
 * Order and roster are the same artifact: a line names the passes it draws, in
 * draw order, so there is no second table for it to disagree with.
 *
 * Two kinds carry runtime expansion (`capture`, `foreground`), as does a
 * `render` line whose `slab` names a per-frame list.
 */

import type { BloomStepSpec } from './BloomStepSpec';
import type { CaptureStepSpec } from './CaptureStepSpec';
import type { CompositeStepSpec } from './CompositeStepSpec';
import type { ComputeStepSpec } from './ComputeStepSpec';
import type { ForegroundStepSpec } from './ForegroundStepSpec';
import type { RenderStepSpec } from './RenderStepSpec';
import type { TonemapStepSpec } from './TonemapStepSpec';

export type FrameStepSpec =
  | ComputeStepSpec
  | CaptureStepSpec
  | RenderStepSpec
  | ForegroundStepSpec
  | CompositeStepSpec
  | BloomStepSpec
  | TonemapStepSpec;
