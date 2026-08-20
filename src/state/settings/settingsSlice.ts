/**
 * settingsSlice — the engine settings state as a single Redux Toolkit slice,
 * authored with inline Immer case reducers.
 *
 * This is the RTK successor to the old `settingsStore` reducer/action pairs:
 * each setter used to live as TWO files — a pure copy-on-write reducer
 * (`reducers/setBrightness.ts`) plus an action thunk that wrapped it in a
 * `store.setState` call (`actions/setBrightnessAction.ts`). Both are deleted in
 * favour of one inline reducer here, and RTK auto-derives the action creators.
 *
 * Why inline Immer rather than porting the hand-written copy-on-write spreads
 * verbatim: every old reducer was a manual `{ ...state, cluster: { ...cluster,
 * field } }` ladder whose whole job was to give two guarantees — a NEW reference
 * for the touched cluster (so React selectors re-run) and the SAME reference for
 * every untouched cluster (so selectors over them skip). That is exactly the
 * structural sharing Immer produces from a draft mutation, for free. Writing
 * `settings.galaxyCatalogs.brightness = action.payload` against the Immer draft
 * yields a new `galaxyCatalogs` cluster and leaves `tonemap`, `camera`, … at
 * their prior references — the same contract the spreads hand-maintained, with
 * none of the per-field nesting to keep in sync.
 *
 * The action-creator names are deliberately IDENTICAL to the old reducer
 * function names so the write-path repoint is a pure import-source swap.
 *
 * One reducer breaks the mutate-the-draft pattern: `mergeSnapshot` returns a new
 * state (laid down by `mergeSettingsSnapshot`) rather than mutating, and must
 * unwrap the draft with `current()` first — see its docblock below.
 */

