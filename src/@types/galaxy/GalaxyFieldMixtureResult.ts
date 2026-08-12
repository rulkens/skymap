/**
 * GalaxyFieldMixtureResult — `buildGalaxyFieldMixture`'s return shape.
 * `spurCloudReservation`/`armCloudReservation` are non-null exactly when
 * that tier reserved GPU-fill slots this build (`spurFlux`/`cloudFlux` > 0,
 * mirroring the old `buildArmSpurParticleCloud`/`buildArmParticleCloud` call
 * sites' own gates) — `offset`/`count` locate those zero-amplitude
 * placeholders inside `components` (not the caller's own `fieldComps` buffer
 * index space; a caller placing `components` at a non-zero base must add
 * that base itself). `flux` is what `createIsmMapPlaceArmSpurCloud.ts`'s/
 * `createIsmMapPlaceArmCloud.ts`'s GPU passes need to fill them — threaded
 * through rather than recomputed, since it is `armExcessFlux * spurShare`/
 * `armExcessFlux * cloudShare`, a quantity only `pushArmRidges`' own debit
 * math inside this function derives. `spurArms` rides the spur reservation
 * because spur roots (`buildArmSpurs`) live nowhere else the GPU pass can
 * reach them; the arm cloud has no equivalent field — its own arms are
 * `geometry.arms`, already available to any caller holding the geometry.
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
