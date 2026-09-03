# Volumetric rendering optimization — research corpus

**Date:** 2026-08-28 (rev 3, 2026-09-03) · **Scope:** the in-engine scalar-volume raymarch (MCPM
cloud, CF-4 density, polyphorm-2mrs, mcpm-workbench cubes) and, secondarily, the
mcpm-workbench `volpath` path tracer. Survey of leading techniques + a ranked set of
concrete suggestions. No code changes here; every suggestion carries a measurement
gate per the project's measure-first rule.

**Rev 2 folds in the in-repo prior art** — the pressure-tested verdicts and dead ends
in [`2026-07-30-galaxy-rendering-primitives.md`](2026-07-30-galaxy-rendering-primitives.md)
(§5 raymarch cost, §11 prior art, §12 verdicts) and the measurement lessons in
[`milky-way/measurement.md`](milky-way/measurement.md) — and the sparsity of the
shipped cubes, now **measured over the deployed `.scfd` files** (see the sparsity
table in §1: 92–99.7% render-empty at default knobs across the three wired fields).
Rev 1's temporal-reprojection framing conflicted with a standing verdict
and is corrected below; rev 1 also missed the survey's analytic-integration result,
now suggestion 2. **Rev 3 adds §6**, the stochastic-temporal
estimator + accumulator frame the ranked items compose into.

---

## TL;DR — ranked suggestions

| #   | Suggestion                                                                                                                 | Kind                 | Expected win                                                                              | Diff size    |
| --- | -------------------------------------------------------------------------------------------------------------------------- | -------------------- | ----------------------------------------------------------------------------------------- | ------------ |
| 0   | Volume-stressing perf scenarios + the survey's texture-stub A/B, with the known harness caveats                            | process              | correct baseline; texture- vs ALU-bound answer                                            | tiny         |
| 1   | Min/max brick grid + empty-brick leaping (transfer-aware, no rebuild on knob change)                                       | shader + upload pass | the headline: at 99%+ emptiness, most of the 128 steps/ray are provably wasted            | medium       |
| 2   | Analytic per-step transmittance integration (Toft et al. 2016)                                                             | shader               | step-count cuts up to ~an order of magnitude in-genre; fixes per-step alpha >1 saturation | small        |
| 3   | Clip the march range to the envelope sphere (analytic ray–sphere ∩)                                                        | shader               | free; kills corner rays outright                                                          | tiny         |
| 4   | Adaptive step count from clipped range vs voxel size + screen footprint                                                    | shader               | converts 1–3's shorter occupied ranges into fewer samples                                 | small        |
| 5   | 3D mipmaps + distance-based LOD sampling                                                                                   | upload pass + shader | bandwidth: large-tier minification cache thrash; less shimmer                             | small–medium |
| 6   | Blue-noise jitter (single per-fragment fetch)                                                                              | shader               | perceptual: same quality at fewer steps                                                   | tiny         |
| 7   | Stationary-camera progressive accumulation + moving/stationary quality split — **no reprojection** (standing TRAP verdict) | engine + shader      | SpaceEngine's largest published win is exactly this case                                  | medium       |
| 8   | Live `volume` target divisor (settings-driven `scale`, mw-aggregate pattern)                                               | TS only              | quadratic lever; "reduced-res is the architecture" per the survey                         | tiny         |
| 9   | Data-side: tight-crop cube AABBs; optionally sparse brick storage for large tier                                           | tools + loader       | memory: 155 MB large MCPM is ~99% zeros                                                   | medium–large |
| 10  | Pre-integrated transfer function (Engel 2001)                                                                              | LUT + shader         | parked: partially subsumed by 2; revisit only if banding binds                            | medium       |
| 11  | volpath: per-brick local majorants for delta tracking                                                                      | workbench            | fewer null collisions inside `MAX_TRACK_STEPS` cap                                        | medium       |

Items 1+2 together are the play: skip the empty 99%, then integrate the occupied 1%
analytically so few steps suffice. Items 3, 4, 6 are near-free companions. Item 7 is
the quality-per-cost lever for tours vs stills. §6 records the umbrella these
compose into — a stochastic-temporal estimator + accumulator architecture. The
current measured baseline says the volume layer is _not_ a hotspot in any existing
pose — item 0 gates everything.

---

## 1. What we have today (facts)

The in-engine renderer (`volumeFieldRenderer.ts` + `shaders/scalarVolume/fragment.wesl`):

- **Fixed-step front-to-back raymarch**, `STEP_COUNT = 128` (`fragment.wesl:119`),
  `stepLength = (tMax − tMin) / 128` — opacity is normalised against the constant, so
  changing the count is opacity-neutral by construction (`fragment.wesl:206`).
- **Early ray termination** at `accum.a > 0.99` (`SATURATION_THRESHOLD`) — the only
  skipping mechanism present. No empty-space skipping, no occupancy structure, no 3D
  mips (`mipLevelCount` defaults to 1 at upload, `volumeFieldRenderer.ts:218-220`), no
  depth buffer in the pass (`renderTargets.ts:190-196`, `depth: null`). In a 99%-empty
  cube the saturation early-out almost never fires — rays through void never
  accumulate — so today's only accelerator is inert exactly where the data is empty.
