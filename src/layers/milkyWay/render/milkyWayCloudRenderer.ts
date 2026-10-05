/**
 * milkyWayCloudRenderer — two-pass draw for the generated Milky Way point
 * cloud: an ADDITIVE star pass (into `mw-aggregate` — rationale in
 * `milkyWayAggregateTarget.ts`) and a MULTIPLICATIVE-transmittance dust pass
 * (full-res HDR). Both targets are `rgba16float`, so one `targetFormat`
 * describes both pipelines.
 *
 * Stars and dust compile from two DISJOINT WESL modules sharing only
 * `io.wesl`'s uniform declaration — they can't share a module: WebGPU's
 * `layout: 'auto'` derives a bind-group layout per module, and a module used
 * by two pipelines with divergent stage visibility fails the
 * group-equivalent check. An `auto` layout is also PIPELINE-SPECIFIC, so each
 * pipeline owns its own bind group AND its own uniform buffer:
 * `queue.writeBuffer` orders against `queue.submit`, not the passes encoded
 * in between, so two writes to one buffer within a frame would both land
 * before either pass ran and the second would silently win for both.
 *
 * Dust's blend is a pinned per-channel MULTIPLY (`srcFactor: 'dst'`,
 * `dstFactor: 'zero'`): the fragment's transmittance T composes as `T * dst`,
 * exactly how extinction works (no light behind dust ⇒ 0). Swapped factors
 * give a plausible but physically-wrong image with no error — pinned in tests.
 *
 * Neither pipeline declares `depthStencil`: order-independent glow sharing
 * targets with passes that manage their own depth.
 */

import starsCode from '../../../services/gpu/shaders/milkyWay/sprites/stars.wesl?static';
import dustCode from '../../../services/gpu/shaders/milkyWay/sprites/dust.wesl?static';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { GEN_RECORD_BYTES } from '../../../services/engine/galaxyGenerator/v1/genRecordBytes';
import { MILKY_WAY_MODEL_SCALE } from '../../../services/engine/galaxyGenerator/v1/milkyWayCalibration';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { MilkyWayCloudRenderer } from '../@types/MilkyWayCloudRenderer';
import type { MilkyWayCloudDrawArgs } from '../@types/MilkyWayCloudDrawArgs';
import { writeCameraPrefix } from '../../../services/gpu/lib/cameraUniforms';
import { ADDITIVE_BLEND } from '../../../services/gpu/lib/blendStates';
import { MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE } from '../../../data/milkyWay/milkyWayCloudUniformBufferSize';

type Init = {
  device: GPUDevice;
  /**
   * The colour-target format both pipelines write into — the HDR offscreen
   * (`'rgba16float'`), NOT the swap chain. Passed explicitly (never a
   * `GpuContext.format`, which is always the swap-chain format).
   */
  targetFormat: GPUTextureFormat;
};
// The shared corner quad: two triangles covering [-1, 1]^2, matching the tool's
// 'galaxy:quad' winding/order verbatim. Each pass expands one generated record
// into a camera-facing billboard by pushing these corners along camRight/camUp.
const CORNER_QUAD = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);

// Dust's MULTIPLY blend (see module header) matches no shared descriptor.
const DUST_BLEND: GPUBlendState = {
  color: { srcFactor: 'dst', dstFactor: 'zero', operation: 'add' },
  alpha: { srcFactor: 'zero', dstFactor: 'one', operation: 'add' },
};

// Slot-0 corner-quad layout (stride 8, one float32x2 at location 0), shared by
// both pipelines.
const CORNER_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: 8,
  attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
};

// Slot-1 per-instance layouts, one per pass, mirroring generate.wesl's record
// writers exactly. Stars: pos@0, color@12, (size, brightness)@24. Dust:
// pos@0, size@12, color@16, opacity@28. Both read arrayStride from
// GEN_RECORD_BYTES so a stride change is one edit.
const STAR_INSTANCE_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: GEN_RECORD_BYTES,
  stepMode: 'instance',
  attributes: [
    { shaderLocation: 1, offset: 0, format: 'float32x3' },
    { shaderLocation: 2, offset: 12, format: 'float32x3' },
    { shaderLocation: 3, offset: 24, format: 'float32x2' },
  ],
};
const DUST_INSTANCE_LAYOUT: GPUVertexBufferLayout = {
  arrayStride: GEN_RECORD_BYTES,
  stepMode: 'instance',
  attributes: [
    { shaderLocation: 1, offset: 0, format: 'float32x3' },
    { shaderLocation: 2, offset: 12, format: 'float32' },
    { shaderLocation: 3, offset: 16, format: 'float32x3' },
    { shaderLocation: 4, offset: 28, format: 'float32' },
  ],
};

