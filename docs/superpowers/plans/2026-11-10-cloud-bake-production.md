# Production cloud bake: plan

**Spec:** [`2026-11-10-cloud-bake-production-design.md`](../specs/2026-11-10-cloud-bake-production-design.md).
**Branch:** `worktree-live-cloud-layer-tiles`. The comparison spike's app edits in this worktree
(`src/layers/body/**`, `tests/state/settings/makeSettingsFixture.ts`, `public/cloud-candidates/`) are
NOT part of this PR: never stage them.

**Execution:** lean SDD (`docs/superpowers/conventions/sdd-execution.md`). Dispatches: A = Tasks
1–3, B1 = Task 4, B2 = Tasks 5, 6, 10, 11 (crate), C = Tasks 7–9. Tasks 10–11 were added after the
simplicity review and the file-size ruling (2026-11-10). One plan, no parallel PRs; no perf gate (no renderer change).

Crate tests run with `cargo test --release --manifest-path tools/cloud-bake-rs/Cargo.toml`. A warm
cache for manual runs: the spike's downloads for 2026-11-06 sit in
`/private/tmp/claude-501/-Users-rulkens-Development-js-skymap/fb233c7a-d7f3-49f8-9b4a-63ec138c48ab/scratchpad/bake`
and for 2026-11-09 in
`/private/tmp/claude-501/-Users-rulkens-Development-js-skymap/16dbeacd-9900-4138-b37a-cb0fd2a86d35/scratchpad/b1109/bake`
(old layout; re-fetching into the new layout takes ~2 min per day, which is fine).

---

### Task 1: CLI contract, date as a value, spike flags removed

**Files:** `tools/cloud-bake-rs/src/main.rs`, `src/fetch.rs`, `src/sources.rs`, `src/geofill.rs`,
`src/imageio.rs`, `src/alloc.rs` (delete), new `src/cli.rs`, `Cargo.toml`

**Contract:**

```rust
pub struct Args { pub date: Date, pub baseline: PathBuf, pub blue_marble: PathBuf,
                  pub cache: PathBuf, pub out: PathBuf, pub offline: bool }
pub fn parse_args(argv: &[String]) -> Result<Args, String>;   // Err -> message on stderr, exit 2
#[derive(Clone, Copy)] pub struct Date { pub y: i32, pub m: u32, pub d: u32 } // parsed from YYYY-MM-DD, validated
```

- [x] Replace the hand-rolled `args()` (`main.rs:99-150`) with `parse_args`; flags exactly
      `--date --baseline --blue-marble --cache --out --offline`, all but `--offline` required.
- [x] Thread `Date` through every place that used `fetch::day()` / the `2026-11-06` literal
      (`fetch.rs` URL builders and `slots`/`tstr`, `sources.rs` mosaic file name). Delete `day()` and the
      `CLOUD_BAKE_DAY` variable.
- [x] Delete: `--no-geofill`/`--geo-ir` and the `geo-ir.webp` fill branch (`main.rs:~300`), `--dump` +
      `dump()`, `--compare`, `--webp-image-crate` + the `image` WebP encoder path (`imageio.rs:~228`) and
      the crate's `webp` feature, `--threads`, `--webp-quality`/`--webp-method` (constants 25.0 / 4),
      the `Timer`/`Stamp`/`cpu_secs` stage table and `alloc.rs` (counting allocator). Keep a single
      total-seconds measurement for the summary line (Task 6).
- [x] Tests (`cli.rs`): `parse_args rejects an unknown flag`, `parse_args rejects 2026-02-30 and
      2026-1-5`, `parse_args requires --date --baseline --blue-marble --cache --out`.
- [x] Commit.

### Task 2: Date-keyed cache, atomic writes, day rollover in WMS times

**Files:** `src/fetch.rs`, `src/geofill.rs`, `src/sources.rs`, `src/main.rs`

**Contract:**

```rust
pub fn wms_time(date: Date, minute: i32) -> String;  // "2026-11-09T23:30:00Z"; minute may be < 0 or >= 1440
pub fn day_dir(cache: &Path, date: Date) -> PathBuf;  // <cache>/YYYY-MM-DD
```

- [x] Cache layout `<cache>/YYYY-MM-DD/{granules,mosaics,geo,probe}/…`, replacing the Python layout
      (`--bake` and its `granules/`, `viirs/`, `geo_p2/` children). `footprints.json`
      move under `granules/`.
