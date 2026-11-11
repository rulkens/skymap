# Clip studio S3: a clip's scene as pure tracks

**Status:** open questions ruled by the owner 2026-11-10 (§9) · **Date:** 2026-11-10 · **Branch:** `feat/clip-studio`
**Decision record:** [`clip-studio-2026-11-07.md`](../../grill-sessions/clip-studio-2026-11-07.md) Q1 (C, scene as pure
tracks, for every clip), Q2 (B, a clip's scene always reverts at its end) and this spec's rulings Q48–Q53.
**Plan:** [`2026-11-10-clip-studio-s3-scene-tracks.md`](../plans/2026-11-10-clip-studio-s3-scene-tracks.md)

## Goal

A playing clip's scene (which layers are on, its settings writes, its focus, its orientation frame, its `fade`
factors) becomes a function of the clip clock `t`, evaluated every frame, so the whole frame is a function of `t`.
Today the camera already is (`evaluateClip(data, t)`). The scene is not. `clipPlayer.tick`
(`src/services/engine/subsystems/clipPlayer.ts:119-124`) fires each cue once, when the clock crosses its `atSec`,
and `applySceneEffect` (`src/services/animation/applySceneEffect.ts`) turns it into Redux intent writes that outlive
the clip. Nothing can ask "what is the scene at t?", so S4's seek cannot show a truthful frame.

After S3:

- A clip never dispatches its scene. Its scene is an **overlay**: the actions it would have dispatched by `t`,
  folded over the live intent by the real reducers. The engine reads intent through that overlay while the clip
  is live.
- A clip's scene **reverts** at its end (Q2). A tour asks the player to **keep** each clip's end scene, which the
  player commits to intent in the same frame the clip ends, so tours chain without a seam (Decision 1).
- The edge-triggered path is deleted for every clip (tours, exhibits, standalone clips, the inspector replay, the
  recorder): `applySceneEffect`, `clipOpacityChannel` and the cue cursor go.

Out of scope: seek, pause and transport (S4). S3 delivers the pure evaluation S4 seeks with and states what S4 must
seed (§7).

## 1. The model

### 1.1 What a clip's scene is

`compileClip` emits `CompiledClip.scene: SceneTracks` in place of `cues: SceneCue[]`:

```ts
// src/@types/animation/compiledClip/SceneTracks.d.ts
export type SceneTracks = {
  /** show / hide / scene / frameTo, ascending atSec; equal atSec keeps written order. */
  readonly steps: readonly SceneStep[];
  /** focus() writes, ascending atSec; `ref: null` is an explicit clear. */
  readonly focus: readonly FocusStep[];
  /** fade() per address: the clip factor's segments in ascending startSec; a later segment supersedes the earlier one from its start. */
  readonly factors: Readonly<Partial<Record<VisibilityAddress, readonly FactorSegment[]>>>;
};

// src/@types/animation/compiledClip/SceneStep.d.ts  (renamed from SceneCue)
export type SceneStep = {
  readonly atSec: number;
  readonly effect: Extract<SceneEffect, { kind: 'show' | 'hide' | 'scene' | 'frameTo' }>;
};

// src/@types/animation/compiledClip/FocusStep.d.ts
export type FocusStep = { readonly atSec: number; readonly ref: SelectionRefBase | null };

// src/@types/animation/compiledClip/FactorSegment.d.ts
/** The factor ramps `from → to` over [startSec, endSec] on the fade controller's smoothstep curve. */
export type FactorSegment = {
  readonly startSec: number;
  readonly endSec: number;
  readonly from: number;
  readonly to: number;
};
```

> [!DECISION] Settings writes stay one ordered list, not a track per address
> A `scene(setGalaxyCatalogVisible(…))` and a `show(['survey:sdss'])` write the same field, and a bare per-item
> address fans over several, so the writes only compose in order through the settings reducer. A per-address
> track would need a field-level model of every action. Grouping steps by address is a view the studio can build.

### 1.2 Evaluating at t

Three pure functions, no clock, no store:

- **Steps applied at t:** every step with `atSec ≤ t` (a step at 0 applies on the arrival frame, as today).
- **The root view:** `sceneView(root, tracks, applied, focusRow)` returns a `RootState` whose `settings`,
  `selection` and `selectionRows` are the live ones with the applied steps folded in through the real reducers:
  - each step through `sceneActionsOf(effect, settings)` (show/hide → `setVisibilityActionsFor` writes, `scene` →
    its action, `frameTo` → `setOrientation(frame)`) and `settingsReducer`;
  - the last applied focus step through `selectionReducer` (`updateSelectionFocus(ref)`) and `selectionRowsReducer`
    (`setSelectionRow({ slot: 'focus', row, focusId })`). `applied` counts the steps and focus steps with
    `atSec ≤ t`; `focusRow` is the extracted row for the last applied focus step, passed as a value (the player
    extracts it once per focus crossing, never inside the view: the resolver may read the engine's getters, which
    read the view).

  No steps and no focus applied: the root itself, by identity. Folding through the reducers is the trick
  `computeSceneEntering` already uses (`src/state/tour/computeSceneEntering.ts:13-50`), so the overlay cannot drift
  from what the same actions would have done as dispatches.
