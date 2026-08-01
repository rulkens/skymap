# Milky Way shape — findings record

**Status: LIVING DOCUMENT.** Work on the Milky Way's representation is in flight on branch
`milky-way-analytic-field`; append to this file as it continues rather than starting a new one.
It exists so that a post-mortem and a research write-up can both be derived from one place,
without re-deriving anything or re-walking a dead end.

**Scope.** What has been learned about _representing the Milky Way's shape_ — the sampling
statistics, the calibration errors found in our own preset, the fade's anchor bug, and the
external models that do and do not exist. It is not a rendering-primitive survey; that is
[`2026-07-30-galaxy-rendering-primitives.md`](2026-07-30-galaxy-rendering-primitives.md)
(currently on branch `docs-galaxy-rendering-research`, unmerged). This file cites that survey
and records only what is **new** or what **corrects** it.

## The organising rule

Every claim carries exactly one tag. The tag is the point of the document.

| Tag            | Means                                                                                                                      |
| -------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **MEASURED**   | Observed from a run, a simulation, or read off our source with `file:line`. Arithmetic over cited code constants is shown. |
| **LITERATURE** | Published, cited precisely enough to re-find. Nothing is tagged this way unless the citation was checked.                  |
| **INFERRED**   | Reasoning we have _not_ confirmed against a run or a source. **A future reader gets misled here.**                         |

If a claim in the source material carried no attribution, it is INFERRED, and says so.

---

## 1. Diagnosis

**MEASURED.** The cloud draws ~150,000 additive billboard sprites standing in for ~1e11 stars —
roughly **one sprite per 700,000 stars**. Wherever the disc covers real screen area the sprites
fall below one per pixel and resolve as individual particles. Sprite falloff _shape_ was
irrelevant at baseline because sprites clamp near `starPxMin = 1.0` and a 1 px quad has no room
to express a profile: this is a sampling-density failure, not a shading failure.

**MEASURED.** The draw is at its fragment ceiling. ~5x the baseline sprite area tanks the frame
rate; fewer-and-bigger was slower still (3k sprites at 35x beat by 20k at 20x), which is fill,
not instance count. Smearing arrives before smoothness does when splats are simply scaled up.

**The cure chosen** was the aggregate/upsample split mirroring the survey star renderer —
`milky-way-aggregate` → `mw-aggregate` offscreen → `milky-way-upsample` → HDR, dust staying
full-res in HDR because its multiplicative transmittance must land on the real cosmological
accumulation. **Not a raymarcher.** Shipped as PR #521 (`a1629dc7`).

**INFERRED.** That a raymarched density field was "the wrong call to reach for first" rests on
the reasoning that the codebase already carried the cheaper precedent, not on a measurement of
the raymarch. The comparison was never run. See §6 — the instrument to run it on did not exist
at the time.

## 2. The design error: the split copied the TARGET without the PARTITION

**MEASURED.** `mw-aggregate` holds every star population — bulge, bar, disc, arms, HII knots,
globular members; everything but dust. It is named an aggregate but it is not one. An aggregate,
in the sense the survey star renderer means it, is the **unresolved remainder** left after the
resolvable sources have been pulled into their own full-res stream.

So the cloud swapped one failure mode for its mirror image:

|                           | symptom                                  |
| ------------------------- | ---------------------------------------- |
| **before** (all leaves)   | sub-pixel sprites, reads as particles    |
| **after** (all aggregate) | globulars and HII knots smear to smudges |

The Gaia field looks even because it runs **both** streams. Every knob on the tuning panel is
compensating for the missing second one: `starPxMin` stabilises unresolved stars while
`starPxMax` stops resolved ones eating the frame, and they fight because both populations sit in
one buffer behind one clamp. **The aggregate wants a floor and no cap; the leaf stream wants a
cap and no floor.**

Population facts behind this, all **MEASURED** from source:

- Globulars are the smudges. `globularCount: 30` (`milkyWayGalaxyParams.ts:83`) x 90 stars each
  (`carveStarLayout.ts:89`) = 2,700 sprites, **1.8%** of a 150k budget. Thirty tight knots
  bilinearly upsampled from half res is thirty smudges. Moving them to full res costs 4x per
  sprite ≈ 7% of the budget.
- There are **no halo stars**. `SBb` → barred → `splitSpiralLike`, which returns `haloCount: 0`
  (`splitStarBudget.ts:72`).
- HII knots live inside the arm population at stride 5 — a halo glow, a core, and up to 3
  newborns per iteration (`carveStarLayout.ts:19-24`). They carry **colour** contrast, which blur
  destroys as surely as it destroys sharpness.

**CORRECTION to the working note.** The bulge is **not** 55% of the budget. `splitSpiralLike`
computes `bulgeFraction = 0.12 + 0.35 * bulgeSize * 0.8` for a barred galaxy
(`splitStarBudget.ts:66`); at the preset's `bulgeSize: 0.45` that is **0.246**, and the
`Math.min(0.55, …)` cap never binds. The bulge is **24.6%** of the budget, ~36,900 sprites.
Anything reading as a halo is the bulge or the globulars, but the bulge is a quarter of the
budget, not over half.

## 3. Shot noise — the correction that matters most

**Read this before proposing any change to the LOD cull.** It is the most expensive thing in this
document to rediscover.

