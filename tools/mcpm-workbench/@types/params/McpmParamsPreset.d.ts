import type { AgentInitMode } from '../sim/AgentInitMode';
import type { GridBox } from '../grid/GridBox';
import type { McpmParams } from '../sim/McpmParams';
import type { GalaxyCatalogId } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';
import type { MCPM_PARAMS_FORMAT } from '../../src/params/mcpmParamsFormat.constant';
import type { MCPM_PARAMS_VERSION } from '../../src/params/mcpmParamsVersion.constant';

export type McpmParamsPreset = {
  readonly format: typeof MCPM_PARAMS_FORMAT;
  readonly version: typeof MCPM_PARAMS_VERSION;
  readonly params: McpmParams;
  readonly agentCount: number;
  readonly initMode: AgentInitMode;
  readonly gridBox: GridBox;
  readonly sources: readonly GalaxyCatalogId[];
};
