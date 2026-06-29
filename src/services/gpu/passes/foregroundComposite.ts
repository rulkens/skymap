/**
 * foregroundComposite — fullscreen pass that tone-maps the foreground
 * render target and OVER-composites it onto the tone-mapped swap chain.
 *
 * ### Why it runs after the UI overlay (and tone-maps itself)
 *
 * The foreground (Sun, Earth, …) renders in HDR into its own offscreen.
 * Compositing it onto the swap chain AFTER the galaxy-level UI overlay is
 * what makes opaque bodies occlude the labels/marker-lines behind them (and
 * lets a future translucent atmosphere tint them).  By then the swap chain
 * is LDR, so this pass applies the same tone-map curve the scene used —
 * shared math (`lib/tonemap.wesl`) and shared parameters
 * (`toneMapDefaults.ts`) — before the OVER blend.
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
import { TONEMAP_WHITEPOINT, TONEMAP_ASINH_SOFTNESS } from '../../../data/toneMapDefaults';
import { clampExposure } from '../../../utils/clampExposure';
import type { ForegroundComposite } from '../../../@types/rendering/ForegroundComposite';

export function createForegroundComposite(
  device: GPUDevice,
  swapFormat: GPUTextureFormat,
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

  // Tone-map uniform — same 16-byte layout as `postProcess`
  // (exposure, whitepoint², asinhSoftness, curve) so the foreground shares
  // the scene's curve. Rewritten per draw from the live tonemap settings.
  const uniformBuffer = device.createBuffer({
    label: 'foregroundComposite-uniform-buffer',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformBytes = new ArrayBuffer(16);
  const uniformF32 = new Float32Array(uniformBytes);
  const uniformU32 = new Uint32Array(uniformBytes);

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'foregroundComposite-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
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
          format: swapFormat,
          // OVER composite — Porter-Duff OVER with straight alpha.
          // Contrast with volumeUpsample's additive '(one, one)':
          // foreground geometry replaces (not adds to) the already
          // tone-mapped swap-chain pixels in proportion to its coverage.
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
    draw(
      pass: GPURenderPassEncoder,
      src: GPUTextureView,
      exposure: number,
      curve: number,
    ): void {
      // Same packing as postProcess.draw — clamp exposure at point of use,
      // pre-square the whitepoint, select the curve. Keeps the foreground's
      // tone-map byte-identical to the scene's.
      uniformF32[0] = clampExposure(exposure);
      uniformF32[1] = TONEMAP_WHITEPOINT * TONEMAP_WHITEPOINT;
      uniformF32[2] = TONEMAP_ASINH_SOFTNESS;
      uniformU32[3] = curve >>> 0;
      device.queue.writeBuffer(uniformBuffer, 0, uniformBytes);

      // Bind group rebuilt per draw — 'src' is recreated on every
      // foregroundOffscreen.resize(); caching across resize would bind
      // a destroyed view.  See module header for the rationale.
      const bindGroup = device.createBindGroup({
        label: 'foregroundComposite-bg',
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: src },
          { binding: 1, resource: sampler },
          { binding: 2, resource: { buffer: uniformBuffer } },
        ],
      });
      pass.setPipeline(pipeline);
      pass.setBindGroup(0, bindGroup);
      pass.draw(3, 1, 0, 0);
    },
    destroy(): void {
      // Release the tone-map uniform buffer. Sampler, pipeline, and
      // bind-group-layout are GC'd when their last reference drops.
      uniformBuffer.destroy();
    },
  };
}
