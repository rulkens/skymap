/**
 * markerLineRenderer — screen-space thick-line overlay pass for the 3D sky map.
 *
 * Renders a set of world-anchored line segments as instanced thick quads.
 * Each line segment expands into a screen-aligned rectangle between its two
 * world-space endpoints.  The vertex stage projects both endpoints to clip
 * space, computes the screen-space perpendicular, and offsets each quad
 * corner by ±half-width in NDC.  The fragment stage applies a smooth
 * one-pixel anti-aliased falloff perpendicular to the line, so thick lines
 * stay crisp at any pixel width without staircasing.
 *
 * ## Why a closure-keyed factory and not a class?
 *
 * Same convention every other freshly-extracted handle in the engine
 * follows (`thumbnailSubsystem`, `biasCorrectionSubsystem`,
 * the `Pass` object literals in `engine/frame/passes/`): factories return
 * typed handles, not class instances.  Internal state (CPU scratch buffer,
 * running count, pipeline + bind-group reference) is genuinely inaccessible
 * from outside the
 * closure — there is no `this.instanceBuf` to reach in and poke from a
 * misbehaving caller — and the `type` aliases convention (CLAUDE.md)
 * deliberately rejects the inheritance escape hatch a class would otherwise
 * carry.  Existing renderers (Point/Quad/Disk/…) are still classes for now;
 * new renderers from this point on follow the factory shape.
 *
 * ## Why no storage buffer?
 *
 * Labels needed a storage buffer because all glyphs of one label share world
 * position, color, and sizing — duplicating those into every glyph instance
 * would be wasteful.  Marker lines have no such grouping: every quad already
 * carries its full state (endpoints + color + width + fade) through the
 * per-instance vertex attributes.  No indirect lookup is needed, so the
 * bind group layout shrinks to a single uniform binding.
 *
 * ## Why a separate renderer instead of reusing filaments?
 *
 * Filaments are an emissive overlay using ADDITIVE blend with per-segment
 * density driving brightness — they're a scientific data layer.  Marker lines
 * are UI overlay (premultiplied OVER blend, fade-alpha gate) and must occlude
 * rather than accumulate.  Sharing one renderer would mean branching the blend
 * state at draw time.  Two small pipelines is cleaner.  See
 * `shaders/markerLines/io.wesl` for the full rationale.
 *
 * ## Uniform layout (CameraUniforms, 80 bytes)
 *
 * The marker-line shaders use only the shared `CameraUniforms` prefix from
 * `shaders/lib/camera.wesl` — no renderer-specific tail.  That prefix is:
 *
 *   bytes  0..63  viewProj     mat4x4<f32>
 *   bytes 64..71  viewportPx   vec2<f32>
 *   bytes 72..79  _pad0, _pad1 two reserved f32s (must stay zero)
 *
 * The size const and the prefix write both come from
 * `lib/cameraUniforms.ts`, the TS twin of the WESL struct — if
 * `CameraUniforms` ever grows past 80 bytes, that one module is the
 * place to change.
 *
 * ## Blend mode
 *
 * Premultiplied-alpha OVER, NOT additive.  Marker lines are UI overlay — they
 * should occlude the HDR sky content at full opacity.  Additive blend (used by
 * `texturedQuadRenderer` for emissive thumbnails) would make dark marker-line pixels
 * accumulate rather than replace, which is wrong for an opaque indicator line.
 */

import type { GpuContext } from '../../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../../@types/rendering/Renderer';
import type { MarkerLine } from '../../../../@types/rendering/MarkerLine';
import type { MarkerLineRenderer } from '../../../../@types/rendering/MarkerLineRenderer';
import type { Vec2 } from '../../../../@types/math/Vec2';
import vsCode from '../../shaders/markerLines/vertex.wesl?static';
import fsCode from '../../shaders/markerLines/fragment.wesl?static';
import fsOccludeCode from '../../shaders/markerLines/fragmentOcclude.wesl?static';
import { createShaderModuleWithDevLog } from '../../shaderCompileLogger';
import {
  OCCLUSION_COVERAGE_GROUP_INDEX,
  OCCLUSION_COVERAGE_LAYOUT_DESC,
  createOcclusionCoverageBindGroup,
} from './occlusionCoverageGroup';
import { CAMERA_UNIFORM_BYTES, writeCameraPrefix } from '../../lib/cameraUniforms';
import { UNIT_QUAD_STRIP_CORNERS, UNIT_QUAD_VERTEX_LAYOUT } from '../../lib/unitQuad';
import { PREMULTIPLIED_OVER_BLEND } from '../../lib/blendStates';

