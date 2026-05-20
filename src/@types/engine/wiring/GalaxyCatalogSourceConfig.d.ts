import type { Source } from '../../../data/sources';
import type { Tier } from '../../data/Tier';
import type { Fetcher } from '../../loading/Fetcher';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { GalaxyCatalogReq } from '../../loading/GalaxyCatalogReq';

/**
 * Names of the asset slots that may live alongside a galaxy-catalog
 * `.bin`.  Each value here corresponds to a key on
 * `state.assetSlots` whose `.load()` is fired by `loadCompanionAssets`
 * in lockstep with the main bin — at boot (if the source is visible),
 * on visibility toggle-on, and on tier change.
 *
 * The union is the single extension point for new companion types:
 * add the slot key here, add the case in `loadCompanionAssets`'s
 * switch, declare it on the registry row.  TS exhaustiveness catches
 * any of the three being missed.
 *
 *   - `famousMeta`     — Famous-galaxy meta + xrefs JSON sidecar
 *                        (tier-agnostic; one load per session).
 *   - `milliquasNames` — Milliquas Name + class JSON sidecar, parallel
 *                        to the per-tier bin's records (tier-aware;
 *                        reloads when the tier changes).
 */
export type GalaxyCatalogCompanionRef = 'famousMeta' | 'milliquasNames';

/**
 * Categorisation of a registry row.  Drives behaviour in three places
 * that previously hardcoded their own per-source lists:
 *
 *  - `survey`    — a large-N tier-fetched catalog (SDSS, 2MRS, GLADE,
 *                  Milliquas).  Reloads on tier change.  Counts toward
 *                  the "real survey ready" signal that gates the
 *                  synthetic-data fallback at boot (if every survey
 *                  errors and none is ready, synthetic kicks in).
 *  - `curated`   — a hand-picked auxiliary set whose absence is
 *                  acceptable (Famous).  Reloads on tier change but
 *                  does NOT count toward the survey-ready gate — an
 *                  empty Famous file shouldn't suppress synthetic.
 *  - `synthetic` — the procedural fallback (Synthetic).  Loaded only
 *                  when no `survey` row reaches a ready state.
 *
 * Adding a new tier-fetched survey is therefore one row in the
 * registry + (optionally) one TIER_TARGETS entry.  No hardcoded
 * `[Source.SDSS, Source.TwoMRS, ...]` lists need editing elsewhere.
 */
export type GalaxyCatalogSourceCategory = 'survey' | 'curated' | 'synthetic';

/**
 * One row of the registry.
 *
 * The fields capture exactly the dimensions that vary across the
 * galaxy-catalog-source slots; everything else (slot name shape, commit
 * body, subscriber side effects) is uniform and lives in
 * `wireGalaxyCatalogSourceSlot`.
 */
export type GalaxyCatalogSourceConfig = {
  /** Which catalog this slot represents. */
  source: Source;
  /**
   * Fetcher used to materialise the slot's request into a GalaxyCatalog.
   * The real surveys + Famous share `galaxyCatalogFetcher` (which
   * dispatches on `req.source` to pick the right .bin URL); Synthetic
   * uses `syntheticPointFetcher` (which procedurally generates a
   * catalog and ignores `req.tier`).
   */
  fetcher: Fetcher<GalaxyCatalog, GalaxyCatalogReq>;
  /**
   * Declarative initial tier for the slot.  See the module-header
   * "Why initialTier lives on the config but isn't read by the helper"
   * note — this field is for forward-uniformity with the spec; the
   * actual first-load tier today comes from `state.sources.tier`.
   */
  initialTier: Tier;
  /**
   * How this row interacts with the boot-time and tier-change loops.
   * See `GalaxyCatalogSourceCategory` for the per-value semantics.
   */
  category: GalaxyCatalogSourceCategory;
  /**
   * Names of asset slots that live alongside the main `.bin` and must
   * stay in lockstep with it (e.g. Famous's meta sidecar or
   * Milliquas's name sidecar).  The engine fires `.load()` on each
   * listed companion in lockstep with the survey's bin: at boot (if
   * the source is visible), on visibility-toggle-on, and on tier
   * change.
   *
   * Pure data — see `loadCompanionAssets` for how each slot key is
   * resolved to the right `.load()` call.  Adding a new companion
   * type is one entry in `GalaxyCatalogCompanionRef` + one case in
   * the resolver's switch.
   */
  companions?: readonly GalaxyCatalogCompanionRef[];
};
