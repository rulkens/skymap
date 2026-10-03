# Deep-link arrival — implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: superpowers:subagent-driven-development under the lean protocol in `docs/superpowers/conventions/sdd-execution.md`. Steps use checkbox (`- [ ]`) syntax.

**Goal:** every deep link opens with the camera already on its subject, behind a veil until the subject resolves. New read-only `#exhibit=`, `#tour=` and `#clip=` links. `ready` comes to mean "arrived".

**Architecture:** The hash rows contribute to one `LinkIntent`. A single `navigateSaga(intent, transition)` serves boot (`'cut'`) and later hash changes (`'fly'`). After `wireInput`, `arrivalSaga` navigates the boot intent, waits for a rendered frame, and flips `arrival.status`; the veil and `whenStablyReady` read that.

**Tech stack:** TS, RTK, typed-redux-saga, React, Vitest, Playwright (tools).

**Spec:** `docs/superpowers/specs/2026-10-01-deep-link-arrival-design.md`.

## Global constraints

- Conventions in `CLAUDE.md` apply: `type`, never `interface`; one symbol per `utils/` and `@types/` file; deep relative imports; the comment budget; no helpers or constants in React component files.
- Moving or renaming a TS file: `npm run move-files -- <from> <to>`, never `git mv`.
- `Transition = 'cut' | 'fly'`. Boot always uses `'cut'`, a hashchange `'fly'`, the palette `'fly'`.
- Precedence: a takeover key (`exhibit` / `tour` / `clip`) beats `focus` and `pose`. `t` and `orientation` apply to every link. Takeover keys are never written back to the URL.
- Arrival failure lifts the veil on the home view with `status: 'failed'`. The backstop timeout is `ARRIVAL_TIMEOUT_MS = 30_000`, in `src/data/`.
- "Rendered" means two `requestAnimationFrame`s after the commit.
- Clips are not takeovers. Do not add a third arm to `watchTakeoverSaga`.

## Review focus

1. **Back/forward or a hand edit after boot** must fly (a tween is dispatched), never re-show the veil, and never touch `arrival`. → Task 4 test.
2. **`#exhibit=x&focus=y`.** The exhibit opens, `y` is never selected or focused, and no tween runs. → Task 2 test (parse) and Task 6 test (no selection).
3. **Unknown takeover id** (`#exhibit=nope`). This must not throw: `watchTakeoverSaga.ts:49` indexes the registry blindly. Expect `status: 'failed'` and the veil lifting on home. → Task 6 test.
4. **A catalog that never delivers the id** (`.bin` 404, or loaded without it). The veil must not hang: the backstop sets `failed` at 30 s. → Task 5 test.
5. **`#focus=body-mars&t=<past instant>`.** Mars is framed where it is at `t`, not at wall-clock time. → Task 5 test.

---

## Prep (behaviour-preserving except where Task 1 says so)

### Task 1: One framing source — `framingPose`

`review: yes`

**Files:**

- Create: `src/services/engine/camera/framingPose.ts`
- Create: `tests/services/engine/camera/framingPose.test.ts`
- Modify: `src/state/camera/focusTweenDescriptor.ts:56`, `src/services/engine/camera/cameraDrivers.ts:99-187` (distance at `:160`), `src/services/engine/camera/bodyHomePose.ts:71-81`, `src/state/selection/watchFlyToLonLatSaga.ts:77`
- Test: the existing `cameraDrivers` test file under `tests/services/engine/camera/`

**Contract:**

```ts
// yaw/pitch come from `from` (the live pose), as in focusTweenDescriptor today
export function framingPose(row: SelectionRow, fovYRad: number, from: CameraPose): CameraPose;
```

Built on `focusFraming(row, fovYRad)` (`focusFraming.ts:71-127`). Every body-distance site above derives its distance from `focusFraming`; `bodyFocusDistance` goes if nothing else reads it.

- [ ] Write the failing test `a followed body holds the distance framingPose gives it`. Use Mars, with `focusDistanceRadii` set; today `cameraDrivers.ts:160` ignores it. Run it and confirm it fails.
- [ ] Write the test `framingPose keeps yaw and pitch of from and takes target and distance from focusFraming`.
- [ ] Implement, then route the four sites through it.
- [ ] Run `npm test -- camera selection`, then commit.

### Task 2: Hash rows contribute to a `LinkIntent`

`review: yes`

**Files:**

- Create: `src/@types/url/LinkView.d.ts`, `src/@types/url/LinkIntent.d.ts`, `src/@types/navigation/Transition.d.ts`
- Create: `src/utils/url/linkIntentFrom.ts`, `src/state/url/applyLinkIntent.ts` (a shim that Task 4 deletes)
- Create: `tests/utils/url/linkIntentFrom.test.ts`
- Modify: `src/@types/state/url/HashParamSource.d.ts:53-78`, `src/state/url/hashParamSources.ts`, `src/state/url/watchHashReadSaga.ts:91-131`
- Test: `tests/state/url/*` must pass unchanged, apart from any fixture that spells out the row contract.

