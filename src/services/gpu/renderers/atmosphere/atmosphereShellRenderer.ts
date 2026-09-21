/**
 * atmosphereShellRenderer — the physically-based in-scatter atmosphere shell (spec
 * §8): one bundle per `ATMOSPHERE_PARAMS` row over one shared program. Three
 * `rgba16float` LUTs stand in for the per-pixel march (spec §11): transmittance
 * (256×64) and multi-scatter (32×32) bake once at construction, sky-view (192×108)
 * re-bakes every frame from the camera + sun state. Each body owns its own LUTs,
 * uniform buffers and bind groups — ~300 KiB per row — because `queue.writeBuffer`
 * interleaved with `submit` does NOT preserve order, so a shared per-frame buffer
 * would let a later body's write corrupt an earlier body's draw.
 *
 * The shell itself draws TWICE per body: a MULTIPLY pass (`dst *= per-channel
 * transmittance`) then an ADD pass (`dst += in-scatter`). One alpha channel cannot
 * attenuate three wavelengths, and the collapsed-to-luminance alpha it replaces
 * washed the disc cyan under a λ⁻⁴ Rayleigh ramp — see `shell/fragment.wesl`.
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { AtmosphereShellDepth } from '../../../../@types/rendering/AtmosphereShellDepth';
import type { AtmosphereShellRenderer } from '../../../../@types/rendering/AtmosphereShellRenderer';
import type { AtmosphereParams } from '../../../../@types/scene/AtmosphereParams';
import { uvSphereMesh } from '../../../../utils/math/uvSphereMesh';
import { ATMOSPHERE_UNIFORM_FLOATS } from '../../../../utils/gpu/packAtmosphereUniforms';
import {
  packScatteringParams,
  SCATTERING_PARAMS_BYTES,
} from '../../../../utils/gpu/packScatteringParams';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { createAerialPerspectiveRenderer } from './aerialPerspectiveRenderer';
import transmittanceCode from '../../shaders/atmosphere/transmittanceLut.wesl?static';
import multiScatterCode from '../../shaders/atmosphere/multiScatterLut.wesl?static';
import skyViewCode from '../../shaders/atmosphere/skyViewLut.wesl?static';
import shellVsCode from '../../shaders/atmosphere/shell/vertex.wesl?static';
import shellFsCode from '../../shaders/atmosphere/shell/fragment.wesl?static';

/** Proxy-sphere tessellation — 128×64. This shell's SILHOUETTE bounds the visible
 *  limb band: only the atmosphere-top proxy's far wall rasterises, and its outer
 *  edge is the sphere silhouette, which a coarse UV sphere polygonises INWARD. A
 *  facet's silhouette chord sags to ~cos(π/SEGMENTS) of the atmosphere-top radius,
 *  clipping that fraction off the limb. Sized off the THINNEST band in the table —
 *  Earth's, ~1.4% of the planet radius (Pluto's 21% is far more forgiving) — so at
 *  48×24 the ~0.0021 silhouette sag eats ~15% of
 *  the band and scallops its outer edge into a visible polygon. At 128×64 the sag is
 *  ~cos(π/128) ≈ 0.9997 (≈ 0.03% of radius, ~2% of the band) — a smooth limb. The
 *  glow being low-frequency does NOT excuse the coarse mesh: coarseness is invisible
 *  across the interior but reads sharply at the silhouette, which is where this proxy
 *  does its work. */
const SEGMENTS = 128;
const RINGS = 64;

/** LUT dimensions — the SINGLE home for each table's size. The E4 bake modules no
 *  longer restate these: each derives its bounds guard + uv divisor from
 *  `textureDimensions(outTex)`, so this `createTexture` size drives both the
 *  allocation + dispatch here AND the shader parametrisation. */
const TRANSMITTANCE_LUT_SIZE: readonly [number, number] = [256, 64];
const MULTI_SCATTER_LUT_SIZE: readonly [number, number] = [32, 32];
const SKY_VIEW_LUT_SIZE: readonly [number, number] = [192, 108];

/** Every bake dispatches an 8×8 workgroup grid (matches `@workgroup_size(8,8)`). */
const WORKGROUP_SIZE = 8;

/** HDR in-scatter values exceed 1.0, so the LUTs cannot be an 8-bit format. */
const LUT_FORMAT: GPUTextureFormat = 'rgba16float';

/** `SkyViewParams` — 16 bytes / 4 f32 (see `skyViewLut.wesl`). */
const SKY_VIEW_PARAMS_BYTES = 16;
/** `AtmosphereUniforms` byte size — derived from the packer's f32 count (single
 *  source of truth), not restated as a literal. */
