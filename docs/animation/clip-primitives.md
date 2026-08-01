# Clip primitives — authoring reference

> **What this is.** A reference for everyone authoring or implementing animation
> _clips_ — the serializable, frame-clocked camera+scene animations the renderer
> plays. It is the consolidated API surface; for the _rationale_ (why a clip is
> data, why the pose is pure, why opacity composes) read the design spec
> [`2026-06-19-animation-system-design.md`](../superpowers/specs/2026-06-19-animation-system-design.md)
> and the build plans under [`docs/superpowers/plans/2026-06-24-animation-*.md`](../superpowers/plans/).
>
> **Status.** The clip vocabulary, the compile/evaluate pipeline, the `playClip`
> seam and the guided-tour saga layer are all built and live. This file tracks the
> code in `src/services/engine/animation/` and `src/@types/animation/`; keep it in
> sync when a helper's signature or default changes. Anything marked _(Layer 2)_ is
> the tour orchestration in `src/state/tour/`, not a clip primitive.

---

## The one-paragraph mental model

A **clip** is a plain serializable object (`ClipData`) — a timeline of `Effect`s.
The camera **pose** at any instant is a **pure** function `evaluateClip(data, t)`:
no per-frame accumulator, no hidden state, same `(data, t)` in → same pose out. The
clip's **scene** changes (show a layer, fade it, change a setting, set focus) are
_cues_ that fire edge-triggered from a frame-ticked `clipPlayer` as the clock
crosses them. You **author** clips with the one-line helper constructors below; you
never write the raw `{ kind: … }` objects by hand.

```ts
import { dollyTo, spin, all } from '../services/engine/animation/effectHelpers';

const flyout: ClipData = {
  start: 'live', // begin from wherever the camera is now
  timeline: [
    all([
      // these two run together
      dollyTo(29_500, 22, 'inOut'), // log-dolly out to the horizon shell
      spin('yaw', { by: 1.1, over: 22 }), // with a gentle turn
    ]),
  ],
};
```

Play it with the `playClip` seam (from a saga, `yield* call(playClip, clip)`). The
camera is owned by the `clip` driver (priority 95) for the clip's duration, then the
final pose bakes back into the resting camera and control returns to the user.

---

## `ClipData` — the clip envelope

```ts
type ClipData = {
  start?: CameraPose | 'live'; // fixed start pose, or 'live' = capture the live pose at play time. Default 'live'.
  timeline: Effect[]; // played in order; an entry may itself be concurrent (all / fork)
};
```

- **`start: 'live'`** (the default when absent) is resolved **once, before compile**
  — the clip player reads the live rendered pose and rewrites `start` to a concrete
  `CameraPose` (via `resolveClipStart`). The evaluator never sees `'live'`; this is
  what keeps `evaluateClip` pure and makes clip→clip handoff seamless. `compileClip`
  substitutes a zero-pose placeholder for an unresolved `'live'` so a pre-resolution
  compile can't crash.
- **`CameraPose` = `{ target: Vec3; yaw; pitch; distance }`.** That four-field set is
  exactly what a clip can animate — see Channels below.
- **There is no `preroll` field.** A clip that wants to hold its opening pose before
  anything moves opens its timeline with a `wait(sec)` — the cursor advances by
  `sec` and every following window/cue lands later by exactly that much. The data
  model keeps one way to express a lead-in, not two.

---

## Channels and value spaces

A clip animates the **four fields of `CameraPose`**, and nothing else. Each channel
interpolates in its natural **space** so motion reads correctly:

| Channel    | Space | Why                                                                                                |
| ---------- | ----- | -------------------------------------------------------------------------------------------------- |
| `distance` | `log` | "Powers of Ten" — uniform decades/sec. Linear distance crams all the change into the last instant. |
| `yaw`      | `add` | Angles add; `yaw` uses **shortest-arc** interpolation (`lerpAngleShortest`) at the call site.      |
| `pitch`    | `add` | Angles add.                                                                                        |
| `target`   | `lin` | A `Vec3`, interpolated component-wise in linear space.                                             |

