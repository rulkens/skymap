/**
 * FRAME_ORDER — the frame, hand-authored: what draws, in what order, into what.
 * Concatenation of the four scoped sections in `src/data/rendering/frameSections.ts`
 * (their split is the `ViewRig` seam; the per-line rationale lives there now).
 * Existing readers of the flat list stay valid — `expandFrameOrder`,
 * `checkFrameOrder`, `MAX_PROGRAM` and `pickProgram` all still walk this.
 */

import type { FrameStepSpec } from '../../../@types/engine/frame/FrameStepSpec';
import { OVERLAYS, POST, PRELUDE, SCENE } from '../../../data/rendering/frameSections';

export const FRAME_ORDER: readonly FrameStepSpec[] = [
  ...PRELUDE.steps,
  ...SCENE.steps,
  ...POST.steps,
  ...OVERLAYS.steps,
];
