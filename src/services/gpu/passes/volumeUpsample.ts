/**
 * volumeUpsample — fullscreen pass that bilinearly upsamples the
 * half-resolution scalar-volume offscreen target and additively blends
 * the result into the HDR target.
 *
 * ### Why a dedicated pass rather than part of the tone-map composite
 *
 * The upsample pass is conceptually independent of tone-mapping — it
 * runs INSIDE the HDR render step (the `volume-upsample` content layer),
 * while tone-map runs AFTER it as the frame's `hdr→swap` composite.
 * Their blend semantics and target attachments differ, and folding them
 * into one factory would force the consumer to thread two unrelated
 * descriptors through one call.  Keeping this a sibling factory under
 * `services/gpu/passes/` keeps it single-purpose.
 *
 * ### Why additive blend
 *
 * The scalar-volume pipeline draws into the half-res target with
 * '{ srcFactor: "one", dstFactor: "one" }' for both color and alpha
 * (see volumeFieldRenderer.ts).  The half-res target therefore holds
 * the per-fragment additive sum of every active field.  We bilinearly
 * upsample that sum and ADD it to the HDR target — net effect is
 * mathematically identical to having drawn every field directly into
 * the HDR target, up to bilinear interpolation.  Switching the blend
 * state to opaque or alpha-blended would break this equivalence and
 * change the look of overlapping fields.
 *
 * ### Why a linear sampler
 *
 * The "bilinear" filter is just two consecutive linear interpolations.
 * Sampling a half-res texture at full-res UVs with a `'linear'` sampler
 * gives us a 2x bilinear upscale for free (one fragment shader
 * invocation, one textureSample, zero math).  The alternative — manual
 * `textureLoad` at the four corner texels and an in-shader lerp — costs
 * 4x the texture-fetch traffic for identical output.  See the fragment
 * shader's TODO comment for the conditions under which we'd fall back
 * to the manual variant.
 */

import vsCode from '../shaders/volumeUpsample/vertex.wesl?static';
import fsCode from '../shaders/volumeUpsample/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../lib/blendStates';
import type { VolumeUpsample } from '../../../@types/rendering/VolumeUpsample';

export function createVolumeUpsample(
  device: GPUDevice,
  hdrFormat: GPUTextureFormat,
): VolumeUpsample {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'volumeUpsample.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'volumeUpsample.fragment');

  // Linear sampler — see module header for the "free 2x bilinear" rationale.
  const sampler = device.createSampler({
    label: 'volumeUpsample-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'volumeUpsample-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'volumeUpsample-pipeline',
    layout: device.createPipelineLayout({
      label: 'volumeUpsample-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: hdrFormat,
          // Additive blend for BOTH color and alpha — matches the
          // scalar-volume pipeline's blend state byte-for-byte.  Module
          // header explains why this is load-bearing.
          blend: ADDITIVE_BLEND,
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  return {
    draw(pass: GPURenderPassEncoder, halfResView: GPUTextureView): void {
      // Bind group rebuilt per draw because the half-res view is
      // recreated on every renderTargets.resize().  Caching across resize
      // would bind a destroyed view.  One bind-group alloc per frame is
      // negligible compared to the fullscreen blit it carries.
      const bindGroup = device.createBindGroup({
        label: 'volumeUpsample-bg',
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: halfResView },
          { binding: 1, resource: sampler },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
    },
    destroy(): void {
      // No GPUTexture / GPUBuffer to release here — sampler + pipeline +
      // bind-group-layout don't have explicit destroy methods (they're
      // GC'd when their last reference drops).  The destroy method
      // exists for symmetry with the other GPU resource owners, giving
      // the engine a single teardown call shape.
    },
  };
}
