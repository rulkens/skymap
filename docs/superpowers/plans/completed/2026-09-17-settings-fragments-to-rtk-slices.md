# Settings fragments → RTK slices Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task, under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Delete the hand-rolled settings-fragment machinery and let each settings cluster be a plain `createSlice`, composed by RTK's own `combineSlices`.

**Architecture:** Every settings cluster — the 15 a Layer owns and the 7 core owns — becomes an RTK slice with `name: 'settings/<cluster>'` and `reducerPath: '<cluster>'`. `combineSlices` over those slices rebuilds the same settings root, key for key. `mergeSnapshot` (the one reducer that returns a new root) becomes a `createAction` handled by a small higher-order reducer wrapping the combine. `EngineSettingsState` is re-derived as `ReturnType<typeof combinedSettingsReducer>`, so it stays DERIVED rather than authored.

**Tech Stack:** TypeScript, Redux Toolkit 2.12 (`combineSlices`, `createSlice({ reducerPath })`), Vitest.

**Spec:** none. The design record is the `RULING 2026-09-17 — settings machinery → RTK slices` section in the user's `project_layer_composition` memory: step 2 of the agreed order, explicitly "behaviour-neutral, no design questions open, no file moves". **Ground preparation:** none needed — this PR _is_ ground preparation for step 3 (Layer structure cleanup) and step 5 (the settings type-cycle break).

## Global Constraints

- **The settings state shape does not change.** Every key under `state.settings` keeps its name, its nesting and its boot value. Selectors, the per-frame engine reads and `SettingsSnapshot` are untouched. Any diff to `src/state/settings/selectors.ts` beyond an import line is a bug.
- **The type cycle is NOT broken here.** `EngineSettingsState` still reaches `APP_COMPOSITION`; narrowing it to `CoreSettingsState` is step 5 and is out of scope.
- Comment budget: module header ≤ 5 lines, comment lines ≤ half the code lines. Comments say WHY, never WHAT.
- `type` aliases, never `interface`. One symbol per file in `utils/` and `@types/`, filename = symbol, deep relative imports, no barrels.
- Action type strings become `settings/<cluster>/<reducerName>` (was `settings/<reducerName>`). The `settings/` prefix is deliberate: without it, the settings `camera`, `labels` and `debug` slices would collide with the root `camera` slice and with future root slices in the global action namespace.
- Never `git add -A`; stage only touched paths. Commit trailer: `Co-Authored-By: Claude Opus 5 (1M context) <noreply@anthropic.com>`.

---

## File Structure

### Created

- `src/state/settings/core/orientationSlice.ts` — `orientation` (primitive state: an `OrientationFrameId` string union).
- `src/state/settings/core/cameraSettingsSlice.ts` — `camera` (`setFovDeg`).
- `src/state/settings/core/tonemapSlice.ts` — `tonemap` (`setExposure`, `setToneMapCurve`).
- `src/state/settings/core/hdrSlice.ts` — `hdr` (3 reducers).
- `src/state/settings/core/bloomSlice.ts` — `bloom` (3 reducers).
- `src/state/settings/core/labelsSlice.ts` — `labels` (`setLabelsFocusedOnly`).
- `src/state/settings/core/debugSlice.ts` — `debug` (the 18 overlay / pass / clip-path-inspector reducers).
- `src/state/settings/coreSettingsSlices.ts` — the 7 above `as const`.
- `src/compositions/appSettingsSlices.ts` — replaces `appSettingsFragments.ts`; same two-list shape (unformed fragments' slices + each formed Layer's tuple).
- `src/state/settings/combinedSettingsReducer.ts` — `combineSlices(...CORE_SETTINGS_SLICES, ...APP_SETTINGS_SLICES)`. **Imports no root type**, so `EngineSettingsState` can derive from it without a circular alias.
- `src/state/settings/mergeSnapshotAction.ts` — `createAction<Partial<SettingsSnapshot>>('settings/mergeSnapshot')`.
- `src/state/settings/settingsReducer.ts` — the higher-order reducer: runs `combinedSettingsReducer`, then applies `mergeSettingsSnapshot` when the action is `mergeSnapshot`.

