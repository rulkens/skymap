# MCPM Workbench RTK + Saga Refactor Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every piece of business logic out of the workbench's `Viewport.tsx` into RTK slices + redux-saga watchers mirroring the main app's `src/state` / `src/store` architecture, leaving `frame()` a dumb render driver.

**Architecture:** The custom store (`tools/mcpm-workbench/src/state/createStore.ts`) is replaced by an RTK store with saga middleware. Slices keep their exact state shapes; the four one-shot token counters become request actions consumed by sagas. Non-serializable resources (canvas, GpuContext, harness, RenderGraph, preview buffer) never enter the store — they live in a saga-context holder, the same `sagaMiddleware.setContext` pattern as `src/store/createAppStore.ts:60-90`.

**Tech Stack:** `@reduxjs/toolkit` 2.12.0, `redux-saga` 1.5.0, `react-redux` 9.3.0 (all already dependencies), `typed-redux-saga` as in `src/store/rootSaga.ts`.

**Spec:** No standalone spec — the design is the saga overview agreed in-session on 2026-09-01 (mechanism A: real RTK + redux-saga, chosen over custom-store watchers for idiom parity with `src/state`). **Ground preparation: none needed** — this plan *is* ground preparation: a pure refactor un-braiding `Viewport.tsx` before further polyphorm look-port features land on it. Prerequisite commits: the ui/ per-component-folder + helper/constant extraction refactor (in flight on this branch) must be landed first; all paths below are post-restructure.

## Global Constraints

- `react-redux` imports allowed ONLY in `tools/mcpm-workbench/src/store/hooks.ts` (the seam — same rule as `src/store/hooks.ts:15-18`).
- State shapes are unchanged: `ViewSlice`, `SimSlice`, `GridSlice`, `CatalogSlice`, `HistogramSlice` in `tools/mcpm-workbench/@types/` stay the SSoT, minus the deleted token fields (Task 2).
- RTK reducer params are never named `s`/`a` (project feedback rule).
- Typed arrays live in `catalog` state today (`packedOverride`); configure `serializableCheck`/`immutableCheck` ignores the same way `src/store/createAppStore.ts` does — copy its middleware config shape, don't invent one.
- Any file move/rename goes through `npm run move-files -- <from> <to>` (batch: `-- --manifest <moves.json>`, `--dry` first) — never `git mv` + hand-edited imports.
- Suite + typecheck stay green after every task; format touched files with prettier before each commit.

---

### Task 1: RTK slices for the five domains

**Files:**
- Modify: `tools/mcpm-workbench/src/state/slices/{simSlice,viewSlice,gridSlice,catalogSlice,histogramSlice}.ts`
- Modify: their mirrors under `tests/tools/mcpm-workbench/state/slices/`

**Contract:** each module exports one `createSlice` result: `export const viewSlice = createSlice({ name: 'view', initialState: defaultViewSlice, reducers: {...} })` plus `export const { setRaymarchPaletteId, ... } = viewSlice.actions`. Reducer names = the current pure-setter names, payloads = the current setters' non-`prev` arguments (multi-arg setters take an object payload, e.g. `setCameraYawPitch({ yaw, pitch })`). The pure setter functions are deleted; their logic moves into the reducers (immer-style or returning new state — match `src/state/` slice idiom). `defaultAppState.ts` keeps composing the five `initialState`s.

- [ ] Port `viewSlice` + its tests (tests call `viewSlice.reducer(prev, setX(payload))`; keep only assertions that can fail on real logic — clamps, edge semantics — not spread restatements, per `docs/superpowers/conventions/testing.md`).
- [ ] Port the other four slices + tests the same way. `catalogSlice`/`simSlice` keep their token fields for now (Task 2 deletes them) so this task stays purely mechanical.
- [ ] Update every `store.setState((st) => ({...st, x: setY(st.x, ...)}))` call site in `src/ui/**` and `src/input/**` to `store.dispatch(setY(payload))` — grep for `setState` to enumerate. (The custom store still exists this task; give it a `dispatch` shim only if needed to keep the tree compiling, otherwise fold this step into Task 3.)
- [ ] Typecheck + `npx vitest run tests/tools/mcpm-workbench` green; commit.

