# The `blackHoles` Layer — design spec

Decisions ledger: [`docs/grill-sessions/black-holes-layer-2026-09-22.md`](../../grill-sessions/black-holes-layer-2026-09-22.md) (Q1–Q12, the post-merge reconcile, and the refactor-ground checkpoint R13–R16, signed off 2026-09-22). This spec does not re-litigate those calls; it specifies how they land in code. Cited as "grill Qn" / "R n".

Parent: [`2026-09-09-layer-composition-design.md`](2026-09-09-layer-composition-design.md). Everything it says about the `Layer` contract, `createLayers`, facts, selection rows and focus ids holds unless a section below says otherwise. Two rulings of the shipped starCatalog spec ([`completed/2026-09-21-star-catalog-layer-design.md`](completed/2026-09-21-star-catalog-layer-design.md) :27 "`Source.SgrAStar` stays a body", :174 "core keeps the Sgr A\* caption") are reversed here (§8).

## 1. What this is

`src/layers/blackHoles/` is a new Layer that owns **Sagittarius A\***: its identity, search row, selection arm and InfoCard, its far-field marker, its lensing pass and the metre-frame slab the lens draws on, its tuning slice and DebugPanel section. Today those are spread over the body pipeline as a one-member `AnchorPointBody` table, an id branch in four core files, a pick stamp inside the star Layer's pass, and a tuning slice under `layers/body/state/`.

Three things change beyond a move:

- **A black hole is not a body.** `sgr-a-star` becomes a `blackHole` `SelectionRef` arm with its own `blackhole-` URL prefix; `AnchorPointBody`, `SCENE_ANCHOR_POINT_BODIES` and the `'sgr-a-star'` key in `BODY_PICK_ROWS` are deleted (grill Q3, Q9).
- **The galactic centre is a place, not the hole.** `'galactic-centre'` is a core `SCENE_ANCHORS` row that the milkyWay pass, the S-star orbits, `BODY_REGIONS` and the fade bands read; the Layer contributes the object sitting there (grill Q2, R15).
- **Five contract seams open**, each a named member a future Layer honours the same way: `search`, `sourceCounts` (async iterables), `slabs` (static rows), `SelectionRow.driver`, and a `detailCard` `ui` slot (grill Q4, Q7, Q12; R13, R14).

Packaging (grill Q11, R16): **two PRs**. PR 1 is ground preparation, six behaviour-neutral commits (§3). PR 2 is the Layer (§4–§7). Each gets its own plan. No deletion audit on PR 1; one at PR 2's `/feature-done`.

## 2. Data delta

Contract shapes only. Files are named where the name is the contract.

### 2.1 Registry

`SGR_A_STAR_ENTRY` retypes from `body` to `blackHole` — a new `SourceEntry` kind beside `body`/`structure`/`starCatalog`/`milkyWay`/`volume` — keeping `Source.SgrAStar = 27`, its `label: 'Galactic Centre'`, `detailLabel` and the search aliases now in `bodySearchNames`. The row moves to `src/layers/blackHoles/sources/sgrAStar.ts`; `data/sources.ts` folds it by import as it does every Layer's rows. Its `visible`/`labelEnabled` flags leave `settings.bodies.items` for the Layer's own settings slice — one more visibility key for `docs/backlog/2026-09-21-derive-settings-snapshot.md`.

`BlackHoleRow.bodyId: BodyId` becomes `id: BlackHoleId`, derived from the `type: 'blackHole'` registry rows the way `BodyId` is from `body` rows. The row gains the marker's data — `glintTint`, and `band: 'sgrAStarLensing'` — so a second hole is a second row with its own band and tint, never a second branch (grill Q8). `BLACK_HOLES` moves to `src/layers/blackHoles/data/blackHoles.ts`.

```ts
export type BlackHoleRow = {
  readonly id: BlackHoleId;
  readonly anchorId: PlaceId;                 // where it sits — a core place
  readonly massSolar: number;                 // r_s = schwarzschildRadiusM(massSolar)
  readonly band: FadeBand;                    // lens open / marker fading, one band (SCALE_FADE_BANDS.sgrAStarLensing)
  readonly glintTint: Vec3;
  readonly standoffRadii: number;             // 2.0
  readonly focusDistanceRadii: number;        // 30.4
  readonly emission: { … as today … };
};
```