const ATMOSPHERE_UNIFORM_BYTES = ATMOSPHERE_UNIFORM_FLOATS * 4;

/**
 * Byte offsets of the shell fragment's `ShellDepthFrame` (binding 6): the
 * sampled row's inverse MVP, its camera, the viewport the fragment divides its
 * pixel by, and km→local for this body. The ONE TS home for them, pinned
 * against that struct by `atmosphereShellDepth.parity.test.ts` — a silent drift
 * writes the camera where the shader reads the viewport, and every ray is
 * classified against garbage. `camPosKm` (vec3) ends at 76 and the following
 * vec2 aligns to 8, so 80; the struct rounds up to its 16-byte alignment.
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

/** One atmosphere body's private GPU resources: its three LUT textures, its three
 *  uniform buffers, and the four bind groups wiring them to the SHARED pipelines.
 *  The bind groups reference the shared sampler + layouts but this body's own
 *  textures/buffers, so no per-frame write to one body's buffers can clobber
 *  another's. */
type AtmosphereBundle = {
  transmittanceTex: GPUTexture;
  multiScatterTex: GPUTexture;
  skyViewTex: GPUTexture;
  /** The host body's ring-alpha strip — `null` while the body binds the shared
   *  1×1 transparent placeholder (every ringless body, and Saturn until its
   *  strip bitmap commits via `setRingTexture`). */
  ringTexture: GPUTexture | null;
  scatteringBuffer: GPUBuffer;
  skyViewParamsBuffer: GPUBuffer;
  shellUniformBuffer: GPUBuffer;
  /** This body's own `ShellDepthFrame` — per-body for the `writeBuffer`
   *  ordering reason the module header gives, since km→local differs per row. */
  depthFrameBuffer: GPUBuffer;
  transmittanceBindGroup: GPUBindGroup;
  multiScatterBindGroup: GPUBindGroup;
  skyViewBindGroup: GPUBindGroup;
  /** Built at the first draw and dropped to `null` by anything that
   *  invalidates it, because it binds a depth view only the draw knows. */
  shellBindGroup: GPUBindGroup | null;
  /** The depth view `shellBindGroup` was built over — identity, not size, is
   *  the key: it is the only thing that always changes on a reallocation. */
  shellDepthView: GPUTextureView | null;
};

