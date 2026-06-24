# Animation Plan B — the `playClip` seam + fold `evaluateTween` into `evaluateClip`

> **Status:** plan, awaiting execution. Plan **B** of the three-plan decomposition
> in [`2026-06-19-animation-system-design.md`](../specs/2026-06-19-animation-system-design.md)
> Open-decision #5. **Depends on Plan A having landed** (`ClipData`,
> `evaluateClip`, the `clip`@95 driver row, `clipPlayer`, the `camera.clip` Intent
> + `startClip`/`endClip` actions). Plan C (the tour saga) consumes this plan's
> `playClip` — do **not** build Plan C here.

## Goal

Add the non-reactive **`playClip(clip): Promise<void>`** seam that registers a clip
with the frame-clocked `clipPlayer` and resolves when the clip ends — the single
boundary every consumer crosses (sagas via `yield* call(playClip, clip)`,
recording spikes directly). And **fold `evaluateTween` into `evaluateClip`**: after
this plan there is *one* camera evaluator; the focus `tween`@60 row and the
scripted `clip`@95 row are structurally identical store-descriptor + pure-evaluator
rows, priority the only essential difference (spec "The clip driver is the focus
tween, generalized", lines 435–488).

## Architecture

Two changes, both refactors over Plan A's surface:

1. **`playClip` seam.** A thin function: dispatch `startClip(clip)` (resolving
   `start: 'live'` to a concrete pose at dispatch, mirroring `tweenToCameraSnapshot`
   reading `lastPose.current`), register a `playClip` resolver with `clipPlayer`,
   return the Promise the player resolves on clip-end. Includes the **post-produce
   clip-end sequencing**: the `clipPlayer` dispatches `endClip()` when the awaited
   timeline saturates, the `clip`@95 driver deactivates on the next frame, and
   commit-on-edge bakes the **saturated** final pose into `camera.base` — the exact
   ordering the tween already uses at `runFrame.ts:148-198`. Cancellation rides a
   redux-saga `[CANCEL]` hook (`p[CANCEL] = () => clipPlayer.stop()`), never a
   rejection (spec lines 757-763).

2. **Fold the evaluator.** `evaluateTween` (`evaluateTween.ts`) becomes the
   one-segment case of `evaluateClip`. After the fold, `evaluateTween.ts` is gone;
   the focus `tween`@60 row calls `evaluateClip` over a one-segment clip derived
   from `camera.tween`, and the `clip`@95 row calls `evaluateClip` over
   `camera.clip.data`. The two rows differ only in priority and in which store
   descriptor they read.

This is a **refactor**, not green-field — the spec carries the rationale, Plan A
carries the new types, the shipped tween carries the shape. Per
[`plan-style.md`](../conventions/plan-style.md) "Refactor vs green-field", this
plan is terse: it points at what changes and cites `path:line`, it does not paste
function bodies.

### Pinned decision: `camera.tween` stays a SEPARATE Intent — the fold is at the evaluator, not the state

The spec folds the two camera moves at the **evaluator** level, not the **state**
level. `camera.tween` is **not** collapsed into `camera.clip`; both Intents survive
as distinct store fields, each read by its own driver row.

Evidence, all from `2026-06-19-animation-system-design.md`:

- Line 481-482: *"The focus tween (`camera.tween`@60) is **untouched** (#357/#358)
  and now shares not just ramp math but the whole shape with the clip — Option S,
  structural."* — "untouched" state, shared *shape*.
- Line 909-912 (Migration): *"`evaluateTween` becomes the one-segment case of
  `evaluateClip` — focus is `tween`@60, scripted clips are `clip`@95, both pure-
  evaluated store descriptors on `cameraClock`."* — two rows, two descriptors.
- Lines 691-698 + 738-741 (teardown): *"`endClip()` **also clears any dormant
  `camera.tween`** (`cancelCameraTween()`)"* — `camera.tween` must still exist as
  its own field after the fold for `endClip` to clear it; a tween planted before a
  clip lives in `camera.tween` and is cleared independently of `camera.clip`.

So the fold is: **one evaluator (`evaluateClip`), two store descriptors
(`camera.tween`, `camera.clip`), two driver rows (@60, @95).** This plan deletes
`evaluateTween` the *function* and re-points the `tween`@60 row at `evaluateClip`;
it does **not** touch the `camera.tween` slice field, the `startCameraTween` /
`cancelCameraTween` actions, or `focusTweenSaga`'s descriptor build.

## Tech Stack

TS strict, Vitest, Redux Toolkit + typed-redux-saga (the wired runtime from #345).
No new toolchain. The `clip`@95 driver, `clipPlayer`, `ClipData`, `evaluateClip`,
`startClip`/`endClip`, and `camera.clip` all arrive from Plan A — this plan
consumes them.

## Global Constraints

- `type` not `interface`; one TYPE per `src/@types/<area>/` file; one FUNCTION per
  `src/utils/` file (filename = symbol). Deep relative imports, no barrels.
- `Vec2`/`Vec3` from `src/@types/math`, never raw tuples.
- Didactic comments (explain *why* + the alternative). Comments stay timeless — no
  dates / PR refs / "pre-X" history notes.
- Tests mirror `src/` under `tests/`. TDD: failing test → run (red) → implement →
  run (green) → commit. Commit steps stage SPECIFIC paths (never `git add -A`/`.`);
  trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- `npm run typecheck` (both tsconfigs) + `npm test` green before each commit.
- Escalate before hacking: if a clean fold is blocked (e.g. Plan A shipped
  `evaluateClip` with a signature that can't express the one-segment tween), STOP
  and report — do not bolt a second code path beside the table.

## File Structure

```
src/
  services/engine/camera/
    evaluateTween.ts             DELETE — folded into evaluateClip (Plan A's file)
    evaluateClip.ts              (Plan A) — gains the one-segment / focus-tween case
    cameraDrivers.ts             MODIFY — tween@60 row calls evaluateClip; elapsedForWinner unchanged for tween
    cameraSnapshot.ts            (unchanged — still builds CameraTweenDescriptor)
  services/engine/animation/     (Plan A home for clipPlayer)
    playClip.ts                  NEW — the seam: dispatch startClip + register resolver + return Promise
    clipPlayer.ts                (Plan A) — MODIFY: expose the resolver-registration hook playClip needs
  state/camera/
    cameraSlice.ts               (unchanged by this plan — camera.tween + camera.clip both stay)
  state/selection/
    focusTweenSaga.ts            (unchanged — still dispatches startCameraTween)
tests/
  services/engine/camera/
    evaluateClip.test.ts         MODIFY — add the focus-tween-equivalence cases (absorb evaluateTween.test.ts)
    evaluateTween.test.ts        DELETE — its assertions move into evaluateClip.test.ts
    cameraDrivers.test.ts        MODIFY — tween@60 row still produces the same poses via evaluateClip
  services/engine/animation/
    playClip.test.ts             NEW — seam behaviour: resolves on end, cancels via [CANCEL]
```

> **Plan A coupling.** Exact filenames/paths for `evaluateClip.ts`, `clipPlayer.ts`,
> and the `camera.clip` actions are whatever Plan A shipped — the implementer
> **reads Plan A's merged code first** and adapts these paths. The contract names
> (`evaluateClip`, `clipPlayer`, `startClip`/`endClip`, `camera.clip`, `playClip`)
> are fixed by the cross-plan shared contract; their file homes are Plan A's.

---

## Task 1 — Fold `evaluateTween` into `evaluateClip` (the one-segment case)

**Files:** `src/services/engine/camera/evaluateClip.ts` (modify),
`src/services/engine/camera/evaluateTween.ts` (delete),
`tests/services/engine/camera/evaluateClip.test.ts` (modify),
`tests/services/engine/camera/evaluateTween.test.ts` (delete).

**Why:** the focus tween is a single `set`-across-all-four-channels segment
(spec line 431: *"a tween/focus-style move is a `set` across all four channels —
one constructor, shared ramp math"*). After Plan A, `evaluateClip(data, t)` already
composes per-channel `base`/`vel`/`osc`; a `CameraTweenDescriptor` is the degenerate
case of a single `base`-layer `set` per channel with `easeOutCubic`. There must be
**one** ramp-math path; `evaluateTween` is deleted, not kept beside `evaluateClip`.

**Contract (cite Plan A's `evaluateClip` signature, do not restate it):**
`evaluateClip(data: ClipData, elapsedSec: number): CameraPose` — PURE.

**Equivalence the fold must preserve** (the current `evaluateTween` semantics at
`evaluateTween.ts:42-76`):
- `easeOutCubic` easing on all four channels.
- `yaw` via shortest-arc angular lerp (`lerpAngleShortest`); `pitch`/`distance`
  via scalar `lerp`; `target` component-wise `lerp` into a **fresh** Vec3.
- **Saturation:** at `elapsed >= duration` the pose is an exact copy of `to` (not
  `easeOutCubic(1)`) — the coterminal-angle guard at `evaluateTween.ts:48-57`. This
  must survive: commit-on-edge compares the baked pose, so the saturated value has
  to be exactly `to`.

> **Note** the existing tween's distance space is **linear** (`evaluateTween.ts:74`
> `lerp(...distance...)`), whereas the clip's `distance` channel defaults to **log**
> (spec channel table, line 130). The fold must NOT silently change the focus
> tween's distance interpolation to log — express the focus case with an explicit
> `space: 'lin'` distance segment (the spec's `space` override field, lines 137-138),
> so existing focus-tween motion is byte-for-byte unchanged. This is the one
> subtlety the implementer must not paper over.

- [ ] Move the assertions from `tests/services/engine/camera/evaluateTween.test.ts`
  into `evaluateClip.test.ts` as a "focus tween = one-segment clip" describe block:
  - [ ] `evaluateClip matches the old tween at t=0` — a one-segment clip built from
    `{ from, to, durationMs, easing: 'easeOutCubic' }` returns `from` at `elapsed=0`.
  - [ ] `evaluateClip eases yaw via shortest arc` — `from.yaw`/`to.yaw` straddling
    ±π lerps the short way (port `evaluateTween`'s shortest-arc assertion).
  - [ ] `evaluateClip saturates to an exact copy of to past the deadline` — at
    `elapsed > duration` every field `===` `to` (the coterminal-angle guard), and
    `target` is a fresh array (not aliased to `to.target`).
  - [ ] `evaluateClip keeps focus-tween distance LINEAR` — a one-segment clip with
    a `lin`-space distance segment matches `lerp(fromDist, toDist, easeOutCubic(t))`
    at a mid-`t`, NOT the log interpolation the default would give.
- [ ] Run → red (some cases fail until `evaluateClip` handles the one-segment / `lin`
  cases; if Plan A already covers them, they pass and you only delete the old file).
- [ ] Implement the one-segment case inside `evaluateClip` (read Plan A's current
  body; reuse `easeOutCubic`/`lerp`/`lerpAngleShortest` from `src/utils/math/`).
- [ ] Delete `src/services/engine/camera/evaluateTween.ts` and
  `tests/services/engine/camera/evaluateTween.test.ts`.
- [ ] `npm test -- evaluateClip` → green; `npm run typecheck` → green (catches any
  remaining `evaluateTween` import).
- [ ] Commit (`evaluateClip.ts`, `evaluateClip.test.ts`, the two deletions).

## Task 2 — Re-point the `tween`@60 driver row at `evaluateClip`

**Files:** `src/services/engine/camera/cameraDrivers.ts` (modify),
`tests/services/engine/camera/cameraDrivers.test.ts` (modify).

**Why:** with `evaluateTween` gone, the `tween`@60 row at `cameraDrivers.ts:159-164`
must call `evaluateClip` over a one-segment clip derived from `s.camera.tween`. This
is the structural half of the fold — both rows now route through one evaluator. The
row keeps priority 60, `isActive: (s) => s.camera.tween !== null`, and its
`elapsedForWinner` arm (`tweenElapsed`, `cameraDrivers.ts:88`) **unchanged** — the
clock contract for the tween is untouched (spec: "both ride `cameraClock`").

**Before → after sketch (the only changing line in the row body):**
```ts
// before (cameraDrivers.ts:163)
pose: (s, _cam, elapsedMs) => evaluateTween(s.camera.tween!, elapsedMs),
// after — same descriptor, routed through the one evaluator via a one-segment adapter
pose: (s, _cam, elapsedMs) => evaluateClip(tweenAsClip(s.camera.tween!), elapsedMs / 1000),
```

> **Two seams to get right, do not skip either:**
> - **ms vs sec.** `tweenElapsed`/`elapsedForWinner` return **ms**; `evaluateClip`
>   takes **seconds** (`elapsedSec`, Plan A contract). The `tween` row must convert
>   at the call site (or `tweenAsClip` carries a ms duration and `evaluateClip` is
>   sec — pick ONE and assert it in a test). Mismatching the unit silently runs the
>   focus tween 1000× too fast or slow. Decide and pin with a test asserting the
>   mid-`t` pose matches the pre-fold value at a known `elapsedMs`.
> - **`tweenAsClip` is a tiny pure adapter**, one function per file under
>   `src/utils/` or `src/services/engine/camera/` (match where Plan A put clip
>   builders): `CameraTweenDescriptor → ClipData` (one `lin`-distance + add-angular
>   + lin-target segment, `easeOutCubic`). It restates the channel→space mapping
>   ONLY via the `space` override, never hardcoding (spec lines 137-138).

- [ ] Add `cameraDrivers tween row produces the same pose via evaluateClip` — drive
  the table with a fixed `camera.tween` descriptor + `nowMs`, assert the produced
  pose equals the pre-fold `evaluateTween` value at the same elapsed (golden values
  ported from `evaluateTween`'s test, or computed inline).
- [ ] Add `cameraDrivers tween row converts ms→sec correctly` — at `elapsedMs` =
  half the duration, the produced pose is the eased midpoint (NOT the start, which
  is what a 1000× unit slip would give).
- [ ] Run → red.
- [ ] Implement: add `tweenAsClip`, re-point the row, import `evaluateClip`, drop the
  `evaluateTween` import.
- [ ] `npm test -- cameraDrivers` → green; `npm run typecheck` → green.
- [ ] Commit (`cameraDrivers.ts`, the adapter file, `cameraDrivers.test.ts`).

## Task 3 — `playClip(clip): Promise<void>` — the seam (resolve-on-end)

**Files:** `src/services/engine/animation/playClip.ts` (new),
`src/services/engine/animation/clipPlayer.ts` (modify — expose the resolver hook),
`tests/services/engine/animation/playClip.test.ts` (new).

**Why:** the single boundary the spec names (lines 45-52): a saga plays a clip with
`yield* call(playClip, clip)` and suspends until it completes; a non-reactive spike
calls `playClip` directly. `playClip` is **not reactive** — it dispatches
`startClip`, registers a resolver the `clipPlayer` calls on the `endClip` edge, and
returns the Promise.

**Signature:** `playClip(clip: ClipData): Promise<void>`

**Behaviour (spec "The player", lines 490-507, + "post-produce sequencing"):**
1. Resolve `start: 'live'` to a concrete `Pose` at dispatch by reading the live
   produced pose — the same capture `tweenToCameraSnapshot` does at
   `cameraSnapshot.ts:62` (`state.cameraRuntime.lastPose.current`). Write a concrete
   `start: Pose` into the dispatched clip so `evaluateClip` stays pure with no
   `'live'` sentinel (spec lines 93-110). **A fresh `camera.clip.data` object is the
   clock-reset trigger** (spec lines 472-476 — the `clipElapsed` reference-identity
   key); `startClip` must install a NEW reference.
2. `dispatch(startClip(resolvedClip))` → the `clip`@95 driver activates.
3. Register a resolver with `clipPlayer` keyed to this clip, returned to the caller
   as a Promise. The `clipPlayer` (Plan A) already detects awaited-tree completion
   and dispatches `endClip()`; this plan adds the **resolve** of that Promise on the
   same edge.
4. **Post-produce clip-end ordering** — mirror the tween at `runFrame.ts:148-169`:
   when the awaited timeline saturates, `clipPlayer` dispatches `endClip()`; the
   `clip`@95 driver deactivates on the **next** frame; commit-on-edge
   (`runFrame.ts:189-198`, reading `commitsOnEdge` from the `clip` row per Plan A)
   bakes `lastPose.current` — the **saturated** final pose, not a one-frame-stale
   pose — into `camera.base`. The Promise resolves when `endClip()` fires, so a
   `yield* call(playClip, …)` returns *after* the clip's last pose is committed.

> **The saturated-pose subtlety is load-bearing** (same as the tween's, `runFrame.ts`
> step 2 comment at lines 148-169): `endClip` must fire on the frame where the
> produced pose has *already* saturated to the timeline's final value, so the pose
> baked into `base` is the final value and not the second-to-last frame. If Plan A's
> `clipPlayer` fires `endClip` a frame early, the bake is stale — a visible snap.
> Verify the ordering against Plan A's completion-detection; if it's off, that is a
> Plan A bug to report, not a thing to compensate for in `playClip`.

**Cancellation (spec lines 757-763):** the returned Promise carries a redux-saga
`[CANCEL]` hook: `p[CANCEL] = () => clipPlayer.stop()`. On saga cancellation
(`race({ run, exit: take(TOUR_EXIT) })` in Plan C), `clipPlayer.stop()` runs Resource
cleanup + `dispatch(endClip())`, and the Promise **resolves** (never rejects) — so
the common path needs no try/catch. `clipPlayer.stop()` is thin: it does not OWN
teardown, it triggers `endClip()` like every caller (spec lines 753-755).

- [ ] `playClip resolves its Promise when the clip ends` — drive a short clip through
  a stubbed `clipPlayer` to completion; assert the Promise resolves and that
  `endClip()` was dispatched on the resolving edge.
- [ ] `playClip resolves (not rejects) on stop()` — invoke the `[CANCEL]` hook;
  assert `clipPlayer.stop()` ran and the Promise resolved.
- [ ] `playClip resolves 'live' to a concrete start at dispatch` — with `start: 'live'`,
  assert the dispatched `startClip` payload carries a concrete `Pose` equal to the
  current `lastPose.current`, and that `data` is a **fresh object reference** (the
  clock-reset trigger).
- [ ] `playClip with a fixed start passes it through unchanged` — `start: Pose` is
  forwarded verbatim.
- [ ] Run → red.
- [ ] Implement `playClip`; add the resolver-registration hook to `clipPlayer`
  (read Plan A's `clipPlayer` shape — the hook is a `(onEnd) => void` or a
  per-clip resolver slot; match Plan A's lifecycle). Attach `[CANCEL]`.
- [ ] `npm test -- playClip` → green; `npm run typecheck` → green.
- [ ] Commit (`playClip.ts`, `clipPlayer.ts`, `playClip.test.ts`).

## Task 4 — Verify `endClip()` clears a dormant `camera.tween` (no new code)

**Files:** none to modify here — this is a verify-only checkpoint. The behavior is
**owned by Plan A's `endClip` reducer** (Plan A Task 7: `endClip()` sets
`camera.clip = null` AND `camera.tween = null` in one atomic reducer, with its own
tests). This task exists only to confirm the fold did not regress it; it adds no
second teardown path.

**Why this matters (spec lines 691-698, 738-741):** priority alone is not enough. A
`focus()` cue or a focus gesture *before* the clip can plant a `camera.tween` that is
dormant while `clip`@95 wins (clip outranks tween@60). But `camera.tween` stays
non-null, so the **instant** @95 deactivates, the stale tween@60 outranks `resting`@0
and **snaps the camera to the focus framing** — defeating commit-on-edge's bake into
`base`. The reducer-level clear in Plan A is the single home for fixing this.

> This is the one cross-Intent coupling the fold introduces, and exactly why
> `camera.tween` must remain a separate field (see the pinned decision): the `endClip`
> reducer clears `camera.tween` independently of clearing `camera.clip`. A pure
> reducer suffices — the tween clock resets by descriptor-reference change on the next
> plant, so no Resource side-effect is needed and no saga arm is warranted.

- [ ] Confirm Plan A Task 7's tests exist and pass: `endClip also clears a dormant
  tween` (both fields non-null → `endClip()` nulls both) and the no-planted-tween
  no-op. If Plan A's reducer does NOT clear `camera.tween`, STOP and report — do not
  add a competing `takeEvery(endClip, …)` saga arm here.
- [ ] `npm test -- cameraSlice` (Plan A's teardown tests) → green; `npm run typecheck`
  → green. No commit (no code change).

## Task 5 — Suspend `watchFocusTween` while a clip plays

**Files:** `src/state/selection/focusTweenSaga.ts` (modify),
a new `suspendDuringClip` guard helper (its own file, one function),
`tests/state/selection/focusTweenSaga.test.ts` (modify/new).

**Why (spec lines 659-698, 931-935):** while a clip owns the camera @95, a
`focus()` cue (or a stray user focus) must set selection + the isolation dim but
plant **NO** `camera.tween` — otherwise the dormant tween hijacks the camera the
instant the clip ends (Task 4 cleans up tweens planted *before* the clip; this task
stops *new* ones during it). The guard is **one shared helper gating per dispatched
action INSIDE `takeEvery`'s worker** — NOT around the watcher. Wrapping the watcher
would evaluate the guard once at boot (a `takeEvery` registers its listener a single
time) and either never park or never register at all (spec lines 666-680).

**Contract:**
```ts
// suspendDuringClip — re-checked on every dispatch, inside takeEvery's worker
const suspendDuringClip =
  <A>(worker: (action: A) => Generator) =>
  function* (action: A) {
    if (selectClipActive(yield* select())) return;  // clip owns camera @95 — skip the tween
    yield* worker(action);
  };
```

**Apply at `focusTweenSaga.ts:36`:** wrap the existing `takeEvery(updateSelectionFocus, …)`
worker body in `suspendDuringClip(...)`. The worker body (resolve ref → read camera
runtime → `put(startCameraTween(...))`) is unchanged; only the guard wraps it.

> **Do NOT suspend** `watchFades`, `watchFlowLoad`/`watchWake`, or
> `watchSelectionRows` (spec lines 679-680, 690-691): the clip *relies* on
> `watchFades` driving `intentOpacity`, and on `watchSelectionRows` reconciling the
> derived `selectionRows.focus` that drives the isolation dim the clip's `focus()`
> WANTS. Parking `watchSelectionRows` would make every in-clip `focus()` a no-op dim.
> Suspend **exactly one** watcher: `watchFocusTween`.

- [ ] `watchFocusTween plants no tween while a clip is active` — with `camera.clip`
  non-null (`selectClipActive` true), an `updateSelectionFocus` dispatch results in
  NO `startCameraTween` dispatch.
- [ ] `watchFocusTween plants a tween normally with no clip active` — with
  `camera.clip` null, the existing behaviour is unchanged (a `startCameraTween` is
  dispatched). This is the regression guard on the existing focus tween.
- [ ] Run → red.
- [ ] Implement `suspendDuringClip` (own file, one function; `select` +
  `selectClipActive` from Plan A's selector). Wrap the worker at `focusTweenSaga.ts:36`.
- [ ] `npm test -- focusTweenSaga` → green; `npm run typecheck` → green.
- [ ] Commit (`focusTweenSaga.ts`, `suspendDuringClip.ts`, the test).

> **`suspendDuringClip` is Layer 1, owned here.** It guards ANY clip's camera from
> a reconcile saga (`watchFocusTween`), not just a tour's — it keys on
> `selectClipActive`, which is true for every clip including the saga-less recording
> spikes. So it lives in Plan B, not the tour plan. **Plan C CONSUMES the parking
> behaviour** (its in-clip `focus()` cues rely on no tween planting while @95 owns
> the camera) but adds NO task for it — `suspendDuringClip` and the wrapped
> `watchFocusTween` are fully built here.

## Task 6 — Re-express the `flyout` spike against `playClip` (validation)

**Files:** wherever Plan A landed the `flyout` clip data; a tiny non-reactive
driver/spike call site that does `playClip(flyout)`; no new test if Plan A already
asserts `evaluateClip(flyout, …)` — this task validates the *seam*, not the math.

**Why:** the spec's first-slice guidance (lines 981-988) validates the model against
known-good footage by re-expressing **one** spike. Plan A re-expressed `flyout` as
`ClipData` and proved `evaluateClip` against it; Plan B proves the **seam** end-to-end
by playing it through `playClip` (dispatch → frames → commit-on-edge bake → Promise
resolves). This is the integration check that the whole `playClip` → `clipPlayer` →
`clip`@95 driver → commit-on-edge loop closes.

- [ ] `playClip(flyout) drives the camera and resolves` — an integration-style test
  (drive `runFrame` over enough simulated frames): assert the camera distance moves
  from the live pose toward the flyout's horizon-shell target, the Promise resolves
  after the timeline duration, and `camera.base` is committed to the saturated final
  pose (commit-on-edge bake, NOT one frame stale).
- [ ] Run → red.
- [ ] Implement the spike call site (`playClip(flyout)`), reusing Plan A's `flyout`
  `ClipData` verbatim — do not re-author it.
- [ ] `npm test` (the integration test) → green; `npm run typecheck` → green.
- [ ] Commit.

## Task 7 — Full-suite green + cleanup pass

**Files:** none new — verification.

- [ ] `npm run typecheck` (both tsconfigs) → green. This is the net that catches any
  surviving `evaluateTween` import anywhere in `src/` or `tools/`.
- [ ] `npm test` → full suite green.
- [ ] Grep for `evaluateTween` across `src/` + `tests/` → zero hits (the function is
  fully dissolved; only `evaluateClip` remains). Grep for `CameraTweenDescriptor` →
  still present (the type survives; only the evaluator folded).
- [ ] Confirm `camera.tween`, `startCameraTween`, `cancelCameraTween`, and
  `focusTweenSaga`'s descriptor build are all **untouched** by this plan (the pinned
  decision: state stays separate, only the evaluator + the tween row folded).
- [ ] Commit any final cleanup (didactic-comment tidy on the touched files — the
  `cameraDrivers.ts` header at lines 36-37 still says "tween 60" and should note both
  rows now share `evaluateClip`).

---

## Self-review checklist (run before handing off)

- **Contract code only?** ✔ Signatures (`playClip`, `suspendDuringClip`,
  `evaluateClip`), test names+assertions, and two tiny before/after sketches. No full
  function bodies; existing code cited by `path:line` (`runFrame.ts:148-198`,
  `cameraDrivers.ts:159-164`, `evaluateTween.ts:42-76`, `cameraSnapshot.ts:62`,
  `focusTweenSaga.ts:36`, `cameraSlice.ts:84-86`).
- **Refactor-terse?** ✔ Points at what changes, leans on Plan A + the spec + the
  shipped tween for context.
- **Pinned the open decision?** ✔ `camera.tween` stays a SEPARATE Intent; the fold
  is at the evaluator (`evaluateTween` → one-segment `evaluateClip`), not the state.
  Cited spec lines 481-482, 909-912, 691-698.
- **Plan A dependency explicit?** ✔ Header + File Structure note + per-task "read
  Plan A's merged code first" for the paths Plan A owns.
- **Scope discipline?** ✔ No tour saga, no scene verbs, no capture/restore (Plan C);
  no god-object driver (spec's retired model). `playClip` + the fold only.
- **Conventions gated?** ✔ one-type/one-function-per-file, Vec3 alias, didactic
  timeless comments, specific-path commits + trailer, escalate-before-hacking,
  ms↔sec unit seam called out, saturated-pose ordering called out.
- **Subtleties surfaced, not buried?** ✔ The three load-bearing traps are flagged
  inline: (1) focus-tween distance must stay `lin` not `log`; (2) ms↔sec unit at the
  tween-row call site; (3) saturated final pose on the `endClip` edge for a stale-free
  bake; (4) `endClip` must clear a dormant `camera.tween` — **owned by Plan A's
  reducer**, verified (not re-implemented) here in Task 4. Each is the
  spec's own "must-remember-to" made an explicit task assertion.
