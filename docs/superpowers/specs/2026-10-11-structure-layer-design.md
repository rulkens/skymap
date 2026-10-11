# Structure Layer — design spec

Fold the featured-structures code (eight ring-marker categories: galaxy clusters, superclusters, voids, galaxy groups, open clusters, globular clusters, nebulae, Galactic Centre places) out of core and into `src/layers/structure/`, which today holds only its settings slice. No behaviour changes except the two named in §9. The Layer README's two unsettled placements are ruled at the same time (§4).

Rulings came from the brainstorm of 2026-10-10 → 2026-10-11 (dash asks zir4, bVU4, 3ZRj) and the `refactor-ground` checkpoint. They are listed in §2 and not re-litigated here.

Packaging: **two PRs**, each with its own plan. PR 1 is mechanical: file moves via `npm run move-files`, the README rulings, the `structureMemberCount` move into galaxyCatalog. PR 2 opens with the ground-preparation commits (§3.3, one each) and then wires `defineLayer`, deletes the core rows, and folds the duplicated fade curve. No deletion audit on PR 1; one at PR 2's `/feature-done`.

## 1. What this is

- `src/layers/structure/layer.ts` becomes the twelfth formed Layer, registered in `compositions/app.ts`.
- Every file that only structures read moves under the Layer (§5). Shared code stays in core (§5.3).
- Core loses every hand-held structure row: in `engine.ts`, `fadeLayers.ts`, `coreSelectionRows.ts`, `passes/index.ts`, `planners/index.ts`, `assetWiring.ts`, `data/sources.ts`, `SettingsPanel.tsx`, `detailCardTable.ts`, `gpuHandleRegistry.ts`, `createEngineData.ts`, `wireSlots.ts`, `resolveDeps`.
- Core loses two state fields and two actions (`structureCounts`, `structureSearchList`, `engineStructureCountsChanged`, `engineStructureSearchListChanged`), the `MARKER_PRODUCERS` registry and `CORE_PLANNERS` (both single-row).

## 2. Rulings

| #   | Ruling                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R1  | One Layer for all eight categories. The Cosmo/Near split stays two passes inside it.                                                                                                                                                                                                                                                                                                                                                                                                                         |
| R2  | The UI moves into `ui/`: `StructuresSection`, its container, `StructureDetailCard`, `CompactStructureCard`, the detail-card container.                                                                                                                                                                                                                                                                                                                                                                       |
| R3  | The duplicated smoothstep fade curve in the marker and label producers is folded into one helper in PR 2 (closes item 1 of `docs/backlog/2026-08-22-label-entanglement-residuals.md`; items 2 and 3 stay).                                                                                                                                                                                                                                                                                                   |
| R4  | README unsettled 1: `subsystems/` and `render/` stay distinct, with the definition in §4.                                                                                                                                                                                                                                                                                                                                                                                                                    |
| R5  | README unsettled 2: a declaration row's folder names the concern it describes. `load/` for `assets` and `sourceCounts`; `present/` for `fades`, `guides`, `selection`, `search`, `slabs`.                                                                                                                                                                                                                                                                                                                    |
| R6  | Per-category counts flow through `sourceCounts`, yielded once, when the bulk slot settles (ready or error). No `facts.counts`.                                                                                                                                                                                                                                                                                                                                                                                |
| R7  | The palette search list is `facts.searchList`; the palette keeps its `structure` row kind, chip and thumbnail. `LayerSearchEntry` is not extended.                                                                                                                                                                                                                                                                                                                                                            |
| R8  | `watchFocusTweenSaga` reads the Layer's count report instead of `resolveDeps().structures`; `resolveDeps.structures` is deleted.                                                                                                                                                                                                                                                                                                                                                                              |
| R9  | `MARKER_PRODUCERS` is deleted; the structure planner calls `produceStructureMarkers` directly.                                                                                                                                                                                                                                                                                                                                                                                                               |
| R10 | `utils/structure/structureMemberCount.ts` and `structureMembership.ts` move into `layers/galaxyCatalog/` (their only reader) in PR 1.                                                                                                                                                                                                                                                                                                                                                                         |
| R11 | Prep commits sit at the head of PR 2, one per joint. PR 1 stays pure moves.                                                                                                                                                                                                                                                                                                                                                                                                                                  |
| R12 | Stays in core, by readers: `structureFocusSubsystem` (its blend feeds five Layers), `structureFocusDistance` (camera framing), `structureIds`, `structureIdsByScale`, `labelCategories`, `categoryDisplayInfo`, `focusAlphaMultiplier`, `isPickableUnderFocus`, `structureIdOf`, and the shared types under `src/@types/` (`StructureId`, `StructureInfo`, `StructureSearchEntry`, `StructureFocusSubsystem`, `StructureCatalogPayload`). Shaders stay under `services/gpu/shaders/structureMarker/` by README rule. |

