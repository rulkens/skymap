/**
 * labelRenderer — MSDF text label pass for the 3D sky map.
 *
 * Renders a set of world-anchored text labels using a multi-channel signed
 * distance field (MSDF) atlas.  Each character ("glyph") in a label becomes
 * one instanced quad.  The vertex stage reads per-label data (position, color,
 * sizing) from a GPU storage buffer indexed by a per-glyph `labelIndex`
 * attribute, then offsets each corner by `localOffset + corner * localSize`
 * (in atlas pixels) before projecting the anchor to clip space.  The fragment
 * stage samples the MSDF atlas, takes the R/G/B median, and uses `fwidth` for
 * one-pixel-wide anti-aliasing — crisp at any zoom without mipmaps.
 *
 * ## Why a closure-keyed factory and not a class?
 *
 * Same convention every other freshly-extracted handle in the engine
 * follows (`selectionSubsystem`, `thumbnailSubsystem`,
 * `biasCorrectionSubsystem`, `tweenManager`, the `Pass` object literals
 * in `engine/frame/passes/`): factories return typed handles, not class
 * instances.  Internal state (CPU scratch buffers, running counts,
 * pipeline + bind-group references) is genuinely inaccessible from
 * outside the closure — there is no `this.glyphBuf` to reach in and
 * poke from a misbehaving caller — and the `type` aliases convention
 * (CLAUDE.md) deliberately rejects the inheritance escape hatch a
 * class would otherwise carry.  Existing renderers (Point/Quad/Disk/…)
 * are still classes for now; new renderers from this point on follow
 * the factory shape.
 *
 * ## Why a separate per-label storage buffer?
 *
 * All glyphs of one label share world position, color, and fade state.
 * Duplicating those 48 bytes into every glyph instance would bloat the
 * instance buffer and couple layout to label length.  Instead, each glyph
 * carries just its `localOffset`, `localSize`, `uvRect`, and `labelIndex`
 * (36 bytes/glyph), and the shader fetches shared state from `labels[]`.
 * This is the same indirect-lookup pattern as `texturedQuadRenderer`'s per-instance
 * galaxy data — one level of indirection in exchange for a much smaller
 * per-glyph stride.
 *
 * ## Uniform layout (CameraUniforms, 80 bytes)
 *
 * The labels shaders use only the shared `CameraUniforms` prefix from
 * `shaders/lib/camera.wesl` — no renderer-specific tail.  That prefix is:
 *
 *   bytes  0..63  viewProj     mat4x4<f32>
 *   bytes 64..71  viewportPx   vec2<f32>
 *   bytes 72..79  _pad0, _pad1 two reserved f32s (must stay zero)
 *
 * If `CameraUniforms` ever grows past 80 bytes, the constant and write
 * site here must both be updated.  See `texturedQuadRenderer.ts` for the same
 * 80-byte comment with the per-renderer tail that comes after.
 *
 * ## Blend mode
 *
 * Premultiplied-alpha OVER, NOT additive.  Labels are UI overlay — they
 * should occlude the HDR sky content at full opacity.  Additive blend
 * (used by `texturedQuadRenderer` for emissive thumbnails) would make black
 * pixels in the label transparent rather than opaque, which reads as
 * invisible on a dark sky and as a bright halo on a bright sky.
 *
 * ## Atlas texture
 *
 * One `rgba8unorm` texture built from the pre-baked `ImageBitmap`.  No
 * mipmaps — MSDF handles aliasing itself; mip-filtered edges would
 * smear the distance channels and break the median logic.  Linear
 * filter + clamp-to-edge gives smooth sub-pixel glyph rendering.
 */

import type { GpuContext } from '../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { Label } from '../../../@types/rendering/Label';
import type { LabelRenderer } from '../../../@types/rendering/LabelRenderer';
import type { FontMetrics } from '../../../@types/rendering/FontMetrics';
import type { LoadedFontAtlases } from '../../../@types/rendering/LoadedFontAtlases';
import { FONT_IDS } from '../../../data/fonts';
import type { FontId } from '../../../data/fonts';
import { layoutLabel } from '../labels/labelLayout';
import vsCode from '../shaders/labels/vertex.wesl?static';
import fsCode from '../shaders/labels/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

