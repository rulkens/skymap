# What the pixels mean

How skymap turns measurements into a picture: where every object's position comes from, how brightness and colour are derived, which survey biases are corrected, and which parts of the scene are measured, reconstructed, or modelled. Each section is short on purpose and links to the paper or source file that carries the detail.

## The data

### Coordinate frame

One right-handed equatorial Cartesian frame for everything, in megaparsecs: `+x` toward (RA 0°, Dec 0°), `+y` toward (RA 90°, Dec 0°), `+z` toward Dec +90° ([raDecZToCartesian.ts](../src/utils/math/raDecZToCartesian.ts)). Galaxies, stars, planets, and Earth share it, which is what makes the zoom continuous across scales.

### Where things are

- **Galaxies**: line-of-sight comoving distance in flat ΛCDM (`H₀ = 70 km/s/Mpc`, `Ω_m = 0.315`), integrated with Simpson's rule in [redshiftToDistanceMpc.ts](../src/utils/math/redshiftToDistanceMpc.ts). Inside 30 Mpc, where peculiar velocities swamp the Hubble flow, measured redshift-independent distances take over: a curated seed of 14 hand-verified nearby galaxies, then Cosmicflows-4 ([project page](https://projets.ip2i.in2p3.fr/cosmicflows/)), then HyperLEDA `mod0` ([catalogDistanceFor.ts](../tools/catalog/catalogDistanceFor.ts)). A blueshifted galaxy none of those covers is placed in its true sky direction at `|cz|/H₀`, never mirrored through the origin.
- **Stars**: Bailer-Jones EDR3 distances, photogeometric estimate first, geometric fallback, GCNS as last resort; naive `1/parallax` is deliberately not used ([resolveStarDistancePc.ts](../tools/stars/resolveStarDistancePc.ts)). The bin covers Gaia DR3 to `G < 14` plus the GCNS 100 pc census and a Hipparcos-2 patch for the bright stars Gaia saturates on.
- **Solar system**: Keplerian elements from JPL SSD's approximate-positions table (Pluto's from the Explanatory Supplement to the Astronomical Almanac, moons from JPL's satellite elements), propagated on the simulation clock ([orbitalElements.ts](../src/data/bodies/orbitalElements.ts), [keplerianPositionMpc.ts](../src/utils/orbit/keplerianPositionMpc.ts)).
- **S-stars**: 39 orbits around Sagittarius A\* transcribed from Gillessen et al. 2017, ApJ 837, 30 ([sStarElements.ts](../src/data/bodies/sStarElements.ts)).

### Survey bias

Flux-limited surveys over-represent nearby galaxies, because faint ones are only detectable when close (the Malmquist bias). Five runtime-selectable correction modes respond to it ([biasMode.ts](../src/data/galaxyCatalog/biasMode.ts)):

- **None**: raw catalogue.
- **Volume-limited**: only galaxies brighter than a threshold `M_lim` (default −19), a uniformly-detectable subsample.
- **1/V_max**: dim each galaxy by its inverse maximum-detection volume (Schmidt 1968), as alpha instead of a discard.
- **Schechter LF**: dim by the inverse expected number density from each survey's Schechter luminosity function.
- **Angular re-weight** (default): per catalogue, weight each galaxy by median versus local density in HEALPix-cell × distance-shell bins ([computeAngularWeights.ts](../src/services/engine/bake/computeAngularWeights.ts)). Corrects footprint artifacts such as GLADE's pencil-beam jets.

Per-survey flux limits and Schechter parameters live in the source modules under [src/data/sources/](../src/data/sources/), with their literature origins noted there (Blanton 2003, Kochanek 2001, Norberg 2002).

### Measured, derived, or modelled

Three kinds of content share the scene. Knowing which is which is the honest core of the visualization.

**Measured**: every catalogued position, magnitude, and redshift above; the Gaia star field; galaxy thumbnails (real SDSS DR18 and DSS imagery); the famous atlas photographs (credits in [ATTRIBUTIONS.md](../ATTRIBUTIONS.md)).

**Derived**: reconstructions computed from measurements by a published algorithm.

