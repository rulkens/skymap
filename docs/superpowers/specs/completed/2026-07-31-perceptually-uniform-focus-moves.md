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

- Anything that makes a leaf star grow before its sphere handoff.

(`followBody` was here, and was pulled into scope after the first visual pass — see below.)

### Planets — pulled INTO scope after the first visual pass

Originally deferred to §7 as a second code path with the same root cause. The visual pass
overturned that: with galaxy moves smooth, the planet snap read as a defect rather than a
known gap, and the feature does not land without it.

**Approaching a planet never reaches the focus tween.** `watchFocusTweenSaga.ts:97`
short-circuits any focus row that `liveBodyPosition` resolves — every body in
`deriveBodyStates` — before a descriptor is built. `followBody` drives it instead.

The snap is not where it first appears. `followBody` declares `pivotsOnFocusedBody`, so
`applyFocusedBodyPivot` **absolutely sets** `target = bodyPosition + panOffset` after the
driver runs; the driver's own `target: livePos` is dead code, and any interpolation inside the
driver would be discarded. **The snap lives in the pin.**

Two shapes were considered, and they are not equivalent:

| shape                                                                      | verdict                                                                                                                                                                  |
| -------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| make the pin interpolate the pivot                                         | Rejected. Preserves the body-owns-the-pivot un-braid, but leaves `distance` independently eased — it relocates this feature's defect to planets rather than removing it. |
| `followBody` opts out of the pin and authors its full pose through a glide | **Chosen.** Exactly what `clip` and `tween` already do, and for the same stated reason: they keyframe a full path including the target.                                  |

Cost, accepted: `followBody` must add `panOffset` itself, and a drag _mid-approach_ snaps the
pivot (today it cannot, because the target is already pinned). `orbitDrag`, `autoRotate` and
`resting` keep the pin unchanged — they author orbit terms only, which is what it is for.

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

### 2.3b The recurring hazard: never subtract two large numbers to get a small one

Three separate bugs in this feature were the **same** bug, and a fourth will be too if the
principle is not stated once rather than re-learned:

| where                    | the cancellation                              | symptom                                         |
| ------------------------ | --------------------------------------------- | ----------------------------------------------- |
| `rᵢ` (landmine 1)        | `−b + √(b²+1)` for `b` up to 1e37             | `−Infinity`; 52 % of real endpoint pairs broken |
| `u(s)` (landmine 2)      | `cosh(r₀)·tanh(…) − sinh(r₀)`, terms ~1e18    | returns exactly `u₀`; Δu vanishes entirely      |
| the target (`glidePath`) | `lerp(from, to, u/du)` = `from + (to−from)·t` | target quantised to one ULP of the SEPARATION   |

The third is the one that reached a user: on Andromeda → Earth the target quantised to
1.73e-16 Mpc — **0.84 Earth radii** — and jumped 3.3× the camera-to-target distance between
frames while the camera sat 9e-16 Mpc away.

**The rule.** Over a 19-decade range, any quantity that becomes small near an endpoint must be
computed _directly_, never as the difference of two large ones. Each fix is the same move:
find an algebraically equal form whose small answer is small at every step — `asinh`, the
`sinh/cosh` identity, and the geodesic run in reverse so the offset is measured from whichever
endpoint is nearer.

