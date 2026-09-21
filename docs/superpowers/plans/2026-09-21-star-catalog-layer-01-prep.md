# starCatalog Layer 01 — ground preparation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create the four joints the starCatalog Layer (PR 2) grows into, as four behaviour-neutral, pixel-identical commits.

**Architecture:** Refactor only. (1) The Layer contract's `labels` member becomes `guides`, gaining an `orbitTrails` slot, and `orbitTrailsPass` walks a roster core composes at boot instead of a static table. (2) The `orbitTrails` settings cluster moves from the body Layer to core, where its pass, renderer and fade row already live. (3) A single `focusDriverId(row)` replaces six `row.type === 'body'` camera gates. (4) `computeStarCut`'s pure/mutating boolean flag splits into a pure read and an `advanceStarFades` step `runFrame` calls once per frame.

**Tech Stack:** TS, RTK slices, Vitest, WebGPU pass files (no shader changes).

**Spec:** `docs/superpowers/specs/2026-09-21-star-catalog-layer-design.md` — §2.4 (contract), §2.5 (camera joint), §3 (this PR). Parent spec: `docs/superpowers/specs/2026-09-09-layer-composition-design.md`.

## Global Constraints

- Every task is behaviour-neutral and pixel-identical. No new knobs, no new behaviour, no speculative generality.
- One task = one commit, in the order below. Prep, adjacent cleanup and feature are three different diffs; nothing adjacent rides here (see "Deferral boundary").
- No deletion audit on this PR (prep-PR rule); it runs once at PR 2's `/feature-done`.
- Frame files (`src/services/engine/frame/**`, incl. `passes/`) export only the one symbol they are named for; ratchet `tests/services/engine/frame/frameFilePurity.test.ts`.
- One symbol per file under `utils/` and `@types/`; `type` aliases, never `interface`; deep relative imports, no barrels.
- Comment budget: module header ≤ 5 lines, comment lines ≤ half the code lines; rewrite headers whose claims this PR falsifies (listed per task), never leave a stale one.
- Moves and renames use `npm run move-files` / `npm run refactor -- rename`, never `git mv` plus hand-edited imports; grep the old path afterwards.
- Format with `npx prettier --write <touched files>`; never `npm run format`.
- Commit messages carry no `Co-Authored-By` trailer.
- `npm run dev` stays running; do not kill it.

---

### Task 1: `Layer.guides` replaces `labels`; `orbitTrailsPass` walks a composed roster

**Files:**

- Move: `src/@types/engine/layer/LayerLabels.d.ts` → `src/@types/engine/layer/LayerGuides.d.ts`
- Modify: `src/@types/engine/layer/Layer.d.ts:78-85`, `src/@types/engine/layer/LayerInstance.d.ts`, `src/@types/engine/state/EngineState.d.ts:102-104`, `src/@types/engine/frame/PassState.d.ts`
- Modify: `src/services/engine/layer/instantiateLayer.ts:24-32`, `src/services/engine/phases/createLayers.ts:1-7,146`, `src/services/engine/engine.ts:328`
- Rename: `src/data/bodies/trailElements.ts#TRAIL_ELEMENTS` → `CORE_TRAIL_ELEMENTS` (importers: `orbitTrailsPass.ts`, `sceneOrbitConics.ts`, `orbitReachByRegion.ts`, `tests/data/bodies/sceneOrbitConics.test.ts`)
- Modify: `src/services/engine/frame/passes/orbitTrailsPass.ts` (header, `staging`, the `draw` loop)
- Modify: `src/layers/galaxyCatalog/layer.ts:46`, `src/layers/zoneOfAvoidance/layer.ts:41`, `src/layers/constellations/layer.ts:28`
- Modify: `src/layers/README.md` (rows 29 and "Unsettled" item 2)
- Test: `tests/services/engine/phases/createLayers.composition.test.ts`, `tests/services/engine/frame/passes/orbitTrailsPass.test.ts:160-189`

**Interfaces:**

- Produces:

