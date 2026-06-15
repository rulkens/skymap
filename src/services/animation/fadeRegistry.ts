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
 * Ids are value-typed records (`{ kind: 'survey', source: 1 }`),
 * not reference identities. Two `{ kind: 'survey', source: SDSS }`
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
 */

import type { FadeController } from '../../@types/animation/FadeController';
import type { FadeId } from '../../@types/animation/FadeId';
import type { FadeRegistry } from '../../@types/animation/FadeRegistry';
import { createFadeController, FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from './fadeController';

function serializeFadeId(h: FadeId): string {
  switch (h.kind) {
    case 'survey':
      return `survey:${h.source}`;
    case 'filaments':
      return 'filaments';
    case 'flow':
      return 'flow';
    case 'scalarField':
      return `scalarField:${h.field}`;
    case 'markerLayer':
      return `markerLayer:${h.category}`;
    // A category-less structure handle and a per-category one must not collide,
    // and existing keys (e.g. `labelLayer:youAreHere`) must stay
    // byte-identical — so the category suffix is appended only when present.
    case 'labelLayer':
      return `labelLayer:${h.layer}${h.category ? ':' + h.category : ''}`;
    case 'overlay':
      return `overlay:${h.id}`;
    case 'volumesMaster':
      return 'volumesMaster';
  }
}

export function createFadeRegistry(deps: { readonly requestRender: () => void }): FadeRegistry {
  const controllers = new Map<string, FadeController>();

  function register(id: FadeId, initialOpacity: number = 0): void {
    const key = serializeFadeId(id);
    if (controllers.has(key)) return; // idempotent
    controllers.set(key, createFadeController(initialOpacity));
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
    const now = nowMs ?? performance.now();
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
    return c.currentOpacity(nowMs);
  }

  function isAnyAnimating(nowMs?: number): boolean {
    for (const c of controllers.values()) {
      if (c.isAnimating(nowMs)) return true;
    }
    return false;
  }

  function tick(nowMs?: number): void {
    const now = nowMs ?? 0;
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
