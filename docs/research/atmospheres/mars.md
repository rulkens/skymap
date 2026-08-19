# Mars — atmosphere constituents

Stage-2 research for [`docs/superpowers/specs/2026-08-18-atmosphere-constituents-design.md`](../../superpowers/specs/2026-08-18-atmosphere-constituents-design.md).

Conventions used throughout:

- RGB reference wavelengths **680 / 550 / 440 nm**, matching the Pluto row.
- Coefficients in **1/km at altitude 0**, where altitude 0 is the drawn surface radius **3389.5 km**.
- Shell top **surface + 60 km** (unchanged).
- Coefficients are set so that the modelled column reproduces the measured column:
  β₀ = τ / (H·(1 − e^(−60/H))). The truncation factor is 0.996 for H = 10.8 km and
  0.990 for H = 13 km, so it matters at the 1 % level only.
- Tags: **[M]** published value quoted with its source · **[D]** computed here, arithmetic shown ·
  **[L]** a choice no measurement pins.

## Sources actually opened

Every number below traces to one of these. Nothing is cited that was not read.

| Source                                                                                                                                                                                       | What it gave                                                                                                                                                                                                                                           |
| -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| He, Q., et al. (2021), _Atmos. Chem. Phys._ **21**, 14927–14940, [doi:10.5194/acp-21-14927-2021](https://doi.org/10.5194/acp-21-14927-2021) — full PDF                                       | CO₂ King correction factor F_K(ν) = 1.1364 + 2.53×10⁻¹¹ ν² (Table 1); CO₂ Bideau-Mehu dispersion in wavenumber form; **measured** CO₂ Rayleigh cross sections at 330/404/532/660/710 nm (Table 2)                                                      |
| [refractiveindex.info, CO₂, Bideau-Mehu et al. 1973](https://refractiveindex.info/?shelf=main&book=CO2&page=Bideau-Mehu)                                                                     | CO₂ dispersion formula in wavelength form, 0.181–1.69 µm, 273.15 K / 101325 Pa                                                                                                                                                                         |
| Franz, H. B., et al. (2015), _Planet. Space Sci._ **109–110**, 154–158, [author PDF](https://websites.umich.edu/~atreya/Articles/2015PSS%20Franz_etal_Mars_VMR_update.pdf)                   | SAM/Curiosity volume mixing ratios: CO₂ 0.957(±0.016), N₂ 0.0203, Ar 0.0207, O₂ 1.73×10⁻³, CO 7.49×10⁻⁴ (Table 3)                                                                                                                                      |
| Lemmon, M. T., et al. (2015), _Icarus_ **251**, 96–111, [NTRS PDF 20150008268](https://ntrs.nasa.gov/api/citations/20150008268/downloads/20150008268.pdf)                                    | MER 5-Mars-year τ(880 nm) record; aerosol scale heights 11.5–12.2 km (Spirit) and 19.1–19.3 km (Opportunity); τ440/τ880 ≈ 0.97 measured, 0.89–0.93 modelled; ice-cloud seasonality at Meridiani                                                        |
| Lemmon, M. T., et al. (2024), _Icarus_ **408**, [arXiv:2309.07378](https://arxiv.org/abs/2309.07378)                                                                                         | MSL Ångström exponent −0.09 ± 0.01 (440 vs 880 nm); "Rayleigh optical depths in Mars's atmosphere are small (almost 0.01 at 440 nm and <0.001 at 880 nm)"; aerosol scale height 13.9 ± 1.3 km, dataset reprocessed at 13 km; Gale mean pressure 775 Pa |
| Chen-Chen, H., Pérez-Hoyos, S., Sánchez-Lavega, A. (2019), _Icarus_ **330**, 16–29, [arXiv:1905.01074](https://arxiv.org/abs/1905.01074)                                                     | Double-Henyey-Greenstein dust phase function g₁ = 0.889 ± 0.098, g₂ = 0.094 ± 0.250, α = 0.743 ± 0.106 → g = 0.687 ± 0.081 at λ_eff ≈ 650 nm; ω₀ = 0.975 at 650 nm quoted from Wolff et al. (2009)                                                     |
| Chen-Chen, H., et al. (2019), _Icarus_ **319**, 43–57, [arXiv:1905.01073](https://arxiv.org/abs/1905.01073)                                                                                  | MSL Navcam τ₀ record referenced to 880 nm: minimum τ ≈ 0.4 at L_S = 135°, ≈ 0.75 at L_S = 40°, > 1.25 in the perihelion dust season; r_eff 0.8–1.5 µm                                                                                                  |
| LMD Mars GCM data file [`aerdust.h.wolff09`](http://www.lmd.jussieu.fr/~forget/datagcm/datafile/aerdust.h.wolff09) — header: "Wolff et al. 2009 – Gamma dist – reff=1.5um, nueff=0.3, D/L=1" | Tabulated dust Q_ext(λ), ω₀(λ), g(λ) on a 52-point grid from 263 nm; the only per-channel dust optical-property table I could open                                                                                                                     |

---

## 1. Molecular Rayleigh — CO₂-dominated gas

### Scale height

Mean molecular mass from the SAM mixing ratios **[D]**:

```
μ = (0.957·44.0095 + 0.0203·28.0134 + 0.0207·39.948
     + 0.00173·31.998 + 0.000749·28.010) / 0.99988
  = 43.568 g/mol
```

```
H = R T / (μ g),  g = 3.72076 m/s²
  T = 210 K → H = 8.31446·210 / (0.043568·3.72076) = 1746.0 / 0.16212 = 10 771 m
  T = 216 K → H = 11 079 m
```

**H_gas = 10.8 km [D]** at 210 K. The table's current 11.1 km is not wrong — it is the same
formula at T = 216 K, and the near-surface mean temperature is not pinned to better than a few
kelvin. Either value is defensible; the visible difference is nil because this constituent carries
under 2 % of the extinction (below). Recommend **10.8 km** simply because it is the value that
falls out of the composition we can cite.

### Scattering coefficient

β_R(λ) = N·σ(λ), with the standard Rayleigh cross section

```
σ(λ) = 24π³ / (N_s² λ⁴) · ((n²−1)/(n²+2))² · F_K(λ)
```

n from Bideau-Mehu et al. (1973) at N_s = 2.6867811×10²⁵ m⁻³ (273.15 K, 101325 Pa),
F_K from He et al. (2021) Table 1.

| λ      | n−1 (STP) **[D]** | F_K **[M]** | σ_CO₂ (m²) **[D]** | σ_mix (m²) **[D]** |
| ------ | ----------------- | ----------- | ------------------ | ------------------ |
| 680 nm | 4.46613×10⁻⁴      | 1.1419      | 4.8797×10⁻³¹       | 4.7436×10⁻³¹       |
| 550 nm | 4.50188×10⁻⁴      | 1.1448      | 1.1615×10⁻³⁰       | 1.1289×10⁻³⁰       |
| 440 nm | 4.55883×10⁻⁴      | 1.1495      | 2.9197×10⁻³⁰       | 2.8376×10⁻³⁰       |

σ_mix is the mole-fraction-weighted mixture (per molecule, N₂ scatters 0.40× and Ar 0.31× as much
as CO₂), a uniform **−2.8 %** against pure CO₂. The N₂ and Ar dispersion formulae are standard ones
I did not independently verify; at 4.3 % combined abundance they move the result by < 0.1 %.

Surface number density **[D]**: N = P/(kT) = 610 / (1.380649×10⁻²³ · 210) = 2.1039×10²³ m⁻³,
using the conventional 610 Pa global-mean surface pressure.

```
β_R(680) = 4.7436e-31 · 2.1039e23 · 1000 = 9.98e-5  /km
β_R(550) = 1.1289e-30 · 2.1039e23 · 1000 = 2.375e-4 /km
β_R(440) = 2.8376e-30 · 2.1039e23 · 1000 = 5.970e-4 /km
```

**scatter = [1.00e-4, 2.38e-4, 5.97e-4] 1/km [D]**, absorb = [0, 0, 0].

Blue/red ratio 5.98 — steeper than λ⁻⁴'s 5.70, the extra coming from dispersion in n and F_K.

### Cross-checks

1. Against **measured** cross sections (He et al. 2021, Table 2). Their 532 nm value scaled to
   550 nm by λ⁻⁴: 13.32×10⁻²⁷ · (532/550)⁴ = 11.66×10⁻²⁷ cm². Mine: 11.615×10⁻²⁷ cm². **0.4 %.**
   At 660→680 nm: 5.516 · (660/680)⁴ = 4.893 vs mine 4.880×10⁻²⁷ cm². **0.3 %.**
2. Against the two independent statements of the dispersion formula (wavelength form from
   refractiveindex.info at 273.15 K, wavenumber form from He et al. at 288.15 K): 4.5019×10⁻⁴ vs
   4.5059×10⁻⁴ after density scaling. **0.09 %.**

### Vertical optical depth — how weak this term is

Column density **[D]**: N_col = P/(m̄ g) = 610 / (43.568e-3/6.02214e23 · 3.72076) = 2.2661×10²⁷ m⁻².

```
τ_R(680) = 0.0011
τ_R(550) = 0.0026
τ_R(440) = 0.0064
τ_R(880) = 0.00038
```

Lemmon et al. (2024) state the Rayleigh optical depth is "almost 0.01 at 440 nm and <0.001 at
880 nm" **[M]**. My 880 nm value clears their bound. My 440 nm value is 0.0064, not 0.009 — the gap
is entirely the pressure: they work at Gale crater, whose mean pressure the same paper gives as
775 Pa (Haberle et al. 2014). 0.0064 · 775/610 = **0.0082**, which is "almost 0.01". The two agree;
they are quoted at different surface pressures. Our reference level is the global datum, so 610 Pa
is the right choice for a whole-disc render.

Against the dust column of §2, molecular scattering is **0.28 % / 0.68 % / 1.7 %** of total
extinction at 680/550/440 nm. It is not what makes Mars's sky look like anything.

**Keep the constituent anyway**: it costs one slot, it is the physically correct term, and it is the
only thing left if a viewer ever dials dust down toward a "clear Mars".

**Confidence / what would falsify this.** High. Two independent dispersion formulations and a
direct laboratory cross-section measurement agree to better than 1.5 %. Falsified by: a different
reference surface pressure (τ scales linearly with P — a Hellas-basin or Olympus-Mons reference
would move it by ±60 %), or by a mean-temperature choice outside 200–220 K moving H by ±3 %.

---

## 2. Suspended dust

This is the whole look. It carries 98 %+ of the extinction and both colour effects.

### 2a. The τ I picked, and why

Dust loading is seasonal by a factor of three in a quiet year and by an order of magnitude in a
global storm. Three surface records, all referenced to 880 nm:

- **MER/Spirit** (Lemmon et al. 2015): "optical depths declined from near 0.90 to below 0.3 by sol
  155 (L_S = 45°), and remained similarly low until about sol 350 (L_S = 135°)" **[M]**.
- **MER/Opportunity**, same period: "declined from 0.95 to below 0.5" **[M]**.
- **MSL/Gale** (Chen-Chen et al. 2019, Navcam): τ falls from ≈ 0.75 at L_S ≈ 40° to a minimum
  **τ ≈ 0.4** at L_S = 135°, rising past 1.25 in the perihelion dust season **[M]**.

**Chosen: τ_ext(880 nm) = 0.40 [L, anchored on M].** It is Gale's measured clear-season minimum
and it sits inside the Spirit (< 0.3) / Opportunity (< 0.5) clear-season bracket. Rationale: for a
whole-disc render the aphelion-season state is the one that reads as "Mars", not as "Mars during
a storm", and it is the season in which the global mosaics we texture with were mostly acquired.

τ is the one honest dial here. 0.3 is the defensible low end (Spirit's floor); 0.8 is a defensible
"typical annual" value; > 1.25 is storm territory. If the disc reads too flat once the shell is on
top of an already-hazy mosaic, **lower τ, do not desaturate the coefficients**.

### 2b. Spectral extinction — grey, from measurement

The Ångström exponent for 440 vs 880 nm, after removing Rayleigh, is **−0.09 ± 0.01** over most of
the Mars year (Lemmon et al. 2024, MSL, five Mars years) **[M]**. Lemmon et al. (2015) independently
measured (R8 − L8)/R8 = 0.033 ± 0.0004 (Spirit) and 0.0256 ± 0.0007 (Opportunity), "an Ångström
exponent near zero, typical of large particles" **[M]**.

So τ_ext(λ) = τ₈₈₀ · (λ/880)^0.09 **[D]**:

```
τ_ext(680) = 0.40 · (680/880)^0.09 = 0.3908
τ_ext(550) = 0.40 · (550/880)^0.09 = 0.3834
τ_ext(440) = 0.40 · (440/880)^0.09 = 0.3758
```

**This deliberately overrides the Wolff09/LMD table's Q_ext.** That table would give
τ440/τ880 = 0.804 (Ångström −0.31) and a non-monotonic red channel (Q_ext jumps 2.53 → 2.87 → 3.18
between 638 and 800 nm — a Mie resonance of the narrow r_eff = 1.5 µm, ν_eff = 0.3 gamma
distribution, not a property of real polydisperse dust). Extinction is the quantity the rovers
measure directly, for five Mars years, at both channels. Where a measurement and a Mie table
disagree on the same observable, take the measurement. **Say so at the row, because it looks like
an inconsistency otherwise.**

### 2c. Single-scattering albedo — why the sky is butterscotch

From the LMD/Wolff09 table, linearly interpolated in λ **[M, interpolated D]**:

| λ        | table neighbours | ω₀         | g          |
| -------- | ---------------- | ---------- | ---------- |
| 680 nm   | 637.6 / 700      | **0.9731** | **0.7005** |
| 550 nm   | 512.7 / 575.1    | **0.8879** | **0.6931** |
| 440 nm   | 387.9 / 450.3    | **0.7768** | **0.7657** |
| (650 nm) | 637.6 / 700      | 0.9669     | 0.6842     |

The 650 nm entry is the cross-check: Chen-Chen et al. (2019) quote "ω₀ = 0.975 … a representative
value for Martian dust (Wolff et al., 2009) at the effective wavelength of the cameras" **[M]** —
1 % from the table's 0.967. The table is a faithful redistribution of the paper at the one point I
can independently check.

ω₀ falling from 0.97 in the red to 0.78 in the blue is the butterscotch. With extinction grey, the
scattering coefficient is red-weighted by 0.9731/0.7768 = **1.25×** and the absorption coefficient
is blue-weighted by (1−0.7768)/(1−0.9731) = **8.3×**. Split of the column **[D]**:

| λ   | τ_ext  | τ_sca = ω₀·τ_ext | τ_abs = (1−ω₀)·τ_ext |
| --- | ------ | ---------------- | -------------------- |
| 680 | 0.3908 | 0.38032          | 0.01051              |
| 550 | 0.3834 | 0.34046          | 0.04297              |
| 440 | 0.3758 | 0.29193          | 0.08387              |

### 2d. Scale height — larger than the gas, and measured

Directly measured aerosol scale heights, from low-Sun airmass fits:

- **Spirit**: 11.5 ± 0.4 km (440 nm) and 12.2 ± 0.4 km (880 nm); adopted 11.9 ± 0.4 km. "The derived
  scale heights for Spirit are similar to typical gas scale heights near the surface" **[M]**.
- **Opportunity**: 19.3 ± 0.5 and 19.1 ± 0.5 km; adopted 19.2 ± 0.5 km. "surprisingly high … any
  model that fit the data would share the characteristic that dust is preferentially farther away
  from the surface than would be expected for a well-mixed atmosphere" **[M]**.
- **MSL/Gale** (Lemmon et al. 2024): sol 2255 fit **13.9 ± 1.3 km**; "the initial 10- to 11-km scale
  heights were unsuitable … the data were reprocessed with a mid-range value of 13 km, and the
  uncertainty was defined by calculations for 10- and 17-km scale heights" **[M]**.

**Chosen: H_dust = 13 km [M].** It is MSL's adopted operational value, it sits inside the 11.5–19.3
km spread of the three sites, and it is meaningfully above the 10.8 km gas scale height — which is
the physically right direction, since a dust source at the surface and a sink at the surface cannot
by itself produce Opportunity's 19 km, but high-altitude transported dust and ice haze can and does.

Note the mechanism the constituent model cannot express: at Gale the profile is _not_ exponential
for much of the year — Lemmon et al. (2024) find "the lowest part of the atmosphere was depleted in
aerosols relative to higher altitudes" outside southern mid-autumn. A single exponential is a
2-parameter stand-in for that, which is exactly how the papers use it too.

With H = 13 km, 99.0 % of the dust column sits below the 60 km shell top, so the shell top does not
need to move.

### 2e. Phase function — and why one `g` cannot render a Martian sunset

Measured **[M]**: Chen-Chen et al. (2019) retrieve a double-Henyey-Greenstein fit from MSL sky
radiance, g₁ = 0.889 ± 0.098, g₂ = 0.094 ± 0.250, α = 0.743 ± 0.106, giving g = 0.687 ± 0.081 at
λ_eff ≈ 650 nm, "in good agreement with previous results by Wolff et al. (2009)".

The problem: **g rises toward the blue** — 0.700 at 680 nm, 0.693 at 550 nm, **0.766 at 440 nm** —
because a 1.5 µm particle's diffraction lobe narrows with wavelength. That, combined with the
red-weighted scattering coefficient, is the whole Martian colour story. Evaluating
β_sca(λ)·P_HG(g(λ), θ), blue/red **[D]**:

| scattering angle      | per-channel g | single g = 0.70 |
| --------------------- | ------------- | --------------- |
| θ = 0° (at the Sun)   | **1.30**      | 0.77            |
| θ = 90° (general sky) | **0.57**      | 0.77            |
| θ = 180°              | **0.56**      | 0.77            |

Per-channel g gives a blue glow around the Sun sitting in a butterscotch sky — which is what the
rover sunset images show. A single g gives a flat 0.77 everywhere: a butterscotch sky and a
butterscotch sunset. **A single Henyey-Greenstein g per constituent cannot produce the blue Martian
sunset.** The uniform layout has one `phaseG: f32` per constituent, so this is a real constraint,
not a tuning preference.

**Fix, and it costs one extra constituent, not a schema change.** Split the dust into two
constituents that share the profile and differ only in g — which is what the literature's DHG fit
already is. Fix the two lobes at the _measured_ values g₁ = 0.889 and g₂ = 0.094, then choose the
per-channel forward weight so the mixture's asymmetry parameter reproduces the table:

```
α(λ) = (g(λ) − g₂) / (g₁ − g₂) = (g(λ) − 0.094) / 0.795

α(680) = (0.7005 − 0.094)/0.795 = 0.7629
α(550) = (0.6931 − 0.094)/0.795 = 0.7536
α(440) = (0.7657 − 0.094)/0.795 = 0.8449
```

Independent check on that construction: at 650 nm it gives α = **0.7424**, against Chen-Chen's
_measured_ α = **0.743 ± 0.106**. The Wolff09 g(λ) table and the MSL sky-radiance DHG retrieval land
on the same forward-lobe weight to three decimals. That is the strongest single piece of evidence
in this note.

Absorption is split by the same α so that both lobes carry the physical ω₀; how absorption is
divided between two constituents with identical profiles is arbitrary, and equal ω₀ is the tidiest
arbitrary choice.

### 2f. Final dust coefficients

Column factor **[D]**: H·(1 − e^(−60/13)) = 13 · 0.99010 = **12.8713 km**.

```
β_sca = τ_sca / 12.8713   β_abs = τ_abs / 12.8713

        680 nm    550 nm    440 nm
β_sca   0.029548  0.026451  0.022681   1/km
β_abs   0.000816  0.003338  0.006516   1/km
```

Split by α(λ):

|                                  | 680      | 550      | 440      |
| -------------------------------- | -------- | -------- | -------- |
| forward lobe (g = 0.889) scatter | 0.022541 | 0.019934 | 0.019163 |
| forward lobe absorb              | 0.000623 | 0.002516 | 0.005506 |
| broad lobe (g = 0.094) scatter   | 0.007007 | 0.006518 | 0.003518 |
| broad lobe absorb                | 0.000194 | 0.000823 | 0.001011 |

**Confidence / what would falsify this.** Medium-high on the shape, medium on the absolute level.
The shape (grey extinction, ω₀ red-bright/blue-dark, g blue-peaked) rests on two independent
measured records and one Mie table cross-validated at two points. The level rests on the single τ
choice, which is a season, not a fact. Falsified by: ω₀ values from the Wolff et al. (2009) paper
itself differing materially from the LMD redistribution (I could not open the paper — see below);
a decision to render a dusty rather than a clear season; or evidence that the surface mosaic we
texture with already bakes in a dust column, in which case τ must come down to avoid double-counting.

---

## 3. Water-ice clouds — **no slot**

Recommendation: **do not add a constituent.**

The clouds are real and not always negligible — Lemmon et al. (2015) saw cirriform clouds at
Meridiani over L_S = 20–136° with peaks near 50° and 115°, producing "small spikes in optical
depth", and Lemmon et al. (2024) cite Smith et al. (2023) finding infrared optical depths of 0.2–0.3
around L_S 100° at Jezero, "corresponding to visible optical depths of 0.3–0.5" **[M]**. That is
comparable to the whole dust column.

But every one of those numbers is _seasonal and latitude-banded_: the aphelion cloud belt is a
tropical band present for roughly half the year. Our constituent is a spherically symmetric shell
with no latitude or seasonal term. Adding a cloud constituent would put an equal white haze over
the poles, over southern summer, and over the whole disc year-round — wrong everywhere except the
belt, half the time. The same paper records the contrast: "Ice clouds and probably hazes were not a
significant part of the opacity at the Spirit site" **[M]** — two rovers, same planet, same year.

Falsifier / when to revisit: if the atmosphere shell ever gains a latitude or seasonal modulation,
the aphelion cloud belt is the first thing to add, and its natural shape is a `tent` (the clouds sit
in a layer well above the dust's near-surface peak), not an exponential. Nothing else about the
current model wants it.

---

## Proposed constituent list

```ts
// Mars — surface radius 3389.5 km, shell top +60 km.
// Reference level = the drawn surface radius; coefficients are 1/km there.
constituents: [
  // CO2/N2/Ar molecular Rayleigh. 0.3 / 0.7 / 1.7 % of extinction — kept for
  // correctness, not for the look. tau(550) = 0.0026.
  {
    scatter: [1.0e-4, 2.38e-4, 5.97e-4], // [D] Bideau-Mehu n + He et al. 2021 King factor
    absorb: [0, 0, 0],
    profile: { kind: 'exponential', scaleHeightKm: 10.8 }, // [D] R·210K/(43.568 g/mol · 3.72076)
    phase: { kind: 'rayleigh' },
  },
  // Suspended dust, forward lobe. Two lobes, not one: a single g cannot make the
  // sunset blue, because g rises toward the blue (0.766 @440 vs 0.700 @680).
  // Lobe g values are Chen-Chen et al. 2019's measured DHG; the per-channel split
  // reproduces Wolff09's g(lambda). tau_ext(880) = 0.40, Gale's clear-season floor.
  {
    scatter: [0.022541, 0.019934, 0.019163], // [D]
    absorb: [0.000623, 0.002516, 0.005506], // [D]
    profile: { kind: 'exponential', scaleHeightKm: 13 }, // [M] Lemmon et al. 2024
    phase: { kind: 'henyeyGreenstein', g: 0.889 }, // [M] Chen-Chen et al. 2019
  },
  // Suspended dust, broad lobe. Same profile and same single-scattering albedo as
  // the forward lobe; only g differs.
  {
    scatter: [0.007007, 0.006518, 0.003518], // [D]
    absorb: [0.000194, 0.000823, 0.001011], // [D]
    profile: { kind: 'exponential', scaleHeightKm: 13 },
    phase: { kind: 'henyeyGreenstein', g: 0.094 }, // [M] Chen-Chen et al. 2019
  },
];
```

Three slots of four. Water ice is deliberately absent (§3).

**Single-lobe fallback**, if the two-lobe split is rejected on cost or on look grounds — merge the
two dust rows into one with `g: 0.70` **[M]**, `scatter: [0.029548, 0.026451, 0.022681]`,
`absorb: [0.000816, 0.003338, 0.006516]`. The sky stays butterscotch; the sunset stops being blue.
That is the trade, stated plainly so nobody rediscovers it by eye.

---

## Could not verify

- **Wolff, M. J., et al. (2009), JGR 114, E00D04.** Paywalled; I did not open it. Every ω₀(λ) and
  g(λ) number here comes from the LMD Mars GCM data file `aerdust.h.wolff09`, whose own header
  states it is Wolff et al. 2009 for a gamma distribution with r_eff = 1.5 µm, ν_eff = 0.3, D/L = 1.
  That file is a redistribution, not the paper. It cross-checks against the primary at two
  independent points — ω₀(650) = 0.967 vs the 0.975 that Chen-Chen et al. (2019) quote from Wolff,
  and g(650) → α = 0.7424 vs Chen-Chen's measured 0.743 ± 0.106 — but the r_eff = 1.5 µm, ν_eff = 0.3
  distribution is a specific choice, and a different distribution shifts ω₀ in the blue.
  **This is the single largest unverified dependency in the note.**
- **Tomasko et al. (1999), JGR 104, 8987.** Paywalled; not opened, and consequently **not cited**.
  No number here is attributed to it.
- **Smith (MGS-TES) opacity climatology, Wolff et al. (2010) MARCI UV.** Not opened, not cited.
- **Vicente-Retortillo et al. (2015), JSWSC 5, A33** and **Madeleine et al. (2011), JGR 116, E11010.**
  Both nominally open access, both served 403 to every fetch I tried. Not cited.
- **NASA/NSSDC Mars fact sheet.** The URL now redirects to nasa.gov; the page is gone. The oft-quoted
  "scale height 11.1 km" therefore has no live source in this note. It is reproduced by the same
  formula at T = 216 K, which is why §1 recommends 10.8 km with the composition we can cite instead.
- **The blue Martian sunset as an observed fact.** I derived the mechanism from ω₀(λ) and g(λ) and
  showed the blue/red ratio flips across scattering angle, but I did not open a paper that analyses
  sunset colour. The observation itself is unambiguous in published rover sunset imagery; the
  attribution to the narrowing diffraction lobe is mine, from the tables, tagged **[D]**.
- **Global-mean surface pressure 610 Pa.** Conventional, not verified against an opened source here.
  τ_R scales linearly with it, so a 6.36 mbar vs 6.10 mbar preference moves the Rayleigh row by 4 %
  — inside the noise of a term worth 1 % of extinction.
