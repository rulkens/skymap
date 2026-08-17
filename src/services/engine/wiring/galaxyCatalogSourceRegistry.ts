/**
 * galaxyCatalogSourceRegistry — declarative wiring for per-source
 * galaxy-catalog asset slots.
 *
 * ## What lives here
 *
 *   - `GALAXY_CATALOG_SOURCE_REGISTRY` — one row per source: short
 *     name, fetcher, category (`survey` | `curated` | `synthetic`),
 *     optional companion sidecars.  Pure data.
 *   - `GALAXY_CATALOG_POINT_SOURCES` / `TIER_FETCHED_POINT_SOURCES` — derived
 *     iteration lists for the synthetic-fallback gate: which sources
 *     count toward "real data arrived", and which slots it watches.
 *   - `wireGalaxyCatalogSourceSlot` — uniform slot-construction
 *     helper that turns a row into an AssetSlot in
 *     `state.assetSlots.points`.
 *   - `loadCompanionAssets` — fires `.load()` on the companion slots
 *     a row declares, dispatching a uniform `CompanionAssetReq`.
 *
 * ## Relationship to `ASSET_WIRING`
 *
 * This registry is the point-source CONSTRUCTION + tier-reload source:
 * `wireSlots` mints one slot per row, `setTier` reloads them with a
 * new-tier request, and the synthetic-fallback gate reads the derived
 * source lists.  WHEN each asset loads (boot, visibility toggle,
 * settings flip) is the `ASSET_WIRING` demand table's job — including
 * the point sources, which appear there as `built: 'external'` rows.
 * Non-point sidecars (filaments, pgc-aliases, cf4/mcpm volumes, the
 * cluster catalog) live only in `ASSET_WIRING`.
 *
 * A new galaxy catalog adds one row here AND one point row in `ASSET_WIRING`.
 * A new companion type adds one `GalaxyCatalogCompanionRef` member plus
 * one slot minted on `state.assetSlots` with a matching key.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { GalaxyCatalog } from '../../../@types/data/galaxyCatalog/GalaxyCatalog';
import { Source } from '../../../data/sources';
import { galaxyCatalogIdOf } from '../../../utils/galaxyCatalogIdOf';
import type { GalaxyCatalogReq } from '../../../@types/loading/GalaxyCatalogReq';
import type { GalaxyCatalogSourceConfig } from '../../../@types/engine/wiring/GalaxyCatalogSourceConfig';
import type { Tier } from '../../../@types/data/Tier';
import type { WirePointSourceDeps } from '../../../@types/engine/wiring/WirePointSourceDeps';
import { createAssetSlot } from '../../loading/AssetSlot';
import { galaxyCatalogFetcher } from '../../loading/fetchers/galaxyCatalogFetcher';
import { syntheticPointFetcher } from '../../loading/fetchers/syntheticPointFetcher';
import { syncVisibilityFadeItem } from './syncVisibilityFades';
import { dissolveCatalogBuffer } from './dissolveCatalogBuffer';
import type { SourceType } from '../../../@types/data/SourceType';
import { dispatchCatalogLoaded } from './dispatchCatalogLoaded';
import {
  engineSourceCountReported,
  engineProvenanceCountsReported,
} from '../../../state/engine/engineSlice';
import { countEstimatedProvenance } from '../../../utils/countEstimatedProvenance';

/**
 * Registry rows, in Source enum order.  Order matters: `wireSlots`'s
 * slot-mint loop, `setTier`'s tier-change reload loop, and the
 * synthetic-fallback gate iterate this list and rely on a stable
 * ordering for their per-source logs.
 */
