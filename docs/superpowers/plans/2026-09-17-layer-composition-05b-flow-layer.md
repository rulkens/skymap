# Layer composition 05b — the `flow` Layer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development to implement this plan task-by-task, under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Form `src/layers/flow/` as the second sibling Layer, moving the CF4++ peculiar-velocity field's renderer, compute step, pass, asset slot, fade row, source entry and both panel sections out of core — and extend the `Layer` contract with the two members the flow family needs that `filaments` did not: `computes`, and a `ui` that carries a debug section as well as a settings one.

**Architecture:** `flow` is `filaments` plus a compute step and a UI section. Its compute dispatch (`encodeFlowCompute`) is today a hard-coded row in `executeFrame`'s module-level `COMPUTE` table, which no Layer can contribute to — so this PR mirrors the `CONTENT_PASSES` → `state.passes` design one level down: a `ContentCompute` row type, a `CORE_COMPUTES` half, `Layer.computes?(runtime)`, and `createLayers` composing both onto `state.computes`. That extension lands first and alone, with flow's row still core-owned, so the contract change is reviewable independently of the migration that exercises it. The second extension rides the same task: `Layer.ui` widens from one component to `{ settings?, debug? }`, so the dev panel's Flow tuning knobs travel with their Layer instead of staying behind as a second, core-owned half of the same feature.

**Tech Stack:** TS, WebGPU, WGSL/WESL, RTK, `defineLayer`/`instantiateLayer`/`createLayers`.

**Spec:** `docs/superpowers/specs/2026-09-09-layer-composition-design.md` — §4.5 (which slot goes to which Layer), §10(e) (one Layer per PR).

**Depends on:** nothing unlanded. Branches off `4ee73b44c` (05a filaments + the settings→RTK-slices PR both merged).

## Global Constraints

- `type` aliases, never `interface`. One symbol per file in `utils/` and `@types/`; filename = symbol.
- **Types never live inline in implementation files.** The Layer's own contract type goes in `src/layers/flow/types/`, EXPORTED. Un-exporting to satisfy a linter is the wrong fix. A React component's own `Props` is the one exception.
- Comments: module header ≤ 5 lines, comment lines ≤ half the code lines; say WHY, never WHAT.
- Pass files declare only their one export. `passes/` and the new compute row are both covered by `tests/services/engine/frame/frameFilePurity.test.ts`.
- TS moves go through `npm run move-files`, never `git mv` + hand-edited imports. It misses `.wesl` `package::` specifiers and string-literal paths — grep for the old path afterwards.
- **Shaders STAY at `src/services/gpu/shaders/flow/`.** That is the precedent `galaxyCatalog` and `filaments` both set, and `?static` specifiers are invisible to `tsc` — only `npm run build` catches a dangling one. `src/services/gpu/shaders/flow/constants.wesl` imports `flowFieldConstants`, which is another reason that file stays in `src/data/`.
- Ratchet tests only ever shrink: `tests/conventions/layerImportBoundary.test.ts`, `tests/services/engine/frame/frameFilePurity.test.ts`.
- A Layer never drives a fade at construction — core owns the arrival edge (`installFadeOnArrival`).
- `npm run typecheck` and `npm test` green at every task boundary; CI is the gate.

**User rulings carried into this plan:**

- (2026-09-16) small Layers land before `starCatalog`; `filaments` and `flow` are separate PRs; **`flow` carries the `computes` contract extension**; `zoneOfAvoidance` is 05c.
- (2026-09-17) **`Layer.ui` becomes `{ settings, debug }`** — a Layer owns both of its panel surfaces, so `FlowTuningSection` moves into the Layer rather than being deferred.
- (2026-09-17) the uniform-Layer-structure / declarative-resource-table work is a SEPARATE effort, parked. **This PR keeps `create.ts` + `destroy.ts` exactly as `filaments` has them** — do not introduce `{ resources, dispose }`, an ownership scope or a resource table here.

---

## File Structure

### Created

