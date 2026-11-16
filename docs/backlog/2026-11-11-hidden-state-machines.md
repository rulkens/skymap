# Hidden state machines (flags and saga-held phases)

**Readiness:** per finding. The 7 converts are `ready` for design; the 10 maybes are `needs-design`.

**Why.** Target convention: phases as `kind` unions in state, logic as pure `step`/`reconcile` functions, sagas as thin glue. A phase kept in saga locals or in flag combinations cannot be inspected by the dash, tests or the recorder, and it invites lost-update and wait-forever bugs. Precedents: `LoadState`/`reduceLoadState` and `watchSelectionRowsSaga`.

Audit read-only at main f9a85995c. Paths are relative to `src/` unless they start with `tests/`. Reader counts are file counts from `grep -rlE` over `src` and `tests`, not call sites.

> **In flight.** Finding 1 (selection id resolution, `resolveFocusId` pending/absent/hit) and the `watchTierSaga` reference row are being addressed by the J8 work (tier-swap galaxy re-anchor, branch `worktree-tier-swap-galaxy-reanchor`). Treat both as in flight, not open; re-check after it merges before starting either.

## 1. Ranked summary

| # | Where | Kind | Implicit states | Harm evidence | Verdict | Cost (src / test files) |
|---|---|---|---|---|---|---|
| 1 | Selection id resolution (**in flight, J8**): `SelectionResolver.resolveFocusId` returning `null` (`@types/engine/selection/SelectionResolver.d.ts:12`), `state/selection/resolveFocusRefDeferringSaga.ts:16`, `state/navigation/navigateSaga.ts:68`, `layers/galaxyCatalog/selection/present/galaxyRecordBridge.ts:30` | saga + flags (null encodes two states) | `pending` vs `absent` vs `resolved` per request id | `frameFocusSaga` guesses "absent" from engine idle plus `delay(0)`; the deferring loop never ends for a bad id | **convert** | 12 / 16 (`resolveFocusId`), 5 / 2 (`selectPendingFocusId`) |
| 2 | Takeover lifecycle: `state/takeover/watchTakeoverSaga.ts:26`, `state/takeover/takeoverSlice.ts` | saga | `idle`, `starting` (request queued, predecessor cancelling), `running`, `ending` (restore in flight) | Recorder `seenActive` latch (`state/recorder/installRecorderHook.ts:71-110`); two `all([take(takeoverEnded), put(exitTakeover())])` handshakes; `settled` Promise outside the store | **convert** | 11 / 4 (`selectTakeoverSource`), 8 / 5 (`takeoverEnded`); `exitTakeover` (25 / 12) stays a signal |
| 3 | Tour beat: `state/tour/tourBodySaga.ts:71`, `visitBeatSaga.ts:76`, `pausableDwellSaga.ts:73`, `tourSlice.ts` | saga + flags | `waitingFoci`, `flying`, `settling`, `dwelling(running)`, `dwelling(paused)`, then outcome | `tourSlice` header: pause routed through the saga so `paused` never drifts from the saga's state; `remainingMs` only in the saga | **convert** | 4 (sagas, slice) + 9 (`dwellNonce` readers) / 7 |
| 4 | `PlannerResult` votes: `@types/engine/frame/PlannerResult.d.ts:12` | flags | Only `idle`, `awake`, `loading`, `settling` are meaningful (a total order); 4 of 8 boolean combinations are illegal | `e42e2a00a` "Surface tiles in flight no longer re-bake the sky cubemap every frame"; the fold enforces `settling => loading => awake` by convention | **convert** | 12 / 17 |
| 5 | Engine runtime phase: covered by the camera-rendered spec (2026-11-13) | saga | n/a | see section 5 | **covered** | n/a |
| 6 | `ArrivalState`: `@types/state/arrival/ArrivalState.d.ts:6`, `state/arrival/arrivalSaga.ts:27` | flags (type) + saga | `{status, reason?}`: `reason` only legal with `failed`; saga phases `navigating` and `fallback-home` invisible | `whenStablyReady` rebuilds "settled" from three facts | **convert** (type), maybe (saga) | 5 / 3 |
| 7 | `createSatellitePropagator`: `layers/satellites/sweep/subsystems/createSatellitePropagator.ts:13` | closure flags | `worker`, `ready`, `inFlight`, `abortStart`, `catalog`, `latest` encode `idle`, `starting`, `ready`, `sweeping` | Comment on `abortStart`: "every later commit queues behind it forever" | **convert** | 2 / 1 |
| 8 | `TimeState`: `@types/time/TimeState.d.ts` | flags | `mode`, `paused`, `profile` give `live-run`, `live-paused`, `manual-run`, `manual-paused`, `profile` | `state/time/timeSlice.ts:159-165` matcher "so a new reducer cannot forget to"; `exitsLive` hand-built clock in `withSceneSnapshotSaga.ts:20`; 3-way restore in `clipBodySaga` | **maybe** | 32 / 15 |
| 9 | Camera `clip` / `tween` / `frameTween` / `aim` nullables: `state/camera/cameraIntentSlice.ts:79-90` | nullable flags | `clip != null && tween != null` is dangerous, not impossible | `state/selection/suspendDuringClip.ts:38`; `clipEnded` clears `tween` too | **maybe** | 16 / 9 (clip), 6 / 2 (tween) |
| 10 | `watchFocusTweenSaga`: `state/selection/watchFocusTweenSaga.ts:36` | saga (takeLatest, multi-wait) | `no-runtime`, `waiting-bulk`, `resolved`, `tweening` | `5cb9eac98` "a #pose= link is the boot pose; focus tween stands down" | **maybe** | 1 / 2 |
| 11 | Hash navigation: `state/url/watchHashReadSaga.ts:88`, `state/url/watchHashWriteSaga.ts:101` | saga + closure flag | `applying` vs `settled`; `replaceNext` latch | Long headers on history damage; `b9a5b1be8`; `tests/state/url/hashHistoryIntegrity` | **maybe** | 4 / 3 |
| 12 | Remote pairing: `state/remote/remoteSlice.ts:9`, `state/remote/remoteReceiverSaga.ts:57` | saga Maps + flags | Per remote `unknown`, `attached`, `silent`, `closed` live in three Maps; store keeps one `phase` | `phase` stays `paired` after the last remote goes silent (unverified whether intended) | **maybe** | 3 / 0 |
| 13 | Engine lifecycle: `@types/engine/state/EngineState.d.ts:56-60`, `services/engine/engine.ts:399` | flags | `booted=false` means "not yet" and "destroyed"; "settled" defined twice | `isSceneSettled` vs `whenStablyReady` | **maybe** | 7 / 8 (`booted`), 5 / 5 (`sceneSettled`) |
| 14 | `createClipPlayer`: `services/engine/subsystems/clipPlayer.ts:41` | closure flags | `idle`, `playing`, `held-final-frame` (`pendingEnd`), plus `endResolver` | Comment on two-frame deferred completion | **maybe** | 1 / 2 |
| 15 | Follow approach: `@types/engine/camera/FollowMemory.d.ts`, `services/engine/camera/stepCameraRuntime.ts:222` | nullable fields + flag | `none`, `approaching(from, durationMs, distanceTarget)`, `saturated` | Comment: "the two are one fact and cannot disagree on phase" | **maybe** | 9 / 6 |
| 16 | `missionHoldSaga`: `layers/missions/timeline/sagas/missionHoldSaga.ts:44` | saga (race loop) | `entering`, `flying-in`, `holding`, `playing`; locals `task`, `fly`, `speed`, `mission` | `missionPlaySaga` re-checks `time.profile === profile` because `task` shadows store facts | **maybe** | 2 / not counted |
| 17 | Foci wait polling: `state/tour/waitUntilSaga.ts:33`, used at `visitBeatSaga.ts:92`, `state/camera/clipBodySaga.ts:45`, `state/camera/watchClipPathInspectSaga.ts:73` | saga (poll) | `waiting-for-foci`, `ready` | No timeout on any foci wait; the recorder latch exists because of this window | **maybe** | 7 / 3 |
| ref | `state/tier/watchTierSaga.ts:38` (**in flight, J8**) | saga (reference) | `captured`, `written`, `awaiting count pulse i` | Redesign underway | reference, not counted | n/a |

