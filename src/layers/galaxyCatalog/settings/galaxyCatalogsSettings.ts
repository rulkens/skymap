/**
 * galaxyCatalogs — the galaxy-catalog Layer's settings cluster: the shared
 * point-billboard appearance knobs plus one item row per catalog, and the case
 * reducers that write them. `liftClusterReducers` re-bases those reducers onto
 * the settings root, so their action type strings stay `settings/<key>`.
 */

import type { PayloadAction } from '@reduxjs/toolkit';

import { SOURCE_ENTRIES } from '../../../data/sourceEntries';
import {
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_GALAXY_FALLOFF_STRENGTH,
  DEFAULT_GALAXY_PROVENANCE,
  DEFAULT_GALAXY_SB_MAX,
  DEFAULT_GALAXY_SB_SCALE,
  DEFAULT_POINT_SIZE_PX,
} from '../../../data/defaults';
import type { GalaxyCatalogId } from '../../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from '../../../@types/settings/GalaxyCatalogItemSettings';
import type { GalaxyCatalogSettings } from '../../../@types/settings/GalaxyCatalogSettings';
import type { LayerSettingsFragment } from '../../../@types/settings/LayerSettingsFragment';
import type { ProvenanceAxisId } from '../../../@types/settings/ProvenanceAxisId';
import type { ProvenanceFilter } from '../../../@types/settings/ProvenanceFilter';

export const galaxyCatalogsSettingsFragment = {
  key: 'galaxyCatalogs',
  // Rows are DERIVED from the galaxy-catalog registry entries so the seed can't
  // drift from the galaxy catalog set — and, critically, each row's `enabled` is
  // seeded from that entry's `visible` field, making SOURCE_REGISTRY the single
  // source of truth for default visibility. The alternative — hardcoding
  // `enabled: true` — silently overrode a registry entry that asked to boot
  // hidden (DesiDeep's `visible: false`), so a default-off source came up drawn
  // anyway; seeding from `visible` closes that gap. `labelEnabled` is inert for
  // every galaxy catalog except famousGalaxy (the only one that renders a name
  // label) — seeded uniformly true.
  seed: (): GalaxyCatalogSettings => ({
    sizePx: DEFAULT_POINT_SIZE_PX,
    brightness: DEFAULT_BRIGHTNESS,
    depthFade: DEFAULT_DEPTH_FADE_ENABLED,
    provenance: DEFAULT_GALAXY_PROVENANCE,
    sbScale: DEFAULT_GALAXY_SB_SCALE,
    sbMax: DEFAULT_GALAXY_SB_MAX,
    falloffStrength: DEFAULT_GALAXY_FALLOFF_STRENGTH,
    items: Object.fromEntries(
      SOURCE_ENTRIES.filter((e) => e.type === 'galaxyCatalog').map((e) => [
        e.id,
        { enabled: e.visible, labelEnabled: true },
      ]),
    ) as Record<GalaxyCatalogId, GalaxyCatalogItemSettings>,
  }),
  reducers: {
    setGalaxyCatalogSize: (cluster: GalaxyCatalogSettings, action: PayloadAction<number>) => {
      cluster.sizePx = action.payload;
    },
    setBrightness: (cluster: GalaxyCatalogSettings, action: PayloadAction<number>) => {
      cluster.brightness = action.payload;
    },
    setDepthFade: (cluster: GalaxyCatalogSettings, action: PayloadAction<boolean>) => {
      cluster.depthFade = action.payload;
    },
    // Data-quality provenance axes (orientation / size): each axis's highlight
    // overlay and tri-state filter are independent writers, mirroring how
    // `setGalaxyCatalogVisible` / `setGalaxyCatalogLabelEnabled` each own one
    // axis of a per-item row.
    setProvenanceHighlight: (
      cluster: GalaxyCatalogSettings,
      action: PayloadAction<{ axis: ProvenanceAxisId; highlight: boolean }>,
    ) => {
      cluster.provenance[action.payload.axis].highlight = action.payload.highlight;
    },
    setProvenanceFilter: (
      cluster: GalaxyCatalogSettings,
      action: PayloadAction<{ axis: ProvenanceAxisId; filter: ProvenanceFilter }>,
    ) => {
      cluster.provenance[action.payload.axis].filter = action.payload.filter;
    },
    // Overall physical-SB → HDR gain, twin of setGalaxyCatalogSize. Rides the
    // points uniform as `galaxySbScale`; the live successor to the old
    // hardcoded `GALAXY_SB_SCALE` shader const.
    setGalaxySbScale: (cluster: GalaxyCatalogSettings, action: PayloadAction<number>) => {
      cluster.sbScale = action.payload;
    },
    // Bloom ceiling — the max baked surface-brightness amplitude a compact
    // galaxy can emit. The vertex stage clamps `sbAmp` to it live
    // (`galaxySbMax` uniform), replacing the old bake-time clamp.
    setGalaxySbMax: (cluster: GalaxyCatalogSettings, action: PayloadAction<number>) => {
      cluster.sbMax = action.payload;
    },
    // Readability-falloff exponent on the resolved-fraction falloff, gated by
    // the depth-fade toggle. Rides the points uniform as `galaxyFalloffStrength`.
    setGalaxyFalloffStrength: (cluster: GalaxyCatalogSettings, action: PayloadAction<number>) => {
      cluster.falloffStrength = action.payload;
    },
    setGalaxyCatalogVisible: (
      cluster: GalaxyCatalogSettings,
      action: PayloadAction<{ id: GalaxyCatalogId; enabled: boolean }>,
    ) => {
      cluster.items[action.payload.id].enabled = action.payload.enabled;
    },
    setGalaxyCatalogLabelEnabled: (
      cluster: GalaxyCatalogSettings,
      action: PayloadAction<{ id: GalaxyCatalogId; enabled: boolean }>,
    ) => {
      cluster.items[action.payload.id].labelEnabled = action.payload.enabled;
    },
  },
} as const satisfies LayerSettingsFragment<'galaxyCatalogs', GalaxyCatalogSettings>;
