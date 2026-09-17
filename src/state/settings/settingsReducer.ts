/**
 * The settings reducer: the RTK combine, plus the one write no slice can make.
 * A snapshot restore replaces whole clusters at once, so it runs ABOVE the
 * combine rather than as a case in each of the twenty-two slices.
 */

import type { Action } from '@reduxjs/toolkit';

import { combinedSettingsReducer } from './combinedSettingsReducer';
import { mergeSettingsSnapshot } from './mergeSettingsSnapshot';
import { mergeSnapshot } from './mergeSnapshotAction';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';

export default function settingsReducer(
  state: EngineSettingsState | undefined,
  action: Action,
): EngineSettingsState {
  const next = combinedSettingsReducer(state, action);
  return mergeSnapshot.match(action) ? mergeSettingsSnapshot(next, action.payload) : next;
}
