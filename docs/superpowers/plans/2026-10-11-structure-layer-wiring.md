# Structure Layer — PR 2: prep, registration and deletions in core

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** `src/layers/structure/` becomes the twelfth formed Layer, registered in `compositions/app.ts`. Per-category counts, the palette search list and the bulk slot's status become the Layer's `facts`. Core loses every hand-held structure row, the two structure fields and actions in `engineSlice`, `ResolveDeps`, `MARKER_PRODUCERS` and `CORE_PLANNERS`. The duplicated smoothstep fade curve becomes one helper. The one accepted behaviour change is the label tie order (R14).

**Architecture:**

- Two prep commits open the PR. Neither needs a Layer:
  - Task 1 (spec P3): the structure selection row takes the store, and `ResolveDeps` goes.
  - Task 2 (spec P4): the planner calls `produceStructureMarkers` directly.
- Task 3 folds the fade curve. It is independent of the wiring.
- Task 4 registers the Layer and deletes core's copies in one commit. Before it, every row lives only in core; after it, only in the Layer. `createLayers` throws when both declare the same pass name, planner name or asset key (`createLayers.ts:144-166`). The Layer declares no `facts` yet, so for that one commit the projection keeps dispatching core's two structure actions.
- Tasks 5 and 6 (spec P1, P2) move counts, bulk status and the search list into `facts`. They follow Task 4 because a facts key exists only once `createLayers` has seeded it for a composed Layer that declares `facts` (`createLayers.ts:106-111`). `factsReported` writes into that key and throws when it is absent (`engineSlice.ts:154-160`). The `structure` key is also missing from `EngineSliceState`'s type until the Layer is in `APP_COMPOSITION` with `facts`.
- Task 7 moves the five types core no longer reads into the Layer's `@types/`; Task 8 is docs.

**Tech stack:** TS, Vitest, redux-saga (`typed-redux-saga`), raw WebGPU, React.

**Spec:** [`docs/superpowers/specs/2026-10-11-structure-layer-design.md`](../specs/2026-10-11-structure-layer-design.md), §1–§3, §6, §7, §9, §10. PR 1's plan: [`2026-10-11-structure-layer-moves.md`](2026-10-11-structure-layer-moves.md). Every path below is the post-PR-1 path.

## Global constraints

- Starts from PR 1 merged into main. Read `docs/RENDERER.md` before Tasks 2–4.
- `type` aliases, never `interface`. One symbol per file in `utils/` and `@types/`, filename = symbol; types never inline in implementation files (a component's own `Props` is the exception). No barrels, no `index.ts`.
- `passes/` files export only their one named symbol (ratchet: `tests/services/engine/frame/frameFilePurity.test.ts`).
- No Layer imports another Layer. Cross-Layer reads go through core state and core types (R13).
- The structure Layer's settings tuple is imported from `src/layers/structure/state/slices.ts`, never off `APP_COMPOSITION` (circular alias; `src/layers/README.md`).
- File moves use `npm run move-files -- --manifest <file> --dry`, then without `--dry`. Never `git mv` plus hand-edited imports. Search for each old path afterwards; the tool misses `vi.mock` strings and `?static` specifiers.
- Comments explain why, never what: module header ≤ 10 lines, comment lines ≤ half the code lines. Rewrite every comment a task makes untrue (several headers say "core row", "four categories", "five core section containers"); never narrate the change.
- Each task is its own commit. Format with `npx prettier --write <files>`, never `npm run format`. Stage files by path, never `git add -A`.
- No `Co-Authored-By` lines in commits.

## Review focus

Five failure modes the compiler and the existing suite do not catch, each with the test that pins it:

1. **The deferral hanging on a slot that is not loading (Task 5).** `bulk` stuck at `'loading'` after a failed fetch, or a wait while the slot sits `'idle'` because no bulk category is on (`assetWiring.ts:149-157`), would leave a null-row focus waiting forever. Today `loaded()` is true from boot. Pinned by `wireStructureProjection` test `publishes anchor-only counts and bulk 'error' when the slot rejects` and by `watchFocusTweenSaga` test `a structure focus does not wait while the bulk slot is idle`.
2. **Counts published before the bulk group is written (Task 5).** The Structures section would show anchor-only counts after the catalog lands. Pinned by `publishes merged counts and bulk 'ready' when the slot resolves`, whose expected counts are the fixture's anchors plus its bulk records.
3. **The deferral ending on the wrong pulse (Task 5).** `factsReported` fires for every Layer's facts (galaxyCatalog's member count republishes on every selection change), so `empty` must be re-read after each pulse. Pinned by the re-pointed `watchFocusTweenSaga` deferral test and the new `another Layer's facts report does not end a structure deferral`.
4. **Pick-index alignment broken by the producer rewiring (Tasks 2, 4).** A ring pick decodes as `store.byCategory(cat)[instanceIndex]`, so descriptors must stay in `store.all()` order, one per marker-bearing structure of a visible category, faded ones included (`produceStructureMarkers.ts:16-29`). Pinned by the existing `produceStructureMarkers` and `resolveStructureFromPick` tests, which keep their expected values.
5. **Ring and label fades drifting apart after the fold (Task 3).** The marker keeps emitting an alpha-0 descriptor where the label skips. Pinned by `structureApparentRadiusFade.test.ts` (hand-computed values at both thresholds) plus the unchanged `produceStructureMarkers` and `produceStructureLabels` expectations.

> [!RISK]
> **Label tie order (R14, accepted).** The structure label producers move from core's registration (`engine.ts:329,343`, ahead of every Layer) to the Layer's `guides`, appended after every other Layer's. They now lose equal-`prominencePx` tiebreaks they used to win. No task pins this.

---

### Task 1 (spec P3): The structure selection row takes the store; `ResolveDeps` goes — `review: yes`

