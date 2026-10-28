# Geodesic focus moves: design

**Status:** design approved in brainstorming and refactor-ground, 2026-10-27.
**Supersedes:** PR #531 (`worktree-focus-move-interpolation`, base `d1ddaff0c`). That PR could
not be rebased onto main, so this spec rewrites it against main's camera stack. Its maths, its
calibration and its precision fixes carry over, and §2 and §5 restate them so this document
stands alone once #531 closes.

## 1. Intent

Clicking a galaxy, a structure, the Milky Way or Home flies the camera with one ease curve
(`easeOutCubic`) over a fixed 600 ms. Every channel eases on its own, and distance is
interpolated linearly in Mpc. Across skymap's 19-decade scale range that produces an
eleven-order-of-magnitude swing in how fast the scene appears to move: the camera stays far away
and then slams in (§4).

The fix is van Wijk & Nuij's optimal zoom/pan path (IEEE InfoVis 2003). It moves `target` and
`distance` together along one geodesic, at constant perceived velocity, and derives the duration
from the path's length.

The owner wants to compare the two styles on screen, so **both ship as first-class styles** with
a persisted toggle between them:

- **Eased:** today's behaviour, with its duration now tunable.
- **Geodesic:** the van Wijk & Nuij path.

### Goals

- A **Focus moves** select (`Eased` / `Geodesic`) in Settings → Camera controls. It persists
  across reloads, and tours and takeovers never touch it.
- A **Focus moves** section in the DebugPanel with two groups:
  - Eased: duration.
  - Geodesic: ρ, V, the minimum and maximum duration, and the ease.
- A move freezes its style and tuning at click time. Flipping the toggle or dragging a slider
  mid-flight never bends a move already in flight.
- The Eased duration slider also drives the planet follow-approach, which reads the same
  600 ms constant today, so "Eased" means one thing everywhere.

### Non-goals

- **Moves to a moving body on the geodesic.** That is PR 2. In this PR both of the following
  stay eased under either toggle value:
  - **The planet follow-approach.** `watchFocusTweenSaga` hands every `bodyMovesThisFrame` row
    to the follow rows (`watchFocusTweenSaga.ts:92`).
  - **Home.** It tweens to Earth, which the sim clock moves (`watchGoHomeSaga.ts:79-88`), and
    relies on handing off to the follow driver at the framed pose. A geodesic window of up to
    2.2 s with a target frozen at dispatch would let Earth drift that much further before the
    hand-off. Owner ruling, 2026-10-27.

  Both still honour the Eased duration slider.
- **`flyToLonLat` on the geodesic.** It lands with a heading and roll, which the geodesic does
  not model. It stays an eased motion with its own `FLY_TO_LON_LAT_TWEEN_MS` (or the payload's
  override), and the Eased slider does not drive it (my call: that is a different move).
- **Clip-authored geodesic moves in tours.** The `geodesic` effect makes this possible, but
  nothing authors one yet.
- **A toggle on the remote page.** It is not needed to compare the two styles.

### Anti-goals

- **A second camera-evaluation path.** Every focus move still runs through `evaluateFramedClip`.
- **Storing derived values.** The duration is derived from the frozen motion and never stored
  beside it (refactor-ground ruling).
- **The old style as a branch inside the new one.** Each style is a row in one table.

## 2. The model

A view is `(c, w)`: a centre point and a viewport width in world units. Two perceptual
assumptions, that zooming is relative (`dw/w`) and that panning is relative to the current zoom
(`dc/w`), give the metric (their eq. 6):

```
ds² = (ρ²/w²) du²  +  (1/(ρ²w²)) dw²
```

`ρ` is the pan/zoom trade-off. A low ρ makes zooming expensive, so the path stops climbing.
`buildPathTrack` paces `flyPath` with a cousin of this metric. It divides lateral motion by the
camera distance `midDist` (`buildPathTrack.ts:466`), not by `w`, so it matches only up to a
FOV-dependent factor. Don't port it as the same metric.

