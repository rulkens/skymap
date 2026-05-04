/**
 * PickRenderer — GPU pipeline for offscreen per-point picking.
 *
 * ### What is GPU picking?
 *
 * Instead of doing CPU-side ray-casting against all 100 k point positions, we
 * re-render the scene into a tiny offscreen texture where each fragment's colour
 * encodes the *instance index* of the billboard that produced it.  To find which
 * point is under the cursor we read back exactly one pixel from that texture.
 *
 * This is faster than CPU ray-casting for large point clouds and is accurate
 * at the pixel level (the GPU resolves overlapping billboards via the depth test
 * so the front-most point wins automatically).
 *
 * ### Texture format: r32uint
 *
 * The pick texture has format `'r32uint'` — a single channel of 32-bit unsigned
 * integer per texel.  This gives us 4 294 967 295 addressable points, far more
 * than we will ever need.  The `fsPick` entry point in `points.wgsl` writes
 * `instanceIdx + 1` into the red channel; we read it back on the CPU side.
 *
 * ### Sentinel value: 0 = background
 *
 * The texture is cleared to 0 before each pick pass.  The shader writes
 * `instanceIdx + 1`, so 0 unambiguously means "the cursor is over empty sky",
 * and any value ≥ 1 decodes to the 0-based point index by subtracting 1.
 *
 * ### Depth test
 *
 * The pick pass uses a `depth24plus` depth attachment with `depthCompare:'less'`
 * and `depthWriteEnabled:true`.  This means only the front-most billboard at each
 * pixel writes its index — if two points overlap on screen, the closer one wins,
 * which matches the user's expectation.  (The visual pass does NOT use depth,
 * because additive blending intentionally lets every overlapping halo contribute.)
 *
 * ### Shared resources
 *
 * The pick pipeline reuses the *same* vertex buffer and *same* uniform buffer as
 * the visual pass.  The caller must ensure that the visual pass has already
 * written its per-frame uniforms (viewProj, viewport, pointSizePx, brightness)
 * before calling `pick()` — the pick pass reads the same values without
 * re-uploading them.  See the `pick()` JSDoc for the exact contract.
 *
 * ### Forgiveness radius
 *
 * The `fsPick` fragment shader discards fragments where r² > 2.25 (radius 1.5)
 * rather than the visual r² > 1.0 (radius 1.0).  This makes each billboard's
 * pick area 1.5× larger than its visible disk, giving the user some pixel slack.
 *
 * @module
 */

import shaderSrc from './shaders/points.wgsl?raw';
import type { Source } from '../../data/sources';

// ─── Types ────────────────────────────────────────────────────────────────────

/**
 * One per-source draw record passed to `pick()`.
 *
 * Multi-survey rendering issues one instanced draw per loaded survey; the
 * picker mirrors that so its global instance-ID space lines up with the
 * visual pass. `instanceIdOffset` is the global index of this source's
 * first point — `fsPick` adds it to each fragment's per-instance index so
 * the value written into the pick texture is unique across all surveys.
 *
 * The `source` field is included so the caller can filter by visibility
 * mask before handing the iterable to `pick()`; the picker itself does not
 * read `source` for any other purpose.
 */
export type PickSourceDraw = {
  source: Source;
  vertexBuffer: GPUBuffer;
  count: number;
  instanceIdOffset: number;
};

/**
 * The public interface of the pick renderer.
 *
 * Create one instance at startup with `createPickRenderer(device)` and keep it
 * alive for the duration of the app.  Call `pick()` whenever you want to know
 * which point is under the cursor.
 */
