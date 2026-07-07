# DESI DR1 — LSS clustering catalogs (deep-cone source)

| Field         | Value |
|---------------|-------|
| Data release  | DR1, production codename `iron` — public since 2025-03-19 |
| Product       | LSS clustering catalogs, `LSScats/v1.5` |
| Licence       | CC BY 4.0 |
| Upstream URL  | https://data.desi.lbl.gov/public/dr1/survey/catalogs/dr1/LSS/iron/LSScats/v1.5/ |
| Row stride    | 117 bytes/row, 18 columns |
| Cap           | NGC only (north galactic cap — the CrB cone sits inside it; SGC is not fetched) |

## Files

Four tracer catalogs, each `<TRACER>_NGC_clustering.dat.fits`:

| File                                     | Tracer          | Rows (NGC) | z range (full file) |
|-------------------------------------------|-----------------|-----------:|----------------------|
| `BGS_BRIGHT_NGC_clustering.dat.fits`      | BGS_BRIGHT      |  2,909,876 | < 0.4 |
| `LRG_NGC_clustering.dat.fits`             | LRG             |  1,476,135 | 0.4 – 1.0 |
| `ELG_LOPnotqso_NGC_clustering.dat.fits`   | ELG_LOPnotqso   |  1,821,322 | 0.6 – 1.6 |
| `QSO_NGC_clustering.dat.fits`             | QSO             |    793,219 | 0.4 – 3.5 |

Row counts are exact (`NAXIS2` read from the FITS header). z ranges are the
survey design ranges per tracer; within the CrB cone specifically (see
below) the observed ranges narrow to BGS 0.03–0.46, LRG 0.40–1.10,
ELG 0.80–1.60, QSO 0.80–3.47 (measured by the 2026-07-07 spike, ±20–40%
count error from window-sampling clumping — see
`docs/superpowers/specs/2026-07-07-desi-deep-cone-design.md`).

## How to obtain

```
npm run fetch-desi
```

Downloads the four `.fits` files (≈820 MB total) via ~8 MB HTTP range
requests, ≤ 6 concurrent with exponential backoff (the DESI server stalls
long sequential reads and 503s under high concurrency), and writes the
combined `desi_dr1_lss.sha256` sidecar on completion.

## Columns skymap consumes

Of the 18 columns in each file, skymap's parser (`tools/parsers/desiFits.ts`)
reads:

| Column           | Type | Role |
|------------------|------|------|
| `TARGETID`       | i8   | Unique object ID — dedup key into `crossMatch` |
| `RA`, `DEC`      | f8   | Position, degrees (J2000) |
| `Z`              | f8   | Spectroscopic redshift — feeds `redshiftToDistanceMpc` |
| `FLUX_G_DERED`   | f4   | Dust-corrected g-band flux, nanomaggies → magG |
| `FLUX_R_DERED`   | f4   | Dust-corrected r-band flux, nanomaggies → magR |
| `FLUX_Z_DERED`   | f4   | Dust-corrected z-band flux, nanomaggies → magI slot |

`mag = 22.5 − 2.5·log10(flux)`; rows with non-positive g or r flux are
dropped. The remaining columns are clustering weights + random-catalog
bookkeeping that skymap ignores. No shape/orientation columns — DESI rows
take GLADE's no-PA fallback path (axis ratio 1, fallback flag set).

## NGC-only + CrB-cone scoping

The full LSS product is all-sky (NGC + SGC, ~9.75M rows across all four
tracers) — far more than skymap needs for a single deep-field demonstration
region. Skymap fetches NGC only and, at build time, filters further to a
narrow cone around Corona Borealis (RA 233.2°, Dec +32.3°, radius 2.5°,
dot-product test against the cone axis before any allocation-heavy work).
That cone was chosen over two alternatives checked in the same spike:
Coma (194.95°, +27.98°) returns **zero** rows in DR1 — it's outside the
survey footprint — and the Stripe 82 cluster complex (334.42°, +0.15°) is
viable (~30.5k rows/cone) but less dense than CrB (~56k rows/cone total
across the four tracers). NGC-only keeps the fetch to the half of the sky
that actually contains the cone, rather than downloading SGC data that
would be filtered out immediately after parsing.

## Checksum sidecar

`desi_dr1_lss.sha256` is one combined, committed sidecar with four
`<hex>  <filename>` lines (one per tracer file) — the same verification
role as `cf4.sha256`, but four files under one key since they're always
fetched and verified together. Written by the fetcher on completion; a
mismatch on re-run signals a truncated or stale download.