- **Per-step alpha is the linear approximation** `σ·Δt` (`lut.a · intensity ·
densityScale · stepLength · …`, `fragment.wesl:306`), not the exact
  `1 − e^(−σΔt)` — fine at small per-step optical depth, saturates non-physically
  when density × step length is large, which is what couples the acceptable step
  count to `densityScale` (MCPM 18, CF-4 20).
- **Reduced-resolution offscreen**: the `volume` target renders at **⅑ of the canvas
  fragments** (`scale: 3`, `renderTargets.ts:194` — comments still say "half-res";
  the divisor was 2 originally). Merged into HDR by a 4-tap rotated-grid additive
  upsample; the `one/one/add` blend on colour _and_ alpha is the invariant that makes
  reduced-res summation valid (`additiveUpsample.ts:8-41`).
- **Cube proxy geometry, front-face culled** — fragment cost scales with the cube's
  screen footprint, not the screen (`volumeFieldRenderer.ts:192`, spec §geometry).
- **Per-fragment white-noise jitter** (`hash21Hq`) with a per-frame temporal seed;
  the shimmer-when-stationary tradeoff is documented in the shader
  (`fragment.wesl:230`).
- **Per-step work**: 1× 3D texture sample + contrast/trim windowing (ALU) + 1× palette
  LUT sample + spherical envelope + composite.
- **N enabled fields = N independent full raymarches** (one draw each). Four rows are
  user-toggleable (`mcpm`, `cf4-density`, `polyphorm-2mrs`, `mcpm-workbench`); the
  original spec budgeted for 1–2 and flagged 3 as risky on integrated GPUs
  (spec `2026-05-09-scalar-volume-renderer-design.md:209-215`).

The cubes:

| cube                        | dims                                  | voxels              | GPU bytes (r16f)      | normalisation                                                        |
| --------------------------- | ------------------------------------- | ------------------- | --------------------- | -------------------------------------------------------------------- |
| MCPM small / medium / large | 89×150×91 / 178×300×182 / 356×600×364 | 1.2M / 9.7M / 77.8M | 2.4 / 19.4 / 155.5 MB | `log(1+v)/log(1+max)`; raw stats min=0, max≈40 000, mean≈16, p99≈320 |
| CF-4 density                | 128³                                  | 2.1M                | 4.2 MB                | symmetric linear, cosmic mean at 0.5 (divergent palette)             |

**Sparsity (MEASURED, 2026-09-03, over the deployed R2 `.scfd` files).** Per-voxel
histograms of every deployed cube, plus 8³-brick occupancy. "Render-empty" applies
`applyContrastWindow`'s exact math at the registry-default knobs (visibility = 0,
i.e. `dev ≤ deadband − 0.05`); "empty bricks" = 8³ bricks with no render-visible
voxel — the fraction a min/max brick grid (suggestion 1) skips outright at
default settings:

| cube                 | exact 0             | render-empty (default knobs)         | empty 8³ bricks     | zero 8³ bricks      |
| -------------------- | ------------------- | ------------------------------------ | ------------------- | ------------------- |
| cf4_density          | 0.00%               | 95.94% (deadband 0.167)              | 87.6%               | 0.0%                |
| mcpm s/m/l           | 69.9 / 73.4 / 78.8% | 91.7 / 95.2 / 96.6% (deadband 0.412) | 67.2 / 70.5 / 76.2% | 58.2 / 63.5 / 67.1% |
| polyphorm-2mrs s/m/l | 98.7 / 99.0 / 99.1% | 99.4 / 99.6 / 99.7%                  | 95.7 / 96.5 / 97.4% | 91.6 / 92.9 / 95.6% |
| edenhofer-dust s/m/l | 49.5 / 48.9 / 48.7% | n/a (no registry row yet)            | n/a                 | 36.9 / 42.6 / 44.5% |

(Dust is bimodal: ~49% exact zeros but 99.1–99.2% of voxels < 0.01 — its
skippability will be decided by the transfer its future renderer applies.)

Three consequences:

- **The "99%+ empty" intuition is literally true for polyphorm-2mrs** (99.1% zeros
  at large) and true _after classification_ for MCPM and CF-4 (92–97% render-empty)
  — but **CF-4 has zero value-level sparsity** (a dense linear field around 0.5) and
  MCPM's zeros stop at ~79%. So an occupancy structure keyed on _stored values_
  would do nothing for CF-4 and undersell MCPM; only the **transfer-aware** min/max
  form (suggestion 1) captures the real emptiness. This measurement is the
  strongest argument for that design choice.
- **Brick-level skippability at defaults: 88% (CF-4), 67–76% (MCPM), 96–97%
  (polyphorm)** — the brick grid's win is real at brick granularity, not just voxel
  granularity, and void regions are contiguous so per-ray savings exceed the brick
  fraction.
