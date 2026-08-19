# Planet-body textures — raw sources

Raw source images for the true-scale foreground bodies (7 planets + Earth +
Moon + the four Galilean moons). The fetcher pulls each body's highest usable
native tier; `build-textures` then downsamples per
`BODY_TEXTURE_REGISTRY[id].maxTier` — **never upscaling**. See
`docs/superpowers/specs/2026-07-17-planet-rendering.md` §3 for the source
verification (URLs GET-probed, licence text read, pixel dims confirmed
2026-07-17) and §10 for the pipeline.

The same pull also carries the eight Blue Marble quadrants that
`build-earth-tiles` bakes into Earth's surface tile pyramid. Only that bake reads
them, but they are fetched with everything else so the 421 MB is obtainable by
command rather than by hand.

| Field      | Value                                                                             |
| ---------- | --------------------------------------------------------------------------------- |
| Fetch date | _(pending — filled by the maintainer's first full pull from `main`)_              |
| Full size  | ~1.1 GB (~700 MB of native body tiers + the ~421 MB BMNG quadrant set)            |
| Dev subset | ~7 MB (`--dev`: 2k SSS variants + 5400×2700 BMNG)                                 |
| Checksums  | `textures.sha256` — one `<hex>  <filename>` line per file, written on first fetch |

## How to obtain

```
npm run fetch-textures -- --confirm   # full ~1.1 GB pull (size-gated)
npm run fetch-textures -- --dev        # ~7 MB visual-check subset, no confirm
```

The fetcher is **GET-only — no `HEAD`, no `Range`**: `solarsystemscope.com`
returns `200 text/html` to a `HEAD` and ignores `Range` (spec §3), so
completeness is tracked per-file (each download lands in `<file>.part` and is
renamed on a clean finish) and re-runs skip files already verified against
`textures.sha256`.

## Solar System Scope — CC BY 4.0

Attribution required: **Solar System Scope (solarsystemscope.com), CC BY 4.0**
(page text: "use, adapt, share… even commercially"). Base URL:
`https://www.solarsystemscope.com/textures/download/<file>`

| Body               | Native file (full pull)    | Native dims | Dev (2k) file              | Notes                                                                   |
| ------------------ | -------------------------- | ----------- | -------------------------- | ----------------------------------------------------------------------- |
| Mercury            | `8k_mercury.jpg`           | ~8192×4096  | `2k_mercury.jpg`           | albedo map                                                              |
| Venus (atmosphere) | `4k_venus_atmosphere.jpg`  | 4096×2048   | `2k_venus_atmosphere.jpg`  | caps at 4k — the 8k SSS variant is the radar surface (wrong appearance) |
| Mars               | `8k_mars.jpg`              | ~8192×4096  | `2k_mars.jpg`              | albedo map                                                              |
| Jupiter            | `4k_jupiter.jpg`           | 4096×2048   | `2k_jupiter.jpg`           | cloud bands; upstream filename says `8k_jupiter.jpg`                    |
| Saturn             | `4k_saturn.jpg`            | 4096×2048   | `2k_saturn.jpg`            | cloud bands; upstream filename says `8k_saturn.jpg`                     |
| Saturn ring        | `8k_saturn_ring_alpha.png` | 8k×N RGBA   | `2k_saturn_ring_alpha.png` | radial alpha strip, real alpha; sampled by radius, shipped N×1          |
| Uranus             | `2k_uranus.jpg`            | 2048×1024   | `2k_uranus.jpg` (same)     | 2k only — near-featureless, never upscaled                              |
| Neptune            | `2k_neptune.jpg`           | 2048×1024   | `2k_neptune.jpg` (same)    | 2k only — same caveat                                                   |
| Moon               | `8k_moon.jpg`              | ~8192×4096  | `2k_moon.jpg`              | albedo map                                                              |

Jupiter and Saturn's local filenames are `4k_` rather than the `8k_` their
upstream URL uses — the delivered image is 4096×2048, not the 8192×4096 the
upstream name implies, so the fetch keeps the real dimension in the local name
while leaving the remote URL as Solar System Scope names it. Together with
Venus atmosphere, that makes three bodies whose "full pull" is already the 4k
tier, not a downsample of an 8k raw. Uranus/Neptune's native file _is_ the 2k
tier, so the dev subset reuses it (never fetched twice).

## NASA Blue Marble Next Generation — Earth (public domain; credit "NASA Earth Observatory")

Topography+bathymetry imagery. **Pulled vintage: August 2004.**

BMNG is a monthly series: twelve whole-globe images, all from 2004, each one a
cloud-screened composite of many MODIS Terra passes over that month. Which month
you pull is therefore a visible choice, not a version number. August was picked
for a green northern hemisphere.

Every month is published twice over, and skymap uses both publications:

- the **21600×10800 whole-globe equirect**, which `build-textures` tiers into
  Earth's `surface` map (the whole-globe base texture), and
- the **eight 21600×21600 quadrants**, which `build-earth-tiles` bakes into the
  `earth-tiles/` pyramid the runtime virtual texture pages.

Both must be the SAME month. The tile layer falls back to the base texture
outside its baked level range and wherever the tile atlas runs out of slots, so a
base from a different month draws a snow line and a vegetation change along the
tile frontier, the one place the feature is meant to be inspected. The month is
chosen once, in `tools/utils/io/bmngVintage.ts`, and every registry path, upstream
URL and attribution string reads it from there.

### Whole-globe equirect (Earth's base texture)

| Purpose    | File                                        | Dims        | Size             |
| ---------- | ------------------------------------------- | ----------- | ---------------- |
| Full pull  | `world.topo.bathy.200408.3x21600x10800.jpg` | 21600×10800 | 27,216,225 bytes |
| Dev subset | `world.topo.bathy.200408.3x5400x2700.jpg`   | 5400×2700   | 2,308,163 bytes  |

### Quadrants (the surface tile pyramid's source)

The eight files composite to 86400×43200, about 464 m per texel and four pyramid
levels deeper than the equirect (z7 against z5). Column letters A-D run west to
east from longitude -180; row digits 1 and 2 are the northern and southern
hemispheres. `bmngQuadrantSource` reads one file per tile and never stitches
across two, which the 90-degree quadrant boundaries make possible from z2 upward.
Full pull only, no dev variant: a `--dev` tile bake reads the whole-globe equirect
instead.

| File                                           | Extent (lon × lat) | Size             |
| ---------------------------------------------- | ------------------ | ---------------- |
| `world.topo.bathy.200408.3x21600x21600.A1.jpg` | -180..-90 × 0..90  | 54,280,546 bytes |
| `world.topo.bathy.200408.3x21600x21600.A2.jpg` | -180..-90 × -90..0 | 24,328,476 bytes |
| `world.topo.bathy.200408.3x21600x21600.B1.jpg` | -90..0 × 0..90     | 54,137,687 bytes |
| `world.topo.bathy.200408.3x21600x21600.B2.jpg` | -90..0 × -90..0    | 47,001,732 bytes |
| `world.topo.bathy.200408.3x21600x21600.C1.jpg` | 0..90 × 0..90      | 89,081,015 bytes |
| `world.topo.bathy.200408.3x21600x21600.C2.jpg` | 0..90 × -90..0     | 39,324,538 bytes |
| `world.topo.bathy.200408.3x21600x21600.D1.jpg` | 90..180 × 0..90    | 69,167,032 bytes |
| `world.topo.bathy.200408.3x21600x21600.D2.jpg` | 90..180 × -90..0   | 43,499,590 bytes |

Quadrant total: 420,820,616 bytes (~421 MB).

Base URL for all nine files (`Access-Control-Allow-Origin: *`, verified live
2026-07-30):

```
https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/august/
```

### Earth material map — NASA BMNG land/water mask

Earth's `material` map (roughness + ocean mask, packed linear RGBA → PNG) is
built from the NASA Blue Marble Next Generation **water mask**: a time-invariant
equirect where land = 255 and water = 0 (rivers + lakes + oceans all count as
water). The full mask is 86400×43200; a subsampled 21600×10800 PNG matches the
BMNG topo tier we already fetch and downsamples cleanly to the 4k material
ceiling. `build-textures` ramps roughness across the mask (ocean glossy, land
diffuse) and stores the ocean flag in G — see `buildTextures.ts`.

| Purpose   | File                              | Dims        | Bands | Size            |
| --------- | --------------------------------- | ----------- | ----- | --------------- |
| Full pull | `world.watermask.21600x10800.png` | 21600×10800 | gray  | 4,463,359 bytes |

Original source: NASA NEO Blue Marble Next Generation landmask (public domain,
credit NASA Earth Observatory). NASA has since retired the NEO bluemarble
archive (`neo.gsfc.nasa.gov/archive/bluemarble/…` now 404s), and the relocated
science.nasa.gov BMNG collection dropped the mask files entirely — neither the
base-map nor the topography-bathymetry subpages carry a watermask. The exact
original file is preserved by the Internet Archive with verified headers
(HTTP 200, `image/png`, 4,463,359 bytes, original `last-modified: 15 May 2009`),
so the canonical fetch URL is the Wayback snapshot below, verified live
2026-07-19. Full-pull only — no dev variant.

```
https://web.archive.org/web/20240509231512if_/https://neo.gsfc.nasa.gov/archive/bluemarble/bmng/landmask/world.watermask.21600x10800.png
```

## Earth night map — NASA Black Marble 2016

Earth's `night` map (city lights, sRGB → JPG) is NASA's **Black Marble 2016**
"3 km" global night-lights composite (Suomi NPP VIIRS Day/Night Band). It ships
sRGB colour like the day albedo — non-linear, so JPG, not PNG — segmented as
`earth-night-<px>.jpg` and capped at the `large` (8k) tier (spec §9.1).
Full-pull only — no dev variant, so `--dev` fetch/build skip it; the visual
check needs the full source.

| Purpose   | File                       | Dims       | Size            |
| --------- | -------------------------- | ---------- | --------------- |
| Full pull | `BlackMarble_2016_3km.jpg` | 13500×6750 | 8,106,233 bytes |

Credit: **NASA Earth Observatory / NASA's Goddard Space Flight Center**, Suomi
NPP VIIRS (Black Marble 2016). Public domain. Verified live 2026-07-19
(HTTP 200, `image/jpeg`, 8,106,233 bytes).

```
https://eoimages.gsfc.nasa.gov/images/imagerecords/144000/144898/BlackMarble_2016_3km.jpg
```

## Earth elevation map — NASA Visible Earth "Topography" (GEBCO_08)

Earth's `normal` map (tangent-space bump, packed linear RGBA → PNG) is **baked**
from NASA Visible Earth's "Topography" grayscale relief — a GEBCO_08-derived
equirect where pixel brightness encodes land elevation plus bathymetry shading.
`build-textures` differentiates the heightfield into a tangent-space normal map
(see `bakeNormalMap.ts`); the raw relief is a **build-only bake input, never
shipped** as a runtime texture. Full-pull only — no dev variant.

| Purpose   | File                                | Dims        | Bands | Size             |
| --------- | ----------------------------------- | ----------- | ----- | ---------------- |
| Full pull | `gebco_08_rev_elev_21600x10800.png` | 21600×10800 | gray  | 18,414,843 bytes |

Credit: **NASA Earth Observatory (Visible Earth)**, imagery by Jesse Allen using
`GEBCO_08` grid data. Public domain. Verified live 2026-07-19 (HTTP 200,
`image/png`, 18,414,843 bytes). The smaller 5400×2700 variant 404s — the full-res
file is the only source. Checksum: _(pending — filled by the fetch task)_.

```
https://eoimages.gsfc.nasa.gov/images/imagerecords/73000/73934/gebco_08_rev_elev_21600x10800.png
```

## Earth clouds map — NASA Visible Earth Blue Marble cloud composite

Earth's `clouds` map (cloud shell, sRGB colour + luminance-derived alpha → PNG)
is NASA's **Blue Marble** cloud composite — a white-cloud-on-black equirect with
**no alpha channel**. `build-textures` derives opacity from luminance (white
cloud → opaque, black sky → clear) and keeps the RGB as the cloud colour (see
`writeCloudTier.ts`); it ships segmented as `earth-clouds-<px>.png` at the
`large` (8k) tier (spec §9.1). sharp reads TIFF natively (the USGS moon sources
are already `.tif`). Full-pull only — no dev variant.

The 2048px JPG variant is too small for the 8k ceiling, and the two 21600px
halves (~210 MB each) were rejected as oversize — the single 8192×4096 combined
TIFF is the right source.

| Purpose   | File                      | Dims      | Size             |
| --------- | ------------------------- | --------- | ---------------- |
| Full pull | `cloud_combined_8192.tif` | 8192×4096 | 35,870,468 bytes |

Credit: **NASA Goddard Space Flight Center** (Reto Stöckli). Public domain.
Verified live 2026-07-19 (HTTP 200, `image/tiff`, 35,870,468 bytes). Checksum:
_(pending — filled by the fetch task)_.

```
https://eoimages.gsfc.nasa.gov/images/imagerecords/57000/57747/cloud_combined_8192.tif
```

## USGS Astrogeology — Galilean moons (public domain; credit "NASA/USGS")

Plain 8-bit GeoTIFFs (no ISIS toolchain needed; sharp/libvips reads TIFF
directly). Full pull only — no dev variant. Base:
`https://planetarymaps.usgs.gov/mosaic/<file>`

| Body     | File                                                     | Native     | Bands | Build note                                                           |
| -------- | -------------------------------------------------------- | ---------- | ----- | -------------------------------------------------------------------- |
| Io       | `Io_GalileoSSI-Voyager_Global_Mosaic_ClrMerge_1km.tif`   | 11445×5723 | RGB   | —                                                                    |
| Europa   | `Europa_Voyager_GalileoSSI_global_mosaic_500m.tif`       | 19631×9816 | gray  | tinted in build (no global colour; S-pole gap below −83° acceptable) |
| Ganymede | `Ganymede_Voyager_GalileoSSI_Global_ClrMosaic_1435m.tif` | 11520×5760 | RGB   | —                                                                    |
| Callisto | `Callisto_Voyager_GalileoSSI_global_mosaic_1km.tif`      | 15138×7569 | gray  | tinted in build (no global colour; near-uniform)                     |

**Titan is intentionally absent, and the search is closed.** Re-checked
2026-08-18 across the USGS mosaic bucket (every Titan product is ISS 938 nm or
radar), the NASA Photojournal (every true-colour Titan is a small
single-hemisphere perspective image, never map-projected), Björn Jónsson's map
set and Solar System Scope (neither carries Titan): no visible-light global
mosaic exists to register. Titan therefore renders through the flat path
(spec §3, Q13) — but since 2026-08-18 it also carries an `ATMOSPHERE_PARAMS`
row, so absent-from-this-table no longer means visually plain: the haze shell
supplies the limb, the colour and the twilight.

## Attribution

The runtime credits Solar System Scope (CC BY 4.0), NASA Earth Observatory
(Blue Marble), and NASA/USGS (moon mosaics) in the Splash footer. The raw
`.jpg`/`.png`/`.tif` files are gitignored build inputs; only this README and
the `textures.sha256` sidecar are committed.
