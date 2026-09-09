# cameraRuntime single-writer — implementation plan

> **Spec.** [`specs/2026-09-01-camera-pivot.md`](../specs/2026-09-01-camera-pivot.md),
> section **"Ground preparation — cameraRuntime single-writer (2026-09-09)"** — the
> binding authority for the shape. The checkpoint it was written from
> (`.superpowers/sdd/2026-09-01-camera-pivot/runtime-refactor-ground.md`) is signed
> off: shape approved, all five preps land as commits on PR #647, elapsed-unit
> unification goes in P1.
> **Supersedes.** Task 18 of [`2026-09-01-camera-pivot.md`](2026-09-01-camera-pivot.md)
> ("clock and frame-loop integration"). Its three tests are carried forward verbatim
> into Task 17 here, on the post-refactor shape. Tasks 19–22 stay in the parent plan.
> **Execution.** `subagent-driven-development` per
> [`conventions/sdd-execution.md`](../conventions/sdd-execution.md) — task list before
> Task 1, pipelined reviews, ledger archived on Finish. Ledger:
> `.superpowers/sdd/2026-09-01-camera-pivot/progress.md`.
> **Style.** [`conventions/plan-style.md`](../conventions/plan-style.md) — contract
> code only. Every line reference below points at `1d44398e5`; read the current file
> before editing it.

## Goal

`state.cameraRuntime` becomes a value with one writer. Today it is a bag of six
`{ current }` boxes written from eleven sites across five files, plus a mutable
`CameraClock` captured by reference by the clip player. `runFrame` ends the plan
holding exactly one assignment (`state.cameraRuntime = next`) and one dispatch loop,
fed by a pure `stepCameraRuntime`. The two features that motivated it — the parent
plan's T18 clock verification and R14-3's follow-driver split — then land as growth
in Phase 6 rather than as two more writers.

## Architecture

Five groups by lifetime and owner (`register` / `epochs` / `follow` / `surface` /
`outputs`), five pure stages in a fixed order, actions returned rather than
dispatched mid-step. The full type and stage list is the spec section; do not
re-derive them here, and do not deviate from them without a ruling.

Three properties carry the whole design and every task below leans on one of them:

1. **`advanceEpoch` is idempotent for an unchanged ref.** A second call in the same
   frame cannot mean a second reset, because nothing mutates. That is what retires
   the "safe to re-call" guards at `runFrame.ts:149-151,166` and the second clock
   touch at `applyWheelZoom.ts:39` without needing a call-count discipline.
2. **Effective intent.** Stages after `replayInput` read
   `cameraReducer(intent, actionsSoFar)`, reproducing exactly what
   `runFrame.ts:117`'s post-drain `getState()` gives the driver table today.
3. **Structural sharing.** A stage returns its input group by identity when nothing
   changed, so `prev.surface === next.surface` is a free "did this frame touch it"
   test — used by the guard and by the harness freeze.

## Tech stack

TypeScript + Vitest. No new dependencies. `ts-morph` is already a devDependency
(`tests/services/engine/camera/oneMpcSeam.test.ts`) and is the guard test's engine.
No renderer, shader, `.wesl` or GPU file is touched by any task in this plan.

## Global constraints

Binding on every task; do not restate them in commit messages.

- **Byte bar.** `tests/services/engine/frame/settleGoldenTrace.test.ts` and the
  Task 1 driver leg must pass **unmodified** at the end of every task. Re-recording
  a golden fixture (`SETTLE_GOLDEN_RECORD=1`) is forbidden in this plan: there is no
  ruled behaviour change in it. A task that cannot hold the trace is a task that
  found a real behaviour difference — **stop and report it**, do not re-record.
- `npm test` and `npm run typecheck` green at the end of every task.
- **No behaviour change.** This is a refactor. If a task changes a rendered pixel,
  a dispatched action, or the order actions reach the store within a frame, it is
  wrong. The one accepted difference, ruled at the checkpoint: from Task 13 on,
  store listeners see the frame's runtime already installed when the frame's actions
  arrive (they run after `state.cameraRuntime = next`, not before).
- **Every file/symbol move, rename or deletion goes through the refactor CLI** —
  `npm run refactor -- move <from> <to>`, `npm run refactor -- rename <sym> <new>`,
  `npm run refactor -- delete <sym>`. Each task names the subcommand in its step.
  Hand-editing import paths after a move is always wrong
  (`.claude/skills/refactor/SKILL.md`).
- `type` aliases, never `interface`. One exported type per file in `src/@types/`, one
  exported function per file in `src/utils/`. `src/services/**` files may export a
  small related set (`cameraEpochs.ts` and `surfaceStep.ts` are the two here).
- Comments per [`conventions/comments.md`](../conventions/comments.md): module header
  ≤ 10 lines, comment lines ≤ half the code lines, **checked on every file a task
  touches** (the branch was already audited to that budget — do not regress it).
  Every landmine comment being deleted from a site must land at the site that
  inherits the fact, or be deliberately dropped with a reason in the review package.
- Tests per [`conventions/testing.md`](../conventions/testing.md). Specifically:
  **no** runtime tests of the new `.d.ts` shapes, **no** restatement of driver
  priorities or `FOCUS_TWEEN_MS`, **no** mirror tests. The one permitted structural
  test is the Task 16 guard (a cross-file contract with no behavioural expression,
  the same keep-rule `oneMpcSeam.test.ts` cites).

## Parallelism

The executor asks the user for a parallelism level before Task 1. Tasks marked
**‖** have file sets disjoint from the tasks they are grouped with and may run in
their own worktrees, cherry-picked onto the execution branch. Everything else is
strictly sequential: it edits `runFrame.ts`, `drainInput.ts`, `cameraDrivers.ts` or
the harness, which every other task also reads.

- **‖ group A:** Task 1, Task 2, Task 10 (all create-only, no shared file).
- **‖ group B:** Task 20, Task 21 (an audit pass and a docs pass).
- All others sequential, in number order.

---

## Phase 0 — the byte bar

### Task 1: driver/epoch golden leg + perf baseline ‖

The existing bar covers the settle mechanisms through a gesture script only. Nothing
pins the driver arbitration, the five epochs, or the action stream — which is exactly
what Phases 1–5 move. This task adds the missing leg before anything changes.

**Files (create):** `tests/services/engine/frame/driverGoldenTrace.test.ts`,
`tests/fixtures/camera/driverGoldenTrace.json`
**Files (read, do not modify):** `tests/services/engine/frame/settleGoldenTrace.test.ts`
(the record/thin/compare shape to copy), `tests/helpers/camera/makeCameraSimHarness.ts:84-95`

**What the fixture records, per recorded frame** (the contract — not the code):

| field                   | source                                                                       |
| ----------------------- | ---------------------------------------------------------------------------- |
| `label`                 | the script leg                                                               |
| `winner`                | the winning driver id that frame                                             |
| `displayed`, `register` | pose numbers to 12 significant digits, as `settleGoldenTrace`                |
| `follow`                | `from.distance`, `distanceTarget`, `panOffset` (nulls recorded as `null`)    |
| `epochs`                | each row's `startMs` **relative to script start**, and whether `ref` is null |
| `actions`               | the action `type` strings dispatched during that frame, **in order**         |

The action stream is the load-bearing column: Phase 4 moves _when_ dispatch happens,
and this is what proves the _what_ and the _order_ did not move with it.

**Script legs** (each must be reachable — assert the winner it names, the way
`settleGoldenTrace.ts:222` asserts its gesture mode, or the leg is silently vacuous):

