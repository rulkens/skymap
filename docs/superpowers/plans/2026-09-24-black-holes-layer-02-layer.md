# blackHoles Layer 02 — the Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Form `src/layers/blackHoles/` so it owns Sagittarius A\* end to end — registry row, `blackHole` selection arm with `blackhole-` deep links, search row, InfoCard, far-field marker + pick, caption, lens pass, lens slab row, cubemap target, tuning slice and DebugPanel section — and delete the body-pipeline plumbing that carries it today.

**Architecture:** PR 1 (#811, `b56d9bd53`) opened the seams: `Layer.search`, `Layer.slabs`, `SelectionRow.driver`, the `detailCard` ui slot, the `'galactic-centre'` place. This PR grows into them in four tasks: (1) the render side moves into a new Layer, behaviour-neutral; (2) Sgr A\* stops being a body — registry retype, selection arm, search, card, settings, caption — and the body tables lose it; (3) the far-field marker becomes the Layer's own pass and pick surface, and the glint/star passes lose their Sgr A\* blocks; (4) docs, spec amendments, backlog. `zoneOfAvoidance` is the template for a small singleton Layer (`src/layers/zoneOfAvoidance/layer.ts:25-66`); `starCatalog` is the template for a Layer that owns a selection arm, captions and focus ids.

**Tech Stack:** TS, RTK slices, React (InfoCard, DebugPanel), Vitest, WebGPU pass files. No shader changes.

**Spec:** `docs/superpowers/specs/2026-09-22-black-holes-layer-design.md` §2 (data delta), §4 (the Layer), §5 (behaviour changes), §6 (testing), §7 (non-goals), §8 (backlog), §10 (docs). Rulings ledger: `docs/grill-sessions/black-holes-layer-2026-09-22.md` (Q1–Q12, R13–R16). PR 1 plan: `docs/superpowers/plans/2026-09-22-black-holes-layer-01-prep.md`.

## Plan-time rulings (spec text the current code contradicts)

Each is amended in the spec by Task 4, so the spec and the shipped code agree.

- **P1 — No footprint widening; no `blackHoleFootprintRadiusM`.** Spec §2.3/§2.5/§5 size the hole's footprint as `LENS_QUAD_MAX_RS × rS`. No such constant exists: the lens has been a fullscreen triangle since #800 (`shaders/bodies/sgrAStarLensing/vertex.wesl:1-5`), and its view-dependent extent is already the slab row's `drawRadiusM` (`sgrAStarLensEnvelopeM`, `data/bodies/sgrAStarLensEnvelope.ts:20-26`). The row keeps `footprintRadiusM: rS`. The driver keeps `footprintRadiusM: rS` too: arrival is `focusDistanceRadii × footprintRadiusM` (`focusFraming.ts:104-110`, `cameraDrivers.ts:160`), so a 50 r_s footprint would move arrival from 30.4 r_s to ~1520 r_s. The §5 "band-entry eye-check for the widened bracket" drops out.
- **P2 — The S-stars' `focusId` becomes `'galactic-centre'`, not `'blackhole-sgr-a-star'`.** `makers/sStar.ts:57` sets `OrbitalElements.focusId`, the orbit's focus in `deriveBodyStates`, not a URL focus id. `sceneAnchors.ts:22-27` and `bodyRegions.ts:25-29` already name this re-point as PR 2's work. It deletes `SGR_A_STAR_ALIAS` and the region's dual claim.
- **P3 — The search row's `id` is the palette focus id; `LayerSearchEntry.ref` is deleted.** `actionForRow.ts:93` focuses `row.entry.id` verbatim, so the row id is `'blackhole-sgr-a-star'`, not `'sgr-a-star'`. `ref` has zero readers (parked from PR 1) and goes.
- **P4 — The caption *rule* stays in core; only the *producer* moves.** `CAPTION_FADE_RULES` is a closed `Record<CaptionKind, …>` read by `composeForegroundCaption.ts:42`. The starCatalog precedent keeps its `star`/`sun` rules there with Layer-owned fade handles. The `sgrAStar` rule re-keys to the Layer's settings; the `ForegroundCaption` leaves `sceneBodyLabels.ts:102-110` for the Layer's `guides.screenLabels`.
- **P5 — The marker's pick stamp is emitted while the marker *or* the caption is visible.** The spec's "inside the band the lens quad is the pick surface" does not hold, because a fullscreen triangle cannot stamp a point. Today the stamp follows the caption (`starPointsPass.ts:125-135`), and the caption stays full inside the lens band (`scaleFadeBands.ts:111-114`: `fullAt` = R₀, all the way in), where the marker has faded. OR-ing the two gates keeps today's inside-band click and adds §5's far-field marker click.
- **P6 — Label settings carry `labelEnabled` only.** `settings.bodies.items['sgr-a-star'].enabled` has no reader (`captionFadeRules.ts:133`), and §5 adds no new toggle. The Layer's `blackHoles` slice is `{ items: Record<BlackHoleId, { labelEnabled: boolean }> }`, and the tuning slice key is renamed `blackHoleLensingTuning`.

## Global Constraints

- Everything not in spec §5 (as amended by P1, P5) is pixel-identical: the same lens, band, descent floor (2 r_s), arrival (30.4 r_s), caption fade, marker tint and brightness curve. Task 1 is behaviour-neutral. Task 2 carries the URL change: `#focus=body-sgr-a-star` stops resolving and `#focus=blackhole-sgr-a-star` replaces it, with no alias. Task 3 carries the marker-pick change.
- One task = one commit, in the order below. Adjacent findings go to `docs/backlog/` (Task 4), never into a task.
- No `id === 'sgr-a-star'` branch in any shared loop or gate. The marker, lens and slab rows iterate `BLACK_HOLES`, and tint and band come from the row, so a second hole is a second row (grill Q8).
- `Source.SgrAStar` keeps code 27, and `label: 'Galactic Centre'`, `detailLabel`, `shortLabel` and `plural` are kept verbatim. The core capture (`CUBEMAP_CAPTURES.sgrAStar`, `SkyCaptureKey 'sgrAStar'`, `captureRowAllocateWhen('sgrAStar')`, `scheduleSkyCaptures`) stays in core, unrenamed (spec §4 Capture).
- Shaders stay under `src/services/gpu/shaders/`; the lens renderer's pipeline and the WESL are untouched.
- `passes/` files and every `src/services/engine/frame/**` file export only the one symbol they are named for (`tests/services/engine/frame/frameFilePurity.test.ts`; its allow-list only shrinks). One symbol per file in `utils/` and `@types/`; `type` aliases, never `interface`; deep relative imports, no barrels. The Layer's own types live in `src/layers/blackHoles/@types/`; a type core names (`BlackHoleId`, `BlackHoleInfo`, `BlackHoleSourceEntry`) lives under `src/@types/`.
- Layer boundary ratchets stay green with no new allow-list rows: `tests/conventions/layerImportBoundary.test.ts` (no `src/state`/`src/store` import and no `.dispatch(` outside `ui/`/`sagas/`; `state/<slice>/selectors.ts` may import only `selectSettings`), `layerStateShape.test.ts` (`state/slices.ts` + each slice folder exactly `{slice,initialState,selectors}.ts`), `oneSymbolPerFile.test.ts`.
- Moves use `npm run move-files -- <from> <to>` (`--dry` first for folders); renames use `npm run refactor -- rename`. Grep the old path and name afterwards, because `.wesl` `package::` imports, `?static` and string-literal paths are the tool's blind spots. Never `git mv` + hand-edited imports.
- Comment budget: module header ≤ 10 lines, comment lines ≤ half the code lines. Every header a task falsifies is rewritten in that task, and obsolete rationale is deleted, not rephrased.
- Format with `npx prettier --write <touched files>`, never `npm run format`. Commit messages carry no `Co-Authored-By` trailer. `npm run dev` stays running.
- Deletion audit: once, at `/feature-done`. Perf gate: the user decides this at the execution checkpoint.

## Review Focus

1. **Camera on the new arm.** Focusing Sgr A\* from the palette, a deep link, and a click on the marker should each arrive at 30.4 r_s and descend no closer than 2 r_s. `driver.poseId` becomes `'galactic-centre'` (was `'sgr-a-star'`), which `stepCameraRuntime.ts:121` casts to `BodyId` for the rungs. That is safe only because `SCENE_CELESTIAL_BODIES` loses Sgr A\*, and `bodyRung` never engaged there anyway (`engageHR` 0.45 < the 2 r_s floor's h/R of 1). The Task 2 test pins the arrival distance.
2. **Stale pick ids.** A pick packed as `Source.SgrAStar` must resolve through the Layer's `pickSources`, not the deleted `BODY_PICK_ROWS` key. Otherwise hover and click on the Galactic Centre caption silently resolve to nothing. The Task 2 test resolves the packed id.
3. **Search then focus.** Typing "Sgr A*" or "Galactic Center" in the palette and pressing Enter should select and frame the hole (P3). The Task 2 test pins that the row id decodes through the Layer's `focusId`.
4. **Teardown leaves no search row.** After engine teardown and re-create (HMR, exhibit switch), the palette should show exactly one Galactic Centre row. PR 1 left `state.engine.layerSearch[name]` undeleted at teardown (spec §2.6), and this PR adds the delete. The Task 2 reducer test pins it.
5. **S-star clicks near the hole.** Zoomed out, a click on the Galactic Centre should select the hole, not whichever S-star wins the centre pixel. Zoomed in, each S-star should become clickable again. After Task 3 the star Layer's exclusion keys on the projected `'galactic-centre'` place and is no longer gated on the (deleted) caption stamp. The Task 3 test pins that it still applies.

---

### Task 1: The Layer forms around the lens (behaviour-neutral)

**review: yes** (Redux settings-slice move and rename; GPU handle ownership; a landmine file: `renderTargets.ts` lazily allocated capture target)

The render half moves, and nothing visible changes. The Layer owns its lens renderer instance, the `sky-cubemap` target, the `lens` slab row and the tuning slice. Core loses `CORE_SLAB_ROWS`, the `sgrAStarLensingRenderer` GPU handle and the lens pass. The registry row stays `type: 'body'` here (Task 2 retypes it).

**Files:**

- Create: `src/layers/blackHoles/layer.ts`, `create.ts`, `destroy.ts`, `@types/BlackHolesRuntime.d.ts`, `state/slices.ts`
- Move (`npm run move-files`): `src/data/blackHoles.ts` → `src/layers/blackHoles/data/blackHoles.ts`; `src/@types/data/BlackHoleRow.d.ts` → `src/layers/blackHoles/@types/BlackHoleRow.d.ts`; `src/services/engine/frame/passes/sgrAStarLensingPass.ts` → `src/layers/blackHoles/passes/blackHoleLensingPass.ts` (then `npm run refactor -- rename` the export to `blackHoleLensingPass`); `src/services/gpu/renderers/bodies/sgrAStarLensingRenderer.ts` → `src/layers/blackHoles/render/sgrAStarLensingRenderer.ts`; `src/layers/body/state/sgrAStarLensingTuning/` → `src/layers/blackHoles/state/lensingTuning/`; `src/components/DebugPanel/SgrAStarLensingTuningSection.tsx` + `src/components/containers/SgrAStarLensingTuningSectionContainer.tsx` → `src/layers/blackHoles/ui/`; `src/data/sgrAStarLensing/sgrAStarLensingSliderFields.ts` + `src/@types/data/sgrAStarLensing/*` → the Layer's `ui/` / `@types/`
- Modify: `src/layers/body/state/slices.ts:8,10` (tuning slice leaves), `src/compositions/app.ts` + `src/compositions/appSettingsSlices.ts` (register the Layer and its settings tuple), `src/components/DebugPanel/DebugPanel.tsx:28,77` (the section arrives through the Layer's `debug` ui slot)
- Modify: `src/data/rendering/frameSections.ts:184-191` (pass renamed `'black-hole-lensing'`; comment names the Layer), `src/services/engine/frame/passes/index.ts:33,47`, `src/services/engine/frame/timing/passGroupTitles.ts:42-48`
- Modify: `src/services/gpu/renderTargets.ts:190-210` (the `sky-cubemap` row leaves for `Layer.targets`; its `size` reads `state.settings.blackHoleLensingTuning.cubemapResolutionPx`)
- Delete: `src/data/bodies/coreSlabRows.ts` (its row becomes `layer.slabs`); Modify `src/services/engine/phases/createLayers.ts:176-186` (compose Layer rows only), `src/utils/meshBodies/meshBodySlabHostId.ts:20-24` (`SLAB_HOST_IDS` drops the `CORE_SLAB_ROWS` term; no mesh is hosted on the galactic centre, so the set loses a member no reader asks about), `src/data/rendering/layerSlabRowHeadroom.ts:7-11` (the comment names the blackHoles row as the first tenant, not a reservation)
- Modify: `src/@types/engine/handles/EngineGpuHandles.d.ts:459-463`, `src/services/engine/gpuHandles/gpuHandleRegistry.ts:34,244-246`, `src/services/engine/engine.ts:209` (the `sgrAStarLensingRenderer` handle is deleted; the Layer's `create` builds the renderer)
- Modify: `src/@types/settings/SgrAStarLensingTuning.d.ts` → Layer `@types/` (move-files), `src/@types/engine/settings/SettingsSnapshot.d.ts:43` (key name in the comment), `tests/state/settings/makeSettingsFixture.ts`
- Test: `tests/data/bodies/coreSlabRows.test.ts` → `tests/layers/blackHoles/blackHoleSlabRows.test.ts` (re-target), `tests/services/gpu/renderTargets.test.ts`, `tests/services/engine/frame/{checkFrameOrder,expandFrameOrder,executeFrame}.test.ts`, `tests/services/engine/frame/timing/timedSlotsOf.test.ts`, `tests/services/engine/frame/renderFrame.cubemapCaptures.test.ts`, `tests/utils/gpu/sgrAStarLensingUniformsLayout.parity.test.ts` (paths only)

**Interfaces:**

```ts
// src/layers/blackHoles/@types/BlackHoleRow.d.ts — Task 1 shape. Task 2 swaps
// `bodyId` for `id: BlackHoleId` and adds standoffRadii/focusDistanceRadii; Task 3 adds glintTint.
export type BlackHoleRow = {
  readonly bodyId: BodyId;
  readonly anchorId: PlaceId;   // 'galactic-centre' — the lens pose key and slab host
  readonly massSolar: number;   // r_s = schwarzschildRadiusM(massSolar); SGR_A_STAR_MASS_SOLAR's value
  readonly band: FadeBand;      // SCALE_FADE_BANDS.sgrAStarLensing, by reference (the capture row holds the same object)
  readonly emission: { /* unchanged, BlackHoleRow.d.ts:14-21 */ };
};

// src/layers/blackHoles/@types/BlackHolesRuntime.d.ts
export type BlackHolesRuntime = { readonly lensRenderer: SgrAStarLensingRenderer };

// layer.ts — members this task sets
defineLayer({
  name: 'blackHoles',
  settings: blackHolesLayerSettings,          // [blackHoleLensingTuningSlice]
  targets: [SKY_CUBEMAP_TARGET],              // the renderTargets.ts:197-209 row, verbatim but for `size`
  slabs: BLACK_HOLES.map(blackHoleSlabRow),   // { anchorId: row.anchorId, drawRadiusM: sgrAStarLensEnvelopeM,
                                              //   footprintRadiusM: schwarzschildRadiusM(row.massSolar),
                                              //   activeBand: row.band, source: 'lens' }  — P1
  create, destroy,
  passes: (runtime) => [blackHoleLensingPass(runtime)],
  ui: [{ slot: 'debug', content: LensingTuningSectionContainer }],
});
```

- `blackHoleLensingPass(runtime): ContentPass` is a factory (the zoneOfAvoidance pass shape). It reads `runtime.lensRenderer`, not `state.gpu`, and matches `view.slab.frame.hostId` against the `BLACK_HOLES` rows' `anchorId`. It drops the boot assert at `sgrAStarLensingPass.ts:26-32`, because the pass iterates the table now. It keeps `bandAlpha` from `skyCaptureBandAlpha('sgrAStar', …)`: the uniform needs the alpha value even though the row's existence is already the gate (spec §2.5). It gets `SCHWARZSCHILD_RADIUS_M` from the row's `massSolar`.
- `blackHoleSlabRow(row): SlabRow` lives in `src/layers/blackHoles/present/blackHoleSlabRow.ts` (one symbol).
- `SLAB_ROW_CEILING` / `LAYER_SLAB_ROW_HEADROOM` are unchanged, and the boot assert now counts one Layer row.
- No new test: the move is covered by the re-targeted slab-row test (row present iff band open, `drawRadiusM` honoured) and the frame-order tests. The compiler catches every stale handle read.

- [ ] Move the files (dry-run first), create the Layer shell, re-point the target, slab row and handle, and register the Layer.
- [ ] Grep `sgrAStarLensingTuning`, `sgrAStarLensingRenderer`, `CORE_SLAB_ROWS`, `'sgr-a-star-lensing'`, `data/blackHoles` across `src tests tools docs/RENDERER.md` and fix every hit. Only the renderer's GPU labels (`'sgr-a-star-lensing-*'`) may stay.
- [ ] `npm run typecheck:fast && npx vitest run tests/layers tests/services/engine/frame tests/services/gpu tests/conventions tests/data` → green.
- [ ] Commit: `refactor(blackHoles): the Layer forms around the Sgr A* lens`.

---

### Task 2: Sgr A\* stops being a body

**review: yes** (Redux settings shape, the engine `layerSearch` reducer, camera driver and focus framing, selection and pick resolution)

This is the identity half and carries §5's URL change. The registry row retypes to `blackHole` and moves into the Layer. `BodyId`, `SCENE_BODIES`, `BODY_PICK_ROWS`, `settings.bodies.items` and the body palette rows lose Sgr A\* by derivation. The Layer gains the seventh selection arm, the search row, the InfoCard, the label setting and the caption. The glint and star passes keep their Sgr A\* blocks until Task 3, but read the place's state instead of the deleted body's.

**Files:**

- Move: `src/data/sources/sgr-a-star.ts` → `src/layers/blackHoles/sources/sgrAStar.ts`. Create `src/layers/blackHoles/sources/blackHoleSourceRows.ts`. Modify `src/data/sources.ts:28,67-88` (drop the `UNFORMED_SOURCE_REGISTRY` line 75, add `...sourceRecordOf(BLACK_HOLE_SOURCE_ROWS)` beside lines 82/85)
- Create: `src/@types/data/blackHole/BlackHoleSourceEntry.d.ts`, `src/@types/data/blackHole/BlackHoleId.d.ts`, `src/@types/engine/BlackHoleInfo.d.ts`; Modify `src/@types/data/SourceEntry.d.ts:21-31` (the new arm)
- Modify `BlackHoleRow` (`bodyId` → `id: BlackHoleId`; add `standoffRadii: 2.0` and `focusDistanceRadii: 30.4` with the rationale comments from `sceneSgrAStar.ts:20-25`) and `data/blackHoles.ts`
- Delete: `src/data/bodies/sceneSgrAStar.ts`, `src/@types/scene/AnchorPointBody.d.ts` (and its `SceneBody.d.ts:20,23` union member), `SGR_A_STAR_ALIAS` (`sceneAnchors.ts:21-41`), the `'sgr-a-star'` row of `bodyPickRows.ts:10,17`, the Sgr A\* row of `bodySearchNames.ts:14,22-23` (aliases move to the Layer's search feed), `sceneBodies.ts:19,29`, `bodyRegions.ts:25-29`'s `SGR_A_STAR_ID` dual claim, `sStarOrbitInfo.ts:16,31`'s `focusLabel` import (it reads `SOURCE_REGISTRY[Source.SgrAStar].label`, so `data/` gains no import of the Layer)
- Modify: `src/data/bodies/makers/sStar.ts:57` → `focusId: GALACTIC_CENTRE_ANCHOR.id` (P2), `src/data/bodies/orbitalElements.ts:708-710` (the comment), `src/data/palette/featuredTabs.ts:152-158,417-423` → `'blackhole-sgr-a-star'` (id and `focusId`), `src/layers/starCatalog/passes/starPointsPass.ts:102,335` and `src/services/engine/frame/passes/bodyGlintsPass.ts:82,286` (read `GALACTIC_CENTRE_ANCHOR.id`'s state; Task 3 deletes both blocks)
- Selection (seventh kind): `src/data/selection/selectionKinds.ts:7-14` (`'blackHole'`), `src/@types/engine/SelectionRef.d.ts:18-37`, `src/@types/engine/SelectionRow.d.ts:25-59` (a driving arm, so `DrivenSelectionRow` includes it), `src/@types/engine/FocusableTarget.d.ts:27-33`, `src/services/url/urlHashFor.ts:26-48`, `src/services/engine/helpers/targetIdentityKey.ts:12-26`, `src/services/engine/camera/focusFraming.ts:104-110` (`case 'blackHole':` joins the `body`/`starCatalog` fallthrough), `src/services/engine/helpers/selectionHaloTable.ts`, `src/services/engine/helpers/refOf.ts:31-57`, `src/services/engine/helpers/rowFocusable.ts`, `src/state/settings/core/pickingSlice.ts` (`kinds.blackHole: true`), plus every other exhaustive per-kind table the compiler names once `SELECTION_KINDS` grows (each gets one row, never a branch)
- Create: `src/layers/blackHoles/present/blackHoleSelectionRow.ts`, `src/layers/blackHoles/ui/BlackHoleDetailCard/BlackHoleDetailCard.tsx`, `src/layers/blackHoles/ui/CompactBlackHoleCard/CompactBlackHoleCard.tsx`, `src/layers/blackHoles/present/blackHoleSearch.ts`, `src/layers/blackHoles/present/produceBlackHoleCaptions.ts`
- Search contract: `src/@types/engine/layer/LayerSearchEntry.d.ts` (`ref` deleted, `id` documented as the focus id, P3), `src/state/engine/engineSlice.ts:96-104` + the teardown path in `src/services/engine/phases/createLayers.ts:129-133` / `engine.ts` teardown (delete `layerSearch[name]` when the Layer's feed ends)
- Settings and labels (P6): Create `src/layers/blackHoles/state/blackHoles/{slice,initialState,selectors}.ts` and `src/@types/settings/BlackHoleItemSettings.d.ts`. Modify `src/@types/data/LabelBearingSourceType.d.ts`, `src/@types/animation/LabelLayerId.d.ts` (`'blackHoles'`), `src/@types/settings/LabelHomes.d.ts`, `src/data/labels/labelHomeBySourceType.ts:39-61` (a `blackHole` row), `src/state/settings/projectLabelCategoryVisibility.ts`, `src/components/containers/LabelsAndGuidesSectionContainer.tsx` (only if it does not already derive from the table), `src/services/engine/presentation/captionFadeRules.ts:127-146` (`labelEnabled` reads `settings.blackHoles.items[id]`, fade handle `{ kind: 'labelLayer', layer: 'blackHoles', item: id }`, rewritten JSDoc), `src/services/engine/presentation/sceneBodyLabels.ts:11,42,102-110` (the Sgr A\* caption and its tint leave; header rewritten)
- Test: `tests/data/sources/sgrAStar.test.ts` (re-target), `tests/data/bodies/makers/sStar.test.ts`, `tests/data/bodies/bodyRegions.test.ts`, `tests/services/engine/camera/{focusFraming,pivotRadiusMpc}.test.ts`, `tests/services/engine/presentation/{sceneBodyLabels,captionFadeRules,produceSceneBodyCaptions}.test.ts`, `tests/utils/picking/sceneBodyPickId.test.ts`, `tests/components/CommandPalette/utils/{bodyRowChip,rankPaletteMatches}.test.ts`, `tests/utils/scene/bodyDriverGeometry.test.ts`, `tests/services/engine/frame/deriveBodyStates.test.ts`, and every other test the compiler names

**Interfaces:**

```ts
// src/@types/data/blackHole/BlackHoleSourceEntry.d.ts — sibling of BodySourceEntry
export type BlackHoleSourceEntry = SourceEntryBase & {
  readonly type: 'blackHole'; readonly id: string; readonly label: string;
  readonly detailLabel: string; readonly shortLabel: string; readonly plural: string;
};
// src/@types/data/blackHole/BlackHoleId.d.ts — derived exactly like BodyId.d.ts:1-11
export type BlackHoleId = Extract<AnyEntry, { type: 'blackHole' }>['id'];   // 'sgr-a-star'

// sources/sgrAStar.ts — `type: 'blackHole'`, `labelLayer: 'blackHoles'`, every other field verbatim.

// SelectionRef.d.ts — seventh arm
| { readonly type: 'blackHole'; readonly id: BlackHoleId }
// SelectionRow.d.ts — the arm carries `driver` (a driving arm)
| { readonly type: 'blackHole'; readonly id: BlackHoleId; readonly positionMpc: Vec3; readonly driver: DriverGeometry }
// src/@types/engine/BlackHoleInfo.d.ts
export type BlackHoleInfo = {
  readonly type: 'blackHole'; readonly id: BlackHoleId; readonly label: string;
  readonly detailLabel: string; readonly positionMpc: Vec3;
  readonly schwarzschildRadiusM: number; readonly massSolar: number;
};

// present/blackHoleSelectionRow.ts — SelectionKindRow<'blackHole'>
//   pickSources: [Source.SgrAStar]; resolvePick: localIdx → BLACK_HOLES[localIdx]
//   extractRow: positionMpc = deriveBodyStates(simDays).get(row.anchorId).positionMpc,
//     driver: { poseId: row.anchorId, boundingRadiusM: rS, footprintRadiusM: rS,   // P1
//               groundRadiusM: rS, standoffRadii: row.standoffRadii,
//               focusDistanceRadii: row.focusDistanceRadii }
//   focusId: { claims: (id) => id.startsWith('blackhole-'), decode, encode }  → 'blackhole-sgr-a-star'
//   URL_HASH_FOR.blackHole delegates to the same encode (no second spelling of the prefix).

// present/blackHoleSearch.ts — Layer.search
async function* (): AsyncIterable<readonly LayerSearchEntry[]>
// yields once: [{ id: encode(ref) /* 'blackhole-sgr-a-star' */, class: 'primary',
//   names: [label, detailLabel, 'Galactic Center', 'Sagittarius A*', 'Sgr A*', 'SgrA*'] }]

// state/blackHoles — settings.blackHoles
export type BlackHolesSettings = { readonly items: Readonly<Record<BlackHoleId, BlackHoleItemSettings>> };
export type BlackHoleItemSettings = { readonly labelEnabled: boolean };   // default true; setBlackHoleLabelEnabled({ id, enabled })

// present/produceBlackHoleCaptions.ts — guides.screenLabels: [{ slab: NEAR0, id: 'blackHoleCaptions', produceLabels }]
// One `bodyCaption(...)` per BLACK_HOLES row at its anchor's state, kind 'sgrAStar',
// the tint `sceneBodyLabels.ts` uses today, pickId packSelection(Source.SgrAStar, i + PICK_SENTINEL_OFFSET);
// composed through `composeForegroundCaption` exactly as `produceStarCaptions.ts:60-95` does.
// The caption em is sized from r_s (today `SGR_A_STAR.surface.datumRadiusM`); `bodyCaption` takes a
// SceneBody, so pass a minimal `{ id, label, surface: { datumRadiusM: rS, reliefM: [0, 0] } }` built
// in the producer — or widen `bodyCaption`'s param to the fields it reads, whichever is the smaller diff.
```

- The detail card shows label, designation (`detailLabel`), mass, r_s, distance and the `BODY_FACTS['sgr-a-star']` description and wiki link (`bodyFacts.generated.ts:381-386`, keyed by string, unchanged). It takes `onFocus`. The compact card shows name and distance. The ui entries follow `zoneOfAvoidance/layer.ts:50-64`.
- `detailCardTable.ts:125-128`'s boot totality assert is the check that the Layer contributes its `detailCard`, so no new test is needed.
- The Bodies settings panel loses the Galactic Centre row by derivation (`bodies/initialState.ts:13-20`). The label toggle reappears under Labels & Guides through `LABEL_HOME_BY_SOURCE_TYPE`.

**Tests (these can fail on real bugs):**

- `tests/layers/blackHoles/present/blackHoleSelectionRow.test.ts`:
  - `resolves a Source.SgrAStar pick to the Sgr A* ref` — `packSelection(Source.SgrAStar, 0 + PICK_SENTINEL_OFFSET)` → `{ type: 'blackHole', id: 'sgr-a-star' }`.
  - `focus id round-trips` — `encode(ref) === 'blackhole-sgr-a-star'`; `decode('blackhole-sgr-a-star')` equals the ref; `claims('body-sgr-a-star') === false`.
  - `extracted row poses at the galactic centre and arrives at 30.4 r_s` — `row.positionMpc` equals `GALACTIC_CENTRE_ANCHOR.positionMpc`; `focusFraming(row, fov)` distance equals `bodyLikeFraming(pos, rS, fov, 30.4)`'s (the value today's body arm produces, pinned before the change).
- `tests/layers/blackHoles/present/blackHoleSearch.test.ts`: `the search row id decodes to the hole` — the one yielded row's `id` is claimed and decoded by the Layer's `focusId` to the Sgr A\* ref; `names` include `'Sgr A*'` and `'Galactic Center'`.
- `tests/state/engine/engineSlice.test.ts`: `teardown deletes the Layer's search rows` — after `layerSearchReported({ layer: 'blackHoles', rows })` and the teardown action, `selectLayerSearchRows` is empty.
- `tests/services/url/urlHashFor.test.ts` (extend): `blackHole ref encodes blackhole-<id>`.
- The existing `deriveBodyStates` / `bodyRegions` tests must show `'sgr-a-star'` absent from the state map and every S-star's region `'galactic-centre'`. Edit their expectations; do not add new tests.

- [ ] Write the four new tests and run them red.
- [ ] Retype and move the registry row, add the ids and the arm, work through the compiler's list of exhaustive tables, then add the Layer's selection, search, cards, settings and caption.
- [ ] Delete the body-side plumbing listed above. Grep `sgr-a-star`, `SGR_A_STAR\b`, `AnchorPointBody`, `body-sgr-a-star` across `src tests tools`. The only hits allowed are the registry `id` value, `BODY_FACTS`' key, the renderer's GPU labels, and the `Source.SgrAStar` / `'sgrAStar'` capture and caption keys.
- [ ] `npm run typecheck:fast && npx vitest run` → green.
- [ ] Commit: `feat(blackHoles): Sgr A* is a black hole — selection arm, blackhole- links, search, card, caption`.

---

### Task 3: The marker is the Layer's own pass and pick surface

**review: yes** (a pass with a pick stamp; the S-star click exclusion; `bodyGlintRenderer` instance sizing — the vertex-stride keep-rule at `bodyGlintRenderer.ts:80-86`)

This carries §5's pick change. The far-field glint leaves `bodyGlintsPass` for the Layer's `black-hole-marker` pass, drawn by the Layer's own `bodyGlintRenderer` instance (grill Q8). The anchor pick stamp leaves `starPointsPass` for the marker's `drawPick`. The S-star exclusion stays in the star Layer, keyed on the projected place.

**Files:**

- Create: `src/layers/blackHoles/passes/blackHoleMarkerPass.ts`, `src/layers/blackHoles/present/blackHoleMarkerBrightness.ts`, `src/layers/blackHoles/present/blackHolePickable.ts`
- Move (`npm run move-files`): `src/services/engine/presentation/sgrAStarCaptionTarget.ts` → `src/layers/blackHoles/present/sgrAStarCaptionTarget.ts` (its only reader is now the Layer)
- Modify: `src/layers/blackHoles/@types/BlackHoleRow.d.ts` + `data/blackHoles.ts` (add `glintTint: [1, 0.55, 0.2]` and `glintBaseIntensity: 0.8`, from `bodyGlintsPass.ts:124-129` with their comment), `@types/BlackHolesRuntime.d.ts` + `create.ts`/`destroy.ts` (a `markerRenderer: BodyGlintRenderer` built by `createBodyGlintRenderer(device, HDR_TARGET_FORMAT)`), `layer.ts` (`passes` gains the marker)
- Modify: `src/services/engine/frame/passes/bodyGlintsPass.ts` (delete lines 118-129, `sgrAStarGlintBrightness` 145-158, the `enabled` widening 169-177, the second packed source 283-300; rewrite the module header's anchor paragraphs), `src/services/gpu/renderers/bodies/bodyGlintRenderer.ts:65-78` (`MAX_GLINTS` loses its `+ 1`; comment rewritten)
- Modify: `src/layers/starCatalog/passes/starPointsPass.ts` (delete `sgrAStarCaptionPickable` 118-135 and the anchor stamp 318-341, and the `SGR_A_STAR`/`sgrAStarCaptionTarget` imports. The exclusion at 342-364 now projects `sceneBodyStates(state, ctx).get(GALACTIC_CENTRE_ANCHOR.id)` unconditionally, keeping its `regionOfBody(star.id)?.id === GALACTIC_CENTRE_REGION_ID` scope and `FAMOUS_STAR_PICK_RADIUS_PX`. Rewrite its comment: the rule is the star Layer's own — a satellite inside its anchor's click target is not separately aimable)
- Modify: `src/data/rendering/frameSections.ts:198-204` (`passes: ['body-glints', 'black-hole-marker']`), `src/services/engine/frame/timing/passGroupTitles.ts` if the new pass name needs a title row
- Test: `tests/services/engine/frame/passes/bodyGlintsPass.test.ts` (the Sgr A\* cases move to the marker test), `tests/layers/starCatalog/passes/starPointsPass.test.ts`, `tests/services/engine/frame/{checkFrameOrder,expandFrameOrder}.test.ts`

**Interfaces:**

```ts
// present/blackHoleMarkerBrightness.ts — today's curve, per row (no Sgr A* constants)
export function blackHoleMarkerBrightness(row: BlackHoleRow, camPosMpc: Readonly<Vec3>,
  states: ReadonlyMap<string, BodyState>): number;
// = row.glintBaseIntensity × (1 − fadeBand(row.band, distance from row.anchorId's region))

// present/blackHolePickable.ts — P5: the one gate `pickEnabled` and `drawPick` both call
export function blackHolePickable(row: BlackHoleRow, state: PassState, ctx: FrameView): boolean;
// = ctx.cam.distance < FOREGROUND_MAX_DISTANCE_MPC &&
//   (blackHoleMarkerBrightness(...) > GLINT_MIN_BRIGHTNESS || sgrAStarCaptionTarget(...) > 0)

// passes/blackHoleMarkerPass.ts
export function blackHoleMarkerPass(runtime: BlackHolesRuntime): ContentPass;
// name 'black-hole-marker'; NEAR0 line; `enabled` and `draw` use the same
// FOREGROUND_MAX_DISTANCE_MPC gate + brightness threshold as the deleted block, so the pixels are identical;
// drawPick → state.gpu.bodyPickRenderer.drawPoints([{ posRelCamMpc, packedId:
//   packSelection(Source.SgrAStar, rowIndex + PICK_SENTINEL_OFFSET) }]) per pickable row.
```

- `GLINT_MIN_BRIGHTNESS` (`bodyGlintsPass.ts:112`) is now read by two files: it moves to `src/data/rendering/glintMinBrightness.ts`, because frame files export one symbol.

**Tests:**

- `tests/layers/blackHoles/passes/blackHoleMarkerPass.test.ts`:
  - `marker brightness is full far out and zero inside the lens band` — at R₀ from Earth → `glintBaseIntensity`; at 50 AU from the anchor → 0 (the numbers today's `bodyGlintsPass.test.ts` Sgr A\* cases assert; carry them over).
  - `pick stamp persists inside the band while the caption shows` — at 50 AU with the label enabled, `drawPick` emits one stamp with `packSelection(Source.SgrAStar, 0 + PICK_SENTINEL_OFFSET)`. With the label disabled at the same distance, it emits none.
  - `far-field pick follows the marker with the label off` — at R₀ with the label disabled, one stamp.
- `tests/layers/starCatalog/passes/starPointsPass.test.ts` (extend): `an S-star inside the galactic-centre footprint is not stamped` — zoomed out, no S-star stamp within `FAMOUS_STAR_PICK_RADIUS_PX` of the projected place. A famous star outside the region, at the same screen spot, keeps its stamp.

- [ ] Write the tests and run them red.
- [ ] Build the marker pass and gates, delete the two old blocks, re-key the exclusion.
- [ ] Grep `sgrAStarGlintBrightness`, `SGR_A_STAR_GLINT`, `sgrAStarCaptionPickable`, `sgrAStarCaptionTarget` → only the Layer's own files.
- [ ] `npm run typecheck:fast && npx vitest run` → green.
- [ ] Commit: `feat(blackHoles): the far-field marker draws and picks from the Layer`.

---

### Task 4: Docs, spec amendments, backlog

Spec §8, §10, and the P1–P6 amendments. The docs ride the PR.

**Files:**

- Modify: `docs/superpowers/specs/2026-09-22-black-holes-layer-design.md`:
  - §2.3: the driver `footprintRadiusM` is r_s (P1), and the S-star `focusId` is `'galactic-centre'` (P2).
  - §2.4: `LayerSearchEntry` has no `ref`, and `id` is the focus id (P3).
  - §2.5: the row footprint is r_s (P1).
  - §4: the Caption bullet (P4), the Marker bullet's pick sentence (P5), and the tree (no `blackHoleFootprintRadiusM`, renderer under `render/`).
  - §5: the third bullet is struck in favour of a one-line P1 note.
  - §2.6: the settings are `labelEnabled` only (P6).
  - Each amendment carries a one-line "amended at PR 2 plan time" marker.
- Modify: `src/layers/README.md`:
  - the Layer list gains `blackHoles` as formed;
  - the member table's `slabs?` row names its first tenant;
  - the `detailCard` slot row names ZoA + blackHoles.
- Modify: `docs/RENDERER.md` — add the `lens` line to the frame-graph description (after the additive roster, before `POST_LENSING` glints; one expansion per active `'lens'` slab row). Add slab hosts: `SlabHostId = BodyId | PlaceId`, and rows come from the store roster plus `Layer.slabs`.
- Modify: `docs/backlog/2026-09-21-derive-settings-snapshot.md` (add the `blackHoles` visibility key), `docs/backlog/2026-09-03-s-star-analytic-lensing.md` (rides the hole's slab row, keyed on `hostId === 'galactic-centre'`).
- Create, if PR 1 did not already file them (check `docs/BACKLOG.md` first):
  - the §8 items `SCENE_ANCHORS`/`AnchorBody` is the place table under a body name in `data/bodies/`;
  - `URL_HASH_FOR` beside `SelectionKindRow.focusId.encode`;
  - each gets an index line.
- Verify only: `completed/2026-09-21-star-catalog-layer-design.md` :27/:174 already carry PR 1's reversal note.

- [ ] Edits as listed. Grep `LENS_QUAD_MAX_RS` and `blackHoleFootprintRadiusM` across `docs/` → zero hits outside the amendment markers.
- [ ] `npx vitest run tests/conventions` → green.
- [ ] Commit: `docs(blackHoles): Layer formed — spec amendments, RENDERER lens line, backlog`.

---

## Definition of Done

**Deliverable inventory**

- `src/layers/blackHoles/` has:
  - `layer.ts`, `create.ts`, `destroy.ts`;
  - `data/blackHoles.ts`;
  - `sources/` (`sgrAStar.ts`, `blackHoleSourceRows.ts`);
  - `state/` (`slices.ts`, `lensingTuning/`, `blackHoles/`);
  - `passes/` (`blackHoleLensingPass.ts`, `blackHoleMarkerPass.ts`);
  - `render/sgrAStarLensingRenderer.ts`;
  - `present/` (selection row, search, captions, slab row, marker brightness, pickable, caption target);
  - `ui/` (detail + compact cards, tuning section + container, slider fields);
  - `@types/` (`BlackHolesRuntime`, `BlackHoleRow`, slider types, tuning type).
- `BlackHoleId`, `BlackHoleSourceEntry` and `BlackHoleInfo` are under `src/@types/`. `SELECTION_KINDS` has seven members, and `SelectionRef`/`SelectionRow`/`FocusableTarget` have a `blackHole` arm.
- These no longer exist:
  - `sceneSgrAStar.ts`, `AnchorPointBody`, `SGR_A_STAR_ALIAS`, `CORE_SLAB_ROWS`;
  - the `'sgr-a-star'` key of `BODY_PICK_ROWS`, `bodySearchNames`, `bodies.items` and `BodyId`;
  - `state.gpu.sgrAStarLensingRenderer`, `settings.sgrAStarLensingTuning`, `LayerSearchEntry.ref`;
  - `sgrAStarGlintBrightness`, `SGR_A_STAR_GLINT_TINT`, `sgrAStarCaptionPickable`;
  - the `+ 1` in `MAX_GLINTS`, and the `'sgr-a-star-lensing'` pass name.
- The frame line reads `passes: ['black-hole-lensing']` on `lens`, and `['body-glints', 'black-hole-marker']` on `POST_LENSING`.
- `state.engine.layerSearch[name]` is deleted at Layer teardown.
- Spec amended (P1–P6); `src/layers/README.md` and `docs/RENDERER.md` updated; backlog per Task 4.

**Observable behaviours (manual pass on the main app, user's eyes)**

- Galaxy scale (from Earth, framing the disc): the Galactic Centre caption and the warm-orange marker show at the centre. Clicking the marker opens the black-hole card: eyebrow, "Galactic Centre", "Sagittarius A\*", mass, r_s, distance, description. The card's Focus pill flies in and arrives at ~30.4 r_s.
- Band entry (~500 AU in): the lens fades in as the marker fades out. The lens looks exactly as before. The caption stays, and clicking it still selects the hole.
- Descent: zooming toward the horizon stops at 2 r_s.
- `#focus=blackhole-sgr-a-star` selects and frames the hole on load. `#focus=body-sgr-a-star` does nothing. The two featured palette cards focus the hole.
- Palette: "Sgr A*", "Sagittarius A*" and "Galactic Center" each return one row, and Enter focuses the hole. After an HMR reload there is still exactly one row.
- S-stars: zoomed out, a click on the centre selects the hole, not an S-star. Zoomed in until the orbits clear the marker, S2 is clickable, and its card lists "Galactic Centre" as the orbit focus.
- Labels & Guides has a Galactic Centre label toggle that hides and shows the caption. The Bodies panel has no Galactic Centre row.
- DebugPanel: the Sgr A\* lensing section is present. Its cubemap-resolution knob reallocates the capture (the lens sharpens and softens), and the other sliders move the disc live.
- The S-star orbit trails draw at the centre as before.

**Deferral boundary**

- M87\* and any second row; `Layer.captures`; S-star analytic lensing; the body Layer's own slab candidates off `bodySlabRowOf`; the six static palette inputs onto `search` (spec §7).
- A `sourceCounts` feed for the Layer (spec §4 Search: no reader).
- Renaming the `'sgrAStar'` capture key, `SkyCaptureKey`, the `'sgrAStar'` caption kind, `SCALE_FADE_BANDS.sgrAStar*`. These stay named for the one hole they serve, and renaming them is not part of this PR. *Amended (D4):* the renderer and its WESL DID rename — `SgrAStarLensing*` → `BlackHoleLensing*` — because `BlackHoleRow.band` becoming `capture: SkyCaptureKey` made the lens stack itself generic; only the fade-band key and the other names above stay Sgr-A\*-specific.
- No deletion audit until `/feature-done`.
