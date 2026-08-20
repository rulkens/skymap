/**
 * galaxyCatalogSourceRegistry — declarative wiring for per-source galaxy-catalog
 * asset slots: CONSTRUCTION and tier reload, not demand.
 *
 * WHEN each asset loads (boot, visibility toggle, settings flip) belongs to the
 * `ASSET_WIRING` demand table, where the point sources appear as
 * `built: 'external'` rows. So a new galaxy catalog needs one row HERE and one
 * point row THERE; a new companion type needs a `GalaxyCatalogCompanionRef`
 * member plus a slot minted on `state.assetSlots` under the matching key.
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

// In Source enum order: the slot-mint loop, the tier reload loop and the
// synthetic-fallback gate all iterate this list and want stable per-source logs.
export const GALAXY_CATALOG_SOURCE_REGISTRY: readonly GalaxyCatalogSourceConfig[] = [
  { source: Source.SDSS, shortName: 'sdss', fetcher: galaxyCatalogFetcher, category: 'survey' },
  { source: Source.TwoMRS, shortName: '2mrs', fetcher: galaxyCatalogFetcher, category: 'survey' },
  { source: Source.Glade, shortName: 'glade', fetcher: galaxyCatalogFetcher, category: 'survey' },
  {
    source: Source.FamousGalaxy,
    shortName: 'famous',
    fetcher: galaxyCatalogFetcher,
    category: 'curated',
    // Carries the InfoCard text, CommandPalette entries and URL-focus resolution
    // for hand-picked entries; tier-agnostic, so one load per session.
    companions: ['famousGalaxiesMeta'],
  },
  {
    source: Source.Milliquas,
    shortName: 'milliquas',
    fetcher: galaxyCatalogFetcher,
    category: 'survey',
    // No sidecar: the v5 .bin carries the AGN class byte + parent-survey prefix
    // byte per record, so the InfoCard rebuilds the display name without a fetch.
  },
  {
    source: Source.DesiDeep,
    shortName: 'desiDeep',
    fetcher: galaxyCatalogFetcher,
    category: 'survey',
  },
  {
    source: Source.DesiWedge,
    shortName: 'desiWedge',
    fetcher: galaxyCatalogFetcher,
    category: 'survey',
  },
  {
    source: Source.DesiSgw,
    shortName: 'desiSgw',
    fetcher: galaxyCatalogFetcher,
    category: 'survey',
  },
  {
    source: Source.Synthetic,
    shortName: 'synthetic',
    fetcher: syntheticPointFetcher,
    category: 'synthetic',
  },
];

// For log lines that iterate the renderer's `loadedSources()`, with no row in hand.
const SHORT_NAME_BY_SOURCE: ReadonlyMap<SourceType, string> = new Map(
  GALAXY_CATALOG_SOURCE_REGISTRY.map((c) => [c.source, c.shortName]),
);

// Counted toward the synthetic-fallback ready gate; a hidden catalog counts as
// already settled (see `createSyntheticFallback`).
export const GALAXY_CATALOG_POINT_SOURCES: readonly SourceType[] =
  GALAXY_CATALOG_SOURCE_REGISTRY.filter((c) => c.category === 'survey').map((c) => c.source);

// The synthetic-fallback gate subscribes to each of these to learn when every
// real galaxy catalog has settled.
export const TIER_FETCHED_POINT_SOURCES: readonly SourceType[] =
  GALAXY_CATALOG_SOURCE_REGISTRY.filter((c) => c.category !== 'synthetic').map((c) => c.source);

/**
 * Called from `setTier`'s reload loop only — at boot and on visibility toggle,
 * companions load through their own `ASSET_WIRING` demand rows.
 *
 * Every companion slot accepts the same `{ tier }` request (tier-agnostic ones
 * ignore it), so dispatch is a plain index with no per-key switch. `.load()`
 * re-fetches unconditionally, which is exactly what a tier change wants.
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
 * Must run before `createSyntheticFallback`, `installLoadProgress` and
 * `reevaluateDemand`, which subscribe to and enumerate the minted slots. Renderer
 * construction order does NOT matter — `commit` re-reads the renderer at call time.
 * Not safe to call twice for the same source.
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
      // Null mid-bootstrap or after teardown: drop the upload silently, the slot
      // still transitions to `ready`. Checked directly rather than through
      // `isEngineReady`, which also waits on handles populated LATER in bootstrap
      // and would reject this upload during the legitimate wireSlots window.
      if (state.gpu.galaxyPointRenderer === null) return;
      const catalogId = galaxyCatalogIdOf(source);

      // The trigger is EXPLICIT, set only by `setTier` — inferring it from
      // data-store membership would let any second commit (re-enable, forceReload,
      // a dev double-bootstrap) trip a spurious dissolve. The await is
      // load-bearing: one buffer per catalog means the tiers cannot cross-fade, so
      // the dissolve must finish before `upload()` destroys the buffer.
      if (req.dissolvePrevious) await dissolveCatalogBuffer(state, catalogId);

      const t0 = performance.now();
      console.log(`[engine] upload start ${shortName} count=${cloud.count}`);
      // GalaxyPointRenderer keys its catalogs by the string id, not the source code.
      await state.gpu.galaxyPointRenderer.upload(catalogId, cloud);
      state.data.galaxies.setCatalog(source, cloud);

      // Lets the selection reconciler and the tier-reanchor saga re-resolve refs
      // whose cloud just landed.
      dispatchCatalogLoaded(cb.store, source);

      // The single-ITEM entry, not the batch bridge: on a tier swap every visible
      // source reloads concurrently, and a sweep would have this commit re-drive
      // the others' in-flight fades. Fire-and-forget, so the slot reaches `ready`
      // without waiting on the smoothstep.
      syncVisibilityFadeItem(state, 'survey', catalogId, {});

      const dtMs = Math.round(performance.now() - t0);
      // If this disagrees with `cloud.count`, a concurrent upload overwrote.
      const onGpu = Array.from(state.gpu.galaxyPointRenderer.loadedSources())
        .map((e) => `${SHORT_NAME_BY_SOURCE.get(e.source) ?? e.source}=${e.count}`)
        .join(', ');
      const total = state.gpu.galaxyPointRenderer.totalCount();
      console.log(
        `[engine] upload done  ${shortName} count=${cloud.count} (${dtMs} ms) | on-GPU: ${onGpu} | total=${total}`,
      );
    },
  });

  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      cb.store.dispatch(engineSourceCountReported({ source, count: s.value.count }));
      // One O(rows) pass paid here per commit rather than lazily in React, so the
      // debug panel never reaches into the raw cloud.
      cb.store.dispatch(
        engineProvenanceCountsReported({ source, counts: countEstimatedProvenance(s.value) }),
      );
    }
  });

  state.assetSlots.points.set(source, slot);
}
