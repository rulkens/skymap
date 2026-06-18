# Settings store → Redux Toolkit — Plan 2: injection + React (the coupled swap)

**Goal.** Make the RTK store from Plan 1 the *one live store*: created at the app root and
injected into `createEngine`, consumed by React through react-redux `<Provider>` +
`useAppSelector`. Repoint the engine's `get settings()` and the entire write path
(`settingsTable`, bespoke setters, `restoreSettings`, `applyEffect`, `setTier`) to
`store.dispatch` / `selectX(store.getState())`. Delete the zustand store, the
`useSettingsStore` adapter, the 29/29/25 reducer/action/selector files, `createSettingsStore`,
and `buildInitialSettings`. Remove `zustand`. Reorganize the old tests. Behaviour stays
identical; render-wake stays imperative (`requestRender()` in the setters) per the spec —
the saga seam stays empty until phase 2.

**Architecture.** Store *ownership* moves from the engine to `main.tsx`
(`createAppStore(...)` once, wrapped in `<Provider>`); `useEngine` reads the **same** instance
via `useStore<RootState>()` and threads it into `createEngine`. The engine stops constructing
a store and holds the injected `AppStore` for dispatch + `getState`. `handle.settingsStore` is
removed (React no longer reaches the store through the handle). This dissolves the whole
async-handoff adapter (`useSettingsStore`'s `handleRef` null-window + per-call-site `fallback`
+ hand-rolled `useSyncExternalStore`) — the store exists before first paint under the Provider.

**Tech Stack.** Same as Plan 1; this plan *removes* `zustand`.

> **Depends on Plan 1** (`2026-06-18-settings-store-rtk-migration-1-foundation.md`): the RTK
> store, slice (with the action creators named identically to the old reducers), consolidated
> RootState-scoped selectors, `createAppStore` factory, and typed hooks must all exist and be
> green before any task here runs.

> **For agentic workers.** Execute via `superpowers:subagent-driven-development`. The main
> thread runs `npm`/`git` and reviews; implementers only edit. **This plan's core (Tasks 2–7)
> is one coupled swap that cannot be split into independently-green commits** — see the note
> below. Tick `- [ ]` boxes inline.

---

## Conventions (apply to every task)

Same as Plan 1: TDD bite-sized loops; `type` never `interface`; one type per `@types` file;
one symbol per `src/utils` file; `Vec2`/`Vec3` not tuples; didactic module headers on changed
files (bring touched headers to current state — they currently describe the zustand path);
stage specific paths (never `git add -A`); user's git identity; commit body ends with
`Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`. Keep
`npm run typecheck` + `npm test` green at every commit *except inside the coupled swap*, where
green is restored at the swap's closing commit (Task 7).

**Preserve the spec's decomplection choices.** Reads go through react-redux (`useAppSelector`),
writes stay on the engine handle setters this phase (the transitional read/write split the
spec keeps) — do **not** move writes into components yet. Render-wake stays imperative. The
saga stays empty. No `serializableCheck` exception.

---

## The coupled-swap honesty note

Tasks **2–7** form one atomic change: the engine can't *both* construct a zustand store *and*
receive an injected RTK store, and the write path can't dispatch to a store that isn't injected
yet. Trying to land these as separate green commits would mean maintaining two parallel stores
in sync mid-flight — exactly the mirror-state the migration removes. So this core is **one
larger task broken into ordered sub-steps** (Tasks 2–7), green at its **closing commit** (Task
7), not at each sub-step. This is acknowledged explicitly rather than faked with a silent cap.
The independently-green work lives in Plan 1 (the new store) and in Tasks 8–11 here (deletes +
test reorg + radar), which *are* separately green.

Recommended execution: do Tasks 2–7 on the working tree without committing between them (or as
WIP commits squashed at the end), running `npm run typecheck` after each to keep the blast
radius visible, and land **one** "swap settings store to injected RTK" commit at Task 7 when
the suite is green. Tasks 8–11 then commit independently.

