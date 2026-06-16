# Remove SpaceMouse Subsystem Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the entire SpaceMouse (6DOF WebHID 3Dconnexion puck) input subsystem and every shared-file reference to it, leaving `tsc` clean and the existing suite green.

**Architecture:** Pure removal — no new behaviour. The `CameraDriver` abstraction is **preserved**: `runCameraDrivers`, `buildCameraDrivers`, the `CameraDriver` type, the `RunFrameDeps.drivers` field, the per-frame `runCameraDrivers(deps.drivers, …)` write site, and the `deps.drivers.some(d => d.isActive(nowMs))` wake gate all stay exactly as they are. The only structural change is that the `input` driver object (priority 100, SpaceMouse-backed) is dropped from `buildCameraDrivers`, leaving the `tween` (60) and `autoRotate` (20) drivers; everything else is deleting orphaned files and SpaceMouse-specific lines from shared files plus comment tidy-up.

**Tech Stack:** TS + React + WebGPU (skymap engine)

---

## Process notes (read before executing)

- **Branch:** `remove-spacemouse-subsystem` (already created). The plan rides the implementation PR — no separate docs PR.
- **Implementer subagents cannot run npm or git** (project rule). Every task's verification line and the commit are executed by the **main thread**, not the implementer. Implementers only edit/delete files. Dispatch implementers `run_in_background: true`.
- **Each task must end green.** Deletions and the edits that orphan them land in the *same* task so `npm run typecheck` and the relevant `npm test` slice pass at the end of every task. Edit consumers before (or in the same commit as) deleting what they consume.
- **Staging:** never `git add -A`/`git add .` — stage the specific paths the task touched. Commit with the user's git identity; message body ends with the `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>` trailer.
- **Acceptance criterion for every task:** `tsc` clean + the existing suite stays green. There are NO new TDD tests in this plan — it is pure deletion + mechanical edits.

## Locked decisions (do not re-litigate)

1. **`EngineInputHandle` is deleted entirely** — it only ever held `spaceMouse`. Remove `EngineInputHandle.d.ts`, the `input: EngineInputHandle` field on `EngineHandle`, and the `engine.input` handle literal in `engine.ts`. Do NOT leave an empty `input` stub.
2. **KEEP the `CameraDriver` abstraction — do NOT collapse it.** The ONLY change is removing the `input` driver object from `buildCameraDrivers` (`cameraDrivers.ts:110-115`), leaving `tween` + `autoRotate`. `runCameraDrivers`, `buildCameraDrivers`, the `CameraDriver` type, `RunFrameDeps.drivers`, the `runCameraDrivers(deps.drivers, …)` write site (`runFrame.ts:163-165`), and the wake gate (`runFrame.ts:502-503`) are all UNCHANGED. There is NO `cameraMotion.ts` module — that idea is dropped. The resolver test (`cameraDrivers.test.ts`) uses pure fake drivers and has NO SpaceMouse reference — it stays untouched.

## Inventory corrections (verified this session)

The dispatch's approximate line numbers were re-read against current `main`; the corrected numbers are baked into the tasks below. Notable points:

- **`settingsTable.ts` has no `setSpaceMouseSensitivity` ROW.** It's a *bespoke* handle setter, mentioned only in the module docstring (`settingsTable.ts:36`). `settingsTable.test.ts:36` mentions it in a comment; the asserted `names` list does NOT contain it. Both edits are comment-only.
- **`engine.ts` SpaceMouse surface:** the `createSpaceMouseSubsystem` import (`engine.ts:113`) + its leading comment block (`:107-112`), the construction block with `cancelTween`/`onConnectionChange`/`onAxes` callbacks (`:332-349`), the four bespoke helpers `connectSpaceMouse`/`disconnectSpaceMouse`/`isSpaceMouseConnected`/`setSpaceMouseSensitivity` (`:655-672`), the `state.subsystems.spaceMouse.destroy()` line (`:710`), the `input: { spaceMouse: {…} }` handle literal (`:855-862`), the module-header subsystem-list bullet (`:38`), the tween-manager comment (`:326`), and the `subsystems` construction comment (`:180`) all reference SpaceMouse.
- **`cameraDriverWrappers.test.ts`** builds drivers via `buildCameraDrivers(state)` and has describe blocks for the `input`, `tween`, and `autoRotate` wrappers (lines 56, 79, 102). Its `fake` state stub carries a `spaceMouse: { hasAxes, applyToCamera }` field (`:31`, `:40`). Remove ONLY the `input` describe block + the `spaceMouse` stub field; keep the tween/autoRotate blocks.
- **`runFrame.test.ts`** keeps `drivers` + `buildCameraDrivers` (decision 2). It has a `spaceMouse` mock in the main state factory (`:105`), `spaceMouseHasAxes`/`spaceMouseApply` opts fields (`:243-244`), a `state.subsystems.spaceMouse` override (`:268-271`), one assertion that `spaceMouse.applyToCamera` was not called (`:333`), and explanatory comments (`:36`, `:235`, `:349-356`). Strip the SpaceMouse mock/opts/assertion; the `drivers`/`runCameraDrivers` flow is untouched.
- **`EngineSettingsCallbacks.d.ts`** narrows `EngineCallbacks` via `Pick<EngineCallbacks, 'filaments' | 'input'>` (`:24`). Removing `input` from `EngineCallbacks` forces this `Pick` union to drop `'input'` too — both edits must land in the same task as the `EngineCallbacks.input` removal.

