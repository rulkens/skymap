# Tier out of settings — a root slice + `requestTier` saga (design)

> **Status:** approved design, awaiting implementation plan.
> **Why this exists:** `tier` is the cross-cutting data-resolution preset, yet it
> lives as a flat field inside the `settings` slice, and the tier→data-load
> reaction is an imperative tangle inside one handle. Promoting `tier` to its own
> root slice and turning the change into a `requestTier` Intent action + a
> transition saga is the **tier-promotion + saga-seam half of the
> [selection-into-intent-store spec](./2026-06-18-selection-into-intent-store-design.md)
> (§2 + §8), pulled forward** as a standalone cleanup. It also stands up the first
> real saga on the empty seam wired by the RTK migration, proving the
> `typed-redux-saga` vehicle on the orchestrated edge ADR 0007 said it suits.

## Scope

Move `tier` out of `EngineSettings` into its own `RootState` slice, and replace
the imperative `setTier` handle with a **command/write split** driven by a saga:

1. **`tier` is its own root slice.** `RootState` grows a `tier: Tier` field; the
   `settings` slice loses it. Its own lifecycle — a settings/tour `restoreSettings`
   round-trip must not sweep up the data-resolution level.
2. **`requestTier` is the command; `setTier` is the write.** `requestTier(tier)` is
   a reducer-less action the UI dispatches; the `setTier` reducer is dispatched by
   the saga, not the UI.
3. **The transition is a saga.** A `takeLatest(requestTier)` worker reads the
   previous tier, writes the new one, and calls `runTierTransition(prev, next)` —
   the extracted, dispatch-free body of today's `setTier` handle.
4. **The runner crosses the boundary via saga context.** The store can't reach the
   engine's GPU resources, so the engine registers `runTierTransition` (closed over
   live `EngineState`) into the saga's context through a `setSagaContext` setter the
   store factory exposes.

**Out of scope (do not scope-creep):**

- **Selection re-anchoring.** The headline reason §8 makes tier a saga is to
  re-anchor selection across a tier swap (capture durable focus-ids before
  eviction, re-resolve after). Selection is not in the store yet — it still lives
  in `selectionSubsystem.ts` — so there is nothing to re-anchor. The selection fold
  later **adds lines inside this worker**; nothing here is reworked. See
  "Relationship to the selection fold."
- **`tierChanged` completion event.** §8 emits a `tierChanged` event for downstream
  reactions. There is no consumer yet (selection is its first), so it is omitted —
  YAGNI. It is added when the selection fold lands.
- **Converging other effects onto the saga.** Settings toggles
  (`setGalaxyCatalogVisible`, etc.) stay on their handle setters; only `tier` moves
  to a dispatched command, because only `tier` triggers an orchestrated
  load/evict/rebuild. This asymmetry is essential (orchestrated vs. plain write),
  not drift.
- Any **camera / tween / rendering** behaviour change. The transition work
  (`.load`, MCPM reload, hi-res famous rebuild) is moved verbatim, not altered.

---

## 1. The store shape

`tier` leaves `EngineSettingsState` and becomes a root slice:

```ts
export type RootState = {
  tier: Tier; // promoted: own lifecycle, not swept by a settings restore
  settings: EngineSettingsState; // tier field removed; knobs only
};
```

New `src/state/tier/`:

- `tierSlice.ts` — `createSlice({ name: 'tier', initialState: 'medium' as Tier, reducers: { setTier } })`.
  The slice's `initialState` is a plain default; `main.tsx` overrides it with the
  viewport-derived tier via `preloadedState`.
- `selectors.ts` — `export const selectTier = (state: RootState): Tier => state.tier;`
  (consolidated selectors file, matching the settings convention — overrides
  one-fn-per-file for selectors, as the RTK migration established).
- `requestTier.ts` — `export const requestTier = createAction<Tier>('tier/requestTier');`
  A **reducer-less** command action. Dispatching it does not change the store; it
  only triggers the saga.
- `tierSaga.ts` — `export function* watchTier()` (the `takeLatest` worker, §3).

`src/store/constants.ts` gains `export const tierRoute = 'tier';`. `rootReducer`
(`combineReducers`) wires `[tierRoute]: tierReducer`. `RootState` in
`src/store/types.ts` grows the `tier` field.

The blast-radius worry — "every settings selector now needs `s.settings.…`" —
does not apply: settings selectors already read `s.settings` (the RTK migration
nested them). Only the handful of *tier* readers move (§4).

---

## 2. The command / write split

