/**
 * reevaluateDemand — the guarded demand-evaluation loop.
 *
 * Builds a `DemandCtx` once, then walks every `AssetWiringRow`: for each row
 * whose `demand(ctx)` predicate is true AND whose slot is still `idle`, it
 * ENQUEUES a load onto the engine's bounded asset queue
 * (`state.subsystems.assetQueue`) with the tier-derived request. This is the
 * single place that turns the declarative wiring registry into actual fetch
 * work — the same loop runs at boot and on every state change (tier swap,
 * source toggle, settings flip), which keeps load policy in one re-runnable
 * function rather than scattered across dozens of handle setters.
 *
 * ### Why an enqueue rather than a direct `slot.load()`
 *
 * A cold boot demands roughly a hundred megabytes across a dozen rows. Firing
 * every `load()` at once splits one HTTP/2 connection every way at once, so
 * array order becomes trigger order and completion order is whatever the
 * network decides. The queue bounds concurrency (`ASSET_QUEUE_CONCURRENCY`) and
 * orders the rest by each row's authored `priority`, so the assets the boot
 * view actually draws land first. The queue's own dedup semantics (in-flight
 * key ⇒ no-op, pending key ⇒ replaced) make this loop's per-frame re-run safe
 * with no extra bookkeeping here.
 *
 * ### Why there are FOUR edges, not two
 *
 * Enqueueing splits the old load edge in half. A row that is demanded enqueues;
 * a row that is NOT demanded has to DROP whatever it left pending, and that
 * cannot ride the evict edge below. A queued-but-unstarted slot is still
 * `idle`, so `release()` is never called for it and the `ready`-gated evict
 * branch cannot see it at all. Without the drop, a body texture queued as the
 * camera approached would still fetch minutes after the camera left. A genuine
 * `release()` on a `ready` slot reaches this same drop on the next pass, since
 * releasing returns the slot to `idle` with demand false — one drop site, two
 * ways of arriving at it.
 *
 * The fourth edge covers a slot that is past `idle` but loaded with a request
 * the row no longer asks for — a tier swap, a resolution ceiling change. It
 * reloads, it never releases: `release()` is distance eviction only, so the
 * resident payload keeps drawing until the new one commits. The call is direct
 * rather than queued because the queue refuses a key it already has in flight
 * (`PriorityQueue.admit`), which is exactly the case this edge exists for.
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
 * unconditionally would abort + re-fetch + re-upload already-`ready` galaxy catalogs —
 * a single checkbox flip into a multi-hundred-MB re-download storm. Guarding on
 * `slot.state().kind === 'idle'` here, rather than trusting load() to be a
 * no-op, prevents that without weakening the re-fetch primitive. A legitimate
 * request-changing reload is not blocked by it: that is the drift edge, gated
 * on the slot being non-idle rather than idle.
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
 * The guard also covers a sync throw from `slot.release()`, and from the
 * `req(tier)` + `slot.load()` the drift edge runs directly. The enqueued
 * closure's copies of those two throw inside the queue instead, which turns the
 * rejection into an `onResult(null)` and keeps scheduling. Either way such a bug
 * (real fetch errors flow to the slot's `error` state, not a sync throw) costs
 * one asset rather than a dead load loop.
 *
 * `evaluateRows` is factored out of `reevaluateDemand` so tests can drive the
 * loop with a stub row array — the public entry point reads the real
 * `ASSET_WIRING`, but the loop logic is exercised without the full registry.
 */

import { buildDemandCtx } from './buildDemandCtx';
import { slotFor } from './slotFor';
import { ASSET_WIRING } from './assetWiring';
import { requestDrifted } from './requestDrifted';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { QueueEntry } from '../../../@types/loading/QueueEntry';

/**
 * Evaluate a specific set of rows against `state`. The public
 * `reevaluateDemand` calls this with the real `ASSET_WIRING`; tests call it
 * with a stub array to exercise the guarded loop in isolation.
 */
