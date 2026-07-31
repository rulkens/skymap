# Perceptually uniform focus moves — implementation plan

Spec: [`docs/superpowers/specs/2026-07-31-perceptually-uniform-focus-moves.md`](../specs/2026-07-31-perceptually-uniform-focus-moves.md)
(§ references below are to that spec). Ground-preparation section: present, filled — P1/P2.

Ten tasks, one PR, in commit order. Tasks 2–4 are prep (spec §6); each is its own commit and
each is behaviour-neutral except Task 1, which is a deliberate behaviour change landed early
so its effect is separately observable (§4).

---

## Global constraints

**Calibration — settled, copy verbatim, do not re-derive (§5.1, §5.3):**

```
ρ  = 1.42                             GLIDE_RHO_DEFAULT
V  = 6                                GLIDE_VELOCITY
duration = clamp(S / V, 0.4, 4.0)     GLIDE_MIN_SEC = 0.4, GLIDE_MAX_SEC = 4.0   (seconds)
default ease for a glide = 'linear'
```

All four constants live in ONE module, `src/utils/camera/glideCalibration.ts`, beside
`zoomPanGeodesic.ts` — they were calibrated together and are meaningless apart. (A
constants-only file under `src/utils/` is explicitly permitted: see the exemption comment at
`tests/conventions/filenameMatchesExport.test.ts:38-40` and
`tests/conventions/oneSymbolPerFile.test.ts:97-99`.) **Do not restate these values in a test**
(§8 "Not tested").

**Conventions that bite in this plan:**

- `type` aliases only, never `interface`.
- One exported type per file in `src/@types/`, one exported function per file in `src/utils/`,
  filename = symbol name. Enforced by `tests/conventions/oneSymbolPerFile.test.ts` and
  `filenameMatchesExport.test.ts` — they will fail the build if violated.
- Deep relative imports, no barrels. Tests mirror the `src/` tree.
- Comment budget: module header ≤ 10 lines, comment lines ≤ ½ code lines
  ([`comments.md`](../conventions/comments.md)). The derivations belong in the spec — link it,
  do not inline it. `zoomPanGeodesic.ts` is entitled to the two landmine notes (a choice that
  looks wrong and would get "fixed" back) and nothing more.
- Symbol renames go through `npm run refactor -- rename <file>#<symbol> <newName>` (`--dry`
  first), never hand-edited imports. Task 2 spells the invocations out.
- Test what can break ([`testing.md`](../conventions/testing.md)): no constant restatements,
  no mirror tests (never build the expectation with the function under test), no clamp-boundary
  tests.

**Landmines the implementation must carry (§2.2, §2.3 — verified numerically; do not
"simplify" them away):**

1. `rᵢ = Math.asinh(−bᵢ)`. The paper's literal `ln(−b + √(b²+1))` returns **−Infinity** in 3 of
   4 real skymap cases, because `b` is routinely 1e10+ here (our moves are far more
   zoom-dominated than the 2-D map browsing the paper targets) and the subtraction cancels
   catastrophically. Caught by the "no non-finite output across the full 19-decade range" test.
2. `u(s)` must use the restructured form `u₀ + (w₀/ρ²)·sinh(ρs)/cosh(ρs + r₀)`. The paper's
   literal subtracts two ~1e18 quantities whose difference is the answer and returns exactly
   `0` instead of Δu. Caught by the "endpoints exact" test.
3. The `(−1)ⁱ` sign in `bᵢ` is **`+` for i = 0, `−` for i = 1**. Backwards produces a
   plausible path that ends at the MIRROR of the destination (`u(S) = −u₁`). Caught by the
   direction test.
4. The degenerate branch (`u₀ === u₁`) is **mandatory, not an optimisation** — it is `dollyTo`
   and every re-focus of an already-focused subject. Branch on **exact equality**; do NOT
   invent an epsilon tolerance. §2.3 measured the sweep: only `Δu === 0` produces NaN; `S`
   already agrees with the degenerate closed form to 9 decimals from Δu = 1e-3 downward.
5. Units (§2.1): `w = 2 · distance · tan(fovY/2)` in Mpc — **not** `distance`; **fovY, not
   fovX, no aspect factor**. `u` is arc position along the straight `target₀ → target₁`
   segment, in Mpc. `bᵢ` adds `w₁² − w₀²` to `ρ⁴(u₁ − u₀)²`, so a unit mismatch silently
   shifts the pan/zoom balance instead of failing.

