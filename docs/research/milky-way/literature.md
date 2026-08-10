# Literature

## Literature — verified citations

These were checked. **Add no others to this table without checking them.**

| Source                                                                                                                                       | What it gives                                                                                                                                                                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **Freudenreich 1998**, ApJ 492, 495, [10.1086/305065](https://doi.org/10.1086/305065)                                                        | 47 params fitted to COBE/DIRBE 1.25–4.9 µm. Disc `exp(−R/h_r)·sech²(Z/h_z)`, **h_r = 2.605 ± 0.003 kpc**, **h_z = 0.346 ± 0.001 kpc**. Bar semi-axes 1.696 / 0.643 / 0.443 kpc, tilt **13.79° ± 0.09°**, generalised-ellipsoid exponents C⊥ 1.574, C∥ 3.501. **Contains NO spiral arms** — young-disc features were masked out of the fit. |
| **Drimmel & Spergel 2001**, ApJ 556, 181, [10.1086/321556](https://doi.org/10.1086/321556)                                                   | 26 params. Warped exponential disc, h_r 2.26 kpc, h_z 134.4 pc, **plus** an arm component.                                                                                                                                                                                                                                                 |
| **Chen et al. 2019**, Nature Astronomy, [arXiv:1902.00998](https://arxiv.org/abs/1902.00998)                                                 | Warp line of nodes, Cepheids. Mean **17.5° ± 1° (formal) ± 3° (systematic)**, **leading** spiral. Radially ~0° at 12.5 kpc, rising to ~20°, **flat beyond ~14 kpc**.                                                                                                                                                                       |
| **Jonsson & McMillan 2023**, MNRAS, [10.1093/mnras/stad1502](https://doi.org/10.1093/mnras/stad1502)                                         | Agrees on the leading spiral beyond R ~ 12 kpc, but finds the **linear rise continuing to 16 kpc** rather than flattening.                                                                                                                                                                                                                 |
| **Bland-Hawthorn & Gerhard 2016**, ARA&A 54, 529, [10.1146/annurev-astro-081915-023441](https://doi.org/10.1146/annurev-astro-081915-023441) | Thin disc **h_R = 2.6 ± 0.5 kpc**, thick **2.0 ± 0.2 kpc**; literature spread **1.8–6.0 kpc**. **R₀ = 8.20 ± 0.1 kpc**.                                                                                                                                                                                                                    |
| **Licquia & Newman 2016**                                                                                                                    | Bayesian average of IR scale-length measurements: **2.51 (+0.15 / −0.13) kpc**.                                                                                                                                                                                                                                                            |
| **Sormani et al. 2022**                                                                                                                      | 39-parameter **analytical** model of the 3D bar including the X/peanut shape, fitted to the made-to-measure model of Portail et al. 2017.                                                                                                                                                                                                  |
| **Gaia Collaboration, Drimmel et al. 2022** (DR3 disc mapping)                                                                               | Bar length, orientation angle and pattern speed **still not well constrained**.                                                                                                                                                                                                                                                            |

| **Reid et al. 2019**, ApJ 885, 131, [10.3847/1538-4357/ab4a11](https://doi.org/10.3847/1538-4357/ab4a11) | Maser parallaxes. Per-arm Gaussian widths at reference radii: 3-kpc 0.18, Norma 0.14, Sct–Cen 0.23, Sgr–Car 0.27, Local 0.31, Perseus 0.35, Outer 0.65 kpc. Width law **w(R) = 336 + 36·(R − 8.15 kpc) pc** (their own R₀ = 8.15). Young/maser tracer — a **floor** for old-star arm width; neither Reid paper measures the old-star arm. |
| **Reid et al. 2014**, ApJ 783, 130, [10.1088/0004-637X/783/2/130](https://doi.org/10.1088/0004-637X/783/2/130) | Earlier fit of the same programme: widths 0.17–0.63 kpc, slope **42 pc/kpc** over R 5–13 kpc. Superseded by 2019 where they differ. |
| **Rix & Zaritsky 1995**, ApJ 447, 82, [arXiv:astro-ph/9505111](https://arxiv.org/abs/astro-ph/9505111) | K′-band, 18 face-on spirals: ~half have strong two-armed spirals with arm/interarm contrast **"of order unity"** (≈ factor 2) — the grand-design ceiling for the contrast dial. |
| **Antoja et al. 2011**, MNRAS 418, 1423, [10.1111/j.1365-2966.2011.19190.x](https://doi.org/10.1111/j.1365-2966.2011.19190.x) | **SECONDARY carrier** for two numbers whose primaries resisted fetching: Drimmel & Spergel 2001's MW K-band arm–interarm ratio **K = 1.32 (A₂ = 0.14)** (D&S themselves flag it as possibly a lower limit), and GLIMPSE/Benjamin et al. 2005's **20–30% stellar count excess** at arm maxima (K ≈ 1.3, independent corroboration). D&S's _two-armed old-star structure_ claim is primary-verified from their abstract. |

### The population light decomposition (B/T, Bar/T, halo)

Shipped as `galaxyLightDecomposition`'s stage table; the caveats sit on the
`GalaxyLightDecomposition` type, not here.

| Source                                                                                           | What it gives                                                                                                                                                                                                                                                                                                                                                                                                                                              |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Laurikainen et al. 2010**, MNRAS 405, 1089, [arXiv:1002.4370](https://arxiv.org/abs/1002.4370) | **B/T by Hubble stage, Table 2, verified from the PDF.** Two samples in two bands with the seam at T=1\|2: NIRS0S (Ks) T=−3…1, OSUBSGS (H) T=2…9; Galactic **and** internal extinction corrected. Per-stage N: 35 / 26 / 20 / 38 / 30 / 13 / 6 for T = −2 / 1 / 3 / 4 / 5 / 6 / 7. §1: fitting the bar moved the sample mean B/T 0.55 → 0.30 → 0.25 (nuclear bars), and barred vs unbarred S0s have the **same** B/T (0.29 ± 0.02 vs 0.33 ± 0.03).         |
| **Salo et al. 2015**, ApJS 219, 4                                                                | **Bar/T, Table 7 (S⁴G Pipeline 4).** 3.6 µm, human-supervised bulge/disc/bar/nucleus fits, 2352 galaxies; the published column is already a component's fraction of total model flux, so Bar/T is read off, not derived. Values are **conditional on a bar being fitted** — the bin's fitted fraction is S0 0.43, Sa 0.59, Sb 0.44, Sbc 0.16, Sc 0.31, Sd 0.51/0.47. **The binning by stage is ours**, joined through Buta et al. 2015 (ApJS 217, 32) ⟨T⟩. |
| **Gao et al. 2019**, ApJS 244, 34                                                                | R band, CGS, N=320. Binned the same way gives a smooth Bar/T of 0.13/0.11/0.10/0.09/0.06/0.05 — the **documented fallback** if S⁴G's T=4 dip (0.04, below both neighbours, bar fitted in only 16% of the bin) shows on screen.                                                                                                                                                                                                                             |
| **Weinzirl et al. 2009**, ApJ 696, 411                                                           | Bar/T 0.25/0.18/0.17/0.12/0.09 at T = 1/3/4/5/6 — **1.7× S⁴G throughout**, on the same OSUBSGS H-band images. Three components and no lens, so his bar absorbs oval and lens light S⁴G assigns elsewhere. Not used. **Gadotti 2009** (MNRAS 393, 1531; pooled median 0.095 in i) sides with S⁴G.                                                                                                                                                           |
| **Kormendy, Drory, Bender & Cornell 2010**, ApJ 723, 54                                          | Milky Way, near-IR: **no classical bulge**; 0.19 of the light sits in the bar/pseudobulge. A cross-check on the SBb row, not a table entry — this model has no per-galaxy override.                                                                                                                                                                                                                                                                        |
| **Peters et al. 2017**, MNRAS 470, 427                                                           | The one study listing stellar-halo light fraction alongside morphology. Finds **no correlation** — which is why the halo column is flat.                                                                                                                                                                                                                                                                                                                   |

**LITERATURE, attribution incomplete — flagged deliberately.** Gaia red-clump work (~8.4M stars)
finds a **broken** disc profile: steep inside R ~ 3 kpc, a near-flat plateau 3–7 kpc, exponential
decline past the solar radius to ~13 kpc, sharper drop beyond ~13 kpc. **We do not have a precise
citation for this.** It is reported as literature but the paper was not pinned down. Do not cite
it onward without finding the source.

**LITERATURE, relevant later.** Vergely, Lallement & Cox 2022 — 3D extinction maps. For when dust
becomes a named feature rather than a procedural screen.

The scale-length spread is the point of that table: F98's 2.605, Licquia & Newman's 2.51,
BH&G's 2.6 ± 0.5 with an honest 1.8–6.0 range. **Do not present any single value as precise.**

## What we could not support

- **The Gaia red-clump broken-profile result** (in [the citation table above](literature.md#literature--verified-citations)) — reported as literature, attribution
  incomplete.
- **A halo light fraction by Hubble type — no such measurement exists.** Peters et al. 2017 is
  the only paper listing halo fraction alongside morphology and finds no correlation, so the
  shipped column is a flat 2% (3% at the late end), sourced and flagged. Do **not** convert the
  better-measured _mass_ fractions instead: Peters puts halo M/L at ~3× the disc's while Harmsen
  corrects light→mass the other way by 0.2 dex. They point in opposite directions and must not be
  averaged.
- **An irregular's bar.** The `irregular` category builds no bar geometry, so the Magellanic bar
  that carries an Im's central light has nowhere to go but the disc — the LMC preset's
  `barStrength: 0.6` is inert. A modelling gap, not a decomposition one.
- **The claim that an early hardcoded field used F98's 13.79°** (see [the bar-angle finding](preset-calibration.md#the-bar-angle-was-three-different-numbers-none-agreeing)) — no such literal exists
  in the tree.
- **`warpStrength: 0.15`** ≈ 1.05 kpc of edge bend — the preset flags it UNVERIFIED itself; no
  published warp amplitude was retrieved.
- **Whether emission-with-self-absorption's non-closed-form result** (see [closed form, and its limit](analytic-field.md#closed-form-and-its-limit)) was derived rigorously
  or asserted. The conclusion (dust as a separate screen) is founded either way, but the algebra
  is not written down anywhere in the repo.
- **Whether the raymarch would in fact have been the wrong first call** (see [the diagnosis](goal-and-history.md#diagnosis)). Never measured
  against the split.

## Are the models still current? (checked 2026-08-02)

Both load-bearing models are old — F98 is 28 years old, Gerola & Seiden 48.
Asked and answered by search rather than assumption; the answers differ.

### Freudenreich 1998: not superseded, and for a structural reason

**LITERATURE, verified 2026-08-02.** No 2025-2026 work presents a drop-in
replacement for a full global parametric NIR emissivity model of the Galaxy.
The field moved from all-sky infrared photometric fits to Gaia-parallax-anchored
3D reconstructions, which are better data over SMALLER volumes:

- Gaia XP dust vertical structure (2025) is restricted to R = 6-12 kpc; inside
  5 kpc there is no usable data because extinction kills it.
- RR Lyrae thick disc (2025, Gaia DR3 + PanSTARRS1 + ASAS-SN-II, Bayesian MCMC):
  h_R ~ 2.14 kpc, h_z ~ 0.64 kpc. A different component from F98's thin disc.
- Gaia DR3 young giants (2026) map flare and spiral out to ~8 kpc heliocentric
  and state plainly that a global consensus on spiral-arm geometry remains
  elusive — arm positions, number, orientation, pitch and widths all disputed.

**Why this settles it for us.** We need a whole-galaxy emissivity field to
integrate in closed form, not a well-measured annulus. Gaia is optical and the
inner Galaxy is extincted, so near-infrared remains the only tracer with global
reach. F98 stays because of coverage, not because nothing newer exists.

**Consequence worth carrying:** the 2026 arm-geometry result is positive
support for treating arm pitch/count/width as TUNABLE parameters rather than
pinned measurements. There is no consensus to pin them to.

### SSPSF: demoted, not superseded — and we are using it the demoted way

**LITERATURE, verified 2026-08-02.** Dobbs & Baba 2014, _Dawes Review 4: Spiral
Structures in Disc Galaxies_ ([arXiv:1407.5062](https://arxiv.org/pdf/1407.5062)),
Section 2.5, is the standing verdict: "SSPSF is a secondary effect, rather than a
primary means of generating spiral arms." Arms are seen in the OLD stellar
population, so they are stellar-dynamical, with the gas response amplifying
them. Mueller & Arnett themselves concluded stochastic SF would not produce
global spiral structure but would "add irregular structure in conjunction with
density waves".

**This is exactly [the SF-map decision](sf-map.md)'s architecture.** Arms are supplied as forcing; the
automaton contributes the irregular structure. The modern verdict endorses the
use rather than undermining it — and adds a supporting result: without
feedback, simulated arm widths come out too narrow, and triggered SF is what
produces the wider arms actually seen in HI, CO and Ha.

**LITERATURE, the caveat that bites.** In 3D, equilibrium spiral structure from
SSPSF appears over a far more restricted parameter range than in 2D, and the
equilibria are less distinctive. Our grid is 2D, which is the favourable
regime — do not read the 2D result as licence for a 3D version later.

**LITERATURE, the named upgrade path.** Jungwiert & Palous 1994 (A&A 287, 55)
show ANISOTROPIC propagation probabilities produce highly organised structure,
with arm length, thickness and pitch tunable through the probability ellipse.
If the isotropic Moore-8 neighbourhood underdelivers, that is the next move,
and it is also the hook the survey-to-parameters map wants for spanning
morphologies.

**INFERRED, a caveat against our own `corotationRadius` knob.** The modern
paradigm for arms is transient recurrent ("dynamic") arms: no N-body simulation
reproduces a long-lived Lin & Shu wave, and global arms may be assemblies of
short-lived segments that break and reconnect. A single fixed pattern speed —
which is what `corotationRadius` assumes — is therefore itself a simplification,
not a measurement. It stays because the shear reversal across corotation is
visually load-bearing (see [the SF-map decision](sf-map.md)), but nothing should later be calibrated as if the
pattern speed were a real measured property of the modelled galaxy. Note the
reviews disagree: Shu 2016 and Sellwood & Masters 2021 (ARA&A) reach different
conclusions from Dobbs & Baba.
