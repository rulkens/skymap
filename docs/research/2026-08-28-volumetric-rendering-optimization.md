# Volumetric rendering optimization — research corpus

**Date:** 2026-08-28 · **Scope:** the in-engine scalar-volume raymarch (MCPM cloud,
CF-4 density, polyphorm-2mrs, mcpm-workbench cubes) and, secondarily, the
mcpm-workbench `volpath` path tracer. Survey of leading techniques + a ranked set of
concrete suggestions. No code changes here; every suggestion carries a measurement
gate per the project's measure-first rule.

---

## TL;DR — ranked suggestions

| #   | Suggestion                                                                                    | Kind                 | Expected win                                           | Diff size    |
| --- | --------------------------------------------------------------------------------------------- | -------------------- | ------------------------------------------------------ | ------------ |
| 0   | Add volume-stressing perf scenarios (inside-cube pose, multi-field) before touching anything  | process              | correct baseline                                       | tiny         |
| 1   | Clip the march range to the envelope sphere (analytic ray–sphere ∩)                           | shader               | free samples back on every ray; big on corner rays     | tiny         |
| 2   | Adaptive step count from march range vs voxel size + screen footprint                         | shader               | up to ~2–4× fewer samples far from / outside cubes     | small        |
| 3   | Min/max brick grid + empty-brick leaping (transfer-function-aware, no rebuild on knob change) | shader + upload pass | 2–5× on sparse cubes (MCPM is log-sparse)              | medium       |
| 4   | 3D mipmaps + distance-based LOD sampling                                                      | upload pass + shader | bandwidth: kills large-tier cache thrash; less shimmer | small–medium |
| 5   | Blue-noise jitter instead of white-noise hash                                                 | shader               | perceptual: same quality at fewer steps                | tiny         |
| 6   | Motion-adaptive quality: fewer steps while moving, progressive accumulation when still        | engine + shader      | quality↑ _and_ cost↓, fits render-on-demand            | medium       |
| 7   | Live `volume` target divisor (settings-driven `scale`, mw-aggregate pattern)                  | TS only              | quadratic lever, per-device tuning                     | tiny         |
| 8   | Pre-integrated transfer function (Engel 2001)                                                 | LUT + shader         | halve steps at equal quality (banding-limited cases)   | medium       |
| 9   | volpath: per-brick local majorants for delta tracking                                         | workbench            | fewer null collisions inside `MAX_TRACK_STEPS` cap     | medium       |

Items 1–2 are near-free and always-on wins. Item 3 is the standard big lever from
the literature and fits MCPM's statistics unusually well. Items 6–7 are the levers
that matter for the grand tour and weak GPUs. Everything below the line of "medium"
should wait for the item-0 measurements — the current baseline says the volume layer
is _not_ a hotspot in any measured pose.

---

## 1. What we have today (facts)

The in-engine renderer (`volumeFieldRenderer.ts` + `shaders/scalarVolume/fragment.wesl`):

- **Fixed-step front-to-back raymarch**, `STEP_COUNT = 128` (`fragment.wesl:119`),
  `stepLength = (tMax − tMin) / 128` — opacity is normalised against the constant, so
  changing the count is opacity-neutral by construction (`fragment.wesl:206`).
- **Early ray termination** at `accum.a > 0.99` (`SATURATION_THRESHOLD`) — the only
  skipping mechanism present. No empty-space skipping, no occupancy structure, no 3D
  mips (`mipLevelCount` defaults to 1 at upload, `volumeFieldRenderer.ts:218-220`), no
  depth buffer in the pass (`renderTargets.ts:190-196`, `depth: null`).
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

MCPM's raw distribution (p99 ≈ 320 of 40 000) means the _interesting_ signal occupies
a thin high tail; after the log map most voxels sit in the low band that the contrast
deadband / trim suppress to zero visibility anyway. That's the shape empty-space
skipping thrives on.

The workbench path tracer (`shaders/mcpm/volpath.wesl`, offline tool only): Woodcock
delta tracking against a single global majorant, capped at `MAX_TRACK_STEPS = 512`,
HG phase sampling, Russian roulette from bounce 2, progressive accumulation buffer.
No local majorants, no light sampling (emission-only — correct for this medium).

