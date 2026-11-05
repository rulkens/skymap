import type { GalaxyDescription } from './GalaxyDescription';
import type { GalaxyFieldTuning } from './GalaxyFieldTuning';

export type PlaceArmCloudDispatchInput = {
  readonly seed: number;
  /** This galaxy's own absolute `fieldComps` slot offset — `GalaxyFieldMixtureResult.armCloudReservation.offset`, central-galaxy-only today. */
  readonly offset: number;
  readonly count: number;
  readonly flux: number;
  readonly geometry: GalaxyDescription;
  readonly tuning: GalaxyFieldTuning;
  /**
   * Dead pass-through for `buildClusteredDiscPlacementChild`'s mode 0u/1u
   * `orientationTex` parameter — this shader always dispatches mode 2u,
   * which never samples it (see `placeArmCloud.wesl`'s own doc). Reusing the
   * engine's EXISTING orientation texture costs nothing extra to bind.
   */
  readonly orientationTexture: GPUTexture;
  readonly fieldCompsBuffer: GPUBuffer;
};
