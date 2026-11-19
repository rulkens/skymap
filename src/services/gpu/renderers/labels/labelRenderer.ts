/**
 * labelRenderer — MSDF text for one label director's `LabelRecords`: one instanced quad per
 * glyph, which reads its record (position, style, alpha) from a storage buffer by
 * `labelIndex`, so a glyph carries only its atlas rect (40 bytes). The style table is a
 * second storage buffer uploaded once. The fragment takes the median of the atlas's R/G/B
 * distances with an `fwidth` edge: crisp at any scale, so the atlas has no mipmaps (mip
 * filtering would blur the distances). Blend is premultiplied OVER, not additive: labels are
 * UI overlay and must occlude the sky. Two more pipeline pairs attenuate by the scene, one
 * per `OverlaySceneOcclusion` kind: group(1) is the sampled-depth joint, or one mask texture.
 */

import type { GpuContext } from '../../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { LabelRenderer } from '../../../../@types/rendering/LabelRenderer';
import type { LabelPipelines } from '../../../../@types/rendering/LabelPipelines';
import type { FontMetrics } from '../../../../@types/rendering/FontMetrics';
import type { LoadedFontAtlases } from '../../../../@types/rendering/LoadedFontAtlases';
import { FONT_IDS } from '../../../../data/fonts';
import vsCode from '../../shaders/labels/vertex.wesl?static';
import vsOccludeCode from '../../shaders/labels/vertexOcclude.wesl?static';
import fsCode from '../../shaders/labels/fragment.wesl?static';
import fsOccludeCode from '../../shaders/labels/fragmentOcclude.wesl?static';
import vsOccludeMaskCode from '../../shaders/labels/vertexOccludeMask.wesl?static';
import fsOccludeMaskCode from '../../shaders/labels/fragmentOccludeMask.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import type { OverlaySceneOcclusion } from '../../../../@types/rendering/OverlaySceneOcclusion';
import {
  OCCLUSION_COVERAGE_GROUP_INDEX,
  OCCLUSION_COVERAGE_LAYOUT_DESC,
  createOcclusionCoverageBindGroup,
  createOcclusionDepthFrameBuffer,
  writeOcclusionDepthFrame,
} from './occlusionCoverageGroup';
import { writeOutputProjection } from '../../lib/outputProjectionUniform';
import { UNIT_QUAD_STRIP_CORNERS, UNIT_QUAD_VERTEX_LAYOUT } from '../../lib/unitQuad';
import { PREMULTIPLIED_OVER_BLEND } from '../../lib/blendStates';
import { GLYPH_INSTANCE_BYTES } from '../../../../data/labels/glyphInstanceBytes';
import type { LabelRecords } from '../../../../@types/rendering/LabelRecords';
import type { LabelRecordView } from '../../../../@types/rendering/LabelRecordView';
import { LABEL_RECORD, LABEL_RECORD_WORDS } from '../../../../data/labels/labelRecordLayout';
import {
  LABEL_RECORD_UNIFORM_BYTES,
  LABEL_RECORD_UNIFORM_OFFSETS as RU,
} from '../../../../data/labels/labelRecordUniformLayout';
import { LABEL_TEXT_PX } from '../../../../data/labels/labelTextPx';
import { LABEL_EM_PX_RETUNE } from '../../../../data/labels/labelSizingDefaults';
import {
  HOVERED_LABEL_WHITEN,
  SELECTED_LABEL_WHITEN,
} from '../../../../data/labels/labelHighlightWhiten';
import { packLabelStyleTable } from '../../../../utils/labels/packLabelStyleTable';

/**
 * `targetFormat` is passed explicitly rather than read off `ctx.format`, so the target is
 * legible at the construction site. Labels are a post-tone-map overlay: the swap format.
 */
