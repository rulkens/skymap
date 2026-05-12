/**
 * DiskRenderer — oriented 3D galaxy disks (renderer handle shape).
 *
 * Differs from ThumbnailRenderer: each instance is tilted in 3D world
 * space (the disk's normal points toward the camera by default, rotated
 * by PA, tilted by inclination cos(i) = axisRatio).  See the runtime
 * `diskRenderer.ts` module header for the full pipeline rationale.
 */

import type { mat4 } from 'gl-matrix';
import type { Vec3 } from '../math/Vec3';
import type { DiskInstance } from './DiskInstance';

export type DiskRenderer = {
  /**
   * Human-readable identifier (`'diskRenderer'`).  Part of the
   * shared `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;
  /**
   * Bind the atlas texture view. Must be called once after
   * `atlas.initTexture()`; the bind group can be reused across frames
   * because the atlas's underlying texture doesn't change identity.
   */
  bindAtlas(atlasView: GPUTextureView): void;
  /**
   * Issue the draw call. `instances.length` must be ≤ `maxInstances`.
   * The engine is responsible for filtering down to the disk-eligible
   * subset (real orientation data + apparent size large enough to warrant
   * a 3D plane vs the screen-aligned quad fallback).
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    camPos: Readonly<Vec3>,
    instances: ReadonlyArray<DiskInstance>,
  ): void;
  /**
   * Release every GPU buffer this renderer owns. Idempotent.
   */
  destroy(): void;
};
