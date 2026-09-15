/**
 * CubeFaceBlitRenderer — paints one capture face with a cube sampled through a
 * basis: the once-baked solar-system sky laid under a probe's own capture, so
 * the probe's host is drawn over a sky rather than over black.
 */

import type { Mat3 } from '../math/Mat3';
import type { Renderer } from './Renderer';

export type CubeFaceBlitRenderer = Renderer & {
  /** `basis`: world-from-view columns (right, up, back) — the face ctx's `cam.poseBasis`. */
  draw(pass: GPURenderPassEncoder, basis: Readonly<Mat3>, cube: GPUTextureView): void;
};