---

## Task list

### Task 1: Thread an injected `store` into `createEngine`'s input (type-only seam)

**Files:** `src/@types/engine/EngineCallbacks.d.ts` (modify),
`src/@types/engine/BootstrapDeps.d.ts` (modify — check current shape),
`tests/@types/` smoke if one asserts the callbacks shape.

Add the injected store to the engine's options bag so the engine can stop constructing its own.

**Contract.** `EngineCallbacks` gains `store: AppStore` (required — the engine has no other
store to fall back to once it stops constructing one). Keep `initialTier?` (the engine still
seeds the *preloaded state* via the caller; but with the store injected, `initialTier` becomes
the value `main.tsx` passes to `buildInitialSettings` when constructing the store — see Task 2.
The engine reads tier from the injected store, so `cb.initialTier` may be dropped from the
engine's responsibilities; keep it only if a non-store consumer still needs it — verify and
remove if dead). `BootstrapDeps` carries `store` if any bootstrap phase needs it (the setters
read it from the closure, so likely not — verify).

- [ ] Add a type-level test (or extend an existing `EngineCallbacks` smoke) asserting `store`
  is a required `AppStore` member. Run typecheck — current `createEngine` (still constructing
  its own store) doesn't supply it, so this is the first red.
- [ ] Add `store: AppStore` to `EngineCallbacks`. Do **not** yet change `engine.ts` (next
  tasks) — typecheck will be red until Task 2 wires it; that's expected inside the coupled swap.
- [ ] (No standalone commit — part of the coupled swap; see the honesty note.)

---

### Task 2: `engine.ts` — accept the injected store, stop constructing one, repoint `get settings()`

**Files:** `src/services/engine/engine.ts` (modify).

**Contract.**
- Replace the `createSettingsStore(buildInitialSettings(...))` construction
  (`engine.ts:218-220`) — the engine holds `const store = cb.store;` (the injected `AppStore`).
- `get settings()` (`engine.ts:228-230`) → `return store.getState().settings;` (RootState-scoped
  — the slice lives at the `settings` route). Every `state.settings.X` read across the frame
  pipeline stays byte-identical.
- Remove the `import { createSettingsStore }` + `import { buildInitialSettings }`
  (`engine.ts:79-80`) and the `import type { SettingsStore }`-style usages — replace internal
  `settingsStore` references with `store` (the injected `AppStore`). The `boringSetters`
  builder (`engine.ts:493-496`) now takes `store`.

- [ ] Update the engine-level test/fixtures that call `createEngine` to pass `store:
  createAppStore(...)` (the test harness constructs a throwaway store per the factory — that's
  why it's a factory). Confirm the previously-red typecheck from Task 1 now resolves at this seam.
- [ ] Apply the engine edits. Rewrite the `// ── Settings ──` block comment
  (`engine.ts:203-220`) to describe the injected RTK store (was: engine-owned zustand) — the
  store is created at the app root and injected; `state.settings` delegates to
  `store.getState().settings`.
- [ ] (Coupled-swap — no standalone commit.)

---

### Task 3: Repoint the boring write path — `settingsTable.ts` dispatches slice actions

**Files:** `src/services/engine/wiring/settingsTable.ts` (modify),
`tests/services/engine/wiring/settingsTable.test.ts` (modify — check exact path).

**Contract.** Each row's `action` references a **slice action creator** (imported from
`src/state/settings/settingsSlice`) instead of the deleted `set*Action` zustand wrappers. The
builder dispatches and wakes:
```ts
// before: action(store, value as never); requestRender();
// after:  store.dispatch(action(value as never)); requestRender();
```
- `SettingsAction` becomes the action-creator type (a function `value → PayloadAction<…>`),
  not `(store, value) => void`. `store` parameter on `buildSettersFromTable` becomes `AppStore`.
