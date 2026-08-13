/**
 * generateMipChain3d — the `generateMipChain.ts` 2D blit chain, generalised to
 * 3D textures: `mipLevelCount3d` sizes the chain, `generateMipChain3d` fills
 * it, and `downsampleLevel3d` is the exported one-(level-pair) primitive both
 * this loop and Task 3's cross-texture max pyramid share (see that file's
 * plan note; volumeFieldRenderer's spec covers the caller-side contract).
 *
 * A 3D colour attachment writes ONE z slice per render pass
 * (`GPURenderPassColorAttachment.depthSlice`), so where the 2D chain issues
 * one pass per level, this issues one per (level, z slice) — `downsampleLevel3d`
 * owns that inner loop. Every level here fills from the SAME texture's own
 * level 0, so 'max' always reduces already-deviation-space values (identity
 * `center`/`halfRange`); Task 3's first reduction (raw → deviation) is the one
 * call site that passes the field's real values, via `downsampleLevel3d`
 * directly rather than this loop.
 *
 * @module
 */

import mipBlit3dCode from '../shaders/lib/mipBlit3d.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

/** The 3-argument generalisation of `mipLevelCount` (`generateMipChain.ts`). */
export function mipLevelCount3d(width: number, height: number, depth: number): number {
  return Math.floor(Math.log2(Math.max(width, height, depth))) + 1;
}

function levelDim(dim0: number, level: number): number {
  return Math.max(1, Math.floor(dim0 / 2 ** level));
}

/** One mip level of a 3D texture, with its own (already-halved) dimensions. */
export type MipLevelView3d = {
  texture: GPUTexture;
  level: number;
  width: number;
  height: number;
  depth: number;
};

export type MipBlit3dPipeline = {
  pipeline: GPURenderPipeline;
  bindGroupLayout: GPUBindGroupLayout;
  sampler: GPUSampler;
};

/**
 * Build the box- or max-reduction pipeline once; both `generateMipChain3d`
 * and Task 3's pyramid builder reuse the returned handle across every level
 * (and, for Task 3, across textures) rather than rebuilding it per pass.
 */
