# Milky Way model — composite assets for Shell 3

This spec covers the data side of [`shells/03-milky-way.md`](../shells/03-milky-way.md): the panorama textures that feed the Milky Way impostor, the dust-lane overlay, and the small per-object catalogs (globular clusters and Magellanic Clouds) that decorate the shell. This is not a renderer spec — the impostor itself has its own design doc — but it is the contract the renderer reads from at build time.

The Milky Way model is unusual among the cosmic-zoom data sources because four heterogeneous upstream sources are combined into a single artifact before runtime ever sees them. Most other shells consume one catalog and project it; here, we cross-blend an all-sky photographic render, a near-IR stellar density map, and a far-IR dust map into the impostor's texture stack. The build step lives in `tools/buildMilkyWayAssets.ts` and is the most compositing-heavy of the new pipelines.

---

## What it is

Five logically independent assets shipped together because they all serve Shell 3's "look at the Milky Way from the outside" beat:

1. **The Milky Way impostor itself** — designed and produced by the separate [milky-way-impostor plan](../../../specs/2026-05-04-milky-way-impostor.md). We describe what shell 3 *consumes* from it (a `milky-way-composite.bc7` texture stack and metadata sidecar).
2. **2MASS K-band all-sky panorama** — near-IR mosaic, equirectangular in galactic coordinates. Stellar-density base layer for the impostor (K traces old K/M giants, which dominate the disk's mass).
3. **IRAS 100 µm dust panorama** — far-IR mosaic. Dust-lane mask for the dark-lane overlay (warm dust glows in the FIR and bisects the disk when seen edge-on).
4. **Harris Milky Way Globular Cluster Catalog (2010 ed.)** — ~157 globulars; we render the brightest ~30. Encoded as a small custom binary alongside the textures.
5. **Magellanic Cloud constants** — LMC and SMC positions and apparent sizes, hard-coded in TypeScript.

Items 2–4 are public-domain or citation-only datasets fetched once at build time. Item 1 is delegated. Item 5 is two literals.

## Why we need it

Shell 3 (T+0:25 → T+0:36 in the tour) is the "your home from outside" beat. The impostor is the hero element, but it is a *layered* impostor: the renderer needs the visible-light render, the K-band density, and the dust mask all in registered galactic coordinates so the per-pixel composite math (see [`shells/03-milky-way.md`](../shells/03-milky-way.md) §4) lines up. The globulars dot the halo to sell that the impostor is a 3D object embedded in a 3D halo, not a flat decal. The Magellanic Clouds appear at frame edge in the last 3 s and are the visual handoff to Shell 4 (Local Group).

This spec exists separately from the impostor spec because the *acquisition* of the underlying panoramas is its own pipeline. The impostor reads pre-baked textures; this document is how those textures are made.

## Acquisition

### 2MASS K-band all-sky panorama

- **Source:** 2MASS Large Galaxy Atlas at IRSA.
- **URL:** [https://irsa.ipac.caltech.edu/Missions/2mass.html](https://irsa.ipac.caltech.edu/Missions/2mass.html) — pull the all-sky composite mosaic in galactic equirectangular projection.
- **Format:** FITS (float32), galactic equirectangular, native ~5 arcmin/pixel (~4096 × 2048). Downsampled to 2048 × 1024 in the build.
- **Size:** ~70 MB raw, ~2 MB after BC7. Cached at `data/raw/2mass-k-band-galactic.fits` (gitignored).

K-band (not J or H) traces old K/M giants — the Galaxy's mass — and is least dust-affected. J/H are noisier on the disk.

### IRAS 100 µm dust panorama

- **Source:** IRIS reprocessing of IRAS Sky Survey Atlas, accessed via Skyview.
- **URL:** [https://skyview.gsfc.nasa.gov/current/cgi/query.pl](https://skyview.gsfc.nasa.gov/current/cgi/query.pl) — survey "IRIS 100", projection "Galactic AIT", full sky.
- **Format:** FITS (float32), galactic equirectangular, ~1.5 arcmin/pixel.
- **Size:** ~50 MB raw, ~2 MB after BC7. Cached at `data/raw/iras-100um-galactic.fits`.

100 µm traces the warm dust that produces optical dark lanes; longer bands trace cold cirrus and lose disk-plane contrast. IRIS has much better zodiacal-light removal than raw IRAS.

### Harris Globular Cluster Catalog

- **Source:** Harris (1996, 2010 ed.) MW Globular Cluster Catalog.
- **URL:** [https://heasarc.gsfc.nasa.gov/W3Browse/all/mwgc.html](https://heasarc.gsfc.nasa.gov/W3Browse/all/mwgc.html) (CSV) or [https://physwww.mcmaster.ca/~harris/mwgc.dat](https://physwww.mcmaster.ca/~harris/mwgc.dat) (canonical fixed-width).
- **Format:** HEASARC CSV (one row per cluster); ~50 KB. Cached at `data/raw/harris-mwgc-2010.csv`.

Most recent revision; no consolidated Gaia-era replacement exists. Distance precision is sub-pixel at Shell 3's render scale (see [`shells/03-milky-way.md`](../shells/03-milky-way.md) §13 q4).

### Magellanic Cloud constants

Literature consensus values, no fetch required. LMC: 50 kpc (Pietrzyński+ 2019, ~1%), galactocentric (−0.7, −41, −27) kpc, ~9 kpc visible disk. SMC: 60 kpc, (15, −38, −44) kpc, ~5 kpc disk. Encoded in `src/data/magellanicClouds.ts` (see [`shells/03-milky-way.md`](../shells/03-milky-way.md) §15).

## Parsing

### 2MASS / IRAS panoramas

Both FITS files are parsed by `tools/buildMilkyWayAssets.ts` using a minimal pure-TS FITS reader (no Astropy dependency — we only need primary HDU header + float32 data). The header projection (galactic vs. equatorial) is checked at parse time; if either file disagrees with the expected galactic equirectangular, the build fails with a refetch instruction. We do **not** attempt automatic re-projection — error-prone, and both archives natively support galactic equirectangular output.

After parsing: pixel values are clipped to the 0.5%–99.5% percentile per panorama (kills cosmic-ray spikes and the Galactic-center peak that would blow out BC7 quantization). Both are resampled linearly to 2048 × 1024. The K-band panorama is gamma-corrected (γ = 0.5) for a painterly contrast curve; IRAS is left linear (used as a multiplier mask, not a luminance source).

### Harris catalog

`tools/parsers/harrisGlobulars.ts` reads the CSV. Schema (columns we use):

| CSV col | Meaning | Use |
|---------|---------|-----|
| `Name` | "M13", "NGC 2419", etc. | Display + sort key |
| `RAJ2000` / `DEJ2000` | Equatorial position (deg) | Convert to galactocentric Cartesian |
| `R_Sun` | Distance from Sun (kpc) | Combined with RA/Dec → galactocentric XYZ |
| `M_V` | Integrated absolute V magnitude | Selection cut + apparent brightness normalization |
| `r_h` | Half-light radius (arcmin) | Billboard sizing input |

Columns we drop: metallicity ([Fe/H]), velocity dispersion, ellipticity, all the structural parameters. Shell 3 does not need them.

Position conversion: `(RA, Dec, R_Sun) → heliocentric Cartesian → galactocentric Cartesian`, via `src/utils/math/raDecZToCartesian.ts` (already in production) plus translation by the Sun position constant `(−8.122, 0, +0.0208)` kpc. Round-trip unit-tested on five known-position globulars (M13, M22, Omega Cen, NGC 2419, M54) against SIMBAD-resolved galactocentric XYZ.

## Filtering / cross-matching

- **2MASS / IRAS:** no filtering; full sky retained, masking happens at shader time.
- **Harris:** filter to `M_V < −8.0`. This yields exactly 28 globulars in the 2010 edition. Pad to 30 by force-including NGC 2419 ("the Intergalactic Wanderer," visually compelling at 90 kpc out) and Omega Centauri (already in the cut, but pinned to position 1 for guaranteed prominence). A magnitude threshold is stable across catalog re-derivations; "top 30" depends on the tail.

No cross-matching: the Harris catalog is self-contained, and the panoramas live in their own sky-pixel coordinate system that the impostor consumes directly.

## Output binary format

Two outputs from this pipeline:

### `milky-way-composite.bc7` (texture stack)

Produced and consumed by the **impostor plan**, not us. `tools/buildMilkyWayAssets.ts` invokes the impostor's build helper, passing the parsed-and-downsampled K-band and IRAS arrays as Float32 buffers. The helper composites them with its visible-light base layer and parametric arms layer into a single BC7-compressed texture array (4 layers × 2048 × 1024) plus a JSON sidecar (`milky-way-composite.meta.json`). See [`docs/superpowers/specs/2026-05-04-milky-way-impostor.md`](../../../specs/2026-05-04-milky-way-impostor.md) once it lands.

### `globulars.bin` (catalog)

A small fixed-record binary, format-versioned in the same style as `src/data/pointCloudFormat.ts`. Per-record layout (32 bytes):

```
Offset  Size  Field                Type     Notes
0       4     positionXKpc         f32      galactocentric X
4       4     positionYKpc         f32      galactocentric Y
8       4     positionZKpc         f32      galactocentric Z
12      4     apparentBrightness   f32      0..1, normalized from M_V
16      4     halfLightRadiusKpc   f32      for billboard sizing
20      4     nameOffset           u32      byte offset into trailing string blob
24      4     nameLength           u32      length in bytes (UTF-8)
28      4     reserved             u32      pad to 32, future use (e.g. flag bits)
```

Header is the standard skymap 16-byte format (magic, version=1, count, unused). The 30 names are concatenated UTF-8 in a string blob immediately following the records. Total file size: ~1.1 KB.

This format is custom because the existing `pointCloudFormat.ts` (48 bytes/point) carries fields we don't need (color index, magnitude, kPerZ) and lacks a `name` slot. At 30 entries, a new format is cheaper than overloading the point-cloud format.

## Build script

- **File:** `tools/buildMilkyWayAssets.ts`. Run via `npm run build-milky-way` (also invoked by `npm run build-shell-data`).
- **Steps:** (1) read cached FITS from `data/raw/` (exit non-zero with a fetch instruction if missing); (2) parse and downsample both panoramas (~20 s each); (3) read the Harris CSV, filter to top ~30, encode `globulars.bin`; (4) hand panorama buffers to the impostor's build helper to produce `milky-way-composite.bc7` + sidecar (~30 s, BC7-dominated); (5) write outputs to `public/data/milky-way/`.
- **Idempotent:** yes. Same inputs yield byte-identical outputs (deterministic BC7 encoder seed). ~90 s first run, ~5 s no-op (mtime short-circuit).

The R2 sync's ALLOW filter (`tools/syncR2.ts`) gets a `milky-way/*` entry so all files ship in one go.

## Licensing & attribution

- **2MASS** (NASA / Caltech / UMass): public domain. Credit: "2MASS, a joint project of UMass and IPAC/Caltech, funded by NASA and NSF."
- **IRAS / IRIS** (NASA): public domain. Credit: "IRIS reprocessing of IRAS data; Miville-Deschênes & Lagache 2005."
- **Harris MWGC**: citation-required. Cite "Harris, W.E. 1996, AJ, 112, 1487 (2010 ed.)" in `CREDITS.md` and the in-tour overlay credit ("Globular clusters: Harris 1996 / 2010 ed.").
- **Impostor texture stack:** licensing inherited from its constituent layers (handled by the impostor plan).

No commercial-use restrictions. (Contrast with Cosmicflows-4 / CC BY-NC; see [`00-data-sources.md`](00-data-sources.md) §"Licensing".)

## Risks

- **Impostor plan slippage.** If the impostor spec is delayed, `milky-way-composite.bc7` cannot be produced. Mitigation: `tools/buildMilkyWayAssets.ts` ships with a stub that produces a flat 1-layer placeholder texture (just the K-band panorama, gamma-corrected) so shell 3 can render something during development. The fallback in [`shells/03-milky-way.md`](../shells/03-milky-way.md) §11 already accommodates this.
- **2MASS / IRAS upstream link rot.** Both archives have been stable for 20+ years, but URL paths change with each redesign. Mitigation: cache the raw files in a personal R2 bucket alongside the catalogs.
- **FITS parsing edge cases.** Our minimal TS FITS reader handles the primary HDU and float32 only. If IRSA ever changes default to int16 with BSCALE/BZERO, the build fails. Mitigation: explicit assertion with a recovery instruction ("export as float32 from Skyview").
- **BC7 banding on smooth panoramas.** BC7 is designed for high-frequency content; the IRAS dust map's gradual Galactic-plane bulge can band. Mitigation: pre-dither with a 1-bit blue-noise mask before encoding. Adds ~2 s; kills banding.

## Sample/test data

A 64 × 32 toy panorama (a Gaussian-falloff disk with a vertical "dust" strip) and a 5-entry mini-Harris CSV live in `tests/services/engine/shell3/__fixtures__/`. The build script's pure functions (FITS reader, CSV parser, downsample, encode-globulars) are unit-tested against these in <50 ms. The full build is not run in CI (too slow, too network-dependent), but `npm run build-milky-way --dry-run` exercises every code path against the fixtures as a CI smoke test.

## References

- Skrutskie+ 2006, "The Two Micron All Sky Survey (2MASS)", AJ 131, 1163.
- Miville-Deschênes & Lagache 2005, "IRIS: A New Generation of IRAS Maps", ApJS 157, 302.
- Harris, W.E. 1996, "A Catalog of Parameters for Globular Clusters in the Milky Way", AJ 112, 1487 (2010 revision at [https://physwww.mcmaster.ca/~harris/mwgc.dat](https://physwww.mcmaster.ca/~harris/mwgc.dat)).
- Pietrzyński+ 2019, "A distance to the Large Magellanic Cloud that is precise to one per cent", Nature 567, 200.
- Gravity Collaboration 2019, "A geometric distance measurement to the Galactic center black hole", A&A 625, L10.
- [`shells/03-milky-way.md`](../shells/03-milky-way.md) — the consumer of this asset bundle.
- [`docs/superpowers/specs/2026-05-04-milky-way-impostor.md`](../../../specs/2026-05-04-milky-way-impostor.md) — the impostor renderer spec (separate plan; produces the composite texture from the panoramas this doc fetches).
- [`00-data-sources.md`](00-data-sources.md) — master catalog of all cosmic-zoom data sources.
