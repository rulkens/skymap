# The drawn camera in the store: design spec

> **Status.** Draft, 2026-11-13. Owner: Alexander Rulkens. Approved for speccing as its own PR;
> the owner ruled the first draft's open questions the same day (camera slice with two halves,
> 4 Hz distance in the read, skippers keep skipping, tilt moves in, clock stance later).
> **Written against** main at 73876bd46. #1090 (sky mode entry, open) touches the same readout
> rows; §9 says what changes once it lands.
> **Inputs.** The hidden-state audit (M1–M3, C1, C4, §3) and
> [`docs/backlog/2026-11-11-hidden-state-machines.md`](../../backlog/2026-11-11-hidden-state-machines.md) #5.

## 1. Why

`camera.base` is where the camera rests. It commits only on edges (gesture end, at-rest zoom
notch, clip end, fold crossings in `projectFramePose`), so it lags the drawn pose for the whole
lift-off climb (~1.5 s), the Leave return flight (~2 s) and one frame at arrival end. Whatever wants
"what is on screen" therefore reaches past the store into the engine:

- 10 saga files read `SagaContext.cameraRuntime()` (`src/store/types.ts:162`, registered at
  `src/services/engine/engine.ts:333`). One of them is `liveCameraRuntimeSaga`, which
  `navigateSaga` and `arrivalSaga` call; it loops on `take('*')` until the getter stops
  returning null.
- `scaleReadoutRow` and `bodyDistanceReadoutRow` dispatch per-frame readouts, the second behind
  `publishBodyDistanceGate`, a module-scope throttle that two engines on one page share.
- The `l` key's share URL comes back through `ReconcileEffects.logCameraState()`'s return value.

The drawn pose depends on streamed terrain (`flooredBodyPose` floors the eye on `terrainHeightAt`,
composed at `src/services/engine/phases/createLayers.ts:204`), so only `runFrame` can write it.
The remembered tilt (`CameraRuntime.tilt`) is viewer intent, like the lens, but it lives only in
the engine, so neither a takeover nor a `SceneSnapshot` can restore it.

## 2. Today's camera slice, field by field

| Field        | Kind             | Written by                                                               | Cadence                                   |
| ------------ | ---------------- | ------------------------------------------------------------------------ | ----------------------------------------- |
| `base`       | resting intent   | gesture end, at-rest notch, clip end (`commitOnEdge`), fold, sagas       | edges                                     |
| `tween`      | intent (motion)  | focus/home sagas; cleared by clip end, a press, cancel                   | edges                                     |
| `clip`       | intent (motion)  | `clipStarted` / `clipEnded`                                              | edges                                     |
| `frameTween` | intent (motion)  | orientation saga, clip cues                                              | edges                                     |
| `aim`        | intent           | exhibit hold re-aims                                                     | edges                                     |
| `autoRotate` | intent           | the toggle                                                               | edges                                     |
| `fovYRad`    | intent           | notch, pinch and held-key nudge steps; a clip's hand-off                 | input steps (per frame while a key holds) |
| `tuning`     | config           | debug-panel sliders; session-only, never serialized                      | edges                                     |
| (tilt)       | intent, engine   | `CameraRuntime.tilt`, threaded through the arm rows                      | input steps (a tilt drag)                 |
| (drawn)      | readout, engine  | `CameraRuntime.outputs`, plus frame-local values in `runFrame`           | every frame                               |

Nothing in today's slice changes because a frame was drawn. The drawn pose is the only fact
that does, and it is the one this spec adds.

## 3. Decisions

- **D1. The `camera` route gets two halves: `camera.intent` and `camera.rendered`.** They are
  combined in `rootReducer`. Every field in today's slice moves under `intent` unchanged; `rendered`
  is the new drawn record. Fast and slow state sit side by side, but in separate reducers, so a
  per-frame write never touches the intent reference.