### Modified (renamed via `npm run move-files`)

Each of these turns from a `LayerSettingsFragment` object literal into a `createSlice` call, and is renamed `…Settings.ts` → `…Slice.ts`:

`src/layers/body/settings/{bodiesSettings,earthSettings,orbitTrailsSettings,sgrAStarLensingTuningSettings}.ts` ·
`src/layers/constellations/settings/constellationsSettings.ts` ·
`src/layers/filaments/settings/filamentsSettings.ts` ·
`src/layers/flow/settings/flowSettings.ts` ·
`src/layers/galaxyCatalog/settings/{galaxyCatalogsSettings,biasSettings,thumbnailsSettings}.ts` ·
`src/layers/milkyWay/settings/milkyWaySettings.ts` ·
`src/layers/starCatalog/settings/starCatalogsSettings.ts` ·
`src/layers/structure/settings/structuresSettings.ts` ·
`src/layers/volume/settings/volumesSettings.ts` ·
`src/layers/zoneOfAvoidance/settings/zoneOfAvoidanceSettings.ts`

### Modified (in place)

- `src/layers/filaments/settings/filamentsLayerSettings.ts`, `src/layers/galaxyCatalog/settings/galaxyCatalogLayerSettings.ts` — tuples of slices now.
- `src/@types/engine/layer/Layer.d.ts` — the `Settings` type parameter's bound becomes `readonly Slice[]`.
- `src/@types/settings/EngineSettingsState.d.ts` — derives from the combined reducer.
- `src/store/rootReducer.ts` — imports `settingsReducer` from its new home.
- `src/state/settings/initialSettings.ts` — `INITIAL_SETTINGS` from the combined reducer's initial state.
- 42 src + 35 test files that import action creators from `state/settings/settingsSlice` (Task 4).

### Deleted

- `src/state/settings/settingsSlice.ts`, `src/state/settings/coreInitialSettings.ts`, `src/compositions/appSettingsFragments.ts`
- `src/utils/settings/{liftClusterReducers,composeInitialSettings,assertUniqueFragmentReducerKeys}.ts`
- `src/@types/settings/{LayerSettingsFragment,SettingsFragmentLike,LiftedCaseReducers,ComposedSettings,ComposedClusters}.d.ts`
- `tests/utils/settings/{liftClusterReducers,composeInitialSettings,assertUniqueFragmentReducerKeys}.test.ts`, `tests/compositions/appSettingsFragments.test.ts`

---

## Task 1: Core clusters become seven slices

**Files:**

- Create: `src/state/settings/core/{orientationSlice,cameraSettingsSlice,tonemapSlice,hdrSlice,bloomSlice,labelsSlice,debugSlice}.ts`
- Create: `src/state/settings/coreSettingsSlices.ts`
- Modify: `src/state/settings/coreInitialSettings.ts` (its seven cluster literals move into the slices; the file is deleted at the end of this task)
- Test: `tests/state/settings/coreSettingsSlices.test.ts`

**Interfaces:**

- Consumes: `CoreSettingsState` and its member types, `src/data/defaults.ts`, `src/services/engine/animation/pathDefaults.ts`, `DEBUG_OVERLAY_ROWS`.
- Produces: `CORE_SETTINGS_SLICES` — a `readonly` tuple of the seven slices, in the order above. Each slice's `reducerPath` is its settings-root key; each exports its action creators by name, unchanged from today's `CORE_REDUCERS` keys.

Every core reducer body is copied verbatim from `CORE_REDUCERS` in `src/state/settings/settingsSlice.ts`, with the draft re-based from the root to the cluster (`settings.bloom.enabled = …` becomes `bloom.enabled = …`) and the explicit `SettingsDraft` annotation dropped — inside `createSlice` the state type is contextual. `mergeSnapshot` is NOT one of these; it moves in Task 3. The didactic comments on the clip-path knobs move with their reducers.

