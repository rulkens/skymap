# Settings store → Redux Toolkit (injected store, phase 1)

**Status:** specced — awaiting plan
**Date:** 2026-06-18
**Related:** ADR 0007 (intent-centric state), ADR 0008 (effects-layer vehicle — open),
`docs/superpowers/conventions/intent.md`, the selection→Intent-store spec
(`2026-06-18-selection-into-intent-store-design.md`)
**Reference implementation:** `~/Development/js/repperjs/packages/motif-segmentation`
(`src/store/store.ts`, `src/store/hooks.ts`, `src/state/<feature>/`)

---

## Why

The engine owns a single authoritative settings store, today a `zustand/vanilla`
store. The intent-centric direction (ADR 0007) and the in-flight selection fold both
assume a Redux Toolkit (+ `typed-redux-saga`) vehicle so effects (render-wake, fades,
tier re-anchoring, tour orchestration) can live on a saga seam instead of being
threaded imperatively through every setter.

This migration also **changes store ownership**. Today the engine *creates* the store
on boot and React reaches it asynchronously through the engine handle — which is why
`useSettingsStore` carries a `handleRef` null-window + per-call-site `fallback` +
hand-rolled `useSyncExternalStore`. Instead, the store is **created at the app root and
injected into `createEngine`**, and React consumes the *same* instance through
react-redux `<Provider>`. That dissolves the whole async-handoff adapter.

The current store was deliberately built in the redux idiom (pure reducers, thin action
wrappers, pure selectors, one React seam) precisely so this is tractable. We adopt the
reference implementation's conventions **from the start** rather than landing a minimal
swap and reshaping later.

### The arc collapses to two phases

Originally framed as four steps (RTK swap → inject on boot → structural cleanup + saga
→ React adapter). With the store injected and the reference layout adopted up front,
old steps 2 and 4 fold into phase 1:

- **Phase 1 (this spec):** full RTK vehicle, reference layout, store injected at the app
  root, React on `<Provider>` + `useAppSelector`. Behaviour held identical; the saga
  middleware is wired but its root saga is empty. `zustand` removed.
- **Phase 2 (backlog):** move the *effects* onto the saga seam (render-wake,
  fade-triggering, `requestTier` re-anchor, demand-loads), promote `tier` to the root,
  and add the `selection` / `dataStatus` slices (the intent folds).

---

## Current state (what we're migrating)

- `src/services/engine/settingsStore/createSettingsStore.ts` —
  `createStore<EngineSettingsState>(() => initial)` (zustand vanilla), constructed *in*
  `engine.ts` and exposed as `handle.settingsStore`.
- `reducers/*.ts` — 29 pure copy-on-write reducers; `actions/*.ts` — 29 thin
  `store.setState` wrappers; `selectors/*.ts` — 25 pure selectors. Plus
  `mergeSettingsSnapshot` (restore/effect merge) and three `project*` helpers.
- `wiring/settingsTable.ts` — `buildSettersFromTable` emits the "boring" handle setters
  as `action(store, v); requestRender()`.
- `wiring/restoreSettings.ts` / `wiring/applyEffect.ts` — `store.setState(mergeSnapshot)`.
- `src/hooks/useSettingsStore.ts` — the React seam: `handleRef` null-window +
  `fallback` + `useSyncExternalStore`.
- `zustand` is imported by **only the 7 settings-store files**; the data stores are
  plain objects. So phase 1 removes `zustand` entirely.
- `EngineSettingsState.debug.disabledPasses` is a `ReadonlySet<string>` — the one
  non-serializable field.

---

## Design

### Ownership: created at the app root, injected into the engine

```ts
// main.tsx (contract sketch)
const store = createAppStore(buildPreloadedState(resolveInitialTier()));
root.render(
  <Provider store={store}>
    <App />
  </Provider>,
);

// useEngine (effect) — the SAME Provider instance, no second store
const store = useStore<RootState>();
createEngine({ store, /* …existing deps */ });

// createEngine — no longer constructs a store
get settings() { return store.getState().settings; }   // every state.settings.X read unchanged
```

