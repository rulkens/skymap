/** VolumeFieldLiveness — what a scalar-volume march reads per field once live (`deriveVolumeLiveness`):
 *  clamped settings, opacity, detail region. Null upstream means nothing to draw. */

import type { VolumeFieldSettings } from '../settings/VolumeFieldSettings';
import type { DetailRegionDraw } from './DetailRegionDraw';

export type VolumeFieldLiveness<Id extends string> = {
  readonly settingsOf: (id: Id) => VolumeFieldSettings;
  readonly fadeOpacityOf: (id: Id) => number;
  /** This frame's detail region for the field; null = the base alone. */
  readonly regionOf: (id: Id) => DetailRegionDraw | null;
};
