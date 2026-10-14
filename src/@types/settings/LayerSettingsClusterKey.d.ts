/**
 * LayerSettingsClusterKey — the name of every settings cluster a Layer slice
 * owns, read off the composed slice tuple's literal `reducerPath`s so a new
 * Layer's cluster joins by being composed in, with no list to edit.
 */

import type { APP_SETTINGS_SLICES } from '../../compositions/appSettingsSlices';

export type LayerSettingsClusterKey = (typeof APP_SETTINGS_SLICES)[number]['reducerPath'];