**MEASURED.** The generated parent is **already a Poisson point process**. `generate.wesl`'s
`buildDisk` / `buildArm` / `buildHalo` / `buildBulge` draw radius, angle, height and size from
independent per-star `genRand`/`pcg4d` hashes. Thinning a Poisson process by **any** deterministic
spatial mask yields a Poisson process again — variance equals mean for every mask geometry — so
no rearrangement of the cull threshold can reduce shot noise.

**This kills the reversed-Morton / van der Corput stratified-threshold idea**, which was designed
on the false premise of an even parent.

**MEASURED**, simulation at 200k points thinned to 10%, index of dispersion (Var/mean; 1.0 =
Poisson):

| parent                  | iid hash | stratified threshold          |
| ----------------------- | -------- | ----------------------------- |
| generated (Poisson)     | 1.000    | 0.97–1.04 at every resolution |
| jittered lattice (even) | 0.933    | **0.594**                     |

It works on an even parent. Skymap does not have one.

**MEASURED, and worse:** the failure mode is severe and the tuning gradient points straight at
it. Once a cell holds several stars they share one threshold and pop as a block — dispersion 2.2x
at occupancy 6, **45x at occupancy 49**. So "it did nothing, let me coarsen the cells" walks
directly into visible cell-sized blocks.

**MEASURED.** Three places in the generator actively maximise local variance, and fixing them
costs no fill:

1. `generate.wesl:748` — `gapSkipped` rejects arm stars on an **independent per-star coin flip**
   (`genRand(…) > 0.4 + 0.6 * clumpMod`), up to ~37% at `armClump: 0.62`. The rate is spatially
   correlated (the intended interarm gap) but each trial is its own Poisson draw, the
   maximum-variance way to hit a given mean density.
2. `randomLuminosity` (`generate.wesl:198-207`) returns `0.12 + 0.4*u³` plus a 1.2% chance of a
   `3.2 * rand` flare. Heavy tail + ~1 sprite/pixel reads exactly as clumps.
3. `fluxConservingLod` (`lib/cloudSprite.wesl`) culls per-star by hash and boosts survivors.
   Thinning to rate `p` and boosting by `1/p` holds the mean flux and multiplies the variance by
   `1/p`, so relative noise goes as `1/sqrt(pN)`.

**INFERRED.** Item 1's fix — low-discrepancy acceptance along the arm index instead of a coin
flip — would keep the same large-scale gaps with a far more even local field. Not implemented, not
simulated. Note it is the _generation_ side, so §3's Poisson-thinning result does not forbid it;
stratifying the parent is exactly what does work (and is the nuance the primitives survey §6
records).

**Also see** the primitives survey §3: the effective-sample-size cost of the luminosity draw is
only ~25% (`N_eff/N = 0.75` by Kish at our flare factor 3.2). Equal weights recover that for free,
but it is not an order-of-magnitude lever.

## 4. σ²N invariance — only three things move the noise

**INFERRED (derivation shown, not measured).** Noise goes as `1/(R·sqrt(N))` and fill cost as
`N·R²`, so `noise ~ 1/sqrt(cost)` **whichever lever you pull**. Doubling the count and scaling the
radius by √2 are the same purchase at the same price. Only three things move the curve:

1. **Thin less** — costs fill, linearly.
2. **Widen the sprite** — a low-pass over noise that is white at the sprite scale; same trade.
3. **Cull by LUMINOSITY rather than at random** — the one structural escape.

**MEASURED** (arithmetic over `randomLuminosity`, `generate.wesl:198-207`, flare ignored): with
`L = 0.12 + 0.4u³`, `E[L] = 0.22`, and the top decile (`u > 0.9`) carries
`0.12·0.1 + 0.1·(1 − 0.9⁴) = 0.0464`, i.e. **21.1% of the flux**. So a brightness-ranked 90% cull
needs a **~4.7x** boost where a random one needs 10x.

**INFERRED.** That this "roughly halves noise power at the same sprite count" is the expected
consequence, not a simulated one. `inSB.y` is already at both call sites, so it is a signature
change with no new data — but the boost must be recomputed against the culled **flux** fraction,
never the culled **count** fraction. Getting that wrong changes total brightness silently.

**MEASURED, dead end:** simply enlarging sprites. Fill scales as `count × size²` and the half-res
split already bought a flat 4x.

## 5. Cost regimes differ by pose

**MEASURED.**

| pose                                                       | behaviour                                                                                                                                     | dominant lever                                                                                |
| ---------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **`milky-way-outside`** (22 kpc)                           | nearly every sprite pinned at the `starPxMin` floor; fill ≈ `count × π × pxMin²`, flat across the field                                       | `pxMin` (1→2 is 4x, 1→4 is 16x). `starSizeScale` does nothing below ~10x. `lodApparent` pays. |
| **`milky-way-close`** (17.8 kpc, disc overflows the frame) | near sprites blow past the `starPxMax` cap; a capped sprite is 48 target px ≈ 7,240 texels, so ~43 of them is one screen of additive overdraw | `pxMax`. `starSizeScale` genuinely quadratic. `lodApparent` nearly useless.                   |

`aggregateDivisor` trades against `pxMin` **exactly**: a sprite of half-extent P at divisor D
covers `P·D` screen px and costs `πP²` texels, so doubling D and halving P gives an identical
on-screen blob at a quarter the cost. The divisor is therefore strictly better than `pxMin` for
reaching a given blob size — **but only once nothing sharp is left in that buffer**, i.e. after
the partition of §2.

## 6. Measurement A — the instrument is the finding