- **D2. The intent half is called `intent`.** The candidates:
  - `intent`: it matches `selectCameraIntent`, the slice header ("the camera's Intent state"),
    [`intent.md`](../conventions/intent.md) and the step's `intent: rootState.camera`. **Picked.**
  - `rest`: it reads well beside `rendered`, but `tween`, `clip` and `aim` are motions, not rest.
  - `committed`: true of `base`, but `tween` and `clip` are descriptors, not commits.
- **D3. The wake fix: `rendered` gets its own slice name, `cameraRendered`.** `WAKE_ROUTES` already
  matches the action-type prefix (`a.type.split('/')[0]`, `watchWakeSaga.ts:56`), and that prefix
  is the slice name. The intent slice keeps `name: 'camera'`, so every `camera/*` action, and
  every wake, stays byte-identical. The rendered action is `cameraRendered/drawn`, which no wake
  route matches. The predicate gets no term and no code change, only a comment line saying a wake
  route is a slice name. The alternatives were worse: an exclusion term is the "another
  hand-added term in a wake predicate" bolt-on (`.claude/refactor-ground.md`), and keying the wake
  on the intent reference would add a `select` per action to every route.
- **D4. One action, `cameraDrawn(RenderedCameraState | null)`, built with `prepareAutoBatched`.** RTK
  2's `configureStore` already installs `autoBatchEnhancer` (`'raf'`): subscribers hear it at most
  once per frame, the store config is untouched, and sagas (middleware) still see it at once.
- **D5. Only the engine writes `rendered`: `runFrame` on every booted frame, `destroy()` with
  null.** Null means "no live engine has drawn a frame", which covers both pre-boot and
  post-destroy. The intent half never changes because a frame was drawn. It changes on input
  steps and intent edges only: a held key or a tilt drag writes at input rate, as the `input`
  slice already does.
- **D6. No dedup in the reducer.** A live clock moves `simDays` every frame, so a dedup would
  rarely hit. The selectors are the guard (D10).
- **D7. `rendered.world` is `liveWorldPose(state)`, computed in the frame.** Every saga gets the
  value it gets today. The step's own `world` stays the draw path's value (§8).
- **D8. Body distance: `rendered.focusRangeMpc` every frame, and the 4 Hz is the card's read.** A
  hook, `useSampledSelector(selector, everyMs)` in `src/hooks/`, reads the store on an interval
  and bails out when the value is unchanged. It follows `useSimInstant`'s pattern. The card
  container reads `selectFocusedBodyDistanceMpc` through it at 250 ms; the card itself doesn't
  change. The alternatives weighed:
  - A sampling saga that writes a 4 Hz copy into the store. It keeps the same fact in two
    places and needs a timer that lives outside the reader.
  - Today's engine gate. It ties a display cadence to the frame loop, and its module-scope state
    is shared across engines.
  - A throttled store subscription. It needs trailing-edge bookkeeping to show the final value.
  - A per-frame label. The owner wants 4 Hz.

  It stays one value for every focus kind: Layer-placed foci (craft, satellites, asteroids) are
  placed only by `placeLiveSelection` over engine-held `selectionKindRows`, so a split would give
  the fact two homes.
- **D9. The canvas CSS size rides the record as `viewportCssPx`**, read once per frame. Today it is
  read twice (`runFrame.ts:73`, `:152`). A ResizeObserver writer would add a writer and delete
  nothing.
- **D10. React reads only primitives or memoized values.** `selectScale` keeps its last result while
  label and width match (reselect `resultEqualityCheck`). Only sagas read the whole record.
- **D11. One wait saga, `renderedCameraSaga`, replaces `liveCameraRuntimeSaga`.** It selects the
  record and `take`s `cameraDrawn` while it is null. It replaces the `take('*')` loop,
  `watchFocusTweenSaga`'s `engineStatusChanged` loop and the `cameraRuntime() !== null` term in
  three `waitUntilSaga` predicates.