---

## Task 1: Remove the `input` (SpaceMouse) camera driver + driver-related comment tidy

Keep the `CameraDriver` registry; drop only the SpaceMouse driver entry and de-SpaceMouse the surrounding prose. No logic change to `runCameraDrivers`/the write site/the wake gate.

**Files:**
- `src/services/engine/camera/cameraDrivers.ts` (modify)
- `src/services/engine/frame/runFrame.ts` (modify — comments only)
- `tests/services/engine/camera/cameraDriverWrappers.test.ts` (modify)
- `tests/services/engine/frame/runFrame.test.ts` (modify)

**Edits:**
- [ ] `cameraDrivers.ts`: delete the `input` driver object (`cameraDrivers.ts:110-115`) from the returned array in `buildCameraDrivers`. Leave `tween` + `autoRotate` as-is. Rewrite the docstring so it no longer claims SpaceMouse exists: the `input (100) — raw SpaceMouse axes` bullet (`cameraDrivers.ts:99-101`) goes, the "raw input … `spaceMouse`" wrapper-note clause (`cameraDrivers.ts:42-43`), and the "raw input" mention in the module-header mover list (`cameraDrivers.ts:6`). Keep the rest of the seam's didactic prose (single-writer arbitration, precedence-is-data, the `tour` priority-80 note). The `updatePosition` import (`cameraDrivers.ts:54`) stays — `autoRotate` uses it.
- [ ] `runFrame.ts`: comment-only edits. In the "Camera drivers" block (`runFrame.ts:141-165`) drop "raw input" from the mover list and delete the cancellation note that references the SpaceMouse subsystem's `cancelTween` callback (`runFrame.ts:159-161`). In the RoD predicate-breakdown comment (`runFrame.ts:470-476`) drop "raw input" from the "camera drivers active" bullet. **Do NOT touch** the `runCameraDrivers(deps.drivers, state.cam, nowMs)` call (`:163-165`), the `runCameraDrivers` import (`:41`), or the `deps.drivers.some((d) => d.isActive(nowMs))` gate (`:502-503`).
- [ ] `cameraDriverWrappers.test.ts`: remove the entire `describe('buildCameraDrivers — input wrapper', …)` block (`cameraDriverWrappers.test.ts:56-77`) and the `spaceMouse` field from both the fake-state type (`:31`) and the `makeFakeState` literal (`:40`). Keep the `tween` (`:79`) and `autoRotate` (`:102`) describe blocks and the shared `findDriver`/state helper. Update the module docstring if it enumerates the `input` driver.
- [ ] `runFrame.test.ts`: remove the `spaceMouse: { applyToCamera: vi.fn(), hasAxes: () => false }` entry from the main state-factory `subsystems` literal (`runFrame.test.ts:105`), the `spaceMouseHasAxes`/`spaceMouseApply` opts fields (`:243-244`), the `state.subsystems.spaceMouse = { … } as unknown as …` override block (`:268-271`), and the `expect(state.subsystems.spaceMouse.applyToCamera).not.toHaveBeenCalled()` assertion (`:333`). Keep `drivers: []` (`:177`) and `drivers: buildCameraDrivers(state)` (`:291`) and the `buildCameraDrivers` import (`:44`) — the registry survives. Adjust the SpaceMouse-naming comments (`:36`, `:235`, `:349-356`) to drop "spaceMouse" while keeping the tween/autoRotate intent.
- [ ] Run: `npm run typecheck` — Expected: clean. (main thread)
- [ ] Run: `npm test -- cameraDriver runFrame` — Expected: green. (main thread)
- [ ] Commit (paths: `cameraDrivers.ts`, `runFrame.ts`, `cameraDriverWrappers.test.ts`, `runFrame.test.ts`). (main thread)

