# Perceptually uniform focus moves — design

Failed prior attempt: `5da4feac` (log-space distance channel), reverted by `e7acdc55`, which
carries the measurements. The branch `investigate-log-space` preserves it.
Model: van Wijk & Nuij, "Smooth and Efficient Zooming and Panning", IEEE InfoVis 2003.

---

## 1. What we're building

A focus move eases `target` (Vec3) and `distance` (scalar) as two independent channels with
their own curves. What the viewer perceives is the camera position — their composition — so
neither channel's curve controls what the eye actually sees. This replaces the two channels
with one geodesic through van Wijk & Nuij's (u, w) view space, and derives the move's
duration from the geodesic's length instead of pinning every move at 600 ms.

### Goals

- One composite writer owns `target` + `distance` for a focus move; the two channels stop
  being independently authored.
- Move duration is derived from path length, so a hop across a galaxy and a descent to a
  planet surface no longer take the same 600 ms.
- `dollyTo` (pure zoom, no target change) is a first-class case, not a degenerate accident.

### Non-goals (deferred, named — see §7)

- `followBody`, the third interpolation path. Approaching a followed body keeps the old feel.
- Anything that makes a leaf star grow before its sphere handoff.

### What this does NOT fix

Named up front because the brief that seeded this spec expected otherwise. **Approaching a
planet is not on this path.** `watchFocusTweenSaga.ts:97` short-circuits any focus row that
`liveBodyPosition` resolves — every body in `deriveBodyStates`, so every planet — before a
tween descriptor is ever built. The planet approach is `followBody`'s hand-rolled
`lerp(from.distance, distanceTarget, easeOutCubic(t))` (`cameraDrivers.ts:339-349`), which
has the same root cause and is out of scope here (§7).

---

## 2. The model

A view is `(c, w)`: centre point and viewport **width in world units**. Two perceptual
assumptions — zooming is relative (`dw/w`), panning is relative to current zoom (`dc/w`) —
give the metric (their eq. 6):

```
ds² = (ρ²/w²) du²  +  (1/(ρ²w²)) dw²
```

`ρ` is the pan/zoom trade-off and enters **asymmetrically**: it is not a shape knob on a
symmetric metric. High ρ ⇒ zooming counts for little, so the optimal path bows further out.
View space under this metric is hyperbolic; optimal paths are geodesics, which render as
"zoom out, travel, zoom in".

**This metric already ships here.** `buildPathTrack.ts:459-463` measures `flyPath` arc length as
`ds = sqrt(angular² + dLog²)` with `angular = lateral / midDist` — which is exactly the
above at ρ = 1, since `angular = du/w` and `dLog = dw/w` up to the constant relating `w` to
`distance`. The idea is not foreign to the codebase; it is already the thing that makes a
flythrough feel evenly paced.

### 2.1 Units — load-bearing

`b_i` (below) adds `w₁² − w₀²` to `ρ⁴(u₁ − u₀)²`, so `w` and `u` must be in the same world
units or the pan/zoom balance silently shifts.

- `u` is arc position along the straight segment from `target₀` to `target₁`, in Mpc.
  `Δu = |target₁ − target₀|`; the 3-D target is `target₀ + (u − u₀)·û`. The **target path is
  a straight line** — the geodesic bows in `w`, not in world space.
- `w = 2 · distance · tan(fovY/2)`, in Mpc. Not `distance`. Dropping the factor would not
  crash and would not look obviously wrong; it would just move the balance.
- **fovY, not fovX, and no aspect factor** — deliberate. Folding in aspect would make the
  same focus click trace a different path on a wide window than a tall one.

### 2.2 Closed form (their eq. 9), u₀ ≠ u₁

```
w(s) = w₀·cosh(r₀) / cosh(ρs + r₀)
u(s) = u₀ + (w₀/ρ²)·sinh(ρs) / cosh(ρs + r₀)          ← restructured; see landmine 2
S    = (r₁ − r₀)/ρ
rᵢ   = asinh(−bᵢ),                                                    i = 0,1   ← landmine 1
bᵢ   = (w₁² − w₀² + (−1)ⁱ·ρ⁴·(u₁ − u₀)²) / (2·wᵢ·ρ²·(u₁ − u₀)),        i = 0,1
```

