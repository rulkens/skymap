# Layer composition (d), PR-B — the contract over the empty tuple

Spec: [`docs/superpowers/specs/2026-09-09-layer-composition-design.md`](../specs/2026-09-09-layer-composition-design.md)
§9(d): rulings **D1, D2, D4, D5, D6, D6'1–D6'5, D7, D8, D13** and prep items **P1, P3, P4, P5, P6**,
with §4.2–4.5 (the types), §5 (the boot check idiom) and §13 (A7, A8, the D-rows). Read the P1,
P3–P6 paragraphs and the **PR packaging** table before starting; the "Backlog consumption"
paragraph at the end of §9(d) is shared with 04c/04d and stays where it is.

Plan 04b of the layer-composition sequence; follows plan 04a
([`completed/2026-09-14-layer-composition-04a-demand-loop.md`](completed/2026-09-14-layer-composition-04a-demand-loop.md)).
Second of the four stacked PRs §9(d) D14 packages (d) into: PR-A (shipped, #703), **PR-B (this
plan)**, PR-C (the galaxy-side un-braids), PR-D (the Layer itself).

Branch: `worktree-layer-composition-04b` (off `854aa70d2`). One PR, 14 tasks, every commit green.
Gate (spec PR-B row): the suite, `npm run typecheck`, and the new import-boundary ratchet. **No perf
gate**: nothing here runs per frame that did not already, and the two per-frame additions (an empty
hook loop, a two-field compare) are `tsc`-proven neutral over the empty tuple.

**Parallelism: max safe.** Every task lands in its own isolation worktree and is cherry-picked onto
the branch, so tasks that share a file serialize. Task 1 first. Then six in parallel: 2, 3, 6, 8, 12,
13. Chains after that: A (fades) 3→4→5; B (selection) 6→7; C (facts, handle) 8→9; D (bootstrap)
9→10→11, with 12 before 11. Cross-chain file locks: **7 after 10** (`engine.ts`, `BootstrapDeps`);
**11 after 12** (`shouldKeepTicking.ts`); **5 after 7 and 11** (`createTestStore.ts`, `runFrame.ts`).
Task 14 gates. The per-task **Files** lists are the authority; a task whose set overlaps a task with
an open review waits.

## Goal

Give core every joint the first Layer needs, over a tuple that is still `[]`, so PR-D lands as
substitutions rather than mechanism. After this PR a Layer can declare typed settings, sources and
facts; publish facts into the store; contribute selection rows that core composes into the one
resolver the sagas and the pick path read; run once per frame and vote on liveness; be created in a
bootstrap phase of its own with the four extra core objects `create` needs; and place its settings
section in the panel. Every deletion here is one whose replacement is core-side; deletions whose
replacement is galaxy-Layer code wait for PR-D (see "Deferred").

Behaviour-neutral, with two named exceptions that are not user-visible: fade re-syncs stop
re-issuing a `fadeTo` to a target already held (a settings write now re-syncs every row, so the
skip is what keeps that O(rows) instead of O(rows) restarts), and the flow field reseeds from the
frame that follows a `setFlow` write instead of from the saga that saw it, which is the same frame.

## Architecture