---

## Task 2: Strip the React/UI surface

**Files:**
- `src/components/App/App.tsx` (modify)
- `src/components/SettingsPanel/SettingsPanel.tsx` (modify)
- `src/components/SettingsPanel/SettingsPanel.module.css` (modify — comment only)
- `src/hooks/useEngineSettings.ts` (modify)
- `src/@types/settings/UseEngineSettingsReturn.d.ts` (modify)
- `src/@types/settings/UseEngineSettingsState.d.ts` (modify)
- `src/hooks/useSpaceMouseDevicePresence.ts` (delete)
- `tests/services/input/spaceMouseDevicePresence.test.ts` (delete)

**Edits:**
- [ ] `App.tsx`: remove the `useSpaceMouseDevicePresence` import (`App.tsx:46`), the `isWebHIDSupported` import (`App.tsx:97`), `setSpaceMouseSensitivity` from the `useEngineSettings` destructure (`App.tsx:140`), `spaceMouseConnected`/`spaceMouseSensitivity` from the `settings` destructure (`App.tsx:143`), the `spaceMouseDevicePresent` + `spaceMouseSectionVisible` cells and their comment (`App.tsx:145-150`), and the SpaceMouse props/handlers passed to `<SettingsPanel>` (`App.tsx:494-507`, incl. the `handleRef.current?.input.spaceMouse.connect()` / `.setSensitivity(value)` calls).
- [ ] `SettingsPanel.tsx`: remove the five SpaceMouse prop-type fields + their comment (`SettingsPanel.tsx:253-259`), the five destructured props (`SettingsPanel.tsx:330-334`), the entire SpaceMouse `<CollapsibleSection>` JSX block + its leading comment (`SettingsPanel.tsx:886-925`), and the two stale SpaceMouse comment mentions (`SettingsPanel.tsx:516`, `:728`).
- [ ] `SettingsPanel.module.css`: drop "SpaceMouse connect" from the comment at `SettingsPanel.module.css:302`.
- [ ] `useEngineSettings.ts`: remove the `DEFAULT_SPACE_MOUSE_SENSITIVITY` import (verify the import line), the `spaceMouseConnected`/`spaceMouseSensitivity` `useState` cells + their comment block (`useEngineSettings.ts:55-72`), the two `settings`-object fields (`useEngineSettings.ts:79-80`), the `input: { spaceMouse: { onConnectedChange: setSpaceMouseConnected } }` callback subsection + its comment (`useEngineSettings.ts:95-101`), the `setSpaceMouseSensitivity` return field (`useEngineSettings.ts:103`), and the two docstring bullets (`useEngineSettings.ts:23-26`). After removal, `settings` is `{ filamentCounts }` and `engineCallbacks` is `{ filaments: { onReady } }` — no `input` cluster.
- [ ] `UseEngineSettingsReturn.d.ts`: remove `setSpaceMouseSensitivity` (`UseEngineSettingsReturn.d.ts:27`) and its docblock (`:22-26`) and the no-echo-setter sentence in the type intro (`:9`).
- [ ] `UseEngineSettingsState.d.ts`: remove the `spaceMouseConnected` (`:49`) and `spaceMouseSensitivity` (`:56`) fields + their docblocks (`:44-56`) and the "two SpaceMouse fields" mention in the type intro comment (`:33`).
- [ ] Delete `useSpaceMouseDevicePresence.ts` and `spaceMouseDevicePresence.test.ts`.
- [ ] Run: `npm run typecheck` — Expected: clean. (main thread)

  > The engine still constructs the subsystem and `EngineCallbacks` still declares `input.spaceMouse.onConnectedChange` at this point — that's fine: the React side simply stops *subscribing* to it. The `EngineCallbacks.input` field + `EngineSettingsCallbacks`'s `Pick<…, 'input'>` are removed in Task 3 alongside the engine reader. If leaving the React side without an `input` subscription while `EngineSettingsCallbacks` still `Pick`s `'input'` trips typecheck, STOP and report — the expected ordering keeps the field declared-but-unsubscribed and green.
- [ ] Run: `npm test` — Expected: green. (main thread)
- [ ] Commit (the modified UI/hook/type files + two deletes). (main thread)

---

## Task 3: Remove the subsystem from the engine core + handle/state/callback types

