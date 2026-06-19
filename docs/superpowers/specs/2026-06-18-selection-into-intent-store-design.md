# Selection into the Intent Store (design)

> **Status:** approved design, awaiting implementation plan. **Revised** to target
> the RTK store that has since landed (the zustand→RTK migration and the first
> `requestTier`/`tierSaga`/`SagaContext` slice are now on `main`).
> **Why this exists:** selection (hover → select → focus) is the cleanest
> illustration of the scattered-authoritative-state pattern
> [ADR 0007](../../adrs/0007-intent-centric-state-and-effects.md) names: the
> targets live in a subsystem closure (`selectionSubsystem.ts`), React keeps a
> parallel `useState` copy, and the two are reconciled by echo callbacks
> (`onHoverChange` / `onSelectChange` / `onFocusChange`). That is two
> authoritative homes plus a mirror — the exact shape `intent.md` #2 forbids. This
> spec folds selection into the engine Intent store as the **first
> application-state fold** (the `tier` slice was the infrastructure
> proof-of-shape), and in doing so collapses the stray `engine.ts` entry points
> (`selectFamous`, `selectByAlias`, `focusOn`) the cleanup was originally about.
> Grounded in the grill session
> [`docs/grill-sessions/selection-into-intent-store-2026-06-18.md`](../../grill-sessions/selection-into-intent-store-2026-06-18.md).

## What changed since the first draft (and why this is now simpler)

The original draft was deliberately **vehicle-agnostic**: it targeted "the current
zustand-vanilla store," showed every effect "both ways" (a hand-rolled listener vs.
typed-redux-saga), and deferred the vehicle to a never-written ADR 0008. That
hedging is now moot. The store landed as **Redux Toolkit, injected at the app
root**, and the **first feature saga** (`requestTier` command → `tierSaga` watcher
→ engine-owned `runTierTransition` reached via injected `SagaContext`) landed with
it. So the vehicle is **decided**: RTK `createSlice` + `typed-redux-saga`, and the
infrastructure this fold needs already exists:

- **`combineReducers` with route constants** (`settingsRoute`, `tierRoute`). Adding
  a slice is an additive edit to `rootReducer` + `constants`; `RootState` follows the
  combine automatically. The draft's §2 "blast radius — every settings selector now
  needs `s.settings.…`" worry is **gone**: settings is already its own route and
  every consumer already reads it through scoped `useAppSelector(selector)` hooks.
- **`tier` is already a root slice** with a `requestTier` command and a `tierSaga`.
  The draft's §8 proposal "promote tier out of settings + add `requestTier` + reuse
  `setTier` as `runTierTransition`" is **shipped**. This fold *extends* the existing
  `tierSaga`, it does not introduce tier.
- **`SagaContext` is the engine→saga seam.** `createAppStore` returns
  `{ store, setSagaContext }`; the engine injects capabilities post-construction
  (`setSagaContext({ runTierTransition })`) and sagas read them with `getContext`.
  Selection effects join this exact seam — render-wake and the resolver deps inject
  the same way `runTierTransition` does.
- **Serializability + immutability checks are ON** (no `serializableCheck:false`,
  no `enableMapSet`). This *reinforces* the reference-not-snapshot model in §1: a
  resolved `GalaxyInfo` in the store would fail the serializable check; a flat
  `SelectionRef` passes. The model isn't just cleaner — it's the only one the store
  admits.

The result: the draft's two longest hedges (§2 blast radius, §7/§8 "shown both
ways") collapse to single concrete paths, and roughly a third of the proposed new
infrastructure is struck because it already exists.

## Scope

Fold selection (hover/select/focus) into the RTK store as **Intent**, with the
resolved `FocusableTarget` becoming **derived** state:

1. **Reference, not snapshot.** The store holds a serializable `SelectionRef`;
   `GalaxyInfo` / `StructureInfo` are resolved at the read boundary, memoized.
2. **One Intent home, single write path.** A `selection` slice with a
   dedup-on-write reducer; the React `useState` mirrors and echo callbacks delete.
3. **Direct dispatch, no write handle.** Writes are `store.dispatch(...)` at the
   call site — engine-side via the injected store, React-side via `useAppDispatch`.
   The `selectFamous` + `selectByAlias` + `focusOn` handle methods, the `useUrlSync`
   drain, and the `FocusTarget` type all dissolve with **no replacement surface**.
   The only engine→React channel that survives is the *read* (`resolveSelection`),
   because resolution touches GPU-side catalogs — and it rides the engine handle
   `useEngine` already holds, not a new provider.
