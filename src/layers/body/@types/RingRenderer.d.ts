/**
 * RingRenderer: the translucent planetary ring (Saturn's) as a two-sided annulus
 * in the host's equatorial plane, textured by a radial alpha strip, with the
 * planet's shadow cast analytically on it. One ring-agnostic unit disc serves
 * every ring; `RingUniforms` carries the hole, shadow rescale and
 * `composeBodyMvp` frame. The strip is an N x1 `texture_2d` (WebKit rejects
 * `texture_1d`).
 */

import type { Renderer } from '../../../@types/rendering/Renderer';

export type RingRenderer = Renderer & {
  /** Swap in the radial alpha strip (an N×1 `texture_2d`) as the ring surface. */
  setTexture(bitmap: ImageBitmap): void;
  /** Draw the ring for one `RingUniforms` record (96 B) into the open pass. */
  draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void;
};
