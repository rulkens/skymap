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
    /** Viewport calls this once it has actually reseeded, zeroing the HUD's step counter. */
    resetStepCount: (state) => {
      state.stepCount = 0;
    },
    incrementStep: (state) => {
      state.stepCount += 1;
    },
  },
});

export const {
  setSimParam,
  setAgentCount,
  setInitMode,
  setRunning,
  setSeed,
  resetStepCount,
  incrementStep,
} = simSlice.actions;
