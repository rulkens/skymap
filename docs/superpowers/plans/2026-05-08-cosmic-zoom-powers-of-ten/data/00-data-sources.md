# Data Sources — Master Catalog

This document is the single source of truth for **every external dataset the cosmic zoom needs.** Each row points at a per-source spec (`data/01-*.md` through `data/0N-*.md`) with the full acquisition, conversion, and integration plan.

## Summary table

| # | Spec | Used by shell | Source | Approx size | License | Risk |
|---|------|---------------|--------|-------------|---------|------|
| 1 | [Solar System ephemeris](01-solar-system-ephemeris.md) | Shell 1 | NASA JPL Horizons / DE440 | <1 MB | Public domain | Low |
| 2 | [Gaia DR3 stellar catalog](02-gaia-stars.md) | Shell 2 | ESA Gaia | 50–200 MB (cut down) | CC BY 4.0 (with credit) | Med (size) |
| 3 | [Milky Way disk model](03-milky-way-model.md) | Shell 3 | NASA SVS / 2MASS / IRAS composite + parametric | 5–20 MB | Mixed (per asset) | Med (compositing) |
| 4 | [Local Group catalog](04-local-group-catalog.md) | Shell 4 | NED Local Volume Catalog (LVC) + Karachentsev | <2 MB | Citation-required | Low |
| 5 | [Tully galaxy groups (2GC)](05-tully-galaxy-groups.md) | Shells 5, 6 | Tully+ 2015 (2MRS-derived) | <5 MB | Citation-required | Low |
| 6 | [Cluster catalogs (Abell, ACO, MCXC)](06-cluster-catalogs.md) | Shells 6, 7 | Abell 1958, ACO 1989, MCXC 2011 | <3 MB | Public | Low |
| 7 | [Cosmicflows-4 velocity field](07-cosmicflows.md) | Shell 7 | Tully+ 2023 (CF-4) | 50–200 MB | CC BY-NC | Med (license) |
| 8 | [ROSAT all-sky X-ray](08-rosat-xray.md) | Shells 6, 7 | ROSAT RASS, MPE | 10–50 MB (downsampled) | Public | Low |
| 9 | [Planck CMB all-sky](09-planck-cmb.md) | Shell 9 | Planck PR4 SMICA | 5–20 MB (downsampled) | ESA citation | Low |

Plus existing skymap data (already in production):

| # | Source | Used by shell |
|---|--------|---------------|
| - | SDSS galaxies (`sdss-*.bin`) | Shell 8 |
| - | 2MRS galaxies (`2mrs.bin`) | Shells 5–8 |
| - | GLADE galaxies (`glade-*.bin`) | Shells 5–8 |
| - | Famous galaxies (`famous.bin`) | All catalog shells, for labels |
| - | DisPerSE filaments (`filaments.bin`) | Shell 8 |
| - | Galaxy thumbnails (SDSS / CDS hips2fits) | Shells 4–8, on close approach |

Plus, planned:

| # | Source | Status |
|---|--------|--------|
| - | Milky Way impostor (separate plan) | Pending; required for shell 3 |
| - | CF-4 dark-matter density volume | Pending; required for shell 7 |

## Total size impact

If we ingest everything at the sizes in the table:

```
Solar System ephemeris       <1 MB
Gaia DR3 (cut down)         150 MB
Milky Way model              15 MB
Local Group catalog           2 MB
Tully groups                  4 MB
Cluster catalogs              3 MB
Cosmicflows-4               150 MB
ROSAT X-ray                  30 MB
Planck CMB                   15 MB
                          --------
                 TOTAL    ~370 MB
```

Plus existing R2 data (~280 MB). New total: **~650 MB on R2.** This is manageable — R2 is unmetered for storage and free for egress. The CDN cost is zero. The user-side cost is bandwidth: a fresh visitor who completes the full tour downloads incrementally as each shell is needed; a worst-case "pre-load everything" path is ~650 MB which we will not do (see [`decisions/0008-build-pipeline.md`](../decisions/0008-build-pipeline.md) for the lazy-load strategy).

