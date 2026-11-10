# Clip studio S4: seek and transport

**Status:** draft, awaiting owner approval · **Date:** 2026-11-10 · **Branch:** `feat/clip-studio`
**Decision record:** [`clip-studio-2026-11-07.md`](../../grill-sessions/clip-studio-2026-11-07.md) Q6 (Use current
view), Q7 (preview pins), Q13 (Play on the narrow notice), Q16 (loop scope), Q17 (snap), Q21 (PiP, supersedes Q10),
Q23 (Use current view on a bound step), Q29 (transport over the timeline), Q30 (keys in tips), Q52 (no clip perf
scenario, reopened for scrubbing in Q-J).
**Builds on:** [S3 spec](2026-11-10-clip-studio-s3-scene-tracks.md) (`sceneView`, `clipFactorAt`, the overlay, `atEnd`;
its §7 is the contract this spec seeks with). **Plan:**
[`2026-11-10-clip-studio-s4-seek-transport.md`](../plans/2026-11-10-clip-studio-s4-seek-transport.md)

Items marked _(open, Q-x)_ carry a recommendation and wait on the owner; the plan follows the recommendation until
ruled otherwise.

## 1. Goal

**Person and job.** As someone authoring a clip in the studio, I need the 3D view to show the clip at the playhead,
and to play, pause and loop it, so that I can see what I am editing instead of imagining it.

After S4:

- Dragging the playhead, clicking the ruler, Home and End move the 3D view: camera **and** scene at t, at frame
  rate. The owner asked for "the actual scrubbing".
- Play, Pause and Loop exist in the top bar (Q29), on Space and L, and Play on the narrow notice (Q13).
- The view after the end shows where the clip leaves the viewer.
- "Use current view" fills a camera step from the drawn camera (Q6, Q23), with a free look to fly to a view first.
- Edits while paused or playing re-show the frame at the same t without restarting.

Out of scope: the path overlay (S5), the PiP view rig and the always-free edit camera (S6), detached windows (S7),
saving (S8), the Bind toggle as a persistent field (Q-G), frame stepping keys, playback speed.

## 2. The model

### 2.1 One clock value per live clip

A live clip either plays straight through (every clip today) or is **under transport**: someone outside the player
decides where its clock stands. The studio's preview is the only clip under transport in S4.

```ts
// src/@types/animation/ClipTransport.d.ts
/** Where a clip under transport stands. A new value re-anchors the clip clock at the next frame. */
export type ClipTransport =
  | { readonly kind: 'paused'; readonly atSec: number; readonly camera: 'clip' | 'free' }
  | { readonly kind: 'running'; readonly fromSec: number; readonly loop: ClipSpan | null };

// src/@types/animation/ClipSpan.d.ts
export type ClipSpan = { readonly startSec: number; readonly endSec: number };

// CameraState.clip (S3 shape plus one field)
clip: { data: ClipData; frame: OrientationFrameId; atEnd: ClipSceneEnd; transport: ClipTransport | null } | null;
```

`transport: null` is today's behaviour: t is the time since the play started, `data.loop` wraps, the play ends at
its end by `atEnd` (S3). Every existing caller keeps it.

**Identity is the signal.** The player anchors a running transport at the `nowMs` of the first frame that sees that
transport **object**, so `t = fromSec + (nowMs − anchorMs) / 1000`. Comparing values would miss Home pressed twice
while playing from 0. Anchoring at a frame's `nowMs`, never at a wall-clock read at dispatch, keeps the recorder's
injected clock deterministic. `clipDataReplaced` keeps the transport object (Immer leaves an unassigned child alone),
so an edit mid-play keeps t running.

