/**
 * The settings reducer: the RTK combine, plus the writes no slice can make.
 * A snapshot restore replaces whole clusters at once, and a visibility switch
 * names its cluster by string, so both run ABOVE the combine rather than as a
 * case in each slice.
 */

import type { Action } from '@reduxjs/toolkit';

import { combinedSettingsReducer } from './combinedSettingsReducer';
import { mergeSettingsSnapshot } from './mergeSettingsSnapshot';
import { mergeSnapshot } from './mergeSnapshotAction';
import { setVisibility } from './setVisibilityAction';
import { writeVisibilitySwitch } from './writeVisibilitySwitch';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';

export default function settingsReducer(
  state: EngineSettingsState | undefined,
  action: Action,
): EngineSettingsState {
  const next = combinedSettingsReducer(state, action);
  if (mergeSnapshot.match(action)) return mergeSettingsSnapshot(next, action.payload);
  if (setVisibility.match(action)) return writeVisibilitySwitch(next, action.payload);
  return next;
}
