/**
 * bloomPyramid — owns the four pipelines of the dual-filter bloom mip pyramid
 * (bright prefilter, downsample, upsample, and the strength-scaled fold back
 * into HDR) plus the linear sampler and the per-level texel-size uniform
 * buffers. Ported from the `galaxy-renderer` dev tool's bloom stack
 * (`createGalaxyRenderTargets` + its post pipelines); the fold is
 * skymap's addition, carrying the per-frame `settings.bloom.strength` multiply
 * the generic compositor has no slot for.
 *
 * The pyramid's TEXTURES are not owned here — they are `renderTargets` rows
 * (`bloom0..bloom4`), recreated on resize. Each draw takes the source view as a
 * parameter and rebuilds its bind group, so a resize needs no bookkeeping in
 * this factory (same reasoning as `additiveUpsample` / `starAggregateUpsample`).
 *
 * ### Why per-level uniform buffers, NOT one shared buffer
 *
 * The downsample pipeline is reused for four draws (levels 1..4) and the
 * upsample pipeline for four draws (levels 3..0) within a single frame. Each
 * draw needs its OWN texel-size uniform. A single shared buffer written four
 * times and submitted once would feed every draw the LAST write, because
 * `queue.writeBuffer` ordering is not preserved against `submit` inside one
 * frame (CLAUDE.md 'things that have bitten us' — the tool's `mipTexelBufs`
 * exists for exactly this). So downsample gets one buffer per level and
 * upsample gets its own one-per-level set; `level` selects the buffer.
 *
 * The two stages need SEPARATE buffer arrays even though their level ranges
 * overlap (both touch levels 1,2,3): in one frame `downsample(level=3)` reads
 * `bloom2`'s texel size while `upsample(level=3)` reads `bloom4`'s — different
 * uniform contents for the same level. Sharing one buffer per level would make
 * the second write clobber the first and re-introduce the race.
 *
 * ### Why the upsample pipeline blends additively and the others do not
 *
 * `upsample` folds each coarser level onto the next-finer one with one/one
 * additive blend, so the accumulation of every level's progressively-wider tent
 * is what builds bloom's soft multi-scale falloff. `bright` and `downsample`
 * OVERWRITE their targets (opaque, no blend) — each is the sole producer of its
 * target, so there is nothing to accumulate against. Giving downsample an
 * additive blend would sum successive frames' mips into ever-brighter garbage.
 */

import brightCode from '../shaders/bloom/bright.wesl?static';
import downsampleCode from '../shaders/bloom/downsample.wesl?static';
import upsampleCode from '../shaders/bloom/upsample.wesl?static';
import foldCode from '../shaders/bloom/fold.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../lib/blendStates';
import type { BloomPyramid } from '../../../@types/rendering/BloomPyramid';
import type { Vec2 } from '../../../@types/math/Vec2';
import { BLOOM_LEVELS } from '../../../data/bloomConstants';

// Levels in the pyramid: `bloom0..bloom4`, from the shared `bloomConstants`
// home so the uniform arrays here, the `renderTargets` rows, and `runBloom`'s
// pass loops all derive from one number. The uniform-buffer arrays are indexed
// directly by level for legibility; the edge slots each stage never uses
// (downsample's [0], upsample's [4]) are one 16-byte buffer apiece.

/**
 * Soft-threshold knee written into the bright prefilter's uniform (`u.y`).
 * Matches the tool's seed; the bright shader currently keys only off `u.x`
 * (threshold), so this is a forward-compatible slot rather than a live knob.
 */
const BRIGHT_KNEE = 0.5;

