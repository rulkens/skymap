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
 * ### Multi-source rendering (Task 4)
 *
 * Earlier revisions of this class held a single vertex buffer, so the
 * renderer could only ever display one point cloud at a time. The
 * multi-survey integration plan (Task 4) replaces that with a
 * `Map<Source, GPUBuffer>`: each loaded survey gets its own buffer and its
 * own draw call. A 32-bit visibility bitmask, supplied by the engine each
 * frame, decides which sources are drawn — the renderer simply skips the
 * draw call for any source whose bit is clear.
 *
 * Per-source draw calls also let the picker keep a *global* per-point index
 * across surveys: each draw passes its `instanceIdOffset` (sum of prior
 * sources' counts) to the shader via the uniform buffer, and `fsPick` adds
 * that offset to the per-instance index it writes into the pick texture.
 *
 * ### Relationship to other modules
 *
 *   PointCloud  →  upload(source, …)    →  GPU vertex buffer per source
 *   OrbitCamera →  computeViewProj()    →  draw()  →  uniform buffer  (every frame)
 *
 * @module
 */

import { mat4 } from 'gl-matrix';
import type { PointCloud } from '../@types';
import { ALL_SOURCES, Source } from '../data/sources';

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
 *   - `viewProj`         : mat4x4<f32>  = 16 floats = 64 bytes
 *   - `viewport`         : vec2<f32>    = 2 floats  }
 *   - `pointSizePx`      : f32          = 1 float   } = 16 bytes (one vec4 slot)
 *   - `brightness`       : f32          = 1 float   }
 *   - `selectedIndex`    : u32          = 4 bytes   }
 *   - `instanceIdOffset` : u32          = 4 bytes   } = 16 bytes (one vec4 slot for alignment)
 *   - `_pad0`            : u32          = 4 bytes   }
 *   - `_pad1`            : u32          = 4 bytes   }
 *
 * WGSL uniform buffers follow rules similar to std140 (see WGSL spec §13,
 * "Memory Layout"). Each member must be aligned to its "alignment" value.
 *
 * Layout summary (the picker depends on `selectedIndex` staying at offset 80):
 *   bytes  0..63  : viewProj mat4x4<f32>        (16 floats)
 *   bytes 64..79  : viewport.xy + pointSizePx + brightness  (4 floats)
 *   bytes 80..83  : selectedIndex u32                       ← picker writes here
 *   bytes 84..87  : instanceIdOffset u32                    ← per-source draw writes here
 *   bytes 88..95  : _pad0/_pad1  (written as 0)
 *   total: 96 bytes — a multiple of 16 ✓
 */
const UNIFORM_BYTES = 16 * 4 + 4 * 4 + 4 * 4; // 96 bytes: mat4 (64) + vec4-slot (16) + u32×4 (16)

/**
 * Byte offset of the `instanceIdOffset` field inside the uniform struct.
 *
 * The per-source draw loop writes a fresh 4-byte u32 here before each draw
 * call. We deliberately keep this small partial write (rather than writing
 * the whole 96-byte struct each draw) because `writeBuffer` cost scales with
 * bytes copied — see the comment in `draw()` for the full rationale.
 */
const INSTANCE_ID_OFFSET_BYTE_OFFSET = 84;

// ─── Per-source bookkeeping ───────────────────────────────────────────────────

/**
 * Internal record describing one source's GPU vertex buffer.
 *
 * `instanceIdOffset` is the global index of this source's first point — the
 * sum of `count` across all *prior* sources in `Source` enum order. The
 * picker uses it (via the uniform) to translate each instance's local index
 * into a globally-unique ID, so JS can index into a merged point array.
 *
 * We recompute every offset after each upload/unload because the *order* of
 * sources is fixed (enum order) but which surveys are loaded varies. Doing
 * this on every change is O(numSources) — at most 32 entries — so it is not
 * a hot path.
 */