4. **Effects on the saga seam.** Render-wake, tier re-anchor, and deep-link
   deferral are all sagas reached through the injected `SagaContext` — the single
   effects vehicle established by the tier slice.

**Out of scope (do not scope-creep):**

- **Converging `syncVisibilityFades`** onto the saga seam — it stays an explicit
  bridge for this fold (consistent with `fades-not-zustand-middleware`: fades are
  never reducer state). Recorded as a known temporary two-pattern state, not drift.
- Converting **settings** to actions, tours-as-overlay — later folds.
- Any **camera / tween behaviour** change. `tweenToGalaxy` / `tweenToStructure`
  are untouched; only their *callers* change.

---

## 1. The model — reference, not snapshot

### The knot today

`selectionSubsystem.ts` holds three closure `let`s of resolved `FocusableTarget`.
Because the slot is a self-contained snapshot, two costs follow:

- **The race-defence.** `commitGalaxyFocus.ts` deliberately stores a *pre-built*
  `GalaxyInfo` because "a lookup keyed on `(source, localIdx)` would briefly return
  null and blank the InfoCard." That comment is a decomplection trigger — the race
  exists *only* because the slot stores a resolved object instead of a reference.
- **The mirror.** React can't read a closure, so it keeps a `useState` copy kept in
  sync by echo callbacks. Two homes + a mirror.

### The un-braided shape

The store holds a **reference**; the resolved target is **derived**. The proof
this is the real Intent: the URL hash `#focus=source:localIdx` is already a
reference, round-tripped back through `selectByAlias` — the resolved target and
the URL reference are two encodings of one Intent kept in sync by hand. Holding
the reference as the single Intent collapses that. (And the RTK serializability
check makes it mandatory: only the reference is store-shaped.)

```ts
// src/@types/engine/SelectionRef.d.ts  (one type per file)
export type SelectionRef =
  | { readonly type: 'galaxyCatalog'; readonly source: GalaxyCatalogSourceType; readonly index: number }
  | { readonly type: 'structure'; readonly id: string }
  | { readonly type: 'milkyWay' };
```

Three deliberate choices, each grounded:

- **`source: GalaxyCatalogSourceType`, not `SourceType`.** The engine hot path
  (catalogs map, `resolveGalaxyInfo`, `GalaxyInfo.source`, pick decode) is all
  *numeric* `SourceType`. `GalaxyCatalogSourceType` is its galaxy-catalogs-only
  numeric narrowing (`0|1|2|3|4|8`) — zero conversions, and the type forbids
  building a galaxy ref from a structure/volume source. (`GalaxyCatalogId` is the
  *string* settings key — wrong space, would force casts everywhere.)
- **Galaxy arm `index: number`, structure arm `id: string`.** Different names
  because they teach opposite lessons: `index` is a **session-local positional
  index that drifts across tier swaps** (durability is the boundary codec's job,
  §6); `id` is a **durable instance key** (`StructureInfo.id`, resolved via
  `StructureStore.byId`). A shared `id` would mislabel the galaxy field as an
  identity.
- **Verified safe.** `tweenToGalaxy` already takes a structural `TweenTarget`
  (reads only `x,y,z,diameterKpc`); `tweenToStructure` reads only
  `worldPos`/`radiusMpc`; `resolveGalaxyInfo(cloud, idx, source, famousMeta)`
  already exists. No consumer needs a pre-built object at dispatch time — the
  race-defence dissolves rather than ports.

---

## 2. The store shape — two sibling routes

The store today combines `settings` + `tier`. The fold adds two sibling routes,
following the established pattern (a constant per route in `store/constants.ts`, a
route entry in `rootReducer.ts`); `RootState` extends automatically through the
combine.

```ts
// store/constants.ts — additive
export const selectionRoute = 'selection' as const;
export const dataStatusRoute = 'dataStatus' as const;

// rootReducer.ts — additive
export const rootReducer = combineReducers({
  [settingsRoute]: settingsReducer,
  [tierRoute]: tierReducer, // already present
  [selectionRoute]: selectionReducer,
  [dataStatusRoute]: dataStatusReducer,
});
```

```ts
export type SelectionState = {
  readonly hover: SelectionRef | null;
  readonly select: SelectionRef | null;
  readonly focus: SelectionRef | null;
};

export type DataStatusState = {
  readonly catalogGen: Partial<Record<SourceType, number>>; // bumped on each catalog commit
  readonly structureGen: number;
};
```

