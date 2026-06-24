# Animation clip model — Plan A (Layer 1, smallest surface)

> **Scope.** Plan A of the three-plan decomposition in
> [`2026-06-19-animation-system-design.md`](../specs/2026-06-19-animation-system-design.md)
> (Open-decision #5, item A). Builds Layer 1 end-to-end on the smallest surface:
> the `Effect`/`ClipData` data model + authoring helpers, the pure `evaluateClip`
> evaluator (closed-form `∫vel`), the `camera.clip` store Intent, the `clip`@95
> driver row, the `clipPlayer` Resource (scene cues + lifecycle), and the
> **flyout** spike re-expressed as a clip to validate against known-good footage.
>
> **Out of scope (named seams only — Plans B & C build them).**
> - Plan B folds `evaluateTween` INTO `evaluateClip` (focus tween = the
>   one-segment case), adds `playClip(clip): Promise<void>`, and owns
>   `suspendDuringClip` (the per-action guard that parks `watchFocusTween` while
>   ANY clip plays — Layer 1, not tour-specific).
> - Plan C builds the tour saga, `BeatData`, `visitBeat`/`guidedTour`,
>   `captureScene`/`restoreScene`, and the tour clip builders — it CONSUMES the
>   `clipOpacity` channel AND the whole scene vocabulary this plan owns.
>
> **This plan owns the ENTIRE scene vocabulary** (`SceneEffect`, the five
> `show`/`hide`/`fade`/`scene`/`focus` constructors, the `applySceneEffect`
> verb→side-effect table `clipPlayer` runs, and the `show`/`hide` fade-duration
> override on `syncVisibilityFades`). The recording spikes call `playClip` with no
> saga and use all five verbs, so "anything a saga-less recording clip uses is
> Layer 1" puts the scene vocabulary here. Plan C only CONSUMES it.
>
> **Plan A owns the entire `clipOpacity` mechanism.** `clipOpacity` is a
> transient, non-reactive, `clipPlayer`-owned channel = pure Layer 1 (the spec's
> "first implementation slice" lists `fade` among Plan A's primitives). This plan
> builds: the channel factory, the `fade()` Layer-1 primitive that writes it, the
> `FadeId → VisibilityLayerKey` lookup bridge, the `resolveLayerOpacity` third
> factor + its six consumer call sites, the reset-to-1 on clip end, and the public
> accessor `clipPlayer.clipOpacityOf(layer, nowMs)` the renderer + Plan C read.
> Plan C never constructs the channel, never touches `resolveLayerOpacity`, and
> never owns `fade()`.
>
> Keep the shared-contract names EXACT (see "Cross-plan contract" below) so B & C
> compose without renames.

## Goal

A scripted camera+scene animation can be authored as a **serializable typed TS
object** (`ClipData`), started with `startClip(data)`, and played by the engine:
the camera pose is a **pure** function of `(data, elapsedSec)` evaluated on a
`clip`@95 driver row, and the timeline's scene cues fire edge-triggered from a
frame-ticked `clipPlayer`. The flyout spike, re-expressed as a `ClipData`,
reproduces the known-good log-dolly footage with zero hand-rolled clock or
`keydown` state machine.

## Architecture

Layer 1 splits a clip into two facets that meet at the store
(`camera.clip.data`), mirroring the shipped focus tween
(`cameraDrivers.ts:159-164`, `evaluateTween.ts`, `cameraSlice.ts:81-86`):

```
authoring helpers ──build──▶ ClipData (serializable)
                                  │  startClip(data) resolves start:'live' → concrete Pose
                                  ▼
                          camera.clip: { data } | null   (cameraSlice Intent)
                            │                       │
        clip@95 driver row ─┘                       └─ clipPlayer.tick(nowMs)  [Resource]
        pose: (s,_,elapsed) =>                          fires show/hide/fade/scene/focus cues
          evaluateClip(s.camera.clip.data, elapsed)     edge-triggered; dispatches endClip()
        commitsOnEdge: true                             OWNS clipOpacity channel
                            │                                       │
        runCameraDrivers ───┘                    resolveLayerOpacity × clipOpacityOf(layer)
                            ▼
                  CameraPose → commit-on-edge bakes final pose into camera.base
```

### The `clipOpacity` key space (pinned ONCE here)

`clipOpacity` is keyed by **`VisibilityLayerKey`**
(`src/@types/animation/VisibilityLayerKey.d.ts`) — the SAME intent-addressing
vocabulary `fade(['flow','galaxies'])` / `show` / `hide` name layers in, and the
SAME key `syncVisibilityFades(only?)` takes (`syncVisibilityFades.ts:125`). So a
`fade()` cue's layer names map straight onto the channel with no translation.

The renderer-side lookup, though, runs inside `resolveLayerOpacity`, whose `h`
is a **`FadeId`** (`focusRecession.ts:48,112-118`) — the registry vocabulary, a
*different* coordinate space (`VisibilityLayerKey.d.ts:6-30` documents the two
vocabularies and that they bridge "at exactly one place"). The third-factor
lookup therefore needs a pure `FadeId → VisibilityLayerKey` map. Because Plan A
builds the channel AND threads the third factor, that bridge
(`fadeIdToVisibilityKey`) is **Plan A's** (Task 12) — it is the inverse, over
`FadeId['kind']`, of the `FadeLayer.handle()` mapping. A `FadeId` with no clip
layer (e.g. `scaleBar`, `overlay`) maps to `undefined` ⇒ factor **1** (never
clip-faded). The channel holds one private `FadeController` per
`VisibilityLayerKey`, default 1, the exact shape `structureFocusSubsystem`
uses (`structureFocusSubsystem.ts:35,69`).

Two mechanisms, never braided:
- **Across drivers (the table) — arbitration.** The clip contributes ONE pose;
  highest-priority active driver wins (`cameraDrivers.ts:62-71`). `clip`@95 >
  `orbitDrag`@80, so a clip owns the camera while it plays.
- **Within a clip (the evaluator) — composition.** Per-channel
  `base + ∫vel + osc` sum, a **pure** function of `(data, elapsedSec)`. Single-writer
  on `base` only; `vel`/`osc` additive. Validated at registration time (static tree).

The pose carries **no per-frame accumulator** — `∫vel` is closed-form, so the
motion is frame-rate-independent and the evaluator is a pure `(data, t)` read.
`start:'live'` is resolved to a concrete `Pose` at `startClip` dispatch (read off
`cameraRuntime.lastPose.current`), exactly as `focusTweenSaga.ts:43-46` bakes the
tween `from` before `startCameraTween`.

## Tech stack

TypeScript + Vitest. No new runtime deps. RTK slice (inline Immer) for the store
Intent. The driver table, `CameraClock`, `FadeController`, and the
`resolveLayerOpacity` composition line already exist — Plan A extends them.

## Global constraints

- `type` aliases, never `interface`. One exported TYPE per file under
  `src/@types/<area>/`; deep relative imports, no barrels. One exported FUNCTION
  per file under `src/utils/`; filename = symbol name. (`evaluateClip` lives in
  `src/services/engine/camera/` next to `evaluateTween.ts`, not `utils/` — it is a
  camera-domain function, matching where `evaluateTween` lives.)
- `Vec3` from `src/@types/math/Vec3`, never raw tuples. `Pose = CameraPose`
  (`src/@types/camera/CameraPose.d.ts`).
- Didactic comments (why + the alternative), matching existing module headers.
- Tests mirror `src/` under `tests/`. TDD: failing test → run (fails) →
  implement → run (passes) → commit. Stage SPECIFIC paths (never `git add -A`);
  commit trailer `Co-Authored-By: Claude Opus 4.8 (1M context) <noreply@anthropic.com>`.
- The clip-joins-the-clock change is a **required triple** (spec
  "The clip driver is the focus tween, generalized"): (1) `clipStartMs` +
  `lastClipRef` on `CameraClock`, (2) `clipElapsed(...)` keyed on `camera.clip`
  reference identity, (3) a third arm in `elapsedForWinner`. Omit any one and the
  default-0 fallthrough freezes the clip at `t=0` with no error. Tasks 7–9 land
  all three; the integration test (Task 11) gates on it.

## Cross-plan contract (names B & C depend on — keep EXACT)

| Symbol | Shape | Home |
| --- | --- | --- |
| `ClipData` | `{ start?: Pose \| 'live'; preroll?: number; timeline: Effect[] }` | `src/@types/animation/ClipData.d.ts` |
| `Pose` | `= CameraPose` (`{ target: Vec3; yaw; pitch; distance }`) | existing |
| `evaluateClip` | `(data: ClipData, elapsedSec: number) => CameraPose` PURE | `src/services/engine/camera/evaluateClip.ts` |
| `camera.clip` | `{ data: ClipData } \| null` Intent | `cameraSlice` |
| actions | `startClip(data: ClipData)` / `endClip()` | `cameraSlice` |
| driver row | `id:'clip'`, `priority:95`, `commitsOnEdge:true` | `cameraDrivers.ts` |
| `clipPlayer` | Resource with `tick(nowMs)`, `stop()`, `destroy()` | `src/services/engine/subsystems/clipPlayer.ts` |
| `clipPlayer.clipOpacityOf` | `(layer: VisibilityLayerKey, nowMs: number) => number` (default 1) — the clip-opacity factor the renderer + Plan C read | `clipPlayer.ts` |
| `SceneEffect` | `show \| hide \| fade \| scene \| focus` union (the ONE canonical declaration) | `src/@types/animation/SceneEffect.ts` |
| `fade` | `(layers: VisibilityLayerKey[], to, over) => SceneEffect` Layer-1 primitive that writes `clipOpacity` | `effectHelpers.ts` |
| `show`/`hide`/`scene`/`focus` | the other four `SceneEffect` constructors | `effectHelpers.ts` |
| `applySceneEffect` | `(effect: SceneEffect, deps) => void` — the verb→side-effect dispatch table `clipPlayer` runs in the tick phase | `clipPlayer.ts` (Task 11) |
| `syncVisibilityFades(…, durationMs?)` | the `show`/`hide` fade-duration-override seam — how a `show`/`hide` cue's `over` reaches the live bridge | `syncVisibilityFades.ts` |
| key space | `clipOpacity` is keyed by **`VisibilityLayerKey`**; renderer bridges its `FadeId` via `fadeIdToVisibilityKey` | this plan |

Plan B will add `playClip(clip): Promise<void>` and fold `evaluateTween` in;
Plan C builds the tour saga and CONSUMES the whole scene vocabulary
(`SceneEffect`, the five constructors, `applySceneEffect`, the duration override),
`clipPlayer.clipOpacityOf` + the `fade()` primitive — it never constructs the
channel and never redeclares a verb. Plan A leaves the B/B-only seams **named but
unbuilt**.

> **Settled boundary — the scene vocabulary is Layer 1.** The recording spikes
> (`cosmicFlows`, `webShowcase`) call `playClip` DIRECTLY with no tour saga, and
> they use `show`/`hide`/`fade`/`scene`/`focus`. Anything a saga-less recording clip
> uses is therefore Layer 1 = **Plan A**. So `SceneEffect`, its five constructors,
> the `applySceneEffect` verb→side-effect table, and the `show`/`hide`
> duration-override seam all live here. Plan C is PURELY the tour-orchestration
> layer (`BeatData`, `visitBeat`/`guidedTour`, capture/restore, tour clip
> builders) and consumes every one of these.

## File structure

New `@types` (one type per file):
```
src/@types/animation/
  ClipData.d.ts          ClipData
  Effect.d.ts            Effect (the serializable tagged union)
  CameraAction.d.ts      CameraAction (set | spin | rate | osc)
  SceneEffect.ts         SceneEffect (show | hide | fade | scene | focus) — the
                         ONE canonical home (hand-authored union, `.ts` per the
                         one-type-per-file convention; Plan C imports this, does
                         not redeclare)
  Channel.d.ts           Channel = 'distance' | 'yaw' | 'pitch' | 'target'
  Space.d.ts             Space = 'log' | 'add' | 'lin'
  Ease.d.ts              Ease = 'in' | 'out' | 'inOut' | 'linear'
  CompiledClip.d.ts      CompiledClip (flattened per-channel tracks + cue list)
  ClipOpacityChannel.d.ts  ClipOpacityChannel (the clip-owned opacity channel surface)
src/@types/engine/subsystems/
  ClipPlayer.d.ts        ClipPlayer (the Resource surface)
```

New source:
```
src/services/engine/animation/
  effectHelpers.ts       authoring constructors: tween/dollyTo/moveTarget/aimAt/
                         spin/rate/oscillate/hold/wait/show/hide/fade/scene/focus/
                         seq/all/fork  (one module — a cohesive vocabulary, like cameraClock.ts)
  channelSpace.ts        CHANNEL_SPACE record + spaceFor(ch); interpolation helpers (lerpInSpace)
  ease.ts                EASE: Record<Ease, (t)=>number>  (reuses easeOutCubic)
  compileClip.ts         flatten ClipData tree → CompiledClip (tracks + cues); registration-time validate
  validateSingleWriter.ts  enumerate base-writers, assert no per-channel [start,end) overlap
src/services/engine/camera/
  evaluateClip.ts        PURE (CompiledClip-or-ClipData, elapsedSec) → CameraPose
src/services/animation/
  applySceneEffect.ts    the show/hide/scene/focus verb→side-effect dispatch table
                         clipPlayer runs per cue in the tick phase (the fade arm is
                         clipPlayer's own — it writes the clipOpacity channel directly)
  visibilityActionRow.ts VISIBILITY_ACTION_ROW: Record<VisibilityLayerKey, (on)=>SettingsAction>
                         the layer→visibility-setting-action data table show/hide read
                         (inverse of FADE_ROW; a data table, never a branch chain)
src/services/engine/subsystems/
  clipPlayer.ts          createClipPlayer({ store, fades, requestRender }) → ClipPlayer
                         OWNS the clipOpacity channel; exposes clipOpacityOf;
                         dispatches each scene cue via applySceneEffect (the fade
                         arm it owns directly)
src/services/animation/
  clipOpacityChannel.ts  createClipOpacityChannel() → ClipOpacityChannel
                         (per-VisibilityLayerKey private FadeControllers, default 1)
src/services/engine/presentation/
  fadeIdToVisibilityKey.ts  pure FadeId → VisibilityLayerKey | undefined (clip lookup bridge)
src/data/animation/
  flyoutClip.ts          the flyout spike as a ClipData (validates the model)
```

Modified:
```
src/services/engine/wiring/syncVisibilityFades.ts  + optional durationMs override
  threaded through applyIntent + the public syncVisibilityFades (how a show/hide
  cue's `over` reaches the live bridge — Task 11)
src/state/camera/cameraSlice.ts           + clip field, startClip/endClip
src/@types/camera/CameraState.d.ts        + clip: { data: ClipData } | null
src/state/camera/selectors.ts             + selectCameraActive ORs clip; + selectClipActive
src/@types/engine/camera/CameraClock.d.ts + clipStartMs, lastClipRef
src/services/engine/camera/cameraClock.ts + clipElapsed
src/services/engine/camera/cameraDrivers.ts  + clip@95 row; + clip arm in elapsedForWinner
src/@types/engine/camera/CameraDriver.d.ts   + commitsOnEdge?: boolean
src/services/engine/frame/runFrame.ts     commit-on-edge reads commitsOnEdge; clipPlayer.tick first
src/@types/engine/handles/EngineSubsystemHandles.d.ts  + clipPlayer
src/services/engine/presentation/focusRecession.ts  resolveLayerOpacity gains the clipOpacity 3rd factor
  + the six resolveLayerOpacity / focusRecession consumers thread the clip channel:
    encodeVolumePrepass.ts, passes/filamentsPass.ts, produceStructureMarkers.ts,
    produceStructureLabels.ts, produceFamousLabels.ts (and the whole-layer caller)
```

---

## Task 1 — Channel / Space / Ease types + the one canonical CHANNEL_SPACE record

**Files:** `src/@types/animation/{Channel,Space,Ease}.d.ts` (new),
`src/services/engine/animation/channelSpace.ts` (new),
`src/services/engine/animation/ease.ts` (new),
`tests/services/engine/animation/{channelSpace,ease}.test.ts` (new).

**Interfaces.**
- Consumes: `easeOutCubic` (`src/utils/math/easeOutCubic.ts`), `lerp`, `Vec3`.
- Produces:
  - `Channel = 'distance' | 'yaw' | 'pitch' | 'target'`
  - `Space = 'log' | 'add' | 'lin'`
  - `Ease = 'in' | 'out' | 'inOut' | 'linear'`
  - `CHANNEL_SPACE: Record<Channel, Space>` — `distance→'log'`, `yaw→'add'`,
    `pitch→'add'`, `target→'lin'` (spec "Channels and value spaces" table; ONE
    home, read by helpers AND validator — never restated).
  - `lerpInSpace(space: Space, from: number, to: number, t: number): number` —
    `log` ⇒ `exp(lerp(ln from, ln to, t))`; `add`/`lin` ⇒ `lerp`. (Vec3 `target`
    is component-wise `lin` at the call site; this scalar helper is per-component.)
  - `EASE: Record<Ease, (t: number) => number>` — `out` ⇒ `easeOutCubic`;
    `in` ⇒ `t³`; `inOut` ⇒ smootherstep/`t<.5 ? 4t³ : 1-…` (cubic in-out);
    `linear` ⇒ identity. Each clamps `t` to `[0,1]`.

- [x] `channelSpace.test.ts`: `CHANNEL_SPACE maps distance→log, angles→add, target→lin`.
- [x] `channelSpace.test.ts`: `lerpInSpace log gives geometric midpoint` — assert
  `lerpInSpace('log', 1, 100, 0.5)` ≈ `10`.
- [x] `channelSpace.test.ts`: `lerpInSpace add is plain lerp` — `lerpInSpace('add', 0, 2, 0.5) === 1`.
- [x] `ease.test.ts`: `EASE.out matches easeOutCubic`, `EASE.in is t³ (in(0.5)===0.125)`,
  `EASE.inOut is symmetric (inOut(0.5)===0.5, inOut(0.25)+inOut(0.75)===1)`,
  `EASE.linear is identity`, and `each clamps t outside [0,1]`.
- [x] Implement (didactic header on `channelSpace.ts`: the single-home rationale).
- [x] `npm test -- channelSpace ease` → pass. Commit.

## Task 2 — Effect / CameraAction / SceneEffect serializable union types

**Files:** `src/@types/animation/{CameraAction,Effect}.d.ts` (new),
`src/@types/animation/SceneEffect.ts` (new — the ONE canonical `SceneEffect`
declaration; `.ts` per one-type-per-file for a hand-authored union, NOT `.d.ts`).
No test (pure type declarations — exercised by Task 3's helper tests).

**Interfaces.**
- Consumes: `Channel`, `Ease`, `Space`, `Vec3`, `CameraPose`,
  `VisibilityLayerKey` (`src/@types/animation/VisibilityLayerKey.d.ts`, the
  `show`/`hide`/`fade` layer key). `focus` uses the
  EXISTING `SelectionRef` (`src/@types/engine/SelectionRef.d.ts`). `scene` must NOT
  widen to `AnyAction` (spec "Scene effects") — but **there is no named
  `SettingsAction` union today** (verified: the settings action creators live in
  `src/state/settings/settingsSlice.ts` without a union alias). **Decision:**
  introduce a `SettingsAction` type alias = `ReturnType<typeof setX>` over the
  settings-slice creators the clips actually use (start minimal — whatever the
  flyout + cosmicFlows examples dispatch), in its own `.d.ts` if it grows; cite
  `settingsSlice.ts` for the creator set. Plan C widens it as the tour needs.
- Produces (spec "the effect vocabulary" + "CameraAction" block ll.426-431):
  - `CameraAction =`
    `{ kind:'set'; ch: Channel; to: number; over: number; ease: Ease; space: Space }`
    `| { kind:'spin'; ch: Channel; by: number; over: number; ease: Ease; loop?: boolean }`
    `| { kind:'rate'; ch: Channel; to: number; over: number; ease: Ease }`
    `| { kind:'osc'; ch: Channel; amp: number; period: number }`.
    NOTE: `target` is a Vec3 channel — `moveTarget` emits THREE `set` actions
    (`target.x/y/z` as sub-channels) OR a single `set` carrying a `Vec3` `to`.
    **Decision (resolve here):** add a `setVec` arm
    `{ kind:'setVec'; ch:'target'; to: Vec3; over; ease; space:'lin' }` so the
    one Vec3 channel stays one action (spec: "one vec3 channel, component-wise
    lerp"). Scalar `set` covers `distance/yaw/pitch`.
  - `SceneEffect =`
    `{ kind:'show'; layers: VisibilityLayerKey[]; over?: number }`
    `| { kind:'hide'; layers: VisibilityLayerKey[]; over?: number }`
    `| { kind:'fade'; layers: VisibilityLayerKey[]; to: number; over: number }`
    `| { kind:'scene'; action: SettingsAction }`
    `| { kind:'focus'; ref: SelectionRef | null }`.
    (`layers` are keyed by `VisibilityLayerKey`
    (`src/@types/animation/VisibilityLayerKey.d.ts`) — the SAME intent-addressing
    vocabulary the `clipOpacity` channel (Task 11) and `syncVisibilityFades(only?)`
    use, so `fade()`'s names write the channel with no translation. The spike's
    `'flow'|'galaxies'|'volumes'|'filaments'|…` strings are these keys — `survey`
    covers galaxy catalogs; flag if a spike layer has no `VisibilityLayerKey`. This
    `SceneEffect.ts` is the ONE canonical home — Plan C imports it and does NOT
    redeclare it.)
  - `Effect =` `CameraAction | SceneEffect`
    `| { kind:'hold'; sec: number } | { kind:'wait'; sec: number }`
    `| { kind:'seq'; children: Effect[] }`
    `| { kind:'all'; children: Effect[] }`
    `| { kind:'fork'; child: Effect }`.

- [x] Write the three `.d.ts` with didactic headers (every effect is plain
  serializable data; helpers in Task 3 are the only constructors).
  *(landed as four files — `SettingsAction` got its own `.d.ts`, one type per file.)*
- [x] `npm run typecheck` → clean. Commit.

## Task 3 — Authoring helpers (the one-line constructors)

**Files:** `src/services/engine/animation/effectHelpers.ts` (new),
`tests/services/engine/animation/effectHelpers.test.ts` (new).

**Interfaces.**
- Consumes: the Task 2 unions, `CHANNEL_SPACE` (Task 1) for default `space`,
  `Vec3`, `Pose`/`CameraPose`.
- Produces (spec "the effect vocabulary" + worked examples ll.234-353):
  - `tween(ch, { to, over, ease?, space? }): CameraAction` — scalar `set`;
    `space` defaults from `CHANNEL_SPACE[ch]`, `ease` defaults `'inOut'`.
  - `dollyTo(mpc: number, over: number, ease?: Ease): CameraAction` —
    `tween('distance', { to: mpc, over, ease })` (space resolves to `'log'`).
  - `moveTarget(to: Vec3, over: number, ease?: Ease): CameraAction` — `setVec` on `target`.
  - `aimAt(bearing: { yaw: number; pitch: number }, over, ease?): Effect` — an
    `all([ set('yaw',…), set('pitch',…) ])` (shortest-arc handled in evaluate).
    *(Open decision #3 — interpolation: use shortest-arc angular lerp via
    `lerpAngleShortest` for `yaw`; `pitch` plain. Quaternion slerp deferred.)*
  - `spin(ch, { by, over, ease?, loop? }): CameraAction`.
  - `rate(ch, { to, over, ease? }): CameraAction`.
  - `oscillate(ch, { amp, period }): CameraAction`.
  - `hold(sec): Effect`, `wait(sec): Effect`.
  - `show(layers, over?): SceneEffect`, `hide(layers, over?): SceneEffect`,
    `fade(layers, to, over): SceneEffect`, `scene(action): SceneEffect`,
    `focus(ref): SceneEffect`.
  - `seq(children): Effect`, `all(children): Effect`, `fork(child): Effect`.

- [x] `dollyTo fills space:'log' from CHANNEL_SPACE` — assert
  `dollyTo(300, 4)` ⇒ `{ kind:'set', ch:'distance', to:300, over:4, ease:'inOut', space:'log' }`.
- [x] `tween override space wins` — `tween('distance',{to:5,over:1,space:'lin'}).space==='lin'`.
- [x] `spin carries loop flag` — `spin('yaw',{by:6.28,over:30,loop:true}).loop===true`.
- [x] `oscillate has no over/ease` — shape assertion `{kind:'osc',ch:'pitch',amp,period}`.
- [x] `all/seq/fork wrap children with the right kind`.
- [x] `moveTarget emits a single setVec on target` — `moveTarget([1,2,3],5).to` deep-equals `[1,2,3]`.
- [x] Implement. `npm test -- effectHelpers` → pass. Commit.

## Task 4 — `compileClip`: flatten the tree to per-channel tracks + a cue list

**Files:** `src/@types/animation/CompiledClip.d.ts` (new),
`src/services/engine/animation/compileClip.ts` (new),
`tests/services/engine/animation/compileClip.test.ts` (new).

The flatten the evaluator and the cue-firer both read (spec ll.456-459: "flattens
the `ClipData` tree once into the per-channel tracks the evaluator reads … the
same flatten the registration-time validator does — memoised on the clip's
identity"). One walk: assign every leaf an absolute `[startSec, endSec)` window
(`seq` accumulates, `all` children share the block start, `fork` child runs from
block start and is cancelled at block end), splitting camera-actions into
`base`/`vel`/`osc` tracks per channel and scene-effects into a time-ordered cue
list. `preroll` shifts all windows by `preroll` seconds.

**Interfaces.**
- Consumes: `ClipData`, `Effect`, `Channel`, the Task 2 unions.
- Produces:
  - `CompiledClip = {`
    `  start: CameraPose;`            // concrete (start:'live' already resolved)
    `  durationSec: number;`          // span of the AWAITED (non-fork) tree
    `  baseTracks: Record<Channel, BaseSegment[]>;`  // ordered, non-overlapping
    `  velTracks: VelRamp[];` `oscTracks: OscTrack[];`
    `  cues: SceneCue[];`             // { atSec: number; effect: SceneEffect }, time-ordered
    `}` — exact sub-shapes (`BaseSegment`, `VelRamp`, `OscTrack`, `SceneCue`) live
    in this same `.d.ts` (they are internal compile output, not cross-plan API;
    one-type-per-file applies to PUBLIC types — keep the file's didactic header
    explicit that these are private compile artifacts).
  - `compileClip(data: ClipData): CompiledClip` — pure; throws via
    `validateSingleWriter` (Task 5) on a base-writer clash.

- [x] `compileClip seq accumulates windows` — `seq([dollyTo(300,4), hold(3), dollyTo(950,4)])`
  ⇒ base `distance` segments at `[0,4)`, gap `[4,7)`, `[7,11)`; `durationSec===11`.
- [x] `compileClip all shares block start` — `all([dollyTo(300,4), spin('yaw',{by:1,over:4})])`
  ⇒ both windows `[0,4)`; `durationSec===4`.
- [x] `compileClip routes rate→velTracks, oscillate→oscTracks, set/spin→baseTracks`.
- [x] `compileClip preroll shifts every window by preroll` — `preroll:2` ⇒ first
  segment starts at `2`, `durationSec` includes the 2 s hold.
- [x] `compileClip orders cues by atSec` — a `hide(...,0)` then a later `fade(...)`
  ⇒ `cues[0].atSec===0`, ascending.
- [x] `compileClip ignores fork duration in durationSec` — a perpetual `fork(spin(loop))`
  does NOT extend `durationSec` (spec: a fork never keeps a scope alive).
- [x] Implement. `npm test -- compileClip` → pass. Commit.

## Task 5 — `validateSingleWriter`: registration-time base-writer clash check

**Files:** `src/services/engine/animation/validateSingleWriter.ts` (new),
`tests/services/engine/animation/validateSingleWriter.test.ts` (new).
Called by `compileClip` (Task 4) — wire the call after both land.

**Interfaces.**
- Consumes: `CompiledClip['baseTracks']` (the per-channel ordered segments).
- Produces: `validateSingleWriter(baseTracks: Record<Channel, BaseSegment[]>): void`
  — enumerates each channel's segments, asserts no two `[start,end)` overlap, and
  on a clash THROWS naming both actions + windows (spec "Enforcement —
  registration-time validation"). Complete over dynamically-built/forked timelines
  (a static-tree walk), which compile-time schemes can't see.

- [x] `validateSingleWriter passes for sequential ramps on one channel` —
  `seq([dollyTo(300,4), dollyTo(950,4)])` compiles without throw.
- [x] `validateSingleWriter throws on two overlapping base-writers` —
  `all([dollyTo(300,4), dollyTo(950,4)])` throws, message names `distance` and
  both windows `[0,4)`.
- [x] `validateSingleWriter allows base+vel+osc on one channel` — a `set('yaw')` +
  `rate('yaw')` + `oscillate` ('yaw') do NOT clash (different layers).
- [x] Wire `compileClip` to call it; add `compileClip throws on a base clash`.
- [x] `npm test -- validateSingleWriter compileClip` → pass. Commit.

## Task 6 — `evaluateClip`: the pure per-channel `base + ∫vel + osc` evaluator

**Files:** `src/services/engine/camera/evaluateClip.ts` (new),
`tests/services/engine/camera/evaluateClip.test.ts` (new).

Shaped like `evaluateTween.ts` — pure, no mutation, fresh `CameraPose` out, fresh
`target` array (never alias). Composes the three layers (spec "Composition"):

```
final[ch] = base[ch](t)  +  ∫₀ᵗ vel[ch]  +  osc[ch](t)
```

- `base[ch](t)`: find the active `BaseSegment` for channel `ch` at `t`; ease via
  `EASE[seg.ease]`, interpolate via `lerpInSpace(seg.space, from, to, eased)`.
  Before the first segment ⇒ `start[ch]`; after the last ⇒ its `to` (held).
  `yaw` uses `lerpAngleShortest` (Task 3 `aimAt` note). `target` is component-wise.
- `∫vel[ch]`: a `rate` ramps velocity `0→to` over `[s, e)` (eased), then HOLDS
  `to` after `e`, all WITHIN the clip. Closed form: the integral of the eased ramp
  over `[s, min(t,e)]` plus `to·max(0, t-e)`. For `ease:'linear'` the ramp
  integral is `½·to·(min(t,e)-s)`; for the eased case integrate `to·EASE((u-s)/(e-s))`
  analytically per ease, OR (acceptable) a fixed-step closed quadrature with enough
  samples that the result is deterministic and frame-rate-independent — **document
  the choice in the header**; the spec's headline requirement is *no per-frame
  accumulator*, not a symbolic integral.
- `osc[ch](t) = amp · sin(2π t / period)` — additive.

**Interfaces.**
- Consumes: `CompiledClip` (Task 4), `EASE` + `lerpInSpace` (Task 1),
  `lerpAngleShortest`. Signature per the cross-plan contract is
  `evaluateClip(data: ClipData, elapsedSec: number): CameraPose`; internally it
  takes the COMPILED clip — so either (a) accept `ClipData` and compile-memoise on
  identity here, or (b) accept `CompiledClip` and let the driver row hold the
  memoised compile. **Decision:** the public signature is `(ClipData, elapsedSec)`
  per the contract; memoise the compile on `data` reference identity inside (a
  `WeakMap<ClipData, CompiledClip>` or a `{ data, compiled }` last-seen cache).
  Document that `playClip` (Plan B) will reuse the same cache.
- Produces: a `CameraPose`.

- [x] `evaluateClip at t=0 returns the start pose` (single `dollyTo` clip).
- [x] `evaluateClip dolly is log-uniform` — half-decade at half-time:
  `dollyTo` from `start.distance=1` to `100` over `1`s, at `t=0.5` ⇒ ≈ `10`
  (with `ease:'linear'`).
- [x] `evaluateClip holds the final base value past the segment end` —
  past `durationSec`, `distance === to`.
- [x] `evaluateClip rate keeps integrating after the ramp ends` — a
  `rate('yaw',{to:0.1,over:1})`: yaw displacement at `t=2` strictly exceeds the
  linear-extrapolation-from-`t=1` lower bound by the ramp's stored momentum
  (assert monotone increase and `yaw(2) > yaw(1) + 0`).
- [x] `evaluateClip osc is additive and zero-mean` — `oscillate('pitch',{amp:0.1,period:4})`:
  `pitch(0)===base`, `pitch(1)===base+0.1`, `pitch(2)===base`.
- [x] `evaluateClip is pure` — same `(data, t)` twice ⇒ deep-equal; fresh `target` array.
- [x] `evaluateClip composes base+vel+osc on one channel` — yaw with all three:
  result equals the sum of the three evaluated independently.
- [x] Implement. `npm test -- evaluateClip` → pass. Commit.

## Task 7 — `camera.clip` store Intent (`startClip` / `endClip`)

**Files:** `src/state/camera/cameraSlice.ts`, `src/@types/camera/CameraState.d.ts`
(modify), `tests/state/camera/cameraSlice.test.ts` (modify or new).

`startClip` resolves `start:'live'` to a concrete pose BEFORE storing — but the
slice reducer is pure and has no `cameraRuntime`. So the **resolution happens at
the dispatch site** (the spike's `g`-handler / Plan B's `playClip`), exactly as
`focusTweenSaga.ts:43-46` bakes the tween `from` before `put(startCameraTween)`.
**Decision:** `startClip` takes an ALREADY-CONCRETE `ClipData`
(`start: Pose`) — the action payload is the resolved descriptor. A thin helper
`resolveClipStart(data, livePose): ClipData` (co-located in `cameraSlice` or a
sibling) does the `'live'→Pose` swap and is called at the dispatch site. This keeps
the reducer pure and `evaluateClip` free of any `'live'` sentinel (spec ll.94-110).
Storing a FRESH `data` object is load-bearing — it is the clock-reset trigger
(Task 8 keys on reference identity).

**Interfaces.**
- Consumes: `ClipData`, `CameraPose`.
- Produces:
  - `CameraState.clip: { data: ClipData } | null` (`CameraState.d.ts`).
  - `startClip(data: ClipData)` reducer ⇒ `camera.clip = { data }`.
  - `endClip()` reducer ⇒ `camera.clip = null`. **Mirror `cancelCameraTween`:
    `endClip` ALSO clears any dormant `camera.tween`** (spec "Camera" teardown
    ll.737-740: a tween planted before the clip must not outrank `resting` once
    @95 deactivates). i.e. `endClip` sets `clip=null` AND `tween=null`.
  - `resolveClipStart(data: ClipData, live: CameraPose): ClipData` — returns a
    NEW object with `start` concrete (passes through a non-`'live'` start).
  - `initialState.clip = null`.

- [x] `startClip stores the clip data` — `camera.clip.data === payload`.
- [x] `endClip clears clip` — `camera.clip === null` after.
- [x] `endClip also clears a dormant tween` — with `tween` set, `endClip()` nulls both.
- [x] `resolveClipStart swaps 'live' for the live pose` and `passes a concrete start through`.
- [x] Implement. `npm test -- cameraSlice` → pass. Commit.

## Task 8 — `CameraClock` clip arm: `clipElapsed` keyed on `camera.clip` identity

**Files:** `src/@types/engine/camera/CameraClock.d.ts`,
`src/services/engine/camera/cameraClock.ts` (modify),
`tests/services/engine/camera/cameraClock.test.ts` (modify).

Member 2 of the required triple. `clipElapsed` mirrors `tweenElapsed`
(`cameraClock.ts:52-62`) but keys on the `camera.clip` REFERENCE (a fresh
`startClip` payload installs a new object ⇒ `!==` fires the zero exactly once).
`evaluateClip` takes `elapsedSec`, so `clipElapsed` returns **seconds**
(`(nowMs - clipStartMs)/1000`) — unlike `tweenElapsed` which returns ms. Document
this unit boundary.

**Interfaces.**
- Consumes: `CameraClock`, the `camera.clip` value (`{ data } | null`).
- Produces:
  - `CameraClock.clipStartMs: number | null`, `CameraClock.lastClipRef: object | null`
    (`CameraClock.d.ts`); `createCameraClock` seeds both null.
  - `clipElapsed(clock: CameraClock, clip: { data: ClipData } | null, nowMs: number): number`
    — returns elapsed SECONDS since the current `clip` reference started; `0` for
    null, `0` on the arrival frame.

- [x] `clipElapsed returns 0 for null clip`.
- [x] `clipElapsed returns 0 on the arrival frame then grows in seconds` —
  ref installed at `nowMs=1000` ⇒ `0`; same ref at `nowMs=2500` ⇒ `1.5`.
- [x] `clipElapsed resets when the clip reference changes` — a NEW `{data}` object
  resets the start (the clock-reset-on-fresh-object invariant).
- [x] Implement. `npm test -- cameraClock` → pass. Commit.

## Task 9 — `clip`@95 driver row + `elapsedForWinner` clip arm + `commitsOnEdge`

**Files:** `src/@types/engine/camera/CameraDriver.d.ts`,
`src/services/engine/camera/cameraDrivers.ts` (modify),
`src/state/camera/selectors.ts` (modify),
`tests/services/engine/camera/cameraDrivers.test.ts` (modify),
`tests/state/camera/selectors.test.ts` (modify).

Members 1 & 3 of the triple, plus the `commitsOnEdge` property.

**Interfaces.**
- Consumes: `evaluateClip` (Task 6), `clipElapsed` (Task 8), `camera.clip`.
- Produces:
  - `CameraDriver.commitsOnEdge?: boolean` (`CameraDriver.d.ts`) — didactic note:
    "drivers whose final pose must bake into `base` on deactivation set this;
    the frame loop reads it instead of an id literal" (spec ll.583-602).
  - Clip row in `buildCameraDrivers` (`cameraDrivers.ts:148-185`):
    `{ id:'clip', priority:95, commitsOnEdge:true,`
    `  isActive: (s) => s.camera.clip !== null,`
    `  pose: (s, _cam, elapsed) => evaluateClip(s.camera.clip!.data, elapsed) }`.
  - `elapsedForWinner` (`cameraDrivers.ts:82-93`) gains a `clip` arm:
    `if (winner.id === 'clip') return clipElapsed(clock, s.camera.clip, nowMs)`.
    **`runCameraDrivers` passes `elapsed` straight to `pose`; the clip's `elapsed`
    is now SECONDS** — confirm no ms/s mismatch (tween arm still returns ms; each
    driver's `pose` interprets its own unit).
  - Backfill `commitsOnEdge:true` on the existing `tween` and `autoRotate` rows
    (so Task 10's frame-loop refactor can drop the id literals); leave `orbitDrag`
    / `resting` without it.
  - `selectCameraActive` (`selectors.ts:47-50`) ORs `c.clip !== null`.
  - `selectClipActive(state): boolean` = `selectCameraIntent(state).clip !== null`
    (Plan B/C and the `suspendDuringClip` guard read this).

- [x] `buildCameraDrivers includes a clip@95 row with commitsOnEdge`.
- [x] `pickWinner picks clip over orbitDrag` — `camera.clip` set AND `dragging`
  true ⇒ winner id `'clip'` (clip 95 > orbitDrag 80).
- [x] `elapsedForWinner returns clipElapsed seconds for the clip winner`.
- [x] `tween and autoRotate rows now declare commitsOnEdge:true; orbitDrag/resting do not`.
- [x] `selectCameraActive is true while a clip is active`.
- [x] `selectClipActive reflects camera.clip`.
- [x] Implement. `npm test -- cameraDrivers selectors` → pass. Commit.

## Task 10 — Frame loop: commit-on-edge reads `commitsOnEdge`; clip clock wired

**Files:** `src/services/engine/frame/runFrame.ts` (modify),
`tests/services/engine/frame/runFrame.test.ts` (modify or the existing frame test).

Replace the hardcoded id set with the driver property (spec ll.593-602):

```ts
// before  (runFrame.ts:189)
if (prev !== activeId && (prev === 'tween' || prev === 'autoRotate')) {
// after — read the flag off the row; no id literals, exhaustive by construction
if (prev !== activeId && deps.drivers.find((d) => d.id === prev)?.commitsOnEdge) {
```

The `clip`→null deactivation edge then bakes the final composed pose into
`camera.base` for free (clip declares `commitsOnEdge:true`), and `renderPose`
override (`runFrame.ts:197`) keeps the last frame from flashing the pre-edge base.
A `byId` helper on the driver list is acceptable instead of `.find` if cheaper —
keep behaviour identical. NO clip-completion dispatch is added in runFrame yet —
that is the `clipPlayer`'s job (Task 11), ticked first.

**Interfaces.**
- Consumes: `deps.drivers` (now carrying `commitsOnEdge`).
- Produces: behaviour-neutral for tween/autoRotate (still commit on edge); the
  clip edge now commits too.

- [x] `commit-on-edge fires when a clip deactivates` — drive a frame where
  `prevActiveId='clip'` and `camera.clip` is null ⇒ `commitCameraPose(lastPose)`
  dispatched once.
- [x] `commit-on-edge still fires for tween and autoRotate` (regression — the
  existing tests stay green).
- [x] `commit-on-edge does NOT fire for orbitDrag/resting edges`.
- [x] Implement. `npm test -- runFrame` → pass. Commit.

## Task 11 — `clipPlayer` Resource: tick-first scene cues + the `clipOpacity` channel + lifecycle

**Files:** `src/@types/engine/subsystems/ClipPlayer.d.ts` (new),
`src/@types/animation/ClipOpacityChannel.d.ts` (new),
`src/services/animation/clipOpacityChannel.ts` (new),
`src/services/animation/applySceneEffect.ts` (new — the verb→side-effect table),
`src/services/animation/visibilityActionRow.ts` (new — the layer→action data table),
`src/services/engine/wiring/syncVisibilityFades.ts` (modify — the `durationMs` override),
`src/services/engine/subsystems/clipPlayer.ts` (new),
`src/@types/engine/handles/EngineSubsystemHandles.d.ts` (modify),
`tests/services/animation/clipOpacityChannel.test.ts` (new),
`tests/services/animation/applySceneEffect.test.ts` (new),
`tests/services/engine/wiring/syncVisibilityFades.test.ts` (modify),
`tests/services/engine/subsystems/clipPlayer.test.ts` (new).

This task builds BOTH the clip-owned `clipOpacity` channel AND the `clipPlayer`
Resource that owns it. The channel is keyed by **`VisibilityLayerKey`** (the key
space pinned in Architecture above) so the `fade()` cue's layer names write it
directly.

**The `clipOpacity` channel** — a clip-owned set of private `FadeController`s, the
**exact shape** `structureFocusSubsystem` uses (`structureFocusSubsystem.ts:35,69`
— `createFadeController`, private, NOT the shared `FadeRegistry`), one per
`VisibilityLayerKey`, **default 1**, lazily created on first `fade`:

```ts
// ClipOpacityChannel.d.ts
export type ClipOpacityChannel = {
  /** Drive a transient fade on one layer (the `fade()` verb), animated or snapped. */
  fadeTo(key: VisibilityLayerKey, target: number, durationMs: number, nowMs?: number): void;
  /** The clip-opacity factor for a layer at `now` — default 1 (untouched layers). */
  factorOf(key: VisibilityLayerKey, nowMs?: number): number;
  /** Advance every controller's clock (called from clipPlayer.tick). */
  tick(nowMs: number): void;
  /** Whether any controller is mid-ramp (keeps the loop awake; mirrors structureFocus). */
  isAnimating(nowMs?: number): boolean;
  /** Reset ALL layers to factor 1 — clip-end Resource teardown. */
  reset(): void;
};
export function createClipOpacityChannel(initialNowMs?: number): ClipOpacityChannel;
```

The side-effecting Resource facet (spec "The player (a Resource)" ll.490-507). NO
pose, NO own clock — it rides `cameraClock`'s clip elapsed. Each `tick(nowMs)`:
1. read `elapsed = clipElapsed(clock, s.camera.clip, nowMs)` (seconds);
2. advance the `clipOpacity` channel (`clipOpacity.tick(nowMs)`);
3. **fire scene cues** edge-triggered: any cue with `atSec ∈ (prevElapsed, elapsed]`
   fires now, in the tick phase — never in the driver's pure `pose`. The `fade`
   cue calls `clipOpacity.fadeTo(layer, to, over*1000, nowMs)` per layer (the
   `fade()` Layer-1 primitive's runtime — `clipPlayer`'s own channel). The other
   four verbs route through **`applySceneEffect(effect, { state, store })`** (Task
   11b below) — the `show`/`hide`/`scene`/`focus` verb→side-effect dispatch table.
   This is `clipPlayer`'s tick-phase job and lives at Layer 1 because the recording
   spikes call `playClip` with NO saga and still use all five verbs.
4. **detect completion**: when `elapsed >= compiled.durationSec`, `dispatch(endClip())`
   — **POST-produce sequencing**: because `clipPlayer.tick` is the FIRST step of
   `runFrame` (Task 12) it would normally end the clip BEFORE the pose is produced,
   baking a one-frame-stale pose (spec ll.501-503 warns of exactly this). Resolve
   by completing on the FRAME AFTER `elapsed` first reaches `durationSec`: the
   evaluator saturates at `durationSec` (held final pose), so the player records
   "reached end at frame N", lets frame N produce the final pose + commit it, and
   dispatches `endClip()` on frame N (after the tick records it) so the
   deactivation edge fires frame N+1 with `lastPose` == the saturated final pose.
   Mirror the tween-completion ordering (`runFrame.ts:148-169`: cancel fires this
   frame, commit fires next). **Make the test pin this exact ordering.**
- `clipOpacity.reset()` snaps every layer to 1 on `endClip` (Resource teardown,
  spec ll.741-743).
- `stop()`: Resource cleanup (reset cue cursor `prevElapsed`, cancel forks,
  `clipOpacity.reset()`) + `dispatch(endClip())` (spec ll.753-755). The `playClip`
  Promise + `[CANCEL]` hook are **Plan B** — leave `stop()` ending the clip; no Promise yet.
- Only state: `prevElapsed` cursor + `fork` bookkeeping + the `clipOpacity`
  channel. `destroy()` for the `Destroyable` guard (`EngineSubsystemHandles.d.ts:123`).

**Task 11b — `applySceneEffect`: the `show`/`hide`/`scene`/`focus` verb→side-effect
table (Layer 1).** The recording spikes call `playClip` with no saga and still use
all five verbs, so the dispatch table is Plan A's, not the tour's. `clipPlayer`'s
cue scan (step 3 above) calls it for every non-`fade` cue; the `fade` arm stays
`clipPlayer`'s own (it writes the `clipOpacity` channel directly).

```ts
// applySceneEffect.ts — the edge-fired dispatch for one non-fade SceneEffect cue
export function applySceneEffect(
  effect: SceneEffect,        // a show/hide/scene/focus cue (the fade arm is clipPlayer's own)
  deps: { state: EngineState; store: AppStore },
): void;
```

| verb | side effect |
| --- | --- |
| `show` | dispatch the layers' visibility-on settings actions (via `VISIBILITY_ACTION_ROW`, the SAME the UI dispatches), then `syncVisibilityFades(state, { animate: over !== 0, only: layers, durationMs: over })` — rides the LIVE bridge |
| `hide` | dispatch visibility-off, then the same bridge sync with the layers |
| `scene` | `store.dispatch(effect.action)` — the plain `SettingsAction`; every reconcile saga fires for free |
| `focus` | `store.dispatch(updateSelectionFocus(effect.ref))` — selection-Intent; `watchFocusTween` is parked by Plan B's `suspendDuringClip`, so no camera tween plants; `watchSelectionRows` stays live → the isolation dim fires |

`show`/`hide` need the layer→settings-action map (which action turns a
`VisibilityLayerKey` on/off): build `VISIBILITY_ACTION_ROW: Record<VisibilityLayerKey,
(on: boolean) => SettingsAction>` (`visibilityActionRow.ts`) — the inverse of
`FADE_ROW` (`reconcileSagas.ts:57-68`), a **data table beside it, NOT a branch
chain** (simplicity §7). For multi-item layers (e.g. `survey` → several catalogs)
`show`/`hide` set the cluster-level gate; the bridge's `expand` handles the items.

**Task 11c — the `show`/`hide` fade-duration override on `syncVisibilityFades`
(Layer 1).** `show`/`hide` carry an `over` (omit → default, `0` → instant, `N` →
custom). The intent→fade bridge (`syncVisibilityFades` → private `applyIntent`)
**hard-codes** `FADE_IN_DURATION_MS` / `FADE_OUT_DURATION_MS`
(`syncVisibilityFades.ts:82-83`). Thread an optional `durationMs` through
`applyIntent` and the public `syncVisibilityFades` / `syncVisibilityFadeItem` so a
`show`/`hide` cue's `over` reaches the bridge (spec migration note: "the visibility
actions carry an optional fade duration … `applyIntent` … gains an optional
override"). This is Layer 1 because `applySceneEffect`'s `show`/`hide` arm is the
sole caller that needs it, and `applySceneEffect` is Layer 1.

```ts
function applyIntent<Item>(
  state: ApplyIntentState,
  row: FadeLayer<Item>,
  item: Item,
  opts: { animate: boolean; durationMs?: number },
): void;

export function syncVisibilityFades(
  state: ApplyIntentState,
  opts: { animate: boolean; only?: readonly VisibilityLayerKey[]; durationMs?: number },
): void;
```

When `durationMs` is given, `applyIntent` passes it to `fadeTo` instead of the
hard-coded constant; omitted → today's constants. `over === 0` routes through the
`animate: false` (snap) path at the cue layer, so the bridge's animate/snap split is
unchanged; here only the non-zero custom duration matters.

**Interfaces.**
- Consumes: injected `{ store: { getState, dispatch }, requestRender }`;
  `compileClip` (memoised on `camera.clip.data` identity), `clipElapsed`,
  `createClipOpacityChannel`, `createFadeController`
  (`src/services/animation/fadeController.ts`), `VisibilityLayerKey`, `endClip`,
  `applySceneEffect`, `VISIBILITY_ACTION_ROW`, `syncVisibilityFades` (with the
  `durationMs` override), `updateSelectionFocus` (`selectionSlice.ts:31`),
  the settings-slice visibility actions, `FADE_ROW` (`reconcileSagas.ts:57-68`).
- Produces:
  - `ClipOpacityChannel` + `createClipOpacityChannel` (above).
  - `ClipPlayer = { tick(nowMs: number): void; stop(): void;`
    `  clipOpacityOf(layer: VisibilityLayerKey, nowMs: number): number; destroy(): void }`
    — `clipOpacityOf(layer, now)` delegates to the channel's `factorOf` (default 1).
    This is the public accessor the renderer (Task 12) and Plan C read.
  - `createClipPlayer(deps): ClipPlayer`.
  - `EngineSubsystemHandles.clipPlayer: ClipPlayer` (eager, non-null from t=0 —
    no GPU dep, like `structureFocus`).

- [x] `clipOpacityChannel.test.ts`: `factorOf returns 1 for an untouched layer`.
- [x] `clipOpacityChannel.test.ts`: `fadeTo to 0 then factorOf at end returns 0` (snap, `over=0`).
- [x] `clipOpacityChannel.test.ts`: `fadeTo animates between 1 and 0 over the duration`
  — sample a midpoint, assert strictly between, using an explicit `nowMs` clock.
- [x] `clipOpacityChannel.test.ts`: `reset restores every faded layer to 1`.
- [x] `clipOpacityChannel.test.ts`: `isAnimating is true mid-ramp, false after duration`.
- [x] `clipOpacityChannel.test.ts`: `a second fadeTo on the same layer retargets from the current value`.
- [x] `clipPlayer fires a cue when elapsed crosses its atSec` — a clip with a
  `fade([...],0,0)` cue: `tick` at `elapsed≥0` writes `clipOpacity` once; a second tick does NOT re-fire.
- [x] `clipPlayer fires cues in (prevElapsed, elapsed]` — two cues at `0` and `3`s;
  one tick jumping `prevElapsed=0→4` fires BOTH, in `atSec` order.
- [x] `clipPlayer dispatches endClip the frame the clip reaches durationSec (not before)` —
  pin the post-produce ordering: at `elapsed = durationSec` the FIRST tick records
  completion and dispatches `endClip` (after evaluator saturates), not on the tick
  BEFORE reaching the end. (Implemented as a two-frame defer: pendingEnd recorded on
  the saturation frame, endClip dispatched on the next tick — see clipPlayer module header.)
- [x] `clipPlayer fade cue drives clipOpacity; clipOpacityOf reflects it; resets to 1 on endClip`.
- [x] `clipPlayer.stop dispatches endClip and resets the cursor + clipOpacity`.
- [x] `clipPlayer is registered in EngineSubsystemHandles` (typecheck-level).
- [x] `clipPlayer routes a non-fade cue through applySceneEffect` — a `focus(ref)`
  cue dispatches `updateSelectionFocus(ref)`; a `fade` cue does NOT call `applySceneEffect`.
- [x] `applySceneEffect.test.ts`: `scene dispatches its SettingsAction verbatim`.
- [x] `applySceneEffect.test.ts`: `focus dispatches updateSelectionFocus(ref)` (and `null` clears).
- [x] `applySceneEffect.test.ts`: `show dispatches visibility-on (via VISIBILITY_ACTION_ROW) + runs the bridge with only+durationMs`.
- [x] `applySceneEffect.test.ts`: `hide dispatches visibility-off + bridge`.
- [x] `applySceneEffect.test.ts`: `over === 0 routes show/hide through the snap (animate:false) path`.
- [x] `applySceneEffect.test.ts`: `VISIBILITY_ACTION_ROW is a data table, every VisibilityLayerKey resolves to its on/off action` (per-item factory: each key → action list, reg-only keys → `[]`).
- [x] `syncVisibilityFades.test.ts`: `applyIntent uses the durationMs override when given`
  — fake `subsystems.fades.fadeTo` asserts the passed duration equals the override, not `FADE_IN_DURATION_MS`.
- [x] `syncVisibilityFades.test.ts`: `applyIntent falls back to the FADE_IN/OUT constants when omitted` (regression).
- [x] `syncVisibilityFades.test.ts`: `syncVisibilityFades threads durationMs to every applied row`.
- [x] Implement. `npm test -- clipOpacityChannel clipPlayer applySceneEffect syncVisibilityFades` → pass. Commit.

## Task 12 — Wire `clipPlayer.tick` FIRST in runFrame + the `clipOpacity` third factor in `resolveLayerOpacity`

**Files:** `src/services/engine/frame/runFrame.ts` (modify),
`src/services/engine/presentation/focusRecession.ts` (modify — the
`resolveLayerOpacity` line),
`src/services/engine/presentation/fadeIdToVisibilityKey.ts` (new — the
`FadeId → VisibilityLayerKey` bridge), the six `resolveLayerOpacity` /
`focusRecession` consumers (`encodeVolumePrepass.ts`, `passes/filamentsPass.ts`,
`produceStructureMarkers.ts`, `produceStructureLabels.ts`, `produceFamousLabels.ts`,
+ the whole-layer caller), construction of `clipPlayer` in the engine bootstrap
(find it — `engine.ts` state literal where `structureFocus` is constructed),
`tests/services/engine/frame/runFrame.test.ts` (modify),
`tests/services/engine/presentation/fadeIdToVisibilityKey.test.ts` (new),
`tests/services/engine/presentation/focusRecession.test.ts` (modify).

Three wirings (spec "Frame ordering: the player ticks first" ll.560-578 and the
three-channel opacity product ll.624-648):

**(a) The `FadeId → VisibilityLayerKey` bridge.** `resolveLayerOpacity` consumers
carry a `FadeId` (`focusRecession.ts:48`); the channel is keyed by
`VisibilityLayerKey`. One pure mapping bridges them — the inverse, over
`FadeId['kind']`, of `FadeLayer.handle()`. Exhaustive `switch (h.kind)` with NO
`default` arm (mirror `recessionTargetFor`'s exhaustiveness,
`focusRecession.ts:70-94`): every `FadeId` kind maps to its `VisibilityLayerKey`
(e.g. `flow → 'flow'`, `filament → 'filaments'`, `galaxyCatalog → 'survey'`,
`structure → 'structureRing'`, …) or returns `undefined` for kinds no clip layer
addresses (`overlay`; `labelLayer` for the non-clip-fadeable layers) ⇒ the caller
treats the factor as 1. Signature: `fadeIdToVisibilityKey(h: FadeId): VisibilityLayerKey | undefined`.

**(b) `clipPlayer.tick` first.** `state.subsystems.clipPlayer.tick(nowMs)` is the
**first** statement of `runFrame` (before `deriveSourceMasks`/`reevaluateDemand`)
so scene cues fire before the frame derives from them. The pose has NO ordering
dependency on the tick (it's a pure store read in the `clip` driver), so the
existing camera produce block (`runFrame.ts:116-205`) is untouched except for what
Task 10 changed.

**(c) The third opacity factor.** `resolveLayerOpacity` (`focusRecession.ts:112-119`)
multiplies a THIRD factor: `intentOpacity × focusRecession × clipOpacity`. Add an
OPTIONAL clip-channel argument so non-clip callers are unaffected by default; the
factor is read via the bridge (a) — `clip ? clip.clipOpacityOf(fadeIdToVisibilityKey(h) ?? <no-key>, now) : 1`,
where an unmapped id ⇒ factor 1. The pure recession module stays free of the
clipPlayer Resource — the channel is passed in from the caller, mirroring how
`blend` is passed rather than read:

```ts
// before
return fades.opacityOf(h, now) * focusRecession(h, blend);
// after
const clipFactor = clip === undefined ? 1 : clipFactorFor(clip, h, now);
return fades.opacityOf(h, now) * focusRecession(h, blend) * clipFactor;
```

where `clipFactorFor(clip, h, now)` maps via `fadeIdToVisibilityKey` and returns 1
for an unmapped id (a tiny local — keep `resolveLayerOpacity` flat). The six
consumers thread the live channel — `state.subsystems.clipPlayer` exposes
`clipOpacityOf`, so pass it (or the subsystem) as the new `clip` arg; the existing
producer tests stay green with the channel defaulting to "all 1" when no clip plays.

**Revised signature:**

```ts
export function resolveLayerOpacity(
  fades: FadeRegistry,
  h: FadeId,
  blend: number,
  now: number,
  clip?: ClipPlayer, // NEW — omitted ⇒ factor 1 (no clip playing)
): number;
```

**Interfaces.**
- Consumes: `state.subsystems.clipPlayer` (its `clipOpacityOf`), `fadeIdToVisibilityKey`,
  `FadeId`, `VisibilityLayerKey`, the three-factor product.
- Produces: `fadeIdToVisibilityKey`, `resolveLayerOpacity(…, clip?)`; cues fire
  before same-frame derivation; rendered alpha includes the clip factor (default 1
  ⇒ behaviour-neutral when no clip plays).

- [x] `fadeIdToVisibilityKey maps flow id to 'flow'`, `filament id to 'filaments'`,
  `a structure ring id to 'structureRing'`.
- [x] `fadeIdToVisibilityKey returns undefined for non-clip-fadeable kinds` (e.g. `overlay`).
- [x] `fadeIdToVisibilityKey is exhaustive` — the no-`default` switch fails tsc if a
  `FadeId['kind']` is unhandled (compile-error guard). (Note: under skymap's tsconfig the
  no-`default` switch does NOT actually fail tsc — an unhandled kind silently returns
  `undefined`; mirrors the existing `recessionTargetFor` pattern. Flagged for final review:
  make it real with `const _exhaustive: never = h.kind`.)
- [x] `runFrame ticks clipPlayer before deriving masks/demand` — order assertion
  via a spy: `clipPlayer.tick` called before `deriveSourceMasks`.
- [x] `resolveLayerOpacity includes the clip factor` — `intent×focus×clip`;
  `clip=1` is behaviour-neutral (existing tests stay green), a `fade`d layer halves.
- [x] `resolveLayerOpacity omitting the clip channel leaves opacity unchanged` (back-compat).
- [x] `resolveLayerOpacity uses factor 1 for an id with no clip key even with a channel present`.
- [x] Thread `clipOpacity` through the six consumers (each: add the arg).
- [x] Construct `clipPlayer` in the engine bootstrap (eager). (Pre-satisfied in Task 11a-ii — verified at `engine.ts:340`, not duplicated.)
- [x] `npm test -- runFrame focusRecession fadeIdToVisibilityKey` → pass. `npm run typecheck` clean. Commit.

## Task 13 — The flyout spike as a `ClipData` (validate the model)

**Files:** `src/data/animation/flyoutClip.ts` (new),
`tests/data/animation/flyoutClip.test.ts` (new).

Re-express the flyout (spec ll.232-243) as data — the model's acceptance proof.
The original spike driver is NOT in `src/` (the spike worktree tore it down — see
`docs/research/2026-06-19-camera-animation-spike-findings.md`, "URL gates… read at
engine construction"); the spec's worked example IS the spec for this clip:

```ts
export const flyout: ClipData = {
  start: 'live',                                        // dolly from wherever the user is framed
  timeline: [
    all([
      dollyTo(29_500, 22, 'inOut'),                     // log-dolly to the horizon shell
      spin('yaw', { by: 1.1, over: 22, ease: 'inOut' }),// gentle quarter-turn
    ]),
  ],
};
```

This is a green-field artifact (no committed spike to diff against), so the test
validates the clip COMPILES + EVALUATES sanely rather than matching torn-down code:

**Interfaces.**
- Consumes: the Task 3 helpers, `compileClip`, `evaluateClip`,
  `resolveClipStart` (to bind a concrete `start` for evaluation).
- Produces: `flyout: ClipData`.

- [x] `flyout compiles without a single-writer clash` (one base-writer per channel
  — `distance` and `yaw` are distinct channels).
- [x] `flyout durationSec is 22`.
- [x] `flyout dollies log-uniformly to ~29 500 Mpc` — with a concrete
  `start.distance` (resolve `'live'` to a test pose), `evaluateClip(..., 22)`
  ⇒ `distance` ≈ `29_500`; at `t=11` the distance is the geometric midpoint
  (log-space), NOT the arithmetic midpoint (asserts log interpolation).
- [x] `flyout yaw advances by 1.1 rad over the take` — `yaw(22) - start.yaw ≈ 1.1`.
- [x] Implement. `npm test -- flyoutClip` → pass. Commit.

## Task 14 — Full-suite green + typecheck + DoD self-check

**Files:** none (verification only).

- [x] `npm test` → all green (590+ existing + the new suites). (3204 tests / 501 files green; two stale fixtures fixed — see commit 09d36f73.)
- [x] `npm run typecheck` → clean (both src + tools tsconfigs).
- [x] Grep for TODO/placeholder left in new files; remove or convert to a tracked note. (Only descriptive "placeholder" prose for the ZERO_POSE design; no stray TODO/FIXME.)
- [x] Confirm the cross-plan contract names match this plan's table EXACTLY
  (`ClipData`, `evaluateClip`, `camera.clip`, `startClip`/`endClip`, `clip`@95,
  `commitsOnEdge`, `clipPlayer.tick`, `clipPlayer.clipOpacityOf`, `SceneEffect`,
  the five constructors (`show`/`hide`/`fade`/`scene`/`focus`), `applySceneEffect`,
  the `syncVisibilityFades(…, durationMs?)` override, `selectClipActive`) — Plans
  B & C bind to them. The entire scene vocabulary is Layer 1 (saga-less recordings
  use it). `clipOpacity` is keyed by `VisibilityLayerKey`; Plan C consumes
  `clipPlayer.clipOpacityOf` + the verbs and never constructs the channel, the
  `SceneEffect` type, the constructors, `applySceneEffect`, the duration override,
  or touches `resolveLayerOpacity`.
- [x] No commit of `public/data/*` or `dist/`. Final commit if any verification fixups.

---

## Self-review

**Spec coverage (Plan A scope, spec ll.981-989):**
- `Effect`/`ClipData` types + authoring helpers — Tasks 2, 3. Vocabulary
  enumerated from spec ll.162-208 (tween/dollyTo/moveTarget/aimAt/spin/rate/
  oscillate/hold/wait/show/hide/fade/scene/focus/seq/all/fork). ✓
- `evaluateClip` pure, closed-form `∫vel`, base/vel/osc, single-writer on base —
  Tasks 4 (compile), 5 (validate), 6 (evaluate). ✓
- `camera.clip` Intent + `startClip`/`endClip`, `'live'` resolved at dispatch —
  Task 7 (`resolveClipStart` at the dispatch site mirrors `focusTweenSaga`). ✓
- `clip`@95 row, `commitsOnEdge:true`, pure `pose` — Task 9. ✓
- `clipPlayer.tick` first in `runFrame`, edge cues, POST-produce clip-end, rides
  `cameraClock`, no pose/no own clock — Tasks 11, 12. ✓
- The full scene vocabulary (`SceneEffect` type, the five
  `show`/`hide`/`fade`/`scene`/`focus` constructors, the `applySceneEffect`
  verb→side-effect table `clipPlayer` runs, `VISIBILITY_ACTION_ROW`, and the
  `show`/`hide` fade-duration override on `syncVisibilityFades`) — Tasks 2, 3, 11.
  Layer 1 because saga-less recording spikes use all five verbs. Plan C consumes
  it, redeclares none of it. ✓
- `clipOpacity` channel (per-`VisibilityLayerKey` private FadeControllers, default
  1), the `fade()` Layer-1 primitive that writes it, the `FadeId →
  VisibilityLayerKey` bridge, the `resolveLayerOpacity` third factor + six
  consumers, reset-on-`endClip`, and the public `clipPlayer.clipOpacityOf`
  accessor — Tasks 11, 12. Plan A is the SOLE owner; Plan C consumes the accessor. ✓
- Required clock TRIPLE (clipStartMs/lastClipRef, clipElapsed, elapsedForWinner arm)
  — Tasks 8, 9; silent-freeze trap pinned by Task 11's integration ordering. ✓
- Flyout re-expressed — Task 13. ✓

**Ambiguities resolved (flagged for the implementer to confirm against live code):**
1. **`'live'` resolution site.** The reducer is pure and has no `cameraRuntime`,
   so `startClip` takes an already-concrete `ClipData`; a `resolveClipStart(data,
   livePose)` helper does the swap at the dispatch site (Task 7), exactly as
   `focusTweenSaga.ts:43-46` bakes the tween `from`. The store stays pure; the
   evaluator never sees `'live'`.
2. **`target` as one Vec3 channel.** Added a `setVec` `CameraAction` arm (Task 2)
   so `moveTarget` stays a single action (spec "one vec3 channel, component-wise
   lerp") rather than three scalar sets — keeps the channel set = `CameraPose`
   fields exactly.
3. **`evaluateClip` units.** The cross-plan signature is `(ClipData, elapsedSec)`;
   `clipElapsed` returns SECONDS while `tweenElapsed` returns ms — documented as a
   per-driver unit boundary (Tasks 8, 9) so the two evaluators don't collide.
4. **Closed-form `∫vel` precision.** Symbolic per-ease integral preferred;
   deterministic fixed-step quadrature accepted as long as there's no per-frame
   accumulator (the spec's actual requirement). Task 6 header documents the choice.
5. **`clipOpacity` ownership + key space + composition seam.** Plan A is the SOLE
   owner of the `clipOpacity` mechanism (channel factory, the `fade()` primitive,
   the `FadeId → VisibilityLayerKey` bridge, the third factor, reset-on-end, the
   public accessor). The channel is keyed by `VisibilityLayerKey` so `fade()`'s
   layer names write it directly (`syncVisibilityFades.ts:125` — same key); the
   renderer's `FadeId` (`focusRecession.ts:48`) is bridged by `fadeIdToVisibilityKey`
   (Task 12), the inverse of `FadeLayer.handle()`. The channel is passed INTO
   `resolveLayerOpacity` as a parameter (like `blend`) so the pure `focusRecession`
   module never holds the clipPlayer Resource (Task 12) — "compose, don't braid".
   Plan C CONSUMES `clipPlayer.clipOpacityOf`; it builds none of this.
6. **Plan B/C seams left named-but-unbuilt:** `playClip` + `[CANCEL]` Promise (B),
   the `suspendDuringClip` guard / `watchFocusTween` parking (B — it guards ANY
   clip's camera from a reconcile saga, not just the tour, so it is Layer 1),
   `captureScene`/`restoreScene` + the tour clip builders (C). `selectClipActive`
   (Task 9) is provided now because both B and C read it; `endClip` clears a dormant
   tween now (Task 7) because that is Layer-1 camera teardown, not orchestration.
7. **The scene vocabulary is Layer 1, not Layer 2.** `SceneEffect`, the five
   constructors, `applySceneEffect`, and the `show`/`hide` duration override are all
   Plan A's because the recording spikes (`cosmicFlows`, `webShowcase`) call
   `playClip` directly — with NO tour saga — and still use `show`/`hide`/`fade`/
   `scene`/`focus`. Plan C is purely the tour-orchestration layer and consumes them.

**No placeholders / no full bodies:** every task carries type signatures + test
names with assertions + path:line citations; no implementation bodies. ✓
