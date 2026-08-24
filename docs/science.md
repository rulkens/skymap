# What the pixels mean

The math and conventions behind skymap's galaxy rendering: where galaxies are placed, how catalogue brightness and colour become pixels, and what corrections are applied for survey selection effects.

## Coordinate frame

Skymap uses a right-handed equatorial Cartesian frame, distances in megaparsecs (Mpc):

- `+x` → (RA = 0°, Dec = 0°), the vernal equinox direction
- `+y` → (RA = 90°, Dec = 0°)
- `+z` → Dec = +90°, the celestial north pole

Galaxies, stars, structures, the solar system, and Earth all share this one frame, which is what makes the zoom continuous across scales.

## Distance model

Distance from redshift is the line-of-sight comoving distance in a flat ΛCDM cosmology: `d_C(z) = (c/H₀) ∫₀^z dz′/E(z′)` with `E(z) = √(Ω_m(1+z)³ + Ω_Λ)`, `H₀ = 70 km/s/Mpc`, and `Ω_m = 0.315` (Planck 2018). The integral is evaluated numerically with Simpson's rule in `src/utils/math/redshiftToDistanceMpc.ts`. The linear approximation `d = cz/H₀` would be wrong by tens of percent for the deep catalogs (Milliquas reaches `z ≈ 7`); it is used only for the handful of blueshifted rows below, where the two agree.

