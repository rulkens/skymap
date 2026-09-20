/**
 * aerialPerspectiveRenderer — the depth-keyed inside-atmosphere apply
 * (`aerialPerspective/fragment.wesl`). Built by `atmosphereShellRenderer` over
 * the bundles it already owns, so the fog reads the same `ScatteringParams`,
 * twilight knobs and startup LUTs the shell does — one atmosphere, two
 * consumers. Design rationale lives on the `AerialPerspectiveRenderer` type.
 */

import type { AerialPerspectiveRenderer } from '../../../../@types/rendering/AerialPerspectiveRenderer';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import applyCode from '../../shaders/atmosphere/aerialPerspective/fragment.wesl?static';

/** The GPU resources the apply borrows from each `atmosphereShellRenderer` bundle. */
export type AerialBundleResources = {
  readonly scatteringBuffer: GPUBuffer;
  readonly skyViewParamsBuffer: GPUBuffer;
  readonly shellUniformBuffer: GPUBuffer;
  readonly transmittanceTex: GPUTexture;
  readonly multiScatterTex: GPUTexture;
  readonly skyViewTex: GPUTexture;
};

export function createAerialPerspectiveRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  sampler: GPUSampler,
  placeholderRingView: GPUTextureView,
  bodies: ReadonlyMap<string, AerialBundleResources>,
): AerialPerspectiveRenderer {
  const applyModule = createShaderModuleWithDevLog(
    device,
    applyCode,
    'atmosphere.aerialPerspective.fragment',
  );

  // Mirrors the fragment's `@group(0)`: the shell's five (hoisted by importing
  // `sampleShellRay`) plus the multi-scatter LUT, the two params buffers the
  // march needs, and scene depth. Binding 0 is FRAGMENT-only here — the
  // covering triangle reads no uniform, so the vertex stage has no resource
  // interface at all.
  const applyBgl = device.createBindGroupLayout({
    label: 'atmosphere-aerial-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 5, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 6, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
      { binding: 7, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
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
    /** Bindings 0-7; only binding 8, the depth view, varies. */
    applyEntries: readonly GPUBindGroupEntry[];
    /** Last built apply group, keyed on the depth view it was built over. */
    applyGroup: { readonly depthView: GPUTextureView; readonly group: GPUBindGroup } | null;
  };
  const perBody = new Map<string, BodyBinding>();

  function entriesFor(bundle: AerialBundleResources): readonly GPUBindGroupEntry[] {
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
      { binding: 5, resource: bundle.multiScatterTex.createView() },
      { binding: 6, resource: { buffer: bundle.scatteringBuffer } },
      { binding: 7, resource: { buffer: bundle.skyViewParamsBuffer } },
    ];
  }

  for (const [bodyId, bundle] of bodies) {
    perBody.set(bodyId, {
      shellUniformBuffer: bundle.shellUniformBuffer,
      applyEntries: entriesFor(bundle),
      applyGroup: null,
    });
  }

  // The shell's tier `reconcile` DESTROYS and recreates `skyViewTex`, and a
  // bind group holds the view, not the variable — so it must tell us too.
  function rebind(bodyId: string, bundle: AerialBundleResources): void {
    const binding = perBody.get(bodyId);
    if (binding === undefined) return;
    binding.applyEntries = entriesFor(bundle);
    binding.applyGroup = null;
  }

  function draw(
    pass: GPURenderPassEncoder,
    bodyId: string,
    uniforms: Float32Array,
    depthView: GPUTextureView,
  ): void {
    const binding = perBody.get(bodyId);
    if (binding === undefined) {
      throw new Error(`aerialPerspectiveRenderer: unknown body id '${bodyId}'`);
    }
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
  }

  return { label: 'aerialPerspectiveRenderer', draw, rebind, destroy };
}
