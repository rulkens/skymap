# Uranus & Neptune — atmosphere constituents

Research note for stage 2 of [`specs/2026-08-18-atmosphere-constituents-design.md`](../../superpowers/specs/2026-08-18-atmosphere-constituents-design.md).
Reference wavelengths 680 / 550 / 440 nm. Tags: **[M]** measured (published, cited),
**[D]** derived (arithmetic shown), **[L]** look (no measurement pins it).

Both bodies are cloud-tops-as-ground: altitude 0 is the 1-bar level, which is also the
drawn sphere. Shells are +150 km (Uranus) and +120 km (Neptune).

## Sources actually opened

| Source                               | What was taken from it                                                                                                            | How it was read                                                     |
| ------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| Karkoschka (1998) _Icarus_ 133, 134  | CH₄ absorption coefficient in (km-amagat)⁻¹ **and** Uranus/Neptune geometric albedo, 300–1050 nm at 0.4 nm sampling               | PDS volume `GBAT_0001`, `1995LOW.TAB` + its `.LBL` column layout    |
| Irwin et al. (2022) JGR 127          | Table 2 (aerosol structure), Tables 3–4 (n_imag), the colour-difference argument, deep CH₄ mole fractions, condensation pressures | arXiv:2201.04516 LaTeX source, read verbatim                        |
| NASA NSSDCA fact sheets (2024-10-02) | radius, gravity, T(1 bar), ρ(1 bar), μ, scale height, composition                                                                 | `uranusfact.html` / `neptunefact.html`                              |
| Dalgarno & Williams (1962) ApJ 136   | H₂ Rayleigh cross section polynomial                                                                                              | via PDS Atmospheres Node encyclopedia page, which states it in full |
| Peck & Hung (1977) JOSA 67, 1550     | H₂ refractivity dispersion (cross-check only)                                                                                     | refractiveindex.info database YAML (formula 6 + coefficients)       |
| Mansfield & Peck (1969) JOSA 59,199  | He refractivity dispersion                                                                                                        | same                                                                |
| Loria (1909) Ann. Phys. 334, 605     | CH₄ refractivity dispersion                                                                                                       | same                                                                |

Karkoschka & Tomasko (2010) — the modern successor table — was **not** opened. Irwin
et al. (2022) state, in the Analysis section preamble, that they used "the band data of
[Karkoschka & Tomasko 2010], converted to k-tables by [Irwin et al. 2011]" for exactly
this wavelength range, and
the literature consensus is that below 1 µm KT2010 is close to Karkoschka (1998).
The 1998 table is therefore used here as the primary, not as a proxy for something unread.

---

## 0. Premise check: are the current rows actually "faking red absorption"?

The design doc says the current rows `[4, 10, 20]e-3` (Uranus) and `[4, 9, 22]e-3`
(Neptune) suppress the red channel of Rayleigh to stand in for methane. **Numerically
that is not what they do.** Held at the red value, a pure λ⁻⁴ ramp gives

- green: `4e-3 × (680/550)⁴ = 9.34e-3` — table has 10 and 9
- blue: `4e-3 × (680/440)⁴ = 22.8e-3` — table has 20 and 22

Both rows are within ~10% of λ⁻⁴ in shape, and (see U1) within ~25% of the correct
H₂/He magnitude. The real defect is different and worse: **`ozoneAbsorption` is
`[0,0,0]` in both rows, so methane — the thing that actually makes these planets blue
— is absent from the model entirely.** The recalibration barely moves Rayleigh; it
adds the missing constituent. Worth correcting in the spec's "Why" section, because
the stated motivation is a real one dressed in a wrong number.

---

# Uranus

Fact-sheet anchors [M] (NASA NSSDCA, 2024-10-02): equatorial radius (1 bar) 25 559 km;
`Acceleration (eq., 1 bar)` 8.69 m/s²; `Temperature at 1 bar` 76 K; `Density at 1 bar`
0.42 kg/m³; `Mean molecular weight` 2.64; `Scale height` 27.7 km; composition by volume
H₂ 82.5 % (3.3), He 15.2 % (3.3), CH₄ 2.3 %.

> Note: `scenePlanets.ts` seeds `radiusKm: 25362` — the _volumetric mean_ radius, not
> the 25 559 km equatorial 1-bar radius. Everything below is insensitive to the
> difference except the limb-path lengths, which move by 0.4 %.

**Number density at 1 bar [D]** — from the measured density rather than the ideal gas
law, so μ and T do not have to be assumed consistent:

```
N = ρ / (μ · m_u) = 0.42 / (2.64 × 1.66054e-27)  = 9.581e25 m⁻³ = 9.581e19 cm⁻³
                                                 = 3.566 amagat        (Loschmidt 2.68678e19 cm⁻³)
ideal-gas check: 1e5 / (1.380649e-23 × 76) = 9.530e19 cm⁻³   — agrees to 0.5 %
```

**Scale height [D]** — reproduces the fact sheet exactly, which confirms NASA computed
theirs with the _deep_ μ = 2.64 (i.e. including 2.3 % CH₄), not the H₂/He-only 2.31:

```
H = kT / (μ m_u g) = (1.380649e-23 × 76) / (2.64 × 1.66054e-27 × 8.69) = 27.5 km
```

The 150 km shell is therefore **5.4 scale heights**, topping out near a few mbar —
well into the stratosphere.

## U1 — H₂/He Rayleigh

```ts
{ scatter: [3.15e-3, 7.50e-3, 18.9e-3], absorb: [0, 0, 0],
  profile: { kind: 'exponential', scaleHeightKm: 27.7 },
  phase:   { kind: 'rayleigh' } }
```

