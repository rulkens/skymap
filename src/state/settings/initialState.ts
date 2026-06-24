/**
 * buildInitialSettings — assemble the engine's boot-time settings literal.
 *
 * Every settings field lives under a named cluster (galaxy-catalog billboard
 * knobs under `galaxyCatalogs`, HDR controls under `tonemap`, etc.). This
 * function is the *assembly* step that composes the per-field defaults from
 * `data/defaults.ts` (mirroring how those constants are defined one place) plus
 * the registry-derived item rows into the single `EngineSettingsState` that the
 * settings slice seeds. The data tier is NOT a settings field — it lives in its
 * own root slice and is seeded separately via the store's `preloadedState`.
 *
 * It lives apart from `createEngine` for two reasons: the boot-defaults shape
 * becomes independently testable (assert every cluster + every derived item row
 * is seeded) without standing up the whole engine, and `createEngine` sheds ~70
 * lines of construction noise. The function is pure and total — it takes no
 * arguments, so there's no ambient default to drift.
 */

import { Source, SOURCE_REGISTRY } from '../../data/sources';
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_SHOW_PICK_BUFFER,
  DEFAULT_SHOW_DISK_RADIUS_RING,
  DEFAULT_LENSING_ENABLED,
  DEFAULT_LENS_STRENGTH,
  DEFAULT_LENS_MODE,
  DEFAULT_EXPOSURE,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
  DEFAULT_MILKY_WAY_ENABLED,
  DEFAULT_MILKY_WAY_LABEL_ENABLED,
  DEFAULT_HIGHLIGHT_FALLBACK,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_REAL_ONLY_MODE,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VOLUMES_ENABLED,
  DEFAULT_FLOW,
} from '../../data/defaults';
import { seedVolumeFields } from '../../data/volume/volumeFieldDefaults';
import { GALAXY_CATALOG_IDS } from '../../data/galaxyCatalog/galaxyCatalogIds';
import { STRUCTURE_IDS } from '../../data/structure/structureIds';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import type { GalaxyCatalogId } from '../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from '../../@types/settings/GalaxyCatalogItemSettings';
import type { StructureId } from '../../@types/data/structure/StructureId';
import type { StructureItemSettings } from '../../@types/settings/StructureItemSettings';

export function buildInitialSettings(): EngineSettingsState {
  return {
    // Galaxy catalog layer: master gate on + shared billboard appearance knobs +
    // one item row per galaxy catalog, each layer + label default-on. Keys are
    // DERIVED from `GALAXY_CATALOG_IDS` so the seed can't drift from the galaxy catalog set.
    // `labelEnabled` is inert for every galaxy catalog except famousGalaxy (the only
    // one that renders a name label) — seeded uniformly true.
    galaxyCatalogs: {
      enabled: true,
      sizePx: DEFAULT_POINT_SIZE_PX,
      brightness: DEFAULT_BRIGHTNESS,
      depthFade: DEFAULT_DEPTH_FADE_ENABLED,
      highlightFallback: DEFAULT_HIGHLIGHT_FALLBACK,
      realOnly: DEFAULT_REAL_ONLY_MODE,
      items: Object.fromEntries(
        GALAXY_CATALOG_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]),
      ) as Record<GalaxyCatalogId, GalaxyCatalogItemSettings>,
    },
    tonemap: {
      exposure: DEFAULT_EXPOSURE,
      curve: DEFAULT_TONE_MAP_CURVE,
    },
    // Bias's user-tunable subset.  Bake-derived fields live on
    // `state.bias` (worker outputs, not settings).  The -19 default is
    // roughly where the SDSS spectroscopic main sample is volume-complete
    // out to the galaxy catalog's flux limit — bright enough that nearly every
    // catalog galaxy has a spectrum, dim enough to keep plenty of structure.
    bias: {
      mode: DEFAULT_BIAS_MODE,
      absMagLimit: DEFAULT_ABS_MAG_LIMIT,
    },
    thumbnails: {
      enabled: DEFAULT_GALAXY_TEXTURES_ENABLED,
    },
    milkyWay: {
      enabled: DEFAULT_MILKY_WAY_ENABLED,
      labelEnabled: DEFAULT_MILKY_WAY_LABEL_ENABLED,
    },
    filaments: {
      enabled: SOURCE_REGISTRY[Source.Filaments].visible,
      intensity: SOURCE_REGISTRY[Source.Filaments].intensity,
    },
    volumes: {
      enabled: DEFAULT_VOLUMES_ENABLED,
      items: seedVolumeFields(),
    },
    // Flow is a singleton overlay layer: all its user-facing state (master
    // gate + look/motion knobs) lives here, spread from the single
    // `DEFAULT_FLOW` seed. Flow has no data-layer store — "loaded" is the asset
    // slot's own `ready` state (`slotReady(assetSlots.flow)`).
    flow: { ...DEFAULT_FLOW },
    debug: {
      showPickBuffer: DEFAULT_SHOW_PICK_BUFFER,
      showDiskRadiusRing: DEFAULT_SHOW_DISK_RADIUS_RING,
      // Empty in production: a developer populates it from the DebugPanel's
      // renderer-toggle section. A fresh record per engine — never persisted.
      disabledPasses: {},
      lensingEnabled: DEFAULT_LENSING_ENABLED,
      lensStrength: DEFAULT_LENS_STRENGTH,
      lensMode: DEFAULT_LENS_MODE,
    },
    // Structure overlay: master gate on + one item row per category, each
    // ring + label default-on. Keys are DERIVED from `STRUCTURE_IDS`
    // so the seed can't drift from the structure-id set (famous galaxies bear no
    // ring and so have no row here).
    structures: {
      enabled: true,
      items: Object.fromEntries(
        STRUCTURE_IDS.map((c) => [c, { enabled: true, labelEnabled: true }]),
      ) as Record<StructureId, StructureItemSettings>,
    },
  };
}
