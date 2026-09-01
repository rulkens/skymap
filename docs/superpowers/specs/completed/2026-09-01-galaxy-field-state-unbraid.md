# galaxyField state un-braid — design

> **Status.** Design spec for the refactor landing on branch `galaxy-field-state-unbraid`.
> Plan: [`docs/superpowers/plans/2026-09-01-galaxy-field-state-unbraid.md`](../plans/2026-09-01-galaxy-field-state-unbraid.md).
>
> **Design authority.** Three entanglement-radar reports, read in full and not
> reproduced here — cite them for the file:line evidence behind every claim below:
>
> - orchestrator (`createGalaxyFieldRenderer.ts`, findings F1–F6) —
>   `scratchpad/radar-orchestrator.md`
> - `field/` (bind-group rebuild protocol, finding 1) — `scratchpad/radar-field.md`
> - `ismMap/` + `gpu/` (findings 1–5 + two smaller items) — `scratchpad/radar-ismmap.md`
>
> (Scratchpad root:
> `/private/tmp/claude-501/-Users-rulkens-Development-js-skymap/303c9c32-508f-46d9-9838-5ca389d651eb/scratchpad/`.
> The reports are session artifacts; the load-bearing content is restated below,
> the file:line evidence is not.)

## 1. Root diagnosis

The module has **one dependency graph** — "this input moved ⇒ these derived values
are stale ⇒ these GPU effects must re-run, in this order". It is currently written
**four times, in four vocabularies, none of which can see the others**:

| Expression | Where | Mechanism |
| ---------- | ----- | --------- |
| CPU derived values | `createGalaxyFieldRenderer.ts:582-634` + `rebuildForTuning` / `rebuildForGeometry` / `setMixture` | 21 closure `let`s, recomputed eagerly under **12 ad-hoc boolean locals** in a fixed statement order |
| Deferred GPU effects | six `createKeyedRebuild` nodes (`:642, :655, :818, :880, :921, :958`) | dirty flags, raised by **11 hand-placed `.invalidate()` calls across 6 functions** |
| Effect ordering | `stepIsmMap` `:1300-1312` | six `.ensureFresh()` calls in a hand-typed order, correctness held by two prose comments |
| Bind-group lifetime | `field/createFieldPipelines.ts:210-363` | **four differently-named `rebuild*` entry points**, fired from three call sites in two files (one of them `tools/galaxy-renderer/src/engine/createGalaxyEngine.ts:248`) |

Nothing type-checks that the four agree, and the file already carries the scar
tissue: the `generatorMoved && !dustMoved` epilogue (`:1234-1242`) is a dependency
edge the mechanism cannot declare, patched afterwards as a corrective branch; the
three unconditional invalidations in `repackFieldComponents` (`:1011-1016`) are a
bug fix that gave up on precision because the mechanism could not express the edge
("a dust-only patch left the spur cloud vanished until an unrelated change fired
it"). Both are *accidental* asymmetries per `simplicity.md` — artifacts of encoding
a graph as statement order — and both are the entanglement-radar's own STOP signal:
prose teaching a reader how to cope with an asymmetry, rather than removing it.

**The organizing principle of this refactor: the module's dependency graph becomes
inspectable DATA — declared nodes and edges — and the imperative code shrinks to a
generic walker over that data.** Every finding below is an application of that one
move; where a report offered a weaker "review the three prose expressions against
each other" fallback (ismMap finding 1), this spec takes the first-class
representation instead.

## 2. Non-goals

- **No rendering behaviour change.** The image is the contract; the refactor is
  pixel-neutral. §6 lists the two intended non-pixel deltas (strictly fewer GPU
  submits, and a pull-instead-of-push bind-group rebuild) and why neither can move
  a pixel.
- **No new capability, no new knob, no API surface added for future use.** Every
  new type in §3 replaces something; the net line count must fall.
- **`src/` stays clean of `tools/` and `src/state/`.** The module takes values and
  returns values (radar-orchestrator §3); that property is preserved, and gated.
- **Not in scope, parked with reasons:**
  - *Shared seed-reinterpretation helper* (ismMap smaller item 1) — the duplicated
    idiom is two lines per site, and the `>>> 0` reinterpretation comment wants to
    live at the pack site it applies to. Extracting it hides the fact it records.
  - *Shared debug-readback helper* (ismMap smaller item 2) — worth doing, debug-only,
    no production risk; it would add a fifth GPU-facing surface to an already large
    PR. Backlog it after this lands.
  - *`createIsmMapOutput`'s four caller-orchestrated methods* (ismMap finding 1's
    sub-instance) — its only caller is `createIsmMapGenerator.rebuild()`, one file
    away; it is internal choreography, not a cross-module contract, so it does not
    ride the graph work.
  - The items already parked with rulings in the shipped ledger
    (`docs/superpowers/plans/completed/2026-08-31-galaxy-field-extraction.ledger.md:49, 62`)
    — `stepIsmMap`'s always-`true` `done`, per-frame `createView()`,
    `orientationViewWanted` inertness. Untouched. (Audit item **#3**,
    `dustMapPopulated`'s relocation, already landed in #646 — 95e88d420; §3.3
    finishes the job by making its reset an implication rather than a promise.)

