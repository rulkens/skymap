# Froxel aerial perspective — prep: the seven ground refactors

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Seven behaviour-preserving refactors that open the joints the froxel
aerial-perspective feature needs — painter order that puts the inside body
last, a draw entry that carries its own derivations, one per-frame derivation,
one shell-uniform builder, a render step kind that can name a per-frame slab, a
scattering integrand with one home, and a foreground depth texture something is
allowed to sample. **Nothing here renders a pixel differently.**

**Spec:** `docs/superpowers/specs/2026-09-14-atmosphere-froxel-aerial-perspective-design.md`
— this plan implements §3 (Ground preparation), preps 1–7, in spec order.

**Lands as:** **draft PR #702**, already open against `main` from
`worktree-atmosphere-froxel-aerial-perspective` with the spec commits on it. The
seven prep commits land on that same branch and #702 becomes the prep PR (Task 8
retitles it and rewrites its body). It must merge **before** the feature branch
starts (`docs/superpowers/plans/2026-09-14-atmosphere-froxel-aerial-perspective.md`,
a new branch off the resulting `main`). Nothing in this plan mentions froxels;
every task stands on its own as a simplification.

> **Citations.** Every path and line number below was read at **33f423f64**, the
> head of `worktree-atmosphere-froxel-aerial-perspective`, whose code content
> equals `main`'s **be13f9dc7** (the two commits on top are the spec itself).
> **Execute in THIS worktree, on that branch** — not a fresh one; #702 is already
> open against it. Task lanes that want isolation may still use their own
> `agent-*` worktrees and cherry-pick back. Re-run `git log --oneline -5 origin/main`
> before Task 1: if `main` has moved under the branch, rebase and translate any
> shifted line number the same mechanical way.

## Task dependency table

| #   | Task                                            | Depends on | Parallelizable with |
| --- | ----------------------------------------------- | ---------- | ------------------- |
| 1   | Painter-order tie-break inside `deriveSlabs`    | —          | 2, 5, 6, 7          |
| 2   | `AtmosphereDrawEntry` carries its derivations   | —          | 1, 5, 6, 7          |
| 3   | Memoise `atmosphereDrawList` per frame context  | 2          | 1, 5, 6, 7          |
| 4   | Extract `atmosphereShellUniforms`               | 2          | 1, 5, 6, 7          |
| 5   | Fold the `lens` step kind into `render`         | —          | 1, 2, 3, 4, 6, 7    |
| 6   | Extract the per-step scattering integrand       | —          | 1, 2, 3, 4, 5, 7    |
| 7   | Foreground depth gains `TEXTURE_BINDING`        | —          | 1, 2, 3, 4, 5, 6    |
| 8   | Suite, typecheck, visual attestation, PR        | 1–7        | —                   |

Four independent lanes: **{1}**, **{2 → 3 → 4}**, **{5}**, **{6}**, **{7}**.
Tasks 3 and 4 both edit files task 2 edits, so that lane is strictly serial;
everything else may run in its own worktree and be cherry-picked onto the
execution branch. PR commit order is 1…7.

## Global constraints

- **Behavioural no-op.** No task may change a rendered pixel, a dispatch, or a
  step count. Every existing assertion in a touched test file must stay green
  **unchanged** except where a step below says otherwise; if an assertion (not
  an import, fixture literal or comment) needs editing to pass, stop — the
  refactor drifted.
- **Frame files (`src/services/engine/frame/**`, incl. `passes/`) export exactly
  ONE symbol, the one they are named for; helpers go to `src/utils/`, constants
  to `src/data/` — `frameFilePurity.test.ts` ratchets this and its allow-list
  never grows.**
- `type` aliases, never `interface`; one symbol per file in `src/@types/` and
  `src/utils/`; deep relative imports, no barrels.
- Comments explain WHY only: module header ≤ 10 lines, comment lines ≤ half the
  code lines in the file. Timeless — no "this used to clamp", no "prep 1 moved".
- **Testing** (`docs/superpowers/conventions/testing.md`): only the tests named
  per task. No constant/registry restatements, no mirrors, no type-shape tests.
- File moves/renames go through the refactor CLI, never `git mv` plus
  hand-edited imports: `npm run refactor -- move <from> <to>`,
  `npm run refactor -- rename <file> <old> <new>` (`.claude/skills/refactor/SKILL.md`).
- `npm run typecheck:fast` is unavailable in worktrees (tsgo is not installed
  there) — use `npx tsc --noEmit -p tsconfig.json` and `-p tsconfig.tools.json`,
  or `npm run typecheck`.
- Stage specific paths on commit; never `git add -A`. No `Co-Authored-By`
  trailer on any commit in this plan.
- **At every commit step, report the task's line-diff breakdown**: code /
  comment / test / doc lines added+removed, as four numbers.

---

### Task 1: Painter-order tie-break inside `deriveSlabs`

> **Frame-file purity, every task:** Frame files (`src/services/engine/frame/**`, incl. `passes/`) export exactly ONE symbol, the one they are named for; helpers go to `src/utils/`, constants to `src/data/` — `frameFilePurity.test.ts` ratchets this and its allow-list never grows.

**Files:**

- Modify: `src/services/engine/frame/slabs.ts:128-146` (the `bodySlabRow`
  return type), `:219-224` (the `distanceRangeM` derivation), `:243-252` (the
  returned object), `:307-320` (the body-row sort in `deriveSlabs`), `:338-346`
  (the `foregroundChainOrder` contract comment)
- Modify: `tests/services/engine/frame/slabs.test.ts`

