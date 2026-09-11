/**
 * settingsSlice — the engine settings state as one Redux Toolkit slice.
 *
 * Mutating the Immer draft yields a new object for the touched cluster and
 * leaves untouched clusters at their prior reference — the structural sharing
 * React selectors depend on. Clusters a Layer owns arrive as settings fragments
 * instead, re-based onto the root by `liftClusterReducers`; reducer KEYS stay
 * flat across core and fragments, so RTK derives the same `settings/<key>`
 * action type strings either way.
 */

import { createSlice, current, type Draft, type PayloadAction } from '@reduxjs/toolkit';

import { APP_SETTINGS_FRAGMENTS } from '../../compositions/appSettingsFragments';
import { assertUniqueFragmentReducerKeys } from '../../utils/settings/assertUniqueFragmentReducerKeys';
import { buildInitialSettings } from './initialState';
import { buildVolumeFieldSettings } from '../../data/volume/volumeFieldDefaults';
import { galaxyCatalogsSettingsFragment } from '../../layers/galaxyCatalog/settings/galaxyCatalogsSettings';
import { liftClusterReducers } from '../../utils/settings/liftClusterReducers';
import { mergeSettingsSnapshot } from './mergeSettingsSnapshot';
import { starCatalogsSettingsFragment } from '../../layers/starCatalog/settings/starCatalogsSettings';
import { structuresSettingsFragment } from '../../layers/structure/settings/structuresSettings';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import type { ToneMapCurve } from '../../@types/data/ToneMapCurve';
import type { BiasMode } from '../../@types/data/galaxyCatalog/BiasMode';
import type { BodyId } from '../../@types/data/body/BodyId';
import type { ClipId } from '../../@types/animation/ClipId';
import type { SplineMode } from '../../@types/animation/SplineMode';
import type { PassByDir } from '../../@types/animation/PassByDir';
import type { ClipPathTuningKnob } from '../../@types/settings/ClipPathTuningKnob';
import type { VolumeFieldId } from '../../@types/data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../@types/settings/VolumeFieldSettings';
import type { FlowFieldDefaults } from '../../@types/data/flow/FlowFieldDefaults';
import type { MilkyWayTuning } from '../../@types/settings/MilkyWayTuning';
import type { ZoneOfAvoidanceTuning } from '../../@types/settings/ZoneOfAvoidanceTuning';
import type { SgrAStarLensingTuning } from '../../@types/settings/SgrAStarLensingTuning';
import type { SettingsSnapshot } from '../../@types/engine/settings/SettingsSnapshot';
import type { RenderStrategy } from '../../@types/engine/frame/RenderStrategy';
import type { OrientationFrameId } from '../../@types/camera/OrientationFrameId';
import type { DebugOverlayKey } from '../../@types/data/debug/DebugOverlayKey';

// The slice seeds the appearance knobs from `buildInitialSettings()`. The data
// tier is NOT a settings field — it lives in its own root slice (seeded via the
// store's `preloadedState`, written by the tier saga), so it never appears here.
const initialState = buildInitialSettings();

// Standing outside `createSlice` costs the contextual state type, so each core
// reducer annotates the draft it writes.
type SettingsDraft = Draft<EngineSettingsState>;

/**
 * The case reducers over clusters core owns — the half of the action namespace
 * that is not contributed by a settings fragment. Named (rather than inlined
 * into `createSlice`) so the composed-namespace test has a core key set derived
 * independently of the slice it checks.
 */
