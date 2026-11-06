# Sky look-around — plan

> Spec: [`specs/2026-11-06-sky-look-around-design.md`](../../specs/completed/2026-11-06-sky-look-around-design.md).
> Executed by lean SDD ([`sdd-execution.md`](../../conventions/sdd-execution.md)).

## Branches

```
main
 └─ sky-lens-prep                 PR 1: Tasks 1, 1b
     └─ worktree-sky-arm-look-around   trunk: Tasks 2–4 (no PR of its own)
         ├─ sky-exit-climb        Tasks A1–A3 → the PR if A wins
         └─ sky-exit-push         Tasks B2–B4 → the PR if B wins
```

The trunk worktree is `.claude/worktrees/sky-arm-look-around`; the exits get
`.claude/worktrees/sky-exit-climb` and `.claude/worktrees/sky-exit-push`, created off the trunk head
once Task 4 lands, and run concurrently.

Pure functions throughout: each new helper is one function per file under
`src/services/engine/camera/arms/sky/utils/`, state in, state out; the row cells only route.

---

## PR 1 — prep

### Task 1: The lens is camera state

**review: yes** (Redux state, takeover saga)

**Files:** the 26 of `git show d37207970 --stat`, at their current paths (`cameraFraming.ts` is now
`src/services/engine/camera/framing/cameraFraming.ts`); delete
`src/state/settings/core/cameraSettingsSlice.ts` and `src/@types/settings/CameraSettings.d.ts`.

- [x] On branch `sky-lens-prep` off `origin/main`: `git cherry-pick d37207970`, resolve conflicts
      against current main. Drop its `docs/BACKLOG.md` hunk if the line it removes is gone; keep it
      (with its detail file) if present.
- [x] Contract after the port: `CameraState.fovYRad: number` (radians, initial `DEFAULT_FOV_Y_RAD`),
      `setFovYRad(rad)`, `selectFovYRad`, `SceneSnapshot.fovYRad`, `CORE_SNAPSHOT_CLUSTERS = ['labels', 'picking']`,
      `stepCameraRuntime` reads `stored.camera.fovYRad`, `withSceneSnapshotSaga` puts
      `setFovYRad(DEFAULT_FOV_Y_RAD)`.
- [x] `grep -rn "fovDeg\|setFovDeg\|selectFovDeg\|CameraSettings\b" src tools packages/website/src`
      leaves only the unrelated DSS/Aladin/capture `fovDeg` and the site-shot `settings.fovDeg` field
      (now mapped through `setFovYRad(degToRad(…))`).
- [x] No new tests: the ported ones guard it.
- [x] Commit `refactor(camera): the field of view moves from settings into camera state`, push, open
      PR 1.

### Task 1b: Port the clip `fov` channel (R8: rides PR 1)

**review: yes** (camera drivers)

**Files:** the 17 of `git show 48f1a3341 --stat`, at current paths

- [x] `git cherry-pick 48f1a3341`, resolve. Contract: `Channel` gains `'fov'` (log-space lerp),
      `DriverOutput.fovYRad?: number`, the projection draws a driver's lens over `camera.fovYRad`, the clip's
      last lens is committed with `setFovYRad` on hand-off.
- [x] Its tests come with it.
- [x] Commit.

---

## Trunk

The trunk branch is rebased onto `sky-lens-prep` before Task 2.

### Task 2: An arm step may author the lens

**review: yes** (camera input loop)

**Files:** `src/services/engine/camera/arms/@types/CameraArmRow.d.ts`,
`src/services/engine/camera/input/replayInput.ts`, `src/services/engine/camera/arms/nudgeCameraArm.ts`,
`src/services/engine/camera/stepCameraRuntime.ts`, new `src/data/camera/lensMinDeg.ts`,
`src/data/camera/lensMaxDeg.ts`, `tests/services/engine/camera/input/replayInput.test.ts`

**Contract:**

```ts
step(…): { readonly pose: PoseOf[K]; readonly memory: MemOf[K]; readonly tilt: TiltMemory; readonly fovYRad?: number };
nudge(…): { readonly pose: PoseOf[K]; readonly tilt: TiltMemory; readonly fovYRad?: number };
export const LENS_MIN_DEG = 0.5;
export const LENS_MAX_DEG = 120;
```

- [x] `replayInput.stepRow` (`replayInput.ts:102-111`): when the step returns `fovYRad`, `emit(setFovYRad(fovYRad))`;
      every step reads `fovYRad` from the folded `camera.fovYRad` (`{ ...ctx, fovYRad: camera.fovYRad }`),
      not the drain-start `ctx`.
