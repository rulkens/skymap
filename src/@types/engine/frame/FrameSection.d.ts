/**
 * FrameSection — one scoped slice of `FRAME_ORDER`. `scope: 'once'` expands
 * against the frame's main context; `'perView'` expands once per the rig's
 * view, each with its own encoder and submit (see `ViewRig`, `renderFrame`).
 */

import type { FrameStepSpec } from './FrameStepSpec';
import type { SectionScope } from './SectionScope';

export type FrameSection = {
  readonly scope: SectionScope;
  readonly steps: readonly FrameStepSpec[];
};