| `clip.transport` | t this frame | At the end |
| --- | --- | --- |
| `null` | elapsed since start; `data.loop` wraps [0, d] | ends by `atEnd` (S3's two-frame latch) |
| `paused` | `atSec`, which may exceed d (the after-end zone) | never ends |
| `running`, `loop` set | wraps inside the span, overshoot carried (as today's rebased lap) | never ends |
| `running`, no `loop`, `data.loop` | wraps [0, d] | never ends |
| `running`, otherwise | clamped at d; the player reports `held` | never ends: the transport's owner pauses it |

A clip under transport **never ends on its own**; whoever owns the transport pauses or stops it. That is why no end
mode is added beside S3's `atEnd`: the studio plays with `atEnd: 'revert'`, which applies when it stops the play
(Close). The player returns the clip epoch rebased so its elapsed equals t (`startMs = nowMs − t · 1000`), as it
already does on a loop lap, so the camera driver (`cameraDrivers.ts:253`) reads t with no change.

### 2.2 The frame at t

- **Camera:** `evaluateClip(data, t)`, clamped at d (the natural-end latch relies on that clamp already). The sim clock
  is frozen at the pinned instant for the whole session (Q7, `withFrozenClockSaga`), so frame legs, whose start
  converts against the bodies of the first call that reaches them (`evaluateClip.ts:80-92`), give the same pose
  whatever order t is visited in. That frozen clock is what makes scrubbing pure in t.
- **Scene, t ≤ d:** S3's `sceneView(root, tracks, applied(t), focusRow)` and `clipFactorAt(segments, t)`.
- **Scene, t > d (paused only):** the overlay is off and every factor is 1. The view is intent: the play's end with
  `revert`, which is what a standalone play leaves (Q-B).
- **Pins:** start pose, lens and orientation frame are baked into the resolved draft (`resolveDraftSaga`); the frame
  rides `playClip`'s `frame`. t moves camera and scene only.

### 2.3 Jumps seed, continuous play ramps

S3 publishes each step crossed by a running clock to the subsystem that animates it (the fade registry over the
step's `over`, `camera.frameTween` for a frame roll). A **jump** has no "crossed since last frame", so it publishes by
**seeding**, the S3 §7 contract:

- A jump is a transport value the player has not seen, a data change under transport, or a wrap. A clip with
  `transport: null` never jumps except at a wrap, so tour seams keep S3's behaviour: a ramp carried across a seam
  by a `keep` commit is not touched by the next clip's first frame.
- **Seed, paused:** every fade identity some step of the clip touches is set with `setImmediate` to the opacity a
  continuous play would show at t (`rampAt`, §5), and nothing ramps. The visibility registry ramps on wall time, so a
  ramp started while paused would run while the clock stands still. A frame tween in flight is cleared, so the
  basis is the view's orientation at t.
- **Seed, running:** the same values, then `fadeTo(target, remaining)` for each ramp in progress at t; a `frameTo`
  mid-roll starts a frame tween from the slerp at t over the remaining time.
- **Data swap:** a seed at the current t. The camera follows the new data in the same frame.

> [!DECISION] Seed into the existing registry, not a clip-clock registry
> The greenfield cross-check proposed ramps evaluated in clip time (a fade registry and frame tween fed a clock per
> frame), which makes a paused frame exactly f(t) and needs no seed. It is the shape S3 weighed and rejected
> (§8 "affine overlay values … with the overlay owning every ramp"): the registry gates on data arrival (ADR 0001,
> ADR 0012) and carries the label envelope. Cost of staying: a paused frame inside a frame roll shows the roll's
> destination, and focus recession settles on its own clock (Q-E). Cost of switching: S3's publication model and
> the registry change, for the preview's benefit alone. Q-L asks.

### 2.4 Free look and Use current view

Until S6 gives the studio an always-free edit camera beside the following inset (Q21), there is one view, and it
follows the playhead. To fly to a view for "Use current view", a sky drag or wheel step (`inputMoved`) while the
camera follows **frees** it: the transport becomes `paused` at the drawn t with `camera: 'free'`. The clip driver
yields (`clipOwnsCamera` is false), commit-on-edge bakes the drawn pose into the register (the clip row's
`commitsOnEdge: 'register'`, `cameraDrivers.ts:239`), and the drag moves the camera from where it was. The scene
stays at t. Any seek, Play, or F re-attaches (_open, Q-A_).

"Use current view" reads the drawn camera (`cameraRuntime().from` and `.fovYRad`), free or following, re-expresses it
from the live up-basis into the clip's pinned frame (the inverse of the clip row's exit re-encode,
`cameraDrivers.ts:213-230`), and writes it into the step as one undo entry, labelled `Use current view`.

| Row | What it writes |
| --- | --- |
| Start | the pinned preview start pose (Q7); also the draft's `start` when it is Saved. A Live start stays `'live'`. |
| Distance, Turn, Tilt, Roll (`set`) | `to` = the pose's distance, yaw, pitch, roll |
| FOV (`set`) | `to` = the drawn lens |
| Look-at point (`setVec`) | `to` = the pose's target |
| Bound steps (Q23) | replaced by their Fixed form with the live values (_open, Q-G_): Look-at and Strafe → Look-at point; Distance → Distance; Turn → Turn; Aim → an All of Turn and Tilt |
| `spin`, `rate`, `osc`, Fly, Zoom-pan, scene steps | no button (relative or structural; no single "current" value) |

## 3. Interaction design

### 3.1 Scrubbing

| Gesture | During | On release |
| --- | --- | --- |
| Press on the ruler | the head jumps to the pointer (snapped, Q17); the view shows t in the next frame | — |
| Drag on the ruler | each move is a seek; the view follows at frame rate, camera and scene | nothing new: the last move's frame is already exact |
| Press or drag while playing | playback pauses for the gesture | playback resumes from the release point (_open, Q-D_) |
| Home / End | head to 0 / to End; End while playing pauses there | — |
| Drag past End | the head enters the after-end zone; the view shows the final camera and the reverted scene (Q-B) | — |

Snapping is slice 1's (`snapTime`, ⌥ free, ⇧ fine). Several pointer moves in one frame cost one engine frame: the
scheduler coalesces wakes.

### 3.2 Transport

The top bar's centre group (Q29: over the timeline, from 0 s): Play/Pause, Loop, and, while the camera is free, a
`Free look` chip with a Follow button. Zoom stays at the group's right.

| Control | Key | Does | State shown |
| --- | --- | --- | --- |
| Play / Pause | Space | plays from the head; from 0 when the head is at or past End, from the loop's start when it is outside the loop | the icon (Play ↔ Pause), `aria-pressed`, the tip names it |
| Loop | L | loops the selected rows' span, or the whole clip when nothing is selected (Q16); the span is read when Play or Loop is pressed (_open, Q-I_) | pressed state; the ruler tints the looped span |
| Follow | F | re-attaches a free camera to the playhead | the `Free look` chip disappears |

Keys live in tooltips and the `?` overlay only (Q30), under the `Playhead` group (_open, Q-H_). Space is taken only
while the dock has focus, as every studio key is; a focused button keeps Space (`controlOwnsKey`).

**Reaching the end while playing** pauses at End and shows the clip's last frame (_open, Q-C_). A clip whose End row
says Loop (`data.loop`) never reaches it.

**The narrow notice** (Q13) gains a Play/Pause button beside Close, with the same action as the top bar's.

**Disabled states.** Before the first resolution lands, Play is disabled with the tip `Resolving subjects`. When the
current revision does not compile, the preview keeps the last revision that did and the top bar's alert line
(slice 1) already names the error; Play stays live. With no revision ever compiled, Play is disabled and its tip
names the error.

### 3.3 Edits while paused or playing

An edit, undo or redo bumps the revision; `resolveDraftSaga` resolves it (S2 P4: on revision change); the preview
saga swaps the data into the live play (`clipDataReplaced`). Paused, the view re-shows t; playing, it keeps playing
from the drawn t. The play is never stopped and restarted, which would revert the scene and re-apply it, a visible
dip. While a resolution waits on foci the view keeps the previous data. A shorter clip that leaves the head past its
new End shows the after-end frame; a running clock clamps and the studio pauses at End.

Selecting a row does not move the head. S2's drags commit per move, so a length drag re-shows t on every move.

### 3.4 Open and close

The preview starts paused at the head (0 on a fresh open; a kept draft keeps its head, Q28) once the first resolution
lands. The view at t = 0 equals the camera as the studio opened, because the pinned start is that camera. Close
(Esc, the button, a takeover replacing the studio) cancels the preview: `stop()` reverts the scene with S3's default
durations, and the camera stays at the frame shown, as every clip leaves it.

### 3.5 States

| State | What shows |
| --- | --- |
| Resolving (first) | the camera as opened; Play disabled, tip `Resolving subjects`; the head moves, the view does not |
| Paused, following | the frame at the head |
| Paused, free | the user's camera, the scene at the head; `Free look` chip with Follow |
| Playing | the head moves at frame rate; Pause shown |
| Playing a loop | as playing; the looped span tinted on the ruler |
| Head past End | the final camera, the reverted scene |
| Compile error | the last good revision, alert line as slice 1 |
| Never compiled | Play disabled with the error in its tip |
| Narrow | `Needs a wider screen`, Play/Pause, Close |

## 4. Who writes what

```
studio slice                      preview saga (studio)                  engine
 transport  ── identity change ──▶ clipTransportSet(transport) ──▶ camera.clip.transport ─▶ clipPlayer.tick
 resolution ── new data ─────────▶ clipDataReplaced(data)       ──▶ camera.clip.data
 followedSec ◀── playheadFollowed({ sec, held }) ◀── nextFrame + cameraRuntime().clipAt ◀── player's last t
```

- **The studio slice holds the author's intent.** `transport: ClipTransport` replaces `playheadSec`; `followedSec`
  is the t the last drawn frame showed, written only while running; `loop: boolean`. The head shown is
  `transport.kind === 'paused' ? transport.atSec : followedSec` (`selectPlayheadSec`, now derived).
- **`camera.clip` is the command.** One writer while the studio is open: the preview saga, which copies the studio's
  transport whenever its identity changes and swaps data when the last good resolution changes, after every action
  (the S2 P4 pattern, no action list). The player never writes the transport.
- **The engine reports t** through the live camera snapshot: `LiveCameraRuntime.clipAt: { sec; held } | null`, the
  clock the last frame drew (_open, Q-F_). While running, the preview saga awaits `nextFrame`, reads it, and
  dispatches `playheadFollowed`. A held follow pauses the studio at End.
- **Pause lands on the drawn t** with no engine read: `paused()` turns the running transport into `paused` at
  `followedSec`, the t of the last drawn frame, so the next frame redraws it exactly.
- **Wake.** `clipTransportSet` and `clipDataReplaced` are `camera/` writes, a wake route
  (`src/store/effects/watchWakeSaga.ts`), so a seek wakes exactly one frame by construction. `playheadFollowed` is a
  `studio/` write and wakes nothing, so the follow loop cannot feed itself. The loop-continuation predicate's clip
  term becomes "a clip whose clock runs" (`selectCameraActive`, `src/state/camera/selectors.ts:42`), so a paused
  preview lets the loop sleep: a refinement of the existing term, not a new one.

## 5. Contracts

```ts
// src/state/camera/cameraSlice.ts
clipStarted: PayloadAction<{ data; frame; atEnd; transport?: ClipTransport }>; // stored as `transport ?? null`
clipTransportSet: PayloadAction<ClipTransport>; // no-op when no clip is live
clipDataReplaced: PayloadAction<ClipData>;      // resolved data; keeps `frame`, `atEnd` and the transport object

// SagaContext.playClip (S3 signature plus one optional trailing parameter)
playClip: (clip: ClipData, frame: OrientationFrameId, atEnd: ClipSceneEnd, transport?: ClipTransport) => Promise<void>;

// src/store/types.ts
LiveCameraRuntime.clipAt: { readonly sec: number; readonly held: boolean } | null;

// ClipPlayer (S3 shape plus)
/** The clock the last tick evaluated; `held` when a running transport is clamped at its end. Null with no clip. */
clipAt(): { readonly sec: number; readonly held: boolean } | null;

// src/utils/camera/clipOwnsCamera.ts (prep P2; S4 changes its body only)
export function clipOwnsCamera(camera: CameraState): boolean;

// src/@types/animation/TargetChange.d.ts
/** One fade identity's target change at a step instant; `overMs` resolved (a step's `over`, else 600 in / 100 out). */
export type TargetChange = { readonly atSec: number; readonly to: number; readonly overMs: number };

// src/utils/animation/rampAt.ts
/** The opacity a continuous play shows at t, and the ramp left. `from` of each change is where the previous ramp
 *  stood at its instant (the fade controller's mid-flight retarget). Null before the first change. */
export function rampAt(
  start: number,
  changes: readonly TargetChange[],
  t: number,
): { readonly value: number; readonly target: number; readonly remainingMs: number } | null;
```

`playClip`'s new parameter is optional because every other caller plays straight through, today's behaviour; S3's
"`atEnd` required" ruling (Q51) is about what each call does to the scene, which `transport` does not touch.

`rampAt` uses the fade controller's curve (`fadeController.ts:40`, smoothstep) so a seek lands where a continuous
play would have been; its test pins that agreement with hand-computed values.

## 6. Performance

A scrub evaluates at every pointer move, but the engine evaluates once per frame however many moves land in it.
Per seek frame:

| Work | Where | Expected |
| --- | --- | --- |
| Reducer + preview saga + `clipTransportSet` | store, per move | tens of µs |
| Ruler and playhead re-render | React, per move | the two leaves only (prep P1); today the whole `TimelinePane` re-renders |
| Applied counts (binary search), view fold when the counts change | `clipPlayer.tick` | a fold is ≤ ~30 actions through the reducers; prefix folds are memoized per (data, intent slices), as the cross-check advised, so a scrub re-folds nothing it has folded |
| Seed: `rampAt` per touched identity | `clipPlayer.tick` | identities touched × steps, a few hundred multiplies |
| `evaluateClip` at t | camera step | compiled-clip cache hit; frame legs re-convert once per transport value |

During play the follow loop adds one `studio/` dispatch per frame, re-rendering the two playhead leaves.

**How to measure.**

1. The always-on part, before (on the G0 HEAD) and after, all scenarios, this worktree's own server:
   `npm run perf:cpu -- --url http://localhost:<port>` and `npm run perf -- --url http://localhost:<port>`. The
   poses play no clip, so they price the clock read in `tick` and the refined loop predicate. No scenario may
   regress beyond run-to-run noise.
2. The scrub: a new `clip:tick` CPU span around `clipPlayer.tick` (`runFrame.ts:73`), and
   `npm run perf:cpu -- --url http://localhost:<port> --scrub <clipId>`, which plays the registry clip paused
   through the perf hook and seeks to a new t every frame across its length, printing the same rows plus
   `clip:tick` (_open, Q-J_). Run it on `cosmicFlows` (the most scene steps among the registry clips; confirm by
   counting `compileClip(…).scene.steps`) and `famousFlythrough` (the heaviest camera path). `clip:tick` above
   1 ms mean on the dev box halts landing for the owner's ruling.
3. The React side: the P1 render-count test, and one DevTools trace of a 3 s drag during the live check.

## 7. Risks

> [!RISK] Two writers of the clock would make the head lie
> If the player wrote the transport (pausing at End itself), the studio's intent and the engine's command could
> disagree. The player never writes it: it reports `held`, and the studio pauses. One writer per field.

> [!RISK] A paused frame is not exactly f(t) for everything
> Frame rolls show their destination when paused (Q-E); focus recession and label envelopes settle on their own
> clocks within ~0.6 s; a data arrival while paused fades in on the registry's arrival gate, as it does outside
> clips. The scene targets, the fade factors and every switch ramp's value are exact.

> [!RISK] Use current view's frame maths
> The drawn pose is in the live basis, which differs from the clip's pinned frame after a `frameTo` step. Writing it
> unconverted would aim the step wrong by the frame difference. The capture converts from `cameraRuntime().upBasisQuat`,
> never from intent (sagas read intent, which the overlay does not reach).

> [!RISK] Tour seams
> If an untransported play seeded on its first frame, it would snap a ramp a `keep` commit carried across the seam.
> Jumps exist only under transport and at wraps; a player test pins the carried ramp.

> [!RISK] Asset demand while scrubbing
> Each seek frame plans demand at a new pose; a fast drag across a fly from Earth to Virgo asks for tiles at every
> pose it passes. Demand gates (#1072) and the coalesced wake bound it to one plan per frame. The live check watches
> the network panel during a long drag; a backlog item follows if it thrashes.

Smaller: `clipDataReplaced` arriving after `clipEnded` (a stale saga step on close) is a no-op by the reducer's
no-clip rule, so it cannot resurrect a play. A browser tab hidden while playing resumes with a large jump in t;
S3's crossing publication handles skipped frames.

## 8. Ground preparation

From the refactor-ground pass over this feature (2026-11-10), written against S3 as planned (its plan's G0–G2 have
not landed; §9 lists what S4 asks of it).

**Ideal diff.** A `transport` field on the live clip and three camera actions; the player computes t from it, seeds
on jumps and reports t; a `rampAt` util; one predicate body changes; the studio slice's `playheadSec` becomes a
transport value, a preview saga copies it to the camera, transport controls and keys are rows in existing tables;
"Use current view" is a registry field per kind plus a saga answering an intent, like the object picker's.

**Contracts that change**

| Contract | Change | Reach (counted) |
| --- | --- | --- |
| `CameraState.clip` gains `transport: ClipTransport \| null` (`CameraState.d.ts:25`) | additive | `clipStarted` dispatchers: 2 (`playClip.ts:48`, `replayInput.ts:119`; grep `clipStarted(` in `src`) |
| `playClip(…, transport?)` (`src/store/types.ts:179`) | additive, optional | 5 call sites unchanged (grep `playClip` in `src/state`) |
| `LiveCameraRuntime.clipAt` (`src/store/types.ts:94`) | additive, required | 1 builder (`engine.ts:329-337`); 18 test files build a runtime literal (grep `upBasisQuat:` in `tests`) |
| `StudioState.playheadSec` → `transport`, `followedSec`, `loop` | breaking, studio-internal | 6 files read `selectPlayheadSec` or `playheadSet` (grep in `packages/studio/src`) |
| `selectCameraActive`'s clip term (`selectors.ts:42`) | narrowing: a paused clip no longer keeps the loop awake | 1 reader (`shouldKeepTicking.ts`) |

**Verdicts per touchpoint**

| Touchpoint | Verdict | Joint |
| --- | --- | --- |
| Pause, seek, loop, hold | growth | a field on the live clip; the player already rebases the epoch on a lap |
| Wake on seek | growth | `camera/` is a wake route by construction |
| Loop sleeping while paused | growth | the existing clip term, refined |
| "The clip owns the camera" for free look | **bolt-on** today: three bare `camera.clip !== null` / `=== null` reads mean it (`cameraDrivers.ts:242`, `replayInput.ts:142`, `replayInput.ts:215`); free look would edit all three | P2 |
| The head moving at 60 Hz | **bolt-on** today: `TimelinePane` subscribes to `playheadSec` only to pass it down (`TimelinePane.tsx:28`), so every follow write re-renders every row; `ZoomControls` subscribes to read it at click time (`ZoomControls.tsx:19`) | P1 |
| Data swap mid-play | growth | a camera action; the player's compile cache already keys on data |
| Seeding on a jump | growth | S3 §7's contract; `setImmediate` / `fadeTo` exist on the registry |
| Engine t to the studio | growth, with consent | a field on the live camera snapshot (Q-F) |
| Use current view | growth | a `fromView` field on the row registry; an intent answered by a saga (the `objectPicked` pattern) |
| Keys | growth | rows in `STUDIO_KEYS` |

**Prep commits, in order** (each its own commit, before any feature commit; packaging is Q-K):

| # | Prep | Removes |
| --- | --- | --- |
| P1 | `Ruler` and `Playhead` select the head themselves; `TimelinePane` stops subscribing; `ZoomControls` reads it at click time from the store, as `useTimelineWheel` already does | a whole-pane re-render per head move |
| P2 | `clipOwnsCamera(camera)`, today `camera.clip !== null`, read by the clip driver's `isActive` and both `replayInput` checks | three copies of one predicate |

**Weighed against the greenfield shape.** A fresh agent given only the requirements agreed on: a transport union
with `paused` (carrying `camera: 'clip' | 'free'`) and `running` (carrying a loop range), anchored at the first
frame that sees a new value (it used a `seq` counter where Redux identity serves); hold at the end with the engine
reporting and never writing the transport; Pause landing on the last drawn t; a data swap that leaves the transport
alone; the readback kept out of the wake routes. Divergences, priced:

- *Clip-owned ramps in clip time* instead of seeding the wall-clock registry: §2.3's decision, Q-L.
- *An engine-written readback slice in the store* instead of the saga reading `cameraRuntime().clipAt` after
  `nextFrame`: no SagaContext growth, but a per-frame engine write of player state into Redux, a mirror the S3
  rulings rejected (Q49). Q-F.
- *A tour as one chain clock*: rejected by S3 (§8) and out of scope here.
- *Fold checkpoints per revision*: adopted (§6).

**Adjacent findings** (backlog by default): the tour dwell replays its ambient clip from 0 after a pause
(`pausableDwellSaga.ts:20-28`); a transport could pause it instead. `rampAt` and `fadeController` share one curve
through `smoothstep`; `fadeController.ts` keeps a private copy (S3's adjacent finding stands).

## 9. What S4 needs from S3

S3's §7 promises `sceneView` and `clipFactorAt` at any t and a seed by `setImmediate` + `fadeTo`. That is enough
for a running seek. Not yet promised:

1. **Wraps seed.** S3 publishes a loop wrap "with default durations" (§2 step 3). A studio loop span wraps
   mid-clip, where a default fade from the wrong value is visibly false. Recommend S3 publish every wrap through the
   seed (`earthCosmicWebLoop`'s step at 0 still holds with no visible change: its seed value equals its target). If
   S3 lands as planned, S4's seed task routes wraps through the seed and says so in its commit.
2. **A clip replaced without an end.** S3 does not say what the player does when `camera.clip` changes identity
   while live (`replayInput.ts:119` can do it today; S4's `clipDataReplaced` and `clipTransportSet` always do).
   S4 defines it for transported plays (a jump); S3 should state that an untransported replacement publishes
   crossings, never seeds, and leaves the end resolver alone.
3. **The view past the end.** S3 defines the view up to the end, then drops the overlay. S4 needs `view` at
   t > d for a paused transport to be intent (§2.2). The player owns it; S3 need only not forbid it.
4. **Paused seeds have no ramps.** S3 §7's frame-tween seed works only while the clock runs; S4 clears the tween
   when paused (Q-E). No S3 change; recorded so S3's ADR does not promise a mid-roll frame when paused.

## 10. Entanglement check (radar over this spec)

- *Two publication paths* (crossing ramps, jump seeds). Essential: a jump has no "since last frame". They agree at
  the boundary, since a seed at a step's own instant is that step's ramp. Unifying (always seed) would cost a
  `rampAt` per touched identity on every crossing frame for no visible gain, and would snap ramps carried across
  tour seams.
- *`transport: null` vs a transport.* One discriminant, read where t is computed and where jumps are detected; both
  in `tick`. Not a mode flag beside `atEnd`: it says who owns the clock.
- *`playheadSec` written by two paths* (seeks, the follow) — removed: the head is derived from `transport`
  (paused) or `followedSec` (running), and each field has one writer.
- *The studio's transport and the camera's.* A command copied by one saga, never read back; the engine's t comes
  back through `clipAt`, a different field. No mirror.
- *`camera: 'free'` on `paused` only.* Essential: a running clip owns the camera (a drag during play pauses first).
- *"Pause at End" in the studio, "held" in the engine.* The engine reports a fact; the studio decides. No flag
  scheduled for a later frame.
- *Use current view's per-kind writes.* A registry field per kind, not a switch in the saga.
- *Loop span read at press time* (Q-I). A deliberate snapshot, not a watcher; the alternative needs a saga watching
  selection, a hand-kept reaction.

No accidental knot is documented instead of removed.

## 11. Open questions

| # | Question | Options | Recommendation |
| --- | --- | --- | --- |
| Q-A | How does the one view get free for Use current view before S6? | A: a sky drag frees the camera, scene stays at t, `Free look` chip, F / seek / Play re-attach. B: defer Use current view to S6. C: a Follow / Free toggle until S6 | **A.** One clock field and one predicate; S6 deletes the chip when the edit camera is always free. Reopens Q10's "nothing changes mode by accident" for the interim only, with the state on screen. Close leaves the camera where it was flown |
| Q-B | What does the view show past End? | A: final camera, scene reverted to the studio's opening scene, settled. B: final camera, the clip's end scene held. C: the revert ramps in post-end time | **A.** It is what a standalone play leaves (Q2); C costs a second ramp evaluation for a zone that is for looking, not timing |
| Q-C | Playing reaches End | Pause at End; run into the after-end zone; jump back to 0 and stop | **Pause at End**, showing the last frame; Play then restarts from 0 |
| Q-D | A ruler press while playing | Pause for the gesture and resume on release; keep playing from each move; any seek pauses | **Pause and resume**: a held pointer must not play on under it |
| Q-E | A paused frame inside a `frameTo` roll | The destination frame; a held mid-roll tween (infinite duration, keeps the loop awake); clip-clock frame rolls (an S3 change) | **The destination**; backlog clip-clock rolls if authors need a mid-roll paused frame |
| Q-F | How does the engine's t reach the studio? | A: `LiveCameraRuntime.clipAt`, read by the preview saga after `nextFrame` (grows the SagaContext contract). B: the engine writes a readback slice each frame (a mirror). C: the studio estimates t from wall time (drifts) | **A**; needs the owner's yes, as any SagaContext growth does |
| Q-G | Use current view on a bound step (Q23) | Replace it by its Fixed form with the live values (one undo entry); build a persistent Bind field (Subject \| Fixed) on every bound kind; no button on bound steps | **Replace**: Q23's capture and undo without a new field; the Bind field goes to the backlog |
| Q-H | Keys | Space Play/Pause, L Loop, F Follow; Home/End as slice 1 | **As listed.** J/K/L shuttle and frame steps are not in S4 |
| Q-I | The loop span when the selection changes while looping | Read at Play/Loop press; follow the selection live | **At press**: one rule, no watcher; pressing L twice takes the new selection |
| Q-J | A scrub perf scenario | `perf:cpu --scrub <clipId>` plus a `clip:tick` span; a one-off DevTools trace only | **The flag and the span.** Q52 ruled out a clip scenario because S3's clip cost is per crossing; a scrub makes every frame a jump |
| Q-K | Prep packaging (P1, P2) | Separate PR, or riding the S4 PR | Owner's call, asked every time; both are small and behaviour-neutral, **leaning toward riding the S4 PR** |
| Q-L | Ramps under transport | Seed into the registry (S3's shape); clip-clock ramps (the greenfield's) | **Seed** (§2.3) |

## 12. Success criteria

- Dragging the playhead moves the 3D view's camera and scene to t at frame rate; release changes nothing.
- A layer shown with a 4 s fade is half-faded when the head is parked mid-fade, and fully back to intent past End.
- Space plays from the head and the head moves with the view; reaching End pauses there; Space at End plays from 0.
- L with a row selected loops that row's span; with nothing selected, the clip.
- An edit while playing keeps playing from the same t with the new clip; while paused, the frame updates in place.
- A sky drag while following frees the camera, the scene stays at t, the chip shows; F snaps back.
- Use current view on a Distance step writes the drawn distance; on Start it re-pins the preview start; on a bound
  Look-at it becomes a Look-at point; each is one `Use current view` undo entry.
- A paused studio lets the render loop sleep.
- Tours, exhibits and `#clip=` behave as after S3.