- [x] `nudgeCameraArm` returns `fovYRad` when the row does; `stepCameraRuntime` (`:198-202`) appends
      `setFovYRad` to its actions when present.
- [x] Test `two lens notches in one drain compound`: a stub row (or the sky row once Task 3 lands —
      order the dispatch so the test uses the sky row) at a sky base, two at-rest zoom steps of
      factor 1.25 → the emitted `setFovYRad` actions read `lens·1.25` then `lens·1.5625`.
- [x] Commit.

### Task 3: Sky trunk cells — look, lens, nudge

**review: yes** (camera maths)

**Files:** `src/services/engine/camera/arms/sky/skyCameraArm.ts`, new
`arms/sky/utils/skyLookedPose.ts`, `arms/sky/utils/skyZoomedLens.ts`,
`tests/services/engine/camera/arms/sky/skyCameraArm.test.ts`

**Contract:**

```ts
// azimuth −= dx·g, altitude += dy·g, g = fovYRad / viewportHeightPx; azimuth wrapRad, altitude clamped ±π/2
export function skyLookedPose(pose: SkyPose, dragPx: Readonly<Vec2>, fovYRad: number, viewportHeightPx: number): SkyPose;
// clamp(lensRad · spentZoomFactor(factor), LENS_MIN, LENS_MAX); returns lensRad itself when the clamp eats the notch
export function skyZoomedLens(lensRad: number, factor: number): number;
```

- [x] `step`: drag (`orbit`, `pan`) → `skyLookedPose(…, endPx − startPx, …)`; zoom →
      `fovYRad: skyZoomedLens(ctx.fovYRad, factor)` with the pose by reference, no `fovYRad` when unchanged;
      edges by reference. Header comment loses "this slice authors no input".
- [x] `nudge`: `look` → `skyLookedPose` at `pxPerRad = viewportPx[1] / fovYRad`; `zoom` →
      `skyZoomedLens(…, Math.exp(zoom))`; `orbit`/`roll` ignored; nothing to do → pose by reference.
- [x] Tests (assertions):
  - `drag turns the view at fovY / heightPx and the sky follows the pointer` — at fovY 1°, 60°,
    120°, a +40 px x-drag lowers azimuth by `40·fovY/h`; a +40 px y-drag raises altitude by the same.
  - `altitude clamps at ±90° and azimuth stays free at the zenith` — a long down-drag ends at π/2
    exactly; a following x-drag still changes azimuth.
  - `the horizon stays level after any drag sequence` — after a mixed sequence, `toParent`'s basis
    right vector is perpendicular to the spot's local up (≤ 1e-12).
  - `wheel scales the lens multiplicatively inside [LENS_MIN_DEG, LENS_MAX_DEG]` — 60° × 1.25 →
    75°; repeated widening stops at 120°, narrowing at 0.5°.
  - `a notch the lens clamp eats whole is declined by reference` — at 120°, wheel-out returns
    `pose === framed.pose` and no `fovYRad`.
  - `nudge look and zoom move the view and the lens at the drag's rate`.
- [x] Commit.

### Task 3b: The slider takes the lens range (R9)

**Files:** `src/components/SettingsPanel/DisplaySection.tsx`

- [x] The Field of view slider's `min`/`max` read `LENS_MIN_DEG`/`LENS_MAX_DEG` (0.5°–120°). No test
      (a UI constant). Commit.

### Task 4: Backlog what remains of sky mode

**Files:** new `docs/backlog/2026-11-06-sky-mode-rest.md`, `docs/BACKLOG.md`

- [x] One index line + detail file listing spec §9 (entry + `s`, place picker, `skyGrids`, the `sky`
      takeover + Esc, readout, `fov` on URL/recorder, perf at 0.5°), and that sky mode's spec takes
      this arm shape when it resumes.
- [x] Commit. Create the two exit worktrees off this head.

---

## Exit A — `sky-exit-climb`

### Task A1: `SkyPose.eyeHeightM`

**Files:** `src/@types/camera/pose/SkyPose.d.ts`, `arms/sky/skyCameraArm.ts` (channels),
`arms/sky/utils/skyPoseToBodyArm.ts`, `arms/sky/utils/skyPoseFromBodyArm.ts`,
`src/utils/url/encodeFramedPose.ts`, `src/utils/url/decodeFramedPose.ts`, their tests,
`tests/services/engine/camera/clipKeyframeFrames.test.ts` if its fixtures build a `SkyPose`

**Contract:**

