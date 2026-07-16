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

// TODO(wake-probe): remove after T13. Shared empty map returned by
// `getRequestReasonCounts()` in production builds, so the getter never
// allocates there — the bring-up bug is dev-only, and this keeps the prod
// hot path (`requestRender()`, called from many per-frame layers) free of
// any Map bookkeeping.
const EMPTY_REASON_COUNTS: ReadonlyMap<string, number> = new Map();

export function createRenderScheduler(opts: RenderSchedulerOptions): RenderScheduler {
  const raf = opts.rafImpl ?? requestAnimationFrame.bind(window);
  const caf = opts.cafImpl ?? cancelAnimationFrame.bind(window);

  // The single rAF token. 0 means "not scheduled" — rAF returns a
  // strictly positive integer per the WHATWG spec, so 0 is a safe
  // sentinel.
  let token = 0;

  // TODO(wake-probe): remove after T13. Dev-only tally of `requestRender()`
  // calls by caller-supplied `reason`, reset at the start of every `tick()`
  // (i.e. right before `onFrame()` runs) so the map reflects only the calls
  // made during — or on the way into — the CURRENT frame. `runFrame.ts`
  // reads a snapshot of this near the end of its own body, after per-frame
  // layers (which may call `requestRender()` directly, bypassing
  // `shouldKeepTicking`) have already run — see its wake-probe comment for
  // why that ordering matters for finding the RAF-loop-won't-sleep bug.
  const reasonCounts: Map<string, number> | null = import.meta.env.DEV ? new Map() : null;

  function tick(): void {
    // Clear the token BEFORE running the frame body so that a
    // `requestRender()` call from inside `onFrame` (e.g. the engine's
    // "still animating" tail) is allowed to schedule the *next* frame
    // rather than being short-circuited as a duplicate of this one.
    token = 0;
    reasonCounts?.clear();
    opts.onFrame();
  }

  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch below — the scheduler is the
  // first subsystem the engine tears down (it must stop ticking before
  // anything else releases GPU state), and the latch makes the
  // "scheduler always exposes destroy()" invariant a compile-time check.
  const scheduler: RenderScheduler = {
    requestRender(reason = 'unspecified'): void {
      // TODO(wake-probe): remove after T13. Tally BEFORE the coalescing
      // check — a coalesced call still tells us a caller wanted a frame.
      if (reasonCounts !== null) {
        reasonCounts.set(reason, (reasonCounts.get(reason) ?? 0) + 1);
      }
      if (token !== 0) return; // already queued — coalesce
      token = raf(tick);
    },
    destroy(): void {
      if (token === 0) return;
      caf(token);
      token = 0;
    },
    isScheduled(): boolean {
      return token !== 0;
    },
    getRequestReasonCounts(): ReadonlyMap<string, number> {
      return reasonCounts ?? EMPTY_REASON_COUNTS;
    },
  };
  scheduler satisfies Destroyable;
  return scheduler;
}
