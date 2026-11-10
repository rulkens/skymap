# Clip studio S3: a clip's scene as pure tracks — implementation plan

> **For agentic workers:** execute with `subagent-driven-development` under
> [`sdd-execution.md`](../conventions/sdd-execution.md). One commit per task. Ask the two pre-flight questions
> (parallelism, perf gate) before Task 0.1; this plan expects the perf gate to run (DoD).

**Goal:** a playing clip's scene (switches, settings writes, focus, orientation frame, `fade` factors) is a pure
function of the clip clock, read by the engine as an overlay on intent, reverting at the clip's end unless the
caller keeps it. The edge-triggered cue path (`applySceneEffect`, `clipOpacityChannel`, the cue cursor) is deleted.

**Spec:** [`2026-11-10-clip-studio-s3-scene-tracks.md`](../specs/2026-11-10-clip-studio-s3-scene-tracks.md) (the
reviewer's document; tasks below carry what implementers need). **Decisions:** grill session Q1 (C), Q2 (B) and
Q48–Q53, recorded in spec §9: `keep` for tours and `revert` elsewhere, intent shown during a clip, default revert
durations, `atEnd` required, no clip perf scenario. G0's prep commits ride the S3 feature PR.

**Landmines to keep in view:** values, not shared mutable state (#1071 was reverted for scheduling next-frame work
through state flags; nothing here may defer work to a later frame); sagas have no settle signal; an action a
reducer does not handle drops silently (`extraReducers`).

---

## File structure

| Path | Status | Role |
| --- | --- | --- |
| `src/services/engine/engine.ts` | modify | `readRoot()` seam; getters read it; player gets its new deps |
| `src/services/engine/frame/runFrame.ts` | modify | `stored` comes from `readRoot()` |
| `src/services/engine/phases/createLayers.ts` | modify | `settings` closure reads `readRoot()` |
| `src/services/engine/phases/wireInput.ts` | modify | both seeds read `readRoot()` |
| `tests/conventions/engineRootRead.test.ts` | create | no `getState()` read of `settings`/`selection`/`selectionRows` outside the seam |
| `src/utils/animation/sceneActionsOf.ts` | create (moved) | the one write table for show/hide/scene/frameTo |
| `src/state/tour/computeSceneEntering.ts` | modify | uses `sceneActionsOf` |
| `src/@types/animation/compiledClip/SceneTracks.d.ts`, `SceneStep.d.ts` (from `SceneCue.d.ts`), `FocusStep.d.ts`, `FactorSegment.d.ts`, `SceneApplied.d.ts`, `FocusRow.d.ts` | create / rename | compiled scene contract |
| `src/@types/animation/compiledClip/CompiledClip.d.ts`, `src/@types/animation/StepSpan.d.ts` | modify | `cues` → `scene` / `steps` |
| `src/services/engine/animation/compileClip.ts`, `validateSeqCueOrder.ts`, `cueOrderKeys.ts` | modify | emit `SceneTracks`; validate over steps |
| `src/utils/animation/countAtOrBefore.ts` | create | applied-step count at t |
| `src/services/engine/animation/sceneView.ts`, `clipFactorAt.ts` | create | the pure evaluators |
| `src/@types/animation/ClipSceneEnd.d.ts` | create | `'revert' \| 'keep'` |
| `src/store/types.ts`, `src/services/engine/animation/playClip.ts`, `src/state/camera/cameraSlice.ts`, `src/@types/camera/orbitCamera/CameraState.d.ts`, `src/services/engine/camera/input/replayInput.ts` | modify | `atEnd` rides the play |
| `src/state/camera/clipBodySaga.ts`, `src/state/tour/visitBeatSaga.ts`, `src/state/tour/pausableDwellSaga.ts`, `src/state/exhibits/exhibitBodySaga.ts`, `src/state/camera/watchReplayInspectedPathSaga.ts`, `tests/helpers/camera/makeCameraSimHarness.ts` | modify | pass `atEnd` |
| `src/services/engine/subsystems/clipPlayer.ts`, `src/@types/engine/subsystems/ClipPlayer.d.ts` | rewrite / modify | evaluate, publish, end |
| `src/services/engine/presentation/resolveVisibilityOpacity.ts` | modify | `clipOpacityOf(address)` |
| `src/services/animation/applySceneEffect.ts`, `src/services/animation/clipOpacityChannel.ts`, `src/@types/animation/ClipOpacityChannel.d.ts` + their tests | delete | the edge-triggered path |
| `docs/animation/clip-primitives.md`, `docs/adrs/0017-*.md`, comments named in Task 3.1, `tools/record/README.md` | modify / create | docs |

---

## G0: Ground preparation (dispatch 1)

### Task 0.1: one root read for the engine

**Files:** `src/services/engine/engine.ts`, `src/services/engine/frame/runFrame.ts`,
`src/services/engine/phases/createLayers.ts`, `src/services/engine/phases/wireInput.ts`,
`tests/conventions/engineRootRead.test.ts` (create)

Add an engine-owned `readRoot: () => RootState`, today `() => store.getState()`, and route through it every engine
read of the root that can reach `settings`, `selection` or `selectionRows`:

- the `settings`, `selection`, `selectionRows` getters (`engine.ts:129-140`; `tier` and `ui` may stay);
- `runFrame`'s `const stored = deps.cb.store.getState()` (`runFrame.ts:87`), handed in as a dep;
- `createLayers`' `settings: () => deps.cb.store.getState().settings` (`createLayers.ts:104`);
- `wireInput`'s `selectOrientation(store.getState())` and `seedCameraRuntime({ state: store.getState() … })`
  (`wireInput.ts:85,93`), and `engine.ts:95`'s seed.

`engine.ts:448` (`cameraDebug`, reads `camera` and time) may stay on the store.

Convention test `engineRootRead.test.ts`: scan `src/services/engine/**` and `src/layers/**` (no `*.test.*`) for
`getState()` and fail on any match outside an allowlist of exactly: `engine.ts` (the `readRoot` definition and the
`tier`/`ui`/`cameraDebug` reads), `clipPlayer.ts` (reads `camera.clip`), `createPickDriver.ts:37`
(`selectPickRequests`). The failure message names the file:line and says "read the root through `readRoot()` so a
playing clip's scene reaches it". This test earns its place: a bypass silently ignores the S3 overlay and nothing
else fails.

- [x] Add `readRoot`, route the reads above, add the test.
- [x] `npm run typecheck:fast`; `npx vitest run tests/conventions/engineRootRead.test.ts tests/services/engine/frame`.
- [x] Commit: "Engine reads the root through one seam".

### Task 0.2: `sceneActionsOf` becomes the one scene write table

**Files:** `src/utils/animation/sceneActionsOf.ts` (create), `src/state/tour/computeSceneEntering.ts`

**Signature:** `sceneActionsOf(effect: Effect, settings: EngineSettingsState): readonly Action[]`
**Behaviour:** the private `actionsOf` at `computeSceneEntering.ts:24-36`, moved, plus one arm:
`frameTo` → `[setOrientation(effect.frame)]` (`src/state/settings/core/orientationSlice.ts`). Every other kind → `[]`.

The tour fold's output is unchanged: `captureSettings` drops `orientation`
(`src/state/scene/captureSettings.ts` header), so the fold needs no flag. Update the fold's header line that says
`frameTo` is excluded: it is now folded and dropped by the capture. No new test (a moved function; the frameTo arm
is asserted through `sceneView` in Task 1.2, and `tests/state/tour/computeSceneEntering.test.ts` must stay green).

- [x] Move, add the arm, point `computeSceneEntering` at it.
- [x] `npx vitest run tests/state/tour`.
- [x] Commit: "Scene writes come from one table".

**Controller, after dispatch 1:** take the perf baseline on this HEAD (DoD perf gate):
`npm run perf -- --url http://localhost:<port>` and `npm run perf:cpu -- --url http://localhost:<port>`, all
scenarios, this worktree's own server (the `perf` skill). Record both in the ledger.

---

## G1: Compile and evaluate (dispatch 2)

### Task 1.1: `compileClip` emits `SceneTracks`

**Files:** `src/@types/animation/compiledClip/SceneTracks.d.ts`, `FocusStep.d.ts`, `FactorSegment.d.ts` (create);
`SceneCue.d.ts` → `SceneStep.d.ts`; `src/@types/animation/compiledClip/CompiledClip.d.ts`,
`src/@types/animation/StepSpan.d.ts`, `src/services/engine/animation/compileClip.ts`, `validateSeqCueOrder.ts`,
`cueOrderKeys.ts`; `tests/services/engine/animation/compileClip.test.ts`, `validateSeqCueOrder.test.ts`

Rename the file and the type first:
`npm run move-files -- src/@types/animation/compiledClip/SceneCue.d.ts src/@types/animation/compiledClip/SceneStep.d.ts`
then `npm run refactor -- rename SceneCue SceneStep` (see `.claude/skills/refactor/SKILL.md`). Never `git mv`.

**Contract:**

```ts
export type SceneTracks = {
  /** show / hide / scene / frameTo, ascending atSec; equal atSec keeps written order. */
  readonly steps: readonly SceneStep[];
  /** focus() writes, ascending atSec; `ref: null` is an explicit clear. */
  readonly focus: readonly FocusStep[];
  /** fade() per address: the clip factor's segments, ascending, non-overlapping. */
  readonly factors: Readonly<Partial<Record<VisibilityAddress, readonly FactorSegment[]>>>;
};
export type SceneStep = {
  readonly atSec: number;
  readonly effect: Extract<SceneEffect, { kind: 'show' | 'hide' | 'scene' | 'frameTo' }>;
};
export type FocusStep = { readonly atSec: number; readonly ref: SelectionRefBase | null };
/** The factor ramps `from → to` over [startSec, endSec] on the fade controller's smoothstep curve. */
export type FactorSegment = {
  readonly startSec: number;
  readonly endSec: number;
  readonly from: number;
  readonly to: number;
};
```

`CompiledClip.cues` becomes `scene: SceneTracks`. The accumulator keeps `steps` in push order for
`validateSeqCueOrder` and sorts a copy (stable) for `scene.steps`. `StepSpan.cues` becomes `steps`, an index range
into the push-order steps. `validateSeqCueOrder(seqs, steps)` and `cueOrderKeys(step)` take `SceneStep`; behaviour is
unchanged because focus and fade never had order keys. Origin paths (`emitted`, spans) keep recording every scene
effect, focus and fade included.

Factor rules: `fade(args, to, over)` at `t0` appends, per address, `{ startSec: t0, endSec: t0 + over, from, to }`
where `from` is the factor the address's previous segments give at `t0` (1 if none; the smoothstep value if `t0`
falls inside one, which that segment's `endSec` is then cut to). A `fade` whose `to` equals the address's current
target appends nothing (the `FadeController.fadeTo` no-op, `fadeController.ts:67-70`). `over: 0` is a segment with
`startSec === endSec`.

**As built (G1), three deviations:**

- **`cues` stays until Task 2.2.** The live `clipPlayer.ts` still fires `compiled.cues` (focus and fade included), and
  the suite must stay green between dispatches, so compile emits `scene` beside `cues` and `SceneStep` is a new file
  instead of a rename of `SceneCue`. Task 2.2 deletes `CompiledClip.cues`, `Accum.cues`, `sortedCues` and
  `SceneCue.d.ts` with the cue path.
- **Segments supersede, they are not cut.** Cutting the first segment's `endSec` changes its smoothstep curve (at
  t = 1 it would read 0.5 instead of today's 0.84375, and jump at the cut). A later segment instead takes over from
  its own `startSec`; `clipFactorAt` evaluates the last segment with `startSec ≤ t`. `FactorSegment` and
  `SceneTracks.factors` say "ascending startSec", not "non-overlapping".
- **`clipFactorAt` lands here**, with its test, because compile computes each `from` with it.

- [x] Test `scene steps are time-sorted and keep written order at one instant` (two steps at the same `atSec` in
      written order A, B; a later-written step with an earlier `atSec` sorts first).
- [x] Test `a fade starts from the factor the previous fade reached` (fade to 0 over 4 s at 0, fade to 1 over 2 s
      at 2: second segment `from` is the smoothstep value at u = 0.5, i.e. 0.5; the first segment keeps its curve).
- [x] Test `a fade to the target already held adds no segment`.
- [x] Test `focus(null) compiles to an explicit clear step`.
- [x] Update the existing `.cues` assertions in `compileClip.test.ts` and the `validateSeqCueOrder` fixtures to steps.
- [x] `npx vitest run tests/services/engine/animation`.
- [x] Commit: "A compiled clip carries its scene as tracks".

### Task 1.2: the pure evaluators

**Files:** `src/utils/animation/countAtOrBefore.ts`, `src/services/engine/animation/sceneView.ts`,
`src/services/engine/animation/clipFactorAt.ts`, `src/@types/animation/compiledClip/SceneApplied.d.ts`,
`src/@types/animation/compiledClip/FocusRow.d.ts` (create);
tests mirrored under `tests/`

**review: yes** (Redux state folded through reducers; the silent-drop landmine)

```ts
/** How many of `items` (ascending atSec) apply at t: atSec ≤ t. */
export function countAtOrBefore(items: readonly { readonly atSec: number }[], t: number): number;

export type SceneApplied = { readonly steps: number; readonly focus: number };

/** The focus row for the last applied focus step, as `watchSelectionRowsSaga` would extract it. */
export type FocusRow = { readonly row: SelectionRowBase | null; readonly focusId: string | null };

export function sceneView(
  root: RootState,
  tracks: SceneTracks,
  applied: SceneApplied,
  focusRow: FocusRow | null,
): RootState;

export function clipFactorAt(segments: readonly FactorSegment[] | undefined, t: number): number;
```

`sceneView` folds `tracks.steps.slice(0, applied.steps)` through `sceneActionsOf` + `settingsReducer` into
`root.settings`, and when `applied.focus > 0` the last applied focus step through `selectionReducer`
(`updateSelectionFocus(ref)`) and `selectionRowsReducer` (`setSelectionRow({ slot: 'focus', ...focusRow })`).
It takes values only and calls nothing that reads the engine's getters: the getters read the view, so a callback
here would recurse.
It returns `root` itself (identity) when both counts are 0, and never mutates `root` (the store's state is frozen).
Folding is not dispatching: `selectionRowsSlice`'s "only `watchSelectionRowsSaga` dispatches `setSelectionRow`" rule
is untouched. `clipFactorAt`: 1 before the first segment or with no segments; inside a segment
`from + (to − from) · smoothstep(u)` using `src/utils/math/smoothstep.ts`; after the last, its `to`.

- [ ] Test `sceneView folds the applied steps over intent and leaves the rest` (show at 1, hide at 3; applied 1 →
      switch on; the root's own settings object unchanged).
- [ ] Test `sceneView carries each kind into the view` — one assertion per kind: a scoped `show('survey:sdss')`
      sets that item, a `scene(setFlowEnabled(true))` sets `flow.enabled`, a `frameTo('supergalactic')` sets
      `settings.orientation` (guards a reducer silently dropping a folded action).
- [ ] Test `sceneView focus: a null step clears, no focus step leaves the intent focus` (and the focus row and
      `focusId` come from the `focusRow` argument).
- [ ] Test `sceneView with nothing applied is the root itself`.
- [ ] Test `clipFactorAt follows the segments, holding the last value after them` (mid-ramp value, value after,
      1 before).
- [ ] No test for `countAtOrBefore` beyond its use (a boundary at `atSec === t` is covered by the view test's
      step at exactly t, which must apply).
- [ ] `npx vitest run tests/services/engine/animation tests/utils/animation`.
- [ ] Commit: "A clip's scene evaluates at any t".

---

## G2: The player and the seam (dispatch 3, Opus)

### Task 2.1: `atEnd` rides every play

**Files:** `src/@types/animation/ClipSceneEnd.d.ts` (create), `src/store/types.ts`,
`src/services/engine/animation/playClip.ts`, `src/state/camera/cameraSlice.ts`,
`src/@types/camera/orbitCamera/CameraState.d.ts`, `src/services/engine/camera/input/replayInput.ts`,
`src/state/camera/clipBodySaga.ts`, `src/state/tour/visitBeatSaga.ts`, `src/state/tour/pausableDwellSaga.ts`,
`src/state/exhibits/exhibitBodySaga.ts`, `src/state/camera/watchReplayInspectedPathSaga.ts`,
`tests/helpers/camera/makeCameraSimHarness.ts` and any test calling `playClip`/`clipStarted`

```ts
/** What happens to a clip's scene when it ends: dropped, or committed to intent by the player. */
export type ClipSceneEnd = 'revert' | 'keep';

// SagaContext
playClip: (clip: ClipData, frame: OrientationFrameId, atEnd: ClipSceneEnd) => Promise<void>;
// cameraSlice
clipStarted: PayloadAction<{ data: ClipData; frame: OrientationFrameId; atEnd: ClipSceneEnd }>;
```

Required, no default (spec §9, Decision 4). Call sites: `visitBeatSaga.ts:122` and `pausableDwellSaga.ts:87` pass `'keep'`;
`clipBodySaga.ts:52`, `exhibitBodySaga.ts:85`, `watchReplayInspectedPathSaga.ts:62` and `replayInput.ts:119` pass
`'revert'`. The player ignores it until Task 2.2. No new test: type plumbing the compiler checks.

- [ ] Add the type, thread it, update call sites and test helpers.
- [ ] `npm run typecheck:fast`; `npx vitest run tests/state/tour tests/state/camera tests/services/engine/animation`.
- [ ] Commit: "A play says what happens to its scene at the end".

### Task 2.2: the player evaluates, publishes and ends

**Files:** `src/services/engine/subsystems/clipPlayer.ts`, `src/@types/engine/subsystems/ClipPlayer.d.ts`,
`src/services/engine/presentation/resolveVisibilityOpacity.ts`, `src/services/engine/engine.ts` (player
construction), `tests/services/engine/subsystems/clipPlayer.test.ts`; delete
`src/services/animation/applySceneEffect.ts`, `src/services/animation/clipOpacityChannel.ts`,
`src/@types/animation/ClipOpacityChannel.d.ts`, `tests/services/animation/applySceneEffect.test.ts`,
`tests/services/animation/clipOpacityChannel.test.ts`

**review: yes** (sagas/state, shared output, the landmine list)

```ts
export type ClipPlayer = {
  tick(clipEpoch: CameraEpochs['clip'], nowMs: number): { readonly clipEpoch: CameraEpochs['clip'] };
  stop(): void;
  registerEndResolver(onEnd: () => void): void;
  /** The clip factor at the current t; 1 when no clip, or the clip never fades `address`. */
  clipOpacityOf(address: VisibilityAddress): number;
  /** `root` with the live clip's scene at the current t folded in; `root` itself when no clip. Memoized. */
  view(root: RootState): RootState;
} & Destroyable;

type ClipPlayerDeps = {
  store: { getState(): RootState; dispatch: AppDispatch };
  getEngineState: () => EngineState; // live basis for a frame roll
  /** engine.ts: the selection resolver's `extractRow` + `focusIdOf` at the derived sim instant. */
  extractFocusRow: (ref: SelectionRefBase | null) => FocusRow;
  /** Re-target every visibility fade against `settings`; `overMs` as a `setVisibility` carries it. */
  syncVisibility: (settings: EngineSettingsState, overMs?: number) => void;
};
```

Behaviour, per tick (all synchronous inside `tick`; nothing deferred to a later frame):

1. Epoch as today. `t` = elapsed clamped to `durationSec`; a looping clip wraps (rebased epoch as today).
2. `applied = { steps: countAtOrBefore(scene.steps, t), focus: countAtOrBefore(scene.focus, t) }`. When
   `applied.focus` changes, extract the focus row once (`extractFocusRow(lastAppliedFocus.ref)`) and keep it.
3. Publish each step crossed since the last tick, in order: `syncVisibility(viewAt(step).settings, step.effect.over * 1000)`
   for show/hide (`over` undefined → no `overMs`), `syncVisibility(viewAt(step).settings)` for `scene`, and for
   `frameTo` dispatch `startFrameTween({ fromQuat: liveUpBasisQuat(cameraRuntime), to: frame, durationMs: over * 1000, easing: ease })`
   (lift the logic from `applySceneEffect.ts:63-72` before deleting it). A backward jump (loop wrap) publishes the
   difference once with no `overMs`; a frame difference rolls over `FRAME_TWEEN_MS`.
4. `view(root)` returns `sceneView(root, scene, applied, focusRow)`, memoized on `root.settings`,
   `root.selection`, `root.selectionRows` identities and `applied`.
5. End (the existing two-frame natural-end latch, or `stop()` at the current t), by `camera.clip.atEnd`:
   - `'keep'`: dispatch `mergeSnapshot(captureSettings(view))`, then `updateSelectionFocus(view.selection.focus)` if
     `scene.focus.length > 0`, then `setOrientation(view.settings.orientation)` if it differs from the store's
     (not `requestOrientationChange`: the view already shows that frame, so nothing should roll or re-express);
     then `clipEnded()`, reset, end-resolver.
   - `'revert'` (default durations, never a snap: Decision 3): `clipEnded()`, reset; then
     `syncVisibility(store settings)` with no `overMs` (registry 600 ms in, 100 ms out), and if the clip's
     view orientation differs from the store's, `startFrameTween` from the live basis to the store's frame over
     `FRAME_TWEEN_MS`; then the end-resolver.
   - The factor is 1 after either (no channel to reset: no clip, no factor).

`resolveVisibilityOpacity` calls `clipOpacityOf(address)` (drop `nowMs`). `engine.ts` builds `syncVisibility` from
`syncVisibilityTargets` (`src/services/engine/wiring/syncVisibilityTargets.ts`) with `{ ...state, settings }`.

Tests (rewrite `clipPlayer.test.ts`; keep the epoch, deferred-end, runtime-free, rebased-loop and destroy tests):

- [ ] `a show step reaches the view at its atSec and the store is never written mid-clip`.
- [ ] `each crossed visibility step syncs with its own over` (show over 4 and hide over 1 crossed in one tick → two
      syncs, 4000 then 1000, each against the view as of its step).
- [ ] `a frameTo step starts a frame tween from the live basis and puts its frame in the view`.
- [ ] `clipOpacityOf is the factor at t whatever frames were skipped` (tick at 0 then at 3.5: value equals
      `clipFactorAt` at 3.5).
- [ ] `revert: at the end the view is the store again and visibility re-syncs with default durations`.
- [ ] `keep: at the end the store holds the view's settings, focus and orientation before clipEnded`.
- [ ] `keep: stop() commits the steps reached by the stop instant, not later ones`.
- [ ] `a looping clip re-evaluates each lap from intent; a step at 0 holds across the wrap with no publish`.
- [ ] `view is memoized: the same root and applied counts return the same object`.
- [ ] `npx vitest run tests/services/engine/subsystems tests/services/engine/presentation`.
- [ ] Commit: "A clip's scene is evaluated at t, never dispatched".

### Task 2.3: the engine reads the view; tests that fired cues by hand migrate

**Files:** `src/services/engine/engine.ts` (`readRoot = () => clipPlayer.view(store.getState())`),
`tests/state/tour/tour.integration.test.ts`, `tests/state/tour/cueOver.integration.test.ts`,
`tests/state/tour/webShowcaseDive.integration.test.ts`, `tests/data/animation/tours/grandTour/frameLadder.test.ts`,
`tests/state/tour/tourBodySaga.test.ts`, `tests/state/tour/computeSceneEntering.test.ts` (only where they import
`applySceneEffect`/`clipOpacityChannel` or assert cue-time writes)

**review: yes** (the seam every engine reader goes through)

Tests that imported `applySceneEffect` to replay cues switch to `sceneActionsOf` folded through the reducer, or to
the player; their assertions about what a beat leaves behind (Virgo focus into beat 3, the pole never reverted at a
beat boundary) must still hold under `'keep'`.

- [ ] Test (integration, tour) `a beat's enter-clip scene holds through its dwell` (enter clip shows `flow`; during
      the dwell the switch is on in the store and the fade target is 1).
- [ ] Test (integration) `a standalone clip's scene reverts at its end` (the `cosmicFlows` shape: hidden web layers
      come back, `flow.enabled` back to the pre-clip value, the store never written mid-clip).
- [ ] `npx vitest run tests/state tests/data/animation tests/services/engine`.
- [ ] Commit: "The engine reads a playing clip's scene through its root".

---

## G3: Docs (dispatch 4, or controller inline)

### Task 3.1: docs, comments and the ADR

**Files:** `docs/adrs/0017-clip-scene-is-an-overlay.md` (next free number; create via the `adr` skill),
`docs/animation/clip-primitives.md` (Scene effects section, the opacity section, the `cosmicFlows` idiom note,
Layer 1 vs 2), `src/@types/animation/SceneEffect.d.ts` header (cues → steps evaluated at t; show/hide no longer write
intent), `src/@types/animation/compiledClip/CompiledClip.d.ts` header, `src/state/camera/clipBodySaga.ts` header
("A clip leaves the scene alone" → its scene reverts), `src/data/animation/clips/grandTourBeats.ts:12-15`,
`src/state/scene/restoreSceneSaga.ts:52`, `src/state/selection/suspendDuringClip.ts:27-32` (still load-bearing: a
`keep` commit dispatches focus while the clip is active), `src/compositions/clips/cosmicFlows.ts` header (the
intent fade-up now happens in the view), `tools/record/README.md:182-190`

ADR content: a clip's scene is an overlay folded over intent at t and never dispatched; transitions stay with the
subsystems that animate user changes; `revert` by default, `keep` for tours with the commit in the end tick; why
not affine overlays or a concatenated tour (spec §8). Comment budget per `comments.md`.

- [ ] Write the ADR and update the files above. No test.
- [ ] Commit: "docs: a clip's scene is an overlay evaluated at t".

---

## Definition of Done

**Deliverables**

- `CompiledClip.scene: SceneTracks`; `SceneStep`, `FocusStep`, `FactorSegment`, `SceneApplied`, `FocusRow`, `ClipSceneEnd`
  types; `sceneView`, `clipFactorAt`, `countAtOrBefore`, `sceneActionsOf`.
- `ClipPlayer.view(root)` and `clipOpacityOf(address)`; `readRoot()` the engine's only root read for `settings`,
  `selection`, `selectionRows`, enforced by `tests/conventions/engineRootRead.test.ts`.
- `applySceneEffect`, `clipOpacityChannel`, `ClipOpacityChannel`, `SceneCue` and the cue cursor deleted; no
  `cues` left in `CompiledClip`.
- ADR 0017 (or the next free number); `clip-primitives.md` describes steps, the overlay, revert and keep.

**Observable behaviours (manual smoke, on this worktree's dev server)**

- `#clip=cosmicFlows`: the flow field fades in while the clip plays; the layer panel's flow switch stays at the
  user's value throughout; at the end the web layers and famous-galaxy labels fade back in and flow fades out.
- `#clip=earthCosmicWebLoop`: labels stay hidden across laps; Esc (stop) brings them back.
- The grand tour from beat 0: `openingTitle`'s strip holds through its dwell and later beats; `cosmicFlows`' flow
  ramp continues smoothly from the enter clip into the dwell; the pole stays `supergalactic` from `approachM31` to
  `homeAgain`; Prev and skip land on the same scenes as before; exit restores the pre-tour scene.
- The URL hash does not change mid-clip for a standalone clip with focus or `frameTo` steps.

**Perf gate**

- `npm run perf` and `npm run perf:cpu` (all scenarios, `--url` this worktree's server) on the G0 HEAD and on the
  final HEAD, both in the ledger; no scenario regresses beyond run-to-run noise. A regression halts landing for the
  owner's ruling.
- Baseline, G0 HEAD `64497c71c` (2026-11-10, this machine). GPU = `npm run perf` MERGED median ms; CPU = sum of
  `npm run perf:cpu` row means, ms per frame.

  | scenario | GPU | CPU |
  | --- | --- | --- |
  | earth-surface | 24.6 | 2.018 |
  | earth-copenhagen-500km | 26.2 | 2.219 |
  | mars-jezero-146km | 44.8 | 2.140 |
  | solar-system | 21.2 | 1.601 |
  | star-field | 9.7 | 1.402 |
  | milky-way | 30.7 | 1.701 |
  | milky-way-outside | 26.0 | 1.659 |
  | milky-way-close | 43.5 | 1.721 |
  | galactic-centre | 10.2 | 2.158 |
  | sgr-a-star-lens | 36.2 | 2.279 |
  | local-group | 4.4 | 0.827 |
  | full-survey | 4.4 | 0.842 |

**Deferral boundary (out of scope)**

- Seek, pause, transport and the seed of registry and frame-tween ramps at an arbitrary t (S4).
- Re-authoring `cosmicFlows` (beat D still never plays; its backlog item stands).
- Unifying `computeSceneEntering`'s fold with the compiled tracks, and `fadeController`'s private `smoothstep`
  (adjacent findings, backlog).
- A perf scenario that plays a clip.