Counts: 7 convert, 10 maybe, 15 leave (section 3), 1 reference.

## 2. Convert and maybe sections

### 1. Selection id resolution (convert, in flight with J8)
`resolveFocusId` returns `SelectionRefBase | null`. `null` means both "the catalog has not landed yet" and "no such id".

- `galaxyRecordBridge.answer` (`galaxyRecordBridge.ts:30`) already keeps a private `PENDING` symbol, then flattens it to `null` at the boundary.
- `resolveFocusRefDeferringSaga.ts:16` loops `take([engineSourceCountReported, engineStatusChanged])` until non-null. For an id that never resolves it never returns. Only takeLatest supersession and the `selectPendingFocusId` check after it make that survivable.
- `navigateSaga.frameFocusSaga` (`navigateSaga.ts:68`) has to guess "absent": it races `setSelectionRow` against `engineLoadProgressChanged(null)`, then `delay(0)`, then checks `status.kind==='ready'` and `loadProgress===null`. Its comment says a count report trails the idle report by an async hop.
- `watchSelectionRowsSaga` repeats the same three pulses as its gap-fill, a second copy of "what can make an id resolvable".

Missing store fact: the per-request outcome. `selection.pending` holds the id (`selectionSlice.ts`) but not whether it can still resolve.

Sketch:
```ts
type Resolution = { kind: 'pending' } | { kind: 'absent' } | { kind: 'hit'; ref: SelectionRefBase };
// resolver: resolveFocusId(id): Resolution   (bridge PENDING maps to 'pending')
type PendingRequest = { id: string; transition: Transition; status: 'waiting' | 'unresolvable' };
reconcilePending(pending: PendingRequest | null, resolution: Resolution): Action[]
// level-triggered: hit -> updateSelectionFocus; absent while loads are quiet -> mark unresolvable
```
`watchSelectionRowsSaga`'s gap-fill is the natural home; `watchRequestFocusSaga` and `watchRequestSelectSaga` become thin. Cost: `resolveFocusId` in 12 src files (4 are `clipFociReady`/`resolveClipFoci` boolean checks that stay trivial) and 16 test files; `selectPendingFocusId` in 5 src and 2 test files. `SagaContext` is not touched, so the layer-contract consent rule does not trigger.

