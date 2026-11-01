/**
 * AerialPerspectiveRenderer: the inside-the-atmosphere path. A camera-local froxel
 * volume is baked once per frame, then applied full-screen keyed per pixel on the
 * foreground depth (the sky-view LUT is indexed by direction alone, so it cannot
 * stop a ray at geometry).
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { AerialBundleResources } from './AerialBundleResources';

export type AerialPerspectiveRenderer = Renderer & {
  /**
   * Bake body `bodyId`'s in-scatter + transmittance volumes into the caller's
   * compute pass. The frame's ONLY write of that body's shell uniform record, which
   * `draw` unprojects with. THROWS on an unknown `bodyId`.
   */
  bake(pass: GPUComputePassEncoder, bodyId: string, uniforms: Float32Array): void;

  /**
   * Apply the fog: a full-screen MULTIPLY + ADD pair branching on `depthView`
   * (geometry rays read the volume at their distance, sky rays the sky-view LUT).
   * Writes no buffer. THROWS on an unknown `bodyId`.
   */
  draw(pass: GPURenderPassEncoder, bodyId: string, depthView: GPUTextureView): void;

  /**
   * Re-take a body's bundle views after the shell's tier `reconcile` recreated its
   * sky-view LUT; a bind group holds the view, so it would point at a destroyed
   * texture.
   */
  rebind(bodyId: string, bundle: AerialBundleResources): void;
};