export const GALAXY_CATALOG_SOURCE_REGISTRY: readonly GalaxyCatalogSourceConfig[] = [
  { source: Source.SDSS, shortName: 'sdss', fetcher: galaxyCatalogFetcher, category: 'survey' },
  { source: Source.TwoMRS, shortName: '2mrs', fetcher: galaxyCatalogFetcher, category: 'survey' },
  { source: Source.Glade, shortName: 'glade', fetcher: galaxyCatalogFetcher, category: 'survey' },
  {
    source: Source.FamousGalaxy,
    shortName: 'famous',
    fetcher: galaxyCatalogFetcher,
    category: 'curated',
    // famous_galaxies_meta.json carries the InfoCard text, CommandPalette entries,
    // and URL-focus resolution for hand-picked entries.
    // Tier-agnostic — one load per session.
    companions: ['famousGalaxiesMeta'],
  },
  {
    source: Source.Milliquas,
    shortName: 'milliquas',
    fetcher: galaxyCatalogFetcher,
    category: 'survey',
    // No companion sidecars: the v5 .bin format carries the AGN
    // class byte + parent-survey prefix byte per record, so the
    // InfoCard reconstructs the display name without an auxiliary
    // JSON fetch.
  },
  {
    source: Source.DesiDeep,
    shortName: 'desiDeep',
    fetcher: galaxyCatalogFetcher,
    category: 'survey',
    // No companion sidecars: the deep-cone .bin carries everything the
    // renderer + InfoCard need, same as Milliquas.
  },
  {
    source: Source.DesiWedge,
    shortName: 'desiWedge',
    fetcher: galaxyCatalogFetcher,
    category: 'survey',
    // No companion sidecars: the wedge .bin carries everything the renderer
    // + InfoCard need, same as the deep cone.
  },
  {
    source: Source.DesiSgw,
    shortName: 'desiSgw',
    fetcher: galaxyCatalogFetcher,
    category: 'survey',
    // No companion sidecars: the Sloan Great Wall .bin carries everything
    // the renderer + InfoCard need, same as the other DESI patches.
  },
  {
    source: Source.Synthetic,
    shortName: 'synthetic',
    fetcher: syntheticPointFetcher,
    category: 'synthetic',
  },
];

/**
 * Source → shortName lookup for log lines that iterate the renderer's
 * `loadedSources()` (where we don't have a registry row in hand).
 */
const SHORT_NAME_BY_SOURCE: ReadonlyMap<SourceType, string> = new Map(
  GALAXY_CATALOG_SOURCE_REGISTRY.map((c) => [c.source, c.shortName]),
);

/**
 * Sources in the `survey` category — counted toward the
 * synthetic-fallback ready gate.  Hidden galaxy catalogs count as already
 * settled (see `createSyntheticFallback`).
 */
export const GALAXY_CATALOG_POINT_SOURCES: readonly SourceType[] =
  GALAXY_CATALOG_SOURCE_REGISTRY.filter((c) => c.category === 'survey').map((c) => c.source);

/**
 * Every tier-fetched catalog source — galaxy catalogs + curated.  Iterated by
 * the synthetic-fallback gate, which subscribes to each to learn when
 * every real galaxy catalog has settled.
 */
export const TIER_FETCHED_POINT_SOURCES: readonly SourceType[] =
  GALAXY_CATALOG_SOURCE_REGISTRY.filter((c) => c.category !== 'synthetic').map((c) => c.source);

/**
 * Fire every companion declared on the given registry row.  Called from
 * `setTier`'s reload loop to pull companions back in lockstep with a
 * new-tier `.bin`.  At boot and on visibility toggle, companions load
 * through their own `ASSET_WIRING` rows (demand), not this function.
 *
 * Every companion slot accepts the same `CompanionAssetReq` (`{ tier }`)
 * — tier-aware fetchers use it, tier-agnostic ones ignore it — so
 * dispatch is a plain index into `state.assetSlots` with no per-key
 * switch.  `.load()` re-fetches unconditionally, which is what a tier
 * change wants: the new-tier request must replace the old fetch.
 */
export function loadCompanionAssets(
  state: EngineState,
  cfg: GalaxyCatalogSourceConfig,
  tier: Tier,
): void {
  if (!cfg.companions) return;
  for (const ref of cfg.companions) void state.assetSlots[ref]?.load({ tier });
}

/**
 * Build the asset slot for one galaxy-catalog source, attach its
 * commit body and ready-state subscriber, and register it in
 * `state.assetSlots.points`.
 *
 * Must run (from `wireSlots`) before `createSyntheticFallback`,
 * `installLoadProgress`, and `reevaluateDemand`, which subscribe to and
 * enumerate the minted slots. Renderer construction order does NOT matter:
 * `commit` re-reads `state.gpu.renderer` at call time and null-guards it
 * (see the check a few lines into `commit`, below) rather than assuming it
 * is already assigned. Not safe to call twice for the same source.
 */
