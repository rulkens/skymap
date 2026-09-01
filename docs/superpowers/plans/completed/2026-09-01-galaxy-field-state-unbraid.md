# galaxyField state un-braid — implementation plan

Spec: [`docs/superpowers/specs/2026-09-01-galaxy-field-state-unbraid.md`](../specs/2026-09-01-galaxy-field-state-unbraid.md)
(read it first — the derived node set, the stage table and the bind-group
dependency table are pinned there, and this plan does not restate them).

Branch: `galaxy-field-state-unbraid`. One PR, 15 tasks, every commit green.

## Global constraints

- **Pixel-neutral refactor. The image is the contract.** No rendering behaviour
  change. Spec §6 names the two intended non-pixel deltas (fewer CDF submits on the
  geometry path; bind groups pulled at `encode` instead of pushed at allocation) —
  anything else observable is a bug in the task, not a decision to make.
- **`src/` imports nothing from `tools/` or `src/state/`.** Gate, every task:
  `grep -rn "tools/\|src/state/" src/services/gpu/renderers/galaxyField/` → empty.
- **No test reaches `createGalaxyFieldRenderer.ts` or `createFieldPipelines.ts`**
  (confirmed: every other `field/` file has a test twin; these two do not). For any
  task touching them the honest gates are typecheck + `galaxy-renderer:build` +
  `galaxy-renderer:probe`, plus the branch-level visual pass. Do not write a
  WebGPU-mocking harness to manufacture coverage for them.
- **New primitives get real tests** (`createDerived`, `createStageGraph`, the eight
  parity tests) per `docs/superpowers/conventions/testing.md` — behavioural,
  hand-computed expectations, no mirrors, no type restatements.
- **Comments: the refactor DELETES most of the choreography prose.** Spec §4 lists
  what goes and what stays. A comment that taught a reader how to cope with an edge
  the data now declares must leave with it, or it becomes a second, drifting
  authority. Budget per `docs/superpowers/conventions/comments.md`
  (module header ≤ 10 lines, comment lines ≤ half the code lines).
- **File moves/renames go through `npm run move-files -- <from> <to>`** — never
  `git mv` plus hand-edited imports. No task here needs one, but new files under
  `src/@types/` follow the one-type-per-file rule and `src/services/gpu/lib/` the
  one-factory-per-file rule.
- **Gate vocabulary** used below:
  - `TC` = `npm run typecheck` (both projects)
  - `TT` = `npx tsc --noEmit -p tools/galaxy-renderer/tsconfig.json` (never omit `--noEmit`)
  - `T` = `npm test`
  - `B` = `npm run galaxy-renderer:build` (the only `?static` shader-path proof)
  - `P` = `npm run galaxy-renderer:probe`
- Commit after every task.

## File structure

**Created**

```
src/@types/gpu/Derived.ts
src/@types/gpu/Stage.ts
src/@types/gpu/StageGraph.ts
src/@types/gpu/StagePhase.ts
src/services/gpu/lib/createDerived.ts
src/services/gpu/lib/createStageGraph.ts
tests/services/gpu/lib/createDerived.test.ts
tests/services/gpu/lib/createStageGraph.test.ts
tests/services/gpu/renderers/galaxyField/ismMap/packIsmMapCdfParams.parity.test.ts
tests/services/gpu/renderers/galaxyField/ismMap/packIsmMapFluidConstants.parity.test.ts
tests/services/gpu/renderers/galaxyField/ismMap/packIsmMapFluidEvents.parity.test.ts
tests/services/gpu/renderers/galaxyField/ismMap/packIsmMapFluidStepIndex.parity.test.ts
tests/services/gpu/renderers/galaxyField/ismMap/packPlaceArmCloudParams.parity.test.ts
tests/services/gpu/renderers/galaxyField/ismMap/packPlaceArmSpurCloudParams.parity.test.ts
tests/services/gpu/renderers/galaxyField/ismMap/packPlaceDigVeilParams.parity.test.ts
tests/services/gpu/renderers/galaxyField/ismMap/packPlaceDustParams.parity.test.ts
```

**Modified**

