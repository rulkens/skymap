/**
 * milkyWayCloudRenderer — the two-pass draw for the generated Milky Way point
 * cloud. The star/dust billboard model draws as an ADDITIVE star pass (soft
 * radial glows that sum their light) and a MULTIPLICATIVE-transmittance dust
 * pass (per-channel absorption that darkens + reddens the light already in the
 * target).
 *
 * ## The two passes render into DIFFERENT targets
 *
 * Stars go into the reduced-resolution `mw-aggregate` offscreen; dust goes
 * full-res into HDR. The rationale lives on the `mw-aggregate` spec row in
 * `renderTargets.ts` — in short, the summed star glow is a low-frequency field
 * and is the fill-bound half, while dust must multiply the real cosmological
 * accumulation and so has to land in HDR itself.
 *
 * Both targets are `rgba16float`, so ONE `targetFormat` still describes both
 * pipelines. If the aggregate row's format ever diverges from HDR's, this
 * factory needs two formats, not one.
 *
 * ## Two pipelines, two bind groups, two uniform buffers
 *
 * Stars and dust compile from two DISJOINT WESL modules (`stars.wesl` /
 * `dust.wesl`) that share only the `io.wesl` uniform declaration. They cannot
 * share a GPUShaderModule: WebGPU's `layout: 'auto'` derives a bind-group
 * layout from the entry points a module exposes, and two pipelines that share
 * a module but reference the binding with divergent stage visibility fail the
 * group-equivalent check (the auto-layout trap in project memory). Disjoint
 * modules dodge it.
 *
 * The consequence for the CPU side: an `auto`-derived bind-group layout is
 * PIPELINE-SPECIFIC — a bind group built from `starPipeline.getBindGroupLayout(0)`
 * is not accepted by the dust pipeline and vice versa. So each pass owns its
 * bind group.
 *
 * Each pass also owns its own UNIFORM BUFFER, which the single-target version
 * did not need. `queue.writeBuffer` is ordered against `queue.submit`, not
 * against the passes encoded in between: two writes to one buffer inside a
 * frame would both land before either pass executed, so the second would win
 * for BOTH. Sharing one buffer would therefore make the star pass silently
 * read the dust pass's viewport (the two now differ — the star pass is sized
 * to the reduced-resolution target). Two buffers make the passes independent
 * of each other's ordering, which is also what lets either be skipped.
 *
 * ## The dust blend algebra (load-bearing, silent if wrong)
 *
 * Stars use `src + dst` (`one`/`one`) — additive emission. Dust uses
 * `src*dst` on colour (`srcFactor: 'dst'`, `dstFactor: 'zero'`): the fragment
 * outputs a per-channel transmittance T, and the blend computes
 * `T * dst + 0 * src = T * dst`, i.e. it MULTIPLIES the framebuffer by T. That
 * is exactly how extinction works — no light behind the dust (dst 0) means
 * `T * 0 = 0`, so dust is invisible except silhouetted against the glow it
 * blocks. The alpha channel uses `zero`/`one` (`0*src + 1*dst`) so the target
 * alpha passes through untouched. Swapping either factor produces a plausible
 * but physically-wrong image with no error, so the pinned values are asserted
 * in the tests.
 *
 * ## No depth state
 *
 * Neither pipeline declares `depthStencil`: the cloud is emissive/transmissive
 * glow, order-independent under its blends, and shares its targets with passes
 * that manage their own depth. A depth test would incorrectly cull sprites
 * behind nearer ones that should still sum/multiply.
 */

import starsCode from '../../shaders/milkyWay/sprites/stars.wesl?static';
import dustCode from '../../shaders/milkyWay/sprites/dust.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { GEN_RECORD_BYTES } from '../../../engine/galaxyGenerator/v1/genRecordBytes';
import { MILKY_WAY_MODEL_SCALE } from '../../../engine/galaxyGenerator/v1/milkyWayCalibration';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { MilkyWayCloudRenderer } from '../../../../@types/rendering/MilkyWayCloudRenderer';
import type { MilkyWayCloudDrawArgs } from '../../../../@types/rendering/MilkyWayCloudDrawArgs';
import { writeCameraPrefix } from '../../lib/cameraUniforms';
import { ADDITIVE_BLEND } from '../../lib/blendStates';

