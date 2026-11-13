# The drawn camera in the store: design spec

> **Status.** Draft, 2026-11-13. Owner: Alexander Rulkens. Approved for speccing as its own PR.
> **Written against** main at 73876bd46. #1090 (sky mode entry, open) touches the same readout
> rows; §9 says what changes once it lands.
> **Inputs.** The hidden-state audit (M1, M2, C1, C4, §3) and
> [`docs/backlog/2026-11-11-hidden-state-machines.md`](../../backlog/2026-11-11-hidden-state-machines.md) #5.

## 1. Why

The store's one camera pose, `camera.base`, is where the camera rests: it commits only on edges
(gesture end, at-rest zoom notch, clip end, fold crossings in `projectFramePose`) and lags the drawn
pose for the whole lift-off climb (~1.5 s), the Leave return flight (~2 s) and one frame at arrival
end. So whatever wants "what is on screen" reaches past the store into the engine:

- 10 saga files read `SagaContext.cameraRuntime()` (`src/store/types.ts:162`, registered at
  `src/services/engine/engine.ts:333`). One of them is `liveCameraRuntimeSaga`, which
  `navigateSaga` and `arrivalSaga` call; it loops on `take('*')` until the getter stops
  returning null.
- `scaleReadoutRow` and `bodyDistanceReadoutRow` dispatch per-frame readouts, the second behind
  `publishBodyDistanceGate`, a module-scope throttle that two engines on one page share.
- The `l` key's share URL comes back through `ReconcileEffects.logCameraState()`'s return value.

The drawn pose depends on streamed terrain (`flooredBodyPose` floors the eye on `terrainHeightAt`,
composed at `src/services/engine/phases/createLayers.ts:204`), so only `runFrame` can write it. This
spec has it write one record per frame and deletes what existed only because it didn't.

## 2. Decisions

- **D1. The record is `state.engine.renderedCamera`, written by `engine/cameraRendered`.** The
  `engine` route is outside `WAKE_ROUTES` (`src/store/effects/watchWakeSaga.ts:48`), so a per-frame
  write does not keep the render loop awake, and the wake predicate gets no new term. The engine
  slice already holds the two readouts this replaces. A literal `camera.rendered` would wake the
  loop on every frame.
- **D2. One action, payload `RenderedCamera | null`, built with `prepareAutoBatched`.** RTK 2's
  `configureStore` already installs `autoBatchEnhancer` (`'raf'`): subscribers hear it at most once
  per frame, the store config is untouched, and sagas (middleware) still see it at once.
- **D3. Only the engine writes it.** `runFrame` writes it on every booted frame; `destroy()` writes
  null. Null therefore means "no live engine has drawn a frame", which covers both pre-boot and
  post-destroy, the two cases a saga treats the same way: wait for the next frame.
- **D4. No dedup in the reducer.** A live clock moves `simDays` every frame, so it would rarely hit;
  selectors are the guard (D8).
- **D5. `world` is `liveWorldPose(state)`, computed in the frame.** This is the same function the
  getter calls today, so every saga gets the value it gets now. The step's own `world` (folded
  against the placed selection) stays the draw path's value; §8 lists the split.
- **D6. Body distance stays one value, measured in the frame, for every focus kind.** Roster
  bodies could be a selector, but Layer-placed foci (craft, satellites, asteroids) are placed only
  by `placeLiveSelection` over engine-held `selectionKindRows`. Splitting would give two homes to
  one fact. It rides the record as `focusRangeMpc`, so `bodyDistanceReadoutRow`, its action and
  the gate go.
- **D7. The canvas CSS size rides the record as `viewportCssPx`**, read once per frame. Today it's
  read twice (`runFrame.ts:73` and `:152`). A ResizeObserver slice would add a writer and a wake
  path and delete nothing, because the frame still has to draw at the live size.
- **D8. React reads only primitives or memoized values.** `selectScale` keeps its last result while
  label and width match (reselect `resultEqualityCheck`). The card reads the formatted distance
  string. Only sagas read the whole record; they don't render.
- **D9. One wait saga, `renderedCameraSaga`, replaces `liveCameraRuntimeSaga`.** It selects the
  record and `take`s `cameraRendered` while it is null. It replaces the `take('*')` loop,
  `watchFocusTweenSaga`'s `engineStatusChanged` loop, and the `cameraRuntime() !== null` term in
  three `waitUntilSaga` predicates.
- **D10. Sagas that skip when there is no camera keep skipping.** `watchGoHomeSaga`,
  `watchFlyToLonLatSaga`, `watchOrientationChangeSaga`, `missionHoldSaga` and `exhibitBodySaga`
  switch from `cameraRuntime() === null` to `select(...) === null`, and their behaviour doesn't
  change. Whether they should wait instead is open question 3.
