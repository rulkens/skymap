# Intent — separating what the user wants from what the system does

> **Audience.** Anyone organizing, writing, or refactoring skymap state. This is
> the lens we use to decide _where a piece of state lives_ and _who is allowed to
> change it_ — the state-shaped companion to [`simplicity.md`](simplicity.md),
> which is value-shaped. It distils Steven Wittens' "Intent" / effect /
> reconciliation writing (acko.net) into skymap-specific guidance.
>
> **Status.** Principles doc — advisory, but the Do/Don't lines are the
> prescriptions. The codebase is **partway** here: `state.settings` already is an
> Intent store; much other state (selection in subsystem closures, React
> `useState` mirrors, in-place item mutations) is not yet. This doc is the target,
> and the direction of travel — see [ADR 0007](../../adrs/0007-intent-centric-state-and-effects.md).

## TL;DR

**Intent is the source of truth you mutate; everything the renderer reads is
_derived_ from it.** The user expresses Intent; the system continuously,
non-destructively _validates_ Intent into State; State drives the View. State
flows one way and never flows back.

```
Intent  ──validate──▶  derived State  ──▶  View
(mutate this)          (compute, never store)    (GPU)
```

The whole job is: **one home for Intent, a single write path into it, and no
mirrors of anything derived from it.** A value reachable only through a mutable
place that a second path reads "for truth" is the stale-state bug — by
construction, not by accident.

## The four layers

Every piece of runtime state is exactly one of these. Classifying it is the first
question; it decides where the state lives and who may write it.

| Layer | What it is | Where it lives | Who writes it |
| --- | --- | --- | --- |
| **Intent** | The user-space source of truth. Discrete, snapshot-able, _may name things that aren't realizable yet_. | The one Intent store. | Only the single write path (a dispatched patch). |
| **Derived State** | The continuous, non-destructive _validation_ of Intent (+ data + camera). | Nowhere — computed on read, or memoized. | Nobody. It is a pure function of its inputs. |
| **View** | Pixels. | The GPU. | The frame loop, from a fresh derived snapshot. |
| **Resource / kernel** | Imperative, device-lifecycle-bound things: buffers, textures, pipelines, the live camera pose. | Engine-owned imperative handles. | The engine, imperatively. Read-only consumer of derived State. |

### Intent — the source of truth you mutate

Intent is what the user _wants_, captured as plain serializable data. In skymap
that is: every SettingsPanel knob, the selection/attention ladder
(hover → select → focus), and a tour's intent. Three properties make Intent
Intent:

1. **It is the single source of truth.** Nothing downstream is authoritative;
   everything else is derived from Intent.
2. **It may reference things that aren't realizable yet.** A volume field's
   `enabled` is seeded from `SOURCE_REGISTRY` _before its cube has loaded_; a
   per-catalog toggle persists while the catalog is hidden. This is acko's
   "the tree-view remembers the expand state of a hidden row." Intent is not
   gated on the world being ready — validation handles that, continuously.
3. **It is mutated only through a single write path.** No nested field mutation,
   no second copy in a subsystem closure, no React `useState` mirror. One write
   path is what makes "who writes this?" answerable with a single name.

### Derived State — validate continuously, never store

Everything the renderer needs that _isn't_ raw Intent is derived: the source
visibility bitmask, the fade _target_ for each layer, the demand decision (what
to load), the scale-bar legend, the focus blend. The rule:

> **Derived State is computed on read (or memoized), never stored as a second
> authoritative copy.** `deriveSourceMasks` recomputes the bitmask every frame
> from `enabled` + live fade opacity; it is never cached and hand-synced. That is
> the model — extend it, don't add mirrors.

Validation is _non-destructive and continuous_: the same Intent always yields the
same State, and we re-run it as inputs change rather than mutating a stored result
in place. skymap's per-frame demand re-evaluation already is this step — it just
wasn't named one.

### View and Resource