export type PickRenderer = {
  /**
   * Identify the 0-based point index under the given screen coordinate.
   *
   * Internally this method:
   *   1. Lazily (re)allocates the offscreen pick texture and depth texture when
   *      the viewport size changes.
   *   2. Builds and submits a GPU command encoder that renders all points into
   *      the pick texture with the `fsPick` entry point.
   *   3. Copies the single pixel under `(pickXPx, pickYPx)` into a staging
   *      buffer.
   *   4. Awaits `buffer.mapAsync()`, reads the raw u32, unmaps, and returns the
   *      decoded point index (or -1 for background).
   *
   * ### Coordinate contract
   *
   * `pickXPx` and `pickYPx` are in *texture-space pixels* (i.e. CSS pixels
   * already multiplied by DPR, capped at 2 — the same DPR cap used by
   * `resizeCanvasToDisplay` in `device.ts`).  The typical call site does:
   *
   * ```ts
   * const dpr = Math.min(window.devicePixelRatio || 1, 2);
   * pickRenderer.pick([canvas.width, canvas.height],
   *                   e.clientX * dpr, e.clientY * dpr, ...);
   * ```
   *
   * ### Uniform buffer contract
   *
   * `pick()` does NOT write to the uniform buffer.  It relies on the visual
   * frame having already written the per-frame uniforms (viewProj, viewport,
   * pointSizePx, brightness) to `sharedUniformBuffer` for the same camera state.
   * Call `pick()` *after* the visual frame has written its uniforms.
   *
   * ### Concurrency
   *
   * This implementation uses a single staging buffer.  If `pick()` is called a
   * second time before the first call's `mapAsync` resolves, the second call
   * returns -1 immediately rather than waiting.  This keeps the implementation
   * simple: hover events fire far more often than frame time, so the caller
   * should throttle them anyway (Task 17).
   *
   * @param viewportPx       Physical canvas size `[width, height]` in backing-store
   *                         pixels (post-DPR, as in `canvas.width`/`canvas.height`).
   * @param pickXPx          X coordinate in texture-space pixels (clientX × DPR).
   * @param pickYPx          Y coordinate in texture-space pixels (clientY × DPR).
   * @param sources          Per-source draw records, one per visible survey, in
   *                         the same enum order as `PointRenderer.loadedSources()`.
   *                         The caller is responsible for filtering by visibility
   *                         mask — the picker draws every record it receives.
   * @param sharedUniformBuffer  The uniform buffer shared with `PointRenderer`.
   * @returns 0-based *global* index of the front-most point under the cursor,
   *          or -1 if the cursor is over background or a pick is already in flight.
   */
  pick(
    viewportPx: [number, number],
    pickXPx: number,
    pickYPx: number,
    sources: Iterable<PickSourceDraw>,
    sharedUniformBuffer: GPUBuffer,
  ): Promise<number>;

  /**
   * Release all GPU resources owned by this renderer.
   *
   * Call this if you ever destroy and recreate the renderer (e.g. after a
   * device loss recovery).  After `destroy()`, calling `pick()` will produce
   * undefined behaviour.
   */
  destroy(): void;
};

// ─── Factory ──────────────────────────────────────────────────────────────────

/**
 * Construct a `PickRenderer` bound to the given WebGPU device.
 *
 * The method:
 *   1. Compiles the same WGSL shader module used by `PointRenderer`.
 *   2. Creates a `GPURenderPipeline` that uses the `vs` + `fsPick` entry points,
 *      targeting `r32uint` with a depth attachment.
 *   3. Allocates a 256-byte staging buffer for readback (the minimum
 *      `bytesPerRow` imposed by `copyTextureToBuffer` is 256).
 *
 * Pick textures are allocated lazily on the first `pick()` call and
 * recreated automatically whenever the viewport size changes.
 *
 * @param device  The WebGPU logical device.  Owned by the caller.
 */
