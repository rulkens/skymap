/**
 * starCatalogs — the star-catalog Layer's settings cluster: the master gate,
 * the shared star-billboard look knobs, and one item row per catalog, with the
 * case reducers that write them. `liftClusterReducers` re-bases those reducers
 * onto the settings root, so their action type strings stay `settings/<key>`.
 */

import type { PayloadAction } from '@reduxjs/toolkit';

import { SOURCE_ENTRIES } from '../../../data/sourceEntries';
import {
  DEFAULT_STAR_AGGREGATE_INTENSITY_CAP,
  DEFAULT_STAR_BRIGHTNESS,
  DEFAULT_STAR_EXPOSURE_FAR_X,
  DEFAULT_STAR_EXPOSURE_MID_X,
  DEFAULT_STAR_EXPOSURE_NEAR_X,
  DEFAULT_STAR_GLOW_OVERLAP,
  DEFAULT_STAR_SIZE_PX,
} from '../../../data/defaults';
// The "Detail" knob's default is owned by the walk it feeds (single source of
// truth), so seed the setting straight from it rather than restating that number here.
import { DEFAULT_REFINE_THRESHOLD } from '../../../services/gpu/renderers/starCatalog/walkStarOctreeCut';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';
import type { StarCatalogId } from '../../../@types/data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from '../../../@types/settings/StarCatalogItemSettings';
import type { StarCatalogSettings } from '../../../@types/settings/StarCatalogSettings';

// Rows are DERIVED from the star-catalog registry entries (mirroring
// `galaxyCatalogs`), so they can't drift from the star-catalog set, and
// each row's `enabled` comes from that entry's `visible` field —
// SOURCE_REGISTRY stays the single source of truth for default visibility.
// `labelEnabled` starts true for every row: it gates the famous-star map's
// captions on the final descent, and rides inertly on the survey-wide Gaia
// bin (the star renderer draws no per-star names). Per-row "loaded" is the
// asset slot's own readiness — no data-layer store.
const initialState: StarCatalogSettings = {
  enabled: true,
  sizePx: DEFAULT_STAR_SIZE_PX,
  brightness: DEFAULT_STAR_BRIGHTNESS,
  refineThreshold: DEFAULT_REFINE_THRESHOLD,
  glowOverlap: DEFAULT_STAR_GLOW_OVERLAP,
  exposureNearX: DEFAULT_STAR_EXPOSURE_NEAR_X,
  exposureMidX: DEFAULT_STAR_EXPOSURE_MID_X,
  exposureFarX: DEFAULT_STAR_EXPOSURE_FAR_X,
  aggregateIntensityCap: DEFAULT_STAR_AGGREGATE_INTENSITY_CAP,
  items: Object.fromEntries(
    SOURCE_ENTRIES.filter((e) => e.type === 'starCatalog').map((e) => [
      e.id,
      { enabled: e.visible, labelEnabled: true },
    ]),
  ) as Record<StarCatalogId, StarCatalogItemSettings>,
};

export const starCatalogsSettingsFragment = {
  key: 'starCatalogs',
  initialState,
  reducers: {
    // Master gate + per-catalog items, mirroring the galaxy-catalog cluster:
    // `setStarCatalogEnabled` writes the coarse "hide all star catalogs" gate,
    // and the two per-item reducers write one row's visibility / label axis.
    setStarCatalogEnabled: (cluster: StarCatalogSettings, action: PayloadAction<boolean>) => {
      cluster.enabled = action.payload;
    },
    // Shared star-billboard size knob, twin of `setGalaxyCatalogSize`.
    setStarCatalogSize: (cluster: StarCatalogSettings, action: PayloadAction<number>) => {
      cluster.sizePx = action.payload;
    },
    // Shared star-brightness trim, twin of `setBrightness` (1.0 = identity).
    setStarCatalogBrightness: (cluster: StarCatalogSettings, action: PayloadAction<number>) => {
      cluster.brightness = action.payload;
    },
    // The "Detail" knob — CPU octree-cut refine threshold (not a GPU uniform).
    setStarCatalogRefineThreshold: (
      cluster: StarCatalogSettings,
      action: PayloadAction<number>,
    ) => {
      cluster.refineThreshold = action.payload;
    },
    // The "Glow overlap" knob — aggregate glow spread (1.0 = identity).
    setStarCatalogGlowOverlap: (cluster: StarCatalogSettings, action: PayloadAction<number>) => {
      cluster.glowOverlap = action.payload;
    },
    // The "Exposure (near)" knob — absolute display exposure the scale-dependent
    // ramp targets at the near (solar-system) anchor. Fed to `starExposureRamp`.
    setStarCatalogExposureNearX: (cluster: StarCatalogSettings, action: PayloadAction<number>) => {
      cluster.exposureNearX = action.payload;
    },
    // The "Exposure (mid)" knob — absolute display exposure the ramp targets at
    // the middle (few-kpc) anchor. Fed to `starExposureRamp`; bends only the
    // intermediate segment.
    setStarCatalogExposureMidX: (cluster: StarCatalogSettings, action: PayloadAction<number>) => {
      cluster.exposureMidX = action.payload;
    },
    // The "Exposure (far)" knob — absolute display exposure the ramp targets at
    // the far (whole-galaxy) anchor. Fed to `starExposureRamp`.
    setStarCatalogExposureFarX: (cluster: StarCatalogSettings, action: PayloadAction<number>) => {
      cluster.exposureFarX = action.payload;
    },
    // The "Fog cap" knob — ceiling on the per-pixel peak intensity of AGGREGATE
    // glows only (leaves uncapped). Rides the shared GPU uniform; tames the
    // box-filling fog a near sub-threshold aggregate deposits around the Sun.
    setStarCatalogAggregateIntensityCap: (
      cluster: StarCatalogSettings,
      action: PayloadAction<number>,
    ) => {
      cluster.aggregateIntensityCap = action.payload;
    },
    setStarCatalogVisible: (
      cluster: StarCatalogSettings,
      action: PayloadAction<{ id: StarCatalogId; enabled: boolean }>,
    ) => {
      cluster.items[action.payload.id].enabled = action.payload.enabled;
    },
    setStarCatalogLabelEnabled: (
      cluster: StarCatalogSettings,
      action: PayloadAction<{ id: StarCatalogId; enabled: boolean }>,
    ) => {
      cluster.items[action.payload.id].labelEnabled = action.payload.enabled;
    },
  },
} as const satisfies LayerSettingsFragment<'starCatalogs', StarCatalogSettings>;
