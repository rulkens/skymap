# Layer composition 05c prep — the three joints `zoneOfAvoidance` needs Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task, under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the joints the `zoneOfAvoidance` Layer would otherwise bolt on: a Layer can put a row in a shared settings section, contribute a world-space label producer, and declare a render target that core actually allocates. A shared duplicate-key merge helper lands first, because the render-target merge would otherwise be the fifth hand-written copy of the same guard.

**Architecture:** Four contract changes, sequenced P0 → P3 and each one task (P1 is two). P0 extracts the "concat, throw on a duplicate key" guard `createLayers` hand-writes into one `src/utils/` helper. P1 replaces `LayerUi { settings, debug }` with an entry list typed by one slot map, so a Layer can contribute a data row (`id`, `label`, `select`, `set`) to "Labels & guides" as well as whole sections. P2 splits `Layer.labels` into `screen` / `world` and composes the world half onto engine state beside core's `LABEL_3D_PRODUCERS`. P3 makes `createRenderTargets` take its rows from its caller, so the `renderTargets` handle row can merge every Layer's static `targets` (seeded on state by `createEngine`) into core's. No Layer uses the new slot, the world half or `targets` in this PR. ZoA takes all three in the next PR, and tests cover each joint with a stub.

**Tech Stack:** TS, React, RTK (`useAppSelector`), WebGPU render-target allocation, `defineLayer` / `instantiateLayer` / `createLayers`.

**Spec:** `docs/superpowers/specs/2026-09-09-layer-composition-design.md` §9 subsection "(e) 05c `zoneOfAvoidance`: contract prep" (lines ~1269–1287). The P0–P3 table there is this plan's whole scope.

**Depends on:** nothing unlanded. Branches off `main` at `a88b363af`. This is the **prep PR**. The ZoA Layer PR stacks on it.

**Execution (lean SDD):** three grouped dispatches, one worktree, one commit per task:

| Dispatch | Tasks              | Why grouped                                                                                                 |
| -------- | ------------------ | ----------------------------------------------------------------------------------------------------------- |
| D1       | Task 1 (P0)        | `createLayers` plus one util. Small enough for the controller to do inline (< ~50 lines)                    |
| D2       | Tasks 2–3 (P1)     | One mental model: the Layer UI entry list and the three panels that read it                                 |
| D3       | Tasks 4–5 (P2, P3) | Engine composition: `createLayers` / `createEngine` seed / frame walk. Both consume P0 or its neighbourhood |

Task 6 is the user's manual smoke. One whole-branch review at the end. CI is the gate.

## Global Constraints

