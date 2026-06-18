# Selection into the Intent Store (design)

> **Status:** approved design, awaiting implementation plan.
> **Why this exists:** selection (hover → select → focus) is the cleanest
> illustration of the scattered-authoritative-state pattern
> [ADR 0007](../../adrs/0007-intent-centric-state-and-effects.md) names: the
> targets live in a subsystem closure (`selectionSubsystem.ts`), React keeps a
> parallel `useState` copy, and the two are reconciled by echo callbacks
> (`onHoverChange` / `onSelectChange` / `onFocusChange`). That is two
> authoritative homes plus a mirror — the exact shape `intent.md` #2 forbids. This
> spec folds selection into the engine Intent store as the **first intent-migration
> fold**, and in doing so collapses the stray `engine.ts` entry points
> (`selectFamous`, `selectByAlias`, `focusOn`) the cleanup was originally about.
> Grounded in the grill session
> [`docs/grill-sessions/selection-into-intent-store-2026-06-18.md`](../../grill-sessions/selection-into-intent-store-2026-06-18.md).

## Scope

Fold selection (hover/select/focus) into the centralized engine store as
**Intent**, with the resolved `FocusableTarget` becoming **derived** state:

1. **Reference, not snapshot.** The store holds a serializable `SelectionRef`;
   `GalaxyInfo` / `StructureInfo` are resolved at the read boundary, memoized.
2. **One Intent home, single write path.** A `selection` slice with a
   dedup-on-write reducer; the React `useState` mirrors and echo callbacks delete.
3. **Two doors, not five entry points.** `focus(ref)` + `focusByFocusId(string)`;
   `selectFamous` + `selectByAlias` + `focusOn` + the `useUrlSync` drain + the
   `FocusTarget` type all dissolve.
4. **Effects on a listener seam.** The render-wake and the tier-swap re-anchor
   become effects on a store-boundary listener layer (reverting the
   no-middleware stance), shown both ways pending the ADR 0008 vehicle.

**Target store: the current zustand-vanilla store.** Everything here is
vehicle-agnostic and lands on the store we have today. The RTK (+ possibly
typed-redux-saga) migration is a **separate, later** effort; the shapes chosen
here — slices, selectors, actions-as-setters, a descriptor slice, a listener seam —
are RTK-ready by construction, so that migration is mechanical, not a redesign.

**Out of scope (do not scope-creep):**

- The effects-layer **vehicle** decision (RTK `createListenerMiddleware` vs.
  typed-redux-saga) — [ADR 0008](../../adrs/), still open. This spec shows the
  orchestrated flows both ways.
- **Converging `syncVisibilityFades`** onto the listener seam — it stays an
  explicit bridge for this fold; it converges at the vehicle migration. Recorded
  as a known temporary two-pattern state, not drift.
- Converting **settings** to actions, `debug.disabledPasses` `Set`→`Record`,
  tours-as-overlay — later folds.
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
the reference as the single Intent collapses that.

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

## 2. The store shape

`RootState` grows from "settings only" to "all Intent + resource descriptors".
**Nested slices**, and **`tier` promoted out of `settings`** — both for the same
reason: a settings/tour `restoreSettings` round-trip must not sweep up selection
or the data-resolution level.

```ts
export type RootState = {
  tier: Tier; // promoted: own lifecycle, not swept by a settings restore
  settings: EngineSettingsState; // knobs only (today's store, unchanged shape)
  selection: SelectionState; // the attention ladder
  dataStatus: DataStatusState; // serializable resource *descriptors* — never bytes (§4)
};

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

The blast-radius worry — "every settings selector now needs `s.settings.…`" —
dissolves because `useSettingsStore` scopes its snapshot to `.settings`
internally (one line: `selector(store.getState().settings)`), so **every existing
settings consumer keeps its exact signature, untouched.** Selection gets its own
`useSelection` selector hook.

Seed `selection` to all-`null` and `dataStatus` to empty at store construction
(same "seed at construction" rule as `drawMask` / volume fields).

---

## 3. Reads — getters resolve, memoized

Resolution splits into two pure pieces (the `intent.md` "Resources and derived
state across the store boundary" rule):

```ts
// pure STORE selector — sees only the store. Returns Intent.
export const selectSelectedRef = (s: RootState): SelectionRef | null => s.selection.select;

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
    const ref = selectSlot(state.store.getState(), slot);
    const ds = state.store.getState().dataStatus;
    const gen =
      ref?.type === 'galaxyCatalog' ? (ds.catalogGen[ref.source] ?? 0)
      : ref?.type === 'structure' ? ds.structureGen
      : 0;
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