**Do NOT write a camera-position-reversal test** (§4, §8). Measured: today's path scores 0
reversals at every view angle with path/net displacement exactly 1.0000 (it is a straight line
by construction), and the geodesic also scores 0. The metric distinguishes nothing.

**Oracle strategy for the geodesic tests:** transcribe the paper's eq. 9 into the test file
independently, mirroring how `tests/services/engine/animation/ease.test.ts:30-32` transcribes
easings.net verbatim. Do not derive an expectation from the implementation, and do not tidy
the transcription into project style — that reintroduces the risk it guards.

---

## Spec corrections found while verifying citations

Every `file:line` in §3.5, §6, §7 and §8 was opened. All are accurate except:

- **§3.5's `focusTweenDuration.ts` row is wrong.** It says `FOCUS_TWEEN_MS` "becomes a clamp
  bound", but §5.3 settles the floor at 0.4 s = 400 ms ≠ 600 ms, and `FOCUS_TWEEN_MS` is still
  load-bearing for the out-of-scope `followBody` approach ease (`cameraDrivers.ts:339`) and its
  wake predicate (`shouldKeepTicking.ts:106-110`). **Resolution taken here:** leave
  `focusTweenDuration.ts` untouched; `FOCUS_TWEEN_MS` simply stops being read by the two focus
  producers and stays `followBody`'s constant. The glide clamp bounds live in
  `glideCalibration.ts`.
- **§3.5 omits the driver rows.** `evaluateClip` is called at `cameraDrivers.ts:231` (clip row)
  and `:362` (tween row); neither currently passes anything but `frameBasis`, so P2 is
  incomplete without them. Task 4 covers it, including the test-fixture fallout.
- **§8's list of existing tests to repair is missing two.**
  `tests/services/engine/camera/cameraDrivers.test.ts:158-167` and `:303-319` assert
  `result === evaluateClip(tweenToClip(TWEEN_DESC), …)` with no `fovYRad`, which diverges from
  the driver once the driver passes one. Task 8 repairs them.
- **§3.1's code block places `export type ZoomPanGeodesic` inside
  `src/utils/camera/zoomPanGeodesic.ts`.** That violates the one-symbol-per-utils-file rule and
  the convention tests. The type goes in `src/@types/camera/ZoomPanGeodesic.d.ts`, the function
  in `src/utils/camera/zoomPanGeodesic.ts` — the `ImagePlaneBasis` / `imagePlaneBasis` pattern.
- **§3.5 does not say how the two producers obtain the path length.** They live in `state/` and
  cannot reach `buildGlideTrack`. Task 6 introduces one shared camera-domain helper,
  `glidePath`, that owns the (u, w) conversion and the duration derivation, so the §2.1 unit
  contract has exactly one home rather than being re-derived in three places.

Verified as **needing no change**: `resolveClipFoci.ts:249-250` passes unknown effect kinds
through unchanged, so a `glide` (which carries a concrete `to`, no id form) needs no arm there.
`runFrame.ts:327` and `selectCameraActive` (`state/camera/selectors.ts:49-58`) both work off the
descriptor / presence, so a derived duration up to 4 s flows through untouched (§6 J2).

---

## Task 1 — Focus tweens honour the descriptor's ease, and default to `'linear'`

**Why first:** §4's middle column measured that for galaxy → galaxy — the most common focus
click in the app — the current channel model is _already_ perfectly uniform (CV 0.000) once the
ease is linear; `easeOutCubic` alone inflates it to 4.80e7. The ease is independently valuable
and its effect must be observable before the geodesic lands.

**Files:** `src/services/engine/camera/tweenToClip.ts` (modify),
`src/state/camera/focusTweenDescriptor.ts` (modify),
`src/state/selection/watchGoHomeSaga.ts` (modify),
`tests/services/engine/camera/tweenToClip.test.ts` (new),
`tests/state/camera/focusTweenDescriptor.test.ts` (modify).

**The bug this exposes:** `CameraTweenDescriptor.easing` (`CameraTweenDescriptor.d.ts:18`) is
**never read** — `tweenToClip.ts:65-73` hardcodes `'easeOutCubic'` on all four channels. So the
descriptor field is decorative today. Fix that first, then the producers control the curve.

