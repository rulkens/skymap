/**
 * AerialPerspectiveRenderer — the inside-the-atmosphere path: a camera-local
 * froxel volume baked once per frame, then applied full-screen and keyed per
 * pixel on the foreground row's depth. Second half of Hillaire's split — the
 * sky-view LUT it complements is indexed by DIRECTION alone, so it answers a
 * geometry ray with the whole atmosphere regardless of where that ray stops.
 */

import type { Renderer } from './Renderer';
import type { AerialBundleResources } from './AerialBundleResources';

export type AerialPerspectiveRenderer = Renderer & {
  /**
   * Bake body `bodyId`'s in-scatter + transmittance volumes into the caller's
   * compute pass. The frame's ONLY write of that body's shell uniform record:
   * `draw` unprojects with exactly what this wrote, so the two can never
   * disagree about the camera the volume was marched from. THROWS on an unknown
   * `bodyId` — a programming error, since callers only pass
   * `atmosphereDrawList` ids.
   */
  bake(pass: GPUComputePassEncoder, bodyId: string, uniforms: Float32Array): void;

  /**
   * Apply the fog to the open pass: a full-screen MULTIPLY + ADD pair that
   * branches each fragment on `depthView`, so a geometry ray reads the volume at
   * its own distance while a sky ray keeps the sky-view answer. Writes no
   * buffer — the record `bake` wrote this frame is the one it unprojects with.
   * THROWS on an unknown `bodyId`.
   */
  draw(pass: GPURenderPassEncoder, bodyId: string, depthView: GPUTextureView): void;

  /**
   * Re-take a body's bundle views after the shell's tier `reconcile` destroyed
   * and recreated its sky-view LUT — a bind group holds the VIEW, not the
   * variable, so it would otherwise keep pointing at the destroyed texture.
   */
  rebind(bodyId: string, bundle: AerialBundleResources): void;
};
