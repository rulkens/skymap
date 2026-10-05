/**
 * DomeResampleRenderer — fisheye-resamples the five `dome-cube` faces into
 * one image (`shaders/domeResample`), draws once per frame into `hdr`.
 */

import type { Renderer } from './Renderer';

export type DomeResampleRenderer = Renderer & {
  /** `faces`: the whole `dome-cube` row, a `2d-array` view over its 5 layers. */
  draw(pass: GPURenderPassEncoder, faces: GPUTextureView): void;
};
