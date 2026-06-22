/**
 * PickRenderer — public surface of the offscreen per-point picker.
 *
 * Create one instance at startup with `createPickRenderer(device, ...)` and
 * keep it alive for the duration of the app.  Call `pick()` whenever you want
 * to know which point is under the cursor.
 */

import type { PickSourceDraw } from './PickSourceDraw';
import type { PickResult } from '../data/PickResult';
import type { Vec2 } from '../math/Vec2';

export type PickRenderer = {
  /**
   * Human-readable identifier (`'pickRenderer'`).  Part of the
   * shared `Renderer` contract — see `Renderer.d.ts`.
   */
  readonly label: string;
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
   * `pick()` uploads the caller's `uniformBytes` to the pick renderer's
   * OWN GPU buffer, then applies three pick-specific overrides on top
   * (selectedPacked sentinel, padded pointSizePx, pickPass = 1).  The
   * visual pass's GPU buffer is NEVER touched — there is no shared
   * buffer, no two-writer hazard, and no dependency on frame ordering.
   * `uniformBytes` is the CPU copy that `pointRenderer.draw()` returns
   * after each visual frame (stashed on `state.picking.lastFrameUniformBytes`).
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
   * @param sources          Per-source draw records, one per visible galaxy catalog, in
   *                         the same enum order as `PointRenderer.loadedSources()`.
   *                         The caller is responsible for filtering by visibility
   *                         mask — the picker draws every record it receives.
   * @returns A {@link PickResult} carrying the front-most fragment's decoded
   *          identity — its `sourceCode` + per-source `localIdx`. Classifying
   *          that into a galaxy or a structure ring is `resolvePick`'s
   *          job. Returns `null` if the cursor is over background or a pick is
   *          already in flight. See `selectionEncoding.ts` for the
   *          (sourceCode << 27 | localIdx + 1) packing.
   */
  pick(
    viewportPx: Vec2,
    pickXPx: number,
    pickYPx: number,
    sources: Iterable<PickSourceDraw>,
    /**
     * The user's current `pointSizePx` setting.  The pick pass uploads
     * `pointSizePx + PICK_PADDING_PX` onto `pickUniformBuffer` so
     * distant point-like galaxies have a wider hit-test area without
     * growing the visible sprites.  See `PICK_PADDING_PX` in
     * `pickRenderer.ts` for the padding rationale.
     */
    pointSizePx: number,
    /**
     * Packed uniform bytes from the last visual frame (the value
     * `pointRenderer.draw()` returned and was stashed on
     * `state.picking.lastFrameUniformBytes`).  Uploaded verbatim to
     * the pick renderer's own GPU buffer, then the three pick-specific
     * fields are overridden.  Reproduces the camera/viewport/settings
     * state the visual frame rendered without re-running the camera
     * drivers or sharing any buffer with the visual pass.
     */
    uniformBytes: ArrayBuffer,
    /**
     * Optional `RenderPassTimestampWrites` descriptor for per-pass GPU
     * profiling.  When the engine's timing service is active, callers
     * pass `timingService.descriptorFor('pick')` here and the pick
     * render pass writes start/end timestamps into the shared query
     * set's slot pair for the 'pick' slot (currently 18, 19).
     *
     * Because the pick pass runs on its own command encoder and its
     * own `queue.submit`, the resolve+copy of those slots does NOT
     * ride on the pick encoder — it rides on the next main-frame's
     * `endFrame` (the timing service owns the singleton query set
     * shared between the main frame and the pick pass).  Cross-frame
     * latency is therefore at most one main frame.  When pick doesn't
     * fire, the slots stay at their sentinel-zero values so the
     * decoder treats them as "didn't run" and the UI shows `—`.
     *
     * Optional — omitting it (or passing `undefined`, e.g. when the
     * timing service isn't initialised on the active GPU adapter)
     * preserves byte-for-byte equivalence with the pre-timing pass
     * descriptor.
     */
    timingDescriptor?: GPURenderPassTimestampWrites,
  ): Promise<PickResult | null>;

  /**
   * Render the pick pass into the internal pick texture and return the
   * texture handle for a downstream debug overlay to sample.  Skips
   * the single-pixel readback `pick()` performs.
   *
   * Synchronous (unlike `pick()`) so it can run inside the per-frame
   * loop without an `await` per frame.  Independent of `pick()`'s
   * `inFlight` guard — sharing it would make the overlay flicker
   * whenever a hover-pick was mid-flight.
   *
   * Writes the pick renderer's OWN buffer (same as `pick()`) — the
   * visual pass's buffer is never touched.  Applies the same three
   * pick-specific overrides (selectedPacked sentinel, padded
   * pointSizePx, pickPass = 1) so the overlay shows exactly what
   * `pick()` would hit.
   *
   * Returns null when the source list is empty.
   *
   * @param viewportPx   Physical canvas size in backing-store pixels.
   * @param sources      Per-source draw records — same shape `pick()` accepts.
   * @param pointSizePx  The user's current point-size setting; see `pick()`.
   * @param uniformBytes Last-frame packed uniform bytes; see `pick()`.
   */
  renderForDebug(
    viewportPx: Vec2,
    sources: Iterable<PickSourceDraw>,
    pointSizePx: number,
    uniformBytes: ArrayBuffer,
  ): GPUTexture | null;

  /**
   * Release all GPU resources owned by this renderer.
   *
   * Call this if you ever destroy and recreate the renderer (e.g. after a
   * device loss recovery).  After `destroy()`, calling `pick()` will produce
   * undefined behaviour.
   */
  destroy(): void;
};
