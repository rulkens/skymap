# Camera lens: the field of view becomes camera state with a clip channel — plan

> **Spec.** [`specs/2026-10-28-sky-mode-design.md`](../specs/2026-10-28-sky-mode-design.md), R12 + D1,
> prep P2. Shipped as **its own PR**, ahead of the rest of sky-mode prep (user, 2026-10-28).
> **Gate.** `npm run typecheck`, `npm test`, `npm run build`. No authored clip, beat or exhibit sets a
> lens, so camera golden traces stay byte-identical.

## Strategy

The lens moves out of `settings.camera` into the camera's intent, **beside** `camera.base` and not
inside it. Inside `base` every slider tick would change `base`'s identity, and `stepCameraRuntime`
reads any `base` it did not write as an outside commit (`external`, `stepCameraRuntime.ts:83`): the
follow rows re-adopt and the approach ends. A lens change is not a camera move, so it gets its own
field.

The clip system drives it through a new `fov` channel. `CameraPose.fov?` is the channel's field.
The clip driver reports the lens it evaluated (`DriverOutput.lens?`), the frame's projection draws
it, and when the driving row hands off, the runtime commits the last driven lens. That's the same
"commit on edge" rule the pose already follows, so a dolly zoom never snaps back.

`settings.camera` held only `fovDeg`, so the cluster, its type, slice and selector are deleted. The
takeover lens pin becomes a `setLens` commit, and `SceneSnapshot` carries the lens so the restore
hands the viewer's lens back.

Not in this PR (YAGNI until a consumer exists): a lens on `CameraTweenDescriptor`, the URL pose
codec and the recorder. Sky mode adds its own `sky=` URL row with the lens.

## Contract

```ts
// src/@types/camera/CameraState.d.ts
type CameraState = { …; /** Vertical field of view, radians: the viewer's committed lens. */ lens: number };
// src/state/camera/cameraSlice.ts
setLens(fovYRad: number)                      // initial: DEFAULT_FOV_Y_RAD

// src/@types/camera/CameraPose.d.ts — the clip channel record only
type CameraPose = { …; /** Vertical FOV, radians. Absent ⇒ the lens holds. */ fov?: number };
type Channel = 'distance' | 'yaw' | 'pitch' | 'roll' | 'target' | 'fov';
CHANNEL_SPACE.fov = 'log'

// src/@types/engine/camera/DriverOutput.d.ts
type DriverOutput = { …; /** This frame's lens when the row animates it; absent ⇒ camera.lens. */ lens?: number };
// src/@types/engine/state/CameraRuntime.d.ts
type CameraRuntime = { …; /** Last frame's driven lens; committed when the driving row hands off. */ drivenLens: number | null };

// src/@types/engine/settings/SceneSnapshot.d.ts
type SceneSnapshot = { …; lens: number };

playClip's getLivePose → { ...liveWorldPose, fov: outputs.projection.fovYRad }   // the drawn lens
```

Clip evaluation reports `fov` **only when the clip has a `fov` track** (base, rate or osc). A clip
that never touches the lens reports none, so the slider stays live under it. `fov` is
frame-independent, so it is evaluated outside the leg conversion (`convertChannels` never sees it).

## Tasks

### T1. The lens moves into camera state (one commit)

- **New state.** `CameraState.lens` + `setLens`, seeded from `DEFAULT_FOV_Y_RAD` (`cameraFraming.ts`).
- **Readers move to it.**
  - `stepCameraRuntime`'s projection reads `rootState.camera.lens`.
  - `DisplaySectionContainer` reads and writes the lens in degrees (the `DisplaySection` props are
    unchanged).
  - `tools/site/utils/siteShotActions.ts` dispatches `setLens`.
- **Takeover pin.** `withSceneSnapshotSaga` replaces its `mergeSnapshot({ camera })` with
  `setLens(DEFAULT_FOV_Y_RAD)`. `captureScene` captures `lens`, and `restoreSceneSaga` puts it back.
- **Deleted.**
  - `CameraSettings`, `cameraSettingsSlice` and its `coreSettingsSlices` row,
    `CoreSettingsState.camera` and `selectFovDeg`.
  - The fixtures' camera cluster.
  - The backlog index line "Takeover's camera-cluster merge wipes any field it doesn't set" and its
    detail file `docs/backlog/2026-09-29-takeover-replaces-camera-cluster.md`.
- **Tests.**
  - `stepCameraRuntime.test.ts`: the resize/FOV test reads `camera.lens`. New:
    `a lens change is not an outside commit` (base identity untouched; `external` stays false, so
    the follow memory survives).
  - `withSceneSnapshotSaga.test.ts`: `pins the lens to the default and gives the viewer theirs back
    on exit`.
  - `restoreSceneSaga.test.ts`: `restores the captured lens`.

### T2. The `fov` clip channel (one commit)

- **Channel plumbing.**
  - `Channel` gains `'fov'`. `CHANNEL_SPACE`, `ALL_CHANNELS`, the `tween`/`set` channel unions and
    every exhaustive `Record<Channel, …>` follow; the compiler lists them.
  - `evaluateFramedClip` adds `channels.fov` when the compiled clip carries any `fov` track,
    evaluated from `start.fov ?? DEFAULT_FOV_Y_RAD`.
- **Clip start.**
  - `engine.ts` wires `playClip`'s `getLivePose` with the drawn lens as `fov`, so a `'live'` start
    carries it. `resolveClipStart` is unchanged. An authored concrete start without `fov` starts
    from the default lens, the lens takeovers pin.
- **Runtime.**
  - The clip driver returns `lens: evaluated.channels.fov`.
  - `stepCameraRuntime` draws `output.lens ?? camera.lens`.
  - It stores `drivenLens`, and on a frame where `prev.drivenLens !== null` and this frame has
    none, it pushes `setLens(prev.drivenLens)`.
- **Tests.**
  - `evaluateClip.test.ts`:
    - `a fov tween interpolates the lens geometrically`
    - `a clip without a fov track reports no lens`
    - `a fov track starts from the resolved start lens`
  - `stepCameraRuntime.test.ts`:
    - `a playing fov clip draws its lens`
    - `the driven lens is committed when the clip hands off`
    - `a clip without a fov track leaves the slider lens live`

### T3. Docs (one commit)

- Spec P2 and D1 are amended to the shape that landed.
- No other doc named `settings.camera.fovDeg`. The website's settings reference row drops its
  state path (`docsSettings.ts`), since the lens is camera state now.
- `comment-audit` runs over the touched files.
