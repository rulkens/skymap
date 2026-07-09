/**
 * ProceduralDiskRenderer — public handle for the procedural-disk pass
 * that bridges the visibility band between point glow (~8 px) and
 * textured disks (~24 px).
 */

import type { Vec2 } from '../math/Vec2';
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
    viewport: Vec2,
    camPosWorld: Readonly<Vec3>,
    pxPerRad: number,
    focusBindGroup: GPUBindGroup,
    instances: ReadonlyArray<ProceduralDiskInstance>,
  ): void;
  /**
   * Draw the retained procedural-disk instances into the active pick
   * render pass using the r32uint pick pipeline. No-op until 'draw' has
   * uploaded at least one instance this frame.
   *
   * The disk CONTENT (the last-drawn LOD set) is retained by the renderer
   * and replayed; the CAMERA is supplied by the caller per call
   * (`viewProj` / `viewport` / `camPosWorld` / `pxPerRad` /
   * `focusBindGroup`) so the pick uniform always reflects the frame being
   * picked, never a stale draw()-time stash.
   */
  pickDisks(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewport: Vec2,
    camPosWorld: Readonly<Vec3>,
    pxPerRad: number,
    focusBindGroup: GPUBindGroup,
  ): void;
  /** Release the uniform + per-instance vertex buffers. */
  destroy(): void;
};
