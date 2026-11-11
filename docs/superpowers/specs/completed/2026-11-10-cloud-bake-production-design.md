# Production cloud bake: design

**Status:** approved shape (dash asks 4Z9q, oXKr, s8Qq; amended by NLCF 2026-11-10: simplicity-review
findings and the output size). **Plan:** [`2026-11-10-cloud-bake-production.md`](../../plans/completed/2026-11-10-cloud-bake-production.md).

## Goal

`tools/cloud-bake-rs` bakes the winning cloud map ("VIIRS from swaths, seam-cut") for **any UTC day,
unattended**: every input owned by the repo, missing upstream data handled without a crash, a verdict a
scheduler can act on, tests in CI, one npm script, documented. Today it is a spike: the day is
hardcoded (2026-11-06), the orbit fit and IR calibration are JSON files in a /tmp scratchpad, it reads
the Python spike's cache layout, keeps Python-comparison flags, panics on any failed download, and
nothing runs its tests.

## Scope

In: the CLI and its inputs, the TS launcher and fetcher, registry rows, cache, verdict and exit codes,
tests, CI job, README + DATA.md.

Out (deliberately): the Cloudflare Container, schedule and R2 upload; a publish path for the output (the
tiles design decides it); any app code (the comparison spike stays uncommitted and is not in this PR);
re-fitting the calibration tables inside a bake; cache eviction; date ranges (a shell loop does it).

## Behaviour

**Day.** `--date YYYY-MM-DD`. The binary defaults it to yesterday (UTC), so the launcher and a later
container share one rule, the latest complete day:
NOAA-20 passes for the current day keep arriving for hours. The date is a value threaded through the
run, never a global or environment variable. WMS times are built from the date plus a minute offset,
rolling over into the neighbouring day when the offset leaves [0, 1440).

**Orbit.** Fitted per day from that day's granule footprints (a port of the spike's `fit_orbit.py`):
coarse grid over LTAN 13.0–14.0 h × node time [0, P) at 0.5 min (no fine pass: both measured days end
on coarse values), minimising the median |pass time − slot time| over footprint samples within ±30° latitude. On
2026-11-06 and 2026-11-09 the fit reaches a median of 2.0 min; the node moved from 45.0 min / 186.0° to
89.0 min / 174.25° between them, so a frozen orbit is wrong after one day. A median above 5 min
(`median_dt_min`) means the model no longer explains the footprints: exit 3.

**Ice mask month.** The mask is cut from the Blue Marble 2004 month whose calendar month matches the
bake date (owner ruling: the month nearest the bake date). All twelve 21600×10800 equirects live in
`data/raw/textures/` (~360 MB, `npm run fetch-cloud-inputs`), described by one `BMNG_MONTHS` table;
the app's `BMNG_VINTAGE` is a pick from that table (August), so no month or URL exists twice.

**Opacity distribution.** Unchanged: each bake is quantile-matched to the static map, so every day has
the same total cloud amount (6 Nov 0.267, 9 Nov 0.261 mean opacity). A fixed transfer curve is
backlogged (owner ruling).

**Missing data.** A missing or non-PNG granule or geostationary frame, or an all-black geostationary frame,
is skipped with a warning; the bake continues without it. A frame is all-black when, among its non-transparent pixels,
≥ 99% have R = G = B = 0 (GOES-East once served one). A source whose row in the source table says
`required` (only the NOAA-20 daily mosaic: it patches the NOAA-20 swaths) is fatal when missing, as is
having too few granules to fit the orbit.

**Coverage floor.** Coverage = fraction of texels whose final value comes from a same-day observation
(VIIRS or geostationary IR) rather than the static map fallback. Below `MIN_COVERAGE` the bake writes
nothing and exits 3. `MIN_COVERAGE` is measured, not guessed: 0.9 × the lower of the 6 and 9 Nov values.

**Calibration drift.** The MTG and IODC grey→temperature tables are frozen (they decode a WMS colour
stretch that is fixed per product). Each bake fetches a probe at 12:00Z of its day: MTG + GOES-East over
their Atlantic overlap and MTG + IODC over their Indian Ocean overlap, decodes both with the bake's own
decoders and takes the median |ΔT| in kelvin over pixels valid in both. Above `MAX_CAL_DRIFT_K` on
either pair: exit 4, nothing written. The measured inter-satellite floor is 4–5 K (view angle and timing, not
calibration), so `MAX_CAL_DRIFT_K` = 10.3 K, 2 × the larger measured value: it catches stretch or LUT
breaks, not ~5 K drift.

