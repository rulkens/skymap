# Earth Textures (Blue Marble + Night Lights + Atmosphere LUT)

**Status:** Proposed (2026-05-09 amendment) — see [`decisions/0010-earth-opening.md`](../decisions/0010-earth-opening.md).
**Used by:** [`shells/00a-earth-opening.md`](../shells/00a-earth-opening.md) (Earth opening + closing beats only).

## What it is

Three small image assets, all public-domain or NASA-attribution, that together let us render Earth's surface and atmosphere convincingly during the tour's open and close:

1. **Blue Marble diffuse** — Earth's continents and oceans, day-side, equirectangular projection.
2. **Night-side lights** — city light emission, equirectangular projection. Used to give the day/night terminator visual interest.
3. **Atmosphere LUT** — precomputed atmospheric scattering lookup table, generated once at build time from physical constants.

Total committed footprint: ~10 MB across all three. Small enough to live in `public/textures/` rather than R2.

## Why we need it

The Earth opening (and mirror closing) is the most emotionally important beat of the tour. See `decisions/0010-earth-opening.md` for the rationale. The render pipeline for that beat needs:

- A textured Earth sphere (diffuse + night lights), shown briefly at T+0:16-0:20 (open) and T+1:40-1:42 (close).
- An atmospheric scattering function for the sunset → night sky color gradient at T+0:00-0:08 (open) and T+1:42-1:46 (close).

Both are visually load-bearing and both need real data, not invented colors.

## Acquisition

### Blue Marble diffuse

- **Source:** NASA Visible Earth, "Blue Marble: Next Generation" series (2002-2004 monthly composites).
- **URL:** https://visibleearth.nasa.gov/collection/1484/blue-marble — pick the July 2004 composite (matches the chosen July evening tour scene; vegetation peaks in NH summer, cleanest visual).
- **Format:** TIFF, 21,600 × 10,800 (full resolution), or 8192 × 4096 (medium), or 4096 × 2048 (web).
- **Authentication:** none.
- **License:** "NASA imagery and other media are not copyrighted. You may use NASA imagery for educational or informational purposes." Public domain for our use case.

### Night-side lights

- **Source:** NASA Earth Observatory, "Earth at Night 2016" composite (the famous lights-from-orbit image, derived from Suomi NPP VIIRS data).
- **URL:** https://earthobservatory.nasa.gov/features/NightLights — high-res download.
- **Format:** JPEG, 8192 × 4096 typical.
- **License:** NASA, public domain.

### Atmosphere LUT

Generated at build time from physical constants. No external data fetch. The build script `tools/buildAtmosphereLut.ts` precomputes the in-scattering integral over view rays at a grid of (sun-elevation, view-elevation, view-azimuth) angles using a simplified Bruneton-Neyret model with Rayleigh + Mie scattering coefficients hard-coded for Earth's atmosphere.

Output: `public/textures/atmosphere-lut.png` — a 256 × 64 RGBA texture where:
- U axis (256) encodes sun elevation from -10° to +90° (so we get full sunset gradient).
- V axis (64) encodes view elevation from horizon to zenith.
- RGB encodes the atmospheric color contribution; A encodes the in-scattering optical depth (used to fade out stars when sky is bright).

The LUT format and shader-side sampling are detailed in [`rendering/08-atmosphere.md`](../rendering/08-atmosphere.md).

## Parsing

The two photographic textures are loaded as standard images via `fetch().then(r => createImageBitmap(r))`, then uploaded as `GPUTexture` with `rgba8unorm` format. No parsing.

The atmosphere LUT is loaded the same way. No parsing.

## Filtering / cross-matching

None. These are standalone static assets.

## Output binary format

Not applicable — these stay as image files. The plan's data/10-binary-formats.md catalog is for custom skymap binaries; for these standard image assets we use the browser's native decoding.

The three files committed:

```
public/textures/earth-blue-marble-4k.jpg     ~5 MB
public/textures/earth-night-lights-4k.jpg    ~3 MB
public/textures/atmosphere-lut.png            ~64 KB
```

We commit at 4K resolution. 8K is overkill for Earth-as-a-disc viewing; the camera spends ~2 seconds on the disc view per cycle and the disc occupies maybe 30% of the screen at maximum. 4K is more than enough.

