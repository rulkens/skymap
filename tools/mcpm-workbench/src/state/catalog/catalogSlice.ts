import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';
import type { AgentWeights } from '../../../@types/AgentWeights';
import type { CatalogPoints } from '../../../@types/CatalogPoints';
import type { CatalogSlice } from '../../../@types/CatalogSlice';
import type { UserCatalog } from '../../../@types/UserCatalog';
import type { UserCatalogLoad } from '../../../@types/UserCatalogLoad';
import type { UserFileProvenance } from '../../../@types/UserFileProvenance';
import type { GalaxyCatalogId } from '../../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import type { Tier } from '../../../../../src/@types/data/Tier';

/**
 * defaultCatalogSlice — SDSS + 2MRS + GLADE at the `medium` tier (spec §10's
 * worked example uses this trio). `small` was the original boot default for
 * a fast first paint, but SDSS ships no `small`-tier bin at all
 * (`tierTargets: { small: 0, ... }`, sources/sdss.ts) — the default trio was
 * silently SDSS-less at boot. `medium` is the smallest tier that actually
 * carries all three; `large` is still an explicit opt-in via the panel.
 */
export const defaultCatalogSlice: CatalogSlice = {
  sources: ['sdss', '2mrs', 'glade'],
  tier: 'medium',
  points: null,
  pointsUserFile: null,
  pointCount: 0,
  nanFillCount: 0,
  weightMode: 'stellarMass',
  userCatalog: null,
  userCatalogOn: false,
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
export const WORKBENCH_SOURCES: readonly GalaxyCatalogId[] = [
  'famousGalaxy',
  '2mrs',
  'sdss',
  'glade',
  'milliquas',
  'desiDeep',
  'desiWedge',
  'desiSgw',
];

// Pure array helper, not a slice reducer — it transforms a `sources` array in
// isolation (no `CatalogSlice` in or out), so it stays a plain function the
// UI composes with `setCatalogSources` rather than a case reducer.
export function toggleCatalogSource(
  current: readonly GalaxyCatalogId[],
  s: GalaxyCatalogId,
  on: boolean,
): readonly GalaxyCatalogId[] {
  const enabled = new Set(current);
  if (on) enabled.add(s);
  else enabled.delete(s);
  return WORKBENCH_SOURCES.filter((source) => enabled.has(source));
}

export const catalogSlice = createSlice({
  name: 'catalog',
  initialState: defaultCatalogSlice,
  reducers: {
    setCatalogSources: (state, action: PayloadAction<readonly GalaxyCatalogId[]>) => {
      state.sources = action.payload as Draft<GalaxyCatalogId[]>;
    },
    setCatalogTier: (state, action: PayloadAction<Tier>) => {
      state.tier = action.payload;
    },
    /** `watchSceneSaga`'s zero-point branch sets this after `catalogLoaded` (which just cleared it). */
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
        userFile: UserFileProvenance | null;
      }>,
    ) => {
      const { points, weights, bounds, userFile } = action.payload;
      state.points = points as Draft<CatalogPoints>;
      state.pointsUserFile = userFile;
      state.pointCount = points.count;
      state.nanFillCount = weights.nanCount;
      state.statusMessage = null;
      state.catalogBoundsMpc = bounds;
    },
    /**
     * Records a failed build (e.g. `planGridBudget`'s over-budget refusal,
     * already naming buffer/bytes/limit): the thrown error's own message
     * routed into `statusMessage`, so App.tsx's status line shows WHAT failed
     * instead of the message dead-ending in the console. No new copy — the
     * caller passes the caught error's `.message` straight through.
     */
    setCatalogBuildError: (state, action: PayloadAction<string>) => {
      state.statusMessage = action.payload;
    },
    setWeightMode: (state, action: PayloadAction<CatalogSlice['weightMode']>) => {
      state.weightMode = action.payload;
    },
    /** Loading a file makes it the only selection; after that everything toggles freely.
     * `fitBounds` is watchCatalogSaga's to apply, beside the load it belongs to. */
    userCatalogLoaded: (state, action: PayloadAction<UserCatalogLoad>) => {
      state.userCatalog = action.payload.catalog as Draft<UserCatalog>;
      state.userCatalogOn = true;
      state.sources = [];
    },
    setUserCatalogOn: (state, action: PayloadAction<boolean>) => {
      state.userCatalogOn = action.payload;
    },
  },
});

export const {
  setCatalogSources,
  setCatalogTier,
  setCatalogStatusMessage,
  catalogLoaded,
  setCatalogBuildError,
  setWeightMode,
  userCatalogLoaded,
  setUserCatalogOn,
} = catalogSlice.actions;
