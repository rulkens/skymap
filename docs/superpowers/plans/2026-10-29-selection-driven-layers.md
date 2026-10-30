# Selection-driven Layers Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The selection refs become the only selection state: core places a moving selection in the
frame snapshot, Layers read the selection from core (`PassState`, `DemandCtx`), and a select or focus
switches its subject's section on.

**Architecture:** Part A (PR #974, prep 1–3) moves satellite placement from a Layer-written global
registry into one per-frame core step, then removes the satellites Layer's selection mirror and
`LayerCoreDeps.store`. Part B (its own PR) adds `ShowEntry.selects` and one core reveal saga.

**Tech Stack:** TypeScript, Redux Toolkit + typed-redux-saga, Vitest.

**Spec:** `docs/superpowers/specs/2026-10-29-selection-driven-layers-design.md`

## Global Constraints

- Layer contract: only `DemandCtx.selectedKinds` (new), `ShowEntry.selects` (new, optional) and
  `LayerCoreDeps.store` → two thunks may change. Anything else on `src/@types/engine/layer/*`,
  `SelectionKindRow` or `DemandCtx`: STOP and report.
- No function enters the Redux store (`selectionRows` lives there).
- Placement runs after `deriveBodyStates` returns, never inside it: the satellites row's
  `extractRow` calls `deriveBodyStates(simDays)` itself (`satellitesSelectionRow.ts:52`).
- Hover never places, never demands, never reveals.
- Frame files (`src/services/engine/frame/**`) export only their own symbol (`frameFilePurity` ratchet).
- Repo conventions: `type` not `interface`; one function per `utils/` file, one type per `@types/` file;
  comments explain why (header ≤ 10 lines); `npx prettier --write <files>`; stage explicit paths;
  no Co-Authored-By trailer.

## Review Focus

1. A satellite focused while the catalog is still loading: placement skips it (row null) and the
   camera keeps waiting, no throw. Task 1 test "a ref whose extractRow returns null is left out".
2. Select and focus on the same satellite: one entry, no double work. Task 1 test.
3. Clock paused, satellite focused: the snapshot is still placed each frame (camera stays welded).
   Task 2 covers via the ported follow test; perf is measured in Task 7.
4. A cold satellite link with Satellites off: reveal → demand → arrival. Task 6 saga test.
5. A hover sweep across satellites never loads the catalog or flips a switch. Tasks 4 and 6 tests.

---

## Part A — PR #974: core owns the selection (prep 1–3)

### Task 1: `placeLiveSelection`

review: yes (camera follow)

**Files:**
- Create: `src/services/engine/frame/placeLiveSelection.ts`
- Test: `tests/services/engine/frame/placeLiveSelection.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export function placeLiveSelection(
    base: ReadonlyMap<PositionedId, BodyState>,
    slots: readonly { readonly ref: SelectionRef | null; readonly row: SelectionRow | null }[],
    kindRows: readonly SelectionKindRow[],
    simDays: number,
  ): ReadonlyMap<PositionedId, BodyState>;
  ```
  For each slot whose `row`'s driver (`selectionDriver(row)`) has `followsSimClock === true` and a
  non-null `poseId`, it calls the kind row matching `ref.type`'s `extractRow(ref, simDays)`; a non-null
  result adds `poseId → { positionMpc: result.positionMpc, orientation: <fresh identity Mat3> }` (what
  `orientationForBody` gives an id with no rotation row; `orbit` absent) to a COPY of `base`. No slot
  qualifies → returns `base` itself.

- [x] **Step 1: Write the failing tests** (stub kind rows; no catalog needed)
  - `returns the same Map when no slot follows the sim clock` — `expect(out).toBe(base)` for a body row.
  - `places a followsSimClock focus row under its poseId at simDays` — the stub's `extractRow` records
    `simDays`; `out.get(poseId)!.positionMpc` equals the stub's position; `base` is unmodified.
  - `leaves out a ref whose extractRow returns null` — `out.has(poseId) === false`.
  - `places select and focus of the same ref once` — the stub's `extractRow` is called once.
- [x] **Step 2: Run** `npx vitest run tests/services/engine/frame/placeLiveSelection.test.ts` — FAIL (module missing).
- [x] **Step 3: Implement** in `placeLiveSelection.ts`.
- [x] **Step 4: Run** the same — PASS.
- [x] **Step 5: Commit** `refactor(frame): placeLiveSelection, the frame's moving selection`.

### Task 2: The frame places the selection; the registry goes

review: yes (camera follow, frame snapshot identity)

**Files:**
- Modify: `src/services/engine/frame/runFrame.ts:91` (place once), `src/services/engine/frame/frameContext.ts:53`
  (take the placed map), the type of `deriveFrameContext`'s input (`FrameContextInput`, built by
  `frameContextInputOf.ts`) gains `bodyStates: ReadonlyMap<PositionedId, BodyState>`,
  `src/services/engine/frame/sceneBodyStates.ts:35` (return `ctx.snapshot.bodyStates`; update its header:
  `state` stays unread, the epoch and the placement now live in `runFrame`)
