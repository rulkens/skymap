import type { GalaxyDescription } from './GalaxyDescription';
import type { GalaxyFieldArmRecord } from './GalaxyFieldArmRecord';
import type { GalaxyFieldTuning } from './GalaxyFieldTuning';

export type PlaceArmSpurCloudDispatchInput = {
  readonly seed: number;
  /** This galaxy's own absolute `fieldComps` slot offset — `GalaxyFieldMixtureResult.spurCloudReservation.offset`, central-galaxy-only today. */
  readonly offset: number;
  readonly count: number;
  readonly flux: number;
  readonly spurArms: readonly GalaxyFieldArmRecord[];
  readonly geometry: GalaxyDescription;
  readonly tuning: GalaxyFieldTuning;
  readonly fieldCompsBuffer: GPUBuffer;
};