**Cross sections [M/D].** H₂ from Dalgarno & Williams (1962), σ = (8.14e-13/λ⁴ +
1.28e-6/λ⁶ + 1.61/λ⁸) cm² with λ in Å — the standard giant-planet form, quoted in full
on the PDS Atmospheres Node's Rayleigh page:

| λ (nm) | σ_H₂ (cm²) | σ_He (cm²) | σ_CH₄ (cm²) |
| ------ | ---------- | ---------- | ----------- |
| 680    | 3.940e-28  | 2.603e-29  | 4.136e-27   |
| 550    | 9.377e-28  | 6.114e-29  | 9.974e-27   |
| 440    | 2.360e-27  | 1.506e-28  | 2.561e-26   |

He and CH₄ are [D], from
`σ = 24π³/(N_L² λ⁴) · ((n²−1)/(n²+2))² · K` with **K = 1 for both** — He is monatomic
and CH₄ is tetrahedral, so neither has a polarisability anisotropy and the King factor
is unity by symmetry, not by assumption. Refractivities at STP, 550 nm:
H₂ 1.3926e-4 (Peck & Hung 1977), He 3.4946e-5 (Mansfield & Peck 1969),
CH₄ 4.4637e-4 (Loria 1909).

The same formula applied to H₂ with a King factor of 1.02 gives 9.903e-28 at 550 nm,
**5.6 % above** Dalgarno & Williams at all three wavelengths. D&W is adopted; nothing
here rests on the H₂ depolarisation value.

**Mixture [D]** — `β = Σ xᵢ · N · σᵢ`, converting cm⁻¹ → km⁻¹ by ×1e5:

```
680:  0.825 × 9.581e19 × 3.940e-28 × 1e5 = 3.115e-3   (H₂)
    + 0.152 × 9.581e19 × 2.603e-29 × 1e5 = 0.0379e-3  (He)   = 3.15e-3 /km
550:  7.41e-3 + 0.089e-3 = 7.50e-3 /km
440: 18.65e-3 + 0.219e-3 = 18.87e-3 /km
```

He contributes 1.2 %. Ratio B/R = 5.99, **steeper than λ⁻⁴** (5.70) because of the
λ⁻⁶ and λ⁻⁸ terms.

Sanity: this is 0.54× Earth's `[5.8, 13.6, 33.1]e-3` despite 3.6× the number density —
H₂/He are much weaker scatterers per molecule than air. The current table's
`[4, 10, 20]e-3` is 25 % high in red/green and 6 % high in blue.

**CH₄'s own Rayleigh** is not zero and is not in this row — see U2.

_Confidence: high. Falsified by a measured H₂ Rayleigh cross section differing from
D&W by more than ~10 %, or by a revised He mole fraction (Sromovsky et al. 2011
argue for Y = 0.19–0.26 rather than the Voyager 0.262) — but He is a 1 % term, so a
He revision cannot move this row visibly._

## U2 — Methane, well-mixed absorber (the centrepiece)

```ts
{ scatter: [0.38e-3, 0.93e-3, 2.38e-3],      // CH₄'s own Rayleigh; [0,0,0] also defensible
  absorb:  [1.76e-3, 0.51e-3, 0.066e-3],
  profile: { kind: 'exponential', scaleHeightKm: 6.6 },
  phase:   { kind: 'rayleigh' } }
```

### The mixing ratio at the reference level is **not** the deep value

Irwin et al. (2022) Table 2 [M]: `Deep CH₄ mole fraction — Uranus 3 ± 1 %`, and
`Pressure p₂ — 1.4–1.5 bar`, that layer being "a layer of photochemical haze, trapped
in a layer of high static stability **at the methane condensation level at 1–2 bar**"
(abstract). Karkoschka & Tomasko (2009) give ~4 % at the equator falling to <2 % at the
poles.

The renderer's reference level is 1 bar, i.e. **above** the condensation level. Methane
there is saturation-limited, not well mixed. Clausius–Clapeyron from the CH₄ triple
point (90.694 K, 0.11696 bar) with ΔH_sub = 9.7 kJ/mol [D]:

```
p_sat(T) = 0.11696 · exp( −(9700/8.3145)(1/T − 1/90.694) )  bar
p_sat(76 K) = 9.73 mbar   →   x_sat(1 bar) = 0.97 %
```

**This curve is independently validated**: inverting it for the temperature at which a
3 % mole fraction first saturates at 1 bar total pressure gives T = 82.1 K, which on
the Uranus profile is ~1.5 bar — exactly Irwin's retrieved `p₂ = 1.4–1.5 bar`. The
condensation level falls out of the vapour-pressure curve rather than being fitted to it.

**n_CH₄ at the reference level [D]** = 0.0097 × 3.566 amagat = **0.0347 amagat**.

### The profile is _not_ the gas scale height

Above a saturated condensation level the CH₄ partial pressure follows p_sat(T(z)), not
the total pressure. With a tropospheric lapse of 0.75 K/km [L — assumed dry-adiabatic,
not read from a source]:

```
d ln p_sat/dz = −(ΔH_sub / (R T²)) · |dT/dz| = −(9700/(8.3145 × 76²)) × 0.75 = −0.1515 /km
H(CH₄ number density) = 1/0.1515 = 6.6 km          (vs 27.5 km for the gas)
H(CH₄ mole fraction)  = 1/(0.1515 − 1/27.5) = 8.7 km
```