export function createLabelRenderer(
  ctx: GpuContext,
  init: {
    targetFormat: GPUTextureFormat;
    atlases: LoadedFontAtlases;
  },
): LabelRenderer {
  const { targetFormat, atlases } = init;
  const device = ctx.device;

  // Every atlas layer has the same size (buildFontAtlas asserts it), so the first font's
  // metrics size the texture.
  const firstMetrics: FontMetrics = atlases.metricsByFont[FONT_IDS[0]!];

  // Group 0: uniforms and records for the vertex stage, the atlas (2, 3, read by
  // lib/msdf.wesl), and the style table at 4. The mask fragment reads the uniforms too:
  // the output size maps its px onto a mask of another size.
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'label-bgl',
    entries: [
      {
        binding: 0,
        visibility: GPUShaderStage.VERTEX | GPUShaderStage.FRAGMENT,
        buffer: { type: 'uniform' },
      },
      { binding: 1, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '2d-array' },
      },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      { binding: 4, visibility: GPUShaderStage.VERTEX, buffer: { type: 'read-only-storage' } },
    ],
  });

  // The coverage BGL is retained so `draw` can rebuild its bind group per frame (the colour
  // view changes on every resize — see occlusionCoverageGroup.ts).
  const occlusionCoverageBGL = device.createBindGroupLayout(OCCLUSION_COVERAGE_LAYOUT_DESC);
  const occlusionDepthFrameBuffer = createOcclusionDepthFrameBuffer(device, 'label-depth-frame');
  const vertexBuffers: GPUVertexBufferLayout[] = [
    UNIT_QUAD_VERTEX_LAYOUT,
    {
      arrayStride: GLYPH_INSTANCE_BYTES,
      stepMode: 'instance',
      attributes: [
        { shaderLocation: 1, offset: 0, format: 'float32x2' }, // localOffset
        { shaderLocation: 2, offset: 8, format: 'float32x2' }, // localSize
        { shaderLocation: 3, offset: 16, format: 'float32x4' }, // uvRect
        { shaderLocation: 4, offset: 32, format: 'uint32' }, // labelIndex
        { shaderLocation: 5, offset: 36, format: 'uint32' }, // fontIndex
      ],
    },
  ];
  const colorTargets: GPUColorTargetState[] = [
    { format: targetFormat, blend: PREMULTIPLIED_OVER_BLEND },
  ];

  // A pair is the glyphs plus the leaders: the same modules and layout, one leader instance per
  // record instead of one per glyph. No depthStencil: labels are a pure UI overlay.
  function pipelinePair(
    label: string,
    layout: GPUPipelineLayout,
    vs: { module: GPUShaderModule; glyphs: string; leaders: string },
    fs: { module: GPUShaderModule; glyphs: string; leaders: string },
  ): LabelPipelines {
    const pipeline = (entry: 'glyphs' | 'leaders', buffers: GPUVertexBufferLayout[]) =>
      device.createRenderPipeline({
        label: `${label}-${entry}`,
        layout,
        vertex: { module: vs.module, entryPoint: vs[entry], buffers },
        fragment: { module: fs.module, entryPoint: fs[entry], targets: colorTargets },
        primitive: { topology: 'triangle-strip' },
      });
    return {
      glyphs: pipeline('glyphs', vertexBuffers),
      leaders: pipeline('leaders', [UNIT_QUAD_VERTEX_LAYOUT]),
    };
  }

  // Picked per draw from the occlusion value handed over: a frame in which no foreground
  // body drew has none, and still paints its labels through a valid plain draw rather than
  // an occlusion draw with group(1) unbound.
  const plainPipelines = pipelinePair(
    'label-pipeline',
    device.createPipelineLayout({
      label: 'label-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    {
      module: createShaderModuleWithDevLog(device, vsCode, 'labels.vertex'),
      glyphs: 'vs',
      leaders: 'vsLeader',
    },
    {
      module: createShaderModuleWithDevLog(device, fsCode, 'labels.fragment'),
      glyphs: 'fs',
      leaders: 'fsLeader',
    },
  );
  const occludePipelines = pipelinePair(
    'label-pipeline-occlude',
    device.createPipelineLayout({
      label: 'label-pipeline-occlude-layout',
      bindGroupLayouts: [bindGroupLayout, occlusionCoverageBGL],
    }),
    {
      module: createShaderModuleWithDevLog(device, vsOccludeCode, 'labels.vertexOcclude'),
      glyphs: 'vsOcclude',
      leaders: 'vsLeaderOcclude',
    },
    {
      module: createShaderModuleWithDevLog(device, fsOccludeCode, 'labels.fragmentOcclude'),
      glyphs: 'fs',
      leaders: 'fsLeaderOcclude',
    },
  );
  // The mask pair is built on its first draw: only the dome hands a mask over, and mono
  // would otherwise carry two shader modules and two pipelines it never uses. Its whole
  // group(1) (`lib/occlusionMask.wesl`) is one 32-bit float texture read by `textureLoad`,
  // in the vertex stage for the verdict and the fragment for coverage.
  let mask: { layout: GPUBindGroupLayout; pipelines: LabelPipelines } | null = null;
  function maskPair(): { layout: GPUBindGroupLayout; pipelines: LabelPipelines } {
    if (mask) return mask;
    const layout = device.createBindGroupLayout({
      label: 'label-occlusion-mask-bgl',
      entries: [
        {
          binding: 0,
          visibility: GPUShaderStage.FRAGMENT | GPUShaderStage.VERTEX,
          texture: { sampleType: 'unfilterable-float' },
        },
      ],
    });
    const pipelines = pipelinePair(
      'label-pipeline-occlude-mask',
      device.createPipelineLayout({
        label: 'label-pipeline-occlude-mask-layout',
        bindGroupLayouts: [bindGroupLayout, layout],
      }),
      {
        module: createShaderModuleWithDevLog(device, vsOccludeMaskCode, 'labels.vertexOccludeMask'),
        glyphs: 'vsOccludeMask',
        leaders: 'vsLeaderOccludeMask',
      },
      {
        module: createShaderModuleWithDevLog(
          device,
          fsOccludeMaskCode,
          'labels.fragmentOccludeMask',
        ),
        glyphs: 'fs',
        leaders: 'fsLeaderOccludeMask',
      },
    );
    mask = { layout, pipelines };
    return mask;
  }

  const cornerBuffer = device.createBuffer({
    label: 'label-corners',
    size: UNIT_QUAD_STRIP_CORNERS.byteLength,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(cornerBuffer, 0, UNIT_QUAD_STRIP_CORNERS);

  // One 2D-array texture, a layer per FONT_IDS entry. RENDER_ATTACHMENT is required by
  // `copyExternalImageToTexture` on some platforms.
  const atlasTexture = device.createTexture({
    label: 'label-atlas',
    size: [firstMetrics.atlas.width, firstMetrics.atlas.height, FONT_IDS.length],
    format: 'rgba8unorm',
    usage:
      GPUTextureUsage.TEXTURE_BINDING |
      GPUTextureUsage.COPY_DST |
      GPUTextureUsage.RENDER_ATTACHMENT,
  });
  for (let i = 0; i < atlases.bitmaps.length; i++) {
    const bitmap = atlases.bitmaps[i];
    if (bitmap == null) continue;
    device.queue.copyExternalImageToTexture(
      { source: bitmap },
      { texture: atlasTexture, origin: { x: 0, y: 0, z: i } },
      [firstMetrics.atlas.width, firstMetrics.atlas.height],
    );
  }
  const sampler = device.createSampler({
    label: 'label-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const uniformBuffer = device.createBuffer({
    label: 'label-uniforms',
    size: LABEL_RECORD_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const uniformF32 = new Float32Array(LABEL_RECORD_UNIFORM_BYTES / 4);
  const uniformU32 = new Uint32Array(uniformF32.buffer);
  const styleTable = packLabelStyleTable();
  const styleBuffer = device.createBuffer({
    label: 'label-styles',
    size: styleTable.byteLength,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(styleBuffer, 0, styleTable);
  // Sized to the records' fixed capacity on first sight; a rebuilt renderer uploads them whole.
  let uploadedRecords: LabelRecords | null = null;
  let uploadedGeneration = -1;
  let recordBuffer: GPUBuffer | null = null;
  let glyphBuffer: GPUBuffer | null = null;
  let bindGroup: GPUBindGroup | null = null;
  let recordCount = 0;
  let glyphCount = 0;

  function allocate(records: LabelRecords): void {
    recordBuffer?.destroy();
    glyphBuffer?.destroy();
    recordBuffer = device.createBuffer({
      label: 'label-records',
      size: records.f32.byteLength,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    glyphBuffer = device.createBuffer({
      label: 'label-glyphs',
      size: records.glyphF32.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    bindGroup = device.createBindGroup({
      label: 'label-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: recordBuffer } },
        { binding: 2, resource: atlasTexture.createView({ dimension: '2d-array' }) },
        { binding: 3, resource: sampler },
        { binding: 4, resource: { buffer: styleBuffer } },
      ],
    });
    uploadedRecords = records;
    uploadedGeneration = -1;
  }

  /** Uploads the records' dirty word range, and every glyph after a re-encode; the caller clears the range. */
  function set(records: LabelRecords): void {
    const fresh = records !== uploadedRecords;
    if (fresh) allocate(records);
    recordCount = records.count;
    const last = (records.count - 1) * LABEL_RECORD_WORDS;
    glyphCount =
      records.count === 0
        ? 0
        : records.u32[last + LABEL_RECORD.glyphs]! + records.u32[last + LABEL_RECORD.glyphCount]!;
    if (records.generation !== uploadedGeneration && glyphCount > 0) {
      device.queue.writeBuffer(
        glyphBuffer!,
        0,
        records.glyphF32,
        0,
        (glyphCount * GLYPH_INSTANCE_BYTES) / 4,
      );
    }
    uploadedGeneration = records.generation;
    const from = fresh ? 0 : records.dirtyFrom;
    const to = fresh ? records.count : Math.min(records.dirtyTo, records.count);
    if (to > from) {
      device.queue.writeBuffer(
        recordBuffer!,
        from * LABEL_RECORD_WORDS * 4,
        records.f32,
        from * LABEL_RECORD_WORDS,
        (to - from) * LABEL_RECORD_WORDS,
      );
    }
  }

  /** Binds group(1) for the occlusion handed over and returns the pair that reads it. */
  function bindScene(
    pass: GPURenderPassEncoder,
    scene: OverlaySceneOcclusion | undefined,
    sizePx: readonly [number, number],
  ): LabelPipelines {
    if (!scene) return plainPipelines;
    if (scene.kind === 'mask') {
      const { layout, pipelines } = maskPair();
      // Rebuilt per draw, as the coverage group is: `reconcile()` replaces the view.
      pass.setBindGroup(
        OCCLUSION_COVERAGE_GROUP_INDEX,
        device.createBindGroup({
          label: 'label-occlusion-mask-bg',
          layout,
          entries: [{ binding: 0, resource: scene.maskView }],
        }),
      );
      return pipelines;
    }
    writeOcclusionDepthFrame(device, occlusionDepthFrameBuffer, scene.frame, sizePx);
    pass.setBindGroup(
      OCCLUSION_COVERAGE_GROUP_INDEX,
      createOcclusionCoverageBindGroup(
        device,
        occlusionCoverageBGL,
        scene,
        occlusionDepthFrameBuffer,
      ),
    );
    return occludePipelines;
  }

  function draw(
    pass: GPURenderPassEncoder,
    view: LabelRecordView,
    scene?: OverlaySceneOcclusion,
  ): void {
    if (!bindGroup || !glyphBuffer || recordCount === 0) return;
    const { projection } = view;
    writeOutputProjection(uniformF32, RU.output / 4, projection);
    uniformU32[RU.hoveredPick / 4] = view.hoveredPick ?? 0;
    uniformU32[RU.selectedPick / 4] = view.selectedPick ?? 0;
    uniformF32[RU.minTextPx / 4] = LABEL_TEXT_PX.min * projection.pxScale;
    uniformF32[RU.maxTextPx / 4] = LABEL_TEXT_PX.max * projection.pxScale;
    uniformF32[RU.emRetune / 4] = LABEL_EM_PX_RETUNE;
    uniformF32[RU.hoveredWhiten / 4] = HOVERED_LABEL_WHITEN;
    uniformF32[RU.selectedWhiten / 4] = SELECTED_LABEL_WHITEN;
    device.queue.writeBuffer(uniformBuffer, 0, uniformF32);

    const pipelines = bindScene(pass, scene, projection.sizePx);
    // Leaders first, so the glyphs composite over the line where they meet; the shader
    // collapses the quad of a record without one.
    pass.setPipeline(pipelines.leaders);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, cornerBuffer);
    pass.draw(4, recordCount, 0, 0);
    if (glyphCount === 0) return;
    pass.setPipeline(pipelines.glyphs);
    pass.setVertexBuffer(1, glyphBuffer);
    pass.draw(4, glyphCount, 0, 0);
  }

  function destroy(): void {
    cornerBuffer.destroy();
    atlasTexture.destroy();
    occlusionDepthFrameBuffer.destroy();
    uniformBuffer.destroy();
    styleBuffer.destroy();
    recordBuffer?.destroy();
    glyphBuffer?.destroy();
  }

  const renderer: LabelRenderer = { label: 'labelRenderer', set, draw, destroy };
  renderer satisfies Renderer;
  return renderer;
}