**Why:** `deriveSlabs`'s body-row sort keys on `slab.distanceRangeM[0]`, which
is `Math.max(dM - rMaxM, 0)` (`slabs.ts:224`). Every body the camera is inside
clamps to 0, ties with every other such row, and the stable sort then preserves
input order — so "the body the camera is inside is the last foreground row" is
an accident of `visibleBodies` ordering today. The feature's depth read (spec
§4.1) rests on that row being last.

**Interfaces:**

- `bodySlabRow` returns one more row-local field beside `slab` and `chainRow`:

```ts
readonly signedNearM: number; // dM − rMaxM, UNCLAMPED (negative inside the drawn radius)
```

  Not a `Slab` field and not a `ChainRow` field: `distanceRangeM` keeps its
  clamped meaning for the §7.2 overlap warn and the pick path, which read it as
  a bracket, not as an ordering key.

- `deriveSlabs`'s sort becomes primary `slab.distanceRangeM[0]` descending (as
  today), secondary `signedNearM` descending. Descending on a signed near
  distance puts the body the camera is DEEPEST inside last — nearest, drawn
  last.
- `foregroundChainOrder` is **unchanged** and must stay that way.

- [x] **Step 1: Write the failing test** in
      `tests/services/engine/frame/slabs.test.ts`, named `the body the camera is
      inside is the last foreground chain row`. Build two planets via the file's
      `makePlanet` helper whose clamped near distance both land at 0 — e.g.
      `radiusM: 1e7` posed at `eyeRelBodyM: [1e4, 0, 0]` (deeply inside) and
      `radiusM: 1.1e6` posed at `[1e6, 0, 0]` (barely inside) — and pass them to
      `deriveSlabs` in the order that makes the PRE-prep stable sort put the
      deeply-inside body first. Assert on
      `foregroundChainOrder(deriveSlabs(baseInput({ pose, visibleBodies })))`:
      the LAST index maps (through the returned `slabs`) to the deeply-inside
      body's `frame.bodyId`. Assert the chain's length is 3 (NEAR0 + two rows)
      so a dropped row cannot pass the tail check.
      The carry-through is half of what this task guarantees, which is why the
      assertion is on `foregroundChainOrder`'s output and not on `deriveSlabs`
      alone: `foregroundChainOrder` re-sorts on `nearestM`, both rows tie at 0
      there, and ES2019 stable sort is what preserves the order `deriveSlabs`
      established.

- [x] **Step 2: Run it and watch it fail.**
      `npx vitest run tests/services/engine/frame/slabs.test.ts`
      Expected: FAIL — the deeply-inside body comes back at chain position 1.

- [x] **Step 3: Return `signedNearM` from `bodySlabRow`** — the unclamped value
      is already in scope at `:224` where `distanceRangeM` clamps it. Widen the
      return type per Interfaces; no other field changes.

