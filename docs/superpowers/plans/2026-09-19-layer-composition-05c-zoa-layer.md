# Layer composition 05c — the `zoneOfAvoidance` Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task, under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Form `src/layers/zoneOfAvoidance/` in today's flow/filaments/localBubble shape. It owns the band renderer and its additive upsample, both passes, the `zoa` render target, the fade row, the world-space lettering, the selection row, the source entry, its settings slice, its "Labels & guides" toggle row and its Debug tuning section. Core loses every one of those holdings. `LABEL_3D_PRODUCERS` is deleted outright because ZoA's lettering is its only row.

**Architecture:** No contract change. #759 built the three joints ZoA needs: `ui` entries with a `labelsAndGuides` data row, `labels: { screen, world }`, and Layer `targets` allocated through `state.layerTargets` / `composeRenderTargetRows`. This PR only uses them. The Runtime is `{ renderer, upsample }`, both non-null by construction, so the renderer-null checks in the liveness gate and both passes are deleted rather than moved. ZoA has no asset slot, no compute row and no `frame` vote.

**Tech Stack:** TS, WebGPU, RTK, React, `defineLayer` / `instantiateLayer` / `createLayers`.

**Spec:** `docs/superpowers/specs/2026-09-09-layer-composition-design.md`: §4.5 (renderers leave `gpu` with their Layer), §4.7 (source entry modules move into the Layer), §9(e) (ZoA's touchpoints: everything past P0–P3 is "growth at existing members"; no `frame` vote; InfoCard/focus/halo/URL stay core), §10(e) (one Layer per PR).

**Depends on:** nothing unlanded. Branches off `main` at `1b4855fc0` (#759 merged).

## Ground preparation

Done, in #759 (`1b4855fc0`, plan `docs/superpowers/plans/completed/2026-09-19-layer-composition-05c-prep-contract.md`). It was the prep PR for exactly this Layer: P0 `concatUniqueRows`, P1 `ui` entry list + `labelsAndGuides` slot, P2 `labels.world`, P3 Layer render targets. No further prep is needed, because every remaining ZoA touchpoint lands on a member that already exists (`passes`, `fades`, `selection`, `sources`, `settings`, `create`/`destroy`).

## Execution (lean SDD)

One worktree (this one). There is no perf gate (user ruling). Tasks run serially, one commit per task.

| Dispatch | Tasks     | Why grouped                                                                                                                                                   |
| -------- | --------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1       | Tasks 1–2 | Small and mechanical: a constant extraction plus two pure moves that no engine file imports. The controller may do both inline.                               |
| D2       | Task 3    | The switch. It moves the engine-side files, forms and composes the Layer, and deletes core's holdings in **one commit** (see Task 3 for why it cannot split). |
| D3       | Task 4    | A prose/path sweep and the README row. The controller does it inline, under ~50 lines.                                                                        |

Task 5 is the user's manual smoke. There is one whole-branch review at the end, and CI is the gate.

## Global Constraints

- `type` aliases, never `interface`. Types never live inline in implementation files; the Layer's own `ZoneOfAvoidanceRuntime` goes in `src/layers/zoneOfAvoidance/types/`, exported. A React component's own `Props` is the one exception.
- **One symbol per file, filename = the symbol** inside a Layer (`src/layers/README.md`). A file that moves in is renamed to its export if the two differ.
- **Pass/orchestration files declare ONLY their one export.** `tests/services/engine/frame/frameFilePurity.test.ts` sweeps every Layer's `passes/`. Its rows only ever shrink.
- `tests/conventions/layerImportBoundary.test.ts` rows only ever shrink. After every commit, no file under `src/services/engine/**` or `src/state/**` may import `src/layers/**`.
- TS moves go through `npm run move-files` (`--dry` first), never `git mv` + hand-edited imports. It misses `.wesl` `package::` imports, `?static` specifiers, CSS-module specifiers, `vi.mock('…')` string paths and prose, so grep for each old path afterwards.
- **Shaders STAY** at `src/services/gpu/shaders/zoneOfAvoidance/`. `@types/rendering/ZoneOfAvoidanceRenderer.d.ts`, `@types/settings/ZoneOfAvoidance*.d.ts`, `@types/data/zoneOfAvoidance/**`, `src/data/zoneOfAvoidance/**` and `src/utils/format/formatZoneOfAvoidanceTuningDefaults.ts` stay too (flow/filaments precedent).
- A Layer never drives a fade at construction; core owns the arrival edge.
- Comments: module header ≤ 5 lines, comment lines ≤ half the code lines. Say WHY, never WHAT.
- Never `git add -A`; stage by path. Run `npm run build` before the last commit of each dispatch, because `tsc` cannot see a dangling `?static` specifier.
- `npm test` and `npm run typecheck` are green at every task boundary.

---

## Touchpoint inventory

Every `zoneOfAvoidance` / `ZoneOfAvoidance` / `zoa` hit in `src/` and `tests/` (grep 2026-09-19), classified.

### Moves into the Layer

| Today                                                                      | Becomes                                                                                                     |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `src/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer.ts`    | `render/zoneOfAvoidanceRenderer.ts`, constructed in `create`                                                |
| `gpuHandleRegistry.ts:202-206` `zoneOfAvoidanceRenderer` row               | `runtime.renderer` (row deleted)                                                                            |
| `gpuHandleRegistry.ts:247-251` `zoneOfAvoidanceUpsample` row               | `runtime.upsample` (row deleted)                                                                            |
| `src/services/engine/frame/passes/zoneOfAvoidancePass.ts`                  | `passes/zoneOfAvoidancePass.ts`, a factory over the runtime                                                 |
| `src/services/engine/frame/passes/zoneOfAvoidanceUpsamplePass.ts`          | `passes/zoneOfAvoidanceUpsamplePass.ts`, a factory still built by core's `createUpsamplePass`               |
| `passes/index.ts:15-16,51,53`                                              | Layer `passes` (rows deleted)                                                                               |
| `src/services/engine/frame/zoneOfAvoidanceLiveness.ts`                     | `present/deriveZoneOfAvoidanceLiveness.ts` (renamed to its export). All three readers are Layer-owned.      |
| `src/services/engine/presentation/zoneOfAvoidanceLayerOpacity.ts`          | `present/zoneOfAvoidanceLayerOpacity.ts`. Its only reader is the liveness file.                             |
| `src/services/engine/presentation/produceZoneOfAvoidanceLettering.ts`      | `present/produceZoneOfAvoidanceLettering.ts`, returned from `labels().world`                                |
| `src/services/engine/presentation/label3DProducers.ts` (its only row)      | **deleted**                                                                                                 |
| `src/services/engine/selection/zoneOfAvoidanceSelectionRow.ts`             | `present/zoneOfAvoidanceSelectionRow.ts` (galaxyCatalog keeps its selection row in `present/`)              |
| `coreSelectionRows.ts:10,20`                                               | Layer `selection` (row deleted)                                                                             |
| `fadeLayers.ts:148-155` fade row                                           | `present/zoneOfAvoidanceFadeRows.ts`                                                                        |
| `renderTargets.ts:159-164,212-219` `zoa` row + `ZONE_OF_AVOIDANCE_DIVISOR` | `targets` inline in `layer.ts` (`src/layers/README.md` puts `targets` there); the named divisor is deleted  |
| `src/data/sources/zone-of-avoidance.ts` + `sources.ts:40,95`               | `sources/zone-of-avoidance.ts` + `sources/zoneOfAvoidanceSourceRows.ts`, folded via `sourceRecordOf` (§4.7) |
| `appSettingsSlices.ts:18,33` (unformed list)                               | `settings/zoneOfAvoidanceLayerSettings.ts`, folded in beside the other Layer tuples                         |
| `LabelsAndGuidesSectionContainer.tsx:67,71,98,143-148,182-187,202-203`     | `ui/zoneOfAvoidanceSettingsRow.ts` (`labelsAndGuides` slot)                                                 |
| `src/components/DebugPanel/ZoneOfAvoidanceTuningSection.tsx`               | `ui/ZoneOfAvoidanceTuningSection.tsx`                                                                       |
| `src/components/containers/ZoneOfAvoidanceTuningSectionContainer.tsx`      | `ui/ZoneOfAvoidanceTuningSectionContainer.tsx` (`debug` slot); `DebugPanel.tsx:27,76` lose it               |
| The four shell constants, `zoneOfAvoidancePass.ts:15-19`                   | `src/data/zoneOfAvoidance/zoneOfAvoidanceShell.ts` (Task 1)                                                 |
| `src/layers/zoneOfAvoidance/settings/zoneOfAvoidanceSlice.ts`              | already in place                                                                                            |

### Deleted with no replacement

- `EngineGpuHandles.d.ts:32,294-301,343-357` (both fields, their docs and the renderer type import), and `engine.ts:196,201` (the two `null` seeds).
- The renderer-null checks at `zoneOfAvoidanceLiveness.ts:18` and `zoneOfAvoidancePass.ts:31,57`. The renderer is non-null by construction.
- `createLayers.ts:32,145-149`: the core-first spread. The result is `state.label3DProducers = instances.flatMap((i) => i.worldLabels)`.
- `ZONE_OF_AVOIDANCE_DIVISOR` (`renderTargets.ts:159-164`).
- The `frame/passes/zoneOfAvoidancePass` ratchet row (`frameFilePurity.test.ts:73`).
- The dead `vi.mock` of the old renderer path (`initGpu.hdrCapabilityWiring.test.ts:156-157`) and the two null fields at `:399,402`.
- The upsample test `skips the blit but still draws labels when zoneOfAvoidanceUpsample is null` (`zoneOfAvoidanceUpsamplePass.test.ts:104-111`). That case is impossible by construction.

### Stays in core (the design's ruling, or core-keyed tables)

- **Selection-keyed tables** (§9(e): keyed by the shared `SelectionRef` union): `SelectionRef.d.ts:25`, `SelectionRow.d.ts:26`, `FocusableTarget.d.ts`, `ZoneOfAvoidanceInfo.d.ts`, `data/zoneOfAvoidance/zoneOfAvoidanceInfo.ts`, `targetIdentityKey.ts:18`, `selectionHaloTable.ts:58-92`, `rowFocusable.ts:17`, `refOf.ts:27-46`, `buildFocusable.ts:22,38`, `urlHashFor.ts:35`, `focusFraming.ts:136`, `watchFocusTweenSaga.ts:12`, and the InfoCard (`detailCardTable.ts:40-41,148-162`, `ZoneOfAvoidanceDetailCard/`, `CompactZoneOfAvoidanceCard/`).
- **Fade/visibility vocabulary**, keyed by `FadeId` / `VisibilityLayerKey` (localBubble precedent): `FadeId.d.ts:92`, `VisibilityLayerKey.d.ts:72`, `fadeRegistry.ts:84`, `fadeIdToVisibilityKey.ts:87`, `focusRecession.ts:63`, `scaleFadeBands.ts:130-136`, `visibilityLayerRows.ts:29`, `visibilityActionRow.ts:39,55`.
- **Frame vocabulary**: the `FRAME_ORDER` line `frameOrder.ts:89` and `passGroupTitles.ts:20` (`'zoa·COSMO'`). The renderer landmine "a new target needs a frame-program step" is satisfied because the `zoa` line already exists and does not move.
- **Core renderer / factory**: `createUpsamplePass.ts` and `UpsamplePassRow.d.ts` (prose citations get updated in Task 4). `label3DRenderer` stays a core handle, and the Layer's upsample `postBlit` keeps drawing it via `state.gpu.label3DRenderer`.
- **Data/codes**: `source.ts:230` (`Source.ZoneOfAvoidance`, per §4.7 the code enum stays global), `galaxyType.ts:102`, `SourceEntry.d.ts:10,31`, `defaults.ts:261`, `zoneOfAvoidanceSliderFields.ts`, `zoneOfAvoidanceLabelText.ts`, `formatZoneOfAvoidanceTuningDefaults.ts`, the `selectors.ts:183-190` selectors (the moved row and container keep reading them), and the shaders.

---

## File Structure

### Created

| File                                                                  | Responsibility                                                                 |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| `src/@types/rendering/ZoneOfAvoidanceShell.d.ts`                      | `ZoneOfAvoidanceShell`: the record's type (Task 1)                             |
| `src/data/zoneOfAvoidance/zoneOfAvoidanceShell.ts`                    | `ZONE_OF_AVOIDANCE_SHELL`: the four shell-shape numbers, one record (Task 1)   |
| `src/layers/zoneOfAvoidance/layer.ts`                                 | `zoneOfAvoidanceLayer = defineLayer({...})`, including the inline `zoa` target |
| `src/layers/zoneOfAvoidance/types/ZoneOfAvoidanceRuntime.ts`          | `{ renderer, upsample }`, exported                                             |
| `src/layers/zoneOfAvoidance/create.ts`                                | Builds the renderer and the additive upsample                                  |
| `src/layers/zoneOfAvoidance/destroy.ts`                               | Releases both                                                                  |
| `src/layers/zoneOfAvoidance/present/zoneOfAvoidanceFadeRows.ts`       | The one fade row, moved verbatim from `fadeLayers.ts`                          |
| `src/layers/zoneOfAvoidance/settings/zoneOfAvoidanceLayerSettings.ts` | `[zoneOfAvoidanceSlice] as const`                                              |
| `src/layers/zoneOfAvoidance/sources/zoneOfAvoidanceSourceRows.ts`     | `[[Source.ZoneOfAvoidance, ZONE_OF_AVOIDANCE_ENTRY]] as const`                 |
| `src/layers/zoneOfAvoidance/ui/zoneOfAvoidanceSettingsRow.ts`         | The `LayerSettingsRow` for "Labels & guides"                                   |

### Moved (via `npm run move-files`; test mirrors ride along)

| From                                                                    | To (under `src/layers/zoneOfAvoidance/`)       | Task |
| ----------------------------------------------------------------------- | ---------------------------------------------- | ---- |
| `src/components/DebugPanel/ZoneOfAvoidanceTuningSection.tsx`            | `ui/ZoneOfAvoidanceTuningSection.tsx`          | 2    |
| `src/components/containers/ZoneOfAvoidanceTuningSectionContainer.tsx`   | `ui/ZoneOfAvoidanceTuningSectionContainer.tsx` | 2    |
| `src/data/sources/zone-of-avoidance.ts`                                 | `sources/zone-of-avoidance.ts`                 | 2    |
| `src/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer.ts` | `render/zoneOfAvoidanceRenderer.ts`            | 3    |
| `src/services/engine/frame/passes/zoneOfAvoidancePass.ts`               | `passes/zoneOfAvoidancePass.ts`                | 3    |
| `src/services/engine/frame/passes/zoneOfAvoidanceUpsamplePass.ts`       | `passes/zoneOfAvoidanceUpsamplePass.ts`        | 3    |
| `src/services/engine/frame/zoneOfAvoidanceLiveness.ts`                  | `present/deriveZoneOfAvoidanceLiveness.ts`     | 3    |
| `src/services/engine/presentation/zoneOfAvoidanceLayerOpacity.ts`       | `present/zoneOfAvoidanceLayerOpacity.ts`       | 3    |
| `src/services/engine/presentation/produceZoneOfAvoidanceLettering.ts`   | `present/produceZoneOfAvoidanceLettering.ts`   | 3    |
| `src/services/engine/selection/zoneOfAvoidanceSelectionRow.ts`          | `present/zoneOfAvoidanceSelectionRow.ts`       | 3    |

### Deleted

`src/services/engine/presentation/label3DProducers.ts`

### Modified — core shrinks

| File                                                                              | Change                                                                                                        | Task |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | ---- |
| `tests/services/engine/frame/frameFilePurity.test.ts`                             | `−` the `frame/passes/zoneOfAvoidancePass: 4` row                                                             | 1    |
| `ZoneOfAvoidanceRenderer.d.ts`, `zoneOfAvoidanceRenderer.ts` (+ test)             | `draw` / `drawPick` / `writeUniforms` take `shell: ZoneOfAvoidanceShell`                                      | 1    |
| `src/data/defaults.ts:253`                                                        | the "currently ~377 Mpc" re-narration → cite `ZONE_OF_AVOIDANCE_SHELL` instead                                | 1    |
| `docs/BACKLOG.md`, `docs/backlog/2026-08-17-zone-of-avoidance-shape-constants.md` | shrink the item to its label em-height/radius half                                                            | 1    |
| `src/components/DebugPanel/DebugPanel.tsx`                                        | import path (2); `−` the ZoA tuning import + element (3)                                                      | 2, 3 |
| `src/data/sources.ts`                                                             | import path (2); ZoA leaves `UNFORMED_SOURCE_REGISTRY`, `+ sourceRecordOf(ZONE_OF_AVOIDANCE_SOURCE_ROWS)` (3) | 2, 3 |
| `src/compositions/app.ts`                                                         | `+ zoneOfAvoidanceLayer`, **before** `localBubbleLayer`                                                       | 3    |
| `src/compositions/appSettingsSlices.ts`                                           | ZoA leaves `UNFORMED_SETTINGS_SLICES`; `+ ...zoneOfAvoidanceLayerSettings`                                    | 3    |
| `src/services/engine/frame/passes/index.ts`                                       | `−` both ZoA passes                                                                                           | 3    |
| `src/services/engine/gpuHandles/gpuHandleRegistry.ts`                             | `−` both ZoA rows + the renderer import                                                                       | 3    |
| `src/@types/engine/handles/EngineGpuHandles.d.ts`, `engine.ts`                    | `−` both fields + seeds                                                                                       | 3    |
| `src/services/gpu/renderTargets.ts`                                               | `−` the `zoa` row + `ZONE_OF_AVOIDANCE_DIVISOR`                                                               | 3    |
| `src/services/engine/wiring/fadeLayers.ts`                                        | `−` the ZoA row                                                                                               | 3    |
| `src/services/engine/phases/createLayers.ts`, `EngineState.d.ts` (doc)            | `label3DProducers` = Layers' world producers only                                                             | 3    |
| `src/services/engine/selection/coreSelectionRows.ts`                              | `−` the ZoA row; header "five" → "four"                                                                       | 3    |
| `src/components/containers/LabelsAndGuidesSectionContainer.tsx`                   | `−` the hardcoded ZoA row, selector, action, callback, deps; header/comment prose                             | 3    |
| Tests (see Task 3 step list)                                                      | fixtures, expectations, the dead mock                                                                         | 3    |
| `src/layers/README.md`, prose citations of old paths                              | Task 4 sweep                                                                                                  | 4    |

---

## Contract

```ts
// src/layers/zoneOfAvoidance/types/ZoneOfAvoidanceRuntime.ts
export type ZoneOfAvoidanceRuntime = {
  readonly renderer: ZoneOfAvoidanceRenderer; // @types/rendering/ZoneOfAvoidanceRenderer
  readonly upsample: AdditiveUpsample; // @types/rendering/AdditiveUpsample
};

// src/@types/rendering/ZoneOfAvoidanceShell.d.ts: the shell's shape, one object
export type ZoneOfAvoidanceShell = {
  readonly innerRadiusMpc: number;
  readonly outerRadiusMpc: number;
  readonly bulgeDeg: number;
  readonly anticenterDeg: number;
};

// src/data/zoneOfAvoidance/zoneOfAvoidanceShell.ts: one symbol, values unchanged
export const ZONE_OF_AVOIDANCE_SHELL: ZoneOfAvoidanceShell = {
  innerRadiusMpc: 3,
  outerRadiusMpc: 380,
  bulgeDeg: 10,
  anticenterDeg: 3,
};

// ZoneOfAvoidanceRenderer.d.ts: `draw` / `drawPick` (and the private
// `writeUniforms`) take `shell: ZoneOfAvoidanceShell` in place of the four
// adjacent positional numbers. The other params are unchanged.

// Factories, each file exporting only this one symbol
export function zoneOfAvoidancePass(runtime: ZoneOfAvoidanceRuntime): ContentPass; // name 'zone-of-avoidance'
export function zoneOfAvoidanceUpsamplePass(runtime: ZoneOfAvoidanceRuntime): ContentPass; // name 'zone-of-avoidance-upsample'
export function zoneOfAvoidanceFadeRows(): readonly FadeLayer<unknown>[]; // no guard, so no runtime
export function deriveZoneOfAvoidanceLiveness(
  state: PassState,
  ctx: ReadyFrameContext,
): number | null;

// src/layers/zoneOfAvoidance/layer.ts
export const zoneOfAvoidanceLayer = defineLayer({
  name: 'zoneOfAvoidance',
  // Ruling 15 comment, as in flow/localBubble
  settings: zoneOfAvoidanceLayerSettings,
  sources: ZONE_OF_AVOIDANCE_SOURCE_ROWS,
  targets: [
    /* the renderTargets.ts:212-219 row, `scale: 5` inline with a one-line WHY */
  ],
  create,
  destroy,
  passes: (runtime) => [zoneOfAvoidancePass(runtime), zoneOfAvoidanceUpsamplePass(runtime)],
  fades: zoneOfAvoidanceFadeRows,
  labels: () => ({
    world: [{ id: 'zoneOfAvoidanceLettering', produceLabels3D: produceZoneOfAvoidanceLettering }],
  }),
  selection: () => [zoneOfAvoidanceSelectionRow()],
  ui: [
    { slot: 'labelsAndGuides', content: zoneOfAvoidanceSettingsRow },
    { slot: 'debug', content: ZoneOfAvoidanceTuningSectionContainer },
  ],
});

// src/layers/zoneOfAvoidance/ui/zoneOfAvoidanceSettingsRow.ts: id and label unchanged from the container
export const zoneOfAvoidanceSettingsRow: LayerSettingsRow = {
  id: 'toggle-zone-of-avoidance',
  label: 'Zone of Avoidance',
  select: selectZoneOfAvoidanceEnabled,
  set: setZoneOfAvoidanceEnabled,
};
```

**Decision: composition order is `[galaxyCatalog, filaments, flow, zoneOfAvoidance, localBubble]`.** Layer `labelsAndGuides` rows append in composition order. Putting ZoA before localBubble keeps "Labels & guides" ending `… Orbit trails, Zone of Avoidance, Local Bubble`, which is what the user sees today. The one visible move is in the DebugPanel. ZoA tuning now renders in the Layer group (after Flow tuning, before Local Bubble tuning), and therefore above Milky Way tuning instead of below it. User-approved 2026-09-19.

---

## Task 1: Shell constants to `src/data/`, passed as one object

**Pass/orchestration files declare ONLY their one export.**

**Files:** Create `src/@types/rendering/ZoneOfAvoidanceShell.d.ts`, `src/data/zoneOfAvoidance/zoneOfAvoidanceShell.ts`. Modify `src/services/engine/frame/passes/zoneOfAvoidancePass.ts`, `src/@types/rendering/ZoneOfAvoidanceRenderer.d.ts`, `src/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer.ts` (+ its test's call sites), `src/data/defaults.ts`, `tests/services/engine/frame/frameFilePurity.test.ts`, `docs/BACKLOG.md`, `docs/backlog/2026-08-17-zone-of-avoidance-shape-constants.md`.

No new test. The object param removes the `bulgeDeg`/`anticenterDeg` swap hazard by construction (the compiler is the check), and the purity ratchet covers the move. Existing renderer tests that assert uniform floats 11/19/20 keep guarding the packing.

- [x] Add `ZONE_OF_AVOIDANCE_SHELL` per the contract. Carry the "visual-pass placeholders, Mpc / degrees" note from `zoneOfAvoidancePass.ts:15`.
- [x] Add `ZoneOfAvoidanceShell` per the contract. `ZoneOfAvoidanceRenderer.d.ts` and `zoneOfAvoidanceRenderer.ts` (`draw` ~:241, `drawPick` ~:213, `writeUniforms` ~:146): replace the four positional numbers with `shell: ZoneOfAvoidanceShell`, reading `shell.innerRadiusMpc` etc. inside `writeUniforms`. Uniform packing (floats 11, 19, 20) is unchanged. Update the renderer test's call sites.
- [x] `zoneOfAvoidancePass.ts`: delete lines 15-19. `draw` and `drawPick` pass `ZONE_OF_AVOIDANCE_SHELL`.
- [x] `defaults.ts:253`: replace the "currently ~377 Mpc" restatement with a pointer to `ZONE_OF_AVOIDANCE_SHELL` (no number restated).
- [x] Backlog: this lands the item's record + object-param half. Rewrite `docs/backlog/2026-08-17-zone-of-avoidance-shape-constants.md` down to the remaining half (the `LABEL_RADIUS_MPC` / `LABEL_EM_MPC` coupling → arc-angle em-height; drop the resolved sections and the stale "lives in zoneOfAvoidancePass.ts" citation), and retitle its `docs/BACKLOG.md` line to match (e.g. "ZoA label em-height not radius-invariant"). Paths inside it get re-pointed in Task 4.
- [x] `frameFilePurity.test.ts`: delete the `'frame/passes/zoneOfAvoidancePass': 4` row. The file now has 0 strays, and a row at 0 is deleted.
- [x] `npx vitest run tests/services/engine/frame` → green. Commit `refactor(zoa): shell constants to src/data, passed as one object`.

## Task 2: Move the UI and source modules

Pure moves. Each moved file's importers (`DebugPanel.tsx`, `data/sources.ts`) live outside `src/services/engine` and `src/state`, so the import-boundary ratchet stays clean. **Pass/orchestration files declare ONLY their one export** (no pass file moves here).

**Files:** the three Task 2 rows of the _Moved_ table. Modify `src/components/DebugPanel/DebugPanel.tsx` and `src/data/sources.ts` (import paths only).

No new test (pure move).

- [x] `npm run move-files -- --manifest <moves.json> --dry`, inspect the output, then run it for real.
- [x] `ZoneOfAvoidanceTuningSection.tsx` imports `./DebugTuningSection`, `./DebugSlider.module.css` and `../common/CopyButton/CopyButton`. Re-point the CSS-module specifier by hand if `move-files` left it, and check the other two. `FlowTuningSection.tsx` is the precedent for the cross-boundary `components/DebugPanel/...` imports.
- [x] Grep `src tests tools docs` for `DebugPanel/ZoneOfAvoidanceTuningSection`, `containers/ZoneOfAvoidanceTuningSectionContainer` and `data/sources/zone-of-avoidance`. Code hits must be zero. Prose hits wait for Task 4.
- [x] `npm test && npm run typecheck && npm run build` → green. Commit `refactor(zoa): relocate the tuning section and source entry into the Layer`.

## Task 3: Form the Layer, compose it, delete core's holdings

**review: yes.** It touches frame passes, the fade row (sagas read it), a render target (renderer landmine: "a new target needs a frame-program step"), and `createLayers`.

**Pass/orchestration files declare ONLY their one export.** Both Layer pass files are swept by `frameFilePurity` at budget 0.

**Why one commit:** once the renderer, passes, lettering and selection row move, `passes/index.ts`, `gpuHandleRegistry.ts`, `label3DProducers.ts` and `coreSelectionRows.ts` (all under `src/services/engine`) would import `src/layers/**`, and `layerImportBoundary` fails. Composing the Layer while core still holds the rows fails at boot instead: `concatUniqueRows` throws on the duplicate pass names and the duplicate `zoa` target, and `assertSelectionRowsDisjoint` throws on the duplicate pick source. So the move, the Layer and the deletions land together. Work the steps in order and commit once at the end.

**Files:** the Task 3 rows of the _Moved_ table; every _Created_ file except `zoneOfAvoidanceShell.ts`; the Task 3 rows of _Modified_; delete `src/services/engine/presentation/label3DProducers.ts`. Tests:
`tests/services/engine/frame/passes/zoneOfAvoidancePass.test.ts`, `…/zoneOfAvoidanceUpsamplePass.test.ts`, `tests/services/engine/frame/zoneOfAvoidanceLiveness.test.ts`, `tests/services/gpu/renderers/zoneOfAvoidance/zoneOfAvoidanceRenderer.test.ts` (all four move along), `tests/services/engine/selection/coreSelectionRows.test.ts`, `tests/services/engine/phases/createLayers.composition.test.ts`, `tests/services/gpu/renderTargets.test.ts`, `tests/components/containers/LabelsAndGuidesSectionContainer.test.ts`, `tests/services/engine/wiring/fadeLayers.test.ts`, `tests/services/engine/phases/initGpu.hdrCapabilityWiring.test.ts`, `tests/services/engine/frame/renderFrame.test.ts`, `tests/visual/renderFrameSplitBaseline.test.ts`, and any other fixture the compiler flags for the two deleted `gpu` fields.

**No new test file.** Flow's `create.test` pinned its slot→renderer commit, and ZoA has no slot. `destroy` releases a renderer and an upsample whose `destroy` is a no-op (`additiveUpsample.ts:124`). The moved pass/liveness tests already pin the gates, and `frameOrderBoot.test.ts` fails if the Layer forgets its `zoa` target, because `FRAME_ORDER` names it. The steps below re-shape existing tests. One of them swaps a stub for the real row, and that swap is the only new assertion.

- [x] **Step 1: Move.** One `move-files` manifest covering the seven Task 3 rows (`--dry` first). `zoneOfAvoidanceLiveness.ts` is renamed to `deriveZoneOfAvoidanceLiveness.ts`; check that its test mirror followed. Re-point the renderer's three `?static` shader specifiers (`zoneOfAvoidanceRenderer.ts:17-19`) to `../../../services/gpu/shaders/zoneOfAvoidance/…?static`, matching `src/layers/flow/render/flowFieldRenderer.ts:68-70`.
- [x] **Step 2: Runtime, `create`, `destroy`.** `create(deps)` = `{ renderer: createZoneOfAvoidanceRenderer(deps.ctx.device, HDR_TARGET_FORMAT), upsample: createAdditiveUpsample(deps.ctx.device, HDR_TARGET_FORMAT) }`, the args used by today's registry rows. `destroy` calls both `.destroy()`. `src/layers/localBubble/create.ts` / `destroy.ts` / `types/LocalBubbleRuntime.ts` are the shape to copy.
- [x] **Step 3: Runtime-bound contributions.**
  - `deriveZoneOfAvoidanceLiveness`: delete the `state.gpu.zoneOfAvoidanceRenderer === null` line. Nothing else changes.
  - `zoneOfAvoidancePass(runtime)`: const → factory. `draw` and `drawPick` read `runtime.renderer` and drop their `=== null` returns. The liveness re-derive and the full-res pick viewport comment stay.
  - `zoneOfAvoidanceUpsamplePass(runtime)`: `createUpsamplePass({ …, handleOf: () => runtime.upsample, … })`. `postBlit` is unchanged (it still reads core's `state.gpu.label3DRenderer`).
  - `zoneOfAvoidanceFadeRows()`: the `fadeLayers.ts:149-155` row verbatim (seed follows the toggle, no guard, because nothing is demand-loaded). The header copies `localBubbleFadeRows.ts`'s "key and handle are load-bearing" clause and swaps its seed/guard sentence for the seed-follows-toggle reason.
  - `zoneOfAvoidanceSettingsRow`, `zoneOfAvoidanceLayerSettings`, `ZONE_OF_AVOIDANCE_SOURCE_ROWS` per the contract. `localBubbleSettingsRow.ts`, `localBubbleLayerSettings.ts` and `flowSourceRows.ts` are the shapes.
- [x] **Step 4: `layer.ts`** per the contract. The `targets` row is `renderTargets.ts:212-219` verbatim with `scale: 5` and a one-line WHY taken from `ZONE_OF_AVOIDANCE_DIVISOR`'s doc (1/25th the fragments; the band is smooth haze an upsample reconstructs).
- [x] **Step 5: Compose.** `app.ts` gets `zoneOfAvoidanceLayer` between `flowLayer` and `localBubbleLayer`, in both the tuple and the `satisfies` list. In `appSettingsSlices.ts`, remove `zoneOfAvoidanceSlice` from `UNFORMED_SETTINGS_SLICES` and add `...zoneOfAvoidanceLayerSettings`; a slice in both lists throws at import (Ruling 15). In `data/sources.ts`, drop the unformed row and add `...sourceRecordOf(ZONE_OF_AVOIDANCE_SOURCE_ROWS)`.
- [x] **Step 6: Delete core's holdings** (the _Modified: core shrinks_ Task 3 rows):
  - `passes/index.ts`: remove both imports and both rows.
  - `gpuHandleRegistry.ts`: remove both rows and the renderer import.
  - `EngineGpuHandles.d.ts` and `engine.ts`: remove both fields, their docs, the type import and the seeds. Keep `label3DRenderer`'s doc, which names `produceZoneOfAvoidanceLettering` and stays true.
  - `renderTargets.ts`: remove the `zoa` row and `ZONE_OF_AVOIDANCE_DIVISOR`.
  - `fadeLayers.ts`: remove the ZoA row and its comment.
  - `createLayers.ts`: remove the `LABEL_3D_PRODUCERS` import, make the composition `instances.flatMap((i) => i.worldLabels)`, and delete the "core first" comment. Update `EngineState.d.ts:102`'s doc to "every Layer's `worldLabels`, in composition order". Delete `label3DProducers.ts`.
  - `coreSelectionRows.ts`: remove the row and import; the header says four rows.
  - `LabelsAndGuidesSectionContainer.tsx`: remove the hardcoded row, `selectZoneOfAvoidanceEnabled`, the `setZoneOfAvoidanceEnabled` import, `onToggleZoneOfAvoidance` and their two memo deps. Drop "the zone-of-avoidance band" from the header's guide-row list and from the rows comment (`:154-161`), including the `zoneOfAvoidancePass.ts` citation.
  - `DebugPanel.tsx`: remove the ZoA tuning import and element. The Layer's `debug` entry now renders it.
- [x] **Step 7: Tests.**
  - The moved pass / upsample / liveness tests take a runtime stub (`{ renderer, upsample } as unknown as ZoneOfAvoidanceRuntime`) in place of `state.gpu.zoneOfAvoidance*`, and call the factory once per test. **Delete** `skips the blit but still draws labels when zoneOfAvoidanceUpsample is null`, because the upsample is non-null by construction. Keep the two label-side skip tests, which still guard `postBlit`'s own gate. The liveness fixture loses its `gpu` field and its `renderer` param.
  - `coreSelectionRows.test.ts`: the expected list loses `'zoneOfAvoidance'`, and the test name notes that ZoA is its Layer's.
  - `createLayers.composition.test.ts:12,125-130`: drop the `LABEL_3D_PRODUCERS` import; expect exactly `['a-world', 'b-world']`.
  - `renderTargets.test.ts`: core allocates one texture fewer, so `13` → `12` at `:110` and adjust the reconcile count below it to match. Drop `zoa` from the `:103-108` comment and delete the `sizeOf('zoa')` line (`:463-466`); the `volume` line already pins `sizeOf`.
  - `LabelsAndGuidesSectionContainer.test.ts`: replace `STUB_LAYER_ROW` with the real `zoneOfAvoidanceSettingsRow`. The two `layerRows` tests become `appends the ZoA Layer row after the core guide rows` (its checkbox follows `#toggle-orbit-trails`, the last core row) and `the ZoA Layer row reads the store and dispatches its own action` (toggle `#toggle-zone-of-avoidance`, assert `selectZoneOfAvoidanceEnabled` flipped and `checked` followed). This proves the row's real `select`/`set` pair, which no other test sees.
  - `fadeLayers.test.ts:270`: add `...zoneOfAvoidanceFadeRows()` to the intent-subset loop, so the row keeps the `intent`-vs-`VISIBILITY_ACTION_ROW` check it had in core.
  - `initGpu.hdrCapabilityWiring.test.ts`: delete the `vi.mock` of the old renderer path (`:156-157`) and the two null fields (`:399,402`).
  - `renderFrame.test.ts`: delete the two `gpu` fields (`:526,531`). The four comments (`:140-146`, `:640`, `:788`, `:840`, `:897`) now credit the dropped `zoa` step to "no composed ZoA pass", not "renderer null". Delete the fixture's `zoa` target row (`:146`) if the test stays green without it.
  - `renderFrameSplitBaseline.test.ts:424`: delete the field and its comment.
- [x] **Step 8: Sweep.** Grep `src tests` for `zoneOfAvoidanceRenderer`, `zoneOfAvoidanceUpsample`, `LABEL_3D_PRODUCERS`, `ZONE_OF_AVOIDANCE_DIVISOR`, `frame/zoneOfAvoidanceLiveness`, `passes/zoneOfAvoidance`, `renderers/zoneOfAvoidance`, `presentation/produceZoneOfAvoidanceLettering`, `presentation/zoneOfAvoidanceLayerOpacity` and `selection/zoneOfAvoidanceSelectionRow`. The only hits allowed are under `src/layers/zoneOfAvoidance/`, its test mirror, the `EngineGpuHandles` `label3DRenderer` doc, and prose left for Task 4.
- [x] **Step 9: Gate.** `npm test && npm run typecheck && npm run build` → green. `layerImportBoundary` and `frameFilePurity` must pass with no row added.
- [x] **Step 10:** Commit `feat(zoa): form the zoneOfAvoidance Layer and compose it`.

## Task 4: Prose and README sweep

Controller inline. **Pass/orchestration files declare ONLY their one export** (no code change here; do not add any).

**Files:** `src/layers/README.md`, `src/@types/engine/frame/UpsamplePassRow.d.ts`, `src/services/engine/frame/passes/createUpsamplePass.ts`, `src/components/containers/SgrAStarLensingTuningSectionContainer.tsx`, `src/components/DebugPanel/SgrAStarLensingTuningSection.tsx`, `tests/services/engine/frame/runLabel3DProducers.test.ts` (header), `docs/BACKLOG.md` and the `docs/backlog/*.md` detail files that cite a moved path.

No test (prose only).

- [x] `src/layers/README.md`: the `targets?` row drops "Declared but NOT consumed yet — 05c wires it" and says the targets are appended after core's rows and allocated by core.
- [x] Re-point every old-path citation the Task 2/3 greps listed to the new path (`zoneOfAvoidanceUpsamplePass.ts:30-38` in `UpsamplePassRow.d.ts` / `createUpsamplePass.ts`; `ZoneOfAvoidanceTuningSection.tsx` in the two SgrAStar files; `LABEL_3D_PRODUCERS` in the `runLabel3DProducers` test header). Leave `docs/superpowers/**/completed/**` as history.
- [x] Final grep over `src tests tools docs` for every old path in the _Moved_ table: zero hits outside completed plans/specs.
- [ ] `npm test` → green. Commit `docs(zoa): re-point citations to the Layer`.

## Task 5: Manual smoke (user)

Not code. `/dev` in this worktree (run `/link-data` first if the sky is empty), then check against `main`:

- [ ] **Band renders**: the galactic-plane dust band draws at Local Group scale. It fades in on approach, recedes past its `zoneOfAvoidanceRecede` window, and does not pop.
- [ ] **Toggle in Labels & guides**: the "Zone of Avoidance" row is still there, and its position is unchanged (after Orbit trails, before Local Bubble). Toggling it fades the band **and** its lettering out and in together (one fade row drives both). The section's master tri-state checkbox still includes it.
- [ ] **Lettering**: the curved "Zone of Avoidance" caption renders full-res along the band, three repeats, legible and not blurred.
- [ ] **Debug tuning** (`d`): the Zone of Avoidance tuning section renders in the Layer group, between Flow tuning and Local Bubble tuning, which puts it above Milky Way tuning (the one intentional position change, user-approved). Its sliders and both colour pickers still drive the band and lettering live, and the copy button still emits the defaults.
- [ ] **Pick**: clicking the band still opens the ZoA InfoCard, with no Focus pill.
- [ ] **Resize**: resizing the window reallocates the `zoa` target with no GPU validation error, and the band stays aligned.

---

## Out of scope (deferred)

- **The label3DRenderer draw living in ZoA's `postBlit`.** Core's `label3DRenderer` is drawn only inside the Layer's upsample pass, so a second world-label producer (from another Layer) would draw only while ZoA is live. There is one producer today (§9(e) ruled no walk `order`), so this stays for now. It becomes live the day a second `labels.world` producer lands.
- ~~**A composition without ZoA.**~~ Fixed in `d4bea6d43`: the stub composition in `startLoop.test.ts` hit it, and `checkFrameOrder` now skips the target of a render line with no present pass, matching `expandFrameOrder`'s `draws` drop.
- **The label em-height/radius coupling** (the shrunk `docs/backlog/2026-08-17-zone-of-avoidance-shape-constants.md`). Task 1 lands the record and the object param (user ruling 2026-09-19); `LABEL_RADIUS_MPC` / `LABEL_EM_MPC` stay in the lettering producer, and the arc-angle em-height remains that item's scope.
- **The uniform Layer structure / declarative resource table** (parked). `create.ts` / `destroy.ts` follow localBubble exactly.
- **Stays-core tables** listed in the inventory (InfoCard, focus, halo, URL, `FadeId`/visibility vocabulary, `FRAME_ORDER`).

## Definition of Done

- [ ] `src/layers/zoneOfAvoidance/` holds the renderer, both pass factories, the liveness gate and opacity, the lettering producer, the selection row, the fade row, the source entry + rows, the settings tuple, the Labels & guides row and the Debug tuning section + container. `layer.ts` declares the `zoa` target inline.
- [ ] `EngineGpuHandles` has no `zoneOfAvoidanceRenderer` / `zoneOfAvoidanceUpsample` field, and `grep -rn "zoneOfAvoidanceRenderer\|zoneOfAvoidanceUpsample" src/services` returns only prose.
- [ ] `src/services/engine/presentation/label3DProducers.ts` is deleted. `state.label3DProducers` is composed from Layers alone.
- [ ] `renderTargetRows` has no `zoa` row, and the target is allocated from `zoneOfAvoidanceLayer.targets` (`frameOrderBoot.test.ts` green).
- [ ] `LabelsAndGuidesSectionContainer` no longer names ZoA, and the row reaches it only through `ui`. `DebugPanel.tsx` no longer imports a ZoA section.
- [ ] `ZONE_OF_AVOIDANCE_SHELL` lives in `src/data/zoneOfAvoidance/` and reaches the renderer as one `ZoneOfAvoidanceShell` object (no positional shell args remain). The `frameFilePurity` ZoA row is gone and no row was added. `layerImportBoundary` is unchanged or smaller.
- [ ] `INITIAL_SETTINGS` is deep-equal to `main`'s (dump both trees and compare). Key order may move.
- [ ] Manual smoke attested (Task 5), including the DebugPanel's new ZoA tuning position.
- [ ] Landing-diff breakdown reported: src code / src comment / test code / test comment / docs.
