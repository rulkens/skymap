/**
 * aerialPerspectiveRenderer — the froxel volume bake (`froxelLut.wesl`) and its
 * depth-keyed apply (`aerialPerspective/fragment.wesl`), the whole
 * inside-the-atmosphere path. Built by `atmosphereShellRenderer` over the
 * bundles it already owns, so the volume reads the same `ScatteringParams`,
 * twilight knobs and startup LUTs the shell does — one atmosphere, two
 * consumers. Design rationale (why a volume at all, why ONE pair of textures)
 * lives on the `AerialPerspectiveRenderer` type.
 */

import type { AerialPerspectiveRenderer } from '../../../../@types/rendering/AerialPerspectiveRenderer';
import { ATMOSPHERE_UNIFORM_FLOATS } from '../../../../utils/gpu/packAtmosphereUniforms';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import froxelCode from '../../shaders/atmosphere/froxelLut.wesl?static';
import applyCode from '../../shaders/atmosphere/aerialPerspective/fragment.wesl?static';

/** Froxel volume edge, all three axes: 32³ × 2 textures × 8 bytes ≈ 512 KiB. */
const FROXEL_SIZE = 32;
/** Matches `froxelLut.wesl`'s `@workgroup_size(8, 8)` over (x, y); z is the shader's loop. */
const WORKGROUP_SIZE = 8;
/** HDR in-scatter exceeds 1.0, so the volume cannot be an 8-bit format. */
const FROXEL_FORMAT: GPUTextureFormat = 'rgba16float';

/** The GPU resources the bake borrows from each `atmosphereShellRenderer` bundle. */
type AtmosphereBundleResources = {
  readonly scatteringBuffer: GPUBuffer;
  readonly skyViewParamsBuffer: GPUBuffer;
  readonly shellUniformBuffer: GPUBuffer;
  readonly transmittanceTex: GPUTexture;
  readonly multiScatterTex: GPUTexture;
  readonly skyViewTex: GPUTexture;
};

/** `vertexModule` is the shell's `shell/vertex.wesl` module, for its `insideVs`
 *  covering triangle — a pipeline may take its two stages from different
 *  modules, and this one needs no vertex stage of its own. */