- `type` aliases, never `interface`. **One symbol per file in `utils/` and `@types/`**; filename = symbol. Types never live inline in implementation files (a React component's own `Props` is the one exception).
- Comments: module header ≤ 5 lines, comment lines ≤ half the code lines. Explain WHY, never WHAT. When a guard moves into the P0 helper, the WHY comment at its call site stays (e.g. `createLayers.ts:119-122`) and only the loop goes.
- **Frame files declare only their own symbol.** `src/services/engine/frame/**` (incl. `runLabel3DProducers.ts`) exports the one symbol it is named for and nothing else. Helpers go to `src/utils/` or `src/services/engine/layer/`. The `tests/services/engine/frame/frameFilePurity.test.ts` ratchet only ever shrinks.
- Never `git add -A`. Stage by path.
- Run `npm run build`, not only typecheck, before the last commit of each dispatch. `tsc` cannot see `?static` shader specifiers, and the layers these tasks touch import passes that use them.
- **Prep PR: no `deletion-audit`** (standing ruling). **Behaviour-neutral:** nothing visible changes. Settings, Debug, labels and resize must all behave exactly as on `main`.
- Ratchets unchanged or smaller: `tests/conventions/layerImportBoundary.test.ts`, `frameFilePurity`.
- TS moves (none planned) would go through `npm run move-files`, never `git mv`.

---

## File Structure

### Created

| File                                                              | Responsibility                                                                                                           |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| `src/utils/object/concatUniqueRows.ts`                            | P0 — concat row lists; throw naming table + key on a duplicate.                                                          |
| `src/@types/engine/layer/LayerUiSlots.d.ts`                       | P1 — slot name → content type map.                                                                                       |
| `src/@types/engine/layer/LayerUiEntry.d.ts`                       | P1 — `{ slot, content }` union derived from the map.                                                                     |
| `src/@types/engine/layer/LayerSettingsRow.d.ts`                   | P1 — a data row in a shared settings section.                                                                            |
| `src/utils/layer/layerUiContents.ts`                              | P1 — one slot's contents across a composition, in order.                                                                 |
| `src/@types/engine/layer/LayerLabels.d.ts`                        | P2 — `{ screen?, world? }`.                                                                                              |
| `src/services/engine/layer/composeRenderTargetRows.ts`            | P3 — core rows + every Layer's `targets`, via P0. Shared by the `renderTargets` handle row and `frameOrderBoot.test.ts`. |
| tests mirroring each of the above that earns one (named per task) |                                                                                                                          |

### Deleted

| File                                   | Why                                 |
| -------------------------------------- | ----------------------------------- |
| `src/@types/engine/layer/LayerUi.d.ts` | Dissolved into `LayerUiEntry` (P1). |

### Modified (by task)

| File                                                                                              | Task    |
| ------------------------------------------------------------------------------------------------- | ------- |
| `src/services/engine/phases/createLayers.ts`                                                      | 1, 4    |
| `src/@types/engine/layer/Layer.d.ts`                                                              | 2, 4, 5 |
| `src/@types/engine/layer/LayerUiSection.d.ts` (doc only: no longer "SettingsPanel section")       | 2       |
| `src/components/SettingsPanel/SettingsPanel.tsx`                                                  | 2, 3    |
| `src/components/DebugPanel/DebugPanel.tsx`                                                        | 2       |
| `src/components/containers/LabelsAndGuidesSectionContainer.tsx`                                   | 3       |
| `src/layers/galaxyCatalog/layer.ts`                                                               | 2, 4    |
| `src/layers/flow/layer.ts`                                                                        | 2       |
| `src/@types/engine/layer/LayerInstance.d.ts`, `src/services/engine/layer/instantiateLayer.ts`     | 4       |
| `src/@types/engine/state/EngineState.d.ts`, `src/services/engine/engine.ts`                       | 4       |
| `src/services/engine/frame/runLabel3DProducers.ts`                                                | 4       |
| `src/services/engine/presentation/label3DProducers.ts` (header only: "core's half")               | 4       |
| `src/services/gpu/renderTargets.ts`                                                               | 5       |
| `src/services/engine/gpuHandles/gpuHandleRegistry.ts` (`renderTargets` row, ~:95)                 | 5       |
| `src/@types/engine/state/EngineState.d.ts`, `src/services/engine/engine.ts` (`layerTargets` seed) | 5       |
| `tests/services/engine/frame/frameOrderBoot.test.ts`, `tests/services/gpu/renderTargets.test.ts`  | 5       |

---

## Contract: P0 — `concatUniqueRows`

```ts
// src/utils/object/concatUniqueRows.ts
export function concatUniqueRows<Row>(
  table: string,
  keyOf: (row: Row) => string,
  lists: readonly (readonly Row[])[],
): readonly Row[];
// throws: new Error(`${table}: two rows share the key '${key}'`)
```

Rows keep their order: lists in order, then rows within each list. A duplicate counts whether it sits within one list or across two.

**Site audit (the spec counts four hand-written guards):**

| Site                                            | Fits?                             | Action                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        |
| ----------------------------------------------- | --------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `createLayers.ts:123-132` passes by `name`      | yes                               | `state.passes = concatUniqueRows('createLayers: passes', (p) => p.name, [CONTENT_PASSES, ...instances.map((i) => i.passes)])`                                                                                                                                                                                                                                                                                                                                                                                                                                                                 |
| `createLayers.ts:133-143` computes by `name`    | yes                               | same shape, table `'createLayers: compute rows'`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| `createLayers.ts:152-164` asset keys            | **yes, with three stated deltas** | Merge `[ASSET_WIRING, ...instances.map((i) => i.assets)]` by `String(row.key)` **before** `expandCompanionRows`, and drop `coreAssetKeys` and the in-loop throw. (1) Core rows are now checked against each other too. `ASSET_WIRING` has 39 rows and 39 distinct keys today (checked 2026-09-19), so nothing changes. (2) The throw fires before any Layer slot factory runs, not midway. Boot fails either way. (3) The message names the key but no longer names the minting Layer. Table `'createLayers: asset keys'`. The loop keeps minting slots into `layerSlots`, without the check. |
| `composeSelectionRows.ts:36-42` focus-id claims | **no**                            | This is not a merge. It runs per resolution and counts which rows' `claims(focusId)` predicate accepts one id, and there is no row key to dedupe on. **Leave it.** `assertSelectionRowsDisjoint` is also left: its `pickSources` check is many keys per row, and splitting the `type` half out would complicate things for no gain.                                                                                                                                                                                                                                                           |

So P0 replaces three sites, and P3 is the helper's fourth caller.

## Contract: P1 — `Layer.ui` as an entry list

```ts
// src/@types/engine/layer/LayerSettingsRow.d.ts
import type { UnknownAction } from '@reduxjs/toolkit';
import type { RootState } from '../../../store/types';
export type LayerSettingsRow = {
  readonly id: string;     // checkbox element id, as SectionRow.id
  readonly label: string;
  readonly select: (state: RootState) => boolean;
  readonly set: (enabled: boolean) => UnknownAction;
};

// src/@types/engine/layer/LayerUiSlots.d.ts
export type LayerUiSlots = {
  main: LayerUiSection;
  debug: LayerUiSection;
  labelsAndGuides: LayerSettingsRow;
};

// src/@types/engine/layer/LayerUiEntry.d.ts
export type LayerUiEntry = {
  [K in keyof LayerUiSlots]: { readonly slot: K; readonly content: LayerUiSlots[K] };
}[keyof LayerUiSlots];

// Layer.d.ts
readonly ui?: readonly LayerUiEntry[];

// src/utils/layer/layerUiContents.ts
export function layerUiContents<K extends keyof LayerUiSlots>(
  layers: readonly Layer<string, unknown>[],
  slot: K,
): readonly LayerUiSlots[K][];
```

The row is DATA, not a component. `LabelsAndGuidesSection` derives its master tri-state from `SectionRow`s, so a Layer's row has to become a `SectionRow` inside the container. `@types/engine/layer/LayerCoreDeps.d.ts` already imports `store/types`, so `LayerSettingsRow` doing the same adds no new edge.

**Render positions (zero visible change):**

- `SettingsPanel`: `main` contents render exactly where `layer.ui?.settings` renders today (`SettingsPanel.tsx:43-46`), ahead of the core containers.
- `DebugPanel`: `debug` contents render exactly where `layer.ui?.debug` renders today (`DebugPanel.tsx:72-75`), between `RenderTogglesSectionContainer` and `MilkyWayTuningSectionContainer`.
- `LabelsAndGuidesSectionContainer`: takes a `layerRows: readonly LayerSettingsRow[]` prop, which `SettingsPanel` fills with `layerUiContents(APP_COMPOSITION.layers, 'labelsAndGuides')`. The container appends those rows **after** its own rows (after `toggle-zone-of-avoidance`). The values are read in ONE hook:

```ts
const layerValues = useAppSelector((s) => layerRows.map((row) => row.select(s)), shallowEqual);
```

`shallowEqual` comes from `react-redux`. The lint ban on that import covers `src/state/` only. Without it, the fresh array would re-render the section on every store write. A hook per row inside a loop is banned.

React keys for `main` / `debug` sections: use the index within `layerUiContents`' result. That list is fixed for the composition's lifetime, so index keys are stable.

`SettingsPanel` computes both lists at render time, not at module scope. `SettingsPanel.test.tsx` swaps `APP_COMPOSITION.layers` per test through `layersRef`, so module scope would freeze the first value.

## Contract: P2 — `Layer.labels` → `{ screen, world }`

```ts
// src/@types/engine/layer/LayerLabels.d.ts
export type LayerLabels = {
  readonly screen?: readonly Label2DProducer[];
  readonly world?: readonly Label3DProducer[];
};

// Layer.d.ts
labels?(runtime: Runtime): LayerLabels;

// LayerInstance.d.ts: `labels` is replaced by
readonly screenLabels: readonly Label2DProducer[];
readonly worldLabels: readonly Label3DProducer[];

// EngineState.d.ts
label3DProducers: readonly Label3DProducer[];   // engine.ts initialises []
```

`createLayers` sets `state.label3DProducers = [...LABEL_3D_PRODUCERS, ...instances.flatMap((i) => i.worldLabels)]`. That is core first, then Layers in tuple order. No dedupe: the spec rules none, and the next PR has a single producer. `runLabel3DProducers` walks `state.label3DProducers`, and its `LABEL_3D_PRODUCERS` import goes. `label3DProducers.ts` keeps ZoA's row as **core's half**, and the next PR moves that row out.

## Contract: P3 — Layer render targets allocated

```ts
// src/services/engine/layer/composeRenderTargetRows.ts
export function composeRenderTargetRows(
  swapFormat: GPUTextureFormat,
  layerTargets: readonly (readonly RenderTargetSpec[])[],
): readonly RenderTargetSpec[];
// = concatUniqueRows('render targets', (r) => r.id, [renderTargetRows(swapFormat), ...layerTargets])

// renderTargets.ts: `swapFormat` is replaced by `rows`, because the swap row already carries the format
export function createRenderTargets(
  device: GPUDevice,
  rows: readonly RenderTargetSpec[],
  size: Size,
  state: EngineState,
): RenderTargets;

// EngineState.d.ts
/** Every Layer's static `targets`, in tuple order — seeded by `createEngine`, read by the
 * `renderTargets` GPU-handle row, which runs before `createLayers`. */
readonly layerTargets: readonly (readonly RenderTargetSpec[])[];
```

`engine.ts` seeds `state.layerTargets = composition.layers.map((l) => l.targets ?? [])` where it builds the state — the same place it already seeds `selectionKindRows`. That works before `createLayers` because `targets` is static data on the Layer object. The `renderTargets` registry row already receives `state`, so it calls `createRenderTargets(deps.ctx.device, composeRenderTargetRows(deps.ctx.format, state.layerTargets), size, state)`. **`GpuHandleConstructDeps` is NOT touched** (user ruling 2026-09-19: no new field that `buildSwapRenderers`/`wireInput` would have to stub with throwing getters). `setSwapFormat` (`renderTargets.ts:538`) already maps over `specs` and rewrites only the `swap` row, so it keeps Layer rows unchanged. A test pins this. `Layer.targets`' doc comment drops "DECLARED BUT NOT CONSUMED — nothing reads this yet; 05c wires it." and becomes: appended after core's `renderTargetRows` by the `renderTargets` handle row; ids are globally unique, and a duplicate throws at boot.

`startLoop`'s `checkFrameOrder` already reads ids off `state.gpu.renderTargets.specs` (`startLoop.ts:32`), so Layer targets reach the boot check without further change.

---

## Task 1: P0 — one duplicate-key merge helper

**Files:** Create `src/utils/object/concatUniqueRows.ts`, `tests/utils/object/concatUniqueRows.test.ts`. Modify `src/services/engine/phases/createLayers.ts`.

- [x] Test `returns every row, lists in order then rows in order`. Passes resolve a `FRAME_ORDER` name to the FIRST match, so a reordering bug would change which pass draws.
- [x] Test `throws naming the table and the key on a duplicate across lists`, asserting the message is exactly `t: two rows share the key 'k'`.
- [x] Test `throws on a duplicate within one list`.
- [x] Implement per the P0 contract.
- [x] Replace the three `createLayers` sites per the site audit table. Keep each WHY comment above the call, and update it where the asset-key comment's reasoning about "`slotFor` consults the Layer one first" still applies.
- [x] Leave `composeSelectionRows.ts` and `assertSelectionRowsDisjoint` untouched (see audit).
- [x] The existing `rejects.toThrow(/dup-compute/)`, `/shared-asset/` and `/structureCatalog/` tests in `tests/services/engine/phases/createLayers*.test.ts` stay green unedited. They are the per-site wiring proof, so no new site test.
- [x] `npx vitest run tests/utils/object tests/services/engine/phases` → green. Commit.

## Task 2: P1 — `Layer.ui` becomes an entry list

**Files:** Create `LayerUiSlots.d.ts`, `LayerUiEntry.d.ts`, `LayerSettingsRow.d.ts` (all under `src/@types/engine/layer/`), `src/utils/layer/layerUiContents.ts`, `tests/utils/layer/layerUiContents.test.ts`. Delete `src/@types/engine/layer/LayerUi.d.ts`. Modify `Layer.d.ts`, `LayerUiSection.d.ts` (doc), `SettingsPanel.tsx`, `DebugPanel.tsx`, `src/layers/galaxyCatalog/layer.ts`, `src/layers/flow/layer.ts`, `tests/components/SettingsPanel/SettingsPanel.test.tsx` (stub shape only).

- [x] Test `layerUiContents keeps only the asked slot, in layer then entry order`: two stub Layers holding mixed `main` / `debug` / `labelsAndGuides` entries. A filter bug would render a debug section in the Settings panel, and no other test would catch it.
- [x] Add the three types and the helper per the P1 contract. `Layer.ui?: readonly LayerUiEntry[]`, and the doc comment names the three slots and where each renders.
- [x] Migrate: galaxyCatalog → `ui: [{ slot: 'main', content: GalaxiesSectionContainer }]`. flow → `[{ slot: 'main', content: FlowSectionContainer }, { slot: 'debug', content: FlowTuningSectionContainer }]`.
- [x] `SettingsPanel` / `DebugPanel` render `layerUiContents(..., 'main' | 'debug')` at the positions pinned above. Update `SettingsPanel.test.tsx`'s stub to `ui: [{ slot: 'main', content: … }]`. Its two D13 tests stay otherwise as they are.
- [x] Delete `LayerUi.d.ts`. `grep -rn "LayerUi\b" src tests` returns nothing.
- [x] `npx vitest run tests/utils/layer tests/components/SettingsPanel tests/components/DebugPanel` → green. Commit.

## Task 3: P1 — the `labelsAndGuides` slot reaches its section

**Files:** Modify `src/components/containers/LabelsAndGuidesSectionContainer.tsx`, `src/components/SettingsPanel/SettingsPanel.tsx`, `tests/components/containers/LabelsAndGuidesSectionContainer.test.ts`.

- [x] Test `appends a Layer settings row after the core guide rows`. Render the container with one stub `LayerSettingsRow` whose `select` / `set` are `selectZoneOfAvoidanceEnabled` / `setZoneOfAvoidanceEnabled` under a distinct `id` (e.g. `toggle-stub-layer`). Assert its checkbox comes after `toggle-zone-of-avoidance`.
- [x] Test `a Layer row reads its value from the store and dispatches its own action`. Toggle the stub checkbox, assert `selectZoneOfAvoidanceEnabled(store.getState())` flipped, and assert the stub checkbox's `checked` follows it.
- [x] Update existing renders of the container in that test file to pass `layerRows={[]}`.
- [x] Implement per the P1 contract: one `useAppSelector` + `shallowEqual`, and rows mapped to `SectionRow`s inside the existing `rows` memo. Add one clause to the module header naming the appended Layer rows. Keep the header within budget.
- [x] `SettingsPanel` passes `layerRows={layerUiContents(APP_COMPOSITION.layers, 'labelsAndGuides')}`. Today that is `[]`, so nothing visible changes.
- [x] `npx vitest run tests/components/containers/LabelsAndGuidesSectionContainer.test.ts tests/components/SettingsPanel` → green. Commit.

## Task 4: P2 — world-space labels from a Layer

**Files:** Create `src/@types/engine/layer/LayerLabels.d.ts`, `tests/services/engine/frame/runLabel3DProducers.test.ts`. Modify `Layer.d.ts`, `LayerInstance.d.ts`, `instantiateLayer.ts`, `createLayers.ts`, `EngineState.d.ts`, `engine.ts`, `src/services/engine/frame/runLabel3DProducers.ts`, `src/services/engine/presentation/label3DProducers.ts` (header), `src/layers/galaxyCatalog/layer.ts`, `tests/services/engine/phases/createLayers.composition.test.ts`, `tests/services/engine/layer/instantiateLayer.test.ts` (shape only), plus any test state builder the compiler flags for the new `EngineState` field.

- [x] Test (createLayers.composition) `composes Layer world label producers after core's onto state.label3DProducers`. Two stub Layers each return `{ world: [{ id: '<tag>-world', … }] }`. Assert ids equal `[...LABEL_3D_PRODUCERS.map((p) => p.id), 'a-world', 'b-world']`. Re-shape the existing `labels: () => [...]` stub to `{ screen: [...] }`, and keep its `registerProducer` assertion.
- [x] Test `tests/services/engine/frame/runLabel3DProducers.test.ts` `walks state.label3DProducers, not the core constant`. Put a single stub producer on state, assert `label3DRenderer.setLabels` receives its labels, and assert `awake` folds its output. Without this, a Layer's world producer could silently never run and nothing would fail.
- [x] Implement per the P2 contract. galaxyCatalog → `labels: (runtime) => ({ screen: [{ id: 'famousLabels', produceLabels: produceFamousGalaxyLabels(runtime) }] })`. The `labels` doc comment on `Layer.d.ts` names both halves and where each is registered or walked.
- [x] `runLabel3DProducers.ts` still exports only `runLabel3DProducers` (frameFilePurity).
- [x] `npx vitest run tests/services/engine/phases tests/services/engine/layer tests/services/engine/frame` → green. Commit.

## Task 5: P3 — core allocates Layer render targets

**Files:** Create `src/services/engine/layer/composeRenderTargetRows.ts`, `tests/services/engine/layer/composeRenderTargetRows.test.ts`. Modify `src/services/gpu/renderTargets.ts`, `src/services/engine/gpuHandles/gpuHandleRegistry.ts`, `src/@types/engine/state/EngineState.d.ts`, `src/services/engine/engine.ts`, `src/@types/engine/layer/Layer.d.ts` (doc), plus any test state builder the compiler flags for the new `EngineState` field, `tests/services/gpu/renderTargets.test.ts`, `tests/services/engine/frame/frameOrderBoot.test.ts`.

- [x] Test `composeRenderTargetRows appends each Layer's targets after core's rows`, using a stub Layer with `targets: [{ id: 'stub-target', … }]`.
- [x] Test `composeRenderTargetRows throws when a Layer target reuses a core id`, where the stub's id is `'hdr'` and the assertion is `toThrow(/'hdr'/)`. This proves the P0 helper guards the fourth table.
- [x] Test (renderTargets.test) `allocates a caller-supplied row beyond core's and keeps it across setSwapFormat`. Pass `[...renderTargetRows(SWAP_FORMAT), stubRow]`, reconcile, assert `viewOf('stub-target')` resolves, call `setSwapFormat('rgba8unorm')`, then assert `specOf('stub-target')` is unchanged and `specOf('swap').format` moved. Re-point every existing `createRenderTargets(device, SWAP_FORMAT, …)` call in that file to `renderTargetRows(SWAP_FORMAT)`. That is mechanical and needs no new assertions.
- [x] Implement per the P3 contract: the `createRenderTargets` signature, the `state.layerTargets` seed in `engine.ts`, and the registry row composing `renderTargetRows(deps.ctx.format)` with it. `GpuHandleConstructDeps` stays untouched. Update the `offscreenSpecs` comment in `renderTargets.ts` (~:324-326) if its "computed once" reasoning now reads wrong. It still holds, because the rows are fixed at construction.
- [x] `Layer.targets` doc comment per the P3 contract.
- [x] `frameOrderBoot.test.ts` builds `targetIds` from `composeRenderTargetRows('bgra8unorm', APP_COMPOSITION.layers.map((l) => l.targets ?? []))` (`tests/compositions/sourceRegistryCoverage.test.ts` already imports `APP_COMPOSITION` in a node test). Its header comment gets one clause saying Layer targets are included.
- [x] `npx vitest run tests/services/gpu/renderTargets.test.ts tests/services/engine/layer tests/services/engine/frame/frameOrderBoot.test.ts tests/services/engine/phases` → green. `npm run build` → green. Commit.

## Task 6: Manual smoke (user)

The user starts the dev server and checks against `main`:

- [x] **Settings panel** is unchanged: Galaxies and Flow sections are at the top in the same order, and "Labels & guides" has the same rows in the same order, ending with Zone of Avoidance. Its master checkbox tri-state still toggles all rows.
- [x] **Debug panel** (`d`) is unchanged: Flow tuning sits between Render toggles and Milky Way tuning.
- [x] **Labels**: famous-galaxy labels render on approach. The Zone of Avoidance curved lettering renders along the band and follows its toggle.
- [x] **Resize**: resizing the window reallocates targets with no GPU validation error in the console. Toggling HDR / swap format (if available on this display) still works.

---

## Out of scope (deferred)

- The `zoneOfAvoidance` Layer itself, which is the next PR. That PR moves the ZoA "Labels & guides" row, the lettering producer (`LABEL_3D_PRODUCERS`' only row) and the `zoa` target onto the three joints built here.
- `composeSelectionRows`' focus-claim throw and `assertSelectionRowsDisjoint`, which do not fit P0's shape (see audit).
- Dedupe of Label2D / Label3D producer ids. No spec ruling asks for it.
- An explicit walk `order` for 3D producers. The spec ruled it not needed.

## Definition of Done

- [x] `concatUniqueRows` exists in `src/utils/object/` and guards the passes, computes, asset keys and render targets. `grep -rn "two composed" src` returns nothing.
- [x] `Layer.ui` is `readonly LayerUiEntry[]` typed by `LayerUiSlots` (`main`, `debug`, `labelsAndGuides`). `LayerUi.d.ts` is deleted. galaxyCatalog and flow are migrated. A test drives a stub `labelsAndGuides` row end to end (store read, dispatch, order).
- [x] `Layer.labels` returns `LayerLabels`. `state.label3DProducers` is composed from core plus Layers, and `runLabel3DProducers` walks it.
- [x] `createRenderTargets` takes its rows from the caller. The `renderTargets` handle row composes them via `composeRenderTargetRows` from `state.layerTargets`; `GpuHandleConstructDeps` is unchanged. A stub Layer row is allocated and survives `setSwapFormat`. `Layer.targets` no longer says "DECLARED BUT NOT CONSUMED".
- [x] Ratchets unchanged or smaller: `frameFilePurity`, `layerImportBoundary`.
- [x] Manual smoke attested (Task 6): Settings and Debug panels unchanged, galaxy labels and ZoA lettering render, resize is clean.
- [x] Landing-diff breakdown reported: src code / src comment / test code / test comment / docs.