The subtle part of selection-spec §8 is left implicit, and naming it is the point
of this design. Today's `setTier` handle reads `prevTier = selectTier()` to diff
which sources changed tier-target. If `requestTier` mutated the store first, `prev`
would already equal the new value and the diff would be empty — a silent bug. The
spec's "`requestTier` → reducer sets `state.tier` → effect fires" sketch hides this.

Un-braid it by splitting **command** from **write**:

- **`requestTier(tier)`** — command action, **no reducer**. The store is unchanged
  on dispatch; it is purely the saga's trigger.
- **`setTier(tier)`** — the slice reducer write, dispatched **by the saga**.

The saga captures `prev` *before* the write and hands both tiers to the runner
explicitly, so the reconciliation never reads the store and the "which value is
`tier` right now?" ambiguity cannot arise.

This also fixes a latent bug: today's handle rebuilds the hi-res famous texture
*unconditionally* (the per-source `tierTarget` guard skips the loads on a same-tier
re-select, but the famous rebuild runs anyway). The saga's `prev === payload`
early-return kills that wasted rebuild.

---

## 3. The saga

```ts
// src/state/tier/tierSaga.ts — composed into the (now non-empty) mainSaga
import { takeLatest, select, put, getContext } from 'typed-redux-saga';
import { requestTier } from './requestTier';
import { setTier } from './tierSlice';
import { selectTier } from './selectors';
import type { RunTierTransition } from '../../store/types';

export function* watchTier() {
  yield* takeLatest(requestTier, function* (action) {
    const prev = yield* select(selectTier); // still old: requestTier has no reducer
    if (prev === action.payload) return; // same-tier no-op (today rebuilds famous needlessly)
    const run = yield* getContext<RunTierTransition>('runTierTransition');
    yield* put(setTier(action.payload)); // dropdown updates now (desired tier = Intent)
    run?.(prev, action.payload); // evict + load + MCPM + famous, given both tiers
  });
}
```

`src/store/rootSaga.ts` composes it: `yield* all([watchTier()])` (replacing the
empty `all([])`). The watcher lives with its slice in `src/state/tier/`; the root
saga only composes — "central mainSaga" in the sense of one root that forks feature
sagas, each authored beside its slice.

`run?.(…)` is the defensive no-op: the runner is registered during engine boot,
which always completes before the tier dropdown is interactive, so in practice the
context is always present. The `?.` guards the impossible-but-cheap-to-handle case
of a `requestTier` before registration (e.g. a future deep-link path) rather than
throwing.

### Sync vs. async (verify in planning, shape unchanged either way)

Today's transition work is fire-and-forget: `slot.load(...)` and
`mcpm.load(...)` kick self-managed async loads and return; the famous rebuild
appears synchronous. So `runTierTransition` is **sync** and `takeLatest` guarantees
latest-wins *ordering* of the writes and load-kicks under rapid flips.

If planning finds any step is genuinely awaitable and worth cancelling mid-flight,
`runTierTransition` returns `Promise<void>` and the worker becomes
`yield* call(run, prev, action.payload)` — `takeLatest` then cancels a superseded
transition. The action/selector/effect shapes are identical either way; only the
`run(...)` vs. `yield* call(run, ...)` line differs.

---

## 4. `runTierTransition` — the extracted effect, reached via saga context

Today's `src/services/engine/handles/setTier.ts` body becomes a factory in
engine-land:

```ts
// src/services/engine/wiring/makeRunTierTransition.ts
export function makeRunTierTransition(state: EngineState): RunTierTransition {
  return (prevTier, nextTier) => {
    // identical to today's setTier body, minus the dispatch:
    //   for each non-synthetic galaxy source whose tierTarget changed AND is enabled:
    //     state.assetSlots.points.get(src)?.load({ source: src, tier: nextTier, dissolvePrevious: true });
    //   state.assetSlots.mcpm?.load({ tier: nextTier });
    //   if (state.gpu.device && state.gpu.texturedDiskRenderer) rebuildHiResFamousForTier({ ... });
  };
}
```

Two changes from the handle: it takes `(prevTier, nextTier)` instead of reading
`selectTier`, and it **does not dispatch** (the saga owns the write). `device` is
read live off `state.gpu` inside the closure — correct even though GPU init lands
after store creation.

The engine registers it across the store↔engine boundary via the context setter:

```ts
// src/store/createAppStore.ts — now returns the store AND the context setter:
export function createAppStore(preloadedState?: Partial<RootState>): {
  store: AppStore;
  setSagaContext: SetSagaContext;
} {
  const sagaMiddleware = createSagaMiddleware();
  const store = configureStore({ reducer: rootReducer, preloadedState, middleware: ... });
  sagaMiddleware.run(mainSaga);
  return { store, setSagaContext: (ctx) => sagaMiddleware.setContext(ctx) };
}
```

