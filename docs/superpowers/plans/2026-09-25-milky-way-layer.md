# milkyWay Layer — v1 port Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Grow `src/layers/milkyWay/` from its settings-only stub into the Layer that owns the v1 sprite Milky Way, with no visible change except the accepted label tiebreak.

**Architecture:** This is a behaviour-neutral move from core into Layer seams that already exist. There is no ground prep; see spec §2. Five tasks:
- Task 1 unpins one constant that the galaxy tool imports.
- Task 2 forms the Layer's render half: runtime, target, planner, passes.
- Task 3 moves the presentation half: fades, label, selection, source row.
- Task 4 moves the UI and the tier saga.
- Task 5 closes the docs.

`zoneOfAvoidance` is the template for every member (`src/layers/zoneOfAvoidance/layer.ts`). `flow`'s `flowPlanner` is the template for the planner (`src/layers/flow/frame.ts`).

**Tech Stack:** TS, RTK slices and sagas, React (DebugPanel, InfoCard), Vitest, WebGPU pass files. No shader changes.

**Spec:** `docs/superpowers/specs/2026-09-25-milky-way-layer-design.md`. It has §2 (verdict table), §3 (folder and the placement rule), §4 (what stays in core), §5 (the two accepted behaviour changes), §6 (deletions), §7 (testing) and §8 (docs). Its parent is `docs/superpowers/specs/2026-09-09-layer-composition-design.md`. The deferred v2 work is `docs/backlog/2026-09-25-milky-way-v2-field-in-layer.md`, and nothing in it is pre-built here.

## Global Constraints

- **Behaviour.** Everything is pixel-identical except spec §5:
  - the Milky Way label now registers after core producers, so it loses equal-prominence ties to `structureLabels`;
  - the star-count reconcile runs at plan time instead of at `runFrame.ts:101`.
- **Keys and names.** The keys `{kind:'milkyWay'}`, `milkyWayDisk` and `milkyWayLabel` stay unchanged, because tours and clips script them. The pass names `milky-way-aggregate`, `milky-way-upsample` and `milky-way` also stay unchanged. The `mw-aggregate` target id stays unchanged.
- **Placement rule (spec §3).** A file moves into the Layer only if every remaining importer is inside the Layer or under `tests/`. Check this with `npm run refactor -- refs <file>` before each move.
  - Files that stay put: `galaxyGenerator/v1/**`, `milkyWayFadeAlpha`, `milkyWayVisible`, `data/milkyWay/milkyWayInfo.ts`, the settings types under `src/@types/settings/`, and all shaders.
  - `milkyWayLabelVisibility` and `milkyWayLabelStyle` move only if the refs check passes.
- **Core per-kind arms stay in core (spec §4).** Do not try to move the `FadeId`/visibility unions, the selection per-kind records, the label home, the `FRAME_ORDER` lines or `passGroupTitles`.
- **One commit per task, in the order below.** Adjacent findings go to `docs/backlog/`, never into a task.
- **Pass files.** `passes/` and every `src/services/engine/frame/**` file export only the one symbol they are named for (`tests/services/engine/frame/frameFilePurity.test.ts`).
- **Code conventions.** One symbol per file in `utils/` and `@types/`. Use `type` aliases, never `interface`. Use deep relative imports and no barrels. The Layer's own types live in `src/layers/milkyWay/@types/*.d.ts`.
- **Comment budget.** A module header is at most 10 lines, and comment lines are at most half the code lines. Every header a task makes false (a moved file's "core" wording, `slices.ts`'s "settings-only") is rewritten in that task.
- **Moving files.** Use `npm run move-files -- <from> <to>` (`--dry` first). Afterwards, grep for the old path, because `?static`, `.wesl` `package::` and string-literal paths are the tool's blind spots. Never use `git mv` with hand-edited imports.
- **Boundary ratchets** stay green with no new allow-list rows: `tests/conventions/layerImportBoundary.test.ts`, `layerStateShape.test.ts` and `oneSymbolPerFile.test.ts`. Task 4 deletes one existing row.
- **Formatting and commits.** Format with `npx prettier --write <touched files>`, never `npm run format`. Commit messages carry no `Co-Authored-By` trailer. `npm run dev` stays running.
- **Perf gate:** none, per spec §7 (the draw is unchanged). The deletion audit runs once, at `/feature-done`.