export function wireGalaxyCatalogSourceSlot(
  state: EngineState,
  cfg: GalaxyCatalogSourceConfig,
  deps: WirePointSourceDeps,
): void {
  const { source, shortName, fetcher } = cfg;
  const { cb } = deps;
  const slotName = `${shortName}-points`;

  const slot = createAssetSlot<GalaxyCatalog, GalaxyCatalogReq>({
    name: slotName,
    fetch: fetcher,
    commit: async (cloud, _signal, req) => {
      // The renderer can be null mid-bootstrap (commit fires during
      // wireSlots, which runs before wireInput) or after teardown
      // (StrictMode unmount, hot-reload).  Drop the upload silently
      // — the slot still transitions to `ready`.
      //
      // We check `state.gpu.renderer` directly rather than going
      // through `isEngineReady`: the latter also waits for handles
      // populated later in bootstrap (pickRenderer, cam), and would
      // reject this upload during the legitimate wireSlots window.
      if (state.gpu.renderer === null) return;
      const catalogId = galaxyCatalogIdOf(source);

      // Tier swap: dissolve the currently-drawn buffer before the new one
      // replaces it.  The trigger is EXPLICIT — `req.dissolvePrevious`, set
      // only by `setTier` — not inferred from data-store membership, which
      // any second commit (re-enable, forceReload, a dev double-bootstrap)
      // would trip into a spurious dissolve.  The await is load-bearing: one
      // buffer per catalog means the old and new tiers can't cross-fade, so
      // the dissolve must finish before `upload()` destroys the buffer (see
      // `dissolveCatalogBuffer` for why awaiting here also avoids a blank gap).
      if (req.dissolvePrevious) await dissolveCatalogBuffer(state, catalogId);

      const t0 = performance.now();
      console.log(`[engine] upload start ${shortName} count=${cloud.count}`);
      // PointRenderer keys its catalogs by the string id; resolve from
      // the registry (the source code carries the matching id).
      await state.gpu.renderer.upload(catalogId, cloud);
      state.data.galaxies.setCatalog(source, cloud);

      // Signal that this source's cloud is now committed and resolvable, so the
      // selection reconciler and the tier-reanchor saga can re-resolve refs whose
      // cloud just landed.
      dispatchCatalogLoaded(cb.store, source);

      // Drive the fade-in through the intent → fade bridge, scoped to ONLY the
      // catalog just uploaded: the survey row owns the intent gate (reads
      // galaxyCatalogs.items[id].enabled) and the mask-recompute `post`, and the
      // single-item entry applies both to this one item — NOT a sweep of every
      // survey catalog. That scoping matters on a tier swap, where every visible
      // source reloads concurrently: the batch bridge would have this commit
      // re-drive every other source's fade, racing their own in-flight commits.
      // It's fire-and-forget so the slot's `ready` transition fires immediately;
      // user interaction doesn't wait for the smoothstep to saturate. The
      // tier-swap fade-OUT above (`dissolveCatalogBuffer`) is a transient
      // pre-replace dissolve, not an intent toggle — hence the two are separate.
      syncVisibilityFadeItem(state, 'survey', catalogId, { animate: true });

      const dtMs = Math.round(performance.now() - t0);
      // Dump what the GPU actually holds after upload.  If this
      // disagrees with `cloud.count`, a concurrent upload overwrote.
      const onGpu = Array.from(state.gpu.renderer.loadedSources())
        .map((e) => `${SHORT_NAME_BY_SOURCE.get(e.source) ?? e.source}=${e.count}`)
        .join(', ');
      const total = state.gpu.renderer.totalCount();
      console.log(
        `[engine] upload done  ${shortName} count=${cloud.count} (${dtMs} ms) | on-GPU: ${onGpu} | total=${total}`,
      );
    },
  });

  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      cb.store.dispatch(engineSourceCountReported({ source, count: s.value.count }));
      // One O(rows) pass over the two fallback-flag columns, paid once per
      // commit here rather than lazily in React, so the debug panel never
      // has to reach into the raw cloud (a couple of ms at full deck).
      cb.store.dispatch(
        engineProvenanceCountsReported({ source, counts: countEstimatedProvenance(s.value) }),
      );
    }
  });

  state.assetSlots.points.set(source, slot);
}
