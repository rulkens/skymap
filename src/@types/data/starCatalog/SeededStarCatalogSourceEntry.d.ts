import type { SourceEntryBase } from '../SourceEntryBase';

/**
 * A star catalog seeded from the body store rather than streamed from disk —
 * the curated famous-star neighbourhood (the hand-picked nearby-star map).
 *
 * The curated twin of the survey-wide Gaia bin: same source type, because both
 * are star catalogs the user toggles as a set and both key
 * `settings.starCatalogs.items`. It carries `binBaseName: null` to say it ships
 * no asset — the same signal `VolumeSourceEntry` uses for its runtime-generated
 * fixtures — and therefore none of the survey row's loader/draw-budget fields.
 * The asset-demand table filters on that null, so a seeded catalog never
 * requests a `.bin` that doesn't exist.
 *
 * Unlike the Gaia bin it DOES bear labels: the map's star names caption the
 * final descent through `foregroundLabelsLayer`.
 */
export type SeededStarCatalogSourceEntry = SourceEntryBase & {
  readonly type: 'starCatalog';
  /** Stable numeric tag; registry key only — not persisted, not packed. */
  readonly code: number;
  /** Always null: this catalog is seeded in code, not loaded from disk. */
  readonly binBaseName: null;
};
