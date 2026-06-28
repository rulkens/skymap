# Engine State Into Store Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the five engine-driven React `useState` slices in `useEngine` (`status`, `sourceCounts`, `structureCounts`, `loadProgress`, `scale`) into a new Redux `engine` root slice — read via selectors, written by engine `store.dispatch` — and delete the now-dead `lifecycle`/`camera`/`sources` callback clusters.

**Architecture:** A new `engine` root slice mirrors the migration the codebase already did for selection / camera-pose / `catalogLoaded`: the engine dispatches straight to the store via `cb.store.dispatch` (and `deps.cb.store.dispatch` at the frame site), and React reads through `RootState`-scoped selectors instead of a `useEngine` return bag. `scale` flips from a React-side derivation off `onCameraChange` snapshots to an in-engine computation at the frame site (the engine already owns the canvas + `computeScaleInfo`), dispatched with a dedup-on-write reducer so the per-frame autorotate dispatch never re-renders the HUD. The migration is parallel-write → migrate-readers → remove-old-writer, so every task ends green and behaviour-correct.

**Tech Stack:** TypeScript, Redux Toolkit (inline-Immer slices), redux-saga, React, Vitest.

## Global Constraints

- Tests stay green after every task (590+ suite): `npm test` AND `npm run typecheck` must pass before each commit.
- One type per file in `src/@types/` (`EngineState.d.ts` holds exactly the `EngineState` type); one read-surface `selectors.ts` per slice — the ui/tier exception to the one-function-per-file rule (`src/state/ui/selectors.ts:5` documents it).
- Selectors are framework-agnostic `(state: RootState) => …`. No `react-redux` import in `src/state/` or `src/services/` — only `src/store/hooks.ts`, components, and hooks may reach `react-redux` (`src/store/hooks.ts:11`).
- Commit messages use the user's git identity, `Co-Authored-By` trailer only (no `--author`). Branch + PR — never push to `main`.
- **The feature branch already carries the uncommitted `extraCallbacks` removal from `src/hooks/useEngine.ts` + the deletion of `src/@types/engine/UseEngineInput.d.ts`. That is the FIRST commit on the branch, before Task 1** — commit it as-is (typecheck/tests already pass against it) so Task 1 starts from a clean tree.

---

## Task 0 — commit the pre-existing `extraCallbacks` removal

The working tree already has the `extraCallbacks` removal (`src/hooks/useEngine.ts` modified, `src/@types/engine/UseEngineInput.d.ts` deleted). This is groundwork that predates the slice work — land it as the branch's first commit so later tasks diff cleanly against it.

- [ ] Create the feature branch off `main`.
- [ ] `npm test` + `npm run typecheck` → confirm green with the existing change in place.
- [ ] Commit `src/hooks/useEngine.ts` + the `UseEngineInput.d.ts` deletion (stage those two paths specifically — never `git add -A`).

---

## Task 1 — engine slice + state type + store wiring

Create the `engine` root slice, its state type, the `engineRoute` constant, and wire it into `rootReducer`. This is a pure additive store edit — no reader or writer touches it yet, so the suite stays green on the strength of the new unit tests alone.

**Files**
- Create: `src/@types/store/EngineState.d.ts`
- Create: `src/state/engine/engineSlice.ts`
- Modify: `src/store/constants.ts` (add `engineRoute`), `src/store/rootReducer.ts` (mount it)
- Test: `tests/state/engine/engineSlice.test.ts`

**Interfaces**

Produces — the `EngineState` type (mirror the one-type-per-file shape of `src/@types/ui/UiState.d.ts`):

```ts
export type EngineState = {
  status: EngineStatus;
  scale: ScaleInfo;
  sourceCounts: Partial<Record<SourceType, number>>;
  structureCounts: Partial<Record<StructureId, number>>;
  loadProgress: LoadProgressState | null;
};
```

Imports for that type: `EngineStatus` from `../engine/EngineStatus`, `ScaleInfo` from `../engine/ScaleInfo`, `SourceType` from `../data/SourceType`, `StructureId` from `../data/structure/StructureId`, `LoadProgressState` from `../loading/LoadProgressState`.

Produces — the slice (`createSlice({ name: 'engine', initialState, reducers })`, inline-Immer style per `src/state/ui/uiSlice.ts`). `initialState`:
- `status: { kind: 'initializing' }`
- `scale: { label: '…', widthPx: 100 }` (the existing `INITIAL_SCALE` value from `src/hooks/useEngine.ts:69`)
- `sourceCounts: {}`
- `structureCounts: {}`
- `loadProgress: null`

