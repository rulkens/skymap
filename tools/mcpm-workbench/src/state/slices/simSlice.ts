import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import type { SimSlice } from '../../../@types/SimSlice';
import type { AgentInitMode } from '../../../@types/AgentInitMode';
import type { McpmParams } from '../../../@types/McpmParams';
import { AGENT_COUNT_STEP } from '../../sim/seedAgents';

/** 1M–10M, in the same 100k unit `seedAgents`/`encodeStep`'s dispatch truncation enforces. */
export const AGENT_COUNT_MIN = 10 * AGENT_COUNT_STEP;
export const AGENT_COUNT_MAX = 100 * AGENT_COUNT_STEP;

/** The SDSS-VAC preset (spec §10) — the starting point for every slider. */
const DEFAULT_MCPM_PARAMS: McpmParams = {
  senseSpreadDeg: 20,
  senseDistanceMpc: 4.6,
  turnAngleDeg: 10,
  moveDistanceMpc: 0.1,
  depositValue: 0,
  persistence: 0.8,
  sharpness: 2.5,
  normalizationFactor: 1.0,
};

export const defaultSimSlice: SimSlice = {
  params: DEFAULT_MCPM_PARAMS,
  agentCount: AGENT_COUNT_MIN,
  initMode: 'aroundData',
  running: true,
  stepCount: 0,
  seed: 1,
  resetToken: 0,
  clearTraceToken: 0,
  exportToken: 0,
  scfdToken: 0,
};

export const simSlice = createSlice({
  name: 'sim',
  initialState: defaultSimSlice,
  reducers: {
    setSimParam: (state, action: PayloadAction<{ key: keyof McpmParams; value: number }>) => {
      state.params[action.payload.key] = action.payload.value;
    },
    /**
     * setAgentCount — floor-snaps to the nearest LOWER 100k unit, then clamps to
     * [1M, 10M]. Not a rounding convenience: below the unit, `seedAgents`'
     * dispatch-truncation guard (encodeStep.ts) can floor `gridZ` to 0 and
     * silently run nothing, so a fractional unit must never reach the harness.
     */
    setAgentCount: (state, action: PayloadAction<number>) => {
      const snapped = Math.floor(action.payload / AGENT_COUNT_STEP) * AGENT_COUNT_STEP;
      state.agentCount = Math.min(AGENT_COUNT_MAX, Math.max(AGENT_COUNT_MIN, snapped));
    },
    setInitMode: (state, action: PayloadAction<AgentInitMode>) => {
      state.initMode = action.payload;
    },
    setRunning: (state, action: PayloadAction<boolean>) => {
      state.running = action.payload;
    },
    setSeed: (state, action: PayloadAction<number>) => {
      state.seed = action.payload;
    },
    /** One-shot command: Viewport diffs `resetToken` against the last value it processed. */
    requestReset: (state) => {
      state.resetToken += 1;
    },
    /** One-shot command: Viewport diffs `clearTraceToken` the same way. */
    requestClearTrace: (state) => {
      state.clearTraceToken += 1;
    },
    /** One-shot command: Viewport diffs `exportToken` the same way, then runs the
     * `.npy`+sidecar download pair (readbackTrace → exportNpy/emitTraceSidecar →
     * triggerDownload) against its own harness/points closure. */
    requestExport: (state) => {
      state.exportToken += 1;
    },
    /** One-shot command: Viewport diffs `scfdToken` the same way, then runs the
     * `.scfd` download (readbackTrace → widenTrace → exportScfd → triggerDownload)
     * against its own harness/points closure. */
    requestScfdExport: (state) => {
      state.scfdToken += 1;
    },
    /** Viewport calls this once it has actually reseeded, zeroing the HUD's step counter. */
    resetStepCount: (state) => {
      state.stepCount = 0;
    },
    incrementStep: (state) => {
      state.stepCount += 1;
    },
  },
});

// transitional wrapper — deleted when call sites move to dispatch (Task 3)
export function setSimParam(prev: SimSlice, key: keyof McpmParams, value: number): SimSlice {
  return simSlice.reducer(prev, simSlice.actions.setSimParam({ key, value }));
}

// transitional wrapper — deleted when call sites move to dispatch (Task 3)
export function setAgentCount(prev: SimSlice, agentCount: number): SimSlice {
  return simSlice.reducer(prev, simSlice.actions.setAgentCount(agentCount));
}

// transitional wrapper — deleted when call sites move to dispatch (Task 3)
export function setInitMode(prev: SimSlice, initMode: AgentInitMode): SimSlice {
  return simSlice.reducer(prev, simSlice.actions.setInitMode(initMode));
}

// transitional wrapper — deleted when call sites move to dispatch (Task 3)
export function setRunning(prev: SimSlice, running: boolean): SimSlice {
  return simSlice.reducer(prev, simSlice.actions.setRunning(running));
}

// transitional wrapper — deleted when call sites move to dispatch (Task 3)
export function setSeed(prev: SimSlice, seed: number): SimSlice {
  return simSlice.reducer(prev, simSlice.actions.setSeed(seed));
}

// transitional wrapper — deleted when call sites move to dispatch (Task 3)
export function requestReset(prev: SimSlice): SimSlice {
  return simSlice.reducer(prev, simSlice.actions.requestReset());
}

// transitional wrapper — deleted when call sites move to dispatch (Task 3)
export function requestClearTrace(prev: SimSlice): SimSlice {
  return simSlice.reducer(prev, simSlice.actions.requestClearTrace());
}

// transitional wrapper — deleted when call sites move to dispatch (Task 3)
export function requestExport(prev: SimSlice): SimSlice {
  return simSlice.reducer(prev, simSlice.actions.requestExport());
}

// transitional wrapper — deleted when call sites move to dispatch (Task 3)
export function requestScfdExport(prev: SimSlice): SimSlice {
  return simSlice.reducer(prev, simSlice.actions.requestScfdExport());
}

// transitional wrapper — deleted when call sites move to dispatch (Task 3)
export function resetStepCount(prev: SimSlice): SimSlice {
  return simSlice.reducer(prev, simSlice.actions.resetStepCount());
}

// transitional wrapper — deleted when call sites move to dispatch (Task 3)
export function incrementStep(prev: SimSlice): SimSlice {
  return simSlice.reducer(prev, simSlice.actions.incrementStep());
}
