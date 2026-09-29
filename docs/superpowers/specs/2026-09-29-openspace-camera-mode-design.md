# OpenSpace camera mode — design spec

A second, user-selectable camera **control scheme** that drives like OpenSpace, so planetarium and OpenSpace operators feel at home. The existing scheme (`skymap`) stays behaviourally unchanged.

Rulings came from the brainstorm of 2026-09-25 → 2026-09-29 (dash asks dHGq, PeRh, 6AXs, plus chat sign-off of design §1–§3 and the `lookOffset` follow-up). They are listed in §2 and are not re-litigated here. The OpenSpace facts are verified against the v0.22.0 source: `src/navigation/orbitalnavigator/{orbitalnavigator,orbitalinputhandler,mousecamerastates}.cpp` and `data/assets/default_keybindings.asset`. Background: [`docs/research/2026-08-24-camera-pivot/openspace-camera-notes.md`](../../research/2026-08-24-camera-pivot/openspace-camera-notes.md).

## 1. What this is

- A persisted setting chooses the scheme: `'skymap' | 'openspace'`. `shift+c` toggles it, and the settings panel has a select for it.
- In `openspace`, a mouse button plus modifier, **latched at press**, selects one of four axes:

  | Input | Axis |
  |---|---|
  | left | **orbit** around the focus |
  | ctrl+left | **look** around in place |
  | right, or alt+left | **zoom** (vertical delta only) |
  | middle, or shift+left | **roll** |

- Each axis has a **velocity**. While the button is held, the velocity tracks the mouse. After release it decays by OpenSpace's friction law, but only if that axis's friction is on; otherwise it continues forever.
- Velocities apply every frame to whichever camera arm is live (world, body, site), each through its own solve.
- The wheel, pinch, double-click, `f` focus, tours, clips and URL poses behave exactly as in `skymap`.

Packaging: **two PRs**. PR 1 is the ground preparation (§3): five behaviour-neutral commits. PR 2 is the feature (§4–§10). Each PR gets its own plan. There is no deletion audit on PR 1, and one at PR 2's `/feature-done`.

## 2. Rulings

| # | Ruling |
|---|---|
| R1 | Purpose: familiarity for OpenSpace operators. Where skymap and OpenSpace differ, the openspace scheme follows OpenSpace unless another ruling says otherwise. |
| R2 | Architecture: a **separate navigator with its own velocity state**, authored through its own driver rows. The input-mapping-table plus flick-coast alternative was rejected. |
| R3 | Friction is **true OpenSpace**: `v *= 1 − min(dt / friction, 1)` per frame on axes with friction on. Friction off means the axis never decays and is stopped only by reversing it or by a preempting driver. This **revises grill Q8** ([`globe-camera-pivot-2026-08-24.md`](../../grill-sessions/globe-camera-pivot-2026-08-24.md)), which rejected velocity/friction models, for the openspace scheme only. |
| R4 | No WASD fly (OpenSpace ships none). No Z/X sensitivity ramp, no local roll, no `R` idle motion. |
| R5 | The wheel keeps skymap's zoom in both schemes (OpenSpace's wheel is unused). |
| R6 | `f` stays focus. Friction toggles live **only** in the settings panel; OpenSpace's F / Shift+F / Ctrl+F are not bound. |
| R7 | The scheme applies to **all arms**, each through its own solve. The site arm ignores look and roll. |
| R8 | The mode hotkey is `shift+c`. |
| R9 | World-arm look is **true OpenSpace**: the view turns off the anchor and stays turned while orbiting. It is carried by a new optional `CameraPose.lookOffset`, so `target` stays the pivot and R12b-3's no-teleport guarantee holds (§8). |
| R10 | A coasting camera is preempted by anything the user triggers (focus, home, fly-to, clip, tour). Preemption commits and zeroes every velocity, which matches OpenSpace resetting velocities on an anchor change. |
| R11 | During an endless (friction-off) spin, `camera.base` and the URL hash keep the last committed pose. There is no timed commit. |
| R12 | The scheme and friction settings persist in localStorage and sit outside `SettingsSnapshot`, so a tour or takeover never restores them away. |
| R13 | PR packaging: one prep PR (P1–P5), then the feature PR. The adjacent findings are backlogged (§3.4). |