- **D12. The sagas that skip when there is no camera keep skipping (owner ruling).** These are
  `watchGoHomeSaga`, `watchFlyToLonLatSaga`, `watchOrientationChangeSaga`, `missionHoldSaga` and
  `exhibitBodySaga`. Each switches to `select(...) === null`, and its behaviour doesn't change.
- **D13. Contracts only shrink.** `SagaContext.cameraRuntime` and `LiveCameraRuntime` go, and
  `ReconcileEffects.logCameraState` returns `void`: `watchLogCameraStateSaga` builds the share URL
  from the record. The Layer contract, ReconcileEffects, SagaContext and CameraArmCtx gain nothing.
- **D14. The debug panel keeps `handle.debug.cameraDebug()`.** It reads gesture memory, the driver
  winner, orient deltas and terrain. Only its tilt read moves to the store.
- **D15. Remembered tilt moves to `camera.intent.tilt` (owner ruling); `CameraRuntime.tilt` goes.**
  - The step reads the stored tilt and threads it through the arm rows as it does today; the
    rows' `TiltMemory` parameters don't change.
  - At the end of the step it emits `tiltRemembered(next)` once, and only when the value differs
    (`hostId` or radians). That is the single write site.
  - `SceneSnapshot` carries `tilt` beside `fovYRad` (`captureScene`, `restoreSceneSaga`), so a
    takeover restores it.
  - Unlike `base`, there is no register/resting split. Tilt has no driver competing for it, so the
    store is its only home.
- **D16. `tuning` stays in the intent half.** It is config, but it is edge-written, its writes must
  wake the renderer, and it has a single reader set. A third half would cost a slice and a wake
  route and buy no reader anything.
- **D17. On main, the readout-row mechanism goes.** `FRAME_READOUT_ROWS`, `FrameReadoutRow` and
  `FrameReadoutCtx` have no rows left. After #1090, sky entry remains as a direct call (§9).
- **D18. Land after #1090.** Landing first would delete the mechanism #1090 adds a row to. If #1090
  stalls, land against main as written.

## 4. Store shape

Contract only, one type per file under `src/@types/`.

```ts
// src/@types/store/CameraSliceState.d.ts
export type CameraSliceState = {
  /** Where the camera rests and what it was asked to do. Changes on input and intent edges, never because a frame drew. */
  readonly intent: CameraIntentState; // today's CameraState, renamed, plus `tilt: TiltMemory`
  /** What the last frame DREW; only the engine writes it (`runFrame`, `destroy` with null). */
  readonly rendered: RenderedCameraState | null;
};

// src/@types/engine/RenderedCameraState.d.ts (header: the two-camera rule, see §7)
export type RenderedCameraState = {
  /** The register plus render-side tilt (`FrameOutputs.displayed`): the share-URL pose. */
  readonly displayed: FramedCameraPose;
  /** `displayed` folded to the world arm (`liveWorldPose`): terrain-floored, sagas' `from`. */
  readonly world: CameraPose;
  readonly simDays: number; // Julian days the frame was drawn at
  /** The drawn lens; a clip's driven lens differs from `intent.fovYRad`. */
  readonly fovYRad: number;
  readonly aspect: number; // the drawn projection's, from backing-store px
  readonly upBasisQuat: Vec4; // live up-basis B(t), (x, y, z, w)
  /** CSS px; the backing-store size silently breaks the scale bar on retina. */
  readonly viewportCssPx: Size;
  readonly pivotRangeMpc: number; // eye to the pivot's surface; terrain-dependent
  /** Eye to the focused body's centre; null unless the focus is placed in this frame's bodies. */
  readonly focusRangeMpc: number | null;
};
```

There are two slices under `src/state/camera/`:
- `cameraIntentSlice.ts` (`name: 'camera'`) is today's slice, renamed, with `tiltRemembered` added.
- `cameraRenderedSlice.ts` (`name: 'cameraRendered'`) holds one reducer, `drawn`, prepared with
  `prepareAutoBatched`.

