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
 * ### Why there are THREE edges, not two
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
 * The guard also covers a sync throw from `slot.release()`. A throw out of
 * `req(tier)` or `slot.load()` no longer lands here, because both now run
 * inside the enqueued closure: the queue turns that rejection into an
 * `onResult(null)` and keeps scheduling. Either way such a bug (real fetch
 * errors flow to the slot's `error` state, not a sync throw) costs one asset
 * rather than a dead load loop.
 *
 * `evaluateRows` is factored out of `reevaluateDemand` so tests can drive the
 * loop with a stub row array — the public entry point reads the real
 * `ASSET_WIRING`, but the loop logic is exercised without the full registry.
 */

import { buildDemandCtx } from './buildDemandCtx';
import { slotFor } from './slotFor';
import { ASSET_WIRING } from './assetWiring';
import { isBodyTextureKey } from '../../../utils/scene/isBodyTextureKey';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { AssetWiringRow } from '../../../@types/loading/AssetWiringRow';
import type { AssetSlot } from '../../../@types/loading/AssetSlot';
import type { Tier } from '../../../@types/data/Tier';
import type { BodyTextureReq } from '../../../@types/loading/BodyTextureReq';
import type { QueueEntry } from '../../../@types/loading/QueueEntry';

/**
 * Stale-tier evict test for the `bodyTextures` family: a `ready` slot whose
 * last-committed request tier no longer matches the freshly-clamped
 * `req(state.tier)` tier is holding the wrong-resolution texture and must be
 * re-fetched at the new tier. This lives in the loop (not in a `release(ctx)`
 * predicate) because a ctx predicate cannot see the slot's committed request,
 * and only here are `slotFor` + `state.tier` both in hand. It resolves to the
 * SAME `slot.release()` → idle → re-demand machinery as the distance edge — one
 * release concept with two reasons, not a second mechanism (spec §5.4).
 */
function staleTierEvict(
  slot: AssetSlot<unknown, unknown>,
  row: AssetWiringRow,
  tier: Tier,
): boolean {
  if (!isBodyTextureKey(row.key)) return false;
  const committed = (slot.lastRequest() as BodyTextureReq | null)?.tier;
  if (committed === undefined) return false;
  return committed !== (row.req(tier) as BodyTextureReq).tier;
}

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
      // Release a ready slot for either reason a resident asset should be
      // dropped, unified into one `release()` call: (1) the distance edge — the
      // optional `release` predicate (omitted ⇒ never evict, so every load-once
      // row is untouched), separate from `demand` to encode hysteresis (load
      // inside X, evict outside 2X — see AssetWiringRow); or (2) a stale
      // committed tier for the bodyTextures family (spec §5.4). Both drop the
      // slot to idle, which hands it back to one of the two idle edges above —
      // re-enqueued at the new tier for the stale case, dropped from the queue
      // for the distance case. The three edges partition the slot states
      // (idle-and-demanded, idle, ready), so the else-if chain is exact.
      else if (kind === 'ready' && (staleTierEvict(slot, row, state.tier) || row.release?.(ctx))) {
        slot.release();
      }
    } catch (err) {
      // Contain the failure to this row so later rows still evaluate — the same
      // per-row guard the load edge has always had, now covering release too.
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