import { createSlice, current, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { buildInitialSettings } from './initialState';
import { buildVolumeFieldSettings } from '../../data/volume/volumeFieldDefaults';
import { mergeSettingsSnapshot } from './mergeSettingsSnapshot';
import type { ToneMapCurve } from '../../@types/data/ToneMapCurve';
import type { BiasMode } from '../../@types/data/galaxyCatalog/BiasMode';
import type { GalaxyCatalogId } from '../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { StarCatalogId } from '../../@types/data/starCatalog/StarCatalogId';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { StructureId } from '../../@types/data/structure/StructureId';
import type { ClipId } from '../../@types/animation/ClipId';
import type { SplineMode } from '../../@types/animation/SplineMode';
import type { PassByDir } from '../../@types/animation/PassByDir';
import type { ClipPathTuningKnob } from '../../@types/settings/ClipPathTuningKnob';
import type { VolumeFieldId } from '../../@types/data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../@types/settings/VolumeFieldSettings';
import type { FlowFieldDefaults } from '../../@types/data/flow/FlowFieldDefaults';
import type { MilkyWayTuning } from '../../@types/settings/MilkyWayTuning';
import type { ZoneOfAvoidanceTuning } from '../../@types/settings/ZoneOfAvoidanceTuning';
import type { SettingsSnapshot } from '../../@types/engine/settings/SettingsSnapshot';
import type { RenderStrategy } from '../../@types/engine/frame/RenderStrategy';
import type { OrientationFrameId } from '../../@types/camera/OrientationFrameId';
import type { ProvenanceAxisId } from '../../@types/settings/ProvenanceAxisId';
import type { ProvenanceFilter } from '../../@types/settings/ProvenanceFilter';
import type { DebugOverlayKey } from '../../@types/data/debug/DebugOverlayKey';

// The slice seeds the appearance knobs from `buildInitialSettings()`. The data
// tier is NOT a settings field — it lives in its own root slice (seeded via the
// store's `preloadedState`, written by the tier saga), so it never appears here.
const initialState = buildInitialSettings();

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    // ── camera orientation frame ────────────────────────────────────────────
    // Bare scalar view preference: which astronomical pole is "up". A string
    // union (OrientationFrameId), not a numeric enum — no parse on the payload.
    setOrientation: (settings, action: PayloadAction<OrientationFrameId>) => {
      settings.orientation = action.payload;
    },

    // ── galaxy-catalog billboard knobs ──────────────────────────────────────
    setGalaxyCatalogSize: (settings, action: PayloadAction<number>) => {
      settings.galaxyCatalogs.sizePx = action.payload;
    },
    setBrightness: (settings, action: PayloadAction<number>) => {
      settings.galaxyCatalogs.brightness = action.payload;
    },
    setDepthFade: (settings, action: PayloadAction<boolean>) => {
      settings.galaxyCatalogs.depthFade = action.payload;
    },
    // Data-quality provenance axes (orientation / size): each axis's highlight
    // overlay and tri-state filter are independent writers, mirroring how
    // `setGalaxyCatalogVisible` / `setGalaxyCatalogLabelEnabled` each own one
    // axis of a per-item row.
    setProvenanceHighlight: (
      settings,
      action: PayloadAction<{ axis: ProvenanceAxisId; highlight: boolean }>,
    ) => {
      settings.galaxyCatalogs.provenance[action.payload.axis].highlight = action.payload.highlight;
    },
    setProvenanceFilter: (
      settings,
      action: PayloadAction<{ axis: ProvenanceAxisId; filter: ProvenanceFilter }>,
    ) => {
      settings.galaxyCatalogs.provenance[action.payload.axis].filter = action.payload.filter;
    },
    // Overall physical-SB → HDR gain, twin of setGalaxyCatalogSize. Rides the
    // points uniform as `galaxySbScale`; the live successor to the old
    // hardcoded `GALAXY_SB_SCALE` shader const.
    setGalaxySbScale: (settings, action: PayloadAction<number>) => {
      settings.galaxyCatalogs.sbScale = action.payload;
    },
    // Bloom ceiling — the max baked surface-brightness amplitude a compact
    // galaxy can emit. The vertex stage clamps `sbAmp` to it live
    // (`galaxySbMax` uniform), replacing the old bake-time clamp.
    setGalaxySbMax: (settings, action: PayloadAction<number>) => {
      settings.galaxyCatalogs.sbMax = action.payload;
    },
    // Readability-falloff exponent on the resolved-fraction falloff, gated by
    // the depth-fade toggle. Rides the points uniform as `galaxyFalloffStrength`.
    setGalaxyFalloffStrength: (settings, action: PayloadAction<number>) => {
      settings.galaxyCatalogs.falloffStrength = action.payload;
    },
    setGalaxyCatalogVisible: (
      settings,
      action: PayloadAction<{ id: GalaxyCatalogId; enabled: boolean }>,
    ) => {
      settings.galaxyCatalogs.items[action.payload.id].enabled = action.payload.enabled;
    },
    setGalaxyCatalogLabelEnabled: (
      settings,
      action: PayloadAction<{ id: GalaxyCatalogId; enabled: boolean }>,
    ) => {
      settings.galaxyCatalogs.items[action.payload.id].labelEnabled = action.payload.enabled;
    },

    // ── tone-map ────────────────────────────────────────────────────────────
    setExposure: (settings, action: PayloadAction<number>) => {
      settings.tonemap.exposure = action.payload;
    },
    setToneMapCurve: (settings, action: PayloadAction<ToneMapCurve>) => {
      settings.tonemap.curve = action.payload;
    },
    setHdrEnabled: (settings, action: PayloadAction<boolean>) => {
      settings.hdr.enabled = action.payload;
    },
    setHdrKnee: (settings, action: PayloadAction<number>) => {
      settings.hdr.knee = action.payload;
    },
    setHdrHeadroom: (settings, action: PayloadAction<number>) => {
      settings.hdr.headroom = action.payload;
    },

    // ── bloom ───────────────────────────────────────────────────────────────
    setBloomEnabled: (settings, action: PayloadAction<boolean>) => {
      settings.bloom.enabled = action.payload;
    },
    setBloomStrength: (settings, action: PayloadAction<number>) => {
      settings.bloom.strength = action.payload;
    },
    setBloomThreshold: (settings, action: PayloadAction<number>) => {
      settings.bloom.threshold = action.payload;
    },

    // ── bias ────────────────────────────────────────────────────────────────
    setBiasMode: (settings, action: PayloadAction<BiasMode>) => {
      settings.bias.mode = action.payload;
    },
    setAbsMagLimit: (settings, action: PayloadAction<number>) => {
      settings.bias.absMagLimit = action.payload;
    },

    // ── thumbnails ──────────────────────────────────────────────────────────
    setThumbnailsEnabled: (settings, action: PayloadAction<boolean>) => {
      settings.thumbnails.enabled = action.payload;
    },

    // ── milky way ───────────────────────────────────────────────────────────
    setMilkyWayEnabled: (settings, action: PayloadAction<boolean>) => {
      settings.milkyWay.enabled = action.payload;
    },
    setMilkyWayLabelEnabled: (settings, action: PayloadAction<boolean>) => {
      settings.milkyWay.labelEnabled = action.payload;
    },
    // Star-cloud look knobs, patched leaf-by-leaf from the DebugPanel sliders.
    // The payload is `MilkyWayTuning`, not `MilkyWaySettings`, so the two
    // visibility axes keep their own single writers above and can never be
    // flipped by a knob patch — the same split `setFlow` makes.
    setMilkyWayTuning: (settings, action: PayloadAction<Partial<MilkyWayTuning>>) => {
      Object.assign(settings.milkyWay, action.payload);
    },

    // ── zone of avoidance ──────────────────────────────────────────────────
    setZoneOfAvoidanceEnabled: (settings, action: PayloadAction<boolean>) => {
      settings.zoneOfAvoidance.enabled = action.payload;
    },
    // Band look knobs, patched leaf-by-leaf — the same visibility/tuning split
    // `setMilkyWayTuning` makes, so a knob patch can never flip `enabled`.
    setZoneOfAvoidanceTuning: (settings, action: PayloadAction<Partial<ZoneOfAvoidanceTuning>>) => {
      Object.assign(settings.zoneOfAvoidance, action.payload);
    },

    // ── filaments ───────────────────────────────────────────────────────────
    setFilamentsEnabled: (settings, action: PayloadAction<boolean>) => {
      settings.filaments.enabled = action.payload;
    },
    setFilamentIntensity: (settings, action: PayloadAction<number>) => {
      settings.filaments.intensity = action.payload;
    },

    // ── constellations ──────────────────────────────────────────────────────
    setConstellationsEnabled: (settings, action: PayloadAction<boolean>) => {
      settings.constellations.enabled = action.payload;
    },
    setConstellationIntensity: (settings, action: PayloadAction<number>) => {
      settings.constellations.intensity = action.payload;
    },

    // ── orbit trails ────────────────────────────────────────────────────────
    // Singleton-overlay master gate on the near-field Keplerian orbit trails,
    // its own single writer (like setMilkyWayEnabled / setFilamentsEnabled).
    setOrbitTrailsEnabled: (settings, action: PayloadAction<boolean>) => {
      settings.orbitTrails.enabled = action.payload;
    },

    // ── earth ───────────────────────────────────────────────────────────────
    // Exposure scale on the atmosphere shell's HDR output — read live by
    // `atmosphereShellLayer` each frame. Twin of `setFilamentIntensity`.
    setAtmosphereExposure: (settings, action: PayloadAction<number>) => {
      settings.earth.atmosphereExposure = action.payload;
    },
    // Night-side ambient floor on Earth's surface + cloud shell — read live by
    // `earthLayer` / `cloudShellLayer` each frame. An Earth-scoped override of
    // the shared `AMBIENT` const (which stays every other lit body's floor).
    setAmbientLight: (settings, action: PayloadAction<number>) => {
      settings.earth.ambientLight = action.payload;
    },
    // Open-water GGX roughness on Earth's surface — read live by `earthLayer`
    // each frame. An Earth-scoped override of the `OCEAN_ROUGHNESS` const in
    // `lib/pbr.wesl` (which stays the seed / documentation home).
    setOceanRoughness: (settings, action: PayloadAction<number>) => {
      settings.earth.oceanRoughness = action.payload;
    },

    // ── star catalogs (fourth source-type cluster) ──────────────────────────
    // Master gate + per-catalog items, mirroring the galaxy-catalog cluster:
    // `setStarCatalogEnabled` writes the coarse "hide all star catalogs" gate,
    // and the two per-item reducers write one row's visibility / label axis.
    setStarCatalogEnabled: (settings, action: PayloadAction<boolean>) => {
      settings.starCatalogs.enabled = action.payload;
    },
    // Shared star-billboard size knob, twin of `setGalaxyCatalogSize`.
    setStarCatalogSize: (settings, action: PayloadAction<number>) => {
      settings.starCatalogs.sizePx = action.payload;
    },
    // Shared star-brightness trim, twin of `setBrightness` (1.0 = identity).
    setStarCatalogBrightness: (settings, action: PayloadAction<number>) => {
      settings.starCatalogs.brightness = action.payload;
    },
    // The "Detail" knob — CPU octree-cut refine threshold (not a GPU uniform).
    setStarCatalogRefineThreshold: (settings, action: PayloadAction<number>) => {
      settings.starCatalogs.refineThreshold = action.payload;
    },
    // The "Glow overlap" knob — aggregate glow spread (1.0 = identity).
    setStarCatalogGlowOverlap: (settings, action: PayloadAction<number>) => {
      settings.starCatalogs.glowOverlap = action.payload;
    },
    // The "Exposure (near)" knob — absolute display exposure the scale-dependent
    // ramp targets at the near (solar-system) anchor. Fed to `starExposureRamp`.
    setStarCatalogExposureNearX: (settings, action: PayloadAction<number>) => {
      settings.starCatalogs.exposureNearX = action.payload;
    },
    // The "Exposure (mid)" knob — absolute display exposure the ramp targets at
    // the middle (few-kpc) anchor. Fed to `starExposureRamp`; bends only the
    // intermediate segment.
    setStarCatalogExposureMidX: (settings, action: PayloadAction<number>) => {
      settings.starCatalogs.exposureMidX = action.payload;
    },
    // The "Exposure (far)" knob — absolute display exposure the ramp targets at
    // the far (whole-galaxy) anchor. Fed to `starExposureRamp`.
    setStarCatalogExposureFarX: (settings, action: PayloadAction<number>) => {
      settings.starCatalogs.exposureFarX = action.payload;
    },
    // The "Fog cap" knob — ceiling on the per-pixel peak intensity of AGGREGATE
    // glows only (leaves uncapped). Rides the shared GPU uniform; tames the
    // box-filling fog a near sub-threshold aggregate deposits around the Sun.
    setStarCatalogAggregateIntensityCap: (settings, action: PayloadAction<number>) => {
      settings.starCatalogs.aggregateIntensityCap = action.payload;
    },
    setStarCatalogVisible: (
      settings,
      action: PayloadAction<{ id: StarCatalogId; enabled: boolean }>,
    ) => {
      settings.starCatalogs.items[action.payload.id].enabled = action.payload.enabled;
    },
    setStarCatalogLabelEnabled: (
      settings,
      action: PayloadAction<{ id: StarCatalogId; enabled: boolean }>,
    ) => {
      settings.starCatalogs.items[action.payload.id].labelEnabled = action.payload.enabled;
    },

    // ── bodies (fifth source-type cluster) ──────────────────────────────────
    // The caption axis is the only WRITABLE one: `bodies.items[id].enabled` is
    // seeded from the registry row and read by `visibleStars` (the Sun's dot)
    // and `foregroundLabelsLayer` (the Sun's caption), but no product decision
    // has been made to expose a "hide this body" control, so no setter exists
    // to turn it into a knob nothing turns. There is no cluster-level gate
    // either, for the same reason (see EngineSettingsState).
    setBodyLabelEnabled: (settings, action: PayloadAction<{ id: BodyId; enabled: boolean }>) => {
      settings.bodies.items[action.payload.id].labelEnabled = action.payload.enabled;
    },

    // ── volumes ─────────────────────────────────────────────────────────────
    setVolumesEnabled: (settings, action: PayloadAction<boolean>) => {
      settings.volumes.enabled = action.payload;
    },
    addVolumeField: (settings, action: PayloadAction<VolumeFieldId>) => {
      // Re-registering a seeded field is a no-op: the early return keeps an
      // existing row (and its tuned sliders) untouched. Only a genuinely-new id
      // seeds a fresh row from registry defaults.
      if (settings.volumes.items[action.payload]) return;
      // Freshly built, stored as-is — sound to re-type as Immer's Draft (no
      // clone needed), same posture as selectionRowsSlice's `setSelectionRow`.
      // `bands`' readonly array is what trips the plain assignment.
      settings.volumes.items[action.payload] = buildVolumeFieldSettings(
        action.payload,
      ) as Draft<VolumeFieldSettings>;
    },
    removeVolumeField: (settings, action: PayloadAction<VolumeFieldId>) => {
      delete settings.volumes.items[action.payload];
    },
    writeVolumeField: (
      settings,
      action: PayloadAction<{ id: VolumeFieldId; patch: Partial<VolumeFieldSettings> }>,
    ) => {
      // Shallow per-field merge via Immer's `Object.assign`. An unknown id
      // is a silent no-op.
      const row = settings.volumes.items[action.payload.id];
      if (!row) return;
      Object.assign(row, action.payload.patch);
    },

    // ── flow ────────────────────────────────────────────────────────────────
    // The master gate is its own scalar setter (like setMilkyWayEnabled /
    // setVolumesEnabled), so `flow.enabled` has a single writer. `setFlow`
    // patches only the look/motion knobs — its payload deliberately excludes
    // `enabled`, keeping the visibility intent off the generic merge path.
    setFlowEnabled: (settings, action: PayloadAction<boolean>) => {
      settings.flow.enabled = action.payload;
    },
    setFlow: (settings, action: PayloadAction<Partial<FlowFieldDefaults>>) => {
      // Leaf-by-leaf merge of the partial knob patch into the flow slice.
      Object.assign(settings.flow, action.payload);
    },

    // ── labels (cross-cutting presentation) ─────────────────────────────────
    setLabelsFocusedOnly: (settings, action: PayloadAction<boolean>) => {
      settings.labels.focusedOnly = action.payload;
    },

    // ── debug ───────────────────────────────────────────────────────────────
    // One reducer for every DEBUG_OVERLAY_ROWS toggle — writes one entry
    // in-place (like setPassDisabled below), never the whole record.
    setDebugOverlay: (
      settings,
      action: PayloadAction<{ key: DebugOverlayKey; enabled: boolean }>,
    ) => {
      settings.debug.overlays[action.payload.key] = action.payload.enabled;
    },
    setPassDisabled: (settings, action: PayloadAction<{ pass: string; disabled: boolean }>) => {
      // Open-world membership record (any pass name): `[name] === true` disables.
      settings.debug.disabledPasses[action.payload.pass] = action.payload.disabled;
    },
    // Override the frame's render-pass shape independently of GPU timing (Joint 1;
    // see `resolveStrategy`). 'auto' restores the timing-derived default.
    setRenderStrategy: (settings, action: PayloadAction<RenderStrategy | 'auto'>) => {
      settings.debug.renderStrategy = action.payload;
    },
    // Clip-path inspector: choose which clip to sample. The saga watches this
    // action to (re)compute the snapshot; the scrubber resets to the start.
    inspectClipPath: (settings, action: PayloadAction<ClipId>) => {
      settings.debug.clipPathInspect.clipId = action.payload;
      settings.debug.clipPathInspect.scrub01 = 0;
    },
    // Re-sample the shown clip with everything fresh EXCEPT the start pose, which
    // the seam keeps from the last Calculate — so moving the camera to view the
    // path then tuning a knob doesn't snap the start to the new viewpoint. The
    // saga watches this; state-wise it mirrors `inspectClipPath`.
    recalcClipPath: (settings, action: PayloadAction<ClipId>) => {
      settings.debug.clipPathInspect.clipId = action.payload;
      settings.debug.clipPathInspect.scrub01 = 0;
    },
    // Drop the inspected path (the "Clear" button). The saga clears the held
    // snapshot so the overlay goes quiet.
    clearClipPath: (settings) => {
      settings.debug.clipPathInspect.clipId = null;
      settings.debug.clipPathInspect.scrub01 = 0;
    },
    // Move the scrubber (a [0,1] fraction). Pure scalar write — the overlay's
    // gizmo reads it each frame and maps it to the nearest held sample.
    setClipPathScrub: (settings, action: PayloadAction<number>) => {
      settings.debug.clipPathInspect.scrub01 = action.payload;
    },
    // flyPath pacing knobs the saga bakes into the clip at Calculate time — but
    // only the ones the curator has ACTIVATED (see `setClipPathTuningActive`).
    // `align` = start-aim blend seconds; `rampSec` = ease ramp seconds each end
    // (0 = use the named ease); `linger` = per-target brake depth [0,1] (0 =
    // cruise straight through). Touching a value activates that knob's override
    // (so dragging a slider is enough to opt in); Re-Calculate to apply.
    setClipPathAlign: (settings, action: PayloadAction<number>) => {
      settings.debug.clipPathInspect.align = action.payload;
      settings.debug.clipPathInspect.active.align = true;
    },
    setClipPathRampSec: (settings, action: PayloadAction<number>) => {
      settings.debug.clipPathInspect.rampSec = action.payload;
      settings.debug.clipPathInspect.active.rampSec = true;
    },
    // `linger` (dwell depth) and `lingerSec` (window width) are the two dwell
    // sub-knobs — they ride the ONE `linger` override gate (one dwell concept),
    // so touching either activates `linger`.
    setClipPathLinger: (settings, action: PayloadAction<number>) => {
      settings.debug.clipPathInspect.linger = action.payload;
      settings.debug.clipPathInspect.active.linger = true;
    },
    setClipPathLingerSec: (settings, action: PayloadAction<number>) => {
      settings.debug.clipPathInspect.lingerSec = action.payload;
      settings.debug.clipPathInspect.active.linger = true;
    },
    // Spline basis A/B: centripetal Catmull-Rom ↔ causal Hermite. `turnDelay`
    // (overshoot) and `lookAhead` (look-lead seconds) are the causal-only
    // sub-knobs — they ride the ONE `spline` override gate (they're meaningless
    // without the causal basis), so touching any of the three activates `spline`.
    setClipPathSpline: (settings, action: PayloadAction<SplineMode>) => {
      settings.debug.clipPathInspect.spline = action.payload;
      settings.debug.clipPathInspect.active.spline = true;
    },
    setClipPathTurnDelay: (settings, action: PayloadAction<number>) => {
      settings.debug.clipPathInspect.turnDelay = action.payload;
      settings.debug.clipPathInspect.active.spline = true;
    },
    setClipPathLookAhead: (settings, action: PayloadAction<number>) => {
      settings.debug.clipPathInspect.lookAhead = action.payload;
      settings.debug.clipPathInspect.active.spline = true;
    },
    // Fly-past: `passByOffset` (radius units) and `passByDir` are the two fly-past
    // sub-knobs — they ride the ONE `passBy` override gate (they're one
    // cinematographic concept), so touching either activates `passBy`.
    setClipPathPassByOffset: (settings, action: PayloadAction<number>) => {
      settings.debug.clipPathInspect.passByOffset = action.payload;
      settings.debug.clipPathInspect.active.passBy = true;
    },
    setClipPathPassByDir: (settings, action: PayloadAction<PassByDir>) => {
      settings.debug.clipPathInspect.passByDir = action.payload;
      settings.debug.clipPathInspect.active.passBy = true;
    },
    // Toggle a single pacing knob's override on/off. Off (the default) lets the
    // clip's own authored value flow through; the row checkbox drives this, and
    // the value setters above flip it on when the curator touches a slider.
    setClipPathTuningActive: (
      settings,
      action: PayloadAction<{ knob: ClipPathTuningKnob; active: boolean }>,
    ) => {
      settings.debug.clipPathInspect.active[action.payload.knob] = action.payload.active;
    },

    // ── structures ──────────────────────────────────────────────────────────
    setStructureItemEnabled: (
      settings,
      action: PayloadAction<{ id: StructureId; enabled: boolean }>,
    ) => {
      settings.structures.items[action.payload.id].enabled = action.payload.enabled;
    },
    setStructureLabelEnabled: (
      settings,
      action: PayloadAction<{ id: StructureId; enabled: boolean }>,
    ) => {
      settings.structures.items[action.payload.id].labelEnabled = action.payload.enabled;
    },

    // ── snapshot merge (tour restore / mid-playback effect) ─────────────────
    // The ONE return-new-state reducer. `mergeSettingsSnapshot` does
    // `{ ...state, ...structuredClone(patch) }`; inside a case reducer `settings`
    // is an Immer draft Proxy, so spreading it directly would leak nested draft
    // proxies into the result and confuse Immer's finalizer. `current(settings)`
    // yields a plain, non-proxy snapshot of the draft so the merge returns a
    // fully-plain new state — which Immer accepts as the replacement state. This
    // reducer does NOT mutate the draft; it only returns.
    mergeSnapshot: (settings, action: PayloadAction<Partial<SettingsSnapshot>>) =>
      mergeSettingsSnapshot(current(settings), action.payload),
  },
});

