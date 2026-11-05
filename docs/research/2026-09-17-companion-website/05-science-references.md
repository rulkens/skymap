# 05 — Science, models and bibliography

Subagent sweep, 2026-09-17, `main` @ `845720549`. Unverified; open the cited file before relying on a claim. Citations are transcribed as the sweep reported them — check each against the citing file before it reaches a public bibliography.

## 1. Bibliography (deduplicated)

Two curated spines already exist: `ATTRIBUTIONS.md` (per-dataset citation, licence, required acknowledgment) and `docs/science.md` (prose with inline paper links). `docs/research/milky-way/literature.md` is a verified-citations table with an "add nothing unchecked" rule and a "What we could not support" section.

**Cosmology / distances**

- Planck 2018 (arXiv:1807.06209) → `src/utils/math/redshiftToDistanceMpc.ts`, `constants.ts`; also the 14.3 Gpc horizon (`horizonShellRenderer.ts`).
- Hogg 1999 (astro-ph/9905116), Pen 1999 → `src/utils/math/lookbackTimeGyr.ts`, `hubbleVelocityKmS.ts`.
- Davis & Lineweaver 2004 → `hubbleVelocityKmS.ts`.
- Schmidt 1968 (1/V_max) → `src/utils/math/vMaxWeight.ts`.
- Górski et al. 2005 (HEALPix) → `src/utils/math/healpixNest.ts`.

**Galaxy catalogs and survey bias** (per-source modules under `src/layers/galaxyCatalog/sources/`)

