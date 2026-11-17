# The v2 Milky Way field in the `milkyWay` Layer: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under
> `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** the app can draw the v2 analytic Milky Way field in the `milkyWay` Layer beside the v1
sprite cloud, behind a DebugPanel switch `renderer: 'v1' | 'v2' | 'both'` that defaults to `'v1'`;
the tool and the app drive one shared host.

**Architecture:** PR 0 (another agent, not planned here) moves the whole v2 engine into
`src/layers/milkyWay/field/`. PR A then splits the multi-function builders, gives the field a
`FieldView` camera with a four-tangent frustum, makes targets `{ view, sizePx }`, and promotes the
host out of the tool with one `FieldFramePlan`. PR A leaves the app untouched and is verified in the
tool. PR B nests the settings into `cloud` / `field`, then adds the Layer growth: a parts selector,
target rows, a lazily created host, a `mw-field` compute, a `milky-way-field` composite pass, v1
gates and DebugPanel rows.

**Spec:** `docs/superpowers/specs/2026-11-10-milky-way-v2-field-in-layer-design.md` (rulings §2 are
final). **Module map:** the PR 0 manifest `field-moves-run.json`. Every path below is the
**post-PR-0 path**; where a task cites today's code it gives `today:` lines, which PR 0 moves but
does not edit.

**Tech stack:** TypeScript, WGSL via WESL (`weslStaticPlugin`), WebGPU, Redux Toolkit, Vitest.

## Spec contradictions and gaps (read before Task A0)

> [!RISK]
> **The frustum relayout touches 13 shader sites, not "five callers".** Spec §3 names
> `cameraRayFromUv` and `splatNdc` and their five call sites. Also reading `params` today:
> three inline ray builders (`fieldSplat/fragment.wesl:30-37`, `hiiSplat/shadeCommon.wesl:43-50`,
> `dustMap/fragment.wesl:166-173`), the `splatNdc` twin in `bubblePresent/vertex.wesl:25-27,51-52`,
> three pixel-footprint reads of `params.x` (`dustMap/fragment.wesl:82,312`,
> `hiiSplat/starGrain.wesl:83`) and two exposure reads of `params.w`
> (`fieldSplat/fragment.wesl:91`, `hiiSplat/shadeCommon.wesl:125`). Task A5 changes all of them.

> [!RISK]
> **"Pixel-identical" can miss by one bit.** The four-tangent form has the same maths as today's
> `(ndc + shift)·T·A` (see the A5 table), and y comes out bit-identical. In x, though, the frustum
> packs `f32(T·A)` rounded once in f64, where today's shader multiplies two f32 values. That can
> differ by 1 ULP in the ray direction, which can flip an isolated 8-bit LSB. Task A11 reports the
> differing-pixel count and the largest channel delta. The user rules on them; nobody chases them.

> [!RISK]
> **The dust-map clear latch isn't a pure function of the mixture.**
> `createGalaxyFieldRenderer.ts` today `:388-401` gates the dust map on
> `dust > 0 || drawDustView || populated`, where `populated` is a latch advanced during encode, so a
> pure `plan()` can't express it. **Resolution (Task A6):** the dust map encodes on every frame the
> field encodes, and the latch is deleted. At dust count 0 the cost is one empty clear of a ⅕-res
> target, and the target contents match today's.

> [!RISK]
> **The host API as specced can't feed the mixture or the tool's debug surface.** `setTuning`
> also needs `geometry`, `seed` and `extras` (today `createGalaxyModel.ts:217-227`). The tool also
> reaches the renderer for `encodeOverlays`, the probe, the ISM texture, `fieldCounts` and
> `hiiSegments`, and it reaches the readbacks for orientation and ring means. `encode` has no
> per-view exposure input either, yet spec §7 multiplies exposure by the per-view alpha.
> **Resolution (Task A9):**
> - `FieldHostTuning` carries `geometry`, `seed` and `extras`.
> - `encode` gains `exposure: number` after `camera`.
> - `GalaxyFieldHost` stays exactly the app contract. The factory returns `{ host, debug }`, and
>   `debug: GalaxyFieldHostDebug` carries the renderer and the readbacks for the tool. The app
>   ignores it.

> [!RISK]
> **A timing adapter that "ignores the slot name" times only the last pass.** Every pass would
> write the same query indices. **Resolution:** the renderer asks for timestamps by
> `FieldTargetId`; the tool derives its per-pass slot names from the id in one place (Task A10). The app's
> `spanTimestampWrites` gives the first encoded pass the begin index and the last one the end
> index, so `mw-field-compute` brackets the whole field (Task B6).

> [!RISK]
> **`createIsmMapReadbacks` imports a tool file.** It imports `decodeOrientationTexels`
> (`tools/galaxy-renderer/src/engine/ismMap/`), and it holds three streams on the one queue its
> header calls load-bearing. **Resolution (Task A7):** move it whole, together with
> `decodeOrientationTexels`. The app never requests the orientation or ring-means streams.

> [!NOTE]
> **`perView` scope with one set of header UBOs is safe (controller ruling, overriding a slot-0 gate).**
> `renderFrame.ts:101-133` flushes and submits each view before encoding the next, and the compute
> writes its headers (`queue.writeBuffer`) while encoding its own view. So view N's writes are
> ordered after view N−1's submit, the same guarantee `aerialPerspectiveCompute` relies on. The
> field therefore draws in every view, dome faces and VR eyes included; there is no `viewSlot` gate.
> Capture faces don't run SCENE computes. If a future change batches several views into one
> submit, this breaks along with `aerial-perspective`.

> [!RISK]
> **A DebugPanel-disabled compute leaves the composite adding stale targets.** `executeFrame.ts:228`
> skips a compute whose toggle `settings.debug.disabledPasses['mw-field-compute']` is on, but the
> composite pass has its own gate and would add the previous frame's targets.
> **Resolution (Task B6):** the shared gate `milkyWayFieldAlpha` also returns null when that toggle
> is on, reading the same `state.settings.debug.disabledPasses` record `executeFrame` reads
> (`debugSlice.ts:38`; `PassState` carries `settings`). The deeper fix, a `ContentCompute` that
> declares the targets it writes so `touched` sees them, grows the frame contract and is deferred.

> [!RISK]
> **The spec's type paths predate PR 0.** Spec §3–§5 put `FieldView` and `FieldTarget` under
> `src/@types/galaxy/`, `FieldTargetId` and `FieldFramePlan` under `field/host/@types/`, and the
> calibration row "in `field/data/`" sourced from `src/data/defaultRenderSettings.ts`.
> - `FieldView`, `FieldTarget`, `FieldTargetId` and `FieldFramePlan` go to `field/@types/`: the
>   renderer reads all four, and a `render → host` type import would invert the module direction.
> - `defaultRenderSettings.ts` is really at `tools/galaxy-renderer/src/data/`.
> - `DUST_MAP_FORMAT` exists only in the tool (`createGalaxyEngine.ts:76`).

> [!RISK]
> **The app bundles the field shaders for the first time in PR B.** The tool resolves them through
> its own `wesl.toml` symlink layout. The app resolves them from `src/services/gpu/shaders/` and has
> never built them. The `npm run build` in CI and the B11 first-light shots are the gate.

> [!RISK]
> **Units: the field must use v1's `GalaxyParams`.** `toGalaxy = inverse(milkyWayModelCached())`
> is right only if the host's geometry is `describeGalaxy(MILKY_WAY_GALAXY_PARAMS)`, the input the
> cloud uses (`cloud/render/milkyWayCloud.ts:20,72`). The test in Task B3 pins the eye against
> `milkyWayCamPosModel`. Task B3b's finding: the placement implies 17.5 kpc / 10.5 units =
> 1.6667 kpc per unit, which `pcToUnits` already had, only rounded as a literal; it now derives
> from `MILKY_WAY_MODEL_SCALE` (`src/data/milkyWay/milkyWayModelScale.ts`).

> [!RISK]
> **arms/utils would hold 17 files, over the cap of 15.** Splitting `armRidgeGeometry`,
> `armSpurGeometry`, `armParticleCloud` and `armSpurParticleCloud` puts 17 files there
> (`concernFolderShape.test.ts` caps at 15). **Decision (Task A1):** the arm and spur cloud-count
> files form a sibling concern module, `field/armClouds/`. The owner may prefer splitting out the
> ridge instead; that is a re-target of the same task.

## Decisions taken here (for the owner's plan review)

- **D1: exposure moves to `eye.w`** (float 3, byte 12). No WGSL reads `eye.w` today: every reader
  uses `u.eye.xyz` (nine sites, all checked). The lane already sits in the per-view camera block
  that A5 rewrites, and all three header packs (field, HII, tiers) share it, because they share
  one `FieldHeaderInput.camera`. `params` is renamed `frustum`.
- **D2: incumbent rename (plan-style rule 6).** `MilkyWayTuning` → `MilkyWayCloudTuning`,
  `MILKY_WAY_TUNING_DEFAULTS` → `MILKY_WAY_CLOUD_TUNING_DEFAULTS`, and the slider table, its key
  and field types and its formatter get the `Cloud` mark, beside the new `MilkyWayFieldTuning`.
  The spec's "unchanged" refers to the eight knobs, not the names.
- **D3: field slider keys are `'exposure' | FieldTargetId`.** `divisors` is a nested record, so
  "keyed by `keyof` the group" can't hold literally. The divisor rows come from
  `FIELD_TARGET_IDS`; `dust` is a checkbox child.
- **D4: `FieldFramePlan` is computed by a pure `planFieldFrame(segments)`.** It is a uniform
  filter over `FIELD_TARGET_IDS`, has a device-free test, and the renderer iterates `plan.encodes`
  instead of its own `findHiiSegment` gates. Segments still give each pass's instance range. The
  tool gates on its own `analyticField` (skips `encode` and its composites), as the app gates on
  the host's absence; the shared tuning has no such switch.
- **D5: the composite loop is `encodeFieldComposites`** in `field/host/render/`. Both the tool and
  the app's `milky-way-field` pass call it.
- **D6: the dust on/off mapping becomes `withoutDustCloud`** in `field/dust/utils/`, taken from
  the tool's `fieldTuningForEngine` (`engineBridge.ts:76-82`), and the app and the tool share it.
- **D7: the runtime holds the host through a `FieldHostSlot` subsystem**, not a mutable field.
  It only creates and destroys lazily. The planner calls `plan()` once per frame and returns
  `{ host, plan }` as its value; the compute and the pass read that value from
  `ctx.snapshot.plans`, never the slot (D8).
- **D8: the frame plan travels as the planner's value.** `milkyWayPlanner` returns
  `FieldPlannerValue | null`, the shape in Task B5, which `FrameContentPlanner.d.ts` and
  `FramePlannerResultStore` carry to later passes. Precedents: `createStructureMarkersPass.ts:30`
  and `encodeAtmosphereSkyView.ts:31`. There is no second `plan()` call and no purity contract on it.
- **D9: one key set for the targets.** `FieldTargetId` is `'field' | 'dustMap' | 'extras' | HiiTier`,
  so every HII label is `` `hii:${id}` ``. The targets record, the divisors and the target rows are
  all keyed by it, and no translator between ids, labels and slot names exists.

## Global constraints

- `type`, never `interface`. One symbol per file in `utils/` and `@types/`, filename = the symbol.
  Types never live inline in implementation files; a file on the
  `tests/helpers/conventions/inlineTypeFiles.ts` allow-list keeps its row only while it still
  holds an inline type.
- Concern folders hold ≤ 15 direct files. No role folder sits at the Layer root (new app code goes
  in `field/<role>/`).
- Every move is `npm run move-files -- <from> <to>` (`--dry` first), and every symbol split is
  `npm run refactor -- extract <file>#<symbol> <dest.ts>`. Never `git mv` with hand-edited imports,
  and never an ad-hoc ts-morph script. After each move, grep for the old basename and run
  `git diff -U0 | grep '^@@ -1,'` to find lost module headers.
