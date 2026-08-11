/**
 * GalaxyFieldMixtureResult — `buildGalaxyFieldMixture`'s return shape.
 * `spurCloudReservation` is non-null exactly when the spur-cloud tier
 * reserved GPU-fill slots this build (`spurFlux > 0`, mirroring the old
 * `buildArmSpurParticleCloud` call's own gate) — `offset`/`count` locate
 * those zero-amplitude placeholders inside `components` (not the caller's
 * own `fieldComps` buffer index space; a caller placing `components` at a
 * non-zero base must add that base itself). `flux` and `spurArms` are what
 * `createIsmMapPlaceArmSpurCloud.ts`'s GPU pass needs to fill them —
 * threaded through rather than recomputed, since `flux` is
 * `armExcessFlux * spurShare`, a quantity only `pushArmRidges`' own debit
 * math inside this function derives.
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
};
