# Settings store → Redux Toolkit — Plan 1: foundation (new RTK store, built green, not yet wired)

**Goal.** Stand up the full Redux Toolkit vehicle — `src/store/` (`configureStore` +
saga middleware + typed hooks) and `src/state/settings/` (slice with inline-Immer
reducers, `initialState`, consolidated RootState-scoped selectors) — as *new* code
covered by its own tests, plus the independent `disabledPasses` `Set → Record` change.
At the end of this plan the new RTK store is fully built and tested, the **old zustand
store is still live and wired**, and the suite is green. Plan 2 does the coupled swap.

**Architecture.** Mirror the reference implementation
(`~/Development/js/repperjs/packages/motif-segmentation/src/store/` + `src/state/<feature>/`):
`combineReducers` keyed by a route constant gives `RootState = { settings: EngineSettingsState }`;
the slice holds inline Immer reducers (one row per existing settings-store reducer, RTK
generates the action creators); selectors are RootState-scoped base+derived `createSelector`
chains in a single `selectors.ts`. A `createAppStore()` **factory** (not a module singleton —
skymap's tests construct engines repeatedly and a shared store would leak state across them)
wires a `redux-saga` middleware running an empty `mainSaga`. Source layer stays React-free:
it imports only `@reduxjs/toolkit` / saga, never `react-redux`.

**Tech Stack.** TypeScript + Vite + React 19; `@reduxjs/toolkit`, `react-redux`,
`redux-saga`, `typed-redux-saga` (added here); Immer (bundled with RTK); Vitest.

> **For agentic workers.** Execute via `superpowers:subagent-driven-development` — one
> fresh subagent per task, each running `test-driven-development` (write the failing test,
> watch it fail, implement, watch it pass, commit). The main thread runs `npm`/`git` and
> the reviews; implementers only edit. Tick each task's `- [ ]` boxes inline as you go.

---

## Source of truth

This plan implements the spec
`docs/superpowers/specs/2026-06-18-settings-store-rtk-migration-design.md`. Every section
below maps to a "Design" / "Build order" item there. Read the spec and the reference
implementation files before starting; the conventions below are non-negotiable.

## Conventions (apply to every task)

- **TDD, bite-sized.** Each task is one 2–5 min loop: write the failing test → run it,
  confirm it fails → implement the minimum → run it, confirm green → commit. `npm test`
  + `npm run typecheck` pass at **every** commit.
- **RTK reducer arg names** are `(settings, action: PayloadAction<…>) => { … }` — full
  words, **never** terse `s` / `a`. (Matches the reference `cutoutsSlice.ts`.)
- **`type` aliases, never `interface`.** One type per file under `src/@types/`. One symbol
  per file under `src/utils/`.
- **Selectors consolidate into one `selectors.ts`** — this is an explicit spec decision
  (`### Selectors — one module`) that **overrides** the one-function-per-file rule *for
  selectors only*. The slice file likewise holds all reducer rows (RTK idiom). Everything
  else keeps one-symbol-per-file.
- **`Vec2` / `Vec3` aliases**, never raw tuples, anywhere a tuple would appear.
- **Didactic module headers** on every new file — explain *why* this shape and *what the
  alternative was*, matching the existing settings-store file headers (e.g.
  `createSettingsStore.ts`, `mergeSettingsSnapshot.ts`). Match that multi-paragraph voice.
- **Preserve the spec's decomplection choices.** The spec deliberately un-braids: store
  *ownership* moves to the app root (Plan 2); `disabledPasses` becomes serializable so
  there is **no `serializableCheck` exception** and no `enableMapSet`; the slice's inline
  Immer reducers replace the 29+29 free-function reducer/action pair. Do not re-introduce
  a `serializableCheck: false`, a Map/Set field, or a parallel action-wrapper layer.
- **Commits.** Stage **specific paths only** — never `git add -A` / `git add .`. User's git
  identity (no `--author`). End every commit body with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
  Branch is already `worktree-settings-rtk-migration`.

## Naming contract (must stay identical across Plan 1 and Plan 2)

- Store factory: `createAppStore(preloadedState?: PreloadedState) → AppStore`.
- Types: `RootState = ReturnType<typeof rootReducer>`; `AppStore = ReturnType<typeof createAppStore>`;
  `AppDispatch = AppStore['dispatch']`.
- Route constant: `settingsRoute = 'settings'`.
- Hooks: `useAppDispatch`, `useAppSelector`.
- Saga: `mainSaga` (in `rootSaga.ts`).
- Base selector: `selectSettings = (state: RootState) => state[settingsRoute]`.
- Slice action creators: **same names as today's reducers** (`setBrightness`,
  `setGalaxyCatalogVisible`, `setPassDisabled`, `mergeSnapshot`, …) so Plan 2's write-path
  repoint references them by the names this plan exports.

