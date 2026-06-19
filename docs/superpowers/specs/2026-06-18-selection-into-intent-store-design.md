# Selection into the Intent Store (design)

> **Status:** approved design, awaiting implementation plan. **Revised twice:**
> first to target the RTK store + `typed-redux-saga` that landed (the zustand→RTK
> migration and the `requestTier`/`tierSaga`/`SagaContext` slice are on `main`);
> then to a **two-layer read** (reference as Intent + a saga-reconciled serializable
> row as the derived cache) so React resolves selection purely from the store — no
> reach into the engine handle.
> **Why this exists:** selection (hover → select → focus) is the cleanest
> illustration of the scattered-authoritative-state pattern
> [ADR 0007](../../adrs/0007-intent-centric-state-and-effects.md) names: the
> targets live in a subsystem closure (`selectionSubsystem.ts`), React keeps a
> parallel `useState` copy, and the two are reconciled by echo callbacks
> (`onHoverChange` / `onSelectChange` / `onFocusChange`). That is two authoritative
> homes plus a mirror — the exact shape `intent.md` #2 forbids. This spec folds
> selection into the store as the **first application-state fold** (the `tier` slice
> was the infrastructure proof-of-shape), collapsing the stray `engine.ts` entry
> points (`selectFamous`, `selectByAlias`, `focusOn`) the cleanup was about.
> Grounded in the grill session
> [`docs/grill-sessions/selection-into-intent-store-2026-06-18.md`](../../grill-sessions/selection-into-intent-store-2026-06-18.md).

## What changed across the revisions

**Vehicle (revision 1).** The original draft was vehicle-agnostic — zustand-targeted,
every effect "shown both ways," vehicle deferred to a never-written ADR 0008. The
store landed as **RTK injected at the app root**, with the **first feature saga**
(`requestTier` → `tierSaga` → engine-owned `runTierTransition` via injected
`SagaContext`). So the vehicle is decided, and the infrastructure already exists:

- **`combineReducers` + route constants** (`settingsRoute`, `tierRoute`). Adding a
  slice is additive; `RootState` follows the combine. The draft's "every settings
  selector now needs `s.settings.…`" worry is gone — settings is already a route.
- **`tier` is a shipped root slice** with `requestTier` + `tierSaga`. §8 re-anchor
  *extends* that saga rather than introducing tier.
- **`SagaContext` is the engine→saga seam.** `createAppStore` returns
  `{ store, setSagaContext }`; the engine injects capabilities post-construction and
  sagas read them via `getContext`. Selection effects join this exact seam.

**Read boundary (revision 2).** The InfoCard view depends on the cloud — 2.5M rows
+ GPU buffers that live in the engine, never the store, never React. So *something*
must cross engine→React: carry the resolver (a handle method/provider), carry the
data (into the store), or carry the resource (out — bulk). To keep React **pure
store** (no imperative engine call in the read path), this fold carries the **data**,
but only the *minimal* form of it:

- The store holds the **`SelectionRef`** (identity Intent) **and** a small
  **`SelectionRow`** — a serializable projection of just the cloud-sourced
  primitives for the selected row. The heavy `GalaxyInfo` view-model is **built
  React-side** by a memoized selector (`buildFocusable`) from that row.
- The row is **reconciled by a saga** (the single owner) on `updateSelection*` and
  `catalogLoaded`, via `getContext('resolveDeps')`. React never touches the engine.

**Two deliberate bends, recorded so they don't read as drift:**

1. **A derived row is materialized in the store** — counter to `intent.md`'s
   "derived = compute/memoize, never mirror." It is justified as the *reconciler*
   pattern: one effects-layer saga owns it, keyed on the complete trigger set
   (`updateSelection*` ∪ `catalogLoaded`), so it can't hand-sync-drift. It is the
   *minimal* projection (≤3 small rows), not the fat view-model, and it is fully
   serializable (`objID` as a string), so RTK's checks stay on.
