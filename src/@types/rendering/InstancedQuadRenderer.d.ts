/**
 * InstancedQuadRenderer — public surface returned by
 * `createInstancedQuadRenderer`. Consumers wrap this and re-expose
 * their typed-instance `draw` signature; the engine never imports
 * this type directly.
 */

import type { Vec3 } from '../math/Vec3';

export type InstancedQuadRenderer = {
  /**
   * Human-readable identifier (`'instancedQuadRenderer'`).  Part of the
   * shared `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;
  /**
   * Bind the atlas texture view. Only defined when `config.atlas`
   * was set. Idempotent — calling again with a different view
   * rebuilds the bind group against the new resource.
   */
  bindAtlas?: (atlasView: GPUTextureView) => void;
  /**
   * Submit one frame's worth of instances. The factory writes the
   * uniform buffer and instance buffer, then calls
   * `pass.draw(6, instanceCount, 0, 0)`. Returns silently with no
   * draw call if `instanceCount === 0`, or — for consumers with
   * `config.atlas` — if `bindAtlas` hasn't been called yet.
   */
  draw: (args: {
    pass: GPURenderPassEncoder;
    viewProj: Float32Array;
    viewport: [number, number];
    instanceBytes: Float32Array;
    instanceCount: number;
    camPosWorld?: Readonly<Vec3>;
    pxPerRad?: number;
  }) => void;
  /**
   * Release the GPU buffers this factory owns: the uniform buffer
   * and the instance buffer (if allocated). Pipeline / BGL / bind
   * group / sampler are JS-side handles with no `.destroy()` —
   * GC reclaims them when the closure drops out of scope.
   * Idempotent: `GPUBuffer.destroy()` is a no-op on already-
   * destroyed buffers per spec.
   */
  destroy: () => void;
};
