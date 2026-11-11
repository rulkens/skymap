# Clip studio S4 (seek and transport): implementation plan

> **For agentic workers:** execute with `subagent-driven-development` under
> [`sdd-execution.md`](../conventions/sdd-execution.md): the dispatches below group consecutive tasks by cognitive
> locality; one commit per task; one whole-branch review at the end; CI is the gate. Ask the two pre-flight
> questions (parallelism, perf gate) before P1; this plan expects the perf gate to run (DoD).

**Goal:** the studio's 3D view shows the clip at the playhead, camera and scene, at frame rate; Play, Pause and Loop
exist; the view past End shows where the clip leaves the viewer; "Use current view" fills camera steps from the drawn
camera, with a free look to fly there first.

**Spec:** [`2026-11-10-clip-studio-s4-seek-transport.md`](../specs/2026-11-10-clip-studio-s4-seek-transport.md) (the
reviewer's document; tasks below carry what implementers need). **Decisions:** the grill session
([`clip-studio-2026-11-07.md`](../../grill-sessions/clip-studio-2026-11-07.md)) and the spec's §11, which this plan
assumes answered as recommended until ruled (free look on drag, reverted scene past End, pause at End, a press
pauses playback for the gesture, destination frame when paused mid-roll, `LiveCameraRuntime.clipAt`, bound steps
replaced by their Fixed form, Space/L/F, loop span read at press, the `--scrub` perf flag, seeding into the registry).

**Starts after** S3 lands (`sceneView`, `clipFactorAt`, `ClipPlayer.view`, `atEnd`, `readRoot`) and S2's P3/P4
(`StudioSelection`, revision-keyed resolution). Run the pre-flight conflict scan against `studioSlice.ts`,
`TimelinePane.tsx`, `Ruler.tsx`, `TopBar.tsx`, `studioKeys.ts`, `runStudioKey.ts` and `clipPlayer.ts`.
If S3 did not adopt "wraps seed" (spec §9.1), Task 1.3 routes wraps through the seed and says so in its commit.

**Landmines to keep in view:** values, not shared mutable state (#1071 was reverted for scheduling next-frame work
through state flags: the player reports `held`, it never writes the transport); sagas have no settle signal; an
action a reducer does not handle drops silently; the loop renders on demand (a seek must be a `camera/` write).

---

## Dispatches

| # | Tasks | Model | Why together |
| --- | --- | --- | --- |
| D1 | P1, P2 (ground preparation) | Sonnet | two behaviour-neutral seams, each its own commit, first |
| D2 | 1.1–1.5 (engine: transport, seed, player, readback, perf) | Opus | one mental model: the clip clock and its publication |
| D3 | 2.1–2.3 (studio state, preview saga, Use current view) | Opus | the studio's intent and the sagas that command the engine |
| D4 | 3.1–3.4 (top bar, keys, ruler, inspector button) | Sonnet | UI surfaces over D3's actions |
| D5 | 4.1 (controller) | — | docs, perf gate, live check, shots |

Controller, after D1: take the perf baseline on that HEAD: `npm run perf -- --url http://localhost:<port>` and
`npm run perf:cpu -- --url http://localhost:<port>`, all scenarios, this worktree's own server. Record both in the
ledger.

---

## File structure

**Created**

```
src/@types/animation/ClipTransport.d.ts, ClipSpan.d.ts, TargetChange.d.ts        1.1, 1.2
src/utils/animation/rampAt.ts                                                      1.2
src/utils/camera/clipOwnsCamera.ts                                                 P2
packages/studio/src/session/sagas/previewSaga.ts                                   2.2
packages/studio/src/session/sagas/useViewSaga.ts                                   2.3
packages/studio/src/@types/kinds/CapturedView.d.ts                                 2.3
packages/studio/src/kinds/utils/fromView/{setFromView,setVecFromView,fixedFormOf}.ts   2.3
packages/studio/src/session/utils/{playFrom,loopSpanOf}.ts                         2.1
packages/studio/src/shell/components/TransportControls/                            3.1
```

**Modified**

```
packages/studio/src/timeline/components/{TimelinePane,Ruler,Playhead,ZoomControls}/   P1, 3.3
src/services/engine/camera/drivers/cameraDrivers.ts, camera/input/replayInput.ts       P2
src/@types/camera/orbitCamera/CameraState.d.ts, src/state/camera/cameraSlice.ts,
  src/services/engine/animation/playClip.ts, src/store/types.ts                        1.1, 1.4
src/services/engine/subsystems/clipPlayer.ts, src/@types/engine/subsystems/ClipPlayer.d.ts   1.3
src/state/camera/selectors.ts, src/services/engine/engine.ts, tests that build a LiveCameraRuntime   1.4
src/services/engine/frame/runFrame.ts, src/state/perf/installPerfHook.ts,
  src/state/perf/@types/SkymapPerfHook.d.ts, tools/perf/cpuPerf.ts, tools/perf/README.md     1.5
packages/studio/src/@types/session/StudioState.d.ts, session/state/{studioSlice,initialState,selectors}.ts   2.1
packages/studio/src/session/sagas/studioSessionSaga.ts                             2.2, 2.3
packages/studio/src/@types/kinds/RowKindSpec.d.ts, kinds/data/{cameraKinds,subjectKinds,sceneKinds,
  structureKinds,rowKinds}.ts                                                      2.3
packages/studio/src/shell/components/{TopBar,NarrowNotice}/                        3.1
packages/studio/src/shell/{data/studioKeys.ts,@types/StudioKeyId.d.ts,utils/runStudioKey.ts}   3.2
packages/studio/src/timeline/components/Ruler/useRulerScrub.ts                     3.3
packages/studio/src/inspector/components/{RowInspector,StartModeField}/            3.4
docs/animation/clip-primitives.md, the S3 ADR, packages/studio/README.md            4.1
```

---

## D1: Ground preparation

### Task P1: the playhead's subscribers are its two leaves

**Files:** `packages/studio/src/timeline/components/TimelinePane/TimelinePane.tsx`, `Ruler/Ruler.tsx`,
`Playhead/Playhead.tsx`, `ZoomControls/ZoomControls.tsx`,
`packages/studio/tests/timeline/components/TimelinePane.test.tsx`

`TimelinePane` reads `selectPlayheadSec` only to pass it down (`TimelinePane.tsx:28,53,89`). Move the read into
`Ruler` and `Playhead` (each `useAppSelector(selectPlayheadSec)`; drop the prop). `ZoomControls` reads the head at
click time through `useAppStore().getState()`, as `useTimelineWheel.ts:44` does, instead of subscribing
(`ZoomControls.tsx:19`). No behaviour change.

- [x] Test (jsdom) `a playhead change re-renders the ruler and the line, not the rows`: wrap the pane in a React
      `Profiler` per row (or spy on `OutlineRow`'s render), dispatch `playheadSet(2)`, assert no row rendered again.
      This earns its place: during play the head moves every frame, and a re-added subscription re-renders every
      row at 60 Hz with no test or type error to say so.
- [x] `npm run typecheck:fast`; `npx vitest run packages/studio/tests/timeline`.
- [x] Commit: "Clip studio: only the ruler and the playhead line follow the head".

### Task P2: one predicate for "the clip owns the camera"

**Files:** `src/utils/camera/clipOwnsCamera.ts` (new), `src/services/engine/camera/drivers/cameraDrivers.ts`
(`:242`), `src/services/engine/camera/input/replayInput.ts` (`:142`, `:215`)

**Signature:** `clipOwnsCamera(camera: CameraState): boolean`, today `camera.clip !== null`.

The clip row's `isActive` (`cameraDrivers.ts:242`), the swallow check (`replayInput.ts:142`) and the commit skip
(`replayInput.ts:215`, negated) all mean "a clip owns the camera"; route all three through it. `selectClipActive`
and `selectCameraActive` mean other things ("a clip is live", "the loop must tick") and stay. No test (a moved
predicate; the existing driver and replay tests cover it).

- [x] Add the util, route the three reads.
- [x] `npx vitest run tests/services/engine/camera`.
- [x] Commit: "One predicate says when a clip owns the camera".

---

## D2: Engine: transport, seed, player, readback, perf

### Task 1.1: a live clip can be under transport

**Files:** `src/@types/animation/ClipTransport.d.ts`, `src/@types/animation/ClipSpan.d.ts` (new),
`src/@types/camera/orbitCamera/CameraState.d.ts`, `src/state/camera/cameraSlice.ts`,
`src/services/engine/animation/playClip.ts`, `src/store/types.ts` (`SagaContext.playClip`),
`tests/state/camera/cameraSlice.test.ts`

**review: yes** (Redux state; the transport identity is a cross-file contract)

```ts
/** Where a clip under transport stands. A new value re-anchors the clip clock at the next frame. */
export type ClipTransport =
  | { readonly kind: 'paused'; readonly atSec: number; readonly camera: 'clip' | 'free' }
  | { readonly kind: 'running'; readonly fromSec: number; readonly loop: ClipSpan | null };
export type ClipSpan = { readonly startSec: number; readonly endSec: number };

// CameraState.clip: { data; frame; atEnd; transport: ClipTransport | null } | null
clipStarted: PayloadAction<{ data: ClipData; frame: OrientationFrameId; atEnd: ClipSceneEnd; transport?: ClipTransport }>;
// stores `transport ?? null`
clipTransportSet: PayloadAction<ClipTransport>; // no-op when camera.clip is null
clipDataReplaced: PayloadAction<ClipData>;      // no-op when null; assigns `data` only
// SagaContext
playClip: (clip: ClipData, frame: OrientationFrameId, atEnd: ClipSceneEnd, transport?: ClipTransport) => Promise<void>;
```

`transport: null` is every play today and stays the default; the five existing `playClip` call sites do not change.
`clipDataReplaced` must keep the transport object's identity (assign `camera.clip.data`; never rebuild the clip):
the player anchors on that identity, so a rebuilt object would restart a running clock at every edit.

As built: `clipStarted` takes no `transport` and stores `null`; a transport arrives only by
`clipTransportSet`, so `playClip` keeps its S3 signature (the optional `transport` parameter is SagaContext growth
awaiting the owner; the preview starts with `playClip` then `clipTransportSet` in the same saga step, before any
frame can run).

- [x] Test `clipDataReplaced keeps the transport object and the frame`.
- [x] Test `clipTransportSet and clipDataReplaced do nothing with no clip live` (a late saga step on close must not
      resurrect a play).
- [x] `npx vitest run tests/state/camera tests/services/engine/animation`.
- [x] Commit: "A live clip can be under transport".

### Task 1.2: `rampAt`, the opacity a continuous play shows at t

**Files:** `src/@types/animation/TargetChange.d.ts` (new), `src/utils/animation/rampAt.ts` (new),
`tests/utils/animation/rampAt.test.ts` (new)

```ts
/** One fade identity's target change at a step instant; `overMs` resolved (a step's `over`, else 600 in / 100 out). */
export type TargetChange = { readonly atSec: number; readonly to: number; readonly overMs: number };

/** The opacity a continuous play shows at t and the ramp left. Each change starts from where the previous ramp
 *  stood at its instant (the fade controller's mid-flight retarget). Null before the first change. */
export function rampAt(
  start: number,
  changes: readonly TargetChange[],
  t: number,
): { readonly value: number; readonly target: number; readonly remainingMs: number } | null;
```

Curve: `src/utils/math/smoothstep.ts`, the curve `fadeController.ts:40` uses, so a seek lands where a play would.
`overMs: 0` is a step (value = `to` from its instant). Changes are ascending by `atSec`.

- [x] Test `mid-ramp value and remaining time` (start 0, one change to 1 over 4000 ms at 2 s; at t = 4: value 0.5,
      remainingMs 2000).
- [x] Test `a change mid-ramp starts from where the ramp stood` (start 0; to 1 over 4000 ms at 0; to 0 over
      1000 ms at 2: at t = 2.5 the value is 0.5 · (1 − smoothstep(0.5)) = 0.25, target 0, remaining 500).
- [x] Test `after the last ramp: its target, nothing remaining; before the first change: null`.
- [x] `npx vitest run tests/utils/animation`.
- [x] Commit: "A fade's value at any t, as a continuous play would show it".

### Task 1.3: the player runs a transport

**Files:** `src/services/engine/subsystems/clipPlayer.ts`, `src/@types/engine/subsystems/ClipPlayer.d.ts`,
`tests/services/engine/subsystems/clipPlayer.test.ts`

**review: yes** (shared output, camera time, the landmine list)

```ts
// ClipPlayer gains
/** The clock the last tick evaluated; `held` when a running transport is clamped at its end. Null with no clip. */
clipAt(): { readonly sec: number; readonly held: boolean } | null;
```

Behaviour, all inside `tick`, synchronous, nothing deferred to a later frame:

1. **t.** `transport === null`: S3 unchanged (elapsed since start, `data.loop` wraps, two-frame end latch). Otherwise
   keep a private anchor `{ transport, atMs }`, reset to the frame's `nowMs` whenever `clip.transport` is a different
   object. `paused`: t = `atSec` (may exceed d). `running`: raw = `fromSec + (nowMs − atMs) / 1000`; a `loop` span
   wraps raw into [startSec, endSec) with the overshoot carried; else `data.loop` wraps [0, d); else t = min(raw, d)
   and `held = raw ≥ d`. A transported play never latches an end and never dispatches `clipEnded`.
2. **Epoch.** For a transported play return `{ ref: clip, startMs: nowMs − t · 1000 }`, so the clip driver's
   elapsed (`cameraDrivers.ts:253`) is t with no driver change.
3. **View.** t ≤ d: S3's `sceneView` at the applied counts. t > d: `root` itself, and `clipOpacityOf` returns 1.
   Memoize prefix folds per (compiled data, intent slices' identities), so a scrub re-folds nothing it has folded.
4. **Jumps seed.** A jump is: a transport object not seen last tick, a data identity change while
   `transport !== null`, or any wrap. On a jump, for every fade identity some step of the clip touches, build its
   `TargetChange[]` from the prefix views (target before and after each step, the step's `over`, default 600/100)
   and call `rampAt(intentTarget, changes, t)` (null → the target the view at t gives, snapped):
   - `paused`: `fades.setImmediate(id, value)` only; if `camera.frameTween` is set, dispatch `clearFrameTween()`.
   - `running`: `setImmediate(id, value)`, then `fades.fadeTo(id, target, remainingMs)` when `remainingMs > 0`; a
     `frameTo` step whose roll spans t starts `startFrameTween` from the slerp at t to its frame over the remaining
     time (lift the slerp from the frame tween's own evaluation), else `clearFrameTween()`.
   - Continuous advance (no jump) publishes crossings exactly as S3 does. A play with `transport === null` never
     seeds except at a wrap.
5. **Readback.** `clipAt()` returns the t and `held` of the last tick; null when no clip.

As built:

- **The seed's inputs are two new player deps**: `visibilityTargets(settings[])` (every fade identity's target under
  each prefix's settings, `wiring/visibilityTargetTable.ts`, the rule `syncVisibilityTargets` applies) and
  `getFades()` (lazy, as `getCameraRuntime`: the player is built before `state`). The prefix settings are memoized per
  (compiled clip, intent settings); `publishStep` reads them too instead of folding its own.
- **Wraps seed through S3's `publishWrap` seam**, now deleted: a transported loop seeds on every wrap; an
  untransported loop keeps S3's condition (a lap that drops applied steps), so a step at 0 still holds across laps.
- **"Same play" is decided in `enter`**: a changed `camera.clip` with a transport, whose data OR transport is the one
  the player had, continues the play (a jump); anything else is a new play, handed over as S3 does.
- The mid-roll slerp is lifted into `camera/orientation/frameRollQuatAt.ts`, which `resolveFrameBasis` now calls.

Tests (extend the S3 player tests; hand-computed values):

- [x] `a paused transport evaluates at atSec on every frame` (two ticks 500 ms apart; the returned epoch's elapsed is
      `atSec` both times).
- [x] `a running transport is anchored at the first frame that sees it` (dispatch at nowMs 1000, first tick at 1016:
      elapsed at 1516 is fromSec + 0.5; the recorder's injected clock stays deterministic).
- [x] `a new transport object re-anchors even when its numbers are the old ones` (Home pressed twice while playing).
- [x] `a running transport holds at its end, reports held, and never ends` (no `clipEnded`, end resolver not fired).
- [x] `a loop span wraps inside the span with the overshoot carried`.
- [x] `a paused seek sets each touched identity to its value at t and starts no ramp` (a 4 s show at 2, seek to 4:
      `setImmediate(id, 0.5)`, no `fadeTo`).
- [x] `play from mid-ramp resumes the ramp for its remaining time` (`fadeTo(id, 1, 2000)`).
- [x] `a data swap keeps t and re-seeds; the end resolver is untouched`.
- [x] `past the end the view is intent and the clip factor is 1`.
- [x] `an untransported play never seeds on its first frame` (a registry ramp in flight on an identity the new clip
      also touches is still ramping after the first tick: the tour-seam guard).
- [x] `npx vitest run tests/services/engine/subsystems tests/services/engine/presentation`.
- [x] Commit: "A clip under transport pauses, seeks, loops and holds at its end".

### Task 1.4: t reaches sagas; a paused clip lets the loop sleep; free look frees the camera

**Files:** `src/store/types.ts` (`LiveCameraRuntime`), `src/services/engine/engine.ts` (`cameraRuntime`,
`:329-337`), `src/state/camera/selectors.ts` (`selectCameraActive`, `:39-49`), `src/utils/camera/clipOwnsCamera.ts`,
every test that builds a `LiveCameraRuntime` literal (18 files: grep `upBasisQuat:` in `tests`),
`tests/state/camera/selectors.test.ts`, a camera-sim integration test under `tests/services/engine/camera/`

**review: yes** (SagaContext contract, camera driver arbitration)

```ts
// LiveCameraRuntime gains
/** The clip clock the last frame drew; `held` when a transported clip is clamped at its end. Null with no clip. */
clipAt: { readonly sec: number; readonly held: boolean } | null;
```

- `engine.ts` fills it from `clipPlayer.clipAt()`. Test fakes add `clipAt: null`.
- `selectCameraActive`'s clip term becomes "a clip whose clock runs": `c.clip !== null && c.clip.transport?.kind !== 'paused'`.
  This refines the existing term; it adds no new one.
- `clipOwnsCamera` becomes `camera.clip !== null && !(transport?.kind === 'paused' && transport.camera === 'free')`.

As built: Q-F ruled A (owner, 2026-11-11). The sim test lives in `tests/services/engine/camera/clipFreeLook.test.ts`.

- [x] Test `a paused clip does not keep the loop awake; a running one does` (`selectCameraActive`). It earns its
      place: without it the studio idles at 60 fps for as long as it is open.
- [x] Test (camera sim harness, `tests/helpers/camera/makeCameraSimHarness.ts`) `in free look a sky drag moves the
      camera from the drawn pose, and re-attaching shows the pose at t again`.
- [x] `npm run typecheck:fast`; `npx vitest run tests/state/camera tests/services/engine/camera`.
- [x] Commit: "The drawn clip time reaches sagas; a paused clip lets the loop sleep".

### Task 1.5: a scrub can be priced

**Files:** `src/services/engine/frame/runFrame.ts` (`:73`), `src/state/perf/installPerfHook.ts`,
`src/state/perf/@types/SkymapPerfHook.d.ts`, `tools/perf/cpuPerf.ts`, `tools/perf/README.md`

- A `clip:tick` CPU span around `clipPlayer.tick` (`cpuSpans.on ? performance.now() : 0`, as `runFrame.ts:234-239`
  does for labels).
- Hook method `scrubClip(clipId: ClipId, frames: number): Promise<Record<string, number>[]>`: build the registry
  clip at the frozen instant and resolve its foci as `clipBodySaga` does, `playClip(resolved, frame, 'revert',
  { kind: 'paused', atSec: 0, camera: 'clip' })`, then for each frame dispatch `clipTransportSet` paused at
  `i / frames · d`, wake, await `nextFrame`, and collect the spans as `collectCpu` does; stop the clip at the end.
- `cpuPerf.ts` flag `--scrub <clipId>` (repeatable) runs `scrubClip` instead of the pose scenarios and prints the same
  table. README: one paragraph under "CPU frame cost".

No test: harness wiring, verified live (the README's architecture section says the CDP wiring is verified live).

As built: `scrubClip` starts the clip with the `startClip` action (the `#clip=` takeover body resolves it, as the
recorder hook does) and pauses it with `clipTransportSet`; no `playClip` call from the hook. It ends with
`exitTakeover`.

- [x] Add the span, the hook method, the flag, the README paragraph.
- [x] Live: `npm run perf:cpu -- --url http://localhost:<port> --scrub cosmicFlows` prints a `clip:tick` row.
- [x] Commit: "perf:cpu can price a scrub".

---

## D3: Studio state, preview saga, Use current view

### Task 2.1: the studio's transport

**Files:** `packages/studio/src/@types/session/StudioState.d.ts`, `packages/studio/src/session/state/{studioSlice,
initialState,selectors}.ts`, `packages/studio/src/session/utils/playFrom.ts`, `loopSpanOf.ts` (new), every reader of
`selectPlayheadSec` / `playheadSet` (after P1: `Ruler`, `Playhead`, `ZoomControls`, `useTimelineWheel`,
`runStudioKey`), `packages/studio/tests/session/state/studioSlice.test.ts`

**review: yes** (Redux state)

```ts
// StudioState: `playheadSec` is replaced by
readonly transport: ClipTransport;  // the author's intent; the preview saga copies it to camera.clip
readonly followedSec: number;       // the t the last drawn frame showed; written only while running
readonly loop: boolean;

// actions
playheadSet(sec: number);                                   // paused → paused at max(0, sec), camera 'clip'; running → running from max(0, sec), same loop
played(payload: { fromSec: number; loop: ClipSpan | null }); // → running; followedSec = fromSec
paused();                                                   // running → paused at followedSec, camera 'clip'
playheadFollowed(payload: { sec: number; held: boolean });  // running only: followedSec = sec; held → paused at sec
loopToggled(payload: { span: ClipSpan | null });            // loop = !loop; running → running from followedSec with the new loop
freeLookStarted();                                          // → paused at the shown head, camera 'free'
followResumed();                                            // paused free → paused clip, same atSec

// selectors
selectPlayheadSec(state): number;  // transport paused ? atSec : followedSec  (derived, replaces the stored field)
selectTransport, selectLoop;

// utils (pure)
/** Where Play starts: 0 at or past End; the loop span's start when the head is outside it; else the head. */
playFrom(head: number, durationSec: number, loop: ClipSpan | null): number;
/** The rows arm's union span, or [0, d] with nothing selected (Q16). */
loopSpanOf(selection: StudioSelection | null, timeline: Timeline): ClipSpan | null;
```

`studioOpened` resets `transport` to paused at the kept head (a reopened studio never resumes playing). Every new
transport value is a new object (Immer does this for an assigned union value). Initial: paused at 0, camera
`'clip'`, `followedSec` 0, `loop` false.

As built: this branch has no `StudioSelection` (S2 P3 did not land here), so `loopSpanOf` takes the selected
`TimelineRow` (`selectSelectedRow`); a row of no length loops the whole clip. A seek while running also sets
`followedSec`, so the head jumps before the next follow lands.

- [x] Test `a seek while playing re-anchors the play at the seek` (new running object, same loop).
- [x] Test `pause lands on the followed t` (followedSec 3.2 → paused at 3.2).
- [x] Test `a held follow pauses at the end`.
- [x] Test `free look pauses at the shown head and a seek re-attaches` (camera `'free'`, then `playheadSet` → `'clip'`).
- [x] Test `playFrom restarts at 0 at End and at the loop start outside the loop`.
- [x] `npx vitest run packages/studio/tests/session packages/studio/tests/timeline packages/studio/tests/shell`.
- [x] Commit: "Clip studio: the playhead is a transport".

### Task 2.2: the preview saga commands the engine

**Files:** `packages/studio/src/session/sagas/previewSaga.ts` (new), `studioSessionSaga.ts` (fork it beside
`resolveDraftSaga`), `packages/studio/tests/session/sagas/previewSaga.test.ts` (new)

**review: yes** (sagas, the one writer of `camera.clip` while the studio is open)

**Signature:** `export function* previewSaga(): Generator` (reads `playClip`, `nextFrame`, `cameraRuntime` from the
saga context).

Behaviour:

1. Wait for the first resolution with `data`. Fork `playClip(data, preview.frame, 'revert', transport)`; the forked
   task lives until the session is cancelled (Close), whose cancellation stops the player and reverts the scene.
2. After every action (the S2 P4 pattern: compare values, no action list): when the studio's `transport` is a
   different object from the last one sent, `put(clipTransportSet(transport))`; when the current resolution has
   `data` and it differs from the last data sent, `put(clipDataReplaced(data))`. A failed or pending resolution
   sends nothing, so the view keeps the last good data.
3. While `transport.kind === 'running'`: a forked follow loop awaits `nextFrame()`, reads
   `cameraRuntime()?.clipAt`, and puts `playheadFollowed(clipAt)`; it is cancelled when the transport stops running.
4. Free look: an `inputMoved` carrying a pose-moving motion (a drag or a wheel zoom; not a hover) while the transport
   is running, or paused with `camera: 'clip'`, puts `freeLookStarted()`. The put is synchronous, so the frame that
   consumes the motion already sees the camera free.

As built: `playClip` keeps its S3 signature (its optional `transport` parameter awaits the owner, ask 7D1X): the saga
forks `playClip(data, frame, 'revert')`, which dispatches `clipStarted` synchronously, then puts
`clipTransportSet(transport)` in the same step, so no frame sees the untransported play. Data is sent only when the
revision compiles (`selectPlayableData`, over the timeline's own compile), so an invalid draft never reaches the
player's `compileClip`. Test added: `a held follow pauses the studio at the end`.

- [x] Test `the preview starts paused at the head once the draft resolves`.
- [x] Test `a seek sends one clipTransportSet and nothing else`.
- [x] Test `an edit swaps the data into the live play` (no `clipEnded`, no second `playClip`).
- [x] Test `a failed resolution keeps the last good data`.
- [x] Test `while playing, each frame follows the drawn t; pausing stops the follow` (a fake `nextFrame` and
      `cameraRuntime`).
- [x] Test `a sky drag while following starts free look`.
- [x] Test `closing the studio stops the preview` (cancel the session; the `playClip` cancel hook ran).
- [x] `npx vitest run packages/studio/tests/session`.
- [x] Commit: "Clip studio: the 3D view follows the playhead".

### Task 2.3: Use current view

**Files:** `packages/studio/src/@types/kinds/CapturedView.d.ts`, `packages/studio/src/@types/kinds/RowKindSpec.d.ts`,
`packages/studio/src/kinds/data/{cameraKinds,subjectKinds,sceneKinds,structureKinds,rowKinds}.ts`,
`packages/studio/src/kinds/utils/fromView/{setFromView,setVecFromView,fixedFormOf}.ts` (new),
`packages/studio/src/session/sagas/useViewSaga.ts` (new), `studioSessionSaga.ts` (fork it),
`packages/studio/src/session/state/studioSlice.ts` (`viewUsed`, `startPinned`, `rowReplaced`), tests mirrored

**review: yes** (camera pose and frame maths)

```ts
/** The drawn camera, already re-expressed in the clip's pinned frame. */
export type CapturedView = { readonly pose: CameraPose; readonly fovYRad: number };

// RowKindSpec<T> gains (required on every kind; null = no button)
fromView: ((subject: T, view: CapturedView) => Effect) | null;

// slice
viewUsed(ref: RowRef);                                           // intent; useViewSaga answers
startPinned(payload: { pose: CameraPose; fovYRad: number });     // preview pins := pose/lens; revision + 1; a Saved start → commitDraft(start = pose, 'Use current view')
rowReplaced(payload: { ref: RowRef; effect: Effect; label: string }); // commitDraft via updateEffectAt; one undo entry
```

`useViewSaga`: on `viewUsed(ref)`, read `cameraRuntime()`; convert `from` from the live basis (the matrix of
`upBasisQuat`, the conversion `resolveFrameBasis` uses) into `ORIENTATION_FRAMES[preview.frame]` with
`reencodePose(pose, liveBasis, pinnedBasis)` (`src/services/engine/camera/drivers/utils/reencodePose.ts`). Never use
intent's orientation: the overlay may have rolled the frame. Then: the Start row → `startPinned`; a row whose kind
has `fromView` → `rowReplaced({ ref, effect: fromView(subject, view), label: 'Use current view' })`.

`fromView` per kind: `set` distance/yaw/pitch/roll → `to` from the pose (roll absent → 0), `set` fov → `fovYRad`;
`setVec` → `to` = target; bound kinds through `fixedFormOf`: `moveTargetId` and `strafeId` → `setVec` target,
`dollyToId` → `set` distance, `spinToId` → `set` yaw, `lookAtId` → `all([set yaw, set pitch])`, each keeping the
step's `over` and `ease`. Every other kind: `null`.

As built: the saga is `viewUsedSaga.ts` (named for the action it answers, like `pickObjectSaga`), because
`componentFilePurity` reads any `use<Name>.ts` as a hook file; the label lives in `session/data/viewUsedLabel.ts`.
The quaternion-to-matrix step `resolveFrameBasis` kept private is now `src/utils/math/quaternionToMatrix.ts`, which
both use. `startPinned` and `rowReplaced` join `REVISION_ACTIONS`, and the Start test runs the whole session saga so it
also sees the re-pin resolve. `set` and `setVec` drop a body `frame` when filled, since the capture is absolute.

- [x] Test `a view captured after a frame roll is re-expressed in the clip's pinned frame` (hand-computed: a pose
      looking along the supergalactic pole captured under the supergalactic basis, pinned frame equatorial; assert the
      pinned yaw/pitch).
- [x] Test `Use current view on a bound Look-at replaces it by a Look-at point at the drawn target; Undo restores it`.
- [x] Test `Use current view on Start re-pins the preview and bumps the revision; a Live start stays live`.
- [x] Test `fixedFormOf: Aim becomes an All of Turn and Tilt at the drawn angles`.
- [x] `npx vitest run packages/studio/tests/kinds packages/studio/tests/session`.
- [x] Commit: "Clip studio: Use current view fills a camera step from the drawn camera".

---

## D4: UI surfaces

Every task here follows [`ui-ux.md`](../conventions/ui-ux.md): icons from `src/components/icons/` (Q39: `PlayIcon`,
`PauseIcon`, `LoopIcon`, `CameraIcon` exist), `StudioTip` with name, key chips and state (Q30), the app's `Button`.

### Task 3.1: transport controls and the narrow notice

**Files:** `packages/studio/src/shell/components/TransportControls/TransportControls.tsx` + `.module.css` (new),
`TopBar/TopBar.tsx`, `NarrowNotice/NarrowNotice.tsx`

`TransportControls` sits at the left of the top bar's centre group (Q29: over the timeline, from 0 s), Zoom stays at
its right. Play/Pause (one button; `aria-pressed`, the icon swaps), Loop (`aria-pressed`; tip names the span:
`Loop · selection` or `Loop · whole clip`), and while the camera is free a `Free look` chip with a Follow button.
Play dispatches `played({ fromSec: playFrom(…), loop: loop ? loopSpanOf(…) : null })`; Pause `paused()`; Loop
`loopToggled({ span: loopSpanOf(…) })`; Follow `followResumed()`. Disabled states per spec §3.2: no resolution yet →
Play disabled, tip `Resolving subjects`; never compiled → disabled, tip names the error. `NarrowNotice` gains the same
Play/Pause button before Close (Q13). No test (UI wiring over tested actions).

As built: Play/Pause is its own `PlayButton`, shared by `TransportControls` and `NarrowNotice`; both dispatch
through `runStudioKey` (`useStudioCommand`). The alert line's failure text moved into `selectFailureLine`, read by the
top bar and by Play's disabled tip. Shots are taken in the D5 live check.

- [x] Build; shoot at 1728 wide: paused, playing, looping, free look; and the narrow notice at 400 wide.
- [x] Commit: "Clip studio: Play, Pause and Loop in the top bar and on the narrow notice".

### Task 3.2: keys

**Files:** `packages/studio/src/shell/data/studioKeys.ts`, `@types/StudioKeyId.d.ts`, `utils/runStudioKey.ts`,
`packages/studio/tests/shell/hooks/useStudioKeys.test.tsx` (or a new `tests/shell/utils/runStudioKey.test.ts`)

Rows in the `Playhead` group: `play` (Space, label `Play / Pause`), `loop` (L), `follow` (F, a no-op unless free).
`end` while playing returns `[paused(), playheadSet(d)]`; `start` while playing returns `[playheadSet(0)]` (keeps
playing). Space matches `e.key === ' '` unmodified; `controlOwnsKey` keeps it for a focused button.

As built: landed before 3.1, so the transport buttons dispatch through `runStudioKey` (`play`, `loop`, `follow`)
and a key and its button cannot disagree. Play returns nothing until the preview is live (`selectClipActive`); a
focused button keeps Space (`controlOwnsKey`). Test added: `Space on a focused button is the button's`.

- [x] Test `Space at End plays from 0`.
- [x] Test `End while playing pauses at End`.
- [x] `npx vitest run packages/studio/tests/shell`.
- [x] Commit: "Clip studio: Space plays, L loops, F follows".

### Task 3.3: the ruler pauses for a gesture and shows the loop

**Files:** `packages/studio/src/timeline/components/Ruler/useRulerScrub.ts`, `Ruler.tsx`, `Ruler.module.css`,
`packages/studio/tests/timeline/components/Ruler.test.tsx`

A press while playing dispatches `paused()` and remembers it in a ref (gesture-local, not Redux); release, cancel or
lost capture after such a press dispatches `played({ fromSec: <release head>, loop })`. While `loop` is on, the ruler
tints the looped span (`color-mix` of the accent token).

As built: the release resumes with the paused play's own loop span. The tint shows the running loop, or while paused
with Loop on, what Play would loop (`selectShownLoop`), edged as well as filled so colour is not the only signal.

- [x] Test (jsdom) `a drag that starts while playing pauses and resumes from the release point`.
- [x] `npx vitest run packages/studio/tests/timeline`.
- [x] Commit: "Clip studio: scrubbing while playing pauses for the drag".

### Task 3.4: the Use current view button

**Files:** `packages/studio/src/inspector/components/RowInspector/RowInspector.tsx`,
`StartModeField/StartModeField.tsx`

A `CameraIcon` button labelled `Use current view` in the inspector of every row whose kind has `fromView`, and on
the Start row; it dispatches `viewUsed(ref)`. Its tip says `Free look: drag the sky first` while following. No test
(UI wiring over 2.3's tested saga).

- [ ] Build; shoot one row inspector with the button.
- [ ] Commit: "Clip studio: Use current view in the inspector".

---

## D5: Task 4.1: finish (controller)

**Files:** `docs/animation/clip-primitives.md` (a "Transport" paragraph: a clip under transport, jumps seed),
the ADR S3's Task 3.1 created (a "Seeking" section: transport on the live clip, seed on jumps, paused seeds have no
ramps, why not clip-clock ramps), `packages/studio/README.md` ("seeks and plays"), this plan and the spec (boxes,
rulings)

- [ ] Perf gate (DoD).
- [ ] Live check and shots (DoD), each sent as a dash check with its deep link.
- [ ] ui-ux.md self-check, one line per item, in the PR body.

---

## Definition of Done

**Deliverables**

- `ClipTransport`, `ClipSpan`, `TargetChange`; `camera.clip.transport`; `clipTransportSet`, `clipDataReplaced`;
  `playClip`'s optional `transport`; `rampAt`; `clipOwnsCamera`; `ClipPlayer.clipAt`; `LiveCameraRuntime.clipAt`.
- The studio's `transport`, `followedSec`, `loop` and their actions; `selectPlayheadSec` derived; `playFrom`,
  `loopSpanOf`; `previewSaga`, `useViewSaga`; `fromView` on every row kind; `TransportControls`; the Space/L/F rows.
- `clip:tick` span and `perf:cpu --scrub`.
- The backlog's S4 row points at this plan (done with the plan).

**Live check** (`npm run dev` on this worktree; `npm run shot -- '<link>' --url <server>` for each shot)

- `#studio=cosmicFlows`: drag the ruler head from 0 to End: **the 3D view's camera moves with the head** and the flow
  field fades in as the head crosses its step; drag back: it fades out. Release changes nothing.
- Park the head mid-fade: the flow field is half-faded and stays so (the render loop sleeps: the dash perf panel or
  DevTools shows no frames).
- Space: the head and the view move together; at End playback pauses on the last frame; Space again plays from 0.
- Drag past End into the after-end zone: the camera holds the final pose, the web layers and labels are back.
- Select a row, L, Space: only that row's span loops; Esc clears, L twice loops the whole clip.
- While playing, edit a Distance step's value: the view keeps playing from the same t with the new distance.
- Drag the sky while paused: `Free look` shows, the camera moves, the layers stay; F snaps back to the head's pose.
- Free look to a new view, select a Distance step, `Use current view`: its value becomes the drawn distance; Undo
  restores it. On a bound Look-at: it becomes a Look-at point. On Start: the preview re-pins.
- `#studio=famousFlythrough`: scrub the whole Fly; watch the network panel for tile thrash (backlog it if so).
- At 400 wide: the narrow notice plays and pauses.
- `#clip=cosmicFlows` and the grand tour from beat 0 look as after S3 (no transport, no seeding at seams).

**Perf gate**

- `npm run perf` and `npm run perf:cpu`, all scenarios, `--url` this worktree's server, on the D1 HEAD and the final
  HEAD: no scenario regresses beyond run-to-run noise.
- `npm run perf:cpu -- --url … --scrub cosmicFlows --scrub famousFlythrough`: `clip:tick` mean recorded in the
  ledger; above 1 ms halts landing for the owner's ruling.

**Deferral boundary (out of scope)**

- The path overlay and the speed-curve lane (S5); the PiP rig and the always-free edit camera that retire free look
  (S6); detached windows (S7); saving (S8).
- A persistent Bind field on bound steps (Q-G; backlog); clip-clock frame rolls (Q-E; backlog if asked).
- Frame-step keys, shuttle keys, playback speed; the tour dwell pausing its clip through a transport (adjacent,
  backlog).
