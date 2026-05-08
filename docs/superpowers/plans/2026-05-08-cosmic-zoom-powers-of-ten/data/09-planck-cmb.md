# Planck PR4 (NPIPE) SMICA CMB Map

## What it is

The **Cosmic Microwave Background (CMB)** is the relic thermal radiation from the universe's hot dense phase, last scattered ~380,000 years after the Big Bang and now redshifted into microwaves at a near-uniform 2.725 K. The Planck satellite (ESA, 2009–2013) mapped it to higher precision than any prior mission. The latest reprocessing — **Planck Public Release 4 (PR4)**, also known as **NPIPE** (Planck Collaboration 2020) — reanalyzes all raw timelines with improved calibration and noise modelling, and ships a suite of derived all-sky maps.

The specific product we want is the **SMICA component-separated CMB temperature map**. SMICA (Spectral Matching Independent Component Analysis) takes Planck's nine frequency bands and a couple of WMAP bands, models foregrounds (synchrotron, free-free, thermal dust, AME, CO, point sources) as separable spectral components, and outputs a single full-sky map that is — to the best of our current ability — *just* the CMB. SMICA is the preferred map for visualization and for power-spectrum work outside the tightest cosmology-grade analyses (which use simulations to characterise residual foreground bias).

The map ships as a **HEALPix FITS file at Nside=2048** (~50 million pixels, equal area, hierarchical), in units of thermodynamic K_CMB. Anisotropies — the deviations from the 2.725 K mean — sit at the ~100 μK level for the largest features (the dipole, dominated by our solar-system motion through the CMB rest frame) and ~70 μK RMS for the cosmological anisotropy after dipole subtraction.

## Why we need it (which shell, what role)

**Shell 9 (Observable Universe, outer scale ~14 Gpc)** is the final stop on the tour: the camera sits inside a sphere whose interior surface displays the all-sky CMB. This is the visualization that anchors the user's sense of "this is the edge — past this is the part of the universe we cannot see, because no light has had time to reach us." It is also the only shell where the rendered geometry is *the data* — there are no points, no filaments, no labels except a handful pinned to famous features (the Cold Spot, the Axis of Evil, the dipole direction).

The render technique is straightforward: a UV-sphere or an icosphere centered on the camera, rendered with a backface cull *flipped* so we see the inside, sampled with an equirectangular CMB texture. The shader does nothing clever — `textureSample(cmb, uv)` with `uv` derived from spherical coordinates of the fragment normal. The interesting work is **all in the texture** that we ship; the shader is a one-liner.

So this dataset's job is: produce the best inside-of-sphere all-sky CMB texture we can, in a format the runtime can sample with no per-frame work.

## Acquisition

- **Primary URL**: Planck Legacy Archive (PLA) — `https://pla.esac.esa.int`. Navigate "Maps" → "All-Sky Maps" → search for `COM_CMB_IQU-smica_2048_R4.00`. Direct download via the PLA's REST endpoint:
  ```
  https://pla.esac.esa.int/pla/aio/product-action?MAP.MAP_ID=COM_CMB_IQU-smica_2048_R4.00_full.fits
  ```
- **Alternative mirror**: NASA LAMBDA (`https://lambda.gsfc.nasa.gov/product/planck/`) hosts the same files and is sometimes faster from US connections.
- **Authentication**: none required for public Planck releases. Anonymous HTTP GET.
- **Format**: FITS file, HEALPix-organized, Nside=2048, NESTED ordering. Three columns (I, Q, U for Stokes parameters); we only need I (intensity = temperature anisotropy). Float32 per pixel.
- **Size (raw)**: ~600 MB uncompressed FITS, ~150 MB after gzip. We will *not* ship the raw FITS — it is a build-time input that lives in `data/raw/planck/` (gitignored, like the other large catalogs) and is fetched once by the developer running the build.

## Parsing

- **Code path**: new file `tools/buildCmbMap.ts`. The conversion from HEALPix sphere pixels to a flat equirectangular image is the entire job. We have two reasonable implementations:
  1. **Python via `healpy`** (the canonical HEALPix toolkit). A ~30-line script: `healpy.read_map`, `healpy.remove_dipole`, `healpy.cartview` (or `mollview` if we ever want a 2D Mollweide poster). Adds a Python dependency to the build environment, but `healpy` is the de-facto standard and produces output identical to every published Planck figure.
  2. **Pure JS via our `src/utils/math/healpix.ts`**, which already implements the index↔angle conversions we use for the existing skymap density passes. We'd write a small build-time script that loads the FITS file (via a tiny FITS reader — `fitsjs` or hand-rolled, since we only need to read the BINTABLE primary HDU and one float column), then for each pixel of the 4096×2048 output equirectangular image, converts the (lon, lat) center to a HEALPix index and samples.
