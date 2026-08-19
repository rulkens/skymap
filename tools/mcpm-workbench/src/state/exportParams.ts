import type { AgentInitMode } from '../../@types/AgentInitMode';
import type { GridBox } from '../../@types/GridBox';
import type { McpmParams } from '../../@types/McpmParams';
import type { SourceType } from '../../../../src/@types/data/SourceType';

/**
 * MCPM_PARAM_KEYS — McpmParams' field list, derived from a `Record<keyof McpmParams, …>`
 * instead of a hand-spelled array: the sentinel below must cover every `McpmParams` key or TS
 * errors, so a field added to `McpmParams` is a compile error here (and, independently, at
 * ControlsPanel.tsx's `PARAM_SLIDER_SPECS` Record) until it's accounted for — the same
 * exhaustiveness `DEFAULT_MCPM_PARAMS` already gets for free. `buildParamsPayload` (below),
 * `emitTraceSidecar`'s `provenance.params`, and `importParams`'s validator all key off the
 * resulting array, so the eight fields can never drift between the sidecar and the save/load
 * preset — the plan's "keep the two shapes identical" contract (spec §10).
 */
const MCPM_PARAM_KEY_SENTINEL: Record<keyof McpmParams, true> = {
  senseSpreadDeg: true,
  senseDistanceMpc: true,
  turnAngleDeg: true,
  moveDistanceMpc: true,
  depositValue: true,
  persistence: true,
  sharpness: true,
  normalizationFactor: true,
};

export const MCPM_PARAM_KEYS: readonly (keyof McpmParams)[] = Object.keys(
  MCPM_PARAM_KEY_SENTINEL,
) as (keyof McpmParams)[];

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
  readonly sources: readonly SourceType[];
};

/**
 * exportParams — the V3 save-side of the preset pair (spec §10): McpmParams +
 * agent count + init mode + grid box + enabled data sources (S15), as pretty
 * JSON ready for `triggerDownload`. `importParams` is the exact inverse.
 * Tier is deliberately NOT saved — restoring it silently from a preset would
 * be surprising (coordinator ruling, task-S15-brief.md).
 */
export function exportParams(input: {
  readonly params: McpmParams;
  readonly agentCount: number;
  readonly initMode: AgentInitMode;
  readonly gridBox: GridBox;
  readonly sources: readonly SourceType[];
}): string {
  const preset: McpmParamsPreset = {
    format: MCPM_PARAMS_FORMAT,
    version: MCPM_PARAMS_VERSION,
    params: buildParamsPayload(input.params),
    agentCount: input.agentCount,
    initMode: input.initMode,
    gridBox: input.gridBox,
    sources: input.sources,
  };
  return JSON.stringify(preset, null, 2);
}