type Init = {
  device: GPUDevice;
  /**
   * The colour-target format both pipelines write into — the HDR offscreen
   * (`'rgba16float'`), NOT the swap chain. Passed explicitly (never a
   * `GpuContext.format`, which is always the swap-chain format).
   */
  targetFormat: GPUTextureFormat;
};

/**
 * On-the-wire uniform buffer size, matching `io.wesl`'s `Uniforms` struct
 * byte-for-byte: CameraUniforms 80 B (viewProj + viewportPx + 2 pad) + model
 * mat4 64 B + camRight/camUp vec4 32 B + params0/params1 vec4 32 B = 208 B.
 * The const lives in the renderer module (not a type file) because it pins a
 * runtime layout the packer writes against.
 */
export const MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE = 208;

// The shared corner quad: two triangles covering [-1, 1]^2, matching the tool's
// 'galaxy:quad' winding/order verbatim. Each pass expands one generated record
// into a camera-facing billboard by pushing these corners along camRight/camUp.
const CORNER_QUAD = new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]);

// The star pass uses the shared additive emission blend (ADDITIVE_BLEND). The
// dust pass is a pinned per-channel MULTIPLY (see the module header for the
// extinction algebra) whose factors match no shared descriptor, so it stays
// inline here.
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
      // 'auto' layout — the derived bind-group layout is pipeline-specific, so
      // each pipeline gets its own bind group below (never shared across the two).
      layout: 'auto',
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

  // One uniform buffer per pass — see the module header on why sharing one
  // across two render passes would make the star pass read the dust pass's
  // viewport.
  const makeUniformBuffer = (label: string): GPUBuffer =>
    device.createBuffer({
      label,
      size: MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  const starUniformBuffer = makeUniformBuffer('milkyWayCloud-star-uniforms');
  const dustUniformBuffer = makeUniformBuffer('milkyWayCloud-dust-uniforms');

  // Each bind group is built from its OWN pipeline's auto layout (auto layouts
  // never cross pipelines; see the module header).
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

  // Scratch uniform view, reused per frame to avoid churning the GC. Written
  // whole each draw, so stale bytes from the previous frame never leak. Safe to
  // share between the two entry points because each fills it completely and
  // uploads before returning — the same non-reentrant discipline the rest of
  // the frame path uses.
  const uniformScratch = new Float32Array(MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE / 4);

  // Pack io.wesl's Uniforms into the scratch and upload it to `target`. Both
  // passes read the identical struct; only the viewport differs (the star pass
  // is sized to the reduced-resolution aggregate target).
  function writeUniforms(target: GPUBuffer, args: MilkyWayCloudDrawArgs): void {
    const { vp, viewportPx, camRight, camUp, model, fadeAlpha, tuning } = args;
    const f32 = uniformScratch;

    // Pack io.wesl's Uniforms (byte offsets in the io.wesl header):
    // viewProj 0..15, viewportPx 16..17, pad 18..19, model 20..35,
    // camRight 36..39, camUp 40..43, params0 44..47,
    // params1 48..51 (starPxMin, starPxMax, starSizeScale, lodApparent).
    writeCameraPrefix(f32, vp, viewportPx);
    // Explicit pad zeroing — this scratch is reused across frames, so the
    // pads can't rely on zero-init the way a fresh Float32Array can.
    f32[18] = 0;
    f32[19] = 0;
    f32.set(model, 20);
    // camRight/camUp are vec4 (xyz + 0 pad) so each lands on a clean 16-byte slot.
    f32[36] = camRight[0];
    f32[37] = camRight[1];
    f32[38] = camRight[2];
    f32[39] = 0;
    f32[40] = camUp[0];
    f32[41] = camUp[1];
    f32[42] = camUp[2];
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