- Comment budget per `comments.md`: module header ≤ 10 lines, comment lines ≤ half the code lines.
  The header byte table in `io.wesl` and `packFieldUniforms.ts` is the declared exception.
- PR A changes no pixels for the identity placement. With `renderer: 'v1'`, PR B changes no app
  frame and allocates nothing for the field.
- Stage by path. One commit per task, in the plan's voice.

## Review focus

1. **Header relayout parity.** The TS packer and `io.wesl` agree, and every one of the 13 shader
   sites reads `frustum` and `eye.w`, with no `params` left (`grep -rn "params\.[xyzw]"` over
   `shaders/milkyWay/field shaders/milkyWay/ismMap`). Tests: A5.
2. **The sign of the shift.** `tanLeft = (shiftX − 1)·T·A` in the tool, and the app passes
   `FrameView.frustum` through unchanged, y shift included. Tests: A5 (the tool's projection) and
   B3 (the app's `vp`).
3. **One plan.** `plan()` is called once per frame, in the planner; the renderer encodes exactly
   `plan.encodes`, the composites are exactly `plan.composites`, and nothing re-derives gating.
   Tests: A9, B6.
4. **Settings nesting.** No reader of the flat knobs is left; `milkyWayPass.ts:84` and
   `milkyWayAggregatePass.ts:51` pass `.cloud`. Tests: B1.
5. **v2 lifecycle.** `'v1'` → `'v2'` → `'v1'` creates and destroys the host exactly once each, and
   the pick impostor survives `'v2'`. Tests: B5, B8.

---

# Part A: PR A (prep 0b, 1–3)

**Branch:** `worktree-land-v2-milky-way`, after merging main in, with PR 0 merged. The app is
untouched; the gate is CI plus the tool identity pair (Task A11).

### Task A0: Commit the spec and plan, retire the backlog item

**Files:** `docs/superpowers/specs/2026-11-10-milky-way-v2-field-in-layer-design.md` (add),
`docs/superpowers/plans/2026-11-10-milky-way-v2-field-in-layer.md` (add), `docs/BACKLOG.md`
(modify), `docs/backlog/2026-09-25-milky-way-v2-field-in-layer.md` (delete)

- [x] Delete the `docs/BACKLOG.md` index line "**Draw the v2 analytic Milky Way in the `milkyWay`
      Layer, beside v1**" (line 126 today) and its detail file.
- [x] Commit both docs. No test.

## Prep 0b: one function per file

Shared rules for A1–A4:
- The kept symbol is the file's public builder. After the other exports are extracted,
  `npm run move-files` renames the file to that symbol, and the test mirror follows.
- `extract` takes exported declarations only. A local helper that two moving symbols share gets a
  hand-added `export` and is extracted first. That covers `TAU_ROOT3`, `ISO_FRAME`, `buildDigVeil`,
  `armEventCenter`, `armReaches`, `ArmRidgeFrame`, `DustDiscShape`, `RegionPlan` and `DigSeedFrame`.
  A helper with one caller rides along and stays unexported.
- A type goes `extract … <mod>/@types/<Name>.ts`, then `npm run move-files -- <…>.ts <…>.d.ts`.
  Do this before the function that carries it, or `noInlineTypes` fails on the new file. Delete each
  `inlineTypeFiles.ts` row in the commit that removes the file's last inline type.
- An exported const goes to `../data/<camelName>.ts`. The one exception is A4's DIG constants.
- `extract` drops a plain `//` comment directly above a dragged helper. Restore it, and give each new
  file its own ≤ 10-line header.
- Per task: `npm run typecheck:fast`, then
  `npx vitest run tests/conventions tests/layers/milkyWay/field`. No new tests; this is a
  mechanical split. Where a test file's `describe` blocks now cover two files, split it by hand
  (listed per task).
- `P` = `src/layers/milkyWay/field`.

### Task A1: Split the arm builders; arm clouds become `field/armClouds/`

**Files:**
- `P/arms/utils/{armRidgeGeometry,armSpurGeometry}.ts` (split)
- `P/arms/utils/{armParticleCloud,armSpurParticleCloud}.ts` (split, then move)
- `P/arms/@types/ArmRidgeFrame.d.ts` (create)
- `P/arms/data/armSpanStartFrac.ts` (create)
- `P/armClouds/{utils,data}/*` (create)
- `tests/layers/milkyWay/field/arms/utils/armSpurGeometry.test.ts` (split)
- `tests/helpers/conventions/inlineTypeFiles.ts` (row for `armRidgeGeometry`)
- `src/layers/milkyWay/field/README.md` (module list)

- [x] `armRidgeGeometry.ts` → seven files:
  - `export` `ArmRidgeFrame`, then extract it to `P/arms/@types/ArmRidgeFrame.ts` and move it to
    `.d.ts`.
  - Extract `ARM_SPAN_START_FRAC` → `P/arms/data/armSpanStartFrac.ts`.
  - Extract, in this order: `armColor`, `armFadeEnvelope`, `armExcessSurfaceShape`, `armCrossSigma`,
    `armRidgeFrameAt` (drags `armCurvePos`), `armRidgeCurvePoint`.
  - Then `npm run move-files -- P/arms/utils/armRidgeGeometry.ts P/arms/utils/armRidgeAngle.ts`.
- [x] `armSpurGeometry.ts`:
  - Extract `spurRootSpacing` and `deriveArmSpurs`.
  - `npm run move-files -- P/arms/utils/armSpurGeometry.ts P/arms/utils/buildArmSpurs.ts`.
  - Split the test: `describe('deriveArmSpurs')` (today L32-96) → `deriveArmSpurs.test.ts`.
- [x] `armParticleCloud.ts`:
  - Extract `radialTilt` and `tiltReferenceRadius` to `P/arms/utils/`.
  - Extract `ARM_CLOUD_MAX_COUNT`, `COMPLEX_HEIGHT_RATIO` and `COMPLEX_SPREAD_RATIO` → `P/arms/data/`.
  - `npm run move-files -- P/arms/utils/armParticleCloud.ts P/arms/utils/deriveArmCloudCount.ts`.
- [x] `armSpurParticleCloud.ts`:
  - Extract `spurFootprintIntegral`, and `SPUR_CLOUD_MAX_COUNT` → `P/arms/data/`.
  - `npm run move-files -- P/arms/utils/armSpurParticleCloud.ts P/arms/utils/deriveArmSpurCloudCount.ts`.
- [x] Move the cloud-count cohort out in one manifest run (`--dry` first):
  - `npm run move-files -- --manifest <scratch>/armClouds.json`
  - Utils: `deriveArmCloudCount`, `deriveArmSpurCloudCount`, `spurFootprintIntegral`, `radialTilt`,
    `tiltReferenceRadius` → `P/armClouds/utils/`.
  - Data: the four count/ratio constants → `P/armClouds/data/`.
  - Resulting counts: `arms/utils` 10, `armClouds/utils` 5.
- [x] Add `armClouds/` to the module list in `P/README.md`. Commit.

### Task A2: Split the dust builders

**Files:**
- `P/dust/utils/{galaxyDustMixture,dustBubblePlacements}.ts` (split)
- `P/dust/@types/{DustDiscShape,DustBubblePlacement}.d.ts` (create)
- `P/dust/utils/{dustSigmaR,armEventCenter,armReaches,buildHiiCavityPlacements}.ts` (create)
- `P/dust/data/{bubbleBudget,hiiCavityBudget}.ts` (create)
- `inlineTypeFiles.ts` (the two rows)

- [x] `galaxyDustMixture.ts`:
  - `export` `DustDiscShape`, extract it to `@types`, and move it to `.d.ts`.
  - Extract `dustSigmaR`.
  - `npm run move-files -- P/dust/utils/galaxyDustMixture.ts P/dust/utils/dustDiscShape.ts`.
- [x] `dustBubblePlacements.ts`:
  - Extract `DustBubblePlacement` to `@types`.
  - `export` and extract `armEventCenter` and `armReaches` (shared by both builders; extract
    refuses otherwise).
  - Extract `buildHiiCavityPlacements`, `HII_CAVITY_BUDGET` and `BUBBLE_BUDGET`.
  - `npm run move-files -- P/dust/utils/dustBubblePlacements.ts P/dust/utils/buildDustBubblePlacements.ts`.
- [x] Resulting count: `dust/utils` 11. Commit.

### Task A3: Split the ISM-map builders

**Files:**
- `P/ismMap/utils/{galaxyIsmMapArmForcing,galaxyIsmMapFluidEvents}.ts` (split)
- `P/ismMap/@types/IsmMapFluidEventWindow.d.ts` (create)
- `P/ismMap/utils/{ismMapGridRadius,ismMapGridRadiusOrDefault,ismMapFluidEventWindow}.ts` (create)
- `P/ismMap/data/{ismMapAz,ismMapRings,ismMapWorkgroupSize,ismMapFluidMaxEvents}.ts` (create)
- `tests/layers/milkyWay/field/ismMap/utils/galaxyIsmMapFluidEvents.test.ts` (split)
- `inlineTypeFiles.ts` (row)

- [x] `galaxyIsmMapFluidEvents.ts`:
  - Extract `IsmMapFluidEventWindow` to `@types`.
  - Extract `ismMapFluidEventWindow`, and `ISM_MAP_FLUID_MAX_EVENTS` → data.
  - `npm run move-files -- P/ismMap/utils/galaxyIsmMapFluidEvents.ts P/ismMap/utils/buildGalaxyIsmMapFluidEvents.ts`.
  - Split the test: `describe('ismMapFluidEventWindow')` (today L191-216) → its own file. Copy only
    the fixtures it uses.
- [x] `galaxyIsmMapArmForcing.ts`:
  - Extract `ismMapGridRadiusOrDefault`, then `ismMapGridRadius`, which drags the two margin
    constants.
  - Extract `ISM_MAP_AZ`, `ISM_MAP_RINGS` and `ISM_MAP_WORKGROUP_SIZE` → data. The
    `constants.parity.test.ts` import is repointed for you.
  - `npm run move-files -- P/ismMap/utils/galaxyIsmMapArmForcing.ts P/ismMap/utils/buildGalaxyIsmMapArmForcing.ts`.
- [x] Resulting count: `ismMap/utils` 6. Commit.

### Task A4: Split the star-formation builders

**Files:**
- `P/starFormation/utils/{hiiRegionGeometry,sfEventAgeBands,hiiRegions}.ts` (split)
- `P/starFormation/@types/{HiiShellsAndYoungResult,RegionPlan,DigSeedFrame}.d.ts` (create)
- `P/starFormation/data/{digVeilBudget,hiiMaxCount,emptyShellsAndYoung,tauRoot3,isoFrame,hiiAgeGate,hiiClusterColor,recentEventAgeFracCeil}.ts` (create)
- `P/starFormation/utils/{hiiRadiusUnits,deriveComplexCount,buildDigVeil,buildHiiShellsAndYoungWithSegments,buildHiiRegionsWithSegments}.ts` (create)
- Tests `hiiRegions.test.ts` and `sfEventAgeBands.test.ts` (split)
- `inlineTypeFiles.ts` (row)

- [x] `hiiRegionGeometry.ts`:
  - Extract `hiiRadiusUnits`, and `HII_AGE_GATE` and `HII_CLUSTER_COLOR` → data.
  - `npm run move-files -- P/starFormation/utils/hiiRegionGeometry.ts P/starFormation/utils/hiiLuminosityOf.ts`.
- [x] `sfEventAgeBands.ts`:
  - Extract `deriveComplexCount`, and `RECENT_EVENT_AGE_FRAC_CEIL` → data.
  - `npm run move-files -- P/starFormation/utils/sfEventAgeBands.ts P/starFormation/utils/fluidMidAgeEventWindow.ts`.
  - Split the test: `describe('deriveComplexCount')` (today L51-65) → its own file.
- [x] `hiiRegions.ts` (914 lines, order matters):
  - Replace the local `HiiRegionSegment` (today L650) with the existing `HiiSegment` type. The two
    are structurally identical (`{ label, first, count }`).
  - Extract `HiiShellsAndYoungResult` to `@types`. `export`, extract and move `RegionPlan` and
    `DigSeedFrame` to `@types`.
  - `export` and extract `TAU_ROOT3` and `ISO_FRAME` → data.
  - Extract the seven `DIG_*` constants into one `P/starFormation/data/digVeilBudget.ts`: extract
    the first to that name, then hand-move the other six into it. Per-const files would put
    `starFormation/data` at 16.
  - Extract `HII_MAX_COUNT` and `EMPTY_SHELLS_AND_YOUNG` → data.
  - `export` `buildDigVeil`, then extract it, followed by `buildHiiShellsAndYoungWithSegments` and
    `buildHiiRegionsWithSegments`.
  - `npm run move-files -- P/starFormation/utils/hiiRegions.ts P/starFormation/utils/buildHiiRegions.ts`.
  - Split the test: `describe('buildHiiRegionsWithSegments')` (today L342-368) → its own file.
- [x] Resulting counts: `starFormation/utils` 11, `starFormation/data` 10. Commit.

## Prep 1: the field camera is a `FieldView`

### Task A5: `FieldView`, the four-tangent header, and the frustum in every field shader

`review: yes`. Read `.claude/skills/wesl-shaders/SKILL.md` and `docs/RENDERER.md` first. This is
one commit: the header is a TS↔WGSL contract, and the tool can't run between its halves.

**Files:**
- Create `src/layers/milkyWay/field/@types/FieldView.d.ts`.
- Delete `src/layers/milkyWay/field/header/@types/FieldCamera.d.ts`.
- Modify:
  - `src/layers/milkyWay/field/header/@types/{FieldHeaderInput,FieldHeaderFrameLanes}.d.ts`
  - `src/layers/milkyWay/field/@types/GalaxyFieldFrame.d.ts`
  - `src/layers/milkyWay/field/header/render/{packFieldUniforms,buildFieldHeaderInputs}.ts`
  - `src/layers/milkyWay/field/render/createGalaxyFieldRenderer.ts`
- Shaders, under `src/services/gpu/shaders/`: `lib/camera.wesl`, `lib/splatSilhouette.wesl`,
  `milkyWay/field/{io,fieldSplat/vertex,fieldSplat/fragment,dustMap/vertex,dustMap/fragment,hiiSplat/vertex,hiiSplat/shadeCommon,hiiSplat/starGrain,bubblePresent/vertex}.wesl`,
  `milkyWay/ismMap/{ismMapPresent,orientationPresent}.wesl`
- Tool: `tools/galaxy-renderer/src/engine/frame/deriveFrameView.ts`,
  `tools/galaxy-renderer/src/engine/createGalaxyEngine.ts` (today `:526-535`)
- Tests: `tests/layers/milkyWay/field/header/render/{packFieldHeaderUniforms,buildFieldHeaderInputs}.test.ts`,
  `tests/tools/galaxy-renderer/engine/frame/deriveFrameView.test.ts`

**Contract: `FieldView`.**

```ts
// src/layers/milkyWay/field/@types/FieldView.d.ts
export type FieldView = {
  readonly eye: Vec3; // galaxy frame: centre at origin, disc in xz, +Y the pole, model units
  readonly right: Vec3; // unit, galaxy frame
  readonly up: Vec3;
  readonly fwd: Vec3; // into the screen
  readonly frustum: ViewFrustum; // src/@types/camera/projection/ViewFrustum: tanLeft/tanDown ≤ 0 when centred
};
```

The type changes:
- `FieldHeaderInput.camera: FieldView` and a new `FieldHeaderInput.exposure: number`, which
  replace `FieldCamera`'s `view`, `fov`, `aspect`, `lensShiftX` and `exposure`.
- `FieldHeaderFrameLanes` loses `view` and `aspect`.
- `GalaxyFieldFrame` loses `eye`, `fov` and `shiftX` and gains `camera: FieldView`.
- The `buildFieldHeaderInputs` deps lose `eye`, `fov` and `shiftX` and take `camera`. All three
  headers still share one `camera` object, and that test stays.

**Header byte table** (`io.wesl` `FieldUniforms` stays the authority; 68 floats / 272 bytes,
unchanged).

| byte | floats | member     | before                                 | after                                 |
| ---- | ------ | ---------- | -------------------------------------- | ------------------------------------- |
| 0    | 0–3    | `eye`      | xyz eye, w unused (0)                  | xyz eye (galaxy frame), **w exposure** |
| 16   | 4–7    | `camRight` | view row 0, w unused                   | `camera.right`, w unused              |
| 32   | 8–11   | `camUp`    | view row 1, w unused                   | `camera.up`, w unused                 |
| 48   | 12–15  | `camFwd`   | −view row 2, w unused                  | `camera.fwd`, w unused                |
| 64   | 16–19  | `params` → **`frustum`** | (tanHalfFov, aspect, lensShiftX, exposure) | (tanLeft, tanRight, tanDown, tanUp) |
| 80–271 | 20–67 | `counts` … `perf` | unchanged                         | unchanged                             |

**Contract: the WGSL frustum functions.** `frustum = (tanLeft, tanRight, tanDown, tanUp)`, signed.

```wgsl
// lib/camera.wesl
fn cameraRayFromNdc(ndc: vec2<f32>, camRight: vec3<f32>, camUp: vec3<f32>, camFwd: vec3<f32>, frustum: vec4<f32>) -> vec3<f32>
fn cameraRayFromUv(uv: vec2<f32>, camRight: vec3<f32>, camUp: vec3<f32>, camFwd: vec3<f32>, frustum: vec4<f32>) -> vec3<f32> // uv→ndc as today, then cameraRayFromNdc
fn ndcFromTangent(t: vec2<f32>, frustum: vec4<f32>) -> vec2<f32>
// lib/splatSilhouette.wesl
fn splatNdc(corner: vec2<f32>, xv: f32, yv: f32, zv: f32, r: f32, frustum: vec4<f32>, capHalfNdc: f32) -> vec2<f32>
```

**The maths.** Let `lo = frustum.xz`, `hi = frustum.yw`, `mid = 0.5·(lo + hi)` and
`half = 0.5·(hi − lo)`.

| quantity | today (`T = tanHalfFov`, `A = aspect`, `s = shift`) | after |
| --- | --- | --- |
| tangent at `ndc` | `((ndc.x + s)·T·A, ndc.y·T)` | `mid + ndc·half` |
| ray | `normalize(right·t.x + up·t.y + fwd)` | same, via `cameraRayFromNdc` |
| ndc of tangent `t` | `(t.x/(T·A) − s, t.y/T)` | `(t − mid) / half` (`ndcFromTangent`) |
| splatNdc cull half-tangents | `x: T·A·(1+\|s\|)`, `y: T` | `x: max(\|lo.x\|, \|hi.x\|)`, `y: max(\|lo.y\|, \|hi.y\|)` |
| world size of one pixel at `depth` | `2·depth·T / heightPx` | `depth·(frustum.w − frustum.z) / heightPx` |
| exposure | `u.params.w` | `u.eye.w` |

Each row reduces to today's for the frustum `((s−1)·T·A, (s+1)·T·A, −T, T)`:
- `mid = (s·T·A, 0)` and `half = (T·A, T)`, so the tangent at `ndc` is `((ndc.x + s)·T·A, ndc.y·T)`.
- `max(|s−1|, |s+1|) = 1 + |s|`.
- `T − (−T) = 2T`.

**Mapping (fov, aspect, shiftX) → tangents.** With `T = tan(fov/2)` (fov is vertical, as in
`mat4.perspective`):
- `tanLeft = (shiftX − 1)·T·aspect`, `tanRight = (shiftX + 1)·T·aspect`, `tanDown = −T`,
  `tanUp = T`.
- In code that is `shiftedFrustum(fov, aspect, [−shiftX, 0])`
  (`src/services/engine/camera/lens/utils/shiftedFrustum.ts`).
- Why `−shiftX`: the tool writes `proj[8] = shiftX` (`deriveFrameView.ts:95`), and
  `frustumPerspectiveF64.ts:27` writes `m[8] = (tanLeft + tanRight)/(tanRight − tanLeft)`, so
  `shiftX` is the window centre over the half-width. `shiftedFrustum`'s `shiftNdc` is where the
  axis lands, which is the negation.
- The app's `FrameView.frustum` is already this form (`stepCameraRuntime.ts:136`,
  `shiftedFrustum(fovY, aspect, shiftNdc)`), y shift included. It passes through unchanged.

**Steps:**

- [x] **Shaders.**
  - Add `cameraRayFromNdc` and `ndcFromTangent`, and change `cameraRayFromUv` and `splatNdc` to the
    signatures above.
  - Repoint every site in the first RISK callout.
  - Rename `params` to `frustum` in `io.wesl`, and rewrite its layout comment rows for `eye` and
    `frustum` (offset authority).
  - The inline ray builders in `fieldSplat/fragment`, `hiiSplat/shadeCommon` and `dustMap/fragment`
    call `cameraRayFromNdc` instead of repeating the formula.
  - `bubblePresent/vertex` uses `ndcFromTangent`. Fix the "horizontal-FOV" comment in
    `camera.wesl:145`: T is the vertical half-tangent.
- [x] **Packer.**
  - `packFieldHeaderUniforms` writes floats 0–2 from `camera.eye`, 3 = `exposure`, 4–15 from
    `camera.right/up/fwd` (no view-matrix gather), and 16–19 from `camera.frustum`.
  - Rewrite the module header's "camera BASIS" section: the basis is now an input, and
    `FieldView`'s frustum carries the lens shift.
  - `buildFieldHeaderInputs` and the renderer's `encode` pass `frame.camera` and
    `frame.view.analyticExposure` through.
- [x] **Tool.**
  - `deriveFrameView` returns `camera: FieldView` instead of `view` and `aspect` for the field. It
    keeps `view`, `proj` and `viewProj` for the sprites.
  - The basis is today's gather (`right = (view[0], view[4], view[8])`,
    `up = (view[1], view[5], view[9])`, `fwd = −(view[2], view[6], view[10])`), and the frustum is
    `shiftedFrustum(fov, aspect, [−shiftX, 0])`.
  - `createGalaxyEngine` passes `camera` into `field.encode`.