### 2.2 The place anchor (core)

```ts
// src/@types/scene/PlaceId.d.ts — authored place anchors that are not bodies
export type PlaceId = 'galactic-centre';
// src/data/places/galacticCentre.ts — the SCENE_ANCHORS row, RA/Dec/distance moved from sceneSgrAStar.ts
export const GALACTIC_CENTRE_ANCHOR: AnchorBody = { id: 'galactic-centre', positionMpc };
```

`sceneAnchors.ts` lists it in place of `SGR_A_STAR_ANCHOR`; `BODY_REGIONS['galactic-centre'].anchorId`, `galacticCenter.ts`' `MILKY_WAY_CENTER_WORLD` and `scaleFadeBands.ts`' R₀ read it. `deriveBodyStates` therefore carries a `'galactic-centre'` state, which is what `ctx.bodyPose('galactic-centre')` poses the slab from. The S-stars' `focusId` stays a selection concern (§2.3).

### 2.3 Selection

```ts
// src/@types/engine/SelectionRef.d.ts — seventh arm
| { readonly type: 'blackHole'; readonly id: BlackHoleId }
// FocusableTarget gains BlackHoleInfo { type: 'blackHole'; id; label; detailLabel; positionMpc; schwarzschildRadiusM; massSolar }
```

The Layer's `SelectionKindRow` (`present/blackHoleSelectionRow.ts`): `pickSources: [Source.SgrAStar]`; `resolvePick` maps `localIdx` → `BLACK_HOLES[i]`; `extractRow` poses from `deriveBodyStates(simDays).get(row.anchorId)`; `focusId` = `{ claims: startsWith('blackhole-'), decode, encode }` giving `#focus=blackhole-sgr-a-star`, no legacy `body-sgr-a-star` alias (grill Q9); and

```ts
// on the extracted SelectionRow:
driver: { poseId: row.anchorId, boundingRadiusM: rS, footprintRadiusM: blackHoleFootprintRadiusM(row),
          groundRadiusM: rS, standoffRadii: row.standoffRadii, focusDistanceRadii: row.focusDistanceRadii },
```

`driver` travels on the extracted row rather than as a `SelectionKindRow` method so the five focus-generic camera readers (`cameraDrivers`, `approachTiltedPose`, `focusFraming`, `selectionHaloTable`, `pivotRadiusMpc`) stay pure functions of the row — no resolver threaded through them. The three readers that take a *body id* by contract (`bodyHomePose`, `watchFlyToLonLatSaga`, `bodyRung`: go-home, fly-to-lon/lat, surface rung) keep reading `SCENE_BODIES`. `poseId` is a `deriveBodyStates` key — a `SlabHostId` when a slab row names it (Earth, the hole), a seeded star's id when none does — so it is `string | null`, not `SlabHostId`, null for a survey star (which has no id; the camera then holds its base pose, as today); whether the camera engages a metre frame is the slab table's answer, not the driver's. `blackHoleFootprintRadiusM(row)` (= `LENS_QUAD_MAX_RS × rS`) is the one home for the quad's extent; the slab row (§2.5) reads the same helper.

Core gains one row each in `URL_HASH_FOR`, `targetIdentityKey` and `focusFraming` (the `blackHole` case delegates to `bodyLikeFraming` with `radiusM` + `focusDistanceRadii`, as `star` does). The 39 S-stars' `focusId: 'sgr-a-star'` (`makers/sStar.ts:57`) becomes `'blackhole-sgr-a-star'`; the two featured cards (`featuredTabs.ts:153-157, 418-422`) follow.

### 2.4 The contract