export function createMipBlit3dPipeline(
  device: GPUDevice,
  filter: 'box' | 'max',
  format: GPUTextureFormat,
): MipBlit3dPipeline {
  const module = createShaderModuleWithDevLog(device, mipBlit3dCode, 'mipBlit3d');
  const sampler = device.createSampler({
    label: 'mipBlit3d-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
    addressModeW: 'clamp-to-edge',
  });
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'mipBlit3d-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '3d' },
      },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });
  const pipeline = device.createRenderPipeline({
    label: `mipBlit3d-pipeline-${filter}`,
    layout: device.createPipelineLayout({
      label: 'mipBlit3d-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: { module, entryPoint: 'vs' },
    fragment: {
      module,
      entryPoint: filter === 'box' ? 'fs_box' : 'fs_max',
      targets: [{ format }],
    },
    primitive: { topology: 'triangle-list' },
  });
  return { pipeline, bindGroupLayout, sampler };
}

/**
 * Fill one destination level (`dst`) from its parent (`src`) into `encoder`,
 * one render pass per destination z slice. `center`/`halfRange` are the
 * fs_max deviation transform (`center: 0, halfRange: 1` is the identity —
 * see the module header); fs_box ignores them.
 *
 * Exported (not folded into `generateMipChain3d`'s loop) because Task 3's max
 * pyramid downsamples across SEPARATE scratch textures, not levels of one
 * texture — it calls this directly with its own `src`/`dst` pair per step.
 */
export function downsampleLevel3d(
  device: GPUDevice,
  encoder: GPUCommandEncoder,
  mb: MipBlit3dPipeline,
  src: MipLevelView3d,
  dst: MipLevelView3d,
  center: number,
  halfRange: number,
): void {
  const srcView = src.texture.createView({
    label: `mipBlit3d-src-${src.level}`,
    dimension: '3d',
    baseMipLevel: src.level,
    mipLevelCount: 1,
  });
  const dstView = dst.texture.createView({
    label: `mipBlit3d-dst-${dst.level}`,
    dimension: '3d',
    baseMipLevel: dst.level,
    mipLevelCount: 1,
  });
  const zRatio = src.depth / dst.depth;

  for (let dz = 0; dz < dst.depth; dz++) {
    // boxZ: continuous parent-space z at dz's centre — the 3D generalisation
    // of the UV mapping the rasteriser already gives fs_box for x/y (see
    // mipBlit3d.wesl). srcZLow/srcZHigh: the integer 2-slice footprint fs_max
    // reduces, clamped so an odd `src.depth` collapses to one tap at the
    // trailing edge (srcZLow === srcZHigh) instead of reading past the texture.
    const boxZ = (dz + 0.5) * zRatio - 0.5;
    const srcZLow = Math.min(2 * dz, src.depth - 1);
    const srcZHigh = Math.min(2 * dz + 1, src.depth - 1);

    // A fresh buffer per slice: `writeBuffer` calls made before a shared
    // `submit()` are ordered against each other by JS call order, not by
    // which pass reads them, so reusing one buffer across passes in this
    // encoder would leave every pass reading the LAST write. Each of these is
    // written exactly once, so there is nothing to race.
    const uniformBuffer = device.createBuffer({
      label: `mipBlit3d-uniform-${dst.level}-${dz}`,
      size: 20,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    const scratch = new ArrayBuffer(20);
    new Float32Array(scratch, 0, 1)[0] = boxZ;
    new Uint32Array(scratch, 4, 2).set([srcZLow, srcZHigh]);
    new Float32Array(scratch, 12, 2).set([center, halfRange]);
    device.queue.writeBuffer(uniformBuffer, 0, scratch);

    const bindGroup = device.createBindGroup({
      label: `mipBlit3d-bg-${dst.level}-${dz}`,
      layout: mb.bindGroupLayout,
      entries: [
        { binding: 0, resource: srcView },
        { binding: 1, resource: mb.sampler },
        { binding: 2, resource: { buffer: uniformBuffer } },
      ],
    });

    const pass = encoder.beginRenderPass({
      label: `mipBlit3d-pass-${dst.level}-${dz}`,
      colorAttachments: [
        {
          view: dstView,
          depthSlice: dz,
          loadOp: 'clear',
          storeOp: 'store',
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
        },
      ],
    });
    pass.setPipeline(mb.pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.draw(3, 1, 0, 0);
    pass.end();
  }
}

/**
 * Fill `texture`'s mip levels 1..mipLevelCount-1 from level 0. No-op for a
 * single-level texture. The texture must have been created with
 * `RENDER_ATTACHMENT` usage (see `generateMipChain.ts`'s module header — the
 * same caller contract applies here).
 */
export function generateMipChain3d(
  device: GPUDevice,
  texture: GPUTexture,
  filter: 'box' | 'max',
): void {
  if (texture.mipLevelCount <= 1) return;

  const mb = createMipBlit3dPipeline(device, filter, texture.format);
  const encoder = device.createCommandEncoder({ label: 'generateMipChain3d-encoder' });

  // Every level here reduces this texture's OWN level 0 — for a 'max' filter
  // that input is already deviation-space (see module header), so identity.
  const center = 0;
  const halfRange = 1;

  for (let level = 1; level < texture.mipLevelCount; level++) {
    const src: MipLevelView3d = {
      texture,
      level: level - 1,
      width: levelDim(texture.width, level - 1),
      height: levelDim(texture.height, level - 1),
      depth: levelDim(texture.depthOrArrayLayers, level - 1),
    };
    const dst: MipLevelView3d = {
      texture,
      level,
      width: levelDim(texture.width, level),
      height: levelDim(texture.height, level),
      depth: levelDim(texture.depthOrArrayLayers, level),
    };
    downsampleLevel3d(device, encoder, mb, src, dst, center, halfRange);
  }

  device.queue.submit([encoder.finish()]);
}