- [x] **Test, updated:**
  - `packFieldHeaderUniforms ↔ io.wesl`, `it('puts every vec4 where the shader declares it')`.
  - The sentinel fixture becomes `camera: { eye: [11000, 11001, 11002], right: [12000, …],
    up: […], fwd: […], frustum: { tanLeft: 13000, tanRight: 13001, tanDown: 13003, tanUp: 13004 } },
    exposure: 13002`.
  - Assert `exposure` is observed at byte `at('eye') + 12` and the four tangents at `at('frustum')`
    + 0/4/8/12, both found by sentinel, not by restated index.
  - Assert `at('params')` no longer exists.
- [x] **Test, new (tool):** `deriveFrameView`,
      `it('field camera rays land on their own NDC under viewProj, lens shift included')`.
  - With `shiftX = 0.17`, `fov = 0.9` and viewport 1600×900, for `ndc ∈ {(−1,−1), (1,1), (0.3,−0.6)}`:
    form `t = mid + ndc·half` from `camera.frustum` and `P = eye + 10·(fwd + right·t.x + up·t.y)`.
  - Then `viewProj · P` divided by w must equal `ndc` within 1e-5.
  - The oracle is the tool's own projection (`proj[8] = shiftX`), not the formula under test.
- [x] `npm run galaxy-renderer`, load the default preset, and confirm the field renders. Commit.