export function createAerialPerspectiveRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  sampler: GPUSampler,
  placeholderRingView: GPUTextureView,
  vertexModule: GPUShaderModule,
  bodies: ReadonlyMap<string, AtmosphereBundleResources>,
): AerialPerspectiveRenderer {
  // ONE pair for the whole renderer: only one body can be inside at a time.
  function createVolume(label: string): GPUTexture {
    return device.createTexture({
      label,
      dimension: '3d',
      size: [FROXEL_SIZE, FROXEL_SIZE, FROXEL_SIZE],
      format: FROXEL_FORMAT,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
  }
  const inScatterTex = createVolume('atmosphere-froxel-inscatter');
  const transmittanceTex = createVolume('atmosphere-froxel-transmittance');
  const inScatterView = inScatterTex.createView();
  const transmittanceView = transmittanceTex.createView();

  const froxelModule = createShaderModuleWithDevLog(device, froxelCode, 'atmosphere.froxelLut');

  // Mirrors `froxelLut.wesl`'s `@group(0)` exactly. Explicit, never
  // `layout: 'auto'` — auto-derived layouts are pipeline-specific even when the
  // bindings match. `viewDimension: '3d'` is NOT optional: it defaults to '2d'
  // and the bind group would be rejected against a 3D view.
  const froxelBgl = device.createBindGroupLayout({
    label: 'atmosphere-froxel-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      { binding: 2, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.COMPUTE, texture: { sampleType: 'float' } },
      { binding: 4, visibility: GPUShaderStage.COMPUTE, sampler: { type: 'filtering' } },
      { binding: 5, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'uniform' } },
      {
        binding: 6,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { access: 'write-only', format: FROXEL_FORMAT, viewDimension: '3d' },
      },
      {
        binding: 7,
        visibility: GPUShaderStage.COMPUTE,
        storageTexture: { access: 'write-only', format: FROXEL_FORMAT, viewDimension: '3d' },
      },
    ],
  });
  const froxelPipeline = device.createComputePipeline({
    label: 'atmosphere-froxel-pipeline',
    layout: device.createPipelineLayout({
      label: 'atmosphere-froxel-pipeline-layout',
      bindGroupLayouts: [froxelBgl],
    }),
    compute: { module: froxelModule, entryPoint: 'cs' },
  });

  const applyModule = createShaderModuleWithDevLog(
    device,
    applyCode,
    'atmosphere.aerialPerspective.fragment',
  );

  // Mirrors `aerialPerspective/fragment.wesl`'s `@group(0)`: bindings 0-4 are
  // the shell fragment's, imported by that module rather than redeclared, so
  // this layout is the shell's five plus the froxel volumes and scene depth.
  // Binding 0 is FRAGMENT-only here — `insideVs` reads no uniform, so the
  // vertex stage has no resource interface at all.
  const applyBgl = device.createBindGroupLayout({
    label: 'atmosphere-aerial-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      {
        binding: 5,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '3d' },
      },
      {
        binding: 6,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '3d' },
      },
      { binding: 7, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
    ],
  });
  const applyPipelineLayout = device.createPipelineLayout({
    label: 'atmosphere-aerial-pipeline-layout',
    bindGroupLayouts: [applyBgl],
  });

  // No `depthStencil` state: the step declares `depth: 'sample'` and opens the
  // pass with NO depth attachment (WebGPU forbids sampling a view attached to
  // the same pass), and a pipeline carrying a depth state is invalid against an
  // attachment-less pass. The scene depth this path needs arrives at binding 7.
  function createApplyPipeline(
    label: string,
    entryPoint: string,
    blend: GPUBlendState,
  ): GPURenderPipeline {
    return device.createRenderPipeline({
      label,
      layout: applyPipelineLayout,
      vertex: { module: vertexModule, entryPoint: 'insideVs' },
      fragment: { module: applyModule, entryPoint, targets: [{ format: targetFormat, blend }] },
      primitive: { topology: 'triangle-list' },
    });
  }

  // The shell's two blends, by the same argument: one alpha channel cannot
  // attenuate three wavelengths, so extinction rides a MULTIPLY draw
  // (`dstFactor: 'src'` takes the source's own component, i.e. `dst *= src`)
  // and the in-scatter an ADD draw over the same pixels.
  const applyMultiplyPipeline = createApplyPipeline(
    'atmosphere-aerial-multiply-pipeline',
    'fsAerialMultiply',
    {
      color: { srcFactor: 'zero', dstFactor: 'src', operation: 'add' },
      alpha: { srcFactor: 'zero', dstFactor: 'src', operation: 'add' },
    },
  );
  const applyAddPipeline = createApplyPipeline('atmosphere-aerial-add-pipeline', 'fsAerialAdd', {
    color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  });

  // Per body: its OWN bake uniform buffer, separate from the shell's. Two
  // consumers of one record are still two writes in one frame, and a shared
  // buffer between a `writeBuffer` and a `submit` is the ordering trap. The
  // apply instead binds the SHELL's buffer at binding 0 (it is the shell's
  // binding), writing it immediately before its own draws.
  type BodyBinding = {
    readonly uniformBuffer: GPUBuffer;
    readonly bakeGroup: GPUBindGroup;
    readonly shellUniformBuffer: GPUBuffer;
    /** Bindings 0-6 of the apply group; only binding 7, the depth view, varies. */
    readonly applyEntries: readonly GPUBindGroupEntry[];
    /** Last built apply group, keyed on the depth view it was built over. */
    applyGroup: { readonly depthView: GPUTextureView; readonly group: GPUBindGroup } | null;
  };
  const perBody = new Map<string, BodyBinding>();

  for (const [bodyId, bundle] of bodies) {
    const uniformBuffer = device.createBuffer({
      label: `atmosphere-froxel-uniform-${bodyId}`,
      size: ATMOSPHERE_UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    perBody.set(bodyId, {
      uniformBuffer,
      shellUniformBuffer: bundle.shellUniformBuffer,
      bakeGroup: device.createBindGroup({
        label: `atmosphere-froxel-bg-${bodyId}`,
        layout: froxelBgl,
        entries: [
          { binding: 0, resource: { buffer: bundle.scatteringBuffer } },
          { binding: 1, resource: { buffer: bundle.skyViewParamsBuffer } },
          { binding: 2, resource: bundle.transmittanceTex.createView() },
          { binding: 3, resource: bundle.multiScatterTex.createView() },
          { binding: 4, resource: sampler },
          { binding: 5, resource: { buffer: uniformBuffer } },
          { binding: 6, resource: inScatterView },
          { binding: 7, resource: transmittanceView },
        ],
      }),
      applyEntries: [
        { binding: 0, resource: { buffer: bundle.shellUniformBuffer } },
        { binding: 1, resource: sampler },
        { binding: 2, resource: bundle.skyViewTex.createView() },
        { binding: 3, resource: bundle.transmittanceTex.createView() },
        // ALWAYS the placeholder strip, never the body's real ring: inside the
        // shell `tNear` is 0, so `sampleShellRay`'s ring-in-front branch
        // (`tRing > 0 && tRing < tNear`) is unreachable. That is what lets this
        // group be keyed on the depth view alone.
        { binding: 4, resource: placeholderRingView },
        { binding: 5, resource: inScatterView },
        { binding: 6, resource: transmittanceView },
      ],
      applyGroup: null,
    });
  }

  const dispatchXY = Math.ceil(FROXEL_SIZE / WORKGROUP_SIZE);

  function bindingFor(bodyId: string): BodyBinding {
    const binding = perBody.get(bodyId);
    if (binding === undefined) {
      throw new Error(`aerialPerspectiveRenderer: unknown body id '${bodyId}'`);
    }
    return binding;
  }

  function encodeFroxel(encoder: GPUCommandEncoder, bodyId: string, uniforms: Float32Array): void {
    const binding = bindingFor(bodyId);
    device.queue.writeBuffer(binding.uniformBuffer, 0, uniforms);
    const pass = encoder.beginComputePass({ label: 'atmosphere-froxel-pass' });
    pass.setPipeline(froxelPipeline);
    pass.setBindGroup(0, binding.bakeGroup);
    pass.dispatchWorkgroups(dispatchXY, dispatchXY, 1);
    pass.end();
  }

  function draw(
    pass: GPURenderPassEncoder,
    bodyId: string,
    uniforms: Float32Array,
    depthView: GPUTextureView,
  ): void {
    const binding = bindingFor(bodyId);
    device.queue.writeBuffer(binding.shellUniformBuffer, 0, uniforms);

    // `depthViewOf('foreground:0')` hands back a NEW view once `reconcile`
    // reallocates the row, and a bind group over the destroyed texture is a
    // validation error — on iOS a silently dropped frame. Identity, not size,
    // is the key: it is the only thing that always changes on a reallocation.
    if (binding.applyGroup === null || binding.applyGroup.depthView !== depthView) {
      binding.applyGroup = {
        depthView,
        group: device.createBindGroup({
          label: `atmosphere-aerial-bg-${bodyId}`,
          layout: applyBgl,
          entries: [...binding.applyEntries, { binding: 7, resource: depthView }],
        }),
      };
    }
    pass.setBindGroup(0, binding.applyGroup.group);

    // MULTIPLY strictly before ADD: the multiply draw scales whatever is
    // already in the target, so running it second would attenuate this pass's
    // own in-scatter by its own transmittance.
    pass.setPipeline(applyMultiplyPipeline);
    pass.draw(3);
    pass.setPipeline(applyAddPipeline);
    pass.draw(3);
  }

  function destroy(): void {
    for (const binding of perBody.values()) binding.uniformBuffer.destroy();
    perBody.clear();
    inScatterTex.destroy();
    transmittanceTex.destroy();
  }

  const renderer: AerialPerspectiveRenderer = {
    label: 'aerialPerspectiveRenderer',
    encodeFroxel,
    draw,
    destroy,
  };
  return renderer;
}