These are the selectors in `src/state/camera/selectors.ts`. The private `selectCameraIntent` now
reads `.intent`, so every existing camera selector keeps its body.

```ts
export const selectRenderedCamera: (s: RootState) => RenderedCameraState | null; // sagas only
export const selectScale: (s: RootState) => ScaleInfo; // memoized; INITIAL_SCALE while null
export const selectFocusedBodyDistanceMpc: (s: RootState) => number | null; // read via useSampledSelector
export const selectRememberedTilt: (s: RootState) => TiltMemory;
```

One builder, `src/services/engine/frame/renderedCameraOf.ts`, assembles the record from the frame's
values. `runFrame` dispatches it where the readout loop runs today.

## 5. Readers that switch

| Readers                        | Files (under `src/`)                                                                                                                                                                                  | After                                                                     |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Waiters for a camera           | `state/arrival/arrivalSaga.ts`, `state/navigation/navigateSaga.ts` (4 calls), `state/selection/watchFocusTweenSaga.ts`                                                                                | `renderedCameraSaga`                                                      |
| Foci-and-camera pollers        | `state/camera/clipBodySaga.ts`, `state/camera/watchClipPathInspectSaga.ts`, `state/tour/visitBeatSaga.ts`                                                                                             | `renderedCameraSaga`, then `waitUntilSaga(foci)`                          |
| Skippers (D12)                 | `state/selection/watchGoHomeSaga.ts`, `state/camera/watchFlyToLonLatSaga.ts`, `state/camera/watchOrientationChangeSaga.ts`, `state/exhibits/exhibitBodySaga.ts`, `layers/missions/timeline/sagas/missionHoldSaga.ts` | `select`, skip on null                                                    |
| Share URL                      | `state/camera/watchLogCameraStateSaga.ts`                                                                                                                                                             | `select`                                                                  |
| Scale bar, phone bracket       | `components/containers/ScaleBarContainer.tsx`, `ScaleBracketContainer.tsx`                                                                                                                            | `selectScale` from the camera selectors                                   |
| Body card distance             | `layers/body/card/ui/BodyDetailCardContainer.tsx`                                                                                                                                                     | `useSampledSelector(selectFocusedBodyDistanceMpc, 250)`                   |
| Tilt holders                   | `CameraRuntime.d.ts`, `seedCameraRuntime.ts`, `stepCameraRuntime.ts`, `replayInput.ts`, `runFrame.ts`, `engine.ts` (debug), `captureScene.ts`, `restoreSceneSaga.ts`, `SceneSnapshot.d.ts`            | the store's `intent.tilt`                                                 |

`navigateSaga.ts:89` keeps its deliberate `base` read, because the record trails a commit by one
frame. At the read sites `from` becomes `world`. Most of the 22 src files that name `TiltMemory` thread it
as a parameter (the arm rows, the surface step) and don't change.

## 6. What gets deleted, and the LOC estimate

Deleted:
- `liveCameraRuntimeSaga.ts` and its `take('*')`.
- `SagaContext.cameraRuntime`, `LiveCameraRuntime` and the registration at `engine.ts:333-340`.
- The four files in `frame/readouts/`, plus `FrameReadoutRow.d.ts` and `FrameReadoutCtx.d.ts`.
- From the engine slice: `engineScaleChanged`, `engineBodyDistanceReported`, the `scale` and
  `focusedBodyDistanceMpc` fields, and their dedup tests (`engineSlice.test.ts:50-83`).
- `CameraRuntime.tilt` and `EMPTY_TILT_MEMORY`'s runtime seed. The constant becomes the intent
  initial value.
- Stale comments in `watchWakeSaga`, `watchHashWriteSaga`, `ScaleInfo`, `scaleBar.ts`,
  `RunFrameDeps` and `throttleByTime`. `throttleByTime` itself stays, because
  `throttleWithTrailingCall` uses it.