- The table rows map `SettingsTableKey` → slice action creator: `setPointSize →
  setGalaxyCatalogSize`, `setBrightness → setBrightness`, `setAutoRotate → setAutoRotate`,
  `setGalaxyTexturesEnabled → setThumbnailsEnabled`, `setFilamentIntensity →
  setFilamentIntensity`, `setHighlightFallback → setHighlightFallback`, `setRealOnlyMode →
  setRealOnly`, `setDepthFadeEnabled → setDepthFade`, `setAbsMagLimit → setAbsMagLimit`,
  `setExposure → setExposure`, `setToneMapCurve → setToneMapCurve`, `setShowPickBuffer →
  setShowPickBuffer`, `setShowDiskRadiusRing → setShowDiskRadiusRing`. (Same 13 rows as
  today — see `settingsTable.ts:100-194`.)

- [ ] Update the settingsTable test: build setters with a throwaway `createAppStore()` store
  and a `requestRender` spy; call `setters.setBrightness(0.5)`; assert
  `store.getState().settings.galaxyCatalogs.brightness === 0.5` **and** `requestRender` was
  called once. (Port the existing "every setter wakes the scheduler" assertion to the dispatch
  shape.) Run — red until impl.
- [ ] Apply the edits. Update the module header to describe `store.dispatch(action(value))`
  (was: `action(store, value)` zustand wrapper); the "every setter wakes" audit point is
  unchanged.
- [ ] (Coupled-swap — no standalone commit.)

---

### Task 4: Repoint the bespoke setters + `setTier` to dispatch / `getState`

**Files:** the bespoke handle setters under `src/services/engine/handles/`:
`setGalaxyCatalogLabelEnabled.ts`, `setSourceVisible.ts`, `setBiasMode.ts`,
`setMilkyWayEnabled.ts`, `setMilkyWayLabelEnabled.ts`, `setFilamentsEnabled.ts`, `setFlow.ts`,
`setStructureItemEnabled.ts`, `setStructureLabelEnabled.ts`, `setVolumesEnabled.ts`,
`addVolumeField.ts`, `removeVolumeField.ts`, `setVolumeFieldEnabled.ts`,
`setVolumeFieldIntensity.ts`, `setVolumeFieldContrast.ts`, `setVolumeFieldDensityScale.ts`,
`setVolumeFieldTrim.ts`, `setVolumeFieldExposure.ts`, `setVolumeFieldPalette.ts`,
`setPassDisabled.ts`, and `setTier.ts`. Plus their tests under
`tests/services/engine/handles/`.

**Contract.** Each bespoke setter's `store: SettingsStore` (zustand) param becomes
`store: AppStore`. Its store write changes from `set*Action(store, …)` (zustand) to
`store.dispatch(<sliceAction>(…))`, then its existing side effects (fade bridge, async bake,
slot reloads) run unchanged. Reads change from `selectX(store.getState())` over
`EngineSettingsState` to over `RootState` (the selectors are RootState-scoped after Plan 1, so
this is the same call). Examples:
- `setFilamentsEnabled` (`handles/setFilamentsEnabled.ts`): `store.dispatch(setFilamentsEnabled(enabled));
  requestRender(); syncVisibilityFades(...)` — note the slice action creator and the handle
  function share the name `setFilamentsEnabled`; import the action creator under an alias
  (e.g. `setFilamentsEnabledAction` is gone — import `{ setFilamentsEnabled as filamentsEnabledAction }`
  from the slice) to avoid the name clash, **or** rename the handle function — implementer's
  call, but keep it unambiguous. Document whichever choice in the header.
- `setStructureItemEnabled` (`handles/`): `store.dispatch(setStructureItemEnabled({ id:
  category, enabled }))` (payload-object shape from Plan 1 Task 6).