**Files:**
- `src/services/engine/engine.ts` (modify)
- `src/@types/engine/handles/EngineSubsystemHandles.d.ts` (modify)
- `src/@types/engine/EngineHandle.d.ts` (modify)
- `src/@types/engine/handles/EngineInputHandle.d.ts` (delete)
- `src/@types/engine/state/EngineState.d.ts` (modify — comment only)
- `src/@types/engine/EngineCallbacks.d.ts` (modify)
- `src/@types/settings/EngineSettingsCallbacks.d.ts` (modify)
- `src/data/defaults.ts` (modify)
- `src/services/engine/wiring/settingsTable.ts` (modify — comment only)
- `tests/@types/engineState.test.ts` (modify)
- `tests/services/engine/wiring/settingsTable.test.ts` (modify — comment only)

**Edits:**
- [ ] `engine.ts`: remove the `createSpaceMouseSubsystem` import + its leading comment block (`engine.ts:107-113`); the `spaceMouse: createSpaceMouseSubsystem({ … })` construction block incl. its `cancelTween`/`onConnectionChange`/`onAxes` callbacks and comment (`engine.ts:332-349`); the four bespoke helpers `connectSpaceMouse`/`disconnectSpaceMouse`/`isSpaceMouseConnected`/`setSpaceMouseSensitivity` (`engine.ts:655-672`); the `state.subsystems.spaceMouse.destroy()` line (`engine.ts:710`); the `input: { spaceMouse: { … } }` handle literal (`engine.ts:855-862`); the `spaceMouseSubsystem.ts` bullet in the module-header subsystem list (`engine.ts:38`); the `SpaceMouse per-frame block` line in the tween-manager comment (`engine.ts:326`); and the `spaceMouse` mention in the `subsystems` construction comment (`engine.ts:180`).
- [ ] `EngineSubsystemHandles.d.ts`: remove the `SpaceMouseSubsystem` import (`EngineSubsystemHandles.d.ts:26`), the `spaceMouse: SpaceMouseSubsystem` field (`:61`), and the `spaceMouse` mention in the "Eager (no GPU dep)" comment (`:10`). The trailing `_EnforceDestroyable` compile-time guard stays valid.
- [ ] `EngineHandle.d.ts`: remove the `EngineInputHandle` import (`EngineHandle.d.ts:36`) and the `input: EngineInputHandle` field (`:60`). Per locked decision 1, do NOT leave an empty `input` stub.
- [ ] `EngineState.d.ts`: drop "the SpaceMouse and" from the intro comment (`EngineState.d.ts:8`).
- [ ] `EngineCallbacks.d.ts`: remove the `input` field (the `spaceMouse?: { onConnectedChange?: … }` subsection at `EngineCallbacks.d.ts:186-194`) — it only ever carried `spaceMouse` — and the SpaceMouse mention in the type's intro comment (`:27`).
- [ ] `EngineSettingsCallbacks.d.ts`: drop `'input'` from the `Pick<EngineCallbacks, 'filaments' | 'input'>` union (`EngineSettingsCallbacks.d.ts:24`) → `Pick<EngineCallbacks, 'filaments'>`, and remove the `input.spaceMouse.onConnectedChange` clause from the comment (`:21`).
- [ ] `defaults.ts`: remove `DEFAULT_SPACE_MOUSE_SENSITIVITY` + its `// ── SpaceMouse ──` section header + docblock (`defaults.ts:278-286`).
- [ ] `settingsTable.ts`: remove the `setSpaceMouseSensitivity` bullet from the "bespoke setters" docstring (`settingsTable.ts:36`). Comment only — there is no table row.
- [ ] `settingsTable.test.ts`: remove `setSpaceMouseSensitivity` from the bespoke-setters comment (`settingsTable.test.ts:36`). The asserted `names` list does NOT contain it, so no assertion changes.
- [ ] `engineState.test.ts`: remove the `createSpaceMouseSubsystem` import (`engineState.test.ts:44`) and the `spaceMouse: createSpaceMouseSubsystem({ … })` entry from BOTH engineState fixtures (`engineState.test.ts:180`, `:379`).
- [ ] Delete `EngineInputHandle.d.ts`.
- [ ] Run: `npm run typecheck` — Expected: clean. (main thread)
- [ ] Run: `npm test` — Expected: green. (main thread)
- [ ] Commit (engine.ts + the modified types/defaults/tests + the one delete). (main thread)

---

## Task 4: Delete the now-orphaned SpaceMouse source files, types, and dedicated tests

By this point nothing in `src/` or shared tests references any SpaceMouse symbol; these files are dead. Deleting them together keeps the tree compiling.