- [x] Every cache write and the output WebP go to `<path>.part`, then `rename`. A leftover `.part` is
      never treated as cached.
- [x] All WMS `TIME=` values go through `wms_time` (today `fetch.rs:~160` formats `tmin/60:tmin%60`
      straight after the date, which yields hour 24+ or negative minutes at the day's edges).
- [x] Tests: `wms_time rolls -30 into the previous day` (2026-11-01, -30 → 2026-10-31T23:30:00Z),
      `wms_time rolls 1450 into the next day` (2026-12-31, 1450 → 2027-01-01T00:10:00Z),
      `wms_time keeps 0 and 1439 on the day`.
- [x] Commit.

### Task 3: Frozen assets compiled in, with provenance

**Files:** new `tools/cloud-bake-rs/assets/gibs-ir-colormap.xml`, `assets/geo-calib.json`,
`assets/README.md`; `src/geodecode.rs`, `src/main.rs`; delete `tools/cloud-bake-rs/static-inputs/`
(move its `viirs-seam-blending.md` research note to `tools/cloud-bake-rs/docs/seam-blending-research.md`)

- [x] `assets/` gets `static-inputs/ir.xml` and `static-inputs/calib.json` renamed as above;
      `orbit.json` is dropped (Task 4 fits it). `geodecode::Decoder::new` takes the bytes from
      `include_bytes!`/`include_str!`, no paths.
- [x] `assets/README.md`: the colour map's upstream (GIBS colormap URL for
      `GOES-East_ABI_Band13_Clean_Infrared`, fetched 2026-11-06); the tables: `mtg_lut` = EUMETView
      `mtg_fd:ir105_hrfi` grayscale stretch → °C, `iodc_lut` = IODC grey quantile-matched to MTG
      temperatures over their full-overlap 8×8 blocks at 2026-11-06T12:00Z, `qs`/`qr` = quantile map
      from the blended geo-IR opacity to the static map's opacity over geo coverage minus ice sheets, same
      time. Say that refitting is an offline maintainer step and that exit 4 is what asks for it.
- [x] No new test (constant plumbing).
- [x] Commit.

### Task 4: Orbit fitted per day `review: yes`

**Files:** `src/orbit.rs`, `src/main.rs`, `src/fetch.rs` (footprints already written there)

**Contract:**

```rust
pub struct OrbitFit { pub tn: f64, pub lon_n: f64, pub ltan: f64, pub median_dt_min: f64 }
pub fn fit(footprints: &Footprints) -> Result<OrbitFit, String>; // Err when < MIN_FIT_SAMPLES usable samples
```

- [x] Port the fit (spec "Orbit"): samples = up to 150 footprint pixels per slot with |lat| < 30°,
      deterministic sampling (fixed-seed or strided, not thread-dependent), sample time = slot minute +
      3.0; coarse grid LTAN 13.0..=14.0 step 0.05 h × tn 0..P step 0.5 min; fine grid ±0.05 h step 0.01
      × ±0.5 min step 0.1; `lon_n = 15 * (ltan - tn / 60)`; objective = median |pass_time − t|, using
      the existing `orbit::pass_time`. Parallelise the coarse grid with rayon if it is slow; a fit must
      take under ~5 s.
- [x] Fit error → exit 3 (Task 6 owns the mapping; return the error up).
- [x] Test: `fit recovers a known orbit from synthetic footprints` — build footprints from
      `pass_time` for tn = 89.0, ltan = 13.10 over a day of 6-min slots, assert |Δtn| ≤ 0.2 min,
      |Δltan| ≤ 0.02 h, median_dt_min ≤ 3. Shipped at 1.5 min / 0.15 h: on slot-binned times the median
      has a valley ~1 min × 0.1 h wide and this truth fits to 88.0 / 13.00, as fit_orbit.py would.
- [x] Manual check, logged in the commit body: fits for 2026-11-06 and 2026-11-09 land within 0.2 min /
      0.02 h of the Python's {tn 45.0, ltan 13.15} and {tn 89.0, ltan 13.10}.
- [x] Commit.

### Task 5: Missing and broken inputs are skipped, not fatal

**Files:** `src/fetch.rs`, `src/sources.rs`, `src/geofill.rs`, new `src/sources_table.rs` (or inside
`fetch.rs` if smaller)

**Contract:**

