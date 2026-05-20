/**
 * galaxyCatalogSourceRegistry — declarative wiring for per-source
 * galaxy-catalog asset slots.
 *
 * ## What lives here
 *
 *   - `GALAXY_CATALOG_SOURCE_REGISTRY` — one row per source declaring
 *     its fetcher, initial tier, category (`survey` | `curated` |
 *     `synthetic`), and optional companion sidecars. Pure data.
 *   - `SURVEY_POINT_SOURCES` / `TIER_FETCHED_POINT_SOURCES` — derived
 *     iteration lists for the boot loop, the tier-change loop, and
 *     the synthetic-fallback gate.
 *   - `wireGalaxyCatalogSourceSlot` — uniform slot-construction
 *     helper that turns a row into an AssetSlot in
 *     `state.assetSlots.points`.
 *   - `loadCompanionAssets` — resolver that fires `.load()` on the
 *     companion slots a row declares, dispatching per-companion-type
 *     `.load()` signatures.
 *
 * ## What does NOT live here
 *
 * Sidecars whose lifecycle isn't tied to a galaxy `.bin` stay inline
 * in `wireSlots`:
 *
 *   - `filaments` — different payload, different renderer target,
 *     one-shot at boot.
 *   - `pgc-aliases` — lazy load via the public handle.
 *
 * A new survey adds one row; a new sidecar type adds one entry to
 * `GalaxyCatalogCompanionRef` and one case in `loadCompanionAssets`.
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
import type { FadeHandle } from '../../../@types/animation/FadeHandle';
import { FADE_IN_DURATION_MS, FADE_OUT_DURATION_MS } from '../../animation/fadeController';

/**
 * Lowercase short name for a Source — used as the slot-name prefix
 * (`sdss-points`, `glade-points`, …) and in the upload-log line.
 * Promote to `data/sources.ts` if a third unrelated caller appears.
 */
function sourceName(source: Source): string {
  switch (source) {
    case Source.SDSS:
      return 'sdss';
    case Source.TwoMRS:
      return '2mrs';
    case Source.Glade:
      return 'glade';
    case Source.Famous:
      return 'famous';
    case Source.Synthetic:
      return 'synthetic';
    case Source.Milliquas:
      return 'milliquas';
    case Source.Cluster:
    case Source.Supercluster:
    case Source.Void:
      // POI sources have no `.bin` slot — fail loudly if reached.
      throw new Error(`sourceName: POI source ${source} has no galaxy-catalog slot`);
  }
}

/**
 * Registry rows, in Source enum order.  Order matters: the boot loop,
 * the tier-change loop, and the synthetic-fallback gate all iterate
 * this list and rely on a stable ordering for their per-source logs.
 *
 * `initialTier` is declarative documentation today; first-load tier
 * comes from `state.sources.tier`.  The field stays on the row for
 * forward-compatibility with per-source tier overrides.
 */
export const GALAXY_CATALOG_SOURCE_REGISTRY: readonly GalaxyCatalogSourceConfig[] = [
  { source: Source.SDSS, fetcher: galaxyCatalogFetcher, initialTier: 'medium', category: 'survey' },
  { source: Source.TwoMRS, fetcher: galaxyCatalogFetcher, initialTier: 'medium', category: 'survey' },
  { source: Source.Glade, fetcher: galaxyCatalogFetcher, initialTier: 'small', category: 'survey' },
  {
    source: Source.Famous,
    fetcher: galaxyCatalogFetcher,
    initialTier: 'medium',
    category: 'curated',
    // famous_meta.json + famous_xrefs.json carry the InfoCard text,
    // CommandPalette entries, and URL-focus resolution for hand-picked
    // entries.  Tier-agnostic — one load per session.
    companions: ['famousMeta'],
  },
  {
    source: Source.Milliquas,
    fetcher: galaxyCatalogFetcher,
    initialTier: 'medium',
    category: 'survey',
    // milliquas-<tier>_names.json carries the verbatim Name + class
    // column, parallel-indexed by localIdx to the per-tier bin.
    // Tier-aware — reloads in lockstep with the bin on tier change.
    companions: ['milliquasNames'],
  },
  { source: Source.Synthetic, fetcher: syntheticPointFetcher, initialTier: 'small', category: 'synthetic' },
];

