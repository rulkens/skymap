# Gaia DR3 stellar catalog (≤ 50 pc cut)

## What it is

ESA's **Gaia Data Release 3** (June 2022) is the most precise astrometric and photometric survey of the Milky Way ever produced — ~1.8 billion sources with positions, parallaxes, proper motions, and three-band photometry (G, BP, RP). For the cosmic zoom we only need the **solar neighbourhood**: stars within ~50 parsecs of the Sun. That cut yields roughly **7,500 stars**, small enough to ship as a few-hundred-KB binary and render as a plain instanced point cloud at full quality.

The 50 pc radius aligns with shell 2's outer scale (100 pc, see `shells/00-shell-overview.md`). Stars at the cut edge sit at the half-radius mark of shell 2's frustum, which keeps the field full without the "everything piles up at the sphere boundary" look you get cutting at the boundary itself. Beyond 50 pc, parallax error climbs for typical disk dwarfs and distance error starts to dominate the apparent layout.

## Why we need it (which shell, what role)

**Shell 2 (Stellar Neighborhood).** This is the only shell in the tour that shows individual stars as physically-positioned points; every other catalog renders galaxies, gas, or dark matter. The hero visual is "the Sun's actual neighborhood at correct geometry" — Sirius 2.6 pc away in Canis Major, Alpha Centauri 1.3 pc off in Centaurus, Barnard's Star a fast-moving red dot 1.8 pc out. Without Gaia we'd be rendering an artist's impression; with Gaia, the camera flying out from the Sun to the 100-pc boundary is a dataset-grounded view.