### 2. Takeover lifecycle (convert)
`takeover.active` is `TakeoverSource | null` (`takeoverSlice.ts`). The real phases live in the watcher: `running: Task`, a `settled` Promise, and the cancel then restore then start sequence (`watchTakeoverSaga.ts:26-80`).

- Between `startClip` and `takeoverStarted` the store says `idle`, including while the predecessor's restore runs and while `clipBodySaga` waits for foci.
- `installRecorderHook.ts:71-110` works around that with a `seenActive` latch (two copies) plus `clipInFlight`. Its header says a plain "inactive" read would resolve instantly and film zero frames.
- `navigateSaga.ts:134` and `watchHashReadSaga.ts:99` both do `all([take(takeoverEnded), put(exitTakeover())])`, an edge handshake that hangs if `takeoverEnded` fires before the `take` registers. The `all` ordering covers it today.
- `watchSelectionRevealSaga` reads `selectTakeoverSource !== null` for its exemption; during `ending` the answer is whatever the restore has reached.

Sketch:
```ts
type TakeoverPhase =
  | { kind: 'idle' }
  | { kind: 'running'; source: TakeoverSource }
  | { kind: 'ending'; source: TakeoverSource; next: TakeoverSource | null };
stepTakeover(s: TakeoverPhase, e: StartRequested | BodyFinished | RestoreDone | ExitRequested): TakeoverPhase
reconcileTakeover(s: TakeoverPhase): Action[]   // ending + restore done -> start next, or go idle
```
Body sagas (`tourBodySaga`, `exhibitBodySaga`, `clipBodySaga`) stay as effect bodies; the scene snapshot stays a closure value. Cost: slice, 11 selector readers, watcher, `runTakeoverSaga`, 2 handshake sites, the recorder hook. `exitTakeover` stays a signal (25 files unchanged).