- `setTier` (`handles/setTier.ts:28-39`): `const prevTier = selectTier(store.getState());`
  (RootState now) and `store.dispatch(setTier(tier));` (slice action). The rest of `setTier`
  (per-source slot reloads, MCPM, hi-res rebuild) is untouched. The `import { setTierAction }`
  + `import { selectTier }` paths change to the slice + new selectors module.
- `setFlow` (`handles/setFlow.ts`): dispatch `setFlow(patch)` then run the per-leaf
  demand/fade/reseed side effects keyed off `Object.keys(patch)` — unchanged logic.

- [ ] For each bespoke setter with an existing test, update it to construct a throwaway
  `createAppStore()` store, drive the setter, and assert both the dispatched state change
  (`store.getState().settings.X`) and the side effect (fade spy / slot `.load` spy /
  `requestRender` spy) — porting the existing assertions to the dispatch shape. Run red.
- [ ] Apply the setter edits. Update each touched header to current state (dispatch, not
  zustand `setState`); keep the load-bearing ORDERING comments (store write **before** the
  fade bridge — `setFilamentsEnabled.ts:10-12`).
- [ ] (Coupled-swap — no standalone commit.)

---

### Task 5: Repoint `restoreSettings` + `applyEffect` to `dispatch(mergeSnapshot(...))`

**Files:** `src/services/engine/wiring/restoreSettings.ts`,
`src/services/engine/wiring/applyEffect.ts`, plus their tests under
`tests/services/engine/wiring/`.

**Contract.** Both currently do `store.setState((s) => mergeSettingsSnapshot(s, patch))`
(`restoreSettings.ts:41`, `applyEffect.ts:39`). Replace with
`store.dispatch(mergeSnapshot(snapshot))` / `store.dispatch(mergeSnapshot(patch))` (the slice's
`mergeSnapshot` action creator from Plan 1 Task 6, which runs the kept `mergeSettingsSnapshot`
free function as a returning case reducer). The `store: SettingsStore` param → `AppStore`. The
subsequent `syncVisibilityFades` bridge call is unchanged — it reads the just-dispatched intent
through `state.settings` (now `store.getState().settings`). The `applyEffect` cluster→fade-keys
derivation off `FADE_LAYERS` `cluster` field is unchanged.

- [ ] Update both tests: construct a throwaway store, dispatch via the setter, assert the
  merged state landed (`store.getState().settings`) and the fade bridge ran (spy on
  `syncVisibilityFades` or its observable effect). Port the existing capture→restore and
  partial-patch assertions. Run red.
- [ ] Apply the edits. Update both headers: the one `store.dispatch(mergeSnapshot(...))` swap
  notifies React's `useAppSelector` subscribers (was: `store.setState` notified
  `useSyncExternalStore`); the rest of the round-trip rationale stands.
- [ ] (Coupled-swap — no standalone commit.)

---

### Task 6: `EngineHandle` — drop `settingsStore`

**Files:** `src/@types/engine/EngineHandle.d.ts` (modify),
`src/services/engine/engine.ts` (modify — remove the two `settingsStore` handle entries at
`engine.ts:495` and `:817`), plus any test asserting `handle.settingsStore`.

**Contract.** Remove the `settingsStore: StoreApi<EngineSettingsState>` field
(`EngineHandle.d.ts:60-72`) and its `import type { StoreApi } from 'zustand/vanilla'`
(`EngineHandle.d.ts:19`). React no longer reads through the handle — it reads the Provider
store. The handle keeps its sub-handle setters (the write path) unchanged.

- [ ] Update/remove the test that asserts `handle.settingsStore` is wired (it becomes a test
  that the handle has **no** `settingsStore` field, or is simply deleted if it only checked
  presence). Run red against the current handle.
- [ ] Remove the field + import from `EngineHandle.d.ts`; remove the two handle-literal entries
  in `engine.ts`. Update the `EngineHandle` header note that mentioned the settings store seam.
- [ ] (Coupled-swap — no standalone commit.)

---