// ─── buffer constants ──────────────────────────────────────────────────────

/**
 * Per-instance vertex buffer stride, matching `VsIn` attributes 1–3 in io.wesl:
 *
 *   bytes  0..15  fromAndWidth  vec4<f32> — fromWorld.xyz, pixelWidth
 *   bytes 16..31  toAndAlpha    vec4<f32> — toWorld.xyz, fadeAlpha
 *   bytes 32..47  color         vec4<f32> — rgba premultiplied
 *
 * 3 × vec4 = 3 × 16 bytes = 48 bytes/instance.
 *
 * Packing pixelWidth and fadeAlpha into the trailing slot of the world-position
 * vec3s saves 16 bytes per instance versus carrying them as separate vec4
 * attributes — same trick as the filament renderer's density field.
 */
const LINE_INSTANCE_BYTES = 48;

// ─── corner buffer ────────────────────────────────────────────────────────

// The unit-quad corners + their slot-0 layout come from `lib/unitQuad.ts`,
// shared byte-for-byte with the label and debug-line overlays.  The vertex
// shader uses `uv.x` to select which endpoint (from vs to) and `uv.y` to
// offset by ±half-width in the screen-space perpendicular.
const CORNER_BYTES = UNIT_QUAD_STRIP_CORNERS.byteLength; // 32 bytes (4 × 2 × 4)

// ─── factory ──────────────────────────────────────────────────────────────

/**
 * Construct a `MarkerLineRenderer` against the given GPU context and
 * colour-target format.
 *
 * Pass `device: null` (or a GpuContext whose `device` is null) for unit
 * tests that exercise CPU state only.  GPU resource creation is skipped
 * in that branch and `draw(...)` becomes a no-op.
 *
 * `targetFormat` is the colour-attachment format the pipeline writes into.
 * Marker lines are a post-tone-map UI overlay, so this is the swap-chain
 * format — but it is passed EXPLICITLY rather than read off `ctx.format`, so
 * the target is legible at the construction site.
 *
 * `maxLines` sizes the static GPU instance buffer; the default (64) covers
 * the "you are here" indicator plus any future tagged-object markers without
 * a follow-up resize.
 *
 * `opts.occludeAgainstDepth` opts this instance into per-pixel occlusion
 * behind an opaque solar-system body.  When set, the pipeline gains a
 * group(1) coverage binding (`OCCLUSION_COVERAGE_LAYOUT_DESC`) and compiles
 * a discard-gated `fragmentOcclude.wesl` entry instead of the plain
 * `fragment.wesl`; `draw` then consumes a per-frame scene colour view.  The
 * mode picks the entry point — `'compare'` → `fs`, `'coverage'` → `fsCoverage`
 * — but both entries run the identical alpha-coverage test now (see that
 * file's header): the split is a naming hook for this call site, not a live
 * behavioural difference.  The default (opts omitted) keeps the plain
 * single-BGL, non-occluding pipeline the Milky Way + structure leader lines
 * rely on — byte-for-byte unchanged.
 */