- [x] **Step 4: Add the secondary key** to the sort at `:319`. One comparator,
      two keys, no new helper (this file's `ALLOWED` purity row stays 18).
      Comment it with the fact a reader cannot see: every row the camera is
      inside ties at 0 on the primary key, so the unclamped signed distance is
      what orders them.

- [x] **Step 5: Write the carry-through contract** at `foregroundChainOrder`
      (`:338-340`, extending the existing comment by at most two lines): it
      receives `ctx.slabs` in index order, index equals painter ordinal, and its
      sort is stable — so rows tied at 0 keep the order `deriveSlabs`
      established. Re-sorting or reordering its input discards the tie-break
      silently.

- [x] **Step 6: Verify.**
      `npx vitest run tests/services/engine/frame tests/services/engine/camera`
      → green, every pre-existing assertion unedited. Then `npx tsc --noEmit`.

- [x] **Step 7: Commit** (stage the listed paths only), with the line-diff
      breakdown in the report.

```
refactor(frame): tie-break body-row painter order on the unclamped near distance

Every body the camera is inside clamps to a near distance of 0, so their
relative painter order was input order, not distance.
```

---

### Task 2: `AtmosphereDrawEntry` carries its own derivations

> **Frame-file purity, every task:** Frame files (`src/services/engine/frame/**`, incl. `passes/`) export exactly ONE symbol, the one they are named for; helpers go to `src/utils/`, constants to `src/data/` — `frameFilePurity.test.ts` ratchets this and its allow-list never grows.

**Files:**

- Modify: `src/@types/engine/frame/AtmosphereDrawEntry.d.ts:29-36` (four added
  fields; header trimmed to ≤ 10 lines)
- Modify: `src/services/engine/frame/atmosphereDrawList.ts` (derive them; skip a
  null-pose body)
- Modify: `src/services/engine/frame/passes/atmosphereShellPass.ts:92-141`
  (read them; delete the null-pose guard and the duplicate derivations)
- Modify: `src/services/engine/frame/encodeAtmosphereSkyView.ts:81-101` (same)
- Modify: `tests/services/engine/frame/atmosphereDrawList.test.ts`
- Modify: `tests/services/engine/frame/encodeAtmosphereSkyView.test.ts` (fixture
  `ctx` only, if it stubs no `bodyPose`)

**Why:** `atmosphereShellPass.draw:107-141` and `encodeAtmosphereSkyView:92-101`
derive `atmosphereTopM`, `camLocal` and `sunLocal` from the same pose, twice,
and each guards `ctx.bodyPose(...) === null` separately. The froxel bake and the
apply pass would make it four copies of a derivation whose whole job is that the
consumers cannot disagree.

**Interfaces:**

```ts
// src/@types/engine/frame/AtmosphereDrawEntry.d.ts — added fields
/** Atmosphere-top radius in METRES (params.atmosphereTopKm × KM_TO_M). */
readonly atmosphereTopM: number;
/** Camera in body-local ATMOSPHERE-TOP-RADIUS units (bodySlabCamLocal). */
readonly camLocal: Vec3;
/** Sun direction in the body's local frame (sunDirLocal, unit). */
readonly sunLocal: Vec3;
/** Camera inside the shell's handoff ratio (isInsideAtmosphereShell(camLocal)). */
readonly inside: boolean;
```

- `atmosphereDrawList(state, ctx)` keeps its signature. It now reads
  `ctx.bodyPose(body.id as BodyId)` per candidate and **skips a body whose pose
  is null** — which is what deletes the guard in both existing consumers.
  `positionMpc`/`orientation` keep coming from `sceneBodyStates`.
- `atmosphereShellPass.draw` still calls `ctx.bodyPose(bodyId)` for
  `pose.eyeRelBodyM` (the MVP compose needs it and it is not on the entry); the
  three derived values and the `inside` flag come off the entry.
- `encodeAtmosphereSkyView` stops calling `ctx.bodyPose` and
  `bodySlabCamLocal`/`sunDirLocal` entirely; it reads `camLocal`, `sunLocal` and
  `params.atmosphereTopKm` off the entry and keeps its own `viewHeightKm` /
  `sunZenithCos` arithmetic (that packing is the `SkyViewParams` contract, not a
  shared derivation).

- [x] **Step 1: Write the failing tests** in
      `tests/services/engine/frame/atmosphereDrawList.test.ts`:
      - `entries carry inside=true when the camera is within the handoff ratio` —
        the existing `camRadiiOut(SEEDED_EARTH, 0.5)` case, extended to assert
        `list[0]!.inside === true`, plus a second pose well outside the top
        asserting `false`. Hand-computed from `INSIDE_PATH_ENTER_RATIO`, not from
        `isInsideAtmosphereShell` re-applied in the test (that would be a mirror).
      - `a body with no pose is absent from the list` — `bodyPose` stubbed to
        `() => null`, asserting `[]` for an otherwise-passing Earth.
      The file's `makeCtx` helper (`:91-98`) gains a `bodyPose` stub returning a
      fixed `{ eyeRelBodyM, basisM }` derived from the requested camera offset;
      every existing case keeps its current assertions.

- [x] **Step 2: Run them and watch them fail.**
      `npx vitest run tests/services/engine/frame/atmosphereDrawList.test.ts`
      Expected: FAIL — `inside` does not exist; the null-pose case returns one entry.

- [x] **Step 3: Widen the type** (four fields, with the units comments above)
      and trim the `.d.ts` header to ≤ 10 lines — its current 20-line essay
      restates what the fields now say.

- [x] **Step 4: Derive in `atmosphereDrawList`.** One `ctx.bodyPose` read per
      candidate, `continue` on null, the four fields on both push sites (the
      zero-distance branch at `:50-58` and the sub-pixel branch at `:65-71`).
      Hoist the entry construction so the two branches cannot drift — but keep
      the file at ONE declaration (purity ratchet): the shared construction is an
      inline object literal built before the branch, not a local helper function.

- [x] **Step 5: Delete the duplicates** in `atmosphereShellPass.draw` (the
      `atmosphereTopM` at `:107`, `sunDirLocal` at `:116`, `bodySlabCamLocal` at
      `:120`, `isInsideAtmosphereShell` at `:141`, and their now-unused imports)
      and in `encodeAtmosphereSkyView` (`:90-96` plus the `bodySlabCamLocal` /
      `sunDirLocal` / `BodyId` imports and the null-pose guard). Rewrite the
      three comment blocks the deletions falsify — each should now say the fact
      that survives: the entry is the one resolved pairing both read.

- [x] **Step 6: Verify.**
      `npx vitest run tests/services/engine/frame` → green; then `npx tsc --noEmit`.

- [x] **Step 7: Commit** + line-diff breakdown.

```
refactor(atmosphere): derive the draw entry's pose-dependent fields once

The shell draw and the sky-view bake derived atmosphereTopM, camLocal and
sunLocal from the same pose independently; the entry now carries them.
```

---

### Task 3: Memoise `atmosphereDrawList` per frame context

> **Frame-file purity, every task:** Frame files (`src/services/engine/frame/**`, incl. `passes/`) export exactly ONE symbol, the one they are named for; helpers go to `src/utils/`, constants to `src/data/` — `frameFilePurity.test.ts` ratchets this and its allow-list never grows.

**Depends on Task 2** (same file; kept as a separate diff so the derivation
change and the caching change are reviewable apart).

**Files:**

- Create: `src/services/engine/frame/atmosphereDrawListCache.ts`
- Modify: `src/services/engine/frame/atmosphereDrawList.ts`
- Modify: `tests/services/engine/frame/atmosphereDrawList.test.ts`

**Why:** the list is recomputed on every call — `atmosphereShellPass.enabled`,
`atmosphereShellPass.draw` and `encodeAtmosphereSkyView` today, five callers
once the feature lands — each taking a fresh `sceneBodyStates` snapshot, and
Task 2 raised the per-call cost. The module header already calls it "the ONE
per-frame derivation" while the code recomputes it per caller.

**Interfaces:**

```ts
// src/services/engine/frame/atmosphereDrawListCache.ts
export const atmosphereDrawListCache: WeakMap<ReadyFrameContext, readonly AtmosphereDrawEntry[]>;
```

The `WeakMap<ReadyFrameContext, T>` pattern is `cosmoLabelProjection.ts:14`.
`ctx` is the per-frame object and the ONLY key; `state` is a live getter and is
NOT part of the key.

**Why the cache is its own file:** a module-scope `const` inside
`atmosphereDrawList.ts` is a second declaration in a frame file, which
`frameFilePurity.test.ts` scores exactly (`toBe(budget)`, `ALLOWED` rows only go
down — `cosmoLabelProjection`'s row 1 is exactly this debt). One file, one
symbol, filename = symbol, no allow-list row. Spec §9's "unchanged allow-list"
holds because of this split.

- [x] **Step 1: Write the failing test** in
      `tests/services/engine/frame/atmosphereDrawList.test.ts`:
      `a second ctx re-derives the list` — call with `ctxA`, then with a `ctxB`
      built at a DIFFERENT camera position that lands the body outside the
      sub-pixel cull, and assert the second call returns `[]`. This is the memo
      bug that matters: a key that outlives the frame serves a stale body
      position to the bake. Add a same-ctx identity assertion in the same test
      (`atmosphereDrawList(state, ctxA) === atmosphereDrawList(state, ctxA)`) —
      it is the property the four consumers rely on, and it fails loudly if the
      cache is keyed on something per-call.

- [x] **Step 2: Run it and watch it fail.**
      `npx vitest run tests/services/engine/frame/atmosphereDrawList.test.ts`
      Expected: FAIL on the identity assertion (two fresh arrays today).

- [x] **Step 3: Create the cache file** and read/populate it at the top and
      bottom of `atmosphereDrawList`. The early `FOREGROUND_MAX_DISTANCE_MPC`
      return caches too — an empty list is a per-frame answer like any other.

- [x] **Step 4: Rewrite the module header** (≤ 10 lines): one derivation per
      frame context, every consumer reads that one list, and the key is `ctx`
      because `state` is a live getter.

- [x] **Step 5: Verify.** `npx vitest run tests/services/engine/frame` (the
      purity test included — it must stay green with NO new `ALLOWED` row), then
      `npx tsc --noEmit`.

- [x] **Step 6: Commit** + line-diff breakdown.

```
perf(atmosphere): memoise the atmosphere draw list per frame context

Three callers today and five once aerial perspective lands re-derived the
same list, each taking its own sceneBodyStates snapshot.
```

---

### Task 4: Extract `atmosphereShellUniforms`

> **Frame-file purity, every task:** Frame files (`src/services/engine/frame/**`, incl. `passes/`) export exactly ONE symbol, the one they are named for; helpers go to `src/utils/`, constants to `src/data/` — `frameFilePurity.test.ts` ratchets this and its allow-list never grows.

**Depends on Task 2** (reads the entry's derived fields).

**Files:**

- Create: `src/services/engine/frame/atmosphereShellUniforms.ts`
- Modify: `src/services/engine/frame/passes/atmosphereShellPass.ts:92-157`
- Modify: `tests/services/engine/frame/frameFilePurity.test.ts` — **only if**
  the new file scores a stray (it must not; verify rather than edit)

**Why:** `atmosphereShellPass.draw` composes mvp, invMvp, sun, camLocal,
bottomRadius, exposure and the ring ratios into `packAtmosphereUniforms`. The
froxel bake and the apply pass need the byte-identical record, and "identical"
is the whole correctness argument (spec §4.4). Three copies of a
byte-layout-critical build is the drift the packer exists to prevent,
re-introduced one level up.

**Interfaces:**

```ts
// src/services/engine/frame/atmosphereShellUniforms.ts — the file's ONE export
export function atmosphereShellUniforms(
  entry: AtmosphereDrawEntry,
  slab: Slab,
  ctx: ReadyFrameContext,
  state: PassState,
): Float32Array;
```

- Returns the 176-byte / 44-f32 `AtmosphereUniforms` record
  (`packAtmosphereUniforms`), built from `slab.vp` + `ctx.bodyPose(entry.body.id)`
  for the MVP pair and from the entry for everything else.
- `ctx.bodyPose` returning `null` is a **programming error** here — Task 2 makes
  a null pose skip the entry — so it throws with that invariant in the message,
  the `bundleFor` idiom (`atmosphereShellRenderer.ts:602-608`).
- `state` is read for exactly one thing: Earth's live
  `settings.earth.atmosphereExposure` override. That branch moves with the
  builder; it does not stay duplicated in the pass.
- The ring-ratio lookup (`SCENE_RINGS`) moves with it.

- [x] **Step 1: Extract with the refactor CLI**, not by hand:
      `npm run refactor -- extract src/services/engine/frame/passes/atmosphereShellPass.ts <symbol> src/services/engine/frame/atmosphereShellUniforms.ts`
      if the CLI can lift the block; otherwise create the file and move the
      lines, then `npm run refactor -- refs atmosphereShellUniforms` to confirm
      the single call site. No test is added: this is a pure move, and a test
      that re-derives the same 44 floats would be a mirror
      (`docs/superpowers/conventions/testing.md`). Its correctness is carried by
      the existing `tests/utils/gpu/atmosphereUniformsLayout.parity.test.ts` and
      by Task 8's visual attestation.

- [x] **Step 2: Point the pass at it.** `atmosphereShellPass.draw` becomes: find
      the entry, call `atmosphereShellUniforms(entry, view.slab, ctx, state)`,
      call `renderer.draw(pass, entry.body.id, uniforms, entry.inside)`. The
      `mat4d`, `composeBodySlabMvp`, `packAtmosphereUniforms`, `narrowMat4`,
      `SCENE_RINGS`, `RENDER_ORIGIN_MPC`, `SCALE_UNITS` imports leave the pass
      file with the code that used them.

- [x] **Step 3: Split the comments with the code.** The derivation notes (the
      f64 invert, the atmosphere-top unit convention, the exposure branch, the
      ring ratios) travel to the new file's ≤ 10-line header and its inline
      comments; the pass header keeps only what it still explains (the pass's
      position in `bodyPasses`, the two-draw multiply-then-add, the f64 seam).

- [x] **Step 4: Verify.**
      `npx vitest run tests/services/engine/frame tests/utils/gpu` → green
      (`frameFilePurity` must pass with no new `ALLOWED` row: the new file
      declares one symbol), then `npx tsc --noEmit`.

- [x] **Step 5: Commit** + line-diff breakdown.

```
refactor(atmosphere): extract atmosphereShellUniforms into its own frame file

The record is a byte layout with more than one consumer coming; building it
inside the draw would put a copy at each.
```

---

### Task 5: Fold the `lens` step kind into `render`

> **Frame-file purity, every task:** Frame files (`src/services/engine/frame/**`, incl. `passes/`) export exactly ONE symbol, the one they are named for; helpers go to `src/utils/`, constants to `src/data/` — `frameFilePurity.test.ts` ratchets this and its allow-list never grows.

**Files:**

- Create: `src/@types/engine/frame/BodyRowSource.d.ts`
- Delete: `src/@types/engine/frame/LensStepSpec.d.ts`
- Modify: `src/@types/engine/frame/RenderStepSpec.d.ts:5-17`,
  `src/@types/engine/frame/FrameStepSpec.d.ts:8,15,24`,
  `src/@types/engine/frame/FrameStep.d.ts:17-46`
- Modify: `src/services/engine/frame/expandFrameOrder.ts:17-23,52-98,105-119`
- Modify: `src/services/engine/frame/checkFrameOrder.ts:24-43`
- Modify: `src/services/engine/frame/executeFrame.ts:142-182,260-278,332-407`
- Modify: `src/services/engine/frame/frameOrder.ts:129-136`
- Modify: `src/services/engine/frame/renderFrame.ts:203-222`
- Modify: `src/services/engine/frame/timing/maxFrameInputs.ts:14-23`
- Modify: `tests/services/engine/frame/expandFrameOrder.test.ts`,
  `tests/services/engine/frame/checkFrameOrder.test.ts`,
  `tests/services/engine/frame/frameOrderBoot.test.ts`,
  `tests/services/engine/frame/executeFrame.test.ts:596-615`,
  `tests/services/engine/frame/timing/{timedSlots,timedSlotsOf,timedSlotGroupsOf}.test.ts`

**Why:** `lens` exists only because a render line could not name a slab resolved
per frame. `insideAtmosphere` wants exactly that, and a second bespoke kind
would confirm the special case rather than remove it.

**Interfaces:**

```ts
// src/@types/engine/frame/BodyRowSource.d.ts — the file's ONE type
export type BodyRowSource = 'lens' | 'insideAtmosphere';

// RenderStepSpec — widened
readonly slab: number | BodyRowSource;
readonly depth?: 'clear' | 'load' | 'sample';

// FrameStep, render arm — `depthLoad` RENAMED and widened; `slab` stays a number
readonly depth?: 'clear' | 'load' | 'sample';

// FrameInputs (expandFrameOrder.ts) — replaces `lensBodySlabs`
readonly bodyRowSlabs: Record<BodyRowSource, readonly number[]>;
```

- `EXPAND_STEP.render` expands a `BodyRowSource` slab to **one step per entry**
  in `frame.bodyRowSlabs[spec.slab]`, so an empty list emits nothing — the lens's
  zero-emission property, now a property of `render`. A numeric slab expands to
  one step, as today. `depth` and `slot` ride through both shapes.
- `EXPAND_STEP.lens` and `STEP_FACTS.lens` are deleted; `FrameStepSpec` drops the
  `LensStepSpec` member. `checkFrameOrder`'s `render` row already covers the
  folded line.
- `sameGroup` compares `a.depth === b.depth` (a merge across a depth clear would
  drop a clear; across `'sample'` it would attach a depth the step must not have).
- `FRAME_ORDER`'s lens line becomes:

```ts
{ kind: 'render', target: 'hdr', slab: 'lens', passes: ['sgr-a-star-lensing'] },
```

- `executeFrame` gains ONE fact and no new declaration:

```ts
function depthLoadOpFor(depth: 'clear' | 'load' | 'sample' | undefined, touched: boolean): GPULoadOp;
// 'clear' | 'load' pass through; 'sample' and undefined fall to the first-touch rule.
function depthAttachment(
  ctx: ReadyFrameContext,
  target: string,
  depth: 'clear' | 'load' | 'sample' | undefined,
  depthLoadOp: GPULoadOp,
  reversedZ: boolean,
): { depthStencilAttachment?: GPURenderPassDepthStencilAttachment };
// returns {} for a depthless row AS TODAY, and for depth: 'sample'.
```

  `renderGroup`'s parameter bag carries `depth` alongside `depthLoadOp`.
  **Contract only — no consumer emits `'sample'` in this PR.** WebGPU forbids
  sampling a view attached to the same pass; `'sample'` is how a step says it
  binds the row's depth as a texture instead of attaching it.

- `renderFrame` fills both lists in the one place that already resolves
  `sgrAStarBodySlab` (`:159-222`):

```ts
bodyRowSlabs: {
  lens: sgrAStarBodySlab === null ? [] : [sgrAStarBodySlab],
  insideAtmosphere: [],
},
```

- `MAX_FRAME_INPUTS` mirrors the shape: `lens` keeps every capacity row, and
  `insideAtmosphere` is `[]` for now (the feature plan fills it — an unallocated
  timing slot is a missing DebugPanel row, so this is the file that must follow).

- [x] **Step 1: Write the failing tests** in
      `tests/services/engine/frame/expandFrameOrder.test.ts`:
      - `a render line with a BodyRowSource slab expands once per resolved row` —
        a hand-built two-line order with `slab: 'lens'` and
        `bodyRowSlabs.lens: [3, 2]`, asserting two render steps with
        `slab === 3` then `slab === 2`, in that order.
      - `a render line with an empty BodyRowSource list emits no step` — the same
        order with `[]`, asserting no step carries that target.
      The existing lens cases (`:222-238`) stay, with their `FrameInputs`
      literals rewritten to the new shape — assertions untouched.

- [x] **Step 2: Run them and watch them fail.**
      `npx vitest run tests/services/engine/frame/expandFrameOrder.test.ts`
      Expected: FAIL — `bodyRowSlabs` is not a `FrameInputs` field.

- [x] **Step 3: Add the type, delete `LensStepSpec`.** Create
      `BodyRowSource.d.ts`; then
      `npm run refactor -- delete src/@types/engine/frame/LensStepSpec.d.ts`
      (or `npm run move-files` if the CLI's delete does not rewrite the
      `FrameStepSpec` import) — never a hand-edited import sweep.

- [x] **Step 4: Rename `depthLoad` → `depth`** across the type and its readers:
      `npm run refactor -- rename src/@types/engine/frame/FrameStep.d.ts depthLoad depth`,
      then widen it to include `'sample'`. Verify the rename reached
      `expandFrameOrder.ts:85,117`, `executeFrame.ts:277` and the two tests.

- [x] **Step 5: Fold the expansion.** `EXPAND_STEP.render` handles both slab
      shapes, `EXPAND_STEP.lens` and `STEP_FACTS.lens` go, `sameGroup` keys on
      `depth`. The module headers of `expandFrameOrder.ts` (`:1-7`) and
      `FrameStepSpec.d.ts` (`:6-7`) both name three expanding kinds — rewrite to
      two (`capture`, `foreground`) plus "a `render` line whose `slab` names a
      per-frame list". `expandFrameOrder`'s `ALLOWED` purity row stays 6 and
      `executeFrame`'s stays 7: no declaration is added or removed in either.

- [x] **Step 6: Thread `'sample'` through `executeFrame`** per the Interfaces
      block, and rewrite the `depthLoadOpFor` / `depthAttachment` doc comments to
      state the three-way fact rather than the two-way one.

- [x] **Step 7: Update the callers** — `frameOrder.ts`'s lens line (its
      surrounding rationale comment stays; only the kind changes),
      `renderFrame.ts`, `maxFrameInputs.ts`, and the `FrameInputs` literals in
      the four timing tests.

- [x] **Step 8: Verify.**
      `npx vitest run tests/services/engine/frame` → green, including
      `frameOrderBoot` (the real order still passes the boot check) and the
      timing suite (slot names byte-identical: the lens step's group key is
      still `hdr·BODY[k]`), then `npx tsc --noEmit`.

- [x] **Step 9: Commit** + line-diff breakdown.

```
refactor(frame): fold the lens step kind into render

A render line can now name a per-frame slab list, so the one kind that
existed for that timing is gone rather than joined by a second.
```

---

### Task 6: Extract the per-step scattering integrand

> **Frame-file purity, every task:** Frame files (`src/services/engine/frame/**`, incl. `passes/`) export exactly ONE symbol, the one they are named for; helpers go to `src/utils/`, constants to `src/data/` — `frameFilePurity.test.ts` ratchets this and its allow-list never grows.

**Files:**

- Modify: `src/services/gpu/shaders/atmosphere/scattering.wesl` (new struct +
  function at the end of the sampling section)
- Modify: `src/services/gpu/shaders/atmosphere/skyViewLut.wesl:93-172`

**Why:** the froxel bake integrates the same physical quantity as the sky-view
LUT. Two marches would be two sources of truth for one integral, agreeing only
by inspection (spec §4.6); the handoff at 1.005 is argued from their being the
same integrand on the same ray.

**Invoke the `wesl-shaders` skill before editing either file.** It carries the
linker constraints this task must not trip: **no backticks in WESL comments**
(single quotes for inline code), `package::` imports are the literal token and
live at the TOP of the file, **one identifier per import line** (no brace
lists), `textureSampleLevel` never `textureSample` in non-uniform control flow,
and every pipeline is built through `createShaderModuleWithDevLog` (unchanged
here — no pipeline changes in this task).

**Interfaces:**

```wgsl
// scattering.wesl — the per-step result, and the step itself.
struct ScatterStep {
  // The step's source integral '(S - S*T)/extinction', BEFORE the running
  // throughput is applied. The caller accumulates 'L += throughput * inScatter'.
  inScatter: vec3<f32>,
  // This step's own transmittance 'exp(-extinction * dt)'. The caller
  // accumulates 'throughput *= transmittance'.
  transmittance: vec3<f32>,
};

fn scatterStep(
  params: ScatteringParams,
  transmittanceLut: texture_2d<f32>,
  multiScatterLut: texture_2d<f32>,
  lutSamp: sampler,
  pos: vec3<f32>,          // sample position, km, planet centre at the origin
  sunDir: vec3<f32>,       // unit, same frame as 'pos'
  cosTheta: f32,           // dot(viewDir, sunDir) — the phase argument
  dt: f32,                 // step length, km
  twilightSoftness: f32,
  twilightIntensity: f32,
) -> ScatterStep
```

`dir` is NOT a parameter: the loop body uses the view direction only through
`cosTheta` (`skyViewLut.wesl:124,138`). Textures and samplers as function
parameters are the module's existing idiom (`sampleTransmittanceToTop`,
`sampleMultiScatter`).

- [x] **Step 1: Move the loop body verbatim.** `skyViewLut.wesl:138-166` becomes
      `scatterStep`'s body — medium sample, sample transmittance, sun
      transmittance, multi-scatter, the twilight fade and gain, the analytic
      `(s - s*T)/extinction` step. `EXTINCTION_EPS` is already local to
      `scattering.wesl`, so the import at `skyViewLut.wesl:52` may become unused —
      delete it if so. No arithmetic changes, no reordering: this must be
      **pixel-identical by construction**, and any expression rewrite forfeits
      that claim.

- [x] **Step 2: Call it from the march.** `raymarchInScatter`'s loop keeps
      `tNear`/`tFar`/`dt`, the position and the two accumulators, and becomes
      four lines: sample the step, `L += throughput * step.inScatter`,
      `throughput *= step.transmittance`, advance. `r`, `up` and `sunCosZenith`
      move into `scatterStep` with the body that used them.

- [x] **Step 3: Move the comments with the code.** The twilight derivation
      (`:146-163`) belongs to `scatterStep`; `raymarchInScatter` keeps the march
      bound and the from-space clamp. `scattering.wesl`'s header already states
      the unit-agnostic ratio property the froxel bake will rely on — leave it,
      and keep the file's comment budget from growing (it is a derivation file,
      already over the default budget by sanctioned exception).