`orientation` is the one primitive-state slice: Immer cannot track a mutation on a string, so its reducer **returns** the new value.

- [x] **Step 1: Write the failing test**

```ts
// tests/state/settings/coreSettingsSlices.test.ts
import { describe, expect, it } from 'vitest';
import { CORE_SETTINGS_SLICES } from '../../../src/state/settings/coreSettingsSlices';
import { orientationSlice } from '../../../src/state/settings/core/orientationSlice';

describe('CORE_SETTINGS_SLICES', () => {
  // The reducerPath IS the settings-root key; a typo here silently relocates a
  // whole cluster, which no selector test would catch until runtime.
  it('claims exactly the seven core settings-root keys', () => {
    expect(CORE_SETTINGS_SLICES.map((s) => s.reducerPath).sort()).toEqual([
      'bloom',
      'camera',
      'debug',
      'hdr',
      'labels',
      'orientation',
      'tonemap',
    ]);
  });

  // Every settings action carries the `settings/` prefix so the cluster names
  // that also exist as root slices (camera, labels, debug) cannot collide.
  it('namespaces every action under settings/', () => {
    for (const slice of CORE_SETTINGS_SLICES) {
      expect(slice.name).toBe(`settings/${slice.reducerPath}`);
    }
  });

  // A primitive-state slice must RETURN, not mutate — Immer silently drops a
  // write to a string draft.
  it('replaces the orientation scalar', () => {
    const next = orientationSlice.reducer(
      'galactic',
      orientationSlice.actions.setOrientation('equatorial'),
    );
    expect(next).toBe('equatorial');
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/state/settings/coreSettingsSlices.test.ts`
Expected: FAIL — cannot resolve `src/state/settings/coreSettingsSlices`.

- [x] **Step 3: Write the seven slices**

Template — every core slice follows it exactly:

```ts
// src/state/settings/core/bloomSlice.ts
/**
 * bloom — the bloom post-pass knobs. `enabled` is read at frame-program BUILD:
 * it changes the pass shape, not just a uniform.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import {
  DEFAULT_BLOOM_ENABLED,
  DEFAULT_BLOOM_STRENGTH,
  DEFAULT_BLOOM_THRESHOLD,
} from '../../../data/defaults';
import type { CoreSettingsState } from '../../../@types/settings/CoreSettingsState';

const initialState: CoreSettingsState['bloom'] = {
  enabled: DEFAULT_BLOOM_ENABLED,
  strength: DEFAULT_BLOOM_STRENGTH,
  threshold: DEFAULT_BLOOM_THRESHOLD,
};

export const bloomSlice = createSlice({
  name: 'settings/bloom',
  reducerPath: 'bloom',
  initialState,
  reducers: {
    setBloomEnabled: (bloom, action: PayloadAction<boolean>) => {
      bloom.enabled = action.payload;
    },
    setBloomStrength: (bloom, action: PayloadAction<number>) => {
      bloom.strength = action.payload;
    },
    setBloomThreshold: (bloom, action: PayloadAction<number>) => {
      bloom.threshold = action.payload;
    },
  },
});

export const { setBloomEnabled, setBloomStrength, setBloomThreshold } = bloomSlice.actions;
```

and the tuple:

```ts
// src/state/settings/coreSettingsSlices.ts
/** The settings clusters core owns. Shrinks as clusters move out to Layers. */

import { bloomSlice } from './core/bloomSlice';
import { cameraSettingsSlice } from './core/cameraSettingsSlice';
import { debugSlice } from './core/debugSlice';
import { hdrSlice } from './core/hdrSlice';
import { labelsSlice } from './core/labelsSlice';
import { orientationSlice } from './core/orientationSlice';
import { tonemapSlice } from './core/tonemapSlice';

export const CORE_SETTINGS_SLICES = [
  orientationSlice,
  cameraSettingsSlice,
  tonemapSlice,
  hdrSlice,
  bloomSlice,
  labelsSlice,
  debugSlice,
] as const;
```

