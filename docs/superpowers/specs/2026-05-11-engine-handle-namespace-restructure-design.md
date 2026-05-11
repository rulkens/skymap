# EngineHandle namespace restructure — design

## Goal

Reorganize the engine's public API (`EngineHandle`, `EngineSettingsState`, `EngineCallbacks`) into a self-documenting sub-handle namespace structure. Migrate every UI consumer (App.tsx, SettingsPanel, hooks, command palette) onto the new shape in the same PR. Clean break — no deprecation shims.

This is H5 from the 2026-05-11 architectural audit, expanded in scope to include the UI surface so the engine/UI split stays in sync.

## Non-goals

- **No new features.** Every method preserved verbatim; only its namespace and (sometimes) its short name change.
- **No behaviour change.** Setter semantics, render-on-demand wakeups, clamps, callback echo timing all stay identical.
- **No refactor of bespoke subsystems** (camera tween mechanics, async tier reloads, SpaceMouse driver). Those keep their existing internals.
- **No backwards-compat shim.** Old flat surface deleted in the same PR.

## Current state (problem statement)

- `EngineHandle` (630 lines) exposes ~45 methods at the top level. Adding a new visual knob requires touching three places (engine.ts handle factory, EngineHandle.d.ts type, EngineSettingsState.d.ts settings bag) and one of (callbacks, settingsTable, bespoke setter).
- The eight `setVolumeField*` methods are pure pass-throughs to `scalarVolumeRenderer` with a settings-bag mirror — six near-identical bodies that have already drifted (only `addVolumeField` calls `setDensityScale`).
- `EngineCallbacks` (303 lines, 26 callbacks) carries setter echoes (`onPointSizeChange`) and engine-wide events (`onSelectChange`, `onCloudReady`) in one flat record with no grouping.
- `SettingsPanel.tsx` (1094 lines) groups its UI into sections that already roughly match feature clusters, but consumes a flat handle that doesn't mirror its own structure.
- `useEngineSettings.ts` (261 lines) maintains React-side state that mirrors the flat `EngineSettingsState` — same drift surface.

## Target shape

### EngineHandle — 12 sub-handles + 2 root fields

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

**Sub-handle contracts (full):**

```ts
type EnginePointsHandle = {
  setSize: (sizePx: number) => void;
  setBrightness: (value: number) => void;
  setDepthFade: (enabled: boolean) => void;
  setHighlightFallback: (enabled: boolean) => void;
  setRealOnly: (enabled: boolean) => void;
};

type EngineTonemapHandle = {
  setExposure: (value: number) => void;
  setCurve: (curve: ToneMapCurve) => void;
};

type EngineCameraHandle = {
  reset: () => void;
  focusOn: (info: PointInfo) => void;
  focusOnHome: () => void;
  focusOnMilkyWay: () => void;
  logState: () => void;
  setAutoRotate: (enabled: boolean) => void;
};

type EngineSelectionHandle = {
  clear: () => void;
  selectFamous: (id: string) => void;
  selectByAlias: (target: {
    source: Source;
    localIdx: number;
    famousMeta?: readonly FamousMetaEntry[];
    famousXrefs?: FamousXrefMap;
  }) => void;
  loadAliases: () => Promise<PgcAliasMap>; // formerly loadPgcAliases at root
};

type EngineSourcesHandle = {
  setLodMode: (mode: LodMode) => void;
  setVisible: (source: Source, visible: boolean) => void; // formerly setSourceVisible
  setTier: (tier: Tier) => void;
  getCloud: (source: Source) => PointCloud | undefined;
  getCloudObjIds: (source: Source) => BigUint64Array | undefined;
};

type EngineBiasHandle = {
  setMode: (mode: BiasMode) => void;            // formerly setBiasMode
  setAbsMagLimit: (absMag: number) => void;
};

type EngineThumbnailsHandle = {
  setEnabled: (enabled: boolean) => void; // formerly setGalaxyTexturesEnabled
};

type EngineMilkyWayHandle = {
  setEnabled: (enabled: boolean) => void; // formerly setMilkyWayEnabled
  // focusOnMilkyWay stays under engine.camera (it's a camera tween, not a milkyWay toggle)
};

type EngineFilamentsHandle = {
  setEnabled: (enabled: boolean) => void;   // formerly setFilamentsEnabled
  setIntensity: (value: number) => void;    // formerly setFilamentIntensity
};

type EngineVolumesHandle = {
  setMasterEnabled: (enabled: boolean) => void;          // formerly setVolumesEnabled
  add: (handle: string, cube: ScalarCube) => void;       // formerly addVolumeField
  remove: (handle: string) => void;                      // formerly removeVolumeField
  setEnabled: (handle: string, enabled: boolean) => void; // setVolumeFieldEnabled
  setIntensity: (handle: string, intensity: number) => void;
  setContrast: (handle: string, contrast: number) => void;
  setPalette: (handle: string, id: ScalarFieldPaletteId) => void;
  list: () => string[];                                  // formerly listVolumeFields
  getState: () => ReadonlyArray<{...}>;                  // formerly getVolumeFieldsState
};

type EngineInputHandle = {
  spaceMouse: {
    connect: () => Promise<boolean>;
    disconnect: () => void;
    isConnected: () => boolean;
    setSensitivity: (value: number) => void;
  };
};
```

