# Unify Disk-Planner Catalog Walks Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

## Goal

Merge the two per-frame disk-planner catalog walks (LOD-1 `proceduralDiskSubsystem`, LOD-2 `texturedDiskSubsystem`) into ONE shared walk. Today each planner independently walks every visible catalog, reads each row's position, computes `camDistSq`, takes a `sqrt`, and computes apparent-size `px` — the geometry is computed **twice per row** and is ~82% of frame CPU (~4.2 ms of a 5.1 ms frame, M1 Max; see `docs/backlog/2026-06-30-unify-disk-planner-walks.md`). After this change the shared walk computes each row's geometry **once** and hands it to two injected row-reducers (procedural body first, textured body second).

The two subsystems stay separate objects with their own identity, sticky map, output array, sort, and extra surface. Only the walk is shared.

## Architecture

**Shape (pinned by the backlog design + this plan):**

- A new **stateful walk factory** `createDiskPlannerWalk({ decimationFactor })` owns the SINGLE shared per-source stride cursor and drives the loop once. Its `runFrame(input, procedural, textured)` iterates catalogs, and for each surviving row calls `procedural.onRow(...)` then `textured.onRow(...)` at two **distinct, monomorphic** call sites.
  - **Why a factory, not a pure `utils/` helper (one-line justification):** the shared stride cursor is genuine cross-frame state with exactly one home (constraint: "a SINGLE shared cursor per source"). A factory owns it cleanly and keeps `runFrame.ts` free of loose per-source bookkeeping; a pure helper would force the one cursor map to be threaded through the frame call site.
  - It lives at `src/services/engine/subsystems/diskPlannerWalk.ts` (a per-frame planner, sibling to the two it drives).
- Each subsystem exposes a **row-reducer / visitor view**: `beginFrame(input): DiskRowVisitor`. The returned visitor closes over that subsystem's sticky map, per-frame output accumulator, and per-body extras (procedural: optional atlas for the famous crossfade; textured: `famousMeta`, `nowMs`, `frameCounter`, hi-res lookup). The visitor owns the per-source lifecycle hooks the walk calls.
- `DiskRowVisitor` methods (the contract the walk drives):

  ```ts
  export type DiskRowVisitor = {
    /** Source bit is clear this frame → clear this body's sticky map for it. */
    onSourceHidden(source: SourceType): void;
    /** Before the row loop → purgeStrideWindow(stickyMap, safeStart, end). */
    beginSource(source: SourceType, safeStart: number, end: number): void;
    /** One surviving row; geometry (camDist, px) already computed by the walk. */
    onRow(
      source: SourceType,
      catalog: GalaxyCatalog,
      i: number,
      x: number,
      y: number,
      z: number,
      camDist: number,
      px: number,
    ): void;
    /** After the row loop → push this body's sticky values into its output accumulator. */
    endSource(source: SourceType): void;
    /** After all sources → sort back-to-front, stash on the subsystem's lastOutput. */
    endFrame(): void;
  };
  ```

- **Shared walk input** (the geometry-bearing subset both bodies share):

  ```ts
  export type DiskWalkInput = {
    readonly cam: OrbitCamera;
    readonly catalogs: ReadonlyMap<SourceType, GalaxyCatalog>;
    readonly visibleSourceMask: number;
    readonly pxPerRad: number;
  };
  ```

  `ProceduralDiskFrameInput = DiskWalkInput` (no extras). `TexturedDiskFrameInput = DiskWalkInput & { readonly famousMeta: readonly FamousMetaEntry[]; readonly nowMs: number }`.

- **Walk type:**

  ```ts
  export type DiskPlannerWalk = Destroyable & {
    runFrame(input: DiskWalkInput, procedural: DiskRowVisitor, textured: DiskRowVisitor): void;
  };
  ```

**Walk loop contract (what `runFrame` does — implementer writes the body):**

1. `maxCamDistSq = maxVisibleCamDistSq(PROCEDURAL_DISK_FADE_START_PX, input.pxPerRad)` — the **looser** (8-px) bound, so no row a body needs is skipped. The walk applies **no `px` gate**; each body re-applies its own in `onRow`.
2. For each `[source, catalog]`: if the source bit is clear → `procedural.onSourceHidden(source); textured.onSourceHidden(source);` and `continue`.
3. Else `{ safeStart, end, nextStart } = strideWindow(count, decimationFactor, cursor.get(source) ?? 0)`; call `procedural.beginSource(source, safeStart, end); textured.beginSource(...)`.
4. For `i` in `[safeStart, end)`: read `x,y,z`; `camDistSq = dx²+dy²+dz²`; early-out `if (camDistSq <= 0 || camDistSq > maxCamDistSq) continue`; `camDist = sqrt`; `px = apparentSizePxAtDistance(catalog.diameterKpc[i], camDist, pxPerRad)`; then `procedural.onRow(...)` then `textured.onRow(...)`.
5. After the row loop: `cursor.set(source, nextStart)`; `procedural.endSource(source); textured.endSource(source)`.
6. After all sources: `procedural.endFrame(); textured.endFrame()`.