## Prep 2: field targets are `{ view, sizePx }`

### Task A6: `FieldTarget`, a view-keyed bind-group cache, no dust latch

`review: yes` (GPU resource identity).

**Files:**
- Create `src/layers/milkyWay/field/@types/{FieldTarget,FieldTargetId}.d.ts`.
- Modify:
  - `src/layers/milkyWay/field/@types/GalaxyFieldRenderTargets.d.ts`
  - `src/layers/milkyWay/field/render/{createGalaxyFieldRenderer,createFieldPipelines,encodeDustMapPass}.ts`
  - `tools/galaxy-renderer/src/engine/gpu/createGalaxyRenderTargets.ts`
  - `tools/galaxy-renderer/src/engine/createGalaxyEngine.ts` (today `:250-260`, `:557-565`,
    `:707-750`)

**Contract:**

```ts
// src/layers/milkyWay/field/@types/FieldTarget.d.ts
export type FieldTarget = { readonly view: GPUTextureView; readonly sizePx: Size }; // Size = src/@types/rendering/Size

// src/layers/milkyWay/field/@types/FieldTargetId.d.ts — the ONE key set: targets, divisors, rows, timing
export type FieldTargetId = 'field' | 'dustMap' | 'extras' | HiiTier; // 'extras' = background extras' HII
// Every HII segment label is `hii:${id}` for extras | shells | young | dig.

// GalaxyFieldRenderTargets (reshaped)
export type GalaxyFieldRenderTargets = Readonly<Record<FieldTargetId, FieldTarget>> & {
  readonly dustView?: FieldTarget; // debug only; absent ⇒ the dust-view pass never encodes
}; // 'extras' is the background extras' HII (today hiiTex); the tiers are today's hiiTiers
```

- [x] The renderer:
  - Reads `targets.extras` where it read `targets.hii`, and `targets[tier]` where it read
    `targets.hiiTiers[tier]`.
  - Reads header target sizes from `sizePx` (`[width, height]` into `targetSizePx`, `height` into
    `dustMapHeightPx`). Today `createGalaxyFieldRenderer.ts:346-354`.
  - Binds `view` directly, with no `createView()` per pass (today `:398, :411, :425, :447, :462`).
  - `createFieldPipelines`' `FieldBindGroupResources.dustMap` becomes the `GPUTextureView`. Its
    identity cache (today `createFieldPipelines.ts:55`) keys on the view.
- [x] The dust map:
  - It encodes on every frame the field encodes (empty clear at count 0). Delete the
    `populated` latch and its texture-identity reset (today `:171, :376-401`).
  - `encodeDustMapPass` stops returning the latch.
  - The dust-view pass runs iff `targets.dustView` is present and `debugViews.dust > 0`.
- [x] The tool:
  - `createGalaxyRenderTargets` builds one `FieldTarget` per allocation, keyed by `FieldTargetId`
    (`hii` → `extras`, `hiiTiers.*` flattened), its view made once at
    allocation and replaced only on reallocation. It keeps its textures for the probe readbacks
    (`readTextureChannelSum`).
  - `createGalaxyEngine` composites from `.view`.
- [x] No new test (type reshaping plus a deleted latch). The pixel check is Task A11. Commit.

## Prep 3: the host moves into `src/` with one `FieldFramePlan`

### Task A7: Move the readbacks, decoders, formats and the ISM mean into the field

**Files:**
- `tools/galaxy-renderer/src/engine/ismMap/{createIsmMapReadbacks,decodeIsmMapTexels,decodeOrientationTexels}.ts`
  (move)
- `tools/galaxy-renderer/src/engine/gpu/createReadbackQueue.ts` (move)
- `src/utils/galaxy/areaWeightedMeanIsmMapChannel.ts` (move)
- `src/layers/milkyWay/field/host/@types/IsmMapReadbacks.d.ts` (create, extracted)
- `src/layers/milkyWay/field/host/data/dustMapFormat.ts` (create)
- `tools/galaxy-renderer/src/engine/createGalaxyEngine.ts` (today `:70-76`)
- `tests/helpers/conventions/inlineTypeFiles.ts` (today rows 179 and 181)
- Their tests (moved)

- [x] Write `<scratch>/host-moves.json` and run `npm run move-files -- --manifest <scratch>/host-moves.json --dry`,
      then for real. The moves:

| from | to |
| --- | --- |
| `tools/galaxy-renderer/src/engine/ismMap/createIsmMapReadbacks.ts` | `src/layers/milkyWay/field/host/render/createIsmMapReadbacks.ts` |
| `tools/galaxy-renderer/src/engine/gpu/createReadbackQueue.ts` | `src/layers/milkyWay/field/host/render/createReadbackQueue.ts` |
| `tools/galaxy-renderer/src/engine/ismMap/decodeIsmMapTexels.ts` | `src/layers/milkyWay/field/host/utils/decodeIsmMapTexels.ts` |
| `tools/galaxy-renderer/src/engine/ismMap/decodeOrientationTexels.ts` | `src/layers/milkyWay/field/host/utils/decodeOrientationTexels.ts` |
| `src/utils/galaxy/areaWeightedMeanIsmMapChannel.ts` | `src/layers/milkyWay/field/ismMap/utils/areaWeightedMeanIsmMapChannel.ts` |
| `tests/tools/galaxy-renderer/engine/gpu/createReadbackQueue.test.ts` | `tests/layers/milkyWay/field/host/render/createReadbackQueue.test.ts` |
| `tests/tools/galaxy-renderer/engine/ismMap/decodeIsmMapTexels.test.ts` | `tests/layers/milkyWay/field/host/utils/decodeIsmMapTexels.test.ts` |
| `tests/tools/galaxy-renderer/engine/ismMap/decodeOrientationTexels.test.ts` | `tests/layers/milkyWay/field/host/utils/decodeOrientationTexels.test.ts` |
| `tests/utils/galaxy/areaWeightedMeanIsmMapChannel.test.ts` | `tests/layers/milkyWay/field/ismMap/utils/areaWeightedMeanIsmMapChannel.test.ts` |

- [x] Extract the inline `IsmMapReadbacks` type with
      `npm run refactor -- extract src/layers/milkyWay/field/host/render/createIsmMapReadbacks.ts#IsmMapReadbacks src/layers/milkyWay/field/host/@types/IsmMapReadbacks.ts`,
      then
      `npm run move-files -- src/layers/milkyWay/field/host/@types/IsmMapReadbacks.ts src/layers/milkyWay/field/host/@types/IsmMapReadbacks.d.ts`. Repoint the two allow-list rows; `createReadbackQueue` keeps its inline stream types
      and its row. Delete the `createIsmMapReadbacks` row only if it's left with no inline type.
- [x] `DUST_MAP_FORMAT` (`createGalaxyEngine.ts:76`, unexported today) becomes the export of
      `host/data/dustMapFormat.ts`, with its doc (`:70-75`). The engine imports it.
- [x] Out of scope: `ismMapRingMeans` and `ismMapRingIndexForRadius` stay in `src/utils/galaxy/`.
      The host doesn't reach them; only the tool's seeding view and the probes do.
- [x] No new test. Commit.

### Task A8: The calibration row and the frame-lane derivation

**Files:**
- Create `src/layers/milkyWay/field/data/{fieldCalibration,fieldTargetIds}.ts`,
  `src/layers/milkyWay/field/host/data/fieldExposureGauge.ts`,
  `src/layers/milkyWay/field/host/utils/deriveFieldFrameLanes.ts` and
  `tests/layers/milkyWay/field/host/utils/deriveFieldFrameLanes.test.ts`.
- Modify `tools/galaxy-renderer/src/data/defaultRenderSettings.ts` (today `:76-178`, field rows),
  `tools/galaxy-renderer/src/engine/frame/deriveFrameView.ts`, its test, and
  `src/layers/milkyWay/field/header/@types/FieldHeaderFrameLanes.d.ts`.

**Contract:**

```ts
// field/data/fieldTargetIds.ts — encode order (FieldTargetId comes from A6)
export const FIELD_TARGET_IDS: readonly FieldTargetId[]; // ['dustMap', 'field', 'shells', 'young', 'dig', 'extras']

// field/data/fieldCalibration.ts — the one row the tool's defaults and the app's settings both read
export const FIELD_CALIBRATION: {
  readonly exposure: 1;
  readonly divisors: Readonly<Record<FieldTargetId, number>>; // field 6, dustMap 5, extras 1, shells 1, young 2, dig 4
  readonly render: {
    hiiNearFadeStart: 4.5; hiiNearFadeEnd: 1.5; starGrainWarpAmp: 0.04; hiiQuadCap: 0;
    starGrainFeatureScaleNear: 4; starGrainFeatureScaleFar: 15;
    orientationSigmaDerivTexels: 1.5; orientationSigmaIntegTexels: 4;
    // neutral debug lanes: inert in the app, the starting point the tool overrides from its own knobs
    debugViews: DebugViewWeights; // all 0
    galaxyWeight: 1;
    ismMapChannels: IsmMapChannelWeights; // all 1
    ismMapSeeding: IsmMapSeedingLanes; // all 0
  };
};

// host/utils/deriveFieldFrameLanes.ts — the frame-lane half of today's deriveFrameView
export function deriveFieldFrameLanes(input: {
  readonly camera: FieldView;
  readonly exposure: number; // the caller's knob × visibility alpha; the gauge is applied here
  readonly dustReachR: number;
  readonly render: FieldHostTuning['render']; // debugViews, galaxyWeight, ismMapChannels, starGrainFeatureScaleNear/Far
}): FieldHeaderFrameLanes;
```

`FieldHeaderFrameLanes` after this task is `{ analyticExposure, debugViews, galaxyWeight,
ismMapChannels, dustSlices, starGrainFeatureScale }`. This task also creates
`src/layers/milkyWay/field/host/@types/FieldHostTuning.d.ts` with the shape pinned in Task A9's
contract, because `deriveFieldFrameLanes` reads its `render` member.

