/**
 * DiskRenderer — oriented 3D galaxy disks.
 *
 * Differs from ThumbnailRenderer in two ways:
 *   1. Each instance is tilted in 3D world space: the disk's normal points
 *      toward the camera by default (face-on), and is rotated around the
 *      line-of-sight axis by PA, then tilted by inclination angle
 *      cos(i) = axisRatio. So an axisRatio = 1 disk is face-on; axisRatio
 *      ≈ 0 is edge-on.
 *   2. The fragment shader applies only a soft round-the-corners mask
 *      (the disk silhouette IS the geometry, so the on-screen ellipse
 *      falls out of the projection naturally).
 *
 * Why a separate renderer instead of extending ThumbnailRenderer? ThumbnailRenderer
 * bakes screen-aligned billboarding into the vertex shader — corner offsets
 * are applied in CLIP space after viewProj. Tilting in 3D requires the
 * corners to be transformed in WORLD space and then projected, which is a
 * fundamentally different pipeline. Keeping ThumbnailRenderer alive lets the
 * engine pick the screen-aligned thumbnail path for fallback orientations
 * (where tilting would be cosmetically misleading) and for galaxies still
 * loading their textures.
 *
 * ## Per-instance attributes (48 bytes / 12 floats)
 *
 *   posSize       vec4   xyz, sizeWorld
 *   uvRect        vec4   u0, v0, u1, v1
 *   orientation   vec4   axisRatio, positionAngleDeg, fadeAlpha, _
 *
 * Note: `fadeAlpha` lives in the third slot of the orientation vec4, NOT
 * in a fourth `extras` vec4 like ThumbnailInstance. Keeping the layout to
 * three vec4s (48 bytes total) matches ThumbnailInstance + ProceduralDiskInstance.
 *
 * ## Why this is a thin wrapper post-Spec G
 *
 * Pipeline / BGL / uniform buffer / instance buffer plumbing now lives
 * in `instancedQuadRenderer.ts`, shared with the thumbnail + procedural disk
 * renderers. This file owns: the consumer-facing `createDiskRenderer`
 * factory signature (preserved unchanged from Spec F), the
 * `DiskInstance → packed Float32Array` serialization, and the wrapper
 * `draw(...)` translating the engine's call convention into the
 * shared factory's `draw(args)` shape.
 */

import type { mat4 } from 'gl-matrix';
import type { GpuContext, Renderer, Vec3 } from '../../../@types';
import vsCode from '../shaders/disks/vertex.wesl?static';
import fsCode from '../shaders/disks/fragment.wesl?static';
import { FLOATS_PER_INSTANCE, createInstancedQuadRenderer } from './instancedQuadRenderer';

export type DiskInstance = {
  x: number;
  y: number;
  z: number;
  sizeWorld: number;
  u0: number;
  v0: number;
  u1: number;
  v1: number;
  axisRatio: number;
  positionAngleDeg: number;
  /**
   * Per-frame fade multiplier in [0, 1]. Distance fade × load fade,
   * computed CPU-side by the engine and folded into the shader's final
   * alpha output. See ThumbnailInstance.d.ts for the underlying logic.
   */
  fadeAlpha: number;
};

export type DiskRenderer = {
  /**
   * Human-readable identifier (`'diskRenderer'`).  Part of the
   * shared `Renderer` contract — see `src/@types/Renderer.d.ts`.
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

export function createDiskRenderer(ctx: GpuContext, maxInstances = 256): DiskRenderer {
  const inner = createInstancedQuadRenderer(ctx, {
    label: 'disk',
    vertexSource: vsCode,
    fragmentSource: fsCode,
    atlas: {},
    capacity: { kind: 'fixed', max: maxInstances },
    // Galaxy disks are EMISSIVE — see thumbnailRenderer.ts for the
    // fade-to-black bug history that motivates additive over
    // premultiplied-OVER.
    blend: 'additive',
    format: ctx.format,
  });

  function bindAtlas(atlasView: GPUTextureView): void {
    inner.bindAtlas?.(atlasView);
  }

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    camPos: Readonly<Vec3>,
    instances: ReadonlyArray<DiskInstance>,
  ): void {
    if (instances.length === 0) return;

    // Pre-Spec-G this was a fresh-per-frame allocation; preserve
    // that to keep the refactor mechanical. ~12 KB at the v1 cap
    // of 256 instances.
    const data = new Float32Array(instances.length * FLOATS_PER_INSTANCE);
    for (let i = 0; i < instances.length; i++) {
      const ins = instances[i]!;
      const base = i * FLOATS_PER_INSTANCE;
      data[base + 0] = ins.x;
      data[base + 1] = ins.y;
      data[base + 2] = ins.z;
      data[base + 3] = ins.sizeWorld;
      data[base + 4] = ins.u0;
      data[base + 5] = ins.v0;
      data[base + 6] = ins.u1;
      data[base + 7] = ins.v1;
      data[base + 8] = ins.axisRatio;
      data[base + 9] = ins.positionAngleDeg;
      data[base + 10] = ins.fadeAlpha;
      data[base + 11] = 0;
    }

    inner.draw({
      pass,
      viewProj: viewProj as Float32Array,
      viewport: viewportPx,
      instanceBytes: data,
      instanceCount: instances.length,
      camPosWorld: camPos,
      // DiskRenderer's shader doesn't need pxPerRad — the disk
      // geometry sizes itself in world space — so the trailing
      // uniform slot is left as zero padding (default).
    });
  }

  const renderer: DiskRenderer = {
    label: 'diskRenderer',
    bindAtlas,
    draw,
    destroy: inner.destroy,
  };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
