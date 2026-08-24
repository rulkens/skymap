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
import type { AtmosphereShellRenderer } from '../../../../@types/rendering/AtmosphereShellRenderer';
import type { AtmosphereParams } from '../../../../@types/scene/AtmosphereParams';
import { uvSphereMesh } from '../../../../utils/math/uvSphereMesh';
import { ATMOSPHERE_UNIFORM_FLOATS } from '../../../../utils/gpu/packAtmosphereUniforms';
import { resolveDepthCompare } from '../../../../utils/gpu/resolveDepthCompare';
import {
  packScatteringParams,
  SCATTERING_PARAMS_BYTES,
} from '../../../../utils/gpu/packScatteringParams';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
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
  transmittanceBindGroup: GPUBindGroup;
  multiScatterBindGroup: GPUBindGroup;
  skyViewBindGroup: GPUBindGroup;
  shellBindGroup: GPUBindGroup;
};

/**
 * @param reversedZ selects this slab's depth convention (single-sourced in
 *   `SLAB_REVERSED_Z`): `false` ⇒ smaller-z-wins
 *   (`depthCompare: 'less-equal'`), `true` ⇒ reversed-Z greater-wins. The shell
 *   wants the nearer-OR-tied fragment (`'nearer-or-equal'`) so it can draw over
 *   the coplanar body surface it shares a radius with; `resolveDepthCompare`
 *   resolves that intent against the convention.
 */
