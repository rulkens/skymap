/**
 * generateMipChain — fill a texture's mip levels 1..N-1 from level 0 with a
 * render-pass 2× downsample chain, plus the pure `mipLevelCount` the callers
 * use to size the texture in the first place.
 *
 * ## Why this exists — WebGPU has no built-in mipmap generation
 *
 * `copyExternalImageToTexture` and `queue.writeTexture` populate mip level 0
 * only; every level below stays undefined. Sampling an 8k body texture with
 * `mipmapFilter: 'linear'` but no mip data would minify straight off level 0
 * and shimmer badly as the body shrinks toward the sub-pixel glint handoff.
 * There is no `device.generateMipmaps()` — the portable idiom is to render the
 * chain: each level below 0 is a fullscreen blit of the level above through
 * `shaders/lib/mipBlit.wesl` (a single linear tap = the 2×2 box downsample).
 *
 * ## The RENDER_ATTACHMENT usage requirement (caller's contract)
 *
 * Every mip level here is the colour attachment of exactly one render pass, so
 * the texture MUST be created with `GPUTextureUsage.RENDER_ATTACHMENT` — on top
 * of the `TEXTURE_BINDING` needed to sample the parent level and the `COPY_DST`
 * needed to upload level 0. The renderers that call this (`earthRenderer`,
 * `texturedBodyRenderer`) own that usage flag on their body textures; a texture
 * created without RENDER_ATTACHMENT will fail at the first `beginRenderPass`.
 *
 * ## Level count — one source of truth
 *
 * A full chain has `floor(log2(max(w, h))) + 1` levels (`mipLevelCount` below).
 * The caller bakes that count into the texture at creation and passes each
 * level-0 bitmap; this function then reads `texture.mipLevelCount` and fills
 * every level after 0. Reading the count off the texture rather than
 * recomputing it means the loop always matches what was actually allocated —
 * the two can't drift.
 *
 * All N-1 downsample passes go into ONE command encoder and one submit: within
 * a command buffer the passes execute in order, so pass i reliably reads the
 * output pass i-1 wrote into the parent level.
 *
 * (This file exports a helper AND a function — the one-symbol-per-file rule is
 * a `utils/` and `@types/` rule; the gpu-wide shared-primitives `lib/` groups a
 * domain's pieces together, like `lib/unitQuad.ts` pairs its data with its
 * layout.)
 *
 * @module
 */

import mipBlitCode from '../shaders/lib/mipBlit.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

/**
 * Number of mip levels in a full chain for a `width` × `height` texture:
 * `floor(log2(max(w, h))) + 1`. The chain halves the larger side each level
 * until it reaches 1×1, so the count is driven by the longer edge. Callers pass
 * this to `createTexture({ mipLevelCount })`; `generateMipChain` then fills
 * every level below 0.
 */
export function mipLevelCount(width: number, height: number): number {
  return Math.floor(Math.log2(Math.max(width, height))) + 1;
}

/**
 * Fill `texture`'s mip levels 1..mipLevelCount-1 by rendering each as a
 * fullscreen 2× downsample of the level above. No-op for a single-level
 * texture. The texture must have been created with `RENDER_ATTACHMENT` usage
 * (see the module header).
 */
export function generateMipChain(device: GPUDevice, texture: GPUTexture): void {
  // A single-level texture has nothing below level 0 to fill — bail before
  // building any GPU objects.
  if (texture.mipLevelCount <= 1) return;

  // The blit pipeline is rebuilt on each call rather than cached: this runs
  // once per texture LOAD (a handful of times over the whole app lifetime, when
  // a body's bitmap arrives), never per frame, so there is no cost to amortise
  // and no module-level device cache to keep coherent.
  const module = createShaderModuleWithDevLog(device, mipBlitCode, 'mipBlit');

  const sampler = device.createSampler({
    label: 'mipBlit-sampler',
    // Linear so the single tap averages the 2×2 parent texels (the box filter
    // for an exact halving). clamp-to-edge so the destination edge texels don't
    // wrap the parent when sampling near uv 0/1.
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const bindGroupLayout = device.createBindGroupLayout({
    label: 'mipBlit-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const pipeline = device.createRenderPipeline({
    label: 'mipBlit-pipeline',
    layout: device.createPipelineLayout({
      label: 'mipBlit-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module, entryPoint: 'vs' },
    fragment: {
      module,
      entryPoint: 'fs',
      // Colour target matches the texture being filled — the child level is the
      // attachment, so its format is the texture's own format.
      targets: [{ format: texture.format }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // One encoder for the whole chain: passes run in submission order within a
  // command buffer, so level i is fully written before pass i+1 samples it.
  const encoder = device.createCommandEncoder({ label: 'generateMipChain-encoder' });

  for (let level = 1; level < texture.mipLevelCount; level++) {
    const srcView = texture.createView({
      label: `mipBlit-src-${level - 1}`,
      baseMipLevel: level - 1,
      mipLevelCount: 1,
    });
    const dstView = texture.createView({
      label: `mipBlit-dst-${level}`,
      baseMipLevel: level,
      mipLevelCount: 1,
    });

    const bindGroup = device.createBindGroup({
      label: `mipBlit-bg-${level}`,
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: srcView },
        { binding: 1, resource: sampler },
      ],
    });

    const pass = encoder.beginRenderPass({
      label: `mipBlit-pass-${level}`,
      colorAttachments: [
        {
          view: dstView,
          // The blit writes every texel of the child level, so the load is
          // irrelevant — 'clear' is the cheap default.
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    });
    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }

  device.queue.submit([encoder.finish()]);
}
