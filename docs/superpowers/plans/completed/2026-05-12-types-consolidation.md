# Types Consolidation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each PR is one task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move every module-scope `export type` alias in `src/` (with the carve-outs below) into `src/@types/`, organized into domain subfolders. One file, one type. No barrel. No path alias. All imports are deep + relative. Delete the root `src/@types/index.d.ts` at the end. Spec: `docs/superpowers/specs/2026-05-12-types-consolidation-design.md`.

**Architecture:** Mechanical refactor. For each type:
1. Create `src/@types/<domain>/<TypeName>.d.ts` with the type declaration verbatim (preserve explanatory comments).
2. Delete the original `export type X = …` from the source `.ts`/`.tsx`.
3. Add `import type { X } from '<relative>/@types/<domain>/X';` to every consumer (including the source file itself if it still references X for a runtime annotation).
4. Run `npm run typecheck` + `npm test`. Both must stay green.

**Tech Stack:** TypeScript only — no runtime/build changes. `.d.ts` files cost nothing at runtime. Vite already resolves `.d.ts` via TS's normal resolution; no tsconfig edits required.

**Carve-outs (these stay put):**
- Component prop types named `{ComponentName}Props` — stay in the component's `.tsx`.
- A type declared in a `.tsx` whose **only** consumers live in the same component folder — stays put. The moment a consumer outside that folder imports it, it moves.
- File-local types (no `export` keyword) — stay put.
- `src/@types/wesl.d.ts` — ambient module declaration, not a domain type. Stays at root.

**Existing `src/@types/` files (41 today, some multi-type):** Many already conform but a few hold multiple `export type` declarations and must be **split** so the destination is one-file-one-type. These splits happen in their owning domain PR (mostly PR 7).

**Survey result:** 176 module-scope `export type` declarations exist outside `src/@types/`, plus ~50 inside it (a few files declare two or three types). After the migration the directory holds **~165 files**, one type each. Each PR below enumerates the exact moves.