### 3. Tour beat (convert)
Per-beat phase exists only as generator position across `tourBodySaga` -> `visitBeatSaga` -> `pausableDwellSaga`:

- `waitingFoci` is a 100 ms poll (`waitUntilSaga`).
- `flying` is a race of the clip against `advanceTour` and `prevBeat`.
- `settling` is a race of a settled poll, a timeout, `advanceTour` and `prevBeat`.
- `dwelling` is a loop where `paused`, `remainingMs` and `sliceStartedAt` are saga locals (`pausableDwellSaga.ts:82`).
- The store sees `{beatIndex, paused, dwellNonce, dwellSec}`. `paused` mirrors the saga local via `setPaused`; the `tourSlice` header names the drift risk as the reason pause goes through the saga. `dwellNonce` is a counter used as an edge signal for the UI ring.
- The slice accepts `setPaused(true)` in any phase; only the saga prevents it while flying. `tourEnded` is guarded by `cancelled()` (`tourBodySaga.ts`) to avoid flashing beat 0 between two tours.

Sketch:
```ts
type BeatPhase =
  | { kind: 'waitingFoci'; beat: number }
  | { kind: 'flying'; beat: number }
  | { kind: 'settling'; beat: number }
  | { kind: 'dwelling'; beat: number; sec: number; remainingMs: number; since: number | null }; // since null = paused
stepBeat(s: BeatPhase, e: FociReady | Landed | Settled | Toggle | Next | Prev | Tick): { state: BeatPhase; outcome?: 'next' | 'prev' }
```
The saga becomes glue: start the clip, forward events, apply `outcome`. The recorder ordering rule ("the fold-settle delay must stay the first virtual-time consumer", `tourBodySaga.ts` ~line 140) still applies, so keep `FOLD_SETTLE_MS` as an effect, not state. `computeSceneEntering` is already pure and stays. Cost: `tourSlice`, three sagas, plus 9 src files that read `dwellNonce`; 7 test files.

### 4. PlannerResult votes (convert)
`awake`, `settling`, `loading` are three booleans with the convention `settling => loading => awake` (`PlannerResult.d.ts`). The fold in `services/engine/frame/createFramePlannerResultStore.ts:20-22` ORs and re-implies. `e42e2a00a` is a real bug from the pair: a surface tile in flight was voted `settling` and re-baked six sky faces every frame.

Sketch:
```ts
type PlannerActivity = 'idle' | 'awake' | 'loading' | 'settling';   // total order, fold = max
type PlannerResult<T> = { value: T; activity: PlannerActivity };
```
`EngineState.layersLoading` becomes `activity >= 'loading'`; the cubemap scheduler reads `=== 'settling'`. Cost: 12 src files declare `settling:`; 17 test files. Mechanical. This is the one case where the flags form a lattice rather than a phase, so a string union beats a `kind` object.