---

## Task list

### Task 1: Add the Redux Toolkit dependencies

**Files:** `package.json` (modify).

The main thread (not an implementer subagent — background subagents can't run npm) adds
`@reduxjs/toolkit`, `react-redux`, `redux-saga`, `typed-redux-saga` to `dependencies`.
Do **not** remove `zustand` yet (the old store is still live until Plan 2).

- [ ] `npm install @reduxjs/toolkit react-redux redux-saga typed-redux-saga` (pin the
  installed versions in `package.json`).
- [ ] `npm run typecheck` still passes (no usage yet, so this is a no-op guard).
- [ ] Commit `package.json` + `package-lock.json`.

---

### Task 2: `src/store/constants.ts` — the route constant

**Files:** `src/store/constants.ts` (new), `tests/store/constants.test.ts` (new).

**Contract:** `export const settingsRoute = 'settings';` (typed as the literal `'settings'`
via `as const` or a `const` string literal). Reference: `src/state/constants.ts` in the
reference impl.

- [ ] Add the test `settingsRoute is the 'settings' literal` asserting
  `settingsRoute === 'settings'`.
- [ ] Implement `constants.ts` with a didactic header (why a route constant: it keys
  `combineReducers` so `RootState` gains a typed `settings` slot, and the selection fold
  adds sibling routes here without touching reducers).
- [ ] `npm test -- store/constants` → green. Commit both files.

---

### Task 3: `src/state/settings/initialState.ts` — the boot-time literal

**Files:** `src/state/settings/initialState.ts` (new), `tests/state/settings/initialState.test.ts` (new).

This is `buildInitialSettings`'s body relocated to its reference home, **with one change**:
`disabledPasses` is seeded as `{}` (see Task 7's type change — sequence this so the type is
already `Record<string, boolean>` by the time this file is committed; if Task 7 lands first
it does, so **do Task 7 before this task** — see sequencing note at the bottom).

**Contract.** Keep `buildInitialSettings`'s `(opts: { readonly initialTier: Tier })` signature
and every cluster verbatim (see `buildInitialSettings.ts:50-127`), except:
`debug.disabledPasses: {}`.

- [ ] Add tests asserting: every cluster present; `galaxyCatalogs.items` has one row per
  `GALAXY_CATALOG_IDS` (each `{ enabled: true, labelEnabled: true }`); `structures.items`
  one row per `STRUCTURE_IDS`; `volumes.items` from `seedVolumeFields()`;
  `debug.disabledPasses` deep-equals `{}`; `tier` echoes the passed `initialTier`. (Port the
  existing assertions from `tests/services/engine/settingsStore/buildInitialSettings.test.ts`,
  adjusting the `disabledPasses` assertion from `Set` to `{}`.)
- [ ] Implement `initialState.ts` exporting `buildInitialSettings` (keep the name — Plan 2's
  `createAppStore` preloaded-state helper calls it). Didactic header: assembly step, derives
  item rows from the id arrays so the seed can't drift; flat-root `tier` exception noted.
- [ ] `npm test -- state/settings/initialState` → green. Commit both files.

> Note: the OLD `buildInitialSettings.ts` stays in place this plan (engine still imports it).
> It's deleted in Plan 2. This is an intentional transient duplication of the literal — both
> read the same `data/defaults.ts` constants, so they can't silently diverge in values, only
> in the `disabledPasses` shape, which Task 7 unifies to `Record` on both sides first.

---

### Task 4: `src/store/types.ts` + `rootReducer.ts` — RootState shape

**Files:** `src/store/rootReducer.ts` (new), `src/store/types.ts` (new),
`tests/store/rootReducer.test.ts` (new). Depends on Task 6 (the slice reducer) for a real
reducer to combine — so **sequence Task 6 before this** (see bottom). Until then this task
can't compile; it is listed here for narrative order but executes after the slice exists.

**Contract.**
```ts
// rootReducer.ts
export const rootReducer = combineReducers({ [settingsRoute]: settingsReducer });
// types.ts
export type RootState = ReturnType<typeof rootReducer>;
export type AppStore = ReturnType<typeof createAppStore>;   // imported from createAppStore.ts
export type AppDispatch = AppStore['dispatch'];
```

- [ ] Add the test `rootReducer exposes only the settings route` — assert
  `Object.keys(rootReducer(undefined, { type: '@@INIT' }))` deep-equals `['settings']` and that
  `rootReducer(undefined, { type: '@@INIT' }).settings` is defined. (Don't re-assert the
  initialState shape here — that's the slice's own concern in Task 6.)
- [ ] Implement `rootReducer.ts` (combineReducers keyed by `settingsRoute`) and `types.ts`
  (the three type aliases). Didactic header on `rootReducer.ts`: route-keyed combine gives the
  forward-compatible `RootState` the selection fold extends with sibling slices.
- [ ] `npm test -- store/rootReducer` + `npm run typecheck` → green. Commit all three files.

---

### Task 5: `src/store/hooks.ts` — typed react-redux hooks

**Files:** `src/store/hooks.ts` (new), `tests/store/hooks.test.ts` (new).

**Contract** (verbatim reference shape, `src/store/hooks.ts`):
```ts
export const useAppDispatch: () => AppDispatch = useDispatch;
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
```

- [ ] Add a render test: wrap a probe component in `<Provider store={createAppStore()}>`,
  call `useAppSelector(selectSettings)` inside it (use `@testing-library/react`'s
  `renderHook` with a `wrapper`), assert it returns the slice's `initialState`. (This doubles
  as the first Provider-read smoke.)