## 3. Ground preparation

### 3.1 Ideal shape

```ts
type ControlSchemeId = 'skymap' | 'openspace';
type NavAxis = 'orbit' | 'look' | 'zoom' | 'roll';
type FrictionGroup = 'rotational' | 'zoom' | 'roll';          // orbit+look share 'rotational'
type CameraControlsSettings = {                               // own cluster, not in SettingsSnapshot
  scheme: ControlSchemeId; friction: number; frictionOn: Record<FrictionGroup, boolean>;
};
type InputStep = … | { kind: 'navDrag'; axis: NavAxis; deltaPx: Vec2 };   // new kind, not a DragMode variant
type ArmDelta = { orbit?: Vec2; look?: Vec2; zoom?: number; roll?: number };  // rad, rad, ln-factor, rad
type NavigatorState = { velocity: NavVelocity; held: NavAxis | null; lastNowMs: number | null };
                                                              // CameraRuntime.navigator
type CameraPose = { …; roll?: number; lookOffset?: Vec2 };    // yaw, pitch of view about the orbit sightline

RungRow.nudge(framed, delta: ArmDelta, ctx): FramedCameraPose  // new column, one cell per rung
CONTROL_SCHEMES: Record<ControlSchemeId, ControlScheme>        // { drivers, bindAxis(button, mods) }
CAMERA_DRIVERS += openSpaceHeld (80), openSpaceCoast (50)      // both commitsOnEdge
KEYBOARD_SHORTCUTS += 'shift+c'
```

### 3.2 Verdicts

| Touchpoint | Verdict | Why |
|---|---|---|
| New input kind `navDrag` | growth | Every rung declines unknown kinds by reference (`absoluteRung.ts:21`, `surfaceStep.ts:101`, `steppedSitePose.ts:53`). The aggregator (`inputAggregator.ts:53`) and `replayInput.ts:176` each gain one `case`. |
| Rung motion in radians/factors | **bolt-on → P1** | `RungRow.step` takes pixels only (`RungRow.d.ts:29`). Body-arm orbit and look sit inline in `draggedSurfacePose.ts:49-73`, behind a ray cast that picks the mode (`latchSurfaceGesture.ts:26`). |
| Driver activity from runtime state | **bolt-on → P2** | `isActive(s, approachDone?)` sees only the store plus one positional runtime fact (`CameraDriver.d.ts:28`, `stepCameraRuntime.ts:163`). A navigator flag would be a second special argument. |
| Scheme selection | **bolt-on → P3** | Otherwise `scheme ===` lands in orbitDrag, two new rows and replayInput routing: four sites for one fact. |
| Persisted setting | **second special case → P4** | The only persisted value is the splash version (`persistSplashVersion.ts:27`, installed `main.tsx:96`). |
| View off the pivot | **missing field → P5** | `CameraPose` can't express a look direction other than toward `target` (`CameraPose.d.ts`, R12b-3 at `cameraSlice.ts:56`). |
| `CameraRuntime.navigator` + seed | growth | `CameraRuntime.d.ts:17`, `seedCameraRuntime.ts:32`. It rides the hand-assembly in `stepCameraRuntime.ts:274` like the follow and tilt fields. |
| Commits | growth | `commitsOnEdge` (`commitOnEdge.ts:42`) already commits the departing row's register. At-rest, handoff and scheme toggle are all the row deactivating. |
| Wake while coasting | growth | Ride `stepCameraRuntime`'s `requestRender` return (`:294` → `runFrame.ts:140`), not a new OR term in `shouldKeepTicking.ts`. |
| Shortcut | growth | A data row in `keyboardShortcuts.ts:43`. |
| Settings cluster | growth | A new cluster in `coreSettingsSlices.ts`, kept out of `SettingsSnapshot` the way `orientation` is. |

