/**
 * VolumeSettings — scalar-volume master gate and per-field params. `items` is
 * seeded from `SOURCE_REGISTRY` AT CONSTRUCTION, so the panel can show a
 * field's toggle before its cube lazy-loads.
 */

import type { VolumeFieldId } from '../data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from './VolumeFieldSettings';

export type VolumeSettings = {
  /** False short-circuits both volume passes before any GPU cost. */
  enabled: boolean;
  items: Partial<Record<VolumeFieldId, VolumeFieldSettings>>;
};
