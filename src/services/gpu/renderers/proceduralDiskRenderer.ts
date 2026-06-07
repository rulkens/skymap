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
import type { FocusUniformsBgl } from '../../../@types/rendering/FocusUniformsBgl';
import { FLOATS_PER_INSTANCE, BYTES_PER_INSTANCE, createInstancedQuadRenderer } from './instancedQuadRenderer';
import { packSelection } from '../../../data/selectionEncoding';

type Init = {
  device: GPUDevice;
  context: GPUCanvasContext;
  format: GPUTextureFormat;
  canvas: HTMLCanvasElement;
  /** Shared cluster-focus layout, bound at @group(1) — see instancedQuadRenderer. */
  focusBgl: FocusUniformsBgl;
};

export function createProceduralDiskRenderer(init: Init): ProceduralDiskRenderer {
  const inner = createInstancedQuadRenderer(init, {
    label: 'proceduralDisks',
    vertexSource: vsCode,
    fragmentSource: fsCode,
    // No atlas — the procedural fragment shader generates the
    // brightness profile from scratch.
    capacity: { kind: 'grow' },
    focusBgl: init.focusBgl,
    // Procedural disks are EMISSIVE; same rationale as quad/disk.
    blend: 'additive',
    format: init.format,
    // Tagged VERTEX | FRAGMENT even though the fragment doesn't read
    // 'u' — keeps the pipeline-layout introspection signature stable
    // across the sibling renderers. See module header.
    uniformVisibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
  });

  // Pick instance buffer — owned by this renderer, separate from the
  // visual instance buffer inside 'inner' (which is private to the
  // factory). Task 4 will add the 'pickDisks' method that binds this
  // buffer to the pick pipeline. For now we allocate, grow, fill, and
  // record the count so the infrastructure is ready without leaking any
  // pick-pipeline scope into this task's diff.
  //
  // Why a second buffer rather than reusing the visual one: the visual
  // buffer is private to instancedQuadRenderer and not exposed. Unlike
  // structureMarkerRenderer, which rebinds one shared buffer across its
  // visible and pick pipelines, this renderer must allocate a second,
  // byte-identical buffer — the factory gives us no other handle.
  let pickInstanceBuffer: GPUBuffer | null = null;
  let pickInstanceBufferCapacity = 0; // measured in instances
  let lastPickInstanceCount = 0;

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewport: [number, number],
    camPosWorld: Readonly<Vec3>,
    pxPerRad: number,
    focusBindGroup: GPUBindGroup,
    instances: ReadonlyArray<ProceduralDiskInstance>,
  ): void {
    if (instances.length === 0) return;

    // Fresh allocation per frame. The typical-frame size for the
    // procedural pass is a few KB; GC churn isn't load-bearing today.
    // A reusable scratch buffer can be added if profiling flags it.
    const packed = new Float32Array(instances.length * FLOATS_PER_INSTANCE);
    // Alias the same ArrayBuffer as u32 so we can write pick ids into
    // float slots without float-precision loss. localIdx can exceed 2^24,
    // which isn't exactly representable as f32; writing the raw u32 bits
    // preserves all 27 localIdx bits. The shader reads them back with
    // bitcast<u32>. The alternative — storing localIdx as a plain f32 —
    // would silently corrupt ids above ~16 M.
    const packedU32 = new Uint32Array(packed.buffer);
    for (let i = 0; i < instances.length; i++) {
      const o = i * FLOATS_PER_INSTANCE;
      const ins = instances[i]!;
      packed[o + 0] = ins.x;
      packed[o + 1] = ins.y;
      packed[o + 2] = ins.z;
      packed[o + 3] = ins.sizeWorldMpc;
      packed[o + 4] = ins.axisRatio;
      packed[o + 5] = ins.positionAngleDeg;
      packedU32[o + 6] = packSelection(ins.sourceCode, ins.localIdx);
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
      focusBindGroup,
    });

    // ── Pick instance buffer (mirror of the visual upload) ─────────────
    //
    // We own a second GPU buffer holding the same byte-identical packed
    // data. Task 4 will bind this to the pick pipeline's vertex slot;
    // allocated and grown here so the infrastructure exists without
    // requiring Task 4's pipeline code in this diff.
    //
    // Why VERTEX | COPY_DST: instance buffers consumed by a draw call
    // must carry VERTEX; COPY_DST is required by writeBuffer. Mirrors
    // the usage flags on the visual instance buffer inside
    // instancedQuadRenderer (see its grow block).
    if (pickInstanceBuffer === null || pickInstanceBufferCapacity < instances.length) {
      pickInstanceBuffer?.destroy();
      pickInstanceBuffer = init.device.createBuffer({
        label: 'proceduralDisks-pick-instances',
        size: instances.length * BYTES_PER_INSTANCE,
        usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
      });
      pickInstanceBufferCapacity = instances.length;
    }
    init.device.queue.writeBuffer(pickInstanceBuffer, 0, packed);
    lastPickInstanceCount = instances.length; // consumed by the pick pass to issue the instanced draw
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
