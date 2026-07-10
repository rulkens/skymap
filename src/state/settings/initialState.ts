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
import { SOURCE_ENTRIES } from '../../data/sourceEntries';
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_SHOW_PICK_BUFFER,
  DEFAULT_QUAD_BILLBOARDS,
  DEFAULT_SHOW_DISK_RADIUS_RING,
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
} from '../../services/engine/animation/pathDefaults';
import { seedVolumeFields } from '../../data/volume/volumeFieldDefaults';
import { STRUCTURE_IDS } from '../../data/structure/structureIds';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import type { GalaxyCatalogId } from '../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from '../../@types/settings/GalaxyCatalogItemSettings';
import type { StructureId } from '../../@types/data/structure/StructureId';
import type { StructureItemSettings } from '../../@types/settings/StructureItemSettings';

export function buildInitialSettings(): EngineSettingsState {
  return {
    // Galaxy catalog layer: master gate on + shared billboard appearance knobs +
    // one item row per galaxy catalog. Rows are DERIVED from the galaxy-catalog
    // registry entries so the seed can't drift from the galaxy catalog set — and,
    // critically, each row's `enabled` is seeded from that entry's `visible`
    // field, making SOURCE_REGISTRY the single source of truth for default
    // visibility. The alternative — hardcoding `enabled: true` — silently
    // overrode a registry entry that asked to boot hidden (DesiDeep's
    // `visible: false`), so a default-off source came up drawn anyway; seeding
    // from `visible` closes that gap. `labelEnabled` is inert for every galaxy
    // catalog except famousGalaxy (the only one that renders a name label) —
    // seeded uniformly true.
    galaxyCatalogs: {
      enabled: true,
      sizePx: DEFAULT_POINT_SIZE_PX,
      brightness: DEFAULT_BRIGHTNESS,
      depthFade: DEFAULT_DEPTH_FADE_ENABLED,
      highlightFallback: DEFAULT_HIGHLIGHT_FALLBACK,
      realOnly: DEFAULT_REAL_ONLY_MODE,
      items: Object.fromEntries(
        SOURCE_ENTRIES.filter((e) => e.type === 'galaxyCatalog').map((e) => [
          e.id,
          { enabled: e.visible, labelEnabled: true },
        ]),
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
    // Cross-cutting label presentation: default OFF — all enabled labels draw.
    // The guided tour flips focusedOnly on (and its snapshot restores it).
    labels: { focusedOnly: false },
    debug: {
      showPickBuffer: DEFAULT_SHOW_PICK_BUFFER,
      quadBillboards: DEFAULT_QUAD_BILLBOARDS,
      showDiskRadiusRing: DEFAULT_SHOW_DISK_RADIUS_RING,
      // Empty in production: a developer populates it from the DebugPanel's
      // renderer-toggle section. A fresh record per engine — never persisted.
      disabledPasses: {},
      // Clip-path inspector idle: no clip chosen, scrubber at the start. The
      // overlay stays quiet until the curator clicks "Calculate". The pacing
      // knobs seed from the flyPath defaults but every override is INACTIVE, so a
      // fresh Calculate previews the clip's own authored pacing until the curator
      // touches a slider (which activates just that knob).
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