```ts
// src/@types/engine/layer/LayerGuides.d.ts — replaces LayerLabels
export type LayerGuides = {
  readonly screenLabels?: readonly LayerScreenLabel[];
  readonly worldLabels?: readonly Label3DProducer[];
  /** Static conics the orbit-trails pass propagates per frame; `focusId` must be a
   * body-state anchor. */
  readonly orbitTrails?: readonly OrbitalElements[];
};

// Layer.d.ts — `labels?` is deleted
guides?(runtime: Runtime): LayerGuides;

// LayerInstance.d.ts — `screenLabels` / `worldLabels` stay; add
readonly orbitTrails: readonly OrbitalElements[];

// EngineState.d.ts — beside `label3DProducers`; PassState's Pick adds it
/** Core's conics then every Layer's `guides.orbitTrails`, composed once by
 * `createLayers`; `orbitTrailsPass` walks this. */
orbitTrailRows: readonly OrbitalElements[];

// src/data/bodies/coreTrailElements.ts
export const CORE_TRAIL_ELEMENTS: readonly OrbitalElements[];
```

- `createLayers`: `state.orbitTrailRows = [...CORE_TRAIL_ELEMENTS, ...instances.flatMap((i) => i.orbitTrails)]`. No uniqueness assert: rows are not keyed and nothing else looks one up by id.
- `orbitTrailsPass.draw`: `const rows = state.orbitTrailRows;` replaces `TRAIL_ELEMENTS`; the module-level `staging` buffer is regrown when `rows.length * INSTANCE_FLOATS` exceeds its length (it was sized once from the static table). The header's "compile-time elements table" sentence is rewritten to say the roster is composed at boot.
- With no Layer contributing, `state.orbitTrailRows` equals `CORE_TRAIL_ELEMENTS` — that is the pixel-identity argument.

