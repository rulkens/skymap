# Field Seam Map — v2 Analytic-Field Milky Way: tool → app

## 1. TOOL SIDE — end-to-end v2 field render chain

**Data build (pure, device-free, CPU):**
- `buildGalaxyFieldMixture` — `src/layers/milkyWay/field/mixture/utils/galaxyFieldMixture.ts:1` (cap `GALAXY_FIELD_MAX_COMPONENTS = 3000`, line 59) turns `GalaxyDescription` + `GalaxyFieldTuning` into flat `GalaxyFieldComponent[]` (disc/bulge/bar/arm ridges). Component shape: `src/@types/galaxy/GalaxyFieldComponent.ts:13` — amplitude, inverse-covariance diag/off-diag, color, center, boundRadius, optional textureWeight/starsWeight.
- `buildHiiRegions` (`v2/hiiRegions.ts`) — Strömgren shells + OB cores, same component shape, separate list.
- `buildGalaxyIsmMapArmForcing` + `sfEventCatalog.ts` + `dustBubblePlacements.ts` — ISM-map forcing grid, SF-event catalog, dust-bubble placements. Per `v2/README.md:16-20`, GPU placement (dust/arm-cloud/arm-spur-cloud) has moved to WGSL (`ismMap/placeDust.wesl`, `placeArmCloud.wesl`, `placeArmSpurCloud.wesl`); the `v2/*.ts` files now only supply constants/budgets that the GPU dispatch hosts in `tools/galaxy-renderer/src/engine/ismMap/` read.
- All three builders consume the same `GalaxyDescription` (`shared/describeGalaxy`) that v1's `packGenerationUniforms` also consumes — v2/README.md:28-35: "makes the field and the sprites two renderings of one galaxy."