## Review Focus

1. **A tier change must still re-seed `starCount`, and the cloud must regenerate on that frame.** The re-seed now comes from a Layer saga, and the reconcile now runs from a planner. Task 4's saga test pins the put. Task 2's planner test pins that the reconcile reads the live `starCount`.
2. **Turning `milkyWay.enabled` off, then on, must still fade the disc out and in**, and the boot seed must still honour a saved `enabled: false`. The fade rows move in Task 3. The existing `fadeLayers` assertions move with them and must keep the seed/intent pair.
3. **Clicking the Milky Way must still open its InfoCard, and the `#focus=milkyWay` deep link must still focus it.** Pick moves with the passes (Task 2), the selection row moves in Task 3, and the card moves in Task 4. The moved `InfoCard.milkyWay` test and the selection-row test cover this.
4. **The star count must still regenerate when the Milky Way is disabled.** Today's reconcile is unconditional (`runFrame.ts:101`). The planner must not gate it on `enabled`, or re-enabling after a tier change would draw a stale cloud for one frame. Task 2 pins this with a test.
5. **Teardown (HMR, `destroy`) must release all four handles.** Before this change, core's handle registry freed them. Task 2's `destroy` must free exactly what `create` built.

---

### Task 1: The cloud uniform size lives in `src/data`

Behaviour-neutral. The galaxy tool imports `MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE` from `milkyWayCloudRenderer.ts`:
- `tools/galaxy-renderer/src/engine/sprites/createCloudPipelines.ts:13`
- `tools/galaxy-renderer/src/engine/sprites/packCloudUniforms.ts:50`

Moving the constant out of the renderer file lets Task 2 move the renderer into the Layer without the tool importing from `src/layers/`.

**Files:**
- Create: `src/data/milkyWay/milkyWayCloudUniformBufferSize.ts` (exports `MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE`)
- Modify: `src/services/gpu/renderers/milkyWay/milkyWayCloudRenderer.ts`, where the constant and its derivation comment leave, and the renderer imports it. Also modify the two tool files and `tools/galaxy-renderer/vite.config.ts:51` (comment only).

- [ ] Extract with `npm run refactor -- extract` (see `.claude/skills/refactor/SKILL.md`), keeping the byte-layout comment beside the constant. Read the current derivation at the top of `milkyWayCloudRenderer.ts` for it; `sprites/io.wesl:35-47` says 208 B.
- [ ] No new test: the compiler rejects a stale import, and the value itself is unchanged.
- [ ] Run `npm run typecheck` (both the src and tools projects) and confirm it's green.
- [ ] Commit: `refactor(milky-way): the cloud uniform size lives in src/data`.

---

### Task 2: The Layer owns the cloud, its target and its passes

**review: yes** (frame order/planner placement; GPU handle lifecycle moves out of the core registry)

This task forms `src/layers/milkyWay/` as a registered Layer. The four GPU handles leave core's registry for the Layer runtime. The `mw-aggregate` row leaves core's target table for `Layer.targets`. The reconcile leaves `runFrame` for a once planner. The three passes and their liveness gate move into the Layer.

**Files:**
- Create:
  - `src/layers/milkyWay/layer.ts`, `create.ts`, `destroy.ts`, `frame.ts`
  - `src/layers/milkyWay/@types/MilkyWayRuntime.d.ts`
  - `src/layers/milkyWay/render/milkyWayAggregateTarget.ts`
- Move (with `npm run move-files`):
  - `src/services/engine/frame/passes/{milkyWayAggregatePass,milkyWayUpsamplePass,milkyWayPass}.ts` → `src/layers/milkyWay/passes/`
  - `src/services/engine/frame/milkyWayCloudLiveness.ts` → `src/layers/milkyWay/present/milkyWayCloudLiveness.ts`
  - `src/services/gpu/renderers/milkyWay/{milkyWayCloudRenderer,milkyWayPickRenderer}.ts` → `src/layers/milkyWay/render/`
  - Also move `src/@types/rendering/MilkyWayCloudRenderer.d.ts` into the Layer's `@types/`, but only if the refs check shows no core reader remains.