**MEASURED, 2026-07-31.** Paired alternating A/B on `milky-way-outside`, `starPxMin` 1 vs 4 (a
16x fill change). Within-pair deltas: **−0.8 ms and +3.2 ms**. No consistent sign. The spread is
larger than the Milky Way's entire ~5 ms of a ~30 ms frame.

**MEASURED.** An earlier sequential sweep that looked like a clean monotonic win was **drift** —
reverting to baseline read **26.7 ms**, below every point in the sweep.

**MEASURED.** Per-pass slots cannot rescue it. Baseline read `milky-way-aggregate` 2.9, `bloom`
2.4, `hdr→swap` 2.4, `labels` 2.4, `star-catalog` 2.1, against a ~1.2 ms floor. Slots clustered
that tightly are reporting the **shared retire interval** — the Apple Silicon TBDR tell recorded
in the perf-harness notes — so "2.9 stayed 2.9" does **not** prove the pass is insensitive to
fill.

**CONCLUSION: do not re-run Milky Way perf work in the app harness.** It asks a ~5 ms subject to
show up in a ~30 ms frame with ±3 ms of between-run noise, and more `--frames` does not help
(that figure is within-run variance). The galaxy tool (`tools/galaxy-renderer`, :5400) draws the
cloud and nothing else, runs the app's own shaders and post chain since #521, and has
`?gpuTimings`. **That is where these measurements belong.** Caveat carried forward: the slot-sum
inflation gets _worse_ in the tool, not better, because there are fewer passes — add a wall-clock
rAF ms/frame readout and treat per-pass slots as ordinal only.

**MEASURED, harness blind spot.** `mw-aggregate·NEAR0` never appeared in the harness's merged
slot list, so a merged total can silently **exclude** a reduced-resolution offscreen pass —
flattering any change that moves work into one. Check the merged slot list covers your new pass
before quoting a merged delta.

Measurement B (the 192-step raymarch cost probe, primitives survey §12) is **dropped**: it only
decided whether mixed dust geometry is affordable, and §8 settles that independently.

## 7. There is no MGE of the Milky Way, and there cannot be

