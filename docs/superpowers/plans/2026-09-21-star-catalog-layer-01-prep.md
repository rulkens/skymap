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

**Files:**

- Create: `src/services/gpu/renderers/starCatalog/cut/advanceStarFades.ts`, `src/services/gpu/renderers/starCatalog/cut/frameStarCutFrustum.ts`
- Modify: `src/services/gpu/renderers/starCatalog/cut/computeStarCut.ts`, `src/services/gpu/renderers/starCatalog/cut/readStarCut.ts` (header), `src/services/gpu/renderers/starCatalog/cut/starCutOncePerCtx.ts` (header), `src/services/gpu/renderers/starCatalog/cut/starFadeState.ts` (header, if it names `advanceStarCut`)
- Delete: `src/services/gpu/renderers/starCatalog/cut/advanceStarCut.ts`
- Modify: `src/@types/rendering/PreparedStarCut.d.ts` (drop `anyNodeFading`), `src/services/engine/frame/runFrame.ts:36,296-312,336`
- Test: `tests/services/gpu/renderers/starCatalog/cut/readStarCut.test.ts`, `tests/services/gpu/renderers/starCatalog/cut/starPickLeafDraws.test.ts:69`; grep `advanceStarCut` in `tests/` for comments to reword (`starAggregatesPass.test.ts`, `shouldKeepTicking.test.ts`)
- Backlog: delete `docs/backlog/2026-08-20-star-catalog-layer-god-layer-split.md` and its `docs/BACKLOG.md` index line (this task consumes it)

**Interfaces:**

```ts
// cut/advanceStarFades.ts — the WRITE half. runFrame calls it once per real frame,
// before any pass reads the cut. Returns the keep-ticking vote (a node mid-fade).
export function advanceStarFades(state: PassState, ctx: ReadyFrameContext): boolean;

// cut/computeStarCut.ts — pure: never touches a ramp or a stamp
export function computeStarCut(state: PassState, ctx: ReadyFrameContext): PreparedStarCut | null;

// cut/frameStarCutFrustum.ts — the NEAR0-rebased prune frustum both halves share
// (today's computeStarCut.ts:99-110 block); null with no NEAR0 slab (a hand-built test ctx)
export function frameStarCutFrustum(state: PassState, ctx: ReadyFrameContext): StarCutFrustum | null;

// PreparedStarCut — `anyNodeFading` removed; the vote is advanceStarFades's return
```

**Behaviour (pixel-identical):**

- `advanceStarFades` is today's advancing branch minus emission: per loaded source with crossfade > 0 it walks the octree (`walkStarOctreeCut`), stamps `inCutFrame`, seeds newcomers at 0, steps every cut node toward 1 and every previously-active node outside the cut toward 0, rebuilds the active list and swaps the double buffer. The active list after the swap (`prevActiveList[0..prevActiveCount)`) is exactly the set today's advance emitted, in the same order. Skips the walk entirely when the renderer is null or the master toggle is off (returns `false`).
- `computeStarCut`, main view (`viewSlot === 0`): per source with crossfade > 0, emits each node on the catalog's active list at `opacity[idx] × sourceCrossfade` — no walk. Capture face (`viewSlot !== 0`): walks fresh and emits every cut node at `1 × sourceCrossfade`, as today. Shader scalars (`sizePx`, `brightness`, `glowOverlap`, `aggregateIntensityCap`) unchanged. A fresh catalog read before any advance draws nothing, which is what today's opacity-0 records drew.
- `runFrame`: `const starFadeAnimating = advanceStarFades(state, ctx);` replaces the `advanceStarCut` call; feeds `shouldKeepTicking` directly. The planner comment block (`runFrame.ts:296-311`) is rewritten to the new names in ≤ 6 lines: once per frame, before the passes, sole ramp writer, the read half is memoised per ctx.
- The per-ctx memo is unchanged: `readStarCut` still wraps `computeStarCut`; the pick path's fresh post-frame ctx now reads the drawn set (active list) instead of re-walking, which is the same set for the same camera and cheaper.
- `computeStarCut.ts`'s header: keep the NEAR0/f64 landmine paragraph (the capture-face walk still owns it), drop the `advanceFades` sentences, point the fade scheme at `advanceStarFades` / `starFadeState`.

