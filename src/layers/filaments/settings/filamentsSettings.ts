/**
 * filaments — the filament-skeleton overlay Layer's settings cluster: the
 * master toggle + intensity scale, and the case reducers that write them.
 * `liftClusterReducers` re-bases those reducers onto the settings root, so
 * their action type strings stay `settings/<key>`.
 */

import type { PayloadAction } from '@reduxjs/toolkit';

import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import type { FilamentsSettings } from '../../../@types/settings/FilamentsSettings';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';

export const filamentsSettingsFragment = {
  key: 'filaments',
  seed: (): FilamentsSettings => ({
    enabled: SOURCE_REGISTRY[Source.Filaments].visible,
    intensity: SOURCE_REGISTRY[Source.Filaments].intensity,
  }),
  reducers: {
    setFilamentsEnabled: (cluster: FilamentsSettings, action: PayloadAction<boolean>) => {
      cluster.enabled = action.payload;
    },
    setFilamentIntensity: (cluster: FilamentsSettings, action: PayloadAction<number>) => {
      cluster.intensity = action.payload;
    },
  },
} as const satisfies LayerSettingsFragment<'filaments', FilamentsSettings>;