`as const` is load-bearing: `combineSlices` derives the root state per element, and a widened `Slice[]` would collapse every cluster's type.

- [x] **Step 4: Delete `coreInitialSettings.ts`**

Nothing should import `CORE_INITIAL_SETTINGS` after the cluster literals move into the slices. `grep -rn CORE_INITIAL_SETTINGS src tests` must come back empty before deleting; `initialSettings.ts` still references it and is repaired in Task 3, so this step may leave a single known break that Task 3 closes — say so in the ledger rather than papering over it.

- [x] **Step 5: Run the test**

Run: `npx vitest run tests/state/settings/coreSettingsSlices.test.ts`
Expected: PASS.

- [x] **Step 6: Commit**

```bash
git add src/state/settings/core src/state/settings/coreSettingsSlices.ts tests/state/settings/coreSettingsSlices.test.ts
git commit -m "refactor(settings): core clusters become seven RTK slices"
```

---

## Task 2: The fifteen Layer clusters become slices

**Files:**

- Rename + rewrite (via `npm run move-files -- <from> <to>`, one `--manifest` run for all 15): every `src/layers/*/settings/*Settings.ts` listed under File Structure → `*Slice.ts`
- Modify: `src/layers/filaments/settings/filamentsLayerSettings.ts`, `src/layers/galaxyCatalog/settings/galaxyCatalogLayerSettings.ts`
- Create: `src/compositions/appSettingsSlices.ts`
- Modify: `src/@types/engine/layer/Layer.d.ts`
- Test: `tests/compositions/appSettingsSlices.test.ts`

**Interfaces:**

- Consumes: `CORE_SETTINGS_SLICES` (Task 1) only for the namespacing convention — no import.
- Produces: `APP_SETTINGS_SLICES`, a `readonly` tuple of 15 slices; `filamentsLayerSettings` and `galaxyCatalogLayerSettings` as `readonly Slice[]` tuples; `Layer`'s `settings?: Settings` where `Settings extends readonly Slice[]`.

Conversion is mechanical and identical for all 15. The fragment's `key` becomes `reducerPath`, `name` becomes `settings/<key>`, the reducers keep their names and bodies verbatim (they are already cluster-scoped — that is what `liftClusterReducers` re-based), and the file gains a destructured `export const { … } = <cluster>Slice.actions` block. The exported symbol renames `<cluster>SettingsFragment` → `<cluster>Slice`. Keep each file's existing module header, updated only where it names the fragment machinery.

`move-files` misses `.wesl` `package::` specifiers and string-literal paths — grep for each old path afterwards.

- [x] **Step 1: Write the failing test**

```ts
// tests/compositions/appSettingsSlices.test.ts
import { describe, expect, it } from 'vitest';
import { APP_SETTINGS_SLICES } from '../../src/compositions/appSettingsSlices';
import { CORE_SETTINGS_SLICES } from '../../src/state/settings/coreSettingsSlices';

describe('APP_SETTINGS_SLICES', () => {
  // combineSlices would silently let the later slice win the key; the old
  // composeInitialSettings threw for the same reason.
  it('claims each settings-root key once, and none core claims', () => {
    const paths = APP_SETTINGS_SLICES.map((s) => s.reducerPath);
    expect(new Set(paths).size).toBe(paths.length);
    const core = new Set(CORE_SETTINGS_SLICES.map((s) => s.reducerPath));
    expect(paths.filter((p) => core.has(p))).toEqual([]);
  });

  it('namespaces every action under settings/', () => {
    for (const slice of APP_SETTINGS_SLICES) {
      expect(slice.name).toBe(`settings/${slice.reducerPath}`);
    }
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/compositions/appSettingsSlices.test.ts`
Expected: FAIL — cannot resolve `src/compositions/appSettingsSlices`.

