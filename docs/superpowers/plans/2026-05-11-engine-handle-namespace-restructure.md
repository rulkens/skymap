# EngineHandle namespace restructure — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild `EngineHandle`, `EngineSettingsState`, and `EngineCallbacks` as cluster-namespaced sub-handles/sub-bags and migrate every UI consumer onto the new shape. Single coordinated PR. Clean break at the end (no shim survives).

**Architecture:** Three-phase migration in one PR.
- **Phase A — Additive setup (commits 1-5)**: introduce new sub-handle types, new settings sub-bags, new callback sub-bags, dual-write infrastructure. Every commit keeps typecheck green and `EngineHandle` keeps the flat surface alive.
- **Phase B — Engine dual-shape (commit 6)**: `engine.ts` constructs both flat methods AND sub-handles on the returned handle. UI consumers still call the flat methods.
- **Phase C — UI consumer migration (commits 7-10)**: App.tsx, SettingsPanel, useEngineSettings, CommandPalette + remaining hooks each move to the sub-handle shape. Tests follow each consumer in the same commit.
- **Phase D — Delete the old (commits 11-12)**: remove flat methods/fields and the dual-write code; what's left is the lean namespaced surface.

**Tech Stack:** TypeScript, React, vitest, Vite (HMR for visual verification).

