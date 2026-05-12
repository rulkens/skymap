/**
 * TexturedQuadRenderer — public surface of the screen-aligned textured
 * galaxy-thumbnail renderer (LOD-2 fallback for galaxies missing
 * orientation data). Mirrors the methods the pre-factory `class QuadRenderer`
 * exposed; consumers (engine, thumbnail subsystem, frame body) see the
 * identical shape.
 */

import type { mat4 } from 'gl-matrix';
import type { Vec3 } from '../math/Vec3';
import type { ThumbnailInstance } from './ThumbnailInstance';

export type TexturedQuadRenderer = {
  /**
   * Human-readable identifier (`'texturedQuadRenderer'`).  Part of the
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
   * Issue the draw call. `instances.length` must be ≤ `maxInstances`
   * (the engine pre-filters; in v1 the limit is set to the atlas slot
   * count of 256, so the cap is naturally tight).
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    instances: ReadonlyArray<ThumbnailInstance>,
    camPosWorld: Readonly<Vec3>,
    pxPerRad: number,
  ): void;
  /**
   * Release every GPU buffer this renderer owns. Idempotent.
   */
  destroy(): void;
};