Per-frame consumers (`selectionRingPass`, `selectionHaloTable`, `runFrame`'s
`structureFocus.update`) and React (InfoCard) read **through** this getter, so they
keep consuming a resolved `FocusableTarget` unchanged — they never touch catalogs.

---

## 4. The resource boundary — the descriptor bridge

A pure store selector can't resolve a ref, because resolution needs the catalogs,
which are heavy GPU-backed resources that **stay out of the store**. The
notification gap — React must re-render when a *late-arriving cloud* makes a
previously-null ref resolve — is closed not by mirroring the resolved target into
the store, but by projecting the resource's **readiness** into the store as a
serializable **descriptor**: `dataStatus.catalogGen`.

This is the rule written into
[`intent.md` § "Resources and derived state across the store boundary"](../../superpowers/conventions/intent.md).
It is dispatched from the one place a cloud commits:

```ts
// galaxyCatalogSourceRegistry.ts commit path — the ONE place a cloud lands:
store.dispatch(catalogLoaded({ source, generation: nextGen })); // a number, not the cloud
```

React keys on it; a deep-linked selection whose cloud hasn't loaded resolves to
`null`, then re-resolves the instant `catalogGen` ticks:

```ts
const ref = useSelection((s) => s.select);
const gen = useStore((s) => (ref?.type === 'galaxyCatalog' ? s.dataStatus.catalogGen[ref.source] ?? 0 : 0));
const selected = useMemo(() => handle.current?.selection.resolve('select') ?? null, [ref, gen]);
```

Skymap already has the raw material — AssetSlot generation counters *are* this
descriptor; they need only projecting into `dataStatus`.

---

## 5. Writes — the slice, dedup is generic

The single write path is the `selection` slice. Dedup (today's `targetEq`
short-circuit) moves into the reducer and becomes **generic**: `SelectionRef` is
flat primitives, so a stock `shallowEqual` *is* structural equality — no per-type
code.

```ts
import { shallowEqual } from 'react-redux'; // or the zustand-side equivalent

const setIfChanged =
  (key: keyof SelectionState) =>
  (state: SelectionState, { payload }: PayloadAction<SelectionRef | null>) => {
    if (!shallowEqual(state[key], payload)) state[key] = payload;
  };

const selectionSlice = createSlice({
  name: 'selection',
  initialState: { hover: null, select: null, focus: null } as SelectionState,
  reducers: {
    hover: setIfChanged('hover'),
    select: setIfChanged('select'),
    focus: setIfChanged('focus'),
    clear: (s) => { s.select = null; s.focus = null; }, // dismiss: deselect AND drop focus
  },
});
```