- Modify:
  - `src/compositions/app.ts`: add `milkyWayLayer` to `layers` and to the `satisfies` tuple. Place it after `starCatalogLayer`, since order only matters for label registration (§5).
  - `src/services/engine/frame/passes/index.ts:9-11,44-46`: delete the three entries.
  - `src/services/engine/gpuHandles/gpuHandleRegistry.ts:180-213`: delete four rows, and their now-unused imports.
  - `src/services/engine/engine.ts:161,188-192`: delete four null seeds.
  - `src/@types/engine/handles/EngineGpuHandles.d.ts`: delete four fields.
  - `src/services/gpu/renderTargets.ts:150-156`: the row leaves; rewrite the header sentence at `:48`.
  - `src/services/engine/frame/runFrame.ts:101`: delete.
  - `src/data/rendering/frameSections.ts:18-21`: add `{ kind: 'plan', name: 'milky-way' }` among the once plan lines.
  - `src/layers/milkyWay/state/slices.ts`: rewrite the header.
  - Each moved pass: the `state.gpu.milkyWay*` reads become `runtime.*`, and the pass becomes a `(runtime) => ContentPass` factory, following `zoneOfAvoidancePass`.
- Test:
  - Move `tests/services/engine/frame/passes/milkyWayPass.test.ts`, `tests/services/engine/frame/milkyWayCloudLiveness.test.ts` and the MW cases of `createUpsamplePass.test.ts` along with their files.
  - Update the fixtures in `renderFrame.test.ts`, `renderFrame.timing.test.ts`, `runFrame.test.ts:~880-910`, `passes/passes.test.ts`, `phases/bootstrap.test.ts:53-71`, `initGpu.hdrCapabilityWiring.test.ts`, `wireInput.test.ts:349`, `visual/renderFrameSplitBaseline.test.ts`, `helpers/camera/makeCameraSimHarness.ts`, `renderTargets.test.ts:40-67,124-129,245,354-357`, `gpuHandleRegistry.test.ts` and `frameFilePurity.test.ts:46,62`.
  - `bootstrap.test.ts` uses `milkyWayCloudRenderer` as its sample handle: switch it to another core handle, such as `horizonShellRenderer`.
  - New: `tests/layers/milkyWay/frame.test.ts`.

**Interfaces:**

```ts
// src/layers/milkyWay/@types/MilkyWayRuntime.d.ts — non-null throughout; `create` builds all four.
export type MilkyWayRuntime = {
  readonly cloud: MilkyWayCloud;                  // src/@types/galaxy/MilkyWayCloud.d.ts
  readonly cloudRenderer: MilkyWayCloudRenderer;
  readonly pickRenderer: MilkyWayPickRenderer;
  readonly aggregateUpsample: AdditiveUpsample;
};

// src/layers/milkyWay/render/milkyWayAggregateTarget.ts — the row moved verbatim from renderTargets.ts:150-156
export const MILKY_WAY_AGGREGATE_TARGET: RenderTargetSpec; // id 'mw-aggregate', scale: (s) => s.settings.milkyWay.aggregateDivisor

// src/layers/milkyWay/frame.ts — once planner; name matches the new FRAME_ORDER plan line
export function milkyWayPlanner(runtime: MilkyWayRuntime): Extract<FrameContentPlanner<void>, { scope: 'once' }>;
// plan: runtime.cloud.reconcile(state.settings.milkyWay.starCount), UNCONDITIONAL (Review Focus 4);
// returns { value: undefined, awake: false, settling: false }. The cloud regenerates synchronously
// and animates nothing, so it has no wake vote.
```

