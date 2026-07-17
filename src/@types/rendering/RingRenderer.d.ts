/**
 * RingRenderer — the translucent planetary-ring renderer (Saturn's rings).
 *
 * The other half of the ring system: `texturedBodyRenderer` draws the ring's
 * shadow cast ON the planet; this draws the ring ITSELF — a two-sided
 * translucent annulus in the host body's equatorial plane, textured by a radial
 * alpha strip, with the planet's shadow cast ON the ring (analytic ray-sphere,
 * no shadow map).
 *
 * One shared renderer serves every ring the scene draws (Saturn alone today):
 * its geometry is a ring-agnostic unit disc, and each per-draw `RingUniforms`
 * record punches the hole, rescales for the shadow, and rides the host body's
 * `composeBodyMvp` frame — so `draw` needs no ring identity, just the packed
 * uniforms. `setTexture` swaps in the resident radial strip as an N×1
 * `texture_2d` (never `texture_1d`, which WebKit rejects).
 *
 * Extends `Renderer` for the `label` + `destroy` contract every renderer
 * satisfies.
 */

import type { Renderer } from './Renderer';

export type RingRenderer = Renderer & {
  /** Swap in the radial alpha strip (an N×1 `texture_2d`) as the ring surface. */
  setTexture(bitmap: ImageBitmap): void;
  /** Draw the ring for one `RingUniforms` record (96 B) into the open pass. */
  draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void;
};
