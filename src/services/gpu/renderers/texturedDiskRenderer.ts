/**
 * TexturedDiskRenderer — oriented 3D galaxy disks (atlas-textured).
 *
 * Differs from TexturedQuadRenderer in two ways:
 *   1. Each instance is tilted in 3D world space: the disk's normal points
 *      toward the camera by default (face-on), and is rotated around the
 *      line-of-sight axis by PA, then tilted by inclination angle
 *      cos(i) = axisRatio. So an axisRatio = 1 disk is face-on; axisRatio
 *      ≈ 0 is edge-on.
 *   2. The fragment shader applies only a soft round-the-corners mask
 *      (the disk silhouette IS the geometry, so the on-screen ellipse
 *      falls out of the projection naturally).
 *
 * Why a separate renderer instead of extending TexturedQuadRenderer? TexturedQuadRenderer
 * bakes screen-aligned billboarding into the vertex shader — corner offsets
 * are applied in CLIP space after viewProj. Tilting in 3D requires the
 * corners to be transformed in WORLD space and then projected, which is a
 * fundamentally different pipeline. Keeping TexturedQuadRenderer alive lets the
 * engine pick the screen-aligned thumbnail path for fallback orientations
 * (where tilting would be cosmetically misleading) and for galaxies still
 * loading their textures.
 *
 * ## Per-instance attributes (64 bytes / 16 floats)
 *
 *   posSize       vec4   xyz, sizeWorld
 *   uvRect        vec4   u0, v0, u1, v1
 *   orientation   vec4   axisRatio, positionAngleDeg, fadeAlpha, _
 *   hiResSlot     vec4   hiResLayerIdx, hiResCrossfadeAlpha, _, _
 *
 * Note: `fadeAlpha` lives in the third slot of the orientation vec4, NOT
 * in a fourth `extras` vec4 like ThumbnailInstance. The fourth vec4 was
 * added in Task R1 (2026-05-28) for the hi-res LOD work — it carries the
 * `hiResLayerIdx` array-layer index (negative sentinel = no slot) and
 * the `hiResCrossfadeAlpha` low-to-hi-res ramp. The procedural sibling
 * uses the same 64-byte stride but zero-pads the fourth vec4; the
 * shared instancedQuadRenderer factory requires uniform stride.
 *
 * ## Why this is a thin wrapper post-Spec G
 *
 * Pipeline / BGL / uniform buffer / instance buffer plumbing now lives
 * in `instancedQuadRenderer.ts`, shared with the thumbnail + procedural disk
 * renderers. This file owns: the consumer-facing `createTexturedDiskRenderer`
 * factory signature (preserved unchanged from Spec F), the
 * `DiskInstance → packed Float32Array` serialization, and the wrapper
 * `draw(...)` translating the engine's call convention into the
 * shared factory's `draw(args)` shape.
 */

import type { mat4 } from 'gl-matrix';
import type { GpuContext } from '../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { DiskInstance } from '../../../@types/rendering/DiskInstance';
import type { TexturedDiskRenderer } from '../../../@types/rendering/TexturedDiskRenderer';
import type { Vec3 } from '../../../@types/math/Vec3';
import vsCode from '../shaders/texturedDisks/vertex.wesl?static';
import fsCode from '../shaders/texturedDisks/fragment.wesl?static';
import { FLOATS_PER_INSTANCE, createInstancedQuadRenderer } from './instancedQuadRenderer';

export function createTexturedDiskRenderer(ctx: GpuContext, maxInstances = 256): TexturedDiskRenderer {
  const inner = createInstancedQuadRenderer(ctx, {
    label: 'disk',
    vertexSource: vsCode,
    fragmentSource: fsCode,
    atlas: {},
    capacity: { kind: 'fixed', max: maxInstances },
    // Galaxy disks are EMISSIVE — see texturedQuadRenderer.ts for the
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
      // Hi-res LOD attributes (Task R1). Slots 14, 15 are reserved
      // future shelf — kept zero for forward compatibility. The
      // fragment shader doesn't read slot 3 yet (that lands in R3); at
      // R1 these floats are purely pinning the pack-loop slot layout
      // so R5's subsystem populates the right indices.
      data[base + 12] = ins.hiResLayerIdx;
      data[base + 13] = ins.hiResCrossfadeAlpha;
      data[base + 14] = 0;
      data[base + 15] = 0;
    }

    inner.draw({
      pass,
      viewProj: viewProj as Float32Array,
      viewport: viewportPx,
      instanceBytes: data,
      instanceCount: instances.length,
      camPosWorld: camPos,
      // TexturedDiskRenderer's shader doesn't need pxPerRad — the disk
      // geometry sizes itself in world space — so the trailing
      // uniform slot is left as zero padding (default).
    });
  }

  const renderer: TexturedDiskRenderer = {
    label: 'texturedDiskRenderer',
    bindAtlas,
    draw,
    destroy: inner.destroy,
  };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