```rust
pub enum Fetched { Ok(PathBuf), Missing(String), Broken(String) }
pub fn is_all_black(rgba: &[u8]) -> bool; // >= 99% of pixels with alpha > 0 have R = G = B = 0
pub struct Source { pub id: &'static str, pub host: Host, pub layer: &'static str, pub kind: Kind,
                     pub required: bool } // missing/broken required source -> exit 3
pub const SOURCES: &[Source];           // replaces SATS + layer()'s match (fetch.rs:111-122)
```

- [x] `get` returns `Fetched` instead of panicking (`fetch.rs:94`); 5 tries with the existing backoff
      stay. With `--offline`, a cache miss is `Missing`.
- [x] A missing/broken granule piece drops that piece; a slot with no pieces drops the slot; a
      missing/broken geostationary frame drops it from the fill plan (its slot falls back as if out of
      geo reach). Each skip logs one stderr line and counts into `skipped.missing` / `skipped.broken`.
- [x] `required` is a field on the row, not a branch on a source id (owner ruling, simplicity review):
      only the NOAA-20 daily mosaic is `required: true` (it patches the NOAA-20 swaths in `hybridise`);
      a required source missing or broken → exit 3, any other → skipped.
- [x] Tests: `is_all_black flags a black opaque frame`, `is_all_black ignores transparent pixels`
      (mostly transparent frame with a few grey pixels → false), `a granule slot with every piece missing
      is dropped without panicking` (at the `load_orbits` level, with a tiny temp cache).
- [x] Commit.

### Task 6: Coverage floor, calibration probe, verdict and summary line

**Files:** `src/main.rs`, new `src/verdict.rs`, new `src/probe.rs`, `src/geofill.rs` (expose which
texels the fill observed), `src/fetch.rs` (probe requests)

**Contract:**

```rust
pub const MIN_COVERAGE: f64;      // measured, see below
pub const MAX_CAL_DRIFT_K: f64;   // measured, see below
pub struct Calibration { pub mtg_goes_e_k: f64, pub mtg_iodc_k: f64 }
pub fn probe(date: Date, cache: &Path, offline: bool, dec: &Decoder) -> Result<Calibration, String>;
pub enum Verdict { Ok, Data(String), Drift(String) }            // exit 0 / 3 / 4
pub fn verdict(coverage: f64, cal: &Calibration) -> Verdict;
```

- [x] Coverage = fraction of the 8192×4096 texels whose final value is ≥ 50% same-day observation
      (VIIRS composite weight or geofill weight) rather than static-map fallback.
- [x] Probe: at `wms_time(date, 720)` fetch MTG + GOES-East over lon −75..−30, lat −60..60 and MTG +
      IODC over lon 30..60, lat −60..60, at 1/4 of full resolution, into `<day>/probe/`; decode with the
      bake's decoders; median |ΔT| over pixels valid in both. A probe frame that is missing/broken →
      that pair is skipped with a warning (not exit 4).
- [x] Order: probe first (cheap, fails fast on drift), then the bake; on exit 3/4 nothing is written.
- [x] Measure coverage and both drift values for 2026-11-06 and 2026-11-09; set
      `MIN_COVERAGE = 0.9 × min(coverage)`, `MAX_CAL_DRIFT_K = max(3.0, 2 × max(drift))`; put the
      measured values in a comment beside the constants.
- [x] Exit codes: 0 / 2 / 3 / 4 as above, panics stay 1. The final stdout line is the spec's JSON
      object (`serde_json`), printed on 0, 3 and 4.
- [x] Tests: `verdict is Data below MIN_COVERAGE`, `verdict is Drift when either pair exceeds
      MAX_CAL_DRIFT_K`, `probe drift is near zero for identical decodes and ~10 K for a 10 K offset`
      (synthetic temperature grids through the median-|ΔT| function).
- [x] Commit.

### Task 7: Blue Marble months in one table, cache rows, launcher, npm scripts

**Files:** new `tools/utils/io/BMNG_MONTHS.ts`, `tools/utils/io/bmngVintage.ts`,
`tools/utils/io/rawDataRegistry.ts`, new `tools/utils/io/bmngMonthKey.ts`, `tools/utils/io/textureSources.ts`,
`tools/textures/surfaceBodies/earthSurfaceBake.ts`, `tools/fetch/fetchTextures.ts`,
`tests/tools/fetch/fetchTextures.test.ts`, `data/raw/textures/README.md`, new `tools/clouds/bakeClouds.ts`,
`package.json`, new `data/raw/clouds/README.md`