Reducers + action names (exported action creators must be spelled exactly as below — these names are consumed verbatim in Tasks 3 and 5):

| Action creator | Payload | Behaviour |
| --- | --- | --- |
| `engineStatusChanged` | `EngineStatus` | `state.status = action.payload` |
| `engineSourceCountReported` | `{ source: SourceType; count: number }` | `state.sourceCounts[action.payload.source] = action.payload.count` (accumulate-in-reducer; mirrors today's `setSourceCounts((p)=>({...p,[source]:count}))` at `src/hooks/useEngine.ts:113`) |
| `engineStructureCountsChanged` | `Partial<Record<StructureId, number>>` | `state.structureCounts = action.payload` (whole-map replace) |
| `engineLoadProgressChanged` | `LoadProgressState \| null` | `state.loadProgress = action.payload` |
| `engineScaleChanged` | `ScaleInfo` | **DEDUP-ON-WRITE**: only assign when `state.scale.label !== payload.label \|\| state.scale.widthPx !== payload.widthPx` |

The `engineScaleChanged` no-op-when-equal behaviour is **load-bearing**: it is what keeps the per-frame scale dispatch (Task 3) from re-rendering the HUD every autorotate frame. When the guard skips the assignment, Immer returns the same slice reference, so `useSelector(selectScale)` does not re-fire. Model the guard on `setIfChanged` in `src/state/selection/selectionSlice.ts:20-24` (skip-the-mutation-when-unchanged), specialised here to the two `ScaleInfo` scalar fields.

**Steps**
- [ ] Add the `EngineState` test failing-first by writing `tests/state/engine/engineSlice.test.ts` against the not-yet-existing slice. Follow the reducer-unit style of `tests/state/ui/uiSlice.test.ts` (`reducer(state, actionCreator(payload))`, a `base()` factory returning a fresh `EngineState`). Tests + key assertions:
  - `engineStatusChanged writes status` — `reducer(base(), engineStatusChanged({ kind: 'loading' })).status` deep-equals `{ kind: 'loading' }`.
  - `engineSourceCountReported writes the reported source count` — after one report of `{ source: Source.SDSS, count: 5 }`, `sourceCounts[Source.SDSS] === 5`.
  - `engineSourceCountReported merges a second source without dropping the first` — report SDSS then 2MRS; assert BOTH keys present with their counts.
  - `engineStructureCountsChanged replaces the whole map` — assert the payload map is the new `structureCounts`.
  - `engineLoadProgressChanged writes loadProgress` — assert a non-null payload lands, and that `null` clears it.
  - `engineScaleChanged returns the same state reference when label and widthPx are unchanged` — seed `scale`, dispatch `engineScaleChanged` with an equal-valued (but freshly-allocated) `ScaleInfo`; assert `reducer(s, engineScaleChanged(equalValue)) === s`.
  - `engineScaleChanged replaces scale when widthPx differs` — companion asserting the new value IS written when `widthPx` changes (and likewise label-only changes are written).
- [ ] Run the test → confirm it fails (slice + type don't exist).
- [ ] Add `engineRoute = 'engine' as const` to `src/store/constants.ts` (one line, matching the existing route docstring style there).
- [ ] Create `src/@types/store/EngineState.d.ts` and `src/state/engine/engineSlice.ts`.
- [ ] Mount the slice in `src/store/rootReducer.ts` (`[engineRoute]: engineReducer`) — `RootState` derives the new `engine` slot automatically.
- [ ] Run the test → confirm all pass. `npm run typecheck`.
- [ ] Commit.

---

## Task 2 — selectors

Add the `engine` slice's read seam: a private `selectEngine` base + the five leaf selectors, all `RootState`-scoped.

**Files**
- Create: `src/state/engine/selectors.ts`
- Test: `tests/state/engine/selectors.test.ts`

**Interfaces**

Produces (mirror the base+leaf shape of `src/state/ui/selectors.ts` and `src/state/tier/selectors.ts`):
- `selectEngine` — private base, `(state: RootState): EngineState => state[engineRoute]` (not exported, mirroring `selectUi` at `src/state/ui/selectors.ts:28`).
- `selectEngineStatus = (state: RootState): EngineStatus => selectEngine(state).status`
- `selectScale = (state: RootState): ScaleInfo => selectEngine(state).scale`
- `selectSourceCounts = (state: RootState): Partial<Record<SourceType, number>> => selectEngine(state).sourceCounts`
- `selectStructureCounts = (state: RootState): Partial<Record<StructureId, number>> => selectEngine(state).structureCounts`
- `selectLoadProgress = (state: RootState): LoadProgressState | null => selectEngine(state).loadProgress`

Plain composed arrows (no `createSelector`) — these are primitive / object-reference reads and `useSelector`'s reference-equality already bails on identical values, exactly the rationale documented at `src/state/ui/selectors.ts:14-18`.

**Steps**
- [ ] Write `tests/state/engine/selectors.test.ts` failing-first. Seed a store (`createAppStore`, then dispatch the Task-1 actions to populate the slice) OR construct a `RootState`-shaped object and call the selectors directly — match whichever the existing `tests/state/.../selectors.test.ts` files do. Tests: one per leaf asserting it reads the right field after a known write (e.g. dispatch `engineStatusChanged({ kind: 'loading' })`, assert `selectEngineStatus(store.getState())` deep-equals it).
- [ ] Run → fail (module absent).
- [ ] Create `src/state/engine/selectors.ts`.
- [ ] Run → pass. `npm run typecheck`. Commit.

---

## Task 3 — engine writes to the store (PARALLEL WRITE, callbacks still fire)

Add a `store.dispatch(...)` of the matching action at each of the seven engine invocation sites. The existing callback fires too — this is a parallel write, so nothing in the UI changes yet and the suite stays green. For `scale`, the computation moves into the engine at the frame site.

**Files**
- Modify: `src/services/engine/engine.ts` (status — lines ~451 and ~543)
- Modify: `src/services/engine/wiring/createSyntheticFallback.ts` (status — the two `cb.lifecycle?.onStatusChange?.` ready emissions at lines ~96 and ~124)
- Modify: `src/services/engine/phases/wireSlots.ts` (status — `loading` emission at line ~124)
- Modify: `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts` (sourceCounts — line ~219)
- Modify: `src/services/engine/wiring/wireStructureProjection.ts` (structureCounts — `emitCounts` at line ~51)
- Modify: `src/services/engine/wiring/installLoadProgress.ts` (loadProgress — line ~61)
- Modify: `src/services/engine/frame/runFrame.ts` (scale — line ~242)
- Test: extend/add under `tests/services/engine/...` (see below)

**Interfaces**

Consumes (from Task 1): `engineStatusChanged`, `engineSourceCountReported`, `engineStructureCountsChanged`, `engineLoadProgressChanged`, `engineScaleChanged` (from `src/state/engine/engineSlice.ts`).

Store access at each site:
- In `engine.ts` the store is `cb.store` (already used at `src/services/engine/engine.ts:208`, `:339`).
- In the wiring functions (`createSyntheticFallback`, `wireStructureProjection`, `installLoadProgress`, `galaxyCatalogSourceRegistry`) the store is `cb.store` — the same handle `dispatchCatalogLoaded(cb.store, source)` already uses at `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts:188`. `installLoadProgress` reaches it via `deps.cb.store` (it destructures `{ cb, allSlots } = deps` at `src/services/engine/wiring/installLoadProgress.ts:35`).
- In `runFrame.ts` the store is `deps.cb.store` — already dispatching there (`deps.cb.store.dispatch(commitCameraPose(...))` at `src/services/engine/frame/runFrame.ts:213`).

Per-site dispatch (add ALONGSIDE the existing callback — do not remove the callback in this task):

| Site | Existing callback | Add dispatch |
| --- | --- | --- |
| `engine.ts:451` | `cb.lifecycle?.onStatusChange?.({ kind: 'initializing' })` | `cb.store.dispatch(engineStatusChanged({ kind: 'initializing' }))` |
| `engine.ts:543` | `cb.lifecycle?.onStatusChange?.({ kind: 'error', message })` | `cb.store.dispatch(engineStatusChanged({ kind: 'error', message }))` |
| `createSyntheticFallback.ts` ×2 | `cb.lifecycle?.onStatusChange?.({ kind: 'ready', count, source })` | `cb.store.dispatch(engineStatusChanged({ kind: 'ready', count, source }))` — at both ready-emission sites |
| `wireSlots.ts:124` | `cb.lifecycle?.onStatusChange?.({ kind: 'loading' })` | `cb.store.dispatch(engineStatusChanged({ kind: 'loading' }))` |
| `galaxyCatalogSourceRegistry.ts:219` | `cb.sources?.onCatalogReady?.(source, s.value.count)` | `cb.store.dispatch(engineSourceCountReported({ source, count: s.value.count }))` |
| `wireStructureProjection.ts:51` (`emitCounts`) | `cb.sources?.onStructureCountsChange?.(counts)` | `cb.store.dispatch(engineStructureCountsChanged(counts))` — hoist the existing four-category object literal (`{ cluster: …, supercluster: …, void: …, group: … }`, `:51-56`, `void:` is an explicit key not a shorthand) into a `const counts` and pass it to both |
| `installLoadProgress.ts:61` | `cb.sources?.onLoadProgress?.(snapshot)` | `deps.cb.store.dispatch(engineLoadProgressChanged(snapshot))` |

**Scale — compute in-engine at the frame site (`runFrame.ts`):**

The existing `runFrame.ts:237-243` block builds a per-frame `snap = { distance, fovYRad }` and calls `deps.cb.camera?.onCameraChange?.(snap)` (LEAVE that call in place this task — parallel write). Add, inside the same `if (state.cam)` guard:
- Move the `SCALE_TARGET_PX = 150` constant out of `src/hooks/useEngine.ts:77` and into the engine. Place it as a module-level const in `runFrame.ts` (or a small engine-side constants neighbour) — wherever the existing per-frame engine constants live; the value and meaning are unchanged (see the `targetPx` math in `src/services/engine/helpers/scaleBar.ts:96-105`).
- Read viewport CSS dimensions from the live engine canvas: `deps.canvas.clientWidth` / `deps.canvas.clientHeight` (the same CSS-pixel inputs the React side read off `canvasRef.current` — `computeScaleInfo` requires CSS px, NOT the backing-store `deps.canvas.width/height`; see `src/services/engine/helpers/scaleBar.ts:43-50`).
- Call `computeScaleInfo({ cam: snap, canvasSize: { width: canvas.clientWidth, height: canvas.clientHeight }, targetPx: SCALE_TARGET_PX })` (already imported from `src/services/engine/helpers/scaleBar.ts`).
- When it returns non-`null`, `deps.cb.store.dispatch(engineScaleChanged(info))`. (The `null` return — degenerate viewport / camera — skips the dispatch, exactly as the React side skipped `setScale`.) The reducer's dedup-on-write (Task 1) absorbs the unchanged-frame case, so this fires unconditionally every ready frame at no re-render cost.

**Steps**
- [ ] Extend the engine wiring tests (`tests/services/engine/wiring/...`) to assert the new dispatches, following the spy-on-store-dispatch model of `tests/services/engine/wiring/catalogLoadedDispatch.test.ts` (`vi.spyOn(store, 'dispatch')`, assert `toHaveBeenCalledWith(<action>(<payload>))`). Cover at minimum:
  - `galaxyCatalogSourceRegistry` dispatches `engineSourceCountReported({ source, count })` on a slot `ready`.
  - `wireStructureProjection` dispatches `engineStructureCountsChanged` with the four category counts on group change.
  - `installLoadProgress` dispatches `engineLoadProgressChanged(snapshot)` from the emitter.
  - status: a test asserting the `loading` / `ready` / `error` / `initializing` dispatches at the sites that have a testable seam (extend `createSyntheticFallback.test.ts` for the ready emissions if that test already drives slots; otherwise assert at the lowest-friction site).
  - scale: a frame test asserting `engineScaleChanged` is dispatched with the `computeScaleInfo` result on a ready frame, and NOT dispatched (or dispatched-but-deduped) when inputs are degenerate. If `runFrame` already has a frame-test harness, extend it; otherwise assert against a thin call into the scale block.
- [ ] Run the new/extended tests → fail (dispatches absent).
- [ ] Add the seven dispatches per the table; move `SCALE_TARGET_PX` into the engine for the scale site.
- [ ] Run → pass. `npm test` + `npm run typecheck` (full suite — UI is still callback-fed and unchanged). Commit.

---

## Task 4 — migrate consumers to selectors

Switch every React consumer of the five fields from the `useEngine` return / prop-drill to `useAppSelector(selectX)`. `useEngine` still returns the five (Task 5 deletes them) and the engine still dispatches (Task 3), so behaviour is identical — the values now arrive via the store instead of the callback-fed `useState`.

**Files**
- Modify: `src/components/App/App.tsx`
- Modify: `src/hooks/useSplash.ts`
- Modify: `src/hooks/useStructureMemberCount.ts`
- Modify: `src/hooks/useAliasIndex.ts`
- Modify: `src/components/SettingsPanel/SettingsPanel.tsx`
- Test: update the affected component/hook tests to seed the store instead of passing props/inputs.

**Interfaces**

Consumes (from Task 2): `selectEngineStatus`, `selectScale`, `selectSourceCounts`, `selectStructureCounts`, `selectLoadProgress` from `src/state/engine/selectors.ts`, read via `useAppSelector` (`src/store/hooks.ts`).

Per-consumer migration:
- `App.tsx` — stop destructuring `status`, `scale`, `sourceCounts`, `structureCounts`, `loadProgress` from `useEngine()` (`src/components/App/App.tsx:61`); read each via `useAppSelector(selectX)`. Affected JSX/usages: `StatusBar status={status}` (`:197`), `ScaleBar scale={scale}` (`:205`), `LoadingBar progress={loadProgress}` (`:195`) + `Splash loadProgress` (`:262`), `useStructureMemberCount({ sourceCounts })` (`:99`), `useAliasIndex({ sourceCounts })` (`:159`), `useSplash({ status, loadProgress })` (`:154`). **Drop the `sourceCounts` + `structureCounts` props passed to `SettingsPanel`** (`:212-213`).
- `SettingsPanel.tsx` — remove the `sourceCounts` and `structureCounts` props from `SettingsPanelProps` (`:72`, `:77`) and the destructure (`:85-89`); the two section containers it feeds (`GalaxiesSectionContainer sourceCounts=…` at `:97`, `StructuresSectionContainer structureCounts=…` at `:100`) should read the counts via `useAppSelector(selectSourceCounts)` / `useAppSelector(selectStructureCounts)` at the container layer instead of receiving them as props. Push the selector read down into the containers (the Container convention — containers own store reach, `SettingsPanel` stays prop-free for these two). Adjust the container props/signatures accordingly.
- `useSplash.ts` — `status` and `loadProgress` currently arrive via `input` (`src/hooks/useSplash.ts:64`). Replace those two input fields with `useAppSelector(selectEngineStatus)` / `useAppSelector(selectLoadProgress)` reads inside the hook, and drop them from `UseSplashInput`. (`famousMetaReady` / `famousMetaFailed` stay as inputs — they are not engine state.) Update `App.tsx`'s `useSplash({...})` call accordingly.
- `useStructureMemberCount.ts` — `sourceCounts` arrives via `UseStructureMemberCountInput` (`src/hooks/useStructureMemberCount.ts:27`) and is used ONLY as a memo trigger (`:42-45`). Read it via `useAppSelector(selectSourceCounts)` inside the hook and drop it from the input type; keep it in the `useMemo` dep array. Update `App.tsx`'s call.
- `useAliasIndex.ts` — `sourceCounts` arrives via `UseAliasIndexInput` (`src/hooks/useAliasIndex.ts:33`) and gates the lazy load (`:50-52`) + is a memo trigger (`:75`). Read it via `useAppSelector(selectSourceCounts)` inside the hook and drop it from the input type. Update `App.tsx`'s call.

Constraint check: all selector reads land in components/hooks (allowed `react-redux` zone). No selector logic moves into `src/state/` or `src/services/`.

**Steps**
- [ ] Update the affected tests first (they will fail or need reshaping): component/hook tests that previously passed `status` / `loadProgress` / `sourceCounts` / `structureCounts` as props/inputs must now render inside a store `<Provider>` (or the project's test-store helper) seeded with the matching `engine`-slice values via the Task-1 actions. Mirror however the repo's existing store-backed component tests seed state. Assert the same observable behaviour (StatusBar text, ScaleBar width, member-count row, splash readiness, alias-load gating).
- [ ] Run the updated tests → fail (consumers still read props/inputs).
- [ ] Migrate each consumer per the list; push the two count selectors down into the SettingsPanel section containers.
- [ ] Run → pass. `npm test` + `npm run typecheck` (full suite). Behaviour identical. Commit.

---

## Task 5 — remove the dead writer path

Delete the now-unread `useState` slices + setter callbacks from `useEngine`, stop wiring the three event clusters into `createEngine`, collapse the hook and its types, and remove every now-redundant `cb.lifecycle?`/`cb.camera?`/`cb.sources?` site in the engine. The `store` + `setSagaContext` options STAY — they are not callback clusters.

**Files**
- Modify: `src/hooks/useEngine.ts`
- Modify: `src/@types/engine/UseEngineReturn.d.ts`
- Modify: `src/@types/engine/EngineCallbacks.d.ts`
- Modify: `src/services/engine/engine.ts`, `src/services/engine/wiring/createSyntheticFallback.ts`, `src/services/engine/phases/wireSlots.ts`, `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts`, `src/services/engine/wiring/wireStructureProjection.ts`, `src/services/engine/wiring/installLoadProgress.ts`, `src/services/engine/frame/runFrame.ts`
- Modify: `src/@types/engine/ScaleInfo.d.ts` (docblock)
- Test: update/remove any test referencing the removed clusters.

**Interfaces**

Produces — the collapsed surfaces:
- `useEngine` returns exactly `{ canvasRef, handleRef }`.
- `UseEngineReturn` is `{ canvasRef: React.RefObject<HTMLCanvasElement | null>; handleRef: React.RefObject<EngineHandle | null> }` — drop `status`, `scale`, `sourceCounts`, `structureCounts`, `loadProgress` and their now-unused type imports (`src/@types/engine/UseEngineReturn.d.ts:13-22`).
- `EngineCallbacks` keeps only `store` + `setSagaContext` (`src/@types/engine/EngineCallbacks.d.ts:56`, `:71`); delete the `lifecycle`, `camera`, and `sources` members (`:79-139`) and their now-unused type imports (`EngineStatus`, `ScaleInfo`, `SourceType`, `LoadProgressState`, `StructureId`). Update the module docblock — it no longer describes an event surface.

**Steps**
- [ ] Update tests first: remove/adjust any that construct a `createEngine` callback bag with `lifecycle`/`camera`/`sources`, or that assert on `useEngine`'s removed return fields. The engine-side dispatch tests from Task 3 remain the coverage for the behaviour.
- [ ] Run → fail / red where the removed surface is still referenced.
- [ ] `useEngine.ts`: delete the five `useState` slices (`src/hooks/useEngine.ts:99-103`), the `onCatalogReadyImpl` / `onCameraChangeImpl` locals (`:113-134`), the `lifecycle`/`camera`/`sources` blocks in the `createEngine(...)` options (`:152-171`), and the now-unused `INITIAL_SCALE` (`:69`), `SCALE_TARGET_PX` (`:77` — already moved to the engine in Task 3), `computeScaleInfo` import (`:54`) and any now-unused type imports. Return `{ canvasRef, handleRef }`. Refresh the hook's module docblock to drop the engine-driven-state description.
- [ ] `EngineCallbacks.d.ts` + `UseEngineReturn.d.ts`: collapse per the Interfaces block.
- [ ] Engine: delete every now-redundant callback invocation — `cb.lifecycle?.onStatusChange?.` at `engine.ts:451`, `:543`; the two in `createSyntheticFallback.ts`; `wireSlots.ts:124`; `cb.sources?.onCatalogReady?.` at `galaxyCatalogSourceRegistry.ts:219`; `cb.sources?.onStructureCountsChange?.` in `wireStructureProjection.ts`; `cb.sources?.onLoadProgress?.` in `installLoadProgress.ts`; and `deps.cb.camera?.onCameraChange?.(snap)` at `runFrame.ts:242`. Keep the Task-3 `store.dispatch` lines and (at the frame site) the `snap` build + `computeScaleInfo` + `engineScaleChanged` dispatch.
- [ ] `ScaleInfo.d.ts`: update the docblock (`src/@types/engine/ScaleInfo.d.ts:3-13`) — it currently says scale is "Computed React-side … via `cb.onCameraChange`"; it is now engine-computed at the frame site and dispatched via `engineScaleChanged`.
- [ ] Run → pass. `npm test` + `npm run typecheck` (full suite). Commit.

---

## Definition of Done

- The `engine` slice, its `EngineState` type, `engineRoute`, selectors, and unit tests exist and pass.
- The engine dispatches all five fields to the store; no `lifecycle`/`camera`/`sources` callback cluster remains in `EngineCallbacks`, the engine, or `useEngine`.
- `useEngine` returns `{ canvasRef, handleRef }`; `createEngine`'s options reduce to `{ store, setSagaContext }` (plus the canvas arg).
- All five consumers read via `useAppSelector(selectX)`; `SettingsPanel` no longer prop-drills `sourceCounts` / `structureCounts`.
- `scale` is engine-computed at the frame site with `SCALE_TARGET_PX` living in the engine; the dedup-on-write reducer keeps autorotate frames from re-rendering the HUD.
- `npm test` + `npm run typecheck` green; shipped on a feature branch via PR.
