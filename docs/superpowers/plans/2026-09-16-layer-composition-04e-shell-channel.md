# Layer composition (d), PR-D second half — the shell channel

> **For agentic workers:** REQUIRED SUB-SKILL: use `superpowers:subagent-driven-development` under the
> lean protocol in [`sdd-execution.md`](../conventions/sdd-execution.md). Steps use `- [ ]` checkboxes.

Spec: [`docs/superpowers/specs/2026-09-09-layer-composition-design.md`](../specs/2026-09-09-layer-composition-design.md)
§4.2 (the hooks the contract lacks — no `handle`), §4.5 (the three fields that leave in (d): the
`requests` Set with `RequestKey` and `ctx.request`, the `famousGalaxiesMeta` getter, the public handle
bar `destroy` and `debug`), §4.6 (the `ui` row), §9(d) rulings **D6** and **D13**, §15 (docs).

Plan 04e of the layer-composition sequence; follows plan 04d
([`completed/2026-09-15-layer-composition-04d-galaxy-catalog-layer.md`](completed/2026-09-15-layer-composition-04d-galaxy-catalog-layer.md),
landed as `ce1675fba`). 04d moved everything a **pass, fade, label, asset row or selection row**
reaches into the Layer's runtime, and parked the shell's three remaining galaxy reads on one nullable
`EngineState` field (04d Ruling 5). **This plan closes that channel**: what the shell needs becomes a
published fact, and the bridge, the two `EngineHandle` sub-handles, the two shell hooks and the
one-shot request mechanism are deleted.

Branch: `worktree-layer-composition-04e` (off `ce1675fba`). One PR, **6 tasks**, every commit
`npm run typecheck:fast` + targeted tests green; `tsc` and the suite at the gate.

Dispatches (serial, **Sonnet** implementers, user ruling 2026-09-16): **D1 = Tasks 1–2** (the two new
facts and their reconcile), **D2 = Tasks 3–4** (the deletions — one commit, see Ruling 4), **D3 =
Tasks 5–6** (the `ui` section, then docs and the audits). One whole-branch review at the end; CI is
the gate.

## Goal

`EngineHandle` is `{ debug, destroy }`. The galaxy Layer's only channel to the React shell is
`state.engine.galaxyCatalog` — four facts (`famousMeta`, `provenanceCounts` from 04d, plus
`aliasIndex` and `structureMemberCount`). `GalaxyCatalogBridge`, `state.galaxyBridge`,
`useAliasIndex`, `useStructureMemberCount`, `RequestKey`, `ctx.request` and `state.requests` are gone,
the Galaxies settings section lives inside the Layer, and the §15 docs describe the shipped shape.

## Scope ruling made at plan time

