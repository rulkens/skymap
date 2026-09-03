# Science notes

How skymap turns measurements into a picture: where things get their positions, how brightness and colour are derived, which survey biases are corrected, and which parts of the scene are measured, reconstructed, or modelled. Each section is short on purpose and links to the paper or source file that carries the detail.

- [The data](#the-data): [Coordinate frame](#coordinate-frame) · [Where things are](#where-things-are) · [Survey bias](#survey-bias) · [Measured, derived, or modelled](#measured-derived-or-modelled)
- [The rendering](#the-rendering): [One HDR frame](#one-hdr-frame) · [Galaxies](#galaxies) · [Stars and the Sun](#stars-and-the-sun) · [Milky Way](#milky-way) · [Solar system](#solar-system) · [Large-scale overlays](#large-scale-overlays) · [Volumes and flow](#volumes-and-flow) · [Labels and picking](#labels-and-picking)
- [Corrections welcome](#corrections-welcome)

## The data

### Coordinate frame

One right-handed equatorial Cartesian frame for everything, axes on the ICRS (J2000) equator and equinox, in megaparsecs: `+x` toward (RA 0°, Dec 0°), `+y` toward (RA 90°, Dec 0°), `+z` toward Dec +90° ([raDecZToCartesian.ts](../src/utils/math/raDecZToCartesian.ts)). Catalogue RA/Dec is used as published; JPL's ecliptic-referenced planetary elements are rotated into the frame by the 23.44° obliquity ([orbitPlaneFrames.ts](../src/data/bodies/orbitPlaneFrames.ts)). Galaxies, stars, planets, and Earth share it, which is what makes the zoom continuous across scales.

### Where things are

- **Galaxies**: line-of-sight comoving distance in flat ΛCDM (`H₀ = 70 km/s/Mpc`, `Ω_m = 0.315` from [Planck 2018](https://arxiv.org/abs/1807.06209)), integrated with Simpson's rule in [redshiftToDistanceMpc.ts](../src/utils/math/redshiftToDistanceMpc.ts). Inside 30 Mpc, where peculiar velocities swamp the Hubble flow, measured redshift-independent distances take over: a curated seed of 14 hand-verified nearby galaxies, then Cosmicflows-4 ([Tully et al. 2023](https://arxiv.org/abs/2209.11238), [project page](https://projets.ip2i.in2p3.fr/cosmicflows/)), then HyperLEDA `mod0` ([catalogDistanceFor.ts](../tools/catalog/catalogDistanceFor.ts)). A blueshifted galaxy none of those covers is placed in its true sky direction at `|cz|/H₀`, never mirrored through the origin. Beyond 30 Mpc, positions are redshift-space: peculiar velocities stretch dense clusters along the line of sight (the fingers-of-god effect), and skymap does not correct for it.
- **Stars**: Bailer-Jones EDR3 distances ([Bailer-Jones et al. 2021](https://arxiv.org/abs/2012.05220)), photogeometric estimate first, geometric fallback, GCNS as last resort; naive `1/parallax` is deliberately not used ([resolveStarDistancePc.ts](../tools/stars/resolveStarDistancePc.ts)). The bin covers Gaia DR3 to `G < 14` plus the GCNS 100 pc census and a Hipparcos-2 patch for the bright stars Gaia saturates on.
- **Solar system**: Keplerian elements from [JPL SSD's approximate-positions table](https://ssd.jpl.nasa.gov/planets/approx_pos.html) (Pluto's from the Explanatory Supplement to the Astronomical Almanac, moons from JPL's satellite elements), propagated on the simulation clock ([orbitalElements.ts](../src/data/bodies/orbitalElements.ts), [keplerianPositionMpc.ts](../src/utils/orbit/keplerianPositionMpc.ts)).
- **S-stars**: 40 orbits around Sagittarius A\* — 39 transcribed from [Gillessen et al. 2017](https://arxiv.org/abs/1611.09144), ApJ 837, 30, plus S301 from [Abd El Dayem et al. 2026](https://arxiv.org/abs/2607.12664) (Nature) ([sStarElements.ts](../src/data/bodies/sStarElements.ts)).

### Survey bias

Flux-limited surveys over-represent nearby galaxies, because faint ones are only detectable when close (the Malmquist bias). Five runtime-selectable correction modes respond to it ([biasMode.ts](../src/data/galaxyCatalog/biasMode.ts)):

- **None**: raw catalogue.
- **Volume-limited**: only galaxies brighter than a threshold `M_lim` (default −19), a uniformly-detectable subsample.
- **1/V_max**: dim each galaxy by its inverse maximum-detection volume ([Schmidt 1968](https://ui.adsabs.harvard.edu/abs/1968ApJ...151..393S/abstract)), as alpha instead of a discard.
- **Schechter LF**: dim by the inverse expected number density from each survey's Schechter luminosity function.
- **Angular re-weight** (default): per catalogue, weight each galaxy by median versus local density in HEALPix-cell × distance-shell bins ([computeAngularWeights.ts](../src/services/engine/bake/computeAngularWeights.ts)). Corrects footprint artifacts such as GLADE's pencil-beam jets.

Per-survey flux limits and Schechter parameters live in the source modules under [src/data/sources/](../src/data/sources/), with their literature origins noted there ([Blanton et al. 2003](https://arxiv.org/abs/astro-ph/0210215), [Kochanek et al. 2001](https://arxiv.org/abs/astro-ph/0011456), [Norberg et al. 2002](https://arxiv.org/abs/astro-ph/0111011)).

### Measured, derived, or modelled

Three kinds of content share the scene; this section says which is which.

**Measured**: the catalogued observables: sky positions, magnitudes, redshifts, and parallaxes; galaxy thumbnails (real SDSS DR18 and DSS imagery); the famous atlas photographs (credits in [ATTRIBUTIONS.md](../ATTRIBUTIONS.md)). The 3D positions built from them inherit the distance caveats above.

**Derived**: reconstructions computed from measurements by a published algorithm.

- **Filaments**: ridges of the Delaunay-tessellated galaxy density field, extracted by [DisPerSE](https://www2.iap.fr/users/sousbie/web/html/indexd41d.html) ([Sousbie 2011](https://arxiv.org/abs/1009.4015)) with a 5σ persistence cut and 2 smoothing passes over the 2MRS+GLADE catalogs ([buildFilaments.ts](../tools/filaments/buildFilaments.ts)).
- **MCPM cosmic web**: the Monte Carlo Physarum Machine ([Elek et al. 2022](https://arxiv.org/abs/2204.01256), implemented in [Polyphorm](https://github.com/CreativeCodingLab/Polyphorm)) fits a swarm of slime-mould-inspired agents to galaxy positions; the accumulated agent trace reconstructs the filamentary density field, an approach introduced for cosmology by [Burchett et al. 2020](https://doi.org/10.3847/2041-8213/ab700c). Skymap renders the SDSS DR17 Cosmic Slime value-added catalog ([Wilde et al. 2023](https://arxiv.org/abs/2301.02719), [VAC page](https://www.sdss4.org/dr17/data_access/value-added-catalogs/?vac_id=cosmic-web-environmental-densities-from-mcpm-slimemold)): a trace cube fit to ~325k SDSS galaxies between 44 and 476 Mpc, 712×1200×728 voxels at 0.78 Mpc per voxel, downsampled into three tiers and log-compressed at build time ([buildMcpmVolume.ts](../tools/volumes/buildMcpmVolume.ts)).
- **CF-4 density and CF4++ flow**: a Bayesian reconstruction of the local density and peculiar-velocity fields from Cosmicflows-4++ distances ([Courtois et al. 2025](https://arxiv.org/abs/2502.01308)), a 128³ grid spanning 1000 Mpc in supergalactic coordinates. The density volume renders the mean density cube; the flow overlay renders the mean velocity cube from the same release ([buildFlowField.ts](../tools/flow/buildFlowField.ts)).

**Modelled**: the procedural Milky Way is a Gaussian-mixture fit to the [Freudenreich 1998](https://arxiv.org/abs/astro-ph/9707340) COBE/DIRBE near-infrared emissivity model of the Galaxy, built analytically because no imaging of our own galaxy's exterior exists; the warp is currently not modelled ([research notes](research/milky-way/analytic-field.md)). The synthetic fallback catalog shown when no data files are present is random.

## The rendering

### One HDR frame

- **Accumulate then tone-map**: every layer draws into one `rgba16float` HDR target; a single composite pass applies a selectable curve, Linear, Reinhard, Asinh, Gamma 2.0, or ACES ([toneMapCurve.ts](../src/data/toneMapCurve.ts)).
- **Bloom**: a five-level mip pyramid: soft-threshold prefilter, downsample chain, additive tent-filter upsample ([bloomPyramid.ts](../src/services/gpu/passes/bloomPyramid.ts)).
- **Depth precision**: reversed-Z for the near-Earth pass, whose extreme near/far ratio would exhaust a classic depth buffer ([slabs.ts](../src/services/engine/frame/slabs.ts)).
- **Floating origin**: camera matrices compose in float64 relative to a render origin and narrow to float32 only at upload ([computeForegroundViewProj.ts](../src/utils/camera/computeForegroundViewProj.ts)).
- **HDR displays**: the swap chain switches to extended dynamic range when the display supports it ([applySwapFormat.ts](../src/services/engine/phases/applySwapFormat.ts)).

### Galaxies

- **Brightness**: catalogue magnitude and diameter bake into a physical surface-brightness amplitude, spreading light over the actual apparent disk ([galaxySbAmp.ts](../src/utils/galaxy/galaxySbAmp.ts)); Settings knobs add a gain, a bloom ceiling, and a `pow(resolvedFraction, k)` falloff against the additive glow near the origin.
- **Colour**: each survey's most informative photometric pair on a blue→white→red ramp with a first-order K-correction: SDSS u−g, GLADE B−J, 2MRS J−K ([colourIndex.ts](../src/data/galaxyCatalog/colourIndex.ts)).
- **Four LOD tiers** ([galaxyLodBands.ts](../src/data/galaxyLodBands.ts)): point sprite below 8 px; procedural disk impostor from 8–14 px, oriented by axis ratio and position angle; real SDSS/DSS thumbnail from a 256-slot LRU atlas at 24–40 px; high-resolution texture from 120 px, famous galaxies only.
- **Crossfades**: every handoff is a smoothstep whose sides sum to one, so brightness holds steady.

### Stars and the Sun

- **Octree cut**: subtrees too small on screen collapse into flux-weighted aggregate points on a half-resolution glow target; resolved leaves draw as full-resolution additive sprites ([walkStarOctreeCut.ts](../src/services/gpu/renderers/starCatalog/walkStarOctreeCut.ts)).
- **Photometry**: Pogson flux `10^(−0.4·M)` anchored at 10 pc, inverse-square dimming, and a camera-distance exposure ramp ([starPhotometry.wesl](../src/services/gpu/shaders/lib/starPhotometry.wesl), [starExposureRamp.ts](../src/services/gpu/renderers/starCatalog/starExposureRamp.ts)).
- **True-scale spheres**: past 4 px of apparent disc a star becomes an emissive sphere ([partitionStarsByResolution.ts](../src/services/engine/frame/partitionStarsByResolution.ts)); the Sun is simply the nearest such star, with the bloom threshold calibrated so its disc blooms.
- **Tint**: BP−RP through spectral-class anchors for points ([starTintFromBpRp.ts](../src/utils/color/starTintFromBpRp.ts)); a blackbody-locus polynomial in temperature for resolved spheres ([temperatureToLinearRgb.ts](../src/utils/color/temperatureToLinearRgb.ts)).

### Milky Way

- **Gaussian splats, no raymarch**: disc, bulge, arm, dust, and HII components are instanced Gaussian ellipsoids; each fragment evaluates its Gaussian along the view ray in closed form ([fieldSplat](../src/services/gpu/shaders/milkyWay/field/fieldSplat/fragment.wesl)).
- **Two passes**: emission accumulates additively at reduced resolution; dust is a separate multiplicative pass applying per-channel transmittance ([milkyWayCloudRenderer.ts](../src/services/gpu/renderers/milkyWay/milkyWayCloudRenderer.ts)).
- **Workbench**: the analytic-galaxy machinery was developed at [/galaxy/](https://skymap.rulkens.com/galaxy/) ([tools/galaxy-renderer/](../tools/galaxy-renderer/)), which renders full procedural Hubble-sequence galaxies.

### Solar system

- **Bodies**: ray-traced analytic spheres, flat-lit until their surface texture streams in ([planet](../src/services/gpu/shaders/bodies/planet/fragment.wesl), [texturedBody](../src/services/gpu/shaders/bodies/texturedBody/fragment.wesl)).
- **Earth**: a cubesphere with PBR albedo, roughness, ocean mask and normal relief; night lights as emission; a cloud shell that shadows the ground.
- **Surface tiles**: streamed by screen density from a quadtree cut over an equirectangular pyramid, a Blue Marble base to z7 with Sentinel-2 insets to z13 in selected regions ([cutSurfaceTiles.ts](../src/utils/scene/cutSurfaceTiles.ts), [earthTileParams.ts](../src/data/bodies/earthTileParams.ts)).
- **Atmospheres**: nine bodies carry constituent tables, per-channel scattering and absorption with Rayleigh or Henyey-Greenstein phase, drawn as a multiply-then-add shell over precomputed transmittance, multiple-scattering, and sky-view LUTs in the style of [Hillaire 2020](https://sebh.github.io/publications/egsr2020.pdf) ([atmosphereParams.ts](../src/data/bodies/atmosphereParams.ts)).
- **Saturn's rings**: a single-scattering Chandrasekhar slab with backscatter phase and an analytic planet shadow ([ring](../src/services/gpu/shaders/bodies/ring/fragment.wesl)).
- **Glints**: moons too small to resolve draw as points scaled by apparent size, albedo, and illuminated phase.
- **Orbit trails**: screen-space ribbons whose fragments evaluate the orbit's conic analytically, with a brightness lobe trailing the body's live position ([orbitTrail](../src/services/gpu/shaders/bodies/orbitTrail/fragment.wesl)).
- **Rotation**: axial spin follows the IAU rotation models ([Archinal et al. 2018](https://doi.org/10.1007/s10569-017-9805-5)) on the simulation clock ([rotationElements.ts](../src/data/bodies/rotationElements.ts)).

### Large-scale overlays

- **Filaments and constellations**: instanced screen-aligned quad segments blended additively, since native line primitives are locked to one pixel ([filamentRenderer.ts](../src/services/gpu/renderers/filaments/filamentRenderer.ts), [constellationRenderer.ts](../src/services/gpu/renderers/constellations/constellationRenderer.ts)); constellation endpoints resolve to real catalogue stars at build time.
- **Structure markers**: world-sized halo-plus-ring billboards scaled by each structure's physical radius; voids draw only the ring, a halo would imply matter where the structure is defined by absence ([structureMarkerRenderer.ts](../src/services/gpu/renderers/structureMarker/structureMarkerRenderer.ts)).
- **Zone of avoidance**: a reduced-resolution analytic raymarch of a galactic-latitude wedge, captioned in curved MSDF lettering ([band.wesl](../src/services/gpu/shaders/zoneOfAvoidance/band.wesl)).
- **Horizon shell**: the particle horizon at 14.3 Gpc, a Fresnel-rimmed sphere evaluated analytically per fragment ([horizonShellRenderer.ts](../src/services/gpu/renderers/horizonShell/horizonShellRenderer.ts)).

### Volumes and flow

- **Raymarch**: the MCPM and CF-4 cubes march front-to-back in 128 jittered steps at half resolution, then upsample into HDR; each field has its own palette (inferno, coolwarm) plus intensity, contrast, trim, density, and exposure controls ([scalarVolume](../src/services/gpu/shaders/scalarVolume/fragment.wesl)).
- **Baked, not simulated**: the in-app MCPM layer renders the pre-baked trace cube; the full simulation, a Woodcock-tracking volumetric path tracer, lives in the workbench at [/mcpm/](https://skymap.rulkens.com/mcpm/) ([tools/mcpm-workbench/](../tools/mcpm-workbench/)).
- **Flow**: tracer particles advect through the CF4++ velocity texture in a compute pass; trails draw as additive screen-space ribbons coloured by speed ([compute.wesl](../src/services/gpu/shaders/flow/compute.wesl)).

### Labels and picking

- **Labels**: multi-channel signed distance fields from a multi-font atlas array, including the arc-following curved lettering on the zone of avoidance ([msdf.wesl](../src/services/gpu/shaders/lib/msdf.wesl)).
- **Picking**: a parallel integer pass; every pickable layer writes a packed source-plus-index id into an `r32uint` target, and one readback identifies whatever is under the cursor.

## Corrections welcome

This page is a best effort to describe real astronomy faithfully. If you spot an error, a stale number, a misattributed dataset, or a better way to put any of it, please open an issue or a pull request; corrections from people who work with this data are especially appreciated.
