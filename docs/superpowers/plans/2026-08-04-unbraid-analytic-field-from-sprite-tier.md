# Un-braid the analytic field from the sprite tier

The analytic field (v2) reads v1's renderer artifacts as if they were physical facts about a
galaxy, in four places. They are one boundary drawn wrongly, so they are fixed together.

Branch `milky-way-analytic-field`, one PR. Steps land as distinct commits.

## The four premises — all verified in code and measured

1. **Geometry is a byte-level readback of a compute shader's input.**
   `shared/readGalaxyFieldGeometry.ts:58-119` builds the whole `GalaxyFieldGeometry` by indexing
   `GENERATION_UBO` lanes out of the buffer `packGenerationUniforms` produced; `:92`/`:95` recover
   bulge/bar tilts as `atan2(sin, cos)` of RNG draws. Delete v1 and v2 has no geometry source.

2. **The light split is star counts × hand-mirrored constants.**
   `generate.wesl` applies a per-star multiplier at **six** sites — `:513` ×0.85 bulge, `:556` ×0.9
   bar, `:603` ×1.35 disk, `:837` ×1.9 arm, `:934` implicit ×1.0 irregular clump, `:972` ×0.5 halo.
   `v2/galaxyFieldMixture.ts:146-149` mirrors only **four**; `readGalaxyFieldGeometry.ts:99` folds
   `disk + arm` into one `discFraction` rendered at ×1.35.
   **Consequence: the docblock claim that exposure 1.0 = sprite parity is false.** Measured v2/v1
   total flux: m100 0.879, ngc6946 0.876, m58 0.881, m104 **0.999**, m31 0.913, ell **1.000**,
   lmc **1.315**, mw **0.874** — exactly 1.000 only for the two categories with no arms.

3. **Absolute brightness ∝ cbrt(starCount).** Exact closed form, verified to 1 part in 10⁸ on all
   eight presets:
   ```
   emissionScale = C · outerRadius² · modelledStars^(1/3),  C = 0.17611053
   ```
   MW amplitude sum 1881.75 / 2370.86 / 2987.09 at starCount 75k / 150k / 300k — and
   `v1/milkyWayCalibration.ts:55-59` sets the tiers at exactly ×0.5 / ×1 / ×2. **Switching LOD tier
   changes how bright the analytic Milky Way is, by ±26% per step.** The `R²` is physics (Freeman
   1970); the `N^(1/3)` is the artifact.

4. **A sprite count gates the field's arms.** `packGenerationUniforms.ts:189`
   `drawArms = budget.armStarCount > 0 && category !== 'irregular'` leaves `armTable` zeroed while
   `:358` writes `numArms` unconditionally. Measured on the MW: at `armStrength 0`, numArms 4 with
   four all-zero records, field components **332 → 55**, SF events **141 → 0**, HII components
   **556 → 0**. Also `armStrength` 0.5 and 1.0 give byte-identical arm records — it is a **step
   function** on the field — and it shifts the light budget (disc 0.5957 → 0.4901, bar 0.1583 →
   0.2639, i.e. turning arms off makes the bar 67% brighter). One knob, four unrelated jobs.

Also measured: **the arm ridge chain carries zero net flux** — `galaxyFieldMixture.ts:868-881`
debits the disc by exactly what the arms add (neutral to ~3e-15 relative). Arms redistribute disc
light; they never add any. This is the leading explanation for "cranking armContrast and
armExcessScaleRatio barely brightens the arms".

## Target seam

```
GalaxyParams
   │  describeGalaxy(params)          ← owns the RNG streams
   ▼
GalaxyDescription { category, geometry, light, luminosity, … }
   ├──► v1: splitStarBudget → carve → packGenerationUniforms → compute
   └──► v2: buildGalaxyFieldMixture(description, tuning) → components
```

Today the arrow runs `params → budget → UBO bytes → geometry → mixture`. Each step below reverses
one segment.

## Steps

**1 — Instrument first. DONE (`dc427c52`, `01450e18`).** `shared/spritePopulationBrightness.ts`
(six entries), a WESL scraper parity test, and `tests/…/v2/galaxyFieldFluxLedger.test.ts` — the
first tests the analytic field has ever had. Both mutation-verified.

