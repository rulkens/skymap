# Production cloud bake: plan

**Spec:** [`2026-11-10-cloud-bake-production-design.md`](../specs/2026-11-10-cloud-bake-production-design.md).
**Branch:** `worktree-live-cloud-layer-tiles`. The comparison spike's app edits in this worktree
(`src/layers/body/**`, `tests/state/settings/makeSettingsFixture.ts`, `public/cloud-candidates/`) are
NOT part of this PR: never stage them.

**Execution:** lean SDD (`docs/superpowers/conventions/sdd-execution.md`). Three dispatches: A = Tasks
1–3, B = Tasks 4–6, C = Tasks 7–9. One plan, no parallel PRs; no perf gate (no renderer change).

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

- [ ] Replace the hand-rolled `args()` (`main.rs:99-150`) with `parse_args`; flags exactly
      `--date --baseline --blue-marble --cache --out --offline`, all but `--offline` required.
- [ ] Thread `Date` through every place that used `fetch::day()` / the `2026-11-06` literal
      (`fetch.rs` URL builders and `slots`/`tstr`, `sources.rs` mosaic file name). Delete `day()` and the
      `CLOUD_BAKE_DAY` variable.
- [ ] Delete: `--no-geofill`/`--geo-ir` and the `geo-ir.webp` fill branch (`main.rs:~300`), `--dump` +
      `dump()`, `--compare`, `--webp-image-crate` + the `image` WebP encoder path (`imageio.rs:~228`) and
      the crate's `webp` feature, `--threads`, `--webp-quality`/`--webp-method` (constants 25.0 / 4),
      the `Timer`/`Stamp`/`cpu_secs` stage table and `alloc.rs` (counting allocator). Keep a single
      total-seconds measurement for the summary line (Task 6).
- [ ] Tests (`cli.rs`): `parse_args rejects an unknown flag`, `parse_args rejects 2026-02-30 and
      2026-1-5`, `parse_args requires --date --baseline --blue-marble --cache --out`.
- [ ] Commit.

### Task 2: Date-keyed cache, atomic writes, day rollover in WMS times

**Files:** `src/fetch.rs`, `src/geofill.rs`, `src/sources.rs`, `src/main.rs`

**Contract:**

```rust
pub fn wms_time(date: Date, minute: i32) -> String;  // "2026-11-09T23:30:00Z"; minute may be < 0 or >= 1440
pub fn day_dir(cache: &Path, date: Date) -> PathBuf;  // <cache>/YYYY-MM-DD
```

- [ ] Cache layout `<cache>/YYYY-MM-DD/{granules,mosaics,geo,probe}/…`, replacing the Python layout
      (`--bake` and its `granules/`, `viirs/`, `geo_p2/` children). `footprints.json` / `hi_meta.json`
      move under `granules/`.
- [ ] Every cache write and the output WebP go to `<path>.part`, then `rename`. A leftover `.part` is
      never treated as cached.
- [ ] All WMS `TIME=` values go through `wms_time` (today `fetch.rs:~160` formats `tmin/60:tmin%60`
      straight after the date, which yields hour 24+ or negative minutes at the day's edges).
- [ ] Tests: `wms_time rolls -30 into the previous day` (2026-11-01, -30 → 2026-10-31T23:30:00Z),
      `wms_time rolls 1450 into the next day` (2026-12-31, 1450 → 2027-01-01T00:10:00Z),
      `wms_time keeps 0 and 1439 on the day`.
- [ ] Commit.

### Task 3: Frozen assets compiled in, with provenance

**Files:** new `tools/cloud-bake-rs/assets/gibs-ir-colormap.xml`, `assets/geo-calib.json`,
`assets/README.md`; `src/geodecode.rs`, `src/main.rs`; delete `tools/cloud-bake-rs/static-inputs/`
(move its `viirs-seam-blending.md` research note to `tools/cloud-bake-rs/docs/seam-blending-research.md`)

- [ ] `assets/` gets `static-inputs/ir.xml` and `static-inputs/calib.json` renamed as above;
      `orbit.json` is dropped (Task 4 fits it). `geodecode::Decoder::new` takes the bytes from
      `include_bytes!`/`include_str!`, no paths.
- [ ] `assets/README.md`: the colour map's upstream (GIBS colormap URL for
      `GOES-East_ABI_Band13_Clean_Infrared`, fetched 2026-11-06); the tables: `mtg_lut` = EUMETView
      `mtg_fd:ir105_hrfi` grayscale stretch → °C, `iodc_lut` = IODC grey quantile-matched to MTG
      temperatures over their full-overlap 8×8 blocks at 2026-11-06T12:00Z, `qs`/`qr` = quantile map
      from the blended geo-IR opacity to the static map's opacity over geo coverage minus ice sheets, same
      time. Say that refitting is an offline maintainer step and that exit 4 is what asks for it.