- **polyphorm-2mrs-large is 216 MB with 95.6% all-zero bricks** — the single
  strongest candidate for suggestion 9's sparse brick storage (~10 MB of occupied
  bricks), ahead of MCPM-large (155 MB, 67% zero bricks).

The workbench path tracer (`shaders/mcpm/volpath.wesl`, offline tool only): Woodcock
delta tracking against a single global majorant, capped at `MAX_TRACK_STEPS = 512`,
HG phase sampling, Russian roulette from bounce 2, progressive accumulation buffer.
No local majorants, no light sampling (emission-only — correct for this medium).
Note delta tracking's efficiency is `ρ/ρmax` per collision test — at 99% emptiness
with a global majorant, almost every test is a null collision (see suggestion 11).

## 2. Prior in-repo rulings — tried, measured, or pressure-tested already

The repo carries a substantial volumetrics research record. What binds here:

- **Temporal amortisation via reprojection is a standing TRAP verdict**
  (`2026-07-30-galaxy-rendering-primitives.md` §12, verdict 4): the literature's
  "static scenes" means a static _camera_; ours is a fly-through; a volume has no
  surface to reproject against, so a pinned fake depth breaks exactly when parallax
  _through_ the volume is the point. The verdict's own nuance: SpaceEngine's
  17 fps → 125 fps temporal-cache win is real **but is the stationary-camera case**,
  shipped as a separate "while stationary" slider because it does not survive
  motion. Rev 1's suggestion is re-scoped to that surviving half (suggestion 7).
- **Analytic per-step integration is the survey's own sourced step-count lever**
  (§5 reason 2): Toft et al.'s emission-absorption result — integrate transmittance
  analytically across each step — "is what let them run 8 steps where 128 were
  needed". Directly applicable; it was never wired into `scalarVolume` (suggestion 2).