- [ ] Add `tests/services/engine/camera/tweenToClip.test.ts` with
      `tweenToClip carries the descriptor's easing onto every channel` — build two descriptors
      differing only in `easing` (`'linear'` vs `'easeOutCubic'`), same `from`/`to`/`durationMs`,
      and assert `evaluateClip(…, half the duration)` gives **different** distance/yaw/pitch/
      target values, with the linear one equal to the hand-computed arithmetic midpoint. Fails
      today (both descriptors produce the identical easeOutCubic pose).
- [ ] Make `tweenToClip` pass `d.easing` on all four channels.
- [ ] Flip `focusTweenDescriptor.ts:53` and `watchGoHomeSaga.ts:82` to `easing: 'linear'`.
      Record the §2.4 reason in one line: constant velocity is the whole claim, and an ease-out
      spends its last decade of scale in its last few frames.
- [ ] Update `tests/state/camera/focusTweenDescriptor.test.ts:49` to expect `'linear'`.
- [ ] `npm test -- tweenToClip focusTweenDescriptor evaluateClip cameraDrivers` green.
- [ ] Commit.

---

## Task 2 — Mechanical rename: `PathTrack` → `CompositeTrack`, `pathTracks` → `compositeTracks`

Pure rename, no content edits (the refactor skill's "one mechanical op per commit" rule keeps
git's rename detection and `git blame` intact). 14 references to `pathTracks`, 8 to `PathTrack`.

**Files:** `src/@types/animation/CompiledClip.d.ts`, `src/services/engine/animation/compileClip.ts`,
`src/services/engine/animation/buildPathTrack.ts`, `src/services/engine/camera/evaluateClip.ts`,
`tests/services/engine/animation/compileClip.test.ts`,
`tests/data/animation/clips/flyPathDemo.test.ts`.

- [ ] `npm run refactor -- rename src/@types/animation/CompiledClip.d.ts#PathTrack CompositeTrack --dry`,
      read the blast radius, then run for real. (The file basename is `CompiledClip`, not
      `PathTrack`, so no file rename is triggered; pass `--no-file-rename` if the dry run
      disagrees.)
- [ ] Hand-rename the `CompiledClip.compositeTracks` **field** and the local `acc.compositeTracks`
      / `validatePathExclusivity` → `validateCompositeExclusivity` — the CLI renames exported
      symbols, not object properties or module-private functions. `PathSample` stays as-is
      (Task 3 explains why).
- [ ] Update the `PathTrack` docblock (`CompiledClip.d.ts:167-183`) and `compileClip.ts:367-373`
      to describe a composite writer generally rather than "a flyPath". Keep them under budget.
- [ ] `npm run typecheck` and `npm test` fully green — this commit changes no behaviour.
- [ ] Commit.

---

## Task 3 — P1: a composite track declares the channels it owns

Spec §6 P1. `flyPath` declares all four, so this is **behaviour-neutral: the existing suite
passing unchanged IS the deliverable.** The new subset capability is unreachable from
`evaluateClip`'s public API until a `glide` exists, so its assertion lands in Task 7 — that is
deliberate, not an omission.

**Contract:**

```ts
// src/@types/animation/CompiledClip.d.ts
export type CompositeTrack = {
  readonly startSec: number;
  readonly endSec: number;
  readonly channels: readonly Channel[];
  /** `localSec` is seconds since the track's own `startSec`. */
  readonly sample: (localSec: number) => Partial<CameraPose>;
};
```

**Files:** `src/@types/animation/CompiledClip.d.ts`, `src/services/engine/animation/channelSpace.ts`,
`src/services/engine/animation/compileClip.ts`, `src/services/engine/animation/buildPathTrack.ts`,
`src/services/engine/camera/evaluateClip.ts`, `tests/services/engine/animation/compileClip.test.ts`.

- [ ] Move `ALL_CHANNELS` out of `compileClip.ts:86` into `src/services/engine/animation/channelSpace.ts`
      (the canonical Channel-table home; `compileClip` already imports `CHANNEL_SPACE` from it).
      It must **not** live in `compileClip.ts`, which `buildPathTrack` cannot import without a
      cycle.
- [ ] `buildPathTrack` returns `channels: ALL_CHANNELS` on its track. Keep `PathSample` as
      `buildPathTrack`'s own return type — it is structurally assignable to `Partial<CameraPose>`
      and is used by `tests/services/engine/animation/buildPathTrack.test.ts`; folding it into
      `CameraPose` is churn with no behaviour behind it.
- [ ] `evaluateClip`'s base arm (`evaluateClip.ts:462-482`) stops being all-or-nothing and merges
      per channel: for each channel, the **latest-started** composite track with
      `startSec <= t` that declares that channel wins; otherwise the base layer.
      **Perf contract:** each active track's `sample` is invoked **at most once** per
      `evaluateClip` call — `buildPathTrack.sample` does spline work, so a naive per-channel
      call would 4× it. Keep the existing per-track `localSec` clamp
      (`evaluateClip.ts:471`: clamp into `[0, endSec − startSec]`, so a finished track holds its
      final pose).
      A declared channel whose sample value is `undefined` falls back to the base layer.
- [ ] `validateCompositeExclusivity` (`compileClip.ts:375-393`) loops `track.channels`, not
      `ALL_CHANNELS`. Reword the throw: it currently says "A flyPath owns all camera channels
      for its window", which will be false for a glide. Name the offending channel and the
      track's declared set.
- [ ] Add to `tests/services/engine/animation/compileClip.test.ts`:
      `a base writer on a channel the composite track does NOT declare is allowed` — the
      inverse of the existing exclusivity throw. Cannot be authored through `Effect` yet, so
      assert it against a hand-built `CompiledClip`-shaped input if `validateCompositeExclusivity`
      is exported for the test, **or** defer this single assertion to Task 7 and say so in the
      commit message. Do not export a function purely to test it if Task 7 covers it end-to-end.
- [ ] Full `npm test` green, unchanged. `npm run typecheck` green.
- [ ] Commit.

---

## Task 4 — P2: thread `fovYRad` into the compile path and the compile cache key

Spec §6 P2. Behaviour-neutral: nothing reads `fovYRad` yet.

**Contract:**

```ts
export function compileClip(data: ClipData, frameBasis?: Mat3, fovYRad?: number): CompiledClip;
export function evaluateClip(
  data: ClipData,
  elapsedSec: number,
  frameBasis?: Mat3,
  fovYRad?: number,
): CameraPose;
```

Absent ⇒ `DEFAULT_FOV_Y_RAD` (`src/services/engine/camera/cameraFraming.ts:46`), so every
existing caller — `clipPlayer.ts:165`, `computeClipPath.ts:77`, `visitBeatSaga.ts:122`,
`tools/utils/animation/clipDurationSec.ts:17` — is unchanged.

**Files:** `src/services/engine/animation/compileClip.ts`, `src/services/engine/camera/evaluateClip.ts`,
`src/services/engine/camera/cameraDrivers.ts`, plus the EngineState fixtures named below.

- [ ] Extend the compile cache `Cached` record (`evaluateClip.ts:114-123`) to key on
      `(ClipData, frameBasis, fovYRad)`. One line of comment: the cache key is where the
      "FOV is stable in practice" assumption now lives — a continuously-varying FOV would thrash
      it (§6 P2).
- [ ] Thread `fovYRad` onto the `Accum` beside `frameBasis` (`compileClip.ts:104`).
- [ ] Both driver rows pass it: `cameraDrivers.ts:231` (clip) and `:362` (tween), read lazily
      inside `pose` from `state.cameraRuntime.projection.fovYRad`.
- [ ] **Expected fallout, and P2's entire visible footprint:** `buildCameraDrivers` is called
      with a stub `EngineState` in four test files —
      `tests/services/engine/camera/cameraDrivers.test.ts:85` (`{} as EngineState`),
      `tests/services/engine/camera/commitOnEdge.test.ts`,
      `tests/services/engine/animation/playClipFlyout.integration.test.ts:82`,
      `tests/services/engine/frame/runFrame.test.ts:237`. Any of these that reaches a clip/tween
      `pose` call now needs `cameraRuntime.projection.fovYRad` on its stub. Extend each stub;
      do **not** add optional chaining in `cameraDrivers.ts` to paper over a missing field.
- [ ] Full `npm test` green. `npm run typecheck` green.
- [ ] Commit.

---

## Task 5 — `zoomPanGeodesic` — the pure van Wijk & Nuij model

**Contract:**

```ts
// src/@types/camera/ZoomPanGeodesic.d.ts
export type ZoomPanGeodesic = {
  /** Total path length in the (u, w) metric. Duration is length / V. */
  readonly length: number;
  /** s ∈ [0, length] → the (u, w) view at that arc position. */
  readonly at: (s: number) => { readonly u: number; readonly w: number };
};

// src/utils/camera/zoomPanGeodesic.ts
export function zoomPanGeodesic(
  u0: number,
  w0: number,
  u1: number,
  w1: number,
  rho: number,
): ZoomPanGeodesic;

// src/utils/camera/glideCalibration.ts
export const GLIDE_RHO_DEFAULT = 1.42;
export const GLIDE_VELOCITY = 6;
export const GLIDE_MIN_SEC = 0.4;
export const GLIDE_MAX_SEC = 4.0;
```

Pure, unit-agnostic, no knowledge of `CameraPose`, Mpc or FOV — the paper's model and nothing
else. `u` is scalar; lifting it back onto `û` is the caller's job (Task 6).

**Files:** the three above (new), `tests/utils/camera/zoomPanGeodesic.test.ts` (new).

Write the tests first, all six, from the transcribed eq. 9 (see "Oracle strategy" above):

- [ ] `endpoints are exact` — `at(0)` returns `(u₀, w₀)` and `at(length)` returns `(u₁, w₁)`,
      across cases including `Δu = 1e-9` Mpc. **This is the assertion that fails on landmine 2**
      (the literal `u(s)` returns 0 instead of Δu there).
      **Assert a RELATIVE error ≤ 1e-12, not `toBe`.** Measured on five real endpoint pairs the
      restructured form lands within 5e-15 relative — correct to the last few ulp, but not
      bit-exact, because `cosh`/`sinh` are not correctly-rounded. `toBe`/`toEqual` here would
      flake per-platform. `toBeCloseTo` is also wrong: it is absolute, and `w` ranges over 19
      decades, so it is meaningless at both ends. Compare `Math.abs(got − want) / Math.abs(want)`.
- [ ] `length matches the degenerate closed form as Δu → 0` — sweep Δu from 1e-3 down on a
      10 → 1000 Mpc zoom and assert `length` agrees with `|ln(w₁/w₀)|/ρ` to 9 decimals. Catches
      a wrong degenerate branch or a wrong ρ exponent.
- [ ] `no non-finite output across the full scale range` — endpoints spanning Earth-surface
      (~2e-16 Mpc) to observable-universe scales, every combination; assert `Number.isFinite`
      on `length` and on `u`/`w` at ~50 sampled `s`. **This is the assertion that fails on
      landmine 1.**
- [ ] `a move with u₁ > u₀ ends at u₁, not −u₁` — catches the `(−1)ⁱ` sign flip, which is
      otherwise silent.
- [ ] `w is unimodal for a pan-dominated move and monotone for a pure zoom` — sample `w` along
      `s`, count sign changes of the first difference: ≤ 1 for the pan case, 0 for `u₀ === u₁`.
- [ ] `perceived velocity is constant` — **the assertion that guards the feature** (§4, §8).
      Sample `ds/dt = sqrt((ρ²/w²)·u̇² + (1/(ρ²w²))·ẇ²)` by finite differences at uniform `s`
      across the four spec cases (star → Milky Way, Earth → nearby star, MW → Virgo,
      galaxy → galaxy) and assert the coefficient of variation is ~0 (a small tolerance for the
      finite-difference error; do not pin it to a measured constant). This is the one assertion
      that fails if the geodesic is swapped for any plausible-looking interpolation — including
      a well-chosen ease on the old two channels.
- [ ] `a zero-length move samples its endpoint` — `from === to` gives `length === 0` and an
      `at()` that returns the endpoint rather than NaN (a NaN pose here is a dead camera).
- [ ] Implement. `Math.asinh(−b)`; the restructured `u(s)`; sign `+` for i = 0, `−` for i = 1;
      the `u₀ === u₁` branch on **exact** equality. Two comments earn their place: landmines 1
      and 2, each one or two lines, each stating the failure mode so nobody "fixes" it back to
      the paper's literal.
- [ ] `npm test -- zoomPanGeodesic` green.
- [ ] Commit.

---

## Task 6 — `glidePath` — the camera-domain wrapper: units in, duration out

The §2.1 unit contract (`w = 2·d·tan(fovY/2)`, `Δu = |target₁ − target₀|`) gets **exactly one
home**. Both `startCameraTween` producers need a duration but cannot reach `buildGlideTrack`;
without this they would each re-derive the conversion, which is precisely how the `2·tan`
factor goes missing in one of three copies.

**Contract:**

```ts
// src/@types/camera/GlidePath.d.ts
export type GlidePath = {
  /** clamp(length / GLIDE_VELOCITY, GLIDE_MIN_SEC, GLIDE_MAX_SEC), in seconds. */
  readonly durationSec: number;
  /** arcFrac ∈ [0, 1] → the pose at that fraction of the geodesic's arc length. */
  readonly at: (arcFrac: number) => { readonly target: Vec3; readonly distance: number };
};

// src/utils/camera/glidePath.ts
export function glidePath(
  from: { readonly target: Vec3; readonly distance: number },
  to: { readonly target: Vec3; readonly distance: number },
  fovYRad: number,
  rho?: number, // default GLIDE_RHO_DEFAULT
): GlidePath;
```

Reuse `src/utils/math/distanceMpc.ts` for `Δu`; do not write a new one.

**Files:** the two above (new), `tests/utils/camera/glidePath.test.ts` (new).

- [ ] `at(0)` and `at(1)` reproduce `from` and `to` exactly (target components and distance),
      including a pure-zoom case (`from.target === to.target`) and an Earth-surface-scale case.
      Hand-computed from the inputs, not from `zoomPanGeodesic`.
- [ ] `the target path is a straight line` — `at(arcFrac).target` for several `arcFrac` lies on
      the segment `target₀ → target₁` (cross product with `û` ≈ 0, and the projection onto `û`
      is monotone increasing). The geodesic bows in `w`, never in world space (§2.1).
- [ ] `w uses the FOV, not the raw distance` — the same `from`/`to` at two different `fovYRad`
      produce different `durationSec`. Fails if the `2·tan(fovY/2)` factor is dropped. Do not
      assert either duration's value.
- [ ] `duration is clamped at both ends` — the Earth → observable-universe case returns
      `GLIDE_MAX_SEC`; a sub-pixel move returns `GLIDE_MIN_SEC`. (Not a clamp-boundary test —
      these are inputs well past each bound, where `min`/`max` genuinely differ from the
      unclamped value.)
- [ ] Implement.
- [ ] `npm test -- glidePath` green.
- [ ] Commit.

---

## Task 7 — The `glide` effect arm and `buildGlideTrack`

**Contract:**

```ts
// src/@types/animation/Effect.d.ts — a new arm beside `flyPath`
| { readonly kind: 'glide';
    readonly to: { readonly target: Vec3; readonly distance: number };
    readonly over?: number;      // omitted ⇒ derived from path length
    readonly rho?: number;
    readonly ease: Ease; }

// src/services/engine/animation/effectHelpers.ts — the only constructor
export function glide(
  to: { target: Vec3; distance: number },
  opts?: { over?: number; rho?: number; ease?: Ease },   // ease defaults to 'linear'
): Effect & { kind: 'glide' };

// src/services/engine/animation/buildGlideTrack.ts — sibling of buildPathTrack
export function buildGlideTrack(params: {
  readonly start: CameraPose;
  readonly startSec: number;
  readonly to: { readonly target: Vec3; readonly distance: number };
  readonly over?: number;
  readonly rho?: number;
  readonly ease: Ease;
  readonly fovYRad: number;
}): CompositeTrack;   // channels: ['target', 'distance']
```

`glide` is on `Effect`, **not** `CameraAction`: every `CameraAction` arm carries a single
`ch: Channel` and is a per-channel writer (`CameraAction.d.ts:58-105`); `flyPath`, the existing
composite writer, is an `Effect` arm for exactly that reason (§3.3).

Timing: `sample(localSec)` maps `arcFrac = EASE[ease](localSec / durationSec)` and calls
`glidePath.at`. Easing reparametrises the path without deforming it (§2.4) — so an overshoot
curve (`easeInOutBack`, `*Elastic`) walks the geodesic **past** its endpoint and flies through
the target and back. Nothing throws; that is why the default is `'linear'`.

**Files:** `src/@types/animation/Effect.d.ts`, `src/services/engine/animation/effectHelpers.ts`,
`src/services/engine/animation/compileClip.ts`, `src/services/engine/animation/buildGlideTrack.ts`
(new), `tests/services/engine/animation/buildGlideTrack.test.ts` (new),
`tests/services/engine/animation/compileClip.test.ts`, `tests/services/engine/camera/evaluateClip.test.ts`.

- [ ] `buildGlideTrack` tests:
      `declares exactly target and distance`; `endSec − startSec is the derived duration when
    over is omitted`; `an explicit over wins over the derived duration`;
      `sample(0) is the start pose and sample(duration) is the destination`.
- [ ] `compileClip` walk arm for `'glide'`, following the `'flyPath'` precedent
      (`compileClip.ts:194-223`): build from `acc.start` + `acc.fovYRad`, push to
      `acc.compositeTracks`, and **return `track.endSec − atSec`**, not `effect.over` — the
      derived duration must move the timeline cursor. Same `acc.start` caveat `flyPath` has:
      it is the CLIP start pose, so a glide mid-timeline flies from the clip's start, not from
      the pose the preceding effects left. Note it in the `glide` helper docblock.
- [ ] `compileClip` test: `a glide's derived duration advances the timeline cursor` — a
      `seq([glide(...), set(...)])` puts the `set` segment's `startSec` at the glide's `endSec`.
- [ ] `evaluateClip` test (**this is where P1's subset merge is proven end-to-end**):
      `a glide owns target and distance while yaw and pitch stay on the base layer` — an
      `all([glide(...), tween('yaw'), tween('pitch')])` compiles without throwing, and at
      mid-time the yaw/pitch come from their own eased tweens while distance follows the
      geodesic (assert distance ≠ the linear midpoint, and yaw === the tween's own value).
- [ ] `compileClip` test: `a base distance writer overlapping a glide still throws` — the
      exclusivity rule survives for the channels a composite track DOES declare.
- [ ] `npm test -- buildGlideTrack compileClip evaluateClip` green; full suite green.
- [ ] Commit.

---

## Task 8 — Rewire the two producers and `tweenToClip`

**Files:** `src/services/engine/camera/tweenToClip.ts`, `src/state/camera/focusTweenDescriptor.ts`,
`src/state/selection/watchGoHomeSaga.ts`, `tests/services/engine/camera/cameraDrivers.test.ts`,
`tests/state/camera/focusTweenDescriptor.test.ts`, `tests/services/engine/camera/evaluateClip.test.ts`,
`tests/state/selection/watchGoHomeSaga.test.ts`.

- [ ] `tweenToClip` (`tweenToClip.ts:61-76`) emits `all([ glide(d.to, { over: durationSec,
    ease: d.easing }), tween('yaw'), tween('pitch') ])` — one composite writer plus the two
      scalar tweens it does not own. `over` is passed explicitly (the producer already derived
      it, so the builder must not re-derive), and the yaw/pitch tweens keep the same
      `durationSec`. Rewrite the module docblock: the "focus tweens interpolate distance
      linearly, not in log space" paragraph is no longer true of `distance`.
      **This settles spec §5.2** (yaw/pitch stay independent scalar tweens); record the decision
      in one line — V&N does not model orientation and angles are scale-free, and focus moves
      carry yaw/pitch through unchanged anyway (`focusTweenDescriptor.ts:51`).
- [ ] `focusTweenDescriptor.ts:52`: `durationMs = glidePath(from, to, fovYRad).durationSec * 1000`.
      `fovYRad` is already a parameter (`:47`) — no signature change. Drop the `FOCUS_TWEEN_MS`
      import.
- [ ] `watchGoHomeSaga.ts:81`: same derivation, using `runtime.fovYRad` (already read at `:80`)
      and the `earthHomePose(...)` result as `to`. Drop the `FOCUS_TWEEN_MS` import. Leave
      `focusTweenDuration.ts` alone — see "Spec corrections".
- [ ] Repair `tests/state/camera/focusTweenDescriptor.test.ts:48`: assert the derived duration.
      Independent oracle — assert it is **within** `[GLIDE_MIN_SEC, GLIDE_MAX_SEC] × 1000` and
      that two rows at very different separations give different durations. Do not restate a
      computed number.
- [ ] Repair `tests/services/engine/camera/cameraDrivers.test.ts:169-205` (the unit-slip
      oracle). Its descriptor is a pure zoom (`target [0,0,0] → [0,0,0]`), so it lands on the
      degenerate branch and the expected value becomes exponential, not `lerp(10, 1000, 0.875)
    = 876.25`. **The unit-slip property is still worth keeping — rewrite the oracle, do not
      delete the test.** New oracle: transcribe `w(s) = w₀·exp(kρs)` for the degenerate branch
      and invert to distance, or assert the geometric-mean midpoint that a pure-zoom geodesic
      must produce; keep the slip-catching bounds (`> 10`, `< 1000`), which are what actually
      catch a forgotten `/1000`.
- [ ] Repair `cameraDrivers.test.ts:158-167` and `:303-319`: their expectation calls
      `evaluateClip(tweenToClip(desc), …)` without the `fovYRad` the driver now passes. Pass the
      same value the stub `EngineState` carries.
- [ ] Rename `tests/services/engine/camera/evaluateClip.test.ts:422` — 'keeps focus-tween
      distance LINEAR via space:lin'. It does **not** break (it builds its `ClipData` inline at
      `:439-449`, never through `tweenToClip`), but "focus-tween" is no longer what it
      exercises. Rename to describe `space:'lin'` on a `set` segment; do not rewrite it.
- [ ] Check `tests/state/selection/watchGoHomeSaga.test.ts` and
      `tests/state/selection/watchFocusTweenSaga.test.ts` for duration assertions (none found
      at plan time — confirm after the change).
- [ ] Full `npm test` green. `npm run typecheck` green.
- [ ] Commit.

---

## Task 9 — `entanglement-radar` review over the whole diff

House convention: bake the simplicity review into the plan
([`simplicity.md`](../conventions/simplicity.md)).

- [ ] Run the `entanglement-radar` skill over the full branch diff.
- [ ] Named candidates to judge, at minimum: - `w = 2·d·tan(fovY/2)` now exists in `glidePath` and, as an inline expression, in
      `scaleBar.ts:96`, `orbitControls.ts:427` and `cameraGizmoLines.ts:56`. **Surface this to
      the user before folding** — extracting a shared `viewHeightMpc` touches three
      pre-existing call sites and is scope beyond this spec. - `PathSample` vs `CameraPose` — structurally identical; kept deliberately (Task 3).
      Confirm that is still the right call now the merge is per-channel. - Three interpolation paths remain (`evaluateClip`, `followBody`, `frameTween`).
      `followBody` is explicitly out of scope (§7) and already has a backlog file — check the
      diff has not quietly grown a fourth. - `elapsedForWinner`'s ms-vs-seconds split (`cameraDrivers.ts:107-111`) now carries a
      derived duration through it; verify the unit note still reads true.
- [ ] Apply only the un-braidings that stay inside this spec's scope; file the rest in
      `docs/BACKLOG.md` with a terse index line.
- [ ] Commit (or note "no changes needed" in the PR).

---

## Task 10 — Verification and close-out

- [ ] `npm run typecheck` and full `npm test` green.
- [ ] Grep for stragglers the AST rename cannot see: `pathTracks`, `PathTrack`,
      `validatePathExclusivity`, `FOCUS_TWEEN_MS` — string literals, `vi.mock` paths and
      `.wesl` imports are refactor blind spots.
- [ ] **Visual pass — ask the user, do not self-certify.** The things to look at, in order:
      (1) a galaxy click from the InfoCard list still feels like ~600 ms and no longer "arrives
      too fast"; (2) rapid clicking down the list is not sluggish (the 0.4 s floor);
      (3) star → Milky Way now takes ~3.3 s and reads as one continuous move rather than a
      wobble; (4) `h` / Home still lands sunlit-side with the terminator raking, and the
      tween → follow handoff is still seamless (`watchGoHomeSaga`'s docblock, `:15-26`);
      (5) an authored clip with a `flyPath` is unchanged.
- [ ] Run `/feature-done` before merge (relocates plan + spec to `*/completed/`, sweeps the
      backlog).

---

## Deferred, named (§7) — do not let these creep in

- **`followBody`** (`cameraDrivers.ts:290-350`, ease at `:339-349`) — the third interpolation
  path, with its own `CameraClock` progress state and duration-coupled wake predicate
  (`shouldKeepTicking.ts:106-110`). Every focus on an orbital body — every planet — keeps the
  old feel, because `watchFocusTweenSaga.ts:97` short-circuits any focus row `liveBodyPosition`
  resolves before a descriptor is ever built.
  → [`docs/backlog/2026-07-31-followbody-third-interpolation-path.md`](../../backlog/2026-07-31-followbody-third-interpolation-path.md)
- **The leaf-star sprite floor** — a leaf star's drawn radius has no distance dependence at all,
  so no camera-side change makes it resolve before the 4 px sphere handoff. This is the hard
  ceiling on §4's 12.2 %.
- **`target` vel/osc broadcasting one scalar to x/y/z** (`evaluateClip.ts:496-506`) — unrelated
  documented limitation; the per-channel merge must not silently "fix" it.