type LoadedSource = {
  buffer: GPUBuffer;
  count: number;
  instanceIdOffset: number;
};

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
   */
  private uniformBuffer_internal: GPUBuffer;

  /**
   * The bind group that wires the uniform buffer into `@group(0) @binding(0)`.
   *
   * Bind groups are immutable after creation — the buffer reference is baked
   * in. We create one here and reuse it every frame.
   */
  private bindGroup: GPUBindGroup;

  /**
   * One GPU vertex buffer per loaded survey.
   *
   * The map is keyed by `Source` (a numeric enum) and contains exactly the
   * surveys currently present on the GPU. `upload` adds or replaces an entry,
   * `unload` removes one, and after either operation we call
   * `recomputeInstanceIdOffsets` to re-derive the per-source offset values
   * in the canonical enum order.
   *
   * Why a `Map` (not a plain object)? `Map` preserves insertion order, has a
   * straightforward `delete`/`has` API, and avoids the prototype-chain
   * ambiguity of indexing a numeric-keyed object literal.
   */
  private readonly clouds = new Map<Source, LoadedSource>();

  // ─── Public accessors ────────────────────────────────────────────────────────

  /**
   * The GPU buffer holding per-frame uniform data (viewProj, viewport, etc.).
   *
   * Written every frame by `draw()`. The pick renderer reads the same buffer
   * so it sees the same camera state as the visual pass — no extra uploads needed.
   */
  get uniformBuffer(): GPUBuffer {
    return this.uniformBuffer_internal;
  }

  // ─── Constructor ────────────────────────────────────────────────────────────

  /**
   * Build the render pipeline, allocate the uniform buffer, and create the
   * bind group.
   *
   * @param device  The WebGPU logical device. Owned by the caller.
   * @param format  The swap-chain texture format (e.g. `'bgra8unorm'`).
   */
  constructor(
    private device: GPUDevice,
    format: GPUTextureFormat,
  ) {
    const module = device.createShaderModule({ code: shaderSrc });

    this.pipeline = device.createRenderPipeline({
      layout: 'auto',

      vertex: {
        module,
        entryPoint: 'vs',
        buffers: [
          {
            arrayStride: POINT_STRIDE,
            stepMode: 'instance',
            attributes: [
              // position (vec3<f32>) — offset 0 bytes
              { shaderLocation: 0, offset: 0, format: 'float32x3' },
              // magnitude (f32) — offset 12 bytes
              { shaderLocation: 1, offset: 12, format: 'float32' },
              // colorIndex (f32) — offset 16 bytes
              { shaderLocation: 2, offset: 16, format: 'float32' },
            ],
          },
        ],
      },

      fragment: {
        module,
        entryPoint: 'fs',
        targets: [
          {
            format,
            // Additive blend: dst.rgb = src.rgb + dst.rgb. Required for the
            // long-exposure-style brightening of overlapping galaxy halos
            // (see device.ts and the @module comment in points.wgsl).
            blend: {
              color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
              alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            },
          },
        ],
      },

      primitive: { topology: 'triangle-list' },
    });

    this.uniformBuffer_internal = device.createBuffer({
      size: UNIFORM_BYTES,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.bindGroup = device.createBindGroup({
      layout: this.pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: this.uniformBuffer_internal } }],
    });
  }

  // ─── Data upload ────────────────────────────────────────────────────────────

  /**
   * Pack a `PointCloud` into an interleaved GPU vertex buffer for the given
   * source. Replaces any previous buffer for that source.
   *
   * After the upload we recompute every loaded source's `instanceIdOffset` so
   * the picker's global ID space stays contiguous in `Source` enum order.
   *
   * ### Why we destroy the old buffer for this source first
   *
   * GPU buffers are fixed-size — there is no `realloc`. If the user loads a
   * different file for an already-present source, the new cloud may have a
   * different point count, so we throw away the old buffer and allocate a
   * new one. `GPUBuffer.destroy()` releases the VRAM immediately.
   *
   * @param source  Which survey the cloud belongs to.
   * @param cloud   Point cloud to upload (struct-of-arrays SDSS v2 shape).
   */
  upload(source: Source, cloud: PointCloud): void {
    // Allocate a CPU-side typed array for the interleaved data.
    // Total size: cloud.count records × 5 floats/record.
    const interleaved = new Float32Array(cloud.count * FLOATS_PER_POINT);

    for (let i = 0; i < cloud.count; i++) {
      const o = i * FLOATS_PER_POINT;

      // Copy the three position components from the SoA positions array.
      interleaved[o + 0] = cloud.positions[i * 3 + 0]!;
      interleaved[o + 1] = cloud.positions[i * 3 + 1]!;
      interleaved[o + 2] = cloud.positions[i * 3 + 2]!;

      // Derive shader-side magnitude (g-band) and colour index (u−g) from
      // the v2 five-band photometry. See the v1→v2 history in the previous
      // revision of this method for the rationale; this is one-shot work
      // done at load time, not per frame.
      const g = cloud.magG[i]!;
      const u = cloud.magU[i]!;
      interleaved[o + 3] = g;
      interleaved[o + 4] = u - g; // u−g colour index
    }

    // Destroy any previous buffer for this source before replacing it.
    this.clouds.get(source)?.buffer.destroy();

    const buffer = this.device.createBuffer({
      size: interleaved.byteLength,
      usage: GPUBufferUsage.VERTEX | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(buffer, 0, interleaved);

    // `instanceIdOffset` is set to 0 here as a placeholder — the real value
    // is derived in `recomputeInstanceIdOffsets()` immediately below, which
    // sums counts in enum order rather than upload order.
    this.clouds.set(source, { buffer, count: cloud.count, instanceIdOffset: 0 });
    this.recomputeInstanceIdOffsets();
  }

  /**
   * Remove a source's GPU vertex buffer and reclaim its VRAM.
   *
   * No-op if the source was never uploaded — callers shouldn't have to track
   * which surveys are currently loaded.
   */
  unload(source: Source): void {
    const entry = this.clouds.get(source);
    if (!entry) return;
    entry.buffer.destroy();
    this.clouds.delete(source);
    this.recomputeInstanceIdOffsets();
  }

  /**
   * Walk every loaded source in `Source`-enum order and recompute its
   * `instanceIdOffset` as the running sum of prior counts.
   *
   * The order of iteration matters: the picker decodes a global instance ID
   * by checking which source's `[offset, offset+count)` slice it falls into,
   * which only works if the slices are contiguous and ordered identically on
   * the JS side. Using `ALL_SOURCES` (the canonical iteration order from
   * `data/sources.ts`) guarantees that.
   */
  private recomputeInstanceIdOffsets(): void {
    let runningOffset = 0;
    for (const source of ALL_SOURCES) {
      const entry = this.clouds.get(source);
      if (!entry) continue;
      entry.instanceIdOffset = runningOffset;
      runningOffset += entry.count;
    }
  }

  // ─── Public API for the engine + picker ─────────────────────────────────────

  /**
   * Total number of points across every loaded source. Used by the engine to
   * report cloud size in the status bar.
   */
  totalCount(): number {
    let total = 0;
    for (const entry of this.clouds.values()) total += entry.count;
    return total;
  }

  /**
   * Iterate over every loaded source's GPU buffer + bookkeeping in `Source`
   * enum order. Used by the picker to issue its own per-source draw calls
   * with matching `instanceIdOffset` values.
   *
   * The iterable is generated fresh on each call so the caller may call
   * `unload()` between iterations without affecting the snapshot — but they
   * must not assume the iteration order beyond "stable for this call".
   */
  *loadedSources(): IterableIterator<{
    source: Source;
    vertexBuffer: GPUBuffer;
    count: number;
    instanceIdOffset: number;
  }> {
    for (const source of ALL_SOURCES) {
      const entry = this.clouds.get(source);
      if (!entry) continue;
      yield {
        source,
        vertexBuffer: entry.buffer,
        count: entry.count,
        instanceIdOffset: entry.instanceIdOffset,
      };
    }
  }

  // ─── Draw ────────────────────────────────────────────────────────────────────

  /**
   * Write the per-frame uniforms (viewProj, viewport, …) once, then issue one
   * instanced draw call per visible source.
   *
   * @param pass               Active render pass encoder.
   * @param viewProj           Column-major 4×4 view-projection matrix.
   * @param viewportPx         Physical canvas size [w, h] in pixels.
   * @param pointSizePx        Billboard radius in pixels.
   * @param brightness         Global brightness multiplier in [0, 1].
   * @param selectedIndex      Selected point's *global* index, or `0xFFFFFFFF` for none.
   * @param visibleSourceMask  Bitmask of `Source` values to draw (see `data/sources.ts`).
   */
  draw(
    pass: GPURenderPassEncoder,
    viewProj: mat4,
    viewportPx: [number, number],
    pointSizePx: number,
    brightness: number,
    selectedIndex: number,
    visibleSourceMask: number,
  ): void {
    // Nothing to draw if no source has been uploaded yet.
    if (this.clouds.size === 0) return;

    // ── Pack and upload the bulk of the uniform buffer ──────────────────────
    //
    // We write everything *except* `instanceIdOffset` here in one 96-byte
    // upload. The per-source draw loop below patches the 4-byte
    // `instanceIdOffset` slot (offset 84) before each draw call — that
    // partial write is the only piece of uniform state that varies between
    // sources within a single frame.
    const buf = new ArrayBuffer(UNIFORM_BYTES);
    const f32 = new Float32Array(buf);
    const u32 = new Uint32Array(buf);

    f32.set(viewProj, 0);
    f32[16] = viewportPx[0];
    f32[17] = viewportPx[1];
    f32[18] = pointSizePx;
    f32[19] = brightness;
    u32[20] = selectedIndex >>> 0; // selectedIndex at byte offset 80
    // u32[21] (instanceIdOffset) and u32[22..23] (padding) are left as 0
    // here; the per-source loop below overwrites u32[21] (offset 84) per draw.

    this.device.queue.writeBuffer(this.uniformBuffer_internal, 0, buf);

    // ── Per-source draw loop ────────────────────────────────────────────────
    //
    // Bind the pipeline + bind group once (these don't change between draws)
    // and then for each loaded source:
    //   1. Skip it if its visibility bit is not set in the mask.
    //   2. Patch `instanceIdOffset` for this source into the uniform buffer.
    //      We write *only the 4 bytes* at offset 84 because the cost of
    //      `writeBuffer` is proportional to the bytes copied — re-uploading
    //      the whole 96-byte struct per source would multiply the per-frame
    //      uniform bandwidth by ~24× for no gain.
    //   3. Set this source's vertex buffer and issue a 6-vertex × N-instance
    //      draw call.
    pass.setPipeline(this.pipeline);
    pass.setBindGroup(0, this.bindGroup);

    // A reusable 4-byte scratch for the per-source partial uniform write.
    const offsetScratch = new Uint32Array(1);

    for (const source of ALL_SOURCES) {
      const entry = this.clouds.get(source);
      if (!entry) continue;

      // Bitmask check: `(mask >> source) & 1`. Equivalent to maskHas() from
      // `data/sources.ts`, inlined here because this is the per-frame hot path.
      if (((visibleSourceMask >> source) & 1) === 0) continue;

      offsetScratch[0] = entry.instanceIdOffset >>> 0;
      this.device.queue.writeBuffer(
        this.uniformBuffer_internal,
        INSTANCE_ID_OFFSET_BYTE_OFFSET,
        offsetScratch,
      );

      pass.setVertexBuffer(0, entry.buffer);
      pass.draw(6, entry.count);
    }
  }
}