- [ ] No new test (constant plumbing).
- [ ] Commit.

### Task 4: Orbit fitted per day `review: yes`

**Files:** `src/orbit.rs`, `src/main.rs`, `src/fetch.rs` (footprints already written there)

**Contract:**

```rust
pub struct OrbitFit { pub tn: f64, pub lon_n: f64, pub ltan: f64, pub median_dt_min: f64 }
pub fn fit(footprints: &Footprints) -> Result<OrbitFit, String>; // Err when < MIN_FIT_SAMPLES usable samples
```

- [ ] Port the fit (spec "Orbit"): samples = up to 150 footprint pixels per slot with |lat| < 30°,
      deterministic sampling (fixed-seed or strided, not thread-dependent), sample time = slot minute +
      3.0; coarse grid LTAN 13.0..=14.0 step 0.05 h × tn 0..P step 0.5 min; fine grid ±0.05 h step 0.01
      × ±0.5 min step 0.1; `lon_n = 15 * (ltan - tn / 60)`; objective = median |pass_time − t|, using
      the existing `orbit::pass_time`. Parallelise the coarse grid with rayon if it is slow; a fit must
      take under ~5 s.
- [ ] Fit error → exit 3 (Task 6 owns the mapping; return the error up).
- [ ] Test: `fit recovers a known orbit from synthetic footprints` — build footprints from
      `pass_time` for tn = 89.0, ltan = 13.10 over a day of 6-min slots, assert |Δtn| ≤ 0.2 min,
      |Δltan| ≤ 0.02 h, median_dt_min ≤ 3.
- [ ] Manual check, logged in the commit body: fits for 2026-11-06 and 2026-11-09 land within 0.2 min /
      0.02 h of the Python's {tn 45.0, ltan 13.15} and {tn 89.0, ltan 13.10}.
- [ ] Commit.

### Task 5: Missing and broken inputs are skipped, not fatal

**Files:** `src/fetch.rs`, `src/sources.rs`, `src/geofill.rs`, new `src/sources_table.rs` (or inside
`fetch.rs` if smaller)

**Contract:**

```rust
pub enum Fetched { Ok(PathBuf), Missing(String), Broken(String) }
pub fn is_all_black(rgba: &[u8]) -> bool; // >= 99% of pixels with alpha > 0 have R = G = B = 0
pub struct Source { pub id: &'static str, pub host: Host, pub layer: &'static str, pub kind: Kind }
pub const SOURCES: &[Source];           // replaces SATS + layer()'s match (fetch.rs:111-122)
```

- [ ] `get` returns `Fetched` instead of panicking (`fetch.rs:94`); 5 tries with the existing backoff
      stay. With `--offline`, a cache miss is `Missing`.
- [ ] A missing/broken granule piece drops that piece; a slot with no pieces drops the slot; a
      missing/broken geostationary frame drops it from the fill plan (its slot falls back as if out of
      geo reach). Each skip logs one stderr line and counts into `skipped.missing` / `skipped.broken`.