export function createBloomPyramid(device: GPUDevice, hdrFormat: GPUTextureFormat): BloomPyramid {
  const brightModule = createShaderModuleWithDevLog(device, brightCode, 'bloom.bright');
  const downsampleModule = createShaderModuleWithDevLog(device, downsampleCode, 'bloom.downsample');
  const upsampleModule = createShaderModuleWithDevLog(device, upsampleCode, 'bloom.upsample');
  const foldModule = createShaderModuleWithDevLog(device, foldCode, 'bloom.fold');

  // Linear sampler — the 5-tap downsample and 8-tap upsample kernels rely on
  // bilinear filtering to land their sub-texel diagonal taps. Default address
  // mode is clamp-to-edge, which is what the tent filter wants at the borders.
  const sampler = device.createSampler({
    label: 'bloomPyramid-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // One bind-group layout shared by all three pipelines: they have identical
  // binding shapes (sampler@0, texture@1, uniform vec4@2 — see the bloom
  // shaders). Sharing the layout also lets a bind group built against it bind
  // on any of the three pipelines.
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'bloomPyramid-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.FRAGMENT, sampler: {} },
      { binding: 1, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, buffer: { type: 'uniform' } },
    ],
  });

  const pipelineLayout = device.createPipelineLayout({
    label: 'bloomPyramid-pipeline-layout',
    bindGroupLayouts: [bindGroupLayout],
  });

  // bright + downsample OVERWRITE their target (opaque); only upsample blends
  // additively so its fold accumulates onto the finer level. See module header.
  const brightPipeline = device.createRenderPipeline({
    label: 'bloomPyramid-bright-pipeline',
    layout: pipelineLayout,
    vertex: { module: brightModule, entryPoint: 'vs' },
    fragment: { module: brightModule, entryPoint: 'fs', targets: [{ format: hdrFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  const downsamplePipeline = device.createRenderPipeline({
    label: 'bloomPyramid-downsample-pipeline',
    layout: pipelineLayout,
    vertex: { module: downsampleModule, entryPoint: 'vs' },
    fragment: { module: downsampleModule, entryPoint: 'fs', targets: [{ format: hdrFormat }] },
    primitive: { topology: 'triangle-list' },
  });

  const upsamplePipeline = device.createRenderPipeline({
    label: 'bloomPyramid-upsample-pipeline',
    layout: pipelineLayout,
    vertex: { module: upsampleModule, entryPoint: 'vs' },
    fragment: {
      module: upsampleModule,
      entryPoint: 'fs',
      // Additive one/one on colour AND alpha so each fold sums onto the finer
      // level — load-bearing, see module header.
      targets: [{ format: hdrFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // The final fold pipeline: samples bloom0 and adds its strength-scaled colour
  // into HDR. Additive one/one like upsample — it accumulates the glow onto the
  // scene rather than overwriting it. Built AFTER the three pyramid pipelines so
  // the bright/downsample/upsample build order (asserted by the factory tests)
  // is unperturbed.
  const foldPipeline = device.createRenderPipeline({
    label: 'bloomPyramid-fold-pipeline',
    layout: pipelineLayout,
    vertex: { module: foldModule, entryPoint: 'vs' },
    fragment: {
      module: foldModule,
      entryPoint: 'fs',
      targets: [{ format: hdrFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-list' },
  });

  // Per-level texel-size uniforms, ONE array per stage — see module header on
  // why they must not be shared. Each buffer is [1/w, 1/h, flag, 0] (16 bytes).
  const makeLevelUniforms = (stage: string): GPUBuffer[] =>
    Array.from({ length: BLOOM_LEVELS }, (_unused, level) =>
      device.createBuffer({
        label: `bloomPyramid-${stage}-texel${level}`,
        size: 16,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
      }),
    );
  const downTexelBufs = makeLevelUniforms('down');
  const upTexelBufs = makeLevelUniforms('up');

  // The bright prefilter is drawn once per frame, so a single buffer is safe —
  // no intra-frame reuse means no writeBuffer/submit race to avoid.
  const brightBuf = device.createBuffer({
    label: 'bloomPyramid-bright-uniform',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Same single-buffer reasoning as brightBuf: the fold is drawn once per frame,
  // so no intra-frame reuse means no writeBuffer/submit race to dodge.
  const foldBuf = device.createBuffer({
    label: 'bloomPyramid-fold-uniform',
    size: 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });

  // Bind group rebuilt per draw because the source view is a `renderTargets`
  // row recreated on resize; caching would bind a destroyed view. One alloc per
  // fullscreen blit is negligible.
  const bindFor = (srcView: GPUTextureView, uniform: GPUBuffer): GPUBindGroup =>
    device.createBindGroup({
      label: 'bloomPyramid-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: sampler },
        { binding: 1, resource: srcView },
        { binding: 2, resource: { buffer: uniform } },
      ],
    });

  return {
    label: 'bloomPyramid',
    bright(pass: GPURenderPassEncoder, srcView: GPUTextureView, threshold: number): void {
      device.queue.writeBuffer(brightBuf, 0, new Float32Array([threshold, BRIGHT_KNEE, 0, 0]));
      pass.setPipeline(brightPipeline);
      pass.setBindGroup(0, bindFor(srcView, brightBuf));
      pass.draw(3, 1, 0, 0);
    },
    downsample(
      pass: GPURenderPassEncoder,
      srcView: GPUTextureView,
      level: number,
      srcTexelSize: Vec2,
      karis: boolean,
    ): void {
      const uniform = downTexelBufs[level]!;
      device.queue.writeBuffer(
        uniform,
        0,
        new Float32Array([srcTexelSize[0], srcTexelSize[1], karis ? 1 : 0, 0]),
      );
      pass.setPipeline(downsamplePipeline);
      pass.setBindGroup(0, bindFor(srcView, uniform));
      pass.draw(3, 1, 0, 0);
    },
    upsample(
      pass: GPURenderPassEncoder,
      srcView: GPUTextureView,
      level: number,
      srcTexelSize: Vec2,
    ): void {
      const uniform = upTexelBufs[level]!;
      device.queue.writeBuffer(
        uniform,
        0,
        new Float32Array([srcTexelSize[0], srcTexelSize[1], 0, 0]),
      );
      pass.setPipeline(upsamplePipeline);
      pass.setBindGroup(0, bindFor(srcView, uniform));
      pass.draw(3, 1, 0, 0);
    },
    fold(pass: GPURenderPassEncoder, srcView: GPUTextureView, strength: number): void {
      device.queue.writeBuffer(foldBuf, 0, new Float32Array([strength, 0, 0, 0]));
      pass.setPipeline(foldPipeline);
      pass.setBindGroup(0, bindFor(srcView, foldBuf));
      pass.draw(3, 1, 0, 0);
    },
    destroy(): void {
      // Uniform buffers have an explicit destroy; release them. Sampler,
      // layout, and pipelines are GC'd when their last reference drops.
      for (const buf of downTexelBufs) buf.destroy();
      for (const buf of upTexelBufs) buf.destroy();
      brightBuf.destroy();
      foldBuf.destroy();
    },
  };
}
