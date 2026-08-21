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
 * typed handles, not class instances.  Internal state (CPU scratch buffers, running counts,
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
 * The size const and the prefix write both come from
 * `lib/cameraUniforms.ts`, the TS twin of the WESL struct — if
 * `CameraUniforms` ever grows past 80 bytes, that one module is the
 * place to change.  See `instancedQuadRenderer.ts` for the same prefix
 * with a per-renderer tail after it.
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
import { layoutLabel } from '../../labelLayout/labelLayout';
import { measureLabel } from '../../labelLayout/measureLabel';
import type { LabelBBox } from '../../../../@types/rendering/LabelBBox';
import vsCode from '../../shaders/labels/vertex.wesl?static';
import fsCode from '../../shaders/labels/fragment.wesl?static';
import fsOccludeCode from '../../shaders/labels/fragmentOcclude.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import {
  OCCLUSION_DEPTH_GROUP_INDEX,
  OCCLUSION_DEPTH_LAYOUT_DESC,
  createOcclusionDepthBindGroup,
} from './occlusionDepthGroup';
import { CAMERA_UNIFORM_BYTES, writeCameraPrefix } from '../../lib/cameraUniforms';
import { UNIT_QUAD_STRIP_CORNERS, UNIT_QUAD_VERTEX_LAYOUT } from '../../lib/unitQuad';
import { PREMULTIPLIED_OVER_BLEND } from '../../lib/blendStates';

// ─── sizing defaults ───────────────────────────────────────────────────────

/**
 * Defaults applied when a Label omits its sizing fields (see the
 * corresponding docstrings on the Label type).  Exported because the
 * label director's rect-based declutter reproduces the vertex shader's
 * `clamp(worldLenToPx(worldEmMpc), minPx, maxPx)` on the CPU — reading
 * the defaults from here keeps the two computations from drifting.
 */
export const LABEL_WORLD_EM_MPC_DEFAULT = 0.01;
export const LABEL_MIN_PX_DEFAULT = 8;
export const LABEL_MAX_PX_DEFAULT = 64;

// ─── buffer constants ──────────────────────────────────────────────────────

/**
 * Per-label storage buffer stride, matching `struct LabelData` in io.wesl:
 *
 *   bytes  0..15  worldPos      vec4<f32>  — xyz = world Mpc, w = worldEmMpc
 *   bytes 16..31  color         vec4<f32>  — premultiplied rgba (fill)
 *   bytes 32..47  sizing        vec4<f32>  — outlineEmFrac, minPx, maxPx, fadeAlpha
 *   bytes 48..63  outlineColor  vec4<f32>  — premultiplied rgba (outline stroke)
 *
 * 4 × 16 bytes = 64 bytes/label.  `sizing.x` repurposes the legacy
 * `pixelSize` slot (ignored by the shader since the worldEmMpc
 * migration) to carry `outlineEmFrac`, sparing a fresh vec4 for one
 * scalar.
 */
const LABEL_DATA_BYTES = 64;

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
 * `maxLabels` and `maxGlyphsPerLabel` size the static GPU buffers; the
 * defaults (64 × 64 = 4096 glyphs) cover the "you are here" + a few
 * future tagged-galaxy markers without a follow-up resize.
 *
 * `opts.occludeAgainstDepth` opts this instance into per-pixel occlusion
 * behind nearer solar-system bodies, and selects WHICH occluder.  When set,
 * the pipeline gains a group(1) depth binding (`OCCLUSION_DEPTH_LAYOUT_DESC`)
 * and compiles a discard-gated `fragmentOcclude.wesl` entry instead of the
 * plain `fragment.wesl`; `draw` then consumes a per-frame scene depth view.
 * The mode picks the entry point:
 *   - `'compare'`  → the `fs` entry (depth COMPARE) for NEAR0 foreground
 *     captions that share the bodies' slab, so a caption stays visible over
 *     its own body.
 *   - `'coverage'` → the `fsCoverage` entry (pure COVERAGE) for the COSMO
 *     overlay labels, whose window-Z is in a different projection than the
 *     NEAR0 body depths, so any body depth written at the pixel occludes them.
 * The default (opts omitted) keeps the plain single-BGL, non-occluding
 * pipeline — byte-for-byte unchanged.
 */
