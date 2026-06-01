/**
 * reevaluateDemand — the guarded demand-evaluation loop.
 *
 * Builds a `DemandCtx` once, then walks every `AssetWiringRow`: for each row
 * whose `demand(ctx)` predicate is true, it triggers the row's slot with the
 * tier-derived request. This is the single place that turns the declarative
 * wiring registry into actual `slot.load()` calls — the same loop runs at boot
 * and on every state change (tier swap, source toggle, settings flip), which
 * keeps load policy in one re-runnable function rather than scattered across
 * dozens of handle setters.
 *
 * ### Why idempotency comes from the slot, not from here
 *
 * `reevaluateDemand` may run many times per second. It does NOT track which
 * rows it already loaded — `slot.load()` is itself a no-op when the slot is
 * already loading or ready (it only acts on an `idle` or differing request).
 * Adding a dedup layer here would duplicate that contract and risk drifting
 * from it; leaning on the slot keeps a single source of truth for "should this
 * fetch actually start."
 *
 * ### Why each row is guarded (ADR 0005 §"Error handling")
 *
 * A demand predicate is user-authored policy that reads settings, slot states,
 * and request flags — a buggy one can throw. Without a per-row guard, one bad
 * predicate would abort the loop and silently starve every row after it of its
 * load trigger (a tier swap that loads SDSS but not GLADE, say). Catching +
 * warning per row contains the blast radius to the offending asset; the rest
 * of the table still evaluates.
 *
 * `evaluateRows` is factored out of `reevaluateDemand` so tests can drive the
 * loop with a stub row array — the public entry point reads the real
 * `ASSET_WIRING`, but the loop logic is exercised without the full registry.
 */

import { buildDemandCtx } from './demandCtx';
import { slotFor } from './slotFor';
import { ASSET_WIRING } from './assetWiring';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';

/**
 * Evaluate a specific set of rows against `state`. The public
 * `reevaluateDemand` calls this with the real `ASSET_WIRING`; tests call it
 * with a stub array to exercise the guarded loop in isolation.
 */
export function evaluateRows(state: EngineState, rows: readonly AssetWiringRow[]): void {
  const ctx = buildDemandCtx(state);
  for (const row of rows) {
    try {
      if (!row.demand(ctx)) continue;
      // `slot.load` is idempotent — see the module docstring.
      slotFor(state, row.key)?.load(row.req(state.sources.tier));
    } catch (err) {
      // Contain the failure to this row so later rows still evaluate.
      console.warn(`reevaluateDemand: row '${String(row.key)}' threw during evaluation`, err);
    }
  }
}

/** Re-evaluate the full asset-wiring registry against the current state. */
export function reevaluateDemand(state: EngineState): void {
  evaluateRows(state, ASSET_WIRING);
}
