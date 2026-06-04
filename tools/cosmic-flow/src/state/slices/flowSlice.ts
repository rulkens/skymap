/**
 * flowSlice — per-mode flow defaults + the mode/param reducers.
 *
 * The advect and streamline param objects are pinned to the values hand-dialled
 * in the spike; they are the look, so do not "tidy" them. Default mode is
 * streamline (the more striking integrated-curve look).
 *
 * `setFlowMode` swaps only `mode`, preserving BOTH param objects by reference so
 * a downstream shallow compare on either mode sees no change. `setFlowParam`
 * updates a single key of ONE mode: it spreads a fresh object for the targeted
 * mode and leaves the other mode's object referentially identical, so the
 * inactive mode never looks dirty.
 */
import type { FlowSlice } from '../../../@types/state/slices/FlowSlice';
import type { FlowMode } from '../../../@types/state/slices/FlowMode';
import type { FlowModeParams } from '../../../@types/state/slices/FlowModeParams';

export const defaultFlowSlice: FlowSlice = {
  mode: 'streamline',
  advect: {
    count: 40000,
    flowSpeed: 0.06,
    densityBias: 1,
    wander: 0.15,
    trail: 0.003,
    size: 0.0012,
    exposure: 0.3,
    contrast: 2.3,
  },
  streamline: {
    count: 40000,
    flowSpeed: 0.49,
    densityBias: 1,
    wander: 0,
    trail: 0.013,
    size: 0.001,
    exposure: 0.22,
    contrast: 3,
  },
};

export function setFlowMode(prev: FlowSlice, mode: FlowMode): FlowSlice {
  return { ...prev, mode };
}

export function setFlowParam(
  prev: FlowSlice,
  mode: FlowMode,
  key: keyof FlowModeParams,
  value: number,
): FlowSlice {
  return { ...prev, [mode]: { ...prev[mode], [key]: value } };
}
