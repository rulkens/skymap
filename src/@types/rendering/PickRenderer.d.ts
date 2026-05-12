/**
 * PickRenderer — public surface of the offscreen per-point picker.
 *
 * Create one instance at startup with `createPickRenderer(device)` and keep it
 * alive for the duration of the app.  Call `pick()` whenever you want to know
 * which point is under the cursor.
 */

import type { Source } from '../../data/sources';
import type { PickSourceDraw } from './PickSourceDraw';

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
   * `pick()` does NOT write the per-frame uniforms (viewProj, viewport,
   * pointSizePx, brightness) — it reuses whatever the visual pass wrote
   * for the current camera state.  The shared uniform buffer is the one
   * owned by the `PointRenderer` passed to `createPickRenderer`; the
   * coupling is bound at construction time and is no longer threaded
   * through every call.  Call `pick()` *after* the visual frame has
   * written its uniforms.
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
   * @returns `{ source, localIdx }` decoded from the front-most point's
   *          packed pick value, or `null` if the cursor is over background
   *          or a pick is already in flight.  See PointRenderer's class
   *          docstring for the (sourceCode << 27 | localIdx + 1) packing.
   */
  pick(
    viewportPx: [number, number],
    pickXPx: number,
    pickYPx: number,
    sources: Iterable<PickSourceDraw>,
    /**
     * The user's current `pointSizePx` setting.  Used to compute the
     * pick-pass floor: `pointSizePx + PICK_PADDING_PX` is written into
     * the shared uniform buffer just before the pick pass so distant
     * point-like galaxies become easier to hover/click.  See
     * `PICK_PADDING_PX` for the rationale.
     *
     * Optional for backwards compatibility — when omitted, the pick
     * pass reads whatever the visual frame last wrote (no boost).
     */
    pointSizePx?: number,
  ): Promise<{ source: Source; localIdx: number } | null>;

  /**
   * Release all GPU resources owned by this renderer.
   *
   * Call this if you ever destroy and recreate the renderer (e.g. after a
   * device loss recovery).  After `destroy()`, calling `pick()` will produce
   * undefined behaviour.
   */
  destroy(): void;
};
