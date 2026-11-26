/**
 * DomeResampleRenderer — fisheye-resamples the dome's five per-face layers into
 * one image (`shaders/domeResample`), once per frame: the colour faces into
 * `hdr`, the occlusion masks into `dome-occlusion`.
 */

import type { Renderer } from './Renderer';

export type DomeResampleRenderer = Renderer & {
  /** `faces`: the whole `dome-cube` row, a `2d-array` view over its 5 layers. */
  draw(pass: GPURenderPassEncoder, faces: GPUTextureView): void;
  /** `faceMasks`: the whole `dome-cube-occlusion` row, the same shape. */
  drawOcclusion(pass: GPURenderPassEncoder, faceMasks: GPUTextureView): void;
};