```ts
export type SkyPose = { readonly azimuthRad: number; readonly altitudeRad: number; readonly eyeHeightM: number };
// k,<body>,<lonRad>,<latRad>,<azimuthRad>,<altitudeRad>,<eyeHeightM>
```

- [x] `encode` → `distance: eyeHeightM`; `decode` → `eyeHeightM: Math.max(SKY_EYE_HEIGHT_M, channels.distance)`.
- [x] `skyPoseToBodyArm` uses `pose.eyeHeightM` in place of the constant; `skyPoseFromBodyArm`
      returns `SKY_EYE_HEIGHT_M`.
- [x] Codec: 7 fields; `eyeHeightM` finite and ≥ `SKY_EYE_HEIGHT_M` or null.
- [x] Tests: `toParent keeps the climbed eye` (ground + `eyeHeightM` at 40 m under a stubbed
      terrain); `sky frame with eyeHeightM round-trips`; a 6-field `k` row and `eyeHeightM = 1` decode
      null.
- [x] Commit.

### Task A2: The climb, its lens, its release

**review: yes** (camera maths)

**Files:** `arms/sky/skyCameraArm.ts`, new `arms/sky/utils/skyReleaseHeightM.ts`,
`arms/sky/utils/skyClimbLens.ts`, `arms/sky/utils/skyClimbStep.ts`, `skyCameraArm.test.ts`

**Contract:**

```ts
// groundRadiusM · (standoffRadii − 1): the body arm's floor above the ground (surfaceFloorM)
export function skyReleaseHeightM(groundRadiusM: number, standoffRadii: number): number;
// ln-lerp LENS_MAX → DEFAULT_FOV_Y_RAD as ln(eyeHeightM) goes ln(SKY_EYE_HEIGHT_M) → ln(releaseHeightM), clamped
export function skyClimbLens(eyeHeightM: number, releaseHeightM: number): number;
// the wheel at the stop or above standing: eyeHeightM' = max(SKY_EYE_HEIGHT_M, eyeHeightM · f), lens = skyClimbLens(eyeHeightM')
// null when the notch is the trunk's (standing, and not a widen at LENS_MAX)
export function skyClimbStep(pose: SkyPose, lensRad: number, factor: number, releaseHeightM: number):
  { readonly pose: SkyPose; readonly lensRad: number } | null;
```

- [x] `step` zoom: `skyClimbStep` first; on null, the trunk's `skyZoomedLens`. `nudge` zoom the same.
- [x] `release`: the focus rule as today, or `eyeHeightM ≥ skyReleaseHeightM(host.groundRadiusAtM(skySpotRadial(spot)), host.standoffRadii)`.
- [x] Tests:
  - `wheel-out at the widest lens raises the eye and eases the lens toward the default` — from 1.7 m
    at 120°, one ×1.25 notch → 2.125 m and a lens strictly between 60° and 120°.
  - `wheel-in descends to standing before it narrows the lens` — from 5 m, notches of ×0.8 reach
    1.7 m at 120° before any lens below 120°.
  - `the arm releases exactly at the body arm's floor, at the default lens` — `release` false just
    under `skyReleaseHeightM`, true at it; `skyClimbLens` there is `DEFAULT_FOV_Y_RAD`.
- [x] Commit.

### Task A3: Eye shots

- [x] Dev server on this worktree; shots per spec §8 with a `#pose=k,…,1.7` link at Søndermarken by
      night; the exit mid-climb and landed. Dash checks with a live link. Ledger records the shots.

---

## Exit B — `sky-exit-push`

### Task B2: A tween may carry a lens

**Files:** `src/@types/camera/*/CameraTweenDescriptor.d.ts`,
`src/services/engine/camera/clips/focusMoveClip.ts`, its test

- [x] `CameraTweenDescriptor.fovYRad?: { readonly from: number; readonly to: number }` (radians);
      `focusMoveClip` adds an `fov` tween track over the move's duration and ease when present.
- [x] Test `a tween with a lens draws it from → to and commits to on hand-off`.
- [x] Commit.

### Task B3: The push, the clock, the lift

**review: yes** (camera input loop, memory, tween)

**Files:** `src/@types/camera/arms/MemOf.d.ts`, new `src/@types/camera/arms/SkyExitPush.d.ts`,
`src/@types/camera/arms/CameraArmCtx.d.ts`, `CameraArmRow.d.ts`, `replayInput.ts`,
`stepCameraRuntime.ts` (ctx `nowMs`), `arms/sky/skyCameraArm.ts`, new
`arms/sky/utils/skyExitPushStep.ts`, `arms/sky/utils/skyExitTween.ts`, new
`arms/sky/data/skyExitPushLn.ts`, `skyExitPushDecayMs.ts`, `skyExitAltitudeM.ts`, `skyCameraArm.test.ts`

