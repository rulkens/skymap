/**
 * AerialPerspectiveRenderer — the inside-the-atmosphere apply: one full-screen
 * pair over the body the camera is inside, keyed per pixel on the foreground
 * row's depth. Second half of Hillaire's split — the sky-view LUT it
 * complements is indexed by DIRECTION alone, so it answers a geometry ray with
 * the whole atmosphere regardless of where that ray stops. SPIKE variant: the
 * geometry branch marches the shared integrand per pixel rather than reading a
 * baked froxel volume. Owned by `atmosphereShellRenderer`, over its bundles.
 */

import type { Renderer } from './Renderer';
import type { AerialBundleResources } from './AerialBundleResources';

export type AerialPerspectiveRenderer = Renderer & {
  /**
   * Apply the fog to the open pass: a full-screen MULTIPLY + ADD pair that
   * branches each fragment on `depthView`, so a geometry ray gets the fog of
   * its own distance while a sky ray keeps the sky-view answer. THROWS on an
   * unknown `bodyId` — a programming error, since callers only pass
   * `atmosphereDrawList` ids.
   */
  draw(
    pass: GPURenderPassEncoder,
    bodyId: string,
    uniforms: Float32Array,
    depthView: GPUTextureView,
  ): void;

  /**
   * Re-take a body's bundle views after the shell's tier `reconcile` destroyed
   * and recreated its sky-view LUT — a bind group holds the VIEW, not the
   * variable, so it would otherwise keep pointing at the destroyed texture.
   */
  rebind(bodyId: string, bundle: AerialBundleResources): void;
};