- **Filaments**: ridges of the Delaunay-tessellated galaxy density field, extracted by [DisPerSE](https://www2.iap.fr/users/sousbie/web/html/indexd41d.html) ([Sousbie 2011](https://arxiv.org/abs/1009.4015)) with a 5σ persistence cut and 2 smoothing passes over the 2MRS+GLADE catalogs ([buildFilaments.ts](../tools/filaments/buildFilaments.ts)).
- **MCPM cosmic web**: the Monte Carlo Physarum Machine ([Elek et al. 2022](https://arxiv.org/abs/2204.01256), implemented in [Polyphorm](https://github.com/CreativeCodingLab/Polyphorm)) fits a swarm of slime-mould-inspired agents to galaxy positions; the accumulated agent trace reconstructs the filamentary density field, an approach introduced for cosmology by [Burchett et al. 2020](https://doi.org/10.3847/2041-8213/ab700c). Skymap renders the SDSS DR17 Cosmic Slime value-added catalog ([Wilde et al. 2023](https://arxiv.org/abs/2301.02719), [VAC page](https://www.sdss4.org/dr17/data_access/value-added-catalogs/?vac_id=cosmic-web-environmental-densities-from-mcpm-slimemold)): a trace cube fit to ~325k SDSS galaxies between 44 and 476 Mpc, 712×1200×728 voxels at 0.78 Mpc per voxel, downsampled into three tiers and log-compressed at build time ([buildMcpmVolume.ts](../tools/volumes/buildMcpmVolume.ts)).
- **CF-4 density and CF4++ flow**: a Bayesian reconstruction of the local density and peculiar-velocity fields from Cosmicflows-4++ distances ([Courtois et al. 2025](https://arxiv.org/abs/2502.01308)), a 128³ grid spanning 1000 Mpc in supergalactic coordinates. The density volume renders the mean density cube; the flow overlay renders the mean velocity cube from the same release ([buildFlowField.ts](../tools/flow/buildFlowField.ts)).

**Modelled**: the procedural Milky Way is a Gaussian-mixture fit to the Freudenreich 1998 COBE/DIRBE near-infrared emissivity model of the Galaxy, built analytically because no imaging of our own galaxy's exterior exists; the warp is currently not modelled ([research notes](research/milky-way/analytic-field.md)). The synthetic fallback catalog shown when no data files are present is random.

## The rendering

### Brightness

Each galaxy's catalogue magnitude and diameter bake into a physical surface-brightness amplitude, so its light spreads over its actual apparent disk ([galaxySbAmp.ts](../src/utils/galaxy/galaxySbAmp.ts)). Three Settings-panel knobs shape the result: **Galaxy brightness** (a gain on that amplitude, default 5), **Bloom ceiling** (clamps any single galaxy's HDR contribution, default 30), and **Distance falloff** (dims unresolved galaxies by `pow(resolvedFraction, k)`, default k = 0.7, toggleable). The falloff tames the additive glow near the origin, where every sightline stacks hundreds of billboards.

### Colour

- **Galaxies**: each survey uses its most informative photometric pair, normalised onto a blue→white→red ramp with a per-row first-order K-correction for redshift band-shifting; rows missing their bands get a neutral mid-ramp tint ([colourIndex.ts](../src/data/galaxyCatalog/colourIndex.ts)). SDSS uses u−g (K = 3.0 per unit z), GLADE B−J (K = 1.0), 2MRS J−K (K = 0, near-infrared colours barely shift at its depth).
- **Stars**: the Gaia point cloud tints by BP−RP through a piecewise ramp over spectral-class anchors ([starTintFromBpRp.ts](../src/utils/color/starTintFromBpRp.ts)); resolved bodies like the Sun use a blackbody-locus polynomial in temperature ([temperatureToLinearRgb.ts](../src/utils/color/temperatureToLinearRgb.ts)).

### From dot to galaxy

A galaxy hands off through four tiers as its apparent size grows, so the network stays quiet until an object earns the fetch ([galaxyLodBands.ts](../src/data/galaxyLodBands.ts)):

- below 8 px: a point sprite
- 8–14 px: crossfade into a procedural disk impostor, oriented by the catalogue's axis ratio and position angle
- 24–40 px: crossfade into a real thumbnail (SDSS DR18, or DSS for the rest of the sky), cached in a 256-slot LRU atlas
- 120–160 px, famous galaxies only: crossfade into a dedicated high-resolution texture

Each crossfade is a smoothstep whose two sides sum to one, so total brightness holds steady through the handoff.

### One HDR frame

Every pass draws into a single `rgba16float` HDR target; one composite pass tone-maps the frame with a runtime-selectable curve: Linear, Reinhard, Asinh (Lupton-style), Gamma 2.0, or ACES ([toneMapCurve.ts](../src/data/toneMapCurve.ts)).

## Corrections welcome

This page is a best effort to describe real astronomy faithfully. If you spot an error, a stale number, a misattributed dataset, or a better way to put any of it, please open an issue or a pull request; corrections from people who work with this data are especially appreciated.
