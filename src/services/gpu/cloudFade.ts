/**
 * cloudFade — reusable fade-in helper for any GPU pipeline.
 *
 * ### What this owns
 *
 * One small uniform buffer (16 bytes — a single `f32 opacity` plus padding
 * to WebGPU's minimum uniform alignment), one bind group binding it at
 * `@group(1) @binding(0)`, and a `fadeStartMs` timestamp.
 *
 * ### Why a class
 *
 * Multiple subsystems need the same fade-in affordance:
 *
 *   - `pointRenderer` — per-source point clouds, fades when a survey lands
 *     or a tier swap re-uploads.
 *   - `filamentRenderer` — single cosmic-web skeleton, fades when the
 *     `filaments.bin` resolve completes.
 *   - Future overlays (HEALPix gridlines, Milky Way impostor swap-in,
 *     procedural-disk batch refresh, …) — same pattern.
 *
 * Without this helper each renderer duplicated `fadeStartMs` + a uniform
 * buffer + a bind group + a `writeBuffer` per frame + an `isFading()`
 * accessor.  Folding it into one class lets every consumer just hold a
 * `CloudFade | null`, reset it via `restart()` on upload, write it via
 * `writeFrame()` before drawing, and forward `isFading()` to the engine's
 * render-on-demand predicate.
 *
 * ### Why per-instance buffers
 *
 * Each `CloudFade` allocates its OWN uniform buffer.  Per CLAUDE.md →
 * "WebGPU `queue.writeBuffer` race", writing different values to one
 * shared uniform buffer between draws in a single frame produces
 * undefined ordering relative to submit — both draws end up reading
 * whichever value won the race.  Different buffers, different write
 * destinations: the writes can't race.  This is the same "bake
 * per-instance into the vertex buffer" pattern at a coarser granularity.
 *
 * ### Shader contract
 *
 * Consumers must declare in their WGSL:
 *
 *   ```wgsl
 *   struct CloudUniforms {
 *     opacity: f32,
 *     sourceCode: u32,
 *     _pad1: f32,
 *     _pad2: f32,
 *   };
 *   @group(1) @binding(0) var<uniform> cloud: CloudUniforms;
 *   ```
 *
 * …and multiply their fragment's final alpha by `cloud.opacity` before
 * returning.  Steady-state opacity is 1.0 so this is a no-op for any
 * cloud that's finished fading.
 *
 * ### sourceCode (added with the (source, localIdx) packing refactor)
 *
 * The second slot carries this cloud's 5-bit Source enum value, written
 * once per CloudFade instance (per upload).  The points-pass shader
 * recovers each instance's packed identity as
 * `(cloud.sourceCode << 27u) | u32(instance_index)` for the selection-
 * halo + pick-output paths.  Because every cloud has its OWN bind group
 * and own uniform buffer, draws within one render pass don't race on
 * sourceCode — the same architecture that already keeps `opacity` from
 * racing across draws (see "per-instance buffers" above).
 */

/**
 * Fade-in duration in milliseconds.  600 ms is sub-conscious — long enough
 * that the eye perceives "things flowing in" rather than a pop, short
 * enough that switching tiers doesn't feel sluggish.  Same constant used
 * by every consumer so all overlays fade in lock-step.
 */
export const CLOUD_FADE_DURATION_MS = 600;

/** Smoothstep cubic Hermite ease — matches GLSL/WGSL `smoothstep` semantics. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

/**
 * Per-cloud fade-in controller.  Owns the GPU uniform buffer, bind group,
 * and fade-start timestamp.  Construct once per cloud-equivalent (per
 * survey, per filament-cloud, etc.) and call `writeFrame()` before each
 * draw + `isFading()` from the engine's keep-rendering predicate.
 */
export class CloudFade {
  /** GPU uniform buffer that the shader reads as `CloudUniforms`. */
  readonly buffer: GPUBuffer;
  /** Bind group binding `buffer` to `@group(1) @binding(0)`. */
  readonly bindGroup: GPUBindGroup;

  /** `performance.now()` at the moment the fade started.  Resets via `restart()`. */
  private fadeStartMs: number;