## 3. Target architecture

Two new primitives in `src/services/gpu/lib/` (the home `createKeyedRebuild`
already establishes), one internal table in `field/`, and one table in the
orchestrator.

### 3.1 `createDerived` — the value half of the graph

`createKeyedRebuild`'s name promises a key it does not have: it is a dirty-flag
gate over a `void` build (`{ wanted, build }`), so it can serve the GPU-dispatch
half only. Every CPU-derived value therefore needs its own `let`, its own recompute
condition, and a judgement call about which `.invalidate()` sites must also fire —
four uncheckable edits per value. `createDerived` is the value-returning,
key-derived sibling.

```ts
// src/@types/gpu/Derived.ts
export type Derived<T> = {
  /**
   * The value for the CURRENT key. Recomputes iff the key tuple moved since the
   * last call; a node cannot go stale, because its key is re-read on every read.
   */
  get(): T;
};

// src/services/gpu/lib/createDerived.ts
export function createDerived<T>(spec: {
  /** This value's inputs, compared ELEMENT-WISE BY `Object.is`. */
  readonly key: () => readonly unknown[];
  readonly compute: () => T;
}): Derived<T>;
```

**Contract, pinned:**

- **Reference identity per element**, via `Object.is`, plus a length compare. This
  matches the contract the module already relies on: `GalaxyFieldTuning` sections
  are replaced wholesale and the host's merge is shallow, so an untouched section
  arrives as the same object (`:1174-1187`). Numbers and `null` compare by value
  under `Object.is`, which is what the two sigma lanes need.
- **Lazy**: `compute` runs on the first `get()`, never at construction. A node
  whose value nothing reads costs nothing.
- **Stable identity on a stable key**: two `get()` calls with an unmoved key return
  the *same object*. This is load-bearing — downstream nodes and stages key on a
  node's returned value by identity, so "did my input change" is one `Object.is`.
- **No `invalidate()`.** Its absence is the point: there is no second authority to
  forget to call. The 11 hand-placed `.invalidate()` sites on the CPU half go away.
- **`createKeyedRebuild` survives unchanged** — `tools/galaxy-renderer/src/engine/model/createGalaxyModel.ts:306`
  (`bubblePlacements`) still uses it, and its `wanted` axis is a genuinely different
  concern from a key. galaxyField simply stops being one of its callers.

#### The derived node set (the graph's value edges, as data)

| Node | Type | Key tuple |
| ---- | ---- | --------- |
| `centralField` | `GalaxyFieldMixtureResult` | `[geometry, tuning.disc, tuning.arms]` |
| `centralHii` | `HiiShellsAndYoungResult` | `[geometry, tuning.hii, tuning.starFormation, tuning.arms.widthScale]` |
| `extraFieldMixtures` | `readonly (readonly GalaxyFieldComponent[])[]` | `[extras, tuning.disc, tuning.arms]` |
| `extraHiiMixtures` | `readonly (readonly GalaxyFieldComponent[])[]` | `[extras, tuning.hii, tuning.starFormation, tuning.arms.widthScale]` |
| `dustHeaderLanes` | `DustHeaderLanes` | `[geometry, tuning.dust]` |
| `dustBudget` | `PlaceDustBudget \| null` | `[geometry, tuning.dust]` |
| `digBudget` | `DigVeilBudget \| null` | `[geometry, tuning.hii.dig, centralHii.get()]` |
| `fieldPack` | `{ packed: Float32Array; counts: FieldSliceCounts }` | `[centralField.get(), extraFieldMixtures.get(), dustBudget.get()]` |
| `hiiPack` | `{ packed: Float32Array; segments: readonly HiiSegment[] }` | `[centralHii.get(), extraHiiMixtures.get(), digBudget.get()]` |

