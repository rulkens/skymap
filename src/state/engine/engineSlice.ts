/**
 * engineSlice — observable runtime state reported by the engine, stored as a
 * Redux Toolkit slice with inline-Immer case reducers.
 *
 * The engine is a non-React, non-Redux imperative module: it owns the WebGPU
 * device, the per-frame render loop, and all catalog loading. The alternative
 * to a Redux slice would be React `useState` slots fed by per-event engine
 * callbacks (the old model), which worked
 * fine for a handful of independent flags but fractured the observable surface
 * across multiple unrelated `useState` slots — each one a separate re-render
 * trigger with its own staleness window. Moving the engine's emitted state into
 * a single Redux slice gives every subscriber (React UI, tour sagas, keyboard
 * shortcuts) a consistent snapshot addressable via selectors, without any
 * additional prop-threading.
 *
 * `engineScaleChanged` uses DEDUP-ON-WRITE: it only assigns when either scalar
 * field changes. The engine dispatches this action every frame during camera
 * movement (Task 3), so without the guard every autorotate frame would produce
 * a new `scale` object reference, re-firing `useSelector(selectScale)` in the
 * ScaleBar even when the displayed label hasn't changed. The guard is modelled
 * on `setIfChanged` in `selectionSlice.ts`, specialised to the two `ScaleInfo`
 * primitive fields rather than a generic shallowEqual over ref objects.
 *
 * `engineSourceCountReported` accumulates: each call writes one source's count
 * without disturbing the others. The engine reports counts one source at a time
 * as each catalog finishes loading; accumulation in the reducer mirrors the old
 * `setSourceCounts((p) => ({ ...p, [source]: count }))` functional-updater
 * pattern from `useEngine.ts` without the stale-closure risk.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { engineRoute } from '../../store/constants';
import type { EngineSliceState } from '../../@types/store/EngineSliceState';
import type { EngineStatus } from '../../@types/engine/EngineStatus';
import type { ScaleInfo } from '../../@types/engine/ScaleInfo';
import type { SourceType } from '../../@types/data/SourceType';
import type { StructureId } from '../../@types/data/structure/StructureId';
import type { LoadProgressState } from '../../@types/loading/LoadProgressState';
import type { ProvenanceCounts } from '../../@types/engine/ProvenanceCounts';
import type { FamousGalaxyMetaEntry } from '../../@types/loading/FamousGalaxyMetaEntry';
import type { FamousStarMetaEntry } from '../../@types/loading/FamousStarMetaEntry';

/**
 * Initial scale-bar value that renders something sensible before the engine
 * fires its first `engineScaleChanged` dispatch.
 */
const INITIAL_SCALE: ScaleInfo = { label: '…', widthPx: 100 };

const initialState: EngineSliceState = {
  status: { kind: 'initializing' },
  scale: INITIAL_SCALE,
  focusedBodyDistanceMpc: null,
  hdrCapable: false,
  sourceCounts: {},
  structureCounts: {},
  provenanceCounts: {},
  loadProgress: null,
  meta: { famousGalaxies: [], famousStars: [] },
};