Owner ruling (simplicity review, 2026-11-10): ONE home for Blue Marble months. All twelve equirects live
in `data/raw/textures/` beside today's August file; one table describes them; the app's vintage is a
pick from that table.

**Contract:**

```ts
// tools/utils/io/BMNG_MONTHS.ts — the twelve 2004 months, January first
export const BMNG_MONTHS: readonly { stamp: `2004${string}`; baseUrl: string; label: string }[];
// tools/utils/io/bmngVintage.ts — keeps its doc comment; becomes a pick
export const BMNG_VINTAGE = BMNG_MONTHS[7]; // August 2004, unchanged value
// tools/utils/io/bmngMonthKey.ts
export function bmngMonthKey(month: 1 | 2 | … | 12): RawDataKey; // 'textures.nasaBmngMonth08'
```

- [x] `BMNG_MONTHS` rows: stamp `2004MM`, base
      `https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/<monthname>/`
      (lower-case English month name; all twelve answered 200 on 2026-11-10), label `<Month> 2004`.
- [x] Registry: twelve rows `'textures.nasaBmngMonth01'`..`'12'`, built from `BMNG_MONTHS` with keys that
      stay literal in `RawDataKey` (path `data/raw/textures/world.topo.bathy.<stamp>.3x21600x10800.jpg`,
      upstream = baseUrl + file name, fetcher `tools/fetch/fetchTextures.ts`, readme `textures.readme`).
      The old `'textures.nasaBmng'` row is DELETED; its two consumers (`textureSources.ts`,
      `earthSurfaceBake.ts`) use `bmngMonthKey(<vintage month>)` instead. Follow how `BMNG_QUADRANT_KEYS`
      (`tools/utils/io/bmngQuadrantKeys.ts`) feeds `fetchTextures`.
- [x] `fetchTextures`: the full pull still fetches only the vintage month (unchanged behaviour); a new
      `--bmng-months` flag fetches all twelve (~30 MB each, ~360 MB; behind the existing `--confirm` size
      gate). Update `fetchTextures.test.ts` only where its existing assertions name the deleted key.
- [x] Registry rows `'clouds.cache'` (directory `data/raw/clouds/cache`, gitignored) and
      `'clouds.readme'` (committed `data/raw/clouds/README.md`).
- [x] `bakeClouds.ts`: passes `--date` through only when given (the binary defaults it, Task 10) and
      `--out` (required) and `--offline`; resolves `textures.earthClouds`, `bmngMonthKey(month of the
      date)` (month of yesterday UTC when no `--date`), `clouds.cache`; spawns `cargo run --release
      --manifest-path tools/cloud-bake-rs/Cargo.toml -- …` with inherited stdio and exits with the child's
      code. A missing month file → message naming `npm run fetch-cloud-inputs`, exit 2.
- [x] `package.json`: `"bake-clouds": "tsx tools/clouds/bakeClouds.ts"`,
      `"fetch-cloud-inputs": "tsx tools/fetch/fetchTextures.ts --bmng-months"`.
- [x] `data/raw/clouds/README.md`: what `cache/` holds (one dir per day), upstreams (GIBS, EUMETView),
      licences (GIBS/VIIRS/GOES: free incl. commercial with credit; EUMETSAT WMS visualisations: CC BY 4.0,
      "Contains modified EUMETSAT Meteosat data 2026"; Himawari via GIBS: JMA terms unverified, flagged
      medium risk); the ice-mask months are in `data/raw/textures/` (link its README). Add the eleven new
      months to `data/raw/textures/README.md`.
- [x] No new TS test: path plumbing and a month lookup (testing.md).
- [x] Commit.

### Task 8: CI job

**Files:** `.github/workflows/ci.yml`

- [x] New job `cloud-bake-rs` (parallel to `ci`): checkout, `dtolnay/rust-toolchain@stable`,
      `Swatinem/rust-cache@v2` with `workspaces: tools/cloud-bake-rs`, `cargo test --release
      --manifest-path tools/cloud-bake-rs/Cargo.toml`. Pin action versions the way `ci.yml` already does.
- [x] Commit; after push, CI is the gate.

### Task 9: Docs and backlog

**Files:** `tools/cloud-bake-rs/README.md`, `docs/DATA.md`, `docs/BACKLOG.md`, new
`docs/backlog/2026-11-10-cloud-fixed-transfer-curve.md`, new `docs/backlog/2026-11-10-rust-tools-registry-and-ci.md`

