# Galaxy catalog format v9 — pre-baked masses, one flags byte, aligned tail

The SKMP record has no mass. Mass is the one physical quantity MCPM fitting,
future InfoCard display, and any luminosity-function work all need, and the
catalog already carries everything required to estimate it (apparent
magnitudes + distance). Meanwhile the v8 tail wastes two full bytes on two
1-bit flags, mis-aligns `spectroscopicZ` at offset 54, and a version bump
today would hit two landmines discovered in the consumer sweep: a
version-mismatch costs a browser **three full ~100 MB downloads** before
surfacing a developer-only error string, and stable data URLs +
`max-age=86400` guarantee up to 24 h of v8-bins-with-v9-code after deploy.

v9 fixes the layout while spending the freed space on `log10StellarMass`,
and bundles the two deploy-safety fixes that only make sense to land with a
format bump.

## Goal

- Every galaxy record carries `log10StellarMass` (float32, log₁₀ M/M☉,
  **NaN = absent**), estimated at build time from the best real band per
  source, with a `massIsEstimated` provenance bit for a future measured
  (NSA cross-match) upgrade.
- The record tail is fully aligned; every float now takes the
  `Float32Array` fast path in encode/decode.
- A version mismatch in the browser fails **once**, with a user-legible
  "app updated — reload" splash, not three re-downloads and
  `npm run build-tiers` advice.
- Data files live under one folder per binary family with the format
  version as an epoch segment (`/data/galaxy-catalog/v9/…`), so browser/CDN
  caches can never pair mismatched code and bins (the `earth-tiles/v1`
  precedent, generalized to every family).
- Stride stays 64 B — no growth on ~280 MB of shipped bins.

## Non-goals

- **No halo masses on disk.** Halo mass is a pure function of stellar mass
  (Moster et al. 2013) and belongs at the consumer (MCPM export), not in
  the format. Stellar mass is the fundamental, displayable quantity.
- **No measured masses yet.** All v9 masses are photometric estimates
  (bit 2 set). The NSA cross-match is future work the format now has room
  for.
- **No per-source variable layout.** `magU`/`magZ` stay as guaranteed-NaN
  slots for non-SDSS sources; the header's reserved word stays free for a
  future column-presence mask.
- **No InfoCard mass display.** UI consumption of the new field is
  separate work; v9 only delivers the data.

## Ground preparation

The field list is restated in ~10 places (encode, decode,
`emptyGalaxyCatalog`, `GalaxyCatalog.d.ts`, `galaxyCatalogTransfer.ts`
copy + transfer list, `recordsToCloud`, `buildFamous`'s hand-rolled
duplicate, `synthetic.ts`, `makeGalaxyCatalog.ts`), and
`galaxyCatalogTransfer.ts:25–30` falsely claims to be the only one.
**Before the v9 feature**, a prep refactor introduces a
`GALAXY_CATALOG_FIELD_SPECS` table in `galaxyCatalogFormat.ts` — name, offset, view type, per-field
doc — that drives encode, decode, `emptyGalaxyCatalog`, and the transfer
clone mechanically (the `structureCatalogFormat.ts` named-`OFF_*` pattern,
completed). `recordsToCloud`, `buildFamous`, `synthetic.ts`, and the test
fixture remain hand-written assemblers but reduce to one-line-per-field
edits. The transfer test switches from asserting a **count of 15** buffers
(which nets to 15 again after +mass/−flag and would silently miss both
changes) to asserting the set of buffer names. Prep lands as its own
commit(s) at v8, proven by the existing round-trip suite, before any
layout change.

## Record layout (v9, 64 B stride)

| offset | size | type | field | change vs v8 |
|---|---|---|---|---|
| 0 | 8 | uint64 | `objID` | — |
| 8 | 12 | 3×f32 | `x`,`y`,`z` | — |
| 20 | 20 | 5×f32 | `magU`…`magZ` | — |
| 40 | 4 | f32 | `axisRatio` | — |
| 44 | 4 | f32 | `positionAngleDeg` | — |
| 48 | 4 | f32 | `diameterKpc` | — |
| 52 | 1 | u8 | `classByte` | — |
| 53 | 1 | u8 | `parentSurveyByte` | — |
| 54 | 1 | u8 | `flagsByte`: bit 0 orientation-fallback, bit 1 diameter-fallback, bit 2 mass-is-estimated | was 2 bytes at 58/59 |
| 55 | 1 | — | reserved, zeroed | |
| 56 | 4 | f32 | `spectroscopicZ` | moved from 54, now aligned |
| 60 | 4 | f32 | `log10StellarMass`, NaN = absent | new |

Header unchanged (`SKMP`, version = 9, count, reserved).

The decoder expands `flagsByte` back into the two existing `Uint8Array`
columns (`orientationIsFallback`, `diameterIsFallback`), so the GPU bake
(`buildPointInterleavedBuffer.ts:229/301`), provenance registry
(`provenanceAxes.ts:38/46`), and InfoCard chips are untouched — the
`medianAbsMag` derived-at-decode precedent. The in-memory `GalaxyCatalog`
type gains only `log10StellarMass: Float32Array`.

## Mass estimation (build side, in `recordsToCloud` / `buildFamous`)

Per source, from the best *real* band (the magnitude slots are shoehorned
per catalog — see `docs/DATA.md` gotchas):

- **SDSS** (all five bands real): Bell et al. 2003 colour mass-to-light
  on (g−r) with the r-band luminosity — a *stellar* mass. The separate
  relation calibrated against the SDSS DR17 Cosmic Slime VAC weights
  (`log10(W_VAC[10⁹ M☉]) = −5.81 − 0.350·M_r`, 0.34 dex; see rhizome
  `DATA_LINEAGE.md`) yields Moster-converted **halo**-scale weights and
  therefore does NOT populate this field — it belongs to the future
  MCPM-export path, alongside the Moster forward conversion from the
  stellar mass stored here.
