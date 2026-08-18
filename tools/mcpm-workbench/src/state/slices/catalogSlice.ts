import type { CatalogPoints } from '../../../@types/CatalogPoints';
import type { CatalogSlice } from '../../../@types/CatalogSlice';
import type { SourceType } from '../../../../../src/@types/data/SourceType';
import type { Tier } from '../../../../../src/@types/data/Tier';
import { Source } from '../../../../../src/data/source';

/**
 * defaultCatalogSlice — SDSS + 2MRS + GLADE at the `small` tier (spec §10's
 * worked example uses this trio; `small` keeps the workbench's first paint
 * fast — a user reaching for `large` opts in explicitly via the panel).
 */
export const defaultCatalogSlice: CatalogSlice = {
  sources: [Source.SDSS, Source.TwoMRS, Source.Glade],
  tier: 'small',
  loadStatus: 'idle',
  pointCount: 0,
  nanFillCount: 0,
  weightMode: 'stellarMass',
  packedOverride: null,
  packedSourceName: null,
  packedDropId: 0,
};

export function setCatalogSources(
  prev: CatalogSlice,
  sources: readonly SourceType[],
): CatalogSlice {
  return { ...prev, sources };
}

export function setCatalogTier(prev: CatalogSlice, tier: Tier): CatalogSlice {
  return { ...prev, tier };
}

export function setCatalogLoadStatus(
  prev: CatalogSlice,
  loadStatus: CatalogSlice['loadStatus'],
): CatalogSlice {
  return { ...prev, loadStatus };
}

/** Records a completed load: point count, NaN-fill count, and `loadStatus: 'loaded'`. */
export function setCatalogLoaded(
  prev: CatalogSlice,
  pointCount: number,
  nanFillCount: number,
): CatalogSlice {
  return { ...prev, loadStatus: 'loaded', pointCount, nanFillCount };
}

export function setWeightMode(
  prev: CatalogSlice,
  weightMode: CatalogSlice['weightMode'],
): CatalogSlice {
  return { ...prev, weightMode };
}

/**
 * Installs a dev-dropped packed catalog through the exact same completed-load
 * transition (`setCatalogLoaded`) the network path uses, plus the override
 * payload a harness-rebuild consumer reads instead of fetching. `packedDropId`
 * always increments, even on a same-filename re-drop — the rebuild trigger
 * (Viewport's `catalogKey`) needs a value that changes on every install, not
 * just every distinct name.
 */
export function setPackedCatalog(
  prev: CatalogSlice,
  points: CatalogPoints,
  nanFillCount: number,
  sourceName: string,
): CatalogSlice {
  return {
    ...setCatalogLoaded(prev, points.count, nanFillCount),
    packedOverride: points,
    packedSourceName: sourceName,
    packedDropId: prev.packedDropId + 1,
  };
}
