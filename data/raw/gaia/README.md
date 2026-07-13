# Gaia DR3 — star bin raw inputs

The raw stellar inputs to skymap's Gaia star bin: the G<14 Gaia DR3 main
catalog (with Bailer-Jones distances joined), the GCNS 100 pc supplement,
the Hipparcos-2 bright-star table, and the Hipparcos↔Gaia cross-match.

| Field         | Value |
|---------------|-------|
| Data release  | Gaia DR3 (public since 2022-06-13) |
| Fetch date    | _(filled in when the fetch runs — see Task 11)_ |
| Fetch command | `npm run fetch-gaia` |

## Upstream services + tables

| Service | Endpoint | Tables used |
|---------|----------|-------------|
| ESA Gaia TAP (sync) | `https://gea.esac.esa.int/tap-server/tap/sync` (POST form: `REQUEST=doQuery`, `LANG=ADQL`, `FORMAT=csv`) | `gaiadr3.gaia_source_lite`, `external.gaiaedr3_distance`, `external.gaiaedr3_gcns_main_1`, `gaiadr3.hipparcos2_best_neighbour` |
| CDS VizieR FTP | `https://cdsarc.cds.unistra.fr/ftp/I/311/` | I/311 (`hip2.dat` + `ReadMe`) |

## Files

| File | Source table / URL | Rows | Notes |
|------|--------------------|-----:|-------|
| `gaia_page_<NNNN>.csv` | `gaiadr3.gaia_source_lite` ⨝ `external.gaiaedr3_distance` | 16,844,156 (total, all pages) | Paged main catalog, one file per `random_index` slice |
| `gcns_main.csv` | `external.gaiaedr3_gcns_main_1` | 331,312 | GCNS 100 pc supplement |
| `hip2_best_neighbour.csv` | `gaiadr3.hipparcos2_best_neighbour` | 99,525 | Hipparcos↔Gaia cross-match |
| `hip2.dat` | `https://cdsarc.cds.unistra.fr/ftp/I/311/hip2.dat` | 117,955 | Hipparcos-2, fixed-width 276-byte lines, ~33 MB |
| `ReadMe` | `https://cdsarc.cds.unistra.fr/ftp/I/311/ReadMe` | — | VizieR byte-layout spec for `hip2.dat` |

All of the above are gitignored fetcher outputs except this `README.md`
and the `gaia.sha256` sidecar, which are committed.

## SELECT column lists

The CSV header order is a contract with the star-bin encoder — never
reorder these columns.

**Main catalog** (`gaia_page_<NNNN>.csv`):

```
source_id, ra, dec, phot_g_mean_mag, bp_rp, r_med_geo, r_med_photogeo, random_index
```

`r_med_geo` / `r_med_photogeo` are the Bailer-Jones geometric /
photogeometric distance estimates (`external.gaiaedr3_distance`), joined
on `source_id` via a `LEFT OUTER JOIN`.

**GCNS** (`gcns_main.csv`):

```
source_id, ra, dec, parallax, dist_50, phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag
```

**Cross-match** (`hip2_best_neighbour.csv`):

```
source_id, original_ext_source_id, angular_distance, number_of_neighbours, xm_flag
```

`original_ext_source_id` is the HIP number.

## Selection + row counts (verified live 2026-07-13/14)

- **Magnitude cut:** `phot_g_mean_mag < 14.0` on `gaiadr3.gaia_source_lite`
  yields **16,844,156** rows — asserted at fetch completion.
- **Bailer-Jones join coverage:** 99.24 % of the G<14 rows have a distance
  row in `external.gaiaedr3_distance`; the unjoined 0.76 % come back with
  empty distance cells (the encoder's counted drop, not a fetch failure).
- **Expected per-file row counts:** GCNS **331,312**, cross-match
  **99,525**, hip2 **117,955** lines. Each is asserted at fetch time.

## Paging scheme

The main catalog is fetched as contiguous `random_index` slices — Gaia's
built-in uniform-shuffle key over all ~1.81e9 DR3 sources. Each slice is a
single TAP sync request written to its own `gaia_page_<NNNN>.csv` (256
slices, ~66 k rows / ~7 MB per file). Zero-padded filenames make
lexicographic order equal slice order, and the filename is the resume
cache key: a completed page is never re-downloaded.

## How to obtain

```
npm run fetch-gaia
```

The fetch totals ~2 GB (the paged main catalog dominates), so it is gated
behind an explicit size confirmation: the fetcher prints the estimated
*remaining* transfer and proceeds only with the `--yes` flag or an
interactive TTY confirmation. A non-TTY run without `--yes` aborts cleanly
rather than starting a silent bulk transfer.

The fetch is resumable and integrity-checked: every completed artifact is
skipped on re-run, all writes go to a `.part` file renamed only on
completion (a crash leaves a `.part` the next run ignores), and any failed
page slice is counted and logged so a re-run retries only what is missing.

## Checksum sidecar

`gaia.sha256` is one combined, committed sidecar with a `<hex>  <filename>`
line for each of the two stable single-file artifacts (`gcns_main.csv`,
`hip2.dat`) — the same verification role as `cf4.sha256`. Written by the
fetcher on completion; a mismatch on re-run signals a truncated or stale
download. The paged CSVs are not sha-pinned (their row order is
irrelevant to the encoder); they get the fetch-completion row-count check
against 16,844,156 instead. The `ReadMe` gets no digest line — VizieR
occasionally revises its prose, and the byte-layout contract is what this
provenance README documents.

## Citations + required acknowledgment

- **Gaia DR3** — Gaia Collaboration, Vallenari et al. 2023, A&A 674, A1.
- **Bailer-Jones geometric/photogeometric distances** — Bailer-Jones et
  al. 2021, AJ 161, 147.
- **GCNS — Gaia Catalogue of Nearby Stars** — Gaia Collaboration, Smart et
  al. 2021, A&A 649, A6.
- **Hipparcos-2** — van Leeuwen 2007, A&A 474, 653 (VizieR I/311).

ESA's Gaia mission carries a required acknowledgment. The full text lives
once in [`ATTRIBUTIONS.md`](../../../ATTRIBUTIONS.md) (Catalogue data →
Gaia DR3) — that is the canonical copy and is not duplicated here.