**LITERATURE, verified by search.** No published Multi-Gaussian Expansion of the Milky Way
exists. MGE deprojects an **observed surface-brightness image**; we are inside the object.
Every Milky Way MGE hit is a system _within_ the Galaxy (M54's nuclear cluster, and similar),
never the Galaxy itself.

**This is the single most likely thing for a future reader to try to "fix".** It cannot be
fixed by searching harder. It corrects the primitives survey §8, which presents MGE as the
leading candidate for the analytic base without noting that the Milky Way's expansion would have
to be **fitted by us, offline, to a published emissivity model** rather than looked up.

**LITERATURE.** The substitute is a fitted near-IR emissivity model — COBE/DIRBE traces red
giants, i.e. the bulk NIR luminosity, so those fits _are_ flux fields. See §10.

**LITERATURE.** F98's own laws (`sech²`, generalised ellipsoids) have no closed-form line integral
either, so "just use the published model" means marching. Closed form requires fitting our own
Gaussian mixture to F98's field.

## 8. Closed form, and its limit

**MEASURED** (implemented and in the tree at `src/services/gpu/shaders/lib/gaussianIntegral.wesl`).
A ray through an anisotropic Gaussian with **finite or semi-infinite bounds** integrates to
`erf`/`erfc`, **not** a bare `exp`. For `ν(p) = A·exp(−½ pᵀMp)` and `p(t) = o + t·d` with `d`
normalised, `a = d·M·d`, `b = o·M·d`, `c = o·M·o`, the emission from the eye to infinity is

```
A · sqrt(π / 2a) · exp(−½(c − b²/a)) · erfc(b / sqrt(2a))
```

This **corrects** the earlier "~20 `exp()`, no marching" claim, which was optimistic twice. The
`erfc` is cheap (Abramowitz & Stegun 7.1.26 rational approximation), so the first correction is
minor.

**The second correction is not minor. INFERRED (analysis, not a proof we wrote down):**
emission-**only** is closed form; emission **with self-absorption** is not. The outer integral
`∫T(t)σ(t)c(t)dt` contains `e^{−erf(t)}`. **This bites for a SINGLE Gaussian, not merely across
layers** — so it is not a layering problem that better ordering fixes.

Consequences:

- **Dust stays a separate multiplicative screen.** That is now a founded decision, not a
  convenience.
- **Mixed dust later is genuinely hard.** LITERATURE: the splatting field's workarounds are
  sorted alpha blending, constant-density ellipsoids, and moment-based transmittance — see the
  primitives survey §10, which also quantifies how wrong a screen composite is (×3.2 flux error
  at τ = 2, ×30 at τ = 5, and a deleted near/far asymmetry that reads as fake).
- **The seam cannot be additive.** `base + detail` is valid only where dust is a screen in front
  of the emission, not mixed through it.

Sketch under discussion, **not implemented**, INFERRED:

```ts
type RaySegment = { readonly emission: Vec3; readonly transmittance: Vec3 };
type FluxField = { readonly integrate: (o: Vec3, d: Vec3) => RaySegment };
// composite(base, detail) = base.emission * detail.transmittance + detail.emission
```

**MEASURED, current limitation.** The analytic field pass does not model the warp:
`milkyWayField/field.wesl:10-13` states it, and the reason is that the generator applies the warp
as a per-star `y` offset **after** placement, which a closed-form integral of an unwarped mixture
cannot carry. Edge-on views show the analytic field straight where the sprites bend. §11.1 was
written expecting a per-component shear to close this; it has since been implemented and
**measured wrong**. Read §11.1 before attempting it again.

## 9. Facts about our own code

Every row verified in the source before writing. Generator units: `outerRadiusOf` returns
`10 × params.radius` (`outerRadiusOf.ts:11`), so the preset's `radius: 1.05` gives
**outerRadius = 10.5 units**, mapped by `milkyWayCalibration` onto
`MILKY_WAY_DISC_RADIUS_KPC = 17.5` (`galacticCenter.ts:93`). **1 generator unit = 1.6667 kpc.**

### 9.1 The disc scale length was two different numbers wearing one name

**MEASURED.** `buildDisk` samples an `exp(−R/diskScaleLen)` surface density, then multiplies
brightness by `diskFalloff(radius, 1.7)` = `exp(−R/(1.7·diskScaleLen))` (`generate.wesl:603`,
definition at `:349-351`). An additive point cloud integrates **light**, not star counts, so the
emitted-light scale length is

```
h_light = diskScaleLen / (1 + 1/1.7) = diskScaleLen / 1.588
```

|                                                                        | number-density h                      | emitted-light h |
| ---------------------------------------------------------------------- | ------------------------------------- | --------------- |
| before recalibration (default `1/3.2`, `packGenerationUniforms.ts:97`) | 10.5/3.2 = 3.281 units = **5.47 kpc** | **3.44 kpc**    |
| F98 target                                                             | —                                     | 2.605 kpc       |
| after recalibration (`diskScaleLenFrac = 1.588 × 2.605 / 17.5`)        | 2.482 units = 4.137 kpc               | **2.605 kpc**   |

**Confusing the two produced a 2.1x error** (5.47 / 2.605) **that a later check reduced to 32%**
(3.44 / 2.605). Both errors are the same mistake at different stages: comparing a published
_light_ scale length against our _density_ scale length.

**MEASURED, stale comment.** `galaxyFieldMixture.ts:113-115` still reads "the MW preset samples
3.281" — true before the recalibration, and it compares F98's light scale directly against the
preset's density scale, which is precisely the confusion above. Both files are in-flight
uncommitted work; the comment should be updated when the preset change lands.

### 9.2 The bar angle was three different numbers, none agreeing

**MEASURED.** `computeBarGeometry.ts:38` drew the angle as `(rand() − 0.5) × 0.6 × asymmetry`
radians — a small random tilt, no relation to the real Galaxy. For the Milky Way preset the draw
landed at **2.62°**, all but along our line of sight: the one orientation the real bar is known
_not_ to have. Meanwhile the preset docblock claimed a bar "tilted ~45° to the Sun–centre line".

Now pinned at `barAngleDeg: 27` (`milkyWayGalaxyParams.ts:56`), citing Wegg & Gerhard 2013 and
Wegg, Gerhard & Portail 2015. `computeBarGeometry` still **consumes and discards** the RNG draw
when the angle is pinned, so every later main-stream draw keeps its position (`:21-23`).

**INFERRED / unverified:** the working note also records "an early hardcoded field used F98's
13.79°". No such hardcoded value exists in the current tree — 13.79° appears only in
`milkyWayGalaxyParams.ts:52` as the value explicitly **not** used, on the grounds that F98's tilt
describes the boxy bulge rather than the long bar. If it was ever a literal in a draft of the
field pass, that draft is gone.

### 9.3 The approach fade never fires at the galactic centre

**MEASURED.** `SCALE_FADE_BANDS.milkyWayApproach = { fullAt: 0.002, goneAt: 0.0002 }` — 2 kpc to
200 pc (`scaleFadeBands.ts:77`) — is evaluated against
`Math.hypot(ctx.drawCamPos[0], ctx.drawCamPos[1], ctx.drawCamPos[2])`
(`milkyWayCloudLiveness.ts:72`), the camera's distance from the **heliocentric render origin**,
i.e. from the **Sun**. Its own comment says what it was tuned for: the camera diving into the
disc _toward the Sun_.

Standing at the galactic centre you are R₀ from the Sun — **4x beyond `fullAt`** — so the band
returns exactly 1.0. **MEASURED** along the Sun→GC line, the composed alpha (approach ×
apparent-size × toggle) is **1.000 at 1 kpc, 100 pc, 1 pc and 10 milliparsecs from Sgr A\***. The
fade is not being overwhelmed by exposure; it never starts. You sit at full brightness inside the
densest part of the cloud with nothing in the pipeline able to turn it down.

**MEASURED, R₀ is a third disagreeing number.** The code constant is `SGR_A_DIST_MPC = 0.008`
(`galacticCenter.ts:46`) = **8.0 kpc**; its own docblock cites GRAVITY 2019's 8.178 ± 0.013 kpc;
BH&G 2016 gives 8.20 ± 0.1 kpc. Everything downstream of the fade uses 8.0.

**Why it went unnoticed:** the band was eye-tuned against **one** approach (the descent to the
Sun), and every Milky Way pipeline change since — including the half-res split, #521 — was
visually validated against that same approach. The GC is a second approach no gate had ever been
checked against.

**Ruled out, with evidence — do not re-chase:** the half-res split is energy-neutral
(`stars.wesl` conserves flux across the px clamp in both directions, `clampFluxScale = invK*invK`);
the fade math is byte-identical across the #521 merge; `starCount` decoupling from tier does not
bite at boot.

### 9.4 The warp had a full turn of precession starting inside the Sun's orbit

**MEASURED.** `warpTwist` was **2.4 rad = 137.5°** of line-of-nodes precession
(`generate.wesl:339` precesses the node by `warpTwist × rel`), against Chen et al. 2019's mapped
mean of 17.5°. `warpStart` was unset and fell back to the shared default 0.3, putting warp onset
at **5.25 kpc — inside the Sun's 8 kpc orbit**, where the HI disc is observed flat.

Now `warpTwist: 0.35` (0.35 rad = 20°) and `warpStart: 0.57` (~10 kpc). `warpStrength: 0.15`
(≈1.05 kpc of bend at the disc edge) is explicitly flagged **UNVERIFIED** in the preset itself:
a plausible ballpark with no published amplitude retrieved to check it against.

### 9.5 The vertical calibration lands at only one radius

**MEASURED, found while writing this record — not previously noted.** The preset sets
`diskThickness: 0.33` so that `diskHeight = 0.055 × outerRadius × diskThickness` = 0.1906 units =
**0.318 kpc**, matching the Gaussian of equal variance to F98's `sech²(Z/0.346 kpc)`
(σ = 0.346·π/(2√3) = 0.314 kpc). But `buildDisk` does not use `diskHeight` as the σ — it scatters
by `genNormal × diskHeight × (0.6 + bulgeRadius/(R + bulgeRadius))` (`generate.wesl:597`).

That flare factor equals 1.0 only at `R = 1.5 × bulgeRadius` = 2.41 units = **4.0 kpc**.
With `bulgeRadius = 10.5 × 0.34 × 0.45` = 1.607 units:

| radius          | flare factor | effective σ | vs F98's 0.314 kpc |
| --------------- | ------------ | ----------- | ------------------ |
| 4.0 kpc         | 1.000        | 0.318 kpc   | on target          |
| 8.0 kpc (Sun)   | 0.851        | 0.270 kpc   | 14% thin           |
| 17.5 kpc (edge) | 0.733        | 0.233 kpc   | 26% thin           |

The equal-variance derivation in the preset comment is correct about `diskHeight` and silent
about the flare. Whether the flare should be there at all is a separate question — F98's fit as
cited has a constant `h_z`.

(Minor: the comment states 0.188 units where `diskThickness: 0.33` gives 0.1906. 0.188 is the
target; the knob is rounded 1.2% high.)

### 9.6 Other standing constants

| Fact                                                                                                   | Location                   |
| ------------------------------------------------------------------------------------------------------ | -------------------------- |
| `splitStarBudget` clamps the total to `Math.max(20000, …)` — low-count experiments silently run at 20k | `splitStarBudget.ts:84`    |
| `MILKY_WAY_DISC_RADIUS_KPC = 17.5`, chosen so the Sun's 8 kpc sits at ~46% of the radius               | `galacticCenter.ts:93`     |
| Mean sprite luminosity `0.12 + 0.4·E[u³] + P(flare)·3.2·E[flare] = 0.2392`                             | `galaxyFieldMixture.ts:39` |

## 10. Literature — verified citations

These were checked. **Add no others to this table without checking them.**

| Source                                                                                                                                       | What it gives                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Freudenreich 1998**, ApJ 492, 495, [10.1086/305065](https://doi.org/10.1086/305065)                                                        | 47 params fitted to COBE/DIRBE 1.25–4.9 µm. Disc `exp(−R/h_r)·sech²(Z/h_z)`, **h_r = 2.605 ± 0.003 kpc**, **h_z = 0.346 ± 0.001 kpc**. Bar semi-axes 1.696 / 0.643 / 0.443 kpc, tilt **13.79° ± 0.09°**, generalised-ellipsoid exponents C⊥ 1.574, C∥ 3.501. **Contains NO spiral arms** — young-disc features were masked out of the fit. |
| **Drimmel & Spergel 2001**, ApJ 556, 181, [10.1086/321556](https://doi.org/10.1086/321556)                                                   | 26 params. Warped exponential disc, h_r 2.26 kpc, h_z 134.4 pc, **plus** an arm component.                                                                                                                                                                                                                                                 |
| **Chen et al. 2019**, Nature Astronomy, [arXiv:1902.00998](https://arxiv.org/abs/1902.00998)                                                 | Warp line of nodes, Cepheids. Mean **17.5° ± 1° (formal) ± 3° (systematic)**, **leading** spiral. Radially ~0° at 12.5 kpc, rising to ~20°, **flat beyond ~14 kpc**.                                                                                                                                                                       |
| **Jonsson & McMillan 2023**, MNRAS, [10.1093/mnras/stad1502](https://doi.org/10.1093/mnras/stad1502)                                         | Agrees on the leading spiral beyond R ~ 12 kpc, but finds the **linear rise continuing to 16 kpc** rather than flattening.                                                                                                                                                                                                                 |
| **Bland-Hawthorn & Gerhard 2016**, ARA&A 54, 529, [10.1146/annurev-astro-081915-023441](https://doi.org/10.1146/annurev-astro-081915-023441) | Thin disc **h_R = 2.6 ± 0.5 kpc**, thick **2.0 ± 0.2 kpc**; literature spread **1.8–6.0 kpc**. **R₀ = 8.20 ± 0.1 kpc**.                                                                                                                                                                                                                    |
| **Licquia & Newman 2016**                                                                                                                    | Bayesian average of IR scale-length measurements: **2.51 (+0.15 / −0.13) kpc**.                                                                                                                                                                                                                                                            |
| **Sormani et al. 2022**                                                                                                                      | 39-parameter **analytical** model of the 3D bar including the X/peanut shape, fitted to the made-to-measure model of Portail et al. 2017.                                                                                                                                                                                                  |
| **Gaia Collaboration, Drimmel et al. 2022** (DR3 disc mapping)                                                                               | Bar length, orientation angle and pattern speed **still not well constrained**.                                                                                                                                                                                                                                                            |

| **Reid et al. 2019**, ApJ 885, 131, [10.3847/1538-4357/ab4a11](https://doi.org/10.3847/1538-4357/ab4a11) | Maser parallaxes. Per-arm Gaussian widths at reference radii: 3-kpc 0.18, Norma 0.14, Sct–Cen 0.23, Sgr–Car 0.27, Local 0.31, Perseus 0.35, Outer 0.65 kpc. Width law **w(R) = 336 + 36·(R − 8.15 kpc) pc** (their own R₀ = 8.15). Young/maser tracer — a **floor** for old-star arm width; neither Reid paper measures the old-star arm. |
| **Reid et al. 2014**, ApJ 783, 130, [10.1088/0004-637X/783/2/130](https://doi.org/10.1088/0004-637X/783/2/130) | Earlier fit of the same programme: widths 0.17–0.63 kpc, slope **42 pc/kpc** over R 5–13 kpc. Superseded by 2019 where they differ. |
| **Rix & Zaritsky 1995**, ApJ 447, 82, [arXiv:astro-ph/9505111](https://arxiv.org/abs/astro-ph/9505111) | K′-band, 18 face-on spirals: ~half have strong two-armed spirals with arm/interarm contrast **"of order unity"** (≈ factor 2) — the grand-design ceiling for the contrast dial. |
| **Antoja et al. 2011**, MNRAS 418, 1423, [10.1111/j.1365-2966.2011.19190.x](https://doi.org/10.1111/j.1365-2966.2011.19190.x) | **SECONDARY carrier** for two numbers whose primaries resisted fetching: Drimmel & Spergel 2001's MW K-band arm–interarm ratio **K = 1.32 (A₂ = 0.14)** (D&S themselves flag it as possibly a lower limit), and GLIMPSE/Benjamin et al. 2005's **20–30% stellar count excess** at arm maxima (K ≈ 1.3, independent corroboration). D&S's *two-armed old-star structure* claim is primary-verified from their abstract. |

**LITERATURE, attribution incomplete — flagged deliberately.** Gaia red-clump work (~8.4M stars)
finds a **broken** disc profile: steep inside R ~ 3 kpc, a near-flat plateau 3–7 kpc, exponential
decline past the solar radius to ~13 kpc, sharper drop beyond ~13 kpc. **We do not have a precise
citation for this.** It is reported as literature but the paper was not pinned down. Do not cite
it onward without finding the source.

**LITERATURE, relevant later.** Vergely, Lallement & Cox 2022 — 3D extinction maps. For when dust
becomes a named feature rather than a procedural screen.

The scale-length spread is the point of that table: F98's 2.605, Licquia & Newman's 2.51,
BH&G's 2.6 ± 0.5 with an honest 1.8–6.0 range. **Do not present any single value as precise.**

## 11. Design results worth preserving

### 11.1 A shear preserves the closed form — but not on an origin-centred Gaussian

**MEASURED. The per-component shear was implemented and is WRONG. Do not re-propose it.**

The algebra that motivated it is sound and still holds: under `p → S·p` a Gaussian's quadratic
form transforms as `M → SᵀMS`, so §8's `erfc` integral survives exactly at zero per-ray cost, and
`det(S) = 1` leaves the flux normalisation untouched.

What does not hold is the step from there to "each Gaussian gets its own `S`, and the mixture
approximates the curve". **Every component in the mixture was centred at the ORIGIN** — the shader
evaluates `exp(−½ pᵀMp)` about `p = 0`. A shear applied there traces a **straight line through the
origin**. The generator's warp (`generate.wesl:330-341`) is identically **zero** inside
`warpStartRadius` and only then bends as `rel²`. No linear function is both.

**MEASURED**, ridge height along a radial line, in units of disc thickness, for the Milky Way
preset with the six-Gaussian disc:

| R/R_out | true warp | σ=3.4h component | σ=5.0h component |
| ------- | --------- | ---------------- | ---------------- |
| 0.20    | 0.00      | −0.00            | **−0.15**        |
| 0.57    | 0.00      | −0.00            | **−0.42**        |
| 1.00    | **−1.13** | −0.01            | −0.73            |
| 1.15    | **−2.74** | −0.01            | −0.84            |

Each component tilts by a different amount, so instead of one warped surface they **fan apart**.
Rendered edge-on this reads as two faint flat sheets, which is how the user found it.

**The diagnostic trap, recorded because it is what let this ship.** Verifying that the shear
matches the true warp **at each component's linearisation radius** always passes — that is the one
point where a tangent is exact by construction. A per-component table of shear magnitudes looked
healthy for exactly that reason. **The honest check is the ridge across the whole disc**, which is
the table above; a single-radius check cannot fail.

**The fix requires components to carry a CENTRE**, so that a blob can be localised in radius and a
shear becomes a linearisation about the blob's own centre rather than about the galaxy's. The warp
then comes from **where the blobs are placed** — on the warped surface — rather than from bending
a blob that spans the whole galaxy. In flight, unproven at time of writing; the acceptance test is
the ridge table above, not a per-component one.

**Consequence beyond the warp.** Centres are a prerequisite for §12's named features in general:
dust lanes, star-forming regions and globular clusters are all localised objects and none can be
an origin-centred Gaussian.

### 11.2 Immersion measure: local mean sprite separation

**INFERRED, supported by one numerical coincidence.** The right measure of "am I inside the
sprites" is the local mean sprite separation

```
s = (N · ν̂)^(−1/3)
```

**MEASURED** (arithmetic over cited constants): for N = 150,000 over a disc of R = 17.5 kpc and
full thickness 0.6 kpc, the volume is `π·17.5²·0.6` = 577.3 kpc³, giving 259.8 sprites/kpc³ and
**s = 157 pc**.

The hand-tuned `goneAt` is **200 pc** (`scaleFadeBands.ts:77`), arrived at independently by eye.

**Record the convergence — it is evidence the measure is the right one. It is not a proof.** One
coincidence within 30% is what we have.

**Consequence to carry.** The encoding survives the star bag's deletion (§12) but `N` changes
meaning: globulars and HII regions become individually resolvable too, so the question persists
while the thing being counted does not.

### 11.3 The fade braids two jobs

**INFERRED (design analysis).** `milkyWayApproach` is doing two things at once:

1. A **Gaia handoff** — correctly Sun-anchored, because that is where the star catalog takes
   over. Present, calibrated, working.
2. An **immersion** term — how deep inside the sprite field the camera is. **Absent**, and the
   cause of the GC bug in §9.3.

Braided together, they cannot both be right. A fix shape that has been discussed but **not
implemented**: key the band on distance to the nearest `BODY_REGIONS` anchor rather than the
origin. Near the Sun the nearest anchor _is_ the Sun, so today's calibration reproduces
bit-for-bit; at the GC it becomes Sgr A\*.

**Rejected, with the reason recorded so it is not re-proposed:** plane distance `|z|`. It fails
for the edge-on-from-outside view, where `|z| ≈ 0` at 100 kpc would blank the galaxy entirely.

**Open, and the fix does not answer it:** 200 pc is the right handoff to Gaia near the Sun, but
at the GC nothing replaces the impostor there — the S-stars are milliparsec-scale and Gaia's
bulge coverage is heavily extincted. The band edges likely want to be per-region.

**USER DECISION 2026-07-31:** do not fix this inside the S-star branch. It lands in its own PR
once the Milky Way rendering itself is sorted.

### 11.4 Arms are a flux-field term, not a star population

**INFERRED (settled decision, not measured).** Per-ray analytic arms are out: a log-spiral arm is
~60–100 kpc of arc, so ~240–400 Gaussians for four arms, needing GPU spatial acceleration — and
the thin-disc shortcut (intersect plane × thickness) fails for the in-plane view from Earth,
which is the primary case.

The primitive was never the question. 3DGS does not ray-evaluate either; it **rasterises** each
Gaussian as a screen quad, which is what `milkyWayAggregateLayer` already does. **The question is
how sprite positions are chosen** — currently Poisson-drawn, which is maximum variance for a
given mean (§3). Decision: place arm sprites by a **deterministic fitted mixture along the arm
ridge**. Same renderer, same fill, zero shot noise on the smooth part; clumping becomes an
additive choice (HII knots, OB associations) rather than a defect to fight.

**Budget consequence, INFERRED:** with the base carrying bulge + bar + smooth disc, the same 150k
sprites cover only the arms — roughly 15% of the previous footprint, i.e. 10–20x the surface
density at zero extra fill. It also ends the `starPxMin` vs `starPxMax` fight of §2: each clamp
finally serves one population.

**Correctness trap to design against.** F98's disc is the **old smooth population** (young
features masked from the fit); NIR arms are a modest overdensity on top. Arm sprites must carry
the **overdensity above the axisymmetric mean**, not the arm's total light, or they double-count.
It presents as "the base is too dim" and gets fixed with the wrong knob.

## 12. The goal, stated by the user

**The generic star bag is to be DELETED, not shrunk.** Not "kept to carry the structured
remainder" — deleted. The end state is the analytic flux field plus a set of **named feature
terms**, each with its own primitive and its own real data: dust, star-forming regions, globular
clusters. Nothing generic called "stars". The reasoning: a bag of sampled stars cannot describe
galaxy structure realistically, so it goes rather than gets tuned.

**Sequence: tune the flux field first, then arms.**

Consequences for what is worth investing in:

- `splitStarBudget`, `starCount`, the bulge/disc/arm/halo split, the 20k floor and
  `MILKY_WAY_STARS_PER_TIER` are **scaffolding for a bag being removed**. Keep them working; do
  not invest in tuning them.
- Globulars stop being generated. **LITERATURE:** Harris 1996 (2010 edition) publishes **157**
  globular clusters with X/Y/Z galactocentric positions, against the preset's invented 30
  (`milkyWayGalaxyParams.ts:83`). Under "named features with real data" that is a **catalog**, and
  it is probably the easiest feature to do properly first.
- The immersion-fade encoding of §11.2 survives; `N` changes meaning.

## 13. What we could not support

- **The Gaia red-clump broken-profile result** (§10) — reported as literature, attribution
  incomplete.
- **The claim that an early hardcoded field used F98's 13.79°** (§9.2) — no such literal exists
  in the tree.
- **`warpStrength: 0.15`** ≈ 1.05 kpc of edge bend — the preset flags it UNVERIFIED itself; no
  published warp amplitude was retrieved.
- **Whether emission-with-self-absorption's non-closed-form result** (§8) was derived rigorously
  or asserted. The conclusion (dust as a separate screen) is founded either way, but the algebra
  is not written down anywhere in the repo.
- **Whether the raymarch would in fact have been the wrong first call** (§1). Never measured
  against the split.

## 14. The arm ridge is a measured object (2026-08-01)

The arms went from inherited sprite-budget quantities to measured ones. Three results worth
keeping beyond the git log:

**Width.** Reid 2019's law re-expresses dimensionlessly as **σ(R) = 0.017·h + 0.036·R** (h = disc
scale length; 2.605 kpc for the MW reproduces 336 pc at R₀ exactly). A positive intercept — arms
do not taper to zero at the centre — and a scale-free slope (~2° wedge), so the same law serves
any galaxy the survey map draws. The measured law is the *young* arm; `armWidthScale` (default 1)
carries old-population broadening as an explicit, honest modelling choice, not a fudge.

**Flux.** Arm light now derives from contrast, not from a share of the sprite budget:
λ(R) = (K−1)·Σ_disc(R)·√(2π)·σ(R) along the ridge, with the disc debited by exactly the added
excess (both sides of the §11.4 double-counting ledger analytic). At K = 1.3 with two young arms
the excess is **3.3% of disc flux** — verified independently of the code's own bookkeeping.
Thin arms at real contrast are a small *disc-integrated* term even when locally prominent; if
that reads as "too subtle," the honest dials are K (→ 2.2 grand-design) and age, not a boost.

**The double-count the user's eye found.** Sprite-parity calibration landed at flux ×0.5 against
the code's mirrored `ARM_BRIGHTNESS = 1.9` — and 1.9 × 0.5 = 0.95. The mirror factor was already
inside the un-folded `armFraction`; the eyeball measurement exposed a 2× double-count that the
derivation had hidden. Deleted with the parameterization it indicted.

**Per-arm age reconciles two-vs-four.** The MW's old-star (K-band) light is two-armed while young
tracers ride four arms (§10: D&S primary-verified). One per-arm scalar in armTable lane 7
(padding until now) resolves it: four geometric arms, ages [1.0, 0.2, 1.0, 0.2], contrast weighted
by age → two-armed old-star light on four-armed geometry, with SFRs/dust later riding the young
pair. No preset hack; the structure falls out of the parameter.

## 15. Sampling lessons — blob counts and the ring seam (2026-08-01)

**Blob count is a sag bound, not a knob.** Between ridge blobs the linearised chain sags below
the true curve by chord²·κ/8. Bounding that against the local σ_across (tolerance 0.3) derives
the per-arm count: ~19–22 at the MW preset (vs the previously eyeballed 28), growing automatically
with tighter pitch, narrower width, or stronger meander. Budgeting the count against the component
cap makes overflow impossible by construction — the readout's warning became dead code.

**More rings is NOT a free smoothness upgrade.** The derived ring sigma is proportional to ring
*spacing*, so raising ring count narrows every ring — which keeps the band gapless internally but
**sharpens the band's edges**. Freezing the count at 8 (on a "warp fidelity is nearly free"
argument) produced a single faint visible ring at the band's inner edge against the origin discs;
the visually settled value was 2, where the derivation reproduces the approved σ = 0.13 exactly.
The derivation guarantees gaplessness *inside* the band and says nothing about blending at its
boundaries. Warp fidelity inside the band is bounded by ring count; at 2 the settled look accepts
that trade knowingly.

## 16. Decisions log (2026-08-01)

- **Splat path is the only field renderer.** Loop deleted after the A/B: 0.3–0.4 ms vs 1 ms at
  defaults; cost tracks covered area, not pixels × components.
- **comps moved uniform → storage buffer**; background extras render analytically (per-extra
  mixtures, world-transformed CPU-side, one instanced draw). Amplitude transforms as **A/s**:
  extras scale sprite *size* (flux ∝ s²) against the Gaussian's s³ volume.
- **Rings de-featured**: six of eight ring knobs frozen/derived (σ from spacing at 13/23 overlap;
  per-ring flux from closed-form annulus integrals of exp(−R/h) — the geometric-falloff trap died
  with its slider). Rings ride the disc's enable; they are warp plumbing, not a layer.
- **Colour architecture decided** (not yet built): colour belongs to *populations* (SSP-grounded
  palette registry), variation belongs to *features* (per-channel dust reddening, SFR knots), the
  smooth field stays colour-smooth — unresolved light averages, so blob-level colour jitter is a
  rendering artifact, never realism. Survey closure: the model's integrated colour must match the
  galaxy's own measured catalog colour index.
- **Survey-to-parameters map** drafted (`docs/superpowers/specs/2026-08-01-survey-to-params-map-design.md`):
  fetch-verified range table; headline pipeline find — 2MRS carries ZCAT T-types for ~21k galaxies
  that the parser currently drops; `classByte` is the documented landing slot.

## Related

- [`2026-07-30-galaxy-rendering-primitives.md`](2026-07-30-galaxy-rendering-primitives.md) —
  the primitive survey (billboards / splats / raymarch), SBF statistics, dust ordering, prior art,
  and the Milky Way parameter lookup tables. On branch `docs-galaxy-rendering-research`.
  §7 (control variates), §8 (MGE) and §10 (dust ordering) are the sections this file corrects or
  extends.
- [`docs/RENDERER.md`](../RENDERER.md) — the frame graph and the WebGPU landmines.
- [`.claude/skills/perf/SKILL.md`](../../.claude/skills/perf/SKILL.md) — read before quoting any
  number from `npm run perf`; §6 is why.
