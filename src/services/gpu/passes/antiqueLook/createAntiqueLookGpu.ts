/**
 * createAntiqueLookGpu — the look's seven pipelines (full-screen paper bake,
 * reduce, glow, peaks and plate; instanced glyphs and decor) with their
 * bind-group layouts, and its fixed uniform buffers. Binding order is each
 * shader's `@binding` order. Target formats must match `antiqueLookTargetRows`.
 */

import vsCode from '../../shaders/antiqueLook/vertex.wesl?static';
import paperCode from '../../shaders/antiqueLook/paperBake.wesl?static';
import reduceCode from '../../shaders/antiqueLook/reduce.wesl?static';
import glowCode from '../../shaders/antiqueLook/glow.wesl?static';
import peaksCode from '../../shaders/antiqueLook/peaks.wesl?static';
import glyphsCode from '../../shaders/antiqueLook/glyphs.wesl?static';
import decorCode from '../../shaders/antiqueLook/decor.wesl?static';
import plateCode from '../../shaders/antiqueLook/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import {
  ANTIQUE_GLYPH_BYTES,
  ANTIQUE_ORNAMENT_BYTES,
  ANTIQUE_UNIFORM_BYTES,
} from '../../../../data/rendering/antiqueLook';
import { HDR_TARGET_FORMAT } from '../../../../data/renderTargetFormats';
import type { AntiqueLookGpu } from '../../../../@types/rendering/AntiqueLookGpu';

const TEXTURE = { texture: { sampleType: 'float' } } as const;
const UNIFORM = { buffer: { type: 'uniform' } } as const;
const SAMPLER = { sampler: { type: 'filtering' } } as const;

export function createAntiqueLookGpu(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
): AntiqueLookGpu {
  const vertex = {
    module: createShaderModuleWithDevLog(device, vsCode, 'antiqueLook.vertex'),
    entryPoint: 'vs',
  };

  const stage = (
    label: string,
    code: string,
    bindings: readonly Omit<GPUBindGroupLayoutEntry, 'binding' | 'visibility'>[],
    formats: readonly GPUTextureFormat[],
  ): { pipeline: GPURenderPipeline; layout: GPUBindGroupLayout } => {
    const layout = device.createBindGroupLayout({
      label: `antique-look-${label}-bgl`,
      entries: bindings.map((entry, binding) => ({
        ...entry,
        binding,
        visibility: GPUShaderStage.FRAGMENT,
      })),
    });
    const pipeline = device.createRenderPipeline({
      label: `antique-look-${label}`,
      layout: device.createPipelineLayout({
        label: `antique-look-${label}-layout`,
        bindGroupLayouts: [layout],
      }),
      vertex,
      fragment: {
        module: createShaderModuleWithDevLog(device, code, `antiqueLook.${label}`),
        entryPoint: 'fs',
        targets: formats.map((format) => ({ format })),
      },
      primitive: { topology: 'triangle-list' },
    });
    return { pipeline, layout };
  };

  const buffer = (label: string, size: number): GPUBuffer =>
    device.createBuffer({
      label: `antique-look-${label}`,
      size,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
  const sampler = (label: string, mode: GPUAddressMode): GPUSampler =>
    device.createSampler({
      label: `antique-look-${label}`,
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: mode,
      addressModeV: mode,
    });
  const emptyTexture = device.createTexture({
    label: 'antique-look-empty',
    size: [1, 1],
    format: 'rgba8unorm',
    usage: GPUTextureUsage.TEXTURE_BINDING,
  });

  const uniforms = buffer('uniforms', ANTIQUE_UNIFORM_BYTES);
  const ornaments = buffer('ornaments', ANTIQUE_ORNAMENT_BYTES);
  const digits = buffer('digits', ANTIQUE_GLYPH_BYTES);
  // Star glyphs scatter: their own vertex stage, a strip per instance, MAX blend
  // so overlapping glyphs and halos keep the stronger, never sum.
  const glyphsModule = createShaderModuleWithDevLog(device, glyphsCode, 'antiqueLook.glyphs');
  const glyphsLayout = device.createBindGroupLayout({
    label: 'antique-look-glyphs-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, ...TEXTURE },
      { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, ...UNIFORM },
    ],
  });
  const max: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'max' };
  const glyphsPipeline = device.createRenderPipeline({
    label: 'antique-look-glyphs',
    layout: device.createPipelineLayout({
      label: 'antique-look-glyphs-layout',
      bindGroupLayouts: [glyphsLayout],
    }),
    vertex: { module: glyphsModule, entryPoint: 'vs' },
    fragment: {
      module: glyphsModule,
      entryPoint: 'fs',
      targets: [{ format: 'rgba8unorm', blend: { color: max, alpha: max } }],
    },
    primitive: { topology: 'triangle-strip' },
  });
  const decorModule = createShaderModuleWithDevLog(device, decorCode, 'antiqueLook.decor');
  const both = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
  const decorLayout = device.createBindGroupLayout({
    label: 'antique-look-decor-bgl',
    entries: [
      { binding: 0, visibility: both, ...UNIFORM },
      { binding: 1, visibility: both, ...UNIFORM },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, ...TEXTURE },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, ...SAMPLER },
    ],
  });
  const decorPipeline = device.createRenderPipeline({
    label: 'antique-look-decor',
    layout: device.createPipelineLayout({
      label: 'antique-look-decor-layout',
      bindGroupLayouts: [decorLayout],
    }),
    vertex: { module: decorModule, entryPoint: 'vs' },
    fragment: {
      module: decorModule,
      entryPoint: 'fs',
      targets: [
        { format: 'rgba8unorm', blend: { color: max, alpha: max } },
        { format: 'rgba8unorm', blend: { color: max, alpha: max } },
      ],
    },
    primitive: { topology: 'triangle-strip' },
  });

  return {
    paper: stage('paper', paperCode, [UNIFORM, TEXTURE, TEXTURE, SAMPLER], ['rgba8unorm']),
    reduce: stage(
      'reduce',
      reduceCode,
      [TEXTURE, TEXTURE, TEXTURE],
      [HDR_TARGET_FORMAT, HDR_TARGET_FORMAT],
    ),
    glow: stage('glow', glowCode, [TEXTURE], [HDR_TARGET_FORMAT]),
    peaks: stage('peaks', peaksCode, [TEXTURE, UNIFORM], [HDR_TARGET_FORMAT]),
    plate: stage(
      'plate',
      plateCode,
      [
        TEXTURE, // print
        TEXTURE, // overlay
        TEXTURE, // foreground:0
        UNIFORM,
        TEXTURE, // paper
        TEXTURE, // wash
        TEXTURE, // star ink
        SAMPLER,
        TEXTURE, // glow
        TEXTURE, // decor
        TEXTURE, // decor hue
        UNIFORM, // border digits
        TEXTURE, // glyph sheet
      ],
      [targetFormat],
    ),
    uniforms,
    ornaments,
    glyphs: { pipeline: glyphsPipeline, layout: glyphsLayout },
    decor: { pipeline: decorPipeline, layout: decorLayout },
    digits,
    clampSampler: sampler('clamp', 'clamp-to-edge'),
    repeatSampler: sampler('repeat', 'repeat'),
    empty: emptyTexture.createView(),
    destroy() {
      uniforms.destroy();
      ornaments.destroy();
      digits.destroy();
      emptyTexture.destroy();
    },
  };
}
