/**
 * atmosphereShellRenderer — Earth's physically-based in-scatter atmosphere shell
 * (spec §8). The renderer that finally LINKS the six Task-E4 WESL modules: three
 * LUT bakes (`transmittanceLut`, `multiScatterLut`, `skyViewLut`) + the shell
 * vertex/fragment, sharing the `atmosphere/scattering.wesl` core.
 *
 * ## Three LUTs, two baked once, one per frame
 *
 * The per-pixel sky march is precomputed into three `rgba16float` 2D tables so
 * the shell fragment costs a couple of samples, not a march (spec §11):
 *
 *   - `transmittanceLut` (256×64) — baked ONCE at construction.
 *   - `multiScatterLut`  (32×32)  — baked ONCE at construction, AFTER
 *     transmittance (it samples it).
 *   - `skyViewLut`       (192×108) — re-baked EVERY frame in `encodeSkyView`
 *     (camera altitude + sun direction change frame to frame).
 *
 * ## On-device startup bake (transmittance → multi-scatter, ONE encoder)
 *
 * The two view-independent LUTs bake at construction into ONE command encoder and
 * one `queue.submit`. The multi-scatter pass reads the transmittance LUT, and the
 * pass boundary IS the barrier — WebGPU inserts a storage barrier between two
 * compute passes in the same encoder (the ordering `flowFieldRenderer`'s
 * seed→integrate two-pass encoder documents). No out-of-band per-pass submit.
 *
 * ## First `texture_storage_2d<rgba16float, write>` in the repo
 *
 * All three bakes write a storage texture — a first for skymap (the existing
 * compute precedents write storage BUFFERS). It is core-legal WGSL, but WebKit
 * acceptance is unproven; the E4 modules are shaped so a fragment
 * render-to-texture fallback could replace the bakes without touching any
 * consumer (they only SAMPLE the LUTs). This renderer is the FIRST point that
 * link/validation error can surface — `createShaderModuleWithDevLog` dumps the
 * real `getCompilationInfo()` line if it does.
 *
 * ## Explicit bind-group layouts (never `'auto'`)
 *
 * Every pipeline is built off an explicit `GPUBindGroupLayout` + pipeline layout
 * (`feedback_webgpu_auto_layout_trap`). The bindings below mirror each E4
 * module's `@group(0)` declarations exactly (a mismatch is a silent mis-index the
 * GPU would not report — on iOS it drops the frame).
 *
 * ## Shell pipeline profile (the `ringRenderer` model with two deltas)
 *
 * Colour: `targetFormat` with premultiplied OVER (`srcFactor: 'one'`,
 * `dstFactor: 'one-minus-src-alpha'` — the fragment emits premultiplied rgb).
 * Depth: `depthFormat`, `depthWriteEnabled: false`, `depthCompare: 'less-equal'`
 * (depth-TESTED against the opaque planet, writes no z). `cullMode: 'front'` —
 * only the atmosphere-top proxy's FAR wall rasterises (the delta vs the ring's
 * `'none'` and the cloud shell's `'back'`), `frontFace: 'ccw'`.
 *
 * @module
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { AtmosphereShellRenderer } from '../../../../@types/rendering/AtmosphereShellRenderer';
import type { AtmosphereParams } from '../../../../@types/scene/AtmosphereParams';
import { uvSphereMesh } from '../../../../utils/math/uvSphereMesh';
import { ATMOSPHERE_UNIFORM_FLOATS } from '../../../../utils/gpu/packAtmosphereUniforms';
import {
  packScatteringParams,
  SCATTERING_PARAMS_FLOATS,
} from '../../../../utils/gpu/packScatteringParams';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import transmittanceCode from '../../shaders/atmosphere/transmittanceLut.wesl?static';
import multiScatterCode from '../../shaders/atmosphere/multiScatterLut.wesl?static';
import skyViewCode from '../../shaders/atmosphere/skyViewLut.wesl?static';
import shellVsCode from '../../shaders/atmosphere/shell/vertex.wesl?static';
import shellFsCode from '../../shaders/atmosphere/shell/fragment.wesl?static';

/** Proxy-sphere tessellation — 48×24, shared with the other sphere shells. The
 *  atmosphere shell is body-agnostic + low-frequency (a glow, not a texture), so
 *  the UV sphere's pole pinch is invisible and the cube-sphere is unnecessary. */
