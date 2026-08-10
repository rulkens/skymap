/**
 * buildInitialSettings — assemble the engine's boot-time settings literal.
 *
 * Composes the per-field defaults from `data/defaults.ts` plus the
 * registry-derived item rows into the single `EngineSettingsState` the
 * settings slice seeds. The data tier is NOT a settings field — it lives in
 * its own root slice, seeded separately via the store's `preloadedState`.
 *
 * Lives apart from `createEngine` so the boot-defaults shape is independently
 * testable (assert every cluster + derived item row is seeded) without
 * standing up the whole engine. Pure and total — no arguments, so there's no
 * ambient default to drift.
 */

import { Source, SOURCE_REGISTRY } from '../../data/sources';
import { SOURCE_ENTRIES } from '../../data/sourceEntries';
import {
  DEFAULT_ABS_MAG_LIMIT,
  DEFAULT_BIAS_MODE,
  DEFAULT_BRIGHTNESS,
  DEFAULT_DEPTH_FADE_ENABLED,
  DEFAULT_SHOW_PICK_BUFFER,
  DEFAULT_SHOW_DISK_RADIUS_RING,
  DEFAULT_SHOW_ORBIT_TRAIL_IMPOSTOR,
  DEFAULT_EXPOSURE,
  DEFAULT_HDR_ENABLED,
  DEFAULT_HDR_KNEE,
  DEFAULT_HDR_HEADROOM,
  DEFAULT_BLOOM_ENABLED,
  DEFAULT_BLOOM_STRENGTH,
  DEFAULT_BLOOM_THRESHOLD,
  DEFAULT_GALAXY_TEXTURES_ENABLED,
  DEFAULT_GALAXY_SB_SCALE,
  DEFAULT_GALAXY_SB_MAX,
  DEFAULT_GALAXY_FALLOFF_STRENGTH,
  DEFAULT_MILKY_WAY_ENABLED,
  DEFAULT_MILKY_WAY_LABEL_ENABLED,
  DEFAULT_GALAXY_PROVENANCE,
  DEFAULT_ORBIT_TRAILS_ENABLED,
  DEFAULT_POINT_SIZE_PX,
  DEFAULT_STAR_BRIGHTNESS,
  DEFAULT_STAR_GLOW_OVERLAP,
  DEFAULT_STAR_EXPOSURE_NEAR_X,
  DEFAULT_STAR_EXPOSURE_MID_X,
  DEFAULT_STAR_EXPOSURE_FAR_X,
  DEFAULT_STAR_AGGREGATE_INTENSITY_CAP,
  DEFAULT_STAR_SIZE_PX,
  DEFAULT_TONE_MAP_CURVE,
  DEFAULT_VOLUMES_ENABLED,
  DEFAULT_FLOW,
  DEFAULT_ORIENTATION,
} from '../../data/defaults';
// The "Detail" knob's default is owned by the walk it feeds (single source of
// truth), so seed the setting straight from it rather than restating 0.05.
import { DEFAULT_REFINE_THRESHOLD } from '../../services/gpu/renderers/starCatalog/walkStarOctreeCut';
// Same relationship: the Milky-Way star-cloud look knobs are owned by the
// renderer's calibration module, so seed them from there rather than restating
// six numbers here.
import { MILKY_WAY_TUNING_DEFAULTS } from '../../services/engine/galaxyGenerator/v1/milkyWayCalibration';
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
import { ATMOSPHERE_PARAMS } from '../../data/bodies/atmosphereParams';
import { EARTH_SURFACE_PARAMS } from '../../data/bodies/earthSurfaceParams';
import { STRUCTURE_IDS } from '../../data/structure/structureIds';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import type { GalaxyCatalogId } from '../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { GalaxyCatalogItemSettings } from '../../@types/settings/GalaxyCatalogItemSettings';
import type { StructureId } from '../../@types/data/structure/StructureId';
import type { StructureItemSettings } from '../../@types/settings/StructureItemSettings';
import type { StarCatalogId } from '../../@types/data/starCatalog/StarCatalogId';
import type { StarCatalogItemSettings } from '../../@types/settings/StarCatalogItemSettings';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { BodyItemSettings } from '../../@types/settings/BodyItemSettings';