**The `galaxiesOnly` reference engine is NOT in this plan** (user ruling 2026-09-16, against the
spec's §10(d) packaging). Evidence: `CONTENT_PASSES`
(`src/services/engine/frame/passes/index.ts:50-87`) still holds **36** non-galaxy passes — Milky Way,
stars, structures, bodies, volumes, constellations, atmosphere — because none of those families is a
Layer yet. A composition with `layers: [galaxyCatalogLayer]` is therefore behaviourally identical to
`APP_COMPOSITION` (`src/compositions/app.ts:13-16`): no render target drops, no `FRAME_ORDER` name
falls away, and spec §7's bullets 1–2 are simply not true yet. Bullet 3 (a root settings type holding
only `galaxyCatalogs`) needs a composition-parameterized `createAppStore` / `settingsSlice`, which
04b explicitly did not build — `settingsSlice.ts` still holds its thirteen direct fragment imports
(the `layerImportBoundary` ratchet's one allowed row). Bullet 4 (the `{ destroy, debug }` handle) is
proven by Task 3's type, in `tsc`, with no second composition. The reference engine lands with the
first sibling Layer — spec §10(e), `starCatalog` — where dropping a Layer drops passes and targets and
the file earns its keep. **Spec §7 and §10(d) are amended by this plan** (Task 6 writes the §14 row).

## Findings (verified in this worktree, 2026-09-16, at `ce1675fba`)

| #   | Fact                                                                                                                                                                                                                                                                                                                                                       | Sites                                                                                     | Consequence                                                                                                                     |
| --- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| 1   | The facts channel is live and typed: `layer.facts` seeds the key (`createLayers.ts:93-104`), `deps.publish(patch)` dispatches `factsReported`, `EngineSliceState = CoreEngineSliceState & FactsOf<typeof APP_COMPOSITION.layers>`, and the two 04d facts are read through `selectEngineFacts` (`state/engine/selectors.ts:48-89`).                         | as listed                                                                                 | adding a fact is: widen `GalaxyCatalogFacts`, extend the `facts` literal, `publish`, add a selector.                            |
| 2   | `aliasMap` — the second value `useAliasIndex` returns, documented there as the deep-link resolver's "is this PGC real" oracle — **has no reader**. `CommandPaletteContainer.tsx:49` destructures `{ aliasIndex }` only.                                                                                                                                    | `src/hooks/useAliasIndex.ts:36`, `@types/engine/UseAliasIndexReturn.d.ts`                 | `aliasMap` and its type die with the hook; no fact replaces it (Ruling 2).                                                      |
| 3   | `awaitSlotReady`'s only two readers are `engine.ts:475` (`loadPgcAliasesFn`) and `useAliasIndex.ts:78`, both deleted here.                                                                                                                                                                                                                                 | `src/services/loading/awaitSlotReady.ts`, `tests/services/loading/awaitSlotReady.test.ts` | the helper and its test go in Task 3's deletion set.                                                                            |
| 4   | `engineHandleRef` does **not** die: `DebugPanel.tsx:47,66,73` passes it to `CameraStateSectionContainer` and `EarthTileAtlasSectionContainer`, which read `handle.debug`. Only `InfoCardContainer` and `CommandPaletteContainer` lose the prop.                                                                                                            | `App.tsx:136,147,157`                                                                     | corrects 04d's Deferred list, which reads "the deletions of … `engineHandleRef`".                                               |
| 5   | `AliasIndexEntry.pgc` is a `bigint`; the entries would land in the Redux store.                                                                                                                                                                                                                                                                            | `@types/engine/AliasIndexEntry.d.ts:12`, `utils/galaxy/buildAliasIndex.ts:34-38`          | the fact carries `pgc: number` (Ruling 1): RTK's `serializableCheck` flags bigint, and `JSON` of a store snapshot throws on it. |
| 6   | Nothing in the runtime counts catalog changes: `GalaxyCatalogRuntime` has `catalogs: Map<…>` and no version, and `EngineState.contentVersion` is not on `PassState` (`@types/engine/frame/PassState.d.ts:12-14`).                                                                                                                                          | `layers/galaxyCatalog/types/GalaxyCatalogRuntime.ts:29-33`                                | both reconciles need a Layer-owned `catalogsVersion` (Task 1).                                                                  |
| 7   | The demand loop runs `reevaluateDemand(state)` every frame (`frame/runFrame.ts:83`), and the scheduler is passive: writes wake it only through `WAKE_ROUTES` (`store/effects/watchWakeSaga.ts:47`) or a dedicated saga (`state/selection/watchSelectionWakeSaga.ts`). `uiRoute` is **not** a wake route.                                                   | as listed                                                                                 | flipping the `pgcAlias` demand to `ui.paletteOpen` needs its own wake, or the load never starts at rest (Task 4).               |
| 8   | The `ui` mechanism is already shipped and wired: `SettingsPanel.tsx:45-47` maps `APP_COMPOSITION.layers` and renders `layer.ui`. `LayerUiSection = ComponentType`.                                                                                                                                                                                         | `@types/engine/layer/LayerUiSection.d.ts`                                                 | Task 5 only declares the field and moves two files.                                                                             |
| 9   | 04d Ruling 8's module cycle looks **dissolved**: `APP_COMPOSITION` has three importers — `SettingsPanel.tsx`, `hooks/useEngine.ts`, and `@types/store/EngineSliceState.d.ts` (type-only, erased). `settingsSlice` reaches fragments through `compositions/appSettingsFragments.ts`, which imports each Layer's settings module directly, never `layer.ts`. | `appSettingsFragments.ts:13-26`                                                           | `layer.ts` may import the section container without closing a cycle — Task 5 verifies rather than assumes (Ruling 5).           |
| 10  | `structureMemberCount(structure, getCloud, visibleSourceMask)` needs a `StructureInfo` (world position + radius). The Layer must not read core's structure store; `PassState` carries `selectionRows` — the saga-resolved, JSON-serializable display rows the InfoCard itself reads — and that type's structure arm **is** a `StructureInfo`, used as-is.  | `utils/structure/structureMemberCount.ts:42-62`, `@types/engine/SelectionRow.d.ts:2,9`    | the reconcile keys on `state.selectionRows.select`, not on the structure catalog (Ruling 3).                                    |
| 11  | `Layer.sagas` is declared in the contract but has **no reader**: `createLayers.ts` never mentions it, and `src/store/rootSaga.ts` is a hand-written `all([...])` of 19 watchers.                                                                                                                                                                           | `@types/engine/layer/Layer.d.ts`, `store/rootSaga.ts:34-54`                               | a saga declared on the Layer would silently never run — Ruling 6 puts the wake in core instead.                                 |

## Rulings

**Ruling 1 — `aliasIndex` is published with `pgc: number`, and the index rebuilds on catalog change.**
`AliasIndexEntry.pgc` becomes `number` (Finding 5; PGC ids are < 2^31, and the `objIDs` read stays a
`BigUint64Array` inside the builder). The builder moves into the Layer and takes the catalogs map
instead of an `EngineHandle`. Today's hook builds the index **once** (`aliasLoadStarted` ref,
`useAliasIndex.ts:52-58`) and never again: after a tier swap every `localIdx` in the index points into
a replaced array, so an alias hit selects **the wrong galaxy**. The reconcile is keyed on
`catalogsVersion`, which fixes that as a side effect of moving it — cheaper than preserving the bug.

