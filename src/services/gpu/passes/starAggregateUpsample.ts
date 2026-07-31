/**
 * starAggregateUpsample — fullscreen pass that upsamples the half-resolution
 * survey-star aggregate offscreen and additively blends it into the HDR
 * target, re-applying the star pass's hue-preserving knee to the summed
 * aggregate field on the way.
 *
 * ### Why a sibling of `additiveUpsample` rather than another of its instances
 *
 * The two passes share their whole shape — a linear-sampled fullscreen blit of
 * a half-res offscreen, additive into HDR — but differ in the fragment math:
 * `additiveUpsample` is a 4-tap low-pass blit that reconstructs its source
 * unchanged, while this one is a single-tap composite that knees the SUMMED
 * scalar (carried in the offscreen alpha; see the shader). Folding both into one
 * parameterised factory would thread a "which fragment shader" discriminant
 * through a one-shape helper for no reuse win — two thin sibling factories keep
 * each single-purpose, the same reasoning `additiveUpsample`'s header states.
 *
 * ### Why additive blend + a linear sampler
 *
 * The aggregate stream draws into the offscreen with one/one additive on both
 * colour and alpha, so the offscreen holds the additive sum of every aggregate
 * glow. Sampling it with a `'linear'` sampler upscales the low-frequency glow
 * haze for free, and the additive blend adds the knee'd result into HDR exactly
 * as if the aggregate glows had been knee'd and drawn straight into it. Both are
 * load-bearing — swapping the blend to opaque, or the knee's placement, breaks
 * the LOD-symmetry the split exists to restore.
 */

import vsCode from '../shaders/starAggregateUpsample/vertex.wesl?static';
import fsCode from '../shaders/starAggregateUpsample/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../lib/blendStates';
import type { StarAggregateUpsample } from '../../../@types/rendering/StarAggregateUpsample';

export function createStarAggregateUpsample(
  device: GPUDevice,
  hdrFormat: GPUTextureFormat,
): StarAggregateUpsample {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'starAggregateUpsample.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'starAggregateUpsample.fragment');

  // Linear sampler — the free 2x bilinear upscale of the low-frequency glow haze.
  const sampler = device.createSampler({
    label: 'starAggregateUpsample-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'starAggregateUpsample-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'starAggregateUpsample-pipeline',
    layout: device.createPipelineLayout({
      label: 'starAggregateUpsample-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      // Additive blend for BOTH colour and alpha — matches the aggregate
      // stream's blend byte-for-byte. Module header explains why it is
      // load-bearing.
      targets: [{ format: hdrFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  return {
    draw(pass: GPURenderPassEncoder, halfResView: GPUTextureView): void {
      // Bind group rebuilt per draw because the half-res view is recreated on
      // every renderTargets.resize(). One alloc per frame is negligible against
      // the fullscreen composite it carries.
      const bindGroup = device.createBindGroup({
        label: 'starAggregateUpsample-bg',
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
      // No GPUTexture / GPUBuffer to release — sampler + pipeline +
      // bind-group-layout are GC'd when their last reference drops. Present for
      // teardown-shape symmetry with the other GPU-resource owners.
    },
  };
}
