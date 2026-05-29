/**
 * proceduralDiskRenderer — 3D-oriented procedural galaxy impostors.
 *
 * Sibling to texturedDiskRenderer (texture-based) and texturedQuadRenderer
 * (screen-aligned + texture-based). Activates for galaxies in the
 * apparent-size band 8..∞ px, with a crossfade against the points pass
 * across 8..14 px. The shader ('shaders/proceduralDisks/') is documented
 * in detail; this file is the JS-side glue.
 *
 * ## Per-instance attributes (64 bytes / 16 floats)
 *
 *   posSize       vec4   xyz, sizeWorldMpc
 *   orientation   vec4   axisRatio, positionAngleDeg, _, _
 *   extras        vec4   colourIndex, crossfadeAlpha, procFadeOut, _
 *   hiResSlot     vec4   _, _, _, _   (shared 64-byte stride; the procedural
 *                                       shader ignores slots 12..15 — they
 *                                       belong to texturedDiskRenderer)
 *
 * 'procFadeOut' is the famous-WebP crossfade against the textured-disk
 * pass; see 'ProceduralDiskInstance.d.ts' for the full semantic.
 *
 * ## Why grow-on-demand instance buffer
 *
 * Textured renderers cap at the atlas slot count (256), so fixed preallocation
 * fits. Procedural activates for every galaxy in the 8 px+ apparent-size
 * band with no atlas dependency — that count grows unboundedly as the
 * camera approaches a dense field, and a fixed cap would visually clip
 * impostors mid-flythrough.
 *
 * ## Why uniform binding visibility is VERTEX | FRAGMENT
 *
 * The BGL declares the uniform binding as visible to both stages even
 * though only the vertex stage reads it. Pipeline-layout introspection
 * uses BGL identity, so widening or narrowing the visibility flag would
 * silently change the layout signature across the three sibling renderers.
 */

import vsCode from '../shaders/proceduralDisks/vertex.wesl?static';
import fsCode from '../shaders/proceduralDisks/fragment.wesl?static';
import type { ProceduralDiskInstance } from '../../../@types/rendering/ProceduralDiskInstance';
import type { ProceduralDiskRenderer } from '../../../@types/rendering/ProceduralDiskRenderer';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { Vec3 } from '../../../@types/math/Vec3';
import { FLOATS_PER_INSTANCE, createInstancedQuadRenderer } from './instancedQuadRenderer';

type Init = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
};

export function createProceduralDiskRenderer(init: Init): ProceduralDiskRenderer {
  const inner = createInstancedQuadRenderer(init, {
    label: 'proceduralDisks',
    vertexSource: vsCode,
    fragmentSource: fsCode,
    // No atlas — the procedural fragment shader generates the
    // brightness profile from scratch.
    capacity: { kind: 'grow' },
    // Procedural disks are EMISSIVE; same rationale as quad/disk.
    blend: 'additive',
    format: init.format,
    // Tagged VERTEX | FRAGMENT even though the fragment doesn't read
    // 'u' — keeps the pipeline-layout introspection signature stable
    // across the sibling renderers. See module header.
    uniformVisibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
  });

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewport: [number, number],
    camPosWorld: Readonly<Vec3>,
    pxPerRad: number,
    instances: ReadonlyArray<ProceduralDiskInstance>,
  ): void {
    if (instances.length === 0) return;

    // Fresh allocation per frame. The typical-frame size for the
    // procedural pass is a few KB; GC churn isn't load-bearing today.
    // A reusable scratch buffer can be added if profiling flags it.
    const packed = new Float32Array(instances.length * FLOATS_PER_INSTANCE);
    for (let i = 0; i < instances.length; i++) {
      const o = i * FLOATS_PER_INSTANCE;
      const ins = instances[i]!;
      packed[o + 0] = ins.x;
      packed[o + 1] = ins.y;
      packed[o + 2] = ins.z;
      packed[o + 3] = ins.sizeWorldMpc;
      packed[o + 4] = ins.axisRatio;
      packed[o + 5] = ins.positionAngleDeg;
      packed[o + 6] = 0;
      packed[o + 7] = 0;
      packed[o + 8] = ins.colourIndex;
      packed[o + 9] = ins.crossfadeAlpha;
      packed[o + 10] = ins.procFadeOut;
      packed[o + 11] = 0;
      // Slots 12..15 are the shared-factory's hi-res-LOD vec4 (owned by
      // texturedDiskRenderer). Explicit zeros so a future migration to
      // a reused scratch buffer can't leak stale bytes into the GPU
      // upload — 'new Float32Array' zero-inits today, but 'scratch.fill'
      // would silently skip these.
      packed[o + 12] = 0;
      packed[o + 13] = 0;
      packed[o + 14] = 0;
      packed[o + 15] = 0;
    }

    inner.draw({
      pass,
      viewProj,
      viewport,
      instanceBytes: packed,
      instanceCount: instances.length,
      camPosWorld,
      pxPerRad,
    });
  }

  const renderer: ProceduralDiskRenderer = {
    label: 'proceduralDiskRenderer',
    draw,
    destroy: inner.destroy,
  };
  // 'satisfies Renderer' confirms the shared label+destroy contract
  // without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