Notes that are contract, not commentary:

- `arms.widthScale` appears as its own key element rather than the whole `arms`
  section, because HII reads `arms` only through `armCrossSigma` — the precision
  `:1196-1199` currently buys with a hand-written boolean.
- `digBudget`'s key carries `centralHii.get()`, not `shellFluxSum`/`recentEventCount`.
  The call-order contract that `rebuildDigVeilBudget` runs after
  `rebuildCentralHiiMixture` (`:766-778`, held today by discipline at two call
  sites) becomes a key edge, and disappears as a rule to remember.
- `extras` is split into two nodes rather than the reports' single `extraMixtures`.
  One node would recompute both halves whenever either moved, losing the
  independent-rebuild property the index-parallel patch loop at `:1214-1217` buys
  today. Two nodes keep it and delete the loop.
- `null` geometry is handled *inside* each `compute` (empty components, `null`
  reservations). No empty sentinels survive into the final shape.

### 3.2 `createStageGraph` — the effect half, and the ordering

The effect half cannot be pure values: buffer uploads, CDF scans and placement
dispatches write GPU state and must happen in an order. That order is currently
three independent prose expressions (`stepIsmMap`'s six lines, the six nodes'
`.invalidate()` sites, and each `createIsmMapPlace*` factory's doc comment naming a
sibling it presumes fresh). It becomes one table.

```ts
// src/@types/gpu/StagePhase.ts
/** When a stage runs: `'sync'` at the end of the input push; `'step'` in the frame's pre-encode step. */
export type StagePhase = 'sync' | 'step';

// src/@types/gpu/Stage.ts
export type Stage<Name extends string> = {
  readonly name: Name;
  readonly phase: StagePhase;
  /** Stages this one must run AFTER — the DAG's edges, declared. Validated against table order at construction. */
  readonly after: readonly Name[];
  /** Consumer liveness, the `createKeyedRebuild` axis. Omitted = always wanted. */
  readonly wanted?: () => boolean;
  /** This stage's inputs, element-wise `Object.is` (same semantics as `createDerived`). */
  readonly key: () => readonly unknown[];
  readonly run: () => void;
};

// src/@types/gpu/StageGraph.ts
export type StageGraph<Name extends string> = {
  /** Every stage of `phase`, in table order, each run iff wanted AND its key moved. */
  run(phase: StagePhase): void;
  /** Identity that changes each time `name` last ran — an effect edge, for a downstream stage's key. */
  token(name: Name): object;
};

// src/services/gpu/lib/createStageGraph.ts
export function createStageGraph<Name extends string>(
  stages: readonly Stage<Name>[],
): StageGraph<Name>;
```

**Contract, pinned:**

- **Table order is the authority; `after` is the proof.** The constructor throws if
  any stage's `after` entry appears later in the array (or names an unknown stage).
  We do not topologically sort: the existing order encodes intent that a sort would
  tie-break arbitrarily, and this refactor must be pixel-neutral. The declared
  edges exist so the order can be *checked*, and so a seventh stage landing in the
  wrong slot fails loudly instead of producing a silently stale texture.
- **Retained invalidation, structurally.** A stage that is not `wanted` does not
  run and does not record its key — so when a consumer appears, the key still
  differs and it runs. This is `createKeyedRebuild`'s hard-won retention semantics
  (`createKeyedRebuild.ts:25-31`, and its test) obtained for free rather than
  documented.
- **`token(name)` is how one effect depends on another.** A stage that clobbers a
  buffer bumps its token; every stage that must re-run because of that clobbering
  names the token in its key. This is what replaces the three *unconditional*
  invalidations in `repackFieldComponents` and their 6-line comment: the edge
  becomes precise again without reintroducing the bug the unconditional patch fixed.

#### The stage table (the graph's effect edges, as data)

Eleven rows, in table order. `D(x)` = the derived node `x`'s current value;
`T(x)` = `graph.token(x)`.

