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

import { createSlice, current, type PayloadAction } from '@reduxjs/toolkit';

import { buildInitialSettings } from './initialState';
import { buildVolumeFieldSettings } from '../../data/volume/volumeFieldDefaults';
import { mergeSettingsSnapshot } from './mergeSettingsSnapshot';
import type { ToneMapCurve } from '../../@types/data/ToneMapCurve';
import type { BiasMode } from '../../@types/data/galaxyCatalog/BiasMode';
import type { GalaxyCatalogId } from '../../@types/data/galaxyCatalog/GalaxyCatalogId';
import type { StructureId } from '../../@types/data/structure/StructureId';
import type { VolumeFieldId } from '../../@types/data/volume/VolumeFieldId';
import type { VolumeFieldSettings } from '../../@types/settings/VolumeFieldSettings';
import type { FlowFieldDefaults } from '../../@types/data/flow/FlowFieldDefaults';
import type { SettingsSnapshot } from '../../@types/engine/settings/SettingsSnapshot';

// The slice seeds the appearance knobs from `buildInitialSettings()`. The data
// tier is NOT a settings field — it lives in its own root slice (seeded via the
// store's `preloadedState`, written by the tier saga), so it never appears here.
const initialState = buildInitialSettings();

const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
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
    setHighlightFallback: (settings, action: PayloadAction<boolean>) => {
      settings.galaxyCatalogs.highlightFallback = action.payload;
    },
    setRealOnly: (settings, action: PayloadAction<boolean>) => {
      settings.galaxyCatalogs.realOnly = action.payload;
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

    // ── filaments ───────────────────────────────────────────────────────────
    setFilamentsEnabled: (settings, action: PayloadAction<boolean>) => {
      settings.filaments.enabled = action.payload;
    },
    setFilamentIntensity: (settings, action: PayloadAction<number>) => {
      settings.filaments.intensity = action.payload;
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
      settings.volumes.items[action.payload] = buildVolumeFieldSettings(action.payload);
    },
    removeVolumeField: (settings, action: PayloadAction<VolumeFieldId>) => {
      delete settings.volumes.items[action.payload];
    },
    writeVolumeField: (
      settings,
      action: PayloadAction<{ id: VolumeFieldId; patch: Partial<VolumeFieldSettings> }>,
    ) => {
      // Shallow per-field merge, matching `writeVolumeFieldSetting`'s
      // `{ ...cur, ...patch }`. An unknown id is a silent no-op.
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

    // ── debug ───────────────────────────────────────────────────────────────
    setShowPickBuffer: (settings, action: PayloadAction<boolean>) => {
      settings.debug.showPickBuffer = action.payload;
    },
    setShowDiskRadiusRing: (settings, action: PayloadAction<boolean>) => {
      settings.debug.showDiskRadiusRing = action.payload;
    },
    setPassDisabled: (settings, action: PayloadAction<{ pass: string; disabled: boolean }>) => {
      // Open-world membership record (any pass name): `[name] === true` disables.
      settings.debug.disabledPasses[action.payload.pass] = action.payload.disabled;
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
  setGalaxyCatalogSize,
  setBrightness,
  setDepthFade,
  setHighlightFallback,
  setRealOnly,
  setGalaxyCatalogVisible,
  setGalaxyCatalogLabelEnabled,
  setExposure,
  setToneMapCurve,
  setBiasMode,
  setAbsMagLimit,
  setThumbnailsEnabled,
  setMilkyWayEnabled,
  setMilkyWayLabelEnabled,
  setFilamentsEnabled,
  setFilamentIntensity,
  setVolumesEnabled,
  addVolumeField,
  removeVolumeField,
  writeVolumeField,
  setFlowEnabled,
  setFlow,
  setShowPickBuffer,
  setShowDiskRadiusRing,
  setPassDisabled,
  setStructureItemEnabled,
  setStructureLabelEnabled,
  mergeSnapshot,
} = settingsSlice.actions;

export default settingsSlice.reducer;
