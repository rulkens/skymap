/**
 * makeSettingsFixture — one shared `EngineSettingsState` builder for the
 * settings-store unit tests.
 *
 * Every reducer / selector / store / action test needs a full, type-faithful
 * `EngineSettingsState`. Rather than re-inline the ~30-line literal in each
 * file (where it would drift the moment a cluster gains a field), they all
 * build it here. This IS the engine's boot value (`INITIAL_SETTINGS`) plus
 * overrides, not an independent mirror: each Layer cluster spreads that
 * slice's own production `initialState`, with item rows re-DERIVED from
 * `GALAXY_CATALOG_IDS` / `STAR_CATALOG_IDS` / `BODY_IDS` / `STRUCTURE_IDS`
 * and volume items from a fresh `seedVolumeFields()` call. Deriving the item
 * keys (rather than hand-listing them) means adding a catalog or category
 * can't silently leave the fixture stale.
 *
 * One deliberate divergence from the boot value: every galaxy catalog row is
 * `enabled: true` here, whereas `INITIAL_SETTINGS` derives `enabled` from each
 * registry entry's `visible` field (so default-off catalogs like desiDeep boot
 * disabled). Reducer/selector tests want a uniform all-on baseline they can
 * flip bits off of — a registry-shaped fixture would couple every "toggle X"
 * test to which catalogs happen to ship visible.
 *
 * `overrides` is a shallow top-level merge for the rare test that wants one
 * cluster swapped wholesale; reducer tests generally take the unmodified
 * fixture and assert on the result of the transition.
 */

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
  DEFAULT_BLOOM_ENABLED,
  DEFAULT_BLOOM_STRENGTH,
  DEFAULT_BLOOM_THRESHOLD,
  DEFAULT_EXPOSURE,
  DEFAULT_FOV_DEG,
  DEFAULT_HDR_ENABLED,
  DEFAULT_HDR_KNEE,
  DEFAULT_HDR_HEADROOM,
  DEFAULT_ORIENTATION,
  DEFAULT_TONE_MAP_CURVE,
} from '../../../src/data/defaults';
import { initialState as sgrAStarLensingTuningInitialState } from '../../../src/layers/body/state/sgrAStarLensingTuning/initialState';
import { initialState as orbitTrailsInitialState } from '../../../src/layers/body/state/orbitTrails/initialState';
import { initialState as earthInitialState } from '../../../src/layers/body/state/earth/initialState';
import { initialState as flowInitialState } from '../../../src/layers/flow/state/flow/initialState';
import { initialState as volumesInitialState } from '../../../src/layers/volume/state/volumes/initialState';
import { initialState as milkyWayInitialState } from '../../../src/layers/milkyWay/state/milkyWay/initialState';
import { initialState as zoneOfAvoidanceInitialState } from '../../../src/layers/zoneOfAvoidance/state/zoneOfAvoidance/initialState';
import { initialState as galaxyCatalogsInitialState } from '../../../src/layers/galaxyCatalog/state/galaxyCatalogs/initialState';
import { initialState as biasInitialState } from '../../../src/layers/galaxyCatalog/state/bias/initialState';
import { initialState as thumbnailsInitialState } from '../../../src/layers/galaxyCatalog/state/thumbnails/initialState';
import { initialState as starCatalogsInitialState } from '../../../src/layers/starCatalog/state/starCatalogs/initialState';
import { initialState as filamentsInitialState } from '../../../src/layers/filaments/state/filaments/initialState';
import { initialState as localBubbleInitialState } from '../../../src/layers/localBubble/state/localBubble/initialState';
import { initialState as constellationsInitialState } from '../../../src/layers/constellations/state/constellations/initialState';
import { TERRAIN_PICK_MARKER_DEFAULT_RADIUS_M } from '../../../src/data/debug/terrainPickMarkerSliderFields';
import { DEBUG_OVERLAY_ROWS } from '../../../src/data/debug/debugOverlayRows';

import type { EngineSettingsState } from '../../../src/@types/settings/EngineSettingsState';
import type { DebugOverlayKey } from '../../../src/@types/data/debug/DebugOverlayKey';
import type { GalaxyCatalogId } from '../../../src/@types/data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from '../../../src/@types/settings/GalaxyCatalogItemSettings';
import type { StarCatalogId } from '../../../src/@types/data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from '../../../src/@types/settings/StarCatalogItemSettings';
import type { BodyId } from '../../../src/@types/data/body/BodyId';
import type { BodyItemSettings } from '../../../src/@types/settings/BodyItemSettings';
import type { StructureId } from '../../../src/@types/data/structure/StructureId';
import type { StructureItemSettings } from '../../../src/@types/settings/StructureItemSettings';

export function makeSettingsFixture(
  overrides: Partial<EngineSettingsState> = {},
): EngineSettingsState {
  return {
    orientation: DEFAULT_ORIENTATION,
    camera: {
      fovDeg: DEFAULT_FOV_DEG,
    },
    galaxyCatalogs: {
      ...galaxyCatalogsInitialState,
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
    bias: { ...biasInitialState },
    thumbnails: { ...thumbnailsInitialState },
    milkyWay: { ...milkyWayInitialState },
    zoneOfAvoidance: { ...zoneOfAvoidanceInitialState },
    sgrAStarLensingTuning: { ...sgrAStarLensingTuningInitialState },
    filaments: { ...filamentsInitialState },
    localBubble: { ...localBubbleInitialState },
    constellations: { ...constellationsInitialState },
    orbitTrails: { ...orbitTrailsInitialState },
    earth: { ...earthInitialState },
    starCatalogs: {
      ...starCatalogsInitialState,
      items: Object.fromEntries(
        STAR_CATALOG_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]),
      ) as Record<StarCatalogId, StarCatalogItemSettings>,
    },
    bodies: {
      items: Object.fromEntries(
        BODY_IDS.map((id) => [id, { enabled: true, labelEnabled: true }]),
      ) as Record<BodyId, BodyItemSettings>,
    },
    volumes: { ...volumesInitialState, items: seedVolumeFields() },
    flow: { ...flowInitialState },
    labels: { focusedOnly: false },
    picking: {
      kinds: {
        galaxyCatalog: true,
        structure: true,
        milkyWay: true,
        zoneOfAvoidance: true,
        body: true,
        star: true,
      },
    },
    debug: {
      overlays: Object.fromEntries(DEBUG_OVERLAY_ROWS.map((row) => [row.key, false])) as Record<
        DebugOverlayKey,
        boolean
      >,
      terrainPickMarkerRadiusM: TERRAIN_PICK_MARKER_DEFAULT_RADIUS_M,
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
      items: Object.fromEntries(
        STRUCTURE_IDS.map((c) => [c, { enabled: true, labelEnabled: true }]),
      ) as Record<StructureId, StructureItemSettings>,
    },
    ...overrides,
  };
}
