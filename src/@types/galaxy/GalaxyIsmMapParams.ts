/**
 * GalaxyIsmMapParams — the shared-contract switch both ISM-map generators sit
 * behind: which pipeline writes the map, if any (`'none'` replaces the old
 * separate `enabled` flag — see `GalaxyIsmMapGeneratorKind`). Deliberately
 * carries NO generator-specific fields — those live in
 * `GalaxyIsmMapAutomatonParams` (`GalaxyFieldTuning.ismMapAutomaton`) and
 * `GalaxyIsmMapFluidParams` (`GalaxyFieldTuning.ismMapFluid`), symmetrically
 * named, neither one the unmarked default. `generator` is the ONLY branch
 * point (`createIsmMapGenerator.ts`'s dispatcher reads it, nothing else does).
 */
import type { GalaxyIsmMapGeneratorKind } from './GalaxyIsmMapGeneratorKind';

export type GalaxyIsmMapParams = {
  readonly generator: GalaxyIsmMapGeneratorKind;
};