### Task 2: Token counters → request actions

**Files:**
- Modify: `tools/mcpm-workbench/src/state/slices/simSlice.ts`, `tools/mcpm-workbench/@types/SimSlice.d.ts`
- Modify: `tools/mcpm-workbench/src/ui/ControlsPanel/ControlsPanel.tsx`, `tools/mcpm-workbench/src/ui/Viewport/Viewport.tsx` (token-watcher call sites)

**Contract:** `resetToken`/`clearTraceToken`/`exportToken`/`scfdToken` fields and their `request*` reducers are deleted. In their place, four plain actions created with `createAction` in `tools/mcpm-workbench/src/state/commands.ts` (new file): `resetRequested()`, `clearTraceRequested()`, `exportNpyRequested()`, `exportScfdRequested()`. UI buttons dispatch these; until Task 7/8 land the sagas, Viewport's existing token watchers are re-pointed at a temporary store-subscribe on dispatched actions OR (simpler) left non-functional for exactly the commits between Task 2 and Tasks 7-8 — prefer keeping them working by having Viewport listen via `store` subscription to a `lastCommand` scratch only if trivially cheap; otherwise note the gap in the commit message.
`volpathKeyFor.ts` loses its two token params — the path-tracer reset for an explicit reset/clear arrives via the harness rebuild / clear that the saga performs (Task 7 wires `resetVolpath` there).

- [ ] Delete fields + reducers, add `commands.ts`, update dispatch sites and `volpathKeyFor` (+ its test).
- [ ] Typecheck + tests green; commit.

### Task 3: Store scaffold + React seam

**Files:**
- Create: `tools/mcpm-workbench/src/store/{types.ts,rootReducer.ts,rootSaga.ts,createWorkbenchStore.ts,hooks.ts,sagaContext.ts}`
- Delete (via `npm run refactor -- delete` or move-files as appropriate): `tools/mcpm-workbench/src/state/createStore.ts`, `src/state/useStore.ts`, `@types/Store.d.ts`, `@types/AppState.d.ts` (RootState replaces it)
- Modify: `tools/mcpm-workbench/src/ui/App/App.tsx`, `src/ui/storeContext.ts` → delete (react-redux `Provider` replaces it), every `useStore(store, sel)` consumer → `useAppSelector(sel)`

**Contract:** mirror `src/store/` file-for-file at workbench scale:
- `types.ts`: `RootState`, `AppDispatch`, `WorkbenchStore`.
- `rootReducer.ts`: `{ sim, view, grid, catalog, histogram }` — key names unchanged so every selector body survives.
- `createWorkbenchStore.ts`: `configureStore` + saga middleware + `registerSagaContext(ctx: WorkbenchSagaContext)` that calls `sagaMiddleware.setContext(ctx)` then dispatches `sagaContextRegistered()` (copy the shape of `src/store/createAppStore.ts:85-91`).
- `sagaContext.ts`: `export type WorkbenchSagaContext = { canvas: HTMLCanvasElement; resources: RenderResources }` (RenderResources arrives in Task 4 — declare it there, import here).
- `hooks.ts`: `useAppSelector`/`useAppDispatch`/`useAppStore` wrappers — the only react-redux import.
- `rootSaga.ts`: `all([])` for now.

- [ ] Scaffold, wire `App.tsx` (`<Provider store={...}>`), convert all consumers, delete the custom store files.
- [ ] The probe/validate harnesses (`tools/mcpm-workbench/probeGpuErrors.ts`, `validate/`) and any test helpers constructing the old store move to `createWorkbenchStore` — grep `createStore(` under `tools/mcpm-workbench` + `tests/tools/mcpm-workbench`.
- [ ] Typecheck + tests + `npm run mcpm-workbench` boots (manual: page renders, sliders write state); commit.

### Task 4: RenderResources holder

**Files:**
- Create: `tools/mcpm-workbench/src/render/renderResources.ts`
- Test: `tests/tools/mcpm-workbench/render/renderResources.test.ts`

