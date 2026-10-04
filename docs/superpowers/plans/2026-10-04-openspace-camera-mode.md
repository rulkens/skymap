# OpenSpace camera mode — PR 2 feature

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A second, persisted camera control scheme, `openspace`, that drives like OpenSpace on every arm. The `skymap` scheme stays behaviourally unchanged.

**Architecture:**
- A pure navigator owns per-axis velocities in `CameraRuntime.navigator`. Each frame it turns the frame's `navDrag` input into an `ArmDelta`, which the live rung applies through PR 1's `nudge` column.
- Two driver rows, `openSpaceHeld` (80) and `openSpaceCoast` (50), sit only in `CONTROL_SCHEMES.openspace`. They form one commit family, so held → coast → rest commits once.
- The recognizer latches an axis at press through `ControlScheme.bindAxis` and emits pixel deltas. The `skymap` scheme's `bindAxis` returns null, so its gestures take today's path.
- A `cameraControls` settings cluster (scheme + friction), persisted through PR 1's `PersistedValue` table, a `shift+c` shortcut and a settings-panel section.

**Tech stack:** TS, Vitest, RTK (no react-redux), React.

**Spec:** [`docs/superpowers/specs/2026-09-29-openspace-camera-mode-design.md`](../specs/2026-09-29-openspace-camera-mode-design.md), §4–§10. PR 1 shipped as #830 (`0c9060852`). Its ledger, with the PR 2 notes, is [`completed/2026-09-29-openspace-camera-prep.ledger.md`](completed/2026-09-29-openspace-camera-prep.ledger.md).

## Rulings made at plan time (deviations from the spec)

OpenSpace facts come from the v0.22.0 source (`dampenedvelocity.inl`, `mousecamerastates.cpp`, `orbitalcamerastates.cpp`, `orbitalnavigator.cpp`), verified 2026-10-04.

1. **Driver families (new prep commit, Task 1).** `commitOnEdge` treats rows as one author only for the hand-listed follow pair (`commitOnEdge.ts:40`, `isFollowDriverId`). Held → coast would be a second hand-listed pair, so a `family` field on `CameraDriver` replaces the hand list. The spec did not foresee this joint.
2. **One reset rule.** The spec zeroes the navigator on handoff and on scheme toggle (§7). The plan uses one rule: the navigator returns to rest on any frame whose winner is not in the `openSpace` family. That covers handoff, scheme toggle (the rows vanish), and a clip or tween preempting a held drag.
3. **Friction groups follow the source.** OpenSpace's `rotational` toggle gates only orbit. Its `roll` toggle gates look and both rolls (`orbitalcamerastates.cpp:38-46`). The spec's sketch had orbit and look sharing `rotational`; R1 (follow OpenSpace) wins: `orbit → rotational`, `look → roll`, `roll → roll`, `zoom → zoom`.
4. **Gain seed.** OpenSpace's `MouseSensitivity` (15 × 1e-4) is radians per raw pixel per second of velocity, and it is multiplied by an altitude scale that skymap's arms already own. The plan seeds orbit, look and roll at **1× the skymap drag's own rate** (`fovY / cssHeight` radians per pixel) at steady hold. It seeds zoom at **0.005 ln-units per pixel**. All are tuned by feel at the visual check.
5. **Touch in the openspace scheme.** A touch or pen press binds `orbit`, so every pointer gesture in that scheme goes through the navigator, and `orbitDrag` can be absent from its table. A second finger still pinches, through the rung's existing zoom step, while the held row echoes the register.
6. **Scheme toggle commit needs the previous table.** The spec says the toggle commit "comes free" from `commitsOnEdge`. It does not: `commitOnEdge` looks the departing row up in the current table, where a toggled-away row no longer exists. Task 4 moves the scheme lookup into `stepCameraRuntime` and records last frame's scheme in `CameraRuntime`.

## Global constraints

