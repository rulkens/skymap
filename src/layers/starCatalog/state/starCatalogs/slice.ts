/**
 * starCatalogs — the star-catalog Layer's settings cluster: the master gate,
 * the shared star-billboard look knobs, and one item row per catalog, with
 * the reducers that write them.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { StarCatalogId } from '../../../../@types/data/starCatalog/StarCatalogId';

export const starCatalogsSlice = createSlice({
  name: 'settings/starCatalogs',
  reducerPath: 'starCatalogs',
  initialState,
  reducers: {
    // Master gate + per-catalog items, mirroring the galaxy-catalog cluster:
    // `setStarCatalogEnabled` writes the coarse "hide all star catalogs" gate,
    // and the two per-item reducers write one row's visibility / label axis.
    setStarCatalogEnabled: (starCatalogs, action: PayloadAction<boolean>) => {
      starCatalogs.enabled = action.payload;
    },
    // Shared star-billboard size knob, twin of `setGalaxyCatalogSize`.
    setStarCatalogSize: (starCatalogs, action: PayloadAction<number>) => {
      starCatalogs.sizePx = action.payload;
    },
    // Shared star-brightness trim, twin of `setBrightness` (1.0 = identity).
    setStarCatalogBrightness: (starCatalogs, action: PayloadAction<number>) => {
      starCatalogs.brightness = action.payload;
    },
    // The "Detail" knob — CPU octree-cut refine threshold (not a GPU uniform).
    setStarCatalogRefineThreshold: (starCatalogs, action: PayloadAction<number>) => {
      starCatalogs.refineThreshold = action.payload;
    },
    // The "Glow overlap" knob — aggregate glow spread (1.0 = identity).
    setStarCatalogGlowOverlap: (starCatalogs, action: PayloadAction<number>) => {
      starCatalogs.glowOverlap = action.payload;
    },
    // The "Exposure (near)" knob — absolute display exposure the scale-dependent
    // ramp targets at the near (solar-system) anchor. Fed to `starExposureRamp`.
    setStarCatalogExposureNearX: (starCatalogs, action: PayloadAction<number>) => {
      starCatalogs.exposureNearX = action.payload;
    },
    // The "Exposure (mid)" knob — absolute display exposure the ramp targets at
    // the middle (few-kpc) anchor. Fed to `starExposureRamp`; bends only the
    // intermediate segment.
    setStarCatalogExposureMidX: (starCatalogs, action: PayloadAction<number>) => {
      starCatalogs.exposureMidX = action.payload;
    },
    // The "Exposure (far)" knob — absolute display exposure the ramp targets at
    // the far (whole-galaxy) anchor. Fed to `starExposureRamp`.
    setStarCatalogExposureFarX: (starCatalogs, action: PayloadAction<number>) => {
      starCatalogs.exposureFarX = action.payload;
    },
    // The "Fog cap" knob — ceiling on the per-pixel peak intensity of AGGREGATE
    // glows only (leaves uncapped). Rides the shared GPU uniform; tames the
    // box-filling fog a near sub-threshold aggregate deposits around the Sun.
    setStarCatalogAggregateIntensityCap: (starCatalogs, action: PayloadAction<number>) => {
      starCatalogs.aggregateIntensityCap = action.payload;
    },
    setStarCatalogVisible: (
      starCatalogs,
      action: PayloadAction<{ id: StarCatalogId; enabled: boolean }>,
    ) => {
      starCatalogs.items[action.payload.id].enabled = action.payload.enabled;
    },
    setStarCatalogLabelEnabled: (
      starCatalogs,
      action: PayloadAction<{ id: StarCatalogId; enabled: boolean }>,
    ) => {
      starCatalogs.items[action.payload.id].labelEnabled = action.payload.enabled;
    },
  },
});

export const {
  setStarCatalogEnabled,
  setStarCatalogSize,
  setStarCatalogBrightness,
  setStarCatalogRefineThreshold,
  setStarCatalogGlowOverlap,
  setStarCatalogExposureNearX,
  setStarCatalogExposureMidX,
  setStarCatalogExposureFarX,
  setStarCatalogAggregateIntensityCap,
  setStarCatalogVisible,
  setStarCatalogLabelEnabled,
} = starCatalogsSlice.actions;