**Naming rules applied:**
- Drop the prefix the cluster already provides (`setPointSize` → `points.setSize`, `addVolumeField` → `volumes.add`, `setVolumeFieldEnabled` → `volumes.setEnabled`).
- Methods that don't fit the cluster prefix-strip get renamed for clarity (`setVolumesEnabled` → `volumes.setMasterEnabled` to distinguish from per-field `volumes.setEnabled`).
- `loadPgcAliases` moves to `selection.loadAliases` — selection is the only consumer (via `selectByAlias`).
- `focusOnMilkyWay` stays under `camera`, not `milkyWay`. It's a camera tween, not a milkyWay control. The milkyWay namespace owns the impostor's render gate; camera owns the viewpoint.
- `spaceMouse` nests under `input` so future input devices (keyboard, gamepad) get a parallel home.

### EngineSettingsState — mirrored sub-bags

```ts
export type EngineSettingsState = {
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
    mode: BiasMode;        // moved from state.bias (which goes away as a separate sub-bag)
    absMagLimit: number;
  };
  thumbnails: { enabled: boolean };
  milkyWay: { enabled: boolean };
  filaments: { enabled: boolean; intensity: number };
  volumes: {
    masterEnabled: boolean; // formerly volumesEnabled
    fields: Record<string, VolumeFieldSettings>; // formerly volumeFields
  };
};
```

Note: `EngineState.bias` (the existing top-level bias sub-bag with `absMagLimit`) folds INTO `EngineSettingsState.bias`. The flat `state.bias.absMagLimit` becomes `state.settings.bias.absMagLimit`. One less top-level state bag.

### EngineCallbacks — full mirror

Every callback nests. Engine-wide events get a `lifecycle` sub-bag.

```ts
export type EngineCallbacks = {
  lifecycle: {
    onStatusChange: (s: EngineStatus) => void;
    onFpsChange?: (fps: number) => void;
  };
  points: {
    onSizeChange?: (sizePx: number) => void;
    onBrightnessChange?: (value: number) => void;
    onDepthFadeChange?: (enabled: boolean) => void;
    onHighlightFallbackChange?: (enabled: boolean) => void;
    onRealOnlyChange?: (enabled: boolean) => void;
  };
  tonemap: {
    onExposureChange?: (value: number) => void;
    onCurveChange?: (curve: ToneMapCurve) => void;
  };
  camera: {
    onAutoRotateChange?: (enabled: boolean) => void;
    onFocusChange?: (info: PointInfo | null) => void;
    onScaleChange: (info: ScaleInfo) => void;
  };
  selection: {
    onSelectChange: (info: PointInfo | null) => void;
    onHoverChange: (info: PointInfo | null) => void;
  };
  sources: {
    onLodModeChange?: (mode: LodMode) => void;
    onMaskChange?: (mask: number) => void;            // formerly onSourceMaskChange
    onTierChange?: (tier: Tier) => void;
    onCloudReady?: (source: Source, count: number) => void;
    onLoadProgress?: (progress: LoadProgressState | null) => void;
  };
  bias: {
    onModeChange?: (mode: BiasMode) => void;
    onAbsMagLimitChange?: (absMag: number) => void;
  };
  thumbnails: { onEnabledChange?: (enabled: boolean) => void };
  milkyWay: { onEnabledChange?: (enabled: boolean) => void };
  filaments: { onReady?: (stripCount: number, vertexCount: number) => void };
  volumes: { onFieldsChanged?: () => void };
  input: {
    spaceMouse: { onConnectedChange?: (connected: boolean) => void };
  };
};
```