- The `skymap` scheme is behaviour-neutral. No existing test changes its expected values, and the camera goldens (`tests/**/golden*`) stay byte-identical.
- `type` aliases, never `interface`. One type per `@types/` file, one function per `utils/` file, filename = symbol.
- Frame files (`src/services/engine/frame/**`) export only their named symbol.
- Narrow contracts: a function takes only what it reads (no `RootState` into helpers).
- Comments explain why, never what: module header ≤ 10 lines, comment lines ≤ half the code lines.
- Format with `npx prettier --write <files>`, never `npm run format`. No `Co-Authored-By` lines in commits.
- React components are created per the `create-component` skill. Presentational components take props only; store access lives in `src/components/containers/`.
- Constants live in `src/data/camera/openSpaceNavigation.ts`, with these exact values:

  | Name | Value | Meaning |
  |---|---|---|
  | `DEFAULT_CAMERA_CONTROLS` | `{ scheme: 'skymap', friction: 0.5, frictionOn: { rotational: true, zoom: true, roll: true } }` | OpenSpace defaults |
  | `NAV_FRICTION_EPS` | `1e-7` | OpenSpace's `velocityScaleFromFriction` guard |
  | `NAV_DT_CAP_MS` | `100` | |
  | `NAV_REST_EPS` | `1e-4` | per axis, ArmDelta units per second |
  | `NAV_ROTATION_GAIN` | `{ orbit: 1, look: 1, roll: 1 }` | multiples of the drag rate `fovY / cssHeight` |
  | `NAV_ZOOM_LN_PER_PX` | `0.005` | |
  | `NAV_FRICTION_GROUP` | `{ orbit: 'rotational', look: 'roll', roll: 'roll', zoom: 'zoom' }` | ruling 3 |

## Review focus

1. **One commit per motion.** Held → coast → rest must commit `base` exactly once, and so must a tween preempting a coast, or a scheme toggle mid-coast. A double commit shows only as a URL-hash flicker or a wrong undo point. Pinned in Task 4.
2. **Zenith flip from a combined pitch.** On the world arm, orbit pitch plus `lookOffset` pitch can pass ±π/2 and flip the view basis. Pinned in Task 3.
3. **Modifier released mid-drag.** The axis latched at press must hold for the whole gesture. Pinned in Task 5.
4. **Coast across an arm boundary.** The regime fold runs mid-coast (`projectFramePose.ts:109` skips it only while `dragging`). Velocities must carry through the frame change unchanged. Pinned in Task 4.
5. **Malformed or hostile storage.** A bad `skymap.cameraControls.v1` entry must fall back field by field and never break boot. Pinned in Task 6.

---

### Task 1: Driver families replace the follow hand list — `review: yes`

Behaviour-neutral prep, its own commit.

**Files:**
- Create: `src/@types/engine/camera/DriverFamily.d.ts`
- Modify: `src/@types/engine/camera/CameraDriver.d.ts`
- Modify: `src/services/engine/camera/cameraDrivers.ts` (the `followApproach` and `followHold` rows)
- Modify: `src/services/engine/camera/commitOnEdge.ts:38-41`

**Contract:**
```ts
export type DriverFamily = 'follow' | 'openSpace';
// CameraDriver gains:
readonly family?: DriverFamily;   // rows sharing a family are one author: no edge commit between them
```
In `commitOnEdge`, `sameAuthor` becomes "same id, or both rows carry the same defined `family`". The departing row is looked up from `drivers`, as today. `isFollowDriverId` keeps its other three readers (`cameraDrivers.ts:165`, `replayInput.ts:212`, `shouldKeepTicking.ts:26`): they ask "is this the follow row", not "same author".

- [ ] Tag both follow rows `family: 'follow'` and switch `sameAuthor` to read the field.
- [ ] No new test: the existing follow-pair edge test in `tests/services/engine/camera/commitOnEdge.test.ts` is the gate and must pass untouched.
- [ ] `npm run typecheck:fast && npm test -- camera` is green. Commit: `refactor(camera): driver families replace the follow hand list in commitOnEdge`.