- [x] **Step 3: Convert the fifteen files**

Template (from `filamentsSettings.ts` → `filamentsSlice.ts`):

```ts
/**
 * filaments — the filament-skeleton overlay Layer's settings cluster: the
 * master toggle + intensity scale, and the reducers that write them.
 */

import { createSlice, type PayloadAction } from '@reduxjs/toolkit';

import { Source, SOURCE_REGISTRY } from '../../../data/sources';
import type { FilamentsSettings } from '../../../@types/settings/FilamentsSettings';

const initialState: FilamentsSettings = {
  enabled: SOURCE_REGISTRY[Source.Filaments].visible,
  intensity: SOURCE_REGISTRY[Source.Filaments].intensity,
};

export const filamentsSlice = createSlice({
  name: 'settings/filaments',
  reducerPath: 'filaments',
  initialState,
  reducers: {
    setFilamentsEnabled: (filaments, action: PayloadAction<boolean>) => {
      filaments.enabled = action.payload;
    },
    setFilamentIntensity: (filaments, action: PayloadAction<number>) => {
      filaments.intensity = action.payload;
    },
  },
});

export const { setFilamentsEnabled, setFilamentIntensity } = filamentsSlice.actions;
```

- [x] **Step 4: Retype the Layer contract**

In `src/@types/engine/layer/Layer.d.ts`, replace the `SettingsFragmentLike` import with `import type { Slice } from '@reduxjs/toolkit';` and the bound with `readonly Slice[]`:

```ts
  Settings extends readonly Slice[] = readonly Slice[],
```

The member's doc comment changes to name the new composer:

```ts
  /** Folded into the app's slice list by `appSettingsSlices`. Absent = no knobs. */
  readonly settings?: Settings;
```

`Layer.d.ts` carries a standing exemption from the comment-ratio budget (not from the ≤ 5-line header rule) — leave its other TSDoc alone.

- [x] **Step 5: Write `appSettingsSlices.ts`**

Same two-list shape as `appSettingsFragments.ts` it replaces — `UNFORMED_SETTINGS_SLICES` for the clusters that still predate `Layer.settings`, each formed Layer's tuple spread in beside it. Carry over the header's explanation of why a formed Layer's tuple is imported from the Layer rather than off `APP_COMPOSITION`, and that a cluster lives in one list or the other, never both.

- [x] **Step 6: Run the test**

Run: `npx vitest run tests/compositions/appSettingsSlices.test.ts`
Expected: PASS. `npm run typecheck` still fails — `settingsSlice.ts` imports the deleted fragments; Task 3 closes it.

- [x] **Step 7: Commit**

```bash
git add src/layers src/compositions/appSettingsSlices.ts src/@types/engine/layer/Layer.d.ts tests/compositions/appSettingsSlices.test.ts
git rm src/compositions/appSettingsFragments.ts tests/compositions/appSettingsFragments.test.ts
git commit -m "refactor(settings): each Layer cluster is its own RTK slice"
```

---

## Task 3: `combineSlices` replaces the hand-rolled composition

**Files:**

- Create: `src/state/settings/combinedSettingsReducer.ts`, `src/state/settings/mergeSnapshotAction.ts`, `src/state/settings/settingsReducer.ts`
- Modify: `src/@types/settings/EngineSettingsState.d.ts`, `src/state/settings/initialSettings.ts`, `src/store/rootReducer.ts`
- Modify (transitional): `src/state/settings/settingsSlice.ts` — reduced to a re-export block so the 77 call sites keep compiling until Task 4 deletes it
- Delete: `src/utils/settings/{liftClusterReducers,composeInitialSettings,assertUniqueFragmentReducerKeys}.ts` + their tests, `src/@types/settings/{LayerSettingsFragment,SettingsFragmentLike,LiftedCaseReducers,ComposedSettings,ComposedClusters}.d.ts`
- Test: `tests/state/settings/settingsReducer.test.ts` (replaces `settingsSlice.test.ts`)