```
src/services/gpu/renderers/galaxyField/createGalaxyFieldRenderer.ts   (the main target)
src/services/gpu/renderers/galaxyField/field/createFieldPipelines.ts
src/services/gpu/renderers/galaxyField/gpu/createGrowOnlyRecordBuffer.ts
src/services/gpu/renderers/galaxyField/ismMap/createIsmMapPlaceArmCloud.ts
src/services/gpu/renderers/galaxyField/ismMap/createIsmMapPlaceArmSpurCloud.ts
src/services/gpu/renderers/galaxyField/ismMap/createIsmMapPlaceDust.ts        (comment only)
src/services/gpu/renderers/galaxyField/ismMap/createIsmMapPlaceDigVeil.ts     (comment only)
src/services/engine/galaxyGenerator/v2/hiiRegions.ts                          (export EMPTY_SHELLS_AND_YOUNG)
tests/services/gpu/renderers/galaxyField/gpu/createGrowOnlyRecordBuffer.test.ts
tools/galaxy-renderer/src/engine/createGalaxyEngine.ts
tools/galaxy-renderer/src/engine/README.md                                    (if it documents the deleted hook)
```

Nothing is deleted as a file; `createKeyedRebuild.ts` and its test stay (the tool's
`bubblePlacements` at `createGalaxyModel.ts:306` still uses it).

---

## Task 1 — delete `digOffset`, read the segment table

**Files:** `createGalaxyFieldRenderer.ts`

The DIG span's `first` is stored twice: `digOffset` (`:617`, written `:1073`, read
`:978` and `:1634`) and `hiiSegments`' `hii:dig` row (`:1084`), which the encode
path already reads through `findHiiSegment`.

- [x] Delete the `digOffset` `let`; `repackHiiComponents` keeps a local for the
      arithmetic it needs and publishes only the segment row.
- [x] `digDispatchInput` and `probe.requestDigVeilPlacementReadback` read
      `findHiiSegment(hiiSegments, 'hii:dig')?.first ?? 0`.
- [x] Delete the `digOffset` half of the `:612-617` comment.
- [x] Gates: `TC`, `T`, `B`, `P`.

## Task 2 — hold the two builder records whole (F3)

**Files:** `createGalaxyFieldRenderer.ts`, `src/services/engine/galaxyGenerator/v2/hiiRegions.ts`

Seven `let`s (`:598, :601, :605, :610, :611, :627, :628`) are shards of two
immutable records, re-tied by three prose co-temporality claims.

**Shape:**

```ts
let central: GalaxyFieldMixtureResult = EMPTY_FIELD_MIXTURE;      // 3 lets -> 1
let centralHii: HiiShellsAndYoungResult = EMPTY_SHELLS_AND_YOUNG; // 4 lets -> 1
```

- [x] `export` the existing `EMPTY_SHELLS_AND_YOUNG` (`hiiRegions.ts:660`); add a
      local `EMPTY_FIELD_MIXTURE` const in the orchestrator (Task 11 deletes both
      when the derived `compute` handles null geometry).
- [x] Readers become `central.components` / `centralHii.shellFluxSum` etc.; the two
      public getters return `central.armCloudReservation` / `.spurCloudReservation`.
- [x] **`rebuildDigVeilBudget` takes `centralHii` as a parameter** — that deletes
      the call-order contract at `:766-778` rather than documenting it.
- [x] Delete the three "captured alongside" comments (`:599-611`, `:622-628`).
- [x] Gates: `TC`, `T`, `B`, `P`.

## Task 3 — one teardown ledger (F6)

**Files:** `createGalaxyFieldRenderer.ts`

One automatic registry (7 entries, `{ destroy() }`) plus one hand-written list in
`dispose` (11 entries), split on a naming difference — the nine sub-factories spell
teardown `dispose()`.

- [x] Widen `own` to accept `{ destroy(): void } | { dispose(): void }`; register
      every sub-factory, `fieldComps` and `hiiComps` at their allocation sites.
- [x] `dispose` becomes the single reverse walk, calling whichever method the entry
      has. No hand-written list survives.
- [x] Rewrite the ledger comment to state the invariant that is now actually true.
- [x] Gates: `TC`, `T`, `B`, `P`.

## Task 4 — reuse `createGrowOnlyRecordBuffer` at the two hand-rolled grow sites (ismMap #5)

**Files:** `createIsmMapPlaceArmCloud.ts` (`:119-131`), `createIsmMapPlaceArmSpurCloud.ts` (`:94-103`)

Both hand-roll `ensureRecordsBuffer` in files whose own comments name the canonical
factory without calling it. Both pack fixed-stride `Float32Array` records and build
their bind group per dispatch, so no `onRegrow` is involved.

- [x] Replace each with a `createGrowOnlyRecordBuffer` instance
      (`floatsPerRecord: ARM_CLOUD_RECORD_FLOATS` / `ARM_SPUR_CLOUD_RECORD_FLOATS`,
      `usage: STORAGE | COPY_DST`), writing via `write(records)` instead of
      `writeBuffer`.
