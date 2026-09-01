# Galaxy field renderer extraction — implementation plan (Track B / prep P3)

Executes [`specs/2026-08-17-galaxy-field-renderer-extraction-design.md`](../specs/2026-08-17-galaxy-field-renderer-extraction-design.md).
Sequencing (Track B now, Track C after) is ruling #17 in
[`docs/research/engine/decisions.md`](../../research/engine/decisions.md) — not
re-argued here. Rationale for every move-vs-stay call lives in the spec; this
file carries only what an implementer needs to execute.

**Acceptance bar: pixel-for-pixel unchanged in the tool.** No algorithm, RNG,
or budget change is in scope. Every task below is either a mechanical move or a
type-level/plumbing edit whose runtime values are identical by construction.

## Ground preparation

**None needed — the spec IS the ground preparation** (P3 in `decisions.md`'s
numbered list; spec §Ground preparation). Track C's spec is written against
this move's post-refactor tree. No `/refactor-ground` pass precedes this plan.

## Drift found against the spec (2026-08-31, main `c161c2e11`)

The spec's 36-file inventory is **correct and unchanged** — all 36 files exist
at the listed paths, `field/` has 11 files, `ismMap/` has 30. Three things the
spec's file-move table does not cover surfaced when the dependency rule was
checked against the real import graph:

1. **16 tool-local types are imported by the moving files.** The spec's
   dependency rule ("nothing from `tools/`") is unsatisfiable by moving the 36
   implementation files alone. The spec's own resolution for `HiiTier`
   ("promotes to `src/@types/galaxy/` … the dependency rule forbids the shared
   surface referencing anything under `tools/`") generalizes verbatim to the
   other 15. Commit 1 promotes all 16. See Task 4's manifest group B.
2. **Three tool-local _values_ are imported by the moving files**, none of them
   promotable as-is: `HII_TIERS` (its row type `HiiTierSpec` references
   `RenderSettings`, tool-only), `FrameView` (`frame/deriveFrameView.ts`, stays
   tool-side per spec), `RenderSettings` (tool-only settings bag). Commit 0
   decouples the two moving files that reach for them, without touching a
   runtime value. `passes/beginClearPass.ts` — a 12-line descriptor helper, no
   tool state — promotes to `src/services/gpu/lib/` instead, where the spec's
   dependency rule already allows imports from.
3. **15 test files reach the moving units** (the task brief's "no test reaches
   `createGalaxyEngine.ts`" is true and separate). `move-files` rewrites their
   import paths but does **not** relocate them — `tests/tools/galaxy-renderer/
engine/**` is not a mirror path `move-files` recognises for a `src/`
   destination. Task 7 relocates them by hand-built manifest. Upside: `npm test`
   is a real behaviour gate for the move, which the spec did not anticipate.

**Consequence for commit count:** four commits, not three. Commit 0 is a prep
refactor (content edits, zero moves) ahead of the spec's three, per CLAUDE.md's
"prep refactors are their own commits, sequenced before the feature commits" and
the refactor skill's "one mechanical op per commit, no content edits mixed in".
Still one PR (spec §PR packaging, RESOLVED).

## Gate vocabulary

Cited by short name in every task. **Run from the worktree root.**

| name           | command                                                                                      | catches                                                                                                                                                                                                              |
| -------------- | -------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `G-tool-tsc`   | `npx tsc --noEmit -p tools/galaxy-renderer/tsconfig.json`                                    | tool-side type breakage. **NEVER omit `--noEmit`** — this config has none of its own and will write ~1200 `.js`/`.d.ts` files next to their sources.                                                                 |
| `G-app-tsc`    | `npm run typecheck`                                                                          | app-side breakage. Does **not** compile the tool; after commit 1 it _does_ cover the moved files (root tsconfig includes `src` + `tests`).                                                                           |
| `G-test`       | `npm test`                                                                                   | the 15 moved unit tests + the two `tests/services/gpu/shaders/*.parity.test.ts` byte-layout parity tests.                                                                                                            |
| `G-tool-build` | `npm run galaxy-renderer:build`                                                              | the **only** gate that resolves `.wesl?static` for real. `*.wesl?static` is a _wildcard_ ambient module (`wesl-plugin/suffixes`), so a stale shader path type-checks clean under both tsc gates and fails only here. |
| `G-probe`      | `npm run galaxy-renderer:probe`                                                              | the only automated gate reaching the engine (GPU validation errors).                                                                                                                                                 |
| `G-deps`       | `grep -rn "tools/\|src/state/" src/services/gpu/renderers/galaxyField/` → must print nothing | the spec's dependency rule.                                                                                                                                                                                          |

`G-probe` runs after **each** commit, not only at the end (spec §Migration
sequencing).

---

# Commit 0 — seam prep (no moves)

Two content edits that remove the moving files' last reaches into tool-only
_values_. Both are argument-shape changes with identical runtime behaviour;
existing tests are the proof.

### Task 1: Narrow `buildFieldHeaderInputs`' frame/render inputs

**Files:** `tools/galaxy-renderer/src/engine/field/buildFieldHeaderInputs.ts`
(modify), `tests/tools/galaxy-renderer/engine/field/buildFieldHeaderInputs.test.ts`
(likely unchanged — structural typing keeps existing call sites compiling).

`FieldHeaderInputsDeps` today takes `frame: FrameView` and
`render: RenderSettings` (`buildFieldHeaderInputs.ts:52-53`) but reads exactly
eight fields off the first and four off the second
(`buildFieldHeaderInputs.ts:66-77, 158-163`). Replace both with narrow types
declared **in this file**, so the module carries no import of either tool type.
TypeScript is structural: `createGalaxyEngine.ts` keeps passing its whole
`FrameView`/`RenderSettings` objects unchanged.

**Contract:**

```ts
/** The per-frame view lanes this builder reads — a structural subset of the tool's FrameView. */
export type FieldHeaderFrameLanes = {
  readonly view: Float32Array; // deriveFrameView.ts:53 — a raw mat4, not a Mat4 alias
  readonly aspect: number;
  readonly analyticExposure: number;
  readonly debugViews: DebugViewWeights;
  readonly galaxyWeight: number;
  readonly ismMapChannels: IsmMapChannelWeights;
  readonly dustSlices: FieldDustSlices;
  readonly starGrainFeatureScale: number;
};

/** The render knobs this builder reads — a structural subset of the tool's RenderSettings. */
export type FieldHeaderRenderLanes = {
  readonly hiiNearFadeStart: number;
  readonly hiiNearFadeEnd: number;
  readonly starGrainWarpAmp: number;
  readonly hiiQuadCap: number;
};
```

- [x] Read `deriveFrameView.ts`'s `FrameView` and `RenderSettings.d.ts` for the
      exact field types; copy types, not values. Do not widen or reorder.
- [x] Swap `FieldHeaderInputsDeps.frame`/`.render` to the two new types; drop
      the `FrameView` and `RenderSettings` imports.
- [x] `G-tool-tsc`, `G-test -- buildFieldHeaderInputs` → green, no test edits
      needed. If a test edit _is_ needed, the narrowing was wrong — re-derive.

### Task 2: Decouple the two `field/` files from `HII_TIERS`

**Files:** `tools/galaxy-renderer/src/engine/field/buildFieldHeaderInputs.ts`,
`tools/galaxy-renderer/src/engine/field/createFieldPipelines.ts` (modify).

Both import `HII_TIERS` (`tools/galaxy-renderer/src/data/hiiTiers.ts`) purely to
enumerate the three tier kinds — `buildFieldHeaderInputs.ts:176-178` and
`createFieldPipelines.ts:357-370`. The table itself stays tool-side (spec
§Public surface: "The `HII_TIERS` value table … stays tool-side"), and cannot
promote: `HiiTierSpec.divisorKey` is typed off `RenderSettings`.

Each site already receives a caller-owned `Readonly<Record<HiiTierKind, …>>` —
`deps.targetSizes.tiers` (`buildFieldHeaderInputs.ts:45`) and `tierUbo`
(`createFieldPipelines.ts:35`). Iterate **that record's own keys** instead of
`HII_TIERS`. Both sites build a record indexed by kind, so key order is not
load-bearing at either (the load-bearing draw/composite/HUD order stays in
`createGalaxyEngine.ts`, which keeps `HII_TIERS`). No new shared constant —
one fewer import, not one more.

- [x] Both sites: `Object.keys(<the record>) as HiiTierKind[]`, mirroring the
      cast `buildFieldHeaderInputs.ts:178` already makes on its
      `Object.fromEntries` result.
- [x] Drop both `HII_TIERS` imports. Leave the `HII_TIERS`-naming comments at
      `buildFieldHeaderInputs.ts:4,169` and `createFieldPipelines.ts:64,82,147,153`
      alone — they name the _concept_, and rewriting them is Task 13's job.
- [x] `G-tool-tsc`, `G-test`, `G-tool-build`, `G-probe`.
- [x] Commit 0. Message frames it as prep: the moving files' last tool-only
      value dependencies, ahead of the move.

---

# Commit 1 — move

Mechanical only. Everything here goes through the refactor CLI; **hand-editing
an import path is always the wrong plan** (`.claude/skills/refactor/SKILL.md`).
The one exception is Task 6, which the CLI provably does not cover.

### Task 3: Rename `HiiTierKind` → `HiiTier`

**Files:** driven by the CLI.

The spec's `GalaxyFieldRenderTargets` contract names the union `HiiTier`; the
tree calls it `HiiTierKind`. Rename before the move so the move manifest can
name the destination file `HiiTier.ts` (project rule: filename = exported
symbol).

```bash
npm run refactor -- rename tools/galaxy-renderer/@types/engine/HiiTierKind.d.ts#HiiTierKind HiiTier --dry
npm run refactor -- rename tools/galaxy-renderer/@types/engine/HiiTierKind.d.ts#HiiTierKind HiiTier
```

- [x] `--dry` first; confirm the file renames to `HiiTier.d.ts` and ~6 importers
      are rewritten.
- [x] `G-tool-tsc`, `G-app-tsc`.

### Task 4: Build the move manifest and dry-run it

**Files:** the manifest JSON, written to the **session scratchpad, not the
repo**.

Manifest shape is `[{ "from": "...", "to": "..." }, ...]`
(`.claude/skills/refactor/SKILL.md` §move). Three groups, one manifest, one run
— a throw on any entry aborts the whole batch before disk is touched.

**Group A — 36 orchestration files.** Transcribe the spec's file-move table
verbatim:
`tools/galaxy-renderer/src/engine/<sub>/<file>.ts` →
`src/services/gpu/renderers/galaxyField/<sub>/<file>.ts`, `<sub>` ∈
{`field`, `ismMap`, `gpu`}. 10 from `field/`, 24 from `ismMap/`, 2 from `gpu/`.
Do **not** add `field/createArmRidgeDebugSample.ts` or
`ismMap/createIsmMapDustCdfScanDebugSample.ts` (see §Dispositions).

**Group B — 16 seam types.** `.d.ts` → `.ts`; `move-files` handles the
extension change and rewrites importers (verified by dry-run).

| from `tools/galaxy-renderer/@types/` | to `src/@types/galaxy/`   |
| ------------------------------------ | ------------------------- |
| `engine/DebugViewWeights.d.ts`       | `DebugViewWeights.ts`     |
| `engine/DustHeaderLanes.d.ts`        | `DustHeaderLanes.ts`      |
| `engine/FieldCamera.d.ts`            | `FieldCamera.ts`          |
| `engine/FieldDust.d.ts`              | `FieldDust.ts`            |
| `engine/FieldDustCarve.d.ts`         | `FieldDustCarve.ts`       |
| `engine/FieldDustNoise.d.ts`         | `FieldDustNoise.ts`       |
| `engine/FieldDustSlices.d.ts`        | `FieldDustSlices.ts`      |
| `engine/FieldHeaderInput.d.ts`       | `FieldHeaderInput.ts`     |
| `engine/FieldSliceCounts.d.ts`       | `FieldSliceCounts.ts`     |
| `engine/HiiSegment.d.ts`             | `HiiSegment.ts`           |
| `engine/HiiTextureLanes.d.ts`        | `HiiTextureLanes.ts`      |
| `engine/HiiTier.d.ts` (post-Task 3)  | `HiiTier.ts`              |
| `engine/IsmMapChannelWeights.d.ts`   | `IsmMapChannelWeights.ts` |
| `engine/IsmMapSeedingLanes.d.ts`     | `IsmMapSeedingLanes.ts`   |
| `engine/YoungStarsLanes.d.ts`        | `YoungStarsLanes.ts`      |
| `data/DebugViewKind.d.ts`            | `DebugViewKind.ts`        |

This closure is exact and self-contained: its only outward edges are
`src/@types/math/Vec2`/`Vec3`, already shared. Names are kept as-is — a
16-type rename is churn the acceptance bar does not buy.

**Group C — 1 shared helper.**
`tools/galaxy-renderer/src/engine/passes/beginClearPass.ts` →
`src/services/gpu/lib/beginClearPass.ts`. Three moving files
(`encodeDustMapPass`, `encodeDustPresentPass`, `encodeSplatPass`) plus several
staying tool passes import it; the staying ones keep working via the rewritten
path, which the spec's dependency rule permits
(`src/services/gpu/lib/*` is on its allow-list).

```bash
npm run move-files -- --manifest <scratchpad>/galaxyField-moves.json --dry
```

- [x] 53 entries total (36 + 16 + 1). Verify the count before running.
- [x] Read the dry-run's rewritten-file set. Expect it to name
      `createGalaxyEngine.ts`, `model/createGalaxyModel.ts`,
      `frame/deriveFrameView.ts`, `probeGpuErrors.ts`, the staying `passes/*`,
      the 15 tool tests and `tests/services/gpu/shaders/{records,constants}.parity.test.ts`.
- [x] Nothing is saved by `--dry`. Do not commit the manifest.

### Task 5: Execute the move

- [x] `npm run move-files -- --manifest <scratchpad>/galaxyField-moves.json`
- [x] `G-app-tsc`, `G-tool-tsc` → both green. (They will be even with the
      shader paths still stale — see Task 6.)
- [x] Do **not** commit yet; Tasks 6–8 belong to this commit.

### Task 6: Fix the `?static` shader depths

**Files:** 8 moved files carrying 27 `?static` specifiers —
`field/createFieldPipelines.ts` (10), `ismMap/createIsmMapOrientation.ts` (5),
`createIsmMapOutput.ts` (3), `createIsmMapFluidRunner.ts` (3),
`createIsmMapDustCdfScan.ts`, `createIsmMapPlaceArmCloud.ts`,
`createIsmMapPlaceArmSpurCloud.ts`, `createIsmMapPlaceDigVeil.ts`,
`createIsmMapPlaceDust.ts`, `createIsmMapRingReduce.ts` (1 each).

`move-files` does not rewrite `?static`/`?worker` specifiers — a documented
blind spot, and the ambient `*.wesl?static` module is a wildcard, so **neither
tsc gate catches a stale path**. This is the one hand-edit in commit 1.

The depth changes and nothing else:

```
- import fieldSplatVsWgsl from '../shaders/milkyWay/field/fieldSplat/vertex.wesl?static';
+ import fieldSplatVsWgsl from '../../../shaders/milkyWay/field/fieldSplat/vertex.wesl?static';
```

Every one of these shaders is already a symlink in the tool's tree pointing at
the app's real file under `src/services/gpu/shaders/milkyWay/{field,ismMap}/`,
so the new paths hit real files. The **tool** build still finds them: its
`vite.config.ts` alias rewrites `^(.*)/shaders/milkyWay/(.+\.wesl(\?.+)?)$` onto
the tool's own wesl root regardless of the leading path, and the moved specifier
still matches. That alias exists precisely for app-side modules the tool reuses,
and `src/services/gpu/renderers/milkyWay/milkyWayCloudRenderer.ts:65-66` already
proves the shape — a `src/` file spelling `'../../shaders/milkyWay/…?static'`,
built by both configs.

- [x] `grep -rn "wesl?static" src/services/gpu/renderers/galaxyField/` → 27 hits,
      all beginning `'../../../shaders/`.
- [x] `grep -rn "'\.\./shaders/" src/services/gpu/renderers/galaxyField/` → nothing.
- [x] `G-tool-build` → green. **This is the only gate that proves Task 6.**

### Task 7: Relocate the 15 moved unit tests to the mirror path

**Files:** a second manifest (scratchpad).

`move-files` rewrote these tests' imports in Task 5 but left them under
`tests/tools/galaxy-renderer/engine/**`, now testing `src/` code. Move them to
the mirror of the new source tree:
`tests/tools/galaxy-renderer/engine/<sub>/<name>.test.ts` →
`tests/services/gpu/renderers/galaxyField/<sub>/<name>.test.ts`.

- `field/` (8): `buildFieldHeaderInputs`, `deriveDustHeaderLanes`,
  `dustSliceEdges`, `encodeDustMapPass`, `findHiiSegment`, `packBubbleInstances`,
  `packFieldComponents`, `packFieldHeaderUniforms` (the last two test
  `packFieldUniforms.ts`).
- `ismMap/` (6): `createIsmMapPlaceDust`, `packIsmMapCdfArmEnvelope`,
  `packIsmMapCdfParams`, `packIsmMapFluidConstants`, `packIsmMapFluidEvents`,
  `packIsmMapFluidStepIndex`.
- `gpu/` (1): `createGrowOnlyRecordBuffer`.

Staying at `tests/tools/galaxy-renderer/engine/`: `createOrientationDiagnostics`,
`decodeIsmMapTexels`, `decodeOrientationTexels`, `createReadbackQueue` — all
four test files that stay tool-side.

- [x] `npm run move-files -- --manifest <scratchpad>/galaxyField-tests.json --dry`,
      then for real.
- [x] `G-test` → green, same test count as before the branch.

### Task 8: Verify the dependency rule

- [x] `G-deps` → prints nothing. A hit means a moving file still reaches into
      `tools/` (add it to the closure, or narrow the reach as Task 1 did) or
      pulled in Redux (should be impossible — flag it).
- [x] `G-tool-tsc`, `G-app-tsc`, `G-test`, `G-tool-build`, `G-probe` → all green.
- [x] Commit 1. One mechanical commit; `git log --follow` on a moved file must
      still reach its tool-side history (`git show --stat` should report renames,
      not add/delete pairs).

---

# Commit 2 — consume

The one commit that writes new code. Its internals assemble the moved pieces
**exactly as `createGalaxyEngine.ts` does today** — same construction order,
same `own()`-ledger discipline — just behind the instance API.

### Task 9: Map the seam, then CHECKPOINT

**Files:** none edited. Output is an appendix appended to _this_ plan file.

The spec's contract splits responsibility as "host owns lifecycle, budget and
eviction; module owns GPU resource lifetime and pass encoding." Today that line
runs through two files, not one: `createGalaxyEngine.ts` (1255 lines) owns
pipelines/targets/encode, `model/createGalaxyModel.ts` (1849 lines) owns "what a
galaxy IS" and drives the ISM generator's `rebuild()` — and the spec keeps the
model tool-side entirely, as a _consumer_. So `setMixture()`'s real argument list
is whatever the model computes today and would hand in, and that list is not
derivable from the spec alone.

- [x] Read `createGalaxyEngine.ts` and `model/createGalaxyModel.ts`, and write
      into this plan, as `## Appendix: the today-split`: (a) the concrete
      argument list `setMixture` needs beyond the spec's
      `{ geometry, fieldTuning, seed }`; (b) which of `createGalaxyModel`'s
      responsibilities cross into the module and which stay; (c) the exact
      `GalaxyFieldRenderTargets` views `encode` needs, against
      `gpu/createGalaxyRenderTargets.ts`'s current rows.
- [x] **CHECKPOINT with the user before Task 10.** The risk to name: if the
      honest minimal module turns out to be a pipeline-and-encode holder rather
      than the spec's `setMixture` semantic, that is a spec-contract question,
      not an implementer's call. Do not "make it fit" silently.

### Task 10: Write `createGalaxyFieldRenderer` — construction and disposal

**Files:** `src/services/gpu/renderers/galaxyField/createGalaxyFieldRenderer.ts`
(new).

Signature is pinned by the spec §Public surface — `GalaxyFieldRendererDeps`,
`createGalaxyFieldRenderer(device, deps)`, `GalaxyFieldMixtureInput`,
`GalaxyFieldRenderTargets`, `GalaxyFieldRenderer`. Copy those declarations from
the spec exactly; extend only with what Task 9's appendix established.

This task lands construction + `dispose()` only; `setMixture`/`stepIsmMap`/
`encode` are stubs that throw until Tasks 11–12.

- [x] Construction order matches `createGalaxyEngine.ts`'s current sequence
      one-for-one. Deviating reorders GPU resource creation, and this branch's
      only defence against that is the probe and human eyes.
- [x] `dispose()` releases exactly what the engine's `own()` ledger releases for
      the field/ISM half today — nothing more (the host still owns targets).
- [x] No import of `tools/` or `src/state/` (`G-deps`).
- [x] `G-app-tsc`, `G-tool-tsc`.

### Task 11: `setMixture` + `stepIsmMap`

**Files:** `createGalaxyFieldRenderer.ts` (modify), `createGalaxyEngine.ts`,
`model/createGalaxyModel.ts` (modify — switch to the module's surface).

Per the spec: `setMixture` is idempotent (a `createKeyedRebuild`-style identity
check no-ops when nothing moved); `stepIsmMap()` returns `{ done }` and MW's
eager path calls it in a loop to completion inside `setMixture`, matching
`createIsmMapFluidRunner`'s current behaviour. **Time-slicing is a non-goal** —
`stepIsmMap` exists as a seam for a future per-galaxy scheduler, nothing more.

- [x] Route the engine's/model's existing rebuild path through `setMixture`;
      delete nothing yet (commit 3's job).
- [x] `G-app-tsc`, `G-tool-tsc`, `G-test`, `G-tool-build`, `G-probe`.

### Task 12: `encode`

**Files:** `createGalaxyFieldRenderer.ts` (modify), `createGalaxyEngine.ts`
(modify).

`encode(encoder, targets)` writes the field-splat, dust-map and HII-tier passes
into the caller's encoder against caller-owned views. The only ordering the
module owns is what is intrinsic to one galaxy's own passes — **dustMap before
field**, per the engine's existing order. Where the galaxy's passes sit in the
frame is the host's call and stays in `drawFrame`.

- [x] `drawFrame` passes views from `gpu/createGalaxyRenderTargets.ts` (which
      stays tool-side — the module allocates nothing).
- [x] `G-deps`, `G-app-tsc`, `G-tool-tsc`, `G-test`, `G-tool-build`, `G-probe`.
- [x] Commit 2.

---

# Commit 3 — delete dead copies

### Task 13: Delete what the module now owns

**Files:** `createGalaxyEngine.ts`, `model/createGalaxyModel.ts` (modify).

Whatever inline construction/encode code the module now owns is dead. Deleting
it in its own commit is what makes "what actually changed behaviourally"
reviewable independently of the mechanical move.

- [x] Remove dead locals, dead imports, and any now-unreferenced helper. If a
      moved file ends with **no** importer, say so in the commit message rather
      than deleting it — that is a scope finding for Track C, not a cleanup.
- [x] `G-deps`, `G-app-tsc`, `G-tool-tsc`, `G-test`, `G-tool-build`, `G-probe`.

### Task 14: Comment and header pass over the branch's touched files

**Files:** every file the branch touched.

Moved headers still name tool paths that no longer exist relative to them
(`createGalaxyEngine.ts`, `HII_TIERS`, `data/hiiTiers.ts`, "this engine"),
and `tools/galaxy-renderer/src/data/hiiTiers.ts`'s own header names the two
files that stopped importing it in Task 2. Comments are timeless: fix the
references, do not narrate the move.

- [x] Run the `comment-audit` skill's checklist over the diff. Budget stands:
      module header ≤ 10 lines, comment lines ≤ half the code lines.
- [x] No comment records "moved from the tool" or "was `HII_TIERS`" — that is
      the git log's job.
- [x] `DebugViewKind.ts`'s header cites `src/data/debugViews.ts`, which does not
      exist (the table is `tools/galaxy-renderer/src/data/debugViews.ts`). Fix
      the citation while the file is in hand.
- [x] `G-app-tsc`, `G-test`. Commit 3.

### Task 15: User visual pass

Not an agent task. `npm run galaxy-renderer`, side-by-side against a
pre-branch build. Behaviour-neutral is the acceptance bar — the look must be
**pixel-for-pixel unchanged**. No gate above substitutes for this.

---

## Dispositions of the spec's OPEN questions

- **Debug-sample files — RESOLVED, stay tool-side.**
  `field/createArmRidgeDebugSample.ts` and
  `ismMap/createIsmMapDustCdfScanDebugSample.ts` keep their tool home, per the
  spec's own classification (numeric-validation fixtures, own dispatch, own
  one-shot readback, no production caller — the same class as the
  `probe/`/readback path the scope excludes). They are wired unconditionally in
  `createGalaxyEngine.ts` and stay wired; being a _consumer_ of moved files is
  the allowed direction. `createArmRidgeDebugSample.ts` is also the only
  moving-folder file whose `?static` shader (`armRidgeDebugSample.wesl`) is a
  real tool-local file rather than a symlink to the app's tree — another reason
  it does not travel. **Flag for Track C:** if the app ever wants the same
  numeric-validation path, these two move then.
- **`HiiTier`'s home — RESOLVED, promotes now.** `src/@types/galaxy/HiiTier.ts`,
  in commit 1 (Task 3 + Task 4 group B). The spec authorizes exactly this
  ("promote it to `src/@types/galaxy/` as part of this spec's implementation if
  the contract needs it sooner") and the contract does need it:
  `GalaxyFieldRenderTargets.hiiTiers` is keyed by the union, and the dependency
  rule forbids the shared surface importing from `tools/`. The `HII_TIERS`
  **value table** stays tool-side, unchanged — Track C decides whether the app
  draws the same tiering or a subset.

## Definition of Done

**Deliverables**

- [x] `src/services/gpu/renderers/galaxyField/` exists with the spec's 36 moved
      files plus `createGalaxyFieldRenderer.ts`, exporting
      `createGalaxyFieldRenderer`, `GalaxyFieldRendererDeps`,
      `GalaxyFieldMixtureInput`, `GalaxyFieldRenderTargets`,
      `GalaxyFieldRenderer` per the spec's contract.
- [x] `src/@types/galaxy/HiiTier.ts` exists; the other 15 seam types live
      beside it; `src/services/gpu/lib/beginClearPass.ts` exists.
- [x] 15 unit tests live at `tests/services/gpu/renderers/galaxyField/**`.
- [x] `tools/galaxy-renderer/src/engine/{field,ismMap}/` retain only the two
      debug-sample files and the five diagnostics/readback files the spec keeps
      tool-side; `engine/gpu/` retains `createGalaxyRenderTargets.ts`,
      `createReadbackQueue.ts`, `readTextureChannelSum.ts`.

**Gates** (the tool-specific ones — `/feature-done`'s standing audit does not
run these)

- [x] `npx tsc --noEmit -p tools/galaxy-renderer/tsconfig.json` clean.
- [x] `npm run galaxy-renderer:build` clean — the `?static` proof.
- [x] `npm run galaxy-renderer:probe` clean, run after each of commits 1, 2, 3.
- [x] `grep -rn "tools/\|src/state/" src/services/gpu/renderers/galaxyField/`
      prints nothing.

**Observable behaviours (user pass, `npm run galaxy-renderer`)**

- [x] Default MW view: disc, dust lanes, arm ridges and HII tiers pixel-for-pixel
      identical to a pre-branch build at the same seed and camera.
- [x] Reseed / re-tune: a `setMixture`-triggering param change settles to the
      same look it settled to before, in the same single call (no visible
      multi-frame ISM-map settle appearing where there was none).
- [x] Each of the four debug views (`dust`, `ismMap`, `orientation`, `bubble`)
      crossfades as before.

**Deferral boundary** — out of scope, do not chase: any app-side wiring
(`frameProgram` step, target rows, settings surface, `SubsystemBundle`) = Track
C; the bundle contract = Track A; deleting the tool's bloom mirror = backlog;
time-slicing the ISM-map generator; `HII_TIERS`/`hiiTiers.ts` unification;
promoting the two debug-sample files.

**Packaging** — one PR (spec §PR packaging, RESOLVED), four commits: prep,
move, consume, delete.

## Appendix: the today-split

Read-only analysis (Task 9). All file:line references are against the **main
checkout** (`/Users/rulkens/Development/js/skymap/tools/galaxy-renderer/src/engine/`),
whose content is behaviourally identical to this branch's pre-move tree.
Shorthands below: `engine` = `createGalaxyEngine.ts`, `model` =
`model/createGalaxyModel.ts`, `targets` = `gpu/createGalaxyRenderTargets.ts`.

---

### (a) What `setMixture` needs beyond `{ geometry, fieldTuning, seed }`

**First, the good news: most of the rebuild really is a pure function of those
three.** Every CPU builder on the field/ISM rebuild path already takes exactly
`(geometry, fieldTuning, seed)` or a value derived inside the same call:

| builder                              | call site     | inputs                                                                                                                       |
| ------------------------------------ | ------------- | ---------------------------------------------------------------------------------------------------------------------------- |
| `buildGalaxyFieldMixture`            | model:1269    | `(geometry, fieldTuning)` → components + `spurCloudReservation` + `armCloudReservation`                                      |
| `buildHiiShellsAndYoungWithSegments` | model:1326    | `(geometry, fieldTuning, starFormation, geometry.seed)` → components + segments + `shellFluxSum` + `recentEventCount`        |
| `computePlaceDustBudget`             | model:731     | `(geometry, fieldTuning.dust)`                                                                                               |
| `computeDigVeilBudget`               | model:752     | `(geometry, fieldTuning, shellFluxSum, recentEventCount)` — both extras come from the HII build above, same synchronous call |
| `deriveDustHeaderLanes`              | model:728     | `(geometry, fieldTuning.dust, fieldTuning.dust.enabled)`                                                                     |
| `buildDigArmEnvelopeTable`           | model:685     | `(geometry, fieldTuning, grid)`, grid from `ismMapGridRadiusOrDefault(geometry)`                                             |
| `ismMapGenerator.rebuild`            | model:813-818 | **already literally `{ geometry, tuning, seed }`** (`ismMap/createIsmMapGenerator.ts:44-48`)                                 |

`starFormation` and `dust` are not separate arguments — model:431-432 resolve
both off `fieldTuning` (`currentDust()` / `currentStarFormation()`), and
`currentSeed()` (model:433) is `normalizeGenerationSeed(lastParams.shared.seed)`,
i.e. exactly the spec's `seed`. `geometry` is `describeGalaxy(params)`
(`sprites/generateGalaxy.ts:65,105`), a pure function — so a module could even
derive it, and taking it as an argument is the right call anyway.

**Four things cross that those three do not carry.**

**1. `extras` — the scene's other galaxies. This is the big one.**
`fieldComps` and `hiiComps` are **scene-wide GPU buffers, not one galaxy's**:

- model:1147-1148 — `repackFieldComponents` writes central `fieldMixture`, then
  `for (const e of extras) emission.push(...e.fieldMixture)`, then the central
  dust reservation.
- model:1195-1197, 1219-1226 — `repackHiiComponents` appends every extra's
  `hiiMixture` as the trailing `'hii:extras'` span, and that span is what
  gates the `hiiTex` pass and its composite push (engine:867, 956-967).
- Each extra's mixtures are built at model:1567-1568 off its own
  `generated.geometry` + `transform` (via `place()` /
  `transformGalaxyFieldComponent`, model:1233-1240).

So `setMixture` needs either
`extras: readonly { geometry: GalaxyDescription; transform: Pick<ExtraGalaxySpec,'pos'|'scale'|'rotY'|'tiltX'> }[]`
(module runs `place()` itself — `transformGalaxyFieldComponent` is already in
`src/utils/galaxy/`, so this is legal under the dependency rule), or the
already-transformed `{ fieldMixture, hiiMixture }` pairs. Either way, **the
spec's "one instance per galaxy, MW is instance #1" framing does not describe
today's artifact**: one instance owns the whole scene's component buffers.

**2-3. The two orientation sigmas** — `render.orientationSigmaDerivTexels` /
`render.orientationSigmaIntegTexels`, read live at model:606-607 for
`orientation.dispatch`, and keyed at model:1590-1596 (`noteRenderChanged`) so a
sigma drag re-invalidates the six-stage chain. These are render-bag knobs, not
per-galaxy geometry, and the module owns the chain that consumes them.

**4. `orientationViewWanted`** — `viewIntensity('orientation') > 0` (model:591)
is half of `orientationTexRebuild`'s `wanted` predicate; the other half is
`fieldTuning.ismMap.generator !== 'none'`. Without it, the orientation chain
runs (or doesn't) on the wrong criterion when the generator is off.

**Not needed by `setMixture`, but note where they went:**
`onFieldCompsRegrow` / `onHiiCompsRegrow` (model:155-156, wired at
engine:527-528) become **internal** once `fieldComps`/`hiiComps` and
`createFieldPipelines` live in the same module — that is a genuine win of the
extraction, one of the few places the seam gets simpler.

`viewIntensity('bubble')` (model:791) gates `rebuildBubblePlacements`; see (b)
for why the bubble overlay is a split case.

---

### (b) `createGalaxyModel`'s responsibilities: crossing vs staying

**Crosses into the module** (it owns the GPU resources these write):

- `fieldComps` / `hiiComps` grow-only record buffers (model:301-336) and both
  repack functions (model:1146-1227), including `hiiSegments` and `digOffset`
  — `digOffset` is decided _only_ by `repackHiiComponents` (model:1210) and is
  a `placeDigVeil` dispatch input (model:1051).
- The two mixture captures — `centralFieldMixtureAndReservations` (model:1264),
  `centralHiiMixtureAndSegments` (model:1312) — plus the cached
  `fieldMixture`/`hiiMixture`/`hiiTierSegments`/`shellFluxSum`/
  `recentEventCount`/`spurCloudReservation`/`armCloudReservation`/`dustBudget`/
  `digBudget` (model:361-427).
- `rebuildIsmMap` (model:813-847) and its two CDF scans
  (`dispatchDustCdfScan` model:628-648, `dispatchDigCdfScan` model:669-695).
- All five keyed rebuilds on the GPU path: `orientationTexRebuild` (590),
  `dustPlacementRebuild` (861), `spurCloudPlacementRebuild` (933),
  `armCloudPlacementRebuild` (987), `digPlacementRebuild` (1031) — and the
  `ensureFresh()` ordering that consumes them (model:1599-1613). That method is
  the spec's `stepIsmMap()` in all but name.
- The header-lane getters the field UBO pack reads: `fieldCounts`,
  `dustHeaderLanes`, `hiiTexture`, `armCloudReservation`, `spurCloudReservation`
  (model:1618-1675).
- `setFieldTuning`'s section-identity change detection (model:1415-1506) — every
  branch of it drives module-owned work.

**Stays tool-side:**

- The whole v1 sprite tier: `createGenerationPipelines`/`genUbo` (model:288-293),
  `generateGalaxy` (model:1351), `starBuf`/`dustBuf`/`starCount`,
  `starInstances()`/`dustInstances()` (model:1819-1833), `onStats` (model:1394).
- Extras **lifecycle** — per-extra UBO + generation submit (model:1531-1571),
  `destroyExtras` (model:1509). Only their _geometry+transform_ crosses (see (a)).
- `createIsmMapReadbacks` (model:467) and `createOrientationDiagnostics`
  (model:468), per the spec's tool-only table — **but see the leak below.**
- All of `probe.*` (model:1677-1817) and `handle.probe` (engine:1145-1223).
- The render bag, `setRender`, divisors, and target allocation (engine:509,
  562-570, 591-595, 548-553).

**Two things the spec's split cuts through the middle:**

- **`youngStars` / `ismMapSeedingView` (model:1634-1668).** Both are _field
  header lanes_ the module must pack, and both are computed from
  `readbacks.ismMapData` — the CPU readback the spec keeps tool-side
  (`invMeanNormFor`, model:505-519; `ismMapGlobalMeanDust`, model:488-494). So
  either `createIsmMapReadbacks` moves in (contradicting the spec's tool-only
  table) or `{ youngStars, ismMapSeeding }` become per-frame inputs to `encode`.
- **The bubble overlay.** `field/packBubbleInstances.ts` is in the spec's move
  list, but `bubbleComps` (model:343-349) and `rebuildBubblePlacements`
  (model:767-793) live in the model, while `bubblePresentPipe`/`bubblePresentBG`
  are built inline in `createGalaxyEngine.ts` (engine:449-479) — and that bind
  group binds **`fieldUbo`**, which moves into the module (engine:478).

---

### (c) The `GalaxyFieldRenderTargets` `encode` actually needs

Against `targets`' current rows. Encode-path evidence: engine:869-967.

| what encode touches                                                             | today                           | format                            | sized by                                                                                          | in the spec's type?                                |
| ------------------------------------------------------------------------------- | ------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------- |
| `fieldTex` — field splat attachment                                             | engine:923, targets:164-178     | `rgba16float` (HDR)               | `render.fieldDivisor`                                                                             | yes                                                |
| `dustMapTex` — dustMap pass attachment **and** a sampled input of 4 bind groups | engine:887, targets:191-203     | `rgba16float` (`DUST_MAP_FORMAT`) | `render.dustDivisor`                                                                              | yes                                                |
| `dustViewTex` — `encodeDustPresentPass` attachment (JWST view)                  | engine:900-907, targets:204-210 | `rgba16float` (HDR)               | `render.dustDivisor` (shared with `dustMapTex` — targets:180-183: they **must** rebuild together) | **NO — missing**                                   |
| `hiiTex` — the `hii:extras` pass attachment                                     | engine:962, targets:217-225     | `rgba16float` (HDR)               | `render.extrasDivisor`                                                                            | **NO — missing** (`hiiTiers` is a different thing) |
| `tierTex('shells' \| 'young' \| 'dig')` ×3                                      | engine:945, targets:231-242     | `rgba16float` (HDR)               | one divisor **each** (`shellsDivisor`/`youngDivisor`/`digDivisor`, `data/hiiTiers.ts:14-18`)      | yes, as `hiiTiers`                                 |

Seven textures, not five. Beyond the two missing rows, three structural problems:

1. **`GPUTextureView` is the wrong currency.** Every field/HII/tier UBO packs
   `targetSizePx` off `targets.reducedSize(divisor)` (engine:792-799), and that
   lane feeds `counts2.w`, which the shader's footprint/LOD gates read directly
   (engine:257-261 — "a wrong one there is a silently wrong LOD/splat
   footprint, not a crash"). A `GPUTextureView` exposes no dimensions. Pass
   `GPUTexture` (which has `.width`/`.height`), or carry sizes alongside.
2. **`dustMapTex` is sampled, not just written**, so the module needs the
   texture object for its bind groups — and needs to be **told when the host
   reallocates it**. That is `onDustMapRecreated` today (targets:71, 191-212,
   wired at engine:548-553 → `fieldPipelines.rebuildDustMapDependents`), and its
   own comment says the callback "must never be hoisted to a caller that may
   skip it" because it also resets the `dustMapPopulated` latch, whose
   correctness depends on the texture having _just_ been created. Host-owned
   allocation therefore requires a module method
   (`onTargetsReallocated(targets)`), not just fresh views at `encode` time.
3. **Three overlay draws are not in `encode`'s shape at all.** `ismMapPresent`,
   `orientationPresent` (engine:1015-1028) and `bubblePresent` (engine:1039-1044)
   are encoded into the host's **open `GPURenderPassEncoder`** for `sceneTex`,
   using `ismMapGenerator.presentPipeline`/`presentBindGroup`,
   `ismMapOrientation.presentPipeline`/`presentBindGroup`, and a pipeline bound
   to `fieldUbo` — all module-owned after the move. `encode(encoder, targets)`
   cannot express them; they need a second method
   (`encodeOverlays(pass, weights)`) or the module leaks three pipelines.

---

### Construction-order constraints (the consume commit must reproduce one-for-one)

1. `fieldUbo` (engine:235) → `hiiUbo` (243) → `tierUbo` per `HII_TIERS` (262-273).
   All three are `FIELD_HEADER_BUFFER_SIZE`, **separate buffers by necessity**
   (engine:254-261): two passes writing one frame both land before either runs.
2. The three baked volumes, in order: `dustNoise` (312), `warpNoise` (321),
   `starGrain` (330) — each `bakeVolumeTexture` returns `{texture, sampler}`.
   `dustMapSampler` (346).
3. `createIsmMapGenerator` (356, takes `fieldUbo`) → `createIsmMapOrientation`
   (361, takes `fieldUbo` **and** `sourceTexture: ismMapGenerator.texture`) →
   `createIsmMapRingReduce` (368, takes `ismMapGenerator.texture` +
   `ringMeansBuffer`).
4. `dustCdfScan` (375) and `digCdfScan` (386) — **two separate instances of the
   same factory**, deliberately not shared (engine:380-385: one `prefixBuffer`
   would let whichever deferred dispatch runs second clobber the first's input).
5. `placeDust` (392), `placeArmSpurCloud` (394), `placeArmCloud` (396),
   `placeDigVeil` (398).
6. `createFieldPipelines` (415) — **must come after 1-5**: it takes `fieldUbo`,
   `hiiUbo`, `tierUbo`, `ismMapGenerator`, all three noise textures + samplers,
   `dustMapSampler`, and `ringReduce.{dustRenormBuffer, armCloudRenormBuffer,
spurCloudRenormBuffer}`. `getDustMapTex` is passed as a **thunk**
   (engine:434) precisely because `targets` does not exist yet (engine:410-414).
7. `createGalaxyModel` (515) — after 3-6.
8. `fieldPipelines.rebuildDustMapBindGroup(model.fieldComps.buffer)` (540) —
   after the model, before `targets`; it is the _only_ one of the five bind
   groups that doesn't reference `dustMapTex` (engine:536-539).
9. `createGalaxyRenderTargets` (548) with the `rebuildDustMapDependents`
   callback, then the unconditional `targets.rebuildAll(allDivisors())`
   (engine:623) — deliberately not left to `resize`'s early return (engine:612-619).

Per-frame order, also load-bearing:
`model.ensureFresh()` **before the encoder exists** (engine:817 — a rebuild can
destroy `bubbleComps`' buffer a recorded draw already holds, and the orientation
chain submits its own encoder that must precede the frame's); inside it,
bubbles → `orientationTexRebuild` → `orientationDataRebuild` → **dust placement
strictly after orientation** (model:1604-1608) → spur → armCloud → dig. Then
within `encode`: dustMap → dustPresent → field splat → the three tier passes in
`HII_TIERS` row order → `hii:extras`. Cross-_submit_ ordering is relied on
without a barrier: `ringReduce.dispatchRingMeans` submits at model:826-827 and
`dispatchDustCdfScan`'s later submit reads `ringMeansBuffer` (model:821-825).

---

### `own()`-ledger entries `dispose()` must release

The engine's `owned[]` ledger (engine:211-215, walked in reverse at engine:1250).
**Field/ISM half:**

- `fieldUbo` (engine:235), `hiiUbo` (243), `tierUbo` ×3 (262-273)
- `dustNoiseTex` (319), `warpNoiseTex` (328), `starGrainTex` (337)

**Stays in the tool's ledger:** `quad` (218 — sprite passes only), `gradeBuf`
(276), `starUbo`/`dustUbo` (295-296).

**Self-owning modules disposed explicitly (engine:1229-1249)** that belong to
the field/ISM half: `ismMapGenerator` (1232), `ismMapOrientation` (1233),
`ringReduce` (1234), `dustCdfScan` (1235), `digCdfScan` (1236), `placeDust`
(1237), `placeArmSpurCloud` (1238), `placeArmCloud` (1239), `placeDigVeil`
(1240). Plus, from `model.destroy()` (model:1835-1847): `fieldComps` (1842),
`hiiComps` (1843), `bubbleComps` (1844).

Two notes:

- `armRidgeDebugSample` (1241) and `ismMapDustCdfScanDebugSample` (1242) are
  disposed here too. The spec classifies them tool-side (its own OPEN question),
  but they are constructed unconditionally at engine:401/405 and live in
  `field/`/`ismMap/` — if they stay, they stay wired to `makeShader` only, which
  is fine; just don't let the move sweep them in silently.
- Samplers (`dustNoiseSampler`, `warpNoiseSampler`, `starGrainSampler`,
  `dustMapSampler`) have no `destroy()` and are absent from the ledger by
  design; `createFieldPipelines` has no `dispose()` at all (pipelines and bind
  groups aren't destroyable). So the module's `dispose()` is exactly the list
  above — no new teardown surface is invented by the extraction.

---

### (d) ASSESSMENT

**The `setMixture` semantic survives; `encode(encoder, targets)` does not.**

The rebuild half of the spec is real and I'd keep it. Every builder on the
field/ISM rebuild path already takes `(geometry, fieldTuning, seed)` and nothing
else — `ismMapGenerator.rebuild` is _literally_ that object today
(`createIsmMapGenerator.ts:44-48`), and `starFormation`/`dust` are sections of
`fieldTuning`, not separate inputs (model:431-432). A module that owns the
mixtures, the budgets, the ISM map, the five keyed rebuilds and the two comps
buffers is a coherent artifact, and it deletes real seam surface: the
`onFieldCompsRegrow`/`onHiiCompsRegrow` callbacks (model:155-156) and the
`getDustMapTex` thunk both become internal. This is **not** a
pipeline-and-encode holder fed by the model — the model's field/ISM half is a
clean lift, and leaving it behind would leave the app hand-porting exactly the
~1250 lines the spec exists to avoid.

But the _encode_ half of the contract is under-specified by roughly one whole
argument. The field, `hii:extras` and three tier UBOs are rewritten **every
frame** from camera-derived `FieldHeaderInput`s (engine:776-811), and those same
UBOs are constructor-time dependencies of both `createIsmMapGenerator`
(engine:356-360) and `createFieldPipelines` (engine:415-435) — so they must be
module-owned, while their content is per-frame host data. `encode` therefore
needs a third argument the size of `FieldHeaderInputsDeps`
(`field/buildFieldHeaderInputs.ts:48-56`). The forcing data, precisely: `eye`,
`fov`, `shiftX`, the `FrameView`'s field-relevant lanes (`view`, `aspect`,
`debugViews`, `galaxyWeight`, `ismMapChannels`, `dustSlices`,
`analyticExposure`, `starGrainFeatureScale`), the `render.analyticField` gate
(engine:854) and `debugViews.dust > 0` (engine:868), the per-target **pixel
sizes** (engine:792-799 — unobtainable from a `GPUTextureView`, which is why the
targets type must carry `GPUTexture` or sizes), the optional per-slot
`timestampWrites` if the tool's HUD is to keep working (engine:886, 920, 944,
960), and `{ youngStars, ismMapSeeding }` (model:1634-1668) unless the CPU
readback moves in against the spec's tool-only table.

**And one claim in the spec is factually wrong about today's code**: "one
instance per galaxy" cannot describe a module that owns `fieldComps`/`hiiComps`,
because those buffers are **scene-wide** — central mixture, then every extra's,
then the central dust reservation (model:1147-1148), with the extras' HII as a
trailing `'hii:extras'` span that gates its own pass and composite
(model:1219-1226, engine:867/956-967). Per-galaxy instancing is a real future
shape, but it is a _behavioural_ change to the packed layout, and this spec is
behaviour-neutral by construction.

**The middle path, concretely — N = 4 extra `setMixture` inputs, plus one new
`encode` argument and one new lifecycle method:**

```
setMixture({
  geometry, fieldTuning, seed,          // the spec's three — sufficient for all CPU builders
  extras,                               // 1. readonly {geometry, transform}[]  — model:1559-1569
  sigmaDerivTexels,                     // 2. render.orientationSigmaDerivTexels — model:606,1590
  sigmaIntegTexels,                     // 3. render.orientationSigmaIntegTexels — model:607,1591
  orientationViewWanted,                // 4. viewIntensity('orientation') > 0  — model:591
})
stepIsmMap()                            // = model.ensureFresh(), ordering at model:1599-1613
encode(encoder, targets, frame)         // frame = the FieldHeaderInputsDeps-shaped bag above
encodeOverlays(pass, weights)           // ismMap / orientation / bubble present — engine:1015-1044
onTargetsReallocated(targets)           // replaces onDustMapRecreated — targets:191-212
dispose()
```

`GalaxyFieldRenderTargets` becomes seven `GPUTexture` rows (not five views):
`fieldTex`, `dustMapTex`, `dustViewTex`, `hiiTex`, and `hiiTiers` keyed by the
three `HiiTierKind`s.

**This is a spec-contract question, not an implementer's call.** Three items
need a ruling before Task 10: (i) `encode` gains a per-frame argument — accept,
or split into `setFrame()` + `encode()`; (ii) `GalaxyFieldRenderTargets` gains
two rows and switches views→textures; (iii) does `createIsmMapReadbacks` move in
(so `youngStars`/`ismMapSeeding` stay internal), or do those two lane bags ride
the frame argument? And the "one instance per galaxy" line in the spec should be
struck or re-scoped to a future track — it is not true of the artifact this
extraction produces.

### Accepted deviation: `targetSizePx` off the texture, not `reducedSize(divisor)`

`encode` derives each pass's `targetSizePx` from the target texture's own
`.width`/`.height` rather than `reducedSize(divisor)`. The two agree in steady
state; they differ only in the frames between a canvas backing-size change and
the ResizeObserver's reallocation, where the packed size now follows the old
texture instead of the new canvas-derived size. This is more correct than
baseline, not less — accepted, not pixel-for-pixel in that transient window.