### 2.1 Units: load-bearing

`bᵢ` adds `w₁² − w₀²` to `ρ⁴(u₁ − u₀)²`, so `u` and `w` must share one world unit. A mismatch
silently shifts the balance between pan and zoom instead of failing.

- **`u`** is the arc position along the straight segment from `target₀` to `target₁`, in Mpc.
  The target path is a straight line; the geodesic bows in `w`, not in world space.
- **`w = 2 · distance · tan(fovY/2)`**, in Mpc. It uses fovY, not fovX, with no aspect factor,
  so the same click traces the same path in a wide window and a tall one.

`geodesicPath` is the one place that converts `(target, distance) ↔ (u, w)`.

### 2.2 Closed form (their eq. 9), u₀ ≠ u₁

```
w(s) = w₀·cosh(r₀) / cosh(ρs + r₀)
u(s) = u₀ + (w₀/ρ²)·sinh(ρs) / cosh(ρs + r₀)
S    = (r₁ − r₀)/ρ
rᵢ   = asinh(−bᵢ)
bᵢ   = (w₁² − w₀² + (−1)ⁱ·ρ⁴·(u₁ − u₀)²) / (2·wᵢ·ρ²·(u₁ − u₀))
```

The sign of `(−1)ⁱ` is `+` for i = 0 and `−` for i = 1. Getting it backwards gives a plausible
path that ends at the mirror of the destination.

### 2.3 The degenerate branch, u₀ = u₁ (pure zoom)

`w(s) = w₀·exp(kρs)`, `S = |ln(w₁/w₀)|/ρ`, `k = −1 if w₁ < w₀ else 1`.

This branch is mandatory, because every re-focus of an already-focused subject is a pure zoom.
Branch on **exact** equality: `S` agrees with this closed form to 9 decimals from Δu = 1e-3
downward, and only `Δu === 0` produces NaN.

### 2.4 The recurring hazard: never subtract two large numbers to get a small one

Three bugs in #531 were the same bug, and none of them failed loudly:

| where           | cancellation                                  | symptom                                              |
| --------------- | --------------------------------------------- | ---------------------------------------------------- |
| `rᵢ`            | the paper's `ln(−b + √(b²+1))`, b up to 1e37  | `−Infinity` for a third of real endpoint pairs       |
| `u(s)`          | the paper's `cosh(r₀)·tanh(…) − sinh(r₀)`     | returns exactly `u₀`, so Δu vanishes                 |
| the target      | `lerp(from, to, u/du)`                        | target quantised to 0.84 Earth radii (M31 → Earth)   |

Each fix is an algebraically equal form whose small answer stays small at every step:

- `asinh` in place of the literal log.
- The `sinh/cosh` identity in place of the literal tanh expression.
- For the target, the second half of the move is measured from the far end with a **reverse
  geodesic**, which cut the tail jitter from 1.5e-2 to 2.8e-13 of the camera distance.

Port all three as written in #531's `zoomPanGeodesic.ts` and `glidePath.ts`.

### 2.5 Animation

The arc length advances as `s = S · ease(t/T)`. The ease reparametrises timing along the path
without deforming it, so on a coupled geodesic it cannot desync anything. The ease must be
monotone:

- Overshoot curves (`*Back`, `*Elastic`) walk the arc past its endpoint, so the camera flies
  through the target and back.
- `*Bounce` curves turn back on themselves, so the camera shuttles along the path.

The ease select therefore lists monotone eases only.

**ρ = 0 is a singularity:** `length` evaluates (∞−∞)/0, giving NaN and a dead camera. ρ is
floored at `GEODESIC_RHO_MIN = 0.001`. The path already converges below about 0.05.

Yaw, pitch and roll stay independent tweens beside the geodesic, on the same ease and the same
window, so the view settles once. The paper does not model orientation.