- **The clip factor:** `clipFactorAt(segments, t)`: 1 before the first segment, the smoothstep ramp inside one,
  the last `to` after it. Compile computes each segment's `from` as the factor the previous segments reached at
  its start, and drops a `fade` whose `to` equals the value already targeted (the `FadeController.fadeTo` no-op,
  `src/services/animation/fadeController.ts:67-70`), so the look matches today.

`hide(a, over)` drops the switch at `atSec`, as today's write does; the fade registry ramps it out over `over`
(§2). The overlay holds the scene's **targets**. The animations between targets stay with the subsystems that
already animate user changes, which keeps load-arrival fades and the label envelope working (§2).

### 1.3 How each kind evaluates

| Kind | At t | What animates the change |
| --- | --- | --- |
| `show` / `hide` | switch on/off in `settings` from `atSec` | fade registry, over the step's `over` (default 600/100 ms) |
| `scene` | the action folded into `settings` | registry for any switch it moves, default durations; knobs (`flow`, `labels.focusedOnly`) are read per frame |
| `focus` | `selection.focus` + the focus row | `structureFocus` recession and the label producers, read per frame |
| `frameTo` | `settings.orientation` = `frame` from `atSec` | `camera.frameTween`, started from the live basis over `over` with `ease` |
| `fade` | `clipFactorAt` | nothing: the factor is pure, `resolveVisibilityOpacity` multiplies it in |

## 2. The player: evaluate, publish, end

`clipPlayer` stays the tick-phase shell (`runFrame.ts:73`, first statement). Per tick:

1. Advance the epoch as today and compute `t` (`t mod durationSec` for a looping clip, clamped to `durationSec`
   otherwise).
2. Count the applied steps and focus steps. The view is memoized on (root slices' identities, counts), so the
   engine's hundreds of getter reads per frame cost a few reference compares, and a fold runs only when a step is
   crossed or intent changes.
3. **Publish** each step crossed since the last tick, in time order, to the subsystem that animates it:
   `syncVisibilityTargets` against the view as of that step with the step's `overMs` (the call
   `watchFadesSaga` makes today, `src/services/engine/wiring/makeReconcileEffects.ts:22`), and for `frameTo` a
   `startFrameTween` from `liveUpBasisQuat(cameraRuntime)`, as `applySceneEffect` does today
   (`applySceneEffect.ts:63-72`). A backward jump (a loop wrap) publishes the difference with default durations.
4. `clipOpacityOf(address)` returns `clipFactorAt(tracks.factors[address], t)`.

Publication compares evaluated state with what was published. It never decides from "did the clock cross
`atSec`" alone: a skipped frame or a backward jump still lands on the scene at t. The last-published counts are
the player's private cache, written only in `tick`, read only in `tick`.

**At the end** (the natural-end latch or `stop()`), the play's `atEnd` decides:

- `'revert'`: drop the overlay, then publish the difference to intent with **default** durations: the registry
  fades layers back (600 ms in, 100 ms out), a frame roll goes back to intent's frame. The factor returns to 1.
- `'keep'`: before dropping the overlay, commit the view to intent in this tick: `mergeSnapshot(captureSettings(view))`,
  `updateSelectionFocus(viewFocus)` if the clip has focus steps, `setOrientation(viewFrame)` if it differs from
  intent. The view equals intent afterwards, so nothing is published and ramps in flight continue in the
  registry and the frame tween. The factor returns to 1 (fade has no intent home; no tour uses it).

`stop()` is the same with `t` = the stop instant, so a skipped beat keeps the steps it reached, as today.

The order inside the end tick is: commit (keep only), `clipEnded()`, then the end-resolver. Everything is
synchronous inside `tick`, before produce and render. No work is scheduled for a later frame.

### 2.1 Where the engine reads the view