**Contract:**
```ts
export type RenderResources = {
  gpu: GpuContext | null;
  harness: McpmHarness | null;
  graph: RenderGraph | null;
  previewBuffer: GPUBuffer | null;
  epoch: number; // bumped by every (re)build; async work checks it after awaits
};
export function createRenderResources(): RenderResources;
export function disposeScene(resources: RenderResources): void; // preview → graph → harness, null them, epoch++
```
`disposeScene` carries Viewport's `disposePreview` + `disposeHarness` ordering (free old device memory before a new build allocates — see the comment at the top of `buildFromPoints`). Test: dispose order + idempotence + epoch bump (a real regression trap: the double-resident-buffers landmine).

- [ ] Implement + test + commit.

### Task 5: catalogSaga

**Files:**
- Create: `tools/mcpm-workbench/src/state/catalog/watchCatalogSaga.ts`
- Modify: `tools/mcpm-workbench/src/store/rootSaga.ts`
- Test: `tests/tools/mcpm-workbench/state/catalog/watchCatalogSaga.test.ts`

**Contract:** `takeLatest` on the catalog-key actions (`setCatalogSources`, `setCatalogTier`, packed-catalog install) + `sagaContextRegistered` (initial load). Worker: status `'loading'` → resolve points (packedOverride ▸ `?probe` synthetic ▸ `loadCatalogPoints`) → `deriveAgentWeights` → dispatch `catalogLoaded` (new reducer carrying `{ points, weights, bounds }` — points move INTO catalog state, replacing Viewport's local `points`; extend the serializableCheck ignores). `takeLatest` cancellation replaces the `generation`/`loadedCatalogKey` guards for loading. Test only the key-derivation/points-resolution decision (extract as a pure fn if needed); no saga-plumbing mirror tests.

- [ ] Implement, delete the corresponding `buildOnce` half in Viewport (`loadCatalogPoints` branch + `loadedCatalogKey`), leaving build triggering to Task 6.
- [ ] Typecheck + tests; commit.

### Task 6: harnessSaga (build/rebuild/empty-scene/device-loss)

**Files:**
- Create: `tools/mcpm-workbench/src/state/scene/watchSceneSaga.ts`
- Modify: `rootSaga.ts`, `tools/mcpm-workbench/src/ui/Viewport/Viewport.tsx`

**Contract:** debounced (`REBUILD_DEBOUNCE_MS`) `takeLatest` on every structural action (`catalogLoaded`, grid-slice box actions, `setAgentCount`, `setInitMode`, `setWeightMode`) — enumerate from Viewport's current rebuild key. (`resetRequested` is NOT a rebuild trigger — it reseeds in place via Task 7's `harness.reset`, matching current behaviour.) Worker (all resource access through saga context): `disposeScene` → `acquireGpu` (moves out of Viewport, taking the device-lost watcher with it; loss dispatches the status message + a `deviceLost` action the driver observes to stop) → zero points ▸ empty scene (graph only) / else ▸ `createMcpmHarness` + `createRenderGraph` + attach trace/volpath/agents → dispatch the existing post-build state writes (`setResolvedGrid`, `resetStepCount`, `resetHistogram`, budget). Saga cancellation + `resources.epoch` replace `buildGeneration`/`disposed`. Viewport keeps only: canvas ref, `registerSagaContext` on mount, input wiring, frame driver.

- [ ] Implement; delete `buildFromPoints`/`buildEmptyScene`/`acquireGpu`/`disposeHarness` from Viewport.
- [ ] Manual smoke on :5500 (load, rebuild on box change, deselect-all-sources gizmo path) + suite; commit.

### Task 7: simCommandSaga (reset / clear trace)

**Files:** Create `tools/mcpm-workbench/src/state/sim/watchSimCommandsSaga.ts`; modify `rootSaga.ts`.

**Contract:** `takeEvery(resetRequested)` → `harness.reset(initMode, seed)` + `resetStepCount` + `resetHistogram` + `graph.resetVolpath()`; `takeEvery(clearTraceRequested)` → `harness.clearTrace()` + `graph.resetVolpath()`. No-ops without a harness. Replaces Viewport's reset/clearTrace token watchers (delete them).

- [ ] Implement, delete watchers, suite; commit.

### Task 8: exportSaga