On the **zustand store today** this is the same logic via a setter that returns the
*same* state object on a no-op (zustand's dedup mechanism):
`set((s) => shallowEqual(s.selection[key], ref) ? s : { ...s, selection: { ...s.selection, [key]: ref } })`.

The payoff: the old "fire callback only on actual change" guard becomes "no new
state on a no-op" → **no subscriber notification, no React re-render, no
render-wake**, all from one guard. And the invariant *ref identity is stable when
the value is unchanged* lets §3's memo and §7's wake compare with `===`.

`targetEq.ts` **and** `targetIdentityKey.ts` delete with no bespoke replacement.

> Reference (`===`) equality is wrong here — every pick builds a fresh ref object,
> so `===` would always miss; making it work would need interning (more plumbing).
> `shallowEqual` gets the dedup without interning.

---

## 6. Entry points — two doors, `FocusTarget` deleted

`selectFamous` / `selectByAlias` / `focusOn` are all "resolve an identifier →
commit focus," differing only in the identifier. They split into **two doors** and
delete:

```ts
// Door 1 — the ref door (Intent write path). Replaces focusOn(target) and selectByAlias({source, localIdx}).
function focus(ref: SelectionRef | null): void {
  store.dispatch(selectionActions.focus(ref)); // the tween is an effect (§7), not part of the write
}

// Door 2 — the durable-id door. Replaces selectFamous(id). Stateless: resolve-or-noop.
function focusByFocusId(focusId: string): void {
  const ref = resolveFocusId(focusId, deps);
  if (ref) focus(ref);
  // else: not resolvable yet — the CALLER's effect retries on catalogGen (§ below). No engine pending state.
}
```

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
// wireInput double-click: was focusOn(selected()); now read the ref:
onDoubleClick: () => handle.selection.focus(selectSlot(store.getState(), 'select')); // null releases focus
// CommandPalette famous: was selectFamous(id):
onSelect: (id) => handle.selection.focusByFocusId(`famous:${id}`);
// useUrlSync: was parse → resolveFocusTarget → selectByAlias:
handle.selection.focusByFocusId(hashFocusId);
```

**No engine `pendingFocus`.** The deep-link "retry when the cloud arrives" is the
*consumer's* effect, keyed on the `catalogGen` descriptor — and `useUrlSync`
already owns the URL's pending; under the descriptor bridge its bespoke drain
becomes one effect:

```ts
const focusId = useStore(selectUrlFocusId);
const gen = useStore(selectAllCatalogGen);
useEffect(() => { if (focusId) handle.current?.selection.focusByFocusId(focusId); }, [focusId, gen]);
```

Deferral is always the consumer's effect (URL today, tours later), never a field on
the engine.

---

## 7. Effects — a listener seam on the store

`select`/`focus` must wake the render-on-demand loop (halo draw, focus fade);
`hover` must **not** (it only feeds the React InfoCard — no GPU consequence). Today
this wake is baked into the subsystem setters. It moves to a **store-boundary
listener seam** — the effects layer `intent.md` #5 calls for — **reverting the
`fades-not-zustand-middleware` / ADR 0001 no-middleware stance.**

This is a deliberate reversal, made because the target architecture is RTK with an
effects layer: standing up the seam now (on zustand) means one effects pattern that
migrates 1:1 to `createListenerMiddleware`, rather than a bridge rewritten later.

```ts
// effectsMiddleware — a tiny listener layer: after each transition, run (prev, next) listeners.
// Maps 1:1 onto RTK createListenerMiddleware later. selection-wake is its first listener:
listen(store, (prev, next) => {
  if (next.selection.select !== prev.selection.select || next.selection.focus !== prev.selection.focus) {
    requestRender(); // essential wake; hover deliberately excluded (no GPU consequence)
  }
});
```

Two consequences, named so the reversal is deliberate:

1. **The store layer now couples to `requestRender`** (injected into the listener
   layer at bootstrap) — exactly what the fades bridge avoided. Accepted as the
   cost of the effects seam.
2. **`syncVisibilityFades` is temporarily the odd one out** (bridge, while
   selection is on the seam). Tolerated for this fold; converges at the vehicle
   migration. A known temporary inconsistency, recorded here so it doesn't read as
   drift.

This reversal is recorded in ADR 0007 (or a short follow-up): *effects land at the
store boundary as a listener seam; the no-middleware stance is retired.*

---

## 8. Tier swap — `requestTier` Intent action + a transition effect

A stored `(source, index)` is **positional**: after a tier swap the same index
resolves to a *different* galaxy (or `null`). "Do nothing" is the one wrong
option (silently wrong galaxy). The fix re-anchors by durable id — and it is
cleanest as a **`requestTier` Intent action + a transition effect**, because that
*dissolves* the capture-before-eviction problem:

```
dispatch requestTier('large')
  → reducer: state.tier = 'large'        // old clouds STILL loaded — only intent changed
  → effect fires (reacts to the tier intent):
       1. capture durable focus-ids       // old clouds present → focusIdOf works
       2. run the transition (evict + load) // eviction happens HERE, after capture
       3. on completion → re-resolve ids → focus(newRef)  (null clears a dropped-out galaxy)
```

The effect reacts to the **intent** (`requestTier`), so it fires *before* any
eviction and the capture is just a read at the top — no pre-capture function, no
closure stash, no persistent `pendingReanchor` field. `tier` becomes a proper
Intent with a single write path (consistent with promoting it to `RootState`, §2);
the UI dispatches `requestTier` instead of calling `handle.setTier`. The existing
`setTier` body is **reused** as `runTierTransition` (companion assets, MCPM, famous
texture unchanged), now *called from* the effect.

### Shown both ways (vehicle deferred to ADR 0008)

**Listener seam (zustand now / RTK listener later):**

```ts
listen(store, async (prev, next) => {
  if (prev.tier === next.tier) return;
  const reanchor = captureGalaxyFocusIds(prev.selection, state.data.galaxies); // pre-eviction
  store.dispatch(selectionActions.hover(null));
  await runTierTransition(next.tier);
  for (const [slot, id] of reanchor) store.dispatch(selectionActions[slot](resolveFocusId(id, state.data.galaxies)));
});
// rapid tier changes need a manual transition token here (RTK listener: cancelActiveListeners).
```

**typed-redux-saga (the orchestrated-flow sweet spot):** `takeLatest` gives
latest-wins cancellation free, `select` is the read, the command/event split is
explicit, and the deep-link deferral becomes a first-class `take`-loop:

```ts
function* onRequestTier(action: ReturnType<typeof requestTier>) {
  const galaxies = yield* getContext<GalaxyData>('galaxies');
  const reanchor = captureGalaxyFocusIds(yield* select(selectSelection), galaxies); // pre-eviction
  yield* put(selectionActions.hover(null));
  yield* call(runTierTransition, action.payload); // takeLatest cancels this if a newer requestTier arrives
  for (const [slot, id] of reanchor) yield* put(selectionActions[slot](resolveFocusId(id, galaxies)));
  yield* put(tierChanged(action.payload)); // the event other reactions hang off
}
function* watchTier() { yield* takeLatest(requestTier, onRequestTier); }

// deep-link deferral as a saga — the "wait until ready" is a yield, not stored state:
function* onRequestFocus(action: ReturnType<typeof requestFocus>) {
  const galaxies = yield* getContext<GalaxyData>('galaxies');
  let ref = resolveFocusId(action.payload, galaxies);
  while (!ref) { yield* take(catalogLoaded); ref = resolveFocusId(action.payload, galaxies); }
  yield* put(selectionActions.focus(ref));
}
```

The read for ADR 0008: **saga earns its keep on the orchestrated edges (tier,
deep-link, tours) — cancellation, sequencing, first-class waits — not on the common
click path, where a one-line listener is lighter.** This fold ships on whichever
vehicle is chosen; the action/selector/effect shapes are identical either way.

`hover → clear`; `select`/`focus` → re-anchor (clear on drop-out); structures /
milkyWay refs untouched (already durable). This is *more* correct than today, which
persists a haloed "ghost" galaxy that may not be in the new tier.

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
resolved target), `wireInput` (dispatch refs), `setTier.ts` (→ `requestTier` +
`runTierTransition`), `useUrlSync` (→ `focusByFocusId` + `catalogGen` effect),
`useEngine` (→ `useSelection` selectors), `useSettingsStore` (scope to `.settings`),
`focusUrl.ts` (`selectionToFocusId` → `focusIdOf`; `parseFocusHash` →
`resolveFocusId`).

**Add:** `SelectionRef.d.ts`, the `selection` slice + `dataStatus` slice +
`requestTier`/`tierChanged` actions, `resolveSelectionRef` + the memoized getter,
`focusIdOf` / `resolveFocusId`, the effects-listener seam + the selection-wake and
tier-transition listeners, `useSelection`.

**Unchanged (read through the getter):** `selectionRingPass`, `selectionHaloTable`,
`structureFocusSubsystem`, `runFrame` selection reads, InfoCard + the
`DETAIL_CARD` table + detail cards, `tweenToGalaxy` / `tweenToStructure`.

~12–15 files of real change; ~65 read sites unchanged.

---

## 10. Build order (incremental, suite green at each step)

1. **`SelectionRef` + resolver + codecs**, behind the existing subsystem (no
   behaviour change): introduce the type, `resolveSelectionRef`, `focusIdOf` /
   `resolveFocusId`; unit-test in isolation.
2. **The slice + `dataStatus`**, seeded at construction; project `catalogGen` from
   the commit path; `useSettingsStore` scoped to `.settings`.
3. **Cut the reads over** to the memoized getter (`selectionRingPass`, `runFrame`,
   InfoCard via `useSelection`); delete the `useState` mirrors + echo callbacks.
4. **Cut the writes over**: `wireInput` + pick → ref dispatches; `focus(ref)` +
   `focusByFocusId`; delete `selectFamous` / `selectByAlias` / `focusOn` /
   `commit*` / `clearAll` / `targetEq` / `targetIdentityKey` / `FocusTarget`.
5. **The effects seam**: render-wake listener; `requestTier` + transition effect;
   `useUrlSync` → `focusByFocusId` + `catalogGen` effect.
6. **Delete `selectionSubsystem.ts`**; reconcile tests.

---

## References

- [ADR 0007](../../adrs/0007-intent-centric-state-and-effects.md) — intent-centric
  state; this is its first fold. The §7 middleware reversal amends it.
- [`intent.md`](../../superpowers/conventions/intent.md) — the lens; the
  "Resources and derived state across the store boundary" section is §4 here.
- [ADR 0001](../../adrs/0001-fade-ownership.md) — fade ownership; §7 retires its
  no-middleware clause.
- [Grill session 2026-06-18](../../grill-sessions/selection-into-intent-store-2026-06-18.md)
  — the nine decisions and their rejected alternatives.