export function createAtmosphereShellRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat, // 'rgba16float' (foreground:0)
  paramsById: Readonly<Record<string, AtmosphereParams>>, // one bundle per row (Earth, six planets, Pluto)
): AtmosphereShellRenderer {
  // ── Sampler: linear + clamp-to-edge both axes (SHARED across bodies) ────────
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

  // ── Proxy sphere geometry (positions only — the vertex reads @location(0)) ──
  //
  // `composeBodyMvp` scales this unit sphere to the atmosphere-top radius, so the
  // atmosphere top is the UNIT sphere in the mesh's local frame. The mesh also
  // emits uvs; the shell samples no surface texture, so only positions upload.
  // Shared: the geometry is body-agnostic — bodies differ only in LUT contents +
  // per-frame uniforms.
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

  // ── Shader modules (SHARED) ────────────────────────────────────────────────
  // `createShaderModuleWithDevLog` is what surfaces a missing symbol, a
  // binding-type mismatch or an iOS storage-texture rejection as a real message.
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

  // ── Transmittance bake pipeline (SHARED) ───────────────────────────────────
  // group 0: [0] ScatteringParams uniform, [1] storage tex (write). Layouts are
  // explicit everywhere, never `'auto'`, and mirror each module's `@group(0)`
  // exactly — a mismatch is a silent mis-index the GPU never reports.
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

  // ── Multi-scatter bake pipeline (SHARED) ───────────────────────────────────
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

  // ── Sky-view bake pipeline (SHARED, dispatched per frame) ──────────────────
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

  // ── Shell render pipeline (SHARED) ─────────────────────────────────────────
  // group 0: [0] AtmosphereUniforms (VERTEX+FRAGMENT), [1] sampler,
  //          [2] skyView tex, [3] transmittance tex, [4] ring-alpha strip
  //          (1×1 transparent placeholder on every ringless body),
  //          [5] sampled scene depth, [6] the frame that unprojects it.
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

  // Shared 1×1 TRANSPARENT ring placeholder — bound at binding 4 for every body
  // whose ring strip has not committed (all ringless bodies, forever). Binding a
  // real texture on all bodies keeps ONE bind-group layout for the whole set; the
  // fragment's 'ringOuterRatio == 0' data-gate means the placeholder is never
  // sampled (the 'texturedBodyRenderer' binding-3 pattern).
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

  // The shell is drawn TWICE per body over one shared pipeline layout, geometry,
  // bind group and primitive state — only the fragment entry point and the blend
  // differ. Everything except those two is built here ONCE so the pair can never
  // diverge: any drift in cull mode or the `front_facing` wall split would make
  // the two passes cover different pixels, which double-counts the limb or drops
  // it (`fragment.wesl`'s wall-duty split).
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
    // Draw BOTH walls (no cull): the fragment splits duty by front_facing — the
    // NEAR (front) wall carries the finite-depth pixels (the over-disc aerial
    // perspective and the terrain at the limb), the FAR (back) wall the rest.
    frontFace: 'ccw',
    cullMode: 'none',
  };

  // NO depthStencil: the shell's step SAMPLES `foreground:0`'s depth rather than
  // attaching it, and a pipeline declaring a depth format is rejected by a pass
  // that has none. Occlusion moved into the fragment with the classification:
  // a sampled depth nearer than the shell entry drops the fragment.
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

  // Pass 1 — MULTIPLY. `dstFactor: 'src'` is a plain (non-dual-source) blend
  // factor taking the source's OWN component, so `out = 0*src + src*dst` is a
  // per-channel `dst *= transmittance`. This is the whole point of the split: one
  // alpha channel cannot attenuate three wavelengths differently, and a
  // luminance-collapsed alpha let a λ⁻⁴ Rayleigh ramp add blue to the disc
  // without removing blue from it (cyan wash).
  //
  const multiplyBlend: GPUBlendState = {
    color: { srcFactor: 'zero', dstFactor: 'src', operation: 'add' },
    alpha: { srcFactor: 'zero', dstFactor: 'src', operation: 'add' },
  };
  const shellMultiplyPipeline = createShellPipeline(
    'atmosphere-shell-multiply-pipeline',
    'fsMultiply',
    multiplyBlend,
  );

  // Pass 2 — ADD. Straight accumulation of the exposed in-scatter. Its alpha
  // contribution is the coverage complement, so the two passes together leave the
  // target alpha at the value the single OVER draw produced (the compositor reads
  // `foreground:0` as STRAIGHT alpha — it is the background weight, not decoration).
  const addBlend: GPUBlendState = {
    color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  };
  const shellAddPipeline = createShellPipeline('atmosphere-shell-add-pipeline', 'fsAdd', addBlend);

  // ── Per-body bundles ───────────────────────────────────────────────────────
  //
  // For each atmosphere body: its three LUT textures (rgba16float, STORAGE +
  // TEXTURE binding — STORAGE lets the bake compute pass write via `textureStore`,
  // TEXTURE lets downstream passes + the shell fragment SAMPLE), its three uniform
  // buffers (ScatteringParams written once from the body's params; SkyViewParams
  // rewritten per frame; AtmosphereUniforms per outside draw, per inside bake),
  // and the four bind
  // groups wiring those to the shared pipelines. Built here, stored by id.
  const bundles = new Map<string, AtmosphereBundle>();

  /** The sky-view LUT size actually built right now, distinct from the
   *  construction-time default above — `reconcile` (tier-switchable size,
   *  see `skyViewLutSizeByTier.ts`) rewrites this, and `dispatchSkyView`'s
   *  dispatch grid tracks it so a shrunk texture is not still dispatched at
   *  the old, larger workgroup count. */
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

    // ScatteringParams: written once (the baked constants never change).
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

  /** (Re)build a body's sky-view bind group. Split out (mirrors
   *  `buildShellBindGroup` below) so `reconcile` can rebind binding 5 to a
   *  resized `skyViewTex` without re-deriving the other four entries. */
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

  /** (Re)build a body's shell bind group over the depth view the current draw
   *  hands in. `ringTexture: null` binds the shared transparent placeholder
   *  (the `texturedBodyRenderer` `buildBindGroup` pattern). */
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

  // ── Startup bake: transmittance THEN multi-scatter, per body, ONE encoder ──
  //
  // Every body's two view-independent LUTs bake here into a SINGLE construction-
  // time encoder + one submit. Per body, the multi-scatter pass samples that
  // body's transmittance LUT, and the compute-pass boundary is the barrier WebGPU
  // inserts between the two passes — so the ordering holds with no out-of-band
  // submit (the two-pass encoder lesson `flowFieldRenderer` documents). The loop
  // repeats the pair per body inside the same encoder; do NOT submit per body. The
  // sky-view LUT is NOT baked here — it depends on the per-frame camera + sun state
  // (`dispatchSkyView`).
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

  // The inside-the-shell half, over the SAME bundles: one atmosphere, two
  // consumers. Built after the bundle loop so every body's resources exist.
  const placeholderRingView = placeholderRing.createView();
  const aerial = createAerialPerspectiveRenderer(
    device,
    targetFormat,
    sampler,
    placeholderRingView,
    bundles,
  );

  /** Look up a body's bundle. An unknown id is a programming error: callers only
   *  ever pass `atmosphereDrawList` ids, which come from the same `paramsById`
   *  table this renderer bundles — so a miss means the two drifted. */
  function bundleFor(bodyId: string): AtmosphereBundle {
    const bundle = bundles.get(bodyId);
    if (bundle === undefined) {
      throw new Error(`atmosphereShellRenderer: unknown body id '${bodyId}'`);
    }
    return bundle;
  }

  // ── dispatchSkyView (per frame) ────────────────────────────────────────────

  function dispatchSkyView(
    pass: GPUComputePassEncoder,
    bodyId: string,
    skyViewUniforms: Float32Array,
  ): void {
    // Write THIS body's per-frame camera + sun state, then dispatch the sky-view
    // bake into the CALLER's pass. Each body owns its own params buffer and its
    // own output LUT, so several bodies share one pass with no hazard between
    // them — and the caller keeps the pass, hence the step's one timing slot.
    // The write rides the queue timeline (ordered ahead of the submit) even
    // though the pass is already open — no writeBuffer/submit race, as for flow.
    const bundle = bundleFor(bodyId);
    device.queue.writeBuffer(bundle.skyViewParamsBuffer, 0, skyViewUniforms);
    pass.setPipeline(skyViewPipeline);
    pass.setBindGroup(0, bundle.skyViewBindGroup);
    pass.dispatchWorkgroups(
      dispatchCount(currentSkyViewLutSize[0]),
      dispatchCount(currentSkyViewLutSize[1]),
    );
  }

  // ── reconcile (per frame) ──────────────────────────────────────────────────

  function reconcile(config: { readonly skyViewLutSize: readonly [number, number] }): void {
    const [width, height] = config.skyViewLutSize;
    // The common case, every frame: same tier as last frame, nothing to do.
    if (width === currentSkyViewLutSize[0] && height === currentSkyViewLutSize[1]) return;
    currentSkyViewLutSize = config.skyViewLutSize;
    for (const [bodyId, bundle] of bundles) {
      bundle.skyViewTex.destroy();
      bundle.skyViewTex = createLut(`atmosphere-skyview-lut-${bodyId}`, currentSkyViewLutSize);
      // Both bind groups that reference the texture must be rebuilt — a
      // GPUBindGroup binds a specific GPUTextureView, not the JS variable, so
      // it keeps pointing at the destroyed texture until replaced. The shell's
      // is only dropped: it also binds a depth view none of the resize path
      // knows, so its rebuild waits for the next draw.
      bundle.skyViewBindGroup = buildSkyViewBindGroup(bodyId, bundle);
      bundle.shellBindGroup = null;
      aerial.rebind(bodyId, bundle);
    }
  }

  // ── setRingTexture ─────────────────────────────────────────────────────────

  function setRingTexture(bodyId: string, bitmap: ImageBitmap): void {
    // A ring host without an atmosphere row has no bundle — nothing to occlude,
    // so a miss is a graceful no-op (unlike `bundleFor`'s draw-path throw: the
    // ring→atmosphere link is optional by data, not an invariant).
    const bundle = bundles.get(bodyId);
    if (bundle === undefined) return;
    bundle.ringTexture?.destroy();
    const texture = device.createTexture({
      label: `atmosphere-ring-${bodyId}`,
      size: [bitmap.width, bitmap.height, 1],
      format: 'rgba8unorm-srgb',
      // RENDER_ATTACHMENT is required by copyExternalImageToTexture even though
      // we never render INTO the strip — Dawn rejects the upload without it.
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

  // ── draw ───────────────────────────────────────────────────────────────────

  // One scratch for every body: `writeBuffer` copies at call time, so nothing
  // outlives the draw that filled it — it is the GPU buffers that must be
  // per-body, not this.
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
    // Write THIS body's own shell uniform buffer immediately before its draw — no
    // shared buffer for a later body's write to race (see the module header).
    const bundle = bundleFor(bodyId);
    device.queue.writeBuffer(bundle.shellUniformBuffer, 0, uniforms);
    // A null frame always arrives with the far-cleared placeholder view, so
    // the fragment's FAR_DEPTH arm never reads invMvp/camPosKm — skip them.
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
    // MULTIPLY strictly BEFORE ADD: the multiply pass scales whatever is already
    // in the target, so running it second would attenuate this body's own
    // in-scatter by its own transmittance.
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

  // ── destroy ────────────────────────────────────────────────────────────────

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
