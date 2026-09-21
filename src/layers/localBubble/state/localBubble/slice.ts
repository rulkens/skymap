/**
 * localBubble — the Local Bubble shell overlay's settings cluster: the
 * master toggle + intensity scale. Off by default for now; when on, the
 * distance window keeps the shell invisible outside ~0.4-10 kpc. No source
 * registry entry to read a default off of.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import type { LocalBubbleSettings } from '../../../../@types/settings/LocalBubbleSettings';

const initialState: LocalBubbleSettings = {
  enabled: false,
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