- `create(deps)` builds the four handles exactly as the deleted registry rows did (`gpuHandleRegistry.ts:180-213`). That includes `createMilkyWayCloud(device, MILKY_WAY_TUNING_DEFAULTS.starCount)`; keep that row's comment explaining why it reads the default and not the setting. `destroy(runtime)` releases each handle the way core's teardown did. Read what `GPU_HANDLE_ROWS` teardown calls on these four (see `GpuHandleRow.d.ts`) and do the same.
- `passes: (runtime) => [milkyWayAggregatePass(runtime), milkyWayUpsamplePass(runtime), milkyWayPass(runtime)]`. The upsample stays a `createUpsamplePass({ handleOf: () => runtime.aggregateUpsample, … })` call, as in `src/layers/starCatalog/passes/starAggregateUpsamplePass.ts`.
- The `FRAME_ORDER` lines for the three passes (`frameSections.ts:138,175-176`) and `passGroupTitles.ts:22` stay unchanged. Their header comments name the passes, not the files, so they need no edit.
- Tests worth writing (`tests/layers/milkyWay/frame.test.ts`, with a stub cloud recording `reconcile` calls):
  - `it('reconciles the cloud against the live starCount')`: the plan passes `settings.milkyWay.starCount`.
  - `it('reconciles even while the Milky Way is disabled')`: with `enabled: false` it still calls `reconcile` (Review Focus 4).
- No other new test. Boot-time pass-name uniqueness (`createLayers`) and the frame-order walker catch a half-migrated pass or a missing plan line, and every moved test keeps its assertions.

- [ ] Run `npm run move-files -- --dry` for each move, then run the moves. Grep for the old paths afterwards.
- [ ] Add the runtime type, `create`/`destroy`, the target row, the planner, `layer.ts` (name, settings, targets, create, destroy, planners, passes) and the `APP_COMPOSITION` entry.
- [ ] Delete the core rows, seeds, fields, target row, `runFrame` line and `CONTENT_PASSES` entries. Add the plan line.
- [ ] Update the fixtures and write the two planner tests.
- [ ] Run `npm run typecheck:fast && npx vitest run tests/layers/milkyWay tests/services/engine tests/services/gpu tests/visual tests/conventions` and confirm it's green.
- [ ] Commit: `refactor(milky-way): the Layer owns the cloud, its target and its passes`.

---

### Task 3: The Layer declares its fades, label, selection and source row

Behaviour-neutral, except for the accepted label tiebreak (spec §5.1).

**Files:**
- Create: `src/layers/milkyWay/present/milkyWayFadeRows.ts`, holding the two rows moved verbatim from `src/services/engine/wiring/fadeLayers.ts:27-31,46-50`. It is shaped like `src/layers/zoneOfAvoidance/present/zoneOfAvoidanceFadeRows.ts`.
- Move (with `npm run move-files`):
  - `src/services/engine/presentation/produceMilkyWayLabel.ts` → `src/layers/milkyWay/present/`
  - `src/services/engine/selection/milkyWaySelectionRow.ts` → `src/layers/milkyWay/present/`
  - `src/data/sources/milky-way.ts` → `src/layers/milkyWay/sources/milky-way.ts`, plus a new `sources/milkyWaySourceRows.ts` shaped like `zoneOfAvoidanceSourceRows.ts`
  - `milkyWayLabelVisibility.ts` and `milkyWayLabelStyle.ts` → `src/layers/milkyWay/present/`, only if `npm run refactor -- refs` shows no remaining core reader
- Modify:
  - `src/services/engine/wiring/fadeLayers.ts`: two rows leave.
  - `src/services/engine/engine.ts:30,330-333`: the `cosmoLabelDirector` registration leaves.
  - `src/services/engine/selection/coreSelectionRows.ts:9,15`.
  - `src/data/sources.ts:24,72`: import the entry from the Layer, the same way ZoA and starCatalog do at `:30-31,82,85`.
  - `src/layers/milkyWay/layer.ts`: add `sources`, `fades`, `guides: () => ({ screenLabels: [{ slab: COSMO, id: 'milkyWayLabel', produceLabels: produceMilkyWayLabel }] })` and `selection: () => [milkyWaySelectionRow()]`. Copy the `screenLabels` row shape from `src/layers/galaxyCatalog/layer.ts`'s `famousLabels`.
