/**
 * PointRenderer — GPU pipeline owner for instanced billboard point sprites.
 *
 * ### How it pairs with points.wgsl
 *
 * The WGSL shader draws each catalog point as a tiny quad (two triangles,
 * six vertices) using WebGPU's *instanced draw* mechanism:
 *
 *   draw(vertexCount=6, instanceCount=N)
 *
 * The vertex shader receives:
 *   - `@builtin(vertex_index)` cycling 0..5 — which corner of the billboard
 *     quad this invocation draws.
 *   - Per-instance attributes (`@location(0..2)`) — the catalog point's world
 *     position, magnitude, and colour index — read once per *point*, not once
 *     per vertex.
 *
 * This class is responsible for:
 *   1. Compiling the shader and building the `GPURenderPipeline`.
 *   2. Allocating a `GPUBuffer` for the `Uniforms` struct (viewProj, viewport,
 *      pointSizePx, brightness) and binding it to @group(0) @binding(0).
 *   3. Packing catalog data into a tightly-interleaved `GPUBuffer` configured
 *      with `stepMode: 'instance'`.
 *   4. Writing uniforms and issuing the draw call each frame.
 *
 * ### Relationship to other modules
 *
 *   PointCloud  →  upload()  →  GPU vertex buffer  (set once per data load)
 *   OrbitCamera →  computeViewProj()  →  draw()  →  uniform buffer  (every frame)
 *
 * @module
 */

import { mat4 } from 'gl-matrix';
import type { PointCloud } from '../@types';

// `?raw` is a Vite-specific import suffix. It tells the bundler to import the
// file's content as a plain string rather than attempting to execute it as
// JavaScript. The WGSL source text ends up inlined in the JS bundle; at
// runtime we hand it to `device.createShaderModule({ code: shaderSrc })`.
// Without `?raw`, Vite would try to parse the .wgsl file as JS and fail.
import shaderSrc from './shaders/points.wgsl?raw';

// ─── Layout constants ─────────────────────────────────────────────────────────

/**
 * Number of `f32` values packed per catalog point in the vertex buffer.
 *
 * Layout (matches the `PerVertex` struct in points.wgsl):
 *   [x, y, z,  magnitude,  colorIndex]
 *    ^position^  ^f32^       ^f32^
 *     (3 f32s)
 */
const FLOATS_PER_POINT = 5;

/**
 * Byte stride between consecutive per-instance records in the vertex buffer.
 *
 * 5 floats × 4 bytes/float = 20 bytes. The pipeline's `arrayStride` must
 * match this exactly; if they disagree WebGPU will either validate-error or
 * silently read garbage.
 */
const POINT_STRIDE = FLOATS_PER_POINT * 4; // 20 bytes

/**
 * Byte size of the `Uniforms` struct as seen by the GPU.
 *
 * The struct contains:
 *   - `viewProj`      : mat4x4<f32>  = 16 floats = 64 bytes
 *   - `viewport`      : vec2<f32>    = 2 floats  }
 *   - `pointSizePx`   : f32          = 1 float   } = 16 bytes (one vec4 slot)
 *   - `brightness`    : f32          = 1 float   }
 *   - `selectedIndex` : u32          = 4 bytes   }
 *   - `_pad0`         : u32          = 4 bytes   } = 16 bytes (one vec4 slot for alignment)
 *   - `_pad1`         : u32          = 4 bytes   }
 *   - `_pad2`         : u32          = 4 bytes   }
 *
 * WGSL uniform buffers follow rules similar to std140 (see WGSL spec §13,
 * "Memory Layout"). Each member must be aligned to its "alignment" value:
 *   - mat4x4<f32> alignment = 16 bytes  (starts at offset 0 ✓)
 *   - vec2<f32>   alignment = 8 bytes   (starts at offset 64 ✓)
 *   - f32         alignment = 4 bytes   (starts at offsets 72, 76 ✓)
 *   - u32         alignment = 4 bytes   (starts at offsets 80, 84, 88, 92 ✓)
 *
 * NOTE: We use four separate u32 fields rather than u32 + vec3<u32> because
 * vec3<u32> has 16-byte alignment in WGSL (like vec3<f32>), which would force
 * an invisible 8-byte gap between selectedIndex (offset 80) and the vec3 (which
 * would have to start at offset 96) — bloating the struct to 112 bytes. Four
 * scalar u32s pack contiguously at offsets 80, 84, 88, 92 for a clean 96 bytes.
 *
 * Layout summary:
 *   bytes  0..63  : viewProj mat4x4<f32>        (16 floats)
 *   bytes 64..79  : viewport.xy + pointSizePx + brightness  (4 floats)
 *   bytes 80..83  : selectedIndex u32
 *   bytes 84..95  : _pad0/_pad1/_pad2 u32 × 3  (written as 0)
 *   total: 96 bytes — a multiple of 16 ✓
 */
