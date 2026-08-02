# Preset calibration

Every row verified in the source before writing. Generator units: `outerRadiusOf` returns
`10 × params.radius` (`outerRadiusOf.ts:11`), so the preset's `radius: 1.05` gives
**outerRadius = 10.5 units**, mapped by `milkyWayCalibration` onto
`MILKY_WAY_DISC_RADIUS_KPC = 17.5` (`galacticCenter.ts:93`). **1 generator unit = 1.6667 kpc.**

## The disc scale length was two different numbers wearing one name

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

## The bar angle was three different numbers, none agreeing

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

## The warp had a full turn of precession starting inside the Sun's orbit

**MEASURED.** `warpTwist` was **2.4 rad = 137.5°** of line-of-nodes precession
(`generate.wesl:339` precesses the node by `warpTwist × rel`), against Chen et al. 2019's mapped
mean of 17.5°. `warpStart` was unset and fell back to the shared default 0.3, putting warp onset
at **5.25 kpc — inside the Sun's 8 kpc orbit**, where the HI disc is observed flat.

Now `warpTwist: 0.35` (0.35 rad = 20°) and `warpStart: 0.57` (~10 kpc). `warpStrength: 0.15`
(≈1.05 kpc of bend at the disc edge) is explicitly flagged **UNVERIFIED** in the preset itself:
a plausible ballpark with no published amplitude retrieved to check it against.

## The vertical calibration lands at only one radius

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

## Other standing constants

| Fact                                                                                                   | Location                   |
| ------------------------------------------------------------------------------------------------------ | -------------------------- |
| `splitStarBudget` clamps the total to `Math.max(20000, …)` — low-count experiments silently run at 20k | `splitStarBudget.ts:84`    |
| `MILKY_WAY_DISC_RADIUS_KPC = 17.5`, chosen so the Sun's 8 kpc sits at ~46% of the radius               | `galacticCenter.ts:93`     |
| Mean sprite luminosity `0.12 + 0.4·E[u³] + P(flare)·3.2·E[flare] = 0.2392`                             | `galaxyFieldMixture.ts:39` |
