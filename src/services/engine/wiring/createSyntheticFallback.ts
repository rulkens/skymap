/**
 * createSyntheticFallback — the synthetic-galaxy catalog fallback gate.
 *
 * The synthetic point cloud is the "no real data, show *something*" backstop:
 * it must load only when every real galaxy catalog has been tried and none produced
 * usable data.
 *
 * ### Why this is imperative, not a pure demand predicate
 *
 * The obvious shape would be a `DemandCtx` predicate ("every real galaxy catalog's
 * `slotState === 'error'`"). That cannot preserve the real policy, because
 * `DemandCtx` cannot see two things this gate depends on:
 *
 *   - **count.** A galaxy catalog that resolves `ready` with zero galaxies is NOT a
 *     success — the user still has nothing to look at, so the fallback must
 *     fire. `DemandCtx.slotState` exposes only the `LoadStateKind`
 *     discriminant, not the loaded `count`, so it can't tell an empty-but-ready
 *     galaxy catalog from a populated one. This gate watches each slot's `ready` value
 *     and only treats `count > 0` as success.
 *   - **the running total.** The per-arrival status emission reports
 *     `state.gpu.pointRenderer.totalCount()`, which the ctx layer also can't reach.
 *
 * So the precise gate runs here, at the slot-subscription level where the
 * count is visible. When it concludes the fallback is warranted it ARMS the
 * synthetic load by setting the `'syntheticFallback'` request flag and calling
 * `reevaluateDemand`; the Synthetic row in `ASSET_WIRING` reads that flag.
 * The flag is the seam between this imperative gate and the declarative demand
 * loop — the gate owns the hard policy, the loop owns the actual `slot.load`.
 *
 * ### The galaxy catalog / curated distinction
 *
 * The gate counts only `survey`-category sources (`GALAXY_CATALOG_POINT_SOURCES`).
 * Curated Famous is excluded: a Famous-only success shouldn't suppress the
 * fallback, and a Famous-only failure shouldn't trigger it. The gate still
 * subscribes to Famous for its per-arrival status emission, but Famous never
 * moves the `realSettled` / `anyRealReady` counters.
 *
 * ### hidden-at-boot galaxy catalogs
 *
 * A galaxy catalog hidden at boot won't auto-load, so its slot stays `idle` forever —
 * it never transitions to ready/error. Treat it as already settled so the gate
 * doesn't wait indefinitely. When the user later toggles it on the load fires,
 * but by then the fallback decision is long made.
 *
 * ### Format-version mismatch suppresses the fallback
 *
 * A `FormatVersionError` means this build cannot read the served `.bin` at
 * all — falling back to the synthetic cloud would hide exactly the failure
 * `installFormatVersionAlert` (wired alongside this gate in `wireSlots`) is
 * surfacing to the splash. Real catalogs still settle normally (so
 * `realSettled` still counts them and subscribers still unsubscribe once),
 * but `maybeArmSyntheticFallback` bails before setting the request flag.
 */

import { Source } from '../../../data/sources';
import { FormatVersionError } from '../../../data/formatVersionError';
import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';
import {
  GALAXY_CATALOG_POINT_SOURCES,
  TIER_FETCHED_POINT_SOURCES,
} from './galaxyCatalogSourceRegistry';
import { reevaluateDemand } from './reevaluateDemand';
import { engineStatusChanged } from '../../../state/engine/engineSlice';

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { EngineCallbacks } from '../../../@types/engine/EngineCallbacks';

/**
 * Wire the synthetic-fallback gate. Subscribes to every tier-fetched point
 * source and arms the synthetic backstop (via the `'syntheticFallback'`
 * request flag + `reevaluateDemand`) once every real galaxy catalog has settled
 * without a successful ready+count>0.
 *
 * Returns `void`: galaxy catalog subscribers self-unsubscribe on first settle (the
 * once-only `counted`/`unsub` pattern), and the synthetic-slot status
 * subscriber is a long-lived per-arrival echo — so there is no handle for a
 * caller to dispose. An `engine.destroy()` before all galaxy catalogs settle leaves
 * those galaxy catalog subscriptions open until the slot is GC'd; the optional chains
 * on `state.gpu.pointRenderer` tolerate a torn-down renderer, so this is benign.
 */
export function createSyntheticFallback(state: EngineState, cb: EngineCallbacks): void {
  // Only `survey`-category sources count toward the gate; curated Famous is
  // excluded (see the module docstring).
  const realSet = new Set(GALAXY_CATALOG_POINT_SOURCES);

  let realSettled = 0;
  let anyRealReady = false;
  let formatVersionMismatch = false;

  for (const source of TIER_FETCHED_POINT_SOURCES) {
    const slot = state.assetSlots.points.get(source);
    // Hidden-at-boot (or missing) sources never transition, so count them as
    // pre-settled rather than waiting on them forever. For Famous (curated,
    // not in realSet) this branch just skips without touching the gate.
    // hiddenAtBoot reads the catalog's enabled INTENT directly — a disabled
    // source is pre-settled — rather than consulting a boot-time draw mask.
    const hiddenAtBoot = !state.settings.galaxyCatalogs.items[galaxyCatalogIdOf(source)].enabled;
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
        const readyStatus = {
          kind: 'ready' as const,
          count: state.gpu.pointRenderer?.totalCount() ?? 0,
          source,
        };
        cb.store.dispatch(engineStatusChanged(readyStatus));
        if (realSet.has(source)) anyRealReady = true;
      }
      if (s.kind === 'error' && s.error instanceof FormatVersionError) {
        formatVersionMismatch = true;
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
    // A version mismatch is "this build cannot read this data", not "no data
    // available" — never arm the backstop that would paper over it.
    if (formatVersionMismatch) return;
    // Not yet: still waiting on a real galaxy catalog, or at least one produced data.
    if (realSettled < realSet.size || anyRealReady) return;

    // Subscribe to the synthetic slot for its own per-arrival status emission
    // before tripping the demand loop, so the eventual `ready` echoes a count.
    const synthSlot = state.assetSlots.points.get(Source.Synthetic);
    synthSlot?.subscribe((s) => {
      if (s.kind === 'ready' && s.value.count > 0) {
        cb.store.dispatch(
          engineStatusChanged({
            kind: 'ready',
            count: state.gpu.pointRenderer?.totalCount() ?? 0,
            source: Source.Synthetic,
          }),
        );
      }
    });

    // Arm the fallback. The gate trips at most once: each galaxy catalog subscriber
    // calls unsub() before incrementing realSettled, so realSettled reaches
    // size exactly once and this guard passes a single time. (That once-only
    // property matters — synthSlot.subscribe above is NOT idempotent, so a
    // second arm would attach a second status listener and double-emit.)
    state.requests.add('syntheticFallback');
    reevaluateDemand(state);
  }
}