The sign in `bᵢ` is `+` for i = 0 and `−` for i = 1. Getting it backwards produces a
plausible-looking path that ends at the mirror image of the destination (`u(S) = −u₁`) —
verified while transcribing, and not something a smoke test would catch.

**Landmine 1 — `asinh`, never the paper's literal.** The paper writes
`rᵢ = ln(−bᵢ + √(bᵢ² + 1))`. For large positive `b` that subtraction cancels catastrophically:
in three of four skymap-scale cases measured, `Math.log(-b + Math.sqrt(b*b+1))` returns
**`-Infinity`** where `Math.asinh(-b)` returns a correct finite value near −25. `b` is
routinely 1e10+ here because our moves are far more zoom-dominated than the 2-D map browsing
the paper was written for. `Math.asinh(−b)` is mathematically identical and stable.

**Landmine 2 — the literal `u(s)` loses the endpoints too.** The paper's
`(w₀/ρ²)·cosh(r₀)·tanh(ρs + r₀) − (w₀/ρ²)·sinh(r₀) + u₀` subtracts two ~1e18-magnitude
quantities whose difference is the answer. Measured: at Δu = 1e-9 Mpc it returns exactly `0`
for `u(S)` instead of 1e-9 — total loss. Applying `tanh A − tanh B = sinh(A−B)/(cosh A cosh B)`
folds the subtraction away and gives the form above, which returns the endpoints exactly.

### 2.3 The degenerate branch, u₀ = u₁

`bᵢ` divides by `(u₁ − u₀)`, so pure zoom needs its own arm:

```
w(s) = w₀·exp(kρs),   S = |ln(w₁/w₀)|/ρ,   k = −1 if w₁ < w₀ else 1
```

This is `dollyTo`, and every re-focus of an already-focused subject, so the branch is
**mandatory, not an optimisation**.

With the two stabilisations above it is a strict division-by-zero guard, not an epsilon band.
Measured on a 10 → 1000 Mpc zoom, sweeping Δu from 1 down to 1e-100 Mpc: `S` agrees with the
degenerate closed form to 9 decimals from Δu = 1e-3 downward, and `u(S)` stays exact
throughout. Only `Δu === 0` produces NaN. Branch on exact equality; do not invent a
tolerance.

### 2.4 Animation

`s = V·t`, so `duration = S/V` — distance-proportional, derived rather than chosen.

An `ease` applied as `s = S · EASE(t/T)` reshapes **timing along** the geodesic without
deforming the geodesic itself, since the path is the image of `s ↦ (u(s), w(s))` and easing
only reparametrises it. So keeping an `ease` on the move costs nothing structurally.

**Default to `'linear'`.** Constant `s` velocity is what makes perceived velocity constant —
it is the entire claim of the model, and it is precisely the property the current
`easeOutCubic` destroys (an ease-out spends its last decade of scale in its last few frames,
which is the "arrives too fast / grows in the last two frames" symptom). Any non-linear ease
trades the feature's premise for softer endpoints. Authored clips may still opt in; focus
moves should not.

Overshoot curves (`easeInOutBack`, `*Elastic`) are unsafe here for an unusual reason: `s > S`
or `s < 0` walks the geodesic _past_ its endpoint. That is well-defined, so nothing throws —
the camera simply flies through the target and back.

### 2.5 The paper's own caveats, and ours

- **V = 0.9 is unusable here.** Measured `S` for skymap-scale moves is 4–31; at V = 0.9 that
  is 4–35 second animations. Their user study covered 2-D map browsing over ~4 orders of
  magnitude; we span 19+. `V` was re-derived and clamped — §5.1, §5.3.
- **ρ**: 1.42 (sd 0.47) is the value their users chose; ρ = 6^(1/4) ≈ 1.565 is derived from
  RMS perceived velocity. The paper notes √2 "is possibly an optimal value, but we have not
  found yet a model to explain this." We keep 1.42, but see §5.1 — for skymap's moves ρ turns
  out to be a far weaker knob than the paper's framing suggests.