**Contract:**

```ts
type LinkView =
  | { kind: 'home' }
  | { kind: 'focus'; id: string; pose?: CameraPose }
  | { kind: 'pose'; pose: CameraPose }
  | { kind: 'exhibit' | 'tour' | 'clip'; id: string };
type LinkIntent = { view: LinkView; t?: number; orientation?: OrientationFrameId };
type Transition = 'cut' | 'fly';

// HashParamSource: read(value) → Partial<LinkIntent>  (was Action[]); readAbsent / write / writesOn unchanged
export function linkIntentFrom(params: URLSearchParams | string): LinkIntent; // no hash → { view: { kind: 'home' } }
export function* applyLinkIntent(intent: LinkIntent): SagaGenerator<void>;    // emits exactly today's actions
```

Precedence lives in `linkIntentFrom`. A row's contribution to `view` merges as follows: a takeover beats focus and pose, and focus plus pose combine into `{ kind: 'focus', id, pose }`. After this task, table order fixes the write layout only.

- [ ] Write tests:
  - `linkIntentFrom parses each key`: focus, pose, t, orientation.
  - `focus and pose combine into one focus view`.
  - `no hash yields the home view`.
- [ ] Reshape the rows, add `linkIntentFrom` and the `applyLinkIntent` shim, and switch both passes of `watchHashReadSaga` to `applyLinkIntent(linkIntentFrom(…))`.
- [ ] Run `npm test -- url`: all existing url tests pass. Commit.

### Task 3: Focus requests carry a `Transition`

`review: yes`

**Files:**

- Modify: `src/state/selection/requestFocus.ts:10`, `src/state/selection/watchRequestFocusSaga.ts`, `src/state/selection/watchFocusTweenSaga.ts`, `src/components/containers/CommandPaletteContainer.tsx:35`, `src/state/url/applyLinkIntent.ts`, the `CommandPalette.tsx:31` doc line
- Test: `tests/state/selection/watchFocusTweenSaga.test.ts`

**Contract:** `requestFocus({ id: string; transition: Transition })`, with `transition` required. A `'cut'` focus must never start a tween. Choose the narrowest route that carries the transition from the request to the tween decision; `selection.pending` and `updateSelectionFocus` are the candidates. Name the route you chose in your reply. Every existing caller passes `'fly'`.

- [ ] Write the test `a cut focus request sets focus without starting a tween` and confirm it fails.
- [ ] Implement it and update the callers.
- [ ] Run `npm test -- selection url`, then commit.

## Feature

### Task 4: `navigateSaga` and the arrival slice; a hashchange navigates with `'fly'`

`review: yes`

**Files:**

- Create: `src/@types/state/arrival/ArrivalState.d.ts`, `src/state/arrival/arrivalSlice.ts`, `src/state/arrival/selectors.ts`
- Create: `src/state/navigation/navigateSaga.ts`
- Create: `tests/state/navigation/navigateSaga.test.ts`
- Modify: `src/state/url/watchHashReadSaga.ts` (hashchange → `navigateSaga(intent, 'fly')`), the store/root reducer and root saga registration
- Delete: `src/state/url/applyLinkIntent.ts`

**Contract:**

```ts
type ArrivalState = { status: 'pending' | 'arrived' | 'failed'; reason?: 'unknown-id' | 'timeout' };
// arrivalSlice actions: arrivalPending(intent), arrived(), arrivalFailed(reason)
export function* navigateSaga(intent: LinkIntent, transition: Transition): SagaGenerator<NavigateOutcome>;
type NavigateOutcome = { ok: true } | { ok: false; reason: 'unknown-id' }; // own @types file
```

Order inside `navigateSaga`: apply `t`, then `orientation`, then resolve the subject, then one camera commit. This task covers only the `home`, `focus` (with and without `pose`) and `pose` subjects; Task 6 adds the takeover subjects.

- `focus` → `requestSelect(id)` plus `requestFocus({ id, transition })`.
- `focus` with a pose, or `pose` alone → `commitCameraPose(pose)`, no tween.
- `home` → today's `wireInput` home framing plus the Earth focus seed. Lift it into its own module; `wireInput` keeps calling it until Task 5.

**Tests** (each asserts the number of `commitCameraPose` and `startCameraTween` effects):

- `navigate focus cut commits once and never tweens`
- `navigate focus fly tweens as today`
- `navigate focus+pose commits the pose and never tweens`
- `navigate pose commits with no focus`
- `navigate applies t before framing`
- `a hashchange after arrival flies and leaves arrival untouched` (Review focus 1)

