/**
 * proceduralDiskRenderer — 3D-oriented procedural galaxy impostors.
 *
 * Sibling to texturedDiskRenderer (texture-based) and texturedQuadRenderer
 * (screen-aligned + texture-based). Activates for galaxies in the
 * apparent-size band 8..∞ px, with a crossfade against the points pass
 * across 8..14 px. The shader ('shaders/galaxyCatalog/proceduralDisks/') is documented
 * in detail; this file is the JS-side glue.
 *
 * ## Per-instance attributes (64 bytes / 16 floats)
 *
 *   posSize       vec4   xyz, sizeWorldMpc
 *   orientation   vec4   axisRatio, positionAngleDeg, _, _
 *   extras        vec4   colourIndex, crossfadeAlpha, procFadeOut, sbAmp
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
 * ## Pick: retained content, caller-supplied camera
 *
 * The pick pass replays the last-drawn disk set. Two kinds of state feed
 * it, and only one is retained here:
 *
 *   - CONTENT ('pickInstanceBuffer' + 'lastPickInstanceCount') — the
 *     per-instance disk-LOD set the visual 'draw()' uploaded. The picker
 *     never sees the instance list, so this genuinely can't be
 *     reconstructed downstream; the renderer keeps a byte-identical mirror
 *     of the visual upload and replays it. A frame that drops to zero
 *     disks clears the count so a stale set can't leak into the pick
 *     texture.
 *   - CAMERA (viewProj / viewport / camPos / pxPerRad / focusBindGroup) —
 *     NOT retained. 'pickDisks()' takes it as arguments so the pick
 *     uniform always reflects the frame the caller is picking. Stashing a
 *     draw()-time camera invited a stale-frame bug (the pick pass and the
 *     visual draw could disagree if they ran a frame apart); taking it as
 *     an argument makes that class of bug unrepresentable.
 *
 * ## Why uniform binding visibility is VERTEX | FRAGMENT
 *
 * The BGL declares the uniform binding as visible to both stages even
 * though only the vertex stage reads it. Pipeline-layout introspection
 * uses BGL identity, so widening or narrowing the visibility flag would
 * silently change the layout signature across the three sibling renderers.
 */

import vsCode from '../../shaders/galaxyCatalog/proceduralDisks/vertex.wesl?static';
import fsCode from '../../shaders/galaxyCatalog/proceduralDisks/fragment.wesl?static';
import pickFsCode from '../../shaders/galaxyCatalog/proceduralDisks/pickFragment.wesl?static';
import type { ProceduralDiskInstance } from '../../../../@types/rendering/ProceduralDiskInstance';
import type { ProceduralDiskRenderer } from '../../../../@types/rendering/ProceduralDiskRenderer';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { Vec2 } from '../../../../@types/math/Vec2';
import type { Vec3 } from '../../../../@types/math/Vec3';
import type { FocusUniformsBgl } from '../../../../@types/rendering/FocusUniformsBgl';
import {
  FLOATS_PER_INSTANCE,
  BYTES_PER_INSTANCE,
  UNIFORM_BYTES,
  createInstancedQuadRenderer,
} from './instancedQuadRenderer';
import { packSelection } from '../../../../data/selectionEncoding';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { writeCameraPrefix } from '../../lib/cameraUniforms';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';

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
  /** Shared cluster-focus layout, bound at @group(1) — see instancedQuadRenderer. */
  focusBgl: FocusUniformsBgl;
  /**
   * Selects the COSMO slab's depth convention (single-sourced in
   * `SLAB_REVERSED_Z`): `false` ⇒ smaller-z-wins (`depthCompare: 'less'`),
   * `true` ⇒ reversed-Z greater-wins. Applies to the pick pipeline's depth
   * test, resolved through `resolveDepthCompare`.
   */
  reversedZ: boolean;
};

