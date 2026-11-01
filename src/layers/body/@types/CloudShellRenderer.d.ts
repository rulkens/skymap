/**
 * CloudShellRenderer: the body-agnostic translucent cloud shell above a planet's
 * opaque surface. One closed unit sphere textured by an equirectangular cloud map
 * (RGB colour, `.a` coverage), riding the host's `composeBodyMvp` frame (scaled to
 * the shell radius by the caller), so `draw` needs no body identity.
 */

import type { Renderer } from '../../../@types/rendering/Renderer';

export type CloudShellRenderer = Renderer & {
  /** Swap in the cloud colour+alpha map (own copy; `.a` is the coverage). */
  setTexture(bitmap: ImageBitmap): void;
  /** Destroy the map (no-op if none); the transparent placeholder binds again. */
  clearTexture(): void;
  /**
   * Draw the shell for one `CloudShellUniforms` record (80 B). `inside` (camera
   * below the shell radius) selects the front-cull pipeline: the outside
   * pipeline's back-cull discards every triangle once the camera is inside.
   */
  draw(pass: GPURenderPassEncoder, uniforms: Float32Array, inside: boolean): void;
};