`tier` is **already** its own root slice (lifted out of `settings` so a
settings/tour `restoreSettings` round-trip can't sweep the data-resolution level).
Selection and `dataStatus` join it as peers for the same reason — selection Intent
and resource readiness must survive a settings restore untouched.

Each slice seeds from its own `initialState` (selection all-`null`, `dataStatus`
empty), the same "seed at construction" rule the settings slice and `tier` already
follow. Both shapes are flat serializable primitives, so they sail through RTK's
serializability + immutability checks with no escape hatch.

No consumer-signature churn: existing settings reads keep using
`useAppSelector(selectExposure)` etc. (scoped to the `settings` route inside the
selector); selection gets its own `state/selection/selectors.ts` read surface,
consumed through the same `useAppSelector` hook.

---

## 3. Reads — getters resolve, memoized

Resolution splits into two pure pieces (the `intent.md` "Resources and derived
state across the store boundary" rule):

```ts
// pure STORE selectors — RootState-scoped, so the SAME function drops into React
// (useAppSelector) and the engine (selectGenForSlot(store.getState(), slot)). The
// compound ones are memoized with reselect — see the selectors module in §3b.
export const selectSelectedRef = (state: RootState): SelectionRef | null => state[selectionRoute].select;

// pure RESOLVER — fed the resources explicitly; NOT a store selector. Table-dispatched.
type ResolveDeps = {
  readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  readonly famousMeta: readonly FamousMetaEntry[];
  readonly structures: StructureStore;
};

const RESOLVE_REF: {
  [K in SelectionRef['type']]: (ref: Extract<SelectionRef, { type: K }>, d: ResolveDeps) => FocusableTarget | null;
} = {
  galaxyCatalog: (ref, d) => resolveGalaxyInfo(d.catalogs.get(ref.source), ref.index, ref.source, d.famousMeta),
  structure: (ref, d) => d.structures.byId(ref.id),
  milkyWay: () => MILKY_WAY_INFO,
};

export function resolveSelectionRef(ref: SelectionRef | null, d: ResolveDeps): FocusableTarget | null {
  return ref === null ? null : RESOLVE_REF[ref.type](ref, d);
}
```

The resolver is the **only** place catalogs / the structure store are touched for
selection. It folds both in as two table rows over the resolvers that already
exist (`resolveGalaxyInfo`, `StructureStore.byId`).

**Where it's needed:** an engine-side memoized getter, keyed on `(ref, resource
generation)`, so the per-frame readers don't rebuild a `GalaxyInfo` each tick.
Within one frame `select` is read 3× (`runFrame:287`, `selectionRingPass`
`enabled` + `draw`), `focus` 1× — all hit the memo after the first.

```ts
function makeResolveSlot(state: EngineState) {
  const memo = new Map<SelectionSlot, { ref: SelectionRef | null; gen: number; out: FocusableTarget | null }>();
  return (slot: SelectionSlot): FocusableTarget | null => {
    const root = state.store.getState();
    const ref = selectSlot(root, slot);
    const gen = selectGenForSlot(root, slot); // the §3b reselect selector — shared with React
    const hit = memo.get(slot);
    if (hit && hit.ref === ref && hit.gen === gen) return hit.out; // ref identity stable when unchanged (§5)
    const out = resolveSelectionRef(ref, {
      catalogs: state.data.galaxies.catalogs,
      famousMeta: state.data.galaxies.famousMeta,
      structures: state.data.structures,
    });
    memo.set(slot, { ref, gen, out });
    return out;
  };
}
```

Per-frame engine consumers (`selectionRingPass`, `selectionHaloTable`, `runFrame`'s
`structureFocus.update`) read **through** this getter directly — they have
`state`, so they call `resolveSlot(slot)` with no indirection.

### 3a. The React read — inside `useEngine`, on the channel that already exists

React can't reach `state.data.galaxies.catalogs`, and the store deliberately
doesn't hold them (§4). So the resolved read needs an engine→React channel — but
**no new one is required**: `useEngine` *already* creates the engine handle, holds
it in `handleRef`, and already returns `selected` / `hovered` / `focused` to
components. Today it populates those via `onSelectChange`→`useState` echo; the fold
swaps that push for a pull, **in the same hook**, leaving every consumer's
signature untouched:

```ts
// useEngine.ts — the echo callbacks (onHoverChange/onSelectChange/onFocusChange)
// and their useState delete. Resolution pulls through the handle this hook already holds:
const selectRef = useAppSelector(selectSelectedRef);
const selectGen = useAppSelector(selectSelectedGen); // re-resolve trigger on a late-arriving cloud
const selected = useMemo(
  () => handleRef.current?.resolveSelection('select') ?? null,
  [selectRef, selectGen],
);
// ...and the same two-line pattern for hovered / focused. useEngine returns
// { selected, hovered, focused, ... } exactly as before → InfoCard is UNCHANGED.
```

`resolveSelection(slot)` is one **read** method on the engine handle — it wraps the
same `makeResolveSlot` getter the per-frame consumers use, against live GPU-side
resources. That is not a proxy (it runs the resolver), so it legitimately lives on
the handle; it is the asymmetric counterpart to the write doors, which *were*
proxies and dissolved (§6). No `SelectionResolveProvider`, no `useResolveSelection`
— a second context would just duplicate the handle channel `useEngine` already is.

### 3b. Compound selectors (reselect)

The "which descriptor generation pairs with this ref" computation was inlined in
both `makeResolveSlot` (engine) and InfoCard's `useMemo` deps (React) — the same
logic in two homes. It lifts into one **memoized reselect selector** in
`state/selection/selectors.ts`, consumed from both sides. RTK re-exports
`createSelector`, so this adds no dependency.

```ts
import { createSelector } from '@reduxjs/toolkit';

import { selectionRoute, dataStatusRoute } from '../../store/constants';
import type { RootState } from '../../store/types';
import type { SelectionRef } from '../../@types/engine/SelectionRef';
import type { SelectionSlot } from '../../@types/engine/SelectionSlot';
import type { DataStatusState } from '../../@types/engine/state/DataStatusState';

// ── input selectors (cheap, direct reads) ──
export const selectSlot = (state: RootState, slot: SelectionSlot): SelectionRef | null => state[selectionRoute][slot];
export const selectSelectedRef = (state: RootState): SelectionRef | null => state[selectionRoute].select;
export const selectFocusRef = (state: RootState): SelectionRef | null => state[selectionRoute].focus;
export const selectHoverRef = (state: RootState): SelectionRef | null => state[selectionRoute].hover;
const selectDataStatus = (state: RootState): DataStatusState => state[dataStatusRoute];

// the generation that, paired with a ref, tells the resolver a re-resolve is due (§4).
const genForRef = (ref: SelectionRef | null, ds: DataStatusState): number =>
  ref?.type === 'galaxyCatalog' ? (ds.catalogGen[ref.source] ?? 0)
  : ref?.type === 'structure' ? ds.structureGen
  : 0;

// ── compound selectors (reselect-memoized) ──
const makeSelectGen = (selectRef: (s: RootState) => SelectionRef | null) =>
  createSelector([selectRef, selectDataStatus], genForRef);

export const selectSelectedGen = makeSelectGen(selectSelectedRef);
export const selectFocusGen = makeSelectGen(selectFocusRef);

// per-slot map so the engine's parametric getter shares the SAME memoized selectors.
const GEN_BY_SLOT: Record<SelectionSlot, (s: RootState) => number> = {
  hover: makeSelectGen(selectHoverRef),
  select: selectSelectedGen,
  focus: selectFocusGen,
};
export const selectGenForSlot = (state: RootState, slot: SelectionSlot): number => GEN_BY_SLOT[slot](state);

// a derived boolean the InfoCard / overlays read instead of re-deriving null-checks.
export const selectIsSelectionActive = createSelector(
  [selectSelectedRef, selectFocusRef],
  (select, focus) => select !== null || focus !== null,
);
```

Each `makeSelectGen(...)` is a distinct memoized instance, so the three slots never
thrash one shared cache. The engine's `makeResolveSlot` calls `selectGenForSlot`;
InfoCard calls `selectSelectedGen` — neither recomputes unless the ref or the
matching descriptor actually changed.

---

## 4. The resource boundary — the descriptor bridge

A pure store selector can't resolve a ref, because resolution needs the catalogs,
which are heavy GPU-backed resources that **stay out of the store** (and would fail
the serializable check). The notification gap — React must re-render when a
*late-arriving cloud* makes a previously-null ref resolve — is closed not by
mirroring the resolved target into the store, but by projecting the resource's
**readiness** into the store as a serializable **descriptor**: `dataStatus.catalogGen`.

This is the rule written into
[`intent.md` § "Resources and derived state across the store boundary"](../../superpowers/conventions/intent.md).
It is dispatched from the one place a cloud commits:

```ts
// galaxyCatalogSourceRegistry.ts commit path — the ONE place a cloud lands:
store.dispatch(catalogLoaded({ source, generation: nextGen })); // a number, not the cloud
```

`catalogLoaded` is a real RTK action (its `dataStatus` reducer bumps
`catalogGen[source]`, and the deep-link / re-anchor sagas in §7–§8 `take` it).
React keys on it; a deep-linked selection whose cloud hasn't loaded resolves to
`null`, then re-resolves the instant `catalogGen` ticks:

```ts
// inside useEngine (§3a) — the resolved target React consumes, pulled through the
// handle the hook already holds, re-resolving when the ref OR the descriptor ticks:
const ref = useAppSelector(selectSelectedRef);
const gen = useAppSelector(selectSelectedGen); // the §3b reselect selector — no inline ternary
const selected = useMemo(() => handleRef.current?.resolveSelection('select') ?? null, [ref, gen]);
```

Skymap already has the raw material — AssetSlot generation counters *are* this
descriptor; they need only projecting into `dataStatus` via `catalogLoaded`.

---

## 5. Writes — the slice, dedup is generic

The single write path is the `selection` slice. Dedup (today's `targetEq`
short-circuit) moves into the reducer and becomes **generic**: `SelectionRef` is
flat primitives, so a stock `shallowEqual` *is* structural equality — no per-type
code.

```ts
import { createSlice, type PayloadAction } from '@reduxjs/toolkit';
import { shallowEqual } from 'react-redux';

const setIfChanged =
  (slot: keyof SelectionState) =>
  (state: SelectionState, action: PayloadAction<SelectionRef | null>) => {
    if (!shallowEqual(state[slot], action.payload)) state[slot] = action.payload; // Immer: in-place when changed
  };

const selectionSlice = createSlice({
  name: selectionRoute,
  initialState: { hover: null, select: null, focus: null } as SelectionState,
  reducers: {
    updateSelectionHover: setIfChanged('hover'),
    updateSelectionSelect: setIfChanged('select'),
    updateSelectionFocus: setIfChanged('focus'),
    clearSelection: (state) => { state.select = null; state.focus = null; }, // dismiss: deselect AND drop focus
  },
});

export const {
  updateSelectionHover,
  updateSelectionSelect,
  updateSelectionFocus,
  clearSelection,
} = selectionSlice.actions;

// per-slot map for the parametric dispatch in the tier re-anchor (§8).
export const SELECTION_WRITE_BY_SLOT: Record<SelectionSlot, (ref: SelectionRef | null) => PayloadAction<SelectionRef | null>> = {
  hover: updateSelectionHover,
  select: updateSelectionSelect,
  focus: updateSelectionFocus,
};
```

The payoff: the old "fire callback only on actual change" guard becomes "Immer
returns the same state slot on a no-op" → **no subscriber notification, no React
re-render** from a no-op write. And the invariant *ref identity is stable when the
value is unchanged* lets §3's memo compare with `===`.

`targetEq.ts` **and** `targetIdentityKey.ts` delete with no bespoke replacement.

> Reference (`===`) equality is wrong here — every pick builds a fresh ref object,
> so `===` would always miss; making it work would need interning (more plumbing).
> `shallowEqual` gets the dedup without interning.

> **Render-wake is NOT free from the reducer dedup** — see §7a. The wake is a saga
> watcher on the write *actions*, which fire even when this reducer no-ops the
> *state*. That extra wake is named and accepted there.

---

## 6. Entry points — direct dispatch, the write handle dissolved

`selectFamous` / `selectByAlias` / `focusOn` are all "resolve an identifier →
commit focus," differing only in the identifier. The first draft folded them into
two engine-handle doors (`focus(ref)` / `focusByFocusId(string)`). With the store
injected at the app root, **those doors are pure proxies over `store.dispatch`** —
they carry no logic — so they dissolve too. Every write is a direct dispatch; there
is **no selection write surface on the engine handle at all**:

```ts
// the ref write — the value a pick or a double-click produces:
store.dispatch(updateSelectionFocus(ref)); // null releases focus; the tween is an effect (§7)

// the durable-id command — what a deep link / command-palette pick produces:
store.dispatch(requestFocus(focusId)); // the saga resolves now, or defers on catalogLoaded (§7b)
```

`requestFocus(focusId)` is a reducer-less `createAction` command (the same
command/write split `requestTier` uses): it carries intent, changes no state, and
the deep-link saga is what reacts — resolving the id to a `SelectionRef` and
dispatching `updateSelectionFocus(ref)` when the cloud is ready. No engine
`pendingFocus` field; the "wait until loaded" is a `yield`, not stored state.

Why this is safe to dissolve rather than keep "for ergonomics": a wrapper that only
forwards an argument to `dispatch` is exactly the proxy surface the
`delete-proxy-surfaces` rule says to remove once the thing it adapted (the old
subsystem closure) is gone. The read is the asymmetric case — it is **not** a proxy
(it runs the resolver against GPU-side catalogs), so it survives, as a read method
on the engine handle `useEngine` already holds (§3a) — no new provider.

**`SelectionRef` is the one selection type; the durable form is just its string
serialization at the boundary.** `FocusTarget` (the `{kind:'famous'|'pgc'|'sdss'|'pos'|'structure'}`
union) **deletes** — its `kind` discrimination becomes an internal detail of two
galaxy-arm-only codec functions:

```ts
function focusIdOf(ref: SelectionRef, d: ResolveDeps): string; // = today's selectionToFocusId, generalized
function resolveFocusId(focusId: string, d: ResolveDeps): SelectionRef | null; // parse + lookup → ref
```

Why galaxy-only: the structure arm `id` and milkyWay are **already durable**, so
they serialize as-is; only `index` needs projecting. The `pos` case
(`#focus=pos:ra,dec`, "nearest galaxy to a sky point") is a *query*, not a ref — it
stays **inside** `resolveFocusId` (parse → nearest-lookup → ref) and never flows as
a type. The URL string format is **unchanged**.

Call-site rewrites, each simpler:

```ts
// wireInput double-click (engine-side, has the injected store): was focusOn(selected());
onDoubleClick: () => store.dispatch(updateSelectionFocus(selectSlot(store.getState(), 'select'))); // null releases
// CommandPalette famous (React): was selectFamous(id):
onSelect: (id) => dispatch(requestFocus(`famous:${id}`)); // dispatch = useAppDispatch()
// useUrlSync (React): was parse → resolveFocusTarget → selectByAlias:
dispatch(requestFocus(hashFocusId));
```

Deferral is always a saga's `take`-loop (URL today, tours later), never a field on
the engine.

---

## 7. Effects — sagas on the `SagaContext` seam

Selection has three effects, and **all three are sagas** reached through the
injected `SagaContext` — the single vehicle the tier slice established. There is
**no listener middleware on the store**: the store reducers stay free of engine
references (upholding `fades-not-zustand-middleware` / ADR 0001's no-store-effects
stance), and engine capabilities cross into saga-land only through `getContext`,
exactly as `runTierTransition` does.

The engine extends the context it already injects:

```ts
// store/types.ts — SagaContext grows the capabilities selection sagas call.
export type SagaContext = {
  runTierTransition: RunTierTransition; // already present
  requestRender: () => void;            // engine render-on-demand wake
  resolveDeps: () => ResolveDeps;       // live catalogs / famousMeta / structures (lazy — GPU lands post-bootstrap)
};
// engine, post-construction:
setSagaContext({ runTierTransition, requestRender, resolveDeps });
```

### 7a. Render-wake

`select`/`focus` must wake the render-on-demand loop (halo draw, focus fade);
`hover` must **not** (it only feeds the React InfoCard — no GPU consequence). A
`takeEvery` watcher on the two waking actions fires `requestRender` from context:

```ts
function* watchSelectionWake() {
  const requestRender = yield* getContext<SagaContext['requestRender']>('requestRender');
  yield* takeEvery([updateSelectionSelect, updateSelectionFocus], () => requestRender());
}
```

**Named trade-off of the uniform-saga choice:** the watcher fires on the *action*,
which is dispatched even when §5's reducer no-ops the *state* (re-selecting the
same target). So a no-op `select` still calls `requestRender`. This is harmless —
`requestRender` is idempotent and coalesced into a single rAF, and the loop sleeps
again immediately if nothing animates — but it does forfeit the draft's "perfectly
quiet steady state on a no-op." Accepted as the cost of one effects vehicle; a
state-diff listener would reclaim it but reintroduce the second mechanism this fold
deliberately avoids. (If a profile ever shows it matters, the watcher can `select`
the slot and gate on a saga-local last-seen — but YAGNI until measured.)