- The optimality argument assumes **uniform visual density at every scale** — the paper
  admits this "can only be met by artificial imagery with fractal characteristics". Skymap
  has vast empty voids, so this is violated in a specific way: a geodesic can bow out into
  nothing and spend real time showing nothing.
- The model is explicitly **perceptual only**, discarding cognitive factors, and the study's
  variance was "much larger than we expected".

---

## 3. Architecture — data delta first

Written against the post-prep architecture (§6).

### 3.1 The pure math

```ts
// src/utils/camera/zoomPanGeodesic.ts — one exported function (utils/ one-symbol rule)
export type ZoomPanGeodesic = {
  /** Total path length in the (u, w) metric. Duration is S/V. */
  readonly length: number;
  /** s ∈ [0, length] → the (u, w) view at that arc position. */
  readonly at: (s: number) => { readonly u: number; readonly w: number };
};

export function zoomPanGeodesic(
  u0: number,
  w0: number,
  u1: number,
  w1: number,
  rho: number,
): ZoomPanGeodesic;
```

Pure, unit-agnostic, no knowledge of `CameraPose`, Mpc, or FOV — the paper's model and
nothing else. `u` is scalar; lifting it back onto `û` is the caller's job.

### 3.2 The composite track

`PathTrack` becomes a general composite track carrying the channels it owns:

```ts
// src/@types/animation/CompiledClip.d.ts
export type CompositeTrack = {
  readonly startSec: number;
  readonly endSec: number;
  readonly channels: readonly Channel[];
  readonly sample: (localSec: number) => Partial<CameraPose>;
};
```

`CompiledClip.pathTracks` → `compositeTracks`. `flyPath` declares all four channels, so it is
behaviour-neutral. `evaluateClip`'s path arm (`evaluateClip.ts:462-482`) stops being an
all-or-nothing `if/else` and merges per channel: for each channel, the latest-started
composite track that declares it wins, else the base layer.

### 3.3 The `glide` effect arm

```ts
// src/@types/animation/Effect.d.ts — a new arm, alongside `flyPath`
| { readonly kind: 'glide';
    readonly to: { readonly target: Vec3; readonly distance: number };
    readonly over?: number;      // omitted ⇒ derived from path length
    readonly rho?: number;
    readonly ease: Ease; }
```

**On `Effect`, not `CameraAction`** — a correction to the shape this spec was seeded with.
Every `CameraAction` arm carries a single `ch: Channel` and is a per-channel writer
(`CameraAction.d.ts:58-105`); `flyPath`, the existing composite writer, is an `Effect` arm
(`Effect.d.ts:83-134`) precisely because it isn't one. `glide` is a composite writer, so it
belongs where `flyPath` is.

`glide` needs the clip's start pose to know `from`, exactly as `flyPath` does — `compileClip`
already threads `acc.start` for that reason (`compileClip.ts:98-100`).

### 3.4 The builder

`src/services/engine/animation/buildGlideTrack.ts`, sibling to `buildPathTrack.ts`: takes
`{ start, startSec, to, over?, rho?, ease, fovYRad }`, converts to `(u, w)`, calls
`zoomPanGeodesic`, and returns a `CompositeTrack` over `['target', 'distance']` whose
`sample` maps `s` back to `{ target, distance }`.

`fovYRad` is a new input to the compile path. `buildPathTrack` does not need it; `glide`
does, because `w` is defined through it.

When `over` is absent the builder derives it from the geodesic it just computed:
`clamp(S / GLIDE_VELOCITY, GLIDE_MIN_SEC, GLIDE_MAX_SEC)`. Those three constants plus
`GLIDE_RHO_DEFAULT` live in one module beside `zoomPanGeodesic` — they are meaningless apart
and were calibrated together (§5.1).

### 3.5 Rewiring