- SDSS DR17 (Abdurro'uf+2022); 2MRS Huchra+2012; GLADE Dálya+2018; HyperLEDA Paturel+2003, Makarov+2014; 2MASS XSC Jarrett+2000; Milliquas; DESI DR1 (+ verbatim acknowledgment); DESI Legacy Dey+2019.
- Schechter LF: Blanton+2003 (SDSS), Kochanek+2001 (2MASS), Norberg+2002 (2dF).
- Quasar LF: Croom+2009, Ross+2013 → `sources/milliquas.ts`.
- Colour bimodality: Strateva+2001, Baldry+2004 → `src/utils/math/galaxyTypeFromColor.ts`.
- Stellar mass: Bell+2003, McGaugh & Schombert 2014, Moster+2013 → `tools/catalog/estimateLog10StellarMass.ts`.
- de Vaucouleurs+1991 (RC3) → `galaxyGenerator/shared/hubbleStageOf.ts`.

**Stars / photometry**

- Gaia DR3 (Vallenari+2023), GCNS (Smart+2021), Bailer-Jones+2021, Hipparcos-2 (van Leeuwen 2007).
- Mucciarelli+2021 (BP−RP → T_eff) → `src/utils/astro/starTeffK.ts`.
- Andrae+2018 (BC_G) → `src/utils/astro/bolometricCorrectionG.ts`.
- Pecaut & Mamajek 2013 → `src/data/bodies/sStarAppearance.ts`.
- Pogson → `shaders/lib/astro.wesl`; Lupton asinh → `src/data/toneMapCurve.ts`.

**Galactic centre / lensing**

- Gillessen+2017 → `src/data/bodies/sStarElements.ts`. Abd El Dayem+2026 (S301). GRAVITY 2019 → `sceneSgrAStar.ts`. Plewa+2015. Reid & Brunthaler 2004.
- Bruneton 2020 (arXiv:2010.08735), reference baseline only → `src/utils/lensing/buildSchwarzschildDeflectionLut.ts`.

**Cosmic web / volumes / flow**

- Sousbie 2011 (DisPerSE) → `tools/filaments/buildFilaments.ts`.
- Elek+2021/2022, Burchett+2020, Wilde+2023 (MCPM / Polyphorm / Cosmic Slime VAC) → `tools/volumes/`, `tools/mcpm-workbench/`.
- Tully+2023 (CF-4), Courtois+2025 (CF4++), Valade+2024 (HAMLET, future swap) → `tools/flow/buildFlowField.ts`.
- MCXC Piffaretti+2011; MSCC Chow-Martínez+2014; Einasto+2001/2011.
- Edenhofer+2024 (3D dust) → `tools/volumes/extractDustCube.py`.
- ~15 further papers surveyed in `docs/research/2026-05-04-cosmic-web-visualization.md`.

**Milky Way / morphology** (tabled in `docs/research/milky-way/literature.md`)

- Freudenreich 1998 (the load-bearing model); Drimmel & Spergel 2001; Chen+2019 (warp); Bland-Hawthorn & Gerhard 2016; Licquia & Newman 2016; Wegg & Gerhard 2013 → `src/data/milkyWay/milkyWayGalaxyParams.ts`.
- Reid+2019, Reid+2014 (arm widths) → `galaxyGenerator/v2/armRidgeGeometry.ts`.
- Rix & Zaritsky 1995; Antoja+2011; Vogel & Ostriker 2006; Kim & Ostriker 2002/2017.
- Bulge / bar decomposition: Laurikainen+2010, Salo+2015, Buta+2015, Gao+2019, Gadotti 2009, Kormendy & Kennicutt 2004 → `galaxyGenerator/shared/galaxyLightDecomposition.ts`.
- SF / ISM: Gerola & Seiden 1978, Dobbs & Baba 2014, Kennicutt 1989.
- Dust: Cardelli, Clayton & Mathis 1989 → `src/utils/galaxy/dustExtinctionRgb.ts`; Xilouris+1999, De Geyter+2014.
- ~80 further papers in `docs/research/m74-jwst/*` — a ready "further reading" appendix.

**Solar system / atmospheres**

- JPL SSD Keplerian elements + satellite mean elements → `src/data/bodies/orbitalElements.ts`; Explanatory Supplement 3rd ed. (Pluto).
- Archinal+2018 (IAU rotation) → `src/data/bodies/rotationElements.ts`.
- Chandrasekhar 1960, Dones+1993 → `shaders/bodies/ring/fragment.wesl`.
- Bruneton & Neyret 2008, Hillaire 2020 — method reference, no code reused.
- Per-body atmosphere papers, each file with a "sources actually opened" table: `docs/research/atmospheres/{venus,mars,titan,jupiter-saturn,uranus-neptune}.md`.

**Graphics:** mrange "Spiral galaxy" (CC0); Loop & Blinn 2005; Woodcock tracking; d3-celestial; mulberry32.

**Self-citation:** `CITATION.cff` — v0.5.0, DOI 10.5281/zenodo.20037028.

**Tour facts:** ~35 sourced popular-science claims in `docs/tour/stages/*.facts.md`.

## 2. Models implemented

- **Comoving distance, flat ΛCDM** — Simpson's rule, 64 panels — `src/utils/math/redshiftToDistanceMpc.ts` (+ inverse LUT).
- **Recession velocity and lookback time** — `hubbleVelocityKmS.ts`, `lookbackTimeGyr.ts`, shown as Earth eras (`earthEraForLookback.ts`).
- **Coordinate frame** — one right-handed ICRS / J2000 equatorial Cartesian frame in Mpc — `src/utils/math/raDecZToCartesian.ts`, `galacticToCartesian.ts`; `src/data/bodies/orbitPlaneFrames.ts`.
- **Redshift-independent distance ladder** inside 30 Mpc — `tools/catalog/catalogDistanceFor.ts`.
- **Star distances** — photogeometric → geometric → GCNS — `tools/stars/resolveStarDistancePc.ts`.
- **Malmquist-bias correction, 5 modes** — none / volume-limited / 1/V_max / Schechter inverse density / HEALPix angular re-weight — `src/data/galaxyCatalog/biasMode.ts`, `src/services/engine/bake/`.
- **Photometry → brightness** — Pogson flux, inverse-square, exposure ramp — `shaders/lib/starPhotometry.wesl`.
- **Galaxy surface brightness** — `src/utils/galaxy/galaxySbAmp.ts`.
- **Colour** — per-survey index with a first-order K-correction — `src/data/galaxyCatalog/colourIndex.ts`.
- **Stellar colour / temperature and derived properties** — `src/utils/color/starTintFromBpRp.ts`, `src/utils/astro/*`.
- **Orbital mechanics** — Keplerian elements, eccentric-anomaly solve, hyperbolic branch — `src/utils/orbit/*`.
- **Time systems** — `src/utils/time/*`. **Body rotation** — `src/utils/orbit/rotationFromIau.ts`.
- **Atmospheres** — three-LUT pipeline, 9 bodies with [M]/[D]/[L]-tagged constituent tables — `src/data/bodies/atmosphereParams.ts`.
- **Saturn's rings** — Chandrasekhar single-scattering slab, analytic planet shadow.
- **Black hole** — Schwarzschild photon-orbit ODE → bending-angle LUT — `src/utils/lensing/buildSchwarzschildDeflectionLut.ts`.
- **Milky Way** — Gaussian-mixture fit to Freudenreich 1998, analytic arm ridges, bar, HII, ISM map — `galaxyGenerator/v2/*`.
- **Dust** — CCM89 baked at sRGB primaries; Edenhofer volume; multiplicative transmittance.
- **Cosmic web** — DisPerSE skeleton with a radial-selection correction; MCPM raymarch; CF4++ advection.
- **Horizon shell** — particle horizon at 14.3 Gpc.

## 3. Simplifications the repo itself admits

- **Fingers-of-god not corrected** beyond 30 Mpc (`docs/science.md`).
- **H₀ = 70 is a round number**; the comment in `src/utils/math/constants.ts` ("since we're using the linear approximation anyway") is stale against the Simpson integral.
- **Lookback time** is the low-z coasting approximation.
- **Stellar properties are order-of-magnitude**: no extinction correction, solar metallicity assumed.
- **K-correction is first-order only.**
- **Milky Way warp not modelled**; `warpStrength: 0.15` self-flagged UNVERIFIED.
- **Freudenreich 1998 has no spiral arms** — arms are tunable parameters, not pinned measurements.
- `corotationRadius` assumes a single fixed pattern speed.
- Named unsupported claims listed in `docs/research/milky-way/literature.md`.
- **MCPM is baked, not simulated**; workbench trace mass is ~9.28× below the reference VAC — unresolved (`docs/research/mcpm-trace-mass-offset.md`).
- Only CF4++ mean density is used; the per-cell σ is unexploited.
- **DisPerSE input is flux-limited**, corrected by point duplication.
- **Galaxy appearance is a normalisation choice, not physics** (`SB_REF_DIAMETER_KPC = 30`, slider flux units, HII tunings, black-hole disk angle).
- **Atmospheres**: only Earth is the reference set; others are "physically motivated but eye-tuned". Venus / Titan altitude 0 is the cloud top.
- **Pluto colour**: "enhanced vs natural" is the repo's inference, not a NASA label.
- Surface elevations are not modelled for surface-fixed sites.
- Three curated thumbnails carry `"license": "unknown"` (c17, c18, c29).
- **`docs/research/2026-05-03-cluster-void-visualization.md` carries an unreliability banner** — do not publish as-is.

## 4. Doc inventory and readiness

- `docs/science.md` — the flagship; website-ready essentially verbatim; ends with a "Corrections welcome" invitation.
- `docs/references/orbit-trail-{fragment-math,rendering}.md` — ready as graphics deep-dives.
- `docs/research/` (67 files):
  - `milky-way/literature.md` — publish nearly as-is.
  - `milky-way/` (15 files) — a living findings record; the decision docs are good long-form material.
  - `atmospheres/*.md` — publishable as per-body atmosphere pages.
  - `m74-jwst/` (12 files) — rich, needs an editorial pass.
  - `2026-07-30-galaxy-rendering-primitives.md` — strong, long; numbers tagged SOURCED vs DERIVED.
  - `2026-05-04-cosmic-web-visualization.md`, `2026-06-05-desi-dr1-as-a-data-source.md`, `2026-08-20-powers-of-ten-to-the-eye.md`, `mcpm-trace-mass-offset.md` — publishable with status framing.
  - `engine/`, `mcpm-workbench-production-review/`, `2026-08-24-camera-pivot/` and the spike / ideation notes — software architecture, not science-site material.
- `docs/audits/` (4 files) — engineering only; not website material.