- **D11. Contracts only shrink.** `SagaContext.cameraRuntime` and the `LiveCameraRuntime` type go.
  `ReconcileEffects.logCameraState` returns `void`, and `watchLogCameraStateSaga` builds the share
  URL from the record. The Layer contract, ReconcileEffects, SagaContext and CameraArmCtx gain
  nothing.
- **D12. The debug panel keeps `handle.debug.cameraDebug()`.** It reads gesture and tilt memory, the
  driver winner, orient deltas and terrain, none of which belong in the store.
- **D13. On main, the readout-row mechanism goes.** `FRAME_READOUT_ROWS`, `FrameReadoutRow` and
  `FrameReadoutCtx` have no rows left. After #1090 only sky entry remains, as a direct call (§9).
- **D14. Land after #1090.** Landing first deletes the mechanism #1090 adds a row to. If #1090
  stalls, land against main as written.

## 3. Store shape

Contract only. One type per file under `src/@types/`.

```ts
// src/@types/engine/RenderedCamera.d.ts
/**
 * RenderedCamera — what the last frame DREW, for readers outside the engine. Two camera
 * fields, two facts: `camera.base` is where the camera RESTS (Intent, committed on edges);
 * this is what is SHOWN (a readout, every frame). Only the engine writes it (`runFrame`,
 * and `destroy` with null); the engine never reads it back. It trails a commit by one
 * frame, so a saga that just committed uses the pose it committed.
 */
export type RenderedCamera = {
  /** The register plus render-side tilt (`FrameOutputs.displayed`): the share-URL pose. */
  readonly displayed: FramedCameraPose;
  /** `displayed` folded to the world arm (`liveWorldPose`): terrain-floored, sagas' `from`. */
  readonly world: CameraPose;
  /** Julian days the frame was drawn at (`FrameOutputs.simDays`). */
  readonly simDays: number;
  /** The drawn lens; a clip's driven lens differs from `camera.fovYRad`. */
  readonly fovYRad: number;
  readonly aspect: number;
  /** The live up-basis B(t) as a unit quaternion (x, y, z, w). */
  readonly upBasisQuat: Vec4;
  /** CSS px; the backing-store size silently breaks the scale bar on retina. */
  readonly viewportCssPx: Size;
  /** Eye to the pivot's surface (`pivotSurfaceRangeMpc`); terrain-dependent. */
  readonly pivotRangeMpc: number;
  /** Eye to the focused body's centre; null unless the focus is placed in this frame's bodies. */
  readonly focusRangeMpc: number | null;
};
```

```ts
// src/@types/store/CoreEngineSliceState.d.ts: `scale` and `focusedBodyDistanceMpc` go
readonly renderedCamera: RenderedCamera | null;

// src/state/engine/engineSlice.ts
cameraRendered: { reducer: (state, action: PayloadAction<RenderedCamera | null>) => void;
                  prepare: prepareAutoBatched<RenderedCamera | null>() }
```