- **Literal-bearing fields become type parameters (D1).** `Layer<Name, Runtime, Settings, Sources,
  Facts>`, all but the first two defaulted to their erased bounds so `Layer<string, unknown>` keeps
  working as the composition constraint (`EngineComposition.d.ts:10`). `defineLayer` takes them as
  `const` parameters. The app's fragment tuple becomes `[...UNFORMED_SETTINGS_FRAGMENTS,
  ...settingsOf(APP_COMPOSITION.layers)]`: the thirteen fragments that exist today are the unformed
  half, and `settingsOf` is the fold PR-D's first Layer joins. `ComposedClusters` maps over
  `Fragments[number]` (`ComposedClusters.d.ts:9-13`), so `SettingsOf<Layers>` needs only the UNION
  of each Layer's fragment types, never a tuple walk: `readonly SettingsFragmentsOf<Layers[number]>[]`.
- **One `frame` hook, its return is liveness (D2).** `createLayers` binds `layer.frame?.(runtime)`
  once into a `LayerInstance`; `runFrame` calls each instance's bound hook in tuple order right after
  the focus uniform is produced (`runFrame.ts:189-191`) and before the first planner, and ORs the
  results into the `shouldKeepTicking` vote as `layersAnimating`. The galaxy blocks that follow
  (`runFrame.ts:207-243`) and the galaxy terms in `shouldKeepTicking` stay until PR-D replaces them
  with the galaxy Layer's hook.
- **No effects seam (D4).** The flow field reconciles its seed parameters in the frame, beside the
  Milky Way cloud's own `reconcile` (`runFrame.ts:88`): `flowFieldRenderer.reconcile({ mode, count })`
  arms a reseed when either differs from the last value it was handed. `watchFlowReseedSaga` and
  `ReconcileEffects.reseedFlow` go. Fade syncing generalises: `watchFadesSaga` fires `syncFades()` on
  every `settings/` write (the route test `watchWakeSaga.ts:45-47` already uses), the batch bridge
  skips any item whose registry target already equals its intent target via the new
  `fades.targetOf`, and `FADE_ROW` plus the `writes` half of `VISIBILITY_ACTION_ROW` die. The bias
  bake keeps its saga until PR-D (its replacement is the galaxy Layer's hook).
- **One `SelectionKindRow` per ref type, composed into one resolver (D5, D6'2).** Six core-owned
  rows, one per `SelectionRef['type']` (`SelectionRef.d.ts:17-31`), each closing over the live
  engine objects the old `ResolveDeps` bag exposed. `composeSelectionRows(rowsOf)` builds the
  `SelectionResolver` the saga context carries as `selection`, and the pick path calls the same
  object's `resolvePick`. Rows are read lazily (`rowsOf()`) because the resolver must serve a deep
  link before `createLayers` has run, while the Layer rows only exist after it. Focus ids resolve by
  claim-then-decode: the first row whose `focusId.claims(id)` is true is authoritative even when its
  `decode` returns null, and claims are exact (a prefix, a literal, or membership of the loaded
  famous meta), so row order plays no part. The four tables this replaces: `RESOLVE_PICK`,
  `EXTRACT_ROW`, `FOCUS_ID_DECODERS`, `ENCODE`.
- **Facts, and the handle shrinks (D6, D6'4, D6'5).** `factsReported({ layer, patch })` is the one
  action; its reducer merges the patch under `state.engine[layer]`, and `EngineSliceState` becomes
  `CoreEngineSliceState & FactsOf<AppLayers>` the way `EngineSettingsState` composes today
  (`EngineSettingsState.d.ts:16-19`). The structure search list becomes a core fact published by
  `wireStructureProjection` on every group change, which is what lets `useStructureIndex` and
  `sources.getStructures` die now. `assetSlots` moves under `debug`; the `camera` sub-handle, whose
  `logState` has no reader, goes.
- **A `createLayers` phase (D7, D8).** Between `initGpu` and `wireSlots` (`bootstrap.ts:105-110`),
  because the four extra deps exist after `initGpu` (`focusUniform`, the BGLs, the boot `format`)
  and nothing that reads a runtime has run. Each Layer's `create(deps)` is called in tuple order; the
  result is bound into a `LayerInstance` and stored on `state.layers`. Destroy runs the instances in
  reverse tuple order before any core teardown that a Layer's captured core object depends on, which
  is why the `focusUniform` capture is safe to hand out. The boot check for selection-row
  disjointness (no two rows share a `type` or a pick source code) runs here, so a bad composition
  throws at boot rather than inside a click's swallowed promise.
- **Readiness narrows to core (D8).** `isEngineReady` becomes `booted && renderTargets &&
  compositor`. It has two callers (`frameContext.ts:73`, `shouldKeepTicking.ts:42`); the three galaxy
  conjuncts it drops have one dependent between them, `galaxyPointSpritesPass`'s read of
  `ctx.galaxyPointRenderer` (`galaxyPointSpritesPass.ts:32,89`), which re-points at
  `state.gpu.galaxyPointRenderer` with the null guard every other pass already uses (`ContentPass.d.ts:7-9`
  states that convention). `ReadyFrameContext` then loses both galaxy fields; `texturedDisks` had no
  reader at all.
- **Panel order is composition order (D13).** `SettingsPanel` renders every present Layer's `ui` in
  tuple order, then its eight core sections. Over the empty tuple the DOM is byte-identical.

## Tech Stack

TypeScript 6.0.3, Vitest, Vite, WebGPU, redux-saga where a deletion touches it. No new dependency.

## Global Constraints

Binding on every task, from CLAUDE.md and the spec:

- **One symbol per file** in `src/utils/` and `src/@types/`; filename = the exported symbol;
  `src/@types/` is one TYPE per file. Deep relative imports, no barrels. `type` aliases, never
  `interface`.
- **Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their
  own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.**
- **Comment budget** per [`comments.md`](../conventions/comments.md): module header ≤ 10 lines,
  comment lines ≤ half the code lines; explain why, never what. Several files this PR edits carry
  50–90-line headers written for a design that is leaving (`engineReady.ts:1-93`,
  `ReadyFrameContext.d.ts:1-47`, `resolveFocusId.ts:1-54`, `EngineHandle.d.ts:1-17`); bring each under
  budget in the task that edits it, and do not re-home the deleted prose.
- **Tests** are judged by [`testing.md`](../conventions/testing.md): no runtime type tests (every
  type-parameter change here is `tsc`'s to prove), no registry restatements, no mirrors.
- **`src/data/` never imports `services/`; `src/utils/` never imports `services/`.** The new
  `src/utils/layer/*` and `src/utils/selection/*` files import types only.
- **Every file move/rename goes through `npm run move-files -- <from> <to>`** (`--dry` first), never
  `git mv`. No task here moves a file; deletions are `git rm`.
- **Behaviour-neutral**, but for the two named non-visible differences in Goal. Anything else
  observed is a bug and stops the task.
- Commit after every task.

## Findings at HEAD `854aa70d2`

Verified in this worktree while writing the plan; the spec's line references predate #703. Re-derive
rather than trust.

| Fact                                                                                                                                                                                                                                                                                                                                                             | Where                                                                                                                       | What it means                                                                                                                                                                                                                             |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `handle.camera` has **no reader**; the `l` key routes `keyboardShortcuts.ts:64` → `camera/logCameraState` → `watchLogCameraStateSaga.ts:18` → `ReconcileEffects.logCameraState` (`makeReconcileEffects.ts:27-37`). `engine.ts:480-490` is a second copy of that body.                                                                                              | `engine.ts:580-582`, `EngineCameraHandle.d.ts`                                                                              | The `camera` sub-handle, its type and `logCameraStateFn` are dead; Task 9 deletes them. The effect and saga stay.                                                                                                                         |
| The `volumes` sub-handle is already gone (#695).                                                                                                                                                                                                                                                                                                                 | `EngineHandle.d.ts:35-38`                                                                                                   | Not scheduled.                                                                                                                                                                                                                            |
| `ReadyFrameContext.texturedDisks` has **no src reader**. `ReadyFrameContext.galaxyPointRenderer` has exactly one: `galaxyPointSpritesPass.ts:32` (`draw`) and `:89` (`drawPick`).                                                                                                                                                                                | `frameContext.ts:76-78,227,233`; tests `frameContext.test.ts:322-343`, `passes.test.ts:101,103,444,464,540`                 | Both fields can leave in PR-B: the pass reads `state.gpu.galaxyPointRenderer` like its `drawPick` already reads `state.gpu.galaxyPickRenderer` (`:85`). Task 12.                                                                          |
| `isEngineReady` has two callers and `ReadyEngineState` one importer.                                                                                                                                                                                                                                                                                             | `frameContext.ts:73`, `shouldKeepTicking.ts:42`, `engineReady.ts:96`                                                        | Narrowing is cheap; the `texturedDisks.hasInFlightWork()` term becomes a `?.` read.                                                                                                                                                       |
| `settingsSlice.ts` imports the thirteen fragments **directly** (`:16-31`) for the per-fragment `liftClusterReducers` spreads, and `APP_SETTINGS_FRAGMENTS` (`:14`) only for the uniqueness assert. Nothing else under `src/state/**` or `src/services/engine/**` imports `src/layers/**`; nothing under `src/components/**` or `src/hooks/**` does either.        | `settingsSlice.ts:14-31,245-281`                                                                                            | The ratchet's one allow-list row is `state/settings/settingsSlice: 13`. The spreads need each fragment's literal type for `settingsSlice.actions`' typed exports, so the row stays until reducers compose at the type level (not this PR). |
| The fade registry exposes `register`/`unregister`/`fadeTo`/`setImmediate`/`opacityOf`/`isAnyAnimating`/`tick`; no `targetOf`. `applyIntent` is a private function of `syncVisibilityFades.ts:16-37`, exported only as `applyIntentForTest`.                                                                                                                       | `fadeRegistry.ts:167-177`, `FadeRegistry.d.ts`, `FadeController.d.ts`                                                       | Task 3 adds `targetOf` to the controller and the registry.                                                                                                                                                                                |
| **The sky-cubemap re-bake relies on a re-commit's `fadeTo(1)` at an opacity already 1.** `fadeController.ts:109-110` refuses an unchanged-target early return for exactly this; `scheduleCubemapCaptures.ts:52-59` keys the bake on `fades.isAnyAnimating` and says a tier swap's re-commits keep it true. The re-commit path is `syncVisibilityFadeItem` (`galaxyCatalogSourceRegistry.ts:131`). | `scheduleCubemapCaptures.ts:29-31,57-59`                                                                                    | **Ruling 1**: the idempotence guard lives in the BATCH bridge only. `syncVisibilityFadeItem` stays unguarded, and its comment names the bake key as the reason.                                                                            |
| `flowFieldRenderer.maybeReseed()` is an unconditional `reseed.arm()`; the saga is what gates on `mode`/`count` being in the `setFlow` payload. The field's own load arms the first seed.                                                                                                                                                                          | `flowFieldRenderer.ts:293-298`, `watchFlowReseedSaga.ts:19-23`                                                              | The last-applied compare moves onto the renderer as `reconcile({ mode, count })`, the shape `milkyWayCloud.reconcile(starCount)` already has (`runFrame.ts:88`). Task 5.                                                                  |
| `applySceneEffect` calls `syncVisibilityFades` with `only: effect.layers` and an authored `durationMs` (`:43-47,62-66`); `FADE_ROW`'s only reader is `watchFadesSaga.ts:15-23`.                                                                                                                                                                                  | `applySceneEffect.ts`, `watchFadesSaga.ts`                                                                                  | `syncVisibilityFades`' `only` option survives for the tour; only `ReconcileEffects.syncFades`' parameter goes. Task 4.                                                                                                                     |
| `resolveDeps` has seven saga consumers plus `resolveClipFoci` and `clipFociReady`; about twenty test files build a `ResolveDeps` fixture.                                                                                                                                                                                                                         | `watchClipSaga.ts:83`, `watchClipPathInspectSaga.ts:67`, `visitBeatSaga.ts:74`, `watchTierSaga.ts:53`, `watchFocusTweenSaga.ts:67`, `resolveFocusRefDeferring.ts:20`, `watchSelectionRowsSaga.ts:46` | Task 7 re-points every consumer at `selection`; a one-line test helper (`selectionResolverOver(deps)`) keeps the fixtures.                                                                                                                |
| `watchFocusTweenSaga.ts:89-93` probes `resolveDeps().stars.current()`; D6'1 deletes that in (e).                                                                                                                                                                                                                                                                 | `ResolveDeps.d.ts:24`                                                                                                       | `ResolveDeps` and the `resolveDeps` context entry survive PR-B whole (the core galaxy row needs `catalogs` and `famousGalaxiesMeta` too). PR-D drops the galaxy fields; (e) the rest.                                                      |
| The seeded famous-star pick arm: `FAMOUS_STAR_ENTRY` is `type: 'starCatalog'` with `binBaseName: null` (`famous-star.ts:14,38`), and `RESOLVE_PICK.starCatalog` splits on that to return a BODY ref (`resolvePickTable.ts:56-61`).                                                                                                                              | `resolvePickTable.ts`, `data/sources/famous-star.ts`                                                                        | A row keyed by entry TYPE cannot return only its own ref type here. **Ruling 2**: `pickSources` are source CODES.                                                                                                                         |
| `engineSourceCountReported` is dispatched from `starCatalogSlot.ts:69`, `galaxyCatalogSourceRegistry.ts:147` and `engine.ts:141`; three sagas `take` it.                                                                                                                                                                                                         | `engineSlice.ts:74`                                                                                                         | `deps.reportSourceCount` is that dispatch bound; no caller changes until their Layers form.                                                                                                                                               |
| `state.requests` / `RequestKey` / `ctx.request`: written at `engine.ts:497` and `createSyntheticFallback.ts:158`, read by two `ASSET_WIRING` rows (`:238,:371`) through `buildDemandCtx.ts:20`.                                                                                                                                                                  | `RequestKey.d.ts`, `DemandCtx.d.ts:86`                                                                                      | Deferred to PR-D with `loadAliases` (the `pgcAlias` demand flips to `ui.paletteOpen` in the same PR as the hook that raises the key).                                                                                                      |
| `tests/conventions/` holds the directory-sweep ratchets (`oneSymbolPerFile`, `filenameMatchesExport`); `oneMpcSeam.test.ts` is the one test that walks `getImportDeclarations()`.                                                                                                                                                                                | `tests/conventions/*.test.ts`, `tests/services/engine/camera/oneMpcSeam.test.ts:31-37`                                       | Task 2's ratchet lives in `tests/conventions/` and copies `oneMpcSeam`'s ts-morph import walk with `frameFilePurity`'s allow-list ratchet.                                                                                                |
| `PhaseLocals` carries `device`, `context`, `unwatchHdrCapability` but not the boot `format`, which `initGpu` keeps local (`:45,74-80`). `LayerCoreDeps.ctx: GpuContext` needs it.                                                                                                                                                                                | `PhaseLocals.d.ts:12-22`, `initGpu.ts:53`                                                                                   | Task 10 adds `format` to `PhaseLocals`.                                                                                                                                                                                                   |
| There is no `tests/compositions/` and no `tests/services/engine/layer/`; `tests/helpers/engine/stubComposition.ts` exports `STUB_COMPOSITION` (empty).                                                                                                                                                                                                           | `tests/helpers/engine/stubComposition.ts`                                                                                   | New test dirs are created where the mirror puts them; the engine-level destroy-order test builds its own one-Layer composition.                                                                                                           |

## Rulings

Made at plan time against the code above. Do not re-open during execution; a reviewer who disagrees
escalates to the user.

**Ruling 1 — the fade idempotence guard is in the batch bridge, not in `applyIntent`.** D4 says
`applyIntent` skips when `targetOf(handle)` equals the target. Applied to the per-item bridge that
guard silently breaks the lensed sky: `scheduleCubemapCaptures` re-bakes on `isAnyAnimating`, and a
tier swap's re-commit at opacity 1 is what produces that blip (Findings, row 7). So the skip is done
by `syncVisibilityFades`' loop, which is the path every settings write now walks, and
`syncVisibilityFadeItem` keeps issuing the `fadeTo`. The knot (a fade blip doubling as a re-bake
pulse) is accidental and belongs to a cubemap-key fix, not to this PR; the one-line comment at the
item bridge is the marker.

**Ruling 2 — `pickSources` are source CODES, not entry types.** The spec sketch types them as
`SourceEntry['type'][]`. Keyed that way the star row would have to return a body ref for the seeded
famous-star catalog (Findings, row 11), which contradicts D6'3's "a row returns only its own ref
type" and forces a widened `resolvePick` return. Keyed by `SourceType` the body row lists
`Source.FamousStar` beside every `type: 'body'` code and the star row lists `Source.GaiaStars`, which
is D6'3's own example, with no behaviour change: the same codes reach the same arms. `PickResult`
already carries `sourceCode` (`PickResult.d.ts:9`), so the composed `resolvePick` dispatches on it
and passes the registry entry through as today. The user may veto this and take the entry-type key
with a `SelectionRef | null` return on `resolvePick`; D6'3 then re-does the split in (e).

**Ruling 3 — D2 is scheduled here.** The spec assigns the `frame` hook to no P item. It is core
mechanism PR-D cannot ship a Layer without, PR-B is "the mechanisms", and its call site is three
lines over the empty tuple. Task 11 adds the type, the call site and the `keepTicking` term; the
galaxy blocks in `runFrame` and the galaxy terms in `shouldKeepTicking` stay for PR-D. The user may
veto and move Task 11 to PR-D's plan; nothing else here depends on it.

**Ruling 4 — the composed resolver reads its rows lazily.** `composeSelectionRows(rowsOf)` calls
`rowsOf()` per resolution. A body or Milky Way deep link resolves statically during the boot window
(`wireInput.ts:138-147` relies on it to defer the Earth seed correctly), before `createLayers` has
run, so an eagerly composed resolver built after the phase would change boot behaviour. Six or seven
rows per call is nothing; the disjointness check runs once, in `createLayers`, not per call.

**Ruling 5 — `ResolveDeps` keeps all four fields in PR-B.** The core galaxy row needs `catalogs` and
`famousGalaxiesMeta`; the star probe needs `stars`; the structure row needs `structures`, widened to
`Pick<StructureStore, 'byId' | 'byCategory'>` because the pick arm (`resolveStructureFromPick`) and
the extract arm read different methods. Test fixtures gain one `byCategory: () => []` line. The
galaxy fields leave in PR-D with the galaxy row; the bag dies in (e) (D6'1).

**Ruling 6 — `SelectionKindRow.focusId.encode` returns `string | null`.** The spec sketch says
`string`; the galaxy encoder returns null when the cloud is not loaded (`focusIdOf.ts:94-98`) and
`captureGalaxyFocusIds.ts:57-61` relies on that. The composed `focusIdOf` stays nullable.

**Ruling 7 — a Layer without `facts` gets a `publish` that throws.** The reducer merges with
`Object.assign(state[layer], patch)` and must not grow a silent-drop branch (the extraReducers
landmine class). `createLayers` binds `publish` to a thrower for a Layer whose `facts` is undefined,
so the programmer error surfaces at the call site, once, with the Layer's name.

**Ruling 8 — `ComposedSources` is a type with no runtime consumer until PR-C.** Spec P1 lists it;
`composeSources(layers)` is D11's and lands with the source-row move. The type is one file; the
plan does not invent a consumer for it.

**Finding for PR-D, not a ruling here — D1's runtime derivation closes an import cycle.**
`appSettingsFragments.ts` will import `APP_COMPOSITION`; a Layer module transitively importing
`settingsSlice` at module-init (any `src/layers/**` file that reads an action creator into a table,
as `visibilityActionRow.ts:20-36` does) then evaluates `settingsSlice` → `appSettingsFragments` →
`app` → the Layer → `settingsSlice`, and the second entry reads uninitialised `const` exports. Over
the empty tuple no such edge exists, so PR-B ships D1 as ruled. PR-D's plan must carry the fix; the
two candidates are fragments minting their own `createAction`s (so Layer code never imports the
slice) or a type-only derivation with a boot assert. **Record in the PR body and ask.**

## File structure

**Created**

```
src/@types/engine/layer/SettingsOf.d.ts               readonly union of each Layer's fragment types
src/@types/engine/layer/ComposedSources.d.ts          Record over each Layer's [code, entry] tuples (type only, Ruling 8)
src/@types/engine/layer/FactsOf.d.ts                  { [name]: Facts } over Layers that declare facts
src/@types/engine/layer/SelectionKindRow.d.ts         D5's row (Ruling 2: pickSources are codes)
src/@types/engine/layer/LayerInstance.d.ts            a Layer bound to its runtime: name, frame, selection, destroy
src/@types/engine/selection/SelectionResolver.d.ts    the composed four-method resolver
src/@types/store/CoreEngineSliceState.d.ts            today's EngineSliceState, renamed; + structureSearchList
src/utils/layer/settingsOf.ts                         flatMap over layers' settings
src/utils/layer/factsOf.ts                            name → facts record over layers that declare facts
src/utils/selection/assertSelectionRowsDisjoint.ts    throws on a repeated type or pick source code
src/services/engine/layer/instantiateLayer.ts         create + bind, one place
src/services/engine/phases/createLayers.ts            the new phase
src/services/engine/selection/composeSelectionRows.ts the composer
src/services/engine/selection/coreSelectionRows.ts    the six core-owned rows, from a ResolveDeps thunk
src/services/engine/selection/{galaxyCatalog,structure,milkyWay,zoneOfAvoidance,body,star}SelectionRow.ts
tests/conventions/layerImportBoundary.test.ts         the ratchet
tests/support/selectionResolverOver.ts                ResolveDeps fixture → SelectionResolver, one line per test
tests/…                                               mirrors, listed per task
```

**Modified**

```
src/@types/engine/layer/Layer.d.ts                    type params; −pick?; +facts?, +selection?, +frame?
src/@types/engine/layer/LayerCoreDeps.d.ts            <Facts>; +focusUniform, +fades, +publish, +reportSourceCount
src/services/engine/layer/defineLayer.ts              const params
src/compositions/app.ts, appSettingsFragments.ts      the derived tuple
src/@types/settings/EngineSettingsState.d.ts          unchanged shape; reads the derived tuple's type
src/services/animation/fadeController.ts + FadeController.d.ts, fadeRegistry.ts + FadeRegistry.d.ts   +targetOf
src/services/engine/wiring/syncVisibilityFades.ts     the batch-bridge skip (Ruling 1)
src/services/animation/visibilityActionRow.ts         −writes, −FADE_ROW
src/store/effects/watchFadesSaga.ts                   settings-route predicate; −FADE_ROW
src/store/effects/ReconcileEffects.ts                 syncFades: () => void; −reseedFlow
src/services/engine/wiring/makeReconcileEffects.ts    same two lines
src/@types/rendering/FlowFieldRenderer.d.ts + flowField/flowFieldRenderer.ts   maybeReseed → reconcile
src/services/engine/frame/runFrame.ts                 +flow reconcile (T5); +the hook loop and vote (T11)
src/services/engine/helpers/shouldKeepTicking.ts      ?. on texturedDisks (T12); +layersAnimating (T11)
src/store/rootSaga.ts                                 −watchFlowReseedSaga
src/store/types.ts                                    SagaContext +selection
src/@types/engine/BootstrapDeps.d.ts                  +coreSelectionRows
src/@types/engine/ResolveDeps.d.ts                    structures widened (Ruling 5)
src/@types/engine/interaction/HoverPickDeps.d.ts, src/@types/engine/CreateClickResolverInput.d.ts   resolvePick fn
src/services/engine/interaction/{hoverPickDriver,clickHandler}.ts, phases/wireInput.ts
src/state/{camera/watchClipSaga,camera/watchClipPathInspectSaga,tour/visitBeatSaga,tour/clipFociReady,tier/watchTierSaga,selection/watchFocusTweenSaga,selection/resolveFocusRefDeferring,selection/captureGalaxyFocusIds,selectionRows/watchSelectionRowsSaga}.ts
src/services/engine/animation/resolveClipFoci.ts
src/state/engine/engineSlice.ts                       +factsReported, +engineStructureSearchListChanged, composed initial state
src/@types/store/EngineSliceState.d.ts                = CoreEngineSliceState & FactsOf<AppLayers>
src/state/engine/selectors.ts                         +selectStructureSearchList
src/services/engine/wiring/wireStructureProjection.ts publishes the list
src/components/containers/CommandPaletteContainer.tsx selects it
src/@types/engine/EngineHandle.d.ts, handles/EngineSourcesHandle.d.ts, handles/EngineDebugHandle.d.ts
src/components/App/App.tsx:152                        debug.assetSlots
src/services/engine/engine.ts                         handle (T9); state.layers, deps, destroy (T10); rowsOf, saga context (T7)
src/@types/engine/state/EngineState.d.ts              +layers
src/@types/engine/PhaseLocals.d.ts, phases/initGpu.ts  +format
src/services/engine/phases/bootstrap.ts               the fifth phase
src/services/engine/helpers/engineReady.ts, src/@types/engine/ReadyEngineState.d.ts   three conjuncts
src/services/engine/frame/frameContext.ts, src/@types/engine/frame/ReadyFrameContext.d.ts   −galaxyPointRenderer, −texturedDisks
src/services/engine/frame/passes/galaxyPointSpritesPass.ts   reads state.gpu
src/components/SettingsPanel/SettingsPanel.tsx        composed sections first
docs/BACKLOG.md:38                                    the D line
```

**Deleted**

```
docs/backlog/2026-09-11-layer-settings-tuple-seam.md                  backlog D (Task 1)
src/@types/engine/layer/PickResolverRow.d.ts                          replaced by SelectionKindRow
src/store/effects/watchFlowReseedSaga.ts + tests/store/effects/watchFlowReseedSaga.test.ts
src/services/engine/helpers/resolvePick.ts, resolvePickTable.ts, extractSelectionRow.ts
src/services/url/resolveFocusId.ts, focusIdOf.ts
src/@types/engine/ResolvePickDeps.d.ts
src/hooks/useStructureIndex.ts, src/@types/engine/UseStructureIndexInput.d.ts
src/@types/engine/handles/EngineCameraHandle.d.ts
tests/services/engine/helpers/{resolvePick,resolvePickTable,extractSelectionRow}.test.ts  (cases move, see Task 7)
tests/services/url/{resolveFocusId,focusIdOf}.test.ts                  (cases move, see Task 7)
```

---

## Task 1 — the contract types, and backlog D consumed

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Files:** `src/@types/engine/layer/Layer.d.ts:21-45`, `src/@types/engine/layer/LayerCoreDeps.d.ts`,
`src/services/engine/layer/defineLayer.ts`, `src/compositions/app.ts`,
`src/compositions/appSettingsFragments.ts` (modify); `src/@types/engine/layer/{SettingsOf,ComposedSources,FactsOf,SelectionKindRow,LayerInstance}.d.ts`,
`src/@types/engine/selection/SelectionResolver.d.ts`, `src/utils/layer/{settingsOf,factsOf}.ts`
(new); `src/@types/engine/layer/PickResolverRow.d.ts`,
`docs/backlog/2026-09-11-layer-settings-tuple-seam.md` (delete); `docs/BACKLOG.md:38` (delete the
line).

**Produces:**

```ts
// src/@types/engine/layer/Layer.d.ts — the erased bounds are the defaults, so `Layer<string, unknown>`
// stays the composition constraint (`EngineComposition.d.ts:10`).
export type Layer<
  Name extends string,
  Runtime,
  Settings extends readonly SettingsFragmentLike[] = readonly SettingsFragmentLike[],
  Sources extends readonly (readonly [SourceType, SourceEntry])[] = readonly (readonly [SourceType, SourceEntry])[],
  Facts = undefined,
> = {
  readonly name: Name;
  readonly settings?: Settings;
  readonly sources?: Sources;
  /** Initial value, const-inferred; `FactsOf<Layers>` types `state.engine[name]`. */
  readonly facts?: Facts;
  readonly targets?: readonly RenderTargetSpec[];
  readonly sagas?: readonly SagaFactory[];
  readonly ui?: LayerUiSection;
  create(deps: LayerCoreDeps<Facts>): Runtime;
  destroy(runtime: Runtime): void;
  passes(runtime: Runtime): readonly ContentPass[];
  assets?(runtime: Runtime): readonly AssetWiringRow[];
  fades?(runtime: Runtime): readonly FadeLayer<unknown>[];
  labels?(runtime: Runtime): readonly Label2DProducer[];
  selection?(runtime: Runtime): readonly SelectionKindRow[];
  /** Once per frame, after the focus uniform, before any pass; `true` keeps the loop awake. */
  frame?(runtime: Runtime): (ctx: ReadyFrameContext, state: PassState) => boolean;
};

