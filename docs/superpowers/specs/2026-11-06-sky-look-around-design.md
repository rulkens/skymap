# Sky look-around — design spec

> **Status.** Drafted 2026-11-06 from the owner's rulings of 2026-11-05/06 and the refactor-ground
> checkpoint the same day. Rulings in §2 are the owner's.
> **Extends** [`completed/2026-11-03-sky-rung-slice-design.md`](completed/2026-11-03-sky-rung-slice-design.md)
> (the clip-only sky arm; "rung" there is "camera arm" here, #1039). It takes its input design from
> sky mode's spec (branch `sky-mode`, `docs/superpowers/specs/2026-10-28-sky-mode-design.md`
> §4.1, §4.3, §7), re-shaped to the frame-tag place.
> **Scope.** The sky arm answers the live controls. Two exits past the widest lens are built in full
> on sibling branches and compared by eye; one lands.

## 1. What this is

Standing on the `{ sky }` arm (today only the grand tour's beat 00 puts you there), the controls work:

- **Drag looks around.** Grab-the-sky: the sky follows the pointer at `fovY / viewportHeightPx`
  rad per px on both axes. The horizon stays level; altitude clamps at ±90°; azimuth stays free at
  the zenith.
- **Wheel / pinch changes the lens**, 0.5°–120°. The eye does not move.
- **Past 120°, wheel-out leaves the arm** for the body arm. Two shapes, §5 and §6.

Not in this work (full sky mode keeps them): entry from the UI ("Sky from here", `s`), the place
picker, grids, the takeover, Esc, the readout. §9 backlogs them.

## 2. Rulings

| #  | Ruling |
| -- | ------ |
| R1 | Look-around is built properly, not as a handover workaround (2026-11-05). |
| R2 | The wheel is the spec's: a lens zoom 0.5°–120° with an exit past 120° (sky-mode R6), not a pure climb. |
| R3 | Both exit shapes (A climb, B push + lift) are built at full quality on sibling branches; the owner picks by eye. |
| R4 | The lens after the exit eases back to 60° (`DEFAULT_FOV_DEG`) over the climb (A) or the lift's climb (B). |
| R5 | The lens moves into camera state as prep (sky-mode R12/D1), ported from `origin/sky-mode` `d37207970`. |
| R6 | The prep ships as its own PR, ahead of the feature. |
| R7 | A's climb field is `SkyPose.eyeHeightM` (≥ `SKY_EYE_HEIGHT_M`). |
| R8 | The clip `fov` channel lands in the prep PR, whichever exit wins (2026-11-06). |
| R9 | The settings slider reads `LENS_MIN_DEG`/`LENS_MAX_DEG`: one range, 0.5°–120° (2026-11-06). |
| R10 | The stored lens and every field carrying it are named `fovYRad` (radians), never `lens` (2026-11-06). |

## 3. Ground preparation

### 3.1 Ideal shape

```ts
// prep — the lens is camera state (port of d37207970) and clips can drive it (port of 48f1a3341)
type CameraState = { …; fovYRad: number };            // radians, beside base; setFovYRad(rad), selectFovYRad
type SceneSnapshot = { …; fovYRad: number };          // the takeover pins and restores it
// deleted: CameraSettings, cameraSettingsSlice, settings.camera, selectFovDeg
type Channel = … | 'fov';                         // log space; DriverOutput.fovYRad, committed on hand-off

// trunk — an arm step may author the lens
CameraArmRow<K>.step(…)  → { pose; memory; tilt; fovYRad?: number }
CameraArmRow<K>.nudge(…) → { pose; tilt; fovYRad?: number }
LENS_MIN_DEG = 0.5; LENS_MAX_DEG = 120              // src/data/camera/

// exit A — the climb is pose
type SkyPose = { azimuthRad; altitudeRad; eyeHeightM }   // eyeHeightM ≥ SKY_EYE_HEIGHT_M

// exit B — the push is memory, the lift is a framed clip
MemOf.sky = SkyExitPush = { pushLn: number; lastPushMs: number }
CameraArmCtx.nowMs: number
step(…) → { …; clip?: ClipData }                          // the arm may start a clip
body-arm clip channels carry `roll`                     // a body leg keeps its heading
```

### 3.2 Verdicts

| Touchpoint | Verdict | Why |
| --- | --- | --- |
| `settings.camera.fovDeg` (`cameraSettingsSlice.ts:11`, read at `stepCameraRuntime.ts:123`) | **Prep** | The input loop may only emit camera actions, folding them through the camera reducer so the next step sees them (`replayInput.ts:74`). A settings lens cannot be written from there. |
| Arm step/nudge result (`CameraArmRow.d.ts:38`) | **Growth** (optional member) | Two callers (`replayInput.ts:108`, `nudgeCameraArm.ts:16`); no row changes. Rejected: the lens riding in and out like `tilt` (8 pass-through cells), and a sky lane in `replayInput` (a second arm-kind branch beside the world arm's at-rest lane). |
| Sky row `step`/`nudge` cells | **Growth** | They decline today by design. |
| `SkyPose` (A) | **Growth** | A field; readers are the row's channels, its two pose utils and the URL codec. Main writes no sky frame (only the decoder names one), so the `k` row breaks no link. |
| Sky `release` (A) | **Growth** | The site arm's pattern: a pose-carried band (`siteCameraArm.ts` `release`). |
| `MemOf.sky`, `CameraArmCtx.nowMs`, step `clip`, body-leg `roll` (B) | **Growth** | Additions. The body channels' `roll` makes a body leg lossless in the basis, which the row's doc already claimed; no production clip has a body leg. B needs no `release` change: the clip's end commit leaves the arm (§6.3). |
| `applyWheelZoom`, the world arm's at-rest lane | **Not touched** | A non-world wheel already routes to the arm's step. |
| `replayInput`'s `tilt` swallow (`replayInput.ts:137`) | **Not touched** | The two-finger drag stays body-only. |

### 3.3 Prep (PR 1)

**P1. The lens is camera state.** Port `d37207970` onto main: `camera.fovYRad` (radians, seeded from
`DEFAULT_FOV_Y_RAD`), `setFovYRad`, `selectFovYRad`; the slider, the takeover pin and site shots write
`setFovYRad`; `SceneSnapshot.fovYRad` is captured and restored; `settings.camera` and its type, slice and
selector are deleted; `CORE_SNAPSHOT_CLUSTERS` drops `'camera'`. `stepCameraRuntime` reads
`stored.camera.fovYRad`. Paths moved since (`cameraFraming` is under `framing/`). Behaviour-preserving;
the ported tests (`stepCameraRuntime`, `captureScene`, `restoreSceneSaga`, `withSceneSnapshotSaga`)
are its guard.

**P2. Clips drive the lens.** Port `48f1a3341` (R8): a log-space `'fov'` channel evaluated against
the clip's start lens, `DriverOutput.fovYRad` drawn by the runtime and committed with `setFovYRad` on
hand-off; a clip without an `fov` track leaves the lens alone. Its tests come with it.

## 4. Trunk: look and lens (both exits build on it)

### 4.1 Drag

- Every drag mode the arm receives (`orbit`, `pan`) looks; `replayInput` already swallows `tilt`.
- `azimuth −= dx · g`, `altitude += dy · g`, `g = ctx.fovYRad / ctx.viewportPx[1]`; azimuth wrapped,
  altitude clamped to [−π/2, π/2]. Signs: dragging right turns you left (the sky follows the
  pointer); dragging down looks up.
- The gesture edges move nothing and return the pose by reference.

### 4.2 Wheel

- `f = spentZoomFactor(input.factor)`; `f > 1` widens. The lens is `ctx.fovYRad`; the step returns
  `fovYRad: clamp(lens · f, LENS_MIN, LENS_MAX)` and the pose by reference.
- A notch the clamp eats whole returns no `fovYRad` (declined).
- Wheel-out at `LENS_MAX` is the exit's (§5, §6).

### 4.3 The loop writes the lens

`replayInput.stepRow` emits `setFovYRad(fovYRad)` whenever a step returns one, and every later step in the
same drain reads `fovYRad` from the folded `camera.fovYRad`, so two notches in one frame compound.
`nudgeCameraArm` passes `lens` through and `stepCameraRuntime` emits it the same way. The settings
slider takes its range from `LENS_MIN_DEG`/`LENS_MAX_DEG` (R9). The frustum is
not re-derived mid-drain: only the sky arm writes the lens and it reads no frustum.

### 4.4 Nudge (the OpenSpace navigator)

`look` drives §4.1 at `pxPerRad = viewportPx[1] / fovYRad`; `zoom` drives §4.2 with
`factor = exp(zoom)`; `orbit` and `roll` are ignored (sky-mode §4.1).

## 5. Exit A: the climb (branch `sky-exit-climb`)

1. **Pose.** `SkyPose.eyeHeightM`, metres above the live ground at the spot, ≥ `SKY_EYE_HEIGHT_M`.
   Channels: `distance = eyeHeightM`; decode floors it at `SKY_EYE_HEIGHT_M`. `toParent` places the
   eye at `ground + eyeHeightM`. `fromParent` returns `SKY_EYE_HEIGHT_M` (the tag fixes the place;
   the eye snaps, as the slice rules). URL: `k,<body>,<lon>,<lat>,<az>,<alt>,<eyeHeightM>`; decode
   requires 7 fields and `eyeHeightM ≥ SKY_EYE_HEIGHT_M`.
2. **Climb.** Wheel-out with the lens at `LENS_MAX`, or any wheel while `eyeHeightM > SKY_EYE_HEIGHT_M`,
   moves the height instead of the lens: `eyeHeightM' = max(SKY_EYE_HEIGHT_M, eyeHeightM · f)`.
   Wheel-in descends first and narrows the lens only once you stand again.
3. **Lens over the climb (R4).** While climbing the lens is a function of height, written by the
   same step: log-interpolated from `LENS_MAX` at `SKY_EYE_HEIGHT_M` to `DEFAULT_FOV_Y_RAD` at the
   release height, in `ln(eyeHeightM)`.
4. **Release.** `eyeHeightM ≥ groundRadiusAtM(spot) · (host.standoffRadii − 1)`: the body arm's own
   floor (`surfaceFloorM`), ≈15 m on Earth, so the body arm takes the eye where it stands. The
   existing fold commits `toParent` (`projectFramePose.ts:154-172`). Wheel-in in the body arm never
   re-enters (`engage` is null).

**Expected feel.** Out to 120°, then you rise straight up holding your view while the lens narrows
back to 60°; at ≈15 m the body arm continues with no seam. Its recession settle
(`surfaceZoomStep.ts:90-117`) is expected to turn the view down as you keep rising; the eye check
confirms it.

## 6. Exit B: the push and the lift (branch `sky-exit-push`)

1. **Memory.** `MemOf.sky = SkyExitPush { pushLn, lastPushMs }`, empty `{ 0, −∞ }`. Wheel-out at
   `LENS_MAX` adds `ln f` to `pushLn` if `ctx.nowMs − lastPushMs < SKY_EXIT_PUSH_DECAY_MS`, else
   starts over from `ln f`. Wheel-in or a drag clears it.
2. **Clock.** `CameraArmCtx.nowMs`, filled where the context is built (`stepCameraRuntime`), the
   drain's own `nowMs`.
3. **Lift (owner ruling 2026-11-06: no roll).** When `pushLn ≥ SKY_EXIT_PUSH_LN`, the step returns
   `clip` (`skyExitLift`) and `replayInput` emits `clipStarted`; while it plays, the clip driver
   owns the display and every pose-moving step is swallowed. Two framed legs, so no leg lerps world
   angles (an eased world tween rolled through the nadir's gimbal point):
   - **Pitch**, `SKY_EXIT_PITCH_MS`, in the `{ sky }` frame: azimuth authored at its standing
     value, altitude to −π/2. The sky arm has no roll, so the horizon stays level by construction.
   - **Climb**, `SKY_EXIT_CLIMB_MS`, in the `{ body }` frame: orientation held from the leg start
     (the body channels carry `roll`, so the azimuth stays the map's heading); only the LookAt's
     target (to the spot's ground point) and range (to `SKY_EXIT_ALTITUDE_M`) move, both linear,
     so the eye climbs the spot's radial. The lens eases `LENS_MAX → DEFAULT_FOV_Y_RAD` here.
   The arm does not release, and nothing commits at the start: the climb leg is a third frame the
   fold leaves alone, and the clip's end commit (a body-arm pose) leaves the sky regime.
4. **Lens over the lift (R4).** The prep's `fov` channel (P2) carries it; the lens tween is
   frame-free, so it opens no leg.

5. **The navigator.** `nudge` carries no memory, so a navigator zoom stops at `LENS_MAX` in B;
   only the wheel and pinch exit.

**Expected feel.** Out to 120°; a few more notches show nothing; then the look tips down to your
feet and the eye climbs, ending straight down on the park at 60°. A pause longer than the decay
starts the count over.

## 7. Tests (acceptance)

Test names are the contract.

- Prep: the ported tests only.
- `skyCameraArm.test.ts` (trunk):
  - `drag turns the view at fovY / heightPx and the sky follows the pointer` — at 1°, 60° and 120°.
  - `altitude clamps at ±90° and azimuth stays free at the zenith`
  - `the horizon stays level after any drag sequence`
  - `wheel scales the lens multiplicatively inside [LENS_MIN_DEG, LENS_MAX_DEG]`
  - `a notch the lens clamp eats whole is declined by reference`
  - `nudge look and zoom move the view and the lens at the drag's rate`
- `replayInput.test.ts`: `two lens notches in one drain compound`.
- A, `skyCameraArm.test.ts`:
  - `wheel-out at the widest lens raises the eye and eases the lens toward the default`
  - `wheel-in descends to standing before it narrows the lens`
  - `the arm releases exactly at the body arm's floor, at the default lens`
  - `toParent keeps the climbed eye` — the body-arm eye sits at ground + `eyeHeightM`.
  - codec: `sky frame with eyeHeightM round-trips`; a 6-field `k` row or `eyeHeightM < 1.7` decodes null.
- B, `skyCameraArm.test.ts`:
  - `wheel-out at the widest lens releases only once SKY_EXIT_PUSH_LN accumulates`
  - `any wheel-in, drag or rest clears the exit push`
  - `the exit lift ends above the spot looking down at the default lens`
- B, `stepCameraRuntime.test.ts` (`the sky exit lift`):
  - `keeps the horizon level the whole way, pitching down at a fixed azimuth first`
  - `hands off 100 m above the spot looking straight down at the default lens`
- Prep P2: the ported `fov` channel tests (`evaluateClip`, `stepCameraRuntime`).

## 8. Eye checks

On each exit branch, a deep link `#pose=k,earth,<Søndermarken lon>,<lat>,…` at night (the tour's
`TOUR_NIGHT_SIM_DAYS`), shot and sent as a dash check, plus a live link to try:

1. Drag in all four directions; the grabbed stars stay under the pointer.
2. Wheel in to 1° on a star, out to 120°.
3. Keep scrolling out: the exit, mid-way and landed.

The owner picks A or B. The winner's PR carries the trunk; the loser's branch is closed unmerged.
Acceptance after merge, on the tour branch: stop `#tour=grandTour` in beat 00, drag, scroll out.

## 9. Backlog (what remains of sky mode)

One `docs/backlog/` file, replacing nothing: entry ("Sky from here" + `s`, `skyEntry`), the place
picker, `skyGrids`, the `sky` takeover with Esc, the readout, the `fov` URL/recorder lens, and the
perf pass at 0.5° (sky-mode §7). The sky-mode spec must take this spec's arm shape when it resumes.

## 10. Left to the builder

- B's `SKY_EXIT_PUSH_LN`, `SKY_EXIT_PUSH_DECAY_MS`, `SKY_EXIT_ALTITUDE_M` and the two phase durations,
  eye-checked.
- Where the lens constants live under `src/data/camera/` (one symbol per file).