- [x] **`initialCapacity` must be ≥ 1 record** — a zero-size storage binding is a
      WebGPU validation error; this replaces the existing `Math.max(byteSize, 32)`
      floor. Keep the floor's intent, drop the ad-hoc byte maths.
- [x] Route teardown through the instance's `destroy()`; delete the local
      `recordsBuffer?.destroy()` bookkeeping.
- [x] Delete the two "the `createGrowOnlyRecordBuffer` idiom minus…" comments.
- [x] Gates: `TC`, `T`, `B`, `P` — `P` matters here: it exercises the arm/spur
      placement readbacks.

## Task 5 — `buffer` property → `getBuffer()` accessor (ismMap #2)

**Files:** `createGrowOnlyRecordBuffer.ts`, `createGalaxyFieldRenderer.ts`, the four
`createIsmMapPlace*.ts` (comments), `tools/.../createGalaxyModel.ts`, the existing
grow-buffer test

Four near-identical comments ("re-fetch the buffer live every dispatch, never cache
across a regrow") substitute for a guarantee the type can give.

**Signature:** `getBuffer(): GPUBuffer` replaces `readonly buffer: GPUBuffer`.

- [x] Change the primitive; update every call site (`fieldComps`, `hiiComps`, the
      two Task-4 instances, the tool's `bubbleComps`).
- [x] Delete the four "never cache" comments and the `buffer` getter's own doc line;
      the accessor says it.
- [x] Update `tests/.../createGrowOnlyRecordBuffer.test.ts` to the accessor. Do not
      add a test that only restates the rename.
- [x] Gates: `TC`, `TT`, `T`, `B`, `P`.

## Task 6 — TS ↔ WESL parity tests for the eight hand-numbered packers (ismMap #4)

**Files:** eight new `tests/.../ismMap/*.parity.test.ts`

Eight packer headers name their `.wesl` struct as "THE OFFSET AUTHORITY" and
nothing links the two. A misplaced lane ships garbage silently — the
`selectionEncoding` failure class, and a `testing.md` keep-rule ("WGSL/TS parity +
uniform byte-layout tests… invisible until iOS silently drops the whole frame").

**Recipe — follow, don't invent:** `tests/tools/mcpm-workbench/render/boxUniform.parity.test.ts`
(read the `.wesl` text, parse the named struct's fields, accumulate declared byte
offsets, assert each against `packer float index × 4`).

- [x] One test per packer: `packIsmMapCdfParams`, `packIsmMapFluidConstants`,
      `packIsmMapFluidEvents`, `packIsmMapFluidStepIndex`, `packPlaceArmCloudParams`,
      `packPlaceArmSpurCloudParams`, `packPlaceDigVeilParams`, `packPlaceDustParams`.
- [x] Each asserts: (a) the struct's total declared size equals the packer's
      exported `*_BUFFER_SIZE`, and (b) each named field's declared byte offset
      equals the index the packer writes it at.
- [x] The offset accumulator must honour WGSL alignment for the types these structs
      actually use (`vec4<f32>` rows, `vec3<f32>` padding, `array<…>` stride) — a
      naive size-sum silently passes a struct with padding. Extend the mcpm helper's
      type table rather than copying it verbatim.
- [x] If a parity test FAILS, stop: that is a live bug, not a test to adjust. Report
      it before changing either side.
- [x] Gates: `T`, `TC`.

## Task 7 — bind-group dependency table inside `createFieldPipelines` (field #1, part 1)

**Files:** `createFieldPipelines.ts` only — the four public `rebuild*` methods stay
as thin wrappers over the table so nothing outside this file changes yet.

Spec §3.3 pins `FieldBindGroupResources`, `FieldBindGroups` and the
`BIND_GROUP_DEPS` table.

- [x] Add the internal table and a private walker that rebuilds a role iff one of
      its declared resources has a new identity (`Object.is`), recording the
      identities it built against.
- [x] Re-express the four existing `rebuild*` methods as calls into the walker.
      Behaviour must be unchanged this task: the same roles rebuild on the same
      triggers.
- [x] Gates: `TC`, `T`, `B`, `P`.

## Task 8 — `sync()`, delete the dust-map mirror and the host hook (field #1 part 2 + F2)

**Files:** `createFieldPipelines.ts`, `createGalaxyFieldRenderer.ts`,
`tools/galaxy-renderer/src/engine/createGalaxyEngine.ts`, `tools/.../engine/README.md`

The one task that touches `tools/`. Spec §3.3 is the design; the consequence list
there is the checklist.

**Signature:** `sync(resources: FieldBindGroupResources): FieldBindGroups | null`
(`null` only before the host has allocated a dust map).

- [x] Replace the four `rebuild*` methods and the five getters with `sync`. Delete
      `getDustMapTex` from `FieldPipelineDeps`.
- [x] Orchestrator: `encode` calls `sync` **before any pass**, with
      `{ fieldComps: fieldComps.getBuffer(), hiiComps: hiiComps.getBuffer(), dustMap: frameTargets.dustMapTex }`,
      and passes the returned groups to the four encode helpers.
- [x] Delete `let dustMapTex`, the `!` assertion, the construction-time
      `rebuildDustMapBindGroup` call (`:579`) and both `onRegrow` registrations
      (`:538`, `:555`).
- [x] Delete `onDustMapReallocated` from `GalaxyFieldRenderer` and its host wiring
      at `createGalaxyEngine.ts:244-249` (the callback argument to
      `createGalaxyRenderTargets` goes with it, if nothing else uses it).
- [x] Collapse the latch into one slot:
      `let dustMap: { readonly tex: GPUTexture; populated: boolean } | null = null;`
      reassigned wholesale in `encode` when the frame's texture identity differs
      (#646 relocated the latch; this makes its reset an implication, not a promise).
- [x] `probe.fieldSplatBG` becomes `GPUBindGroup | null`; guard the two consumers
      (`createGalaxyEngine.ts:717, 735` — return `null` from those probe methods
      when it is null, matching their existing `if (!reservation) return null`).
- [x] Delete `onRegrow` from `GrowOnlyRecordBufferSpec` and its implementation (no
      caller remains — the tool's `bubbleComps` never passed one), and the test that
      asserts it fires. **If any caller still needs push notification, stop and
      report instead of keeping a single-user callback.**
- [x] Delete `createFieldPipelines`' "None of the five `let`s here builds during
      construction" header paragraph and the `rebuild*` method docs.
- [x] Gates: `TC`, `TT`, `T`, `B`, `P`. `P` is the real gate here — a wrong bind
      group is a WebGPU validation error the probe catches.

## Task 9 — `createDerived` (+ tests)

**Files:** `src/@types/gpu/Derived.ts`, `src/services/gpu/lib/createDerived.ts`,
`tests/services/gpu/lib/createDerived.test.ts`. No consumer yet.

Signature and semantics: spec §3.1 (element-wise `Object.is`, lazy first compute,
stable identity on an unmoved key, no `invalidate`).

- [x] Tests (names are the acceptance criteria):
      - `does not compute before the first read`
      - `recomputes when a key element's identity moves`
      - `returns the same object across reads on an unmoved key`
      - `treats a key length change as a move`
      - `compares by Object.is, so NaN and -0 keys do not thrash`
- [x] Implement. Match `createKeyedRebuild.ts`'s file shape (type in `@types/gpu/`,
      factory in `lib/`, ≤ 10-line header).
- [x] Gates: `T`, `TC`.

## Task 10 — `createStageGraph` (+ tests)

**Files:** `src/@types/gpu/StagePhase.ts`, `src/@types/gpu/Stage.ts`,
`src/@types/gpu/StageGraph.ts`, `src/services/gpu/lib/createStageGraph.ts`,
`tests/services/gpu/lib/createStageGraph.test.ts`. No consumer yet.

Signatures: spec §3.2. Table order is the authority; `after` is validated against it
at construction; `token(name)` is the effect edge.

- [x] Tests:
      - `runs a stage once per key move, not once per run`
      - `skips a stage of another phase`
      - `leaves an unwanted stage's key unrecorded, so it runs when a consumer appears`
        (the retention bug `createKeyedRebuild`'s own test exists for)
      - `token(name) changes only when that stage runs`
      - `a stage keyed on an upstream token re-runs after the upstream runs`
      - `throws when an after-edge points forward in the table`
      - `throws when an after-edge names an unknown stage`
- [x] Implement. No topological sort — validation only (spec §3.2 says why).
- [x] Gates: `T`, `TC`.

## Task 11 — one input record (F5)

**Files:** `createGalaxyFieldRenderer.ts`

Seven `let`s (`:582-593`) shred an immutable pushed snapshot; ~60 sites read them
ambiently.

- [x] `let current: GalaxyFieldMixtureInput = EMPTY_INPUT;` — one slot, one atomic
      write at the top of `setMixture`, with the previous value kept in a local for
      the (still hand-written, this task) comparisons.
- [x] Rewrite every reader as `current.fieldTuning` / `current.geometry` / … .
      `npm run refactor` can carry most of the mechanical half; verify the result,
      don't trust it.
- [x] `extraMixtures` stays a `let` this task (Task 12 replaces it).
- [x] Gates: `TC`, `T`, `B`, `P`.

## Task 12 — the derived node set (F1, value half)

**Files:** `createGalaxyFieldRenderer.ts`

Spec §3.1's table is the contract: nine nodes, keys exactly as pinned there.

- [x] Add the nine `createDerived` nodes. Each `compute` handles `geometry === null`
      internally (empty components / null reservations) — then delete
      `EMPTY_FIELD_MIXTURE` and the `EMPTY_SHELLS_AND_YOUNG` import if nothing else
      needs them.
- [x] Delete the `let`s they replace: `extraMixtures`, `fieldMixture`, `hiiMixture`,
      `hiiTierSegments`, `hiiSegments`, `shellFluxSum`, `recentEventCount`,
      `digBudget`, `dustBudget`, `dustHeaderLanes`, `fieldCounts`, `central`,
      `centralHii`, plus `rebuildCentralFieldMixture`, `rebuildCentralHiiMixture`,
      `extraFieldMixture`/`extraHiiMixture`'s call-site plumbing.
- [x] The public getters (`fieldCounts`, `dustHeaderLanes`, `hiiSegments`, both
      reservations) become `.get()` reads. They are called per frame from `encode`
      and from the host — a key compare is a handful of `Object.is` calls, but do
      not add caching on top; the node already caches.
- [x] `repackFieldComponents` / `repackHiiComponents` split: the *packing* moves
      into `fieldPack` / `hiiPack`'s `compute` (pure); the `write` stays in the
      rebuild functions for now (Task 13 makes it a stage).
- [x] The 12 boolean locals and `rebuildForTuning`'s section-identity checks stay
      this task, now feeding only the effect calls. They die in Task 13.
- [x] Gates: `TC`, `T`, `B`, `P`.

## Task 13 — the stage table, sync phase (F1, effect half — rows 1–5)

**Files:** `createGalaxyFieldRenderer.ts`

Spec §3.2's table rows 1–5, in the order given there — note `ismMap` comes FIRST,
so the two CDF scans run once per push instead of twice (spec §6, delta 1).

- [x] Build the graph with rows 1–5 as `phase: 'sync'`. `setMixture` becomes: assign
      `current`, then `graph.run('sync')`.
- [x] Delete `rebuildForGeometry`, `rebuildForTuning`, `rebuildDustMixture`,
      `rebuildDigVeilBudget`, `rebuildIsmMap`, `dispatchDustCdfScan`,
      `dispatchDigCdfScan`, `repackFieldComponents`, `repackHiiComponents`, the 12
      boolean locals, and **the `generatorMoved && !dustMoved` epilogue with its
      6-line comment**.
- [x] Transitional shim, this task only: rows 1–5 keep explicit `.invalidate()`
      calls on the six surviving `createKeyedRebuild` nodes, reproducing today's
      invalidation exactly. Task 14 deletes them.
- [x] **Verify before relying on `fieldPack`'s key:** read `placeDust.wesl` and
      confirm it writes EVERY reserved slot (a culled particle gets a zeroed /
      zero-amplitude record). If it skips slots, add
      `current.fieldTuning.ismMap.generator` to `fieldPack`'s key with a one-line
      comment naming the reason (spec §6).
- [x] Gates: `TC`, `T`, `B`, `P`, plus a manual check that a generator flip, a dust
      drag and a new galaxy each still redraw (the probe covers the placement
      dispatches; the visual pass covers the rest).

## Task 14 — the stage table, step phase (F1, effect half — rows 6–11)

**Files:** `createGalaxyFieldRenderer.ts`

- [x] Add rows 6–11 as `phase: 'step'`, keyed per spec §3.2 (tokens for the effect
      edges, derived values for the value edges).
- [x] Delete all six `createKeyedRebuild` nodes, the `createKeyedRebuild` import,
      the transitional `.invalidate()` shim from Task 13, and every remaining
      `.invalidate()` call site.
- [x] `stepIsmMap` becomes `graph.run('step'); return { done: true };` — delete the
      two ordering comments (`:1301`, `:1304-1306`); the `after` edges carry them and
      the constructor checks them.
- [x] The four `*DispatchInput` builders stay shared between the stage `run` and the
      debug readback (radar-orchestrator §3 lists this as already-clean) — they now
      take their inputs from `current` and the derived nodes, so the snapshot/live
      mix (spec §3.4) is gone.
- [x] Gates: `TC`, `T`, `B`, `P`.

## Task 15 — comment and deletion sweep

**Files:** every file the branch touched

- [x] Run the comment audit over the branch's diff against
      `docs/superpowers/conventions/comments.md`. Spec §4 lists the prose that must
      be gone; confirm each, and confirm the landmines that must STAY are still
      there (two `digCdfScan` instances, `layout: 'auto'` per-pipeline entry lists,
      the WebGPU cross-submit ordering note on `ringMeansBuffer`).
- [x] Run a deletion audit over the diff per
      `docs/superpowers/conventions/leanness.md` — assume surplus. Named suspects:
      leftover null-guards for cases the derived nodes now handle, any wrapper kept
      "for symmetry", any new knob or constant not consumed twice.
- [x] Report the branch's line-diff breakdown (code / comment / test / doc). The
      net must be negative on code+comment lines; if it is not, say so plainly
      rather than shipping quietly.
- [x] Gates: `TC`, `TT`, `T`, `B`, `P`, plus the `src/` isolation grep.

---

## Definition of Done

**Deliverable inventory**

- [x] `createDerived` and `createStageGraph` exist in `src/services/gpu/lib/` with
      their types in `src/@types/gpu/` and their unit tests passing.
- [x] `createGalaxyFieldRenderer.ts` holds **one** input record, **zero**
      `createKeyedRebuild` nodes, **zero** `.invalidate()` call sites, and its
      dependency graph is two declared data structures (the derived node set and the
      stage table).
- [x] `createFieldPipelines` exposes **one** bind-group entry point (`sync`) over a
      declared `BIND_GROUP_DEPS` table; the four `rebuild*` methods, the five
      getters and `getDustMapTex` are gone.
- [x] `GalaxyFieldRenderer` no longer has `onDustMapReallocated`; the host's
      callback wiring is deleted.
- [x] `GrowOnlyRecordBufferSpec` has no `onRegrow`; `getBuffer()` replaces `buffer`.
- [x] Eight `*.parity.test.ts` files cover the eight hand-numbered packers.
- [x] `grep -rn "tools/\|src/state/" src/services/gpu/renderers/galaxyField/` → empty.

**Named observable behaviours** (the manual smoke pass, in `npm run galaxy-renderer`)

- [x] A new galaxy (regenerate) draws field, dust, all three HII tiers and extras —
      no vanished tier, no frozen dust map.
- [x] Dragging a **dust** knob updates the dust column and the JWST view.
- [x] Flipping `ismMap.generator` between `fluid` and `none` re-places dust (the
      case the deleted epilogue existed for) — nothing keeps drawing from the
      previous generator's placement.
- [x] Dragging **arm width** updates the arm/spur clouds and the HII tier, and does
      NOT re-run the ISM generator.
- [x] Turning the **orientation overlay** on after moving a sigma with it off shows
      the new field (the retained-invalidation case).
- [x] A **window resize / divisor drag** (which reallocates `dustMapTex`) leaves
      attenuation and the JWST view correct — the case `onDustMapReallocated` used
      to cover.
- [x] Background **extras** appear and update with a tuning drag.

**Branch-level gates**

- [x] `npm run perf` A/B against `main`, this worktree's server:
      `--url http://localhost:5400`. Neutral-or-better. A negative result **halts
      the landing** — land/park is the user's ruling, not process momentum.
- [x] **USER visual pass** on the galaxy renderer, against the behaviours above.
      User-owned checkbox — not agent-attested.

**Deferral boundary** (do not chase these in review)

- Shared seed-reinterpretation helper and shared debug-readback helper — parked with
  reasons in spec §2; the readback helper is worth backlogging after this lands.
- `createIsmMapOutput`'s four caller-orchestrated methods — internal to
  `createIsmMapGenerator.rebuild`, out of scope.
- The ledger-parked items (`stepIsmMap`'s always-`true` `done`, per-frame
  `createView()`, `orientationViewWanted` inertness) — untouched by design.
- No test is added for `createGalaxyFieldRenderer.ts` or `createFieldPipelines.ts`;
  their gate is typecheck + build + probe + the visual pass.