## 2. Measured baseline — and why it's not sufficient

`docs/backlog/2026-07-21-perf-harness-findings.md`: `volume·COSMO` ≈ **0.9–1.0 ms**
across all three tiers at 1400×900@dpr2 on Apple Silicon, in the `full-survey` pose.
Two reasons not to trust that as "volumes are cheap, done":

1. **No existing scenario stresses the volume path.** All 8 perf poses are outside or
   far from the cubes; front-face culling means the footprint (and therefore cost) is
   small exactly there. A camera _inside_ the MCPM cube (any cosmic-web tour beat)
   makes the cube cover the whole screen and every ray span up to the full box.
   `volume-upsample` also bills inside `hdr·COSMO`, hiding part of the layer's cost.
2. **The cost model is multiplicative in enabled fields** and the UI now exposes four.

**Gate for all work below:** add 2–3 scenarios to `tools/perf/perfScenarios.ts`
(inside-MCPM pose; MCPM+CF-4 both enabled; large tier inside-cube), then run
`npm run perf -- --sweep` to fit the pixel exponent (≈1 confirms fill-bound, which is
what makes items 2, 3, 6, 7 pay). Per the perf skill: measure before and after every
change, MERGED strategy for real costs.

## 3. Literature survey

### 3.1 Empty-space skipping (object-order acceleration)

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
  volumes; overkill for dense 128³–356×600×364 grids that already fit in VRAM.

### 3.2 Sampling-rate reduction along the ray

