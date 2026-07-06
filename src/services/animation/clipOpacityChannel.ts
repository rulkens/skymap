/**
 * clipOpacityChannel — the clip-owned transient opacity channel.
 *
 * Wraps one private FadeController per VisibilityLayerKey, created lazily on
 * the first `fadeTo` call for a given key. This mirrors the pattern used by
 * `structureFocusSubsystem` (one private `createFadeController`, NOT the
 * shared FadeRegistry), extended to a keyed map: one controller per layer.
 *
 * ### Lazy default-1 design
 *
 * Controllers are created with `initialOpacity = 1` and only when a key is
 * first touched. An untouched key has no controller, and `factorOf` returns 1
 * directly — the layer is fully visible. This avoids allocating N controllers
 * upfront for a clip that fades only two of thirteen layers, and keeps the
 * 'clip factor = 1 means unchanged' invariant true by construction.
 *
 * ### Relation to the other opacity channels
 *
 * The clip factor is the third factor in the compositing chain:
 *
 *   final = registry factor × intent-bridge factor × clip factor
 *
 * `reset()` clears the controller map entirely, which is equivalent to
 * resetting every layer's clip factor to 1 — because untouched keys always
 * return 1 by the lazy-default rule. Clearing is therefore correct teardown.
 *
 * ### tick vs currentOpacity
 *
 * The FadeController's opacity is time-based: `currentOpacity(now)` computes
 * the smoothstep position at `now` without needing `tick`. `tick` advances
 * the controller's internal bookkeeping (resolves pending Promises). This
 * channel calls `tick` on every controller so the FadeController lifecycle
 * is properly maintained even though this channel does not expose the
 * underlying Promises.
 *
 * ### The default clock is the last ticked frame time
 *
 * When a caller omits `nowMs`, the channel falls back to the time of the
 * most recent `tick(nowMs)` — the frame clock the clip player forwards from
 * `runFrame` — NOT `performance.now()`. Same rationale as the FadeRegistry:
 * quantizing to the frame clock keeps every factor a pure function of
 * stamped time (deterministic under a stepped recorder clock), at the cost
 * of at most one frame of skew live. `performance.now()` must not be
 * sampled anywhere in this module.
 */

import { createFadeController } from './fadeController';
import type { ClipOpacityChannel } from '../../@types/animation/ClipOpacityChannel';
import type { VisibilityLayerKey } from '../../@types/animation/VisibilityLayerKey';
import type { FadeController } from '../../@types/animation/FadeController';

export function createClipOpacityChannel(
  // Accepted for API symmetry with other factory shapes (e.g. createFadeController,
  // createStructureFocusSubsystem). Unused here because controllers are lazy —
  // each is stamped with the `now` from its first fadeTo call, not construction
  // time — so the default of 0 is inert (no animation can precede construction).
  _initialNowMs: number = 0,
): ClipOpacityChannel {
  // One private FadeController per key, created lazily on first fadeTo.
  const controllers = new Map<VisibilityLayerKey, FadeController>();

  // The channel's default clock: the frame time of the most recent tick.
  // See the module-header rationale ("The default clock is the last ticked
  // frame time").
  let lastTickNowMs = 0;

  function getOrCreate(key: VisibilityLayerKey, nowMs: number): FadeController {
    let controller = controllers.get(key);
    if (controller === undefined) {
      // Default opacity 1 — untouched layers are fully visible.
      controller = createFadeController(1, nowMs);
      controllers.set(key, controller);
    }
    return controller;
  }

  function fadeTo(
    key: VisibilityLayerKey,
    target: number,
    durationMs: number,
    nowMs?: number,
  ): void {
    // Resolve `now` once so the lazy-create and the underlying fadeTo share
    // the same timestamp — a two-timestamp split would start the ramp clock
    // slightly after creating the controller, causing an off-by-a-few-μs
    // initial opacity on the first tick.
    const now = nowMs ?? lastTickNowMs;
    const controller = getOrCreate(key, now);
    // durationMs === 0 snaps instantly via FadeController's Math.max(0, durationMs) path.
    void controller.fadeTo(target, durationMs, now);
  }

  function factorOf(key: VisibilityLayerKey, nowMs?: number): number {
    const controller = controllers.get(key);
    // No controller for this key means it was never touched — default 1.
    if (controller === undefined) return 1;
    return controller.currentOpacity(nowMs ?? lastTickNowMs);
  }

  function tick(nowMs: number): void {
    // Record the frame clock as the channel's default time (see module
    // header), then advance every controller's bookkeeping (resolves
    // pending Promises). Factor values advance by the stamped clock via
    // currentOpacity regardless of tick; tick is for lifecycle correctness.
    lastTickNowMs = nowMs;
    for (const controller of controllers.values()) {
      controller.tick(nowMs);
    }
  }

  function isAnimating(nowMs?: number): boolean {
    const now = nowMs ?? lastTickNowMs;
    for (const controller of controllers.values()) {
      if (controller.isAnimating(now)) return true;
    }
    return false;
  }

  function reset(): void {
    // Clearing the map resets every key's factor to 1 by the lazy-default
    // rule: a missing key always returns 1 from factorOf. No explicit
    // setImmediate(1) needed — deletion is the reset.
    controllers.clear();
  }

  return { fadeTo, factorOf, tick, isAnimating, reset };
}
