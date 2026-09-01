import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';
import type { AgentWeights } from '../../../@types/AgentWeights';
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
  points: null,
  pointCount: 0,
  nanFillCount: 0,
  weightMode: 'stellarMass',
  packedOverride: null,
  packedSourceName: null,
  packedDropId: 0,
  statusMessage: null,
  catalogBoundsMpc: null,
};

/**
 * The main app's full toggleable galaxy-catalog ladder (GalaxiesSection.tsx),
 * same order. `toggleCatalogSource` re-derives the sources array from this
 * fixed order every time, so clicking GLADE then 2MRS still yields
 * [2MRS, GLADE], never the click order. May legitimately go empty — the
 * zero-point path is a first-class state Viewport surfaces, not something
 * this helper guards against. Also `importParams`'s known-id ladder (S15) —
 * the one spelling of "which sources exist" both the Data-section toggles
 * and the preset validator key off.
 */
export const WORKBENCH_SOURCES: readonly SourceType[] = [
  Source.FamousGalaxy,
  Source.TwoMRS,
  Source.SDSS,
  Source.Glade,
  Source.Milliquas,
  Source.DesiDeep,
  Source.DesiWedge,
  Source.DesiSgw,
];

// Pure array helper, not a slice reducer — it transforms a `sources` array in
// isolation (no `CatalogSlice` in or out), so it stays a plain function the
// UI composes with `setCatalogSources` rather than a case reducer.
export function toggleCatalogSource(
  current: readonly SourceType[],
  s: SourceType,
  on: boolean,
): readonly SourceType[] {
  const enabled = new Set(current);
  if (on) enabled.add(s);
  else enabled.delete(s);
  return WORKBENCH_SOURCES.filter((source) => enabled.has(source));
}

export const catalogSlice = createSlice({
  name: 'catalog',
  initialState: defaultCatalogSlice,
  reducers: {
    setCatalogSources: (state, action: PayloadAction<readonly SourceType[]>) => {
      state.sources = action.payload as Draft<SourceType[]>;
    },
    setCatalogTier: (state, action: PayloadAction<Tier>) => {
      state.tier = action.payload;
    },
    setCatalogLoadStatus: (state, action: PayloadAction<CatalogSlice['loadStatus']>) => {
      state.loadStatus = action.payload;
    },
    /** Viewport's zero-point path sets this after `catalogLoaded` (which just cleared it). */
    setCatalogStatusMessage: (state, action: PayloadAction<string | null>) => {
      state.statusMessage = action.payload;
    },
    /**
     * `watchCatalogSaga`'s completed-load transition: points move INTO catalog
     * state here (Viewport's build path reads `catalog.points`, not a local
     * closure var), and `weights` is the FULL `AgentWeights` the saga already
     * derived — the reducer reads only `nanCount` from it, since `nanCount` is
     * weightMode-invariant (see `deriveAgentWeights`) but the `weights` array
     * itself is not: a later weightMode edit re-derives it at build time
     * without a reload, so persisting the array here would go stale.
     */
    catalogLoaded: (
      state,
      action: PayloadAction<{
        points: CatalogPoints;
        weights: AgentWeights;
        bounds: CatalogSlice['catalogBoundsMpc'];
      }>,
    ) => {
      const { points, weights, bounds } = action.payload;
      state.loadStatus = 'loaded';
      state.points = points as Draft<CatalogPoints>;
      state.pointCount = points.count;
      state.nanFillCount = weights.nanCount;
      state.statusMessage = null;
      state.catalogBoundsMpc = bounds;
    },
    /**
     * Records a failed build (e.g. `planGridBudget`'s over-budget refusal,
     * already naming buffer/bytes/limit) as 'error' PLUS the thrown error's own
     * message routed into `statusMessage`, so App.tsx's status line shows WHAT
     * failed instead of the message dead-ending in the console. No new copy —
     * the caller passes the caught error's `.message` straight through.
     */
    setCatalogBuildError: (state, action: PayloadAction<string>) => {
      state.loadStatus = 'error';
      state.statusMessage = action.payload;
    },
    setWeightMode: (state, action: PayloadAction<CatalogSlice['weightMode']>) => {
      state.weightMode = action.payload;
    },
    /**
     * Installs a dev-dropped packed catalog: sets the override plus its own
     * pointCount/nanFillCount/bounds book-keeping. `watchCatalogSaga` (triggered
     * by this same action, since it's a catalog-identity write) re-resolves from
     * `packedOverride` right after and dispatches `catalogLoaded`, which is what
     * actually populates `catalog.points` for Viewport's build path — the two
     * reducers land on the same numbers because `nanFillCount` doesn't depend on
     * `weightMode` (see `deriveAgentWeights`). `packedDropId` always increments,
     * even on a same-filename re-drop — the rebuild trigger (Viewport's
     * `catalogKey`) needs a value that changes on every install, not just every
     * distinct name.
     */
    setPackedCatalog: (
      state,
      action: PayloadAction<{ points: CatalogPoints; nanFillCount: number; sourceName: string }>,
    ) => {
      const { points, nanFillCount, sourceName } = action.payload;
      const boundsMpc = points.count > 0 ? catalogBounds(points.positions) : null;
      state.loadStatus = 'loaded';
      state.pointCount = points.count;
      state.nanFillCount = nanFillCount;
      state.statusMessage = null;
      state.catalogBoundsMpc = boundsMpc;
      state.packedOverride = points as Draft<CatalogPoints>;
      state.packedSourceName = sourceName;
      state.packedDropId += 1;
    },
  },
});

export const {
  setCatalogSources,
  setCatalogTier,
  setCatalogLoadStatus,
  setCatalogStatusMessage,
  catalogLoaded,
  setCatalogBuildError,
  setWeightMode,
  setPackedCatalog,
} = catalogSlice.actions;
