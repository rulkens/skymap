/**
 * VolumeFieldLiveness — the three read closures a scalar-volume raymarch pass
 * needs once liveness is established: `settingsOf` (per-field settings,
 * clamped), `fadeOpacityOf` (per-field opacity) and `regionOf` (per-field detail region).
 * Returned by `deriveVolumeLiveness`; `null` upstream of this type means "nothing to draw", so a
 * non-null value is unconditionally live.
 */

import type { VolumeFieldSettings } from '../settings/VolumeFieldSettings';
import type { DetailRegionDraw } from './DetailRegionDraw';

export type VolumeFieldLiveness<Id extends string> = {
  readonly settingsOf: (id: Id) => VolumeFieldSettings;
  readonly fadeOpacityOf: (id: Id) => number;
  /** This frame's detail region for the field; null = the base alone. */
  readonly regionOf: (id: Id) => DetailRegionDraw | null;
};