2. **`buildFocusable` imports the physics / URL formatters React-side** — counter to
   the project's "React never imports data/physics modules" rule (today the engine
   pre-bakes `GalaxyInfo`). Accepted as the cost of pure-store React; the formatters
   are pure functions, so nothing GPU- or engine-stateful crosses.

## Scope

Fold selection (hover/select/focus) into the RTK store, split into two layers:

1. **Identity is a reference; display is a reconciled row.** `selection` holds a
   serializable `SelectionRef` (the durable Intent — drives URL, tween, re-anchor);
   `selectionRows` holds a small serializable `SelectionRow` (the derived cache).
   The `FocusableTarget` view-model is built React-side from the row, memoized.
2. **Single write path per layer.** Refs: `updateSelection{Hover,Select,Focus}` /
   `clearSelection` (dedup-on-write). Rows: `setSelectionRow`, written **only** by
   the reconciler saga.
3. **Pure-store React; direct-dispatch writes.** No selection handle: writes are
   `store.dispatch(...)` at the call site; reads are `useAppSelector(buildSelector)`.
   `selectFamous` / `selectByAlias` / `focusOn` / `FocusTarget` / the `useState`
   mirrors + echo callbacks all dissolve. The engine never resolves *for* React.
4. **Effects on the saga seam.** Render-wake, row reconciliation, deep-link
   deferral, tier re-anchor — all sagas reached through the injected `SagaContext`.

**Out of scope (do not scope-creep):**

- **Converging `syncVisibilityFades`** onto the saga seam — stays an explicit bridge
  (fades are never reducer state, per `fades-not-zustand-middleware`). A known
  temporary two-pattern state, not drift.
- Converting **settings** to actions, tours-as-overlay — later folds.
- Any **camera / tween behaviour** change. `tweenToGalaxy` / `tweenToStructure` are
  untouched; only their *callers* change.

---

## 1. The model — two layers: reference (Intent) + reconciled row (derived cache)

### The knot today

`selectionSubsystem.ts` holds three closure `let`s of resolved `FocusableTarget`,
and React keeps a parallel `useState` copy reconciled by echo callbacks. Two costs:

- **The race-defence.** `commitGalaxyFocus.ts` stores a *pre-built* `GalaxyInfo`
  because "a lookup keyed on `(source, localIdx)` would briefly return null and
  blank the InfoCard." A decomplection trigger — the race exists only because the
  slot stores a resolved object instead of a reference.
- **The mirror.** React's `useState` is a second authoritative home for the
  selection *identity*, hand-synced by echo. That is the staleness-bug shape.

### The un-braided shape

Split identity from display:

- **Identity = `SelectionRef`** — the single authoritative Intent. The URL hash
  `#focus=source:localIdx` is already this reference; holding it as the one Intent
  collapses the hand-sync. It drives the tween, the URL, tier re-anchor, dedup, and
  the deep-link pending state.
- **Display = `SelectionRow`** — a small serializable projection of the selected
  row's cloud-sourced primitives, held as a **derived cache** that a saga keeps in
  sync with the ref. React builds the heavy `FocusableTarget` from it, purely.

The mirror dissolves because the *identity* now has exactly one home (the `selection`
slice). The race-defence dissolves because React reads a stored row, not a live
`(source, idx)` lookup — the row is either present (render) or `null` (render
nothing), never a transient null from a mid-flight lookup.

```ts
// src/@types/engine/SelectionRef.d.ts  — the identity Intent (one type per file)
export type SelectionRef =
  | { readonly type: 'galaxyCatalog'; readonly source: GalaxyCatalogSourceType; readonly index: number }
  | { readonly type: 'structure'; readonly id: string }
  | { readonly type: 'milkyWay' };

// src/@types/engine/SelectionRow.d.ts — the serializable display projection
export type SelectionRow =
  | GalaxyRow                 // the cloud-sourced primitives (below) — built React-side into GalaxyInfo
  | StructureInfo             // already a serializable record (StructureStore.byId) — used as-is
  | { readonly type: 'milkyWay' };

export type GalaxyRow = {
  readonly type: 'galaxyCatalog';
  readonly source: GalaxyCatalogSourceType;
  readonly index: number;
  readonly objId: string;     // bigint → string so the row stays JSON-serializable
  readonly x: number; readonly y: number; readonly z: number;
  readonly redshift: number;
  readonly magU: number; readonly magG: number; readonly magR: number; readonly magI: number; readonly magZ: number;
  readonly diameterKpc: number;
  readonly axisRatio: number; readonly positionAngleDeg: number;
  readonly famous?: { readonly id: string; readonly commonName?: string; readonly names: readonly string[]; readonly description: string; readonly type: string };
};
```