## 3. Architecture (post-prep)

### 3.1 Data

```ts
// src/@types/camera/FocusMoveStyle.d.ts
type FocusMoveStyle = 'eased' | 'geodesic';

// src/@types/camera/GeodesicTuning.d.ts: one record, never shredded into per-knob params
type GeodesicTuning = { rho: number; velocity: number; minMs: number; maxMs: number; ease: Ease };

// src/@types/camera/FocusMotion.d.ts: frozen into the plan at dispatch
type FocusMotion =
  | { readonly style: 'eased'; readonly durationMs: number; readonly ease: Ease }
  | { readonly style: 'geodesic'; readonly tuning: GeodesicTuning; readonly fovYRad: number };

// CameraTweenDescriptor: `durationMs` and the dead `easing` are replaced by `motion`
type CameraTweenDescriptor = {
  from: CameraPose;
  to: CameraPose;
  motion: FocusMotion;
  frame: OrientationFrameId;
};

// src/@types/settings/FocusMoveSettings.d.ts: the Intent
type FocusMoveSettings = {
  style: FocusMoveStyle;
  eased: { durationMs: number };
  geodesic: GeodesicTuning;
};
```

Unit choices (my calls):

- **Durations are in ms everywhere** (`durationMs`, `minMs`, `maxMs`), to match the descriptor
  and the epoch clock. The sliders display seconds.
- **`velocity`** is geodesic arc-length units per second.

The geodesic motion carries `fovYRad` because the path depends on it (§2.1). Freezing it means a
resize or FOV drag mid-flight cannot bend the move.

### 3.2 One row per style

`src/data/camera/focusMotions.ts` holds `FOCUS_MOTIONS: { [S in FocusMoveStyle]: FocusMotionRow<S> }`.
Each row has two pure functions:

- **`clipOf(d) → ClipData`:**
  - The `eased` row is today's `tweenToClip`, renamed `easedFocusClip` per the "the second
    variant renames the incumbent" rule. It now honours `motion.ease` instead of hardcoding it.
  - The `geodesic` row returns one `geodesic` effect over target and distance, `all`-ed with
    yaw, pitch and roll tweens over the same window and ease.
- **`durationMsOf(d) → number`:**
  - Eased returns `motion.durationMs`.
  - Geodesic returns `clamp(S / velocity, minMs, maxMs)` from `geodesicPath`.
- **`easeOf(d) → Ease`:** `motion.ease` for eased, `motion.tuning.ease` for geodesic. The
  lookOffset fade reads it.

`focusMoveClip(d)`, `focusMoveDurationMs(d)` and `focusMoveEase(d)` look up the row; they are
the only entry points.
`focusMoveClip` keeps the incumbent's WeakMap memo on descriptor identity, so `evaluateClip`'s
compile cache still holds across frames.

**The geodesic clip and the end check agree by construction.** `clipOf` passes
`over: durationMsOf(d) / 1000` to the effect explicitly, so the number that sizes the clip is
the same number `stepCameraRuntime` compares against.

The three readers of the old `durationMs` call `focusMoveDurationMs(d)`:

- `stepCameraRuntime.ts:285`: the end check.
- `cameraDrivers.ts:334`: the lookOffset fade, which also takes `focusMoveEase(d)` in place of
  its hardcoded `easeOutCubic`.
- The clip builders.

### 3.3 The composite track and the `geodesic` effect

After prep 1, `CompositeTrack` (formerly `PathTrack`) has this shape:

```
{ startSec, endSec, channels: readonly Channel[], sample(localSec) → values for those channels }
```

- **Evaluator.** `evaluateClip` overlays a composite's declared channels onto the base layer;
  every other channel evaluates from base tracks as usual.
