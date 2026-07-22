/**
 * renderScheduler — coalescing wrapper around `requestAnimationFrame`.
 *
 * ### Why a dedicated module
 *
 * A perpetually self-rescheduling render loop burns CPU on every frame
 * even when nothing has changed. Render-on-demand avoids that, but it
 * requires a single source of truth that knows "is a frame already
 * queued?" — otherwise multiple event handlers firing in the same tick
 * (e.g. pointermove + wheel + resize) would each queue their own rAF,
 * defeating the purpose.
 *
 * Keeping the token bookkeeping in a tiny module gives us:
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
 * canvas.addEventListener('wheel', () => { sched.requestRender(); });
 * canvas.addEventListener('pointerdown', () => { sched.requestRender(); });
 *
 * function frame() {
 *   // ...all the existing per-frame work...
 *   if (autoRotate || currentTween || queue.inFlightCount() > 0) {
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

import type { Destroyable } from '../../../@types/rendering/Destroyable';
import type { RenderScheduler } from '../../../@types/engine/subsystems/RenderScheduler';
import type { RenderSchedulerOptions } from '../../../@types/engine/subsystems/RenderSchedulerOptions';

export function createRenderScheduler(opts: RenderSchedulerOptions): RenderScheduler {
  const raf = opts.rafImpl ?? requestAnimationFrame.bind(window);
  const caf = opts.cafImpl ?? cancelAnimationFrame.bind(window);
  const setIdleTimer = opts.setTimeoutImpl ?? setTimeout;
  const clearIdleTimer = opts.clearTimeoutImpl ?? clearTimeout;

  // The single rAF token. 0 means "not scheduled" — rAF returns a
  // strictly positive integer per the WHATWG spec, so 0 is a safe
  // sentinel.
  let token = 0;

  // The single pending idle-tick handle (see `requestIdleFrame`). `null` means
  // "no idle heartbeat armed". Only ever one at a time — that single-token
  // discipline is what stops the coarse heartbeat from stacking timers.
  // `ReturnType<typeof setTimeout>` is the portable handle type (a numeric id in
  // the browser, a `Timeout` object under Node). With both lib typings present
  // the CALL expression widens to `number | Timeout`, which the utility type
  // does not — so the one assignment site below asserts back to this handle type.
  let idleToken: ReturnType<typeof setTimeout> | null = null;

  function tick(): void {
    // Clear the token BEFORE running the frame body so that a
    // `requestRender()` call from inside `onFrame` (e.g. the engine's
    // "still animating" tail) is allowed to schedule the *next* frame
    // rather than being short-circuited as a duplicate of this one.
    token = 0;
    opts.onFrame();
  }

  function requestRender(): void {
    if (token !== 0) return; // already queued — coalesce
    token = raf(tick);
  }

  function fireIdle(): void {
    // The timer fired: drop the handle (so the frame body may re-arm a fresh
    // one) and wake the loop for exactly one frame.
    idleToken = null;
    requestRender();
  }

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch below — the scheduler is the
  // first subsystem the engine tears down (it must stop ticking before
  // anything else releases GPU state), and the latch makes the
  // "scheduler always exposes destroy()" invariant a compile-time check.
  const scheduler: RenderScheduler = {
    requestRender,
    requestIdleFrame(delayMs: number): void {
      // Ignore while the loop is already awake (a rAF frame queued) — that
      // frame will refresh the scene sooner than any idle tick would. And
      // never stack: one pending idle timer at a time. These two guards are
      // what keep the coarse heartbeat from fighting render-on-demand.
      if (token !== 0 || idleToken !== null) return;
      idleToken = setIdleTimer(fireIdle, delayMs) as ReturnType<typeof setTimeout>;
    },
    destroy(): void {
      if (idleToken !== null) {
        clearIdleTimer(idleToken);
        idleToken = null;
      }
      if (token === 0) return;
      caf(token);
      token = 0;
    },
    isScheduled(): boolean {
      return token !== 0;
    },
  };
  scheduler satisfies Destroyable;
  return scheduler;
}
