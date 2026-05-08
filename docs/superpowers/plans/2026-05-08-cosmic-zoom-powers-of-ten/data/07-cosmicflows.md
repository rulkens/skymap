# Cosmicflows-4 (CF-4) — galaxy peculiar-velocity catalog + reconstructed density / velocity field

## What it is

**Cosmicflows-4** (Tully et al. 2023) is the fourth-generation compilation of galaxy distances and **peculiar velocities** in the local universe — roughly **55,877 galaxies** with redshift-independent distances from Tully-Fisher (the bulk), Fundamental Plane, Type Ia supernovae, surface-brightness fluctuations, Cepheids, and TRGB. Peculiar velocity is the residual after subtracting the smooth Hubble flow — the only direct kinematic tracer of the **gravitational potential** of large-scale structure. Galaxies fall toward overdensities (Great Attractor, Shapley, Coma, Perseus-Pisces) and flow away from voids. CF-4's flow map is what defined **Laniakea** in the 2014 Tully+ paper.

We use **two derived products**:

1. **The galaxy catalog itself** — 55,877 galaxies with `(SGX, SGY, SGZ, V_pec)`. A small "input data" overlay on shell 7 so the user sees what was measured before the reconstruction smoothed it.
2. **The reconstructed density + 3D velocity field** on a regular Cartesian grid, from Valade et al. 2024's Hamiltonian Monte Carlo "HAMLET" reconstruction. A 256³ cube spanning 1000 h⁻¹ Mpc that ray-marches into a glowing web of overdensities and dark voids. The same grid carries the velocity field, sub-sampled for animated flow arrows.

## Why we need it (which shell, what role)

**Shell 7 (Laniakea).** The rhetorical climax of the tour — "we live in a supercluster, here is its shape." Without CF-4, shell 7 has no hero data; GLADE + 2MRS show positions, not the flows that define Laniakea. CF-4's density field is the canonical Pomarède-Tully visualization republished across NASA APODs and Nature covers.

Three roles in shell 7:

- **Volumetric DM density** as a translucent 3D scalar field (front-to-back ray-march, log-encoded transfer). Voids cool-blue, mean transparent, overdensities warm-white. Laniakea, Local Void, Great Attractor, Shapley, Perseus-Pisces appear as named features.
- **Flow-vector arrows** on a coarser sub-grid (~32³, ~32 k arrows after culling) as short streamline strokes along the local velocity.
- **Galaxy points overlay** — the 55,877 CF-4 inputs as a dim point cloud, distinct from GLADE/2MRS so the user sees "the data behind the reconstruction."

This shell **consumes** [`specs/2026-05-07-cf4-dark-matter-volume-render-design.md`](../../specs/2026-05-07-cf4-dark-matter-volume-render-design.md), which already defines the volume-render pipeline, binary format, and shader. The flow-vector renderer is the only new GPU subsystem.

## Acquisition

- **Primary distribution:** **Extragalactic Distance Database (EDD)** at <https://edd.ifa.hawaii.edu>. CF-4 has its own table page; bulk catalog is a single ASCII file (~50 MB). No authentication.
- **Reconstructed cubes:** Valade 2024 HAMLET cube mirrored at EDD's "Numerical Action Models" page and the Cosmicflows wiki <http://www.ipnl.in2p3.fr/projet/cosmicflows/>. Native format is IDL `.sav`; community `.npy` re-exports exist on Zenodo.
- **Format:** Catalog is fixed-width ASCII (PGC, name, RA/Dec, SGX/SGY/SGZ in Mpc, distance modulus, `cz`, `V_pec`, error). Cubes are IDL `.sav` upstream; we standardize on **HDF5** internally (one-shot Python re-export) so downstream uses `h5py`. The HDF5 holds four datasets (`density, vx, vy, vz`) each `(256, 256, 256)` f32.
- **Size (raw):** Catalog ~50 MB. Native cube 256³ × 4 bytes × 4 channels = **256 MB** — the bottleneck.

Both files are one-shot downloads in `data/raw/cf4/`, gitignored, R2-mirrored under `raw/` as source of truth (EDD has had multi-week outages).

## Parsing

### Catalog (Python preprocessor + TS finalize)