A `createAppStore()` **factory** (not the reference's module singleton): skymap's tests
construct engines repeatedly, so a shared singleton would leak state across tests. It is
called **once** in `main.tsx`; tests make throwaway stores.

The store is injected through `createEngine`'s input (threaded via the bootstrap deps).
`handle.settingsStore` is **removed from the public handle** — React no longer reads
through the handle; the engine keeps its own injected reference for dispatch.

### Dependencies

Add `@reduxjs/toolkit`, `react-redux`, `redux-saga`, `typed-redux-saga`. Remove
`zustand`. `services/` stays React-free: it imports only `@reduxjs/toolkit` /
saga (the store factory + slice + selectors); `react-redux` lives in `main.tsx` +
`hooks/` + `components/`.

### Layout (reference conventions, from the start)

```
src/store/
  createAppStore.ts     configureStore(rootReducer) + saga middleware + run(rootSaga); factory
  rootReducer.ts        combineReducers({ [settingsRoute]: settingsReducer })
  constants.ts          settingsRoute = 'settings'  (+ future selection/dataStatus routes)
  rootSaga.ts           empty mainSaga (yield* all([])) — forks nothing yet
  hooks.ts              typed useAppDispatch / useAppSelector (react-redux)
  types.ts              RootState = ReturnType<typeof rootReducer>; AppStore; AppDispatch
src/state/settings/
  settingsSlice.ts      createSlice — inline Immer reducers, payload-object actions
  initialState.ts       the boot-time EngineSettingsState literal (today's buildInitialSettings)
  selectors.ts          RootState-scoped base + derived createSelector selectors
```

`combineReducers` keyed by a route constant gives `RootState = { settings:
EngineSettingsState }` — the forward-compatible shape the selection fold extends with
sibling slices.

### The slice — inline Immer reducers

`settingsSlice.ts` via `createSlice`, reducers **inlined as Immer draft-mutations**
(matching the reference), actions taking a single payload object:

```ts
// contract sketch — not final
const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setBrightness: (settings, action: PayloadAction<number>) => { settings.galaxyCatalogs.brightness = action.payload; },
    setGalaxyCatalogVisible: (settings, action: PayloadAction<{ id: GalaxyCatalogId; enabled: boolean }>) => {
      settings.galaxyCatalogs.items[action.payload.id].enabled = action.payload.enabled;
    },
    setPassDisabled: (settings, action: PayloadAction<{ pass: string; disabled: boolean }>) => {
      settings.debug.disabledPasses[action.payload.pass] = action.payload.disabled; // plain object, see below
    },
    mergeSnapshot: (settings, action: PayloadAction<Partial<SettingsSnapshot>>) => mergeSettingsSnapshot(settings, action.payload),
    // …one row per existing reducer; RTK generates the action creators
  },
});
```

- The 29 reducer free-functions and 29 action wrappers are **deleted**; their logic
  moves inline. Immer gives structural sharing automatically, so the ref-stability the
  old copy-on-write reducers hand-maintained (untouched clusters keep their reference →
  React selectors skip re-render) is preserved for free.
- `mergeSettingsSnapshot` stays a free function (structural `structuredClone` merge) and
  is called from the `mergeSnapshot` case reducer (Immer permits returning new state).
- The `project*` helpers stay; they feed selectors.

### `disabledPasses`: `Set` → plain object (serializable)

`EngineSettingsState.debug.disabledPasses` changes from `ReadonlySet<string>` to
`Record<string, boolean>` (keyed by pass name → disabled). This makes the **entire
settings state serializable**, so there is **no `serializableCheck` exception** and no
Immer `enableMapSet`. Touch points: the `setPassDisabled` reducer
(`s.debug.disabledPasses[pass] = disabled`), `initialState` (`disabledPasses: {}`),
`selectDisabledPasses`, and the frame encoders that read it — `disabledPasses.has(name)`
→ `disabledPasses[name] === true`. (This retires the backlogged `Set→Record` cleanup.)

### Selectors — one module, RootState-scoped

The 25 one-per-file selectors consolidate into `src/state/settings/selectors.ts` as a
base + derived chain (reference style):

```ts
export const selectSettings = (s: RootState) => s[settingsRoute];
export const selectBrightness = createSelector(selectSettings, (x) => x.galaxyCatalogs.brightness);
export const selectVisibleSourceMask = createSelector(selectSettings, deriveVisibleSourceMask);
// …
```

RootState-scoped selectors drop straight into `useAppSelector(selectX)` and into
engine-side reads (`selectTier(store.getState())`).

### Saga — wired, empty

`createAppStore` builds a `sagaMiddleware`, `.concat`s it onto the default middleware,
and calls `sagaMiddleware.run(mainSaga)`. `rootSaga.ts`'s `mainSaga` forks nothing yet —
the seam exists so phase 2 adds feature sagas without re-plumbing the store. Render-wake
stays **imperative** (handle setters call `requestRender()`) until phase 2 moves it onto
a saga.

### React — Provider, `useAppSelector`, delete the adapter

- `main.tsx` wraps `<Provider store={store}>`.
- **Reads:** every `useSettingsStore(handleRef, selectX, fallback)` call site becomes
  `useAppSelector(selectX)`. The `fallback` arg disappears (the store exists before
  first paint under the Provider). `useSettingsStore.ts` is **deleted**.
- **Writes:** stay on the engine handle setters (`handle.setBrightness(v)` →
  `store.dispatch(setBrightness(v)); requestRender()`), unchanged this phase. Components
  read via react-redux and write via the handle, transitionally — exactly today's split,
  with the read mechanism swapped. (Phase 2 moves writes/wake onto the saga seam.)

### Writes — dispatch, wake unchanged

`settingsTable.ts` rows reference the slice action creators;
`buildSettersFromTable` does `store.dispatch(action(value)); requestRender()`. Bespoke
setters (`setTier`, `setSourceVisible`, `flow.set`, `setBiasMode`,
`setFilamentsEnabled`, `setMilkyWayEnabled`) dispatch their slice action then run their
existing side effects. `restoreSettings` / `applyEffect` dispatch `mergeSnapshot(patch)`.

---

## Decisions (confirmed)

1. **Full reference layout from the start** — `src/store/` + `src/state/settings/`,
   `combineReducers` by route key, RootState-scoped base+derived selectors in one
   `selectors.ts`.
2. **Inline Immer reducers** in the slice (delete the 29 reducer + 29 action files).
3. **Saga scaffolded now** — middleware wired, `mainSaga` empty.
4. **Store injected at the app root**, not engine-owned; `<Provider>` + react-redux
   hooks now; `useSettingsStore` deleted; `handle.settingsStore` removed.
5. **`createAppStore` factory**, called once in `main.tsx` (not a module singleton —
   test isolation).
6. **`disabledPasses` Set → `Record<string, boolean>`** — whole settings state
   serializable; no `serializableCheck` exception.
7. **`tier` stays in the settings slice** this phase; promotion to root is the
   selection fold's concern (phase 2).

---

## Blast radius

**Add**
- `src/store/{createAppStore,rootReducer,constants,rootSaga,hooks,types}.ts`.
- `src/state/settings/{settingsSlice,initialState,selectors}.ts`.
- deps: `@reduxjs/toolkit`, `react-redux`, `redux-saga`, `typed-redux-saga`.

**Edit**
- `main.tsx` — create store, `<Provider>`.
- `useEngine` — `useStore()`, pass store into `createEngine`.
- `createEngine` / bootstrap deps / `UseEngineInput` — accept injected `store`;
  `get settings()` → `store.getState().settings`; stop constructing the store.
- `EngineHandle.d.ts` — drop `settingsStore`.
- `EngineSettingsState.d.ts` — `disabledPasses: Record<string, boolean>`.
- `settingsTable.ts`, bespoke handle setters, `restoreSettings.ts`, `applyEffect.ts` —
  dispatch slice actions.
- `setTier.ts` — `selectTier(store.getState())` (RootState-scoped).
- every `useSettingsStore` consumer (App.tsx + settings/debug components) →
  `useAppSelector`.
- frame encoders reading `disabledPasses` — `.has(n)` → `[n] === true`.

**Delete**
- 29 `reducers/*.ts`, 29 `actions/*.ts`, 25 `selectors/*.ts`,
  `createSettingsStore.ts`, `buildInitialSettings.ts` (→ `initialState.ts`),
  `src/hooks/useSettingsStore.ts`.
- `zustand` from `package.json`.

**Test reorg** (28 reducer + 27 action + 24 selector + the hook/round-trip suites)
- action + reducer tests → `tests/state/settings/settingsSlice.test.ts` (dispatch →
  assert state); the assertions are preserved, the invocation changes from
  `reducer(s, x)` to `reducer(s, action(x))`.
- selector tests → `tests/state/settings/selectors.test.ts` (RootState-scoped).
- `createAppStore` construction + round-trip test (settingsTable dispatch +
  requestRender; capture→restore→apply-effect).
- `useSettingsStore.test.ts` deleted; React-read coverage becomes a `<Provider>` +
  `useAppSelector` render test.

**Untouched**
- every `state.settings.X` read across the frame/render pipeline (except the
  `disabledPasses` membership idiom).
- the `requestRender` render-wake behaviour.

---

## Build order

1. Deps in; `src/store/` skeleton (`constants`, `rootReducer`, `types`, empty
   `rootSaga`, `createAppStore` with saga middleware, `hooks`). Test: construct + a
   round-trip dispatch + saga runs.
2. `EngineSettingsState.disabledPasses` → `Record<string, boolean>`; update the frame
   encoders + `selectDisabledPasses` + fixtures.
3. `src/state/settings/`: `initialState.ts` (from `buildInitialSettings`),
   `settingsSlice.ts` (inline Immer reducers + `mergeSnapshot`), `selectors.ts`
   (RootState-scoped). Slice + selector tests green.
4. Inject: `createEngine`/bootstrap deps accept `store`; `get settings()` repoint; drop
   `handle.settingsStore`. Repoint the write path (`settingsTable`, bespoke setters,
   `restoreSettings`, `applyEffect`) to `dispatch`. `setTier` read repoint.
5. `main.tsx` `<Provider>`; `useEngine` `useStore()` → `createEngine`; migrate every
   `useSettingsStore` consumer to `useAppSelector`; delete `useSettingsStore.ts`.
6. Delete the obsolete reducer/action/selector files + `createSettingsStore.ts`; remove
   `zustand`; reorganize tests.
7. Full `npm run typecheck` + `npm test` green; manual smoke — settings panel toggles,
   debug pass toggles, and tour capture/restore still drive the renderer.

---

## Non-goals (phase 2 — backlog)

- Move effects onto the saga seam: render-wake, fade-triggering, `requestTier`
  re-anchor, demand-loads. Components dispatch directly once wake is a saga.
- Promote `tier` to the root; add `selection` / `dataStatus` slices (the intent folds).
- Migrate the data stores (`createGalaxyStore` / `createStructureStore`) — not zustand,
  out of scope.

---

## References

- ADR 0007 — intent-centric state and effects; `docs/superpowers/conventions/intent.md`.
- `2026-06-18-selection-into-intent-store-design.md` — the first *intent* fold this
  vehicle unblocks.
- Reference: `~/Development/js/repperjs/packages/motif-segmentation`.

**Next step after review:** `writing-plans`.
