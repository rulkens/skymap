# Engine settings-handles dissolve into reconcile sagas (plan)

> **For agentic workers.** Execute this plan via the
> **REQUIRED SUB-SKILL: `superpowers:subagent-driven-development`** — a fresh
> subagent per task, with the spec + per-task `Interfaces` block as its brief,
> plus the spec/quality reviews that workflow gates on. Each task is a TDD loop:
> write the failing test → run it and confirm it fails → minimal implementation
> → confirm it passes → commit.

**Goal.** Fold every SettingsPanel-driven `EngineHandle` setter into plain store
dispatches, moving their reactive consequences (render wake, fades, flow reseed,
bias bake) into a small set of table-driven reconcile sagas on the existing saga
seam.

**Architecture.** The UI dispatches plain settings slice actions
(`setMilkyWayEnabled(true)`) via `useAppDispatch`; four `takeEvery` reconcile
sagas watch the settings write stream and drive the consequences through a
`ReconcileEffects` closure-bag the engine registers into saga context via a new
`setSagaContext` seam (generalizing the tier spec's boundary). The entire
`handles/` settings surface and the `settingsTable` builder are deleted; the
surviving handle keeps only camera / selection / tier / `volumes.add|remove` /
read accessors.

**Tech Stack.** TS + Redux Toolkit + `typed-redux-saga` + `redux-saga`; React 19
+ `react-redux`; Vitest. WebGPU engine in `src/services/engine`.

**Source of truth.** The approved design
[`2026-06-19-engine-handles-to-reconcile-sagas-design.md`](../specs/2026-06-19-engine-handles-to-reconcile-sagas-design.md).
Read it fully before starting; this plan is its build order (§8) broken into TDD
tasks. ADR 0007 + [`intent.md`](../conventions/intent.md) §5 carry the rationale.

## Global Constraints

- TS: `export type X = …`, never `interface`. One type per file under
  `src/@types/` (filename = exported type). `SagaContext`/`SetSagaContext`/
  `ReconcileEffects` live in `src/store` (the AppStore home), **not** `@types/` —
  follow the tier spec's note. Single-function files in `utils/` named for the
  function. No barrels; deep relative imports.
- Tests: Vitest. Typed `vi.fn<() => void>()` (and
  `vi.fn<(r: readonly VisibilityLayerKey[]) => void>()` etc.) — bare `vi.fn()`
  fails tsc against the typed `ReconcileEffects` fields.
- Didactic comments: explain *why* and the rejected alternative (match the
  multi-paragraph module headers already on the `handles/` files). Comments
  timeless + terse — no dates, no PR refs, no "pre-X" history notes.
- Branch + PR, squash-merge. Commit with the user's git identity (Co-Authored-By
  trailer only, never `--author`). Stage specific paths, never `git add -A`.
  Prettier only the files you touched.
- The suite stays green at **every** task (currently 590+ tests / 76 files). The
  spec's build order is chosen so behaviour runs alongside the handles
  (idempotent) before the handles are cut — never a red step.

## Naming contracts (spelled identically everywhere)

| Name | Kind | Home |
| --- | --- | --- |
| `ReconcileEffects` | type | `src/store/effects/ReconcileEffects.ts` |
| `makeReconcileEffects` | fn | `src/services/engine/wiring/makeReconcileEffects.ts` |
| `SagaContext`, `SetSagaContext` | types | `src/store/types.ts` |
| `reconcileSagas` (module) — `watchWake`/`watchFades`/`watchFlowReseed`/`watchBiasBake`, `FADE_ROW` | sagas + data | `src/store/effects/reconcileSagas.ts` |
| `syncFades`, `reseedFlow`, `bakeBias`, `requestRender` | `ReconcileEffects` members | — |

---

## Phase 1 — Saga seam (additive, no behaviour)

Mirrors spec §8.1. `mainSaga` still `all([])` at the end of this phase.

### Task 1.1 — `createAppStore` returns `{ store, setSagaContext }`

**Files:**
- `src/store/types.ts` (modify) — add `SagaContext` + `SetSagaContext`; re-derive
  `AppStore`/`AppDispatch` (see contract below).
- `src/store/effects/ReconcileEffects.ts` (create) — the type only (no impl yet;
  needed so `SagaContext` can reference it).
- `src/store/createAppStore.ts` (modify) — wire `setContext` and return the pair.
- `tests/store/createAppStore.test.ts` (modify).

**Interfaces:**

Consumes: `configureStore`, `createSagaMiddleware`, `setContext` from
`redux-saga`, existing `mainSaga`, `PreloadedState`.

Produces:

```ts
// src/store/effects/ReconcileEffects.ts
import type { VisibilityLayerKey } from '../../@types/animation/VisibilityLayerKey';
import type { BiasMode } from '../../@types/data/galaxyCatalog/BiasMode';
export type ReconcileEffects = {
  requestRender: () => void;
  syncFades: (rows: readonly VisibilityLayerKey[]) => void;
  reseedFlow: () => void;
  bakeBias: (mode: BiasMode) => void;
};

// src/store/types.ts
export type SagaContext = { reconcile: ReconcileEffects };
export type SetSagaContext = (ctx: Partial<SagaContext>) => void;
```

**`AppStore` derivation contract.** Today `AppStore = ReturnType<typeof
createAppStore>` (`types.ts:20`). After this task the factory returns
`{ store; setSagaContext }`, so `AppStore` must stay the STORE type, not the pair.
Re-derive both:

```ts
export type AppStore = ReturnType<typeof createAppStore>['store'];
export type AppDispatch = AppStore['dispatch'];
```

Verify `AppStore`/`AppDispatch` still resolve at their consumers (`hooks.ts`,
`EngineCallbacks.d.ts`, every `handles/*.ts`) — the `.store` indexing keeps the
shape identical, so no consumer edits beyond this file.

**`createAppStore` shape after:**

```ts
export function createAppStore(preloadedState?: PreloadedState): {
  store: AppStore;
  setSagaContext: SetSagaContext;
};
```

