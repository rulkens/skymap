# Layer visibility, ground preparation: implementation plan

**Goal:** prepare the ground for Layer-declared visibility (`docs/superpowers/plans/2026-10-14-layer-declared-visibility.md`, PR 2) with behaviour-neutral moves only. Every Layer-owned concern that core still holds by name leaves core, and the seams PR 2 builds on exist, all while reading today's fades. The gate is a pixel-identical before/after: nothing a person sees or operates changes.

**Architecture:** eight independent refactors, one commit each (two for the pure moves). The body Layer gets its `layer.ts` and the `orbitTrails` cluster. The missions Layer gets its own `missionTrails` cluster (M1) and its own Voyager caption producer (M2). The star Layer takes core's star scene-set helpers behind a generic `Layer.nearSpheres` member (V2). The galaxy catalog Layer takes the source bitmask (V3). The star sphere pipeline learns an opacity, held at 1 (V1). No visibility type (`VisibilityEntry`, `ShowKey`, `FadeIdentity`, `visibilityLiveOf`) exists in this PR: every consumer keeps today's switch and fade reads. PR 2 then swaps those reads for handed values.

**Spec:** `docs/superpowers/specs/2026-10-13-layer-declared-visibility-design.md`, section "Ground preparation". Rulings: `.superpowers/grill/2026-10-13-layer-declared-fades-rulings.md` (SPLIT, M1, M2, V1–V3, the adjacent `labelLayer` ruling; M3 and M4 land in PR 2).

## Global Constraints