`GalaxyRow` is exactly the inputs `galaxyInfoBuilder` reads off the cloud (positions,
mags, redshift, diameter, orientation, objID) plus the famous-meta block. Everything
else on `GalaxyInfo` — sexagesimal coords, `distanceMpc = √(x²+y²+z²)`, lookback,
`colours`, `iauName`, `displayName`, `catalogues`, `thumbnailUrl`, `galaxyType` — is a
**pure** function of those primitives, so it computes React-side (§3).

Three grounded choices for the ref carry over unchanged: `source:
GalaxyCatalogSourceType` (the numeric narrowing the hot path uses, no conversions);
galaxy arm `index` (positional, drifts on tier swap — §8) vs structure arm `id`
(durable instance key); `tweenToGalaxy`/`tweenToStructure` already take structural
inputs, so no consumer needs a pre-built object at dispatch time.

---

## 2. The store shape — three sibling routes

`selection` (refs), `selectionRows` (the derived cache), and `dataStatus` (the
readiness descriptor) join `settings` + `tier` as routes via the established pattern
(a constant per route, a `rootReducer` entry); `RootState` extends through the combine.

```ts
// store/constants.ts — additive
export const selectionRoute = 'selection' as const;
export const selectionRowsRoute = 'selectionRows' as const;
export const dataStatusRoute = 'dataStatus' as const;
```

```ts
export type SelectionState = {                       // identity Intent
  readonly hover: SelectionRef | null;
  readonly select: SelectionRef | null;
  readonly focus: SelectionRef | null;
};

export type SelectionRowsState = {                   // derived cache — saga-owned
  readonly hover: SelectionRow | null;
  readonly select: SelectionRow | null;
  readonly focus: SelectionRow | null;
};

export type DataStatusState = {
  readonly catalogGen: Partial<Record<SourceType, number>>; // bumped on each catalog commit
  readonly structureGen: number;
};
```

Keeping `selection` and `selectionRows` as **separate slices** is the right
decomplection: one is Intent (durable, persistable, restorable), the other is a
volatile derived cache that is *never* persisted or restored — it is rebuilt from
refs + cloud. A settings/tour restore that touches `selection` can't accidentally
carry stale rows, and the slice boundary makes the "saga-owned cache, not Intent"
nature explicit. `tier` was lifted out of `settings` for the same survive-a-restore
reason; these join it as peers.

All three shapes are flat serializable primitives (`objId` as a string), so RTK's
serializability + immutability checks stay on with no escape hatch. Seed each from
its `initialState` (selection + rows all-`null`, `dataStatus` empty).