```tsx
// src/main.tsx — setSagaContext rides its OWN React context, the mirror of the
// redux <Provider> that carries the store. App stays prop-less.
const { store, setSagaContext } = createAppStore({
  [tierRoute]: initialTier,
  [settingsRoute]: buildInitialSettings(),
});
<Provider store={store}>
  <SagaContextProvider value={setSagaContext}>
    <App />
  </SagaContextProvider>
</Provider>;

// src/hooks/useEngine.ts — obtains BOTH from context seams, symmetric:
const store = useAppStore(); // from the redux <Provider>
const setSagaContext = useSetSagaContext(); // from <SagaContextProvider>
createEngine(canvas, { store, setSagaContext, ... });

// engine wiring, after EngineState exists:
cb.setSagaContext({ runTierTransition: makeRunTierTransition(state, bootstrapDeps) });
```

`EngineCallbacks` gains `setSagaContext: SetSagaContext`. The contract types live
in `src/store/types.ts` (same home as `AppStore`, which is `src/store`'s job — the
one-type-per-file rule governs `src/@types/`, not `src/store/`):

```ts
export type RunTierTransition = (prevTier: Tier, nextTier: Tier) => void;
export type SagaContext = { runTierTransition: RunTierTransition };
export type SetSagaContext = (ctx: Partial<SagaContext>) => void;
```

`setSagaContext` is returned **alongside** the store, not bolted onto it: the store
is a state container; registering a saga's runner is a distinct capability, kept as
its own value so the two concerns stay un-braided. It reaches `useEngine` through a
dedicated **`SagaContextProvider`** (`src/store/SagaContextProvider.tsx`) — a small
React context that is the mirror of the redux `<Provider>`: `useEngine` reads the
store from `useAppStore()` and the setter from `useSetSagaContext()`, symmetrically.
This keeps `App` prop-less (no infrastructure handle drilled through the root
component) while still avoiding the store-attachment that would re-braid the two.
`EngineCallbacks` carries `setSagaContext: SetSagaContext` (the engine receives it as
a `createEngine` option); `UseEngineInput` does **not** — the hook sources it itself.
The contract types (`RunTierTransition` / `SagaContext` / `SetSagaContext`) live in
`src/store/types.ts` (same home as `AppStore`; the one-type-per-file rule governs
`src/@types/`, not `src/store/`).

---

## 5. Read / write migration (mechanical)

**Writes:**

- `src/components/App/App.tsx:360` — `handleRef.current?.sources.setTier(tier)` →
  `dispatch(requestTier(tier))` (via `useAppDispatch`).
- `handle.sources.setTier` — **deleted.** Once the UI dispatches directly, the
  handle method is a pure proxy (delete-the-proxy-surface).

**Reads** (was `state.settings.tier`):

- `src/components/App/App.tsx:119` — `useAppSelector(selectTier)`, import path →
  `state/tier/selectors`.
- `src/services/engine/wiring/wireImpostorSubsystems.ts:69` —
  `selectTier(store.getState())` for the boot `layerSide`.
- `src/services/engine/wiring/reevaluateDemand.ts:70` —
  `row.req(selectTier(store.getState()))`.
- `src/services/engine/wiring/buildDemandCtx.ts` — stops carrying tier inside the
  `settings` snapshot; demand reads tier from the store root instead.

**Seed:**

- `buildInitialSettings` loses its `initialTier` param (tier was its only consumer);
  `main.tsx` seeds `tier` into `preloadedState` directly.

---

## 6. Relationship to the selection fold (no rework)

This is a strict subset of selection-spec §2 + §8: the same slice promotion, the
same `requestTier` / `setTier` / `takeLatest` shapes, the same `runTierTransition`
reuse. When the selection fold lands it only **adds lines inside the existing
worker** —

```ts
yield* takeLatest(requestTier, function* (action) {
  const prev = yield* select(selectTier);
  if (prev === action.payload) return;
  const run = yield* getContext<RunTierTransition>('runTierTransition');
  // + const reanchor = captureGalaxyFocusIds(yield* select(selectSelection), galaxies);
  // + yield* put(selectionActions.hover(null));
  yield* put(setTier(action.payload));
  run?.(prev, action.payload);
  // + for (const [slot, id] of reanchor) yield* put(selectionActions[slot](resolveFocusId(id, galaxies)));
  // + yield* put(tierChanged(action.payload));
});
```