**Per-shell incremental download** (assuming the wide-view `glade-medium.bin` + `2mrs.bin` are already loaded from skymap's normal startup):

| Shell | Additional bytes user must download to render this shell |
|-------|----------------------------------------------------------|
| 1. Solar System | <1 MB |
| 2. Stellar Neighborhood | 30 MB (Gaia subset) |
| 3. Milky Way | 15 MB (model + textures) |
| 4. Local Group | 2 MB |
| 5. Local Sheet | 0 (uses existing GLADE + Tully groups, ~4 MB extra) |
| 6. Virgo Supercluster | 30 MB (X-ray cluster overlay) |
| 7. Laniakea | 200 MB (CF-4 + dark-matter density volume) |
| 8. Cosmic Web | 0 (existing data) |
| 9. Observable Universe | 15 MB (CMB) |

Shell 7 is the biggest cost. A pre-fetch strategy that starts loading CF-4 the moment the user clicks "Take the tour" (rather than when they reach shell 7) keeps the cinematic from stalling.

## Licensing summary

Most sources are either public domain or require only an attribution credit. Two require care:

- **Cosmicflows-4** is published under CC BY-NC. **Non-commercial only.** Skymap is currently a personal project hosted at no cost; we're fine. If skymap ever becomes commercial (paid tier, etc.), this dataset must be replaced or re-licensed. Document this clearly. See [`decisions/0007-data-licensing.md`](../decisions/0007-data-licensing.md).
- **Gaia DR3** is CC BY 4.0 — commercial OK, but a credit line is mandatory. We'll show "Stars: ESA / Gaia / DPAC" on shell 2's overlay.

A consolidated **CREDITS.md** at the repo root will list every dataset, version, citation, and license. The tour overlay will show a brief credit line per shell (e.g., "Galaxies: SDSS / 2MRS / GLADE • Filaments: DisPerSE").

## Build-time vs runtime

All datasets are **converted to skymap's binary format at build time** by tools in `tools/` and uploaded to R2 by `npm run sync-r2`. Runtime fetches a `.bin` per shell; no API calls during normal operation.

This matters because:
- Several upstream sources are slow / rate-limited / occasionally offline (NED, JPL Horizons).
- We need deterministic builds for reproducibility.
- The downstream rendering code only ever sees one binary format, not a dozen archive formats.

The exception is **galaxy thumbnails**, which already fetch on-demand from SDSS DR18 and CDS hips2fits. Those keep their current behavior — they're the only true runtime data dependency.

## Build pipeline integration

Each new dataset gets its own `tools/buildXyz.ts` that:
1. Reads the upstream raw file from `data/raw/`.
2. Parses + filters + cross-matches as needed.
3. Encodes to a versioned binary using `src/data/scaleSpecificFormat.ts` helpers (see [`data/10-binary-formats.md`](10-binary-formats.md)).
4. Writes to `public/data/`.

A new top-level `npm run build-shell-data` orchestrates them all, parallelized where the inputs allow. Calls each `tools/buildXyz.ts` in sequence (not parallel — keeps log output legible and avoids OOM).

The R2 sync script (`tools/syncR2.ts`) gets a new ALLOW filter for the new `.bin` filenames.

## Per-source documents

Each linked spec (`data/01-*.md` through `data/09-*.md`) follows the same template:

```
# <Source name>

## What it is
## Why we need it (which shell, what role)
## Acquisition
  - URL / API endpoint
  - Authentication required?
  - Format (FITS, CSV, HDF5, ...)
  - Size (raw)
## Parsing
  - Code path / library
  - Schema (columns / fields we use, fields we drop)
## Filtering / cross-matching
  - Cuts applied (magnitude limit, distance cut, etc.)
  - Cross-match keys to existing data
## Output binary format
  - Reference to data/10-binary-formats.md section
  - Per-record byte layout
## Build script
  - File: tools/buildXyz.ts
  - Run command
  - Idempotent?
  - Approximate runtime
## Licensing & attribution
## Risks
## Sample/test data
## References (papers, archives)
```

Open the per-source files in `data/01-*.md` onwards for the elaborated specs.
