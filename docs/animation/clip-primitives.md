# Clip primitives — authoring reference

> **What this is.** A reference for everyone authoring or implementing animation
> *clips* — the serializable, frame-clocked camera+scene animations the renderer
> plays. It is the consolidated API surface; for the *rationale* (why a clip is
> data, why the pose is pure, why opacity composes) read the design spec
> [`2026-06-19-animation-system-design.md`](../superpowers/specs/2026-06-19-animation-system-design.md)
> and the build plans under [`docs/superpowers/plans/2026-06-24-animation-*.md`](../superpowers/plans/).
>
> **Status.** The vocabulary is being built in Plan A. Signatures here are the
> *contract* those tasks implement — treat this file as the source of truth for the
> API shape, and update it if a task lands a refinement. Anything marked
> _(Layer 2)_ is built in Plan C and is for tour orchestration, not clips.

---

## The one-paragraph mental model

A **clip** is a plain serializable object (`ClipData`) — a timeline of `Effect`s.
The camera **pose** at any instant is a **pure** function `evaluateClip(data, t)`:
no per-frame accumulator, no hidden state, same `(data, t)` in → same pose out. The
clip's **scene** changes (show a layer, fade it, change a setting) are *cues* that
fire edge-triggered from a frame-ticked `clipPlayer` as the clock crosses them. You
**author** clips with the one-line helper constructors below; you never write the
raw `{ kind: … }` objects by hand.

```ts
import { dollyTo, spin, all } from '../services/engine/animation/effectHelpers';

const flyout: ClipData = {
  start: 'live',                                  // begin from wherever the camera is now
  timeline: [
    all([                                         // these two run together
      dollyTo(29_500, 22, 'inOut'),               // log-dolly out to the horizon shell
      spin('yaw', { by: 1.1, over: 22 }),         // with a gentle quarter-turn
    ]),
  ],
};
```

Play it with `startClip(data)` (or, from a saga, `yield* call(playClip, clip)` —
_Plan B_). The camera is owned by the `clip` driver (priority 95) for the clip's
duration, then the final pose bakes into `camera.base` and control returns to the
user.

---

## `ClipData` — the clip envelope

```ts
type ClipData = {
  start?: Pose | 'live';   // fixed start pose, or 'live' = capture the live pose at startClip. Default 'live'.
  preroll?: number;        // seconds of static hold before the timeline clock starts (lets an operator hit record)
  timeline: Effect[];      // played in order; an entry may itself be concurrent (all / fork)
};
```

- **`start: 'live'`** is resolved **once, at dispatch** — `startClip` reads the live
  rendered pose and bakes a concrete `start: Pose` before storing. The evaluator
  never sees `'live'`; this is what keeps `evaluateClip` pure and makes clip→clip
  handoff seamless.
- **`Pose` = `CameraPose` = `{ target: Vec3; yaw; pitch; distance }`.** That four-field
  set is exactly what a clip can animate — see Channels below.
- **`preroll`** holds the opening pose for N seconds so a screen-recorder can start
  before anything moves. The storyboard grammar in
  [`spike-findings`](../research/2026-06-19-camera-animation-spike-findings.md)
  recommends ~2 s.

---

## Channels and value spaces

A clip animates the **four fields of `CameraPose`**, and nothing else. Each channel
interpolates in its natural **space** so motion reads correctly:

| Channel    | Space   | Why                                                            |
| ---------- | ------- | ------------------------------------------------------------- |
| `distance` | `log`   | "Powers of Ten" — uniform decades/sec. Linear distance crams all the change into the last instant. |
| `yaw`      | `add`   | Angles add; `yaw` uses **shortest-arc** interpolation.        |
| `pitch`    | `add`   | Angles add.                                                   |
| `target`   | `lin`   | A `Vec3`, interpolated component-wise in linear space.        |