| # | name | phase | after | wanted | key | run |
| - | ---- | ----- | ----- | ------ | --- | --- |
| 1 | `ismMap` | sync | — | — | `[geometry, tuning.ismMap, tuning.ismMapFluid, seed]` | generator rebuild + ring means; fires `onIsmMapRebuilt` |
| 2 | `scan:dust` | sync | `ismMap` | — | `[T(ismMap), tuning.dust.cloud.dustPlacementCap, tuning.ismMap]` | `dustCdfScan.dispatchScan` |
| 3 | `scan:dig` | sync | `ismMap` | — | `[T(ismMap), tuning.hii.dig, tuning.ismMap, geometry]` | `digCdfScan.dispatchScan` |
| 4 | `upload:field` | sync | — | — | `[D(fieldPack)]` | `fieldComps.write(D(fieldPack).packed)` |
| 5 | `upload:hii` | sync | — | — | `[D(hiiPack)]` | `hiiComps.write(D(hiiPack).packed)` |
| 6 | `orientation:tex` | step | `ismMap` | `orientationViewWanted \|\| tuning.ismMap.generator !== 'none'` | `[T(ismMap), sigmaDerivTexels, sigmaIntegTexels, geometry]` | `ismMapOrientation.dispatch` |
| 7 | `orientation:data` | step | `orientation:tex` | `tuning.ismMap.generator !== 'none'` | `[T(orientation:tex)]` | `onOrientationRebuilt` |
| 8 | `place:dust` | step | `orientation:tex`, `scan:dust`, `upload:field` | `D(dustBudget) !== null` | `[T(upload:field), T(scan:dust), T(orientation:tex), D(dustBudget), seed, tuning.ismMap.generator]` | placeDust + survivor-sum renorm |
| 9 | `place:spur` | step | `upload:field` | `D(centralField).spurCloudReservation !== null` | `[T(upload:field), D(centralField), seed, tuning.arms]` | placeArmSpurCloud + flux-weight sum |
| 10 | `place:arm` | step | `upload:field` | `D(centralField).armCloudReservation !== null` | `[T(upload:field), D(centralField), seed, tuning.arms]` | placeArmCloud + flux-weight sum |
| 11 | `place:dig` | step | `scan:dig`, `upload:hii` | `D(digBudget) !== null` | `[T(upload:hii), T(scan:dig), D(digBudget), D(hiiPack), seed, tuning.ismMap.generator]` | placeDigVeil |

`setMixture` becomes: assign the one input record (§3.4), then `graph.run('sync')`.
`stepIsmMap` becomes: `graph.run('step'); return { done: true };`

Four things this table deletes outright:

1. **The `generatorMoved && !dustMoved` epilogue** (`:1234-1242`) and its 6-line
   comment. `tuning.ismMap` sits in rows 2 and 8's keys, where the edge actually
   is — note that it is *not* in `dustBudget`'s key, contrary to the orchestrator
   report's proposal: `computePlaceDustBudget`/`deriveDustHeaderLanes` genuinely do
   not read the ISM-map section. The dependency is the scan's and the dispatch's.
2. **The three unconditional invalidations** in `repackFieldComponents` — now
   `T(upload:field)` in rows 8/9/10.
3. **`stepIsmMap`'s hand-typed order** and its two ordering comments — now rows 6–11
   plus their `after` edges, checked at construction.
4. **The two `dispatch*CdfScan` calls nested inside `rebuildIsmMap`** — rows 2 and 3
   run after row 1 by declared edge, so the geometry path scans once instead of
   twice (see §6).

### 3.3 Bind-group lifetime — one table, one entry point, one authority (resolves F2 × field/finding-1)

These two findings interact, and this is the single unified design for all three
moments (construction bootstrap, buffer regrow, dust-map reallocation).

Today the dust-map texture has **two authorities inside one `encode` call**: the
host's fresh `frameTargets.dustMapTex` (used for the write target and the header's
`dustMapHeightPx`) and a cached `dustMapTex` `let` (`:450`, reached through the
`getDustMapTex` thunk into the four sampling bind groups). They agree only because
the host promises to call `onDustMapReallocated` *from inside its own allocation* —
a contract the module documents (`:279-282`) and nothing enforces. A host that
allocates without firing the hook writes the new texture and samples the old one:
silently wrong attenuation, no error.

**Target shape.** `createFieldPipelines` stops taking a thunk and stops exposing
four rebuild methods and five getters. It exposes one:

