# DESI DR1 — LSS clustering catalogs (deep-cone source)

| Field         | Value |
|---------------|-------|
| Data release  | DR1, production codename `iron` — public since 2025-03-19 |
| Product       | LSS clustering catalogs, `LSScats/v1.5` |
| Licence       | CC BY 4.0 |
| Upstream URL  | https://data.desi.lbl.gov/public/dr1/survey/catalogs/dr1/LSS/iron/LSScats/v1.5/ |
| Row layout    | Varies per tracer (see "Columns skymap consumes" below) |
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

Column sets vary per tracer (verified live 2026-07-07 against the NGC
extension headers):

| File            | Columns | Bytes/row | Flux columns |
|-----------------|--------:|----------:|--------------|
| BGS_BRIGHT      |      18 |       117 | lowercase `flux_g/r/z/w1/w2_dered` (f4) |
| LRG             |      13 |        97 | none |
| ELG_LOPnotqso   |      15 |       113 | none |
| QSO             |      14 |       105 | none |

Skymap's parser (`parseDesiClustering` in `tools/parsers/desiFits.ts`,
column lookup case-insensitive) reads from **all** tracers:

| Column           | Type | Role |
|------------------|------|------|
| `TARGETID`       | i8   | Unique object ID — dedup key into `crossMatch` |
| `RA`, `DEC`      | f8   | Position, degrees (J2000) |
| `Z`              | f8   | Spectroscopic redshift — feeds `redshiftToDistanceMpc` |

and from **BGS_BRIGHT only** (the other three tracers carry no
photometry at all — positions + clustering weights only):

| Column           | Type | Role |
|------------------|------|------|
| `flux_g_dered`   | f4   | Dust-corrected g-band flux, nanomaggies → magG |
| `flux_r_dered`   | f4   | Dust-corrected r-band flux, nanomaggies → magR |
| `flux_z_dered`   | f4   | Dust-corrected z-band flux, nanomaggies → magI slot |

BGS: `mag = 22.5 − 2.5·log10(flux)`; rows with non-positive g or r flux
are dropped (a non-positive z-band flux keeps the row with a NaN magI).

LRG/ELG/QSO: display magnitudes are synthesized from per-tracer constants
(`tools/parsers/desiTracerDisplay.ts`, decision 2026-07-07): magR = the
population's characteristic absolute r magnitude + the ΛCDM distance
modulus at the row's redshift; magG = magR + a fixed per-population g−r
colour. Display tuning knobs, not per-object photometry — every row of a
tracer at a given z gets the same magnitude.

The remaining columns are clustering weights + random-catalog
bookkeeping that skymap ignores. No shape/orientation columns — DESI rows
take GLADE's no-PA fallback path (axis ratio 1, fallback flag set).

## NGC-only + CrB-cone scoping

The full LSS product is all-sky (NGC + SGC, ~9.75M rows across all four
tracers) — far more than skymap needs for a single deep-field demonstration
region. Skymap fetches NGC only and, at build time, filters further to a
narrow cone around Corona Borealis (RA 231.85°, Dec +30.65°, radius 2.5°,
dot-product test against the cone axis before any allocation-heavy work).
That center is a measured compromise, chosen after the real files were
local: the density spike below found a packed axis at (233.2°, +32.3°),
but centering there leaves both the stored `corona-borealis-sc` supercluster
anchor (230.5005°, +29.0°) and its classic Abell clusters outside the 2.5°
beam; centering exactly on the anchor instead runs into the DR1 footprint
edge and roughly halves the row count. The midpoint keeps the anchor
2.0° off-axis (inside the beam) and brings four Abell clusters
(A2061, A2067, A2079, A2092) into the cone, at 77% of the density peak's
row count. See `tools/catalog/desiCone.ts` for the full rationale. The cone
was chosen over two alternatives checked in the same spike: Coma
(194.95°, +27.98°) returns **zero** rows in DR1 — it's outside the survey
footprint — and the Stripe 82 cluster complex (334.42°, +0.15°) is viable
(~30.5k rows/cone) but less dense than CrB (~56k rows/cone total across the
four tracers, before the final recenter's mild thinning). NGC-only keeps
the fetch to the half of the sky that actually contains the cone, rather
than downloading SGC data that would be filtered out immediately after
parsing.

## Checksum sidecar

`desi_dr1_lss.sha256` is one combined, committed sidecar with four
`<hex>  <filename>` lines (one per tracer file) — the same verification
role as `cf4.sha256`, but four files under one key since they're always
fetched and verified together. Written by the fetcher on completion; a
mismatch on re-run signals a truncated or stale download.

## Required acknowledgment

DESI DR1 is CC BY 4.0 and carries a required funding-acknowledgment
paragraph. Cite DESI Collaboration et al. (2026), "Data Release 1 of the
Dark Energy Spectroscopic Instrument", AJ 171, 285
(ads: `2026AJ....171..285D`). The full acknowledgment text lives once in
[`ATTRIBUTIONS.md`](../../../ATTRIBUTIONS.md) (Catalogue data → DESI DR1) —
that is the canonical copy; it is not duplicated here.
