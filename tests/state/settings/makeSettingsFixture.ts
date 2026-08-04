/**
 * makeSettingsFixture — one shared `EngineSettingsState` builder for the
 * settings-store unit tests.
 *
 * Every reducer / selector / store / action test needs a full, type-faithful
 * `EngineSettingsState`. Rather than re-inline the ~30-line literal in each
 * file (where it would drift the moment a cluster gains a field), they all
 * build it here. The body mirrors the engine's startup construction
 * (`buildInitialSettings`) so the fixture stays a true shape: defaults
 * from `data/defaults.ts`, item rows DERIVED from `GALAXY_CATALOG_IDS` /
 * `STAR_CATALOG_IDS` / `BODY_IDS` / `STRUCTURE_IDS`, volume items from
 * `seedVolumeFields()`.
 * Deriving the item keys (rather than hand-listing them) means adding a
 * catalog or category can't silently leave the fixture stale.
 *
 * One deliberate divergence from the boot seed: every galaxy catalog row is
 * `enabled: true` here, whereas the real seed derives `enabled` from each
 * registry entry's `visible` field (so default-off catalogs like desiDeep boot
 * disabled). Reducer/selector tests want a uniform all-on baseline they can
 * flip bits off of — a registry-shaped fixture would couple every "toggle X"
 * test to which catalogs happen to ship visible.
 *
 * `overrides` is a shallow top-level merge for the rare test that wants one
 * cluster swapped wholesale; reducer tests generally take the unmodified
 * fixture and assert on the result of the transition.
 */

import { Source, SOURCE_REGISTRY } from '../../../src/data/sources';
import { GALAXY_CATALOG_IDS } from '../../../src/data/galaxyCatalog/galaxyCatalogIds';
import { STAR_CATALOG_IDS } from '../../../src/data/starCatalog/starCatalogIds';
import { BODY_IDS } from '../../../src/data/bodies/bodyIds';
import { STRUCTURE_IDS } from '../../../src/data/structure/structureIds';
import { seedVolumeFields } from '../../../src/data/volume/volumeFieldDefaults';
import {
  DEFAULT_ALIGN_SEC,
  DEFAULT_RAMP_SEC,
  DEFAULT_LINGER,
  DEFAULT_LINGER_SEC,
  DEFAULT_SPLINE,
  DEFAULT_TURN_DELAY,
  DEFAULT_LOOK_AHEAD,
  DEFAULT_PASS_BY_OFFSET,
  DEFAULT_PASS_BY_DIR,
} from '../../../src/services/engine/animation/pathDefaults';
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_BIAS_MODE,
  DEFAULT_BLOOM_ENABLED,
  DEFAULT_BLOOM_STRENGTH,
  DEFAULT_BLOOM_THRESHOLD,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_EXPOSURE,
  DEFAULT_HDR_ENABLED,
  DEFAULT_HDR_KNEE,
  DEFAULT_HDR_HEADROOM,
  DEFAULT_FLOW,
  DEFAULT_GALAXY_FALLOFF_STRENGTH,
  DEFAULT_GALAXY_PROVENANCE,
  DEFAULT_GALAXY_SB_MAX,
  DEFAULT_GALAXY_SB_SCALE,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
  DEFAULT_ORIENTATION,
  DEFAULT_MILKY_WAY_ENABLED,
  DEFAULT_MILKY_WAY_LABEL_ENABLED,
  DEFAULT_ORBIT_TRAILS_ENABLED,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_SHOW_DISK_RADIUS_RING,
  DEFAULT_SHOW_ORBIT_TRAIL_IMPOSTOR,
  DEFAULT_SHOW_PICK_BUFFER,
  DEFAULT_STAR_BRIGHTNESS,
  DEFAULT_STAR_GLOW_OVERLAP,
  DEFAULT_STAR_EXPOSURE_NEAR_X,
  DEFAULT_STAR_EXPOSURE_MID_X,
  DEFAULT_STAR_EXPOSURE_FAR_X,
  DEFAULT_STAR_AGGREGATE_INTENSITY_CAP,
  DEFAULT_STAR_SIZE_PX,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VOLUMES_ENABLED,
} from '../../../src/data/defaults';
import { DEFAULT_REFINE_THRESHOLD } from '../../../src/services/gpu/renderers/starCatalog/walkStarOctreeCut';
import { MILKY_WAY_TUNING_DEFAULTS } from '../../../src/services/engine/galaxyGenerator/v1/milkyWayCalibration';
import { ATMOSPHERE_PARAMS } from '../../../src/data/bodies/atmosphereParams';
import { EARTH_SURFACE_PARAMS } from '../../../src/data/bodies/earthSurfaceParams';

