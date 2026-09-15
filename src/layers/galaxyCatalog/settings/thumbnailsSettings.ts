/**
 * thumbnails — the galaxy-catalog Layer's master gate for the per-galaxy
 * thumbnail quads; both disk passes read it as their `enabled` predicate.
 */

import type { PayloadAction } from '@reduxjs/toolkit';

import { DEFAULT_GALAXY_TEXTURES_ENABLED } from '../../../data/defaults';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';
import type { ThumbnailsSettings } from '../../../@types/settings/ThumbnailsSettings';

const initialState: ThumbnailsSettings = {
  enabled: DEFAULT_GALAXY_TEXTURES_ENABLED,
};

export const thumbnailsSettingsFragment = {
  key: 'thumbnails',
  initialState,
  reducers: {
    setThumbnailsEnabled: (cluster: ThumbnailsSettings, action: PayloadAction<boolean>) => {
      cluster.enabled = action.payload;
    },
  },
} as const satisfies LayerSettingsFragment<'thumbnails', ThumbnailsSettings>;