`CHANNEL_SPACE` is the single canonical record of these mappings
(`src/services/engine/animation/channelSpace.ts`); the helpers default a channel's
space from it, so you rarely pass `space` explicitly. `roll` and `fov` are **not**
in `CameraPose` and are not animatable (deferred — see the spec's "Channels and
value spaces").

**Easing.** `Ease = 'in' | 'out' | 'inOut' | 'linear'`. `out` is `easeOutCubic`,
`in` is `t³`, `inOut` is a symmetric cubic, `linear` is identity. Each clamps `t` to
`[0,1]`. Default ease for tweens is `'inOut'`.

---

## Composition: base + velocity + oscillation

Within a clip, each channel's value is the **sum of three independent layers**, a
pure function of `t`:

```
final[ch](t) = base[ch](t)  +  ∫₀ᵗ vel[ch]  +  osc[ch](t)
```

- **base** — the absolute position track (`set` / `setVec` / `spin`). Eased,
  interpolated in the channel's space.
- **vel** — a velocity ramp (`rate`). Integrated in **closed form** (no per-frame
  accumulator), so it is frame-rate-independent and scrubable.
- **osc** — an additive, zero-mean oscillation (`oscillate`).

**The single-writer rule.** A channel may have at most **one base writer active at a
time**. Two overlapping base writers on the same channel (e.g. two `dollyTo`s inside
one `all`) is a clash and is **rejected at registration time** by
`validateSingleWriter` — it throws naming both windows. `vel` and `osc` are additive
layers and never clash with `base` or each other. This is why `spin('yaw')` +
`oscillate('pitch')` + `rate('distance')` coexist freely, but `all([dollyTo(…),
dollyTo(…)])` does not.

> **Velocity does not cross the clip boundary.** The handoff between clips (and to
> the resting camera) is a single `CameraPose` — position only. A clip's residual
> `rate` momentum and `osc` phase **die at the clip's end** by design. A motion that
> should *look* continuous hands off to another clip (e.g. a tour dwell uses a
> perpetual `dwellDrift` clip), not to the resting camera.

---

## The primitive catalog

All constructors live in `src/services/engine/animation/effectHelpers.ts`. They
return plain `Effect` objects (a tagged union) — serializable, inspectable, testable.

### Camera motion

| Helper | Signature | What it does |
| --- | --- | --- |
| `tween` | `tween(ch, { to, over, ease?, space? }) → CameraAction` | Absolute move of one **scalar** channel to `to` over `over` seconds. `space` defaults from `CHANNEL_SPACE[ch]`, `ease` defaults `'inOut'`. The base primitive the others wrap. |
| `dollyTo` | `dollyTo(mpc, over, ease?) → CameraAction` | `tween('distance', { to: mpc, over, ease })` — pull/push the camera to a distance in **Mpc** (log space). |
| `moveTarget` | `moveTarget(to: Vec3, over, ease?) → CameraAction` | Move the look-at `target` to a world position. Emits ONE `setVec` action (the Vec3 channel stays one action), interpolated component-wise. |
| `aimAt` | `aimAt({ yaw, pitch }, over, ease?) → Effect` | Rotate to a bearing — an `all([ set('yaw'…), set('pitch'…) ])`. `yaw` takes the shortest arc. |
| `spin` | `spin(ch, { by, over, ease?, loop? }) → CameraAction` | Add `by` radians to an angle channel over `over` seconds. `loop: true` makes it **perpetual** (never completes) — the orbit idiom. A base-layer writer. |
| `rate` | `rate(ch, { to, over, ease? }) → CameraAction` | Ramp the channel's **velocity** from 0 to `to` over `over` seconds, then **hold that velocity** (within the clip). The "ease rotation in from a standstill" idiom. A vel-layer writer. |
| `oscillate` | `oscillate(ch, { amp, period }) → CameraAction` | Additive zero-mean sine: `amp · sin(2π t / period)`. The gentle pitch-bob / "life during a hold" idiom. An osc-layer writer. |

### Timeline structure & timing

| Helper | Signature | What it does |
| --- | --- | --- |
| `seq` | `seq(children: Effect[]) → Effect` | Play children **in order**; each starts when the previous ends. |
| `all` | `all(children: Effect[]) → Effect` | Play children **concurrently**; the block ends when the **longest** child ends. |
| `fork` | `fork(child: Effect) → Effect` | Start `child` concurrently but **do not** wait for it — the block's duration ignores a fork. A `fork`ed perpetual `spin`/`oscillate` runs "under" the awaited timeline and is cancelled at clip end. |
| `hold` | `hold(sec) → Effect` | A timed **dwell**: advance the clock by `sec` holding the current pose. The "slow down in the middle at a meaningful scale" beat. |
| `wait` | `wait(sec) → Effect` | A pure timeline delay of `sec` seconds — used to offset a following effect or scene cue. |

> `hold` and `wait` are both timeline spacers; the distinction is intent — `hold`
> reads as a deliberate camera dwell, `wait` as a delay before something else fires.
> Both leave the pose where it was.

### Scene effects (visibility, settings, focus)

Scene effects are timeline **cues** — they fire as the clock crosses them, not every
frame. They change what's *drawn*, not where the camera *is*. All five are Layer 1
(a saga-less recording clip uses them directly).

| Helper | Signature | What it does |
| --- | --- | --- |
| `show` | `show(layers: VisibilityLayerKey[], over?) → SceneEffect` | Turn layers **on** (visibility **intent**) and fade them in. `over` omitted → default fade; `0` → instant; `N` → custom seconds. Rides the live fade bridge — dispatches the same settings actions the UI does. |
| `hide` | `hide(layers, over?) → SceneEffect` | Turn layers **off** (intent) and fade them out. Same duration rules. |
| `fade` | `fade(layers, to, over) → SceneEffect` | A **transient** opacity move to `to` (0–1) over `over` seconds that **does not touch intent** — the layer stays loaded/enabled, only its drawn opacity moves. The cross-dissolve / mask / fade-to-black idiom. Writes the clip-owned `clipOpacity` channel (see Opacity below). |
| `scene` | `scene(action: SettingsAction) → SceneEffect` | Dispatch a non-visibility settings change (bias, intensity, flow mode, …). It's the same action a UI control dispatches — every reconcile saga fires for free. |
| `focus` | `focus(ref: SelectionRef \| null) → SceneEffect` | Set selection focus to `ref` (or `null` to clear) — drives the structure-isolation dim. |

**`layers` are `VisibilityLayerKey`s** — the same intent-addressing keys the UI and
`syncVisibilityFades` use (`'flow'`, `'survey'`, `'filaments'`, `'structureRing'`,
`'milkyWayDisk'`, labels, …). A `show`/`hide` on a multi-item layer (e.g. `survey`)
sets the cluster gate; the bridge expands to the items.

---

## Opacity: three channels, multiplied

A layer's rendered alpha is the **product of three independent factors**:

```
final alpha = intentOpacity(bridge)  ×  focusRecession(structureFocus)  ×  clipOpacity(clipPlayer)
```

- **`intentOpacity`** — the settings/visibility bridge. `show`/`hide` move this (and
  the underlying enabled-intent).
- **`focusRecession`** — the structure-isolation dim. `focus(ref)` moves this.
- **`clipOpacity`** — the clip-owned transient channel. `fade()` moves *only* this.
  It defaults to 1 for every untouched layer and **resets to 1 when the clip ends**.

This is why **`fade()` can dim an intent-bearing layer without desyncing it from
intent**: `fade(['galaxies'], 0, 3)` drives `clipOpacity(galaxies) → 0` while
`intentOpacity(galaxies)` stays 1 (galaxies stay loaded). And it's why the "load but
don't show" trick works: `fade(['flow'], 0, 0)` masks the layer to 0, then
`scene(setFlow({ enabled: true }))` raises intent behind the mask, then
`fade(['flow'], 1, 3)` reveals it — no flash.

---

## Worked patterns

**Log-dolly with a turn (the `flyout` spike).**
```ts
const flyout: ClipData = {
  start: 'live',
  timeline: [ all([ dollyTo(29_500, 22, 'inOut'), spin('yaw', { by: 1.1, over: 22 }) ]) ],
};
```

**Perpetual orbit with a bob (the `flowOrbit` spike).** `fork` the bob so it doesn't
extend the duration; `loop` the spin so it never completes.
```ts
const flowOrbit: ClipData = {
  start: 'live',
  timeline: [
    fork(oscillate('pitch', { amp: 0.04, period: 14 })),
    spin('yaw', { by: TWO_PI, over: 90, loop: true }),
  ],
};
```

**Cross-dissolve scene choreography (the `cosmicFlows` spike, abridged).**
```ts
const cosmicFlows: ClipData = {
  start: 'live',
  timeline: [
    hide(['volumes', 'filaments'], 0),                       // instant intent off
    fade(['flow'], 0, 0),                                    // mask flow to 0…
    scene(setFlow({ enabled: true })),                       // …load it behind the mask
    seq([
      hold(2),
      all([ fade(['flow'], 1, 3), fade(['galaxies'], 0, 3) ]), // crossfade (intent untouched)
    ]),
    fade(['flow', 'milkyWay', 'structures', 'labels'], 0, 3),  // per-layer fade to black
  ],
};
```

---

## Layer 1 vs Layer 2 — where clips stop and sagas begin

> **The boundary rule.** A clip is always **non-reactive data**. The moment an
> animation needs a runtime decision ("wait until this galaxy's image loads", "fly to
> whichever structure the user picked"), it is a **saga** that *composes* clips.

- **Layer 1 — clips (this document).** Pure camera + scripted scene cues. Played by
  `startClip` / `playClip`. Used directly by recording spikes, with no saga.
- **Layer 2 — sagas (_Plan C_).** The guided tour: `BeatData`, `visitBeat` /
  `guidedTour`, capture/restore around the clips, `waitUntil(focusReady)`,
  click-to-advance. A beat *plays clips* and `put`s plain Redux actions; it does not
  introduce new clip primitives.

If you're reaching for a primitive that needs to *react* — to input, to load state,
to a user choice — it belongs in a saga, not a clip.

---

## See also

- Design + rationale: [`specs/2026-06-19-animation-system-design.md`](../superpowers/specs/2026-06-19-animation-system-design.md)
- Build plans: [`plans/2026-06-24-animation-clip-model.md`](../superpowers/plans/2026-06-24-animation-clip-model.md) (Plan A — this vocabulary), `…-playclip-seam.md` (Plan B), `…-tour-saga.md` (Plan C)
- Storyboard grammar (what reads well on screen): [`research/2026-06-19-camera-animation-spike-findings.md`](../research/2026-06-19-camera-animation-spike-findings.md)
