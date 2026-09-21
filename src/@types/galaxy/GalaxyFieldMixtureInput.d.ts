import type { GalaxyDescription } from './GalaxyDescription';
import type { GalaxyFieldTuning } from './GalaxyFieldTuning';
import type { GalaxyFieldExtra } from './GalaxyFieldExtra';

/**
 * Everything the mixture/ISM rebuild is a function of. The first three are
 * the galaxy itself; `extras` is the rest of the scene (the component buffers
 * are scene-wide, not per-galaxy — see `fieldPack`); the last three are host
 * render knobs the orientation chain consumes.
 */
export type GalaxyFieldMixtureInput = {
  readonly geometry: GalaxyDescription | null;
  readonly fieldTuning: GalaxyFieldTuning;
  readonly seed: number;
  readonly extras: readonly GalaxyFieldExtra[];
  readonly sigmaDerivTexels: number;
  readonly sigmaIntegTexels: number;
  readonly orientationViewWanted: boolean;
};