- **Recommendation**: start with **option 1 (Python + healpy)**. It is faster to write, faster to run, and battle-tested. We will document it as a one-shot build step that requires `healpy` in the developer's environment (`pip install healpy`). The pure-JS path is a fine fallback if we ever need to remove the Python dependency for CI portability — defer until then. The output is a static PNG either way; the runtime never knows the build language.
- **Schema we use**: only the I (intensity) column from HDU 1. Pixel values are temperature anisotropies in K_CMB; we convert to μK by multiplying by 10⁶ at write time so downstream code doesn't deal with awkwardly small floats.
- **Schema we drop**: Q, U (polarization Stokes parameters), the per-pixel covariance columns, and the noise estimate columns. None of those are visible in the final RGB texture; carrying them costs disk and gains nothing.

## Filtering / cross-matching

This is a single-source dataset; no cross-matching. The "filtering" is the visual processing that turns raw temperature values into the canonical Planck blue/red anisotropy palette:

1. **Dipole subtraction** — strongly recommended. The CMB dipole is the ~3.36 mK temperature gradient produced by the Sun's ~370 km/s motion relative to the CMB rest frame. It is **a known foreground**: it dominates any naive temperature plot (one whole hemisphere bright red, the other bright blue) and visually obliterates the cosmological anisotropy we are actually trying to show. Planck papers and almost every public Planck visualization subtract the dipole before display. We do the same. `healpy.remove_dipole(map, gal_cut=30)` does this in one call (the `gal_cut` argument restricts the fit to the high-latitude sky, avoiding the galactic-plane bias). Our overlay caption can mention "dipole subtracted" for users who notice.

2. **Galactic plane**: the Milky Way's emission contaminates the equatorial band of the map even after SMICA component separation — residual dust and synchrotron leak through, producing visible streaks along the galactic equator. Three options:
   - **(1) Leave it visible.** Educational: "the CMB is what we see *through* our own galaxy, and our galaxy leaves a fingerprint." Honest about the data-processing chain.
   - **(2) Mask with a smooth taper.** Multiply the temperature by a cosine-tapered window in galactic latitude that reaches zero in a ±10° band around the equator. The masked region renders flat grey (or whatever the palette midpoint is). Visually clean, but pedagogically dishonest — it looks like the CMB has a featureless stripe down the middle.
   - **(3) Inpaint** with the SMICA-extracted CMB itself, using the standard Planck galactic mask (`COM_Mask_CMB-common-Mask-Int_2048_R3.00.fits`). Best visual result; what most published Planck figures use. Adds a third file dependency and several lines of logic.
   - **Recommendation**: **option (1)**, leave it visible. The CMB shell already has an explanatory caption ("the surface of last scattering, redshifted to microwaves") — adding "—visible streaks across the equator are residual emission from our own Milky Way, which we look through to see this signal" is in the spirit of the rest of the tour, which favors *showing the data* over *showing a polished poster*. We can revisit if user testing finds the streaks distracting.

3. **Temperature scaling**. After dipole removal, anisotropies range roughly ±400 μK (with rare outliers further). Clamp to **±300 μK** (matches the standard Planck Collaboration figure scaling), then map linearly to a divergent blue→white→red palette. The exact palette: Planck publishes `colombi1.cmap` (a custom matplotlib colormap shipped inside `healpy`), but a perceptually-similar `RdBu_r` from matplotlib is a fine substitute and is what most non-Planck figures use. We bake the palette into the PNG at build time; the shader never knows it is sampling a colorized representation.

4. **Smoothing** (optional). Planck's beam is ~5 arcmin FWHM at 143 GHz, and SMICA at full Nside resolves to that scale. At 4096×2048 output (~5.3 arcmin per pixel at the equator), the beam and the pixel scale are comparable, so no extra smoothing is needed. If aliasing artifacts appear at the poles (where the equirectangular projection oversamples), apply a small ~5 arcmin Gaussian smoothing via `healpy.smoothing(map, fwhm=np.radians(5/60))` before resampling. Defer until visually validated.

## Output binary format

Not a `.bin`. The output is a **PNG** (or JPEG) image at `public/data/cmb-smica-equirect.png`:

```
Format:        PNG, RGB (no alpha needed)
Dimensions:    4096 × 2048
Color depth:   8 bits per channel (palette is pre-baked; 24-bit RGB suffices)
Projection:    Equirectangular, longitude 0..360 left-to-right (galactic l), latitude -90..+90 top-to-bottom (galactic b)
Coordinate system: Galactic (matches the native Planck product orientation)
File size:     ~8–12 MB depending on PNG compression level; ~3–5 MB as JPEG q=92
```

We choose **PNG** over JPEG: the CMB has large smooth gradients that JPEG handles fine, but the small-scale acoustic-peak anisotropy is exactly the kind of low-amplitude, high-frequency signal JPEG's DCT smears. PNG keeps it pixel-exact at ~8 MB, which is well inside the per-shell size budget. If size becomes a concern we can ship a `cmb-smica-equirect.webp` via lossless WebP (~6 MB) — same fidelity, one extra build step.

A small **sidecar JSON** at `public/data/cmb-smica-equirect.json` records build metadata: input file SHA-256, dipole subtraction parameters, palette name, temperature scale (μK), and source release (`PR4 / NPIPE`). The shell-9 renderer loads this and exposes the temperature scale to a debug overlay.

