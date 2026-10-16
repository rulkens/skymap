# The central frame table — what is there, how Layers fit, where it strains

Read against `main` at #914. Companion to the weak-points audit (`docs/audits/2026-10-16-architecture-weak-points.md`, engine items 2, 11, 12 and the "outgrown decisions" row). Every claim carries a file reference; nothing here is from the plans or ADRs alone.

## 1. The artifact

`src/data/rendering/frameSections.ts` (383 lines) is four hand-ordered sections plus two dome variants. `src/services/engine/frame/frameOrder.ts` concatenates the four into `FRAME_ORDER`; `src/data/rendering/viewRigs.ts` assigns sections to rigs.

| Section | Scope | Lines | What it holds |
| --- | --- | --- | --- |
| `PRELUDE` | once | 9 | 4 plan rows, 3 computes, 2 cubemap-capture rosters |
| `SCENE` | perView | 14 | 1 plan, 1 compute, 10 render lines, the `foreground` chain line, the body composite |
| `POST` | once | 2 | bloom, tonemap |
| `OVERLAYS` | once | 2 | the two swap-chain overlay lines (COSMO, NEAR0) |
| `SCENE_TO_DOME_CUBE` | perView | 15 | `SCENE` plus a `copy` of `hdr` into the dome cube |
| `DOME_RESAMPLE` | once | 1 | the fisheye resample back into `hdr` |

The mono rig runs `[PRELUDE, SCENE, POST, OVERLAYS]`, 27 lines; the dome rig `[PRELUDE, SCENE_TO_DOME_CUBE, DOME_RESAMPLE, POST]` with no overlays (known gap, backlog `2026-09-23-dome-output-space-overlays.md`).

About 190 of the 383 lines are comment. That prose is the ordering rationale (why the Milky Way leads NEAR0, why `local-bubble` must follow it immediately, why `rings` trails every opaque sphere) and the spec called it "the artifact's real value; none of it is derivable" (`docs/superpowers/specs/2026-09-09-layer-composition-design.md` §5).

### 1.1 The nine line kinds

`FrameStepSpec` (`src/@types/engine/frame/FrameStepSpec.d.ts`) is a nine-arm union. What each line can say:

| Kind | Fields | Expands at runtime to |
| --- | --- | --- |
| `plan` | `name` | nothing on the GPU; `runPlanSteps` runs the named `FrameContentPlanner` before the section's first GPU step |
| `compute` | `name` | one compute step |
| `capture` | `captures[]`, `cosmoPasses[]`, `near0Passes[]`, `bodyPasses[]` | per requested cube face: a COSMO step, a NEAR0 step, one depth-clearing step per body slab. Zero faces, zero steps |
| `render` | `target`, `slab` (a fixed index or a `BodyRowSource`), `passes[]`, `depth?`, `slot?` | one step per resolved slab; `slab: 'lens'` or `'insideAtmosphere'` resolves to this frame's body rows (`bodyRowSlabs.ts`) |
| `foreground` | `target`, `near0Passes[]`, `bodyPasses[]` (with at most one `{ sampleDepth }` marker) | one depth-clearing step per entry in the painter-ordered foreground chain; a body row splits in three at the marker (`bodyRowSteps.ts`) |
| `composite` | `source`, `dest` | an OVER composite, skipped if the source was untouched this frame |
| `bloom` | none | the ten-pass pyramid, when enabled |
| `tonemap` | `source`, `dest` | a replace composite carrying the tone curve |
| `copy` | `source` | a copy into the current view's own output layer |

Two things worth noticing. A `render` line is `(target, slab, roster, depth mode, timing slot)`: the roster order is the draw order and there is no second table for it to disagree with. And three kinds carry per-frame expansion (`capture`, `foreground`, body-row `render`), which is how the table stays static while the body chain, the lens rows and the capture faces change every frame.

### 1.2 From a Layer's `passes()` to a draw call