```ts
// src/@types/engine/layer/Layer.d.ts — additions
/** Palette rows. Each yield REPLACES the Layer's previous snapshot; a static Layer yields once. */
search?(runtime: Runtime): AsyncIterable<readonly LayerSearchEntry[]>;
/** Per-source counts on the same terms; replaces `LayerCoreDeps.reportSourceCount`. */
sourceCounts?(runtime: Runtime): AsyncIterable<SourceCountReport>;
/** Metre-frame hosts this Layer draws on. Static data: nothing in a row needs runtime (R13). */
readonly slabs?: readonly SlabRow[];

// src/@types/engine/layer/LayerSearchEntry.d.ts
export type LayerSearchEntry = { id: string; names: readonly string[]; ref: SelectionRef; class: 'primary' | 'catalog' };
// src/@types/engine/layer/SourceCountReport.d.ts
export type SourceCountReport = { source: SourceType; count: number };

// src/@types/engine/SelectionRow.d.ts — every arm gains the field, filled by its `extractRow` (R14)
readonly driver: DriverGeometry;   // DrivenSelectionRow arms only; readers: selectionDriver(row)
// src/@types/engine/camera/DriverGeometry.d.ts
export type DriverGeometry = {
  poseId: string | null;        // deriveBodyStates key; null when the focus poses from no table (a survey star)
  boundingRadiusM: number;      // pivot floor for a groundless driver (mesh hull, hole)
  footprintRadiusM: number;     // framing / halo / approach distance
  groundRadiusM: number | null; // null = no surface to taper against (mesh bodies)
  standoffRadii: number;
  focusDistanceRadii?: number;
};

// src/@types/engine/layer/LayerUiSlots.d.ts — fourth slot (grill Q12)
detailCard: { readonly type: FocusableTargetType; readonly Detail: DetailCard; readonly Compact: CompactCard };

// src/@types/engine/layer/LayerCoreDeps.d.ts
− readonly reportSourceCount
```

`class` is the ranker's existing distinction: `primary` rows get `PRIMARY_TIEBREAK` and no cap, `catalog` rows are capped at `MAX_*_RESULTS`. The three loaded palette inputs that already cross the store (`famousGalaxiesMeta`, `aliasIndex`, `structureSearchList`) and the six static ones (`MILKY_WAY_NAMES`, `SCENE_BODIES`, seeded stars, exhibits, tours, `EARTH_PLACES`) keep their paths in this feature and are named in the contract doc as intended tenants.

### 2.5 The slab row

```ts
// src/@types/engine/frame/SlabRow.d.ts — core builds these too (bodySlabRowOf), so no "Layer" prefix
export type SlabRow = {
  readonly anchorId: SlabHostId;      // pose = ctx.bodyPose(anchorId); also the row's host identity
  readonly drawRadiusM: (distM: number, pxPerRad: number) => number; // outermost drawn extent for this view, far edge and both culls
  readonly footprintRadiusM: number;  // occupied solid sphere, near edge / cull (today bodyFootprintRadiusM)
  readonly activeBand?: FadeBand;     // row exists only while fadeBand(activeBand, |cam − anchor|) > 0
  readonly source: 'foreground' | 'lens';  // which frame-graph line consumes the row
};
// src/@types/engine/frame/SlabHostId.d.ts
export type SlabHostId = BodyId | PlaceId;
// SlabFrame.d.ts
| { kind: 'body-m'; hostId: SlabHostId }   // was bodyId: BodyId (R15)
```

Camera fields are deliberately absent: driving the camera (§2.4 `driver`) and hosting a metre frame vary independently — seeded stars drive without a slab, S-star riders draw on a slab without driving (R14, amending grill Q7's seven-field row). Core keeps: the frame-graph lines and their order, painter order, the capacity ceiling. A Layer needing a new *line* edits core frame data, as every pass name does. Riders (the backlogged S-star lensing, a landing site) are passes on the consuming line filtering `view.slab.frame.hostId`; no contract field.

The Layer's row: `{ anchorId: 'galactic-centre', drawRadiusM: sgrAStarLensEnvelopeM, footprintRadiusM: blackHoleFootprintRadiusM(row), activeBand: SCALE_FADE_BANDS.sgrAStarLensing, source: 'lens' }`, one per `BLACK_HOLES` row. `activeBand` is the **only** gate on the lens step: the row exists iff the band is open, so the pass drops today's own `skyCaptureBandAlpha('sgrAStar') > 0` check (`sgrAStarLensingPass.ts:45`) — one fact, one reader. The core capture row holds the same band object (`cubemapCaptures.ts:32`), by reference, not a copy.

### 2.6 Store

`state.engine.layerSearch: Record<string, readonly LayerSearchEntry[]>` keyed by Layer name, whole-snapshot replace per yield; `selectLayerSearchRows` flattens. The key is not deleted at teardown in PR 1 — zero tenants, so a stale row after engine teardown is unreachable; PR 2 adds the delete with the first tenant. `sourceCounts` keeps today's `engineSourceCountReported` action and `sourceCounts` map — three sagas pulse on the action (`watchTierSaga.ts:80`, `watchSelectionRowsSaga.ts:72`, `resolveFocusRefDeferring.ts:19`) and `createLayers`' `contentVersion` bump and `engineStatusChanged` side effects move into the consuming saga unchanged. The Layer's settings: `layers/blackHoles/state/lensingTuning/` (today's `sgrAStarLensingTuning` slice, key renamed) plus the source row's `visible`/`labelEnabled`.