- Test:
  - Move `tests/services/engine/presentation/produceMilkyWayLabel.test.ts`.
  - Move the MW cases of `tests/services/engine/wiring/fadeLayers.test.ts:64-172` to `tests/layers/milkyWay/present/milkyWayFadeRows.test.ts`, keeping the seed/intent assertions (Review Focus 2).
  - Update `tests/services/engine/selection/coreSelectionRows.test.ts:13` to `['body','structure']`.
  - Check `composeSelectionRows.test.ts` and `createLayers.composition.test.ts`: if they assert a Layer-supplied `milkyWay` row, fixtures only.

- The `FadeId`, `VisibilityLayerKey`, `LabelLayerId`, `fadeRegistry.ts:72`, `visibilityLayerRows.ts`, `visibilityActionRow.ts`, `scopedVisibilityActions.ts` and `fadeIdToVisibilityKey.ts` arms stay unchanged (spec §4).
- The `milkyWay` selection per-kind records (`refOf`, `buildFocusable`, `targetIdentityKey`, `selectionHaloTable`, `rowFocusable`, `urlHashFor`, `focusFraming`, palette) stay unchanged too.
- No new test: the moved tests keep their assertions, and `createLayers` throws on a duplicated label id or selection row.

- [ ] Do the moves (`--dry` first) and create the fade-row and source-row files. Grep for the old paths.
- [ ] Delete the core rows and the registration, and add the four `layer.ts` members.
- [ ] Update the tests as listed.
- [ ] Run `npm run typecheck:fast && npx vitest run tests/layers/milkyWay tests/services/engine/wiring tests/services/engine/selection tests/services/engine/presentation tests/data tests/conventions` and confirm it's green.
- [ ] Commit: `refactor(milky-way): the Layer declares its fades, label, selection and source row`.

---

### Task 4: The Layer owns its DebugPanel section, detail cards and tier re-seed

**review: yes** (saga moves out of `watchTierSaga`)

Behaviour-neutral.

**Files:**
- Move (with `npm run move-files`):
  - `src/components/DebugPanel/MilkyWayTuningSection.tsx` and `src/components/containers/MilkyWayTuningSectionContainer.tsx` → `src/layers/milkyWay/ui/`
  - `src/components/InfoCard/MilkyWayDetailCard/` and `src/components/InfoCard/CompactMilkyWayCard/` (folders, `.module.css` included) → `src/layers/milkyWay/ui/`
- Create: `src/layers/milkyWay/sagas/reseedMilkyWayStarCountSaga.ts`
- Modify:
  - `src/components/DebugPanel/DebugPanel.tsx:27,76`: the section leaves. It re-enters through the Layer `debug` slot; check the Layer block at `:73` keeps the section order.
  - `src/components/InfoCard/detailCardTable.ts:75`: `CORE_DETAIL_CARDS.milkyWay` leaves.
  - `src/state/tier/watchTierSaga.ts:15,42-44,71`: the MW put, its imports and the header sentence leave.
  - `tests/conventions/layerImportBoundary.test.ts:89-95`: delete the `'state/tier/watchTierSaga': 1` row. The row's own comment asks for exactly this.
  - `src/layers/milkyWay/layer.ts`: add `sagas: [reseedMilkyWayStarCountSaga]` and three `ui` entries — `{ slot: 'debug', content: MilkyWayTuningSectionContainer }` and the `detailCard` entry with `Detail`/`Compact`. Shape these like ZoA's at `src/layers/zoneOfAvoidance/layer.ts`, and keep the MW card's `onFocus` wiring from `detailCardTable.ts:75`.
- Test:
  - Move `tests/components/InfoCard/InfoCard.milkyWay.test.ts`.
  - Update `tests/utils/infoCard/detailCardFor.test.ts` if it pins the core table.
  - Move the re-seed half of `tests/state/tier/watchTierSaga.test.ts:45,123-133` to `tests/layers/milkyWay/sagas/reseedMilkyWayStarCountSaga.test.ts`.

**Interfaces:**

```ts
// src/layers/milkyWay/sagas/reseedMilkyWayStarCountSaga.ts — a SagaFactory
// (src/@types/engine/layer/SagaFactory.d.ts): takeEvery(setTier) → put(setMilkyWayTuning({ starCount: MILKY_WAY_STARS_PER_TIER[tier] }))
export function reseedMilkyWayStarCountSaga(): SagaGenerator<void>;
```