| File                                                   | Responsibility                                                                   |
| ------------------------------------------------------ | -------------------------------------------------------------------------------- |
| `src/@types/engine/frame/ContentCompute.d.ts`          | The compute-row contract: `name` + `encode`. Mirrors `ContentPass`.              |
| `src/@types/engine/layer/LayerUi.d.ts`                 | A Layer's two panel surfaces: `{ settings?, debug? }`, both `LayerUiSection`.    |
| `src/services/engine/frame/computes/index.ts`          | `CORE_COMPUTES` — core's half of the registry, stating no order.                 |
| `src/services/engine/frame/computes/skyViewCompute.ts` | Core's `sky-view` row, wrapping `encodeAtmosphereSkyView`.                       |
| `src/layers/flow/layer.ts`                             | `flowLayer = defineLayer({...})` — the only file naming every contribution.      |
| `src/layers/flow/types/FlowRuntime.ts`                 | The private `Runtime`: `renderer` + `slot`. Exported.                            |
| `src/layers/flow/create.ts`                            | Mints the renderer, then the slot that commits into it.                          |
| `src/layers/flow/destroy.ts`                           | `runtime.renderer.destroy()`.                                                    |
| `src/layers/flow/frame.ts`                             | Per-frame `reconcile` + the awake vote.                                          |
| `src/layers/flow/computes/flowCompute.ts`              | The one `ContentCompute` row, gate closing over `runtime`.                       |
| `src/layers/flow/load/flowAssetRows.ts`                | The one `AssetWiringRow`, `factory: () => runtime.slot`.                         |
| `src/layers/flow/present/flowFadeRows.ts`              | The one `FadeLayer` row, `guard` closing over `runtime.renderer`.                |
| `src/layers/flow/settings/flowLayerSettings.ts`        | `[flowSlice] as const` — the tuple `layer.ts` and `appSettingsSlices` both read. |
| `src/layers/flow/sources/flowSourceRows.ts`            | `[[Source.Flow, FLOW_ENTRY]] as const`.                                          |

### Moved (via `npm run move-files`)

| From                                                        | To                                                                                                                                                         |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/gpu/renderers/flowField/flowFieldRenderer.ts` | `src/layers/flow/render/flowFieldRenderer.ts`                                                                                                              |
| `src/services/gpu/resources/flowFieldFromCube.ts`           | `src/layers/flow/render/flowFieldFromCube.ts`                                                                                                              |
| `src/services/engine/frame/passes/flowFieldPass.ts`         | `src/layers/flow/passes/flowFieldPass.ts`                                                                                                                  |
| `src/services/engine/frame/computes/flowCompute.ts`         | `src/layers/flow/computes/flowCompute.ts` (created by Task 1 out of `encodeFlowCompute.ts`; rewritten as a factory in Task 4 — the move carries the tests) |
| `src/services/loading/slots/flowFieldSlot.ts`               | `src/layers/flow/load/flowFieldSlot.ts`                                                                                                                    |
| `src/services/loading/fetchers/flowFieldFetcher.ts`         | `src/layers/flow/load/flowFieldFetcher.ts`                                                                                                                 |
| `src/data/sources/flow.ts`                                  | `src/layers/flow/sources/flow.ts`                                                                                                                          |
| `src/components/SettingsPanel/FlowSection.tsx`              | `src/layers/flow/ui/FlowSection.tsx`                                                                                                                       |
| `src/components/SettingsPanel/FlowRow.tsx`                  | `src/layers/flow/ui/FlowRow.tsx`                                                                                                                           |
| `src/components/SettingsPanel/FlowRow.module.css`           | `src/layers/flow/ui/FlowRow.module.css` (hand-moved — `move-files` handles TS only; grep for the old specifier)                                            |
| `src/components/containers/FlowSectionContainer.tsx`        | `src/layers/flow/ui/FlowSectionContainer.tsx`                                                                                                              |
| `src/components/DebugPanel/FlowTuningSection.tsx`           | `src/layers/flow/ui/FlowTuningSection.tsx`                                                                                                                 |
| `src/components/containers/FlowTuningSectionContainer.tsx`  | `src/layers/flow/ui/FlowTuningSectionContainer.tsx`                                                                                                        |

Test mirrors ride along (`move-files` drags `tests/`).

**Staying put, with the reason:**

| File                                                                     | Why it does not move                                                                                                                                                                      |
| ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/services/gpu/shaders/flow/**`                                       | Shader precedent — Layers own no WGSL.                                                                                                                                                    |
| `src/data/flow/flowFieldConstants.ts`                                    | Read by `tools/flow-workbench`, `src/utils/clampFlowParams.ts` and `shaders/flow/constants.wesl`.                                                                                         |
| `src/data/flow/flowFields.ts`                                            | The slider-field table; read by `src/data/milkyWay/milkyWaySliderFields.ts`.                                                                                                              |
| `src/data/flow/flowFieldMetaFromCube.ts`                                 | Read only by `flowFieldFromCube`, but sits with the other `data/flow` cube helpers.                                                                                                       |
| `src/utils/clampFlowParams.ts`                                           | Read by `src/utils/clampVolumeFieldSettings.ts` — genuinely shared.                                                                                                                       |
| `src/utils/flowFrameDeltaSec.ts`                                         | Cross-cutting helper; `utils/` is its home by convention.                                                                                                                                 |
| `src/@types/data/flow/**`, `src/@types/rendering/FlowFieldRenderer.d.ts` | `filaments` set the precedent: a Layer's renderer type stays under `src/@types/`.                                                                                                         |
| `src/components/DebugPanel/DebugTuningSection.tsx`                       | The shared board every dev-panel tuning section instantiates. The Layer's section imports it across the boundary, exactly as `GalaxiesSection` imports `CollapsibleSection` and `Slider`. |