- [ ] Missing NOAA-20 daily mosaic → exit 3. The NOAA-21 mosaic missing → skipped.
- [ ] Tests: `is_all_black flags a black opaque frame`, `is_all_black ignores transparent pixels`
      (mostly transparent frame with a few grey pixels → false), `a granule slot with every piece missing
      is dropped without panicking` (at the `load_orbits` level, with a tiny temp cache).
- [ ] Commit.

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

- [ ] Coverage = fraction of the 8192×4096 texels whose final value is ≥ 50% same-day observation
      (VIIRS composite weight or geofill weight) rather than static-map fallback.
- [ ] Probe: at `wms_time(date, 720)` fetch MTG + GOES-East over lon −75..−30, lat −60..60 and MTG +
      IODC over lon 30..60, lat −60..60, at 1/4 of full resolution, into `<day>/probe/`; decode with the
      bake's decoders; median |ΔT| over pixels valid in both. A probe frame that is missing/broken →
      that pair is skipped with a warning (not exit 4).
- [ ] Order: probe first (cheap, fails fast on drift), then the bake; on exit 3/4 nothing is written.
- [ ] Measure coverage and both drift values for 2026-11-06 and 2026-11-09; set
      `MIN_COVERAGE = 0.9 × min(coverage)`, `MAX_CAL_DRIFT_K = max(3.0, 2 × max(drift))`; put the
      measured values in a comment beside the constants.
- [ ] Exit codes: 0 / 2 / 3 / 4 as above, panics stay 1. The final stdout line is the spec's JSON
      object (`serde_json`), printed on 0, 3 and 4.
- [ ] Tests: `verdict is Data below MIN_COVERAGE`, `verdict is Drift when either pair exceeds
      MAX_CAL_DRIFT_K`, `probe drift is near zero for identical decodes and ~10 K for a 10 K offset`
      (synthetic temperature grids through the median-|ΔT| function).
- [ ] Commit.

### Task 7: Registry rows, Blue Marble months fetcher, launcher, npm scripts

**Files:** `tools/utils/io/rawDataRegistry.ts`, new `tools/clouds/data/BMNG_MONTHS.ts`, new
`tools/fetch/fetchCloudInputs.ts`, new `tools/clouds/bakeClouds.ts`, `package.json`,
new `data/raw/clouds/README.md`, `.gitignore` (`/tools/cloud-bake-rs/target/` beside the stars-rs line)

- [ ] Registry rows: `'clouds.cache'` (directory `data/raw/clouds/cache`, gitignored),
      `'clouds.blueMarbleMonths'` (directory `data/raw/clouds/bmng`, gitignored, fetcher
      `tools/fetch/fetchCloudInputs.ts`), `'clouds.readme'` (committed), `'clouds.sha256'` (committed).
- [ ] `BMNG_MONTHS`: twelve `{ stamp: '2004MM', baseUrl }`, base
      `https://assets.science.nasa.gov/content/dam/science/esd/eo/images/bmng/bmng-topography-bathymetry/<monthname>/`,
      file `world.topo.bathy.<stamp>.3x21600x10800.jpg` (all twelve answered 200 on 2026-11-10).
- [ ] `fetchCloudInputs.ts`: downloads missing months (~30 MB each, ~360 MB total; print that before
      starting), `.part` + rename, sha256 into the `clouds.sha256` sidecar. Reuse fetchTextures' download +
      checksum helper (`tools/fetch/fetchTextures.ts:~200-240`); if it is inline there, extract it to
      `tools/utils/io/<fn>.ts` first (one symbol per utils file) and point both callers at it.
- [ ] `bakeClouds.ts`: `--date` (default yesterday UTC) and `--out` (required), plus `--offline`
      passed through; resolves `textures.earthClouds`, the date's calendar month under
      `clouds.blueMarbleMonths`, `clouds.cache`; spawns `cargo run --release --manifest-path
      tools/cloud-bake-rs/Cargo.toml -- …` with inherited stdio and exits with the child's code. A
      missing month file → message naming `npm run fetch-cloud-inputs`, exit 2.