- boot world-armed at h/R 5, resting;
- focus Earth → the follow approach easing to framing;
- one at-rest wheel notch **mid-approach** (the notch the follow driver swallows —
  `applyWheelZoom.ts:32-35`, and `drainInput.ts:230-255`'s roll ride);
- `autoRotate` on, then a notch under it (`applyWheelZoom.ts:36-41`);
- a focus tween dispatched and run to completion (the `cancelCameraTween` edge);
- a **looping** clip run past its duration so `clipPlayer.ts:262-273` rewinds once;
- clip end, `autoRotate` off, focus cleared.

- [ ] Write the test with the record path (`DRIVER_GOLDEN_RECORD=1`) and the compare
      path, mirroring `settleGoldenTrace.test.ts`'s `thin` / `expectTraceMatches`.
- [ ] Record the fixture; `npm test -- driverGoldenTrace` green.
- [ ] **Mutation-verify it has teeth**: temporarily change one driver priority, one
      epoch reset condition, and the dispatch order in `drainInput`; each must fail
      the trace. Record which cells moved, in the ledger. Revert.
- [ ] Read `.claude/skills/perf/SKILL.md`. Start **this worktree's** dev server and
      run `npm run perf -- --url http://localhost:<its own port>` — a run without
      `--url` silently measures another branch's server.
- [ ] Record the full MERGED / PER-LAYER / FLOOR output verbatim in the ledger under
      `Task 1 baseline` (Task 19 diffs against it; a summary is not comparable).
- [ ] Commit: `test(camera): golden trace leg for drivers, epochs and the action stream`.

---

## Phase 1 — P1: epochs (J2, J6)

Ends with `CameraClock` deleted, five epochs advanced through one pure primitive, and
the clip player holding no reference into the runtime.

### Task 2: `Epoch` / `CameraEpochs` types and the two pure primitives ‖

No consumer. New files and their test only.

**Files (create):** `src/@types/engine/camera/Epoch.d.ts`,
`src/@types/engine/camera/CameraEpochs.d.ts`,
`src/services/engine/camera/cameraEpochs.ts`,
`tests/services/engine/camera/cameraEpochs.test.ts`

**Interfaces (produces):**

```ts
export type Epoch<Ref> = { readonly ref: Ref | null; readonly startMs: number | null };

export type CameraEpochs = {
  readonly tween: Epoch<CameraTweenDescriptor>;
  readonly frameTween: Epoch<FrameTween>;
  readonly autoRotate: Epoch<FramedCameraPose>;
  readonly follow: Epoch<SelectionRow>;
  readonly clip: Epoch<NonNullable<CameraState['clip']>>;
};

export function advanceEpoch<Ref>(prev: Epoch<Ref>, ref: Ref | null, nowMs: number): Epoch<Ref>;
export function elapsedMs<Ref>(epoch: Epoch<Ref>, nowMs: number): number;
```

**Behaviour** (from `cameraClock.ts:36-110`, which stays in place this task):
`advanceEpoch` returns `prev` **by identity** when `ref === prev.ref`; otherwise
`{ ref, startMs: ref === null ? null : nowMs }`. `elapsedMs` returns `0` for a null
`startMs`, else `nowMs - startMs`. Milliseconds, always — the `autoRotate` row's
`ref` is `active ? base : null`, folding `lastAutoRotateActive` and `lastBaseRef`
(`CameraClock.d.ts:16,18,30`) into one reset condition.

- [ ] Failing test `advanceEpoch returns the same object when the ref is unchanged`
      (assert `toBe`, not `toEqual` — structural sharing is the contract Task 15 and
      Task 16 rely on).
- [ ] Failing test `advanceEpoch restarts the clock on a ref change` and
      `…clears startMs when the ref goes null`.
- [ ] Failing test `a second advance in the same frame is a no-op` — advance twice
      with the same ref at two different `nowMs`, assert `elapsedMs` measures from
      the first. This is the property that lets Task 4 delete the second-call guards.
- [ ] Failing test `elapsedMs of an unstarted epoch is 0`.
- [ ] `npm test -- cameraEpochs` red → implement → green.
- [ ] Commit: `feat(camera): pure Epoch primitives beside the camera clock`.

### Task 3: `advanceEpochs` — the five rows in one call

**Files (modify):** `src/services/engine/camera/cameraEpochs.ts`,
`tests/services/engine/camera/cameraEpochs.test.ts`

**Interfaces (produces):**

```ts
export function advanceEpochs(
  prev: CameraEpochs,
  inputs: {
    readonly intent: CameraState;
    readonly focus: SelectionRow | null;
    readonly clip: Epoch<NonNullable<CameraState['clip']>>;
    readonly winnerId: string;
    readonly nowMs: number;
  },
): CameraEpochs;
```

**The eligibility rule, and why it is not "advance everything".** Today three of the
five reset only on the frame their driver _wins_, because `elapsedForWinner`
(`cameraDrivers.ts:52-64`) is their only caller. A tween dispatched while a drag
holds starts its ease when the drag ends, not when it was dispatched. Advancing
unconditionally would burn that ease. So the row's live ref is consulted only when
its owner is eligible, otherwise the row is returned unchanged:

| row          | eligible when                                                            | live ref                                        |
| ------------ | ------------------------------------------------------------------------ | ----------------------------------------------- |
| `tween`      | `winnerId === 'tween'`                                                   | `intent.tween`                                  |
| `autoRotate` | `winnerId === 'autoRotate'`                                              | `intent.autoRotate.active ? intent.base : null` |
| `follow`     | `winnerId` is a follow row                                               | `focus`                                         |
| `frameTween` | always (`resolveFrameBasis.ts:90` runs every frame)                      | `intent.frameTween`                             |
| `clip`       | never — the row is `inputs.clip`, already advanced by its owner (Task 5) | —                                               |

Express it as a row table, not a chain of `if (winnerId === …)`
([`simplicity.md`](../conventions/simplicity.md) §7). Returns `prev` by identity when
no row moved.

- [ ] Failing test `a tween that is not winning does not start its epoch` — the
      regression the eligibility table exists to prevent.
- [ ] Failing test `the frameTween epoch advances on a frame no driver owns it`.
- [ ] Failing test `an unchanged frame returns the same epochs object` (`toBe`).
- [ ] Failing test `the clip row is passed through untouched`.
- [ ] `npm test -- cameraEpochs` red → implement → green.
- [ ] Commit: `feat(camera): advanceEpochs — one advance site per epoch per frame`.

### Task 4: migrate every clock reader onto the epochs

The mechanical swap. `CameraRuntime.clock` becomes `epochs: CameraEpochs` plus
`follow: FollowMemory | null` — the three follow fields are regrouped now (so P2 only
has to change _who writes them_, not _where they live_) and are still written in
place by the same three sites.

**Files (create):** `src/@types/engine/camera/FollowMemory.d.ts`
**Files (modify):** `src/@types/engine/state/CameraRuntime.d.ts:12,20`,
`src/services/engine/camera/cameraDrivers.ts:24,52-79,141,157-187`,
`src/services/engine/camera/applyWheelZoom.ts:12,21-42`,
`src/services/engine/camera/resolveFrameBasis.ts:79-94`,
`src/services/engine/frame/runFrame.ts:33,132,141-172,209-216`,
`src/services/engine/frame/drainInput.ts:136-141,193,240`,
`src/services/engine/helpers/shouldKeepTicking.ts:113-116`,
`src/services/engine/engine.ts:114`, plus the 19 test files that build a
`cameraRuntime` literal and the 4 that touch clock fields — the full list is
`.superpowers/sdd/2026-09-01-camera-pivot/runtime-trace.md` §7.
**Files (delete):** `src/services/engine/camera/cameraClock.ts`,
`src/@types/engine/camera/CameraClock.d.ts`,
`tests/services/engine/camera/cameraClock.test.ts` (its coverage now lives in
`cameraEpochs.test.ts`; re-home anything it asserts that Task 2/3 do not).

**Interfaces (produces):**

```ts
export type FollowMemory = {
  readonly from: CameraPose | null;
  readonly distanceTarget: number | null;
  readonly panOffset: Vec3;
};
```

**Contracts to preserve, each already load-bearing:**

- `runFrame.ts:152-161` and `:167-172` stop re-calling an elapsed fn and read
  `elapsedMs` off the epoch the step already advanced. The "re-calling is safe"
  comments go with the calls — the fact is now in `advanceEpoch`'s idempotence test.
- `applyWheelZoom` loses its `clock` parameter and takes
  `autoRotateElapsedMs: number` instead (computed by the caller from
  `advanceEpoch(prev.epochs.autoRotate, …)`); the follow branch at `:32-35` is
  untouched this task beyond reading `runtime.follow`.
- `followElapsed`'s side effect (`cameraClock.ts:97-110`: nulling `followFrom` /
  `followDistanceTarget` and zeroing `panOffset` on a focus-row change) is **not** an
  epoch concern. It becomes one line in `runFrame` beside the advance:
  `if (next.epochs.follow.ref !== prev.epochs.follow.ref) runtime.follow = null`.
  Task 8 moves it into the step; keep it verbatim here.