1. **Boot, `createLayers`** (`src/services/engine/phases/createLayers.ts`). Each Layer's `passes(runtime)`, `computes(runtime)` and `planners(runtime)` are appended after core's `CONTENT_PASSES`, `CORE_COMPUTES` and planner rows with `concatUniqueRows`, so a duplicate name throws. Each row is wrapped once by `gatePassByFade` / `gateComputeByFade` / `gatePlannerByFade`, which resolves the row's `fade` address and skips a pass whose value is zero. Layer `targets` join core's target rows through `composeRenderTargetRows`; Layer `slabs` join `state.slabRows`.
2. **Boot, `checkFrameOrder`** (`src/services/engine/frame/checkFrameOrder.ts`), run by `startLoop` over every rig's program with the composed rows. Rules: a plan row leads its section and names a registered planner of matching scope; a compute's scope matches its section; no pass, compute or planner is listed twice within one program; every contributed pass is drawn by some line or re-drawn by a capture; every contributed compute and planner is listed; every touched target id and every sampled depth source is a declared, depth-bearing row.
3. **Per frame, `renderFrame`** (`src/services/engine/frame/renderFrame.ts`). For each section: `runPlanSteps` executes the plan rows (once-scope against the frame snapshot, perView against each view), then `expandFrameOrder(section.steps, state.passes, frameInputs)` turns lines into `FrameStep`s.
4. **Expansion** (`src/services/engine/frame/expandFrameOrder.ts`). `resolvePassNames` maps each authored name to the contributed `ContentPass` by exact string match and drops names no Layer contributed. A render step left with no passes is dropped. Consecutive render steps sharing `(target, slab, capture, depth)` are merged, which is what keeps the pass count flat when the lens line emits nothing.
5. **Execution** (`src/services/engine/frame/executeFrame.ts`). One `beginRenderPass` per step. The step's passes are filtered by `enabled(state, ctx, view, fade)` and the debug panel's disabled set, then drawn in roster order. First touch of a target in a program run clears it; later steps load. Depth is cleared, loaded or sampled per the step's `depth`.

### 1.3 What is derived from the table

The table feeds more than the executor, and these derivations are a real strength:

- GPU timing slots and the debug panel's per-pass toggles (`frame/timing/timedSlots.ts`, `timedSlotGroups.ts`, `maxProgram.ts`, `frameOrderPassNames.ts`).
- The pick program's pass-to-slab map, `passSlabOf(FRAME_ORDER)` (`pickProgram.ts:78`), so picking groups by the same slab the renderer draws through.
- The cubemap capture rosters, so a sky bake composites in the live frame's order.
- The boot test `tests/services/engine/frame/frameOrderBoot.test.ts` runs the real check over the real sections, core passes and the app composition's targets.

## 2. How Layers fit in

### 2.1 What a Layer declares