```ts
/** The identity-bearing inputs every bind group in this module is built against. */
export type FieldBindGroupResources = {
  readonly fieldComps: GPUBuffer;
  readonly hiiComps: GPUBuffer;
  readonly dustMap: GPUTexture;
};

export type FieldBindGroups = {
  readonly dustMap: GPUBindGroup;
  readonly fieldSplat: GPUBindGroup;
  readonly dustPresent: GPUBindGroup;
  readonly hii: GPUBindGroup;
  tier(kind: HiiTier): GPUBindGroup;
};

// on FieldPipelines:
/**
 * Rebuild every bind group whose declared inputs' IDENTITY moved since the last
 * call; return the full set. Idempotent and cheap — called at the top of every
 * `encode`.
 */
sync(resources: FieldBindGroupResources): FieldBindGroups;
```

backed by an internal dependency table — the same "graph as data" move, one level
down:

```ts
const BIND_GROUP_DEPS: Record<FieldBindGroupRole, readonly (keyof FieldBindGroupResources)[]> = {
  dustMap:      ['fieldComps'],
  fieldSplat:   ['fieldComps', 'dustMap'],
  dustPresent:  ['dustMap'],
  hii:          ['hiiComps', 'dustMap'],
  tiers:        ['hiiComps', 'dustMap'],
};
```

`sync` walks the table, rebuilding a role iff one of its named resources has a new
identity. The mapping "{fieldComps regrew, hiiComps regrew, dustMapTex
reallocated} ⇒ which of the five groups" is written **once as data** instead of
being encoded in four function bodies plus the three call sites that must pick the
right one.

**Consequences — this is the whole point of unifying the two findings:**

- **`onDustMapReallocated` is deleted** from `GalaxyFieldRenderer`, along with the
  `dustMapTex` mirror, the `getDustMapTex` thunk, the `!` non-null assertion, and
  the "must be called from the allocation itself" contract. The host's callback
  wiring at `createGalaxyEngine.ts:244-249` goes away, and with it the comment
  explaining why the hook takes a single texture because it fires mid-allocation.
  A cache key cannot go stale: the authority it is compared against arrives on the
  same call that uses it.
- **The construction-time `rebuildDustMapBindGroup` call is deleted** (`:579`).
  The field report classed the bootstrap as an *essential* special case; it is not,
  once bind groups are pulled at encode rather than pushed at allocation — nothing
  reads a bind group before the first `encode`, and `encode` syncs first. The table
  covers the bootstrap: at the first call, no role has a recorded identity, so
  every role builds.
- **Both `onRegrow` registrations are deleted** (`:538`, `:555`). A regrow replaces
  the `GPUBuffer` object; the next `encode`'s `sync` sees a new identity and
  rebuilds the affected roles. Nothing draws between the regrow and that `encode`,
  and every `createIsmMapPlace*` stage builds its bind group per dispatch from the
  buffer it is handed (verified: `createIsmMapPlaceDust.ts:147`,
  `…DigVeil.ts:107`, `…ArmCloud.ts:191`, `…ArmSpurCloud.ts:154`). With no
  registrations left anywhere — the tool's `bubbleComps` deliberately passes none
  (`createGalaxyModel.ts:164-176`) — **`onRegrow` is removed from
  `createGrowOnlyRecordBuffer`'s spec**: push-notification and pull-identity are
  two mechanisms for one fact, and the pull one cannot be forgotten.
- **`dustMapPopulated` stops being an asserted invariant.** #646 (95e88d420)
  already moved the latch out of `createFieldPipelines` into the orchestrator; what
  remains is that its reset still rides the hook, and so still rests on the host's
  promise. The two facts become one slot:

  ```ts
  /** The dust map this module last saw, and whether it holds anything but zeros. */
  let dustMap: { readonly tex: GPUTexture; populated: boolean } | null = null;
  ```

  reassigned wholesale inside `encode` when `dustMap?.tex !== frameTargets.dustMapTex`.
  A fresh texture is zeroed by construction, so `populated: false` is an
  *implication of the identity change*, not a promise about the caller.
- **`probe.fieldSplatBG` becomes `GPUBindGroup | null`** — the honest type, since
  no bind group exists before the first `encode`. Two guarded call sites in
  `createGalaxyEngine.ts:717, 735`.

### 3.4 One input record (F5)

```ts
let current: GalaxyFieldMixtureInput = EMPTY_INPUT;
```

