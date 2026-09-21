/**
 * aerialPerspectiveRenderer — the camera-local froxel bake
 * (`aerialPerspective/bake.wesl`) and its depth-keyed apply
 * (`aerialPerspective/fragment.wesl`). Built by `atmosphereShellRenderer` over
 * the bundles it already owns, so the fog reads the same `ScatteringParams`,
 * twilight knobs and startup LUTs the shell does — one atmosphere, two consumers.
 */

import type { AerialBundleResources } from '../../../../@types/rendering/AerialBundleResources';
import type { AerialPerspectiveRenderer } from '../../../../@types/rendering/AerialPerspectiveRenderer';
import { FROXEL_DIMS } from '../../../../data/atmosphere/froxelVolume';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import bakeCode from '../../shaders/atmosphere/aerialPerspective/bake.wesl?static';
import applyCode from '../../shaders/atmosphere/aerialPerspective/fragment.wesl?static';

/** Matches `bake.wesl`'s `@workgroup_size(8, 8, 1)` over (x, y); z is its loop. */
const BAKE_WORKGROUP_SIZE = 8;

/** HDR in-scatter exceeds 1.0, so the volumes cannot be an 8-bit format. */
const FROXEL_FORMAT: GPUTextureFormat = 'rgba16float';

export function createAerialPerspectiveRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  sampler: GPUSampler,
  placeholderRingView: GPUTextureView,
  bodies: ReadonlyMap<string, AerialBundleResources>,
): AerialPerspectiveRenderer {
  // ONE pair for the whole renderer, not one per body: the volume is keyed on
  // the CAMERA's screen rays, and the camera is inside at most one atmosphere.
  function createVolume(label: string): GPUTexture {
    return device.createTexture({
      label,
      dimension: '3d',
      size: [FROXEL_DIMS.x, FROXEL_DIMS.y, FROXEL_DIMS.z],
      format: FROXEL_FORMAT,
      usage: GPUTextureUsage.STORAGE_BINDING | GPUTextureUsage.TEXTURE_BINDING,
    });
  }
  const froxelInScatterTex = createVolume('atmosphere-froxel-inscatter');
  const froxelTransmittanceTex = createVolume('atmosphere-froxel-transmittance');
  const froxelInScatterView = froxelInScatterTex.createView();
  const froxelTransmittanceView = froxelTransmittanceTex.createView();

  const bakeModule = createShaderModuleWithDevLog(
    device,
    bakeCode,
    'atmosphere.aerialPerspective.bake',
  );

  // Mirrors `bake.wesl`'s `@group(0)` exactly. Explicit, never `layout: 'auto'`
  // — auto-derived layouts are pipeline-specific even when the bindings match.
  // `viewDimension: '3d'` is NOT optional: it defaults to '2d' and the bind
  // group would be rejected against a 3D view.
  const bakeBgl = device.createBindGroupLayout({
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
  const bakePipeline = device.createComputePipeline({
    label: 'atmosphere-froxel-pipeline',
    layout: device.createPipelineLayout({
      label: 'atmosphere-froxel-pipeline-layout',
      bindGroupLayouts: [bakeBgl],
    }),
    compute: { module: bakeModule, entryPoint: 'cs' },
  });

  const applyModule = createShaderModuleWithDevLog(
    device,
    applyCode,
    'atmosphere.aerialPerspective.fragment',
  );

  // Mirrors the fragment's `@group(0)`: the shell's five (hoisted by importing
  // `sampleShellRay`) plus `ScatteringParams`, the two volumes and scene depth.
  // Binding 0 is FRAGMENT-only here — the covering triangle reads no uniform,
  // so the vertex stage has no resource interface at all.
  const applyBgl = device.createBindGroupLayout({
    label: 'atmosphere-aerial-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      {
        binding: 6,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '3d' },
      },
      {
        binding: 7,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '3d' },
      },
      { binding: 8, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'depth' } },
    ],
  });
  const applyPipelineLayout = device.createPipelineLayout({
    label: 'atmosphere-aerial-pipeline-layout',
    bindGroupLayouts: [applyBgl],
  });

  // No `depthStencil` state: the step declares `depth: 'sample'` and opens the
  // pass with NO depth attachment (WebGPU forbids sampling a view attached to
  // the same pass), and a pipeline carrying a depth state is invalid against an
  // attachment-less pass. Scene depth arrives at binding 8 instead.
  function createApplyPipeline(
    label: string,
    entryPoint: string,
    blend: GPUBlendState,
  ): GPURenderPipeline {
    return device.createRenderPipeline({
      label,
      layout: applyPipelineLayout,
      vertex: { module: applyModule, entryPoint: 'vs' },
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

  type BodyBinding = {
    readonly shellUniformBuffer: GPUBuffer;
    bakeGroup: GPUBindGroup;
    /** Bindings 0-7; only binding 8, the depth view, varies. */
    applyEntries: readonly GPUBindGroupEntry[];
    /** Last built apply group, keyed on the depth view it was built over. */
    applyGroup: { readonly depthView: GPUTextureView; readonly group: GPUBindGroup } | null;
  };
  const perBody = new Map<string, BodyBinding>();

  // Binding 5 is the SHELL's uniform buffer, the same record the apply binds at
  // binding 0: bake and apply must unproject identical rays or the volume is
  // sampled along a ray it was never marched down.
  function bakeGroupFor(bodyId: string, bundle: AerialBundleResources): GPUBindGroup {
    return device.createBindGroup({
      label: `atmosphere-froxel-bg-${bodyId}`,
      layout: bakeBgl,
      entries: [
        { binding: 0, resource: { buffer: bundle.scatteringBuffer } },
        { binding: 1, resource: { buffer: bundle.skyViewParamsBuffer } },
        { binding: 2, resource: bundle.transmittanceTex.createView() },
        { binding: 3, resource: bundle.multiScatterTex.createView() },
        { binding: 4, resource: sampler },
        { binding: 5, resource: { buffer: bundle.shellUniformBuffer } },
        { binding: 6, resource: froxelInScatterView },
        { binding: 7, resource: froxelTransmittanceView },
      ],
    });
  }

  function applyEntriesFor(bundle: AerialBundleResources): readonly GPUBindGroupEntry[] {
    return [
      { binding: 0, resource: { buffer: bundle.shellUniformBuffer } },
      { binding: 1, resource: sampler },
      { binding: 2, resource: bundle.skyViewTex.createView() },
      { binding: 3, resource: bundle.transmittanceTex.createView() },
      // ALWAYS the placeholder strip, never the body's real ring: inside the
      // shell `tNear` is 0, far short of any seeded ring's `tRing`, so
      // `sampleShellRay`'s ring-in-front branch (`tRing > 0 && tRing < tNear`)
      // is unreachable — which keeps this group keyed on the depth view alone.
      { binding: 4, resource: placeholderRingView },
      { binding: 5, resource: { buffer: bundle.scatteringBuffer } },
      { binding: 6, resource: froxelInScatterView },
      { binding: 7, resource: froxelTransmittanceView },
    ];
  }

  for (const [bodyId, bundle] of bodies) {
    perBody.set(bodyId, {
      shellUniformBuffer: bundle.shellUniformBuffer,
      bakeGroup: bakeGroupFor(bodyId, bundle),
      applyEntries: applyEntriesFor(bundle),
      applyGroup: null,
    });
  }

  const bakeDispatchX = Math.ceil(FROXEL_DIMS.x / BAKE_WORKGROUP_SIZE);
  const bakeDispatchY = Math.ceil(FROXEL_DIMS.y / BAKE_WORKGROUP_SIZE);

  function bindingFor(bodyId: string): BodyBinding {
    const binding = perBody.get(bodyId);
    if (binding === undefined) {
      throw new Error(`aerialPerspectiveRenderer: unknown body id '${bodyId}'`);
    }
    return binding;
  }

  // The shell's tier `reconcile` DESTROYS and recreates `skyViewTex`, and a
  // bind group holds the view, not the variable — so it must tell us too.
  function rebind(bodyId: string, bundle: AerialBundleResources): void {
    const binding = perBody.get(bodyId);
    if (binding === undefined) return;
    binding.bakeGroup = bakeGroupFor(bodyId, bundle);
    binding.applyEntries = applyEntriesFor(bundle);
    binding.applyGroup = null;
  }

  function bake(pass: GPUComputePassEncoder, bodyId: string, uniforms: Float32Array): void {
    // The write rides the queue timeline (ordered ahead of the submit) even
    // though the pass is already open — the `dispatchSkyView` argument.
    const binding = bindingFor(bodyId);
    device.queue.writeBuffer(binding.shellUniformBuffer, 0, uniforms);
    pass.setPipeline(bakePipeline);
    pass.setBindGroup(0, binding.bakeGroup);
    // z is the shader's own slice loop, so one invocation owns a whole column.
    pass.dispatchWorkgroups(bakeDispatchX, bakeDispatchY, 1);
  }

  function draw(pass: GPURenderPassEncoder, bodyId: string, depthView: GPUTextureView): void {
    const binding = bindingFor(bodyId);

    // Same bind-group-cache-by-view-identity pattern as orbitTrailRenderer.ts's
    // `bindGroup` local — see its comment for why.
    if (binding.applyGroup === null || binding.applyGroup.depthView !== depthView) {
      binding.applyGroup = {
        depthView,
        group: device.createBindGroup({
          label: `atmosphere-aerial-bg-${bodyId}`,
          layout: applyBgl,
          entries: [...binding.applyEntries, { binding: 8, resource: depthView }],
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
    perBody.clear();
    froxelInScatterTex.destroy();
    froxelTransmittanceTex.destroy();
  }

  return { label: 'aerialPerspectiveRenderer', bake, draw, rebind, destroy };
}