| Item                                                                                     | src       | tests    |
| ---------------------------------------------------------------------------------------- | --------- | -------- |
| Deletions above                                                                          | −185      | −35      |
| Rendered: type, slice, builder, selectors, wait saga                                     | +100      | +15      |
| P1 nest + rename (rootReducer, route type)                                               | +6        | +5       |
| Distance hook + constant                                                                 | +22       | +25      |
| Tilt into intent (action, field, one write site, snapshot field)                         | +15       | +40      |
| Writer ratchet + "a drawn write never wakes" test                                        | 0         | +30      |
| 23 saga test stubs → one shared rendered fixture                                         | 0         | ~0       |
| **Net**                                                                                  | **≈ −40** | **≈ +80** |

**Net about +40 lines**, plus about 270 lines edited mechanically by P1: 73 import paths, 44 src
read sites in 8 files, 135 test sites in 31 files, 1 site in `tools/site/shootSiteLoops.ts`,
and 16 `CameraState` type references.

## 7. Ground preparation

**P1, one prep commit: nest the camera route.** The missing joint is that the route has a single
reducer, so a second half could only arrive as a wake exception. P1 changes no behaviour:
1. `npm run move-files -- src/state/camera/cameraSlice.ts src/state/camera/cameraIntentSlice.ts`
   (it drags `tests/state/camera/cameraSlice.test.ts`).
2. `npm run move-files -- src/@types/camera/orbitCamera/CameraState.d.ts src/@types/camera/orbitCamera/CameraIntentState.d.ts`,
   then `npm run refactor -- rename` from `CameraState` to `CameraIntentState`, and from the
   default `cameraReducer` to `cameraIntentReducer`.
3. Mount it as `camera.intent` (`combineReducers` in `rootReducer`), then repoint the direct
   `.camera.X` reads to `.camera.intent.X`.
4. The step's local folds (`stepCameraRuntime.ts:114,184`, `replayInput.ts`) fold
   `cameraIntentReducer` over `.intent`.

The incumbent gets its marked name (`cameraIntentSlice` beside `cameraRenderedSlice`), per
plan-style rule 6.

Everything else is growth: the rendered slice under the new joint, the builder at the readout
loop's site, the default autoBatch enhancer, and the wake set, which needs no term (D3). The
deletions are the getter and the readout rows.

**Greenfield cross-check.** A fresh agent was given only the data requirements. It proposed a
top-level `renderedFrame` slice, which the owner's ruling now supersedes with `camera.rendered`.
It also proposed dropping `aspect`, which this spec rejects (the drawn aspect comes from
backing-store pixels and differs from the CSS ratio by rounding), and a separate `cleared`
action, which this spec rejects (a null payload is one action fewer). It agreed on the rest.

**Entanglement check (design time).**
- `intent.base` and `rendered.displayed` are essential: one is Intent and the other an
  observation, with different writers and cadences. They are documented once and guarded by the
  ratchet (§8).
- Tilt has a single home (D15), so it adds no third camera copy.
- The two derivations of the drawn world pose are accidental and predate this spec (§8). D7
  copies today's derivation, so this spec does not widen the split.
- The wake fix uses the predicate's existing key and adds no special case.

## 8. Risks

- **The two-camera trap.** A reader picks `intent.base` when it wants the screen, or the reverse.
  The rule: `intent` is where it rests and what it was asked, `rendered` is what is shown, only
  the engine writes `rendered`, and the engine never reads it back. It lives in the
  `CameraSliceState` and `RenderedCameraState` headers.
  `tests/conventions/renderedCameraWriter.test.ts` enforces it: `cameraDrawn` is imported only by
  `runFrame.ts` and `engine.ts`, and nothing under `src/services/engine/` reads `camera.rendered`
  or `selectRenderedCamera`.
- **The loop never sleeping.** If `cameraRendered/drawn` ever matched a wake route, the loop would
  never rest. A `watchWakeSaga` test pins that a drawn write requests no render.