26 callbacks, all renamed to drop cluster prefixes where natural. The shape exactly mirrors `EngineHandle` minus `assetSlots` (which has no callbacks).

### settingsTable.ts — 3-tuple paths

The path tuple grows from 2 to 3. The descriptor table's `SettingsTableKey` is dropped because setters no longer share a flat namespace.

```ts
type SettingsPath =
  | readonly ['settings', 'points', keyof EngineSettingsState['points']]
  | readonly ['settings', 'tonemap', keyof EngineSettingsState['tonemap']]
  | readonly ['settings', 'camera', keyof EngineSettingsState['camera']]
  | readonly ['settings', 'bias', keyof EngineSettingsState['bias']]
  | readonly ['settings', 'thumbnails', keyof EngineSettingsState['thumbnails']]
  | readonly ['settings', 'milkyWay', keyof EngineSettingsState['milkyWay']]
  | readonly ['settings', 'filaments', keyof EngineSettingsState['filaments']]
  | readonly ['settings', 'volumes', 'masterEnabled'];
```

The descriptor table grows a `cluster` and `method` field so the builder can install the setter at `output[cluster][method]` instead of `output[name]`:

```ts
type SettingsDescriptor = {
  cluster: keyof EngineHandle & ('points' | 'tonemap' | 'camera' | 'bias' | 'thumbnails' | 'milkyWay' | 'filaments' | 'volumes');
  method: string;                       // e.g. 'setSize', 'setBrightness'
  path: SettingsPath;
  callbackCluster?: keyof EngineCallbacks;
  callbackMethod?: string;              // e.g. 'onSizeChange'
  clamp?: (value: number) => number;
};
```

The 13 existing rows update; the same `buildSettersFromTable` function returns a nested record `{ points: { setSize, setBrightness, ... }, tonemap: { ... }, ... }`.

### Volume-field setters — partially deduped (rolls in H3)

The seven `volumes.set*` setters share the "if not in settings.volumes.fields, seed defaults" prelude. Spec H3 from the audit recommended extracting this. Folded into this PR as a side effect:

```ts
function applyVolumeFieldDefaults(state, handle, cube) { /* seed settings + forward */ }
```