## 3. Ground preparation — PR 1

Six commits, behaviour-neutral, in this order (R16). Each names its ratchet.

1. **`search` + `sourceCounts`.** `runLayerFeedSaga` saga (`call(next)` loop, `put` per yield, `it.return()` on cancel; one instance per member per Layer, started beside `Layer.sagas` in `createLayers`, cancelled with them at `engine.ts:459`); `utils/async/callbackIterable.ts` (callback → async iterator, ≈10 lines, own test); `layerSearch` slice key, reducer and selector; `rankPaletteMatches` gains a fifth input scored by `class`; `wireGalaxyCatalogSourceSlot.ts:65`, `starCatalogSlot.ts:41` and `starCatalog/create.ts:88` migrate to `sourceCounts`; `reportSourceCount` deleted; `layerImportBoundary.test.ts:194`'s message updated. Zero `search` tenants until PR 2. Plan-time check: the saga `put` is a microtask later than today's synchronous dispatch — assert the three pulse sagas see the same ordering (`project_landmines_state`: saga puts late).
2. **`Layer.slabs`.** `SlabRow`, `SlabHostId`, `hostId` rename (`npm run refactor rename`, 19 files); `bodySlabRowOf(body)` adapter so store-fed Earth/planets/hostless meshes stay per-frame; composed candidates `[...storeBodies.map(bodySlabRowOf), ...activeLayerRows]` with Sgr A*'s row still in core (`CORE_SLAB_ROWS`); `bodySlabRow` reads the row; `visibleSlabBodies.ts` reads `drawRadiusM`; `bodyRowSlabs.lens` = active rows naming `'lens'`; `SLAB_HOST_IDS` stays a module-load set (read by `HOSTLESS_MESH_BODIES` at module load — Layer rows cannot host a mesh until the body Layer forms); `BODY_SLAB_CAPACITY`/`MAX_GLINTS` become a ceiling constant (the GPU query set is sized before Layers exist, `gpuTimingService.ts:113`) + a boot assert in `createLayers`.
3. **`SelectionRow.driver`.** Every arm's `extractRow` fills it (`body` from `SCENE_BODIES` via `bodyDriverGeometry`, `starCatalog` from `radiusM`, the other arms carry no field; readers go through `selectionDriver`); the five focus-generic readers (`cameraDrivers.ts:111,166`, `approachTiltedPose.ts:45-57`, `focusFraming.ts:109-115`, `selectionHaloTable.ts:101`, `pivotRadiusMpc.ts:24-60`) read `row.driver`; `focusDriverId.ts` deleted. `bodyHomePose`, `watchFlyToLonLatSaga`, `bodyRung` take a body id by contract and stay on `SCENE_BODIES`. Amends `docs/backlog/2026-09-22-stars-still-in-the-body-tables.md` (reader half resolved; the `SCENE_BODIES` listing half stays).
4. **`'galactic-centre'` + `PlaceId`.** `GALACTIC_CENTRE_ANCHOR` in core, `SCENE_ANCHORS`/`BODY_REGIONS`/`galacticCenter.ts`/`scaleFadeBands.ts` re-pointed, the core Sgr A* slab row's `anchorId` and `sgrAStarLensingPass.ts:29,42,52`'s filter flipped. After 2 so the pose key changes at one field.
5. **`detailCard` slot.** `LayerUiSlots.detailCard` + the generic fold (`layerUiContents`); `DETAIL_CARD` becomes five core arms + composed Layer entries, asserted total at boot; `ZoneOfAvoidanceDetailCard/` and `CompactZoneOfAvoidanceCard/` move to `layers/zoneOfAvoidance/ui/` via `move-files`, the ZoA Layer contributes them.
6. **Docs.** Amendment note on the starCatalog spec :27/:174; backlog amendments (§8); `src/layers/README.md` table rows for the new members.