- `shouldKeepTicking.ts:114` reads `epochs.follow.startMs`.

- [ ] `npm run refactor -- refs createCameraClock` and `-- refs CameraClock` first;
      the migration list above must match what the CLI reports.
- [ ] Migrate `src/`, then the test literals. No test assertion changes: only the
      shape of the literal moves.
- [ ] `npm run refactor -- delete createCameraClock` (then `tweenElapsed`,
      `frameTweenElapsed`, `autoRotateElapsed`, `clipElapsed`, `followElapsed`), then
      `npm run refactor -- delete CameraClock`.
- [ ] `npm test` and `npm run typecheck` green; **both golden traces byte-identical**.
- [ ] Comment budget on every touched file.
- [ ] Commit: `refactor(camera): CameraClock becomes CameraEpochs + FollowMemory`.

### Task 5: the clip-player epoch handshake

Kills the one true reference capture (`engine.ts:280`).

**Files (modify):** `src/@types/engine/subsystems/ClipPlayer.d.ts:33-38`,
`src/services/engine/subsystems/clipPlayer.ts:98-104,142,241,262-273`,
`src/services/engine/engine.ts:276-282`,
`src/services/engine/frame/runFrame.ts:89`,
`tests/services/engine/animation/playClipFlyout.integration.test.ts:48-55`, plus the
clipPlayer tests under `tests/services/engine/subsystems/`.

**Interfaces (produces):**

```ts
tick(clipEpoch: Epoch<NonNullable<CameraState['clip']>>, nowMs: number): {
  readonly clipEpoch: Epoch<NonNullable<CameraState['clip']>>;
};
```