Greenfield cross-check: a fresh derivation from the requirements alone agreed on all of the following:
- a scheme registry;
- the axis latched into the event;
- a single "driver exits ⇒ commit" rule;
- per-arm `apply(delta)` with unsupported axes dropped;
- one writer for velocity.

It placed velocity in module state; this spec keeps it in `CameraRuntime`, because `runFrame` is the single writer by convention (a real constraint, and it costs nothing). No compatibility tension was found, and nothing persisted or deployed changes shape except the optional `lookOffset`, which reads as absent ⇒ 0.

### 3.3 Prep list (PR 1, one commit each, all behaviour-neutral)

- **P1: the `nudge` rung column.** Add `nudge(framed, ArmDelta, ctx)` to `RungRow` and implement it on all three rungs:
  - **absolute:** orbit is yaw/pitch through the same pitch clamp `applyInputToCamera` uses; zoom goes through `zoomedDistance`; roll adds to `pose.roll`. Look is a no-op until P5.
  - **body:** orbit and look are extracted from `draggedSurfacePose.ts:49-73` into pure functions of an angle pair, and both the old pixel path and `nudge` call them. Zoom goes through `surfaceZoomStep` with a null (screen-centre) anchor. Roll turns `basisLocal` about the view axis.
  - **site:** orbit maps to heading/elevation and zoom to range. Look and roll return the pose by reference.

  Each arm's orbit **proximity scaling** (the world arm's altitude damping at `applyInputToCamera.ts:73`, and its body and site equivalents) moves inside the arm, so pixel `step` and `nudge` share it and `ArmDelta` stays arm-agnostic. Tests: each cell against the pixel path at the equivalent angle.
- **P2: driver activity bag.** Replace `isActive(s, approachDone?)` with `isActive(s, activity: DriverActivity)`, where `DriverActivity = { approachDone: boolean }` and `stepCameraRuntime` builds it once per frame. PR 2 adds `navHeld` and `navMoving`.
- **P3: scheme-selected driver table.** Add `CONTROL_SCHEMES: Record<ControlSchemeId, ControlScheme>`, where `ControlScheme = { drivers: readonly CameraDriver[]; bindAxis: (button, mods) => NavAxis | null }`. `skymap` is today's `CAMERA_DRIVERS` with `bindAxis: () => null`. The loop picks the table from the scheme each frame (`startLoop.ts:47` injection becomes a registry lookup; a fixture override still works). Only `skymap` exists in PR 1, and the id type is the one-member union `'skymap'`.
- **P4: `persistSetting` joint.** Add `persistSetting(store, { key, select, parse })`: a subscribe-diff writer with try/catch around storage, plus a `hydratePersistedSettings(initial)` read folded into `INITIAL_SETTINGS` at boot. The splash version migrates onto it, and `persistSplashVersion.ts` and `splashStorage.ts` are deleted.
- **P5: `CameraPose.lookOffset?: Vec2`.** Thread it through every reader of `roll`, about 20 files:
  - `assembleOrbitCamera`/`computeViewProj` turn the view basis by it;
  - tween and clip interpolation (`tweenToClip`, `evaluateClip`) ease it;
  - `reencodePose`, `poseFrameConversion`, `releasedWorldArm` carry or zero it;
  - the `#pose=` hash encodes it when non-zero;
  - the two renderers that rebuild the camera themselves (`horizonShellRenderer`, `zoneOfAvoidanceRenderer`) read it.

  It is always 0 in PR 1. Tests: the view matrix at a non-zero offset keeps the eye fixed and turns the forward vector, and a URL round-trip holds.

### 3.4 Adjacent findings (backlogged, not in either PR)

- `DragMode` consumers test `=== 'pan'`, so a new variant silently falls into orbit.
- `runTakeoverSaga.ts:29` replaces the whole `camera` settings cluster.
- `defaults.ts:117` says the palette is persisted, which is stale.

