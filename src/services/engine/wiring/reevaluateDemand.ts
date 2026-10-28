/**
 * reevaluateDemand — the guarded demand-evaluation loop, run once per frame
 * (`runFrame.ts`). Walks every `AssetWiringRow` and applies four edges:
 * enqueue, drop, evict, drift. The drift edge RELOADS in place; `release()` is
 * eviction only (distance or tier), so the resident payload keeps drawing until the new
 * one commits.
 *
 * Rationale (four edges, queue, idle-guard):
 * `docs/superpowers/specs/2026-09-09-layer-composition-design.md` §9(d) "Demand-loop rationale".
 */

import { buildDemandCtx } from './buildDemandCtx';
import { sameRequest } from '../../../utils/loading/sameRequest';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { QueueEntry } from '../../../@types/loading/QueueEntry';

/** Evaluate `rows` against `state`; tests pass a stub array to exercise the guarded loop. */
export function evaluateRows(state: EngineState, rows: readonly AssetWiringRow[]): void {
  const ctx = buildDemandCtx(state);
  const queue = state.subsystems.assetQueue;
  // Submitted in ONE call at the end: enqueueing inside the loop would start the first
  // `ASSET_QUEUE_CONCURRENCY` demanded rows in array order, before a better-ranked row
  // further down was evaluated (`PriorityQueue.enqueueMany`).
  const batch: QueueEntry<void>[] = [];
  for (const row of rows) {
    try {
      const { slot } = row;
      const kind = slot.state().kind;
      const lastRequest = slot.lastRequest();
      // The queue dedups by string key; no string `AssetKey` is a bare numeral, so
      // stringifying cannot collide it with a numeric `Source` code.
      const queueKey = String(row.key);
      // Enqueue edge: only an idle slot with demand; load() stays a re-fetch primitive.
      if (kind === 'idle' && row.demand(ctx)) {
        batch.push({
          key: queueKey,
          // NEGATED: `popHighestPriority` pops the LARGEST (thumbnails rank by pixel
          // size), but the wiring table fetches lower first; flip at this one site.
          priority: -row.priority,
          fetcher: async () => {
            // Re-check at fetch time: in the queue gap the drift edge's `.load()` may
            // have claimed the slot, or a tier swap excluded a source with no file.
            if (slot.state().kind !== 'idle' || !row.demand(buildDemandCtx(state))) return;
            // Built HERE so it carries the tier in force when the fetch runs, not when queued.
            await slot.load(row.req(state.tier));
          },
          onResult: () => {},
        });
      }
      // Drop edge: an idle slot whose demand went false may still sit unstarted in the
      // queue, and `release()` only runs on a committed slot, so nothing else retracts it.
      else if (kind === 'idle') {
        queue.drop(queueKey);
      }
      // Evict edge: `release` is separate from `demand` to encode hysteresis (load
      // inside X, evict outside 2X); omitted ⇒ never evict. Idle slots go to the drop edge.
      else if (
        (kind === 'ready' || kind === 'error') &&
        slot.committed() !== null &&
        row.release?.(ctx)
      ) {
        slot.release();
      }
      // Drift edge: reload in place, directly, not queued. After evict so a row with
      // both reasons evicts. Null `lastRequest()` is never drift, and is tested before
      // `req(tier)`, which allocates on every row of every frame.
      else if (
        row.demand(ctx) &&
        lastRequest !== null &&
        !sameRequest(lastRequest, row.req(state.tier))
      ) {
        void slot.load(row.req(state.tier));
      }
    } catch (err) {
      // A bad predicate costs one asset, not the whole table.
      console.warn(`reevaluateDemand: row '${String(row.key)}' threw during evaluation`, err);
    }
  }
  // Outside the per-row guard: a throw from queue scheduling is an engine bug to surface.
  queue.enqueueMany(batch);
}

/** Re-evaluate the composed asset rows against the current state. */
export function reevaluateDemand(state: EngineState): void {
  evaluateRows(state, state.assetRows);
}