- [x] Move `FIELD_EXPOSURE_GAUGE` (`deriveFrameView.ts:40`, with its landmine doc) to
      `host/data/fieldExposureGauge.ts`, and the `STAR_GRAIN_SCALE_NEAR_R/FAR_R` anchors
      (`:48-49`) into `deriveFieldFrameLanes`.
  - `analyticExposure = exposure · FIELD_EXPOSURE_GAUGE`. The tool passes
    `render.analyticExposure · fade.alpha`, the same product as today's `:150`.
  - `dustSlices` and the grain blend use `|camera.eye|`, which is in the galaxy frame.
- [x] `defaultRenderSettings.ts`:
  - The divisor rows read `FIELD_CALIBRATION.divisors`: `fieldDivisor` ← `field`,
    `dustDivisor` ← `dustMap`, `extrasDivisor` ← `extras`, `shells/young/digDivisor` ← the tiers.
  - The fade, grain, quad-cap and sigma rows read `FIELD_CALIBRATION.render`, and
    `analyticExposure` reads `FIELD_CALIBRATION.exposure`. The tool's own debug-view, weight and
    seeding settings override the neutral lanes in that row.
  - The tool keeps its own knobs and its own tuning surface.
- [x] Tests:
  - Move the three frame-lane `it`s from `deriveFrameView.test.ts` (exposure independence from the
    sprite knobs, dust slices from the origin, the grain blend) to `deriveFieldFrameLanes.test.ts`,
    adapted to the new input.
  - The near-plane and lens-shift tests stay with `deriveFrameView`.
  - No new assertions.
- [x] Commit.

### Task A9: `createGalaxyFieldHost`, `planFieldFrame`, and a renderer that encodes the plan

`review: yes` (the one-plan contract).

**Files:**
- Create:
  - `src/layers/milkyWay/field/@types/FieldFramePlan.d.ts`
  - `src/layers/milkyWay/field/host/@types/{GalaxyFieldHost,GalaxyFieldHostDeps,GalaxyFieldHostDebug}.d.ts`
    (`FieldHostTuning.d.ts` comes from A8)
  - `src/layers/milkyWay/field/host/subsystems/createGalaxyFieldHost.ts`
  - `src/layers/milkyWay/field/host/utils/planFieldFrame.ts`
  - `tests/layers/milkyWay/field/host/utils/planFieldFrame.test.ts`
- Modify:
  - `src/layers/milkyWay/field/render/createGalaxyFieldRenderer.ts`
  - `src/layers/milkyWay/field/@types/{GalaxyFieldRenderer,GalaxyFieldFrame}.d.ts`
  - `tools/galaxy-renderer/src/engine/model/createGalaxyModel.ts`

**Contract:**

```ts
// field/@types/FieldFramePlan.d.ts
export type FieldFramePlan = {
  readonly encodes: readonly FieldTargetId[]; // encode order, a subsequence of FIELD_TARGET_IDS
  readonly composites: readonly FieldTargetId[]; // encodes minus 'dustMap'; never re-derived
};

// host/utils/planFieldFrame.ts — pure; the ONLY gating of field passes
export function planFieldFrame(segments: readonly HiiSegment[]): FieldFramePlan;
// A uniform filter over FIELD_TARGET_IDS: 'dustMap' and 'field' always, every other id iff
// findHiiSegment(segments, `hii:${id}`) is defined. composites = encodes minus 'dustMap'.

// host/@types/FieldHostTuning.d.ts — a full value; setTuning replaces, sections compared by identity
export type FieldHostTuning = {
  readonly geometry: GalaxyDescription;
  readonly seed: number;
  readonly extras: readonly GalaxyFieldExtra[];
  readonly field: GalaxyFieldTuning; // dust off is already folded in by the caller
  readonly render: FieldHeaderRenderLanes & {
    readonly starGrainFeatureScaleNear: number;
    readonly starGrainFeatureScaleFar: number;
    readonly orientationSigmaDerivTexels: number;
    readonly orientationSigmaIntegTexels: number;
    readonly debugViews: DebugViewWeights;
    readonly galaxyWeight: number;
    readonly ismMapChannels: IsmMapChannelWeights;
    readonly ismMapSeeding: IsmMapSeedingLanes; // the tool's seeding view; the app spreads FIELD_CALIBRATION.render's zeros
  };
};

// host/@types/GalaxyFieldHostDeps.d.ts
export type GalaxyFieldHostDeps = {
  readonly makeShader: (code: string, label: string) => GPUShaderModule;
  readonly hdrFormat: GPUTextureFormat;
  readonly dustMapFormat: GPUTextureFormat;
  readonly onIsmMapLanded: () => void; // the app: requestRender; the tool: its seeding-mean recompute
  readonly onOrientationRebuilt?: (grid: GalaxyIsmMapGridRadius) => void; // tool diagnostics
};

// host/@types/GalaxyFieldHost.d.ts
export type GalaxyFieldHost = {
  /** Step the ISM chain; a rebuild requests the readback that sets invMeanNorm. Once per frame, never per view. */
  ensureFresh(): void;
  /** planFieldFrame over the renderer's packed segments. Called once per frame, by the planner. */
  plan(): FieldFramePlan;
  encode(
    encoder: GPUCommandEncoder,
    plan: FieldFramePlan,
    camera: FieldView,
    exposure: number,
    targets: GalaxyFieldRenderTargets,
    timestampWrites?: (id: FieldTargetId) => GPURenderPassTimestampWrites | undefined,
  ): void;
  setTuning(tuning: FieldHostTuning): void;
  destroy(): void;
};

// host/@types/GalaxyFieldHostDebug.d.ts — what only the tool uses; the app ignores it
export type GalaxyFieldHostDebug = {
  readonly renderer: GalaxyFieldRenderer; // overlays, probe, ISM texture, fieldCounts, hiiSegments
  readonly readbacks: IsmMapReadbacks; // orientation, ring means, seeding view
};
```

`createGalaxyFieldHost(device: GPUDevice, deps: GalaxyFieldHostDeps): { host: GalaxyFieldHost; debug: GalaxyFieldHostDebug }`.

- [x] Build the host from the v2 half of `createGalaxyModel.ts`:
  - From there: `mixtureInput` (today `:217-227`, with `orientationViewWanted =
    render.debugViews.orientation > 0`), `invMeanNormFor` (`:255-269`), `youngStarsMeanCache`,
    the `youngStars` getter (`:482-488`), the ISM landing (`:448-459`) and `readbacks` (into
    `debug`, not onto the host).
  - Fix the stale "Diagnostics-only" doc while moving it: the landing sets `invMeanNorm`, which
    the shader reads. Only the seeding recompute is diagnostic.
  - Until the first landing, `invMeanNorm` is 1.
  - `setTuning`: if the geometry identity changed, call
    `readbacks.dropIfGridMoved(ismMapGridRadius(geometry))`. Then call `renderer.setMixture`. The
    renderer's identity keys make an unchanged section free.
  - `encode` derives the frame lanes (`deriveFieldFrameLanes` with `renderer.dustHeaderLanes.reachR`),
    then calls `renderer.encode(encoder, plan, targets, frame)`.
- [x] Change the renderer:
  - `encode(encoder, plan, targets, frame)` iterates `plan.encodes`. The `findHiiSegment` calls
    (today `:439`, `:455`) remain only to read each pass's `first`/`count`.
  - `frame.render.analyticField` and the early return (`:367`) go: the tool gates on its own
    `analyticField` (A10), the app on the host's absence. Headers are still packed every call.
  - `GalaxyFieldFrame.timestampWrites` becomes
    `(id: FieldTargetId) => GPURenderPassTimestampWrites | undefined`, called only where a pass
    opens.
- [x] Rework `createGalaxyModel.ts`:
  - It keeps the v1 sprites, the bubbles, the orientation diagnostics and the seeding view, which
    reads `debug.readbacks`.
  - It drops its `field` dep, and exposes the generated `geometry` and the field `extras` for the
    engine to put into `FieldHostTuning`.
  - Its allow-list row (today `inlineTypeFiles.ts:182`) stays only if an inline type remains.
- [x] **Test, new:** `planFieldFrame` (segments as plain `{ label, first, count }` fixtures):
  - `it('encodes dustMap and field first, then each id with components, in FIELD_TARGET_IDS order')`:
    with segments for `hii:young` and `hii:extras`, the result is
    `encodes = ['dustMap', 'field', 'young', 'extras']`.
  - `it('composites are the encodes minus the dust map, in the same order')`.
  - `it('a tier with no components is in neither list')`: a `hii:shells` segment with `count: 0`
    puts `shells` in neither array.
- [x] Commit.

### Task A10: Composite loop in `src/`, tool rewired onto the host

**Files:**
- Move `tools/galaxy-renderer/src/engine/passes/encodeSceneComposites.ts` (it becomes the host's
  composite loop).
- Create `src/layers/milkyWay/field/host/render/encodeFieldComposites.ts` and
  `src/layers/milkyWay/field/dust/utils/withoutDustCloud.ts` (extracted).
- Modify `tools/galaxy-renderer/src/engine/createGalaxyEngine.ts` (ranges below),
  `tools/galaxy-renderer/src/state/engineBridge.ts` and
  `tools/galaxy-renderer/src/engine/README.md`.

**Contract:**

```ts
// host/render/encodeFieldComposites.ts — one additive upsample per plan.composites entry, in order,
// each reading targets[id].view
export function encodeFieldComposites(
  pass: GPURenderPassEncoder,
  upsample: AdditiveUpsample,
  plan: FieldFramePlan,
  targets: GalaxyFieldRenderTargets,
): void;
```

- [x] Run
      `npm run move-files -- tools/galaxy-renderer/src/engine/passes/encodeSceneComposites.ts src/layers/milkyWay/field/host/render/encodeFieldComposites.ts`
      (`--dry` first), then rewrite it to the contract.
- [x] Rewire `createGalaxyEngine.ts`. Today's ranges:
  - `:161-167`: construct `const { host, debug } = createGalaxyFieldHost(device, { makeShader,
    hdrFormat: HDR, dustMapFormat: DUST_MAP_FORMAT, onIsmMapLanded, onOrientationRebuilt })`. The
    forward reference to `model` goes.
  - `:230`: the model without `field`.
  - `:250-260`: `fieldTargets()` returns the A6 shape.
  - `:294`, `:653-659`: `setRender`, `setParams`, `setExtras` and `setFieldTuning` update one held
    `FieldHostTuning` (the `render` section is `FIELD_CALIBRATION.render` overridden by the tool's
    own knobs) and call `host.setTuning`.
    - `setFieldTuning` keeps merging partial patches (`probeGpuErrors.ts` sends partials).
    - The dust-off mapping becomes `withoutDustCloud(tuning: GalaxyFieldTuning): GalaxyFieldTuning`
      (D6). Reduce `fieldTuningForEngine` (`engineBridge.ts:76-82`) to its spread, rename it
      (`npm run refactor -- rename tools/galaxy-renderer/src/state/engineBridge.ts#fieldTuningForEngine withoutDustCloud --no-file-rename`
      after exporting it), then
      `npm run refactor -- extract tools/galaxy-renderer/src/state/engineBridge.ts#withoutDustCloud src/layers/milkyWay/field/dust/utils/withoutDustCloud.ts`.
      The bridge keeps the `dustCloudEnabled` check at its call sites. No test: it is one spread.
  - `:424-470`: `deriveFrameView` keeps `proj`, fade and sprite lanes.
  - `:484`: `model.ensureFresh()` (bubbles), then `host.ensureFresh()`.
  - `:508-535`: `const plan = host.plan()`, then, iff the tool's own `analyticField` is on,
    `host.encode(enc, plan, frame.camera, render.analyticExposure * fade.alpha, fieldTargets(), id => timing.descriptorFor(slot))`.
    The slot name is derived from the id in that one lambda: `id` for `field` and `dustMap`,
    `` `hii:${id}` `` for the rest, which keeps today's HUD names. The `findHiiSegment` lookups at
    `:517-521` are deleted.
  - `:540-566`: composite `aggregate`, then, iff `analyticField`, `encodeFieldComposites(pass,
    aggregateUpsample, plan, fieldTargets())`, then `dustView` iff present and `debugViews.dust > 0`
    (tool-only).
  - `:576-583`, `:666`, `:671`, `:698`, `:707-750`: through `debug.renderer` / `debug.readbacks`.
  - `:770`: `host.destroy()`.