### 5. Engine runtime phase (covered)
Covered by [`specs/2026-11-13-camera-rendered-design.md`](../superpowers/specs/2026-11-13-camera-rendered-design.md):
`camera.rendered` (null = no live engine frame, pre-boot or post-destroy) replaces
`SagaContext.cameraRuntime()`, the `take('*')` loop, the `engineStatusChanged` loop in
`watchFocusTweenSaga` and the `cameraRuntime() !== null` polls. The owner ruled (2026-11-13) that
the five sagas that skip without a camera keep skipping. Delete this section when the spec lands.

### 6. ArrivalState (convert type, maybe for saga)
`ArrivalState = {status: 'pending'|'arrived'|'failed'; reason?}`. `reason` is only legal on `failed`, and the header says `engine-error` means "no view at all".

Sketch:
```ts
type ArrivalState =
  | { kind: 'pending' } | { kind: 'arrived' }
  | { kind: 'failed'; reason: 'unknown-id' | 'timeout' | 'engine-error' };
```
The saga (`arrivalSaga.ts:27`) has paused points the store cannot see: waiting for the runtime, navigating under a `race` with `ARRIVAL_TIMEOUT_MS`, falling back home, waiting a frame. A `navigating` kind is optional. `whenStablyReady` then reads one fact instead of three. Cost: 5 src readers of `selectArrival`/`ArrivalState`, 3 test files.

### 7. Satellite propagator (convert)
`createSatellitePropagator.ts:18-24`: six closure variables encode `idle`, `starting` (worker built, `abortStart` set), `ready`, `sweeping` (`inFlight`). `stop()` resets all six by hand. `ready && !worker` and `inFlight && !ready` are impossible but unguarded.

Sketch:
```ts
type Propagator =
  | { kind: 'idle' }
  | { kind: 'starting'; worker: Worker; catalog: SatelliteCatalog; abort: (e: Error) => void }
  | { kind: 'ready'; worker: Worker; catalog: SatelliteCatalog; latest: SatelliteSweep | null; inFlight: boolean };
stepPropagator(s: Propagator, e: Start | WorkerReady | Reply | Request | Stop | WorkerError): Propagator
```
Cost: one src file plus its test. Small and local.

### 8. TimeState (maybe)
`mode`, `paused`, `profile`: five real states. `profile != null` makes `paused` and `mode` mostly irrelevant, and `timeSlice.ts:159-165` holds an `addMatcher` that nulls the profile on every time action "so a new reducer cannot forget to". Readers re-derive the state: `state/time/selectors.ts:43,48` (`manual && !paused`, `live && !paused`), the 3-way restore in `clipBodySaga`, and `withSceneSnapshotSaga.ts:20` hand-building `{mode:'live', paused:false, rateIndex:0, direction:1}`.
Sketch: `type Clock = { kind: 'live'; paused: boolean } | { kind: 'manual'; paused: boolean } | { kind: 'profile'; profile: ClockProfile }`, with rate and direction beside it.
Only maybe: 32 src files mention `TimeState`, 15 test files, and `anchor` re-anchoring is subtle. The guard works and is tested. A `selectClockPhase` selector would capture most of the readability gain at near zero cost.

### 9. Camera clip/tween nullables (maybe)
The driver table (`pickWinner`) is a legitimate level-triggered precedence resolver, so most combinations are intended (clip@95 over tween@60). The dangerous one is a tween planted during a clip: `suspendDuringClip.ts:38` guards `watchFocusTweenSaga` and `watchSelectionRevealSaga` per dispatch, and `clipEnded` (`cameraIntentSlice.ts:85`) clears `tween` too. Both exist only for that combination.
Sketch: ignore `startCameraTween` in the reducer while `clip !== null`, which deletes the saga HOF. That is a small diff, not a union. Cost: the 4 `suspendDuringClip` src files plus `cameraIntentSlice`.

### 10. watchFocusTweenSaga (maybe)
`takeLatest(updateSelectionFocus)` with two inner waits: `while cameraRuntime()===null take(engineStatusChanged)` and, for structure refs, `while row===null && bulk==='loading' take(factsReported)`. "Focus requested, tween owed" is generator position only. `5cb9eac98` fixed a boot-pose race where the tween fired over a `#pose=` link. A level-triggered form needs `pendingFocusFly` in the store (set by a `fly` focus, cleared by tween start or `cut`) plus findings 1 and 5; redundant before them.