const SEGMENTS = 48;
const RINGS = 24;

/** LUT dimensions — the SINGLE home for each table's size. The E4 bake modules no
 *  longer restate these: each derives its bounds guard + uv divisor from
 *  `textureDimensions(outTex)`, so this `createTexture` size drives both the
 *  allocation + dispatch here AND the shader parametrisation. */
const TRANSMITTANCE_LUT_SIZE: readonly [number, number] = [256, 64];
const MULTI_SCATTER_LUT_SIZE: readonly [number, number] = [32, 32];
const SKY_VIEW_LUT_SIZE: readonly [number, number] = [192, 108];

/** Every bake dispatches an 8×8 workgroup grid (matches `@workgroup_size(8,8)`). */
const WORKGROUP_SIZE = 8;

/** LUT storage format — first `rgba16float` storage-texture write in the repo. */
const LUT_FORMAT: GPUTextureFormat = 'rgba16float';

/** `SkyViewParams` — 16 bytes / 4 f32 (see `skyViewLut.wesl`). */
const SKY_VIEW_PARAMS_BYTES = 16;
/** `AtmosphereUniforms` byte size — derived from the packer's f32 count (single
 *  source of truth), not restated as a literal. */
const ATMOSPHERE_UNIFORM_BYTES = ATMOSPHERE_UNIFORM_FLOATS * 4;

/** Ceil-divide a LUT dimension into 8×8 workgroups. */
function dispatchCount(px: number): number {
  return Math.ceil(px / WORKGROUP_SIZE);
}

