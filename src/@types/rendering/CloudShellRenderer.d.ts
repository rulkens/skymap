/**
 * CloudShellRenderer — the body-agnostic translucent cloud shell drawn just
 * above a planet's opaque surface (Earth today; Venus / Titan opt in later).
 *
 * Its sibling on the surface side (`earthRenderer`) draws the opaque globe; this
 * draws the thin translucent shell of clouds ABOVE it — one closed unit sphere,
 * textured by an equirectangular cloud colour+coverage map (RGB colour, `.a`
 * coverage), lit by the same body-local sun-relative Lambert term as the surface
 * so clouds go dark on the night side. It rides the host body's exact
 * `composeBodyMvp` frame (scaled to the shell radius by the caller), so `draw`
 * needs no body identity — just the packed `CloudShellUniforms` (80 B) and this
 * renderer's single cloud texture.
 *
 * The shell is body-agnostic on purpose: it holds no Earth radius, no
 * `CLOUD_SHELL_PARAMS` — the caller passes the packed uniforms and the map, so
 * any body with a cloud deck reuses this one renderer + pipeline.
 *
 * Extends `Renderer` for the `label` + `destroy` contract every renderer
 * satisfies.
 */

import type { Renderer } from './Renderer';

export type CloudShellRenderer = Renderer & {
  /** Swap in the cloud colour+alpha map (own copy; `.a` is the coverage). */
  setTexture(bitmap: ImageBitmap): void;
  /**
   * Draw the shell for one `CloudShellUniforms` record (80 B) into the pass.
   * `inside` (camera below the shell radius) selects the front-cull pipeline,
   * which renders the closed sphere's inner surface — the outward-normal
   * back-cull pipeline the outside draw uses discards every triangle once the
   * camera sits inside it (Task 10, spec §5c).
   */
  draw(pass: GPURenderPassEncoder, uniforms: Float32Array, inside: boolean): void;
};
