import type { SourceType } from '../../data/SourceType';
import type { Fetcher } from '../../loading/Fetcher';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { GalaxyCatalogReq } from '../../loading/GalaxyCatalogReq';

/**
 * Names of the asset slots that may live alongside a galaxy-catalog
 * `.bin`.  Each value corresponds to a key on `state.assetSlots`.  At
 * boot and on visibility toggle the companion loads via its own
 * `ASSET_WIRING` demand row; on tier change `loadCompanionAssets`
 * reloads it in lockstep with the new-tier bin.
 *
 *   - `famousGalaxiesMeta` — Famous-galaxy meta JSON sidecar
 *                    (tier-agnostic; one load per session).
 */
export type GalaxyCatalogCompanionRef = 'famousGalaxiesMeta';

/**
 * Categorisation of a registry row.  Drives behaviour in the two places
 * that would otherwise hardcode their own per-source lists:
 *
 *  - `survey`    — a large-N tier-fetched catalog (SDSS, 2MRS, GLADE,
 *                  Milliquas, DESI Deep).  Reloads on tier change.  Counts toward
 *                  the "real galaxy catalog ready" signal that gates the
 *                  synthetic-data fallback at boot.
 *  - `curated`   — a hand-picked auxiliary set whose absence is
 *                  acceptable (Famous).  Reloads on tier change but
 *                  does NOT count toward the galaxy-catalog-ready gate.
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
  source: SourceType;
  /**
   * Lowercase short name used as the slot-name prefix
   * (`sdss-points`, `glade-points`, …) and in upload-log lines.
   */
  shortName: string;
  /**
   * Fetcher used to materialise the slot's request into a GalaxyCatalog.
   * The real galaxy catalogs + Famous share `galaxyCatalogFetcher` (which
   * dispatches on `req.source` to pick the right .bin URL); Synthetic
   * uses `syntheticPointFetcher` (procedural, ignores `req.tier`).
   */
  fetcher: Fetcher<GalaxyCatalog, GalaxyCatalogReq>;
  /**
   * How this row interacts with the synthetic-fallback gate and the
   * tier-change loop.  See `GalaxyCatalogSourceCategory` for the
   * per-value semantics.
   */
  category: GalaxyCatalogSourceCategory;
  /**
   * Names of asset slots that live alongside the main `.bin` and must
   * stay in lockstep with it on tier change — `loadCompanionAssets`
   * reloads each when `setTier` re-fetches this row.  (At boot and on
   * visibility toggle the companion loads via its own `ASSET_WIRING`
   * demand row instead.)
   *
   * Pure data: the resolver in `loadCompanionAssets` indexes
   * `state.assetSlots` by the ref string and dispatches a uniform
   * `CompanionAssetReq` — no per-key switch.  Adding a new companion
   * type is one new `GalaxyCatalogCompanionRef` member plus one slot
   * minted on `state.assetSlots` with a matching key.
   */
  companions?: readonly GalaxyCatalogCompanionRef[];
};
