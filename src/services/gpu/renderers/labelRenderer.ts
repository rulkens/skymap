/**
 * LabelRenderer — MSDF text label pass for the 3D sky map.
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
 * ## Why a separate per-label storage buffer?
 *
 * All glyphs of one label share world position, color, and fade state.
 * Duplicating those 48 bytes into every glyph instance would bloat the
 * instance buffer and couple layout to label length.  Instead, each glyph
 * carries just its `localOffset`, `localSize`, `uvRect`, and `labelIndex`
 * (36 bytes/glyph), and the shader fetches shared state from `labels[]`.
 * This is the same indirect-lookup pattern as `quadRenderer`'s per-instance
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
 * site here must both be updated.  See `quadRenderer.ts` for the same
 * 80-byte comment with the per-renderer tail that comes after.
 *
 * ## Blend mode
 *
 * Premultiplied-alpha OVER, NOT additive.  Labels are UI overlay — they
 * should occlude the HDR sky content at full opacity.  Additive blend
 * (used by `quadRenderer` for emissive thumbnails) would make black
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

import type { GpuContext } from '../../../@types';
import type { FontMetrics } from '../labels/fontMetrics';
import { layoutLabel } from '../labels/labelLayout';
import vsCode from '../shaders/labels/vertex.wesl?static';
import fsCode from '../shaders/labels/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

// ─── public label shape ────────────────────────────────────────────────────

export type Label = {
  id: string;
  worldPos: [number, number, number];
  text: string;
  /** Target em pixel height at the label's natural viewing distance. */
  pixelSize: number;
  /** RGBA premultiplied, defaults to [1,1,1,1]. */
  color?: [number, number, number, number];
  /** Lower clamp on on-screen em height in pixels (default 8). */
  minPixelSize?: number;
  /** Upper clamp on on-screen em height in pixels (default 64). */
  maxPixelSize?: number;
  /**
   * World em size in Mpc — controls the natural distance at which
   * `pixelSize` is reached.  Default 0.01 Mpc/em (so a 24 px label
   * with worldEmMpc=0.01 reads at 24 px when ~0.01 Mpc away).
   */
  worldEmMpc?: number;
  /** Fade multiplier in [0,1] driven by youAreHereVisibility. Default 1. */
  fadeAlpha?: number;
};

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
 * Per-glyph instance buffer stride, matching `VsIn` attributes 1–4 in io.wesl:
 *
 *   bytes  0..7   localOffset  vec2<f32>  — pen-relative top-left in atlas px
 *   bytes  8..15  localSize    vec2<f32>  — glyph width/height in atlas px
 *   bytes 16..31  uvRect       vec4<f32>  — (u0,v0,u1,v1) atlas UV
 *   bytes 32..35  labelIndex   u32        — index into labels[] storage buffer
 *
 * Note: `corner` (location 0) comes from a separate 4-vertex unit-quad
 * buffer with `stepMode: 'vertex'`, not from this instance buffer.
 */
const GLYPH_INSTANCE_BYTES = 36;

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

// ─── LabelRenderer ────────────────────────────────────────────────────────

export class LabelRenderer {
  // Stored for GPU calls guarded behind `if (this.device)`.
  private readonly device: GPUDevice | null;
  private readonly format: GPUTextureFormat;
  private readonly metrics: FontMetrics;

  // GPU resources — only allocated when `device !== null`.
  private readonly pipeline: GPURenderPipeline | undefined;
  private readonly bindGroupLayout: GPUBindGroupLayout | undefined;
  private readonly uniformBuffer: GPUBuffer | undefined;
  private readonly storageBuffer: GPUBuffer | undefined;
  private readonly instanceBuffer: GPUBuffer | undefined;
  private readonly cornerBuffer: GPUBuffer | undefined;
  private readonly atlasTexture: GPUTexture | undefined;
  private readonly sampler: GPUSampler | undefined;
  private bindGroup: GPUBindGroup | undefined;