const engineSlice = createSlice({
  name: engineRoute,
  initialState,
  reducers: {
    // ── lifecycle ────────────────────────────────────────────────────────────
    engineStatusChanged: (state, action: PayloadAction<EngineStatus>) => {
      state.status = action.payload;
    },

    // ── per-source galaxy count ──────────────────────────────────────────────
    // Accumulate one source at a time — the engine reports counts as each
    // catalog finishes loading, not in a single batch.
    engineSourceCountReported: (
      state,
      action: PayloadAction<{ source: SourceType; count: number }>,
    ) => {
      state.sourceCounts[action.payload.source] = action.payload.count;
    },

    // ── per-source provenance counts ─────────────────────────────────────────
    // A SEPARATE action from `engineSourceCountReported`, not a wider payload
    // on it: three sagas `take` that action as a bare "a catalog landed"
    // pulse, keyed on nothing but its dispatch. Folding the provenance tally
    // into that payload would braid a debug-panel readout into a
    // load-completion signal those sagas have no reason to depend on.
    engineProvenanceCountsReported: (
      state,
      action: PayloadAction<{ source: SourceType; counts: ProvenanceCounts }>,
    ) => {
      state.provenanceCounts[action.payload.source] = action.payload.counts;
    },

    // ── per-structure counts ─────────────────────────────────────────────────
    // Whole-map replace: structure counts are computed once per source load,
    // not incrementally per structure.
    engineStructureCountsChanged: (
      state,
      action: PayloadAction<Partial<Record<StructureId, number>>>,
    ) => {
      state.structureCounts = action.payload;
    },

    // ── load progress ────────────────────────────────────────────────────────
    engineLoadProgressChanged: (state, action: PayloadAction<LoadProgressState | null>) => {
      state.loadProgress = action.payload;
    },

    // ── curated metadata sidecars ────────────────────────────────────────────
    // Whole-array replace, dispatched once per sidecar by its asset slot when
    // the fetch settles — success writes the parsed entries, failure writes `[]`
    // so React's fail-soft paths are reached by the same route as "not loaded
    // yet". The asset slot is the payload's sole writer and this slice is its
    // only home, so React and the engine can never see divergent copies. The
    // spread copies the readonly payload into the Immer draft, which wants a
    // mutable array slot even though nothing mutates it.
    engineFamousGalaxiesMetaReported: (
      state,
      action: PayloadAction<readonly FamousGalaxyMetaEntry[]>,
    ) => {
      state.meta.famousGalaxies = [...action.payload];
    },

    engineFamousStarsMetaReported: (
      state,
      action: PayloadAction<readonly FamousStarMetaEntry[]>,
    ) => {
      state.meta.famousStars = [...action.payload];
    },

    // ── scale bar ────────────────────────────────────────────────────────────
    // DEDUP-ON-WRITE: skip the mutation when both scalar fields are unchanged.
    // Without this guard, every autorotate frame would produce a new `scale`
    // object reference and re-fire useSelector(selectScale) in the ScaleBar
    // even when the displayed label is stable. When we skip the mutation Immer
    // returns the same slice reference, so the selector does not re-fire.
    engineScaleChanged: (state, action: PayloadAction<ScaleInfo>) => {
      if (
        state.scale.label !== action.payload.label ||
        state.scale.widthPx !== action.payload.widthPx
      ) {
        state.scale = action.payload;
      }
    },

    // ── focused-body distance ─────────────────────────────────────────────────
    // DEDUP-ON-WRITE, same rationale as engineScaleChanged: the engine gates
    // this dispatch behind a throttleByTime(~250 ms) in runFrame, but even a few
    // Hz would re-fire the InfoCard subscriber when the reported distance is
    // unchanged (a focused body at rest, or no focus). Skipping the mutation
    // when the value matches returns the same slice reference, so the selector
    // does not re-fire.
    engineBodyDistanceReported: (state, action: PayloadAction<number | null>) => {
      if (state.focusedBodyDistanceMpc !== action.payload) {
        state.focusedBodyDistanceMpc = action.payload;
      }
    },

    // ── HDR display capability ───────────────────────────────────────────────
    // Live, not a boot snapshot: `initGpu`'s matchMedia `change` listener
    // (`watchHdrCapability` in `device.ts`) re-dispatches this whenever the
    // active display's `(dynamic-range: high)` verdict changes — e.g. the
    // window moves to an SDR monitor — so the Settings → Display HDR section
    // can disable itself the moment the browser says so.
    engineHdrCapabilityChanged: (state, action: PayloadAction<boolean>) => {
      state.hdrCapable = action.payload;
    },
  },
});

export const {
  engineStatusChanged,
  engineSourceCountReported,
  engineProvenanceCountsReported,
  engineStructureCountsChanged,
  engineLoadProgressChanged,
  engineFamousGalaxiesMetaReported,
  engineFamousStarsMetaReported,
  engineScaleChanged,
  engineBodyDistanceReported,
  engineHdrCapabilityChanged,
} = engineSlice.actions;

export default engineSlice.reducer;