**Interfaces:**

- Consumes: `CORE_SETTINGS_SLICES` (Task 1), `APP_SETTINGS_SLICES` (Task 2), `mergeSettingsSnapshot`.
- Produces: `combinedSettingsReducer`, `mergeSnapshot` (an action creator), `settingsReducer` (default export), and `EngineSettingsState = ReturnType<typeof combinedSettingsReducer>`.

**Two landmines this task exists to avoid.**

`mergeSnapshot` returns a whole new settings root, which no slice can do — a slice only ever sees its own cluster. Handling it as 22 per-slice `extraReducers` cases is the known silent-drop trap and 22 copies of one concept. It belongs in ONE higher-order reducer above the combine.

`EngineSettingsState` must derive from a module that imports no root type, or the alias references itself through `mergeSettingsSnapshot`. That is why the combine and the snapshot wrapper are two files, not one.

- [x] **Step 1: Write the failing test**

```ts
// tests/state/settings/settingsReducer.test.ts
import { describe, expect, it } from 'vitest';
import settingsReducer from '../../../src/state/settings/settingsReducer';
import { mergeSnapshot } from '../../../src/state/settings/mergeSnapshotAction';
import { setFilamentsEnabled } from '../../../src/layers/filaments/settings/filamentsSlice';
import { setBloomStrength } from '../../../src/state/settings/core/bloomSlice';
import { INITIAL_SETTINGS } from '../../../src/state/settings/initialSettings';

describe('settingsReducer', () => {
  it('routes a Layer action to that Layer cluster and leaves the rest by reference', () => {
    const next = settingsReducer(INITIAL_SETTINGS, setFilamentsEnabled(false));
    expect(next.filaments.enabled).toBe(false);
    // Structural sharing is what React selectors over untouched clusters rely on.
    expect(next.bloom).toBe(INITIAL_SETTINGS.bloom);
  });

  it('routes a core action to its core cluster', () => {
    const next = settingsReducer(INITIAL_SETTINGS, setBloomStrength(0.25));
    expect(next.bloom.strength).toBe(0.25);
  });

  // The one reducer that replaces the whole root — it cannot live in a slice.
  it('lays a partial snapshot over the root, cluster by cluster', () => {
    const next = settingsReducer(
      INITIAL_SETTINGS,
      mergeSnapshot({ bloom: { enabled: false, strength: 2, threshold: 1 } }),
    );
    expect(next.bloom).toEqual({ enabled: false, strength: 2, threshold: 1 });
    expect(next.filaments).toBe(INITIAL_SETTINGS.filaments);
  });
});
```

- [x] **Step 2: Run it and watch it fail**

Run: `npx vitest run tests/state/settings/settingsReducer.test.ts`
Expected: FAIL — cannot resolve `src/state/settings/settingsReducer`.

- [x] **Step 3: Write the three new modules**

```ts
// src/state/settings/combinedSettingsReducer.ts
/**
 * The settings root, composed by RTK. Imports no root type on purpose:
 * `EngineSettingsState` derives from THIS reducer, so a root-type import here
 * would make that alias reference itself.
 */

import { combineSlices } from '@reduxjs/toolkit';

import { APP_SETTINGS_SLICES } from '../../compositions/appSettingsSlices';
import { CORE_SETTINGS_SLICES } from './coreSettingsSlices';

export const combinedSettingsReducer = combineSlices(
  ...CORE_SETTINGS_SLICES,
  ...APP_SETTINGS_SLICES,
);
```

```ts
// src/state/settings/mergeSnapshotAction.ts
/** The tour's settings restore — see `mergeSettingsSnapshot` for what it guarantees. */

import { createAction } from '@reduxjs/toolkit';

import type { SettingsSnapshot } from '../../@types/engine/settings/SettingsSnapshot';

export const mergeSnapshot = createAction<Partial<SettingsSnapshot>>('settings/mergeSnapshot');
```

