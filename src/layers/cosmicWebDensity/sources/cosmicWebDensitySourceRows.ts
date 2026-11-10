/**
 * The Layer's `sources` field (`Layer.d.ts`'s `Sources` bound): the three
 * rows `compositions/appSources.ts` collects into `APP_SOURCE_REGISTRY` for the cosmic-web density family. The
 * one list slots, asset rows, the visibility entry and both sections map over.
 */

import type { CosmicWebDensitySourceEntry } from '../../../@types/data/volume/CosmicWebDensitySourceEntry';

import { MCPM_ENTRY } from './mcpm';
import { POLYPHORM_2MRS_ENTRY } from './polyphorm-2mrs';
import { MCPM_WORKBENCH_ENTRY } from './mcpm-workbench';

export const COSMIC_WEB_DENSITY_SOURCE_ROWS = [
  MCPM_ENTRY,
  POLYPHORM_2MRS_ENTRY,
  MCPM_WORKBENCH_ENTRY,
] as const satisfies readonly CosmicWebDensitySourceEntry[];
