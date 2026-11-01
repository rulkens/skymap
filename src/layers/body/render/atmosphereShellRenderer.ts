/**
 * atmosphereShellRenderer: the in-scatter atmosphere shell, one bundle per
 * `ATMOSPHERE_PARAMS` row over one shared program. Three `rgba16float` LUTs stand in
 * for the per-pixel march: transmittance (256x64) and multi-scatter (32x32) bake once
 * at construction, sky-view (192x108) re-bakes every frame. Each body owns its LUTs,
 * uniform buffers and bind groups (~300 KiB), because `queue.writeBuffer` interleaved
 * with `submit` does NOT preserve order: a shared per-frame buffer would let a later
 * body's write corrupt an earlier body's draw. The shell draws TWICE per body,
 * MULTIPLY (`dst *= per-channel transmittance`) then ADD (`dst += in-scatter`); see
 * `shell/fragment.wesl` for why one alpha cannot do it.
 */

import type { Renderer } from '../../../@types/rendering/Renderer';
import type { AtmosphereShellDepth } from '../@types/AtmosphereShellDepth';
import type { AtmosphereShellRenderer } from '../@types/AtmosphereShellRenderer';
import type { AtmosphereParams } from '../../../@types/scene/AtmosphereParams';
import { uvSphereMesh } from '../../../utils/math/uvSphereMesh';
import { ATMOSPHERE_UNIFORM_FLOATS } from './packAtmosphereUniforms';
import { packScatteringParams, SCATTERING_PARAMS_BYTES } from './packScatteringParams';
import { createShaderModuleWithDevLog } from '../../../services/gpu/shaderCompileLogger';
import { createAerialPerspectiveRenderer } from './aerialPerspectiveRenderer';
import transmittanceCode from '../../../services/gpu/shaders/atmosphere/transmittanceLut.wesl?static';
import multiScatterCode from '../../../services/gpu/shaders/atmosphere/multiScatterLut.wesl?static';
import skyViewCode from '../../../services/gpu/shaders/atmosphere/skyViewLut.wesl?static';
import shellVsCode from '../../../services/gpu/shaders/atmosphere/shell/vertex.wesl?static';
import shellFsCode from '../../../services/gpu/shaders/atmosphere/shell/fragment.wesl?static';

/** 128x64. Only the proxy's far wall rasterises, so its silhouette IS the limb, and a
 *  coarse UV sphere polygonises it inward by ~cos(pi/SEGMENTS). Sized off the THINNEST
 *  atmosphere band (Earth's, ~1.4% of the radius): 48x24 eats ~15% of it and scallops
 *  the edge; 128x64 eats ~2%. Coarseness is invisible in the interior, not at the edge. */
const SEGMENTS = 128;
const RINGS = 64;

/** The SINGLE home for each LUT's size: the bake shaders derive their bounds and uv
 *  divisor from `textureDimensions(outTex)`. */
const TRANSMITTANCE_LUT_SIZE: readonly [number, number] = [256, 64];
const MULTI_SCATTER_LUT_SIZE: readonly [number, number] = [32, 32];
const SKY_VIEW_LUT_SIZE: readonly [number, number] = [192, 108];

/** Every bake dispatches an 8×8 workgroup grid (matches `@workgroup_size(8,8)`). */
const WORKGROUP_SIZE = 8;

/** HDR in-scatter values exceed 1.0, so the LUTs cannot be an 8-bit format. */
const LUT_FORMAT: GPUTextureFormat = 'rgba16float';

/** `SkyViewParams`: 4 f32 (see `skyViewLut.wesl`). */
const SKY_VIEW_PARAMS_BYTES = 16;
/** Derived from the packer's f32 count. */
const ATMOSPHERE_UNIFORM_BYTES = ATMOSPHERE_UNIFORM_FLOATS * 4;

/**
 * Byte offsets of the shell fragment's `ShellDepthFrame` (binding 6), pinned against
 * that struct by `atmosphereShellDepth.parity.test.ts`; a silent drift writes the
 * camera where the shader reads the viewport. `camPosKm` (vec3) ends at 76 and the
 * following vec2 aligns to 8, so 80; the struct rounds up to 16-byte alignment.
 */
export const SHELL_DEPTH_INV_MVP_OFFSET = 0;
export const SHELL_DEPTH_CAM_POS_OFFSET = 64; // mat4x4<f32>
export const SHELL_DEPTH_VIEWPORT_OFFSET = 80;
export const SHELL_DEPTH_KM_TO_LOCAL_OFFSET = 88;
export const SHELL_DEPTH_UNIFORM_BYTES = 96;

