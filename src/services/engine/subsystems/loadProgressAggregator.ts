/**
 * loadProgressAggregator — thin subscriber wrapper around the loading
 * registry's `aggregateRegistry` pure projection.
 *
 * ### Why this module collapsed to a few lines
 *
 * The original implementation kept its own per-source byte map and
 * emitted snapshots from inside `start`/`update`/`finish` mutators —
 * three methods, each idempotent, each duplicated state already living
 * inside the per-source AssetSlot.  Two copies of the same truth meant
 * two opportunities to drift (a delayed late event after `finish`, a
 * `total` revised mid-stream, a slot transitioning to `error` without a
 * matching `finish`).
 *
 * The asset-loading rework gave every load a slot whose `state()`
 * already encodes "loading | committing | ready | error" with the byte
 * counts attached.  `aggregateRegistry` projects that across the slot
 * map into the same `(loadedBytes, totalBytes, inFlightCount)` shape
 * the loading-bar UI consumes.  So the aggregator's job collapses to
 * "subscribe to every slot, recompute the projection on every state
 * change, forward the snapshot via the engine's onLoadProgress
 * callback".
 *
 * ### Why a tiny emitter facade rather than calling the projection inline
 *
 * The engine already has the slot map in scope — it could `for-each
 * subscribe` directly and feed `aggregateRegistry` to `cb.onLoadProgress`.
 * The facade wins three things:
 *
 *   1. The "null when empty" convention (loading bar fades out) is
 *      encoded in one place, not duplicated at every subscribe site.
 *   2. The `attachSlot` helper is symmetric with the slot bag's
 *      population — engine code adds the slot to the registry, then
 *      hands it to the emitter; can't accidentally subscribe a slot
 *      that isn't in the registry.
 *   3. Tests can construct the emitter against a fake slot map without
 *      touching the engine's GPU init path.
 *
 * ### Why null when empty
 *
 * "No fetches in flight" is a meaningful UI state — the loading bar fades
 * out.  Encoding that as `null` rather than `{ loaded: 0, total: 0,
 * inFlightCount: 0 }` keeps the consumer's null-check trivial and avoids
 * the awkward "is `0/0` a finished state or a pre-start state?" ambiguity.
 */

import { aggregateRegistry } from '../../loading/aggregateRegistry';
import type { AssetSlot } from '../../loading/types';
import type { Destroyable } from '../../../@types';
import type { LoadProgressState } from '../../../@types/EngineCallbacks';

/**
 * Public surface of the emitter.  `emit()` is exported so the engine
 * (or future ad-hoc callers) can force a recompute outside a slot
 * transition; `attachSlot` wires a slot's subscriber to call `emit`
 * on every state change.
 */
export type LoadProgressEmitter = {
  emit(): void;
  attachSlot(slot: AssetSlot<unknown, unknown>): void;
  /**
   * Release every subscriber attached via `attachSlot`.  Currently a
   * placeholder no-op so the emitter satisfies the shared
   * `Destroyable` shape every subsystem exposes — the real
   * implementation, which captures each `slot.subscribe()`
   * unsubscriber and calls them all here, lands in the next commit
   * (Task 3 of this branch's plan).  Without the real implementation,
   * subscriptions outlive `engine.destroy()` and any post-teardown
   * slot transition still fires `publish` — that's the audit-#15
   * leak this method is being added to plug.
   */
  destroy(): void;
};

/**
 * Build an emitter bound to a callback and a slot registry.
 *
 * The slot map MUST be the same reference the engine populates for
 * `aggregateRegistry` — both consume `slot.state()` from the same set
 * so the projection stays consistent with what the dev panel sees.
 *
 * Closure-over-Map rather than a class because the surface is two
 * methods and there's no inheritance.  A factory function reads as
 * data rather than as machinery, matching the rest of the loading
 * subsystem's style.
 */
export function createLoadProgressEmitter(
  emit: (state: LoadProgressState | null) => void,
  slots: ReadonlyMap<string, AssetSlot<unknown, unknown>>,
): LoadProgressEmitter {
  function publish(): void {
    const snap = aggregateRegistry(slots);
    if (snap.inFlightCount === 0) {
      emit(null);
    } else {
      emit({
        loadedBytes: snap.totalLoadedBytes,
        totalBytes: snap.totalExpectedBytes,
        inFlightCount: snap.inFlightCount,
      });
    }
  }
  // Built as a `const` (rather than returned inline) so we can attach
  // the `satisfies Destroyable` latch — the emitter is one of the
  // engine's ~13 teardown targets, and the shared shape lets
  // engine.destroy() iterate uniformly across the bag.
  const emitter: LoadProgressEmitter = {
    emit: publish,
    attachSlot(slot) {
      slot.subscribe(publish);
    },
    destroy(): void {
      // Placeholder — real teardown lands in Task 3.  See the
      // type-level docstring for why.
    },
  };
  emitter satisfies Destroyable;
  return emitter;
}