## 4. Settings, persistence, hotkey, UI

- **Cluster.** `settings.cameraControls: CameraControlsSettings`, with defaults `{ scheme: 'skymap', friction: 0.5, frictionOn: { rotational: true, zoom: true, roll: true } }` (OpenSpace's defaults). Constants live in `src/data/camera/openSpaceNavigation.ts`.
- **Persistence.** One `persistSetting` row, key `skymap.cameraControls.v1`. `parse` validates each field and falls back to the default field by field, so a malformed entry never breaks boot.
- **Hotkey.** Shortcut row `shift+c` runs `toggleControlScheme()`.
- **UI.** A "Camera controls" section in the settings panel, built per `create-component`:
  - a Skymap / OpenSpace select labelled with `shift+c`;
  - when OpenSpace is selected, three friction checkboxes and a 0–1 friction slider.

  There is **no toast**: the app has no toast mechanism, and the select shows the live scheme. This departs from design §3 as approved in chat.

## 5. Input capture

- `OrbitControlsOptions` gains `bindAxis: (button, mods) => NavAxis | null`, which `wireInput.ts:241` reads from `CONTROL_SCHEMES[scheme]` at press.
- At pointer-down, a non-null axis latches for the gesture. The recognizer then emits `navDrag` events carrying that axis and each move's pixel delta, and never re-reads the modifiers mid-drag.
- A null axis (the `skymap` scheme) takes today's path untouched.
- A `navDrag` release never click-picks. The click test stays tied to the skymap `orbit` mode.
- `beginDrag`/`endDrag` and `cancelCameraTween` fire as for any gesture, so `camera.dragging` still means "a button is held".
- The aggregator folds consecutive `navDrag` moves of the same axis by summing `deltaPx`.
- `replayInput` hands a `navDrag` step to the navigator, not the rung.

## 6. The navigator

`CameraRuntime.navigator: NavigatorState`, advanced inside `stepCameraRuntime`, whose single writer is `runFrame`:

1. `dt = clamp(nowMs − lastNowMs, 0, 100 ms)`. On the first frame (`lastNowMs === null`) `dt` is 0.
2. **Held axis:** the velocity approaches `deltaPx · gain[axis] / dt` with the same damping law as release, so a held but motionless mouse comes to rest (OpenSpace's `DampenedVelocity::set`; the plan verifies the exact form against the source before coding).
3. **Released axes:** `v *= 1 − min(dt / friction, 1)` when `frictionOn[group(axis)]` is on; unchanged otherwise. Anything below `NAV_REST_EPS` snaps to 0.
4. `ArmDelta = v · dt`, per axis. The zoom axis uses only the vertical delta, and its sign matches OpenSpace (verified in the plan).

`gain` starts from OpenSpace's `MouseSensitivity` default (15 × 1e-4) and is tuned by feel side by side with OpenSpace. Velocities are arm-agnostic (§3.3 P1), so a coast that crosses an arm boundary (the regime fold runs during coast, `projectFramePose.ts:109`) carries on without a wipe or remap.

## 7. Driver rows and commits

| Row | Priority | Active when | Flags |
|---|---|---|---|
| `openSpaceHeld` | 80 | `activity.navHeld` | `pivotsOnFocusedBody`, `commitsOnEdge` |
| `openSpaceCoast` | 50 | `!activity.navHeld && activity.navMoving` | `pivotsOnFocusedBody`, `commitsOnEdge` |

- Both rows sit only in `CONTROL_SCHEMES.openspace.drivers`, which is `skymap`'s table with `orbitDrag` replaced. Their `pose` is the register after `nudge(ArmDelta)` has been applied, and the navigator writes it before `pickWinner`.
- Priority 50 puts a coast **below** `followApproach` (55) and tween (60) and above `autoRotate` (20), so any focus, home or fly-to preempts it (R10).
- **Commit edges.** All three come free from `commitsOnEdge`:
  - **at rest:** `navMoving` goes false;
  - **handoff:** a higher row wins;
  - **scheme toggle:** the table swaps and the row vanishes.
- On a handoff, and on a scheme toggle, `stepCameraRuntime` zeroes the navigator (sibling of the `followIn` reset at `:180`).
- **R11:** there is no other commit.

## 8. `lookOffset` (world arm)

- `lookOffset = [yaw, pitch]` turns the **view basis** about the eye after the orbit terms place it. `target`, `yaw`, `pitch` and `distance` keep their meaning, so the focus pin's re-centring (`applyFocusedBodyPivot`) and R12b-3's eye derivation are untouched.
- The R12b-3 comment is reworded to "every committed absolute pose's **orbit terms** are centre-looking; `lookOffset` turns only the view".
- The look axis on the world arm adds to `lookOffset`, with pitch clamped to ±(π/2 − 0.01).
- A tween, clip or focus change eases `lookOffset` to 0 over its own duration (OpenSpace's retarget aim).
- In the `skymap` scheme nothing writes it. After switching back, an existing offset stays until the next tween clears it.
- Body-arm look is native to `basisLocal` and needs no offset. Arm conversions carry or zero it (P5), and PR 2 keeps today's disengage retarget, which zeroes it.

## 9. Wake

`stepCameraRuntime` already returns `requestRender`. PR 2 ORs in `navigator.held !== null || navMoving`, so a coast keeps frames ticking and an at-rest navigator lets the loop sleep.

## 10. Testing

These are the tests that can catch a real bug nothing else catches ([`testing.md`](../conventions/testing.md)):

- **Navigator (pure):**
  - decay matches the law at several `dt`;
  - an axis with friction off holds its velocity;
  - the 100 ms `dt` cap holds;
  - the ε snap makes `navMoving` fall exactly once;
  - a held, motionless mouse comes to rest.
- **Latch:** the button+modifier table, and a modifier released mid-drag keeping the axis.
- **nudge (P1):**
  - each rung matches its pixel path at the equivalent angle;
  - site look/roll return by reference;
  - body roll keeps `basisLocal` orthonormal.
- **Drivers:**
  - held → coast → rest commits once;
  - a tween during coast preempts, commits once and zeroes velocities;
  - a scheme toggle mid-coast commits once;
  - the skymap table is byte-identical to today's `CAMERA_DRIVERS`.
- **lookOffset (P5):**
  - the eye is invariant under the offset;
  - forward turns by the offset;
  - the `#pose=` round-trip holds;
  - a tween eases it to 0.
- **Persistence (P4):**
  - round-trip;
  - a throwing or malformed storage falls back to defaults;
  - the splash version still persists.
- **Visual check (user):** drive both schemes on the dev server, ideally beside OpenSpace. Check orbit around Earth with look offset held, friction on/off per axis, preemption by `f` during a spin, and a coast across the body-arm band.

## 11. Risks

- **Held-velocity law.** OpenSpace's exact `DampenedVelocity::set` form isn't in our notes. The plan's first navigator task reads it from source; the feel depends on it.
- **Coast across the arm band.** The fold runs mid-coast, and disengage zeroes `lookOffset`, so a look-offset spin that sinks into the body arm snaps its view once. If the eye-check objects, the fix is to carry the offset into `basisLocal` at disengage.
- **Endless spin and stale URL (R11).** Accepted.
- **P5 blast radius.** About 20 `roll` readers. Two renderers rebuild the camera themselves (the backlog's off-axis fovY item names the same two), and a missed reader shows a view that disagrees with picking. Tests pin the view matrix, and the eye-check covers labels and picks with an offset.

## 12. Definition of done

- PR 1 is green, with a behaviour-neutral eye-check in the `skymap` scheme.
- PR 2 is green, the §10 visual check is passed by the user, and there is a deletion audit at `/feature-done`.
- `docs/RENDERER.md` or the camera docs name the scheme registry and the `nudge` column.
- The Q8 revision is noted in the grill file, pointing here.