So methane e-folds **4× faster than the gas**. This is the single most consequential
number in the note: methane lives in the bottom ~20 km of a 150 km shell. It is still
an `exponential` profile with `scatter` decoupled from `absorb` — exactly what the
redesign buys — but the scale height is methane's own, not the atmosphere's.

Above the tropopause (~0.1 bar, ~55 km) methane reverts to a fixed stratospheric mole
fraction, which Irwin et al. cap at ≤1e-4 for Uranus. A 6.6 km exponential has already
decayed to ~1e-4 of its base value by then, so it under-predicts the stratosphere by a
negligible absolute amount. The caricature is harmless in the direction it errs.

### Absorption coefficients — 680 nm sits in a **window**, not on a band

Karkoschka (1998), PDS `1995LOW.TAB` column 3, "Estimated methane absorption
coefficient in units of 1/km-amagat" [M]:

| λ (nm) | k (km-am)⁻¹ |
| ------ | ----------- |
| 680.0  | **0.0197**  |
| 550.0  | **0.0012**  |
| 440.0  | **0.0035**  |

Structure around the red reference wavelength, 5 nm bin means:

```
655–660  0.0816    675–680  0.0085   ←  the reference wavelength's neighbourhood
660–665  0.1155    680–685  0.0436
665–670  0.1618    685–690  0.0321
670–675  0.0629    695–700  0.1121
                   700–705  0.3192
                   725–730  3.7960
```

**680 nm falls in the local minimum between the 668 nm band and the 702/727 nm bands.**
k rises from 0.0053 at 678 nm to 0.061 at 683 nm — an order of magnitude across 5 nm.
Sampling monochromatically at 680 nm therefore understates the red channel by ~4×
relative to anything a camera or an eye integrates.

Note also that **k(440) > k(550)**: methane's visible absorption is not a smooth ramp.
Both are near the table's floor, though — of 250 samples in 400–500 nm, 64 are exactly
zero at the table's 1e-4 resolution and the median is 4.5e-4; the band mean is carried
almost entirely by the single weak 486 nm band (peak 0.0428).

**Band-averaged effective k [D].** For a banded absorber the right single-channel value
is the one that reproduces the band-mean transmission at the relevant column, so
`k_eff(u) = −ln( ⟨exp(−k(λ)·u)⟩_band ) / u` over rectangular RGB bands (R 600–700,
G 500–600, B 400–500 — an [L] band choice):

| column u (km-am) | R      | G      | B       |
| ---------------- | ------ | ------ | ------- |
| thin limit       | 0.0931 | 0.0179 | 0.00205 |
| 0.5              | 0.0882 | 0.0176 | 0.00204 |
| 2                | 0.0766 | 0.0171 | 0.00202 |
| **10**           | 0.0508 | 0.0147 | 0.00191 |
| 40               | 0.0298 | 0.0106 | 0.00161 |

The relevant columns for this shell [D]: vertical = n₀·H_CH₄ = 0.0347 × 6.6 =
**0.229 km-am**; limb slant = n₀·√(2πR·H) = 0.0347 × √(2π × 25 362 × 6.6) =
**35.6 km-am**. u = 10 is adopted as the single compromise. R:G:B = 27 : 7.7 : 1 —
that ratio, not the magnitude, is what makes the planet blue.

**β [D]** = k_eff × 0.0347 amagat = **[1.76e-3, 0.51e-3, 0.066e-3] /km**.

**CH₄'s Rayleigh [D]** — 0.0097 × 9.581e19 × σ_CH₄ × 1e5 = [0.384e-3, 0.927e-3,
2.380e-3], a 12 % addition to U1. Placed on this row rather than U1 because it shares
methane's profile, and because a constituent that both scatters and absorbs is the case
the new model exists to express. Setting it to `[0,0,0]` and adding 12 % to U1 instead
is equally defensible and slightly cheaper.

### [L] alternative — "deep methane" variant

If the limb needs to carry visibly more methane than physics allows above 1 bar:
`absorb: [3.19e-3, 1.13e-3, 0.17e-3]` at `scaleHeightKm: 27.7`, from x = 3 % (n =
0.107 amagat) and k_eff at u = 40. This is a **7× larger column** and gives a limb
slant of 224 km-am. It is the atmosphere as it exists _below_ the drawn sphere,
relocated above it. Tag it [L] if used; do not present it as derived.

_Confidence: high on the coefficients (primary table, and the same dataset lineage
Irwin et al. used), medium on the profile. Falsified by: a published CH₄ mole-fraction
profile at 1 bar differing much from 1 %; a measured tropospheric lapse rate far from
0.75 K/km (the 6.6 km scale height is inversely proportional to it); or a decision to
band-average over different RGB bands, which moves the red channel by up to 3×._

## U3 — Extended photochemical haze (Irwin's Aerosol-3)

```ts
{ scatter: [0.68e-3, 1.57e-3, 3.75e-3],
  absorb:  [0.027e-3, 0.025e-3, 0.26e-3],
  profile: { kind: 'exponential', scaleHeightKm: 55 },
  phase:   { kind: 'henyeyGreenstein', g: 0.06 } }
```

**Which layer, and why not a tent.** Irwin et al. (2022) place three aerosol layers on
Uranus. Two of them are **below the drawn sphere** and cannot appear in the shell at all:
Aerosol-1 (base 10 bar) and Aerosol-2 (`p₂ = 1.4–1.5 bar`). Only **Aerosol-3** —
"an extended layer of photochemical haze… extending from this level up through to the
stratosphere" — is in the shell. It is explicitly _not_ a discrete layer: Table 2's
caption states "the fractional scale height of the Aerosol-3 layer was fixed at 2.0",
i.e. it falls off twice as slowly as the gas. Hence `exponential`, not `tent`.