export function createMarkerLineRenderer(
  ctx: GpuContext,
  targetFormat: GPUTextureFormat,
  maxLines = 64,
  opts?: { occludeAgainstDepth?: 'compare' | 'coverage' },
): MarkerLineRenderer {
  // The `as ... | null` cast lets a test pass `device: null as unknown as
  // GPUDevice` through GpuContext without TypeScript complaining at the
  // factory's call site.  Runtime code below null-checks before each use.
  const device = ctx.device as GPUDevice | null;
  const format = targetFormat;

  // ── CPU scratch buffer — always allocated, safe to use with null device ──
  //
  // 12 floats per instance × 4 bytes = 48 bytes = LINE_INSTANCE_BYTES.
  // All fields are f32 so a single Float32Array suffices — no u32 fields
  // unlike the label renderer's glyph instance buffer.
  const instanceBuf = new Float32Array(maxLines * (LINE_INSTANCE_BYTES / 4));

  // Closure-scoped mutable counter — replaces the `this.currentLineCount`
  // field the class form would use.  Updated only by `setLines`; read by
  // `draw` and `lineCount`.
  let currentLineCount = 0;

  // ── GPU resources (null when device is null) ─────────────────────────────
  //
  // The occlusion instance builds BOTH pipelines and picks per-draw:
  // `plainPipeline` (single BGL) whenever no scene colour is supplied this frame,
  // `occludePipeline` (two BGLs, discard-gated fragment) when it is. A
  // non-occlusion instance builds only `plainPipeline` and leaves the other null.
  let plainPipeline: GPURenderPipeline | null = null;
  let occludePipeline: GPURenderPipeline | null = null;
  let uniformBuffer: GPUBuffer | null = null;
  let gpuInstanceBuffer: GPUBuffer | null = null;
  let cornerBuffer: GPUBuffer | null = null;
  let bindGroup: GPUBindGroup | null = null;
  // Retained only on the occlusion path — the group(1) coverage BGL that
  // `draw` rebuilds a per-frame bind group against.  Null on the plain
  // path (and whenever device is null), which is what gates `draw`'s
  // occlusion branch.
  let occlusionCoverageBGL: GPUBindGroupLayout | null = null;

  // The occlude MODE, or undefined for a plain instance. Present ⇒ build the
  // occlude pipeline + coverage BGL (exactly as the old boolean did); the mode
  // then selects the fragment ENTRY POINT — see the factory docblock.
  const occludeMode = opts?.occludeAgainstDepth;

  if (device) {
    // ── Bind group layout ─────────────────────────────────────────────────
    //
    // One binding, matching `vertex.wesl`'s `@group(0) @binding(0)`:
    //   0 → uniform buffer  (CameraUniforms, vertex-visible)
    //
    // The fragment stage reads no bound resource — only the interpolated
    // `color` and `uv` varyings from the vertex stage — so it does not
    // appear here.
    const bindGroupLayout = device.createBindGroupLayout({
      label: 'marker-line-bgl',
      entries: [{ binding: 0, visibility: GPUShaderStage.VERTEX, buffer: { type: 'uniform' } }],
    });

    // ── Occlusion joint (opt-in) ─────────────────────────────────────────
    //
    // When this instance occludes against scene coverage, the pipeline gains a
    // second bind-group layout at group 1 (the shared coverage joint) and
    // compiles the discard-gated fragment entry.  `occlusionCoverageBGL` is
    // retained so `draw` can rebuild its per-frame bind group (the colour
    // view changes on every resize — see occlusionCoverageGroup.ts).
    if (occludeMode != null) {
      occlusionCoverageBGL = device.createBindGroupLayout(OCCLUSION_COVERAGE_LAYOUT_DESC);
    }

    // ── Pipelines ─────────────────────────────────────────────────────────
    //
    // An occlusion instance builds BOTH pipelines and picks per-draw. `draw`
    // selects `occludePipeline` only when handed a scene colour view THIS frame,
    // and falls back to `plainPipeline` otherwise — so a frame in which no
    // foreground body drew (hence no valid scene colour) still paints its
    // connectors un-occluded through a VALID draw, rather than an occlusion
    // draw with group(1) left unbound. A non-occlusion instance builds only
    // the plain pipeline.
    const vsModule = createShaderModuleWithDevLog(device, vsCode, 'markerLines.vertex');

    // Both pipelines draw the identical geometry into the identical target;
    // only the fragment entry and the group(1) coverage binding differ, so the
    // vertex-buffer + colour-target descriptors are shared.
    const vertexBuffers: GPUVertexBufferLayout[] = [
      // Buffer 0: unit-corner quad, 4 vertices, stepMode 'vertex'.
      // Provides (x,y) unit-square corners to location 0 (`uv`).
      // uv.x selects endpoint (from vs to); uv.y selects side (±half-width).
      UNIT_QUAD_VERTEX_LAYOUT,
      // Buffer 1: per-instance line data, stepMode 'instance'.
      // Provides fromAndWidth, toAndAlpha, color to locations 1–3.
      {
        arrayStride: LINE_INSTANCE_BYTES, // 48 bytes = 3 × vec4
        stepMode: 'instance',
        attributes: [
          { shaderLocation: 1, offset: 0, format: 'float32x4' }, // fromAndWidth
          { shaderLocation: 2, offset: 16, format: 'float32x4' }, // toAndAlpha
          { shaderLocation: 3, offset: 32, format: 'float32x4' }, // color
        ],
      },
    ];
    // Premultiplied-alpha OVER blend.  Marker lines are UI overlay, not
    // emissive content: at alpha=0 they should be fully transparent against
    // whatever's behind them, not additive.  'one-minus-src-alpha' for dst
    // preserves the existing HDR content at line-free pixels while the line
    // alpha fades.
    const colorTargets: GPUColorTargetState[] = [{ format, blend: PREMULTIPLIED_OVER_BLEND }];

    const fsPlainModule = createShaderModuleWithDevLog(device, fsCode, 'markerLines.fragment');
    plainPipeline = device.createRenderPipeline({
      label: 'marker-line-pipeline',
      layout: device.createPipelineLayout({
        label: 'marker-line-pipeline-layout',
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: { module: vsModule, entryPoint: 'vs', buffers: vertexBuffers },
      fragment: { module: fsPlainModule, entryPoint: 'fs', targets: colorTargets },
      // Triangle-strip topology — the four unit corners form two triangles
      // covering the line quad with just 4 vertices (no index buffer needed).
      primitive: { topology: 'triangle-strip' },
      // No depthStencil — marker lines are a pure UI overlay and do not
      // participate in depth testing.
    });

    if (occlusionCoverageBGL) {
      const fsOccludeModule = createShaderModuleWithDevLog(
        device,
        fsOccludeCode,
        'markerLines.fragmentOcclude',
      );
      occludePipeline = device.createRenderPipeline({
        label: 'marker-line-pipeline-occlude',
        layout: device.createPipelineLayout({
          label: 'marker-line-pipeline-occlude-layout',
          // group 0 = the marker-line BGL; group 1 = the shared coverage joint.
          bindGroupLayouts: [bindGroupLayout, occlusionCoverageBGL],
        }),
        vertex: { module: vsModule, entryPoint: 'vs', buffers: vertexBuffers },
        fragment: {
          module: fsOccludeModule,
          // Both entries run the identical alpha-coverage test now — the
          // 'compare'/'coverage' mode only picks which entry point compiles
          // in, a naming hook for callers (see the factory docblock).
          entryPoint: occludeMode === 'coverage' ? 'fsCoverage' : 'fs',
          targets: colorTargets,
        },
        primitive: { topology: 'triangle-strip' },
      });
    }

    // ── Buffers ───────────────────────────────────────────────────────────
    uniformBuffer = device.createBuffer({
      label: 'marker-line-uniforms',
      size: CAMERA_UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    gpuInstanceBuffer = device.createBuffer({
      label: 'marker-line-instances',
      size: maxLines * LINE_INSTANCE_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    // The corner buffer is tiny (32 bytes, 4 × vec2) and static — upload once
    // at construction and reuse across every frame.
    cornerBuffer = device.createBuffer({
      label: 'marker-line-corners',
      size: CORNER_BYTES,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(cornerBuffer, 0, UNIT_QUAD_STRIP_CORNERS);

    // ── Bind group ────────────────────────────────────────────────────────
    bindGroup = device.createBindGroup({
      label: 'marker-line-bg',
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: uniformBuffer } }],
    });
  }

  // ── public methods (closures over the locals above) ────────────────────

  function setLines(lines: MarkerLine[]): void {
    currentLineCount = 0;

    const count = Math.min(lines.length, maxLines);
    for (let i = 0; i < count; i++) {
      const line = lines[i]!;

      // Pack 12 floats into the CPU scratch buffer at stride 12 (48 bytes):
      //
      //   [0..2]  fromWorld.xyz  — line start in world Mpc
      //   [3]     pixelWidth     — full line width in CSS pixels
      //   [4..6]  toWorld.xyz    — line end in world Mpc
      //   [7]     fadeAlpha      — multiplied into colour by vertex stage
      //   [8..11] color          — premultiplied rgba
      //
      // All fields are f32 so we write directly through the Float32Array —
      // no Uint32Array aliasing needed (unlike labelRenderer's glyph buffer
      // which carries a u32 labelIndex at offset 8).
      const base = i * (LINE_INSTANCE_BYTES / 4); // 12 f32s per instance
      instanceBuf[base + 0] = line.fromWorld[0];
      instanceBuf[base + 1] = line.fromWorld[1];
      instanceBuf[base + 2] = line.fromWorld[2];
      instanceBuf[base + 3] = line.pixelWidth;
      instanceBuf[base + 4] = line.toWorld[0];
      instanceBuf[base + 5] = line.toWorld[1];
      instanceBuf[base + 6] = line.toWorld[2];
      instanceBuf[base + 7] = line.fadeAlpha ?? 1;
      instanceBuf[base + 8] = line.color[0]!;
      instanceBuf[base + 9] = line.color[1]!;
      instanceBuf[base + 10] = line.color[2]!;
      instanceBuf[base + 11] = line.color[3]!;

      currentLineCount++;
    }

    // Upload to GPU only when a real device is present.
    if (!device) return;

    if (gpuInstanceBuffer && currentLineCount > 0) {
      device.queue.writeBuffer(
        gpuInstanceBuffer,
        0,
        instanceBuf,
        0,
        currentLineCount * (LINE_INSTANCE_BYTES / 4),
      );
    }
  }

  function draw(
    pass: GPURenderPassEncoder,
    viewProj: Float32Array,
    viewportSize: Vec2,
    sceneColorView?: GPUTextureView,
  ): void {
    if (
      !device ||
      !plainPipeline ||
      !bindGroup ||
      !uniformBuffer ||
      !cornerBuffer ||
      !gpuInstanceBuffer
    ) {
      return;
    }
    if (currentLineCount === 0) return;

    // Pack uniforms (80 bytes = CameraUniforms prefix only).  The pad
    // floats 18..19 stay zero via Float32Array zero-init — the shared
    // writer leaves them untouched by design.
    const uni = new Float32Array(CAMERA_UNIFORM_BYTES / 4);
    writeCameraPrefix(uni, viewProj, viewportSize);
    device.queue.writeBuffer(uniformBuffer, 0, uni);

    // Pipeline selection: an occlusion instance draws through its occlusion
    // pipeline only when a scene colour view is supplied THIS frame, binding the
    // group(1) coverage joint rebuilt from that view. With no colour view (e.g.
    // no foreground body rendered this frame), it falls back to the plain
    // pipeline and draws the connectors un-occluded — a valid draw, NOT an
    // occlusion draw with group(1) left unbound. A non-occlusion instance
    // (occludePipeline null) always takes the plain path.
    if (occlusionCoverageBGL && occludePipeline && sceneColorView) {
      pass.setPipeline(occludePipeline);
      pass.setBindGroup(0, bindGroup);
      const coverageBindGroup = createOcclusionCoverageBindGroup(
        device,
        occlusionCoverageBGL,
        sceneColorView,
      );
      pass.setBindGroup(OCCLUSION_COVERAGE_GROUP_INDEX, coverageBindGroup);
    } else {
      pass.setPipeline(plainPipeline);
      pass.setBindGroup(0, bindGroup);
    }
    // Buffer slot 0: static corner quad (4 vertices, broadcast across instances).
    pass.setVertexBuffer(0, cornerBuffer);
    // Buffer slot 1: per-line instance data.
    pass.setVertexBuffer(1, gpuInstanceBuffer);
    // 4 vertices per triangle-strip quad × N line instances.
    pass.draw(4, currentLineCount, 0, 0);
  }

  function lineCount(): number {
    return currentLineCount;
  }

  function destroy(): void {
    uniformBuffer?.destroy();
    gpuInstanceBuffer?.destroy();
    cornerBuffer?.destroy();
  }

  const renderer: MarkerLineRenderer = {
    label: 'markerLineRenderer',
    setLines,
    draw,
    lineCount,
    destroy,
  };
  // `satisfies Renderer` confirms the shared label+destroy contract at
  // compile time without widening the static type seen by consumers.
  renderer satisfies Renderer;
  return renderer;
}
