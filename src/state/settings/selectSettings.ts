/**
 * The settings root, lifted out of `RootState`. Every Layer's `selectRoute`
 * composes through this, so the settings route is named exactly once.
 */

import { settingsRoute } from '../../store/constants';
import type { RootState } from '../../store/types';

export const selectSettings = (state: RootState): RootState[typeof settingsRoute] =>
  state[settingsRoute];