- [x] **Step 4: Verify pixel-identity by eye, with the dev server.**
      `npm test` covers no shader; the gate here is the visual pass in Task 8
      plus this task's own check: with the dev server on this worktree's port,
      Earth from space at a terminator-crossing pose looks unchanged — no shift
      in limb colour, sunset arc or over-disc haze. If the shader fails to
      compile, read the LINKED output in the dev console
      (`createShaderModuleWithDevLog` prints it; line numbers refer to the
      linked WGSL, not the source `.wesl`).

- [x] **Step 5: Paired A/B on `npm run perf`.** Read `.claude/skills/perf/SKILL.md`
      first. Baseline the BASE commit and the extracted commit alternately
      (A-B-A-B across two dev servers, per the skill's paired-baseline recipe),
      `--scenario earth-surface --frames 30`, and **pass `--url http://localhost:<port>`
      from THIS worktree's own `npm run dev` `Local:` line** — omitting it
      silently measures whichever branch owns 5173. Interpretation traps to state
      in the report: quote MERGED medians only, never PER-LAYER rows (each carries
      1–3 ms of instrumented per-pass overhead — use the EST. PER-PASS FLOOR
      section for attribution), and on Apple Silicon MERGED slot-sums are ~3×
      inflated by concurrent TBDR execution (the tell is adjacent slots with
      identical medians), so per-slot numbers are ordinal, never additive.
      Expected: neutral — an inlined function call in one compute shader. A
      regression outside the ~0.5 ms run-to-run noise **halts this task** and is
      reported, not worked around.

- [x] **Step 6: Commit** + line-diff breakdown.

```
refactor(atmosphere): extract the per-step scattering integrand

The froxel bake integrates the same quantity as the sky-view march; one
function is what keeps them one integrand rather than two that agree.
```

---

### Task 7: Foreground depth gains `TEXTURE_BINDING`

> **Frame-file purity, every task:** Frame files (`src/services/engine/frame/**`, incl. `passes/`) export exactly ONE symbol, the one they are named for; helpers go to `src/utils/`, constants to `src/data/` — `frameFilePurity.test.ts` ratchets this and its allow-list never grows.

**Files:**

- Modify: `src/services/gpu/renderTargets.ts:415-432`

**Why:** the usage flag currently encodes "no consumer exists" as a permission.
The reason written beside it — each painter-chain row clears its own depth, so
the buffer only ever holds the LAST row's value — still holds for cross-row
occlusion and for the caption path, but it stops being a reason nothing may bind
the texture.

**Interfaces:** the depth texture's `usage` becomes
`GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING`. No
signature, no type, no test: a usage flag is a capability, and a test asserting
it back would be a constant restatement
(`docs/superpowers/conventions/testing.md`).

- [x] **Step 1: Add the flag** and rewrite the comment at `:421-427` to the fact
      that survives: the buffer holds the LAST painter-chain row's depth because
      each row clears its own, which is why the caption occlusion path reads the
      colour texture's alpha instead — and why a sampler of this texture can only
      ever be asking about that last row.

- [x] **Step 2: Verify.** `npx vitest run tests/services/gpu` → green; then
      `npx tsc --noEmit`. Confirm on the dev server that the scene still
      presents (a rejected texture descriptor is a boot-time device error, and
      on iOS a silently dropped frame).

- [x] **Step 3: Commit** + line-diff breakdown.

```
refactor(gpu): make the foreground:0 depth texture sampleable

RENDER_ATTACHMENT-only encoded "nothing samples this" as a permission; the
per-row depth clear is still the reason it holds only the last row.
```

---

### Task 8: Suite, typecheck, visual attestation, PR

> **Frame-file purity, every task:** Frame files (`src/services/engine/frame/**`, incl. `passes/`) export exactly ONE symbol, the one they are named for; helpers go to `src/utils/`, constants to `src/data/` — `frameFilePurity.test.ts` ratchets this and its allow-list never grows.

**Depends on Tasks 1–7.**

- [x] **Step 1: Whole suite.** `npm test` → green. 600+ files; a prep that
      breaks a distant test has drifted.
- [x] **Step 2: Typecheck.** `npm run typecheck` (both projects). **Not**
      `typecheck:fast` — tsgo is not installed in worktrees.
- [x] **Step 3: Comment audit.** Every file this PR touched, against the comment
      budget (`docs/superpowers/conventions/comments.md`): module header ≤ 10
      lines, comment lines ≤ half the code lines, nothing describing the diff.
      Four headers were rewritten by design (Tasks 2, 3, 5, 7) — check the rest.
- [x] **Step 4: Visual attestation — ASK THE USER TO LOOK.** Do not claim it.
      Dev server on this worktree's own port; the claim is
      **pixel-identical to `main`**, so name the three poses and ask for a
      same-pose comparison against a second dev server on `main`:
      1. **Earth from space**, terminator across the disc — blue limb, reddened
         sunset arc, over-disc haze unchanged (Tasks 2, 4, 6 all touch this path).
      2. **Inside the atmosphere**, camera on/near the surface looking down and
         then up — the full-screen inside path still draws, the washout is still
         there (it is the feature's job to fix, not this PR's).
      3. **Sgr A\* lensing band** — the lensed sky still draws, in the same place
         in the frame, with the unwarped body-glints on top of it (Task 5).
- [x] **Step 5: PR — #702 already exists.** The seven prep commits land on
      `worktree-atmosphere-froxel-aerial-perspective`, which already carries the
      spec commits and already has draft PR #702 open against `main`. Do NOT open
      a second PR: **#702 becomes the prep PR.** Retitle it
      `refactor(atmosphere): froxel ground preparation (spec + 7 prep refactors)`
      and rewrite its body — behaviour-preserving, the spec it carries and
      prepares, the seven commits, and that the feature plan starts on a new
      branch only after this merges. Mark it ready for review and squash-merge,
      per `docs/superpowers/conventions/sdd-execution.md` and the project's git
      conventions. **No `Co-Authored-By` trailer**, and the PR body ends with the
      standard generated-with line.
- [x] **Step 6: Relocate this plan and archive its ledger** in the final commit,
      before deleting the SDD workspace (sdd-execution Rule 3): copy
      `<workspace>/progress.md` to
      `docs/superpowers/plans/completed/2026-09-14-atmosphere-froxel-prep.ledger.md`,
      and move THIS plan to `docs/superpowers/plans/completed/` alongside it.
      The **spec stays in `specs/`** and the **feature plan stays in `plans/`** —
      both are live contracts until the feature PR ships, and the feature plan's
      `/feature-done` relocates them then.

---

## Definition of Done

**Deliverable inventory**

- `bodySlabRow` returns `signedNearM`; `deriveSlabs`'s body-row sort has two
  keys; `foregroundChainOrder` is byte-identical to its pre-PR self and carries
  the carry-through contract comment.
- `AtmosphereDrawEntry` carries `atmosphereTopM`, `camLocal`, `sunLocal`,
  `inside`; neither `atmosphereShellPass` nor `encodeAtmosphereSkyView` contains
  a null-pose guard or a second derivation of any of them.
- `src/services/engine/frame/atmosphereDrawListCache.ts` exists and is the only
  `WeakMap` in the atmosphere frame path; `frameFilePurity.test.ts`'s `ALLOWED`
  table is unchanged.
- `src/services/engine/frame/atmosphereShellUniforms.ts` is the only site
  calling `packAtmosphereUniforms` for the shell.
- `src/@types/engine/frame/LensStepSpec.d.ts` no longer exists; no source or
  test file mentions `lensBodySlabs`, `depthLoad`, or `kind: 'lens'`;
  `BodyRowSource` is the one type naming the two per-frame slab lists.
- `scattering.wesl` exports `scatterStep`; `skyViewLut.wesl` has no in-loop
  medium/transmittance/twilight arithmetic left.
- `foreground:0`'s depth texture declares `TEXTURE_BINDING`.
- **This plan relocates itself** to `docs/superpowers/plans/completed/` (with its
  ledger) in the PR's final commit, while **the spec stays in
  `docs/superpowers/specs/`** and the feature plan stays in
  `docs/superpowers/plans/` — both are still live contracts.
  `/feature-done`, which relocates the spec, runs at the END of the feature PR,
  not this one.

**Named observable behaviours** (the Task 8 attestation, user's eyes)

- Earth from space at a terminator pose: limb, sunset arc and over-disc haze
  pixel-identical to `main`.
- Camera inside the atmosphere: the inside path still draws, unchanged
  (including its down-view washout — fixing that is the feature).
- Sgr A\* lensing band: the lensed sky draws in the same frame position, with
  `body-glints` unwarped on top.
- A descent from space to the surface past several bodies: no flicker or
  re-ordering of which body occludes which.

**Deferral boundary**

- No froxel texture, bake, apply pass, shader or `FRAME_ORDER` line appears in
  this PR. If a task seems to need one, the refactor drifted.
- `depth: 'sample'` has **no consumer** here — it is a contract `executeFrame`
  honours and nothing emits.
- `MAX_FRAME_INPUTS.bodyRowSlabs.insideAtmosphere` stays `[]`; its timing slots
  are the feature plan's business.
- `mesh-bodies` keeps its position in `bodyPasses` and the #698 prose at
  `frameOrder.ts:168-181` and `atmosphereShellPass.ts:36-37` is **not** rewritten
  here — that prose is still true until the feature lands.
- The froxel-era question of whether `foregroundChainOrder` should own the
  painter sort outright (rather than inheriting `deriveSlabs`'s order) is not
  opened.
