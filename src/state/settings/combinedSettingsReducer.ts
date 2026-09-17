/**
 * The settings root. Imports no root type on purpose: `EngineSettingsState`
 * derives from THIS reducer, so such an import makes that alias self-reference.
 */

import { combineSlices } from '@reduxjs/toolkit';

import { APP_SETTINGS_SLICES } from '../../compositions/appSettingsSlices';
import { CORE_SETTINGS_SLICES } from './coreSettingsSlices';

export const combinedSettingsReducer = combineSlices(
  ...CORE_SETTINGS_SLICES,
  ...APP_SETTINGS_SLICES,
);
