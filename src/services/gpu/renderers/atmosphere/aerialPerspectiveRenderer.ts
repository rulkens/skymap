/**
 * aerialPerspectiveRenderer — the froxel volume bake (`froxelLut.wesl`) and,
 * from Task 3, its depth-keyed apply. Built by `atmosphereShellRenderer` over
 * the bundles it already owns, so the volume reads the same `ScatteringParams`,
 * twilight knobs and startup LUTs the shell does — one atmosphere, two
 * consumers. Design rationale (why a volume at all, why ONE pair of textures)
 * lives on the `AerialPerspectiveRenderer` type.
 */

import type { AerialPerspectiveRenderer } from '../../../../@types/rendering/AerialPerspectiveRenderer';
import { ATMOSPHERE_UNIFORM_FLOATS } from '../../../../utils/gpu/packAtmosphereUniforms';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import froxelCode from '../../shaders/atmosphere/froxelLut.wesl?static';

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

/** `targetFormat` and `placeholderRingView` belong to the apply half (Task 3);
 *  the bake writes no colour target and samples no ring strip. */
export function createAerialPerspectiveRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  sampler: GPUSampler,
  placeholderRingView: GPUTextureView,
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

  // Per body: its OWN uniform buffer, separate from the shell's. Two consumers
  // of one record are still two writes in one frame, and a shared buffer
  // between a `writeBuffer` and a `submit` is the ordering trap.
  type FroxelBinding = { readonly uniformBuffer: GPUBuffer; readonly bindGroup: GPUBindGroup };
  const perBody = new Map<string, FroxelBinding>();

  for (const [bodyId, bundle] of bodies) {
    const uniformBuffer = device.createBuffer({
      label: `atmosphere-froxel-uniform-${bodyId}`,
      size: ATMOSPHERE_UNIFORM_FLOATS * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    perBody.set(bodyId, {
      uniformBuffer,
      bindGroup: device.createBindGroup({
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
    });
  }

  const dispatchXY = Math.ceil(FROXEL_SIZE / WORKGROUP_SIZE);

  function encodeFroxel(encoder: GPUCommandEncoder, bodyId: string, uniforms: Float32Array): void {
    const binding = perBody.get(bodyId);
    if (binding === undefined) {
      throw new Error(`aerialPerspectiveRenderer: unknown body id '${bodyId}'`);
    }
    device.queue.writeBuffer(binding.uniformBuffer, 0, uniforms);
    const pass = encoder.beginComputePass({ label: 'atmosphere-froxel-pass' });
    pass.setPipeline(froxelPipeline);
    pass.setBindGroup(0, binding.bindGroup);
    pass.dispatchWorkgroups(dispatchXY, dispatchXY, 1);
    pass.end();
  }

  /** Task 3 replaces this with the depth-keyed full-screen apply. */
  function draw(): never {
    throw new Error('aerialPerspectiveRenderer: draw not implemented');
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