export function createMilkyWayCloudRenderer(init: Init): MilkyWayCloudRenderer {
  const { device, targetFormat } = init;

  const starModule = createShaderModuleWithDevLog(device, starsCode, 'milkyWayCloud.stars');
  const dustModule = createShaderModuleWithDevLog(device, dustCode, 'milkyWayCloud.dust');

  const makePipeline = (
    label: string,
    module: GPUShaderModule,
    instanceLayout: GPUVertexBufferLayout,
    blend: GPUBlendState,
  ): GPURenderPipeline =>
    device.createRenderPipeline({
      label,
      layout: 'auto', // pipeline-specific — see module header
      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [CORNER_LAYOUT, instanceLayout],
      },
      fragment: {
        module,
        entryPoint: 'fs',
        targets: [{ format: targetFormat, blend }],
      },
      // No depthStencil — see the module header (order-independent glow).
      primitive: { topology: 'triangle-list' },
    });

  const starPipeline = makePipeline(
    'milkyWayCloud-star-pipeline',
    starModule,
    STAR_INSTANCE_LAYOUT,
    ADDITIVE_BLEND,
  );
  const dustPipeline = makePipeline(
    'milkyWayCloud-dust-pipeline',
    dustModule,
    DUST_INSTANCE_LAYOUT,
    DUST_BLEND,
  );

  const cornerBuffer = device.createBuffer({
    label: 'milkyWayCloud-corner-quad',
    size: CORNER_QUAD.byteLength,
    usage: GPUBufferUsage.VERTEX,
    mappedAtCreation: true,
  });
  new Float32Array(cornerBuffer.getMappedRange()).set(CORNER_QUAD);
  cornerBuffer.unmap();

  // One uniform buffer per pass — see the module header.
  const makeUniformBuffer = (label: string): GPUBuffer =>
    device.createBuffer({
      label,
      size: MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  const starUniformBuffer = makeUniformBuffer('milkyWayCloud-star-uniforms');
  const dustUniformBuffer = makeUniformBuffer('milkyWayCloud-dust-uniforms');

  // Each bind group is built from its own pipeline's auto layout (see module header).
  const starBindGroup = device.createBindGroup({
    label: 'milkyWayCloud-star-bg',
    layout: starPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: starUniformBuffer } }],
  });
  const dustBindGroup = device.createBindGroup({
    label: 'milkyWayCloud-dust-bg',
    layout: dustPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: dustUniformBuffer } }],
  });

  // Reused per frame to avoid churning the GC; each entry point fills it
  // whole before uploading, so no stale bytes leak between frames or passes.
  const uniformScratch = new Float32Array(MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE / 4);

  // Pack io.wesl's Uniforms into the scratch and upload it to `target`. Both
  // passes read the identical struct; only the viewport differs (the star pass
  // is sized to the reduced-resolution aggregate target).
  function writeUniforms(target: GPUBuffer, args: MilkyWayCloudDrawArgs): void {
    const { vp, viewportPx, pxPerRad, camPosModel, model, fadeAlpha, tuning } = args;
    const f32 = uniformScratch;

    // Pack io.wesl's Uniforms (byte offsets in the io.wesl header):
    // viewProj 0..15, viewportPx 16..17, pxPerRad 18, pad 19, model 20..35,
    // camPosModel 36..39, reserved 40..43, params0 44..47,
    // params1 48..51 (starPxMin, starPxMax, starSizeScale, lodApparent).
    writeCameraPrefix(f32, vp, viewportPx, pxPerRad);
    // Explicit pad zeroing — this scratch is reused across frames, so the
    // pad can't rely on zero-init the way a fresh Float32Array can.
    f32[19] = 0;
    f32.set(model, 20);
    // camPosModel is a vec4 (padded w) landing on a clean 16-byte slot;
    // 40..43 reserved, written zero (scratch reused across frames).
    f32[36] = camPosModel[0];
    f32[37] = camPosModel[1];
    f32[38] = camPosModel[2];
    f32[39] = 0;
    f32[40] = 0;
    f32[41] = 0;
    f32[42] = 0;
    f32[43] = 0;
    // The look knobs are the caller's live `settings.milkyWay` values, so a
    // DebugPanel slider drag lands on the very next frame. Only the model
    // scale is fixed — it derives from the generation preset's radius.
    // params0 = (fadeAlpha, exposure, modelScale, glowSoftness).
    f32[44] = fadeAlpha;
    f32[45] = tuning.exposure;
    f32[46] = MILKY_WAY_MODEL_SCALE;
    f32[47] = tuning.softness;
    // params1 = (starPxMin, starPxMax, starSizeScale, lodApparent).
    f32[48] = tuning.starPxMin;
    f32[49] = tuning.starPxMax;
    f32[50] = tuning.starSizeScale;
    f32[51] = tuning.lodApparent;

    device.queue.writeBuffer(target, 0, f32);
  }

  // Additive star billboards into the reduced-resolution `mw-aggregate` target.
  function drawStars(pass: GPURenderPassEncoder, args: MilkyWayCloudDrawArgs): void {
    writeUniforms(starUniformBuffer, args);
    pass.setPipeline(starPipeline);
    pass.setBindGroup(0, starBindGroup);
    pass.setVertexBuffer(0, cornerBuffer);
    pass.setVertexBuffer(1, args.buffers.starBuf);
    pass.draw(6, args.buffers.starCount);
  }

  // Multiplicative-transmittance dust into HDR, over the upsampled starlight
  // and the cosmological accumulation behind it.
  function drawDust(pass: GPURenderPassEncoder, args: MilkyWayCloudDrawArgs): void {
    // Skipped when the generation carved no dust layout (dustBuf null).
    if (args.buffers.dustBuf === null) return;
    writeUniforms(dustUniformBuffer, args);
    pass.setPipeline(dustPipeline);
    pass.setBindGroup(0, dustBindGroup);
    pass.setVertexBuffer(0, cornerBuffer);
    pass.setVertexBuffer(1, args.buffers.dustBuf);
    pass.draw(6, args.buffers.dustCount);
  }

  function destroy(): void {
    starUniformBuffer.destroy();
    dustUniformBuffer.destroy();
    cornerBuffer.destroy();
  }

  const renderer: MilkyWayCloudRenderer = {
    label: 'milkyWayCloudRenderer',
    drawStars,
    drawDust,
    destroy,
  };
  // Confirm the shared label+destroy contract without widening the public type.
  renderer satisfies Renderer;
  return renderer;
}
