# Venus — atmosphere constituents

Research note for stage 2 of `docs/superpowers/specs/2026-08-18-atmosphere-constituents-design.md`.
RGB reference wavelengths 680 / 550 / 440 nm. Units 1/km. Tags: **[M]**easured (published,
cited), **[D]**erived (arithmetic shown), **[L]**ook (no measurement pins it).

**Headline: the reference-level question dominates everything else on this row.** Venus's
solid surface is under ~41 optical depths of blue Rayleigh and ~25 of cloud. Nothing about
that column is renderable. The drawn sphere already carries a cloud texture
(`bodyTextureRegistry.ts:77` — "Venus is unresolved cloud"), so altitude 0 should be read as
the **cloud top**, not the 92 bar surface. §0 makes the case; §§1–3 give coefficients for
both readings so the call can be made on evidence.

## Sources actually opened

Every number below traces to one of these; I downloaded and read each PDF, not an abstract.

| Short      | Full                                                                                                                                                                                           | What I took from it                                                                                                                                        |
| ---------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| He+21      | Q. He et al., _Atmos. Chem. Phys._ **21**, 14927 (2021), [doi:10.5194/acp-21-14927-2021](https://doi.org/10.5194/acp-21-14927-2021)                                                            | Table 1: CO₂ and N₂ refractive-index dispersion + King correction factors, and the σ formula                                                               |
| Titov+18   | D.V. Titov et al., "Clouds and Hazes of Venus", _Space Sci. Rev._ **214**, 126 (2018) — read via the [Oxford ORA copy](https://ora.ox.ac.uk/objects/uuid:8b6555b8-41b1-4d29-a949-7a805020fcc4) | Table 1 cloud structure + per-layer τ; haze scale heights; UV absorber band; conservative-scattering statement                                             |
| Bailey+26  | J. Bailey et al., "One Hundred Years of Venus Polarimetry", [arXiv:2603.08151](https://arxiv.org/abs/2603.08151)                                                                               | Tables 2–4: Hansen & Hovenier (1974) cloud model parameters — rₑff, vₑff, nᵣ, **and ϖ₀ per wavelength**; the 50 mbar cloud-top pressure and its derivation |
| PH+18      | S. Pérez-Hoyos et al., _JGR Planets_ **123**, 145 (2018), [arXiv:1801.03820](https://arxiv.org/abs/1801.03820)                                                                                 | Table 1/2: mode τ's, sizes, 75 % H₂SO₄; UV-absorber Gaussian band (0.34 µm, FWHM 0.14 µm); cloud top 75 ± 2 km                                             |
| Mallama+17 | A. Mallama, B. Krobusek, H. Pavlov, _Icarus_ **282**, 19 (2017), [arXiv:1609.05048](https://arxiv.org/abs/1609.05048)                                                                          | Table 7: Venus geometric albedo per Johnson–Cousins band — the RGB colour anchor                                                                           |
| Bains+21   | W. Bains et al., "Phosphine on Venus Cannot be Explained by Conventional Processes", [arXiv:2009.06499](https://arxiv.org/abs/2009.06499)                                                      | Table S9: a VIRA (Seiff+85) T–P ladder, 0–70 km, at 5 km steps                                                                                             |

Not opened, cited only through the reviews above and flagged as such: Hansen & Hovenier
(1974), Knollenberg & Hunten (1980), Esposito et al. (1983), Seiff et al. (1985), Crisp
(1986), Palmer & Williams (1975), Molaverdikhani et al. (2012).

Scratch computations (Rayleigh cross-sections, Mie) are reproduced inline; the Mie code was
validated against Wiscombe's MIEV0 test case m = 1.33, x = 100 → Q_ext = 2.101321 (mine:
2.10107).

---

## 0. Geometry — the current row's altitude 0 is in the wrong place

**Recommendation: read altitude 0 as the τ = 1 cloud top and set `atmosphereTopKm` to
`radius + 40`, not `+ 100`.** Keep `planetRadiusKm = seededPlanet('venus').radiusKm`.

### Why the 92 bar surface cannot be the reference level

The vertical Rayleigh optical depth of the _whole_ Venus column, computed in §1:

| λ      | τ_R from the solid surface |
| ------ | -------------------------- |
| 680 nm | 6.9                        |
| 550 nm | 16.4                       |
| 440 nm | 41.2                       |

Add τ ≈ 20–30 of cloud (Titov+18 Table 1). At those depths the drawn sphere's texels are
unreachable by any ray, so whatever texture the sphere carries is _thrown away_ — and the
texture Venus carries is a cloud photograph, i.e. exactly the thing the shell would be
re-deriving from scratch. The renderer would spend its whole march reproducing an image it
was already handed. Worse, it would reproduce it wrong: the multiple-scattering LUT is a
Hillaire-style approximation calibrated for Earth's τ ≲ 1 regime, not τ ≈ 40.

The physics here is real and worth recording rather than "fixing": **Venus's surface really
is invisible in visible light, and really is lit orange-red**, because 41 optical depths of
blue Rayleigh strip the short wavelengths out of the ~3 % of sunlight that reaches the
ground (Titov+18: "on average, only ∼ 3 % of the solar flux incident at the top of the
atmosphere reaches the surface").

### Where altitude 0 should sit

Venus joins the table's existing **cloud-tops-as-ground** family (Jupiter, Saturn), which the
spec has already committed Titan to as well ("Titan takes **Venus's shape**"). Three
candidate levels, all [M]:

- **68.8 km / 50 mbar** — the τ = 1 level at 0.63 µm. Hansen & Hovenier (1974) derived it
  from the measured Rayleigh-to-cloud ratio f_R = 0.045 at 365 nm; Bailey+26 §3.1: "the
  atmospheric pressure at the cloud tops (defined by an optical depth τ = 1) is 50 mbar …
  a pressure of 50 mbar corresponds to a height of 68 km at most latitudes". **This is the
  one I recommend**, because it is the level the renderer's ground/shell split actually
  means: ground = the cloud at τ > 1, shell = everything above. No double counting by
  construction.
- 74 ± 1 km — Ignatiev et al. (2009), from the 1.6 µm CO₂ band; Titov+18 notes this is
  "affected by a systematic error and should be corrected by approximately −2 km", i.e. ~72 km.
- 75 ± 2 km — PH+18, τ = 1 at 0.63 µm from MESSENGER/MASCS.

The spread (68–75 km) is a real ~1 scale-height disagreement between methods, not sloppiness.
I use 68.8 km because it is the level whose _pressure_ is pinned, and pressure is what §1
needs.

### The 68 km radius offset is cosmetically irrelevant

Placing the cloud deck at the solid-surface radius understates Venus's drawn radius by
68 / 6052 = **1.1 %**. That is below the level at which anything in the scene notices, and
fixing it would desynchronise the shell from the sphere the renderer actually rasterises.
Leave it; note it in the row comment so nobody "fixes" it later.

### Shell top

Titov+18: "The upper haze fills the mesosphere up to ∼ 100 km altitude"; later, "Haze is
ubiquitous in the mesosphere and extends from the cloud top (∼ 70 km) up to ∼ 110 km."
Referenced to a 68.8 km altitude 0, that is **+31 to +41 km**. `+40` [D from M] is the right
shell top and is 10 aerosol scale heights — the density at the top is e⁻¹⁰ ≈ 4.5 × 10⁻⁵ of
the reference value, so nothing is being clipped.

The current `+100` is not _wrong_ so much as wasteful: with a ~4 km scale height the outer
60 km is vacuum the ray-marcher still steps through.

---

## 1. Molecular Rayleigh — CO₂ + N₂

### Composition and the constants it fixes

- **[M]** vmr(CO₂) = 0.965, vmr(N₂) = 0.035 — von Zahn & Moroz (1983), used as a _fixed_
  parameter in PH+18 Table 1.
- **[D]** μ = 0.965 × 44.0095 + 0.035 × 28.0134 = **43.450 amu** = 7.21498 × 10⁻²⁶ kg.
- **[D]** g = GM/R² = 3.24859 × 10¹⁴ / (6.0518 × 10⁶)² = 3.24859e14 / 3.66243e13 =
  **8.8700 m/s²**.

### Cross-sections from first principles

He+21 Eq. (1), which they attribute to Sneep & Ubachs (2005):

```
σ(ν) = 24 π³ ν⁴ / N_ref²  ·  [ (n²−1)/(n²+2) ]²  ·  F_k(ν)
```

He+21 Table 1, CO₂ row (ν in cm⁻¹, n scaled to 288.15 K / 1013.25 hPa,
N_ref = 2.546899 × 10¹⁹ cm⁻³):

```
(n−1)×10⁸ = 1.1427×10¹¹ × [   5799.25 / (128908.9² − ν²)
                            +  120.05  / ( 89223.8² − ν²)
                            +    5.3334/ ( 75037.5² − ν²)
                            +    4.3244/ ( 67837.7² − ν²)
                            + 1.218145×10⁻⁵ / (2418.136² − ν²) ]

F_k(CO₂) = 1.1364 + 2.53×10⁻¹¹ ν²
```

The last numerator is the value **after** the erratum: Sneep & Ubachs (2005) Eq. 13 printed
0.1218145 × 10⁻⁴; Kitzmann et al. (2017) corrected it to 10⁻⁶. He+21's `1.218145×10⁻⁵`
(inside a `×10¹¹` prefactor) is the corrected form. I used He+21's printing directly — it is
the version they validated against their own 307–725 nm measurements to
"(0.4 ± 1.2) %". The N₂ row (3.5 % of the gas) uses
`(n−1)×10⁸ = 5677.465 + 318.81874×10¹²/(1.44×10¹⁰ − ν²)`, `F_k = 1.034 + 3.17×10⁻¹² ν²`.

**[D]** Evaluating at ν = 10⁷/λ(nm):

| λ      | ν (cm⁻¹) | n−1 (CO₂)  | F_k     | σ(CO₂) cm² | σ(N₂) cm²  | **σ_mix** cm²  |
| ------ | -------- | ---------- | ------- | ---------- | ---------- | -------------- |
| 680 nm | 14705.88 | 4.24008e−4 | 1.14187 | 4.8947e−27 | 1.9557e−27 | **4.7918e−27** |
| 550 nm | 18181.82 | 4.27164e−4 | 1.14476 | 1.1637e−26 | 4.6308e−27 | **1.1392e−26** |
| 440 nm | 22727.27 | 4.32407e−4 | 1.14947 | 2.9232e−26 | 1.1556e−26 | **2.8614e−26** |
| 365 nm | 27397.26 | 4.39207e−4 | 1.15539 | 6.4016e−26 | 2.5096e−26 | 6.2654e−26     |

σ_mix = 0.965 σ(CO₂) + 0.035 σ(N₂). CO₂ scatters **2.5×** more per molecule than N₂ at
these wavelengths.

### Number density and scale height at each candidate reference

VIRA T–P ladder, **[M]** Bains+21 Table S9 (their §Methods: "we use previously published TP
profiles of (Seiff et al. …)"):

| z (km)  | 0     | 45   | 50   | 55   | 60   | 65   | 70   |
| ------- | ----- | ---- | ---- | ---- | ---- | ---- | ---- |
| T (K)   | 735   | 383  | 348  | 300  | 263  | 243  | 230  |
| P (bar) | 92.10 | 1.98 | 1.07 | 0.53 | 0.24 | 0.10 | 0.04 |

**[D]** Log-interpolating P between 65 and 70 km: d ln P/dz = ln(0.04/0.10)/5 =
−0.18326 km⁻¹, so 50 mbar sits at z = 65 + ln(0.10/0.05)/0.18326 = 65 + 3.8 = **68.8 km**,
where T ≈ 233 K. That independently reproduces Bailey+26's "68 km at most latitudes" — a
genuine cross-check between two papers I opened.

**[D]** N = P/(kT), H = kT/(μg):

| Reference level   | P          | T     | N (cm⁻³)     | H           |
| ----------------- | ---------- | ----- | ------------ | ----------- |
| Solid surface     | 9.210e6 Pa | 735 K | 9.076e20     | 15.86 km    |
| **τ=1 cloud top** | 5.000e3 Pa | 233 K | **1.554e18** | **5.03 km** |
| 70 km             | 4.000e3 Pa | 230 K | 1.260e18     | 4.96 km     |

Surface: N = 9.21e6 / (1.380649e−23 × 735) = 9.0759e26 m⁻³.
H = 1.01478e−20 / (7.21498e−26 × 8.87) = 15857 m.
Cloud top: N = 5000 / (1.380649e−23 × 233) = 1.5543e24 m⁻³ = 1.5543e18 cm⁻³.
H = 3.21691e−21 / (7.21498e−26 × 8.87) = 5027 m.

The cloud-top H = 5.03 km brackets Titov+18's **[M]** independent statements: "Comparison to
the gaseous scale height Hg ∼ 4.5 km"; "Below 75 km at the cloud top the scale height
increases to 4–5 km at low and middle latitudes". PH+18: "the gas scale height, which is
∼ 4 km at the cloud tops". The spread 4.0–5.0 is the real latitude/temperature spread.

### β_R = N σ_mix

**[D]**, converting cm⁻¹ → km⁻¹ by ×10⁵:

**At the solid surface (the honest, unrenderable number):**

| λ   | β_R (1/km) |
| --- | ---------- |
| 680 | **0.4349** |
| 550 | **1.0339** |
| 440 | **2.5969** |

680 nm: 9.0759e20 × 4.7918e−27 = 4.3490e−6 cm⁻¹ = 0.4349 km⁻¹.

That is **~90× a correctly-computed Earth sea-level green Rayleigh** (76× the inflated value
sitting in the Earth row — see cross-check 2), and it is not a mistake: 35.6× the number
density × 2.5× the cross-section = 89. The vertical optical depth over the whole column,
τ = σ_mix · P/(μg) with column N = 9.21e6/(7.21498e−26 × 8.87) / 10⁴ = 1.4391e27 cm⁻²:

τ_R = **6.9 / 16.4 / 41.2** at 680 / 550 / 440 nm (90.2 at 365 nm).

A 100 km shell would _not_ truncate this — β₀H = 6.9 already, and the 0–50 km density
e-folding is ~13.5 km (from the ladder: ρ ∝ P/T falls by 1/40.8 over 50 km), so ~99 % of the
column is inside +100 km. The shell captures it faithfully. It just cannot be _rendered_
faithfully by a single-scattering-plus-LUT model, and the result would be an opaque blue-white
ball, not Venus.

**At the τ = 1 cloud top — the recommended row:**

| λ   | β_R (1/km)  | τ_R above the reference (β₀ × 5.03 km) |
| --- | ----------- | -------------------------------------- |
| 680 | **7.45e−4** | 0.0037                                 |
| 550 | **1.77e−3** | 0.0089                                 |
| 440 | **4.45e−3** | 0.0224                                 |

This is ~1/7 of Earth's sea-level Rayleigh — thin, blue, and essentially invisible under
τ ≈ 1 of grey cloud. Say so in the row comment: this term is present for correctness and
contributes almost nothing to the image.

### Cross-check 1 — HH74's f_R

Hansen & Hovenier put "a population of Rayleigh scatterers … with an optical depth set to a
fraction f_R = 0.045 of the cloud optical depth at 365 nm" (Bailey+26 §3.1). At the τ = 1
level that means τ_R(365) = 0.045. My column above 50 mbar is
N = 5000/(7.21498e−26 × 8.87)/10⁴ = 7.8128e23 cm⁻², so
τ_R(365) = 7.8128e23 × 6.2654e−26 = **0.0490**.

**9 % agreement with a 1974 measurement**, using an independent 2021 cross-section table.
This is the single strongest validation in this note: it simultaneously confirms the CO₂
cross-sections, the 50 mbar cloud-top pressure, and the mean molecular mass.

### Cross-check 2 — the Earth row is 19 % high

Running the same machinery on dry air (σ_air ≈ 0.97 σ_N₂, N = 2.546899e19):

| λ   | this note | `atmosphereParams.ts` Earth row | ratio |
| --- | --------- | ------------------------------- | ----- |
| 680 | 4.83e−3   | 5.8e−3                          | 1.20  |
| 550 | 1.144e−2  | 13.6e−3                         | 1.19  |
| 440 | 2.855e−2  | 33.1e−3                         | 1.16  |

My σ_N₂(550) = 4.631e−27 cm² sits just above the ~4.53e−27 that Earth's standard
τ_R(550) ≈ 0.097 over a 2.15e25 cm⁻² column implies for _air_ — correct in sign and size,
since air scatters slightly less than pure N₂. (I did not open Bodhaine et al. 1999; that
τ is quoted from memory and is the weakest link in this paragraph. It does not feed any
Venus number — it is a sanity check only.) So the machinery is right and **the Earth row's
Rayleigh constants are the legacy Nishita/Bruneton values,
uniformly ~19 % above a careful calculation.** Relevant here only as a warning: a Venus row
derived honestly sits on a slightly different absolute scale than the Earth row it will be
eyeballed against. Do not "correct" Venus to match Earth.

### Confidence / what would falsify this

High for the cross-sections (validated twice above). The soft spots:

- **Real-gas effects at 92 bar.** T_r = 735/304 = 2.4, P_r = 92/74 = 1.25, so CO₂ is a
  supercritical fluid, not an ideal gas. VIRA's surface density 64.79 kg/m³ against ideal
  66.25 implies Z ≈ 1.02, i.e. N from P/kT is ~1 % **high**. Separately, Einstein–Smoluchowski
  density-fluctuation scattering scales as ρ²kTκ_T rather than N, and with Bρ ≈ 0.022 the
  correction is 1/(1 + 2Bρ) ≈ **−4 %**. Both are ≲5 % and both point the same way, so the
  surface β_R above is if anything a slight over-estimate. Neither matters at all for the
  recommended cloud-top row.
- **The dispersion formula outside its fitted range.** He+21's Table 1 lists the CO₂
  ν-range as 39417–55340 cm⁻¹ (180–254 nm) — the Bideau-Mehu measurements — yet validates it
  against their own data over 307–725 nm. Our RGB triple is inside the validated band.
- Falsified by: an independent τ_R(365)/τ_cloud that is not ≈0.045, or a cloud-top pressure
  materially away from 50 mbar.

---

## 2. H₂SO₄ cloud deck

### Composition and size — [M]

- 75 wt % H₂SO₄ / 25 % H₂O is the model standard (PH+18 Table 1, from Palmer & Williams 1975).
  In-situ and remote values scatter: Pioneer Venus's mass-spectrometer inlet blockage implied
  "85 % H₂SO₄ and 15 % H₂O" (Hoffman et al. 1980, via Titov+18); VIRTIS retrievals give
  "79 ± 4 %" (Titov+18). Titov+18's own summary: "sulphuric acid having a weight percent
  between 75 % and 90 %". Immaterial at RGB — it moves n_r by ~0.01.
- Refractive index n_r = **1.44 ± 0.02 at 0.55 µm** (Hansen & Hovenier 1974, quoted in
  Titov+18 and tabulated per-wavelength in Bailey+26 Table 3: 1.45 at 365 nm, 1.44 at
  445/550/655 nm, 1.43 at 990 nm).
- Size: **r_eff = 1.05 µm, v_eff = 0.07**, gamma distribution (Hansen & Travis 1974) — the
  canonical mode-2 droplet, Bailey+26 §3.1. PH+18 uses a log-normal r = 1.0 µm, σ = 0.25 for
  the same population. Both give the same answers below to ~1 %.

### Vertical structure and optical depth — [M]

Titov+18 Table 1 (from Esposito et al. 1983 / Knollenberg & Hunten 1980), τ at 0.63 µm:

| Region       | Altitude     | τ        | Mean diameter               | N (cm⁻³)       |
| ------------ | ------------ | -------- | --------------------------- | -------------- |
| Upper haze   | 70–90 km     | 0.2–1.0  | 0.4 µm                      | 500            |
| Upper cloud  | 56.5–70 km   | 6.0–8.0  | mode 1: 0.4, mode 2: 2.0 µm | 1500 / 50      |
| Middle cloud | 50.5–56.5 km | 8.0–10.0 | 0.3 / 2.5 / 7.0 µm          | 300 / 50 / 10  |
| Lower cloud  | 47.5–50.5 km | 6.0–12.0 | 0.4 / 2.0 / 8.0 µm          | 1200 / 50 / 50 |

Total **τ = 20–30**. Titov+18 elsewhere: "The total aerosol opacity is 30–50"; "The opacity
at 1 µm averaged over the globe is 34.7 (Haus et al. 2013)"; "the total opacity at 1.7 and
2.3 µm ranges from 25 to 40". PH+18's MASCS retrieval sums to ~28 (mode-1 3.2, mode-2′ 6.8,
mode-3 7.5, mode-2 ~10). **This is genuinely a factor-1.5 spread in the literature** — it is
spatially and temporally variable, not a measurement dispute. Any number in 20–40 is defensible.

Aerosol scale height, **[M]** Titov+18: "The upper haze region (75–90 km) … is characterized
by Ha = 2.8 ± 1.2 km"; "Below 75 km at the cloud top the scale height increases to 4–5 km at
low and middle latitudes"; and at high latitudes "the scale height can decrease to below 2 km".

### Profile shape — exponential, and why not a tent

For the **recommended (cloud-top) reference**: exponential, `scaleHeightKm = 4`. A tent is
structurally wrong here — the deck's peak density is _below_ altitude 0, so a tent would need
a negative `centerKm`. The material in the shell is the falling upper flank of the deck plus
the upper haze, which is exactly an exponential. 4 km is a **[D]** compromise between the
4–5 km measured immediately above the cloud top and the 2.8 ± 1.2 km measured in the
75–90 km haze; the near field dominates the image, so it is weighted toward the former.

For the **surface-referenced alternative**, a tent is right and is the case the spec's tent
profile exists for: `centerKm = 59`, `widthKm = 11` spans 48–70 km, matching "The main cloud
deck extends from about 48 km up to ∼ 70 km".

### Scattering coefficient

**[D]** At the τ = 1 reference level the constituent's own definition fixes it: the column
above altitude 0 must have τ = 1, and for an exponential ∫β₀e^(−h/H)dh = β₀H, so

```
β_cloud = τ / H = 1.0 / 4.0 = 0.25 /km
```

**And it is grey.** Mie over the HH74 gamma distribution (r_eff = 1.05 µm, v_eff = 0.07,
n_r per Bailey+26 Table 3), extinction cross-section relative to 0.63 µm:

| λ      | C_ext (µm²) | relative to 0.63 µm |
| ------ | ----------- | ------------------- |
| 680 nm | 6.684       | 1.006               |
| 550 nm | 6.634       | 0.999               |
| 440 nm | 6.547       | 0.985               |
| 365 nm | 6.406       | 0.964               |

**Within 1.5 % across the whole RGB range.** The size parameter is x = 2πr/λ ≈ 12, deep in
the geometric-optics regime where Q_ext ≈ 2 regardless of λ. So:

```
scatter = [0.25, 0.25, 0.25]   // 1/km, at the cloud-top reference
```

**This is the most important single result in this note for the look.** Venus's cloud carries
_no colour_. Every bit of Venus's colour is (a) the near-UV absorber and (b) the ground
albedo. Any temptation to make `scatter` warm — as the current row's
`rayleighScatter: [12e-3, 10e-3, 7e-3]` does — is unphysical.

### Single-scattering albedo — [M], and it is the UV absorber in disguise

Bailey+26 Table 3, reproducing Hansen & Hovenier (1974)'s models:

| λ (nm) | HH74 figure | n_r  | **ϖ₀**      |
| ------ | ----------- | ---- | ----------- |
| 365    | Fig. 9      | 1.45 | 0.98427     |
| 445    | Fig. 11     | 1.44 | **0.99500** |
| 550    | Fig. 4      | 1.44 | **0.99897** |
| 655    | Fig. 12     | 1.44 | **0.99930** |
| 990    | Fig. 7      | 1.43 | 0.99941     |

445 / 550 / 655 nm are within 5 / 0 / 25 nm of our 440 / 550 / 680 references — this table is
almost exactly the triple we need.

Bailey+26 are explicit about what those numbers _are_: "The cloud particles are modelled with
a zero imaginary refractive index, which should result in pure scattering particles with no
absorption. However, the adjustment of the single scattering albedo, as described by HH74,
makes the particles absorbing, particularly at short wavelengths. **In effect, this
incorporates into the model what is now referred to as the 'unknown UV absorber'.**"

That is the decomposition the constituent model wants, handed over ready-made:

- **H₂SO₄ droplets**: conservative. Titov+18: "Sulfuric acid aerosols almost conservatively
  scatter the solar light in the range from UV to near-IR (∼ 2.5 µm)." → `absorb = [0,0,0]`.
- **UV absorber**: a separate constituent carrying all of `1 − ϖ₀` (§3).

### Phase function

**[D]** Mie asymmetry parameter over the HH74 distribution:

| λ      | g     |
| ------ | ----- |
| 680 nm | 0.679 |
| 550 nm | 0.718 |
| 440 nm | 0.750 |

The uniform slot takes one number: **g = 0.72** (the green anchor; the RGB mean is 0.716).
Commonly quoted in the literature as ~0.74 — my 0.718 sits at the low edge of that, and the
difference is distribution truncation and the exact n_r. Either is fine.

The current row's `miePhaseG: 0.7` is, remarkably, already right. **This is the one physics
value in Venus's existing row that survives.**

**Caricature to record:** Venus's real cloud phase function has a **glory** at α ≲ 15° and a
**rainbow** near α ≈ 25° — Bailey+26's entire subject, and the features that pin r_eff and
n_r. Henyey–Greenstein has neither. A single-g HG will render the backscatter peak as a smooth
hump. That is a known and accepted loss, not a tuning failure; do not chase it by raising g.
Nor can one g express the 0.679 → 0.750 red-to-blue swing, which by itself makes blue limbs
slightly darker than red ones in reality.

### Confidence / what would falsify this

Good. The greyness and g are computed from a validated Mie code over a size distribution with
50 years of polarimetric support. The soft spot is **β_cloud's absolute value, which is bound
to the reference-level choice, not measured**: if altitude 0 moves up to 70 km, Titov+18
Table 1's upper haze gives τ = 0.2–1.0 over 70–90 km, i.e. β₀ ≈ 0.05–0.25 /km — a factor 5
range. Falsified by a rendered limb that is either invisible or opaque; the target is a thin,
soft bright rim, a few pixels at full-disc framing.

---

## 3. The near-UV absorber — an **[L]** row however it is written

### The identity is genuinely unsettled — state it, do not resolve it

Titov+18: "Another species present solely in the upper cloud is the mysterious UV-blue
absorbers whose inhomogeneous vertical and spatial distribution creates well-known markings on
the cloud top … **This species strongly absorbs at 0.3–0.5 µm and is responsible for
absorption of about half of the solar energy the planet receives from the Sun.**"

On candidates, Titov+18: "Several candidates could account for the core absorption around
0.35 µm, but **the main problem is fitting the spectral slope at 0.4–0.5 µm.** The best
agreement was found for an irradiated version of S₂O (Lo et al. 2003) and S₂O₂ or OSSO
(Frandsen et al. 2016) if a single absorber is assumed. Other species including iron chloride
have too narrow absorption." Limaye et al. (2018) put it flatly: "the identities of the
absorber(s) in the 330–600 nm region remain uncertain."

**The unresolved slope is at 400–500 nm — which is precisely where the B channel lives.** So
the constituent is `[L]` not by convention but because the literature does not constrain the
one number the renderer most needs.

### Spectral shape — [M]

PH+18, from MESSENGER/MASCS: "The imaginary part of refractive index of the UV absorber was
found to be centred at 0.34 ± 0.03 µm with a full width at half maximum of 0.14 ± 0.01 µm
assuming Gaussian shape of the absorption band" — blue-shifted relative to Pollack et al.
(1980).

**[D]** σ_λ = FWHM/2√(2 ln2) = 0.14/2.3548 = 0.05945 µm. Band value exp(−½((λ−0.34)/σ)²):

| λ      | (λ−0.34)/σ | band         |
| ------ | ---------- | ------------ |
| 365 nm | 0.4205     | 0.9154       |
| 440 nm | 1.6820     | **0.2430**   |
| 550 nm | 3.5322     | **1.953e−3** |
| 680 nm | 5.7188     | **7.91e−8**  |

So the RGB shape is `[~0, 0.002, 0.243]` normalised to the band peak — **a blue-only
absorber**, with red literally eight orders of magnitude down. Note the paper's own caveat,
echoed by Titov+18: a single Gaussian _underfits_ the 0.4–0.5 µm slope, so 0.243 at 440 nm
is a lower bound on the real absorption there.

### Magnitude — two independent anchors that disagree by ~3×, and I recommend the second

**Anchor A — direct optical depth.** Titov+18, quoting Molaverdikhani et al. (2012): "the
average optical depth of the absorber at 0.365 µm in the equatorial region is 0.21 ± 0.04
decreasing to τ = 0.08 ± 0.05 towards the pole." **[D]** Scaling by the Gaussian:

τ_abs = **0.056** (440 nm) / 4.5e−4 (550) / ~0 (680).

**Anchor B — HH74's ϖ₀, which is what the render actually has to match.** From §2, with
`absorb = β_cloud · (1−ϖ₀)/ϖ₀` and β_cloud = 0.25 /km:

| λ     | ϖ₀      | (1−ϖ₀)/ϖ₀ | **absorb (1/km)** | τ_abs over 4 km |
| ----- | ------- | --------- | ----------------- | --------------- |
| 680   | 0.99930 | 7.005e−4  | **1.75e−4**       | 7.0e−4          |
| 550   | 0.99897 | 1.031e−3  | **2.58e−4**       | 1.03e−3         |
| 440   | 0.99500 | 5.025e−3  | **1.26e−3**       | 5.03e−3         |
| (365) | 0.98427 | 1.598e−2  | 4.00e−3           | 1.60e−2         |

Anchor B's τ_abs(440) over the shell is 0.005 against Anchor A's 0.056. The discrepancy is
**not** a contradiction: Molaverdikhani's 0.21 is the absorber's _whole_ column, and the
absorber lives at 63–71 km — i.e. mostly _below_ a 68.8 km reference level. Titov+18 on
Molaverdikhani's two admissible models: "One model is a well-mixed absorber above ∼ 63 km …
The second model suggests a thin layer of pure absorber placed roughly around 71 km." With
a well-mixed absorber above 63 km and H ≈ 5 km, the fraction above 68.8 km is
e^(−5.8/5) = 0.31, giving τ_abs(365) ≈ 0.065 above the reference, hence τ_abs(440) ≈ 0.017 —
between the two anchors and within a factor 3 of B.

**Use Anchor B.** It is the one tied to ϖ₀, which is the quantity the radiative transfer
consumes, and it is self-consistent with β_cloud by construction.

### The colour target — [M], and it is much less yellow than the current row

Mallama+17 Table 7, Venus geometric albedo:

| U (365) | B (445) | V (551) | R (658) | I (806) |
| ------- | ------- | ------- | ------- | ------- |
| 0.348   | 0.658   | 0.689   | 0.708   | 0.584   |

Normalised to R: **B/R = 0.929, V/R = 0.973, U/R = 0.492.**

**This is the surprise of this note.** In the UV Venus is half as bright as in the red — the
absorber's signature is enormous. But at 440 nm the deficit is only **7 %**. Venus in visible
light is a nearly white, very faintly warm ball. The famous butter-yellow Venus is a UV-filter
artefact and a colourised-imagery convention, not a photometric fact.

The current seed albedo `[0.85, 0.80, 0.60]` (`scenePlanets.ts:29`) has B/R = 0.706 — **it is
about 3× too yellow.** Scaled to a Bond albedo of ~0.77, Mallama's ratios give
`[0.796, 0.774, 0.740]`. Changing the seed is out of this row's scope (it feeds
`groundAlbedo`, the InfoCard and the point colour), but it is the single change that would do
most for Venus's appearance, and it should be raised as its own item.

### Where the absorber's render effect really lives

With altitude 0 at the cloud top, **most of the absorber is under the drawn sphere**, so most
of its effect belongs in `groundAlbedo`, not in a constituent. The shell's absorber
constituent is a small residual — the part mixed into the upper haze — worth ~0.5 % of
single-pass blue extinction. Keep it anyway: it is physically the right shape, it is what
makes the _limb_ slightly warmer than the disc (which Venus does show), and it is the row that
a later tuner will reach for.

### Confidence / what would falsify this

The **shape** is well constrained (blue-only, red-free) and I would defend it. The
**magnitude** is not: three published anchors span a factor ~10 depending on how much of the
absorber column you place above the reference level, and the identity question means nobody
can compute it from first principles. Treat `absorb` as the row's tuning dial and tune it
against one measurable: **the rendered disc's B/R ratio must land near 0.93, not 0.71.**
Falsified by a Venus that reads yellow at full phase.

---

## Proposed constituent list

### Recommended — altitude 0 = the τ = 1 cloud top (50 mbar, 68.8 km)

```ts
venus: {
  planetRadiusKm: seededPlanet('venus').radiusKm,
  // [D] Altitude 0 is the tau=1 CLOUD TOP (50 mbar, 68.8 km up), not the 92 bar surface —
  // the drawn texture is unresolved cloud, and the surface sits under tau_R ~ 41 at 440 nm.
  // The 68 km the sphere is drawn too low is 1.1% of the radius; leave it.
  // [M] Haze reaches ~110 km (Titov+18) = +41 km; +40 is also 10 aerosol scale heights.
  atmosphereTopKm: seededPlanet('venus').radiusKm + 40,
  constituents: [
    {
      // [D] CO2 (96.5%) + N2 (3.5%) Rayleigh at N = 1.554e18 /cm3 (50 mbar, 233 K).
      // Cross-sections from He+21 ACP Table 1. tau above the reference is 0.022 at 440 nm:
      // present for correctness, invisible under the cloud. NOT a colour dial.
      scatter: [7.45e-4, 1.77e-3, 4.45e-3],
      absorb: [0, 0, 0],
      // [D] kT/(mu g) at 233 K. Titov+18 measures 4-5 km here; 5.03 is the isothermal value.
      profile: { kind: 'exponential', scaleHeightKm: 5 },
      phase: { kind: 'rayleigh' },
    },
    {
      // [D] tau = 1 above the reference, by definition of the level, over a 4 km scale height.
      // [M] GREY to 1.5% across 440-680 nm (Mie, r_eff 1.05 um, v_eff 0.07, n_r 1.44) —
      // Venus's cloud carries NO colour; do not warm this vector.
      // [M] Conservative: "Sulfuric acid aerosols almost conservatively scatter" (Titov+18).
      scatter: [0.25, 0.25, 0.25],
      absorb: [0, 0, 0],
      // [D] Between the 4-5 km measured at the cloud top and 2.8 +- 1.2 km in the
      // 75-90 km haze (Titov+18), weighted to the near field.
      profile: { kind: 'exponential', scaleHeightKm: 4 },
      // [D] Mie g = 0.679/0.718/0.750 at 680/550/440; one slot, so the green anchor.
      // HG has no glory and no rainbow — the real phase function's two signatures. Accepted.
      phase: { kind: 'henyeyGreenstein', g: 0.72 },
    },
    {
      // [L] The near-UV absorber. Its IDENTITY IS UNSETTLED (S2O / OSSO / FeCl3 all proposed,
      // none fits the 0.4-0.5 um slope) and 400-500 nm is exactly where B lives — so this row
      // is a look choice however it is written.
      // [D] absorb = 0.25 * (1 - w0)/w0 with HH74's w0 = 0.99930/0.99897/0.99500 at
      // 655/550/445 nm (Bailey+26 Table 3), which HH74 fitted to Venus's spherical albedo
      // and which Bailey+26 note "incorporates ... the unknown UV absorber".
      // Shape check: PH+18's Gaussian (0.34 um, FWHM 0.14) is [~0, 0.002, 0.243] in RGB.
      // TUNE AGAINST: rendered disc B/R must land near 0.93 (Mallama+17 0.658/0.708), NOT 0.71.
      scatter: [0, 0, 0],
      absorb: [1.75e-4, 2.58e-4, 1.26e-3],
      // Mixed with the cloud droplets, per Crisp 1986 / PH+18's mode-1 treatment.
      profile: { kind: 'exponential', scaleHeightKm: 4 },
      phase: { kind: 'henyeyGreenstein', g: 0.72 },
    },
  ],
  groundAlbedo: seededPlanet('venus').albedo,   // see note below — the seed is ~3x too yellow
  twilightSoftness: 0.05,
  twilightIntensity: 1.0,
  exposure: 3.0,
},
```

Also raise, as a separate item: **`scenePlanets.ts:29` `albedo: [0.85, 0.80, 0.60]` should be
about `[0.80, 0.77, 0.74]`** — Mallama+17's measured R/V/B geometric albedos scaled to a Bond
albedo of ~0.77. The existing seed's B/R = 0.71 against a measured 0.93 is where Venus's
excess yellow actually comes from, and no constituent tuning will fix it.

### Alternative — altitude 0 = the solid surface, shell +100 km

Recorded so the choice is on evidence. I would not ship it, for the reasons in §0.

```ts
constituents: [
  {
    // [D] CO2+N2 Rayleigh at N = 9.076e20 /cm3 (92.1 bar, 735 K). tau_vert = 6.9/16.4/41.2.
    scatter: [0.4349, 1.0339, 2.5969],
    absorb: [0, 0, 0],
    // [D] kT/(mu g) = 15.86 km at the surface; the 0-50 km DENSITY e-fold is 13.5 km
    // because T falls 735 -> 348. One exponential cannot have both.
    profile: { kind: 'exponential', scaleHeightKm: 14 },
    phase: { kind: 'rayleigh' },
  },
  {
    // [M] The deck, 48-70 km, tau ~ 25 at 0.63 um (Titov+18 Table 1; lit. spread 20-40).
    // [D] beta_peak = tau/width = 25/11 = 2.27 /km. Grey, conservative, g = 0.72.
    scatter: [2.27, 2.27, 2.27],
    absorb: [0, 0, 0],
    profile: { kind: 'tent', centerKm: 59, widthKm: 11 },
    phase: { kind: 'henyeyGreenstein', g: 0.72 },
  },
  {
    // [L] UV absorber. [M] tau(365) = 0.21 +- 0.04 (Molaverdikhani+12 via Titov+18),
    // [D] spread over RGB by PH+18's Gaussian, beta_peak = 0.21/8 = 0.0263 /km at 365.
    // [M] Molaverdikhani's two admissible models: well-mixed above 63 km, OR a thin layer
    // at ~71 km. The tent spans 59-75 km, which straddles both.
    scatter: [0, 0, 0],
    absorb: [0, 5.6e-5, 6.97e-3],
    profile: { kind: 'tent', centerKm: 67, widthKm: 8 },
    phase: { kind: 'henyeyGreenstein', g: 0.72 },
  },
];
```

Note this row needs `groundAlbedo` set to the _rock_ albedo (~0.1), not the cloud's — and
that no ray will ever reach it.

---

## Could not verify

- **The NASA/NSSDC Venus fact sheet.** `nssdc.gsfc.nasa.gov` 307-redirects to `nasa.gov`
  and the archived copy did not return the table. Surface P, T and density therefore come
  from Bains+21's Table S9 reproduction of VIRA/Seiff+85 (92.10 bar, 735 K at 0 km), not from
  the fact sheet. The density 64.79 kg/m³ used only in the real-gas footnote is **unverified**
  — I could not open a primary source for it, so I derived N from P/kT instead and flagged
  the ~1 % Z correction.
- **Bodhaine et al. (1999).** Not opened. Earth's τ_R(550) ≈ 0.097, used once as a sanity
  check on my own Rayleigh code, is quoted from memory. No Venus number depends on it.
- **Venus's Bond albedo.** Used 0.77 to rescale Mallama+17's geometric albedos in the seed
  recommendation. I could **not** open a primary source for it. The nearest verified statement
  is Titov+18's "more than 75 % of the incoming solar flux is returned back to space", which
  is consistent but is not a number. Treat the 0.77 as soft; the _ratios_ (B/R = 0.929) are
  the load-bearing part and those are directly measured.
- **Seiff et al. (1985) VIRA itself.** _Adv. Space Res._ 5(11) is not online. Every VIRA value
  here is second-hand through Bains+21 Table S9 and Bailey+26. The 5 km sampling and 1-s.f.
  pressure at 70 km (0.04 bar) is why the 68.8 km interpolation carries ~±0.5 km.
- **Hansen & Hovenier (1974) directly.** _J. Atmos. Sci._ 31, 1137 — the ϖ₀ table, r_eff,
  v_eff, n_r and f_R = 0.045 all come through Bailey+26's explicit reproduction of it
  (their Tables 2–4). Bailey+26 re-ran the models in VSTAR/VLIDORT, so this is a strong
  secondary, but it is secondary.
- **Pérez-Hoyos+18's imaginary refractive index values.** Figure 14 is a plot with no
  companion table; I could read the Gaussian _parameters_ from the text (0.34 µm, FWHM
  0.14 µm) but not the peak m_i. Hence the magnitude comes from HH74's ϖ₀ instead.
- **Whether the retrieved cloud-top altitudes disagree or the methods do.** 68 km (HH74
  polarimetry / 50 mbar), 72–74 km (Ignatiev+09, 1.6 µm CO₂ band, with Titov's −2 km
  correction), 75 ± 2 km (PH+18, 0.63 µm MASCS), 67 ± 2 km (Lee+12, 4.5 µm). Titov+18
  discusses the discrepancy without resolving it. I picked 68.8 km on the grounds that its
  _pressure_ is what §1 needs; someone else could defend 72 km and would get β_R about 1.6×
  smaller.
- **The 400–500 nm absorption slope.** The open problem in the field, per Titov+18. It is the
  reason §3 is `[L]`.
