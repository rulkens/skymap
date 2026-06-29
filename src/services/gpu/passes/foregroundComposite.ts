/**
 * foregroundComposite — fullscreen pass that OVER-composites the
 * opaque foreground render target onto the HDR buffer.
 *
 * ### Why OVER, not additive (key difference from volumeUpsample)
 *
 * 'volumeUpsample.ts:80-88' uses additive blending
 * '{ srcFactor: "one", dstFactor: "one" }' for both color and alpha.
 * This is correct for the volume pass because every galaxy/volume
 * renderer accumulates additively into HDR and the volume offscreen
 * carries that same additive sum.
 *
 * The foreground pass is different: it draws OPAQUE geometry (Earth,
 * Moon, Sun) with real alpha coverage (e.g. an atmosphere limb
 * feathered against space).  The correct operator is Porter-Duff OVER:
 *
 *   out_rgb   = src_alpha * fg_rgb + (1 - src_alpha) * hdr_rgb
 *   out_alpha = fg_alpha  + (1 - fg_alpha) * hdr_alpha
 *
 * Implemented as:
 *   color: { srcFactor: 'src-alpha',  dstFactor: 'one-minus-src-alpha', operation: 'add' }
 *   alpha: { srcFactor: 'one',        dstFactor: 'one-minus-src-alpha', operation: 'add' }
 *
 * Using additive blending here would make opaque foreground geometry
 * ADD its colour to whatever is behind it, rather than replacing it —
 * a night-side Earth against the galaxy plane would be visibly lighter
 * than it should be.
 *
 * ### Straight vs premultiplied alpha
 *
 * The blend state's 'srcFactor: src-alpha' means the GPU multiplies the
 * foreground colour by its alpha before adding it.  The fragment shader
 * must therefore emit straight (unassociated) colour — emitting
 * premultiplied colour would double-multiply by alpha.  See
 * 'foregroundComposite/fragment.wesl' for the per-pixel commentary.
 *
 * ### Bind-group rebuilt per draw (same pattern as volumeUpsample)
 *
 * The 'src' view passed to 'draw' changes on every canvas resize
 * (foregroundOffscreen.resize() destroys and recreates the texture).
 * Caching the bind group would bind a destroyed view.  Rebuilding on
 * every draw is negligible cost compared with the fullscreen blit it
 * carries, and is the same approach volumeUpsample uses for the same
 * reason.
 */

import vsCode from '../shaders/foregroundComposite/vertex.wesl?static';
import fsCode from '../shaders/foregroundComposite/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import type { ForegroundComposite } from '../../../@types/rendering/ForegroundComposite';

export function createForegroundComposite(
  device: GPUDevice,
  hdrFormat: GPUTextureFormat,
): ForegroundComposite {
  const vsModule = createShaderModuleWithDevLog(
    device,
    vsCode,
    'foregroundComposite.vertex',
  );
  const fsModule = createShaderModuleWithDevLog(
    device,
    fsCode,
    'foregroundComposite.fragment',
  );

  // Linear sampler — the foreground texture is full-resolution, so this
  // is primarily for sub-pixel accuracy at non-integer UV coordinates.
  // Mirrors the linear sampler in volumeUpsample for consistency.
  const sampler = device.createSampler({
    label: 'foregroundComposite-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'foregroundComposite-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'foregroundComposite-pipeline',
    layout: device.createPipelineLayout({
      label: 'foregroundComposite-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module: vsModule, entryPoint: 'vs' },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      targets: [
        {
          format: hdrFormat,
          // OVER composite — Porter-Duff OVER with straight alpha.
          // Contrast with volumeUpsample's additive '(one, one)':
          // foreground geometry replaces (not adds to) the HDR
          // background in proportion to its coverage alpha.
          blend: {
            color: {
              srcFactor: 'src-alpha',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
            alpha: {
              srcFactor: 'one',
              dstFactor: 'one-minus-src-alpha',
              operation: 'add',
            },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-list' },
  });

  return {
    draw(pass: GPURenderPassEncoder, src: GPUTextureView): void {
      // Bind group rebuilt per draw — 'src' is recreated on every
      // foregroundOffscreen.resize(); caching across resize would bind
      // a destroyed view.  See module header for the rationale.
      const bindGroup = device.createBindGroup({
        label: 'foregroundComposite-bg',
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: src },
          { binding: 1, resource: sampler },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
    },
    destroy(): void {
      // No GPUTexture / GPUBuffer to release — sampler, pipeline, and
      // bind-group-layout are GC'd when their last reference drops.
      // Present for lifecycle symmetry with PostProcess and volumeUpsample
      // so the engine's teardown call shape is uniform across GPU-resource
      // owners.
    },
  };
}
