# Galaxy Rendering Primitives — Milky Way Realism and Cost

**Date:** 2026-07-30
**Scope:** synthesis of five parallel research investigations into how skymap should render the Milky Way, and galaxies generally. Covers the measured cost of what ships today, the three candidate primitives (billboards / kernel splats / raymarch), the statistics of what "smooth" actually means for a stellar population, a proposed data model, the dust-ordering error, and what shipping products do.
**Status:** research synthesis. No implementation decision is locked. Two cheap measurements (§12) gate the primitive choice.

**How to read this.** Every quantitative claim is tagged **SOURCED** (published, with a citation at point of use) or **DERIVED** (our own arithmetic, with the inputs shown). Do not promote a DERIVED number to a measurement. Sections are deliberately self-contained and repeat key numbers rather than cross-referencing them away.

---

## Read this if…

| You are…                                                                          | Go to                                                                                            |
| --------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| choosing a rendering primitive for a galaxy                                       | [§4](#4-the-three-primitives-compared), then [§12](#12-what-to-do-next)                          |
| costing a raymarch before building one                                            | [§5](#5-raymarch-cost)                                                                           |
| costing or tuning splats / sprite kernels                                         | [§6](#6-kernel-and-gaussian-splatting), fill law in [§4](#4-the-three-primitives-compared)       |
| wondering why the Milky Way looks clumpy                                          | [§1](#1-problem-statement), then [§2](#2-the-reframe-the-target-is-not-smooth)                   |
| about to add luminosity-ranked culling                                            | [§3](#3-surface-brightness-fluctuations) — the lever is worth under 30%, read before building it |
| looking up Milky Way parameter values (scale lengths, bar angle, arm pitch, dust) | [§9](#9-the-data-model), subsection "Milky Way parameter values"                                 |
| looking for Milky Way _datasets_ (masers, 3D dust, HII, globulars)                | [§9](#9-the-data-model), subsection "Data sources"                                               |
| designing the smooth/analytic base                                                | [§7](#7-recommended-architecture-control-variates) and [§8](#8-mge-multi-gaussian-expansion)     |
| deciding where dust composites in the frame graph                                 | [§10](#10-dust-ordering) — this is the largest single realism error available                    |
| wondering what SpaceEngine / OpenSpace / Gaia Sky / Celestia do                   | [§11](#11-prior-art-what-shipping-products-do)                                                   |
| about to re-propose an idea                                                       | [§12](#12-what-to-do-next), "Verdicts on the six ideas we pressure-tested"                       |
| about to cite a number from here in a decision                                    | [§13](#13-what-we-do-not-know) first                                                             |

## Contents

1. [Problem statement](#1-problem-statement)
2. [The reframe: the target is not smooth](#2-the-reframe-the-target-is-not-smooth)
3. [Surface Brightness Fluctuations](#3-surface-brightness-fluctuations)
4. [The three primitives compared](#4-the-three-primitives-compared)
5. [Raymarch cost](#5-raymarch-cost)
6. [Kernel and Gaussian splatting](#6-kernel-and-gaussian-splatting)
7. [Recommended architecture: control variates](#7-recommended-architecture-control-variates)
8. [MGE: Multi-Gaussian Expansion](#8-mge-multi-gaussian-expansion)
9. [The data model](#9-the-data-model)
10. [Dust ordering](#10-dust-ordering)
11. [Prior art: what shipping products do](#11-prior-art-what-shipping-products-do)
12. [What to do next](#12-what-to-do-next)
13. [What we do NOT know](#13-what-we-do-not-know)
14. [References](#references)

---

## 1. Problem statement

Skymap's Milky Way draws as roughly **150,000 additive camera-facing billboard sprites** standing in for about **1e11 stars**. DERIVED: 1e11 / 1.5e5 ≈ **700,000 stars per sprite**.

It reads as clumpy. Wherever the disc covers real screen area the sprites fall below one per pixel and individual particles resolve as discrete blobs.

**The draw is fill-bound, not vertex-bound.** MEASURED in the perf harness: multiplying baseline sprite area by ~5 tanks the frame rate. Going fewer-and-bigger was slower still — 3,000 sprites at 35× radius was worse than 20,000 sprites at 20×.

Two distinct cost regimes, both now covered by harness scenes:

- **`milky-way-outside`** (~22 kpc from the galactic centre). Nearly every sprite is pinned at the `starPxMin` floor, so fill ≈ `count × π × pxMin²`, roughly flat across the field. `pxMin` dominates quadratically: 1→2 is 4×, 1→4 is 16×.
- **`milky-way-close`** (~17.8 kpc, disc overflows the frame). Near sprites blow past the `starPxMax` cap. DERIVED: a sprite capped at 48 target px covers `π × 48² ≈ 7,240` texels; against a half-resolution (divisor 2) target of roughly 3.1e5 texels, about **43 such sprites is one full screen of additive overdraw**. This is where the frame rate actually collapses.

Current architecture: stars render into a half-resolution `mw-aggregate` offscreen and composite back with an additive upsample. Dust stays full-res in HDR, because its multiplicative transmittance has to land on the real cosmological accumulation rather than on a private buffer.

Known population facts, for anyone hunting the sprite budget:

- `globularCount: 30` × 90 stars each ≈ **2,700 sprites, 1.8% of the budget**. Not where the cost is.
- `splitSpiralLike` returns `haloCount: 0`. There are **no halo stars** at all.
- HII knots live inside the `spiralArms` population at stride 5 (halo glow, core, and up to 3 newborns per knot).

---

## 2. The reframe: the target is not smooth

This is the most important conceptual section in the document. Two research threads appeared to contradict each other, and the resolution is the key insight.

- **Splatting analysis said:** 150k splats suffices, given bigger kernels — about 10% RMS noise at ~2.6 ms half-res.
- **Realism analysis said:** smoothness below the human contrast threshold needs an effective sample count `N_eff ≳ 2500` per resolution element. 150k sprites gives **0.19 per pixel**. That is a 10⁴ gap.

**Resolution: a real galaxy is not smooth either.**

SOURCED: the local surface density of stars and stellar remnants is **33.4 ± 3 M☉/pc²** ([McKee, Parravano & Hollenbach 2015, ApJ 814, 13](https://arxiv.org/abs/1509.05334)). A 2025 Gaia+APOGEE estimate gives 31.6 ± 2.8 M☉/pc², consistent.

DERIVED, chain shown:

1. 33.4 M☉/pc² ÷ ~0.4 M☉ mean stellar mass ≈ **80 stars/pc²**.
2. Applying the SBF effective-count ratio from §3 (`N_eff/N ≈ 1/900`): 80/900 ≈ **0.09 ≈ 0.1 effective sources per pc²**.
3. A 2% contrast target needs `N_eff = 1/0.02² = 2500`, so 2500 / 0.1 ≈ **25,000 pc²** of disk per resolution element.
4. √25,000 ≈ **160 pc per resolution element**.
5. A 30 kpc disk is 30,000/160 ≈ **190 resolution elements across**.

**Above roughly 200 px across, the real Milky Way's disk is genuinely grainy.** The bulge, 10–100× denser, stays smooth much longer.

SOURCED corroboration: the HST PHAT mosaic of M31 is 1.5 Gpx, resolves **>100 million individual stars** at ~0.19 pc/pixel, and shows the disk as stars, not as a smooth glow.

**Therefore the goal is granularity at the right spatial scale with the right amplitude, not smoothness.** Our bug is not that 150k sprites are too few in principle. It is that they put the graininess at the wrong scale, in blobs hundreds of times larger than the real thing.

---

## 3. Surface Brightness Fluctuations

Surface Brightness Fluctuations (SBF) is the astronomical statistic for exactly our problem: pixel-to-pixel variance arising from a finite number of stars per resolution element. Introduced by [Tonry & Schneider 1988, AJ 96, 807](https://ui.adsabs.harvard.edu/abs/1988AJ.....96..807T).

### The statistic

Define the **fluctuation luminosity**:

```
L̄ = Σ nᵢ Lᵢ² / Σ nᵢ Lᵢ
```

For `N` stars drawn from that population, mean flux is `N·f̄` and variance is `N·f̄²`, so `f̄` is literally the ratio of variance to mean. The relative fluctuation is `σ_F/F = 1/√N`.

The "Tonry number" or fluctuation star count is `N̄ = m̄ − m_tot = 2.5 log₁₀(L_tot/L̄)`.

DERIVED (one line of algebra from the definition above):

```
N_eff = L_tot / L̄ = (Σ nᵢLᵢ)² / (Σ nᵢLᵢ²)
```

which is Kish's effective sample size, equivalently the inverse participation ratio. This is the number every "how smooth is it" question reduces to.

The `L²` weighting means the signal is dominated by the brightest stars — red giants — and is therefore relatively insensitive to the IMF. This is spectroscopically confirmed: the SBF _spectrum_ of NGC 5102 matches an M-type stellar spectrum.

### How much smaller is N_eff than N?

DERIVED from sourced inputs. The standard SBF calibration is `M̄_I = −1.74 + 4.5[(V−I)₀ − 1.15]` (SOURCED). At the pivot colour `(V−I)₀ = 1.15` that gives `M̄_I = −1.74`. With `M_I,⊙ ≈ 4.1`:

```
L̄ = 10^(−0.4 × (−1.74 − 4.1)) ≈ 10^2.34 ≈ 220 L⊙,I
```

A mean old-population star is ≈ 0.2–0.3 L⊙,I, so:

```
N_eff / N ≈ 0.25 / 220 ≈ 1/900
```

**A real galaxy with 1e11 stars behaves statistically like ~1e8 independent sources.** Independently sourced corroboration of the same order: "for an old population the SBF flux is comparable to the flux of a single giant star."

### Threshold table

| Requirement                                     | Value                      | Status                             |
| ----------------------------------------------- | -------------------------- | ---------------------------------- |
| Unbiased SBF statistics                         | ~20 giants per pixel       | SOURCED (Tonry & Schneider 1988)   |
| Pixel flux vs SBF flux for reliable measurement | pixel flux > ~20× SBF flux | SOURCED                            |
| Full Gaussian regime, optical                   | ~10⁶ stars per pixel       | SOURCED (Cerviño & Luridiana 2006) |

SOURCED: the per-pixel luminosity distribution is **L-shaped (heavily right-skewed)** at around one star per pixel, and only becomes Gaussian in the infinite limit. **An L-shaped per-pixel distribution is precisely what "clumpy" looks like on screen.** The clumping is not a bug in our sampler; it is the correct statistics of an undersampled population, applied at the wrong scale.

### Consequence for luminosity-ranked culling

This kills a lever we were carrying, so record it.

The idea was: cull the faintest generated stars, on the theory that a heavy luminosity tail means most sprites contribute negligible flux. Ranked culling is theoretically sound — it _is_ the SBF second moment — but it is aimed at a target that is not there in our generator.

Our generator draws `L = 0.12 + 0.4u³` with `u ~ U(0,1)`, plus a 1.2% chance of a ×3.2 flare.

DERIVED, inputs shown. `E[u³] = 1/4`, `E[u⁶] = 1/7`, so:

```
E[L]  = 0.12 + 0.4 × 0.25                            = 0.22
E[L²] = 0.12² + 2(0.12)(0.4)(0.25) + 0.16 × (1/7)    = 0.0144 + 0.024 + 0.02286 = 0.06126
N_eff/N = E[L]² / E[L²] = 0.0484 / 0.06126           = 0.79
```

**The cubic tail alone costs only 21% of effective N.** Adding the flare with factor `f` at probability `p = 0.012`:

```
N_eff/N = 0.79 × (1 + p(f−1))² / (1 + p(f²−1))
```

DERIVED sensitivity table:

| flare factor `f` | `N_eff/N` |
| ---------------- | --------- |
| 1 (no flare)     | 0.79      |
| 3.2 (our value)  | 0.75      |
| 5                | 0.67      |
| 10               | 0.44      |
| 20               | 0.21      |
| 50               | 0.064     |

At our actual flare factor of 3.2 the total loss of effective N is **under 30%**. Culling by luminosity can recover at most that. Build it only if 30% is worth the complexity; it is not the order-of-magnitude lever it looked like.

---

## 4. The three primitives compared

|                         | **Billboard sprites** (current)                                                                                          | **Kernel / Gaussian splats**                                | **Emission-absorption raymarch**                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------- | ------------------------------------------------------------- |
| Cost shape              | overdraw-driven, **unbounded**                                                                                           | overdraw-driven, tunable via σ                              | `pixels × steps`, **fixed**                                   |
| Worst case              | camera near the disc plane                                                                                               | same, but bounded by σ choice                               | viewpoint-independent                                         |
| Measured / estimated    | MEASURED: ~5× baseline area tanks the frame; ~43 capped sprites = one full screen of overdraw at divisor 2 (DERIVED, §1) | DERIVED: ~2.6 ms half-res at 150k splats for ~10% RMS noise | DERIVED: ~1.5–4 ms optimised at 1/3 linear res, 64 steps (§5) |
| Dust ordering           | post-pass composite (wrong, see §10)                                                                                     | needs moment/deep opacity maps (§10)                        | correct by construction — dust is inside the march            |
| Structure (arms, lanes) | free, data-driven                                                                                                        | free, data-driven                                           | needs analytic or textured field                              |
| Granularity control     | none — grain = sprite size                                                                                               | direct, via σ and count                                     | none — inherently smooth, grain must be added back            |
| Complexity              | shipped                                                                                                                  | moderate                                                    | high                                                          |
| Prior art for galaxies  | SpaceEngine, Gaia Sky, Celestia, OpenSpace points                                                                        | dexyfex Galaxia, Splotch                                    | OpenSpace (baked volume), SpaceEngine ellipticals only        |

### Cost shape is the decisive axis

Billboards and splats are overdraw-driven, and overdraw peaks **exactly when the camera nears the disc** — our measured worst case, and the most visually important viewpoint in a fly-through. A raymarch costs `pixels × steps`, which is fixed and viewpoint-independent.

**Trading unbounded fill for bounded ALU is the better curve even at equal average cost**, because the average is not what drops frames.

### The splatting fill law

DERIVED, from Gaussian kernel geometry with 3σ truncation (per-splat covered area `π(3σ)² = 9πσ² ≈ 28.3σ²`):

```
N_eff = 4π σ² n          (n = splats per px²)
F     = 28.3 σ² N        (F = total fragments)
RMS noise = 1 / √(4π σ² n)
```

Both `N_eff` and `F` are **linear in σ²N**. The immediate consequence:

> **Doubling the splat count and multiplying σ by √2 are the same purchase at the same fill cost.**

Two more DERIVED relations, useful when comparing against a raymarch:

```
N_eff ≈ 0.44 × N_support          (4πσ²n / 9πσ²n = 4/9)
F     ≈ 2.25 × N_eff × P_covered  (9πσ²n / 4πσ²n = 9/4)
```

### The crossover with raymarching

DERIVED: a raymarch costs `steps` samples per pixel; splatting costs `2.25 × N_eff` fragments per pixel. Raymarching wins on sample count when:

```
N_eff > steps / 2.25
```

That is `N_eff > 28` at 64 steps. Weighting a trilinear 3D texture fetch against an additive-blend fragment (the two are not equal-cost) pushes the crossover to roughly **N_eff > 60–110**.

Reading that against the noise law: a 10% noise target needs `N_eff = 100`, a 7% target needs `N_eff ≈ 204`, 3% needs 1,111, and 1% needs 10,000. **So at a 7–10% noise target splatting is competitive; at 3% or 1% the raymarch wins by a wide margin.**

### An unresolved tension — record it as unresolved

The σ²N model says fill cost depends only on `σ²N`. Our own measurement went the other way:

| configuration         | σ²N (DERIVED)        | measured   |
| --------------------- | -------------------- | ---------- |
| 3,000 sprites at 35×  | 3,000 × 35² = 3.7e6  | **slower** |
| 20,000 sprites at 20× | 20,000 × 20² = 8.0e6 | faster     |

Less than half the modelled fill, and it was slower. The most likely explanation is **per-tile blender serialisation with large overlapping sprites**: a small number of huge primitives all landing on the same raster tiles cannot be parallelised across ROPs.

SOURCED support: the Splotch GPU port found that above 2–3 px average particle radius the "particle spans multiple tiles" pathology dominates and the CUDA one-particle-per-thread path loses to the MIC path.

**This contradiction gates the entire splat path.** It is Measurement A in §12.

---

## 5. Raymarch cost

### Documented costs of raymarched volumes (all SOURCED)

| System                                                                          | Resolution                                 | Steps (view × light) | GPU        | Cost           |
| ------------------------------------------------------------------------------- | ------------------------------------------ | -------------------- | ---------- | -------------- |
| [Toft, Bowles & Zimmermann 2016](https://arxiv.org/abs/1609.05344)              | 1920×1080 full                             | 128 × ~6             | GTX 1080   | 297.7 ms       |
| Toft et al. 2016                                                                | half res                                   | 128 × ~6             | GTX 1080   | 128.0 ms       |
| Toft et al. 2016                                                                | half res                                   | 8 × ~6               | GTX 1080   | 2.3 ms         |
| Toft et al. 2016                                                                | half res + jitter                          | 8 × ~6               | GTX 1080   | 7.5 ms         |
| Toft et al. 2016                                                                | quarter res + jitter + TAA                 | 8 × ~6               | GTX 1080   | 2.4 ms         |
| Nubis / Horizon Zero Dawn, pre-optimisation                                     | 1080p full                                 | 64–128 × 6 cone      | PS4        | ~20 ms         |
| Nubis shipped                                                                   | quarter res, 1-of-16 px/frame, reprojected | 64–128 × 6 cone      | PS4        | ~2 ms          |
| UE5 mobile clouds, unoptimised, 50% coverage                                    | 1080p                                      | 64 × n               | Adreno 540 | 300 ms (3 fps) |
| …after mip/LOD + distance-scaled steps                                          | 1080p                                      | 64 × n               | Adreno 540 | 40 ms          |
| …shipped                                                                        | 320×180 RT → 1080p                         | 64 × 2               | Adreno 540 | 60 fps         |
| [Moinet & Neyret 2025](https://doi.org/10.1111/cgf.70072), naive sphere tracing | 1024²                                      | adaptive             | RTX 4080   | 110 ms         |
| Moinet & Neyret 2025, accelerated                                               | 1024²                                      | adaptive             | RTX 4080   | 16 ms          |

Note on the Toft rows: the published abstract states the headline result as "visually similar results with 1/16 the number of steps"; the millisecond table above comes from the paper body as reported by the research thread and is worth a human spot-check before it anchors a decision.

### Why our case is cheaper — four reasons, with evidence

**1. No secondary light march. Worth 2–6×.**
SOURCED: Toft et al. run 128 raymarch steps with ~6 lighting steps each, so **6 of every 7 density evaluations are the light march**. Schneider measured that merely _cheapening_ the light samples made the Nubis shader 2× faster. Unreal's Beer Shadow Map exists specifically to collapse this cost, and the UE mobile port shipped at 2 light steps. A pure-emission galaxy has no light march at all. Bonus: no light direction means no sun-on-the-horizon worst case — the Unreal study found that configuration forces shadow rays to the full 320-sample cap.

**2. Analytic per-step integration. This is what buys the low step count.**
SOURCED, and it is Toft et al.'s core contribution. It applies directly to us because it is an emission-absorption technique. Instead of `S = T·L` per step, integrate transmittance analytically across the step:

```
S = T₀ · L · (1 − e^(−ραx)) / (ρα)
```

Brightness then stops depending on step length. **This is what let them run 8 steps where 128 were needed.**

**3. Analytic density, no texture — with a counterpoint.**
SOURCED: Toft's jitter cost went 2.3 → 7.5 ms (**3.3×**), attributed explicitly to texture cache misses. An analytic field has no texture to miss, so blue-noise dithering — the standard banding fix — should be near-free for us where it is a 3.3× tax for a textured field.

COUNTERPOINT, also SOURCED, and it should be taken seriously: Schneider states that shipped Nubis was already instruction-bound, "most of that coming from the number of instructions"; and [Moinet & Neyret 2025](https://doi.org/10.1111/cgf.70072) show fully procedural FBM still costing 16 ms at 1024² on an RTX 4080. **Procedural is not automatically cheap.** SFU transcendentals run at roughly quarter rate (NVIDIA lists 16 SFU results/clock/SM against 64 FP32 FMA/clock/SM on A100).

**4. Incremental vertical profile. DERIVED, our own analysis, no source found. Worth ~2×.**
Along a straight ray, `z` advances by a constant `dz = dir.z · dt`. So the exponential vertical profile becomes a geometric sequence:

```
exp(−|z|/h_z) = exp(−|z₀|/h_z) · kⁱ    with  k = exp(−dz/h_z) hoisted out of the loop
```

One multiply per step, zero transcendentals, given a ray split at the midplane crossing (the `|z|` kink). That turns roughly 15 transcendentals per sample into about 5.

### DERIVED estimate for skymap

Assumptions stated so they can be challenged:

| Input                      | Value                                                       |
| -------------------------- | ----------------------------------------------------------- |
| Render resolution          | 1/3 linear ⇒ 0.23 Mpx (from 1080p) to 0.45 Mpx (from 1440p) |
| Steps                      | 64 typical, 128 worst case                                  |
| Light march                | none                                                        |
| ALU issue slots per sample | ~130–200 naive, ~80 optimised                               |
| Achieved ALU utilisation   | 35–50%                                                      |
| GPU                        | 6.4 TFLOPS integrated                                       |

Worked bound: `0.23e6 px × 64 steps × 80 slots = 1.2e9` slot-ops at the cheap end, `0.45e6 × 128 × 80 = 4.6e9` at the expensive end. At 6.4 TFLOPS (≈3.2e12 FMA/s) and 40% utilisation, ≈1.3e12 slots/s.

**Estimate: ~1.5–4 ms optimised, 6–10 ms naive at higher resolution.**

DERIVED cross-check via Nubis scaling: 20 ms ÷ ~3 (no light march) ÷ ~5.5 (pixel count) ≈ **1.2 ms of PS4-equivalent work**. Two independent methods agreeing within ~2×. That is enough to justify building one, not enough to skip measuring it.

### Inside-the-disc is the worst case but not a blocker

What breaks when the camera is inside the volume: entry-point precomputation collapses, sphere tracing is useless (you are already inside the surface), backface culling breaks.

What still works, and works _better_ there:

- **Early termination on transmittance is most effective exactly there** — sightlines toward the galactic centre saturate fast.
- Distance-scaled step sizes handle the near field.
- The analytic per-step integration (reason 2 above) removes the banding driver that low step counts otherwise introduce.

Residual risk: sharp dust lanes at close range are genuinely high-frequency. Dithering converts banding into noise; it does not conjure detail that the step count cannot resolve.

---

## 6. Kernel and Gaussian splatting

### The headline: 3DGS's distinctive machinery serves a problem we do not have

3D Gaussian Splatting's 16×16 tiles, per-tile Gaussian lists, and 64-bit radix sort all exist to serve **non-commutative alpha blending**. Strip that requirement and what remains is instanced quads with a Gaussian falloff and hardware additive blending — which is what skymap already does.

SOURCED: the sort-free WSR paper drops the compute rasteriser entirely and treats each Gaussian as an instance covered by a triangle pair.

**So "drop the sort" is a non-move for us. We never had one.**

### The "sorting is 30–50% of 3DGS" figure is misleading out of context

SOURCED datapoints, and they disagree with each other by two orders of magnitude because they measure different regimes:

- [HiGS (NVIDIA SIL, arXiv 2606.00352)](https://arxiv.org/abs/2606.00352): a global 64-bit radix sort at 4K costs **2.5–4.2 ms**; a CUB segmented sort over 32-bit macro-tile keys costs 0.21–0.30 ms; their three-tier cascade stays **under 0.08 ms** regardless of scene — a 42–73× speedup. Within their intersection stage, sort is only 30–41% of intersection time.
- WSR measured removing the sort entirely as worth **0–19%** on Adreno.
- FlashGS profiling puts sort well under 20% on A100/V100.
- **But on the web it inverts:** Visionary measured SparkJS at **172.87 ms of sorting out of 176.90 ms total** at 6.06M Gaussians, against their own WebGPU compute sort at **0.58 ms of 2.09 ms**.

Relevance to us: none directly, since we do not sort. Relevance indirectly: it is a warning that quoted 3DGS percentages travel badly between platforms, and web numbers are their own regime.

### Performance datapoints (SOURCED, with hardware and resolution)

| System                                                           | Hardware               | Resolution    | Result                                                                                    |
| ---------------------------------------------------------------- | ---------------------- | ------------- | ----------------------------------------------------------------------------------------- |
| HiGS                                                             | RTX PRO 6000 Blackwell | 1080p         | 5M → 75M Gaussians, 1.25 → 9.97 ms (roughly linear)                                       |
| HiGS                                                             | RTX PRO 6000 Blackwell | 4K            | 5M → 75M Gaussians, 1.97 → 10.29 ms                                                       |
| SuperSplat / PlayCanvas WebGPU                                   | Apple M4 Max           | 1298×962      | 1M: 138.7 fps · 10M: 124.1 · 20M: 97.8 · 30M: 85                                          |
| SuperSplat / PlayCanvas WebGPU                                   | iPhone 13 Pro Max      | 642×1126      | 1M: 77.6 fps · 4M: 42.4 fps                                                               |
| [StochasticSplats (ICCV 2025)](https://arxiv.org/abs/2503.24366) | RTX 4090               | teaser config | 1 spp 5.60 ms · 8 spp 6.71 ms · 16 spp 8.00 ms; "more than four times faster" than sorted |
| Gaussian Point Splatting (SIGGRAPH 2026)                         | RTX 4070 Ti SUPER      | —             | 425M Gaussians interactively at 4 spp; **no ms/fps table extractable from the paper**     |

### The most relevant datapoint in the whole survey

[Schneegans, Kreskowski & Gerndt, _Smaller than Pixels: Rendering Millions of Stars in Real-Time_, Eurographics 2025 Short Papers, DOI 10.2312/egs.20251029](https://doi.org/10.2312/egs.20251029), from CosmoScout VR:

- **50M Gaia stars, ~22M in frustum, ~8 ms at 4K on an RTX 4070 Super.**
- Compute software rasteriser, **one thread per star**.
- Luminance distributed over a 2×2 pixel area weighted by distance to pixel centres, giving smooth transitions as stars cross pixel boundaries.
- Luminance and effective temperature packed as half floats into a **32-bit integer texture**; luminance blended additively, temperature mixed as a weighted average.
- **No sort.**
- Glare handled as a separate full-screen pass: the Vos PSF model approximated as a sum of Gaussians, under 1% relative error for 0.2° ≤ θ ≤ 90° at n = 10 terms.

DERIVED from those numbers: ~88M atomic accumulations (22M stars × 4 pixels) in 8 ms ≈ **11 Gfrag/s**.

**Flag:** the published PDF has no text layer (confirmed — a fetch returns binary), and the Eurographics digital library returns 403. A [preprint PDF is hosted at Bauhaus-Universität Weimar](https://www.uni-weimar.de/fileadmin/user/fak/medien/professuren/Virtual_Reality/documents/publications/2025_Smaller_than_Pixels_Rendering_Millions_of_Stars_in_Real-Time.pdf) but is equally unparseable by tooling. **Human confirmation recommended before anchoring a decision on the 8 ms figure.**

### A warning against importing 3DGS intuition wholesale

SOURCED, [StochasticSplats §4.3](https://arxiv.org/abs/2503.24366): "simply lowering the rendering resolution does not speed up rasterization — the same number of Gaussians must be processed, and the view frustum for each pixel increases."

That is a **splat-count-bound** regime with multi-pixel splats. **We are fill-bound with sub-pixel-to-few-pixel sprites**, so half-res genuinely quarters our fragment work — as the shipped `mw-aggregate` target already demonstrates. Any 3DGS benchmark is measured in a regime structurally unlike ours. Read them for mechanism, not for numbers.

### EWA splatting and the 1-pixel floor

Zwicker, Pfister, van Baar & Gross's EWA framework convolves the projected reconstruction kernel with a screen-space low-pass Gaussian, giving the resampling filter variance:

```
M_k = (V̂_k + V_h)⁻¹      with  V_h = I
```

The consequence is our exact failure mode: as a splat projects below one pixel, the `V_h` term dominates and clamps the footprint to about 1 px. **EWA sets a 1-pixel FLOOR. We need ~3σ ≈ 8–10 px, an order of magnitude above it.** EWA does not give us large kernels; it only stops us going below one pixel.

3DGS initially got this wrong — a dilation filter constraining covariance to pixel size _without_ decreasing opacity, so shrinking splats stayed equally bright. Mip-Splatting (CVPR'24 best student paper) fixed it with a 2D Mip filter that **does** attenuate opacity as the splat shrinks.

**Energy conservation under the low-pass is the thing to get right.** Enlarging sprites requires scaling peak intensity by `1/σ²`, or the galaxy brightens as you zoom out.

### Anisotropy is nearly free if done right

All covariance work is **per-splat, not per-fragment**. The way to get anisotropic kernels with **zero extra varyings**:

Do not pass a conic to the fragment shader. Eigen-decompose the 2×2 covariance in the _vertex_ shader and expand the quad along the ellipse's principal axes. The fragment shader then receives a `vec2` already in units of standard deviations — which is what the quad UV corner offset already is — and evaluates `exp(-0.5 * dot(v, v))`.

Closed form for `[[a,b],[b,c]]`:

```
mid = 0.5 * (a + c)
λ   = mid ± sqrt(mid² − det)
major axis = normalize(vec2(b, λ₁ − a))
```

This matters concretely: skymap has a recorded finding that adding one extra `@location` varying cost 1.5 ms.

Also worth stealing: WebSplatter sizes the quad by `r = √(ln(255σ))` — the radius at which opacity drops below 1/255 — rather than a fixed 3σ. Bounded by the actual visibility threshold instead of a convention.

### Stratify the positions (but read the nuance)

The `1/√N` noise law assumes a Poisson point process. SPH literature distinguishes `γ = 0.5` convergence for random distributions against `γ = 1` for quasi-ordered ones; the Hydra documentation notes real particle distributions are "much more uniform" than Poisson. Blue-noise or glass placement can move noise from `N^(−1/2)` toward `N^(−1)` at **zero runtime cost** — it is a build-time data change.

**IMPORTANT NUANCE — conflating these two has already produced one wrong conclusion:**

- An earlier skymap investigation correctly concluded that **stratifying the LOD cull threshold cannot help**, because thinning a Poisson process by any deterministic spatial mask yields a Poisson process again. Simulated: iid hash gave an index of dispersion of 1.000, stratified thinning gave 0.97–1.04, at every resolution. **That finding stands.**
- What is different here is stratifying the **generated positions themselves**, making the parent process non-Poisson. The same simulation showed a jittered lattice at **0.594** against iid's 0.933.

Thinning cannot fix Poisson. Generating non-Poisson can.

### Adaptive kernel size

The standard astro prescription: variable smoothing lengths, with `h` set from the smallest sphere enclosing the 32 nearest neighbours, scaled `∝ ρ^(−1/3)`.

SOURCED SPH neighbour counts: cubic-spline kernels use 32–50 neighbours, with the pairing instability capping around 50–55. Quintic and Wendland kernels go higher — a quintic at `N_ngb = 128` gives effective resolution equal to a cubic spline at 34.

For us this is a build-time bake: one `h` per splat, no runtime cost.

### Splotch — the astronomy-native splatter

[Splotch](https://ascl.net/1103.005) (Dolag, Reinecke, Gheller & Imboden, New Journal of Physics 10:125006, 2008; ASCL 1103.005) solves per-particle:

```
dI/dx = (E_p − A_p I) ρ_p
```

discretised to:

```
I_after = (I_before − E_p/A_p) · exp(−A_p ∫ρ_p dx) + E_p/A_p
```

with the line integral through a Gaussian evaluating in closed form to `ρ₀,p σ_p exp(−d₀²/σ_p²) √π`, where `d₀` is the ray's closest approach. The Gaussian kernel was chosen deliberately over the SPH B₂-spline for exactly this closed form.

**Splotch always sorts by depth and walks back-to-front. It offers no zero-absorption shortcut.** If we adopt its absorption model we inherit its ordering requirement.

SOURCED 2008 costs: ~67 s/frame at 1400×1050 for 11M gas + 5M star particles on an AMD Opteron 850, at 30 bytes/particle. Not a useful modern number, but it establishes the algorithm's shape.

SOURCED, and this is the load-bearing finding for us: the GPU port found one-particle-per-thread CUDA "performs very well in the lower radii range", but **above 2–3 px average radius the MIC implementation outperforms**, because a particle affecting more than one tile must be transferred back to the host. **That is an argument against a tiled compute rasteriser for large kernels, and for hardware-blended instanced quads** — and it is the leading candidate explanation for the σ²N contradiction in §4.

### Epanechnikov instead of Gaussian

SOURCED: [_Don't Splat your Gaussians_ (Condor et al., ACM TOG 44:1, 2025)](https://arxiv.org/abs/2405.15425) gives closed-form transmittance and free-flight sampling for non-Gaussian kernels, presenting the 3D **Epanechnikov** kernel as the efficient alternative to the Gaussian. [Code](https://github.com/facebookresearch/volumetric_primitives).

INFERENCE, not stated in the abstract: Epanechnikov has **compact support**, so the footprint is exactly bounded rather than a truncated tail. For a fill-bound additive renderer that plausibly cuts covered area outright while keeping a closed-form line integral. Worth a measurement, not worth an assumption.

---

## 7. Recommended architecture: control variates

### The framing

**Our 150k sprites are a Monte Carlo estimator of the galaxy's density field, with a per-pixel sample count in the low tens. The clumping IS the estimator variance.**

Once stated that way, the textbook fix is a **control variate**: integrate an analytically-integrable component in closed form, and estimate only the residual numerically.

### It is already a named technique in rendering

SOURCED: Novák, Selle & Jarosz, _Residual Ratio Tracking_ (SIGGRAPH Asia 2014) does exactly this for participating media:

```
T = exp(−∫[μ(x) − μ_c(x)] ds) · exp(−μ_c · t)
```

The paper describes itself as bridging "the gap between closed form solutions and purely numerical, unbiased approaches."

Their stated limitation is instructive: a **constant** `μ_c` increases variance when it diverges from the true extinction, and their fix is a piecewise-constant `μ_c` from a supervoxel hierarchy. **A supervoxel hierarchy is a weaker control than an axisymmetric disc+bulge would be.** A galaxy is an unusually favourable case for this technique.

### The real-time version already ships in an engine

SOURCED: UE5's `SkyAtmosphere` is a LUT-evaluated analytic medium; `VolumetricCloud` is a separately raymarched heterogeneous residual composited against it. **The architecture is not novel. Applying it with a disc instead of a shell is.**

### Applied to skymap

An analytic base carries the smooth component. The existing sprites carry **only the residual**, so their noise scales with residual amplitude rather than total brightness. That kills clumping and fill cost in one move, because the base becomes **O(1) per pixel** — a handful of closed-form evaluations, independent of particle count.

It is also incremental: keep the sprites, keep the `mw-aggregate` target, add a base. Nothing has to be deleted to test it.

### THE TRAP — read this before building it

**Emission-absorption does NOT decompose additively.**

Optical depth splits cleanly:

```
τ = τ_base + τ_res    ⇒    T = T_base · T_res
```

But the emission integral does not:

```
∫ j · T dt  ≠  (base term) + (residual term)
```

The decomposition is exact only in the **optically-thin limit**. A galaxy is optically thin **except in the dust lanes** — which is exactly where the residual lives.

The base emission must be attenuated by the marched residual's transmittance. Which means: **the control-variate problem and the deep-opacity-map problem (§10) are the same problem seen twice.** Solve one and you have the other. Design them together or you will build two half-solutions.

---

## 8. MGE: Multi-Gaussian Expansion

This is a reference section — MGE is the leading candidate for the analytic base in §7, and most agents arriving here will not have met it.

### What it is

Origin: Emsellem, Monnet & Bacon 1994, A&A 285, 723. Cappellari 2002 (MNRAS 333, 400) gave the practical fitting algorithm, shipped as `mge_fit_sectors` / [MgeFit](https://pypi.org/project/mgefit/).

Surface brightness is written as a sum of concentric elliptical Gaussians:

```
Σ(x,y) = Σⱼ  Lⱼ / (2π σⱼ² q'ⱼ)  ·  exp( −(x² + y²/q'ⱼ²) / 2σⱼ² )
```

SOURCED: typically **10–20 components**, with σ spaced logarithmically over several decades of radius, fitting real galaxy images to about **1%**. The fit is linear in the amplitudes given σ and q, which is why it is fast and robust rather than a fragile nonlinear optimisation.

### Three properties make Gaussians uniquely suited

**1. Analytic deprojection.** A 2D Gaussian deprojects to a 3D Gaussian:

```
ρⱼ(R,z) = Lⱼ / ((√2π σⱼ)³ qⱼ) · exp( −(R² + z²/qⱼ²) / 2σⱼ² )
with  q'ⱼ² = qⱼ² sin²i + cos²i
```

Sérsic, exponential and King profiles have **no analytic deprojection** — they need numerical Abel inversion, which is ill-conditioned. **This is why MGE exists.**

**2. Closed-form line integral.** A 3D Gaussian integrated along any straight line is a Gaussian in the impact parameter. This is Splotch's `ρ₀ σ √π · exp(−d₀²/σ²)` with `d₀` the ray's closest approach, and it is EWA's statement too (exact under an affine approximation of the perspective map).

**This is what makes MGE a rendering primitive and not merely a fitting basis.** A 20-component MGE costs about 20 `exp` evaluations per ray, with no march at all.

**3. Potential and kinematics are also analytic** (one 1D quadrature). This is why MGE is standard in dynamical modelling — JAM, Schwarzschild — which in turn means the machinery is well-tested and **published MGE parameters exist for many galaxies**.

### What MGE structurally cannot represent

**Spiral arms.** MGE is a sum of concentric coaxial ellipsoids: axisymmetric, triaxial at best. It also cannot do dust lanes, knots, or any sharp feature.

**That limitation is exactly the carve.** MGE is the control variate of §7, and everything it cannot express is the residual:

| Falls to the analytic base              | Falls to the numeric residual   |
| --------------------------------------- | ------------------------------- |
| bulge, bar, thin disc, thick disc, halo | spiral arms                     |
|                                         | dust lanes                      |
|                                         | HII knots, discrete populations |

### The alternative base: a 4D LUT, Bruneton-style

SOURCED: Bruneton & Neyret's precomputed atmospheric scattering precomputes the full transport integral for a symmetric medium as a function of a small parameter vector — **4D for a spherical atmosphere** (r, μ, μ_s, ν) — packed into a 3D texture, evaluated with **fewer than 10 fetches per pixel**, running at 125 fps at 1024×768 on an 8800 GTS in 2008. [Reference implementation](https://github.com/ebruneton/precomputed_atmospheric_scattering).

INFERENCE: an **axisymmetric emissive galaxy is also exactly 4D** — camera position (R, z) plus two direction angles. And unlike an atmosphere it has:

- no sun direction, and
- no phase function, because pure emission is view-independent.

So it precomputes **once, offline, with no per-frame update**. Hillaire's 2020 rework of the atmosphere LUT needed per-frame updates only because the sun moves. **Our case is strictly easier than the atmosphere case, and we found nobody who has done it.**

### Validation path

Exact closed forms exist in limiting cases, which gives free unit tests for any base implementation:

- **Exactly edge-on rays.** van der Kruit & Searle (1981) give `I(R,z) = I₀ · (R/h_R) · K₁(R/h_R) · f(z)`, with `K₁` a modified Bessel function of the second kind. Shipped in [GALFIT](https://users.obs.carnegiescience.edu/peng/work/galfit/galfit.html) as `edgedisk` and in [Imfit](https://www.mpe.mpg.de/~erwin/code/imfit/) as `EdgeOnDisk`.
- **Exactly face-on.** Elementary: `sech²` integrates to `tanh`.
- **General inclined ray: NOT elementary.** `R(t) = √(at² + bt + c)` makes the integral non-closed-form.

**Record that clearly: the premise "there is a closed form for arbitrary rays through an exponential disc" is FALSE.** It holds for a Gaussian (hence MGE), and for exactly edge-on and exactly face-on exponential discs, and nowhere in between.

---

## 9. The data model

The model has to serve two very different consumers: the **Milky Way** (measured, high realism, one instance) and **~2.5M survey galaxies** (parametric, low realism, mass instanced). The unifying idea:

> **Provenance varies. Representation does not.**

### The shape

```ts
type GalaxyModel = {
  readonly base: readonly MgeGaussian[]; // always present — the analytic control
  readonly residual: ResidualField | null; // arms, dust: non-axisymmetric
  readonly discrete: readonly DiscretePop[]; // globulars, HII knots, bright stars
};

type MgeGaussian = {
  readonly sigmaKpc: number;
  readonly axisRatio: number; // intrinsic q
  readonly luminosity: number;
  readonly colorIndex: number; // per-component SED
  readonly barAngleRad?: number; // triaxial components only
};

type ResidualField =
  | { kind: 'logSpiral'; arms: readonly ArmSpec[]; dust: DustSpec }
  | { kind: 'measured'; armSkeleton: ArmSkeleton; dustCube: VolumeRef };

type DiscretePop =
  | { kind: 'catalog'; source: 'harris' | 'wiseHii' | 'gaia'; rows: unknown }
  | { kind: 'procedural'; spec: KnotSpec };
```

- **`base`** is always present. It is the §7 control variate and the §8 MGE. Per-component `colorIndex` means the bulge can be red and the disc blue without a second pass.
- **`residual`** is nullable because an elliptical galaxy genuinely has none. The tagged union separates "we synthesised a log-spiral" from "we measured an arm skeleton" — the same field, two provenances.
- **`discrete`** is a list because a galaxy can have several independent discrete populations with different sources.

### How the two consumers populate it

**Survey galaxy.** From `(hubbleType, r_eff, axisRatio, PA, M_abs, colour)`: synthesise the MGE from a Sérsic fit — published MGE approximations to Sérsic profiles exist, so this is table lookup plus scaling, not fitting. Add a procedural log-spiral residual if it is a spiral. Empty `discrete`.

**Milky Way.** MGE fitted to McMillan / Besançon parameters. Measured residual: BeSSeL arm skeleton + Drimmel global dust + Edenhofer local cube as a detail layer. Real `discrete`: Harris globulars, WISE HII regions, Gaia stars.

### LOD falls out of the representation

Recede from a galaxy and you drop `discrete`, then `residual`, leaving `base` — which at small angular size collapses to one or two Gaussians.

**A single-Gaussian MGE IS a billboard sprite.** Which is exactly what we already draw for survey galaxies. So the current galaxy point sprite is the _degenerate case of the same representation_, and the descent from "an SDSS galaxy as a dot" to "the Milky Way you fly through" becomes continuous in one model, rather than a crossfade between two unrelated renderers.

Survey galaxies also get anisotropy and correct flattening **for free**, since axis ratio and position angle are already in the catalog — the same fields that feed `PROVENANCE_AXES`.

### Relation to existing code

`GalaxyParams` stays the _generator's_ input. What is new is a pure function `GalaxyParams → MgeGaussian[]`, with the Milky Way overriding it with a fitted expansion instead of a synthesised one.

### Double-counting hazard

**If a globular cluster is in the `discrete` list, its flux must come OUT of the `base`.** This is the same subtraction the Gaia star-bin pipeline already performs for famous galaxies.

Get it wrong and bright regions are silently too bright. It will not be obvious by eye, because there is no reference to compare against — which is precisely why it needs a test rather than a visual check.

### Milky Way parameter values (SOURCED)

This is a lookup table. Anchored on Bland-Hawthorn & Gerhard 2016 (ARA&A 54, 529) and McMillan 2017 / GalPot.

**Global:**

| Quantity                      | Value           | Source    |
| ----------------------------- | --------------- | --------- |
| R₀ (Sun–GC distance)          | 8.2 ± 0.1 kpc   | BH&G 2016 |
| z☉ (solar offset above plane) | 25 ± 5 pc       | BH&G 2016 |
| M★ (total stellar mass)       | 5 ± 1 × 10¹⁰ M☉ | BH&G 2016 |

**Discs:**

| Component  | Scale length                                                                              | Scale height                 |
| ---------- | ----------------------------------------------------------------------------------------- | ---------------------------- |
| Thin disc  | ≈ 2.6 kpc (McMillan 2017 ≈ 2.5; McMillan 2011 3.00 ± 0.22; BH&G honest range **2–4 kpc**) | ≈ 300 pc (Jurić et al. 2008) |
| Thick disc | ≈ 3.6 kpc (McMillan 2011: 3.29 ± 0.56)                                                    | ≈ 900 pc                     |

The 2–4 kpc range on the thin-disc scale length is not a rounding error; it is the genuine spread in the literature. Do not present 2.6 kpc as precise.

**Bulge** (McMillan 2017, an axisymmetric approximation to Bissantz & Gerhard 2002):

```
ρ_b = ρ₀ / (1 + r'/r₀)^α  ·  exp[−(r'/r_cut)²]
r'  = √(R² + (z/q)²)
```

| Parameter | Value           |
| --------- | --------------- |
| ρ₀        | 9.93e10 M☉/kpc³ |
| r₀        | 0.075 kpc       |
| r_cut     | 2.1 kpc         |
| α         | 1.8             |
| q         | 0.5             |
| M_b       | 9.23e9 M☉       |

Shader cost: four SFU operations.

**Bar:**

| Quantity                              | Value                 |
| ------------------------------------- | --------------------- |
| Angle to Sun–GC line                  | 27° ± 2°              |
| Axis ratios                           | 1 : 0.5 ± 0.05 : 0.26 |
| X-structure max radius                | 1.5 ± 0.2 kpc         |
| Central vertical scale height         | 180 pc                |
| Fraction of stellar mass in bar/bulge | ~30–40%               |

SOURCED: the Milky Way is probably a **pure-disk galaxy**, with little room for a classical merger-made spheroid. Do not model a big classical bulge.

**Spiral arms** (Cox & Gómez 2002, the standard analytic 3D form):

```
γ        = N [ φ + Ω_s t − ln(R/R₀) / tan α ]
radial   = exp( −(R − R_ref) / R_s )
vertical = sech^B ( K z / B )
```

| Parameter             | Value                                                   |
| --------------------- | ------------------------------------------------------- |
| N (arm count)         | 2 or 4                                                  |
| Pitch angle α         | ≈ 9.9°–12°                                              |
| R_s                   | 3 kpc                                                   |
| H                     | 0.3 kpc                                                 |
| Overdensity amplitude | 18–24% (20% joint), from a 2024 A&A dynamical detection |

For the density term keep `n = 1` with `C₁ = 8/3π`. The `C₁ = 8/3π, C₂ = 1/2, C₃ = 8/15π` triple gives cos²-shaped arms with flat interarm regions and **looks considerably better**. Shader cost: 1 `atan2` + 1 `log` + 1 `cos` + 1 `exp`.

**Arm structure is CONTESTED.** Maser parallaxes favour four arms at pitch ~12°; dynamical models favour two-fold symmetry. The workable synthesis is **two dominant _stellar_ arms plus four gas/star-forming arms with spurs**. Pick that and you are defensible either way.

**Dust** (Drimmel & Spergel 2001, fit to COBE/DIRBE 240 µm):

- Warped exponential disc, scale length **2.26 kpc**, base scale height **134 pc**.
- Plus four spiral arms traced by HII regions.
- Plus a local Orion arm segment.

Alternative prescriptions, for sensitivity:

| Source                        | Scale length | Scale height                                                                                          |
| ----------------------------- | ------------ | ----------------------------------------------------------------------------------------------------- |
| Drimmel & Spergel 2001        | 2.26 kpc     | 134 pc                                                                                                |
| Misiriotis et al. 2006        | 5 kpc        | 100 pc                                                                                                |
| Common smooth prescription    | 4.5 kpc      | 140 pc (local normalisation 0.7 mag/kpc)                                                              |
| 2025 MNRAS, two-component fit | —            | h_thin = 72.7 ± 2.2 pc, h_thick = 224.6 ± 0.7 pc (better than a single exponential at 205.5 ± 1.5 pc) |

> **The single most visually load-bearing number in this document: the dust scale height (~130 pc) is less than half the stellar thin-disc scale height (~300 pc). That ratio is the entire reason edge-on spirals show a dark lane bisecting a fatter glow.** Get the ratio wrong and no amount of shading effort will make an edge-on view read as a galaxy.

**HI and the warp:** the HI disk is flat inside the solar circle and twists into a warp outside it — above the plane in one hemisphere, below in the other, the integral-sign shape — with the outer disk flaring.

**DERIVED op budget** for a composite analytic field (bulge + two discs + arms + dust), per raymarch sample:

| Version                                                                    | Transcendentals | Scalar ops |
| -------------------------------------------------------------------------- | --------------- | ---------- |
| Naive                                                                      | 14–16           | ~60        |
| With incremental vertical recurrence (§5 reason 4) and hoisted reciprocals | ~5              | ~50        |

**That is the difference between roughly 6 ms and roughly 3 ms.**

### Data sources for the Milky Way (SOURCED, with volumes)

**Reid et al. 2019, BeSSeL** — the arm skeleton.
~200 maser parallaxes and proper motions from VLBA/VERA at ±10 μas. Yields four arms with pitch angles and widths, covering Galactic quadrants 1–3 out to ~10 kpc. **Quadrant 4 is not covered** (the SπRALS survey is filling it), and a published correction pushes the far Sagittarius segment radially outward beyond ~8 kpc. Volume is trivial — this is a parameter table, not a dataset.

**Edenhofer et al. 2024, 3D dust** — the local detail layer.

| Property          | Value                                                          |
| ----------------- | -------------------------------------------------------------- |
| Sky sampling      | HEALPix NSIDE = 256 → 786,432 sight lines                      |
| Distance bins     | 516, log-spaced, **69 pc to 1250 pc**                          |
| Resolution        | 0.4 pc at 69 pc, degrading to 7 pc at 1.25 kpc                 |
| Posterior samples | 12                                                             |
| Input             | 54M stars' Gaia BP/RP + 2MASS + unWISE (Zhang et al. 2023)     |
| Access            | the [`dustmaps`](https://github.com/gregreen/dustmaps) package |
| Reliable range    | 50 mmag to 4 mag                                               |
| Volume            | ~406M voxels per posterior sample                              |

> **SCOPE TRAP: this reaches 1.25 kpc (1.95 kpc extended) out of a ~30 kpc disc.** It is a local detail layer around the Sun. It is not the Galaxy. Any plan that treats it as "the 3D dust map" is wrong by a factor of 20 in radius.

**WISE Catalog of Galactic HII Regions** (Anderson et al. 2014): 8,399 sources, ~1,900 spectroscopically confirmed, restricted to |b| ≤ 8°. Trivial volume.

**Harris 1996 (2010 edition)**: 157 globular clusters with X/Y/Z Galactocentric positions. One ASCII file of about 200 kB, at [physics.mcmaster.ca/~harris/mwgc.dat](https://physics.mcmaster.ca/~harris/mwgc.dat).

**Galaxia** (Sharma, Bland-Hawthorn, Johnston & Binney 2011, ApJ 730, 3): samples the Besançon analytic model — thin disc, thick disc, spheroid, boxy-triaxial G2 bar, halo — into a **continuous smooth star distribution over any requested volume**, with photometry, 3D extinction and metallicity per star. This is a ready-made, observationally-fitted, samplable Milky Way, and it is the obvious source for the discrete stream.

**Beyond ~2 kpc for dust**, fall back to parametric (Drimmel & Spergel, Misiriotis). Two extensions worth knowing: Rezaei Kh. et al. 2018 recovered arm structure in dust out to 7 kpc within 100 pc of the midplane using APOGEE red clump stars; Gaia GSP-Spec extinction maps (5.6M DR3 sources) extend all-sky coverage.

**A coincidence worth recording.** Measured local cube + parametric global model + measured arm skeleton is **exactly the analytic-base-plus-residual split of §7, arriving from the data side rather than the mathematics side.** The available data has the same shape as the recommended architecture. That convergence is the strongest single argument for the architecture.

---

## 10. Dust ordering

**This is the largest single realism error currently available to fix.**

### The two geometries

Compositing dust as a post-pass after the stars is, physically, the **uniform foreground screen** geometry — described in the radiative-transfer literature as "a maximally absorbing uniform configuration for the stars and dust" (Witt, Thronson & Capuano 1992). Correct ordering approaches the **mixed / slab** geometry, where stars and dust are interleaved along the line of sight.

SOURCED, the two attenuation laws:

```
Screen:  A = 1.086 τ                              — linear, unbounded
Mixed:   A = −2.5 log₁₀[ (1 − e^(−τ)) / τ ]       — logarithmic, saturating
                                                    → 2.5 log₁₀ τ  for τ ≫ 1
```

The mixed case saturates because of the **skin effect**: adding more dust matters less and less, as sources near the observer-facing edge come to dominate the emergent flux. Effective optical depth `τ̃ = 0.5⟨τ⟩` in the thin limit, `ln⟨τ⟩` in the thick limit.

### DERIVED error table

Computed directly from the two sourced formulas above. The multiplier column is the **flux ratio** — how many times too faint a screen composite renders the obscured light.

| τ   | Screen A (mag) | Mixed A (mag) | Δ (mag) | Flux ratio |
| --- | -------------- | ------------- | ------- | ---------- |
| 0.5 | 0.54           | 0.26          | 0.28    | **×1.3**   |
| 1   | 1.09           | 0.50          | 0.59    | **×1.7**   |
| 2   | 2.17           | 0.91          | 1.26    | **×3.2**   |
| 5   | 5.43           | 1.75          | 3.68    | **×30**    |

The Milky Way's midplane reaches A_V of tens of magnitudes edge-on. **A screen composite will erase the far half of the galaxy in an edge-on view.** Face-on at τ ≲ 0.5 the error is 0.2–0.3 mag and probably tolerable. **The error is inclination-driven, catastrophically so.**

### The qualitative failure is worse than the quantitative one

In an inclined galaxy the bulge is viewed **through** the near-side dust, while far-side dust is viewed **through** the bulge. SOURCED: consequently "dust lanes behind the bulge are not clearly visible."

This near/far asymmetry is not a subtlety. **It is the standard method for determining which side of an inclined spiral is nearer** — used by Slipher in 1917, by Hubble in 1943 and de Vaucouleurs in 1958 to establish that most spirals trail, validated on 146 nearby spirals by Iye et al. 2019, and corroborated independently by globular clusters behind the disk appearing statistically redder. It works even at 40° inclination for bulge-dominated systems like NGC 2775.

**A post-pass composite darkens both sides equally. It deletes the asymmetry and produces a galaxy that is symmetric in a way no real inclined spiral is. Shape errors read as fake much faster than brightness errors do.**

### Calibration, for budgeting

SOURCED fractions of stellar radiation absorbed by dust, bolometrically:

| Study                                 | Absorbed fraction |
| ------------------------------------- | ----------------- |
| DustPedia, all types                  | ~19%              |
| DustPedia, late types only            | 25%               |
| Herschel Reference Survey             | 32%               |
| SKIRT 3D radiative-transfer modelling | 36.5%             |
| Classic rule of thumb                 | ~30%              |

**The bolometric absorbed fraction is nearly independent of inclination — but colours are not.** Edge-on DustPedia galaxies show NUV−r redder by ≈1.8 mag than face-on ones.

The trap that follows: **a post-pass can be tuned to get the global energy budget roughly right while being visually wrong everywhere it matters.** Do not validate the dust model on total flux.

### Scale of the error, from the SED-fitting literature

- The homogeneous screen assumption biases stellar mass **~0.4 dex low** for edge-on galaxies at A_V ≳ 0.5.
- Moving from a uniform to a non-uniform screen improves the median UV attenuation offset from **−0.30 to −0.17 dex**.
- Rule of thumb: **~0.01–0.1 mag error** at low optical depth near face-on, growing to **~0.5–1 mag** edge-on and dusty.
- Isotropic against anisotropic scattering differs "only at the level of hundredths of a magnitude" — but neglecting scattering entirely always **underestimates** optical depth face-on.

So: scattering phase function is a non-issue for us; scattering as a whole is a small systematic; ordering is the big one.

### The graphics solution, unapplied in astronomy

**Deep / Fourier / moment opacity maps** solve "how do I attenuate an unsorted set of discrete emitters by a volume" in one bounded-memory pass. As far as this survey found, **no astronomy renderer uses them**. What astro renderers do instead is weaker:

- Nadeau et al. 2001 render stars as "Gaussian spots attenuated with distance" — a distance falloff, not a transmittance integral.
- Magnor et al. 2005 accumulate per-voxel scattering depth along the view ray.
- OpenSpace has `AbsorptionMultiply` / `EmissionMultiply` and a flag for stars inside the model, but no per-star transmittance lookup.

The graphics options, ranked for our case:

**Fourier Opacity Mapping** (Jansen & Bavoil, I3D 2010). **Do not use.** The authors scope it to "volumes where spatial opacity variations are smooth — smoke, gas, and low-opacity hair." Ringing around abrupt changes is documented, UE4's own docs warn about it, and a practitioner account describes abandoning it in UE3 for high-opacity particles. **A few sharp dust lanes is precisely the documented failure case.**

**Deep Opacity Maps** (Yuksel & Keyser). Render the volume's outer shell to a depth map, then place opacity layers relative to that entry point. Reported artifact-free with **3 layers**, where Opacity Shadow Maps still show layering at 128. Good fit: a galactic disc has a trivially computable entry surface.

**Boundary-Aware Extinction Mapping** (Gautron, Delalandre, Marvie & Lecocq, Pacific Graphics 2013). Explicitly fixes FOM's limitation by projecting into a boundary-aware function space focused on the relevant sections of the light path. This is the direct answer to "FOM wastes coefficients on empty space" — and empty space is 90% of a galaxy ray.

**MBOIT** (Münstermann, Krumpen, Klein & Peters, i3D 2018). Bounded memory, works with **log-transmittance so accumulation is additive**, no fragment lists, no sort. 4/6/8 power moments at 16 or 32 bits: **8 bytes/pixel** at 4×16-bit up to **32 bytes/pixel** at 8×32-bit. Two additive passes.

**MB3DGS** ([arXiv 2512.11800](https://arxiv.org/abs/2512.11800)). MBOIT pre-combined with splatting: order-independent transmittance from splats via power-transform moments with a closed-form recurrence, two additive passes, no sort. **The off-the-shelf answer if we want dust extinction of splats.**

Reminder from §7: this and the control-variate emission-attenuation problem are the same problem. Solve them together.

---

## 11. Prior art: what shipping products do

| Product                  | Milky Way / galaxy primitive                                                     | Resolution strategy                                                                                         | Notes                                                        |
| ------------------------ | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------ |
| **SpaceEngine**          | spiral galaxies = **sprite clouds**; ellipticals = raytracing shader             | two sliders, "while moving" and "while stationary", 0.1–1.0 in 0.05 steps                                   | negative-brightness additive sprites fake absorption         |
| **Gaia Sky**             | channels: bulge / stars / HII / dust, billboards + `GL_POINTS`                   | `halfResolutionBuffer`, global back-buffer scale (max raised 4→8), dynamic 1 / 0.85 / 0.75 at <30 / >60 fps | `numBillboard` default 30 per star group                     |
| **OpenSpace / AMNH**     | `RenderableGalaxy` = baked raycast volume **plus** point cloud                   | `Downscale = 0.4` (range 0.1–1.0, default 1.0)                                                              | volume `1024×1024×128` raw, from an NAOJ N-body + hydro sim  |
| **Celestia**             | prebuilt point-cloud "galactic forms" per Hubble type                            | count scales **up** with screen area                                                                        | alpha blending, not additive                                 |
| **Galaxia (dexyfex)**    | kernel splats: inverted cubes, pixel shader integrates density analytically      | low-res float target (e.g. 16,384 particles into 256×256), clamp on resolve                                 | abandoned both raycasting **and** billboards                 |
| **Lactea (KAUST/VISUS)** | per node, exact brightest stars + energy-preserving aggregate of the subtree     | WebGPU, progressive compute accumulation                                                                    | 1000 stars/node ≈ 5.6 MB chunks                              |
| **Splotch**              | Gaussian kernel splats with per-particle emission/absorption                     | offline                                                                                                     | always sorts back-to-front                                   |
| **Universe Sandbox**     | N-body particles; gas and dust as soft particles since the 2024 renderer rewrite | —                                                                                                           | no published numbers                                         |
| **Stellarium**           | Milky Way = textured sky sphere; galaxies = photographic quads 64–1024 px        | —                                                                                                           | **not comparable** to our problem                            |
| **Elite Dangerous**      | **could not establish**                                                          | —                                                                                                           | closed, undocumented; everything found was forum speculation |
| **No Man's Sky**         | **could not establish**                                                          | —                                                                                                           | closed, undocumented; everything found was forum speculation |

### Reduced-resolution rendering is the architecture, not an optimisation

Three independent teams, different decades, different graphics APIs, same answer:

- **OpenSpace** ships the Milky Way at `Downscale = 0.4` (code allows 0.1–1.0, default 1.0).
- **SpaceEngine**'s "Volumetric objects resolution" is **two** sliders — one while moving, one while stationary — each 0.1–1.0 in 0.05 steps.
- **Gaia Sky**'s `halfResolutionBuffer` routes objects to a lower-resolution buffer blended back with a 3-way combine filter, on top of a global back-buffer scale and dynamic resolution stepping.

Skymap's half-resolution `mw-aggregate` target is therefore in good company and is not the compromise it might feel like.

### Bilinear upsampling is good enough to start

SOURCED: OpenSpace's entire upscale is `texture(downscaledRenderedVolume, st)` with `GL_LINEAR` and `glBlendFunc(GL_ONE, GL_ONE)`, plus a matching `GL_DEPTH_COMPONENT32F` downscaled depth written to `gl_FragDepth`.

SpaceEngine's bicubic / Lanczos / CAS options arrived as spillover from black-hole rendering work, and their own note is that bicubic "is sharp (per-pixel) at 100% resolution, but looks somewhat blurry at lower resolutions". **The filter does not rescue a too-low divisor.** Choose the divisor first, then the filter.

### Two-stream rendering is consensus, split by what the object IS

Not by distance. This is the pattern to copy.

**OpenSpace `RenderableGalaxy`** has two sub-objects with independent toggles (`VolumeRenderingEnabled` / `StarRenderingEnabled`), and the docs say they "complement one another nicely, and should typically be shown together":

| Sub-object | Configuration                                                                                                                                            |
| ---------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `Volume`   | raycast `MilkyWayRGBAVolume1024x1024x128.raw`, `StepSize = 0.01`, `AbsorptionMultiply = 200`, `EmissionMultiply = 250`, early ray-out at `x² + y² > 0.7` |
| `Points`   | `MilkyWayPoints.off`, `EnabledPointsRatio = 0.3`, `glBlendFunc(GL_SRC_ALPHA, GL_ONE)`, depth test and depth write both off                               |

Provenance: built by Jon Parker for AMNH's _Dark Universe_, from an NAOJ N-body plus hydrodynamics simulation.

**Gaia Sky**: separate channels for bulge, stars, HII regions and dust, with a solid-angle "threshold angle point" switching between billboard and `GL_POINTS`. `numBillboard` defaults to 30 per star group.

**Lactea** (KAUST / VISUS, EuroVis 2025, **WebGPU** — [project page](https://vccvisualization.org/research/lactea/), [code](https://github.com/vccvisualization/lactea)): per node, an exact set of the brightest stars plus a coarse energy-preserving aggregate of the subtree. 1000 stars per node, generating 5.6 MB chunks sized for web fetching.

**SpaceEngine**: `FrontTexture` RGB is the emission distribution and alpha the dust distribution, with `absParticleColor (0.0 0.3 0.5)`; `SysTexture` R/G/B encode nebulae / open clusters / blue stars. Detail 1.0 means 64 sprites along the radius and along Z.

### Two negative results against raymarching a spiral

**dexyfex (Galaxia)** abandoned raycasting because "the aliasing artifacts are very noticeable" and the "result is somewhat messy and low in detail", moving instead to kernel splats — inverted cubes whose pixel shader analytically integrates density along the ray, explicitly _not_ billboards. He had already abandoned billboards because "the orientation of billboards has a singularity in the calculations leading to the effect of billboards appearing to 'spin'" when leaving the galactic plane. He renders into a low-resolution float target (example: 16,384 particles into 256×256) and clamps on resolve; WBOIT needed two low-res targets.

**SpaceEngine** — a team that loves raymarching and ships raymarched nebulae, accretion disks, aurorae and volumetric rings — **still renders spiral galaxies as sprite clouds a decade on.** Only ellipticals get a raytracing shader, because ellipticals are analytically smooth.

**OpenSpace's raymarch works from a BAKED volume and still needs the point cloud alongside it.**

**The pattern across all three: smooth analytic shapes get raymarched; structured discs with dust lanes get particles.** Anyone proposing a pure raymarched spiral is proposing something three shipping products declined to do. That is not a veto, but it is a burden of proof.

### Temporal caching is SpaceEngine's largest published win

SOURCED: the stationary skybox cache took **17 fps to over 125 fps**, using a 360×360×6 cube costing 12 MB instead of 1920×1920×6 at 337.5 MB. It ships as the separate "while stationary" slider. Practical advice from that team: 0.25–0.5 while moving, 0.75–1.0 while stationary.

Note carefully what this is: **the stationary-camera case.** See the verdict on temporal amortisation in §12.

### Celestia's count ladder is the opposite of what we tried

Celestia uses prebuilt "galactic forms" — point clouds sampled from template images, one per Hubble type, historically `GALAXY_POINTS = 3500`. The count is then:

```
pointCount = points.size() * clamp(detail, 0, 1)
power      = log(minimumFeatureSize / size) / log(kSpriteScaleFactor)
pointCount = min(pointCount, 1 << power)
kSpriteScaleFactor = 1.0f / 1.55f
```

Blob sizes shrink by 1.55× per power-of-two index, so the list is ordered big-to-small and truncation is O(1) and **never removes flux-dominant blobs**.

Two things to take from this:

1. **Count scales UP with screen area**, which is the opposite of the fewer-and-bigger experiment that measured slower (§1, §4).
2. The blend is `GL_SRC_ALPHA, GL_ONE_MINUS_SRC_ALPHA` — **alpha, not additive. Occluding blends bound overdraw in a way additive ones structurally cannot.**

Rendering detail: 128×128 procedural radial-falloff sprite plus a 256×1 colour LUT, with an early out at `screenFrac < 0.1`.

### Nobody uses 3DGS for galaxies

The 3D Gaussian Splatting literature is entirely photogrammetry, SLAM and heritage capture. **This is unexplored territory, not a proven path.** Treat any "just use 3DGS" proposal as a research project.

### Blend-model divergence worth noting

SpaceEngine and dexyfex both fake absorption with **negative-brightness additive sprites**, which requires a float render target and a clamp at resolve. Skymap renders to `rgba16float`, so we inherit that capability for free if we want it.

SpaceEngine's own statement of their bottleneck, which matches our measurement exactly: **"Transparency blending is a very expensive operation, that's why the galaxy renders so slowly."**

---

## 12. What to do next

### Measurement A — resolve the fill-model contradiction (~1 hour)

Draw the existing 150k sprites at 4× and 16× radius and read the perf harness.

- **If cost tracks σ²N:** the splat path is live, and bigger kernels are the cheap fix (§4: doubling count and multiplying σ by √2 cost the same).
- **If it does not:** the fill model is wrong — most likely per-tile blender serialisation, as the Splotch GPU port found above 2–3 px average radius — and the raymarch case strengthens considerably.

This single measurement gates the whole splat branch.

### Measurement B — cost the raymarch on real hardware (~20 minutes)

Skymap already ships a **192-step scalar-volume raymarch at 1/3 resolution composited with `additiveUpsample`**. Measure that pass. Then measure it again with the 3D-texture fetch replaced by a stub `exp(-length(p))`.

The ratio answers the analytic-vs-textured question (§5 reason 3, where the sourced evidence is genuinely contradictory) **at our actual pixel count on our actual GPU**.

**This is a better benchmark than anything else in this document.** Twenty minutes of work replaces every derived estimate in §5.

### Then

Fit an MGE to the adopted smooth Milky Way model and render only the base. **If the base alone looks smooth and costs O(1) per pixel, everything downstream is easier** — the sprites become a residual, the fill budget collapses, and the LOD ladder of §9 becomes reachable.

### Cheap wins orthogonal to the primitive choice

In rough order of value per unit effort:

1. **Stratify the generated positions** (blue-noise / glass). Build-time data change, **zero runtime cost**. Read the nuance in §6: stratifying the _cull threshold_ provably cannot help; stratifying the _generated positions_ can (simulated index of dispersion 0.594 for a jittered lattice against 0.933 for iid).
2. **Grow kernels with energy conservation** — scale peak intensity by `1/σ²` or the galaxy brightens as you zoom out.
3. **Size-tiered off-screen particle buffers** (GPU Gems 3, ch. 23, "High-Speed, Off-Screen Particles"). Route the **largest** sprites into the **smallest** buffers, since big footprints need the least resolution and cause nearly all the overdraw. Not novel, plausibly 2–4× fill.
4. **Epanechnikov instead of Gaussian** for bounded support (§6).
5. **Anisotropy via vertex-shader eigen-expansion** — zero extra varyings (§6).
6. **Per-splat adaptive `h`** baked at build time.

### Verdicts on the six ideas we pressure-tested

Recorded so they are not re-litigated.

**1. Analytic base + marched residual — PARTIALLY DONE, best headroom.**
The technique is called control variates, or residual ratio tracking in the rendering literature (Novák, Selle & Jarosz, SIGGRAPH Asia 2014). UE5 ships the architecture as SkyAtmosphere + VolumetricCloud. **The galaxy application is unpublished.** Read the non-additivity trap in §7 before starting.

**2. Sort-free additive splatting — ALREADY STANDARD, non-move.**
We are already additive. There is no sort to delete. The widely-quoted "sorting is 30–50% of 3DGS" is context-dependent to the point of being misleading (§6).

**3. Deep / Fourier opacity maps for discrete-object extinction — NOVEL in astronomy, standard in graphics. Worth doing.**
Use deep opacity maps or moment-based transmittance. **Not Fourier** — ringing around sharp features is documented and dust lanes are the failure case (§10).

**4. Static-volume temporal amortisation — TRAP as framed.**
The binding constraint is **camera** motion, not volume motion. The literature's "static scenes" means a static _camera_; our use case is a fly-through. Practitioners reduce to 4×4 or below specifically to limit artifacts under fast camera rotation, and a volume has no surface to reproject against, so you pin a fake depth — which breaks exactly when parallax _through_ the volume is the point. NRD's accumulation weight is `historyConfidence / (1 + historyLength)` with per-pixel disocclusion resets. **Mostly subsumed by an analytic base.** Nuance: SpaceEngine's 17→125 fps win is real, but it is the stationary-camera case, which they ship as a separate slider precisely because it does not survive motion.

**5. Data-anchored geometry — NOVEL at the level of ambition.**
Nobody has assembled Reid maser parallaxes + a 3D dust cube + WISE HII + Harris globulars into one renderable model. But see the **Edenhofer scope trap** in §9: that cube covers 1.25 kpc of a 30 kpc disc.

**6. Flux-conserving descent seam — NOVEL and unpublished.**
Gaia Sky solves catalog-to-catalog LOD well (octree over the catalog culled by minimum visual solid angle θ, out-of-core streaming, points transitioning to textured quads faded by apparent solid angle, double/float-split GPU arithmetic — Sagristà, Jordan, Müller & Sadlo, IEEE TVCG 25(1), 2019), but its Milky Way is a **separate particle system with no documented flux-conserving handoff**.

The tractable route: build the smooth field from the **same population model** the discrete stars are drawn from. Then at the seam, **subtract** the resolved stars' flux from the local field cell and add them back as points. Subtraction and substitution, not a crossfade. Flux is conserved exactly. **Direct precedent exists in this repo: the Rust-only famous-galaxy subtraction in the Gaia star-bin pipeline.**

### Dead ends, do not chase

- **GPU work graphs / mesh nodes.** DX12 and `VK_AMDX_shader_enqueue` only. Not in WebGPU.
- **Hardware ray tracing for volumes** (RayGS, RaySplats, Radiant Foam, GRTX). All RT-core dependent. Not in WebGPU.
- **Neural / learned volume representations.** They solve transfer-function-agnostic scientific exploration, which is a problem we do not have. We have one fixed appearance and we can bake it.

---

## 13. What we do NOT know

Genuine gaps. Do not fill them by inference.

- **Whether hardware FP16 additive blending on target GPUs sustains anything near the DERIVED ~11 Gfrag/s** implied by the _Smaller than Pixels_ numbers. FP16 blending commonly halves the rate, and blend-heavy wide-format tests often become bandwidth-bound before ROP-bound. **Measure before committing to a kernel size.**
- **Which Gaia Sky channels actually get `halfResolutionBuffer = true`.** The mechanism is documented; the per-channel assignment is not.
- **Elite Dangerous and No Man's Sky galaxy-map rendering.** Closed and undocumented. Everything found was forum speculation.
- **Lactea's frame-time table.** The paper is >10 MB or paywalled; a [freely accessible PDF](https://reemali.com/assets/pub/2025_05_alghamdi_lactea.pdf) exists but the timing table was not extracted.
- **The _Smaller than Pixels_ performance numbers** (50M stars, ~22M in frustum, ~8 ms at 4K on an RTX 4070 Super) came from a search summary. The published PDF has no text layer — confirmed by a direct fetch returning binary — and the Eurographics digital library returns 403. **Worth human confirmation before anchoring a decision on them.**
- **The Toft et al. millisecond table** in §5 comes from the paper body via the research thread; the abstract states only "1/16 the number of steps". Worth a spot-check.
- **No published real-time raymarched procedural galaxy with a stated frame budget exists.** If we build and measure one, we would have the only public number.
- **Shadertoy galaxy shaders are not a benchmark.** Several exist (`wfSXWV`, `ct2yDd`, `NfXSDM`, Dave_Hoskins' "Galaxy of Universes", mrange's "Spiral galaxy", FabriceNeyret2's "galaxy3"), but none publish timings, they run full-resolution single-pass with no temporal reuse, and they are mostly FBM-noise-driven — the expensive branch of "analytic". **Do not cite one as evidence.**

---

## References

Entries with links have had the URL verified. Entries without a link are cited by author, year and venue because a canonical URL was not verified; resolve them via ADS, arXiv or the DOI system rather than guessing.

### Stellar populations and surface brightness fluctuations

- Tonry, J. & Schneider, D. 1988, "A new technique for measuring extragalactic distances", AJ 96, 807. [ADS](https://ui.adsabs.harvard.edu/abs/1988AJ.....96..807T)
- Cerviño, M. & Luridiana, V. 2006, "Confidence limits of evolutionary synthesis models", A&A. (~10⁶ stars/pixel for the Gaussian regime; L-shaped per-pixel distribution.)
- McKee, C. F., Parravano, A. & Hollenbach, D. J. 2015, "Stars, Gas, and Dark Matter in the Solar Neighborhood", ApJ 814, 13. [arXiv:1509.05334](https://arxiv.org/abs/1509.05334) · [IOP](https://iopscience.iop.org/article/10.1088/0004-637X/814/1/13)
- HST PHAT survey of M31 (1.5 Gpx mosaic, >100M stars, ~0.19 pc/pixel).

### Milky Way structure and parameters

- Bland-Hawthorn, J. & Gerhard, O. 2016, "The Galaxy in Context: Structural, Kinematic and Integrated Properties", ARA&A 54, 529.
- McMillan, P. J. 2017, "The mass distribution and gravitational potential of the Milky Way", MNRAS 465, 76. (GalPot.)
- McMillan, P. J. 2011, MNRAS 414, 2446.
- Jurić, M. et al. 2008, "The Milky Way Tomography with SDSS I", ApJ 673, 864. (Thin-disc scale height ~300 pc.)
- Bissantz, N. & Gerhard, O. 2002, MNRAS 330, 591. (Bulge/bar density; McMillan's axisymmetric approximation is fitted to this.)
- Cox, D. P. & Gómez, G. C. 2002, "Analytical expressions for spiral arm gravitational potential and density", ApJS 142, 261.
- Drimmel, R. & Spergel, D. N. 2001, "Three-dimensional structure of the Milky Way disk", ApJ 556, 181. (COBE/DIRBE 240 µm dust fit.)
- Misiriotis, A. et al. 2006, A&A. (Alternative dust disc, R_d = 5 kpc, h = 100 pc.)
- Reid, M. J. et al. 2019, "Trigonometric Parallaxes of High-mass Star-forming Regions", ApJ 885, 131. (BeSSeL; ~200 masers, ±10 μas.)
- Edenhofer, G. et al. 2024, "Parsec-scale 3D mapping of the local interstellar dust", A&A. Access via [`dustmaps`](https://github.com/gregreen/dustmaps).
- Zhang, X., Green, G. M. & Rix, H.-W. 2023, MNRAS. (54M-star Gaia BP/RP + 2MASS + unWISE extinction catalog underlying Edenhofer et al.)
- Rezaei Kh., S. et al. 2018, A&A. (Dust arms to 7 kpc from APOGEE red clump stars.)
- Anderson, L. D. et al. 2014, "The WISE Catalog of Galactic HII Regions", ApJS 212, 1. (8,399 sources.)
- Harris, W. E. 1996 (2010 edition), "A Catalog of Parameters for Globular Clusters in the Milky Way". [Data file](https://physics.mcmaster.ca/~harris/mwgc.dat)
- Sharma, S., Bland-Hawthorn, J., Johnston, K. V. & Binney, J. 2011, "Galaxia: A Code to Generate a Synthetic Survey of the Milky Way", ApJ 730, 3.

### Multi-Gaussian Expansion and analytic profiles

- Emsellem, E., Monnet, G. & Bacon, R. 1994, "The multi-gaussian expansion method", A&A 285, 723.
- Cappellari, M. 2002, "Efficient multi-Gaussian expansion of galaxies", MNRAS 333, 400. Code: [MgeFit on PyPI](https://pypi.org/project/mgefit/)
- van der Kruit, P. C. & Searle, L. 1981, A&A 95, 105. (Edge-on exponential disc, `K₁` Bessel form.)
- [GALFIT](https://users.obs.carnegiescience.edu/peng/work/galfit/galfit.html) — `edgedisk` component.
- [Imfit](https://www.mpe.mpg.de/~erwin/code/imfit/) — `EdgeOnDisk` component.

### Dust radiative transfer and attenuation geometry

- Witt, A. N., Thronson, H. A. & Capuano, J. M. 1992, "Dust and the transfer of stellar radiation within galaxies", ApJ 393, 611. (Screen vs mixed geometry.)
- Iye, M., Tadaki, K. & Fukumoto, H. 2019, ApJ. (Trailing-arm validation on 146 nearby spirals.)
- DustPedia survey papers (absorbed fraction ~19%, 25% late types; NUV−r edge-on offset ≈1.8 mag).
- Herschel Reference Survey (absorbed fraction 32%).
- SKIRT 3D radiative-transfer modelling (absorbed fraction 36.5%).

### Volumetric rendering and raymarching

- Toft, A., Bowles, H. & Zimmermann, D. 2016, "Optimisations for Real-Time Volumetric Cloudscapes". [arXiv:1609.05344](https://arxiv.org/abs/1609.05344)
- Schneider, A., "The Real-Time Volumetric Cloudscapes of Horizon Zero Dawn" (Nubis), Guerrilla Games, SIGGRAPH course notes.
- Moinet, M. & Neyret, F. 2025, "Fast sphere tracing of procedural volumetric noise for very large and detailed scenes", Computer Graphics Forum 44, e70072. [DOI](https://doi.org/10.1111/cgf.70072) · [HAL open access](https://inria.hal.science/hal-05046040v1)
- Novák, J., Selle, A. & Jarosz, W. 2014, "Residual Ratio Tracking for Estimating Attenuation in Participating Media", SIGGRAPH Asia. [Project page](https://cs.dartmouth.edu/~wjarosz/publications/novak14residual.html)
- Bruneton, E. & Neyret, F. 2008, "Precomputed Atmospheric Scattering", EGSR. [Reference implementation](https://github.com/ebruneton/precomputed_atmospheric_scattering)
- Hillaire, S. 2020, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique", EGSR.
- Unreal Engine 5 documentation — `SkyAtmosphere`, `VolumetricCloud`, Beer Shadow Map.

### Splatting

- Kerbl, B., Kopanas, G., Leimkühler, T. & Drettakis, G. 2023, "3D Gaussian Splatting for Real-Time Radiance Field Rendering", SIGGRAPH.
- Zwicker, M., Pfister, H., van Baar, J. & Gross, M., "EWA Splatting", IEEE TVCG.
- Yu, Z. et al. 2024, "Mip-Splatting: Alias-free 3D Gaussian Splatting", CVPR (best student paper).
- Kheradmand, S. et al. 2025, "StochasticSplats: Stochastic Rasterization for Sorting-Free 3D Gaussian Splatting", ICCV. [arXiv:2503.24366](https://arxiv.org/abs/2503.24366) · [code](https://github.com/ubc-vision/stochasticsplats)
- Pająk, D., Bisson, M. & Lima, R., "HiGS: A Hierarchical Rendering Architecture for Real-Time 3D Gaussian Splatting", NVIDIA SIL. [arXiv:2606.00352](https://arxiv.org/abs/2606.00352) · [project page](https://research.nvidia.com/labs/sil/projects/higs/)
- Condor, J., Speierer, S., Bode, L., Božič, A., Green, S., Didyk, P. & Jarabo, A. 2025, "Don't Splat your Gaussians: Volumetric Ray-Traced Primitives for Modeling and Rendering Scattering and Emissive Media", ACM TOG 44(1). [arXiv:2405.15425](https://arxiv.org/abs/2405.15425) · [code](https://github.com/facebookresearch/volumetric_primitives)
- WSR — sort-free web splatting rasteriser (removing the sort measured at 0–19% on Adreno).
- FlashGS — 3DGS rasteriser profiling on A100/V100.
- Visionary / SparkJS WebGPU sort comparison (172.87 ms of 176.90 ms against 0.58 ms of 2.09 ms at 6.06M Gaussians).
- WebSplatter — quad sizing by `r = √(ln(255σ))`.
- SuperSplat / PlayCanvas WebGPU benchmark figures (Apple M4 Max, iPhone 13 Pro Max).
- "Gaussian Point Splatting", SIGGRAPH 2026 (425M Gaussians on an RTX 4070 Ti SUPER at 4 spp; no ms/fps table extractable).

### Order-independent transmittance and opacity maps

- Jansen, J. & Bavoil, L. 2010, "Fourier Opacity Mapping", i3D. (Scoped to smooth opacity variation; ringing documented.)
- Yuksel, C. & Keyser, J., "Deep Opacity Maps". [Project page](http://www.cemyuksel.com/research/deepopacity/)
- Gautron, P., Delalandre, C., Marvie, J.-E. & Lecocq, P. 2013, "Boundary-Aware Extinction Mapping", Pacific Graphics.
- Münstermann, C., Krumpen, S., Klein, R. & Peters, C. 2018, "Moment-Based Order-Independent Transparency" (MBOIT), i3D. (Christoph Peters' `momentsingraphics.de` hosts the materials.)
- "MB3DGS" — moment-based order-independent transmittance for 3D Gaussian splatting. [arXiv:2512.11800](https://arxiv.org/abs/2512.11800)

### Astronomical visualization systems

- Schneegans, S., Kreskowski, A. & Gerndt, A. 2025, "Smaller than Pixels: Rendering Millions of Stars in Real-Time", Eurographics 2025 Short Papers. [DOI 10.2312/egs.20251029](https://doi.org/10.2312/egs.20251029) · [EG digital library](https://diglib.eg.org/items/fc13d662-0f6a-4a23-9ae2-d7f1ec1afc78) · [preprint PDF, no text layer](https://www.uni-weimar.de/fileadmin/user/fak/medien/professuren/Virtual_Reality/documents/publications/2025_Smaller_than_Pixels_Rendering_Millions_of_Stars_in_Real-Time.pdf)
- Alghamdi, R., Hadwiger, M., Reina, G. & Jaspe-Villanueva, A. 2025, "Lactea: Web-Based Spectrum-Preserving Multi-Resolution Visualization of the GAIA Star Catalog", Computer Graphics Forum 44(3), EuroVis 2025. [DOI 10.1111/cgf.70117](https://doi.org/10.1111/cgf.70117) · [project page](https://vccvisualization.org/research/lactea/) · [code](https://github.com/vccvisualization/lactea)
- Sagristà, A., Jordan, S., Müller, T. & Sadlo, F. 2019, "Gaia Sky: Navigating the Gaia Catalog", IEEE TVCG 25(1).
- Dolag, K., Reinecke, M., Gheller, C. & Imboden, S. 2008, "Splotch: visualizing cosmological simulations", New Journal of Physics 10, 125006. [ASCL 1103.005](https://ascl.net/1103.005)
- [OpenSpace](https://github.com/OpenSpace/OpenSpace) — `RenderableGalaxy`, AMNH _Dark Universe_ Milky Way volume.
- [Celestia](https://github.com/CelestiaProject/Celestia) — galactic forms, `kSpriteScaleFactor`.
- SpaceEngine — volumetric resolution sliders, skybox caching, `FrontTexture` / `SysTexture` conventions (developer forum and changelogs).
- dexyfex, "Galaxia" development writeups — kernel splats via inverted cubes, billboard spin singularity, low-res float target.
- Nadeau, D. et al. 2001 — Gaussian spots attenuated with distance.
- Magnor, M. et al. 2005 — per-voxel scattering depth accumulation along the view ray.
- Stellarium, Universe Sandbox — surveyed, not comparable / no published numbers.

### Graphics techniques

- GPU Gems 3, Chapter 23, "High-Speed, Off-Screen Particles" (NVIDIA) — size-tiered off-screen particle buffers.
- NVIDIA Real-Time Denoisers (NRD) — accumulation weight `historyConfidence / (1 + historyLength)`, per-pixel disocclusion resets.
- NVIDIA A100 architecture whitepaper — 16 SFU results/clock/SM against 64 FP32 FMA/clock/SM.
- SPH kernel literature — cubic-spline neighbour counts 32–50, pairing instability at 50–55, quintic at `N_ngb = 128` equivalent to cubic spline at 34; Hydra documentation on non-Poisson particle distributions.
