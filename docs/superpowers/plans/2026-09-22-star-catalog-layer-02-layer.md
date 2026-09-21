# starCatalog Layer 02 — the Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Form `src/layers/starCatalog/` from its settings-only stub so it owns every star in the scene — the Gaia survey and the three seeded catalogs (famous stars, the Sun, the Sgr A\* S-stars) — with star identity, one star card, `star-` deep links, Layer-fed orbit trails and captions, and the fade advance as the Layer's `frame`.

**Architecture:** PR 1 (#799) built the joints; this PR grows into them. Eight tasks in four groups: (1) the `Layer.frame` hook widens to the rig's views and the registry retypes the Sun and S-star rows; (2) the Layer forms as a behaviour-neutral move (runtime, passes, renderers, slots, target, fade rows, facts, `frame`) and the star-only types follow; (3) identity — one `starCatalog` selection arm for four sources, URL ids, the camera and palette producers of star refs, then `StarInfo` + `StarDetailCard`; (4) captions and orbit trails move behind `Layer.guides`, docs and backlog close out. `galaxyCatalog` is the template at every member (`src/layers/README.md`).

**Tech Stack:** TS, RTK slices, React (InfoCard, SettingsPanel), Vitest, WebGPU pass files. No shader changes.

**Spec:** `docs/superpowers/specs/2026-09-21-star-catalog-layer-design.md` — §2 (data delta), §4 (the Layer), §5 (captions), §6 (focus ids), §7 (D6'3 reversed), §8 (behaviour changes), §9 (testing), §10 (backlog), §13 (docs). Parent: `docs/superpowers/specs/2026-09-09-layer-composition-design.md` (D6'1 at :979, D6'3 at :998, §10(e) at :1313). Grill transcript: `docs/grill-sessions/star-catalog-layer-2026-09-21.md`.

## Global Constraints

- Everything not listed in spec §8 is pixel-identical. Tasks 1, 3, 4 are behaviour-neutral; Tasks 2, 5, 6, 7 carry exactly the §8 changes.
- One task = one commit, in the order below. Feature, adjacent cleanup and prep are different diffs; adjacent findings go to `docs/backlog/` (Task 8), never into a task.
- Every seeded star belongs to exactly one source; no `id === 'sun'` / `id === '<s-star>'` branch in any shared loop or gate — route by the source row or a table total over `SeededStarCatalogId`.
- `SelectionRef`/`SelectionRow` gain ONE arm, `{ type: 'starCatalog'; source; index }`; the `star` arm is replaced, not kept beside it.
- Deep links: `star-<seedId>` for seeded stars, `star-<index>` for Gaia; one boot assert that no seed id is all digits. `body-<seedId>` links to stars stop decoding (spec §6; the three authored ones are re-pointed in Task 5).
- Seed tables stay under `src/data/`; shaders stay under `src/services/gpu/shaders/`; `orbitalElements.ts` keeps importing the S-star rows for `POSITION_DRIVERS` (no `data/ → layers/` edge).
- `passes/` and every `src/services/engine/frame/**` file export only the one symbol they are named for (`tests/services/engine/frame/frameFilePurity.test.ts`). One symbol per file in `utils/` and `@types/`; `type` aliases, never `interface`; deep relative imports, no barrels; a Layer's own types live in `src/layers/starCatalog/@types/*.d.ts`.
- Comment budget: module header ≤ 5 lines, comment lines ≤ half the code lines; every header a task falsifies is rewritten in that task (listed per task), never left stale.
- Moves use `npm run move-files -- <from> <to>` (`--dry` first for folders); renames use `npm run refactor -- rename`; grep the old path afterwards (`?static`, `.mts` and string-literal paths are the tool's blind spots). Never `git mv` + hand-edited imports.
- Layer boundary ratchets stay green with no new allow-list rows: `tests/conventions/layerImportBoundary.test.ts`, `layerStateShape.test.ts`, `oneSymbolPerFile.test.ts`.
- Format with `npx prettier --write <touched files>`; never `npm run format`. Commit messages carry no `Co-Authored-By` trailer. `npm run dev` stays running.
- Perf gate: none (spec §9 — no renderer path changes). Deletion audit: once, at `/feature-done`.

---

### Task 1: `Layer.frame` takes the rig's views

Behaviour-neutral. PR 1's `advanceStarFades(state, views)` needs the whole rig view list (the multi-view prune frustum from #769), but the per-Layer hook receives one `FrameView`. Widening it first is what lets Task 3 move the advance into the Layer without regressing dome/XR rigs to single-view pruning.

**Files:**

- Modify: `src/@types/engine/layer/Layer.d.ts:114-119`, `src/@types/engine/layer/LayerInstance.d.ts:27`
- Modify: `src/services/engine/frame/runFrame.ts:236-249` (the hook loop passes `views`, not `canvas`; rewrite the comment)
- Modify: `src/layers/galaxyCatalog/frame.ts:21-23`, `src/layers/flow/frame.ts:12`
- Test: `tests/services/engine/layer/instantiateLayer.test.ts:30-31`, `tests/services/engine/frame/runFrame.test.ts:1165` (`makeLayer`'s hook), `tests/layers/flow/frame.test.ts`, `tests/layers/galaxyCatalog/frame.*.test.ts` (call shape only)

**Interfaces:**

```ts
// Layer.d.ts — `views[0]` is the anchor view (its eye, viewSlot and
// snapshot.nowMs); the list is every view the rig derived this frame, never a
// capture face. Mono rigs pass `[canvas]`.
frame?(runtime: Runtime): (views: readonly FrameView[], state: PassState) => LayerFrameVote;

// LayerInstance.d.ts
readonly frame: ((views: readonly FrameView[], state: PassState) => LayerFrameVote) | null;
```

- `galaxyCatalog/frame.ts` and `flow/frame.ts` bind `const ctx = views[0]!` where they read the view today (flow reads none). No new test: the compiler rejects every stale call shape, and the existing hook tests keep their assertions with `[ctx]` in place of `ctx`.

- [ ] Widen the two contract files and the `runFrame` call (`layer.frame(views, state)`); the hook-loop comment says the list is the rig's views with `views[0]` the anchor.
- [ ] Update the two Layer `frame.ts` files and the four test files' call shapes.
- [ ] `npm run typecheck:fast && npx vitest run tests/services/engine/layer tests/services/engine/frame/runFrame.test.ts tests/layers/flow/frame.test.ts tests/layers/galaxyCatalog` → green.
- [ ] Commit: `refactor(layer): the frame hook takes the rig's views`.

---

### Task 2: The Sun and the S-stars become seeded star-catalog rows

**review: yes** (Redux state shape changes on two clusters; pick-id packing)

The registry retype (spec §2.1). `bodies.items` loses `sun` and `s-star` by derivation and `starCatalogs.items` gains `sun` and `sStar`, so the Stars panel grows two toggles and the Bodies-cluster gates in `visibleStars` and `captionFadeRules` re-key — the first §8 behaviour change. Identity is untouched here: a seeded-star pick still resolves through the body row (Task 5 deletes that branch); the row only generalises from `SCENE_STARS` to the seeded-catalog table so the Sun's new index resolves.

**Files:**

- Modify: `src/data/sources/sun.ts`, `src/data/sources/s-star.ts` (retype; `id: 'sStar'`)
- Create: `src/@types/data/starCatalog/StarCatalogRegistryEntry.d.ts`, `src/@types/data/starCatalog/StarCatalogSourceType.d.ts`, `src/@types/data/starCatalog/SeededStarCatalogId.d.ts`; Modify: `src/@types/data/starCatalog/StarCatalogId.d.ts` (derive off the registry entry; the "sole member is gaiaStars" header is false today, rewrite it)
- Create: `src/data/bodies/sceneSun.ts`, `src/data/bodies/seededStarCatalogs.ts`
- Modify: `data/seeds/famous_stars.seed.json` (the Sun row leaves), regenerate with `npm run build-famous-stars` (`src/data/bodies/famousStars.generated.ts`, the Rust const, `public/data/famous_stars_meta.json`)
- Modify: `src/data/bodies/sceneAnchors.ts:20-27`, `src/data/bodies/bodyPickRows.ts` (the `sun` and `s-star` rows leave; header sentence about the Sun goes), `src/data/bodies/bodySearchNames.ts` (the Sun's `['Sun', 'Sol']` joins `AUTHORED`), `src/utils/picking/sceneBodyPickId.ts:15-21` (the exclusion filter is dead: delete it and its comment), `src/utils/picking/starPickId.ts` (walks `SEEDED_STAR_CATALOGS`; the Sun packs `Source.Sun`)
- Modify: `src/services/engine/selection/bodySelectionRow.ts:23-39` (`BODY_SOURCE_CODES` = body rows + every seeded star-catalog code, derived; the seeded branch reads `SEEDED_STAR_CATALOGS[entry.id]`)
- Modify: `src/services/engine/frame/visibleStars.ts` (rewrite: per-source gate, no `GATE_BY_STAR_ID`; header rewritten), `src/services/engine/frame/positionedVisibleStars.ts`, `src/services/engine/frame/frameContext.ts:99`, `src/@types/scene/PositionedStar.d.ts`
- Modify: `src/services/engine/presentation/captionFadeRules.ts:78-89` (`sun` rule keys on `starCatalogs.items.sun`, fade handle `{ kind: 'labelLayer', layer: 'starCatalog', item: 'sun' }`), `src/services/engine/presentation/sceneBodyLabels.ts:189-196` (the famous rows caption as `'star'`, the `SCENE_SUN` row as `'sun'`; no id branch), `src/services/engine/data/createEngineData.ts:34` + `src/@types/engine/data/BodyStore.d.ts:29-38` (`stars`/`setStars` deleted — `visibleStars` walks the tables directly), `src/services/engine/engine.ts:132` (one `engineSourceCountReported` per seeded catalog, counts from `SEEDED_STAR_CATALOGS`)
- Modify: `src/utils/math/galaxyType.ts:96-98` only if the switch stops compiling.
- Test: `tests/data/sources/sStarSource.test.ts` (rewrite for the star cluster), `tests/utils/picking/starPickId.test.ts`, `tests/utils/picking/sceneBodyPickId.test.ts:46`, `tests/services/engine/frame/visibleStars.test.ts`, `tests/components/SettingsPanel/StarsSection.test.ts:32-35`, `tests/hooks/useSplash.test.ts:32-35` (the closed two-key `Record<StarCatalogId, …>` literals gain `sun` and `sStar`), `tests/services/engine/presentation/sceneBodyLabels.test.ts:28-30`, `tests/services/engine/presentation/captionFadeRules.test.ts`, `tests/services/engine/frame/passes/starPointsPass.test.ts:38,220,516,544`, `tests/services/engine/frame/passes/starSpheresPass.test.ts:319`, `tests/services/engine/frame/passes/orbitTrailsPass.test.ts:420`, `tests/services/engine/frame/sceneOccluderSpheres.test.ts:106`, `tests/data/bodies/sceneSStars.test.ts`, `tests/services/engine/selection/composeSelectionRows.test.ts:147-156`

**Interfaces:**

```ts
// src/@types/data/starCatalog/StarCatalogRegistryEntry.d.ts — mirrors GalaxyCatalogRegistryEntry
export type StarCatalogRegistryEntry = Extract<AnyEntry, { readonly type: 'starCatalog' }>;
// StarCatalogId.d.ts / StarCatalogSourceType.d.ts / SeededStarCatalogId.d.ts
export type StarCatalogId = StarCatalogRegistryEntry['id'];            // 'gaiaStars' | 'famousStar' | 'sun' | 'sStar'
export type StarCatalogSourceType = StarCatalogRegistryEntry['code'];  // the numeric twin
export type SeededStarCatalogId = Extract<StarCatalogRegistryEntry, { readonly binBaseName: null }>['id'];

// src/data/sources/sun.ts — type 'starCatalog', code 26 kept, labelLayer 'starCatalog',
// bearsLabel true, binBaseName null, `satisfies SeededStarCatalogSourceEntry`.
// src/data/sources/s-star.ts — id 'sStar', type 'starCatalog', code 28 kept, bearsLabel false,
// binBaseName null.

// src/data/bodies/sceneSun.ts — the Sun's own one-row table (hand-authored StarBody:
// absMag 4.83, colour = temperatureToLinearRgb(5772), surface.datumRadiusM =
// SOLAR_RADIUS_KM * KM_TO_M, reliefM [0, 0]); its anchor is SUN_ANCHOR at the origin.
export const SCENE_SUN: readonly StarBody[];

// src/data/bodies/seededStarCatalogs.ts — total over the seeded ids: a new seeded
// row is a compile error until it has a table. Lives in data (not the Layer) because
// core's slab/occluder seam (`frameContext`, `deriveView`, `sceneOccluderBodies`)
// reads the drawn seeded set — see `visibleStars` below.
export const SEEDED_STAR_CATALOGS: Readonly<Record<SeededStarCatalogId, readonly StarBody[]>>;
// = { famousStar: SCENE_STARS, sun: SCENE_SUN, sStar: SCENE_S_STARS }

// src/@types/scene/PositionedStar.d.ts — the seed coordinates ride the drawn record so
// a pass packs its pick id without an id search (`packSelection(source, seedIndex +
// PICK_SENTINEL_OFFSET)`); Task 5 deletes `starPickId` on the strength of this.
export type PositionedStar = StarBody & {
  readonly positionMpc: Vec3;
  readonly source: StarCatalogSourceType;
  readonly seedIndex: number;
};

// src/services/engine/frame/visibleStars.ts — walks SEEDED_STAR_CATALOGS; a catalog is
// drawn iff `starCatalogs.enabled && starCatalogs.items[id].enabled` (both halves, for
// every seeded source alike — the Sun and the S-stars are ordinary items now).
export function visibleStars(
  settings: StarCatalogSettings,
): readonly (StarBody & { source: StarCatalogSourceType; seedIndex: number })[];
```

- `sceneAnchors`: the anchor list is `[...SCENE_SUN → SUN_ANCHOR, ...FAMOUS_STARS_GENERATED.map(starAnchor), …]` with no per-row `row.id === SUN_ENTRY.id` test; `SUN_ENTRY` keeps zero readers outside the registry.
- `starPickId(id)` becomes the walk over `SEEDED_STAR_CATALOGS` entries (source code from the registry row of each id), so the Sun packs `Source.Sun` for the first time; the body row's seeded branch resolves `SEEDED_STAR_CATALOGS[entry.id][pick.localIdx]` for any `binBaseName: null` star-catalog entry. Both are transitional and leave in Task 5.
- The Sun's seed row leaves `data/seeds/famous_stars.seed.json` (regenerated table, Rust const and meta sidecar follow; the Sun is not a Gaia record, so the bin build is unaffected). `FAMOUS_STAR_IDS` / `FAMOUS_STAR_SEARCH` no longer know the Sun, which is why its search names join `bodySearchNames.ts`' `AUTHORED` list.
- `visibilityActionRow.ts:73-77` and the Stars panel derive over `starCatalogs.items` and grow with it; nothing to edit. `mergeSettingsSnapshot` spreads whole clusters, so a tour snapshot captured before this change restores a `bodies` cluster with a stale `sun` key — harmless (no reader) and self-healing on the next capture; no code or comment for it.
- Tests worth writing (spec §9): `visibleStars` — `it('draws each seeded catalog iff the cluster master and its own item are on')` over the three ids with one star each, and `it('never draws a seeded star when the cluster master is off')`. `starPickId` — the Sun packs `Source.Sun` at index 0, Sirius packs `Source.FamousStar` at its `SCENE_STARS` index, S2 packs `Source.SStar`. Registry — `tests/data/sources/sStarSource.test.ts` asserts `STAR_CATALOG_IDS` contains `sStar` and `sun`, `INITIAL_SETTINGS.starCatalogs.items.sStar.enabled === S_STAR_ENTRY.visible`, and `BODY_IDS` contains neither.

- [ ] Registry: retype the two rows, add the three derived types, re-derive `StarCatalogId`; `npm run typecheck:fast` lists every consumer that breaks — that list is the rest of this task.
- [ ] Data: `SCENE_SUN`, `SEEDED_STAR_CATALOGS`, the seed-JSON edit + regenerate, `sceneAnchors`, `bodyPickRows`, `bodySearchNames`.
- [ ] Engine: `visibleStars` / `positionedVisibleStars` / `frameContext` / `PositionedStar`, `BodyStore.stars` deleted, `starPickId`, `sceneBodyPickId`, the body row's seeded branch, `captionFadeRules.sun`, `sceneBodyLabels`, `engine.ts` source counts.
- [ ] Tests as listed; `npm run typecheck:fast && npx vitest run tests/data tests/utils/picking tests/services/engine/frame tests/services/engine/presentation tests/services/engine/selection tests/components tests/hooks tests/layers/starCatalog` → green.
- [ ] Commit: `feat(stars): the Sun and the S-stars are seeded star-catalog rows`.

---

### Task 3: The Layer forms

Behaviour-neutral. The engine-side move: `layer.ts`, `create`/`destroy`, the Runtime, `frame`, passes, renderers, the cut, slots, the render target, fade rows, the source rows, the Stars section, and the famous-star meta as a Layer fact. The selection row moves too, still with today's `star` arm (Task 5 reshapes it). Everything core hands back through `state.gpu.*` / `EngineAssetSlots` / `ResolveDeps.stars` becomes a Runtime field. Template: the constellations conversion (#795) and `galaxyCatalog`.

**Files:**

- Create: `src/layers/starCatalog/layer.ts`, `create.ts`, `destroy.ts`, `frame.ts`, `@types/StarCatalogRuntime.d.ts`, `@types/StarCatalogFacts.d.ts`, `sources/starCatalogSourceRows.ts`, `load/starCatalogAssetRows.ts`, `present/starCatalogFadeRows.ts`, `present/starCatalogSelectionRow.ts`, `render/starAggregatesTarget.ts`, `render/cut/starSourcesInBand.ts`
- Move (with `npm run move-files`, tests mirror follows): `src/data/sources/{gaia-stars,famous-star,sun,s-star}.ts` → `src/layers/starCatalog/sources/`; `src/services/gpu/renderers/starCatalog/**` → `src/layers/starCatalog/render/` (incl. `cut/`, `starCatalogLayout.ts`); `src/services/gpu/renderers/bodies/{starRenderer,starPointRenderer}.ts` → `render/`; `src/services/gpu/passes/starAggregateUpsample.ts` → `render/`; the six passes `src/services/engine/frame/passes/{starCatalogPass,starAggregatesPass,starAggregateUpsamplePass,starPointsPass,starSpheresPass,fieldStarSpherePass}.ts` → `passes/`; `src/services/loading/slots/{starCatalogSlot,famousStarsMetaSlot}.ts` + `src/services/loading/fetchers/{starCatalogFetcher,famousStarsMetaFetcher}.ts` → `load/`; `src/services/engine/selection/starSelectionRow.ts` → `present/starCatalogSelectionRow.ts`; `src/components/containers/StarsSectionContainer.tsx` + `src/components/SettingsPanel/StarsSection.tsx` → `ui/`; the star-only `utils/star/` helpers stay in `src/utils/star/` (seven of them have core readers — `resolveStarRecord`, `nearestResolvableStar`, `deriveView`, `buildFocusable`, `sStarAppearance`).
- Modify (core rows leave): `src/data/sources.ts:87-93` (the four rows leave `UNFORMED_SOURCE_REGISTRY`; `sourceRecordOf(STAR_CATALOG_SOURCE_ROWS)` joins the spread), `src/services/engine/frame/passes/index.ts:26-73` (six import + row lines), `src/services/gpu/renderTargets.ts:147,199-205` (`star-aggregates` row + `STAR_AGGREGATE_DIVISOR` leave), `src/services/engine/gpuHandles/gpuHandleRegistry.ts:233,248,272,309,317` (five rows leave), `src/@types/engine/handles/EngineGpuHandles.d.ts` (five handles leave), `src/services/engine/engine.ts:25,132,198,206,215,219-220,296-297,383-390` (handle/slot nulls, the source-count report, `resolveDeps().stars`), `src/@types/engine/state/EngineAssetSlots.d.ts:30-37`, `src/services/engine/wiring/assetWiring.ts:69-90,186-193,270-272`, `src/services/engine/wiring/fadeLayers.ts:36-41,91-98`, `src/services/engine/selection/coreSelectionRows.ts:15-22`, `src/@types/engine/ResolveDeps.d.ts:24-29` (`stars` deleted), `src/state/selection/watchFocusTweenSaga.ts:77-87` (the `star` deferral row is deleted now — its probe is `resolveDeps().stars`; D6'1 says the deferral lives at the ref stage in `resolveFocusRefDeferring`, and the row's `decode` returns null until the bin lands — Task 5 finishes the decode), `src/components/SettingsPanel/SettingsPanel.tsx:17,51` (the explicit mount leaves; the section renders through `layerUiContents`), `src/services/engine/frame/runFrame.ts:39-40,344-353,378-384` (the star block leaves; `starFadeAnimating` leaves `shouldKeepTicking`'s inputs and `src/services/engine/helpers/shouldKeepTicking.ts:37,50`)
- Modify: `src/state/engine/engineSlice.ts:46,101-105` (`meta.famousStars` and `engineFamousStarsMetaReported` deleted; `meta` itself if that was its only member), `src/state/engine/selectors.ts:114-115` (`selectFamousStarsMeta` reads `selectEngineFacts(state).starCatalog?.famousStarsMeta ?? []`, exactly as `selectFamousGalaxiesMeta` at :90-91 does)
- Modify: `src/layers/README.md` status paragraph (starCatalog formed; four stubs left)
- Backlog: delete `docs/backlog/2026-07-30-meta-getters-belong-on-the-data-stores.md` and its index line (`docs/BACKLOG.md:64`) — the galaxy half was done, this task does the star half, nothing remains.
- Test: `tests/layers/starCatalog/**` (the mirror of every moved file), `tests/services/engine/frame/frameFilePurity.test.ts` (rows for the moved passes leave), `tests/services/engine/wiring/{assetWiring,fadeLayers,engineSliceDispatches}.test.ts`, `tests/services/engine/gpuHandles/*`, `tests/services/engine/frame/frameOrderBoot.test.ts` (the target now comes from `Layer.targets`), `tests/services/engine/helpers/shouldKeepTicking.test.ts:58,182`, `tests/state/selection/watchFocusTweenSaga.test.ts:187-222` (the star deferral cases move to the ref-stage shape Task 5 completes; here they assert the row is absent), `tests/services/engine/selection/coreSelectionRows.test.ts`, new `tests/layers/starCatalog/frame.test.ts`, `tests/layers/starCatalog/render/cut/starSourcesInBand.test.ts`

**Interfaces:**

```ts
// src/layers/starCatalog/@types/StarCatalogRuntime.d.ts
export type StarCatalogRuntime = {
  /** One slot per survey source (today `EngineAssetSlots.starCatalogs`). */
  readonly catalogs: ReadonlyMap<SourceType, AssetSlot<StarCatalog, StarCatalogReq>>;
  readonly famousStarsMeta: AssetSlot<FamousStarsPayload, void>;
  readonly renderer: StarCatalogRenderer;            // was state.gpu.starCatalogRenderer
  readonly pickRenderer: StarCatalogPickRenderer;    // was state.gpu.starCatalogPickRenderer
  readonly starRenderer: StarRenderer;               // spheres (starSpheresPass, fieldStarSpherePass)
  readonly starPointRenderer: StarPointRenderer;     // starPointsPass
  readonly aggregateUpsample: StarAggregateUpsample; // was state.gpu.starAggregateUpsample
  readonly publish: (patch: Partial<StarCatalogFacts>) => void;
};

// src/layers/starCatalog/@types/StarCatalogFacts.d.ts
export type StarCatalogFacts = { readonly famousStarsMeta: readonly FamousStarMetaEntry[] };

// layer.ts
defineLayer({
  name: 'starCatalog',
  settings: starCatalogLayerSettings,
  sources: STAR_CATALOG_SOURCE_ROWS,          // [GAIA_STARS_ENTRY, FAMOUS_STAR_ENTRY, SUN_ENTRY, S_STAR_ENTRY]
  facts: { famousStarsMeta: [] } as StarCatalogFacts,
  targets: [STAR_AGGREGATES_TARGET],
  create, destroy,
  passes: (runtime) => [ /* the six, in today's FRAME_ORDER names */ ],
  assets: starCatalogAssetRows,
  fades: starCatalogFadeRows,
  selection: (runtime) => [starCatalogSelectionRow(runtime)],
  frame,
  ui: [{ slot: 'main', content: StarsSectionContainer }],
});

// frame.ts — the ONE mutating fade advance; `runFrame`'s star block and its
// `starFadeAnimating` term are deleted with it.
export function frame(runtime: StarCatalogRuntime): (views: readonly FrameView[], state: PassState) => LayerFrameVote;
// body: const awake = advanceStarFades(runtime, state.settings.starCatalogs, views);
//       runtime.renderer.setFrameCut(computeStarCut(runtime, state.settings.starCatalogs, views));
//       return { awake, settling: false };
// `settling: false` because a capture face walks fresh at opacity 1 (`computeStarCut`'s
// capture path), so a mid-fade frame view can never stale a sky bake.

// render/cut/starSourcesInBand.ts — the one home of the anchor derivation + two-part
// source gate that PR 1 left in three copies (advanceStarFades, computeStarCut,
// starCatalogVisible). Loaded survey catalogs whose crossfade at `camDistPc` is > 0.
export function starSourcesInBand(
  runtime: Pick<StarCatalogRuntime, 'renderer'>,
  settings: StarCatalogSettings,
  camDistPc: number,
): readonly { source: SourceType; catalog: StarCatalog; entry: SurveyStarCatalogSourceEntry; crossfade: number }[];
// advanceStarFades / computeStarCut / starCatalogVisible take `runtime` (or the
// renderer) + `state.settings.starCatalogs` in place of `state.gpu.*` reads, and
// call this instead of re-deriving the gate.

// render/starAggregatesTarget.ts — the `star-aggregates` RenderTargetSpec row verbatim
// from renderTargets.ts:199-205, with STAR_AGGREGATE_DIVISOR (= 2) beside it and the
// half-res rationale (renderTargets.ts:46-86) cut to a ≤ 5-line header.
export const STAR_AGGREGATES_TARGET: RenderTargetSpec;

// present/starCatalogSelectionRow.ts — today's starSelectionRow with `ResolveDeps.stars`
// dissolved: `current()` becomes the first entry of `runtime.renderer.loadedCatalogs()`.
export function starCatalogSelectionRow(runtime: StarCatalogRuntime): SelectionKindRow<StarRef>;
```

- `create`: mints the four renderers and the upsample handle through the same factories `gpuHandleRegistry` called (the pick renderer's `pickResources()` reads the renderer it was created after), the survey slots via `createStarCatalogSlot` per survey source, the famous-meta slot which publishes `{ famousStarsMeta }` through `deps.publish` on `ready` and `[]` on `error` (mirror `famousGalaxiesMetaSlot.ts:25-37`), and reports the three seeded counts through `deps.reportSourceCount`. `destroy` releases in reverse construction order.
- `starCatalogAssetRows`: today's `starCatalogRow` per survey source (`assetWiring.ts:82-90`, priority 50, demand = master && item enabled) plus the `famousStarsMeta` row (:186-193).
- `starCatalogFadeRows`: the `starCatalogLabel` row (`fadeLayers.ts:91-98`) with `LABEL_BEARING_STAR_CATALOG_IDS` derived from `STAR_CATALOG_SOURCE_ROWS`.
- Every pass reads its renderer from `runtime`, not `state.gpu`; `starCatalogVisible(runtime, settings, ctx)` stays their shared gate. `starPointsPass`/`starSpheresPass`/`fieldStarSpherePass` still read `state.gpu.bodyPickRenderer` — that is core's, and stays a `state.gpu` read.
- Headers to rewrite: `computeStarCut.ts` (drop "sole owner" wording, point at `starSourcesInBand`), `advanceStarFades.ts` ("`runFrame` calls it" → the Layer's `frame`), `starCatalogVisible.ts`, `starAggregatesPass.ts:14-18`, `runFrame.ts`'s planner comment (the star paragraph goes), `shouldKeepTicking.ts`, `assetWiring.ts`/`fadeLayers.ts` where they name the star rows, `EngineAssetSlots.d.ts:32`.
- Tests: `tests/layers/starCatalog/frame.test.ts` — `it('advances the ramps exactly once per call and hands the renderer one cut')` (a stub renderer with one loaded catalog: two `frame` calls at t=0 and t=50 ms leave one node's opacity at `50/NODE_FADE_MS`, and `setFrameCut` was called twice) and `it('votes settling: false even while a node is mid-fade')`. `starSourcesInBand.test.ts` — one loaded catalog inside its band, one outside: the result holds exactly the first, and an empty result when the master is off. The two `starCatalogVisible` reference-identity tests in `readStarCut.test.ts:575-587` are deleted (spec §9). `tests/state/engine/selectors.test.ts` (or the file that covers `selectFamousGalaxiesMeta`) gains `it('selectFamousStarsMeta is [] before the star Layer publishes and the list after')` — the facts bag is absent for the shell's first frames (memory landmine), so the `?? []` guard is what this test can catch. Every other moved test keeps its assertions — the identity check for the move.

- [ ] `--dry` then real `move-files` for each group above (sources, render, passes, load, selection row, ui); grep `renderers/starCatalog`, `renderers/bodies/star`, `passes/star`, `slots/star`, `famousStarsMeta`, `StarsSection` for stragglers (string paths, `.mts` — `tools/perf/starCutCpuBench.mts` imports the cut).
- [ ] Runtime, facts, `create`/`destroy`, `layer.ts`; the core rows leave (registry spread, passes index, render targets, gpu handles, engine.ts, asset wiring, fade rows, core selection rows, SettingsPanel mount, `ResolveDeps.stars`, the saga's `star` deferral row, `engine.meta.famousStars`).
- [ ] `starSourcesInBand` + the three callers; `frame.ts`; `runFrame`'s star block and `shouldKeepTicking`'s term deleted.
- [ ] Backlog file + index line deleted; README status.
- [ ] `npm run typecheck:fast`, then `npx vitest run tests/layers tests/services/engine tests/services/gpu tests/state tests/components tests/conventions` → green; `npm run build` (the `?static` shader specifiers in the moved renderers are only checked here).
- [ ] Commit: `refactor(stars): the starCatalog Layer forms`.

---

### Task 4: Star-only types move into the Layer's `@types/`

Behaviour-neutral sweep; its own dispatch. Spec §4: the star-only `src/@types/` families move; types core still imports keep core homes.

**Files:**

- Move → `src/layers/starCatalog/@types/`: `src/@types/rendering/PreparedStarCut.d.ts`, `PreparedStarSource.d.ts`, `StarCatalogStreams.d.ts`, `StarNodeStream.d.ts`, `StarFadeState.d.ts`, `StarPickLeafDraw.d.ts`, `StarOctreeIndex.d.ts`, `StarCutFrustum.d.ts`, `StarCutSnapshot.d.ts`, `StarNodeDraw.d.ts` (0 importers — delete instead of moving), `StarAggregateUpsample.d.ts`, `StarPointRenderer.d.ts`, `StarRenderer.d.ts`, `src/@types/rendering/starCatalogRenderer/*.d.ts` (four), `src/@types/rendering/starCatalogPickRenderer/*.d.ts` (two), `src/@types/loading/FamousStarsPayload.d.ts`, `src/@types/data/starCatalog/StarCatalogSourceEntry.d.ts` (0 importers — delete), `SeededStarCatalogSourceEntry.d.ts`, `SurveyStarCatalogSourceEntry.d.ts`, `src/@types/settings/StarCatalogSettings.d.ts`, `StarCatalogItemSettings.d.ts`, and after Task 3 `src/@types/engine/FieldStarInfo.d.ts` only if its readers are all Layer-side (they are not — `buildFocusable` and `refOf` are core; it stays until Task 6 replaces it).
- Keep core homes (core imports them): `StarCatalog`, `StarCatalogId`, `StarCatalogSourceType`, `StarCatalogRegistryEntry`, `SeededStarCatalogId`, `StarCatalogNode`, `StarCatalogReq`, `FamousStarMetaEntry`, `FamousStarRow`, `StarBody`, `SStarSeed`, `PositionedStar`.
- Modify: `src/@types/engine/handles/EngineGpuHandles.d.ts` no longer names any star renderer type after Task 3 — confirm, else the type stays core.

- [ ] For each file: `grep -rl "<TypeName>" src tools` → if every importer is under `src/layers/starCatalog/` (or `tools/`), move it; otherwise it stays and is listed in the commit body as "kept core: imported by X".
- [ ] `npm run move-files -- --manifest <moves.json>` (write the manifest to the scratchpad, `--dry` first), then the verification that actually works (memory landmine): a short script counting exported declarations per `src/layers/starCatalog/@types/*.d.ts` (one each) and grepping for plain value-imports of pure types the tool may have rewritten (`import {` of a `.d.ts` symbol).
- [ ] `npm run typecheck:fast && npx vitest run tests/conventions tests/layers/starCatalog` → green. No new test.
- [ ] Commit: `refactor(stars): star-only types live in the Layer`.

---

### Task 5: Star identity — one `starCatalog` arm for four sources

**review: yes** (camera maths, sagas, the pick contract)

Spec §2.2, §2.5, §6, §7. The `star` arm is replaced by `{ type: 'starCatalog'; source; index }`; the Layer's row decodes all four pick sources; the body row drops the seeded stars; every producer of a body ref for a star id (deep link decode, palette, featured cards) switches to the star arm; the camera keys on `focusDriverId` for the new arm.

**Files:**

- Modify: `src/@types/engine/SelectionRef.d.ts:27-31`, `src/@types/engine/SelectionRow.d.ts:38-49`
- Modify: `src/layers/starCatalog/present/starCatalogSelectionRow.ts` (four `pickSources`; `resolvePick`, `extractRow`, `focusId` per below), `src/services/engine/selection/bodySelectionRow.ts:1-5,23-39,51-58` (`BODY_SOURCE_CODES` = body rows only; the seeded branch deleted; `decode` recognises only ids a registry body row seeds — see `isSceneBodyId` below; header rewritten)
- Create: `src/services/url/encodeStarFocusId.ts`, `src/services/url/decodeStarFocusId.ts`, `src/utils/scene/isRegistryBodyId.ts`; Modify: `src/utils/scene/isSceneBodyId.ts` (deleted — both readers switch to `isRegistryBodyId`), `src/utils/url/decodeFramedPose.ts:23`
- Modify: `src/utils/camera/focusDriverId.ts` (`starCatalog` → `row.id`), `src/services/engine/camera/focusFraming.ts:121-122`, `src/services/engine/camera/pivotRadiusMpc.ts:21`, `src/services/engine/helpers/selectionHaloTable.ts:60-72,109-113`, `src/services/engine/helpers/targetIdentityKey.ts:23`, `src/services/engine/helpers/logCameraState.ts:36-40`, `src/services/url/urlHashFor.ts:36-45`, `src/services/engine/helpers/refOf.ts:37,51` (Task 6 finishes the `FieldStarInfo` half), `src/services/engine/helpers/buildFocusable.ts:54-70` (rename the arm only; Task 6 reshapes the view-model), `src/components/InfoCard/detailCardTable.ts:134-146` (the row key renames; Task 6 swaps the cards)
- Modify: `src/components/CommandPalette/paletteRowModel.ts:47`, `src/components/CommandPalette/utils/rankPaletteMatches.ts:80-95`, `src/components/CommandPalette/utils/actionForRow.ts:74` (star rows), `src/data/palette/featuredTabs.ts:132-135,219-222,432-436` (`focusId: 'star-sun'` ×2, `'star-sirius'`; the card `id`s stay — they key the captured thumbnails)
- Modify: `src/utils/picking/starPickId.ts` (deleted; the passes pack `packSelection(star.source, star.seedIndex + PICK_SENTINEL_OFFSET)` off `PositionedStar`), `src/utils/picking/sceneBodyPickId.ts` (the `starPickId` fall-through goes; returns null for a non-body id), `src/layers/starCatalog/passes/{starPointsPass,starSpheresPass}.ts` (the two `starPickId` sites), `src/services/engine/presentation/sceneBodyLabels.ts` (star captions still ride here until Task 7 — they call the same packing off `visibleStars`' tagged rows)
- Modify: `src/state/selection/watchFocusTweenSaga.ts` (nothing left of `star` here after Task 3 — confirm), `src/state/url/hashParamSources.ts:164` (reads `URL_HASH_FOR` — no edit unless the key renames), `src/data/bodies/famousStarsIndex.ts` header (`buildFocusable` no longer keys on `FAMOUS_STAR_IDS`; `FAMOUS_STAR_IDS` is deleted if the palette chip via `constellationOfBody` is its last reader — keep it if so)
- Boot assert: `src/services/engine/phases/createLayers.ts` is not the place; the Layer's `create` asserts once that no seed id across `SEEDED_STAR_CATALOGS` is all digits (`/^\d+$/`), throwing with the offending id.
- Test: `tests/services/engine/selection/composeSelectionRows.test.ts:141-156,225-236,326-334`, `tests/utils/camera/focusDriverId.test.ts:33`, `tests/services/engine/camera/{focusFraming,pivotRadiusMpc}.test.ts`, `tests/services/engine/helpers/{selectionHaloTable,logCameraState,buildFocusable}.test.ts`, `tests/services/url/urlHashFor.test.ts`, `tests/state/url/hashParamSources.test.ts`, `tests/state/selection/watchFocusTweenSaga.test.ts:187-222`, `tests/state/selectionRows/watchSelectionRowsSaga.test.ts:177-185`, `tests/services/engine/frame/deriveView.test.ts:605`, `tests/services/engine/frame/passes/{near0SelectionRingPass,selectionRingPass}.test.ts`, `tests/utils/picking/*`, `tests/components/CommandPalette/**` (body-row → star-row cases), new `tests/layers/starCatalog/present/starCatalogSelectionRow.test.ts`, `tests/services/url/{encodeStarFocusId,decodeStarFocusId}.test.ts`

**Interfaces:**

```ts
// SelectionRef.d.ts — REPLACES the `star` arm
| { readonly type: 'starCatalog'; readonly source: StarCatalogSourceType; readonly index: number }

// SelectionRow.d.ts — REPLACES the `star` arm
| {
    readonly type: 'starCatalog';
    readonly source: StarCatalogSourceType;
    readonly index: number;        // seed-table index (seeded) or bin-stable record index (Gaia)
    readonly id: string | null;    // durable seed id; null for Gaia
    readonly label: string;
    readonly positionMpc: Vec3;
    readonly radiusM: number;      // seeded: surface.datumRadiusM; Gaia: the nominal solar radius
    readonly absMag?: number;      // Gaia only
    readonly bpRp?: number;        // Gaia only
  }

// A module-local alias wherever a file needs the arm, as galaxyCatalogSelectionRow does:
type StarCatalogRef = Extract<SelectionRef, { type: 'starCatalog' }>;

// src/services/url/encodeStarFocusId.ts
/** `star-<seedId>` for a seeded ref, `star-<index>` for Gaia. */
export function encodeStarFocusId(ref: StarCatalogRef): string;
// src/services/url/decodeStarFocusId.ts
/** All-digits remainder → Gaia `{ source: Source.GaiaStars, index }` ONLY when a survey
 * catalog is loaded (null otherwise: the deep link defers at the ref stage, D6'1);
 * anything else → the seeded catalog whose table holds that id, else null. */
export function decodeStarFocusId(id: string, surveyLoaded: boolean): StarCatalogRef | null;

// starCatalogSelectionRow(runtime)
//   pickSources: [Source.GaiaStars, Source.FamousStar, Source.Sun, Source.SStar]
//   resolvePick: (_entry, pick) => ({ type: 'starCatalog', source: pick.sourceCode, index: pick.localIdx })
//   extractRow(ref, simDays): seeded → the table row + deriveBodyStates(simDays).get(id).positionMpc
//     (the S-stars move; famous stars and the Sun are anchors) + surface.datumRadiusM;
//     Gaia → today's resolveStarRecord path, id null.
//   focusId: claims = startsWith('star-'); decode = decodeStarFocusId(id, catalog loaded);
//     encode = encodeStarFocusId(ref)

// src/utils/scene/isRegistryBodyId.ts — replaces isSceneBodyId for BOTH readers
// (`bodySelectionRow.decode`, `decodeFramedPose`): true iff some BODY_PICK_ROWS table
// seeds `id`. A seeded star is no longer a body id, so `body-sirius` and a `#pose=`
// body arm naming a star decode null (spec §6), while SCENE_BODIES keeps its star rows
// for the camera/occluder readers (adjacent finding, Task 8).
export function isRegistryBodyId(id: string): boolean;

// focusDriverId: `starCatalog` → row.id (null for Gaia). focusFraming / pivotRadiusMpc /
// selectionHaloTable: the `star` case renames and reads `row.radiusM` as before — for
// an S-star that is its real photosphere radius now, not the solar default.
// urlHashFor.starCatalog = encodeStarFocusId; targetIdentityKey.starCatalog = `starCatalog:${source}:${index}`.
```

- Palette: `SCENE_BODIES` still lists the seeded stars, so `rankPaletteMatches`' body scoring would keep producing body refs for them. It scores body rows over `SCENE_BODIES.filter((b) => isRegistryBodyId(b.id))` and gains a star row kind — `{ kind: 'starCatalog'; source; index; star: StarBody; score }` scored over `SEEDED_STAR_CATALOGS` with `FAMOUS_STAR_SEARCH.get(id)?.names ?? [star.label]`; `actionForRow` emits `encodeStarFocusId` for it. Same rows in the palette as today, star identity underneath.
- `composeSelectionRows.test.ts`'s focus-id round-trips gain `star-sirius`, `star-S2`, `star-sun` (seeded, decode with no survey loaded) and keep `star-42` (Gaia, decodes null without a catalog, decodes with one). The boot assert gets one test: a fixture seed table with id `'12'` throws at `create`.
- `watchFocusTweenSaga.test.ts:187-222`: the star cases become "a `star-<index>` link with no bin loaded produces no row and no tween; after the bin commits it selects" — the galaxy-shaped deferral through `resolveFocusRefDeferring`.
- `focusDriverId.test.ts`: the `starCatalog` row → its `id`; a Gaia row → null.

- [ ] The two arms; `typecheck:fast` enumerates the consumers — fix each as listed, no new branches anywhere (every consumer renames its case).
- [ ] The Layer's row (four sources), the body row (body only, `isRegistryBodyId`), the two URL helpers, the boot assert, `starPickId` deleted.
- [ ] Palette rows + `featuredTabs` focus ids; camera / halo / identity-key / hash sites.
- [ ] Tests as listed; `npm run typecheck:fast && npx vitest run tests/layers/starCatalog tests/services/engine tests/services/url tests/state tests/utils tests/components/CommandPalette` → green.
- [ ] Commit: `feat(stars): seeded stars carry star identity — one starCatalog arm, star- deep links`.

---

### Task 6: `StarInfo` and `StarDetailCard`

Spec §2.3, grill Q10. One view-model, one card (plus its compact twin); `BodyDetailCard` loses its star branches.

**Files:**

- Create: `src/layers/starCatalog/@types/StarInfo.d.ts`, `src/layers/starCatalog/@types/StarInfoDetail.d.ts`
- Move: `src/components/InfoCard/FieldStarDetailCard/` → `src/components/InfoCard/StarDetailCard/` (`StarDetailCard.tsx`), `src/components/InfoCard/CompactFieldStarCard/` → `CompactStarCard/`; delete `src/@types/engine/FieldStarInfo.d.ts`
- Modify: `src/services/engine/helpers/buildFocusable.ts` (signature below; the `body` arm loses `orbit`), `src/state/selection/selectors.ts:102,112,122` (the three `buildFocusable` selectors take `selectFamousStarsMeta` as a second input), `src/services/engine/helpers/refOf.ts`, `src/@types/engine/FocusableTarget.d.ts` (the union member renames), `src/@types/engine/BodyInfo.d.ts` (`orbit?` deleted — only S-stars had one) + `src/@types/engine/BodyOrbitInfo.d.ts` (rename to the Layer's `@types/StarOrbitInfo.d.ts` if nothing core reads it after this task, else keep), `src/data/bodies/sStarOrbitInfo.ts` (its reader is now the star arm)
- Modify: `src/components/InfoCard/BodyDetailCard/BodyDetailCard.tsx:53,98-101,116,212-228,247-320` (famous eyebrow, meta lookup, orbit block, the famous panel and the `FAMOUS_STAR_IDS` import go; `famousStarsMeta` prop goes), `src/components/containers/BodyDetailCardContainer.tsx:28-38` (drops the meta selector), `src/components/InfoCard/detailCardTable.ts:134-146`
- Test: `tests/components/InfoCard/FieldStarDetailCard.test.tsx` → `StarDetailCard.test.tsx` (one case per `detail.kind`), `tests/components/InfoCard/BodyDetailCard.test.tsx` (star cases deleted), `tests/components/containers/BodyDetailCardContainer.test.tsx`, `tests/services/engine/helpers/buildFocusable.test.ts` (shape per source — spec §9)

**Interfaces:**

```ts
// @types/StarInfo.d.ts — replaces FieldStarInfo
export type StarInfo = {
  readonly type: 'starCatalog';
  readonly source: StarCatalogSourceType;
  readonly index: number;
  readonly id: string | null;
  readonly displayName: string;          // seed label; 'Field star' for Gaia
  readonly x: number; readonly y: number; readonly z: number;
  readonly distancePc: number;
  readonly radiusM: number;
  readonly detail: StarInfoDetail;
};

// @types/StarInfoDetail.d.ts — keyed by SHAPE, not source
export type StarInfoDetail =
  | { readonly kind: 'photometry'; readonly absMag: number; readonly apparentMag: number;
      readonly bpRp: number; readonly spectralClass: string }            // Gaia: today's FieldStarInfo fields
  | { readonly kind: 'curated'; readonly meta: FamousStarMetaEntry }     // famous star with a sidecar entry
  | { readonly kind: 'orbit'; readonly orbit: BodyOrbitInfo }            // S-star: today's sStarOrbitInfo(id)
  | { readonly kind: 'none' };                                           // the Sun; a famous star whose meta has not landed

// buildFocusable — the shell join the galaxy card already does at the selector
export function buildFocusable(
  row: SelectionRow | null,
  famousStarsMeta: readonly FamousStarMetaEntry[],
): FocusableTarget | null;
// starCatalog arm: detail = Gaia → photometry; row.id with a meta entry → curated;
// sStarOrbitInfo(row.id) defined → orbit; else none. Source is not consulted.
```

- `StarDetailCard` renders the header rows every star shares (name, distance, position) and then `detail` by `kind`: `photometry` = today's `FieldStarDetailCard` body; `curated` = the famous panel moved verbatim from `BodyDetailCard.tsx:247-320`; `orbit` = the orbit rows moved from `:212-228`; `none` = nothing. The compact twin shows name + distance only.
- `buildFocusable.test.ts`: `it.each` over four rows (Gaia, Sirius with meta, S2, the Sun) asserting `detail.kind` in order `photometry`, `curated`, `orbit`, `none`; and Sirius with an empty meta list → `none`.

- [ ] Types, `buildFocusable` + the three selectors, `refOf`, `FocusableTarget`.
- [ ] `move-files` the two card folders, rewrite the cards, trim `BodyDetailCard` + its container, `detailCardTable`.
- [ ] Tests; `npm run typecheck:fast && npx vitest run tests/components tests/services/engine/helpers tests/state/selection` → green.
- [ ] Commit: `feat(stars): one StarInfo and one StarDetailCard for every star`.

---

### Task 7: Captions and orbit trails come from the Layer's guides

Spec §5 and §2.4. The seeded-star captions leave `sceneBodyLabels` for a Layer `screenLabels` producer on the NEAR0 slab; the S-star conics leave `CORE_TRAIL_ELEMENTS` for `guides.orbitTrails`. Pixel-identical by construction: the roster equals the old table in the old order, and the caption set is the same set registered after core's (which the equal-prominence tiebreak wants — `runBootstrapPhases` runs after `engine.ts:351`'s core registration).

**Files:**

- Create: `src/layers/starCatalog/present/produceStarCaptions.ts`, `src/layers/starCatalog/present/starCaptionKinds.ts`, `src/data/bodies/sStarOrbitalElements.ts`, `src/utils/labels/bodyCaption.ts` (the `bodyLabel` helper extracted from `sceneBodyLabels.ts` so both producers build one `ForegroundCaption` shape)
- Modify: `src/layers/starCatalog/layer.ts` (`guides`), `src/services/engine/presentation/sceneBodyLabels.ts:44-54,104-106,189-196` (the star rows, `SCENE_STAR_LABEL_IDS`, the `SUN_ENTRY` import leave; header rewritten: core captions Earth, planets, Sgr A\*, mesh bodies), `src/data/bodies/orbitalElements.ts:16-17,709-712` (spreads `S_STAR_ORBITAL_ELEMENTS`), `src/data/bodies/coreTrailElements.ts` (excludes them by reference), `src/data/bodies/orbitReachByRegion.ts` (computes over the non-mesh `ORBITAL_ELEMENTS`, not `CORE_TRAIL_ELEMENTS`, so the galactic-centre reach is unchanged; header says why — the roster-derived form is the backlog item)
- Test: `tests/services/engine/presentation/sceneBodyLabels.test.ts` (count = Earth + planets + Sgr A\* + mesh bodies), new `tests/layers/starCatalog/present/produceStarCaptions.test.ts`, `tests/services/engine/phases/createLayers.composition.test.ts` (no change — roster composition is already covered), `tests/data/bodies/sceneOrbitConics.test.ts` (the conic table no longer holds S-star rows — assert it), `tests/data/bodies/orbitReachByRegion*.test.ts` if one exists

**Interfaces:**

```ts
// src/data/bodies/sStarOrbitalElements.ts — declared ONCE; read by orbitalElements.ts
// (positions, import-time) and by the Layer's guides (trails). Body's ground prep
// composes positions at boot; the rows already sit where it needs them.
export const S_STAR_ORBITAL_ELEMENTS: readonly OrbitalElements[];   // = S_STAR_SEEDS.map(sStar)

// coreTrailElements.ts — ORBITAL_ELEMENTS minus mesh bodies minus S_STAR_ORBITAL_ELEMENTS (by reference)

// present/starCaptionKinds.ts — total over the seeded ids; null = no caption
export const STAR_CAPTION_KIND: Readonly<Record<SeededStarCatalogId, CaptionKind | null>>;
// = { famousStar: 'star', sun: 'sun', sStar: null }   (S-stars are uncaptioned today — unchanged)

// present/produceStarCaptions.ts — the NEAR0 screenLabels producer; walks visibleStars'
// tagged rows, skips null kinds, packs the pick id off (source, seedIndex).
export function produceStarCaptions(runtime: StarCatalogRuntime): Label2DProducer['produceLabels'];

// layer.ts
guides: (runtime) => ({
  screenLabels: [{ slab: NEAR0, id: 'starCaptions', produceLabels: produceStarCaptions(runtime) }],
  orbitTrails: S_STAR_ORBITAL_ELEMENTS,
}),
```

- `produceStarCaptions.test.ts`: `it('captions every drawn famous star and the Sun with their kinds, and no S-star')` — one star per seeded table, all items on: two captions, kinds `star` and `sun`, pick ids `packSelection(Source.FamousStar, OFFSET)` and `packSelection(Source.Sun, OFFSET)`; and `it('drops a catalog's captions with its item toggle')`.
- `sceneOrbitConics.test.ts`: `it('holds no S-star conic — those are the star Layer's')`.

- [ ] `S_STAR_ORBITAL_ELEMENTS`, `orbitalElements.ts`, `coreTrailElements.ts`, `orbitReachByRegion.ts`.
- [ ] `bodyCaption` extracted; `produceStarCaptions` + `STAR_CAPTION_KIND`; `sceneBodyLabels` trimmed; `layer.ts` guides.
- [ ] Tests; `npm run typecheck:fast && npx vitest run tests/layers/starCatalog tests/services/engine/presentation tests/data/bodies tests/services/engine/frame/passes/orbitTrailsPass.test.ts tests/services/engine/phases` → green.
- [ ] Commit: `feat(stars): captions and S-star trails come from the Layer's guides`.

---

### Task 8: Docs and backlog

Spec §10, §13. Docs ride the PR.

**Files:**

- Modify: `src/layers/README.md` (status: `starCatalog` formed; `body`, `milkyWay`, `structure`, `volume` remain), `docs/superpowers/specs/2026-09-09-layer-composition-design.md:998-1002` (D6'3's example corrected with a pointer to the star spec §7) and `:1313` (§10(e): `starCatalog` done)
- Modify: `docs/BACKLOG.md:55` (delete — consumed by Task 2/5) and delete `docs/backlog/2026-07-29-near-field-stars-body-vs-star-domain.md`; `docs/BACKLOG.md:154` ("Star-picking deferred edge: star deep link waits forever with Gaia disabled") — re-read against D6'1 as landed in Task 5; delete it if a `star-<index>` link now simply stays unresolved with no waiter (the spec's outcome), else leave it.
- Create: `docs/backlog/2026-09-22-stars-still-in-the-body-tables.md` + index line (`needs-design`): `SCENE_BODIES` keeps the seeded stars for the camera/occluder readers (`cameraDrivers.ts:166`, `bodyHomePose.ts:77`, `sceneCelestialBodies.ts`, `selectionHaloTable.ts:101`, `focusFraming.ts:113`, `approachTiltedPose.ts:48`, `watchFlyToLonLatSaga.ts:73`), so a star id still answers `findByIdOrThrow(SCENE_BODIES, …)` through `focusDriverId`; `ORBIT_REACH_BY_REGION` is computed from the static non-mesh table rather than `state.orbitTrailRows`. Both resolve when the body Layer forms and positions/reach compose at boot.
- Create: `docs/backlog/2026-09-22-debug-reflective-sphere-sky-capture.md` + index line (`ready`, DebugPanel): a debug-only mirror sphere in Earth orbit that samples the sky cubemap, so the capture roster (stars, the Milky Way band, aggregates) can be eye-checked without flying to the Sgr A\* lens — today the lens is the cubemap's only consumer (`sgrAStarLensingRenderer.ts`, `skyCubemapBlitPass.ts`).
- The memory landmine spec §13 names (seed-table ordering; the two tables are never merged) is restated in `starCatalogSelectionRow.ts`'s header, where `starPickId`'s header used to carry it.

- [ ] README, parent spec, backlog deletions and the two new items.
- [ ] `npx vitest run tests/conventions tests/services/engine/frame/frameFilePurity.test.ts` → green (the README edit is a `src/layers/` entry the purity sweep walks).
- [ ] Commit: `docs(stars): starCatalog Layer formed — backlog and spec updates`.

---

## Definition of Done

**Deliverable inventory**

- `src/layers/starCatalog/` has `layer.ts`, `create.ts`, `destroy.ts`, `frame.ts`, `sources/` (four rows + `starCatalogSourceRows.ts`), `load/`, `passes/` (six), `render/` (four renderers, the upsample, `cut/`, `starAggregatesTarget.ts`), `present/` (fade rows, selection row, captions, caption kinds), `ui/`, `@types/` (`StarCatalogRuntime`, `StarCatalogFacts`, `StarInfo`, `StarInfoDetail` + the moved star-only types); `state/` unchanged in shape.
- No `state.gpu.starCatalogRenderer` / `starCatalogPickRenderer` / `starRenderer` / `starPointRenderer` / `starAggregateUpsample`; no `EngineAssetSlots.starCatalogs` / `famousStarsMeta`; no `ResolveDeps.stars`; no `engine.meta.famousStars` / `engineFamousStarsMetaReported`; `runFrame` has no star block and `shouldKeepTicking` no `starFadeAnimating`.
- `Layer.frame` receives `views: readonly FrameView[]`.
- `SUN_ENTRY` and `S_STAR_ENTRY` are `SeededStarCatalogSourceEntry` rows with codes 26 and 28; `StarCatalogId` has four members; `BodyId` has neither `sun` nor `s-star`; `SEEDED_STAR_CATALOGS` is total over `SeededStarCatalogId`; `SCENE_SUN` exists and `SCENE_STARS` holds no Sun.
- `SelectionRef`/`SelectionRow` have a `starCatalog` arm and no `star` arm; `starPickId`, `FieldStarInfo`, `FieldStarDetailCard`, `CompactFieldStarCard`, `GATE_BY_STAR_ID`, `isSceneBodyId`, `BodyStore.stars` do not exist.
- `encodeStarFocusId` / `decodeStarFocusId` exist; the Layer's `create` throws on an all-digits seed id.
- `S_STAR_ORBITAL_ELEMENTS` is imported by `orbitalElements.ts` and the Layer's `guides`, and by nothing else; `CORE_TRAIL_ELEMENTS` holds no S-star row.
- Backlog: the two consumed items deleted, the two new items filed; README and parent spec updated.

**Observable behaviours (manual pass on the main app, user's eyes)**

- Stars panel: four item rows — Gaia Stars, Famous Star, Sun, S-Star; each toggle hides exactly its own stars (the Sun stays when Famous Star is off; the S-star dots at Sgr A\* go with S-Star); the cluster master hides all four.
- Clicking Sirius, the Sun, S2 and a Gaia field star each opens `StarDetailCard` with the eyebrow "Star" and, respectively, the curated panel, nothing, the orbit rows, the photometry rows; the compact card shows name + distance. Earth and Mars still open `BodyDetailCard` with no star rows.
- Deep links `#focus=star-sirius`, `#focus=star-S2`, `#focus=star-sun` select and frame; `#focus=body-sirius` does nothing; a `#focus=star-<index>` link selects once the Gaia bin lands (and never before).
- The two Sun cards and the Sirius card in the featured palette tabs still focus their star; palette search "Sirius" / "Alpha Canis Majoris" / "Sol" / "S2" each returns the star row and focusing it opens the star card.
- Camera: focusing S2 follows its orbit; the approach tilt does not engage on a star; the selection ring wraps a seeded star's photosphere on close approach.
- Captions: famous-star names and "Sun" draw as before with their label toggles; S-stars stay uncaptioned; the Famous Star label toggle and the tour label cues still fade them.
- Orbit trails: the 39 S-star conics draw at Sgr A\* exactly as before; the Labels & Guides toggle still fades them.
- Gaia: the LOD dissolve on approach and retreat is unchanged; the sky cubemap seen through the Sgr A\* lens still shows stars and aggregates; hover-pick on a star still works; the render loop goes idle after a fade completes.
- `npm run build` passes.

**Deferral boundary**

- Sun-specific rendering, boot-composed positions, a row `sampleMpc` sampler, two-arm selection, `gaia:`/`star:` prefixes (spec §11).
- `SCENE_BODIES` keeps the seeded stars and `ORBIT_REACH_BY_REGION` stays table-derived (backlogged in Task 8). `visibleStars` / `positionedVisibleStars` / `partitionStarsByResolution` stay in core's `frame/` (the slab-range and occluder seam reads them from `frameContext`/`deriveView`/`sceneOccluderBodies` before any Layer hook runs) — a deviation from spec §4's `render/` row, recorded here.
- The v1 sprite-star bag; the Rust famous-star const's consumers beyond regeneration.
- No deletion audit until `/feature-done`; no perf gate.
