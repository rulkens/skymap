/**
 * fadeRegistry — engine subsystem at `state.subsystems.fades`.
 *
 * Owns a `Map<string, FadeController>` keyed by `fadeIdentityKey` of
 * every registered identity. Core's visibility sync drives
 * the registry; renderers read `opacityOf(id, now)` per frame and
 * write the value into their per-id GPU fade buffer.
 *
 * ### Wake contract: fadeTo wakes the scheduler; callers do not
 *
 * `fadeTo` calls `deps.requestRender()` unconditionally, absolving every
 * caller; the frame-tail `isAnyAnimating` predicate keeps the loop alive
 * after that first wake. The other methods do NOT wake: `register` /
 * `setImmediate` run from already-awake settings paths or pre-frame
 * seeding, and `opacityOf` / `tick` are frame-internal reads.
 *
 * ### Why a string-keyed map (not WeakMap<FadeIdentity, …>)
 *
 * Ids are value-typed records (`{ address: 'survey', item: 'sdss' }`),
 * not reference identities. Two `{ address: 'survey', item: 'sdss' }`
 * literals constructed in different files must address the SAME
 * controller. A WeakMap keys on reference identity — that would mint
 * a new controller every time a caller built a fresh id literal.
 * A string serialization gives us value equality at the cost of one
 * short string allocation per registry call (negligible).
 *
 * ### Why fail-safe opacityOf=1.0 for unregistered ids
 *
 * Core reads `opacityOf` every frame, and `wireSlots` seeds every
 * identity before the first frame — but a half-finished bootstrap
 * (test fixtures, HMR reload races) can read an id before it is
 * seeded. Returning 0
 * would black-screen the user; returning 1.0 (the steady-state value)
 * draws normally. The visible cost is one frame of unfaded content
 * during bootstrap — far less annoying than a black screen.
 *
 * ### Why fadeTo THROWS on unregistered ids (asymmetric)
 *
 * Core's visibility sync calls `fadeTo` only for identities it seeded,
 * so a fadeTo on an unregistered id is a programmer error worth
 * surfacing. The fail-safe path is the
 * draw-loop read; the explicit-call paths get the strict check.
 *
 * ### The default clock is the last stamped frame time
 *
 * When a caller omits `nowMs`, every method falls back to the time of
 * the most recent `tick(nowMs)` — the frame clock stamped by `runFrame`
 * — NOT `performance.now()`. The alternative (sampling the wall clock
 * here) would make event-driven fade starts (settings dispatches, tour
 * cues) begin at an instant no frame ever observes, and would make the
 * registry non-deterministic under a stepped recorder clock. Quantizing
 * to the last tick costs at most one frame of skew live, and makes every
 * opacity a pure function of stamped time. `performance.now()` must not
 * be sampled anywhere in this module.
 */

import type { FadeController } from '../../@types/animation/FadeController';
import type { FadeIdentity } from '../../@types/animation/FadeIdentity';
import type { FadeRegistry } from '../../@types/animation/FadeRegistry';
import { fadeIdentityKey } from '../../utils/visibility/fadeIdentityKey';
import { createFadeController } from './fadeController';

export function createFadeRegistry(deps: { readonly requestRender: () => void }): FadeRegistry {
  const controllers = new Map<string, FadeController>();

  // The registry's default clock: the frame time of the most recent tick.
  // Starts at 0 (pre-first-frame, any duration has trivially elapsed) and
  // advances only via tick — see the module-header rationale.
  let lastTickNowMs = 0;

  function register(id: FadeIdentity, initialOpacity: number = 0): void {
    const key = fadeIdentityKey(id);
    if (controllers.has(key)) return; // idempotent
    // Explicit construction time 0 (not the controller's wall-clock default):
    // the stamp is inert — a fresh controller has no transition, and the first
    // fadeTo overwrites it — but it keeps this module wall-clock-free.
    controllers.set(key, createFadeController(initialOpacity, 0));
  }

  function unregister(id: FadeIdentity): void {
    controllers.delete(fadeIdentityKey(id));
  }

  function requireController(id: FadeIdentity): FadeController {
    const c = controllers.get(fadeIdentityKey(id));
    if (!c) {
      throw new Error(`FadeRegistry: id not registered: ${fadeIdentityKey(id)}`);
    }
    return c;
  }

  function fadeTo(
    id: FadeIdentity,
    target: number,
    durationMs: number,
    nowMs?: number,
  ): Promise<void> {
    const promise = requireController(id).fadeTo(target, durationMs, nowMs ?? lastTickNowMs);
    deps.requestRender();
    return promise;
  }

  function setImmediate(id: FadeIdentity, value: number): void {
    requireController(id).setImmediate(value);
  }

  function targetOf(id: FadeIdentity): number | null {
    return controllers.get(fadeIdentityKey(id))?.targetOf() ?? null;
  }

  function opacityOf(id: FadeIdentity, nowMs?: number): number {
    const c = controllers.get(fadeIdentityKey(id));
    if (!c) return 1.0; // fail-safe — see module docblock
    // Resolve the default HERE so the controller's own wall-clock default
    // is never reached through the registry.
    return c.currentOpacity(nowMs ?? lastTickNowMs);
  }

  function isAnyAnimating(nowMs?: number): boolean {
    const now = nowMs ?? lastTickNowMs;
    for (const c of controllers.values()) {
      if (c.isAnimating(now)) return true;
    }
    return false;
  }

  function tick(nowMs?: number): void {
    // An argless tick is a no-op time-wise: it re-reads the last stamped
    // frame time rather than advancing (or resetting) the clock.
    const now = nowMs ?? lastTickNowMs;
    lastTickNowMs = now;
    for (const c of controllers.values()) c.tick(now);
  }

  function destroy(): void {
    controllers.clear();
  }

  return {
    label: 'fadeRegistry',
    register,
    unregister,
    fadeTo,
    setImmediate,
    targetOf,
    opacityOf,
    isAnyAnimating,
    tick,
    destroy,
  };
}