  /**
   * Reusable scratch buffer for the per-frame writeBuffer call.  16 bytes
   * total = `f32 opacity + u32 sourceCode + 8 bytes pad`.  We need both
   * `Float32Array` and `Uint32Array` views over the same backing store
   * because slot 1 is a u32 and the rest f32.
   *
   * Allocated once per CloudFade instance (rather than once per process)
   * so two CloudFades writing in the same tick don't trip on each
   * other's stale bytes between the assignment and the queue submit.
   */
  private readonly scratchBuffer = new ArrayBuffer(16);
  private readonly scratchF32 = new Float32Array(this.scratchBuffer);
  private readonly scratchU32 = new Uint32Array(this.scratchBuffer);

  /**
   * The 5-bit Source enum value for this cloud.  Set once at construction
   * (or via `setSourceCode`) and re-uploaded as part of the per-frame
   * `writeFrame` call.  Defaults to 0 — production paths always pass a
   * real value.
   */
  private sourceCode = 0;

  /**
   * Build a new CloudFade.
   *
   * @param device the GPU device.
   * @param bindGroupLayout the pipeline's `@group(1)` layout — fetched
   *        via `pipeline.getBindGroupLayout(1)` after pipeline creation.
   *        The pipeline must have a corresponding WGSL declaration that
   *        matches the layout above.
   * @param startNowMs optional override of `performance.now()` for tests.
   */
  constructor(
    private readonly device: GPUDevice,
    bindGroupLayout: GPUBindGroupLayout,
    startNowMs: number = performance.now(),
  ) {
    this.buffer = device.createBuffer({
      // 16 bytes is WebGPU's minimum uniform-buffer alignment — even though
      // we only need 4 bytes for the f32 opacity, allocating less is a
      // validation error.  The shader's `_pad0/1/2` fields consume the
      // remaining 12 bytes; we never write to them.
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    this.bindGroup = device.createBindGroup({
      layout: bindGroupLayout,
      entries: [{ binding: 0, resource: { buffer: this.buffer } }],
    });
    this.fadeStartMs = startNowMs;
  }

  /**
   * Restart the fade.  Call when the underlying data is replaced
   * (e.g. tier swap re-uploads a survey, filament .bin resolves with new
   * content).  Resets `fadeStartMs` to now; the next `writeFrame()` will
   * write opacity 0.0 and the smoothstep ramps back up over
   * `CLOUD_FADE_DURATION_MS`.
   */
  restart(nowMs: number = performance.now()): void {
    this.fadeStartMs = nowMs;
  }

  /**
   * Write the current opacity to the GPU.  Call once per frame, before
   * `pass.setBindGroup(1, fade.bindGroup)` and the draw.
   *
   * Cheap when the fade has finished — opacity stays at 1.0 and we still
   * write 4 bytes per frame, but the alternative ("skip writeBuffer once
   * isFading is false") leaves the buffer at the last-written value
   * forever, which is fine but couples the consumer to that knowledge.
   * Always-write keeps the contract simple: the buffer is whatever
   * `writeFrame()` last produced.
   */
  writeFrame(nowMs: number = performance.now()): void {
    this.scratchF32[0] = smoothstep(0, CLOUD_FADE_DURATION_MS, nowMs - this.fadeStartMs);
    this.scratchU32[1] = this.sourceCode >>> 0;
    // Slots 2 + 3 (pads) stay zero — Uint32Array starts zero-initialised
    // and we never write them.
    this.device.queue.writeBuffer(this.buffer, 0, this.scratchBuffer);
  }

  /**
   * Set this cloud's sourceCode.  Production callers pass the 5-bit
   * Source enum value once at upload time; subsequent `writeFrame`
   * calls forward it to the GPU.
   */
  setSourceCode(source: number): void {
    this.sourceCode = source;
  }

  /**
   * Whether the fade is still in progress.  Forwarded to the engine's
   * render-on-demand predicate so the loop keeps ticking until the
   * smoothstep saturates at 1.0.
   */
  isFading(nowMs: number = performance.now()): boolean {
    return nowMs - this.fadeStartMs < CLOUD_FADE_DURATION_MS;
  }

  /**
   * Release the GPU buffer.  The bind group is freed automatically by
   * GC (it holds a reference to the buffer; no explicit destroy method
   * exists on bind groups in the WebGPU API).
   */
  destroy(): void {
    this.buffer.destroy();
  }
}