Reference: [`data/10-binary-formats.md`](10-binary-formats.md) §6 (image-as-data formats) once written. The CMB is the only shell that ships a texture rather than a binary point/structure file, so it gets its own sub-section.

## Build script

- **File**: `tools/buildCmbMap.ts` (thin Node wrapper that shells out to `tools/python/buildCmbMap.py`, or — if we go pure-JS later — does the work directly).
- **Run command**: `npm run build-cmb-map` (added to `package.json`); also called by the master `npm run build-shell-data` script.
- **Pipeline** (Python path):
  1. Read `data/raw/planck/COM_CMB_IQU-smica_2048_R4.00_full.fits` via `healpy.read_map(..., field=0)`.
  2. `healpy.remove_dipole(m, gal_cut=30)` — subtract the solar-system dipole.
  3. (Optional) `healpy.smoothing(m, fwhm=np.radians(5/60))`.
  4. Convert K → μK (`m *= 1e6`), clamp to ±300 μK.
  5. Project to equirectangular at 4096×2048 by sampling each output pixel with `healpy.ang2pix(2048, theta, phi, nest=True)` followed by `m[idx]`. Output coordinate system stays galactic; we do not rotate to equatorial.
  6. Apply the colour palette (matplotlib `RdBu_r` or `colombi1`) to map μK → RGB.
  7. Write PNG via `pillow`. Write the sidecar JSON.
- **Idempotent?**: yes. Same input FITS + same script + same parameters → byte-identical PNG output.
- **Approximate runtime**: ~30 s including the dipole fit and the per-pixel HEALPix sampling. Trivial in the build-shell-data sequence.

## Licensing & attribution

- **License**: ESA/Planck data products are released under ESA's standard "freely available for research, with attribution" terms. No restrictive clause for non-commercial use; commercial redistribution is also permitted with citation. This is identical in spirit to NASA's public-domain posture, just with an explicit citation requirement.
- **Required citation**: Planck Collaboration et al. 2020, A&A 643, A42 — "Planck intermediate results. LVII. Joint Planck LFI and HFI data processing." (the NPIPE / PR4 release paper).
- **CREDITS.md entry** (verbatim):
  > Cosmic Microwave Background: ESA / Planck Collaboration, PR4 (NPIPE) SMICA component-separated map. Planck Collaboration et al. 2020, A&A 643, A42.
- **In-app credit**: shell 9's overlay credit line reads "CMB: ESA / Planck Collaboration (NPIPE / SMICA)."

## Risks

- **Low**. The data is a single static file from a stable archive; the processing is well-trodden and `healpy` is the reference implementation. The most likely failure mode is **build-environment drift**: a developer without `healpy` installed cannot regenerate the PNG. Mitigation: the build script prints a clear `pip install healpy pillow numpy` hint when the import fails, and the resulting PNG is committed to R2 so day-to-day work doesn't require a Python environment at all. Only the developer rebuilding the CMB texture (rare — the dataset is essentially frozen) needs the Python toolchain.
- **Visual discoverability**: at the default rendering parameters, the cosmological anisotropy might read as "noise" to a user who doesn't know what they're looking at. The shell-9 spec covers this with an explanatory caption and an optional "show galactic plane streaks" toggle that highlights the contamination edge as a teaching aid.
- **Coordinate system surprise**: the texture is in galactic coordinates, but skymap's other rendering is in equatorial (J2000) coordinates. Either we (a) rotate the CMB texture to equatorial at build time using `healpy.Rotator`, or (b) apply the rotation in the shell-9 sphere shader as a constant matrix. **Option (b)** is preferable: the texture stays in its canonical orientation (matching every published Planck figure, which helps verification), and the shader rotation is one extra `mat3 *` per fragment — free. Document this clearly in the renderer code.

## Sample/test data

A trimmed `tests/fixtures/cmb-smica-tiny.png` at 256×128 generated by the same script with `--test` flag (skips dipole removal, just downsamples). Used by the round-trip test that asserts the renderer can load the PNG, sample it at known coordinates (e.g., the galactic center pixel), and produce expected colors. No need to ship the full Planck FITS into the test fixture — the fixture is committed, full input stays in `data/raw/` (gitignored).

## References

- Planck Collaboration et al. 2020, *A&A*, 643, A42 — "Planck intermediate results. LVII. Joint Planck LFI and HFI data processing" (NPIPE / PR4).
- Planck Collaboration et al. 2020, *A&A*, 641, A4 — "Planck 2018 results. IV. Diffuse component separation" (SMICA methodology).
- Planck Legacy Archive: `https://pla.esac.esa.int`
- NASA LAMBDA mirror: `https://lambda.gsfc.nasa.gov/product/planck/`
- HEALPix: Górski et al. 2005, *ApJ*, 622, 759. Documentation at `https://healpix.sourceforge.io/`.
- `healpy` Python library: `https://healpy.readthedocs.io/`.