- **Validator.** `validatePathExclusivity` checks only the declared channels.
- **`flyPath`.** It declares `['target', 'distance', 'yaw', 'pitch']`, the channels it writes.
  Behaviour change: a roll tween inside a `flyPath` window stops throwing. The evaluator already
  reads roll from base there (`evaluateClip.ts:612`), and the `channels`/`sample` key sets can
  no longer disagree.

The new `Effect` variant:

```ts
| { readonly kind: 'geodesic'; readonly to: { target: Vec3; distance: number };
    readonly tuning: GeodesicTuning; readonly fovYRad: number; readonly over?: number }
```

- It compiles through one new case in `compileClip`'s `never`-guarded switch, to
  `buildGeodesicTrack`, which returns a `CompositeTrack` with
  `channels: ['target', 'distance']`. `over` omitted means the arc-length duration.
- It carries the whole tuning record and the FOV, so the compile path needs no FOV threading and
  no per-knob fields. Two of #531's backlog items go away with this.
- `resolveClipFoci`, `clipFociReady` and `applyPathTuning` pass it through via their defaults.
  That is correct, because it names no focus id.

### 3.4 Producers: Intent → frozen plan

- **`resolveFocusMotion(settings: FocusMoveSettings, fovYRad) → FocusMotion`** (pure, in
  `src/utils/camera/`) is the only place settings become motion. Eased produces
  `{ durationMs: settings.eased.durationMs, ease: 'easeOutCubic' }`.
- **`watchFocusTweenSaga`** selects `FocusMoveSettings`, calls `resolveFocusMotion`, and passes
  the motion in. **`watchGoHomeSaga`** always builds an eased motion from
  `settings.eased.durationMs`, because Home targets moving Earth (§1).
  `focusTweenDescriptor(row, from, fovYRad, motion, frame)` takes the motion, not the settings
  (narrow contracts). It keeps `fovYRad` because structure and body framing need it for
  `framingPose` (`focusTweenDescriptor.ts:56`), and the eased motion does not carry it.
- **`watchFlyToLonLatSaga`** builds `{ style: 'eased', durationMs, ease: 'easeOutCubic' }`
  directly and never calls `resolveFocusMotion`.

### 3.5 Settings, persistence, UI

- **Default style.** `DEFAULT_FOCUS_MOVES.style` is `'eased'` until the owner has judged
  Geodesic on screen and rules the switch (agreed in brainstorming). This also keeps every
  headless profile (shot, perf, capture, golden traces) on today's timing.
- **Slice.** `src/state/settings/core/focusMovesSlice.ts` holds `FocusMoveSettings`, seeded from
  `DEFAULT_FOCUS_MOVES` in `src/data/camera/`. Reducers: `setFocusMoveStyle`,
  `setEasedDuration`, `setGeodesicTuning(Partial<GeodesicTuning>)`.
- **Persistence.** A `FOCUS_MOVE_STYLE` row in `PERSISTED_VALUES` persists **the style only**.
  The tuning resets to the calibrated defaults on reload, like the other DebugPanel tuning
  boards (my call).
- **Kept out of tours.** `CORE_SNAPSHOT_CLUSTERS` is an allow-list, so the slice stays out of
  tour snapshots with no edit.
- **Settings select.** `CameraControlsSection` gets a "Focus moves" select, shown under both
  control schemes. `CameraControlsSectionContainer` reads the second slice.
- **DebugPanel.** `FocusMovesTuningSection` is built on `DebugTuningSection` from two
  slider-field tables (`easedSliderFields.ts`, `geodesicSliderFields.ts` in `src/data/camera/`)
  plus the ease `<select>` (non-overshoot eases only), the pattern `StarCatalogTuningSection`
  uses. Read `ui-ux.md` and use the `create-component` skill before building it.

### 3.6 Follow-approach duration (PR 1 part)

- **Today.** `followPose` eases over the `FOCUS_TWEEN_MS` module constant (`cameraDrivers.ts:172`).
- **Change.** `FollowMemory` gains `durationMs: number | null`, captured with `from` at
  activation from `ctx.state.settings.focusMoves.eased.durationMs`. `DriverCtx` is not widened.