**Numbers [M from Irwin Table 2]:** `Opacity τ₃ (at 0.8 µm) = 0.03 ± 0.01`,
`Pressure p₃ = 1.6 bar (fixed)`, `Radius r₃ = 0.05 µm (fixed)`, real refractive index
1.4 (stated with a footnote in the combined-retrieval subsection), n_imag from Table 3 (Aerosol-3, "Mean 2" column): 1.48e-3 at
0.4 µm, 1.90e-4 at 0.5, 2.59e-4 at 0.7, 8.92e-4 at 0.8.

**Derivation [D]:**

```
aerosol scale height   H_a  = fsh × H = 2.0 × 27.5 = 55.1 km
extinction at the base β(1.6 bar, 0.8 µm) = τ₃ / H_a = 0.03 / 55.1 = 5.45e-4 /km
Mie (r=0.05 µm, m=1.4+8.92e-4i, x=0.393): Q_ext = 4.512e-3
  → n = 5.45e-4 / (π(0.05e-4 cm)² × 4.512e-3) / 1e5 = 1.537e4 cm⁻³
1 bar sits H·ln(1.6) = 12.9 km above the 1.6 bar base → density factor e^(−12.9/55.1) = 0.791
per channel, β = n · πr² · Q · 1e5 · 0.791 :
```

| λ   | x     | Q_sca    | Q_abs   | β_sca (/km) | β_abs (/km) | ϖ     | g     |
| --- | ----- | -------- | ------- | ----------- | ----------- | ----- | ----- |
| 680 | 0.462 | 7.089e-3 | 2.80e-4 | 0.676e-3    | 0.027e-3    | 0.962 | 0.040 |
| 550 | 0.571 | 1.643e-2 | 2.65e-4 | 1.568e-3    | 0.025e-3    | 0.984 | 0.061 |
| 440 | 0.714 | 3.935e-2 | 2.73e-3 | 3.754e-3    | 0.260e-3    | 0.935 | 0.095 |

(full Mie, not the Rayleigh limit; the two agree to 4 % here.)

