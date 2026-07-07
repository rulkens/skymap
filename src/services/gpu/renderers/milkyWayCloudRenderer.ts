/**
 * milkyWayCloudRenderer — the two-pass draw for the generated Milky Way point
 * cloud, running inside the app's HDR pass. It replaces the single-quad
 * procedural impostor (`milkyWayRenderer.ts`) with the tool's real star/dust
 * billboard model: an ADDITIVE star pass (soft radial glows that sum their
 * light) followed by a MULTIPLICATIVE-transmittance dust pass (per-channel
 * absorption that darkens + reddens the light already in the target).
 *
 * ## Two pipelines, two bind groups, ONE uniform buffer
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
 * is not accepted by the dust pipeline and vice versa, even though both bind
 * the exact same uniform buffer. So there is ONE uniform buffer (the two passes
 * read identical uniforms) but TWO bind groups, each built from its own
 * pipeline's layout.
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
 * glow, order-independent under its blends, and shares the HDR target with
 * passes that manage their own depth. A depth test would incorrectly cull
 * sprites behind nearer ones that should still sum/multiply.
 */

import starsCode from '../shaders/milkyWayCloud/stars.wesl?static';
import dustCode from '../shaders/milkyWayCloud/dust.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import { GEN_RECORD_BYTES } from '../galaxy/genRecordBytes';
import {
  MILKY_WAY_EXPOSURE,
  MILKY_WAY_LOD_APPARENT,
  MILKY_WAY_MODEL_SCALE,
  MILKY_WAY_STAR_PX_MIN,
  MILKY_WAY_STAR_PX_MAX,
  MILKY_WAY_STAR_SIZE_SCALE,
} from '../galaxy/milkyWayCalibration';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { MilkyWayCloudRenderer } from '../../../@types/rendering/MilkyWayCloudRenderer';
import type { MilkyWayCloudDrawArgs } from '../../../@types/rendering/MilkyWayCloudDrawArgs';

type Init = {
  device: GPUDevice;
  format: GPUTextureFormat;
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

// Blend states — pinned by the Global Constraints (and the tool's star/dust
// pipelines). See the module header for the dust multiply algebra.
const STAR_BLEND: GPUBlendState = {
  color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
};
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
  const { device, format } = init;

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
        targets: [{ format, blend }],
      },
      // No depthStencil — see the module header (order-independent glow).
      primitive: { topology: 'triangle-list' },
    });

  const starPipeline = makePipeline(
    'milkyWayCloud-star-pipeline',
    starModule,
    STAR_INSTANCE_LAYOUT,
    STAR_BLEND,
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

  const uniformBuffer = device.createBuffer({
    label: 'milkyWayCloud-uniforms',
    size: MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ONE buffer, TWO bind groups — each built from its own pipeline's auto layout
  // (auto layouts never cross pipelines; see the module header).
  const starBindGroup = device.createBindGroup({
    label: 'milkyWayCloud-star-bg',
    layout: starPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });
  const dustBindGroup = device.createBindGroup({
    label: 'milkyWayCloud-dust-bg',
    layout: dustPipeline.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
  });

  // Scratch uniform view, reused per frame to avoid churning the GC. Written
  // whole each draw, so stale bytes from the previous frame never leak.
  const uniformScratch = new Float32Array(MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE / 4);

  function draw(pass: GPURenderPassEncoder, args: MilkyWayCloudDrawArgs): void {
    const { vp, viewportPx, camRight, camUp, model, fadeAlpha, buffers } = args;
    const f32 = uniformScratch;

    // Pack io.wesl's Uniforms (byte offsets in the io.wesl header):
    // viewProj 0..15, viewportPx 16..17, pad 18..19, model 20..35,
    // camRight 36..39, camUp 40..43, params0 44..47,
    // params1 48..51 (starPxMin, starPxMax, starSizeScale, lodApparent).
    f32.set(vp, 0);
    f32[16] = viewportPx[0];
    f32[17] = viewportPx[1];
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
    // params0 = (fadeAlpha, exposure, modelScale, 0).
    f32[44] = fadeAlpha;
    f32[45] = MILKY_WAY_EXPOSURE;
    f32[46] = MILKY_WAY_MODEL_SCALE;
    f32[47] = 0;
    // params1 = (starPxMin, starPxMax, starSizeScale, lodApparent).
    f32[48] = MILKY_WAY_STAR_PX_MIN;
    f32[49] = MILKY_WAY_STAR_PX_MAX;
    f32[50] = MILKY_WAY_STAR_SIZE_SCALE;
    f32[51] = MILKY_WAY_LOD_APPARENT;

    device.queue.writeBuffer(uniformBuffer, 0, f32);

    // Stars FIRST (additive), then dust (multiplies over the summed starlight).
    pass.setPipeline(starPipeline);
    pass.setBindGroup(0, starBindGroup);
    pass.setVertexBuffer(0, cornerBuffer);
    pass.setVertexBuffer(1, buffers.starBuf);
    pass.draw(6, buffers.starCount);

    // Dust is skipped when the generation carved no dust layout (dustBuf null).
    if (buffers.dustBuf !== null) {
      pass.setPipeline(dustPipeline);
      pass.setBindGroup(0, dustBindGroup);
      pass.setVertexBuffer(0, cornerBuffer);
      pass.setVertexBuffer(1, buffers.dustBuf);
      pass.draw(6, buffers.dustCount);
    }
  }

  function destroy(): void {
    uniformBuffer.destroy();
    cornerBuffer.destroy();
  }

  const renderer: MilkyWayCloudRenderer = {
    label: 'milkyWayCloudRenderer',
    draw,
    destroy,
  };
  // Confirm the shared label+destroy contract without widening the public type.
  renderer satisfies Renderer;
  return renderer;
}