export function evaluateRows(state: EngineState, rows: readonly AssetWiringRow[]): void {
  const ctx = buildDemandCtx(state);
  const queue = state.subsystems.assetQueue;
  // Collected across the whole walk and submitted in ONE call at the end.
  // Enqueueing inside the loop would start the first `ASSET_QUEUE_CONCURRENCY`
  // demanded rows the instant they were walked — in `ASSET_WIRING` array order,
  // before a better-ranked row further down the table had even been evaluated —
  // leaving `priority` to govern only the slots that free later. See
  // `PriorityQueue.enqueueMany`.
  const batch: QueueEntry<void>[] = [];
  for (const row of rows) {
    try {
      const slot = slotFor(state, row.key);
      if (!slot) continue;
      const kind = slot.state().kind;
      // The queue dedups by string key. `AssetKey` is a union of numeric
      // `Source` codes and string keys, and no string `AssetKey` is a bare
      // numeral, so stringifying cannot collide the two spaces.
      const queueKey = String(row.key);
      // ── Enqueue edge ─────────────────────────────────────────────────────
      // Queue only an idle slot whose demand is true. A loading/ready/error
      // slot is left alone — see the module docstring on why the idle-guard
      // lives here rather than inside load() (which stays a re-fetch
      // primitive).
      if (kind === 'idle' && row.demand(ctx)) {
        batch.push({
          key: queueKey,
          // NEGATED on purpose. `popHighestPriority` pops the LARGEST
          // `priority` because the queue's other caller ranks galaxy
          // thumbnails by on-screen pixel size, where bigger-first is the
          // natural reading. The wiring rank table reads the other way round
          // (lower is fetched first), so the flip belongs here, at the one
          // site whose table disagrees, rather than inside a queue that would
          // then be wrong for thumbnails.
          priority: -row.priority,
          fetcher: async () => {
            // The SAME idle predicate the enqueue decision used, evaluated at
            // the other moment that matters: the queue puts a gap between
            // decision and action, and during that gap a direct `.load()` (a
            // tier transition, a companion load) may have claimed the slot.
            // One predicate at two moments, not two copies of a policy.
            if (slot.state().kind !== 'idle') return;
            // `state` is live, so building the request HERE yields the request
            // for the tier in force when the fetch actually runs, not the one
            // current when it was queued.
            await slot.load(row.req(state.tier));
          },
          onResult: () => {},
        });
      }
      // ── Drop edge ────────────────────────────────────────────────────────
      // An idle slot whose demand went false may still be sitting in the
      // queue, unstarted. Nothing else can retract it: `release()` only ever
      // runs on a `ready` slot (see below), and a pending entry's slot is
      // idle. See the module docstring for why this is its own edge.
      else if (kind === 'idle') {
        queue.drop(queueKey);
      }
      // ── Evict edge ───────────────────────────────────────────────────────
      // Distance eviction, and only that: the optional `release` predicate
      // (omitted ⇒ never evict, so every load-once row is untouched), separate
      // from `demand` to encode hysteresis — load inside X, evict outside 2X
      // (see AssetWiringRow). It drops the slot to idle, which hands it to the
      // drop edge above on the next pass.
      else if (kind === 'ready' && row.release?.(ctx)) {
        slot.release();
      }
      // ── Drift edge ───────────────────────────────────────────────────────
      // A non-idle slot loaded with a request the row no longer asks for
      // reloads in place. Ordered after the evict edge so a row with both
      // reasons evicts rather than re-fetching at a distance it is leaving.
      // Called directly, not queued — see the module docstring.
      else if (row.demand(ctx) && requestDrifted(slot, row, state.tier)) {
        void slot.load(row.req(state.tier));
      }
    } catch (err) {
      // Contain the failure to this row so later rows still evaluate: a bad
      // predicate, release or drift reload costs one asset, not the whole table.
      console.warn(`reevaluateDemand: row '${String(row.key)}' threw during evaluation`, err);
    }
  }
  // Outside the per-row guard on purpose: everything policy-shaped (the demand
  // predicate, slot lookup, release) ran inside it, and all that is left here is
  // a map insert per entry plus the queue's own scheduling — a throw from that
  // is an engine bug worth surfacing, not one row's failure to contain.
  queue.enqueueMany(batch);
}

/** Re-evaluate the full asset-wiring registry against the current state. */
export function reevaluateDemand(state: EngineState): void {
  evaluateRows(state, ASSET_WIRING);
}