**Ruling 2 — `aliasMap` is deleted, not re-published.** Finding 2: no reader. The hook header's claim
that the deep-link resolver uses it as an oracle is stale prose. Deletion beats addition; if a future
resolver wants it, it is one more fact.

**Ruling 3 — `structureMemberCount` reconciles over `state.selectionRows.select`.** Finding 10. The
Layer must not reach into `state.data.structures` (that is the `structure` Layer's, §10(e)); the
selection row carries the resolved structure geometry the count needs, is already the InfoCard's own
read surface, and gives the reconcile a stable identity to key on (the saga writes a new row object
per resolve). Key: `(selectRow identity, ctx.visibleSourceMask, runtime.catalogsVersion)`.

**Ruling 4 — Tasks 3 and 4 land as ONE commit.** Task 3 deletes `loadPgcAliasesFn`
(`engine.ts:468-476`), the only writer of `state.requests`; Task 4 replaces the trigger it was the
front half of. Split, the intermediate commit is `tsc`-green with the alias load silently dead — a
state that is not true of any branch we want bisectable. Same rule 04d applied to its Tasks 3–4.

**Ruling 5 — the `ui` section is declared on `layer.ts`; `appUi.ts` is the fallback, not the plan.**
04d deferred `ui` because `layer.ts` importing `GalaxiesSectionContainer` was thought to close a
module cycle through the store. Finding 9 says the chain no longer returns to `layer.ts`. Task 5
therefore takes the spec's own shape (§4.2: `ui` is a Layer field) and verifies empirically — suite,
`npm run build`, and a boot in the dev server. Only if one of those fails does the task fall back to a
`src/compositions/appUi.ts` name→section list, recording which it took.

**Ruling 6 — the palette wake is a core per-action saga, not a new `WAKE_ROUTE` and not a Layer
saga.** Finding 7 rules out the route: `uiRoute` membership would wake the render loop on every
splash, ui-hidden and debug-panel write, which is the granularity mistake `watchSelectionWakeSaga`
exists to avoid. Finding 11 rules out the Layer: `Layer.sagas` is declared in the contract but **read
by nothing** — `createLayers.ts` never touches it and `src/store/rootSaga.ts` is a hand-written fork
list. Wiring it means importing `APP_COMPOSITION` into `rootSaga.ts`, which drags every Layer's
`create` — renderers, `?worker` and `?static` modules — into the store's module graph and into every
store test, for one 6-line saga. So: `src/state/ui/watchPaletteWakeSaga.ts`, forked by hand beside
`watchSelectionWakeSaga`, saying the core-level thing it actually says ("a palette open must produce a
frame, because the demand loop only runs in one"). Wiring `Layer.sagas` for real is (e)'s, when a
second Layer needs it and the composition edge is paid once, deliberately.

## Task list

---

### Task 1: `catalogsVersion` + the `aliasIndex` fact

**review: yes** (Redux state + a per-frame reconcile.)

**Files:**

- Modify: `src/layers/galaxyCatalog/types/GalaxyCatalogRuntime.ts`, `src/layers/galaxyCatalog/create.ts`,
  `src/layers/galaxyCatalog/load/wireGalaxyCatalogSourceSlot.ts`, `src/layers/galaxyCatalog/frame.ts`,
  `src/layers/galaxyCatalog/layer.ts`, `src/layers/galaxyCatalog/types/GalaxyCatalogFacts.ts`,
  `src/@types/engine/AliasIndexEntry.d.ts`, `src/@types/engine/BuildAliasIndexInput.d.ts`,
  `src/state/engine/selectors.ts`
- Move: `src/utils/galaxy/buildAliasIndex.ts` → `src/layers/galaxyCatalog/load/buildAliasIndex.ts`
  (drags `tests/utils/galaxy/buildAliasIndex.test.ts` → `tests/layers/galaxyCatalog/load/`)
- Test: `tests/layers/galaxyCatalog/load/buildAliasIndex.test.ts` (moved, extended),
  `tests/layers/galaxyCatalog/frame.aliasIndexReconcile.test.ts` (new)

**Move command** — never `git mv` + hand-edited imports:

```bash
npm run move-files -- --dry src/utils/galaxy/buildAliasIndex.ts src/layers/galaxyCatalog/load/buildAliasIndex.ts
npm run move-files --      src/utils/galaxy/buildAliasIndex.ts src/layers/galaxyCatalog/load/buildAliasIndex.ts
```

**Interfaces — produces:**

```ts
// src/@types/engine/AliasIndexEntry.d.ts  (pgc: bigint → number; Ruling 1)
export type AliasIndexEntry = {
  pgc: number;
  names: readonly string[];
  source: SourceType;
  localIdx: number;
};

// src/@types/engine/BuildAliasIndexInput.d.ts  (handle → catalogs; the EngineHandle import goes)
export type BuildAliasIndexInput = {
  catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
  aliasMap: ReadonlyMap<bigint, readonly string[]>;
  sources: readonly SourceType[];
};

// src/layers/galaxyCatalog/types/GalaxyCatalogRuntime.ts  — added field
/** Bumped by every point-slot commit; the two `frame` reconciles key on it. */
catalogsVersion: number;

// src/layers/galaxyCatalog/types/GalaxyCatalogFacts.ts  — added field
readonly aliasIndex: readonly AliasIndexEntry[];

// src/state/engine/selectors.ts
export const selectAliasIndex = (state: RootState): readonly AliasIndexEntry[] => …
```

**Behaviour:** the Layer's `frame` gains a reconcile ahead of today's bias block. It publishes
`{ aliasIndex }` when `runtime.pgcAlias.committed()` is non-null **and** `runtime.catalogsVersion`
differs from the version the last publish was built at; otherwise it does nothing. The build walks
GLADE and 2MRS (`[Source.Glade, Source.TwoMRS]`, as `useAliasIndex.ts:33` does today). Publishing an
empty index for a never-loaded catalog is fine — the palette accepts `[]`.

- [ ] Move `buildAliasIndex` with the command above; `rg -n "buildAliasIndex" src tests` afterwards to
      catch specifiers the tool missed.
- [ ] Change its input to `catalogs` and emit `pgc: Number(pgc)`; keep both skip rules (`pgc === 0n`,
      empty `names`) and their comments.
- [ ] In the moved test, keep every existing case (zero PGC, missing source, empty names) rebuilt
      against a `Map<SourceType, GalaxyCatalog>` input, and add
      `buildAliasIndex emits pgc as a number, not a bigint` asserting `typeof entry.pgc === 'number'`.
- [ ] Add `catalogsVersion` to the runtime (initialised `0` in `create.ts`), bumped in the point slot's
      commit in `wireGalaxyCatalogSourceSlot.ts` beside the existing `catalogs.set`.
- [ ] Add the reconcile to `frame.ts` and the `aliasIndex` key to `GalaxyCatalogFacts` +
      `layer.ts`'s `facts` literal (`aliasIndex: []`).
- [ ] New test `frame.aliasIndexReconcile.test.ts`: `publishes once per catalogsVersion bump, not per
    frame` (drive `frame(runtime)` three times across one bump, assert exactly one `publish` call
      carrying `aliasIndex`) and `does not publish while the pgcAlias slot is uncommitted`.
- [ ] Add `selectAliasIndex` beside `selectFamousGalaxiesMeta`, through `selectEngineFacts`, with a
      module-level `NO_ALIAS_INDEX` empty array for the pre-seed window (the shape
      `selectors.ts:52-55` establishes).
- [ ] `npm run typecheck:fast` + `npm test -- buildAliasIndex aliasIndexReconcile` green. Commit.

---

### Task 2: the `structureMemberCount` fact

**review: yes** (Redux state + a per-frame reconcile over 2.5M points.)

**Files:**

- Modify: `src/layers/galaxyCatalog/frame.ts`, `src/layers/galaxyCatalog/types/GalaxyCatalogFacts.ts`,
  `src/layers/galaxyCatalog/layer.ts`, `src/state/engine/selectors.ts`
- Test: `tests/layers/galaxyCatalog/frame.memberCountReconcile.test.ts` (new)

**Interfaces — produces:**

```ts
// GalaxyCatalogFacts  — added field; null = "not countable yet" (no visible catalog loaded,
// or nothing structural selected), exactly today's hook contract.
readonly structureMemberCount: number | null;

// src/state/engine/selectors.ts
export const selectStructureMemberCount = (state: RootState): number | null => …
```

**Behaviour:** a second reconcile in `frame`, keyed on
`(state.selectionRows.select, ctx.visibleSourceMask, runtime.catalogsVersion)` — object identity for
the row, `===` for the two numbers. On a key change it recomputes via
`structureMemberCount(structure, (source) => runtime.catalogs.get(source), ctx.visibleSourceMask)`
and publishes; when the selected row is absent or not a structure it publishes `null` (once, on the
key change). `src/utils/structure/structureMemberCount.ts` does not move: it is a shared cone-search
util, and the `structure` Layer will want it in §10(e).

- [ ] Read `SelectionRow` (`src/@types/engine/SelectionRow.d.ts`) and confirm which arm carries the
      structure's `worldPos` / `apparentRadiusMpc` / `physicalRadiusMpc`; narrow on the row's own tag,
      never a structural sniff (the pattern at `useStructureMemberCount.ts:44-46`).
- [ ] Add the key fields to the runtime as plain private fields on the closure in `frame.ts` (not on
      `GalaxyCatalogRuntime` — no other contribution reads them).
- [ ] New test `frame.memberCountReconcile.test.ts`, three cases:
      `recomputes only when the key changes` (10 frames, one selection change, assert one publish);
      `publishes null when the selected row is not a structure`;
      `recomputes when the visible source mask changes with the same selection`.
- [ ] Add `structureMemberCount: null` to the `facts` literal and the Facts type.
- [ ] `selectStructureMemberCount` beside `selectAliasIndex`.
- [ ] `npm run typecheck:fast` + `npm test -- memberCountReconcile` green. Commit.

---

### Task 3: delete the bridge, the two sub-handles and the two hooks

**review: yes** (Redux/selector surface + engine lifecycle.) **Lands as one commit with Task 4**
(Ruling 4).

**Files:**

- Delete: `src/@types/engine/layer/GalaxyCatalogBridge.d.ts`,
  `src/@types/engine/handles/EngineSourcesHandle.d.ts`,
  `src/@types/engine/handles/EngineSelectionHandle.d.ts`, `src/hooks/useAliasIndex.ts`,
  `src/hooks/useStructureMemberCount.ts`, `src/@types/engine/UseAliasIndexInput.d.ts`,
  `src/@types/engine/UseAliasIndexReturn.d.ts`,
  `src/@types/engine/UseStructureMemberCountInput.d.ts`,
  `src/services/loading/awaitSlotReady.ts`, `tests/services/loading/awaitSlotReady.test.ts`
- Modify: `src/@types/engine/EngineHandle.d.ts`, `src/services/engine/engine.ts`,
  `src/@types/engine/state/EngineState.d.ts`, `src/services/engine/phases/createLayers.ts`,
  `src/services/engine/layer/instantiateLayer.ts`,
  `src/layers/galaxyCatalog/types/GalaxyCatalogRuntime.ts`,
  `src/components/containers/InfoCardContainer.tsx`,
  `src/components/containers/CommandPaletteContainer.tsx`, `src/components/App/App.tsx`

**Interfaces — produces:**

```ts
// src/@types/engine/EngineHandle.d.ts
export type EngineHandle = {
  debug: EngineDebugHandle;
  destroy: () => void;
};
```

`GalaxyCatalogRuntime` stops extending `GalaxyCatalogBridge` and declares `catalogs` and `pgcAlias`
as its own fields (same types, same comments — the bridge only ever named what the runtime already
owned). `instantiateLayer`'s optional `onRuntime?(runtime)` parameter and `createLayers.ts:109`'s
`layer.name === 'galaxyCatalog'` cast go with it; `EngineState.galaxyBridge` and its `engine.ts:330`
seed and `:534` teardown go too.

- [ ] Delete the three handle/bridge types and rewrite `EngineHandle` to the two fields above; let
      `tsc` enumerate the readers.
- [ ] `engine.ts`: delete `loadPgcAliasesFn`, `getCloud`, `getCloudObjIds`, the `selection`/`sources`
      entries in the handle literal, the `PgcAliasMap`/`GalaxyCatalog`/`SourceType` imports they
      needed, and the `galaxyBridge` seed + teardown.
- [ ] `InfoCardContainer`: drop the `engineHandleRef` prop and the hook call; read
      `selectStructureMemberCount` with `useAppSelector`. `CommandPaletteContainer`: same, reading
      `selectAliasIndex` (keep passing `aliasIndex ?? undefined` semantics — the selector returns `[]`,
      so pass it straight). `App.tsx:136,147` drop the prop; **`handleRef` itself stays** — the
      DebugPanel's two containers still take it (Finding 4).
- [ ] Delete `awaitSlotReady` and its test (Finding 3) — re-`rg` for readers first, and if any
      survives, leave the file and say so in the report.
- [ ] No new test: this is a deletion + selector re-point, and Tasks 1–2's reconcile tests plus
      `tsc` cover the replacement. Delete `tests/components/CommandPalette/CommandPalette.test.ts`
      cases that stub the handle, if any remain after the prop goes.
- [ ] `npm run typecheck:fast` green. Do **not** commit yet — Task 4 shares this commit.

---

### Task 4: `RequestKey` → `ui.paletteOpen`, with the Layer's own wake

**review: yes** (a saga + the demand loop's read surface.) **Same commit as Task 3.**

**Files:**

- Delete: `src/@types/loading/RequestKey.d.ts`
- Create: `src/state/ui/watchPaletteWakeSaga.ts`
- Modify: `src/@types/loading/DemandCtx.d.ts`, `src/services/engine/wiring/buildDemandCtx.ts`,
  `src/@types/engine/state/EngineState.d.ts`, `src/services/engine/engine.ts`,
  `src/store/rootSaga.ts`, `src/layers/galaxyCatalog/load/galaxyCatalogAssetRows.ts`
- Test: `tests/state/ui/watchPaletteWakeSaga.test.ts` (new)

**Interfaces — produces:**

```ts
// src/@types/loading/DemandCtx.d.ts — `request` is replaced by, in the same position:
/** Read-only view of the shell's UI state; `paletteOpen` is the pgcAlias row's trigger. */
ui: Readonly<UiState>;

// src/@types/engine/state/EngineState.d.ts — replaces `requests: Set<RequestKey>`:
/** A getter onto `store.getState().ui`, the same shape as `selection` above. */
ui: UiState;
```

The `pgcAlias` row's demand becomes `(ctx) => ctx.ui.paletteOpen`
(`galaxyCatalogAssetRows.ts:55`). `watchPaletteWakeSaga` takes `setPaletteOpen` (`state/ui/uiSlice.ts:43`)
and, on `payload === true`, calls `fx.requestRender()` off the `reconcile` context — the shape of
`src/state/selection/watchSelectionWakeSaga.ts:20-27` — and is forked in `rootSaga.ts`'s list beside
it. It is **not** declared on the Layer: `Layer.sagas` has no reader (Finding 11, Ruling 6).

- [ ] Check whether `EngineState` already exposes a store-getter pattern to copy for `ui`
      (`selection`, `EngineState.d.ts:35-36`) and mirror it exactly — including where the getter is
      installed in `engine.ts`.
- [ ] Write the saga test first: `wakes the render loop when the palette opens` and
      `does not wake when the palette closes` (assert `requestRender` call counts against a stub
      `ReconcileEffects` context — this is the bug class CI cannot see: at rest, no wake means the
      alias load never starts).
- [ ] Implement the saga and fork it in `src/store/rootSaga.ts`.
- [ ] Swap `request` for `ui` on `DemandCtx` + `buildDemandCtx`, delete `RequestKey.d.ts`,
      `state.requests` and its `engine.ts:322` seed, and flip the row's `demand`.
- [ ] `npm run typecheck:fast`, `npm test -- watchPaletteWakeSaga demand`, then **commit Tasks 3+4
      together** with a message naming both halves.

---

### Task 5: the Galaxies settings section moves into the Layer (D13)

**Files:**

- Move: `src/components/SettingsPanel/GalaxiesSection.tsx` → `src/layers/galaxyCatalog/ui/GalaxiesSection.tsx`;
  `src/components/containers/GalaxiesSectionContainer.tsx` → `src/layers/galaxyCatalog/ui/GalaxiesSectionContainer.tsx`
  (drags their tests)
- Modify: `src/layers/galaxyCatalog/layer.ts`, `src/components/SettingsPanel/SettingsPanel.tsx`

**Move command:**

```bash
# write the manifest to the scratchpad, not the repo:
#   [{"from":"src/components/SettingsPanel/GalaxiesSection.tsx",
#     "to":"src/layers/galaxyCatalog/ui/GalaxiesSection.tsx"},
#    {"from":"src/components/containers/GalaxiesSectionContainer.tsx",
#     "to":"src/layers/galaxyCatalog/ui/GalaxiesSectionContainer.tsx"}]
npm run move-files -- --dry --manifest /tmp/galaxies-ui-moves.json
npm run move-files --       --manifest /tmp/galaxies-ui-moves.json
```

**Behaviour:** `layer.ts` gains `ui: GalaxiesSectionContainer`; `SettingsPanel.tsx` deletes its
hand-written `<GalaxiesSectionContainer />` child and its import (the `APP_COMPOSITION.layers.map`
at `:45-47` already renders it, in composition order — **before** the core sections, which is where
the hand-written child sits today, so the panel's visual order is unchanged). The moved section keeps
importing `CollapsibleSection`, `Slider` and `SettingsPanel.module.css` from
`src/components/` by relative path: the shared section chrome is core vocabulary, and duplicating a
CSS module per Layer is exactly the bolt-on this sequence exists to avoid.

- [ ] Move both files with the manifest form; then `rg -n "GalaxiesSection" src tests` for
      string-literal and CSS specifiers the tool misses.
- [ ] Declare `ui` on the Layer; delete the panel's hand-written child + import.
- [ ] `npm test -- SettingsPanel` and `npm run build` — the empirical check Ruling 5 asks for. If
      either fails on a module cycle or a CSS-module resolution in the node test env, fall back to
      `src/compositions/appUi.ts` (a `readonly (readonly [layerName, LayerUiSection])[]` the panel
      maps instead) and record **which shape landed** in the dispatch report.
- [ ] No new test: `SettingsPanel.test.tsx` already asserts the composed section renders.
- [ ] Commit.

---

### Task 6: §15 docs, the spec amendment, and the audits

**Files:**

- Modify: `.claude/skills/add-data-source/SKILL.md`, `docs/RENDERER.md`, `CLAUDE.md`,
  `docs/DATA.md`, `docs/superpowers/specs/2026-09-09-layer-composition-design.md` (§14 rows only),
  `docs/BACKLOG.md` (+ any detail file this PR consumes)

**Docs, per spec §15, each with the specific edit named there:**

- `add-data-source/SKILL.md`: replace the edit-surface map with "add a source row inside the Layer"
  versus "add a Layer", and fix the stale sites §8 of the review lists — the click-handler `||`
  chain, the 11 marker-renderer sites, `structurePoiStyles.ts`, `STRUCTURE_CATEGORY_META` (which
  never existed).
- `docs/RENDERER.md`: the renderer map gains the Layer/core split and the boot check; `ContentLayer`
  → `ContentPass` throughout.
- `CLAUDE.md`: "Where to look" gains `src/layers/` and `src/compositions/`; the one-symbol-per-file
  convention gains the amendment that a Layer's `types/` folder is that convention's home inside a
  Layer, not a second `@types/`.
- `docs/DATA.md`: the Edenhofer "no `allowDataFile` entry" claim is already false
  (`/^edenhofer-dust-.../` exists) — fix it.
- Spec §14 (Corrections): one row for this plan's scope ruling — the reference engine moves from
  §10(d) to §10(e), with Finding-backed reasoning (36 core passes; no store parameterization).

- [ ] Write the four doc edits above; each claim gets opened and checked against the tree before it
      is written (the citations-open-file rule), not transcribed from this plan.
- [ ] Spec §14 row for the reference-engine deferral; leave §7 in place (it describes (e) now) with a
      one-line pointer to the §14 row.
- [ ] Run the **deletion audit** over `origin/main..HEAD` — the whole 04d+04e galaxy Layer surface is
      in scope, this being the feature's `/feature-done` (04d deferred its audit here). Frame it as
      "a less-capable model wrote this; surplus is presumed". Report findings; apply only what the
      controller rules.
- [ ] Run the **comment audit** over every file this branch touched, plus the two 04d carry-overs:
      `src/layers/galaxyCatalog/passes/diskRadiusRing.ts` (68 comment lines / 106 code) and the
      `built: 'external'` marker in `createLayers.ts`. Budget: module header ≤ 5 lines, comment lines
      ≤ half the code lines.
- [ ] Delete the four `04e deletes this` markers 04d left on the scaffolding (`instantiateLayer.ts:13`
      and siblings — `rg -n "04e" src`), verifying each is genuinely gone rather than just unmarked.
- [ ] Backlog hygiene: `rg -n "layer" docs/BACKLOG.md` and delete any index line + detail file this PR
      consumes; leave the rest untouched.
- [ ] `npm test`, `npm run build`, `npm run format`. Commit.

---

## Definition of Done

**Deliverable inventory**

- [ ] `EngineHandle` is exactly `{ debug: EngineDebugHandle; destroy: () => void }`; no
      `EngineSourcesHandle`, `EngineSelectionHandle` or `GalaxyCatalogBridge` file exists;
      `EngineState` has neither `galaxyBridge` nor `requests`.
- [ ] `GalaxyCatalogFacts` has four keys — `famousMeta`, `provenanceCounts`, `aliasIndex`,
      `structureMemberCount` — each with a selector in `src/state/engine/selectors.ts` and each
      published from the Layer, never from a core reducer.
- [ ] `src/hooks/` holds no `useAliasIndex` / `useStructureMemberCount`, and
      `src/@types/engine/` holds none of their three input/return types; `AliasIndexEntry.pgc` is a
      `number`.
- [ ] `RequestKey` does not exist; `DemandCtx` has `ui` and no `request`; the `pgcAlias` row demands
      on `ctx.ui.paletteOpen`, with `watchPaletteWakeSaga` forked in `rootSaga.ts`.
- [ ] `galaxyCatalogLayer` declares `ui`; `src/layers/galaxyCatalog/ui/` holds both Galaxies section
      files; `SettingsPanel.tsx` renders no galaxy child by hand. (Or: `appUi.ts` landed instead, and
      the report says why.)
- [ ] `rg -n "04e" src` is empty.
- [ ] The four §15 docs and the spec's §14 row are updated.

**Named observable behaviours** (user-attested on this branch's dev server, `/link-data` linked)

- [ ] Cmd+K, type a PGC alias (e.g. a GLADE galaxy's common name): the palette lists it on the first
      open, a second or so after opening — proving the demand flip **and** the wake (open the palette
      with the scene at rest, camera untouched; without the wake the list never fills).
- [ ] Cmd+K alias search **after a tier swap**: swap small ↔ medium, then search the same alias and
      select it — the camera flies to the right galaxy (Ruling 1's stale-`localIdx` fix; on `main`
      this selects the wrong object).
- [ ] Select a cluster ring: the InfoCard shows "Galaxies N"; toggle a galaxy catalog off and the
      number drops; select a famous galaxy and the row disappears.
- [ ] Settings › Galaxies renders in its usual place with every control live (source toggles, bias
      mode, sliders), and the panel's section order is unchanged from `main`.
- [ ] DebugPanel still opens and its camera-state and Earth-tile-atlas sections still read (the
      `debug` handle and `handleRef` survived).
- [ ] Boot with no console error; the galaxy cloud, famous thumbnails and picking are unchanged from
      `main` by eye.

**Perf** — no paired run required (user ruling 2026-09-16: no renderer or pass change lands; both new
reconciles are key compares per frame). Recipe if wanted at landing: `npm run perf` A-B-A-B on
`full-survey`, `milky-way`, `solar-system`, **passing `--url http://localhost:<this worktree's port>`**.

**The deferral boundary** — `galaxiesOnly.ts`, its `tools/` entry and the composition-parameterized
store are **not** in this PR (Scope ruling). `SOURCE_REGISTRY` stays in `src/data/sources.ts`
(04d Ruling 1). The galaxy id types stay in `src/@types/data/galaxyCatalog/` (04d Ruling 11). No
second Layer forms.

## Deferred

**(e), with the first sibling Layer:** the `galaxiesOnly` reference engine + `tools/` entry + build
script (spec §7, re-sequenced by this plan's scope ruling); `composeSources(layers)` and the composed
`SOURCE_REGISTRY`'s home; `GalaxyCatalogId` and friends into the Layer's `types/`.

**Adjacent, unruled** (carried from 04d, still true): `AssetWiringRow.factory` means "mint" for a core
row and "hand back" for a Layer row; `LayerCoreDeps.store` exists only for settings reads and could
narrow to a getter; `APP_COMPOSITION` pulls `?worker`/`?static` modules into every store test's graph.