**Honest observation:** at r = 0.05 µm this haze scatters as ~λ⁻⁴ with g ≈ 0.06 — it is
Rayleigh in everything but name, and Irwin et al. say so ("we assumed the same particle
size distribution… since the opacity of this component needs to fall as 1/λ⁴"). It adds
~21 % to U1 and could be folded into it without a visible difference. It is kept
separate only because Neptune's is genuinely different (see N3), and folding one but
not the other would hide that.

**No fourth constituent on Uranus.** Irwin et al. Fig. 18 caption: Aerosol-4 "is set to
zero opacity for the Uranus retrievals".

_Confidence: medium. τ₃ carries ±33 %; the paper itself calls Aerosol-3's n_imag
"less well constrained". Falsified by a retrieval placing this haze's opacity above
~0.1, which would make it, not Rayleigh, the shell's dominant scatterer._

---

# Neptune

Fact-sheet anchors [M]: equatorial radius (1 bar) 24 764 km; `Acceleration (eq., 1 bar)`
11.00 m/s²; `Temperature at 1 bar` 72 K; `Density at 1 bar` 0.45 kg/m³;
`Mean molecular weight` 2.53–2.69; `Scale height` 19.1–20.3 km; composition H₂ 80.0 %
(3.2), He 19.0 % (3.2), CH₄ 1.5 % (0.5). Seeded `radiusKm: 24622` is again the
volumetric mean.

**Number density [D]:** N = 0.45 / (2.61 × 1.66054e-27) = 1.038e20 cm⁻³ = **3.865 amagat**
(ideal-gas check 1.006e20, agrees to 3 %).
**Scale height [D]:** H = (1.380649e-23 × 72) / (2.61 × 1.66054e-27 × 11.00) = **20.9 km**,
inside the fact sheet's 19.1–20.3 range once μ's own range is allowed. The table's
existing 20 is correct; keep it. The 120 km shell is **5.7 scale heights**.

## N1 — H₂/He Rayleigh

```ts
{ scatter: [3.32e-3, 7.91e-3, 19.9e-3], absorb: [0, 0, 0],
  profile: { kind: 'exponential', scaleHeightKm: 20 },
  phase:   { kind: 'rayleigh' } }
```

[D], same cross sections as U1:

```
680: 0.800 × 1.038e20 × 3.940e-28 × 1e5 = 3.27e-3  +  He 0.051e-3 = 3.32e-3
550: 7.79e-3 + 0.121e-3 = 7.91e-3
440: 19.60e-3 + 0.297e-3 = 19.90e-3
```

Only 5 % above Uranus, because the higher number density is nearly cancelled by the
larger He fraction (He scatters 15× less than H₂ per molecule). **Molecular Rayleigh
is not why Neptune is bluer.** The current `[4, 9, 22]e-3` is 20 % high in red, 14 %
high in green, 11 % high in blue.

## N2 — Methane, well-mixed absorber

```ts
{ scatter: [0.18e-3, 0.42e-3, 1.09e-3],
  absorb:  [0.81e-3, 0.24e-3, 0.031e-3],
  profile: { kind: 'exponential', scaleHeightKm: 5.9 },
  phase:   { kind: 'rayleigh' } }
```

**Deep mole fraction [M]:** Irwin et al. (2022) Table 2 gives `7 ± 1 %` for Neptune
against `3 ± 1 %` for Uranus — the representative Neptune fit quoted in the text is 7.7 %. Karkoschka &
Tomasko (2011) and Irwin et al. (2019) give ~4 %; Irwin et al.'s own introduction
describes both planets as having "similar, high mole fractions of methane of ~4 %".
The 4–7 % spread is real disagreement in the literature; 7 % is used here because it is
the value from the same retrieval that supplies the aerosol structure, and mixing
retrievals would be worse.

**But at the reference level Neptune has _less_ methane than Uranus [D].** Neptune's
1-bar level is colder (72 K vs 76 K), so saturation caps it lower:

```
p_sat(72 K) = 0.11696 · exp( −1166.7 × (1/72 − 1/90.694) ) = 4.15 mbar → x_sat = 0.41 %
n_CH₄ = 0.0041 × 3.865 amagat = 0.0160 amagat        (Uranus: 0.0347)
```

Cross-check: 7 % would first saturate at 87.3 K, which on Neptune's profile is ~2.4 bar
— against Irwin's retrieved `p₂ = 2.0–2.1 bar`. Consistent within the lapse-rate
uncertainty, and it independently reproduces the fact that Neptune's condensation level
is _deeper_ than Uranus's.

Irwin et al. Table 2 also give `Tropopause CH₄ RH — Neptune 35 ± 5 %` (against 100 %
fixed for Uranus), i.e. Neptune's upper troposphere is **sub-saturated**. Using the
saturated value above is therefore an upper bound on Neptune's shell methane; applying
the 35 % humidity would drop it to ~0.14 %. Left at saturation as the less aggressive
of the two caricatures — flag it if the limb reads too red-absorbed.

**Profile [D]:** `d ln p_sat/dz = −(9700/(8.3145 × 72²)) × 0.75 = −0.1688 /km` →
**H_CH₄ = 5.9 km** (mole-fraction scale height 8.3 km).

**β [D]:** vertical column 0.0160 × 5.9 = 0.094 km-am; limb slant
0.0160 × √(2π × 24 622 × 5.9) = 15.3 km-am; k_eff at u = 10 = [0.0508, 0.0147, 0.00191]:

```
β_abs = [0.0508, 0.0147, 0.00191] × 0.0160 = [0.813e-3, 0.235e-3, 0.031e-3] /km
```

**CH₄ Rayleigh [D]:** 0.0041 × 1.038e20 × σ_CH₄ × 1e5 = [0.176e-3, 0.425e-3, 1.090e-3].

**[L] deep variant:** x = 7 % → n = 0.2705 amagat, `scaleHeightKm: 20`,
`absorb: [8.06e-3, 2.87e-3, 0.44e-3]` (k_eff at u = 40; limb slant would be 486 km-am).
Use only as a look dial.

_Confidence: high on the coefficients, medium-low on the abundance — the 4 % vs 7 %
disagreement is the largest unresolved input in this note. Falsified by any retrieval
of the CH₄ profile between 1 bar and the tropopause: this is the number to check first
if Neptune's limb reads wrong._

## N3 — Extended photochemical haze (Aerosol-3)

```ts
{ scatter: [0.15e-3, 0.35e-3, 0.84e-3],
  absorb:  [0.34e-3, 0.14e-3, 0.32e-3],
  profile: { kind: 'exponential', scaleHeightKm: 42 },
  phase:   { kind: 'henyeyGreenstein', g: 0.06 } }
```

[M from Irwin Table 2]: `τ₃ = 0.04 ± 0.01`, `p₃ = 1.6 bar (fixed)`, `r₃ = 0.05 µm`,
fsh 2.0. n_imag from Table 4 (Neptune, Aerosol-3, "Mean 2"): 8.23e-3 at 0.4 µm,
4.66e-3 at 0.5, 1.46e-2 at 0.7, 3.53e-2 at 0.8.

[D], same construction as U3: H_a = 2 × 20.9 = 41.7 km; β(base, 0.8 µm) = 0.04/41.7 =
9.59e-4 /km; Q_ext(0.8 µm) = 3.540e-2 → n = 3.45e3 cm⁻³; density factor at 1 bar 0.791.

| λ   | Q_sca    | Q_abs    | β_sca (/km) | β_abs (/km) | ϖ     | g     |
| --- | -------- | -------- | ----------- | ----------- | ----- | ----- |
| 680 | 7.091e-3 | 1.577e-2 | 0.152e-3    | 0.338e-3    | 0.310 | 0.040 |
| 550 | 1.643e-2 | 6.49e-3  | 0.352e-3    | 0.139e-3    | 0.717 | 0.061 |
| 440 | 3.929e-2 | 1.514e-2 | 0.842e-3    | 0.324e-3    | 0.722 | 0.095 |

**This is the one genuine per-body difference that lives inside the shell**: Neptune's
Aerosol-3 is 10–40× more absorbing than Uranus's, single-scattering albedo 0.31 in the
red against Uranus's 0.96. It is a dark, red-absorbing haze. It is _tempting_ to make
this the mechanism for Neptune's deeper blue — **don't**: Irwin et al.'s own colour
decomposition (Fig. 18, Column 4) says adding Aerosol-3 "can be seen to have little
effect". Report the difference, do not build the story on it.

_Confidence: low-medium. The paper describes Aerosol-3's n_imag as "less well
constrained", and Neptune's values are pinned mostly by 1.5–2.4 µm data extrapolated
into the visible. τ₃ carries ±25 %. Falsified by any independent visible-wavelength
constraint on this layer's single-scattering albedo._

## N4 — Detached methane-ice layer (Aerosol-4) — the `tent` case

```ts
{ scatter: [7.1e-3, 7.1e-3, 7.1e-3], absorb: [0, 0, 0],
  profile: { kind: 'tent', centerKm: 30, widthKm: 4.2 },
  phase:   { kind: 'henyeyGreenstein', g: 0.84 } }
```

Neptune only. [M from Irwin Table 2]: `p₄ = 0.2 bar (fixed)`, `τ₄ = 0.030 ± 0.005`,
`r₄ = 2.5 ± 0.5 µm`, Gaussian with fractional scale height fixed at 0.1. Abstract:
"a thin layer of micron-sized methane ice particles at ~0.2 bar". This is the discrete
layer the tent profile was built for — and unlike ozone on Earth, it is genuinely
detached, not a broad stratospheric bulge.

**Altitude [D].** Integrating `dz = H(T) d ln p` from 1 bar (72 K) to 0.2 bar with T
falling linearly in ln p toward 52 K at 0.1 bar:

```
z(0.2 bar) = ∫ H d ln p = 30.3 km    local H there = 16.8 km
```

**Width [D].** fsh 0.1 → Gaussian σ = 1.68 km. Matching the tent's area to the
Gaussian's (`densityTent` integrates to `widthKm`, a Gaussian to `√(2π)σ`):

```
widthKm = √(2π) × 1.68 = 4.21 km
peak β  = τ₄ / widthKm = 0.030 / 4.21 = 7.13e-3 /km
```

**Optical properties [D].** Mie for r = 2.5 µm, methane ice n = 1.30 + 0i [L — standard
visible value, source not opened]: x = 19.6–35.7, Q_ext = 1.85–2.59 with monodisperse
ripples and **no absorption**, so grey and conservatively scattering across the visible.
g = 0.83–0.87 → **0.84**. Irwin et al. concur, describing this layer: "they are effectively
conservatively forward-scattering at visible wavelengths, and thus they have very
little effect here".

⚠️ **Look risk.** A 4 km-thick layer at radius 24 622 km has a limb chord of ~910 km,
a ~100× slant enhancement, so τ at the limb reaches ~3. Physically that is a real
detached haze, but in the shell it will render as a bright thin ring around Neptune
that no reference image of Neptune shows at this contrast. Add it last, look at it, and
be prepared to drop it or halve `τ₄` as an [L] call. Irwin et al. also caution that
"since we discriminated against cloudy regions when we compiled our mean data sets, the
opacity we retrieve for the Aerosol-4 layer will of course be significantly less than a
true disc-average" — i.e. the honest error bar runs upward, not downward.

---

# The Uranus / Neptune colour difference

**What the literature actually claims.** Irwin et al. (2022), in the paragraph introducing
their modelled-colours figure (`fig:colour`), verbatim:

> "Since the scattering cross-section of the approximately micron-sized Aerosol-2
> particles is found to have a roughly white visible reflectivity spectrum, the higher
> opacity of the Aerosol-2 layer on Uranus also mostly explains why Uranus appears to
> have a paler blue colour to the human eye (to some more greenish) than Neptune."

and, in the same paragraph:

> "Then as we add the scattering effects of Aerosol-1, Aerosol-3 and Aerosol-4
> components the modelled appearances become paler, but it is not until we add in
> scattering from Aerosol-2 that the main colour difference manifests itself. **Why the
> Aerosol-2 layer on Uranus is thicker than that of Neptune is not clear.**"

and explicitly ruling out the methane explanation:

> "the difference in observed colour between Uranus and Neptune cannot be explained by
> just by the fact that we retrieve more methane in Neptune's atmosphere than Uranus's."

Their conclusions list: "The opacity of the 1–2-bar Aerosol-2 layer in Uranus's
atmosphere is found to be significantly thicker than that of Neptune by a factor of ~2".
Table 2: `τ₂ = 2.0–3.5` (Uranus) vs `1–2` (Neptune). The proposed cause is speculative
in the paper's own words — "Potentially, we suggest that perhaps the more dynamically
overturning atmosphere of Neptune is more efficient at clearing this haze layer through
methane condensation at its base".

**Why this cannot be expressed as a constituent.** Aerosol-2 sits at 1.4–1.5 bar
(Uranus) and 2.0–2.1 bar (Neptune). Both are **below 1 bar**, i.e. below the sphere the
renderer draws as opaque ground. The layer responsible for the colour difference is
outside the shell's domain by construction. Adding a "haze constituent on Uranus" to
express it would be putting a 1.5-bar layer above the 1-bar surface — a knowingly wrong
altitude, which is the same class of error the tent-at-zero was.

**A second, quantitative reason the shell cannot carry the blue [D].** The methane
column that produces the observed red absorption is the two-way path down to the 5–8 bar
reflecting level:

```
well-mixed x = 3 % above 8 bar, Uranus:  N = x·p/(μ m_u g) / n_amagat = 23.4 km-am
                                        two-way ≈ 47 km-am
this shell (above 1 bar), saturated:     vertical 0.23 km-am, two-way 0.46 km-am
```

**A factor of ~100.** The shell can supply ~1 % of the methane column that makes
Uranus blue. (It does better at the limb — 36 km-am slant — which is why the terminator
rim will read correctly while the disc will not.)

## Recommendation: put the difference in `groundAlbedo`, and measure it

Karkoschka (1998) tabulates the geometric albedo of both planets on the same nights as
the methane coefficients, in the same PDS file (columns 6 and 7). **[M]:**

| band               | Uranus | Neptune | U/N  |
| ------------------ | ------ | ------- | ---- |
| 680 nm (mono)      | 0.361  | 0.261   | 1.38 |
| 550 nm (mono)      | 0.617  | 0.552   | 1.12 |
| 440 nm (mono)      | 0.557  | 0.552   | 1.01 |
| **R 600–700 mean** | 0.333  | 0.251   | 1.33 |
| **G 500–600 mean** | 0.531  | 0.461   | 1.15 |
| **B 400–500 mean** | 0.578  | 0.574   | 1.01 |

The measurement says exactly what Irwin et al. say in words: the two planets have the
**same blue albedo** and differ progressively toward the red — Uranus is 33 % brighter
in R, 15 % in G, 1 % in B. "Paler and more greenish", quantified.

So the proposal is:

1. **Express the colour difference as `groundAlbedo`, tagged [M] against the table
   above** — `uranus: [0.33, 0.53, 0.58]`, `neptune: [0.25, 0.46, 0.57]`. Compare the
   current seeds `[0.6, 0.8, 0.82]` and `[0.3, 0.42, 0.75]`: Uranus's is far too bright
   and not blue enough; Neptune's green is too low. This is the honest home for the
   difference: it is a property of what lies below the drawn sphere, and that is
   precisely what `groundAlbedo` models.
   ⚠️ Geometric albedo ≠ Lambert ground albedo — it already contains the atmosphere's
   own scattering and the phase function. The **ratios** are the target; the absolute
   level must come out of the visual pass, and the shell's own contribution must be
   subtracted rather than double-counted. The spec already sends seed albedos to the
   backlog; this is the number to send with them.
2. **Do not** add a compensating haze constituent to Uranus's shell, and **do not**
   differentiate the CH₄ rows to fake it. §N2 shows the reference-level methane runs the
   _wrong way_ (Uranus 0.97 %, Neptune 0.41 %) — building the colour on methane would
   make Uranus the bluer planet.
3. **Do** keep U3 and N3 distinct, since Neptune's in-shell haze really is the more
   absorbing of the two (§N3) — but tag any tuning of them [L] and note that Irwin's own
   decomposition assigns them little colour weight.
4. If, after all that, the discs still do not read apart, the remaining knob is
   `exposure` — an [L] dial, and the honest one to move, because the underlying physics
   ("why is Uranus's Aerosol-2 thicker?") is unexplained in the literature and this
   renderer is not going to explain it.

---

# Proposed constituent lists

```ts
uranus: {
  planetRadiusKm: seededPlanet('uranus').radiusKm,
  atmosphereTopKm: seededPlanet('uranus').radiusKm + 150,
  constituents: [
    // [D] H2/He Rayleigh. Dalgarno & Williams (1962) sigma_H2 + Mansfield & Peck (1969)
    // sigma_He, at N(1 bar) = 3.566 amagat from the fact sheet's 0.42 kg/m3 and mu 2.64.
    // He is 1.2% of this. Ratio B/R = 6.0, STEEPER than lambda^-4 (D&W's l^-6/l^-8 terms).
    { scatter: [3.15e-3, 7.50e-3, 18.9e-3], absorb: [0, 0, 0],
      profile: { kind: 'exponential', scaleHeightKm: 27.7 },   // [M] NASA fact sheet; H = kT/(mu m g) = 27.5
      phase:   { kind: 'rayleigh' } },

    // [D] Methane. absorb from Karkoschka (1998) k, band-averaged over R/G/B at a 10 km-am
    // column, times n_CH4 = 0.0347 amagat. 680 nm alone sits in a WINDOW between the 668 and
    // 702 nm bands -- sampling it monochromatically understates red 4x. scatter is CH4's own
    // Rayleigh. The 6.6 km scale height is METHANE's, not the gas's: above the 1.4-1.5 bar
    // condensation level the vapour follows p_sat(T), which e-folds 4x faster than pressure.
    { scatter: [0.38e-3, 0.93e-3, 2.38e-3], absorb: [1.76e-3, 0.51e-3, 0.066e-3],
      profile: { kind: 'exponential', scaleHeightKm: 6.6 },
      phase:   { kind: 'rayleigh' } },

    // [D] Extended photochemical haze = Irwin+22 Aerosol-3 (tau 0.03 at 0.8 um, base 1.6 bar,
    // fsh 2.0, r 0.05 um, n = 1.4 + i n_imag). At that radius it scatters as lambda^-4 with
    // g = 0.06 -- Rayleigh in all but name; kept separate only because Neptune's differs.
    { scatter: [0.68e-3, 1.57e-3, 3.75e-3], absorb: [0.027e-3, 0.025e-3, 0.26e-3],
      profile: { kind: 'exponential', scaleHeightKm: 55 },
      phase:   { kind: 'henyeyGreenstein', g: 0.06 } },
  ],
  groundAlbedo: [0.33, 0.53, 0.58],   // [M] Karkoschka 1998 geometric albedo, RGB band means
}

neptune: {
  planetRadiusKm: seededPlanet('neptune').radiusKm,
  atmosphereTopKm: seededPlanet('neptune').radiusKm + 120,
  constituents: [
    // [D] Only 5% above Uranus: the higher number density (3.865 amagat) is nearly cancelled
    // by the larger He fraction. Molecular Rayleigh is NOT why Neptune is bluer.
    { scatter: [3.32e-3, 7.91e-3, 19.9e-3], absorb: [0, 0, 0],
      profile: { kind: 'exponential', scaleHeightKm: 20 },
      phase:   { kind: 'rayleigh' } },

    // [D] Methane, saturation-limited at n = 0.0160 amagat -- LESS than Uranus's 0.0347,
    // because Neptune's 1-bar level is 4 K colder. Neptune's deep abundance is the larger
    // (7 +/- 1% vs 3 +/- 1%, Irwin+22) but that reservoir is below the drawn sphere.
    { scatter: [0.18e-3, 0.42e-3, 1.09e-3], absorb: [0.81e-3, 0.24e-3, 0.031e-3],
      profile: { kind: 'exponential', scaleHeightKm: 5.9 },
      phase:   { kind: 'rayleigh' } },

    // [D] Aerosol-3, tau 0.04. 10-40x more ABSORBING than Uranus's (Irwin+22 Table 4):
    // single-scattering albedo 0.31 in the red vs Uranus's 0.96. Real, but Irwin's own colour
    // decomposition gives this layer little weight -- do not hang the U/N difference on it.
    { scatter: [0.15e-3, 0.35e-3, 0.84e-3], absorb: [0.34e-3, 0.14e-3, 0.32e-3],
      profile: { kind: 'exponential', scaleHeightKm: 42 },
      phase:   { kind: 'henyeyGreenstein', g: 0.06 } },

    // [D] Detached methane-ice layer at 0.2 bar (Irwin+22 Aerosol-4) -- the case the tent
    // profile exists for. Grey and conservative (Mie, r 2.5 um, n 1.30: no absorption,
    // g 0.84). LOOK RISK: the ~100x limb slant enhancement drives tau_limb to ~3, i.e. a
    // bright thin ring. Add last; halving tau is a defensible [L].
    { scatter: [7.1e-3, 7.1e-3, 7.1e-3], absorb: [0, 0, 0],
      profile: { kind: 'tent', centerKm: 30, widthKm: 4.2 },
      phase:   { kind: 'henyeyGreenstein', g: 0.84 } },
  ],
  groundAlbedo: [0.25, 0.46, 0.57],   // [M] Karkoschka 1998 geometric albedo, RGB band means
}
```

Neptune uses all four slots — `MAX_CONSTITUENTS = 4` is exactly consumed, with no
headroom. Worth knowing before Titan (spec: "3–4") lands.

## Eyeball gate

Two measured anchors to check the visual pass against, neither of them a tuning knob:

1. **Disc colour ratios** — Uranus should be ~1.33× Neptune in red, ~1.15× in green,
   ~1.00× in blue (Karkoschka 1998 geometric albedos). If Uranus and Neptune differ in
   the _blue_, something is wrong.
2. **The limb, not the disc, is where methane bites** — the shell carries ~1 % of the
   real disc methane column but ~70 % of a realistic limb column. A visibly
   methane-tinted disc means the [L] deep variant crept in.

---

# Could not verify

1. **H₂ King depolarisation factor.** Bridge & Buckingham (1966) not opened; K = 1.02
   was used only as a cross-check on Dalgarno & Williams (agreement 5.6 %), and the
   adopted row does not use it. He and CH₄ have K = 1 by symmetry, which needs no source.
2. **Karkoschka & Tomasko (2010).** Not opened. Karkoschka (1998) used instead, from the
   PDS archive. The claim that KT2010 ≈ K1998 below 1 µm rests on secondary summaries,
   not on the paper.
3. **CH₄ latent heat of sublimation, 9.7 kJ/mol.** Fray & Schmitt (2009) not opened;
   textbook value used. It is validated indirectly — the resulting curve reproduces
   Irwin et al.'s retrieved condensation pressures for _both_ planets (1.5 bar and
   2.4 bar vs retrieved 1.4–1.5 and 2.0–2.1) — but it is not a cited number.
