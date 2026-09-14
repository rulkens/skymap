/**
 * CaptureFaceInput — a scheduled face as the expansion sees it: camera-free,
 * because `MAX_FRAME_INPUTS` must enumerate every face a frame could ever
 * step with no camera to derive one from.
 */

import type { CubeFace } from '../../rendering/CubeFace';

export type CaptureFaceInput = {
  readonly face: CubeFace;
  readonly bodySlabs: readonly number[];
};