— plus the `tierChanged` event. Nothing built here is rewritten; the fold extends.

---

## 7. Blast radius

**Add:**
`src/state/tier/{tierSlice,selectors,requestTier,tierSaga}.ts`;
`RunTierTransition` / `SagaContext` / `SetSagaContext` in `src/store/types.ts`;
`tierRoute` in `src/store/constants.ts`;
`src/services/engine/wiring/makeRunTierTransition.ts`;
`src/store/SagaContextProvider.tsx` (the context + `useSetSagaContext` hook).

**Rework:**
`src/store/rootReducer.ts` (+tier route), `src/store/rootSaga.ts` (compose
`watchTier`), `src/store/createAppStore.ts` (return `{store, setSagaContext}`),
`src/main.tsx` (wrap `<SagaContextProvider>`), `src/hooks/useEngine.ts` (read
`useSetSagaContext()`), `src/@types/engine/EngineCallbacks.d.ts` (+`setSagaContext`),
engine wiring (register runner), `src/services/engine/handles/setTier.ts` → deleted,
its body relocated to `makeRunTierTransition`, `src/components/App/App.tsx` (tier
dispatch only — App is NOT touched for `setSagaContext`),
`wireImpostorSubsystems.ts`, `reevaluateDemand.ts`, `buildDemandCtx.ts`,
`buildInitialSettings.ts`, `src/@types/settings/EngineSettingsState.d.ts` (−tier),
`src/state/settings/settingsSlice.ts` (−`setTier`), `src/state/settings/selectors.ts`
(−`selectTier`).

**Delete:**
`handle.sources.setTier` method; `setTier` from the settings slice/selectors/state.

**Unchanged:** every settings consumer (already `.settings`-scoped); the transition
work itself; all rendering.

---

## 8. Testing

- **Slice:** `setTier` sets `state.tier`; `requestTier` leaves the store unchanged
  (no reducer case).
- **Saga:** a real `configureStore` + saga middleware, `setContext({ runTierTransition: vi.fn<RunTierTransition>() })`,
  dispatch `requestTier('large')`, assert `selectTier(store.getState()) === 'large'`
  and the runner was called with `(prev, 'large')`; assert a same-tier
  `requestTier` is a no-op (runner not called, no famous rebuild).
- **Effect:** `makeRunTierTransition` against a fake `EngineState` — asserts the
  diffed `.load` calls per source, MCPM reload, and famous rebuild gate. This is the
  old `setTier`-handle test repointed, minus the dispatch assertion.
- **Settings:** `settingsSlice` / `buildInitialSettings` tests drop their tier
  assertions.

---

## 9. Build order (suite green at each step)

1. **`tier` slice** + `selectTier` + `requestTier` action; wire `tierRoute` into
   `rootReducer` and `RootState`. Additive — `tier` lives in *both* places briefly;
   suite stays green.
2. **`createAppStore` → `{store, setSagaContext}`**; add `SagaContext` /
   `SetSagaContext` / `RunTierTransition`; `mainSaga` composes `watchTier` (runner
   not yet registered → guarded no-op). Update `main.tsx` + `createAppStore` callers.
3. **Extract `makeRunTierTransition`** from the setTier handle body; engine registers
   it via `setSagaContext` at wiring.
4. **Cut reads over** to the root `selectTier` (`App`, `wireImpostorSubsystems`,
   `reevaluateDemand`, `buildDemandCtx`).
5. **Cut the write over**: `App` dispatches `requestTier`; delete
   `handle.sources.setTier` and the old `handles/setTier.ts`.
6. **Remove `tier` from settings**: `EngineSettingsState`, `buildInitialSettings`,
   the settings slice + selectors; reconcile tests. `tier` now lives in exactly one
   place.

---

## References

- [Selection into the Intent Store](./2026-06-18-selection-into-intent-store-design.md)
  — §2 (tier promoted to `RootState`) and §8 (`requestTier` + transition effect);
  this design is that half, pulled forward, minus selection re-anchor.
- [ADR 0007 — intent-centric state + effects](../../adrs/0007-intent-centric-state-and-effects.md)
  — the effects-layer direction; this is the first saga on the seam. The vehicle
  question (ADR 0008) is answered for *this edge*: `typed-redux-saga`, the
  orchestrated-edge sweet spot the ADR names.
- [`intent.md`](../../superpowers/conventions/intent.md) — `tier` as Intent
  (serializable, single write path); the resource reconciliation as the effect.
</content>
</invoke>
