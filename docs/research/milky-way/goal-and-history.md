# Goal and history

## Diagnosis

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
the raymarch. The comparison was never run. See [Measurement A](measurement.md#measurement-a--the-instrument-is-the-finding) — the instrument to run it on did not exist
at the time.

## The design error: the split copied the TARGET without the PARTITION

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
- There are **no halo stars**. `SBb` → barred → `spiralLike`, whose halo share is 0
  (`galaxyPopulationFractions.ts:53`).
- HII knots live inside the arm population at stride 5 — a halo glow, a core, and up to 3
  newborns per iteration (`carveStarLayout.ts:19-24`). They carry **colour** contrast, which blur
  destroys as surely as it destroys sharpness.

**CORRECTION to the working note.** The bulge is **not** 55% of the budget. `spiralLike`
computes `bulge = 0.12 + 0.35 * bulgeSize * 0.8` for a barred galaxy
(`galaxyPopulationFractions.ts:48`); at the preset's `bulgeSize: 0.45` that is **0.246**, and the
`Math.min(0.55, …)` cap never binds. The bulge is **24.6%** of the budget, ~36,900 sprites.
Anything reading as a halo is the bulge or the globulars, but the bulge is a quarter of the
budget, not over half.

## The goal, stated by the user

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
- The immersion-fade encoding of [the immersion measure](sampling-and-noise.md#immersion-measure-local-mean-sprite-separation) survives; `N` changes meaning.
