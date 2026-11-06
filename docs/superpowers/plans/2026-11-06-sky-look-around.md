# Sky look-around — plan

> Spec: [`specs/2026-11-06-sky-look-around-design.md`](../specs/2026-11-06-sky-look-around-design.md).
> Executed by lean SDD ([`sdd-execution.md`](../conventions/sdd-execution.md)).

## Branches

```
main
 └─ sky-lens-prep                 PR 1: Task 1
     └─ worktree-sky-arm-look-around   trunk: Tasks 2–4 (no PR of its own)
         ├─ sky-exit-climb        Tasks A1–A3 → the PR if A wins
         └─ sky-exit-push         Tasks B1–B4 → the PR if B wins
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

- [ ] On branch `sky-lens-prep` off `origin/main`: `git cherry-pick d37207970`, resolve conflicts
      against current main. Drop its `docs/BACKLOG.md` hunk if the line it removes is gone; keep it
      (with its detail file) if present.
- [ ] Contract after the port: `CameraState.lens: number` (radians, initial `DEFAULT_FOV_Y_RAD`),
      `setLens(rad)`, `selectLens`, `SceneSnapshot.lens`, `CORE_SNAPSHOT_CLUSTERS = ['labels', 'picking']`,
      `stepCameraRuntime` reads `stored.camera.lens`, `withSceneSnapshotSaga` puts
      `setLens(DEFAULT_FOV_Y_RAD)`.
- [ ] `grep -rn "fovDeg\|setFovDeg\|selectFovDeg\|CameraSettings\b" src tools packages/website/src`
      leaves only the unrelated DSS/Aladin/capture `fovDeg` and the site-shot `settings.fovDeg` field
      (now mapped through `setLens(degToRad(…))`).
- [ ] No new tests: the ported ones guard it.
- [ ] Commit `refactor(camera): the field of view moves from settings into camera state`, push, open
      PR 1.

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
step(…): { readonly pose: PoseOf[K]; readonly memory: MemOf[K]; readonly tilt: TiltMemory; readonly lens?: number };
nudge(…): { readonly pose: PoseOf[K]; readonly tilt: TiltMemory; readonly lens?: number };
export const LENS_MIN_DEG = 0.5;
export const LENS_MAX_DEG = 120;
```

- [ ] `replayInput.stepRow` (`replayInput.ts:102-111`): when the step returns `lens`, `emit(setLens(lens))`;
      every step reads `fovYRad` from the folded `camera.lens` (`{ ...ctx, fovYRad: camera.lens }`),
      not the drain-start `ctx`.
- [ ] `nudgeCameraArm` returns `lens` when the row does; `stepCameraRuntime` (`:198-202`) appends
      `setLens` to its actions when present.
- [ ] Test `two lens notches in one drain compound`: a stub row (or the sky row once Task 3 lands —
      order the dispatch so the test uses the sky row) at a sky base, two at-rest zoom steps of
      factor 1.25 → the emitted `setLens` actions read `lens·1.25` then `lens·1.5625`.
- [ ] Commit.

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

- [ ] `step`: drag (`orbit`, `pan`) → `skyLookedPose(…, endPx − startPx, …)`; zoom →
      `lens: skyZoomedLens(ctx.fovYRad, factor)` with the pose by reference, no `lens` when unchanged;
      edges by reference. Header comment loses "this slice authors no input".
- [ ] `nudge`: `look` → `skyLookedPose` at `pxPerRad = viewportPx[1] / fovYRad`; `zoom` →
      `skyZoomedLens(…, Math.exp(zoom))`; `orbit`/`roll` ignored; nothing to do → pose by reference.
- [ ] Tests (assertions):
  - `drag turns the view at fovY / heightPx and the sky follows the pointer` — at fovY 1°, 60°,
    120°, a +40 px x-drag lowers azimuth by `40·fovY/h`; a +40 px y-drag raises altitude by the same.
  - `altitude clamps at ±90° and azimuth stays free at the zenith` — a long down-drag ends at π/2
    exactly; a following x-drag still changes azimuth.
  - `the horizon stays level after any drag sequence` — after a mixed sequence, `toParent`'s basis
    right vector is perpendicular to the spot's local up (≤ 1e-12).
  - `wheel scales the lens multiplicatively inside [LENS_MIN_DEG, LENS_MAX_DEG]` — 60° × 1.25 →
    75°; repeated widening stops at 120°, narrowing at 0.5°.
  - `a notch the lens clamp eats whole is declined by reference` — at 120°, wheel-out returns
    `pose === framed.pose` and no `lens`.
  - `nudge look and zoom move the view and the lens at the drag's rate`.
- [ ] Commit.

### Task 4: Backlog what remains of sky mode

**Files:** new `docs/backlog/2026-11-06-sky-mode-rest.md`, `docs/BACKLOG.md`

- [ ] One index line + detail file listing spec §9 (entry + `s`, place picker, `skyGrids`, the `sky`
      takeover + Esc, readout, `fov` on URL/recorder, perf at 0.5°), and that sky mode's spec takes
      this arm shape when it resumes.
- [ ] Commit. Create the two exit worktrees off this head.

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

