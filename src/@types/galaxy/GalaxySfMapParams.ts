/**
 * GalaxySfMapParams — the shared-contract switch both SF-map generators sit
 * behind: which pipeline writes the map, if any (`'none'` replaces the old
 * separate `enabled` flag — see `GalaxySfMapGeneratorKind`). Deliberately
 * carries NO generator-specific fields — those live in
 * `GalaxySfMapAutomatonParams` (`GalaxyFieldTuning.sfMapAutomaton`) and
 * `GalaxySfMapFluidParams` (`GalaxyFieldTuning.sfMapFluid`), symmetrically
 * named, neither one the unmarked default. `generator` is the ONLY branch
 * point (`createSfMapGenerator.ts`'s dispatcher reads it, nothing else does).
 */
import type { GalaxySfMapGeneratorKind } from './GalaxySfMapGeneratorKind';

export type GalaxySfMapParams = {
  readonly generator: GalaxySfMapGeneratorKind;
};
