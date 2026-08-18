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
};

export function setSimParam(prev: SimSlice, key: keyof McpmParams, value: number): SimSlice {
  return { ...prev, params: { ...prev.params, [key]: value } };
}

/**
 * setAgentCount — floor-snaps to the nearest LOWER 100k unit, then clamps to
 * [1M, 10M]. Not a rounding convenience: below the unit, `seedAgents`'
 * dispatch-truncation guard (encodeStep.ts) can floor `gridZ` to 0 and
 * silently run nothing, so a fractional unit must never reach the harness.
 */
export function setAgentCount(prev: SimSlice, requested: number): SimSlice {
  const snapped = Math.floor(requested / AGENT_COUNT_STEP) * AGENT_COUNT_STEP;
  const agentCount = Math.min(AGENT_COUNT_MAX, Math.max(AGENT_COUNT_MIN, snapped));
  return { ...prev, agentCount };
}

export function setInitMode(prev: SimSlice, initMode: AgentInitMode): SimSlice {
  return { ...prev, initMode };
}

export function setRunning(prev: SimSlice, running: boolean): SimSlice {
  return { ...prev, running };
}

export function setSeed(prev: SimSlice, seed: number): SimSlice {
  return { ...prev, seed };
}

/** One-shot command: Viewport diffs `resetToken` against the last value it processed. */
export function requestReset(prev: SimSlice): SimSlice {
  return { ...prev, resetToken: prev.resetToken + 1 };
}

/** One-shot command: Viewport diffs `clearTraceToken` the same way. */
export function requestClearTrace(prev: SimSlice): SimSlice {
  return { ...prev, clearTraceToken: prev.clearTraceToken + 1 };
}

/** One-shot command: Viewport diffs `exportToken` the same way, then runs the
 * `.npy`+sidecar download pair (readbackTrace → exportNpy/emitTraceSidecar →
 * triggerDownload) against its own harness/points closure. */
export function requestExport(prev: SimSlice): SimSlice {
  return { ...prev, exportToken: prev.exportToken + 1 };
}

/** Viewport calls this once it has actually reseeded, zeroing the HUD's step counter. */
export function resetStepCount(prev: SimSlice): SimSlice {
  return { ...prev, stepCount: 0 };
}

export function incrementStep(prev: SimSlice): SimSlice {
  return { ...prev, stepCount: prev.stepCount + 1 };
}
