/**
 * Master toggle defaults ON so the overlay renders as soon as a field's
 * cube arrives. `items` carries every shippable field from boot: the
 * registry's `buildVolumeFieldSettings` supplies the look, `enabled` /
 * `intensity` are literals here — the app-state half no row provides.
 */

import { buildVolumeFieldSettings } from '../../../../data/volume/volumeFieldDefaults';
import type { CosmicWebDensitySettings } from '../../../../@types/settings/CosmicWebDensitySettings';

const items: CosmicWebDensitySettings['items'] = {
  mcpm: { ...buildVolumeFieldSettings('mcpm'), enabled: true, intensity: 1.0 },
  'polyphorm-2mrs': {
    ...buildVolumeFieldSettings('polyphorm-2mrs'),
    enabled: false,
    intensity: 1.0,
  },
  // Off pending a promotion decision — see docs/research/mcpm-trace-mass-offset.md.
  'mcpm-workbench': {
    ...buildVolumeFieldSettings('mcpm-workbench'),
    enabled: false,
    intensity: 1.0,
  },
};

export const initialState: CosmicWebDensitySettings = {
  enabled: true,
  items,
};