`EngineState.settings`, `.selection` and `.selectionRows` are getters onto the store (`src/services/engine/engine.ts:129-140`),
read 108 times across 64 files. They, `runFrame`'s one store read (`runFrame.ts:87`, which feeds
`stepCameraRuntime` and the pose basis at `:126`), `createLayers`' `settings` closure (`createLayers.ts:104`) and
`wireInput`'s two seeds (`wireInput.ts:85,93`) read one function, `readRoot()`, which returns
`clipPlayer.view(store.getState())`. Ground preparation creates that seam first (§8).

Readers that keep reading intent, by design: sagas (`select`), React selectors, URL rows, the remote status, and
the snapshot capture. That is the overlay contract: the user's own settings stay the user's.

## 3. Composition

### 3.1 Tours chain clips with `keep`

A beat is an optional enter clip then a dwell clip, both through `playClip` (`visitBeatSaga.ts:103-128`,
`pausableDwellSaga.ts:87-98`), and beats rely on each other's scene by design: `openingTitle` strips layers "for the
whole tour", `cosmicWeb`'s layers "stay lit for the rest of the web section", `webShowcase` beat 3 needs beat 2's
Virgo focus, the frame ladder holds `supergalactic` from `approachM31` to `homeAgain` (`frameLadder.test.ts:98`).
Under plain revert, an enter clip's scene would vanish during its own dwell.

The tour passes `atEnd: 'keep'` on both call sites. Each clip's end scene lands in intent in the tick the clip ends,
inside the tour's `withSceneSnapshotSaga` bracket, which restores the user's scene at exit as today. The enter clip's
last step can still be ramping (`cosmicFlows`' `show(['flow'], 4)` at the enter clip's end, which the dwell's
opening `wait(5)` is timed to cover): the registry carries the ramp across the seam because the commit leaves its
target unchanged.

`computeSceneEntering`'s per-beat merge (`tourBodySaga.ts:118-120`) stays as the skip/Prev/range correction. It
folds unresolved beat clips in written order, so `validateSeqCueOrder` (rule 6) keeps guaranteeing that written
order and time order agree, now over steps. Both folds share `sceneActionsOf`.

A dwell paused and resumed replays from t = 0 (`pausableDwellSaga.ts:85-87`). Its cancel committed what it reached,
so the replay re-applies targets intent already holds: no visible change, as today.

### 3.2 `withSceneSnapshotSaga`

Unchanged. Tours and exhibits capture intent before the body and restore it in `finally`. On an exit mid-clip the
race cancels `playClip`, `stop()` runs (committing under `keep`), then the restore puts the snapshot back. Captures
now see the user's scene only, never a standalone clip's leftovers.

### 3.3 Standalone clips, the inspector replay, exhibits, the studio

`clipBodySaga` (`#clip=`, debug panel, remote, recorder hook), `watchReplayInspectedPathSaga` and
`exhibitBodySaga`'s `flyToPoseClip` pass `'revert'`. Exhibits' fly clips carry no scene steps, and exhibits write
their own scene as intent inside the bracket (`exhibitBodySaga.ts:50-53`): unaffected. The studio plays nothing
in slice 1. S4's preview plays with `'revert'`.

## 4. Behaviour changes users will see

1. **`cosmicFlows` (standalone) reverts.** Today it leaves cosmic-web density and filaments and famous-galaxy labels
   hidden and the flow field on. After S3, at its end the web layers and labels fade back in (600 ms) and flow fades
   out (100 ms). Accepted in Q2.
2. **`earthCosmicWebLoop` gives the labels back on stop.** Its `hide(['labels'], 0)` at t = 0 held every lap and
   stayed after `stop()`; now the labels return when it stops.
3. **Tour beat clips played standalone revert** (`tourXxx` from the debug panel, `#clip=`, the remote, a recorder
   clip take): layers, focus and the orientation frame return to the pre-clip state; the frame rolls back over the
   default roll duration.
4. **During any clip, the panel, the remote deck and the URL show the user's own settings, not the clip's.** The
   layer switches no longer flip as a clip plays; focus and orientation no longer write the hash mid-clip. A layer
   toggled mid-clip changes intent under the overlay: an address the clip has written keeps the clip's value until
   the clip ends.
5. **Tours publish at clip ends instead of at cue times.** The picture is the same; the hash, the remote's switch
   rows and the panel update when each beat clip ends (its `keep` commit) instead of at each cue.
6. **Recorder clip takes.** The last captured frame of a take can show the start of the revert, as it shows the
   factor reset today (`tools/record/README.md:182-190`).

Not changed: `cosmicFlows` beat D (its fade sits at `atSec === durationSec`) still never reaches a drawn frame; its
backlog item stands.

## 5. Risks

