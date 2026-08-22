/**
 * label3DRenderer — the shared world-geometry text renderer (spec §9.1);
 * exceeds the usual header budget because the byte-layout table below IS
 * the CPU/WGSL shared contract (see comments.md's byte-layout exception).
 * Draws any number of arc-placed labels — each with its own center, plane,
 * radius, repeat count, and font — in one draw call, following
 * `labelRenderer`'s per-label-storage / per-glyph-instance buffer split and
 * its multi-font `texture_2d_array` atlas. Additive blend, single-band MSDF
 * fill (no outline) — see `shaders/labels3d/fragment.wesl`'s header for the
 * blend-mode landmine.
 *
 * ## Byte layouts
 *
 * `Label3DData` (80B, matches `labels3d/io.wesl`):
 *   0..15   center(12) + radiusMpc(4)
 *   16..31  planeNormal(12) + emMpc(4)
 *   32..47  referenceDir(12) + startAngleRad(4)
 *   48..63  color (premultiplied rgba)
 *   64..79  fadeAlpha(4) + repeatCount(4, u32) + 2 reserved f32 pads
 *
 * Per-glyph instance record (44B, matches `labels3d/io.wesl`'s `VsIn`):
 *   0..7    localOffset (atlas px)
 *   8..15   localSize   (atlas px)
 *   16..31  uvRect
 *   32..35  labelIndex  (u32)
 *   36..39  repeatIndex (u32)
 *   40..43  fontIndex   (u32)
 *
 * `localOffset`/`localSize` stay in atlas px — the vertex stage converts to
 * Mpc per-glyph via the label's `emMpc`, so each label carries its own
 * physical size and `setLabels` can rebuild the whole set every frame.
 */

import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { Label3D } from '../../../../@types/rendering/Label3D';
import type { Label3DRenderer } from '../../../../@types/rendering/Label3DRenderer';
import type { FontMetrics } from '../../../../@types/rendering/FontMetrics';
import type { LoadedFontAtlases } from '../../../../@types/rendering/LoadedFontAtlases';
import { FONT_IDS } from '../../../../data/fonts';
import type { FontId } from '../../../../@types/data/FontId';
import type { Vec2 } from '../../../../@types/math/Vec2';
import { layoutLabel } from '../../labelLayout/labelLayout';
import vsCode from '../../shaders/labels3d/vertex.wesl?static';
import fsCode from '../../shaders/labels3d/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import { CAMERA_UNIFORM_BYTES, writeCameraPrefix } from '../../lib/cameraUniforms';
import { UNIT_QUAD_STRIP_CORNERS, UNIT_QUAD_VERTEX_LAYOUT } from '../../lib/unitQuad';
import { ADDITIVE_BLEND } from '../../lib/blendStates';

/** Per-label storage-buffer stride — see the module header's byte table. */
const LABEL3D_DATA_BYTES = 80;

/** Per-glyph instance-buffer stride — see the module header's byte table. */
const LABEL3D_GLYPH_INSTANCE_BYTES = 44;

const CORNER_BYTES = UNIT_QUAD_STRIP_CORNERS.byteLength;

