/**
 * outputProjectionUniform — the TS writer for `lib/projectLabel.wesl`'s
 * `OutputProjection` struct. Byte layout (the `projectLabel.parity` test holds
 * it to the WGSL):
 *
 *   0..47 viewFromWorld (3 columns, each padded to 16) · 48 camHi · 60 focalPx
 *   64 camLo · 76 pxScale · 80 up3 · 92 kind (u32) · 96 sizePx · 104 centrePx
 *
 * A const and its writer in one file, as `cameraUniforms.ts` does.
 */

import type { OutputProjection } from '../../../@types/rendering/OutputProjection';

export const OUTPUT_PROJECTION_BYTES = 112;

// Mirrored by `KIND_PINHOLE` / `KIND_EQUIDISTANT` in the shader (same parity test).
const KIND_CODE: Readonly<Record<OutputProjection['kind'], number>> = {
  pinhole: 0,
  equidistant: 1,
};

/** Writes `p` at f32 index `at` of `target`; allocates nothing beyond a u32 view. */
export function writeOutputProjection(target: Float32Array, at: number, p: OutputProjection): void {
  for (let c = 0; c < 3; c++) {
    for (let r = 0; r < 3; r++) target[at + c * 4 + r] = p.viewFromWorld[c * 3 + r]!;
    target[at + c * 4 + 3] = 0;
  }
  target.set(p.camHi, at + 12);
  target[at + 15] = p.focalPx;
  target.set(p.camLo, at + 16);
  target[at + 19] = p.pxScale;
  target.set(p.up3, at + 20);
  new Uint32Array(target.buffer, target.byteOffset, target.length)[at + 23] = KIND_CODE[p.kind];
  target.set(p.sizePx, at + 24);
  target.set(p.centrePx, at + 26);
}