- [ ] `package.json`: `"bake-clouds": "tsx tools/clouds/bakeClouds.ts"`,
      `"fetch-cloud-inputs": "tsx tools/fetch/fetchCloudInputs.ts"`.
- [ ] `data/raw/clouds/README.md`: what's in `bmng/` and `cache/`, upstreams (GIBS, EUMETView, NASA
      BMNG), licences (GIBS/VIIRS/GOES/Blue Marble: free incl. commercial with credit; EUMETSAT WMS
      visualisations: CC BY 4.0, "Contains modified EUMETSAT Meteosat data 2026"; Himawari via GIBS: JMA
      terms unverified, flagged medium risk).
- [ ] No TS test: path plumbing and a calendar-month lookup (testing.md).
- [ ] Commit.

### Task 8: CI job

**Files:** `.github/workflows/ci.yml`

- [ ] New job `cloud-bake-rs` (parallel to `ci`): checkout, `dtolnay/rust-toolchain@stable`,
      `Swatinem/rust-cache@v2` with `workspaces: tools/cloud-bake-rs`, `cargo test --release
      --manifest-path tools/cloud-bake-rs/Cargo.toml`. Pin action versions the way `ci.yml` already does.
- [ ] Commit; after push, CI is the gate.

### Task 9: Docs and backlog

**Files:** `tools/cloud-bake-rs/README.md`, `docs/DATA.md`, `docs/BACKLOG.md`, new
`docs/backlog/2026-11-10-cloud-fixed-transfer-curve.md`, new `docs/backlog/2026-11-10-rust-tools-registry-and-ci.md`

- [ ] Crate README rewritten for the production tool: purpose, `npm run fetch-cloud-inputs` +
      `npm run bake-clouds`, the CLI table, exit codes, the summary line, cache layout, assets, the two
      deliberate Python behaviours (keep the existing paragraph), performance (keep the measured table,
      re-measure the total once), tests. Drop every reference to the scratchpad Python as "the spec" and
      to parity flags.
- [ ] `DATA.md`: a "Live clouds" subsection under "Solar system & Earth imagery" (3–5 sentences, link
      to the crate README and `data/raw/clouds/README.md`) and a refresh-orders row
      (`fetch-cloud-inputs` → `bake-clouds`, no R2 sync yet).
- [ ] Backlog: "Cloud bake: fixed transfer curve" (`needs-design`: per-day quantile match forces the
      same total cloud amount every day) and "Rust tools: registry paths + CI for stars-rs" (`ready`).
- [ ] Commit.

---

## Definition of Done

**Deliverables:** `tools/cloud-bake-rs` committed with `cli.rs`, `verdict.rs`, `probe.rs`, `assets/`
(+ README); `tools/clouds/bakeClouds.ts`, `tools/clouds/data/BMNG_MONTHS.ts`,
`tools/fetch/fetchCloudInputs.ts`; registry rows `clouds.cache`, `clouds.blueMarbleMonths`,
`clouds.readme`, `clouds.sha256`; npm scripts `bake-clouds`, `fetch-cloud-inputs`; CI job
`cloud-bake-rs`; `data/raw/clouds/README.md`; DATA.md section + row; two backlog items.

**Observable behaviours (manual smoke):**

- `npm run fetch-cloud-inputs` pulls twelve months once; a second run downloads nothing.
- `npm run bake-clouds -- --out <f>` bakes yesterday from an empty day cache: exit 0, one JSON line with
  coverage, orbit, calibration, skipped and fetched counts.
- The same command with `--offline` produces a byte-identical file.
- `--date 2026-11-06` and `--date 2026-11-09` both exit 0; the owner checks both in the app via the
  spike's Cloud map switch (copy to `public/cloud-candidates/`).
- `--offline` against an empty cache exits 3 with nothing written; `--date 2026-02-30` exits 2.

**Deferred:** the Container, schedule and R2 upload; a publish path; app code; a fixed transfer curve;
refitting calibration in-bake; cache eviction; stars-rs registry/CI.