### Modified — core shrinks

| File                                                  | Change                                                                                              |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| `src/@types/engine/layer/Layer.d.ts`                  | `+ computes?(runtime): readonly ContentCompute[]`; `ui?` widens from `LayerUiSection` to `LayerUi`  |
| `src/@types/engine/layer/LayerInstance.d.ts`          | `+ readonly computes: readonly ContentCompute[]`                                                    |
| `src/@types/engine/state/EngineState.d.ts`            | `+ computes: readonly ContentCompute[]`; **`− gpu.flowFieldRenderer`** (in `EngineGpuHandles.d.ts`) |
| `src/services/engine/layer/instantiateLayer.ts`       | `+ computes: layer.computes?.(runtime) ?? []`                                                       |
| `src/services/engine/phases/createLayers.ts`          | Composes `state.computes`; duplicate-name throw, mirroring `state.passes`                           |
| `src/services/engine/frame/executeFrame.ts`           | `− const COMPUTE` table; resolves off `state.computes`, absent name DROPS                           |
| `src/services/engine/frame/checkFrameOrder.ts`        | `compute` arm returns the contributed row names, so a row `FRAME_ORDER` never names is caught       |
| `src/services/engine/engine.ts`                       | `− flowFieldRenderer: null`; `+ computes: []`                                                       |
| `src/services/engine/gpuHandles/gpuHandleRegistry.ts` | `−` the `flowFieldRenderer` row                                                                     |
| `src/services/engine/frame/passes/index.ts`           | `−` `flowFieldPass`                                                                                 |
| `src/services/engine/wiring/assetWiring.ts`           | `−` the `flow` row                                                                                  |
| `src/services/engine/wiring/fadeLayers.ts`            | `−` the `flow` row                                                                                  |
| `src/services/engine/frame/runFrame.ts`               | `−` the `flowFieldRenderer?.reconcile(...)` line                                                    |
| `src/services/engine/helpers/shouldKeepTicking.ts`    | `−` the flow term (absorbed by `Layer.frame`'s awake vote)                                          |
| `src/compositions/app.ts`                             | `+ flowLayer`                                                                                       |
| `src/compositions/appSettingsSlices.ts`               | `flow` moves out of the unformed list into the Layer's tuple                                        |
| `src/components/SettingsPanel/SettingsPanel.tsx`      | Reads `layer.ui?.settings`; `−` the `FlowSectionContainer` import + element                         |
| `src/components/DebugPanel/DebugPanel.tsx`            | `+` the Layer debug-section group; `−` the `FlowTuningSectionContainer` import + element            |
| `src/layers/galaxyCatalog/layer.ts`                   | `ui: GalaxiesSectionContainer` → `ui: { settings: GalaxiesSectionContainer }`                       |
| `src/data/sources.ts`                                 | `flow` source entry now folded in from the Layer's rows                                             |

---

## Contract: the `computes` extension

```ts
// src/@types/engine/frame/ContentCompute.d.ts
/**
 * ContentCompute — one compute dispatch and its own gate. WHERE it runs is not
 * here: `FRAME_ORDER` names the row on the `{ kind: 'compute' }` line that
 * states its place in the prelude, so a row and the order cannot disagree.
 */
export type ContentCompute = {
  /** What `FRAME_ORDER` names, and `computeTimingSlotName` suffixes. Globally unique. */
  readonly name: string;
  /**
   * Encode into the frame's single command encoder. Carries its own gate — a
   * row that declines encodes nothing. `claimTimestampWrites` is LAZY: claim it
   * at the moment a pass opens, never up front, or a declining row reports the
   * query set's stale ticks.
   */
  encode(
    encoder: GPUCommandEncoder,
    ctx: ReadyFrameContext,
    state: PassState,
    claimTimestampWrites: ClaimTimestampWrites,
  ): void;
};
```

`PassState` (not `EngineState`) is the right argument: both existing rows read only `state.gpu` / `state.settings` / `state.assetSlots`, all of which `PassState` already admits, and it is the same cut every `ContentPass` gets.

**Decision — an unclaimed compute name DROPS, it does not throw.** Today `executeFrame` throws `no COMPUTE row for '<name>'`. Under composition that is wrong for the same reason it would be wrong for passes: a composition without the flow Layer (the deferred `galaxiesOnly` reference engine) must still walk a `FRAME_ORDER` that names `flow`. So the resolve mirrors `expandFrameOrder`'s `resolve()` — absent names drop — and the inverse failure (a Layer contributes a compute row `FRAME_ORDER` never names, so it silently never runs) moves to `checkFrameOrder`, which today returns `NONE` for the `compute` arm and therefore checks nothing.

---

## Contract: the `ui` extension

```ts
// src/@types/engine/layer/LayerUi.d.ts
/**
 * LayerUi — a Layer's two panel surfaces. Both are hand-written components,
 * never schemas (ADR 0011): `settings` is explorer-facing, `debug` is the
 * power-user knobs the dev panel shows. Either may be absent; a Layer with
 * neither omits `ui` entirely.
 */
export type LayerUi = {
  readonly settings?: LayerUiSection;
  readonly debug?: LayerUiSection;
};
```

`LayerUiSection` (`ComponentType`) is unchanged and stays the member type — a section owns its own store container, so neither surface takes props.

**Decision — where the debug group renders.** `SettingsPanel` renders Layer sections _ahead of_ the core containers; `DebugPanel` does not mirror that. Its top block (asset loading, frame stats, GPU timings, camera state, render toggles) is engine diagnostics that belong to no Layer, so the Layer group renders below it — at the position `FlowTuningSectionContainer` occupies today, between `RenderTogglesSectionContainer` and `MilkyWayTuningSectionContainer`. The flow panel is then visually unchanged, and every later Layer's debug section has a defined home.

---

## Task 1: The contract extensions

Core-only, and deliberately ahead of every migration task: at the end of Task 1 flow's compute row and both its UI sections are still core-owned, so each contract widening is reviewable without the move that exercises it. Two independent parts.

**Part A — `computes`.** As specified above: `ContentCompute`, `CORE_COMPUTES`, `Layer.computes?`, `EngineState.computes`, and the executor resolving off it.

**Part B — `ui: { settings, debug }`.** `Layer.ui` widens from one component to the two-member `LayerUi`. Purely a re-shaping: `galaxyCatalog`'s member becomes `{ settings: GalaxiesSectionContainer }`, `SettingsPanel` reads `layer.ui?.settings`, and `DebugPanel` grows the Layer group at the position the decision above pins — empty for now, since no Layer declares `debug` until Task 5.

**Files:**

- Create: `src/@types/engine/frame/ContentCompute.d.ts`, `src/@types/engine/layer/LayerUi.d.ts`, `src/services/engine/frame/computes/index.ts`, `src/services/engine/frame/computes/skyViewCompute.ts`, `src/services/engine/frame/computes/flowCompute.ts`
- Delete: `src/services/engine/frame/encodeFlowCompute.ts` (absorbed by `computes/flowCompute.ts`)
- Modify: `src/services/engine/frame/encodeAtmosphereSkyView.ts` (param narrowed to `PassState`), `src/@types/engine/layer/Layer.d.ts`, `src/@types/engine/layer/LayerInstance.d.ts`, `src/@types/engine/state/EngineState.d.ts`, `src/services/engine/layer/instantiateLayer.ts`, `src/services/engine/phases/createLayers.ts`, `src/services/engine/frame/executeFrame.ts`, `src/services/engine/frame/checkFrameOrder.ts`, `src/services/engine/engine.ts`, `src/layers/galaxyCatalog/layer.ts`, `src/components/SettingsPanel/SettingsPanel.tsx`, `src/components/DebugPanel/DebugPanel.tsx`
- Test: `tests/services/engine/phases/createLayers.computes.test.ts`, `tests/services/engine/frame/executeFrame.computes.test.ts`, `tests/services/engine/frame/checkFrameOrder.test.ts`

Part B gets **no new test**: it is a type re-shaping the compiler checks end to end, and a render test asserting "the section appears" would only restate JSX (see `testing.md`).

**Interfaces:**

- Produces: `ContentCompute`; `Layer.computes?(runtime): readonly ContentCompute[]`; `LayerInstance.computes`; `EngineState.computes`; `CORE_COMPUTES`; `LayerUi`.
- Consumes: nothing new.

- [ ] **Step 1: Write the failing composition tests**

Three behaviours, each pinning a failure the compiler cannot catch:

```ts
// createLayers composes a Layer's compute rows onto state.computes
it('appends each Layer compute row after core rows', async () => {
  /* … */
});

// A duplicate name would let the first row win silently, exactly as for passes
it('throws when two composed compute rows share a name', async () => {
  /* … */
});

// The composability decision above: FRAME_ORDER may name a row no composition owns
it('skips a compute step whose name no composed row claims', () => {
  /* … */
});
```

- [ ] **Step 2: Run them to verify they fail**

Run: `npx vitest run tests/services/engine/phases/createLayers.computes.test.ts tests/services/engine/frame/executeFrame.computes.test.ts`
Expected: FAIL — `state.computes` does not exist.

- [ ] **Step 3: Add the type and core's registry**

`ContentCompute` as specified above, then core's two rows:

- `computes/skyViewCompute.ts` — a thin row delegating to `encodeAtmosphereSkyView`, which stays where it is. Narrow its `state` parameter from `EngineState` to `PassState`: it reads only `state.gpu.atmosphereShellRenderer`, so the narrow is free and it is what lets the row take `PassState` like every `ContentPass`.
- `computes/flowCompute.ts` — **absorbs** `src/services/engine/frame/encodeFlowCompute.ts`, which is DELETED. The body and its gate move in unchanged; only the shape becomes a row. Re-point `tests/services/engine/frame/encodeFlowCompute.test.ts` at it (Task 2 moves both into the Layer).

`computes/index.ts` exports `CORE_COMPUTES`, with a header mirroring `passes/index.ts`'s ("states no order; `FRAME_ORDER` names each of these").

- [ ] **Step 4: Thread it through the contract**

`Layer.computes?`, `LayerInstance.computes`, `instantiateLayer`'s `?? []`, `EngineState.computes` (initialised `[]` in `engine.ts`), and `createLayers` composing `[...CORE_COMPUTES, ...instances.flatMap((i) => i.computes)]` with the duplicate-name throw copied from the pass sweep.

- [ ] **Step 5: Switch `executeFrame` to the composed list**

Delete the module-level `COMPUTE` table and its two imports. Resolve `state.computes.find((c) => c.name === step.name)`; `break` when absent. Keep the debug-toggle check and the lazy claim exactly as they are — only the lookup changes.

- [ ] **Step 6: Close the inverse in `checkFrameOrder`**

The `compute` arm returns the composed rows' names so a contributed row `FRAME_ORDER` never names is reported, matching what the pass arm already does.

- [ ] **Step 7: Run the full suite**

Run: `npm test && npm run typecheck`
Expected: PASS. Frame behaviour is unchanged — same two rows, same order, same gates.

- [ ] **Step 8: Commit Part A**

```
feat(engine): compose compute rows like passes
```

- [ ] **Step 9: Widen `Layer.ui` to `{ settings, debug }`** (Part B)

Add `LayerUi.d.ts` as pinned above; point `Layer.ui?` at it; update `galaxyCatalog/layer.ts` to `ui: { settings: GalaxiesSectionContainer }`. `SettingsPanel.tsx:44-45` reads `layer.ui?.settings` — JSX cannot render an optional member expression directly, so bind it to a capitalised local before returning it.

- [ ] **Step 10: Grow the Layer group in `DebugPanel`**

Map `APP_COMPOSITION.layers` over `layer.ui?.debug` at the position the decision above pins (between `RenderTogglesSectionContainer` and `MilkyWayTuningSectionContainer`). `SettingsPanel.tsx:44-45` is the shape to copy, including the `key={layer.name}`. No Layer declares `debug` yet, so the group renders nothing and the panel is unchanged.

- [ ] **Step 11: Run the gate and commit Part B**

Run: `npm test && npm run typecheck`

```
refactor(layer): Layer.ui carries a settings and a debug section
```

---

## Task 2: Relocate the flow modules

Pure moves. No behaviour change, no contract change.

**Files:** every row of the _Moved_ table above.

- [ ] **Step 1: Move the TS modules**

Run `npm run move-files -- --manifest <moves.json> --dry` first, inspect, then for real. One manifest for all TS moves; the `.module.css` is moved by hand.

- [ ] **Step 2: Move the CSS module and fix its importer**

`FlowRow.module.css` beside `FlowRow.tsx`.

- [ ] **Step 3: Grep for what `move-files` cannot see**

Run: `grep -rn "renderers/flowField\|slots/flowFieldSlot\|fetchers/flowFieldFetcher\|gpu/resources/flowFieldFromCube\|data/sources/flow\|SettingsPanel/FlowSection\|SettingsPanel/FlowRow\|containers/FlowSectionContainer\|DebugPanel/FlowTuningSection\|containers/FlowTuningSectionContainer\|frame/encodeFlowCompute\|passes/flowFieldPass" src tests tools docs`
Expected: no hits outside the moved files' own headers. `.wesl` `package::` specifiers and string-literal paths are the known blind spots.

- [ ] **Step 4: Verify green and commit**

Run: `npm test && npm run typecheck && npm run build`
(`npm run build` because a dangling `?static` shader specifier is invisible to `tsc`.)

```
refactor(flow): relocate the flow modules under src/layers/flow
```

---

## Task 3: Mint the Runtime, `create` and `destroy`

**Files:**

- Create: `src/layers/flow/types/FlowRuntime.ts`, `src/layers/flow/create.ts`, `src/layers/flow/destroy.ts`
- Test: `tests/layers/flow/create.test.ts`

**Interfaces:**

- Produces:

```ts
export type FlowRuntime = {
  readonly renderer: FlowFieldRenderer;
  readonly slot: AssetSlot<ScalarCube, void>;
};
```

- Consumes: `LayerCoreDeps` (Task 1 unchanged it).

- [ ] **Step 1: Write the failing test** — `create` returns a non-null renderer and a slot whose commit uploads into that renderer, with no reach into `state.gpu`.
- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Write `FlowRuntime`, `create`, `destroy`.** `create` mints the renderer from `deps.ctx.device` + `HDR_TARGET_FORMAT` + `deps.fadeBgl`, then the slot that commits into it — the `filaments` shape exactly. The slot's `commit` closes over the local `renderer`, replacing `state.gpu.flowFieldRenderer?.upload(cube)`; its `?.` guard disappears, because a Layer's renderer is non-null by construction. `destroy` releases the renderer.
- [ ] **Step 4: Run the tests, verify they pass.**
- [ ] **Step 5: Commit** — `feat(flow): mint the flow Runtime`

---

## Task 4: Runtime-bound contributions — pass, compute, assets, fades, frame

Each contribution moves from reading `state.gpu.flowFieldRenderer` to closing over `runtime.renderer`, which is what deletes the null checks.

**Files:**

- Modify: `src/layers/flow/passes/flowFieldPass.ts` (const → factory), `src/layers/flow/computes/flowCompute.ts`
- Create: `src/layers/flow/load/flowAssetRows.ts`, `src/layers/flow/present/flowFadeRows.ts`, `src/layers/flow/frame.ts`
- Test: mirrors under `tests/layers/flow/`

- [ ] **Step 1: Write the failing tests.** Four behaviours worth pinning:
  - the pass draws only when the slot is committed (the `slotReady` gate becomes a runtime read);
  - the compute row encodes nothing when `settings.flow.enabled` is false, and nothing when the cube has not landed;
  - the fade row's `guard` is the renderer's own `fieldLoaded()`;
  - `frame` calls `reconcile` once and votes `{ awake, settling }` (`LayerFrameVote`): `awake` exactly
    while the field is live — the term `shouldKeepTicking` is losing — and `settling: false` always,
    since flow draws in no capture roster. A single boolean here would braid the keep-alive vote with
    `scheduleSkyCaptures`'s roster-settling read and re-bake both sky cubemaps every frame.
- [ ] **Step 2: Run them, verify they fail.**
- [ ] **Step 3: Rewrite each contribution as a factory over `FlowRuntime`.**
  - `flowFieldPass(runtime)` — `enabled` reads `runtime.slot`'s state rather than `state.assetSlots.flow`; `draw` drops its `=== null` early return.
  - `flowCompute(runtime)` — the three-condition gate becomes two (`settings.flow.enabled` + the slot's committed state); the renderer-null condition is gone by construction. Keep the "no out-of-band submit" and gate rationale from `encodeFlowCompute`'s header, trimmed to the ≤ 5-line budget.
  - `flowAssetRows(runtime)` — `key: 'flow'`, `factory: () => runtime.slot`, `demand: (ctx) => ctx.settings.flow.enabled`, `priority: 81`.
  - `flowFadeRows(runtime)` — the `fadeLayers.ts` row verbatim, `guard: () => runtime.renderer.fieldLoaded()`.
  - `frame(runtime)` — `reconcile(state.settings.flow)`, then return the vote.
- [ ] **Step 4: Run the tests, verify they pass.**
- [ ] **Step 5: Commit** — `feat(flow): runtime-bound contributions`

---

## Task 5: Form the Layer and compose it

**Files:**

- Create: `src/layers/flow/layer.ts`, `src/layers/flow/settings/flowLayerSettings.ts`, `src/layers/flow/sources/flowSourceRows.ts`
- Modify: `src/compositions/app.ts`, `src/compositions/appSettingsSlices.ts`, `src/components/SettingsPanel/SettingsPanel.tsx`, `src/components/DebugPanel/DebugPanel.tsx`, `src/data/sources.ts`
- Test: `tests/layers/flow/layer.test.ts`, existing `tests/compositions/*`

**Interfaces:**

- Produces: `flowLayer`, `flowLayerSettings`, `FLOW_SOURCE_ROWS`.

- [ ] **Step 1: Write the failing test** — the composed app has exactly one pass, one compute row, one asset row and one fade row named `flow`, and `INITIAL_SETTINGS.flow` is unchanged.
- [ ] **Step 2: Run it, verify it fails.**
- [ ] **Step 3: Write `layer.ts`.**

```ts
export const flowLayer = defineLayer({
  name: 'flow',
  settings: flowLayerSettings,
  sources: FLOW_SOURCE_ROWS,
  create,
  destroy,
  passes: (runtime) => [flowFieldPass(runtime)],
  computes: (runtime) => [flowCompute(runtime)],
  assets: flowAssetRows,
  fades: flowFadeRows,
  frame,
  ui: { settings: FlowSectionContainer, debug: FlowTuningSectionContainer },
});
```

- [ ] **Step 4: Compose it.** Add `flowLayer` to `APP_COMPOSITION.layers`; move `flow` out of the unformed-slices list in `appSettingsSlices.ts`; delete `<FlowSectionContainer />` and its import from `SettingsPanel.tsx`, and `<FlowTuningSectionContainer />` and its import from `DebugPanel.tsx`. Both sections now render from the Layer group Task 1 built: the settings section moves _ahead of_ the core sections (a deliberate, visible ordering change — see _Definition of Done_), while the debug section keeps its current position, which is what the group's placement was chosen for.
- [ ] **Step 5: Run the tests, verify they pass.**
- [ ] **Step 6: Commit** — `feat(flow): form the flow Layer and compose it`

---

## Task 6: Delete what core no longer holds

The point of the exercise. Nothing here is optional — a field left behind is a second, dead path.

**Files:** `src/@types/engine/handles/EngineGpuHandles.d.ts`, `src/services/engine/engine.ts`, `src/services/engine/gpuHandles/gpuHandleRegistry.ts`, `src/services/engine/frame/passes/index.ts`, `src/services/engine/frame/computes/index.ts`, `src/services/engine/frame/runFrame.ts`, `src/services/engine/helpers/shouldKeepTicking.ts`, `src/services/engine/wiring/assetWiring.ts`, `src/services/engine/wiring/fadeLayers.ts`

- [ ] **Step 1: Delete each core holding**, in this order (each is independently green):
  - `passes/index.ts` — the `flowFieldPass` import + row;
  - `computes/index.ts` — the `flowCompute` import + row (Task 1's temporary core row);
  - `assetWiring.ts` — the `flow` row + `createFlowFieldSlot` import;
  - `fadeLayers.ts` — the `flow` row;
  - `runFrame.ts` — the `reconcile` line;
  - `shouldKeepTicking.ts` — the `state.settings.flow.enabled && slotReady(...)` term;
  - `gpuHandleRegistry.ts` — the `flowFieldRenderer` row + import;
  - `EngineGpuHandles.d.ts` + `engine.ts` — the handle field and its `null` seed.
- [ ] **Step 2: Sweep for stragglers.**

Run: `grep -rn "flowFieldRenderer\|assetSlots\.flow\|createFlowFieldSlot" src tests`
Expected: hits only under `src/layers/flow/` and its test mirror, plus prose references in unrelated headers (`AtmosphereShellRenderer.d.ts` cites the two-pass lesson — leave those).

- [ ] **Step 3: Full gate.**

Run: `npm test && npm run typecheck && npm run build`

- [ ] **Step 4: Commit** — `refactor(engine): delete core's flow holdings`

---

## Task 7: Manual smoke

Not code. `/dev` in this worktree, then check, in order:

- [ ] Flow is OFF at boot and no velocity cube is fetched (Network tab quiet).
- [ ] Toggling Flow on in the Settings panel fetches the cube once, then the ribbons fade IN rather than popping — the fade-on-arrival edge core owns.
- [ ] Ribbons animate while enabled and the loop stays awake with the camera still (the `shouldKeepTicking` term Task 6 deleted is genuinely covered by `Layer.frame`).
- [ ] Toggling off fades out and the loop parks.
- [ ] The Flow section appears in the Settings panel (now rendered in Layer-composition order, above Stars/Cosmic Web — confirm the new position is acceptable).
- [ ] The DebugPanel's Flow tuning section is still in its old position (between Render toggles and Milky Way tuning) and its sliders still drive the field — it now renders from `flowLayer.ui.debug`, not from `DebugPanel.tsx`.
- [ ] The frame-timing panel still bills `flow-compute` under its own slot, and the DebugPanel toggle for it still suppresses the dispatch.

---

## Out of scope (deferred)

- **The other DebugPanel tuning sections** (`MilkyWayTuningSection`, `ZoneOfAvoidanceTuningSection`, `SgrAStarLensingTuningSection`). `Layer.ui.debug` now has a home for them, but each belongs to a Layer that is not yet formed; they move with their Layer, not with this PR.
- **The uniform Layer structure / declarative resource table.** Parked 2026-09-17 by user direction; two decisions and two open questions are recorded in the `project_layer_composition` memory. This Layer follows today's `filaments` shape exactly so it converts cleanly whenever that lands.
- **`src/data/flow/` and `src/utils/*Flow*`.** Shared with `clampVolumeFieldSettings`, `milkyWaySliderFields`, `tools/flow-workbench` and a `.wesl` import — moving them is a separate un-braid, not this PR's.

---

## Definition of Done

- [ ] `npm test`, `npm run typecheck` and `npm run build` all green.
- [ ] `src/layers/flow/` holds the renderer, the compute row, the pass, the slot + fetcher, the fade row, the source entry, the settings slice and both UI sections.
- [ ] `EngineState.gpu` no longer has a `flowFieldRenderer` field, and `grep -rn "flowFieldRenderer" src/services` returns only prose citations.
- [ ] `state.computes` is composed from `CORE_COMPUTES` + every Layer's rows, with a duplicate-name throw and an absent-name drop, and `checkFrameOrder` catches a contributed row `FRAME_ORDER` never names.
- [ ] `INITIAL_SETTINGS` is deep-equal to `main`'s — assert by dumping it from both trees and comparing, not by reading the code. Key ORDER moves (the `flow` slice folds in after `filaments` instead of last) and that is fine: nothing iterates the top-level settings keys positionally, and the guided-tour snapshot merge is key-addressed.
- [ ] Ratchets unchanged or smaller: `layerImportBoundary`, `frameFilePurity`.
- [ ] `Layer.ui` is `{ settings?, debug? }`, `SettingsPanel` and `DebugPanel` both render their Layer group from it, and `grep -rn "FlowTuningSection" src/components` returns nothing.
- [ ] Manual smoke attested (Task 7), including the Settings-panel section's new position and the Debug-panel section's unchanged one.
- [ ] Landing-diff breakdown reported: src code / src comment / test code / test comment / docs.