> **Exception note — a derived value lives in the store, on purpose.** `intent.md`'s
> rule is *derived state is computed or memoized, never mirrored into the store.*
> `selectionRows` breaks that rule knowingly. It is the one case where the derived
> value's inputs (the cloud) can't be in the store and React must stay pure-store, so
> the alternatives are worse: a resolver reached through the engine handle, or a
> provider — both put an imperative engine call in React's read path. We accept the
> mirror **because it is a reconciler, not a hand-sync**: exactly one writer (the
> `watchSelectionRows` saga, §7b), keyed on the complete trigger set
> (`updateSelection*` ∪ `catalogLoaded`), so it cannot drift the way two
> hand-synced homes do. It is bounded (≤3 small rows) and serializable. If a future
> reconciler/`Live` rewrite (intent.md's north-star) makes pure-store derivation of
> resource-backed views first-class, this slice is the first thing it absorbs.

---

## 3. Reads — split resolution; the view-model is built React-side, memoized

Resolution splits into a **tiny resource-touching extract** (engine-side, in the
saga) and a **pure build** (React-side, in a memoized selector). The expensive,
GPU-adjacent part is the extract; the formatting is pure.

```ts
// engine-side, called by the reconciler saga via getContext('resolveDeps'):
// reads ~18 slots off the cloud at `index` → a small serializable row. Table-dispatched.
export function extractSelectionRow(ref: SelectionRef | null, d: ResolveDeps): SelectionRow | null {
  if (ref === null) return null;
  return EXTRACT_ROW[ref.type](ref, d);
}
const EXTRACT_ROW = {
  galaxyCatalog: (ref, d) => extractGalaxyRow(d.catalogs.get(ref.source), ref.index, ref.source, d.famousMeta),
  structure: (ref, d) => d.structures.byId(ref.id),   // StructureInfo is already serializable
  milkyWay: () => ({ type: 'milkyWay' as const }),
};

// React-side, PURE — no engine, no GPU. The fat formatting (sexagesimal, distance,
// colours, iauName, URLs, galaxyType) lives here now, the inverse of today's
// engine-bakes-GalaxyInfo flow. Table-dispatched on the row tag.
export function buildFocusable(row: SelectionRow | null): FocusableTarget | null {
  if (row === null) return null;
  return BUILD_FOCUSABLE[row.type](row);
}
const BUILD_FOCUSABLE = {
  galaxyCatalog: (row) => buildGalaxyInfo(row),  // the pure half of today's galaxyInfoBuilder
  structure: (row) => row,                       // already a StructureInfo
  milkyWay: () => MILKY_WAY_INFO,
};
```

`galaxyInfoBuilder.ts` splits along this seam: `extractGalaxyRow` (the cloud reads)
stays engine-side; `buildGalaxyInfo` (the pure formatting) moves to a React-importable
module. The physics/format/URL helpers it calls are already pure utils.

**No engine-side per-frame memo.** The first draft needed a `makeResolveSlot` getter
so the draw loop wouldn't rebuild a `GalaxyInfo` each tick. That dissolves: the
reconciled row already lives in the store, so the per-frame engine consumers
(`selectionRingPass`, `runFrame`'s `structureFocus.update`) read `selectionRows.focus`
directly — the row carries `x,y,z` + `diameterKpc` / `worldPos` + radius, everything
the halo needs. One resolution (the saga), one cache (the store row), two readers
(engine draw loop + React).

### 3a. The React read — a memoized build-selector, fully pure-store

No engine→React channel is needed at all. React reads the row from the store and
builds the view-model in a **reselect selector** (§3b), so the result is memoized and
identity-stable across renders:

```ts
const selected = useAppSelector(selectSelectedFocusable); // that's the whole read
```

No `handle.resolveRef`, no `useResolveSelection` provider, no `useMemo` in the
component, no `useEngine` resolve wiring. `useEngine`'s echo callbacks
(`onHoverChange`/`onSelectChange`/`onFocusChange`) and their `useState` delete; the
selectors replace them, and InfoCard consumes `selected`/`hovered`/`focused` exactly
as before.

### 3b. Compound selectors (reselect) — the build is the selector

The build-selectors are where `buildFocusable` runs, memoized on the stored row:

```ts
import { createSelector } from '@reduxjs/toolkit'; // RTK re-exports reselect — no new dep

// input selectors (cheap direct reads)
export const selectSelectRow = (s: RootState): SelectionRow | null => s[selectionRowsRoute].select;
export const selectHoverRow = (s: RootState): SelectionRow | null => s[selectionRowsRoute].hover;
export const selectFocusRow = (s: RootState): SelectionRow | null => s[selectionRowsRoute].focus;
export const selectSelectedRef = (s: RootState): SelectionRef | null => s[selectionRoute].select;

// build-selectors — pure buildFocusable, memoized so identity is stable across renders
export const selectSelectedFocusable = createSelector([selectSelectRow], buildFocusable);
export const selectHoveredFocusable = createSelector([selectHoverRow], buildFocusable);
export const selectFocusedFocusable = createSelector([selectFocusRow], buildFocusable);

// a derived boolean overlays read instead of re-deriving null-checks
export const selectIsSelectionActive = createSelector(
  [selectSelectedRef, (s: RootState) => s[selectionRoute].focus],
  (select, focus) => select !== null || focus !== null,
);
```

Because the row changes only when the saga re-puts it (on a real ref or catalog
change), `createSelector` recomputes `buildFocusable` only then — InfoCard re-renders
on genuine changes, not every store tick.

---

## 4. The descriptor bridge — the reconciler's re-resolve trigger

A row can't be resolved before its cloud has loaded (a deep link, or a galaxy in a
tier still fetching). The notification that "the cloud is now ready, re-resolve" is a
serializable **descriptor** projected into the store — `dataStatus.catalogGen` —
dispatched from the one place a cloud commits:

```ts
// galaxyCatalogSourceRegistry.ts commit path — the ONE place a cloud lands:
store.dispatch(catalogLoaded({ source, generation: nextGen })); // a number, not the cloud
```

In the two-layer model the descriptor's consumer is the **reconciler saga** (§7),
not React: the saga `take`s `catalogLoaded` and re-extracts any still-`null` rows.
React reads only `selectionRows`, which the saga keeps current — so React needs no
generation key at all. (This is the rule in
[`intent.md` § "Resources and derived state across the store boundary"](../../superpowers/conventions/intent.md):
store the Intent + a serializable readiness descriptor, never the resource bytes.)
AssetSlot generation counters already *are* this descriptor; they need only
projecting via `catalogLoaded`.

---

## 5. Writes — two slices

**Refs** (`selection`): the dedup-on-write slice. `SelectionRef` is flat primitives,
so a stock `shallowEqual` *is* structural equality — the per-type `targetEq` deletes.

```ts
const setIfChanged =
  (slot: keyof SelectionState) =>
  (state: SelectionState, action: PayloadAction<SelectionRef | null>) => {
    if (!shallowEqual(state[slot], action.payload)) state[slot] = action.payload;
  };

const selectionSlice = createSlice({
  name: selectionRoute,
  initialState: { hover: null, select: null, focus: null } as SelectionState,
  reducers: {
    updateSelectionHover: setIfChanged('hover'),
    updateSelectionSelect: setIfChanged('select'),
    updateSelectionFocus: setIfChanged('focus'),
    clearSelection: (state) => { state.select = null; state.focus = null; },
  },
});
export const { updateSelectionHover, updateSelectionSelect, updateSelectionFocus, clearSelection } =
  selectionSlice.actions;
```

**Rows** (`selectionRows`): written **only** by the reconciler saga via one action.

```ts
const selectionRowsSlice = createSlice({
  name: selectionRowsRoute,
  initialState: { hover: null, select: null, focus: null } as SelectionRowsState,
  reducers: {
    setSelectionRow: (state, action: PayloadAction<{ slot: SelectionSlot; row: SelectionRow | null }>) => {
      state[action.payload.slot] = action.payload.row;
    },
  },
});
export const { setSelectionRow } = selectionRowsSlice.actions;
```

`targetEq.ts` **and** `targetIdentityKey.ts` delete. The ref dedup gives the old "no
notification on a no-op" guard for free (Immer returns the same slot); `shallowEqual`
is right because every pick builds a fresh ref object, so `===` would always miss.

---

## 6. Entry points — direct dispatch, the write handle dissolved

`selectFamous` / `selectByAlias` / `focusOn` are all "resolve an identifier → commit
focus." With the store injected at the app root, an engine-handle door would be a
pure proxy over `store.dispatch`, so there is **no selection write surface on the
handle**. Every write is a direct dispatch of a *ref* or a *command*; the saga fills
the row.

```ts
// the ref write — what a pick / double-click produces:
store.dispatch(updateSelectionFocus(ref)); // null releases focus; the tween is an effect (§7)

// the durable-id command — what a deep link / palette pick produces:
store.dispatch(requestFocus(focusId)); // the saga resolves the id, then writes the ref (§7b)
```

`requestFocus(focusId)` is a reducer-less `createAction` command (the
command/write split `requestTier` uses): it changes no state; the deep-link saga
reacts. `FocusTarget` (the `{kind:'famous'|'pgc'|'sdss'|'pos'|'structure'}` union)
deletes — its `kind` discrimination becomes an internal detail of two galaxy-arm-only
codecs:

```ts
function focusIdOf(ref: SelectionRef, d: ResolveDeps): string;                 // = today's selectionToFocusId
function resolveFocusId(focusId: string, d: ResolveDeps): SelectionRef | null; // parse + lookup → ref
```

Structure `id` + milkyWay are already durable (serialize as-is); only the galaxy
`index` needs projecting. The `pos` query (`#focus=pos:ra,dec`) stays *inside*
`resolveFocusId` (parse → nearest-lookup → ref) and never flows as a type. The URL
string format is unchanged.

Call-site rewrites:

```ts
// wireInput double-click (engine-side, has the injected store):
onDoubleClick: () => store.dispatch(updateSelectionFocus(selectSlot(store.getState(), 'select')));
// CommandPalette / useUrlSync (React):
const dispatch = useAppDispatch();
dispatch(requestFocus(`famous:${id}`));
dispatch(requestFocus(hashFocusId));
```

---

## 7. Effects — sagas on the `SagaContext` seam

All selection effects are sagas reached through the injected `SagaContext`. The store
reducers stay free of engine references; engine capabilities cross in only through
`getContext`, exactly as `runTierTransition` does — so ADR 0001's no-store-effects
stance is **upheld**, not reverted. The engine extends the context it already injects:

```ts
export type SagaContext = {
  runTierTransition: RunTierTransition; // already present
  requestRender: () => void;            // render-on-demand wake
  resolveDeps: () => ResolveDeps;       // live catalogs / famousMeta / structures (lazy — GPU lands post-bootstrap)
};
setSagaContext({ runTierTransition, requestRender, resolveDeps });
```

### 7a. Render-wake

`select`/`focus` wake the loop (halo, focus fade); `hover` must not (it has no GPU
consequence — it only feeds React).

```ts
function* watchSelectionWake() {
  const requestRender = yield* getContext<SagaContext['requestRender']>('requestRender');
  yield* takeEvery([updateSelectionSelect, updateSelectionFocus], () => requestRender());
}
```

A no-op re-select still fires `requestRender` (the action dispatches even when the
reducer no-ops the state), but it is idempotent and coalesced into one rAF — accepted
as the cost of the uniform saga vehicle.

### 7b. Row reconciliation — the single owner of `selectionRows`

The keystone: one saga keeps every row in sync with its ref. On a ref change it
re-extracts that slot; on `catalogLoaded` it re-extracts any slot whose row is still
`null` (a deep link or a tier galaxy whose cloud just arrived).

```ts
function* reextract(slot: SelectionSlot) {
  const deps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
  const ref = yield* select((s: RootState) => s[selectionRoute][slot]);
  yield* put(setSelectionRow({ slot, row: extractSelectionRow(ref, deps()) }));
}

function* watchSelectionRows() {
  yield* takeEvery(updateSelectionHover, () => reextract('hover'));
  yield* takeEvery(updateSelectionSelect, () => reextract('select'));
  yield* takeEvery(updateSelectionFocus, () => reextract('focus'));
  // a late cloud makes a previously-unresolvable ref resolvable — fill the gaps:
  yield* takeEvery(catalogLoaded, function* () {
    for (const slot of ['hover', 'select', 'focus'] as const) {
      const row = yield* select((s: RootState) => s[selectionRowsRoute][slot]);
      const ref = yield* select((s: RootState) => s[selectionRoute][slot]);
      if (row === null && ref !== null) yield* reextract(slot);
    }
  });
}
```

The row is the *minimal* projection, so even hover (which changes at pick frequency)
dispatches only a small action — devtools chatter, not a perf cost.

### 7c. Deep-link / `requestFocus` deferral

`requestFocus` resolves a durable id to a ref, deferring on `catalogLoaded` until the
cloud is ready; the row saga (7b) then fills the row.

```ts
function* watchRequestFocus() {
  yield* takeLatest(requestFocus, function* (action) {
    const resolveDeps = yield* getContext<SagaContext['resolveDeps']>('resolveDeps');
    let ref = resolveFocusId(action.payload, resolveDeps());
    while (!ref) { yield* take(catalogLoaded); ref = resolveFocusId(action.payload, resolveDeps()); }
    yield* put(updateSelectionFocus(ref)); // 7b reconciles the row off this
  });
}
```

---

## 8. Tier swap — re-anchor folded into the existing `tierSaga`

A stored `(source, index)` is positional: after a tier swap the same index resolves
to a different galaxy (or `null`). The fix re-anchors by durable id, as an addition to
the landed `tierSaga` (capture before eviction, re-resolve after):

```
dispatch requestTier('large')                 // already the UI path
  → tierSaga (extended):
       prev = select(tier); if prev === next return
       reanchor = captureGalaxyFocusIds(select(selection), resolveDeps())  // BEFORE the write — old clouds present
       put(updateSelectionHover(null))
       put(setTier(next)); run?.(prev, next)   // eviction + reload starts
       for [slot, id] of reanchor:
            take(catalogLoaded for that source)               // bounded: this tier's load WILL complete
            put(SELECTION_WRITE_BY_SLOT[slot](resolveFocusId(id, resolveDeps()) ?? null))  // hit → re-anchor, miss → clear
```

The re-anchor writes the *ref*; the row saga (7b) re-fills the row off the same
`catalogLoaded`. Capture is a read at the top, pre-eviction — no closure stash, no
persistent `pendingReanchor`. `takeLatest` on `requestTier` (already how the saga is
wired) aborts an in-flight re-anchor if a newer tier change arrives. Structures /
milkyWay refs are untouched (already durable). The landed `runTierTransition` stays
fire-and-forget — re-anchor keys off `catalogLoaded`, not the runner's completion.

---

## 9. Blast radius

**Delete:** `selectionSubsystem.ts`, `targetEq.ts`, `targetIdentityKey.ts`,
`commitFocus.ts`/`commitFocusTable.ts`/`commitGalaxyFocus.ts`/`commitStructureFocus.ts`/
`commitMilkyWayFocus.ts`, `clearAll.ts`, the `FocusTarget` type, the handle methods
`selectFamous`/`selectByAlias`/`focusOn`, the `useEngine` `useState` mirrors +
`onHoverChange`/`onSelectChange`/`onFocusChange` echo callbacks, `useUrlSync`'s drain.
No `makeResolveSlot` engine memo and **no** `resolveRef`/`resolveSelection` handle
method are introduced — the read is pure-store.

**Rework:** `resolvePick`/`resolvePickTable` (pick → ref), `wireInput` (dispatch refs
to the injected store), `useUrlSync` (→ `dispatch(requestFocus)` + nothing else —
deferral is the saga's), `CommandPalette` (→ `useAppDispatch` + `requestFocus`),
`useEngine` (echo+`useState` → `useAppSelector(selectXFocusable)`; InfoCard unchanged),
`focusUrl.ts` (`selectionToFocusId` → `focusIdOf`; `parseFocusHash` → `resolveFocusId`),
`galaxyInfoBuilder.ts` (split into engine `extractGalaxyRow` + pure React `buildGalaxyInfo`),
`tierSaga` (add the re-anchor read + bounded `take`), `SagaContext` + the engine's
`setSagaContext` (add `requestRender` + `resolveDeps`), the galaxy-catalog commit path
(dispatch `catalogLoaded`), the per-frame selection readers (`selectionRingPass`,
`runFrame`) → read `selectionRows`.

**Add:** `SelectionRef.d.ts`, `SelectionRow.d.ts` + `GalaxyRow`, the `selection` +
`selectionRows` + `dataStatus` slices + the three route constants + route entries,
`requestFocus` / `catalogLoaded` / `setSelectionRow` actions, `extractSelectionRow`
(+ `extractGalaxyRow`) and `buildFocusable` (+ `buildGalaxyInfo`), the §3b reselect
build-selectors, `focusIdOf` / `resolveFocusId`, the `watchSelectionWake` /
`watchSelectionRows` / `watchRequestFocus` sagas (forked from `rootSaga`).

**Unchanged:** InfoCard + the `DETAIL_CARD` table + detail cards (consume
`selected`/`hovered`/`focused` as before), `tweenToGalaxy` / `tweenToStructure`, every
settings selector/consumer.

---

## 10. Build order (incremental, suite green at each step)

1. **Split the builder + the codecs**, behind the existing subsystem (no behaviour
   change): `extractGalaxyRow` / `buildGalaxyInfo` (prove `buildGalaxyInfo(extractGalaxyRow(...))`
   equals today's `galaxyInfoBuilder` output), `SelectionRef` / `SelectionRow`,
   `extractSelectionRow` / `buildFocusable`, `focusIdOf` / `resolveFocusId`; unit-test
   in isolation.
2. **The slices + selectors**: `selection`, `selectionRows`, `dataStatus` (with
   `updateSelection*` / `clearSelection` / `setSelectionRow` / `requestFocus` /
   `catalogLoaded`), the three route constants + `rootReducer` entries, the §3b
   build-selectors; dispatch `catalogLoaded` from the commit path.
3. **The reconciler saga** (`watchSelectionRows`) + `SagaContext`/`setSagaContext`
   extension, forked from `rootSaga` — `selectionRows` now tracks the refs.
4. **Cut the reads over**: engine per-frame readers → `selectionRows`; `useEngine` →
   `useAppSelector(selectXFocusable)`, deleting the `useState` mirrors + echo
   callbacks. InfoCard keeps its props.
5. **Cut the writes over** to direct dispatch: `wireInput` + pick → `updateSelection*`;
   deep-link/palette → `requestFocus`; add `watchSelectionWake` + `watchRequestFocus`;
   fold re-anchor into `tierSaga`. Delete `selectFamous`/`selectByAlias`/`focusOn`/
   `commit*`/`clearAll`/`targetEq`/`targetIdentityKey`/`FocusTarget`.
6. **Delete `selectionSubsystem.ts`**; reconcile tests.

---

## References

- [ADR 0007](../../adrs/0007-intent-centric-state-and-effects.md) — intent-centric
  state; this is its first *application-state* fold. The §1 two-layer split (Intent
  ref + reconciled derived row) and the bend in "What changed" (a derived cache
  materialized in the store, owned by the effects layer) extend it.
- [`intent.md`](../../superpowers/conventions/intent.md) — the lens; §4 here is its
  "Resources and derived state across the store boundary" rule. The materialized-row
  cache is a conscious, recorded exception to its "derived = never mirror" line,
  justified as single-owner reconciliation.
- [ADR 0001](../../adrs/0001-fade-ownership.md) — fade ownership. **Upheld:** effects
  are sagas reached via `SagaContext`; no store-listener middleware. ADR 0008 (the
  deferred vehicle decision) is **moot** — settled by the RTK + `typed-redux-saga`
  migration.
- [Grill session 2026-06-18](../../grill-sessions/selection-into-intent-store-2026-06-18.md)
  — the nine decisions. Decision 9 (effects vehicle) is resolved: uniform sagas. The
  read-boundary decision (carry the data as a minimal reconciled row, not the
  resolver) supersedes the draft's resolve-at-read.