**Body responsibilities inside `onRow` (moved verbatim from today's inner loops — the implementer relocates, does not rewrite):**

- **Procedural** (`proceduralDiskSubsystem.ts:110-180`): `if (px <= PROCEDURAL_DISK_FADE_START_PX) return`; then colourIndex + `maybeEmitProceduralDisk` + the famous-WebP `procFadeOut` crossfade (`:160-179`), writing to its sticky map.
- **Textured** (`texturedDiskSubsystem.ts:144-258`): `if (source !== Source.FamousGalaxy && px < APPARENT_SIZE_THRESHOLD_PX) return`; then `resolveDiskPlacement`, atlas `allocate`/`isFailed`/`enqueueFetch`, load-fade × dist-fade, `hiResLayerFold`, writing the `DiskInstance` to its sticky map.

**Call-site (`runFrame.ts:314-350`):** `hiResFamous.runFrame(...)` still runs BEFORE the shared walk (the textured body reads `hiResFamous.lastOutput.byFamousIdx` in `onRow`). Then ONE call:

```ts
walk.runFrame(
  { cam, catalogs, visibleSourceMask: masks.draw, pxPerRad: ctx.drawPxPerRad },
  procedural.beginFrame({ cam, catalogs, visibleSourceMask: masks.draw, pxPerRad: ctx.drawPxPerRad }),
  textured.beginFrame({ cam, catalogs, visibleSourceMask: masks.draw, pxPerRad: ctx.drawPxPerRad, famousMeta, nowMs }),
);
```

## Tech Stack

TypeScript + Vitest. No WebGPU/WGSL changes — this is pure CPU per-frame planning. Reuses the shipped pure leaf helpers in `src/utils/render/disk/` (`strideWindow`, `purgeStrideWindow`, `maxVisibleCamDistSq`, `apparentSizePxAtDistance`, `byDistanceToCamera`, `maybeEmitProceduralDisk`, `resolveDiskPlacement`, `hiResLayerFold`, `loadFadeAlpha`) — none of them change. Constants from `src/data/galaxyLodBands.ts`.

## Global Constraints

- **TDD, one commit per task.** Failing test first → implement → green → commit. ~590 tests pass today; keep green (or consciously adapt, see below). Background subagents cannot run `npm`; the main thread runs `npm test` / `npm run typecheck` and commits (per project memory).
- **Test adaptation is expected.** The subsystems' public `runFrame(input)` is replaced by `beginFrame(input): DiskRowVisitor`, so `proceduralDiskSubsystem.test.ts`, `texturedDiskSubsystem.test.ts`, and `texturedDiskSubsystem.calibration.test.ts` are consciously adapted to drive their subsystem THROUGH the shared walk (a tiny shared harness — see Task 1). Every existing assertion is preserved; only the driving call changes.
- **One symbol per file** in `src/utils/`; **one type per file** in `src/@types/` (`type` aliases, **never** `interface`). Deep relative imports, no barrels.
- **Didactic module headers** on the three new files (why + what-the-alternative-was). Comments timeless — no "previously two walks" history notes beyond a header sentence; the git log + `specs/completed/` carry the history.
- **Monomorphic hot call sites (constraint, not testable directly).** The walk must call `procedural.onRow` and `textured.onRow` at two **fixed, separate** statements — never loop `for (const v of [procedural, textured]) v.onRow(...)` (that site is megamorphic across two hidden classes). `onRow` takes **scalar args** (source, catalog ref, i, x, y, z, camDist, px) — no per-row object allocation.
- **Looser bound + per-body gate (constraint 2).** Walk early-out uses `maxVisibleCamDistSq(PROCEDURAL_DISK_FADE_START_PX, pxPerRad)`; procedural body gates `px > 8`, textured body keeps `source !== Source.FamousGalaxy && px < 24 → skip`.
- **Known behaviour change — record, do NOT fix (constraint 3).** Under the shared 8-px distance bound, famous-source rows reach the textured body ~3× farther out than today's 24-px textured bound, so thumbnail **prefetch starts earlier** for the ≤80 famous rows. Acceptable; captured in a test (Task 4) and the ADR (Task 5). Non-famous rows in the 8–24-px band now reach the textured body and hit its `px < 24` skip (same output, marginally more work) — this is the intended tradeoff, net-won by sharing the geometry.
- **Single shared cursor (constraint 6).** One `strideStartBySource` map, owned by the walk. This changes WHICH frame a given galaxy updates (both bodies now share one decimation window) — visually benign because sticky maps hold the last value; verified on the dev server in the final task.
- Plan-style: contract signatures + test names + assertions only; cite existing code by `path:line`; no implementation bodies.

---

## Task 1: Procedural body → `DiskRowVisitor`, and the shared walk driving it solo

**Files:**
- create `src/@types/engine/subsystems/DiskWalkInput.d.ts`, `src/@types/engine/subsystems/DiskRowVisitor.d.ts`, `src/@types/engine/subsystems/DiskPlannerWalk.d.ts`
- create `src/services/engine/subsystems/diskPlannerWalk.ts`
- modify `src/@types/engine/subsystems/ProceduralDiskSubsystem.d.ts` (`runFrame` → `beginFrame`; `ProceduralDiskFrameInput = DiskWalkInput`)
- modify `src/services/engine/subsystems/proceduralDiskSubsystem.ts`
- create `tests/services/engine/subsystems/diskWalkHarness.ts` (shared test helper)
- create `tests/services/engine/subsystems/diskPlannerWalk.test.ts`
- modify `tests/services/engine/subsystems/proceduralDiskSubsystem.test.ts`

**Interfaces:**
- Produces: `DiskWalkInput`, `DiskRowVisitor`, `DiskPlannerWalk` (shapes in Architecture). `createDiskPlannerWalk(deps: { decimationFactor?: number }): DiskPlannerWalk` (default `decimationFactor = 8`, matching `proceduralDiskSubsystem.ts:62` / `texturedDiskSubsystem.ts:76`).
- Produces: `ProceduralDiskSubsystem.beginFrame(input: ProceduralDiskFrameInput): DiskRowVisitor`; `lastOutput`/`destroy` unchanged.
- Test harness (`diskWalkHarness.ts`): `noopDiskRowVisitor(): DiskRowVisitor` (all methods no-op) and `runProceduralSolo(walk, sys, input)` = `walk.runFrame(input, sys.beginFrame(input), noopDiskRowVisitor())` returning `sys.lastOutput`.

**Steps:**
- [x] Add the three new `@types` files. `DiskWalkInput` matches the current `ProceduralDiskFrameInput` fields (`ProceduralDiskSubsystem.d.ts:29-34`); reuse the `GalaxyCatalog`/`OrbitCamera`/`SourceType` import paths from that file (`:23-27`).
- [x] In `diskPlannerWalk.test.ts`, add:
  - `walkDiskRows drives beginSource then onRow per surviving row then endSource then endFrame in order` — feed one stub `DiskRowVisitor` recording call order over a 2-source, few-row catalog; assert the sequence and that a hidden source calls `onSourceHidden` and NOT `beginSource`/`onRow`.
  - `walk early-out uses the 8px bound so a row visible at 8px but not 24px still reaches onRow` — assert `onRow` fires for a row whose `px` is between the 8-px and 24-px distance bounds.
  - `walk applies no px gate — every row past the distance early-out reaches onRow` — a row with `px < 8` still reaches `onRow` (the body, not the walk, drops it).
  - `single shared cursor advances once per frame across both visitor slots` — with `decimationFactor: 2`, two stub visitors, assert both see the SAME `[safeStart, end)` window each frame and the window advances on frame 2.
- [x] Adapt `proceduralDiskSubsystem.test.ts`: replace each `sys.runFrame(makeInput(...))` with `runProceduralSolo(walk, sys, makeInput(...))` (construct `walk = createDiskPlannerWalk({ decimationFactor })` alongside `sys`). Keep every existing assertion (`:80-220`) — emit count, source-bit mask, NaN skip, decimation+sticky, `lastOutput`, `(source, localIdx)` identity, and all four `procFadeOut` crossfade cases.
- [x] Move `proceduralDiskSubsystem.ts:72-193`'s per-source lifecycle + inner loop into the `beginFrame`-returned visitor: `onSourceHidden`=`:93-96`, `beginSource`=`:108`, `onRow`=`:110-179` (keep the `px <= PROCEDURAL_DISK_FADE_START_PX` gate and the famous `procFadeOut` override), `endSource`=`:184`, `endFrame`=`:189-191`. Implement `diskPlannerWalk.ts` per the Architecture loop contract.
- [x] `npm test -- proceduralDiskSubsystem diskPlannerWalk` green; `npm run typecheck` green. Commit.

## Task 2: Textured body → `DiskRowVisitor`

**Files:**
- modify `src/@types/engine/subsystems/TexturedDiskSubsystem.d.ts` (`runFrame` → `beginFrame`; `TexturedDiskFrameInput = DiskWalkInput & { famousMeta; nowMs }`)
- modify `src/services/engine/subsystems/texturedDiskSubsystem.ts`
- modify `tests/services/engine/subsystems/texturedDiskSubsystem.test.ts`, `tests/services/engine/subsystems/texturedDiskSubsystem.calibration.test.ts`
- modify `tests/services/engine/subsystems/diskWalkHarness.ts` (add `runTexturedSolo`)

**Interfaces:**
- Produces: `TexturedDiskSubsystem.beginFrame(input: TexturedDiskFrameInput): DiskRowVisitor`; `lastOutput`, `hasInFlightWork()`, `setHiResFamous(...)`, `destroy`, and the `__testGetState()` seam (`TexturedDiskSubsystemWithTestSeam`) all unchanged.
- Harness: `runTexturedSolo(walk, sys, input)` = `walk.runFrame(input, noopDiskRowVisitor(), sys.beginFrame(input))` returning `sys.lastOutput`.

**Steps:**
- [x] Adapt `texturedDiskSubsystem.test.ts` to drive via `runTexturedSolo`, preserving every assertion (`:104-321`): DiskInstance-per-ready-bitmap, NaN skip, `hasInFlightWork` toggling, hi-res fold-in (all four cases), `setHiResFamous` swap/detach, retry-storm guard.
- [x] Adapt `texturedDiskSubsystem.calibration.test.ts`: `emitOne` (`:128-143`) drives `runTexturedSolo`; the convergence test (`:279-307`) drives procedural via `runProceduralSolo`. Keep all calibration + `procedural ↔ textured orientation convergence` assertions bit-for-bit (`:154-307`).
- [x] Move `texturedDiskSubsystem.ts:108-269` into the visitor: `frameCounter++`/`lastFrameNowMs = nowMs` and the `destroyed` guard (`:109`) in `beginFrame`; `onSourceHidden`=`:130-133`, `beginSource`=`:142`, `onRow`=`:144-258` (keep the `source !== FamousGalaxy && px < 24` gate, atlas alloc/fetch, load-fade, hi-res fold), `endSource`=`:262`, `endFrame`=`:265-267`. `hasInFlightWork`/`setHiResFamous`/`__testGetState`/`destroy` stay on the subsystem object unchanged (`:271-308`).
- [x] `npm test -- texturedDiskSubsystem` green; `npm run typecheck` green. Commit.

## Task 3: Wire the shared walk into the engine and collapse the two `runFrame.ts` calls into one

**Files:**
- modify `src/@types/engine/handles/EngineSubsystemHandles.d.ts` (add `diskPlannerWalk: DiskPlannerWalk | null`)
- modify `src/services/engine/engine.ts` (null-init `:311-312`; teardown near `:633-640`)
- modify `src/services/engine/wiring/wireImpostorSubsystems.ts` (construct the walk)
- modify `src/services/engine/frame/runFrame.ts:314-350`

**Interfaces:** consumes `createDiskPlannerWalk`; produces `state.subsystems.diskPlannerWalk`.

**Steps:**
- [x] Add `diskPlannerWalk: DiskPlannerWalk | null` to `EngineSubsystemHandles` (`:40-41` neighbourhood), null-init in `engine.ts` (`:310-314`), and `destroy()` + null it in the impostor teardown block (`engine.ts:633-640`) — it holds no GPU resource, so order relative to atlas is irrelevant; place it with the disk planners.
- [x] In `wireImpostorSubsystems.ts` (`:87-114`), `const diskPlannerWalk = createDiskPlannerWalk({});` (default decimation 8) and assign `state.subsystems.diskPlannerWalk = diskPlannerWalk;`.
- [x] Replace `runFrame.ts:320-350` with: run `hiResFamous.runFrame(...)` FIRST (unchanged inputs, `:332-340`), then a SINGLE guarded `diskPlannerWalk.runFrame(sharedInput, proceduralDisks.beginFrame(procInput), texturedDisks.beginFrame(texInput))` per the Architecture call-site. Guard on all three of `diskPlannerWalk`/`proceduralDisks`/`texturedDisks` non-null. Keep the didactic comment explaining hiResFamous-before-walk (`:328-331`).
- [x] Add an integration assertion in `tests/services/engine/frame/` (or extend an existing frame test if one drives `runFrame`): `runFrame drives the disk walk once, populating both proceduralDisks.lastOutput and texturedDisks.lastOutput` — a spy on `diskPlannerWalk.runFrame` asserting exactly one call per frame. If no such harness exists, cover it in Task 4 instead and note it here. *(Outcome: no existing test drives `runFrame` past its null guards — walk construction is asserted in `wireImpostorSubsystems.test.ts`; the once-per-frame behaviour is covered by Task 4's integration suite.)*
- [x] `npm run typecheck` + full `npm test` green. Commit.

## Task 4: One walk, two bodies — parity + the documented prefetch-earlier behaviour change

**Files:** create `tests/services/engine/subsystems/diskPlannerWalk.integration.test.ts`

**Interfaces:** consumes `createDiskPlannerWalk`, `createProceduralDiskSubsystem`, `createTexturedDiskSubsystem`, `createGalaxyAtlasSubsystem`.

**Steps:**
- [x] `one walk drives both bodies with output identical to running each solo` — build a catalog with a famous row and a non-famous row; run ONE walk with both real visitors; assert `proceduralDisks.lastOutput.instances` and `texturedDisks.lastOutput.disks` match what `runProceduralSolo`/`runTexturedSolo` produce for the same input (parity across the merge).
- [x] `both bodies see the same shared stride window each frame` — `decimationFactor: 2`; assert the set of emitted procedural `localIdx` and the set of textured rows advance together (one shared cursor), not independently.
- [x] `famous rows prefetch earlier under the shared 8px bound` (the documented behaviour change) — a `Source.FamousGalaxy` row positioned so its `px` is below 24 but above the 8-px distance bound: assert the textured body calls `atlas.enqueueFetch` for it (today's 24-px textured bound would have skipped the distance early-out entirely). Assert the SAME row emits nothing for a non-famous source (`px < 24 → skip`), proving the famous exemption is what changed, not the gate.
- [x] `npm test -- diskPlannerWalk.integration` green. Commit.

## Task 5: Record the superseded two-walks premise (ADR + spec pointer)

**Files:** create `docs/adrs/0009-<slug>.md` (via the `adr` skill, auto-numbered); modify `docs/superpowers/specs/completed/2026-05-28-procedural-disk-fade-out-design.md`

**Steps:**
- [x] Write ADR 0009 "Unified disk-planner catalog walk" recording: the `2026-05-28` spec's "two separate walks; the squared-distance compare neither planner can make cheaper" premise (that spec's Approach section) was **superseded** — one shared walk halves the per-row geometry; two named row-reducers keep the bodies separate (strategy pattern, not interleaved branches). Note the accepted behaviour change: famous-row thumbnail prefetch starts ~3× farther out under the looser 8-px shared bound (≤80 rows).
- [x] Add a one-line "**Superseded (2026-07-10):** the two-walks premise below no longer holds — see ADR 0009." note near the top of the completed spec. Do NOT rewrite the archived spec body.
- [x] Commit (docs-only).

## Task 6: Backlog hygiene

**Files:** modify `docs/BACKLOG.md`; delete `docs/backlog/2026-06-30-unify-disk-planner-walks.md`

**Steps:**
- [x] Delete the `**Unify the two disk-planner catalog walks**` index line (`docs/BACKLOG.md:49`) AND the detail file, in this commit (per the Backlog-hygiene convention: picking up an item removes both in the same change; never strike-through).
- [x] Commit.

## Task 7: Profile, entanglement-radar, and dev-server visual parity (Definition of Done)

**Files:** none (verification only).

**Steps:**
- [ ] **Frame profile (main thread runs this with the user).** Dev server + browser Performance panel: capture a fly-in over a dense region, compare against the ~4.2 ms two-planner baseline in `docs/backlog/2026-06-30-unify-disk-planner-walks.md`. Expect the merged walk's per-row geometry (`camDistSq`/`sqrt`/position read) to be computed once — roughly halving the shared geometry cost. Record before/after numbers.
- [ ] **Visual parity (dev server).** Confirm procedural↔textured crossfades, the famous-WebP fade-out, and sticky behaviour look unchanged on close approach to a famous galaxy (the shared cursor changes WHICH frame a galaxy updates, not the steady-state image). Ask the user to look.
- [ ] **entanglement-radar (main session runs the skill)** over the full diff — confirm the walk/bodies split is composed, not re-complected (no per-type branch re-grown, no mirror cursor, no megamorphic `onRow` site, `onRow` allocation-free).
- [ ] All green, profile recorded, visuals confirmed → run `/feature-done`.