export function buildInitialSettings(): EngineSettingsState {
  return {
    // Camera orientation frame — the bare scalar "which pole is up" view
    // preference (spec §3.2). Seeded from `DEFAULT_ORIENTATION` so that file
    // stays the default's single source of truth (mirroring `tonemap.curve` ←
    // `DEFAULT_TONE_MAP_CURVE`).
    orientation: DEFAULT_ORIENTATION,
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
    // Screen-space bloom: master gate + the two look knobs, each seeded from its
    // `data/defaults.ts` constant so that file stays the default's single source
    // of truth (mirroring `tonemap`). Read live by the bloom pass; `enabled`
    // gates the pass at frame-program build.
    bloom: {
      enabled: DEFAULT_BLOOM_ENABLED,
      strength: DEFAULT_BLOOM_STRENGTH,
      threshold: DEFAULT_BLOOM_THRESHOLD,
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
    // Milky Way is a singleton overlay layer: the two visibility axes plus the
    // star-cloud look knobs all live here. The knobs spread in from
    // `MILKY_WAY_TUNING_DEFAULTS`, which stays their single source of truth for
    // where they start (the DebugPanel sliders own them from then on).
    milkyWay: {
      enabled: DEFAULT_MILKY_WAY_ENABLED,
      labelEnabled: DEFAULT_MILKY_WAY_LABEL_ENABLED,
      ...MILKY_WAY_TUNING_DEFAULTS,
    },
    filaments: {
      enabled: SOURCE_REGISTRY[Source.Filaments].visible,
      intensity: SOURCE_REGISTRY[Source.Filaments].intensity,
    },
    // Constellation stick-figure overlay, seeded from the registry constellations
    // row (same pattern as `filaments`) so that entry stays the single source of
    // truth for the default-visible gate + intensity. The one `enabled` toggle
    // governs both the lines and their name captions.
    constellations: {
      enabled: SOURCE_REGISTRY[Source.Constellations].visible,
      intensity: SOURCE_REGISTRY[Source.Constellations].intensity,
    },
    // Orbit-trails singleton overlay: the master gate on the near-field Keplerian
    // orbit trails, defaulting on (the trails are part of the baseline
    // solar-system scene). A flat `enabled` field like `milkyWay` / `filaments`.
    orbitTrails: {
      enabled: DEFAULT_ORBIT_TRAILS_ENABLED,
    },
    // Earth's per-body look dials. Each seeds from its authored data constant so
    // that file stays the default's single source of truth (the same
    // relationship the tonemap exposure default has to `DEFAULT_EXPOSURE`):
    // `atmosphereExposure` from the Earth atmosphere-params row, `ambientLight`
    // (Earth's night-side floor) + `oceanRoughness` (the ocean glint's GGX
    // roughness) from the surface params — where each matches the shared WESL
    // const it mirrors so these Earth-scoped overrides are no-ops at the default.
    earth: {
      // `earth` is a definitional row in the atmosphere table, so the indexed
      // read is non-null here (the `Record<string, …>` index signature widens it).
      atmosphereExposure: ATMOSPHERE_PARAMS.earth!.exposure,
      ambientLight: EARTH_SURFACE_PARAMS.ambientLight,
      oceanRoughness: EARTH_SURFACE_PARAMS.oceanRoughness,
    },
    // Star-catalog layer: master gate on + one item row per star catalog. Rows
    // are DERIVED from the star-catalog registry entries (mirroring
    // `galaxyCatalogs`), so the seed can't drift from the star-catalog set, and
    // each row's `enabled` is seeded from that entry's `visible` field —
    // SOURCE_REGISTRY stays the single source of truth for default visibility.
    // `labelEnabled` seeds true for every row: it gates the famous-star map's
    // captions on the final descent, and rides inertly on the survey-wide Gaia
    // bin (the star renderer draws no per-star names). Per-row "loaded" is the
    // asset slot's own readiness — no data-layer store.
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
        SOURCE_ENTRIES.filter((e) => e.type === 'starCatalog').map((e) => [
          e.id,
          { enabled: e.visible, labelEnabled: true },
        ]),
      ) as Record<StarCatalogId, StarCatalogItemSettings>,
    },
    // Body rows are DERIVED from the registry's body entries, so the seed can't
    // drift from the body set, and each row's `enabled` comes from that entry's
    // `visible` field — SOURCE_REGISTRY stays the single source of truth for
    // default visibility. `labelEnabled` seeds true: the captions are the
    // descent's navigation aids and show until the user mutes them.
    bodies: {
      items: Object.fromEntries(
        SOURCE_ENTRIES.filter((e) => e.type === 'body').map((e) => [
          e.id,
          { enabled: e.visible, labelEnabled: true },
        ]),
      ) as Record<BodyId, BodyItemSettings>,
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
    // Cross-cutting label presentation: focusedOnly default OFF — all enabled
    // labels draw (the guided tour flips it on and its snapshot restores it).
    labels: { focusedOnly: false },
    debug: {
      showPickBuffer: DEFAULT_SHOW_PICK_BUFFER,
      showDiskRadiusRing: DEFAULT_SHOW_DISK_RADIUS_RING,
      showOrbitTrailImpostor: DEFAULT_SHOW_ORBIT_TRAIL_IMPOSTOR,
      // Empty in production: a developer populates it from the DebugPanel's
      // renderer-toggle section. A fresh record per engine — never persisted.
      disabledPasses: {},
      // 'auto' reproduces the old timing-derived pass shape, so production +
      // ?gpuTimings stay identical to before Joint 1 (see `resolveStrategy`).
      renderStrategy: 'auto',
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