**Exit codes.**

| code | meaning | scheduler |
| --- | --- | --- |
| 0 | written; warnings possible | — |
| 1 | internal error (panic) | page a human |
| 2 | usage or config: bad flag, bad date, unreadable input or asset | page a human |
| 3 | data: coverage below floor, N20 mosaic missing, orbit unfit, every host unreachable | retry later |
| 4 | calibration drift | page a human: refit the tables |

**Output.** One 8192×4096 lossy WebP at `--out`, quality 80, grey value = cloud opacity, no alpha
(owner ruling: the old RGBA stored opacity four times; 6.0 MB against 19.6 MB lossless, 99th-percentile
error 11/255). It matches the shape of the static source map. Written to
`<out>.part` and renamed, so a killed run never leaves a valid-looking file. Cache files are written the
same way. stdout gets exactly one JSON line at the end (on success and on exit 3/4); logs go to
stderr.

```json
{"date":"2026-11-09","exit":0,"coverage":0.93,"orbit":{"tn":89.0,"lon_n":174.25,"ltan":13.1,"median_dt_min":2.0},
 "calibration":{"mtg_goes_e_k":1.1,"mtg_iodc_k":0.8},"skipped":{"missing":2,"broken":0},
 "fetched":{"requests":382,"mb":32.1,"cached":0},"seconds":52.4,"out":"…/2026-11-09.webp"}
```

## Shape

```
cloud-bake-rs [--date 2026-11-09] --baseline <cloud_combined_8192.tif> --blue-marble <bmng month jpg> \
  --cache <dir> --out <file.webp> [--offline]
```

- The Rust binary knows no repo layout. Every path is a flag; the frozen colour map and calibration
  tables are compiled in (`include_bytes!` from `tools/cloud-bake-rs/assets/`, provenance in
  `assets/README.md`). `--offline` = cache only, a miss counts as missing data.
- `tools/clouds/bakeClouds.ts` (`npm run bake-clouds -- [--date D] --out <file>`) fills the flags from
  the raw-data registry: `textures.earthClouds`, the month's `textures.nasaBmngMonthMM` row, and
  `clouds.cache`. `npm run fetch-cloud-inputs` is `fetchTextures --bmng-months`.
- Cache: `<cache>/<YYYY-MM-DD>/{granules,mosaics,geo,probe}/…` — one directory per day, so eviction is
  deleting a directory.
- Sources live in one table in the crate (id, host, layer, kind, required), replacing the `match` on satellite
  names.
- Removed: `--no-geofill`/`--geo-ir`, `--dump`, `--compare`, `--webp-image-crate`, `--threads` (use
  `RAYON_NUM_THREADS`), `--webp-quality`/`--webp-method` (the lossy q80 writer replaces them), the per-stage CPU timing
  table and the counting allocator. The two Python behaviours kept on purpose (constant seam DELTA
  term, coarsest band from the rejected side) stay, documented as deliberate.
- CI: a `cloud-bake-rs` job in `ci.yml` runs `cargo test --release`.

## Ground preparation

None needed: the repo side lands as additions at existing seams (registry rows, a launcher, a fetcher
flag, two npm scripts, a CI job, a DATA.md row); the crate itself is uncommitted, so reshaping it is
the feature. The independent greenfield pass (2026-11-10) derived the same shape — paths as flags,
registry-filled launcher, compiled-in assets, date-keyed cache — and proposed two extras that were
trimmed: a separate report file plus a log-format flag (one stdout JSON line instead) and a fixed
publish directory (`--out` stays explicit until the tiles design). Adjacent, not taken: `tools/stars-rs`
joins `data/raw/...` paths itself instead of going through the registry, and no Rust ran in CI before
this; both backlogged. The design-time simplicity review (2026-11-10) found three knots, all taken:
Blue Marble months in two homes (now one table), the default date in the launcher (now the binary), and
the required mosaic as a code special case (now a field on its row).

## Success criteria

- `npm run fetch-cloud-inputs && npm run bake-clouds -- --out <f>` on a clean cache bakes yesterday,
  exit 0, in about a minute plus download time on a laptop.
- A second run with `--offline` reproduces the file byte for byte.
- Baking 2026-11-06 and 2026-11-09 both succeed and look right in the app (owner's eye, via the spike's
  Cloud map switch).
- A day with a dropped frame still bakes; the drift measure fed a 10 K offset in a unit test gives ~10 K.