4. **Tropospheric lapse rate 0.75 K/km.** Assumed dry-adiabatic; not read from any
   source. Both CH₄ scale heights are inversely proportional to it, so a lapse rate of
   0.5 K/km would give 9.9 / 8.8 km instead of 6.6 / 5.9 km. **The largest unforced
   assumption in the note.**
5. **Neptune's deep CH₄: 4 % or 7 %?** Irwin et al. (2022) Table 2 says 7 ± 1 %;
   Karkoschka & Tomasko (2011), Irwin et al. (2019) and Irwin et al.'s own introduction
   say ~4 %. Only matters for the [L] deep variant — the recommended rows use the
   saturation cap, which is independent of the deep value.
6. **Methane-ice real refractive index 1.30.** Standard visible value, source not opened.
   Only affects N4's Q_ext by a few per cent.
7. **Irwin's τ₃ convention.** Table 2's caption states the integration convention for
   τ₁ only. τ₃ is here read as the total column opacity of the Aerosol-3 layer, and
   `fsh` as multiplying the gas scale height to give the _particle number density_ scale
   height. Both are the standard NEMESIS readings but neither is stated in the paper.
8. **RGB band definitions.** R 600–700 / G 500–600 / B 400–500 are an [L] choice, not a
   colorimetric one. Because methane is banded, the red channel's effective k varies by
   3× across plausible band and column choices — this is the single largest numeric
   uncertainty in the methane rows, larger than any measurement error in k itself.
9. **Aerosol-3's imaginary refractive index.** Irwin et al. call it "less well
   constrained", and Neptune's visible values are extrapolated from 1.5–2.4 µm data.
   The 10–40× Uranus/Neptune contrast in §N3 should be treated as indicative.
10. **Why Uranus's Aerosol-2 is thicker.** Unexplained in the literature — Irwin et al.:
    "Why the Aerosol-2 layer on Uranus is thicker than that of Neptune is not clear."
    No derivation is offered here either.