> [!RISK] An engine read that bypasses `readRoot()` silently ignores the overlay
> The scene would play in some subsystems and not others, and no existing test notices. A convention test fails on
> any `getState()` read of `settings`, `selection` or `selectionRows` under `src/services/engine` and `src/layers`
> outside the seam. This is the riskiest part of S3.

> [!RISK] A reducer that drops a folded action
> An action outside `settingsReducer`'s cases (the `extraReducers` silent-drop landmine) would evaluate as a no-op.
> The evaluator test asserts each kind's effect on the view, `frameTo`'s orientation included.

> [!RISK] Shared mutable output: the memoized view
> One writer (`tick`), one cache, readers only through `readRoot()`. Sagas read intent and must keep doing so; §2.1
> names the readers the overlay deliberately does not reach.

> [!RISK] The view must never call back into the engine's getters
> The getters read the view, so anything `sceneView` calls that reads them would recurse. The fold takes plain
> values only: the focus row is extracted in `tick` and handed in.

> [!RISK] A `keep` commit's focus must not fly the camera
> A `keep` commit dispatches `updateSelectionFocus` while the clip is still active. On a natural end
> `suspendDuringClip` keeps `watchFocusTweenSaga` parked; a play cancelled from a saga reaches the workers only after
> `clipEnded`, past that guard, so the commit dispatches the focus as a `'cut'`. Focus steps no longer dispatch.

Smaller: publication happens in `tick`, before `fades.tick(nowMs)` (`runFrame.ts:260`), so a ramp starts on the
previous frame's stamp. That is today's skew too. The view memo keys on store slice identities, which change on
every write to those slices: correct, never stale.

### 5.1 Entanglement check (radar over this spec)

- *A mode flag in the player (`atEnd`).* One discriminant, read in one place (the end path that natural end and
  `stop()` share). It is a property of the play, not of the clip, so it does not braid authoring with composition.
- *`keep` commits switches but not `fade`.* Not a special case: `keep` commits the view to intent, and a `fade`
  has no intent field. One sentence in the ADR, no branch.
- *Two triggers into the visibility sync* (`watchFadesSaga` on intent writes, the player on step crossings). Both
  compute against the same view through `readRoot()`, so a user toggle mid-clip and a step agree. No mirror.
- *Two folds* (`computeSceneEntering` over unresolved beats in written order, `sceneView` over compiled steps in
  time order). Both use `sceneActionsOf` and the real reducer; rule 6 keeps their orders agreeing. Unifying them
  waits on compiling unresolved clips (adjacent finding).
- *Transitions outside the overlay.* Deliberate: the overlay owns targets, the existing subsystems own ramps, as
  they do for user changes. S4 seeds them on a seek instead of growing a second ramp engine.

## 6. Perf

Per frame while a clip plays: two cursor advances (O(1) forward, binary search after a jump), a memo check on every
getter read, and one segment lookup per `clipOpacityOf` call (today a `Map` lookup plus a controller read). A fold
(at most ~30 actions through Immer) runs only on a step crossing or an intent write. With no clip, the getter adds
one function call and one null check.

Price it with the harness, before (on the ground-prep HEAD) and after, on this worktree's own server:
`npm run perf -- --url http://localhost:<port>` and `npm run perf:cpu -- --url http://localhost:<port>`, all
scenarios. Those poses play no clip, so they price the always-on part: the getter indirection and the
`clipOpacityOf` path inside `resolveVisibilityOpacity` (4 call sites, every faded pass). The clip-on part costs
per crossing, not per frame, so it gets no scenario (Decision 5).

## 7. What S4 builds on

- `sceneView` (with the counts at `t`) and `clipFactorAt(segments, t)` take any `t`, with no history.
- A seek publishes by **seeding** instead of ramping: for each address a step touched, `setImmediate` the registry
  to its value at `t`, then `fadeTo` the target over the remaining ramp; for a `frameTo` mid-roll, a frame tween
  whose `fromQuat` is the slerp at `t`. Steps carry `atSec`, `over` and `ease`, which is everything the seed needs.
  S3 does not build the seed.

## 8. Ground preparation

Ideal diff: a `scene` field on `CompiledClip`, three pure evaluators, the player's tick rewritten against them,
one line in the engine's root read, one `atEnd` value through `playClip`. The incumbent structure forces two
special cases that the prep removes. The greenfield cross-check (a fresh agent given only the requirements) agreed
on step tracks, the tri-state focus, level-triggered change publication and the loop rule; its divergences are
priced below.

**Contracts that change**