**review: yes** (saga context, a saga's deferral)

**Files:**
- `src/layers/structure/present/structureSelectionRow.ts`, `src/services/engine/selection/coreSelectionRows.ts`, `src/services/engine/engine.ts`
- `src/state/selection/watchFocusTweenSaga.ts`
- `src/@types/engine/ResolveDeps.d.ts` (delete), `src/store/types.ts`, `src/@types/engine/data/StructureStore.d.ts`, `src/layers/structure/render/createStructureStore.ts`
- Comments: `src/state/url/watchHashReadSaga.ts:14`, `src/state/tour/waitUntilSaga.ts:12`
- Test support: `tests/support/selectionResolverOver.ts`, `tests/support/createTestStore.ts`
- The fixture sweep (every test that builds a `ResolveDeps` or calls `coreSelectionRows`): `tests/state/camera/watchClipPathInspectSaga.test.ts`, `tests/state/camera/clipBodySaga.test.ts`, `tests/state/navigation/navigateSaga.test.ts`, `tests/state/takeover/watchTakeoverSaga.test.ts`, `tests/state/tour/clipFociReady.test.ts`, `tests/state/tour/tourBodySaga.test.ts`, `tests/state/tour/webShowcaseDive.integration.test.ts`, `tests/state/tour/visitBeatSaga.test.ts`, `tests/state/selection/captureGalaxyFocusIds.test.ts`, `tests/state/selection/watchRequestSelectSaga.test.ts`, `tests/state/selection/watchRequestFocusSaga.test.ts`, `tests/state/selection/watchFocusTweenSaga.test.ts`, `tests/state/arrival/arrivalSaga.test.ts`, `tests/state/tier/watchTierSaga.test.ts`, `tests/state/selectionRows/watchSelectionRowsSaga.test.ts`, `tests/data/animation/tours/grandTour/neighbourhoodLaunchGeometry.test.ts`, `tests/data/animation/clips/flyPathDemo.test.ts`, `tests/services/engine/animation/resolveClipFoci.test.ts`, `tests/services/engine/selection/composeSelectionRows.test.ts`, `tests/layers/structure/render/createStructureStore.test.ts`, `tests/services/engine/selection/coreSelectionRows.test.ts` (delete); comments only: `tests/state/url/watchHashSaga.test.ts:98`, `tests/state/url/hashHistoryIntegrity.test.ts:132`

**Contract:**

```ts
// structureSelectionRow: takes only what it reads (byId for extractRow, byCategory for the pick)
export function structureSelectionRow(
  store: Pick<StructureStore, 'byId' | 'byCategory'>,
): SelectionKindRow<StructureRef>;

// coreSelectionRows: the one row core still owns
export function coreSelectionRows(): readonly SelectionKindRow[]; // [bodySelectionRow()]

// engine.ts, until Task 4 hands the row to the Layer:
state.selectionKindRows = [...coreSelectionRows(), structureSelectionRow(state.data.structures)];

// watchFocusTweenSaga, interim deferral (Task 5 replaces it with facts.bulk === 'loading' / factsReported):
type Deferral = {
  /** A selector, read with `yield* select(deferral.empty)`: true while the ref's store may still be filling. */
  empty(state: RootState): boolean;
  pulse: typeof engineStructureCountsChanged;
};
structure: {
  empty: (state) => Object.keys(selectStructureCounts(state)).length === 0,
  pulse: engineStructureCountsChanged,
}
// loop: while (row === null && deferral !== undefined && (yield* select(deferral.empty))) { take(pulse); re-extract }

// tests/support/selectionResolverOver.ts
export type StructureRowFixture = Pick<StructureStore, 'byId' | 'byCategory'>;
export function selectionResolverOver(
  structures?: StructureRowFixture,
  galaxies?: GalaxyRowFixture,
  stars?: StarRowFixture,
): SelectionResolver;
```

`ResolveDeps` holds one field, `structures`. It has two readers: `structureSelectionRow` (`:27,34,40`, through `coreSelectionRows` at `engine.ts:379`) and `watchFocusTweenSaga`'s `loaded?.()` (`:37,65`), the saga context's only `getContext('resolveDeps')`. The spec's target deferral reads `facts.bulk`, but the Layer has no facts key until Task 5. Until then the saga reads core's own `structureCounts` through `select`. That is behaviour-identical to `loaded()`: `wireStructureProjection` dispatches the anchor counts in the same synchronous call that installs the anchors (`wireStructureProjection.ts:78-79`). The saga has no store handle and the context offers none; `select` is already imported (`watchFocusTweenSaga.ts:19`).

- [ ] Re-sign `structureSelectionRow` and `coreSelectionRows`; rewrite `coreSelectionRows`' header (it says "the two rows core owns" and describes `deps`).
- [ ] `watchFocusTweenSaga.ts`: apply the interim deferral (`:49-68`, loop `:83`); drop the `resolveDeps` `getContext` (`:37`). Reword the comment block at `:49-57` so it does not name `resolveDeps`.
- [ ] `engine.ts`: delete the `resolveDeps` thunk (`:366-371`; the comment above it, `:363-365`, covers every saga-context runner and stays), its import (`:67`), the `resolveDeps` entry in `setSagaContext` (`:416`); build `state.selectionKindRows` as in the contract.
- [ ] Delete `StructureStore.loaded()` (its member and docblock) and `createStructureStore.ts:40`; nothing reads it now.
- [ ] Delete `src/@types/engine/ResolveDeps.d.ts` with `npm run refactor -- delete` once nothing references it. Delete `SagaContext.resolveDeps` (`store/types.ts:152-153`) and its import (`:54`); reword the header paragraphs that describe it (`:20-24`, `:40`) and the two saga comments under **Files**.
- [ ] Sweep: each `ResolveDeps` literal `{ structures: { byId, byCategory } }` becomes the inner `{ byId, byCategory }`, passed as `selectionResolverOver`'s first argument or to `structureSelectionRow` directly where a test composes rows by hand (`[...coreSelectionRows(), structureSelectionRow(store), …]`). Drop `resolveDeps` from every `setContext` call. `createTestStore.ts`'s `NOOP_SAGA_CONTEXT` loses `resolveDeps`; its `selection` keeps resolving static structure ids by composing `structureSelectionRow` over an empty store (`byId: () => null, byCategory: () => []`).
- [ ] `watchFocusTweenSaga.test.ts`: the deferral tests (`:190`, `:216`) drop `structuresLoadedStub` (`:71`) and pulse with `engineStructureCountsChanged({ 'galaxy-cluster': 1 })` as today; the "loaded" state is now that dispatch having happened. Expected values unchanged.
- [ ] Delete `tests/services/engine/selection/coreSelectionRows.test.ts`: it asserts the exact type list of a one-row array, a registry restatement (`docs/superpowers/conventions/testing.md`); `assertSelectionRowsDisjoint` at boot covers duplicates. Drop `loaded()` assertions from `createStructureStore.test.ts`.
- [ ] No new test: a signature change, a selector swap with identical timing and a fixture sweep; every existing selection test keeps its expected values.
- [ ] Verify: `npm run typecheck:fast`; `npm test -- tests/state tests/services/engine/selection tests/services/engine/animation tests/data/animation tests/layers/structure`.
- [ ] Commit.

### Task 2 (spec P4): The planner calls `produceStructureMarkers` directly

**Files:** `src/layers/structure/frame.ts`, `src/services/engine/presentation/markerProducers.ts` (delete), `src/services/engine/frame/runMarkerProducers.ts` (delete), `src/@types/engine/subsystems/MarkerProducer.d.ts` (delete), `src/services/engine/frame/runLabel3DProducers.ts:5` (comment)

- [ ] `structureMarkersPlanner.plan` returns `produceStructureMarkers(state, view)` as its `value`, in place of `runMarkerProducers(state, view)` (`frame.ts`, `:19` before PR 1). The planner header (`:1-9`) states the pick-index rule now held by `runMarkerProducers.ts:3-5`: the list is emitted in `store.all()` order and never sorted, filtered or deduped. One sentence, citing `produceStructureMarkers`' header.
- [ ] Delete the three files with `npm run refactor -- delete <file>#<symbol>` (refuses while a reference remains). `MarkerProducer` has no reader besides `markerProducers.ts`.
- [ ] `runLabel3DProducers.ts:5` says it "Mirrors `runMarkerProducers`'s walk"; reword it to stand alone.
- [ ] No new test: the producer's output is unchanged and its suite covers it.
- [ ] Verify: `npm run typecheck:fast`; `npm test -- tests/layers/structure tests/services/engine/frame`.
- [ ] Commit.

### Task 3 (R3): One fade helper for ring and label

**Files:** `src/layers/structure/present/structureApparentRadiusFade.ts` (create), `src/layers/structure/@types/StructureMarkerStyle.d.ts` (create), `src/layers/structure/present/structureMarkerStyles.ts`, `src/layers/structure/present/produceStructureMarkers.ts`, `src/layers/structure/present/produceStructureLabels.ts`, `tests/layers/structure/present/structureApparentRadiusFade.test.ts` (create), `docs/backlog/2026-08-22-label-entanglement-residuals.md`, `docs/BACKLOG.md`

**Contract:**

```ts
// src/layers/structure/@types/StructureMarkerStyle.d.ts — the type now inline at structureMarkerStyles.ts:25, extracted verbatim
export type StructureMarkerStyle = { /* unchanged fields */ };

// src/layers/structure/present/structureApparentRadiusFade.ts
export function structureApparentRadiusFade(
  style: Pick<
    StructureMarkerStyle,
    | 'markerMaxApparentRadiusPx'
    | 'markerMaxApparentFadeBandPx'
    | 'markerMinApparentRadiusPx'
    | 'markerMinApparentFadeBandPx'
  >,
  apparentRadiusPx: number,
): number; // in [0, 1]: min(close-approach fade-out, far-distance fade-in)
```

Close-approach: 1 below `max`; past it, `1 − smoothstep(min(1, (px − max) / maxBand))`. Far-distance: 0 below `min`; across `[min, min + minBand)`, `smoothstep((px − min) / minBand)`; 1 above. `smoothstep(t) = t²(3 − 2t)`. Today's two copies are `produceStructureMarkers.ts:100-137` and `produceStructureLabels.ts:170-206`. The backlog file's `:97-119` / `:138-174` citations are stale.

- [ ] Extract `StructureMarkerStyle` into the Layer's `@types/` (types never inline) and import it in `structureMarkerStyles.ts`.
- [ ] Tests, `style = { markerMaxApparentRadiusPx: 700, markerMaxApparentFadeBandPx: 400, markerMinApparentRadiusPx: 5, markerMinApparentFadeBandPx: 4 }`, every expected value worked by hand:
  - `is 1 between the two thresholds` (300 px → 1);
  - `fades out past the close-approach threshold` (800 px → t = 0.25 → 1 − 0.15625 = 0.84375);
  - `is 0 past the close-approach band` (1500 px → 0);
  - `fades in above the far threshold` (6 px → t = 0.25 → 0.15625);
  - `is 0 below the far threshold` (3 px → 0).
- [ ] Implement, then replace both hand-rolled pairs with one call each. Each caller keeps its own zero-distance guard exactly as today (the marker emits alpha 0 at `distanceMpc <= 0`; the label skips the fade when `distanceMpc > 0` is false). The label `continue`s when the helper returns ≤ 0, which equals today's "either factor ≤ 0" skip, because both factors are ≥ 0. The comment "Mirrors the smoothstep `produceStructureMarkers` uses" (`produceStructureLabels.ts:173-174`) goes; the shared call replaces it.
- [ ] Every existing `produceStructureMarkers` and `produceStructureLabels` test passes with unchanged expected values.
- [ ] `docs/backlog/2026-08-22-label-entanglement-residuals.md`: delete finding 1 from "What it is", "Why it matters" and "Approach", renumber, and change "Three findings" to "Two findings". `docs/BACKLOG.md:167`: drop "duplicated structure fade curve" from the index line's clause.
- [ ] Commit.

### Task 4: Register the structure Layer; core's copies go — `review: yes`

**review: yes** (GPU handle lifecycle moving out of the core registry, frame-order planner placement, selection rows)

One commit. The Layer's rows and the deletions in core have to land together, as the Architecture section explains.

**Files (create):** `src/layers/structure/layer.ts`, `create.ts`, `destroy.ts`, `@types/StructureRuntime.d.ts`, `load/structureAssetRows.ts`, `present/structureFadeRows.ts`; tests `tests/layers/structure/layer.test.ts`, `tests/layers/structure/load/structureAssetRows.test.ts`, `tests/layers/structure/passes/structureMarkersCosmoPass.test.ts`

**Files (modify, Layer side):** `src/layers/structure/frame.ts`, `passes/structureMarkersCosmoPass.ts`, `passes/structureMarkersNearPass.ts`, `render/createStructureMarkersPass.ts`, `@types/StructureMarkersPassSpec.d.ts`, `present/produceStructureMarkers.ts`, `present/produceStructureLabels.ts`, `load/wireStructureProjection.ts`, `load/structureCatalogSlot.ts`, `state/slices.ts` (header), `src/compositions/app.ts`

**Files (modify, core side):** `src/services/engine/engine.ts`, `src/@types/engine/handles/EngineGpuHandles.d.ts`, `src/services/engine/gpuHandles/gpuHandleRegistry.ts`, `src/@types/engine/state/EngineAssetSlots.d.ts`, `src/services/engine/data/createEngineData.ts`, `src/@types/engine/data/EngineData.d.ts`, `src/services/engine/wiring/assetWiring.ts`, `src/services/engine/wiring/fadeLayers.ts`, `src/services/engine/frame/passes/index.ts`, `src/services/engine/frame/planners/index.ts` (delete), `src/services/engine/phases/createLayers.ts`, `src/services/engine/phases/wireSlots.ts`, `src/components/SettingsPanel/SettingsPanel.tsx`, `src/components/InfoCard/detailCardTable.ts`, `src/@types/engine/layer/Layer.d.ts:102` (comment) `src/services/engine/wiring/wireStructureProjection.ts` (moved, first step), `tests/conventions/layerImportBoundary.test.ts` (ALLOWED rows deleted).

**Files (tests that read the deleted rows):** `tests/services/engine/frame/passes/passes.test.ts`, `tests/services/engine/frame/frameOrderBoot.test.ts`, `tests/services/engine/phases/startLoop.test.ts`, `tests/services/engine/frame/frameFilePurity.test.ts:125,135`, `tests/services/engine/phases/wireSlots.test.ts`, `tests/services/engine/phases/initGpu.hdrCapabilityWiring.test.ts:167`, `tests/services/engine/phases/createLayers.composition.test.ts:227-229`, `tests/services/engine/phases/wireInput.structure.test.ts`, `tests/services/engine/wiring/assetWiring.test.ts:105-150`, `tests/services/engine/wiring/fadeLayers.test.ts`, `tests/services/engine/wiring/syncVisibilityFades.test.ts`, `tests/helpers/engine/makeFadeBridgeState.ts`, `tests/services/engine/wiring/engineSliceDispatches.test.ts`, `tests/layers/structure/load/wireStructureProjection.test.ts`, `tests/layers/structure/present/produceStructureMarkers.test.ts`, `tests/layers/structure/present/produceStructureLabels.test.ts`, `tests/components/SettingsPanel/SettingsPanel.test.tsx`, `tests/components/InfoCard/detailCardTable.test.ts`, `tests/utils/infoCard/detailCardFor.test.ts`, `tests/services/engine/frame/renderFrame.test.ts`, `tests/services/engine/frame/renderFrame.timing.test.ts`, `tests/services/engine/frame/runFrame.test.ts`, `tests/layers/starCatalog/passes/starPointsPass.test.ts`, `tests/visual/renderFrameSplitBaseline.test.ts`, `tests/state/tour/tour.integration.test.ts`. Most only drop a `structureMarker*Renderer`/`data.structures`/`structureCatalog` field from a state stub; typecheck finds each.

**Contract:**

```ts
// @types/StructureRuntime.d.ts — the private guts
export type StructureRuntime = {
  readonly store: StructureStore;
  readonly cosmoRenderer: StructureMarkerRenderer;
  readonly nearRenderer: StructureMarkerRenderer;
  readonly slot: AssetSlot<StructureCatalogPayload, StructureCatalogReq>;
};

// create.ts / destroy.ts
export function create(deps: LayerCoreDeps): StructureRuntime; // LayerCoreDeps<StructureFacts> from Task 5
export function destroy(runtime: StructureRuntime): void;

// load/structureCatalogSlot.ts — its (_state, _cb) params were never read (`:32`)
export function createStructureCatalogSlot(): AssetSlot<StructureCatalogPayload, StructureCatalogReq>;

// load/wireStructureProjection.ts — this commit only: the two core actions still carry
// counts and the search list, dispatched through the store the Layer is handed
export function wireStructureProjection(
  runtime: Pick<StructureRuntime, 'store' | 'slot'>,
  dispatch: AppDispatch,
): void;

// load/structureAssetRows.ts
export function structureAssetRows(runtime: Pick<StructureRuntime, 'slot'>): readonly AssetWiringRow[];

// present/structureFadeRows.ts
export function structureFadeRows(): readonly FadeLayer<unknown>[];

// frame.ts
export function structureMarkersPlanner(
  runtime: Pick<StructureRuntime, 'store'>,
): Extract<FrameContentPlanner<readonly StructureMarkerDescriptor[]>, { scope: 'perView' }>;

// present/produceStructureMarkers.ts / present/produceStructureLabels.ts
export function produceStructureMarkers(
  store: Pick<StructureStore, 'all'>, state: PassState, view: FrameView,
): readonly StructureMarkerDescriptor[];
export function produceStructureLabels(
  store: StructureStore, scale: StructureScale,
): Label2DProducer['produceLabels'];

// @types/StructureMarkersPassSpec.d.ts — the renderer is known at construction; no null case
export type StructureMarkersPassSpec = {
  readonly name: string;
  readonly scale: StructureScale;
  readonly renderer: StructureMarkerRenderer;
  readonly planner: FrameContentPlanner<readonly StructureMarkerDescriptor[]>;
};
export function structureMarkersCosmoPass(runtime: StructureRuntime): ContentPass; // 'structure-markers-cosmo', 'cosmic', cosmoRenderer
export function structureMarkersNearPass(runtime: StructureRuntime): ContentPass;  // 'structure-markers-near', 'milkyWay', nearRenderer

// layer.ts (Task 5 adds `facts`)
export const structureLayer = defineLayer({
  name: 'structure',
  settings: structureLayerSettings,
  sources: STRUCTURE_SOURCE_ROWS,
  create,
  destroy,
  assets: structureAssetRows,
  passes: (runtime) => [structureMarkersCosmoPass(runtime), structureMarkersNearPass(runtime)],
  planners: (runtime) => [structureMarkersPlanner(runtime)],
  guides: (runtime) => ({
    screenLabels: [
      { id: 'structureLabelsCosmo', slab: COSMO, produceLabels: produceStructureLabels(runtime.store, 'cosmic') },
      { id: 'structureLabelsNear', slab: NEAR0, produceLabels: produceStructureLabels(runtime.store, 'milkyWay') },
    ],
  }),
  fades: structureFadeRows,
  selection: (runtime) => [structureSelectionRow(runtime.store)],
  ui: [
    { slot: 'main', content: StructuresSectionContainer },
    { slot: 'detailCard', content: { type: 'structure', Detail: StructureDetailCardContainer, Compact: CompactStructureCard } },
  ],
});
```

The label producers keep their `StructureScale` argument (`'cosmic'` / `'milkyWay'`) rather than the spec sketch's slab constant: scale is what they filter on (`produceStructureLabels.ts:119`), and the slab is already on the row. The `detailCard` entry uses the `content` shape `LayerUiEntry` requires (`src/layers/milkyWay/layer.ts:49-56`).

**Layer side**

- [ ] First step: `npm run move-files -- src/services/engine/wiring/wireStructureProjection.ts src/layers/structure/load/wireStructureProjection.ts` (PR 1 left it in core, because it dispatches and the boundary ratchet forbids that in a Layer file; the test mirror follows). Fix `vi.mock` strings by hand.
- [ ] `create`: `store = createStructureStore()`; `cosmoRenderer` and `nearRenderer` from the two rows now at `gpuHandleRegistry.ts:165-188` (same arguments, `deps.ctx` and `deps.fadeBgl` in place of the registry's deps); `slot = createStructureCatalogSlot()`; then `wireStructureProjection({ store, slot }, deps.store.dispatch)`. The projection's body is unchanged apart from reading `runtime.store`/`runtime.slot` in place of `state.data.structures`/`state.assetSlots.structureCatalog`.
- [ ] `destroy`: both renderers' `destroy()`. No slot release: no Layer releases a slot at teardown and core releases none (`src/layers/galaxyCatalog/destroy.ts`, `engine.ts:455-482`). The slot holds CPU data only.
- [ ] `structureAssetRows`: the `structureCatalog` row moved from `assetWiring.ts:145-159`, with `BULK_CATALOG_CATEGORIES` and its docblock (`:36-41`) beside it; `factory: () => runtime.slot`.
- [ ] `structureFadeRows`: the `structureRing` and `structureLabel` rows moved verbatim from `fadeLayers.ts:55-68`, shaped like `src/layers/milkyWay/present/milkyWayFadeRows.ts`. Keys and handles are unchanged, so the tour's visibility actions see exactly what they saw.
- [ ] `frame.ts`: the planner becomes the factory in the contract, name `'structure-markers'` unchanged (`frameSections.ts:93` plans it), value `produceStructureMarkers(runtime.store, state, view)`.
- [ ] Passes: `createStructureMarkersPass` reads `spec.renderer` and `spec.planner` (drop the null check at `:25`). Each pass factory builds its own `structureMarkersPlanner(runtime)` as the read key. That works because the planner result store files results by planner name (`createFramePlannerResultStore.ts`), so it is the same key `createLayers` registered. Each pass file still exports only its one factory.
- [ ] Producers: `produceStructureMarkers` and `produceStructureLabels` read the store argument instead of `state.data.structures` (`:78` and `:118` today). `produceStructureLabels` becomes a factory returning the `produceLabels` closure, the shape of `src/layers/galaxyCatalog/present/produceFamousGalaxyLabels.ts:165-168`.
- [ ] `state/slices.ts` header: the tuple is the Layer's `settings`; drop any "settings-only" wording.
- [ ] `compositions/app.ts`: append `structureLayer` last in `layers` and in the `satisfies` tuple. Last keeps the Structures section directly above Labels & Guides: `SettingsPanel` renders Layer `main` sections in composition order, then the core containers (`SettingsPanel.tsx:45-50`).

**Core side: delete**

- [ ] `engine.ts`: the `produceStructureLabels` import (`:30`), the two renderer nulls (`:186-187`), `assetSlots.structureCatalog: null` (`:285`), the cosmo label registration and the comment above it (`:321-332`; the constellations remark goes with it, since no COSMO row is left here), the near registration (`:341-346`), and Task 1's `structureSelectionRow(...)` append and import. After this, `engine.ts` mentions structures only through `structureFocus`.
- [ ] `EngineGpuHandles.d.ts`: `:21` import and `:237-249`. `gpuHandleRegistry.ts`: `:15-16` imports and the two rows `:165-188`. Drop the `vi.mock` of the renderer from `initGpu.hdrCapabilityWiring.test.ts:167`; the registry no longer constructs it.
- [ ] `EngineAssetSlots.d.ts:13-14,21-22`. `createEngineData.ts:2,31` and its docblock's structure sentence (`:11-12`); `EngineData.d.ts:1,27` and its structure bullet (`:10-14`). `EngineData` keeps `bodies` only.
- [ ] `assetWiring.ts:13-14,36-41,145-159`. Move the bug-fix pin `structureCatalog demand follows structure-category visibility` (`assetWiring.test.ts:105-150`) to `tests/layers/structure/load/structureAssetRows.test.ts`, unchanged in assertion. `createLayers.composition.test.ts:227-229` uses `'structureCatalog'` as "a key core owns"; switch it to another core key (`'bodyTextureAtlas'`).
- [ ] `fadeLayers.ts:15,55-68`. Re-point `fadeLayers.test.ts` and `syncVisibilityFades.test.ts` structure cases (they drive the real `structureRing` row) to compose `structureFadeRows()` into the fade rows they walk; `makeFadeBridgeState.ts` follows whatever those tests need.
- [ ] `passes/index.ts:10-11,40-41`. Move the structure blocks of `passes.test.ts` (`:172-242`, plus the imports at `:14-15,23`) to `tests/layers/structure/passes/structureMarkersCosmoPass.test.ts`, built over a stub runtime (`cosmoRenderer: { markerCount }`) instead of `state.gpu`; assertions unchanged.
- [ ] `frame/planners/index.ts`: delete the file. `createLayers.ts`: drop the import (`:38`) and compose `state.planners` from Layer rows alone (`:152-155`). `frameOrderBoot.test.ts:18,48` and `startLoop.test.ts:56,107`: stub the `SCENE` section's planners the way `PRELUDE`'s are (`stubPlannersFor(SCENE)` beside `stubPlannersFor(PRELUDE)`). `frameFilePurity.test.ts:125,135`: drop the `frame/planners` sweep row, because the folder is gone. `Layer.d.ts:102`: the comment no longer says "after `CORE_PLANNERS`".
- [ ] `wireSlots.ts`: the `wireStructureProjection` import and call (`:68,109-111`) and the docblock mentions (`:14-16,43,46`). Move `wireSlots.test.ts`'s two structure tests (`:735-817`) into `tests/layers/structure/load/wireStructureProjection.test.ts`, re-based on the new signature, and drop its `structureCatalogFetcher` mock (`:71`) if nothing else uses it. `engineSliceDispatches.test.ts`'s structure block (`:159-181`) moves there too, with its mocks (`:36`, `:58`). While rewriting that file, drop its dead mock of `src/services/engine/phases/structureCatalogToStructures` (a path that never existed).
- [ ] `SettingsPanel.tsx`: `:17,49`, and the header's count of core containers (`:4-5`). `SettingsPanel.test.tsx`'s `vi.mock` of the container now has to reach it through the Layer's `ui` entry: mock the module at its Layer path.
- [ ] `detailCardTable.ts`: `:31,34`, the `structure` arm `:46-52`, the header mention `:9-10`, and "The four focusable kinds" (`:36-38`) becomes three.
- [ ] `tests/conventions/layerImportBoundary.test.ts`: delete every `ENGINE_AND_STATE_ALLOWED` row PR 1 added (the structure Layer block); core no longer imports the Layer.

**Tests (new)**

- [ ] `tests/layers/structure/layer.test.ts`, over a stub runtime (the factories touch no GPU at construction):
  - `each label row registers on the slab its categories draw on`: the `'cosmic'` row is on `COSMO`, the `'milkyWay'` row on `NEAR0`. A swapped slab projects every label off-screen; no other test sees it.
  - `the Layer's pass names are not core's, and each sits on a FRAME_ORDER line`: neither name is in `CONTENT_PASSES`, and each is in `FRAME_ORDER_PASS_NAMES` (`src/services/engine/frame/frameOrderPassNames.ts:11`). The first catches a core row left behind (it would draw twice); the second catches a rename that would silently never draw.
  - Spec §7's "sources array has eight rows" is **not** written. It restates a registry literal (`docs/superpowers/conventions/testing.md`, "No constant / registry restatements"), and PR 1's Task 2 made a missing row a compile error.
- [ ] Verify: `npm run typecheck:fast`, `npm run build`, then `npm test -- tests/layers/structure tests/services/engine tests/components tests/state/tour`. Run the full `npm test` once before committing: this commit touches the boot path.
- [ ] Commit.

### Task 5 (spec P1): Counts and bulk status are Layer facts — `review: yes`

**review: yes** (Redux state and two sagas)

**Files:**
- `src/layers/structure/@types/StructureFacts.d.ts` (create), `src/layers/structure/layer.ts`, `src/layers/structure/create.ts`, `src/layers/structure/load/wireStructureProjection.ts`, `src/layers/structure/ui/StructuresSectionContainer.tsx`
- `src/state/engine/engineSlice.ts`, `src/state/engine/selectors.ts`, `src/@types/store/CoreEngineSliceState.d.ts`, `src/@types/engine/UseEngineReturn.d.ts` (comment)
- `src/state/selectionRows/watchSelectionRowsSaga.ts`, `src/state/selection/watchFocusTweenSaga.ts`
- Tests: `tests/layers/structure/load/wireStructureProjection.test.ts`, `tests/layers/structure/ui/StructuresSectionContainer.test.ts`, `tests/state/selectionRows/watchSelectionRowsSaga.test.ts`, `tests/state/selection/watchFocusTweenSaga.test.ts`

**Contract:**

```ts
// @types/StructureFacts.d.ts — searchList joins in Task 6
export type StructureFacts = {
  readonly counts: Partial<Record<StructureId, number>>;
  /** The bulk slot's `LoadState.kind`, with 'committing' folded into 'loading'. */
  readonly bulk: 'idle' | 'loading' | 'ready' | 'error';
};
// layer.ts
facts: { counts: {}, bulk: 'idle' } as StructureFacts,
// create.ts
export function create(deps: LayerCoreDeps<StructureFacts>): StructureRuntime;

// load/wireStructureProjection.ts — counts and bulk through publish; the search list
// still dispatches its core action until Task 6
export function wireStructureProjection(
  runtime: Pick<StructureRuntime, 'store' | 'slot'>,
  publish: (patch: Partial<StructureFacts>) => void,
  dispatch: AppDispatch,
): void;
// boot (synchronous, anchors installed):   publish({ counts: <per category>, bulk: 'idle' })
// slot 'loading' or 'committing':           publish({ bulk: 'loading' })
// slot 'ready', after setGroup('bulk'):     publish({ counts: <per category>, bulk: 'ready' })
// slot 'error', after clearGroup('bulk'):   publish({ counts: <per category>, bulk: 'error' })
// slot 'idle' (a release):                  publish({ bulk: 'idle' })
// <per category> = Object.fromEntries(STRUCTURE_IDS.map((id) => [id, store.byCategory(id).length]))

// selectors.ts — same pre-seed contract as selectFamousGalaxiesMeta (`:104-105`)
export const selectStructureCounts = (state: RootState): Partial<Record<StructureId, number>> =>
  selectEngineFacts(state).structure?.counts ?? NO_STRUCTURE_COUNTS;
export const selectStructureBulk = (state: RootState): 'idle' | 'loading' | 'ready' | 'error' => // core never imports a Layer's @types
  selectEngineFacts(state).structure?.bulk ?? 'idle';

// watchFocusTweenSaga — final deferral (R8)
structure: {
  empty: (state) => selectStructureBulk(state) === 'loading',
  pulse: factsReported,
}
```

`create` runs after `createLayers` seeds the key (`createLayers.ts:106-123`), so the boot publish lands in a seeded key. The deferral waits only while the slot is actually loading. Today `loaded()` is true from boot, because the anchors land synchronously, so a slot nobody demands (`'idle'`) must not hold a focus. The pre-seed default is `'idle'` for the same reason. `factsReported` fires for every Layer's facts, which is why `empty` is re-read after each pulse. The spec lists `selectStructureCounts` among P1's deletions; this plan re-points it to the facts key instead, the same move P2 makes for `selectStructureSearchList`. A deleted name would only come back under another one for the container to read.

- [ ] Add `StructureFacts`, the `facts` value, and `create`'s `deps.publish` hand-off to the projection.
- [ ] `wireStructureProjection.ts`: `emitCounts` (`:58-69`) publishes counts per the contract and stops dispatching `engineStructureCountsChanged`. Rewrite the header's "Structure-count dispatches" section (`:21-29`) to describe the publishes and the four `bulk` states.
- [ ] `StructuresSectionContainer.tsx`: reads `selectStructureCounts` as today; only its comment (`:36-39`) changes, to name the fact.
- [ ] Delete `structureCounts` (`CoreEngineSliceState.d.ts:40` and its header note `:5-7`; `engineSlice.ts:43`) and `engineStructureCountsChanged` (`engineSlice.ts:68-76`, export `:174`; drop the `StructureId` import if unused). Re-point `selectStructureCounts` (`selectors.ts:68-69`) and add `selectStructureBulk`. Fix the stale mention in `UseEngineReturn.d.ts:5`.
- [ ] `watchSelectionRowsSaga.ts`: swap `engineStructureCountsChanged` for `factsReported` in the pulse list (`:80`) and import (`:39`); reword the header lines naming it (`:10-11`).
- [ ] `watchFocusTweenSaga.ts`: the deferral becomes the contract's final form (`Deferral.pulse` typed `typeof factsReported`); reword the comment block at `:49-57`.
- [ ] Tests:
  - `wireStructureProjection.test.ts`, with a `publish` spy over a real store and slot. Fixture: 2 anchor galaxy clusters, 3 bulk galaxy clusters.
    - `publishes anchor counts and bulk 'idle' at boot`: one publish after the synchronous call; galaxy-cluster 2, `bulk: 'idle'`.
    - `publishes bulk 'loading' while the slot loads or commits`: drive the slot through `loading` and `committing`; each publishes `bulk: 'loading'` and no `counts`.
    - `publishes merged counts and bulk 'ready' when the slot resolves`: galaxy-cluster 5, `bulk: 'ready'`.
    - `publishes anchor-only counts and bulk 'error' when the slot rejects`: galaxy-cluster 2, `bulk: 'error'`.
    - These replace the count assertions moved in from `wireSlots.test.ts` and `engineSliceDispatches.test.ts` in Task 4 and the old `:250` test.
  - `watchFocusTweenSaga.test.ts`: seed the key (`layerFactsSeeded({ layer: 'structure', facts: { counts: {}, bulk: 'loading' } })`). Re-point `defers a structure focus whose store has not loaded, then plants it once the store is fed` (`:190`) to release on `factsReported({ layer: 'structure', patch: { bulk: 'ready' } })`. Re-point the garbage-id test (`:216`) the same way. Update the regression comment (`:180-189`) to name the new pulse.
  - Add `a structure focus does not wait while the bulk slot is idle`: seed `bulk: 'idle'`, focus a structure whose row is null → the saga ends at once (a later `factsReported({ layer: 'structure', patch: { bulk: 'ready' } })` with the record fed does not start a tween).
  - Add `another Layer's facts report does not end a structure deferral`: with the row null and `bulk: 'loading'`, dispatch `factsReported({ layer: 'galaxyCatalog', patch: { structureMemberCount: null } })` → tween stays null; then feed the stub and report `bulk: 'ready'` → the tween targets the record's `worldPos`.
  - `StructuresSectionContainer.test.ts:99`: seed the key and report `counts: { 'galaxy-cluster': 42 }` via `factsReported`; the "42" assertion stays.
  - `watchSelectionRowsSaga.test.ts:202`: re-point to `factsReported` and rename the test to `a structure deep link fills on the structure Layer's facts report`.
- [ ] Verify: `npm run typecheck:fast`; the test files above plus `tests/state/engine`.
- [ ] Commit.

### Task 6 (spec P2): The palette's search list is a Layer fact — `review: yes`

**review: yes** (Redux state)

**Files:** `src/layers/structure/@types/StructureFacts.d.ts`, `src/layers/structure/layer.ts`, `src/layers/structure/load/wireStructureProjection.ts`, `src/layers/structure/create.ts`, `src/state/engine/engineSlice.ts`, `src/state/engine/selectors.ts`, `src/@types/store/CoreEngineSliceState.d.ts`, `tests/state/engine/engineSlice.test.ts`, `tests/layers/structure/load/wireStructureProjection.test.ts`

**Contract:**

```ts
// @types/StructureFacts.d.ts — final shape (spec §3.1)
export type StructureFacts = {
  readonly counts: Partial<Record<StructureId, number>>;
  readonly searchList: readonly StructureSearchEntry[];
  readonly bulk: 'idle' | 'loading' | 'ready' | 'error';
};
// layer.ts
facts: { counts: {}, searchList: [], bulk: 'idle' } as StructureFacts,
// load/wireStructureProjection.ts — final signature; every publish that carries counts carries searchList
export function wireStructureProjection(
  runtime: Pick<StructureRuntime, 'store' | 'slot'>,
  publish: (patch: Partial<StructureFacts>) => void,
): void;
// selectors.ts
export const selectStructureSearchList = (state: RootState): readonly StructureSearchEntry[] =>
  selectEngineFacts(state).structure?.searchList ?? NO_STRUCTURE_SEARCH_LIST;
```

- [ ] Add `searchList` to the type and the `facts` value. Each publish that carries `counts` (boot, `ready`, `error`) adds `searchList: store.all().map(toStructureSearchEntry)`; the `dispatch` parameter goes. The boot publish carries the anchors, so a palette opened before the bulk catalog lands still lists them, as today.
- [ ] Delete `structureSearchList` (`CoreEngineSliceState.d.ts:42-49` and its import if unused; `engineSlice.ts:45`) and `engineStructureSearchListChanged` (`engineSlice.ts:83-91`, export `:176`, the `StructureSearchEntry` import if unused). Rewrite `selectStructureSearchList` (`selectors.ts:79-86`) as in the contract; `CommandPaletteContainer.tsx:64` is unchanged.
- [ ] Tests: delete `engineSlice.test.ts`'s `engineStructureSearchListChanged` block (`:89-103`). In `wireStructureProjection.test.ts`, the boot, `ready` and `error` tests also assert `searchList` (boot and error: the two anchors' ids; after `ready`: five ids).
- [ ] Verify: `npm run typecheck:fast`; `npm test -- tests/state/engine tests/layers/structure tests/components/CommandPalette`.
- [ ] Commit.

### Task 7: The types core no longer reads move into the Layer

**Files:** the five moves below and their importers (rewritten by the tool)

```json
[
  { "from": "src/@types/engine/data/StructureStore.d.ts", "to": "src/layers/structure/@types/StructureStore.d.ts" },
  { "from": "src/@types/data/structure/StructureGroupId.d.ts", "to": "src/layers/structure/@types/StructureGroupId.d.ts" },
  { "from": "src/@types/rendering/StructureMarkerRenderer.d.ts", "to": "src/layers/structure/@types/StructureMarkerRenderer.d.ts" },
  { "from": "src/@types/rendering/StructureMarkerDescriptor.d.ts", "to": "src/layers/structure/@types/StructureMarkerDescriptor.d.ts" },
  { "from": "src/@types/loading/StructureCatalogReq.d.ts", "to": "src/layers/structure/@types/StructureCatalogReq.d.ts" }
]
```

Spec §5.1 names `StructureStore`, `StructureMarkerRenderer` and `StructureMarkerDescriptor`; `StructureGroupId` and `StructureCatalogReq` follow by the same rule (their only readers are `StructureStore` and the structure slot and fetcher).

- [ ] Before moving, run `npm run refactor -- refs <file>#<Type>` for each. Every `src/` reference must be inside `src/layers/structure/`. Tasks 1, 2 and 4 removed `ResolveDeps`, `MarkerProducer`, `EngineData`, `EngineGpuHandles` and `EngineAssetSlots` as readers. If a core reader remains, stop and report it; that type stays shared.
- [ ] `npm run move-files -- --manifest <file> --dry`, then without `--dry`. R12's shared types (`StructureId`, `StructureInfo`, `StructureSearchEntry`, `StructureFocusSubsystem`, `StructureCatalogPayload`) do not move.
- [ ] No new test.
- [ ] Commit.

### Task 8: Docs

**Files:** `src/layers/README.md`, `docs/RENDERER.md:27`, `.claude/skills/add-data-source/SKILL.md`

- [ ] `src/layers/README.md`: the `planners?` row (`:21`) drops "joins `CORE_PLANNERS`" (say "appended to `state.planners` by `createLayers`"); the `## Status` paragraph lists `structure` among the formed Layers and `body` as the one settings-only stub.
- [ ] `docs/RENDERER.md:27`: drop `engine/frame/planners/` from the planner paragraph; planners are Layer rows.
- [ ] `.claude/skills/add-data-source/SKILL.md`: the structure-category edit surface (the table at `:176-185` and the notes after it) names the Layer's files: rows in `src/layers/structure/sources/` plus `structureSourceRows.ts`, styles in `present/structureMarkerStyles.ts`, the build switch in `load/buildStaticAnchorStructures.ts`, the card in `ui/StructureDetailCard/`. Counts and search come from the Layer's facts with no per-category row.
- [ ] Commit.

## Dispatch grouping

- Tasks 1–2 in one dispatch (Opus: Task 1 is `review: yes`), mid-branch review after it.
- Task 3 inline or a small Sonnet dispatch (one helper, two call sites, docs).
- Task 4 alone (Opus, `review: yes`), mid-branch review after it.
- Tasks 5–8 in one dispatch (Opus: Tasks 5 and 6 are `review: yes`; same projection, slice and selector files), mid-branch review after it.

## Definition of Done

**Deliverables**

- `src/layers/structure/layer.ts` exports `structureLayer` with `facts: { counts, searchList, bulk }`, registered last in `APP_COMPOSITION.layers`; `create.ts`, `destroy.ts`, `frame.ts`, `@types/StructureRuntime.d.ts`, `@types/StructureFacts.d.ts`, `load/structureAssetRows.ts`, `present/structureFadeRows.ts`, `present/structureApparentRadiusFade.ts` exist; the folder matches the README table.
- `engineSlice` has no structure field or action; `ResolveDeps` and `SagaContext.resolveDeps` are gone; `MARKER_PRODUCERS`, `runMarkerProducers`, `MarkerProducer` and `CORE_PLANNERS` are gone. The structure Layer reports no source count.
- `engine.ts` mentions structures only through `structureFocus`. No file outside `src/layers/structure/` imports a moved file except through the Layer contract (`APP_COMPOSITION`) or from `tests/`.
- `src/layers/README.md` lists `body` as the only settings-only stub.
- Finding 1 is gone from `docs/backlog/2026-08-22-label-entanglement-residuals.md`, and its clause from `docs/BACKLOG.md`.

**Observable behaviours for the smoke pass**

Shoot each with `npm run shot -- '<link>' --url <this worktree's dev server>`, then send the shots and links to the user as a dash check:

- `#focus=galaxy-cluster-virgo-m87` (cosmo): ring and label draw; the camera frames Virgo; the InfoCard shows the cluster with "N galaxies"; Cmd+K "Virgo" lists the Virgo Cluster row with its structure chip; Settings → Structures shows a count beside every category, and the cluster/supercluster counts grow when the bulk catalog lands.
- `#focus=open-cluster-pleiades` (near): ring and label draw inside the Milky Way; the InfoCard shows the Pleiades; clicking the ring selects it.
- Toggling Settings → Structures → Galaxy clusters off fades rings and labels out; on fades them back in.
- With all three bulk categories off, Settings → Structures still shows anchor counts for every category.

**Out of scope**

- The R14 RISK callout above (accepted, not fixed).
- `structureFocusSubsystem`, `structureFocusDistance`, `structureIdOf` and the R12 shared types (stay in core).
- `src/layers/body/` (still a stub).
- The Layer dependency DAG (backlogged in PR 1).
- Findings 2 and 3 of the label-entanglement residuals.
