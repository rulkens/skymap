# Tier out of settings — root slice + requestTier saga — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Promote `tier` out of the `settings` slice into its own `RootState` slice, and replace the imperative `handle.sources.setTier` with a command/write split — `requestTier(tier)` (a reducer-less Intent action the UI dispatches) driving a `takeLatest` saga that writes `setTier` and calls an engine-registered `runTierTransition(prev, next)` effect.

**Architecture:** A new `src/state/tier/` slice owns the data-resolution preset (its own lifecycle, never swept by a settings restore). The saga reads `prev` before writing (so the per-source tier-target diff is honest), early-returns on a same-tier no-op (killing today's unconditional famous rebuild), and reaches the engine's GPU resources through a `runTierTransition` runner injected into the saga's context via a `setSagaContext` setter the store factory now returns alongside the store. The transition body relocates verbatim from `handles/setTier.ts` into `wiring/makeRunTierTransition.ts`, minus the dispatch and the `selectTier` read.

**Tech Stack:** Redux Toolkit, typed-redux-saga, TypeScript, Vitest

---

## Conventions (apply to every task)

- `type` aliases never `interface`. One type per file in `src/@types/` (filename = type name); one function per file in `src/utils/` (filename = fn name). **`src/store/` and `src/state/<feature>/selectors.ts` are EXEMPT** — `store/types.ts` holds multiple types; the consolidated `selectors.ts` holds multiple selectors (follow the existing settings pattern).
- RTK inline-Immer reducer args: name them `tier`/`action` for the tier slice (never terse `s`/`a`) — mirroring `settings`/`action` in `settingsSlice.ts`.
- `Tier` is imported from `src/@types/data/Tier`.
- Typed mocks: `vi.fn<() => void>()` / `vi.fn<RunTierTransition>()`, never bare `vi.fn()` (bare fails tsc against typed fields).
- Didactic comments (why + the alternative the change replaces), matching the multi-paragraph module-header style in `createAppStore.ts` / `rootSaga.ts` / `constants.ts`. When you touch a file, bring its header to current state (no history notes — describe current state, not the journey).
- Tests mirror the src tree under `tests/`. Commands: `npm test` (vitest run), `npm run typecheck` (both tsconfigs). The main thread runs `npm`/`git`; implementers only edit.
- Each task ends with a commit step: stage **specific paths** (never `git add -A` / `git add .`), user's git identity (no `--author=`), commit body ends with:
  `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`

**Preserve the spec's decomplection choices.** `requestTier` has **no reducer** — it is purely the saga's trigger; `setTier` is the only writer of `state.tier`. The saga captures `prev` before the write and hands both tiers to the runner explicitly, so the reconciliation never reads the store. Do not "simplify" by making `requestTier` mutate the store (that re-introduces the silent empty-diff bug §2 calls out). `setSagaContext` is returned **alongside** the store, never bolted onto it.

---

## File Structure

### Created

- `src/state/tier/tierSlice.ts` — the `tier` root slice (`setTier` reducer + action creator + default reducer).
- `src/state/tier/selectors.ts` — consolidated selectors file (`selectTier`).
- `src/state/tier/requestTier.ts` — the reducer-less `requestTier` command action.
- `src/state/tier/tierSaga.ts` — `watchTier()` (`takeLatest(requestTier, …)`).
- `src/services/engine/wiring/makeRunTierTransition.ts` — the relocated transition effect factory.
- `tests/state/tier/tierSlice.test.ts`
- `tests/state/tier/selectors.test.ts`
- `tests/state/tier/tierSaga.test.ts`
- `tests/services/engine/wiring/makeRunTierTransition.test.ts`

### Modified

- `src/store/constants.ts` — add `tierRoute`.
- `src/store/rootReducer.ts` — wire `[tierRoute]: tierReducer`.
- `src/store/types.ts` — add `RunTierTransition` / `SagaContext` / `SetSagaContext`; fix `AppStore`.
- `src/store/rootSaga.ts` — `mainSaga` composes `watchTier`.
- `src/store/createAppStore.ts` — return `{ store, setSagaContext }`; `PreloadedState` → `Partial<RootState>`.
- `src/main.tsx` — destructure `{ store, setSagaContext }`; seed tier via `preloadedState`; thread `setSagaContext` into the engine.
- `src/hooks/useEngine.ts` — accept + thread `setSagaContext` through to `createEngine`.
- `src/services/engine/engine.ts` — register the runner via `cb.setSagaContext`; add `state.tier` getter; remove the `sources.setTier` handle method + the `setTier` import.
- `src/services/engine/wiring/reevaluateDemand.ts` — `state.settings.tier` → `state.tier`.
- `src/services/engine/wiring/wireImpostorSubsystems.ts` — `state.settings.tier` → `state.tier`.
- `src/components/App/App.tsx` — dispatch `requestTier`; move `selectTier` import to `state/tier/selectors`.
- `src/@types/engine/state/EngineState.d.ts` — add `tier: Tier` (store-delegating getter).
- `src/@types/engine/EngineCallbacks.d.ts` — add `setSagaContext: SetSagaContext`.
- `src/@types/engine/handles/EngineSourcesHandle.d.ts` — delete the `setTier` member + docblock.
- `src/state/settings/settingsSlice.ts` — delete the `setTier` reducer + export; `buildInitialSettings()`.
- `src/state/settings/selectors.ts` — delete `selectTier`.
- `src/state/settings/initialState.ts` — drop the `initialTier` param + `tier` field.
- `src/@types/settings/EngineSettingsState.d.ts` — delete the `tier` field + its cross-cutting docblock.
- `tests/store/createAppStore.test.ts` — `{ store }` destructure + tier-seed assertion.
- The 13 other `createAppStore(...)` call sites (Task 2).
- Settings tests reconciled (Task 6).

### Deleted

- `src/services/engine/handles/setTier.ts` (body relocated to `makeRunTierTransition.ts`).

---

## Task list

### Task 1: `tier` slice + `selectTier` + `requestTier`; wire `tierRoute` into the store

**Files:** create `src/state/tier/tierSlice.ts`, `src/state/tier/selectors.ts`, `src/state/tier/requestTier.ts`; create `tests/state/tier/tierSlice.test.ts`, `tests/state/tier/selectors.test.ts`; modify `src/store/constants.ts`, `src/store/rootReducer.ts`.

This task is **additive**: `tier` lives in BOTH the settings slice and the new root slice briefly. The suite stays green throughout. `RootState` auto-derives the new slice from `rootReducer` (no manual `types.ts` edit needed for the slice itself — that file's `RootState = ReturnType<typeof rootReducer>` picks it up; the `AppStore`/saga-context types land in Task 2).

**Contracts:**

- `tierSlice.ts` — mirror `settingsSlice.ts` structure (inline-Immer `createSlice`, default-export the reducer, named-export the action creator). Note `'medium'` initial:
  ```ts
  createSlice({
    name: 'tier',
    initialState: 'medium' as Tier,
    reducers: {
      setTier: (tier, action: PayloadAction<Tier>) => action.payload,
    },
  });
  ```
  (The slice state IS the `Tier` primitive — a returning reducer, since a primitive draft can't be mutated in place. Reducer arg named `tier`, not `s`.) Export `setTier` + the default reducer.
- `selectors.ts` (consolidated, one selector — matches the settings convention):
  ```ts
  export const selectTier = (state: RootState): Tier => state[tierRoute];
  ```
  Read `RootState` + `tierRoute` from `../../store/types` and `../../store/constants`.
- `requestTier.ts`:
  ```ts
  export const requestTier = createAction<Tier>('tier/requestTier');
  ```
  A reducer-less RTK `createAction`. Module header: dispatching it changes NOTHING in the store; it only triggers the saga.
- `constants.ts` — add `export const tierRoute = 'tier' as const;` (extend the existing docblock: the future fold's "one constant per top-level slice" note now has its first sibling).
- `rootReducer.ts` — add `[tierRoute]: tierReducer` to the `combineReducers` map; import the default reducer from `../state/tier/tierSlice`.

**Tests:**

- `tests/state/tier/tierSlice.test.ts`:
  - `reducer starts at 'medium'`: `expect(reducer(undefined, { type: '@@INIT' })).toBe('medium')`.
  - `setTier sets state to the payload`: `expect(reducer('medium', setTier('large'))).toBe('large')`.
- `tests/state/tier/selectors.test.ts`:
  - `selectTier lifts state.tier`: build a `RootState`-shaped object `{ [tierRoute]: 'small', [settingsRoute]: <any> }` (cast as needed) and assert `selectTier(state) === 'small'`.

- [ ] Write `tierSlice.test.ts` + `selectors.test.ts` (red — modules don't exist).
- [ ] Implement `tierSlice.ts`, `selectors.ts`, `requestTier.ts`; add `tierRoute` to `constants.ts`; wire it into `rootReducer.ts`.
- [ ] `npm test` → tier slice/selector tests pass; full suite still green (tier in both slices is harmless).
- [ ] `npm run typecheck` clean.
- [ ] Commit. Stage: `src/state/tier/tierSlice.ts src/state/tier/selectors.ts src/state/tier/requestTier.ts src/store/constants.ts src/store/rootReducer.ts tests/state/tier/tierSlice.test.ts tests/state/tier/selectors.test.ts`. Message: `feat(store): add the tier root slice + requestTier command action`.

---

### Task 2: `createAppStore` → `{ store, setSagaContext }`; saga-context types; compose `watchTier`; update all call sites

**Files:** modify `src/store/createAppStore.ts`, `src/store/types.ts`, `src/store/rootSaga.ts`; create `src/state/tier/tierSaga.ts`, `tests/state/tier/tierSaga.test.ts`; modify `tests/store/createAppStore.test.ts` + the 13 other `createAppStore(...)` call sites.

This is the store-shape change. The runner is **not yet registered by the engine** (Task 3 does that), so the saga's `run?.(…)` is a guarded no-op this task — that is correct and intended.

**Contracts:**

- `src/store/types.ts` — add three types (store/ is exempt from one-type-per-file):
  ```ts
  export type RunTierTransition = (prevTier: Tier, nextTier: Tier) => void;
  export type SagaContext = { runTierTransition: RunTierTransition };
  export type SetSagaContext = (ctx: Partial<SagaContext>) => void;
  ```
  Import `Tier` from `../@types/data/Tier`. **Change `AppStore`** — the factory now returns an object, so:
  ```ts
  export type AppStore = ReturnType<typeof createAppStore>['store'];
  ```
  (`AppDispatch = AppStore['dispatch']` is unchanged.)
- `src/store/createAppStore.ts`:
  ```ts
  export type PreloadedState = Partial<RootState>;
  export function createAppStore(preloadedState?: PreloadedState): {
    store: ...; // the configureStore return
    setSagaContext: SetSagaContext;
  } {
    ...
    sagaMiddleware.run(mainSaga);
    return { store, setSagaContext: (ctx) => sagaMiddleware.setContext(ctx) };
  }
  ```
  `PreloadedState` becomes `Partial<RootState>` so callers seed `tier` and/or `settings` (both optional). Import `RootState` from `./types`. Update the module header: the factory now ALSO hands back a `setSagaContext` setter — the store is a state container; registering a saga runner is a distinct capability threaded as its own value, kept un-braided from the store.
- `src/store/rootSaga.ts` — `mainSaga` composes the feature saga:
  ```ts
  yield* all([watchTier()]);
  ```
  Import `watchTier` from `../state/tier/tierSaga`. Update the header: the root saga now forks the first feature saga; it only composes — each watcher is authored beside its slice.
- `src/state/tier/tierSaga.ts`:
  ```ts
  export function* watchTier() {
    yield* takeLatest(requestTier, function* (action) {
      const prev = yield* select(selectTier);
      if (prev === action.payload) return;
      const run = yield* getContext<RunTierTransition>('runTierTransition');
      yield* put(setTier(action.payload));
      run?.(prev, action.payload);
    });
  }
  ```
  Imports `takeLatest, select, put, getContext` from `typed-redux-saga`; `requestTier` from `./requestTier`; `setTier` from `./tierSlice`; `selectTier` from `./selectors`; `RunTierTransition` from `../../store/types`. Header: document the command/write split — `prev` is captured before the write (the diff stays honest); the `prev === payload` early-return is the same-tier no-op that fixes today's unconditional famous rebuild; `run?.` is the defensive no-op for a `requestTier` before the engine registers the runner (impossible in practice — boot completes before the dropdown is interactive — but cheap to guard rather than throw). The transition is sync (today's `.load`/`mcpm.load`/famous-rebuild are fire-and-forget); if a future step is genuinely awaitable, only the `run(…)` line becomes `yield* call(run, …)`.

**Call-site updates** — every `const store = createAppStore(...)` becomes `const { store } = createAppStore(...)`:
- `src/main.tsx:70` (will be re-touched in Task 6 for the tier seed — for now just destructure `{ store }` and keep threading it).
- `tests/services/engine/setSourceVisibleFade.test.ts:62`
- `tests/services/engine/setCategoryVisibleFade.test.ts:51`
- `tests/services/engine/flowFieldsHandle.test.ts:77`
- `tests/services/engine/wiring/restoreSettings.test.ts:36`
- `tests/services/engine/wiring/applyEffect.test.ts:32`
- `tests/services/engine/wiring/settingsTable.test.ts:64` and `:83`
- `tests/services/engine/wiring/settingsRoundTrip.test.ts:47`
- `tests/store/hooks.test.ts:19`
- `tests/store/createAppStore.test.ts:9, 16, 21, 29`

(These keep passing `{ settings: ... }` — `PreloadedState = Partial<RootState>` still accepts a settings-only seed.)

**Tests:**

- `tests/store/createAppStore.test.ts` — destructure `{ store }` at each call; add a tier-seed assertion:
  - `seeds the tier slice from preloadedState`: `const { store } = createAppStore({ [tierRoute]: 'large' }); expect(store.getState().tier).toBe('large')`.
  - Keep the existing settings-seed/dispatch/empty-saga assertions, adjusted to `{ store }`. (The `honours preloadedState` test currently asserts `settings.tier`; until Task 6 removes that field, leave it — it still reads `'large'` from settings. After Task 6 it is reconciled.)
- `tests/state/tier/tierSaga.test.ts` — a real `configureStore` + saga middleware against the production `tierSlice` reducer:
  - Setup: build a store with `combineReducers({ [tierRoute]: tierReducer, [settingsRoute]: settingsReducer })` (or reuse `rootReducer`), `createSagaMiddleware()`, `sagaMiddleware.run(watchTier)`, then `sagaMiddleware.setContext({ runTierTransition: runner })` where `const runner = vi.fn<RunTierTransition>()`. Flush a microtask after each dispatch (`await Promise.resolve()`).
  - `writes the new tier and runs the transition once`:
    ```ts
    store.dispatch(requestTier('large'));
    await Promise.resolve();
    expect(selectTier(store.getState())).toBe('large');
    expect(runner).toHaveBeenCalledTimes(1);
    expect(runner).toHaveBeenCalledWith('medium', 'large');
    ```
  - `is a no-op for a same-tier request`:
    ```ts
    runner.mockClear();
    store.dispatch(requestTier('large')); // already 'large'
    await Promise.resolve();
    expect(runner).not.toHaveBeenCalled();
    expect(selectTier(store.getState())).toBe('large');
    ```

- [ ] Write `tierSaga.test.ts` (red); update `createAppStore.test.ts` for the destructure + tier-seed.
- [ ] Add the three types + fix `AppStore` in `types.ts`; change `createAppStore` to return `{ store, setSagaContext }` with `PreloadedState = Partial<RootState>`; compose `watchTier` in `rootSaga.ts`; implement `tierSaga.ts`.
- [ ] Update all 13 `createAppStore(...)` call sites to `const { store } = …`.
- [ ] `npm run typecheck` clean (catches any missed call site); `npm test` green.
- [ ] Commit. Stage: `src/store/createAppStore.ts src/store/types.ts src/store/rootSaga.ts src/state/tier/tierSaga.ts tests/state/tier/tierSaga.test.ts tests/store/createAppStore.test.ts` + the 12 other touched test files + `src/main.tsx`. Message: `feat(store): return setSagaContext + fork the tier saga on the root seam`.

---

### Task 3: Extract `makeRunTierTransition`; engine registers it; add `state.tier`; thread `setSagaContext`

**Files:** create `src/services/engine/wiring/makeRunTierTransition.ts`, `tests/services/engine/wiring/makeRunTierTransition.test.ts`; modify `src/services/engine/engine.ts`, `src/@types/engine/state/EngineState.d.ts`, `src/@types/engine/EngineCallbacks.d.ts`, `src/main.tsx`, `src/hooks/useEngine.ts`. The runner stays defined in `handles/setTier.ts` until Task 5 deletes it — this task **adds** the factory and registers it; the old handle path still exists in parallel (App still calls `handle.sources.setTier`) until Task 5. The suite stays green.

**Contracts:**

- `src/services/engine/wiring/makeRunTierTransition.ts`:
  ```ts
  export function makeRunTierTransition(
    state: EngineState,
    bootstrapDeps: BootstrapDeps,
  ): RunTierTransition { ... }
  ```
  The returned `(prevTier, nextTier) => void` is **today's `handles/setTier.ts` body, lines 42-80**, with exactly two changes:
  1. It takes `(prevTier, nextTier)` as params instead of reading `selectTier(store.getState())` and the `tier` arg — use `prevTier` for the `tierTarget(src, prevTier)` side of the diff and `nextTier` everywhere the old body used `tier` (the `tierTarget(src, nextTier)` compare, `.load({ source: src, tier: nextTier, dissolvePrevious: true })`, `loadCompanionAssets(state, cfg, nextTier)`, `mcpm.load({ tier: nextTier })`, `rebuildHiResFamousForTier({ … tier: nextTier … })`).
  2. It does **not** dispatch `setTier` and does **not** read `selectTier` (the saga owns the write + the diff inputs).
  `device` is read lazily at call time as `bootstrapDeps.phaseLocals?.device` (same as `handles/setTier.ts:31` carries it today — read it inside the returned closure, not at factory-build time, since GPU init lands after the factory is built). Import `RunTierTransition` from `../../../store/types`, `BootstrapDeps` from `../../../@types/engine/BootstrapDeps`, and reuse the same `GALAXY_CATALOG_SOURCE_REGISTRY` / `loadCompanionAssets` / `tierTarget` / `galaxyCatalogIdOf` / `rebuildHiResFamousForTier` imports `handles/setTier.ts` uses. Header: this is the dispatch-free transition body, reached from the saga via context; `device` is read live off `phaseLocals` so the hi-res rebuild guard correctly skips pre-bootstrap.
- `src/@types/engine/state/EngineState.d.ts` — add `tier: Tier;` next to `settings` (line ~86), documented as a getter delegating to the store (mirror the `settings` delegation note): the engine reads the live tier from `store.getState().tier`; no engine-side mirror.
- `src/services/engine/engine.ts`:
  - In the `state` literal, add a `get tier()` parallel to `get settings()` (engine.ts:218):
    ```ts
    get tier() { return store.getState().tier; },
    ```
  - After `state` exists (the `store` field is in scope from `const store = cb.store` at engine.ts:211), register the runner. Place it near where `bootstrapDeps` is available (it needs `bootstrapDeps` for `phaseLocals`), e.g. just after the `bootstrapDeps` literal / before or after the async IIFE at engine.ts:465:
    ```ts
    cb.setSagaContext({ runTierTransition: makeRunTierTransition(state, bootstrapDeps) });
    ```
    Import `makeRunTierTransition` from `./wiring/makeRunTierTransition`.
- `src/@types/engine/EngineCallbacks.d.ts` — add `setSagaContext: SetSagaContext;` (required), import `SetSagaContext` from `../../store/types`. Document it: the engine registers `runTierTransition` (closed over live `EngineState`) into the saga's context through this setter the store factory exposes. **Keep `initialTier?` for now** (Task 6 decides its fate).
- `src/main.tsx` — destructure `const { store, setSagaContext } = createAppStore(...)` and pass `setSagaContext` into the engine alongside `store` (through `useEngine` → `createEngine`). For this task, thread it; Task 6 changes the seed.
- `src/hooks/useEngine.ts` — `useEngine` obtains the store via `useAppStore()` (useEngine.ts:89) and threads it into `createEngine` (useEngine.ts:152-153). `setSagaContext` is NOT obtainable from `useStore` — it must be threaded as an input. Add it to `UseEngineInput` (`src/@types/engine/UseEngineInput.d.ts`) as `setSagaContext: SetSagaContext` and pass it from `main.tsx` → `<App>` → `useEngine`. **Verify the actual path** main.tsx uses to reach `useEngine`: `main.tsx` renders `<App>`, and `App` calls `useEngine()` with no store arg today (store comes from `useAppStore`). So `setSagaContext` likewise can't ride the Provider — it must be passed as a prop/context. **Simplest honest thread:** have `main.tsx` put `setSagaContext` on a prop of `<App setSagaContext={…}>` (add the prop to `App`), `App` forwards it into `useEngine({ setSagaContext, extraCallbacks })`, and `useEngine` spreads it into the `createEngine` options bag. Read `useEngine.ts:83-153` + `App`'s signature to wire this exactly; update `UseEngineInput` + `App`'s props type accordingly.

**Tests:**

- `tests/services/engine/wiring/makeRunTierTransition.test.ts` — build a fake `EngineState` in the style of `tests/services/engine/setSourceVisibleFade.test.ts:55-75` (a `createAppStore`-backed `get settings()` plus typed spies for `assetSlots.points` / `assetSlots.mcpm` / `gpu`), call `makeRunTierTransition(state, bootstrapDeps)(prev, next)`:
  - `loads each enabled source whose tierTarget changed`: stub two galaxy-catalog sources where `tierTarget(src, prev) !== tierTarget(src, next)` and both `enabled`; assert each source's `assetSlots.points.get(src).load` was called once with `{ source: src, tier: next, dissolvePrevious: true }`.
  - `skips a source whose tierTarget is unchanged`: a source with equal targets across `prev`/`next` → its slot `.load` not called.
  - `skips a disabled source`: an enabled-off source (its `settings.galaxyCatalogs.items[id].enabled === false`) → `.load` not called even if its target changed.
  - `reloads the MCPM volume`: assert `assetSlots.mcpm.load` called with `{ tier: next }`.
  - `gates the hi-res famous rebuild on device + renderer`: with `bootstrapDeps.phaseLocals.device` undefined OR `gpu.texturedDiskRenderer` null → no rebuild; with both present → rebuild fires (mock `rebuildHiResFamousForTier` to a typed spy and assert it was called with `tier: next`).
  This is the coverage the old `handles/setTier.ts` never had a dedicated test for.

- [ ] Write `makeRunTierTransition.test.ts` (red).
- [ ] Implement `makeRunTierTransition.ts` (relocate the `handles/setTier.ts:42-80` body, minus dispatch/`selectTier`); add `get tier()` + the `EngineState.tier` type; add `EngineCallbacks.setSagaContext`; register the runner in `engine.ts`; thread `setSagaContext` main → App → useEngine → createEngine.
- [ ] `npm run typecheck` clean; `npm test` green.
- [ ] Commit. Stage the created files + `src/services/engine/engine.ts src/@types/engine/state/EngineState.d.ts src/@types/engine/EngineCallbacks.d.ts src/@types/engine/UseEngineInput.d.ts src/main.tsx src/hooks/useEngine.ts src/components/App/App.tsx`. Message: `feat(engine): register runTierTransition into the saga context`.

---

### Task 4: Cut the engine demand reads over to `state.tier`

**Files:** modify `src/services/engine/wiring/reevaluateDemand.ts`, `src/services/engine/wiring/wireImpostorSubsystems.ts`. `buildDemandCtx.ts` is **untouched** — verified: demand rows read tier via `row.req(state.settings.tier)` in `reevaluateDemand`, and `buildDemandCtx.ts` does not carry `.tier` in its `ctx` (no demand predicate reads `ctx.settings.tier`). The implementer should re-grep `.tier` across the demand-predicate files to confirm before declaring `buildDemandCtx` clean; if (and only if) a predicate reads `ctx.settings.tier`, repoint that read too and note it.

**Contracts (mechanical):**

- `reevaluateDemand.ts:70` — `slot.load(row.req(state.settings.tier))` → `slot.load(row.req(state.tier))`.
- `wireImpostorSubsystems.ts:69` — `HI_RES_LAYER_SIDE_BY_TIER[state.settings.tier]` → `HI_RES_LAYER_SIDE_BY_TIER[state.tier]`.

Both reads now hit the store-delegating `state.tier` getter (still equal to `state.settings.tier` until Task 6 removes the settings field — so this task is safe with tier in both places).

- [ ] Repoint both reads. (No new tests; existing demand/impostor tests exercise these paths — confirm they still pass against `state.tier`. If an existing test builds a fake state with `settings.tier` but no `tier`, add a `get tier()` / `tier` field to that fixture.)
- [ ] `npm run typecheck` clean; `npm test` green.
- [ ] Commit. Stage: `src/services/engine/wiring/reevaluateDemand.ts src/services/engine/wiring/wireImpostorSubsystems.ts` (+ any fixture file touched). Message: `refactor(engine): read tier from the root slice in demand wiring`.

---

### Task 5: Cut the write over — App dispatches `requestTier`; delete `handle.sources.setTier`

**Files:** modify `src/components/App/App.tsx`, `src/services/engine/engine.ts`, `src/@types/engine/handles/EngineSourcesHandle.d.ts`; delete `src/services/engine/handles/setTier.ts`. Plus any test asserting `handle.sources.setTier`.

**Contracts:**

- `App.tsx`:
  - Add `const dispatch = useAppDispatch();` (import `useAppDispatch` from `../../store/hooks` — `useAppSelector` is already imported there).
  - `:55` — move `selectTier` out of the `state/settings/selectors` import block and import it from `../../state/tier/selectors`. The `useAppSelector(selectTier)` read at `:119` stays.
  - Import `requestTier` from `../../state/tier/requestTier`.
  - `:360` — `onTierChange={(tier) => handleRef.current?.sources.setTier(tier)}` → `onTierChange={(tier) => dispatch(requestTier(tier))}`. Update the nearby comment (`:355-358`): the tier swap is now an Intent — the UI dispatches `requestTier`; the saga writes `setTier` and runs the transition.
- `engine.ts` — remove the `sources.setTier` handle entry (engine.ts:729) and the `import { setTier } from './handles/setTier'` (engine.ts:130). The `sources` sub-handle keeps `setVisible` / `getCloud` / `getCloudObjIds`.
- `src/@types/engine/handles/EngineSourcesHandle.d.ts` — delete the `setTier: (tier: Tier) => void;` member (line 23) and its docblock line; update the type's top docblock (drop the "`setTier` hot-swaps the active data tier" sentence — tier is now an Intent dispatched from the UI, not a handle method). Remove the now-unused `Tier` import if nothing else in the file uses it (it imports `Tier` only for `setTier` — verify and drop).
- Delete `src/services/engine/handles/setTier.ts` (its body now lives in `makeRunTierTransition.ts`).

- [ ] Delete/repoint any test asserting `handle.sources.setTier` exists or works (grep `setTier` under `tests/services/engine/`). The transition coverage now lives in `makeRunTierTransition.test.ts` (Task 3) and the dispatch→write in `tierSaga.test.ts` (Task 2).
- [ ] Apply the App dispatch swap; remove the handle method + import; delete `handles/setTier.ts`; trim `EngineSourcesHandle`.
- [ ] `npm run typecheck` clean (catches any surviving `setTier` import); `npm test` green.
- [ ] Commit. Stage: `src/components/App/App.tsx src/services/engine/engine.ts src/@types/engine/handles/EngineSourcesHandle.d.ts` + the deleted `src/services/engine/handles/setTier.ts` + any touched test. Message: `refactor(engine): dispatch requestTier from the UI and delete the setTier handle`.

---

### Task 6: Remove `tier` from settings — slice, selectors, initialState, type; seed via preloadedState

**Files:** modify `src/state/settings/settingsSlice.ts`, `src/state/settings/selectors.ts`, `src/state/settings/initialState.ts`, `src/@types/settings/EngineSettingsState.d.ts`, `src/main.tsx`; reconcile settings tests (`tests/store/createAppStore.test.ts`, any `buildInitialSettings` / `settingsSlice` / `selectors` test, the `makeSettingsFixture` helper).

Tier now has readers and writers cut over (Tasks 3-5), so this removes the dead copy. After this task `tier` lives in exactly one place.

**Contracts:**

- `settingsSlice.ts` — delete the `setTier` reducer (lines 181-184) and its export (line 227). The slice's `initialState = buildInitialSettings({ initialTier: 'medium' })` (line 47) becomes `buildInitialSettings()`. Drop the now-unused `Tier` import (line 35) if nothing else in the file references `Tier` (verify — `setTier`'s `PayloadAction<Tier>` was its only use).
- `selectors.ts` — delete `selectTier` (line 57) and its `// --- tier ---` comment block (lines 55-57); drop the `Tier` import (line 49) if unused elsewhere in the file (verify — `selectTier` was its only consumer).
- `initialState.ts` — `buildInitialSettings` drops the `opts: { initialTier }` param and the `tier:` field (lines 50-56). Signature becomes `export function buildInitialSettings(): EngineSettingsState`. Drop the `Tier` import (line 44) if unused. Update the header (lines 14-17): it no longer resolves a tier; the caller seeds tier into the `tier` root slice via `preloadedState`.
- `EngineSettingsState.d.ts` — delete the `tier: Tier;` field (line 77) and its docblock (lines 66-76), plus the cross-cutting-exception paragraph in the type header (lines ~32-37 — the "lone deliberate exception is `tier`" paragraph). Drop the `Tier` import (line 54) if unused. The "no flat-root duplicates" note stays (it now has no exception to carve out).
- `main.tsx:69-70` — seed tier into the tier slice:
  ```ts
  const initialTier = initialTierFromViewport(window.innerWidth);
  const { store, setSagaContext } = createAppStore({
    [tierRoute]: initialTier,
    [settingsRoute]: buildInitialSettings(),
  });
  ```
  Import `tierRoute` from `./store/constants`. `setSagaContext` continues to thread into the engine (Task 3). Update the main.tsx header to mention the tier slice is seeded from the viewport-derived boot tier.

**Tests to reconcile:**

- `tests/store/createAppStore.test.ts` — the `returns a store seeded with settings initialState` test compares against `buildInitialSettings({ initialTier: 'medium' })`; change to `buildInitialSettings()`. The `honours preloadedState` test asserted `settings.tier === 'large'`; replace with the `tier`-slice seed assertion added in Task 2 (`store.getState().tier`), and drop the settings-tier assertion. Confirm no test still reads `settings.tier`.
- `makeSettingsFixture` / `makeSettings` helpers + any `settingsSlice`/`selectors`/`buildInitialSettings` test — drop their `tier` assertions / `initialTier` args. Grep `settings.tier` and `initialTier` across `tests/` and reconcile every hit.

- [ ] Grep `settings.tier`, `initialTier`, `selectTier` across `src/` + `tests/`; confirm the only remaining `selectTier` references resolve to `state/tier/selectors` (App, the saga, the saga test) and no `settings.tier` / `initialTier` survive after the edits.
- [ ] Apply the deletions + `buildInitialSettings()` signature + `main.tsx` seed; reconcile the tests.
- [ ] `npm run typecheck` clean; `npm test` green.
- [ ] Commit. Stage: `src/state/settings/settingsSlice.ts src/state/settings/selectors.ts src/state/settings/initialState.ts src/@types/settings/EngineSettingsState.d.ts src/main.tsx` + the reconciled test files. Message: `refactor(settings): remove tier from the settings slice — it lives in its own root slice now`.

---

## Definition of Done (the `/feature-done` gate)

- [ ] `npm test` — full suite green.
- [ ] `npm run typecheck` — both tsconfigs clean.
- [ ] No `TODO` / placeholder in any changed file.
- [ ] `grep -rn "settings.tier\|initialTier" src/ tests/` → empty (tier no longer lives in settings; `buildInitialSettings()` takes no arg).
- [ ] `grep -rn "selectTier" src/` → resolves only to `state/tier/selectors` consumers (App, `tierSaga`); no `state/settings/selectors` export survives.
- [ ] `grep -rn "sources.setTier\|handles/setTier" src/ tests/` → empty (handle method + file deleted).
- [ ] `state.tier` reads from `store.getState().tier`; `setTier` (the tier-slice reducer) is the ONLY writer of `state.tier`; `requestTier` has no reducer.
- [ ] `createAppStore(...)` returns `{ store, setSagaContext }`; all 13 call sites destructure `{ store }`; the engine registers `runTierTransition` via `cb.setSagaContext`.
- [ ] **Smoke-test attestation** (ask the user to look — dev server stays running, don't kill it): the tier dropdown swaps data resolution (galaxy catalogs re-fetch + fade the old tier out, MCPM volume reloads, the dropdown reflects the new tier); a same-tier re-select is a visible no-op (no flicker / no famous-texture rebuild); the SettingsPanel and the rest of the HUD continue to track.
- [ ] **Deferred (NOT in this plan — note, do not implement):**
  - Selection re-anchoring across a tier swap (selection is still in `selectionSubsystem.ts`, not the store — nothing to re-anchor; the fold later adds lines inside `watchTier`).
  - The `tierChanged` completion event (no consumer yet — YAGNI until the selection fold lands).
  - Converging other settings effects onto the saga (only `tier` triggers an orchestrated load/evict/rebuild; the asymmetry is essential).
  - Making `runTierTransition` async / cancellable (today's transition work is fire-and-forget; revisit only if a step becomes genuinely awaitable).
