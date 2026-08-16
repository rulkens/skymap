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

**2 — `describeGalaxy`: invert the arrow, delete the readback. DONE (`a0b5d611`).** New `GalaxyDescription` +
`GalaxyLightDecomposition`; `describeGalaxy(params)` takes over the four RNG streams
(`packGenerationUniforms` ~:129-241) **in the same order**; the packer writes out what it is handed.
Delete `readGalaxyFieldGeometry.ts` and `GalaxyFieldGeometry`. Behaviour-neutral: byte-identical UBO,
bit-identical mixtures. Defer `luminosity` to step 4 if it fights neutrality.

**3 — Gate arms on the category. DONE.** The gate is `category === 'spiral' || category ===
'barred'` — the categories that have a spiral arm pattern, and nothing about how many stars get
spent on it. **Not** `numArms > 0 && category !== 'irregular'`: `numArms` is clamped to at least 1,
so that collapses to `category !== 'irregular'` and grows arms on every elliptical and lenticular
(measured: m104 55 → 106 field components, `ell` 0 → 207 HII regions and 0 → 64 SF events; 88 of
206 probe rows move, and it fails `describeGalaxy.test.ts`'s pinned E1/S0 draw order). **Not** the
`galaxyPopulationCountShares(…).arm > 0` share either: neutral, but the same star-count currency
one step earlier, so `armStrength 0` still deletes the field's arms. Byte-identical UBO and
bit-identical mixtures for the eight presets, 12 seeded extras and every `starCount` from 20 000 to
1 200 000; the one row that moves is the `armStrength 0` spiral, which is the point.
`scratchpad/armGate.ts`'s three rows now agree: 332 field components, 141 SF events, 556 HII
components each.

**4 — The flux anchor. DONE (`8bfdac9c`). CHANGES THE IMAGE.**
`luminosity = GALAXY_LUMINOSITY_PER_AREA · outerRadius²`. The four constants went as planned:
`emissionScale`, `GLOW_DISC_INTEGRAL`, `MEAN_STAR_LUMINOSITY`, `MEAN_FALLOFF_AND_JITTER` all
existed only to chase a parity that does not hold. `HII_FLUX_PER_STAR_AREA` became exactly neutral
at `HII_LUMINOSITY_SHARE = 0.01 / 0.1267181136 = 0.078915316`, and because both sites divide the
same anchor the HII-to-disc ratio holds at every budget rather than only at the anchor point.

Two numbers above were authored against a stale tree and are recorded here because the difference
is instructive:

- **The anchor is the Milky Way @ 75 000, not 150 000.** #541 halved the preset (`a402c303`), so the
  tier ladder is 37.5k / 75k / 150k and 150 000 is the LARGE tier. Anchoring on the literal figure
  would have made the default Milky Way 26% brighter. Per-preset flux therefore moves by
  `cbrt(75000/N)`: **mw ×1.000**, ell ×0.531, lmc ×0.550, the five 600k presets ×0.500.
- **Σ₀ = 7.4268687, not 9.3573, and there is no fold.** The plan's pre-fold figure assumed
  `deriveFrameView.ts:103`'s `0.11 × 0.7² = 0.0539` would be folded in. That product had already
  become `0.0385 × 1.85² = 0.131766` at the same merge, silently brightening the field ×2.4446 —
  which is what the overexposed core turned out to be. The lane is deleted in `19eb238e` and
  replaced by `FIELD_EXPOSURE_GAUGE = 0.0539`, so `analyticExposure` alone sets the field's
  exposure. Step 5 then re-pinned Σ₀ to **8.5835812**.

**5 — The luminosity decomposition. DONE. CHANGES THE IMAGE, substantially.** `hubbleStageOf(type)`
→ RC3 T-type; `galaxyLightDecomposition(category, params)` as a stage-keyed table;
`galaxyPopulationCountShares` **inverted** to derive counts from light
(`share / SPRITE_POPULATION_BRIGHTNESS[pop]`, renormalised). `bulgeSize` keeps driving bulge
**size**, stops driving bulge **light**. `armStrength` stops touching the light budget.
As shipped:

- **A galaxy emits exactly `luminosity`.** The four lanes sum to 1 and v2 applies no per-population
  multiplier, so `GALAXY_LUMINOSITY_PER_AREA` was re-pinned 7.4268687 → **8.5835812**
  (× 1.155747, the MW's old `Σ(count share × SPRITE_POPULATION_BRIGHTNESS)`) and
  `HII_LUMINOSITY_SHARE` 0.078915316 → **0.068280788** (÷ the same). MW total flux and MW HII flux
  are unchanged; every other preset moves by `1.155747 / Σ_preset` — ell ×1.42 is the extreme.
- **A category is only lit for geometry it builds.** The bar lane is gated on
  `barLengthOf(...) > 0` — so `barred` takes the CONDITIONAL (bar-fitted) Bar/T and every other
  category takes zero, never the population average. The unsourced Irr Bar/T is deleted, not
  shipped, because no irregular can spend it. The elliptical's disc remainder folds into its bulge.
- **`StarBudget` gained `barCount`**; `BAR_SHARE_OF_DISK` is gone. Bar and disc have their own
  light and their own per-star brightness, so a fixed 0.35 of the disk was a third unrelated number.
- **Spirals now have a halo** (2% flat) — a population they previously had none of, in both tiers.

**6 — Move the budget words into `v1/`. DONE (`3352ce21`, `84a5c65c`).** `splitStarBudget`,
`carveStarLayout`, `totalStarBudget`, `grainScale` — plus `carveDustLayout` and
`packGenerationUniforms`, which import them, so leaving those behind would have created the
`shared/` → `v1/` edge this plan exists to remove. `packGenerationUniforms` derives `starSize` from
the `StarBudget` it is already handed, so `GalaxyDescription` carries no sprite quantity at all and
`shared/` has no PATH to a budget — the guard is structural, not a promise, and its "still here,
for one reason" landmine is deleted rather than amended. UBO byte-identical: the `starSize` lane
matches the old expression on 8 presets × 8 star counts, mutation-verified.

`84a5c65c` finishes the seam by moving `galaxyPopulationCountShares` and
`spritePopulationBrightness` too — both produce a count currency, and after step 5 nothing in `v2/`
reads either. **`shared/` stops at the light.** The round-trip test moves with them, since what it
asserts is that v1's division inverts. The `generate.wesl` parity test stays: it covers four
hand-mirrors, two owned by each folder, and it is one seam so it stays one file.

## Literature (step 5)

**The spread between studies at fixed Hubble type exceeds the trend along the sequence** (B/T at
T=0 spans 0.27–0.49; at T=5, 0.05–0.19). The dominant cause is whether a bar was fitted: doing so
**halves** B/T (Salo+2015 S⁴G: _"ignoring the bar increases the estimated B/T ratios by a factor of
2-3"_).

Near-IR, bars fitted — the low end of the published range. Disc = remainder.

| Type | B/T                                            | source                                | N      | Bar/T                                | Halo/T |
| ---- | ---------------------------------------------- | ------------------------------------- | ------ | ------------------------------------ | ------ |
| S0   | 0.33 ± 0.14 (med 0.33)                         | Laurikainen+2010 T=−2, Ks             | 35     | 0.13 ± 0.07 (med 0.12), N=16         | 0.02   |
| Sa   | 0.25 ± 0.12 (med 0.26)                         | Laurikainen T=1, Ks                   | 26     | 0.17 ± 0.10 (med 0.14), N=47         | 0.02   |
| Sb   | 0.14 ± 0.09 (med 0.12)                         | Laurikainen T=3, H                    | 20     | 0.10 ± 0.08 (med 0.07), N=38         | 0.02   |
| Sbc  | 0.11 ± 0.08 (med 0.09)                         | Laurikainen T=4, H (best-constrained) | 38     | 0.04 ± 0.04 (med 0.03), N=14 — weak  | 0.02   |
| Sc   | 0.11 ± 0.13 (med 0.06)                         | Laurikainen T=5, H                    | 30     | 0.06 ± 0.07 (med 0.04), N=40         | 0.02   |
| Sd   | 0.05 / 0.09                                    | Laurikainen T=6 / T=7, H — weak       | 13 / 6 | 0.05 ± 0.04 / 0.07 ± 0.06, N=45 / 96 | 0.03   |
| Irr  | 0.00                                           | **ASSUMPTION — no source**            | —      | 0.05 **assumption**                  | 0.03   |
| MW   | **0.19 as bar/pseudobulge, classical bulge 0** | Kormendy+2010 Table 2, near-IR        | —      | folded in                            | 0.01   |

Sources: Graham & Worley 2008 (MNRAS 388, 1708; K-band, dust+inclination corrected),
Laurikainen et al. 2010 (MNRAS 405, 1089; multi-component with bars), Salo et al. 2015
(ApJS 219, 4; S⁴G Pipeline 4, 3.6 μm), Weinzirl et al. 2009 (ApJ 696, 411), Gadotti 2009
(MNRAS 393, 1531), Kormendy, Drory, Bender & Cornell 2010 (ApJ 723, 54), Peters et al. 2017
(MNRAS 470, 427), Freeman 1970 (ApJ 160, 811) as modified by de Jong 1995.

**Caveats the code comment must carry:** these are near-IR fractions (roughly half in B for Sb and
later); B/T and Bar/T come from different samples and bands and are renormalised to 1 by us;
Bar/T is for a _barred_ galaxy; and per-galaxy scatter exceeds the trend.

**B/T column VERIFIED 2026-08-04** against the primary source — arXiv:1002.4370, Table 2 (p. 31),
read from the PDF, not second-hand. Every value matches. Three things the verification added:

- **The table is TWO samples in TWO bands, and the seam is T=1|2** — NIRS0S (Ks) supplies T=−3…1,
  OSUBSGS (H) supplies T=2…9. So the Ks/H change falls exactly between Sa and Sab, inside the range
  we interpolate across. Values are corrected for Galactic _and_ internal extinction.
- **`N` is now in the table** and kills the Sd row: T=6 rests on 13 galaxies, T=7 on 6, and the
  paper's own T=8/T=9 bins have N=2 and N=3. Treat Sd as "small, poorly measured", not as 0.05.
- **The bar-fitting effect is confirmed from this paper directly** (§1): mean B/T went 0.55 → 0.30
  when bars were fitted, → 0.25 including nuclear bars. Also worth knowing, because it cuts against
  the obvious inference: within this sample **barred and non-barred S0s have the same B/T**
  (0.29±0.02 vs 0.33±0.03). Fitting a bar changes the _measurement_, not the _galaxy_.

**Bar/T column: Salo et al. 2015, Table 7 (S⁴G Pipeline 4).** Laurikainen+2010 reports no
bar-to-total flux ratio at all — the string "Bar/T" does not occur in it, nor in the Oulu group's
other decomposition papers (2005, 2007, 2013). S⁴G Table 7 publishes a per-component _fraction of
the total model flux_, so Bar/T is read off, not derived; 3.6 μm, human-supervised
bulge/disc/bar/nucleus fits, 2352 galaxies. The binning by stage is ours, joining Buta et al. 2015
⟨T⟩ (ApJS 217, 32). Three things that column carries:

- **The values are conditional on a bar having been fitted**, matching the caveat above. The
  fraction of the bin that was, per row: S0 0.43, Sa 0.59, Sb 0.44, Sbc 0.16, Sc 0.31, Sd 0.51/0.47.
  Multiply through by that to get a population average instead.
- **The Sbc row is the weak one now.** T=4 is where S⁴G fitted a bar in 16% of the bin while Buta
  classified 33% as SAB or SB, and 0.04 sits below both its neighbours. Gao et al. 2019
  (ApJS 244, 34; R band, CGS, N=320) binned the same way gives a smooth
  0.13/0.11/0.10/0.09/0.06/0.05 across these six rows and is the alternative if the Sbc dip shows
  on screen.
- **Weinzirl et al. 2009 Table 2 is the high outlier**, at 0.25/0.18/0.17/0.12/0.09 for T=1/3/4/5/6
  — 1.7× throughout, on the same OSUBSGS H-band images the Laurikainen T≥2 rows come from. He fits
  three components and no lens, so his bar absorbs oval and lens light that S⁴G and Gao assign
  elsewhere. Gadotti 2009 §4.7 (pooled median 0.095 in i) sides with S⁴G.

**No halo light fraction by Hubble type exists.** The one paper listing η alongside morphology
(Peters 2017) finds no correlation. Use a flat 2%, sourced and flagged. Do **not** convert the
better-measured _mass_ fractions: Peters puts halo M/L at ~3× the disc's while Harmsen corrects
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
  by Hubble type exists" entry under _What we could not support_.

**Manual smoke pass (PASSED — visual confirmation by the user, 2026-08-16):**
MW before/after step 4 indistinguishable; app tier small→medium→large shows no brightness step;
`armStrength: 0` still renders arms, SF events and HII; gallery walk after step 5 with M31, the MW
and the LMC looked at hardest; `analyticExposure` still spans a useful range with 1.0 calibrated.

**Out of scope:** per-galaxy B/T scatter, any `GalaxyParams` B/T override, recalibrating the seven
non-MW presets after step 4's uniform dimming, deleting v1 (this makes it possible, it does not do
it), and the band question (near-IR table vs an optical render).