**Naming collisions caught during survey** (must be resolved before moving — flagged in their owning PRs):
- `PickSourceDraw` — declared in BOTH `src/services/gpu/renderers/pickRenderer.ts` (line 90) AND `src/services/engine/interaction/clickHandler.ts` (line 83). They are structurally compatible but live in different layers; the clickHandler one is the consumer (subset of the renderer one). PR 5 (rendering) ships `@types/rendering/PickSourceDraw.d.ts` as the renderer's shape; PR 8 (engine) deletes the clickHandler duplicate and re-imports from `@types/rendering/PickSourceDraw`.
- `EngineSettingsState` — exists in BOTH `src/@types/EngineSettingsState.d.ts` AND `src/hooks/useEngineSettings.ts` (the hook's React-side projection, structurally different but same name). PR 6 (settings) renames the hook's local type to `UseEngineSettingsState` to break the collision, then proceeds.
- `Label` (`src/services/gpu/renderers/labelRenderer.ts`) and `MarkerLine` (`src/services/gpu/renderers/markerLineRenderer.ts`) — generic names. PR 5 moves both into `@types/rendering/` under their existing names — no other producers of those names exist, so no rename needed; just be alert during the move.
- `Pass` — narrow exported re-export in `src/services/engine/frame/passes/index.ts` (line 90) is `export type { Pass, PassDeps } from './types'`. PR 8 deletes that re-export line; consumers import from `@types/engine/frame/Pass` directly.
- `Snapshot` (`src/services/engine/wiring/seedSettingsCallbacks.ts`) — too-generic name. PR 8 renames it to `SettingsCallbackSeed` on move (matches the spec's filename `SettingsCallbackSeed.d.ts` in the wiring/ subfolder).

**Decision points flagged for the implementer:**
- **DP-1 (PR 1):** The existing `src/@types/Vec.d.ts` declares `Vec2`, `Vec3`, `Vec4` in one file (so does `Mat.d.ts` with `Mat3`, `Mat4`). The spec says one-type-per-file. **Decision:** split them. Each PR's first task does the split before adding new files.
- **DP-2 (PR 2):** `LoadProgressState` currently lives inside `src/@types/EngineCallbacks.d.ts`. It's a loading-domain type that leaked into the engine-callbacks file because it's an argument to a callback. **Decision:** move it to `@types/loading/LoadProgressState.d.ts` in PR 2; `EngineCallbacks.d.ts` imports it.
- **DP-3 (PR 7):** `Selection` (currently inside `EnginePickingState.d.ts`), `EngineAssetSlots` (inside `EngineState.d.ts`), `VolumeFieldSettings` (inside `EngineSettingsState.d.ts`) all violate one-type-per-file. **Decision:** PR 7 splits these into their own files.
- **DP-4 (PR 1):** `ScalarCube.d.ts` holds three types: `ScalarFieldFrameKind`, `ScalarFieldPaletteId`, `ScalarCube`. Split during PR 1.
- **DP-5 (PR 5):** `instancedQuadRenderer.ts` exports five small types (`BlendMode`, `CapacityStrategy`, `AtlasConfig`, `InstancedQuadConfig`, `InstancedQuadRenderer`). Each gets its own file in `@types/rendering/`.

---

## File Structure

**Create (subfolders, exact list):**

```
src/@types/
  data/
  loading/
  camera/
  input/
  rendering/
  settings/
  engine/
    state/
    handles/
    frame/
    subsystems/
    wiring/
  math/
```

**Delete (final PR):** `src/@types/index.d.ts`

---

## Task 1: `math/` + `data/` foundation

**PR title:** `refactor(types): consolidate math + data types into @types/{math,data}`

**Scope:** Smallest, most-imported types. Validates the deep-import workflow.

### Splits from existing `src/@types/`

- [ ] **Step 1.1 — Split `Vec.d.ts`:** create `src/@types/math/Vec2.d.ts`, `Vec3.d.ts`, `Vec4.d.ts`, each containing one type. Delete the old `src/@types/Vec.d.ts`. (Keep the file-header docblock — move it onto whichever destination file makes most sense, or split it across the three.)
- [ ] **Step 1.2 — Split `Mat.d.ts`:** create `src/@types/math/Mat3.d.ts` and `Mat4.d.ts`. Delete `src/@types/Mat.d.ts`.
- [ ] **Step 1.3 — Rewrite all consumers** of `Vec2`/`Vec3`/`Vec4`/`Mat3`/`Mat4`. Existing barrel imports `from '../@types'` or `from '../../@types'` or `from '../../../@types'` get converted to deep imports `from '<rel>/@types/math/Vec3'`. Sites (deduplicated):
  - `src/data/superGalacticTransform.ts` — `Mat3, Mat4, Vec3, Vec4`
  - `src/services/gpu/renderers/diskRenderer.ts` — `Vec3`
  - `src/services/gpu/renderers/markerLineRenderer.ts` — `Vec3, Vec4`
  - `src/services/gpu/renderers/labelRenderer.ts` — `Vec3, Vec4`
  - `src/services/gpu/renderers/thumbnailRenderer.ts` — `Vec3`
  - `src/services/gpu/renderers/instancedQuadRenderer.ts` — `Vec3`
  - `src/services/gpu/renderers/proceduralDiskRenderer.ts` — `Vec3`
  - `src/services/gpu/renderers/scalarVolumeRenderer.ts` — `Vec2, Vec3`
  - `src/services/gpu/renderers/pointRenderer.ts` — `Vec3`
  - `src/services/gpu/resources/textureAtlas.ts` — `Vec4`
  - `src/services/engine/subsystems/thumbnailSubsystem.ts` — `Vec3`
  - `src/services/engine/frame/frameContext.ts` — `Vec3`
  - …plus any internal `src/@types/*.d.ts` that imports Vec/Mat (e.g., `OrbitCamera.d.ts`, `ScalarCube.d.ts`).
- [ ] **Step 1.4 — `npm run typecheck` → must pass.**
- [ ] **Step 1.5 — `npm test` → 590+ tests pass.**

### Move from `src/data/` and `src/utils/math/` and `src/services/biasCorrection/`

For each move below, the format is `source:line → dest`. The dest is always `src/@types/<domain>/<TypeName>.d.ts`. Carry the explanatory comments above the declaration verbatim.

- [ ] **Step 1.6 — `data/` core data shapes:**
  - `src/data/biasMode.ts:75 → @types/data/BiasMode.d.ts`
    - Note: the type uses `(typeof BiasMode)[keyof typeof BiasMode]` referencing the runtime const. Keep the type referencing the runtime const via `import type { BiasMode as BiasModeConst } from '../../data/biasMode'` — or, simpler: declare it as the literal union `'off' | 'schechter' | …` once you read the const out and inline it. **Decision DP-1a:** inline the literals to keep `.d.ts` free of value imports.
  - `src/data/catalogSource.ts:28 → @types/data/CatalogSource.d.ts`
  - `src/data/clusterAnchors.ts:39 → @types/data/SkyCoord.d.ts`
  - `src/data/clusterAnchors.ts:46 → @types/data/ClusterAnchor.d.ts` (imports `SkyCoord`, `Vec3`)
  - `src/data/colourIndex.ts:18 → @types/data/ColourIndexSpec.d.ts`
  - `src/data/galaxyCatalogTransfer.ts:41 → @types/data/ClonedGalaxyCatalog.d.ts`
  - `src/data/sources.ts:209 → @types/data/BandLabels.d.ts`
  - `src/data/surveyFluxLimits.ts:31 → @types/data/SchechterTriple.d.ts`
  - `src/data/syntheticScalarField.ts:32 → @types/data/SyntheticGaussianOptions.d.ts`
  - `src/data/syntheticScalarField.ts:83 → @types/data/CartesianGridOptions.d.ts`
  - `src/data/syntheticScalarField.ts:172 → @types/data/SphericalGridOptions.d.ts`
  - `src/data/toneMapCurve.ts:44 → @types/data/ToneMapCurve.d.ts` (same inline-literals decision as `BiasMode`)
  - `src/data/volumeFieldDefaults.ts:40 → @types/data/VolumeFieldDefaults.d.ts`
- [ ] **Step 1.7 — `data/` types already in `@types/` but multi-type — split:**
  - Split `src/@types/ScalarCube.d.ts` into:
    - `@types/data/ScalarFieldFrameKind.d.ts` (line 18)
    - `@types/data/ScalarFieldPaletteId.d.ts` (line 20)
    - `@types/data/ScalarCube.d.ts` (line 36)
  - Move `src/@types/GalaxyCatalog.d.ts` → `@types/data/GalaxyCatalog.d.ts`.
  - Move `src/@types/FilamentCloud.d.ts` → `@types/data/FilamentCloud.d.ts`.
  - Move `src/@types/Tier.d.ts` → `@types/data/Tier.d.ts`.
  - Move `src/@types/LodMode.d.ts` → `@types/data/LodMode.d.ts`.
  - Move `src/@types/GalaxyTypeInfo.d.ts` → `@types/data/GalaxyTypeInfo.d.ts`.
- [ ] **Step 1.8 — `math/` types from `src/utils/math/`:**
  - `src/utils/math/galaxyType.ts:24 → @types/data/GalaxyTypeMags.d.ts` (it's a galaxy-photometry shape, belongs in `data/` per consumer rule)
  - `src/utils/math/schechterDensity.ts:27 → @types/math/SchechterInput.d.ts`
  - `src/utils/math/vMaxWeight.ts:32 → @types/math/VMaxWeightInput.d.ts`
- [ ] **Step 1.9 — `math/` bias-correction shape:**
  - `src/services/biasCorrection/surveyConstants.ts:55 → @types/math/SurveyConstants.d.ts`

### Per-move mechanics (apply to every type in Steps 1.6–1.9)

For each `source:line → dest`:
- [ ] Create `dest` containing the type declaration verbatim (with its leading comment).
- [ ] Delete the `export type X = …` block from the source file. If the source file ends up with **no remaining exports** and was type-only, delete it.
- [ ] In the source file itself, if any runtime code references `X`, add `import type { X } from '<rel>/@types/<domain>/X';` at the top.
- [ ] Run `grep -rn "from ['\"].*<source-without-ext>['\"]" src tests --include="*.ts" --include="*.tsx"` to find every import site of the old location for `X`. Edit each: replace the type from the named import list, add a deep-import line. **Bare runtime imports of values from the same file stay untouched.**
- [ ] After each batch of ~5 moves, run `npm run typecheck`.

### Consumer-site rewrites to apply in this PR (specific files that import data/math types today)

Run `grep -rE "from ['\"].*(@types|data/(biasMode|catalogSource|colourIndex|sources|toneMapCurve|volumeFieldDefaults|surveyFluxLimits|clusterAnchors|galaxyCatalogTransfer|syntheticScalarField)|utils/math/(galaxyType|schechterDensity|vMaxWeight)|biasCorrection/surveyConstants)['\"]" src tests --include="*.ts" --include="*.tsx"` and update each line. Notable consumer files (non-exhaustive, but the ones grep flagged during planning):

- `src/data/sources.ts` re-imports `BandLabels` from `@types/data/BandLabels`.
- `src/data/synthetic.ts` — `GalaxyCatalog` from `@types/data/GalaxyCatalog`.
- `src/data/galaxyCatalogFormat.ts` — `GalaxyCatalog` from `@types/data/GalaxyCatalog`.
- `src/services/loading/fetchers/galaxyCatalogFetcher.ts` — `GalaxyCatalog`, `Tier`.
- `src/services/loading/fetchers/syntheticPointFetcher.ts` — `GalaxyCatalog`.
- `src/services/loading/fetchers/filamentFetcher.ts` — `Tier`.
- `src/services/loading/fetchers/mcpmFetcher.ts` — `Tier`.
- `src/services/engine/bake/buildPointInterleavedBuffer.ts`, `computeAngularWeights.ts`, `computeSchechterRatios.ts` — `GalaxyCatalog`.
- `src/services/engine/camera/resolveFocusTarget.ts` — `GalaxyCatalog`.
- `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts` — `GalaxyCatalog`.
- `src/services/engine/subsystems/{biasCorrectionSubsystem,selectionSubsystem,thumbnailSubsystem}.ts` — `GalaxyCatalog`.
- `src/services/engine/frame/passes/types.ts` and `renderFrame.ts` — `GalaxyCatalog`.
- `src/services/engine/interaction/clickHandler.ts` — `GalaxyCatalog`.
- `src/services/engine/helpers/galaxyInfoBuilder.ts` — `GalaxyCatalog`.
- `src/components/SettingsPanel/SettingsPanel.tsx` — `ToneMapCurve`, `VolumeFieldDefaults` (used via runtime imports today; only the type half rewires).
- `src/utils/math/galaxyTypeFrom{Color,JminusK,BminusJ}.ts` — `GalaxyTypeInfo`.
- All `tests/` files in the import list at the top of this plan that name a moved type.

### Verification

- [ ] **Step 1.10 — `npm run typecheck`** → expected: zero errors.
- [ ] **Step 1.11 — `npm test`** → expected: 590+ pass, zero fail.
- [ ] **Step 1.12 — Stage and commit** using the user's git identity (no `--author=` flag). Commit message uses HEREDOC with the `Co-Authored-By` trailer in the body. Subject: `refactor(types): consolidate math + data types into @types/{math,data}`.
- [ ] **Step 1.13 — Push branch and `gh pr create`.** PR title same as commit subject.

---

## Task 2: `loading/`

**PR title:** `refactor(types): consolidate loading types into @types/loading`

**Scope:** Well-isolated subsystem; all sources live in `src/services/loading/`.

### Moves

- [ ] **Step 2.1 — `src/services/loading/types.ts`** (this whole file is types — delete it at the end):
  - line 26 `LoadState<T>` → `@types/loading/LoadState.d.ts`
  - line 42 `Fetcher<T, Req>` → `@types/loading/Fetcher.d.ts`
  - line 57 `Committer<T>` → `@types/loading/Committer.d.ts`
  - line 67 `RetryDecision` → `@types/loading/RetryDecision.d.ts`
  - line 68 `RetryPolicy` → `@types/loading/RetryPolicy.d.ts` (imports `RetryDecision`)
  - line 80 `LoadEvent` → `@types/loading/LoadEvent.d.ts`
  - line 93 `AssetSlot<T, Req>` → `@types/loading/AssetSlot.d.ts`
- [ ] **Step 2.2 — `src/services/loading/AssetSlot.ts`:**
  - line 71 `CreateAssetSlotArgs<T, Req>` → `@types/loading/CreateAssetSlotArgs.d.ts`
  - The `export type { AssetSlot };` on line 69 is a re-export — delete it (consumers now import directly from `@types/loading/AssetSlot`).
- [ ] **Step 2.3 — `src/services/loading/slots/types.ts`:**
  - line 34 `SlotFactory<TPayload, TRequest>` → `@types/loading/SlotFactory.d.ts`. After move, this file is type-only — delete it.
- [ ] **Step 2.4 — `src/services/loading/aggregateRegistry.ts`:**
  - line 23 `RegistrySnapshot` → `@types/loading/RegistrySnapshot.d.ts`
- [ ] **Step 2.5 — Per-fetcher request shapes:**
  - `fetchers/famousMetaFetcher.ts:32 → @types/loading/FamousMetaEntry.d.ts`
  - `fetchers/famousMetaFetcher.ts:59 → @types/loading/FamousXref.d.ts`
  - `fetchers/famousMetaFetcher.ts:66 → @types/loading/FamousXrefMap.d.ts`
  - `fetchers/famousMetaFetcher.ts:69 → @types/loading/FamousPayload.d.ts`
  - `fetchers/filamentFetcher.ts:33 → @types/loading/FilamentReq.d.ts`
  - `fetchers/mcpmFetcher.ts:23 → @types/loading/MCPMReq.d.ts`
  - `fetchers/pgcAliasFetcher.ts:36 → @types/loading/PgcAliasJsonShape.d.ts`
  - `fetchers/pgcAliasFetcher.ts:39 → @types/loading/PgcAliasMap.d.ts`
  - `fetchers/galaxyCatalogFetcher.ts:50 → @types/loading/GalaxyCatalogReq.d.ts`
  - `fetchers/syntheticVolumeFetcher.ts:44 → @types/loading/SyntheticVolumeShape.d.ts`
  - `fetchers/syntheticVolumeFetcher.ts:56 → @types/loading/SyntheticVolumeReq.d.ts`
- [ ] **Step 2.6 — `LoadProgressState` (DP-2):** currently inside `src/@types/EngineCallbacks.d.ts` at line 241. **Move it** to `@types/loading/LoadProgressState.d.ts` and have `EngineCallbacks.d.ts` import it.
- [ ] **Step 2.7 — `LoadProgressEmitter`** in `src/services/engine/subsystems/loadProgressAggregator.ts:58` → `@types/loading/LoadProgressEmitter.d.ts`. (Although the file lives in `engine/subsystems/`, the type describes loading progress and is consumer-shared with `EngineSubsystemHandles`. Consumer rule: place it in `loading/`.)

### Consumer rewrites in this PR

- `src/services/loading/AssetSlot.ts` — imports its own `AssetSlot` back from `@types/loading/AssetSlot`.
- All slot factory files (`src/services/loading/slots/*.ts`) — re-import `LoadState`, `Fetcher`, etc.
- `src/services/loading/registerAssetSlot.ts` / wherever `createAssetSlot` is referenced.
- `src/components/LoadingBar/LoadingBar.tsx` — `LoadProgressState` (currently imports from `@types/EngineCallbacks` — rewrite to `@types/loading/LoadProgressState`).
- `src/components/LoadingDevPanel/LoadingDevPanel.tsx` — same.
- `src/hooks/useEngine.ts` — `LoadProgressState`.
- `src/services/engine/subsystems/loadProgressAggregator.ts` — `LoadProgressState`.
- `src/@types/EngineCallbacks.d.ts` — `LoadProgressState` now imported from `@types/loading/LoadProgressState`.
- `src/@types/EngineSubsystemHandles.d.ts` — `LoadProgressEmitter` now imported from `@types/loading/LoadProgressEmitter`.
- Test files: `tests/services/loading/*.test.ts` (multiple) re-import from `@types/loading/`.

### Verification

- [ ] **Step 2.8 — `npm run typecheck`** → zero errors.
- [ ] **Step 2.9 — `npm test`** → all pass.
- [ ] **Step 2.10 — Commit + push + `gh pr create`** (subject `refactor(types): consolidate loading types into @types/loading`).

---

## Task 3: `camera/`

**PR title:** `refactor(types): consolidate camera types into @types/camera`

**Scope:** Small. Most already live in `src/@types/` at the root; this PR relocates them into the `camera/` subfolder and pulls in the few stragglers from `src/services/camera/`.

### Moves

- [ ] **Step 3.1 — Relocate existing `@types/` files into `camera/`:**
  - `src/@types/OrbitCamera.d.ts → src/@types/camera/OrbitCamera.d.ts`
  - `src/@types/OrbitCameraInit.d.ts → src/@types/camera/OrbitCameraInit.d.ts`
- [ ] **Step 3.2 — `src/services/camera/cameraTween.ts:53` → `@types/camera/CameraTween.d.ts`**
- [ ] **Step 3.3 — `src/services/camera/orbitControls.ts:54` → `@types/camera/OrbitControlsOptions.d.ts`**
- [ ] **Step 3.4 — `src/services/url/focusUrl.ts:53` → `@types/camera/FocusTarget.d.ts`** (consumer rule: it's a camera-target shape, consumed by `resolveFocusTarget` and `useFocusUrlSync`).
- [ ] **Step 3.5 — `src/services/engine/camera/cameraFraming.ts:58` → `@types/camera/InitialCam.d.ts`**
- [ ] **Step 3.6 — `src/services/engine/camera/resolveFocusTarget.ts:71` → `@types/camera/ResolverInput.d.ts`**
- [ ] **Step 3.7 — `src/services/engine/camera/resolveFocusTarget.ts:78` → `@types/camera/ResolverOutput.d.ts`**
- [ ] **Step 3.8 — `src/services/engine/camera/tweenManager.ts:49` → `@types/camera/TweenManager.d.ts`**
- [ ] **Step 3.9 — `src/services/engine/camera/tweenToGalaxy.ts:86` → `@types/camera/TweenTarget.d.ts`**
- [ ] **Step 3.10 — `src/services/engine/helpers/scaleBar.ts:73` → `@types/camera/ScaleBarCamera.d.ts`** (this is a structural minimum camera shape; belongs in camera/)

### Consumer rewrites

- `src/services/camera/orbitCamera.ts`, `cameraTween.ts`, `orbitControls.ts` — re-import their own types.
- `src/services/input/spaceMouseToCamera.ts` — `OrbitCamera`.
- `src/services/engine/camera/tweenManager.ts` — `CameraTween`, plus its own `TweenManager`.
- `src/services/engine/camera/cameraSnapshot.ts` — `InitialCam`.
- `src/@types/EngineState.d.ts` — `InitialCam` import path moves from `../services/engine/camera/cameraFraming` to `./camera/InitialCam`.
- `src/@types/EngineSubsystemHandles.d.ts` — `TweenManager` path moves to `./camera/TweenManager`.
- `src/hooks/useFocusUrlSync.ts` — `FocusTarget` (currently imported from `resolveFocusTarget` which re-exports it from `focusUrl`).
- `src/services/engine/subsystems/{thumbnailSubsystem,spaceMouseSubsystem,youAreHereSubsystem,labelDirectorSubsystem,renderScheduler,poiSubsystem}.ts` — wherever they import `OrbitCamera`.
- `src/services/engine/frame/frameContext.ts` — `OrbitCamera`.
- `src/services/engine/helpers/{engineReady,logCameraState}.ts` — `OrbitCamera`.
- `tests/services/engine/camera/{tweenToGalaxy,resolveFocusTarget}.test.ts` — re-import types from `@types/camera/`.
- `tests/services/engine/frame/{frameContext,renderFrame}.test.ts` — `OrbitCamera`.

### Verification

- [ ] **Step 3.11 — `npm run typecheck`**, **Step 3.12 — `npm test`**, **Step 3.13 — commit + push + PR.**

---

## Task 4: `input/`

**PR title:** `refactor(types): consolidate input types into @types/input`

**Scope:** Tiny (3 types).

### Moves

- [ ] **Step 4.1 — Relocate** `src/@types/MousePos.d.ts → src/@types/input/MousePos.d.ts`.
- [ ] **Step 4.2 — `src/services/input/spaceMouse.ts:103` → `@types/input/SpaceMouseInputOptions.d.ts`**
- [ ] **Step 4.3 — `src/services/input/spaceMouseAxes.ts:34` → `@types/input/SpaceMouseAxes.d.ts`**
- [ ] **Step 4.4 — `src/services/engine/interaction/inputBindings.ts:69` → `@types/input/InputBindings.d.ts`**
- [ ] **Step 4.5 — `src/services/engine/interaction/inputBindings.ts:86` → `@types/input/CssPx.d.ts`**
- [ ] **Step 4.6 — `src/services/engine/interaction/inputBindings.ts:88` → `@types/input/AttachEngineInputsOptions.d.ts`**
- [ ] **Step 4.7 — `src/services/engine/subsystems/spaceMouseSubsystem.ts:140` → `@types/input/SpaceMouseInputLike.d.ts`**
- [ ] **Step 4.8 — `src/services/engine/subsystems/spaceMouseSubsystem.ts:146` → `@types/input/SpaceMouseInputCtorOptions.d.ts`**
- [ ] **Step 4.9 — `src/services/engine/subsystems/spaceMouseSubsystem.ts:151` → `@types/input/SpaceMouseInputFactory.d.ts`** (imports `SpaceMouseInputLike`, `SpaceMouseInputCtorOptions`)

### Consumer rewrites

- `src/services/input/spaceMouse.ts` re-imports its own type.
- `src/services/input/spaceMouseToCamera.ts` — `SpaceMouseAxes`.
- `src/services/engine/subsystems/spaceMouseSubsystem.ts` — its own three types + `SpaceMouseAxes`.
- `src/services/engine/interaction/inputBindings.ts` — its own three types.
- `src/services/engine/phases/wireInput.ts` — `AttachEngineInputsOptions` if it references it.
- `tests/services/engine/phases/wireInput.test.ts` — likely imports `EngineCallbacks, EngineState`; no input-domain types directly, but check.

### Verification

- [ ] **Step 4.10–4.12** — typecheck, test, commit + push + PR.

---

## Task 5: `rendering/`

**PR title:** `refactor(types): consolidate rendering types into @types/rendering`

**Scope:** Largest single PR. Includes renderer instance shapes, GPU primitives, and the post-process pass shapes. **DP-5 applies (split `instancedQuadRenderer.ts`'s five types).**

### Splits from existing `src/@types/` (relocate into rendering/)

- [ ] **Step 5.1 — Relocate:**
  - `src/@types/GpuContext.d.ts → @types/rendering/GpuContext.d.ts`
  - `src/@types/Renderer.d.ts → @types/rendering/Renderer.d.ts`
  - `src/@types/Destroyable.d.ts → @types/rendering/Destroyable.d.ts`
  - `src/@types/ThumbnailInstance.d.ts → @types/rendering/ThumbnailInstance.d.ts`
  - `src/@types/ProceduralDiskInstance.d.ts → @types/rendering/ProceduralDiskInstance.d.ts`

### Moves from `src/services/gpu/`

- [ ] **Step 5.2 — Renderer handles (one per file, by filename):**
  - `services/gpu/renderers/diskRenderer.ts:50 → @types/rendering/DiskInstance.d.ts`
  - `services/gpu/renderers/diskRenderer.ts:69 → @types/rendering/DiskRenderer.d.ts`
  - `services/gpu/renderers/filamentRenderer.ts:113 → @types/rendering/FilamentRenderer.d.ts`
  - `services/gpu/renderers/labelRenderer.ts:77 → @types/rendering/Label.d.ts`
  - `services/gpu/renderers/labelRenderer.ts:112 → @types/rendering/LabelRenderer.d.ts`
  - `services/gpu/renderers/markerLineRenderer.ts:80 → @types/rendering/MarkerLine.d.ts`
  - `services/gpu/renderers/markerLineRenderer.ts:97 → @types/rendering/MarkerLineRenderer.d.ts`
  - `services/gpu/renderers/milkyWayRenderer.ts:124 → @types/rendering/MilkyWayRenderer.d.ts`
  - `services/gpu/renderers/pickRenderer.ts:90 → @types/rendering/PickSourceDraw.d.ts` (canonical home — see collision note in plan header)
  - `services/gpu/renderers/pickRenderer.ts:112 → @types/rendering/PickRenderer.d.ts`
  - `services/gpu/renderers/pointRenderer.ts:584 → @types/rendering/PointDrawSettings.d.ts`
  - `services/gpu/renderers/pointRenderer.ts:633 → @types/rendering/PointRenderer.d.ts`
  - `services/gpu/renderers/proceduralDiskRenderer.ts:67 → @types/rendering/ProceduralDiskRenderer.d.ts`
  - `services/gpu/renderers/scalarVolumeRenderer.ts:160 → @types/rendering/ScalarFieldHandle.d.ts`
  - `services/gpu/renderers/scalarVolumeRenderer.ts:233 → @types/rendering/ScalarVolumeRenderer.d.ts`
  - `services/gpu/renderers/thumbnailRenderer.ts:80 → @types/rendering/ThumbnailRenderer.d.ts`
- [ ] **Step 5.3 — DP-5: split `instancedQuadRenderer.ts`:**
  - line 136 `BlendMode` → `@types/rendering/BlendMode.d.ts`
  - line 148 `CapacityStrategy` → `@types/rendering/CapacityStrategy.d.ts`
  - line 156 `AtlasConfig` → `@types/rendering/AtlasConfig.d.ts`
  - line 162 `InstancedQuadConfig` → `@types/rendering/InstancedQuadConfig.d.ts` (imports `BlendMode`, `CapacityStrategy`, `AtlasConfig`)
  - line 200 `InstancedQuadRenderer` → `@types/rendering/InstancedQuadRenderer.d.ts`
- [ ] **Step 5.4 — Texture atlas:**
  - `services/gpu/resources/textureAtlas.ts:53 → @types/rendering/AtlasEvictHandler.d.ts`
- [ ] **Step 5.5 — Labels (font/layout):**
  - `services/gpu/labels/fontMetrics.ts:15 → @types/rendering/GlyphMetrics.d.ts`
  - `services/gpu/labels/fontMetrics.ts:26 → @types/rendering/FontMetrics.d.ts`
  - `services/gpu/labels/fontMetrics.ts:35 → @types/rendering/RawBMFont.d.ts`
  - `services/gpu/labels/labelLayout.ts:36 → @types/rendering/GlyphQuad.d.ts`
  - `services/gpu/labels/labelLayout.ts:51 → @types/rendering/LabelAlignX.d.ts`
  - `services/gpu/labels/loadFontAtlas.ts:49 → @types/rendering/LoadedFontAtlas.d.ts`
- [ ] **Step 5.6 — Post-process pass:**
  - `services/gpu/passes/postProcess.ts:111 → @types/rendering/Size.d.ts`
  - `services/gpu/passes/postProcess.ts:175 → @types/rendering/PostProcess.d.ts`

### Consumer rewrites

- Every renderer source file re-imports its own type(s) from `@types/rendering/`.
- `src/services/gpu/device.ts` — `GpuContext`.
- `src/@types/EngineGpuHandles.d.ts` — `Renderer`, `PostProcess`, `Destroyable`, all renderer handle types.
- `src/services/engine/frame/passes/types.ts` — `Renderer`, `Destroyable`, etc.
- `src/services/engine/frame/renderFrame.ts` — likely `Renderer` and `PostProcess`.
- `src/services/engine/subsystems/*.ts` — `Destroyable` (multiple files).
- `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts` — possibly `Destroyable`.
- `tests/services/gpu/renderers/{pointRenderer,instancedQuadRenderer}.test.ts` — `GalaxyCatalog`, `GpuContext`, instance shapes.

### Verification

- [ ] **Step 5.7–5.9** — typecheck, test, commit + push + PR.

---

## Task 6: `settings/`

**PR title:** `refactor(types): consolidate settings types into @types/settings`

**Scope:** Small but cross-cutting. **DP-3 partially applied here:** split `VolumeFieldSettings` out of `EngineSettingsState.d.ts`. **Collision resolution for `EngineSettingsState`** also happens here.

### Moves

- [ ] **Step 6.1 — Rename the React-side `EngineSettingsState` to break the collision:**
  - In `src/hooks/useEngineSettings.ts:67`, rename `export type EngineSettingsState` to `export type UseEngineSettingsState`. Update its self-references at lines 124, 144, and any test sites. (`tests/hooks/useEngineSettings.test.ts` if present, plus any component that destructures `useEngineSettings()`.)
- [ ] **Step 6.2 — Move `UseEngineSettingsState` from `hooks/useEngineSettings.ts` → `@types/settings/UseEngineSettingsState.d.ts`.**
- [ ] **Step 6.3 — Move `EngineSettingsCallbacks` (line 111) → `@types/settings/EngineSettingsCallbacks.d.ts`.**
- [ ] **Step 6.4 — Move `UseEngineSettingsReturn` (line 123) → `@types/settings/UseEngineSettingsReturn.d.ts`** (imports the two above).
- [ ] **Step 6.5 — Split `src/@types/EngineSettingsState.d.ts`:**
  - line 67 `VolumeFieldSettings` → `@types/settings/VolumeFieldSettings.d.ts`
  - line 126 `EngineSettingsState` → `@types/settings/EngineSettingsState.d.ts` (imports `VolumeFieldSettings`)
- [ ] **Step 6.6 — Move `VolumeFieldRowData` (`src/components/SettingsPanel/SettingsPanel.tsx:359`) → `@types/settings/VolumeFieldRowData.d.ts`.**
  - This is a `.tsx` declaration but it's imported by `src/hooks/useEngineSettings.ts` (outside the component folder) — carve-out does NOT apply. Move it.
- [ ] **Step 6.7 — Move `SettingsTableKey` (`src/services/engine/wiring/settingsTable.ts:89`) → `@types/settings/SettingsTableKey.d.ts`.**
  - The file's `SettingsDescriptor` (line 163) is `type` not `export type` — leave it private.

### Consumer rewrites

- `src/hooks/useEngineSettings.ts` — re-imports its three types from `@types/settings/`.
- `src/components/SettingsPanel/SettingsPanel.tsx` — re-imports `VolumeFieldRowData` from `@types/settings/`, `EngineSettingsState` from `@types/settings/`.
- `src/components/SettingsPanel/VolumeFieldRow.tsx` — `VolumeFieldRowData` if it uses it (check; if not, skip).
- `src/services/engine/engine.ts` — `EngineSettingsState`, `SettingsTableKey`.
- `src/services/engine/wiring/settingsTable.ts` — `SettingsTableKey` self-import.
- `src/@types/EngineState.d.ts` — `EngineSettingsState` import path changes from `./EngineSettingsState` to `./settings/EngineSettingsState`.
- `src/@types/EngineCallbacks.d.ts` — likely references types in EngineSettingsState; update path.
- `tests/@types/engineState.test.ts` — `EngineSettingsState`.
- `tests/hooks/useEngineSettings.test.ts` (if exists).

### Verification

- [ ] **Step 6.8–6.10** — typecheck, test, commit + push + PR.

---

## Task 7: `engine/state/` + `engine/handles/` cleanup

**PR title:** `refactor(types): consolidate engine state + handle types into @types/engine`

**Scope:** Mostly **relocation** of existing `src/@types/Engine*.d.ts` files into the proper subfolders. Also applies **DP-3 splits** for `Selection` and `EngineAssetSlots`.

### Splits and relocations

- [ ] **Step 7.1 — Split `src/@types/EnginePickingState.d.ts`:**
  - line 52 `Selection` → `@types/engine/state/Selection.d.ts`
  - line 54 `EnginePickingState` → `@types/engine/state/EnginePickingState.d.ts` (imports `Selection`)
- [ ] **Step 7.2 — Split `src/@types/EngineState.d.ts`:**
  - line 116 `EngineAssetSlots` → `@types/engine/state/EngineAssetSlots.d.ts`
  - line 203 `EngineState` → `@types/engine/state/EngineState.d.ts` (imports `EngineAssetSlots`, the four state sub-bags, `InitialCam` from `@types/camera/`, etc.)
- [ ] **Step 7.3 — Relocate `state` files:**
  - `src/@types/EngineBiasState.d.ts → @types/engine/state/EngineBiasState.d.ts`
  - `src/@types/EngineSourceState.d.ts → @types/engine/state/EngineSourceState.d.ts`
- [ ] **Step 7.4 — Relocate `handles` files:**
  - `src/@types/EngineCameraHandle.d.ts → @types/engine/handles/EngineCameraHandle.d.ts`
  - `src/@types/EnginePointsHandle.d.ts → @types/engine/handles/EnginePointsHandle.d.ts`
  - `src/@types/EngineSourcesHandle.d.ts → @types/engine/handles/EngineSourcesHandle.d.ts`
  - `src/@types/EngineSettingsHandle.d.ts → @types/engine/handles/EngineSettingsHandle.d.ts` (note: this file is named in the spec taxonomy but **does not exist today** — skip if missing, do not create empty)
  - `src/@types/EngineSelectionHandle.d.ts → @types/engine/handles/EngineSelectionHandle.d.ts`
  - `src/@types/EngineThumbnailsHandle.d.ts → @types/engine/handles/EngineThumbnailsHandle.d.ts`
  - `src/@types/EngineFilamentsHandle.d.ts → @types/engine/handles/EngineFilamentsHandle.d.ts`
  - `src/@types/EngineMilkyWayHandle.d.ts → @types/engine/handles/EngineMilkyWayHandle.d.ts`
  - `src/@types/EngineTonemapHandle.d.ts → @types/engine/handles/EngineTonemapHandle.d.ts`
  - `src/@types/EngineVolumesHandle.d.ts → @types/engine/handles/EngineVolumesHandle.d.ts`
  - `src/@types/EngineBiasHandle.d.ts → @types/engine/handles/EngineBiasHandle.d.ts`
  - `src/@types/EngineInputHandle.d.ts → @types/engine/handles/EngineInputHandle.d.ts`
  - `src/@types/EngineSpaceMouseHandle.d.ts → @types/engine/handles/EngineSpaceMouseHandle.d.ts`
  - `src/@types/EngineGpuHandles.d.ts → @types/engine/handles/EngineGpuHandles.d.ts`
  - `src/@types/EngineSubsystemHandles.d.ts → @types/engine/handles/EngineSubsystemHandles.d.ts`
- [ ] **Step 7.5 — Relocate top-level engine types:**
  - `src/@types/EngineHandle.d.ts → @types/engine/EngineHandle.d.ts`
  - `src/@types/EngineStatus.d.ts → @types/engine/EngineStatus.d.ts`
  - `src/@types/EngineCallbacks.d.ts → @types/engine/EngineCallbacks.d.ts`
- [ ] **Step 7.6 — Relocate `GalaxyInfo` and `ScaleInfo`:**
  - `src/@types/GalaxyInfo.d.ts → @types/engine/GalaxyInfo.d.ts` (consumer rule: it's the public selection shape, engine-output)
  - `src/@types/ScaleInfo.d.ts → @types/engine/ScaleInfo.d.ts`
- [ ] **Step 7.7 — Internal `@types/` cross-imports:** every relocated file references siblings via `./`. After moving, fix all such imports:
  - `EngineState.d.ts` imports `EngineSettingsState`, `EngineBiasState`, `EngineSourceState`, `EnginePickingState`, `EngineAssetSlots`, plus `OrbitCamera`, `InitialCam`, `EngineGpuHandles`, `EngineSubsystemHandles`. After move, the new paths are e.g. `./EngineBiasState`, `../handles/EngineGpuHandles`, `../../camera/OrbitCamera`.
  - `EngineSubsystemHandles.d.ts` imports `TweenManager`, `PoiSubsystem`, `LoadProgressEmitter`, etc. — update to `../../camera/TweenManager`, `../subsystems/PoiSubsystem` (PR 8), `../../loading/LoadProgressEmitter`.
  - `EngineCallbacks.d.ts` imports `LoadProgressState` from `../loading/LoadProgressState`.
  - Run `grep -rn "^import type" src/@types/engine/` after the move to verify every path resolves.

### Consumer rewrites (entire app)

This is the broadest rewrite. Run for each relocated type:

```
grep -rEn "from ['\"].*@types/(EngineHandle|EngineState|EngineCallbacks|EngineStatus|GalaxyInfo|ScaleInfo|Engine[A-Z][A-Za-z]*Handle|Engine[A-Z][A-Za-z]*State|EngineGpuHandles|EngineSubsystemHandles)['\"]" src tests --include="*.ts" --include="*.tsx"
```

For each hit, replace `@types/<TypeName>` with `@types/engine/<TypeName>` (or `@types/engine/state/<TypeName>` / `@types/engine/handles/<TypeName>` per the relocations above).

Hot import sites the survey caught (non-exhaustive):

- `src/services/engine/engine.ts`
- `src/services/engine/phases/{bootstrap,initGpu,wireSlots,wireInput,startLoop}.ts`
- `src/services/engine/frame/{frameContext,renderFrame,runFrame}.ts`
- `src/services/engine/frame/passes/types.ts`
- `src/services/engine/wiring/{galaxyCatalogSourceRegistry,seedSettingsCallbacks,settingsTable}.ts`
- `src/services/engine/subsystems/*.ts` (all of them)
- `src/services/engine/interaction/clickHandler.ts`
- `src/services/engine/helpers/{commitFocus,engineReady,scaleBar,galaxyInfoBuilder}.ts`
- `src/services/engine/camera/{tweenManager,tweenToGalaxy,cameraSnapshot,resolveFocusTarget}.ts`
- `src/services/loading/slots/types.ts`, `slots/syntheticVolumeSlots.ts`, etc. (`EngineState`, `EngineCallbacks`)
- `src/services/url/focusUrl.ts` (`GalaxyInfo`)
- `src/hooks/{useEngine,useFocusUrlSync,useAliasIndex,useKeyboardShortcuts,buildAliasIndex}.ts`
- `src/components/InfoCard/{InfoCard,CompactCard,FullCard}.tsx` (`GalaxyInfo`)
- `src/components/StatusBar/StatusBar.tsx` (`EngineStatus`)
- `src/components/ScaleBar/ScaleBar.tsx` (`ScaleInfo`)
- `src/components/LoadingBar/LoadingBar.tsx`, `LoadingDevPanel/LoadingDevPanel.tsx`
- All `tests/services/engine/**.test.ts` (~20 files)
- `tests/@types/engineState.test.ts`
- `tests/hooks/buildAliasIndex.test.ts`, `useFocusUrlSync.test.ts`
- `tests/services/url/focusUrl.test.ts`

### Verification

- [ ] **Step 7.8 — `npm run typecheck`** → zero errors.
- [ ] **Step 7.9 — `npm test`** → all pass.
- [ ] **Step 7.10 — Spot check:** `git grep "from ['\"].*@types/Engine[A-Z]" src tests` — should return zero matches (every engine-prefixed import is now under `@types/engine/...`).
- [ ] **Step 7.11 — Commit + push + PR.**

---

## Task 8: `engine/frame/` + `engine/subsystems/` + `engine/wiring/`, delete root barrel

**PR title:** `refactor(types): consolidate engine internals into @types/engine/{frame,subsystems,wiring} and delete root barrel`

**Scope:** Remaining engine-internal types, plus the **final cleanup** that deletes `src/@types/index.d.ts`.

### Moves into `engine/frame/`

- [ ] **Step 8.1 — `src/services/engine/frame/frameContext.ts`:**
  - line 110 `NotReadyFrameContext` → `@types/engine/frame/NotReadyFrameContext.d.ts`
  - line 113 `ReadyFrameContext` → `@types/engine/frame/ReadyFrameContext.d.ts`
  - line 137 `FrameContext` → `@types/engine/frame/FrameContext.d.ts` (imports both above)
- [ ] **Step 8.2 — `src/services/engine/frame/passes/types.ts`:**
  - line 87 `PassDeps` → `@types/engine/frame/PassDeps.d.ts`
  - line 148 `Pass` → `@types/engine/frame/Pass.d.ts` (imports `PassDeps`)
- [ ] **Step 8.3 — `src/services/engine/frame/passes/index.ts:90`:** the `export type { Pass, PassDeps } from './types'` re-export — **delete** the line; consumers import directly from `@types/engine/frame/`.
- [ ] **Step 8.4 — `src/services/engine/frame/renderFrame.ts`:**
  - line 91 `RenderFrameSettings` → `@types/engine/frame/RenderFrameSettings.d.ts`
  - line 187 `RenderFrameInput` → `@types/engine/frame/RenderFrameInput.d.ts`
- [ ] **Step 8.5 — `src/services/engine/frame/runFrame.ts:97`** `RunFrameDeps` → `@types/engine/frame/RunFrameDeps.d.ts`

### Moves into `engine/subsystems/`

- [ ] **Step 8.6 — `src/services/engine/subsystems/biasCorrectionSubsystem.ts`:**
  - line 114 `SchechterRunner` → `@types/engine/subsystems/SchechterRunner.d.ts`
  - line 117 `AngularRunner` → `@types/engine/subsystems/AngularRunner.d.ts`
  - line 119 `BiasCorrectionDeps` → `@types/engine/subsystems/BiasCorrectionDeps.d.ts`
  - line 150 `BiasCorrectionSubsystem` → `@types/engine/subsystems/BiasCorrectionSubsystem.d.ts`
- [ ] **Step 8.7 — `src/services/engine/subsystems/fpsCounter.ts:33`** `FpsCounter` → `@types/engine/subsystems/FpsCounter.d.ts`
- [ ] **Step 8.8 — `src/services/engine/subsystems/labelDirectorSubsystem.ts:41`** `LabelDirectorSubsystem` → `@types/engine/subsystems/LabelDirectorSubsystem.d.ts`
- [ ] **Step 8.9 — `src/services/engine/subsystems/labelProducer.ts`:**
  - line 37 `LabelProducerOutput` → `@types/engine/subsystems/LabelProducerOutput.d.ts`
  - line 50 `LabelProducer` → `@types/engine/subsystems/LabelProducer.d.ts` (imports `LabelProducerOutput`)
- [ ] **Step 8.10 — `src/services/engine/subsystems/poiSubsystem.ts`:**
  - line 41 `PoiCategory` → `@types/engine/subsystems/PoiCategory.d.ts`
  - line 43 `PointOfInterest` → `@types/engine/subsystems/PointOfInterest.d.ts`
  - line 52 `PoiSubsystem` → `@types/engine/subsystems/PoiSubsystem.d.ts`
- [ ] **Step 8.11 — `src/services/engine/subsystems/renderScheduler.ts`:**
  - line 51 `RenderSchedulerOptions` → `@types/engine/subsystems/RenderSchedulerOptions.d.ts`
  - line 66 `RenderScheduler` → `@types/engine/subsystems/RenderScheduler.d.ts`
- [ ] **Step 8.12 — `src/services/engine/subsystems/selectionSubsystem.ts`:**
  - line 104 `SelectionInput` → `@types/engine/subsystems/SelectionInput.d.ts`
  - line 109 `SelectionSubsystem` → `@types/engine/subsystems/SelectionSubsystem.d.ts`
  - line 141 `CreateSelectionSubsystemInput` → `@types/engine/subsystems/CreateSelectionSubsystemInput.d.ts`
- [ ] **Step 8.13 — `src/services/engine/subsystems/spaceMouseSubsystem.ts`:**
  - line 104 `SpaceMouseSubsystem` → `@types/engine/subsystems/SpaceMouseSubsystem.d.ts`
  - line 153 `CreateSpaceMouseSubsystemInput` → `@types/engine/subsystems/CreateSpaceMouseSubsystemInput.d.ts`
- [ ] **Step 8.14 — `src/services/engine/subsystems/thumbnailSubsystem.ts`:**
  - line 252 `CreateThumbnailSubsystemInput` → `@types/engine/subsystems/CreateThumbnailSubsystemInput.d.ts`
  - line 300 `ThumbnailFrameInput` → `@types/engine/subsystems/ThumbnailFrameInput.d.ts`
  - line 329 `ThumbnailSubsystem` → `@types/engine/subsystems/ThumbnailSubsystem.d.ts`
- [ ] **Step 8.15 — `src/services/engine/subsystems/youAreHereSubsystem.ts:53`** `YouAreHereSubsystem` → `@types/engine/subsystems/YouAreHereSubsystem.d.ts`

### Moves into `engine/wiring/`

- [ ] **Step 8.16 — `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts`:**
  - line 162 `PointSourceConfig` → `@types/engine/wiring/PointSourceConfig.d.ts`
  - line 213 `WirePointSourceDeps` → `@types/engine/wiring/WirePointSourceDeps.d.ts`
- [ ] **Step 8.17 — `src/services/engine/wiring/seedSettingsCallbacks.ts:44`** `Snapshot` → `@types/engine/wiring/SettingsCallbackSeed.d.ts`
  - **Rename on move** (see plan header collision note). Update the source declaration to use the new name and re-import it.

### Moves into `engine/` root (interaction / bake / helpers / phases)

These are engine-internal but don't fit `frame/`, `subsystems/`, or `wiring/`. **Decision DP-6:** place them in `@types/engine/` at the root level alongside `EngineHandle.d.ts`. The implementer should NOT introduce new subfolders (`interaction/`, `bake/`, `helpers/`, `phases/`) — the spec freezes the subfolder list.

- [ ] **Step 8.18 — `src/services/engine/interaction/clickHandler.ts`** (collision DP applies — `PickSourceDraw` already lives in `@types/rendering/`):
  - line 83 `PickSourceDraw` — **delete this duplicate**; clickHandler.ts re-imports from `@types/rendering/PickSourceDraw`.
  - line 90 `ClickResolveInput` → `@types/engine/ClickResolveInput.d.ts`
  - line 122 `ResolveSelection` → `@types/engine/ResolveSelection.d.ts`
  - line 132 `BuildGalaxyInfo` → `@types/engine/BuildGalaxyInfo.d.ts`
  - line 147 `ClickResolution` → `@types/engine/ClickResolution.d.ts`
  - line 155 `ClickResolver` → `@types/engine/ClickResolver.d.ts`
  - line 170 `CreateClickResolverInput` → `@types/engine/CreateClickResolverInput.d.ts`
- [ ] **Step 8.19 — `src/services/engine/bake/buildPointInterleavedBuffer.ts`:**
  - line 147 `BuildPointInterleavedBufferMode` → `@types/engine/BuildPointInterleavedBufferMode.d.ts`
  - line 149 `BuildPointInterleavedBufferInput` → `@types/engine/BuildPointInterleavedBufferInput.d.ts`
  - line 168 `BuildPointInterleavedBufferResult` → `@types/engine/BuildPointInterleavedBufferResult.d.ts`
- [ ] **Step 8.20 — `src/services/engine/bake/computeAngularWeights.ts:97`** `ComputeAngularWeightsInput` → `@types/engine/ComputeAngularWeightsInput.d.ts`
- [ ] **Step 8.21 — `src/services/engine/bake/computeSchechterRatios.ts:78`** `ComputeSchechterRatiosInput` → `@types/engine/ComputeSchechterRatiosInput.d.ts`
- [ ] **Step 8.22 — `src/services/engine/helpers/commitFocus.ts:102`** `CommitFocusSelection` → `@types/engine/CommitFocusSelection.d.ts`
- [ ] **Step 8.23 — `src/services/engine/helpers/engineReady.ts:112`** `ReadyEngineState` → `@types/engine/ReadyEngineState.d.ts`
- [ ] **Step 8.24 — `src/services/engine/phases/bootstrap.ts`:**
  - line 105 `Phase` → `@types/engine/Phase.d.ts`
  - line 115 `BootstrapDeps` → `@types/engine/BootstrapDeps.d.ts`
- [ ] **Step 8.25 — `src/services/engine/phases/initGpu.ts:106`** `PhaseLocals` → `@types/engine/PhaseLocals.d.ts`

### Stragglers in `src/hooks/` (cross-domain — handled here because they touch engine handles)

- [ ] **Step 8.26 — `src/hooks/buildAliasIndex.ts`:**
  - line 46 `AliasIndexEntry` → `@types/engine/AliasIndexEntry.d.ts` (consumer rule: feeds engine selection — engine domain)
  - line 53 `BuildAliasIndexInput` → `@types/engine/BuildAliasIndexInput.d.ts`
- [ ] **Step 8.27 — `src/hooks/useAliasIndex.ts`:**
  - line 32 `export type { AliasIndexEntry } from './buildAliasIndex'` — **delete** this re-export (consumers will import from `@types/engine/AliasIndexEntry` directly).
  - line 34 `UseAliasIndexInput` → `@types/engine/UseAliasIndexInput.d.ts`
  - line 40 `UseAliasIndexReturn` → `@types/engine/UseAliasIndexReturn.d.ts`
- [ ] **Step 8.28 — `src/hooks/useEngine.ts`:**
  - line 75 `UseEngineInput` → `@types/engine/UseEngineInput.d.ts`
  - line 86 `UseEngineReturn` → `@types/engine/UseEngineReturn.d.ts`
- [ ] **Step 8.29 — `src/hooks/useFamousMeta.ts:41`** `UseFamousMetaReturn` → `@types/engine/UseFamousMetaReturn.d.ts`
- [ ] **Step 8.30 — `src/hooks/useFocusUrlSync.ts`:**
  - line 83 `DesiredHashInput` → `@types/engine/DesiredHashInput.d.ts`
  - line 106 `DesiredHashOutput` → `@types/engine/DesiredHashOutput.d.ts`
  - line 165 `UseFocusUrlInput` → `@types/engine/UseFocusUrlInput.d.ts`
  - line 182 `FocusSyncReturn` → `@types/engine/FocusSyncReturn.d.ts`
- [ ] **Step 8.31 — `src/hooks/useKeyboardShortcuts.ts:30`** `UseKeyboardShortcutsInput` → `@types/engine/UseKeyboardShortcutsInput.d.ts`

### Stragglers in `src/utils/` and `src/worker.ts`

- [ ] **Step 8.32 — `src/utils/concurrency/priorityQueue.ts:51`** `QueueEntry<T>` → `@types/loading/QueueEntry.d.ts` (consumer rule: it parameterizes ImageBitmap loading)
- [ ] **Step 8.33 — `src/utils/network/galaxyImageFetcher.ts:29`** `FetchGalaxyBitmapInput` → `@types/loading/FetchGalaxyBitmapInput.d.ts`
- [ ] **Step 8.34 — `src/worker.ts:38`** `Env` — file-local to `worker.ts` (not imported anywhere). **Drop the `export`** rather than moving. Replace `export type Env =` with `type Env =`.

### Component-folder carve-out applied

The following types in `.tsx` files **stay put** (verified during survey that no consumer outside the component folder imports them):

- `src/components/InfoCard/tooltips.tsx:28` `TipContent` — only used in `tooltips.tsx` itself. **Drop `export`** (file-local).
- `src/components/CommandPalette/scoreAliasMatch.ts:30` `ScorableAliasEntry` — **`.ts` not `.tsx`**, so the carve-out per the spec does NOT apply by letter. However: only one consumer (`CommandPalette.tsx` in the same folder). **Decision DP-7:** the spec's carve-out is intent-driven (component-folder isolation). Both `scoreAliasMatch.ts` and `scoreFamousMatch.ts` are component-folder-local helpers analogous to `tooltips.tsx`. **Leave their types in place** to honor the spec's intent. Flag this explicitly in the PR description for reviewer confirmation; if reviewer prefers strict letter, move them to `@types/engine/` and update `CommandPalette.tsx`.
- `src/components/CommandPalette/scoreFamousMatch.ts:23` `ScorableEntry` — same as above.

All component `Props` types (CommandPaletteProps, PaletteSelectProps, PanelProps, CompactCardProps, FullCardProps, InfoCardProps, ThumbnailProps, InfoTipProps, LoadingBarProps, LoadingDevPanelProps, NavigationPanelProps, SearchTriggerProps, SettingsPanelProps — wait, no such named type exists; verify — VolumeFieldRowProps, StatsPanelProps) **stay put** per spec.

### Delete root barrel

- [ ] **Step 8.35 — Verify no remaining barrel imports:**

```
git grep -nE "from ['\"].*@types['\"]" src tests
```

Expected output: zero matches. If any line still says `from '../@types'` (without a subfolder), fix it before proceeding.

- [ ] **Step 8.36 — Delete `src/@types/index.d.ts`.**
- [ ] **Step 8.37 — Verify no stale `Engine*.d.ts` files at `src/@types/` root** (every `EngineXyz.d.ts` should now live under `src/@types/engine/...`):

```
ls src/@types/
```

Expected: only the subdirectories `camera/`, `data/`, `engine/`, `input/`, `loading/`, `math/`, `rendering/`, `settings/`, plus `wesl.d.ts`.

### Verification

- [ ] **Step 8.38 — `npm run typecheck`** → zero errors.
- [ ] **Step 8.39 — `npm test`** → all 590+ pass.
- [ ] **Step 8.40 — Final spot check:**

```
git grep -nE "^export type " src --include='*.ts' --include='*.tsx' | grep -v "Props =" | grep -v "src/@types/"
```

Expected matches (acceptable — explained above):
- `src/components/InfoCard/tooltips.tsx` — none (export was dropped in Step 8.34… wait, in `TipContent` step above)
- `src/components/CommandPalette/scoreAliasMatch.ts` `ScorableAliasEntry` — accepted carve-out
- `src/components/CommandPalette/scoreFamousMatch.ts` `ScorableEntry` — accepted carve-out
- Zero other `export type` declarations outside `src/@types/`.

If anything else appears, investigate before merging.

- [ ] **Step 8.41 — Update `CLAUDE.md`:** the file mentions `src/@types/` — add one sentence describing the subfolder layout. Single-line edit:

```
src/
  @types/             Top-level type declarations, organized into subfolders
                      (data/, engine/, rendering/, loading/, camera/, input/,
                      settings/, math/). One file per type. No barrel — all
                      imports are deep + relative.
```

- [ ] **Step 8.42 — Commit + push + PR.** Subject: `refactor(types): consolidate engine internals into @types/engine and delete root barrel`. PR body should explicitly list:
  - Total types relocated in this PR.
  - The `index.d.ts` deletion.
  - The two accepted carve-outs (`ScorableAliasEntry`, `ScorableEntry`).
  - The `Snapshot → SettingsCallbackSeed` rename.
  - The `Env` export-dropped-rather-than-moved decision.

---

## Per-PR commit guidance

Each PR's commit message uses the project's HEREDOC pattern with `Co-Authored-By` in the **body**, never as `--author=`. Example for PR 1:

```
git commit -m "$(cat <<'EOF'
refactor(types): consolidate math + data types into @types/{math,data}

Move every module-scope `export type` alias in src/data/ and src/utils/math/
into src/@types/data/ and src/@types/math/ following the consolidation
design spec. One file per type, deep relative imports, no barrel.

Spec: docs/superpowers/specs/2026-05-12-types-consolidation-design.md
Plan: docs/superpowers/plans/2026-05-12-types-consolidation.md (PR 1/8)

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

Each `gh pr create` follows the project's standard PR template (Summary + Test plan checkboxes).

---

## Total move count

- **PR 1 (math + data):** 25 type files (5 math splits/moves + 20 data moves & splits).
- **PR 2 (loading):** 20 type files.
- **PR 3 (camera):** 11 type files.
- **PR 4 (input):** 9 type files.
- **PR 5 (rendering):** 34 type files.
- **PR 6 (settings):** 7 type files.
- **PR 7 (engine state + handles):** 25 type files (relocations + 4 splits).
- **PR 8 (engine internals + barrel deletion):** ~50 type files + index.d.ts deletion + ~3 export-dropped sites.

**Grand total: ~181 destination `.d.ts` files** (matches the spec's "~150 after the move" once duplicates from splits collapse and excluding the explicit carve-outs).