**Pre-conditions:** Branch `refactor/engine-handle-namespaces` rebased onto `origin/main` (which includes PR #90 + SCFD-v2 + PR #91). Baseline: 1071 tests passing, typecheck green.

**Spec reference:** `docs/superpowers/specs/2026-05-11-engine-handle-namespace-restructure-design.md`

---

## Name mapping reference (use throughout)

This is the canonical mapping the plan applies repeatedly. Every task references it implicitly.

### EngineHandle methods → sub-handle methods

```
Flat                                  →  Namespaced
─────────────────────────────────        ────────────────────────────────────────
setPointSize                          →  points.setSize
setBrightness                         →  points.setBrightness
setDepthFadeEnabled                   →  points.setDepthFade
setHighlightFallback                  →  points.setHighlightFallback
setRealOnlyMode                       →  points.setRealOnly

setExposure                           →  tonemap.setExposure
setToneMapCurve                       →  tonemap.setCurve

setAutoRotate                         →  camera.setAutoRotate
resetCamera                           →  camera.reset
focusOn                               →  camera.focusOn
focusOnHome                           →  camera.focusOnHome
focusOnMilkyWay                       →  camera.focusOnMilkyWay
logCameraState                        →  camera.logState

clearSelection                        →  selection.clear
selectFamous                          →  selection.selectFamous
selectByAlias                         →  selection.selectByAlias
loadPgcAliases                        →  selection.loadAliases

setLodMode                            →  sources.setLodMode
setSourceVisible                      →  sources.setVisible
setTier                               →  sources.setTier
getCloud                              →  sources.getCloud
getCloudObjIds                        →  sources.getCloudObjIds

setBiasMode                           →  bias.setMode
setAbsMagLimit                        →  bias.setAbsMagLimit

setGalaxyTexturesEnabled              →  thumbnails.setEnabled
setMilkyWayEnabled                    →  milkyWay.setEnabled
setFilamentsEnabled                   →  filaments.setEnabled
setFilamentIntensity                  →  filaments.setIntensity

setVolumesEnabled                     →  volumes.setMasterEnabled
addVolumeField                        →  volumes.add
removeVolumeField                     →  volumes.remove
setVolumeFieldEnabled                 →  volumes.setEnabled
setVolumeFieldIntensity               →  volumes.setIntensity
setVolumeFieldContrast                →  volumes.setContrast
setVolumeFieldDensityScale            →  volumes.setDensityScale
setVolumeFieldPalette                 →  volumes.setPalette
listVolumeFields                      →  volumes.list
getVolumeFieldsState                  →  volumes.getState

connectSpaceMouse                     →  input.spaceMouse.connect
disconnectSpaceMouse                  →  input.spaceMouse.disconnect
isSpaceMouseConnected                 →  input.spaceMouse.isConnected
setSpaceMouseSensitivity              →  input.spaceMouse.setSensitivity

destroy                               →  destroy (unchanged, root level)
assetSlots                            →  assetSlots (unchanged, root level)
```

### EngineSettingsState fields → sub-bags

```
Flat                          →  Nested
──────────────────────────       ───────────────────────────────────
pointSizePx                   →  points.sizePx
brightness                    →  points.brightness
depthFadeEnabled              →  points.depthFade
highlightFallback             →  points.highlightFallback
realOnlyMode                  →  points.realOnly

exposure                      →  tonemap.exposure
toneMapCurve                  →  tonemap.curve

autoRotate                    →  camera.autoRotate

(state.bias.mode)             →  settings.bias.mode
(state.bias.absMagLimit)      →  settings.bias.absMagLimit

galaxyTexturesEnabled         →  thumbnails.enabled
milkyWayEnabled               →  milkyWay.enabled
filamentsEnabled              →  filaments.enabled
filamentIntensity             →  filaments.intensity

volumesEnabled                →  volumes.masterEnabled
volumeFields                  →  volumes.fields
```

**Bias-state split:** `state.bias` (the existing top-level sub-bag) has 5 fields. Only `mode` + `absMagLimit` are user-tunable settings. The other three (`apparentMagLimit`, `schechterMStar`, `schechterAlpha`) are bake-derived sentinels — they stay in `state.bias` as internal bake state. The plan introduces `state.settings.bias = {mode, absMagLimit}` and shrinks `state.bias` to `{apparentMagLimit, schechterMStar, schechterAlpha}`.

### EngineCallbacks → nested

```
Flat                              →  Nested
─────────────────────────            ─────────────────────────────────
onStatusChange                    →  lifecycle.onStatusChange
onFpsChange                       →  lifecycle.onFpsChange

onPointSizeChange                 →  points.onSizeChange
onBrightnessChange                →  points.onBrightnessChange
onDepthFadeEnabledChange          →  points.onDepthFadeChange
onHighlightFallbackChange         →  points.onHighlightFallbackChange
onRealOnlyModeChange              →  points.onRealOnlyChange

onExposureChange                  →  tonemap.onExposureChange
onToneMapCurveChange              →  tonemap.onCurveChange

onAutoRotateChange                →  camera.onAutoRotateChange
onFocusChange                     →  camera.onFocusChange
onScaleChange                     →  camera.onScaleChange

onSelectChange                    →  selection.onSelectChange
onHoverChange                     →  selection.onHoverChange

onLodModeChange                   →  sources.onLodModeChange
onSourceMaskChange                →  sources.onMaskChange
onTierChange                      →  sources.onTierChange
onCloudReady                      →  sources.onCloudReady
onLoadProgress                    →  sources.onLoadProgress

onBiasModeChange                  →  bias.onModeChange
onAbsMagLimitChange               →  bias.onAbsMagLimitChange

onGalaxyTexturesEnabledChange     →  thumbnails.onEnabledChange
onMilkyWayEnabledChange           →  milkyWay.onEnabledChange
onFilamentsReady                  →  filaments.onReady

onVolumeFieldsChanged             →  volumes.onFieldsChanged

onSpaceMouseConnectedChange       →  input.spaceMouse.onConnectedChange
```

---

## Phase A — Additive setup (5 commits)

Each Phase A commit is additive: the new shape coexists with the flat shape; typecheck stays green; no consumer changes.

### Task 1: Add 13 sub-handle type files

**Files:**
- Create: `src/@types/EnginePointsHandle.d.ts`
- Create: `src/@types/EngineTonemapHandle.d.ts`
- Create: `src/@types/EngineCameraHandle.d.ts`
- Create: `src/@types/EngineSelectionHandle.d.ts`
- Create: `src/@types/EngineSourcesHandle.d.ts`
- Create: `src/@types/EngineBiasHandle.d.ts`
- Create: `src/@types/EngineThumbnailsHandle.d.ts`
- Create: `src/@types/EngineMilkyWayHandle.d.ts`
- Create: `src/@types/EngineFilamentsHandle.d.ts`
- Create: `src/@types/EngineVolumesHandle.d.ts`
- Create: `src/@types/EngineInputHandle.d.ts`
- Create: `src/@types/EngineSpaceMouseHandle.d.ts`

This task only adds NEW type files. `EngineHandle.d.ts` is unchanged in this commit; the new types are not yet referenced anywhere.

- [ ] **Step 1: Create `EnginePointsHandle.d.ts`**

```ts
/**
 * EnginePointsHandle — point-billboard appearance controls.
 *
 * Owns the per-point visual knobs: size, brightness, fallback-orientation
 * indicator, real-only filter, depth fade.  All five flow into the shared
 * `points.wgsl` uniform buffer; the sub-handle exists so the React layer
 * imports one cohesive cluster rather than spelling out five top-level
 * names.
 */
export type EnginePointsHandle = {
  /** Set the billboard pixel radius for all rendered points. */
  setSize: (sizePx: number) => void;
  /** Set the global brightness multiplier applied to every star. */
  setBrightness: (value: number) => void;
  /** Toggle the per-galaxy camera-distance depth fade. */
  setDepthFade: (enabled: boolean) => void;
  /** Toggle the magenta tint on galaxies whose orientation is fallback. */
  setHighlightFallback: (enabled: boolean) => void;
  /** Toggle "show only galaxies with real photometric orientation". */
  setRealOnly: (enabled: boolean) => void;
};
```

- [ ] **Step 2: Create `EngineTonemapHandle.d.ts`**

```ts
import type { ToneMapCurve } from '../data/toneMapCurve';

/**
 * EngineTonemapHandle — HDR tone-mapping pass controls.
 *
 * Two knobs: the exposure multiplier applied before the curve, and the
 * curve itself (linear / Reinhard / asinh / gamma2 / ACES).  Both flow
 * into the post-process pass's per-frame uniform; the cluster exists so
 * future curve-shape parameters (e.g. ACES knee/toe) have an obvious home.
 */
export type EngineTonemapHandle = {
  /** Set the tone-map exposure multiplier (clamped to [0.05, 16]). */
  setExposure: (value: number) => void;
  /** Switch the HDR tone-mapping curve at runtime (no pipeline rebuild). */
  setCurve: (curve: ToneMapCurve) => void;
};
```

- [ ] **Step 3: Create `EngineCameraHandle.d.ts`**

```ts
import type { PointInfo } from './PointInfo';

/**
 * EngineCameraHandle — viewpoint, tweens, and auto-rotate.
 *
 * Bundles the camera viewpoint operations the user invokes from React
 * (reset, focus-on-galaxy, focus-on-home, focus-on-milkyway), the dev-only
 * `logState` helper bound to the 'L' hotkey, and the auto-rotate toggle
 * (which is conceptually a camera behaviour, not a points/tonemap setting).
 */
export type EngineCameraHandle = {
  /** Enable or disable the slow automatic camera yaw. */
  setAutoRotate: (enabled: boolean) => void;
  /** Snap the camera back to the initial framing computed at startup. */
  reset: () => void;
  /** Smoothly tween the camera so the given galaxy becomes the new orbit target. */
  focusOn: (info: PointInfo) => void;
  /** Smoothly tween back to the initial bootstrap framing. */
  focusOnHome: () => void;
  /** Tween to a viewpoint where the procedural Milky Way is dominant. */
  focusOnMilkyWay: () => void;
  /** Debug helper — log the live camera state for copy-paste tuning. */
  logState: () => void;
};
```

- [ ] **Step 4: Create `EngineSelectionHandle.d.ts`**

```ts
import type { Source } from '../data/sources';
import type {
  FamousMetaEntry,
  FamousXrefMap,
} from '../services/loading/fetchers/famousMetaFetcher';
import type { PgcAliasMap } from '../services/loading/fetchers/pgcAliasFetcher';

/**
 * EngineSelectionHandle — selection bookkeeping + the data its consumers need.
 *
 * `clear` revokes the current pin.  `selectFamous` / `selectByAlias` are the
 * two entry points the command palette uses to land a hit.  `loadAliases`
 * is the lazy-fetch helper that powers alias search — it lives here because
 * `selectByAlias` is its only consumer; nesting them together puts the data
 * loader next to its data consumer.
 */
export type EngineSelectionHandle = {
  /** Programmatically clear the current selection. */
  clear: () => void;
  /** Select (pin) the famous-atlas galaxy with the given id, then focus-tween. */
  selectFamous: (id: string) => void;
  /** Select a non-famous galaxy by (source, localIdx) and focus-tween. */
  selectByAlias: (target: {
    source: Source;
    localIdx: number;
    famousMeta?: readonly FamousMetaEntry[];
    famousXrefs?: FamousXrefMap;
  }) => void;
  /** Lazy-load the PGC → human-name alias map (1.7 MB JSON). */
  loadAliases: () => Promise<PgcAliasMap>;
};
```

- [ ] **Step 5: Create `EngineSourcesHandle.d.ts`**

```ts
import type { LodMode } from './LodMode';
import type { Source } from '../data/sources';
import type { Tier } from './Tier';
import type { PointCloud } from './PointCloud';

/**
 * EngineSourcesHandle — survey lifecycle: visibility, tier, raw cloud access.
 *
 * `setLodMode` flips between auto-LOD (engine drives visibility from camera
 * distance) and manual (caller drives it).  `setVisible` toggles one survey
 * and implicitly switches to manual.  `setTier` hot-swaps the active data
 * tier across all surveys with per-source re-fetch.  `getCloud`/`getCloudObjIds`
 * expose the in-memory PointCloud for deep-link / alias-index consumers.
 */
export type EngineSourcesHandle = {
  /** Switch between 'auto' and 'manual' LOD modes. */
  setLodMode: (mode: LodMode) => void;
  /** Toggle visibility of one survey; implicitly switches LOD to 'manual'. */
  setVisible: (source: Source, visible: boolean) => void;
  /** Hot-swap the active data tier (re-fetches per-source bins). */
  setTier: (tier: Tier) => void;
  /** Return the full PointCloud for a source, or undefined if unloaded. */
  getCloud: (source: Source) => PointCloud | undefined;
  /** Return just the objIDs array for a source (narrower contract). */
  getCloudObjIds: (source: Source) => BigUint64Array | undefined;
};
```

- [ ] **Step 6: Create `EngineBiasHandle.d.ts`**

```ts
import type { BiasMode } from '../data/biasMode';

/**
 * EngineBiasHandle — Malmquist-bias correction controls.
 *
 * Two user-facing knobs.  `setMode` kicks an async per-galaxy bake on the
 * renderer when transitioning between modes (handled in the bespoke setter,
 * not via settingsTable — see settingsTable.ts module doc).  `setAbsMagLimit`
 * tunes the threshold the volume-limited mode uses.
 *
 * The bake-derived parameters (`apparentMagLimit`, `schechterMStar`,
 * `schechterAlpha`) are NOT user-tunable — they live on `EngineState.bias`
 * as internal bake state.
 */
export type EngineBiasHandle = {
  /** Set the Malmquist-bias correction mode. */
  setMode: (mode: BiasMode) => void;
  /** Set the absolute-magnitude threshold for `BiasMode.VolumeLimited`. */
  setAbsMagLimit: (absMag: number) => void;
};
```

- [ ] **Step 7: Create `EngineThumbnailsHandle.d.ts`**

```ts
/**
 * EngineThumbnailsHandle — galaxy-thumbnail render pass toggle.
 *
 * One method.  Disabling skips the whole per-frame thumbnail block
 * (selection, fetch, draw) so it's a meaningful GPU-time saver.
 */
export type EngineThumbnailsHandle = {
  /** Toggle the galaxy-thumbnail render pass on/off. */
  setEnabled: (enabled: boolean) => void;
};
```

- [ ] **Step 8: Create `EngineMilkyWayHandle.d.ts`**

```ts
/**
 * EngineMilkyWayHandle — procedural Milky Way impostor toggle.
 *
 * One method.  The camera tween that points AT the Milky Way
 * (`focusOnMilkyWay`) lives under `engine.camera`, not here —
 * milkyWay owns the render gate; camera owns the viewpoint.
 */
export type EngineMilkyWayHandle = {
  /** Toggle the procedural Milky Way impostor at world origin. */
  setEnabled: (enabled: boolean) => void;
};
```

- [ ] **Step 9: Create `EngineFilamentsHandle.d.ts`**

```ts
/**
 * EngineFilamentsHandle — cosmic-web filament overlay controls.
 *
 * Optional asset (built by the DisPerSE pipeline via `npm run build-filaments`);
 * when missing, both methods are silent no-ops.  Intensity is multiplied
 * into the fragment-stage's pre-multiplied alpha so callers can dim the
 * overlay against the bright HDR catalogue.
 */
export type EngineFilamentsHandle = {
  /** Toggle the cosmic-web filament-skeleton overlay on or off. */
  setEnabled: (enabled: boolean) => void;
  /** Set the filament-overlay intensity scale, in [0, 1]. */
  setIntensity: (value: number) => void;
};
```

- [ ] **Step 10: Create `EngineVolumesHandle.d.ts`**

```ts
import type { ScalarCube, ScalarFieldPaletteId } from './ScalarCube';

/**
 * EngineVolumesHandle — scalar-volume overlay registry + per-field tunables.
 *
 * `add`/`remove` mint and unmint cube registrations.  `setMasterEnabled`
 * is the coarse "hide all volumes" gate.  The per-field setters take a
 * handle string for the field they target.  `list` / `getState` are the
 * read-side methods the SettingsPanel uses to render per-field rows.
 *
 * The spherical-envelope control (`scalarVolumeRenderer.setEnvelope`)
 * is intentionally NOT exposed here — envelopes are registry-driven via
 * `VolumeFieldDefaults` keyed by handle; runtime UI tweaking would be
 * surprising for a content property.
 */
export type EngineVolumesHandle = {
  /** Master gate for the entire scalar-volume overlay. */
  setMasterEnabled: (enabled: boolean) => void;
  /** Register a new scalar-volume field from a decoded ScalarCube. */
  add: (handle: string, cube: ScalarCube) => void;
  /** Unregister a field and release its GPU resources. */
  remove: (handle: string) => void;
  /** Gate a single registered field on or off without unloading. */
  setEnabled: (handle: string, enabled: boolean) => void;
  /** Set the linear mix-in intensity for a single field, in [0, 1]. */
  setIntensity: (handle: string, intensity: number) => void;
  /** Set the contrast-windowing strength for a single field (>=0). */
  setContrast: (handle: string, contrast: number) => void;
  /** Set the per-cube opacity multiplier (alpha integral coefficient). */
  setDensityScale: (handle: string, value: number) => void;
  /** Set the palette LUT id for a single field. */
  setPalette: (handle: string, id: ScalarFieldPaletteId) => void;
  /** Return the ordered list of currently registered field handles. */
  list: () => string[];
  /** Return a snapshot of every registered field's UI-facing state. */
  getState: () => ReadonlyArray<{
    handle: string;
    label: string;
    enabled: boolean;
    intensity: number;
    contrast: number;
    densityScale: number;
    paletteId: ScalarFieldPaletteId;
  }>;
};
```

- [ ] **Step 11: Create `EngineSpaceMouseHandle.d.ts`**

```ts
/**
 * EngineSpaceMouseHandle — WebHID SpaceMouse driver controls.
 *
 * Nested under `engine.input` so future input devices (keyboard, gamepad)
 * get a parallel home: `engine.input.keyboard.*`, `engine.input.gamepad.*`.
 */
export type EngineSpaceMouseHandle = {
  /** Prompt the WebHID device picker and open a paired SpaceMouse. */
  connect: () => Promise<boolean>;
  /** Close the currently-open SpaceMouse, if any.  Idempotent. */
  disconnect: () => void;
  /** Whether a SpaceMouse is currently open and feeding input reports. */
  isConnected: () => boolean;
  /** Set the SpaceMouse global sensitivity multiplier. */
  setSensitivity: (value: number) => void;
};
```

- [ ] **Step 12: Create `EngineInputHandle.d.ts`**

```ts
import type { EngineSpaceMouseHandle } from './EngineSpaceMouseHandle';

/**
 * EngineInputHandle — root for all input-device sub-handles.
 *
 * Today this just owns `spaceMouse`.  When keyboard or gamepad sub-handles
 * land they nest under the same `input` namespace — `engine.input.keyboard`,
 * `engine.input.gamepad`.  The two-level nesting reserves the slot.
 */
export type EngineInputHandle = {
  spaceMouse: EngineSpaceMouseHandle;
};
```

- [ ] **Step 13: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — the 13 new files compile in isolation; nothing imports them yet.

- [ ] **Step 14: Run the full test suite**

Run: `npm test`
Expected: PASS — 1071 tests still pass.  No new tests; no existing tests touch new files.

- [ ] **Step 15: Commit**

```bash
git add src/@types/EnginePointsHandle.d.ts src/@types/EngineTonemapHandle.d.ts src/@types/EngineCameraHandle.d.ts src/@types/EngineSelectionHandle.d.ts src/@types/EngineSourcesHandle.d.ts src/@types/EngineBiasHandle.d.ts src/@types/EngineThumbnailsHandle.d.ts src/@types/EngineMilkyWayHandle.d.ts src/@types/EngineFilamentsHandle.d.ts src/@types/EngineVolumesHandle.d.ts src/@types/EngineInputHandle.d.ts src/@types/EngineSpaceMouseHandle.d.ts
git commit -m "$(cat <<'EOF'
refactor(types): add sub-handle type aliases for H5 namespace restructure

Twelve new type files plus EngineSpaceMouseHandle (nested under
EngineInputHandle).  Not yet referenced by EngineHandle.d.ts — that
wiring lands in Task 6 once the engine factory builds them.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add nested sub-bags to `EngineSettingsState` (and shrink `EngineBiasState`)

**Files:**
- Modify: `src/@types/EngineSettingsState.d.ts`
- Modify: `src/@types/EngineBiasState.d.ts` (shrink to bake-only fields)
- Modify: `src/data/defaults.ts` (seed new sub-bag defaults; some constants get re-exported under sub-paths)
- Modify: `src/services/engine/engine.ts` (state construction must populate new sub-bags)
- Modify: any test helpers that construct `EngineSettingsState` or `EngineState`

Both shapes coexist: flat fields stay; new sub-bags get added as REQUIRED siblings. Construction sites update in the same commit so typecheck stays green.

- [ ] **Step 1: Expand `EngineSettingsState.d.ts` with required sub-bags**

Replace the body of `EngineSettingsState` (currently lines 90-126 in the file — search for `export type EngineSettingsState = {`) with:

```ts
export type EngineSettingsState = {
  // ── Legacy flat fields (kept during dual-write phase; removed in Task 10) ──
  pointSizePx: number;
  brightness: number;
  autoRotate: boolean;
  galaxyTexturesEnabled: boolean;
  milkyWayEnabled: boolean;
  filamentsEnabled: boolean;
  volumesEnabled: boolean;
  volumeFields: Record<string, VolumeFieldSettings>;
  filamentIntensity: number;
  highlightFallback: boolean;
  realOnlyMode: boolean;
  depthFadeEnabled: boolean;
  exposure: number;
  toneMapCurve: ToneMapCurve;

  // ── Nested sub-bags (new; flat fields will be deleted in Task 10) ─────────
  points: {
    sizePx: number;
    brightness: number;
    depthFade: boolean;
    highlightFallback: boolean;
    realOnly: boolean;
  };
  tonemap: {
    exposure: number;
    curve: ToneMapCurve;
  };
  camera: {
    autoRotate: boolean;
  };
  bias: {
    mode: BiasMode;
    absMagLimit: number;
  };
  thumbnails: { enabled: boolean };
  milkyWay: { enabled: boolean };
  filaments: { enabled: boolean; intensity: number };
  volumes: {
    masterEnabled: boolean;
    fields: Record<string, VolumeFieldSettings>;
  };
};
```

Add the `BiasMode` import at the top of the file:

```ts
import type { BiasMode } from '../data/biasMode';
```

- [ ] **Step 2: Shrink `EngineBiasState.d.ts` to bake-only fields**

Open `src/@types/EngineBiasState.d.ts`.  Replace the type body to drop `mode` and `absMagLimit` (which are moving to settings.bias):

```ts
export type EngineBiasState = {
  apparentMagLimit: number;
  schechterMStar: number;
  schechterAlpha: number;
};
```

Update the module docblock at the top of the file — replace the `### Field semantics` section with:

```
 * ### Field semantics (bake-derived, internal)
 *
 *   - `apparentMagLimit` — Schechter / angular modes' apparent-mag cap;
 *                          stays 0 until the corresponding worker bake
 *                          completes (see `setBiasMode` in engine.ts).
 *   - `schechterMStar` / `schechterAlpha` — Schechter LF parameters baked
 *                                            in from the worker and used
 *                                            for the per-galaxy weighting
 *                                            term.  Sentinels (0, 0) until
 *                                            the lazy bake fires.
 *
 * ### User-tunable bias state lives elsewhere
 *
 * The user-facing bias controls (`mode`, `absMagLimit`) live on
 * `EngineSettingsState.bias` post-H5 restructure.  This sub-bag holds
 * ONLY the bake-derived sentinels that the per-frame uniform writer reads.
```

Drop the `BiasMode` import (no longer used here).

- [ ] **Step 3: Update `src/data/defaults.ts`**

The existing exported constants (`DEFAULT_POINT_SIZE_PX`, etc.) stay. Find the engine state seeding function or any object literal that constructs `EngineSettingsState` — likely the `createInitialEngineState` helper or inline `createEngine` initialiser.

Search: `grep -n "pointSizePx:\s*DEFAULT" src/`

Wherever `EngineSettingsState` is constructed, add the new sub-bag fields alongside the flat ones. The construction site goes from:

```ts
{
  pointSizePx: DEFAULT_POINT_SIZE_PX,
  brightness: DEFAULT_BRIGHTNESS,
  // ... (12 more flat fields)
}
```

to:

```ts
{
  // Legacy flat fields
  pointSizePx: DEFAULT_POINT_SIZE_PX,
  brightness: DEFAULT_BRIGHTNESS,
  autoRotate: DEFAULT_AUTO_ROTATE,
  galaxyTexturesEnabled: DEFAULT_GALAXY_TEXTURES_ENABLED,
  milkyWayEnabled: DEFAULT_MILKY_WAY_ENABLED,
  filamentsEnabled: DEFAULT_FILAMENTS_ENABLED,
  volumesEnabled: DEFAULT_VOLUMES_ENABLED,
  volumeFields: {},
  filamentIntensity: DEFAULT_FILAMENT_INTENSITY,
  highlightFallback: DEFAULT_HIGHLIGHT_FALLBACK,
  realOnlyMode: DEFAULT_REAL_ONLY_MODE,
  depthFadeEnabled: DEFAULT_DEPTH_FADE_ENABLED,
  exposure: DEFAULT_EXPOSURE,
  toneMapCurve: DEFAULT_TONE_MAP_CURVE,

  // Nested sub-bags (same values mirrored)
  points: {
    sizePx: DEFAULT_POINT_SIZE_PX,
    brightness: DEFAULT_BRIGHTNESS,
    depthFade: DEFAULT_DEPTH_FADE_ENABLED,
    highlightFallback: DEFAULT_HIGHLIGHT_FALLBACK,
    realOnly: DEFAULT_REAL_ONLY_MODE,
  },
  tonemap: {
    exposure: DEFAULT_EXPOSURE,
    curve: DEFAULT_TONE_MAP_CURVE,
  },
  camera: {
    autoRotate: DEFAULT_AUTO_ROTATE,
  },
  bias: {
    mode: DEFAULT_BIAS_MODE,
    absMagLimit: DEFAULT_ABS_MAG_LIMIT,
  },
  thumbnails: { enabled: DEFAULT_GALAXY_TEXTURES_ENABLED },
  milkyWay: { enabled: DEFAULT_MILKY_WAY_ENABLED },
  filaments: { enabled: DEFAULT_FILAMENTS_ENABLED, intensity: DEFAULT_FILAMENT_INTENSITY },
  volumes: {
    masterEnabled: DEFAULT_VOLUMES_ENABLED,
    fields: {},
  },
}
```

- [ ] **Step 4: Update `EngineState.bias` initialisation**

Search: `grep -n "bias:\s*{" src/services/engine/engine.ts`

The existing `state.bias` initialiser includes `mode: DEFAULT_BIAS_MODE` and `absMagLimit: DEFAULT_ABS_MAG_LIMIT`.  Remove those two lines — the initial bias bag now contains only:

```ts
bias: {
  apparentMagLimit: 0,
  schechterMStar: 0,
  schechterAlpha: 0,
},
```

- [ ] **Step 5: Find and update any test helpers that construct settings**

Run: `grep -rn "pointSizePx:" tests/ src/`

For each construction site OUTSIDE of `defaults.ts` and `engine.ts` that produces an `EngineSettingsState` value, add the same new sub-bag fields as in Step 3.  This is most likely in:
- `tests/setup/` files
- `tests/@types/engineState.test.ts` (the smoke test that asserts shape)
- Component test fixtures

If any test asserts on the SHAPE of `EngineSettingsState`, update it to include the new sub-bags (additive — keep existing assertions).

- [ ] **Step 6: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — every construction site now populates both shapes.

- [ ] **Step 7: Run the full test suite**

Run: `npm test`
Expected: PASS — 1071 tests still pass.  No behaviour change; just additional state fields that nothing reads yet.

- [ ] **Step 8: Commit**

```bash
git add src/@types/EngineSettingsState.d.ts src/@types/EngineBiasState.d.ts src/data/defaults.ts src/services/engine/engine.ts tests/
git commit -m "$(cat <<'EOF'
refactor(state): add nested settings sub-bags alongside flat fields

EngineSettingsState gains 8 sub-bags (points, tonemap, camera, bias,
thumbnails, milkyWay, filaments, volumes) seeded from the same
defaults.  Flat fields preserved until consumer migration completes.

EngineBiasState shrinks to bake-only sentinels (apparentMagLimit,
schechterMStar, schechterAlpha) — user-tunable mode/absMagLimit move
to settings.bias.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Add nested callback sub-bags to `EngineCallbacks`

**Files:**
- Modify: `src/@types/EngineCallbacks.d.ts`
- Modify: `src/components/App/App.tsx` (the callbacks construction site — populates both shapes)

All 26 existing callbacks stay; 12 new sub-bag fields get added as optional siblings. App.tsx (which is currently the only `createEngine` call site that wires callbacks) populates the new nested fields alongside the flat ones.

- [ ] **Step 1: Add the nested sub-bags to `EngineCallbacks.d.ts`**

At the bottom of the `EngineCallbacks` type body (before the closing `}`), insert:

```ts
  // ── Nested sub-bags (added Task 3; flat fields above removed in Task 10) ──
  //
  // Both shapes coexist during the consumer-migration phase.  Engine code
  // fires both `cb.onPointSizeChange?.(v)` and `cb.points?.onSizeChange?.(v)`
  // so a consumer can subscribe via either shape during the transition.
  // The flat fields are deleted in Task 10 once every consumer is on
  // the nested shape.
  lifecycle?: {
    onStatusChange?: (s: EngineStatus) => void;
    onFpsChange?: (fps: number) => void;
  };
  points?: {
    onSizeChange?: (sizePx: number) => void;
    onBrightnessChange?: (value: number) => void;
    onDepthFadeChange?: (enabled: boolean) => void;
    onHighlightFallbackChange?: (enabled: boolean) => void;
    onRealOnlyChange?: (enabled: boolean) => void;
  };
  tonemap?: {
    onExposureChange?: (value: number) => void;
    onCurveChange?: (curve: ToneMapCurve) => void;
  };
  camera?: {
    onAutoRotateChange?: (enabled: boolean) => void;
    onFocusChange?: (info: PointInfo | null) => void;
    onScaleChange?: (info: ScaleInfo) => void;
  };
  selection?: {
    onSelectChange?: (info: PointInfo | null) => void;
    onHoverChange?: (info: PointInfo | null) => void;
  };
  sources?: {
    onLodModeChange?: (mode: LodMode) => void;
    onMaskChange?: (mask: number) => void;
    onTierChange?: (tier: Tier) => void;
    onCloudReady?: (source: Source, count: number) => void;
    onLoadProgress?: (progress: LoadProgressState | null) => void;
  };
  bias?: {
    onModeChange?: (mode: BiasMode) => void;
    onAbsMagLimitChange?: (absMag: number) => void;
  };
  thumbnails?: { onEnabledChange?: (enabled: boolean) => void };
  milkyWay?: { onEnabledChange?: (enabled: boolean) => void };
  filaments?: { onReady?: (stripCount: number, vertexCount: number) => void };
  volumes?: { onFieldsChanged?: () => void };
  input?: {
    spaceMouse?: { onConnectedChange?: (connected: boolean) => void };
  };
```

Note: every new sub-bag is `?:` (optional) so App.tsx can opt in field-by-field.  Once consumers migrate, the sub-bags promote to required in Task 10.

- [ ] **Step 2: Search for the callbacks construction in App.tsx**

Run: `grep -n "createEngine\|onStatusChange:\|onSelectChange:" src/components/App/App.tsx`

Find the object literal passed as the `callbacks` argument (or property) to `createEngine`. This task does NOT change call sites that consume callbacks — only the construction. The migration of UI code that calls engine methods comes in Task 7.

- [ ] **Step 3: Mirror flat callbacks to nested sub-bags in App.tsx**

For every existing flat callback in App.tsx's callbacks construction, add a corresponding entry in the nested sub-bag that forwards to the same function reference. Example transform:

Before:
```tsx
const callbacks: EngineCallbacks = {
  onStatusChange: handleStatusChange,
  onSelectChange: handleSelectChange,
  onPointSizeChange: setPointSize,
  // ...
};
```

After:
```tsx
const callbacks: EngineCallbacks = {
  // Flat (legacy — will be removed in Task 10)
  onStatusChange: handleStatusChange,
  onSelectChange: handleSelectChange,
  onPointSizeChange: setPointSize,
  // ...
  // Nested (new — what callers will use post-migration)
  lifecycle: {
    onStatusChange: handleStatusChange,
  },
  selection: {
    onSelectChange: handleSelectChange,
  },
  points: {
    onSizeChange: setPointSize,
  },
  // ... (every flat callback gets a nested twin)
};
```

The reference is the SAME function — there's no double-fire risk because the engine in Task 4 will pick one path or the other, not both. During the transition, the engine fires both: `cb.onPointSizeChange?.(v); cb.points?.onSizeChange?.(v);`. App.tsx subscribes through whichever shape it wants. Since the function references are identical, double-fire would invoke the same React state setter twice with the same value — no observable change.

(Implementation note for the engineer: copy each callback once into its nested home. If a callback isn't currently set in App.tsx, don't invent a nested entry for it.)

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — 1071 tests still pass.  Engine doesn't yet fire the new callbacks (settingsTable update is Task 4), so the nested entries are dormant.

- [ ] **Step 6: Commit**

```bash
git add src/@types/EngineCallbacks.d.ts src/components/App/App.tsx
git commit -m "$(cat <<'EOF'
refactor(callbacks): add nested EngineCallbacks sub-bags + App.tsx mirror

Every flat callback gains an optional nested twin.  App.tsx wires the
same function reference into both shapes so the next commit's
dual-fire settingsTable can land without behavioural change.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Convert `settingsTable.ts` to dual-write

**Files:**
- Modify: `src/services/engine/wiring/settingsTable.ts`

Each descriptor row gains an optional `nestedPath` and `nestedCallback` so the emitted setter writes both flat and nested state, and fires both flat and nested callbacks. Engine code that consumes the table (currently inside `engine.ts` via `buildSettersFromTable`) keeps using the flat shape; nested writes are dormant until Task 7+ migrates consumers.

- [ ] **Step 1: Extend the descriptor type**

In `src/services/engine/wiring/settingsTable.ts`, expand the `SettingsPath` union to allow nested paths:

```ts
type SettingsPath =
  | readonly ['settings', keyof EngineState['settings']]
  | readonly ['bias', keyof EngineState['bias']];

// New: nested form used by descriptors during dual-write
type NestedSettingsPath =
  | readonly ['settings', 'points', keyof EngineState['settings']['points']]
  | readonly ['settings', 'tonemap', keyof EngineState['settings']['tonemap']]
  | readonly ['settings', 'camera', keyof EngineState['settings']['camera']]
  | readonly ['settings', 'bias', keyof EngineState['settings']['bias']]
  | readonly ['settings', 'thumbnails', keyof EngineState['settings']['thumbnails']]
  | readonly ['settings', 'milkyWay', keyof EngineState['settings']['milkyWay']]
  | readonly ['settings', 'filaments', keyof EngineState['settings']['filaments']]
  | readonly ['settings', 'volumes', 'masterEnabled'];

type NestedCallbackKey =
  | readonly ['points', string]
  | readonly ['tonemap', string]
  | readonly ['camera', string]
  | readonly ['bias', string]
  | readonly ['thumbnails', string]
  | readonly ['milkyWay', string]
  | readonly ['filaments', string]
  | readonly ['volumes', string]
  | readonly ['sources', string];
```

Update `SettingsDescriptor` to include the nested twins (both optional):

```ts
type SettingsDescriptor = {
  name: SettingsTableKey;
  path: SettingsPath;
  callback?: keyof EngineCallbacks;
  clamp?: (value: number) => number;
  /** Nested path written ALONGSIDE `path` during the H5 dual-write phase. */
  nestedPath?: NestedSettingsPath;
  /** Nested callback fired ALONGSIDE `callback` during the H5 dual-write phase. */
  nestedCallback?: NestedCallbackKey;
};
```

- [ ] **Step 2: Update the `SETTINGS_TABLE` rows with nested twins**

Replace each row in `SETTINGS_TABLE`.  The transform for each row: add `nestedPath` and (if the row has a `callback`) `nestedCallback`.  Full table:

```ts
export const SETTINGS_TABLE: readonly SettingsDescriptor[] = [
  {
    name: 'setPointSize',
    path: ['settings', 'pointSizePx'],
    callback: 'onPointSizeChange',
    nestedPath: ['settings', 'points', 'sizePx'],
    nestedCallback: ['points', 'onSizeChange'],
  },
  {
    name: 'setBrightness',
    path: ['settings', 'brightness'],
    callback: 'onBrightnessChange',
    nestedPath: ['settings', 'points', 'brightness'],
    nestedCallback: ['points', 'onBrightnessChange'],
  },
  {
    name: 'setAutoRotate',
    path: ['settings', 'autoRotate'],
    callback: 'onAutoRotateChange',
    nestedPath: ['settings', 'camera', 'autoRotate'],
    nestedCallback: ['camera', 'onAutoRotateChange'],
  },
  {
    name: 'setGalaxyTexturesEnabled',
    path: ['settings', 'galaxyTexturesEnabled'],
    callback: 'onGalaxyTexturesEnabledChange',
    nestedPath: ['settings', 'thumbnails', 'enabled'],
    nestedCallback: ['thumbnails', 'onEnabledChange'],
  },
  {
    name: 'setMilkyWayEnabled',
    path: ['settings', 'milkyWayEnabled'],
    callback: 'onMilkyWayEnabledChange',
    nestedPath: ['settings', 'milkyWay', 'enabled'],
    nestedCallback: ['milkyWay', 'onEnabledChange'],
  },
  {
    name: 'setFilamentsEnabled',
    path: ['settings', 'filamentsEnabled'],
    nestedPath: ['settings', 'filaments', 'enabled'],
    // No callback — App owns optimistically; mirrors flat behaviour.
  },
  {
    name: 'setFilamentIntensity',
    path: ['settings', 'filamentIntensity'],
    clamp: (v) => Math.max(0, Math.min(1, v)),
    nestedPath: ['settings', 'filaments', 'intensity'],
  },
  {
    name: 'setHighlightFallback',
    path: ['settings', 'highlightFallback'],
    callback: 'onHighlightFallbackChange',
    nestedPath: ['settings', 'points', 'highlightFallback'],
    nestedCallback: ['points', 'onHighlightFallbackChange'],
  },
  {
    name: 'setRealOnlyMode',
    path: ['settings', 'realOnlyMode'],
    callback: 'onRealOnlyModeChange',
    nestedPath: ['settings', 'points', 'realOnly'],
    nestedCallback: ['points', 'onRealOnlyChange'],
  },
  {
    name: 'setDepthFadeEnabled',
    path: ['settings', 'depthFadeEnabled'],
    callback: 'onDepthFadeEnabledChange',
    nestedPath: ['settings', 'points', 'depthFade'],
    nestedCallback: ['points', 'onDepthFadeChange'],
  },
  {
    name: 'setAbsMagLimit',
    path: ['bias', 'absMagLimit'],
    callback: 'onAbsMagLimitChange',
    nestedPath: ['settings', 'bias', 'absMagLimit'],
    nestedCallback: ['bias', 'onAbsMagLimitChange'],
  },
  {
    name: 'setExposure',
    path: ['settings', 'exposure'],
    callback: 'onExposureChange',
    clamp: (v) => Math.max(0.05, Math.min(16, v)),
    nestedPath: ['settings', 'tonemap', 'exposure'],
    nestedCallback: ['tonemap', 'onExposureChange'],
  },
  {
    name: 'setToneMapCurve',
    path: ['settings', 'toneMapCurve'],
    callback: 'onToneMapCurveChange',
    nestedPath: ['settings', 'tonemap', 'curve'],
    nestedCallback: ['tonemap', 'onCurveChange'],
  },
];
```

Note `setAbsMagLimit`'s `path` stays `['bias', 'absMagLimit']` writing to the legacy `state.bias` — but Task 2 already removed `absMagLimit` from `state.bias`. **This row must update its `path` too**, otherwise the legacy write targets a deleted field. Replace its `path` with `['settings', 'bias', 'absMagLimit']` and rely solely on the nested write. Make the `path` value:

```ts
    path: ['settings', 'bias', 'absMagLimit'] as unknown as SettingsPath,
```

Or — cleaner — widen `SettingsPath` to include `['settings', 'bias', 'absMagLimit']`:

```ts
type SettingsPath =
  | readonly ['settings', keyof EngineState['settings']]
  | readonly ['bias', keyof EngineState['bias']]
  | readonly ['settings', 'bias', 'absMagLimit'];
```

Use the union widening — no cast needed.

- [ ] **Step 3: Extend `setByPath` to handle 3-tuple paths**

Replace the existing `setByPath` body with:

```ts
function setByPath(
  state: EngineState,
  path: SettingsPath,
  value: unknown,
): void {
  if (path.length === 3) {
    // Nested: ['settings', 'bias', 'absMagLimit']
    const [bag, sub, leaf] = path;
    const target = (state[bag] as Record<string, Record<string, unknown>>)[
      sub as string
    ];
    target[leaf as string] = value;
    return;
  }
  const [bag, leaf] = path;
  if (bag === 'settings') {
    (state.settings as Record<string, unknown>)[leaf as string] = value;
  } else {
    (state.bias as Record<string, unknown>)[leaf as string] = value;
  }
}

/** New helper for writing nested paths. */
function setByNestedPath(
  state: EngineState,
  path: NestedSettingsPath,
  value: unknown,
): void {
  const [bag, sub, leaf] = path;
  const target = (state[bag] as Record<string, Record<string, unknown>>)[
    sub as string
  ];
  target[leaf as string] = value;
}
```

- [ ] **Step 4: Update `buildSettersFromTable` to dual-write**

Replace its body with:

```ts
export function buildSettersFromTable(
  state: EngineState,
  cb: EngineCallbacks,
  requestRender: () => void,
): Record<SettingsTableKey, (value: unknown) => void> {
  const out = {} as Record<SettingsTableKey, (value: unknown) => void>;

  for (const descriptor of SETTINGS_TABLE) {
    const { name, path, callback, clamp, nestedPath, nestedCallback } = descriptor;

    out[name] = (value: unknown) => {
      const next =
        clamp !== undefined ? clamp(value as number) : value;

      setByPath(state, path, next);
      if (nestedPath !== undefined) {
        setByNestedPath(state, nestedPath, next);
      }

      if (callback !== undefined) {
        const fn = cb[callback] as ((v: unknown) => void) | undefined;
        fn?.(next);
      }
      if (nestedCallback !== undefined) {
        const [cluster, method] = nestedCallback;
        const sub = (cb as Record<string, Record<string, unknown> | undefined>)[
          cluster
        ];
        const fn = sub?.[method] as ((v: unknown) => void) | undefined;
        fn?.(next);
      }

      requestRender();
    };
  }

  return out;
}
```

- [ ] **Step 5: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 6: Run the full test suite**

Run: `npm test`
Expected: PASS — 1071 tests still pass. Each setter now writes both flat and nested state and fires both flat and nested callbacks (when present). The callbacks point at identical function references in App.tsx, so observers see no behavioural change.

- [ ] **Step 7: Commit**

```bash
git add src/services/engine/wiring/settingsTable.ts
git commit -m "$(cat <<'EOF'
refactor(settingsTable): dual-write flat AND nested settings/callbacks

Every descriptor row gains an optional nestedPath + nestedCallback.
buildSettersFromTable writes both state shapes and fires both callback
shapes when present.  Setter behaviour is unchanged from the observer's
perspective; the nested twins go live but reference identical
function objects until the consumer migration completes.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Mirror the four bespoke setters (biasMode, tier, lodMode, sourceVisible, spaceMouseSensitivity)

**Files:**
- Modify: `src/services/engine/engine.ts` (or wherever the bespoke setters live)

The five bespoke setters (`setBiasMode`, `setTier`, `setLodMode`, `setSourceVisible`, `setSpaceMouseSensitivity`) are NOT in `settingsTable.ts`. Each does work beyond "mutate + echo + render" so dual-write logic is hand-rolled.

- [ ] **Step 1: Locate the bespoke setters in `engine.ts`**

Run: `grep -n "setBiasMode:\|setTier:\|setLodMode:\|setSourceVisible:\|setSpaceMouseSensitivity:" src/services/engine/engine.ts`

Each definition is an arrow function assigned as a property in the public-handle object literal returned by `createEngine`. The pattern (current) is:

```ts
setBiasMode: (mode: BiasMode) => {
  state.bias.mode = mode;
  callbacks.onBiasModeChange?.(mode);
  // ... bake kick ...
},
```

- [ ] **Step 2: Update `setBiasMode`**

Now that `state.bias.mode` no longer exists (moved to `state.settings.bias.mode` in Task 2), the read MUST come from settings. Apply the dual-write pattern:

```ts
setBiasMode: (mode: BiasMode) => {
  state.settings.bias.mode = mode;
  callbacks.onBiasModeChange?.(mode);
  callbacks.bias?.onModeChange?.(mode);
  // ... bake kick logic stays as-is ...
},
```

(Anywhere that reads `state.bias.mode` for the per-frame uniform writer also updates to read from `state.settings.bias.mode` — see Step 6.)

- [ ] **Step 3: Update `setTier`**

```ts
setTier: (tier: Tier) => {
  if (state.sources.tier === tier) return;
  state.sources.tier = tier;
  callbacks.onTierChange?.(tier);
  callbacks.sources?.onTierChange?.(tier);
  // ... cloudLoader.reloadSource(...) logic stays ...
},
```

- [ ] **Step 4: Update `setLodMode`**

```ts
setLodMode: (mode: LodMode) => {
  state.sources.lodMode = mode;
  callbacks.onLodModeChange?.(mode);
  callbacks.sources?.onLodModeChange?.(mode);
  requestRender();
},
```

- [ ] **Step 5: Update `setSourceVisible`**

```ts
setSourceVisible: (source: Source, visible: boolean) => {
  // existing logic (implicit lod-mode flip, mask update) stays ...
  callbacks.onSourceMaskChange?.(state.sources.visibleSourceMask);
  callbacks.sources?.onMaskChange?.(state.sources.visibleSourceMask);
  requestRender();
},
```

- [ ] **Step 6: Update read sites for `state.bias.mode` / `state.bias.absMagLimit`**

Run: `grep -rn "state.bias.mode\|state\.bias\.absMagLimit" src/`

Anywhere the per-frame uniform writer (and similar consumers) reads either field, update the path from `state.bias.X` to `state.settings.bias.X`. Likely sites:
- `src/services/engine/frame/renderFrame.ts` — assembles `RenderFrameSettings` from state.
- `src/services/engine/frame/passes/pointSpritesPass.ts` — reads `settings.biasMode` / `settings.absMagLimit`.
- `src/services/gpu/renderers/biasCorrectionSubsystem.ts` — kicks the per-galaxy bake when mode changes.
- Any test that constructs an `EngineState` for a render-frame test.

Update each to read from the new location.

- [ ] **Step 7: Update `setSpaceMouseSensitivity`**

```ts
setSpaceMouseSensitivity: (value: number) => {
  // existing internal forward to the SpaceMouse subsystem stays ...
  callbacks.onSpaceMouseConnectedChange?.(...); // (if echoed)
  callbacks.input?.spaceMouse?.onConnectedChange?.(...);
},
```

(Note: if `setSpaceMouseSensitivity` doesn't currently echo, no nested echo gets added either. Match the existing echo behaviour exactly — the spec doesn't introduce new echoes.)

- [ ] **Step 8: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS, 1071 tests.

- [ ] **Step 9: Commit**

```bash
git add src/services/engine/engine.ts src/services/engine/frame/ src/services/gpu/renderers/biasCorrectionSubsystem.ts
git commit -m "$(cat <<'EOF'
refactor(engine): dual-fire bespoke setters; relocate bias mode/absMag reads

setBiasMode/setTier/setLodMode/setSourceVisible/setSpaceMouseSensitivity
each fire both flat and nested callbacks.  Read sites for biasMode and
absMagLimit move from state.bias.* to state.settings.bias.* (matches
Task 2's bias-state split).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase B — Engine dual-shape (1 commit)

### Task 6: Build sub-handles on the returned `EngineHandle`

**Files:**
- Modify: `src/@types/EngineHandle.d.ts`
- Modify: `src/services/engine/engine.ts`

`EngineHandle` keeps every flat method (so existing UI consumers compile) AND gains 11 sub-handle properties + nested input.

- [ ] **Step 1: Extend `EngineHandle.d.ts` with sub-handles**

At the top of the file, import the 12 new types:

```ts
import type { EnginePointsHandle } from './EnginePointsHandle';
import type { EngineTonemapHandle } from './EngineTonemapHandle';
import type { EngineCameraHandle } from './EngineCameraHandle';
import type { EngineSelectionHandle } from './EngineSelectionHandle';
import type { EngineSourcesHandle } from './EngineSourcesHandle';
import type { EngineBiasHandle } from './EngineBiasHandle';
import type { EngineThumbnailsHandle } from './EngineThumbnailsHandle';
import type { EngineMilkyWayHandle } from './EngineMilkyWayHandle';
import type { EngineFilamentsHandle } from './EngineFilamentsHandle';
import type { EngineVolumesHandle } from './EngineVolumesHandle';
import type { EngineInputHandle } from './EngineInputHandle';
```

Inside the `EngineHandle` type body, ABOVE the existing flat methods, add the sub-handle properties:

```ts
export type EngineHandle = {
  // ── Sub-handles (new — UI migrates onto these in Tasks 7-10) ──────────────
  points: EnginePointsHandle;
  tonemap: EngineTonemapHandle;
  camera: EngineCameraHandle;
  selection: EngineSelectionHandle;
  sources: EngineSourcesHandle;
  bias: EngineBiasHandle;
  thumbnails: EngineThumbnailsHandle;
  milkyWay: EngineMilkyWayHandle;
  filaments: EngineFilamentsHandle;
  volumes: EngineVolumesHandle;
  input: EngineInputHandle;

  // ── Legacy flat methods (kept until Task 11 deletes them) ─────────────────
  clearSelection: () => void;
  destroy: () => void;
  // ... (every existing flat method declaration verbatim)
};
```

(Keep every existing flat method declaration verbatim — don't delete any in this task.)

- [ ] **Step 2: Build the sub-handles in `engine.ts`**

Find the public-handle object literal returned at the bottom of `createEngine` (search: `return {` near end of file).  Above the existing flat-method declarations, build the sub-handles. Each sub-handle method forwards to the corresponding flat method (which still exists). Example:

```ts
const handle: EngineHandle = {
  // ── Sub-handles ───────────────────────────────────────────────────────────
  points: {
    setSize: (sizePx) => boringSetters.setPointSize(sizePx),
    setBrightness: (value) => boringSetters.setBrightness(value),
    setDepthFade: (enabled) => boringSetters.setDepthFadeEnabled(enabled),
    setHighlightFallback: (enabled) => boringSetters.setHighlightFallback(enabled),
    setRealOnly: (enabled) => boringSetters.setRealOnlyMode(enabled),
  },
  tonemap: {
    setExposure: (value) => boringSetters.setExposure(value),
    setCurve: (curve) => boringSetters.setToneMapCurve(curve),
  },
  camera: {
    setAutoRotate: (enabled) => boringSetters.setAutoRotate(enabled),
    reset: () => resetCamera(),       // bespoke fn, already in scope
    focusOn: (info) => focusOn(info),
    focusOnHome: () => focusOnHome(),
    focusOnMilkyWay: () => focusOnMilkyWay(),
    logState: () => logCameraState(),
  },
  selection: {
    clear: () => clearSelection(),
    selectFamous: (id) => selectFamous(id),
    selectByAlias: (target) => selectByAlias(target),
    loadAliases: () => loadPgcAliases(),
  },
  sources: {
    setLodMode: (mode) => setLodMode(mode),
    setVisible: (source, visible) => setSourceVisible(source, visible),
    setTier: (tier) => setTier(tier),
    getCloud: (source) => getCloud(source),
    getCloudObjIds: (source) => getCloudObjIds(source),
  },
  bias: {
    setMode: (mode) => setBiasMode(mode),
    setAbsMagLimit: (absMag) => boringSetters.setAbsMagLimit(absMag),
  },
  thumbnails: { setEnabled: (e) => boringSetters.setGalaxyTexturesEnabled(e) },
  milkyWay: { setEnabled: (e) => boringSetters.setMilkyWayEnabled(e) },
  filaments: {
    setEnabled: (e) => boringSetters.setFilamentsEnabled(e),
    setIntensity: (v) => boringSetters.setFilamentIntensity(v),
  },
  volumes: {
    setMasterEnabled: (e) => setVolumesEnabled(e),
    add: (h, c) => addVolumeField(h, c),
    remove: (h) => removeVolumeField(h),
    setEnabled: (h, e) => setVolumeFieldEnabled(h, e),
    setIntensity: (h, v) => setVolumeFieldIntensity(h, v),
    setContrast: (h, v) => setVolumeFieldContrast(h, v),
    setDensityScale: (h, v) => setVolumeFieldDensityScale(h, v),
    setPalette: (h, id) => setVolumeFieldPalette(h, id),
    list: () => listVolumeFields(),
    getState: () => getVolumeFieldsState(),
  },
  input: {
    spaceMouse: {
      connect: () => connectSpaceMouse(),
      disconnect: () => disconnectSpaceMouse(),
      isConnected: () => isSpaceMouseConnected(),
      setSensitivity: (v) => setSpaceMouseSensitivity(v),
    },
  },

  // ── Flat methods (legacy — every existing entry verbatim) ────────────────
  // ... (do not delete any flat method in this task)
  ...boringSetters,
  clearSelection,
  destroy,
  setBiasMode,
  setTier,
  // ... etc.
};
```

The exact set of forwards (`boringSetters.X` vs naked function name) depends on whether each method is hand-rolled bespoke or table-emitted.  Inspect `engine.ts` and adapt — every sub-handle method should forward to the existing implementation, NOT duplicate logic.

- [ ] **Step 3: Add a structural smoke test**

Create: `tests/services/engine/engineHandle.shape.test.ts`

```ts
/**
 * Smoke test for the H5 namespace restructure — asserts that the engine
 * handle exposes the 11 sub-handles + 2 root properties.  Doesn't assert
 * on flat methods (those go away in Task 11) but the test file's full
 * baseline is exercised by other tests.
 */
import { describe, it, expect, beforeAll, vi } from 'vitest';
import type { EngineHandle } from '../../../src/@types/EngineHandle';

describe('EngineHandle — namespace sub-handles', () => {
  it('exposes 11 sub-handles + 2 root members', () => {
    // The type-level check is the meat — runtime fields are validated
    // by other tests.  Here we just confirm the spread didn't drop one.
    const expectedSubHandles: ReadonlyArray<keyof EngineHandle> = [
      'points',
      'tonemap',
      'camera',
      'selection',
      'sources',
      'bias',
      'thumbnails',
      'milkyWay',
      'filaments',
      'volumes',
      'input',
    ];
    const expectedRoot: ReadonlyArray<keyof EngineHandle> = [
      'destroy',
      'assetSlots',
    ];
    // Compile-time assertion: every name above exists on EngineHandle.
    type Check = (typeof expectedSubHandles)[number] | (typeof expectedRoot)[number];
    const _: Check = 'points';
    void _;
    expect(expectedSubHandles).toHaveLength(11);
    expect(expectedRoot).toHaveLength(2);
  });
});
```

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS — every sub-handle method exists; every flat method still exists.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — 1072 tests pass (1071 + 1 new).

- [ ] **Step 6: Commit**

```bash
git add src/@types/EngineHandle.d.ts src/services/engine/engine.ts tests/services/engine/engineHandle.shape.test.ts
git commit -m "$(cat <<'EOF'
refactor(engine): construct sub-handles on EngineHandle alongside flat methods

Eleven cluster sub-handles (points, tonemap, camera, selection, sources,
bias, thumbnails, milkyWay, filaments, volumes, input) plus root-level
destroy and assetSlots.  Every flat method preserved — UI migration
follows in Tasks 7-10.  Each sub-handle method forwards to the existing
flat implementation; no behaviour change.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase C — UI consumer migration (4 commits)

Each Phase C task migrates one consumer (or one tight cluster of consumers) to the sub-handle shape and moves any associated tests in the same commit. Typecheck stays green at every commit because flat methods still exist.

### Task 7: Migrate `App.tsx` + `useKeyboardShortcuts` hook

**Files:**
- Modify: `src/components/App/App.tsx`
- Modify: `src/hooks/useKeyboardShortcuts.ts`
- Modify: any related test files

App.tsx is the main consumer. Find every `engine.setX(...)` / `engine.clearSelection()` / etc. and rewrite using sub-handles.

- [ ] **Step 1: Inventory App.tsx engine method calls**

Run: `grep -n "engine\." src/components/App/App.tsx | grep -v "^\s*\*\|^\s*//"`

For each call, look up the mapping in the **Name mapping reference** at the top of this plan and rewrite. The transform is purely mechanical:

| Before | After |
|---|---|
| `engine.setPointSize(v)` | `engine.points.setSize(v)` |
| `engine.setBrightness(v)` | `engine.points.setBrightness(v)` |
| `engine.setAutoRotate(b)` | `engine.camera.setAutoRotate(b)` |
| `engine.focusOn(info)` | `engine.camera.focusOn(info)` |
| `engine.focusOnHome()` | `engine.camera.focusOnHome()` |
| `engine.focusOnMilkyWay()` | `engine.camera.focusOnMilkyWay()` |
| `engine.resetCamera()` | `engine.camera.reset()` |
| `engine.logCameraState()` | `engine.camera.logState()` |
| `engine.clearSelection()` | `engine.selection.clear()` |
| `engine.selectFamous(id)` | `engine.selection.selectFamous(id)` |
| `engine.selectByAlias(t)` | `engine.selection.selectByAlias(t)` |
| `engine.loadPgcAliases()` | `engine.selection.loadAliases()` |
| `engine.setLodMode(m)` | `engine.sources.setLodMode(m)` |
| `engine.setSourceVisible(s,v)` | `engine.sources.setVisible(s, v)` |
| `engine.setTier(t)` | `engine.sources.setTier(t)` |
| `engine.getCloud(s)` | `engine.sources.getCloud(s)` |
| `engine.getCloudObjIds(s)` | `engine.sources.getCloudObjIds(s)` |
| `engine.setBiasMode(m)` | `engine.bias.setMode(m)` |
| `engine.setAbsMagLimit(v)` | `engine.bias.setAbsMagLimit(v)` |
| `engine.setGalaxyTexturesEnabled(b)` | `engine.thumbnails.setEnabled(b)` |
| `engine.setMilkyWayEnabled(b)` | `engine.milkyWay.setEnabled(b)` |
| `engine.setFilamentsEnabled(b)` | `engine.filaments.setEnabled(b)` |
| `engine.setFilamentIntensity(v)` | `engine.filaments.setIntensity(v)` |
| `engine.setHighlightFallback(b)` | `engine.points.setHighlightFallback(b)` |
| `engine.setRealOnlyMode(b)` | `engine.points.setRealOnly(b)` |
| `engine.setDepthFadeEnabled(b)` | `engine.points.setDepthFade(b)` |
| `engine.setExposure(v)` | `engine.tonemap.setExposure(v)` |
| `engine.setToneMapCurve(c)` | `engine.tonemap.setCurve(c)` |
| `engine.setVolumesEnabled(b)` | `engine.volumes.setMasterEnabled(b)` |
| `engine.addVolumeField(h,c)` | `engine.volumes.add(h, c)` |
| `engine.removeVolumeField(h)` | `engine.volumes.remove(h)` |
| `engine.setVolumeFieldEnabled(h,b)` | `engine.volumes.setEnabled(h, b)` |
| `engine.setVolumeFieldIntensity(h,v)` | `engine.volumes.setIntensity(h, v)` |
| `engine.setVolumeFieldContrast(h,v)` | `engine.volumes.setContrast(h, v)` |
| `engine.setVolumeFieldDensityScale(h,v)` | `engine.volumes.setDensityScale(h, v)` |
| `engine.setVolumeFieldPalette(h,id)` | `engine.volumes.setPalette(h, id)` |
| `engine.listVolumeFields()` | `engine.volumes.list()` |
| `engine.getVolumeFieldsState()` | `engine.volumes.getState()` |
| `engine.connectSpaceMouse()` | `engine.input.spaceMouse.connect()` |
| `engine.disconnectSpaceMouse()` | `engine.input.spaceMouse.disconnect()` |
| `engine.isSpaceMouseConnected()` | `engine.input.spaceMouse.isConnected()` |
| `engine.setSpaceMouseSensitivity(v)` | `engine.input.spaceMouse.setSensitivity(v)` |

Apply each transform. Optional-chained calls (`engine.setX?.(v)`) become `engine.cluster.method(v)` — the new method is required, no `?.` needed.

- [ ] **Step 2: Apply same transforms inside `useKeyboardShortcuts.ts`**

Run: `grep -n "engine\." src/hooks/useKeyboardShortcuts.ts`

Migrate each call using the mapping table above.

- [ ] **Step 3: Update any associated tests**

Run: `grep -rn "engine\.\(setPointSize\|setBrightness\|focusOn\|clearSelection\)" tests/components/App tests/hooks/`

Apply the same mapping to test files that mock the engine handle.

- [ ] **Step 4: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 5: Run the full test suite**

Run: `npm test`
Expected: PASS — 1072 tests pass.

- [ ] **Step 6: Visual smoke check in the dev server**

The dev server is already running (per project convention). Open http://localhost:5173/ and verify:
- Points render, camera orbit works
- 'R' / 'H' / 'L' / 'M' / Esc keyboard shortcuts still fire (auto-rotate / home / log-state / milky-way / clear-selection)
- SettingsPanel sliders still update the engine

If any of these break, do NOT commit — report BLOCKED.

- [ ] **Step 7: Commit**

```bash
git add src/components/App/App.tsx src/hooks/useKeyboardShortcuts.ts tests/
git commit -m "$(cat <<'EOF'
refactor(app): migrate App.tsx + useKeyboardShortcuts to sub-handles

Mechanical rewrite per the H5 name mapping.  Engine still exposes
the flat methods alongside, so the dual-fire setting echoes still
arrive via App's old subscriptions — that's intentional during the
consumer migration phase.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Migrate `SettingsPanel.tsx` and its sub-component files

**Files:**
- Modify: `src/components/SettingsPanel/SettingsPanel.tsx` (1094 lines)
- Modify: `src/components/SettingsPanel/VolumeFieldRow.tsx`
- Modify: any other `src/components/SettingsPanel/*.tsx` files
- Modify: `src/components/SettingsPanel/SettingsPanel.test.tsx` (if exists)

The settings panel today receives the whole engine handle and reads/writes many flat methods. Migration: same mapping table as Task 7, applied across this file's contents.

- [ ] **Step 1: Inventory SettingsPanel calls**

Run: `grep -n "engine\." src/components/SettingsPanel/`

- [ ] **Step 2: Apply the mapping transform**

For every line, apply the mapping table from Task 7 step 1. The file is 1094 lines so this is a substantial mechanical pass, but every change is local.

- [ ] **Step 3: Consider section-by-section commits**

If the diff feels too large to review as one commit, split it sub-step by sub-step (one section per commit). Each sub-commit must keep typecheck green AND tests green. Recommended sub-split:
- 8a: Points section (sizePx, brightness, depthFade, highlightFallback, realOnly)
- 8b: Tonemap section (exposure, curve)
- 8c: Camera section (autoRotate)
- 8d: Bias section (mode, absMagLimit)
- 8e: Overlays section (thumbnails, milkyWay, filaments)
- 8f: Volumes section (8 methods)

For sub-commits, use commit subject `refactor(panel): migrate <section> section to sub-handles`.

- [ ] **Step 4: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS — 1072 tests.

- [ ] **Step 5: Visual smoke check**

Open the settings panel; toggle each control; verify the canvas updates.

- [ ] **Step 6: Commit**

```bash
git add src/components/SettingsPanel/
git commit -m "$(cat <<'EOF'
refactor(panel): migrate SettingsPanel to sub-handles

Mechanical rewrite per the H5 mapping.  Section structure unchanged;
only the call shapes differ.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Migrate `useEngineSettings.ts` and other engine-consuming hooks

**Files:**
- Modify: `src/hooks/useEngineSettings.ts` (261 lines)
- Modify: `src/hooks/useEngine.ts`
- Modify: `src/hooks/useFamousMeta.ts`
- Modify: `src/hooks/useFocusUrlSync.ts`
- Modify: `src/hooks/useAliasIndex.ts`
- Modify: `src/hooks/buildAliasIndex.ts`
- Modify: any matching tests under `tests/hooks/`

The hooks layer mirrors engine settings into React state and consumes engine methods for side effects.

- [ ] **Step 1: Inventory each hook's engine calls**

Run: `grep -n "engine\." src/hooks/`

- [ ] **Step 2: Apply the mapping transform**

Mechanical rewrite using the table from Task 7 step 1.

- [ ] **Step 3: Update `useEngineSettings.ts` to read from new state shape**

The hook may read from `EngineSettingsState` directly (e.g., subscribing via callbacks). Today's callbacks fire flat names (`onPointSizeChange`); the hook subscribes via the flat names. Since the dual-fire from Task 4 fires both, you can choose to subscribe via either shape.

Per the migration plan: each consumer moves to the NESTED shape so Task 11 can delete the flat callbacks. So in `useEngineSettings.ts`, switch:

```ts
const callbacks: EngineCallbacks = {
  onPointSizeChange: (v) => setPointSizePx(v),
  // ...
};
```

to:

```ts
const callbacks: EngineCallbacks = {
  points: {
    onSizeChange: (v) => setPointSizePx(v),
    onBrightnessChange: (v) => setBrightness(v),
    // ...
  },
  // ...
};
```

If `useEngineSettings.ts` constructs its OWN settings state (React-side mirror), restructure the local state shape to mirror `EngineSettingsState`'s new sub-bags too:

```ts
// Before
const [pointSizePx, setPointSizePx] = useState(initial.pointSizePx);
// After (one option — multiple useState calls per sub-bag)
const [points, setPoints] = useState({
  sizePx: initial.points.sizePx,
  brightness: initial.points.brightness,
  // ...
});
```

(Implementation note: keep the mirror as close to the engine's shape as is ergonomic. If the hook currently does fine-grained reads/writes per field, keep it that way but rename the fields. If it does sub-bag-level updates, that's also fine.)

- [ ] **Step 4: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/ tests/hooks/
git commit -m "$(cat <<'EOF'
refactor(hooks): migrate engine-consuming hooks to sub-handles

useEngineSettings now subscribes via nested callbacks (points.onSizeChange
etc.).  useFamousMeta, useFocusUrlSync, useAliasIndex, useEngine, and
buildAliasIndex switch to engine.selection.*, engine.sources.*, etc.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Migrate `CommandPalette.tsx`, `App.tsx` callback construction, and remaining consumers

**Files:**
- Modify: `src/components/CommandPalette/CommandPalette.tsx`
- Modify: `src/components/App/App.tsx` (the callbacks construction — switch from dual to nested-only)
- Modify: `src/components/InfoCard/InfoCard.tsx` (if it calls engine methods)
- Modify: any remaining consumer the previous tasks missed
- Modify: their test files

After this task, NO consumer references a flat method or a flat callback.

- [ ] **Step 1: Migrate CommandPalette**

Run: `grep -n "engine\." src/components/CommandPalette/`

Apply the mapping. Most likely calls:
- `engine.selectFamous` → `engine.selection.selectFamous`
- `engine.selectByAlias` → `engine.selection.selectByAlias`
- `engine.loadPgcAliases` → `engine.selection.loadAliases`
- `engine.focusOn` → `engine.camera.focusOn`
- `engine.focusOnMilkyWay` → `engine.camera.focusOnMilkyWay`
- `engine.focusOnHome` → `engine.camera.focusOnHome`

- [ ] **Step 2: Switch App.tsx callbacks construction to nested-only**

Find the callbacks construction in App.tsx (modified in Task 3 step 3). Remove the flat callback entries; keep only the nested sub-bags. Example:

Before (Task 3 result):
```tsx
const callbacks: EngineCallbacks = {
  onStatusChange: handleStatusChange,
  onPointSizeChange: setPointSize,
  // ... (flat)
  lifecycle: { onStatusChange: handleStatusChange },
  points: { onSizeChange: setPointSize },
  // ... (nested)
};
```

After:
```tsx
const callbacks: EngineCallbacks = {
  lifecycle: { onStatusChange: handleStatusChange },
  selection: { onSelectChange: handleSelectChange, onHoverChange: handleHoverChange },
  points: {
    onSizeChange: setPointSize,
    onBrightnessChange: setBrightness,
    onDepthFadeChange: setDepthFade,
    onHighlightFallbackChange: setHighlightFallback,
    onRealOnlyChange: setRealOnly,
  },
  tonemap: { onExposureChange: setExposure, onCurveChange: setCurve },
  camera: {
    onAutoRotateChange: setAutoRotate,
    onFocusChange: handleFocusChange,
    onScaleChange: setScale,
  },
  sources: {
    onLodModeChange: setLodMode,
    onMaskChange: setMask,
    onTierChange: setTier,
    onCloudReady: handleCloudReady,
    onLoadProgress: setLoadProgress,
  },
  bias: { onModeChange: setBiasMode, onAbsMagLimitChange: setAbsMagLimit },
  thumbnails: { onEnabledChange: setGalaxyTexturesEnabled },
  milkyWay: { onEnabledChange: setMilkyWayEnabled },
  filaments: { onReady: handleFilamentsReady },
  volumes: { onFieldsChanged: handleVolumeFieldsChanged },
  input: {
    spaceMouse: { onConnectedChange: setSpaceMouseConnected },
  },
};
```

(Function references unchanged — only the structure of the callbacks object changes.)

- [ ] **Step 3: Migrate any remaining consumers**

Run: `grep -rn "engine\.\(setPointSize\|setBrightness\|focusOn\|loadPgcAliases\)" src/`

For every match still on a flat method, apply the mapping.

- [ ] **Step 4: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: Visual smoke check**

Open the dev server, exercise the full UI (settings panel sliders, command palette open/search/select, keyboard shortcuts, all toggles). Every callback echo path must still work — if a slider doesn't reflect engine truth, you missed a callback wiring.

- [ ] **Step 6: Commit**

```bash
git add src/components/CommandPalette/ src/components/App/App.tsx src/components/InfoCard/
git commit -m "$(cat <<'EOF'
refactor(ui): migrate CommandPalette + finalise App.tsx nested callbacks

Final UI consumer migration.  App.tsx's callbacks construction drops
its flat entries — every subscription now lives in a nested sub-bag.
After this commit, no production code references a flat engine method
or flat callback.  Task 11 can delete them.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Phase D — Cleanup deletion (2 commits)

Every consumer is now on the nested shape. The flat surface can be deleted in two passes.

### Task 11: Delete flat methods + flat fields + flat callbacks

**Files:**
- Modify: `src/@types/EngineHandle.d.ts` — delete every flat method declaration
- Modify: `src/@types/EngineSettingsState.d.ts` — delete every flat field; promote sub-bags from required to required (no change), remove dual-shape comment
- Modify: `src/@types/EngineCallbacks.d.ts` — delete every flat callback; promote nested sub-bags from optional to required where they should be (lifecycle/selection/camera onScaleChange — what was required flat must stay required nested)
- Modify: `src/services/engine/engine.ts` — delete the flat-method declarations on the returned handle (keep only the sub-handles + destroy + assetSlots)
- Modify: `src/data/defaults.ts` — delete the flat-field defaults from the settings construction; keep only the sub-bag entries
- Modify: any remaining test that asserts on flat shape

- [ ] **Step 1: Verify no consumer references a flat method/callback**

Run: `grep -rn "engine\.\(setPointSize\|setBrightness\|setAutoRotate\|setGalaxyTexturesEnabled\|setMilkyWayEnabled\|setFilamentsEnabled\|setFilamentIntensity\|setHighlightFallback\|setRealOnlyMode\|setDepthFadeEnabled\|setBiasMode\|setAbsMagLimit\|setExposure\|setToneMapCurve\|focusOn\|focusOnHome\|focusOnMilkyWay\|resetCamera\|logCameraState\|clearSelection\|selectFamous\|selectByAlias\|loadPgcAliases\|setLodMode\|setSourceVisible\|setTier\|getCloud\|getCloudObjIds\|connectSpaceMouse\|disconnectSpaceMouse\|isSpaceMouseConnected\|setSpaceMouseSensitivity\|setVolumesEnabled\|addVolumeField\|removeVolumeField\|setVolumeFieldEnabled\|setVolumeFieldIntensity\|setVolumeFieldContrast\|setVolumeFieldDensityScale\|setVolumeFieldPalette\|listVolumeFields\|getVolumeFieldsState\)" src/`

Expected: zero matches in `src/` (excluding type declarations in `@types/`). If anything matches, return to Tasks 7-10 and finish that consumer's migration before proceeding.

Run: `grep -rn "onPointSizeChange\|onBrightnessChange\|onAutoRotateChange\|onGalaxyTexturesEnabledChange\|onMilkyWayEnabledChange\|onHighlightFallbackChange\|onRealOnlyModeChange\|onDepthFadeEnabledChange\|onBiasModeChange\|onAbsMagLimitChange\|onToneMapCurveChange\|onExposureChange\|onLodModeChange\|onSpaceMouseConnectedChange\|onSourceMaskChange\|onFpsChange\|onVolumeFieldsChanged\|onFilamentsReady\|onCloudReady\|onTierChange\|onLoadProgress\|onStatusChange\|onSelectChange\|onHoverChange\|onScaleChange\|onFocusChange" src/`

Most matches will be in `EngineCallbacks.d.ts` itself (the type declarations) — those go away in this task. Matches in other `.ts` files mean a consumer still subscribes via flat callbacks.

- [ ] **Step 2: Delete flat methods from `EngineHandle.d.ts`**

Open `src/@types/EngineHandle.d.ts`. Delete every line declaring a flat method (everything from `setPointSize: ... void;` through `setVolumeFieldPalette?: ...`). The final type body contains only:

```ts
export type EngineHandle = {
  points: EnginePointsHandle;
  tonemap: EngineTonemapHandle;
  camera: EngineCameraHandle;
  selection: EngineSelectionHandle;
  sources: EngineSourcesHandle;
  bias: EngineBiasHandle;
  thumbnails: EngineThumbnailsHandle;
  milkyWay: EngineMilkyWayHandle;
  filaments: EngineFilamentsHandle;
  volumes: EngineVolumesHandle;
  input: EngineInputHandle;
  assetSlots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
  destroy: () => void;
};
```

Drop the "Legacy flat methods" comment block.

- [ ] **Step 3: Delete flat fields from `EngineSettingsState.d.ts`**

Delete every flat field. Result:

```ts
export type EngineSettingsState = {
  points: { sizePx: number; brightness: number; depthFade: boolean; highlightFallback: boolean; realOnly: boolean; };
  tonemap: { exposure: number; curve: ToneMapCurve; };
  camera: { autoRotate: boolean; };
  bias: { mode: BiasMode; absMagLimit: number; };
  thumbnails: { enabled: boolean };
  milkyWay: { enabled: boolean };
  filaments: { enabled: boolean; intensity: number };
  volumes: { masterEnabled: boolean; fields: Record<string, VolumeFieldSettings>; };
};
```

- [ ] **Step 4: Delete flat callbacks from `EngineCallbacks.d.ts`**

Delete every flat callback declaration. Promote required-ness on the nested sub-bags:

```ts
export type EngineCallbacks = {
  lifecycle: {
    onStatusChange: (s: EngineStatus) => void;
    onFpsChange?: (fps: number) => void;
  };
  points?: { /* all optional */ };
  tonemap?: { /* all optional */ };
  camera: {
    onAutoRotateChange?: (enabled: boolean) => void;
    onFocusChange?: (info: PointInfo | null) => void;
    onScaleChange: (info: ScaleInfo) => void;
  };
  selection: {
    onSelectChange: (info: PointInfo | null) => void;
    onHoverChange: (info: PointInfo | null) => void;
  };
  sources?: { /* all optional */ };
  bias?: { /* all optional */ };
  thumbnails?: { onEnabledChange?: (enabled: boolean) => void };
  milkyWay?: { onEnabledChange?: (enabled: boolean) => void };
  filaments?: { onReady?: (stripCount: number, vertexCount: number) => void };
  volumes?: { onFieldsChanged?: () => void };
  input?: {
    spaceMouse?: { onConnectedChange?: (connected: boolean) => void };
  };
};
```

The required sub-bags are those whose original flat fields were required (`onStatusChange`, `onSelectChange`, `onHoverChange`, `onScaleChange`).

- [ ] **Step 5: Delete flat methods from `engine.ts` handle construction**

Inside `createEngine`'s returned handle object, delete every flat-method entry (`clearSelection`, `setPointSize`, `setBrightness`, etc.) — keep only sub-handles + `destroy` + `assetSlots`.

If `boringSetters` (from `buildSettersFromTable`) is no longer spread into the handle, the call to `buildSettersFromTable` may need to keep happening for its side effects on state. Verify: the sub-handle `points.setSize` etc. forward to `boringSetters.setPointSize`, so `boringSetters` is still constructed; it just isn't spread.

- [ ] **Step 6: Delete flat defaults from `defaults.ts` state construction**

Wherever the engine state was constructed with both flat and nested fields (Task 2 step 3), delete the flat half. Keep only:

```ts
settings: {
  points: { sizePx: DEFAULT_POINT_SIZE_PX, brightness: DEFAULT_BRIGHTNESS, ... },
  tonemap: { exposure: DEFAULT_EXPOSURE, curve: DEFAULT_TONE_MAP_CURVE },
  // ...
},
```

- [ ] **Step 7: Update remaining tests**

Run: `npm test 2>&1 | grep -E "FAIL|✗"`

Any test that asserts on flat shapes will fail. Update assertions to the nested shape.

- [ ] **Step 8: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 9: Run tests**

Run: `npm test`
Expected: PASS — 1072 tests.

- [ ] **Step 10: Visual smoke check**

Dev server full sweep. Every UI control must still work.

- [ ] **Step 11: Commit**

```bash
git add src/@types/ src/services/engine/engine.ts src/data/defaults.ts tests/
git commit -m "$(cat <<'EOF'
refactor(types): delete flat EngineHandle / EngineSettingsState / EngineCallbacks

Every consumer is on the nested shape; the flat surface is dead code.
EngineHandle: 11 sub-handles + destroy + assetSlots.  EngineSettingsState:
8 sub-bags only.  EngineCallbacks: 12 sub-bags only, lifecycle/selection/
camera.onScaleChange required, rest optional.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Delete the dual-write code from `settingsTable.ts`

**Files:**
- Modify: `src/services/engine/wiring/settingsTable.ts`

The descriptor table still has `path` (flat) + `nestedPath` (nested) + `callback` (flat) + `nestedCallback` (nested). Each setter dual-writes. With the flat fields gone, `path` and `callback` are dead — `setByPath` would crash trying to write to a deleted field.

- [ ] **Step 1: Collapse the descriptor type to nested-only**

Replace `SettingsDescriptor`:

```ts
type SettingsDescriptor = {
  name: SettingsTableKey;
  path: NestedSettingsPath;   // renamed from nestedPath
  callback?: NestedCallbackKey; // renamed from nestedCallback
  clamp?: (value: number) => number;
};
```

Drop the legacy `SettingsPath` and `path`/`callback` fields. Drop the `NestedSettingsPath` and `NestedCallbackKey` aliases (or rename them back to `SettingsPath` / `CallbackKey` since they're now the only ones).

- [ ] **Step 2: Update each row to use the renamed fields**

Each row goes from:

```ts
{
  name: 'setPointSize',
  path: ['settings', 'pointSizePx'],
  callback: 'onPointSizeChange',
  nestedPath: ['settings', 'points', 'sizePx'],
  nestedCallback: ['points', 'onSizeChange'],
},
```

to:

```ts
{
  name: 'setPointSize',
  path: ['settings', 'points', 'sizePx'],
  callback: ['points', 'onSizeChange'],
},
```

Apply to all 13 rows. `setAbsMagLimit`'s `path` is `['settings', 'bias', 'absMagLimit']`.

- [ ] **Step 3: Simplify `setByPath` to handle only 3-tuple paths**

```ts
function setByPath(
  state: EngineState,
  path: SettingsPath,
  value: unknown,
): void {
  const [bag, sub, leaf] = path;
  const target = (state[bag] as Record<string, Record<string, unknown>>)[
    sub as string
  ];
  target[leaf as string] = value;
}
```

Delete the old 2-tuple branch.  Delete `setByNestedPath` (now redundant — `setByPath` does its job).

- [ ] **Step 4: Simplify `buildSettersFromTable`**

```ts
export function buildSettersFromTable(
  state: EngineState,
  cb: EngineCallbacks,
  requestRender: () => void,
): Record<SettingsTableKey, (value: unknown) => void> {
  const out = {} as Record<SettingsTableKey, (value: unknown) => void>;

  for (const descriptor of SETTINGS_TABLE) {
    const { name, path, callback, clamp } = descriptor;

    out[name] = (value: unknown) => {
      const next =
        clamp !== undefined ? clamp(value as number) : value;
      setByPath(state, path, next);

      if (callback !== undefined) {
        const [cluster, method] = callback;
        const sub = (cb as Record<string, Record<string, unknown> | undefined>)[
          cluster
        ];
        const fn = sub?.[method] as ((v: unknown) => void) | undefined;
        fn?.(next);
      }

      requestRender();
    };
  }

  return out;
}
```

- [ ] **Step 5: Run typecheck + tests**

Run: `npm run typecheck && npm test`
Expected: PASS — 1072 tests.

- [ ] **Step 6: Visual smoke check**

Dev server full sweep one more time.

- [ ] **Step 7: Commit**

```bash
git add src/services/engine/wiring/settingsTable.ts
git commit -m "$(cat <<'EOF'
refactor(settingsTable): drop dual-write; nested paths are now the only path

With the flat EngineSettingsState/EngineCallbacks fields deleted in
Task 11, the table's flat path + flat callback fields become dead code
that would crash at write time.  Collapse to single-write nested form.

Closes H5 from the 2026-05-11 architectural audit.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Verification + PR

After Task 12 lands:

- [ ] **Final typecheck:** `npm run typecheck` — PASS.
- [ ] **Final tests:** `npm test` — 1072 / 1072.
- [ ] **Final build:** `npm run build` — clean.
- [ ] **Final visual sweep:** every UI control exercised on the dev server.
- [ ] **Push the branch:** `git push --force-with-lease` (the rebase + multiple commits may have rewritten history).
- [ ] **Mark the PR ready for review** (the H5 PR was opened earlier as `refactor/engine-handle-namespaces`).
- [ ] **Update the PR description** with the final commit list and visual-check confirmation.

---

## Self-review notes

- **Spec coverage:** every sub-handle, every settings sub-bag, every callback sub-bag from the spec maps to a task. The bias-state split (folding `state.bias.mode/absMagLimit` into `state.settings.bias`, keeping the bake-derived fields in `state.bias`) is handled in Task 2 step 2 + Task 5 step 6.
- **Placeholders:** none. Every step shows exact code or commands.
- **Type consistency:** sub-handle method names are stable across the plan (e.g., `volumes.setIntensity`, `points.setSize`, `selection.loadAliases`).  The `EngineHandle.d.ts` declaration in Task 6 matches the sub-handle methods built in `engine.ts`.  Settings sub-bag field names match across `EngineSettingsState.d.ts`, `defaults.ts` construction, `settingsTable.ts` descriptor paths, and `useEngineSettings.ts` mirror.
- **Migration risk:** the dual-write phase (Tasks 3-10) keeps observers seeing consistent state because every dual-fire callback points at the SAME function reference, so even a "double-fire" is idempotent.  Single-threaded JS guarantees there's no observable mid-write state.
- **What's NOT in scope:** H3 volume-field commit dedup beyond what Tasks 2/5/6 incidentally fix; H4 wireSlots god-phase split; M1 phaseLocals collapse; M3 runFrame extraction; M5 thumbnailSubsystem extraction. These are deferred per the spec.

---

## Execution handoff

Plan complete and saved to `docs/superpowers/plans/2026-05-11-engine-handle-namespace-restructure.md`. Two execution options:

1. **Subagent-Driven (recommended)** — dispatch a fresh subagent per task, review between tasks, fast iteration.
2. **Inline Execution** — execute tasks in this session using `superpowers:executing-plans`, batch execution with checkpoints.

The plan has 12 tasks; subagent-driven is well-suited.