export const CORE_REDUCERS = {
  // ── camera orientation frame ────────────────────────────────────────────
  // Bare scalar view preference: which astronomical pole is "up". A string
  // union (OrientationFrameId), not a numeric enum — no parse on the payload.
  setOrientation: (settings: SettingsDraft, action: PayloadAction<OrientationFrameId>) => {
    settings.orientation = action.payload;
  },

  // ── camera lens ─────────────────────────────────────────────────────────
  setFovDeg: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.camera.fovDeg = action.payload;
  },

  // ── tone-map ────────────────────────────────────────────────────────────
  setExposure: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.tonemap.exposure = action.payload;
  },
  setToneMapCurve: (settings: SettingsDraft, action: PayloadAction<ToneMapCurve>) => {
    settings.tonemap.curve = action.payload;
  },
  setHdrEnabled: (settings: SettingsDraft, action: PayloadAction<boolean>) => {
    settings.hdr.enabled = action.payload;
  },
  setHdrKnee: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.hdr.knee = action.payload;
  },
  setHdrHeadroom: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.hdr.headroom = action.payload;
  },

  // ── bloom ───────────────────────────────────────────────────────────────
  setBloomEnabled: (settings: SettingsDraft, action: PayloadAction<boolean>) => {
    settings.bloom.enabled = action.payload;
  },
  setBloomStrength: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.bloom.strength = action.payload;
  },
  setBloomThreshold: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.bloom.threshold = action.payload;
  },

  // ── bias ────────────────────────────────────────────────────────────────
  setBiasMode: (settings: SettingsDraft, action: PayloadAction<BiasMode>) => {
    settings.bias.mode = action.payload;
  },
  setAbsMagLimit: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.bias.absMagLimit = action.payload;
  },

  // ── thumbnails ──────────────────────────────────────────────────────────
  setThumbnailsEnabled: (settings: SettingsDraft, action: PayloadAction<boolean>) => {
    settings.thumbnails.enabled = action.payload;
  },

  // ── milky way ───────────────────────────────────────────────────────────
  setMilkyWayEnabled: (settings: SettingsDraft, action: PayloadAction<boolean>) => {
    settings.milkyWay.enabled = action.payload;
  },
  setMilkyWayLabelEnabled: (settings: SettingsDraft, action: PayloadAction<boolean>) => {
    settings.milkyWay.labelEnabled = action.payload;
  },
  // Star-cloud look knobs, patched leaf-by-leaf from the DebugPanel sliders.
  // The payload is `MilkyWayTuning`, not `MilkyWaySettings`, so the two
  // visibility axes keep their own single writers above and can never be
  // flipped by a knob patch — the same split `setFlow` makes.
  setMilkyWayTuning: (settings: SettingsDraft, action: PayloadAction<Partial<MilkyWayTuning>>) => {
    Object.assign(settings.milkyWay, action.payload);
  },

  // ── zone of avoidance ──────────────────────────────────────────────────
  setZoneOfAvoidanceEnabled: (settings: SettingsDraft, action: PayloadAction<boolean>) => {
    settings.zoneOfAvoidance.enabled = action.payload;
  },
  // Band look knobs, patched leaf-by-leaf — the same visibility/tuning split
  // `setMilkyWayTuning` makes, so a knob patch can never flip `enabled`.
  setZoneOfAvoidanceTuning: (
    settings: SettingsDraft,
    action: PayloadAction<Partial<ZoneOfAvoidanceTuning>>,
  ) => {
    Object.assign(settings.zoneOfAvoidance, action.payload);
  },

  // ── Sgr A* lens tuning — leaf-by-leaf patch, no visibility axis to
  // protect (this cluster is pure knobs, not a singleton overlay).
  setSgrAStarLensingTuning: (
    settings: SettingsDraft,
    action: PayloadAction<Partial<SgrAStarLensingTuning>>,
  ) => {
    Object.assign(settings.sgrAStarLensingTuning, action.payload);
  },

  // ── filaments ───────────────────────────────────────────────────────────
  setFilamentsEnabled: (settings: SettingsDraft, action: PayloadAction<boolean>) => {
    settings.filaments.enabled = action.payload;
  },
  setFilamentIntensity: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.filaments.intensity = action.payload;
  },

  // ── constellations ──────────────────────────────────────────────────────
  setConstellationsEnabled: (settings: SettingsDraft, action: PayloadAction<boolean>) => {
    settings.constellations.enabled = action.payload;
  },
  setConstellationIntensity: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.constellations.intensity = action.payload;
  },

  // ── orbit trails ────────────────────────────────────────────────────────
  // Singleton-overlay master gate on the near-field Keplerian orbit trails,
  // its own single writer (like setMilkyWayEnabled / setFilamentsEnabled).
  setOrbitTrailsEnabled: (settings: SettingsDraft, action: PayloadAction<boolean>) => {
    settings.orbitTrails.enabled = action.payload;
  },

  // ── earth ───────────────────────────────────────────────────────────────
  // Exposure scale on the atmosphere shell's HDR output — read live by
  // `atmosphereShellPass` each frame. Twin of `setFilamentIntensity`.
  setAtmosphereExposure: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.earth.atmosphereExposure = action.payload;
  },
  // Night-side ambient floor on Earth's surface + cloud shell — read live by
  // `earthPass` / `cloudShellPass` each frame. An Earth-scoped override of
  // the shared `AMBIENT` const (which stays every other lit body's floor).
  setAmbientLight: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.earth.ambientLight = action.payload;
  },
  // Open-water GGX roughness on Earth's surface — read live by `earthPass`
  // each frame. An Earth-scoped override of the `OCEAN_ROUGHNESS` const in
  // `lib/pbr.wesl` (which stays the seed / documentation home).
  setOceanRoughness: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.earth.oceanRoughness = action.payload;
  },

  // ── bodies (fifth source-type cluster) ──────────────────────────────────
  // The caption axis is the only WRITABLE one: `bodies.items[id].enabled` is
  // seeded from the registry row and read by `visibleStars` (the Sun's dot)
  // and `foregroundLabelsPass` (the Sun's caption), but no product decision
  // has been made to expose a "hide this body" control, so no setter exists
  // to turn it into a knob nothing turns. There is no cluster-level gate
  // either, for the same reason (see EngineSettingsState).
  setBodyLabelEnabled: (
    settings: SettingsDraft,
    action: PayloadAction<{ id: BodyId; enabled: boolean }>,
  ) => {
    settings.bodies.items[action.payload.id].labelEnabled = action.payload.enabled;
  },

  // ── volumes ─────────────────────────────────────────────────────────────
  setVolumesEnabled: (settings: SettingsDraft, action: PayloadAction<boolean>) => {
    settings.volumes.enabled = action.payload;
  },
  addVolumeField: (settings: SettingsDraft, action: PayloadAction<VolumeFieldId>) => {
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
  removeVolumeField: (settings: SettingsDraft, action: PayloadAction<VolumeFieldId>) => {
    delete settings.volumes.items[action.payload];
  },
  writeVolumeField: (
    settings: SettingsDraft,
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
  setFlowEnabled: (settings: SettingsDraft, action: PayloadAction<boolean>) => {
    settings.flow.enabled = action.payload;
  },
  setFlow: (settings: SettingsDraft, action: PayloadAction<Partial<FlowFieldDefaults>>) => {
    // Leaf-by-leaf merge of the partial knob patch into the flow slice.
    Object.assign(settings.flow, action.payload);
  },

  // ── labels (cross-cutting presentation) ─────────────────────────────────
  setLabelsFocusedOnly: (settings: SettingsDraft, action: PayloadAction<boolean>) => {
    settings.labels.focusedOnly = action.payload;
  },

  // ── debug ───────────────────────────────────────────────────────────────
  // One reducer for every DEBUG_OVERLAY_ROWS toggle — writes one entry
  // in-place (like setPassDisabled below), never the whole record.
  setDebugOverlay: (
    settings: SettingsDraft,
    action: PayloadAction<{ key: DebugOverlayKey; enabled: boolean }>,
  ) => {
    settings.debug.overlays[action.payload.key] = action.payload.enabled;
  },
  setPassDisabled: (
    settings: SettingsDraft,
    action: PayloadAction<{ pass: string; disabled: boolean }>,
  ) => {
    // Open-world membership record (any pass name): `[name] === true` disables.
    settings.debug.disabledPasses[action.payload.pass] = action.payload.disabled;
  },
  // Override the frame's render-pass shape independently of GPU timing (Joint 1;
  // see `resolveStrategy`). 'auto' restores the timing-derived default.
  setRenderStrategy: (settings: SettingsDraft, action: PayloadAction<RenderStrategy | 'auto'>) => {
    settings.debug.renderStrategy = action.payload;
  },
  // Clip-path inspector: choose which clip to sample. The saga watches this
  // action to (re)compute the snapshot; the scrubber resets to the start.
  inspectClipPath: (settings: SettingsDraft, action: PayloadAction<ClipId>) => {
    settings.debug.clipPathInspect.clipId = action.payload;
    settings.debug.clipPathInspect.scrub01 = 0;
  },
  // Re-sample the shown clip with everything fresh EXCEPT the start pose, which
  // the seam keeps from the last Calculate — so moving the camera to view the
  // path then tuning a knob doesn't snap the start to the new viewpoint. The
  // saga watches this; state-wise it mirrors `inspectClipPath`.
  recalcClipPath: (settings: SettingsDraft, action: PayloadAction<ClipId>) => {
    settings.debug.clipPathInspect.clipId = action.payload;
    settings.debug.clipPathInspect.scrub01 = 0;
  },
  // Drop the inspected path (the "Clear" button). The saga clears the held
  // snapshot so the overlay goes quiet.
  clearClipPath: (settings: SettingsDraft) => {
    settings.debug.clipPathInspect.clipId = null;
    settings.debug.clipPathInspect.scrub01 = 0;
  },
  // Move the scrubber (a [0,1] fraction). Pure scalar write — the overlay's
  // gizmo reads it each frame and maps it to the nearest held sample.
  setClipPathScrub: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.debug.clipPathInspect.scrub01 = action.payload;
  },
  // flyPath pacing knobs the saga bakes into the clip at Calculate time — but
  // only the ones the curator has ACTIVATED (see `setClipPathTuningActive`).
  // `align` = start-aim blend seconds; `rampSec` = ease ramp seconds each end
  // (0 = use the named ease); `linger` = per-target brake depth [0,1] (0 =
  // cruise straight through). Touching a value activates that knob's override
  // (so dragging a slider is enough to opt in); Re-Calculate to apply.
  setClipPathAlign: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.debug.clipPathInspect.align = action.payload;
    settings.debug.clipPathInspect.active.align = true;
  },
  setClipPathRampSec: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.debug.clipPathInspect.rampSec = action.payload;
    settings.debug.clipPathInspect.active.rampSec = true;
  },
  // `linger` (dwell depth) and `lingerSec` (window width) are the two dwell
  // sub-knobs — they ride the ONE `linger` override gate (one dwell concept),
  // so touching either activates `linger`.
  setClipPathLinger: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.debug.clipPathInspect.linger = action.payload;
    settings.debug.clipPathInspect.active.linger = true;
  },
  setClipPathLingerSec: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.debug.clipPathInspect.lingerSec = action.payload;
    settings.debug.clipPathInspect.active.linger = true;
  },
  // Spline basis A/B: centripetal Catmull-Rom ↔ causal Hermite. `turnDelay`
  // (overshoot) and `lookAhead` (look-lead seconds) are the causal-only
  // sub-knobs — they ride the ONE `spline` override gate (they're meaningless
  // without the causal basis), so touching any of the three activates `spline`.
  setClipPathSpline: (settings: SettingsDraft, action: PayloadAction<SplineMode>) => {
    settings.debug.clipPathInspect.spline = action.payload;
    settings.debug.clipPathInspect.active.spline = true;
  },
  setClipPathTurnDelay: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.debug.clipPathInspect.turnDelay = action.payload;
    settings.debug.clipPathInspect.active.spline = true;
  },
  setClipPathLookAhead: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.debug.clipPathInspect.lookAhead = action.payload;
    settings.debug.clipPathInspect.active.spline = true;
  },
  // Fly-past: `passByOffset` (radius units) and `passByDir` are the two fly-past
  // sub-knobs — they ride the ONE `passBy` override gate (they're one
  // cinematographic concept), so touching either activates `passBy`.
  setClipPathPassByOffset: (settings: SettingsDraft, action: PayloadAction<number>) => {
    settings.debug.clipPathInspect.passByOffset = action.payload;
    settings.debug.clipPathInspect.active.passBy = true;
  },
  setClipPathPassByDir: (settings: SettingsDraft, action: PayloadAction<PassByDir>) => {
    settings.debug.clipPathInspect.passByDir = action.payload;
    settings.debug.clipPathInspect.active.passBy = true;
  },
  // Toggle a single pacing knob's override on/off. Off (the default) lets the
  // clip's own authored value flow through; the row checkbox drives this, and
  // the value setters above flip it on when the curator touches a slider.
  setClipPathTuningActive: (
    settings: SettingsDraft,
    action: PayloadAction<{ knob: ClipPathTuningKnob; active: boolean }>,
  ) => {
    settings.debug.clipPathInspect.active[action.payload.knob] = action.payload.active;
  },

  // ── snapshot merge (tour restore / mid-playback effect) ─────────────────
  // The ONE return-new-state reducer. `mergeSettingsSnapshot` does
  // `{ ...state, ...structuredClone(patch) }`; inside a case reducer `settings`
  // is an Immer draft Proxy, so spreading it directly would leak nested draft
  // proxies into the result and confuse Immer's finalizer. `current(settings)`
  // yields a plain, non-proxy snapshot of the draft so the merge returns a
  // fully-plain new state — which Immer accepts as the replacement state. This
  // reducer does NOT mutate the draft; it only returns.
  mergeSnapshot: (settings: SettingsDraft, action: PayloadAction<Partial<SettingsSnapshot>>) =>
    mergeSettingsSnapshot(current(settings), action.payload),
};

// A fragment reducer key that shadows a core one would silently win or lose
// depending on spread order below — assert it can't happen, at import time.
assertUniqueFragmentReducerKeys(APP_SETTINGS_FRAGMENTS, Object.keys(CORE_REDUCERS));

export const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    ...CORE_REDUCERS,
    ...liftClusterReducers<EngineSettingsState, typeof galaxyCatalogsSettingsFragment>(
      galaxyCatalogsSettingsFragment,
    ),
    ...liftClusterReducers<EngineSettingsState, typeof starCatalogsSettingsFragment>(
      starCatalogsSettingsFragment,
    ),
    ...liftClusterReducers<EngineSettingsState, typeof structuresSettingsFragment>(
      structuresSettingsFragment,
    ),
  },
});

export const {
  setOrientation,
  setFovDeg,
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
  setSgrAStarLensingTuning,
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
