/**
 * bloomPyramid — the pipelines, sampler and uniforms behind `BloomPyramid`.
 *
 * Every draw writes and binds its OWN uniform buffer: `queue.writeBuffer` is
 * not ordered against `submit` within a frame, so a buffer shared by two draws
 * feeds both the last write. Hence one buffer per downsample level, a SEPARATE
 * per-level set for upsample (both touch levels 1..3 with different texel
 * sizes), one per fold kind, per streak iteration and per veil axis.
 * Only upsample and the folds blend additively (they accumulate onto a level or
 * onto hdr); every other stage is its target's sole producer and overwrites it.
 */

import brightCode from '../shaders/bloom/bright.wesl?static';
import downsampleCode from '../shaders/bloom/downsample.wesl?static';
import upsampleCode from '../shaders/bloom/upsample.wesl?static';
import foldCode from '../shaders/bloom/fold.wesl?static';
import streakCode from '../shaders/bloom/streak.wesl?static';
import veilCode from '../shaders/bloom/veil.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';
import { ADDITIVE_BLEND } from '../lib/blendStates';
import type { BloomPyramid } from '../../../@types/rendering/BloomPyramid';
import type { BrightParams } from '../../../@types/rendering/BrightParams';
import type { FoldKind } from '../../../@types/rendering/FoldKind';
import type { StreakTaps } from '../../../@types/rendering/StreakTaps';
import type { Vec2 } from '../../../@types/math/Vec2';
import { BLOOM_LEVELS, FOLD_KINDS, VEIL_SIGMA_TEXELS } from '../../../data/bloomConstants';

/** Soft-threshold knee in the bright uniform's `u.y`; the shader does not read it yet. */
const BRIGHT_KNEE = 0.5;

export function createBloomPyramid(device: GPUDevice, hdrFormat: GPUTextureFormat): BloomPyramid {
  // Linear filtering lands the kernels' sub-texel taps; the default
  // clamp-to-edge is what the tent filter wants at the borders.
  const sampler = device.createSampler({
    label: 'bloomPyramid-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
  });

  // Every bloom shader binds sampler@0, texture@1, uniform@2, so one layout
  // serves all pipelines and any bind group binds on any of them.
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

  const pipelineFor = (stage: string, code: string, additive: boolean): GPURenderPipeline => {
    const module = createShaderModuleWithDevLog(device, code, `bloom.${stage}`);
    const target: GPUColorTargetState = additive
      ? { format: hdrFormat, blend: ADDITIVE_BLEND }
      : { format: hdrFormat };
    return device.createRenderPipeline({
      label: `bloomPyramid-${stage}-pipeline`,
      layout: pipelineLayout,
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint: 'fs', targets: [target] },
      primitive: { topology: 'triangle-list' },
    });
  };
  const brightPipeline = pipelineFor('bright', brightCode, false);
  const downsamplePipeline = pipelineFor('downsample', downsampleCode, false);
  const upsamplePipeline = pipelineFor('upsample', upsampleCode, true);
  const foldPipeline = pipelineFor('fold', foldCode, true);
  const streakPipeline = pipelineFor('streak', streakCode, false);
  const veilPipeline = pipelineFor('veil', veilCode, false);

  const uniformBuffer = (label: string, size: number): GPUBuffer =>
    device.createBuffer({
      label: `bloomPyramid-${label}-uniform`,
      size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  // Indexed by level; the slot each stage never uses (downsample's [0],
  // upsample's [4]) costs one 16-byte buffer.
  const levelBuffers = (stage: string): GPUBuffer[] =>
    Array.from({ length: BLOOM_LEVELS }, (_unused, level) => uniformBuffer(`${stage}${level}`, 16));
  const downTexelBufs = levelBuffers('down');
  const upTexelBufs = levelBuffers('up');
  const brightBuf = uniformBuffer('bright', 16);
  const foldBufs = Object.fromEntries(
    FOLD_KINDS.map((kind) => [kind, uniformBuffer(`fold-${kind}`, 16)]),
  ) as Record<FoldKind, GPUBuffer>;
  const streakBufs = [0, 1, 2].map((iteration) => uniformBuffer(`streak${iteration}`, 32));
  const veilBufs = { x: uniformBuffer('veil-x', 16), y: uniformBuffer('veil-y', 16) };

  // The bind group is rebuilt per draw: the source view is a `renderTargets`
  // row recreated on resize, so a cached one would bind a destroyed view.
  const draw = (
    pass: GPURenderPassEncoder,
    pipeline: GPURenderPipeline,
    srcView: GPUTextureView,
    uniform: GPUBuffer,
    data: number[],
  ): void => {
    device.queue.writeBuffer(uniform, 0, new Float32Array(data));
    pass.setPipeline(pipeline);
    pass.setBindGroup(
      0,
      device.createBindGroup({
        label: 'bloomPyramid-bg',
        layout: bindGroupLayout,
        entries: [
          { binding: 0, resource: sampler },
          { binding: 1, resource: srcView },
          { binding: 2, resource: { buffer: uniform } },
        ],
      }),
    );
    pass.draw(3, 1, 0, 0);
  };

  return {
    label: 'bloomPyramid',
    bright(pass, srcView, params: BrightParams): void {
      const { threshold, cap, capFloor } = params;
      draw(pass, brightPipeline, srcView, brightBuf, [threshold, BRIGHT_KNEE, cap, capFloor]);
    },
    downsample(pass, srcView, level, srcTexelSize, karis): void {
      const data = [srcTexelSize[0], srcTexelSize[1], karis ? 1 : 0, 0];
      draw(pass, downsamplePipeline, srcView, downTexelBufs[level]!, data);
    },
    upsample(pass, srcView, level, srcTexelSize): void {
      const data = [srcTexelSize[0], srcTexelSize[1], 0, 0];
      draw(pass, upsamplePipeline, srcView, upTexelBufs[level]!, data);
    },
    fold(pass, srcView, kind: FoldKind, strength): void {
      draw(pass, foldPipeline, srcView, foldBufs[kind], [strength, 0, 0, 0]);
    },
    streak(pass, srcView, iteration, taps: StreakTaps): void {
      const { texel, stride, threshold, falloff, tint } = taps;
      const data = [texel, stride, threshold, falloff, tint, 0, 0, 0];
      draw(pass, streakPipeline, srcView, streakBufs[iteration]!, data);
    },
    veil(pass, srcView, axis, srcTexelSize: Vec2): void {
      const step = axis === 'x' ? [srcTexelSize[0], 0] : [0, srcTexelSize[1]];
      draw(pass, veilPipeline, srcView, veilBufs[axis], [...step, VEIL_SIGMA_TEXELS, 0]);
    },
    destroy(): void {
      // Sampler, layout and pipelines are GC'd; only the buffers need releasing.
      const buffers = [
        ...downTexelBufs,
        ...upTexelBufs,
        brightBuf,
        ...Object.values(foldBufs),
        ...streakBufs,
        veilBufs.x,
        veilBufs.y,
      ];
      for (const buf of buffers) buf.destroy();
    },
  };
}