### Task 2: The navigator (pure) — `review: yes`

**Files:**
- Create: `src/@types/camera/NavAxis.d.ts`, `src/@types/camera/FrictionGroup.d.ts`, `src/@types/camera/NavVelocity.d.ts`, `src/@types/camera/NavigatorState.d.ts`, `src/@types/camera/NavStep.d.ts`, `src/@types/camera/NavSettings.d.ts`
- Create: `src/data/camera/openSpaceNavigation.ts` (the Global Constraints table, except `DEFAULT_CAMERA_CONTROLS`, which Task 4 adds once its type exists)
- Create: `src/utils/camera/stepNavigator.ts`
- Test: `tests/utils/camera/stepNavigator.test.ts`

**Contract:**
```ts
export type NavAxis = 'orbit' | 'look' | 'zoom' | 'roll';
export type FrictionGroup = 'rotational' | 'zoom' | 'roll';
export type NavVelocity = { readonly orbit: Vec2; readonly look: Vec2; readonly zoom: number; readonly roll: number };
export type NavigatorState = {
  readonly velocity: NavVelocity;        // ArmDelta units per SECOND
  readonly held: NavAxis | null;
  readonly lastNowMs: number | null;
};
export type NavStep =                     // the subsequence of InputStep the navigator reads
  | { readonly kind: 'navDrag'; readonly axis: NavAxis; readonly deltaPx: Vec2 }
  | { readonly kind: 'gestureEnd' };
export type NavSettings = { readonly friction: number; readonly frictionOn: Readonly<Record<FrictionGroup, boolean>> };

export const NAV_AT_REST: NavigatorState;  // zero velocity, held null, lastNowMs null

stepNavigator(
  prev: NavigatorState,
  steps: readonly NavStep[],
  nowMs: number,
  settings: NavSettings,
  radPerPx: number,                       // fovY / cssHeight, the drag's own rate
): { readonly state: NavigatorState; readonly delta: ArmDelta; readonly moving: boolean };
```

**The law** (OpenSpace `DampenedVelocity`, with `k = min(dtS / (friction + NAV_FRICTION_EPS), 1)`):
1. `dtMs = clamp(nowMs − lastNowMs, 0, NAV_DT_CAP_MS)`, and 0 when `lastNowMs === null`. `dtS = dtMs / 1000`. The next `lastNowMs` is `nowMs`.
2. Fold `steps` in order. A `navDrag` sets `held = axis` (resetting the accumulated delta if the axis changed) and adds its `deltaPx`. A `gestureEnd` first applies the hold update below to the held axis with the accumulated delta, then sets `held = null`. At the end of the fold, a still-held axis gets the hold update with its accumulated delta, which is `[0, 0]` for a motionless mouse.
3. **Hold update** (the `set` law; friction toggles do NOT gate it): `v += (target − v) · k`. The target is in ArmDelta units per second:
   - orbit and look: `deltaPx · NAV_ROTATION_GAIN[axis] · radPerPx / dtS`, both components;
   - roll: `deltaPx[0] · NAV_ROTATION_GAIN.roll · radPerPx / dtS`;
   - zoom: `deltaPx[1] · NAV_ZOOM_LN_PER_PX / dtS`. Drag down is positive, which means farther (OpenSpace: drag down = zoom out).

   With `dtS === 0` the hold update is skipped (there is no division by zero).
4. **Release law** (the `decelerate` law) on every axis that got no hold update this frame: `v *= 1 − k` when `settings.frictionOn[NAV_FRICTION_GROUP[axis]]`, else unchanged.
5. Any axis whose magnitude is below `NAV_REST_EPS` snaps to exactly 0.
6. `delta = v · dtS` per axis. **Zero axes are omitted** from `delta` (an `orbit: [0, 0]` is not identity on the world arm). `moving` = any velocity axis is non-zero.