- **Pre-integrated transfer functions** — [Engel et al. 2001](https://cgl.ethz.ch/teaching/scivis_common/Literature/Engel2001.pdf):
  precompute the volume-rendering integral between successive sample _pairs_ into a
  2D LUT indexed by (front, back) sample value. Removes the classification-induced
  Nyquist penalty — high-frequency transfer functions (our hard deadband edge is
  exactly that) stop demanding high step counts. Classic result: comparable quality
  at ½ or less the sampling rate.
- **Adaptive step size**: step ∝ local sparsity or accumulated opacity; in surveys of
  production volumetrics, adaptive stepping + early termination is credited with
  50–70% sample reduction. Simplest robust form: pick the step count per ray from
  the march range measured in _voxels_ and the pixel's angular footprint, not a
  global constant.
- **Mip-level sampling / cone-matched LOD**: sample coarser mips as the per-step
  world-space footprint exceeds a voxel — reduces both aliasing (shimmer) and
  bandwidth (minified fetches from a 155 MB texture are cache-hostile with only
  mip 0 resident).

### 3.3 Resolution + temporal amortization (production practice)

- **Frostbite froxel volumetrics** — [Hillaire, SIGGRAPH 2015](https://www.ea.com/frostbite/news/physically-based-unified-volumetric-rendering-in-frostbite):
  compute scattering into a low-res frustum-aligned grid, temporally integrate
  (jittered per frame, blended against reprojected history), integrate along view
  rays in a cheap second pass. Key lesson: temporal integration of a _linear_
  quantity converges fast and hides low per-frame sample counts.
- **Guerrilla's Nubis (Horizon Zero Dawn / Forbidden West)** —
  [Schneider, SIGGRAPH 2017](https://advances.realtimerendering.com/s2017/Nubis%20-%20Authoring%20Realtime%20Volumetric%20Cloudscapes%20with%20the%20Decima%20Engine%20-%20Final%20.pdf),
  [Nubis Evolved](https://www.guerrilla-games.com/read/nubis-evolved): full
  cloudscape in <2 ms on PS4 by updating 1 of 16 pixels per 4×4 block per frame at
  quarter res + reprojecting history. Temporal amortization, not per-frame brute
  force, is what buys production volumetrics their budget.
- **Blue-noise dithered marching** — [demofox / de Goes practice write-up](https://blog.demofox.org/2020/05/10/ray-marching-fog-with-blue-noise/):
  replacing white-noise ray offsets with a tiled blue-noise texture pushes the
  residual error into high frequencies the eye (and any temporal filter) forgives;
  animated with a golden-ratio offset it converges markedly better under
  accumulation than white noise. Effectively "fewer steps look fine".

### 3.4 Transmittance estimation for the path tracer

- Delta tracking with one **global** majorant degrades exactly when the medium is
  sparse-with-hot-tail (MCPM: max≈40 000 vs p99≈320): `sigmaMax` is set by the peak,
  so null-collision rate ≈ 1 − ρ/ρmax ≈ 1 almost everywhere, and the walk burns its
  `MAX_TRACK_STEPS = 512` budget on nulls (visible as bias: paths killed early in
  dense views). The standard fixes are **super-voxel / per-brick local majorants**
  and residual ratio tracking (Novák et al., "Residual ratio tracking for estimating
  attenuation in participating media"; surveyed in the
  [volumetric path tracing literature](https://en.wikipedia.org/wiki/Volumetric_path_tracing)).
  The same min/max brick grid from §3.1 supplies the majorants.

## 4. Suggestions in detail

### 0. Fix the measurement gap first (process — do this before any shader change)

Add perf scenarios that stress volumes (§2). Also worth logging per-field draw costs
once: with 4 toggleable fields the "N × full raymarch" model should be confirmed, and
the spec's single-pass multi-field fallback only becomes interesting if the measured
multi-field cost is super-additive (shared-footprint overdraw), which `--sweep` will
show. **This item gates everything below**; per `simplicity.md`, a neutral
measurement parks the rest.

### 1. Clip the march to the envelope sphere (tiny; do it regardless)

`sphericalEnvelope` zeroes every sample with `‖p − 0.5‖·2 ≥ envelopeOuter`, yet the
march still spends steps there: the t-range comes from the _AABB_ intersection. The
envelope sphere has radius `envelopeOuter/2` in local units around `(0.5)³` —
intersect the ray with it analytically and take `[tMin, tMax] ∩ [tSphereIn, tSphereOut]`
(discard when empty). For CF-4 (envelope on) this cuts the sampled volume to
≈ π/6 ≈ 52% of the cube _at best orientation_ and kills corner-grazing rays entirely;
with fixed step count the immediate win is quality (denser sampling where it counts),
and combined with item 2 it becomes time. The disabled-envelope sentinel
(`inner == outer ≥ √3`) yields a sphere that circumscribes the cube — the clip
degenerates to a no-op, same no-branch property as today.

### 2. Adaptive step count (small)

`STEP_COUNT = 128` is paid whether the cube fills the screen or covers 40 px, and
whether the clipped range is 1.7 or 0.05 local units. Derive the count per fragment:

```
steps = clamp(ceil((tMax − tMin) / voxelSizeLocal × quality), MIN_STEPS, MAX_STEPS)
```

with `voxelSizeLocal = 1/maxDim` passed in the uniform (one new f32; the 256-byte
block has no room — bump to 272 as the layout comment already anticipates). Because
`stepLength` normalisation already makes opacity invariant to the count, this is
correctness-neutral by construction. Non-uniform loop bounds are fine — the shader
already uses `textureSampleLevel` everywhere for exactly this reason. Two extra
refinements worth carrying in the same change: floor the count by the fragment's
projected footprint (distant small cubes need far fewer than 128), and this is what
makes item 1's clipping pay in milliseconds.

### 3. Min/max brick grid + empty-brick leaping (medium; the big lever)

The literature's consistent top win (§3.1), in the variant that fits skymap's
constraint that classification (`contrast`, `trim`) changes per frame:

- At `upload()`, run a small compute pass reducing the cube to a per-brick
  `(min, max)` grid, brick = 8³ (→ 45×75×46 for large MCPM, ~310 KB rg16float).
  One-off cost at cube load; no dependence on transfer knobs.
- In the fragment loop, DDA over bricks: evaluate the _live_ window against the
  brick's `[min, max]` (for sequential palettes: `max < center + deadband·halfRange`
  ⇒ empty; for divergent: the interval must clear the deadband on either side —
  the same arithmetic `applyContrastWindow` already does, applied to an interval).
  Empty brick ⇒ advance `t` to the brick exit; occupied ⇒ fine-step through it.
- The spherical envelope folds in for free: a brick wholly outside the envelope
  sphere is empty regardless of values (or just rely on item 1's clip).

Expected: MCPM after the log map + default deadband is mostly-empty by visibility;
brick skipping turns "128 steps of fog that windows to zero" into a handful of DDA
advances. This is also the preparatory structure for item 9 (the same grid's `max`
is the local majorant). Chebyshev distance maps (Deakin & Knackstedt) would skip
faster still, but couple the structure to the transfer function — rebuild-on-slider
is exactly the entanglement the min/max form avoids; call that considered-and-rejected
unless measurements show brick-stepping overhead dominating.

### 4. 3D mipmaps + LOD-matched sampling (small–medium)

Generate a mip chain for the 3D texture at upload (compute pass; `generateMipChain`
is 2D-only today, so a `3d` sibling is needed; +~14% memory). Sample with
`textureSampleLevel(volume, s, p, lod)` where `lod = log2(stepLengthWorld / voxelSizeWorld)`
clamped ≥ 0. Two effects: (a) the far/minified case stops thrashing the cache on the
155 MB large cube — likely where any tier-dependence of volume cost would come from;
(b) shimmer drops because the sampled signal is band-limited to the step rate, which
in turn lets items 2/7 push quality lower without visible aliasing. The v1 spec
explicitly deferred 3D mips ("256³ … comfortably one mip") — the 356×600×364 large
tier is past the regime that judgment was made in.

### 5. Blue-noise jitter (tiny)

Swap `hash21Hq(fragCoord + frame·irrational)` for a fetch from a small tiled
blue-noise texture (64×64, one channel; golden-ratio-offset per frame — standard
practice, §3.3). Perceptually cleaner grain at the same step count, and it converges
visibly better under any accumulation (item 6). Keep the hash as the WESL fallback
path if a texture binding is unwelcome in `lib/`.

### 6. Motion-adaptive quality + progressive accumulation when idle (medium)

The engine is render-on-demand: frames repaint only while the camera moves, a tween
runs, or fades are live (`renderScheduler.ts`). That architecture is _made_ for the
production temporal trick (§3.3) in its simplest, TAA-free form:

- **While moving**: run the march at reduced quality (e.g. `quality` factor in item
  2's formula → ~48–64 effective steps). Motion masks the extra noise, exactly the
  regime the existing per-frame jitter decorrelation was added for.
- **When the camera comes to rest**: instead of one final frame, schedule a short
  burst of N accumulation frames — re-render the (now static) volume target with
  fresh jitter and blend `1/k` into an accumulation target, converging to a
  supersampled result, then stop. The workbench volpath already implements exactly
  this progressive-accumulation contract (`accum + sampleCount` in `.a`,
  `volpath.wesl:233-266`); this ports the idea to the raymarch layer.

No reprojection, no history invalidation heuristics — the scheduler's "is anything
animating" bit _is_ the invalidation. This is the only suggestion that improves
quality and cost simultaneously, and it's the one that matters for weak GPUs in
tour playback (moving) vs screenshots (still).

### 7. Make the `volume` divisor a live, named setting (tiny, TS-only)

`scale: 3` (`renderTargets.ts:194`) is the strongest single lever (quadratic in the
divisor) and currently a magic literal — its siblings have named constants, and the
`mw-aggregate` row (`scale: (s) => s.settings.milkyWay.aggregateDivisor`) plus the
in-flight dust spec establish the live-scale pattern. Exposing it (settings or at
least a named constant + debug knob) enables per-device tuning and honest A/B in the
perf harness (`--sweep` directly measures what a divisor change buys). Bilinear-
upsample softness at divisor 4+ is the quality bound; item 5's blue noise raises it.

### 8. Pre-integrated transfer function (medium; quality-per-step lever)

Engel-style 2D pre-integration table over (front, back) sample values, folding
`applyContrastWindow` + palette + per-step opacity into one LUT lookup. Removes the
deadband edge's Nyquist demand — the current hard `smoothstep(deadband±0.05)` edge is
precisely the kind of high-frequency classification that forces step counts up.
Cost: a 256² rgba16f table rebuilt when `contrast`/`trim`/`palette` change (cheap —
CPU 65k entries or a tiny compute pass; knobs change at UI rate, not frame rate).
Worth it only if item-0 measurements show banding, not time, is the binding
constraint on lowering steps; otherwise park it.

### 9. volpath: per-brick local majorants (workbench only, medium)

Reuse item 3's brick grid: delta-track with `sigmaMax` from the current brick
(DDA between bricks), not the global maximum. With MCPM's max/p99 ratio ≈ 125,
null-collision rates collapse and the `MAX_TRACK_STEPS = 512` cap stops truncating
real transport in dense views (currently a documented, accepted bias). Convergence
of the progressive accumulator improves for free with low-discrepancy sample
decorrelation (Sobol/PMJ or even the blue-noise texture) if we want a second step.

## 5. Considered and rejected

- **Compute-shader raymarch instead of fragment**: no evidenced win for coherent
  primary-ray marching; the front-culled cube proxy already scopes cost to footprint,
  and fragment hardware handles the additive blend. Revisit only if item 6 evolves
  toward persistent per-tile accumulation.
- **Chebyshev distance maps**: strongest skipping constant-factor, but couples the
  acceleration structure to live transfer knobs (rebuild-on-slider); the min/max
  brick form gets most of the win with zero coupling. (§4.3.)
- **SparseLeap / VDB / sparse textures**: designed for volumes that don't fit memory
  or are >90% topologically empty; our cubes are dense grids ≤155 MB.
- **Single-pass multi-field merge** (the v1 spec's own fallback): real complexity
  (N×3D-texture bind, per-field windowing in one loop) for a win that only exists
  when ≥2 overlapping fields are enabled — wait for item-0 data showing that case
  matters.
- **Froxel-style view-aligned volumes**: pays off when many local media + lights
  share one integration volume; we have 1–4 emissive cubes and no in-volume light
  sources.

## 6. Incidental findings (worth fixing regardless)

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

- Deakin & Knackstedt, _Accelerated Volume Rendering with Chebyshev Distance Maps_, SIGGRAPH Asia 2019 — [paper](https://ldeakin.com/publications/2019_accelerated_volume_rendering/2019_Deakin_Knackstedt_Accelerated_Volume_Rendering_with_Chebyshev_Distance_Maps.pdf), [VkVolume code](https://github.com/LDeakin/VkVolume); follow-up on transfer-function updates: [arXiv 2407.21552](https://arxiv.org/pdf/2407.21552)
- Hadwiger et al., _SparseLeap: Efficient Empty Space Skipping for Large-Scale Volume Rendering_, IEEE VIS 2017 — [paper](https://johanna-b.github.io/files/documents/sparseleap_vis17.pdf)
- Engel, Kraus, Ertl, _High-Quality Pre-Integrated Volume Rendering Using Hardware-Accelerated Pixel Shading_, 2001 — [paper](https://cgl.ethz.ch/teaching/scivis_common/Literature/Engel2001.pdf)
- Hillaire, _Physically-based & Unified Volumetric Rendering in Frostbite_, SIGGRAPH 2015 — [talk page](https://www.ea.com/frostbite/news/physically-based-unified-volumetric-rendering-in-frostbite)
- Schneider & Vos, _Nubis: Authoring Real-Time Volumetric Cloudscapes with the Decima Engine_, SIGGRAPH 2017 — [slides](https://advances.realtimerendering.com/s2017/Nubis%20-%20Authoring%20Realtime%20Volumetric%20Cloudscapes%20with%20the%20Decima%20Engine%20-%20Final%20.pdf); _Nubis Evolved_ (Forbidden West) — [Guerrilla](https://www.guerrilla-games.com/read/nubis-evolved)
- Wolfe, _Ray Marching Fog With Blue Noise_, 2020 — [blog](https://blog.demofox.org/2020/05/10/ray-marching-fog-with-blue-noise/)
- Elek, Burchett, Forbes, _Polyphorm: Structural Analysis of Cosmological Datasets via Interactive Physarum Polycephalum Visualization_, IEEE VIS 2020 — [repo](https://github.com/CreativeCodingLab/Polyphorm)
- NVIDIA, _fVDB / NanoVDB_ (HDDA sparse-volume traversal) — [arXiv 2407.01781](https://arxiv.org/pdf/2407.01781)
- Wu et al., _State-of-the-art in Large-Scale Volume Visualization Beyond Structured Data_, EuroVis STAR 2023 — [survey](https://www.researchgate.net/publication/371933716_State-of-the-art_in_Large-Scale_Volume_Visualization_Beyond_Structured_Data)
