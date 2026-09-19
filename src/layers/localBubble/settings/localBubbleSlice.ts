/**
 * localBubble — the Local Bubble shell overlay's settings cluster: the
 * master toggle + intensity scale. On by default; the distance window alone
 * keeps the shell invisible outside ~0.6-10 kpc, so there is no source
 * registry entry to read a default off of.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { LocalBubbleSettings } from '../../../@types/settings/LocalBubbleSettings';

const initialState: LocalBubbleSettings = {
  enabled: true,
  intensity: 1,
};

export const localBubbleSlice = createSlice({
  name: 'settings/localBubble',
  reducerPath: 'localBubble',
  initialState,
  reducers: {
    setLocalBubbleEnabled: (localBubble, action: PayloadAction<boolean>) => {
      localBubble.enabled = action.payload;
    },
    setLocalBubbleIntensity: (localBubble, action: PayloadAction<number>) => {
      localBubble.intensity = action.payload;
    },
  },
});

export const { setLocalBubbleEnabled, setLocalBubbleIntensity } = localBubbleSlice.actions;