- [ ] Test `release decays by 1 − min(dt/friction, 1)` at dt = 8, 16 and 50 ms, friction 0.5: the velocity after one step equals the law to 1e-12.
- [ ] Test `friction 0 stops a released axis in one frame`.
- [ ] Test `an axis with friction off holds its velocity`: `frictionOn.zoom = false` keeps the zoom velocity bit-identical over 100 frames while the rotational axes decay.
- [ ] Test `look decays under the roll toggle, not the rotational one` (ruling 3).
- [ ] Test `dt is capped at 100 ms`: a 2 s gap decays exactly as one 100 ms step.
- [ ] Test `the first frame moves nothing`: `lastNowMs === null` gives an empty `delta`.
- [ ] Test `a held motionless mouse comes to rest even with friction off`: hold `orbit`, feed one moving frame then zero-delta frames with all friction off, and the velocity converges below ε and snaps to 0.
- [ ] Test `steady hold moves at the drag rate`: hold `orbit` at a constant 10 px per frame for 60 frames, and the per-frame `delta.orbit` converges to `[10 · radPerPx, …]`.
- [ ] Test `moving falls exactly once`: during a release, `moving` is true then false, and never flips back without input.
- [ ] Test `zero axes are omitted`: a pure orbit hold yields a `delta` with no `look`, `zoom` or `roll` keys.
- [ ] Test `a gestureEnd in the same frame applies the final delta before releasing`.
- [ ] `npm test -- stepNavigator` is green. Commit: `feat(camera): OpenSpace navigator — velocity state with the DampenedVelocity law`.

### Task 3: World-arm combined pitch clamp — `review: yes`

**Files:**
- Modify: `src/utils/camera/nudgedWorldPose.ts`
- Test: `tests/utils/camera/nudgedWorldPose.test.ts`

