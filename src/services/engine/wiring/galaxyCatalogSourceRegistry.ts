/**
 * galaxyCatalogSourceRegistry — declarative wiring for per-source
 * galaxy-catalog asset slots.
 *
 * ## What lives here
 *
 *   - `GALAXY_CATALOG_SOURCE_REGISTRY` — one row per source: short
 *     name, fetcher, category (`survey` | `curated` | `synthetic`),
 *     optional companion sidecars.  Pure data.
 *   - `SURVEY_POINT_SOURCES` / `TIER_FETCHED_POINT_SOURCES` — derived
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
 * `initGpu` mints one slot per row, `setTier` reloads them with a
 * new-tier request, and the synthetic-fallback gate reads the derived
 * source lists.  WHEN each asset loads (boot, visibility toggle,
 * settings flip) is the `ASSET_WIRING` demand table's job — including
 * the point sources, which appear there as `built: 'external'` rows.
 * Non-point sidecars (filaments, pgc-aliases, cf4/mcpm volumes, the
 * cluster catalog) live only in `ASSET_WIRING`.
 *
 * A new survey adds one row here AND one point row in `ASSET_WIRING`.
 * A new companion type adds one `GalaxyCatalogCompanionRef` member plus
 * one slot minted on `state.assetSlots` with a matching key.
 */

import type { EngineState } from '../../../@types/engine/state/EngineState';
import type { GalaxyCatalog } from '../../../@types/data/GalaxyCatalog';
import { Source } from '../../../data/sources';
import type { GalaxyCatalogReq } from '../../../@types/loading/GalaxyCatalogReq';
import type { GalaxyCatalogSourceConfig } from '../../../@types/engine/wiring/GalaxyCatalogSourceConfig';
import type { Tier } from '../../../@types/data/Tier';
import type { WirePointSourceDeps } from '../../../@types/engine/wiring/WirePointSourceDeps';
import { createAssetSlot } from '../../loading/AssetSlot';
import { galaxyCatalogFetcher } from '../../loading/fetchers/galaxyCatalogFetcher';
import { syntheticPointFetcher } from '../../loading/fetchers/syntheticPointFetcher';
import type { FadeId } from '../../../@types/animation/FadeId';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';
import type { SourceType } from '../../../@types/data/SourceType';

/**
 * Registry rows, in Source enum order.  Order matters: `initGpu`'s
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
    // famous_meta.json carries the InfoCard text, CommandPalette entries,
    // and URL-focus resolution for hand-picked entries.
    // Tier-agnostic — one load per session.
    companions: ['famousMeta'],
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
 * synthetic-fallback ready gate.  Hidden surveys count as already
 * settled (see `createSyntheticFallback`).
 */
export const SURVEY_POINT_SOURCES: readonly SourceType[] = GALAXY_CATALOG_SOURCE_REGISTRY.filter(
  (c) => c.category === 'survey',
).map((c) => c.source);

/**
 * Every tier-fetched catalog source — surveys + curated.  Iterated by
 * the synthetic-fallback gate, which subscribes to each to learn when
 * every real survey has settled.
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
  for (const ref of cfg.companions) state.assetSlots[ref]?.load({ tier });
}

/**
 * Build the asset slot for one galaxy-catalog source, attach its
 * commit body and ready-state subscriber, and register it in
 * `state.assetSlots.points`.
 *
 * Must run AFTER `state.gpu.renderer` is assigned — the commit step
 * uploads to it.  Not safe to call twice for the same source.
 */
export function wireGalaxyCatalogSourceSlot(
  state: EngineState,
  cfg: GalaxyCatalogSourceConfig,
  deps: WirePointSourceDeps,
): void {
  const { source, shortName, fetcher } = cfg;
  const { cb } = deps;
  const slotName = `${shortName}-points`;

  // Register the fade id at opacity 0 so the draw loop's
  // `fadeOpacityOf` lookup always finds it, even on the first frame
  // before any upload lands.  The commit drives the fadeTo lifecycle
  // from there.
  state.subsystems.fades.register({ kind: 'survey', source }, 0);

  const slot = createAssetSlot<GalaxyCatalog, GalaxyCatalogReq>({
    name: slotName,
    fetch: fetcher,
    commit: async (cloud) => {
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
      const id: FadeId = { kind: 'survey', source };
      const fades = state.subsystems.fades;

      // Tier swap: fade the old buffer out before the new one lands so
      // the user sees the previous tier dissolve.  First load skips
      // straight to fade-in.  The renderer keeps drawing the OLD
      // buffer with falling alpha until fade-out completes — only
      // then does `upload()` destroy + recreate it.
      const isFirstLoad = !state.data.galaxies.catalogs.has(source);
      if (!isFirstLoad) {
        await fades.fadeTo(id, 0, FADE_OUT_DURATION_MS);
      }

      const t0 = performance.now();
      // eslint-disable-next-line no-console
      console.log(`[engine] upload start ${shortName} count=${cloud.count}`);
      await state.gpu.renderer.upload(source, cloud);
      state.data.galaxies.setCatalog(source, cloud);

      // Fire-and-forget fade-in so the slot's `ready` transition
      // fires immediately; user interaction doesn't wait for the
      // smoothstep to saturate.
      void fades.fadeTo(id, 1, FADE_IN_DURATION_MS);

      const dtMs = Math.round(performance.now() - t0);
      // Dump what the GPU actually holds after upload.  If this
      // disagrees with `cloud.count`, a concurrent upload overwrote.
      const onGpu = Array.from(state.gpu.renderer.loadedSources())
        .map((e) => `${SHORT_NAME_BY_SOURCE.get(e.source) ?? e.source}=${e.count}`)
        .join(', ');
      const total = state.gpu.renderer.totalCount();
      // eslint-disable-next-line no-console
      console.log(
        `[engine] upload done  ${shortName} count=${cloud.count} (${dtMs} ms) | on-GPU: ${onGpu} | total=${total}`,
      );
    },
  });

  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      cb.sources?.onCatalogReady?.(source, s.value.count);
    }
  });

  state.assetSlots.points.set(source, slot);
}