## 3. Ground preparation

### 3.1 Ideal shape

```ts
// src/layers/structure/layer.ts
export const structureLayer = defineLayer({
  name: 'structure',
  settings: structureLayerSettings, // exists
  sources: STRUCTURE_SOURCE_ROWS, // sources/: 8 rows + the array
  facts: { searchList: [] } as StructureFacts, // @types/StructureFacts.d.ts
  create, // store, 2 marker renderers, bulk slot, projection
  destroy,
  assets: structureAssetRows, // load/: the 'structureCatalog' row
  sourceCounts: structureSourceCounts, // load/: 8 reports, once, at bulk-settle
  passes: (rt) => [structureMarkersCosmoPass(rt), structureMarkersNearPass(rt)],
  planners: (rt) => [structureMarkersPlanner(rt)], // frame.ts; calls produceStructureMarkers
  guides: (rt) => ({
    screenLabels: [
      { id: 'structureLabelsCosmo', slab: COSMO, produceLabels: produceStructureLabels(rt, COSMO) },
      { id: 'structureLabelsNear', slab: NEAR0, produceLabels: produceStructureLabels(rt, NEAR0) },
    ],
  }),
  fades: structureFadeRows, // present/: structureRing, structureLabel
  selection: (rt) => [structureSelectionRow(rt)], // present/
  ui: [
    { slot: 'main', content: StructuresSectionContainer },
    { slot: 'detailCard', ...structureDetailCard }, // the arm detailCardTable holds today
  ],
});

// @types/StructureFacts.d.ts
export type StructureFacts = { readonly searchList: readonly StructureSearchEntry[] };

// @types/StructureRuntime.d.ts (private guts)
export type StructureRuntime = {
  readonly store: StructureStore;
  readonly cosmoRenderer: StructureMarkerRenderer;
  readonly nearRenderer: StructureMarkerRenderer;
  readonly slot: AssetSlot<StructureCatalogPayload>;
};
```

Core after the move: `selectSourceCounts(state)['galaxy-cluster']` is the Structures section's count and the saga's loaded signal; `selectEngineFacts(state).structure.searchList` is the palette's list.

### 3.2 Verdicts

| Touchpoint                                               | Verdict                                                                                 | Blocker today                                                                        |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| Per-category counts                                      | bolt-on → growth via `sourceCounts` (categories are already `SourceType`s)              | `engineSlice.ts:43,68-75` own field + action                                         |
| Palette search list                                      | bolt-on → growth via `facts`                                                            | `engineSlice.ts:45,83-90` own field + action                                         |
| "Bulk loaded" wait                                       | bolt-on → growth via the count report                                                   | `engine.ts:366-371` `resolveDeps().structures`, `watchFocusTweenSaga.ts:60-66` pulse |
| Marker producer                                          | bolt-on (single-row registry)                                                           | `presentation/markerProducers.ts:5`, `frame/runMarkerProducers.ts`                   |
| Planner                                                  | bolt-on (single-row `CORE_PLANNERS`)                                                    | `frame/planners/index.ts:11-13`                                                      |
| Passes, fades, selection, guides, assets, sources, ui    | growth, members exist                                                                   | hand rows listed in §1                                                               |
| Engine-status side effect                                | a count report flips engine status to `ready` (`createLayers.ts:73-76`)                 | avoided by R6: no report before the bulk slot settles                                |

Greenfield cross-check (fresh agent, Layer contract only) agreed on everything except counts and search, which became R6 and R7 at the checkpoint.

### 3.3 Prep list (head of PR 2, one commit each, behaviour-neutral)

