# Arms

## Arms are a flux-field term, not a star population

**INFERRED (settled decision, not measured).** Per-ray analytic arms are out: a log-spiral arm is
~60–100 kpc of arc, so ~240–400 Gaussians for four arms, needing GPU spatial acceleration — and
the thin-disc shortcut (intersect plane × thickness) fails for the in-plane view from Earth,
which is the primary case.

The primitive was never the question. 3DGS does not ray-evaluate either; it **rasterises** each
Gaussian as a screen quad, which is what `milkyWayAggregateLayer` already does. **The question is
how sprite positions are chosen** — currently Poisson-drawn, which is maximum variance for a
given mean (see [shot noise](sampling-and-noise.md#shot-noise--the-correction-that-matters-most)). Decision: place arm sprites by a **deterministic fitted mixture along the arm
ridge**. Same renderer, same fill, zero shot noise on the smooth part; clumping becomes an
additive choice (HII knots, OB associations) rather than a defect to fight.

**Budget consequence, INFERRED:** with the base carrying bulge + bar + smooth disc, the same 150k
sprites cover only the arms — roughly 15% of the previous footprint, i.e. 10–20x the surface
density at zero extra fill. It also ends the `starPxMin` vs `starPxMax` fight of [the design error](goal-and-history.md#the-design-error-the-split-copied-the-target-without-the-partition): each clamp
finally serves one population.

**Correctness trap to design against.** F98's disc is the **old smooth population** (young
features masked from the fit); NIR arms are a modest overdensity on top. Arm sprites must carry
the **overdensity above the axisymmetric mean**, not the arm's total light, or they double-count.
It presents as "the base is too dim" and gets fixed with the wrong knob.

## The arm ridge is a measured object (2026-08-01)

The arms went from inherited sprite-budget quantities to measured ones. Three results worth
keeping beyond the git log:

**Width.** Reid 2019's law re-expresses dimensionlessly as **σ(R) = 0.017·h + 0.036·R** (h = disc
scale length; 2.605 kpc for the MW reproduces 336 pc at R₀ exactly). A positive intercept — arms
do not taper to zero at the centre — and a scale-free slope (~2° wedge), so the same law serves
any galaxy the survey map draws. The measured law is the _young_ arm; `arms.widthScale` (default 1)
carries old-population broadening as an explicit, honest modelling choice, not a fudge.

**Flux.** Arm light now derives from contrast, not from a share of the sprite budget:
λ(R) = (K−1)·Σ*disc(R)·√(2π)·σ(R) along the ridge, with the disc debited by exactly the added
excess (both sides of the [arms-are-a-flux-field-term](arms.md#arms-are-a-flux-field-term-not-a-star-population) double-counting ledger analytic). At K = 1.3 with two young arms
the excess is **3.3% of disc flux** — verified independently of the code's own bookkeeping.
Thin arms at real contrast are a small \_disc-integrated* term even when locally prominent; if
that reads as "too subtle," the honest dials are K (→ 2.2 grand-design) and age, not a boost.

**The double-count the user's eye found.** Sprite-parity calibration landed at flux ×0.5 against
the code's mirrored `ARM_BRIGHTNESS = 1.9` — and 1.9 × 0.5 = 0.95. The mirror factor was already
inside the un-folded `armFraction`; the eyeball measurement exposed a 2× double-count that the
derivation had hidden. Deleted with the parameterization it indicted.

**Per-arm age reconciles two-vs-four.** The MW's old-star (K-band) light is two-armed while young
tracers ride four arms (see [the citation table](literature.md#literature--verified-citations): D&S primary-verified). One per-arm scalar in armTable lane 7
(padding until now) resolves it: four geometric arms, ages [1.0, 0.2, 1.0, 0.2], contrast weighted
by age → two-armed old-star light on four-armed geometry, with SFRs/dust later riding the young
pair. No preset hack; the structure falls out of the parameter.
