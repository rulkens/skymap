/**
 * galaxyCatalogs — the galaxy-catalog Layer's settings cluster: the shared
 * point-billboard appearance knobs plus one item row per catalog, and the
 * reducers that write them.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { initialState } from './initialState';
import type { GalaxyCatalogId } from '../../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { ProvenanceAxisId } from '../../../../@types/settings/ProvenanceAxisId';
import type { ProvenanceFilter } from '../../../../@types/settings/ProvenanceFilter';

export const galaxyCatalogsSlice = createSlice({
  name: 'settings/galaxyCatalogs',
  reducerPath: 'galaxyCatalogs',
  initialState,
  reducers: {
    setGalaxyCatalogSize: (galaxyCatalogs, action: PayloadAction<number>) => {
      galaxyCatalogs.sizePx = action.payload;
    },
    setBrightness: (galaxyCatalogs, action: PayloadAction<number>) => {
      galaxyCatalogs.brightness = action.payload;
    },
    setDepthFade: (galaxyCatalogs, action: PayloadAction<boolean>) => {
      galaxyCatalogs.depthFade = action.payload;
    },
    // Data-quality provenance axes (orientation / size): each axis's highlight
    // overlay and tri-state filter are independent writers, mirroring how
    // `setGalaxyCatalogVisible` / `setGalaxyCatalogLabelEnabled` each own one
    // axis of a per-item row.
    setProvenanceHighlight: (
      galaxyCatalogs,
      action: PayloadAction<{ axis: ProvenanceAxisId; highlight: boolean }>,
    ) => {
      galaxyCatalogs.provenance[action.payload.axis].highlight = action.payload.highlight;
    },
    setProvenanceFilter: (
      galaxyCatalogs,
      action: PayloadAction<{ axis: ProvenanceAxisId; filter: ProvenanceFilter }>,
    ) => {
      galaxyCatalogs.provenance[action.payload.axis].filter = action.payload.filter;
    },
    // Overall physical-SB → HDR gain, twin of setGalaxyCatalogSize. Rides the
    // points uniform as `galaxySbScale`; the live successor to the old
    // hardcoded `GALAXY_SB_SCALE` shader const.
    setGalaxySbScale: (galaxyCatalogs, action: PayloadAction<number>) => {
      galaxyCatalogs.sbScale = action.payload;
    },
    // Bloom ceiling — the max baked surface-brightness amplitude a compact
    // galaxy can emit. The vertex stage clamps `sbAmp` to it live
    // (`galaxySbMax` uniform), replacing the old bake-time clamp.
    setGalaxySbMax: (galaxyCatalogs, action: PayloadAction<number>) => {
      galaxyCatalogs.sbMax = action.payload;
    },
    // Readability-falloff exponent on the resolved-fraction falloff, gated by
    // the depth-fade toggle. Rides the points uniform as `galaxyFalloffStrength`.
    setGalaxyFalloffStrength: (galaxyCatalogs, action: PayloadAction<number>) => {
      galaxyCatalogs.falloffStrength = action.payload;
    },
    setGalaxyCatalogVisible: (
      galaxyCatalogs,
      action: PayloadAction<{ id: GalaxyCatalogId; enabled: boolean }>,
    ) => {
      galaxyCatalogs.items[action.payload.id].enabled = action.payload.enabled;
    },
    setGalaxyCatalogLabelEnabled: (
      galaxyCatalogs,
      action: PayloadAction<{ id: GalaxyCatalogId; enabled: boolean }>,
    ) => {
      galaxyCatalogs.items[action.payload.id].labelEnabled = action.payload.enabled;
    },
  },
});

export const {
  setGalaxyCatalogSize,
  setBrightness,
  setDepthFade,
  setProvenanceHighlight,
  setProvenanceFilter,
  setGalaxySbScale,
  setGalaxySbMax,
  setGalaxyFalloffStrength,
  setGalaxyCatalogVisible,
  setGalaxyCatalogLabelEnabled,
} = galaxyCatalogsSlice.actions;