`volumes.add`, the `wireSlots` cf4Density commit, and the synthetic-volume commit all route through this helper. The drift between `addVolumeField` (calls `setDensityScale`) and the wireSlots commits (don't) gets fixed as a consequence.

## UI surface migration

Each consumer of the flat handle migrates to the new shape in this PR. No deprecation shim.

### App.tsx

Old:
```tsx
engine.setPointSize(8);
engine.focusOn(info);
engine.setBiasMode(BiasMode.Schechter);
```

New (destructure once):
```tsx
const { points, camera, bias } = engine;
points.setSize(8);
camera.focusOn(info);
bias.setMode(BiasMode.Schechter);
```

### SettingsPanel.tsx

Already sectioned by feature; sections now map 1:1 to namespaces. Each section receives the appropriate sub-handle as a prop instead of the whole engine. Type signature shrinks dramatically (a "points panel" no longer needs to know about volumes).

### useEngineSettings.ts

The React-side state mirror grows sub-bags to match `EngineSettingsState`. The hook's return shape stays roughly equivalent: `{ pointSizePx, setPointSize }` → `{ points: { sizePx, setSize } }`. SettingsPanel consumes the new shape.

### CommandPalette.tsx

Two engine calls switch: `engine.selectFamous(id)` → `engine.selection.selectFamous(id)`; `engine.selectByAlias(target)` → `engine.selection.selectByAlias(target)`. Loader: `engine.loadPgcAliases()` → `engine.selection.loadAliases()`.

### Hooks

`useFamousMeta`, `useAliasIndex`, `useFocusUrlSync` all migrate to the new methods. `useKeyboardShortcuts` updates its callsites.

## Migration plan (commit-by-commit)

One PR. Multiple commits. Intermediate commits may have **red typecheck** mid-PR — this is intentional and acceptable for a clean-break refactor. The PR final commit is green.

1. **Add new type aliases alongside old** (additive). `EnginePointsHandle`, `EngineCameraHandle`, etc. defined in their own `.d.ts` files under `src/@types/`. `EngineHandle` keeps the old flat shape. Typecheck green.
2. **Add new sub-bags in `EngineSettingsState`**. `points: {...}`, `tonemap: {...}` etc. as new optional siblings of the existing flat fields. Typecheck green.
3. **Add new sub-bags in `EngineCallbacks`**. `lifecycle: {...}`, `points: {...}` etc. as new optional siblings of the existing flat fields. Typecheck green.
4. **Update `data/defaults.ts`** to populate both flat and new fields with identical values. Typecheck green.
5. **Update `settingsTable.ts`** to write through both shapes. Each setter mutates `state.settings.pointSizePx` AND `state.settings.points.sizePx` (and fires both `onPointSizeChange` and `callbacks.points?.onSizeChange`). Typecheck green; the engine produces both shapes.
6. **Replace `EngineHandle` flat surface with sub-handles**. The handle construction in `engine.ts` builds sub-handles. The old flat methods on `EngineHandle` are removed in this commit. **Red typecheck across all UI consumers.** Engine itself compiles.
7. **Migrate `App.tsx`** to sub-handles. Some red typecheck remains in other consumers.
8. **Migrate `SettingsPanel.tsx`** to sub-handle props. Sections rewrite to consume `EnginePointsHandle`, `EngineCameraHandle`, etc.
9. **Migrate `useEngineSettings.ts`**.
10. **Migrate `CommandPalette.tsx`, hooks**.
11. **Remove the flat fields from `EngineSettingsState` and `EngineCallbacks`**. The dual-write in settingsTable collapses to single-write on the new path. Typecheck green; no flat methods remain.
12. **Remove dual-write in settingsTable**. The descriptor table emits only the nested form. Final cleanup commit.

The dual-write phase (commits 4-10) lets the UI migrate one consumer at a time without a totally-red working tree. Once every consumer is on the new shape, commits 11-12 delete the flat surface in one step.

## Testing strategy

- **Existing 1062 tests must all still pass at the final commit.** Some tests assert on flat-method names (e.g. `engine.setPointSize`); these migrate to sub-handle access in step with the consumers.
- **New tests** in `tests/services/engine/`:
  - `engineHandle.shape.test.ts` — asserts the 12 sub-handles exist and root-level methods (`destroy`, `assetSlots`) are present.
  - `engineSettingsState.shape.test.ts` — asserts every settings sub-bag has expected fields and defaults.
  - `engineCallbacks.shape.test.ts` — asserts every callback sub-bag has expected fields, all setter-echo callbacks are optional, lifecycle/selection events are required.
  - `settingsTable.nestedPath.test.ts` — verifies 3-tuple paths land in the right nested location.
- **UI tests** under `tests/components/`: SettingsPanel, CommandPalette tests update to pass mock sub-handles instead of mock flat handles.
- **No new behavioural tests.** Every code path that worked before works the same way after, by construction.

## Risks and mitigations

- **Risk: Dual-write phase produces inconsistent state if a setter is called between writing to one shape and the other.** Mitigation: every setter writes both fields atomically inside the same JS function call. JS is single-threaded; no observer sees a half-written state.
- **Risk: A consumer is missed and remains on the old shape when commits 11-12 delete it.** Mitigation: TypeScript compile failure at commit 11 catches every miss. The PR is not merged until typecheck is green.
- **Risk: SettingsPanel rewrite is bigger than expected** (1094 lines). Mitigation: each section migration is its own commit (sub-step of commit 8). One section at a time; tests guard.
- **Risk: Method renames break URL params, localStorage keys, or external integrations.** Mitigation: search the codebase for stringified method names (`'setPointSize'`, etc.) before renaming. None expected (these are class-method references, not stringified keys), but verify before each rename.

## Out of scope (deferred)

- The fully-deduped `applyVolumeFieldDefaults` helper (H3) is in scope; the wider `wireSlots` god-phase refactor (H4) is NOT.
- The `phaseLocals` deletion (M1), `runFrame` extraction (M3), `thumbnailSubsystem` extraction (M5), bootstrap test coverage (M7) — all deferred.
- A `engine.input.keyboard` sub-handle. The slot is reserved but no methods land in this PR.
- A label on registered volume fields (`addVolumeField('cf4', cube, { label: 'CF-4 DM' })`). Future enhancement; current state remains "label defaults to handle string".

## Open questions

None at this point. The design above reflects all decisions from the brainstorm.

## Approval

This document records the design agreed by the maintainer on 2026-05-11. Implementation plan to follow via `superpowers:writing-plans`.
