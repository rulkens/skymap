/**
 * FrameSection — one scoped slice of `FRAME_ORDER`. `scope: 'once'` expands
 * against the frame's main context; `'perView'` expands once per the rig's
 * view, each with its own encoder and submit (see `ViewRig`, `renderFrame`).
 */

import type { FrameStepSpec } from './FrameStepSpec';

export type FrameSection = {
  readonly scope: 'once' | 'perView';
  readonly steps: readonly FrameStepSpec[];
};
