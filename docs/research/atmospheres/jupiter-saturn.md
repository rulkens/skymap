# Jupiter and Saturn — atmosphere constituents

Stage-2 research for [`docs/superpowers/specs/2026-08-18-atmosphere-constituents-design.md`](../../superpowers/specs/2026-08-18-atmosphere-constituents-design.md).

Conventions used throughout:

- RGB reference wavelengths **680 / 550 / 440 nm**, matching the Pluto row.
- Coefficients in **1/km at altitude 0**, where altitude 0 is the drawn radius: Jupiter
  **71 492 km**, Saturn **60 268 km**. Both are the equatorial 1-bar radii, so altitude 0 = the
  1-bar level; these are cloud-tops-as-ground bodies with no solid surface underneath.
- Shell tops unchanged: Jupiter +150 km, Saturn +300 km.
- Tags: **[M]** published value quoted with its source · **[D]** computed here, arithmetic shown ·
  **[L]** a choice no measurement pins.

**Headline: the two rows did need changing, and not where you would guess.** The Mie scale
heights are already right (Saturn's 25 km is the _measured_ particle scale height). What is wrong
is that both `rayleighScatter` vectors are essentially grey — Jupiter `[4, 4, 5]e-3`, Saturn
`[4, 4, 4]e-3` — when H₂/He Rayleigh is the one term in this whole table that is derivable from
first principles with no free parameters, and it is steeply λ⁻⁴. The correct vectors are
`[1.62, 3.85, 9.68]e-3` and `[2.18, 5.18, 13.0]e-3`. Both rows' `mieAbsorption` is also far too
high — Jupiter's should be zero (its haze is measured as conservatively scattering), Saturn's
4–20× smaller and per-channel.

## Sources actually opened

Every number below traces to one of these. Nothing is cited that was not read.

| Source                                                                                                                                                                                                                                                                                                                                                                                                                             | What it gave                                                                                                                                                                                                                                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| [refractiveindex.info — H₂, Peck & Huang (1977), _JOSA_ **67**, 1550](https://refractiveindex.info/?book=H2&page=Peck)                                                                                                                                                                                                                                                                                                             | H₂ dispersion `n−1 = 0.0148956/(180.7−λ⁻²) + 0.0049037/(92−λ⁻²)`, λ in µm, at 273.15 K / 101 325 Pa, valid 0.168–1.695 µm                                                                                                                                                                                                     |
| [refractiveindex.info — He, Mansfield & Peck (1969), _JOSA_ **59**, 199](https://refractiveindex.info/?shelf=main&book=He&page=Mansfield)                                                                                                                                                                                                                                                                                          | He dispersion `n−1 = 0.01470091/(423.98−λ⁻²)`, λ in µm, same conditions, valid 0.480–2.06 µm                                                                                                                                                                                                                                  |
| Karkoschka & Tomasko (2010), "Methane absorption coefficients for the jovian planets from laboratory, Huygens, and HST data", _Icarus_ — band-model tables as distributed by P. Irwin, [`ktables/ch4_karkoschka_IR.par.gz`](https://users.ox.ac.uk/~atmp0035/ktables/ch4_karkoschka_IR.par.gz) and [`ch4_karkoschka_vis.par.gz`](https://users.ox.ac.uk/~atmp0035/ktables/ch4_karkoschka_vis.par.gz) (files downloaded and parsed) | CH₄ absorption coefficients in **(km-amagat)⁻¹** at 100 / 198 / 296 K, 5 cm⁻¹ sampling, 400–5000 nm. File header states the units and the column order verbatim                                                                                                                                                               |
| Guillot, Fletcher, Helled, Ikoma, Line & Parmentier, "Giant Planets from the Inside-Out" — _Protostars and Planets VII_ chapter, [arXiv:2205.04100](https://arxiv.org/abs/2205.04100) — Table 2                                                                                                                                                                                                                                    | Jupiter He/H = (7.88 ± 0.16)×10⁻² (Galileo), C/H = (1.19 ± 0.28)×10⁻³ (Galileo/GPMS); Saturn He/H = 2.87×10⁻², 6.20×10⁻², 2.75×10⁻² from three different Cassini analyses; C/H = (2.50 ± 0.11)×10⁻³ (Cassini/CIRS)                                                                                                            |
| Gupta, Atreya, Steffes et al. (2022), "Jupiter's Temperature Structure: A Reassessment of the Voyager Radio Occultation Measurements", [arXiv:2205.12926](https://arxiv.org/abs/2205.12926)                                                                                                                                                                                                                                        | "the Galileo probe value of **166.1 ± 0.8 K**" at 1 bar; their adopted composition x(H₂)=0.8623008, x(He)=0.1356166, x(CH₄)=0.0020437; mean molecular mass 2.3151                                                                                                                                                             |
| Achterberg & Flasar (2020), _PSJ_ **1**, 30, [doi:10.3847/PSJ/ab9cb6](https://doi.org/10.3847/PSJ/ab9cb6)                                                                                                                                                                                                                                                                                                                          | Saturn He/H₂ = 0.04–0.075, Y = 0.075–0.13; their Table 2 of prior determinations (Voyager IRIS 0.034 ± 0.024; Conrath & Gautier 2000 0.11–0.16; VIMS 0.055; UVIS/CIRS 0.10–0.15)                                                                                                                                              |
| Braude, Irwin, Orton & Fletcher (2020), _Icarus_ **338**, 113589, [arXiv:1912.00918](https://arxiv.org/abs/1912.00918) — Tables 3 and 4                                                                                                                                                                                                                                                                                            | Jupiter chromophore k_c(λ): 0.033 (450), 0.016 (550), 0.0077 (650), 0.0081 (700 nm); chromophore at 0.7 ± 0.1 bar (belts), 0.2 ± 0.1 bar (GRS); haze r_h = 0.47 ± 0.03 µm; cloud n = 1.42, r_n = 1 µm, k_n ≈ 10⁻⁹ (conservative); total chromophore column (6.3 ± 0.3)×10⁻⁵ g/cm², total cloud+haze column (9 ± 1)×10⁻³ g/cm² |
| Sanz-Requena, Pérez-Hoyos, Sánchez-Lavega, del Río-Gaztelurrutia & Irwin (2019), "Hazes and Clouds in a Singular Triple Vortex in Saturn's Atmosphere from HST/WFC3 multispectral imaging", [arXiv:1905.11301](https://arxiv.org/abs/1905.11301) — Table 1 and §3 (the preprint carries no journal reference; the volume/page are not asserted here)                                                                               | Saturn stratospheric haze 1–100 mbar, τ_str = 0.01 ± 0.01 at 900 nm, r_eff 0.1 µm; tropospheric haze base 600 ± 100 mbar, **particle scale height H = 25 ± 5 km**, τ_trop = 10 ± 5, r_eff = 1.5 ± 0.5 µm, m_r = 1.43, m_i ≈ 10⁻³; gas scale height "≈ 38 km" at that level; ammonia cloud 1.0–1.4 bar                         |
| Mallama, Krobusek & Pavlov (2017), _Icarus_ **282**, 19, [arXiv:1609.05048](https://arxiv.org/abs/1609.05048) — Table 7                                                                                                                                                                                                                                                                                                            | Johnson-Cousins geometric albedos. Jupiter U 0.358 · B 0.443 · V 0.538 · R 0.495 · R_C 0.513. Saturn U 0.203 · B 0.339 · V 0.499 · R 0.568 · R_C 0.646                                                                                                                                                                        |
| [JPL SSD, Planetary Physical Parameters](https://ssd.jpl.nasa.gov/planets/phys_par.html)                                                                                                                                                                                                                                                                                                                                           | Equatorial radii 71 492 ± 4 km and 60 268 ± 4 km (Archinal et al. 2018); masses 1898.125×10²⁴ and 568.317×10²⁴ kg                                                                                                                                                                                                             |
| "Fully illuminated Jupiter disk albedo and limb darkening observed by DSCOVR-EPIC from the Earth–Sun Lagrange-1 orbit" (2025), _Front. Remote Sens._, [doi:10.3389/frsen.2025.1685883](https://doi.org/10.3389/frsen.2025.1685883) — Table 1 (author list not read)                                                                                                                                                                | Jupiter fully-illuminated disk maximum albedo per DSCOVR-EPIC band: **0.682 at 443 nm, 0.779 at 551 nm, 0.861 at 680 nm**                                                                                                                                                                                                     |

Not opened, and therefore not cited as support anywhere below: von Zahn et al. (1998) (paywalled —
its 0.1359 He mole fraction is reached instead through Guillot et al.'s Table 2), Seiff et al.
(1998), Lindal et al. (1985), West et al. (1986, 2004), Karkoschka (1994, 1998) originals,
Sromovsky & Fry.

## Shared derivations

### Effective gravity at the drawn radius [D]

Neither body's "surface gravity" is the number that sets the scale height: the shell sits at the
equator of a fast rotator, so both the J₂ figure term and the centrifugal term matter.

```
g_eff = (GM/R²)(1 + 3/2 · J₂) − ω²R          (equator, r = R_eq)

Jupiter  GM = G·1.898125e24 kg   = 1.26685e17 m³/s²   (JPL mass × G = 6.67430e-11)
         GM/R² = 1.26685e17 / (7.1492e7)²  = 24.787 m/s²
         ×(1 + 1.5·0.014736)     = 25.334
         ω = 2π/(9.9250 h)       = 1.75857e-4 rad/s ;  ω²R = 2.211
         g_eff                   = 23.124 m/s²

Saturn   GM = G·5.68317e26 kg    = 3.79312e16 m³/s²
         GM/R² = 3.79312e16 / (6.0268e7)²  = 10.443 m/s²
         ×(1 + 1.5·0.016298)     = 10.698
         ω = 2π/(10.656 h)       = 1.63783e-4 rad/s ;  ω²R = 1.617
         g_eff                   =  9.081 m/s²
```

The GM/R² values reproduce the 24.79 and 10.44 m/s² that the NASA fact sheets label "equatorial
gravity", which confirms the mass and radius inputs. J₂ and the rotation periods are standard IAU
values I did **not** open a source for this session — see "Could not verify". Saturn's rotation
period is itself contested (Voyager 10ʰ39ᵐ vs Cassini ring-seismology 10ʰ33ᵐ); using the shorter
period moves g_eff by 0.03 m/s², i.e. 0.3 %, so nothing below depends on it.

### Rayleigh cross sections [D]

Standard form, with the Lorentz–Lorenz factor expanded for a dilute gas:

```
σ(λ) = (32π³/3) · (n−1)²_ref · F_K / (N_L² λ⁴)          N_L = 2.6867811e25 m⁻³
```

Evaluated per species at the three reference wavelengths (refractivities from the two
refractiveindex.info formulae above; CH₄ from its polarizability, see below):

| λ      | n−1 (H₂)   | σ_H₂ (m²) | n−1 (He)   | σ_He (m²) | σ_CH₄ (m²) |
| ------ | ---------- | --------- | ---------- | --------- | ---------- |
| 680 nm | 1.38016e-4 | 4.163e-32 | 3.48525e-5 | 2.603e-33 | 4.343e-31  |
| 550 nm | 1.39257e-4 | 9.904e-32 | 3.49472e-5 | 6.115e-33 | 1.033e-30  |
| 440 nm | 1.41330e-4 | 2.490e-31 | 3.51023e-5 | 1.506e-32 | 2.598e-30  |

- **King factors.** He is monatomic, F_K = 1 exactly. CH₄ is a spherical top, F_K = 1. For H₂ I
  used **F_K = 1.02** — this is the one input below I could not pin to an opened source (see
  "Could not verify"). Much of the exoplanet literature simply sets F_K(H₂) = 1; doing so lowers
  every Rayleigh number below by 1.7 %, which is smaller than the temperature and composition
  uncertainties. Tag it **[L]** if you want it tagged honestly.
- **CH₄ refractivity [D].** Peck & Huang / Mansfield & Peck have no methane counterpart I opened,
  so n−1 comes from the polarizability volume α′ = 2.593e-30 m³ via n−1 = 2πN_Lα′ = 4.378e-4,
  scaled by 1.028 to the visible (the same static-vs-visible ratio that H₂ shows between its
  polarizability 0.8023e-30 m³ and Peck & Huang's 550 nm value) → **4.50e-4**, no dispersion.
  Methane carries only 2.4 % (Jupiter) / 5.1 % (Saturn) of the molecular scattering, so a 5 %
  error here is a 0.25 % error in the answer.

### Limb geometry [D]

For an exponential atmosphere the tangential optical depth at altitude 0 is
τ_slant = β(0)·√(2πRH). This is the number that decides whether a constituent is visible at all,
because the shell is only ever _seen_ edge-on.

```
Jupiter  √(2π · 71492 · 25.79) = 3404 km   →  132× the vertical column
Saturn   √(2π · 60268 · 54.75) = 4553 km   →   83× the vertical column
```

Both shells are thick enough to contain that path. The half-chord through the shell at grazing
incidence is √(2R·t) = 4631 km (Jupiter) and 6013 km (Saturn), which is 3.4σ and 3.3σ of the
Chapman integrand's width √(RH) — so **>99.9 % of the limb column is inside the shell**. The
150 km and 300 km tops are 5.8 H and 5.5 H; they are not the reason anything is missing.

### Mie calculations

Every Q_ext / ω / g below comes from a Bohren & Huffman Mie code written for this note (D_n by
downward recurrence, ψ_n and χ_n from `scipy.special.spherical_jn/yn` — the usual upward ψ
recurrence loses all precision below x ≈ 1 and silently inflates Q_sca by an order of magnitude).
Validated against three published cases before use:

| case                               | published          | this code   |
| ---------------------------------- | ------------------ | ----------- |
| x = 0.099, m = 0.75 (van de Hulst) | Q_sca = 7.41786e-6 | 7.417859e-6 |
| x = 0.101, m = 0.75 (van de Hulst) | Q_sca = 8.03354e-6 | 8.033538e-6 |
| x = 5.213, m = 1.55 (BHMIE test)   | Q_ext = 3.10543    | 3.10500     |

and against the textbook asymmetry parameter of visible-wavelength water cloud droplets
(r = 10 µm, m = 1.333 → g = 0.863; r = 20 µm → 0.872; expected 0.85–0.87).

---

# Jupiter

## 1. H₂/He Rayleigh

### Composition and state

- x(He) = 0.1356, x(CH₄) = 0.002044, x(H₂) = 0.862356 **[M]**. Guillot et al. Table 2 give
  He/H = (7.88 ± 0.16)×10⁻² from Galileo; with H carried as H₂ that is He/H₂ = 0.1576, mole
  fraction 0.1361 — and Gupta et al. adopt exactly 0.1356166 / 0.0020437 as their working
  composition, which is what I used. C/H = (1.19 ± 0.28)×10⁻³ **[M]** gives CH₄/H₂ = 2.38e-3,
  mole fraction 2.05e-3, consistent with Gupta's number to 0.1 %.
- T(1 bar) = **166 K [M]**: "the Galileo probe value of 166.1 ± 0.8 K" (Gupta et al.). Their own
  Voyager-1 reanalysis lands at 165.2–170.8 K depending on the assumed NH₃, so ±3 K is the honest
  spread. It is a _single_ entry site at the edge of a 5-µm hot spot, not a global mean.
- μ = 0.862356·2.01588 + 0.1356·4.002602 + 0.002044·16.0425 = **2.3139 g/mol [D]** (Gupta's
  2.3151, reproduced).
- N(1 bar) = P/kT = 1e5 / (1.380649e-23 · 166) = **4.3632e25 m⁻³** = 1.6240 amagat **[D]**.

### Scale height

```
H = kT / (μ·m_u·g_eff)
  = (1.380649e-23 · 166) / (2.3139 · 1.66054e-27 · 23.124)
  = 2.29188e-21 / 8.88554e-26
  = 25 793 m
```

**H = 25.8 km [D].** The table's 27 km is 4.7 % high; it corresponds to μ ≈ 2.21, i.e. the
pre-Galileo He abundance still printed on the NASA fact sheet (10.2 % He). Sensitivity: T = 160 K
→ 24.9 km, T = 170 K → 26.4 km. **Recommend 25.8 km; keeping 27 would also be defensible.** This
is the smallest of the changes proposed here.

### Coefficients

β = N · Σᵢ xᵢσᵢ, converted to 1/km:

| λ      | σ_mix (m²) | H₂ / He / CH₄ share | **β (1/km)** | τ_vert | τ_slant |
| ------ | ---------- | ------------------- | ------------ | ------ | ------- |
| 680 nm | 3.7142e-32 | 96.7 / 1.0 / 2.4 %  | **1.62e-3**  | 0.042  | 5.5     |
| 550 nm | 8.8306e-32 | 96.7 / 0.9 / 2.3 %  | **3.85e-3**  | 0.099  | 13.1    |
| 440 nm | 2.2186e-31 | 96.8 / 0.9 / 2.3 %  | **9.68e-3**  | 0.250  | 33.0    |

_Sanity check that this is not nonsense:_ τ_vert(550) = 0.099. "Rayleigh optical depth above
Jupiter's cloud tops is about a tenth in the green" is the number every giant-planet cloud-retrieval
paper works with, and it falls out here with no tuning. Note also that helium is a **1 %** effect —
its cross section is 1/16 of H₂'s — so the whole He-abundance controversy is irrelevant to this
constituent and matters only through μ, i.e. through the scale height.

**Current row `[4e-3, 4e-3, 5e-3]` is wrong in the way the spec predicted for the other bodies:
it is grey.** It is 2.5× too high in red and 1.9× too low in blue, and the red:blue ratio is
inverted (0.8 where physics says 0.17). Proposed:

```
scatter: [1.62e-3, 3.85e-3, 9.68e-3]   absorb: [0,0,0]
profile: exponential(25.8)             phase: rayleigh
```

**Confidence: high.** Every input is either a measured composition or a closed-form dispersion
relation. Falsified by: a different 1-bar temperature (±3 K → ∓2 % on β), or F_K(H₂) ≠ 1.02
(±2 %). Nothing plausible moves it by more than 5 %.

## 2. Aerosol — the haze above the cloud tops

### What the constituent is, and is not

The renderer draws Jupiter's cloud deck as the _sphere_, from a texture. So this constituent must
be only the aerosol **above** the drawn radius, not the deck. Braude et al.'s retrieval puts the
main cloud base at 1.4 ± 0.3 bar — below altitude 0 — with a separate haze population above
0.15 bar (h = 25.8·ln(1/0.15) = 49 km). The 150 km shell reaches P = 1 bar·e⁻⁵·⁸² = 3 mbar, so it
spans the top of the cloud and the whole upper haze.

### Scale height [D]

Sanz-Requena et al. measure Saturn's haze particle-to-gas scale height ratio as
H_aerosol/H_gas = 0.7 ± 0.1. No equivalent number for Jupiter is in anything I opened, so apply
that ratio to Jupiter's gas scale height at the ~0.5 bar level where the haze lives (T ≈ 130 K →
H_gas = 25.8·130/166 = 20.2 km):

```
H_a = 0.7 · 20.2 = 14.1 km
```

**H_a ≈ 14 km [D, on a borrowed ratio].** The table's 12 km is within that uncertainty; there is
no case for changing it.

### Phase function [D]

Mie asymmetry parameter for Braude et al.'s **measured** haze radius r_h = 0.47 ± 0.03 µm at
n = 1.40, gamma size distribution:

| λ      | Q_ext | g (v_eff 0.05) | g (v_eff 0.3) |
| ------ | ----- | -------------- | ------------- |
| 680 nm | 3.51  | 0.796          | 0.762         |
| 550 nm | 3.64  | 0.788          | 0.758         |
| 440 nm | 3.20  | 0.750          | 0.750         |

The larger cloud particles (r_n = 1 µm, n = 1.42) give g = 0.67 (680 nm) to 0.75 (440 nm). Both
populations land in the same place: **g = 0.75 [D]**, against the table's 0.6. Every candidate
radius from 0.47 to 1.5 µm at a jovian refractive index sits at x ≳ 4, which is past the knee of
the g(x) curve.

Take the Pluto row's warning seriously here: HG has to match the _height_ of the forward lobe, not
merely lean forward, so raising g from 0.6 to 0.75 concentrates more flux into the forward
direction and will brighten the crescent-phase rim. If the rim gets too hot, cut `scatter`, do not
walk g back to a value the particle size does not support.

### Scattering and absorption

**Scatter: [3.0e-3, 3.0e-3, 3.0e-3] — unchanged [L].** There is no measurement in anything I
opened that pins the aerosol column above 1 bar (Braude's τ profiles are retrieved per
pressure-grid point, and his tabulated columns are totals dominated by the sub-1-bar deck). What
_is_ pinned is the constraint the value must satisfy: τ_slant = 3.0e-3 · √(2π·71492·14) = **7.5**,
i.e. the rim is already optically thick, and comparable to Rayleigh's 5.5–33. Any value in
2–6e-3 gives the same picture; below ~1e-3 the rim becomes pure Rayleigh blue, above ~1e-2 it goes
grey and the Rayleigh work is wasted. Leave it.

**Absorb: [0, 0, 0] — changed from 1e-3 [M].** Braude et al. retrieve the cloud and haze as
conservatively scattering, k_n(λ) ≈ 10⁻⁹ _at all wavelengths_. The table's `mieAbsorption: 1e-3`
against `mieScatter: 3e-3` implies ω = 0.75, which is a grossly absorbing aerosol and is why
Jupiter's rim currently cannot hold colour. Jupiter's aerosol is white. **All of Jupiter's colour
is chromophore, and the chromophore is in the texture (§3).**

**Confidence: medium on scatter (it is a look dial with a stated bracket), high on absorb ≈ 0
(directly measured).** Falsified by: any retrieval that finds ω < 0.99 for Jupiter's upper
tropospheric haze at continuum wavelengths.

## 3. Chromophores — recommend NO constituent

The unidentified red compound is real, it is in the shell's altitude range, and it should still not
get a slot. Three reasons, in descending order of force.

**(a) A whole-disc uniform chromophore would black out the limb.** From Braude et al.'s tabulated
column abundance (6.3 ± 0.3)×10⁻⁵ g/cm² and k_c(λ), with r_c = 0.05 µm, n_c = 1.42 and
ρ = 1000 kg/m³ **[D]**:

```
N_col = 6.3e-4 kg/m² / (4/3 π (5e-8 m)³ · 1000 kg/m³) = 6.3e-4 / 5.236e-19 = 1.203e15 m⁻²
Mie at x = 2πr/λ, m = 1.42 + i·k_c:
  680 nm  x=0.462  Q_ext=0.0163  Q_abs=0.0086  →  τ_vert,ext = 0.15  τ_vert,abs = 0.08
  550 nm  x=0.571  Q_ext=0.0401  Q_abs=0.0221  →  τ_vert,ext = 0.38  τ_vert,abs = 0.21
  440 nm  x=0.714  Q_ext=0.1068  Q_abs=0.0637  →  τ_vert,ext = 1.01  τ_vert,abs = 0.60
  890 nm  x=0.353  Q_ext=0.0092  Q_abs=0.0066  →  τ_vert,ext = 0.09
```

Cross-check on the 890 nm row: Braude's own tabulated peak of 1.03 optical-depth-per-bar over a
Gaussian of FWHM 0.25 pressure scale heights at 0.6 bar integrates to 1.03 · 0.15 · 1.065 = **0.16**,
against my 0.09 — a factor 1.8, which is exactly what an assumed grain density of 1000 rather than
~550 kg/m³ would produce. Normalising the column to Braude's own τ(890) instead of guessing a
density scales every row above by 1.8: τ_vert,ext(440) = 1.9, τ_vert,abs(440) = 1.1. Both routes
land at **order unity in the vertical, in the blue**.

At the limb that layer — only 0.25 pressure scale heights thick — is enhanced by
√(2πR/H_layer) = √(2π·71492/6.45) ≈ **264×**, so τ_slant,abs(440) is 160–290. It would not tint
the rim, it would delete it. (These are the GRS-fit numbers, the chromophore-richest place on the
planet; a belt/zone average is smaller. The conclusion does not depend on the factor.)

**(b) It is a banded pattern, and the texture already carries it at full resolution.** Braude et
al. retrieve the chromophore at 0.7 ± 0.1 bar in the belts and 0.2 ± 0.1 bar in the GRS — i.e. its
altitude _and_ its abundance are longitude- and latitude-dependent. A `constituents[]` entry is
spherically uniform by construction. Rendering a banded absorber as a uniform shell converts
Jupiter's most recognisable feature into a flat brown wash.

**(c) It would double-count.** The surface texture is a photograph of a planet already seen
through its own chromophore. Adding the absorber again multiplies the same optical depth in twice.
DSCOVR-EPIC measures Jupiter's disc reflectivity as 0.682 / 0.779 / 0.861 at 443 / 551 / 680 nm —
that red-rising ramp _is_ the chromophore, and it is already in the image the renderer samples.
(This same caution applies, weakly, to the aerosol `scatter` term on both bodies: it is why §2
keeps the existing value rather than raising it to the full published haze optical depth.)

**Recommendation: no chromophore constituent. Jupiter's colour stays in the texture; the shell
carries only the gas and a white haze.** Revisit only if the renderer ever grows a per-latitude
constituent modulation, which is not on the roadmap.

## 4. Methane — small enough to skip on Jupiter

Methane is well-mixed and does absorb in the red. The question is whether it clears the noise
floor over a 150 km rim. On Jupiter it lands just below it.

CH₄ column above 1 bar **[D]**: N_col = P/(μ m_u g) = 1e5/(2.3139·1.66054e-27·23.124) =
1.1255e30 m⁻² total; × x(CH₄) = 2.301e27 m⁻² = 2.301e27/2.6868e28 = **0.0856 km-amagat**. Slant
(×132) = **11.3 km-am**.

Absorption coefficients read from the Karkoschka & Tomasko table at 100 K (the closest tabulated
temperature to Jupiter's 110–166 K upper troposphere, and the largest of the three at 680 nm):

| λ      | k, monochromatic | k, mean over ±10 nm | k, mean over the RGB-ish band |
| ------ | ---------------- | ------------------- | ----------------------------- |
| 680 nm | 0.0294           | 0.0443              | 0.104 (600–700 nm)            |
| 550 nm | 0.0017           | 0.0402              | 0.021 (500–600 nm)            |
| 440 nm | 0.0018           | 0.00057             | 0.0012 (400–500 nm)           |

_Validation of the table's meaning_ (it is a raw k-table, not a paper): the same file gives
k(619 nm) = 0.695, k(727 nm) = 4.45, k(889 nm) = 21.7 — Cassini ISS's three methane filters, in
the right order of strength — and k(635 nm) ≈ 0.13, k(750 nm) = 0.0247, the two filters ISS uses as
_continuum_. 680 nm sits in the same kind of window.

β_CH₄(0) = k · (CH₄ amagat density at 1 bar) = k · 1.6240 · 0.002044 = k · 3.320e-3:

| λ      | β (1/km) | τ_slant | as a fraction of Rayleigh | ω of the gas alone |
| ------ | -------- | ------- | ------------------------- | ------------------ |
| 680 nm | 9.76e-5  | 0.33    | **6.0 %**                 | 0.943              |
| 550 nm | 5.6e-6   | 0.02    | 0.1 %                     | 0.999              |
| 440 nm | 6.0e-6   | 0.02    | 0.1 %                     | 0.999              |

**Verdict: skip it on Jupiter — but this is a judgement call, not a null result.** 6 % of the red
extinction and 0.1 % of the other two is below the level at which anything else in this row is
calibrated: the aerosol `scatter` next to it is an [L] with a factor-2 bracket, so a 6 % term
cannot be eye-gated against anything. In absolute terms it is not zero — τ_slant = 0.33 removes
28 % of the longest red sight-line. If a reviewer prefers physics-completeness over slot economy,
add it (Jupiter uses only two of four slots) with

```
scatter: [0,0,0]   absorb: [9.8e-5, 5.6e-6, 6.0e-6]   profile: exponential(25.8)
```

and nothing else in the row needs to move. The Saturn analysis (§4 there) is where the same term
becomes unambiguous.

Two caveats stated rather than buried:

- If the red channel is thought of as a _band_ rather than a delta function at 680 nm, methane
  gets stronger fast: ±10 nm → 9 % of Rayleigh, 600–700 nm → 21 %. The 727 nm band is the reason.
  The spec's convention is monochromatic reference wavelengths, so the 6 % number is the one that
  applies — but a future move to spectral rendering would flip this verdict.
- Band-averaging a k-distribution linearly overestimates absorption, so the ±10 nm and wide-band
  columns are upper bounds.

---

# Saturn

## 1. H₂/He Rayleigh

### Composition and state

Saturn's helium abundance is **genuinely unsettled and this is not a hedge**. Achterberg & Flasar's
Table 2, plus Guillot et al.'s Table 2, list five Cassini/Voyager determinations that do not
overlap:

| Determination                                     | He/H₂                 | x(He)       |
| ------------------------------------------------- | --------------------- | ----------- |
| Voyager IRIS, Conrath et al. (1984)               | 0.034 ± 0.024         | 0.033       |
| Voyager IRIS reanalysed, Conrath & Gautier (2000) | 0.11–0.16             | 0.10–0.14   |
| Cassini VIMS, Sromovsky et al. (2016)             | 0.055 (−0.015/+0.010) | 0.052       |
| Cassini UVIS+CIRS, Koskinen & Guerlet (2018)      | 0.10–0.15             | 0.09–0.13   |
| Cassini CIRS, Achterberg & Flasar (2020)          | 0.04–0.075            | 0.038–0.070 |

I adopted **x(He) = 0.08 [L]** as a midpoint of the modern Cassini set, and quantify the swing
below rather than pretending it is settled. x(CH₄) = 0.0047 **[M]**: Guillot et al. give
C/H = (2.50 ± 0.11)×10⁻³ → CH₄/H₂ = 5.0e-3 → mole fraction 4.6e-3; Fletcher et al. (2009)'s
(4.7 ± 0.2)×10⁻³ is the same number and is the one usually quoted.

T(1 bar) = **134 K [M-ish]**, the Voyager radio-occultation value (Lindal et al. 1985) — which I
did not open, and which is _itself_ a function of the assumed He abundance, so it is circular with
the row above. ±5 K is the stated uncertainty.

μ = 0.9153·2.01588 + 0.08·4.002602 + 0.0047·16.0425 = **2.2407 g/mol [D]**.
N(1 bar) = 1e5/(1.380649e-23·134) = **5.4052e25 m⁻³** = 2.0118 amagat **[D]**.

### Scale height

```
H = (1.380649e-23 · 134) / (2.2407 · 1.66054e-27 · 9.081)
  = 1.850070e-21 / 3.37907e-26
  = 54 750 m
```

**H = 54.8 km [D]**, with the He swing giving 56.2 km (x_He = 0.05) to 52.0 km (x_He = 0.14). The
table's 59.5 km is **outside that whole range** — it is the NASA fact sheet value, which is
self-consistent with μ = 2.07, i.e. the superseded Voyager-1984 He abundance of 3.25 %.
**Recommend 55 km.**

### Coefficients

| λ      | σ_mix (m²) | H₂ / He / CH₄ share | **β (1/km)** | τ_vert | τ_slant |
| ------ | ---------- | ------------------- | ------------ | ------ | ------- |
| 680 nm | 4.0354e-32 | 94.4 / 0.5 / 5.1 %  | **2.18e-3**  | 0.119  | 9.9     |
| 550 nm | 9.5902e-32 | 94.5 / 0.5 / 5.0 %  | **5.18e-3**  | 0.284  | 23.6    |
| 440 nm | 2.4079e-31 | 94.7 / 0.5 / 4.8 %  | **13.0e-3**  | 0.713  | 59.3    |

Helium sensitivity **[D]**: x(He) = 0.05 → 0.14 moves β by +3 % / −6 %, H by +3 % / −5 %, and the
vertical column βH by +6 % / −11 %. **A controversy spanning a factor of four in helium abundance
propagates into this constituent as a ±10 % effect**, because helium's cross section is 1/16 of
H₂'s and it enters mainly through μ. Say so in the row comment; it is exactly the kind of thing
that otherwise gets "fixed" back when the next He paper lands.

**Saturn's Rayleigh is 35 % stronger than Jupiter's at the 1-bar level and its column above 1 bar
is 2.6× larger** — the whole difference is gravity: N_col = P/(μ m_u g), and Saturn's g_eff is
2.5× smaller. This is the physical statement of "Saturn is hazier / softer / less contrasty than
Jupiter" and the current flat `[4,4,4]e-3` row expresses none of it.

```
scatter: [2.18e-3, 5.18e-3, 13.0e-3]   absorb: [0,0,0]
profile: exponential(55)               phase: rayleigh
```

**Confidence: high on the coefficients, medium on the scale height** (the He abundance moves it
±4 %, and T(1 bar) is not independently pinned). Falsified by: a settled He measurement outside
0.03–0.15, or a Cassini radio-occultation 1-bar temperature far from 134 K.

## 2. Aerosol — ammonia plus the photochemical haze

This is where Saturn differs from Jupiter, and the difference is measured, not asserted.

### Scale height — the table is already right [M]

Sanz-Requena et al. Table 1: tropospheric haze particle scale height **H = 25 ± 5 km**, free
parameter, retrieved; base pressure 600 ± 100 mbar; gas scale height at that level "≈ 38 km", so
H_a/H_g = 0.7 ± 0.1. The table's `mieScaleHeightKm: 25` is exactly the measured value.
**No change.**

Note what the 600-mbar base means geometrically: h = 54.75·ln(1/0.6) = **28 km above the drawn
radius**. Saturn's tropospheric haze lies _entirely_ inside the shell. Its τ = 10 ± 5 reaches unity
at h = 28 + 25·ln 10 = **86 km**, so Saturn's visible cloud top is ~86 km above the 1-bar radius
the sphere is drawn at. That is a 0.14 % radius error, invisible, but it is why the shell must not
also carry the full τ = 10 — most of it is _below_ what the texture shows.

### Phase function [D]

Mie, gamma distribution v_eff = 0.1, at Sanz-Requena's measured r_eff = 1.5 ± 0.5 µm, n = 1.43:

| λ      | Q_ext | **g** |
| ------ | ----- | ----- |
| 680 nm | 2.377 | 0.742 |
| 550 nm | 2.330 | 0.771 |
| 440 nm | 2.280 | 0.802 |

**g = 0.75 [D]**, up from the table's 0.6 — the _same_ value as Jupiter, despite Saturn's haze
particles being three times the radius. That is a real result, not a copy-paste: at a jovian
refractive index, g(x) has already flattened by x ≈ 4, and both bodies' aerosols sit past it. If a
later tuner wants the two rims to differ, the lever is `absorb` (below), not `g`.

### Scattering and absorption — where "muted and golden" lives

**Scatter: [3.0e-3, 3.0e-3, 3.0e-3] — unchanged [L]**, same reasoning and same bracket as Jupiter.
τ_slant = 3.0e-3·√(2π·60268·25) = 9.2.

**Absorb: [4.5e-5, 1.1e-4, 2.7e-4] — changed from a flat 1e-3 [D].**

Two independent things say Saturn's aerosol absorbs where Jupiter's does not:

1. **Retrieved refractive index.** Sanz-Requena et al. carry the tropospheric haze's imaginary
   index as a _free parameter_ with m_i ≈ 10⁻³ and find it rises toward the blue; Braude et al.
   fix Jupiter's cloud and haze at k ≈ 10⁻⁹ and get a good fit. A three-order-of-magnitude
   difference in the retrieved absorptivity of the two planets' upper aerosols is the mechanism.
2. **Measured disc colours.** Mallama et al. Table 7, normalised to V so the overall albedo drops
   out **[D]**:

   | ratio    | Jupiter | Saturn | Saturn/Jupiter    |
   | -------- | ------- | ------ | ----------------- |
   | p_U/p_V  | 0.665   | 0.407  | 0.611 (+0.53 mag) |
   | p_B/p_V  | 0.823   | 0.679  | 0.825 (+0.21 mag) |
   | p_Rc/p_V | 0.954   | 1.295  | 1.358 (−0.33 mag) |

   Saturn is measurably bluer-deficient _and_ redder-brighter than Jupiter, monotonically across
   U→R. That is a short-wavelength absorber over a bright deck, which is exactly what a
   photochemical haze is.

The coefficients: take m_i = 10⁻³ at 550 nm **[M, Sanz-Requena]** and give it the wavelength
_shape_ of Braude's retrieved Jovian chromophore, k_c ∝ [0.0080, 0.016, 0.035] at (680, 550, 440)
**[M for the shape, [L] for the transfer]** — both are photochemical organics and no Saturn-specific
k(λ) table appeared in anything I opened. Mie at r_eff = 1.5 µm, n = 1.43:

| λ      | m_i    | Q_ext | ω      | absorb/scatter | **absorb (1/km)** | τ_slant,abs |
| ------ | ------ | ----- | ------ | -------------- | ----------------- | ----------- |
| 680 nm | 5.0e-4 | 2.377 | 0.9854 | 0.0148         | **4.5e-5**        | 0.14        |
| 550 nm | 1.0e-3 | 2.330 | 0.9655 | 0.0357         | **1.1e-4**        | 0.33        |
| 440 nm | 2.2e-3 | 2.280 | 0.9167 | 0.0909         | **2.7e-4**        | 0.84        |

Along the limb the rim keeps e⁻⁰·⁸⁴ = 43 % of its blue against e⁻⁰·¹⁴ = 87 % of its red — a
blue-to-red differential of Δτ = 0.70, i.e. **0.76 mag**. Mallama's measured Saturn-minus-Jupiter
disc offsets are +0.21 mag in B/V and −0.33 mag in Rc/V, 0.54 mag end to end. Same sign, same
order; the shell's version comes out somewhat stronger because the limb path is longer than the
disc path, which is the correct direction for a limb-only term. **Jupiter's absorb is zero and
Saturn's is not: that is the difference expressed as numbers rather than asserted.**

**Confidence: medium.** The _sign and ordering_ are solid (two independent measurements agree).
The absolute level rides on m_i = 10⁻³, which Sanz-Requena treat as a free parameter with a 100 %
prior uncertainty, and on borrowing Jupiter's chromophore spectral shape. Falsified by: a Saturn
haze retrieval publishing k(λ) directly — that would replace the middle column of that table and
the rest follows.

## 3. Chromophores

Saturn has no discrete chromophore layer in the Jovian sense in anything I opened. Its short-
wavelength absorption is the haze's own m_i, which is already in §2. **No separate constituent.**

## 4. Methane — include it on Saturn

CH₄ column above 1 bar **[D]**: N_col = 1e5/(2.2407·1.66054e-27·9.081) = 2.9596e30 m⁻² total;
× 0.0047 = 1.3908e28 m⁻² = **0.518 km-amagat** — 6.0× Jupiter's, because the gravity is 2.5× lower
and the mixing ratio 2.3× higher. Slant (×83) = **43.1 km-am**.

β_CH₄(0) = k · 2.0118 · 0.0047 = k · 9.455e-3, with the same 100 K coefficients:

| λ      | β (1/km)    | τ_slant | as a fraction of Rayleigh | ω of the gas alone |
| ------ | ----------- | ------- | ------------------------- | ------------------ |
| 680 nm | **2.78e-4** | 1.26    | **12.7 %**                | 0.887              |
| 550 nm | 1.6e-5      | 0.07    | 0.3 %                     | 0.997              |
| 440 nm | 1.7e-5      | 0.08    | 0.1 %                     | 0.999              |

**This is the number that settles it, and it settles it differently for the two bodies.** The
single-scattering albedo of Saturn's gas drops to **0.887 in the red** and stays at 0.997/0.999 in
the other two channels. For an optically thick limb (τ_slant ≈ 10–60) reflectance is a strong
function of ω near unity — the semi-infinite similarity estimate (1−√(1−ω))/(1+√(1−ω)) gives 0.50
at ω = 0.887 against 1.0 at ω = 1 — so a 13 % extinction contribution is not a 13 % radiance
effect. It is a red-channel darkening of the rim that nothing else in the row produces, and it
reinforces the same direction as Rayleigh.

The same estimate applied to Jupiter (ω = 0.943) gives 0.61, so **methane is not literally
negligible on Jupiter either** — it is 4× weaker, and that is the whole difference. The number
that separates them is τ_slant(680): **0.33 on Jupiter, 1.26 on Saturn.** Jupiter's sits under the
factor-2 bracket on its own `scatter` [L] and so cannot be calibrated against anything; Saturn's
does not. Since Jupiter's row only uses two of four slots, adding it there costs nothing but a
line — see the Jupiter §4 verdict, which is a judgement call and is flagged as one.

```
scatter: [0,0,0]                       absorb: [2.78e-4, 1.6e-5, 1.7e-5]
profile: exponential(55)               phase: rayleigh   (irrelevant: scatter is zero)
```

This is exactly the _well-mixed absorber_ shape the whole redesign exists for. It costs Saturn a
third slot (of four) and Jupiter nothing.

Caveats as for Jupiter: over a 600–700 nm band the coefficient is 3.5× larger (45 % of Rayleigh,
ω = 0.69), so a future spectral renderer would find this considerably stronger; and linear
band-averaging is an upper bound.

---

# Proposed rows

Geometry, `groundAlbedo`, `twilight*` and `exposure` unchanged; only the physics fields are given.

## Jupiter — 2 constituents

```ts
jupiter: {
  planetRadiusKm: seededPlanet('jupiter').radiusKm,          // 71492
  atmosphereTopKm: seededPlanet('jupiter').radiusKm + 150,   // 5.8 scale heights, holds >99.9%
                                                             // of the limb column
  constituents: [
    { // H2/He/CH4 Rayleigh. [D] from Peck&Huang + Mansfield&Peck refractivities at the
      // Galileo composition (x_He 0.1356) and N(1 bar, 166 K) = 4.363e25 /m3. Steeply blue:
      // the old grey [4,4,5]e-3 had the red:blue ratio inverted. tau_vert(550) = 0.099,
      // the number every jovian cloud retrieval works with.
      scatter: [1.62e-3, 3.85e-3, 9.68e-3],
      absorb:  [0, 0, 0],
      profile: { kind: 'exponential', scaleHeightKm: 25.8 }, // [D] kT/(mu m_u g_eff), g_eff
                                                             // 23.12 = GM/R^2 + J2 - centrifugal
      phase:   { kind: 'rayleigh' },
    },
    { // Upper tropospheric haze. Braude+20 retrieve Jupiter's cloud AND haze as conservatively
      // scattering (k ~ 1e-9 at every wavelength) -- the old absorb 1e-3 made omega 0.75 and
      // killed the rim's colour. All of Jupiter's colour is chromophore, and the chromophore
      // is in the TEXTURE, not here: as a uniform shell term it would be tau_vert ~ 1-2 in blue,
      // x264 at the limb -- it would delete the rim, not tint it.
      scatter: [3.0e-3, 3.0e-3, 3.0e-3],                     // [L] tau_slant 7.5; 2-6e-3 all read
      absorb:  [0, 0, 0],                                    // the same
      profile: { kind: 'exponential', scaleHeightKm: 14 },   // [D] 0.7 x H_gas at 0.5 bar
      phase:   { kind: 'henyeyGreenstein', g: 0.75 },        // [D] Mie at Braude+20's measured
                                                             // r_h = 0.47 um. HG must match the
                                                             // forward lobe's HEIGHT: raising g
                                                             // without cutting scatter brightens
                                                             // the crescent rim.
    },
  ],
}
```

Methane deliberately absent: 6 % of red extinction, 0.1 % elsewhere — a judgement call, see §4
for the row to paste if you disagree.

## Saturn — 3 constituents

```ts
saturn: {
  planetRadiusKm: seededPlanet('saturn').radiusKm,           // 60268
  atmosphereTopKm: seededPlanet('saturn').radiusKm + 300,    // 5.5 scale heights
  constituents: [
    { // H2/He/CH4 Rayleigh. 35% stronger than Jupiter's at 1 bar and 2.6x the column above it,
      // entirely because g_eff is 2.5x smaller. Saturn's helium abundance is unsettled (x_He
      // 0.03-0.15 across five Cassini/Voyager analyses) but that whole factor-4 spread moves
      // these by only +3/-6%, because He's cross section is 1/16 of H2's and it enters mainly
      // through mu. Do not re-derive the row when the next He paper lands.
      scatter: [2.18e-3, 5.18e-3, 13.0e-3],
      absorb:  [0, 0, 0],
      profile: { kind: 'exponential', scaleHeightKm: 55 },   // [D] at x_He 0.08; the old 59.5 is
                                                             // the fact sheet's, from the
                                                             // superseded 3.25% He
      phase:   { kind: 'rayleigh' },
    },
    { // Ammonia + photochemical haze. Sanz-Requena+19 MEASURE the particle scale height as
      // 25 +/- 5 km -- the table already had it right. The absorb vector is the whole
      // Jupiter/Saturn colour difference: their retrieved m_i ~ 1e-3 rising to the blue, against
      // Braude+20's k ~ 1e-9 for Jupiter. The rim keeps 43% of its blue against 87% of its red,
      // the same sign and order as the +0.21 mag B/V and -0.33 mag Rc/V that Mallama+17 measure
      // between the two discs.
      scatter: [3.0e-3, 3.0e-3, 3.0e-3],                     // [L] tau_slant 9.2
      absorb:  [4.5e-5, 1.1e-4, 2.7e-4],                     // [D] Mie omega at r_eff 1.5 um
      profile: { kind: 'exponential', scaleHeightKm: 25 },   // [M] Sanz-Requena+19 Table 1
      phase:   { kind: 'henyeyGreenstein', g: 0.75 },        // [D] Mie. Same as Jupiter's despite
                                                             // 3x the particle radius: g(x) has
                                                             // flattened by x ~ 4 and both are
                                                             // past it. The rims differ in
                                                             // `absorb`, not here.
    },
    { // Well-mixed methane. Saturn's CH4 column above 1 bar is 0.52 km-amagat, 6x Jupiter's.
      // k(680 nm, 100 K) = 0.029 (km-am)^-1 (Karkoschka & Tomasko 2010) puts omega at 0.887 in
      // red against 0.997/0.999 -- a red-only darkening of an optically thick limb. Exponential
      // at the GAS scale height, not a tent: this is the constituent the redesign exists for.
      scatter: [0, 0, 0],
      absorb:  [2.78e-4, 1.6e-5, 1.7e-5],
      profile: { kind: 'exponential', scaleHeightKm: 55 },
      phase:   { kind: 'rayleigh' },                         // unused; scatter is zero
    },
  ],
}
```

## Change summary against the current table

| Field            | Jupiter now     | Jupiter proposed        | Saturn now     | Saturn proposed            |
| ---------------- | --------------- | ----------------------- | -------------- | -------------------------- |
| Rayleigh scatter | `[4, 4, 5]e-3`  | `[1.62, 3.85, 9.68]e-3` | `[4, 4, 4]e-3` | `[2.18, 5.18, 13.0]e-3`    |
| Rayleigh H       | 27 km           | 25.8 km                 | 59.5 km        | 55 km                      |
| Mie scatter      | `3e-3`          | unchanged               | `3e-3`         | unchanged                  |
| Mie absorb       | `1e-3` (ω 0.75) | `[0,0,0]`               | `1e-3`         | `[4.5e-5, 1.1e-4, 2.7e-4]` |
| Mie H            | 12 km           | 14 km (or keep)         | 25 km          | **unchanged — measured**   |
| Mie g            | 0.6             | 0.75                    | 0.6            | 0.75                       |
| Methane          | —               | none (judgement call)   | —              | new constituent            |

Ranked by how much each moves the image: \*\*Rayleigh vector ≫ Mie absorb > Mie g > Saturn's methane

> scale heights\*\*. If only one change lands, make it the Rayleigh vectors.

---

# Could not verify

Listed so a reviewer does not have to rediscover which claims are soft.

1. **F_K(H₂) = 1.02.** No opened source. Sneep & Ubachs (2005) is the usual citation for King
   factors but does **not** measure H₂. Much of the exoplanet literature uses F_K(H₂) = 1. The
   choice moves every Rayleigh number by 1.7 %, below every other uncertainty in the row.
2. **J₂ and rotation periods** (Jupiter 0.014736 / 9.9250 h, Saturn 0.016298 / 10.656 h) are
   standard IAU values used from memory. Their product with GM/R² reproduces the widely-quoted
   24.79 and 10.44 m/s² "equatorial gravity", which is a consistency check, not a source. Saturn's
   rotation period is genuinely contested (Voyager vs Cassini ring seismology); the difference is
   0.3 % in g_eff.
3. **Saturn's T(1 bar) = 134 K.** Lindal et al. (1985) is paywalled and I did not open it. It is
   also model-dependent on the very helium abundance that is unsettled — a real circularity, not a
   citation problem. ±5 K → ∓4 % on H and ∓4 % on β.
4. **Saturn's haze imaginary refractive index spectrum.** Sanz-Requena et al. retrieve m_i per
   filter but the values live in their Figures 13 and 15, which I could not read as numbers from
   the PDF text layer. I used their stated m_i ≈ 10⁻³ at visible wavelengths and borrowed Braude
   et al.'s Jovian chromophore _shape_. This is the weakest link in Saturn's aerosol absorb vector.
5. **The aerosol `scatter` magnitude (3e-3) on both bodies.** Nothing I opened pins the aerosol
   column _above_ the drawn radius, as opposed to the total column, which is dominated by the deck
   the texture already draws. Kept at the current value with a stated bracket (2–6e-3), tagged [L].
6. **von Zahn et al. (1998), Seiff et al. (1998), West et al. (1986/2004), Karkoschka (1994/1998),
   Sromovsky & Fry** — all paywalled or otherwise unopened. Where their numbers were needed
   (Jupiter's He and 1-bar T; the methane coefficients) they were obtained from Guillot et al.,
   Gupta et al. (2022) and the Karkoschka & Tomasko (2010) data file, all of which I did
   open. Nothing below traces only to a search-engine summary.
7. **NASA planetary fact sheets** were unreachable this session (nssdc.gsfc.nasa.gov redirects to
   a landing page). Radii and masses came from JPL SSD instead; the fact sheets' scale heights
   (27 km, 59.5 km) are quoted only as the presumed provenance of the current table values, and
   the reconstruction of what μ and g they imply is a [D] inference, not a quotation.
