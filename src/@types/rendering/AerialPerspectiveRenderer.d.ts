/**
 * AerialPerspectiveRenderer — the camera-frustum froxel volume that gives the
 * inside-the-atmosphere path scene depth: in-scatter and per-channel
 * transmittance integrated to each of 32 distance slices along every screen
 * texel's own ray (`froxelLut.wesl`). Second half of Hillaire's split: the
 * sky-view LUT it complements is indexed by DIRECTION alone, so it answers a
 * geometry ray with the whole atmosphere regardless of where that ray stops.
 * Owned by `atmosphereShellRenderer`, over that renderer's own bundles.
 */

import type { Renderer } from './Renderer';

export type AerialPerspectiveRenderer = Renderer & {
  /**
   * Bake body `bodyId`'s froxel volume into the shared 3D textures via a compute
   * pass recorded into the frame `encoder`, ahead of the render pass that samples
   * it. THROWS on an unknown `bodyId` — a programming error, since callers only
   * pass `atmosphereDrawList` ids.
   */
  encodeFroxel(encoder: GPUCommandEncoder, bodyId: string, uniforms: Float32Array): void;

  /**
   * Apply the baked volume to the open pass: a full-screen draw that keys each
   * fragment's slice off `depthView`, so a geometry ray gets the fog of its own
   * distance while a sky ray keeps the sky-view answer. Same throw contract.
   */
  draw(
    pass: GPURenderPassEncoder,
    bodyId: string,
    uniforms: Float32Array,
    depthView: GPUTextureView,
  ): void;
};
