# Titan — atmosphere constituents

Research note for stage 3 of `docs/superpowers/specs/2026-08-18-atmosphere-constituents-design.md`.
RGB reference wavelengths 680 / 550 / 440 nm. Units 1/km. Tags: **[M]**easured (published,
cited), **[D]**erived (arithmetic shown), **[L]**ook (no measurement pins it).

**Headline: Titan is the row where the reference-level trick Venus got away with stops
being free.** Venus's cloud top sits 68 km above a 6052 km body — 1.1 %, invisible. Titan's
visible "surface" sits **160 km above a 2575 km body — 6.2 %**, and the shell cannot be
raised to meet it, because `planetRadiusKm` larger than the rasterised sphere is the one
direction that breaks the renderer. §0 works the numbers and names the cost.

Three places this note contradicts the spec's stage-3 sketch:

- **No texture, so the shell sits over a flat Lambert sphere.** The spec assumes a Cassini ISS
  visible mosaic; no such map-projected product exists. §0, and "Could not verify".
- **No `tent` for the detached haze.** Its normal optical depth is ~1 × 10⁻³ and its limb
  optical depth ~0.03; it also vanished entirely from late 2012 to early 2016. §3.
- **Two Henyey–Greenstein lobes for the haze, not one.** Titan's aerosols are fractal
  aggregates with a forward lobe so tall that a single-`g` HG must choose between the
  forward lobe and the backscatter, and losing either wrecks a view the renderer actually
  shows. §2.5. The slot this needs is the one the tent was going to take.

## Sources actually opened

Every number below traces to one of these. Each was downloaded and read; where a value
reaches me through one of these rather than from its own paper, the row says so.