// ─── buffer constants ──────────────────────────────────────────────────────

/**
 * Uniform buffer size: 80 bytes = exactly the shared CameraUniforms prefix.
 * No renderer-specific tail is needed by the labels shaders at this time.
 */
const UNIFORM_BYTES = 80;

/**
 * Per-label storage buffer stride, matching `struct LabelData` in io.wesl:
 *   worldPos  vec4<f32>  — xyz = world Mpc, w = worldEmMpc
 *   color     vec4<f32>  — premultiplied rgb, a
 *   sizing    vec4<f32>  — pixelSize, minPixelSize, maxPixelSize, fadeAlpha
 * 3 × 16 bytes = 48 bytes/label.
 */
const LABEL_DATA_BYTES = 48;

/**
 * Per-glyph instance buffer stride, matching `VsIn` attributes 1–5 in io.wesl:
 *
 *   bytes  0..7   localOffset  vec2<f32>  — pen-relative top-left in atlas px
 *   bytes  8..15  localSize    vec2<f32>  — glyph width/height in atlas px
 *   bytes 16..31  uvRect       vec4<f32>  — (u0,v0,u1,v1) atlas UV
 *   bytes 32..35  labelIndex   u32        — index into labels[] storage buffer
 *   bytes 36..39  fontIndex    u32        — texture_2d_array layer index
 *                                            (= FONT_IDS.indexOf(label.font))
 *
 * Note: `corner` (location 0) comes from a separate 4-vertex unit-quad
 * buffer with `stepMode: 'vertex'`, not from this instance buffer.
 */
const GLYPH_INSTANCE_BYTES = 40;

// ─── corner buffer ────────────────────────────────────────────────────────

/**
 * Four (x,y) corners of the unit quad in triangle-strip order:
 *   (0,0), (1,0), (0,1), (1,1)
 * These are broadcast across all glyph instances via `stepMode: 'vertex'`.
 * The vertex shader expands each corner into a glyph pixel position relative
 * to the label anchor in clip space.
 */
const CORNER_DATA = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
const CORNER_BYTES = CORNER_DATA.byteLength; // 32 bytes (4 × 2 × 4)

// ─── factory ──────────────────────────────────────────────────────────────

/**
 * Construct a `LabelRenderer` against the given GPU context, font metrics,
 * and pre-baked atlas bitmap.
 *
 * Pass `device: null` (or a GpuContext whose `device` is null) for unit
 * tests that exercise CPU state only.  GPU resource creation is skipped
 * in that branch and `render(...)` becomes a no-op.
 *
 * `maxLabels` and `maxGlyphsPerLabel` size the static GPU buffers; the
 * defaults (64 × 64 = 4096 glyphs) cover the "you are here" + a few
 * future tagged-galaxy markers without a follow-up resize.
 */
