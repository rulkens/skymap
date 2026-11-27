import type { AgentInitMode } from '../../@types/sim/AgentInitMode';
import type { GridBox } from '../../@types/grid/GridBox';
import type { McpmParams } from '../../@types/sim/McpmParams';
import type { GalaxyCatalogId } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import { MCPM_PARAMS_FORMAT } from './mcpmParamsFormat.constant';
import { MCPM_PARAMS_VERSION } from './mcpmParamsVersion.constant';
import { buildParamsPayload } from './buildParamsPayload';
import type { McpmParamsPreset } from '../../@types/params/McpmParamsPreset';

/**
 * exportParams — the save side of the params preset: McpmParams +
 * agent count + init mode + grid box + enabled data sources, as pretty
 * JSON ready for `triggerDownload`. `importParams` is the exact inverse.
 * Tier is deliberately NOT saved — restoring it silently from a preset would
 * be surprising.
 */
export function exportParams(input: {
  readonly params: McpmParams;
  readonly agentCount: number;
  readonly initMode: AgentInitMode;
  readonly gridBox: GridBox;
  readonly sources: readonly GalaxyCatalogId[];
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
