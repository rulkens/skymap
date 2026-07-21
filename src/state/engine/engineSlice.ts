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
import { CONST_J2000 } from '../../data/time/constJ2000';
import type { EngineSliceState } from '../../@types/store/EngineSliceState';
import type { EngineStatus } from '../../@types/engine/EngineStatus';
import type { ScaleInfo } from '../../@types/engine/ScaleInfo';
import type { TimeReport } from '../../@types/engine/TimeReport';
import type { SourceType } from '../../@types/data/SourceType';
import type { StructureId } from '../../@types/data/structure/StructureId';
import type { LoadProgressState } from '../../@types/loading/LoadProgressState';

/**
 * Initial scale-bar value that renders something sensible before the engine
 * fires its first `engineScaleChanged` dispatch.
 */
const INITIAL_SCALE: ScaleInfo = { label: '…', widthPx: 100 };

/**
 * Initial time report before the engine fires its first `engineTimeReported`.
 * `simDays` is the J2000 epoch (matching the `time` slice's seed anchor) and no
 * body is focused yet.
 */
const INITIAL_TIME_REPORT: TimeReport = { simDays: CONST_J2000, focusedBodyDistanceMpc: null };

const initialState: EngineSliceState = {
  status: { kind: 'initializing' },
  scale: INITIAL_SCALE,
  timeReport: INITIAL_TIME_REPORT,
  sourceCounts: {},
  structureCounts: {},
  loadProgress: null,
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

    // ── sim clock + focused-body distance ────────────────────────────────────
    // DEDUP-ON-WRITE, same rationale as engineScaleChanged: the engine gates
    // this dispatch behind a throttleByTime(~250 ms) in runFrame, but even a few
    // Hz would re-fire the TimeBar / InfoCard subscribers when the reported
    // values are unchanged (a paused/live-idle clock). Skipping the mutation
    // when both fields match returns the same slice reference, so the selector
    // does not re-fire.
    engineTimeReported: (state, action: PayloadAction<TimeReport>) => {
      if (
        state.timeReport.simDays !== action.payload.simDays ||
        state.timeReport.focusedBodyDistanceMpc !== action.payload.focusedBodyDistanceMpc
      ) {
        state.timeReport = action.payload;
      }
    },
  },
});

export const {
  engineStatusChanged,
  engineSourceCountReported,
  engineStructureCountsChanged,
  engineLoadProgressChanged,
  engineScaleChanged,
  engineTimeReported,
} = engineSlice.actions;

export default engineSlice.reducer;
