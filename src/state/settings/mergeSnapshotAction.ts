/** The tour's settings restore — see `mergeSettingsSnapshot` for what it guarantees. */

import { createAction } from '@reduxjs/toolkit';

import type { SettingsSnapshot } from '../../@types/engine/settings/SettingsSnapshot';

export const mergeSnapshot = createAction<Partial<SettingsSnapshot>>('settings/mergeSnapshot');
