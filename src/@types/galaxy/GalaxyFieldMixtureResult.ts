/**
 * GalaxyFieldMixtureResult — `buildGalaxyFieldMixture`'s return shape.
 * `spurCloudReservation`/`armCloudReservation` are non-null exactly when
 * that tier reserved GPU-fill slots this build (`spurFlux`/`cloudFlux` > 0).
 * `offset`/`count` locate those placeholders inside `components`, NOT the
 * caller's own buffer index space. `flux` is threaded through (not
 * recomputed) for the GPU passes that fill them. `spurArms` rides the spur
 * reservation because spur roots live nowhere else the GPU pass can reach
 * them; the arm cloud has no equivalent field since `geometry.arms` is
 * already available to any caller holding the geometry.
 */
import type { GalaxyFieldArmRecord } from './GalaxyFieldArmRecord';
import type { GalaxyFieldComponent } from './GalaxyFieldComponent';

export type GalaxyFieldMixtureResult = {
  readonly components: readonly GalaxyFieldComponent[];
  readonly spurCloudReservation: {
    readonly offset: number;
    readonly count: number;
    readonly flux: number;
    readonly spurArms: readonly GalaxyFieldArmRecord[];
  } | null;
  readonly armCloudReservation: {
    readonly offset: number;
    readonly count: number;
    readonly flux: number;
  } | null;
};
