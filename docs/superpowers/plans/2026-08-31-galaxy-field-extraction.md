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
2. **Three tool-local *values* are imported by the moving files**, none of them
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

| name | command | catches |
|---|---|---|
| `G-tool-tsc` | `npx tsc --noEmit -p tools/galaxy-renderer/tsconfig.json` | tool-side type breakage. **NEVER omit `--noEmit`** — this config has none of its own and will write ~1200 `.js`/`.d.ts` files next to their sources. |
| `G-app-tsc` | `npm run typecheck` | app-side breakage. Does **not** compile the tool; after commit 1 it *does* cover the moved files (root tsconfig includes `src` + `tests`). |
| `G-test` | `npm test` | the 15 moved unit tests + the two `tests/services/gpu/shaders/*.parity.test.ts` byte-layout parity tests. |
| `G-tool-build` | `npm run galaxy-renderer:build` | the **only** gate that resolves `.wesl?static` for real. `*.wesl?static` is a *wildcard* ambient module (`wesl-plugin/suffixes`), so a stale shader path type-checks clean under both tsc gates and fails only here. |
| `G-probe` | `npm run galaxy-renderer:probe` | the only automated gate reaching the engine (GPU validation errors). |
| `G-deps` | `grep -rn "tools/\|src/state/" src/services/gpu/renderers/galaxyField/` → must print nothing | the spec's dependency rule. |

`G-probe` runs after **each** commit, not only at the end (spec §Migration
sequencing).

---

# Commit 0 — seam prep (no moves)

Two content edits that remove the moving files' last reaches into tool-only
*values*. Both are argument-shape changes with identical runtime behaviour;
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
  readonly view: Float32Array;               // deriveFrameView.ts:53 — a raw mat4, not a Mat4 alias
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

- [ ] Read `deriveFrameView.ts`'s `FrameView` and `RenderSettings.d.ts` for the
      exact field types; copy types, not values. Do not widen or reorder.
- [ ] Swap `FieldHeaderInputsDeps.frame`/`.render` to the two new types; drop
      the `FrameView` and `RenderSettings` imports.
- [ ] `G-tool-tsc`, `G-test -- buildFieldHeaderInputs` → green, no test edits
      needed. If a test edit *is* needed, the narrowing was wrong — re-derive.

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

- [ ] Both sites: `Object.keys(<the record>) as HiiTierKind[]`, mirroring the
      cast `buildFieldHeaderInputs.ts:178` already makes on its
      `Object.fromEntries` result.
- [ ] Drop both `HII_TIERS` imports. Leave the `HII_TIERS`-naming comments at
      `buildFieldHeaderInputs.ts:4,169` and `createFieldPipelines.ts:64,82,147,153`
      alone — they name the *concept*, and rewriting them is Task 13's job.
- [ ] `G-tool-tsc`, `G-test`, `G-tool-build`, `G-probe`.
- [ ] Commit 0. Message frames it as prep: the moving files' last tool-only
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

- [ ] `--dry` first; confirm the file renames to `HiiTier.d.ts` and ~6 importers
      are rewritten.
- [ ] `G-tool-tsc`, `G-app-tsc`.

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

| from `tools/galaxy-renderer/@types/` | to `src/@types/galaxy/` |
|---|---|
| `engine/DebugViewWeights.d.ts` | `DebugViewWeights.ts` |
| `engine/DustHeaderLanes.d.ts` | `DustHeaderLanes.ts` |
| `engine/FieldCamera.d.ts` | `FieldCamera.ts` |
| `engine/FieldDust.d.ts` | `FieldDust.ts` |
| `engine/FieldDustCarve.d.ts` | `FieldDustCarve.ts` |
| `engine/FieldDustNoise.d.ts` | `FieldDustNoise.ts` |
| `engine/FieldDustSlices.d.ts` | `FieldDustSlices.ts` |
| `engine/FieldHeaderInput.d.ts` | `FieldHeaderInput.ts` |
| `engine/FieldSliceCounts.d.ts` | `FieldSliceCounts.ts` |
| `engine/HiiSegment.d.ts` | `HiiSegment.ts` |
| `engine/HiiTextureLanes.d.ts` | `HiiTextureLanes.ts` |
| `engine/HiiTier.d.ts` (post-Task 3) | `HiiTier.ts` |
| `engine/IsmMapChannelWeights.d.ts` | `IsmMapChannelWeights.ts` |
| `engine/IsmMapSeedingLanes.d.ts` | `IsmMapSeedingLanes.ts` |
| `engine/YoungStarsLanes.d.ts` | `YoungStarsLanes.ts` |
| `data/DebugViewKind.d.ts` | `DebugViewKind.ts` |

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