Inside 30 Mpc, where peculiar velocities dominate the cosmological redshift signal and the linear approximation breaks down, the pipeline substitutes a measured distance from the Cosmicflows-4 program (or HyperLEDA's `mod0` where CF4 has no match) instead of deriving position from cz. The catalogued spectroscopic redshift is kept alongside the override so the InfoCard still shows the published value even though position comes from the measured distance.

Blueshifted rows without a matched distance come from a small curated table of nearby galaxies with negative recession velocities (the Local Group and its immediate neighbours). They are placed in their true sky direction at `|cz|/H₀`, never mirrored to the antipodal point, which is what a naive `cz/H₀` on a negative `cz` would produce.

## Brightness

Real catalogue galaxies span roughly ten magnitudes of apparent brightness (the brightest entries are on the order of 10⁴× brighter than the faintest), so drawing every galaxy as an identical dot throws away most of the visual information. Three controls decide what reaches the screen:

- **Catalogue magnitude → per-galaxy alpha** (automatic, vertex stage): each galaxy's apparent magnitude maps to an intensity in `[0.05, 1.0]` via `clamp((22 − magnitude) / 8, 0.05, 1.0)`. A magnitude-14 nearby spiral renders at roughly 20× the alpha of a magnitude-22 background galaxy; the 0.05 floor keeps the faintest detections barely visible instead of fully transparent, so sparse survey regions don't read as gaps.
- **Global brightness slider** (0.2–3.0, default 1.0): a uniform per-galaxy intensity multiplier, exposed in the Settings panel, that scales the whole sky up or down without re-uploading point data.
- **Camera-distance depth fade** (toggle, default on): a fragment-stage alpha gate, `1 / (1 + (camDist / FALLOFF_HALF)²)`, that tames the additive-overlap glow near the origin, where every sightline through Earth stacks hundreds of billboards on top of each other.

These three controls are a display concern: they change how an individual galaxy looks, not what the catalogue represents. Density correction, below, is a separate concern; it corrects for what flux-limited surveys systematically over- or under-sample. Tone-mapping is a third: it operates on the accumulated HDR output of the entire frame, not on individual galaxies.

## Density correction (Malmquist bias)

Flux-limited surveys over-represent nearby galaxies, because faint ones are only detectable when close. Astronomers call this the Malmquist bias. At a fixed flux limit, only the intrinsically luminous galaxies in the back of the volume make it into the catalogue, so naive count-as-density rendering overweights nearby faint galaxies and distorts the apparent shape of large-scale structure. Skymap offers five runtime-selectable correction modes, in the Settings panel:

- **None**: raw catalogue; apparent over-density is visible near the origin.
- **Volume-limited** (recommended): show only galaxies brighter than a tunable absolute-magnitude threshold `M_lim`. Default `M_lim = −19`, matching SDSS's spectroscopic completeness near 750 Mpc. Honest in the sense that it shows a uniformly-detectable subsample without reweighting anything.
- **1/V_max alpha**: keep all data, but dim each galaxy by its inverse maximum-detection volume (Schmidt 1968 weighting), applied as alpha instead of a discard.
- **Schechter LF**: modulate per-distance alpha by the inverse of the expected number density predicted by each survey's Schechter luminosity function. The most aggressive correction; it visually flattens the local cluster into the wider cosmic web.
- **Angular re-weight (HEALPix)**: bin the sky into HEALPix cells per catalogue and modulate per-galaxy alpha by the ratio of median angular density to local angular density. This is a separate axis from the four modes above. It corrects footprint-shaped non-uniformity (in particular GLADE's pencil-beam "jets," which come from deep SDSS-DR12-only entries dominating outside SDSS's own footprint), and each catalogue is corrected against its own coverage so one survey's footprint can't contaminate another's correction.

A related build-time-only knob: running the catalogue builder with `--glade-isotropic` drops GLADE rows whose only parent catalogue is SDSS-DR12 before the binary files are even written. It removes the same radial jet structures as the angular re-weight mode, at the cost of discarding those rows outright instead of dimming them.

The flux-limit table (`src/data/galaxyCatalog/galaxyCatalogFluxLimits.ts`) hard-codes `m_lim` and `(M*, α, φ*)` per survey, based on:

- SDSS: Blanton et al. 2003 r-band luminosity function; `m_r ≤ 17.77` spectroscopic completeness.
- 2MRS: Huchra et al. 2012 catalogue; `K_s ≤ 11.75`; Kochanek et al. 2001 K-band luminosity function.
- GLADE: B-band parent samples (HyperLEDA, GWGC); Norberg et al. 2002 `b_J` Schechter function as the closest available proxy.

## Per-survey colour indices

Each survey is coloured by its own most-informative photometric pair, since the five magnitude slots in the binary format carry different bands depending on the source. The raw colour difference is normalised to the shader's blue → white → red ramp at upload time, and a per-row K-correction coefficient compensates for redshift band-shifting before the ramp is sampled. Rows whose preferred bands aren't measured render with a fixed mid-ramp tint instead of poisoning the ramp with NaN.

| Survey | Colour | Natural range | K per unit z | Why this k                                                       |
| ------ | ------ | ------------- | ------------ | ---------------------------------------------------------------- |
| SDSS   | u−g    | 0.5 .. 2.0    | 3.0          | Calibrated against the SDSS spectroscopic sample.                |
| GLADE  | B−J    | 0.5 .. 3.5    | 1.0          | Optical–NIR pair; B redshifts out of band slowly.                |
| 2MRS   | J−K    | 0.7 .. 1.1    | 0.0          | NIR colours are nearly redshift-invariant in 2MRS's z ≲ 0.1 box. |

### K-correction

As redshift increases, a fixed observed photometric band samples progressively bluer rest-frame light: a galaxy's u−g colour at z=0.2 measures different rest-frame light than the same galaxy's u−g at z=0. The K-correction coefficient above is a first-order linear approximation of that shift, applied per row before the colour ramp is sampled, so a galaxy's rendered hue tracks its intrinsic colour instead of its redshift. 2MRS's K=0 reflects that near-infrared colours are close to redshift-invariant over the survey's shallow depth; SDSS's optical u−g band shifts fastest and gets the largest coefficient.

## Galaxy level of detail

Between the point-cloud dot and a downloaded thumbnail, skymap draws each galaxy through three passes that hand off as apparent size crosses fixed thresholds, chosen so the network stays quiet until a galaxy is worth the round trip.

**Below 8 px apparent size**: a screen-aligned billboard dot, coloured by the per-survey colour index above. Most on-screen galaxies are in this state at any given moment.

**8–24 px**: a procedural 3D-oriented disk impostor, rendered entirely on the GPU with no network fetch and no atlas slot. Each disk is a world-space quad oriented by the galaxy's catalogue axis ratio (b/a → inclination via cos i) and position angle (east of north); foreshortening falls out of the perspective projection naturally as the camera orbits. The shape is a soft elliptical disk with a brighter Gaussian bulge in the middle and an exponential falloff outward, hued from the same colour-index ramp the dot pass uses so a galaxy's procedural disk matches its companion dot's colour exactly.

The dot-to-disk handoff crossfades over an 8–14 px band: a `t²(3 − 2t)` smoothstep ramps the disk in while the dot fades out by the complementary curve `1 − t²(3 − 2t)`. The two curves sum to exactly 1.0 across the band, so the per-galaxy HDR contribution stays constant through the transition (no double-bright donut at the boundary). Above 14 px the procedural disk is at full alpha.

**Above 24 px**: a real thumbnail, fetched from SDSS DR18 ImgCutout (the primary source, covering roughly a third of the sky) or CDS hips2fits (the all-sky fallback: lower resolution, monochrome DSS POSS-II red, but CORS-safe and covering every direction). Thumbnails live in a single 2048×2048 RGBA8 atlas of 128×128-pixel slots; when the atlas is full, the least-recently-visible slot is evicted. A priority fetch queue caps concurrency at 4 downloads and serves the largest-on-screen pending galaxies first. Each quad uses a radial alpha falloff so the JPEG-square outline fades into a soft blob against dark space.

The middle pass exists because fetching a thumbnail for every galaxy past a few pixels would overwhelm the SDSS/CDS endpoints and thrash the atlas. The procedural disk carries "this is a galaxy with a bulge and a tilt" down to 8 px without touching the network; thumbnails are reserved for the few galaxies a user has actually zoomed in on.