### Task 7: `main.tsx` `<Provider>` + `useEngine` `useStore()` → `createEngine({ store })` (closes the swap)

**Files:** `src/main.tsx` (modify), `src/hooks/useEngine.ts` (modify),
`src/@types/engine/UseEngineInput.d.ts` (verify — `useEngine` now reads the store via
`useStore`, not a prop; likely no change), plus `tests/hooks/useEngine`-adjacent tests if any.

**Contract.**
- `main.tsx`: construct the store once and wrap the app:
  ```ts
  const store = createAppStore({ [settingsRoute]: buildInitialSettings({ initialTier: resolveInitialTier() }) });
  createRoot(root).render(<Provider store={store}><App /></Provider>);
  ```
  `resolveInitialTier()` is the same viewport-derived seed `useEngine` computes today
  (`initialTierFromViewport(window.innerWidth)` — `useEngine.ts:100-103`). Decide the single
  home for that derivation: move it to `main.tsx` (the store-construction site) and have
  `useEngine` read `selectTier(store.getState())` for the live tier (it already exposes only
  the immutable `initialTier` seed). Keep the WebGPU support gate (`main.tsx:49-55`) — the
  `<Provider>` wraps only the `createRoot(...).render` branch.
- `useEngine.ts`: `const store = useStore<RootState>();` (from react-redux) and pass it into
  `createEngine(canvas, { store, initialTier, ... })`. The hook no longer needs to compute
  `initialTier` for the engine if `main.tsx` seeds the store — verify and remove the dead
  `useMemo<Tier>` (`useEngine.ts:100-103`) + the `initialTier` return field **if** nothing
  downstream still reads it (grep `initialTier` consumers first; `UseEngineReturn` may expose
  it — keep only if a live consumer remains, else delete to avoid a dead surface).
- Update the hook header (`useEngine.ts:28-34`) — settings reads are now react-redux
  `useAppSelector`, the store comes from `useStore`, not `useSettingsStore`.

- [ ] Add a `<Provider>` integration render test: render `<Provider store={createAppStore()}>`
  around a probe that reads `useAppSelector(selectBrightness)`, assert it returns the default;
  dispatch `setBrightness(0.3)` on the store, assert the probe re-renders with `0.3`. (This is
  the React-read coverage that replaces the deleted `useSettingsStore.test.ts` — see Task 10.)
- [ ] Apply `main.tsx` + `useEngine.ts` edits.
- [ ] `npm run typecheck` + `npm test` → **green** (this closes the coupled swap).
- [ ] **Commit the whole coupled swap as one commit** (Tasks 1–7): EngineCallbacks `store`,
  `engine.ts` injection + `get settings()` + handle entries, `settingsTable`, all bespoke
  setters + `setTier`, `restoreSettings`/`applyEffect`, `EngineHandle` drop, `main.tsx`
  Provider, `useEngine` `useStore`. Stage these paths explicitly. Message:
  `refactor(engine): inject the RTK store at the app root and dispatch the settings write path`.

---

### Task 8: Migrate every `useSettingsStore` consumer → `useAppSelector`; delete the adapter

**Files (consumers):** `src/components/App/App.tsx`,
`src/components/DebugPanel/DataQualitySection.tsx` (verify — it receives props from App, may not
call the hook directly). **Delete:** `src/hooks/useSettingsStore.ts` and
`tests/hooks/useSettingsStore.test.ts`.

**Contract.** App.tsx reads ~20 settings values via `useSettingsStore(handleRef, selectX,
DEFAULT)` (`App.tsx:153-...`). Each becomes `useAppSelector(selectX)` (import the selector from
the new `src/state/settings/selectors`). The `fallback` third arg **disappears** (the store
exists before first paint under the Provider). The `handleRef` first arg disappears. Remove the
now-dead default constants used only as fallbacks (`DISABLED_PASSES_DEFAULT`,
`VOLUME_FIELD_ITEMS_DEFAULT`, `ALL_VISIBLE_MASK` if only a fallback, etc. — grep each;
keep any still used elsewhere). Update the selector import paths from
`services/engine/settingsStore/selectors/selectX` to `state/settings/selectors`.