### 11. Hash navigation phases (maybe)
Read half: `applyNavigation` (`watchHashReadSaga.ts:88`) puts `hashNavigationStarted`, awaits takeover exit, runs `navigateSaga`, then puts each absent row's defaults. Write half waits for quiet with `debounce(0)` and a closure `replaceNext` latch (`watchHashWriteSaga.ts:106-120`). The invariant "do not push while a navigation is half applied" rests on `delay(0)` being a macrotask longer than the saga hops (the header says so). History damage is user-visible (dead Forward button), and `tests/state/url/hashHistoryIntegrity` guards it.
Sketch: `navigation: {kind:'idle'} | {kind:'applying'; mode:'replace'|'push'}`, with the write half a reconcile `(state) => hashBody | null` that returns nothing while `applying`. Only maybe: it is documented, tested and works, and the real gap (no settle signal for the saga hops) is bigger than this feature.

### 12. Remote pairing (maybe)
`RemoteState {phase, code, pairingUrl}` (`@types/remote/RemoteState.d.ts:4`): `code` and `pairingUrl` only matter in `waiting` and `paired`. The per-remote lifecycle (`sources`, `watchdogs`, `lastResize`, `known = watchdogs.has(from)` at `remoteReceiverSaga.ts:139`) is Map membership. After `REMOTE_SILENCE_MS` the source closes but `phase` stays `paired`; flag for the owner to rule on.
Sketch: `RemoteState = {kind:'off'} | {kind:'waiting'; code; pairingUrl} | {kind:'paired'; code; remotes: readonly RemoteId[]}`. Cost: 3 src files, no tests mention these actions.

### 13. Engine lifecycle and settled (maybe)
`booted` (`EngineState.d.ts:56`) is false before `wireInput` and again after `destroy()`; fixed by finding 5. `fadesAnimating` and `layersLoading` are independent last-frame facts, orthogonal and fine as booleans. "Settled" exists twice: `isSceneSettled` (engine thunk polled at 100 ms through `sceneSettled`) and `whenStablyReady` (store facts plus a 1 s debounce). Sketch: after finding 5, derive one `selectSceneSettled` and have both read it. Cost: 7 src / 8 test for `booted`, 5 / 5 for `sceneSettled`.

### 14. clipPlayer completion (maybe)
`pendingEnd`, `prevElapsedSec`, `endResolver`, `compileCache` (`clipPlayer.ts:50-60`): `idle`, `playing`, `held-final-frame`. The two-frame deferral comment is accurate. `resetState()` and `fireEndResolver()` are hand-paired.
Sketch: `type PlayerPhase = {kind:'idle'} | {kind:'playing'; prevElapsedSec: number} | {kind:'ending'; resolve: () => void}`. One src file, two tests. Low harm today; do it when the file is next touched.

### 15. Follow approach (maybe)
`FollowMemory` has `from`, `distanceTarget`, `durationMs` null together plus `saturated`. `stepCameraRuntime.ts:222` derives `DriverActivity.approachDone` from it, with a comment that the two "are one fact". A union `none | approaching{...} | saturated{...}` removes the null checks in `cameraDrivers.ts:168-193`. 9 src, 6 test. The camera goldens make it risky for a modest gain.

### 16. missionHoldSaga (maybe)
A 7-way `race` loop with `task`, `fly`, `speed`, `mission` locals. `task !== null` shadows `time.profile !== null && !paused`; `missionPlaySaga.ts:42` re-reads `s.time.profile === profile` to guard that shadow. The loop already re-reads `paused` from the store each pass, so it is half level-triggered. Moving `speed` and `mission` into store state and making play a reconcile of `(timeState, mission)` would delete the fork/cancel bookkeeping. Do it after finding 8. Cost: 2 src files.

