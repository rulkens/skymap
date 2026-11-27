import { createSlice, type Draft, type PayloadAction } from '@reduxjs/toolkit';
import type { AgentWeights } from '../../../@types/catalog/AgentWeights';
import type { CatalogPoints } from '../../../@types/catalog/CatalogPoints';
import type { CatalogSlice } from '../../../@types/catalog/CatalogSlice';
import type { UserCatalog } from '../../../@types/catalog/UserCatalog';
import type { UserCatalogLoad } from '../../../@types/catalog/UserCatalogLoad';
import type { UserFileProvenance } from '../../../@types/catalog/UserFileProvenance';
import type { GalaxyCatalogId } from '../../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import type { Tier } from '../../../../shared/src/@types/data/Tier';

/**
 * defaultCatalogSlice — SDSS + 2MRS + GLADE at the `medium` tier: SDSS ships no
 * `small`-tier bin (`tierTargets: { small: 0, ... }`, sources/sdss.ts), so
 * `medium` is the smallest tier that carries all three.
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
     * routed into `statusMessage`, so the Data sidebar's status line shows WHAT failed
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