export function createProceduralDiskRenderer(init: Init): ProceduralDiskRenderer {
  const inner = createInstancedQuadRenderer(init.device, {
    label: 'proceduralDisks',
    vertexSource: vsCode,
    fragmentSource: fsCode,
    // No atlas — the procedural fragment shader generates the
    // brightness profile from scratch.
    capacity: { kind: 'grow' },
    focusBgl: init.focusBgl,
    // Procedural disks are EMISSIVE; same rationale as quad/disk.
    blend: 'additive',
    targetFormat: init.targetFormat,
    // Tagged VERTEX | FRAGMENT even though the fragment doesn't read
    // 'u' — keeps the pipeline-layout introspection signature stable
    // across the sibling renderers. See module header.
    uniformVisibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
  });

  // ── Pick pipeline ────────────────────────────────────────────────────
  //
  // The visual pipeline is owned by the instancedQuadRenderer factory and
  // its BGL is NOT exposed. We own a SECOND pipeline (and its own camera
  // BGL + uniform buffer) for the pick pass — same "own-everything"
  // pattern as structureMarkerRenderer.
  //
  // Pipeline layout:
  //   @group(0) — own camera uniform (viewProj + viewport + camPos +
  //               pxPerRad), same 96-byte shape as the visual pipeline's
  //               @group(0). Visibility VERTEX | FRAGMENT matches the
  //               `uniformVisibility` flag passed to the visual pipeline
  //               above (see the module-header rationale for widening to
  //               FRAGMENT even though the vertex stage is the only reader).
  //   @group(1) — focusBgl (shared with the visual pipeline; identical
  //               layout identity).
  //
  // The vertex source is the SAME 'vertex.wesl' the visual pipeline uses
  // (same @group declarations), but compiled into a SEPARATE
  // GPUShaderModule so `layout:'auto'` isolation is never an issue. The
  // fragment source is the new 'pickFragment.wesl' (entry 'fsPick').
  const pickCameraBgl = init.device.createBindGroupLayout({
    label: 'proceduralDisks-pick-camera-bgl',
    entries: [
      {
        binding: 0,
        // VERTEX | FRAGMENT mirrors the visual pipeline's uniformVisibility
        // setting — keeps BGL identity stable if anyone ever compares the
        // two for compatibility. The pick fragment doesn't read 'u', but
        // the declaration must match what the vertex module declares.
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
    ],
  });

  const pickUniformBuffer = init.device.createBuffer({
    label: 'proceduralDisks-pick-uniforms',
    size: UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const pickUniformBindGroup = init.device.createBindGroup({
    label: 'proceduralDisks-pick-camera-bg',
    layout: pickCameraBgl,
    entries: [{ binding: 0, resource: { buffer: pickUniformBuffer } }],
  });

  const pickVsModule = createShaderModuleWithDevLog(init.device, vsCode, 'proceduralDisks.pick.vs');
  const pickFsModule = createShaderModuleWithDevLog(
    init.device,
    pickFsCode,
    'proceduralDisks.pick.fs',
  );

  const pickPipeline = init.device.createRenderPipeline({
    label: 'proceduralDisks-pick-pipeline',
    layout: init.device.createPipelineLayout({
      label: 'proceduralDisks-pick-pipeline-layout',
      bindGroupLayouts: [pickCameraBgl, init.focusBgl],
    }),
    vertex: {
      module: pickVsModule,
      entryPoint: 'vs',
      // Exact same 64-byte / 16-float instance layout the visual pipeline
      // uses. The pick pipeline reads the same per-instance data from the
      // owned pick instance buffer.
      buffers: [
        {
          arrayStride: BYTES_PER_INSTANCE,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x4' },
            { shaderLocation: 1, offset: 16, format: 'float32x4' },
            { shaderLocation: 2, offset: 32, format: 'float32x4' },
            { shaderLocation: 3, offset: 48, format: 'float32x4' },
          ],
        },
      ],
    },
    fragment: {
      module: pickFsModule,
      entryPoint: 'fsPick',
      // r32uint: no blend — integer formats don't support blending.
      targets: [{ format: 'r32uint' }],
    },
    primitive: { topology: 'triangle-list' },
    // Depth test matches the galaxy and ring pick pipelines: front-most
    // wins, depth write enabled. The depth attachment is shared across
    // all pick draws in the same pass encoder.
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: resolveDepthCompare('nearer', init.reversedZ),
    },
  });

  // Reusable pick uniform scratch — same shape as the visual pipeline's
  // uniformScratch in instancedQuadRenderer.
  const pickUniformScratch = new Float32Array(UNIFORM_BYTES / 4);

  // Pick instance buffer — owned by this renderer, separate from the
  // visual instance buffer inside 'inner' (which is private to the
  // factory). Unlike structureMarkerRenderer, which rebinds one shared
  // buffer across its visible and pick pipelines, this renderer must
  // allocate a second, byte-identical buffer — the factory gives us no
  // other handle.
  //
  // This buffer + 'lastPickInstanceCount' are RETAINED CONTENT — the
  // last-drawn disk-LOD set, replayed into the pick pass. That is state
  // the pick pass genuinely can't reconstruct (the picker never sees the
  // per-instance list). The CAMERA is NOT retained: pickDisks() takes it
  // as arguments, so the pick uniform always reflects the frame the
  // caller is picking, never a stale draw()-time stash. See the module
  // header's content-vs-camera distinction.
  let pickInstanceBuffer: GPUBuffer | null = null;
  let pickInstanceBufferCapacity = 0; // measured in instances
  let lastPickInstanceCount = 0;

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewport: Vec2,
    camPosWorld: Readonly<Vec3>,
    pxPerRad: number,
    focusBindGroup: GPUBindGroup,
    instances: ReadonlyArray<ProceduralDiskInstance>,
  ): void {
    if (instances.length === 0) {
      // Zero the cached count so pickDisks() no-ops — it replays
      // lastPickInstanceCount from the previous frame, so a frame that
      // drops to 0 disks must clear it or pickDisks() would re-draw the
      // prior frame's disks into the pick texture.
      lastPickInstanceCount = 0;
      return;
    }

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
      // Slot 6 is the shader's 'orientation.z' (see proceduralDisks/io.wesl) —
      // the pick pass bitcasts it back to the packed (source, localIdx) id.
      packedU32[o + 6] = packSelection(ins.sourceCode, ins.localIdx);
      packed[o + 7] = 0;
      packed[o + 8] = ins.colourIndex;
      packed[o + 9] = ins.crossfadeAlpha;
      packed[o + 10] = ins.procFadeOut;
      // Slot 11 (extras.w) — effective surface-brightness amplitude, already
      // scaled by the live sliders + per-source sbBoost (see
      // ProceduralDiskInstance.d.ts). The pick fragment shares this same
      // 'packed' array but ignores extras.w, so writing it here is harmless
      // for the pick pass.
      packed[o + 11] = ins.sbAmp;
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
    // data. The pickDisks() method binds this to the pick pipeline's
    // vertex slot. Separate from the visual buffer because the factory
    // keeps its instance buffer private.
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
    lastPickInstanceCount = instances.length; // consumed by pickDisks() to issue the instanced draw
  }

  function pickDisks(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewport: Vec2,
    camPosWorld: Readonly<Vec3>,
    pxPerRad: number,
    focusBindGroup: GPUBindGroup,
  ): void {
    // No-op until draw() has uploaded at least one instance this frame
    // (a populated pick instance buffer to replay). The CAMERA arrives as
    // arguments — the caller supplies the frame it is picking, so there is
    // no draw()-time camera stash that could go stale.
    if (lastPickInstanceCount === 0 || pickInstanceBuffer === null) return;

    // Write the pick uniform buffer from the caller-supplied camera.
    // Same 96-byte layout as the visual pipeline's uniformScratch:
    //   f32[ 0..15] viewProj  f32[16..17] viewport  f32[18..19] reserved
    //   f32[20..22] camPosWorld  f32[23] pxPerRad
    writeCameraPrefix(pickUniformScratch, viewProj, viewport);
    pickUniformScratch[18] = 0;
    pickUniformScratch[19] = 0;
    pickUniformScratch[20] = camPosWorld[0];
    pickUniformScratch[21] = camPosWorld[1];
    pickUniformScratch[22] = camPosWorld[2];
    pickUniformScratch[23] = pxPerRad;
    init.device.queue.writeBuffer(pickUniformBuffer, 0, pickUniformScratch);

    pass.setPipeline(pickPipeline);
    // @group(0): own pick camera uniforms (viewProj / viewport / camPos / pxPerRad).
    pass.setBindGroup(0, pickUniformBindGroup);
    // @group(1): shared focus uniform. Shared depth state means a closer
    // point dot or disk claims the pixel; the disk and its companion point
    // carry the SAME packed id, so overlap is harmless.
    pass.setBindGroup(1, focusBindGroup);
    pass.setVertexBuffer(0, pickInstanceBuffer);
    pass.draw(6, lastPickInstanceCount);
  }

  function destroy(): void {
    inner.destroy();
    pickUniformBuffer.destroy();
    pickInstanceBuffer?.destroy();
    pickInstanceBuffer = null;
  }

  const renderer: ProceduralDiskRenderer = {
    label: 'proceduralDiskRenderer',
    draw,
    pickDisks,
    destroy,
  };
  // 'satisfies Renderer' confirms the shared label+destroy contract
  // without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