```ts
// src/state/settings/settingsReducer.ts
/**
 * The settings reducer: the RTK combine, plus the one write no slice can make.
 * A snapshot restore replaces whole clusters at once, so it runs ABOVE the
 * combine rather than as a case in each of the twenty-two slices.
 */

import { combinedSettingsReducer } from './combinedSettingsReducer';
import { mergeSettingsSnapshot } from './mergeSettingsSnapshot';
import { mergeSnapshot } from './mergeSnapshotAction';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';
import type { Action } from '@reduxjs/toolkit';

export default function settingsReducer(
  state: EngineSettingsState | undefined,
  action: Action,
): EngineSettingsState {
  const next = combinedSettingsReducer(state, action);
  return mergeSnapshot.match(action) ? mergeSettingsSnapshot(next, action.payload) : next;
}
```

- [x] **Step 4: Re-derive the root type and the boot value**

```ts
// src/@types/settings/EngineSettingsState.d.ts — body only; keep the ≤5-line header,
// updated to say the composer is now combineSlices.
import type { combinedSettingsReducer } from '../../state/settings/combinedSettingsReducer';

export type EngineSettingsState = ReturnType<typeof combinedSettingsReducer>;
```

```ts
// src/state/settings/initialSettings.ts
/** The settings root at boot — every slice's own `initialState`, composed. */

import { combinedSettingsReducer } from './combinedSettingsReducer';
import type { EngineSettingsState } from '../../@types/settings/EngineSettingsState';

export const INITIAL_SETTINGS: EngineSettingsState = combinedSettingsReducer(undefined, {
  type: '@@settings/INIT',
});
```

- [x] **Step 5: Point `rootReducer` at it, and shrink `settingsSlice.ts` to a transitional re-export**

`src/store/rootReducer.ts`: `import settingsReducer from '../state/settings/settingsReducer';`.

`src/state/settings/settingsSlice.ts` keeps only `export { … } from '…'` lines for every action creator plus `mergeSnapshot`, with a one-line header saying it is transitional and Task 4 deletes it. This keeps the branch green between tasks; it is **not** the shipped shape.

- [x] **Step 6: Delete the machinery**

`git rm` the five `@types/settings` files, the three `utils/settings` files, and their tests. Replace `tests/state/settings/settingsSlice.test.ts` with the new `settingsReducer.test.ts`. Anything the deleted tests covered that is not covered by Tasks 1–3's tests gets kept as a test here, not silently dropped — say which in the ledger.

- [x] **Step 7: Run the suite**

Run: `npm test` then `npm run typecheck`
Expected: both PASS. One known text change: `tests/components/containers/StructuresSectionContainer.test.ts:48` asserts the literal `'settings/setStructureItemEnabled'`, which is now `'settings/structures/setStructureItemEnabled'`.

- [x] **Step 8: Commit**

```bash
git add src/state/settings src/@types/settings src/store/rootReducer.ts tests/state/settings tests/components/containers/StructuresSectionContainer.test.ts
git rm src/utils/settings/liftClusterReducers.ts src/utils/settings/composeInitialSettings.ts src/utils/settings/assertUniqueFragmentReducerKeys.ts tests/utils/settings/liftClusterReducers.test.ts tests/utils/settings/composeInitialSettings.test.ts tests/utils/settings/assertUniqueFragmentReducerKeys.test.ts
git commit -m "refactor(settings): combineSlices replaces the hand-rolled composition"
```

---

## Task 4: Re-point every import site and delete `settingsSlice.ts`

**Files:**

- Modify: the 42 src + 35 test files importing from `src/state/settings/settingsSlice`
- Modify: `src/@types/animation/SettingsAction.d.ts` (type-imports `setFlow`, `setFlowEnabled`, `setGalaxyCatalogVisible`, `setLabelsFocusedOnly` — now three different modules)
- Delete: `src/state/settings/settingsSlice.ts`

**Interfaces:**