- [ ] Implement `hooks.ts`. Didactic header: typed wrappers so call sites never re-annotate
  `RootState`; `react-redux` is allowed here (hooks/ layer), not in `services/`.
- [ ] `npm test -- store/hooks` → green. Commit both files.

> `createAppStore` is referenced here — sequence Task 8 (the factory) before this task's test
> can run. See the sequencing note.

---

### Task 6: `src/state/settings/settingsSlice.ts` — inline-Immer slice (the core)

**Files:** `src/state/settings/settingsSlice.ts` (new),
`tests/state/settings/settingsSlice.test.ts` (new). Depends on Tasks 3 (initialState) and 7
(`disabledPasses` type).

**Contract.** `createSlice({ name: 'settings', initialState, reducers: { … } })` with **one
inline Immer reducer per existing free-function reducer**. RTK generates the action creators;
re-export them all (`export const { setBrightness, … } = settingsSlice.actions;`) and
`export default settingsSlice.reducer;`. Reducer arg names are `(settings, action)`.

The reducer rows, grouped (the bodies are draft-mutations — the implementer writes each from
the matching free-function reducer in `src/services/engine/settingsStore/reducers/`; do **not**
paste 29 bodies here):

| Action creator | Payload type | Draft mutation (port from reducer file) |
| --- | --- | --- |
| `setGalaxyCatalogSize` | `number` | `settings.galaxyCatalogs.sizePx = payload` |
| `setBrightness` | `number` | `settings.galaxyCatalogs.brightness = payload` |
| `setDepthFade` | `boolean` | `settings.galaxyCatalogs.depthFade = payload` |
| `setHighlightFallback` | `boolean` | `settings.galaxyCatalogs.highlightFallback = payload` |
| `setRealOnly` | `boolean` | `settings.galaxyCatalogs.realOnly = payload` |
| `setGalaxyCatalogVisible` | `{ id: GalaxyCatalogId; enabled: boolean }` | `settings.galaxyCatalogs.items[id].enabled = enabled` |
| `setGalaxyCatalogLabelEnabled` | `{ id: GalaxyCatalogId; enabled: boolean }` | `…items[id].labelEnabled = enabled` |
| `setExposure` | `number` | `settings.tonemap.exposure = payload` |
| `setToneMapCurve` | `ToneMapCurve` | `settings.tonemap.curve = payload` |
| `setAutoRotate` | `boolean` | `settings.camera.autoRotate = payload` |
| `setBiasMode` | `BiasMode` | `settings.bias.mode = payload` |
| `setAbsMagLimit` | `number` | `settings.bias.absMagLimit = payload` |
| `setThumbnailsEnabled` | `boolean` | `settings.thumbnails.enabled = payload` |
| `setMilkyWayEnabled` | `boolean` | `settings.milkyWay.enabled = payload` |
| `setMilkyWayLabelEnabled` | `boolean` | `settings.milkyWay.labelEnabled = payload` |
| `setFilamentsEnabled` | `boolean` | `settings.filaments.enabled = payload` |
| `setFilamentIntensity` | `number` | `settings.filaments.intensity = payload` |
| `setVolumesEnabled` | `boolean` | `settings.volumes.enabled = payload` |
| `addVolumeField` | (port `addVolumeField`'s args as a payload object) | seed `items[fieldId]` |
| `removeVolumeField` | `{ fieldId: VolumeFieldId }` | `delete settings.volumes.items[fieldId]` |
| `writeVolumeField` | (port `writeVolumeField`'s args — the field-param patch) | merge into `items[fieldId]` |
| `setFlow` | `Partial<FlowSettings>` | `Object.assign(settings.flow, payload)` (port `setFlow`) |
| `setShowPickBuffer` | `boolean` | `settings.debug.showPickBuffer = payload` |
| `setShowDiskRadiusRing` | `boolean` | `settings.debug.showDiskRadiusRing = payload` |
| `setPassDisabled` | `{ pass: string; disabled: boolean }` | `settings.debug.disabledPasses[pass] = disabled` (plain object) |
| `setStructureItemEnabled` | `{ id: StructureId; enabled: boolean }` | `settings.structures.items[id].enabled = enabled` |
| `setStructureLabelEnabled` | `{ id: StructureId; enabled: boolean }` | `settings.structures.items[id].labelEnabled = enabled` |
| `setTier` | `Tier` | `settings.tier = payload` |
| `mergeSnapshot` | `Partial<SettingsSnapshot>` | `return mergeSettingsSnapshot(settings, payload)` (Immer permits returning new state) |

Notes the implementer must honour:
- `mergeSnapshot` calls the **kept** free function `mergeSettingsSnapshot` (Task 9 relocates
  it; until then import from its current path). It *returns* new state rather than draft-mutating
  — the structuredClone-merge stays as-is.
- The exact payload shapes for the multi-arg volume reducers (`addVolumeField`,
  `writeVolumeField`) come from reading those reducer files; encode them as a single payload
  object (RTK actions take one payload). Where today's reducer took positional args
  `(state, fieldId, cube)`, the action payload is `{ fieldId, cube }`.
- Where the corresponding `set*Visible`/`*LabelEnabled` reducers took positional
  `(state, id, enabled)`, the payload is `{ id, enabled }` (so Plan 2's bespoke setters
  dispatch `setGalaxyCatalogVisible({ id, enabled })`).

**Tests** (port the assertions from the 28 reducer test files + the
`setMilkyWayLabelEnabled.test.ts`, restructured to dispatch-then-assert). One `describe` per
action; each test constructs a throwaway store (or calls `settingsSlice.reducer(state,
action)` directly) and asserts the resulting state:
- [ ] For each action creator, a test `<actionName> updates <field>` — e.g.
  `setBrightness updates galaxyCatalogs.brightness`: `reducer(initialState, setBrightness(0.5))`
  → `.galaxyCatalogs.brightness === 0.5`. (Group the 29 into per-cluster `describe` blocks;
  the test names are the acceptance criteria — keep them specific per the existing tests.)
- [ ] `setPassDisabled` tests assert the **object** semantics:
  `reducer(s, setPassDisabled({ pass: 'foo', disabled: true })).debug.disabledPasses` deep-equals
  `{ foo: true }`; a second `setPassDisabled({ pass: 'foo', disabled: false })` → `{ foo: false }`.
- [ ] `mergeSnapshot` tests port `tests/.../reducers/mergeSettingsSnapshot.test.ts` — partial
  patch replaces only its clusters; untouched clusters keep their **reference** (assert
  `result.camera === before.camera` for a patch that omits `camera`); the patch is detached
  (mutating the input patch after dispatch doesn't bleed into state).
- [ ] **Ref-stability** test (the property the old copy-on-write reducers hand-maintained,
  now Immer's job): `const before = reducer(initialState, { type: 'x' }); const after =
  reducer(before, setBrightness(9));` → `after.galaxyCatalogs !== before.galaxyCatalogs` **and**
  `after.tonemap === before.tonemap`. This is the React-selector-skip guarantee.
- [ ] Implement the slice. Didactic header: why inline Immer (deletes the 29+29 free-function
  reducer/action pair; Immer gives the structural sharing the old copy-on-write hand-maintained);
  `mergeSnapshot` stays a returning case-reducer over the kept free function.
- [ ] `npm test -- state/settings/settingsSlice` → all green. Commit both files.

---

### Task 7: `disabledPasses` `ReadonlySet<string>` → `Record<string, boolean>` (independent, lands green on its own)

**Files (type):** `src/@types/settings/EngineSettingsState.d.ts`.
**Files (frame encoders):** `src/services/engine/frame/encodeHdrSplit.ts`,
`encodeHdrSingle.ts`, `encodeUiOverlay.ts`.
**Files (old selector + reducer, still live this plan):**
`src/services/engine/settingsStore/selectors/selectDisabledPasses.ts`,
`reducers/setPassDisabled.ts`, `buildInitialSettings.ts`.
**Files (React props):** `src/components/DebugPanel/RenderTogglesSection.tsx`,
`DebugPanel.tsx`, `App.tsx` (the `DISABLED_PASSES_DEFAULT` seed + prop type).
**Files (handle type):** `src/@types/engine/handles/EngineDebugHandle.d.ts` (only if it
references the Set type — check).
**Tests/fixtures:** `tests/services/engine/settingsStore/makeSettingsFixture.ts` and any
test asserting `disabledPasses` as a `Set` (e.g.
`tests/.../reducers/setPassDisabled.test.ts`, `selectors/selectDisabledPasses.test.ts`,
`buildInitialSettings.test.ts`, and any frame-encoder test).

This is a **standalone, independently-green** change — it touches the *old* zustand path plus
the encoders and lands a green commit without any RTK code. Do it **before** Tasks 3 and 6 so
`initialState`/the slice are authored against the final type.

**Contract.**
- `EngineSettingsState.debug.disabledPasses: Record<string, boolean>` (was `ReadonlySet<string>`).
  Update the field doc: membership is `[name] === true`; absent or `false` = enabled.
- Encoders: `disabledPasses.has(name)` → `disabledPasses[name] === true` (three encoder
  files; see `encodeHdrSingle.ts:96`, `encodeHdrSplit.ts:102`, `encodeUiOverlay.ts:76`).
- Old `setPassDisabled` reducer: `const next = { ...state.debug.disabledPasses, [pass]:
  disabled };` (was `new Set(...)`). Keep copy-on-write on the `debug` cluster.
- Old `selectDisabledPasses`: returns `Record<string, boolean>`; update its doc (still
  reference-stable between toggles, same contract — now an object literal not a `Set`).
- `buildInitialSettings.ts`: `disabledPasses: {}` (was `new Set<string>()`).
- React: `RenderTogglesSection`/`DebugPanel` prop type `disabledPasses: Record<string,
  boolean>`; membership reads `disabledPasses[name] === true` (replaces `.has(name)` at
  `RenderTogglesSection.tsx:51,59`); App's `DISABLED_PASSES_DEFAULT` becomes `{}`.

- [ ] Update the failing-first test: change `makeSettingsFixture.ts` and the
  `setPassDisabled` / `selectDisabledPasses` / `buildInitialSettings` tests to expect a
  `Record`. Run them — they fail against the current `Set` impl.
- [ ] Add an encoder-level assertion if a frame-encoder test exists for pass-skipping; assert
  a disabled pass (`{ foo: true }`) is skipped and `{ foo: false }` is not. (If no such test
  exists, skip — don't invent a GPU harness.)
- [ ] Apply the type + encoder + old-reducer + old-selector + `buildInitialSettings` + React
  edits. Run `npm test` + `npm run typecheck`.
- [ ] Commit all touched paths in one commit (the type, the three encoders, the old
  reducer/selector/builder, the React props, the fixtures). Suite green on the *old* store.

---

### Task 8: `src/store/createAppStore.ts` + `src/store/rootSaga.ts` — the factory + empty saga

**Files:** `src/store/rootSaga.ts` (new), `src/store/createAppStore.ts` (new),
`tests/store/createAppStore.test.ts` (new). Depends on Task 4 (rootReducer/types) and Task 6
(slice).

**Contract.**
```ts
// rootSaga.ts
export function* mainSaga() {
  yield* all([]);   // forks nothing yet — the seam phase 2 fills
}

// createAppStore.ts
export type PreloadedState = { [settingsRoute]: EngineSettingsState };
export function createAppStore(preloadedState?: PreloadedState) {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({
    reducer: rootReducer,
    preloadedState,
    middleware: (getDefaultMiddleware) => getDefaultMiddleware().concat(sagaMiddleware),
  });
  sagaMiddleware.run(mainSaga);
  return store;
}
```
- **No `serializableCheck: false`** and **no `enableMapSet`** — the whole settings state is
  serializable after Task 7 (this is the spec's decomplection; do not re-add the exception).
- `AppStore`/`AppDispatch` (in `types.ts`, Task 4) derive from `createAppStore`'s return.

**Tests:**
- [ ] `createAppStore returns a store seeded with settings initialState` — no preloaded state,
  assert `store.getState().settings` deep-equals the slice `initialState`.
- [ ] `createAppStore honours preloadedState` — pass `{ settings: buildInitialSettings({
  initialTier: 'large' }) }`, assert `store.getState().settings.tier === 'large'`.
- [ ] `dispatching a slice action updates state` — `store.dispatch(setBrightness(0.25))`,
  assert `store.getState().settings.galaxyCatalogs.brightness === 0.25` (round-trip through
  the real configured store, proving the saga middleware didn't swallow the action).
- [ ] `the saga middleware runs mainSaga without throwing` — constructing the store doesn't
  throw and `store.getState()` is defined (smoke that `sagaMiddleware.run(mainSaga)` is wired).
- [ ] Implement `rootSaga.ts` then `createAppStore.ts`. Didactic headers: factory not
  singleton (test isolation — engines are constructed repeatedly); saga wired-but-empty so
  phase 2 forks feature sagas without re-plumbing the store; no serializableCheck exception
  because `disabledPasses` is now a plain object.
- [ ] `npm test -- store/createAppStore` + `npm run typecheck` → green. Commit all three files.

---

### Task 9: `src/state/settings/selectors.ts` — consolidated RootState-scoped selectors

**Files:** `src/state/settings/selectors.ts` (new),
`tests/state/settings/selectors.test.ts` (new). Also relocate `mergeSettingsSnapshot` and the
three `project*` helpers (see below). Depends on Tasks 4/6/8.

**Contract.** A single module, base + derived (reference `cutouts/selectors.ts` shape):
```ts
export const selectSettings = (state: RootState) => state[settingsRoute];
export const selectBrightness = createSelector(selectSettings, (s) => s.galaxyCatalogs.brightness);
export const selectVisibleSourceMask = createSelector(selectSettings, deriveVisibleSourceMask);
// …one export per existing selector, RootState-scoped
```
Port **all 25** existing selectors (`src/services/engine/settingsStore/selectors/`), renaming
the input from `EngineSettingsState` to `RootState` via the `selectSettings` base. Keep the
**same export names** (`selectBrightness`, `selectTier`, `selectDisabledPasses`,
`selectVisibleSourceMask`, `selectGalaxyCatalogItems`, `selectStructureItems`,
`selectVolumeFieldItems`, `selectFlow`, …) so Plan 2's call-site swap is a pure import-path +
arg change. The non-trivial derivations (`selectVisibleSourceMask` over
`GALAXY_CATALOG_SOURCES`; the items selectors) move their bodies into `createSelector`
result functions — extract each into a small named `derive*` function file under
`src/utils/` **only if** it's genuinely reusable; otherwise inline the result function (the
spec consolidates selectors, so an inline arrow in `selectors.ts` is correct here).

**`mergeSettingsSnapshot` + `project*` relocation:** the spec keeps `mergeSettingsSnapshot`
a free function feeding the `mergeSnapshot` case reducer, and keeps the three `project*`
helpers feeding selectors. Move them to the new layer so Plan 2 can delete the old
`settingsStore/` directory wholesale:
- `mergeSettingsSnapshot` → `src/state/settings/mergeSettingsSnapshot.ts` (one-symbol file;
  update the Task 6 slice import to this path).
- `projectLabelCategoryVisibility`, `projectMarkerCategoryVisibility`,
  `projectVolumeFieldRows` → `src/state/settings/` (one file each), imported by the relevant
  selectors. (These are one-function-per-file — the selectors-consolidation override does
  **not** extend to these helpers.)
- Move their tests to `tests/state/settings/` (port assertions unchanged).

**Tests:** port the 24 selector tests into `selectors.test.ts`, RootState-scoped — each
builds a `RootState` via `{ [settingsRoute]: buildInitialSettings({ initialTier: 'medium' }) }`
(optionally patched) and asserts the selector's output:
- [ ] One test per selector — e.g. `selectBrightness reads galaxyCatalogs.brightness`,
  `selectVisibleSourceMask packs enabled bits bit-identically to deriveSourceMasks' pick mask`
  (port the existing assertion), `selectDisabledPasses returns the debug record`,
  `selectTier reads tier`. Group by cluster.
- [ ] `createSelector` memoization smoke: `selectVisibleSourceMask(state) ===
  selectVisibleSourceMask(state)` for the same `state` reference (proves the derived selector
  is memoized, matching the reference style).
- [ ] Implement `selectors.ts` + the relocated `mergeSettingsSnapshot` + `project*` files.
  Didactic header on `selectors.ts`: one module is the spec's explicit override of
  one-fn-per-file; base `selectSettings` + derived `createSelector` chain; RootState-scoped so
  they drop into both `useAppSelector(selectX)` and engine-side `selectX(store.getState())`.
- [ ] `npm test -- state/settings/selectors` + `npm run typecheck` → green. Commit all new files.

---

### Task 10: Entanglement-radar review of the new RTK layer

**Files:** none (review only — fixes, if any, are follow-up commits).

Run the `entanglement-radar` skill over the full Plan-1 diff (`src/store/` + `src/state/settings/`
+ the `disabledPasses` change). Check specifically:
- [ ] No `serializableCheck: false` / `enableMapSet` snuck in (the spec's serializability win).
- [ ] `disabledPasses` is a single canonical `Record` shape everywhere — no surviving `Set`
  idiom, no `.has(` left in encoders or React.
- [ ] Selectors are RootState-scoped from one base (`selectSettings`) — no selector still
  typed over bare `EngineSettingsState` (those would force a second cast at the engine seam in
  Plan 2).
- [ ] The slice is the **single** write path — no re-introduced action-wrapper layer parallel
  to the slice's generated creators.
- [ ] `src/state/` / `src/store/` import **no** `react-redux` (services stays React-free;
  only `hooks.ts` may import it, and `hooks.ts` lives under `src/store/` which is the seam —
  confirm nothing in `src/state/settings/` imports react).
- [ ] Record any genuine knot as a follow-up; "no significant complecting found" is a valid
  result. Commit any fixes with a clear message.

---

## Definition of Done (Plan 1 — the `/feature-done` gate)

- [ ] `npm test` — full suite green (new `tests/store/**` + `tests/state/settings/**` pass;
  old `tests/services/engine/settingsStore/**` still pass — they're deleted in Plan 2).
- [ ] `npm run typecheck` — both tsconfigs clean.
- [ ] No `TODO` / placeholder left in any new file.
- [ ] New surface present and exported with the **naming contract** names:
  `createAppStore`, `RootState`/`AppStore`/`AppDispatch`, `settingsRoute`, `mainSaga`,
  `useAppDispatch`/`useAppSelector`, `selectSettings`, and the slice action creators matching
  the old reducer names.
- [ ] `disabledPasses` is `Record<string, boolean>` everywhere; no `.has(` on it remains
  (`grep -rn "disabledPasses" src/ | grep "\.has("` is empty).
- [ ] The **old** zustand store, `useSettingsStore`, `createSettingsStore`,
  `buildInitialSettings`, and the 29/29/25 reducer/action/selector files are **still present
  and wired** — Plan 1 does not delete them.
- [ ] `zustand` is **still** in `package.json` (removed in Plan 2).

---

## Sequencing note (independently-green ordering)

Author order, so every commit is green and types resolve forward:

1. **Task 1** (deps) — no-op guard.
2. **Task 7** (`disabledPasses` Set→Record) — independent, green on the old store alone.
3. **Task 2** (constants), **Task 3** (initialState).
4. **Task 6** (slice) — needs initialState + the new `disabledPasses` type.
5. **Task 4** (rootReducer/types) — needs the slice reducer.
6. **Task 8** (createAppStore/rootSaga) — needs rootReducer + slice.
7. **Task 5** (hooks) — needs createAppStore (Provider render test).
8. **Task 9** (selectors + `mergeSettingsSnapshot`/`project*` relocation) — needs RootState.
9. **Task 10** (radar review).

Tasks 2–9 are each independently green commits; the new RTK store is fully built and tested,
the old store still runs the app.

---

**Next:** Plan 2 — `2026-06-18-settings-store-rtk-migration-2-injection-react.md`. It injects
`createAppStore` at the app root (`main.tsx` `<Provider>` + `useEngine` `useStore()` →
`createEngine({store})`), repoints `get settings()` + the whole write path to `dispatch`,
migrates every `useSettingsStore` consumer to `useAppSelector`, deletes the old store +
adapter + reducer/action/selector files, removes `zustand`, and reorganizes the old tests.