### 7b. Deep-link / `requestFocus` deferral

`focusByFocusId` dispatches `requestFocus(focusId)` (§6). The saga resolves it,
deferring on the descriptor bridge (§4) until the cloud is ready:

```ts
function* onRequestFocus(action: ReturnType<typeof requestFocus>) {
  const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
  let ref = resolveFocusId(action.payload, resolveDeps());
  while (!ref) { yield* take(catalogLoaded); ref = resolveFocusId(action.payload, resolveDeps()); }
  yield* put(updateSelectionFocus(ref));
}
function* watchRequestFocus() { yield* takeLatest(requestFocus, onRequestFocus); } // latest deep-link wins
```

This is the indefinite-wait door (a deep-linked source may be toggled on much
later). The tier re-anchor in §8 uses the same resolver but a **bounded** wait.

---

## 8. Tier swap — re-anchor folded into the existing `tierSaga`

A stored `(source, index)` is **positional**: after a tier swap the same index
resolves to a *different* galaxy (or `null`). "Do nothing" is the one wrong option
(silently wrong galaxy). The fix re-anchors by durable id. Because
`requestTier`/`tierSaga`/`runTierTransition` already exist, this is an **addition
to the landed saga**, not new machinery:

```
dispatch requestTier('large')                 // already the UI path
  → tierSaga (extended):
       prev = select(tier); if prev === next return
       reanchor = captureGalaxyFocusIds(select(selection), resolveDeps())  // BEFORE the write — old clouds present
       put(updateSelectionHover(null))
       put(setTier(next)); run = getContext('runTierTransition'); run?.(prev, next)  // eviction + reload starts
       for [slot, id] of reanchor:
            take(catalogLoaded for that source)        // bounded: this tier's load WILL complete
            put(SELECTION_WRITE_BY_SLOT[slot](resolveFocusId(id, resolveDeps()) ?? null))  // hit → re-anchor, miss → clear
```