export function createLabel3DRenderer(
  device: GPUDevice,
  targetFormat: GPUTextureFormat,
  atlases: LoadedFontAtlases,
  maxLabels = 64,
  maxGlyphsPerLabel = 64,
): Label3DRenderer {
  const maxGlyphs = maxLabels * maxGlyphsPerLabel;
  const metricsByFont = atlases.metricsByFont;

  // FontId -> texture_2d_array layer index, built once (avoids an O(N)
  // FONT_IDS.indexOf per glyph — see labelRenderer.ts's identical lookup).
  const layerIndexOf: Readonly<Record<FontId, number>> = (() => {
    const lookup: Partial<Record<FontId, number>> = {};
    for (let i = 0; i < FONT_IDS.length; i++) {
      lookup[FONT_IDS[i]!] = i;
    }
    return lookup as Readonly<Record<FontId, number>>;
  })();

  const firstFontId = FONT_IDS[0]!;
  const firstMetrics: FontMetrics = metricsByFont[firstFontId];

  // Shared ArrayBuffers so f32 fields and u32 fields (labelIndex,
  // repeatIndex, fontIndex, repeatCount) write into the same memory
  // without a copy — mirrors labelRenderer.ts's glyphBuf/glyphU32 split.
  const labelBuf = new ArrayBuffer(maxLabels * LABEL3D_DATA_BYTES);
  const labelF32 = new Float32Array(labelBuf);
  const labelU32 = new Uint32Array(labelBuf);
  const glyphBuf = new ArrayBuffer(maxGlyphs * LABEL3D_GLYPH_INSTANCE_BYTES);
  const glyphF32 = new Float32Array(glyphBuf);
  const glyphU32 = new Uint32Array(glyphBuf);

  let currentGlyphCount = 0;
  let currentLabelCount = 0;

  // ── Bind group layout ──────────────────────────────────────────────────
  // 0: uniform (CameraUniforms, vertex); 1: read-only storage (Label3DData[],
  // vertex); 2/3: atlas texture_2d_array + sampler (fragment) — same
  // bindings labelRenderer's BGL uses, which is what lets fragment.wesl
  // `import package::lib::msdf::shadeMsdf` instead of copying median3.
  const bindGroupLayout = device.createBindGroupLayout({
    label: 'label3d-bgl',
    entries: [
      { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
      {
        binding: 1,
        visibility: GPUShaderStage.VERTEX,
        buffer: { type: 'read-only-storage' },
      },
      {
        binding: 2,
        visibility: GPUShaderStage.FRAGMENT,
        texture: { sampleType: 'float', viewDimension: '2d-array' },
      },
      { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
    ],
  });

  const vsModule = createShaderModuleWithDevLog(device, vsCode, 'labels3d.vertex');
  const fsModule = createShaderModuleWithDevLog(device, fsCode, 'labels3d.fragment');

  const pipeline = device.createRenderPipeline({
    label: 'label3d-pipeline',
    layout: device.createPipelineLayout({
      label: 'label3d-pipeline-layout',
      bindGroupLayouts: [bindGroupLayout],
    }),
    vertex: {
      module: vsModule,
      entryPoint: 'vs',
      buffers: [
        UNIT_QUAD_VERTEX_LAYOUT,
        {
          arrayStride: LABEL3D_GLYPH_INSTANCE_BYTES,
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 1, offset: 0, format: 'float32x2' }, // localOffset
            { shaderLocation: 2, offset: 8, format: 'float32x2' }, // localSize
            { shaderLocation: 3, offset: 16, format: 'float32x4' }, // uvRect
            { shaderLocation: 4, offset: 32, format: 'uint32' }, // labelIndex
            { shaderLocation: 5, offset: 36, format: 'uint32' }, // repeatIndex
            { shaderLocation: 6, offset: 40, format: 'uint32' }, // fontIndex
          ],
        },
      ],
    },
    fragment: {
      module: fsModule,
      entryPoint: 'fs',
      // Additive, not premultiplied OVER — see fragment.wesl's header for
      // the Apple-Silicon HDR-target coherency landmine this avoids.
      targets: [{ format: targetFormat, blend: ADDITIVE_BLEND }],
    },
    primitive: { topology: 'triangle-strip' },
    // No depthStencil — world-geometry text, drawn depthless like the ZoA
    // band it generalizes.
  });

  const uniformBuffer = device.createBuffer({
    label: 'label3d-uniforms',
    size: CAMERA_UNIFORM_BYTES,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  });
  const storageBuffer = device.createBuffer({
    label: 'label3d-storage',
    size: maxLabels * LABEL3D_DATA_BYTES,
    usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
  });
  const instanceBuffer = device.createBuffer({
    label: 'label3d-instances',
    size: maxGlyphs * LABEL3D_GLYPH_INSTANCE_BYTES,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  const cornerBuffer = device.createBuffer({
    label: 'label3d-corners',
    size: CORNER_BYTES,
    usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
  });
  device.queue.writeBuffer(cornerBuffer, 0, UNIT_QUAD_STRIP_CORNERS);

  // Multi-font atlas: one texture_2d_array layer per registered font — the
  // ZoA path was hard-wired to FONT_IDS[0]; this renderer's per-glyph
  // fontIndex makes any font mix fall out for free (mirrors labelRenderer's
  // atlas upload loop).
  const atlasTexture = device.createTexture({
    label: 'label3d-atlas',
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
    label: 'label3d-sampler',
    magFilter: 'linear',
    minFilter: 'linear',
    addressModeU: 'clamp-to-edge',
    addressModeV: 'clamp-to-edge',
  });

  const bindGroup = device.createBindGroup({
    label: 'label3d-bg',
    layout: bindGroupLayout,
    entries: [
      { binding: 0, resource: { buffer: uniformBuffer } },
      { binding: 1, resource: { buffer: storageBuffer } },
      { binding: 2, resource: atlasTexture.createView({ dimension: '2d-array' }) },
      { binding: 3, resource: sampler },
    ],
  });

  function setLabels(labels: readonly Label3D[]): void {
    currentGlyphCount = 0;
    currentLabelCount = 0;

    const count = Math.min(labels.length, maxLabels);
    for (let li = 0; li < count; li++) {
      const label = labels[li]!;
      const p = label.placement;
      const quads = layoutLabel(label.text, metricsByFont[label.font], 'center', 'center');

      const base = li * (LABEL3D_DATA_BYTES / 4);
      labelF32[base + 0] = p.center[0];
      labelF32[base + 1] = p.center[1];
      labelF32[base + 2] = p.center[2];
      labelF32[base + 3] = p.radiusMpc;
      labelF32[base + 4] = p.planeNormal[0];
      labelF32[base + 5] = p.planeNormal[1];
      labelF32[base + 6] = p.planeNormal[2];
      labelF32[base + 7] = label.emMpc;
      labelF32[base + 8] = p.referenceDir[0];
      labelF32[base + 9] = p.referenceDir[1];
      labelF32[base + 10] = p.referenceDir[2];
      labelF32[base + 11] = p.startAngleRad;

      // Straight RGBA -> premultiplied at the write boundary, same
      // producer-facing convention as labelRenderer's Label2D.color.
      const ca = label.color[3];
      labelF32[base + 12] = label.color[0] * ca;
      labelF32[base + 13] = label.color[1] * ca;
      labelF32[base + 14] = label.color[2] * ca;
      labelF32[base + 15] = ca;

      labelF32[base + 16] = label.fadeAlpha ?? 1;
      labelU32[base + 17] = label.repeatCount;
      // base + 18/19: reserved pads, left at zero (ArrayBuffer zero-init).

      const fontIndex = layerIndexOf[label.font];

      for (let rep = 0; rep < label.repeatCount; rep++) {
        if (currentGlyphCount >= maxGlyphs) break;
        for (const q of quads) {
          if (currentGlyphCount >= maxGlyphs) break;
          const gBase = currentGlyphCount * (LABEL3D_GLYPH_INSTANCE_BYTES / 4);
          glyphF32[gBase + 0] = q.localOffsetX;
          glyphF32[gBase + 1] = q.localOffsetY;
          glyphF32[gBase + 2] = q.localSizeW;
          glyphF32[gBase + 3] = q.localSizeH;
          glyphF32[gBase + 4] = q.uvU0;
          glyphF32[gBase + 5] = q.uvV0;
          glyphF32[gBase + 6] = q.uvU1;
          glyphF32[gBase + 7] = q.uvV1;
          glyphU32[gBase + 8] = li;
          glyphU32[gBase + 9] = rep;
          glyphU32[gBase + 10] = fontIndex;
          currentGlyphCount++;
        }
      }

      currentLabelCount++;
    }

    // writeBuffer's dataOffset/size are ELEMENTS of the TypedArray passed
    // (not bytes) — pass the f32 views, not the raw ArrayBuffers, or the
    // upload silently truncates to a quarter of the intended byte range.
    if (currentLabelCount > 0) {
      device.queue.writeBuffer(
        storageBuffer,
        0,
        labelF32,
        0,
        (currentLabelCount * LABEL3D_DATA_BYTES) / 4,
      );
    }
    if (currentGlyphCount > 0) {
      device.queue.writeBuffer(
        instanceBuffer,
        0,
        glyphF32,
        0,
        currentGlyphCount * (LABEL3D_GLYPH_INSTANCE_BYTES / 4),
      );
    }
  }

  function draw(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportPx: Vec2): void {
    if (currentGlyphCount === 0) return;

    const uni = new Float32Array(CAMERA_UNIFORM_BYTES / 4);
    writeCameraPrefix(uni, viewProj, viewportPx);
    device.queue.writeBuffer(uniformBuffer, 0, uni);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    pass.setVertexBuffer(0, cornerBuffer);
    pass.setVertexBuffer(1, instanceBuffer);
    pass.draw(4, currentGlyphCount, 0, 0);
  }

  function glyphCount(): number {
    return currentGlyphCount;
  }

  function destroy(): void {
    uniformBuffer.destroy();
    storageBuffer.destroy();
    instanceBuffer.destroy();
    cornerBuffer.destroy();
    atlasTexture.destroy();
  }

  const renderer: Label3DRenderer = {
    label: 'label3DRenderer',
    setLabels,
    draw,
    glyphCount,
    destroy,
  };
  renderer satisfies Renderer;
  return renderer;
}