- [ ] 53 entries total (36 + 16 + 1). Verify the count before running.
- [ ] Read the dry-run's rewritten-file set. Expect it to name
      `createGalaxyEngine.ts`, `model/createGalaxyModel.ts`,
      `frame/deriveFrameView.ts`, `probeGpuErrors.ts`, the staying `passes/*`,
      the 15 tool tests and `tests/services/gpu/shaders/{records,constants}.parity.test.ts`.
- [ ] Nothing is saved by `--dry`. Do not commit the manifest.

### Task 5: Execute the move

- [ ] `npm run move-files -- --manifest <scratchpad>/galaxyField-moves.json`
- [ ] `G-app-tsc`, `G-tool-tsc` → both green. (They will be even with the
      shader paths still stale — see Task 6.)
- [ ] Do **not** commit yet; Tasks 6–8 belong to this commit.

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

- [ ] `grep -rn "wesl?static" src/services/gpu/renderers/galaxyField/` → 27 hits,
      all beginning `'../../../shaders/`.
- [ ] `grep -rn "'\.\./shaders/" src/services/gpu/renderers/galaxyField/` → nothing.
- [ ] `G-tool-build` → green. **This is the only gate that proves Task 6.**

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

- [ ] `npm run move-files -- --manifest <scratchpad>/galaxyField-tests.json --dry`,
      then for real.
- [ ] `G-test` → green, same test count as before the branch.

### Task 8: Verify the dependency rule

- [ ] `G-deps` → prints nothing. A hit means a moving file still reaches into
      `tools/` (add it to the closure, or narrow the reach as Task 1 did) or
      pulled in Redux (should be impossible — flag it).
- [ ] `G-tool-tsc`, `G-app-tsc`, `G-test`, `G-tool-build`, `G-probe` → all green.
- [ ] Commit 1. One mechanical commit; `git log --follow` on a moved file must
      still reach its tool-side history (`git show --stat` should report renames,
      not add/delete pairs).

---

# Commit 2 — consume

The one commit that writes new code. Its internals assemble the moved pieces
**exactly as `createGalaxyEngine.ts` does today** — same construction order,
same `own()`-ledger discipline — just behind the instance API.

### Task 9: Map the seam, then CHECKPOINT

**Files:** none edited. Output is an appendix appended to *this* plan file.

The spec's contract splits responsibility as "host owns lifecycle, budget and
eviction; module owns GPU resource lifetime and pass encoding." Today that line
runs through two files, not one: `createGalaxyEngine.ts` (1255 lines) owns
pipelines/targets/encode, `model/createGalaxyModel.ts` (1849 lines) owns "what a
galaxy IS" and drives the ISM generator's `rebuild()` — and the spec keeps the
model tool-side entirely, as a *consumer*. So `setMixture()`'s real argument list
is whatever the model computes today and would hand in, and that list is not
derivable from the spec alone.

- [ ] Read `createGalaxyEngine.ts` and `model/createGalaxyModel.ts`, and write
      into this plan, as `## Appendix: the today-split`: (a) the concrete
      argument list `setMixture` needs beyond the spec's
      `{ geometry, fieldTuning, seed }`; (b) which of `createGalaxyModel`'s
      responsibilities cross into the module and which stay; (c) the exact
      `GalaxyFieldRenderTargets` views `encode` needs, against
      `gpu/createGalaxyRenderTargets.ts`'s current rows.
- [ ] **CHECKPOINT with the user before Task 10.** The risk to name: if the
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

- [ ] Construction order matches `createGalaxyEngine.ts`'s current sequence
      one-for-one. Deviating reorders GPU resource creation, and this branch's
      only defence against that is the probe and human eyes.
- [ ] `dispose()` releases exactly what the engine's `own()` ledger releases for
      the field/ISM half today — nothing more (the host still owns targets).
- [ ] No import of `tools/` or `src/state/` (`G-deps`).
- [ ] `G-app-tsc`, `G-tool-tsc`.

### Task 11: `setMixture` + `stepIsmMap`