| #   | Commit                                                                                                                                                                                                                                                   | Deletes                                                                                            |
| --- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| P1  | `wireStructureProjection` reports counts through a `sourceCounts` iterable at bulk-settle; `StructuresSectionContainer` reads `selectSourceCounts`; `watchSelectionRowsSaga` drops its structure pulse (it already listens to `engineSourceCountReported`). | `structureCounts`, `engineStructureCountsChanged`, `selectStructureCounts`                           |
| P2  | Search list published as `facts.searchList`; `selectStructureSearchList` re-points to the facts key.                                                                                                                                                     | `structureSearchList`, `engineStructureSearchListChanged`                                           |
| P3  | `watchFocusTweenSaga` deferral: `empty` reads the galaxy-cluster count report's absence, `pulse` is `engineSourceCountReported`.                                                                                                                          | `resolveDeps().structures`, `ResolveDeps.structures`, the saga-context field in `store/types.ts`    |
| P4  | `structureMarkersPlanner` calls `produceStructureMarkers`; `runMarkerProducers` goes.                                                                                                                                                                    | `MARKER_PRODUCERS`, `markerProducers.ts`, `runMarkerProducers.ts`, `MarkerProducer` type if unused  |

P1 and P2 land before `create` exists, so they are wired from the current core call sites; the wiring commit (§6) is where `create` takes them over.

### 3.4 Adjacent findings

- `watchSelectionRowsSaga`'s three-pulse list shrinks to two in P1; nothing else changes there.
- README unsettled items are ruled here (§4), not backlogged.
- `structureIdOf` and `structureFocusDistance` are structure-named core helpers; they stay, no rename.
- Remaining stub: `src/layers/body/` (settings-only). Not touched.

## 4. README rulings (text lands in PR 1)

**`subsystems/` vs `render/`.** Both stay. `render/` holds GPU pipeline objects and what feeds them directly: renderers, pick renderers, stores that own GPU buffers, vertex layouts, uniform packers. `subsystems/` holds stateful per-frame machinery that decides _what_ to draw before any pipeline runs: LOD planners, sticky maps, bake state machines, their workers. A pair that spans the two keeps one name (`proceduralDiskSubsystem` / `proceduralDiskRenderer`). A Layer with no per-frame decision state has no `subsystems/` folder; structure has none.

**Where declaration rows live.** A row's folder names the concern it describes, not the fact that it is a row. `load/` holds `assets` and `sourceCounts`; `present/` holds `fades`, `guides`, `selection`, `search`, `slabs`; `passes/` and `computes/` already work this way. All eleven formed Layers match today; no file moves.

The "Unsettled" section is replaced by these two paragraphs under "Where things go", and the Status line names `structure` as formed and `body` as the one remaining stub.

## 5. File moves (PR 1, one `move-files` manifest, tests dragged along)

### 5.1 Into `src/layers/structure/`

| From                                                                                                                                                                                                 | To                                                                                                                                                                      |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `data/sources/{galaxyCluster,galaxyGroup,gcCluster,globularCluster,nebula,openCluster,supercluster,void}.ts`                                                                                         | `sources/` + new `sources/structureSourceRows.ts`; `data/sources.ts` imports the array                                                                                  |
| `services/engine/data/createStructureStore.ts`                                                                                                                                                       | `render/`                                                                                                                                                               |
| `services/gpu/renderers/structureMarker/structureMarkerRenderer.ts`                                                                                                                                  | `render/`                                                                                                                                                               |
| `services/loading/fetchers/structureCatalogFetcher.ts`, `services/loading/slots/structureCatalogSlot.ts`                                                                                             | `load/`                                                                                                                                                                 |
| `services/engine/wiring/structureCatalogToStructures.ts`, `wireStructureProjection.ts`                                                                                                               | `load/`                                                                                                                                                                 |
| `data/structure/buildStaticAnchorStructures.ts`, `structureCatalogFormat.ts`                                                                                                                         | `load/`                                                                                                                                                                 |
| `utils/structure/toStructureSearchEntry.ts`                                                                                                                                                          | `load/`                                                                                                                                                                 |
| `services/engine/frame/passes/structureMarkersCosmoPass.ts`, `structureMarkersNearPass.ts`                                                                                                           | `passes/`                                                                                                                                                               |
| `services/engine/frame/passes/createStructureMarkersPass.ts`                                                                                                                                         | `render/` (a factory helper, not a pass; purity rule)                                                                                                                   |
| `services/engine/frame/planners/structureMarkersPlanner.ts`                                                                                                                                          | `frame.ts`                                                                                                                                                              |
| `services/engine/presentation/produceStructureLabels.ts`, `produceStructureMarkers.ts`, `structureMarkerStyles.ts`, `structureVisibleBands.ts`                                                       | `present/`                                                                                                                                                              |
| `services/engine/selection/structureSelectionRow.ts`, `services/engine/helpers/resolveStructureFromPick.ts`                                                                                          | `present/`                                                                                                                                                              |
| `data/structure/structureScaleTitles.ts`, `nebulaKindLabels.ts`, `data/structureLabelAboveGapPx.ts`                                                                                                  | `data/` (Layer-local constants, as `blackHoles/data/`)                                                                                                                  |
| `components/SettingsPanel/StructuresSection.tsx`, `components/containers/StructuresSectionContainer.tsx`                                                                                             | `ui/StructuresSection/`, `ui/`                                                                                                                                          |
| `components/InfoCard/StructureDetailCard/`, `CompactStructureCard/`, `components/containers/StructureDetailCardContainer.tsx`                                                                        | `ui/`                                                                                                                                                                   |
| `@types/rendering/StructureMarkerRenderer.d.ts`, `StructureMarkerDescriptor.d.ts`, `@types/engine/frame/StructureMarkersPassSpec.d.ts`, `@types/engine/data/{StructureStore,PickStructureStore}.d.ts` | `@types/` (`StructureStore` only after P3 removes `ResolveDeps`'s and `EngineData`'s reads; until then it stays shared, so it moves in PR 2)                            |