One slot, one atomic write in `setMixture`; the diff becomes a local `prev`/`next`
comparison that no longer exists at all, because the derived nodes and stage keys
read `current.*` themselves. Seven `let`s and seven assignments go; adding an input
costs a type member, not four coordinated edits.

This also removes the *value × time* mix the reports flag in the deferred half:
`dustDispatchInput` (`:839-870`) currently pairs a passed-in snapshot (`budget`)
with fields read **live** at `stepIsmMap` time (`seed`, `fieldTuning.ismMap.generator`,
`fieldCounts.emission`), a pairing that holds only because every writer of the live
fields also invalidates the node. Under the stage table those live reads are
declared in the stage's key, so the pairing is checked rather than trusted.

### 3.5 Whole builder records (F3) and no second copies (F4)

`buildGalaxyFieldMixture` and `buildHiiShellsAndYoungWithSegments` each return one
immutable record that is currently shredded into 3 and 4 independently-writable
`let`s, re-tied by three prose co-temporality claims. Held whole, the pairing is
the type system's job: `central.armCloudReservation`, `centralHii.shellFluxSum`.
Under §3.1 they stop being `let`s at all and become the `centralField` /
`centralHii` derived nodes.

`digOffset` (`:617`) is a second copy of `hiiSegments`' `hii:dig` `first` (`:1084`)
— read by the placement dispatch and the probe readback while the draw call reads
the segment table. It is deleted; both readers call
`findHiiSegment(hiiPack.get().segments, 'hii:dig')`, the accessor the encode path
already uses. `fieldCounts.dust` / `.primary` (`:1024-1025`) stop being stored
separately: they are produced by `fieldPack` alongside the packed array they
describe, from the same inputs, in the same node.

### 3.6 One teardown ledger (F6)

The module has an automatic `own()` registry (7 entries, accepting `{ destroy() }`)
and a hand-written list in `dispose` (11 entries), split on a *naming* difference —
the nine sub-factories spell teardown `dispose()` — not a semantic one. The
ledger's comment claims "every allocation registers at its own site", which is true
only of the ones spelled `destroy`. Widen the ledger to
`{ destroy(): void } | { dispose(): void }`, register every resource at its
allocation site, and let `dispose` be the single reverse walk. A newly added
sub-factory that is not registered then fails to compile at its allocation, instead
of leaking silently.

### 3.7 Buffer accessor and grow-site reuse (ismMap findings 2 and 5)

`createGrowOnlyRecordBuffer` exposes `buffer` as a getter property, and four
`createIsmMapPlace*` files each carry a near-identical comment re-asserting
"re-fetch the buffer live every dispatch, never cache across a regrow". Replace the
property with `getBuffer(): GPUBuffer`, so calling through is structural rather than
disciplined, and delete the four comments.

`createIsmMapPlaceArmCloud.ts:119-131` and `createIsmMapPlaceArmSpurCloud.ts:94-103`
hand-roll grow-on-demand logic in files whose own comments name
`createGrowOnlyRecordBuffer` without calling it. Both pack fixed-stride
`Float32Array` records (`ARM_CLOUD_RECORD_FLOATS` / `ARM_SPUR_CLOUD_RECORD_FLOATS`)
and build their bind group per dispatch, so the swap is direct. One constraint to
carry over: the hand-rolled version floors at 32 bytes; a zero-size storage binding
is a WebGPU validation error, so the replacement must start at a non-zero capacity.

### 3.8 TS ↔ WESL parity for the eight hand-numbered packers (ismMap finding 4)

Eight files state in their header that the corresponding `.wesl` struct "IS THE
OFFSET AUTHORITY", and nothing but that comment links the struct declaration to the
hand-numbered `out[N] = …` assignments. A lane written to the wrong index ships
garbage silently — the exact failure class `selectionEncoding` guards against, and
the class that `testing.md`'s keep-rules name as load-bearing ("invisible until iOS
silently drops the whole frame").

The recipe already exists in the repo and is followed, not invented:
`tests/tools/mcpm-workbench/render/boxUniform.parity.test.ts` — read the `.wesl`
text, parse the named struct's fields, accumulate declared byte offsets, and assert
each against the float index the packer writes (byte = index × 4). Eight tests, one
shape:

- `packIsmMapCdfParams` · `packIsmMapFluidConstants` · `packIsmMapFluidEvents` ·
  `packIsmMapFluidStepIndex` · `packPlaceArmCloudParams` ·
  `packPlaceArmSpurCloudParams` · `packPlaceDigVeilParams` · `packPlaceDustParams`

