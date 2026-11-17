/**
 * FRAME_ORDER — the frame, hand-authored: what draws, in what order, into what.
 * Concatenation of the scoped sections in `src/data/rendering/frameSections.ts`
 * (their split is the `ViewRig` seam; the per-line rationale lives there now).
 * Readers of the flat list — `expandFrameOrder`, `MAX_PROGRAM` and
 * `pickProgram`; `checkFrameOrder` takes the sections themselves.
 */

import type { FrameStepSpec } from '../../../@types/engine/frame/FrameStepSpec';
import {
  LABELS,
  POST,
  PRELUDE,
  SCENE,
  SELECTION_OVERLAYS,
} from '../../../data/rendering/frameSections';

export const FRAME_ORDER: readonly FrameStepSpec[] = [
  ...PRELUDE.steps,
  ...SCENE.steps,
  ...POST.steps,
  ...SELECTION_OVERLAYS.steps,
  ...LABELS.steps,
];
