import type { AgentInitMode } from '../../@types/AgentInitMode';
import type { GridBox } from '../../@types/GridBox';
import type { McpmParams } from '../../@types/McpmParams';

/**
 * MCPM_PARAM_KEYS — McpmParams' field list, spelled once. `buildParamsPayload`
 * (below), `emitTraceSidecar`'s `provenance.params`, and `importParams`'
 * validator all key off this array, so the eight fields can never drift
 * between the sidecar and the save/load preset — the plan's "keep the two
 * shapes identical" contract (spec §10).
 */
export const MCPM_PARAM_KEYS: readonly (keyof McpmParams)[] = [
  'senseSpreadDeg',
  'senseDistanceMpc',
  'turnAngleDeg',
  'moveDistanceMpc',
  'depositValue',
  'persistence',
  'sharpness',
  'normalizationFactor',
];

/** A plain-object copy carrying exactly MCPM_PARAM_KEYS — the one place either
 * consumer spells out the params object. */
export function buildParamsPayload(params: McpmParams): McpmParams {
  const payload = {} as Record<keyof McpmParams, number>;
  for (const key of MCPM_PARAM_KEYS) payload[key] = params[key];
  return payload as McpmParams;
}

export const MCPM_PARAMS_FORMAT = 'mcpm-workbench-params';
export const MCPM_PARAMS_VERSION = 1;

export type McpmParamsPreset = {
  readonly format: typeof MCPM_PARAMS_FORMAT;
  readonly version: typeof MCPM_PARAMS_VERSION;
  readonly params: McpmParams;
  readonly agentCount: number;
  readonly initMode: AgentInitMode;
  readonly gridBox: GridBox;
};

/**
 * exportParams — the V3 save-side of the preset pair (spec §10): McpmParams +
 * agent count + init mode + grid box, as pretty JSON ready for
 * `triggerDownload`. `importParams` is the exact inverse.
 */
export function exportParams(input: {
  readonly params: McpmParams;
  readonly agentCount: number;
  readonly initMode: AgentInitMode;
  readonly gridBox: GridBox;
}): string {
  const preset: McpmParamsPreset = {
    format: MCPM_PARAMS_FORMAT,
    version: MCPM_PARAMS_VERSION,
    params: buildParamsPayload(input.params),
    agentCount: input.agentCount,
    initMode: input.initMode,
    gridBox: input.gridBox,
  };
  return JSON.stringify(preset, null, 2);
}