**None of these fail loudly.** They return finite, plausible, wrong values, so a smoke test
passes. Each needs an assertion that binds the small quantity to something physical (an
endpoint, a body radius, the camera's own distance) rather than to an absolute tolerance.

### 2.4 Animation

`s = V·t`, so `duration = S/V` — distance-proportional, derived rather than chosen.

An `ease` applied as `s = S · EASE(t/T)` reshapes **timing along** the geodesic without
deforming the geodesic itself, since the path is the image of `s ↦ (u(s), w(s))` and easing
only reparametrises it. So keeping an `ease` on the move costs nothing structurally.

**The ease is a free choice — the coupling is what was load-bearing.** This section originally
argued for `'linear'`, on the grounds that constant `s` velocity is the model's entire claim
and an ease-out is what produced the "arrives too fast" symptom. That was **right about the old
code and wrong about the new**: the old `easeOutCubic` was applied to two INDEPENDENTLY eased
channels in linear distance space, back-loading `distance` while `target` ran on its own
schedule. On a coupled geodesic the same curve is a pure time-warp and cannot desync anything.

`easeOutQuint` shipped, for the arrival dwell it buys — §5.3 has the measurements and the
reasoning. One home for the value: `GLIDE_EASE_DEFAULT`.

Overshoot curves (`easeInOutBack`, `*Elastic`) are unsafe here for an unusual reason: `s > S`
or `s < 0` walks the geodesic _past_ its endpoint. That is well-defined, so nothing throws —
the camera simply flies through the target and back.

### 2.5 The paper's own caveats, and ours

- **V = 0.9 is unusable here.** Measured `S` for skymap-scale moves is 4–31; at V = 0.9 that
  is 4–35 second animations. Their user study covered 2-D map browsing over ~4 orders of
  magnitude; we span 19+. `V` was re-derived and clamped — §5.1, §5.3.
- **ρ**: 1.42 (sd 0.47) is the value their users chose; ρ = 6^(1/4) ≈ 1.565 is derived from
  RMS perceived velocity. The paper notes √2 "is possibly an optimal value, but we have not
  found yet a model to explain this." Neither value survived contact with skymap — see §5.2;
  1.42 bows out 8.79x on a galaxy click, and the shipped value is 0.18.
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

| Site                         | Change                                                        |
| ---------------------------- | ------------------------------------------------------------- |
| `tweenToClip.ts:61-76`       | one `glide` + the existing `yaw`/`pitch` tweens (§5.5)        |
| `focusTweenDescriptor.ts:52` | `durationMs` derived from path length, not `FOCUS_TWEEN_MS`   |
| `watchGoHomeSaga.ts:81`      | second `startCameraTween` producer; same derivation           |
| `compileClip.ts:375-393`     | `validatePathExclusivity` validates against declared channels |
| `focusTweenDuration.ts`      | DELETED — its last two readers moved to derived durations     |

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
  app, the ease is the entire defect and the geodesic changes nothing — so the ease change
  landed as its own commit, ahead of the geodesic, with its effect separately visible.
  (It was read at the time as confirming a `'linear'` default. It confirmed something narrower:
  that an ease applied to INDEPENDENT channels is destructive. §2.4 and §5.3 carry the rest.)
- **The star case improves modestly as a fraction, hugely in absolute terms.** Above the 4 px
  sphere-handoff threshold for 12.2 % of the move, vs 2.0 % today. Not the ~36 % a naive
  gap-decay model predicts, because the geodesic spends real time zoomed out doing the pan.
  §7 explains the hard ceiling on the fraction. But the fraction is the wrong number to judge
  by: with the duration settled (§5.3) the same move runs 4.0 s rather than 600 ms, so the
  star is resolved for **~0.49 s ≈ 29 frames at 60 fps, against ~0.7 frames today.** Most of
  the win comes from the duration, not the path.

---

## 5. Calibration — settled by measurement, then overturned by eye

### 5.1 What shipped

```
ρ = 0.18   V = 20   duration = clamp(S / V, 0.6 s, 2.2 s)   ease = easeOutQuint
```

Every one of those is live-tunable at runtime (DebugPanel → Glide tuning), because the
calibration turned out to be a **feel** question that no amount of measurement settles. Two
full rounds of numbers were derived, argued and then rejected on sight; the sliders exist so
the third round cost a drag instead of a rebuild.

Measured at the shipped values:

| move                        | duration | peak pull-back | arrival dwell |
| --------------------------- | -------- | -------------- | ------------- |
| galaxy → galaxy (50 Mpc)    | 0.60 s   | 1.01×          | 100 %         |
| MW → Virgo                  | 0.98 s   | 1.00×          | 100 %         |
| star → Milky Way            | 2.20 s   | 1.00×          | 100 %         |
| Andromeda → Earth           | 2.20 s   | 1.00×          | 44 % (0.96 s) |
| Earth → observable universe | 2.20 s   | 1.00×          | 100 %         |

"Arrival dwell" is the fraction of wall-clock time the destination spends between 0.6× and 1×
of its final apparent size — the number §5.3 is really about.

### 5.2 Why the paper's own constants lost

The first calibration took ρ = 1.42 (the paper's user-study mean) and derived V = 6 and a
[0.4 s, 4 s] clamp from it. It was internally consistent and **wrong on sight**: at ρ = 1.42 a
galaxy click rises to **8.79×** its endpoint distance, which reads as an unwanted zoom-out
rather than as an efficient path. The paper optimises for a 2-D map over ~4 decades; we span
19, and the bow-out that is efficient there is a detour here.

Low ρ makes zooming expensive in the metric and panning cheap, so the path stops climbing.
The knob is strong and monotone — galaxy → galaxy peak pull-back against ρ:

| ρ    | 1.42  | 1.0   | 0.8   | 0.6   | 0.35  | 0.25  | 0.15  |
| ---- | ----- | ----- | ----- | ----- | ----- | ----- | ----- |
| peak | 8.79× | 4.44× | 2.95× | 1.85× | 1.13× | 1.04× | 1.00× |

Two boundaries worth knowing:

- **The path converges below ρ ≈ 0.05** — measured identical at 0.05, 0.02, 0.01 and 0.001. That
  is the ρ→0 limit; lowering further buys nothing.
- **ρ = 0 is a singularity, not a small value.** The zoom term is 1/ρ², so `b` divides by zero
  and `length` evaluates `(∞−∞)/0` → NaN. A NaN pose is a dead camera and nothing downstream
  rejects one, so `glidePath` floors ρ at `GLIDE_RHO_MIN`.

**Rejected: a strictly monotone path** (straight in `u`, `log w`) that can never rise. Arc
length 3.7e9 for star → Milky Way against the geodesic's 19.8, and 1.4e17 for Earth → universe:
panning at low altitude across a huge separation costs enormous perceived distance, which is
exactly what the bow-out exists to avoid. The bow-out is load-bearing at large scale ratios; ρ
is the right lever, not a different path.

### 5.3 The ease — and why `'linear'` lost too

The first calibration argued hard for `'linear'`: constant arc-length velocity IS the model's
claim, and an ease-out is what produced the original "arrives too fast" symptom. That argument
was **right about the old code and wrong about the new**. The old `easeOutCubic` was harmful
because it was applied to two INDEPENDENTLY eased channels in linear distance space,
back-loading distance while the target ran on its own schedule. Applied to arc length along a
coupled geodesic it is a pure time-warp (§2.4) — it cannot desync anything.

So the ease became a free aesthetic choice, and uniform velocity turned out not to be what the
eye wants on arrival. Time with the target between 0.6× and 1× of final size, on a deep descent:

| ease           | dwell  |
| -------------- | ------ |
| `linear`       | 8.8 %  |
| `easeOutSine`  | 26.9 % |
| `easeOutCubic` | 44.5 % |
| `easeOutQuart` | 54.5 % |
| `easeOutQuint` | 61.5 % |
| `easeOutExpo`  | 65.0 % |

`easeOutQuint` shipped. **Overshoot curves (`*Back`, `*Elastic`) are excluded from the
selector**: on a geodesic an overshoot walks the arc PAST its endpoint, so the camera flies
through the target and back. Nothing throws.

### 5.4 Two costs the clamp carries

At ρ = 0.18 the arc length is close to bimodal — the 1/ρ² weight on the zoom term swamps the
pan term, so same-scale moves collapse toward one bound and scale-changing ones toward the
other. Most moves therefore land ON a clamp bound rather than on a derived duration, which
means **the arc-length duration derivation is doing less work than §1's goal implies**. It is
the price of a path that does not climb; both were the user's call, made by eye.

The second cost is on the tests, and it bit four times in one session — see §8.

### 5.5 Does yaw/pitch stay independent? — SETTLED: yes

They stay ordinary scalar tweens beside the glide, on the same curve. V&N does not model
orientation, and angles are scale-free so they never had the 1/d problem that motivates the
change. Recorded at `tweenToClip.ts` and `buildGlideTrack.ts`; `followBody` applies the same
eased `t` to its yaw/pitch lerps so orientation and position never run on different curves.

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

(`followBody` was listed here and was pulled INTO scope after the first visual pass — §1. Its
duration-coupled wake predicate was the specific hazard: a derived duration the wake window
does not match freezes the approach part-way and resumes it only on the next input event.)
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

### 8.1 Assertions that go blind under re-tuning — four caught in one session

Every calibration change during this work silently disarmed a test. None failed; they kept
passing while proving nothing. The count is the point: this is systematic, not four slips.

| assertion                                             | how it went blind                                                              |
| ----------------------------------------------------- | ------------------------------------------------------------------------------ |
| `expect(d.easing).toBe('linear')`                     | Restated the default. Would pass even if the producer ignored the tuning.      |
| `glidePath` FOV test comparing two `durationSec`      | Both pinned to the same clamp bound; could no longer see a dropped `2·tan`.    |
| `buildGlideTrack`'s "a longer path takes longer" (×2) | Endpoints saturated the clamp, so it compared a bound against itself.          |
| `toBeCloseTo(distance, 6)` at Earth framing           | Absolute 5e-7 tolerance against ~1e-13 values calls every pair of poses equal. |

Two rules fall out, and they are cheap:

1. **If a value can be clamped, assert it is not.** A comparison between two clamped values is
   a comparison of the clamp with itself. Where the property is about derivation, pick inputs
   inside the bounds _and assert that they are_.
2. **Never use an absolute tolerance on a quantity that spans decades.** `toBeCloseTo` is
   absolute; across a 19-decade range it is meaningless at one end and vacuous at the other.
   Compare relative error, or bind the value to something physical.

The general check, worth running against any assertion in this area: **would this still fail if
someone re-tuned the calibration?** If not, it is pinning the constants, not the behaviour.

---

## 9. Delivery

One PR, commits in order: P1 (composite track), P2 (FOV through compile), `zoomPanGeodesic` +
tests, `buildGlideTrack` + the `glide` arm, rewiring of the two `startCameraTween` producers
and `tweenToClip`, duration derivation + clamp.

All of §5 is settled — see §5.1 for what shipped, and §5.2/§5.3 for why the first two
calibrations were rejected by eye rather than by measurement.