- [ ] `encode` → `distance: eyeHeightM`; `decode` → `eyeHeightM: Math.max(SKY_EYE_HEIGHT_M, channels.distance)`.
- [ ] `skyPoseToBodyArm` uses `pose.eyeHeightM` in place of the constant; `skyPoseFromBodyArm`
      returns `SKY_EYE_HEIGHT_M`.
- [ ] Codec: 7 fields; `eyeHeightM` finite and ≥ `SKY_EYE_HEIGHT_M` or null.
- [ ] Tests: `toParent keeps the climbed eye` (ground + `eyeHeightM` at 40 m under a stubbed
      terrain); `sky frame with eyeHeightM round-trips`; a 6-field `k` row and `eyeHeightM = 1` decode
      null.
- [ ] Commit.

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

- [ ] `step` zoom: `skyClimbStep` first; on null, the trunk's `skyZoomedLens`. `nudge` zoom the same.
- [ ] `release`: the focus rule as today, or `eyeHeightM ≥ skyReleaseHeightM(host.groundRadiusAtM(skySpotRadial(spot)), host.standoffRadii)`.
- [ ] Tests:
  - `wheel-out at the widest lens raises the eye and eases the lens toward the default` — from 1.7 m
    at 120°, one ×1.25 notch → 2.125 m and a lens strictly between 60° and 120°.
  - `wheel-in descends to standing before it narrows the lens` — from 5 m, notches of ×0.8 reach
    1.7 m at 120° before any lens below 120°.
  - `the arm releases exactly at the body arm's floor, at the default lens` — `release` false just
    under `skyReleaseHeightM`, true at it; `skyClimbLens` there is `DEFAULT_FOV_Y_RAD`.
- [ ] Commit.

### Task A3: Eye shots

- [ ] Dev server on this worktree; shots per spec §8 with a `#pose=k,…,1.7` link at Søndermarken by
      night; the exit mid-climb and landed. Dash checks with a live link. Ledger records the shots.

---

## Exit B — `sky-exit-push`

### Task B1: Port the clip `fov` channel

**review: yes** (camera drivers)

**Files:** the 17 of `git show 48f1a3341 --stat`, at current paths

- [ ] `git cherry-pick 48f1a3341`, resolve. Contract: `Channel` gains `'fov'` (log-space lerp),
      `DriverOutput.lens?: number`, the projection draws a driver's lens over `camera.lens`, the clip's
      last lens is committed with `setLens` on hand-off.
- [ ] Its tests come with it.
- [ ] Commit.

### Task B2: A tween may carry a lens

**Files:** `src/@types/camera/*/CameraTweenDescriptor.d.ts`,
`src/services/engine/camera/clips/focusMoveClip.ts`, its test

- [ ] `CameraTweenDescriptor.lens?: { readonly from: number; readonly to: number }` (radians);
      `focusMoveClip` adds an `fov` tween track over the move's duration and ease when present.
- [ ] Test `a tween with a lens draws it from → to and commits to on hand-off`.
- [ ] Commit.

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

- [ ] `step` zoom at `LENS_MAX` with `f > 1`: `skyExitPushStep`; at `pushLn ≥ SKY_EXIT_PUSH_LN`
      return `tween` and the empty push. Wheel-in and drags return the empty push.
- [ ] `replayInput.stepRow` emits `startCameraTween(tween)` when present.
- [ ] Tests:
  - `wheel-out at the widest lens releases only once SKY_EXIT_PUSH_LN accumulates`
  - `any wheel-in, drag or rest clears the exit push` — rest = `nowMs` advanced past the decay.
  - `the exit tween ends above the spot looking down at the default lens` — the `to` pose's eye is
    `SKY_EXIT_ALTITUDE_M` (± 1e-6 relative) above the spot's ground along its radial, view along −up.
- [ ] Commit.

### Task B4: Eye shots

- [ ] As A3, on this worktree; tune the three constants and the duration by eye; ledger records them.

---

## After both

- [ ] One dash ask: A or B, with each branch's shots and live links.
- [ ] Winner: rebase onto `main` once PR 1 merges, `/feature-done`, plan + spec to `completed/`,
      ledger archived, PR. Loser: branch kept unpushed-closed per the owner, worktree removed.

## Definition of Done

- **Deliverables:** `camera.lens` + `setLens` (PR 1); `CameraArmRow` step/nudge `lens?`;
  `LENS_MIN_DEG`/`LENS_MAX_DEG`; sky `step`/`nudge` filled; the winner's exit
  (A: `SkyPose.eyeHeightM`, `skyClimbStep`, release at the floor; B: `SkyExitPush`, `ctx.nowMs`,
  step `tween`, the `fov` channel, tween lens); `docs/backlog/2026-11-06-sky-mode-rest.md`.
- **Observable behaviours:** at a sky pose by night — drag right turns left and the stars stay under
  the pointer; drag down looks up and stops at the zenith; wheel narrows to 0.5° and widens to 120°;
  past 120° the winner's exit lands in the body arm at a 60° lens; wheel-in afterwards never
  re-enters the sky arm. On the tour branch: stop beat 00, drag, scroll out.
- **Deferred:** sky-mode entry, place picker, grids, takeover/Esc, readout, `fov` on URL and
  recorder, the 0.5° perf pass.
