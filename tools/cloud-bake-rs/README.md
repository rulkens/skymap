# cloud-bake-rs — daily global cloud map

Bakes one day's cloud opacity map for the whole Earth. NOAA-20 VIIRS granule orbits and the GIBS daily
mosaics are joined into one composite with min-cut seams and multiband blends; the gaps are filled from
geostationary infrared (GOES-East/West, Himawari, Meteosat MTG and IODC) matched to the time of the
bordering swath. The result is an 8192x4096 equirect lossy WebP (quality 80, ~6 MB) whose grey value is
cloud opacity, with no alpha: the same shape as the static `cloud_combined_8192.tif`. Any UTC day can be
baked unattended; a day that fails a check exits non-zero with nothing written. Design:
[`docs/superpowers/specs/completed/2026-11-10-cloud-bake-production-design.md`](../../docs/superpowers/specs/completed/2026-11-10-cloud-bake-production-design.md).

## Prerequisites

A stable Rust toolchain and a C compiler: libwebp (via `libwebp-sys`) and libjpeg-turbo (via
`mozjpeg`) are built from vendored C with `cc`, no cmake. On x86_64 install `nasm` to get
libjpeg-turbo's SIMD decoder; without it the build falls back to plain C.

## Usage

```bash
npm run fetch-cloud-inputs -- --confirm   # once: the twelve Blue Marble months, ~360 MB
npm run bake-clouds -- --out cloud.webp   # yesterday (UTC); add --date 2026-11-09 and/or --offline
```

`tools/clouds/bakeClouds.ts` fills the path flags from the raw-data registry (`textures.earthClouds`, the
`textures.nasaBmngMonthMM` row for the date's month, `clouds.cache`) and runs
`cargo run --release -- …`. It exits with the binary's code, or 2 if the month's Blue Marble file is
missing. The binary knows no repo layout; run it directly with every path as a flag:

| flag                  | meaning                                                                                               |
| --------------------- | ----------------------------------------------------------------------------------------------------- |
| `--date YYYY-MM-DD`   | the UTC day to bake; default yesterday (UTC), the latest complete day. A bad date exits 2             |
| `--baseline <tif>`    | required: `cloud_combined_8192.tif`, the static map the bake is quantile-matched to and falls back on |
| `--blue-marble <jpg>` | required: the 21600x10800 Blue Marble 2004 month matching the date; the ice-sheet mask is cut from it |
| `--cache <dir>`       | required: download cache, see below                                                                   |
| `--out <file.webp>`   | required: the WebP to write, via `<file>.part` and a rename                                           |
| `--offline`           | cache only: a miss counts as missing data and nothing is fetched                                      |

Threads: all cores, or `RAYON_NUM_THREADS`.

## Exit codes

| code | meaning                                                                                                | scheduler                      |
| ---- | ------------------------------------------------------------------------------------------------------ | ------------------------------ |
| 0    | written; warnings possible                                                                             | none                           |
| 1    | internal error (panic)                                                                                 | page a human                   |
| 2    | usage or config: bad flag, bad date, unreadable input or asset                                         | page a human                   |
| 3    | data: coverage below `MIN_COVERAGE` (0.690), NOAA-20 mosaic missing, orbit unfit, no calibration probe | retry later                    |
| 4    | calibration drift above `MAX_CAL_DRIFT_K` (10.3 K)                                                     | page a human: refit the tables |

Both thresholds live in `src/verdict.rs` with the measurements behind them (coverage measured 0.768 on
2026-11-06 and 2026-11-09; the inter-satellite floor is 4 to 5 K). A missing or all-black frame from any
source other than the `required` NOAA-20 mosaic (`src/sources_table.rs`) is skipped with a warning.

## Summary line

stdout carries exactly one JSON line at the end (on exit 0, 3 and 4); logs go to stderr. `npm run`
prints its own banner to stdout, so use `npm run -s bake-clouds` or read the last line:

```json
{
  "date": "2026-11-09",
  "exit": 0,
  "coverage": 0.767,
  "orbit": { "tn": 89.0, "lon_n": 174.25, "ltan": 13.1, "median_dt_min": 2.0 },
  "calibration": { "mtg_goes_e_k": 4.77, "mtg_iodc_k": 4.4 },
  "skipped": { "missing": 0, "broken": 0 },
  "fetched": { "requests": 0, "mb": 0.0, "cached": 394 },
  "seconds": 25.7,
  "out": "cloud.webp"
}
```

`coverage`, `orbit` and `calibration` are `null` when the run stopped before computing them.
`orbit` is fitted per day from that day's granule footprints.

## Cache

`<cache>/<YYYY-MM-DD>/{granules,mosaics,geo,probe}/`: one directory per day, so evicting a day is
deleting its directory. Files are written to `.part` and renamed, so a killed run leaves no
valid-looking file. A cold day downloads about 90 MB (6 GIBS and 4 EUMETView connections), roughly
2 minutes. `--offline` on a filled day reproduces the output byte for byte.
Registry row `clouds.cache`; upstreams and licences in
[`data/raw/clouds/README.md`](../../data/raw/clouds/README.md).

## Assets

`assets/` is compiled into the binary, so a bake cannot run against other tables: the GIBS IR colour map
and the frozen MTG/IODC grey-to-temperature tables. Provenance and refit notes in
[`assets/README.md`](assets/README.md).

Two departures from a line-by-line port, both exact:

- **Blend window.** `multiband` is linear and reconstructs its first input exactly, so
  `multiband(A, B, M) = A + multiband(0, B - A, M)`. `B - A` is zero outside the overlap and every
  kernel is finite, so the second term is computed on a window around the overlap only.
- **Max-flow labels.** The label is "can reach the sink in the residual graph", the unique minimal sink
  side of the min cut, so it does not depend on the max-flow algorithm or its visiting order.

## Deliberate Python behaviours

The pipeline is a port of a Python prototype. Two of its behaviours look like bugs and are kept on purpose;
"fixing" them was tried 2026-11-07 and made the crops worse:

- the seam cut's DELTA term is a constant per edge (a real cloud-edge cost moved cuts into worse places);
- the coarsest pyramid band takes the side the seam rejected, so each side keeps the low frequencies of the
  swath that continues beyond the overlap (weighting it like the finer bands exposed dark blocks).

## Performance

Warm cache (`--offline`), Apple M-series laptop, 2026-11-10: total 73.9 s on 1 thread, 31.7 s on 4, **25.7 s**
on all cores (the `seconds` field of the summary line). Output is identical at every thread count. The
WebP encode (libwebp, single-threaded, quality 80 method 4) is ~9 s of that and the floor beyond a few
threads. Peak RSS is ~5.3 GB on macOS, whose allocator keeps freed pages; on Linux expect ~3 GB.

## Tests

```bash
cargo test --release --manifest-path tools/cloud-bake-rs/Cargo.toml
```

CI runs the same command (job `cloud-bake-rs`). The tests sit beside the code they check, in each module's `tests`.