**Tool-only GPU orchestration** (`tools/galaxy-renderer/src/engine/`):
- `createGalaxyEngine.ts` — device/pipelines/targets/bind-groups/per-frame encode, ~1256 lines. Header (lines 1-9): "Shaders here are the runtime's own, symlinked via wesl.toml — editing one changes both apps. Only the ORCHESTRATION is duplicated." `TIMING_SLOTS` (`timing/timingSlots.ts:12-65`) is the one account of pass order: `stars → dustMap → field → hii:shells → hii:young → hii:dig → hii:extras → scene → bloom → composite → grade`.
- `model/createGalaxyModel.ts` — "what a galaxy IS": central galaxy's sprite buffers + background extras, both analytic mixtures (emission + HII), dust cloud, SSPISM map, and the GPU record buffers it all packs into (header comment, lines 1-11).
- `field/` — `createFieldPipelines.ts` (four splat pipelines + dust-map + dust-present pass, all `layout:'auto'` bind groups), `packFieldUniforms.ts` (`FIELD_HEADER_FLOATS = 68`, `FIELD_COMPONENT_FLOATS = 16` — 4×vec4 per comp, packFieldUniforms.ts:48/54), `encodeSplatPass.ts` (one additive instanced-quad splat shared by field/hii:extras/every HII tier, encodeSplatPass.ts:1-41), `encodeDustMapPass.ts`, `encodeDustPresentPass.ts` (JWST debug view), `buildFieldHeaderInputs.ts` (assembles every `FieldHeaderInput` per frame from camera/render/model), `deriveDustHeaderLanes.ts`, `dustSliceEdges.ts`, `packBubbleInstances.ts`, `findHiiSegment.ts`, `createArmRidgeDebugSample.ts`.
- `ismMap/` (~20 files) — fluid ISM-map generator + orientation chain: `createIsmMapGenerator.ts` (dispatcher), `createIsmMapFluidRunner.ts` (the fluid solver), `createIsmMapOrientation.ts`, `createIsmMapRingReduce.ts` (GPU replacement of a CPU ring-mean loop), `createIsmMapDustCdfScan.ts` (×2 instances: dust + DIG veil, GPU prefix-sum), `createIsmMapPlaceDust/PlaceArmCloud/PlaceArmSpurCloud/PlaceDigVeil.ts` (GPU placement dispatch hosts), plus readback/diagnostics (`createIsmMapReadbacks.ts`, `createOrientationDiagnostics.ts`, `decodeOrientationTexels.ts`, `orientationCoherenceStats.ts`) and packers (`packIsmMapFluidConstants/Events/StepIndex.ts`, `packPlaceDust/PlaceArmCloud/PlaceArmSpurCloud/PlaceDigVeilParams.ts`).
- `gpu/` — `createGalaxyRenderTargets.ts` (all size-following offscreens), `bakeVolumeTexture.ts` (once-baked noise volumes), `createGrowOnlyRecordBuffer.ts`, `createReadbackQueue.ts`, `readTextureChannelSum.ts` (debug flux-sum readback).
- `frame/deriveFrameView.ts` — per-frame pure derivation (view/vp/fade/galaxyWeight/debugViews) shared by every consumer that frame.
- `passes/beginClearPass.ts`, `encodePresentOverlay.ts`, `encodeSceneComposites.ts` — the shared pass vocabulary both tiers use.
- `post/` — `encodeBloomPyramid.ts` (mirrors app's `runBloom` order by hand), `createGradePipeline.ts` + `packGradeUniforms.ts` + `gradeIsActive.ts` — **the one deliberately tool-only pass** (saturation/vignette/optional gamma), skipped at identity defaults so default chain == app chain (`tools/galaxy-renderer/README.md:200-205`).
- `probe/createOffscreenProbe.ts`, `sampleLuminanceStats.ts`, `swizzleToRgba.ts` — headless readback path the auto-fit matcher drives.
- `timing/` — `createFrameTimer.ts`, `createPassTimingWindows.ts`, `createReportThrottle.ts`, `timingSlots.ts`.

**Shaders — already shared via symlinks, not tool-only:** `tools/galaxy-renderer/wesl.toml:1-83` documents the arrangement: `src/engine/shaders/milkyWay/sprites`, `.../field/` (real dir with per-file leaf symlinks + dir symlinks for `fieldSplat/`, `hiiSplat/`, `dustMap/`, `dustPresent/`, `bubblePresent/`), `.../ismMap`, `additiveUpsample`, `bloom`, `compositor`, and several `lib/*.wesl` files all symlink into `src/services/gpu/shaders/...`. The one non-symlinked shader is `src/engine/shaders/grade.wesl` (tool-only). **All `.wesl` under `src/services/gpu/shaders/milkyWay/field/` and `.../ismMap/` already exist in `src/` and are consumed by the tool through the symlink** — the shaders for v2 are NOT tool-only; only the TypeScript orchestration around them is.

**Pass ordering / formats** (`createGalaxyRenderTargets.ts`):
- `sceneTex`/`ldrTex`: canvas-sized, `hdr` (`rgba16float`)/`swap` format.
- `aggregateTex` (v1 sprite stars, additive): `rgba16float`, `1/aggregateDivisor` scale.
- `fieldTex` (v2 emission mixture, additive): `rgba16float`, own `fieldDivisor` — deliberately NOT shared with `aggregateTex` (field survives much coarser downsampling, lines 76-84).
- `dustMapTex` (dust-column map): `rgba16float`, own `dustDivisor`, 4 channels = tau_0..tau_3 optical depth per depth slice (createGalaxyEngine.ts:103-110); finer divisor than field (createGalaxyRenderTargets.ts:86-100).
- `hiiTex` + 3 tier textures (`hii:shells`/`hii:young`/`hii:dig`), each `rgba16float`, own divisor — split one at a time because small bright shell sprites collapse into bloom fireflies under a shared coarse texel (lines 102-127).
- `dustViewTex` (JWST debug present): `rgba16float`, divisor-matched to `dustMapTex`.
- Baked noise volumes (once, param/view-independent): `dustNoiseTex` 128³ `rgba8unorm` ridged-fbm, `warpNoiseTex` 64³ `rgba8unorm` value noise, `starGrainTex` 128³ `rgba8unorm` log-normal point grains (createGalaxyEngine.ts:99-146).
- Per-frame pass order in `drawFrame` (createGalaxyEngine.ts:820-1051+): `stars` (v1 sprites, gated `render.spriteField`) → if `analytic` gate: `dustMap` (gated on dust count / debug view / stale-latch) → optional `dustPresent` (JWST debug) → `field` splat (unconditional) → each `HII_TIERS` splat with content → `hii:extras` splat → single `scene` pass additively compositing aggregate+field+HII tiers+dust-view via `encodeSceneComposites`, then diagnostic overlays → bloom pyramid → `composite` (exposure+tone curve) → optional `grade` (tool-only).
- Dust is **multiplicative**, applied in the dust pass, not part of the additive emission mixture — "Emission-only is closed form; emission with self-absorption is not... dust is a separate multiplicative screen."

## 2. APP SIDE — the shipped wiring (v1 cloud and v2 field in one Layer)

Both renderers live in `src/layers/milkyWay/`. `settings.milkyWay.renderer` (`'v1' | 'v2' | 'both'`, default `'v1'`) picks the parts that draw; `selectMilkyWayParts` (`state/milkyWay/selectors.ts`) is its only reader. Knobs are grouped: `settings.milkyWay.cloud` (v1) and `settings.milkyWay.field` (`exposure`, `dust`, per-target `divisors`; defaults from `FIELD_CALIBRATION`, shared with the tool). The DebugPanel section (`tuning/ui/MilkyWayTuningSection.tsx`) holds the switch and both sets of rows.

- **Host.** `field/host/subsystems/createGalaxyFieldHost.ts` is the narrow `GalaxyFieldHost` (`setTuning`, `ensureFresh`, `plan`, `encode`) that the app and the tool share. `createFieldHostSlot.ts` creates it lazily when the field part first turns on and frees it when it turns off.
- **Planner.** `frame.ts` `milkyWayPlanner` (scope `'once'`) reconciles the cloud's star count, syncs the host and calls `host.plan()` once per frame. Its `FieldPlannerValue` (`{ host, plan }` or null) is what the compute and the composite both read, so they cannot disagree.
- **Compute.** `field/computes/milkyWayFieldCompute.ts`, row `mw-field` (scope `'perView'`): encodes every pass the plan names into the `mw-field-*` targets, in every view. It reads fade `milkyWayDisk`.
- **Targets.** `field/render/fieldTargetRows.ts`: one `mw-field-<id>` row per `FIELD_TARGET_IDS` entry, scaled by the live divisor and allocated only while the field part draws. The field's passes clear them themselves.
- **Composite.** `field/passes/milkyWayFieldPass.ts`, pass `milky-way-field`: adds the targets into `hdr` right after `milky-way-upsample` and before the v1 dust pass `milky-way`, so cloud dust extincts the field's light.
- **v1 path.** `cloud/` keeps the sprite cloud: `milkyWayAggregatePass` into `mw-aggregate`, `milkyWayUpsamplePass`, `milkyWayPass` (dust and pick). Tier is scheduled for deletion (`src/services/engine/galaxyGenerator/v1/README.md`).
- **Timing.** `field/utils/spanTimestampWrites.ts` spans the compute's passes under `mw-field-compute` for `?gpuTimings`.

## 3. SHARED/GAP

**Already shared (single source of truth in `src/`):**
- All `src/services/gpu/shaders/milkyWay/field/*.wesl` and `.../ismMap/*.wesl` — symlinked into the tool per `wesl.toml`.
- v2 data builders (`src/layers/milkyWay/field/**/utils/*.ts`) + `galaxyGenerator/shared/*` — pure, device-free, currently only imported by the tool.
- `src/services/gpu/passes/bloomPyramid.ts`, `compositor.ts`, `additiveUpsample.ts`, `src/services/gpu/lib/blendStates.ts` — factories the tool imports directly (createGalaxyEngine.ts:82-85).
- `gpuTimingService.ts`, `shaderCompileLogger.ts`, `hasUrlGate.ts` — imported whole by the tool.
- `src/@types/galaxy/*` — shared data contracts.
- `v1/milkyWayCalibration.ts` — v1/README.md:57-61 flags `MILKY_WAY_RADIUS_MPC`, `MILKY_WAY_MODEL_SCALE`, fade thresholds for **promotion**, not deletion, when a field renderer lands.

**Tool-only — no app equivalent exists yet** (`tools/galaxy-renderer/src/engine/`):
| file | role |
|---|---|
| `createGalaxyEngine.ts` | device/pipeline/target/bind-group orchestration + per-frame encode — the file the app needs a frameProgram/layer equivalent of |
| `field/createFieldPipelines.ts` | 4 splat pipelines + dust-map/dust-present pipelines + `layout:'auto'` bind groups |
| `field/packFieldUniforms.ts` | packs FieldUniforms header (68 floats) + comps storage array (16 floats/comp) — byte contract with `field/io.wesl` |
| `field/encodeSplatPass.ts` | shared additive-Gaussian-mixture splat encoder (field, hii:extras, every HII tier) |
| `field/encodeDustMapPass.ts` | dust-column-map splat pass encoder |
| `field/encodeDustPresentPass.ts` | JWST-view debug presentation |
| `field/buildFieldHeaderInputs.ts` | assembles per-frame FieldHeaderInputs from camera+render+model |
| `field/deriveDustHeaderLanes.ts`, `dustSliceEdges.ts` | dust-slice header lanes |
| `field/packBubbleInstances.ts` | SF-event bubble-view instances |
| `field/findHiiSegment.ts` | tier span lookup in packed HII buffer |
| `field/createArmRidgeDebugSample.ts` | numeric-validation exception |
| `model/createGalaxyModel.ts` | "what a galaxy IS" — owns both mixtures, dust cloud, ISM map, GPU record buffers; drives v1 and v2 |
| `ismMap/createIsmMapGenerator.ts` | fluid ISM-map generator dispatcher |
| `ismMap/createIsmMapFluidRunner.ts` | the fluid solver |
| `ismMap/createIsmMapOrientation.ts` | orientation-field chain |
| `ismMap/createIsmMapRingReduce.ts` | GPU ring-mean reduction |
| `ismMap/createIsmMapDustCdfScan.ts` | GPU prefix-sum CDF scan (dust + DIG veil) |
| `ismMap/createIsmMapPlace{Dust,ArmCloud,ArmSpurCloud,DigVeil}.ts` | GPU placement dispatch hosts |
| `ismMap/createIsmMapReadbacks.ts` + orientation diagnostics | dev-only readback/diagnostics — likely not needed app-side |
| `ismMap/pack*.ts` | uniform packers for dispatch hosts |
| `ismMap/computePlaceDustBudget.ts`, `computeDigVeilBudget.ts`, `buildDigArmEnvelopeTable.ts` | CPU budget/table derivation |
| `gpu/createGalaxyRenderTargets.ts` | all offscreens for BOTH tiers — app's renderTargets.ts needs field/dustMap/hii(+tiers)/dustView rows |
| `gpu/bakeVolumeTexture.ts` | once-baked 3D noise-volume factory |
| `gpu/createGrowOnlyRecordBuffer.ts` | grow-only GPU storage buffer for comps arrays |
| `gpu/createReadbackQueue.ts`, `readTextureChannelSum.ts` | debug-only readback |
| `frame/deriveFrameView.ts` | per-frame pure view/fade/debugViews derivation; app's ReadyFrameContext is the rough analog without field/debug-view concerns |
| `passes/beginClearPass.ts`, `encodePresentOverlay.ts`, `encodeSceneComposites.ts` | pass-encoding vocabulary; app equivalents (executeFrame.ts) would grow field/HII cases |
| `post/encodeBloomPyramid.ts` | hand-mirrors app's runBloom — manually-kept-in-sync duplicate |
| `probe/*` | headless readback for auto-fit matcher — tool-only |
| `timing/*` | tool frame-median + GPU-timing windows; app TIMED_SLOTS needs field/dustMap/hii:* rows mirroring timingSlots.ts:12-65 |
| `data/hiiTiers.ts`, `defaultRenderSettings.ts`, `defaultLodSettings.ts` | tool-only settings shape; app MilkyWaySettings carries only v1 knobs |

## 4. App settings referencing the field

`settings.milkyWay.renderer` and `settings.milkyWay.field` (§2). Written before the landing, when the app had none.

## Summary
1. Shaders + pure data builders already unified in `src/`; the tool consumes them via symlink.
2. The entire gap is the TS orchestration layer: pipelines, uniform packing, target allocation, per-frame encode, ISM-map dispatch hosts.
3. App MW path is 100% v1 sprites across three layers gated by one shared alpha derivation.
4. No frameProgram step/target exists for field/dustMap/hii.
5. No app settings surface references v2 at all.
6. `milkyWayCalibration.ts` placement/LOD constants are flagged for promotion (shared), not deletion.
7. Docs to read before scoping: `docs/research/milky-way/` (analytic-field.md, decisions.md, dust.md, hii-regions.md), the completed unbraid plan, `tools/galaxy-renderer/src/engine/README.md` v1-deletion map.
