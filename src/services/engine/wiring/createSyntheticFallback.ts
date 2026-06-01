/**
 * createSyntheticFallback — the synthetic-survey fallback gate.
 *
 * The synthetic point cloud is the "no real data, show *something*" backstop:
 * it must load only when every real survey has been tried and none produced
 * usable data.
 *
 * ### Why this is imperative, not a pure demand predicate
 *
 * The obvious shape would be a `DemandCtx` predicate ("every real survey's
 * `slotState === 'error'`"). That cannot preserve the real policy, because
 * `DemandCtx` cannot see two things this gate depends on:
 *
 *   - **count.** A survey that resolves `ready` with zero galaxies is NOT a
 *     success — the user still has nothing to look at, so the fallback must
 *     fire. `DemandCtx.slotState` exposes only the `LoadStateKind`
 *     discriminant, not the loaded `count`, so it can't tell an empty-but-ready
 *     survey from a populated one. This gate watches each slot's `ready` value
 *     and only treats `count > 0` as success.
 *   - **the running total.** The per-arrival status emission reports
 *     `state.gpu.renderer.totalCount()`, which the ctx layer also can't reach.
 *
 * So the precise gate runs here, at the slot-subscription level where the
 * count is visible. When it concludes the fallback is warranted it ARMS the
 * synthetic load by setting the `'syntheticFallback'` request flag and calling
 * `reevaluateDemand`; the Synthetic row in `ASSET_WIRING` reads that flag.
 * The flag is the seam between this imperative gate and the declarative demand
 * loop — the gate owns the hard policy, the loop owns the actual `slot.load`.
 *
 * ### The survey / curated distinction
 *
 * The gate counts only `survey`-category sources (`SURVEY_POINT_SOURCES`).
 * Curated Famous is excluded: a Famous-only success shouldn't suppress the
 * fallback, and a Famous-only failure shouldn't trigger it. The gate still
 * subscribes to Famous for its per-arrival status emission, but Famous never
 * moves the `realSettled` / `anyRealReady` counters.
 *
 * ### hidden-at-boot surveys
 *
 * A survey hidden at boot won't auto-load, so its slot stays `idle` forever —
 * it never transitions to ready/error. Treat it as already settled so the gate
 * doesn't wait indefinitely. When the user later toggles it on the load fires,
 * but by then the fallback decision is long made.
 */

import { Source } from '../../../data/sources';
import { maskHas } from '../../../utils/sourceMask';
import { SURVEY_POINT_SOURCES, TIER_FETCHED_POINT_SOURCES } from './galaxyCatalogSourceRegistry';
import { reevaluateDemand } from './reevaluateDemand';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';

/**
 * Wire the synthetic-fallback gate. Subscribes to every tier-fetched point
 * source and arms the synthetic backstop (via the `'syntheticFallback'`
 * request flag + `reevaluateDemand`) once every real survey has settled
 * without a successful ready+count>0.
 *
 * Returns `void`: every subscriber self-unsubscribes on its first settle
 * (the once-only `counted`/`unsub` pattern), and the synthetic-slot status
 * subscriber is a long-lived per-arrival echo with no teardown of its own —
 * so there is no handle for a caller to dispose.
 */
export function createSyntheticFallback(state: EngineState, cb: EngineCallbacks): void {
  // Only `survey`-category sources count toward the gate; curated Famous is
  // excluded (see the module docstring).
  const realSet = new Set(SURVEY_POINT_SOURCES);

  let realSettled = 0;
  let anyRealReady = false;

  for (const source of TIER_FETCHED_POINT_SOURCES) {
    const slot = state.assetSlots.points.get(source);
    // Hidden-at-boot (or missing) surveys never transition, so count them as
    // pre-settled rather than waiting on them forever.
    const hiddenAtBoot = !maskHas(state.sources.drawMask, source);
    if (!slot || hiddenAtBoot) {
      if (realSet.has(source)) {
        realSettled++;
        maybeArmSyntheticFallback();
      }
      continue;
    }
    let counted = false;
    const unsub = slot.subscribe((s) => {
      if (s.kind === 'ready' && s.value.count > 0) {
        cb.lifecycle?.onStatusChange?.({
          kind: 'ready',
          count: state.gpu.renderer?.totalCount() ?? 0,
          source,
        });
        if (realSet.has(source)) anyRealReady = true;
      }
      if (counted) return;
      if (s.kind === 'ready' || s.kind === 'error') {
        counted = true;
        unsub();
        if (realSet.has(source)) {
          realSettled++;
          maybeArmSyntheticFallback();
        }
      }
    });
  }

  function maybeArmSyntheticFallback(): void {
    // Not yet: still waiting on a real survey, or at least one produced data.
    if (realSettled < realSet.size || anyRealReady) return;

    // Subscribe to the synthetic slot for its own per-arrival status emission
    // before tripping the demand loop, so the eventual `ready` echoes a count.
    const synthSlot = state.assetSlots.points.get(Source.Synthetic);
    synthSlot?.subscribe((s) => {
      if (s.kind === 'ready' && s.value.count > 0) {
        cb.lifecycle?.onStatusChange?.({
          kind: 'ready',
          count: state.gpu.renderer?.totalCount() ?? 0,
          source: Source.Synthetic,
        });
      }
    });

    // Arm the fallback. `requests.add` is a no-op on repeat and
    // `reevaluateDemand` is idempotent, so a double-trip is harmless — but the
    // gate naturally trips only once, when `realSettled` first reaches size.
    state.requests.add('syntheticFallback');
    reevaluateDemand(state);
  }
}
