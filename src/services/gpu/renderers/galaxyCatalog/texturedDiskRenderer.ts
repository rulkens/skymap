/**
 * TexturedDiskRenderer — oriented 3D galaxy disks (atlas-textured).
 *
 * Differs from TexturedQuadRenderer in two ways:
 *   1. Each instance is tilted in 3D world space: the disk's normal points
 *      toward the camera by default (face-on), then rotated around the
 *      line-of-sight axis by PA and tilted by inclination angle
 *      cos(i) = axisRatio. axisRatio = 1 is face-on; axisRatio ≈ 0 is edge-on.
 *   2. The fragment shader applies only a soft round-the-corners mask
 *      (the disk silhouette IS the geometry, so the on-screen ellipse
 *      falls out of the projection naturally).
 *
 * Why a separate renderer? TexturedQuadRenderer bakes screen-aligned
 * billboarding into the vertex shader — corner offsets are applied in
 * CLIP space after viewProj. Tilting in 3D requires the corners to be
 * transformed in WORLD space and then projected, a fundamentally
 * different pipeline. Keeping TexturedQuadRenderer alive lets the engine
 * pick the screen-aligned thumbnail path for fallback orientations
 * (where tilting would be cosmetically misleading) and for galaxies
 * still loading their textures.
 *
 * ## Per-instance attributes (64 bytes / 16 floats)
 *
 *   posSize       vec4   xyz, sizeWorld
 *   uvRect        vec4   u0, v0, u1, v1
 *   orientation   vec4   axisRatio, positionAngleDeg, fadeAlpha, _
 *   hiResSlot     vec4   hiResLayerIdx, hiResCrossfadeAlpha, nucleusOffset.x, nucleusOffset.y
 *
 * 'fadeAlpha' lives in the orientation vec4's third slot rather than a
 * separate vec4. The fourth vec4 ('hiResSlot') carries the hi-res LOD
 * array-layer index (negative sentinel = no slot) and the low-to-hi-res
 * crossfade ramp in .x/.y; its .z/.w carry the calibrated nucleus offset
 * (local corner frame, [0, 0] = centred) the vertex stage subtracts from
 * each corner. The procedural sibling zero-pads this fourth vec4; the
 * shared instancedQuadRenderer factory requires uniform stride.
 */

import type { Mat4 } from 'wgpu-matrix';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { DiskInstance } from '../../../../@types/rendering/DiskInstance';
import type { TexturedDiskRenderer } from '../../../../@types/rendering/TexturedDiskRenderer';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { FocusUniformsBgl } from '../../../../@types/rendering/FocusUniformsBgl';
import vsCode from '../../shaders/galaxyCatalog/texturedDisks/vertex.wesl?static';
import fsCode from '../../shaders/galaxyCatalog/texturedDisks/fragment.wesl?static';
import { FLOATS_PER_INSTANCE, createInstancedQuadRenderer } from './instancedQuadRenderer';
import { VIEW_SLOT_COUNT } from '../../../../utils/gpu/createViewSlotUniformRing';

type Init = {
  device: GPUDevice;
  context: GPUCanvasContext;
  /**
   * The colour-target format the disk pipeline writes into — the HDR offscreen
   * (`'rgba16float'`), NOT the swap chain. Passed explicitly (never a
   * `GpuContext.format`, which is always the swap-chain format).
   */
  targetFormat: GPUTextureFormat;
  canvas: HTMLCanvasElement;
};

export function createTexturedDiskRenderer(
  init: Init,
  focusBgl: FocusUniformsBgl,
  maxInstances = 256,
): TexturedDiskRenderer {
  const inner = createInstancedQuadRenderer(init.device, {
    label: 'disk',
    vertexSource: vsCode,
    fragmentSource: fsCode,
    focusBgl,
    // 'hiResArray: true' makes the shared factory append @binding(3,4)
    // (texture_2d_array + sampler) to the BGL so the fragment shader's
    // hi-res sample matches the pipeline layout. The bind group only
    // composes once the engine calls 'bindHiResArray' with a real view;
    // until then no draw call fires for textured disks.
    atlas: { hiResArray: true },
    capacity: { kind: 'fixed', max: maxInstances },
    // Galaxy disks are EMISSIVE. Premultiplied OVER would treat the
    // cutout's dark sky as black rather than alpha 0, producing a
    // fade-to-black at thumbnail edges.
    blend: 'additive',
    targetFormat: init.targetFormat,
    // Sky-cubemap capture roster (Task 13b, Ruling 6): texturedDisksLayer's
    // draw() calls span the main view plus up to 6 captured faces, all
    // before one submit() — see `InstancedQuadConfig.viewSlotCount`'s doc.
    viewSlotCount: VIEW_SLOT_COUNT,
  });

  function bindAtlas(atlasView: GPUTextureView): void {
    inner.bindAtlas?.(atlasView);
  }

  // The inner factory exposes 'bindHiResArray' only when the renderer
  // was built with 'atlas.hiResArray: true' (it is, above) — the
  // optional chain is belt-and-braces. Until the engine calls this
  // with a real view, the bind group withholds composition and no
  // draw fires; see the inner factory's 'composeAtlasBindGroup()'.
  function bindHiResArray(arrayView: GPUTextureView, sampler?: GPUSampler): void {
    inner.bindHiResArray?.(arrayView, sampler);
  }

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Mat4,
    viewportPx: Vec2,
    camPos: Readonly<Vec3>,
    focusBindGroup: GPUBindGroup,
    instances: ReadonlyArray<DiskInstance>,
    viewSlot = 0,
  ): void {
    if (instances.length === 0) return;

    // Fresh allocation per frame. ~16 KB at the cap of 256 instances —
    // GC churn isn't load-bearing today.
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
      // Hi-res LOD: layer index (negative = no slot bound, atlas only)
      // and the low-to-hi-res crossfade alpha. Slots 14, 15 carry the
      // calibrated nucleus offset (local corner frame, [0, 0] = centred);
      // the vertex stage subtracts it from each corner.
      data[base + 12] = ins.hiResLayerIdx;
      data[base + 13] = ins.hiResCrossfadeAlpha;
      data[base + 14] = ins.nucleusOffset[0];
      data[base + 15] = ins.nucleusOffset[1];
    }

    inner.draw({
      pass,
      viewProj: viewProj as Float32Array,
      viewport: viewportPx,
      instanceBytes: data,
      instanceCount: instances.length,
      camPosWorld: camPos,
      focusBindGroup,
      // pxPerRad omitted — the disk geometry sizes itself in world
      // space, so the trailing uniform slot stays zero-padded.
      viewSlot,
    });
  }

  const renderer: TexturedDiskRenderer = {
    label: 'texturedDiskRenderer',
    bindAtlas,
    bindHiResArray,
    draw,
    destroy: inner.destroy,
  };
  // 'satisfies Renderer' confirms the shared label+destroy contract
  // without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
