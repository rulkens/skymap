/**
 * InstancedQuadRenderer — public surface returned by
 * `createInstancedQuadRenderer`. Consumers wrap this and re-expose
 * their typed-instance `draw` signature; the engine never imports
 * this type directly.
 */

import type { Vec2 } from '../math/Vec2';
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
   * Bind the hi-res `texture_2d_array` view (and optionally its
   * sampler). Only defined when `config.atlas.hiResArray === true`.
   * The composed bind group waits for BOTH `bindAtlas` and
   * `bindHiResArray` before becoming available — drawing before then
   * no-ops, mirroring the atlas-only deferred-binding contract.
   *
   * The `sampler` override is for tests / atypical filtering; the
   * factory creates a default linear-clamp sampler that production
   * callers want.
   */
  bindHiResArray?: (arrayView: GPUTextureView, sampler?: GPUSampler) => void;
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
    viewport: Vec2;
    instanceBytes: Float32Array;
    instanceCount: number;
    camPosWorld?: Readonly<Vec3>;
    pxPerRad?: number;
    /** Shared cluster-focus bind group, bound at `@group(1)`. Built once by
     *  the engine against the canonical focusBgl and written once per frame;
     *  the same group serves every impostor pipeline. */
    focusBindGroup: GPUBindGroup;
    /**
     * Which `@group(0)` buffer+bindGroup copy this call writes/binds.
     * Defaults to 0. Only meaningful when `config.viewSlotCount > 1`
     * (TexturedDiskRenderer, Task 13b) — every other consumer omits it and
     * always uses the single slot-0 copy, byte-identical to pre-Task-13b
     * behaviour.
     */
    viewSlot?: number;
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