export function createPickRenderer(device: GPUDevice): PickRenderer {
  // ── Shader module ──────────────────────────────────────────────────────────
  //
  // We reuse the same WGSL source as PointRenderer. The shader file contains
  // both the `fs` (visual) and `fsPick` (picking) fragment entry points.
  // Here we select `fsPick`.
  const module = device.createShaderModule({ code: shaderSrc });

  // ── Render pipeline ────────────────────────────────────────────────────────
  //
  // The pick pipeline is structurally similar to the visual pipeline but:
  //   - Fragment target format is 'r32uint' (integer), not the swap-chain format.
  //   - No blend state: integers cannot be blended; we rely on the depth test
  //     to resolve overlapping points.
  //   - Depth-stencil state is enabled: `depthCompare:'less'` + `depthWriteEnabled:true`.
  //     The front-most point wins per pixel, matching visual occlusion.
  //   - Fragment entry point is 'fsPick', not 'fs'.
  //
  // `layout: 'auto'` reflects the bind group layout from the shader's @group/@binding
  // declarations.  The single binding is @group(0) @binding(0) — the Uniforms buffer.
  const pipeline = device.createRenderPipeline({
    layout: 'auto',

    vertex: {
      module,
      entryPoint: 'vs',

      // Vertex buffer layout — must exactly match PointRenderer's layout.
      // One 52-byte record per *instance* (stepMode:'instance'):
      //   bytes  0..11  : position vec3<f32>          (shaderLocation 0)
      //   bytes 12..15  : magnitude f32                (shaderLocation 1)
      //   bytes 16..19  : colorIndex f32                (shaderLocation 2)
      //   bytes 20..23  : globalInstanceIdx u32         (shaderLocation 3)
      //   bytes 24..27  : kPerZ f32                     (shaderLocation 4)
      //   bytes 28..31  : axisRatio f32                 (shaderLocation 5)
      //   bytes 32..35  : positionAngleDeg f32          (shaderLocation 6)
      //   bytes 36..39  : diameterKpc f32               (shaderLocation 7)
      //   bytes 40..43  : vMaxWeight f32                (shaderLocation 8)
      //   bytes 44..47  : schechterRatio f32            (shaderLocation 9)
      //   bytes 48..51  : angularDensityWeight f32      (shaderLocation 10)
      //
      // The fourth attribute is the cross-survey global instance index,
      // pre-baked at upload time so `fsPick` can write it directly into
      // the pick texture without needing a per-source uniform offset.
      //
      // The remaining attributes (kPerZ, axisRatio, positionAngleDeg,
      // diameterKpc, vMaxWeight, schechterRatio, angularDensityWeight) are
      // per-source / per-galaxy values used only by the visual `vs`/`fs`
      // path — `fsPick` never reads them, since picking only cares about
      // which point a pixel belongs to, not how it looks.  We declare them
      // here anyway because WebGPU validation requires that any pipeline
      // binding the shared per-instance vertex buffer declare a layout
      // that matches the buffer's stride and every attribute the visual
      // pipeline declares.  Omitting any of them would leave the pick
      // pipeline with a smaller stride than the buffer's actual record
      // size — a hard validation error the moment we issue a draw call.
      buffers: [
        {
          arrayStride: 52, // 13 slots × 4 bytes/slot — must match pointRenderer.POINT_STRIDE
          stepMode: 'instance',
          attributes: [
            { shaderLocation: 0, offset: 0, format: 'float32x3' }, // position
            { shaderLocation: 1, offset: 12, format: 'float32' }, // magnitude
            { shaderLocation: 2, offset: 16, format: 'float32' }, // colorIndex
            { shaderLocation: 3, offset: 20, format: 'uint32' }, // globalInstanceIdx
            { shaderLocation: 4, offset: 24, format: 'float32' }, // kPerZ — read by visual `vs`, ignored by `fsPick`
            { shaderLocation: 5, offset: 28, format: 'float32' }, // axisRatio — ellipse mask, ignored by `fsPick`
            { shaderLocation: 6, offset: 32, format: 'float32' }, // positionAngleDeg — ellipse mask, ignored by `fsPick`
            { shaderLocation: 7, offset: 36, format: 'float32' }, // diameterKpc — apparent-size sizing, ignored by `fsPick`
            { shaderLocation: 8, offset: 40, format: 'float32' }, // vMaxWeight — Malmquist 1/V_max alpha, ignored by `fsPick`
            { shaderLocation: 9, offset: 44, format: 'float32' }, // schechterRatio — Malmquist Schechter alpha, ignored by `fsPick`
            { shaderLocation: 10, offset: 48, format: 'float32' }, // angularDensityWeight — Malmquist HEALPix alpha, ignored by `fsPick`
          ],
        },
      ],
    },

    fragment: {
      module,
      entryPoint: 'fsPick', // the picking fragment — writes instance index to r32uint

      targets: [
        {
          // `r32uint` is a single 32-bit unsigned integer per texel.
          // The `fsPick` shader writes `instanceIdx + 1` into the red channel.
          // No blend descriptor: WebGPU does not support blending on integer formats.
          format: 'r32uint',
        },
      ],
    },

    primitive: { topology: 'triangle-list' },

    // ── Depth-stencil state ────────────────────────────────────────────────
    //
    // The visual pass omits depth because additive blending wants *every*
    // overlapping galaxy halo to contribute.  The pick pass is different: only
    // the front-most point should claim a pixel.  Depth test 'less' means a
    // new fragment replaces the stored depth only if it is closer to the camera.
    // depthWriteEnabled must be true, otherwise the depth buffer is never updated
    // and every fragment would pass (last draw wins instead of nearest wins).
    depthStencil: {
      format: 'depth24plus',
      depthWriteEnabled: true,
      depthCompare: 'less',
    },
  });

  // ── Staging buffer ─────────────────────────────────────────────────────────
  //
  // `copyTextureToBuffer` requires `bytesPerRow` to be a multiple of 256 (the
  // WebGPU spec §18.3 alignment requirement). Even though we only copy a single
  // 4-byte texel, we must allocate at least 256 bytes.  We never map this
  // buffer for writing — only MAP_READ is needed.
  const stagingBuffer = device.createBuffer({
    size: 256,
    usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
  });

  // ── Texture state (lazily allocated) ───────────────────────────────────────
  //
  // We defer texture creation to the first `pick()` call (and recreate when the
  // viewport changes) so the constructor never needs to know the canvas size.
  let pickTexture: GPUTexture | null = null;
  let depthTexture: GPUTexture | null = null;
  let texWidth = 0;
  let texHeight = 0;

  // ── Concurrency guard ──────────────────────────────────────────────────────
  //
  // mapAsync is async; if two hover events fire within the same GPU frame, the
  // second call would try to map a buffer that is still in use — a WebGPU
  // validation error.  We track inflight state and bail early with -1.
  // Task 17 will throttle pointer events so this guard is rarely triggered.
  let inFlight = false;

  // ── Helpers ────────────────────────────────────────────────────────────────

  /**
   * Ensure the pick texture and depth texture match the requested dimensions.
   * Destroys and recreates them only when the size actually changes, to avoid
   * unnecessary GPU allocations on every frame.
   */
  function ensureTextures(w: number, h: number): void {
    if (w === texWidth && h === texHeight && pickTexture !== null) return;

    // Destroy stale textures before allocating new ones to reclaim VRAM.
    pickTexture?.destroy();
    depthTexture?.destroy();

    // ── Pick texture ───────────────────────────────────────────────────────
    //
    // `RENDER_ATTACHMENT` — the render pass can write to it.
    // `COPY_SRC`          — we copy a single pixel out of it after the pass.
    pickTexture = device.createTexture({
      size: { width: w, height: h },
      format: 'r32uint',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });

    // ── Depth texture ──────────────────────────────────────────────────────
    //
    // `depth24plus` gives a 24-bit depth buffer (the minimum the spec guarantees
    // for the `depthCompare:'less'` mode we configured above).
    // Only `RENDER_ATTACHMENT` is needed — depth buffers are not typically read
    // back to the CPU, so no `COPY_SRC` here.
    depthTexture = device.createTexture({
      size: { width: w, height: h },
      format: 'depth24plus',
      usage: GPUTextureUsage.RENDER_ATTACHMENT,
    });

    texWidth = w;
    texHeight = h;
  }

  // ── Public API ─────────────────────────────────────────────────────────────

  async function pick(
    viewportPx: [number, number],
    pickXPx: number,
    pickYPx: number,
    sources: Iterable<PickSourceDraw>,
    sharedUniformBuffer: GPUBuffer,
  ): Promise<number> {
    // Concurrency guard — see the `inFlight` declaration above for rationale.
    if (inFlight) return -1;

    // Materialise the source iterator once so we can check emptiness up front
    // and iterate it again for the draw loop without re-walking the engine's
    // generator (which is one-shot).  Bail before allocating any GPU
    // resources if no surveys are visible — saves a pointless texture clear.
    const sourceList = Array.from(sources);
    if (sourceList.length === 0) return -1;

    const [vpW, vpH] = viewportPx;

    // Recreate textures if the viewport changed.
    ensureTextures(vpW, vpH);

    // Safety assertions — TypeScript can't prove these non-null after
    // ensureTextures() but we know they are.
    const pt = pickTexture!;
    const dt = depthTexture!;

    // ── Clamp pick coordinates ────────────────────────────────────────────
    //
    // The caller passes DPR-scaled CSS coordinates.  Clamp to [0, dim-1] so
    // `copyTextureToBuffer` never reads outside the texture bounds (which would
    // be a validation error).
    const px = Math.max(0, Math.min(vpW - 1, Math.floor(pickXPx)));
    const py = Math.max(0, Math.min(vpH - 1, Math.floor(pickYPx)));

    // ── Suppress the selection halo for the pick pass ─────────────────────
    //
    // The shared uniform buffer carries `selectedIndex`, which the visual
    // shader uses to enlarge the selected billboard 8× and render it as a
    // ring. We re-use the same buffer here so viewProj / viewport stay in
    // sync, but if we *also* let the pick pass see the real selectedIndex
    // it would inherit the 8× scaling — combined with the pick fragment's
    // `r² < 2.25` forgiveness radius this gives the selected point a pick
    // area roughly 12× larger than every other point, swallowing clicks
    // around its halo.
    //
    // Fix: write the "no selection" sentinel (0xFFFFFFFF, the same value
    // used when nothing is pinned) into the uniform buffer's selectedIndex
    // slot for the duration of the pick render pass. The visual pass on the
    // next frame overwrites this with the real selectedIndex, so we don't
    // need to restore anything afterward.
    //
    // Layout: mat4 viewProj (64) + viewport (8) + pointSizePx (4) +
    // brightness (4) → selectedIndex sits at byte offset 80.
    const SELECTED_INDEX_OFFSET = 80;
    const NONE_SENTINEL = new Uint32Array([0xffffffff]);
    device.queue.writeBuffer(sharedUniformBuffer, SELECTED_INDEX_OFFSET, NONE_SENTINEL);

    // ── Single-encoder, single-submit pick pass ───────────────────────────
    //
    // One encoder, one render pass, multiple per-source draw calls — the
    // standard WebGPU pattern.  Cross-survey identification works because
    // each per-instance vertex carries its own globalInstanceIdx (baked at
    // upload time in pointRenderer.upload), so `fsPick` writes globally-
    // unique IDs without needing per-draw uniform updates.  No
    // writeBuffer race to manage; no per-source submits needed.
    const encoder = device.createCommandEncoder();
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: pt.createView(),
          // Cleared to 0 (the "no hit" sentinel after subtracting 1).
          clearValue: { r: 0, g: 0, b: 0, a: 0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      depthStencilAttachment: {
        view: dt.createView(),
        depthClearValue: 1.0,
        depthLoadOp: 'clear',
        depthStoreOp: 'store',
      },
    });

    // ── Bind group ─────────────────────────────────────────────────────────
    //
    // `layout:'auto'` on the pipeline reflects the @group(0) @binding(0) entry
    // from the shader.  We build the bind group with the *passed-in* uniform
    // buffer — the same buffer PointRenderer writes to — so the pick pass sees
    // the same viewProj/viewport values as the visual pass did this frame.
    //
    // Creating the bind group inside pick() (rather than once in the constructor)
    // lets the caller swap the sharedUniformBuffer between calls if needed, and
    // avoids caching a stale reference if the buffer is ever recreated.
    const bindGroup = device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: sharedUniformBuffer } }],
    });

    pass.setPipeline(pipeline);
    pass.setBindGroup(0, bindGroup);

    for (const src of sourceList) {
      pass.setVertexBuffer(0, src.vertexBuffer);
      pass.draw(6, src.count);
    }
    pass.end();

    // ── Texture → staging buffer copy ─────────────────────────────────────
    //
    // Copy the single texel at (px, py) into the staging buffer.
    //
    // `bytesPerRow` must be a multiple of 256 per the WebGPU spec (§18.3).
    // We allocate 256 bytes for the staging buffer so this constraint is met
    // even though we only read 4 bytes (one r32uint = 4 bytes).
    encoder.copyTextureToBuffer(
      { texture: pt, origin: { x: px, y: py, z: 0 } },
      { buffer: stagingBuffer, bytesPerRow: 256 },
      { width: 1, height: 1, depthOrArrayLayers: 1 },
    );

    // Submit to the GPU. `queue.submit` is non-blocking on the JS side; the
    // GPU executes the commands asynchronously. `mapAsync` below will wait
    // until the GPU has finished writing the staging buffer before resolving.
    device.queue.submit([encoder.finish()]);

    // ── Async readback ─────────────────────────────────────────────────────
    //
    // `mapAsync(GPUMapMode.READ)` returns a Promise that resolves once:
    //   1. The submitted commands have completed on the GPU.
    //   2. The staging buffer contents have been copied into CPU-accessible memory.
    //
    // Between `mapAsync` resolving and `unmap()`, we can read the buffer via
    // `getMappedRange()`.  After `unmap()` the buffer returns to GPU-owned
    // memory and is ready for the next pick call.
    inFlight = true;
    try {
      await stagingBuffer.mapAsync(GPUMapMode.READ);
      const mapped = new Uint32Array(stagingBuffer.getMappedRange(0, 4));
      const raw = mapped[0]!;
      stagingBuffer.unmap();

      // Decode: 0 → background (return -1), N → point index N-1 (return N-1).
      return raw === 0 ? -1 : raw - 1;
    } finally {
      // Always clear inFlight, even if an exception is thrown.
      inFlight = false;
    }
  }

  function destroy(): void {
    pickTexture?.destroy();
    depthTexture?.destroy();
    stagingBuffer.destroy();
  }

  return { pick, destroy };
}