- [x] Update the old `galaxyField/` paths in `tools/galaxy-renderer/src/engine/README.md:9,23,28,38,49`.
- [x] `npm run galaxy-renderer:probe` must report no GPU errors. No new unit test (wiring). Commit.

### Task A11: Tool identity pair (controller-owned)

Run by the controller, not committed; the result goes to the ledger and the user.
- [x] Write a scratch Playwright script (`<scratch>/toolShots.mts`, run with `npx tsx`). Launch
      Chromium as `probeGpuErrors.ts:237-252` does, open `npm run galaxy-renderer`'s server, and
      wait about 60 frames for the ISM chain to settle.
- [x] Shoot the PNGs at two poses:
  - the default preset's outside view;
  - an in-disc view, reached by a fixed sequence of wheel and drag inputs.
- [x] Shoot at **BASE** (main after PR 0) twice, to establish the noise floor, and at **HEAD** once.
- [x] Report per pose: differing-pixel count and largest channel delta (BASE vs BASE, BASE vs HEAD).
      Send the pairs to the user as dash checks. The user gives the verdict; a 1-LSB difference is
      expected (top RISK).

---

# Part B: PR B (prep 4, then the feature)

**Branch:** a fresh branch off main after PR A merges.

## Prep 4a: a stable Gaussian cut

### Task B0: `gaussianRayCoeffs` computes its cut value without cancellation

`review: yes` (shader; owner ruling 2026-11-10: its own commit at the start of PR B).

**Files:** `src/services/gpu/shaders/lib/gaussianIntegral.wesl` (`gaussianRayCoeffs`, `:61`), its TS
twin if one exists (grep `gaussianRayCoeffs`), and the test that pins it.