import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import type { GalaxyCatalogId } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';
import type { StructureId } from '../../../src/@types/data/structure/StructureId';
import type { GalaxyCatalogItemSettings } from '../../../src/@types/settings/GalaxyCatalogItemSettings';
import type { StarCatalogId } from '../../../src/@types/data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from '../../../src/@types/settings/StarCatalogItemSettings';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { BodyItemSettings } from '../../../src/@types/settings/BodyItemSettings';
import type { StructureItemSettings } from '../../../src/@types/settings/StructureItemSettings';

export function makeSettingsFixture(
  overrides: Partial<EngineSettingsState> = {},
): EngineSettingsState {
  return {
    orientation: DEFAULT_ORIENTATION,
    galaxyCatalogs: {
      enabled: true,
      sizePx: DEFAULT_POINT_SIZE_PX,
      brightness: DEFAULT_BRIGHTNESS,
      depthFade: DEFAULT_DEPTH_FADE_ENABLED,
      provenance: DEFAULT_GALAXY_PROVENANCE,
      sbScale: DEFAULT_GALAXY_SB_SCALE,
      sbMax: DEFAULT_GALAXY_SB_MAX,
      falloffStrength: DEFAULT_GALAXY_FALLOFF_STRENGTH,
      items: Object.fromEntries(
        GALAXY_CATALOG_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]),
      ) as Record<GalaxyCatalogId, GalaxyCatalogItemSettings>,
    },
    tonemap: {
      exposure: DEFAULT_EXPOSURE,
      curve: DEFAULT_TONE_MAP_CURVE,
    },
    hdr: {
      enabled: DEFAULT_HDR_ENABLED,
      knee: DEFAULT_HDR_KNEE,
      headroom: DEFAULT_HDR_HEADROOM,
    },
    bloom: {
      enabled: DEFAULT_BLOOM_ENABLED,
      strength: DEFAULT_BLOOM_STRENGTH,
      threshold: DEFAULT_BLOOM_THRESHOLD,
    },
    bias: { mode: DEFAULT_BIAS_MODE, absMagLimit: DEFAULT_ABS_MAG_LIMIT },
    thumbnails: { enabled: DEFAULT_GALAXY_TEXTURES_ENABLED },
    milkyWay: {
      enabled: DEFAULT_MILKY_WAY_ENABLED,
      labelEnabled: DEFAULT_MILKY_WAY_LABEL_ENABLED,
      ...MILKY_WAY_TUNING_DEFAULTS,
    },
    filaments: {
      enabled: SOURCE_REGISTRY[Source.Filaments].visible,
      intensity: SOURCE_REGISTRY[Source.Filaments].intensity,
    },
    constellations: {
      enabled: SOURCE_REGISTRY[Source.Constellations].visible,
      intensity: SOURCE_REGISTRY[Source.Constellations].intensity,
    },
    orbitTrails: { enabled: DEFAULT_ORBIT_TRAILS_ENABLED },
    earth: {
      // `earth` is a definitional row in the atmosphere table, so the indexed
      // read is non-null (see `initialState.ts` — the index signature widens it).
      atmosphereExposure: ATMOSPHERE_PARAMS.earth!.exposure,
      ambientLight: EARTH_SURFACE_PARAMS.ambientLight,
      oceanRoughness: EARTH_SURFACE_PARAMS.oceanRoughness,
    },
    starCatalogs: {
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
        STAR_CATALOG_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]),
      ) as Record<StarCatalogId, StarCatalogItemSettings>,
    },
    bodies: {
      items: Object.fromEntries(
        BODY_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]),
      ) as Record<BodyId, BodyItemSettings>,
    },
    volumes: { enabled: DEFAULT_VOLUMES_ENABLED, items: seedVolumeFields() },
    flow: { ...DEFAULT_FLOW },
    labels: { focusedOnly: false },
    debug: {
      showPickBuffer: DEFAULT_SHOW_PICK_BUFFER,
      showDiskRadiusRing: DEFAULT_SHOW_DISK_RADIUS_RING,
      showOrbitTrailImpostor: DEFAULT_SHOW_ORBIT_TRAIL_IMPOSTOR,
      disabledPasses: {},
      renderStrategy: 'auto',
      clipPathInspect: {
        clipId: null,
        scrub01: 0,
        align: DEFAULT_ALIGN_SEC,
        rampSec: DEFAULT_RAMP_SEC,
        linger: DEFAULT_LINGER,
        lingerSec: DEFAULT_LINGER_SEC,
        spline: DEFAULT_SPLINE,
        turnDelay: DEFAULT_TURN_DELAY,
        lookAhead: DEFAULT_LOOK_AHEAD,
        passByOffset: DEFAULT_PASS_BY_OFFSET,
        passByDir: DEFAULT_PASS_BY_DIR,
        active: {
          align: false,
          rampSec: false,
          linger: false,
          spline: false,
          passBy: false,
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