Two properties make this clean:

- **Capture is a read at the top, pre-eviction.** The re-anchor reads durable ids
  while the *old* clouds are still loaded (`focusIdOf` works), before
  `runTierTransition` evicts anything. No pre-capture closure stash, no persistent
  `pendingReanchor` field — the saga's linear flow *is* the ordering guarantee.
- **Re-anchor shares §7b's resolver but bounds its wait.** Deep-link waits
  indefinitely; re-anchor waits for the specific `catalogLoaded` of the swapped
  source(s) — those loads are in flight and will land — then re-resolves **once**.
  A hit re-anchors to the new ref; a miss (`null`) clears, because the galaxy
  dropped out of the new tier. This is *more* correct than today, which persists a
  haloed "ghost" galaxy that may not exist in the new tier.

`takeLatest` on `requestTier` (already how the landed saga is wired) gives
latest-wins cancellation free: a rapid second tier change aborts the first
re-anchor mid-`take`. Structures / milkyWay refs are untouched (already durable);
only the galaxy arm re-anchors.

The landed `runTierTransition` is fire-and-forget today (its note: "the `run(...)`
line would become `yield* call(run, …)` only if a step needed to be cancellable").
Re-anchor does **not** force that change — it keys off the per-source
`catalogLoaded` descriptor rather than awaiting the runner, so the runner's
signature stays as-is.

---

## 9. Blast radius

**Delete:**
`selectionSubsystem.ts`, `targetEq.ts`, `targetIdentityKey.ts`,
`commitFocus.ts` / `commitFocusTable.ts` / `commitGalaxyFocus.ts` /
`commitStructureFocus.ts` / `commitMilkyWayFocus.ts`, `clearAll.ts`, the
`FocusTarget` type, the engine handle methods `selectFamous` / `selectByAlias` /
`focusOn`, the `useEngine` `useState` mirrors + `onHoverChange` / `onSelectChange`
/ `onFocusChange` echo callbacks, `useUrlSync`'s bespoke drain.

**Rework:** `resolvePick` / `resolvePickTable` (pick → ref instead of pick →
resolved target), `wireInput` (dispatch `updateSelection*` / `requestFocus` refs
straight to the injected store — no handle), `useUrlSync` (→ `dispatch(requestFocus)`
+ a `catalogGen` effect), `CommandPalette` (→ `useAppDispatch` + `requestFocus`),
`useEngine` (echo+`useState` → `useAppSelector` selectors + `handle.resolveSelection` pull; InfoCard unchanged),
`focusUrl.ts` (`selectionToFocusId` → `focusIdOf`; `parseFocusHash` →
`resolveFocusId`), **`tierSaga`** (add the re-anchor read + bounded `take` loop),
**`SagaContext`** (add `requestRender` + `resolveDeps`), the engine's
`setSagaContext` call (inject the two new capabilities), the galaxy-catalog commit
path (dispatch `catalogLoaded`).

**Also delete (handle dissolution):** the first draft's proposed `focus` /
`focusByFocusId` engine-handle doors never get built — writes are direct
`store.dispatch` at every call site. The only surviving engine→React selection
channel is the *read*, a single `resolveSelection(slot)` method on the existing
engine handle (no new provider).

**Add:** `SelectionRef.d.ts`, the `selection` slice + `dataStatus` slice +
`requestFocus` / `catalogLoaded` actions + `selectionRoute` / `dataStatusRoute`
constants + route entries, `resolveSelectionRef` + the memoized getter +
`resolveSelection(slot)` on the engine handle, `focusIdOf` / `resolveFocusId`,
`state/selection/selectors.ts` (the reselect compound selectors, §3b),
`watchSelectionWake` + `watchRequestFocus` sagas (forked from `rootSaga`).

**Unchanged (read through the getter / existing hooks):** `selectionRingPass`,
`selectionHaloTable`, `structureFocusSubsystem`, `runFrame` selection reads,
InfoCard + the `DETAIL_CARD` table + detail cards, `tweenToGalaxy` /
`tweenToStructure`, every settings selector/consumer.

~12–15 files of real change; ~65 read sites unchanged. (Lower than the first draft
— tier promotion, the store growth, and the effects vehicle are already in place.)

---

## 10. Build order (incremental, suite green at each step)

1. **`SelectionRef` + resolver + codecs**, behind the existing subsystem (no
   behaviour change): introduce the type, `resolveSelectionRef`, `focusIdOf` /
   `resolveFocusId`; unit-test in isolation.
2. **The `selection` + `dataStatus` slices** (with the `updateSelection*` /
   `clearSelection` / `requestFocus` / `catalogLoaded` actions), seeded at
   construction; add the two route constants + `rootReducer` entries + the §3b
   reselect selectors; dispatch `catalogLoaded` from the commit path. (No
   tier/settings work — already landed.)
3. **Cut the reads over**: engine consumers (`selectionRingPass`, `runFrame`) call
   the memoized getter; add `resolveSelection(slot)` to the handle and pull through
   it inside `useEngine` (§3a), keeping `useEngine`'s `{selected,hovered,focused}`
   return shape. Delete the `useState` mirrors + the echo callbacks.
4. **Cut the writes over** to direct dispatch: `wireInput` + pick → `updateSelection*`
   dispatches; deep-link/palette → `dispatch(requestFocus(...))`. Delete
   `selectFamous` / `selectByAlias` / `focusOn` / `commit*` / `clearAll` /
   `targetEq` / `targetIdentityKey` / `FocusTarget` — and build NO replacement
   handle doors.
5. **The sagas**: extend `SagaContext` + `setSagaContext`; add `watchSelectionWake`
   + `watchRequestFocus` to `rootSaga`; fold the re-anchor into `tierSaga`; rewire
   `useUrlSync` → `focusByFocusId`.
6. **Delete `selectionSubsystem.ts`**; reconcile tests.

---

## References

- [ADR 0007](../../adrs/0007-intent-centric-state-and-effects.md) — intent-centric
  state; this is its first *application-state* fold (the `tier` slice was the
  infrastructure proof-of-shape).
- [`intent.md`](../../superpowers/conventions/intent.md) — the lens; the
  "Resources and derived state across the store boundary" section is §4 here.
- [ADR 0001](../../adrs/0001-fade-ownership.md) — fade ownership. **Upheld**, not
  reverted: effects live in sagas reached via `SagaContext`, so the store reducers
  stay free of engine references. (The first draft proposed a store-listener
  middleware that would have reverted this; the saga vehicle makes that
  unnecessary.) ADR 0008 (the deferred vehicle decision) is **moot** — the vehicle
  was settled by the RTK + `typed-redux-saga` migration.
- [Grill session 2026-06-18](../../grill-sessions/selection-into-intent-store-2026-06-18.md)
  — the nine decisions and their rejected alternatives. Decision 9 (effects
  vehicle, left open there) is now resolved: uniform sagas.