| Member | Type | What it decides | What it does not decide |
| --- | --- | --- | --- |
| `passes(runtime)` | `ContentPass[]` | the pass `name`, its `fade` address, `enabled`, `draw`, `drawPick`, `pickEnabled`, `pickTarget: 'overlay'` | target, slab, step, position in the roster, depth mode, timing slot, capture membership |
| `computes(runtime)` | `ContentCompute[]` | `name`, `scope`, `encode`, `fade` | where in the prelude or scene it runs |
| `planners(runtime)` | `FrameContentPlanner[]` | `name`, `scope`, `plan` | which section's plan row runs it |
| `targets` | `RenderTargetSpec[]` | an offscreen's id, format, depth, scale, clear, allocation rule | which line draws into it and which line reads it back |
| `slabs` | `SlabRow[]` | a body-metre frame host with `source: 'foreground' \| 'lens'` | which passes draw on that row (the foreground roster is core's) |

`ContentPass.d.ts` states it plainly: "WHERE it draws is not here: `FRAME_ORDER` names the pass on the line that states the target, the slab and the draw order."

### 2.2 How much of the table is Layer content

| Row kind | In the table | Layer-owned | Core-owned |
| --- | --- | --- | --- |
| Pass names | 48 | 26 (13 Layers) | 22 (bodies, atmosphere, labels, rings, overlays) |
| Compute names | 4 | 2 (`flow`, `star-cut`) | 2 (`sky-view`, `aerial-perspective`) |
| Planner names | 5 | 5 | 0 |
| Target ids drawn into | 10 | 5 (`zoa`, `cosmic-web-density`, `star-aggregates`, `mw-aggregate`, `sky-cubemap`) | 5 (`hdr`, `foreground:0`, `solar-system-sky`, `dome-cube`, `swap`) |

Every planner and more than half the pass names in core's table belong to Layers. A Layer that owns its own offscreen target (four do) still needs core to author both the line that renders into it and the roster position of the upsample pass that reads it back.

### 2.3 What adding a Layer costs in the table

From the table's own history (75 commits to it and its predecessors; 14 of the last 16 also touched `src/layers/`):

- **lightTime (#864)**: one name inserted into the `(hdr, NEAR0)` roster plus two lines of prose.
- **blackHoles (#825)**: the lens line's name changed, one name added to the post-lensing roster, prose updated.
- **starCatalog (#802)**, **cosmicWebDensity (#814)**, **structure (#880)**: their own render lines for their own offscreen targets, roster positions for their upsample passes, a compute line, a plan row.

So the per-Layer edit is small, usually one to three lines. The cost is not keystrokes. It is that the Layer contract's one sentence, "core composes Layers; it does not reach inside one" (`src/layers/README.md`), has one standing exception: core holds every Layer's pass, compute, planner and target names as string literals.

### 2.4 Omission semantics, and where they break

The table is written against the full app composition. A pass or compute name that no Layer contributed is dropped by `resolvePassNames`, so a composition without, say, the flow Layer leaves the `flow` names inert. That is the designed way to subset (spec §5: "names no present Layer owns are simply dropped: that is how omission works, not an error").

Planners are the exception. `checkFrameOrder` throws when a plan row names an unregistered planner (`checkFrameOrder.ts:116-120`), and `runPlanSteps` throws again per frame. A composition without the flow, milkyWay, starCatalog, galaxyCatalog or structure Layer therefore fails at boot until the table is edited. The boot test has to stub those planners (`frameOrderBoot.test.ts`, `stubPlannersFor`). So the table is composition-agnostic for passes and composition-specific for planners, and the "reference engine" the spec describes (§7) cannot reuse the sections as they stand.

## 3. The decision behind it, and what still holds

ADR 0011 (2026-08-17) rejected deriving order from a dependency graph: "the ordering constraints in this renderer are semantic, not dataflow: multiplicative dust must follow additive emission, `NEAR0` must draw over `COSMO`, tone-map must be last. ... The step list is also small and stable, around thirteen steps." The layer-composition spec (2026-09-09, §5) then made order and roster one artifact and moved `target` and `slab` off the pass row onto the line, to dissolve the "three tables must agree" problem rather than check it.

Both arguments still hold:

- The cross-step constraints are semantic and few. Nothing in the frame's dataflow says dust must follow emission; that is physics, and a list states it honestly.
- Putting roster and order in one place did remove a class of bug: a pass cannot name a target that no line draws into.
- The coverage check, the merge rule, the zero-dispatch expansion and the derived debug all work and are tested.

What did not hold is the premise "about thirteen stable steps". The step list grew to 27 lines plus the dome pair, and the thing that grew fastest is not steps but the names inside them: 26 Layer passes, 5 Layer planners, 2 Layer computes and 5 Layer targets. The ADR's own vocabulary note said "layers pin to `(target, slab)` as data"; the implementation chose the opposite direction and pinned names into the table.

## 4. Where it strains

1. **Three places must agree on a target's format and depth, and only existence is checked.** The target row declares `format` and `depth` (`RenderTargetSpec`). The line declares which target and slab. The pass's renderer bakes the pipeline's colour and depth formats at construction; 20 renderer files hard-code `rgba16float`, `depth32float` or `depth24plus`, including five Layer renderers. `checkFrameOrder` verifies the target id exists and that a sampled source has depth, nothing about format. `ContentPass.d.ts` carries the rule as an "Invariant" in prose. With no `pushErrorScope` or `onuncapturederror` anywhere in `src`, a mismatch invalidates the command buffer and shows as a console warning and a black frame.

2. **A Layer pass on a swap line would break on the HDR toggle.** `buildSwapRenderers.ts` rebuilds only core handle rows flagged `rebuildOnSwapFormat`; a Layer sees the boot format (`createLayers.ts:93`). No Layer pass sits on an `OVERLAYS` line today, and nothing stops the next one.

3. **Capture rosters are not checked for typos.** `checkFrameOrder` collects captured names only to exempt them from the "drawn somewhere" rule. A misspelled name in `cosmoPasses` resolves to nothing and bakes a sky without that content. A pass listed only in a capture roster passes the check but `passSlabOf` skips captures, so the pick program never sees it.

4. **Plan rows make the table composition-specific** (§2.4). This is a one-line change in `checkFrameOrder` and `runPlanSteps` (treat a missing planner like a missing pass), and it is the difference between one table and one table per composition.

5. **Intra-roster order carries cross-Layer constraints nothing checks.** `local-bubble` must directly follow `milky-way` (the dust multiply ran inside `milky-way`'s draw); `milky-way-upsample` must precede `milky-way`; `constellations` must be the last row the lens samples; `structure-markers-near` blends OVER so its position decides what it covers. Each is a constraint between two Layers' passes, stated only in prose above a list. The ADR accepted this ("a step inserted in the wrong position remains a reviewable mistake"), but these are now inter-Layer dependencies, which the Layer rules say may not exist (`src/layers/README.md`: a Layer never imports another) and which the `layer-dependency-dag` backlog item is waiting to see a second instance of. The table already holds four.

6. **Scope is declared twice.** A compute or planner declares `scope: 'once' | 'perView'`, and the section it is listed in has a scope, and the check rejects a mismatch. A Layer author has to know which section core will put their row in before writing the row.

7. **Body rows are closed to Layers.** `BodyRowSource = 'lens' | 'insideAtmosphere'` and `SlabRow.source = 'foreground' | 'lens'` are closed unions; the `foreground` line's `bodyPasses` roster is entirely core passes. A Layer can contribute a body-metre slab row (blackHoles does, for the lens) but cannot draw an opaque body of its own into `foreground:0`. This is the frame-table face of the "bodies live in core" item in the audit.

8. **The timing slot is authored on the line, not the pass.** A Layer cannot name its own GPU-timing row; `slot: 'POST_LENSING'` style suffixes are core's to assign.

9. **The pick program re-derives half the table.** It takes the slab map from `FRAME_ORDER` but keeps its own slab order, its own depth formats and ignores `depth`, `slot` and captures (`pickProgram.ts:80-81, 296-327`).

## 5. Options

**A. Keep the table, close the holes.** Add a format cross-check (a pass exposes its pipeline's `{ color, depth }` formats, the check compares them with the line's target row), install `onuncapturederror` in dev, check capture-roster names against the contributed set, make plan rows drop like passes, and forbid Layer passes on swap lines until an `onSwapFormat` hook exists. Four small PRs, no contract change, no migration. Fixes items 1 to 4 and 9's worst half. Leaves 5 to 8.

**B. Core keeps the steps, Layers pin their passes to them.** The table shrinks to the ordered step list with stable ids and no Layer names:

```ts
// core: the ordering artifact, ~25 lines, no Layer names
{ id: 'scene.hdr.cosmo',  kind: 'render', target: 'hdr', slab: COSMO }
{ id: 'scene.hdr.near0',  kind: 'render', target: 'hdr', slab: NEAR0 }
{ id: 'scene.lens',       kind: 'render', target: 'hdr', slab: 'lens' }
```

```ts
// a Layer pass: where it draws, beside what it draws
{ name: 'local-bubble', step: 'scene.hdr.near0', after: ['milky-way'], fade: 'localBubble', ... }
```

Core still owns every cross-step constraint (dust after emission, NEAR0 over COSMO, tonemap last) as an explicit list, so ADR 0011's argument is untouched. Within one step, additive rosters are commutative and need no order; the handful of documented pairs become `after:` references checked at boot only when both passes are present, a sort inside a step and never across steps. Captures become `captures: ['sgrAStar', 'solarSystem']` on the pass. The prose rationale moves from the table to the pass file it explains. A Layer's own offscreen target comes with its own step declaration (`steps: [{ id: 'scene.zoa', target: 'zoa', slab: COSMO, before: 'scene.hdr.cosmo' }]`), so the four Layers that own targets stop needing core lines.

Costs: a new contract member or two on `ContentPass` and `Layer`; `after:` is a soft cross-Layer reference by name, which is the first explicit inter-Layer dependency and should be decided together with the dependency-DAG item rather than slipped in; the prose that today reads as one narrative gets distributed. The migration is behaviour-neutral per step: add ids to today's lines, let a pass optionally declare `step`, move Layers one at a time, delete the names from the table when none remain. `frameOrderBoot.test.ts` keeps guarding the whole way.

**C. A render graph.** Rejected by ADR 0011 for reasons that still apply, and not needed: the cross-step order is a 25-line list, and B keeps it that way.

**Recommendation.** A first, because items 1 and 3 are silent failures and each fix is a day. Then B, because the table's growth is in names and B removes names, and because item 5 shows the table already carries inter-Layer dependencies that the Layer rules forbid elsewhere; making them explicit `after:` edges is more honest than prose. B is the change that would have let `lightTime` ship without a core commit, and it is the shape the ADR's own words ("layers pin to `(target, slab)` as data") described.
