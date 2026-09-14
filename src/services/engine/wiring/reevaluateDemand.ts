/**
 * reevaluateDemand — the guarded demand-evaluation loop, run once per frame
 * (`runFrame.ts`). Walks every `AssetWiringRow` and applies four edges:
 * enqueue, drop, evict, drift. The drift edge RELOADS in place; `release()` is
 * distance eviction only, so the resident payload keeps drawing until the new
 * one commits.
 *
 * Rationale (four edges, queue, idle-guard):
 * `docs/superpowers/specs/2026-09-09-layer-composition-design.md` §9(d) "Demand-loop rationale".
 */

import { buildDemandCtx } from './buildDemandCtx';
import { slotFor } from './slotFor';
import { ASSET_WIRING } from './assetWiring';
import { sameRequest } from '../../../utils/loading/sameRequest';

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
      const lastRequest = slot.lastRequest();
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
            // decision and action, and during that gap the drift edge's direct
            // `.load()` may have claimed the slot. One predicate at two
            // moments, not two copies of a policy.
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
      // runs on a slot holding a committed value (see below), and a pending
      // entry's slot is idle. See the module docstring for why this is its
      // own edge.
      else if (kind === 'idle') {
        queue.drop(queueKey);
      }
      // ── Evict edge ───────────────────────────────────────────────────────
      // The optional `release` predicate (omitted ⇒ never evict, so every
      // load-once row is untouched) is separate from `demand` to encode
      // hysteresis — load inside X, evict outside 2X (see AssetWiringRow). It
      // drops the slot to idle, which hands it to the drop edge above on the
      // next pass.
      else if (
        (kind === 'ready' || kind === 'error') &&
        slot.committed() !== null &&
        row.release?.(ctx)
      ) {
        slot.release();
      }
      // ── Drift edge ───────────────────────────────────────────────────────
      // A non-idle slot loaded with a request the row no longer asks for
      // reloads in place. Ordered after the evict edge so a row with both
      // reasons evicts rather than re-fetching at a distance it is leaving.
      // Called directly, not queued — see the module docstring.
      // A null `lastRequest()` is never drift: a slot that has never loaded has
      // nothing to have drifted from. Tested before `req(tier)`, which
      // allocates on every row of every frame.
      else if (
        row.demand(ctx) &&
        lastRequest !== null &&
        !sameRequest(lastRequest, row.req(state.tier))
      ) {
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