- [ ] Update App's settings-read tests (if any) to render under `<Provider>`; assert a value
  reads through `useAppSelector`. (If App has no direct settings-value test, the Task 7
  Provider render test is the coverage.)
- [ ] Replace every `useSettingsStore(...)` call in App.tsx (and any other consumer found via
  `grep -rln useSettingsStore src/components src/hooks`) with `useAppSelector(selectX)`; drop
  the fallback constants; fix imports.
- [ ] Delete `src/hooks/useSettingsStore.ts` + its test.
- [ ] `npm run typecheck` + `npm test` → green. Commit App + the deletion together.

---

### Task 9: Delete the old zustand store, reducers, actions, selectors, builder; remove `zustand`

**Files (delete):**
- `src/services/engine/settingsStore/createSettingsStore.ts`
- `src/services/engine/settingsStore/buildInitialSettings.ts`
- all 29 `src/services/engine/settingsStore/reducers/*.ts` (including the now-relocated
  `mergeSettingsSnapshot.ts` — Plan 1 moved it to `src/state/settings/`)
- all 28 `src/services/engine/settingsStore/actions/*.ts`
- all 25 `src/services/engine/settingsStore/selectors/*.ts`
- the three `project*` helpers under `settingsStore/` (Plan 1 relocated them to
  `src/state/settings/`)
- the entire empty `src/services/engine/settingsStore/` directory once drained
**Files (package):** `package.json` — remove `zustand`.

By this point (after Tasks 3–8) nothing imports these. This is a pure deletion that lands green.

