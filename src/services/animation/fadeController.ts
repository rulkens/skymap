/**
 * fadeController — pure-CPU opacity ramp primitive used by the unified
 * fade registry.
 *
 * ### Why a factory (not a class)
 *
 * Matches the codebase's broader factory-shape pattern (renderScheduler, …). Closure-captured state means no `this` confusion
 * and consumers can destructure (`const { fadeTo } = createFadeController()`).
 *
 * ### Why smoothstep
 *
 * Cubic Hermite ease (3t² − 2t³) starts and ends with zero derivative —
 * the eye perceives the ramp as a single continuous motion rather than a
 * snap at either endpoint. WGSL's built-in `smoothstep` uses the same
 * curve; matching it CPU-side means the registry's per-frame opacity
 * write produces the same visual shape the shader would have if we'd
 * baked the smoothstep into the shader instead.
 *
 * ### Why Promise<void> from fadeTo
 *
 * The slot orchestration code does
 *
 *   await fades.fadeTo(handle, 0, FADE_OUT_DURATION_MS);
 *   renderer.upload(catalogId, newCatalog);
 *   fades.fadeTo(handle, 1, FADE_IN_DURATION_MS);
 *
 * — naturally sequential, naturally readable. A callback API would
 * force the second and third lines into a `.then(...)` continuation
 * and the local bindings would have to be re-captured.
 * The promise allocation per fade is negligible (a few per second at
 * most).
 *
 * ### Why tick(now), not setTimeout
 *
 * Promises resolve via the registry's per-frame tick rather than a
 * `setTimeout` scheduled at start-of-fade. Two reasons:
 *
 *   1. The render-on-demand scheduler already ticks the frame loop
 *      while any fade is in flight (the registry's `isAnyAnimating()`
 *      gate keeps it awake). Resolving promises in lockstep with the
 *      frame body means the slot's `await` chains complete in the same
 *      frame boundary the visual state advanced through — no off-by-one
 *      where a `setTimeout` fires before the GPU has drawn the final
 *      frame of the ramp.
 *   2. `setTimeout` precision is browser-throttled to 4 ms minimum
 *      (and worse under heavy load). `performance.now()` against the
 *      frame's rAF timestamp is sub-ms accurate.
 */

import type { FadeController } from '../../@types/animation/FadeController';

/**
 * Fade-in duration in milliseconds. 600 ms is sub-conscious — long
 * enough that the eye perceives "things flowing in" rather than a pop,
 * short enough that switching tiers doesn't feel sluggish. Used as the
 * default by every loading-slot fade-in and every UI-toggle "on" path.
 */
export const FADE_IN_DURATION_MS = 600;

/**
 * Fade-out duration in milliseconds. 100 ms is near-instant — long
 * enough to avoid a hard cut, short enough that the user perceives the
 * response as immediate. Used as the default by every loading-slot
 * fade-out (before a tier-swap upload) and every UI-toggle "off" path.
 */
export const FADE_OUT_DURATION_MS = 100;

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

type PendingResolve = {
  resolveMs: number;
  readonly resolve: () => void;
};

export function createFadeController(
  initialOpacity: number = 0,
  nowMs: number = performance.now(),
): FadeController {
  let sourceOpacity = initialOpacity;
  let targetOpacity = initialOpacity;
  let transitionStartMs = nowMs;
  let transitionDurationMs = 0;
  const pending: PendingResolve[] = [];
  // No explicit cleanup path. The registry owns FadeController lifetimes
  // and discards a controller (drops its reference) only when the layer
  // is unregistered. If a controller is abandoned mid-ramp, its pending
  // promises never resolve — that's by design; callers tear down the
  // registry, not individual controllers.

  function currentOpacity(now: number = performance.now()): number {
    if (transitionDurationMs <= 0) return targetOpacity;
    const t = smoothstep(transitionStartMs, transitionStartMs + transitionDurationMs, now);
    return sourceOpacity + (targetOpacity - sourceOpacity) * t;
  }

  function isAnimating(now: number = performance.now()): boolean {
    if (transitionDurationMs <= 0) return false;
    return now < transitionStartMs + transitionDurationMs;
  }

  function fadeTo(
    target: number,
    durationMs: number,
    now: number = performance.now(),
  ): Promise<void> {
    // Capture the current opacity BEFORE updating the source, so mid-
    // flight retargeting picks up from wherever the previous ramp reached
    // rather than snapping back to the previous source.
    sourceOpacity = currentOpacity(now);
    targetOpacity = target;
    transitionStartMs = now;
    transitionDurationMs = Math.max(0, durationMs);
    return new Promise<void>((resolve) => {
      pending.push({
        resolveMs: now + transitionDurationMs,
        resolve,
      });
    });
  }

  function setImmediate(value: number): void {
    sourceOpacity = value;
    targetOpacity = value;
    transitionDurationMs = 0;
    // Any pending promises are now satisfied — pull their deadlines back
    // to 0 so the next tick (however soon it comes) resolves them.
    // Don't resolve here directly to keep tick the single resolution site
    // (matches the per-frame contract).
    for (const p of pending) {
      p.resolveMs = 0;
    }
  }

  function tick(now: number = performance.now()): void {
    // Resolve and remove every pending promise whose deadline has
    // elapsed. Iterate in place; the order doesn't matter because
    // each promise resolves independently.
    for (let i = pending.length - 1; i >= 0; i--) {
      if (now >= pending[i]!.resolveMs) {
        pending[i]!.resolve();
        pending.splice(i, 1);
      }
    }
  }

  return { fadeTo, setImmediate, currentOpacity, isAnimating, tick };
}
