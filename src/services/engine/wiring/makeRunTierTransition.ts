/**
 * makeRunTierTransition — the dispatch-free tier-transition effect, reached
 * from the tier saga via injected context.
 *
 * ## What this is
 *
 * The engine's per-source data-reload orchestration for a confirmed tier
 * change, packaged as a `RunTierTransition` the root saga calls through its
 * injected `SagaContext`. The saga owns the WRITE (it dispatched the `tier`
 * slice action and computed `prev`/`next`); this runner owns the EFFECT
 * (cancel + re-fetch each source's `.bin`, reload MCPM + Polyphorm, rebuild
 * the hi-res famous texture). No dispatch here, and no `selectTier` read —
 * prev/next arrive as params so the saga is the single source of the diff.
 *
 * ## Why a factory closing over EngineState
 *
 * The runner needs `state` (asset slots, GPU handles, settings) and the
 * `device`, neither of which the saga has. The engine builds this factory once
 * and registers the result via `cb.setSagaContext`, so the saga reaches the
 * engine's GPU resources without importing the engine.
 *
 * ## Why `device` is read LAZILY inside the closure
 *
 * GPU init lands AFTER this factory is built (the factory is constructed
 * alongside `bootstrapDeps`, before the async bootstrap IIFE finishes), so
 * reading `bootstrapDeps.phaseLocals?.device` at build time would always see
 * `undefined`. Reading it inside the returned closure means the hi-res rebuild
 * guard correctly skips pre-bootstrap and fires once the device exists via the
 * `if (device && texturedDiskRenderer)` guard below.
 *
 * ## The sole tier-transition path
 *
 * This runner is the ONLY place the per-source reload orchestration lives. The
 * UI dispatches `requestTier`; the tier saga writes the slice action and calls
 * this runner with the computed prev/next. There is no parallel handle method.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { BootstrapDeps } from '../../../@types/engine/BootstrapDeps';
import type { RunTierTransition } from '../../../store/types';
import { GALAXY_CATALOG_SOURCE_REGISTRY, loadCompanionAssets } from './galaxyCatalogSourceRegistry';
import { willSourceReload } from './willSourceReload';
import { rebuildHiResFamousForTier } from '../helpers/rebuildHiResFamousForTier';

export function makeRunTierTransition(
  state: EngineState,
  bootstrapDeps: BootstrapDeps,
): RunTierTransition {
  return (prevTier, nextTier) => {
    // For each source that actually reloads on this swap, hand the slot the new
    // request (it cancels any in-flight load, re-fetches the tier's `.bin`,
    // commits). The per-source skip logic — synthetic / unchanged target /
    // disabled intent — lives in `willSourceReload`, the shared predicate the
    // re-anchor capture consumes too so the two can't drift. Filaments are NOT
    // swapped (see `filamentFetcher.ts`).
    for (const cfg of GALAXY_CATALOG_SOURCE_REGISTRY) {
      const src = cfg.source;
      if (!willSourceReload(src, prevTier, nextTier, state.settings)) continue;
      // `dissolvePrevious`: a tier swap is the one reload the user should see the
      // old tier fade out of. The commit reads this flag instead of guessing "is
      // this a re-commit" from the data store, so re-enable / forceReload / boot
      // never trigger a spurious dissolve.
      void state.assetSlots.points
        .get(src)
        ?.load({ source: src, tier: nextTier, dissolvePrevious: true });
      // Companion sidecars reload in lockstep so localIdx lookups stay valid.
      loadCompanionAssets(state, cfg, nextTier);
    }

    // MCPM volume is tier-aware (unlike CF-4); same per-tier reload via the
    // AssetSlot machinery.
    void state.assetSlots.mcpm?.load({ tier: nextTier });

    // Polyphorm is tier-aware like MCPM (same physical quantity, same
    // per-tier `.scfd` variants), so it gets the same per-tier reload.
    void state.assetSlots.polyphorm?.load({ tier: nextTier });

    // Star catalogs are tier-aware like MCPM, but per-source and demand-loaded.
    // This runner (not reevaluateDemand, whose idle-guard deliberately leaves
    // non-idle slots alone) is the tier-reload path, so each loaded catalog
    // re-fetches its per-tier bin here or the drawn star population would
    // silently keep the old tier. The idle-skip is the disabled ⇒ no-work
    // rule: an idle slot was never demanded (catalog toggled off), and a tier
    // flip must not start fetching a hidden layer — when the user enables it,
    // reevaluateDemand issues the then-current tier's request.
    for (const [source, slot] of state.assetSlots.starCatalogs) {
      if (slot.state().kind === 'idle') continue;
      void slot.load({ source, tier: nextTier });
    }

    // No direct Milky-Way regenerate call here, deliberately — this runner
    // used to carry one when the cloud's star count was tier-derived, but
    // `watchTierSaga` now re-seeds `settings.milkyWay.starCount` from the new
    // tier's budget as part of the same tier change (see that saga), and
    // `runFrame`'s per-frame mismatch check (`cloud.starCount()` vs. the live
    // setting) already regenerates the cloud whenever they disagree — which a
    // re-seed reliably produces. Calling `regenerate` here too would race
    // that check: both would try to answer the same tier change, and the
    // cloud no longer needs to know `Tier` at all (see `MilkyWayCloud`'s
    // docblock) to do so.

    // The hi-res LOD-3 famous-galaxy texture is tier-aware on its layerSide.
    // WebGPU textures are immutable in shape, so a tier flip destroys + recreates
    // the texture + planner pair and re-binds the renderer's hi-res view (see
    // `helpers/rebuildHiResFamousForTier.ts`). device + texturedDiskRenderer are
    // null until initGpu, so the guard skips the rebuild pre-bootstrap.  device is
    // read live off phaseLocals here (not captured at factory-build time) so the
    // guard reflects the post-bootstrap GPU state, not the build-time null.
    const device = bootstrapDeps.phaseLocals?.device;
    const texturedDiskRenderer = state.gpu.texturedDiskRenderer;
    if (device && texturedDiskRenderer) {
      rebuildHiResFamousForTier({
        state,
        device,
        tier: nextTier,
        texturedDiskRenderer,
        requestRender: () => state.subsystems.scheduler.requestRender(),
      });
    }
  };
}
