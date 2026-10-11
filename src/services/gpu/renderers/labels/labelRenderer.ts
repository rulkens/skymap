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
 * follows (`thumbnailSubsystem`, `biasCorrectionSubsystem`,
 * the `Pass` object literals in `engine/frame/passes/`): factories return
 * typed handles, not class instances.  Internal state (CPU scratch buffers,
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
 * Duplicating those 96 bytes into every glyph instance would bloat the
 * instance buffer and couple layout to label length.  Instead, each glyph
 * carries just its `localOffset`, `localSize`, `uvRect`, and `labelIndex`
 * (40 bytes/glyph), and the shader fetches shared state from `labels[]`.
 * This is the same indirect-lookup pattern as `texturedQuadRenderer`'s per-instance
 * galaxy data — one level of indirection in exchange for a much smaller
 * per-glyph stride.
 *
 * ## Uniform layout (CameraUniforms prefix + em scale, 96 bytes)
 *
 * The shared `CameraUniforms` prefix from `shaders/lib/camera.wesl`, then
 * this renderer's one tail field:
 *
 *   bytes  0..63  viewProj     mat4x4<f32>
 *   bytes 64..71  viewportPx   vec2<f32>
 *   bytes 72..75  pxPerRad    f32 (CameraUniforms focal term)
 *   bytes 76..79  _pad0       one reserved f32 (must stay zero)
 *   bytes 80..83  emClipScale  f32 (clip units of viewProj relative to Mpc)
 *   bytes 84..95  padding      WGSL rounds the struct to its 16-byte alignment
 *
 * The prefix write comes from `lib/cameraUniforms.ts`, the TS twin of the
 * WESL struct.  See `instancedQuadRenderer.ts` for the same prefix-plus-tail
 * pattern.
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

import type { GpuContext } from '../../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { Label2D } from '../../../../@types/rendering/Label2D';
import type { LabelRenderer } from '../../../../@types/rendering/LabelRenderer';
import type { FontMetrics } from '../../../../@types/rendering/FontMetrics';
import type { LoadedFontAtlases } from '../../../../@types/rendering/LoadedFontAtlases';
import { FONT_IDS } from '../../../../data/fonts';
import type { FontId } from '../../../../@types/data/FontId';
import type { Vec2 } from '../../../../@types/math/Vec2';
import vsCode from '../../shaders/labels/vertex.wesl?static';
import vsOccludeCode from '../../shaders/labels/vertexOcclude.wesl?static';
import fsCode from '../../shaders/labels/fragment.wesl?static';
import fsOccludeCode from '../../shaders/labels/fragmentOcclude.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import type { OverlaySceneOcclusion } from '../../../../@types/rendering/OverlaySceneOcclusion';
import {
  OCCLUSION_COVERAGE_GROUP_INDEX,
  OCCLUSION_COVERAGE_LAYOUT_DESC,
  createOcclusionCoverageBindGroup,
  createOcclusionDepthFrameBuffer,
  writeOcclusionDepthFrame,
} from './occlusionCoverageGroup';
import { CAMERA_UNIFORM_BYTES, writeCameraPrefix } from '../../lib/cameraUniforms';
import { UNIT_QUAD_STRIP_CORNERS, UNIT_QUAD_VERTEX_LAYOUT } from '../../lib/unitQuad';
import { PREMULTIPLIED_OVER_BLEND } from '../../lib/blendStates';
import { GLYPH_INSTANCE_BYTES, LABEL_DATA_BYTES } from '../../../../data/labels/labelBufferStrides';
import { packLabels } from './packLabels';

// ─── uniform constants ────────────────────────────────────────────────────

// `struct Uniforms` in io.wesl: the 80-byte camera prefix + emClipScale, padded to 16.
const UNIFORM_BYTES = 96;
// f32 index of `emClipScale` (byte 80).
const EM_CLIP_SCALE_F32_INDEX = CAMERA_UNIFORM_BYTES / 4;

// ─── capacity constants ───────────────────────────────────────────────────

// Starting label-storage size; `setLabels` grows it in power-of-two steps
// once the roster outgrows it (see `allocate`).
const INITIAL_LABEL_CAPACITY = 64;
// Per-label glyph budget for the SHARED glyph pool (`capacity * MAX_GLYPHS_PER_LABEL`).
const MAX_GLYPHS_PER_LABEL = 64;

// ─── corner buffer ────────────────────────────────────────────────────────

// The unit-quad corners + their slot-0 layout come from `lib/unitQuad.ts`,
// shared byte-for-byte with the marker- and debug-line overlays.
const CORNER_BYTES = UNIT_QUAD_STRIP_CORNERS.byteLength; // 32 bytes (4 × 2 × 4)

// ─── factory ──────────────────────────────────────────────────────────────

/**
 * Construct a `LabelRenderer` against the given GPU context, colour-target
 * format, font metrics, and pre-baked atlas bitmap.
 *
 * Pass `device: null` (or a GpuContext whose `device` is null) for unit
 * tests that exercise CPU state only.  GPU resource creation is skipped
 * in that branch and `draw(...)` becomes a no-op.
 *
 * `targetFormat` is the colour-attachment format the pipeline writes into.
 * Labels are a post-tone-map UI overlay, so this is the swap-chain format —
 * but it is passed EXPLICITLY rather than read off `ctx.format`, so the
 * target is legible at the construction site (the same one-idiom rule every
 * renderer follows).
 *
 * `INITIAL_LABEL_CAPACITY` is a starting size, not a ceiling: `setLabels`
 * grows the CPU scratch arrays and, with a device, reallocates the GPU
 * storage/instance buffers and bind group in power-of-two steps whenever
 * the roster outgrows them. `MAX_GLYPHS_PER_LABEL` sizes a glyph pool SHARED
 * across all labels (`capacity * MAX_GLYPHS_PER_LABEL`); growth scales that
 * pool with capacity, but a roster of unusually long labels can still
 * exhaust it and have glyphs silently dropped (the `currentGlyphCount >=
 * maxGlyphs` break in `packLabels`).
 *
 * `init.occludeAgainstScene` opts this instance into per-pixel attenuation
 * behind the solar-system bodies.  When set, the pipeline gains a group(1)
 * coverage binding (`OCCLUSION_COVERAGE_LAYOUT_DESC`) and compiles
 * `fragmentOcclude.wesl` instead of the plain `fragment.wesl`; `draw` then
 * consumes a per-frame `OverlaySceneOcclusion`.  The default (`init.occludeAgainstScene` omitted)
 * keeps the plain single-BGL pipeline — byte-for-byte unchanged.
 */
export function createLabelRenderer(
  ctx: GpuContext,
  init: {
    targetFormat: GPUTextureFormat;
    atlases: LoadedFontAtlases;
    occludeAgainstScene?: boolean;
  },
): LabelRenderer {
  const { targetFormat, atlases } = init;
  // The `as ... | null` cast lets a test pass `device: null as unknown as
  // GPUDevice` through GpuContext without TypeScript complaining at the
  // factory's call site.  Runtime code below null-checks before each use.
  const device = ctx.device as GPUDevice | null;
  const format = targetFormat;

  const metricsByFont = atlases.metricsByFont;
  // Pre-computed FontId → layer index lookup. Built once at construction
  // time so the per-glyph pack loop in `packLabels` never has to call
  // FONT_IDS.indexOf — that would be O(N) per glyph, O(N²) per label.
  const layerIndexOf: Readonly<Record<FontId, number>> = (() => {
    const lookup: Partial<Record<FontId, number>> = {};
    for (let i = 0; i < FONT_IDS.length; i++) {
      lookup[FONT_IDS[i]!] = i;
    }
    return lookup as Readonly<Record<FontId, number>>;
  })();

  // First-font metrics serve as the canonical atlas-dimensions source
  // (every layer is the same size — buildFontAtlas asserts this).
  const firstFontId = FONT_IDS[0]!;
  const firstMetrics: FontMetrics = metricsByFont[firstFontId];

  // ── CPU scratch buffers — (re)built by `allocate` below, safe to use with
  // a null device. The Float32Array and Uint32Array share a single
  // ArrayBuffer so f32 fields and the u32 labelIndex write into the same
  // memory region without any copies. Placeholder sizes here; `allocate`
  // replaces them before construction returns.
  let capacity = 0;
  let maxGlyphs = 0;
  let glyphBuf = new ArrayBuffer(0);
  let glyphF32 = new Float32Array(glyphBuf);
  let glyphU32 = new Uint32Array(glyphBuf);
  let labelBuf = new Float32Array(0);

  // Glyphs packed by the last `setLabels`; `draw` instances exactly this many.
  let currentGlyphCount = 0;

  // ── GPU resources (null when device is null) ─────────────────────────────
  //
  // The occlusion instance builds BOTH pipelines and picks per-draw:
  // `plainPipeline` (single BGL) whenever no scene colour is supplied this frame,
  // `occludePipeline` (two BGLs, scene-attenuated fragment) when it is. A
  // non-occlusion instance builds only `plainPipeline` and leaves the other null.
  let plainPipeline: GPURenderPipeline | null = null;
  let occludePipeline: GPURenderPipeline | null = null;
  let uniformBuffer: GPUBuffer | null = null;
  let storageBuffer: GPUBuffer | null = null;
  let instanceBuffer: GPUBuffer | null = null;
  let cornerBuffer: GPUBuffer | null = null;
  let atlasTexture: GPUTexture | null = null;
  let bindGroup: GPUBindGroup | null = null;
  let bindGroupLayout: GPUBindGroupLayout | null = null;
  let sampler: GPUSampler | null = null;
  // Retained only on the occlusion path — the group(1) coverage BGL that
  // `draw` rebuilds a per-frame bind group against, and the depth-frame
  // uniform that joint's binding 2 reads.  Null on the plain path (and
  // whenever device is null), which is what gates `draw`'s occlusion branch.
  let occlusionCoverageBGL: GPUBindGroupLayout | null = null;
  let occlusionDepthFrameBuffer: GPUBuffer | null = null;

  const occludesScene = init.occludeAgainstScene === true;

  /**
   * (Re)size the CPU scratch arrays for `newCapacity` labels and, with a
   * device, destroy + recreate the GPU storage/instance buffers and rebuild
   * the bind group — binding 1 pins `storageBuffer`, so a stale bind group
   * would keep reading the destroyed buffer. Runs once at construction and
   * again whenever `setLabels` outgrows `capacity`.
   */
  function allocate(newCapacity: number): void {
    capacity = newCapacity;
    maxGlyphs = capacity * MAX_GLYPHS_PER_LABEL;
    glyphBuf = new ArrayBuffer(maxGlyphs * GLYPH_INSTANCE_BYTES);
    glyphF32 = new Float32Array(glyphBuf);
    glyphU32 = new Uint32Array(glyphBuf);
    labelBuf = new Float32Array((capacity * LABEL_DATA_BYTES) / 4);

    if (!device || !bindGroupLayout || !atlasTexture || !sampler || !uniformBuffer) return;

    // WebGPU defers a destroyed buffer's reclaim past queued GPU work reading it.
    storageBuffer?.destroy();
    instanceBuffer?.destroy();

    storageBuffer = device.createBuffer({
      label: 'label-storage',
      size: capacity * LABEL_DATA_BYTES,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    instanceBuffer = device.createBuffer({
      label: 'label-instances',
      size: maxGlyphs * GLYPH_INSTANCE_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    bindGroup = device.createBindGroup({
      label: 'label-bg',
      layout: bindGroupLayout,
      entries: [
        { binding: 0, resource: { buffer: uniformBuffer } },
        { binding: 1, resource: { buffer: storageBuffer } },
        // Explicit '2d-array' view dimension — matches the BGL entry and
        // shader binding; spelled out so it survives a future FONTS
        // shrink-to-one-entry edit.
        { binding: 2, resource: atlasTexture.createView({ dimension: '2d-array' }) },
        { binding: 3, resource: sampler },
      ],
    });
  }

  if (device) {
    // ── Bind group layout ────────────────────────────────────────────────
    //
    // Four bindings matching the labels shaders (io.wesl + lib/msdf.wesl):
    //   0 → uniform buffer  (CameraUniforms, vertex-visible)
    //   1 → read-only storage buffer (LabelData[], vertex-visible)
    //   2 → atlas texture   (fragment-visible)
    //   3 → atlas sampler   (fragment-visible)
    bindGroupLayout = device.createBindGroupLayout({
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
          // `texture_2d_array<f32>` declaration in lib/msdf.wesl.
          // Mismatching this with the shader-side binding type
          // triggers a pipeline-creation-time validation error.
          texture: { sampleType: 'float', viewDimension: '2d-array' },
        },
        { binding: 3, visibility: GPUShaderStage.FRAGMENT, sampler: { type: 'filtering' } },
      ],
    });

    // ── Occlusion joint (opt-in) ─────────────────────────────────────────
    //
    // When this instance attenuates against scene coverage, the pipeline gains
    // a second bind-group layout at group 1 (the shared coverage joint).
    // `occlusionCoverageBGL` is retained so `draw` can rebuild its per-frame
    // bind group (the colour view changes on every resize — see
    // occlusionCoverageGroup.ts).
    if (occludesScene) {
      occlusionCoverageBGL = device.createBindGroupLayout(OCCLUSION_COVERAGE_LAYOUT_DESC);
      occlusionDepthFrameBuffer = createOcclusionDepthFrameBuffer(device, 'label-depth-frame');
    }

    // ── Pipelines ────────────────────────────────────────────────────────
    //
    // An occlusion instance builds BOTH pipelines and picks per-draw. `draw`
    // selects `occludePipeline` only when handed a scene colour view THIS frame,
    // and falls back to `plainPipeline` otherwise — so a frame in which no
    // foreground body drew (hence no valid scene colour) still paints its
    // captions un-occluded through a VALID draw, rather than an occlusion draw
    // with group(1) left unbound. A non-occlusion instance builds only the
    // plain pipeline.
    const vsModule = createShaderModuleWithDevLog(device, vsCode, 'labels.vertex');

    // Both pipelines draw the identical geometry into the identical target;
    // only the fragment entry and the group(1) coverage binding differ, so the
    // vertex-buffer + colour-target descriptors are shared.
    const vertexBuffers: GPUVertexBufferLayout[] = [
      // Buffer 0: unit-corner quad, 4 vertices, stepMode 'vertex'.
      // Provides the (x,y) unit-square corners to location 0 (`corner`).
      UNIT_QUAD_VERTEX_LAYOUT,
      // Buffer 1: per-glyph instance data, stepMode 'instance'.
      // Provides localOffset, localSize, uvRect, labelIndex to locations 1–4.
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
    // Premultiplied-alpha OVER blend.  Labels are UI overlay text, not emissive
    // content: at alpha=0 they should be fully transparent against whatever's
    // behind them, not additive.  'one-minus-src-alpha' for dst preserves the
    // existing HDR content at label-free pixels while the label alpha fades.
    const colorTargets: GPUColorTargetState[] = [{ format, blend: PREMULTIPLIED_OVER_BLEND }];

    const fsPlainModule = createShaderModuleWithDevLog(device, fsCode, 'labels.fragment');
    plainPipeline = device.createRenderPipeline({
      label: 'label-pipeline',
      layout: device.createPipelineLayout({
        label: 'label-pipeline-layout',
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: { module: vsModule, entryPoint: 'vs', buffers: vertexBuffers },
      fragment: { module: fsPlainModule, entryPoint: 'fs', targets: colorTargets },
      // Triangle-strip topology — the four unit corners form two triangles
      // covering the glyph quad with just 4 vertices (no index buffer needed).
      primitive: { topology: 'triangle-strip' },
      // No depthStencil — labels are a pure UI overlay and do not participate
      // in depth testing.
    });

    if (occlusionCoverageBGL) {
      const fsOccludeModule = createShaderModuleWithDevLog(
        device,
        fsOccludeCode,
        'labels.fragmentOcclude',
      );
      // A SEPARATE vertex module, not 'vsModule' + a different entry point:
      // vertexOcclude.wesl imports lib::sceneDepth, which statically pulls in
      // group(1) bindings — vertex.wesl's 'vs' must stay clear of those for
      // the plain pipeline's group(1)-less layout to accept it (see
      // vertexOcclude.wesl's header).
      const vsOccludeModule = createShaderModuleWithDevLog(
        device,
        vsOccludeCode,
        'labels.vertexOcclude',
      );
      occludePipeline = device.createRenderPipeline({
        label: 'label-pipeline-occlude',
        layout: device.createPipelineLayout({
          label: 'label-pipeline-occlude-layout',
          // group 0 = the label BGL; group 1 = the shared coverage joint.
          bindGroupLayouts: [bindGroupLayout, occlusionCoverageBGL],
        }),
        vertex: { module: vsOccludeModule, entryPoint: 'vsOcclude', buffers: vertexBuffers },
        fragment: { module: fsOccludeModule, entryPoint: 'fs', targets: colorTargets },
        primitive: { topology: 'triangle-strip' },
      });
    }

    // ── Buffers ──────────────────────────────────────────────────────────
    uniformBuffer = device.createBuffer({
      label: 'label-uniforms',
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // The corner buffer is tiny (32 bytes, 4 × vec2) and static — upload once
    // at construction and reuse across every frame.
    cornerBuffer = device.createBuffer({
      label: 'label-corners',
      size: CORNER_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(cornerBuffer, 0, UNIT_QUAD_STRIP_CORNERS);

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

    // Upload each font's bitmap to its FONT_IDS-indexed layer.
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
    sampler = device.createSampler({
      label: 'label-sampler',
      magFilter: 'linear',
      minFilter: 'linear',
      addressModeU: 'clamp-to-edge',
      addressModeV: 'clamp-to-edge',
    });
  }

  // Sizes the CPU scratch arrays and, with a device, the GPU buffers above —
  // the same path `setLabels` re-enters on growth.
  allocate(INITIAL_LABEL_CAPACITY);

  // ── public methods (closures over the locals above) ────────────────────

  function setLabels(labels: readonly Label2D[]): void {
    // A roster crossing a power-of-two boundary is rare — a handful of times
    // per session, never per frame — so a full buffer rebuild here is cheap.
    if (labels.length > capacity) {
      allocate(2 ** Math.ceil(Math.log2(labels.length)));
    }

    currentGlyphCount = packLabels({
      labels,
      metricsByFont,
      layerIndexOf,
      labelF32: labelBuf,
      glyphF32,
      glyphU32,
      maxGlyphs,
    });

    // Upload to GPU only when a real device is present.
    if (!device) return;

    if (storageBuffer && labels.length > 0) {
      device.queue.writeBuffer(
        storageBuffer,
        0,
        labelBuf,
        0,
        (labels.length * LABEL_DATA_BYTES) / 4,
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

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: Vec2,
    pxPerRad: number,
    extras?: { scene?: OverlaySceneOcclusion; clipScale?: number },
  ): void {
    const scene = extras?.scene;
    if (
      !device ||
      !plainPipeline ||
      !bindGroup ||
      !uniformBuffer ||
      !cornerBuffer ||
      !instanceBuffer
    ) {
      return;
    }
    if (currentGlyphCount === 0) return;

    // The pad float 19 stays zero via Float32Array zero-init — the shared
    // writer leaves it untouched by design.
    const uni = new Float32Array(UNIFORM_BYTES / 4);
    writeCameraPrefix(uni, viewProj, viewportSize, pxPerRad);
    uni[EM_CLIP_SCALE_F32_INDEX] = extras?.clipScale ?? 1;
    device.queue.writeBuffer(uniformBuffer, 0, uni);

    // Pipeline selection: an occlusion instance draws through its occlusion
    // pipeline only when the scene views are supplied THIS frame, binding the
    // group(1) coverage joint rebuilt from them. With none (e.g. no foreground
    // body rendered this frame), it falls back to the plain pipeline and draws
    // the captions un-occluded — a valid draw, NOT an occlusion draw with
    // group(1) left unbound. A non-occlusion instance (occludePipeline null)
    // always takes the plain path.
    if (occlusionCoverageBGL && occludePipeline && occlusionDepthFrameBuffer && scene) {
      pass.setPipeline(occludePipeline);
      pass.setBindGroup(0, bindGroup);
      writeOcclusionDepthFrame(device, occlusionDepthFrameBuffer, scene.frame, viewportSize);
      const coverageBindGroup = createOcclusionCoverageBindGroup(
        device,
        occlusionCoverageBGL,
        scene,
        occlusionDepthFrameBuffer,
      );
      pass.setBindGroup(OCCLUSION_COVERAGE_GROUP_INDEX, coverageBindGroup);
    } else {
      pass.setPipeline(plainPipeline);
      pass.setBindGroup(0, bindGroup);
    }
    // Buffer slot 0: static corner quad (4 vertices, broadcast across instances).
    pass.setVertexBuffer(0, cornerBuffer);
    // Buffer slot 1: per-glyph instance data.
    pass.setVertexBuffer(1, instanceBuffer);
    // 4 vertices per triangle-strip quad × N glyph instances.
    pass.draw(4, currentGlyphCount, 0, 0);
  }

  function destroy(): void {
    uniformBuffer?.destroy();
    storageBuffer?.destroy();
    instanceBuffer?.destroy();
    cornerBuffer?.destroy();
    atlasTexture?.destroy();
    occlusionDepthFrameBuffer?.destroy();
  }

  const renderer: LabelRenderer = {
    label: 'labelRenderer',
    setLabels,
    draw,
    destroy,
  };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
