# OpenSpace camera mode — rebuilt on the input architecture

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The `openspace` control scheme from draft #837, rebuilt on current main. The `skymap` scheme stays behaviourally unchanged.

**Why a rebuild:** #837 was built on two contracts main has since replaced.
- **#913, input architecture.** It deleted `orbitControls`, the aggregator and `InputGestureEvent`, the code #837 extended with `bindAxis`. Press binding is now a table per scheme (`CONTROL_BINDINGS`), and the input spec names #837's rewrite as "a `CONTROL_BINDINGS.openspace` row, `HeldIntent` members and its navigator" (`docs/superpowers/specs/completed/2026-10-15-input-architecture-design.md` §Out of scope).
- **#854, Voyager.** It changed the driver contract:
  - `CameraDriver<Own>` with a per-row `own` slot;
  - `commitsOnEdge: 'register' | 'displayed'`;
  - one author is a shared `epoch`;
  - `controlSchemes.ts` became `composeControlSchemes`, which lifts exhibit rows into every scheme.

**Source of the carried code:** branch `worktree-openspace-camera-mode-pr2` (HEAD `b6368ded1`, CI green, visual-check fixes in). Read its files with `git show worktree-openspace-camera-mode-pr2:<path>`, and its diff with `git diff origin/main...worktree-openspace-camera-mode-pr2 -- <path>`. Its plan (`docs/superpowers/plans/2026-10-04-openspace-camera-mode.md`) and ledger (`.superpowers/sdd/2026-10-04-openspace-camera-mode/progress.md`) hold the rulings that still apply: friction groups, gain seed, touch binds orbit, the scheme lookup in `stepCameraRuntime`, an orbit tap picks, the uncapped-dt target, the wheel notch on the live register (`navOwns`), and `surfaceOrbitScale`.

**Spec:** [`docs/superpowers/specs/2026-09-29-openspace-camera-mode-design.md`](../specs/2026-09-29-openspace-camera-mode-design.md). The #837 branch's copy (synced to what shipped in `c73483090`) replaces main's in Task 1. Task 4 adds a short section on what changed for #913 and #854.

## Rulings made at plan time

1. **Navigator intents are `HeldIntent` members.** `NavIntent = 'navOrbit' | 'navLook' | 'navRoll' | 'navZoom'`, and `HeldIntent = 'orbit' | 'pan' | NavIntent`. `NAV_INTENT_AXIS: Record<NavIntent, NavAxis>` maps them. Motions merge on string intent equality, which works as it stands.
2. **The press binding is the openspace table row.** `openSpaceAxisFor`, `AxisPress` and `ControlScheme.bindAxis` are not carried. The table is ordered, and the first matching row wins:

   ```ts
   openspace: [
     [{ pointerType: 'mouse', button: 2 }, 'navZoom'],
     [{ pointerType: 'mouse', button: 1 }, 'navRoll'],
     [{ pointerType: 'mouse', alt: true }, 'navZoom'],
     [{ pointerType: 'mouse', shift: true }, 'navRoll'],
     [{ pointerType: 'mouse', ctrl: true }, 'navLook'],
     [{}, 'navOrbit'],
   ],
   ```

   Touch and pen fall through to `navOrbit`. A second finger still pinches, through the recognizer's `pinch` → zoom motion and the rung's own zoom step.
3. **The source saga reads the scheme at press.** It reads the scheme with `select(selectCameraControls)` at `heldStart` and latches it with the intent for the whole gesture. The tap uses the latched table. Tap and double-tap select when the latched intent is in `TAP_SELECTING_INTENTS = new Set(['orbit', 'navOrbit'])` (`src/data/input/`). That replaces the hard-coded `!== 'orbit'`, the second special case.
4. **The conversion owns the pixels.** `pendingToInputSteps` turns a nav motion into `{ kind: 'navDrag', axis, deltaPx: [dx · aspect · viewH, dy · viewH] }`, which is isotropic in the source's height like the drag. `navDrag` never reaches a rung.
5. **No driver family.** Main's one-author rule (a shared `epoch`) does not fit the navigator rows: they read no timed channel. So held ↔ coast is an edge, and each edge commits the register (`commitsOnEdge: 'register'`). That is one `commitCameraPose` per release and per re-grab. A commit pushes no history entry (`watchHashWriteSaga.ts:57`), so the cost is a store write. `DriverFamily` is not carried. If the visual check shows a hitch at release, add the navigator rows to the one-author rule then.
6. **Navigator state stays in `CameraRuntime.navigator`, not in `own`.** It must step before `pickWinner`, because its held and moving flags are what make the two rows active. `own` is read only by the winner, after the pick.
7. **Exhibits keep the drag.** `openSpaceHeld` and `openSpaceCoast` are inactive while `activity.dragClaimed`, as `orbitDrag` is. The navigator is not reset on a `dragClaimed` frame, and it keeps nudging the register, which the mission row reads while `camera.dragging`. Without this, the reset rule would restart the velocity from 0 every frame, and an exhibit drag in the openspace scheme would crawl.
8. **The reset rule.** The navigator returns to rest on any frame whose winner is neither navigator row and no exhibit claims the drag. The pair lives once, in an `isNavigatorDriverId` util beside the step.
9. **Schemes.** `ControlSchemeId = 'skymap' | 'openspace'`. `composeControlSchemes` returns `openspace: { drivers: [...OPENSPACE_DRIVERS, ...lifted] }`. `OPENSPACE_DRIVERS` is `CAMERA_DRIVERS` with `orbitDrag` replaced by:
   - `openSpaceHeld`, priority 80;
   - `openSpaceCoast`, priority 50.

   Both rows set `pivotsOnFocusedBody` and `commitsOnEdge: 'register'`. `StepInputs.drivers` becomes `schemes`, with `CameraRuntime.scheme` holding last frame's scheme, as in #837 ruling 6.