- [ ] `npm run move-files -- src/@types/engine/layer/LayerLabels.d.ts src/@types/engine/layer/LayerGuides.d.ts`, then rename the type to `LayerGuides` (`npm run refactor -- rename src/@types/engine/layer/LayerGuides.d.ts#LayerLabels LayerGuides`; if the CLI refuses a `.d.ts`, edit the four importers by hand: `Layer.d.ts`, `LayerInstance.d.ts`, `instantiateLayer.ts`, `createLayers.ts`). Reshape the type as above; keep the NEAR0/COSMO header note.
- [ ] `npm run refactor -- rename src/data/bodies/trailElements.ts#TRAIL_ELEMENTS CORE_TRAIL_ELEMENTS` (file follows to `coreTrailElements.ts`). Grep `TRAIL_ELEMENTS\b` and `trailElements` afterwards; the test mirror moves with it.
- [ ] `Layer.d.ts`: replace `labels?` with `guides?`; the doc comment names all three halves and where each lands (`screenLabels` → slab director, `worldLabels` → `state.label3DProducers`, `orbitTrails` → `state.orbitTrailRows`).
- [ ] `instantiateLayer.ts`: `const guides = layer.guides?.(runtime);` feeding `screenLabels`, `worldLabels`, `orbitTrails` (each `?? []`).
- [ ] `EngineState.d.ts` + `PassState.d.ts` Pick + `engine.ts:328` (`orbitTrailRows: []`) + `createLayers.ts` composition line and its header list.
- [ ] `orbitTrailsPass.ts`: walk `state.orbitTrailRows`, regrow `staging` on demand, rewrite the header sentence.
- [ ] The three Layers: `labels:` → `guides:`, `screen:` → `screenLabels:`, `world:` → `worldLabels:`.
- [ ] `src/layers/README.md`: the `labels?` row becomes `guides?` (still `present/`); "Unsettled" item 2 says `guides?`.
- [ ] Test `createLayers.composition.test.ts`: rename the fixture members (`labels` → `guides`, `screen` → `screenLabels`, `world` → `worldLabels`) and add
  `it('composes core's orbit-trail rows then every Layer's guides.orbitTrails, in tuple order')` — two Layers each contributing one `{ id: '<tag>-trail' } as unknown as OrbitalElements`; assert `state.orbitTrailRows` equals `[...CORE_TRAIL_ELEMENTS, aRow, bRow]` by reference. This is the one new test that can fail on a real bug (a Layer's rows dropped or misordered).
- [ ] Test `orbitTrailsPass.test.ts`: `makeState` gains `orbitTrailRows: CORE_TRAIL_ELEMENTS`; the header's "conic table is a static module-level seed" sentence is rewritten. No other assertion changes — that is the identity check.
- [ ] `npm run typecheck:fast && npm test -- createLayers orbitTrails sceneOrbitConics frameFilePurity` → green.
- [ ] Commit: `refactor(layer): guides replaces labels; orbit trails walk a composed roster`.

---

### Task 2: `orbitTrails` settings cluster moves to core

**review: yes** (Redux state)

**Files:**

- Move (folder): `src/layers/body/state/orbitTrails/` → `src/state/settings/core/orbitTrails/` (`slice.ts`, `initialState.ts`, `selectors.ts`; the `tests/` mirror follows)
- Modify: `src/state/settings/coreSettingsSlices.ts`, `src/layers/body/state/slices.ts`
- Importers rewritten by the tool, then re-read for stale prose: `src/components/containers/LabelsAndGuidesSectionContainer.tsx:62-63`, `src/services/animation/visibilityActionRow.ts:25`, `tests/state/settings/makeSettingsFixture.ts:57`, `tests/components/containers/LabelsAndGuidesSectionContainer.test.ts:54`
- Test: `tests/state/settings/coreSettingsSlices.test.ts`, `tests/compositions/appSettingsSlices.test.ts` (adjust whatever pins the tuple contents)

**Behaviour:** the settings root keeps the same keys and the same values; only which tuple carries `orbitTrailsSlice` changes. The folder keeps its three-file Layer-cluster shape inside `core/` (the smallest diff; core's flat `<name>Slice.ts` files predate the cluster convention).

- [ ] `npm run move-files -- --dry src/layers/body/state/orbitTrails src/state/settings/core/orbitTrails`, then without `--dry`. Grep `body/state/orbitTrails` afterwards (string-literal paths are the tool's blind spot).
- [ ] `coreSettingsSlices.ts`: add `orbitTrailsSlice` after `labelsSlice`; `body/state/slices.ts`: remove it. Rewrite the moved `slice.ts` header ("the body Layer's …" → core's) and the `initialState.ts` header's `ORBITAL_ELEMENTS` reference to `CORE_TRAIL_ELEMENTS` if it names the table.
- [ ] Fix any tuple-content assertion in the two tuple tests. No new test: the compiler and the existing tuple tests cover a dropped or duplicated slice.
- [ ] `npm run typecheck:fast && npm test -- settings appSettingsSlices LabelsAndGuides visibilityActionRow` → green.
- [ ] Commit: `refactor(settings): orbitTrails cluster moves from the body Layer to core`.

---

### Task 3: `focusDriverId` replaces the six camera gates

**review: yes** (camera maths)

**Files:**

- Create: `src/utils/camera/focusDriverId.ts`
- Modify: `src/services/engine/camera/liveBodyPosition.ts:20`, `src/utils/scene/bodyMovesThisFrame.ts:11`, `src/services/engine/camera/cameraDrivers.ts:111`, `src/services/engine/camera/approachTiltedPose.ts:44-51`, `src/services/engine/frame/runFrame.ts:228-233`, `src/services/engine/camera/stepCameraRuntime.ts:120`
- Test: `tests/utils/camera/focusDriverId.test.ts`

**Interfaces:**

```ts
// src/utils/camera/focusDriverId.ts
/** The id the body-state / position-driver tables drive for this focus row, or
 * null when the row has none. Body rows only today; the starCatalog arm joins
 * in PR 2 (spec §2.5). */
export function focusDriverId(row: SelectionRow | null): string | null;
```

**Behaviour:** `body` → `row.id`; every other arm (incl. today's `star` arm) and `null` → `null`. Each site binds `const id = focusDriverId(row)` and uses `id` where it read `row.id` after the gate, so the narrowing the discriminant gave is carried by the local, not by the union.

Per site:

- `liveBodyPosition`: `id === null ? null : (bodies.get(id)?.positionMpc ?? null)`.
- `bodyMovesThisFrame`: `id !== null && bodyFollowsSimClock(id)`.
- `cameraDrivers.ts:111` (`followPose`): the gate becomes `focus === null || focusDriverId(focus) === null || livePos === null`; nothing below the gate reads `focus.id`.
- `approachTiltedPose`: gate on `id === null || !bodyMovesThisFrame(focusRow)`; `findByIdOrThrow(SCENE_BODIES, id, …)` and `bodies.get(id)` read the local.
- `runFrame.ts:228`: `if (id !== null)` around the `sceneBodyStates(...).get(id)` lookup.
- `stepCameraRuntime.ts:120`: `focusBodyId: focusDriverId(focus) as BodyId | null` — the `as BodyId` cast predates this task (an S-star row's id is not a `BodyId` today either) and is not widened here.
- Not sites: `focusFraming`, `pivotFraming`, `logCameraState`, `urlHashFor`, `targetIdentityKey`, `hashParamSources`, `watchFlyToLonLatSaga`, `detailCardTable` — each reads an arm-specific field (seed radius, URL prefix, card), so the discriminant is the right dispatch there and PR 2 grows a `starCatalog` case.

- [ ] Add `tests/utils/camera/focusDriverId.test.ts`: `it.each` over one row per `SelectionRow` arm (`galaxyCatalog`, `structure`, `milkyWay`, `zoneOfAvoidance`, `body`, `star`) plus `null`, asserting `body` → its id and everything else → `null`. It fails on a wrong arm mapping the compiler cannot see; it is also the table PR 2 extends.
- [ ] Implement `focusDriverId` and rewrite the six sites as above; update `liveBodyPosition`'s header ("four callers share it" stays true) and `bodyMovesThisFrame`'s header wording only if it now reads wrong.
- [ ] `npm run typecheck:fast && npm test -- camera focusDriverId liveBodyPosition bodyMovesThisFrame approachTiltedPose runFrame stepCameraRuntime` → green with no assertion changes elsewhere (the identity check: body rows still resolve, non-body rows still don't).
- [ ] Commit: `refactor(camera): focusDriverId replaces the body-arm gates`.

---

### Task 4: `computeStarCut` splits into a pure read and `advanceStarFades`

**review: yes** (a landmine-owning file: the NEAR0/f64-rebase seam)

Why v2: main's #769 ("several views per frame") reshaped the star cut before this branch landed. The intent is unchanged (spec §3 commit 4: the `advanceFades` flag, `PreparedStarCut.anyNodeFading` go; one WRITE half called from `runFrame`, one pure READ half), the shapes now follow main's multi-view contract. Everything below names main's code as it is after the rebase.

**Files:**

- Create: `src/services/gpu/renderers/starCatalog/cut/advanceStarFades.ts`, `src/services/gpu/renderers/starCatalog/cut/frameStarCutFrustum.ts`
- Modify: `src/services/gpu/renderers/starCatalog/cut/computeStarCut.ts` (drops the flag; pure), `src/services/gpu/renderers/starCatalog/cut/readStarCut.ts` (call + header), `src/services/gpu/renderers/starCatalog/cut/starCutFor.ts` (header only if it names the flag), `src/services/gpu/renderers/starCatalog/cut/starFadeState.ts` (header only if it names `advanceFades`/`computeStarCut` as the writer)
- Modify: `src/@types/rendering/PreparedStarCut.d.ts` (drop `anyNodeFading`), `src/services/engine/frame/runFrame.ts` (the "Star-cut planner" block, ~lines 341-358, and `starFadeAnimating` ~line 384)
- Test: `tests/services/gpu/renderers/starCatalog/cut/readStarCut.test.ts`, `tests/services/engine/frame/passes/starAggregatesPass.test.ts` (the helper at ~95-98 that mirrors `runFrame`), `tests/services/gpu/renderers/starCatalog/cut/starPickLeafDraws.test.ts` (~line 70, `anyNodeFading: false` in a fixture); grep `advanceFades` and `anyNodeFading` in `src/` and `tests/` → zero hits when done
- Backlog: delete `docs/backlog/2026-08-20-star-catalog-layer-god-layer-split.md` and its `docs/BACKLOG.md` index line (this task consumes it)

**Interfaces:**

```ts
// cut/advanceStarFades.ts — the WRITE half and the ONLY writer of the per-node
// LOD fade ramps. runFrame calls it once per real frame with the frame's views
// (views[0] is the anchor: its eye, its viewSlot, its snapshot.nowMs; the
// union of every view's frustum prunes the walk — main's views[0]-is-anchor
// contract, unchanged). Returns the keep-ticking vote (a node mid-fade).
// runFrame's views are never capture faces.
export function advanceStarFades(state: PassState, views: readonly FrameView[]): boolean;

// cut/computeStarCut.ts — PURE: never touches a ramp or a stamp.
export function computeStarCut(state: PassState, views: readonly FrameView[]): PreparedStarCut | null;

// cut/frameStarCutFrustum.ts — main's inline "rebasedVps + smallest drawPxPerRad
// → buildStarCutFrustum" block (computeStarCut.ts ~lines 103-119), shared by the
// advance walk and the capture-face walk. null with no NEAR0 slab on some view
// (a hand-built test ctx), exactly as today.
export function frameStarCutFrustum(
  views: readonly FrameView[],
  camPos: Readonly<Vec3>,
  sizePx: number,
  glowOverlap: number,
): StarCutFrustum | null;

// PreparedStarCut — `anyNodeFading` removed; the vote is advanceStarFades's return
```

**Behaviour (pixel-identical for every real frame view):**

- `advanceStarFades` is main's advancing branch minus emission: renderer null or master off → `false`, no walk. Per loaded source with crossfade > 0 (same two gates as today), walk (`walkStarOctreeCut` with the frame frustum), stamp `inCutFrame`, seed newcomers at 0, step every cut node toward 1 and every previously-active node outside the cut toward 0, rebuild the active list, swap the double buffer. The active list after the swap (`prevActiveList[0..prevActiveCount)`) is exactly the set main's advance emitted, in the same order (main's `advanceNode` pushes to `activeList` and emits in one place — keep the push, drop the emit). No streams are touched.
- `computeStarCut(state, views)`: `views[0].viewKind === 'capture'` → build the frustum, walk fresh, emit every cut node at `1 × sourceCrossfade` (as today). Otherwise → per source with crossfade > 0, emit each node on the catalog's active list at `opacity[idx] × sourceCrossfade`; NO walk and NO frustum build. Shader scalars (`sizePx`, `brightness`, `glowOverlap`, `aggregateIntensityCap`) unchanged. A catalog no advance has reached yet has an empty list and draws nothing, which is what today's opacity-0 records drew. `streamsFor(catalog, views[0].viewSlot)` as today.
- `runFrame` planner block becomes, with the comment rewritten to ≤ 6 lines (once per frame, before the passes, sole ramp writer; the cut is handed to the renderer as a value via `setFrameCut` so every rig view's `starCutFor` reads one cut; the vote feeds `shouldKeepTicking`):
  ```ts
  const starFadeAnimating = advanceStarFades(state, views);
  state.gpu.starCatalogRenderer?.setFrameCut(computeStarCut(state, views));
  ```
  and `starFadeAnimating,` replaces `starFadeAnimating: starCut?.anyNodeFading ?? false,`.
- `readStarCut` keeps its per-ctx WeakMap memo and calls `computeStarCut(state, [ctx])`. `starCutFor` unchanged. The pick path's fresh post-frame ctx (a `'frame'` view) now emits the drawn set without a walk — the one sanctioned observable delta (spec §3 commit 4).
- `computeStarCut.ts`'s header: keep the NEAR0/f64 landmine paragraph (the capture-face walk still owns it), drop the `advanceFades` sentences, keep the `views[0]`-is-anchor paragraph, point the fade scheme at `advanceStarFades` / `starFadeState`. `advanceStarFades.ts` header ≤ 5 lines.

**Steps:**

- [ ] Extract `frameStarCutFrustum.ts` from main's inline block; `computeStarCut` calls it (no behaviour change). `npx vitest run tests/services/gpu/renderers/starCatalog tests/services/engine/frame/passes/starAggregatesPass.test.ts` → green before the split.
- [ ] Rework `readStarCut.test.ts` (fixtures at ~36-82 stay; `makeCtx` unchanged):
  - the `advance(state, ctx)` helper (~line 80) becomes `advanceStarFades(state, [ctx]); return readStarCut(state, ctx);` — every simulated frame keeps its fresh ctx;
  - `f.anyNodeFading` assertions (~312-324, ~446-456) read the boolean `advanceStarFades` returned; the capture test at ~446 ("a capture result reports anyNodeFading === false…") is DELETED — its subject is the removed field;
  - the three `readStarCut partition` tests and `forwards the source-independent shader scalars` gain one `advanceStarFades(state, [ctx])` before the read (the first frame snaps to steady state, so counts are unchanged);
  - `memoises on the ctx object so the walk runs once per frame` (~221) keeps its intent: two reads on the same ctx call `renderer.loadedCatalogs` once;
  - keep `readStarCut alone never advances a ramp — two different ctx objects at the same nowMs leave opacity unchanged` verbatim in intent (the double-advance-class guard the spec names);
  - add `it('advanceStarFades steps a ramp once per call, whatever readStarCut does around it')` — advance at 0 ms (snap), advance at 50 ms, read twice on fresh ctxs, advance at 100 ms; assert the leaf opacity after the third advance is `crossfade × 100/250`, i.e. two steps, not four;
  - the `the frame star cut over several views` block (~460-545): `computeStarCut(state, [a, b], true)` frames become `advanceStarFades(state, [a, b]); computeStarCut(state, [a, b])`; the perf-cliff regression (~521, "a frame view NOT in the advance list still reads the frame cut, with no second walk") keeps its assertion shape against `setFrameCut`/`starCutFor`;
  - the `starCatalogVisible agrees with the cut it gates` tests, if present, stay as is (they leave with PR 2).
- [ ] Implement `advanceStarFades.ts` and the reduced `computeStarCut.ts`; drop `anyNodeFading` from `PreparedStarCut` and from `starPickLeafDraws.test.ts`; rewire `runFrame.ts`; update the `starAggregatesPass.test.ts` helper to `advanceStarFades(state, [ctx]); const cut = computeStarCut(state, [ctx]); …setFrameCut(cut)`.
- [ ] Reword any `advanceFades` / "the one advancing call" mentions in `readStarCut.ts`, `starCutFor.ts`, `starFadeState.ts`. Grep `advanceFades` and `anyNodeFading` → zero hits in `src/` and `tests/`.
- [ ] Delete the backlog detail file and its `docs/BACKLOG.md` line.
- [ ] `npm run typecheck:fast` (src clean) and `npx vitest run` (full suite) → green.
- [ ] Commit: `refactor(stars): computeStarCut is pure; advanceStarFades steps the LOD ramps from runFrame`.

---

## Definition of Done

**Deliverable inventory**

- `src/@types/engine/layer/LayerGuides.d.ts` exists; `LayerLabels.d.ts` does not; `Layer` has `guides?` and no `labels?`.
- `EngineState.orbitTrailRows` composed by `createLayers`; `orbitTrailsPass` has no static-table import; `CORE_TRAIL_ELEMENTS` is the only name for core's rows.
- `src/state/settings/core/orbitTrails/` holds the cluster; `src/layers/body/state/orbitTrails/` does not exist; `bodyLayerSettings` has three slices.
- `src/utils/camera/focusDriverId.ts` exists and is the only body-arm test in the six listed sites.
- `advanceStarFades.ts` and `frameStarCutFrustum.ts` exist; `computeStarCut` has no `advanceFades` flag (two arguments: state, views); `PreparedStarCut` has no `anyNodeFading`.
- `docs/backlog/2026-08-20-star-catalog-layer-god-layer-split.md` deleted with its index line.

**Observable behaviours (manual pass on the main app, user's eyes)**

- Orbit trails: Earth / Jupiter / Moon conics draw as before; the S-star conics draw at Sgr A*; the Labels & Guides toggle still hides them with the fade.
- Camera: focusing Earth follows it; focusing the Sun frames it without following; focusing S2 follows its orbit; the approach tilt still engages on a planet.
- Stars: the Gaia LOD dissolve is unchanged on approach and retreat (no pop, no frozen mid-fade); the sky cubemap capture still shows stars; hovering a star still picks it.
- `npm run build` passes on both compositions (the reference engine composes no star Layer yet).

**Deferral boundary**

- Nothing star-Layer-shaped lands here: no `starCatalog` selection arm, no `StarInfo`, no Sun/S-star retyping, no `guides.orbitTrails` contributor. Those are PR 2.
- Adjacent findings stay out: `SCENE_BODIES` mixing stars, `ORBIT_REACH_BY_REGION` derived from the static table (a harmless superset once Layers contribute), `starRenderer`'s single-uniform caveat, the two `starCatalogVisible` reference-identity tests.
- Perf gate on Task 4 (user ruling): CPU bench over the production entry points against `stars-large.bin`, plus `npm run perf` on `star-field` and `milky-way` at 60 frames, before and after; a regression outside run-to-run noise halts the landing.