- [ ] Write the tests, implement, and route the hashchange loop through `navigateSaga`. The write half's canonicalization (`watchHashWriteSaga.ts:99`) keys on `arrival.status !== 'pending'` instead of `hashArrivalApplied`; delete `hashArrivalApplied` if nothing else reads it.
- [ ] Run `npm test -- url navigation selection`, then commit.

### Task 5: Boot arrival — `arrivalSaga` owns the first view

`review: yes`

**Files:**

- Create: `src/state/arrival/arrivalSaga.ts`, `src/data/arrival/arrivalTimeoutMs.ts`
- Create: `tests/state/arrival/arrivalSaga.test.ts`
- Modify: `src/services/engine/phases/wireInput.ts:101-171` (stop choosing the boot pose and seeding Earth; commit the neutral home base only), `src/state/url/watchHashReadSaga.ts:122-128` (boot pass → `arrivalPending(intent)`)
- Delete: `urlPose`, `applyUrlPose`, `spendUrlPose` and `selectUrlPose` (`CameraState.d.ts:28`, `cameraSlice.ts:32,72-81,132-133`, `camera/selectors.ts:25-26`), the parked-pose branch in `watchFocusTweenSaga.ts:42-56`, and their tests (`watchHashReadSaga.test.ts:50,165,172`; `hashParamSources.test.ts:26,164,169-171`; `watchFocusTweenSaga.test.ts:123-127`; `wireInput.test.ts:93-94,244-253`; the `cameraEpochs.test.ts:71` fixture field)

**Contract:** `arrivalSaga` waits for `cameraRuntime()`. It then races `navigateSaga(bootIntent, 'cut')` (plus, for a focus, the deferred resolve) against `ARRIVAL_TIMEOUT_MS`, waits two rAFs, and puts `arrived()`. On a timeout or `ok: false`, it navigates `home` with `'cut'` and puts `arrivalFailed(reason)`.

- [ ] **First, verify the moving-body premise.** Boot `#focus=body-mars` headlessly on this branch: Playwright via `tools/utils/browser/launchChromium`, a `.mts` script in the scratchpad, screenshot at 1 s and at 4 s. With prep in place, a commit of `framingPose` for a followed body must produce identical frames. If follow re-eases (`cameraEpochs.ts:74`), stop and report before writing more code; don't work around it.
- [ ] Write tests:
  - `boot arrival on a body commits once, never tweens, then arrives`.
  - `boot arrival on a late catalog id waits for the catalog, then arrives`.
  - `an id the loaded catalogs lack fails to home`.
  - `the backstop times out to failed` (Review focus 4).
  - `a body framed at the linked instant, not wall-clock` (Review focus 5).
  - `a plain boot arrives at home with the Earth focus`.
- [ ] Implement it, then delete the `urlPose` machinery.
- [ ] Run `npm test -- arrival camera url selection wireInput`, then commit.

### Task 6: Takeover links — `#exhibit=`, `#tour=`, `#clip=`

`review: yes`

**Files:**

- Modify: `src/state/url/hashParamSources.ts` (three read-only rows, `deepLink: true`, `write: () => null`), `src/utils/url/linkIntentFrom.ts`, `src/state/navigation/navigateSaga.ts`, `src/state/arrival/arrivalSaga.ts`
- Modify: `src/state/exhibits/exhibitActions.ts:10`, `src/state/exhibits/exhibitBodySaga.ts:61-65`, `src/@types/takeover/TakeoverSource.d.ts`, `src/state/takeover/watchTakeoverSaga.ts:48-51`, `src/components/containers/ExhibitOverlayContainer.tsx:25,57`, `src/components/containers/CommandPaletteContainer.tsx:39`
- Test: `tests/state/navigation/navigateSaga.test.ts`, `tests/utils/url/linkIntentFrom.test.ts`, the existing `exhibitBodySaga` test

**Contract:**

```ts
openExhibit({ id: ExhibitId; entry: Transition })                // palette passes 'fly'
type TakeoverSource = { kind: 'tour'; id: TourId } | { kind: 'exhibit'; id: ExhibitId; entry: Transition };
```

- **`exhibit`** with `entry: 'cut'`: `put(commitCameraPose(fittedPose))` replaces the `race(playClip(flyToPoseClip…))`. The settings merge, `clearSelection` and auto-rotate steps stay. The overlay's `enterDelaySec` is `0` on `'cut'` and `FLY_TO_POSE_SEC - COPY_LEAD_SEC` on `'fly'`. Read `entry` from the takeover source; the delay arithmetic belongs in a selector or `utils/` file, not in the container.
- **`tour`**: `startTour(id)`. **`clip`**: `startClip(id)`. For both, the arrival reveals only after the first `clipStarted` plus two rAFs, so `grandTour`'s 0 s opening snap and a fixed-start clip's `start` land behind the veil.
- An unknown id (not in `exhibitRegistry`, `tourRegistry` or `clipFactories`) returns `ok: false, 'unknown-id'` before anything is dispatched.
- The rows write nothing, so the write half's canonicalization strips the takeover key from the address bar right after arrival. This is accepted: the key never lingers into a later focus or time write.

