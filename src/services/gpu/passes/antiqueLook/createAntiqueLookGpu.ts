/**
 * createAntiqueLookGpu — the look's ten pipelines (full-screen paper bake,
 * reduce, glow, nebula, the land blur's two halves and plate; instanced glyphs and
 * decor; the sky-floor compute) with their bind-group layouts, and its fixed buffers. Binding order is each
 * shader's `@binding` order. Target formats must match `antiqueLookTargetRows`.
 */

import vsCode from '../../shaders/antiqueLook/vertex.wesl?static';
import paperCode from '../../shaders/antiqueLook/paperBake.wesl?static';
import reduceCode from '../../shaders/antiqueLook/reduce.wesl?static';
import glowCode from '../../shaders/antiqueLook/glow.wesl?static';
import nebulaCode from '../../shaders/antiqueLook/nebula.wesl?static';
import skyFloorCode from '../../shaders/antiqueLook/skyFloor.wesl?static';
import structureGlowCode from '../../shaders/antiqueLook/structureGlow.wesl?static';
import glyphsCode from '../../shaders/antiqueLook/glyphs.wesl?static';
import decorCode from '../../shaders/antiqueLook/decor.wesl?static';
import plateCode from '../../shaders/antiqueLook/fragment.wesl?static';
import landBlurCode from '../../shaders/antiqueLook/landBlur.wesl?static';
import reliefCode from '../../shaders/antiqueLook/relief.wesl?static';
import webCode from '../../shaders/antiqueLook/web.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import {
  ANTIQUE_GLYPH_BYTES,
  ANTIQUE_ORNAMENT_BYTES,
  ANTIQUE_SKY_FLOOR_BYTES,
  ANTIQUE_UNIFORM_BYTES,
} from '../../../../data/rendering/antiqueLook';
import { ANTIQUE_PLATE_BODIES_BYTES } from '../../../../data/rendering/antiquePlateBodies';
import {
  ANTIQUE_RELIEF_FORMAT,
  ANTIQUE_RELIEF_UNIFORM_BYTES,
} from '../../../../data/rendering/antiqueRelief';
import { HDR_TARGET_FORMAT } from '../../../../data/renderTargetFormats';
import type { AntiqueLookGpu } from '../../../../@types/rendering/AntiqueLookGpu';

const TEXTURE = { texture: { sampleType: 'float' } } as const;
// The plate's own rows, a layer each (`ANTIQUE_*_LAYERS`).
const ARRAY = { texture: { sampleType: 'float', viewDimension: '2d-array' } } as const;
const UNIFORM = { buffer: { type: 'uniform' } } as const;
const SAMPLER = { sampler: { type: 'filtering' } } as const;
const STORAGE = { buffer: { type: 'read-only-storage' } } as const;
// foreground:0's colour or, inside an atmosphere, its depth32float (`cover.wesl`):
// only a `textureLoad` layout takes both.
const COVER = { texture: { sampleType: 'unfilterable-float' } } as const;

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
    entryPoint = 'fs',
    targets: GPUColorTargetState[] = formats.map((format) => ({ format })),
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
        entryPoint,
        targets,
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
      mipmapFilter: 'linear', // only the ornament atlas has mips
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
  const plateBodies = buffer('plate-bodies', ANTIQUE_PLATE_BODIES_BYTES);
  const reliefUniforms = buffer('relief-uniforms', ANTIQUE_RELIEF_UNIFORM_BYTES);
  const skyFloorBuffer = device.createBuffer({
    label: 'antique-look-sky-floor',
    size: ANTIQUE_SKY_FLOOR_BYTES,
    usage: GPUBufferUsage.STORAGE,
  });
  const skyFloorLayout = device.createBindGroupLayout({
    label: 'antique-look-sky-floor-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.COMPUTE, ...TEXTURE },
      { binding: 1, visibility: GPUShaderStage.COMPUTE, buffer: { type: 'storage' } },
    ],
  });
  const skyFloorPipeline = device.createComputePipeline({
    label: 'antique-look-sky-floor',
    layout: device.createPipelineLayout({
      label: 'antique-look-sky-floor-layout',
      bindGroupLayouts: [skyFloorLayout],
    }),
    compute: {
      module: createShaderModuleWithDevLog(device, skyFloorCode, 'antiqueLook.skyFloor'),
      entryPoint: 'cs',
    },
  });
  // Star glyphs scatter: their own vertex stage, a strip per instance, MAX blend
  // so overlapping glyphs and halos keep the stronger, never sum.
  const glyphsModule = createShaderModuleWithDevLog(device, glyphsCode, 'antiqueLook.glyphs');
  const glyphsLayout = device.createBindGroupLayout({
    label: 'antique-look-glyphs-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, ...TEXTURE },
      { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, ...UNIFORM },
      { binding: 2, visibility: GPUShaderStage.VERTEX, ...COVER },
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
  // The web chart rides the glyphs' pass and target, max-blended into the b and a they leave 0.
  const web = stage('web', webCode, [TEXTURE, SAMPLER, UNIFORM], [], 'fs', [
    { format: 'rgba8unorm', blend: { color: max, alpha: max } },
  ]);
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
      [TEXTURE, COVER, TEXTURE, UNIFORM],
      [HDR_TARGET_FORMAT],
    ),
    glow: stage('glow', glowCode, [TEXTURE], [HDR_TARGET_FORMAT]),
    nebula: stage('nebula', nebulaCode, [TEXTURE, SAMPLER], [HDR_TARGET_FORMAT]),
    structureGlow: stage(
      'structure-glow',
      structureGlowCode,
      [TEXTURE, SAMPLER],
      [HDR_TARGET_FORMAT],
    ),
    skyFloor: { pipeline: skyFloorPipeline, layout: skyFloorLayout },
    landBlurAcross: stage(
      'land-blur-across',
      landBlurCode,
      [TEXTURE, UNIFORM],
      ['rg16float'],
      'fsAcross',
    ),
    landBlurDown: stage(
      'land-blur-down',
      landBlurCode,
      [TEXTURE, UNIFORM],
      [HDR_TARGET_FORMAT], // a layer of antique-quarter
      'fsDown',
    ),
    plate: stage(
      'plate',
      plateCode,
      [
        TEXTURE, // print
        TEXTURE, // overlay
        COVER, // foreground:0
        UNIFORM,
        ARRAY, // antique-full
        ARRAY, // antique-quarter
        ARRAY, // antique-low
        SAMPLER,
        UNIFORM, // border digits
        TEXTURE, // glyph sheet
        TEXTURE, // constellation lines
        UNIFORM, // plate bodies
        STORAGE, // sky floor
        TEXTURE, // Earth's geography
        TEXTURE, // relief
      ],
      [targetFormat],
    ),
    relief: stage('relief', reliefCode, [COVER, UNIFORM], [ANTIQUE_RELIEF_FORMAT]),
    reliefUniforms,
    uniforms,
    ornaments,
    glyphs: { pipeline: glyphsPipeline, layout: glyphsLayout },
    web,
    decor: { pipeline: decorPipeline, layout: decorLayout },
    digits,
    plateBodies,
    skyFloorBuffer,
    clampSampler: sampler('clamp', 'clamp-to-edge'),
    repeatSampler: sampler('repeat', 'repeat'),
    empty: emptyTexture.createView(),
    destroy() {
      uniforms.destroy();
      ornaments.destroy();
      digits.destroy();
      plateBodies.destroy();
      reliefUniforms.destroy();
      skyFloorBuffer.destroy();
      emptyTexture.destroy();
    },
  };
}