### 5.2 Into `src/layers/galaxyCatalog/` (R10)

`utils/structure/structureMemberCount.ts`, `structureMembership.ts` → beside their only reader, `layers/galaxyCatalog/frame.ts`; the plan names the folder (`present/` or a Layer-local `utils/`).

### 5.3 Stays

Everything in R12. Tests follow their files; the mirror root becomes `tests/layers/structure/`.

## 6. Wiring (PR 2, after the four preps)

- `create(deps)` mints the Runtime: store, two renderers (from `gpuHandleRegistry`'s rows, deleted there), the bulk slot (from `assetWiring`'s row, deleted there), and runs the projection with `deps.publish` for `searchList` and the `sourceCounts` iterable for counts. `destroy` releases renderers and the slot.
- `createEngineData` loses `structures`; every core read of `state.data.structures` is gone by P3, so this is a type delete.
- `EngineAssetSlots.structureCatalog` and `EngineGpuHandles.structureMarker*` go.
- `data/sources.ts` imports `STRUCTURE_SOURCE_ROWS`; the eight entries leave `UNFORMED_SOURCE_REGISTRY`.
- `CORE_PLANNERS` is deleted along with `planners/index.ts` if nothing else is left in it.
- Fade fold (R3): one `structureApparentRadiusFade(style, pxRadius)` helper in `present/` replaces both hand-rolled smoothstep pairs; both producers call it. Its test pins the two thresholds.
- `compositions/app.ts` adds `structureLayer`.

## 7. Testing

- Existing 25 direct mirrors move with their files and must stay green with only import-path changes in PR 1.
- PR 2 adds: `tests/layers/structure/layer.test.ts` (pass names unique, two guides rows on COSMO and NEAR0, sources array has eight rows); `load/structureSourceCounts.test.ts` (no report before the slot settles; eight reports after ready; eight after error with anchor-only counts); `present/structureApparentRadiusFade.test.ts`; the `watchFocusTweenSaga` deferral test re-pointed to `engineSourceCountReported`.
- Deleted with their code: the assertions in `engineSliceDispatches.test.ts` on the two deleted actions.

## 8. Risks

- `move-files` misses string-literal paths; grep for every old path after the manifest run. Shaders do not move, but `structureMarkerRenderer.ts`'s `?static` shader specifier is a string literal and is re-checked after its move.
- Pass names must stay globally unique; `createLayers` throws at boot if a core row survives beside the Layer's.
- The settings tuple must be imported from the Layer, never off `APP_COMPOSITION` (circular alias).

## 9. Behaviour changes, accepted

1. Structures counts appear when the bulk catalog settles, not at frame 1 (R6).
2. Engine status flips to `ready` when the structure catalog lands, as it does for any other catalog today; it never flips at frame 0.

## 10. Definition of done

- `src/layers/structure/` matches the README table; `src/layers/README.md` has no "Unsettled" section and lists `body` as the only stub.
- No file outside the Layer imports a moved file except through the Layer contract; `engine.ts` mentions structures only through `structureFocus`.
- `engineSlice` has no structure field or action; `resolveDeps` has no `structures`; `MARKER_PRODUCERS` and `CORE_PLANNERS` are gone.
- `npm test`, `npm run typecheck`, `npm run build` green; eye-check deep links for one cosmo structure and one near structure show ring, label, card, palette row and Structures count.
- Backlog item 1 of `2026-08-22-label-entanglement-residuals.md` is removed from that file in PR 2.
