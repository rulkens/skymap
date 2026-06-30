/**
 * makeSettingsFixture — one shared `EngineSettingsState` builder for the
 * settings-store unit tests.
 *
 * Every reducer / selector / store / action test needs a full, type-faithful
 * `EngineSettingsState`. Rather than re-inline the ~30-line literal in each
 * file (where it would drift the moment a cluster gains a field), they all
 * build it here. The body mirrors the engine's startup construction
 * (`engine.ts` settings literal) so the fixture stays a true shape: defaults
 * from `data/defaults.ts`, item rows DERIVED from `GALAXY_CATALOG_IDS` /
 * `STRUCTURE_IDS`, volume items from `seedVolumeFields()`. Deriving the
 * item keys (rather than hand-listing them) means adding a galaxy catalog or category
 * can't silently leave the fixture stale.
 *
 * `overrides` is a shallow top-level merge for the rare test that wants one
 * cluster swapped wholesale; reducer tests generally take the unmodified
 * fixture and assert on the result of the transition.
 */

import { Source, SOURCE_REGISTRY } from '../../../src/data/sources';
import { GALAXY_CATALOG_IDS } from '../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import { seedVolumeFields } from '../../../src/data/volume/volumeFieldDefaults';
import {
  DEFAULT_ALIGN_SEC,
  DEFAULT_RAMP_SEC,
  DEFAULT_LINGER,
  DEFAULT_SPLINE,
  DEFAULT_TURN_DELAY,
} from '../../../src/services/engine/animation/pathDefaults';
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_EXPOSURE,
  DEFAULT_FLOW,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
  DEFAULT_HIGHLIGHT_FALLBACK,
  DEFAULT_MILKY_WAY_ENABLED,
  DEFAULT_MILKY_WAY_LABEL_ENABLED,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_REAL_ONLY_MODE,
  DEFAULT_SHOW_DISK_RADIUS_RING,
  DEFAULT_SHOW_PICK_BUFFER,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VOLUMES_ENABLED,
} from '../../../src/data/defaults';

import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import type { GalaxyCatalogId } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';
import type { StructureId } from '../../../src/@types/data/structure/StructureId';
import type { GalaxyCatalogItemSettings } from '../../../src/@types/settings/GalaxyCatalogItemSettings';
import type { StructureItemSettings } from '../../../src/@types/settings/StructureItemSettings';

export function makeSettingsFixture(
  overrides: Partial<EngineSettingsState> = {},
): EngineSettingsState {
  return {
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
    tonemap: { exposure: DEFAULT_EXPOSURE, curve: DEFAULT_TONE_MAP_CURVE },
    bias: { mode: DEFAULT_BIAS_MODE, absMagLimit: DEFAULT_ABS_MAG_LIMIT },
    thumbnails: { enabled: DEFAULT_GALAXY_TEXTURES_ENABLED },
    milkyWay: {
      enabled: DEFAULT_MILKY_WAY_ENABLED,
      labelEnabled: DEFAULT_MILKY_WAY_LABEL_ENABLED,
    },
    filaments: {
      enabled: SOURCE_REGISTRY[Source.Filaments].visible,
      intensity: SOURCE_REGISTRY[Source.Filaments].intensity,
    },
    volumes: { enabled: DEFAULT_VOLUMES_ENABLED, items: seedVolumeFields() },
    flow: { ...DEFAULT_FLOW },
    debug: {
      showPickBuffer: DEFAULT_SHOW_PICK_BUFFER,
      showDiskRadiusRing: DEFAULT_SHOW_DISK_RADIUS_RING,
      disabledPasses: {},
      clipPathInspect: {
        clipId: null,
        scrub01: 0,
        align: DEFAULT_ALIGN_SEC,
        rampSec: DEFAULT_RAMP_SEC,
        linger: DEFAULT_LINGER,
        spline: DEFAULT_SPLINE,
        turnDelay: DEFAULT_TURN_DELAY,
        active: {
          align: false,
          rampSec: false,
          linger: false,
          spline: false,
          turnDelay: false,
        },
      },
    },
    structures: {
      enabled: true,
      items: Object.fromEntries(
        STRUCTURE_IDS.map((c) => [c, { enabled: true, labelEnabled: true }]),
      ) as Record<StructureId, StructureItemSettings>,
    },
    ...overrides,
  };
}