| Site                         | Change                                                          |
| ---------------------------- | --------------------------------------------------------------- |
| `tweenToClip.ts:61-76`       | one `glide` + the existing `yaw`/`pitch` tweens (§5.2)          |
| `focusTweenDescriptor.ts:52` | `durationMs` derived from path length, not `FOCUS_TWEEN_MS`     |
| `watchGoHomeSaga.ts:81`      | second `startCameraTween` producer; same derivation             |
| `compileClip.ts:375-393`     | `validatePathExclusivity` validates against declared channels   |
| `focusTweenDuration.ts`      | `FOCUS_TWEEN_MS` becomes a clamp bound, not the duration (§5.3) |

---

## 4. Measured expectations — state these honestly

- **RECONCILED — and the reversal metric is a dead end. Do not build a test on it.**
  Re-measured in full 3-D with real constants, sweeping the angle between the view direction
  and the direction of travel. `e7acdc55` was right and the earlier prototype was wrong:
  **today's path has 0 reversals at every angle, and `path length / net displacement` is
  exactly 1.0000** — it is a perfectly straight line. That is forced, not lucky:

  ```
  cam(t) = target₀ + e(t)·Δ·û − (d₀ + e(t)·(d₁−d₀))·F        (yaw/pitch unchanged ⇒ F fixed)
         = cam(0)  + e(t)·[Δ·û − (d₁−d₀)·F]
  ```

  A fixed vector scaled by a monotone scalar. No ease and no view angle can bend it. The
  reverted log-space variant is the only one that reverses (1 reversal, `path/net` 1.0858,
  and only when `F` is parallel to travel). **The geodesic also scores 0**, so the metric
  cannot distinguish the models and must not become the pinning test.

- **What actually differs is perceived velocity — this is the metric to pin.** Under the
  paper's own metric `ds/dt = sqrt((ρ²/w²)u̇² + (1/(ρ²w²))ẇ²)`, which the geodesic holds
  constant by construction:

  | move                | today (lin + `easeOutCubic`) | today (lin + linear ease) | glide              |
  | ------------------- | ---------------------------- | ------------------------- | ------------------ |
  | star → Milky Way    | max/min 1.28e11, CV 15.30    | 8.00e3, CV 13.66          | **1.00, CV 0.000** |
  | Earth → nearby star | 5.04e9, CV 3.64              | 1.08e2, CV 1.97           | **1.00, CV 0.000** |
  | MW → Virgo          | 1.58e9, CV 2.49              | 3.32e1, CV 1.25           | **1.00, CV 0.000** |
  | galaxy → galaxy     | 4.80e7, CV 0.89              | **1.00, CV 0.000**        | **1.00, CV 0.000** |

  So the "wobble" was never a direction flip — it is an eleven-order-of-magnitude swing in
  how fast the scene appears to move along a dead-straight path.

- **The middle column carries a second result worth acting on.** For galaxy → galaxy the
  current channel model is _already_ perfectly uniform once the ease is linear (CV 0.000);
  `easeOutCubic` alone is what inflates it to 4.80e7. For the most common focus click in the
  app, the ease is the entire defect and the geodesic changes nothing. This is independent
  confirmation of the `'linear'` default in §2.4, and it means the ease change should land as
  its own commit so its effect is separately visible.
- **The star case improves modestly as a fraction, hugely in absolute terms.** Above the 4 px
  sphere-handoff threshold for 12.2 % of the move, vs 2.0 % today. Not the ~36 % a naive
  gap-decay model predicts, because the geodesic spends real time zoomed out doing the pan.
  §7 explains the hard ceiling on the fraction. But the fraction is the wrong number to judge
  by: with the duration settled (§5.3) the same move runs 4.0 s rather than 600 ms, so the
  star is resolved for **~0.49 s ≈ 29 frames at 60 fps, against ~0.7 frames today.** Most of
  the win comes from the duration, not the path.

---

## 5. Calibration (settled) and the one open decision

### 5.1 ρ and V — SETTLED: ρ = 1.42, V = 6, duration clamped to [0.4 s, 4 s]

Swept ρ ∈ [0.8, 3.0] against real skymap constants (`scratchpad/calib.mjs`). The headline: **ρ
is near-irrelevant for the case that motivated this work.** Star → Milky Way peaks at exactly
1.00× its endpoint distance at every ρ, because the destination view (`w₁` ≈ 0.173 Mpc) is
already ~21× wider than the 8.2 kpc journey — the endpoint frames the whole path, so no
geodesic bows out. The wobble is fixed by the _coupling_, not by the pull-back. ρ only bites
when both endpoints are close-in and far apart:

| case                          | peak pull-back, ρ = 0.8 → 3.0 |
| ----------------------------- | ----------------------------- |
| star → Milky Way              | 1.00× at every ρ              |
| Earth → observable universe   | 1.00× … 3.96×                 |
| MW → Virgo                    | 1.19× … 12.9×                 |
| galaxy → galaxy, 50 Mpc apart | 2.95× … 39.0×                 |
| Earth → nearby star           | 3.6e6× … 5.2e7×               |

Earth → star's 1.14e-6 Mpc peak at ρ = 1.42 is near-forced, not a tuning artifact: framing a
1.301e-6 Mpc separation at all requires distance ≥ 1.13e-6 Mpc. Both endpoints hug their
bodies' surfaces, so the camera has to go there whatever the metric says. Lowering ρ to 0.8
buys 3.2× less pull-back and pays for it in low-altitude panning.

At ρ = 1.42, `S` spans 4.03 (galaxy → galaxy) to 31.3 (Earth → universe), so `S/V` cannot
serve both ends without a clamp. V = 6 puts the common galaxy click at 0.67 s — matching the
600 ms `FOCUS_TWEEN_MS` the InfoCard list was tuned around — and the deep descents at 3.3–5.2 s.

### 5.2 Does yaw/pitch stay independent? — OPEN

The proposed shape keeps them as ordinary scalar tweens beside the glide. V&N does not model
orientation, and angles are scale-free so they do not suffer the 1/d problem that motivates
the whole change. But the pull-back and the turn would then be timed independently — the same
class of composition the feature exists to remove, one axis over. Focus moves currently carry
yaw/pitch through unchanged (`focusTweenDescriptor.ts:51`), so today the question is moot for
focus and live only for authored clips.

### 5.3 Duration clamp — SETTLED: [0.4 s, 4 s]

The paper's V = 0.9 gives 22–35 s moves at our scale range; their user study covered 2D maps
over ~4 decades, we span 19. V is not transferable and needed its own derivation (§5.1).

The clamp's cost is explicit: a clamped move is no longer perceptually uniform, because time
stops tracking `S`. At V = 6 only Earth → universe (5.21 s) and Earth → star (4.53 s) hit the
4 s ceiling, so uniformity survives for every move short of a full-scale-ladder descent. A 2.5 s
ceiling was rejected for clamping three of five sampled cases to an identical duration —
discarding uniformity exactly where the feature was supposed to earn it.

Resulting durations at ρ = 1.42, V = 6:

| case                        | duration                   |
| --------------------------- | -------------------------- |
| galaxy → galaxy             | 0.67 s                     |
| MW → Virgo                  | 0.83 s                     |
| star → Milky Way            | 3.29 s                     |
| Earth → nearby star         | 4.00 s (clamped from 4.53) |
| Earth → observable universe | 4.00 s (clamped from 5.21) |

The 0.4 s floor preserves what `focusTweenDuration.ts`'s docblock protects — rapid clicking
through the InfoCard list must not feel sluggish.

---

## 6. Ground preparation

Ideal-diff pass run 2026-07-31. Blockers below were verified by opening the files.

### Prep (own commits, sequenced first)

**P1 — generalise `PathTrack` → `CompositeTrack` (J1). The only real joint.**
`PathTrack` (`CompiledClip.d.ts:184-189`) is already a composite writer superseding the base
layer for all four channels, and its docblock (`:170-176`) says why: `flyPath`'s arc-length
reparametrisation "COUPLES the four channels through one shared path parameter". The seam
exists. What does not exist is a composite writer owning a _subset_:
`validatePathExclusivity` (`compileClip.ts:375-393`) loops `ALL_CHANNELS` and throws with
"A flyPath owns all camera channels for its window", so a glide owning `target` + `distance`
while `yaw`/`pitch` stay on the base layer is currently inexpressible. **Bolt-on without P1.**