**Tests:**

- `linkIntentFrom: a takeover key beats focus and pose` (Review focus 2)
- `navigate exhibit cut commits the fitted pose and plays no clip`
- `exhibit link selects nothing even with a focus key` (Review focus 2)
- `navigate tour reveals after the first clipStarted`
- `navigate clip reveals after clipStarted`
- `an unknown exhibit id fails without dispatching openExhibit` (Review focus 3)

- [ ] Write the tests, implement, and update the palette dispatch to `openExhibit({ id, entry: 'fly' })`.
- [ ] Run `npm test -- navigation url exhibits takeover`, then commit.

### Task 7: `ArrivalVeil`

**Files:**

- Create: `src/components/ArrivalVeil/ArrivalVeil.tsx`, `ArrivalVeil.module.css`, `src/components/containers/ArrivalVeilContainer.tsx`
- Modify: `src/components/App/App.tsx` (mount the container)

**Contract:** load the `create-component` skill before you start. The veil is opaque, shows `SplashProgress` with the engine's `loadProgress`, and fades out when it hides. It is visible while `arrival.status === 'pending'` AND the boot had a deep link (`hasDeepLink`); a plain boot shows the splash, never the veil. It has `role="status"` and `aria-busy`. No new test: it's a visibility gate over two existing selectors, and a manual check covers it.

- [ ] Implement, `npm run typecheck:fast`, commit.

### Task 8: `ready` means arrived; tools drop their workarounds

**Files:**

- Modify: `src/state/lifecycle/whenStablyReady.ts:21-65` (adds `arrival.status !== 'pending'`; rejects on `failed` with the reason)
- Modify: `tools/utils/capture/captureScene.ts:23-91` (delete the boot `waitSettled`, `POST_ESC_WAIT_MS`, and the pose re-apply plus `readLiveCameraState` verify; exhibit cards open `#exhibit=<id>`)
- Modify: `tools/utils/capture/shotDefaults.ts:20`, `tools/record/record.ts` (delete the clip frame-0 guess), `tools/capture/README.md`, `tools/record/README.md:237-256`
- Delete, if no caller remains: `tools/utils/browser/waitSettled.ts`, `tools/utils/browser/readLiveCameraState.ts`

**Test:** `tests/state/lifecycle/whenStablyReady.test.ts` gets `ready waits for arrival` and `ready rejects when arrival failed`. The tools get none: they are covered by the manual capture run in the DoD.

- [ ] Write the tests, implement, and make the tool deletions. Run `npm run capture-featured` for one exhibit card and one focus card against this branch's dev server (`--url` with this server's port).
- [ ] Commit.

### Task 9: Docs

**Files:** `README.md` ("Reproduce a view": add the exhibit, tour and clip link forms), `docs/RENDERER.md` or `docs/` wherever `#pose=` boot behaviour is described (grep `urlPose`, `#pose=`).

- [ ] Grep for stale mentions of `urlPose`, `applyUrlPose` and `POST_ESC_WAIT_MS` across `docs/`, `tools/` and `.claude/skills/`, fix them, and commit.

## Suggested dispatch grouping

- **D1:** Tasks 1–3 (prep).
- **D2:** Tasks 4–5.
- **D3:** Tasks 6–7.
- **D4:** Tasks 8–9.

## Definition of Done

**Deliverables:**

- `framingPose`, `linkIntentFrom`, `navigateSaga`, `arrivalSaga`, `arrivalSlice`, `ArrivalVeil`.
- The `exhibit`, `tour` and `clip` hash rows.
- `openExhibit({ id, entry })`.
- `urlPose` and its siblings deleted.
- The capture workarounds deleted.

**Manual smoke** (headless, first revealed frame vs the frame 2 s later):

- `#focus=body-mars`: identical frames, and Mars at its own framing distance.
- `#focus=pgc-43149`: the veil holds until the catalog loads, then the galaxy is already framed.
- `#pose=…` from the `l` key: exact pose.
- `#t=<past>`: Earth framed at that instant.
- `#exhibit=cosmicFlows`: at its pose, copy visible at once, slow auto-rotate.
- `#tour=grandTour`: opens on the opening title frame and plays.
- `#clip=cosmicFlows`: opens on its start pose and plays.
- `#exhibit=nope`: the veil lifts on home.
- Browser back after a palette focus: it flies.

**Out of scope:** the `npm run shot` tool; seeking a tour or clip to an offset; writing takeover keys back to the URL; Earth lon/lat in the hash; the twin request sagas; the palette routing through `navigate` (backlogged).