- [ ] Add `frameStarCutFrustum.ts` by extracting the block; `computeStarCut` calls it (no behaviour change). Run `npm test -- readStarCut starCatalogPass` → green before the split.
- [ ] Rework `readStarCut.test.ts` (its describe blocks and fixtures at lines 24-70 stay):
  - every `advanceStarCut(state, ctx)` frame becomes `advanceStarFades(state, ctx); readStarCut(state, ctx)` on the same ctx, and `f.anyNodeFading` assertions read the boolean `advanceStarFades` returned;
  - the three `readStarCut partition` tests and `forwards the source-independent shader scalars` gain a single `advanceStarFades(state, ctx)` before the read (the first frame snaps to steady state, so `leaf.count` / `aggregate.count` are unchanged);
  - `advanceStarCut populates the SAME memo…` becomes `it('advanceStarFades never primes the memo; the first readStarCut on a ctx walks nothing and emits the active list')` — assert `renderer.loadedCatalogs` called twice (once by the advance, once by the read) and the read's `leaf.count` equals the advanced set;
  - keep `readStarCut alone never advances a ramp — two different ctx objects at the same nowMs leave opacity unchanged` verbatim in intent: it is the double-advance-class guard the spec names;
  - add `it('advanceStarFades steps a ramp once per call, whatever readStarCut does around it')` — advance at 0 ms (snap), advance at 50 ms, read twice on fresh ctxs, advance at 100 ms; assert the leaf opacity after the third advance is `crossfade × 100/250`, i.e. two steps not four;
  - the `starCatalogVisible agrees with the cut it gates` block stays as is (`sources.length > 0` is unaffected by the split); it leaves with PR 2, not here.
- [ ] Implement `advanceStarFades.ts` and the reduced `computeStarCut.ts`; delete `advanceStarCut.ts`; drop `anyNodeFading` from `PreparedStarCut` and from `starPickLeafDraws.test.ts:69`; rewire `runFrame.ts`.
- [ ] Reword the `advanceStarCut` mentions in `readStarCut.ts`, `starCutOncePerCtx.ts`, `starFadeState.ts`, `starAggregatesPass.test.ts`, `shouldKeepTicking.test.ts`. Grep `advanceStarCut` → zero hits.
- [ ] Delete the backlog detail file and its `docs/BACKLOG.md` line.
- [ ] `npm run typecheck:fast && npm test -- starCatalog readStarCut starPick shouldKeepTicking runFrame frameFilePurity` → green.
- [ ] Commit: `refactor(stars): computeStarCut is pure; advanceStarFades steps the LOD ramps from runFrame`.

---

## Definition of Done

**Deliverable inventory**

- `src/@types/engine/layer/LayerGuides.d.ts` exists; `LayerLabels.d.ts` does not; `Layer` has `guides?` and no `labels?`.
- `EngineState.orbitTrailRows` composed by `createLayers`; `orbitTrailsPass` has no static-table import; `CORE_TRAIL_ELEMENTS` is the only name for core's rows.
- `src/state/settings/core/orbitTrails/` holds the cluster; `src/layers/body/state/orbitTrails/` does not exist; `bodyLayerSettings` has three slices.
- `src/utils/camera/focusDriverId.ts` exists and is the only body-arm test in the six listed sites.
- `advanceStarFades.ts` and `frameStarCutFrustum.ts` exist; `advanceStarCut.ts` does not; `computeStarCut` takes two arguments; `PreparedStarCut` has no `anyNodeFading`.
- `docs/backlog/2026-08-20-star-catalog-layer-god-layer-split.md` deleted with its index line.

**Observable behaviours (manual pass on the main app, user's eyes)**

- Orbit trails: Earth / Jupiter / Moon conics draw as before; the S-star conics draw at Sgr A*; the Labels & Guides toggle still hides them with the fade.
- Camera: focusing Earth follows it; focusing the Sun frames it without following; focusing S2 follows its orbit; the approach tilt still engages on a planet.
- Stars: the Gaia LOD dissolve is unchanged on approach and retreat (no pop, no frozen mid-fade); the sky cubemap capture still shows stars; hovering a star still picks it.
- `npm run build` passes on both compositions (the reference engine composes no star Layer yet).

**Deferral boundary**

- Nothing star-Layer-shaped lands here: no `starCatalog` selection arm, no `StarInfo`, no Sun/S-star retyping, no `guides.orbitTrails` contributor. Those are PR 2.
- Adjacent findings stay out: `SCENE_BODIES` mixing stars, `ORBIT_REACH_BY_REGION` derived from the static table (a harmless superset once Layers contribute), `starRenderer`'s single-uniform caveat, the two `starCatalogVisible` reference-identity tests.
- No perf gate: no renderer path changes.
