# blackHoles Layer — PR 1, ground preparation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md` (grouped dispatches, one whole-branch review at the end, CI as the gate). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Open the five contract seams the blackHoles Layer lands through — `search`/`sourceCounts` feeds, `Layer.slabs`, a driver-geometry answer on every selection row, the `'galactic-centre'` place anchor, and a `detailCard` UI slot — with nothing visible changing.

**Architecture:** Each seam is a named `Layer` (or `SelectionKindRow`/`SelectionRow`) member core folds at boot, replacing a static splice, a hardcoded switch or an exhaustive core table. Sgr A*'s own rows stay in core until PR 2 moves them; the six commits are behaviour-neutral and land in the listed order.

**Tech Stack:** TypeScript, Redux Toolkit + redux-saga, Vitest.

**Spec:** `docs/superpowers/specs/completed/2026-09-22-black-holes-layer-design.md` §2 (shapes) and §3 (this PR). Decisions: `docs/grill-sessions/black-holes-layer-2026-09-22.md` R4, R7, R13–R16.

## Global Constraints

- **Nothing visible changes.** Every commit leaves the app pixel-identical and every existing test green; a behaviour change hiding in a prep commit is a review finding.
- **Each task is one commit**, in the listed order (Task 4 depends on Task 2's `anchorId` field; Task 5 is independent).
- One symbol per file, one type per file, `type` never `interface`, no barrels, deep relative imports. New `@types` under `src/@types/engine/{layer,frame,camera}/`.
- Frame files (`src/services/engine/frame/**`) declare only their own symbol; helpers go to `src/utils/<area>/<fn>.ts` with a focused test; `tests/services/engine/frame/frameFilePurity.test.ts` budgets only shrink.
- Didactic comments: module header ≤ 10 lines, comment lines ≤ half the code lines.
- Formatting: `npx prettier --write <files you touched>` only. Never `npm run format`. Stage by path, never `git add -A`. No `Co-Authored-By` trailer.
- Moves/renames via `npm run move-files -- <from> <to>` and `npm run refactor rename` (`.claude/skills/refactor/SKILL.md`), never `git mv` + hand edits; grep for the old path afterwards.
- `npm run typecheck:fast` is the inner loop; `npm test` (full suite) green before every commit.
- Tests only where a real bug could slip past the compiler and the existing suite (`docs/superpowers/conventions/testing.md`); type sweeps, renames and constant plumbing get none — say so in the task.

---

## File Structure

**Created**

- `src/@types/engine/layer/LayerSearchEntry.d.ts`, `SourceCountReport.d.ts`
- `src/utils/async/callbackIterable.ts` (+ test)
- `src/state/engine/sagas/runLayerFeedSaga.ts` (+ test) — the one saga both feeds run through
- `src/@types/engine/frame/SlabRow.d.ts`, `SlabHostId.d.ts`
- `src/utils/scene/bodySlabRowOf.ts` (+ test) — a store-fed `SceneBody` → `SlabRow`
- `src/data/bodies/coreSlabRows.ts` — Sgr A*'s row, core until PR 2
- `src/@types/engine/camera/DriverGeometry.d.ts`
- `src/utils/scene/bodyDriverGeometry.ts` (+ test) — the body arm's answer
- `src/@types/scene/PlaceId.d.ts`, `src/data/places/galacticCentre.ts`
- `src/layers/zoneOfAvoidance/ui/ZoneOfAvoidanceDetailCard/`, `CompactZoneOfAvoidanceCard/` (moved)

**Deleted**

- `LayerCoreDeps.reportSourceCount`; `src/utils/camera/focusDriverId.ts`; `src/data/bodies/sceneAnchorPointBodies.ts`; `SGR_A_STAR_ANCHOR` (replaced by the place row)

---

### Task 1: `search` + `sourceCounts` as async-iterable feeds — **review: yes**

**Files:** create `src/@types/engine/layer/{LayerSearchEntry,SourceCountReport}.d.ts`, `src/utils/async/callbackIterable.ts`, `src/state/engine/sagas/runLayerFeedSaga.ts`, `tests/utils/async/callbackIterable.test.ts`, `tests/state/engine/sagas/runLayerFeedSaga.test.ts`; modify `src/@types/engine/layer/Layer.d.ts` (two members), `LayerCoreDeps.d.ts:28` (delete `reportSourceCount`), `src/services/engine/phases/createLayers.ts:55-74,94,108-110` (the callback body becomes the `sourceCounts` feed's consumer; both feeds start beside `layer.sagas`, tasks pushed to the same `layerSagaTasks` so `engine.ts:459-463` cancels them), `src/state/engine/engineSlice.ts` (+ `layerSearch` reducer, sibling of `engineStructureSearchListChanged` at :84-89), the engine slice state type (+ `layerSearch: Record<string, readonly LayerSearchEntry[]>`), `src/state/engine/selectors.ts` (+ `selectLayerSearchRows`, flattening in Layer order), `src/components/CommandPalette/utils/rankPaletteMatches.ts:62-67,210-217` (fifth parameter), `usePaletteSearch.ts:71-73`, `CommandPalette.tsx:130-133`, `containers/CommandPaletteContainer.tsx:61-68`, `src/layers/galaxyCatalog/load/wireGalaxyCatalogSourceSlot.ts:63-66`, `src/layers/starCatalog/load/starCatalogSlot.ts:20,41`, `src/layers/starCatalog/create.ts:84-90`, `src/layers/starCatalog/layer.ts` + `galaxyCatalog/layer.ts` (add `sourceCounts`), `tests/conventions/layerImportBoundary.test.ts:194` (message), `tests/services/engine/phases/createLayers.sourcePulse.test.ts` (re-target: the pulse now comes from a Layer's `sourceCounts` feed), `tests/components/CommandPalette/utils/rankPaletteMatches.test.ts`.

**Interfaces — produces:**

```ts
// Layer.d.ts
/** Palette rows. Each yield REPLACES this Layer's previous snapshot; a static Layer yields once.
 * Core runs it as a saga beside `sagas`, cancelled at teardown. */
search?(runtime: Runtime): AsyncIterable<readonly LayerSearchEntry[]>;
/** Per-source counts on the same terms. Core dispatches `engineSourceCountReported` per yield
 * and keeps its ready-total / contentVersion side effects (today's `reportSourceCount`). */
sourceCounts?(runtime: Runtime): AsyncIterable<SourceCountReport>;

export type LayerSearchEntry = { readonly id: string; readonly names: readonly string[];
  readonly ref: SelectionRef; readonly class: 'primary' | 'catalog' };
export type SourceCountReport = { readonly source: SourceType; readonly count: number };

// utils/async/callbackIterable.ts — turns a subscribe-style source into an async iterable
export function callbackIterable<T>(subscribe: (emit: (value: T) => void) => () => void): AsyncIterable<T>;
// sagas/runLayerFeedSaga.ts
export function* runLayerFeedSaga<T>(feed: AsyncIterable<T>, onValue: (value: T) => Generator): SagaIterator;
// engineSlice
layerSearchReported: PayloadAction<{ layer: string; rows: readonly LayerSearchEntry[] }>
// selectors
export const selectLayerSearchRows: (state: RootState) => readonly LayerSearchEntry[];
// rankPaletteMatches — fifth input; `primary` rows join `primaryScored` (PRIMARY_TIEBREAK, uncapped),
// `catalog` rows are capped at MAX_ALIAS_RESULTS beside the alias rows
rankPaletteMatches(entries, aliasIndex, structures, layerRows: readonly LayerSearchEntry[], query)
```

- [ ] `callbackIterable` tests: `values emitted before the consumer asks are buffered in order`; `return() runs the unsubscribe once`. `runLayerFeedSaga` tests (use `redux-saga`'s `runSaga` with a stub `put`): `each yield reaches onValue in order`; `cancelling the task calls the iterable's return()`; `a rejected next() ends the feed without throwing into the root`.
- [ ] Implement the helper and the saga. `createLayers` starts `runLayerFeedSaga(layer.search(runtime), rows => put(layerSearchReported({layer: layer.name, rows})))` and `runLayerFeedSaga(layer.sourceCounts(runtime), report => <today's reportSourceCount body>)` only when the member exists — after `instantiateLayer` (the runtime is its result), pushed to `layerSagaTasks`.
- [ ] Migrate the three call sites: the two slot subscriptions become `callbackIterable((emit) => slot.subscribe(...ready → emit({source, count})...))` returned from the Layer's `sourceCounts`; starCatalog's seeded counts (`create.ts:84-90`) become the first yields of the same generator before the slot feed. Delete `reportSourceCount` and the `Pick<LayerCoreDeps, 'reportSourceCount'>` narrowing at `starCatalogSlot.ts:20`.
- [ ] `rankPaletteMatches`: add the parameter; one test `a primary layer row outranks a capped catalog row` and one `layer rows are absent when the list is empty`. Wire the selector through the container/hook (`useMemo` deps gain the new input).
- [ ] `layerImportBoundary.test.ts:194`: message now names `sourceCounts`/`deps.publish`. `createLayers.sourcePulse.test.ts`: the fixture Layer declares `sourceCounts: async function* () { yield {source, count}; }`; assertions unchanged (`engineSourceCountReported`, `engineStatusChanged` ready total, `contentVersion` bump).
- [ ] Landmine check (`project_landmines_state`: saga puts late): the pulse consumers `watchTierSaga.ts:80`, `watchSelectionRowsSaga.ts:72`, `resolveFocusRefDeferring.ts:19` `take` the action; a `put` from a saga reaches them the same way a store dispatch did. Confirm `createLayers.sourcePulse.test.ts` still sees `engineStatusChanged` after `engineSourceCountReported` in that order.
- [ ] `npm test`, commit `refactor(layer): search + sourceCounts as async-iterable feeds; reportSourceCount deleted`.

### Task 2: `Layer.slabs` — composed slab rows, `hostId: SlabHostId` — **review: yes**

**Files:** create `src/@types/engine/frame/{SlabRow,SlabHostId}.d.ts`, `src/utils/scene/bodySlabRowOf.ts`, `src/utils/frame/slabRowActive.ts`, `src/data/bodies/coreSlabRows.ts`, `tests/utils/scene/bodySlabRowOf.test.ts`, `tests/utils/frame/slabRowActive.test.ts`; modify `Layer.d.ts` (+ `readonly slabs?: readonly SlabRow[]`), `LayerInstance.d.ts` (no change — static member, read off `layer` like `targets`), `createLayers.ts` (fold `state.slabRows = [...CORE_SLAB_ROWS, ...layers.flatMap(l => l.slabs ?? [])]`, assert `≤ SLAB_ROW_CEILING` and `anchorId`s unique), `EngineState.d.ts` (+ `slabRows`), `SlabFrame.d.ts:15` (`hostId: SlabHostId`, rename via `npm run refactor rename` — 19 files), `ReadyFrameContext.d.ts:55-60` + `frameContext.ts:59-66` (`slabBodyCandidates: readonly SlabRow[]` = `[...storeBodies.map(bodySlabRowOf), ...state.slabRows.filter(active)]`), `deriveView.ts:67-82,96-109` (candidates are rows; `host.id` → `row.anchorId`), `slabs.ts:134-229` (`bodySlabRow` takes `row: SlabRow`; `rMaxM = row.boundingRadiusM`, `footprintM = row.footprintRadiusM`, pose by `row.anchorId`, frame `{kind:'body-m', hostId: row.anchorId}`), `visibleSlabBodies.ts:14-27,70-77` (the `SGR_A_STAR` branch becomes `row.cullFloorMpc !== undefined && dist < row.cullFloorMpc`; `BAND_SLAB_FLOOR_MPC` deleted; `rEffM` from the row's two radii), `bodyRowSlabs.ts:19-24` (`lens` = every `body-m` slab whose row has `source: 'lens'`; the band gate is now the row's activity), `frame/passes/sgrAStarLensingPass.ts:29,42,52` (`frame.hostId === SGR_A_STAR.id`; drop the `skyCaptureBandAlpha` gate at :45 — the step exists only while the row is active), `utils/meshBodies/meshBodySlabHostId.ts:16-24` (`SLAB_HOST_IDS` built from `CORE_SLAB_ROWS` anchor ids + Earth + planets at module load; Layer rows join at boot — see the note below), `frame/timing/bodySlabCapacity.ts` (→ `SLAB_ROW_CEILING = 1 + SCENE_PLANETS.length + HOSTLESS_MESH_BODIES.length + LAYER_SLAB_ROW_HEADROOM (4)`), `gpu/renderers/bodies/bodyGlintRenderer.ts:60-80` (`MAX_GLINTS = SCENE_PLANETS.length + 1 + GLINT_CAPACITY_MARGIN` — the `+1` is the Sgr A* glint until PR 2), `data/bodies/hostlessMeshBodies.ts:3` (doc ref), `frame/passes/bodyGlintsPass.ts:282` (comment); delete `src/data/bodies/sceneAnchorPointBodies.ts`; tests `frameContext.test.ts`, `frameContext.meshBodyHost.test.ts`, `deriveView.test.ts`, `slabs.test.ts`, `visibleSlabBodies.test.ts`, `bodyRowSlabs.test.ts`, `frameFilePurity.test.ts` (new frame file rows at 0).

**Interfaces — produces:**

```ts
// SlabHostId.d.ts — until Task 4 adds PlaceId this is `BodyId`; Task 4 widens it
export type SlabHostId = BodyId;
// SlabRow.d.ts
export type SlabRow = {
  readonly anchorId: SlabHostId;        // pose = ctx.bodyPose(anchorId); the row's host identity
  readonly boundingRadiusM: number;     // = bodyDrawRadiusM(body) for a store body
  readonly footprintRadiusM: number;    // = bodyFootprintRadiusM(body) for a store body
  readonly activeBand?: FadeBand;       // row exists only while fadeBand(activeBand, |cam − anchor|) > 0
  readonly cullFloorMpc?: number;       // inside this distance both culls in visibleSlabBodies are bypassed
  readonly source: 'foreground' | 'lens';
};
// utils/scene/bodySlabRowOf.ts
export function bodySlabRowOf(body: SceneBody): SlabRow;   // source: 'foreground', no band, no floor
// utils/frame/slabRowActive.ts
export function slabRowActive(row: SlabRow, camPosMpc: Readonly<Vec3>, states: ReadonlyMap<string, BodyState>): boolean;
// data/bodies/coreSlabRows.ts — Sgr A*'s row, values copied from today's behaviour:
//   anchorId: SGR_A_STAR.id, boundingRadiusM: rS, footprintRadiusM: rS (reliefM [0,0] today — NOT the quad extent, PR 2 raises it),
//   activeBand: SCALE_FADE_BANDS.sgrAStarLensing, cullFloorMpc: SCALE_FADE_BANDS.sgrAStarLensing.goneAt, source: 'lens'
export const CORE_SLAB_ROWS: readonly SlabRow[];
```

`slabRowActive` reproduces `skyCaptureBandAlpha('sgrAStar') > 0` exactly: `fadeBand(row.activeBand, distance(camPosMpc, states.get(row.anchorId).positionMpc)) > 0`, `true` when the row has no band. `regionRelativeDistanceMpc` takes a region; measure from the anchor state directly.

`SLAB_HOST_IDS` note: `meshBodySlabHostId` is read at module load by `HOSTLESS_MESH_BODIES`, so the set stays static; Layer rows cannot host a mesh body until the body Layer forms. Say so in the module header; do not thread `state` into it.

- [ ] `bodySlabRowOf` test: `a planet row carries bodyDrawRadiusM and bodyFootprintRadiusM and source foreground` (Saturn: ring-inclusive draw radius ≠ datum). `slabRowActive` tests: `a bandless row is always active`; `a banded row is inactive past goneAt and active inside fullAt` (use `SCALE_FADE_BANDS.sgrAStarLensing`).
- [ ] `SlabFrame` rename: `npm run refactor rename` `bodyId` → `hostId` on the `body-m` arm; grep `frame.bodyId` afterwards — zero hits.
- [ ] Rewire `frameContext` → `deriveView` → `deriveSlabs`/`bodySlabRow` → `visibleSlabBodies` → `bodyRowSlabs` on `SlabRow`. Existing tests pin behaviour: `visibleSlabBodies.test.ts` (the Sgr A* bypass case now builds a row with `cullFloorMpc`), `bodyRowSlabs.test.ts` (`lens` present iff the row is active), `slabs.test.ts` (near/far unchanged for a planet row). No new tests beyond the two helpers — the rewire is a type sweep the suite already covers.
- [ ] Capacity: `SLAB_ROW_CEILING` replaces `BODY_SLAB_CAPACITY` at `maxFrameInputs.ts:38-39` and `passGroupTitles.ts:34,46,56`; `createLayers` throws `slab rows exceed SLAB_ROW_CEILING` / `duplicate slab anchorId` at boot. Add to `createLayers.composition.test.ts`: `a composition whose slab rows exceed the ceiling throws at boot`; `two Layers naming the same slab anchorId throw at boot`.
- [ ] `npm test`, commit `refactor(frame): Layer.slabs — slab candidates are composed SlabRows; SlabFrame.hostId`.

### Task 3: Driver geometry on the selection row — **review: yes**

**Files:** create `src/@types/engine/camera/DriverGeometry.d.ts`, `src/utils/scene/bodyDriverGeometry.ts`, `tests/utils/scene/bodyDriverGeometry.test.ts`; modify `src/@types/engine/SelectionRow.d.ts` (every arm gains `readonly driver: DriverGeometry | null`), `SelectionKindRow.d.ts` (doc: `extractRow` fills `driver`), the `body` arm's `extractRow` (core `present/bodySelectionRow.ts` or wherever `type: 'body'` rows are built — grep `type: 'body'` under `src/services/engine`), `src/layers/starCatalog/present/starCatalogSelectionRow.ts:50-70` (both branches fill `driver` from `radiusM`), the `structure`/`milkyWay`/`zoneOfAvoidance`/`galaxyCatalog` builders (`driver: null`), `src/services/engine/camera/cameraDrivers.ts:42,111,163-168`, `approachTiltedPose.ts:18,45-57`, `focusFraming.ts:45,107-118`, `helpers/selectionHaloTable.ts:42,99-105`, `camera/pivotRadiusMpc.ts:13-60`; delete `src/utils/camera/focusDriverId.ts` + its test; tests `cameraDrivers.test.ts`, `approachTiltedPose.test.ts`, `focusFraming.test.ts`, `pivotRadiusMpc.test.ts` (fixtures gain `driver`), any `SelectionRow` fixture under `tests/` (grep `type: 'body'`).

**Not touched, by contract:** `bodyHomePose.ts:77`, `watchFlyToLonLatSaga.ts:73`, `rungs/bodyRung.ts:64` take a *body id* (go-home, fly-to-lon/lat, surface rung) — body-domain callers that keep reading `SCENE_BODIES`. Only the five focus-generic readers move.

**Interfaces — produces:**

```ts
// DriverGeometry.d.ts — what the camera needs of whatever a focus drives it toward
export type DriverGeometry = {
  readonly poseId: string;                 // deriveBodyStates key; a SlabHostId when a slab row names it
  readonly boundingRadiusM: number;        // pivot floor for a groundless driver (mesh hull, hole)
  readonly footprintRadiusM: number;       // framing / halo / approach distance
  readonly groundRadiusM: number | null;   // null = no surface to taper against (mesh bodies)
  readonly standoffRadii: number;
  readonly focusDistanceRadii?: number;
};
// utils/scene/bodyDriverGeometry.ts — the body arm's answer, from SCENE_BODIES
export function bodyDriverGeometry(bodyId: string): DriverGeometry;
// starCatalog: { poseId: star.id ?? <none for survey stars → driver null>, boundingRadiusM: radiusM,
//   footprintRadiusM: radiusM, groundRadiusM: radiusM, standoffRadii: SURFACE_STANDOFF_RADII }
```

Reader mapping (values, not code): `cameraDrivers` `focusDriverId(focus)` → `focus.driver?.poseId ?? null`, radius → `driver.footprintRadiusM`; `approachTiltedPose` `isMeshBody(body)` → `driver.groundRadiusM === null`, `datumRadiusM` → `groundRadiusM`; `focusFraming` `body` case → `bodyLikeFraming(row.positionMpc, driver.footprintRadiusM, fovYRad, driver.focusDistanceRadii)`, the `starCatalog` case unchanged in value; `selectionHaloTable` radius → `driver.footprintRadiusM`; `pivotRadiusMpc` → `driver.groundRadiusM`, `pivotFraming` mesh branch → `driver.groundRadiusM === null ? boundingRadiusM × standoffRadii : groundRadiusM × standoffRadii`. Survey (non-seeded) stars had `focusDriverId` = their id but no `SCENE_BODIES` row — confirm from `cameraDrivers.test.ts` what they do today and keep it: they carry `radiusM`, so `driver` is non-null with `poseId` = `null`-guarded — if today's path throws or skips for them, preserve that.

- [ ] `bodyDriverGeometry` tests: `a planet reports datum ground, footprint from bodyFootprintRadiusM and SURFACE_STANDOFF_RADII`; `a mesh body reports null ground and its own standoffRadii`; `Sgr A* reports focusDistanceRadii 30.4 and standoffRadii 2`.
- [ ] Fill `driver` in every `extractRow`; move the five readers; delete `focusDriverId`. Existing camera tests are the regression net — fixtures gain `driver` values matching what `bodyDriverGeometry` would return.
- [ ] Amend `docs/backlog/2026-09-22-stars-still-in-the-body-tables.md`: the reader half is resolved (the star arm answers its own geometry); the remaining item is the `SCENE_BODIES` listing + `ORBIT_REACH_BY_REGION`.
- [ ] `npm test`, commit `refactor(camera): driver geometry travels on the selection row; focusDriverId deleted`.

### Task 4: `'galactic-centre'` is a core place; `PlaceId`

**Files:** create `src/@types/scene/PlaceId.d.ts`, `src/data/places/galacticCentre.ts`; modify `SlabHostId.d.ts` (`BodyId | PlaceId`), `src/data/bodies/sceneAnchors.ts:18,27` (`GALACTIC_CENTRE_ANCHOR`), `src/data/bodies/sceneSgrAStar.ts:27-36,51-58` (RA/Dec/distance constants and the anchor move to the place file; `SGR_A_STAR` the `AnchorPointBody` stays), `src/data/bodies/bodyRegions.ts:24,62,109` (`anchorId: GALACTIC_CENTRE_ANCHOR.id`), `src/data/milkyWay/galacticCenter.ts:28,42`, `src/services/engine/presentation/scaleFadeBands.ts:18,37`, `src/data/bodies/coreSlabRows.ts` (`anchorId: GALACTIC_CENTRE_ANCHOR.id`), `frame/passes/sgrAStarLensingPass.ts:29,42,52` (filter on the place id), `bodyGlintsPass.ts:286` + `sceneBodyLabels.ts:105-111` + `starPointsPass.ts:335` + `bodyRowSlabs`/`visibleSlabBodies` if any still key the *position* on `SGR_A_STAR.id` (they read `states.get(SGR_A_STAR.id)` — `deriveBodyStates` must keep a state under BOTH ids until PR 2: the place's state and, for the body-table readers, `SGR_A_STAR.id` aliasing the same position), tests keying on `'sgr-a-star'` as an anchor (grep `SGR_A_STAR_ANCHOR`).

**Interfaces — produces:**

```ts
export type PlaceId = 'galactic-centre';
export const GALACTIC_CENTRE_ANCHOR: AnchorBody & { readonly id: PlaceId };
```

The dual-state rule is the one non-obvious step: `deriveBodyStates` (`positionDrivers.ts`) today derives Sgr A*'s state from `SGR_A_STAR_ANCHOR`; after this task the anchor is `'galactic-centre'` and the body-table consumers (`sceneBodyLabels`, `bodyGlintsPass`, `starPointsPass`, `sStar` orbits' parent) still ask for `'sgr-a-star'`. Add the alias in the position-driver table (one row: `'sgr-a-star'` positioned at the place), commented "PR 2 removes this"; do not touch the consumers.

- [ ] No new test: a rename plus one alias row; `bodyRegions`, `scaleFadeBands` and `deriveBodyStates` tests already pin the values. If `deriveBodyStates` has no test asserting the Sgr A* position, add `galactic-centre and sgr-a-star resolve to the same position` to its test file — that is the alias's only regression net.
- [ ] `npm test`, commit `refactor(scene): 'galactic-centre' is a core place anchor; PlaceId`.

### Task 5: `detailCard` UI slot; zoneOfAvoidance owns its cards

**Files:** modify `src/@types/engine/layer/LayerUiSlots.d.ts:10-14` (+ `detailCard: LayerDetailCard`), create `src/@types/engine/layer/LayerDetailCard.d.ts`, move `src/components/InfoCard/{DetailCardProps,CompactCardProps,DetailCardEntry}` types to `src/@types/components/infoCard/*.d.ts` (they are the slot's content type now, shared core↔Layer), modify `src/components/InfoCard/detailCardTable.ts:70-165` (five core arms as `CORE_DETAIL_CARDS: Partial<Record<…>>`; export `detailCardTable(layers): Record<FocusableTargetType, DetailCardEntry>` folding `layerUiContents(layers, 'detailCard')` and throwing on a missing arm), `InfoCard.tsx:27,80,104,111` (one module-level `DETAIL_CARD = detailCardTable(APP_COMPOSITION.layers)`), `src/layers/zoneOfAvoidance/layer.ts:48-51` (+ `{ slot: 'detailCard', content: { type: 'zoneOfAvoidance', Detail, Compact } }`); move via `npm run move-files -- src/components/InfoCard/ZoneOfAvoidanceDetailCard src/layers/zoneOfAvoidance/ui/ZoneOfAvoidanceDetailCard` and the same for `CompactZoneOfAvoidanceCard` (the tool drags `tests/components/InfoCard/InfoCard.zoneOfAvoidance.test.ts`'s imports; grep `ZoneOfAvoidanceDetailCard` for string paths in CSS-module imports afterwards); tests `tests/utils/layer/layerUiContents.test.ts:26-33` (+ the fourth slot), `tests/components/InfoCard/InfoCard.zoneOfAvoidance.test.ts` (unchanged assertions), new `tests/components/InfoCard/detailCardTable.test.ts`.

**Interfaces — produces:**

```ts
// LayerDetailCard.d.ts
export type LayerDetailCard = { readonly type: FocusableTargetType } & DetailCardEntry;
// detailCardTable.ts
export function detailCardTable(layers: readonly Layer<string, unknown>[]): Record<FocusableTargetType, DetailCardEntry>;
```

- [ ] `detailCardTable` tests: `every FocusableTargetType has a card once the app composition is folded` (iterate `FOCUSABLE_TARGET_TYPES` or the union's runtime list — if none exists, assert the six known arms); `a composition missing an arm throws naming the arm` (fold with `[]`).
- [ ] Move the two folders with `move-files`; add the ZoA `ui` entry; delete the ZoA arm from the core table.
- [ ] `npm test`, commit `refactor(ui): detailCard is a Layer ui slot; zoneOfAvoidance owns its cards`.

### Task 6: Docs

**Files:** modify `docs/superpowers/specs/completed/2026-09-21-star-catalog-layer-design.md` (a one-line note under :27 and :174: "Reversed by `2026-09-22-black-holes-layer-design.md` §1"), `docs/backlog/2026-09-21-derive-settings-snapshot.md` (+ the `blackHoles` visibility key, arriving with PR 2), `docs/backlog/2026-09-03-s-star-analytic-lensing.md` (+ "rides the hole's `SlabRow`, filtering `frame.hostId`; no contract field"), `src/layers/README.md:18-32` (rows for `search?`, `sourceCounts?`, `slabs?`; `detailCard` in the `ui?` row; delete the stale `frame?` row — `planners?` since #805), `docs/RENDERER.md` (the slab-host paragraph: candidates are composed `SlabRow`s; `hostId`), `docs/BACKLOG.md` + `docs/backlog/2026-09-22-scene-anchors-are-places.md` (new: `SCENE_ANCHORS`/`AnchorBody` is the place table under a body name in `data/bodies/`) and `docs/backlog/2026-09-22-url-hash-for-vs-focus-id-encode.md` (new, `needs-verification`: `URL_HASH_FOR` beside `SelectionKindRow.focusId.encode`).

- [ ] Write the notes; commit `docs: blackHoles prep — spec notes, README contract rows, two backlog items`.

---

## Definition of Done

**Deliverable inventory**

- `Layer.search`, `Layer.sourceCounts`, `Layer.slabs` on the contract; `SelectionRow.driver` on every arm; `LayerUiSlots.detailCard`; `SlabFrame.body-m.hostId: SlabHostId`; `PlaceId`/`GALACTIC_CENTRE_ANCHOR`; `CORE_SLAB_ROWS` (one row); `runLayerFeedSaga`, `callbackIterable`, `bodySlabRowOf`, `slabRowActive`, `bodyDriverGeometry`, `detailCardTable`.
- Deleted: `LayerCoreDeps.reportSourceCount`, `focusDriverId.ts`, `sceneAnchorPointBodies.ts`, `BAND_SLAB_FLOOR_MPC`, `BODY_SLAB_CAPACITY` (→ `SLAB_ROW_CEILING`), the ZoA card folders under `components/InfoCard/`.

**Observable behaviours for the smoke pass** (all "unchanged"): palette finds "Galactic Centre", "Sgr A*", Coma, a Gaia alias, and galaxy/star count chips light up after load; flying to Sgr A* descends to the 2 r_s floor and the lens opens/closes at the same distances; Saturn's rings and Earth's whale still draw on their slabs; clicking the Zone of Avoidance band opens its card; `#focus=body-sgr-a-star` still resolves (PR 2 changes it).

**Deferral boundary**: nothing of Sgr A* moves (PR 2); no Layer declares `search` or `slabs` yet; `Layer.captures` waits for dome #800 and the captures-as-views ruling; Layer slab rows cannot host mesh bodies (`SLAB_HOST_IDS` static until the body Layer).
