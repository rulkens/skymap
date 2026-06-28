/**
 * TexturedDiskRenderer — oriented 3D galaxy disks (renderer handle
 * shape) — atlas-textured LOD-2 sibling of texturedQuadRenderer.
 *
 * Differs from TexturedQuadRenderer: each instance is tilted in 3D world
 * space (the disk's normal points toward the camera by default, rotated
 * by PA, tilted by inclination cos(i) = axisRatio).  See the runtime
 * `texturedDiskRenderer.ts` module header for the full pipeline rationale.
 */

import type { mat4 } from 'gl-matrix';
import type { Vec2 } from '../math/Vec2';
import type { Vec3 } from '../math/Vec3';
import type { DiskInstance } from './DiskInstance';

export type TexturedDiskRenderer = {
  /**
   * Human-readable identifier (`'texturedDiskRenderer'`).  Part of the
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
   * Bind the hi-res `texture_2d_array` view. Must be called before any
   * draw — the inner factory withholds the bind group until both the
   * atlas view and the hi-res array view are present, so calling only
   * `bindAtlas` results in a silent no-op draw.
   *
   * Optional sampler override: pass a sampler tuned for the hi-res
   * array (e.g. higher-anisotropy); defaults to a linear sampler
   * created by the inner factory.
   */
  bindHiResArray(arrayView: GPUTextureView, sampler?: GPUSampler): void;
  /**
   * Issue the draw call. `instances.length` must be ≤ `maxInstances`.
   * The engine filters down to the disk-eligible subset before calling.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: Vec2,
    camPos: Readonly<Vec3>,
    focusBindGroup: GPUBindGroup,
    instances: ReadonlyArray<DiskInstance>,
  ): void;
  /**
   * Release every GPU buffer this renderer owns. Idempotent.
   */
  destroy(): void;
};
