/**
 * reevaluateDemand — the guarded demand-evaluation loop.
 *
 * Builds a `DemandCtx` once, then walks every `AssetWiringRow`: for each row
 * whose `demand(ctx)` predicate is true AND whose slot is still `idle`, it
 * triggers the slot with the tier-derived request. This is the single place
 * that turns the declarative wiring registry into actual `slot.load()` calls —
 * the same loop runs at boot and on every state change (tier swap, source
 * toggle, settings flip), which keeps load policy in one re-runnable function
 * rather than scattered across dozens of handle setters.
 *
 * ### Why the idle-guard lives in the loop, not in slot.load()
 *
 * `slot.load()` is deliberately a re-fetch primitive: `forceReload()` and
 * `setTier()` both call it expecting a fresh fetch (the latter with a new-tier
 * request). A request-equality short-circuit inside `load()` would break those.
 * So `load()` is non-idempotent — it always aborts any in-flight load and
 * re-fetches.
 *
 * This loop's semantic is narrower: "start loading what should be loading but
 * isn't." That is exactly an idle-check. Because the loop re-runs on every
 * toggle/visibility/settings change, calling `load()` on every demanded row
 * unconditionally would abort + re-fetch + re-upload already-`ready` surveys —
 * a single checkbox flip into a multi-hundred-MB re-download storm. Guarding on
 * `slot.state().kind === 'idle'` here, rather than trusting load() to be a
 * no-op, prevents that without weakening the re-fetch primitive. Tier changes
 * (request-changing reloads) flow through `setTier`'s own `load()` path, not
 * this loop, so the idle-guard never blocks a legitimate tier reload.
 *
 * ### Why each row is guarded
 *
 * A demand predicate is policy that reads settings, slot states, and request
 * flags — a buggy one can throw. Without a per-row guard, one bad predicate
 * would abort the loop and silently starve every row after it of its load
 * trigger (a tier swap that loads SDSS but not GLADE, say). Catching + warning
 * per row contains the blast radius to the offending asset; the rest of the
 * table still evaluates.
 *
 * The guard also covers a sync throw from `req(tier)` or `slot.load()`. Those
 * would be slot-construction bugs (real fetch errors flow to the slot's `error`
 * state, not a sync throw), so containing rather than aborting is deliberate —
 * such a bug surfaces as a per-row warn rather than a dead load loop.
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
      // Load only an idle slot whose demand is true. A loading/ready/error
      // slot is left alone — see the module docstring on why the idle-guard
      // lives here rather than inside load() (which stays a re-fetch primitive).
      const slot = slotFor(state, row.key);
      if (slot && row.demand(ctx) && slot.state().kind === 'idle') {
        slot.load(row.req(state.sources.tier));
      }
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