**2 — `describeGalaxy`: invert the arrow, delete the readback.** New `GalaxyDescription` +
`GalaxyLightDecomposition`; `describeGalaxy(params)` takes over the four RNG streams
(`packGenerationUniforms` ~:129-241) **in the same order**; the packer writes out what it is handed.
Delete `readGalaxyFieldGeometry.ts` and `GalaxyFieldGeometry`. Behaviour-neutral: byte-identical UBO,
bit-identical mixtures. Defer `luminosity` to step 4 if it fights neutrality.

**3 — Gate arms on geometry.** `drawArms` becomes `numArms > 0 && category !== 'irregular'`.
Neutral for all eight shipped presets. Verify by re-running `scratchpad/armGate.ts`: the
`armStrength 0` row must match the others.

**4 — The flux anchor. CHANGES THE IMAGE.**
`luminosity = GALAXY_LUMINOSITY_PER_AREA · outerRadius²`, anchored on the **Milky Way @ 150 000**
(user's choice): Σ₀ = 9.3573 pre-fold, **0.504358** after folding in the `0.11 × 0.7² = 0.0539`
that `deriveFrameView.ts:103` currently supplies. Per-preset flux then changes by exactly
`cbrt(150000/N)`: **mw ×1.000**, ell ×0.669, lmc ×0.693, the five 600k presets ×0.630.
Delete `emissionScale`, `GLOW_DISC_INTEGRAL`, `MEAN_STAR_LUMINOSITY`, `MEAN_FALLOFF_AND_JITTER`
(`galaxyFieldMixture.ts:122-134`) — all four exist only to chase a parity that does not hold.
`HII_FLUX_PER_STAR_AREA` becomes **exactly neutral**:
`HII_LUMINOSITY_SHARE = 0.01 / 0.126724 = 0.078911` against a measured `hiiFlux/emissionScale` of
0.078915.

**5 — The luminosity decomposition. CHANGES THE IMAGE, substantially.** `hubbleStageOf(type)` →
RC3 T-type; `galaxyLightDecomposition(params, category)` as a stage-keyed table;
`galaxyPopulationCountShares` **inverted** to derive counts from light
(`share / SPRITE_POPULATION_BRIGHTNESS[pop]`, renormalised). `bulgeSize` keeps driving bulge
**size**, stops driving bulge **light**. `armStrength` stops touching the light budget.

**6 — Move the budget words into `v1/`.** `splitStarBudget`, `carveStarLayout`, `totalStarBudget`,
`grainScale`. Only possible once steps 2 and 3 remove the three blockers `shared/README.md` names.

## Literature (step 5)

**The spread between studies at fixed Hubble type exceeds the trend along the sequence** (B/T at
T=0 spans 0.27–0.49; at T=5, 0.05–0.19). The dominant cause is whether a bar was fitted: doing so
**halves** B/T (Salo+2015 S⁴G: *"ignoring the bar increases the estimated B/T ratios by a factor of
2-3"*).

Near-IR, bars fitted — the low end of the published range. Disc = remainder.

| Type | B/T | source | Bar/T | Halo/T |
| --- | --- | --- | --- | --- |
| S0 | 0.33 | Laurikainen+2010 T=−2, Ks | 0.10 | 0.02 |
| Sa | 0.25 | Laurikainen T=1 | 0.15 | 0.02 |
| Sb | 0.14 | Laurikainen T=3, H | 0.15 | 0.02 |
| Sbc | 0.11 | Laurikainen T=4 (best-constrained) | 0.15 | 0.02 |
| Sc | 0.11 (median 0.06) | Laurikainen T=5 | 0.12 | 0.02 |
| Sd | 0.05–0.09 | Laurikainen T=6/7, weak | 0.09 | 0.03 |
| Irr | 0.00 | **ASSUMPTION — no source** | 0.05 **assumption** | 0.03 |
| MW | **0.19 as bar/pseudobulge, classical bulge 0** | Kormendy+2010 Table 2, near-IR | folded in | 0.01 |

Sources: Graham & Worley 2008 (MNRAS 388, 1708; K-band, dust+inclination corrected),
Laurikainen et al. 2010 (MNRAS 405, 1089; multi-component with bars), Weinzirl et al. 2009,
Gadotti 2009, Kormendy, Drory, Bender & Cornell 2010 (ApJ 723, 54), Peters et al. 2017
(MNRAS 470, 427), Freeman 1970 (ApJ 160, 811) as modified by de Jong 1995.

**Caveats the code comment must carry:** these are near-IR fractions (roughly half in B for Sb and
later); B/T and Bar/T come from different samples and bands and are renormalised to 1 by us;
Bar/T is for a *barred* galaxy; and per-galaxy scatter exceeds the trend.

**Unverified:** Laurikainen Table 2 did not render in the fetched page — the per-T column is a
second-hand read. **Open it by hand before pinning it into code.**

**No halo light fraction by Hubble type exists.** The one paper listing η alongside morphology
(Peters 2017) finds no correlation. Use a flat 2%, sourced and flagged. Do **not** convert the
better-measured *mass* fractions: Peters puts halo M/L at ~3× the disc's while Harmsen corrects
light→mass the other way by 0.2 dex — they point opposite ways and must not be averaged.

## Do not

- **Do not have v2 re-derive geometry while v1 still packs the UBO.** Two derivations of one RNG
  stream desync silently the moment a draw moves. Invert the arrow instead.
- **Do not add `ARM_BRIGHTNESS = 1.9` to close the four-vs-six gap.** The arm chain carries zero net
  flux; a fifth lane double-counts. Delete the parity claim instead (step 4).
- **Do not anchor the new normalisation by matching v1's total flux.** Parity is a docblock claim,
  not a property of the code — see premise 2's table.
- **Do not invent a per-Hubble-type halo fraction**, and do not use Simien & de Vaucouleurs 1986's
  `Δm₁(T)` polynomial (r¹ᐟ⁴-inflated, bar-contaminated, dust-uncorrected; 1.5–2× high) or
  Simard+2011 (1.1M galaxies but bar-free and carries no morphology).
- **Do not add a `bulgeToTotal` override to `GalaxyParams`.** The survey-to-params spec
  (`docs/superpowers/specs/2026-08-01-survey-to-params-map-design.md`) wants to write a T-type and
  shares this table and `hubbleStageOf`; two independent B/T sources would re-braid what step 5
  un-braids. That spec's own numbers cross-check this table.
- **Do not gate steps 4–5 on `npm test` + `npm run typecheck`.** No test reaches
  `createGalaxyEngine.ts`; `npm run build` does not compile the tool; the GPU probe judges no
  pixels. The gates are the flux ledger, the arithmetic ratios, and a human.

## Definition of Done

- `GalaxyDescription` + `GalaxyLightDecomposition` exist; `GalaxyFieldGeometry` and
  `readGalaxyFieldGeometry` are gone.
- `splitStarBudget`, `carveStarLayout`, `totalStarBudget`, `grainScale` live under `v1/`.
- `generate.wesl`'s six multipliers are parity-tested against a TS table.
- The three READMEs describe the new flow; the "read back, not re-derived" landmine is **deleted**,
  not amended.
- `docs/research/milky-way/literature.md` carries the sources above plus a "no halo light fraction
  by Hubble type exists" entry under *What we could not support*.

**Manual smoke pass (owed — nothing here has been seen on a GPU beyond the validation probe):**
MW before/after step 4 indistinguishable; app tier small→medium→large shows no brightness step;
`armStrength: 0` still renders arms, SF events and HII; gallery walk after step 5 with M31, the MW
and the LMC looked at hardest; `analyticExposure` still spans a useful range with 1.0 calibrated.

**Out of scope:** per-galaxy B/T scatter, any `GalaxyParams` B/T override, recalibrating the seven
non-MW presets after step 4's uniform dimming, deleting v1 (this makes it possible, it does not do
it), and the band question (near-IR table vs an optical render).