- **Deleted.** `FOCUS_TWEEN_MS` and `focusTweenDuration.ts`. The default lives in
  `DEFAULT_FOCUS_MOVES.eased.durationMs = 600`.

### 3.7 Per-frame cost

At the worst pose, one tween row evaluates one geodesic sample per frame (a few `cosh`/`sinh`
plus one reverse sample) and one `focusMoveDurationMs` per frame (one `asinh` pair). It does
nothing per galaxy. That is negligible, so no perf gate is needed.

## 4. Measured expectations

These are from #531, so re-measure after the port.

**The reversal metric is a dead end.** Today's path is a dead-straight line by construction:
`cam(t) = cam(0) + e(t)·[Δ·û − (d₁−d₀)·F]`. Both styles score 0 reversals, so the metric
distinguishes nothing. Never build a test on it.

**Perceived-velocity CV is the metric to pin:**

| move                | today (easeOutCubic) | geodesic  |
| ------------------- | -------------------- | --------- |
| star → Milky Way    | CV 15.30             | **0.000** |
| Earth → nearby star | CV 3.64              | **0.000** |
| MW → Virgo          | CV 2.49              | **0.000** |
| galaxy → galaxy     | CV 0.89              | **0.000** |

## 5. Calibration: settled by eye

```
ρ = 0.18   V = 20   duration = clamp(S / V, 600 ms, 2200 ms)   ease = easeOutQuint
```

Two calibrations derived from measurement both lost to a visual pass:

- **ρ = 1.42**, the paper's value, makes a galaxy click rise to 8.79× its endpoint distance,
  which reads as an unwanted zoom-out. Peak pull-back against ρ:

  | ρ    | 1.42 | 1.0  | 0.6  | 0.35 | 0.15 |
  | ---- | ---- | ---- | ---- | ---- | ---- |
  | peak | 8.79 | 4.44 | 1.85 | 1.13 | 1.00 |

- **`'linear'`** lost to easeOutQuint on arrival dwell, the time the target spends between 0.6×
  and 1× of its final size: 8.8 % against 61.5 %.

At ρ = 0.18 the arc length is close to bimodal, so most moves land on a clamp bound. That is the
price of a path that does not climb. Re-tune on screen with the sliders; don't re-derive.

## 6. Ground preparation

The refactor-ground checkpoint was signed off 2026-10-27, with one PR and the prep as its own
commits.

**Ideal diff.** The feature should land as:

- a `geodesic` row in `FOCUS_MOTIONS`;
- an `Effect` variant plus one `compileClip` case;
- the ported pure files;
- a settings slice plus a persisted row;
- a DebugPanel section and a select;
- a `FollowMemory` field.

**Verdicts:**

| touchpoint                                      | verdict  | joint                                                          |
| ----------------------------------------------- | -------- | -------------------------------------------------------------- |
| composite writer over target + distance         | bolt-on  | a path owns the whole pose (`evaluateClip.ts:614-620`, `compileClip.ts:383-392`) |
| a second style's clip and duration              | bolt-on  | fixed `durationMs` plus ease hardcoded at `tweenToClip.ts:65-75` and `cameraDrivers.ts:334` |
| end check                                       | bolt-on  | reads the stored `durationMs` (`stepCameraRuntime.ts:285`)      |
| `geodesic` effect                               | growth   | `compileClip`'s exhaustive switch                               |
| settings slice + persisted style                | growth   | `coreSettingsSlices`, `PERSISTED_VALUES`                        |
| tour exclusion                                  | growth   | `CORE_SNAPSHOT_CLUSTERS` is an allow-list                       |
| Settings select / DebugPanel section            | growth   | `CameraControlsSection`, `DebugTuningSection` + field tables    |
| follow duration                                 | growth   | `FollowMemory` field; `ctx.state` already carries settings      |
| geodesic maths                                  | growth   | new pure files                                                 |

