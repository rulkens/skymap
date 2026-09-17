/**
 * The settings root, composed by RTK. Imports no root type on purpose:
 * `EngineSettingsState` derives from THIS reducer, so a root-type import here
 * would make that alias reference itself.
 */

import { combineSlices } from '@reduxjs/toolkit';

import { APP_SETTINGS_SLICES } from '../../compositions/appSettingsSlices';
import { CORE_SETTINGS_SLICES } from './coreSettingsSlices';

export const combinedSettingsReducer = combineSlices(
  ...CORE_SETTINGS_SLICES,
  ...APP_SETTINGS_SLICES,
);