| Short         | Full                                                                                                                                                                                                | What I took from it                                                                                                                                                                       |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Bazzon+14     | A. Bazzon, H. M. Schmid, E. Buenzli, "HST observations of the limb polarization of Titan", _A&A_ **572**, A6 (2014), [arXiv:1409.3421](https://arxiv.org/abs/1409.3421)                             | **Appendix A.4, eqs. A.8–A.13** — Tomasko+08's haze opacity model reproduced in closed form; A.2's PDS Rayleigh relation; ϖ_haze ≈ 0.8–1; surface albedo 0.2 (range 0.1–0.3)               |
| GM+17         | A. García Muñoz, P. Lavvas, R. A. West, "Titan brighter at twilight than in daylight", _Nature Astron._ **1**, 0114 (2017), [arXiv:1704.07460](https://arxiv.org/abs/1704.07460)                    | Phase integrals q = 1.9–2.9; Bond albedo 0.27 ± 0.02; first-scattering altitudes; H_a/R = 1.5 × 10⁻²; aggregate projected-area radii 2–3 µm; optical radius definition; Pioneer 11 radii |
| Karkoschka 98 | E. Karkoschka, _Icarus_ **133**, 134 (1998) — paper text and both albedo tables read from the PDS volume GBAT_0001 (`document/icarus98.asc`, `data/1993.tab`, `data/1995low.tab`)                   | **Titan full-disk albedo, 300–1050 nm, column 8** — the colour anchor; error budget (2 % relative, 4 % absolute); the 2-year seasonal variation; 4 km-am methane path                     |
| Seignovert+17 | B. Seignovert, P. Rannou, P. Lavvas, T. Cours, R. A. West, _Icarus_ **292**, 13 (2017), [arXiv:1704.00842](https://arxiv.org/abs/1704.00842)                                                        | **Table 2 + eq. (4)** — detached haze at 500 ± 8 km, tangential τ 0.078 ± 0.004 at 338 nm, normal τ ≈ 3 × 10⁻³, aerosol scale height 35 km, monomer 60 ± 3 nm, N = 266                    |
| Hörst 17      | S. M. Hörst, "Titan's atmosphere and climate", _JGR Planets_ **122**, 432 (2017), [arXiv:1702.08611](https://arxiv.org/abs/1702.08611)                                                              | Surface 1.5 bar / 94 K; CH₄ 5.65 % at the surface, 1.48 ± 0.09 % in the stratosphere; aggregates of 4000 × 0.04 µm monomers; the detached layer's 2007–2016 seasonal history             |
| HASI          | Huygens HASI L4 atmospheric profiles, PDS volume HPHASI_0001 (`DATA/PROFILES/HASI_L4_ATMO_PROFILE_{DESCEN,ENTRY}.TAB` + labels) — the archived Fulchignoni et al. (2005) data                       | **p(z), T(z)** from the surface to 1380 km; the gas number density and scale height at the reference level                                                                                |
| He+21         | Q. He et al., _Atmos. Chem. Phys._ **21**, 14927 (2021), [doi:10.5194/acp-21-14927-2021](https://doi.org/10.5194/acp-21-14927-2021)                                                                 | Table 1: N₂ and CH₄ refractive-index dispersion + King correction factors, and the σ formula (eq. 1) — the same table Venus's and Mars's rows use                                        |

Not opened, and reaching this note only through the papers above, which is flagged at every
use: **Tomasko et al. (2008)** and **Doose et al. (2016)** (the DISR haze model itself — its
opacity parameterisation comes through Bazzon+14's appendix, its revised scale height through
GM+17), Tomasko & Smith (1982), Niemann et al. (2010), Fulchignoni et al. (2005) as a paper,
West et al. (2011, 2014, 2016), Lavvas et al. (2009, 2010), Cours et al. (2011), Rannou et al.
(2010), Porco et al. (2005), Khare et al. (1984), Jacobson et al. (2006). One formula — the
similarity relation §2.4 inverts for ϖ — comes from **memory**, not from any of these; it is
flagged where it is used and again under "Could not verify".

Scratch computations are reproduced inline. The Rayleigh machinery is the one Venus's note
validated against Hansen & Hovenier's f_R = 0.045 to 9 %; §1 adds an independent check of it
against the PDS relation Bazzon+14 uses. No Mie code is used anywhere in this note — see §2.2
for why that is the point.

---

## 0. Geometry — the reference level, and the trick Venus got away with

**Recommendation: `planetRadiusKm = seededPlanet('titan').radiusKm` (2575 km, unchanged) and
`atmosphereTopKm = radius + 350`. Author every coefficient at the nadir τ = 1 level, which is
160 km above the solid surface. The drawn Titan is therefore 6.2 % too small, and that is the
price; the alternative is worse.**

### What the drawn sphere is

**There is no Titan texture.** Every global Titan product that exists is ISS 938 nm or radar;
the true-colour images are single-hemisphere perspective discs, not map projections, and no
clean-licensed equirectangular haze map was found. `data/raw/textures/README.md:232-234`
records the same conclusion. Titan therefore draws through `planetsLayer` / `planetRenderer`
as a **flat Lambert sphere tinted by its seed albedo**, with the shell above it — no
`BODY_TEXTURE_REGISTRY` row, and therefore no `ROTATION_ELEMENTS` row (orientation is gated on
registry membership at `orientationForBody.ts:33`, so one would be inert) and no
`LIMB_DARKENING_PARAMS` row (read only by `texturedBodiesLayer`).

None of that moves altitude 0, because the reference-level argument never rested on the
texture. It rests on where the photons are: the solid surface is only reachable at 938 nm and
longward. At 680 nm the whole haze column has τ = 5.59 (§2.1), so the one-way transmittance to
the ground is e⁻⁵·⁵⁹ = 3.7 × 10⁻³ and the two-way is 1.4 × 10⁻⁵. Karkoschka 98 puts the same
thing observationally — the surface signature he can extract sits at 940 nm, where the
continuum-minus-methane difference is "7 percent", and it is that signature which "yielded a
path length of 4 km-am of methane in Titan's atmosphere". GM+17 agree from the other side:
of their fifteen ISS passbands, only λ_eff = 938 nm is one where "Titan's surface contributes
to the emergent radiation".

So Titan joins the cloud-tops-as-ground family — Venus, Jupiter, Saturn — with the difference
that its "ground" is a flat tinted sphere rather than a photograph of the deck. The question
is still where in that column altitude 0 goes.

### The nadir τ = 1 level, per channel

From the haze opacity model of §2.1 (Tomasko+08 through Bazzon+14 eqs. A.8/A.11, with
Doose+16's revision that the aerosol scale height above ~140 km is ~45 km, not 65 km):

| λ      | τ at 140 km | **nadir τ = 1 at** |
| ------ | ----------- | ------------------ |
| 680 nm | 0.953       | **136.9 km**       |
| 550 nm | 1.565       | **160.2 km**       |
| 440 nm | 2.638       | **183.6 km**       |

**There is no single altitude 0 that is the surface in all three channels.** Titan's visible
disc is 47 km bigger in blue than in red — the τ = 1 surface is not a surface, it is a
wavelength-dependent level in a medium with no top.

That colour split is checkable. The optical radius (the silhouette, GM+17's
"altitude where the limb optical thickness τ_eq = 0.56") comes out of the same model at
**2917 km at 452 nm and 2879 km at 648 nm — a 38 km split**, against the
2850 − 2800 = **50 km** that Tomasko & Smith (1982) adopted for their Pioneer 11 phase curves
(quoted by GM+17 when they renormalise those curves to 2575 km). The split is
H_a · ln(τ_B/τ_R) = H_a × 0.843, so 45 km gives 38 km and 65 km would give 55 km; the
measurement sits between them and does not choose. The absolute value runs 55–90 km high
(1–2 scale heights) either way. Read this as "right sign, right order, and the λ⁻²·³⁴ law
predicts a blue disc larger than the red one, which is observed" — not as a determination of
H_a. That comes from Doose+16 (§2.1).

Take **160 km, the 550 nm level**, as the reference. The channel spread then lives in the
constituent's `scatter` vector, where it belongs.

### The Venus move, and why the same move is not free here

Venus keeps `planetRadiusKm` at the solid-body radius and reads altitude 0 as the cloud top
68 km higher: 68 / 6052 = **1.1 %**, below noticing. Titan's equivalent is

```
160 / 2575 = 6.2 %      (nadir tau = 1, 550 nm)
320 / 2575 = 12.4 %     (limb tau = 0.56 — GM+17's "optical radius", the silhouette)
```

Six to twelve times Venus's error. Titan is drawn at 2575 km; its visible disc is 2735 km
across the middle and its silhouette closer to 2900 km.

### Raising `planetRadiusKm` is the broken direction

`planetRadiusKm` is not decoration. It is (a) the altitude datum —
`scattering.wesl:167`, `let altitude = max(0.0, length(posKm) - params.planetRadiusKm)`, the
only altitude definition in the system, so every authored scale height and tent centre hangs
off it; (b) the ground ray-sphere radius in `skyViewLut.wesl:108` and in the shell fragment
as `u.bottomRadius`; and (c) the horizon in both LUT parameterisations.

Setting it to 2735 while the sphere rasterises at 2575 leaves a 160 km annulus in which the
fragment's `intersectsGround` is true but no opaque disc exists. The near/far-wall split at
`shell/fragment.wesl:176-181` then discards the far wall (no limb, no sky) and draws the
near wall's over-disc haze against empty background: a hard-edged ring of haze over nothing,
with the limb glow amputated exactly where it is brightest. `sphereTessellation.ts:47-54`
records this failure mode in the general case. Smaller than the drawn sphere is benign;
larger is not.

Raising the **seed** radius instead (2575 → 2735) would keep the two in step and fix the
apparent size, at the cost of `SCENE_PLANETS` stating a radius for Titan that is not Titan's
radius. 2575 km is the solid-body figure every fact table quotes, and `scenePlanets.ts:49` is
the only place the codebase states it — `BODY_FACTS` carries no radius field at all, so there
is nothing to contradict and nothing else to move in step. Unlike Jupiter's or Saturn's seed
radii, which _are_ the conventionally quoted 1-bar radii, moving Titan's would make the seed
disagree with the published number rather than agree with a different published number.

**Verdict: keep 2575 and accept the 6.2 %.** Two things make it cheap:

1. The published disc albedos are normalised to the solid radius. GM+17 are explicit —
   "we adopted Titan's solid radius of 2575 km" for their phase curves, and "Stating the
   selected normalization radius is critical to compare between works". Karkoschka 98's
   full-disk albedos are on the same footing. So a 2575 km sphere carrying Karkoschka's
   albedo radiates the **right total flux**. Only the angular size is 6 % small, and only in
   a frame that also contains a correctly-sized reference.
2. Titan's halo is drawn from a datum 160 km low, so it stands off the disc by 6.2 % more of
   the disc radius than it should. That is a shape error in the direction of _more_ halo,
   which is the forgiving direction for a body whose halo is its signature.

### Prerequisite: the drawn silhouette must be the analytic one

The row needs a pixel-exact silhouette, which is a different requirement from needing a
texture. `planetRenderer` draws the 48 × 24 `uvSphereMesh`, whose outline **inscribes** the
true sphere by up to 0.43 % (`sphereTessellation.ts:26-36`) — 11 km at Titan's radius. Against
a perfectly round `bottomRadius` of 2575 that is the broken direction again, in miniature: a
sliver at the limb where the shell's ray test finds ground and the rasteriser drew none, with
the background showing through it. `sphereTessellation.ts:47-54` records the same failure in
the general case.

Venus escapes this only because its texture row happens to put it on the analytic-sphere ray
test (`analyticSphere.wesl:145`), whose silhouette is exactly `radiusKm`. That coupling is
incidental — "has a pixel-exact silhouette" and "has a texture" are separate properties — and
moving `planetRenderer` onto the same ray test un-braids them, giving every flat body the
analytic limb. **That prep refactor is the row's real prerequisite**, and with it landed
`bottomRadius` and the drawn silhouette are the same number for Titan exactly as they are for
Venus.

### Shell top

With the reference at τ = 1 and a 45 km aerosol scale height, the limb optical depth above
the reference is τ_vert(z) × √(2π(R+z)/H) ≈ 19.5 τ_vert(z):

| above reference | τ_vert (550 nm) | τ_limb |
| --------------- | --------------- | ------ |
| +200 km         | 1.17e−2         | 0.238  |
| +250 km         | 3.87e−3         | 0.079  |
| +300 km         | 1.27e−3         | 0.026  |
| **+350 km**     | **4.19e−4**     | 0.009  |
| +400 km         | 1.38e−4         | 0.003  |

**`+350`** [D from M] — 7.8 aerosol scale heights, limb τ down to 0.009, nothing clipped. It
also happens to reach 510 km of real altitude, i.e. past the detached haze at 500 km, so the
shell would not have to grow if §3 were ever revisited. At 1.136 × the radius it is the
table's second-thickest shell after Pluto's 1.21.

### The ground/shell split lands where the physics splits it

This is worth stating because it looks like double counting and is not. The drawn sphere
stands in for the whole column; the shell then re-applies τ = 0.61 / 1.00 / 1.69 of the same
material. But GM+17's Monte Carlo contribution functions say where the light is actually
made: at full illumination, photons scatter preferentially at **150–300 km for 455 nm** and
**50–250 km for 938 nm**. The 550 nm reference at 160 km sits at the bottom of the blue
emission region and the top of the red one. In other words Titan's blue disc really is made
inside the shell, and its red disc really is made below it — which is exactly the split the
renderer draws.

### What the flat disc will actually composite to

The target is the composite, never the ground alone: the rendered disc at low phase must read

```
A_g = [0.278, 0.214, 0.116]   at 680 / 550 / 440 nm   (§4)
```

It will not, and the miss is predictable. The shell composites as
`dst × T + inScatter × exposure` (`shell/fragment.wesl:263-264`), where `dst` is the Lambert
sphere — whose sub-solar pixel reads its albedo outright, since `planet/fragment.wesl` outputs
`albedo × max(N·L, 0.08)` with no 1/π. Over-disc one-way transmittance is
e^−τ = [0.544, 0.368, 0.185], and the seed carries [0.8, 0.6, 0.35]. **[D]** at the sub-solar
point, low phase:

| λ      | ground term A·e^−τ | shell add | **composite** | target |
| ------ | ------------------ | --------- | ------------- | ------ |
| 680 nm | 0.435              | ≈ 0.045   | **≈ 0.48**    | 0.278  |
| 550 nm | 0.221              | ≈ 0.055   | **≈ 0.28**    | 0.214  |
| 440 nm | 0.065              | ≈ 0.054   | **≈ 0.12**    | 0.116  |

The add column is single scattering, (ϖ p(180°)/4) × (1 − e^−2τ)/2 with §2.4's ϖ and §2.5's
p(180°) = 0.262, times `exposure = 2.0`; multiple scattering and the ground bounce push it up,
most in the red where ϖ = 0.986. So it is a floor, and every correction to it runs the same
way as the error below.

**The disc will read too bright and much too red** — **1.7× over in red, 1.3× in green, on
target in blue**, so composite B/R ≈ 0.25 against the measured 0.42 and G/R ≈ 0.58 against
0.77. A saturated brown-orange where Titan is a pale tan. The cause is not the coefficients:
the seed's hue was eyeballed as Titan's _finished_ appearance (§4 — its B/R of 0.4375 is within
5 % of the measured disc), and it is then fed in **underneath** a shell with τ_B/τ_R = 2.77, so
the reddening lands twice.

`exposure` is the wrong dial for this. It scales only the add term, which is the _bluest_ part
of the composite (B/R ≈ 1.2, against the ground term's 0.15): lowering it to cure the
brightness makes the hue worse, raising it to cure the hue makes the brightness worse, and
neither reaches the target. The honest dial is the seed albedo — solving
A = (target − add)/e^−τ gives **≈ [0.43, 0.43, 0.34]**, near-neutral, because under this shell
the colour is the shell's job. That is a whole-table question (§4), not a Titan fix, and the
blue entry is soft: at 440 nm the shell supplies ~45 % of the disc against ~10 % at 680 nm, so
the blue solution swings with the add estimate while the red barely moves. The same asymmetry
says the blue channel's apparent bullseye above is two errors cancelling, not a channel that
is right.

One further caricature to expect: a Lambert sphere darkens toward the limb (the disc-integrated
ground term is 2/3 of the sub-solar figure) where Titan's real disc is nearly flat and then
limb-_brightens_. The shell's own glow partly repairs the edge; the middle is where the numbers
above apply.

---

## 1. Molecular Rayleigh — N₂ + CH₄

### Composition and structure at the reference level

- **[M]** N₂ / CH₄ = 98.4 % / 1.6 % by volume (GM+17, their atmospheric model). Hörst 17
  gives the GCMS numbers behind it: 5.65 ± 0.18 % CH₄ at the surface (Niemann et al. 2010),
  falling by condensation to a stratospheric **1.48 ± 0.09 %** constant from ~45 km up
  through the GCMS's 140 km ceiling. The reference level is stratospheric, so **1.48 %**.
- **[D]** μ = 0.9852 × 28.0134 + 0.0148 × 16.0425 = **27.836 amu**.
- **[M]** HASI, entry profile, nearest samples to 160 km:
  `z = 160.02 km, p = 193.898 Pa, T = 171.87 K` and `z = 180.12 km, p = 121.608 Pa`.

**[D]** Interpolated to 160.2 km: p = 193.26 Pa, T = 171.8 K.

```
N   = p/(kT)      = 193.26 / (1.380649e-23 x 171.8) = 8.148e22 m^-3 = 8.148e16 cm^-3
H   = (z2-z1)/ln(p1/p2) = 20.10 / ln(193.898/121.608) = 43.08 km
```

**3.2 × 10⁻³ of Earth's sea-level number density.** The scale height comes straight off the
measured pressure gradient, so no gravity value is needed; as a cross-check, inverting
H = kT/(μ m_u g) gives g = **1.191 m/s²** against 1.200 from GM = 8978.14 km³/s² at r = 2735 km
(the GM is quoted from memory and is used **only** for this check — see "Could not verify").

### Cross-sections

He+21 eq. (1), σ(ν) = 24π³ν⁴/N² · [(n²−1)/(n²+2)]² · F_k(ν), with their Table 1 rows

```
N2 :  (n-1)x1e8 = 5677.465 + 318.81874e12/(1.44e10 - nu^2),  F_k = 1.034 + 3.17e-12 nu^2
CH4:  (n-1)x1e8 = 4869.8   +   4.1023e14/(1.133e10 - nu^2),  F_k = 1.0
```

evaluated at N_ref = 2.546899 × 10¹⁹ cm⁻³ (the density their refractive indices are scaled to).

**[D]** with σ_mix = 0.9852 σ(N₂) + 0.0148 σ(CH₄) and β = N σ_mix × 10⁵:

| λ      | σ(N₂) cm²  | σ(CH₄) cm² | σ_mix cm²  | **β_R (1/km)** | fraction of the haze |
| ------ | ---------- | ---------- | ---------- | -------------- | -------------------- |
| 680 nm | 1.9557e−27 | 4.1623e−27 | 1.9884e−27 | **1.62e−5**    | 0.12 %               |
| 550 nm | 4.6308e−27 | 9.9050e−27 | 4.7089e−27 | **3.84e−5**    | 0.17 %               |
| 440 nm | 1.1556e−26 | 2.4923e−26 | 1.1754e−26 | **9.58e−5**    | 0.26 %               |

680 nm: 8.148e16 × 1.9884e−27 = 1.620e−10 cm⁻¹ = 1.62e−5 km⁻¹.

Methane scatters 2.14 × more per molecule than N₂ but is 1.5 % of the gas, so it moves σ_mix
by +1.7 %. It gets no separate constituent (see below).

### Cross-check — the PDS Rayleigh relation

Bazzon+14 A.2 carries an independent Rayleigh normalisation from the PDS education pages,
τ_ray = τ₁(H₂)(10.1509 Z_CH₄ + 4.6035 Z_N₂) with τ₁(H₂) = 2.687(8.14e11/λ⁴ + 1.28e18/λ⁶ +
1.61e24/λ⁸), λ in Å, and 1 km-am = 2.687 × 10²⁴ cm⁻². Converting to cross-sections:

| λ   | σ(N₂) mine / PDS | σ(CH₄) mine / PDS |
| --- | ---------------- | ----------------- |
| 680 | 1.078            | 1.041             |
| 550 | 1.073            | 1.041             |
| 440 | 1.064            | 1.041             |

and σ(CH₄)/σ(N₂) = **2.139 (mine) vs 2.205 (PDS)**, a 3 % agreement on the ratio. The He+21
absolute scale runs 4–8 % above the older relation across the band — the same sort of offset
Venus's note found against the legacy Earth constants, and far below anything that matters at
0.2 % of the extinction. Kept on He+21 for consistency with the Venus and Mars rows.

### Verdict, and why methane gets no slot

**[D]** Rayleigh is **0.12–0.26 % of the extinction at every visible wavelength**. That is
six times more negligible than Mars's (0.3–1.7 %) and it does not improve with altitude,
because the gas scale height (43 km) and the aerosol scale height (45 km) are the same to
5 %. It is present for correctness and is never a colour dial. Its one non-trivial property
is the phase function: at 180° Rayleigh's p = 1.50 against the haze pair's 0.26, so its
_relative_ contribution to the low-phase disc is ~1 %, not 0.2 %. Still nothing.

**Methane absorption gets no constituent**, which is the opposite call from Uranus and
Neptune, and the arithmetic is the reason. **[D]** Total gas column above the reference is
p/(μ m_u g) = 193.26/(27.836 × 1.66054e−27 × 1.191) = 3.52e27 m⁻² = 0.131 km-am, so the CH₄
column above altitude 0 is 0.0148 × 0.131 = **1.94 × 10⁻³ km-am**. With Karkoschka 98's
methane coefficient band-averaged over 680 ± 25 nm, k = 0.0965 (km-am)⁻¹:

```
tau_CH4(680, vertical) = 0.0965 x 1.94e-3 = 1.9e-4      limb (x19.5) = 3.7e-3
```

Titan's methane bands are real and deep — Karkoschka's own spectrum drops from 0.298 at
750 nm to 0.099 at 900 nm — but they form in the **troposphere**, in the 4 km-am path
Karkoschka retrieves from the surface signature. That is 2000 times the column above the
reference level, and every bit of it is below the drawn sphere, so it is baked into the seed
albedo rather than modelled. Uranus
and Neptune needed a methane row because their reference level is the 1 bar surface with the
whole stratospheric column above it; Titan's reference level has essentially no methane
above it at all.

---

## 2. The organic haze

This is the row. It carries 99.8 % of the extinction, all of the colour, and all of the
behaviour that makes Titan look like nothing else in the table.

### 2.1 Opacity model — [M], through a secondary

Tomasko et al. (2008) fitted the DISR ascent/descent radiances with a three-region opacity
model. I could not open that paper; Bazzon+14 reproduce it in closed form in their
Appendix A.4, attributing the wavelength dependence to its Figure 47, and I use their
printing (λ in nm):

```
tau80(lam) = 1.012e7 * lam^-2.339        tau30(lam) = 2.029e4 * lam^-1.409
tau0(lam)  = 6.270e2 * lam^-0.9706

tau(h>80)    = tau80 * exp(-(h-80)/65 km)                      (A.11)
tau(30<h<80) = tau80 + tau30 (1 - (h-30)/50 km)                (A.12)
tau(h<30)    = tau80 + tau30 + tau0 (1 - h/30 km)              (A.13)
```

τ here is cumulative **from the top down** to altitude h. **[D]** at the reference triple:

| λ      | τ₈₀   | τ₃₀   | τ₀    | **whole column** | e^−τ    |
| ------ | ----- | ----- | ----- | ---------------- | ------- |
| 680 nm | 2.399 | 2.071 | 1.117 | **5.587**        | 3.7e−3  |
| 550 nm | 3.940 | 2.793 | 1.372 | **8.105**        | 3.0e−4  |
| 440 nm | 6.640 | 3.825 | 1.704 | **12.169**       | 5.2e−6  |

These are the Huygens landing site (10° S), January 2005. Titan's haze has a
north–south asymmetry that reverses with season — Hörst 17: "The winter hemisphere is darker
at short wavelengths and brighter in the near IR due to an increase in haze opacity" — so a
single global row is a caricature by construction. It is the same caricature every other row
in the table makes.

**One revision applied.** Bazzon's A.11 uses a 65 km scale height everywhere above 80 km,
which is Tomasko+08's number. Doose et al. (2016) revised it downward above ~140 km, and
GM+17 — who implement Doose's revision — use **H_a ≈ 45 km** in their `H_a/R ∼ 45/3000`
estimate. Seignovert+17 measure 35 km at 500 km, so the trend continues. The reference level
is at 160 km, above the break, so this note uses

```
tau(h > 140 km) = tau80 * exp(-60/65) * exp(-(h-140)/45)
```

The optical-radius check in §0 is consistent with either value and does not adjudicate; 45 is
used because it is the measured revision, not because that check prefers it.

### 2.2 Why this is not a Mie problem — and why the measured exponent says so

Titan's aerosols are **fractal aggregates**, not spheres. Hörst 17: DISR's measurements "are
fit well by aerosol particles that are fractal aggregates composed of 4000 monomers with radii
of 0.04 microns", with no significant vertical variation in monomer size from the surface to
140 km. GM+17: "Titan's haze particles are fractal aggregates, each comprising thousands of
small (≤0.05 µm) spherical monomers", with "equal-projected-area radii of 2–3 µm".
Seignovert+17 retrieve 60 ± 3 nm monomers with a fractal dimension **D_f = 2.0** held fixed
after Tomasko+08.

Three consequences, and they are the whole reason a Mie code would be the wrong tool:

**(a) The extinction slope is the aggregate's signature, and it is derivable.** In
Rayleigh–Debye–Gans fractal-aggregate theory the aggregate's scattering cross-section is
N² times the monomer's times a structure factor G(kR_g), and for kR_g ≫ 1 the structure factor
falls as (kR_g)^−D_f. With D_f = 2 and k = 2π/λ:

```
C_sca ~ N^2 a^6 lam^-4 x (kRg)^-2 ~ lam^-4 x lam^+2  =  lam^-2
```

**[D]** R_g is of the same order as GM+17's measured 2–3 µm projected-area radius (the usual
a√(N/k_f) with k_f ≈ 1.4 gives 2.3 µm), so kR_g = 21–33 across 680–440 nm — comfortably in
the regime where that limit holds. And the measured exponent is **−2.339**.
A compact Mie sphere of 2–3 µm would give an almost flat λ⁰; the monomers alone would give
λ⁻⁴. The measured −2.34 sits where D_f = 2 puts it, slightly steepened by the tholin's own
absorption rising to the blue. **The aggregate structure is directly visible in the opacity
law, and reproducing it with any spherical-particle model would require a fictitious size
distribution.**

**(b) Absorption and scattering scale differently.** In RDG-FA the aggregate's absorption is
_exactly_ N times the monomer's (each monomer absorbs independently), while scattering is
N²-enhanced and then cut by the structure factor. The single-scattering albedo of an
aggregate is therefore **not** the albedo of an equal-volume sphere of the same material, and
generally sits higher. This is why §2.4 derives ϖ from Titan's own reflectance rather than
from tholin optical constants: a Mie ϖ computed from Khare-type n, k would be answering a
different question.

**(c) Half the aggregate's projected area is filled, so the diffraction argument survives.**
**[D]** filling factor = N a²/r_p²:

| N, a, r_p                | filling |
| ------------------------ | ------- |
| 3000 × 0.05 µm, 2.5 µm   | 1.20    |
| 4000 × 0.04 µm, 2.5 µm   | 1.02    |
| 3000 × 0.05 µm, 2.0 µm   | 1.88    |

Right at unity. The particle is marginally opaque over its projected area, which is what
justifies the classical van de Hulst split in §2.5 — roughly half the extinction into a
diffraction lobe set by r_p, half into everything else.

### 2.3 Coefficients at the reference level

**[D]** β = τ(z₀)/H_a with H_a = 45 km:

| λ      | τ above z₀ | **β_haze (1/km)** |
| ------ | ---------- | ----------------- |
| 680 nm | **0.6088** | **0.01353**       |
| 550 nm | **1.0000** | **0.02222**       |
| 440 nm | **1.6853** | **0.03745**       |

The τ triple is the reference level's definition at 550 and pure λ⁻²·³³⁹ elsewhere, so it is
independent of which level is chosen as altitude 0 — moving the reference rescales β and
leaves the colour alone. **τ_B/τ_R = 2.77.** Before any absorption is considered, the shell
already removes 2.8 times more blue than red from the disc below it. That, and not a warm
`scatter` vector, is where a large part of Titan's orange comes from.

`profile: { kind: 'exponential', scaleHeightKm: 45 }` [M via GM+17/Doose+16]. Not the gas's
43 km — they agree here by coincidence, and above 300 km the aerosol falls off faster than
the gas, not slower.

### 2.4 Single-scattering albedo — derived from Titan's own disc

**The primary numbers could not be opened.** Tomasko+08's ϖ_haze lives in their Table 2 and
Figure 48; Doose+16 revised it. Bazzon+14, who use both, state only the range: "typically
ω_haze(h,λ) ≈ 0.8 − 1". GM+17 add the caveat that matters most here — the DISR optical
properties "are well constrained between 490 and 950 nm for γ_a and ω_0,a", and "the DISR
implementation is poorly constrained shortwards of 490 nm". **The blue channel is outside the
constrained band.** As with Venus's UV absorber, the one number the renderer most wants is
the one the literature pins least.

So ϖ is derived from the reflectance instead, which is the quantity the render has to match.

**The measurement [M].** Karkoschka 98's full-disk albedo of Titan, boxcar-averaged over
±25 nm to represent a broadband channel (the PDS `1995LOW.TAB` column 8, phase angle 5.7°,
which is the Karkoschka 1998 spectrum; `1993.TAB` column 8 is the Karkoschka 1994 spectrum at
2.7°):

| λ            | 1995 (K98) | 1993 (K94) |
| ------------ | ---------- | ---------- |
| 680 ± 25 nm  | **0.2777** | 0.2771     |
| 550 ± 25 nm  | **0.2143** | 0.2205     |
| 440 ± 25 nm  | **0.1158** | 0.1210     |
| B/R          | **0.417**  | 0.4365     |

Two observing runs two years apart agree to 0.2 % in red, 3 % in green, 4.5 % in blue. That
is not scatter: Karkoschka attributes it to season — "In the blue, the geometric effect caused
a decrease of 2 percent while the observed decrease is 4 percent … Near 550 nm … 3 percent
observed in the V-band here". His stated accuracy is 2 % relative, 4 % absolute. The 1995 run
is used below.

**The inversion [D].** At τ = 5.6–12.2 over a surface of albedo ~0.2 (Bazzon+14's assumption,
"the surface albedo of Titan varies between A_s = 0.1 − 0.3"), the column is effectively
semi-infinite at all three wavelengths — even at 680 nm, where the similarity-scaled
τ(1−g) = 2.5 leaves the surface contributing ~0.5 % of the disc. The similarity approximation
for the spherical albedo of a semi-infinite layer,

```
A_sph = (1 - s)(1 - 0.139 s)/(1 + 1.17 s),      s = sqrt((1-w)/(1-w g))
```

is **quoted from memory** (van de Hulst 1980, which I did not open) and is the one unsourced
formula in this note — see "Could not verify". It has the right limits (s → 0 gives A = 1,
s → 1 gives A = 0) and every value it produces below lands inside Bazzon+14's independently
quoted ϖ ≈ 0.8–1, but it is not a citation.

With the spherical albedo A_sph = q A_g and the phase integral **q = 1.9–2.9 [M, GM+17]**
("The phase integrals calculated here (q = 1.9–2.9) are notably larger than earlier estimates
(q = 1.3–1.7) based on incomplete phase angle coverage"). At g = 0.55, which is the two-lobe
pair's mean cosine (§2.5), so the derivation and the phase function agree:

| q       | 680: A_sph → s → ϖ    | 550: A_sph → s → ϖ    | 440: A_sph → s → ϖ    |
| ------- | --------------------- | --------------------- | --------------------- |
| 1.9     | 0.528 → 0.275 → 0.965 | 0.407 → 0.379 → 0.930 | 0.220 → 0.594 → 0.803 |
| **2.4** | 0.666 → 0.176 → 0.986 | 0.514 → 0.286 → 0.962 | 0.278 → 0.519 → 0.858 |
| 2.9     | 0.805 → 0.094 → 0.996 | 0.621 → 0.206 → 0.980 | 0.336 → 0.452 → 0.896 |

and the sensitivity to the assumed g, at q = 2.4:

| g    | ϖ(680) | ϖ(550) | ϖ(440) |
| ---- | ------ | ------ | ------ |
| 0.40 | 0.981  | 0.949  | 0.819  |
| 0.55 | 0.986  | 0.962  | 0.858  |
| 0.70 | 0.990  | 0.974  | 0.901  |
| 0.85 | 0.995  | 0.987  | 0.948  |

**Adopted: ϖ = 0.986 / 0.962 / 0.858 at 680 / 550 / 440 nm** [D], the q = 2.4 (band centre),
g = 0.55 row. Every cell of both tables sits inside Bazzon+14's "≈ 0.8–1", and the shape —
near-conservative in the red, strongly absorbing in the blue — is the mechanism of Titan's
colour, acting on top of the λ⁻²·³⁴ extinction.

The dominant uncertainty is q, and **its error is directional**: GM+17 report that phase
angles ≥166° contribute 13 % of q at 343 nm against 5 % at 649 nm, so q is larger in the blue
than the red. A flat q = 2.4 therefore **over-states blue absorption**; ϖ(440) = 0.858 is a
lower bound. If the rendered Titan reads too brown, this is the number to raise, and raising
it is the physically-supported direction.

**[D]** β_haze × ϖ and β_haze × (1 − ϖ):

| λ   | scatter (1/km) | absorb (1/km) |
| --- | -------------- | ------------- |
| 680 | 0.01334        | 0.000192      |
| 550 | 0.02137        | 0.000853      |
| 440 | 0.03213        | 0.005322      |

`absorb` rises by **28×** from red to blue. `scatter` rises by only 2.4×. Titan's orange is
both effects at once, and the absorption is the larger one.

### 2.5 Phase function — two lobes, and what they cost

**The problem.** GM+17: the aggregates' "large effective size … (equal-projected-area radii
of 2–3 µm) causes the prominent forward lobe in the particles scattering phase function …
The DISR measurements, some of them obtained while looking less than 10° away from the Sun,
have shown that the forward lobe had been severely underestimated for decades." The
consequence is Titan's defining optical property: its twilight outshines its daylight. GM+17
"predict that Titan's brightness for α → 180° exceeds the full-illumination brightness by an
order of magnitude or more", and the mechanism they name is
`p_a(θ→0) × H_a/R`, with **H_a/R ∼ 45/3000 ∼ 1.5 × 10⁻²** — against 6.5 × 10⁻⁴ for Venus and
3.8 × 10⁻⁴ for Jupiter.

**A single HG cannot carry both ends [D].** The forward lobe's width is set by diffraction
off the projected area: for r_p = 2.5 µm at 550 nm the first Airy null is at
asin(1.22 λ/2r_p) = **7.7°**. Matching an HG half-maximum to that:

| g    | HG half-max | HG p(0) |
| ---- | ----------- | ------- |
| 0.75 | 12.7°       | 28      |
| 0.80 | 9.8°        | 45      |
| 0.85 | **7.2°**    | 82      |
| 0.90 | 4.6°        | 190     |
| 0.93 | 3.2°        | 394     |

and at the other end, HG(0.85) at 180° is **0.044**, against 1.50 for Rayleigh. A real
aggregate is a comparatively good backscatterer — its monomers scatter in the Rayleigh regime
and the structure factor is flat at large angles — so a single g = 0.85 would darken the
low-phase disc and the terminator rim by roughly 6×. Conversely a single g ≈ 0.55, whose
backscatter is right, has p(0) = 7.7 against the ~200–400 a 2.5 µm projected area implies.
**One lobe must give up either the disc or the twilight.**

**The split [D].** With a projected-area filling factor of ~1 (§2.2c) the aggregate is
marginally opaque, so the classical division applies: about half the extinction into a
diffraction lobe of width λ/2r_p, about half into everything else. That gives a **50/50
energy split** between

- `henyeyGreenstein g = 0.85` — width-matched to the 7.7° Airy lobe, and
- `henyeyGreenstein g = 0.25` [L] — the broad component. Positive rather than zero because
  the D_f = 2 structure factor still weights forward at kR_g ≫ 1; small enough that the pair
  keeps a usable backscatter.

The pair's mean cosine is 0.55, which is the g the §2.4 inversion assumed — the two halves of
this section are consistent, not independently guessed.

| θ     | g = 0.85 | g = 0.25 | pair  |
| ----- | -------- | -------- | ----- |
| 0°    | 82.2     | 2.22     | 42.2  |
| 10°   | 26.1     | 2.18     | 14.1  |
| 30°   | 2.22     | 1.88     | 2.05  |
| 90°   | 0.123    | 0.856    | 0.489 |
| 180°  | 0.044    | 0.480    | 0.262 |

**The caricature to record.** Even the pair's p(0) = 42 is roughly 5× below the ~200 that
2.5 µm of projected area implies. The twilight surge will render as a bright rim, not as the
order-of-magnitude burst GM+17 measure. Two HG lobes are a real improvement over one — a
factor 5.5 at exact forward and ~2 by θ = 10°, at no cost to the low-phase disc — but they
are not the aggregate phase function, and chasing the remaining factor by pushing g toward
0.93 would trade a 3° lobe (below the sky-view LUT's angular resolution, so it would alias
rather than appear) for the backscatter the common view needs. Do not.

**Spending the slot.** Rayleigh + two lobes is three constituents, so this costs nothing that
the detached haze wanted; but even under slot pressure the pair wins, and §3 explains why the
tent would have lost anyway.

---

## 3. The detached haze layer — no tent

**Recommendation: leave it out. The fourth slot stays empty.**

The layer is real, well measured, and the archetypal `tent` shape — Seignovert+17 confirm
"the stability of the detached haze layer at 500 ± 8 km for all latitudes lower than 45° N"
over 2005–2007. Three facts kill it as a table row.

**1. It is optically nothing at render exposure.** Seignovert+17 Table 2 gives a **tangential**
(limb) extinction opacity of **τ_ext = 0.078 ± 0.004 at 338 nm**, and their eq. (4) turns it
into the normal-incidence optical depth to that level — the "geometric attenuation factor of
the incoming optical depth", which bounds the layer's own — using its measured 35 km scale
height:

```
tau_normal ~ tau_ext sqrt(H / (2 pi (R_T + z)))
           = 0.078 x sqrt(35 / (2 pi x 3075)) = 3.3e-3     ("= 3e-3" in the paper)
```

**[D]** scaled to the RGB triple by the measured λ⁻²·³⁴ opacity law (the aggregates there are
smaller — N = 266, R_g ≈ 0.8 µm — but kR_g = 9.5 at 550 nm is still deep in the D_f = 2
λ⁻² regime, so the exponent holds):

| λ      | tangential τ | normal τ |
| ------ | ------------ | -------- |
| 680 nm | 0.015        | 6.4e−4   |
| 550 nm | 0.025        | 1.1e−3   |
| 440 nm | 0.042        | 1.8e−3   |

For scale, Neptune's Aerosol-4 tent — already flagged in `uranus-neptune.md` as a look risk
because it reaches τ_limb ≈ 3 — is **100× thicker at the limb**. Titan's layer would add a
ring whose peak contribution is a couple of percent of the disc. At the same altitude the
main haze contributes τ_limb = 0.011, so the detached layer is only ~2× its own background.

**2. It is not there half the time.** Hörst 17: "From 2007 to 2010, the location of the
detached haze layer dropped from 500 km to 380 km … Starting in late 2012 the detached haze
layer was not detectable until early 2016 when it reappeared, with very low contrast, near
500 km." A feature that moves 120 km, disappears for three and a half years, and returns at
low contrast is not a constant in a static table. Seignovert+17 measure a factor-3 temporal
variability in the tangential opacity at the equator even within the stable period.

**3. The slot is worth more as a phase lobe.** §2.5.

**If it is ever added anyway** [D, for the record]: `centerKm = 340` (500 km real, minus the
160 km reference), `widthKm ≈ 10` [L — the thickness is not something I could source;
Seignovert+17 only establish that resolving the layer needs better than 10 km sampling],
`scatter ≈ [0.064e−3, 0.106e−3, 0.178e−3]`, `absorb` ≈ 3 % of that, `g` the same 0.85/0.25
problem in miniature. `atmosphereTopKm = radius + 350` already contains it.

---

## 4. `groundAlbedo` — the bottom of the haze, not a surface

**Recommendation: `seededPlanet('titan').albedo`, as every other row does, with the seed left
alone at `[0.8, 0.6, 0.35]`. The measured value is `[0.28, 0.21, 0.12]`; the gap is recorded
here and fixed table-wide, not on this row.**

`groundAlbedo` feeds one thing: the isotropic ground bounce in the multi-scatter LUT
(`multiScatterLut.wesl:122-127`). The "ground" here is the τ = 1 level of the haze, so the
bounce should be the reflectance of the haze column **below** altitude 0 — which is what the
drawn sphere stands in for, and what Karkoschka measured:

```
A_g = [0.2777, 0.2143, 0.1158]   at 680 / 550 / 440 nm   (K98, +-25 nm boxcar)
```

The seed (`scenePlanets.ts:49`, `albedo: [0.8, 0.6, 0.35]`) is **2.6–2.9× brighter than that
in every channel**. Its _hue_ is nearly right — B/R = 0.4375 against a measured 0.417, G/R =
0.75 against 0.772 — which is the tell: whoever eyeballed it matched Titan's finished colour
and missed that a seed albedo is read from _under_ the shell (§0). The correction is a
whole-table one and is tracked in
`docs/backlog/2026-08-18-body-seed-albedos-vs-measured.md`; Titan is not fixed in isolation,
because the same eyeballed-the-composite error is table-wide and the atmosphere rows change
what each seed should be.

**What the too-bright bounce does, so it is not a surprise later.** Unlike Pluto, where the
note could call the bounce "a ~1 % term at τ_vert 0.04" and move on, Titan's shell sits at
τ ≈ 1, so the bounce is first-order. `multiScatterLut.wesl:127` injects
`groundAlbedo/π × cos θ_s × T_sun` as a second-order source, and the LUT then sums the
1/(1 − f_ms) series over it, so a 2.8× error arrives amplified. Two consequences: the shell's
in-scatter over the disc is too bright, and it is too _warm_, because the seed's excess is
largest in red (0.8 against 0.278) — the same direction as the multiply-term error in §0, so
the two do not cancel.

The seed is therefore read **twice**: once by `planetRenderer` as the drawn disc's colour, and
once here as the bounce. Both readings want a reflectance measured _below_ the shell, which is
neither Karkoschka's disc albedo (measured through it) nor the current seed (eyeballed as the
finished look). §0's composite arithmetic backs out ≈ [0.43, 0.43, 0.34] for the first job;
the second wants the same quantity. That is the number the table-wide recalibration should
land on, and it is why the recalibration has to be judged against the composite rather than
against a catalogue albedo. Nothing in §§1–3 moves when it does: `scatter` and `absorb` are
independent of the seed.

Two second-order caveats on the measured number itself, recorded so it is not "corrected"
later on a hunch. The measured disc albedo includes the shell's own extinction and in-scatter,
so as an estimate of the sub-reference reflectance alone it is low in blue (the shell absorbs)
and high in red (the shell adds) — which is exactly the correction §0 works out. And it is
**not** Titan's surface albedo —
Bazzon+14's A_s = 0.2 at 938 nm describes the ground under 5.6 optical depths of haze, a
different quantity that happens to have a similar magnitude.

---

## 5. `twilightSoftness` / `twilightIntensity` / `exposure` — all [L]

No measurement pins any of these. What each one does, and what to judge it against:

**`twilightSoftness = 0.12`** [L]. It is the smoothstep width, in sun-zenith cosine, over
which the whole in-scatter source fades across the terminator (`skyViewLut.wesl:153-157`).
Earth uses 0.05, the gas giants 0.03, Pluto 0.1. Titan should have the softest terminator in
the table and the argument is a measured one: **H_a/R = 1.5 × 10⁻²** [M, GM+17] is the
largest in the solar system, ~23× Venus's and ~40× Jupiter's, and sunlight still reaches the
top of a +350 km shell at a solar depression of √(2z/R) ≈ 29° (Earth's 100 km shell: 10°).
Scaling Earth's 0.05 by that ratio gives ~0.14; 0.12 is a shade conservative. **Judge on:**
the night-side limb must stay visibly lit well past the terminator — GM+17's whole result is
that Titan's twilight is _brighter_ than its daylight — but deep shadow must still go black.
If the glow wraps the full disc, this is too wide.

**`twilightIntensity = 1.0`** [L]. 1.0 is the physical result with no band gain, as in every
other row. Titan is the one body where a value > 1 could be argued, and it should still not
be used: the twilight surge is already carried by the forward lobe (§2.5), and a gain here
would double-count it in a place that is not angle-dependent.

**`exposure = 2.0`** [L]. `exposure` scales only the in-scatter emission
(`shell/fragment.wesl:264`); the transmittance that dims the disc beneath is untouched. So
this dial trades haze glow against the disc's own tint and nothing else. Starting at 2.0 —
between Mars's 1.5 and Pluto's/Earth's 2.35, below Venus's 3.0, because Titan's disc is 3×
darker than Venus's while its shell is comparably thick. **Judge on three things, in order:**

1. The shell must not flatten the disc into a uniform wash. Titan's ground is a flat Lambert
   sphere here (§0), so the only structure in the disc is its own shading gradient plus the
   shell's; if the terminator gradient washes out, this is too high. Note that `exposure`
   cannot be used to fix the disc's brightness or hue — §0 works out why.
2. At phase ≳150° the limb ring must be at least as bright as the sunlit crescent — that is
   GM+17's measurement, not a preference.
3. In a frame containing Saturn, Titan must read clearly darker (A_g 0.21 against ~0.5). It
   will read less dark than that until the seed albedo is recalibrated (§4), and that gap is
   not this dial's to close.

---

## 6. The row

```ts
titan: {
  // Cloud-tops-as-ground like Venus, but the offset is NOT free here: altitude 0 is the
  // nadir tau=1 haze level, 160 km up, which is 6.2% of the radius against Venus's 1.1%.
  // The shell CANNOT be raised to meet it — `planetRadiusKm` above the rasterised radius
  // makes the fragment's ground test true where no disc was drawn, and the limb glow is
  // amputated (shell/fragment.wesl:176-181). So Titan is drawn 6% small and the shell is
  // concentric with what is actually there. Needs `planetRenderer` on the analytic-sphere
  // ray test: the tessellated silhouette inscribes by 0.43%, the same failure in miniature.
  planetRadiusKm: seededPlanet('titan').radiusKm,
  // [D] 7.8 aerosol scale heights — limb tau falls to 0.009 there, and it reaches the
  // detached haze's 500 km, so the shell never has to grow.
  atmosphereTopKm: seededPlanet('titan').radiusKm + 350,
  constituents: [
    {
      // [D] N2 (98.5%) + CH4 (1.5%) at 193 Pa, 172 K (HASI/Huygens; He+21 sigmas). 0.12-0.26%
      // of the extinction — correctness only, and never a colour dial. No methane constituent
      // on this row, unlike Uranus/Neptune: the CH4 column above the reference is 1.9e-3 km-am
      // against the 4 km-am Karkoschka retrieves for the whole atmosphere. The bands are real
      // and they are all below the drawn sphere, so they live in its albedo, not in a row.
      scatter: [1.62e-5, 3.84e-5, 9.58e-5],
      absorb: [0, 0, 0],
      profile: { kind: 'exponential', scaleHeightKm: 43 }, // [M] HASI dlnp/dz, 160-180 km
      phase: { kind: 'rayleigh' },
    },
    {
      // Organic haze, forward lobe. TWO lobes because the particles are FRACTAL AGGREGATES,
      // not spheres: a 2-3 um projected area gives a 7.7 deg diffraction lobe, while the
      // 0.05 um monomers keep a Rayleigh-ish backscatter. One g must sacrifice one of them —
      // g=0.85 alone darkens the low-phase disc ~6x, g=0.55 alone drops p(0) from ~40 to 7.7
      // and kills the twilight surge that is Titan's defining optical property (Titan at
      // phase 166 deg is as bright as at phase 0). The two rows SUM to the haze column;
      // changing one alone breaks the extinction.
      // [D] beta = tau/H with tau = 0.61/1.00/1.69 above the reference. tau_B/tau_R = 2.77
      // BEFORE absorption: the measured lambda^-2.339 opacity law is itself the aggregate
      // signature — D_f = 2 gives lambda^-2 exactly, a Mie sphere would give lambda^0.
      scatter: [6.67e-3, 10.68e-3, 16.07e-3],
      // [D] beta*(1-w) with w = 0.986/0.962/0.858, inverted from Karkoschka 98's measured
      // full-disk albedo through van de Hulst similarity at q = 2.4 (GM+17 measure q=1.9-2.9).
      // 28x more absorbing in blue than red — this, not `scatter`, is most of Titan's orange.
      // The 440 nm value is the row's soft spot twice over: DISR is unconstrained below
      // 490 nm, and a flat q OVER-states blue absorption, so 0.858 is a lower bound on w.
      absorb: [0.096e-3, 0.427e-3, 2.66e-3],
      profile: { kind: 'exponential', scaleHeightKm: 45 }, // [M] Doose+16 revision via GM+17
      phase: { kind: 'henyeyGreenstein', g: 0.85 }, // [D] width-matched to 1.22*lambda/2r_p
    },
    {
      // Organic haze, broad lobe — same medium, same single-scattering albedo, 50/50 energy
      // split (the aggregate's projected area is filled ~once, so half the extinction is
      // diffraction). Pair mean cosine 0.55, which is the g the `absorb` inversion assumed.
      // [L] on g: it must stay positive (the D_f=2 structure factor still leans forward) and
      // small enough to keep p(180) usable. HG has no aggregate backscatter structure and
      // the pair's p(0)=42 is still ~5x under the truth — accepted, not a miss to chase.
      scatter: [6.67e-3, 10.68e-3, 16.07e-3],
      absorb: [0.096e-3, 0.427e-3, 2.66e-3],
      profile: { kind: 'exponential', scaleHeightKm: 45 },
      phase: { kind: 'henyeyGreenstein', g: 0.25 },
    },
    // [M] No tent for the detached haze at 500 km: normal tau ~1e-3, limb tau ~0.03 (100x
    // thinner than Neptune's Aerosol-4, which is already a look risk), and it was undetectable
    // from late 2012 to early 2016. A layer that comes and goes is not a table constant.
  ],
  // [M] The measured disc albedo is [0.28, 0.21, 0.12] (Karkoschka 98) and the seed is
  // ~2.8x brighter in every channel, which at tau~1 is a first-order error in the
  // multi-scatter bounce, not Pluto's 1% rounding. Deliberately NOT fixed here: the seed's
  // hue is right (B/R 0.4375 vs 0.417) because it was eyeballed as the composite, which is
  // a table-wide mistake — docs/backlog/2026-08-18-body-seed-albedos-vs-measured.md.
  groundAlbedo: seededPlanet('titan').albedo,
  // [L] The table's widest terminator, and the one row with a measured reason: H_a/R =
  // 1.5e-2 (GM+17) is ~23x Venus's, so sunlight still reaches the shell top at 29 deg of
  // solar depression against Earth's 10 deg.
  twilightSoftness: 0.12,
  // [L] 1.0 = the physical result. The surge already lives in the forward lobe; a gain here
  // would double-count it, and isotropically.
  twilightIntensity: 1.0,
  sunIrradiance: 1.0,
  // [L] Scales in-scatter only, so it trades haze glow against the disc's own tint. Between
  // Mars's 1.5 and Venus's 3.0: comparably thick shell, 3x darker disc. NOT the dial for the
  // composite being too bright or too red — that is the seed albedo (§0).
  exposure: 2.0,
},
```

Nothing else moves with it. Titan keeps its seed radius and albedo, and gains no texture,
rotation or limb-darkening row (§0) — the one prerequisite is `planetRenderer` on the
analytic-sphere ray test, which lands as its own change before this one.

---

## 7. What would falsify this row

Each of these is a specific thing to look at, with the number it would indict.

- **The disc reads a saturated brown-orange, ~1.7× too bright in red and about right in
  blue.** That is the _prediction_, not a fault: §0 works out a composite of
  ≈ [0.48, 0.28, 0.12] against the target [0.278, 0.214, 0.116], B/R ≈ 0.25 against 0.42, from
  the current seed being read underneath a τ_B/τ_R = 2.77 shell. It indicts the seed (§4), not
  §§1–3, and `exposure` cannot correct it. What _would_ indict this row is the composite
  landing somewhere else: much darker than 0.48 in red says the extinction is too high (check
  τ above the reference, §2.3); B/R near 0.4 with the seed unchanged says the shell is not
  reddening at all (check the `scatter` slope).
- **The disc reads brown-grey instead of orange.** ϖ(440) = 0.858 is too low. It is a lower
  bound by construction (§2.4 — a flat phase integral over-states blue absorption), so raising
  it is the supported direction. Target: the composited disc's B/R must land near **0.42**,
  G/R near **0.77** — but only judge ϖ against that _after_ the seed albedo is on the measured
  scale, since an uncorrected seed misses the same ratios by more, in the same direction, for
  an unrelated reason (previous bullet).
- **The disc is too dark overall, or its shading gradient disappears.** The ground/shell
  split, not the coefficients. The shell removes 46/63/81 % of the disc per channel by
  extinction and adds in-scatter back; if the composite sits far from §0's prediction, the
  split is wrong, not `scatter`.
- **A hard-edged ring of haze over empty background at the limb.** `planetRadiusKm` has been
  raised above the drawn radius, or `planetRenderer` is still taking its silhouette from the
  tessellated mesh (§0). This is a geometry bug, not a tuning problem, and no coefficient
  will hide it.
- **A backlit Titan that is not obviously brighter than a fully-lit one.** The forward lobe.
  GM+17 measure Ag·Φ at 160–166° as "comparable to or higher than at full illumination", most
  strongly where haze absorption darkens the dayside (≲600 nm), and predict an order of
  magnitude at 180°; the two-lobe pair should get part-way there. If nothing happens at high
  phase, check both haze rows are present — collapsing them into one g = 0.55 row loses
  exactly this.
- **A bright thin ring standing off the disc.** Something has been added at 340 km that should
  not be there (§3), or `atmosphereTopKm` is clipping the halo instead of tapering it.
- **The limb is grey rather than warming toward the horizon.** τ_B/τ_R = 2.77 in the shell
  should make grazing paths markedly redder than the disc. If it does not, the `scatter`
  vector's slope has been flattened — check it is still ~λ⁻²·³, the measured aggregate law.
- **Rayleigh visible at all.** It is 0.2 % of the extinction. If changing it changes the
  image, something else is wrong.

---

## Could not verify

- **Tomasko et al. (2008), _Planet. Space Sci._ 56, 669.** Paywalled; Semantic Scholar reports
  no open copy. Its opacity model reaches this note **only** through Bazzon+14's Appendix A.4,
  which reproduces the three power laws and the three-region altitude structure in closed form
  and attributes them to Tomasko's Figures 47 and 50. Every haze coefficient in §2 rests on
  that transcription. Its Table 2 (single-scattering albedo per wavelength) and Figure 48 are
  **not** reproduced anywhere I could open, which is why §2.4 derives ϖ instead of quoting it.
- **Doose et al. (2016), _Icarus_ 270, 355.** Paywalled; the NTRS record has no attached PDF.
  The one thing taken from it — that the aerosol scale height falls from ~65 km to ~45 km above
  ~140 km — comes through GM+17's `H_a/R ∼ 45/3000`, and its direction is corroborated
  independently by Seignovert+17's measured 35 km at 500 km. The §0 optical-radius check does
  not adjudicate between 45 and 65.
- **Tomasko & Smith (1982).** The optical radii 2850 km (452 nm) and 2800 km (648 nm) are the
  normalisation radii GM+17 quote when re-scaling those Pioneer 11 phase curves. They are the
  radii that analysis _adopted_, not an independent measurement of Titan's optical radius, and
  the §0 cross-check should be read as such.
- **The phase integral per channel.** GM+17 give q = 1.9–2.9 across fifteen passbands and plot
  the per-band values in their Figure 1; the figure is not machine-readable and the values are
  not in the text. §2.4 uses a flat q = 2.4 and reports the full sensitivity, which is the
  largest single uncertainty in the row.
- **The aggregate phase function itself.** Tomasko+08 tabulate F₁₁(θ) for two altitude regions
  from 355 nm to 5166 nm (Bazzon+14 §7.2 describes using the table). Not opened, so §2.5's
  two-lobe split is built from the diffraction argument and the verified projected-area radius,
  not fitted to the measured function. The 50/50 energy split is the weakest link in it.
- **The detached layer's thickness.** Seignovert+17 establish that resolving it needs better
  than 10 km sampling; I could find no published FWHM. Only matters if §3's recommendation is
  overruled.
- **van de Hulst (1980), _Multiple Light Scattering_.** Not opened. The similarity
  approximation A_sph = (1−s)(1−0.139 s)/(1+1.17 s) used to invert ϖ in §2.4 is quoted from
  memory. It is the only unsourced formula here and it carries the whole `absorb` vector. Its
  limits are right and its outputs sit inside Bazzon+14's stated ϖ range, but a reader who
  wants to check `absorb` should check this first. Bazzon+14 cite the book in their reference
  list, which is where I would go for the printed form.
- **Khare et al. (1984) tholin optical constants.** Not opened, and deliberately not used —
  see §2.2(b). No number in this note depends on them.
- **Titan's GM = 8978.14 km³/s².** Quoted from memory (Jacobson et al. 2006). It is used
  **only** to cross-check the surface gravity derived from the HASI pressure gradient (1.200
  against 1.191 m/s²). No coefficient depends on it; the scale height comes off the measured
  profile directly.
- **No Cassini ISS visible mosaic exists** — verified against the USGS mosaic bucket, the NASA
  Photojournal, Björn Jónsson's map set and Solar System Scope: every global Titan product is
  ISS 938 nm or radar, and every true-colour image is a single-hemisphere perspective disc.
  Titan draws flat (§0), which changes what the "ground" is but not the reference level.