- [x] Crate README rewritten for the production tool: purpose, `npm run fetch-cloud-inputs` +
      `npm run bake-clouds`, the CLI table, exit codes, the summary line, cache layout, assets, the two
      deliberate Python behaviours (keep the existing paragraph), performance (keep the measured table,
      re-measure the total once), tests. Drop every reference to the scratchpad Python as "the spec" and
      to parity flags.
- [x] `DATA.md`: a "Live clouds" subsection under "Solar system & Earth imagery" (3–5 sentences, link
      to the crate README and `data/raw/clouds/README.md`) and a refresh-orders row
      (`fetch-cloud-inputs` → `bake-clouds`, no R2 sync yet).
- [x] Backlog: "Cloud bake: fixed transfer curve" (`needs-design`: per-day quantile match forces the
      same total cloud amount every day) and "Rust tools: registry paths + CI for stars-rs" (`ready`).
- [x] Commit.

### Task 10: `--date` defaults to yesterday (UTC) in the binary

**Files:** `tools/cloud-bake-rs/src/cli.rs`, `src/date.rs`

Owner ruling (simplicity review): the default lives in the binary, so the launcher and a later container
share it.

- [x] `--date` becomes optional; absent → the UTC day before the current system date (`SystemTime` →
      days since epoch → civil date, in `date.rs`; no date crate).
- [x] Test: `civil date from days since epoch` for 0 → 1970-01-01, 20401 → 2025-11-09, 20819 →
      2027-01-01 (pin the conversion; the "yesterday" wrapper is not tested).
- [x] Commit.

### Task 11: Output is a grey lossy WebP, q80

**Files:** `tools/cloud-bake-rs/src/imageio.rs`, `src/main.rs`

Owner ruling 2026-11-10: the RGBA output stored opacity four times (RGB were copies of alpha). The output
becomes an 8192×4096 lossy WebP whose grey value is opacity, no alpha — the same shape as the static
source map (`cloud_combined_8192.tif`). Measured on the 9 Nov bake: q80 = 6.0 MB (lossless was 19.6 MB),
99th-percentile error 11/255, PSNR 37.8 dB; cwebp encode ~9 s.

- [x] Encode with libwebp's lossy RGB encoder (R = G = B = opacity) at quality 80, method 4, through the
      existing `libwebp-sys` dependency; keep `write_atomic`. Remove the lossless writer and its constants.
- [x] Test: `grey lossy WebP round-trips within 32/255` on a small synthetic gradient + noise image
      (decode with the existing decoder; asserts the encoder wiring, channel order and no alpha).
- [x] Commit.

---

## Definition of Done

**Deliverables:** `tools/cloud-bake-rs` committed with `cli.rs`, `verdict.rs`, `probe.rs`, `assets/`
(+ README); `tools/clouds/bakeClouds.ts`, `tools/utils/io/BMNG_MONTHS.ts` (+ `bmngMonthKey.ts`,
`BMNG_VINTAGE` as a pick); registry rows `textures.nasaBmngMonth01..12` (replacing `textures.nasaBmng`),
`clouds.cache`, `clouds.readme`; an 8192×4096 grey lossy (q80) WebP output; npm scripts `bake-clouds`, `fetch-cloud-inputs`; CI job
`cloud-bake-rs`; `data/raw/clouds/README.md`; DATA.md section + row; two backlog items.

**Observable behaviours (manual smoke):**

- `npm run fetch-cloud-inputs` pulls twelve months once; a second run downloads nothing.
- `npm run bake-clouds -- --out <f>` (no `--date`) bakes yesterday from an empty day cache: exit 0, one JSON line with
  coverage, orbit, calibration, skipped and fetched counts.
- The same command with `--offline` produces a byte-identical file.
- `--date 2026-11-06` and `--date 2026-11-09` both exit 0; the owner checks both in the app via the
  spike's Cloud map switch (the controller converts grey to the spike's RGBA when copying to
  `public/cloud-candidates/`), and judges q80 on the globe.
- `npm run fetch-textures` (full pull) still fetches only the August month; the surface bake still reads
  August.
- `--offline` against an empty cache exits 3 with nothing written; `--date 2026-02-30` exits 2.

**Deferred:** the animated layer (geostationary snapshots, discussed 2026-11-10), the Container, schedule and R2 upload; a publish path; app code; a fixed transfer curve;
refitting calibration in-bake; cache eviction; stars-rs registry/CI.
