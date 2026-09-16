/**
 * engineSlice — observable runtime state reported by the engine, stored as a
 * Redux Toolkit slice with inline-Immer case reducers.
 *
 * `CORE_INITIAL` is NOT `EngineSliceState`: the slice does not fold each
 * Layer's facts into its initial value (that would need a runtime import of
 * the composition, closing the D1 module-init cycle the import-boundary
 * ratchet keeps shut). `createLayers` seeds each Layer's key via
 * `layerFactsSeeded` before that Layer's `create` runs, so `factsReported`'s
 * merge below never needs an existence branch — a patch under an unseeded key
 * throws rather than silently minting one.
 *
 * `engineScaleChanged`/`engineBodyDistanceReported` use DEDUP-ON-WRITE:
 * skipping the mutation when the value is unchanged keeps the same Immer
 * draft reference, so a per-frame dispatch during camera movement doesn't
 * re-fire `useSelector` for a stable displayed value.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { engineRoute } from '../../store/constants';
import type { CoreEngineSliceState } from '../../@types/store/CoreEngineSliceState';
import type { EngineStatus } from '../../@types/engine/EngineStatus';
import type { ScaleInfo } from '../../@types/engine/ScaleInfo';
import type { SourceType } from '../../@types/data/SourceType';
import type { StructureId } from '../../@types/data/structure/StructureId';
import type { LoadProgressState } from '../../@types/loading/LoadProgressState';
import type { FamousStarMetaEntry } from '../../@types/loading/FamousStarMetaEntry';
import type { StructureSearchEntry } from '../../@types/engine/StructureSearchEntry';

/**
 * Initial scale-bar value that renders something sensible before the engine
 * fires its first `engineScaleChanged` dispatch.
 */
const INITIAL_SCALE: ScaleInfo = { label: '…', widthPx: 100 };

const CORE_INITIAL: CoreEngineSliceState = {
  status: { kind: 'initializing' },
  scale: INITIAL_SCALE,
  focusedBodyDistanceMpc: null,
  hdrCapable: false,
  sourceCounts: {},
  structureCounts: {},
  loadProgress: null,
  structureSearchList: [],
  meta: { famousStars: [] },
};

const engineSlice = createSlice({
  name: engineRoute,
  initialState: CORE_INITIAL,
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

    // ── structure search index ───────────────────────────────────────────────
    // Whole-array replace, dispatched by `wireStructureProjection` at boot and
    // on every later group change — the same schedule as its counts dispatch.
    engineStructureSearchListChanged: (
      state,
      action: PayloadAction<readonly StructureSearchEntry[]>,
    ) => {
      state.structureSearchList = [...action.payload];
    },

    // ── curated metadata sidecars ────────────────────────────────────────────
    // Whole-array replace, dispatched once per sidecar by its asset slot when
    // the fetch settles — success writes the parsed entries, failure writes `[]`
    // so React's fail-soft paths are reached by the same route as "not loaded
    // yet". The asset slot is the payload's sole writer and this slice is its
    // only home, so React and the engine can never see divergent copies. The
    // spread copies the readonly payload into the Immer draft, which wants a
    // mutable array slot even though nothing mutates it.
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

    // ── Layer facts (D6) ─────────────────────────────────────────────────────
    // No existence branch: `createLayers` seeds a Layer's key via
    // `layerFactsSeeded` before its `create` (the only source of `publish`)
    // runs, so `Object.assign` on an unseeded key throws instead of silently
    // minting one — the extraReducers "unknown key" landmine, refused here.
    factsReported: (
      state,
      action: PayloadAction<{ layer: string; patch: Record<string, unknown> }>,
    ) => {
      const facts = state as unknown as Record<string, Record<string, unknown> | undefined>;
      Object.assign(facts[action.payload.layer]!, action.payload.patch);
    },

    layerFactsSeeded: (
      state,
      action: PayloadAction<{ layer: string; facts: Record<string, unknown> }>,
    ) => {
      (state as unknown as Record<string, unknown>)[action.payload.layer] = action.payload.facts;
    },
  },
});

export const {
  engineStatusChanged,
  engineSourceCountReported,
  engineStructureCountsChanged,
  engineLoadProgressChanged,
  engineStructureSearchListChanged,
  engineFamousStarsMetaReported,
  engineScaleChanged,
  engineBodyDistanceReported,
  engineHdrCapabilityChanged,
  factsReported,
  layerFactsSeeded,
} = engineSlice.actions;

export default engineSlice.reducer;
