/**
 * thumbnails — the galaxy-catalog Layer's master gate for the per-galaxy
 * thumbnail quads; both disk passes read it as their `enabled` predicate.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';

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