## 4. The Layer — PR 2

```
src/layers/blackHoles/
  layer.ts            name 'blackHoles'; settings; sources; targets: [SKY_CUBEMAP_TARGET]; slabs; ui
  create.ts destroy.ts   own sgrAStarLensingRenderer + own bodyGlintRenderer instance (grill Q8)
  data/blackHoles.ts     BLACK_HOLES rows (§2.1)
  sources/sgrAStar.ts    the registry row, type 'blackHole'
  state/lensingTuning/   {slice,initialState,selectors}.ts, state/slices.ts
  passes/blackHoleLensingPass.ts   'black-hole-lensing' on the 'lens' line; filters frame.hostId === row.anchorId
  passes/blackHoleMarkerPass.ts    'black-hole-marker' on the glint line; marker + pick surface
  present/blackHoleSelectionRow.ts  §2.3
  present/blackHoleCaption.ts       guides.screenLabels row (grill Q5)
  ui/BlackHoleDetailCard/ ui/CompactBlackHoleCard/ ui/LensingTuningSection*.tsx
  @types/BlackHolesRuntime.ts, BlackHoleRow.ts, BlackHoleInfo.ts
```

- **Marker** (grill Q8): one additive billboard per row at the anchor's position, brightness `base × (1 − fadeBand(row.band))` via `sgrAStarGlintBrightness`' existing curve, tint from the row, `drawPick` stamping `packSelection(Source.SgrAStar, rowIndex + PICK_SENTINEL_OFFSET)`. Inside the band the lens quad is the pick surface. Deletes `bodyGlintsPass.ts:270-300`'s second packed source, `SGR_A_STAR_GLINT_TINT`, the staging slot and the anchor term in `MAX_GLINTS`; deletes `starPointsPass.ts:325-360`'s anchor stamp and `sgrAStarCaptionPickable`/`sgrAStarCaptionTarget` (the S-star "inside the anchor's footprint" exclusion stays, keyed on the marker's projected position the same way).
- **Lens**: `sgrAStarLensingPass.ts` moves in as `blackHoleLensingPass.ts`, reading the tuning at its new path and the row's `massSolar`; the pipeline and `sgrAStarLensingRenderer` are unchanged. The frame-graph line `frameSections.ts:191` renames its pass `'black-hole-lensing'`; its position (after the additive roster, before the unwarped glint step) is unchanged.
- **Caption** (grill Q5, reconcile): the `'sgrAStar'` `ForegroundCaption` leaves `sceneBodyLabels.ts:105-111`; the Layer's `guides.screenLabels` row names slab NEAR0 and reuses `captionFadeRules.ts:133-142`'s rule (moved with it) and `SCALE_FADE_BANDS.sgrAStarCaption`.
- **Capture** (grill Q6, deferred): the `sky-cubemap` target row (`renderTargets.ts:223-238`) moves onto `Layer.targets` — its `size` reads the Layer's tuning slice — while `CUBEMAP_CAPTURES.sgrAStar`, `captureRowAllocateWhen('sgrAStar')` and `scheduleSkyCaptures` stay core; the Layer's lens pass samples the core capture. `Layer.captures` prep follows dome #800 and the `2026-09-22-captures-as-views.md` ruling.
- **Search**: `search: async function* () { yield [{ id: 'sgr-a-star', names: [label, detailLabel, ...aliases], ref, class: 'primary' }]; }`. No `sourceCounts`: nothing reports a count for Sgr A\* today, and a `count: 1` would move the status bar's "ready" total for no reader.
- **S-star click exclusion** (`starPointsPass.ts:346-360`): stays in the star Layer, keyed on the projected position of the core place `'galactic-centre'` (a `deriveBodyStates` read, not a Layer read) with the star Layer's own exclusion radius — the rule is "a satellite inside its anchor's click target is not separately aimable", the star Layer's rule about its satellites; the marker's pick footprint is the hole Layer's own size. Pick stamps are depth-tested nearer-wins (`bodyPickRenderer.ts:251`), so draw order alone cannot replace the rule.
- **UI**: `ui: [{ slot: 'detailCard', content: { type: 'blackHole', Detail, Compact } }, { slot: 'debug', content: LensingTuningSection }]`; the cards show label, designation, mass, r_s, distance; `settings.bodies.items['sgr-a-star']` row is deleted.

Deleted from core: `sceneSgrAStar.ts`, `sceneAnchorPointBodies.ts`, `AnchorPointBody.d.ts`, the `'sgr-a-star'` `BODY_PICK_ROWS` key, `bodySearchNames` aliases (moved), `sStarOrbitInfo.ts:31`'s `focusLabel` read (moved), `layers/body/state/sgrAStarLensingTuning/` (moved), `frame/passes/sgrAStarLensingPass.ts` (moved).

## 5. Behaviour changes

- `#focus=body-sgr-a-star` stops resolving; `#focus=blackhole-sgr-a-star` replaces it (grill Q9). No alias.
- The far-field marker is pickable everywhere it is visible (today only the caption is, and only while `sgrAStarCaptionPickable`).
- The hole's slab `footprintRadiusM` becomes the lens quad's extent (`LENS_QUAD_MAX_RS × rS`) instead of r_s (`reliefM: [0, 0]` today), so the row's near bracket widens by `PROXY_SCALE × footprint` — eye-check the band-entry frame. PR 1 keeps r_s so the prep stays neutral.
- Nothing else visible changes: same lens, same band, same descent floor and arrival, same caption fade.

## 6. Testing

Per `testing.md`: contract tests for `runLayerFeedSaga` (replace-on-yield, cancel calls `return`), `callbackIterable`, the composed slab candidates (Sgr A*'s row present iff band open; `drawRadiusM` envelope honoured), `driverGeometry` for the three driving arms, the `detailCard` fold's boot totality assert, `blackhole-` decode/encode, and `frameFilePurity` ratchet unchanged. Existing Sgr A* tests re-target the Layer. Eye-checks: band entry (lens appears, marker gone), pick on the marker at galactic scale, the S-star click exclusion, DebugPanel knob reallocating the cubemap.

## 7. Non-goals

M87\* (a second row is data; no second anchor is authored here), `Layer.captures`, S-star analytic lensing (rides the hole's slab later, `2026-09-03-s-star-analytic-lensing.md`), moving the body Layer's own candidates off `bodySlabRowOf`, the six static palette inputs onto `search`.

## 8. Backlog and specs touched

- `completed/2026-09-21-star-catalog-layer-design.md` :27, :174 — reversal note → this spec.
- `docs/backlog/2026-09-22-stars-still-in-the-body-tables.md` — reader half resolved by PR 1 commit 3.
- `docs/backlog/2026-09-21-derive-settings-snapshot.md` — the `blackHoles` visibility key.
- `docs/backlog/2026-09-03-s-star-analytic-lensing.md` — rider on the hole's slab row, no contract field.
- New backlog: `SCENE_ANCHORS`/`AnchorBody` is the place table under a body name in `data/bodies/`; `URL_HASH_FOR` beside `SelectionKindRow.focusId.encode` (possible duplication).

## 9. Decision log

R1–R12 grill Q1–Q12; R13 static `slabs`; R14 `driver?` on the selection row, slab row render-only; R15 `hostId: SlabHostId = BodyId | PlaceId`; R16 prep PR (six commits) + feature PR.

## 10. Docs to update when this ships

`src/layers/README.md` (member table: `search?`, `sourceCounts?`, `slabs?`, `detailCard` slot; the stale `frame?` row), `docs/RENDERER.md` (slab hosts, the `lens` line), `docs/layers/README.md` remaining-Layers list, `docs/BACKLOG.md` per §8.