export function createLabelRenderer(
  ctx: GpuContext,
  targetFormat: GPUTextureFormat,
  atlases: LoadedFontAtlases,
  maxLabels = 64,
  maxGlyphsPerLabel = 64,
  opts?: { occludeAgainstDepth?: 'compare' | 'coverage' },
): LabelRenderer {
  // The `as ... | null` cast lets a test pass `device: null as unknown as
  // GPUDevice` through GpuContext without TypeScript complaining at the
  // factory's call site.  Runtime code below null-checks before each use.
  const device = ctx.device as GPUDevice | null;
  const format = targetFormat;
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
  // by `setLabels`; read by `draw`, `glyphCount`, `labelCount`.
  let currentGlyphCount = 0;
  let currentLabelCount = 0;

  // ── GPU resources (null when device is null) ─────────────────────────────
  //
  // The occlusion instance builds BOTH pipelines and picks per-draw:
  // `plainPipeline` (single BGL) whenever no scene depth is supplied this frame,
  // `occludePipeline` (two BGLs, discard-gated fragment) when it is. A
  // non-occlusion instance builds only `plainPipeline` and leaves the other null.
  let plainPipeline: GPURenderPipeline | null = null;
  let occludePipeline: GPURenderPipeline | null = null;
  let uniformBuffer: GPUBuffer | null = null;
  let storageBuffer: GPUBuffer | null = null;
  let instanceBuffer: GPUBuffer | null = null;
  let cornerBuffer: GPUBuffer | null = null;
  let atlasTexture: GPUTexture | null = null;
  let bindGroup: GPUBindGroup | null = null;
  // Retained only on the occlusion path — the group(1) depth BGL that
  // `draw` rebuilds a per-frame bind group against.  Null on the plain
  // path (and whenever device is null), which is what gates `draw`'s
  // occlusion branch.
  let occlusionDepthBGL: GPUBindGroupLayout | null = null;

  // The occlude MODE, or undefined for a plain instance. Present ⇒ build the
  // occlude pipeline + depth BGL (exactly as the old boolean did); the mode
  // then selects the fragment ENTRY POINT — see the factory docblock.
  const occludeMode = opts?.occludeAgainstDepth;

  if (device) {
    // ── Bind group layout ────────────────────────────────────────────────
    //
    // Four bindings matching the labels shaders (io.wesl + lib/msdf.wesl):
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
    // When this instance occludes against scene depth, the pipeline gains a
    // second bind-group layout at group 1 (the shared depth joint) and
    // compiles the discard-gated fragment entry.  `occlusionDepthBGL` is
    // retained so `draw` can rebuild its per-frame bind group (the depth
    // view changes on every resize — see occlusionDepthGroup.ts).
    if (occludeMode != null) {
      occlusionDepthBGL = device.createBindGroupLayout(OCCLUSION_DEPTH_LAYOUT_DESC);
    }

    // ── Pipelines ────────────────────────────────────────────────────────
    //
    // An occlusion instance builds BOTH pipelines and picks per-draw. `draw`
    // selects `occludePipeline` only when handed a scene depth view THIS frame,
    // and falls back to `plainPipeline` otherwise — so a frame in which no
    // foreground body drew (hence no valid scene depth) still paints its
    // captions un-occluded through a VALID draw, rather than an occlusion draw
    // with group(1) left unbound. A non-occlusion instance builds only the
    // plain pipeline.
    const vsModule = createShaderModuleWithDevLog(device, vsCode, 'labels.vertex');

    // Both pipelines draw the identical geometry into the identical target;
    // only the fragment entry and the group(1) depth binding differ, so the
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

    if (occlusionDepthBGL) {
      const fsOccludeModule = createShaderModuleWithDevLog(
        device,
        fsOccludeCode,
        'labels.fragmentOcclude',
      );
      occludePipeline = device.createRenderPipeline({
        label: 'label-pipeline-occlude',
        layout: device.createPipelineLayout({
          label: 'label-pipeline-occlude-layout',
          // group 0 = the label BGL; group 1 = the shared depth joint.
          bindGroupLayouts: [bindGroupLayout, occlusionDepthBGL],
        }),
        vertex: { module: vsModule, entryPoint: 'vs', buffers: vertexBuffers },
        fragment: {
          module: fsOccludeModule,
          // COVERAGE for the cross-slab COSMO overlays, COMPARE for the
          // same-slab NEAR0 captions — see the factory docblock.
          entryPoint: occludeMode === 'coverage' ? 'fsCoverage' : 'fs',
          targets: colorTargets,
        },
        primitive: { topology: 'triangle-strip' },
      });
    }

    // ── Buffers ──────────────────────────────────────────────────────────
    uniformBuffer = device.createBuffer({
      label: 'label-uniforms',
      size: CAMERA_UNIFORM_BYTES,
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

  function setLabels(labels: readonly Label2D[]): void {
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

      // Write per-label storage record (96 bytes, 24 floats) unconditionally
      // — even when `quads` is empty.  Keeping the per-label index stable
      // across the outer loop matters because each glyph carries its
      // labelIndex by position; if we skipped a label whose text produced
      // no known glyphs, every subsequent glyph would point to the wrong
      // label entry.  An unused storage slot is harmless (no glyph
      // references it, the GPU never reads it).
      //
      //   [0..3]   worldPos     (x, y, z, worldEmMpc)
      //   [4..7]   color        (r*a, g*a, b*a, a — premultiplied)
      //   [8..11]  sizing       (outlineEmFrac, minPx, maxPx, fadeAlpha)
      //   [12..15] outlineColor (r*a, g*a, b*a, a)
      const labelBase = li * (LABEL_DATA_BYTES / 4);
      labelBuf[labelBase + 0] = label.worldPos[0];
      labelBuf[labelBase + 1] = label.worldPos[1];
      labelBuf[labelBase + 2] = label.worldPos[2];
      labelBuf[labelBase + 3] = label.worldEmMpc ?? LABEL_WORLD_EM_MPC_DEFAULT;

      // Public colour API is STRAIGHT RGBA — producers write the natural
      // form (`[1, 0, 0, 0.5]` is "half-transparent red"); the fragment
      // shader composites in premultiplied space, so we multiply r/g/b
      // by a here on the write boundary.
      const color = label.color ?? [1, 1, 1, 1];
      const ca = color[3]!;
      labelBuf[labelBase + 4] = color[0]! * ca;
      labelBuf[labelBase + 5] = color[1]! * ca;
      labelBuf[labelBase + 6] = color[2]! * ca;
      labelBuf[labelBase + 7] = ca;

      labelBuf[labelBase + 8] = label.outlineEmFrac ?? 0;
      labelBuf[labelBase + 9] = label.minPixelSize ?? LABEL_MIN_PX_DEFAULT;
      labelBuf[labelBase + 10] = label.maxPixelSize ?? LABEL_MAX_PX_DEFAULT;
      labelBuf[labelBase + 11] = label.fadeAlpha ?? 1;

      // outline colour — same straight → premultiplied conversion as fill.
      // Default [0,0,0,0] makes outlineEmFrac irrelevant (band alpha is 0).
      const outlineColor = label.outlineColor ?? [0, 0, 0, 0];
      const oa = outlineColor[3]!;
      labelBuf[labelBase + 12] = outlineColor[0]! * oa;
      labelBuf[labelBase + 13] = outlineColor[1]! * oa;
      labelBuf[labelBase + 14] = outlineColor[2]! * oa;
      labelBuf[labelBase + 15] = oa;

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

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: Vec2,
    sceneDepthView?: GPUTextureView,
  ): void {
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

    // Pack uniforms (80 bytes = CameraUniforms prefix only).  The pad
    // floats 18..19 stay zero via Float32Array zero-init — the shared
    // writer leaves them untouched by design.
    const uni = new Float32Array(CAMERA_UNIFORM_BYTES / 4);
    writeCameraPrefix(uni, viewProj, viewportSize);
    device.queue.writeBuffer(uniformBuffer, 0, uni);

    // Pipeline selection: an occlusion instance draws through its occlusion
    // pipeline only when a scene depth view is supplied THIS frame, binding the
    // group(1) depth joint rebuilt from that view. With no depth view (e.g. no
    // foreground body rendered this frame), it falls back to the plain pipeline
    // and draws the captions un-occluded — a valid draw, NOT an occlusion draw
    // with group(1) left unbound. A non-occlusion instance (occludePipeline
    // null) always takes the plain path.
    if (occlusionDepthBGL && occludePipeline && sceneDepthView) {
      pass.setPipeline(occludePipeline);
      pass.setBindGroup(0, bindGroup);
      const depthBindGroup = createOcclusionDepthBindGroup(
        device,
        occlusionDepthBGL,
        sceneDepthView,
      );
      pass.setBindGroup(OCCLUSION_DEPTH_GROUP_INDEX, depthBindGroup);
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

  function glyphCount(): number {
    return currentGlyphCount;
  }

  function labelCount(): number {
    return currentLabelCount;
  }

  // Memoized ink-bbox measurement.  The director's declutter measures
  // every candidate label every frame; the bbox depends only on
  // (font, alignment, text), all of which are stable for a given label
  // id, so the cache converges to one entry per distinct label and the
  // steady-state cost is a Map lookup.  Unbounded by design: the key
  // space is the label catalog (~hundreds), not user input.
  const measureCache = new Map<string, LabelBBox | null>();
  function measure(label: Label2D): LabelBBox | null {
    const alignX = label.alignX ?? 'left';
    const alignY = label.alignY ?? 'baseline';
    const key = `${label.font}|${alignX}|${alignY}|${label.text}`;
    let bbox = measureCache.get(key);
    if (bbox === undefined) {
      bbox = measureLabel(label.text, metricsByFont[label.font], alignX, alignY);
      measureCache.set(key, bbox);
    }
    return bbox;
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
    measure,
    draw,
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
