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
 * If `CameraUniforms` ever grows past 80 bytes, the constant and write
 * site here must both be updated.  See `texturedQuadRenderer.ts` for the same
 * 80-byte comment.
 *
 * ## Blend mode
 *
 * Premultiplied-alpha OVER, NOT additive.  Marker lines are UI overlay — they
 * should occlude the HDR sky content at full opacity.  Additive blend (used by
 * `texturedQuadRenderer` for emissive thumbnails) would make dark marker-line pixels
 * accumulate rather than replace, which is wrong for an opaque indicator line.
 */

import type { GpuContext } from '../../../@types/rendering/GpuContext';
import type { Renderer } from '../../../@types/rendering/Renderer';
import type { MarkerLine } from '../../../@types/rendering/MarkerLine';
import type { MarkerLineRenderer } from '../../../@types/rendering/MarkerLineRenderer';
import type { Vec2 } from '../../../@types/math/Vec2';
import vsCode from '../shaders/markerLines/vertex.wesl?static';
import fsCode from '../shaders/markerLines/fragment.wesl?static';
import { createShaderModuleWithDevLog } from '../shaderCompileLogger';

// ─── buffer constants ──────────────────────────────────────────────────────

/**
 * Uniform buffer size: 80 bytes = exactly the shared CameraUniforms prefix.
 * No renderer-specific tail is needed by the marker-line shaders at this time.
 */
const UNIFORM_BYTES = 80;

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

/**
 * Four (x,y) corners of the unit quad in triangle-strip order:
 *   (0,0), (1,0), (0,1), (1,1)
 * These are broadcast across all line instances via `stepMode: 'vertex'`.
 * The vertex shader uses `uv.x` to select which endpoint (from vs to) and
 * `uv.y` to offset by ±half-width in screen-space perpendicular.
 *
 * Identical to `labelRenderer.ts`'s CORNER_DATA — same unit-quad geometry.
 */
const CORNER_DATA = new Float32Array([0, 0, 1, 0, 0, 1, 1, 1]);
const CORNER_BYTES = CORNER_DATA.byteLength; // 32 bytes (4 × 2 × 4)

// ─── factory ──────────────────────────────────────────────────────────────

/**
 * Construct a `MarkerLineRenderer` against the given GPU context.
 *
 * Pass `device: null` (or a GpuContext whose `device` is null) for unit
 * tests that exercise CPU state only.  GPU resource creation is skipped
 * in that branch and `draw(...)` becomes a no-op.
 *
 * `maxLines` sizes the static GPU instance buffer; the default (64) covers
 * the "you are here" indicator plus any future tagged-object markers without
 * a follow-up resize.
 */
export function createMarkerLineRenderer(ctx: GpuContext, maxLines = 64): MarkerLineRenderer {
  // The `as ... | null` cast lets a test pass `device: null as unknown as
  // GPUDevice` through GpuContext without TypeScript complaining at the
  // factory's call site.  Runtime code below null-checks before each use.
  const device = ctx.device as GPUDevice | null;
  const format = ctx.format;

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
  let pipeline: GPURenderPipeline | null = null;
  let uniformBuffer: GPUBuffer | null = null;
  let gpuInstanceBuffer: GPUBuffer | null = null;
  let cornerBuffer: GPUBuffer | null = null;
  let bindGroup: GPUBindGroup | null = null;

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

    // ── Pipeline ──────────────────────────────────────────────────────────
    const vsModule = createShaderModuleWithDevLog(device, vsCode, 'markerLines.vertex');
    const fsModule = createShaderModuleWithDevLog(device, fsCode, 'markerLines.fragment');

    pipeline = device.createRenderPipeline({
      label: 'marker-line-pipeline',
      layout: device.createPipelineLayout({
        label: 'marker-line-pipeline-layout',
        bindGroupLayouts: [bindGroupLayout],
      }),
      vertex: {
        module: vsModule,
        entryPoint: 'vs',
        buffers: [
          // Buffer 0: unit-corner quad, 4 vertices, stepMode 'vertex'.
          // Provides (x,y) unit-square corners to location 0 (`uv`).
          // uv.x selects endpoint (from vs to); uv.y selects side (±half-width).
          {
            arrayStride: 8, // 2 × f32
            stepMode: 'vertex',
            attributes: [{ shaderLocation: 0, offset: 0, format: 'float32x2' }],
          },
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
        ],
      },
      fragment: {
        module: fsModule,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Premultiplied-alpha OVER blend.  Marker lines are UI overlay,
            // not emissive content: at alpha=0 they should be fully
            // transparent against whatever's behind them, not additive.
            // Using 'one-minus-src-alpha' for dst preserves the existing
            // HDR content at line-free pixels while the line alpha fades.
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
            },
          },
        ],
      },
      // Triangle-strip topology — the four unit corners form two triangles
      // covering the line quad with just 4 vertices (no index buffer needed).
      primitive: { topology: 'triangle-strip' },
      // No depthStencil — marker lines are a pure UI overlay and do not
      // participate in depth testing.  Enabling depth write would occlude
      // geometry rendered after the line pass at zero cost benefit.
    });

    // ── Buffers ───────────────────────────────────────────────────────────
    uniformBuffer = device.createBuffer({
      label: 'marker-line-uniforms',
      size: UNIFORM_BYTES,
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
    device.queue.writeBuffer(cornerBuffer, 0, CORNER_DATA);

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

  function draw(pass: GPURenderPassEncoder, viewProj: Float32Array, viewportSize: Vec2): void {
    if (
      !device ||
      !pipeline ||
      !bindGroup ||
      !uniformBuffer ||
      !cornerBuffer ||
      !gpuInstanceBuffer
    ) {
      return;
    }
    if (currentLineCount === 0) return;

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