Secondary role: a curated subset of ~50 named stars (Sirius, Procyon, Vega, Altair, the Centauri triple, Barnard's, Wolf 359, etc.) gets MSDF labels via the existing label pipeline. The cross-match to a hand-maintained `data/named-stars.json` produces a small `(source_id → label)` lookup the label renderer consumes.

## Acquisition

- **Endpoint:** ESA Gaia archive, ADQL query interface at <https://gea.esac.esa.int/archive/>.
- **Authentication:** none required for queries returning < ~3M rows; our cut is well under the limit.
- **Format:** CSV (UTF-8). The archive also offers VOTable and FITS but CSV parses with zero dependencies.
- **Size (raw):** the cut below returns ~7,500 rows × ~7 columns ≈ **2–3 MB** uncompressed CSV. Trivially small.

Sample ADQL (paste into the archive's query form, set "Output format: CSV"):

```sql
SELECT
  source_id,
  ra,
  dec,
  parallax,
  parallax_error,
  pmra,
  pmdec,
  phot_g_mean_mag,
  bp_rp
FROM gaiadr3.gaia_source
WHERE parallax > 20            -- distance < 50 pc (parallax in mas)
  AND parallax_over_error > 5  -- drop noisy parallaxes
  AND phot_g_mean_mag IS NOT NULL
  AND bp_rp IS NOT NULL
```

The `parallax_over_error > 5` cut throws out the ~5% with garbage astrometry — looser than the `> 10` cut typical in dynamics papers, because we want the dimmest M dwarfs included even at the edge of the volume. Visual completeness matters more than astrometric precision; we accept that a handful of stars are a couple of pc out of position.

Save the result as `data/raw/gaia_dr3_50pc.csv` and **commit it to the repo**. The file is small and deterministic; re-querying at every build would chain a slow / occasionally-down archive into our pipeline. Only re-fetch if the cut criteria change.

## Parsing

- **Code path:** `tools/buildGaiaStars.ts`. Standalone script following the same shape as `tools/buildAllBins.ts` — pure Node, no Vite, parses with the same hand-rolled CSV reader pattern used by `tools/parsers/sdssCsv.ts` (header row → column index map → row iteration). Gaia's CSV is well-formed: `,`-separated, quoted strings, no embedded newlines.
- **Schema (columns we use):**

  | CSV column | Type | Use |
  |-----------|------|-----|
  | `source_id` | u64 (decimal string) | Stable Gaia identifier; cross-match key for named stars |
  | `ra` | f64 (deg) | Right ascension, ICRS |
  | `dec` | f64 (deg) | Declination, ICRS |
  | `parallax` | f32 (mas) | Distance via 1000/parallax |
  | `parallax_error` | f32 (mas) | For the `parallax_over_error > 5` post-filter (also applied at query time, kept as belt-and-braces) |
  | `pmra` | f32 (mas/yr) | Proper motion in RA (cos δ applied by Gaia); reserved for subtle motion-blur effect |
  | `pmdec` | f32 (mas/yr) | Proper motion in Dec |
  | `phot_g_mean_mag` | f32 (mag) | G-band apparent magnitude → display brightness |
  | `bp_rp` | f32 (mag) | BP − RP color index → display color (blue ≈ −0.5, red ≈ +5) |

  All other Gaia columns are dropped.

## Filtering / cross-matching

Per-row pipeline inside `buildGaiaStars.ts`:

1. **Drop rows with non-finite parallax** (defensive — the ADQL filter should have removed these, but a stray `NaN` would corrupt a position).
2. **Compute distance:** `d_pc = 1000 / parallax_mas`. Standard naive-inverse estimator. For a parallax-noise-limited cut at 50 pc, the Bailer-Jones distance prior gives < 1% improvement and isn't worth the dependency.
3. **Hard distance cut:** drop any star with `d_pc > 50` after the inverse (the ADQL `parallax > 20` cut is exact; the assertion catches edge cases like `parallax = 20.0001` rounding).
4. **Convert to Cartesian (parsec):**

   ```
   ra_rad  = ra * π/180
   dec_rad = dec * π/180
   x = d_pc * cos(dec_rad) * cos(ra_rad)
   y = d_pc * cos(dec_rad) * sin(ra_rad)
   z = d_pc * sin(dec_rad)
   ```

   ICRS frame; the Sun is at the origin. Shell 2's camera origin is the Sun, so this falls out cleanly with no rotation needed.
5. **Derive absolute G magnitude:** `M_G = G - 5 * log10(d_pc) + 5`. Stored alongside apparent G — the renderer can use either, and `M_G` is useful for picking out intrinsically luminous outliers (Sirius A vs Sirius B).
6. **Cross-match named stars:** load `data/named-stars.json` (a hand-curated list of `{source_id, name, hipparcos_id?}` for the brightest ~50 stars, seeded from Hipparcos). Match by `source_id`. Emit a sidecar `public/data/gaia-stars-named.json` mapping source_id → name for the label renderer to consume. The named-stars list is small enough to keep as JSON; no need for a binary format.

## Output binary format

Reference: `data/10-binary-formats.md` (section "Gaia stars v1"; to be added in that doc when this spec lands).

Per-record layout, **32 bytes/star, little-endian:**

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 4 | f32 | x (parsec) |
| 4 | 4 | f32 | y (parsec) |
| 8 | 4 | f32 | z (parsec) |
| 12 | 4 | f32 | phot_g_mean_mag |
| 16 | 4 | f32 | bp_rp |
| 20 | 4 | f32 | abs_g_mag (derived) |
| 24 | 8 | u64 | source_id |

Header (matches the existing `pointCloudFormat.ts` convention):

| Offset | Size | Type | Field |
|--------|------|------|-------|
| 0 | 4 | ASCII | magic = `"GAIA"` |
| 4 | 2 | u16 | version (start at 1) |
| 6 | 2 | u16 | reserved (zero) |
| 8 | 4 | u32 | record count |
| 12 | 4 | u32 | reserved (zero, future flags) |

Total file size: `16 + 32 * count`. For ~7,500 stars: ~240 KB. Easily fits in one fetch.

Proper motion is **not** in the binary v1. If the motion-blur effect ships, bump to v2 and append `pmra` (f32) + `pmdec` (f32), making records 40 bytes. The header version field makes the upgrade detectable; the loader can branch on it. Same pattern as the existing `pointCloudFormat.ts` v1 → v2 upgrade.

## Build script

- **File:** `tools/buildGaiaStars.ts`.
- **Run command:** `npx tsx tools/buildGaiaStars.ts` (or via the orchestrator: `npm run build-shell-data`).
- **Inputs:** `data/raw/gaia_dr3_50pc.csv`, `data/named-stars.json`.
- **Outputs:** `public/data/gaia-stars.bin`, `public/data/gaia-stars-named.json`.
- **Idempotent:** yes — given the same CSV input, the byte-identical `.bin` is produced. Sort rows by `source_id` ascending before encoding to make the output stable regardless of any source-side row ordering.
- **Approximate runtime:** < 1 s on any laptop. Pure CPU-bound CSV parse + numeric conversion over a few thousand rows.
- **Sync to R2:** add `gaia-stars.bin` and `gaia-stars-named.json` to the `tools/syncR2.ts` ALLOW filter so the next `npm run sync-r2` ships them.

## Licensing & attribution

**License:** Creative Commons Attribution 4.0 International (CC BY 4.0). Commercial reuse is permitted; attribution is **mandatory**.

**Required citation string** (per the Gaia mission's standard wording):

> "This work has made use of data from the European Space Agency (ESA) mission Gaia (<https://www.cosmos.esa.int/gaia>), processed by the Gaia Data Processing and Analysis Consortium (DPAC, <https://www.cosmos.esa.int/web/gaia/dpac/consortium>)."

Plus the DR3 reference paper: Gaia Collaboration, Vallenari et al., 2023, A&A 674, A1.

**In-app credit:** shell 2's overlay shows the short credit line **"Stars: ESA / Gaia / DPAC"** in the corner during the entire shell beat. The full citation goes in the repo-level `CREDITS.md` and in the tour's "About this view" panel (per `decisions/0007-data-licensing.md`).

## Risks

1. **Archive availability.** The ESA Gaia archive has periodic maintenance windows and occasional multi-hour outages. Mitigation: the CSV is a one-time committed artifact in `data/raw/`. Builds never touch the archive. Re-fetches happen only when a human deliberately changes the cut.
2. **CSV format drift.** ESA could in principle change the CSV schema (column order, header names) in a future archive UI update. Mitigation: parse by header name, not column index — same as the SDSS parser. The parser will throw a clear error if a required column is missing.
3. **Distance estimator naivety.** Using `1000/parallax` is fine for our cut but breaks down for `parallax_over_error < 5`, which is why we filter at the query. If we ever extend the cut beyond 50 pc, switch to the Bailer-Jones EDR3 distance catalog (a separate Gaia data product).
4. **Named-star cross-match drift.** Hipparcos identifiers don't directly map to Gaia `source_id`. The hand-curated `named-stars.json` resolves each name to a `source_id` once (verified manually against SIMBAD); if that file falls out of date with future Gaia DRs, labels could attach to the wrong star. The fix is a one-shot re-verification per data release, not per build.
5. **Color-index extremes.** A handful of very red M dwarfs and very blue white dwarfs land at `bp_rp` values outside the typical [−0.5, +4] display range. The renderer's color-index → RGB function (shared with the existing point pipeline) must clamp gracefully.
6. **Binary size growth.** If we ever loosen the cut to 100 pc, the count balloons to ~50k stars (still trivial — ~1.6 MB). The 200 pc cut would be ~400k (~13 MB). All still fine for R2; flagging in case the design ever drifts toward "show all of Gaia."

## Sample / test data

A 100-row excerpt at `tests/fixtures/gaia-stars-sample.csv` (first 100 rows sorted by `source_id`). The build-script test `tests/tools/buildGaiaStars.test.ts` runs the pipeline against this fixture and asserts:

- Header magic = `"GAIA"`, version = 1, record count = 100 (all sample rows pass the filters by construction).
- First record's `(x, y, z)` matches a hand-computed value verified against an external astropy script, embedded as a constant.
- Cross-match to a fixture `named-stars.json` containing one Sirius entry yields exactly one named-stars JSON entry.

The fixture (~30 KB) is committed; the full `gaia_dr3_50pc.csv` is committed as the canonical input.

## References

- Gaia Collaboration, Vallenari, A., et al. (2023). *Gaia Data Release 3. Summary of the content and survey properties.* A&A, 674, A1. <https://doi.org/10.1051/0004-6361/202243940>
- Gaia archive: <https://gea.esac.esa.int/archive/>
- ADQL cookbook: <https://www.cosmos.esa.int/web/gaia-users/archive/writing-queries>
- Bailer-Jones et al. (2021). *Estimating Distances from Parallaxes. V. Geometric and Photogeometric Distances to 1.47 Billion Stars in Gaia EDR3.* AJ 161:147.
- Hipparcos catalogue (ESA SP-1200, 1997) — source of the named-star bootstrap list.
- Skymap binary format precedent: `src/data/pointCloudFormat.ts` (v2, 48 B/point) — the v1/v2 header-version pattern is reused here.
