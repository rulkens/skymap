# Camera frame ladder — ground preparation (P1–P5)

> **Spec.** [`specs/2026-09-14-camera-frame-ladder-site-rung.md`](../specs/2026-09-14-camera-frame-ladder-site-rung.md)
> — the binding authority. This plan implements **§2 (the ladder model)** and
> **§3 (Ground preparation P1–P5)** only. §4 (the site rung) is a second plan,
> written in parallel against the same §2 names; nothing here may change a
> signature §2 spells without saying so under **Deviations** below.
> **Execution.** `subagent-driven-development` per
> [`conventions/sdd-execution.md`](../conventions/sdd-execution.md) — task list
> before Task 1, pipelined reviews, ledger archived on Finish.
> **Style.** [`conventions/plan-style.md`](../conventions/plan-style.md) —
> contract code only. Every line range below was verified against the tree on
> 2026-09-14, but it is a pointer, not a snapshot: read the current file.

## Ground preparation

**This plan _is_ the ground preparation.** It lands as its own PR off `main`,
behaviour-preserving; the site rung's PR stacks on top of it. Spec §3 is its
authority and spec §5's consumers matrix is its completeness check — the
[Site coverage](#site-coverage) table below maps all 46 survey sites to a task.

## Strategy

The incumbent two-arm tag (`'absolute' | { body }`) is branched on at 46 sites.
Prep turns those branches into one table (`CAMERA_RUNGS`) plus a small
vocabulary — `rungKindOf`, `frameKey`, `sameFrame`, `isWorldArm`, `hostOf`,
`refoldTo` / `foldToWorld`, `stepRung`, `rowFor(…).step` / `.channels` — so the
feature PR adds a rung as a **row**, not as 46 edits.

The order is spec §3's, and it is forced by dependency:

1. **P1 — identity.** The cheapest, widest change: one grammar for "which frame
   is this", one for "is this the world arm". Every later P uses `frameKey` as a
   memory key and as the comparison.
2. **P2 — the table, `host`, and the fold.** Row and ctx types, the two
   incumbent rows populated for `host` / `toParent` / `fromParent`, and the
   generic readers. `resolveWorldArm` and the nine ad-hoc host derivations die.
3. **P3 — engage/release and `stepRung`.** `regimeArmFor` dies; the fold drives
   its conversions off the table.
4. **P4 — the `step` cell and the memory split.** `routeToSurface` dies; the
   gesture memory becomes rung-local and `frameKey`-keyed, while the tilt
   memory — read in the **world** arm — is split out and keyed by host.
5. **P5 — the `channels` cell.** The keyframe wire encoding moves onto the rows.

The row **type grows a cell per P** (`host` in P2, `engage`/`release` in P3,
`step` in P4, `channels` in P5), reaching §2.4's shape at the end of P5.
Declaring all five cells in P2 would force four stubs that the next three tasks
overwrite; the mapped type is the compiler gate either way.

## Global constraints

Binding on every task; do not restate them in commit messages.

- **Behaviour-preserving, and the golden traces are the proof.**
  `tests/fixtures/camera/driverGoldenTrace.json` and
  `tests/fixtures/camera/settleGoldenTrace.json` come out **byte-identical** at
  every task — `git status --porcelain tests/fixtures/camera/` is empty at every
  commit — and `tests/services/engine/frame/poseFold.test.ts` passes unmodified.
  A trace may be re-recorded (`DRIVER_GOLDEN_RECORD=1` /
  `SETTLE_GOLDEN_RECORD=1`) **only** with a parse-compared cell diff in the
  commit body naming every changed field and why prep is allowed to change it.
  If you reach for that, stop and report first — in prep the answer is almost
  always that the change is wrong.
- **Two rungs only.** `RungKind` is `'absolute' | 'body'` for the whole of this
  PR. The `{ site }` tag, `SitePose`, `siteEngageR` / `siteDisengageR` and
  `src/data/camera/siteRung.ts` belong to the feature PR. A prep task that adds
  a third kind is mis-scoped.
- **The focus rule is frozen.** P3 moves `regimeArmFor`'s focus test verbatim
  ("focus == the rung's id", `regimeArmFor.ts:33,39`). The focus-**subtree**
  rule (spec §4.8) is a feature commit; introducing it here changes behaviour.
- `tests/services/engine/camera/noStoredRegimeFlag.test.ts` passes with its
  **allow-list still empty**. It sweeps `src/state`,
  `src/services/engine/camera`, `src/services/camera` and `src/@types/camera`
  and flags any `boolean` / `true` / `false` declaration whose name matches
  `/surface|regime|engaged/i`. A `readonly engaged: boolean` or a
  `const surfaceActive = …` in those trees fails it; a string-keyed rung table
  passes by construction.
- `type` aliases, never `interface`. One exported **type** per file in
  `src/@types/`, one exported **function** per file in `src/utils/`. Files under
  `src/services/engine/camera/rungs/` export exactly the one symbol they are
  named for — the rule `frameFilePurity` enforces next door, applied by hand.
- **Frame-file purity.** `tests/services/engine/frame/frameFilePurity.test.ts`
  budgets `frame/projectFramePose` at **1** stray declaration (`NO_PAN`). Rows
  only go DOWN: no task raises it, and P3 moves the disengage normalization out
  of that file rather than inlining a second helper beside it.
- Tests per [`conventions/testing.md`](../conventions/testing.md). Specifically:
  **no** runtime tests of the new `.d.ts` shapes (mapped types are the
  compiler's job), **no** restatement of `CAMERA_RUNGS`' keys, **no** mirror
  tests. The structural tests this plan permits are the two incumbents
  (`noStoredRegimeFlag`, `oneMpcSeam`) and the one ratchet in Task 17.
- Comments per [`conventions/comments.md`](../conventions/comments.md): module
  header ≤ 10 lines, comment lines ≤ half the code lines. The headers being
  **moved** off dying files (`regimeArmFor`, `clipFrameChannels`,
  `resolveWorldArm`) carry real landmines — port the load-bearing lines onto the
  cell that inherits the behaviour, drop the rest, and never let one row file
  accumulate the union of four headers.
- **Every file move or rename goes through the refactor CLI**, never `git mv`
  plus hand-edited imports: `npm run move-files -- <from> <to>` (or
  `-- --manifest <moves.json>` for a batch; `--dry` first). It rewrites every
  relative import project-wide and drags the `tests/` mirror along.
  `npm run refactor -- move <from> <to>` is the canonical spelling; see
  `.claude/skills/refactor/SKILL.md`.
- `npm run typecheck:fast` is the inner loop; `npm run typecheck` (tsc) is the
  gate — treat a `:fast`-only failure as a tsgo bug and confirm against tsc.
- No renderer, shader, `.wesl`, slab, layer or tile-planner file is touched. The
  `view.slab.frame.bodyId` reads throughout `src/services/engine/frame/passes/`
  are a **different `frame`** (the slab's, not the pose's) and are out of scope
  everywhere — the Task 17 ratchet included.

## Four corrections, now carried by the spec

Four places where §2/§3 **as first drafted** could not be implemented
behaviour-preservingly, or at all. The spec's 2026-09-14 amendment adopted every
one of them, so these are no longer deviations — the signatures below **are** the
spec's, and the parallel site-rung plan consumes them. They stay here because the
reasoning is the landmine, and an implementer who "fixes" one of these back
reintroduces the bug named in it.

### D1 — `RungCtx` is split by reader

§2.4 bundles geometry (`bodies`, `poseBasis`, `upBasis`) with gesture-time facts
(`focusBodyId`, `pivot`, `viewportPx`, `fovYRad`, `tuning`). Four sites resolve a
world arm or a host **outside** the input path and hold none of the second group:
`liveWorldPose.ts:15`, `watchFlyToLonLatSaga.ts:47`, `clipFrameChannels.ts:62`
and `frameContext.ts:146`. Fabricating a zero viewport and a default tuning there
is the stub-the-root-cell shape §2.2 rejects.

**Resolution.** One extra type; `RungCtx` keeps §2.4's field set exactly.

```ts
// src/@types/camera/RungBasisCtx.d.ts
export type RungBasisCtx = {
  readonly bodies: ReadonlyMap<BodyId, BodyState>;
  readonly poseBasis: Readonly<Mat3>;
  readonly upBasis: Readonly<Mat3>;
};

// src/@types/camera/RungCtx.d.ts
export type RungCtx = RungBasisCtx & {
  readonly focusBodyId: BodyId | null;
  readonly pivot: PivotFraming;
  readonly viewportPx: Readonly<Vec2>;
  readonly fovYRad: number;
  readonly tuning: CameraTuning;
};
```

`host`, `toParent`, `fromParent`, `channels` and the free functions `hostOf`,
`hostOrThrow`, `refoldTo`, `foldToWorld` declare `ctx: RungBasisCtx`; `engage`,
`release`, `step` and `stepRung` declare `ctx: RungCtx`. Every §2 signature still
accepts a `RungCtx` unchanged, so no feature-plan call site moves.

### D2 — the body arm's **disengage** is not `toParent`

§3-P3 says `projectFramePose.ts:127-152` becomes a `toParent` call. It cannot:
that block does not produce `toWorldArm`'s pose. It commits an absolute arm
looking at the body **centre** (`projectFramePose.ts:136-149`) because the pivot
pin re-reads an absolute `target` as the body's centre one frame later, and
committing `toWorldArm`'s on-ray surface target teleported the eye one body
radius inward (pop-2, recorded in that file). `toParent` **is** `toWorldArm`, and
it runs on every world-arm resolution, so it must not re-aim.

**Resolution.** `toParent` stays `toWorldArm`. The centre-looking normalization
is extracted verbatim to `src/utils/camera/centreLookingArm.ts` (Task 8) and
stays the fold's own post-step on the disengage direction (Task 10). Recorded for
the feature plan: site→body disengage **is** `toParent` (§4.3, it lands anchored
at the site), but body→world is not; a rung table that assumes otherwise
reintroduces pop-2.

### D3 — `channels.encode` takes world channels, not a `FramedPose`

§2.4 spells `encode(framed: FramedPose<K>, ctx): CameraPose` and §3-P5 spells
`convertChannels` as `decode → refoldTo → encode`. `BodyFixedPose` carries no
orbit target (`decodeBodyFixedChannels.ts:36` folds it into `eyeRelAnchorM`),
while today's `toBodyFixedChannels` **preserves the authored target** by mapping
`pose.target` through provider A (`clipFrameChannels.ts:40-44`). A body `encode`
whose only input is a `FramedPose<'body'>` must re-derive the target from
`toWorldArm`'s graze rule, landing it at a different distance along the same ray
— a changed `distance` channel on every absolute→body clip leg. Prep may not do
that.

**Resolution.** The pair becomes

```ts
// src/@types/camera/RungChannels.d.ts
export type RungChannels<K extends RungKind> = {
  /** Absolute world channels → this rung's channels. */
  encode(world: CameraPose, frame: FrameOf[K], ctx: RungBasisCtx): CameraPose;
  /** This rung's channels → the framed pose they name. */
  decode(channels: CameraPose, frame: FrameOf[K], ctx: RungBasisCtx): FramedPose<K>;
};
```

and `convertChannels` becomes `decode → foldToWorld → encode`, byte-identical to
today for both incumbent rungs and still rung-generic (the site row's `encode`
composes `refoldTo` internally). `foldToWorld`, not `refoldTo`, is correct here:
clip channels always bridge through the world arm.

### D4 — `isWorldArm` takes the framed pose, not the bare tag

§2.3 spells `isWorldArm(frame: PoseFrame): boolean`. Eight of the twelve gates it
replaces use the tag test to **narrow the pose** — `cameraDrivers.ts:103` then
reads `base.pose.yaw` as a `CameraPose`, `applyWheelZoom.ts:24` then reads
`base.pose`, and so on. TypeScript narrows a discriminated union through a direct
comparison on the discriminant property, never through a type predicate applied
to that property, so `isWorldArm(base.frame)` loses the narrowing at all eight
and forces an `as` — which invariant §2.6.3 confines to `rowFor`/`climbRowFor`.

**Resolution.** All twelve sites already hold a `FramedCameraPose`, so:

```ts
// src/services/engine/camera/rungs/isWorldArm.ts
export function isWorldArm(framed: FramedCameraPose): framed is FramedPose<'absolute'>;
```

The narrowing survives, no `as` appears, and the feature plan's `followActive`
gate (§4.8) reads the same way.

### Boundary note (not a deviation)

§3 assigns the `RungKind` / `FrameOf` / `PoseOf` / `FramedPose` type files to P2.
Task 1 creates them instead, because `isWorldArm`'s predicate (D4) names
`FramedPose<'absolute'>`. Nothing else about the §3 commit grouping moves.

---

## Task 0: confirm the gate

**Files:** none — measurement only. No perf baseline: this PR is
behaviour-preserving and touches no renderer file, so `npm run perf` has nothing
to compare.

**Branch.** Cut `camera-frame-ladder-prep` from `origin/main` **after the docs PR
#707 (the spec plus both plans) has merged**, so `main` already carries the
authority this branch implements. If #707 is not merged yet, the implementer
still cuts the code branch from `main` and **copies nothing**: the spec and this
plan are read from #707's branch (`worktree-fix-on-planet-body-camera`), and no
doc file is carried onto, or edited from, the prep branch. Every commit below
lands on the code branch.

- [ ] `npm run typecheck` — clean (tsc, both projects; not only `:fast`).
- [ ] `npm test` — full pass. Record the **suite and file counts** verbatim in
      the SDD ledger under `Task 0 gate`; every later task compares against it,
      and a task that changes the count without adding a test named in this plan
      is a review failure.
- [ ] `git status --porcelain tests/fixtures/camera/` — empty.
- [ ] No commit.

---

## P1 — frame identity

### Task 1: rung kinds, the derived tag, and the identity vocabulary

**Files (create):** `src/@types/camera/RungKind.d.ts`,
`src/@types/camera/FrameOf.d.ts`, `src/@types/camera/PoseOf.d.ts`,
`src/@types/camera/FramedPose.d.ts`,
`src/services/engine/camera/rungs/rungKindOf.ts`,
`src/services/engine/camera/rungs/frameKey.ts`,
`src/services/engine/camera/rungs/sameFrame.ts`,
`src/services/engine/camera/rungs/isWorldArm.ts`,
`tests/services/engine/camera/rungs/frameKey.test.ts`

**Files (modify):** `src/@types/camera/PoseFrame.d.ts` (whole file, 4 lines),
`src/@types/camera/FramedCameraPose.d.ts` (whole file, 12 lines)

**Produces** (spec §2.1, §2.3 — two kinds only, per Global constraints):

```ts
export type RungKind = 'absolute' | 'body';

export type FrameOf = {
  readonly absolute: 'absolute';
  readonly body: { readonly body: BodyId };
};

export type PoseOf = { readonly absolute: CameraPose; readonly body: BodyFixedPose };

export type FramedPose<K extends RungKind = RungKind> = {
  readonly frame: FrameOf[K];
  readonly pose: PoseOf[K];
};

export type PoseFrame = FrameOf[RungKind]; // spelling unchanged
export type FramedCameraPose = { [K in RungKind]: FramedPose<K> }[RungKind];

export function rungKindOf(frame: PoseFrame): RungKind;
export function frameKey(frame: PoseFrame): string; // 'absolute' | 'body:mars'
export function sameFrame(a: PoseFrame, b: PoseFrame): boolean; // frameKey equality
export function isWorldArm(framed: FramedCameraPose): framed is FramedPose<'absolute'>;
```

**Consumes:** `BodyId`, `CameraPose`, `BodyFixedPose`.

**The change.** `PoseFrame` and `FramedCameraPose` become derivations of the
kinds; both must stay structurally identical to today's spellings, which is what
keeps the rest of the tree compiling untouched in this task. `rungKindOf` is the
one reader of the spelling: `'absolute'` for the string, otherwise the kind named
by the single key present. `frameKey` adopts the debug panel's existing grammar
(`CameraStateSection.tsx:53`) — `'absolute'` or `` `body:${id}` ``.

**Tests that fail first** (one file; `rungKindOf` and `isWorldArm` are one
expression each and are covered through `frameKey`'s cases plus the compiler):

- `frameKey prefixes a body frame and leaves the world arm bare` — asserts the
  two hand-written strings; this is the grammar `logCameraState` prints from
  Task 2 on.
- `sameFrame joins two distinct objects naming the same body and separates two
bodies` — the object-identity half is precisely what the four hand-rolled
  equalities existed to avoid.
- `frameKey cannot collide across kinds` — a body whose id is literally
  `'absolute'` keys as `'body:absolute'`. One line, and it is the whole reason
  for the prefix.

**Verify:** `npm run typecheck:fast`; `npm test -- frameKey`;
`npm test -- goldenTrace poseFold`; `git status --porcelain tests/fixtures/camera/`
empty.

**Commit:** `feat(camera): rung kinds and one frame-identity grammar (P1)`

**Also in this task:** open the PR **as a draft**, `--base main`, from this
branch. Title `refactor(camera): frame ladder ground preparation (P1–P5)`; the
body links the spec and this plan and states the behaviour-preservation contract
(golden traces byte-identical, `noStoredRegimeFlag` allow-list empty).

### Task 2: re-home the four hand-rolled equalities and the two display grammars

**Files (modify):** `src/services/engine/frame/projectFramePose.ts:167` (site 6);
`src/services/engine/camera/replayInput.ts:205-209` (13);
`src/utils/camera/cameraDebugSnapshotOf.ts:29-31,93` (36) — **delete** the local
`sameFrame`; `src/services/engine/camera/evaluateClip.ts:486-488,506-509,549`
(40) — **delete** `frameKeyOf`; `src/components/DebugPanel/CameraStateSection.tsx:52-54`
(39) — **delete** `frameLabel`; `src/services/engine/helpers/logCameraState.ts:61-64`
(29); `tests/services/engine/helpers/logCameraState.test.ts:204`

**Consumes:** `frameKey`, `sameFrame`.

**The change.** Four equality expressions collapse onto `sameFrame`, two label
expressions onto `frameKey`. `evaluateClip`'s `frameKeyOf` returned the body id
**unprefixed**; every use compares two of its own outputs (the leg dedupe at
`:509`, `convertChannels`' early-out at `:549`), so the swap is
behaviour-identical.

The **one deliberate string change in the whole PR** lands here:
`logCameraState`'s `frame` field goes `'earth'` → `'body:earth'`. It reaches no
trace and no serialized artifact — only the console instrument and the debug
panel, which already spelled it `body:earth`. Update
`logCameraState.test.ts:204`'s expectation in the same commit and name the change
in the commit body.

**Tests that fail first:** none new. `logCameraState.test.ts:178`'s existing case
(`names the frame and prints metres in a body arm`) fails on the old expectation
and is updated to the new grammar; every other behaviour here is already covered
by `poseFold`, `replayInput`, `cameraDebugSnapshotOf`, `evaluateClip`,
`clipKeyframeFrames`.

**Verify:** `npm run typecheck:fast`;
`npm test -- goldenTrace poseFold replayInput cameraDebugSnapshotOf evaluateClip clipKeyframeFrames logCameraState`;
`git status --porcelain tests/fixtures/camera/` empty.

**Commit:** `refactor(camera): one frame-equality and one frame-label grammar (P1)`

### Task 3: `isWorldArm` at the twelve world-arm gates

**Files (modify):** `src/services/engine/camera/cameraDrivers.ts:82` (17), `:103`
(18), `:294` (20), `:300` (21); `src/services/engine/camera/applyWheelZoom.ts:24`
(22); `src/services/engine/camera/applyFocusedBodyPivot.ts:29` (23);
`src/services/engine/camera/approachTiltedPose.ts:41` (24);
`src/services/engine/camera/replayInput.ts:234` (14), `:268` (15);
`src/state/camera/selectors.ts:39` (32);
`src/state/camera/watchOrientationChangeSaga.ts:39` (33);
`src/services/engine/camera/pivotSurfaceRangeMpc.ts:21` (25)

**Consumes:** `isWorldArm`.

**The change.** Each gate becomes `isWorldArm(<the framed pose it already holds>)`
or its negation. All twelve hold a `FramedCameraPose` (verified), and the D4
predicate keeps the pose narrowing at the eight sites that go on to read
`.pose` as a `CameraPose` — if any site needs an `as` to compile, the predicate
is wrong, not the site: stop and report.

**Site 25 is in this sweep, not P2.** The spec's §5 matrix originally assigned
`pivotSurfaceRangeMpc` to P2 ("unchanged; reads `hostOf`"); the question it asks
is exactly "is this the world arm" — its two branches are the two arms' different
meanings of `distance` (`pivotSurfaceRangeMpc.ts:21`), not a host lookup — and it
holds no ctx. The 2026-09-14 amendment moved it into §5's `isWorldArm` row;
nothing about it changes in P2.

**Tests that fail first:** none new. These are twelve expression swaps under
existing coverage (`cameraDrivers`, `applyWheelZoom`, `applyFocusedBodyPivot`,
`approachTiltedPose`, `replayInput`, `pivotSurfaceRangeMpc`, `poseFold`, the two
traces).

**Verify:** `npm run typecheck:fast`; `npm test -- camera`;
`npm test -- goldenTrace poseFold`; `git status --porcelain tests/fixtures/camera/`
empty.

**Commit:** `refactor(camera): one world-arm predicate for the twelve arm gates (P1)`

---

## P2 — the table skeleton, `host`, and the fold

### Task 4: the row, ctx and host types

**Files (create):** `src/@types/camera/ClimbableKind.d.ts`,
`src/@types/camera/ParentOf.d.ts`, `src/@types/camera/HostBody.d.ts`,
`src/@types/camera/RungBasisCtx.d.ts`, `src/@types/camera/RungCtx.d.ts`,
`src/@types/camera/RungRow.d.ts`, `src/@types/camera/ClimbRow.d.ts`

**Produces** (spec §2.2, §2.4, with D1's split and the per-P growth):

```ts
export type ClimbableKind = Exclude<RungKind, 'absolute'>; // 'body' in prep
export type ParentOf = { readonly body: 'absolute' }; // + site: 'body' in the feature PR

export type HostBody = {
  readonly id: BodyId;
  readonly state: BodyState;
  /** Ground radius, metres — SCENE_CELESTIAL_BODIES, never a bounding hull. */
  readonly radiusM: number;
};

export type RungRow<K extends RungKind> = {
  readonly kind: K;
  host(frame: FrameOf[K], ctx: RungBasisCtx): HostBody | null;
};

export type ClimbRow<K extends ClimbableKind> = RungRow<K> & {
  readonly parent: ParentOf[K];
  toParent(framed: FramedPose<K>, ctx: RungBasisCtx): FramedPose<ParentOf[K]>;
  fromParent(parent: FramedPose<ParentOf[K]>, frame: FrameOf[K], ctx: RungBasisCtx): FramedPose<K>;
};
```

plus `RungBasisCtx` / `RungCtx` exactly as **D1** spells them.

**Tests:** none. Type declarations are what `testing.md` forbids restating at
runtime; `npm run typecheck` is the proof.

**Verify:** `npm run typecheck`.

**Commit:** `feat(camera): the rung row, parent and ctx types (P2)`

### Task 5: `CAMERA_RUNGS`, the two incumbent rows, and the generic readers

**Files (create):** `src/services/engine/camera/rungs/absoluteRung.ts`,
`src/services/engine/camera/rungs/bodyRung.ts`,
`src/services/engine/camera/rungs/cameraRungs.ts`,
`src/services/engine/camera/rungs/rowFor.ts`,
`src/services/engine/camera/rungs/climbRowFor.ts`,
`src/services/engine/camera/rungs/hostOf.ts`,
`src/services/engine/camera/rungs/hostOrThrow.ts`,
`src/services/engine/camera/rungs/refoldTo.ts`,
`src/services/engine/camera/rungs/foldToWorld.ts`,
`tests/services/engine/camera/rungs/rowFor.test.ts`,
`tests/services/engine/camera/rungs/hostOf.test.ts`

**Produces** (spec §2.4, §2.5; `ctx` per D1):

```ts
export const CAMERA_RUNGS: { readonly absolute: RungRow<'absolute'> } & {
  readonly [K in ClimbableKind]: ClimbRow<K>;
};

export function rowFor<K extends RungKind>(frame: FrameOf[K]): RungRow<K>;
export function climbRowFor<K extends ClimbableKind>(frame: FrameOf[K]): ClimbRow<K>;
export function hostOf(frame: PoseFrame, ctx: RungBasisCtx): HostBody | null;
export function hostOrThrow(frame: PoseFrame, ctx: RungBasisCtx): HostBody;
export function refoldTo(
  framed: FramedCameraPose,
  target: PoseFrame,
  ctx: RungBasisCtx,
): FramedCameraPose;
export function foldToWorld(framed: FramedCameraPose, ctx: RungBasisCtx): CameraPose;
```

**Consumes:** `toBodyArm` / `toWorldArm` (`poseFrameConversion.ts:36,75`) — they
stay where they are and become the body row's `fromParent` / `toParent` bodies;
`SCENE_CELESTIAL_BODIES`; `rungKindOf`.

**The change.** `absoluteRung.host` answers `null`. `bodyRung.host` resolves the
`BodyState` and the `SCENE_CELESTIAL_BODIES` row and answers `null` if either is
missing this instant — the **one** failure policy; `hostOrThrow` is the single
throwing wrapper and keeps today's message shape
(`poseFrameConversion.ts:160-162`). `refoldTo` climbs `toParent` to the shallower
of the two rungs then descends `fromParent`; `foldToWorld` is its `'absolute'`
specialisation and returns the world arm's own pose **by reference**
(`poseFrameConversion.ts:141-145`) — that reference identity is load-bearing, it
is what keeps the per-frame fold free on the world arm, and `replayInput.ts:142`'s
`next !== from` identity check depends on the same discipline elsewhere.

`rowFor` and `climbRowFor` hold **one `as` expression each and nothing else**
(invariant §2.6.3).

Nothing consumes these yet, so the whole task is net-additive and the traces
cannot move.

**Tests that fail first:**

- `rowFor returns the row whose kind matches rungKindOf, for a frame of each
kind` — the only cover for the two `as` expressions; without it a mis-keyed
  table is a silent wrong-row dispatch. Same assertion for `climbRowFor` on the
  body frame.
- `hostOf answers null for a body absent from the state map` — not a throw, not
  an assertion. Three incumbent failure policies collapsing to one is exactly
  where a silent teleport could be introduced.
- `hostOrThrow throws naming the unresolved body` — asserts the id appears in the
  message, not the whole string.
- `hostOf answers the ground radius, never a bounding hull` — for a body frame it
  returns `SCENE_CELESTIAL_BODIES`' `radiusM` (invariant §2.6.6); hand-written
  against one real roster row.

**Verify:** `npm run typecheck`; `npm test -- rungs`; `npm test -- goldenTrace poseFold`.

**Commit:** `feat(camera): CAMERA_RUNGS with the absolute and body rows (P2)`

### Task 6: `foldToWorld` replaces `resolveWorldArm`, and `RungCtx` is threaded

**Files (modify):** `src/services/engine/camera/poseFrameConversion.ts:141-164`
(site 1) — **delete** `resolveWorldArm`;
`src/services/engine/camera/stepCameraRuntime.ts:62-90,128,177-190` (31);
`src/services/engine/camera/replayInput.ts:88,152,243` (16);
`src/services/engine/frame/projectFramePose.ts:108` ;
`src/services/engine/helpers/liveWorldPose.ts:15` (30);
`src/state/camera/watchFlyToLonLatSaga.ts:47` (34);
`src/services/engine/camera/clipFrameChannels.ts:62` (26, partial)

**Consumes:** `foldToWorld`, `RungCtx`, `RungBasisCtx`.

**The change.** `stepCameraRuntime` builds the `RungCtx` — it already holds every
field: `bodies`, `poseBasis`, `tuning`, `projection.fovYRad`, `canvasPx`, and
`focus` (`:60-75`); `pivot` is `pivotFraming(focus)`, lifted out of
`replayInput.ts:88` unchanged (a pure function of the focus row).

**Landmine — two ctx values, not one.** `replayInput` is fed
`prev.outputs.upBasis` and `projectFramePose` is fed **this** frame's `upBasis`
(`stepCameraRuntime.ts:82,187`). A single shared ctx silently changes the
replay's up-basis and the settle trace will move. Build two values differing in
`upBasis` only, and say so in one comment line.

`projectFramePose` and `replayInput` take the ctx in place of the fields it now
carries (`bodies`, `poseBasis`, `upBasis`, `tuning`, and `replayInput`'s
`canvasPx` / `projection` / internal `pivotFraming`). No field may appear both in
the ctx and beside it. `replayInput` keeps `rootState`, `nowMs`,
`winnerLastFrame` and `autoRotateEpoch`; `projectFramePose` keeps `render`,
`authoredOverride`, `pivotsOnFocusedBody`, `focus` (it needs the whole
`SelectionRow`, not just a body id), `follow`, `surface` and `intent`.

The three off-frame sites take `RungBasisCtx` (D1): `liveWorldPose` and
`watchFlyToLonLatSaga` build it from what they already derive;
`clipFrameChannels` keeps passing `basis, basis` as both bases exactly as today
(`clipFrameChannels.ts:64-66`) — an incumbent substitution, not a new choice.

**Tests that fail first:** none new — the golden traces and `poseFold` are the
bar, and the call-site signature churn is a compiler matter. Existing tests that
construct `replayInput` / `projectFramePose` arguments
(`tests/services/engine/camera/replayInput.test.ts`,
`tests/services/engine/frame/poseFold.test.ts` via the harness,
`tests/helpers/camera/*`) are updated mechanically; **`poseFold.test.ts`'s own
assertions may not change.**

**Verify:** `npm run typecheck`; `npm test -- goldenTrace poseFold replayInput stepCameraRuntime liveWorldPose watchFlyToLonLat`;
`git status --porcelain tests/fixtures/camera/` empty.

**Commit:** `refactor(camera): one fold through foldToWorld, one RungCtx (P2)`

### Task 7: the nine host derivations collapse onto `hostOf` / `hostOrThrow`

**Files (modify):** `src/services/engine/frame/projectFramePose.ts:136` (4),
`:155` (5) — **both `!` assertions go**;
`src/services/engine/camera/replayInput.ts:118` (9), `:126` (11);
`src/utils/camera/cameraDebugSnapshotOf.ts:84` (37);
`src/utils/camera/cameraDofAnglesOf.ts:63-67` (38);
`src/services/engine/camera/clipFrameChannels.ts:31-34` (26, partial);
`src/state/camera/watchFlyToLonLatSaga.ts:38-39` (34);
`src/services/engine/frame/frameContext.ts:146-149` (27);
`src/services/engine/camera/regimeArmFor.ts:42-44` (7, partial)

**Consumes:** `hostOf`, `hostOrThrow`, `sameFrame`.

**The change.** Every ad-hoc "resolve the engaged body's state and roster row"
becomes one `hostOf` call; the three incumbent failure policies collapse onto the
pair. Policy per site, all behaviour-preserving:

- `projectFramePose:136,155` and `clipFrameChannels:31` are **total by
  construction** today (`!` and a throw) → `hostOrThrow`.
- `regimeArmFor:44` holds rather than guesses (`return current`) → `hostOf(…) === null`
  keeps that branch verbatim. This is the policy that becomes the body row's
  `release` answering `false` in Task 9 — do not change it here.
- `replayInput:118` returns `true` (route to the surface register anyway) and
  `:126` degrades to the pole; both keep their fallbacks off a `null` `hostOf`.
- `cameraDebugSnapshotOf:84`, `cameraDofAnglesOf:63-67`, `watchFlyToLonLatSaga:38`
  and `frameContext:146-149` read a nullable host already.

`frameContext:146-149` is the "provider B serves the engaged body" gate. Spell it
`hostOf(arm.frame, ctx)?.id === bodyId`, not `sameFrame` — provider B must serve
the **host** once a rung that is not its own host exists, and that is the whole
point of routing it through `hostOf`.

**Tests that fail first:** none new — Task 5's `hostOf` / `hostOrThrow` tests are
the contract, and every site here is under existing coverage
(`cameraDebugSnapshotOf`, `frameContext`, `poseFold`, `replayInput`, the traces).

**Verify:** `npm run typecheck`;
`npm test -- goldenTrace poseFold replayInput frameContext cameraDebugSnapshotOf cameraDofAngles regimeArmFor`;
`git status --porcelain tests/fixtures/camera/` empty.

**Commit:** `refactor(camera): one host derivation and one failure policy (P2)`

---

## P3 — engage / release and `stepRung`

### Task 8: extract the disengage normalization

**Files (create):** `src/utils/camera/centreLookingArm.ts`,
`tests/utils/camera/centreLookingArm.test.ts`
**Files (modify):** `src/services/engine/frame/projectFramePose.ts:127-152`

**Produces:**

```ts
export function centreLookingArm(
  eyeMpc: Readonly<Vec3>,
  centreMpc: Readonly<Vec3>,
  poseBasis: Readonly<Mat3>,
  roll: number,
): FramedCameraPose; // frame: 'absolute'
```

**The change.** A verbatim extraction of `projectFramePose.ts:136-149` — the
pop-2 fix (target at the body centre, eye preserved, `roll` carried) that **D2**
keeps out of `toParent`. Port the load-bearing comment with it; the fold keeps a
one-line pointer, not a copy.

**Tests that fail first:**

- `centreLookingArm keeps the eye and aims at the centre` — hand-built eye and
  centre; asserts `target` equals the centre, `distance` equals the hand-computed
  `|centre − eye|`, and that `target + dir·distance` reproduces the input eye.
  This is the pop-2 regression in one assertion: an implementation that ranges to
  the surface instead moves the eye by one body radius.
- `centreLookingArm carries the incoming roll` — one line; dropping it pins the
  crossing frame to scene-frame up.

**Verify:** `npm run typecheck:fast`; `npm test -- centreLookingArm poseFold goldenTrace`;
`git status --porcelain tests/fixtures/camera/` empty; `npm test -- frameFilePurity`
(the `frame/projectFramePose` budget stays at 1).

**Commit:** `refactor(camera): extract the disengage centre-looking arm (P3)`

### Task 9: the `engage` / `release` cells and `stepRung`

**Files (modify):** `src/@types/camera/ClimbRow.d.ts` (grow two cells);
`src/services/engine/camera/rungs/bodyRung.ts`
**Files (create):** `src/services/engine/camera/rungs/stepRung.ts`
**Files (move):** `tests/services/engine/camera/regimeArmFor.test.ts` →
`tests/services/engine/camera/rungs/stepRung.test.ts`, via
`npm run move-files -- tests/services/engine/camera/regimeArmFor.test.ts tests/services/engine/camera/rungs/stepRung.test.ts`
(`--dry` first)

**Produces** (spec §2.4, §2.5):

```ts
// added to ClimbRow<K>
  /** Band-in against the parent, focus rule included; null = stay put. */
  engage(parent: FramedPose<ParentOf[K]>, ctx: RungCtx): FrameOf[K] | null;
  /** Band-out; wider than `engage` by construction. */
  release(framed: FramedPose<K>, ctx: RungCtx): boolean;

export function stepRung(current: FramedCameraPose, ctx: RungCtx): PoseFrame;
```

**Consumes:** `hOverR`, `nearestBodyHR`, `hostOf`, `rowFor` / `climbRowFor`,
`eyeMpcOf`.

**The change.** `regimeArmFor.ts:26-35`'s engage test becomes `bodyRung.engage`
and `:38-45`'s release test becomes `bodyRung.release`, **verbatim** — the
nearest-body scan, `tuning.engageHR`, the focus equality (`focusedBodyId === null
|| focusedBodyId === nearest.bodyId`), the differing-focus release, and the
hold-rather-than-guess branch. `stepRung` asks the current rung's `release`, then
each child's `engage`, and answers a frame **at most one rung away** (§2.6.4);
with two rungs that is exactly today's answer. `regimeArmFor.ts` is still in the
tree and still called at the end of this task — Task 10 deletes it — so the
traces cannot move here.

`engage` reads `ctx.focusBodyId`, which `stepCameraRuntime` derives from the same
`focus?.type === 'body' ? focus.id : null` expression `projectFramePose.ts:124`
uses today. Same value, one home.

**Tests that fail first** — the nine cases of `regimeArmFor.test.ts` move across
and are re-pointed at `stepRung` with **their assertions unchanged**:
`engages the nearest body below the engage threshold`, `holds the world arm above
the engage threshold`, `holds an engaged body arm until disengage, from both
directions`, `picks the minimising body when two are close, with no focus input`,
`is body-blind: a small moon engages at its own engage threshold`, `a focus on a
DIFFERENT body releases the engaged arm at any altitude`, `focusing the engaged
body itself is a no-op`, `a differing body focus also blocks engage — the release
cannot flap`, `a mesh body never engages, even with the eye inside its bounding
sphere`. One case is added:

- `stepRung moves at most one rung per call` — from the world arm it answers a
  body frame, never anything deeper. With two rungs this is cheap; it is the
  invariant the feature PR's two-frame descent rests on, and it must exist before
  a third rung can violate it silently.

**Verify:** `npm run typecheck`; `npm test -- stepRung`;
`npm test -- goldenTrace poseFold`; `git status --porcelain tests/fixtures/camera/`
empty.

**Commit:** `feat(camera): engage/release cells and stepRung (P3)`

### Task 10: the fold drives off the table; `regimeArmFor` dies

**Files (modify):** `src/services/engine/frame/projectFramePose.ts:110-171`
(sites 3, 5, 6)
**Files (delete):** `src/services/engine/camera/regimeArmFor.ts` (7)

**Consumes:** `stepRung`, `climbRowFor`, `sameFrame`, `centreLookingArm`.

**The change.** The fold asks `stepRung` for the target frame, then:

- **descend** (world → body): `climbRowFor(target).fromParent(displayed, target, ctx)`,
  replacing `projectFramePose.ts:153-163`'s `toBodyArm` call and its
  `bodies.get(arm.body)!`;
- **climb** (body → world): `climbRowFor(displayed.frame).toParent(displayed, ctx)`
  for the pose, then `centreLookingArm` for the committed arm — **D2**: the
  commit is centre-looking, `toParent` is not;
- **crossing commit**: `!sameFrame(target, regime)` (already `sameFrame` from
  Task 2).

`regimeArmFor.ts` is deleted in this commit and nothing imports it.
`tests/services/engine/camera/regimeArmFor.test.ts` no longer exists (moved in
Task 9).

**Tests that fail first:** none new. `poseFold.test.ts`'s nine cases and both
golden traces are the entire safety argument for this task — if any of them moves
by a bit, the fold's order or its conversions changed and the task is wrong.

**Verify:** `npm run typecheck`; `npm test -- poseFold goldenTrace engageFlipPop focusReleaseWhileEngaged engagedArmClock followApproachStrand tiltCommitIdempotence`;
`git status --porcelain tests/fixtures/camera/` empty; `npm test -- frameFilePurity`.

**Commit:** `refactor(camera): the fold reads the rung table; delete regimeArmFor (P3)`

---

## P4 — the `step` cell and the memory split

### Task 11: split `SurfaceMemory` into the rung's gesture memory and the tilt memory

**Files (create):** `src/@types/camera/SurfaceGestureMemory.d.ts`,
`src/@types/camera/TiltMemory.d.ts`, `src/utils/camera/notedTiltMemory.ts`,
`tests/utils/camera/notedTiltMemory.test.ts`
**Files (delete):** `src/@types/camera/SurfaceMemory.d.ts`
**Files (modify):** `src/services/camera/surfaceStep.ts:29-50,52-58,124-127`;
`src/utils/camera/surfaceGestureEdge.ts`;
`src/@types/engine/state/CameraRuntime.d.ts:21`;
`src/services/engine/camera/seedCameraRuntime.ts:12,28`;
`src/services/engine/camera/stepCameraRuntime.ts:77,183,197`;
`src/services/engine/frame/projectFramePose.ts:88-105,173`;
`src/services/engine/camera/replayInput.ts:49-50,68,94,130-137,198,210`;
`src/services/engine/frame/runFrame.ts:141`;
`src/utils/camera/cameraDebugSnapshotOf.ts` (input fields)

**Produces** (spec §3-P4's deliberate split):

```ts
export type SurfaceGestureMemory = {
  /** null = idle · 'down' = pressed, not yet latched · else latched. */
  readonly gesture: SurfaceGesture | 'down' | null;
};

export type TiltMemory = {
  readonly hostId: BodyId | null;
  /** Radians, un-mapped through the band weight; 0 until a tilt/look drag sets it. */
  readonly rememberedTiltRad: number;
};

export function notedTiltMemory(prev: TiltMemory, hostId: BodyId | null): TiltMemory;
```

**The change.** `SurfaceMemory` carries two unrelated things. The latch belongs
to the body rung; `rememberedTiltRad` does **not** — `approachTiltedPose` reads
it while the camera is in the **world** arm, and `noteBody` keys it on the
_focused_ body there (`projectFramePose.ts:91-95`). Keying the tilt by `frameKey`
would wipe it on every disengage, which prep may not do.

`notedTiltMemory` is `noteBody` (`surfaceStep.ts:46-50`) with its parameter
renamed to what it actually is: a **host** id. Its key at the call site becomes
`hostOf(frame, ctx)?.id ?? focusBodyId` (site 2), which reproduces
`projectFramePose.ts:94`'s expression exactly for both incumbent rungs — the
engaged body's host **is** the engaged body — and gives the right answer for the
site rung for free.

`CameraRuntime` carries `gesture: SurfaceGestureMemory` and `tilt: TiltMemory` in
place of `surface: SurfaceMemory`; `EMPTY_SURFACE_MEMORY` splits accordingly.
Nothing about wipe timing changes in this task.

**Tests that fail first:**

- `notedTiltMemory wipes the remembered tilt when the host changes, keeps it on
null, and is identity on the same host` — the three branches of
  `surfaceStep.ts:47-49`, moved. (The incumbent has no direct test; the wipe rule
  is ruling 18 and a silent regression here is invisible until a tilt survives a
  body switch.)

**Verify:** `npm run typecheck`;
`npm test -- notedTiltMemory surfaceStep goldenTrace poseFold replayInput stepCameraRuntime cameraDebugSnapshotOf`;
`git status --porcelain tests/fixtures/camera/` empty.

**Commit:** `refactor(camera): split the rung gesture memory from the tilt memory (P4)`

### Task 12: the `frameKey`-keyed memory envelope and `emptyMemory`

**Files (create):** `src/@types/camera/MemOf.d.ts`,
`src/@types/camera/RungMemory.d.ts`
**Files (modify):** `src/@types/camera/RungRow.d.ts` (grow `emptyMemory`);
`src/services/engine/camera/rungs/absoluteRung.ts`,
`src/services/engine/camera/rungs/bodyRung.ts`;
`src/@types/engine/state/CameraRuntime.d.ts`;
`src/services/engine/camera/seedCameraRuntime.ts`;
`src/services/engine/camera/stepCameraRuntime.ts`

**Produces:**

```ts
export type MemOf = { absolute: null; body: SurfaceGestureMemory };   // + site: null later

/** The runtime's rung-local memory, wiped whenever `key` changes. */
export type RungMemory = { readonly key: string; readonly value: MemOf[RungKind] };

// added to RungRow<K>
  /** Rung-local gesture memory; the runtime wipes it when `frameKey` changes. */
  readonly emptyMemory: MemOf[K];
```

**The change.** `CameraRuntime.gesture` becomes a `RungMemory` envelope keyed by
`frameKey(register.frame)`; `stepCameraRuntime` replaces the value with
`rowFor(frame).emptyMemory` whenever the key differs from the stored one.

**Landmine — the wipe must be provably inert.** Today nothing wipes the latch on
an arm change; only the two gesture edges write it, and the fold is skipped whole
while `intent.dragging` (`projectFramePose.ts:112-114`), so a key change cannot
occur between a latch and its release. If `settleGoldenTrace` moves by a bit, that
reasoning is wrong — **halt and report**, do not re-record.

**Tests that fail first:**

- `the rung memory is wiped when the frame key changes and kept when it does not`
  — drives `stepCameraRuntime` across an engage with a latched gesture value
  seeded, asserts the post-step value is `emptyMemory`, and asserts identity (not
  equality) of the value across a same-key step. The identity half is what proves
  the envelope is not reallocating the memory every frame.

**Verify:** `npm run typecheck`;
`npm test -- stepCameraRuntime goldenTrace poseFold`;
`git status --porcelain tests/fixtures/camera/` empty.

**Commit:** `feat(camera): frameKey-keyed rung memory envelope (P4)`

### Task 13: the body row's `step`; `routeToSurface` dies

**Files (modify):** `src/@types/camera/RungRow.d.ts` (grow `step`);
`src/services/engine/camera/rungs/bodyRung.ts`;
`src/services/engine/camera/replayInput.ts:107-146,193-218` (sites 8, 10, 12)

**Produces** (spec §2.4):

```ts
// added to RungRow<K>
  step(
    memory: MemOf[K],
    framed: FramedPose<K>,
    input: InputStep,
    ctx: RungCtx,
  ): { readonly pose: PoseOf[K]; readonly memory: MemOf[K] };
```

**Consumes:** `surfaceStep`, `latchSurfaceGesture`, `surfaceGestureEdge`,
`hostOrThrow`.

**The change.** `routeToSurface`'s three jobs go generic: the **gate** (site 8,
`replayInput.ts:115`) becomes "which row", the **register pick** (10, `:118-129`)
becomes the body row's own `step` body, and the **re-tag** (12, `:138`) becomes
the caller wrapping the returned pose in the frame it stepped. The body row's
`step` handles **every** `InputStep` kind — `gestureStart` and `gestureEnd`
included (`surfaceGestureEdge` at `:198,210`), so the latch stops being
`replayInput`'s business — and returns its input pose **by reference** for kinds
it declines (`draggedSurfacePose.ts:131-133`); `replayInput.ts:142`'s
`next !== from` at-rest-notch commit depends on that identity.

What stays in `replayInput`: arbitration (which steps reach the rung at all), the
clip swallow (`:117,150`), the store commits (`:143,209,254,281`), the follow
`panOffset` bookkeeping (`:175-189`) and the at-rest zoom lane (`:225-283`) —
driver and store memories that outlive the rung.

The `sceneUpLocal` derivation (`:126-129`) moves into the body row's `step`,
reading its host through `hostOrThrow`/`hostOf` and `ctx.upBasis`.

**Tests that fail first:** none new. `replayInput.test.ts`, `surfaceStep.test.ts`,
`settleGoldenTrace` (the gesture script through both arms) and `poseFold` are the
bar. If a gesture-edge case needs a new test to be safe, the routing is wrong —
report rather than add one.

**Verify:** `npm run typecheck`;
`npm test -- replayInput surfaceStep goldenTrace poseFold tiltRegisterLoop tiltLerpRoundTrip`;
`git status --porcelain tests/fixtures/camera/` empty.

**Commit:** `refactor(camera): the body rung owns its gesture register (P4)`

### Task 14: the absolute row's `step`

**Files (modify):** `src/services/engine/camera/rungs/absoluteRung.ts`;
`src/services/engine/camera/replayInput.ts:148-191,215-217`

**Consumes:** `applyInputToCamera`, `frameAlignedRoll`, `zoomedPose`.

**The change.** `applyWorldStep`'s pose math — `applyInputToCamera`
(`replayInput.ts:153-161`) plus the roll ride (`:162-174`) — becomes the absolute
row's `step`, with `MemOf['absolute'] = null`. Both `drag` and `zoom` then route
through `rowFor(frame).step` with no arm branch at the call site (`:216,224`).

The follow `panOffset` write (`:175-189`) stays in `replayInput`: it writes a
**driver** memory that outlives the rung, and the step cell's return shape has
nowhere to put it. It reads the delta from the pose the step returned against the
pose it was given — the same two values it uses today.

The clip swallow (`:150`) stays at the call site: a playing clip owns the camera
in both arms (invariant §2.6.5), which is arbitration, not a rung question.

**Tests that fail first:** none new — same bar as Task 13.

**Verify:** `npm run typecheck`;
`npm test -- replayInput goldenTrace poseFold focusedZoomOutRoundTrip`;
`git status --porcelain tests/fixtures/camera/` empty.

**Commit:** `refactor(camera): the absolute rung owns its world-arm register (P4)`

---

## P5 — the `channels` cell

### Task 15: `channels` on both rows; `framedClipArm` reads the table

**Files (create):** `src/@types/camera/RungChannels.d.ts`,
`src/utils/camera/toBodyFixedChannels.ts` (moved, see below)
**Files (modify):** `src/@types/camera/RungRow.d.ts` (grow `channels`);
`src/services/engine/camera/rungs/absoluteRung.ts`,
`src/services/engine/camera/rungs/bodyRung.ts`;
`src/services/engine/camera/cameraDrivers.ts:170-184,213,281` (site 19)

**Files (move):** `npm run move-files -- src/services/engine/camera/clipFrameChannels.ts src/utils/camera/toBodyFixedChannels.ts`
(`--dry` first), then reduce the moved file to the single `toBodyFixedChannels`
export — `fromBodyFixedChannels` is subsumed by `decode` + `foldToWorld` and is
deleted in Task 16. Port the module header's landmine (converted **once per leg**,
never per frame; the pair is lossless in the eye and basis but carries no orbit
pivot) onto the body row's `channels` cell.

**Produces:** `RungChannels<K>` exactly as **D3** spells it, plus the two rows'
cells:

- `absoluteRung.channels`: `encode` returns the world channels by reference;
  `decode` wraps them with `absoluteArm`.
- `bodyRung.channels`: `encode` is today's `toBodyFixedChannels`; `decode` is
  `{ frame, pose: decodeBodyFixedChannels(channels, frame.body) }` — byte-for-byte
  today's `framedClipArm` body branch (`cameraDrivers.ts:183`).

**The change at site 19.** `framedClipArm` becomes
`isWorldArm`-gated re-encode **then** `rowFor(frame).channels.decode(...)`. The
`reencodePose` step (`cameraDrivers.ts:182`) stays outside the cell and stays
absolute-only: it converts between the clip's **pinned** basis and the current
one, and neither basis is in `RungBasisCtx`. `isWorldArm` is sanctioned
vocabulary (§2.6.2), so this is not a raw tag branch.

**Tests that fail first:** none new. `clipKeyframeFrames.test.ts`,
`evaluateClip.test.ts` and `driverGoldenTrace` (which plays a clip) are the bar.

**Verify:** `npm run typecheck`;
`npm test -- clipKeyframeFrames evaluateClip cameraDrivers goldenTrace`;
`git status --porcelain tests/fixtures/camera/` empty.

**Commit:** `feat(camera): the channels cell on the absolute and body rows (P5)`

### Task 16: `convertChannels` becomes `decode → foldToWorld → encode`

**Files (modify):** `src/services/engine/camera/evaluateClip.ts:116,543-556`
(site 42)
**Files (delete):** the residual `fromBodyFixedChannels` (Task 15's move left it
in `src/utils/camera/toBodyFixedChannels.ts`; it has no other caller)

**Consumes:** `rowFor`, `foldToWorld`, `RungBasisCtx`.

**The change.** `convertChannels(channels, from, to, deps)` becomes
`rowFor(to).channels.encode(foldToWorld(rowFor(from).channels.decode(channels, from, ctx), ctx), to, ctx)`,
with `ctx` built from `FrameDeps` (`evaluateClip.ts:526-531`) as
`{ bodies: deps.bodies, poseBasis: deps.basis, upBasis: deps.basis }` — the same
double-use of the clip's steady basis `clipFrameChannels.ts:64-66` makes today.
The `frameKey(from) === frameKey(to)` early-out (`:549`, already `frameKey` from
Task 2) stays.

Byte-identical for both incumbent rungs, and this is worth checking rather than
assuming: `from = 'absolute'` ⇒ `decode` wraps, `foldToWorld` returns the pose
**by reference**; `from = { body }` ⇒ `decode` + `foldToWorld` is exactly today's
`fromBodyFixedChannels`; `to = { body }` ⇒ `encode` is exactly today's
`toBodyFixedChannels`, which is why **D3** does not route through `refoldTo`.

**Tests that fail first:** none new. `clipKeyframeFrames.test.ts` covers
absolute↔body leg conversion; if any of its numbers move, D3's reasoning is wrong
— halt and report.

**Verify:** `npm run typecheck`; `npm test -- clipKeyframeFrames evaluateClip evaluateClipPath goldenTrace poseFold`;
`git status --porcelain tests/fixtures/camera/` empty.

**Commit:** `refactor(camera): clip channel conversion rides the rung table (P5)`

---

## Task 17: deletion audit, the tag-reader ratchet, and the comment audit

**Files (create):** `tests/services/engine/camera/oneTagReader.test.ts`
**Files (modify):** whatever the audits find.

### 17a — the ratchet

A ts-morph declaration scan in the shape of `noStoredRegimeFlag.test.ts` and
`oneMpcSeam.test.ts` (real AST nodes, **not** a source-text grep — per
`testing.md`, a substring search is a rename-detector).

**Name:** `oneTagReader.test.ts`;
`describe('the rung vocabulary is the only reader of the frame tag')`.

**Sweep:** `src/state`, `src/services/camera`, `src/services/engine/camera`,
`src/services/engine/frame`, `src/services/engine/helpers`,
`src/services/engine/animation`, `src/utils/camera`, `src/components/DebugPanel`.
`.d.ts` files are excluded — a type literal `'absolute'` is a declaration, not a
branch.

**Flags:**

1. any `BinaryExpression` with `===` / `!==` where either operand is the string
   literal `'absolute'`;
2. any property-access chain ending `.frame.body`.

Flag (2) must match the property name `body` **exactly**. `view.slab.frame.bodyId`
is the _slab's_ frame — a different type, ~30 legitimate sites across
`frame/passes/` — and a sloppy suffix match turns this ratchet into noise on
day one.

**Allow-list:** exactly the files under `src/services/engine/camera/rungs/`,
declared as that directory rather than as a file list, so a new row file needs no
allow-list edit and any file **outside** it needs a justified one. Today's
expected members: `rungKindOf.ts` (the one reader of the spelling), `frameKey.ts`,
`isWorldArm.ts`, `bodyRung.ts`. As with `noStoredRegimeFlag`, add a
loud-failure guard: the sweep must find more than 20 files, or a typo'd directory
passes vacuously.

**The cases:**

- `no file outside the rung vocabulary compares a PoseFrame against 'absolute'`
  (`it.each` over the swept files).
- `no file outside the rung vocabulary reads .frame.body`.
- `the sweep found real files in every swept directory`.

This is the test that makes the fourth rung a row. It is load-bearing by
construction: without it the 46 branches grow back one review at a time, which is
the failure this whole PR exists to prevent.

### 17b — the deletion audit

Run the `deletion-audit` skill over the branch diff
(`git diff origin/main...HEAD`), framed per
[`conventions/leanness.md`](../conventions/leanness.md): assume a less-capable
author wrote this and that surplus is present. Specific suspects to rule on:

- **Dead cells.** Any row cell with no caller after P5 (`refoldTo` is called only
  by the site rung in the feature PR — if it has no prep caller, say so
  explicitly and keep it only because Task 16's structure names it).
- **Duplicated inert ctx fields.** If the three off-frame `RungBasisCtx` literals
  (Task 6) turn out identical, extract one constant; if they differ, leave them.
- **`sameFrame` vs `frameKey`.** If `sameFrame` ends with one caller, inline it
  and delete the file.
- **`absoluteArm`** (site 28) vs `absoluteRung.channels.decode` — two spellings of
  the same wrap; keep one.
- The `EMPTY_SURFACE_MEMORY` remnants after the Task 11/12 split.

Findings are applied in this task or, with the user's ruling, dropped. Adjacent
findings outside the branch are **offered**, not backlogged silently.

### 17c — the comment audit

Run the `comment-audit` skill over every file the branch touched. Specific risk:
four dying modules (`regimeArmFor`, `resolveWorldArm`, `clipFrameChannels`,
`surfaceStep`'s `noteBody`) carry dense headers, and the default failure mode is
for the row files to inherit the union of all four. Budget: ≤ 10 header lines and
≤ half the code lines **per file**; the landmines that must survive somewhere are
pop-2 (D2, now on `centreLookingArm`), the once-per-leg conversion rule (D3, now
on the body row's `channels`), the no-time-capture property of `toBodyArm`, and
the by-reference world-arm return in `foldToWorld`.

**Verify:** `npm run typecheck`; full `npm test` (count compared against Task 0's,
plus exactly the tests this plan names); `npm test -- oneTagReader noStoredRegimeFlag oneMpcSeam frameFilePurity`;
`git status --porcelain tests/fixtures/camera/` empty. Demonstrate the ratchet
fails by temporarily re-adding a `=== 'absolute'` to a swept file, then revert.

**Commit:** `test(camera): ratchet the rung vocabulary as the only tag reader (P5)`
plus a separate `chore(camera): deletion and comment audit over the prep branch`
if the audits change code.

---

## Site coverage

All 46 survey sites from spec §5, mapped to the task that moves them. The rows
match §5 as amended 2026-09-14 (site 25 sits in P1's `isWorldArm` sweep, and the
disengage's centre-looking post-step is called out as its own task).

| Sites                         | Becomes                                   | Task           |
| ----------------------------- | ----------------------------------------- | -------------- |
| 6, 13, 36, 40                 | `sameFrame` / `frameKey`                  | 2              |
| 29, 39                        | `frameKey` (display)                      | 2              |
| 14, 15, 17, 18, 20–24, 32, 33 | `isWorldArm`                              | 3              |
| 25                            | `isWorldArm`                              | 3              |
| —                             | row / ctx / host types                    | 4              |
| —                             | `CAMERA_RUNGS`, `rowFor`, `hostOf`, …     | 5              |
| 1, 16, 30, 31                 | `foldToWorld`                             | 6              |
| 4, 9, 11, 27, 34, 37, 38      | `hostOf` / `hostOrThrow`                  | 7              |
| (part of 3)                   | `centreLookingArm` (**D2**)               | 8              |
| 7                             | `engage` / `release` + `stepRung`         | 9, 10 (delete) |
| 3, 5                          | `fromParent` / `toParent` via `stepRung`  | 10             |
| 2                             | `hostOf(frame)?.id ?? focusBodyId`        | 11             |
| 8, 10, 12                     | `rowFor(frame).step`                      | 13             |
| 19                            | `rowFor(frame).channels.decode`           | 15             |
| 26                            | `channels` cells (file deleted)           | 6, 7, 15, 16   |
| 42                            | `decode → foldToWorld → encode` (**D3**)  | 16             |
| 28, 35, 41, 43, 44, 45, 46    | unchanged — constructors and pass-through | —              |

## Definition of Done

**Deliverable inventory**

- [ ] `src/services/engine/camera/rungs/` exports exactly: `rungKindOf`,
      `frameKey`, `sameFrame`, `isWorldArm`, `cameraRungs` (`CAMERA_RUNGS`),
      `absoluteRung`, `bodyRung`, `rowFor`, `climbRowFor`, `hostOf`,
      `hostOrThrow`, `refoldTo`, `foldToWorld`, `stepRung` — one symbol per file,
      filename = symbol, so each row lives in its own file (`bodyRung.ts` exports
      `bodyRung`) and `cameraRungs.ts` is only the table. The site-rung plan's
      `siteRung.ts` follows the same shape.
- [ ] `CAMERA_RUNGS` carries every §2.4 cell for both incumbent kinds:
      `kind`, `host`, `emptyMemory`, `step`, `channels`, and on the body row
      `parent`, `toParent`, `fromParent`, `engage`, `release`.
- [ ] `PoseFrame` and `FramedCameraPose` are **derived** from `RungKind` and
      spell exactly what they spell on `main`.
- [ ] Deleted: `regimeArmFor.ts`, `resolveWorldArm`, `clipFrameChannels.ts`,
      `SurfaceMemory.d.ts`, `evaluateClip`'s `frameKeyOf`,
      `cameraDebugSnapshotOf`'s local `sameFrame`, `CameraStateSection`'s
      `frameLabel`, `replayInput`'s `routeToSurface`, and both `!` host
      assertions in `projectFramePose`.
- [ ] `tests/services/engine/camera/oneTagReader.test.ts` exists, allow-lists
      only `src/services/engine/camera/rungs/`, and has been shown to fail when a
      tag comparison is added outside it.

**Behaviour bar — the prep's whole safety argument**

- [ ] `tests/fixtures/camera/driverGoldenTrace.json` and
      `settleGoldenTrace.json` are **byte-identical to `origin/main`**:
      `git diff origin/main...HEAD -- tests/fixtures/camera/` is empty. If either
      was re-recorded, the commit body carries a parse-compared cell diff and the
      user has ruled on it.
- [ ] `tests/services/engine/frame/poseFold.test.ts` is unmodified except for
      mechanical argument-shape updates; **no assertion changed**.
- [ ] `noStoredRegimeFlag.test.ts` green with `ALLOW_LIST` still empty.
- [ ] `frameFilePurity.test.ts` green with `frame/projectFramePose` at ≤ 1.
- [ ] `oneMpcSeam.test.ts` green — no new importer of `SCALE_UNITS` appeared in
      the camera path.
- [ ] `logCameraState`'s `frame` field is the only behavioural string change in
      the PR, and its test was updated in the same commit that made it.

**Named observable behaviours (manual pass, one session)** — prep is invisible by
construction, so this is a "nothing moved" check, each recorded in the user's own
words:

- [ ] Fly to Earth from deep space: the engage feels as it does on `main`, with
      no snap at the crossing and no rolling horizon appearing.
- [ ] Zoom back out past the disengage edge: no pop, no eye jump inward.
- [ ] Drag/orbit/tilt at Earth's surface, release, re-drag: the remembered tilt
      survives, and it still wipes on a switch to another body.
- [ ] Play a body-framed clip leg and an absolute one: both play as on `main`.
- [ ] The debug panel's Camera section shows `body:earth` / `absolute` and no
      ARM MISMATCH badge through an engage/disengage cycle.

**Deferral boundary — do not chase these**

- The `{ site }` rung, `SitePose`, the bounding-radii band, the turntable
  register, the site channels, the two new `CameraTuning` fields and their
  sliders: all of it is the feature PR.
- The focus-**subtree** rule and the approach-owns-the-rung gate (§4.8).
- A URL-hash pose codec (§1 non-goal; backlogged).
- The atmosphere-over-rover `FRAME_ORDER` stopgap (§1 non-goal).
- Rung-generic follow/approach drivers.
- Any renderer, shader or slab change.
- `pivotRadiusMpc`'s mesh-body `null` (spec §0's second premise correction) —
  it is the feature's input, not prep's to change.