export function createAtmosphereShellRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat, // 'rgba16float' (foreground:0)
  depthFormat: GPUTextureFormat, // 'depth32float' (foreground:0)
  params: AtmosphereParams, // Earth today — bakes ITS transmittance + multi-scatter set
): AtmosphereShellRenderer {
  // ── The three LUT textures (rgba16float, STORAGE + TEXTURE binding) ─────────
  //
  // STORAGE_BINDING lets the bake compute pass write via `textureStore`;
  // TEXTURE_BINDING lets downstream passes + the shell fragment SAMPLE. The
  // sky-view LUT needs both every frame (written by `encodeSkyView`, sampled by
  // the shell draw the same frame).
  function createLut(label: string, size: readonly [number, number]): GPUTexture {
    return device.createTexture({
      label,
      size: [size[0], size[1], 1],
      format: LUT_FORMAT,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
  }
  const transmittanceTex = createLut('atmosphere-transmittance-lut', TRANSMITTANCE_LUT_SIZE);
  const multiScatterTex = createLut('atmosphere-multiscatter-lut', MULTI_SCATTER_LUT_SIZE);
  const skyViewTex = createLut('atmosphere-skyview-lut', SKY_VIEW_LUT_SIZE);

  const transmittanceView = transmittanceTex.createView();
  const multiScatterView = multiScatterTex.createView();
  const skyViewView = skyViewTex.createView();

  // ── Sampler: linear + clamp-to-edge both axes ──────────────────────────────
  //
  // The LUT parametrisations assume clamped edges (no sub-uv edge correction is
  // applied — a deliberate v1 simplification), and the tables are smooth, so
  // linear mag/min. No mip chain (single-level LUTs; every sample is level 0).
  const sampler = device.createSampler({
    label: 'atmosphere-lut-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  // ── Uniform buffers ────────────────────────────────────────────────────────
  //
  // ScatteringParams: written once here (the baked constants never change).
  // SkyViewParams: rewritten per frame in `encodeSkyView`. AtmosphereUniforms:
  // rewritten per draw. Each is a single record (Earth is the sole atmosphere
  // body → at most one bake set + one draw per frame, so a single non-dynamic
  // buffer each is race-free — the same precondition every single-buffer body
  // renderer holds).
  const scatteringBuffer = device.createBuffer({
    label: 'atmosphere-scattering-params',
    size: SCATTERING_PARAMS_FLOATS * 4,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(scatteringBuffer, 0, packScatteringParams(params));

  const skyViewParamsBuffer = device.createBuffer({
    label: 'atmosphere-skyview-params',
    size: SKY_VIEW_PARAMS_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  const shellUniformBuffer = device.createBuffer({
    label: 'atmosphere-shell-uniform',
    size: ATMOSPHERE_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // ── Proxy sphere geometry (positions only — the vertex reads @location(0)) ──
  //
  // `composeBodyMvp` scales this unit sphere to the atmosphere-top radius, so the
  // atmosphere top is the UNIT sphere in the mesh's local frame. The mesh also
  // emits uvs; the shell samples no surface texture, so only positions upload.
  const mesh = uvSphereMesh(SEGMENTS, RINGS);
  const indexCount = mesh.indices.length;

  const positionBuffer = device.createBuffer({
    label: 'atmosphere-position-vbo',
    size: mesh.positions.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(positionBuffer, 0, mesh.positions);

  const indexBuffer = device.createBuffer({
    label: 'atmosphere-index-ibo',
    size: mesh.indices.byteLength,
    usage: GPUBufferUsage.INDEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(indexBuffer, 0, mesh.indices);

  // ── Shader modules ─────────────────────────────────────────────────────────
  //
  // Every module linked here through `createShaderModuleWithDevLog` — the FIRST
  // real link of the six E4 modules (nothing imported them before). A missing
  // symbol, a binding-type mismatch, or an iOS-strict storage-texture rejection
  // surfaces here via `getCompilationInfo()`.
  const transmittanceModule = createShaderModuleWithDevLog(
    device,
    transmittanceCode,
    'atmosphere.transmittanceLut',
  );
  const multiScatterModule = createShaderModuleWithDevLog(
    device,
    multiScatterCode,
    'atmosphere.multiScatterLut',
  );
  const skyViewModule = createShaderModuleWithDevLog(device, skyViewCode, 'atmosphere.skyViewLut');
  const shellVsModule = createShaderModuleWithDevLog(
    device,
    shellVsCode,
    'atmosphere.shell.vertex',
  );
  const shellFsModule = createShaderModuleWithDevLog(
    device,
    shellFsCode,
    'atmosphere.shell.fragment',
  );

  // ── Transmittance bake pipeline ────────────────────────────────────────────
  // group 0: [0] ScatteringParams uniform, [1] storage tex (write).
  const transmittanceBgl = device.createBindGroupLayout({
    label: 'atmosphere-transmittance-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      {
        binding: 1,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { access: 'write-only', format: LUT_FORMAT },
      },
    ],
  });
  const transmittancePipeline = device.createComputePipeline({
    label: 'atmosphere-transmittance-pipeline',
    layout: device.createPipelineLayout({
      label: 'atmosphere-transmittance-pipeline-layout',
      bindGroupLayouts: [transmittanceBgl],
    }),
    compute: { module: transmittanceModule, entryPoint: 'cs' },
  });
  const transmittanceBindGroup = device.createBindGroup({
    label: 'atmosphere-transmittance-bg',
    layout: transmittanceBgl,
    entries: [
      { binding: 0, resource: { buffer: scatteringBuffer } },
      { binding: 1, resource: transmittanceView },
    ],
  });

  // ── Multi-scatter bake pipeline ────────────────────────────────────────────
  // group 0: [0] ScatteringParams, [1] transmittance tex, [2] sampler,
  //          [3] storage tex (write).
  const multiScatterBgl = device.createBindGroupLayout({
    label: 'atmosphere-multiscatter-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, sampler: { type: 'filtering' } },
      {
        binding: 3,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { access: 'write-only', format: LUT_FORMAT },
      },
    ],
  });
  const multiScatterPipeline = device.createComputePipeline({
    label: 'atmosphere-multiscatter-pipeline',
    layout: device.createPipelineLayout({
      label: 'atmosphere-multiscatter-pipeline-layout',
      bindGroupLayouts: [multiScatterBgl],
    }),
    compute: { module: multiScatterModule, entryPoint: 'cs' },
  });
  const multiScatterBindGroup = device.createBindGroup({
    label: 'atmosphere-multiscatter-bg',
    layout: multiScatterBgl,
    entries: [
      { binding: 0, resource: { buffer: scatteringBuffer } },
      { binding: 1, resource: transmittanceView },
      { binding: 2, resource: sampler },
      { binding: 3, resource: multiScatterView },
    ],
  });

  // ── Sky-view bake pipeline (per frame) ─────────────────────────────────────
  // group 0: [0] ScatteringParams, [1] SkyViewParams, [2] transmittance tex,
  //          [3] multiScatter tex, [4] sampler, [5] storage tex (write).
  const skyViewBgl = device.createBindGroupLayout({
    label: 'atmosphere-skyview-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, sampler: { type: 'filtering' } },
      {
        binding: 5,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { access: 'write-only', format: LUT_FORMAT },
      },
    ],
  });
  const skyViewPipeline = device.createComputePipeline({
    label: 'atmosphere-skyview-pipeline',
    layout: device.createPipelineLayout({
      label: 'atmosphere-skyview-pipeline-layout',
      bindGroupLayouts: [skyViewBgl],
    }),
    compute: { module: skyViewModule, entryPoint: 'cs' },
  });
  const skyViewBindGroup = device.createBindGroup({
    label: 'atmosphere-skyview-bg',
    layout: skyViewBgl,
    entries: [
      { binding: 0, resource: { buffer: scatteringBuffer } },
      { binding: 1, resource: { buffer: skyViewParamsBuffer } },
      { binding: 2, resource: transmittanceView },
      { binding: 3, resource: multiScatterView },
      { binding: 4, resource: sampler },
      { binding: 5, resource: skyViewView },
    ],
  });

  // ── Shell render pipeline ──────────────────────────────────────────────────
  // group 0: [0] AtmosphereUniforms (VERTEX+FRAGMENT), [1] sampler,
  //          [2] skyView tex, [3] transmittance tex.
  const shellBgl = device.createBindGroupLayout({
    label: 'atmosphere-shell-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
    ],
  });
  const shellBindGroup = device.createBindGroup({
    label: 'atmosphere-shell-bg',
    layout: shellBgl,
    entries: [
      { binding: 0, resource: { buffer: shellUniformBuffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: skyViewView },
      { binding: 3, resource: transmittanceView },
    ],
  });

  const shellPipeline = device.createRenderPipeline({
    label: 'atmosphere-shell-pipeline',
    layout: device.createPipelineLayout({
      label: 'atmosphere-shell-pipeline-layout',
      bindGroupLayouts: [shellBgl],
    }),
    vertex: {
      module: shellVsModule,
      entryPoint: 'vs',
      buffers: [
        {
          arrayStride: 12, // 3 × f32 position
          attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
        },
      ],
    },
    fragment: {
      module: shellFsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: targetFormat,
          // Premultiplied OVER: the fragment emits premultiplied rgb
          // (`inScatter`), so src is added straight and the background is
          // attenuated by (1 - src.a).
          blend: {
            color: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
          },
        },
      ],
    },
    primitive: {
      topology: 'triangle-list',
      // Draw BACK faces: cull FRONT so only the atmosphere-top proxy's FAR wall
      // rasterises (the delta vs the ring's 'none' and the cloud shell's 'back').
      // Depth-testing that far wall against the opaque planet splits limb / disc /
      // occluded-by-nearer-body for free.
      frontFace: 'ccw',
      cullMode: 'front',
    },
    depthStencil: {
      format: depthFormat,
      // Depth-TESTED against the opaque planet ('less-equal') but writes NO depth
      // — a translucent overlay must not stamp z.
      depthWriteEnabled: false,
      depthCompare: 'less-equal',
    },
  });

  // ── Startup bake: transmittance THEN multi-scatter, ONE encoder ────────────
  //
  // Both view-independent LUTs bake here in a single construction-time encoder +
  // one submit. The multi-scatter pass samples the transmittance LUT, and the
  // compute-pass boundary is the barrier WebGPU inserts between the two passes —
  // so the ordering holds with no out-of-band submit (the two-pass encoder
  // lesson `flowFieldRenderer` documents). The sky-view LUT is NOT baked here —
  // it depends on the per-frame camera + sun state (`encodeSkyView`).
  {
    const encoder = device.createCommandEncoder({ label: 'atmosphere-startup-bake' });

    const transmittancePass = encoder.beginComputePass({ label: 'atmosphere-transmittance-pass' });
    transmittancePass.setPipeline(transmittancePipeline);
    transmittancePass.setBindGroup(0, transmittanceBindGroup);
    transmittancePass.dispatchWorkgroups(
      dispatchCount(TRANSMITTANCE_LUT_SIZE[0]),
      dispatchCount(TRANSMITTANCE_LUT_SIZE[1]),
    );
    transmittancePass.end();

    const multiScatterPass = encoder.beginComputePass({ label: 'atmosphere-multiscatter-pass' });
    multiScatterPass.setPipeline(multiScatterPipeline);
    multiScatterPass.setBindGroup(0, multiScatterBindGroup);
    multiScatterPass.dispatchWorkgroups(
      dispatchCount(MULTI_SCATTER_LUT_SIZE[0]),
      dispatchCount(MULTI_SCATTER_LUT_SIZE[1]),
    );
    multiScatterPass.end();

    device.queue.submit([encoder.finish()]);
  }

  // ── encodeSkyView (per frame) ──────────────────────────────────────────────

  function encodeSkyView(encoder: GPUCommandEncoder, skyViewUniforms: Float32Array): void {
    // Write the per-frame camera + sun state, then dispatch the sky-view bake
    // into `encoder` (the same frame encoder, submitted downstream). One write +
    // one dispatch per frame → no writeBuffer/submit race (the flow precedent).
    device.queue.writeBuffer(skyViewParamsBuffer, 0, skyViewUniforms);
    const pass = encoder.beginComputePass({ label: 'atmosphere-skyview-pass' });
    pass.setPipeline(skyViewPipeline);
    pass.setBindGroup(0, skyViewBindGroup);
    pass.dispatchWorkgroups(
      dispatchCount(SKY_VIEW_LUT_SIZE[0]),
      dispatchCount(SKY_VIEW_LUT_SIZE[1]),
    );
    pass.end();
  }

  // ── draw ───────────────────────────────────────────────────────────────────

  function draw(pass: GPURenderPassEncoder, uniforms: Float32Array): void {
    device.queue.writeBuffer(shellUniformBuffer, 0, uniforms);
    pass.setPipeline(shellPipeline);
    pass.setBindGroup(0, shellBindGroup);
    pass.setVertexBuffer(0, positionBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.drawIndexed(indexCount);
  }

  // ── destroy ────────────────────────────────────────────────────────────────

  function destroy(): void {
    transmittanceTex.destroy();
    multiScatterTex.destroy();
    skyViewTex.destroy();
    scatteringBuffer.destroy();
    skyViewParamsBuffer.destroy();
    shellUniformBuffer.destroy();
    positionBuffer.destroy();
    indexBuffer.destroy();
  }

  const renderer: AtmosphereShellRenderer = {
    label: 'atmosphereShellRenderer',
    encodeSkyView,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
