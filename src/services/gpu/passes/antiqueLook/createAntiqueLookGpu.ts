/**
 * createAntiqueLookGpu — the look's pipelines (full-screen paper bake, mask,
 * reduce, glow, nebula, the land blur's two halves and plate; instanced glyphs and
 * decor; the sky-floor compute) with their bind-group layouts, and its fixed buffers. Binding order is each
 * shader's `@binding` order. Target formats must match `antiqueLookTargetRows`.
 */

import vsCode from '../../shaders/antiqueLook/vertex.wesl?static';
import paperCode from '../../shaders/antiqueLook/passes/paperBakeFragment.wesl?static';
import maskCode from '../../shaders/antiqueLook/passes/maskFragment.wesl?static';
import reduceCode from '../../shaders/antiqueLook/passes/reduceFragment.wesl?static';
import glowCode from '../../shaders/antiqueLook/passes/glowFragment.wesl?static';
import nebulaCode from '../../shaders/antiqueLook/passes/nebulaFragment.wesl?static';
import skyFloorCode from '../../shaders/antiqueLook/passes/skyFloor.wesl?static';
import structureGlowCode from '../../shaders/antiqueLook/passes/structureGlowFragment.wesl?static';
import glyphsVsCode from '../../shaders/antiqueLook/glyphs/vertex.wesl?static';
import glyphsFsCode from '../../shaders/antiqueLook/glyphs/fragment.wesl?static';
import bodySignsVsCode from '../../shaders/antiqueLook/bodySigns/vertex.wesl?static';
import bodySignsFsCode from '../../shaders/antiqueLook/bodySigns/fragment.wesl?static';
import decorVsCode from '../../shaders/antiqueLook/decor/vertex.wesl?static';
import decorFsCode from '../../shaders/antiqueLook/decor/fragment.wesl?static';
import plateCode from '../../shaders/antiqueLook/passes/plateFragment.wesl?static';
import landBlurCode from '../../shaders/antiqueLook/passes/landBlurFragment.wesl?static';
import reliefCode from '../../shaders/antiqueLook/passes/reliefFragment.wesl?static';
import webCode from '../../shaders/antiqueLook/passes/webFragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import {
  ANTIQUE_GLYPH_BYTES,
  ANTIQUE_SIGN_BYTES,
  ANTIQUE_ORNAMENT_BYTES,
  ANTIQUE_SKY_FLOOR_BYTES,
  ANTIQUE_MASK_DEPTH_BYTES,
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
// foreground:0's colour and its depth32float (`passes/maskFragment.wesl`), read with `textureLoad`.
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
  const signs = device.createBuffer({
    label: 'antique-look-signs',
    size: ANTIQUE_SIGN_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const plateBodies = buffer('plate-bodies', ANTIQUE_PLATE_BODIES_BYTES);
  const maskDepth = buffer('mask-depth', ANTIQUE_MASK_DEPTH_BYTES);
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
      { binding: 2, visibility: GPUShaderStage.COMPUTE, ...TEXTURE },
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
  const glyphsVs = createShaderModuleWithDevLog(device, glyphsVsCode, 'antiqueLook.glyphs.vertex');
  const glyphsFs = createShaderModuleWithDevLog(
    device,
    glyphsFsCode,
    'antiqueLook.glyphs.fragment',
  );
  const glyphsLayout = device.createBindGroupLayout({
    label: 'antique-look-glyphs-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, ...TEXTURE },
      { binding: 1, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, ...UNIFORM },
      { binding: 2, visibility: GPUShaderStage.VERTEX, ...TEXTURE },
      { binding: 3, visibility: GPUShaderStage.VERTEX, ...ARRAY },
      { binding: 4, visibility: GPUShaderStage.VERTEX, ...STORAGE },
    ],
  });
  const max: GPUBlendComponent = { srcFactor: 'one', dstFactor: 'one', operation: 'max' };
  const glyphsPipeline = device.createRenderPipeline({
    label: 'antique-look-glyphs',
    layout: device.createPipelineLayout({
      label: 'antique-look-glyphs-layout',
      bindGroupLayouts: [glyphsLayout],
    }),
    vertex: { module: glyphsVs, entryPoint: 'vs' },
    fragment: {
      module: glyphsFs,
      entryPoint: 'fs',
      targets: [{ format: 'rgba8unorm', blend: { color: max, alpha: max } }],
    },
    primitive: { topology: 'triangle-strip' },
  });
  // Body signs ride the glyphs' pass and target: a ring and dot per named body below a globe.
  const signsVs = createShaderModuleWithDevLog(
    device,
    bodySignsVsCode,
    'antiqueLook.bodySigns.vertex',
  );
  const signsFs = createShaderModuleWithDevLog(
    device,
    bodySignsFsCode,
    'antiqueLook.bodySigns.fragment',
  );
  const signsLayout = device.createBindGroupLayout({
    label: 'antique-look-signs-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT, ...UNIFORM },
      { binding: 1, visibility: GPUShaderStage.VERTEX, ...STORAGE },
      { binding: 2, visibility: GPUShaderStage.VERTEX, ...TEXTURE },
    ],
  });
  const signsPipeline = device.createRenderPipeline({
    label: 'antique-look-signs',
    layout: device.createPipelineLayout({
      label: 'antique-look-signs-layout',
      bindGroupLayouts: [signsLayout],
    }),
    vertex: { module: signsVs, entryPoint: 'vs' },
    fragment: {
      module: signsFs,
      entryPoint: 'fs',
      targets: [{ format: 'rgba8unorm', blend: { color: max, alpha: max } }],
    },
    primitive: { topology: 'triangle-strip' },
  });
  // The web chart rides the glyphs' pass and target, max-blended into the b and a they leave 0.
  const web = stage('web', webCode, [TEXTURE, SAMPLER, UNIFORM], [], 'fs', [
    { format: 'rgba8unorm', blend: { color: max, alpha: max } },
  ]);
  const webLevel = stage(
    'web-level',
    webCode,
    [TEXTURE, SAMPLER, UNIFORM],
    [HDR_TARGET_FORMAT],
    'fsLevel',
  );
  const decorVs = createShaderModuleWithDevLog(device, decorVsCode, 'antiqueLook.decor.vertex');
  const decorFs = createShaderModuleWithDevLog(device, decorFsCode, 'antiqueLook.decor.fragment');
  const both = GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT;
  const decorLayout = device.createBindGroupLayout({
    label: 'antique-look-decor-bgl',
    entries: [
      { binding: 0, visibility: both, ...UNIFORM },
      { binding: 1, visibility: both, ...UNIFORM },
      { binding: 2, visibility: GPUShaderStage.FRAGMENT, ...TEXTURE },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, ...SAMPLER },
      { binding: 4, visibility: GPUShaderStage.FRAGMENT, ...TEXTURE },
    ],
  });
  const decorPipeline = device.createRenderPipeline({
    label: 'antique-look-decor',
    layout: device.createPipelineLayout({
      label: 'antique-look-decor-layout',
      bindGroupLayouts: [decorLayout],
    }),
    vertex: { module: decorVs, entryPoint: 'vs' },
    fragment: {
      module: decorFs,
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
    mask: stage(
      'mask',
      maskCode,
      [COVER, COVER, TEXTURE, UNIFORM, UNIFORM, UNIFORM],
      ['rgba8unorm'],
    ),
    reduce: stage('reduce', reduceCode, [TEXTURE, TEXTURE], [HDR_TARGET_FORMAT]),
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
    relief: stage('relief', reliefCode, [COVER, UNIFORM, TEXTURE], [ANTIQUE_RELIEF_FORMAT]),
    reliefUniforms,
    uniforms,
    ornaments,
    glyphs: { pipeline: glyphsPipeline, layout: glyphsLayout },
    signs: { pipeline: signsPipeline, layout: signsLayout, buffer: signs },
    web,
    webLevel,
    decor: { pipeline: decorPipeline, layout: decorLayout },
    digits,
    plateBodies,
    maskDepth,
    skyFloorBuffer,
    clampSampler: sampler('clamp', 'clamp-to-edge'),
    repeatSampler: sampler('repeat', 'repeat'),
    empty: emptyTexture.createView(),
    destroy() {
      uniforms.destroy();
      ornaments.destroy();
      digits.destroy();
      signs.destroy();
      plateBodies.destroy();
      maskDepth.destroy();
      reliefUniforms.destroy();
      skyFloorBuffer.destroy();
      emptyTexture.destroy();
    },
  };
}