- **Whole-route readers.** `state.camera` now changes every frame. Selectors read `.intent` or
  `.rendered`, never the route; P1's repoint removes the whole-route reads.
- **Camera goldens and tilt.** The sim harness uses a real store, so a tilt write round-trips.
  A golden diff means a missed write or a value-compare bug, not a tolerance to raise. Tag every
  tilt task `review: yes`.
- **Tilt drags write at input rate.** These writes are not batched and wake the renderer, which
  is already awake for the drag. This is the same cost class as the `input` slice.
- **The arrival waits one frame longer.** "A camera exists" moves from "`wireInput` ran" to "the
  first booted frame drew". `arrivalSaga` already awaits `nextFrame` before `arrived`, but a
  hidden tab now stalls at the runtime step.
- **Degenerate viewport.** At width 0 the scale bar shows `…` instead of holding the last label.
- **Batched notification in tests.** React tests that dispatch `cameraDrawn` must flush the rAF
  queue (RTK falls back to a timer outside a window).

Adjacent finding (backlog when this lands): the step's `world` folds against the placed selection,
while `liveWorldPose` (pick, demand, clip start, debug) re-folds without it, so the two can disagree
for a Layer-placed focus.

## 9. Once #1090 lands

- The view half of `skyReadoutRow` becomes `selectSkyView`, memoized over `camera.rendered.displayed`
  (the frame tag plus the azimuth rounded to `SKY_VIEW_STEP_RAD`, held by `skyViewChanged` as
  `resultEqualityCheck`). `skyViewReported`, `sky.view` and the store-read dedup go. The plan must
  confirm that the sky arm's `displayed` equals its register pose (#1090 reads the register).
- `belowHorizon` carries its spot, and its selector returns null unless that spot is the current
  view's. This replaces the clear on the `view → null` pulse.
- The entry half stays an engine readout, because it ray-marches live terrain and `arriveSaga`
  consumes it as events. With one row left, `FRAME_READOUT_ROWS` folds into a direct call. The
  BACKLOG line "`publishBodyDistanceGate` is module-level state" is deleted.

## 10. Open questions for the owner

1. **PR packaging.** Should P1 (nest and rename, about 270 mechanical line edits, no behaviour
   change) ship as its own PR first, or as the first commit of this PR?
2. **The camera clock stance (left for later).** `cameraIntentSlice` calls its descriptors
   wall-clock-free, while `TimeState.anchor.realMs` stores a wall-clock time. The clip start
   stamps (`epochs[*].startMs`) stay in the runtime until that's ruled.

## 11. Smoke list (DoD)

1. `#focus=body-earth`, wheel in and out: the scale bar tracks the zoom, and at rest the loop sleeps.
2. `#focus=body-mars`, fly in: the card's distance updates about four times a second.
   `#focus=m31` shows no distance row.
3. `#focus=satellite-25544`: the distance row is live for a Layer-placed body.
4. `#pose=k,earth,0.21859354349348772,0.9716130157244841,3.141592653589793,0.15&t=2026-09-05T20:30:00Z`,
   then focus M31: the tween leaves from the drawn pose without a jump.
5. `#focus=body-earth`, tilt-drag near the ground, start `#tour=grand` and exit it: the tilt comes
   back.
6. `#focus=m31`, switch orientation twice quickly: the roll composes, the pole doesn't snap.
7. Press `l`: the logged share URL reopens the same view.
8. `#exhibit=solar` and a cold load of `#focus=cluster-virgo-m87`: fly-ins start where the camera
   is, and the veil lifts.
9. Desktop exhibit switch (engine re-create): the next focus tween starts from the new engine's pose.

## 12. Out of scope

- The camera clock stamps (question 2).
- Turning skippers into waiters (ruled out).
- Moving `cameraDebug()` and `logCameraState`'s console dump into the store.
- Engine-internal off-frame readers of the drawn pose: they keep `liveWorldPose`.
- A ResizeObserver-written canvas size (D9).
- Splitting `tuning` into its own half (D16).