**Files:** Create `tools/mcpm-workbench/src/state/export/watchExportSaga.ts`; modify `rootSaga.ts`.

**Contract:** `takeLeading` per action (an in-flight export ignores repeats): `exportNpyRequested` → `readbackTrace` → `exportNpy` + `emitTraceSidecar` via `triggerDownload`; `exportScfdRequested` → `exportScfd`. Error path = status message, never a throw (current Viewport behaviour). Delete the two export watchers from Viewport.

- [ ] Implement + suite; commit.

### Task 9: previewPackedSaga

**Files:** Create `tools/mcpm-workbench/src/state/view/watchPreviewPackedSaga.ts`; modify `rootSaga.ts`, Viewport.

**Contract:** `takeLatest(setPreviewPacked)` — rising edge packs (`readbackTrace` → `widenTrace` → `previewPackedTrace` → `graph.attachPreviewTrace`), stores `previewPackedAtStep` in view state (new field + reducer — the driver reads it instead of the closure var); falling edge disposes. A `stepCount`-advanced check (on `incrementStep`) handles staleness: dispose + `setPreviewPacked(false)`. The frame driver's stale-fallback branch shrinks to a pure read.

- [ ] Implement, migrate `previewPackedAtStep`/`lastPreviewPacked` out of Viewport; suite; commit.

### Task 10: histogramSaga

**Files:** Create `tools/mcpm-workbench/src/state/histogram/watchHistogramSaga.ts`; modify `rootSaga.ts`, Viewport.

**Contract:** `takeLeading` on `incrementStep` filtered to `stepCount % HISTOGRAM_INTERVAL_STEPS === 0` → `harness.readHistogram()` → `recordHistogramSample`. `takeLeading` replaces the `histogramInFlight` flag; the epoch check replaces `harness !== h`. Sim stepping itself STAYS in the frame driver (it is rAF-cadence-coupled); only the readback moves.

- [ ] Implement, delete `runHistogram` from Viewport; suite; commit.

### Task 11: paletteSaga

**Files:** Create `tools/mcpm-workbench/src/state/view/watchPaletteSaga.ts`; modify `rootSaga.ts`, Viewport.

**Contract:** `takeEvery(setRaymarchPaletteId)` → re-attach trace pass (+ dispose preview & `setPreviewPacked(false)` if attached); `takeEvery(setPathTracerPaletteId)` → re-attach volpath pass. Source fields come from `resources.harness`; no-op without one (build attaches with current palettes anyway). Removes the two `attachedPalette` blocks from `frame()`.

- [ ] Implement + suite; commit.

### Task 12: Viewport slim-down + close-out

**Files:** Modify `tools/mcpm-workbench/src/ui/Viewport/Viewport.tsx`; docs touch-ups (`tools/mcpm-workbench/README.md` architecture paragraph).

**Contract:** Viewport retains ONLY: canvas + context registration, `createViewportInput` wiring, the rAF driver (dirty/FPS/interaction-boost bookkeeping, sim step cadence, layer draws off `resources`, volpath key reset, tonemap), and probe-gate globals. Zero `dispatch` calls except `setFps` and the driver-owned `incrementStep`. Delete every now-dead closure/var; re-run the comment budget over the file.

- [ ] Slim, README paragraph, full `npx vitest run tests/tools/mcpm-workbench`, `npm run typecheck`, `npm run mcpm-workbench:probe`; commit.

## Definition of Done

- Deliverables: `tools/mcpm-workbench/src/store/` (6 files) mirroring `src/store/`; five RTK slices; `commands.ts`; seven `watch*Saga` modules; `renderResources.ts`; token fields gone from state.
- Manual smoke on :5500: catalog loads and renders all four layers; grid-box drag rebuilds after debounce; deselecting every source keeps camera + gizmo live; reset/clear-trace buttons work; both palette dropdowns switch live (path tracer restarts accumulation); preview-packed toggles on and goes stale on the next step; both download buttons produce files; histogram + E/M/null keep updating; device-loss message path unbroken (code-review level, not manually inducible).
- `npm run mcpm-workbench:probe` passes.
- Out of scope: any new look features (deposit layer, trim box, background colour — separate backlog), flow-workbench or main-app store changes, performance work.