### 17. Foci-wait polling (maybe)
`waitUntilSaga(() => clipFociReady(...) && cameraRuntime() !== null)` is called from `visitBeatSaga`, `clipBodySaga` and `watchClipPathInspectSaga`. It polls every 100 ms with no timeout in any of them. A clip with an id that never resolves holds the takeover until `exitTakeover`. Once finding 1 exists, `absent` is a fact and the clip can fail fast. Cost: 7 src, 3 test.

### Reference: watchTierSaga (in flight, J8)
`state/tier/watchTierSaga.ts:38`. Captures ids, clears hover, writes the tier, then loops `take(engineSourceCountReported && source===...)`. Edge-triggered: a pulse that fires before the first `take` registers would hang the loop. The missing fact is per-source "committed at tier"; the demand loop already tracks the last request per slot. Findings 1 and 5 share its root cause.

## 3. Leave verdicts

- `UiState`: independent toggles; every combination is meaningful.
- `Modifiers`, `ClipPathTuningActive`: per-knob override gates, deliberately orthogonal to the values.
- `ExhibitTimelineClock.atSlowest/atFastest`: derived edge predicates of one index.
- `DriverActivity`: orthogonal per-frame facts fed to the pure `pickWinner` (`approachDone` is finding 15).
- `EngineState.fadesAnimating` and `layersLoading`: independent last-frame facts.
- `SourceEntryBase` flags: static registry capabilities, not runtime phases.
- `AssetSlot` and `reduceLoadState`: the precedent; the remaining race checks are tested.
- `watchSelectionRowsSaga` and the `selectionSlice` `pending` slot: the precedent.
- `inputSourceSaga`: the recogniser is already a pure `recognize(state, event)`.
- `renderScheduler`: illegal combinations guarded in two lines and unit-tested.
- `createReseedLatch`, `pickProgram`, `starCatalogPlanner` throttle flags: single-purpose latches.
- `exhibitBodySaga`, `clipBodySaga`, `withSceneSnapshotSaga`, `restoreSceneSaga`: linear scripts with a `finally` restore; their phase belongs to finding 2.
- `watchGoHomeSaga`, `watchFlyToLonLatSaga`, `watchReplayInspectedPathSaga`, `watchOrientationChangeSaga`: single-shot handlers; their one wart is finding 5's null skip.
- `watchGestureLearnedSaga`, `useSheetDrag`, `useSplash`, `useRemoteLink`: small, local, no impossible combinations.
- `sagaContextRegistered` pulse: ordered by construction and tested; finding 5's store fact could replace it.

## 4. Cross-cutting observations

- Three missing store facts explain most saga findings: engine runtime phase (5), selection-request outcome (1) and takeover phase (2). Each is currently a pulse (`engineStatusChanged`, `engineSourceCountReported`, `factsReported`, `take('*')`) or a poll (`waitUntilSaga`, `sceneSettled`). A fact fixes the lost-update and wait-forever risks together.
- `engineStatusChanged` is a catch-all wake: `resolveFocusRefDeferringSaga`, `watchSelectionRowsSaga` and `watchFocusTweenSaga` wait on it because `wireSlots` fires `loading` once Layer rows exist. That is "Layer rows installed" smuggled through a status pulse.
- "Settled" is defined three times: `isSceneSettled`, `whenStablyReady`, and arrival's `nextFrame` wait. Pick one store-derived selector and make the others read it.
- State held in saga closures (tour `remainingMs`, takeover `running` Task, `replaceNext`, mission `task`) cannot be inspected by the dash, tests or the recorder. Prefer values in the store with the saga as the effect runner.
- The cheapest conversions (4, 6, 7) are local type changes with no saga redesign. The camera driver table and `watchSelectionRowsSaga` are the best existing reconcilers; the demand loop was not audited in depth.
