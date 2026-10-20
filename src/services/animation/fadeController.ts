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

export function createFadeController(
  initialOpacity: number = 0,
  nowMs: number = performance.now(),
): FadeController {
  let sourceOpacity = initialOpacity;
  let targetOpacity = initialOpacity;
  let transitionStartMs = nowMs;
  let transitionDurationMs = 0;

  function currentOpacity(now: number = performance.now()): number {
    if (transitionDurationMs <= 0) return targetOpacity;
    const t = smoothstep(transitionStartMs, transitionStartMs + transitionDurationMs, now);
    return sourceOpacity + (targetOpacity - sourceOpacity) * t;
  }

  function isAnimating(now: number = performance.now()): boolean {
    if (transitionDurationMs <= 0) return false;
    return now < transitionStartMs + transitionDurationMs;
  }

  function targetOf(): number {
    return targetOpacity;
  }

  function fadeTo(target: number, durationMs: number, now: number = performance.now()): void {
    // Already there: leave the ramp alone, so a re-sync of an unchanged
    // intent can't restart an in-flight fade.
    if (target === targetOpacity) return;

    // Capture the current opacity BEFORE updating the source, so mid-
    // flight retargeting picks up from wherever the previous ramp reached
    // rather than snapping back to the previous source.
    sourceOpacity = currentOpacity(now);
    targetOpacity = target;
    transitionStartMs = now;
    transitionDurationMs = Math.max(0, durationMs);
  }

  function setImmediate(value: number): void {
    sourceOpacity = value;
    targetOpacity = value;
    transitionDurationMs = 0;
  }

  return { fadeTo, setImmediate, currentOpacity, isAnimating, targetOf };
}