## Build script

### `tools/buildEarthTextures.ts`

A small download-and-resize script:

```ts
// 1. Fetch the source TIFFs from NASA Visible Earth (one-time, cached in data/raw/)
// 2. Resize to 4096x2048 with bicubic
// 3. Encode as JPEG quality 92 (visually lossless at this scale)
// 4. Write to public/textures/
```

Idempotent. Re-running with the cached raw files in `data/raw/` produces byte-identical output.

Approximate runtime: ~10 seconds (mostly resize + encode).

### `tools/buildAtmosphereLut.ts`

Precomputes the atmospheric scattering LUT. Pure CPU computation; no external data:

```ts
// 1. For each (sun_elevation, view_elevation) pair on a 256x64 grid:
//    a. Compute Rayleigh in-scattering integral along the view ray
//    b. Compute Mie in-scattering integral
//    c. Sum and tone-map to RGB
//    d. Compute optical depth → alpha
// 2. Pack as RGBA8 PNG, 256x64
// 3. Write to public/textures/atmosphere-lut.png
```

Approximate runtime: ~30 seconds (256 × 64 = 16,384 ray integrals).

Re-run only when the atmospheric scattering coefficients change (which is essentially never; they are physical constants). The output PNG is committed alongside the script for visual review.

## Licensing & attribution

**Blue Marble diffuse:** NASA Visible Earth, public domain. The credit line for shell 0a's overlay (if shown) is **"Earth: NASA Visible Earth (Blue Marble)."**

**Night-side lights:** NASA Earth Observatory, public domain. Credit line **"Earth at Night: NASA / NOAA Suomi NPP VIIRS."**

**Atmosphere LUT:** generated by skymap from physical constants. No attribution needed.

We will combine these into a single credit line shown in the bottom-right corner of the open / close beats:

```
Earth: NASA Visible Earth · Earth at Night: NASA / NOAA / Suomi NPP
```

Same restrained typographic treatment as the per-shell credits in the rest of the tour.

## Risks

### Low

- **Source URL drift.** NASA occasionally reorganizes their websites. Mitigation: cache the source TIFFs in `data/raw/textures/` (gitignored — they're large) and document the original URL in the build script. Re-fetching is a one-time annoyance, not a recurring problem.
- **Visual realism mismatch.** A 4K Blue Marble at a glance is photorealistic. The rest of the tour is data-driven / observatory-readout. There is a tonal seam at T+0:18 when the user transitions from "Earth from space" to "the Solar System as a diagram." Mitigation: aggressive desaturation and lower contrast on the Earth-disc frames so it reads as "data," not "magazine cover." See `rendering/08-atmosphere.md` for the post-process recipe.

### Negligible

- **Mobile texture memory.** 4K JPEGs decompress to ~32 MB each as RGBA8 textures. Total ~70 MB on the GPU during the open. Acceptable on any device that can run WebGPU. Tier C (no-WebGPU) is already excluded from the tour.

## Sample / test data

The build pipeline produces the three files. For unit tests we use a tiny stub:

```
tests/fixtures/earth-textures/
  stub-blue-marble-256.jpg     ~10 KB — 256x128, low-quality
  stub-night-lights-256.jpg    ~10 KB
  stub-atmosphere-lut-32.png   ~1 KB — 32x8
```

Tests assert that the renderer accepts the stubs and produces valid command encoders; visual correctness is verified manually against the full-resolution assets.

## References

- [Blue Marble: Next Generation](https://visibleearth.nasa.gov/collection/1484/blue-marble) — NASA Visible Earth catalog page.
- [Earth at Night 2016](https://earthobservatory.nasa.gov/features/NightLights) — composite description.
- E. Bruneton & F. Neyret, "Precomputed Atmospheric Scattering" (EGSR 2008) — the canonical reference for the LUT-based atmosphere technique. We use a simplified version of their model.
- S. Hillaire, "A Scalable and Production Ready Sky and Atmosphere Rendering Technique" (EGSR 2020) — modern variant; simpler shader, good fit for our single-frame use.
- C. Sagan, "Cosmos" episode 1 — visual reference for the desired sunset → night-sky aesthetic.
