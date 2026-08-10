/**
 * GalaxyIsmMapParams — the shared-contract switch the ISM-map generator sits
 * behind: whether the fluid pipeline writes the map at all (`'none'`
 * replaces the old separate `enabled` flag — see `GalaxyIsmMapGeneratorKind`).
 * Deliberately carries NO generator-specific fields — those live in
 * `GalaxyIsmMapFluidParams` (`GalaxyFieldTuning.ismMapFluid`). `generator` is
 * the ONLY branch point (`createIsmMapGenerator.ts`'s dispatcher reads it,
 * nothing else does).
 */
import type { GalaxyIsmMapGeneratorKind } from './GalaxyIsmMapGeneratorKind';

export type GalaxyIsmMapParams = {
  readonly generator: GalaxyIsmMapGeneratorKind;
};