**Delete — dedicated source:**
- [ ] `src/services/input/spaceMouse.ts`
- [ ] `src/services/input/spaceMouseReport.ts`
- [ ] `src/services/input/spaceMouseAxes.ts`
- [ ] `src/services/input/spaceMouseSensitivity.ts`
- [ ] `src/services/input/spaceMouseToCamera.ts`
- [ ] `src/services/input/webhid.d.ts` (ambient WebHID shim — only used by `spaceMouse.ts`)
- [ ] `src/services/engine/subsystems/spaceMouseSubsystem.ts`

**Delete — dedicated types (`src/@types/`):**
- [ ] `input/SpaceMouseAxes.d.ts`
- [ ] `input/SpaceMouseInputOptions.d.ts`
- [ ] `input/SpaceMouseInputLike.d.ts`
- [ ] `input/SpaceMouseInputCtorOptions.d.ts`
- [ ] `input/SpaceMouseInputFactory.d.ts`
- [ ] `engine/handles/EngineSpaceMouseHandle.d.ts`
- [ ] `engine/subsystems/SpaceMouseSubsystem.d.ts`
- [ ] `engine/subsystems/CreateSpaceMouseSubsystemInput.d.ts`

**Delete — dedicated tests:**
- [ ] `tests/services/input/spaceMouseReport.test.ts`
- [ ] `tests/services/input/spaceMouseSensitivity.test.ts`
- [ ] `tests/services/input/spaceMouseToCamera.test.ts`
- [ ] `tests/services/engine/subsystems/spaceMouseSubsystem.test.ts`

**Verify no stragglers:** confirm no remaining `import`/reference to any deleted symbol survives in `src/` or `tests/` (`SpaceMouse*` types, `spaceMouse*` modules, `createSpaceMouseSubsystem`, `isWebHIDSupported`, `SpaceMouseInput`, `applyAxesToCamera`, etc.).

**Leave intact (incidental didactic comment mentions — NOT imports):** `orbitCamera.ts:77` ("SpaceMouse zoom"), `OrbitCameraInit.d.ts:60`, `Vec3.d.ts:7`, `Vec2.d.ts:9`, `produceMilkyWayLabel.ts:123`, `renderFrame.ts:69`, `renderScheduler.ts:33`, `biasCorrectionSubsystem.ts:15`, `useEngine.ts:33/142/194`, `tweenManager.ts:7/84`. These name SpaceMouse as a historical example in prose; de-SpaceMousing them is an optional nicety (do it only if you're already touching nearby code), NOT load-bearing — do NOT let them block the green tree.

- [ ] Run: `npm run typecheck` — Expected: clean. (main thread)
- [ ] Run: `npm test` — Expected: green. (main thread)
- [ ] Commit (all deletes, paths enumerated explicitly — never `git add -A`). (main thread)

---

## Task 5: Mark the backlog item done

**Files:** `docs/BACKLOG.md` (modify)

- [ ] Annotate/strike the "Remove the SpaceMouse … subsystem" surfaced-issue bullet (around `docs/BACKLOG.md:66`) as DONE (this PR). Match the file's existing convention for completed surfaced issues — check how prior done items are marked before editing.
- [ ] **Do NOT touch** the "Home button in the top bar" bullet (unrelated), completed plans, or `CLAUDE.md`.
- [ ] Run: `npm run typecheck` — Expected: clean. (main thread; trivial, confirms nothing slipped)
- [ ] Commit (`docs/BACKLOG.md` only). (main thread)

---

## Definition of Done

- [ ] `npm run typecheck` clean.
- [ ] `npm test` green (the suite count drops by the deleted SpaceMouse tests + the removed `input`-wrapper case; net is expected to fall — no new tests are added).
- [ ] No `SpaceMouse`/`spaceMouse`/`webhid` symbol survives in `src/` or `tests/` except the optional incidental comment mentions listed in Task 4.
- [ ] The `CameraDriver` registry is intact: `runCameraDrivers`, `buildCameraDrivers` (now `tween` + `autoRotate` only), `CameraDriver`, `RunFrameDeps.drivers`, the `runCameraDrivers(deps.drivers, …)` write site, and the `deps.drivers.some(…)` wake gate are all present and unchanged in logic. `cameraDrivers.test.ts` is untouched.
- [ ] `EngineInputHandle` is gone (no empty stub); `EngineHandle` has no `input` field.
- [ ] BACKLOG item marked done.
- [ ] PR opened from `remove-spacemouse-subsystem` (base `main`).
