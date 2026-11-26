import type { AgentInitMode } from '../sim/AgentInitMode';
import type { GridBox } from '../grid/GridBox';
import type { McpmParams } from '../sim/McpmParams';
import type { GalaxyCatalogId } from '../../../../src/layers/galaxyCatalog/@types/GalaxyCatalogId';

export type ImportedParams = {
  readonly params: McpmParams;
  readonly agentCount: number;
  readonly initMode: AgentInitMode;
  readonly gridBox: GridBox;
  /** S15: undefined ⇒ leave the current catalog selection untouched — every preset
   * saved before this field existed (and any preset that simply omits it) must
   * still import cleanly. */
  readonly sources?: readonly GalaxyCatalogId[];
};