const UNIFORM_BYTES = 16 * 4 + 4 * 4 + 4 * 4; // 96 bytes: mat4 (64) + vec4-slot (16) + u32×4 (16)

// ─── PointRenderer ────────────────────────────────────────────────────────────

export class PointRenderer {
  /** The compiled and linked render pipeline (vertex + fragment stages). */
  private pipeline: GPURenderPipeline;

  /**
   * GPU-side uniform buffer holding the per-frame constants.
   *
   * Allocated once in the constructor with `UNIFORM | COPY_DST`:
   *   - `UNIFORM` means the shader can read it via `var<uniform>`.
   *   - `COPY_DST` means we can write into it with `device.queue.writeBuffer`.
   *
   * We do NOT need `COPY_SRC` (we never read back from it to the CPU) or
   * `VERTEX`/`INDEX` (it's a uniform, not geometry data).
   */
  private uniformBuffer_internal: GPUBuffer;

  /**
   * The bind group that wires the uniform buffer into `@group(0) @binding(0)`.
   *
   * Bind groups are immutable after creation — the buffer reference is baked
   * in. We create one here and reuse it every frame. When we need a different
   * buffer we'd create a new bind group, but since our uniform buffer is
   * permanent that never happens.
   */
  private bindGroup: GPUBindGroup;

  /**
   * GPU-side vertex buffer holding the per-point interleaved data.
   *
   * `null` until `upload()` is called. Recreated on each `upload()` because
   * the point count may change between loads (see `upload()` for rationale).
   */
  private _vertexBuffer: GPUBuffer | null = null;

  /** Number of catalog points currently loaded on the GPU. */
  private count = 0;

  // ─── Public accessors ────────────────────────────────────────────────────────

  /**
   * The GPU buffer holding per-instance point data (position, magnitude, colorIndex).
   *
   * `null` until `upload()` has been called at least once. The pick renderer
   * shares this buffer — it must not be destroyed while a pick is in flight.
   *
   * Exposed as a read-only getter so `PickRenderer` (and `main.ts`) can access
   * it without resorting to `as unknown as { vertexBuffer: GPUBuffer }` casts.
   */
  get vertexBuffer(): GPUBuffer | null {
    return this._vertexBuffer;
  }

  /**
   * The GPU buffer holding per-frame uniform data (viewProj, viewport, etc.).
   *
   * Written every frame by `draw()`. The pick renderer reads the same buffer
   * so it sees the same camera state as the visual pass — no extra uploads needed.
   *
   * Exposed as a read-only getter for the same reason as `vertexBuffer` above.
   */
  get uniformBuffer(): GPUBuffer {
    return this.uniformBuffer_internal;
  }

  // ─── Constructor ────────────────────────────────────────────────────────────