- [ ] `grep -rn "settingsStore/" src/ tests/` — confirm **zero** remaining imports of the old
  directory (every consumer now points at `src/state/settings/` or `src/store/`). If any
  remain, fix them first (they should have been caught by Tasks 3–8's typecheck).
- [ ] Delete the files/directory. Run `npm run typecheck` — clean (proves nothing depended on
  them).
- [ ] Remove `zustand` from `package.json`; `npm install` to update the lockfile. Run
  `npm run typecheck` + `npm test`. `grep -rn "zustand" src/ tests/` is empty.
- [ ] Commit the deletions + `package.json`/lockfile.

---

### Task 10: Reorganize the old settings-store tests

**Files:** the old `tests/services/engine/settingsStore/**` tree (delete the obsolete ones —
their assertions were ported in Plan 1 Tasks 6 + 9); ensure the new homes exist:
`tests/state/settings/settingsSlice.test.ts`, `tests/state/settings/selectors.test.ts`,
`tests/store/createAppStore.test.ts` (all authored in Plan 1).

Plan 1 already authored the slice/selector/store tests. This task removes the **now-redundant**
old reducer (28) + action (27) + selector (24) + `createSettingsStore` + `buildInitialSettings`
+ `project*` + `makeSettingsFixture`/`setMilkyWayLabelEnabled` tests, and confirms coverage
didn't regress.

- [ ] Confirm each old test's assertions have a counterpart in the new `settingsSlice.test.ts`
  / `selectors.test.ts` / `createAppStore.test.ts` (Plan 1). For any uncovered assertion
  (e.g. a specific edge case in an action test), port it into the matching new file **before**
  deleting the old one — do not lose coverage.
- [ ] Delete the obsolete old test files + the now-orphaned `makeSettingsFixture.ts` (or
  relocate it to `tests/state/settings/` if the new tests reuse it — implementer's call;
  prefer relocate if reused).
- [ ] Add the round-trip test the spec calls for (if not already in Plan 1's
  `createAppStore.test.ts`): a settingsTable dispatch + `requestRender`, then a
  capture→restore→apply-effect round-trip via `restoreSettings`/`applyEffect` over a real
  `createAppStore()` store, asserting the snapshot restores and a partial effect patches only
  its clusters. Place it under `tests/state/settings/` or `tests/services/engine/wiring/`.
- [ ] `npm test` → green; no orphaned `tests/services/engine/settingsStore/**` remain. Commit.

---

### Task 11: Entanglement-radar diff review + manual smoke

**Files:** none (review); fixes are follow-up commits.

- [ ] Run the `entanglement-radar` skill over the **whole** Plan-2 diff. Check: store has a
  single home (`main.tsx` Provider) with no surviving mirror; `state.settings` is a pure read
  through `store.getState().settings` (no cached copy in the engine); the read path
  (`useAppSelector`) and write path (handle → `dispatch`) are the spec's intended transitional
  split, not an accidental second write seam; no `useSettingsStore` / `settingsStore` /
  `zustand` / `createSettingsStore` / `buildInitialSettings` references survive
  (`grep -rn` each across `src/` + `tests/` → empty); no per-type branch / enumerated table-key
  smell introduced. "No significant complecting found" is a valid result. Record/fix any knot.
- [ ] **Manual smoke** (ask the user to look — dev server stays running; don't kill it):
  - SettingsPanel toggles drive the renderer (point size, brightness, exposure, source
    visibility checkboxes, auto-rotate) and the panel reflects the value.
  - DebugPanel renderer-toggle checkboxes hide/show passes (the `disabledPasses` `Record`
    path) and the checkboxes reflect the toggled state.
  - Tour capture → play → restore drives the renderer and the SettingsPanel updates on restore
    (the `mergeSnapshot` dispatch wakes `useAppSelector` subscribers).
- [ ] Commit any radar fixes.

---

## Definition of Done (Plan 2 — the `/feature-done` gate)

- [x] `npm test` — full suite green. (2678 passing; ~166 redundant old-store tests removed.)
- [x] `npm run typecheck` — both tsconfigs clean.
- [x] No `TODO` / placeholder in any changed file.
- [x] `grep -rn "useSettingsStore" src/ tests/` → **empty** (adapter + all call sites gone).
- [x] `grep -rn "zustand" src/ tests/ package.json` → **empty** (dependency removed).
- [x] `grep -rn "settingsStore/" src/ tests/` → **empty** (old reducer/action/selector
  directory deleted; `createSettingsStore` + `buildInitialSettings` gone).
- [x] `grep -rn "settingsStore" src/@types/engine/EngineHandle.d.ts` → **empty**
  (`handle.settingsStore` removed).
- [x] `main.tsx` wraps `<Provider store={createAppStore(...)}>`; `useEngine` reads the store
  via `useStore` and passes it into `createEngine`.
- [x] The engine no longer constructs a store; `get settings()` returns
  `store.getState().settings`.
- [ ] Manual smoke passes: settings toggles, debug pass toggles, tour capture/restore. ← awaiting user

### Entanglement-radar verdict (Task 11)

One real knot found + fixed (commit `2be6509e`): `useEngine` re-derived the boot tier and
exposed `UseEngineReturn.initialTier` with no remaining reader — a dead value×place surface.
Removed. Otherwise CLEAN: single store home (`main.tsx` `<Provider>`), `state.settings` a pure
delegating read with no engine-side mirror, writes funnel through the one handle→`dispatch`
seam (no component dispatches directly yet — that's phase 2), and `settingsTable` stayed a
registry (no new discriminant branch introduced by the dispatch repoint).

Landed as 3 commits: `af41db21` (inject + dispatch write path), `43099473` (delete old store +
drop zustand), `2be6509e` (radar fix).

---

**Phase 2 (backlog, not this plan):** move effects onto the saga seam (render-wake,
fade-triggering, `requestTier` re-anchor, demand-loads); promote `tier` to the root; add the
`selection` / `dataStatus` slices (the intent folds). See the spec's "Non-goals" + ADR 0007.
