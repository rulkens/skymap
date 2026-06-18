// ── Data-resolution tier swap ───────────────────────────────────────────────
//
// Module-scope so the `createEngine` literal delegates here (mirroring the other
// `handles/` setters) and so the per-source reload orchestration is testable
// without a full GPU engine.
//
// This is bespoke (not a `settingsTable` row) on two counts: it orchestrates
// per-source asset-slot reloads, and it reaches a dependency that does NOT live
// on `state` — the `device`, which the `createEngine` closure carries in
// `bootstrapDeps.phaseLocals` and injects here (same pattern as
// `rebuildHiResFamousForTier`, which it calls). `device` is `undefined`
// pre-bootstrap, so the hi-res rebuild guard skips then (e.g. a test driving the
// handle directly).

import type { Tier } from '../../../@types/data/Tier';
import type { EngineState } from '../../../@types/engine/state/EngineState';
import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';
import { tierTarget } from '../../../data/tierTargets';
import type { AppStore } from '../../../store/types';
import { setTier as setTierAction } from '../../../state/settings/settingsSlice';
import { selectTier } from '../../../state/settings/selectors';
import {
  GALAXY_CATALOG_SOURCE_REGISTRY,
  loadCompanionAssets,
} from '../wiring/galaxyCatalogSourceRegistry';
import { rebuildHiResFamousForTier } from '../helpers/rebuildHiResFamousForTier';

export function setTier(
  state: EngineState,
  store: AppStore,
  device: GPUDevice | undefined,
  tier: Tier,
): void {
  // Tier lives in the settings store; React reads it via `selectTier`, so
  // there's no `onTierChange` echo to fire — the dispatch notifies subscribers.
  // We diff against the store's current value to skip a no-op, then commit
  // through the slice action before driving the per-source reloads.
  const prevTier = selectTier(store.getState());
  if (tier === prevTier) return;
  store.dispatch(setTierAction(tier));

  // For each tier-relevant source: same target → skip; different target → hand
  // the slot the new request (it cancels any in-flight load, re-fetches the
  // tier's `.bin`, commits). Sources whose enabled INTENT is off skip too —
  // don't re-fetch a source you're hiding; toggling one on later loads it at the
  // current tier via `setSourceVisible`. Filaments are NOT swapped (see
  // `filamentFetcher.ts`).
  for (const cfg of GALAXY_CATALOG_SOURCE_REGISTRY) {
    const src = cfg.source;
    if (cfg.category === 'synthetic') continue;
    if (tierTarget(src, prevTier) === tierTarget(src, tier)) continue;
    if (!state.settings.galaxyCatalogs.items[galaxyCatalogIdOf(src)].enabled) continue;
    // `dissolvePrevious`: a tier swap is the one reload the user should see the
    // old tier fade out of. The commit reads this flag instead of guessing "is
    // this a re-commit" from the data store, so re-enable / forceReload / boot
    // never trigger a spurious dissolve.
    state.assetSlots.points.get(src)?.load({ source: src, tier, dissolvePrevious: true });
    // Companion sidecars reload in lockstep so localIdx lookups stay valid.
    loadCompanionAssets(state, cfg, tier);
  }

  // MCPM volume is tier-aware (unlike CF-4); same per-tier reload via the
  // AssetSlot machinery.
  state.assetSlots.mcpm?.load({ tier });

  // The hi-res LOD-3 famous-galaxy texture is tier-aware on its layerSide.
  // WebGPU textures are immutable in shape, so a tier flip destroys + recreates
  // the texture + planner pair and re-binds the renderer's hi-res view (see
  // `helpers/rebuildHiResFamousForTier.ts`). device + texturedDiskRenderer are
  // null until initGpu, so the guard skips the rebuild pre-bootstrap.
  const texturedDiskRenderer = state.gpu.texturedDiskRenderer;
  if (device && texturedDiskRenderer) {
    rebuildHiResFamousForTier({
      state,
      device,
      tier,
      texturedDiskRenderer,
      requestRender: () => state.subsystems.scheduler.requestRender(),
    });
  }
}
