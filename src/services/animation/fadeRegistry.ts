/**
 * fadeRegistry — engine subsystem at `state.subsystems.fades`.
 *
 * Owns a `Map<string, FadeController>` keyed by a stable serialization
 * of every registered FadeId. Renderers and slot commit steps drive
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
 * ### Why a string-keyed map (not WeakMap<FadeId, …>)
 *
 * Ids are value-typed records (`{ kind: 'galaxyCatalog', id: 'sdss' }`),
 * not reference identities. Two `{ kind: 'galaxyCatalog', id: 'sdss' }`
 * literals constructed in different files must address the SAME
 * controller. A WeakMap keys on reference identity — that would mint
 * a new controller every time a caller built a fresh id literal.
 * A string serialization gives us value equality at the cost of one
 * short string allocation per registry call (negligible).
 *
 * ### Why fail-safe opacityOf=1.0 for unregistered ids
 *
 * Renderers call `opacityOf` from their per-frame draw. The registry
 * is constructed BEFORE renderers, and renderers register their
 * ids at construction — but bootstrap order is subtle, and a
 * half-finished bootstrap (test fixtures, HMR reload races) can leave
 * a renderer drawing before its id is registered. Returning 0
 * would black-screen the user; returning 1.0 (the steady-state value)
 * draws normally. The visible cost is one frame of unfaded content
 * during bootstrap — far less annoying than a black screen.
 *
 * ### Why fadeTo THROWS on unregistered ids (asymmetric)
 *
 * Slots and UI handlers reach for `fadeTo` only when they expect a
 * specific layer to exist. A fadeTo on an unregistered id means
 * "the slot is trying to orchestrate a layer that was never set up" —
 * a programmer error worth surfacing. The fail-safe path is the
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
import type { FadeId } from '../../@types/animation/FadeId';
import type { FadeRegistry } from '../../@types/animation/FadeRegistry';
import { createFadeController, FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from './fadeController';

function serializeFadeId(h: FadeId): string {
  switch (h.kind) {
    case 'galaxyCatalog':
      return `galaxyCatalog:${h.id}`;
    case 'structure':
      return `structure:${h.id}`;
    case 'volumeField':
      return `volumeField:${h.id}`;
    case 'milkyWay':
      return 'milkyWay';
    case 'filament':
      return 'filament';
    case 'flow':
      return 'flow';
    case 'constellations':
      return 'constellations';
    case 'orbitTrails':
      return 'orbitTrails';
    case 'zoneOfAvoidance':
      return 'zoneOfAvoidance';
    // An item-less layer handle and a per-item one must not collide, and an
    // item-less key (e.g. `labelLayer:milkyWay`) must stay distinct from a
    // per-item one — so the item suffix is appended only when present.
    case 'labelLayer':
      return `labelLayer:${h.layer}${h.item ? ':' + h.item : ''}`;
    case 'overlay':
      return `overlay:${h.id}`;
    case 'volumesMaster':
      return 'volumesMaster';
  }
}

export function createFadeRegistry(deps: { readonly requestRender: () => void }): FadeRegistry {
  const controllers = new Map<string, FadeController>();

  // The registry's default clock: the frame time of the most recent tick.
  // Starts at 0 (pre-first-frame, any duration has trivially elapsed) and
  // advances only via tick — see the module-header rationale.
  let lastTickNowMs = 0;

  function register(id: FadeId, initialOpacity: number = 0): void {
    const key = serializeFadeId(id);
    if (controllers.has(key)) return; // idempotent
    // Explicit construction time 0 (not the controller's wall-clock default):
    // the stamp is inert — a fresh controller has no transition, and the first
    // fadeTo overwrites it — but it keeps this module wall-clock-free.
    controllers.set(key, createFadeController(initialOpacity, 0));
  }

  function unregister(id: FadeId): void {
    controllers.delete(serializeFadeId(id));
  }

  function requireController(id: FadeId): FadeController {
    const c = controllers.get(serializeFadeId(id));
    if (!c) {
      throw new Error(`FadeRegistry: id not registered: ${serializeFadeId(id)}`);
    }
    return c;
  }

  function fadeTo(id: FadeId, target: number, durationMs?: number, nowMs?: number): Promise<void> {
    const c = requireController(id);
    const now = nowMs ?? lastTickNowMs;
    const dur =
      durationMs ?? (target > c.currentOpacity(now) ? FADE_IN_DURATION_MS : FADE_OUT_DURATION_MS);
    const promise = c.fadeTo(target, dur, now);
    deps.requestRender();
    return promise;
  }

  function setImmediate(id: FadeId, value: number): void {
    requireController(id).setImmediate(value);
  }

  function opacityOf(id: FadeId, nowMs?: number): number {
    const c = controllers.get(serializeFadeId(id));
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
    opacityOf,
    isAnyAnimating,
    tick,
    destroy,
  };
}