export function createAtmosphereShellRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat, // 'rgba16float' (foreground:0)
  depthFormat: GPUTextureFormat, // 'depth32float' (foreground:0)
  reversedZ: boolean,
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
  //          (1×1 transparent placeholder on every ringless body).
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
  // bind group and depth/primitive state — only the fragment entry point and the
  // blend differ. Everything except those two is built here ONCE so the pair can
  // never diverge: any drift in depth compare, cull mode or the `front_facing`
  // wall split would make the two passes cover different pixels, which
  // double-counts the limb or drops it (`fragment.wesl`'s wall-duty split).
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
    // NEAR (front) wall carries the over-disc aerial perspective, the FAR (back)
    // wall carries the limb + sky. Depth-testing each wall against the opaque
    // scene keeps cross-body occlusion for both (disc haze via the near wall's
    // depth, the limb via the far wall's).
    frontFace: 'ccw',
    cullMode: 'none',
  };
  const shellDepthState: GPUDepthStencilState = {
    format: depthFormat,
    // Depth-TESTED against the opaque planet (reversed-Z 'greater-equal') but
    // writes NO depth — a translucent overlay must not stamp z, and the ADD pass
    // must see exactly the depth the MULTIPLY pass tested against.
    depthWriteEnabled: false,
    depthCompare: resolveDepthCompare('nearer-or-equal', reversedZ),
  };

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
      depthStencil: shellDepthState,
    });
  }

  // Inside-shell state (camera inside the atmosphere top): a full-screen
  // triangle, no vertex buffer, and an always-pass depth test — there is no
  // scene depth to test against from inside (spec §4.4). NOT routed through
  // `resolveDepthCompare`: that helper resolves a reversed-Z-dependent INTENT,
  // and 'always' has no such intent to resolve.
  const insideVertexState: GPUVertexState = { module: shellVsModule, entryPoint: 'insideVs' };
  const insidePrimitiveState: GPUPrimitiveState = { topology: 'triangle-list' };
  const insideDepthState: GPUDepthStencilState = {
    format: depthFormat,
    depthWriteEnabled: false,
    depthCompare: 'always',
  };

  function createInsideShellPipeline(
    label: string,
    entryPoint: string,
    blend: GPUBlendState,
  ): GPURenderPipeline {
    return device.createRenderPipeline({
      label,
      layout: shellPipelineLayout,
      vertex: insideVertexState,
      fragment: { module: shellFsModule, entryPoint, targets: [{ format: targetFormat, blend }] },
      primitive: insidePrimitiveState,
      depthStencil: insideDepthState,
    });
  }

  // Pass 1 — MULTIPLY. `dstFactor: 'src'` is a plain (non-dual-source) blend
  // factor taking the source's OWN component, so `out = 0*src + src*dst` is a
  // per-channel `dst *= transmittance`. This is the whole point of the split: one
  // alpha channel cannot attenuate three wavelengths differently, and a
  // luminance-collapsed alpha let a λ⁻⁴ Rayleigh ramp add blue to the disc
  // without removing blue from it (cyan wash).
  //
  // Hoisted (not inlined) so the inside pair below shares the SAME blend object —
  // multiply/add semantics do not change between the outside proxy-mesh draw and
  // the inside full-screen draw, only the vertex/depth state does.
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

  // Inside pair — SAME blend objects as the outside pair (see above).
  const shellInsideMultiplyPipeline = createInsideShellPipeline(
    'atmosphere-shell-inside-multiply-pipeline',
    'fsInsideMultiply',
    multiplyBlend,
  );
  const shellInsideAddPipeline = createInsideShellPipeline(
    'atmosphere-shell-inside-add-pipeline',
    'fsInsideAdd',
    addBlend,
  );

  // ── Per-body bundles ───────────────────────────────────────────────────────
  //
  // For each atmosphere body: its three LUT textures (rgba16float, STORAGE +
  // TEXTURE binding — STORAGE lets the bake compute pass write via `textureStore`,
  // TEXTURE lets downstream passes + the shell fragment SAMPLE), its three uniform
  // buffers (ScatteringParams written once from the body's params; SkyViewParams
  // rewritten per frame; AtmosphereUniforms rewritten per draw), and the four bind
  // groups wiring those to the shared pipelines. Built here, stored by id.
  const bundles = new Map<string, AtmosphereBundle>();

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
    const skyViewView = skyViewTex.createView();

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

    const skyViewBindGroup = device.createBindGroup({
      label: `atmosphere-skyview-bg-${bodyId}`,
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

    const shellBindGroup = buildShellBindGroup(bodyId, {
      shellUniformBuffer,
      skyViewTex,
      transmittanceTex,
      ringTexture: null,
    });

    return {
      transmittanceTex,
      multiScatterTex,
      skyViewTex,
      ringTexture: null,
      scatteringBuffer,
      skyViewParamsBuffer,
      shellUniformBuffer,
      transmittanceBindGroup,
      multiScatterBindGroup,
      skyViewBindGroup,
      shellBindGroup,
    };
  }

  /** (Re)build a body's shell bind group. Split out so `setRingTexture` can swap
   *  the binding-4 strip in without re-deriving the rest — `ringTexture: null`
   *  binds the shared transparent placeholder (the `texturedBodyRenderer`
   *  `buildBindGroup` pattern). */
  function buildShellBindGroup(
    bodyId: string,
    res: Pick<AtmosphereBundle, 'shellUniformBuffer' | 'skyViewTex' | 'transmittanceTex'> & {
      ringTexture: GPUTexture | null;
    },
  ): GPUBindGroup {
    return device.createBindGroup({
      label: `atmosphere-shell-bg-${bodyId}`,
      layout: shellBgl,
      entries: [
        { binding: 0, resource: { buffer: res.shellUniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: res.skyViewTex.createView() },
        { binding: 3, resource: res.transmittanceTex.createView() },
        { binding: 4, resource: (res.ringTexture ?? placeholderRing).createView() },
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
  // (`encodeSkyView`).
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

  // ── encodeSkyView (per frame) ──────────────────────────────────────────────

  function encodeSkyView(
    encoder: GPUCommandEncoder,
    bodyId: string,
    skyViewUniforms: Float32Array,
  ): void {
    // Write THIS body's per-frame camera + sun state, then dispatch the sky-view
    // bake into `encoder` (the same frame encoder, submitted downstream). One write
    // + one dispatch per body → no writeBuffer/submit race (the flow precedent).
    const bundle = bundleFor(bodyId);
    device.queue.writeBuffer(bundle.skyViewParamsBuffer, 0, skyViewUniforms);
    const pass = encoder.beginComputePass({ label: 'atmosphere-skyview-pass' });
    pass.setPipeline(skyViewPipeline);
    pass.setBindGroup(0, bundle.skyViewBindGroup);
    pass.dispatchWorkgroups(
      dispatchCount(SKY_VIEW_LUT_SIZE[0]),
      dispatchCount(SKY_VIEW_LUT_SIZE[1]),
    );
    pass.end();
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
    bundle.shellBindGroup = buildShellBindGroup(bodyId, bundle);
  }

  // ── draw ───────────────────────────────────────────────────────────────────

  function draw(
    pass: GPURenderPassEncoder,
    bodyId: string,
    uniforms: Float32Array,
    inside: boolean,
  ): void {
    // Write THIS body's own shell uniform buffer immediately before its draw — no
    // shared buffer for a later body's write to race (see the module header).
    const bundle = bundleFor(bodyId);
    device.queue.writeBuffer(bundle.shellUniformBuffer, 0, uniforms);
    pass.setBindGroup(0, bundle.shellBindGroup);
    // `inside` selects the full-screen no-scene-depth pipeline pair (camera past
    // the atmosphere top, no proxy-mesh silhouette to rasterise) over the
    // proxy-sphere pair. MULTIPLY strictly BEFORE ADD in both branches: the
    // multiply pass scales whatever is already in the target, so running it
    // second would attenuate this body's own in-scatter by its own transmittance.
    if (inside) {
      pass.setPipeline(shellInsideMultiplyPipeline);
      pass.draw(3);
      pass.setPipeline(shellInsideAddPipeline);
      pass.draw(3);
      return;
    }
    pass.setVertexBuffer(0, positionBuffer);
    pass.setIndexBuffer(indexBuffer, 'uint16');
    pass.setPipeline(shellMultiplyPipeline);
    pass.drawIndexed(indexCount);
    pass.setPipeline(shellAddPipeline);
    pass.drawIndexed(indexCount);
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
    }
    bundles.clear();
    placeholderRing.destroy();
    positionBuffer.destroy();
    indexBuffer.destroy();
  }

  const renderer: AtmosphereShellRenderer = {
    label: 'atmosphereShellRenderer',
    encodeSkyView,
    setRingTexture,
    draw,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