The View is GPU output, drawn each frame from a fresh derived snapshot. Resources
(GPU buffers/textures/pipelines) are imperative, device-lifecycle-bound, and
**read-only consumers** of derived State — a renderer must never cache what Intent
owns (see `renderers.md`, and `simplicity.md` #5/#8).

The **live camera pose** is the deliberate carve-out: it is mutated every frame by
the orbit drivers, so it is a Resource, not Intent. The camera's _target_,
auto-rotate flag, and focus selection _are_ Intent; the live orbit position is an
"immutable reference with a mutable register inside" — moving the camera must not
re-run any validation. (This is exactly Use.GPU's camera-uniform pattern.)

## Prescriptions

### 1. One home for Intent, a single write path

Every Intent value has exactly one home and is changed only by dispatching a
patch. No subsystem holds its own authoritative copy; no React component mirrors
it in `useState`; no code mutates a nested field in place.

- **Do:** route every change through the one write path; read via a selector.
- **Don't:** keep an optimistic React copy "for snappiness," mutate
  `items[id].enabled` in place, or let a subsystem closure be the truth for
  something the panel also shows. (Today's `flow` optimistic mirror, the in-place
  `items[id]` writes, and `restoreSettings`/`applyEffect`'s in-place store
  mutation are the named anti-patterns to retire.)

### 2. Name the single reader and single writer — a mismatch is a mirror

This is `simplicity.md`'s sharpest line, and it _is_ the stale-state test. For any
state, name who writes it and who reads it for truth. If a field is written by one
path and read-for-truth by another, it is a mirror — fold it to one home (usually:
delete the copy, derive it).

### 3. Intent stays serializable

Intent is plain data — maps, records, arrays, primitives. No `Set`s
(`debug.disabledPasses` → `Record<string, true>`), no class instances, no GPU
handles. Serializable Intent is what lets a tour be _recorded and replayed_, a
view be _deep-linked_, and the state be _inspected_. Non-serializable Intent
forecloses all three.

### 4. Tours are an ephemeral Intent overlay, not capture/restore

A tour does **not** snapshot settings, mutate them, and restore the snapshot
(that round-trip is where stale-state bugs breed — see `restoreSettings`). A tour
layers **ephemeral Intent** on top of committed Intent; the renderer validates the
overlay-merged Intent; ending the tour **resets the overlay to empty** and
committed Intent is revealed again, untouched. Rewinding is "clear the overlay,"
not "replay a saved copy." This dissolves the staleness class and makes "more
tours later" cheap.

```
committed Intent  ──┐
                    ├─ merge ─▶ validate ─▶ View
ephemeral overlay ──┘   (tour writes here; end = reset to {})
```

### 5. Effects are reactive consequences of Intent, in one place

Side effects — demand-driven loads, GPU uploads, fade-_triggering_ — are
consequences of Intent changing, and belong in one explicit effects layer, not
scattered across setters. (The vehicle — RTK listener middleware vs.
typed-redux-saga — is an open sub-decision in
[ADR 0007](../../adrs/0007-intent-centric-state-and-effects.md); the _principle_
is settled: effects react to Intent, in one home.) Note that a fade's _opacity_ is
derived State (per-frame, never dispatched); only the _decision to start a fade_
is an effect.

## Resources and derived state across the store boundary

The four-layer table says resources stay imperative and out of the store. That
leaves the question every derived value eventually hits: **how does a pure,
memoized derivation combine Intent (in the store) with a heavy resource — a point
cloud, a sidecar, a GPU buffer — that must never enter the store, and how does a
React consumer re-render when the _resource_ changes, not just the Intent?**

The derived value is `D = f(Intent, Resource)`. Intent is serializable and
subscribable; the resource is a large, device-bound reference. Three needs pull
apart:

1. **Purity** — `D` is a pure function of its inputs.
2. **Memoization** — don't rebuild `D` on every read.
3. **Notification** — a consumer must recompute when _either_ input changes.

Purity and memoization are easy. **Notification is the hard part**: the consumer
subscribes to the store, and the resource isn't in it. Two tempting wrong turns,
both of which reintroduce the staleness class this whole doc exists to kill:

- **Copying the resource into the store** to make it subscribable — a mirror, by
  construction.
- **Reaching into a mutable singleton inside the selector** (`getCatalogs()`
  mid-derivation) — breaks purity _and_ memoization: the output now depends on
  something the inputs don't capture, so nothing can tell when to recompute.

### The rule: store a descriptor, dereference at the edge

> The store holds Intent **plus serializable _descriptors_ of resources** — ids,
> versions, readiness flags — never the resource bytes. Derived values are pure
> functions of `(Intent, descriptor, dereferenced-resource)`; the resource is
> dereferenced **as late as possible, at the resolver's edge**, and its
> **identity** (the descriptor) is what drives memoization and change-notification.
> Invalidation flows through the descriptor. The bytes never cross into
> subscribable state; only their identity does.

Purity is recovered by making the resource an **explicit, identity-tracked input**
rather than an ambient reach. Concretely, split "a selector that needs a resource"
into two pure pieces:

```ts
// 1. A pure STORE selector — sees only what's in the store. Returns Intent.
export function selectSelectedRef(state: RootState): SelectionRef | null {
  return state.selection.select;
}

// 2. A pure RESOLVER — fed the resource explicitly, memoized on resource identity.
//    NOT a store selector: its inputs aren't all in the store.
export function resolveSelectionRef(
  ref: SelectionRef | null,
  catalogs: ReadonlyMap<SourceType, GalaxyCatalog>,
  famousGalaxiesMeta: readonly FamousGalaxyMetaEntry[],
): FocusableTarget | null {
  if (ref === null) return null;
  // ...dereference the cloud HERE, at the edge, and build the derived value.
}
```

The resource bytes are touched only inside the resolver, never stored; the
store-side selector stays pure over store state.

### Closing the notification gap: the descriptor is a store fact

The resolver re-runs when its inputs change — but a React consumer only re-renders
on _store_ changes, and a catalog finishing its load is not a store change. The fix
is **not** to push the resolved value into the store (mirror); it is to project the
resource's _readiness_ into the store as a small serializable descriptor, dispatched
from the one place the resource commits:

```ts
// In the resource layer's commit path — the ONE place a cloud lands:
store.dispatch(catalogLoaded({ source, generation: nextGen }));
// state.data.catalogs[source].generation === nextGen   (a number, not the cloud)
```

Now "source X is ready at generation N" is a store fact, and a consumer keys on it:

```ts
const ref = useStore(selectSelectedRef);
const gen = useStore((s) => selectCatalogGeneration(s, ref?.source));
// `gen` participates so a late-arriving cloud forces a re-resolve:
const target = useMemo(
  () => resolveSelectionRef(ref, engine.catalogs(), engine.famousGalaxiesMeta()),
  [ref, gen], // ref from Intent, gen from the descriptor
);
```

A deep-linked selection whose cloud hasn't loaded resolves to `null`, then
re-resolves the instant `catalogLoaded` bumps the generation — no echo callback, no
mirror, no stale copy. The descriptor is the bridge; the bytes stay imperative.

This is the manual, principles-only form of what a reconciler (or an atom/signal
graph) tracks automatically: an explicit dependency on a resource's _identity_. It
is also the RTK Query / entity-adapter shape — the store holds ids, versions, and
status; a side cache holds the blobs; subscriptions fire on status transitions.
Skymap already has the raw material: AssetSlot generation counters _are_ the
descriptor; they need only projecting where selectors and React can key on them.

### Where this generalizes

The same boundary recurs wherever derived state needs a heavy resource: a volume
field reading its SCFD cube, the InfoCard reading a thumbnail, labels reading the
glyph atlas. In every case — **Intent (or a ref) in the store; the resource
imperative; a serializable descriptor bridging them; dereference at the edge;
memoize on identity.** If you find yourself wanting to put the resource in the store
to make a view update, reach for the descriptor instead.

## Worked example: folding the selection subsystem

Selection is the cleanest illustration of every rule above, and the obvious first
fold. Today the hover/select/focus targets live in a **subsystem closure**
(`selectionSubsystem`), React keeps a **parallel `useState` copy** of
`selected`/`focused`/`hovered`, and the two are kept in sync by **echo callbacks**
(`onSelectChange`/`onHoverChange`/`onFocusChange`). That is two authoritative homes
plus a derived copy — the exact mirror shape prescription #2 names.

Under the lens it decomposes cleanly:

- **Intent → the store.** The three targets are the attention ladder — pure user
  intent. They move into the Intent store as `selection: { hover, select, focus }`
  (each a serializable `FocusableTarget | null`). The store's held shape grows from
  "settings only" to "all Intent"; `state.settings` stays a view onto its settings
  slice.
- **The mirror dies.** React reads the targets through a selector; the `useState`
  copies and the echo callbacks are deleted. One home, one write path (dispatch),
  one reader.
- **The wake becomes an effect.** Selecting/focusing currently calls
  `requestRender()` (scene halo / focus fade) while hovering does not. That
  scheduler-wake is a _reactive consequence of the Intent change_ — it moves to the
  effects layer (react to a select/focus patch → `requestRender`), not a side effect
  buried in a setter.
- **Dedup stays, as derivation discipline.** The "only fire on actual change"
  guard is just selector identity now — React re-renders only when the selected
  target actually changes.

The result: the three-level attention ladder has one home, no mirror, and its one
side effect (the wake) sits with every other effect. Nothing about the camera tween
it triggers changes — `focusOn` still drives the camera imperatively; only the
_selection intent_ centralises.

## The boundary — what is Intent vs. derived vs. resource

When you add state, classify it before you place it:

| Goes in the Intent store | Is derived (compute / memoize) | Stays imperative (Resource) |
| --- | --- | --- |
| SettingsPanel knobs | source draw/pick masks | GPU buffers, textures, pipelines |
| selection: hover / select / focus | fade opacities | the live camera orbit pose |
| tour intent (committed + ephemeral overlay) | scale-bar legend | atlas / LRU residency |
| anything React currently mirrors in `useState` | demand decisions, load progress, member counts | asset-slot fetch machinery |

A useful smell test: **if dispatching it 60×/second would be absurd, it is not
Intent.** Per-frame data (fade opacity, camera pose, masks) is derived or
resource, never dispatched.

## Relationship to the reconciler (why we adopt principles, not a runtime)

The deepest expression of "derived State can never go stale" is a **reconciler**:
a runtime where derived values live in call-site-keyed caches (fibers),
memoization is the default at every boundary, and the execution trace _is_ the
dependency graph — so a mirror literally cannot form. Wittens' headless-React
"Live" runtime (Use.GPU) drives WebGPU this way, and it fits skymap's shape
precisely: a few dozen **orchestration nodes on top** (device, passes, demand,
fades, camera) with **data-parallel millions of points underneath** that are never
mounted as nodes.

We have **evaluated and deferred** the runtime (it is a foundational rewrite; see
[ADR 0007](../../adrs/0007-intent-centric-state-and-effects.md)). We adopt its
_principles_ — Intent down, derive don't mirror, effects as reconciled
consequences, single source of truth — without the runtime. If we ever go
foundational, Live is the acknowledged north-star.

## Checklist

A quick pass when adding or reviewing state:

- Which **layer** is this — Intent, derived, View, or Resource? Place it
  accordingly.
- Does this Intent have **one home** and a **single write path**? Or is there a
  closure copy / a React mirror / a nested in-place mutation?
- Can I name the **single reader and single writer**, and do they agree? (Mismatch
  = mirror = fold to one home.)
- Is this thing I'm about to _store_ actually **derivable**? Derive it instead.
- Is the Intent **serializable** (no Sets, no class instances, no GPU handles)?
- For a tour/preview: am I **snapshotting-and-restoring** (anti-pattern) or
  **layering ephemeral Intent** (correct)?
- Would dispatching this **60×/second** be absurd? Then it's not Intent.

See also: [`simplicity.md`](simplicity.md) (value × time, single source of truth),
[`singleton-overlay-layers.md`](singleton-overlay-layers.md) (settings vs. status
vs. demand for global layers), and
[ADR 0007](../../adrs/0007-intent-centric-state-and-effects.md) (the decision and
its supersede map).