- **Incoherent texture fetches are the raymarch tax** (§5 reason 3): Toft measured
  jitter alone at 2.3 → 7.5 ms (3.3×), attributed to texture-cache misses. Any
  acceleration structure adding per-step fetches must be budgeted against this
  (shapes suggestion 1's design: one coarse fetch _per brick_, not per step; and
  suggestion 6's: one blue-noise fetch _per fragment_).
- **Reduced-resolution volume targets are the architecture, not a compromise**
  (§11): OpenSpace ships at 0.4× downscale, SpaceEngine at 0.25–0.5 while moving /
  0.75–1.0 while stationary (two sliders), Gaia Sky routes through a half-res
  buffer. Supports suggestions 7 and 8 as configuration, not hacks.
- **The app perf harness could not resolve a ~5 ms subject** on Apple Silicon
  (`milky-way/measurement.md`): ±3 ms between-run noise, a sequential sweep that was
  pure drift, per-pass slots reporting the shared retire interval, and a merged slot
  list that **silently excluded a reduced-res offscreen pass** (`mw-aggregate·NEAR0`).
  Every caveat transfers to measuring the `volume` target (item 0).
- **Negative results against naive raymarching** (§11): Galaxia abandoned raycasting
  for aliasing/detail reasons; SpaceEngine raymarches only analytically-smooth
  shapes. Less binding here — the cosmological cubes are baked, band-limited fields
  (OpenSpace's baked-volume raymarch is the matching precedent, and it ships) — but
  it reinforces that step-count cuts must come with the item-2/6 anti-banding
  measures, not alone.
- **Dead ends already ruled, not re-proposed here**: GPU work graphs, hardware RT,
  neural/learned volume representations (§12 "dead ends" — all unavailable in
  WebGPU or solving problems we don't have).

## 3. Measured baseline — and why it's not sufficient

`docs/backlog/2026-07-21-perf-harness-findings.md`: `volume·COSMO` ≈ **0.9–1.0 ms**
across all three tiers at 1400×900@dpr2 on Apple Silicon, in the `full-survey` pose.
Two reasons not to trust that as "volumes are cheap, done":

1. **No existing scenario stresses the volume path.** All 8 perf poses are outside or
   far from the cubes; front-face culling means the footprint (and therefore cost) is
   small exactly there. A camera _inside_ the MCPM cube (any cosmic-web tour beat)
   makes the cube cover the whole screen and every ray span up to the full box.
   `volume-upsample` also bills inside `hdr·COSMO`, hiding part of the layer's cost.
2. **The cost model is multiplicative in enabled fields** and the UI now exposes four.

**Gate for all work below (item 0):**

- Add 2–3 scenarios to `tools/perf/perfScenarios.ts`: inside-MCPM pose; MCPM+CF-4
  both enabled; large tier inside-cube.
- Run the survey's **Measurement B** (`2026-07-30-galaxy-rendering-primitives.md`
  §12 — "a better benchmark than anything else in this document", ~20 min): measure
  the volume pass, then again with the 3D-texture fetch stubbed by an analytic
  expression. The ratio says whether the march is texture-bound (then suggestions
  1/5 dominate) or ALU-bound (then 2/4 dominate).
- Respect the `measurement.md` caveats: verify `volume·COSMO` and the upsample
  actually appear in the merged slot list before quoting deltas (the
  `mw-aggregate·NEAR0` blind spot); prefer paired A/B toggling within one session
  over sequential sweeps (drift); on Apple Silicon treat per-pass slots as ordinal.
- `npm run perf -- --sweep` for the pixel exponent (≈1 confirms fill-bound, which is
  what makes 7/8 pay).

## 4. Literature survey

### 4.1 Empty-space skipping (object-order acceleration)

The standard taxonomy: octrees / min-max hierarchies, occupancy bitmaps,
[SparseLeap](https://johanna-b.github.io/files/documents/sparseleap_vis17.pdf)
(Hadwiger et al. 2017 — occupancy geometry rasterised into per-ray skip intervals),
and distance maps. Two results stand out for us:

- **Chebyshev distance maps** — [Deakin & Knackstedt, SIGGRAPH Asia 2019](https://ldeakin.com/publications/2019_accelerated_volume_rendering/2019_Deakin_Knackstedt_Accelerated_Volume_Rendering_with_Chebyshev_Distance_Maps.pdf)
  ([code](https://github.com/LDeakin/VkVolume)): precompute per-block Chebyshev
  distance to the nearest occupied block; a ray at an empty block leaps
  `distance × blockSize` in one step. Reported ~2× faster than octree traversal and
  SparseLeap on typical datasets. Weakness: the map depends on the transfer function —
  reclassification means rebuilding it (follow-up work,
  [Accelerating Transfer Function Update for Distance Map based Volume Rendering, 2024](https://arxiv.org/pdf/2407.21552),
  exists precisely because of this).
- **Min/max block grids** (single-level min-max octree, a.k.a. brick occupancy with
  value ranges): store per-brick `(min, max)`; the _shader_ evaluates
  emptiness against the live transfer function. Slightly weaker skipping than a
  distance map (ray steps brick-by-brick through empty space rather than leaping),
  but **zero rebuild cost when classification knobs change** — a decisive property
  for us, because `contrast`/`trim`/`contrastCenter` are per-frame user knobs.
- **HDDA / VDB-family** ([NanoVDB / fVDB](https://arxiv.org/pdf/2407.01781)):
  hierarchical DDA over sparse trees. The right answer for genuinely sparse huge
  volumes when memory is also the problem; see suggestion 9 for the memory-side
  variant that stops short of a full VDB.

### 4.2 Sampling-rate reduction along the ray

- **Analytic per-step transmittance integration** —
  [Toft, Bowles & Zimmermann 2016](https://arxiv.org/abs/1609.05344), already
  sourced by the in-repo survey (§5): for emission-absorption media, replace the
  per-step `S = T·L` with `S = T₀ · L · (1 − e^(−ραx)) / (ρα)` so brightness stops
  depending on step length; their headline is visually-similar results at 1/16 the
  steps. This is the exact medium `scalarVolume` renders (no light march).
- **Pre-integrated transfer functions** — [Engel et al. 2001](https://cgl.ethz.ch/teaching/scivis_common/Literature/Engel2001.pdf):
  precompute the integral between successive sample _pairs_ into a 2D LUT indexed by
  (front, back) value. Removes the classification-induced Nyquist penalty — the hard
  deadband edge is exactly that. Overlaps item 2's benefit; parked behind it.
- **Adaptive step size**: step ∝ local sparsity or accumulated opacity; production
  surveys credit adaptive stepping + early termination with 50–70% sample reduction.
  Simplest robust form: pick the count per ray from the march range in _voxels_ and
  the pixel's angular footprint, not a global constant.
- **Mip-level sampling / cone-matched LOD**: sample coarser mips as the per-step
  world-space footprint exceeds a voxel — reduces aliasing (shimmer) and bandwidth
  (minified fetches from a 155 MB texture are cache-hostile with only mip 0
  resident — and cache misses are the measured 3.3× tax per §2).

### 4.3 Resolution + temporal amortization (production practice)

- **Frostbite froxel volumetrics** — [Hillaire, SIGGRAPH 2015](https://www.ea.com/frostbite/news/physically-based-unified-volumetric-rendering-in-frostbite):
  compute scattering into a low-res frustum-aligned grid, temporally integrate,
  integrate along view rays in a cheap second pass. (Froxels themselves: rejected
  for skymap, §6.)
- **Guerrilla's Nubis** — [Schneider, SIGGRAPH 2017](https://advances.realtimerendering.com/s2017/Nubis%20-%20Authoring%20Realtime%20Volumetric%20Cloudscapes%20with%20the%20Decima%20Engine%20-%20Final%20.pdf),
  [Nubis Evolved](https://www.guerrilla-games.com/read/nubis-evolved): <2 ms on PS4
  via quarter res + 1-of-16 pixels per frame + reprojection. **Binding caveat: this
  is the reprojection pattern the in-repo TRAP verdict rules out for our
  fly-through-a-volume case** (§2); it's cited as evidence for the resolution/
  temporal _budget_, not as an architecture to copy.
- **SpaceEngine's stationary cache** (in-repo survey §11): 17 → 125 fps from
  caching the volumetric result while the camera is still, shipped as a separate
  "while stationary" resolution slider. The precedent for suggestion 7.
- **Blue-noise dithered marching** — [demofox practice write-up](https://blog.demofox.org/2020/05/10/ray-marching-fog-with-blue-noise/):
  blue-noise ray offsets push residual error into high frequencies the eye forgives;
  animated with a golden-ratio offset it converges markedly better under
  accumulation than white noise.

### 4.4 Transmittance estimation for the path tracer

- Delta tracking with one **global** majorant degrades exactly when the medium is
  sparse-with-hot-tail (MCPM: max ≈ 40 000 vs p99 ≈ 320): `sigmaMax` is set by the
  peak, so the null-collision rate approaches 1 almost everywhere and the walk burns
  its `MAX_TRACK_STEPS = 512` budget on nulls (visible as bias: paths killed early
  in dense views). Standard fixes: **super-voxel / per-brick local majorants** and
  residual ratio tracking (Novák et al.; surveyed in the
  [volumetric path tracing literature](https://en.wikipedia.org/wiki/Volumetric_path_tracing)).
  The min/max brick grid from §4.1 supplies the majorants. (Residual ratio tracking
  is also the technique the in-repo survey's verdict 1 names for the analytic-base
  idea — same family.)

## 5. Suggestions in detail

### 0. Fix the measurement gap first (process — gates everything)

See §3. Per `simplicity.md`, a neutral measurement parks the rest.

### 1. Min/max brick grid + empty-brick leaping (medium; the headline)

At 99%+ emptiness the march is structurally wasteful: 128 steps/ray through void
that windows to zero visibility. The variant that fits skymap's constraint that
classification (`contrast`, `trim`) changes per frame:

- At `upload()`, a small compute pass reduces the cube to per-brick `(min, max)`,
  brick = 8³ (→ 45×75×46 ≈ 310 KB rg16float for large MCPM). One-off at cube load;
  no dependence on transfer knobs.
- In the fragment loop, DDA at brick granularity: evaluate the _live_ window against
  `[min, max]` (the same arithmetic `applyContrastWindow` does, applied to an
  interval — for sequential palettes `max` below the deadband ⇒ empty; for
  divergent, the interval must clear the deadband on either side). Empty ⇒ advance
  `t` to the brick exit; occupied ⇒ fine-step through the brick.
- Cost shape respects the fetch-tax lesson (§2): one coarse fetch per _brick_
  decision, fine fetches only inside occupied bricks. For a void-dominated ray
  that's ~a few dozen coarse fetches replacing 128 fine ones.
- The spherical envelope folds in free: a brick outside the envelope sphere is
  empty regardless of values (or rely on suggestion 3's clip).

Upgrade path if brick-stepping overhead disappoints under measurement: Chebyshev
distance map (§4.1) leaps instead of stepping — accepted only with its
transfer-function coupling priced in (rebuild on slider release, not per frame).

### 2. Analytic per-step transmittance integration (small; the step-count lever)

Adopt Toft et al.'s exact per-step integral (already vetted by the in-repo survey
as the thing that "buys the low step count"): treat the windowed sample as an
extinction+emission coefficient over the step and accumulate
`alpha = 1 − exp(−σ·Δt)` with the matching emission integral, instead of the
linear `σ·Δt`. Two effects:

- Brightness becomes step-length-independent, so suggestions 1/4 can shorten or
  coarsen marches without re-tuning `densityScale`, and the documented
  order-of-accumulation artifacts (the "brighter inside than outside" bug class the
  shader header records) lose their driver.
- The non-physical saturation when `σ·Δt > 1` (high `densityScale` × long step)
  disappears, which is what currently forces the step count up at MCPM=18 / CF-4=20.

One `exp` per step is the price; the survey's SFU-rate caution applies but one
transcendental against a texture fetch + LUT fetch per step is marginal — and
Measurement B (item 0) tells us which side of texture/ALU-bound we're on before
this lands.

### 3. Clip the march to the envelope sphere (tiny; do regardless)

`sphericalEnvelope` zeroes every sample with `‖p − 0.5‖·2 ≥ envelopeOuter`, yet the
march still spends steps there: the t-range comes from the _AABB_ intersection. The
envelope sphere has radius `envelopeOuter/2` in local units around `(0.5)³` —
intersect analytically and take `[tMin, tMax] ∩ [tSphereIn, tSphereOut]` (discard
when empty). Cuts the sampled volume to ≤ π/6 ≈ 52% of the cube and kills
corner-grazing rays; with fixed step count the immediate win is quality (denser
sampling where it counts), with suggestion 4 it becomes time. The
disabled-envelope sentinel (`inner == outer ≥ √3`) yields a sphere circumscribing
the cube — the clip degenerates to a no-op, same no-branch property as today.

### 4. Adaptive step count (small)

`STEP_COUNT = 128` is paid whether the cube fills the screen or covers 40 px, and
whether the clipped range is 1.7 or 0.05 local units. Derive per fragment:

```
steps = clamp(ceil((tMax − tMin) / voxelSizeLocal × quality), MIN_STEPS, MAX_STEPS)
```

with `voxelSizeLocal = 1/maxDim` in the uniform (bump `UNIFORM_BYTES` to 272 as the
layout comment anticipates). Opacity-neutral by construction given suggestion 2 (or
today's stepLength normalisation). Non-uniform loop bounds are fine — the shader
already uses `textureSampleLevel` everywhere for exactly this reason. Also floor
the count by projected footprint so distant small cubes drop well below 128. This
is what converts 1 and 3's shorter occupied ranges into milliseconds.

### 5. 3D mipmaps + LOD-matched sampling (small–medium)

Generate a mip chain for the 3D texture at upload (compute pass; `generateMipChain`
is 2D-only, a `3d` sibling is needed; +~14% memory). Sample with
`lod = log2(stepLengthWorld / voxelSizeWorld)` clamped ≥ 0. Effects: (a) minified
fetches from the 155 MB large cube stop thrashing the cache — the measured 3.3×
fetch tax (§2) is the reason to expect this to matter; (b) shimmer drops because
the sampled signal is band-limited to the step rate, letting 4/8 push quality lower
without aliasing. The v1 spec deferred 3D mips at 256³; the 356×600×364 large tier
is past the regime that judgment was made in.

### 6. Blue-noise jitter (tiny)

Swap `hash21Hq(fragCoord + frame·irrational)` for a fetch from a small tiled
blue-noise texture (64×64, one channel; golden-ratio offset per frame). This is
**one fetch per fragment, not per step**, so Toft's 3.3× per-step jitter tax (§2)
does not apply. Perceptually cleaner grain at the same step count, and converges
visibly better under suggestion 7's accumulation.

### 7. Stationary accumulation + moving/stationary quality split (medium)

Re-scoped from rev 1 to respect the standing TRAP verdict (§2): **no reprojection,
no history buffer under motion.** What survives is exactly the SpaceEngine pattern
the in-repo survey records as that team's largest published win, and it maps onto
skymap's render-on-demand scheduler with no new invalidation machinery — the
scheduler's "is anything animating" bit _is_ the invalidation:

- **While moving** (tween, axis input, autorotate): run the march at reduced
  quality (suggestion 4's `quality` factor → ~48–64 effective steps; optionally a
  coarser divisor via suggestion 8, SpaceEngine ships 0.25–0.5 here). Motion masks
  the noise — the regime the existing per-frame jitter decorrelation was built for.
- **When the camera comes to rest**: schedule a short burst of N re-renders of the
  now-static volume target with fresh jitter, blending `1/k` into an accumulation
  target, then stop. Converges to a supersampled result and eliminates the
  documented stationary shimmer. The workbench volpath already implements this
  exact progressive contract (`accum + sampleCount` in `.a`, `volpath.wesl:233-266`).

### 8. Make the `volume` divisor a live, named setting (tiny, TS-only)

`scale: 3` (`renderTargets.ts:194`) is the strongest single lever (quadratic) and a
magic literal — siblings have named constants, `mw-aggregate` has the live-scale
pattern (`scale: (s) => …`), and the dust spec already commits to it. The survey's
§11 finding ("reduced-resolution rendering is the architecture", with OpenSpace /
SpaceEngine / Gaia Sky values) says this is configuration, not a hack; it also
supplies suggestion 7's moving-resolution knob. Bilinear softness at divisor 4+ is
the bound; "the filter does not rescue a too-low divisor — choose the divisor
first, then the filter" (SpaceEngine's own note, quoted in §11).

### 9. Data-side sparsity: tight crop now, sparse bricks if memory binds (medium–large)

Two levels, independent of the shader work:

- **Tight-crop the cube AABB at build time** to the occupied bounding box per tier
  (`buildMcpmVolume`/`packLogTraceVoxels` already walk every voxel). Cheap, and
  every downstream ray gets a shorter box. Win depends on how much of the 99%
  emptiness is at the faces vs interleaved with filaments — check with
  `renderCubeMips` projections before assuming.
- **Sparse brick storage** (indirection table + brick atlas) if large-tier memory is
  ever the binding constraint: 155 MB that is ~99% zeros compresses to a few MB of
  occupied bricks. This is real machinery (a small VDB) and today nothing forces
  it — large tier is desktop, and the no-release slot leak
  (`docs/backlog/2026-07-22-asset-loading-audit.md`) is the cheaper memory fix.
  Recorded as the escape hatch, not proposed now.

### 10. Pre-integrated transfer function (parked)

Engel-style 2D pre-integration folding window + palette + opacity into one LUT.
Largely subsumed by suggestion 2 for opacity correctness; its remaining edge is
classification banding at very low step counts. Revisit only if, after 1/2/4/6,
banding rather than time is the binding constraint.

### 11. volpath: per-brick local majorants (workbench only, medium)

Reuse suggestion 1's brick grid: delta-track with `sigmaMax` from the current brick
(DDA between bricks) instead of the global peak. With max/p99 ≈ 125 and 99%
emptiness, null-collision rates collapse and the `MAX_TRACK_STEPS = 512` cap stops
truncating real transport in dense views (currently a documented, accepted bias).
Low-discrepancy sample decorrelation (Sobol/PMJ or the blue-noise texture) is the
cheap second step for accumulator convergence.

## 6. The stochastic-temporal frame: estimator + accumulator

Proposed 2026-09-03 (user) as "stochastic, temporal sampling for the fields";
recorded here as the umbrella architecture the ranked suggestions compose into,
not an extra suggestion.

**The reframing.** The shipping shader is already a stochastic estimator — the
jittered start offset makes each frame one stratified sample per step, temporally
decorrelated by the frame seed — that throws every estimate away. The architecture
completes the thought: make the per-frame estimate _cheap and noisy_, and let an
accumulator turn frames into quality. That decouples per-frame cost from converged
quality, which is exactly the knob a tour fly-through vs. a screenshot wants. The
raymarch layer and the workbench volpath are the two ends of one continuum
(all-strata/no-memory vs. one-collision-walk/full-accumulation); this frame slides
the interactive renderer along it.

**Why this stack suits it unusually well:**

- **Emission-only medium** — no light march, so every estimator technique from the
  volpath world (delta tracking, ratio tracking, local majorants) transfers
  directly.
- **The whole chain is linear pre-tonemap** — ⅑-res target, additive upsample, HDR
  accumulation. Averaging frames in the volume target (or a ping-pong accumulation
  texture beside it) is mathematically clean; no tonemapped-history hacks.
- **Render-on-demand is the invalidation for free** — the scheduler already knows
  "something changed this frame"; that bit resets the accumulator. No disocclusion
  heuristics, no history confidence, and therefore no collision with the TRAP
  verdict (§2), which bans history _reuse across camera motion_, not accumulation
  under a frozen view.

**The regime split the TRAP verdict forces:**

1. **Camera at rest** — unambiguous win; this is suggestion 7. Burst a few cheap
   stochastic frames, converge, stop. Fixes the documented stationary shimmer
   rather than tolerating it.
2. **Camera moving** — no history, the per-frame estimate stands alone. Stochastic
   _coverage_ (Monte Carlo sample placement) risks fireflies: an HDR peak hit by
   1-in-8 rays flickers hard, and the exposure highlight boost amplifies exactly
   those samples. The safer moving-regime estimator is the jittered
   _deterministic_ march at reduced step count — stochastic in phase, not in
   coverage, so no fireflies. How far the moving estimator can be pushed toward
   Monte Carlo is a perceptual call: settle it with eyes on the dev server, not by
   argument.

**Two convergence caveats (the technical content of the frame):**

- Transmittance is nonlinear, so frame-averaging converges to the mean of the
  _estimator_, not automatically to the true integral. Averaged jittered marches
  converge to the step-blurred integral (what we render today); coarse-strata
  estimators inherit the usual step-size bias. Suggestion 2 (analytic per-step
  integration) shrinks per-frame bias _and_ variance, so the accumulator converges
  to something better from noisier inputs.
- Stochastic sampling in a 92–99.7%-render-empty medium (§1 table) is efficient
  only with local majorants — a global-majorant walk wastes nearly every sample on
  null collisions, the exact volpath pathology under its 512-step cap. Suggestion
  1's brick grid supplies the majorants.

**How the ranked items compose under this umbrella:** 1 = the majorant/skipping
structure; 2 = per-sample bias+variance reduction; 6 = sample decorrelation the
accumulator converges fastest under; 7 = the accumulator itself; 8 = the
moving-regime resolution knob (SpaceEngine's two-slider precedent).

**Bonus consumer, possibly the highest-value one: the offline tour recorder**
(`npm run record-tour`). It has no real-time constraint, so an estimator +
accumulator lets it run N passes per output frame and emit converged,
shimmer-free 4K footage regardless of how noisy the interactive path is — the
quality dial exists once, and offline turns it to the end.

**Sequencing:** 1 + 2 first (they make any estimator cheap and low-variance),
then 7 (stationary bursts), and only then experiment with pushing the moving
estimator toward Monte Carlo, gated on the eyes-on noise check.

## 7. Considered and rejected

- **Temporal reprojection under camera motion** (Nubis 1-of-16 amortization,
  froxel history blending): standing in-repo TRAP verdict — a volume has no surface
  to reproject; fake depth breaks when parallax through the volume is the point
  (`2026-07-30-galaxy-rendering-primitives.md` §12 v4). Suggestion 7 keeps only the
  stationary half.
- **Compute-shader raymarch instead of fragment**: no evidenced win for coherent
  primary rays; the front-culled proxy already scopes cost to footprint. Revisit
  only if suggestion 7 evolves toward persistent per-tile accumulation.
- **Chebyshev distance maps as the first move**: strongest skipping constant, but
  couples the structure to live transfer knobs (rebuild-on-slider) — kept as
  suggestion 1's upgrade path, not the default.
- **SparseLeap / full VDB runtime**: designed for volumes that don't fit memory;
  ours fit. Suggestion 9's brick atlas is the bounded version if memory ever binds.
- **Single-pass multi-field merge** (the v1 spec's own fallback): real complexity
  for a win that only exists with ≥2 overlapping enabled fields — wait for item-0
  data showing that case matters.
- **Froxel-style view-aligned volumes**: pays off with many local media + lights
  sharing one integration volume; we have 1–4 emissive cubes and no in-volume
  lights.
- **GPU work graphs, hardware RT, neural volume representations**: already ruled
  dead ends in the in-repo survey (§12); not re-litigated.

## 8. Incidental findings (worth fixing regardless)

- "Half-res" comments describe a divisor-3 target: `scalarVolumeLayer.ts:2`,
  `renderTargets.ts:189`, `frameProgram.ts:108`; also the 4.1 MB offscreen figure in
  `docs/backlog/2026-07-08-galaxy-impostor-lod.md` predates `scale: 3`.
- `src/data/sources/cf4-density.ts:9,16-18` claims 256³ / ~32 MB; the shipped cube is
  128³ / ~4.2 MB.
- `mcpm-workbench.ts:12-14` + `assetWiring.ts:282-283` claim the workbench row has no
  UI toggle / never fires in production, but `CosmicWebSectionContainer.tsx:61-65`
  exposes all four non-debug rows.
- The volume slots declare no `release`, so every enabled-once cube stays GPU-resident
  for the session (known: `docs/backlog/2026-07-22-asset-loading-audit.md`) — at large
  tier that's 155 MB pinned after one toggle.

## References

In-repo (read first — they carry measured results and standing verdicts):

- [`docs/research/2026-07-30-galaxy-rendering-primitives.md`](2026-07-30-galaxy-rendering-primitives.md) — §5 raymarch cost table + the four cheapness reasons; §11 prior art (reduced-res consensus, SpaceEngine stationary cache, negative results); §12 Measurement B + pressure-tested verdicts + dead ends.
- [`docs/research/milky-way/measurement.md`](milky-way/measurement.md) — why the app harness can't resolve small subjects; merged-slot blind spot; drift.
- `docs/superpowers/specs/completed/2026-05-09-scalar-volume-renderer-design.md` — v1 decisions and deferred items.

External:

- Toft, Bowles & Zimmermann, _Real-time Rendering of Procedurally Generated Planets_, 2016 — [arXiv 1609.05344](https://arxiv.org/abs/1609.05344) (analytic per-step integration; jitter fetch tax)
- Deakin & Knackstedt, _Accelerated Volume Rendering with Chebyshev Distance Maps_, SIGGRAPH Asia 2019 — [paper](https://ldeakin.com/publications/2019_accelerated_volume_rendering/2019_Deakin_Knackstedt_Accelerated_Volume_Rendering_with_Chebyshev_Distance_Maps.pdf), [VkVolume code](https://github.com/LDeakin/VkVolume); transfer-function updates: [arXiv 2407.21552](https://arxiv.org/pdf/2407.21552)
- Hadwiger et al., _SparseLeap_, IEEE VIS 2017 — [paper](https://johanna-b.github.io/files/documents/sparseleap_vis17.pdf)
- Engel, Kraus, Ertl, _High-Quality Pre-Integrated Volume Rendering_, 2001 — [paper](https://cgl.ethz.ch/teaching/scivis_common/Literature/Engel2001.pdf)
- Hillaire, _Physically-based & Unified Volumetric Rendering in Frostbite_, SIGGRAPH 2015 — [talk page](https://www.ea.com/frostbite/news/physically-based-unified-volumetric-rendering-in-frostbite)
- Schneider & Vos, _Nubis_, SIGGRAPH 2017 — [slides](https://advances.realtimerendering.com/s2017/Nubis%20-%20Authoring%20Realtime%20Volumetric%20Cloudscapes%20with%20the%20Decima%20Engine%20-%20Final%20.pdf); [Nubis Evolved](https://www.guerrilla-games.com/read/nubis-evolved)
- Wolfe, _Ray Marching Fog With Blue Noise_, 2020 — [blog](https://blog.demofox.org/2020/05/10/ray-marching-fog-with-blue-noise/)
- Novák, Selle & Jarosz, _Residual Ratio Tracking_, SIGGRAPH Asia 2014 — surveyed via [volumetric path tracing](https://en.wikipedia.org/wiki/Volumetric_path_tracing)
- Elek, Burchett, Forbes, _Polyphorm_, IEEE VIS 2020 — [repo](https://github.com/CreativeCodingLab/Polyphorm)
- NVIDIA, _fVDB / NanoVDB_ (HDDA sparse traversal) — [arXiv 2407.01781](https://arxiv.org/pdf/2407.01781)
- Wu et al., _Large-Scale Volume Visualization Beyond Structured Data_, EuroVis STAR 2023 — [survey](https://www.researchgate.net/publication/371933716_State-of-the-art_in_Large-Scale_Volume_Visualization_Beyond_Structured_Data)