- [x] The finding (PR A's A11 bisect): `q = max(c − b²/a, 0)` cancels in f32. For a compact HII shell
      about 31 kpc from the eye, c ≈ 4·10⁸ while q ≈ 10, so a 1-ULP change to the ray swings q across
      `SPLAT_CUT²` (`hiiSplat/shadeCommon.wesl:76`). Whether far, compact shells draw is therefore
      numerically random, and it gets worse at app distances.
- [x] Fix: q is invariant to sliding `o` along the ray, so compute q from `o' = o − d·dot(o, d)` (with
      unit `d`; if `d` isn't unit, use `dot(o, d)/dot(d, d)`). a and b keep using the original `o`.
- [x] Test: a CPU twin or f64 oracle shows the new q matches f64 within a small relative error at
      c ≈ 4·10⁸, where the old form is off by ≥ 1 unit. If no TS twin exists, write the test against
      a TS transcription of both forms and say so in its header (the WGSL itself is checked by the
      tool shots).
- [x] Re-shoot the A11 outside pose: the sub-pixel shell at (423, 393) should be stable across runs
      on both sides of the A5 change. Report any HII tier whose look changes.
- [x] Commit.

## Prep 4: nested settings

### Task B1: `cloud` / `field` / `renderer` settings, with setters

`review: yes` (Redux).

**Files:**
- Rename `src/@types/settings/MilkyWayTuning.d.ts` → `MilkyWayCloudTuning.d.ts`.
- Create `src/layers/milkyWay/@types/{MilkyWayRenderer,MilkyWayFieldTuning}.d.ts`,
  `src/layers/milkyWay/field/data/milkyWayFieldTuningDefaults.ts` and
  `tests/layers/milkyWay/state/milkyWay/slice.test.ts`.
- Modify:
  - `src/layers/milkyWay/@types/MilkyWaySettings.d.ts`
  - `src/layers/milkyWay/state/milkyWay/{slice,initialState}.ts`
  - `src/layers/milkyWay/tuning/sagas/reseedMilkyWayStarCountSaga.ts`
  - `src/layers/milkyWay/tuning/ui/{MilkyWayTuningSection,MilkyWayTuningSectionContainer}.tsx`
  - `src/layers/milkyWay/tuning/data/milkyWaySliderFields.ts`
  - `src/layers/milkyWay/tuning/@types/{MilkyWaySliderKey,MilkyWaySliderField}.d.ts`
  - `src/layers/milkyWay/tuning/utils/formatMilkyWayTuningDefaults.ts`
  - `src/layers/milkyWay/cloud/passes/{milkyWayPass,milkyWayAggregatePass}.ts`
  - `src/layers/milkyWay/cloud/render/milkyWayAggregateTarget.ts`
  - `src/layers/milkyWay/frame.ts`
  - `src/layers/milkyWay/cloud/@types/{MilkyWayCloudDrawArgs,MilkyWayCloud}.d.ts`
  - `src/services/engine/galaxyGenerator/v1/milkyWayCalibration.ts`
  - comments only: `src/services/engine/gpuHandles/gpuHandleRegistry.ts:52`,
    `src/layers/zoneOfAvoidance/state/zoneOfAvoidance/slice.ts:20-21`,
    `src/compositions/exhibits/cosmicFlows.ts:21`, `src/services/engine/galaxyGenerator/v1/README.md:51,84-85`
- Tests: `tests/services/gpu/renderTargets.test.ts:74`, `tests/services/engine/frame/runFrame.test.ts:138`,
  `tests/layers/milkyWay/frame.test.ts:18`, `tests/layers/milkyWay/tuning/sagas/reseedMilkyWayStarCountSaga.test.ts:40`,
  `tests/layers/milkyWay/tuning/data/milkyWaySliderFields.test.ts`

**Contract:**

```ts
// src/layers/milkyWay/@types/MilkyWayRenderer.d.ts
export type MilkyWayRenderer = 'v1' | 'v2' | 'both';
// src/layers/milkyWay/@types/MilkyWayFieldTuning.d.ts
export type MilkyWayFieldTuning = {
  readonly exposure: number;
  readonly dust: boolean;
  readonly divisors: Readonly<Record<FieldTargetId, number>>;
};
// MilkyWaySettings (no longer an intersection)
export type MilkyWaySettings = {
  enabled: boolean;
  labelEnabled: boolean;
  renderer: MilkyWayRenderer; // default 'v1'
  cloud: MilkyWayCloudTuning; // today's eight knobs, unchanged
  field: MilkyWayFieldTuning; // default MILKY_WAY_FIELD_TUNING_DEFAULTS
};
// slice actions
setMilkyWayCloudTuning(state, a: PayloadAction<Partial<MilkyWayCloudTuning>>) // merges into cloud
setMilkyWayFieldTuning(state, a: PayloadAction<Partial<MilkyWayFieldTuning>>) // merges into field (divisors replaced whole)
setMilkyWayRenderer(state, a: PayloadAction<MilkyWayRenderer>)
```

`MILKY_WAY_FIELD_TUNING_DEFAULTS = { exposure: FIELD_CALIBRATION.exposure, dust: true, divisors:
FIELD_CALIBRATION.divisors }`.

- [x] Rename the incumbents (D2), each as `npm run refactor -- rename <file>#<symbol> <newName>`:
  - `src/@types/settings/MilkyWayTuning.d.ts#MilkyWayTuning` → `MilkyWayCloudTuning`;
  - `…/v1/milkyWayCalibration.ts#MILKY_WAY_TUNING_DEFAULTS` → `MILKY_WAY_CLOUD_TUNING_DEFAULTS`
    (pass `--no-file-rename`);
  - `…/tuning/data/milkyWaySliderFields.ts#MILKY_WAY_SLIDER_FIELDS` → `MILKY_WAY_CLOUD_SLIDER_FIELDS`
    (`--no-file-rename`, then
    `npm run move-files -- src/layers/milkyWay/tuning/data/milkyWaySliderFields.ts src/layers/milkyWay/tuning/data/milkyWayCloudSliderFields.ts`);
  - `MilkyWaySliderKey` → `MilkyWayCloudSliderKey`;
  - `MilkyWaySliderField` → `MilkyWayCloudSliderField`;
  - `milkyWaySliderPatch` → `milkyWayCloudSliderPatch`;
  - `formatMilkyWayTuningDefaults` → `formatMilkyWayCloudTuningDefaults`.

  Then grep for each old name across `src tools tests docs packages`.
- [x] Nest the settings. The `.cloud` readers:
  - `milkyWayPass.ts:84`, `milkyWayAggregatePass.ts:51` (`tuning: state.settings.milkyWay.cloud`);
  - `milkyWayAggregateTarget.ts:15`, `frame.ts:20`;
  - `MilkyWayTuningSection.tsx:27,33`.

  `reseedMilkyWayStarCountSaga` dispatches `setMilkyWayCloudTuning({ starCount })`. Persistence
  needs no migration: none exists (`src/state/persistedValues.ts`).
- [x] **Test, new:** `slice.test.ts` (milkyWay settings reducers):
  - `it('a cloud patch merges into cloud and leaves field and renderer')`: `cloud.exposure` changes,
    and `field` and `renderer` stay `toBe` the previous objects/values.
  - `it('a field patch merges into field and leaves cloud')`.
  - `it('setMilkyWayRenderer sets only renderer')`.
- [x] **Test, updated:** `milkyWayCloudSliderFields.test.ts` runs its two asserts against
      `MILKY_WAY_CLOUD_TUNING_DEFAULTS`. Repoint the four fixture tests above to
      `milkyWay: { cloud: { … } }`.
- [x] Commit.

## The feature

### Task B2: `selectMilkyWayParts`

**Files:** create `src/layers/milkyWay/@types/MilkyWayParts.d.ts`,
`src/layers/milkyWay/state/milkyWay/selectMilkyWayParts.ts` and
`tests/layers/milkyWay/state/milkyWay/selectMilkyWayParts.test.ts`

```ts
export type MilkyWayParts = { readonly cloud: boolean; readonly cloudDust: boolean; readonly field: boolean };
export function selectMilkyWayParts(settings: MilkyWaySettings): MilkyWayParts; // the only reader of `renderer`
```

- [x] **Test:** `it.each` over the three rows:

| `renderer` | `cloud` | `cloudDust` | `field` |
| --- | --- | --- | --- |
| `'v1'` | true | true | false |
| `'v2'` | false | false | true |
| `'both'` | true | false | true |

  Return one frozen constant per row, so callers get stable identity.
- [x] Commit.

### Task B3: `deriveFieldView`

`review: yes` (camera maths).

**Files:** create `src/layers/milkyWay/field/utils/deriveFieldView.ts`,
`src/layers/milkyWay/cloud/render/milkyWayInverseModelCached.ts` and
`tests/layers/milkyWay/field/utils/deriveFieldView.test.ts`; modify
`src/layers/milkyWay/cloud/render/milkyWayCamPosModel.ts`

```ts
export function deriveFieldView(frame: FrameView, toGalaxy: Mat4): FieldView;
```

- `eye` = `toGalaxy · frame.drawCamPos`, as a point.
- The world basis is rebuilt from `frame.cam` exactly as `computeViewProj.ts:100-110` does:
  `orbitForwardOf`, then `imagePlaneBasis(fwd, cam.roll ?? 0, frameUp(cam.upBasis, …))`, with
  `right`, `up` = `basis.up` and `fwd`. Then `toGalaxy` is applied to each as a direction
  (w = 0) and the result normalised.
- `frustum` is `frame.frustum`, the same object: a rotation plus uniform scale keeps angles.
- The app's `toGalaxy` is the memoised `inverse(milkyWayModelCached())` that `milkyWayCamPosModel`
  already holds. Extract that inverse into `src/layers/milkyWay/cloud/render/milkyWayInverseModelCached.ts`
  and have both use it.
- [x] **Test:**
      `it('with the identity, rays built from the FieldView land on their own NDC under frame.vp')`.
  - Build a `FrameView` fixture with `frustum = shiftedFrustum(0.8, 16/9, [0.3, −0.2])`,
    `vp = computeViewProj(cam, frustum)` and `cam.roll = 0.4`.
  - For `ndc ∈ {(−1,−1), (1,1), (0.25,0.6)}`: `t = mid + ndc·half` from `view.frustum`,
    `P = eye + 5·(fwd + right·t.x + up·t.y)`, and `frame.vp · P` divided by w must equal `ndc`
    within 1e-5.
  - Also assert `view.eye` equals `drawCamPos` and `view.frustum` is `frame.frustum` (`toBe`).
  - The oracle is the app's real projection, so this pins the basis, its handedness, the roll and
    the asymmetric frustum together.
- [x] **Test:** `it('in the galaxy frame, the eye is milkyWayCamPosModel's and rays stay parallel')`.
  - With `toGalaxy = milkyWayInverseModelCached()`, `view.eye` ≈ `milkyWayCamPosModel(drawCamPos)`
    (1e-9 relative).
  - Map `fwd + right·t.x + up·t.y` back by `milkyWayModelCached()` as a direction; it must be
    parallel to the world-frame ray (cross product ≈ 0).
- [x] Commit.

### Task B3b: One kpc-per-unit scale for the field and its placement

`review: yes` (units, owner ruling 2026-11-10: investigate and fix in PR B).

**Files:** `src/layers/milkyWay/field/mixture/utils/pcToUnits.ts` (`KPC_PER_UNIT = 1.6667`), its
seven callers (grep `pcToUnits`), `src/layers/milkyWay/cloud/render/milkyWayModelMatrix.ts`
(`MILKY_WAY_MODEL_SCALE`), `src/data/milkyWay/milkyWayGalaxyParams.ts`, and the matching test.

- [x] Investigate first, and write the finding into the commit body. The field's `pcToUnits` says
      1 unit = 1.6667 kpc. The placement (`MILKY_WAY_MODEL_SCALE`, 17.5 kpc / 10 units) implies 1.75.
      Find which number the generator's geometry (`describeGalaxy(MILKY_WAY_GALAXY_PARAMS)`) actually
      uses for its outer radius, and which one v1's sprite cloud uses. The right constant is the one
      that makes the field and the cloud the same size under one model matrix.
- [x] Derive the constant from that one source (the galaxy params or the model scale) instead of a
      second literal, so the two can't drift again.
- [x] Test: `it('the field and the cloud share one kpc-per-unit scale')`, pinning `pcToUnits(1000)`
      against the scale the placement uses.
- [x] If the fix changes the tool's look (pc-sized features such as HII radii, dust bubbles or the DIG
      veil rescale by about 5%), say so in the reply. The B11 shots carry it to the user.
- [x] Commit.

### Task B4: Target rows, and `mw-aggregate` allocated only for the cloud

**Files:**
- Create `src/layers/milkyWay/field/render/fieldTargetRows.ts` and
  `src/layers/milkyWay/field/utils/fieldRenderTargetsOf.ts`.
- Modify `src/layers/milkyWay/cloud/render/milkyWayAggregateTarget.ts` and
  `src/layers/milkyWay/layer.ts`.

```ts
// field/render/fieldTargetRows.ts — one RenderTargetSpec per FIELD_TARGET_IDS entry
export const FIELD_TARGET_ROWS: readonly RenderTargetSpec[];
//   id `mw-field-${id}`; format DUST_MAP_FORMAT for 'dustMap', else HDR_TARGET_FORMAT; depth null;
//   clearValue {0,0,0,0}; scale (s) => s.settings.milkyWay.field.divisors[id];
//   allocateWhen (s) => selectMilkyWayParts(s.settings.milkyWay).field
// field/utils/fieldRenderTargetsOf.ts — viewOf/sizeOf per FIELD_TARGET_IDS id into the A6 record (no dustView)
export function fieldRenderTargetsOf(targets: RenderTargets): GalaxyFieldRenderTargets;
```

- [x] `MILKY_WAY_AGGREGATE_TARGET` gains `allocateWhen: (s) => selectMilkyWayParts(s.settings.milkyWay).cloud`.
      B8 gates both passes that read it on the same part; `viewOf`/`sizeOf` throw on a released row.
- [x] `layer.ts` `targets: [MILKY_WAY_AGGREGATE_TARGET, ...FIELD_TARGET_ROWS]`.
- [x] Confirm the usage `renderTargets.ts` allocates includes `TEXTURE_BINDING`, since the field
      shaders sample the dust map.
- [x] No new test: the rows are data, and `checkFrameOrder` already rejects malformed rows at boot.
      Commit.

### Task B5: The host slot and the planner lifecycle

`review: yes` (the lifecycle; landmine memory "values, not shared mutable state").

**Files:**
- Create `src/layers/milkyWay/field/host/@types/{FieldHostSlot,FieldPlannerValue}.d.ts`,
  `src/layers/milkyWay/field/host/subsystems/createFieldHostSlot.ts` and
  `tests/layers/milkyWay/field/host/subsystems/createFieldHostSlot.test.ts`.
- Modify `src/layers/milkyWay/@types/MilkyWayRuntime.d.ts`,
  `src/layers/milkyWay/{create,destroy,frame}.ts` and `tests/layers/milkyWay/frame.test.ts`.

```ts
// field/host/@types/FieldPlannerValue.d.ts — milkyWayPlanner's value; the compute and the composite read it
export type FieldPlannerValue = { readonly host: GalaxyFieldHost; readonly plan: FieldFramePlan } | null;

// field/host/@types/FieldHostSlot.d.ts
export type FieldHostSlot = {
  /** Create on the first `true`, destroy on `false`. While on: `host.setTuning(tuningFor(dust))` every call, then
   *  ensureFresh; returns the live host, or null when off. The host's identity keys skip unchanged sections. */
  sync(field: boolean, dust: boolean): GalaxyFieldHost | null;
  destroy(): void;
};
export function createFieldHostSlot(deps: {
  readonly create: () => GalaxyFieldHost; // the real one wraps createGalaxyFieldHost(...).host, dropping `debug`
  readonly tuningFor: (dust: boolean) => FieldHostTuning; // memoised: stable identity per `dust`
}): FieldHostSlot;
```

- [x] The real `tuningFor` is built once in `create.ts`:
  - `geometry` is `describeGalaxy(MILKY_WAY_GALAXY_PARAMS)` (see the units RISK), with the matching
    `seed`.
  - `extras` is a frozen `[]`.
  - `field` is `DEFAULT_GALAXY_FIELD_TUNING`, or `withoutDustCloud(DEFAULT_GALAXY_FIELD_TUNING)`.
  - `render` is `FIELD_CALIBRATION.render` as it stands (its neutral debug lanes included); the app
    hand-builds no inert lane.
  - `onIsmMapLanded` is `deps.requestRender`, because the app renders on demand.
- [x] `MilkyWayRuntime` gains `readonly fieldHost: FieldHostSlot`.
  - `milkyWayPlanner` (once scope, type `FrameContentPlanner<FieldPlannerValue>`) calls
    `const host = runtime.fieldHost.sync(parts.field, state.settings.milkyWay.field.dust)` after the
    cloud reconcile, then returns `value: host === null ? null : { host, plan: host.plan() }`. This
    is the only `plan()` call in a frame.
  - `destroy.ts` calls `fieldHost.destroy()`.
  - With `'v1'` nothing is created at startup.
- [x] **Test, new:** `createFieldHostSlot` (a fake `create` that counts calls and records
      `setTuning`/`ensureFresh`/`destroy`):
  - `it('creates on the first field frame and not again while on')`.
  - `it('destroys when the field part turns off, and recreates when it returns')`.
  - `it('re-tunes on every sync with the tuning for the current dust')`: three `sync(true, true)`
    calls make three `setTuning` calls, all with `tuningFor(true)`; `sync(true, false)` then passes
    `tuningFor(false)`.
  - `it('sync returns the live host, and null when off')`.
  - `it('destroy releases a live host')`.
- [x] **Test, updated:** `frame.test.ts`,
      `it('the planner value carries the host and its plan only while the field part is on')`.
- [x] Commit.

### Task B6: The `mw-field` compute, its gate and the timing span

`review: yes`.

**Files:**
- Create `src/layers/milkyWay/field/computes/milkyWayFieldCompute.ts`,
  `src/layers/milkyWay/field/present/milkyWayFieldAlpha.ts`,
  `src/layers/milkyWay/field/utils/spanTimestampWrites.ts`,
  `tests/layers/milkyWay/field/present/milkyWayFieldAlpha.test.ts` and
  `tests/layers/milkyWay/field/utils/spanTimestampWrites.test.ts`.
- Modify `src/layers/milkyWay/layer.ts` (add `computes`) and `src/data/rendering/frameSections.ts`
  (SCENE compute line, today `:103`).

```ts
// field/present/milkyWayFieldAlpha.ts — the ONE gate the compute and the composite share
export function milkyWayFieldAlpha(
  runtime: MilkyWayRuntime,
  planner: FrameContentPlanner<FieldPlannerValue>,
  state: PassState,
  ctx: FrameView,
  fade: number,
): number | null;
// null when ctx.snapshot.plans.get(planner, ctx) is null (no host), or when
// state.settings.debug.disabledPasses[computeTimingSlotName('mw-field', ctx.id)] === true (the
// DebugPanel switched the compute off, so its targets are last frame's), or when
// deriveMilkyWayCloudAlpha(ctx, fade, runtime.pickCode) is null; else that alpha.

// field/utils/spanTimestampWrites.ts — one compute slot bracketing every pass the plan encodes
export function spanTimestampWrites(
  claim: ClaimTimestampWrites,
  plan: FieldFramePlan,
): (id: FieldTargetId) => GPURenderPassTimestampWrites | undefined;
// claim() is called once, lazily, at the first id asked for. That id gets { querySet,
// beginningOfPassWriteIndex }; plan.encodes.at(-1) gets { querySet, endOfPassWriteIndex }; a
// single-pass plan gets both; every other id gets undefined. The compute descriptor is
// structurally the render one; cast once here, documented.

// field/computes/milkyWayFieldCompute.ts
export function milkyWayFieldCompute(
  runtime: MilkyWayRuntime,
  planner: FrameContentPlanner<FieldPlannerValue>,
): ContentCompute<'milkyWayDisk'>;
// name 'mw-field', scope 'perView', fade 'milkyWayDisk'. encode: alpha = milkyWayFieldAlpha(...);
// null ⇒ return. const { host, plan } = ctx.snapshot.plans.get(planner, ctx)! (non-null after the
// gate); host.encode(encoder, plan, deriveFieldView(ctx, milkyWayInverseModelCached()),
// settings.milkyWay.field.exposure * alpha, fieldRenderTargetsOf(ctx.snapshot.renderTargets),
// spanTimestampWrites(claim, plan)).
```

- [x] `layer.ts` passes `milkyWayPlanner(runtime)` to the compute and the composite as their
      `planner` handle: the store keys by `planner.name` (`createFramePlannerResultStore.ts:30`),
      so a second construction is only a typed handle onto the same result.
- [x] Add `{ kind: 'compute', name: 'mw-field' }` to SCENE's compute line beside
      `aerial-perspective`. The slot `mw-field-compute` derives automatically
      (`computeTimingSlotName`).
- [x] The field passes clear their targets themselves (`beginClearPass`). Compute-written targets
      are invisible to `touched` (`executeFrame.ts:193`), so nothing else clears them.
- [x] **Test, new:** `milkyWayFieldAlpha`:
  - `it('is null when the mw-field-compute toggle is off, so the composite never adds stale targets')`:
    a planner value with a host and a visible pose gives a number; with
    `settings.debug.disabledPasses['mw-field-compute'] = true` it gives null.
- [x] **Test, new:** `spanTimestampWrites`:
  - `it('brackets the first and last encoded pass with one claim')`: with
    `encodes = ['dustMap', 'field', 'young']`, asking for all three in order gives begin, nothing,
    end, and `claim` is called exactly once.
  - `it('a single-pass plan gets both indices')`.
  - `it('never claims when no pass asks')`.
- [x] Commit.

### Task B7: The `milky-way-field` composite pass

**Files:**
- Create `src/layers/milkyWay/field/passes/milkyWayFieldPass.ts`.
- Modify `src/layers/milkyWay/layer.ts`, `src/data/rendering/frameSections.ts` (the hdr NEAR0 line,
  today `:166-183`), `src/layers/milkyWay/@types/MilkyWayRuntime.d.ts`,
  `src/layers/milkyWay/{create,destroy}.ts` and
  `src/layers/milkyWay/cloud/passes/milkyWayUpsamplePass.ts`.

- [x] `milkyWayFieldPass(runtime, planner): ContentPass<'milkyWayDisk'>`:
  - name `'milky-way-field'`,
    `enabled = milkyWayFieldAlpha(runtime, planner, state, ctx, fade) !== null`, so it also skips
    when the compute is DebugPanel-disabled;
  - draw reads `{ plan } = ctx.snapshot.plans.get(planner, ctx)!` and calls
    `encodeFieldComposites(pass, runtime.additiveUpsample, plan,
    fieldRenderTargetsOf(ctx.snapshot.renderTargets))`;
  - no pick.
- [x] Insert `'milky-way-field'` right after `'milky-way-upsample'` on the hdr NEAR0 line, so v1
      dust (`milky-way`) extincts field light as it does the cloud's.
- [x] Runtime member `aggregateUpsample` → `additiveUpsample`, since it now serves both. Hand-edit
      it; it is a property, not an exported symbol, so `refactor rename` doesn't apply. The sites are
      `MilkyWayRuntime.d.ts`, `create.ts`, `destroy.ts` and `milkyWayUpsamplePass.ts`; grep the old
      name.
- [x] No new test: `checkFrameOrder` validates the line at boot, and B11 checks the pixels. Commit.

### Task B8: v1 gates

`review: yes` (pick behaviour).

**Files:** `src/layers/milkyWay/cloud/passes/{milkyWayAggregatePass,milkyWayUpsamplePass,milkyWayPass}.ts`,
`tests/layers/milkyWay/cloud/passes/milkyWayPass.test.ts`

- [x] `milky-way-aggregate` and `milky-way-upsample`:
      `enabled = parts.cloud && deriveMilkyWayCloudAlpha(...) !== null`. This matches B4's
      `allocateWhen`.
- [x] `milky-way`: `enabled = parts.cloudDust && alpha !== null`. Leave `pickEnabled` and `drawPick`
      untouched; `pickProgram.ts:17` filters picks by `pickEnabled ?? enabled`, so the impostor
      still picks in `'v2'`.
- [x] **Test, new:** in `milkyWayPass.test.ts`,
      `it('in v2 the dust draw is off but the pick impostor still picks')`. With
      `renderer: 'v2'`, `enabled` is false and `pickEnabled` is true at a pickable pose.
- [x] Commit.

### Task B9: DebugPanel rows

Read `docs/superpowers/conventions/ui-ux.md` and `.claude/skills/create-component/SKILL.md` first.

**Files:**
- Create `src/layers/milkyWay/tuning/@types/MilkyWayFieldSliderKey.d.ts` and
  `src/layers/milkyWay/tuning/data/milkyWayFieldSliderFields.ts`.
- Modify `src/layers/milkyWay/tuning/ui/{MilkyWayTuningSection,MilkyWayTuningSectionContainer}.tsx`,
  `tests/layers/milkyWay/tuning/data/milkyWayCloudSliderFields.test.ts` and
  `packages/website/src/data/docsDebugSections.ts:83-87`.

```ts
export type MilkyWayFieldSliderKey = 'exposure' | FieldTargetId;
export const MILKY_WAY_FIELD_SLIDER_FIELDS: readonly SliderField<MilkyWayFieldSliderKey>[]; // exposure row + one divisor row per FIELD_TARGET_IDS
```

- [x] The section shows:
  - a renderer `<select>` first, as a child of `DebugTuningSection`
    (`BlackHoleLensingTuningSection.tsx:41-61`);
  - the cloud slider rows when `parts.cloud`;
  - the field rows when `parts.field`, with `values = { exposure, ...divisors }` and a dust
    checkbox (`DebugOverlayToggles.tsx:27-35`).

  Divisor changes dispatch `setMilkyWayFieldTuning({ divisors: { ...divisors, [id]: v } })`. The
  container memoises the field values object on `settings.milkyWay.field`.
- [x] **Test, updated:** the slider parity file asserts the field table too. Its keys sorted equal
      `['exposure', ...FIELD_TARGET_IDS]` sorted, and every row has `step > 0` and
      `min ≤ default ≤ max` against `MILKY_WAY_FIELD_TUNING_DEFAULTS`.
- [x] Update the website's debug-section prose to mention the renderer switch. Commit.

### Task B10: Docs

**Files:** `src/layers/milkyWay/field/README.md`, `docs/research/engine/field-seam-map.md`,
`docs/research/engine/decisions.md`, `docs/RENDERER.md`, `src/services/engine/galaxyGenerator/shared/README.md`

- [x] In `field/README.md`, replace "Only the tool drives this tier today" (today `v2/README.md:40`)
      with: the app draws it behind `renderer`, and the tool and the app share `field/host/`.
- [x] Rewrite `field-seam-map.md` §2 against the post-PR-B files.
- [x] Set Track C's status in `decisions.md` (around `:808`) to landed behind the debug switch.
- [x] Add a renderer-map entry in `docs/RENDERER.md` § "Renderer quick map": `mw-field` compute →
      `milky-way-field` composite, the per-view limit, and compute-written targets clearing
      themselves.
- [x] Fix the stale "`v2/`" mentions in `shared/README.md:5,20,41,47-48`. Commit.

### Task B11: Verification (controller-owned)

- [x] **First light.** Run a scratch Playwright script against your own dev server. It reuses
      `npm run shot`'s settle wait (`window.__skymap.settled()`) and switches with
      `window.__skymap.dispatch(setMilkyWayRenderer(...))`.
  - Poses: the Milky Way pose and an in-disc pose, each in `'v1'`, `'v2'` and `'both'`.
  - Plus one shot with a panel open, after confirming from `getState()` that the frame's lens shift
    is non-zero, so the asymmetric frustum is exercised.
  - Send each as a dash check with its deep link. The user gives the verdict.
  - If the first landing of `invMeanNorm` pops visibly, report it; the spec then adds a seed value
    to `FIELD_CALIBRATION`.
- [x] **Cost.** Read `.claude/skills/perf/SKILL.md`. Run `npm run perf -- --url http://localhost:<port>`
      with the default `'v1'` at PR B's BASE and HEAD. The two must match.
- [x] **Field cost.** Read the `mw-field-compute` row with `?gpuTimings` in `'v2'` at the Milky Way
      pose. Record it in the ledger; it is not gated.

---

## Definition of Done

**Deliverables:**
- `src/layers/milkyWay/field/host/` exists, with `createGalaxyFieldHost` (returning `{ host, debug }`),
  `createFieldHostSlot`, `planFieldFrame`, `encodeFieldComposites`, the readbacks and
  `DUST_MAP_FORMAT`.
- `field/@types/{FieldView,FieldTarget,FieldTargetId,FieldFramePlan}.d.ts` and
  `field/data/fieldCalibration.ts` exist.
- `field/{computes/milkyWayFieldCompute,passes/milkyWayFieldPass,render/fieldTargetRows,utils/deriveFieldView}.ts`
  exist.
- `selectMilkyWayParts`, `setMilkyWayCloudTuning`, `setMilkyWayFieldTuning` and
  `setMilkyWayRenderer` exist.
- No `params` member remains in `FieldUniforms`. No `FieldCamera`, `encodeSceneComposites`,
  `createIsmMapReadbacks` or `createReadbackQueue` remains under `tools/`.
- None of the 11 multi-function builders remains, and `arms/utils` holds ≤ 15 files.

**Observable behaviour (manual):**
- The tool's default preset renders identically to BASE (A11 verdict). Its HUD still lists per-pass
  field timings.
- The app defaults to `'v1'`, and the image and perf match BASE.
- `'v2'` shows the field at the Milky Way pose and in-disc, with no v1 dust. Clicking the disc still
  selects the Milky Way.
- `'both'` sums the two, with v1 dust off.
- The field stays registered with the stars when a side panel opens (lens shift).
- `'v1'` → `'v2'` → `'v1'` frees the field targets; `mw-field-*` drops out of the target list.
- The `mw-field-compute` row appears in `?gpuTimings` only while the field draws.

**Deferral boundary:** these are out of scope.
- Deleting v1. Making the field the default. The Edenhofer dust volume. The declarative frame
  program. Porting the tool's deep tuning. Split-screen.
- A "building field…" indicator for the first switch to `'v2'` (it needs a host-to-store signal).
- Letting a `ContentCompute` declare the targets it writes so `touched` sees them. It is the deeper
  fix behind the composite's disabled-compute gate (B6), and it grows the frame contract, which
  needs the owner's yes.
- The stale `timedSlotsOf.ts:4` doc ("nothing for a compute"): offer it as an adjacent fix, don't
  fold it in.
