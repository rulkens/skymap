import type { CatalogPoints } from '../../../@types/CatalogPoints';
import type { CatalogSlice } from '../../../@types/CatalogSlice';
import type { SourceType } from '../../../../../src/@types/data/SourceType';
import type { Tier } from '../../../../../src/@types/data/Tier';
import { Source } from '../../../../../src/data/source';
import { catalogBounds } from '../../field/catalogBounds';

/**
 * defaultCatalogSlice — SDSS + 2MRS + GLADE at the `medium` tier (spec §10's
 * worked example uses this trio). `small` was the original boot default for
 * a fast first paint, but SDSS ships no `small`-tier bin at all
 * (`tierTargets: { small: 0, ... }`, sources/sdss.ts) — the default trio was
 * silently SDSS-less at boot. `medium` is the smallest tier that actually
 * carries all three; `large` is still an explicit opt-in via the panel.
 */
export const defaultCatalogSlice: CatalogSlice = {
  sources: [Source.SDSS, Source.TwoMRS, Source.Glade],
  tier: 'medium',
  loadStatus: 'idle',
  pointCount: 0,
  nanFillCount: 0,
  weightMode: 'stellarMass',
  packedOverride: null,
  packedSourceName: null,
  packedDropId: 0,
  statusMessage: null,
  catalogBoundsMpc: null,
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

/**
 * Records a completed load: point count, NaN-fill count, bounds, `loadStatus:
 * 'loaded'`, and clears `statusMessage` — a completed load (zero-point
 * included; Viewport calls this on that path too, with `boundsMpc` null)
 * always supersedes whatever status the PREVIOUS load left behind.
 */
export function setCatalogLoaded(
  prev: CatalogSlice,
  pointCount: number,
  nanFillCount: number,
  boundsMpc: CatalogSlice['catalogBoundsMpc'],
): CatalogSlice {
  return {
    ...prev,
    loadStatus: 'loaded',
    pointCount,
    nanFillCount,
    statusMessage: null,
    catalogBoundsMpc: boundsMpc,
  };
}

/** Viewport's zero-point path sets this after `setCatalogLoaded` (which just cleared it). */
export function setCatalogStatusMessage(
  prev: CatalogSlice,
  statusMessage: string | null,
): CatalogSlice {
  return { ...prev, statusMessage };
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
  const boundsMpc = points.count > 0 ? catalogBounds(points.positions) : null;
  return {
    ...setCatalogLoaded(prev, points.count, nanFillCount, boundsMpc),
    packedOverride: points,
    packedSourceName: sourceName,
    packedDropId: prev.packedDropId + 1,
  };
}