// src/services/engine/layer/defineLayer.ts
export function defineLayer<
  const Name extends string,
  Runtime,
  const Settings extends readonly SettingsFragmentLike[] = readonly [],
  const Sources extends readonly (readonly [SourceType, SourceEntry])[] = readonly [],
  const Facts = undefined,
>(layer: Layer<Name, Runtime, Settings, Sources, Facts>): Layer<Name, Runtime, Settings, Sources, Facts>;

// src/@types/engine/layer/LayerCoreDeps.d.ts — creation-time core objects only (D7)
export type LayerCoreDeps<Facts = undefined> = {
  readonly ctx: GpuContext;
  readonly fadeBgl: FadeUniformsBgl;
  readonly sourceBgl: SourceUniformsBgl;
  readonly focusBgl: FocusUniformsBgl;
  /** Core-owned; Layers are destroyed before core (D8), so the capture is safe. */
  readonly focusUniform: FocusUniform;
  readonly fades: FadeRegistry;
  readonly store: AppStore;
  readonly requestRender: () => void;
  readonly publish: (patch: Partial<Facts>) => void;
  readonly reportSourceCount: (source: SourceType, count: number) => void;
};

// src/@types/engine/layer/SettingsOf.d.ts — a union-typed array, never a tuple walk:
// `ComposedClusters` only reads `Fragments[number]`.
export type SettingsOf<Layers extends readonly Layer<string, unknown>[]> = readonly (Layers[number] extends infer L
  ? L extends { readonly settings: readonly (infer F extends SettingsFragmentLike)[] } ? F : never
  : never)[];

