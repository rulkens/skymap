import type { Source } from '../../../data/sources';
import type { Fetcher } from '../../loading/Fetcher';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { GalaxyCatalogReq } from '../../loading/GalaxyCatalogReq';

/**
 * Names of the asset slots that may live alongside a galaxy-catalog
 * `.bin`.  Each value corresponds to a key on `state.assetSlots` whose
 * `.load()` is fired by `loadCompanionAssets` in lockstep with the main
 * bin — at boot (if the source is visible), on visibility toggle-on,
 * and on tier change.
 *
 *   - `famousMeta` — Famous-galaxy meta + xrefs JSON sidecar
 *                    (tier-agnostic; one load per session).
 */
export type GalaxyCatalogCompanionRef = 'famousMeta';

/**
 * Categorisation of a registry row.  Drives behaviour in two places
 * that previously hardcoded their own per-source lists:
 *
 *  - `survey`    — a large-N tier-fetched catalog (SDSS, 2MRS, GLADE,
 *                  Milliquas).  Reloads on tier change.  Counts toward
 *                  the "real survey ready" signal that gates the
 *                  synthetic-data fallback at boot.
 *  - `curated`   — a hand-picked auxiliary set whose absence is
 *                  acceptable (Famous).  Reloads on tier change but
 *                  does NOT count toward the survey-ready gate.
 *  - `synthetic` — the procedural fallback (Synthetic).  Loaded only
 *                  when no `survey` row reaches a ready state.
 */
export type GalaxyCatalogSourceCategory = 'survey' | 'curated' | 'synthetic';

/**
 * One row of the registry.  Captures the dimensions that vary across
 * galaxy-catalog source slots; everything uniform (slot construction,
 * commit body, subscriber side effects) lives in
 * `wireGalaxyCatalogSourceSlot`.
 */
export type GalaxyCatalogSourceConfig = {
  /** Which catalog this slot represents. */
  source: Source;
  /**
   * Lowercase short name used as the slot-name prefix
   * (`sdss-points`, `glade-points`, …) and in upload-log lines.
   */
  shortName: string;
  /**
   * Fetcher used to materialise the slot's request into a GalaxyCatalog.
   * The real surveys + Famous share `galaxyCatalogFetcher` (which
   * dispatches on `req.source` to pick the right .bin URL); Synthetic
   * uses `syntheticPointFetcher` (procedural, ignores `req.tier`).
   */
  fetcher: Fetcher<GalaxyCatalog, GalaxyCatalogReq>;
  /**
   * How this row interacts with the boot-time and tier-change loops.
   * See `GalaxyCatalogSourceCategory` for the per-value semantics.
   */
  category: GalaxyCatalogSourceCategory;
  /**
   * Names of asset slots that live alongside the main `.bin` and must
   * stay in lockstep with it.  The engine fires `.load()` on each
   * listed companion at boot (if the source is visible), on
   * visibility-toggle-on, and on tier change.
   *
   * Pure data: the resolver in `loadCompanionAssets` indexes
   * `state.assetSlots` by the ref string and dispatches a uniform
   * `CompanionAssetReq` — no per-key switch.  Adding a new companion
   * type is one new `GalaxyCatalogCompanionRef` member plus one slot
   * minted on `state.assetSlots` with a matching key.
   */
  companions?: readonly GalaxyCatalogCompanionRef[];
};