- **Behaviour-neutral, every task.** If a task cannot be done without a visible or operable change (a pixel, a fade's timing, a click target, a row's order, a caption's occlusion or declutter outcome), STOP and report it in your reply. Never take the change silently.
- Never add `Co-Authored-By` (or any attribution trailer) to a commit. One commit per task (a pure move gets its own commit first), message in the plan's voice. Never rebase, force-push or merge.
- Stage by path, never `git add -A`. `npx prettier --write <files you touched>`, never `npm run format`.
- Move or rename TS files only with `npm run move-files -- <from> <to>` (run `--dry` first), never `git mv` plus hand-edited imports. Afterwards grep `src tests tools packages` for the old path, because string literals and `vi.mock` paths are not rewritten.
- Files in `src/services/engine/frame/` (incl. `passes/`) export only their one symbol (ratchet: `tests/services/engine/frame/frameFilePurity.test.ts`, which only shrinks). Pass and orchestration files declare only their one export.
- One symbol per file in every `utils/` and `@types/` folder; filename = symbol; deep relative imports, no barrels; `type`, never `interface`; types never inline in implementation files.
- Comments explain why, never what. Module header ≤ 10 lines; comment lines ≤ half the code lines. Rewrite every comment that names a moved symbol at its old home.
- Verify with `npm run typecheck:fast` plus the targeted tests. **Tasks 3 and 6 must also pass `npx tsc --noEmit`**: they change the composition's type or the `Layer` contract, and tsgo misses the circular-alias class (`src/layers/galaxyCatalog/state/slices.ts:1-7`).
- Task 8 is the only task that touches a `.wesl` file. Its implementer invokes the `wesl-shaders` skill first, reads `docs/RENDERER.md` in full, and writes no backtick anywhere in a `.wesl` file (quote identifiers in `'single quotes'`).
- No core file gains a Layer's name. After this PR no file under `src/services/engine/frame/` or `src/services/engine/helpers/` names the star catalog's settings or helpers or the galaxy mask, and `produceSceneBodyCaptions.ts` names no `missions` setting and no `SAMPLED_BODIES` (Review Focus #2 has the greps).

## Review Focus

1. **Behaviour neutrality.** The ways a task here could change what a person sees without failing CI:
   - **V3 pick/draw split.** Today the point pass draws on the draw mask (`enabled || opacity > 0`) and picks on the pick mask (`enabled` alone; "pick follows intent", `deriveSourceMasks.ts:17-27`). With the field gone from the frame context, `drawPick` must compute the pick mask itself: using the draw mask would leave a just-hidden catalog clickable through its fade-out. Pinned in Task 7 by `drawPick drops a catalog switched off while its fade-out runs`. PR 2 retires this split (SQ2); this PR keeps it.
   - **V2 per-view sphere sets.** `deriveView` asks for the spheres at its own view's camera and pixel scale, `sceneOccluderBodies` at `ctx.drawCamPos`/`ctx.drawPxPerRad`. A provider that caches one answer per frame sizes NEAR0 or the occluders from the wrong camera. The existing `deriveView.test.ts` and `sceneOccluderSpheres.test.ts` star-sphere cases pin the values and must pass unchanged.
   - **V1 opaque-equivalence.** OVER at alpha 1 is the opaque replace only while the destination texel is finite: `dst × 0` is `NaN` for an `Inf` texel (an `rgba16float` overflow), where replace ignored it. The `#focus=body-sun` before/after pair is the check.
   - **M2 caption order.** The Voyager captions leave core's producer (registered first, `engine.ts:316-322`) for the missions Layer's (registered in composition order, after the star captions). The director's declutter ranks by `prominencePx`, stable on input order (`label2DDirector.ts:170-182`). A meshBody caption's score is `CAPTION_PRIORITY.meshBody × CAPTION_TIER_SCALE + min(sizePx, CAPTION_TIER_SCALE − 1)` with a strictly positive size, so it can tie only another caption of the same kind and size, and the two Voyagers keep their relative order. The ranking cannot change. What changes is the order of the merged label array, so two overlapping captions that cross-fade during a declutter swap composite in the other order. Accepted as neutral (no rest-state pixel differs); the reviewer confirms that nothing else reads the merged order.
   - **M1 exhibit takeover.** `#exhibit=voyager-missions` must still turn the trails on and restore them off on exit. The trail switch moves from `missions` to `missionTrails`; both clusters are captured whole (`captureSettings.ts`), so the takeover restores both.
2. **Core names no Layer key.** Run from the worktree root after Group B. Each grep must print nothing:
   ```bash
   grep -rnE "starCatalogs|visibleStars|positionedVisibleStars|partitionStarsByResolution|PositionedStar|STAR_RESOLVE_PX" src/services/engine/frame src/services/engine/helpers src/@types/engine/frame
   grep -rnE "deriveSourceMasks|sourceMaskOf|visibleSourceMask|SourceMasks" src/services src/@types/engine/frame
   grep -nE "missions|SAMPLED_BODIES|emphasisDim" src/services/engine/presentation/produceSceneBodyCaptions.ts
   ```
   A comment that names a Layer's helper as history is a finding too: rewrite it.

## Dispatch groups

Two grouped dispatches, one commit per task, one whole-branch review at the end, CI as the gate. Mid-branch reviews for the `review: yes` tasks run once per group, at the group's end, scoped to that group's tagged tasks.

| Group | Tasks | Theme | Model |
|---|---|---|---|
| A | 1, 2, 3, 4 | Settings and registry data: `labelLayer` deletion, the black-hole record, the body Layer with `orbitTrails`, the `missionTrails` cluster | Opus (`review: yes` on 2 and 4) |
| B | 5, 6, 7, 8 | Frame and caption seams: Voyager captions into the missions Layer, `nearSpheres` (V2), the galaxy mask (V3), the sphere opacity slot (V1) | Opus (`review: yes` on 6 and 8) |

The final review runs the two Review Focus checks above plus `entanglement-radar` over the branch diff. **No deletion audit runs on this PR** (a prep PR; the audit runs once, at PR 2's `/feature-done`).

---

## Group A: settings and registry data

### Task 1: Delete the unread `SourceEntryBase.labelLayer`

Its own commit (ruled). Nothing reads the field: no `.labelLayer` access exists in `src`, `tests` or `tools`; the `labelLayer` hits in tests are the `FadeId` kind, which PR 2 deletes.

**Files:** `src/@types/data/SourceEntryBase.d.ts` (the field at `:43-46` and the sentence naming it at `:32`), delete `src/@types/animation/CategoryLabelLayer.d.ts` (its only user is that field); the 16 rows: `src/data/sources/{earth,mesh-body,planet}.ts`, `src/layers/blackHoles/sources/sgrAStar.ts`, `src/layers/galaxyCatalog/sources/famous-galaxy.ts`, `src/layers/milkyWay/sources/milky-way.ts`, `src/layers/starCatalog/sources/{famous-star,sun}.ts`, `src/layers/structure/sources/{galaxyCluster,galaxyGroup,gcCluster,globularCluster,nebula,openCluster,supercluster,void}.ts`; `src/services/animation/visibilityActionRow.ts` (the stale "Partial record" comment at `:116-117`: `cosmicWebDensity.items` carries every field from boot); `tests/helpers/conventions/inlineTypeFiles.ts` if it lists the deleted type.

- [x] Delete the field, the type and the comment. No test: a deletion the compiler checks.
- [x] Commit.

### Task 2: Complete `blackHoles.items`

**review: yes**: Redux state.

`BlackHolesSettings.items` is typed `Record<BlackHoleId, …>`, but `initialState.ts` hand-lists Sgr A* and `setBlackHoleLabelEnabled` replaces the whole item (`slice.ts:18`, `items[id] = { labelEnabled }`). Sgr A* is today's only hole (`blackHoleSourceRows.ts:12-14`), so deriving the record changes no value.

**Files:** `src/layers/blackHoles/state/blackHoles/initialState.ts`, `src/layers/blackHoles/state/blackHoles/slice.ts`; create `tests/layers/blackHoles/state/blackHoles/blackHolesSlice.test.ts` (neither file has a test today).

**Contract:** `initialState.items` = every id of `BLACK_HOLE_SOURCE_ROWS` → `{ labelEnabled: true }`. `setBlackHoleLabelEnabled` writes `items[id].labelEnabled` and leaves the item's other fields alone.

- [x] Test `the initial blackHoles.items has a row for every black-hole id`, iterating `BLACK_HOLE_SOURCE_ROWS` (a structural invariant: it fails if the derivation drops a row).
- [x] Test `setBlackHoleLabelEnabled writes the field, not the item`: seed an item with a second field (cast in the test), dispatch, and assert the second field survives. It fails on today's replace. This is the pattern PR 2's `setVisibility` relies on (its Review Focus #5).
- [x] Commit.

### Task 3: The body Layer's `layer.ts`, and the `orbitTrails` cluster moves into it

**Files:** create `src/layers/body/layer.ts`; modify `src/compositions/app.ts` (append `bodyLayer` last to `layers` and to the `satisfies` tuple); moves `src/state/settings/core/orbitTrails/{slice,selectors,initialState}.ts` → `src/layers/body/state/orbitTrails/`, plus the importers the tool rewrites (`src/state/settings/coreSettingsSlices.ts`, `src/compositions/selectToggleRows.ts`, `src/data/exhibits/solarSystem.ts`, `src/services/animation/visibilityActionRow.ts`, `tests/state/settings/makeSettingsFixture.ts`, `tests/components/containers/LabelsAndGuidesSectionContainer.test.ts`, `tools/site/utils/siteShotActions.ts`, `tools/utils/capture/sceneDeclutterActions.ts`); then modify `src/layers/body/state/slices.ts`, `src/state/settings/coreSettingsSlices.ts`, `src/data/settings/coreSnapshotClusters.ts`, and the slice's header comment.

**Contract:**

```ts
// src/layers/body/layer.ts
export const bodyLayer = defineLayer({
  name: 'body', settings: bodyLayerSettings,
  create: () => undefined, destroy: () => {}, passes: () => [],
});
```

`create`/`destroy`/`passes` are required members (`Layer.d.ts:68-76`). The header says the Layer owns the body settings clusters and that body render and load code stay in core. It joins `APP_COMPOSITION` last, so in PR 2 its panel row is the last Layer row. Nothing reads `Layer.settings` at runtime (it types the composition; the reducer reads `APP_SETTINGS_SLICES`, which already folds `bodyLayerSettings` in), so appending it changes no behaviour.

- [x] Run the moves (pure-move commit, no content edits):
  ```bash
  npm run move-files -- src/state/settings/core/orbitTrails/slice.ts src/layers/body/state/orbitTrails/slice.ts --dry
  npm run move-files -- src/state/settings/core/orbitTrails/slice.ts src/layers/body/state/orbitTrails/slice.ts
  npm run move-files -- src/state/settings/core/orbitTrails/selectors.ts src/layers/body/state/orbitTrails/selectors.ts
  npm run move-files -- src/state/settings/core/orbitTrails/initialState.ts src/layers/body/state/orbitTrails/initialState.ts
  ```
  Then grep for `settings/core/orbitTrails`; the result must be empty. Commit the move.
- [x] Edit commit: add `orbitTrailsSlice` to `bodyLayerSettings`, remove it from `CORE_SETTINGS_SLICES`, remove `'orbitTrails'` and its doc line from `CORE_SNAPSHOT_CLUSTERS` (`coreSnapshotClusters.ts:7,10`): the cluster is now captured as a Layer cluster, so the snapshot keys are unchanged. Reword the slice header ("core's" → the body Layer's; the switch also governs the star catalog's S-star trails, which the same core `orbitTrailsPass` draws). Write `body/layer.ts` and append it to `APP_COMPOSITION`.
- [x] The hand-authored Orbit trails row in `selectToggleRows.ts:69-75` stays, in its place (PR 2 replaces it).
- [x] No new test. `tests/compositions/appSettingsSlices.test.ts` (claimed once, never by core) and `restoreSceneSaga.test.ts`'s whole-cluster round trip already cover the move.
- [x] **Gate:** `npx tsc --noEmit` passes.
- [x] Commit.

### Task 4: Mission trails get their own `missionTrails` cluster (M1)

**review: yes**: Redux state, and the exhibit takeover.

The trail switch is `MissionsSettings.trails` (`src/@types/settings/MissionsSettings.d.ts:7`), the one show switch not named `enabled`. It moves to its own cluster `missionTrails: { enabled }`, shaped like `orbitTrails`. `missions` keeps `craft` and `speed`. Same default (off), same writers, same readers, new address.

**Files:**
- create `src/@types/settings/MissionTrailsSettings.d.ts`, `src/layers/missions/state/missionTrails/{slice,selectors,initialState}.ts`
- modify `src/@types/settings/MissionsSettings.d.ts` (drop `trails`; the header's "`trails` is off by default" sentence moves to the new type), `src/layers/missions/state/missions/{slice,selectors,initialState}.ts` (drop `setMissionTrailsEnabled`, `selectMissionTrailsEnabled`, `trails`; reword the slice's one-line header at `:1`), `src/layers/missions/state/slices.ts` (`[missionsSlice, missionTrailsSlice]`)
- readers and writers: `src/layers/missions/passes/missionTrailsPass.ts` (`:3` header, `:32` gate → `state.settings.missionTrails.enabled`), `src/layers/missions/present/missionTrailsFadeRows.ts` (`:17-18` seed and intent), `src/layers/missions/ui/missionTrailsSettingsRow.ts` (imports), `src/layers/missions/exhibits/voyagerMissions.ts:52` (`missionTrails: { enabled: true }` beside `missions: { ...missionsInitialState, craft: CRAFTS[0]!.bodyId }`), `src/services/animation/visibilityActionRow.ts:26` (import path), `src/@types/animation/FadeId.d.ts:45-46` (comment), `packages/website/src/data/docsSettings.ts:540` (`state: 'missionTrails.enabled'`)
- test fixtures: `tests/state/settings/makeSettingsFixture.ts` (`:55,124`, add the `missionTrails` cluster), `tests/state/scene/restoreSceneSaga.test.ts:70` (flip `missionTrails.enabled`), `tests/layers/missions/passes/missionTrailsPass.test.ts:18`, `tests/layers/missions/ui/stepTimelineEvent.test.ts:18`, `tests/layers/starCatalog/passes/starPointsPass.test.ts:294`, `tests/helpers/engine/makeFadeBridgeState.ts:104`, `tests/services/engine/phases/wireSlots.test.ts:341`, `tests/services/engine/wiring/fadeLayers.test.ts:86,153`

**Contract:**

```ts
export type MissionTrailsSettings = { enabled: boolean };
// slice: name 'settings/missionTrails', reducerPath 'missionTrails', initialState { enabled: false }
// reducers: setMissionTrailsEnabled(boolean) writes missionTrails.enabled (moved here, same name)
// selectors: selectRoute, selectMissionTrailsEnabled (moved here, same name)
```

The `settings/` action-type prefix is what makes `watchFadesSaga` react (`watchFadesSaga.ts:17-18`); keep it. The URL does not carry either cluster. No shipped cue addresses `missionTrails`.

- [ ] Split the cluster and re-point every reader and writer above. Grep `src tests tools packages` for `missions.trails`, `trails:` inside a `missions` literal, and `missions/selectors`/`missions/slice` imports of the two moved symbols; the result must be empty.
- [ ] No new test: the compiler catches every stale `missions.trails` read and the exhibit's excess `trails` property; `restoreSceneSaga.test.ts` round-trips the new cluster; `docsReference.test.ts`'s `starts every setting where the app does` catches the website row.
- [ ] Commit.

---

## Group B: frame and caption seams

### Task 5: The Voyager captions move into the missions Layer (M2)

Today core's `produceSceneBodyCaptions.ts:66-72` multiplies each sampled craft's caption by `emphasisDim(state.settings.missions.craft, …)` over `SAMPLED_BODIES`: core reads a Layer's cluster. The missions Layer gets its own NEAR0 caption producer for the sampled craft, with the emphasis dim inside it. Core's `sceneBodyLabels` stops captioning them. Every caption keeps today's id (`sceneBody-voyager1`, `sceneBody-voyager2`), kind (`meshBody`), fade rule, clip key (`bodyLabel`), recession, occluders and pick id. Only the producer that emits it changes.

**Files:**
- create `src/layers/missions/present/produceMissionCaptions.ts`, `src/utils/labels/meshBodyCaption.ts` (the mesh-body caption build at `sceneBodyLabels.ts:113-125`, with `captionRevealBand` at `:65-74`), `src/utils/labels/captionComposeContextOf.ts` (the `CaptionComposeContext` build that `produceSceneBodyCaptions.ts:48-64`, `produceStarCaptions.ts:80-90` and `produceBlackHoleCaptions.ts:41-51` each write out field for field; this task would add a fourth copy), `src/data/missions/sampledBodyIds.ts` (the ids `spacecraftPresent.ts:14` collects inline)
- modify `src/layers/missions/layer.ts` (`guides: () => ({ screenLabels: [{ slab: NEAR0, id: 'missionCaptions', produceLabels: produceMissionCaptions }] })`), `src/services/engine/presentation/produceSceneBodyCaptions.ts` (drop `:17-18` and the craft read and dim at `:66-72`; every caption takes `clipFactorBody`; header), `src/services/engine/presentation/sceneBodyLabels.ts` (mesh bodies minus `SAMPLED_BODY_IDS`, built through `meshBodyCaption`; header names the missions Layer as the craft's captioner), `src/utils/scene/spacecraftPresent.ts` (import the list in place of its inline `SAMPLED_IDS` set), `src/layers/starCatalog/present/produceStarCaptions.ts` and `src/layers/blackHoles/present/produceBlackHoleCaptions.ts` (use `captionComposeContextOf`)
- tests: create `tests/layers/missions/present/produceMissionCaptions.test.ts`; modify `tests/services/engine/presentation/produceSceneBodyCaptions.test.ts` (the emphasis case at `:302-326` moves to the new file; drop the `missions` fixture at `:119`), `tests/services/engine/presentation/sceneBodyLabels.test.ts` (`:21-29` expects the non-sampled mesh bodies)

**Contract:**

```ts
// src/data/missions/sampledBodyIds.ts
export const SAMPLED_BODY_IDS: readonly string[]            // SAMPLED_BODIES' ids, in order
  // an array, not a Set: PR 2's missions label entry declares it as its `items` (M4);
  // readers use `.includes` (two ids)
// src/utils/labels/meshBodyCaption.ts
meshBodyCaption(body: MeshBody, positionMpc: Readonly<Vec3>): ForegroundCaption
  // today's sceneBodyLabels.ts:116-124 object: bodyCaption(…, 'meshBody') + bodyId + revealBand
// src/utils/labels/captionComposeContextOf.ts
captionComposeContextOf(state: EngineState, ctx: FrameView): CaptionComposeContext
  // today's produceSceneBodyCaptions.ts:48-64 fields, occluders included
// src/layers/missions/present/produceMissionCaptions.ts
produceMissionCaptions(state: EngineState, ctx: FrameView): Label2DProducerOutput
  // SAMPLED_BODIES order; a craft only while spacecraftPresent(id, simDays) and not anchored, as today;
  // composeForegroundCaption(captionComposeContextOf(state, ctx), meshBodyCaption(…),
  //   clipOpacityOf('bodyLabel', nowMs) × emphasisDim(state.settings.missions.craft, id)); awake: false
```

- The emphasis dim is read after any memo, never inside it, as today (`produceSceneBodyCaptions.ts:66-67`): the visitor can switch craft on a paused clock.
- `SAMPLED_BODY_IDS` in `sceneBodyLabels.ts` is this PR's interim: the one place core still knows which bodies the missions Layer captions. PR 2 replaces the filter with a generic rule (M4): core's body captions skip every body id another Layer's label entry claims in its `items`, and the missions label entry declares `items: SAMPLED_BODY_IDS`. This PR keeps the filter, because label entries do not exist yet. `produceSceneBodyCaptions.ts` names neither the set nor `missions`.
- Behaviour-neutrality: same ids, so the director's per-id envelopes and the upload key (`label2DDirector.ts:376-385`) carry over; same `prominencePx`, so declutter ranks identically (Review Focus #1, M2 caption order). If anything else turns out to read the merged producer order, STOP and report.

- [ ] Test `each present sampled craft is captioned by exactly one producer` (`produceMissionCaptions.test.ts`): with both tracks loaded, `sceneBodyLabels` emits no id of `SAMPLED_BODY_IDS`, and `produceMissionCaptions` emits `sceneBody-voyager1` and `sceneBody-voyager2` once each. Mutation-check by dropping the core exclusion (duplicate) or the Layer's presence filter.
- [ ] Move `dims only the non-emphasised sampled craft, on a state the memo already saw` into the same file against `produceMissionCaptions`, unchanged in value (`full × MISSION_EMPHASIS_DIM`).
- [ ] No test for `captionComposeContextOf` or `meshBodyCaption`: the occlusion, reveal-band and kind cases in `produceSceneBodyCaptions.test.ts`, `sceneBodyLabels.test.ts`, `produceStarCaptions.test.ts` and `produceBlackHoleCaptions.test.ts` exercise both through their callers and must pass unchanged.
- [ ] Commit.

### Task 6: Core's star helpers move into the star Layer behind a `nearSpheres` source (V2)

**review: yes**: a new `Layer` contract member, and it feeds NEAR0's painter range.

Today four core frame files read the star Layer's settings and name its seed tables: `visibleStars.ts`, `positionedVisibleStars.ts`, `frameContext.ts:113-119` (the NEAR0 range input, `ReadyFrameContext.positionedStars`, partitioned per view at `deriveView.ts:116-133`) and `sceneOccluderBodies.ts:34-39,54-56`. After this task they live in the star Layer, and core asks every Layer through one generic member: a Layer that draws opaque spheres on the NEAR0 row declares a `nearSpheres` source, and core binds it once per frame into `ReadyFrameContext.nearSpheres`, the way it binds `bodyPose`. The star source reads today's switches itself, through the frame's settings. PR 2 replaces that input with a liveness predicate core binds. No core frame file names the star catalog afterwards.

Callers today (whole-`src/` grep): `visibleStars` from `frameContext.ts:116`, `positionedVisibleStars.ts:27` and `starCatalog/create.ts:68`; `positionedVisibleStars` from `starPointsPass.ts`, `starSpheresPass.ts` and `sceneOccluderBodies.ts:35`; `partitionStarsByResolution` from `deriveView.ts:116`, `sceneOccluderBodies.ts:34`, `starPointsPass.ts` and `starSpheresPass.ts`, plus `STAR_RESOLVE_PX` in `fieldStarSpherePass.ts:124`; `sceneOccluderBodies` itself from `orbitTrailsPass` (via `sceneOccluderSpheres`), `near0SelectionRingPass.ts:180` and, after Task 5, `captionComposeContextOf` (every NEAR0 caption producer). Once core reads the provider, the partition has only star-Layer callers, so it moves too; `PositionedStar` has only star-Layer users, so it moves into the Layer's `@types/`. `starSphereRangeM` and `slabs.ts`'s `starSphereRangeM` input keep their names: NEAR0 is the star row by `FRAME_ORDER`'s design (`frameSections.ts:238`).

No existing `Layer` member fits: `slabs` are static `body-m` rows, `guides` are labels and trail rows, and nothing contributes occluders or a NEAR0 range today.

**Files:**
- moves (pure-move commit first, no content edits), each with `--dry` first:
  ```bash
  npm run move-files -- src/services/engine/frame/visibleStars.ts src/layers/starCatalog/present/visibleStars.ts --dry
  npm run move-files -- src/services/engine/frame/visibleStars.ts src/layers/starCatalog/present/visibleStars.ts
  npm run move-files -- src/services/engine/frame/positionedVisibleStars.ts src/layers/starCatalog/present/positionedVisibleStars.ts
  npm run move-files -- src/services/engine/frame/partitionStarsByResolution.ts src/layers/starCatalog/present/partitionStarsByResolution.ts
  npm run move-files -- src/@types/scene/PositionedStar.d.ts src/layers/starCatalog/@types/PositionedStar.d.ts
  ```
  The tool drags `tests/services/engine/frame/{visibleStars,positionedVisibleStars,partitionStarsByResolution}.test.ts` to `tests/layers/starCatalog/present/`. Then grep `src tests tools` for each old path. If the tool refuses the `.d.ts`, STOP and report.
- create `src/@types/engine/frame/NearSphere.d.ts`, `NearSphereSource.d.ts`, `NearSphereProvider.d.ts`; `src/layers/starCatalog/present/starNearSpheres.ts`
- modify `src/@types/engine/layer/Layer.d.ts`, `src/@types/engine/layer/LayerInstance.d.ts`, `src/services/engine/layer/instantiateLayer.ts`, `src/services/engine/phases/createLayers.ts`, `src/@types/engine/state/EngineState.d.ts` (`nearSphereSources`), `src/services/engine/engine.ts` (initial `[]`), `src/@types/engine/frame/ReadyFrameContext.d.ts` (`positionedStars` → `nearSpheres`), `src/services/engine/frame/frameContext.ts`, `src/services/engine/frame/deriveView.ts`, `src/services/engine/frame/sceneOccluderBodies.ts`, `src/layers/starCatalog/layer.ts` (`nearSpheres`), `src/layers/starCatalog/passes/{starPointsPass,starSpheresPass}.ts` (new `positionedVisibleStars` signature), `src/layers/README.md` (a `nearSpheres?` row → `present/`)
- modify `tests/services/engine/frame/frameFilePurity.test.ts`: delete the `'frame/visibleStars'` and `'frame/partitionStarsByResolution'` rows (their files left `frame/`)
- tests: whichever of `tests/services/engine/frame/{frameContext,frameContext.meshBodyHost,deriveView,sceneOccluderSpheres,runFrame,renderFrame,renderFrame.cubemapCaptures,renderFrame.plans,renderFrame.timing}.test.ts`, `tests/services/engine/helpers/pickFrameContext.test.ts`, `tests/services/engine/frame/passes/orbitTrailsPass.test.ts`, `tests/services/engine/presentation/produceSceneBodyCaptions.test.ts`, `tests/layers/starCatalog/present/{visibleStars,positionedVisibleStars,produceStarCaptions}.test.ts`, `tests/layers/starCatalog/passes/{starPointsPass,starSpheresPass}.test.ts`, `tests/layers/starCatalog/create.test.ts` build a `ReadyFrameContext` or stub `starCatalogs` only to reach the star set

**Contract (this PR's shape; PR 2 swaps `settings` for a core-bound `live` and adds `fade`):**

```ts
// Layer gains (beside planners; invoked from instantiateLayer like every member):
nearSpheres?(runtime: Runtime): NearSphereSource;
// LayerInstance: readonly nearSpheres: NearSphereSource | null
// EngineState:   nearSphereSources: readonly NearSphereSource[]   (composed in createLayers)

// NearSphere.d.ts
type NearSphere = { readonly positionMpc: Readonly<Vec3>; readonly surface: BodySurface };
// NearSphereSource.d.ts
type NearSphereSource = {
  spheres(input: {
    readonly bodyStates: ReadonlyMap<BodyId, BodyState>; // the frame's one sample
    readonly settings: EngineSettingsState;               // today's switch reads, the source's own
    readonly camPosMpc: Readonly<Vec3>;
    readonly pxPerRad: number;
  }): readonly NearSphere[]; // the opaque spheres this source draws on NEAR0 for that camera
};
// NearSphereProvider.d.ts
type NearSphereProvider = (camPosMpc: Readonly<Vec3>, pxPerRad: number) => readonly NearSphere[];

// ReadyFrameContext: positionedStars goes; nearSpheres: NearSphereProvider
//   bound in deriveFrameContext over state.nearSphereSources, the frame's bodyStates and state.settings
// deriveView:          snapshot.nearSpheres(drawCamPos, pxPerRad) → starSphereRangeM over outerBoundRadiusM
// sceneOccluderBodies: ctx.snapshot.nearSpheres(ctx.drawCamPos, ctx.drawPxPerRad) → innerBoundRadiusM

// star Layer, present/ (moved):
visibleStars(settings: StarCatalogSettings)           // unchanged signature
positionedVisibleStars(bodyStates: ReadonlyMap<BodyId, BodyState>, settings: StarCatalogSettings)
  : readonly PositionedStar[]
  // the passes call it with sceneBodyStates(state, ctx) and state.settings.starCatalogs
starNearSpheres: NearSphereSource
  // spheres: the `spheres` branch of partitionStarsByResolution over
  //   positionedVisibleStars(bodyStates, settings.starCatalogs) at (camPosMpc, pxPerRad, STAR_RESOLVE_PX)
```

- The provider binds once per frame and runs per call, as today's partition does (per view in `deriveView`, per call in `sceneOccluderBodies`). Do not cache a per-view answer on the snapshot: the pick path calls `deriveFrameContext` speculatively.
- `frameContext.ts` stays a one-export frame file: the provider is a closure inside `deriveFrameContext`, like `bodyPose` at `:100-111`.
- The surface rides out of the source, not a radius: the range takes `outerBoundRadiusM`, the occluders `innerBoundRadiusM` (`sceneOccluderBodies.ts:10-11`), as today.
- The field-star sphere stays out of the set, as today (`fieldStarSpherePass.ts:54-68`).
- `frameContext`'s `bodyStates` and `sceneBodyStates(state, ctx)` are the same memoised `deriveBodyStates(simDays)` map, so the sources see the positions the passes see.
- Fixture tests that stubbed `starCatalogs` only so `visibleStars` found nothing drop the stub: an empty `nearSphereSources` admits no star. Tests that need a star sphere register `starNearSpheres`.

- [ ] Run the moves; commit the pure move.
- [ ] `sceneOccluderSpheres.test.ts` and `deriveView.test.ts` keep their star-sphere cases (Sun resolved → an occluder at its inner bound; NEAR0's range spans it at its outer bound) through a registered `starNearSpheres`, unchanged in value. They fail if the provider is unbound, cached across views, or reads the wrong radius.
- [ ] No new test: the source is today's code behind a new call shape, and the cases above pin its values. PR 2 adds the liveness test when core binds `live`.
- [ ] **Gate:** `npx tsc --noEmit` passes (`NearSphereSource` reaches the settings root from `Layer.d.ts`).
- [ ] The first Review Focus #2 grep prints nothing.
- [ ] Commit.

### Task 7: The galaxy source mask moves into its Layer (V3)

Today core derives the galaxy catalogs' bitmasks (`deriveSourceMasks`, called at `runFrame.ts:85-89`, `cubemapCaptureFrame.ts:63-67` and `pickFrameContext.ts:29-34`) and threads one of them through `FrameContextInput`/`ReadyFrameContext.visibleSourceMask` (passed along at `frameContextInputOf.ts:24-26,40,55` and `frameContext.ts:48,136`): the draw mask on the frame and capture paths, the pick mask on the click path. Every reader of the field is inside the galaxy Layer (its planner and its point pass; the panel reads its own `selectVisibleSourceMask`). So the field goes, and the Layer computes the mask where it reads it, from the same settings and fades, at the same `nowMs` (`ctx.snapshot.nowMs` is the `nowMs` each of the three callers passed). Core derives nothing for galaxies afterwards.

**Files:**
- moves (pure-move commit first, `--dry` first):
  ```bash
  npm run move-files -- src/services/engine/frame/deriveSourceMasks.ts src/layers/galaxyCatalog/present/deriveSourceMasks.ts --dry
  npm run move-files -- src/services/engine/frame/deriveSourceMasks.ts src/layers/galaxyCatalog/present/deriveSourceMasks.ts
  npm run move-files -- src/@types/engine/frame/SourceMasks.d.ts src/layers/galaxyCatalog/@types/SourceMasks.d.ts
  npm run refactor -- rename src/layers/galaxyCatalog/present/deriveSourceMasks.ts#deriveSourceMasks sourceMaskOf
  npm run move-files -- src/layers/galaxyCatalog/present/deriveSourceMasks.ts src/layers/galaxyCatalog/present/sourceMaskOf.ts
  ```
  The tools drag `tests/services/engine/frame/deriveSourceMasks.test.ts` to `tests/layers/galaxyCatalog/present/sourceMaskOf.test.ts`. The `vi.mock('…/frame/deriveSourceMasks')` strings are not rewritten; the edit commit deletes them. `frameFilePurity.test.ts` has no row for the file.
- modify `src/layers/galaxyCatalog/frame.ts` (`:60,64,76,98,109`; the comment at `:111-113`), `src/layers/galaxyCatalog/passes/galaxyPointSpritesPass.ts` (`:4-7` header, `:55` draw, `:84-101` drawPick), `src/@types/engine/frame/{ReadyFrameContext,FrameContextInput}.d.ts` (`:84-85`, `:33-34`), `src/services/engine/frame/{frameContext,frameContextInputOf,runFrame,cubemapCaptureFrame}.ts`, `src/services/engine/helpers/pickFrameContext.ts`, `src/layers/galaxyCatalog/state/galaxyCatalogs/selectors.ts` (`:58-63` comment), `src/layers/galaxyCatalog/subsystems/texturedDiskSubsystem.ts` (comment `:221`)
- tests: the moved `tests/layers/galaxyCatalog/present/sourceMaskOf.test.ts`, `tests/layers/galaxyCatalog/passes/galaxyPointSpritesPass.test.ts`, `tests/layers/galaxyCatalog/frame.*.test.ts` (4 files), `tests/layers/galaxyCatalog/state/galaxyCatalogs/selectors.test.ts` (its cross-check import at `:6`), `tests/services/engine/frame/{runFrame,deriveView,frameContext,renderFrame}.test.ts`, `tests/services/engine/helpers/pickFrameContext.test.ts`, every test that `vi.mock`s `…/frame/deriveSourceMasks` (19 files at `7ab7ec0fd`: 3 under `tests/services/engine/camera/`, 15 under `tests/services/engine/frame/`, and `tests/state/arrival/arrivalSaga.test.ts`), and every fixture that sets `visibleSourceMask` on a frame context (grep `visibleSourceMask` under `tests/`; the `DiskWalkInput`, `HiResFamousFrameInput` and `GalaxyPointDrawSettings` fixtures keep theirs)

**Contract:**

```ts
// src/layers/galaxyCatalog/present/sourceMaskOf.ts (moved and renamed; body unchanged)
sourceMaskOf(state: Pick<EngineState, 'settings' | 'subsystems'>, nowMs: number): SourceMasks
  // { draw: enabled || fade > 0, pick: enabled }, per GALAXY_CATALOG_SOURCES code, as today
// planner (frame.ts plan):   const mask = sourceMaskOf(state, snapshot.nowMs).draw, once per plan,
//                            wherever snapshot.visibleSourceMask was read
// point pass draw:           visibleSourceMask: sourceMaskOf(state, ctx.snapshot.nowMs).draw
// point pass drawPick:       filters loadedSources() on sourceMaskOf(state, ctx.snapshot.nowMs).pick
```

PR 2 narrows `sourceMaskOf` to `(fade) => number` over the handed `survey` record and deletes `SourceMasks` (SQ2). Here it keeps both masks, because the pick split is today's behaviour.

- `DiskWalkInput.visibleSourceMask`, `HiResFamousFrameInput.visibleSourceMask`, `GalaxyPointDrawSettings.visibleSourceMask` and `structureMemberCount`'s parameter keep their names and types. The renderer's mask skip stays.
- Core: `visibleSourceMask` leaves `FrameContextInput`, `ReadyFrameContext`, `frameContextInputOf`'s args and `deriveFrameContext`; the three calls and their comments go (`runFrame.ts:85-89` and the hand-off at `:164-171`; the first-statement note at `:80-82` stays, naming demand and the pose without the masks).

- [ ] Run the moves and the rename; commit the pure move.
- [ ] Test `drawPick drops a catalog switched off while its fade-out runs` (`galaxyPointSpritesPass.test.ts`; Review Focus #1): SDSS `enabled: false` with its fade at 0.5 → `drawPick` hands the pick renderer no SDSS source, while `draw` still passes a mask with the SDSS bit set. Mutation-check by reading `.draw` in `drawPick`.
- [ ] Tests: the 19 `vi.mock` blocks go, with `runFrame.test.ts`'s fixture comments that justify them (`:36-43,164-167,196-200`). `runFrame.test.ts`'s ordering case (`:722-760`) re-points at `reevaluateDemand` (already a `vi.fn` mock at `:32-34`) as `ticks clipPlayer before reevaluateDemand`. Delete `deriveView.test.ts`'s `carries the draw mask, not the pick mask` (`:466-472`), `pickFrameContext.test.ts`'s `carries the pick mask as visibleSourceMask` (`:189-197`), and the mask half of `frameContext.test.ts`'s `exposes visibleSourceMask and a seeded focus` (`:210-218`; the focus half stays): the new pass test owns the split. `renderFrame.test.ts:755`'s mask assertion goes. The four `frame.*.test.ts` fixtures drop the snapshot field and seed `galaxyCatalogs` settings and fades instead.
- [ ] The second Review Focus #2 grep prints nothing.
- [ ] Commit.

### Task 8: The star sphere pipeline gains an opacity, held at 1 (V1)

**review: yes**: a shader edit and a TS↔WGSL uniform contract.

**Implementer brief, before anything else:** (1) invoke the `wesl-shaders` skill; (2) read `docs/RENDERER.md` in full; (3) no backtick anywhere in a `.wesl` file, comments included: quote identifiers as `'opacity'`.

PR 2 makes a resolved star sphere fade with its catalog. This task builds the slot and the blend at a fixed opacity of 1, so the draw is today's: OVER with alpha 1 gives `src·1 + dst·0` in colour and `1 + dst·0` in alpha, the opaque replace.

**Files:** `src/services/gpu/shaders/lib/sphere.wesl` (`TintedSphereUniforms` and its byte-layout comment at `:71-82`), `src/services/gpu/shaders/bodies/star/fragment.wesl` (the return and its "Bindings / blend target" comment at `:22-28`), `src/services/gpu/shaders/bodies/star/vertex.wesl` (the layout comment at `:12-13`, if it no longer reads true), `src/layers/starCatalog/render/starRenderer.ts` (pipeline blend at `:136-141`, `draw` at `:158-164`, header), `src/layers/starCatalog/@types/StarRenderer.d.ts`, `src/layers/starCatalog/passes/starSpheresPass.ts` (`:118`), `src/layers/starCatalog/passes/fieldStarSpherePass.ts` (`:253`); tests `tests/layers/starCatalog/render/starRenderer.test.ts`, plus the two pass tests if they assert `draw`'s arguments.

**Contract:**

```wgsl
struct TintedSphereUniforms {
  mvp: mat4x4<f32>,   // bytes  0..63
  tint: vec3<f32>,    // bytes 64..75
  opacity: f32,       // bytes 76..79: the struct's former trailing pad; size stays 80
};
// star/fragment.wesl: returns vec4<f32>(u.tint * EMISSIVE, u.opacity)   (straight, not premultiplied)
```

```ts
StarRenderer.draw(pass: GPURenderPassEncoder, mvp: Float32Array, color: Vec3, opacity: number): void
  // uniformScratch[19] = opacity (byte 76), in the same one 80-byte writeBuffer as mvp and tint
// pipeline colour target: straight-alpha OVER, the factors cloudShellRenderer.ts:234-245 inlines:
//   color { src-alpha, one-minus-src-alpha, add }   alpha { one, one-minus-src-alpha, add }
// depthStencil unchanged: depthWriteEnabled true, depthCompare resolveDepthCompare('nearer', reversedZ)
// starSpheresPass and fieldStarSpherePass: draw(…, 1)   (PR 2 hands their catalog's value)
```

- `TintedSphereUniforms` has no reader outside the star vertex and fragment modules.
- **Landmines** (RENDERER.md and the shader memory):
  - keep the explicit bind-group layout (`starRenderer.ts:93-110`); binding 0 is already visible to both stages. Never switch to `layout: 'auto'`.
  - the one non-dynamic uniform buffer (`starRenderer.ts:25-29`): opacity rides the existing single `writeBuffer`, with no second write.
  - iOS rejects what Chrome's Tint tolerates and then drops the whole frame silently: a struct past 80 bytes against the 80-byte buffer is the trap. Check `createShaderModuleWithDevLog` output in the dev-server console after the edit.
  - OVER multiplies the destination by `1 − alpha` = 0. A non-finite destination texel (`0 × Inf` is `NaN`) would show where replace hid it. The `#focus=body-sun` before/after pair is the check; if it differs, STOP and report.
  - the overlays read `foreground:0` alpha for caption occlusion (RENDERER.md, "Caption/label occlusion reads alpha"): at opacity 1 the written alpha is 1, as today.
- `STAR_EMISSIVE` and its parity test are untouched.

- [ ] Test `draw writes the opacity at byte 76` (`starRenderer.test.ts`; a uniform byte-layout keep-rule, `testing.md`): `draw(pass, mvp, [0.2, 0.4, 0.6], 0.5)` → the written `Float32Array` has length 20, `[16..18]` = the tint and `[19]` = 0.5. Mutation-check by writing index 18.
- [ ] Rewrite `bakes the opaque foreground profile` as `blends straight-alpha OVER with depth write kept`: the colour target's `blend` equals the factors above and `depthStencil` still matches `{ depthWriteEnabled: true, depthCompare: 'less' }`. Update the `draw.length` arity assertion to 4.
- [ ] Load the dev server at `#focus=body-sun` and check the console for shader compile errors before committing.
- [ ] Commit.

---

## Definition of Done

**Deliverables**
- [ ] `SourceEntryBase.labelLayer` and `CategoryLabelLayer` gone.
- [ ] `blackHoles.items` derived from `BLACK_HOLE_SOURCE_ROWS`; `setBlackHoleLabelEnabled` writes the field.
- [ ] `src/layers/body/layer.ts` last in `APP_COMPOSITION`; the `orbitTrails` cluster under `src/layers/body/state/orbitTrails/`, out of `CORE_SETTINGS_SLICES` and `CORE_SNAPSHOT_CLUSTERS`.
- [ ] `missionTrails: { enabled }` cluster in the missions Layer; `MissionsSettings` holds `craft` and `speed` only.
- [ ] `produceMissionCaptions` in the missions Layer's `guides`; `produceSceneBodyCaptions.ts` names no `missions` setting, no `SAMPLED_BODIES`, no `emphasisDim`; `captionComposeContextOf`, `meshBodyCaption`, `SAMPLED_BODY_IDS` each in their own file.
- [ ] `Layer.nearSpheres` with `NearSphere`, `NearSphereSource`, `NearSphereProvider`; `ReadyFrameContext.nearSpheres` in place of `positionedStars`; `visibleStars`, `positionedVisibleStars`, `partitionStarsByResolution` and `PositionedStar` under `src/layers/starCatalog/`, with `starNearSpheres` as the star Layer's source; the two `frameFilePurity` rows gone.
- [ ] `sourceMaskOf` and `SourceMasks` under `src/layers/galaxyCatalog/`; `visibleSourceMask` gone from `FrameContextInput` and `ReadyFrameContext`; core's three `deriveSourceMasks` calls gone.
- [ ] `TintedSphereUniforms.opacity` at byte 76 (struct still 80 bytes); the star sphere pipeline blends straight-alpha OVER with depth write kept; both sphere passes draw at opacity 1.
- [ ] The three Review Focus #2 greps print nothing.

**Pixel-identical before/after** (main's server vs this branch's, same link, `npm run shot -- '<link>' --url <server> --png`, each pair compared by eye and by a pixel diff; any difference is a STOP)
- [ ] `#focus=body-sun&t=2026-01-01T00:00:00Z`, close enough that the Sun is a resolved sphere (V1, V2: sphere, NEAR0 range, orbit-trail occlusion behind it).
- [ ] `#exhibit=voyager-missions` at its opening pose: both trails drawn, Voyager 1's caption full, Voyager 2's dimmed by the emphasis (M1, M2). Leaving the exhibit restores the trails off.
- [ ] `#focus=m31&t=2026-01-01T00:00:00Z`: galaxy points, LOD disks and famous labels (V3).
- [ ] `#focus=body-earth&t=2026-01-01T00:00:00Z` with the Settings panel's Labels & guides section open: same rows, same order (Orbit trails still after the label categories and before the Layer rows), same states.

**Operable checks** (not pixels)
- [ ] At `#focus=m31`, switching SDSS off fades its points out; while they fade, clicking an SDSS galaxy selects nothing (pick follows intent, today's rule).
- [ ] At `#exhibit=voyager-missions`, the Mission trails checkbox fades the trails out and back in; the Mesh bodies label checkbox still hides the Voyager captions with the other mesh-body names; switching craft on a paused clock moves the emphasis.
- [ ] The Orbit trails checkbox still toggles the planets' trails and, at `#focus=blackhole-sgr-a-star`, the S-star trails.

**Deferral boundary:** no visibility type, entry, address or `setVisibility` exists in this PR; every fade, switch and clip read stays as today, including the Voyager captions' `bodyLabel` clip and `mesh-body` fade rule, the star source's switch reads and the galaxy pick split. `sceneBodyLabels.ts` keeps excluding the craft by `SAMPLED_BODY_IDS` (PR 2's claimed-body rule replaces it, M4). The hand-authored Orbit trails row stays. All of that is PR 2 (`docs/superpowers/plans/2026-10-14-layer-declared-visibility.md`). No deletion audit runs on this PR.