// src/@types/engine/layer/FactsOf.d.ts
export type FactsOf<Layers extends readonly Layer<string, unknown>[]> = {
  [L in Layers[number] as L extends { readonly name: infer N extends string; readonly facts: object }
    ? N
    : never]: L extends { readonly facts: infer F } ? F : never;
};

// src/@types/engine/layer/ComposedSources.d.ts (Ruling 8)
export type ComposedSources<Layers extends readonly Layer<string, unknown>[]> = {
  [E in (Layers[number] extends { readonly sources: readonly (infer E)[] } ? E : never) as E extends readonly [infer C extends SourceType, SourceEntry] ? C : never]: E extends readonly [SourceType, infer S] ? S : never;
};

// src/@types/engine/layer/SelectionKindRow.d.ts (D5; Ruling 2; Ruling 6)
export type SelectionKindRow<Ref extends SelectionRef = SelectionRef> = {
  readonly type: Ref['type'];
  /** Source CODES this row decodes picks for; disjoint across rows, asserted at boot. */
  readonly pickSources: readonly SourceType[];
  resolvePick(entry: SourceEntry, pick: PickResult): Ref | null;
  extractRow(ref: Ref, simDays: number): SelectionRow | null;
  readonly focusId?: {
    /** Exact knowledge: a prefix, a literal, or a loaded set. Never a catch-all. */
    claims(id: string): boolean;
    /** A claiming row is authoritative even when this returns null. */
    decode(id: string): Ref | null;
    encode(ref: Ref): string | null;
  };
};

// src/@types/engine/layer/LayerInstance.d.ts — bound once by `instantiateLayer`
export type LayerInstance = {
  readonly name: string;
  readonly selection: readonly SelectionKindRow[];
  readonly frame: ((ctx: ReadyFrameContext, state: PassState) => boolean) | null;
  destroy(): void;
};

// src/@types/engine/selection/SelectionResolver.d.ts
export type SelectionResolver = {
  resolvePick(pick: PickResult | null): SelectionRef | null;
  extractRow(ref: SelectionRef | null, simDays: number): SelectionRow | null;
  resolveFocusId(focusId: string): SelectionRef | null;
  focusIdOf(ref: SelectionRef): string | null;
};

// src/utils/layer/settingsOf.ts, src/utils/layer/factsOf.ts
export function settingsOf<const Layers extends readonly Layer<string, unknown>[]>(layers: Layers): SettingsOf<Layers>;
export function factsOf<const Layers extends readonly Layer<string, unknown>[]>(layers: Layers): FactsOf<Layers>;