The player advances the epoch it was handed (`advanceEpoch` against
`store.getState().camera.clip`), reads elapsed off it, and returns it — rebased on a
loop wrap: `{ ...advanced, startMs: nowMs - overshootSec * 1000 }`, replacing the
in-place write at `clipPlayer.ts:270`. `ClipPlayerDeps.clock` is deleted.
`runFrame`'s first statement becomes
`const { clipEpoch } = state.subsystems.clipPlayer.tick(state.cameraRuntime.epochs.clip, nowMs);`
and `clipEpoch` is threaded to `advanceEpochs` — it must stay the **first**
statement, because a cue it fires can dispatch a `frameTween` this frame's basis
must see (`applySceneEffect`'s `frameTo`).

- [ ] Failing test `a looping clip's rewind returns a rebased epoch, not a mutated one`
      — assert the returned `startMs` and that the input epoch object is unchanged.
- [ ] Failing test `tick starts the epoch on the clip's arrival frame` (elapsed 0).
- [ ] Failing test `the player holds no reference to the runtime` — construct a
      player, replace `state.cameraRuntime` wholesale, tick, assert the returned
      epoch derives from the epoch passed in.
- [ ] Implement; `npm test -- clipPlayer playClipFlyout` green.
- [ ] Commit: `refactor(clip): clipPlayer takes and returns the clip epoch`.

### Task 6: elapsed unit unification — clip in milliseconds

Ruled at the checkpoint (option C, in P1).

**Files (modify):** `src/@types/engine/camera/CameraDriver.d.ts:8` (the
"reads it as SECONDS" line goes), `src/services/engine/camera/cameraDrivers.ts:47-51,96,101-103`,
`src/services/engine/subsystems/clipPlayer.ts:240-241,249,255,261,269`,
`tests/services/engine/camera/cameraDrivers.test.ts`.

Every consumer of the clip elapsed divides at the point of use:
`evaluateClip(clip.data, elapsedMs / 1000, …)` in the driver, `elapsedMs / 1000` for
the cue cursor and the duration compare in the player. `evaluateClip`'s own
`elapsedSec` parameter is **unchanged** — the conversion lives at its two call sites,
not inside it.

- [ ] `npm run refactor -- refs clipElapsed`-equivalent sweep: grep the branch for
      `SECONDS` in the camera path and confirm every hit is either `evaluateClip`'s
      own parameter or a comment being deleted.
- [ ] Failing test `the clip driver's pose at 1500 ms matches the pose at 1.5 s of
    clip time` — a hand-picked keyframe value, not a re-derivation through
      `evaluateClip` (that would be a mirror).
- [ ] Implement; **both golden traces byte-identical** (the clip leg from Task 1 is
      what proves the unit change is arithmetic-neutral).
- [ ] Commit: `refactor(camera): clip elapsed in ms like every other epoch`.
- [ ] **Phase gate:** `npm run typecheck`; `npm test -- cameraEpochs cameraDrivers
    clipPlayer runFrame drainInput settleGoldenTrace driverGoldenTrace` green.

---

## Phase 2 — P2: drivers return their memory (J1)

### Task 7: `DriverCtx` and the `pose(ctx, mem) → { pose, memory }` contract

**Files (create):** `src/@types/engine/camera/DriverCtx.d.ts`
**Files (modify):** `src/@types/engine/camera/CameraDriver.d.ts:14-27`,
`src/services/engine/camera/cameraDrivers.ts:36-255`,
`src/services/engine/frame/runFrame.ts:132-133`,
`tests/services/engine/camera/cameraDrivers.test.ts`,
`tests/services/engine/camera/commitOnEdge.test.ts:54-57`,
`tests/services/engine/animation/playClipFlyout.integration.test.ts:48-56`.

**Interfaces (produces):**

```ts
export type DriverCtx = {
  readonly state: RootState;
  readonly elapsedMs: number;
  readonly register: FramedCameraPose;
  readonly winnerLastFrame: string;
  readonly simDays: number;
  readonly projection: CameraProjection;
  readonly pivot: PivotFraming;
  /** This frame's at-rest wheel notch, when the follow driver owns the distance. */
  readonly zoomToFollow: number | null;
};

export type CameraDriver = {
  readonly id: string;
  readonly priority: number;
  readonly commitsOnEdge?: boolean;
  readonly pivotsOnFocusedBody?: boolean;
  isActive(s: RootState): boolean;
  pose(
    ctx: DriverCtx,
    mem: FollowMemory | null,
  ): { readonly pose: FramedCameraPose; readonly memory: FollowMemory | null };
};

export function runCameraDrivers(
  drivers: readonly CameraDriver[],
  ctx: DriverCtx,
  mem: FollowMemory | null,
): {
  readonly pose: FramedCameraPose;
  readonly winner: CameraDriver;
  readonly memory: FollowMemory | null;
};
```

`buildCameraDrivers` stops closing over `EngineState`: `orbitDrag` reads
`ctx.register` (was `state.cameraRuntime.lastPose.current`, `cameraDrivers.ts:123`),
`followBody` reads `ctx.simDays` / `ctx.projection` / `ctx.winnerLastFrame` (was
`:143,182,184`). It becomes a module-level constant table — the same move
`galaxy-field`'s stage table made (commit `0a53aef82`). Every row that does not own
memory returns the `mem` it was handed, so the winner's adoption is uniform and there
is no "does this driver have memory" branch.

`followBody`'s three writes at `:163-169`, `:180-183` and `:185` become fields of the
returned memory. Its capture rule is unchanged and still load-bearing: the capture is
eye-preserving against the **new** target (`:152-156`) — an Earth-orbit distance read
from Saturn's centre strands the camera inside Saturn.

- [ ] Failing test `the winning driver's memory is adopted and the losers' discarded`
      — two rows returning different memory, assert the winner's comes back.
- [ ] Failing test `followBody's capture is returned, not written` — call `pose`
      twice with the same frozen `mem`, assert `mem` is unmutated and both calls
      return the same capture.
- [ ] Failing test `orbitDrag produces the register handed to it in ctx`.
- [ ] Implement; both golden traces byte-identical.
- [ ] Commit: `refactor(camera): drivers take a ctx and return their memory`.

### Task 8: the swallowed wheel notch and the follow roll ride

`applyWheelZoom` stops writing. The notch a following camera swallows becomes an
input the driver consumes, and the roll ride that reads the target before and after
moves to where both values exist as data.

**Files (modify):** `src/services/engine/camera/applyWheelZoom.ts:21-42`,
`src/services/engine/camera/cameraDrivers.ts` (the `followBody` row),
`src/services/engine/frame/drainInput.ts:179-257`,
`src/services/engine/frame/runFrame.ts:132-133`,
`tests/services/engine/camera/applyWheelZoom.test.ts`,
`tests/services/engine/frame/drainInput.test.ts`.

**Interfaces (produces):**

```ts
export function applyWheelZoom(args: {
  readonly base: FramedCameraPose;
  readonly factor: number;
  readonly autoRotate: { readonly active: boolean; readonly rate: number };
  readonly autoRotateElapsedMs: number;
  readonly pivot: PivotFraming;
}): CameraPose | null;

// drainInput's return, this task only — Task 12 folds it into replayInput's.
export function drainInput(
  state: EngineState,
  deps: RunFrameDeps,
  nowMs: number,
): {
  readonly zoomToFollow: number | null;
};
```

**The route condition, unchanged from `applyWheelZoom.ts:31-35`:** the notch goes to
the follow driver exactly when `base.frame === 'absolute'` **and**
`winnerLastFrame === 'followBody'` **and** `follow?.distanceTarget !== null`. In every
other case `applyWheelZoom` behaves as today (null for a body arm, the spun-base
branch under autoRotate, the plain base otherwise). The follow driver applies
`zoomedDistance(mem.distanceTarget, ctx.zoomToFollow, ctx.pivot)` to its returned
memory.

**The roll ride** (`drainInput.ts:230-255`) moves to `runFrame`, immediately after
`runCameraDrivers` and **before** the register write at `:310-312` — so its
`authoredWorldPose(state)` read still sees the same register value it sees today.
Its pre/post pair is now `prev.follow.distanceTarget` and the adopted memory's, which
removes the read-mutate-read through the clock that the current site depends on. It
must not re-derive `zoomedDistance` itself — a second copy of that formula is a mirror.

- [ ] Failing test `a notch under follow lands on the driver's distance target, not
    the base` — assert the committed base is unchanged and the produced distance moved.
- [ ] Failing test `the follow roll ride fires on the notch's target change` — assert
      the same `commitCameraPose` roll value the current fixture pins, from the new site.
- [ ] Failing test `applyWheelZoom writes nothing` — pass a frozen argument bag.
- [ ] Implement; both golden traces byte-identical (Task 1's mid-approach notch leg
      is the one that proves it).
- [ ] Commit: `refactor(camera): the follow driver owns the notch it swallows`.

### Task 9: the pan offset leaves `drainInput`'s hand

**Files (modify):** `src/services/engine/frame/drainInput.ts:131-142`,
`src/services/engine/frame/runFrame.ts:205-216`,
`tests/services/engine/frame/drainInput.test.ts`.

`drainInput`'s return grows `follow: FollowMemory | null`; the strafe accumulation at
`:137-141` produces a new `panOffset` in it instead of assigning through
`state.cameraRuntime.follow`. `runFrame` assigns the returned memory once, before the
driver call. The world-frame rationale at `CameraClock.d.ts:29` (a stable screen
strafe at follow scales, no camera-basis re-projection) moves to `FollowMemory`.

- [ ] Failing test `a pan strafe under follow returns a new offset and mutates nothing`
      — frozen input memory.
- [ ] Implement; golden traces byte-identical.
- [ ] Commit: `refactor(camera): the drain returns the follow memory it changed`.
- [ ] **Phase gate:** `npm run typecheck`; `npm test -- cameraDrivers applyWheelZoom
    drainInput commitOnEdge playClipFlyout settleGoldenTrace driverGoldenTrace` green.

---

## Phase 3 — P3: surface memory as data (J4)

### Task 10: `SurfaceMemory`, `surfaceStep`, `noteBody` ‖

New files beside the incumbent controller; no caller migrates yet.

**Files (create):** `src/@types/camera/SurfaceMemory.d.ts`,
`src/services/camera/surfaceStep.ts`,
`tests/services/camera/surfaceStep.test.ts`
**Files (read):** `src/services/camera/surfaceController.ts:27-118` — the body is
lifted verbatim; only the three closure variables become fields.

**Interfaces (produces):**

```ts
export type SurfaceMemory = {
  readonly gesture: SurfaceGesture | null;
  /** Pointer down: `gesture` stays null until the first drag step carries the press pixel. */
  readonly pointerDown: boolean;
  readonly rememberedTiltRad: number;
  readonly memoryBodyId: string | null;
};

export function surfaceStep(
  prev: SurfaceMemory,
  arm: BodyFixedPose,
  step: InputStep,
  ctx: {
    readonly viewportPx: Readonly<Vec2>;
    readonly fovYRad: number;
    readonly bodyRadiusM: number;
    readonly sceneUpLocal: Readonly<Vec3>;
  },
): { readonly pose: BodyFixedPose; readonly next: SurfaceMemory };

export function noteBody(prev: SurfaceMemory, bodyId: string | null): SurfaceMemory;
```

`{ gesture, pointerDown }` replaces the nested `live: { gesture } | null`. The
nesting existed to make "latched with the pointer up" (FW-C's trackpad burst)
unrepresentable; the flat pair does not, so `surfaceStep` must **assert the
invariant** rather than trust it: a `drag` step with `pointerDown === false` returns
`arm` untouched, exactly as `surfaceController.ts:68` does today. Say that in the
header in one line — it is the fact the shape change gives up.

- [ ] Failing test `a drag with the pointer up is declined` (FW-C).
- [ ] Failing test `a tilt drag writes the un-mapped memory and returns a new object`
      — frozen `prev`.
- [ ] Failing test `noteBody wipes the tilt on a different body and keeps it on null`
      (ruling 18).
- [ ] Failing test `a zoom step never authors tilt` — the fixed-point property at
      `surfaceController.ts:103-108`, asserted as "memory unchanged", not as a formula.
- [ ] Implement; `npm test -- surfaceStep` green.
- [ ] Commit: `feat(camera): surface gesture memory as data`.

### Task 11: migrate the callers, delete the controller

**Files (modify):** `src/@types/engine/state/CameraRuntime.d.ts:60-64`,
`src/services/engine/frame/drainInput.ts:72-79,149,170`,
`src/services/engine/frame/runFrame.ts:223-229,237`,
`src/services/engine/engine.ts:129,639,641`,
`tests/helpers/camera/makeCameraSimHarness.ts:17,92`,
`tests/helpers/camera/seedRememberedTilt.ts:20-50`,
`tests/services/camera/surfaceController.test.ts`,
`tests/services/camera/{rememberedTilt,northUpToggle,singularLocusRecession}.test.ts`,
`tests/services/engine/frame/settleGoldenTrace.test.ts:29,112,181`
**Files (delete):** `src/services/camera/surfaceController.ts`,
`src/@types/camera/SurfaceController.d.ts`.

`runtime.surface` becomes a `SurfaceMemory` value. `onGestureStart` / `onGestureEnd`
become `{ ...prev, pointerDown: true/false, gesture: null }` at the two `drainInput`
sites. The debug snapshot at `engine.ts:639-641` reads
`state.cameraRuntime.surface.gesture` and `.rememberedTiltRad` directly —
`CameraDebugSnapshot`'s `gesture` field keeps its shape, so `cameraDebugSnapshotOf`'s
signature does not move. `seedRememberedTilt` threads the memory through its loop
instead of calling six methods on a closure.

- [ ] Migrate; `npm run refactor -- delete createSurfaceController` then
      `npm run refactor -- delete SurfaceController`.
- [ ] `npm test` green with **no assertion changes** in the four surface test files —
      only the driving shape moves. An assertion that has to change is a behaviour
      difference: stop and report.
- [ ] `settleGoldenTrace` byte-identical (it reads the tilt memory at `:181`).
- [ ] Comment budget on every touched file.
- [ ] Commit: `refactor(camera): delete the surface controller closure`.
- [ ] **Phase gate:** `npm run typecheck`; `npm test -- surfaceStep surfaceController
    rememberedTilt northUpToggle singularLocus drainInput runFrame settleGoldenTrace
    driverGoldenTrace` green.

---

## Phase 4 — P4: pure input replay (J5, option A)

### Task 12: `replayInput`

**Files (create):** `src/services/engine/camera/replayInput.ts`,
`tests/services/engine/camera/replayInput.test.ts`
**Files (modify):** `src/services/engine/frame/drainInput.ts` (becomes the thin
caller: drain the aggregator, call `replayInput`, assign, dispatch),
`tests/services/engine/frame/drainInput.test.ts`.

**Interfaces (produces):**

```ts
export function replayInput(
  prev: {
    readonly register: FramedCameraPose;
    readonly surface: SurfaceMemory;
    readonly follow: FollowMemory | null;
  },
  steps: readonly InputStep[],
  ctx: {
    readonly rootState: RootState;
    readonly nowMs: number;
    readonly canvasPx: Vec2;
    readonly projection: CameraProjection;
    readonly upBasis: Mat3;
    readonly poseBasis: Mat3;
    readonly bodies: ReadonlyMap<BodyId, BodyState>;
    readonly winnerLastFrame: string;
    readonly autoRotateEpoch: Epoch<FramedCameraPose>;
  },
): {
  readonly register: FramedCameraPose;
  readonly surface: SurfaceMemory;
  readonly follow: FollowMemory | null;
  readonly lastZoomFactor: number | null;
  readonly zoomToFollow: number | null;
  readonly autoRotateEpoch: Epoch<FramedCameraPose>;
  readonly actions: readonly UnknownAction[];
};
```

Four contracts the current file gets from the store and must now get from the fold:

- **`store.getState()` per step** (`drainInput.ts:52,96,158,190`) becomes
  `cameraReducer(ctx.rootState.camera, actionsSoFar)` folded into a
  `{ ...rootState, camera }` snapshot. A step in the same drain must see the previous
  step's commit — that is what `:52`'s fresh read buys today.
- **Every step writes the register** (`:80-83`) so a later step in the same drain
  chains from it. The fold's accumulator carries it; no step reads `prev.register`
  except the first.
- **The at-rest notch's commit is its gesture end** (`:88-91`) — identity-gated
  (`next !== from`), because a declined step returns its input by reference.
- **`autoRotateEpoch` in and out.** The autoRotate zoom branch needs elapsed _this_
  frame; replay advances the row itself and returns it, and Task 15 hands it to
  `advanceEpochs`, whose second advance is a no-op by Task 2's idempotence. This is
  the one epoch touched outside `advanceEpochs`, and it is safe for exactly that
  reason — not by a call-count convention.

`beginDrag` / `cancelCameraTween` stay at DOM time in the `wireInput` emit sink
(`drainInput.ts:8-9`): a cancel must not outlive the tween a double-click starts in
the gap. They are **not** replay actions.

- [ ] Failing test `replayInput mutates nothing` — deep-frozen `prev` and `steps`.
- [ ] Failing test `a step sees the commit dispatched by the step before it` — an
      at-rest notch followed by a drag in one drain.
- [ ] Failing test `the returned actions are the four dispatch sites, in order` —
      `commitCameraPose` at the at-rest body notch, at gesture end, `endDrag` after
      it, and the roll-only follow notch.
- [ ] Failing test `a declined step emits no action` (the identity gate).
- [ ] Implement; `npm test -- replayInput drainInput` green; golden traces identical.
- [ ] Commit: `refactor(camera): replayInput is pure and returns its actions`.

### Task 13: effective intent, and dispatch after the write

**Files (modify):** `src/services/engine/frame/runFrame.ts:111-133`,
`tests/services/engine/frame/runFrame.test.ts`
**Files (delete):** `src/services/engine/frame/drainInput.ts` (its remaining body is
three lines in `runFrame`; the aggregator drain moves there).

`runFrame` calls `replayInput`, assigns the returned register/surface/follow, **then**
dispatches the actions, then builds the effective root state for the driver stage:

```ts
const camera = actions.reduce(cameraReducer, rootState.camera);
const effective = camera === rootState.camera ? rootState : { ...rootState, camera };
```

`cameraReducer` is `cameraSlice`'s default export. Non-camera actions passed through
it are no-ops (RTK reducers ignore unknown types), so the fold stays total and the
`engineScaleChanged` / `engineBodyDistanceReported` dispatches later in the frame need
no special case. This preserves what `runFrame.ts:117`'s post-drain `getState()` gives
the driver table today — most importantly `endDrag`, without which `orbitDrag` wins
one frame too long.

- [ ] Failing test `the driver table sees a commit the same frame the drain made it`
      — the at-rest notch under the resting driver; assert the produced pose is the
      committed one, not the pre-commit base.
- [ ] Failing test `a frame with no input reuses the store snapshot by identity`
      (`toBe`) — the reducer fold must not allocate on steady frames.
- [ ] Failing test `the frame's actions reach the store in the same order as before`
      — a middleware recorder over one mixed frame, compared against the Task 1
      fixture's `actions` column.
- [ ] `npm run refactor -- delete drainInput` after the body has moved.
- [ ] Implement; both golden traces byte-identical.
- [ ] Commit: `refactor(camera): effective intent, dispatch after the register write`.
- [ ] **Phase gate:** `npm run typecheck`; `npm test -- replayInput runFrame
    settleGoldenTrace driverGoldenTrace` green.

---

## Phase 5 — P5: the runtime as a value (J3, J7, G)

### Task 14: the five groups, boxes removed

Mechanical and wide. `runFrame` still writes fields individually at the end of this
task; Task 15 collapses those writes into one.

**Files (create):** `src/@types/engine/state/FrameOutputs.d.ts`,
`src/services/engine/camera/seedCameraRuntime.ts`,
`tests/services/engine/camera/seedCameraRuntime.test.ts`
**Files (modify):** `src/@types/engine/state/CameraRuntime.d.ts` (whole file),
`src/services/engine/engine.ts:113-131,453-459,625-641`,
`src/services/engine/phases/wireInput.ts:119-123`,
`src/services/engine/frame/runFrame.ts` (every `.current`),
`src/services/engine/camera/{liveUpBasisQuat,cameraDrivers,replayInput}.ts`,
`src/services/engine/helpers/{liveWorldPose,authoredWorldPose,liveRenderCamera,shouldKeepTicking}.ts`,
`src/services/engine/frame/{pickFrameContext,skyCubemapFaceContext}.ts`,
`src/services/engine/wiring/buildDemandCtx.ts`,
`src/services/engine/effects/makeReconcileEffects.ts`,
`src/services/engine/animation/{playClip,applySceneEffect}.ts`,
plus the 19 test literals and the 2 box-capturing `simulateFrame` helpers
(`commitOnEdge.test.ts:54`, `playClipFlyout.integration.test.ts:48`) and
`makeCameraSimHarness.ts:84-95,117-121` — full list in `runtime-trace.md` §1 and §7.

**Interfaces (produces):** the `CameraRuntime` / `FrameOutputs` types exactly as the
spec section states them, plus

```ts
export function seedCameraRuntime(args: {
  readonly committed: FramedCameraPose;
  readonly projection: CameraProjection;
}): CameraRuntime;
```

Field mapping, so nothing is invented: `lastPose` → `register.pose`; `prevActiveId`
→ `register.winner`; `displayedPose` → `outputs.displayed`; `lastRenderedSimDays` →
`outputs.simDays`; `upBasis` → `outputs.upBasis`; `projection` → `outputs.projection`;
`lastZoomFactor` → `outputs.lastZoomFactor`.

`seedCameraRuntime` replaces **both** seed sites: the literal at `engine.ts:113-131`
and the four writes at `wireInput.ts:119-122`. The harness's `seedPose`
(`makeCameraSimHarness.ts:117-121`) dispatches the commit and then replaces the bag
through the same function.

- [ ] Failing test `seedCameraRuntime seeds displayed from the committed pose` — the
      "nothing has been projected yet" invariant at `engine.ts:118-121`.
- [ ] Failing test `the seed copies the committed pose` — mutate the input, assert the
      runtime is unaffected (today's `{ ...base }` at `engine.ts:117`).
- [ ] Migrate `src/`, then tests. No assertion changes.
- [ ] `npm test` green; both golden traces byte-identical.
- [ ] Comment budget: `CameraRuntime.d.ts`'s header loses the `{ current }` paragraph
      and keeps the R12b-1 authored-vs-displayed contract, which is still load-bearing.
- [ ] Commit: `refactor(camera): cameraRuntime as five value groups`.

### Task 15: `stepCameraRuntime` — one assignment, one dispatch loop

**Files (create):** `src/services/engine/camera/stepCameraRuntime.ts`,
`src/services/engine/frame/projectFramePose.ts`,
`src/services/engine/camera/commitOnEdge.ts`,
`tests/services/engine/camera/stepCameraRuntime.test.ts`
**Files (modify):** `src/services/engine/frame/runFrame.ts:99-133,140-172,174-312`,
`src/services/engine/camera/cameraFraming.ts:45` (add `NEAR_CLIP_MPC = 0.01`, the
literal at `:89` and its two copies at `engine.ts:114` and the harness),
`tests/services/engine/frame/{runFrame,poseFold}.test.ts`.

**Interfaces (produces):**

```ts
export type StepInputs = {
  readonly nowMs: number;
  readonly simDays: number;
  readonly rootState: RootState;
  readonly focus: SelectionRow | null;
  readonly canvasPx: Vec2;
  readonly steps: readonly InputStep[];
  readonly bodies: ReadonlyMap<BodyId, BodyState>;
  readonly clipEpoch: Epoch<NonNullable<CameraState['clip']>>;
  readonly drivers: readonly CameraDriver[];
};

export function stepCameraRuntime(
  prev: CameraRuntime,
  inputs: StepInputs,
): {
  readonly next: CameraRuntime;
  readonly actions: readonly UnknownAction[];
  readonly requestRender: boolean;
};

export function commitOnEdge(args: {
  readonly register: FramedCameraPose;
  readonly displayed: FramedCameraPose;
  readonly produced: FramedCameraPose;
  readonly prevWinner: string;
  readonly winner: CameraDriver;
  readonly drivers: readonly CameraDriver[];
}): {
  readonly render: FramedCameraPose;
  readonly authoredOverride: FramedCameraPose | null;
  readonly actions: readonly UnknownAction[];
};

export function projectFramePose(args: {
  readonly render: FramedCameraPose;
  readonly authoredOverride: FramedCameraPose | null;
  readonly pivotsOnFocusedBody: boolean;
  readonly focus: SelectionRow | null;
  readonly simDays: number;
  readonly follow: FollowMemory | null;
  readonly surface: SurfaceMemory;
  readonly intent: CameraState;
  readonly bodies: ReadonlyMap<BodyId, BodyState>;
  readonly poseBasis: Mat3;
  readonly upBasis: Mat3;
  readonly dragging: boolean;
}): {
  readonly register: FramedCameraPose;
  readonly displayed: FramedCameraPose;
  readonly surface: SurfaceMemory;
  readonly actions: readonly UnknownAction[];
  readonly requestRender: boolean;
};
```

`projectFramePose` is `runFrame.ts:205-306` lifted whole — pin, `noteBody`, tilt
projection, `resolveWorldArm`, the regime flip and the crossing commit. **Order is the
contract** (spec §7 steps 5-6: the fold is last, below every pose writer — FW-G).
`commitOnEdge` is `runFrame.ts:186-203`, including the R12c-1 rule that a pivoting
incoming driver renders the authored register while a non-pivoting one renders the
displayed box.

`outputs.projection` is derived in-step from `inputs.canvasPx` and
`rootState.settings.camera.fovDeg` (replacing `runFrame.ts:99-103`) with
`NEAR_CLIP_MPC` / `FAR_CLIP_MPC` from `cameraFraming.ts`. `runFrame` keeps
`resizeCanvasToDisplay(deps.canvas)` — it resizes the backing store, a real side
effect that is not the camera's — and passes the resulting size in.

`runCameraDrivers` returns the winning `CameraDriver` (its `commitsOnEdge` and
`pivotsOnFocusedBody` flags are needed by the next two stages); `next.register.winner`
is `winner.id`, so the runtime stores the id and only the step handles the row.

`runFrame`'s camera section becomes: clip tick → derive sim days and bodies → step →
`state.cameraRuntime = next` → dispatch `actions` → `if (requestRender) …`. Roughly
150 lines leave the file.

- [ ] Failing test `stepCameraRuntime does not mutate prev` — deep-frozen input,
      every group.
- [ ] Failing test `an idle frame returns the epochs, surface and follow groups by
    identity` (`toBe` on all three) — structural sharing.
- [ ] Failing test `the fold runs after the pin and the tilt projection` — the FW-G
      call-order assertion the parent plan's Task 15 pinned, restated against
      `projectFramePose`'s output rather than `runFrame`'s internals.
- [ ] Failing test `the projection follows a canvas resize and a FOV change within
    the frame that caused it`.
- [ ] Implement; `npm test` green; **both golden traces byte-identical**.
- [ ] Comment budget on `runFrame.ts` (it shrinks; its header's step list must match
      the new stages, not the old numbering).
- [ ] Commit: `refactor(camera): stepCameraRuntime — one writer, one frame`.

### Task 16: the guard

**Files (create):** `tests/services/engine/frame/cameraRuntimeSingleWriter.test.ts`,
`tests/helpers/deepFreeze.ts`
**Files (modify):** `tests/helpers/camera/makeCameraSimHarness.ts:150-159`

Copy the structure of `tests/services/engine/camera/oneMpcSeam.test.ts` — ts-morph
over real AST nodes (not a source-text grep), a derived directory sweep, an explicit
"the sweep found real files" loud-failure check with known anchors, and an allow-list
whose entries are themselves asserted to be real.

**What it forbids:** any `BinaryExpression` with an `EqualsToken` whose left-hand side
is a `PropertyAccessExpression` rooted at a `.cameraRuntime` access — both
`x.cameraRuntime = …` and `x.cameraRuntime.<path> = …`.
**Allow-list:** `src/services/engine/frame/runFrame.ts` (the frame's one assignment)
and `src/services/engine/phases/wireInput.ts` (the boot seed). `engine.ts` is **not**
on it: after Task 14 it calls `seedCameraRuntime` in the state literal, which is a
call, not an assignment.
**Sweep:** `src/services`, `src/state`, `src/store`, `src/hooks`, `src/components`.
Anchors that must be present in the sweep: `runFrame.ts`, `wireInput.ts`,
`engine.ts`, `cameraDrivers.ts`, `replayInput.ts`.

The harness freeze is the runtime half of the same guard: after every `tick`,
`deepFreeze(state.cameraRuntime)`. A stray write then throws inside the suite instead
of drifting silently. `deepFreeze` walks plain objects and arrays only and skips
frozen ones, so the shared `ORIENTATION_FRAMES` entries a pose may reference are not
re-walked every frame.

- [ ] Write the gate test; confirm it **fails** with a deliberate
      `state.cameraRuntime.outputs.simDays = 0` added to a swept file, then remove it.
- [ ] Add the harness freeze; run the whole camera suite — any throw is a real second
      writer, not a test problem. Fix the writer.
- [ ] `npm test` green.
- [ ] Commit: `test(camera): gate the cameraRuntime single writer`.
- [ ] **Phase gate:** `npm run typecheck`; full `npm test` green; both golden traces
      byte-identical.

---

## Phase 6 — the features this prep was for

### Task 17: the engaged-arm clock verification (supersedes parent T18)

The parent plan's Task 18, carried forward verbatim. Its content is unchanged; what
changed is that it is now a test against a pure step rather than against a mutable
clock, so it can drive frames without a running engine.

**Files (create):** `tests/services/engine/frame/engagedArmClock.test.ts`

Spec §14's "Clock" verification, stated as an **equality, not a tolerance**: with the
sim clock at high rate and the arm engaged, a tracked ground point's body-fixed
coordinates are bit-identical across frames, because nothing in the engaged path
reads a world position.

**Tests** (names as the parent plan wrote them):

- `the tracked ground point is bit-identical across frames under a 10⁶× clock` (FW-F).
- `the engaged pose is unchanged by advancing the clock alone` — no gesture, no
  driver input, just time.
- `crossing out of the arm under an accelerated clock does not snap the image` — the
  H1 boundary; the perceptual judgement is the parent plan's Task 22 user gate.

- [ ] TDD; `npm test -- engagedArmClock` green.
- [ ] Commit: `test(camera): engaged-arm clock invariance (spec §14)`.

### Task 18: R14-3 — `followApproach` and `followHold`

**The bug** (ledger `progress.md:1129`): `autoRotate` at priority 20 outranks
`followBody` at 10, so with the spin pill on, focusing Saturn from an engaged Earth
leaves the camera at 0.2589 R♄ — **inside Saturn**, unrecoverably: toggling the pill
off does not release the arm, and 60 wheel notches reach h/R 0.0009.

**The fix** (recommended and checkpoint-approved): split the row in two.

**Files (modify):** `src/services/engine/camera/cameraDrivers.ts`,
`src/services/engine/camera/cameraEpochs.ts` (the follow row's eligibility covers
both ids), `src/services/engine/helpers/shouldKeepTicking.ts:113`,
`tests/services/engine/camera/cameraDrivers.test.ts`
**Files (create):** `tests/services/engine/frame/followApproachStrand.test.ts`

| id               | priority | active when                                                                            |
| ---------------- | -------- | -------------------------------------------------------------------------------------- |
| `followApproach` | 55       | the `followBody` conditions **and** `elapsedMs(epochs.follow, nowMs) < FOCUS_TWEEN_MS` |
| `followHold`     | 10       | the `followBody` conditions                                                            |

Both rows produce the same pose and return the same `FollowMemory`; the ease
parameter is `elapsedMs(epochs.follow, nowMs)` in both, so the hand-off at
`FOCUS_TWEEN_MS` is continuous by construction (`easeOutCubic` is saturated at 1
there). `commitsOnEdge` and `pivotsOnFocusedBody` stay set on both.

**Why 55 and not 60.** 60 is `tween`'s priority and `pickWinner`
(`cameraDrivers.ts:37-45`) breaks ties by table order — a tie is a latent
order-dependence, not a policy. 55 keeps the two relationships that matter: above
`autoRotate` (20), which is the bug; below `tween` (60), which is where `followBody`
already sits relative to an explicitly authored camera move. **Flag this at the
checkpoint** — the ledger's recommendation said 60.

- [ ] Failing test `focusing a body with autoRotate on does not strand the camera
    inside it` — the R14-3 reproduction: spin pill on, engaged over Earth, focus
      Saturn, run frames to `FOCUS_TWEEN_MS`; assert the final h/R over Saturn is the
      framing distance, not `< 1`. Must **fail before** the split and **pass after** —
      record both runs in the ledger.
- [ ] Failing test `the approach hands off to the hold with no pose discontinuity` —
      the frames either side of `FOCUS_TWEEN_MS`, asserted equal to the float floor.
- [ ] Failing test `an autoRotate spin resumes after the approach completes` — the
      thing priority 55 must not break.
- [ ] Implement; `npm test` green. **The driver golden trace WILL move** on the
      follow legs (this is the one ruled behaviour change in the plan): re-record it
      with `DRIVER_GOLDEN_RECORD=1`, diff the recorded cells, and put the diff in the
      commit body. `settleGoldenTrace` must **not** move — it never focuses under
      autoRotate.
- [ ] Commit: `fix(camera): split the follow driver so autoRotate cannot strand it (R14-3)`.
- [ ] **Phase gate:** `npm run typecheck`; full `npm test` green.

---

## Phase 7 — gate

### Task 19: measurement

**Files:** none.

- [ ] `npm run perf -- --url http://localhost:<this worktree's port>`, same flags and
      poses as Task 1. Read `.claude/skills/perf/SKILL.md` first.
- [ ] Diff against the Task 1 baseline verbatim in the ledger; interpret per the skill
      (MERGED vs PER-LAYER vs FLOOR, Apple Silicon slot-sum inflation).
- [ ] Assert the golden traces' max deviation is **0**. If any cell differs, it must
      be ≤ 1e-12 **and** carry a named arithmetic reason (an operation reordered by a
      stage boundary) in the ledger. Anything else halts.
- [ ] The work is CPU-side and allocates a handful of small objects per frame where
      it previously mutated in place; **neutral is the expectation and the bar**. A
      neutral-or-negative measurement **halts the landing pipeline** — land or park is
      the user's ruling, never process momentum.

### Task 20: deletion audit + entanglement radar ‖

**Files:** whatever the audits find.

- [ ] `deletion-audit` skill over the whole plan diff. Named candidates to rule on:
      `projectionOf` (its last caller is `wireInput`'s seed, and the step derives the
      projection each frame); `activeDriverId` (the step returns the winner);
      `authoredWorldPose` vs `liveWorldPose` (two helpers over one register);
      `lastZoomFactor` (kept — user ruled the debug UI stays).
- [ ] `entanglement-radar` skill over the whole diff. The design-time answers to
      re-check against the code as landed: the epoch eligibility table (is it still a
      table, or did it regrow a chain?), `SurfaceMemory`'s flat `pointerDown` pair,
      and whether any stage reaches back into `EngineState` instead of taking its
      input as an argument.
- [ ] Apply findings per [`conventions/leanness.md`](../conventions/leanness.md);
      anything declined goes to the user, not to the backlog, per the standing rule.
- [ ] Commit each fix separately.

### Task 21: parent plan and spec bookkeeping ‖

**Files (modify):** `docs/superpowers/plans/2026-09-01-camera-pivot.md` (Task 18 and
the File-structure block), `docs/superpowers/specs/2026-09-01-camera-pivot.md` (the
`_Ground preparation — cameraRuntime single-writer_` section, if the plan deviated
from it).

- [ ] Replace the parent plan's Task 18 body with a one-line supersede pointer at
      this plan's Task 17. **Do not strike it through** — delete the body; the
      completion record is the git log.
- [ ] Add this plan's created files to the parent's "File structure" block, and
      correct any of its "Modified" lines this plan invalidated (`cameraDrivers.ts`,
      `drainInput.ts`, `runFrame.ts`, `wireInput.ts`, `engine.ts`).
- [ ] If any signature in the spec section moved during execution, correct the spec —
      it is the binding authority and must match what shipped.
- [ ] Commit: `docs(camera): supersede T18, record the single-writer prep`.

---

## File structure

**Created**

```
src/@types/engine/camera/Epoch.d.ts                     T2
src/@types/engine/camera/CameraEpochs.d.ts              T2
src/@types/engine/camera/FollowMemory.d.ts              T4
src/@types/engine/camera/DriverCtx.d.ts                 T7
src/@types/camera/SurfaceMemory.d.ts                    T10
src/@types/engine/state/FrameOutputs.d.ts               T14
src/services/engine/camera/cameraEpochs.ts              T2, T3
src/services/camera/surfaceStep.ts                      T10
src/services/engine/camera/replayInput.ts               T12
src/services/engine/camera/seedCameraRuntime.ts         T14
src/services/engine/camera/stepCameraRuntime.ts         T15
src/services/engine/camera/commitOnEdge.ts              T15
src/services/engine/frame/projectFramePose.ts           T15
tests/helpers/deepFreeze.ts                             T16
tests/fixtures/camera/driverGoldenTrace.json            T1
tests/services/engine/frame/driverGoldenTrace.test.ts   T1
tests/services/engine/frame/cameraRuntimeSingleWriter.test.ts  T16
tests/services/engine/frame/engagedArmClock.test.ts     T17
tests/services/engine/frame/followApproachStrand.test.ts       T18
tests/** mirroring each new src file
```

**Deleted**

```
src/@types/engine/camera/CameraClock.d.ts               T4
src/services/engine/camera/cameraClock.ts               T4
src/@types/camera/SurfaceController.d.ts                T11
src/services/camera/surfaceController.ts                T11
src/services/engine/frame/drainInput.ts                 T13
```

**Untouched** — every renderer, slab, layer, shader and `.wesl` file; the tile
pipeline; the `.bin` catalog path; `src/state/camera/*` (the slice and its sagas keep
their current shapes; only _when_ their actions are dispatched moves).

## Definition of Done

**Deliverable inventory**

- [ ] `CameraRuntime` is a value with five groups and no `{ current }` box.
- [ ] `stepCameraRuntime` is the only producer of a `CameraRuntime` after the seed;
      `runFrame` holds exactly one assignment to `state.cameraRuntime`.
- [ ] `seedCameraRuntime` is the only constructor, called from `engine.ts` and
      `wireInput.ts`.
- [ ] `CameraClock`, `createSurfaceController` and `drainInput` no longer exist.
- [ ] `ClipPlayer.tick` takes and returns a clip epoch; nothing outside the runtime
      holds a reference into it.
- [ ] Every camera epoch is milliseconds; no symbol or comment in the camera path
      claims otherwise.
- [ ] `followApproach` (55) and `followHold` (10) replace `followBody`.

**Acceptance**

- [ ] Both golden traces pass **unmodified** through Task 16, and the Task 18
      re-record's diff is confined to the follow legs and is recorded in its commit.
- [ ] The Task 16 gate test fails when a second `cameraRuntime` writer is introduced
      (demonstrated, not asserted).
- [ ] The Task 18 strand fixture fails on the pre-split table and passes after — both
      runs in the ledger.
- [ ] Perf before/after recorded verbatim; neutral or better, or an explicit
      land/park ruling from the user.

**Named observable behaviours** — this plan changes no rendered behaviour, so it
carries no manual smoke list of its own. It rides the parent plan's Task 22 gate;
the two items that gate specifically belong to this work:

- Focus a body with the spin pill on, from an engaged surface pose over another
  body: the camera arrives at the framing distance and is recoverable (R14-3).
- Play a looping tour clip through at least two wraps: no cue re-fire glitch and no
  time discontinuity at the wrap (the Task 5 handshake).

**Deferral boundary — do not chase these**

- Driver ids as a literal union instead of `string`. It would make `register.winner`
  and the epoch eligibility table exhaustively checked, and it is a genuine
  improvement — but it touches every driver consumer and is not needed by anything
  in this plan.
- The greenfield's `simEpoch`-beside-`displayed` pick hazard: `outputs.simDays`
  already stores it, and the hazard is out of this plan's scope.
- Splitting `runFrame` further. The step extraction takes ~150 lines out of a
  500-line file; the rest (subsystems, GPU dispatch, keep-tick vote) is not camera.
- Any renderer change at all.