- Modify: `src/services/engine/frame/deriveBodyStates.ts` (delete step 1e `:122-127`, the registry
  version in the memo `:46-62`, its header line 9)
- Modify: `src/layers/satellites/subsystems/satellitePositioner.ts` → plain
  `satellitePositioner(cat: SatelliteCatalog, k: number, simDays: number, earthMpc: Readonly<Vec3>): Vec3 | null`;
  callers `satellitesSelectionRow.ts:52`, `tests/layers/satellites/subsystems/satelliteOrbitEllipse.test.ts:39`
- Modify: `src/layers/satellites/subsystems/createSelectedSatellites.ts` (drop the `transientPositions`
  half; `any()`/`tracked()` stay until Tasks 3–4), its test
- Modify: comments naming the registry: `DriverGeometry.d.ts:26-30` (`followsSimClock` = "core re-extracts
  this row every frame to place it", `placeLiveSelection`), `SelectionRow.d.ts:48`, `positionDrivers.ts:40`,
  `satellitesSelectionRow.ts` header
- Delete: `src/services/bodies/transientPositions.ts`, `src/@types/scene/TransientPositioner.d.ts`,
  `tests/services/bodies/transientPositions.test.ts`
- Port: `tests/services/engine/camera/transientFollow.test.ts` onto `placeLiveSelection` (the camera
  still follows a moving transient; build the snapshot the way `runFrame` now does)
- Modify: `tests/layers/satellites/present/satellitesSelectionRow.test.ts` (stop seeding the registry)

**Interfaces:**
- Consumes: `placeLiveSelection` (Task 1).
- Produces: `ctx.snapshot.bodyStates` and the camera step's `bodies` both include the moving selection;
  `sceneBodyStates(state, ctx)` returns `ctx.snapshot.bodyStates`. `TransientBodyId` stays (it is the
  `poseId` key).

- [x] **Step 1:** `runFrame.ts:91`: `placeLiveSelection(deriveBodyStates(simDays), [select, focus], state.selectionKindRows, simDays)`
  with each slot's `ref` from `stored.selection` and `row` from `stored.selectionRows`; pass the result
  as the camera step's `bodies` and into `deriveFrameContext` through its input.
- [x] **Step 2:** `frameContext.ts:53` reads `input.bodyStates` instead of calling `deriveBodyStates`.
- [x] **Step 3:** `sceneBodyStates` returns `ctx.snapshot.bodyStates`. If any caller passes a `ctx` without a
  ready snapshot, STOP and report the site.
- [x] **Step 4:** Delete the registry, step 1e and the memo's registry version; change `satellitePositioner`
  to the plain signature; drop the registry half of `createSelectedSatellites`.
- [x] **Step 5:** Port `transientFollow.test.ts`; delete `transientPositions.test.ts`; fix the selection-row test.
- [x] **Step 6: Run** `npm run typecheck` and `npx vitest run tests/services/engine tests/layers/satellites` — PASS;
  `grep -rn "transientPositions" src tests` — no hits.
- [x] **Step 7: Commit** `refactor(frame): core places the moving selection; transientPositions goes`.

### Task 3: The trail pass reads `PassState.selection`

**Files:**
- Modify: `src/layers/satellites/passes/satelliteOrbitsPass.ts` (`:30`, `:53`), `src/layers/satellites/subsystems/satelliteOrbitEllipse.ts`
  (take `satrec` and `epochMs` as plain arguments, not a `TrackedSatellite`)
- Modify: `src/layers/satellites/@types/SelectedSatellites.d.ts` (drop `tracked`), `src/layers/satellites/subsystems/createSelectedSatellites.ts`
- Delete: `src/layers/satellites/@types/TrackedSatellite.d.ts`; the `tracked()` case in
  `tests/layers/satellites/subsystems/createSelectedSatellites.test.ts`
- Modify: `tests/layers/satellites/subsystems/satelliteOrbitEllipse.test.ts` (new argument shape)

**Interfaces:**
- Produces: the pass reads `state.selection.select` and `state.selection.focus`, keeps `type === 'satellite'`
  refs (deduped), and per ref resolves `k = catalogIndexOf(catalog, noradId)` and `satrecOf(catalog, k)` each
  frame (≤ 2 refs; no memo unless Task 7's perf run asks for one). `enabled` returns false when no such ref
  resolves.

- [x] **Step 1:** Rewrite the pass's selection read and `satelliteOrbitEllipse`'s arguments; delete `tracked`.
- [x] **Step 2: Run** `npm run typecheck`, `npx vitest run tests/layers/satellites` — PASS. No new test: the
  weld test (`satelliteOrbitEllipse.test.ts`) still pins the geometry; the selection read is routing.
- [x] **Step 3: Commit** `refactor(satellites): the trail pass reads the selection from PassState`.

### Task 4: Demand reads `selectedKinds`; the mirror and `LayerCoreDeps.store` go

review: yes (Redux state)

**Files:**
- Modify: `src/@types/loading/DemandCtx.d.ts` (add the member below, a surface entry 6 in its header),
  `src/services/engine/wiring/buildDemandCtx.ts:15`, `tests/services/engine/wiring/buildDemandCtx.test.ts`
- Modify: `src/layers/satellites/load/satellitesAssetRows.ts:40,45` (+ header), its test
- Modify: `src/@types/engine/layer/LayerCoreDeps.d.ts:24-25`, `src/services/engine/phases/createLayers.ts:85-97`,
  `src/layers/body/create.ts:95`, `src/layers/starCatalog/create.ts:95`, `src/layers/milkyWay/create.ts:21`
  (comment) — re-apply commit `efe978552` (`git show efe978552`), adjusted to today's files
- Modify: `src/layers/satellites/create.ts`, `destroy.ts`, `@types/SatellitesRuntime.d.ts`
- Delete: `src/layers/satellites/subsystems/createSelectedSatellites.ts`, `@types/SelectedSatellites.d.ts`,
  `tests/layers/satellites/subsystems/createSelectedSatellites.test.ts`

**Interfaces:**
- Produces:
  ```ts
  // DemandCtx
  /** Kinds in the select and focus slots; hover never counts. */
  selectedKinds: ReadonlySet<SelectionRef['type']>;
  // LayerCoreDeps (replacing `store`)
  readonly settings: () => Readonly<EngineSettingsState>;
  readonly debugPanelOpen: () => boolean;
  ```
  The satellites row demands with `ctx.selectedKinds.has('satellite')` where it read `runtime.selected.any()`.

- [x] **Step 1: Write the failing test** in `buildDemandCtx.test.ts`:
  `selectedKinds holds the select and focus kinds, never hover` — select `{type:'satellite'}`, focus
  `{type:'body'}`, hover `{type:'starCatalog'}` → `[...ctx.selectedKinds].sort()` equals `['body','satellite']`.
- [x] **Step 2: Run** `npx vitest run tests/services/engine/wiring/buildDemandCtx.test.ts` — FAIL.
- [x] **Step 3:** Add the member and fill it in `buildDemandCtx`; switch the asset row; update its test's stub
  ctx (`selectedKinds`) and drop `runtime.selected` from it.
- [x] **Step 4:** Delete `createSelectedSatellites`/`SelectedSatellites` and the runtime field; replace
  `LayerCoreDeps.store` with the two thunks.
- [x] **Step 5: Run** `npm run typecheck`, full `npm test` — PASS; `grep -rn "deps\.store\|createSelectedSatellites" src` — no code hits.
- [x] **Step 6: Commit** `refactor(layers): demand reads selectedKinds; Layers stop holding the store`.

---

## Part B — its own PR: a select or focus reveals its subject

### Task 5: `ShowEntry.selects`

**Files:**
- Modify: `src/@types/engine/layer/ShowEntry.d.ts:9` (beside `bodies`)
- Modify: `src/layers/satellites/visibility.ts` (`satellites` → `['satellite']`), `src/layers/starCatalog/visibility.ts:21`
  (`starCatalog` → `['starCatalog']`, NOT `sStarTrails`), `src/layers/milkyWay/visibility.ts:8`
  (`milkyWayDisk` → `['milkyWay']`), `src/layers/zoneOfAvoidance/visibility.ts` (→ `['zoneOfAvoidance']`)
- Create: `src/utils/visibility/assertSelectsDisjoint.ts` + test; call it beside `assertSelectionRowsDisjoint`
  (`createLayers.ts:216`)

**Interfaces:**
- Produces:
  ```ts
  /** Selection kinds this entry's switch hides: selecting one switches it on. */
  readonly selects?: readonly SelectionRef['type'][];
  ```
  `assertSelectsDisjoint(entries: readonly VisibilityEntry[]): void` throws naming the kind when two entries
  list it.

- [ ] **Step 1: Write the failing test** `throws when two show entries select the same kind` (and passes for
  `APP_VISIBILITY`).
- [ ] **Step 2–4:** Run (FAIL), implement, run (PASS).
- [ ] **Step 5: Commit** `feat(visibility): show entries name the selection kinds they hide`.

### Task 6: `watchSelectionRevealSaga`

review: yes (sagas)

**Files:**
- Create: `src/state/selection/watchSelectionRevealSaga.ts`, `tests/state/selection/watchSelectionRevealSaga.test.ts`
- Modify: the root saga list where `watchSelectionWakeSaga` is registered
- Modify: `src/layers/satellites/load/satellitesAssetRows.ts` header and `docs/superpowers/specs/completed/2026-10-28-earth-satellites-design.md:13-14`
  (a cold satellite link now reveals)
- Create: a cold-link arrival test (beside `src/state/arrival/arrivalSaga.ts`'s tests)

**Interfaces:**
- Consumes: `ShowEntry.selects` (Task 5), `setVisibilityActionsFor`, `hasSectionSwitch`, `suspendDuringClip`, `APP_VISIBILITY`.
- Produces: on `updateSelectionSelect` / `updateSelectionFocus` only, wrapped in `suspendDuringClip`: find the
  entry whose `selects` holds the new ref's type; if its cluster `hasSectionSwitch` and that switch is off,
  `put` each of `setVisibilityActionsFor(settings, entry.key, true)`. Otherwise nothing.

- [ ] **Step 1: Write the failing tests**
  - `switches Satellites on when a satellite is focused with the section off`
  - `does nothing on hover` (`updateSelectionHover` with a satellite)
  - `does nothing during a clip`
  - `does nothing when the section is already on`
  - `writes nothing for a kind no entry selects` (`body`)
  - arrival: `a cold satellite deep link with Satellites off reveals, loads and arrives` — Satellites off,
    `#focus=satellite-25544`; expect `setVisibility({cluster:'satellites', field:'enabled', on:true})` before
    `arrived()` and no `arrivalFailed`. Use the existing arrival test harness; stub the catalog slot to land.
- [ ] **Step 2–4:** Run (FAIL), implement, register, run (PASS).
- [ ] **Step 5: Commit** `feat(selection): a select or focus switches its subject's section on`.

### Task 7: Verification

- [ ] **Step 1:** Perf: `npm run perf:cpu -- --url http://localhost:<wt port>` at an Earth pose with the ISS
  focused, clock running and paused, main vs branch. A regression over 0.1 ms/frame → add the one-entry
  satrec memo in the satellites row and re-measure.
- [ ] **Step 2:** Eye-check pairs (main vs branch, deep links): cold `#focus=satellite-25544&t=2026-10-29T12:00:00Z`
  (main: 30 s veil, then Earth; branch: arrives at the ISS), and the ISS trail/follow at 1 h/s.
- [ ] **Step 3:** `/feature-done`.

## Definition of Done

- [ ] `grep -rn "transientPositions\|createSelectedSatellites\|deps\.store" src` has no code hits.
- [ ] `npm run typecheck` and `npm test` green; CI green on both PRs.
- [ ] A cold satellite deep link with Satellites off arrives (saga test + eye-check).
- [ ] Hover never loads the catalog or flips a switch (tests).
- [ ] Perf at the ISS pose within 0.1 ms/frame of main, running and paused.
- [ ] Only the three consented Layer-contract changes landed.
- [ ] Plan and spec filed under `*/completed/` by `/feature-done`.