`setSagaContext` calls `sagaMiddleware.setContext(ctx)` (redux-saga merges into
the running root saga's context). Document *why* the seam exists: sagas live in
the store layer and can't reach the engine scheduler/renderers/fades; the engine
registers closures over `EngineState` here.

- [x] Update `createAppStore.test.ts`: every `createAppStore(...)` call destructures
  `{ store }` (4 call sites in the file). Add `returns a setSagaContext function`
  asserting `typeof setSagaContext === 'function'`. Confirm fail (factory still
  returns the bare store), then implement, then pass.
- [x] Run `npm test -- createAppStore` → green.
- [x] Commit.

### Task 1.2 — repoint the remaining `createAppStore` callers

**Files (modify):** `src/main.tsx` (~line "const store = createAppStore(...)");
`tests/store/hooks.test.ts`; `tests/services/engine/setCategoryVisibleFade.test.ts`;
`tests/services/engine/setSourceVisibleFade.test.ts`;
`tests/services/engine/flowFieldsHandle.test.ts`;
`tests/services/engine/wiring/applyEffect.test.ts`;
`tests/services/engine/wiring/restoreSettings.test.ts`;
`tests/services/engine/wiring/settingsRoundTrip.test.ts`;
`tests/services/engine/wiring/settingsTable.test.ts`.

**Interfaces:** Consumes the new `{ store, setSagaContext }` return. Each caller
destructures `{ store }` (and ignores `setSagaContext` unless it needs it).

- [x] Mechanical: change `const store = createAppStore(...)` →
  `const { store } = createAppStore(...)` at every caller. `main.tsx` passes the
  destructured `store` to `<Provider>` and `useEngine`.
- [x] `npm test` → full suite green; `npm run typecheck`.
- [x] Commit.

### Task 1.3 — `EngineCallbacks` gains `setSagaContext`

**Files:**
- `src/@types/engine/EngineCallbacks.d.ts` (modify) — add the field next to
  `store`.
- `src/main.tsx` (modify) — pass `setSagaContext` into the engine callbacks bag
  (thread it through `useEngine` → `createEngine` the same way `store` is today).
- `tests/` — any engine-construction fixture that builds an `EngineCallbacks`
  object (search for `cb.store` / callbacks fixtures) gains a `setSagaContext`
  stub `vi.fn<SetSagaContext>()` or a no-op.

**Interfaces:**

Produces: `EngineCallbacks.setSagaContext: SetSagaContext` (required, sibling of
`store`). Document: the engine calls it once `EngineState` exists, to register the
reconcile effects. Until Phase 2 the engine doesn't call it — this task only adds
the field + threads the value, so it stays additive.

- [x] Add a failing type-level/usage test or rely on tsc: a fixture omitting
  `setSagaContext` must fail. Add the field, thread through `main.tsx` +
  `useEngine`, stub in fixtures.
- [x] `npm run typecheck` + `npm test` → green. `mainSaga` is still `all([])`.
- [x] Commit.

---

## Phase 2 — Reconcile effects + sagas (behaviour alongside handles)

Mirrors spec §8.2. Behaviour now fires *in addition* to the still-present
handles. Both wake and both fade — idempotent (`requestRender` coalesces; a
`fadeTo` to an unchanged target is a no-op), so the suite stays green with both
paths live.

### Task 2.1 — `makeReconcileEffects(state)`

**Files:**
- `src/services/engine/wiring/makeReconcileEffects.ts` (create).
- `tests/services/engine/wiring/makeReconcileEffects.test.ts` (create).

**Interfaces:**

Consumes: `EngineState` (`src/@types/engine/state/EngineState`), `ReconcileEffects`
type, `syncVisibilityFades` (`./syncVisibilityFades`).

Produces:

```ts
export function makeReconcileEffects(state: EngineState): ReconcileEffects;
```

Bodies (the implementer writes from the test; pinned by the spec §2 closures):
- `requestRender` → `state.subsystems.scheduler.requestRender()`
- `syncFades(rows)` → `syncVisibilityFades(state, { animate: true, only: rows })`
- `reseedFlow` → `state.gpu.flowFieldRenderer?.maybeReseed()` (tolerates null)
- `bakeBias(mode)` → `void state.subsystems.biasCorrection.setMode(mode)`

These mirror the bodies relocated from `handles/setMilkyWayEnabled.ts:27-29`,
`handles/setFlow.ts:40-42`, `handles/setBiasMode.ts:24`, and
`wiring/syncVisibilityFades.ts:123-146` — cite, don't re-derive.

**Tests** (fake `EngineState` with spy subsystems, typed
`vi.fn<() => void>()`):
- [x] `requestRender calls scheduler.requestRender`.
- [x] `syncFades(['flow']) calls syncVisibilityFades with { animate: true, only: ['flow'] }`
  (spy/mock the bridge, or assert the fade subsystem received the flow row).
- [x] `reseedFlow calls flowFieldRenderer.maybeReseed`.
- [x] `reseedFlow tolerates a null flowFieldRenderer` (no throw when `gpu.flowFieldRenderer === null`).
- [x] `bakeBias(1) calls biasCorrection.setMode(1)`.
- [x] Confirm fail → implement → pass. `npm test -- makeReconcileEffects`. Commit.

### Task 2.2 — the four reconcile sagas + `FADE_ROW`

**Files:**
- `src/store/effects/reconcileSagas.ts` (create).
- `tests/store/effects/reconcileSagas.test.ts` (create).

**Interfaces:**

Consumes: `takeEvery`, `getContext` from `typed-redux-saga`; `UnknownAction`
from `@reduxjs/toolkit`; `settingsRoute` (`../constants`); the slice action
creators from `../../state/settings/settingsSlice`
(`setGalaxyCatalogVisible`, `setGalaxyCatalogLabelEnabled`, `setFilamentsEnabled`,
`setMilkyWayEnabled`, `setMilkyWayLabelEnabled`, `setStructureItemEnabled`,
`setStructureLabelEnabled`, `writeVolumeField`, `setVolumesEnabled`, `setFlow`,
`setBiasMode`); `VisibilityLayerKey`, `ReconcileEffects`.

Produces (export `watchWake`, `watchFades`, `watchFlowReseed`, `watchBiasBake`,
and `FADE_ROW`):

```ts
export const FADE_ROW: Partial<Record<string, VisibilityLayerKey>> = {
  [setGalaxyCatalogVisible.type]: 'survey',
  [setGalaxyCatalogLabelEnabled.type]: 'surveyLabel',
  [setFilamentsEnabled.type]: 'filaments',
  [setMilkyWayEnabled.type]: 'milkyWayDisk',
  [setMilkyWayLabelEnabled.type]: 'milkyWayLabel',
  [setStructureItemEnabled.type]: 'structureRing',
  [setStructureLabelEnabled.type]: 'structureLabel',
  [writeVolumeField.type]: 'volumeField',
  [setVolumesEnabled.type]: 'volumesMaster',
  [setFlow.type]: 'flow',
};
```

Saga contracts (per spec §3 — bodies from the spec's sketch, no expansion):
- `watchWake` — `takeEvery(isSettingsWrite, …)` → `fx.requestRender()`. The
  matcher: `typeof a.type === 'string' && a.type.startsWith(`${settingsRoute}/`)`.
- `watchFades` — `takeEvery((a) => a.type in FADE_ROW, …)` →
  `fx.syncFades([FADE_ROW[action.type]!])`.
- `watchFlowReseed` — `takeEvery(setFlow, …)`; **return early** unless
  `payload.mode !== undefined || payload.count !== undefined`, then `fx.reseedFlow()`.
- `watchBiasBake` — `takeEvery(setBiasMode, …)` → `fx.bakeBias(a.payload)`.

Each worker reaches the effects via `yield* getContext<ReconcileEffects>('reconcile')`.

**Didactic note to include in the module header:** `FADE_ROW` is a flat 1:1
action→row registry (the table that replaces nine near-identical setter bodies —
`simplicity.md` #7). It must stay a data-table lookup, never an `if`/`switch`
chain on action type. `watchWake` centralizes the wake "by construction", killing
`settingsTable`'s "did we remember requestRender in all of them?" audit.

**Tests** — real `configureStore` (RTK) + saga middleware, with
`setContext({ reconcile: { requestRender: vi.fn<() => void>(), syncFades:
vi.fn<(r: readonly VisibilityLayerKey[]) => void>(), reseedFlow: vi.fn<() =>
void>(), bakeBias: vi.fn<(m: BiasMode) => void>() } })`. Run the four watchers via
the saga middleware, dispatch, assert spies. Spec §7 enumerates the cases:
- [x] `setMilkyWayEnabled(true)` → `requestRender` called **and**
  `syncFades(['milkyWayDisk'])` called.
- [x] `setPointSize(…)` (a boring write, no `FADE_ROW` entry) → `requestRender`
  called, `syncFades` **not** called.
- [x] `writeVolumeField({ id, patch: { contrast } })` → `syncFades(['volumeField'])`
  fires. Idempotence: dispatch against an unchanged `enabled` bit and assert
  `syncFades` is still called with `['volumeField']` (the saga is row-driven; the
  no-op lives in the bridge, asserted in Task 2.1 / the bridge's own tests).
- [x] `setFlow({ count })` → `reseedFlow` called and `syncFades` **not** called
  (no `enabled` in patch). `setFlow({ enabled: true })` → `reseedFlow` **not**
  called, `syncFades(['flow'])` called.
- [x] `setBiasMode(1)` → `bakeBias(1)` called.
- [x] Confirm fail → implement → pass. `npm test -- reconcileSagas`. Commit.

### Task 2.3 — compose the watchers in `rootSaga`

**Files:** `src/store/rootSaga.ts` (modify); extend
`tests/store/createAppStore.test.ts`'s `runs mainSaga without throwing` to cover
the non-empty root (or add a focused rootSaga test).

**Interfaces:** Consumes the four watchers. `mainSaga` becomes:

```ts
yield* all([watchWake(), watchFlowReseed(), watchBiasBake(), watchFades()]);
```

Replace the "deliberately empty" module header with one describing the four
reconcile watchers. (Note: the watchers `getContext('reconcile')` lazily inside
each worker, so composing them before any context is set is safe — no worker runs
until an action arrives, by which point Phase 2.4 has registered the context.)

- [x] Confirm fail (test expecting forks) → implement → pass.
- [x] `npm test` → green (sagas have no context registered yet in plain store
  tests, but no action triggers a worker, so still green).
- [x] Commit.

### Task 2.4 — engine registers `reconcile` at wiring

**Files:** `src/services/engine/engine.ts` (modify — call site once `EngineState`
exists, near where `const store = cb.store` at `engine.ts:211` and the `state`
object is built `engine.ts:213`); a focused test asserting the engine calls
`cb.setSagaContext` with a `reconcile` bag (extend an existing engine-construction
test or add `tests/services/engine/registerReconcile.test.ts`).

**Interfaces:** Consumes `makeReconcileEffects`, `cb.setSagaContext`. Produces the
call:

```ts
cb.setSagaContext({ reconcile: makeReconcileEffects(state) });
```

Place it right after `state` is constructed (the closures dereference
`state.gpu` / `state.subsystems` at call time, so registering before async GPU
init is fine — document this).

- [x] Failing test: a spy `setSagaContext` receives an object with a `reconcile`
  bag whose four members are functions. Confirm fail → implement → pass.
- [x] `npm test` + `npm run typecheck` → green. Behaviour now runs alongside the
  handles (idempotent); verify a manual smoke or existing fade tests still pass.
- [x] Commit.

### Task 2.5 — verify the synchronous-notify invariant (spec §5)

**Files:** `tests/store/effects/reconcileSagas.test.ts` (extend) — no production
change expected; this task *confirms* the load-bearing invariant rather than
assuming it.

**Interfaces:** none new.

The reconcile sagas read post-write intent through `state.settings` (inside
`syncVisibilityFades`). Today's handles already depend on dispatch-then-read
ordering (`setMilkyWayEnabled.ts:27-29`: dispatch, then bridge reads
`state.settings`). Confirm the engine's settings view reflects the store
synchronously *before* the `takeEvery` worker runs.

- [x] Add a test: with a store seeded so a row's intent flips on dispatch, the
  `syncFades` spy's call happens-after the reducer has updated
  `store.getState().settings` (assert the store state is already the new value at
  the moment the worker fires — e.g. read `store.getState()` inside the spy).
- [x] If the invariant does **not** hold (worker sees stale settings), STOP and
  surface to the user — do not paper over with a re-read. (Expected: it holds —
  RTK dispatch is synchronous and the saga `takeEvery` runs after the reducer.)
- [x] `npm test -- reconcileSagas` → green. Commit.

---

## Phase 3 — Cut the boring table over

Mirrors spec §8.3. Migrate the boring call sites to direct `dispatch(setX())` via
`useAppDispatch`, then delete `settingsTable.ts` + `SettingsTableKey` + the
forwarders. Wake now comes solely from `watchWake`.

### Task 3.1 — App.tsx boring call sites → `useAppDispatch`

**Files:** `src/components/App/App.tsx` (modify); existing App-level tests if any
assert on the handle calls.

**Interfaces:** Consumes `useAppDispatch` (`../../store/hooks`) + the slice action
creators. The boring UI call sites (per spec §4 table; `App.tsx` line refs):

| Handle call (before) | Dispatch (after) | App.tsx |
| --- | --- | --- |
| `galaxyCatalogs.setSize(size)` | `dispatch(setGalaxyCatalogSize(size))` | :318 |
| `galaxyCatalogs.setDepthFade(v)` | `dispatch(setDepthFade(v))` | :352 |
| `galaxyCatalogs.setHighlightFallback(v)` | `dispatch(setHighlightFallback(v))` | :465 |
| `galaxyCatalogs.setRealOnly(v)` | `dispatch(setRealOnly(v))` | :468 |
| `filaments.setIntensity(v)` | `dispatch(setFilamentIntensity(v))` | :349 |
| `bias.setAbsMagLimit(M)` | `dispatch(setAbsMagLimit(M))` | :381 |
| `tonemap.setCurve(c)` | `dispatch(setToneMapCurve(c))` | :383 |
| `camera.setAutoRotate(b)` | `dispatch(setAutoRotate(b))` | :435 |
| `debug.setShowPickBuffer(v)` | `dispatch(setShowPickBuffer(v))` | :472 |
| `debug.setShowDiskRadiusRing(v)` | `dispatch(setShowDiskRadiusRing(v))` | :476 |

(Three table rows have **no** UI call site and so no migration target — they just
vanish with the table in Task 3.3: `setBrightness` (panel control evicted),
`setExposure` (tonemap exposure control evicted), and `setGalaxyTexturesEnabled`
(dead handle method — the engine reads `state.settings.thumbnails` per-frame).
Their dead sub-handle methods — `EngineGalaxyCatalogsHandle.setBrightness`,
`EngineTonemapHandle.setExposure`, `EngineThumbnailsHandle.setEnabled` — are
dropped in Task 3.2 / 5.1 with no call-site change.)

- [x] Add `const dispatch = useAppDispatch();` in `App`. Replace each
  `handleRef.current?.<cluster>.<setter>(…)` above with `dispatch(<action>(…))`.
  Update the surrounding didactic comments to "dispatches the slice action;
  `watchWake` wakes the loop" (drop the "handle notifies synchronously" framing).
- [x] `npm test` + `npm run typecheck` → green (handles + sagas + new dispatch all
  coexist; idempotent). Commit.

### Task 3.2 — delete the boring forwarders from `engine.ts`

**Files:** `src/services/engine/engine.ts` (modify — remove `boringSetters`
construction `engine.ts:483-486`, the `buildSettersFromTable` import
`engine.ts:104`, the `SettingsTableKey` import, and every
`boringSetters.<name>` reference in the handle literal: `engine.ts:703-716,
735-738, 746, 795-796`); the sub-handle types they backed.

**Interfaces:** The boring methods leave `EngineGalaxyCatalogsHandle`
(`setSize`/`setBrightness`/`setDepthFade`/`setHighlightFallback`/`setRealOnly`),
`EngineTonemapHandle` (`setCurve`), `EngineCameraHandle` (`setAutoRotate`),
`EngineBiasHandle` (`setAbsMagLimit`), `EngineThumbnailsHandle` (`setEnabled`),
`EngineFilamentsHandle` (`setIntensity`), `EngineDebugHandle`
(`setShowPickBuffer`/`setShowDiskRadiusRing`). Drop those members from those
`.d.ts` files (keep methods Phase 4 will remove, e.g. filaments `setEnabled`,
until Phase 4).

- [x] Remove the forwarders + the now-dead sub-handle method declarations. The
  `setLabelEnabled`/`setEnabled`/`setIntensity` (fade) methods stay for now.
- [x] `npm run typecheck` → resolves (no dangling `boringSetters` refs). `npm test`.
  Commit.

### Task 3.3 — delete `settingsTable.ts` + `SettingsTableKey` + their test

**Files (delete):** `src/services/engine/wiring/settingsTable.ts`;
`src/@types/settings/SettingsTableKey.d.ts`;
`tests/services/engine/wiring/settingsTable.test.ts`.

**Interfaces:** none — confirm no remaining importers (`buildSettersFromTable`,
`SETTINGS_TABLE`, `SettingsTableKey`).

- [x] Search for residual importers; delete the three files; remove the
  `SettingsTableKey` import already cut in 3.2.
- [x] `npm run typecheck` + `npm test` → green. Commit.

---

## Phase 4 — Cut the fade/effect handles over

Mirrors spec §8.4. Migrate the visibility/label/volume/flow/bias/pass call sites
to direct dispatch; move the five `clampVolume*` calls to the read edge; delete
the dissolved `handles/*.ts` + forwarders.

### Task 4.1 — App.tsx fade/effect call sites → dispatch

**Files:** `src/components/App/App.tsx` (modify).

**Interfaces:** Consumes `useAppDispatch` + slice actions. Mapping (spec §4;
`App.tsx` line refs):

| Handle call (before) | Dispatch (after) | App.tsx |
| --- | --- | --- |
| `structures.setItemEnabled(cat, v)` | `dispatch(setStructureItemEnabled({ id: cat, enabled: v }))` | :324 |
| `structures.setLabelEnabled(cat, v)` | `dispatch(setStructureLabelEnabled({ id: cat, enabled: v }))` | :334 |
| `milkyWay.setLabelEnabled(v)` | `dispatch(setMilkyWayLabelEnabled(v))` | :336 |
| `galaxyCatalogs.setLabelEnabled(cat, v)` | `dispatch(setGalaxyCatalogLabelEnabled({ id: cat, enabled: v }))` | :338 |
| `filaments.setEnabled(v)` | `dispatch(setFilamentsEnabled(v))` | :347 |
| `sources.setVisible(src, v)` | `dispatch(setGalaxyCatalogVisible({ id: galaxyCatalogIdOf(src), enabled: v }))` | :369 |
| `bias.setMode(m)` | `dispatch(setBiasMode(m))` | :378 |
| `volumes.setMasterEnabled(v)` | `dispatch(setVolumesEnabled(v))` | :393 |
| `volumes.setEnabled(id, v)` | `dispatch(writeVolumeField({ id, patch: { enabled: v } }))` | :397 |
| `volumes.setIntensity(id, n)` | `dispatch(writeVolumeField({ id, patch: { intensity: n } }))` | :400 |
| `volumes.setContrast(id, n)` | `dispatch(writeVolumeField({ id, patch: { contrast: n } }))` | :403 |
| `volumes.setDensityScale(id, n)` | `dispatch(writeVolumeField({ id, patch: { densityScale: n } }))` | :406 |
| `volumes.setTrim(id, n)` | `dispatch(writeVolumeField({ id, patch: { trim: n } }))` | :409 |
| `volumes.setExposure(id, n)` | `dispatch(writeVolumeField({ id, patch: { exposure: n } }))` | :412 |
| `volumes.setPalette(id, p)` | `dispatch(writeVolumeField({ id, patch: { paletteId: p } }))` | :415 |
| `flow.set(patch)` | `dispatch(setFlow(patch))` | :194 |

**Volume params dispatch UNCLAMPED.** The `clampVolume*` calls in the handles
(`setVolumeFieldContrast.ts:23` etc.) do **not** move into App — they move to the
renderer edge in Task 4.2. The store holds raw Intent (mirrors `setFlow` /
`clampFlowParams`).

- `setGalaxyCatalogVisible` needs the catalog id: import `galaxyCatalogIdOf`
  (`../../utils/galaxyCatalogIdOf`) as `setSourceVisible.ts:52` does, or dispatch
  whatever id the panel already has.

- [x] Replace each call site with the dispatch above. Update didactic comments
  (the `setEnabled`/`setVisible`/`setMode` ones currently describe the handle's
  fade/bake — replace with "dispatches the write; `watchFades`/`watchBiasBake`/
  `watchFlowReseed` reconcile downstream").
- [x] `npm test` + `npm run typecheck` → green (handles still wired but now
  unreachable from App; sagas drive the consequences). Commit.

### Task 4.2 — move volume-param clamps to `encodeVolumePrepass`

**Files:** `src/services/engine/frame/encodeVolumePrepass.ts` (modify —
`settingsOf` at line 75 reads `state.settings.volumes.items[id]`);
`tests/services/engine/frame/` (add/extend a test asserting the read-edge clamp).

**Interfaces:** Consumes `clampVolumeContrast`, `clampVolumeExposure`,
`clampVolumeIntensity`, `clampVolumeDensityScale`, `clampVolumeTrim`
(`../../../utils/clampVolume*`). The `settingsOf` closure (`encodeVolumePrepass.ts:75`)
returns the per-field settings the volume renderer reads into its uniform — wrap
its raw `state.settings.volumes.items[id]` so the five clamped fields are clamped
at read.

Before/after sketch (the only line that changes):

```ts
// before (encodeVolumePrepass.ts:75)
const settingsOf = (id: VolumeFieldId) => state.settings.volumes.items[id];
// after — clamp the GPU-bound fields at the consumption edge (raw Intent in store)
const settingsOf = (id: VolumeFieldId) => {
  const raw = state.settings.volumes.items[id];
  return { ...raw, contrast: clampVolumeContrast(raw.contrast), /* exposure, intensity, densityScale, trim */ };
};
```

The implementer writes the full object spread from the test; `paletteId`/
`enabled` pass through unclamped (no clamp helper exists for them — matches the
handles, where `setVolumeFieldPalette.ts` / `setVolumeFieldEnabled.ts` never
clamped). Verify `hasActiveFields` and `encodeVolumes` both consume the clamped
`settingsOf` (they take it as the same arg at `encodeVolumePrepass.ts:76,79`).

- [x] Failing test: feed an `EngineState` whose `volumes.items[id]` carries
  out-of-range raw values; assert `settingsOf(id)` returns the clamped values
  (one assertion per clamped field) while the store value stays raw.
- [x] Implement the spread; confirm pass. `npm test -- encodeVolumePrepass`.
- [x] `npm run typecheck` → green. Commit.

### Task 4.3 — delete the dissolved `handles/*.ts` + forwarders + repoint tests

**Files (delete):** `src/services/engine/handles/` — `setSourceVisible.ts`,
`setGalaxyCatalogLabelEnabled.ts`, `setMilkyWayEnabled.ts`,
`setMilkyWayLabelEnabled.ts`, `setFilamentsEnabled.ts`, `setStructureItemEnabled.ts`,
`setStructureLabelEnabled.ts`, `setVolumeFieldEnabled.ts`, `setVolumesEnabled.ts`,
`setPassDisabled.ts`, `setFlow.ts`, `setBiasMode.ts`, and the six volume-param
setters (`setVolumeFieldContrast/Exposure/Intensity/DensityScale/Palette/Trim.ts`).

**KEEP:** `setTier.ts`, `addVolumeField.ts`, `removeVolumeField.ts`,
`getVolumeFieldsState.ts`, `listVolumeFields.ts`.

**Files (modify):** `src/services/engine/engine.ts` — remove the deleted imports
(`engine.ts:109-126,129,131`) and the forwarders in the handle literal
(`engine.ts:728,734,741-746,749,757-772 minus add/remove/list/getState,
793`). Keep `volumes.add/remove/list/getState` (`engine.ts:763-764,773-774`).

**Files (repoint, per spec §7 "effect-body parity"):**
`tests/services/engine/setSourceVisibleFade.test.ts`,
`tests/services/engine/setCategoryVisibleFade.test.ts`,
`tests/services/engine/flowFieldsHandle.test.ts` — these drove the deleted handle
bodies (fade row driven, flow reseed gated). Repoint them onto the saga +
`makeReconcileEffects`: the fade-driven behaviour is now covered by
`reconcileSagas.test.ts` (Task 2.2) + `makeReconcileEffects.test.ts` (Task 2.1).
Fold any assertion not already covered there into those two files, then delete the
now-redundant handle tests (or rename/rewrite them as
`makeReconcileEffects`/saga tests — implementer's call, but no behaviour goes
untested).

**Interfaces:** After this task, no `handles/set*` (dissolved set) is imported
anywhere. Confirm via search.

- [x] Repoint the three fade/flow tests' assertions onto the saga +
  `makeReconcileEffects` (gap-fill, don't drop coverage). Delete the dissolved
  `handles/*.ts`. Remove the engine.ts imports + forwarders.
- [x] `npm run typecheck` (catches any dangling import) + `npm test` → green.
  Commit.

---

## Phase 5 — Trim `EngineHandle`

Mirrors spec §8.5. Drop the dissolved sub-handle methods from the types + the
handle literal; freeze the surviving surface; reconcile the deletion-guard tests.

### Task 5.1 — drop dissolved methods from the sub-handle `.d.ts`

**Files (modify):** the sub-handle types under `src/@types/engine/handles/` —
remove the methods migrated to dispatch:
- `EngineGalaxyCatalogsHandle` — drop `setLabelEnabled` (and the boring ones
  already dropped in 3.2).
- `EngineMilkyWayHandle` — drop `setEnabled` + `setLabelEnabled`.
- `EngineFilamentsHandle` — drop `setEnabled` (+ `setIntensity` dropped in 3.2).
- `EngineStructuresHandle` — drop `setItemEnabled` + `setLabelEnabled`.
- `EngineVolumesHandle` — drop `setMasterEnabled`, `setEnabled`, `setIntensity`,
  `setContrast`, `setDensityScale`, `setTrim`, `setExposure`, `setPalette`. **Keep**
  `add`, `remove`, `list`, `getState`.
- `EngineFlowFieldsHandle` — drop `set` (the whole type may become empty; if so,
  remove the `flow` sub-handle from `EngineHandle` too — see 5.2).
- `EngineSourcesHandle` — drop `setVisible` only. **Keep** `setTier` (the spec's
  out-of-scope tier method lives HERE, not at the root — `engine.ts:729`),
  `getCloud`, `getCloudObjIds`. This sub-handle stays.
- `EngineBiasHandle` — drop `setMode` (+ `setAbsMagLimit` dropped in 3.2). Now
  empty → remove the `bias` sub-handle from `EngineHandle` + handle literal + shape
  test.
- `EngineDebugHandle` — drop the pass-override `setDisabled` (+ boring debug
  toggles dropped in 3.2). Verify what else `debug` carries (`passOverrides`
  shape, dev-only readers) before removing the whole sub-handle — trim, don't
  assume-empty.
- `EngineTonemapHandle` — drop `setCurve` AND `setExposure` (both were table rows
  dropped in 3.2 / dead-with-no-call-site). Now empty → remove the `tonemap`
  sub-handle from `EngineHandle`.

**Interfaces:** A sub-handle that becomes empty is removed from `EngineHandle`
entirely (and from `engine.ts`'s handle literal + the shape test). Expected
surviving handle surface: `camera`, `selection`, `sources` (`setTier` + the
`getCloud`/`getCloudObjIds` accessors), `volumes` (add/remove/list/getState),
`destroy`, `assetSlots`, plus any sub-handle (e.g. `debug`) that still carries a
non-dissolved method after trimming. Likely fully-removed sub-handles: `bias`,
`tonemap`, `flow`, `milkyWay`, `filaments`, `structures`, `galaxyCatalogs`,
`thumbnails` — but **verify each `.d.ts` is actually empty** before removing it;
trim methods first, remove the sub-handle only if nothing remains.

- [x] Decide per sub-handle: trimmed vs fully removed. Remove the matching
  forwarders + `import` lines from `engine.ts`'s handle literal.
- [x] `npm run typecheck` (App + tests must not reference dropped methods — Phase
  3/4 already removed them). `npm test`. Commit.

### Task 5.2 — freeze the surviving surface + reconcile guard tests

**Files:** `tests/services/engine/engineHandle.shape.test.ts` (modify — it
asserts 13 sub-handles `engineHandle.shape.test.ts:13-30`; update the list +
count to the survivors).

**Interfaces:** The shape test becomes the freeze for the trimmed surface. Update
`expectedSubHandles` to exactly the survivors and the `toHaveLength` to match.

- [x] Update the shape test's sub-handle list + length to the surviving set
  (whatever 5.1 left). Confirm it's a compile-time `keyof EngineHandle` check so a
  stray method addition fails loudly.
- [x] Confirm the `SettingsTableKey` freeze test is already deleted (Task 3.3) and
  the dissolved-handle tests are repointed/deleted (Task 4.3) — no lingering
  guard references a deleted symbol.
- [x] `npm test` + `npm run typecheck` → green. Commit.

---

## Phase 6 — Quality gates + tie-off

### Task 6.1 — entanglement-radar over the final diff

**Files:** none (review pass; capture findings inline if any).

- [x] Run the `entanglement-radar` skill over the full branch diff.
- [x] **Specifically verify** (`simplicity.md` #7): the `FADE_ROW` / wake dispatch
  is a flat data-table lookup (`a.type in FADE_ROW`, `FADE_ROW[action.type]`), not
  a per-action `if`/`switch` chain. If a chain crept in, un-braid to the table.
- [x] Verify the wake is centralized in `watchWake` (one matcher over the settings
  route prefix), not re-scattered into per-saga `requestRender` calls.
- [x] Address any finding (or record as a follow-up if out of scope), re-run
  affected tests, commit.

### Task 6.2 — final verification + handoff

- [x] `npm run typecheck` (both src + tools tsconfigs) → clean.
- [x] `npm test` (full suite) → green; count is ≥ the 590+ baseline minus the
  deletion-guard tests legitimately removed (settingsTable, dissolved-handle) plus
  the new saga/effects tests. Confirm no net coverage loss for the moved behaviour.
- [x] Grep the tree for residual references to deleted symbols
  (`buildSettersFromTable`, `SETTINGS_TABLE`, `SettingsTableKey`, the dissolved
  `handles/set*` names) — zero hits.
- [x] Run the `superpowers:finishing-a-development-branch` handoff: present
  merge/PR/cleanup options to the user (branch + PR, squash-merge).
