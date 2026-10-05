/**
 * VolumeFieldLiveness — the two read closures a scalar-volume raymarch pass
 * needs once liveness is established: `settingsOf` (per-field settings,
 * clamped) and `fadeOpacityOf` (per-field opacity, already folded with the
 * scale-fade bands). Returned by `deriveVolumeLiveness`; `null` upstream of
 * this type means "nothing to draw", so a non-null value is unconditionally
 * live.
 */

import type { VolumeFieldSettings } from '../settings/VolumeFieldSettings';

export type VolumeFieldLiveness<Id extends string> = {
  readonly settingsOf: (id: Id) => VolumeFieldSettings;
  readonly fadeOpacityOf: (id: Id) => number;
};
