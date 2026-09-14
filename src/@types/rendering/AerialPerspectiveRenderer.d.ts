/**
 * AerialPerspectiveRenderer — the camera-frustum froxel volume that gives the
 * inside-the-atmosphere path scene depth: in-scatter and per-channel
 * transmittance integrated to each of 32 distance slices along every screen
 * texel's own ray (`froxelLut.wesl`). The sky-view LUT it complements is
 * indexed by DIRECTION alone, so it hands a geometry ray the whole-atmosphere
 * answer regardless of where that geometry stops — Hillaire's split, of which
 * this is the second half.
 *
 * ONE volume pair, not one per body: only one body can be inside at a time, so
 * a per-body allocation would be 31 idle copies. The per-body resources are the
 * `AtmosphereUniforms` buffer and the bake bind group — each body writes its own
 * buffer immediately before its own dispatch, the `queue.writeBuffer`/`submit`
 * ordering trap defused by construction (`atmosphereShellRenderer`'s header).
 *
 * Owned by `atmosphereShellRenderer`, which constructs it over its bundles'
 * buffers and LUT textures and delegates `encodeFroxel` to it.
 */

import type { Renderer } from './Renderer';

export type AerialPerspectiveRenderer = Renderer & {
  /**
   * Bake body `bodyId`'s froxel volume into the shared 3D textures via a compute
   * pass recorded into the frame `encoder`, ahead of the render pass that
   * samples it. Writes `uniforms` to that body's own froxel `AtmosphereUniforms`
   * buffer first, then dispatches. THROWS on an unknown `bodyId` (a programming
   * error — callers only pass `atmosphereDrawList` ids, which come from the same
   * table the shell renderer bundles).
   *
   * `uniforms` is the 176-byte `AtmosphereUniforms` record from
   * `atmosphereShellUniforms` — the SAME builder and the SAME record the shell
   * draw and the apply read, which is what makes the bake's rays and the
   * apply's rays the same rays.
   */
  encodeFroxel(encoder: GPUCommandEncoder, bodyId: string, uniforms: Float32Array): void;

  /**
   * Apply the baked volume to the open pass: a full-screen draw that keys each
   * fragment's slice off `depthView`, so a geometry ray gets the fog of its own
   * distance while a sky ray keeps the sky-view answer. Same
   * throw-on-unknown-`bodyId` contract as `encodeFroxel`.
   */
  draw(
    pass: GPURenderPassEncoder,
    bodyId: string,
    uniforms: Float32Array,
    depthView: GPUTextureView,
  ): void;
};