**Contract:**

```ts
export type SkyExitPush = { readonly pushLn: number; readonly lastPushMs: number }; // empty { 0, -Infinity }
CameraArmCtx.nowMs: number;
step(…) → { …; readonly tween?: CameraTweenDescriptor };
// restart from ln f when nowMs − lastPushMs ≥ SKY_EXIT_PUSH_DECAY_MS, else accumulate
export function skyExitPushStep(push: SkyExitPush, factor: number, nowMs: number): SkyExitPush;
// from: the live world pose; to: SKY_EXIT_ALTITUDE_M above the spot's ground point, looking straight
// down, sky azimuth as heading; lens { from: LENS_MAX, to: DEFAULT_FOV_Y_RAD }
export function skyExitTween(framed: FramedPose<'sky'>, ctx: CameraArmCtx): CameraTweenDescriptor;
```

- [x] `step` zoom at `LENS_MAX` with `f > 1`: `skyExitPushStep`; at `pushLn ≥ SKY_EXIT_PUSH_LN`
      return `tween` and the empty push. Wheel-in and drags return the empty push.
- [x] `replayInput.stepRow` emits `startCameraTween(tween)` when present.
- [x] Tests:
  - `wheel-out at the widest lens releases only once SKY_EXIT_PUSH_LN accumulates`
  - `any wheel-in, drag or rest clears the exit push` — rest = `nowMs` advanced past the decay.
  - `the exit tween ends above the spot looking down at the default lens` — the `to` pose's eye is
    `SKY_EXIT_ALTITUDE_M` (± 1e-6 relative) above the spot's ground along its radial, view along −up.
- [x] Commit.

### Task B4: Eye shots

- [x] As A3, on this worktree; tune the three constants and the duration by eye; ledger records them.

---

## After both

- [x] One dash ask: A or B, with each branch's shots and live links.
- [x] Winner: rebase onto `main` once PR 1 merges, `/feature-done`, plan + spec to `completed/`,
      ledger archived, PR. Loser: branch kept unpushed-closed per the owner, worktree removed.

## Definition of Done

- **Deliverables:** `camera.fovYRad` + `setFovYRad` (PR 1); `CameraArmRow` step/nudge `fovYRad?`;
  `LENS_MIN_DEG`/`LENS_MAX_DEG`; sky `step`/`nudge` filled; the winner's exit
  (B, as shipped: `SkyWheelMemory`, `ctx.nowMs`, step `clip` from `skyExitLift`, body-channel
  `roll`, the `fov` channel); `docs/backlog/2026-11-06-sky-mode-rest.md`.
- **Observable behaviours:** at a sky pose by night — drag right turns left and the stars stay under
  the pointer; drag down looks up and stops at the zenith; wheel narrows to 0.5° and widens to 120°;
  past 120° the winner's exit lands in the body arm at a 60° lens; wheel-in afterwards never
  re-enters the sky arm. On the tour branch: stop beat 00, drag, scroll out.
- **Deferred:** sky-mode entry, place picker, grids, takeover/Esc, readout, `fov` on URL and
  recorder, the 0.5° perf pass.

## Completion (2026-11-06)

B shipped; A was built in full (A1–A3 plus a lens-settle fix round), eye-checked and rejected (spec
R11). B as shipped differs from Tasks B2–B3 by owner rulings, recorded in the spec (§6, R11, R12) and
the archived ledger:

- B2's tween lens was deleted: the lift is a two-leg framed clip (`skyExitLift`, pitch in the sky
  frame, then climb in the body frame) whose `fov` channel carries the lens, so it never rolls.
- B3's push memory and its decay were deleted ("as little state as possible"). The lift starts on a
  wheel-out at `LENS_MAX` after `SKY_EXIT_PAUSE_MS` without wheel input (trackpad guard, R12), so
  the sky memory is one number, `SkyWheelMemory.lastWheelMs`; `CameraArmCtx.nowMs` stays. The step
  returns `clip`, not `tween`; it lands at `SKY_EXIT_ALTITUDE_M` = 100 m.
- Engine changes the lift needed: body clip channels carry `roll`; a lens tween opens no absolute
  leg; `toWorldArm` keeps a below-datum eye's view axis (final review H1).
- Left open: a spot exactly at a pole degenerates the climb's basis (final review L1; offered as a
  backlog item).