/** Ceil-divide a LUT dimension into 8×8 workgroups. */
function dispatchCount(px: number): number {
  return Math.ceil(px / WORKGROUP_SIZE);
}

/** One body's private GPU resources, wired to the SHARED pipelines by its own bind groups. */
type AtmosphereBundle = {
  transmittanceTex: GPUTexture;
  multiScatterTex: GPUTexture;
  skyViewTex: GPUTexture;
  /** `null` while the body binds the shared 1x1 transparent placeholder. */
  ringTexture: GPUTexture | null;
  scatteringBuffer: GPUBuffer;
  skyViewParamsBuffer: GPUBuffer;
  shellUniformBuffer: GPUBuffer;
  /** Per-body for the `writeBuffer` ordering reason in the header; km-to-local differs per row. */
  depthFrameBuffer: GPUBuffer;
  transmittanceBindGroup: GPUBindGroup;
  multiScatterBindGroup: GPUBindGroup;
  skyViewBindGroup: GPUBindGroup;
  /** Built at first draw, nulled when invalidated: it binds a depth view only the draw knows. */
  shellBindGroup: GPUBindGroup | null;
  /** Identity, not size, keys the rebuild: it always changes on a reallocation. */
  shellDepthView: GPUTextureView | null;
};

export function createAtmosphereShellRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat, // 'rgba16float' (foreground:0)
  paramsById: Readonly<Record<string, AtmosphereParams>>, // one bundle per row (Earth, six planets, Pluto)
): AtmosphereShellRenderer {
  // The LUT parametrisations assume clamped edges (no sub-uv edge correction).
  const sampler = device.createSampler({
    label: 'atmosphere-lut-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  // `composeBodyMvp` scales this unit sphere to the atmosphere-top radius. Positions
  // only (no surface texture); shared across bodies.
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

  // Layouts are explicit, never 'auto', and mirror each module's `@group(0)` exactly;
  // a mismatch is a silent mis-index. group 0: [0] ScatteringParams, [1] storage tex.
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

  // group 0: [0] ScatteringParams, [1] transmittance tex, [2] sampler, [3] storage tex.
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

  // group 0: [0] ScatteringParams, [1] SkyViewParams, [2] transmittance tex,
  //          [3] multiScatter tex, [4] sampler, [5] storage tex.
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

  // group 0: [0] AtmosphereUniforms, [1] sampler, [2] skyView tex, [3] transmittance
  //          tex, [4] ring-alpha strip, [5] sampled scene depth, [6] its unproject frame.
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
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });

  // Shared 1x1 transparent ring placeholder for every body without a committed strip;
  // never sampled ('ringOuterRatio == 0'), it keeps ONE bind-group layout.
  const placeholderRing = device.createTexture({
    label: 'atmosphere-placeholder-ring',
    size: [1, 1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
  });
  device.queue.writeTexture(
    { texture: placeholderRing },
    new Uint8Array([0, 0, 0, 0]),
    { bytesPerRow: 4 },
    [1, 1, 1],
  );

  // The two passes differ ONLY in fragment entry point and blend; everything else is
  // built once, since any drift in cull mode would make them cover different pixels
  // and double-count or drop the limb.
  const shellPipelineLayout = device.createPipelineLayout({
    label: 'atmosphere-shell-pipeline-layout',
    bindGroupLayouts: [shellBgl],
  });
  const shellVertexState: GPUVertexState = {
    module: shellVsModule,
    entryPoint: 'vs',
    buffers: [
      {
        arrayStride: 12, // 3 × f32 position
        attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x3' }],
      },
    ],
  };
  const shellPrimitiveState: GPUPrimitiveState = {
    topology: 'triangle-list',
    // Both walls: the fragment splits duty by front_facing (see `fragment.wesl`).
    frontFace: 'ccw',
    cullMode: 'none',
  };

  // NO depthStencil: the step SAMPLES `foreground:0`'s depth rather than attaching it,
  // and a pipeline naming a depth format is rejected by a pass that has none.
  function createShellPipeline(
    label: string,
    entryPoint: string,
    blend: GPUBlendState,
  ): GPURenderPipeline {
    return device.createRenderPipeline({
      label,
      layout: shellPipelineLayout,
      vertex: shellVertexState,
      fragment: { module: shellFsModule, entryPoint, targets: [{ format: targetFormat, blend }] },
      primitive: shellPrimitiveState,
    });
  }

  // MULTIPLY: `dstFactor: 'src'` takes the source's OWN component, a per-channel `dst *= transmittance`.
  const multiplyBlend: GPUBlendState = {
    color: { srcFactor: 'zero', dstFactor: 'src', operation: 'add' },
    alpha: { srcFactor: 'zero', dstFactor: 'src', operation: 'add' },
  };
  const shellMultiplyPipeline = createShellPipeline(
    'atmosphere-shell-multiply-pipeline',
    'fsMultiply',
    multiplyBlend,
  );

  // ADD: the compositor reads `foreground:0` alpha as STRAIGHT alpha (the background
  // weight), which the two passes together leave as a single OVER draw would.
  const addBlend: GPUBlendState = {
    color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  };
  const shellAddPipeline = createShellPipeline('atmosphere-shell-add-pipeline', 'fsAdd', addBlend);

  // ScatteringParams is written once; SkyViewParams every frame; AtmosphereUniforms
  // per outside draw or inside bake.
  const bundles = new Map<string, AtmosphereBundle>();

  /** The sky-view size actually built (`reconcile` rewrites it, see `skyViewLutSizeByTier.ts`), so dispatch tracks it. */
  let currentSkyViewLutSize: readonly [number, number] = SKY_VIEW_LUT_SIZE;

  function createLut(label: string, size: readonly [number, number]): GPUTexture {
    return device.createTexture({
      label,
      size: [size[0], size[1], 1],
      format: LUT_FORMAT,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
  }

  function createBundle(bodyId: string, params: AtmosphereParams): AtmosphereBundle {
    const transmittanceTex = createLut(
      `atmosphere-transmittance-lut-${bodyId}`,
      TRANSMITTANCE_LUT_SIZE,
    );
    const multiScatterTex = createLut(
      `atmosphere-multiscatter-lut-${bodyId}`,
      MULTI_SCATTER_LUT_SIZE,
    );
    const skyViewTex = createLut(`atmosphere-skyview-lut-${bodyId}`, SKY_VIEW_LUT_SIZE);

    const transmittanceView = transmittanceTex.createView();
    const multiScatterView = multiScatterTex.createView();

    const scatteringBuffer = device.createBuffer({
      label: `atmosphere-scattering-params-${bodyId}`,
      size: SCATTERING_PARAMS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(scatteringBuffer, 0, packScatteringParams(params));

    const skyViewParamsBuffer = device.createBuffer({
      label: `atmosphere-skyview-params-${bodyId}`,
      size: SKY_VIEW_PARAMS_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const shellUniformBuffer = device.createBuffer({
      label: `atmosphere-shell-uniform-${bodyId}`,
      size: ATMOSPHERE_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const depthFrameBuffer = device.createBuffer({
      label: `atmosphere-shell-depth-frame-${bodyId}`,
      size: SHELL_DEPTH_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const transmittanceBindGroup = device.createBindGroup({
      label: `atmosphere-transmittance-bg-${bodyId}`,
      layout: transmittanceBgl,
      entries: [
        { binding: 0, resource: { buffer: scatteringBuffer } },
        { binding: 1, resource: transmittanceView },
      ],
    });

    const multiScatterBindGroup = device.createBindGroup({
      label: `atmosphere-multiscatter-bg-${bodyId}`,
      layout: multiScatterBgl,
      entries: [
        { binding: 0, resource: { buffer: scatteringBuffer } },
        { binding: 1, resource: transmittanceView },
        { binding: 2, resource: sampler },
        { binding: 3, resource: multiScatterView },
      ],
    });

    const skyViewBindGroup = buildSkyViewBindGroup(bodyId, {
      scatteringBuffer,
      skyViewParamsBuffer,
      transmittanceTex,
      multiScatterTex,
      skyViewTex,
    });

    return {
      transmittanceTex,
      multiScatterTex,
      skyViewTex,
      ringTexture: null,
      scatteringBuffer,
      skyViewParamsBuffer,
      shellUniformBuffer,
      depthFrameBuffer,
      transmittanceBindGroup,
      multiScatterBindGroup,
      skyViewBindGroup,
      shellBindGroup: null,
      shellDepthView: null,
    };
  }

  /** Split out so `reconcile` can rebind binding 5 to a resized `skyViewTex`. */
  function buildSkyViewBindGroup(
    bodyId: string,
    res: Pick<
      AtmosphereBundle,
      | 'scatteringBuffer'
      | 'skyViewParamsBuffer'
      | 'transmittanceTex'
      | 'multiScatterTex'
      | 'skyViewTex'
    >,
  ): GPUBindGroup {
    return device.createBindGroup({
      label: `atmosphere-skyview-bg-${bodyId}`,
      layout: skyViewBgl,
      entries: [
        { binding: 0, resource: { buffer: res.scatteringBuffer } },
        { binding: 1, resource: { buffer: res.skyViewParamsBuffer } },
        { binding: 2, resource: res.transmittanceTex.createView() },
        { binding: 3, resource: res.multiScatterTex.createView() },
        { binding: 4, resource: sampler },
        { binding: 5, resource: res.skyViewTex.createView() },
      ],
    });
  }

  /** Over the depth view the current draw hands in; `ringTexture: null` binds the placeholder. */
  function buildShellBindGroup(
    bodyId: string,
    bundle: AtmosphereBundle,
    depthView: GPUTextureView,
  ): GPUBindGroup {
    return device.createBindGroup({
      label: `atmosphere-shell-bg-${bodyId}`,
      layout: shellBgl,
      entries: [
        { binding: 0, resource: { buffer: bundle.shellUniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: bundle.skyViewTex.createView() },
        { binding: 3, resource: bundle.transmittanceTex.createView() },
        { binding: 4, resource: (bundle.ringTexture ?? placeholderRing).createView() },
        { binding: 5, resource: depthView },
        { binding: 6, resource: { buffer: bundle.depthFrameBuffer } },
      ],
    });
  }

  for (const [bodyId, params] of Object.entries(paramsById)) {
    bundles.set(bodyId, createBundle(bodyId, params));
  }

  // Transmittance THEN multi-scatter, per body, in ONE encoder and one submit: the
  // compute-pass boundary is the barrier WebGPU inserts between the two. Do NOT
  // submit per body. Sky-view is not baked here (per-frame camera and sun state).
  {
    const encoder = device.createCommandEncoder({ label: 'atmosphere-startup-bake' });

    for (const bundle of bundles.values()) {
      const transmittancePass = encoder.beginComputePass({
        label: 'atmosphere-transmittance-pass',
      });
      transmittancePass.setPipeline(transmittancePipeline);
      transmittancePass.setBindGroup(0, bundle.transmittanceBindGroup);
      transmittancePass.dispatchWorkgroups(
        dispatchCount(TRANSMITTANCE_LUT_SIZE[0]),
        dispatchCount(TRANSMITTANCE_LUT_SIZE[1]),
      );
      transmittancePass.end();

      const multiScatterPass = encoder.beginComputePass({
        label: 'atmosphere-multiscatter-pass',
      });
      multiScatterPass.setPipeline(multiScatterPipeline);
      multiScatterPass.setBindGroup(0, bundle.multiScatterBindGroup);
      multiScatterPass.dispatchWorkgroups(
        dispatchCount(MULTI_SCATTER_LUT_SIZE[0]),
        dispatchCount(MULTI_SCATTER_LUT_SIZE[1]),
      );
      multiScatterPass.end();
    }

    device.queue.submit([encoder.finish()]);
  }

  // The inside-the-shell half over the SAME bundles; built after the bundle loop.
  const placeholderRingView = placeholderRing.createView();
  const aerial = createAerialPerspectiveRenderer(
    device,
    targetFormat,
    sampler,
    placeholderRingView,
    bundles,
  );

  /** An unknown id is a programming error: `atmosphereDrawList` ids come from the same `paramsById` table. */
  function bundleFor(bodyId: string): AtmosphereBundle {
    const bundle = bundles.get(bodyId);
    if (bundle === undefined) {
      throw new Error(`atmosphereShellRenderer: unknown body id '${bodyId}'`);
    }
    return bundle;
  }

  function dispatchSkyView(
    pass: GPUComputePassEncoder,
    bodyId: string,
    skyViewUniforms: Float32Array,
  ): void {
    // Per-body params buffer and LUT make sharing the caller's pass hazard-free.
    const bundle = bundleFor(bodyId);
    device.queue.writeBuffer(bundle.skyViewParamsBuffer, 0, skyViewUniforms);
    pass.setPipeline(skyViewPipeline);
    pass.setBindGroup(0, bundle.skyViewBindGroup);
    pass.dispatchWorkgroups(
      dispatchCount(currentSkyViewLutSize[0]),
      dispatchCount(currentSkyViewLutSize[1]),
    );
  }

  function reconcile(config: { readonly skyViewLutSize: readonly [number, number] }): void {
    const [width, height] = config.skyViewLutSize;
    if (width === currentSkyViewLutSize[0] && height === currentSkyViewLutSize[1]) return;
    currentSkyViewLutSize = config.skyViewLutSize;
    for (const [bodyId, bundle] of bundles) {
      bundle.skyViewTex.destroy();
      bundle.skyViewTex = createLut(`atmosphere-skyview-lut-${bodyId}`, currentSkyViewLutSize);
      // A bind group holds the VIEW, so both referencing groups must be replaced; the
      // shell's is only dropped (it also binds a depth view), rebuilt at the next draw.
      bundle.skyViewBindGroup = buildSkyViewBindGroup(bodyId, bundle);
      bundle.shellBindGroup = null;
      aerial.rebind(bodyId, bundle);
    }
  }

  function setRingTexture(bodyId: string, bitmap: ImageBitmap): void {
    // A miss is a no-op, unlike `bundleFor`: the ring-atmosphere link is optional by data.
    const bundle = bundles.get(bodyId);
    if (bundle === undefined) return;
    bundle.ringTexture?.destroy();
    const texture = device.createTexture({
      label: `atmosphere-ring-${bodyId}`,
      size: [bitmap.width, bitmap.height, 1],
      format: 'rgba8unorm-srgb',
      // RENDER_ATTACHMENT: Dawn rejects copyExternalImageToTexture without it.
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });
    device.queue.copyExternalImageToTexture({ source: bitmap }, { texture }, [
      bitmap.width,
      bitmap.height,
      1,
    ]);
    bundle.ringTexture = texture;
    bundle.shellBindGroup = null;
  }

  // One scratch for every body: `writeBuffer` copies at call time; only the GPU buffers must be per-body.
  const depthScratch = new ArrayBuffer(SHELL_DEPTH_UNIFORM_BYTES);
  const depthInvMvp = new Float32Array(depthScratch, SHELL_DEPTH_INV_MVP_OFFSET, 16);
  const depthCamPosKm = new Float32Array(depthScratch, SHELL_DEPTH_CAM_POS_OFFSET, 3);
  const depthViewportPx = new Float32Array(depthScratch, SHELL_DEPTH_VIEWPORT_OFFSET, 2);
  const depthKmToLocal = new Float32Array(depthScratch, SHELL_DEPTH_KM_TO_LOCAL_OFFSET, 1);

  function draw(
    pass: GPURenderPassEncoder,
    bodyId: string,
    uniforms: Float32Array,
    depth: AtmosphereShellDepth,
  ): void {
    const bundle = bundleFor(bodyId);
    device.queue.writeBuffer(bundle.shellUniformBuffer, 0, uniforms);
    // A null frame arrives with the far-cleared placeholder view, so FAR_DEPTH never reads these.
    if (depth.frame !== null) {
      depthInvMvp.set(depth.frame.invMvp);
      depthCamPosKm.set(depth.frame.camPosKm);
    }
    depthViewportPx.set(depth.viewportPx);
    depthKmToLocal[0] = depth.kmToLocal;
    device.queue.writeBuffer(bundle.depthFrameBuffer, 0, depthScratch);
    if (bundle.shellBindGroup === null || bundle.shellDepthView !== depth.view) {
      bundle.shellDepthView = depth.view;
      bundle.shellBindGroup = buildShellBindGroup(bodyId, bundle, depth.view);
    }
    pass.setBindGroup(0, bundle.shellBindGroup);
    // MULTIPLY strictly BEFORE ADD, or the multiply would attenuate this body's own in-scatter.
    pass.setVertexBuffer(0, positionBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.setPipeline(shellMultiplyPipeline);
    pass.drawIndexed(indexCount);
    pass.setPipeline(shellAddPipeline);
    pass.drawIndexed(indexCount);
  }

  function bakeAerialPerspective(
    pass: GPUComputePassEncoder,
    bodyId: string,
    uniforms: Float32Array,
  ): void {
    aerial.bake(pass, bodyId, uniforms);
  }

  function drawAerialPerspective(
    pass: GPURenderPassEncoder,
    bodyId: string,
    depthView: GPUTextureView,
  ): void {
    aerial.draw(pass, bodyId, depthView);
  }

  function destroy(): void {
    for (const bundle of bundles.values()) {
      bundle.transmittanceTex.destroy();
      bundle.multiScatterTex.destroy();
      bundle.skyViewTex.destroy();
      bundle.ringTexture?.destroy();
      bundle.scatteringBuffer.destroy();
      bundle.skyViewParamsBuffer.destroy();
      bundle.shellUniformBuffer.destroy();
      bundle.depthFrameBuffer.destroy();
    }
    bundles.clear();
    aerial.destroy();
    placeholderRing.destroy();
    positionBuffer.destroy();
    indexBuffer.destroy();
  }

  const renderer: AtmosphereShellRenderer = {
    label: 'atmosphereShellRenderer',
    dispatchSkyView,
    setRingTexture,
    draw,
    bakeAerialPerspective,
    drawAerialPerspective,
    destroy,
    reconcile,
  };
  renderer satisfies Renderer;
  return renderer;
}