Scope: `channels: readonly Channel[]` on the track; `sample` returns `Partial<CameraPose>`;
validation against the declared set; per-channel merge in `evaluateClip`. Behaviour-neutral —
`flyPath` declares all four.

**P2 — thread `fovYRad` into the compile path.** `w` is defined through the FOV (§2.1) and
`compileClip`/`evaluateClip` currently take only `frameBasis`. Same shape as the existing
optional `frameBasis` parameter, including its compile-cache implication: the cache
(`evaluateClip.ts:114-123`) keys on `(ClipData, frameBasis)` and gains `fovYRad`. A
continuously-varying FOV would thrash it — FOV is stable in practice, but the cache key is
where that assumption now lives, so it needs saying.

### Growth / bolt-on verdicts

| Touchpoint                              | Verdict                                                  |
| --------------------------------------- | -------------------------------------------------------- |
| `PathTrack` / `validatePathExclusivity` | **Bolt-on without P1** — composite ⇒ all-four-or-nothing |
| `compileClip` / `evaluateClip` FOV      | **Bolt-on without P2** — no FOV reaches the compile path |
| `CameraTweenDescriptor.durationMs`      | Growth — already per-descriptor                          |
| `Effect` union                          | Growth — `flyPath` is the precedent arm                  |
| `buildPathTrack` sibling slot           | Growth — `buildGlideTrack` is a peer, not an edit        |
| `src/utils/camera/`                     | Growth — folder exists, one-function-per-file            |

**J2 — per-move duration is growth, no prep.** Verified: `durationMs` is already per-descriptor
(`CameraTweenDescriptor.d.ts:17`); `tweenToClip.ts:55` and `runFrame.ts:327` read it off the
descriptor; `selectCameraActive` (`state/camera/selectors.ts:49-58`) gates on **presence**
(`c.tween !== null`), never elapsed-vs-duration. A computed duration flows through untouched.
`FOCUS_TWEEN_MS` is merely the value the two producers currently write
(`focusTweenDescriptor.ts:52`, `watchGoHomeSaga.ts:81`).

**J3 — the "statelessness mismatch" is not real.** V&N recommend recomputing the path each
frame; our model compiles once from fixed endpoints. These trace the identical curve, because
geodesics are unique: the geodesic from any point on one to the same destination is a subset
of the original. Recomputation exists to absorb mid-flight parameter changes, which we do not
do — a new focus mid-tween builds a whole new descriptor from the live pose
(`CameraTweenDescriptor.d.ts:5-8`). The `WeakMap` compile cache in `tweenToClip.ts` stays
valid. Recorded because it is the kind of thing that gets re-litigated.

### PR packaging

**One PR.** P1 and P2 ride with the feature as their own commits. Prep, the `Effect`/builder
work, and the rewiring are three different diffs regardless.

---

## 7. Out of scope — named so the boundary is legible

- **`followBody`** (`cameraDrivers.ts:290-350`, ease at `:339-349`) is a third interpolation
  path outside `evaluateClip`, with its own progress state on `CameraClock` and a bespoke
  duration-coupled wake predicate (`shouldKeepTicking.ts:106-110`). Untouched here, so every
  focus on an orbital body — every planet — keeps the old feel, per §1.
  → [`docs/backlog/2026-07-31-followbody-third-interpolation-path.md`](../../backlog/2026-07-31-followbody-third-interpolation-path.md)
- **The leaf-star sprite floor.** A leaf star's drawn radius is
  `max(STAR_GLOW_MIN_PX, 0) · sizeScale · overlap` (`starCatalog/vertex.wesl:347`,
  `STAR_GLOW_MIN_PX = 1.5` at `shaders/lib/starPhotometry.wesl:42`) — **no distance
  dependence at all**, so it cannot grow before the `STAR_RESOLVE_PX = 4` sphere handoff
  (`frame/partitionStarsByResolution.ts:43`; WESL twin `vertex.wesl:251`). This is the hard
  ceiling on §4's 12.2 %: no camera-side change can make a star resolve earlier.
- **`target` vel/osc broadcasting one scalar to x/y/z** (`evaluateClip.ts:496-506`) —
  documented limitation, unrelated.