// src/compositions/appSettingsFragments.ts
export const UNFORMED_SETTINGS_FRAGMENTS = [ /* today's thirteen, unchanged order */ ] as const;
export const APP_SETTINGS_FRAGMENTS = [...UNFORMED_SETTINGS_FRAGMENTS, ...settingsOf(APP_COMPOSITION.layers)] as const;
```

**Behaviour:** `SettingsOf<[]>` is `readonly never[]`, so `EngineSettingsState`
(`EngineSettingsState.d.ts:16-19`) and `INITIAL_SETTINGS` (`initialSettings.ts:8-11`) are unchanged
in value and in type; `settingsSlice.ts:235` keeps asserting over `APP_SETTINGS_FRAGMENTS`. The
`pick?` hook and `PickResolverRow` go with nothing to re-point (no reader). `LayerInstance`,
`SelectionKindRow` and `SelectionResolver` are consumed by Tasks 6, 7 and 10; declaring them here is
what lets those tasks run in parallel. Bring `Layer.d.ts`'s header to the new hook list.

- [ ] Delete the backlog index line and detail file; the spec's §13 A8 row already records the
      closing decision.
- [ ] `npm run typecheck` green with `layers: []` — the only test this task has (testing.md: no
      runtime type tests). The existing `settingsSlice — composed action namespace` case
      (`settingsSlice.test.ts:346-358`) covers the derived tuple.
- [ ] `npm test -- settingsSlice initialSettings` green. Commit.

## Task 2 — the import-boundary ratchet

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Files:** `tests/conventions/layerImportBoundary.test.ts` (new).

**Behaviour:** walk every `.ts`/`.tsx` under `src/services/engine/**` and `src/state/**` with
ts-morph (`oneMpcSeam.test.ts:31-37` is the import-walk idiom, `frameFilePurity.test.ts:23-59,118-133`
the exact-count ratchet and failure message). An import declaration whose specifier resolves under
`src/layers/` counts against the importing file's `ALLOWED` row, keyed `<dir>/<file>` relative to
`src/`; a file with no row allows zero. Exact, not a ceiling. Type-only imports count: the boundary
is about knowledge, not bundles.

```ts
const ALLOWED: Readonly<Record<string, number>> = { 'state/settings/settingsSlice': 13 };
```

- [ ] Test `every engine and state file imports nothing from src/layers beyond its ALLOWED row` —
      `it.each` over the swept files, message naming the offending specifiers and the row to edit.
- [ ] Prove the ratchet bites: temporarily add a layers import to any `src/state/**` file, run the
      test, see it fail, revert. Say so in the task report; no fixture file is committed for it.
- [ ] `npm test -- layerImportBoundary` green. Commit.

## Task 3 — `targetOf`, and the batch bridge skips a held target

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Files:** `src/@types/animation/FadeController.d.ts`, `src/services/animation/fadeController.ts`,
`src/@types/animation/FadeRegistry.d.ts`, `src/services/animation/fadeRegistry.ts`,
`src/services/engine/wiring/syncVisibilityFades.ts:56-72,81-90` (modify);
`tests/services/animation/{fadeController,fadeRegistry}.test.ts`,
`tests/services/engine/wiring/syncVisibilityFades.test.ts` (modify).

**Produces:**

```ts
// FadeController: the value the ramp is heading for (or holds), independent of time.
targetOf(): number;
// FadeRegistry: null for an unregistered id, so a compare against it never spuriously skips.
targetOf(id: FadeId): number | null;
```

**Behaviour:** `syncVisibilityFades` skips an item whose `fades.targetOf(row.handle(item))` already
equals its intent target (`row.intent(settings, item) ? 1 : 0`), before `guard`, before `fadeTo` or
`setImmediate`, before `post`. `syncVisibilityFadeItem` does NOT skip (Ruling 1); write the reason
in one line at `:81-90`, naming `scheduleCubemapCaptures`. The `animate: false` batch wake at `:71`
is unchanged.

- [ ] Test (`fadeController.test.ts`) `targetOf reports the destination mid-ramp and the held value at rest`.
- [ ] Test (`fadeRegistry.test.ts`) `targetOf is null for an unregistered id` and
      `targetOf follows fadeTo and setImmediate`.
- [ ] Test (`syncVisibilityFades.test.ts`) `the batch bridge does not re-issue fadeTo to a target already held` —
      registry spy, an item at target 1 with intent true: `fadeTo` not called, `post` not called.
- [ ] Test `the batch bridge retargets an in-flight fade whose intent flipped` — target 1 in flight,
      intent false: `fadeTo(…, 0, …)` called once.
- [ ] Test `the item bridge re-issues fadeTo at a held target` — the cubemap contract, pinned.
- [ ] `npm test -- fadeController fadeRegistry syncVisibilityFades` green. Commit.

## Task 4 — one generic `syncFades()`; `FADE_ROW` and the `writes` half go

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Files:** `src/store/effects/watchFadesSaga.ts`, `src/store/effects/ReconcileEffects.ts:37`,
`src/services/engine/wiring/makeReconcileEffects.ts:24`,
`src/services/animation/visibilityActionRow.ts:38-42,44-128,130-142` (modify);
`tests/store/effects/watchFadesSaga.test.ts`, `tests/store/effects/reconcileSagaHarness.ts:38,53`,
`tests/services/engine/wiring/makeReconcileEffects.test.ts` (modify).

**Produces:**

```ts
// ReconcileEffects
syncFades: () => void;
```

**Behaviour:** `watchFadesSaga` becomes one `takeEvery` over the predicate "`a.type` starts with
`settingsRoute + '/'`" (`watchWakeSaga.ts:45-47` is the route idiom) calling `fx.syncFades()`; the
`mergeSnapshot` arm is subsumed. `makeReconcileEffects.syncFades` calls
`syncVisibilityFades(state, { animate: true })`. `VISIBILITY_ACTION_ROW` loses its `writes` field and
`FADE_ROW` is deleted; the `actions` half and its readers (`applySceneEffect.ts:34,53`,
`scopedVisibilityActions.ts`, `computeSceneEntering.ts`) are untouched (spec D4's last sentence).
`syncVisibilityFades`' `only` option survives for `applySceneEffect.ts:43-47,62-66`.

- [ ] Test (`watchFadesSaga.test.ts`) `any settings write calls syncFades with no rows` — the
      existing per-key cases collapse into this; `setMilkyWayEnabled`, `writeVolumeField`,
      `setZoneOfAvoidanceEnabled` and `mergeSnapshot` each fire exactly once with no argument. The
      synchronous-notify case (`:44-54`) stays. The `every FADE_ROW entry…` case (`:101-105`) dies
      with its subject.
- [ ] Test `a non-settings write does not call syncFades` — a `camera/` action.
- [ ] `rg -n "FADE_ROW|writes:" src tests` returns nothing (the `writes` grep may hit unrelated
      fields; confirm each remaining hit is not a `VisibilityActionRow`).
- [ ] `npm test -- watchFadesSaga makeReconcileEffects applySceneEffect fadeLayers` green. Commit.

## Task 5 — the flow field reconciles its seed in the frame; the saga goes

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Files:** `src/@types/rendering/FlowFieldRenderer.d.ts:58`,
`src/services/gpu/renderers/flowField/flowFieldRenderer.ts:293-298`,
`src/services/engine/frame/runFrame.ts:88`, `src/store/effects/ReconcileEffects.ts:38`,
`src/services/engine/wiring/makeReconcileEffects.ts:25`, `src/store/rootSaga.ts:15,39`,
`tests/support/createTestStore.ts:46-53`, `tests/store/effects/reconcileSagaHarness.ts:27,39,54,70`,
`tests/services/engine/wiring/makeReconcileEffects.test.ts:64-121`,
`tests/services/engine/frame/encodeFlowCompute.test.ts:12`, the flow renderer's test file, and
`tests/services/engine/frame/runFrame.test.ts` (modify); `src/store/effects/watchFlowReseedSaga.ts`,
`tests/store/effects/watchFlowReseedSaga.test.ts` (delete).

```bash
git rm src/store/effects/watchFlowReseedSaga.ts tests/store/effects/watchFlowReseedSaga.test.ts
```

**Produces:**

```ts
// FlowFieldRenderer — replaces `maybeReseed()`. Arms a reseed when either field differs from
// the last value handed in; the first call only records (the field's own load arms the first
// seed, `flowFieldRenderer.ts:293`).
reconcile(seed: Pick<FlowSettings, 'mode' | 'count'>): void;
```

**Behaviour:** `runFrame` calls `state.gpu.flowFieldRenderer?.reconcile(state.settings.flow)` on the
line after the Milky Way cloud's reconcile (`:88`); it runs before the ready gate on purpose, as that
one does. No new frame file: the compare is the renderer's, and `runFrame`'s purity row stays at 3.
The saga, its `rootSaga` fork, `ReconcileEffects.reseedFlow`, its `makeReconcileEffects` line and the
harness/NOOP entries go.

- [ ] Test (renderer) `reconcile arms a reseed when mode or count changes and not otherwise` —
      three calls: `{mode:a,count:1}` records only; same again arms nothing; `{mode:a,count:2}` arms
      once. Assert through the renderer's observable (whatever `encodeFlowCompute.test.ts:12` reads
      today), not a spy on a private.
- [ ] Test (`runFrame.test.ts`) `the flow field's reconcile is called every frame with the flow settings`.
- [ ] `rg -n "reseedFlow|maybeReseed|watchFlowReseedSaga" src tests` returns nothing.
- [ ] `npm test -- flowField runFrame makeReconcileEffects reconcileSagaHarness watchFadesSaga`
      green. Commit.

## Task 6 — the six core selection rows, and the composer

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Files:** `src/services/engine/selection/{galaxyCatalogSelectionRow,structureSelectionRow,milkyWaySelectionRow,zoneOfAvoidanceSelectionRow,bodySelectionRow,starSelectionRow,coreSelectionRows,composeSelectionRows}.ts`,
`src/utils/selection/assertSelectionRowsDisjoint.ts`, `tests/support/selectionResolverOver.ts` (new);
`src/@types/engine/ResolveDeps.d.ts:19` (modify, Ruling 5); tests mirroring each new file.

**Produces:**

```ts
// each row: a factory over the live objects it reads, called once at engine construction
export function galaxyCatalogSelectionRow(deps: () => Pick<ResolveDeps, 'catalogs' | 'famousGalaxiesMeta'>): SelectionKindRow<GalaxyCatalogRef>;
export function structureSelectionRow(deps: () => Pick<ResolveDeps, 'structures'>): SelectionKindRow<StructureRef>;
export function starSelectionRow(deps: () => Pick<ResolveDeps, 'stars'>): SelectionKindRow<StarRef>;
export function bodySelectionRow(): SelectionKindRow<BodyRef>;
export function milkyWaySelectionRow(): SelectionKindRow<MilkyWayRef>;
export function zoneOfAvoidanceSelectionRow(): SelectionKindRow<ZoneOfAvoidanceRef>;
export function coreSelectionRows(deps: () => ResolveDeps): readonly SelectionKindRow[];

// src/services/engine/selection/composeSelectionRows.ts (Ruling 4)
export function composeSelectionRows(rowsOf: () => readonly SelectionKindRow[]): SelectionResolver;

// src/utils/selection/assertSelectionRowsDisjoint.ts — throws naming the repeated type or code
export function assertSelectionRowsDisjoint(rows: readonly SelectionKindRow[]): void;

// src/@types/engine/ResolveDeps.d.ts
readonly structures: Pick<StructureStore, 'byId' | 'byCategory'>;
```

(The `…Ref` names above are `Extract<SelectionRef, { type: '…' }>`; write them inline or as local
aliases, not as new `@types` files.)

**Behaviour, per row.** Each row is today's arms, relocated, with `pickSources` as codes (Ruling 2):

- galaxyCatalog — `pickSources: GALAXY_CATALOG_SOURCES`; `resolvePick` positional
  (`resolvePickTable.ts:28-32`); `extractRow` = `extractGalaxyRow(deps().catalogs.get(source), …)`
  (`extractSelectionRow.ts:33-34`); `focusId.claims` = `pgc-` | `sdss-` | `pos@` prefix, or the id is
  in `deps().famousGalaxiesMeta`; `decode` runs the matching arm (`resolveFocusId.ts:193-316`, moved
  whole, private); `encode` = `encodeGalaxy` (`focusIdOf.ts:84-109`).
- structure — codes of every `type: 'structure'` entry; `resolvePick` via `resolveStructureFromPick`
  (`resolvePickTable.ts:36-43`); `extractRow` = `deps().structures.byId`; `claims` = a
  `STRUCTURE_IDS` prefix; `decode` = the `SAFE_ID_RE` check (`resolveFocusId.ts:125-128`); `encode`
  = `ref.id`.
- milkyWay, zoneOfAvoidance — singleton tags; `claims` the `MILKY_WAY_FOCUS_ID` literal; the zone has
  no `focusId` (encode is null today, `focusIdOf.ts:65`).
- body — codes of every `type: 'body'` entry plus `Source.FamousStar`; `resolvePick` =
  `BODY_PICK_ROWS[entry.id]` for body entries and `SCENE_STARS[localIdx]` for the famous-star code
  (`resolvePickTable.ts:59-69`); `extractRow` = the `SCENE_BODIES` + `deriveBodyStates` arm
  (`extractSelectionRow.ts:51-63`); `claims` = `BODY_FOCUS_PREFIX`; `decode` validates against
  `SCENE_BODIES` (`resolveFocusId.ts:137-143`).
- star — `pickSources: [Source.GaiaStars]`; positional ref; `extractRow` via `deps().stars.current()`
  + `resolveStarRecord` (`extractSelectionRow.ts:69-86`); `claims` = `STAR_FOCUS_PREFIX`; `decode` =
  the digits-only gate (`resolveFocusId.ts:151-157`).

**The composer.** `resolvePick(null)` is null; otherwise `SOURCE_REGISTRY[pick.sourceCode]` and the
row whose `pickSources` has the code; none → the existing warning (`resolvePick.ts:27-30`) and null.
`extractRow` dispatches on `ref.type`; no row → null. `resolveFocusId('')` is null; otherwise the
first claiming row's `decode`, else null. `focusIdOf` is the row's `encode`, else null.
`rowsOf()` is called per resolution and not cached.

`assertSelectionRowsDisjoint` throws when two rows share a `type` or a code. It is called by
`createLayers` (Task 10), not by the composer.

`tests/support/selectionResolverOver.ts` exports
`selectionResolverOver(deps: ResolveDeps): SelectionResolver` =
`composeSelectionRows(() => coreSelectionRows(() => deps))`, so Task 7's fixture edits are one line
each.

- [ ] The existing cases of `resolveFocusId.test.ts` (every `describe`), `focusIdOf.test.ts`,
      `resolvePick.test.ts`, `resolvePickTable.test.ts` and `extractSelectionRow.test.ts` move into
      `tests/services/engine/selection/*.test.ts` driven through `selectionResolverOver(deps)`;
      Task 7 deletes the originals. Keep each case's assertion; drop the `:244` comment about
      iteration order, which claims are disjoint now. Report which cases moved where.
- [ ] Test (`composeSelectionRows.test.ts`) `a claiming row is authoritative even when its decode is null` —
      a stub row claiming `x-` with `decode: () => null` before a stub row claiming everything:
      result null, second row's `decode` never called.
- [ ] Test `an unclaimed id resolves to null without consulting any decode`.
- [ ] Test `an unloaded famous id is unclaimed; a loaded one is claimed and decodes to the famous cloud index` —
      the D6'2 deferral: `famousGalaxiesMeta: []` → null; meta with `m31` and the Famous cloud
      absent → null (claimed, decode null); both present → the ref.
- [ ] Test `rowsOf is read on every call` — a `rowsOf` that returns a longer list on its second call.
- [ ] Test (`assertSelectionRowsDisjoint.test.ts`) `throws on a repeated pick source code` and
      `throws on a repeated type`; `coreSelectionRows` over an empty `ResolveDeps` passes it.
- [ ] Test (`bodySelectionRow.test.ts`) `the famous-star code resolves to a body ref` and the three
      existing body-arm cases (`resolvePickTable.test.ts:36-69`).
- [ ] `npm test -- selection assertSelectionRowsDisjoint` green. Commit.

## Task 7 — the composed resolver in the saga context and the pick path; the tables deleted

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Files:** `src/services/engine/engine.ts:412-428,448-464`, `src/store/types.ts:122-150`,
`src/@types/engine/BootstrapDeps.d.ts`, `src/@types/engine/interaction/HoverPickDeps.d.ts:49`,
`src/@types/engine/CreateClickResolverInput.d.ts`, `src/services/engine/interaction/hoverPickDriver.ts:96`,
`src/services/engine/interaction/clickHandler.ts:39-58`, `src/services/engine/phases/wireInput.ts:77-89`,
`src/state/camera/watchClipSaga.ts:83`, `src/state/camera/watchClipPathInspectSaga.ts:67`,
`src/state/tour/visitBeatSaga.ts:74`, `src/state/tour/clipFociReady.ts:82-91`,
`src/state/tier/watchTierSaga.ts:53-61,83`, `src/state/selection/watchFocusTweenSaga.ts:67,84-99`,
`src/state/selection/resolveFocusRefDeferring.ts:20-24`, `src/state/selection/captureGalaxyFocusIds.ts:34-39,60`,
`src/state/selectionRows/watchSelectionRowsSaga.ts:46-52`, `src/services/engine/animation/resolveClipFoci.ts:117,291,324,331`,
`tests/support/createTestStore.ts:76-92`, and the ~20 test files that build a `ResolveDeps`
fixture (Findings, row 9; each gains `selection: selectionResolverOver(deps)` in its context and
`byCategory: () => []` in its structures stub) (modify); delete
`src/services/engine/helpers/{resolvePick,resolvePickTable,extractSelectionRow}.ts`,
`src/services/url/{resolveFocusId,focusIdOf}.ts`, `src/@types/engine/ResolvePickDeps.d.ts`, and
their five test files (cases moved in Task 6).

```bash
git rm src/services/engine/helpers/resolvePick.ts src/services/engine/helpers/resolvePickTable.ts \
       src/services/engine/helpers/extractSelectionRow.ts src/services/url/resolveFocusId.ts \
       src/services/url/focusIdOf.ts src/@types/engine/ResolvePickDeps.d.ts \
       tests/services/engine/helpers/resolvePick.test.ts tests/services/engine/helpers/resolvePickTable.test.ts \
       tests/services/engine/helpers/extractSelectionRow.test.ts tests/services/url/resolveFocusId.test.ts \
       tests/services/url/focusIdOf.test.ts
```

**Produces:**

```ts
// src/store/types.ts — SagaContext gains one member; `resolveDeps` stays (Ruling 5)
selection: SelectionResolver;
// src/@types/engine/BootstrapDeps.d.ts — read by createLayers' disjointness check (Task 10)
readonly coreSelectionRows: readonly SelectionKindRow[];
// HoverPickDeps / CreateClickResolverInput — the composed method replaces the deps bag
readonly resolvePick: SelectionResolver['resolvePick'];
```

**Behaviour:** `engine.ts` builds `coreRows = coreSelectionRows(resolveDeps)` once, `rowsOf = () =>
[...coreRows, ...state.layers.flatMap((i) => i.selection)]` (`state.layers` exists from Task 10),
and `selection = composeSelectionRows(rowsOf)`; `setSagaContext` carries it; `wireInput` hands
`selection.resolvePick` to the hover driver and the click resolver, which drop their `ResolvePickDeps`.
Every saga call becomes the method: `extractSelectionRow(ref, resolveDeps(), simDays)` →
`selection.extractRow(ref, simDays)`; `resolveFocusId(id, resolveDeps())` → `selection.resolveFocusId(id)`;
`focusIdOf(ref, deps)` → `selection.focusIdOf(ref)`. `captureGalaxyFocusIds` takes the resolver in
place of `deps`; `resolveClipFoci` and `clipFociReady` take it in place of their `ResolveDeps`
parameter. `watchFocusTweenSaga` keeps its `resolveDeps().stars.current()` probe (`:89-93`)
untouched. `NOOP_SAGA_CONTEXT.selection` is `composeSelectionRows(() => [])`.

Module headers to rewrite in the same commit, each to budget: `hoverPickDriver.ts`, `clickHandler.ts`
(`resolvePick` is now injected), `watchSelectionRowsSaga.ts:23-25`, `watchTierSaga.ts`.

- [ ] Test (`clickHandler.test.ts`, `hoverPickDriver.test.ts`) — the existing cases inject a
      `resolvePick` stub instead of a structures stub; report the delta.
- [ ] Test (`watchTierSaga.test.ts`) `re-anchors a captured galaxy ref through the composed resolver`
      — the existing re-anchor case, driven through `selection`.
- [ ] Test (`resolveFocusRefDeferring.test.ts` or the two `watchRequest*Saga` tests) `a body deep link
      resolves before any catalog pulse` — the boot-window contract Ruling 4 protects; if no existing
      case pins it, add one.
- [ ] `rg -n "ResolvePickDeps|RESOLVE_PICK|EXTRACT_ROW|FOCUS_ID_DECODERS|resolveFocusId\(|focusIdOf\(|extractSelectionRow\(" src tests`
      returns only the composed resolver's methods and the selection-row files.
- [ ] `npm test`, `npm run typecheck` green. Commit.

## Task 8 — `factsReported`, and the engine slice composes facts

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Files:** `src/state/engine/engineSlice.ts:50-60,62-169,171-182`,
`src/@types/store/EngineSliceState.d.ts` (modify); `src/@types/store/CoreEngineSliceState.d.ts` (new);
`tests/state/engine/engineSlice.test.ts` (modify).

**Produces:**

```ts
// src/@types/store/CoreEngineSliceState.d.ts — today's EngineSliceState body, renamed (Task 9 adds a field)
export type CoreEngineSliceState = { status; scale; focusedBodyDistanceMpc; hdrCapable; sourceCounts; structureCounts; provenanceCounts; loadProgress; meta };
// src/@types/store/EngineSliceState.d.ts
export type EngineSliceState = CoreEngineSliceState & FactsOf<typeof APP_COMPOSITION.layers>;
// src/state/engine/engineSlice.ts — the one facts mechanism (D6)
factsReported: (state, action: PayloadAction<{ layer: string; patch: Record<string, unknown> }>) => void;
```

**Behaviour:** the initial state is `{ ...CORE_INITIAL, ...factsOf(APP_COMPOSITION.layers) }`; the
reducer is `Object.assign(state[action.payload.layer], action.payload.patch)` with no existence
branch (Ruling 7). `engineSlice.ts` gains a value import of `APP_COMPOSITION`; over the empty tuple
that edge is inert, and the PR-D cycle finding above names the day it is not. Trim the slice header
(`:1-29`) while there.

- [ ] Test `factsReported merges a patch under the layer key and leaves sibling facts` — drive the
      reducer with a widened fixture state carrying `stub: { a: 1, b: 2 }`; patch `{ b: 3 }`; assert
      `{ a: 1, b: 3 }` and `status` untouched.
- [ ] Test `factsReported replaces a field wholesale, it does not deep-merge` — patch `{ list: [1] }`
      over `{ list: [0, 0] }` gives `[1]`.
- [ ] `npm test -- engineSlice selectors` green. Commit.

## Task 9 — the handle shrinks: `camera` gone, `assetSlots` under `debug`, the structure list a fact

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Files:** `src/services/engine/engine.ts:480-490,510-512,579-654`, `src/@types/engine/EngineHandle.d.ts`,
`src/@types/engine/handles/EngineSourcesHandle.d.ts:24`, `src/@types/engine/handles/EngineDebugHandle.d.ts`,
`src/components/App/App.tsx:152`, `src/state/engine/engineSlice.ts`, `src/@types/store/CoreEngineSliceState.d.ts`,
`src/state/engine/selectors.ts`, `src/services/engine/wiring/wireStructureProjection.ts:53-62`,
`src/components/containers/CommandPaletteContainer.tsx:50` (modify); delete
`src/@types/engine/handles/EngineCameraHandle.d.ts`, `src/hooks/useStructureIndex.ts`,
`src/@types/engine/UseStructureIndexInput.d.ts`; tests: `tests/state/engine/{engineSlice,selectors}.test.ts`,
`tests/services/engine/wiring/wireStructureProjection.test.ts`, `tests/components/DebugPanel/DebugPanel.test.ts:47,65`,
the CommandPalette container test if one reads the hook.

```bash
git rm src/@types/engine/handles/EngineCameraHandle.d.ts src/hooks/useStructureIndex.ts src/@types/engine/UseStructureIndexInput.d.ts
```

**Produces:**

```ts
// EngineHandle after PR-B (selection + sources survive to PR-D; see Deferred)
export type EngineHandle = { selection: EngineSelectionHandle; sources: EngineSourcesHandle; debug: EngineDebugHandle; destroy: () => void };
// EngineDebugHandle gains today's root field, doc and all
readonly assetSlots: ReadonlyMap<string, AssetSlot<unknown, unknown>>;
// CoreEngineSliceState + engineSlice + selectors
structureSearchList: readonly StructureSearchEntry[];   // initial []
engineStructureSearchListChanged: (state, action: PayloadAction<readonly StructureSearchEntry[]>) => void;
export const selectStructureSearchList: (state: RootState) => readonly StructureSearchEntry[];
```

**Behaviour:** `wireStructureProjection`'s `emitCounts` also dispatches
`engineStructureSearchListChanged(state.data.structures.all().map(toStructureSearchEntry))`, so the
list is published at boot (anchors) and on each bulk set/clear, the same moments the counts are.
`CommandPaletteContainer` selects it; `useStructureIndex`, `EngineSourcesHandle.getStructures` and
`engine.ts`'s `getStructures` go. `App.tsx:152` reads `handleRef.current.debug.assetSlots`.
`logCameraStateFn` and the `camera` sub-handle go; the `l` key is untouched (Findings, row 1).
`EngineHandle.d.ts`'s header shrinks with its subject.

- [ ] Test (`wireStructureProjection.test.ts`) `publishes the structure search list with the counts, at boot and when the bulk group lands` —
      assert the dispatched list's ids equal `structures.all().map(s => s.id)` after each event.
- [ ] Test (`engineSlice.test.ts`) `engineStructureSearchListChanged replaces the list wholesale`.
- [ ] `rg -n "getStructures|useStructureIndex|EngineCameraHandle|logCameraStateFn|\.assetSlots" src tests`
      returns only `debug.assetSlots` reads and `state.assetSlots`.
- [ ] Manual, attested in the task report: Cmd+K lists structures on the first open after boot.
- [ ] `npm test`, `npm run typecheck` green. Commit.

## Task 10 — `createLayers`, `LayerInstance`, the deps, destroy in reverse

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Files:** `src/services/engine/phases/createLayers.ts`, `src/services/engine/layer/instantiateLayer.ts`
(new); `src/services/engine/phases/bootstrap.ts:105-110`, `src/@types/engine/PhaseLocals.d.ts`,
`src/services/engine/phases/initGpu.ts:53`, `src/@types/engine/state/EngineState.d.ts`,
`src/services/engine/engine.ts:144-354,514-575` (modify); `tests/services/engine/phases/createLayers.test.ts`,
`tests/services/engine/layer/instantiateLayer.test.ts` (new); `tests/services/engine/phases/bootstrap.test.ts`,
`tests/services/engine/engine.destroyOrder.test.ts` (new, beside `engine.tier-swap-race.test.ts`).

**Produces:**

```ts
// src/services/engine/layer/instantiateLayer.ts — the ONE place a runtime is bound; `create` runs here
export function instantiateLayer<Runtime, Facts>(layer: Layer<string, Runtime, …, Facts>, deps: LayerCoreDeps<Facts>): LayerInstance;

// src/services/engine/phases/createLayers.ts — between initGpu and wireSlots
export async function createLayers(state: EngineState, deps: BootstrapDeps): Promise<void>;

// EngineState — seeded [] in engine.ts, written once by createLayers, emptied by destroy
layers: readonly LayerInstance[];

// PhaseLocals — the boot swap format, for LayerCoreDeps.ctx
format: GPUTextureFormat;
```

**Behaviour:** `createLayers` builds one `LayerCoreDeps` per Layer: `ctx` from `phaseLocals`
(`device`, `context`, `format`) plus `deps.canvas` and `state.gpu.uiCtx.hdrCapable`; the three BGLs
and `focusUniform` from `state.gpu` (non-null after `initGpu`, asserted with a throw naming the
missing field, not `!`); `fades` from `state.subsystems`; `store` from `deps.cb`; `requestRender`
through the scheduler; `publish` = `(patch) => store.dispatch(factsReported({ layer: name, patch }))`,
or a thrower when `layer.facts` is undefined (Ruling 7); `reportSourceCount` =
`engineSourceCountReported`. Instances are created in tuple order and assigned to `state.layers` as
one array, then `assertSelectionRowsDisjoint([...deps.coreSelectionRows, ...instances.flatMap((i) => i.selection)])`
runs. `runBootstrapPhases` gains the phase second; the orchestrator's header (`bootstrap.ts:1-71`)
is rewritten to budget in the same commit.

`engine.destroy()` runs `for (const inst of state.layers.slice().reverse()) inst.destroy()` after
the input detach block (`:521-529`) and before `biasCorrection.destroy()` (`:531`), then sets
`state.layers = []`. The four-line destroy comment at `:515-517` gains the sentence "Layers go
before core, in reverse tuple order".

- [ ] Test (`instantiateLayer.test.ts`) `binds frame and selection to the runtime create returned`
      — a stub Layer whose `create` returns `{ tag }`; `frame(runtime)` receives that object; the
      bound hook forwards `(ctx, state)` and its boolean.
- [ ] Test `a Layer without frame or selection binds null and []`.
- [ ] Test (`createLayers.test.ts`) `hands every Layer the four core objects` — `focusUniform` and
      `fades` are the same references as `state.gpu.focusUniform` / `state.subsystems.fades`;
      `publish({ x: 1 })` dispatches `factsReported({ layer: 'stub', patch: { x: 1 } })`;
      `reportSourceCount(s, n)` dispatches `engineSourceCountReported({ source: s, count: n })`.
- [ ] Test `creates in tuple order and stores instances in that order`.
- [ ] Test `publish throws for a Layer that declares no facts` — message names the Layer.
- [ ] Test `throws at boot when two rows share a pick source code` — one core row and one Layer row
      claiming the same code.
- [ ] Test (`bootstrap.test.ts`) — the phase-order case gains `createLayers` between `initGpu` and
      `wireSlots`; the short-circuit cases stay.
- [ ] Test (`engine.destroyOrder.test.ts`) `destroy runs Layers in reverse tuple order before core teardown`
      — two stub Layers recording into a shared log; `destroyGpuHandles` (mocked) appends last.
- [ ] `npm test -- createLayers instantiateLayer bootstrap destroyOrder` green. Commit.

## Task 11 — the `frame` hook runs, and votes (D2, Ruling 3)

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Files:** `src/services/engine/frame/runFrame.ts:183-191,330-338`,
`src/services/engine/helpers/shouldKeepTicking.ts:34-52` (modify);
`tests/services/engine/frame/runFrame.test.ts`, `tests/services/engine/helpers/shouldKeepTicking.test.ts`
(modify).

**Produces:**

```ts
// shouldKeepTicking's vote bag gains one field; the predicate ORs it in
anim: { starFadeAnimating: boolean; earthTilesAnimating: boolean; labelsAnimating: boolean; layersAnimating: boolean }
```

**Behaviour:** after `ctx.focus = focusUniforms` (`runFrame.ts:191`) and before the `hiResFamous`
block (`:207`), `runFrame` calls each `state.layers[i].frame` that is non-null, in order, with
`(ctx, state)`, and folds the booleans without short-circuiting (every hook runs every frame). The
fold feeds `layersAnimating`. No new declaration in `runFrame.ts` (its purity row stays 3; a loop is
not a symbol). The galaxy blocks and the galaxy `shouldKeepTicking` terms stay (PR-D).

- [ ] Test (`runFrame.test.ts`) `every Layer's frame hook runs once per ready frame, in tuple order, after the focus uniform` —
      two stub instances recording the call order and `ctx.focus` at call time.
- [ ] Test `a hook returning true keeps the loop ticking` — `scheduler.requestRender` called at the
      frame's tail with everything else at rest; false does not.
- [ ] Test `a second hook still runs when the first returned true`.
- [ ] Test (`shouldKeepTicking.test.ts`) `layersAnimating is a keep-alive term`.
- [ ] `npm test -- runFrame shouldKeepTicking` green. Commit.

## Task 12 — readiness narrows to core; the ready context loses its galaxy handles

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Files:** `src/services/engine/helpers/engineReady.ts`, `src/@types/engine/ReadyEngineState.d.ts`,
`src/services/engine/frame/frameContext.ts:73-78,227,233`, `src/@types/engine/frame/ReadyFrameContext.d.ts`,
`src/services/engine/frame/passes/galaxyPointSpritesPass.ts:27-32,48,89`,
`src/services/engine/helpers/shouldKeepTicking.ts:42` (modify); tests:
`tests/services/engine/helpers/engineReady.test.ts`, `tests/services/engine/frame/frameContext.test.ts:61-107,130-176,322-343`,
`tests/services/engine/frame/passes/passes.test.ts:101,103,444,464,540`,
`tests/services/engine/frame/cubemapFaceContext.test.ts:76,78`, `tests/services/engine/helpers/pickFrameContext.test.ts`.

**Behaviour:** `isEngineReady` is `state.booted && state.gpu.renderTargets !== null &&
state.gpu.compositor !== null`; `ReadyEngineState` narrows those two. `deriveFrameContext` stops
forwarding `galaxyPointRenderer` and `texturedDisks`; both fields leave `ReadyFrameContext`.
`galaxyPointSpritesPass.enabled` returns `state.gpu.galaxyPointRenderer !== null`; `draw` and
`drawPick` read it off `state.gpu` behind the null guard `drawPick` already uses for the pick
renderer. `shouldKeepTicking`'s term becomes
`(state.subsystems.texturedDisks?.hasInFlightWork() ?? false)` and the `isEngineReady` import goes.
Both `engineReady.ts` (`:1-93`) and `ReadyFrameContext.d.ts` (`:1-47`) headers are rewritten to
budget; the surviving fact is one sentence each: which handles the gate proves, and why
`filamentRenderer` is not among them.

- [ ] `engineReady.test.ts`: the three galaxy false-branch cases (`:81-83,99-105`) die; the
      narrowing case (`:126-158`) narrows `renderTargets` and `compositor` only.
- [ ] `frameContext.test.ts`: the `galaxyPointRenderer`/`texturedDisks` not-ready cases die; the
      forwarding case (`:322-343`) keeps only `renderTargets`.
- [ ] Test (`passes.test.ts`) `point-sprites is disabled while the point renderer is absent` — and
      the existing draw cases build their renderer on `state.gpu`, not `ctx`.
- [ ] `rg -n "ctx\.galaxyPointRenderer|ctx\.texturedDisks|galaxyPointRenderer: |texturedDisks: " src tests`
      returns nothing on a `ReadyFrameContext`.
- [ ] `npm test -- engineReady frameContext passes cubemapFaceContext pickFrameContext shouldKeepTicking`
      green. Commit.

## Task 13 — the panel renders composed sections first (D13)

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

**Files:** `src/components/SettingsPanel/SettingsPanel.tsx:46-89` (modify);
`tests/components/SettingsPanel/SettingsPanel.test.tsx` (modify).

**Behaviour:** before `<GalaxiesSectionContainer />`, render
`APP_COMPOSITION.layers.map((layer) => layer.ui ? <layer.ui key={layer.name} /> : null)`; the eight
core children follow unchanged. The `create-component` conventions apply (own folder, no new
module); the 44-line header shrinks to the order rule and the one prop.

- [ ] Test `renders a present Layer's ui section before the core sections` — `vi.mock` the
      composition module with one stub Layer whose `ui` renders a marker; assert DOM order against
      the Galaxies section.
- [ ] Test `renders nothing extra over the empty composition` — the existing snapshot-free child
      assertions stay as they are.
- [ ] `npm test -- SettingsPanel` green. Commit.

## Task 14 — gate

Frame files (`src/services/engine/frame/**`, incl. `timing/` and `passes/`) declare only their own symbol; the purity ratchet `tests/services/engine/frame/frameFilePurity.test.ts` shrinks only.

- [ ] `npm run typecheck` (both projects) green.
- [ ] `npm test` green. **No pre-committed number**: six test files die and about thirty are
      adapted; report the ACTUAL delta with a reason per difference, reconciled against Tasks 4, 5, 6,
      7, 9 and 12's reports of which cases moved where. An unexplained drop is coverage deleted where
      it should have moved.
- [ ] `npm run build` green.
- [ ] `tests/conventions/layerImportBoundary.test.ts` present, green, with exactly one `ALLOWED` row.
- [ ] `tests/services/engine/frame/frameFilePurity.test.ts` unchanged (no row went up).
- [ ] Manual, attested by the user with the branch's dev server:
  - click a galaxy, a cluster ring, a planet, a famous star, the Milky Way: each selects (the pick
    path is the composed resolver);
  - `#focus=body-earth`, `#focus=cluster-virgo`, `#focus=m31`, `#focus=star-42` deep links each
    land, the body one before any catalog has arrived;
  - Cmd+K structure search is populated on first open;
  - the `l` key logs the camera;
  - Settings › Flow: change the particle count with flow on; the field reseeds;
  - toggle any layer; the fade runs once, not restarting on a second unrelated settings write;
  - near Sgr A* with the lens active, flip the tier: the lensed sky re-bakes after the catalogs
    re-commit (Ruling 1's contract);
  - DebugPanel's asset-slot rows still populate.
- [ ] Spec §9(d)'s "Backlog consumption" paragraph is intact; the spec stays in `specs/` (shared with
      04c/04d), so `/feature-done` relocates only this plan.
- [ ] The PR body carries the D1 import-cycle finding for PR-D and the two veto-able rulings (2, 3),
      each with the user's decision recorded.

**Reject if:** any test count drop lacks a per-difference reason; the deep-link boot-window case
was not pinned (Task 7); the item bridge got the idempotence guard; a `!` was used where Task 10
says to throw; any file under `src/layers/` was created or edited.

---

## Definition of Done

**Deliverable inventory**

- [ ] `Layer` carries `Settings`, `Sources`, `Facts` type parameters and the `facts`, `selection`,
      `frame` members; `defineLayer` takes them as `const` parameters; `PickResolverRow` and
      `Layer.pick` are gone.
- [ ] `APP_SETTINGS_FRAGMENTS` is `[...UNFORMED_SETTINGS_FRAGMENTS, ...settingsOf(APP_COMPOSITION.layers)]`
      and `docs/backlog/2026-09-11-layer-settings-tuple-seam.md` no longer exists.
- [ ] `LayerCoreDeps<Facts>` carries `focusUniform`, `fades`, `publish`, `reportSourceCount`, and
      `createLayers` runs between `initGpu` and `wireSlots`; `engine.destroy()` destroys
      `state.layers` in reverse before any core teardown.
- [ ] `runFrame` calls every instance's `frame` hook after the focus uniform and folds it into
      `shouldKeepTicking`.
- [ ] `SagaContext.selection` is the composed `SelectionResolver`; the pick path calls its
      `resolvePick`; `RESOLVE_PICK`, `EXTRACT_ROW`, `FOCUS_ID_DECODERS`, `ENCODE`, `ResolvePickDeps`
      no longer exist; `ResolveDeps` survives with four fields.
- [ ] `tests/conventions/layerImportBoundary.test.ts` exists with the single `settingsSlice` row.
- [ ] `factsReported` and `engineStructureSearchListChanged` exist on the engine slice;
      `EngineSliceState` is `CoreEngineSliceState & FactsOf<AppLayers>`.
- [ ] `EngineHandle` is `{ selection, sources, debug, destroy }`, `debug.assetSlots` exists,
      `EngineSourcesHandle.getStructures` and `useStructureIndex` do not.
- [ ] `FadeRegistry.targetOf` exists; `FADE_ROW`, `VisibilityActionRow.writes`,
      `ReconcileEffects.reseedFlow`, `watchFlowReseedSaga`, `FlowFieldRenderer.maybeReseed` do not;
      `FlowFieldRenderer.reconcile` does.
- [ ] `isEngineReady` proves `booted`, `renderTargets`, `compositor` and nothing else;
      `ReadyFrameContext` has no `galaxyPointRenderer` or `texturedDisks` field.
- [ ] `SettingsPanel` maps the composition's `ui` sections before its core children.

**Named observable behaviours** (Task 14's pass, user-attested)

- [ ] Every pickable kind still selects on click and hover.
- [ ] A body or Milky Way deep link resolves during the boot window, before any catalog pulse.
- [ ] A famous-galaxy deep link resolves once the meta and cloud have landed, not before.
- [ ] The command palette's structure search is populated from the store on first open.
- [ ] A tier swap near the black-hole lens re-bakes the lensed sky after the re-commit.
- [ ] A flow count or mode change reseeds the field on the next frame.
- [ ] A layer toggle fades once; unrelated settings writes do not restart it.

**The deferral boundary** — see "Deferred". No file under `src/layers/` changes. No `Layer` value
exists. No pass, asset row, fade row or label producer is composed from `state.layers` yet.

## Deferred to PR-D / PR-C / (e)

Each entry is a deletion or mechanism §9(d) names that this PR must NOT take, with the replacement
that gates it.

**PR-D (the Layer):**

- `watchBiasBakeSaga`, `ReconcileEffects.bakeBias`, its `makeReconcileEffects` line and the eager
  `biasCorrection` construction (`engine.ts:257`) — replaced by the galaxy Layer's `frame` compare
  and `create`.
- The core galaxy selection row (`galaxyCatalogSelectionRow.ts`) and `ResolveDeps.catalogs` /
  `.famousGalaxiesMeta` — replaced by the Layer's `selection(runtime)`.
- `sources.getCloud` / `.getCloudObjIds`, `useStructureMemberCount`, `useAliasIndex`,
  `selection.loadAliases`, the `engineHandleRef` threading in `InfoCardContainer` and
  `CommandPaletteContainer`, and `EngineSelectionHandle` / `EngineSourcesHandle` themselves —
  replaced by the galaxy facts `aliasIndex` and `structureMemberCount`.
- The `requests` Set, `RequestKey`, `DemandCtx.request` and `buildDemandCtx`'s line — replaced by a
  `ui.paletteOpen` demand and a point-slot-state read (`assetWiring.ts:238,371`).
- Composition of `passes`, `assets`, `fades` and `labels` from `state.layers` — no P item names it;
  it lands with the first Layer that contributes them.
- The galaxy blocks in `runFrame` (`:207-243`), the `texturedDisks` term in `shouldKeepTicking`,
  and `PassState`'s galaxy fields.
- The hi-res famous pair folded into its slot (spec §9(d), the PR-D paragraph).
- The D1 import-cycle fix (Findings section, last paragraph).

**PR-C (P7):** `ComposedSources` gains its runtime, `composeSources(layers)`, with D11; the
`famousGalaxiesMeta` copies with D10.

**(e):** `ResolveDeps.stars` and the `resolveDeps` context entry (D6'1, with the star Layer);
`VISIBILITY_ACTION_ROW`'s `actions` half (tour meets Layers); the `body-` focus prefix (D6'2, with
the body Layer).

## Backlog consumption

`docs/backlog/2026-09-11-layer-settings-tuple-seam.md` (D) and its index line at `docs/BACKLOG.md:38`
are deleted in Task 1. Nothing else on the backlog is started by this PR.
