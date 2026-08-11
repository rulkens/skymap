# HII regions (2026-08-02)

The slot was reserved, not invented: `dustBubblePlacements.ts` gated on
`BUBBLE_AGE_GATE = 0.35` with the note that events at or below it "are future
HII knots (#20)". Every young event in the catalog was generated and then
discarded. This section records what filling it settled.

**LITERATURE, verified 2026-08-02.** Kennicutt, Edgar & Hodge 1989 (ApJ 337,
761): the HII-region luminosity function is `dN/dL ~ L^-2 ± 0.5` above
`L_Ha ~ 1e37 erg/s`, tightening to `-2 ± 0.3` for Sb/Sc. **Two qualifications
that matter downstream**, both of which a single hard-coded slope hides:

- **Type II break.** About 20% of galaxies show a break at
  `L(Ha) = 1e38.7`, steep above (`a ~ -3.3`) and shallow below (`a ~ -1.4`).
  Named cases: M51, NGC 3521, NGC 3627, NGC 4736. A single power law is right
  for the other 80% and for the Milky Way; it is not universal.
- **Slope tracks Hubble type.** Sa steeper at `a ~ -2.6` (Caldwell et al.
  1991), irregulars shallower at `a >~ -1.8`. This is a row the
  survey-to-parameters map wants (`specs/2026-08-01-survey-to-params-map-design.md`),
  not a constant.

**CONVENTION TRAP, verified.** Two binning conventions circulate:
`dN/d ln L ~ L^a` equals `dN/dL ~ L^(a-1)`. A quoted "-2" in one is "-1" in
the other. `hiiRegionGeometry.ts`'s `LUMINOSITY_POWER = 2` is the `dN/dL`
convention and matches the primary. Check the convention before comparing any
future source against it.

**INFERRED (derivation, not measured): size follows luminosity, not age.** The
first sketch grew HII radius along `age01`, which would have been wrong.
Stromgren gives `R_s ~ Q^(1/3)` and `L_Ha ~ Q`, so radius is the cube root of
the luminosity draw — ONE draw fixes both, and a bright compact knot or a faint
giant becomes unconstructible. The age axis is left to do what it already did:
select the phase (glowing knot vs swept relic), not the size.

**INFERRED (settled decision): the flux is additive, and owes no debit.** F98
masked young features out of its fit (see [the citation table](literature.md#literature--verified-citations)), so this light was never inside the
disc mixture. Unlike the arm tiers — which redistribute `armExcessFlux` and
debit the disc for it (see [arms as a flux-field term](arms.md#arms-are-a-flux-field-term-not-a-star-population)) — this tier ADDS. The consequence to carry:
brightness here is a real calibration, not a redistribution, so there is no
conservation check that can catch it being wrong.

**MEASURED, cross-file contract.** `hiiLuminosityOf` derives its uniform from
the draw already inside `SfEvent.strength` (`0.5 + rng()`) rather than opening
a second RNG stream. That is what lets the emission tier and the dust-cavity
tier size the same event identically without either re-seeding — the N3
"one placement truth" principle applied to a quantity rather than a position.

**Landmine found while building.** `hiiRegionGeometry.ts` needs `pcToUnits`,
which lived in `dustBubblePlacements.ts`, which needs the age gate from
`hiiRegionGeometry.ts` — the same import cycle `da4373c1` had already broken
once for the arm cloud. `pcToUnits` now lives at `utils/galaxy/pcToUnits.ts`.
A shared-constants module between two tiers wants its own file BEFORE the
second tier imports it, not after the cycle appears.

**Open at time of writing:** the tier is implemented but not visually
calibrated. The flux base constant and the component budget (young events are
roughly a third of the catalog's ~125, against a 3000-component cap the arm
cloud may claim 2000 of) are both eyeball calls that have not been made.

## High-frequency emission cannot share the smooth field's target

**MEASURED, user's first visual pass, 2026-08-02.** The HII shells rendered
into `fieldTex` — the analytic field's own reduced-resolution offscreen — and
read as **intense bloom fireflies**. Diagnosis: a shell sprite is small and
bright by construction, so below the field's `fieldDivisor` rate it collapses
under a texel, the whole sprite's flux lands on that one texel, and bloom
promotes the spike into a firefly.

**This is [the beaded-lane debugging chain](dust.md#the-beaded-lane-debugging-chain-2026-08-01--read-before-touching-map-resolutions)'s rule, inverted, and it generalises.** That chain caught a map
rendered FINER than its consumer (a decimation trap). This is content rendered
COARSER than its own frequency. Both are the same underlying contract: a
target's resolution must be chosen by the frequency of what goes INTO it, and
`dustDivisor` already exists for exactly this reason — its own docblock says
the dust splat "is much higher-frequency than the smooth emission field it used
to share a target with". HII emission is the second occupant of that category,
and the smooth-field target now has a third tenant it cannot serve.

**The standing rule this leaves:** the analytic field's target is for SMOOTH
field content only. Any tier whose sprites are small and bright — HII now,
globulars under [the goal, stated by the user](goal-and-history.md#the-goal-stated-by-the-user)'s named-features goal next — needs its own target and its
own divisor, not a share of the field's.

**INFERRED, second cause not yet ruled out.** Resolution alone may not close
it. The star renderer conserves flux across its pixel clamp
(`clampFluxScale = invK*invK`, see [the approach-fade finding](approach-fade.md#the-approach-fade-never-fires-at-the-galactic-centre)), and the dust tier gained an `fwidth`-based
column-conserving AA floor in [the beaded-lane debugging chain](dust.md#the-beaded-lane-debugging-chain-2026-08-01--read-before-touching-map-resolutions) for the same reason. The HII splats have
neither. If fireflies survive a high-resolution target, a width clamp with
column-conserving amplitude is the next thing to add, not more resolution.
