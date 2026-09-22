/**
 * VolumeSettings — scalar-volume master gate and per-field params. `items` is
 * seeded from `SOURCE_REGISTRY` AT CONSTRUCTION, so the panel can show a
 * field's toggle before its cube lazy-loads.
 */

import type { CosmicWebDensityFieldId } from '../data/volume/CosmicWebDensityFieldId';
import type { VolumeFieldSettings } from './VolumeFieldSettings';

export type CosmicWebDensitySettings = {
  /** False short-circuits both volume passes before any GPU cost. */
  enabled: boolean;
  items: Partial<Record<CosmicWebDensityFieldId, VolumeFieldSettings>>;
};