- `tools/cf4CatalogIngest.py` does one-shot ASCII → CSV (`pandas.read_fwf` against EDD's published ReadMe) → `data/raw/cf4/cf4_catalog.csv`. Then `tools/buildCosmicflows.ts` reads the CSV and emits the binary.
- **Why Python?** EDD ReadMe column inventory drifts; pandas + ReadMe is more robust than a hand-rolled TS fixed-width parser. Same precedent as the CF-4 density spec.
- **Schema (columns we use):**

  | Column | Type | Use |
  |--------|------|-----|
  | `PGC` | u32 | Cross-match key into HyperLEDA / GLADE |
  | `Name` | string | Reserved; not stored in v1 binary |
  | `SGL`, `SGB` | f32 (deg) | Supergalactic longitude / latitude |
  | `SGX`, `SGY`, `SGZ` | f32 (Mpc) | Supergalactic Cartesian, observer at origin |
  | `cz` | f32 (km/s) | Heliocentric recession velocity |
  | `Dist` | f32 (Mpc) | Best-estimate redshift-independent distance |
  | `V_pec` | f32 (km/s) | Peculiar velocity along the line of sight |
  | `eV_pec` | f32 (km/s) | Error on the peculiar velocity |

  Method flag, distance modulus, error breakdown, and per-method estimates are dropped in v1.

### Density + velocity cubes (Python preprocessor + TS finalize)

- `tools/cf4FieldIngest.py` reads the `.sav` via `scipy.io.readsav`, extracts `density, vx, vy, vz`, validates each as `(256, 256, 256)` f32, and writes `data/raw/cf4/cf4_field.h5` (four datasets + a `cosmology` attribute group).
- `tools/buildCosmicflows.ts` then reads the HDF5 via `h5wasm` and emits `cf4-density.bin` + `cf4-flow.bin`.

## Filtering / cross-matching

### Catalog filtering

1. **Drop rows with non-finite `V_pec`** (sentinel `-9999`).
2. **Distance cap at 200 Mpc** — CF-4 signal degrades past ~150 Mpc and is noise past 250 Mpc; matches the cube's well-reconstructed central volume.
3. **No cross-match required** for v1; PGC is the join key into GLADE if we ever want it.

Expected output: **~50,000 rows**.

### Density / velocity field re-binning

Two delivery options:

- **Option A — ship 256³ via R2.** ~32 MB f16 density + ~96 MB f16 velocity = **128 MB**. Matches the existing `glade-large.bin` (130 MB) precedent.
- **Option B — downsample to 128³.** Box-filter 2× per axis. Density ~4 MB, velocity ~12 MB. Total **~16 MB.** Quality drop is modest; the kernel is comparable to CF-4's intrinsic 5-Mpc resolution.

**Default: Option A.** The CF-4 design spec already commits to 256³. Option B is the fallback if shell 7's load time is unacceptable on the median connection — flagged in [`decisions/0008-build-pipeline.md`](../decisions/0008-build-pipeline.md).

The cube is also **clipped to a sphere of radius 250 Mpc around the observer** (corner voxels are reconstruction noise). Enforced by zero-clamping at sample time; radius rides in the header as `well_reconstructed_radius_mpc`.

## Output binary formats

Two separate binaries, both gitignored, both R2-hosted. Reference: [`data/10-binary-formats.md`](10-binary-formats.md) sections "CF-4 catalog v1," "CF-4 density v1" (already specified in the existing CF-4 design spec — re-link), and "CF-4 flow v1."

### `cf4-catalog.bin` — the input-data overlay

Per-record layout, **24 bytes/galaxy, little-endian:**

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 4 | f32 | SGX (Mpc) |
| 4 | 4 | f32 | SGY (Mpc) |
| 8 | 4 | f32 | SGZ (Mpc) |
| 12 | 4 | f32 | V_pec (km/s) |
| 16 | 4 | f32 | eV_pec (km/s) |
| 20 | 4 | u32 | PGC ID |

Header (12 bytes, mirroring the existing `pointCloudFormat.ts` conventions):

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 4 | ASCII | magic = `"CF4C"` |
| 4 | 2 | u16 | version (1) |
| 6 | 2 | u16 | reserved |
| 8 | 4 | u32 | record count |

Total file size: `12 + 24 * count` ≈ **~1.2 MB** for 50,000 galaxies. Trivially small.

### `cf4-density.bin` — the reconstructed dark-matter density volume

**Already fully specified by [`specs/2026-05-07-cf4-dark-matter-volume-render-design.md`](../../specs/2026-05-07-cf4-dark-matter-volume-render-design.md):** 64-byte header + `nx·ny·nz·2` bytes of f16 voxels (~32 MB at 256³). This plan does **not** redefine the format; it consumes `src/data/cf4DensityFormat.ts`'s `encode()`. Build-order dependency flagged in [`decisions/0009-cross-plan-dependencies.md`](../decisions/0009-cross-plan-dependencies.md).

### `cf4-flow.bin` — the velocity field for arrow animation

Modeled on the density format but with three f16 channels per voxel. Same 64-byte header (magic `"CF4V"`, version 1); body is `nx·ny·nz·3·2` bytes = ~96 MB at 256³. Stored in **km/s in supergalactic Cartesian**; renderer normalizes to a unit direction for the glyph and uses magnitude for color (slow blue, fast red).

## Build script

- **File:** `tools/buildCosmicflows.ts`.
- **Run command:** `npm run build-cosmicflows` (also called by `npm run build-shell-data`).
- **Inputs:** `data/raw/cf4/cf4_catalog.csv`, `data/raw/cf4/cf4_field.h5`, cosmology metadata sidecar.
- **Outputs:** `public/data/cf4-catalog.bin`, `public/data/cf4-density.bin`, `public/data/cf4-flow.bin`.
- **Idempotent:** yes. Catalog sorted by `PGC` ascending; field cubes already in fixed `(z, y, x)` order from the preprocessor.
- **Runtime:** ~5 s catalog; ~20 s field (f32 → f16 over 67 M voxels dominates).
- **Sync to R2:** add all three filenames to `tools/syncR2.ts` ALLOW filter. `cf4-flow.bin` at ~96 MB is the second-largest file we ship; deploy checklist warns the operator to expect a multi-minute upload.

## Licensing & attribution

**This is the only dataset in the cosmic-zoom plan with a non-commercial license. Read this section carefully.**

**License:** **Creative Commons Attribution-NonCommercial 4.0 International (CC BY-NC 4.0).** Set explicitly by the Cosmicflows team in the EDD release notes and reaffirmed on the Valade 2024 HAMLET cube's README. The reconstructions inherit the CF-4 license as direct derivative products.

**What CC BY-NC permits:** use, copy, distribute, modify, and build upon for any **non-commercial** purpose, with attribution. Hosting on a free public website, academic publications, blog posts, personal-portfolio interactive visualizations, and non-commercial educational contexts are all explicitly OK.

**What CC BY-NC prohibits:** any primarily commercial use — paid subscriptions, paid app downloads, materially ad-funded pages, paid embeddings, sale of derivative artwork or posters, inclusion in paid SaaS. CC BY-NC's "non-commercial" boundary is famously fuzzy; the conservative rule is **if money flows toward you because of or alongside the CF-4 visualization, you need a different license.** Sublicensing under a more permissive license is also forbidden — shipping shell 7 as part of a larger package pulls the whole package down to BY-NC.

**Skymap's current status:** personal project, no monetization, no ads, no paid features, hosted on the author's own Cloudflare account at no cost to users. **CC BY-NC is fine in the current state. No violation, no risk.**

**The flag for future maintainers:** if skymap ever considers any of the following, the CF-4 layer must be re-licensed, replaced, or stripped:

- A paid tier (subscriber-only resolutions, paid attribution removal, paid offline cache).
- Selling posters, prints, or merchandise incorporating CF-4 imagery (even via a "user-generated" screenshot button).
- Bundling skymap into a paid commercial product (museum kiosk app sold to museums, enterprise SaaS).
- Paid sponsorships placed adjacent to the CF-4 visualization that materially fund the project.

Replacement options if monetization happens: (a) **drop CF-4 entirely** and fall back to GLADE/2MRS points with a static Laniakea boundary overlay (loses hero punch, stays defensible); (b) **negotiate commercial terms** directly with the Cosmicflows team at IfA Hawaii (reachable historically, no guarantee); (c) **replace with a public-domain alternative** — but as of 2026 none exists at comparable depth (BORG-SDSS is also BY-NC, 2M++ has mixed licensing, Hoffman simulations are case-by-case). This is a structural constraint of the field.

**Required citations:**

- Catalog: Tully, R. B., Kourkchi, E., Courtois, H. M., et al. 2023, ApJ, 944, 94. *Cosmicflows-4.*
- Reconstruction: Valade, A., Libeskind, N. I., Pomarède, D., et al. 2024, *Nature Astronomy* 8, 1610.

**In-app credit:** shell 7 overlay carries **"Reconstruction: Valade et al. 2024 • Catalog: Tully et al. 2023 — CC BY-NC"** for the duration of the beat. The "About this view" panel expands to the full citation block. Repo-level `CREDITS.md` plus a `LICENSE-DATA.md` mirror this section so the BY-NC constraint is visible without digging into plan documents. See [`decisions/0007-data-licensing.md`](../decisions/0007-data-licensing.md).

## Risks

1. **License re-classification at monetization.** The dominant risk. Documented above; mitigation is a hard gate in `decisions/0007-data-licensing.md` requiring license review before any monetization ships.
2. **Dataset size and load time.** ~128 MB for the field alone is shell 7's whole budget. Mitigation: pre-fetch on tour-start with a visible progress indicator. Fallback: Option B (128³ downsample, ~16 MB).
3. **EDD archive availability.** EDD has had multi-week outages. Mitigation: raw inputs R2-mirrored under `raw/`; builds never depend on EDD being live.
4. **Upstream `.sav` schema drift.** The variable name inside the IDL `.sav` is undocumented and may differ between minor releases. Mitigation: ingest's pre-implementation step prints `.sav` keys; discovered name recorded in `data/raw/cf4/README.md`. Same precedent as the existing CF-4 design spec.
5. **Coordinate-frame confusion.** CF-4 is supergalactic Cartesian; skymap is equatorial. Build script applies the supergalactic → equatorial rotation (Lahav et al. 2000). Hand-checked test point (M87 at SGX ≈ -2, SGY ≈ +16, SGZ ≈ -1 Mpc → RA ≈ 12h31m, Dec ≈ +12.4°) catches frame mistakes.
6. **Cross-plan ordering.** Assumes the existing CF-4 design spec lands first. If inverted, this plan absorbs those pieces. Flagged in `decisions/0009-cross-plan-dependencies.md`.
7. **Velocity unit confusion (km/s vs Mpc/Gyr).** Stored in km/s; the renderer needs unit direction + magnitude separately. Test fixture at Virgo infall (~700 km/s toward SGL ≈ 100°) catches sign and unit mistakes.
8. **License-text drift upstream.** The CF-4 license note is republished slightly differently across EDD, the wiki, and Zenodo. Mitigation: snapshot upstream license text at acquisition time into `data/raw/cf4/LICENSE.txt` so what we shipped is frozen at build time.

## Sample / test data

- 200-row catalog excerpt at `tests/fixtures/cf4-catalog-sample.csv`.
- Truncated **16³** field HDF5 at `tests/fixtures/cf4-field-sample.h5`.
- `tests/tools/buildCosmicflows.test.ts` runs the pipeline against both fixtures and asserts magics (`"CF4C"`, `"CF4D"`, `"CF4V"`), counts, and f32↔f16 round-trip precision.

Full inputs are R2-mirrored under `raw/`, not git-committed. Fixtures (~30 KB) are committed.

## References

- Tully, R. B., et al. (2023). *Cosmicflows-4.* ApJ, 944, 94. <https://doi.org/10.3847/1538-4357/ac94d8>
- Valade, A., et al. (2024). *Cosmography of the Local Universe by HMC Reconstruction.* Nature Astronomy, 8, 1610. <https://doi.org/10.1038/s41550-024-02370-0>
- Tully, R. B., et al. (2014). *The Laniakea Supercluster of Galaxies.* Nature, 513, 71. <https://doi.org/10.1038/nature13674>
- EDD: <https://edd.ifa.hawaii.edu>; Cosmicflows project: <http://www.ipnl.in2p3.fr/projet/cosmicflows/>
- Lahav, O., et al. (2000). *Supergalactic-equatorial transformation.* MNRAS, 312, 166.
- Design precedent: [`specs/2026-05-07-cf4-dark-matter-volume-render-design.md`](../../specs/2026-05-07-cf4-dark-matter-volume-render-design.md) — density binary format, renderer, and shader this shell consumes.
- Binary format precedent: `src/data/pointCloudFormat.ts` (v2 header), `src/data/filamentBinaryFormat.ts` (volumetric-adjacent).