| Contract | Change | Reach (counted) |
| --- | --- | --- |
| `CompiledClip.cues: SceneCue[]` → `scene: SceneTracks` (`CompiledClip.d.ts:90`) | breaking, compile-internal | 6 files import `SceneCue` (grep `SceneCue`); `compileClip.test` reads `.cues` (12 hits) |
| `SagaContext.playClip(clip, frame)` → `(clip, frame, atEnd)` (`src/store/types.ts:179`) | breaking | 5 call sites (`clipBodySaga`, `visitBeatSaga`, `pausableDwellSaga`, `exhibitBodySaga`, `watchReplayInspectedPathSaga`) plus the test harness |
| `camera.clip` = `{ data, frame }` → `{ data, frame, atEnd }` (`cameraSlice.ts:79-81`) | additive | `clipStarted` dispatchers: `playClip.ts:48`, `replayInput.ts:119` |
| `ClipPlayer.clipOpacityOf(address, nowMs)` → `(address)`; `+ view(root)` | narrowing + additive | 4 call sites of `clipOpacityOf` in 2 files; 18 test files stub it |

**Prep, in order (each its own commit, before the feature, both riding the S3 feature PR: Decision 6)**

1. **One root read for the engine.** Bolt-on removed: without it, the overlay has to be added separately at the
   three getters, `runFrame`'s `stored` (`runFrame.ts:87`), `createLayers`' closure (`createLayers.ts:104`) and
   `wireInput` (`wireInput.ts:85,93`), and any read added later bypasses it. Prep: an engine-owned
   `readRoot = () => store.getState()` that all of those call, plus the convention test from §5. No behaviour
   change.
2. **`sceneActionsOf` out of `computeSceneEntering`.** Bolt-on removed: the overlay fold would be the second copy of
   the private `actionsOf` (`computeSceneEntering.ts:24-36`), the second special case. Prep: move it to
   `src/utils/animation/sceneActionsOf.ts` and add the `frameTo → setOrientation(frame)` arm. The tour fold's output
   is unchanged because `captureSettings` drops `orientation`, so the fold needs no flag.

**Growth (plain additions):** the three evaluators, `SceneTracks` and its step types, `ClipSceneEnd`, the ADR.

**Weighed against the greenfield shape**

- *Affine overlay values (`k·intent + c`) with the overlay owning every ramp.* Rejected: the fade registry already
  owns visibility ramps and gates them on data arrival (`visibilityTargetOf.ts:16-28`, ADR 0001, ADR 0012). A second
  ramp engine would lose the load-arrival fade for clip-shown layers and duplicate the label envelope. Cost of our
  choice: ramps are seeded, not evaluated, on a seek (S4).
- *A tour compiled into one concatenated scene.* Rejected: beats wait on foci and settle, skip, step back and pause,
  so a tour is not one timeline. Cost of our choice: the `atEnd` value and an intent commit at each seam, inside
  the snapshot bracket.
- *A step track per setting key.* Rejected for aliasing (§1.1 decision).
- Left alone: `computeSceneEntering`'s separate fold. It folds unresolved beats, which cannot be compiled yet.
  Unifying it with the compiled fold is an adjacent finding (backlog), not prep.

**Adjacent findings (backlog by default):** the tour fold could evaluate compiled tracks if `compileClip` accepted
`stubResolveClipFoci`-style placeholders, which would retire `validateSeqCueOrder`; `fadeController.ts` keeps a
private `smoothstep` beside `src/utils/math/smoothstep.ts`.

## 9. Decisions

Ruled by the owner on 2026-11-10 (grill session Q48–Q53).

1. **Tours keep each clip's end scene; every other play reverts.** Q2 says a clip never writes intent; under `keep`
   the player writes it on the tour's behalf, in the tick the clip ends, inside the tour's snapshot bracket.
   **Ruling:** `atEnd: 'keep'` at `visitBeatSaga` and `pausableDwellSaga`, `'revert'` at the other call sites.
   Rejected: the tour folding the clip into intent after `playClip` resolves (one rendered frame of reverted scene
   that reaches asset demand), and a tour compiled as one timeline (§8).
2. **The panel, remote and URL show intent during a clip** (behaviour change 4). **Ruling: accepted.** Rejected:
   publishing the view into Redux, a mirror of state that has a home.
3. **Revert durations at a standalone clip's end.** **Ruling: the defaults**, registry 600 ms in and 100 ms out, the
   1 s frame roll (`FRAME_TWEEN_MS`). No snap.
4. **`atEnd` at `playClip`.** **Ruling: required at every call, no default**: five call sites, each one states what
   happens to the scene.
5. **A perf scenario that plays a clip.** **Ruling: none.** The clip-on cost is per step crossing and bounded; the
   harness prices the always-on part.
6. **Prep packaging.** **Ruling: both prep commits ride the S3 feature PR**, each its own commit, first.