**Contract:** after any world nudge, the RENDERED view's elevation stays within ±`PITCH_LIMIT`, enforced by clamping the offset's pitch (never the orbit pitch, which the drag's own law owns). The rendered view is `orbitForwardOf(pose, poseBasis, upBasis)`, and its elevation is measured against `frameUp(upBasis)`. Take the un-offset forward's elevation `e` (orbit pitch lives in `poseBasis` and points target → eye, so `e` is NOT `pose.pitch`; it differs in sign and, when the bases differ, by up to ~23°), then clamp the offset pitch to `[−PITCH_LIMIT − e, PITCH_LIMIT − e]`. The clamp runs after orbit too, because an orbit can push a look-offset pose past the pole. An absent `lookOffset` stays absent when the clamp has nothing to do. (Corrected after the D1 review: the first draft summed `pose.pitch + offset`, which has the wrong sign.)

- [ ] Test `look offset cannot carry the view past the pole`, for BOTH look signs at orbit pitch ±1.4: assert on `orbitForwardOf` of the result that `asin(forward·up) ∈ ±PITCH_LIMIT` and the horizontal direction does not flip.
- [ ] Test `an orbit under a held offset re-clamps it`, with a case that really reaches the pole, asserted on the rendered view as above.
- [ ] Test `the clamp reads the rendered elevation when poseBasis ≠ upBasis` (ecliptic pose basis, equatorial up).
- [ ] Test `an absent offset stays absent under orbit`.
- [ ] Commit: `fix(camera): clamp orbit + look-offset pitch at the zenith`.

### Task 4: The openspace scheme in the engine — `review: yes`

**Files:**
- Modify: `src/@types/engine/camera/ControlSchemeId.d.ts` (`'skymap' | 'openspace'`)
- Modify: `src/@types/engine/camera/ControlScheme.d.ts`
- Create: `src/@types/camera/AxisPress.d.ts`, `src/@types/settings/CameraControlsSettings.d.ts`
- Create: `src/utils/camera/openSpaceAxisFor.ts`
- Create: `src/state/settings/core/cameraControlsSlice.ts`; modify `src/state/settings/coreSettingsSlices.ts`
- Modify: `src/data/camera/openSpaceNavigation.ts` (add `DEFAULT_CAMERA_CONTROLS`)
- Modify: `src/@types/engine/camera/DriverId.d.ts`, `src/@types/engine/camera/DriverActivity.d.ts`
- Modify: `src/services/engine/camera/cameraDrivers.ts` (two rows plus the `OPENSPACE_DRIVERS` table), `src/services/engine/camera/controlSchemes.ts`
- Modify: `src/@types/camera/InputStep.d.ts` (add `navDrag`), `src/services/engine/camera/replayInput.ts`
- Modify: `src/@types/engine/state/CameraRuntime.d.ts`, `src/services/engine/camera/seedCameraRuntime.ts`, `src/services/engine/camera/stepCameraRuntime.ts`
- Create: `src/services/engine/camera/rungs/nudgeRung.ts`
- Modify: `src/@types/engine/camera/StepInputs.d.ts`, `src/services/engine/frame/runFrame.ts:133`
- Test: `tests/services/engine/camera/stepCameraRuntime.test.ts` (or the camera sim harness, `tests/helpers/camera/makeCameraSimHarness.ts`), `tests/services/engine/camera/cameraDrivers.test.ts`, `tests/utils/camera/openSpaceAxisFor.test.ts`

**Contract:**
```ts
export type AxisPress = { readonly button: number; readonly ctrl: boolean; readonly alt: boolean;
                          readonly shift: boolean; readonly pointerType: string };
export type ControlScheme = { readonly drivers: readonly CameraDriver[];
                              readonly bindAxis: (press: AxisPress) => NavAxis | null };
export type CameraControlsSettings = { readonly scheme: ControlSchemeId } & NavSettings;
// InputStep gains:
| { kind: 'navDrag'; axis: NavAxis; deltaPx: Vec2 }        // not readonly: the aggregator sums in place
// CameraRuntime gains:
readonly navigator: NavigatorState;
// DriverActivity gains:
readonly navHeld: boolean; readonly navMoving: boolean;
// DriverId gains 'openSpaceHeld' | 'openSpaceCoast'
openSpaceAxisFor(press: AxisPress): NavAxis;
nudgeRung(framed: FramedCameraPose, tilt: TiltMemory, delta: ArmDelta, ctx: RungCtx):
  { readonly pose: FramedCameraPose; readonly tilt: TiltMemory };   // rowFor(frame).nudge, as stepRow does for step
```

**`openSpaceAxisFor`** follows the source's branch order (`mousecamerastates.cpp:101-136`): a non-mouse pointer gives `orbit` (ruling 5). For a mouse: button 2 → `zoom`, button 1 → `roll`. Button 0 checks modifiers in order: alt → `zoom`, then shift → `roll`, then ctrl → `look`, else `orbit`. `CONTROL_SCHEMES.skymap.bindAxis` returns null. `CONTROL_SCHEMES.openspace` is `{ drivers: OPENSPACE_DRIVERS, bindAxis: openSpaceAxisFor }`.

**Settings cluster.** `settings.cameraControls`, initial `DEFAULT_CAMERA_CONTROLS`, with reducers `setControlScheme(id)`, `toggleControlScheme()`, `setNavFriction(n)` (clamped to [0, 1]) and `setFrictionOn({ group, on })`. It stays OUT of `SettingsSnapshot` (`SettingsSnapshot.d.ts:76-96` is a `Pick`, so simply not listing it is enough), so a tour or takeover never restores it away (R12). Task 6 makes the initial state persisted.

**Rows** (only in `OPENSPACE_DRIVERS`, which is `CAMERA_DRIVERS` with `orbitDrag` replaced by these two; `CAMERA_DRIVERS` itself is untouched):

| Row | Priority | `isActive` | Flags | `pose` |
|---|---|---|---|---|
| `openSpaceHeld` | 80 | `activity.navHeld` | `family: 'openSpace'`, `pivotsOnFocusedBody`, `commitsOnEdge` | echoes `ctx.register` (as `orbitDrag`, `cameraDrivers.ts:257-268`) |
| `openSpaceCoast` | 50 | `!activity.navHeld && activity.navMoving` | same | same |

**`replayInput`.** A `navDrag` step never reaches a rung. It and every `gestureEnd` are copied in order into a new output field, `drained.navSteps: readonly NavStep[]`. The `gestureEnd` keeps its existing handling too (`replayInput.ts:186-193`).

**`stepCameraRuntime`**, between `replayInput` and `pickWinner` (`:163-169`):
1. `const nav = stepNavigator(prev.navigator, drained.navSteps, nowMs, rootState.settings.cameraControls, projection.fovYRad / canvasPx[1])`. `canvasPx` is CSS pixels here, as for the drag; check this against `RungCtx.viewportPx` and use the same reading.
2. When `nav.delta` has any axis, the register becomes `nudgeRung(drained.register, drained.tilt, nav.delta, replayCtx)`. That nudged register and tilt are what `commitOnEdge`, the winner's produce and the next runtime read.
3. `activity` gains `navHeld: nav.state.held !== null` and `navMoving: nav.moving`.
4. After the pick: the next `navigator` is `nav.state` when `winner.family === 'openSpace'`, else `{ ...NAV_AT_REST, lastNowMs: nowMs }` (ruling 2).
5. The returned `requestRender` is `projected.requestRender || nav.state.held !== null || nav.moving` (spec §9).

**Scheme lookup moves into `stepCameraRuntime` (ruling 6).** `commitOnEdge` finds the departing row in `drivers` (`commitOnEdge.ts:38`). On a scheme toggle the departing `openSpaceCoast` is absent from the new table, so it would silently skip its commit. So:
- `StepInputs.drivers` is replaced by `StepInputs.schemes: Readonly<Record<ControlSchemeId, ControlScheme>>`, and `runFrame.ts:133` passes `deps.controlSchemes`. Fixture overrides keep working through the same injection.
- `CameraRuntime` gains `readonly scheme: ControlSchemeId`, seeded from `settings.cameraControls.scheme` and written each frame.
- `pickWinner` reads `schemes[rootState.settings.cameraControls.scheme].drivers`. `commitOnEdge`'s `drivers` argument becomes `schemes[prev.scheme].drivers`, the table the departing winner was picked from.

- [ ] Test `the skymap table is unchanged`: `CONTROL_SCHEMES.skymap.drivers === CAMERA_DRIVERS`, and no row of it carries an openSpace family.
- [ ] Test `the openspace table is skymap's with orbitDrag swapped`: same ids in the same order, except `orbitDrag` is replaced by the two rows.
- [ ] Test `openSpaceAxisFor` table: every row of the binding list above, plus alt+shift+left → `zoom` (alt wins) and ctrl+shift+left → `roll`.
- [ ] Test `held → coast → rest commits base once`: openspace scheme, friction on. Hold orbit for 5 frames, release, and step until `navMoving` falls. Exactly one `commitCameraPose` appears, on the at-rest frame.
- [ ] Test `a tween preempting a coast commits once and zeroes the navigator`: start a focus tween mid-coast. One commit lands on the edge frame, and the next runtime's velocities are all 0.
- [ ] Test `a scheme toggle mid-coast commits once and zeroes the navigator`.
- [ ] Test `a coast crossing an arm boundary keeps its velocity`: a frame whose fold changes the register's frame leaves `navigator.velocity` identical to `stepNavigator`'s output.
- [ ] Test `a coasting navigator requests a render, an at-rest one does not`.
- [ ] Test `skymap scheme: a navDrag step is inert` (no rung, no velocity, since the reset rule applies every frame).
- [ ] `npm run typecheck:fast && npm test -- camera` is green, with the goldens untouched. Commit: `feat(camera): openspace control scheme — navigator, held/coast rows, scheme-selected table`.

### Task 5: Input capture — `review: yes`

**Files:**
- Modify: `src/@types/camera/InputGestureEvent.d.ts`, `src/@types/camera/OrbitControlsOptions.d.ts`
- Modify: `src/services/camera/orbitControls.ts`, `src/services/engine/subsystems/inputAggregator.ts`
- Modify: `src/services/engine/phases/wireInput.ts:241`
- Test: `tests/services/camera/orbitControls.test.ts`, `tests/services/engine/subsystems/inputAggregator.test.ts`

**Contract:**
```ts
// InputGestureEvent gains:
| { kind: 'navMove'; axis: NavAxis; dxPx: number; dyPx: number }
// OrbitControlsOptions gains:
bindAxis?: (press: AxisPress) => NavAxis | null;
```
- At the first contact's pointer-down, `bindAxis` is called once (absent ⇒ null). A non-null axis latches for the gesture. The recognizer emits `gestureStart`, then a `navMove` with `dxPx = dyPx = 0`, so the axis reaches the navigator on the press frame, before any motion. Each later move of the driving pointer emits a `navMove` with the delta since the last one. Modifiers are never re-read mid-gesture.
- A null axis takes today's path, byte for byte.
- A second finger promotes to pinch exactly as today (`orbitControls.ts:69-73`); `navMove` stops while pinching.
- A latched-axis release never calls `onClick` (the click test stays tied to the skymap `orbit` mode, `orbitControls.ts:86`).
- The aggregator turns `navMove` into `navDrag`, extending a trailing `navDrag` of the same axis by summing `deltaPx`. A zero-delta move still opens a step.
- `wireInput` passes `bindAxis: (press) => CONTROL_SCHEMES[store.getState().settings.cameraControls.scheme].bindAxis(press)`. `beginDrag`/`cancelCameraTween` keep firing on `gestureStart` (`wireInput.ts:243-250`), so `camera.dragging` still means "a button is held".

- [ ] Test `the axis latched at press survives a modifier release`: press with ctrl+left (look), release ctrl, move, and every `navMove` says `look`.
- [ ] Test `a press emits a zero navMove before any motion`.
- [ ] Test `a latched release does not click-pick`.
- [ ] Test `without bindAxis the event stream is unchanged`: the existing recognizer tests pass untouched (no new test; they are the gate).
- [ ] Test `the aggregator sums same-axis navMoves and splits on an axis change`.
- [ ] `npm test -- orbitControls inputAggregator` is green. Commit: `feat(camera): latch an OpenSpace axis at press and emit navDrag deltas`.

### Task 6: Persistence, shortcut, settings section

**Files:**
- Modify: `src/state/persistedValues.ts` (row `CAMERA_CONTROLS`)
- Create: `src/utils/storage/parseCameraControls.ts`
- Modify: `src/state/settings/core/cameraControlsSlice.ts` (initial state via `readPersisted`)
- Modify: `src/state/input/keyboardShortcuts.ts`
- Create: `src/components/SettingsPanel/CameraControlsSection.tsx` (+ CSS module if needed), `src/components/containers/CameraControlsSectionContainer.tsx`
- Modify: `src/components/SettingsPanel/SettingsPanel.tsx`
- Test: `tests/utils/storage/parseCameraControls.test.ts`

**Contract:**
```ts
export const CAMERA_CONTROLS: PersistedValue<CameraControlsSettings>;   // key 'skymap.cameraControls.v1'
parseCameraControls(raw: string): CameraControlsSettings | null;       // null only on a non-object JSON
```
- `parse` validates each field on its own and falls back to the `DEFAULT_CAMERA_CONTROLS` field when that field is wrong: an unknown scheme id, a non-finite or out-of-[0, 1] friction, or a non-boolean toggle. Unparsable JSON returns null, which `readPersisted` turns into the default.
- `PERSISTED_VALUES` becomes `[SPLASH_SEEN_VERSION, CAMERA_CONTROLS]`. `main.tsx:97` already installs the table.
- The slice's initial state is `readPersisted(CAMERA_CONTROLS) ?? DEFAULT_CAMERA_CONTROLS`, following the boot read in `buildInitialUiState.ts:39`.
- Shortcut row `{ keys: 'shift+c', run: () => toggleControlScheme() }`. The key is free today.
- Section "Camera controls", added to `SettingsPanel.tsx` beside the other core section containers:
  - a Skymap / OpenSpace select whose label shows the `shift+c` hint;
  - only when OpenSpace is selected: three friction checkboxes (Orbit, Zoom, Look & roll — the last label names what the source's `roll` toggle really gates) and a 0–1 friction slider using the shared `Slider` component.
  - No toast.

- [ ] Test `parseCameraControls round-trips the default`.
- [ ] Test `a malformed field falls back alone`: `{ scheme: 'nope', friction: 0.2, frictionOn: { rotational: false, zoom: 'x', roll: true } }` → scheme `skymap`, friction 0.2, rotational false, zoom true (default), roll true.
- [ ] Test `non-object JSON parses to null` (`'42'`, `'null'`, `'[]'`).
- [ ] No component test: the section is a pure-props select plus a conditional block, and the visual check covers it.
- [ ] Commit: `feat(settings): persisted camera-controls cluster, shift+c, settings section`.

### Task 7: Docs

**Files:**
- Modify: `docs/RENDERER.md` (one bullet under "Renderer quick map", near the camera/input mention at `:14`)
- Modify: `docs/grill-sessions/globe-camera-pivot-2026-08-24.md:199` (Q8)
- Modify: `docs/superpowers/specs/2026-09-29-openspace-camera-mode-design.md` (sync with the plan rulings above)

- [ ] RENDERER.md: name `CONTROL_SCHEMES` (scheme → driver table + `bindAxis`), the `RungRow.nudge` column, and `CameraRuntime.navigator`, in ≤ 4 lines.
- [ ] Q8: one line saying the openspace scheme revises it (velocity + true friction), pointing at the spec. Q8's ruling still stands for the skymap scheme.
- [ ] Spec: reflect rulings 1–6 in §3.1, §6 and §7 (family field, single reset rule, friction groups, gain seed, touch binds orbit, scheme lookup in the step).
- [ ] No test. Commit: `docs: OpenSpace scheme in RENDERER.md, Q8 revision note, spec sync`.

---

## Definition of Done

- **Deliverables:**
  - `DriverFamily` and `CameraDriver.family`;
  - `stepNavigator` with `NavigatorState`/`NavStep`/`NavSettings`, and `CameraRuntime.navigator`;
  - `ControlSchemeId = 'skymap' | 'openspace'`, `ControlScheme.bindAxis`, `openSpaceAxisFor`, `OPENSPACE_DRIVERS` with `openSpaceHeld`/`openSpaceCoast`;
  - `InputStep.navDrag` and `InputGestureEvent.navMove`;
  - `settings.cameraControls` persisted as `skymap.cameraControls.v1`, the `shift+c` shortcut, and the "Camera controls" settings section;
  - the docs from Task 7.
- **Manual visual check (user, dev server, ideally beside OpenSpace):**
  - `shift+c` flips the scheme, and the settings select follows;
  - left-drag orbits Earth, ctrl+left looks off it and the look stays turned while orbiting;
  - right-drag and alt+left zoom (drag down = out), middle and shift+left roll;
  - release coasts and decays, and each friction toggle off makes its axis spin on until reversed;
  - `f` during a spin preempts it, and the camera settles on the focus;
  - a coast that sinks into the body-arm band carries on (one view snap when a look offset is held is the known risk, spec §11);
  - the site arm turntable orbits and zooms, and ignores look and roll;
  - the scheme and friction survive a reload, and a tour does not reset them;
  - the `skymap` scheme feels exactly as before.
- **Out of scope:**
  - OpenSpace's Z/X sensitivity ramp, local roll, `R` idle motion, WASD, and F / Shift+F / Ctrl+F friction keys (R4, R6);
  - carrying a look offset into `basisLocal` at disengage (spec §11, only if the visual check objects);
  - removing `prevPixel` (needs a pinch-aim ruling).