- **2MRS** (slot magI = 2MASS K): K-band mass-to-light,
  `log10(M★/M☉) = −0.4·(M_K − M_K☉) + log10(M/L_K)` with M/L_K ≈ 0.6
  (McGaugh & Schombert 2014 flat K-band M/L).
- **GLADE / famous** (slot magG = B, magR = V): Bell et al. 2003 colour
  M/L on (B−V) where both bands are real; single-band fallback where only
  one is.
- **Milliquas / DESI**: NaN (quasar photometry does not yield a stellar
  mass estimate worth storing).

Absolute magnitudes come from the record's own position
(`absoluteFromApparent`), matching how the renderer already derives
luminosity. All estimated masses set flag bit 2. Exact coefficients live
in one `tools/catalog/estimateLog10StellarMass.ts` with a unit test per
source branch; NaN in → NaN out, never a fabricated default (the
`diameterKpc` null-convention, not the star-seed omit-convention — the
format is columnar, so NaN is the absent sentinel, documented against the
structure catalog's *linear* 10¹⁴ M☉ `significance` to prevent unit
confusion).

## Version-gate failure UX

`decodeGalaxyCatalog` throws a typed `FormatVersionError`.
`retryPolicy.ts` returns `'give-up'` for it (a mismatch is deterministic —
retrying re-downloads ~100 MB twice for nothing), and `useSplash.ts` maps
it to a new `SplashError` kind rendering "Skymap was updated — reload the
page to fetch matching data" instead of the raw
`unsupported version: … build-tiers` developer string (which remains for
tool-side callers like `buildFilaments`).

## Data layout & URL epoch

`public/data/` reorganizes into one folder per binary family, named after
its format module, with the family's **current** format version as an
epoch segment:

| folder | files | format module (version) |
|---|---|---|
| `galaxy-catalog/v9/` | `sdss-*`, `2mrs`, `glade-*`, `milliquas-*`, `desi-*`, `famous` `.bin` | `galaxyCatalogFormat.ts` (9) |
| `star-catalog/v1/` | `stars-{small,medium,large}.bin` | `starCatalogFormat.ts` (1) |
| `structure-catalog/v1/` | `structures`/`clusters` `.ccat` **+ their `*_meta.json`** (fetched as a pair) | `structureCatalogFormat.ts` (1) |
| `scalar-field/v3/` | `cf4_density`, `flowfield`, `mcpm-*` `.scfd` | `scalarFieldFormat.ts` (3) |
| `filament/v1/` | `filaments{,-sdss,-small}.bin` | `filamentBinaryFormat.ts` (1) |

Loose JSON (`famous_*_meta`, `constellations`, `pgc_aliases`) and
`images/` stay at the root — no version gate, schemas evolve compatibly
(`images/earth-tiles/` already carries its own `TILE_PREFIX` epoch).

Each format module exports its epoch prefix derived from its own
`VERSION` constant (e.g. ``GALAXY_CATALOG_DATA_PREFIX =
`galaxy-catalog/v${VERSION}` ``); fetchers pass prefixed filenames to the
existing `dataUrl()` (`fetchWithProgress.ts:24–27`, itself unchanged) and
build tools write under `public/data/<prefix>/` via the same constant —
URL, disk layout, and decode gate cannot diverge. Touch points: the five
family fetchers, `tierTargets.ts:87–92`, the builders (`buildAllBins`,
`buildFamous`, star/structure/volume/flow builders, `buildFilaments` on
both its galaxy-bin *input* and filament *output* paths),
`collectDataFiles.ts`, `tools/deploy/r2/allowDataFile.ts`. Old flat R2
objects are left in place until the next sync prune (in-flight old
clients keep working through a deploy); `public/_headers` unchanged —
`max-age=86400` is now safe for every family. A future bump of any
family adds a sibling epoch folder.

## Build-order + doc sweep

- `buildFilaments` decodes catalog bins → documented (and enforced with a
  version pre-check + friendly message) that `build-tiers` must precede
  `build-filaments` after a bump.
- Stale docs fixed in the same branch: `docs/DATA.md:12/16` (says v6, has
  the pre-rename file path; also gains the `<family>/v<N>/` layout table
  above), `README.md:672–686` (whole section still documents v4),
  `docs/adrs/0004…md:37` (v6 + stale link),
  `.claude/skills/add-data-source/SKILL.md` gains the "bump = regenerate
  bins + R2 epoch + purge" checklist step and the family-folder rule for
  new sources.

## Testing

- Existing round-trip suite tracks the bump automatically (no baked binary
  fixtures exist — all fixtures go through the encoder).
- `galaxyCatalogFormat.test.ts`: version-rejection loop extends to v8;
  byte-length assertions keep `16 + count·64`; new cases for flag-bit
  packing (all 8 combinations), `log10StellarMass` NaN round-trip, and
  `spectroscopicZ` at its new aligned offset (negative + NaN cases carry
  over).
- `galaxyCatalogTransfer.test.ts`: asserts buffer-name set (ground prep).
- `estimateLog10StellarMass`: one test per source branch against
  hand-computed values; NaN propagation.
- Retry policy: `FormatVersionError` → `'give-up'`, single fetch.
- `npm run build-tiers` smoke on the real catalogs, then decode + spot
  check mass percentiles per source against the calibration expectations
  (SDSS median ≈ 10^10.3 M☉).
