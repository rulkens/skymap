/**
 * thumbnails — the galaxy-catalog Layer's master gate for the per-galaxy
 * thumbnail quads; both disk passes read it as their `enabled` predicate.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_GALAXY_TEXTURES_ENABLED } from '../../../data/defaults';
import type { ThumbnailsSettings } from '../../../@types/settings/ThumbnailsSettings';

const initialState: ThumbnailsSettings = {
  enabled: DEFAULT_GALAXY_TEXTURES_ENABLED,
};

export const thumbnailsSlice = createSlice({
  name: 'settings/thumbnails',
  reducerPath: 'thumbnails',
  initialState,
  reducers: {
    setThumbnailsEnabled: (thumbnails, action: PayloadAction<boolean>) => {
      thumbnails.enabled = action.payload;
    },
  },
});

export const { setThumbnailsEnabled } = thumbnailsSlice.actions;
