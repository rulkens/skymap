/**
 * additiveUpsample — fullscreen pass that reads a reduced-resolution
 * offscreen through a 4-tap low-pass and additively blends the result
 * into an `rgba16float` HDR target.
 *
 * Nothing here knows what the offscreen contains.  The factory's whole
 * contract is a pair of properties the CALLER must satisfy:
 *
 *   1. the offscreen was drawn with one/one additive blending on colour
 *      AND alpha, so it holds a per-fragment SUM rather than a composite
 *      that depended on draw order, and
 *   2. the summed signal is bandlimited relative to the offscreen's
 *      resolution, so a low-pass reconstruction of it loses nothing the
 *      viewer was meant to see.
 *
 * Given those, upsampling the sum and adding it to HDR is mathematically
 * what drawing every contributor straight into HDR would have produced,
 * up to reconstruction error.  Two subsystems satisfy the contract today
 * — the cosmological scalar-volume raymarch and the Milky Way cloud's
 * star aggregate — and each holds its own instance, so their gates stay
 * independent.
 *
 * ### Why a dedicated pass rather than part of the tone-map composite
 *
 * The upsample is conceptually independent of tone-mapping — it runs
 * INSIDE the HDR render step (as a content layer), while tone-map runs
 * AFTER it as the frame's `hdr→swap` composite.  Their blend semantics
 * and target attachments differ, and folding them into one factory would
 * force the consumer to thread two unrelated descriptors through one
 * call.  Keeping this a sibling factory under `services/gpu/passes/`
 * keeps it single-purpose.
 *
 * ### Why additive blend
 *
 * Property (1) above is only preserved if the composite is additive too.
 * Switching this pipeline's blend state to opaque or alpha-blended would
 * break the equivalence with drawing straight into HDR and change the
 * look wherever contributors overlap — which is everywhere, for a
 * volumetric or glow-like source.  The blend state is load-bearing, not
 * a default.
 *
 * ### Why a linear sampler
 *
 * The fragment stage spends its four taps on variance reduction (see the
 * shader for the rotated-grid geometry), and each tap is only worth 2×2
 * texels because the sampler filters.  With a `'nearest'` sampler the
 * same four fetches would cover four texels instead of nine, for the
 * same cost — the linear filter is free hardware work that widens the
 * kernel.  It also carries the magnification itself: sampling a
 * reduced-res texture at full-res UVs upscales with no in-shader lerp.
 */

import vsCode from '../shaders/additiveUpsample/vertex.wesl?static';
import fsCode from '../shaders/additiveUpsample/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../lib/blendStates';
import type { AdditiveUpsample } from '../../../@types/rendering/AdditiveUpsample';

export function createAdditiveUpsample(
  device: GPUDevice,
  hdrFormat: GPUTextureFormat,
): AdditiveUpsample {
  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'additiveUpsample.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'additiveUpsample.fragment');

  // Linear sampler — see module header for why the filtering is free and
  // why it widens each of the fragment stage's four taps.
  const sampler = device.createSampler({
    label: 'additiveUpsample-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'additiveUpsample-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'additiveUpsample-pipeline',
    layout: device.createPipelineLayout({
      label: 'additiveUpsample-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: hdrFormat,
          // Additive blend for BOTH color and alpha — matches, byte for
          // byte, the blend state every caller's producing pipeline used
          // to fill the offscreen.  Module header explains why this is
          // load-bearing.
          blend: ADDITIVE_BLEND,
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  return {
    draw(pass: GPURenderPassEncoder, halfResView: GPUTextureView): void {
      // Bind group rebuilt per draw because the half-res view is
      // recreated on every renderTargets.reconcile().  Caching across a
      // reallocation would bind a destroyed view.  One bind-group alloc per frame is
      // negligible compared to the fullscreen blit it carries.
      const bindGroup = device.createBindGroup({
        label: 'additiveUpsample-bg',
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