export const {
  setOrientation,
  setGalaxyCatalogSize,
  setBrightness,
  setDepthFade,
  setGalaxySbScale,
  setGalaxySbMax,
  setGalaxyFalloffStrength,
  setProvenanceHighlight,
  setProvenanceFilter,
  setGalaxyCatalogVisible,
  setGalaxyCatalogLabelEnabled,
  setExposure,
  setToneMapCurve,
  setHdrEnabled,
  setHdrKnee,
  setHdrHeadroom,
  setBloomEnabled,
  setBloomStrength,
  setBloomThreshold,
  setBiasMode,
  setAbsMagLimit,
  setThumbnailsEnabled,
  setMilkyWayEnabled,
  setMilkyWayLabelEnabled,
  setMilkyWayTuning,
  setZoneOfAvoidanceEnabled,
  setZoneOfAvoidanceTuning,
  setFilamentsEnabled,
  setFilamentIntensity,
  setConstellationsEnabled,
  setConstellationIntensity,
  setOrbitTrailsEnabled,
  setAtmosphereExposure,
  setAmbientLight,
  setOceanRoughness,
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
  setBodyLabelEnabled,
  setVolumesEnabled,
  addVolumeField,
  removeVolumeField,
  writeVolumeField,
  setFlowEnabled,
  setFlow,
  setDebugOverlay,
  setPassDisabled,
  setRenderStrategy,
  inspectClipPath,
  recalcClipPath,
  clearClipPath,
  setClipPathScrub,
  setClipPathAlign,
  setClipPathRampSec,
  setClipPathLinger,
  setClipPathLingerSec,
  setClipPathSpline,
  setClipPathTurnDelay,
  setClipPathLookAhead,
  setClipPathPassByOffset,
  setClipPathPassByDir,
  setClipPathTuningActive,
  setStructureItemEnabled,
  setStructureLabelEnabled,
  setLabelsFocusedOnly,
  mergeSnapshot,
} = settingsSlice.actions;

export default settingsSlice.reducer;