## Global constraints

- The `skymap` scheme is behaviour-neutral. No existing test changes its expected values, and the camera goldens stay byte-identical.
- `type` aliases, never `interface`. One type per `@types/` file, one function per `utils/` file, filename = symbol. Frame files export only their named symbol.
- Narrow contracts: a function takes only what it reads.
- Comments explain why, never what: module header ≤ 10 lines, comment lines ≤ half the code lines.
- Run `npx prettier --write <files>`, never `npm run format`. No `Co-Authored-By` lines in commits. Never `git add -A`.
- The constants are those of `src/data/camera/openSpaceNavigation.ts` on the #837 branch, carried verbatim.

## Review focus

1. **Scheme latched per gesture.** A `shift+c` mid-drag must not change the running gesture's intent or table. The next press uses the new scheme. Pinned in Task 3.
2. **A tap in the openspace scheme selects, and a double-tap focuses.** Only `navOrbit`-bound presses do this: a right-drag release does not pick. Pinned in Task 3.
3. **A remote at 9:16.** Nav drag deltas must be isotropic in the source's height, as drags are. Pinned in Task 3's conversion test.
4. **The Voyager exhibit in the openspace scheme.** A drag moves the mission camera at the normal rate, and the navigator does not fight the mission row. Pinned in Task 2, and checked by eye.
5. **The wheel during a coast** zooms the live pose and does not snap back (the `navOwns` repro test on the #837 branch). Ported in Task 2.

---

### Task 1: Carry the self-contained pieces over

These files do not touch either changed contract, so they come over from the #837 branch unchanged unless the build forces an edit. Check each file's diff against main before taking it, because main may have moved under it.

**Files:**
- Types: `src/@types/camera/{NavAxis,FrictionGroup,NavVelocity,NavigatorState,NavStep,NavSettings}.d.ts` and `src/@types/settings/CameraControlsSettings.d.ts`.
- Code: `src/data/camera/openSpaceNavigation.ts`, `src/utils/camera/stepNavigator.ts`, `src/utils/camera/surfaceOrbitScale.ts`, and the PR 2 edits to `src/utils/camera/nudgedSurfacePose.ts` and `src/utils/camera/nudgedWorldPose.ts`.
- Settings: `src/state/settings/core/cameraControlsSlice.ts`; the `cameraControls` edits to `src/state/settings/coreSettingsSlices.ts`, `src/state/settings/selectors.ts` and `src/state/persistedValues.ts`; and `src/utils/storage/parseCameraControls.ts`.
- UI: `src/components/SettingsPanel/CameraControlsSection.tsx`, `src/components/containers/CameraControlsSectionContainer.tsx`, and the `SettingsSections.tsx` line.
- Shortcut: the `shift+c` row in `src/state/input/keyboardShortcuts.ts`, plus `toggleControlScheme` wherever #837 defines it.
- Website: `packages/website/src/data/{docsControls,docsSettings}.ts` and `packages/website/src/content/docs/reference/settings.mdx`.
- Docs: the #837 spec copy.
- Tests: the matching tests, `tests/utils/camera/{stepNavigator,nudgedSurfacePose,nudgedWorldPose}.test.ts`, `tests/utils/storage/parseCameraControls.test.ts`, `tests/state/settings/makeSettingsFixture.ts`, and `tests/components/SettingsPanel/SettingsPanel.test.tsx`.

**Order:** `ControlSchemeId` stays `'skymap'` in this task. The settings slice types its `scheme` field as `'skymap' | 'openspace'` through `ControlSchemeId` only from Task 2 onward. Until then the slice compiles against a local widening, or Task 1 lands the `ControlSchemeId` edit together with a temporary `openspace: CONTROL_BINDINGS.skymap` / `composeControlSchemes` row. The implementer picks whichever keeps every commit green and says which in the report.

- [ ] Carry over, then run typecheck plus the carried tests. Commit as `feat(camera): carry the OpenSpace navigator, settings and UI over from #837`.

### Task 2: The openspace driver rows on the new driver contract — `review: yes`

**Files:**
- Modify: `src/@types/engine/camera/ControlSchemeId.d.ts`, `src/@types/engine/camera/DriverId.d.ts`, `src/@types/engine/camera/DriverActivity.d.ts` (`navHeld`, `navMoving`), `src/@types/engine/camera/StepInputs.d.ts` (`drivers` → `schemes`), `src/@types/engine/state/CameraRuntime.d.ts` (`navigator`, `scheme`), `src/@types/camera/InputStep.d.ts` (`navDrag`).
- Modify: `src/services/engine/camera/cameraDrivers.ts` (`OPENSPACE_DRIVERS`), `src/services/engine/camera/composeControlSchemes.ts`, `src/services/engine/camera/seedCameraRuntime.ts`, `src/services/engine/camera/stepCameraRuntime.ts`, `src/services/engine/camera/replayInput.ts` (`navHeld` fold, `navOwns`), `src/services/engine/frame/runFrame.ts` (`schemes` in place of `controlSchemes.skymap.drivers`, both sites).
- Create: `src/utils/camera/isNavigatorDriverId.ts`.
- Tests: port the #837 cases in `tests/services/engine/camera/{stepCameraRuntime,replayInput,cameraDrivers,commitOnEdge}.test.ts` and `tests/services/engine/frame/runFrame.test.ts`. The family tests become ruling-5 tests: held → coast commits the register once at each edge. Add one case for ruling 7: under a claiming exhibit row, a held nav drag moves the register at the same rate as with no exhibit.

**Interfaces:**
- Produces `InputStep` `{ kind: 'navDrag'; axis: NavAxis; deltaPx: Vec2 }`. Task 3's conversion emits it.
- `ControlSchemeId = 'skymap' | 'openspace'`.

- [x] Implement test-first per the #837 branch's `stepCameraRuntime.ts` and `replayInput.ts` diffs, applying rulings 5–9. Commit.

### Task 3: The openspace binding and the nav motion — `review: yes`

**Files:**
- Create: `src/@types/input/NavIntent.d.ts`, and `src/data/input/navIntentAxis.ts` (`NAV_INTENT_AXIS`) plus `src/data/input/tapSelectingIntents.ts` (`TAP_SELECTING_INTENTS`), with one export each.
- Modify:
  - `src/@types/input/HeldIntent.d.ts`;
  - `src/data/input/controlBindings.ts`, adding the `openspace` row from ruling 2;
  - `src/state/input/inputSourceSaga.ts`: the scheme is selected at `heldStart` and latched (ruling 3), and the tap rule reads the set;
  - `src/utils/input/pendingToInputSteps.ts`, with the `navDrag` branch from ruling 4.
- Tests:
  - `tests/data/input/controlBindings.test.ts`, one table-driven case per row;
  - `tests/utils/input/pendingToInputSteps.test.ts`, covering a nav motion on the canvas aspect (today's pixels) and on a 9:16 source (isotropic);
  - `tests/state/input/inputSourceSaga.test.ts`, covering a `shift+c` mid-drag that keeps the intent, an openspace left tap that selects, and a right-drag release that does not pick.

- [ ] Implement test-first. Commit.

### Task 4: Docs

**Files:**
- The spec, adding a short "Rebuilt on #913 and #854" section that lists rulings 1–9.
- `docs/RENDERER.md` and `docs/grill-sessions/globe-camera-pivot-2026-08-24.md`, carrying the #837 notes and replacing their `orbitControls` and aggregator references with the new path.

- [ ] Write, then grep for stale `bindAxis`, `openSpaceAxisFor`, `InputGestureEvent` and `inputAggregator` mentions in the touched docs. Commit.

## Definition of Done

- **Deliverables:**
  - `CONTROL_BINDINGS.openspace`, `NavIntent`, `NAV_INTENT_AXIS` and `TAP_SELECTING_INTENTS`;
  - the `navDrag` conversion;
  - `OPENSPACE_DRIVERS` in `composeControlSchemes`;
  - `CameraRuntime.navigator` and `CameraRuntime.scheme`;
  - everything Task 1 lists.
- **CI green.** #837 is closed with a link to the new PR.
- **Visual check (user, dev server):** #837's checklist (its plan's DoD), plus these:
  - a tap and a double-tap in the openspace scheme;
  - `shift+c` mid-drag;
  - the Voyager exhibit driven in the openspace scheme;
  - the phone sheet's Camera controls section.
- **Out of scope:** the same list as #837, plus per-event wheel binding (the input spec defers it).
