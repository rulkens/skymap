/**
 * CosmicWebDensitySettings — scalar-volume master gate and per-field params.
 * `items` is a total record over every shippable field, present from boot
 * (the Layer's `initialState` literal), so the panel can show a field's
 * toggle before its cube lazy-loads.
 */

import type { CosmicWebDensityFieldId } from '../../../@types/data/volume/CosmicWebDensityFieldId';
import type { VolumeFieldSettings } from '../../../@types/settings/VolumeFieldSettings';

export type CosmicWebDensitySettings = {
  /** False short-circuits both volume passes before any GPU cost, after its fade-out. */
  enabled: boolean;
  items: Record<CosmicWebDensityFieldId, VolumeFieldSettings>;
};