Note the offset accumulator must handle WGSL's `vec4`/`array` alignment where these
structs use it — the packers are vec4-row-aligned by construction (e.g.
`packPlaceDustParams`' 8 vec4 rows), which is exactly the fact the test pins.

## 4. What gets deleted

Deletion is the deliverable, not a side effect. The target diff removes:

- 23 closure `let`s → one input record + nine derived nodes + two encode-local slots
- 12 boolean locals, `rebuildForTuning`, `rebuildForGeometry`, and the corrective epilogue
- 11 `.invalidate()` call sites and the six `createKeyedRebuild` nodes in this module
- 4 `rebuild*` bind-group entry points, 5 getters, the `getDustMapTex` thunk, the
  construction bootstrap call, both `onRegrow` registrations and the `onRegrow`
  spec field
- 1 public method (`onDustMapReallocated`) and its host wiring
- `digOffset`, the hand-written `dispose` list, two hand-rolled `ensureRecordsBuffer`
  implementations

**And most of the choreography-teaching comments the reports quote.** Per
`comments.md`, a comment that exists to teach a reader how to cope with an
accidental asymmetry is a signal to un-braid the code, and once un-braided the
comment must go with it — "whoever zeroes the slots owns the invalidation"
(`:752-756`), "All three placement invalidations are UNCONDITIONAL here, because…"
(`:1011-1016`), "Texture before CPU copy" (`:1301`), "AFTER `orientationTexRebuild`,
never before" (`:1304-1306`), the four repeated "re-fetch the buffer live" notes,
`createFieldPipelines`' "None of the five `let`s here builds during construction"
header. Each of those facts is expressed by the new data structures; leaving the
prose behind would leave a second, drifting authority — which is the finding itself.
What *stays*: units, derivations, cross-file byte contracts, and genuine landmines
(the two-`digCdfScan`-instances rationale, the `layout: 'auto'` per-pipeline entry
list rule, the WebGPU cross-submit ordering note).

## 5. Sequencing

Adapted from radar-orchestrator §5 (F3/F4 first to shrink the surface, then F2, F6,
then F1+F5), extended for the field/ismMap findings and the graph work. Ordering
rule: **shrink the surface before moving it; land each primitive with its tests
before the consumer that needs it; never leave an intermediate commit un-green.**

1. Mechanical, surface-shrinking, independent: `digOffset` (F4), whole builder
   records (F3), one teardown ledger (F6).
2. `ismMap/` housekeeping the graph work would otherwise churn: grow-buffer reuse
   (finding 5), then the `getBuffer()` accessor (finding 2) once both new call
   sites exist.
3. The eight parity tests (finding 4) — independent, additive, no production edit.
4. Bind-group table + `sync` + F2's mirror deletion + the host change. This lands
   *before* the graph work because it removes one of the four expressions of the
   dependency graph outright, and because it is the only task that touches `tools/`.
5. `createDerived`, then `createStageGraph` — each its own commit with its own unit
   tests, no consumer yet.
6. One input record (F5), then the derived node set, then the stage table. The
   orchestrator is rewired in that order so each commit compiles and draws.
7. Comment/deletion sweep, then the branch-level gates.

## 6. Pixel-neutrality, and the two intended non-pixel deltas

The image is the contract. Two behaviours change shape without changing output;
both are named here so a reviewer does not chase them:

1. **Fewer GPU submits on the geometry path.** Today `rebuildDustMixture` /
   `rebuildDigVeilBudget` each dispatch a CDF scan, and `rebuildIsmMap` dispatches
   both again — so a new galaxy scans twice. With rows 2/3 ordered after row 1 by
   declared edge, each scans once, from the final map with the final cap. The
   prefix buffer's contents at the end of `setMixture` are identical; only the
   submit count falls.
2. **Bind groups are rebuilt on pull (at `encode`) instead of push (at
   allocation/regrow).** The set used by any pass is the set `sync` just produced
   from that frame's own resources, so the rebuild happens strictly earlier in the
   frame than the draw that consumes it, and strictly no later than today.

**One verification the implementer must perform rather than assume**: `upload:field`
is keyed on `D(fieldPack)`, which does *not* move on a bare
`tuning.ismMap.generator` flip — where today's corrective epilogue re-zeroes the
dust slice before re-placing. That is only safe if `placeDust.wesl` writes **every**
reserved slot (a culled particle must get a zeroed / zero-amplitude record rather
than being skipped). Read the shader and confirm. If it skips slots, add
`current.fieldTuning.ismMap.generator` to `fieldPack`'s key with a one-line comment
naming the reason — the conservative choice, and still one declared edge rather than
a corrective branch.

## 7. Verification

There is **no test coverage of `createGalaxyFieldRenderer.ts` or
`createFieldPipelines.ts`** — confirmed: every other file in `field/` has a
`tests/…/field/*.test.ts` twin; these two do not, and the four-call bootstrap
sequence is exercised by nothing. This spec does not pretend otherwise and does not
propose retrofitting a WebGPU harness for them. The honest gate ladder:

- **New primitives** (`createDerived`, `createStageGraph`) get real unit tests per
  `testing.md` — behavioural, hand-computed, no mirrors. Named assertions:
  - `createDerived`: recomputes only when a key element's identity moves; returns
    the *same* object across two reads on an unmoved key; does not compute before
    the first read; treats a length change as a move.
  - `createStageGraph`: runs a stage once per key move, not once per `run`; leaves
    an unwanted stage's key unrecorded so it runs when a consumer appears (the
    retention bug `createKeyedRebuild`'s own test exists for); `token(name)` changes
    only when that stage runs; a downstream stage keyed on an upstream token re-runs
    after the upstream does; constructing a table whose `after` edge points forward
    throws.
- **The eight parity tests** (§3.8) — real coverage of a real silent-failure class.
- **The two files with no tests**: `npm run typecheck`, `npm run build`,
  `npx tsc --noEmit -p tools/galaxy-renderer/tsconfig.json`,
  `npm run galaxy-renderer:build` (the only `?static` shader-path proof) and
  `npm run galaxy-renderer:probe` per task, plus the branch-level visual pass.
- **Branch-level**: a perf A/B against `main` (`npm run perf`, with this worktree's
  own `--url`), and a **user-owned** visual pass over the galaxy renderer. Neither
  is agent-attestable; the plan carries both as explicit checkboxes.
- **Structural gate**, every task: `grep -rn "tools/\|src/state/" src/services/gpu/renderers/galaxyField/`
  returns nothing.

## 8. Ground preparation

**None needed — this refactor IS ground preparation.** The module was extracted
from a tool-side closure in PR #643 (`docs/superpowers/plans/completed/2026-08-31-galaxy-field-extraction.ledger.md`);
that PR moved the code without changing its state style, so the module arrived in
`src/` carrying the inherited hand-stitched graph the three radar reports name.
This PR un-braids that style. There is no feature behind it whose shape could
demand a different joint, and no prep refactor sequenced ahead of it — the next
consumers (the renderer slice of the Edenhofer dust volume, the analytic-MW landing)
all read this module's outputs, and every one of them is better served by a
declared graph than by a fourth expression of it.

## 9. Deviations from the reports' proposed shapes

1. **`stepIsmMap`'s ordering is first-class, not reviewed prose.** ismMap finding 1
   offered "at minimum, one canonical DAG description the call sites are reviewed
   against"; this spec takes the stage table instead, per the user's ruling that
   the graph be representable as data.
2. **`tuning.ismMap` is keyed on the scan and placement stages, not on the dust
   derived node.** The orchestrator report put it in `dust`'s key;
   `computePlaceDustBudget`/`deriveDustHeaderLanes` do not read that section, so
   the edge belongs where the dependency is.
3. **Two `extras` nodes, not one.** Preserves today's independent field/HII
   rebuild, which a single node would lose.
4. **The construction-time `dustMapBG` build is deleted, not preserved as an
   essential special case** (field report). Pull-at-encode makes it unnecessary.
5. **`onRegrow` is removed from `createGrowOnlyRecordBuffer`, not kept alongside the
   accessor** (ismMap finding 2). With bind groups pulled at `encode`, no consumer
   remains; keeping it would preserve exactly the push/pull duplication this
   refactor exists to remove.
6. **Both smaller ismMap items are parked** (§2), with reasons.
7. **`createKeyedRebuild` is kept, not replaced.** The stage graph subsumes its
   galaxyField uses, but the tool's `bubblePlacements` still needs it.