**Files:** `createGalaxyFieldRenderer.ts` (modify), `createGalaxyEngine.ts`,
`model/createGalaxyModel.ts` (modify — switch to the module's surface).

Per the spec: `setMixture` is idempotent (a `createKeyedRebuild`-style identity
check no-ops when nothing moved); `stepIsmMap()` returns `{ done }` and MW's
eager path calls it in a loop to completion inside `setMixture`, matching
`createIsmMapFluidRunner`'s current behaviour. **Time-slicing is a non-goal** —
`stepIsmMap` exists as a seam for a future per-galaxy scheduler, nothing more.

- [ ] Route the engine's/model's existing rebuild path through `setMixture`;
      delete nothing yet (commit 3's job).
- [ ] `G-app-tsc`, `G-tool-tsc`, `G-test`, `G-tool-build`, `G-probe`.

### Task 12: `encode`

**Files:** `createGalaxyFieldRenderer.ts` (modify), `createGalaxyEngine.ts`
(modify).

`encode(encoder, targets)` writes the field-splat, dust-map and HII-tier passes
into the caller's encoder against caller-owned views. The only ordering the
module owns is what is intrinsic to one galaxy's own passes — **dustMap before
field**, per the engine's existing order. Where the galaxy's passes sit in the
frame is the host's call and stays in `drawFrame`.

- [ ] `drawFrame` passes views from `gpu/createGalaxyRenderTargets.ts` (which
      stays tool-side — the module allocates nothing).
- [ ] `G-deps`, `G-app-tsc`, `G-tool-tsc`, `G-test`, `G-tool-build`, `G-probe`.
- [ ] Commit 2.

---

# Commit 3 — delete dead copies

### Task 13: Delete what the module now owns

**Files:** `createGalaxyEngine.ts`, `model/createGalaxyModel.ts` (modify).

Whatever inline construction/encode code the module now owns is dead. Deleting
it in its own commit is what makes "what actually changed behaviourally"
reviewable independently of the mechanical move.

- [ ] Remove dead locals, dead imports, and any now-unreferenced helper. If a
      moved file ends with **no** importer, say so in the commit message rather
      than deleting it — that is a scope finding for Track C, not a cleanup.
- [ ] `G-deps`, `G-app-tsc`, `G-tool-tsc`, `G-test`, `G-tool-build`, `G-probe`.

### Task 14: Comment and header pass over the branch's touched files

**Files:** every file the branch touched.

Moved headers still name tool paths that no longer exist relative to them
(`createGalaxyEngine.ts`, `HII_TIERS`, `data/hiiTiers.ts`, "this engine"),
and `tools/galaxy-renderer/src/data/hiiTiers.ts`'s own header names the two
files that stopped importing it in Task 2. Comments are timeless: fix the
references, do not narrate the move.

- [ ] Run the `comment-audit` skill's checklist over the diff. Budget stands:
      module header ≤ 10 lines, comment lines ≤ half the code lines.
- [ ] No comment records "moved from the tool" or "was `HII_TIERS`" — that is
      the git log's job.
- [ ] `DebugViewKind.ts`'s header cites `src/data/debugViews.ts`, which does not
      exist (the table is `tools/galaxy-renderer/src/data/debugViews.ts`). Fix
      the citation while the file is in hand.
- [ ] `G-app-tsc`, `G-test`. Commit 3.

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
  `createGalaxyEngine.ts` and stay wired; being a *consumer* of moved files is
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

- [ ] `src/services/gpu/renderers/galaxyField/` exists with the spec's 36 moved
      files plus `createGalaxyFieldRenderer.ts`, exporting
      `createGalaxyFieldRenderer`, `GalaxyFieldRendererDeps`,
      `GalaxyFieldMixtureInput`, `GalaxyFieldRenderTargets`,
      `GalaxyFieldRenderer` per the spec's contract.
- [ ] `src/@types/galaxy/HiiTier.ts` exists; the other 15 seam types live
      beside it; `src/services/gpu/lib/beginClearPass.ts` exists.
- [ ] 15 unit tests live at `tests/services/gpu/renderers/galaxyField/**`.
- [ ] `tools/galaxy-renderer/src/engine/{field,ismMap}/` retain only the two
      debug-sample files and the five diagnostics/readback files the spec keeps
      tool-side; `engine/gpu/` retains `createGalaxyRenderTargets.ts`,
      `createReadbackQueue.ts`, `readTextureChannelSum.ts`.

**Gates** (the tool-specific ones — `/feature-done`'s standing audit does not
run these)

- [ ] `npx tsc --noEmit -p tools/galaxy-renderer/tsconfig.json` clean.
- [ ] `npm run galaxy-renderer:build` clean — the `?static` proof.
- [ ] `npm run galaxy-renderer:probe` clean, run after each of commits 1, 2, 3.
- [ ] `grep -rn "tools/\|src/state/" src/services/gpu/renderers/galaxyField/`
      prints nothing.

**Observable behaviours (user pass, `npm run galaxy-renderer`)**

- [ ] Default MW view: disc, dust lanes, arm ridges and HII tiers pixel-for-pixel
      identical to a pre-branch build at the same seed and camera.
- [ ] Reseed / re-tune: a `setMixture`-triggering param change settles to the
      same look it settled to before, in the same single call (no visible
      multi-frame ISM-map settle appearing where there was none).
- [ ] Each of the four debug views (`dust`, `ismMap`, `orientation`, `bubble`)
      crossfades as before.

**Deferral boundary** — out of scope, do not chase: any app-side wiring
(`frameProgram` step, target rows, settings surface, `SubsystemBundle`) = Track
C; the bundle contract = Track A; deleting the tool's bloom mirror = backlog;
time-slicing the ISM-map generator; `HII_TIERS`/`hiiTiers.ts` unification;
promoting the two debug-sample files.

**Packaging** — one PR (spec §PR packaging, RESOLVED), four commits: prep,
move, consume, delete.