/**
 * Sources in the `survey` category — counted toward the
 * synthetic-fallback ready gate.  Hidden surveys count as already
 * settled (see `wireSlots`).
 */
export const SURVEY_POINT_SOURCES: readonly Source[] = GALAXY_CATALOG_SOURCE_REGISTRY.filter(
  (c) => c.category === 'survey',
).map((c) => c.source);

/**
 * Every tier-fetched catalog source — surveys + curated.  Driven by
 * the boot loop and the tier-change reload loop.
 */
export const TIER_FETCHED_POINT_SOURCES: readonly Source[] =
  GALAXY_CATALOG_SOURCE_REGISTRY.filter((c) => c.category !== 'synthetic').map((c) => c.source);

/**
 * Fire every companion declared on the given registry row.  Called
 * from the boot loop, `setSourceVisible`, and the tier-change loop.
 *
 * Every companion slot accepts the same `CompanionAssetReq` (`{ tier }`)
 * — tier-aware fetchers use it, tier-agnostic ones ignore it — so
 * dispatch is a plain index into `state.assetSlots` with no per-key
 * switch.  Idempotent at the AssetSlot layer.
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
  const { source, fetcher } = cfg;
  const { cb } = deps;
  const slotName = `${sourceName(source)}-points`;

  // Register the fade handle at opacity 0 so the draw loop's
  // `fadeOpacityOf` lookup always finds it, even on the first frame
  // before any upload lands. The commit below drives the fadeTo
  // lifecycle from there.
  state.subsystems.fades.register({ kind: 'survey', source }, 0);

  const slot = createAssetSlot<GalaxyCatalog, GalaxyCatalogReq>({
    name: slotName,
    fetch: fetcher,
    commit: async (cloud) => {
      // The renderer can be null mid-bootstrap (commit fires during
      // wireSlots, which runs before wireInput) or after teardown
      // (StrictMode unmount, hot-reload). Either way, drop the upload
      // silently — the slot still transitions to `ready`.
      //
      // We check `state.gpu.renderer` directly rather than going
      // through `isEngineReady`: the latter also waits for handles
      // populated later in bootstrap (pickRenderer, cam), and would
      // reject this upload during the legitimate wireSlots window.
      if (state.gpu.renderer === null) return;
      const handle: FadeHandle = { kind: 'survey', source };
      const fades = state.subsystems.fades;

      // Tier swap: fade the old buffer out before the new one lands so
      // the user sees the previous tier dissolve. First load skips
      // straight to fade-in. The renderer keeps drawing the OLD buffer
      // with falling alpha until fade-out completes — only then does
      // `upload()` destroy + recreate it.
      const isFirstLoad = !state.sources.catalogs.has(source);
      if (!isFirstLoad) {
        await fades.fadeTo(handle, 0, FADE_OUT_DURATION_MS);
      }

      const t0 = performance.now();
      // eslint-disable-next-line no-console
      console.log(
        `[engine] upload start ${sourceName(source)} count=${cloud.count}`,
      );
      await state.gpu.renderer.upload(source, cloud);
      state.sources.catalogs.set(source, cloud);

      // Fire-and-forget fade-in so the slot's `ready` transition
      // fires immediately; user interaction doesn't wait for the
      // smoothstep to saturate.
      void fades.fadeTo(handle, 1, FADE_IN_DURATION_MS);

      const dtMs = Math.round(performance.now() - t0);
      // Dump what the GPU actually holds after upload. If this
      // disagrees with `cloud.count` a concurrent upload overwrote.
      const onGpu = Array.from(state.gpu.renderer.loadedSources())
        .map((e) => `${sourceName(e.source)}=${e.count}`)
        .join(', ');
      const total = state.gpu.renderer.totalCount();
      // eslint-disable-next-line no-console
      console.log(
        `[engine] upload done  ${sourceName(source)} count=${cloud.count} (${dtMs} ms) | on-GPU: ${onGpu} | total=${total}`,
      );
    },
  });

  slot.subscribe((s) => {
    if (s.kind === 'ready') {
      cb.sources?.onCatalogReady?.(source, s.value.count);
      state.subsystems.scheduler.requestRender();
    }
  });

  state.assetSlots.points.set(source, slot);
}