- Consumes: the action creators each slice module exports (Tasks 1–2).
- Produces: nothing new. This task is pure churn; the only acceptable diff outside an import statement is the `SettingsAction` type's import block.

Every creator moves to the module that owns its cluster: a `set…` for a Layer cluster to `src/layers/<layer>/settings/<cluster>Slice.ts`, a core one to `src/state/settings/core/<cluster>Slice.ts`, and `mergeSnapshot` to `src/state/settings/mergeSnapshotAction.ts`. Work from `grep -rln "state/settings/settingsSlice" src tests`; the mapping is the `export const { … } = <slice>.actions` block in each slice file.

Prefer `npm run refactor` (the ts-morph CLI) over hand edits where it can move a symbol's references; check its output, it has known blind spots.

- [x] **Step 1: Re-point the src files**

Run: `grep -rln "state/settings/settingsSlice" src` and fix each. `npm run typecheck` after.

- [x] **Step 2: Re-point the test files**

Run: `grep -rln "state/settings/settingsSlice" tests` and fix each.

- [x] **Step 3: Delete the transitional module**

```bash
git rm src/state/settings/settingsSlice.ts
```

`grep -rn "settingsSlice" src tests` must come back empty.

- [x] **Step 4: Full green**

Run: `npm test`, `npm run typecheck`, `npm run format`
Expected: all PASS, suite count unchanged but for the tests this plan deleted and added.

- [x] **Step 5: Commit**

```bash
git add src tests
git commit -m "refactor(settings): import action creators from the slice that owns them"
```

---

## Task 5: Documentation sweep

**Files:**

- Modify: `src/layers/README.md` (the Layer folder convention — the `settings/` section now describes slices)
- Modify: any doc naming `LayerSettingsFragment`, `liftClusterReducers` or `appSettingsFragments`

- [x] **Step 1: Find the stale references**

Run: `grep -rn "SettingsFragment\|liftClusterReducers\|appSettingsFragments\|composeInitialSettings" docs src/layers/README.md`

- [x] **Step 2: Rewrite them**

A Layer's `settings/` folder holds one `createSlice` per cluster it owns, plus a `<layer>LayerSettings.ts` tuple when the Layer owns more than one. Say why the tuple is imported from the Layer rather than off `APP_COMPOSITION`.

- [x] **Step 3: Commit**

```bash
git add docs src/layers/README.md
git commit -m "docs(settings): the fragment machinery is gone"
```

---

## Out of scope (deferred)

- **Breaking the settings type cycle** (`EngineSettingsState` → `APP_COMPOSITION` → `Layer.passes` → `PassState` → `EngineState.settings`). Spec §4.3 ruled the fix — narrow `EngineState.settings` to `CoreSettingsState`, give each Layer one widening accessor — and it is step 5 of the agreed order, deliberately last: it gets cheaper as more Layers form. `tsc` sees this cycle; `tsgo` does not, so `typecheck:fast` cannot be the gate for it.
- **Who owns a selector.** `src/state/settings/selectors.ts` keeps all 66 selectors in one core module. Whether a Layer owns its own selectors is a step-3/step-5 question.
- **`Layer.settings` declaring sub-slices.** Every cluster is flat under the settings root today; nested slices are not a shape anything needs yet.

## Definition of Done

- [x] `npm test` and `npm run typecheck` green; `npm run build` green.
- [x] `grep -rn "SettingsFragment\|liftClusterReducers\|composeInitialSettings\|assertUniqueFragmentReducerKeys\|settingsSlice" src tests docs` returns nothing.
- [x] `state.settings` is key-for-key identical to `main` at boot — assert by diffing `INITIAL_SETTINGS` against main's, not by reading the code.
- [x] `src/state/settings/selectors.ts` diff is import lines only.
- [x] Net source lines DOWN — the machinery deleted exceeds the slices added.
- [x] Manual smoke: settings panel toggles drive the render, and a guided-tour run restores settings at the end (the `mergeSnapshot` path).
