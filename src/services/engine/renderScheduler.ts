/**
 * renderScheduler — coalescing wrapper around `requestAnimationFrame`.
 *
 * ### Why a dedicated module
 *
 * The engine's render loop used to perpetually re-schedule itself,
 * burning CPU on every frame even when nothing had changed. Switching
 * to render-on-demand requires a single source of truth that knows
 * "is a frame already queued?" — otherwise multiple event handlers
 * firing in the same tick (e.g. pointermove + wheel + resize) would
 * each queue their own rAF, defeating the purpose.
 *
 * Extracting the boolean + token bookkeeping into a tiny module gives
 * us:
 *
 *   1. Vitest coverage of the contract (one frame per dirty-mark, no
 *      duplicates, sleeps when no one calls `requestRender`).  No
 *      WebGPU device required to test.
 *   2. A clean seam where the engine doesn't have to think about rAF
 *      tokens at all — it just calls `requestRender()` from event
 *      handlers and `frame()` runs.
 *
 * ### Usage from the engine
 *
 * ```ts
 * const sched = createRenderScheduler({ onFrame: () => frame() });
 * canvas.addEventListener('pointermove', () => {
 *   latestMouseCss = ...;
 *   sched.requestRender();
 * });
 *
 * function frame() {
 *   // ...all the existing per-frame work...
 *   if (autoRotate || currentTween || hasAnyAxis(spaceMouse) || queue.inFlightCount() > 0) {
 *     sched.requestRender();
 *   }
 * }
 * ```
 *
 * ### Why inject rAF / cAF
 *
 * Vitest runs in Node where `requestAnimationFrame` is patched with
 * `setImmediate`-equivalent timing. Injecting the raf implementation
 * lets unit tests run a synchronous fake instead of relying on Node
 * event-loop ordering — the tests pop a callback from a captured
 * queue and verify behaviour deterministically.
 */

export type RenderSchedulerOptions = {
  /** Called every time a scheduled frame fires. */
  onFrame: () => void;
  /**
   * rAF implementation. Defaults to the global `requestAnimationFrame`.
   * Tests inject a fake.
   */
  rafImpl?: (cb: FrameRequestCallback) => number;
  /**
   * cAF implementation. Defaults to the global `cancelAnimationFrame`.
   * Tests inject a fake.
   */
  cafImpl?: (id: number) => void;
};

export type RenderScheduler = {
  /**
   * Mark the scene dirty and ensure exactly one rAF is queued. Subsequent
   * calls before the frame fires are coalesced into the existing token.
   *
   * Idempotent within a single frame — call as many times as you like
   * from event handlers; only one frame will fire.
   */
  requestRender(): void;
  /**
   * Cancel a queued frame (if any) and reset to "idle". Used by the
   * engine's `destroy()` to avoid a final post-teardown frame firing
   * after GPU resources have been released.
   */
  cancelRender(): void;
  /**
   * `true` when a frame is queued and pending; `false` when the loop is
   * idle. Mostly for tests; also useful for assertions in DevTools.
   */
  isScheduled(): boolean;
};

export function createRenderScheduler(opts: RenderSchedulerOptions): RenderScheduler {
  const raf = opts.rafImpl ?? requestAnimationFrame.bind(window);
  const caf = opts.cafImpl ?? cancelAnimationFrame.bind(window);

  // The single rAF token. 0 means "not scheduled" — rAF returns a
  // strictly positive integer per the WHATWG spec, so 0 is a safe
  // sentinel.
  let token = 0;

  function tick(): void {
    // Clear the token BEFORE running the frame body so that a
    // `requestRender()` call from inside `onFrame` (e.g. the engine's
    // "still animating" tail) is allowed to schedule the *next* frame
    // rather than being short-circuited as a duplicate of this one.
    token = 0;
    opts.onFrame();
  }

  return {
    requestRender(): void {
      if (token !== 0) return; // already queued — coalesce
      token = raf(tick);
    },
    cancelRender(): void {
      if (token === 0) return;
      caf(token);
      token = 0;
    },
    isScheduled(): boolean {
      return token !== 0;
    },
  };
}