---

## 8. Testing (what can break)

The geodesic math wants property and oracle tests, not restated constants
([`testing.md`](../conventions/testing.md)). The paper **is** the spec, so the `Ease` table's
approach applies directly: `tests/services/engine/animation/ease.test.ts:30-32` transcribes
easings.net verbatim as an independent oracle rather than deriving expectations from the
source. Do the same with eq. 9.

**`zoomPanGeodesic`:**

- Endpoints exact: `at(0) === (u₀, w₀)`, `at(length) === (u₁, w₁)`. This is the assertion that
  fails on landmine 2 — the literal `u(s)` returns 0 instead of Δu at Δu = 1e-9.
- `length` matches the degenerate closed form `|ln(w₁/w₀)|/ρ` in the limit Δu → 0. Verified
  to agree to 9 decimals from Δu = 1e-3 downward; this is the test that catches a wrong
  degenerate branch or a wrong ρ exponent.
- No non-finite output across the full scale range (Earth surface ~2e-16 Mpc → observable
  universe). This is the assertion that fails on landmine 1 — the literal `r` returns
  `-Infinity`, which poisons `length` and every sample.
- Direction: a move with `u₁ > u₀` ends at `u₁`, not `−u₁`. Catches the `(−1)ⁱ` sign flip,
  which is otherwise silent.
- `w` is unimodal along the path (rises to the bow-out apex, then falls) for a pan-dominated
  move; monotone for a pure zoom.
- **Constant perceived velocity** — the property the whole feature buys (§4). Sample
  `ds/dt = sqrt((ρ²/w²)u̇² + (1/(ρ²w²))ẇ²)` along the path and assert its coefficient of
  variation is ~0. This is the one assertion that fails if the geodesic is replaced by any
  plausible-looking interpolation, including a well-chosen ease on the old two channels — so
  it is the test that actually guards the feature. Measured 0.000 for the glide against
  15.30 / 3.64 / 2.49 / 0.89 for the four sampled moves today.

**Do NOT write a camera-position-reversal test.** §4 measured it: today's path scores 0 and
so does the glide, because today's path is a dead-straight line by construction. The metric
looks meaningful and distinguishes nothing.

**Existing tests that encode the independent-channel model** (each verified):

- `tests/services/engine/camera/cameraDrivers.test.ts:169-205` — hardcodes
  `lerp(10, 1000, easeOutCubic(0.5)) = 876.25` as a unit-slip oracle. Its descriptor is a
  pure zoom (`target [0,0,0] → [0,0,0]`), so it lands on the degenerate branch and the
  expected value becomes exponential. **The unit-slip property it guards is still worth
  keeping** — rewrite the oracle, do not delete the test.
- `tests/state/camera/focusTweenDescriptor.test.ts:48` — `expect(d.durationMs).toBe(FOCUS_TWEEN_MS)`.
  Becomes a derived-duration assertion.
- `tests/services/engine/camera/evaluateClip.test.ts:422` — 'keeps focus-tween distance LINEAR
  via space:lin'. **Correction to the brief: this one does not break.** It builds its
  `ClipData` inline via `tween('distance', { space: 'lin' })` (`:439-449`), never through
  `tweenToClip`, and `set`/`space:'lin'` is unchanged. It becomes misnamed — "focus-tween" is
  no longer what it exercises — so it needs a rename, not a rewrite.

**Not tested:** the ρ/V constants restated; `CompositeTrack.channels` contents mirrored back;
the `flyPath`-declares-all-four fact (`compileClip`'s own validation is the enforcement).

---

## 9. Delivery

One PR, commits in order: P1 (composite track), P2 (FOV through compile), `zoomPanGeodesic` +
tests, `buildGlideTrack` + the `glide` arm, rewiring of the two `startCameraTween` producers
and `tweenToClip`, duration derivation + clamp.

§5.1 and §5.3 are settled (ρ = 1.42, V = 6, clamp [0.4 s, 4 s]) — implementation takes them as
given. §5.2 remains open and is settled when `tweenToClip` is rewritten.