`CHANNEL_SPACE` is the single canonical record of these mappings
(`src/services/engine/animation/channelSpace.ts`); the helpers default a channel's
space from it, so you rarely pass `space` explicitly. Log interpolation is
`exp(lerp(ln(from), ln(to), t))` (`lerpInSpace`); `add` and `lin` are both plain
`lerp`. `roll` and `fov` are **not** in `CameraPose` and are not animatable
(deferred — see the spec's "Channels and value spaces").

**Easing.** `Ease = 'in' | 'out' | 'inOut' | 'linear'`. `out` is `easeOutCubic`
(`1 - (1 - t)³`), `in` is `t³`, `inOut` is a symmetric cubic
(`t < 0.5 ? 4t³ : 1 - (-2t+2)³/2`), `linear` is identity. Each clamps `t` to
`[0,1]` (`EASE` in `ease.ts`). Default ease for every helper that takes one is
`'inOut'`.

---

## Composition: base + velocity + oscillation

Within a clip, each channel's value is the **sum of three independent layers**, a
pure function of `t`:

```
final[ch](t) = base[ch](t)  +  ∫₀ᵗ vel[ch]  +  osc[ch](t)
```

- **base** — the absolute position track (`set` / `setVec` / `spin`, plus the
  composite `flyPath`). Eased, interpolated in the channel's space. Between segments
  the channel holds its most recent value.
- **vel** — a velocity ramp (`rate`). Integrated in **closed form** (linear ease is
  analytic; other eases use a 64-step Simpson quadrature), so it is
  frame-rate-independent and scrubable. Multiple ramps on a channel form an override
  chain.
- **osc** — an additive, zero-mean oscillation (`oscillate`).

**The single-writer rule.** A channel may have at most **one base writer active at a
time**. Two overlapping base writers on the same channel (e.g. two `dollyTo`s inside
one `all`) is a clash, **rejected at compile time** by `validateSingleWriter` — it
throws naming both windows (windows are half-open `[start, end)`, so segments that
merely touch at an endpoint do not clash). `vel` and `osc` are additive layers and
never clash with `base` or each other. This is why `spin('yaw')` +
`oscillate('pitch')` + `rate('distance')` coexist freely, but `all([dollyTo(…),
dollyTo(…)])` does not.

**A `flyPath` is a composite base writer** — it drives all four channels over its
window. `compileClip` runs a companion check, `validatePathExclusivity`, that throws
if any `set`/`setVec`/`spin` base segment overlaps a `flyPath` window. So don't also
drive the camera with `dollyTo` / `moveTarget` / `set` inside a `flyPath`'s window.

> **Velocity does not cross the clip boundary.** The handoff between clips (and to
> the resting camera) is a single `CameraPose` — position only. A clip's residual
> `rate` momentum and `osc` phase **die at the clip's end** by design. A motion that
> should _look_ continuous hands off to another clip (e.g. a perpetual drift clip),
> not to the resting camera.

---

## The primitive catalog

All constructors live in `src/services/engine/animation/effectHelpers.ts`. They
return plain `Effect` objects (a tagged union) — serializable, inspectable, testable.

### Camera motion

| Helper       | Signature                                                            | What it drives / does                                                                                                                                                                                                                    |
| ------------ | -------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tween`      | `tween(ch, { to, over, ease?, space? }) → CameraAction`              | **base** on one **scalar** channel (`'distance' \| 'yaw' \| 'pitch'` — `'target'` is a compile error). Absolute move to `to` over `over` s. `space` defaults from `CHANNEL_SPACE[ch]`, `ease` `'inOut'`. The primitive the others wrap.  |
| `dollyTo`    | `dollyTo(mpc, over, ease?) → CameraAction`                           | **base / distance.** `tween('distance', { to: mpc, over, ease })` — pull/push to a distance in **Mpc** (log space).                                                                                                                      |
| `moveTarget` | `moveTarget(to: Vec3, over, ease?) → CameraAction`                   | **base / target.** Emits ONE `setVec` action; the Vec3 `target` moves as a unit, interpolated component-wise in `'lin'`.                                                                                                                 |
| `aimAt`      | `aimAt({ yaw, pitch }, over, ease?) → Effect`                        | **base / yaw + pitch.** `all([ tween('yaw', …), tween('pitch', …) ])` — rotate to a bearing. Shortest-arc for yaw is the evaluator's job.                                                                                                |
| `spin`       | `spin(ch, { by, over, ease?, loop? }) → CameraAction`                | **base**, additive: add `by` radians over `over` s (typically an angle channel; `ch` is the full `Channel`). `loop: true` makes it **perpetual** — a linear continuation past `endSec`, the orbit idiom.                                 |
| `rate`       | `rate(ch, { to, over, ease? }) → CameraAction`                       | **vel.** Ramp the channel's **velocity** from the carried-in velocity to `to` over `over` s, then hold that velocity (within the clip). The "ease rotation in from a standstill" idiom.                                                  |
| `oscillate`  | `oscillate(ch, { amp, period, over?, fade?, ease? }) → CameraAction` | **osc.** Additive zero-mean sine `amp · env(t) · sin(2π t / period)`. Perpetual by default; pass `over` (window length) + `fade` (amplitude ramp seconds) to ease amplitude `0 → amp → 0` across the window. Stays zero-mean throughout. |

### Focus-addressed camera helpers (deferred resolution)

These are the **unresolved** forms — they carry a durable `FocusId` instead of a
concrete `Vec3` / distance, and `resolveClipFoci` rewrites them to the concrete
helper output before `compileClip` runs (see "Focus IDs" below). Use them when the
target isn't known at authoring time and must be looked up from the catalog at play
time.

| Helper         | Signature                                                  | Resolves to                                |
| -------------- | ---------------------------------------------------------- | ------------------------------------------ |
| `moveTargetId` | `moveTargetId(id, over, ease?) → FocusBoundEffect`         | `moveTarget(framing.target, over, ease)`   |
| `dollyToId`    | `dollyToId(id, over, ease?) → FocusBoundEffect`            | `dollyTo(framing.distance, over, ease)`    |
| `lookAtId`     | `lookAtId(id, over, ease?) → FocusBoundEffect`             | `aimAt(bearing, over, ease)`               |
| `strafeId`     | `strafeId(id, byDeg, over, ease?) → FocusBoundEffect`      | `moveTarget(displaced target, over, ease)` |
| `spinToId`     | `spinToId(id, { over, turns?, ease? }) → FocusBoundEffect` | `spin('yaw', { by, over, ease })`          |

> **`lookAtId` — turn your head before you walk.** The orbit camera always faces
> its target, so it cannot rotate in place; "looking at" a subject means
> orbiting the eye around the CURRENT target until the subject lines up
> centre-frame beyond it. The bearing (`orbitAnglesLookingAlong` of subject −
> live orbit target) is baked at **resolve time**, so a `lookAtId` is only
> correct before anything else moves the target — establish the shot as the
> clip's opening move, then fly (`focusOnId`). Target and distance are untouched:
> the view swings, the camera stays put (up to the orbit-sphere arc).
>
> **`strafeId` — slide sideways without turning.** The lateral tracking move:
> the live orbit target displaces along the horizontal right axis of the
> bearing toward the subject (`forward × worldUp`), by `tan(byDeg) × live
camera distance` — angular, so it reads the same at every scale. Positive
> strafes the rig right (whatever sat at the old target drifts ~`byDeg`°
> screen-left); a distant subject barely moves. At the exact `lookAtId`
> bearing the old target stacks dead in front of the subject, so the idiom is
> `all([lookAtId(id, t), strafeId(id, deg, t)])` — composable because the
> strafe writes `target` while the aim writes yaw/pitch. Same resolve-time
> caveat as `lookAtId`: an opening move, not a mid-clip one.
>
> **`spinToId` — orbit the yaw until it faces a subject.** `resolveClipFoci`
> derives `by` as the SHORTEST-arc yaw delta from the live pose to the
> subject's bearing (a sightline, not a frame-local radian constant, so the
> same authored effect lands on the same subject under any live orientation
> frame). **Trap:** `opts.turns` is not additive on top of an arbitrary
> value — it composes ON the shortest-arc base delta (`by = shortest + turns ×
2π`), so `turns: -1` means "the shortest way round, minus one full
> revolution", not "spin exactly one revolution". Pitch/target/distance are
> untouched — it composes with a concurrent `dollyTo`/`moveTarget` in the same
> `all` the way `strafeId` does. `dwellDrift`'s `spinTo` option (below) is the
> beat-authoring surface for this primitive — it swaps the dwell's usual raw
> `spin('yaw')` cruise for a `spinToId` bearing.

`aimAlong(forward: Vec3, over, ease?) → Effect` swings the view to face a
FIXED **world-space** direction — `orbitAnglesLookingAlong` resolved through
whichever orientation frame is live at clip start, the same mechanism
`lookAtId` uses. **Trap:** unlike every helper in the table above, it has NO
live-pose dependency — `forward` alone determines the aim, there is no subject
to look up and no orbit target read. That is what makes it (not `lookAtId`)
the right tool for a pose that must be reproducible regardless of where the
camera happened to be before the clip started: `openingTitle`'s cold open uses
it for exactly this reason — a `lookAtId` there would silently depend on
whatever pose the viewer wandered into before the tour started. `over: 0` is a
legal snap, same as `aimAt`.

### Timeline structure & timing

| Helper | Signature                          | What it does                                                                                                                                                                                         |
| ------ | ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `seq`  | `seq(children: Effect[]) → Effect` | Play children **in order**; each starts when the previous ends. Block duration is the sum.                                                                                                           |
| `all`  | `all(children: Effect[]) → Effect` | Play children **concurrently**; the block ends when the **longest** child ends.                                                                                                                      |
| `fork` | `fork(child: Effect) → Effect`     | Start `child` concurrently but **do not** wait for it — the block's duration ignores a fork. A `fork`ed perpetual `spin`/`oscillate` runs "under" the awaited timeline and is cancelled at clip end. |
| `hold` | `hold(sec) → Effect`               | A timed **dwell**: advance the clock by `sec` holding the current pose. The "slow down at a meaningful scale" beat.                                                                                  |
| `wait` | `wait(sec) → Effect`               | A pure timeline delay of `sec` seconds — mechanically identical to `hold`; used to offset a following effect or scene cue (and to open a clip's lead-in).                                            |

> `hold` and `wait` are both timeline spacers; the distinction is intent — `hold`
> reads as a deliberate camera dwell, `wait` as a delay before something else fires.
> Both leave the pose where it was.

### Camera paths (`flyPath`)

A `flyPath` flies a smooth spline through a list of waypoints, owning all four
camera channels for its window (a single composite base writer). Unlike chained
`seq([moveTarget, …])` tweens (which corner at each point), the path is C1-smooth,
arc-length-reparametrised in **scale space** (lateral motion normalised by distance

- radial motion in log-distance), so perceived speed is uniform by default. The eye
  itself rides the spline; the look-at `target` is derived back from eye + aim.

**The launch is a knot you don't author.** The clip's start pose (usually
`'live'`) is the path's first spline knot — the path flies out of wherever the
camera is, and `align` eases the live orientation into the down-the-path aim.
Don't author a waypoint for where the camera already is.

| Helper    | Signature                                           | What it does                                                                                                                                                                 |
| --------- | --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `atPoint` | `atPoint(at: Vec3, distance, opts?) → PathWaypoint` | A waypoint at a concrete world position + distance (Mpc). Waypoint `opts` below.                                                                                             |
| `atFocus` | `atFocus(id: FocusId, opts?) → PathWaypoint`        | The **unresolved** waypoint form: `resolveClipFoci` rewrites it to an `atPoint`-shaped waypoint (framed position + distance + subject `radius`) before compile. Same `opts`. |
| `flyPath` | `flyPath(waypoints, opts) → Effect`                 | Fly the spline through `waypoints` over `opts.over` **cruise** seconds (a dwell ADDS wall-clock time on top). See the opts + defaults below.                                 |

The two waypoint forms **interleave freely**: sweep through named subjects with
`atFocus` and drop hand-placed `atPoint` control points between them where the
catalog positions alone would bend the curve wrong.

**Per-waypoint `opts`** (both forms):

| Opt              | Meaning                                                                                                                                                                                                                                                                                                        |
| ---------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `over?`          | Seconds allotted to the leg **leading into** this waypoint. Omit and the leg takes its arc-length share of the path total (uniform perceived speed — the default); pin one to slow a stretch down, and the remaining unpinned legs split what's left by arc length.                                            |
| `yaw?`, `pitch?` | Pin the bank/tilt at this waypoint. Omit (the common case) and the approach angle interpolates across the leg — you sweep _through_ subjects rather than banking precisely at each. Yaw is unwrapped so interpolation always takes the short way around.                                                       |
| `linger?`        | Per-target brake ∈ [0,1], overriding the path-level `linger`: a local velocity dip centred on this waypoint (slow on approach, short tail past). `0` cruises straight through — the **pass-through idiom** for waypoints that only shape the curve (see `neighbourhoodFlythrough`); `1` eases to a ~12% crawl. |

The path never fully **stops** at a waypoint — a stop is a beat dwell (a separate
clip), not a path feature.

`flyPath` opts and the defaults the helper stamps (from `pathDefaults.ts`):

| Opt         | Type           | Default (helper)                                                                    | Meaning                                                                                                                                                                                                                           |
| ----------- | -------------- | ----------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `over`      | `number`       | _(required)_                                                                        | Total **cruise** seconds. A dwell adds time; the real end is `endSec = startSec + totalSec`.                                                                                                                                      |
| `ease`      | `Ease`         | `'inOut'`                                                                           | The whole-path accel/decel envelope — used **only when `rampSec` is 0**; otherwise the trapezoid wins.                                                                                                                            |
| `align`     | `number`       | `DEFAULT_ALIGN_SEC = 1.35`                                                          | Seconds to blend the live orientation into the down-the-path aim at the start (capped at half the take).                                                                                                                          |
| `rampSec`   | `number`       | `DEFAULT_RAMP_SEC = 1.4`                                                            | Ramp seconds at each end for a trapezoidal speed envelope (short accel, long cruise, short decel). `0` opts out to the named `ease`.                                                                                              |
| `linger`    | `number`       | `DEFAULT_LINGER = 0.7`                                                              | Per-target dwell **depth** ∈ [0,1] applied at every waypoint (1 ≈ a 12%-speed crawl, never a freeze). A per-waypoint `linger` overrides it. Needs `lingerSec > 0`.                                                                |
| `lingerSec` | `number`       | `DEFAULT_LINGER_SEC = 1.4`                                                          | Dwell window **width** in wall-clock seconds — how long the slow moment lasts per target, whatever the depth (`linger` sets how slow, `lingerSec` how long). The crawl **leads** the knot (slow on approach, short tail past it). |
| `spline`    | `SplineConfig` | `DEFAULT_SPLINE_CONFIG = { kind: 'causalHermite', turnDelay: 1.1, lookAhead: 1.3 }` | Which basis fits the waypoints (see below).                                                                                                                                                                                       |
| `passBy`    | `PassByConfig` | `DEFAULT_PASS_BY_CONFIG = { offset: 4, dir: 'outsideBend' }`                        | How the eye flies **past** interior galaxy waypoints instead of through them (see below).                                                                                                                                         |

**`SplineConfig` — a discriminated union**, so a basis's knobs can't be set on a
basis that ignores them:

- `{ kind: 'centripetal' }` — centripetal (α=0.5) Catmull-Rom. Banks toward the next
  waypoint before arriving. Carries no extra knobs.
- `{ kind: 'causalHermite'; turnDelay?; lookAhead? }` — cubic Hermite whose arrival
  tangent is the incoming chord (arrives **head-on**, turns after passing).
  `turnDelay` scales the tangent magnitude / overshoot (default
  `DEFAULT_TURN_DELAY = 1.1`); `lookAhead` (seconds) leads the look down the path
  ahead of the eye (default `DEFAULT_LOOK_AHEAD = 1.3`).

The **authoring default the `flyPath` helper stamps is `causalHermite`** (head-on
arrival reads best flying between discrete subjects). `buildPathTrack`'s own
direct-call default — for callers that bypass the helper — is neutral `centripetal`.

**`PassByConfig`** displaces interior eye knots laterally so the eye sweeps _past_ a
subject rather than ramming it: `offset` is the lateral distance in units of the
subject's **radius** (0 = through-centre; ~4 fills roughly a third of frame), and
`dir` names which perpendicular to the local travel direction:

- `'outsideBend'` _(default)_ — the outside of the path's turn at that knot: the
  eye arcs around the galaxy on the convex side, the galaxy on the inside of the
  curve. Organic, but the screen-side varies per waypoint; on a near-straight leg
  (no bend to speak of) it falls back to `'above'`.
- `'above'` — world-up perpendicular: the eye passes over the top and the galaxy
  sweeps **downward** through frame. Consistent and documentary.
- `'screenSide'` — the travel-right perpendicular (tangent × up): the galaxy
  drifts consistently across one side of frame horizontally.

Only interior waypoints with a non-zero subject radius (galaxies, via `atFocus`) are
displaced; structures resolve to radius 0 and are flown through-centre, so a groups
flythrough with the default `passBy` is untouched. Hand-placed `atPoint` control
points carry no radius and are never displaced. The final waypoint is the
**destination** — the eye pulls back to its framing distance and ends framed on it,
never sailing past.

---

### Scene effects (visibility, settings, focus)

Scene effects are timeline **cues** — they fire as the clock crosses them, not every
frame. They change what's _drawn_, not where the camera _is_.

| Helper    | Signature                                                           | What it does                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| --------- | ------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `show`    | `show(layers: VisibilityLayerKey[], over?) → SceneEffect`           | Turn layers **on** (visibility **intent**) and fade them in. `over` omitted → default fade; `0` → instant; `N` → custom seconds. Rides the live fade bridge — dispatches the same settings actions the UI does.                                                                                                                                                                                                                                        |
| `hide`    | `hide(layers, over?) → SceneEffect`                                 | Turn layers **off** (intent) and fade them out. Same duration rules.                                                                                                                                                                                                                                                                                                                                                                                   |
| `fade`    | `fade(layers, to, over) → SceneEffect`                              | A **transient** opacity move to `to` (0–1) over `over` seconds that **does not touch intent** — the layer stays loaded/enabled, only its drawn opacity moves. The cross-dissolve / mask / fade-to-black idiom. Writes the clip-owned `clipOpacity` channel (see Opacity below). Resets to 1 at clip end.                                                                                                                                               |
| `scene`   | `scene(action: SettingsAction) → SceneEffect`                       | Dispatch a non-visibility settings change. `SettingsAction` is a **narrow** union — `setFlowEnabled`, `setFlow`, `setGalaxyCatalogVisible`, `setLabelsFocusedOnly` — widened as tour beats need more knobs. It's the same action a UI control dispatches; every reconcile saga fires for free. `setLabelsFocusedOnly(true)` is the tour's label declutter: only the focused subject's label draws (multiplies on top of the per-layer label toggles).  |
| `focus`   | `focus(id: FocusId \| null) → FocusBoundEffect`                     | Build an **unresolved** `focusId` cue addressed by a durable `FocusId` (`null` clears focus). `resolveClipFoci` rewrites it to the concrete `{ kind: 'focus', ref }` `SceneEffect` at play time. On a **structure** ref this engages focus mode — non-member galaxies dim toward 0.08 (a per-galaxy geometric isolation) and drop out of picking, while surrounding layers (filaments, volumes, structure rings, labels) recede. `null` releases both. |
| `frameTo` | `frameTo(frame: OrientationFrameId, { over, ease? }) → SceneEffect` | Roll the horizon to another orientation frame over `over` seconds (`ease` defaults `'easeInOutCubic'`). The eye does **not** move and its aim does not change — only which way is up. Authored **in the clip**, never on the beat, so an act owns its pole; a clip pins the frame it started under, so a switch mid-clip cannot reinterpret its authored yaws. A tour restores the viewer's pre-tour frame when it ends.                               |

**`layers` are `VisibilityLayerKey`s** — the intent-addressing keys the UI and
`syncVisibilityFades` use. The full set is:
`'milkyWayDisk'`, `'proceduralDisks'`, `'texturedDisks'`, `'volumesMaster'`,
`'milkyWayLabel'`, `'surveyLabel'`, `'scaleBar'`, `'structureRing'`,
`'structureLabel'`, `'survey'`, `'filaments'`, `'flow'`, `'volumeField'`. A
`show`/`hide` on a multi-item layer (e.g. `'survey'`) sets the cluster gate; the
bridge expands to the items.

`show`/`hide` (not `fade`) additionally accept two authoring extensions inline
in the same list:

- **The `'labels'` aggregate** — every text label
  (`surveyLabel` + `structureLabel` + `milkyWayLabel`), expanded to atomic keys
  at construction.
- **Scoped `'family:scope'` entries** — address ONE item where the bare key
  fans over all: `'survey:milliquas'` (one catalog), `'structureRing:group'`
  (one structure category — structure settings items ARE the four categories),
  and the unified label namespace `'label:milkyWay'` / `'label:survey'` /
  `'label:structure'` / `'label:group'` (etc. per category). Template-literal
  typed, so a bad scope is a compile error. Scoped entries dispatch one
  targeted settings action at fire time and fade via the reactive
  settings→fade bridge — a custom `over` applies to the atomic layers only.

### Focus IDs and deferred resolution

Seven helpers produce **unresolved** id-bearing effects (`FocusBoundEffect` arms
`moveTargetId` / `dollyToId` / `lookAtId` / `strafeId` / `spinToId` / `focusId`,
plus `atFocus` waypoints inside a `flyPath`). They carry a durable `FocusId`
string rather than a concrete `Vec3` / distance / `SelectionRef`, so a clip can
be authored at module-load time — before any catalog is loaded — and resolved
against whichever tier is live at play time. `resolveClipFoci` walks the
timeline and rewrites each one:

- `moveTargetId(id, …)` → `moveTarget(framing.target, …)`
- `dollyToId(id, …)` → `dollyTo(framing.distance, …)`
- `lookAtId(id, …)` → `aimAt({ yaw, pitch }, …)` — the bearing from the **live
  camera pose** (passed into `resolveClipFoci` from the camera runtime) at the
  subject's framed position
- `strafeId(id, byDeg, …)` → `moveTarget(displaced, …)` — the live orbit target
  displaced along the bearing's horizontal right axis by `tan(byDeg) × live
camera distance`
- `spinToId(id, { over, turns?, ease? })` → `spin('yaw', { by, over, ease })`
  — `by` is the shortest-arc yaw delta from the live yaw to the subject's
  bearing, plus `turns` full revolutions (see the callout above — `turns`
  composes ON the shortest arc, not on a zero baseline)
- `focus(id)` → `{ kind: 'focus', ref }` (an id of `null` → `{ kind: 'focus', ref: null }`)
- a `flyPath` with `atFocus` waypoints → the same `flyPath` with each id-waypoint in
  `at`-form (gaining its subject `radius`); the `flyPath` itself survives into
  `compileClip` (it is not consumed away).

`aimAlong` is resolved in the same pass (its `forward` needs the live
orientation frame basis to encode into a bearing) but carries no `FocusId` — it
is not one of the seven above, and never blocks `clipFociReady`.

`compileClip` **throws** if it ever sees an unresolved arm — resolution must precede
it (a readiness gate, `clipFociReady`, guarantees every id resolves first). The
framing (`{ target, distance, radius }`) comes from
`resolveFocusId → extractSelectionRow → focusFraming`.

---

## Opacity: three factors, multiplied

A layer's rendered alpha is the **product of three independent factors**:

```
final alpha = intentOpacity(bridge)  ×  focusRecession(structureFocus)  ×  clipOpacity(clipPlayer)
```

- **`intentOpacity`** — the settings/visibility bridge (the shared `FadeRegistry` +
  the intent-bridge fade). `show`/`hide` move this (and the underlying
  enabled-intent).
- **`focusRecession`** — the structure-focus **layer** recession: under focus the
  surrounding layers (filaments, volumes, structure rings, labels) dim toward their
  recession targets. Galaxy points do **not** recede here. `focus(id)` moves this.
- **`clipOpacity`** — the clip-owned transient channel (`ClipOpacityChannel`, one
  private `FadeController` per layer, lazily created). `fade()` moves _only_ this. It
  defaults to 1 for every untouched layer and **resets to 1 when the clip ends**.

> **Galaxy points carry one extra factor, off this product.** Under structure focus
> the points shader multiplies each galaxy's alpha by a per-vertex **isolation**
> factor: non-members of the focused structure ramp to 0.08, members stay 1.0. It is
> geometric (distance from the structure centre vs its radius), driven by the same
> `focus(id)` / `selection.focus`, and is **galaxy-only** — not part of the layer
> product above. This is what makes `focus(id)` "dim everything that isn't in this
> cluster"; `focusRecession` handles the chrome, the isolation factor handles the
> galaxy field.

This is why **`fade()` can dim an intent-bearing layer without desyncing it from
intent**: `fade(['survey'], 0, 3)` drives `clipOpacity(survey) → 0` while
`intentOpacity(survey)` stays 1 (galaxies stay loaded). And it's why the "load but
don't show" trick works: `fade(['flow'], 0, 0)` masks the layer to 0, then
`scene(setFlowEnabled(true))` raises intent behind the mask, then
`fade(['flow'], 1, 3)` reveals it — no flash.

---

## Worked patterns

**Log-dolly with a turn (the `flyout` idiom).**

```ts
const flyout: ClipData = {
  start: 'live',
  timeline: [all([dollyTo(29_500, 22, 'inOut'), spin('yaw', { by: 1.1, over: 22 })])],
};
```

**Perpetual orbit with a bob (the `flowOrbit` idiom).** `fork` the bob so it doesn't
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

**Cross-dissolve scene choreography (the `cosmicFlows` idiom, abridged).** Note the
concrete layer keys.

```ts
const cosmicFlows: ClipData = {
  start: 'live',
  timeline: [
    hide(['volumeField', 'filaments'], 0), // instant intent off
    fade(['flow'], 0, 0), // mask flow to 0…
    scene(setFlowEnabled(true)), // …load it behind the mask
    seq([
      hold(2),
      all([fade(['flow'], 1, 3), fade(['survey'], 0, 3)]), // crossfade (intent untouched)
    ]),
    fade(['flow', 'milkyWayDisk', 'structureRing', 'structureLabel'], 0, 3), // per-layer fade to black
  ],
};
```

**Flythrough a set of named subjects (the `flyPath` idiom).** Waypoints addressed by
`FocusId`; the helper stamps the cinematic defaults (causal-Hermite spline, dwell,
fly-past), resolved against the live catalog at play time.

```ts
const groupTour: ClipData = {
  start: 'live',
  timeline: [flyPath([atFocus('ngc5128'), atFocus('m83'), atFocus('cen-a-group')], { over: 40 })],
};
```

---

## Layer 1 vs Layer 2 — where clips stop and sagas begin

> **The boundary rule.** A clip is always **non-reactive data**. The moment an
> animation needs a runtime decision ("wait until this galaxy's image loads", "fly to
> whichever structure the user picked"), it is a **saga** that _composes_ clips.

- **Layer 1 — clips (this document).** Pure camera + scripted scene cues. Played by
  the `playClip` seam. Used directly by recording spikes and the clip-path inspector.
- **Layer 2 — the tour (`src/state/tour/`).** The guided tour: `Tour` + `BeatData`
  (`caption`, `dwellSec`, `clip`), `guidedTourSaga` / `visitBeatSaga`,
  capture/restore around clips, click-to-advance. Beat clips are built by helpers
  like `flyToClip(id)` (camera only) and `flyAndFocusOnClip(id)` (prepends a
  `focus(id)` cue). A beat _plays clips_ and `put`s plain Redux actions; it does not
  introduce new clip primitives.

If you're reaching for a primitive that needs to _react_ — to input, to load state,
to a user choice — it belongs in a saga, not a clip.

**`dwellDrift` (Layer 2) as an authoring surface over a Layer 1 primitive.**
`dwellDrift(durationSec, opts?)` — the canonical ambient dwell every beat
authors as `dwellClip: dwellDrift(sec)` — normally sizes its yaw layer from a
raw `cruiseRate` (rad/s). `opts.spinTo?: FocusId` swaps that for a `spinToId`
bearing instead: the dwell orbits until it FACES a subject rather than
covering an authored rate, landing on the same subject under any live
orientation frame. `opts.turns?: number` rides along, passed straight through
to `spinToId` (same shortest-arc-plus-revolutions trap as above). `spinTo` and
`cruiseRate` are mutually exclusive — `spinTo` REPLACES the yaw layer
`cruiseRate` would have sized, not composes with it — and `dwellDrift` throws
at build time if both are given.

---

## See also

- Design + rationale: [`specs/2026-06-19-animation-system-design.md`](../superpowers/specs/2026-06-19-animation-system-design.md)
- Build plans: [`plans/2026-06-24-animation-clip-model.md`](../superpowers/plans/2026-06-24-animation-clip-model.md) (clip vocabulary), `…-playclip-seam.md` (the play seam), `…-tour-saga.md` (the tour)
- Storyboard grammar (what reads well on screen): [`research/2026-06-19-camera-animation-spike-findings.md`](../research/2026-06-19-camera-animation-spike-findings.md)