Selectors, in `src/state/engine/selectors.ts` (that module's one-file override):

```ts
export const selectRenderedCamera: (s: RootState) => RenderedCamera | null; // sagas only
export const selectScale: (s: RootState) => ScaleInfo;          // memoized; INITIAL_SCALE while null
export const selectFocusedBodyDistanceLabel: (s: RootState) => string | null; // formatDistance
```

One builder, `src/services/engine/frame/renderedCameraOf.ts`, assembles the record from the frame's
values; `runFrame` dispatches it where the readout loop runs today.

## 4. Readers that switch

| Readers | Files (under `src/`) | Today | After |
| --- | --- | --- | --- |
| Waiters for a camera | `state/arrival/arrivalSaga.ts`, `state/navigation/navigateSaga.ts` (4 calls), `state/selection/watchFocusTweenSaga.ts` | `liveCameraRuntimeSaga`, or the getter plus an `engineStatusChanged` loop | `renderedCameraSaga` |
| Foci-and-camera pollers | `state/camera/clipBodySaga.ts`, `state/camera/watchClipPathInspectSaga.ts`, `state/tour/visitBeatSaga.ts` (2 reads) | `waitUntilSaga(foci && runtime)` | `renderedCameraSaga`, then `waitUntilSaga(foci)` |
| Skippers (D10) | `state/selection/watchGoHomeSaga.ts`, `state/camera/watchFlyToLonLatSaga.ts`, `state/camera/watchOrientationChangeSaga.ts`, `state/exhibits/exhibitBodySaga.ts`, `layers/missions/timeline/sagas/missionHoldSaga.ts` | getter, skip on null | `select`, skip on null |
| Share URL | `state/camera/watchLogCameraStateSaga.ts` | `logCameraState()` return | `select` |
| Scale bar, phone bracket | `components/containers/ScaleBarContainer.tsx`, `ScaleBracketContainer.tsx` | `selectScale` (stored) | `selectScale` (derived); no edit |
| Body card distance | `layers/body/card/ui/BodyDetailCardContainer.tsx` | `selectFocusedBodyDistanceMpc` | label selector; the card prop becomes `distanceLabel` |

`navigateSaga.ts:89` keeps its deliberate `base` read, because the record trails the commit (D3).
At the read sites `from` becomes `world`; the other field names stay.

## 5. What gets deleted

- `src/state/navigation/liveCameraRuntimeSaga.ts`, along with its `take('*')`.
- `SagaContext.cameraRuntime`, `LiveCameraRuntime` and their docs (`src/store/types.ts`), and the
  registration at `engine.ts:333-340`.
- `src/services/engine/frame/readouts/` (all four files), plus `FrameReadoutRow.d.ts` and
  `FrameReadoutCtx.d.ts`, and the readout block in `runFrame`.
- `engineScaleChanged`, `engineBodyDistanceReported` and their dedup reducers, `INITIAL_SCALE` as
  stored state (the selector keeps it as the null fallback), and the two slice fields.
- The `{ framed, simDays }` return of `ReconcileEffects.logCameraState`.
- Stale mentions: `watchWakeSaga`'s comment on the distance report, `watchHashWriteSaga`'s
  `writesOn` rationale, and the headers of `ScaleInfo`, `scaleBar.ts`, `RunFrameDeps` and
  `throttleByTime`. `throttleByTime` itself stays because `throttleWithTrailingCall` uses it.
- Tests: the four slice dedup tests (`tests/state/engine/engineSlice.test.ts:50-83`). The 23 saga
  test files that stub `cameraRuntime` in `setContext` seed the record instead, through one shared
  fixture in `tests/support/`.

**Estimated net LOC: about −120** (src about −110, tests about −10). Src loses about 185: the
readout files and types (−89), the SagaContext member, type and registration (−43), the slice
reducers and fields (−28), the wait loop (−21), the saga read sites (−16) and comments (−8). It
gains about 75: the type (+25), the builder (+30), the selectors (+12) and the reducer (+8). Tests
lose about 35 lines of dedup tests and gain the writer ratchet (+20, §7) and a wait-saga test (+15);
the fixture swap is about neutral.

## 6. Ground preparation

**None needed.** Every touchpoint is a field, a row or a deletion at a seam that already exists:

- **Growth:** the store home (a field in the slice that already holds engine readouts), the
  per-frame wake (the `engine` route is already outside the wake set, so no predicate term),
  batching (RTK 2's default store already has the enhancer), and the writer (one builder file at
  the readout loop's site).
- **Deletion:** the saga getter (each site becomes a `select`) and the readout rows (none remain
  on main).

**Greenfield cross-check.** A fresh agent was given only the data requirements. It agreed on
these points: a nullable whole-record replace, `prepareAutoBatched`, one wait helper, derived
display values returning primitives, an import ratchet for the writer, and keeping `world` beside
the arm pose (the fold needs terrain). It diverged on three points:

- **Its own top-level slice (`renderedFrame`).** This is cleaner for discoverability, but it costs
  a route constant, a slice file, rootReducer wiring, a selectors module and a state type, about
  +40 lines, and the readouts it replaces would move house. Neither shape is forced; it is a
  price. This spec takes the engine-slice field (open question 1).
- **Drop `aspect`, derive it from the CSS size.** Rejected. The drawn projection's aspect comes
  from backing-store pixels and differs from the CSS ratio by rounding, and the record states what
  was drawn.
- **A separate `cleared` action.** Rejected. A null payload is one action fewer, and null means
  the same thing to every reader.

**Entanglement check (design time).** The two camera poses, `base` and `renderedCamera`, are
essential: one is Intent and one an observation, with different writers and cadences, and so is
the one-frame trail after a commit. They are documented once (§3 header) and guarded by the ratchet
(§7). The two derivations of the drawn world pose are accidental and predate this spec (§8); D5
copies today's derivation so this PR doesn't widen the split. No other special case is taught.

## 7. Risks

- **The two-camera trap.** A reader picks `base` when it wants the screen, or the reverse. Rule:
  `base` is where it rests, `renderedCamera` is what is shown, only the engine writes
  `renderedCamera`, and the engine never reads it. It lives in the type header (§3) and on the
  `CoreEngineSliceState` field. `tests/conventions/renderedCameraWriter.test.ts` enforces it:
  `cameraRendered` is imported only by `runFrame.ts` and `engine.ts`, and nothing under
  `src/services/engine/` imports `selectRenderedCamera`.
- **The arrival waits one frame longer.** "A camera exists" moves from "`wireInput` ran" to "the
  first booted frame drew". `arrivalSaga` already awaits `nextFrame` before `arrived`, so no new
  dependency class appears, but a hidden tab now holds the arrival at the runtime step, not later.
- **Dev checks and DevTools.** One per-frame action replaces `engineScaleChanged`, so the count of
  dispatches the dev checks walk is unchanged and DevTools shows one action per frame, as today.
  No filter is added.
- **Degenerate viewport.** `computeScaleInfo` returns null at width 0. Today the last label holds;
  after this change the selector shows `…`. The bar is off-screen whenever the canvas is.
- **Batched notification in tests.** React tests that dispatch `cameraRendered` and assert on
  render must flush the rAF queue (RTK falls back to a timer outside a window).
- **The card's digits change per frame while moving.** Today they change at 4 Hz. See open
  question 2.

## 8. Open questions for the owner

1. **Where it lives:** an `engine.renderedCamera` field (recommended, about 40 lines smaller) or
   its own `renderedFrame` slice (the greenfield shape).
2. **Distance readability:** show the live per-frame text (recommended, the gate goes), or keep a
   4 Hz display cadence in the card container.
3. **Skippers** (D10): keep dropping commands that arrive before boot, or wait on
   `renderedCameraSaga` (one line each)? This is what's left of backlog HSM #5.
4. **Remembered tilt** (`CameraRuntime.tilt`): it is viewer intent like the lens, yet neither the
   store nor `SceneSnapshot` holds it, so a takeover can't restore it. Move it?
5. **Camera clock stamps** (`epochs[*].startMs`): `cameraSlice.ts:7` calls the descriptors
   wall-clock-free, while `TimeState.anchor.realMs` stores one. Which stance wins?

Adjacent finding (backlog when this lands): the step's `world` folds against the placed selection,
while `liveWorldPose` (pick, demand, clip start, debug) re-folds without it, so the two can disagree
for a Layer-placed focus.

## 9. Once #1090 lands

- The view half of `skyReadoutRow` becomes `selectSkyView`, memoized over `renderedCamera.displayed`
  (the frame tag plus the azimuth rounded to `SKY_VIEW_STEP_RAD`, held by `skyViewChanged` as
  `resultEqualityCheck`). `skyViewReported`, `sky.view` and the store-read dedup go. The plan must
  confirm that the sky arm's `displayed` equals its register pose (#1090 reads the register).
- `belowHorizon`'s lifetime hangs on the `view → null` pulse. Instead it carries its spot, and its
  selector returns null unless that spot is the current view's.
- The entry half stays an engine readout (it ray-marches live terrain; `arriveSaga` consumes it as
  events). With one row left, `FRAME_READOUT_ROWS` folds into a direct call and `FrameReadoutCtx`
  shrinks to the entry's inputs. The BACKLOG line "`publishBodyDistanceGate` is module-level
  state" is deleted.

## 10. Smoke list (DoD)

1. `#focus=body-earth`, wheel in and out: the scale bar tracks the zoom; at rest the loop sleeps.
2. `#focus=body-mars`, fly in: the card's distance runs live. `#focus=m31` shows no distance row.
3. `#focus=satellite-25544`: the distance row is live for a Layer-placed body.
4. `#pose=k,earth,0.21859354349348772,0.9716130157244841,3.141592653589793,0.15&t=2026-09-05T20:30:00Z`,
   then focus M31: the tween leaves from the drawn pose without a jump.
5. `#focus=m31`, switch orientation twice quickly: the roll composes, the pole doesn't snap.
6. Press `l`: the logged share URL reopens the same view.
7. `#tour=grand` (first three beats) and `#exhibit=solar`: fly-ins start where the camera is.
8. A cold load of `#focus=cluster-virgo-m87` arrives and the veil lifts.
9. Desktop exhibit switch (engine re-create): the next focus tween starts from the new engine's pose.

## 11. Out of scope

Remembered tilt and the camera clock stamps (questions 4, 5); skippers turned waiters (question 3);
`cameraDebug()` and `logCameraState`'s console dump; engine-internal off-frame readers of the drawn
pose (they keep `liveWorldPose`); a ResizeObserver-written canvas size (D7).
