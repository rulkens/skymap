/**
 * Master toggle defaults ON so the overlay renders as soon as a field's
 * cube arrives. `items` carries every shippable field from boot: each
 * source row supplies the look via `buildVolumeFieldSettings`, `enabled` /
 * `intensity` are literals here — the app-state half no row provides.
 */

import { buildVolumeFieldSettings } from '../defaults';
import { MCPM_ENTRY } from '../../sources/mcpm';
import { POLYPHORM_2MRS_ENTRY } from '../../sources/polyphorm-2mrs';
import { MCPM_WORKBENCH_ENTRY } from '../../sources/mcpm-workbench';
import type { CosmicWebDensitySettings } from '../../@types/CosmicWebDensitySettings';

const items: CosmicWebDensitySettings['items'] = {
  mcpm: { ...buildVolumeFieldSettings(MCPM_ENTRY), enabled: true, intensity: 1.0 },
  'polyphorm-2mrs': {
    ...buildVolumeFieldSettings(POLYPHORM_2MRS_ENTRY),
    enabled: false,
    intensity: 1.0,
  },
  // Off pending a promotion decision — see docs/research/mcpm-trace-mass-offset.md.
  'mcpm-workbench': {
    ...buildVolumeFieldSettings(MCPM_WORKBENCH_ENTRY),
    enabled: false,
    intensity: 1.0,
  },
};

export const initialState: CosmicWebDensitySettings = {
  enabled: true,
  items,
};
