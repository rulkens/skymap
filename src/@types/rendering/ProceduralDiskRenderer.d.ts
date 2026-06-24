/**
 * ProceduralDiskRenderer — public handle for the procedural-disk pass
 * that bridges the visibility band between point glow (~8 px) and
 * textured disks (~24 px).
 */

import type { Vec3 } from '../math/Vec3';
import type { ProceduralDiskInstance } from './ProceduralDiskInstance';

export type ProceduralDiskRenderer = {
  /**
   * Human-readable identifier (`'proceduralDiskRenderer'`).  Part of
   * the shared `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;
  /**
   * Issue one draw call for the given list of instances. Packs the
   * instance data into the GPU vertex buffer (re-allocating if it grew),
   * writes the uniform buffer, and emits `draw(6, instances.length)`.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewport: [number, number],
    camPosWorld: Readonly<Vec3>,
    pxPerRad: number,
    sceneBindGroup: GPUBindGroup,
    instances: ReadonlyArray<ProceduralDiskInstance>,
  ): void;
  /**
   * Draw the retained procedural-disk instances into the active pick
   * render pass using the r32uint pick pipeline. No-op until 'draw' has
   * uploaded at least one instance this frame. Caller (pickRenderer) has
   * already bound the shared camera + focus state on the pick pass.
   */
  pickDisks(pass: GPURenderPassEncoder): void;
  /** Release the uniform + per-instance vertex buffers. */
  destroy(): void;
};