export function createLabelRenderer(
  ctx: GpuContext,
  atlases: LoadedFontAtlases,
  maxLabels = 64,
  maxGlyphsPerLabel = 64,
): LabelRenderer {
  // The `as ... | null` cast lets a test pass `device: null as unknown as
  // GPUDevice` through GpuContext without TypeScript complaining at the
  // factory's call site.  Runtime code below null-checks before each use.
  const device = ctx.device as GPUDevice | null;
  const format = ctx.format;
  const maxGlyphs = maxLabels * maxGlyphsPerLabel;

  // Per-font metrics record + pre-computed layer index lookup.  Built
  // once at construction time so the per-glyph pack loop in setLabels
  // never has to call FONT_IDS.indexOf — that would be O(N) per glyph,
  // O(N²) per label.  The Record is keyed by FontId so callers do
  // `metricsByFont[label.font]` without a string compare per glyph.
  const metricsByFont = atlases.metricsByFont;
  // Pre-computed FontId → layer index lookup. Built once at construction
  // time so the per-glyph pack loop in setLabels never has to call
  // FONT_IDS.indexOf — that would be O(N) per glyph, O(N²) per label.
  const layerIndexOf: Readonly<Record<FontId, number>> = (() => {
    const lookup: Partial<Record<FontId, number>> = {};
    for (let i = 0; i < FONT_IDS.length; i++) {
      lookup[FONT_IDS[i]!] = i;
    }
    return lookup as Readonly<Record<FontId, number>>;
  })();

  // First-font metrics serve as the canonical atlas-dimensions source
  // (every layer is the same size — buildFontAtlas asserts this).  We
  // also use it for layout when Label.font is missing, but post-Task
  // 7 every Label carries `font` explicitly.
  const firstFontId = FONT_IDS[0]!;
  const firstMetrics: FontMetrics = metricsByFont[firstFontId];

  // ── CPU scratch buffers — always allocated, safe to use with null device ─
  //
  // The Float32Array and Uint32Array share a single ArrayBuffer so we can
  // write f32 fields and the u32 labelIndex into the same memory region
  // without any copies.
  const glyphBuf = new ArrayBuffer(maxGlyphs * GLYPH_INSTANCE_BYTES);
  const glyphF32 = new Float32Array(glyphBuf);
  const glyphU32 = new Uint32Array(glyphBuf);
  const labelBuf = new Float32Array((maxLabels * LABEL_DATA_BYTES) / 4);

  // Closure-scoped mutable counters — replace the `this.currentGlyphCount`
  // / `this.currentLabelCount` fields the class form used.  Updated only
  // by `setLabels`; read by `render`, `glyphCount`, `labelCount`.
  let currentGlyphCount = 0;
  let currentLabelCount = 0;

  // ── GPU resources (null when device is null) ─────────────────────────────
  let pipeline: GPURenderPipeline | null = null;
  let uniformBuffer: GPUBuffer | null = null;
  let storageBuffer: GPUBuffer | null = null;
  let instanceBuffer: GPUBuffer | null = null;
  let cornerBuffer: GPUBuffer | null = null;
  let atlasTexture: GPUTexture | null = null;
  let bindGroup: GPUBindGroup | null = null;

  if (device) {
    // ── Bind group layout ────────────────────────────────────────────────
    //
    // Four bindings matching the labels shaders (io.wesl + fragment.wesl):
    //   0 → uniform buffer  (CameraUniforms, vertex-visible)
    //   1 → read-only storage buffer (LabelData[], vertex-visible)
    //   2 → atlas texture   (fragment-visible)
    //   3 → atlas sampler   (fragment-visible)
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'label-bgl',
      entries: [
        { binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } },
        {
          binding: 1,
          visibility: GPUShaderStage.VERTEX,
          // 'read-only-storage', not 'storage' — the shader declares
          // `var<storage, read>` and we don't need write access.
          buffer: { type: 'read-only-storage' },
        },
        {
          binding: 2,
          visibility: GPUShaderStage.FRAGMENT,
          // viewDimension '2d-array' matches the shader's
          // `texture_2d_array<f32>` declaration in fragment.wesl.
          // Mismatching this with the shader-side binding type
          // triggers a pipeline-creation-time validation error.
          texture: { sampleType: 'float', viewDimension: '2d-array' },
        },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    // ── Pipeline ─────────────────────────────────────────────────────────
    const vsModule = createShaderModuleWithDevLog(device, vsCode, 'labels.vertex');
    const fsModule = createShaderModuleWithDevLog(device, fsCode, 'labels.fragment');

    pipeline = device.createRenderPipeline({
      label: 'label-pipeline',
      layout: device.createPipelineLayout({
        label: 'label-pipeline-layout',
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: {
        module: vsModule,
        entryPoint: 'vs',
        buffers: [
          // Buffer 0: unit-corner quad, 4 vertices, stepMode 'vertex'.
          // Provides the (x,y) unit-square corners to location 0 (`corner`).
          {
            arrayStride: 8, // 2 × f32
            stepMode: 'vertex',
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
          },
          // Buffer 1: per-glyph instance data, stepMode 'instance'.
          // Provides localOffset, localSize, uvRect, labelIndex to locations 1–4.
          {
            arrayStride: GLYPH_INSTANCE_BYTES,
            stepMode: 'instance',
            attributes: [
              { shaderLocation: 1, offset: 0, format: 'float32x2' },   // localOffset
              { shaderLocation: 2, offset: 8, format: 'float32x2' },   // localSize
              { shaderLocation: 3, offset: 16, format: 'float32x4' },  // uvRect
              { shaderLocation: 4, offset: 32, format: 'uint32' },     // labelIndex
              { shaderLocation: 5, offset: 36, format: 'uint32' },     // fontIndex
            ],
          },
        ],
      },
      fragment: {
        module: fsModule,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Premultiplied-alpha OVER blend.  Labels are UI overlay text,
            // not emissive content: at alpha=0 they should be fully
            // transparent against whatever's behind them, not additive.
            // Using 'one-minus-src-alpha' for dst preserves the existing
            // HDR content at label-free pixels while the label alpha fades.
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      // Triangle-strip topology — the four unit corners form two triangles
      // covering the glyph quad with just 4 vertices (no index buffer needed).
      primitive: { topology: 'triangle-strip' },
      // No depthStencil — labels are a pure UI overlay and do not participate
      // in depth testing.  Enabling depth write would occlude any geometry
      // rendered later (e.g. a second label pass) at zero cost.
    });

    // ── Buffers ──────────────────────────────────────────────────────────
    uniformBuffer = device.createBuffer({
      label: 'label-uniforms',
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    storageBuffer = device.createBuffer({
      label: 'label-storage',
      size: maxLabels * LABEL_DATA_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    instanceBuffer = device.createBuffer({
      label: 'label-instances',
      size: maxGlyphs * GLYPH_INSTANCE_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    // The corner buffer is tiny (32 bytes, 4 × vec2) and static — upload once
    // at construction and reuse across every frame.
    cornerBuffer = device.createBuffer({
      label: 'label-corners',
      size: CORNER_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(cornerBuffer, 0, CORNER_DATA);

    // ── Atlas texture + sampler ──────────────────────────────────────────
    //
    // Dimensions come from the FontMetrics so the atlas size is not
    // hard-coded here — if the build script ever regenerates at a different
    // resolution, changing `public/fonts/*.json` is the only edit needed.
    //
    // `RENDER_ATTACHMENT` in usage is required by `copyExternalImageToTexture`
    // on some platforms (Chrome requires it for non-power-of-two sources and
    // for certain pixel-format combinations).  Including it is safe and
    // harmless even when not strictly required.
    // Single GPU texture, N layers — one per registered font.  Every
    // layer must have identical dimensions (a WebGPU validation
    // requirement); buildFontAtlas.assertAtlasDimensions enforces
    // this at bake time, so every entry in atlases.bitmaps has the
    // same width/height by construction.
    atlasTexture = device.createTexture({
      label: 'label-atlas',
      size: [firstMetrics.atlas.width, firstMetrics.atlas.height, FONT_IDS.length],
      format: 'rgba8unorm',
      // dimension defaults to '2d' — combined with depthOrArrayLayers > 1
      // this produces a 2D-array texture.  No explicit `dimension: '2d-array'`
      // needed; the WebGPU spec routes through dimension '2d' for both single
      // and array.
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    // Upload each font's bitmap to its FONT_IDS-indexed layer.  Some
    // tests pass an empty bitmap list (CPU-only state exercise); skip
    // the upload in that case — the layout test only inspects
    // CPU-side glyph packing, not the atlas contents.
    for (let i = 0; i < atlases.bitmaps.length; i++) {
      const bitmap = atlases.bitmaps[i];
      if (bitmap == null) continue;
      device.queue.copyExternalImageToTexture(
        { source: bitmap },
        { texture: atlasTexture, origin: { x: 0, y: 0, z: i } },
        [firstMetrics.atlas.width, firstMetrics.atlas.height],
      );
    }

    // No mipmaps: MSDF handles multi-scale rendering internally via the
    // median3 + fwidth technique. Mip-filtering would blur the signed-distance
    // channels and corrupt the glyph edge reconstruction.
    const sampler = device.createSampler({
      label: 'label-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    // ── Bind group ───────────────────────────────────────────────────────
    bindGroup = device.createBindGroup({
      label: 'label-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: storageBuffer } },
        {
          binding: 2,
          // Explicit '2d-array' view dimension matches the
          // bind-group-layout entry and the shader binding.  Spelling
          // it out (rather than letting the default pick) makes the
          // intent visible at the bind site and survives any future
          // FONTS shrink-to-one-entry edit.
          resource: atlasTexture.createView({ dimension: '2d-array' }),
        },
        { binding: 3, resource: sampler },
      ],
    });
  }

  // ── public methods (closures over the locals above) ────────────────────

  function setLabels(labels: readonly Label[]): void {
    currentGlyphCount = 0;
    currentLabelCount = 0;

    const count = Math.min(labels.length, maxLabels);
    for (let li = 0; li < count; li++) {
      const label = labels[li]!;
      // Each label specifies its own font; layout reads the font's
      // metrics from the FontId-keyed record built at construction
      // time.  No fallback — Label.font is required at the type level.
      const quads = layoutLabel(
        label.text,
        metricsByFont[label.font],
        label.alignX ?? 'left',
        label.alignY ?? 'baseline',
      );

      // Write per-label storage record (48 bytes, 12 floats) unconditionally
      // — even when `quads` is empty.  Keeping the per-label index stable
      // across the outer loop matters because each glyph carries its
      // labelIndex by position; if we skipped a label whose text produced
      // no known glyphs, every subsequent glyph would point to the wrong
      // label entry.  An unused storage slot is harmless (no glyph
      // references it, the GPU never reads it).
      //
      //   [0..3]  worldPos (x,y,z, worldEmMpc)
      //   [4..7]  color    (r,g,b,a premultiplied)
      //   [8..11] sizing   (pixelSize, minPx, maxPx, fadeAlpha)
      const labelBase = li * (LABEL_DATA_BYTES / 4);
      labelBuf[labelBase + 0] = label.worldPos[0];
      labelBuf[labelBase + 1] = label.worldPos[1];
      labelBuf[labelBase + 2] = label.worldPos[2];
      labelBuf[labelBase + 3] = label.worldEmMpc ?? 0.01;
      // Public API surface is STRAIGHT RGBA — producers spell colours the
      // natural way (e.g. `[1, 0, 0, 0.5]` for "half-transparent red").
      // The fragment shader composites in premultiplied space (see
      // fragment.wesl's blend-state docstring), so we multiply r/g/b by a
      // HERE and write the result through to the GPU.  The previous public
      // API was premultiplied — see the Label.color docstring for the
      // migration note.
      const color = label.color ?? [1, 1, 1, 1];
      const a = color[3]!;
      labelBuf[labelBase + 4] = color[0]! * a;
      labelBuf[labelBase + 5] = color[1]! * a;
      labelBuf[labelBase + 6] = color[2]! * a;
      labelBuf[labelBase + 7] = a;
      labelBuf[labelBase + 8] = label.pixelSize;
      labelBuf[labelBase + 9] = label.minPixelSize ?? 8;
      labelBuf[labelBase + 10] = label.maxPixelSize ?? 64;
      labelBuf[labelBase + 11] = label.fadeAlpha ?? 1;

      // Resolve the label's font to its GPU texture-array layer index
      // ONCE per label, outside the inner glyph loop — every glyph in
      // a label shares the same layer.
      const fontIndex = layerIndexOf[label.font];

      // Write per-glyph instance records (40 bytes = 10 × 4 = 8 × f32 + 2 × u32).
      for (const q of quads) {
        if (currentGlyphCount >= maxGlyphs) break;
        // f32 base index inside the shared ArrayBuffer view.  10 slots/glyph
        // (8 floats + 2 uints reinterpreted via the u32 view at the same
        // offsets — slots 8 and 9).
        const f32Base = currentGlyphCount * (GLYPH_INSTANCE_BYTES / 4);
        glyphF32[f32Base + 0] = q.localOffsetX;
        glyphF32[f32Base + 1] = q.localOffsetY;
        glyphF32[f32Base + 2] = q.localSizeW;
        glyphF32[f32Base + 3] = q.localSizeH;
        glyphF32[f32Base + 4] = q.uvU0;
        glyphF32[f32Base + 5] = q.uvV0;
        glyphF32[f32Base + 6] = q.uvU1;
        glyphF32[f32Base + 7] = q.uvV1;
        // labelIndex + fontIndex are u32; write them through the
        // Uint32Array view so the bit patterns are exact (the
        // Float32Array view would reinterpret an int payload as
        // garbage floating-point bits).
        glyphU32[f32Base + 8] = li;
        glyphU32[f32Base + 9] = fontIndex;
        currentGlyphCount++;
      }

      currentLabelCount++;
    }

    // Upload to GPU only when a real device is present.
    if (!device) return;

    if (storageBuffer && currentLabelCount > 0) {
      device.queue.writeBuffer(
        storageBuffer,
        0,
        labelBuf,
        0,
        (currentLabelCount * LABEL_DATA_BYTES) / 4,
      );
    }
    if (instanceBuffer && currentGlyphCount > 0) {
      device.queue.writeBuffer(
        instanceBuffer,
        0,
        glyphBuf,
        0,
        currentGlyphCount * GLYPH_INSTANCE_BYTES,
      );
    }
  }

  function render(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: [number, number],
  ): void {
    if (!device || !pipeline || !bindGroup || !uniformBuffer || !cornerBuffer || !instanceBuffer) {
      return;
    }
    if (currentGlyphCount === 0) return;

    // Pack uniforms (80 bytes = CameraUniforms prefix only).
    //
    //   f32[0..15]   viewProj     — CameraUniforms.viewProj (bytes 0..63)
    //   f32[16..17]  viewportPx   — CameraUniforms.viewportPx (bytes 64..71)
    //   f32[18..19]  reserved pad — must remain zero (bytes 72..79)
    //
    // Float32Array zero-initialises on construction, so f32[18..19] stay zero
    // without an explicit write — consistent with `texturedQuadRenderer.ts`'s approach.
    const uni = new Float32Array(UNIFORM_BYTES / 4);
    uni.set(viewProj, 0);
    uni[16] = viewportSize[0];
    uni[17] = viewportSize[1];
    device.queue.writeBuffer(uniformBuffer, 0, uni);

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);
    // Buffer slot 0: static corner quad (4 vertices, broadcast across instances).
    pass.setVertexBuffer(0, cornerBuffer);
    // Buffer slot 1: per-glyph instance data.
    pass.setVertexBuffer(1, instanceBuffer);
    // 4 vertices per triangle-strip quad × N glyph instances.
    pass.draw(4, currentGlyphCount, 0, 0);
  }

  function glyphCount(): number {
    return currentGlyphCount;
  }

  function labelCount(): number {
    return currentLabelCount;
  }

  function destroy(): void {
    uniformBuffer?.destroy();
    storageBuffer?.destroy();
    instanceBuffer?.destroy();
    cornerBuffer?.destroy();
    atlasTexture?.destroy();
  }

  const renderer: LabelRenderer = {
    label: 'labelRenderer',
    setLabels,
    render,
    glyphCount,
    labelCount,
    destroy,
  };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening the static type seen by consumers.
  renderer satisfies Renderer;
  // Expose the CPU-side label storage scratch buffer for unit tests
  // that need to assert pack-loop output.  The accessor is prefixed
  // with `__debug` to flag it as test-only — production code should
  // never read this; the GPU has the authoritative copy.
  (renderer as unknown as { __debugLabelBuf: () => Float32Array }).__debugLabelBuf = () => labelBuf;
  return renderer;
}
