/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): the three
 * rows `SOURCE_REGISTRY` folds in for the cosmic-web density family. The
 * one list slots, asset rows, fade rows and both sections map over.
 */

import type { CosmicWebDensitySourceEntry } from '../../../@types/data/volume/CosmicWebDensitySourceEntry';
import type { SourceType } from '../../../@types/data/SourceType';

import { Source } from '../../../data/source';
import { MCPM_ENTRY } from './mcpm';
import { POLYPHORM_2MRS_ENTRY } from './polyphorm-2mrs';
import { MCPM_WORKBENCH_ENTRY } from './mcpm-workbench';

export const COSMIC_WEB_DENSITY_SOURCE_ROWS = [
  [Source.Mcpm, MCPM_ENTRY],
  [Source.Polyphorm2MRS, POLYPHORM_2MRS_ENTRY],
  [Source.McpmWorkbench, MCPM_WORKBENCH_ENTRY],
] as const satisfies readonly (readonly [SourceType, CosmicWebDensitySourceEntry])[];