**Prep commits, in order, behaviour-preserving except where noted:**

1. **`PathTrack` → `CompositeTrack`, which declares its `channels`.** The evaluator overlays only
   the declared channels and the validator checks only those. `flyPath` declares the four it
   writes; the one behaviour change is the legal roll tween from §3.3. Use `npm run refactor` /
   `npm run move-files` for the renames.
2. **The tween plan carries a `motion`.** This commit:
   - adds the `FOCUS_MOTIONS` table with the `eased` row only;
   - renames `tweenToClip` to `easedFocusClip`, behind `focusMoveClip`;
   - adds `focusMoveDurationMs`;
   - deletes the dead `easing` field;
   - points the three duration readers at the function.

   All producers write `{ style: 'eased', durationMs: <today's value>, ease: 'easeOutCubic' }`,
   so the behaviour is identical.

The greenfield cross-check agreed with the sketch except on storing the duration, which was
resolved toward deriving it.

## 7. Testing (what can break)

Follow `testing.md`. Port #531's tests and adapt them.

**`zoomPanGeodesic`** (the paper is the oracle):

- Endpoints are exact. This fails on the literal `u(s)`.
- `length` matches the degenerate closed form as Δu → 0. This fails on a wrong branch or a
  wrong ρ exponent.
- Every output is finite from Earth-surface scale (about 2e-16 Mpc) to the observable universe.
  This fails on the literal `rᵢ`.
- Direction: the path ends at `u₁`, not `−u₁`.
- **Perceived-velocity CV is about 0.** This is the test that guards the feature.

**`geodesicPath`:**

- The tail of the target sits within a physical bound of the camera distance on M31 → Earth.
  This fails without the reverse geodesic.
- The FOV changes `w` (inputs chosen *inside* the clamp, and asserted to be).
- ρ = 0 is floored and stays finite.

**Composite overlay (prep 1):**

- A `geodesic` window leaves a concurrent yaw tween live.
- A base `distance` writer that overlaps the window throws.
- A roll tween inside a `flyPath` window evaluates instead of throwing.
- The existing `flyPath` tests stay green unchanged.

**`focusMoveDurationMs` and the end check:**

- The geodesic clip's `endSec` equals `focusMoveDurationMs(d) / 1000`.
- The end check cancels on the first frame past it.

**Producers:**

- The saga's descriptor carries the motion `resolveFocusMotion` returns for the store's
  settings at dispatch.
- `flyToLonLat` and Home are always eased, and Home follows the Eased duration slider.
- The persisted style round-trips, and garbage parses to the default.

**Follow:** a duration captured at activation survives a later settings change mid-approach.

**Do not test:** constants restated, `channels` contents mirrored back, or a reversal metric.

**Assertions that go blind under re-tuning** (four bit #531):

- If a value can be clamped, assert that it is not before comparing it.
- Never put an absolute `toBeCloseTo` on a quantity that spans decades; use relative error
  (port `tests/support/relErr.ts`).
- Ask of each assertion: would this still fail if someone re-tuned the calibration?

## 8. Delivery

- **One PR.** Commits: prep 1, prep 2, the ported geodesic core with its tests, the `geodesic`
  effect and `buildGeodesicTrack`, the `geodesic` row with `resolveFocusMotion` and the
  producers, the settings slice with persistence, the follow duration, then the UI (select and
  DebugPanel section).
- **Visual check.** Before/after pairs (Eased against Geodesic) on galaxy → galaxy,
  MW → Virgo and star → Milky Way, with deep links.
- **Close #531.** Once the new draft PR is open, close #531 with a pointer to it (owner ruling,
  2026-10-27).
- **PR 2** puts the follow-approach and Home on the geodesic. It needs its own spec section, because the
  endpoint moves every frame and the duration stays frozen at activation (#531's `followBody`
  notes).