  // CPU state — always valid, safe to read in unit tests with null device.
  private readonly maxLabels: number;
  private readonly maxGlyphs: number;
  /** Packed glyph instance data (f32/u32 views of the same ArrayBuffer). */
  private readonly glyphBuf: ArrayBuffer;
  private readonly glyphF32: Float32Array;
  private readonly glyphU32: Uint32Array;
  /** Packed label storage data. */
  private readonly labelBuf: Float32Array;
  /** Running count updated by setLabels. */
  private currentGlyphCount = 0;
  private currentLabelCount = 0;

  constructor(
    ctx: GpuContext,
    metrics: FontMetrics,
    atlasBitmap: ImageBitmap | null,
    maxLabels = 64,
    maxGlyphsPerLabel = 64,
  ) {
    this.device = ctx.device as GPUDevice | null;
    this.format = ctx.format;
    this.metrics = metrics;
    this.maxLabels = maxLabels;
    this.maxGlyphs = maxLabels * maxGlyphsPerLabel;

    // Allocate CPU scratch buffers.  The Float32Array and Uint32Array share
    // a single ArrayBuffer so we can write f32 fields and the u32 labelIndex
    // into the same memory region without any copies.
    const glyphByteLength = this.maxGlyphs * GLYPH_INSTANCE_BYTES;
    this.glyphBuf = new ArrayBuffer(glyphByteLength);
    this.glyphF32 = new Float32Array(this.glyphBuf);
    this.glyphU32 = new Uint32Array(this.glyphBuf);
    this.labelBuf = new Float32Array((maxLabels * LABEL_DATA_BYTES) / 4);

    if (!this.device) return; // null-device: skip all GPU allocations

    const device = this.device;

    // ── Bind group layout ──────────────────────────────────────────────────
    //
    // Four bindings matching the labels shaders (io.wesl + fragment.wesl):
    //   0 → uniform buffer  (CameraUniforms, vertex-visible)
    //   1 → read-only storage buffer (LabelData[], vertex-visible)
    //   2 → atlas texture   (fragment-visible)
    //   3 → atlas sampler   (fragment-visible)
    this.bindGroupLayout = device.createBindGroupLayout({
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
        { binding: 2, visibility: GPUShaderStage.FRAGMENT, texture: { sampleType: 'float' } },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    // ── Pipeline ───────────────────────────────────────────────────────────
    const vsModule = createShaderModuleWithDevLog(device, vsCode, 'labels.vertex');
    const fsModule = createShaderModuleWithDevLog(device, fsCode, 'labels.fragment');

    this.pipeline = device.createRenderPipeline({
      label: 'label-pipeline',
      layout: device.createPipelineLayout({
        label: 'label-pipeline-layout',
        bindGroupLayouts: [this.bindGroupLayout],
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
            ],
          },
        ],
      },
      fragment: {
        module: fsModule,
        entryPoint: 'fs',
        targets: [
          {
            format: this.format,
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

    // ── Buffers ────────────────────────────────────────────────────────────
    this.uniformBuffer = device.createBuffer({
      label: 'label-uniforms',
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.storageBuffer = device.createBuffer({
      label: 'label-storage',
      size: maxLabels * LABEL_DATA_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    this.instanceBuffer = device.createBuffer({
      label: 'label-instances',
      size: this.maxGlyphs * GLYPH_INSTANCE_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    // The corner buffer is tiny (32 bytes, 4 × vec2) and static — upload once
    // at construction and reuse across every frame.
    this.cornerBuffer = device.createBuffer({
      label: 'label-corners',
      size: CORNER_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.cornerBuffer, 0, CORNER_DATA);

    // ── Atlas texture + sampler ────────────────────────────────────────────
    //
    // Dimensions come from the FontMetrics so the atlas size is not
    // hard-coded here — if the build script ever regenerates at a different
    // resolution, changing `public/fonts/*.json` is the only edit needed.
    //
    // `RENDER_ATTACHMENT` in usage is required by `copyExternalImageToTexture`
    // on some platforms (Chrome requires it for non-power-of-two sources and
    // for certain pixel-format combinations).  Including it is safe and
    // harmless even when not strictly required.
    this.atlasTexture = device.createTexture({
      label: 'label-atlas',
      size: [metrics.atlas.width, metrics.atlas.height, 1],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    if (atlasBitmap !== null) {
      device.queue.copyExternalImageToTexture(
        { source: atlasBitmap },
        { texture: this.atlasTexture },
        [metrics.atlas.width, metrics.atlas.height],
      );
    }

    // No mipmaps: MSDF handles multi-scale rendering internally via the
    // median3 + fwidth technique. Mip-filtering would blur the signed-distance
    // channels and corrupt the glyph edge reconstruction.
    this.sampler = device.createSampler({
      label: 'label-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });

    // ── Bind group ─────────────────────────────────────────────────────────
    this.bindGroup = device.createBindGroup({
      label: 'label-bg',
      layout: this.bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: this.uniformBuffer } },
        { binding: 1, resource: { buffer: this.storageBuffer } },
        { binding: 2, resource: this.atlasTexture.createView() },
        { binding: 3, resource: this.sampler },
      ],
    });
  }

  // ─── public API ───────────────────────────────────────────────────────────

  /**
   * Replace the current label set.  Calling setLabels([]) clears all labels.
   * The method re-packs the CPU-side glyph and label scratch buffers and, if
   * a real GPU device is present, uploads them to the GPU storage/instance
   * buffers.
   *
   * This is designed to be called once per frame by the engine subsystem when
   * labels change (camera moved, fade state ticked).  For the "you are here"
   * use-case there will typically be 1–3 labels so the cost is negligible.
   */
  setLabels(labels: Label[]): void {
    this.currentGlyphCount = 0;
    this.currentLabelCount = 0;

    const count = Math.min(labels.length, this.maxLabels);
    for (let li = 0; li < count; li++) {
      const label = labels[li]!;
      const quads = layoutLabel(label.text, this.metrics);

      // Skip labels whose entire text produces no known glyphs.
      // Still advance `li` so label indices stay stable across the outer
      // loop — but don't write a storage entry until we know there are glyphs.

      // Write per-label storage record (48 bytes, 12 floats).
      //   [0..3]  worldPos (x,y,z, worldEmMpc)
      //   [4..7]  color    (r,g,b,a premultiplied)
      //   [8..11] sizing   (pixelSize, minPx, maxPx, fadeAlpha)
      const labelBase = li * (LABEL_DATA_BYTES / 4);
      this.labelBuf[labelBase + 0] = label.worldPos[0];
      this.labelBuf[labelBase + 1] = label.worldPos[1];
      this.labelBuf[labelBase + 2] = label.worldPos[2];
      this.labelBuf[labelBase + 3] = label.worldEmMpc ?? 0.01;
      const color = label.color ?? [1, 1, 1, 1];
      this.labelBuf[labelBase + 4] = color[0]!;
      this.labelBuf[labelBase + 5] = color[1]!;
      this.labelBuf[labelBase + 6] = color[2]!;
      this.labelBuf[labelBase + 7] = color[3]!;
      this.labelBuf[labelBase + 8]  = label.pixelSize;
      this.labelBuf[labelBase + 9]  = label.minPixelSize ?? 8;
      this.labelBuf[labelBase + 10] = label.maxPixelSize ?? 64;
      this.labelBuf[labelBase + 11] = label.fadeAlpha ?? 1;

      // Write per-glyph instance records (36 bytes, 9 × f32 or 8 × f32 + 1 × u32).
      for (const q of quads) {
        if (this.currentGlyphCount >= this.maxGlyphs) break;
        // Byte offset of this glyph in the ArrayBuffer.
        // GLYPH_INSTANCE_BYTES (36) is not a multiple of 4 — wait, it IS:
        // 36 = 9 × 4.  But the ArrayBuffer backing Float32Array is allocated
        // as `maxGlyphs * 36` bytes, so Float32Array has `maxGlyphs * 9`
        // elements and Uint32Array has the same count.
        const f32Base = this.currentGlyphCount * (GLYPH_INSTANCE_BYTES / 4);
        this.glyphF32[f32Base + 0] = q.localOffsetX;
        this.glyphF32[f32Base + 1] = q.localOffsetY;
        this.glyphF32[f32Base + 2] = q.localSizeW;
        this.glyphF32[f32Base + 3] = q.localSizeH;
        this.glyphF32[f32Base + 4] = q.uvU0;
        this.glyphF32[f32Base + 5] = q.uvV0;
        this.glyphF32[f32Base + 6] = q.uvU1;
        this.glyphF32[f32Base + 7] = q.uvV1;
        // labelIndex is a u32; write it through the Uint32Array view so
        // the bit pattern is exact (Float32Array would reinterpret it).
        this.glyphU32[f32Base + 8] = li;
        this.currentGlyphCount++;
      }

      this.currentLabelCount++;
    }

    // Upload to GPU if a real device is present.
    if (!this.device) return;
    const device = this.device;

    if (this.storageBuffer && this.currentLabelCount > 0) {
      device.queue.writeBuffer(
        this.storageBuffer,
        0,
        this.labelBuf,
        0,
        (this.currentLabelCount * LABEL_DATA_BYTES) / 4,
      );
    }
    if (this.instanceBuffer && this.currentGlyphCount > 0) {
      device.queue.writeBuffer(
        this.instanceBuffer,
        0,
        this.glyphBuf,
        0,
        this.currentGlyphCount * GLYPH_INSTANCE_BYTES,
      );
    }
  }

  /**
   * Issue the label draw call into an in-flight render pass.
   *
   * Must be called inside a `beginRenderPass` / `pass.end()` block by the
   * engine.  The pass's render target format must match `ctx.format`.
   *
   * @param pass        - Active render pass encoder.
   * @param viewProj    - 4×4 view-projection matrix as a 16-element Float32Array.
   * @param viewportSize - [width, height] in physical pixels.
   */
  render(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: [number, number],
  ): void {
    if (!this.device || !this.pipeline || !this.bindGroup) return;
    if (this.currentGlyphCount === 0) return;

    // Pack uniforms (80 bytes = CameraUniforms prefix only).
    //
    //   f32[0..15]   viewProj     — CameraUniforms.viewProj (bytes 0..63)
    //   f32[16..17]  viewportPx   — CameraUniforms.viewportPx (bytes 64..71)
    //   f32[18..19]  reserved pad — must remain zero (bytes 72..79)
    //
    // Float32Array zero-initialises on construction, so f32[18..19] stay zero
    // without an explicit write — consistent with `quadRenderer.ts`'s approach.
    const uni = new Float32Array(UNIFORM_BYTES / 4);
    uni.set(viewProj, 0);
    uni[16] = viewportSize[0];
    uni[17] = viewportSize[1];
    this.device.queue.writeBuffer(this.uniformBuffer!, 0, uni);

    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);
    // Buffer slot 0: static corner quad (4 vertices, broadcast across instances).
    pass.setVertexBuffer(0, this.cornerBuffer!);
    // Buffer slot 1: per-glyph instance data.
    pass.setVertexBuffer(1, this.instanceBuffer!);
    // 4 vertices per triangle-strip quad × N glyph instances.
    pass.draw(4, this.currentGlyphCount, 0, 0);
  }

  /** Total glyph count across all active labels. Used by tests and debug HUD. */
  glyphCount(): number {
    return this.currentGlyphCount;
  }

  /** Number of labels last passed to setLabels. Used by tests and debug HUD. */
  labelCount(): number {
    return this.currentLabelCount;
  }

  /** Release all GPU resources. Does nothing if constructed with a null device. */
  destroy(): void {
    this.uniformBuffer?.destroy();
    this.storageBuffer?.destroy();
    this.instanceBuffer?.destroy();
    this.cornerBuffer?.destroy();
    this.atlasTexture?.destroy();
  }
}