- Import `setTier` from wherever `watchTierSaga` takes it today. The saga lives under `sagas/`, which `layerImportBoundary` permits to import `src/state`.
- Tests worth writing (moved, not new):
  - `it('re-seeds starCount from MILKY_WAY_STARS_PER_TIER on every tier change')`, for each tier.
  - `watchTierSaga.test.ts` keeps only its galaxy-focus re-anchor cases, and asserts it no longer puts `setMilkyWayTuning`.
- The label toggle stays in core's label-category registry (`LABEL_HOME_BY_SOURCE_TYPE.milkyWay`, `LabelsAndGuidesSectionContainer.tsx:60,86`), per spec §4. Do not add a `labelsAndGuides` slot.

- [ ] Do the moves (`--dry` first, since these are folders) and grep for the old paths, including the `.module.css` imports.
- [ ] Write the saga, add the `layer.ts` members, and delete the core sites and the allow-row.
- [ ] Update the tests as listed.
- [ ] Run `npm run typecheck:fast && npx vitest run tests/layers/milkyWay tests/state/tier tests/components tests/utils/infoCard tests/conventions` and confirm it's green.
- [ ] Commit: `refactor(milky-way): the Layer owns its DebugPanel section, detail cards and tier re-seed`.

---

### Task 5: Docs say `milkyWay` is formed

**Files:** `src/layers/README.md` (Status paragraph), `docs/RENDERER.md` (any path to the three passes, the target or the two renderers), `src/services/engine/galaxyGenerator/v1/README.md` ("Flow (app side)": the handles are built in `src/layers/milkyWay/create.ts`, not `initGpu.ts`).

- [ ] Search `docs/` and `src/**/README.md` for the old paths (`frame/passes/milkyWay`, `renderers/milkyWay/milkyWayCloud`, `milkyWayCloudLiveness`, `produceMilkyWayLabel`, `milkyWaySelectionRow`) and fix every live reference. Leave `docs/**/completed/` and `docs/research/**` history alone.
- [ ] No test.
- [ ] Commit: `docs(milky-way): the milkyWay Layer is formed`.

---

## Definition of Done

- **What must exist:**
  - `src/layers/milkyWay/` has `layer.ts` with the members settings, sources, targets, create, destroy, planners, passes, fades, guides, selection, sagas and ui.
  - `MilkyWayRuntime` is defined.
  - `milkyWayPlanner` and the `{ kind: 'plan', name: 'milky-way' }` line are in place.
  - `MILKY_WAY_AGGREGATE_TARGET` and `reseedMilkyWayStarCountSaga` exist.
  - `MILKY_WAY_CLOUD_UNIFORM_BUFFER_SIZE` lives in `src/data/milkyWay/`.
  - `milkyWayLayer` is in `APP_COMPOSITION`.
- **What must be gone from core:**
  - the four `EngineGpuHandles` MW fields;
  - `runFrame.ts`'s reconcile line;
  - three `CONTENT_PASSES` entries;
  - the core `mw-aggregate` row;
  - two `FADE_LAYERS` rows;
  - `coreSelectionRows`' `milkyWay`;
  - `CORE_DETAIL_CARDS.milkyWay`;
  - `DebugPanel.tsx`'s MW section;
  - the `cosmoLabelDirector` MW registration;
  - `watchTierSaga`'s MW put and its allow-row.
- **Smoke (user eye-check, on the dev server):**
  - the Milky Way looks the same at boot;
  - the approach fade still runs on the way in to the Galactic Centre;
  - toggling the Milky Way off and on fades it out and in;
  - clicking the disc opens the MW InfoCard, and Focus frames it;
  - the `#focus=milkyWay` deep link focuses it;
  - the DebugPanel MW tuning sliders still move the cloud;
  - a tier change re-seeds the star count (the DebugPanel `starCount` value changes);
  - the label shows, and its tiebreak against structure labels is acceptable.
- **Out of scope:** the v2 analytic field and any seam for it (`docs/backlog/2026-09-25-milky-way-v2-field-in-layer.md`), splitting `MilkyWayTuning`, moving the core per-kind arms listed in spec §4, and the label-home registry.