  /**
   * Build the render pipeline, allocate the uniform buffer, and create the
   * bind group. This is the only method that touches pipeline creation — all
   * subsequent work just uploads data and issues draw calls.
   *
   * @param device  The WebGPU logical device. Owned by the caller; this class
   *                holds a reference but does not destroy it.
   * @param format  The swap-chain texture format (e.g. `'bgra8unorm'`).
   *                Must match the format passed to `context.configure()` in
   *                `device.ts`; if they disagree the pipeline will be invalid.
   */
  constructor(
    private device: GPUDevice,
    format: GPUTextureFormat,
  ) {
    // Compile the WGSL shader source into a `GPUShaderModule`. This step
    // validates the WGSL syntax and translates it to the platform's native
    // shader language (MSL on macOS, HLSL/SPIR-V elsewhere) asynchronously
    // inside the driver. Any compilation errors surface as pipeline creation
    // errors below.
    const module = device.createShaderModule({ code: shaderSrc });

    // ── Build the render pipeline ──────────────────────────────────────────
    //
    // A `GPURenderPipeline` is a fully compiled, immutable description of one
    // rendering operation. It bakes in the shader code, vertex buffer layout,
    // blend state, primitive topology, and render-target format. Changing any
    // of these requires creating a new pipeline.
    this.pipeline = device.createRenderPipeline({
      // `layout: 'auto'` asks the pipeline to *reflect* the bind group layout
      // directly from the shader's `@group` and `@binding` declarations.
      // The alternative is to declare a `GPUBindGroupLayout` manually (with
      // explicit `visibility`, `type`, etc.) — useful when multiple pipelines
      // share the same bind group layout, because you can create one layout
      // and reuse it. For our single-pipeline case, `'auto'` is simpler.
      layout: 'auto',

      vertex: {
        module,
        entryPoint: 'vs', // must match the `@vertex fn vs(...)` in points.wgsl

        // Vertex buffer layout — one buffer, one record per instance.
        buffers: [
          {
            // How many bytes to advance the buffer pointer per step.
            // 5 floats × 4 bytes = 20 bytes per point.
            arrayStride: POINT_STRIDE,

            // ── stepMode: 'instance' vs. 'vertex' ─────────────────────────
            //
            // `'vertex'` (the default): the buffer pointer advances once per
            //   vertex invocation. For a 6-vertex draw, you'd need 6 records.
            //   This is the normal mode for geometry data (mesh vertices).
            //
            // `'instance'`: the buffer pointer advances once per *instance*.
            //   For our `draw(6, N)` call the GPU runs 6 vertex invocations
            //   per instance — all six share the same `PerVertex` record while
            //   `@builtin(vertex_index)` cycles 0..5 to pick quad corners.
            //   This is exactly how we want it: one catalog entry → one quad.
            stepMode: 'instance',

            attributes: [
              // position (vec3<f32>) — offset 0 bytes from record start.
              // `float32x3` = three consecutive f32 values, 12 bytes total.
              // shaderLocation 0 must match `@location(0) position` in the shader.
              { shaderLocation: 0, offset: 0, format: 'float32x3' },

              // magnitude (f32) — offset 12 bytes (right after the 3-float position).
              // `float32` = one f32 value, 4 bytes.
              // shaderLocation 1 must match `@location(1) magnitude` in the shader.
              { shaderLocation: 1, offset: 12, format: 'float32' },

              // colorIndex (f32) — offset 16 bytes (after position + magnitude).
              // shaderLocation 2 must match `@location(2) colorIndex` in the shader.
              //
              // Byte map of one record (20 bytes total):
              //   [0..3]   x       float32
              //   [4..7]   y       float32
              //   [8..11]  z       float32      ← float32x3 covers bytes 0..11
              //   [12..15] mag     float32      ← offset 12
              //   [16..19] ci      float32      ← offset 16
              { shaderLocation: 2, offset: 16, format: 'float32' },
            ],
          },
        ],
      },

      fragment: {
        module,
        entryPoint: 'fs', // must match the `@fragment fn fs(...)` in points.wgsl

        targets: [
          {
            // Must match the swap-chain format we received from `context.configure()`.
            format,

            // ── Additive blend state ────────────────────────────────────────
            //
            // Standard alpha blending (srcFactor:'src-alpha', dstFactor:'one-minus-src-alpha')
            // would make points *occlude* each other: the brighter one in front
            // would hide everything behind it. That's correct for opaque surfaces
            // but wrong for a star field — overlapping galaxy halos should
            // *add* together, making dense regions visibly brighter, just as a
            // long-exposure photograph accumulates light.
            //
            // Additive blending:
            //   dst.rgb = src.rgb * srcFactor + dst.rgb * dstFactor
            //           = src.rgb * one      + dst.rgb * one
            //           = src.rgb            + dst.rgb
            //
            // Both `color` and `alpha` channels use the same additive equation.
            // This pairs correctly with the premultiplied-alpha convention in
            // `device.ts` (`alphaMode: 'premultiplied'`) and the shader's
            // `return vec4(rgb * alpha, alpha)` output.
            //
            // The net effect: overlapping point sprites brighten each other
            // (simulating photon accumulation), while isolated points simply
            // draw their own Gaussian glow onto the black background.
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },

      // We draw a plain triangle list: every three vertices form one triangle.
      // Each billboard quad = two triangles = 6 vertices, as described in the
      // shader's QUAD constant. No index buffer needed.
      primitive: { topology: 'triangle-list' },
    });

    // ── Allocate the uniform buffer ────────────────────────────────────────
    //
    // `GPUBufferUsage.UNIFORM` — the shader can read this as a uniform block.
    // `GPUBufferUsage.COPY_DST` — we can push CPU data into it via
    //   `device.queue.writeBuffer`. Without this flag that call would fail
    //   with a validation error.
    //
    // We do NOT set COPY_SRC (no read-back needed) or MAP_READ / MAP_WRITE
    // (those are for buffers you want to map into CPU address space, which is
    // incompatible with UNIFORM on most platforms).
    this.uniformBuffer_internal = device.createBuffer({
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // ── Create the bind group ──────────────────────────────────────────────
    //
    // A bind group pairs a `GPUBindGroupLayout` (what the pipeline expects)
    // with actual resources (the buffer we just created).
    //
    // `pipeline.getBindGroupLayout(0)` retrieves the auto-reflected layout for
    // @group(0) from the shader. If we had declared the layout manually we
    // would pass it here directly; with `layout: 'auto'` this reflection call
    // is the only way to get it.
    //
    // The single entry wires `binding: 0` to our uniform buffer — matching
    // `@group(0) @binding(0) var<uniform> u: Uniforms` in points.wgsl.
    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer_internal } }],
    });
  }

  // ─── Data upload ────────────────────────────────────────────────────────────

  /**
   * Pack catalog data into an interleaved GPU vertex buffer and upload it.
   *
   * The CPU-side `PointCloud` uses a "struct of arrays" layout (separate
   * typed arrays for positions, magnitudes, colourIndex). The GPU vertex
   * pipeline needs an "array of structs" (interleaved) layout so that all
   * attributes for one instance sit in one contiguous 20-byte record. This
   * method performs that transposition.
   *
   * ### Why we destroy the old buffer first
   *
   * Each `upload()` call may bring in a different number of points (e.g. the
   * user loads a new data file). A GPU buffer is fixed-size after creation —
   * there is no `realloc`. If the new cloud is larger than the old buffer we
   * would have to create a new one anyway; if smaller we could reuse but
   * would waste GPU memory. The simpler policy is always to destroy and
   * recreate. `GPUBuffer.destroy()` immediately frees the GPU memory (the JS
   * object may linger until GC collects it, but the VRAM is reclaimed now).
   *
   * @param cloud  The point cloud to upload. May be called multiple times;
   *               each call replaces the previous vertex buffer entirely.
   */
  upload(cloud: PointCloud): void {
    // Allocate a CPU-side typed array for the interleaved data.
    // Total size: cloud.count records × 5 floats/record.
    const interleaved = new Float32Array(cloud.count * FLOATS_PER_POINT);

    for (let i = 0; i < cloud.count; i++) {
      const o = i * FLOATS_PER_POINT; // byte offset in units of floats

      // Copy the three position components from the SoA positions array.
      // positions[i*3 + 0..2] = [x, y, z] for point i.
      interleaved[o + 0] = cloud.positions[i * 3 + 0]!;
      interleaved[o + 1] = cloud.positions[i * 3 + 1]!;
      interleaved[o + 2] = cloud.positions[i * 3 + 2]!;

      // Derive the two scalar attributes from the v2 five-band photometry.
      //
      // The shader (points.wgsl) expects:
      //   slot 3 → magnitude   (we feed g-band, the primary brightness proxy)
      //   slot 4 → colorIndex  (we feed u−g, the bluestar / redgalaxy discriminator)
      //
      // The old v1 format pre-baked a single `magnitude` and `colorIndex` into
      // the file.  The new v2 format keeps all five bands separately, so we
      // derive both values here at upload time.  This is one-shot work done
      // once per data load (not per frame), and it matches the band the shader
      // was always tuned against.
      const g = cloud.magG[i]!;
      const u = cloud.magU[i]!;
      interleaved[o + 3] = g;
      interleaved[o + 4] = u - g; // u−g color index: blue star-forming galaxies → low; red quiescent → high
    }

    // Destroy the previous vertex buffer (if any) before allocating a new one.
    // See method doc-comment above for the size-change rationale.
    this._vertexBuffer?.destroy();

    // Allocate and upload the new vertex buffer.
    //
    // `GPUBufferUsage.VERTEX` — the pipeline can read this as per-instance
    //   vertex data via `setVertexBuffer`.
    // `GPUBufferUsage.COPY_DST` — we write into it immediately below with
    //   `writeBuffer`. Without this flag the write would fail validation.
    this._vertexBuffer = this.device.createBuffer({
      size: interleaved.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });

    // Write the packed data to the GPU. `writeBuffer` schedules a copy from
    // the CPU ArrayBuffer into the GPU buffer; it completes before any
    // subsequent draw call submitted to the same queue.
    this.device.queue.writeBuffer(this._vertexBuffer, 0, interleaved);

    this.count = cloud.count;
  }

  // ─── Draw ────────────────────────────────────────────────────────────────────

  /**
   * Write per-frame uniforms and issue the instanced draw call.
   *
   * Call this once per frame inside an active `GPURenderPassEncoder`, after
   * `beginRenderPass` and before `endPass`. The method is a no-op if no data
   * has been uploaded yet.
   *
   * ### Why uniforms are written every frame
   *
   * The view-projection matrix changes every time the camera moves. Tracking
   * "dirty" state (only writing when the camera changes) is possible but adds
   * complexity for negligible gain: `writeBuffer` of 80 bytes costs roughly
   * the same as a dirty-flag check plus a branch. Writing unconditionally
   * every frame keeps the code simple and correct.
   *
   * @param pass         An active render pass encoder to record commands into.
   * @param viewProj     The 4×4 view-projection matrix from `computeViewProj`.
   *                     Must be in column-major order (gl-matrix default).
   * @param viewportPx   Physical canvas dimensions [width, height] in pixels
   *                     (after DPR scaling from `resizeCanvasToDisplay`).
   *                     The shader divides by these to convert pixel offsets
   *                     to clip-space offsets for the billboard size calculation.
   * @param pointSizePx    Radius of each point sprite in pixels. Defaults to 2.5.
   *                       Larger values produce bigger, softer halos.
   * @param brightness     Global brightness multiplier in [0, 1]. Defaults to 1.
   *                       Lets the UI fade the entire star field without
   *                       re-uploading the vertex buffer.
   * @param selectedIndex  0-based index of the selected point, or `0xFFFFFFFF`
   *                       (= `0xFFFFFFFF >>> 0`) when nothing is selected.
   *                       The sentinel `0xFFFFFFFF` is the maximum u32 value —
   *                       far beyond any real catalog size — so it never
   *                       accidentally matches a real point.
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    pointSizePx = 2.5,
    brightness = 1.0,
    selectedIndex = 0xffffffff >>> 0,
  ): void {
    // Guard: nothing to draw if the vertex buffer hasn't been populated yet.
    if (!this._vertexBuffer || this.count === 0) return;

    // ── Pack and upload uniforms ────────────────────────────────────────────
    //
    // The WGSL `Uniforms` struct layout (96 bytes total):
    //
    //   bytes  0..63  : viewProj mat4x4<f32>    (16 floats)
    //   bytes 64..79  : viewport.xy + pointSizePx + brightness  (4 floats)
    //   bytes 80..83  : selectedIndex u32
    //   bytes 84..95  : _pad vec3<u32> (must be zero-filled for defined behaviour)
    //
    // We use a single ArrayBuffer with *two typed views* over it:
    //   - Float32Array for the first 20 floats (bytes 0..79)
    //   - Uint32Array  for the trailing 4 u32s  (bytes 80..95)
    //
    // Why two views? A u32 value cannot be correctly written via Float32Array
    // — Float32Array would reinterpret the bit-pattern as an IEEE 754 float,
    // which is incorrect for an integer. Uint32Array writes the raw binary
    // representation of the u32, which is exactly what the WGSL uniform expects.
    //
    // Both views share the same underlying memory (the ArrayBuffer), so writes
    // through one are immediately visible through the other — no extra copy.
    const buf = new ArrayBuffer(UNIFORM_BYTES); // 96 bytes
    const f32 = new Float32Array(buf); // float view: indices 0..23
    const u32 = new Uint32Array(buf); // uint32 view: indices 0..23

    // `mat4` from gl-matrix is a Float32Array of 16 values in column-major
    // order. `set()` copies all 16 floats starting at index 0.
    f32.set(viewProj, 0);

    // Pack viewport dimensions, point size, and brightness into the second slot.
    f32[16] = viewportPx[0];
    f32[17] = viewportPx[1];
    f32[18] = pointSizePx;
    f32[19] = brightness;

    // Write selectedIndex as a raw u32 at byte offset 80 (= u32 index 20).
    // `>>> 0` coerces to an unsigned 32-bit integer, ensuring that the JS number
    // is in the valid u32 range [0, 2³²) before writing. Without `>>> 0`, a
    // negative number or the sentinel 0xFFFFFFFF (which is 4294967295 — within
    // the safe integer range but coerced to signed -1 by TypeScript) would be
    // written as the correct bit pattern, but this makes the intent explicit.
    u32[20] = selectedIndex >>> 0;

    // Padding u32s at indices 21, 22, 23 — already zero because new ArrayBuffer
    // zero-initialises. No explicit write needed.

    // Push the uniform data to the GPU. `writeBuffer(buffer, offset, data)`
    // schedules a DMA copy; it completes before this frame's draw call executes.
    this.device.queue.writeBuffer(this.uniformBuffer_internal, 0, buf);

    // ── Issue the draw call ─────────────────────────────────────────────────

    // Bind the pipeline (shaders + blend state + vertex layout).
    pass.setPipeline(this.pipeline);

    // Bind the uniform buffer to slot 0. The shader reads it as
    // `@group(0) @binding(0) var<uniform> u: Uniforms`.
    pass.setBindGroup(0, this.bindGroup);

    // Bind the per-instance vertex buffer to slot 0. The pipeline's
    // `stepMode: 'instance'` means one record is consumed per instance,
    // not per vertex.
    pass.setVertexBuffer(0, this._vertexBuffer);

    // Fire the draw.
    //
    // `draw(vertexCount, instanceCount)`
    //   vertexCount   = 6: six vertices per billboard quad (two triangles)
    //   instanceCount = this.count: one instance per catalog point
    //
    // The argument order is easy to swap by mistake. If you see every point
    // rendered 6 times and only 1 point total, the arguments are swapped.
    //
    // Total vertex shader invocations: 6 × this.count.
    pass.draw(6, this.count);
  }
}
