/**
 * Engine selectors — the single read seam for the RTK engine slice, scoped
 * through `RootState`.
 *
 * One module, not one-file-per-selector: this is the spec's explicit override
 * of the repo's one-function-per-file rule, so the whole engine read surface
 * lives in one place that call sites import from.
 *
 * The shape mirrors the ui selectors' base + leaf pattern:
 *
 *  - `selectEngine` is the private base selector — it lifts the engine slice
 *    out of `RootState` via `state[engineRoute]`, naming the route exactly
 *    once. Every leaf composes through it.
 *  - The leaf selectors are plain composed arrows. These are all primitive or
 *    object-reference reads; `useSelector`'s reference-equality check already
 *    bails out on identical values, so wrapping them in `createSelector` would
 *    add a memo layer that buys nothing.
 *
 * Every selector is `RootState`-scoped so the same function works unchanged on
 * BOTH the React side (`useAppSelector(selectX)`) and the engine side
 * (`selectX(store.getState())`). No react-redux import here — `src/state/` is
 * framework-agnostic.
 */

import { engineRoute } from '../../store/constants';
import type { RootState } from '../../store/types';
import type { EngineSliceState } from '../../@types/store/EngineSliceState';
import type { EngineStatus } from '../../@types/engine/EngineStatus';
import type { ScaleInfo } from '../../@types/engine/ScaleInfo';
import type { SourceType } from '../../@types/data/SourceType';
import type { StructureId } from '../../@types/data/structure/StructureId';
import type { LoadProgressState } from '../../@types/loading/LoadProgressState';
import type { ProvenanceCounts } from '../../@types/engine/ProvenanceCounts';
import type { FamousGalaxyMetaEntry } from '../../@types/loading/FamousGalaxyMetaEntry';
import type { FamousStarMetaEntry } from '../../@types/loading/FamousStarMetaEntry';

const selectEngine = (state: RootState): EngineSliceState => state[engineRoute];

export const selectEngineStatus = (state: RootState): EngineStatus => selectEngine(state).status;

export const selectScale = (state: RootState): ScaleInfo => selectEngine(state).scale;

export const selectSourceCounts = (state: RootState): Partial<Record<SourceType, number>> =>
  selectEngine(state).sourceCounts;

export const selectStructureCounts = (state: RootState): Partial<Record<StructureId, number>> =>
  selectEngine(state).structureCounts;

export const selectProvenanceCounts = (
  state: RootState,
): Partial<Record<SourceType, ProvenanceCounts>> => selectEngine(state).provenanceCounts;

export const selectLoadProgress = (state: RootState): LoadProgressState | null =>
  selectEngine(state).loadProgress;

/**
 * Famous-galaxy metadata sidecar, empty until its asset slot settles (and after
 * a failed fetch). An object-reference read: the slot dispatches once, so the
 * array identity is stable and a subscriber sees a single change.
 */
export const selectFamousGalaxiesMeta = (state: RootState): readonly FamousGalaxyMetaEntry[] =>
  selectEngine(state).meta.famousGalaxies;

/**
 * Famous-star metadata sidecar, on the same contract as
 * `selectFamousGalaxiesMeta`.
 */
export const selectFamousStarsMeta = (state: RootState): readonly FamousStarMetaEntry[] =>
  selectEngine(state).meta.famousStars;

/**
 * Live distance (Mpc) from the camera to the focused scene body, or null when no
 * body is focused. A primitive read, so `useSelector`'s reference-equality check
 * bails when the throttled `engineBodyDistanceReported` pub republishes an
 * unchanged distance — the InfoCard live-distance row re-renders only when the
 * number actually moves.
 */
export const selectFocusedBodyDistanceMpc = (state: RootState): number | null =>
  selectEngine(state).focusedBodyDistanceMpc;

/**
 * Live display capability — true when the ACTIVE display currently reports
 * more than SDR range. Updated by `engineHdrCapabilityChanged`, both at boot
 * and on a later `matchMedia` `change` (see `device.ts`'s `watchHdrCapability`),
 * so a monitor swap mid-session is observable, not just the boot snapshot.
 */
export const selectHdrCapable = (state: RootState): boolean => selectEngine(state).hdrCapable;
