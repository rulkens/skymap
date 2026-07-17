# Gaia Star Bin — Plan 02: Binary format & build pipeline

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development`
> to execute this plan (fresh subagent per task + spec review + quality review). Each
> task is TDD: failing test first, minimal green, commit. Dispatch implementers with
> `run_in_background: true`; the **main thread** runs `npm test` / `npm run typecheck`
> and makes the commits (background subagents cannot run npm).
>
> **Plan style (OVERRIDES upstream `writing-plans`):**
> [`docs/superpowers/conventions/plan-style.md`](../conventions/plan-style.md) —
> **contract code yes, implementation code NO.** Byte/offset tables and type
> signatures ARE contract (reproduced here); function bodies are not — cite
> `path:line` and let the implementer write the body from the test.
>
> **Testing discipline:** [`docs/superpowers/conventions/testing.md`](../conventions/testing.md).
> Round-trip + hand-computed + independent-property assertions only. Do **not**
> re-state the byte-table constants back at themselves, and do **not** write a test
> that needs the real fetched data or the network (real-data verification is a
> build-time logged assertion, not a vitest).

**Spec:** [`docs/superpowers/specs/2026-07-13-gaia-star-bin-design.md`](../specs/2026-07-13-gaia-star-bin-design.md)
— this plan owns **§2 selection**, **§3 binary format**, **§4's build step**
(`npm run build-stars`), **§5 tiers**, and the **§4 R2 `ALLOW` extension**. It does
**NOT** own the fetch (plan 01) or the registry / renderer / loader wiring (plan 03).

## Goal

Turn the raw Gaia DR3 + Bailer-Jones + GCNS + Hipparcos-2 files (fetched by plan 01)
into three self-contained, Morton-ordered, octree-flux-mipped, compressed catalog
files — `public/data/stars-{small,medium,large}.bin` — and ship the **decode half**
of the format so plan 03's loader/renderer can consume them. Concretely:

```
raw CSV/dat ─▶ parse ─▶ select (§2) ─▶ resolve distance (§2) ─▶ dedup subtraction (§2)
            ─▶ Morton sort ─▶ per-tier truncate ─▶ build octree flux mip
            ─▶ pack 6-byte records ─▶ compress ─▶ public/data/stars-<tier>.bin
                                                            │
                          browser fetch ◀── decodeStarCatalog ◀── (plan 03)
```

**Non-goals (plan 03, do NOT touch here):** the `starCatalog` `SourceEntry` variant,
the appended `Source` code, `cloudLoader` tier wiring, the dedicated vertex-pulling
star renderer, the WESL colour ramp, and the crossfade. Plan 02 stops at "the `.bin`
exists on disk, round-trips through the format module, and syncs to R2."

**Docs/skill split across the three plans (do not duplicate a sibling's rows):**
plan 01 = ATTRIBUTIONS.md entries + the README raw-data *download* table rows;
plan 02 = the README *build-step* docs + the `add-data-source` skill's pipeline
edit surface (Task 12); plan 03 = the user-facing functionality blurb + the
skill's runtime surface (registry/loader/renderer).

## Architecture

Three homes, matching the existing catalog pipeline's src/tools split:

- **`src/data/starCatalog/`** — the on-disk format, which the **runtime decodes**, so
  it lives in `src/` exactly like `galaxyCatalogFormat.ts`. Holds `starCatalogFormat.ts`
  (magic + version header, node table, 6-byte record pack/unpack, LUT quantizers,
  `encodeStarCatalog` / `decodeStarCatalog`, loud regenerate error) and `starBinCodec.ts`
  (the sealed compression codec — one constant, one compress fn, one decompress fn).
- **`src/utils/math/`** — `mortonEncode3.ts` / `mortonDecode3.ts` (one symbol per file),
  pure helpers used by **both** the encoder (tools) and the future runtime octree
  walker (plan 03). Reused, so they cannot live under `tools/`.
- **`tools/stars/`** — the build entry `buildStars.ts` plus its extracted pure stages
  (`selectStars.ts`, `resolveStarDistancePc.ts`, `mergeFluxAggregate.ts`,
  `buildStarOctree.ts`, `famousStarGaiaIds.ts`), and `tools/parsers/hipparcos2.ts`,
  `tools/utils/color/bvToBpRp.ts`.

The build tool computes the spatial structure (positions, Morton sort, octree, mip)
and hands the format module a fully-populated in-memory `StarCatalog`; the format
module owns **only** serialization + bit-packing + compression. That boundary is the
single-source-of-truth-for-bytes convention (testing.md keep-rule #1): the byte
layout is asserted in exactly one place — `tests/data/starCatalog/starCatalogFormat.test.ts`.

## Tech stack

TS + Vitest. `tsx` build scripts (mirroring `build-all` / `build-mcpm`). No new
**runtime** deps unless Task 1's measurement forces a zstd-wasm decoder (contingency,
user-gated). Compression uses the isomorphic web-streams `CompressionStream` /
`DecompressionStream` globals (present in both Node 18+ and browsers) so encode (Node)
and decode (browser) share one codec with no `node:zlib` import. Raw-data paths come
**only** through `rawDataPath(...)`; positions go through the existing
`raDecDistToCartesian` (`src/utils/math/raDecDistToCartesian.ts:30-43`).

## Global constraints (house rules — these override defaults)

- **`type` aliases, never `interface`.** One `type` per file in `src/@types/`; one
  exported function per file in `src/utils/` and `tools/utils/` (filename = symbol).
  `src/data/` modules may carry several related exports (precedent:
  `galaxyCatalogFormat.ts`). Deep relative imports, no barrels.
- **`Vec3` alias**, never a raw `[number, number, number]` tuple
  (`src/@types/math/Vec3.d.ts`).
- **On-disk format = one canonical home.** The magic + version header is the single
  source of truth for "do I understand this file?"; a version mismatch throws the
  documented `regenerate via "npm run build-stars"` error (mirror
  `galaxyCatalogFormat.ts:145-156`). The byte tables are asserted once, in the format
  test — not restated elsewhere.
- **Raw paths via the registry** — `rawDataPath('gaia.*')`, never a literal
  `data/raw/gaia/...`. The `gaia.*` keys are **registered by plan 01**; plan 02 only
  consumes them. If a key is missing at execution time (plan 01 not yet landed),
  **STOP and report** — do not add registry entries here.
- **Append-only, sealed codec.** Once Task 1 seals `STAR_BIN_CODEC`, nothing outside
  `starBinCodec.ts` may name the codec. The record byte layout and header are frozen
  at v1; a change means a version bump + full rebuild.
- **Didactic timeless comments** — explain *why* / *what the alternative was*; no
  dates, PR refs, or "used-to-be" history. Match the multi-paragraph module-header
  style of `galaxyCatalogFormat.ts`.
- **Subagent implementers run bash sequentially** and cannot use `sed`/`awk`/`grep`
  (use Read/Grep tools) and cannot run npm — the main thread verifies + commits.
- **Suite stays green** at every task; the **final task gates on `npm run typecheck`
  (both tsconfigs) + `npm test`**.

## Resolved plan-time items (decisions since the spec — research-verified 2026-07-14; bake these in)

The spec's §8 open questions and §"Open verification items" that fall in this plan's
scope are resolved here. Treat these as contract:

1. **Bright-end threshold = `Hp < 4.0`, Hipparcos-wins.** ESA's stated DR3 bright limit
   is G≈3 with ~20% of G<3 sources missing (Fabricius et al. 2021); Gaia uses a
   degraded 6-parameter pseudocolour astrometric solution below G≈4 and Hipparcos
   parallaxes are more precise than Gaia's for G≲4 (Lindegren et al. 2021). So the
   build takes **all** hip2 rows with `Hpmag < 4.0` as truth (position from
   RArad/DErad + Plx→distance; magnitude from Hpmag; colour from B−V) and **subtracts**
   their Gaia matches (via the `hip2_best_neighbour` HIP→source_id map) from the Gaia
   selection. Hipparcos rows with **non-positive parallax** are a counted, logged drop.
2. **Set formula (the dedup, once, in the encoder):**
   `stars = (gaiaSelected ∖ hipMatched) ∪ hipparcosBright ∖ famousStarSet`.
3. **B−V → BP−RP for Hipparcos rows.** A published Gaia DR3 photometric-relationship
   polynomial maps Hipparcos B−V onto BP−RP so Hipparcos stars share the Gaia rows'
   6-bit `colorIdx` LUT axis. Finding/citing the exact polynomial (Gaia DR3
   documentation, "Photometric relationships with other photometric systems") is an
   **implementer task**; the plan pins the contract: a pure `bvToBpRp(bv: number): number`.
4. **FamousStar dedup is by curated ID, never by position.** High-proper-motion nearby
   stars have moved arcminutes since J2000, so positional matching is **forbidden**. A
   curated table maps the ~25 `SCENE_STARS` ids
   (`src/data/bodies/sceneBodies.ts:115-141`) → Gaia DR3 `source_id | null` (null = not
   in Gaia — e.g. the Sun; Sirius / α Cen are likely absent too). The implementer
   resolves each id against the fetched data or SIMBAD and documents provenance per row.
5. **Compression codec is an OPEN VERIFICATION — Task 1.** Front-loaded. See Task 1.
6. **Tier truncation direction.** The fetch is a one-time `G<14.0` superset — **never
   plan a re-fetch**. Tiers truncate the G-sorted superset at the record count whose
   **measured compressed size** hits ≤ the 10 / 30 / 75 MB transfer budgets. If
   compression beats the estimate, `large` simply lands under budget at G<14 — do not
   plan a wider fetch.

## Inputs consumed from plan 01 (pinned contracts — do NOT deviate)

All via `rawDataPath(...)`:

| Key | File(s) | Columns / layout |
|---|---|---|
| `gaia.dir` | directory of `gaia_page_<NNNN>.csv` | `source_id, ra, dec, phot_g_mean_mag, bp_rp, r_med_geo, r_med_photogeo, random_index` — empty string in `r_med_*` = no Bailer-Jones row (the ~0.76 % counted drop) |
| `gaia.gcns` | `gcns_main.csv` | `source_id, ra, dec, parallax, dist_50, phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag` — vetted distance = `dist_50` (parsecs); BP−RP = `phot_bp_mean_mag − phot_rp_mean_mag` |
| `gaia.hip-xmatch` | `hip2_best_neighbour.csv` | `source_id, original_ext_source_id` (= HIP number) |
| `gaia.hipparcos` | `hip2.dat` | fixed-width 276-byte records, VizieR I/311 — see the byte table in Task 6 |

## Interfaces (LOCKED — the exact symbols plan 03 imports; keep names/signatures consistent across tasks)

```ts
// src/@types/data/starCatalog/StarCatalogNode.d.ts   (one type per file)
export type StarCatalogNode = {
  readonly mortonIndex: number;   // uint32 — locates + sizes the node's box
  readonly level: number;         // uint8  — 0 = leaf; >0 = aggregate (box ×2^level)
  readonly childMask: number;     // octree descent bits (leaf: 0); 3 bytes on disk
  readonly firstRecord: number;   // uint32 — index into the record array
  readonly recordCount: number;   // uint32 — leaf: stars in cell; aggregate: 1
};

// src/@types/data/starCatalog/StarCatalog.d.ts       (one type per file)
export type StarCatalog = {
  readonly starCount: number;          // leaf star records
  readonly nodeCount: number;          // octree nodes (leaf + aggregate)
  readonly mortonBitsPerAxis: number;  // grid resolution (≈9 → 512³)
  readonly cellEdgePc: number;         // leaf-cell edge, parsecs (float32)
  readonly gridOrigin: Vec3;           // grid corner, parsecs, heliocentric (f64-valued)
  readonly nodes: readonly StarCatalogNode[];
  readonly records: Uint8Array;        // packed 6-byte records (leaves + aggregates), GPU-upload-ready
};

// src/data/starCatalog/starCatalogFormat.ts
export function encodeStarCatalog(cat: StarCatalog): Promise<ArrayBuffer>;   // serialize → compress
export function decodeStarCatalog(buf: ArrayBuffer): Promise<StarCatalog>;   // decompress → validate → parse
export function emptyStarCatalog(): StarCatalog;

// src/utils/math/mortonEncode3.ts / mortonDecode3.ts
export function mortonEncode3(x: number, y: number, z: number): number; // interleave ≤10-bit coords → uint32
export function mortonDecode3(code: number): Vec3;                       // uint32 → [x, y, z] grid coords
```

`encode`/`decode` are **async** because the sealed codec uses the streaming
`CompressionStream`/`DecompressionStream` API; the runtime loader awaits `decodeStarCatalog`
(a compressed asset always inflates async). `records` is handed back **packed** (not
unpacked into SoA) so plan 03's renderer uploads it to a storage buffer as-is and
unpacks in the shader.

---

## Task 1 — Codec verification + sealed `starBinCodec` module (FRONT-LOADED OPEN VERIFICATION)

**Files:** `src/data/starCatalog/starBinCodec.ts` (new), `tests/data/starCatalog/starBinCodec.test.ts` (new).
A short decision note goes in the module docblock (not a separate `.md`).

**Verification (do this first, decide by measurement):**

1. **Browser-native zstd check.** Confirm whether `DecompressionStream('zstd')`
   constructs without throwing in **both** current Chrome **and** current Safari (check
   MDN's `DecompressionStream` support table; a 3-line console snippet in the running
   dev server — `new DecompressionStream('zstd')` in each browser — is sufficient).
   - **(a)** If it exists in Chrome **and** Safari → seal `STAR_BIN_CODEC = 'zstd'`
     via `CompressionStream`/`DecompressionStream`.
   - **(b)** Else → seal `STAR_BIN_CODEC = 'gzip'` (universal `DecompressionStream`
     support) as the default. The real gzip-vs-zstd-wasm **ratio** measurement against
     the tier budgets is deferred to Task 11 (it needs Morton-sorted packed data that
     doesn't exist until then). If Task 11 finds gzip misses a budget by **>20 %**,
     escalating to a `zstd-wasm` decoder (~200 kB runtime dependency) is a
     **STOP-and-report to the user** decision, not a silent swap.

**Interfaces (sealed — nothing else in the pipeline may name the codec):**

```ts
export const STAR_BIN_CODEC: 'gzip' | 'zstd';   // the sealed decision (single named constant)
export function compressStarBin(plain: Uint8Array): Promise<Uint8Array>;
export function decompressStarBin(packed: Uint8Array): Promise<Uint8Array>;
```

- [x] Run the browser-native zstd check; record the (a)/(b) decision + evidence in the
  module docblock.
- [x] Implement `starBinCodec.ts` with the sealed constant + compress/decompress over
  `CompressionStream`/`DecompressionStream` (async; feed bytes → collect chunks →
  concat). Didactic docblock explains why the codec is sealed here and why web-streams
  over `node:zlib` (isomorphic Node+browser).
- [x] Test `round-trips arbitrary bytes` — `decompressStarBin(await compressStarBin(x))`
  equals `x` for a non-trivial buffer (include an incompressible random slice and a
  highly-compressible run so the test exercises real inflate, not a no-op).
- [x] Test `compressed output differs from plaintext` for a compressible input (an
  independent sanity property that the codec is actually engaged — not a mirror).
- [x] `npm test -- starBinCodec` → green. Commit.

## Task 2 — Morton helpers `mortonEncode3` / `mortonDecode3`

**Files:** `src/utils/math/mortonEncode3.ts` + `mortonDecode3.ts` (new, one symbol
each), `tests/utils/math/mortonEncode3.test.ts` + `mortonDecode3.test.ts` (new).

**Signatures:** as in the Interfaces section. Interleave up to 10 bits per axis
(max 30 bits, fits a uint32); `mortonDecode3` returns the three integer grid coords as
a `Vec3`. These are the shared spatial primitive for the encoder AND the plan-03 walker
— that is why they live in `src/utils/math/`, not `tools/`.

- [x] Add both files with didactic docblocks (Z-order curve; bit-interleave; why a
  uint32 suffices at ≤10 bits/axis; the frame is the octree grid index, not a spatial
  vector).
- [x] Test `round-trips grid coordinates` — `mortonDecode3(mortonEncode3(x, y, z))`
  equals `[x, y, z]` across a spread of coordinate triples including 0, max
  (`1023,1023,1023`), and asymmetric axes.
- [x] Test `encodes known adversarial bit patterns` with **hand-computed** codes: e.g.
  `mortonEncode3(1,0,0)`, `mortonEncode3(0,1,0)`, `mortonEncode3(0,0,1)` land on the
  three lowest interleave bits (values `1`, `2`, `4`); `mortonEncode3(1,1,1) === 7`.
  These pin the axis→bit assignment, which the walker depends on — a swapped axis fails
  here but round-trips clean, so the round-trip test alone is insufficient.
- [x] `npm test -- morton` → green. Commit.

## Task 3 — `bvToBpRp` colour-transform helper

**Files:** `tools/utils/color/bvToBpRp.ts` (new, one symbol), `tests/tools/utils/color/bvToBpRp.test.ts` (new).

**Signature:** `bvToBpRp(bv: number): number` — maps Johnson B−V (Hipparcos) onto Gaia
DR3 BP−RP via a published photometric-relationship polynomial so Hipparcos stars share
the Gaia rows' `colorIdx` axis.

**Implementer task:** locate + cite the exact polynomial coefficients from the Gaia DR3
documentation chapter "Photometric relationships with other photometric systems"
(record the source URL + table in the module docblock). Tool-only (Hipparcos is a
build-time input), so it lives under `tools/utils/`.

- [x] Add `bvToBpRp.ts` with the cited polynomial + didactic docblock (why Hipparcos
  colour must be transposed onto the BP−RP axis; where the coefficients come from).
- [x] Test `matches the published relation at reference colours` — assert against
  **hand-taken** values from the source table (e.g. a Sun-like B−V and a red-star B−V →
  the paper's tabulated BP−RP, loose tolerance). Not a mirror of the implementation.
- [x] Test `is monotonic across the valid B−V range` (independent property: redder
  B−V → larger BP−RP).
- [x] `npm test -- bvToBpRp` → green. Commit.

## Task 4 — Format constants, LUT quantizers, and 6-byte record pack/unpack

**Files:** `src/data/starCatalog/starCatalogFormat.ts` (new — this task lands the
record-level primitives; Task 5 grows the file with the file-level encode/decode),
`tests/data/starCatalog/starCatalogRecord.test.ts` (new).

**Packed record (6 bytes) — reproduced verbatim from spec §3; leaf star AND aggregate:**

| Bits | Width | Field | Meaning |
|---|---|---|---|
| 0–9 | 10 | `offsetX` | in-cell position, 0..1023 across `cellEdgePc` |
| 10–19 | 10 | `offsetY` | |
| 20–29 | 10 | `offsetZ` | |
| 30–36 | 7 | `absMag` | absolute-magnitude LUT index, 0.19-mag steps |
| 37–42 | 6 | `colorIdx` | BP−RP → colour LUT index |
| 43–47 | 5 | spare | **v1 decision: all 5 bits reserved, zeroed** — revisit only when a consumer exists |

Total 48 bits = 6 bytes.

**Spare-bit decision (pinned):** reserve all 5 bits zeroed for v1. The spec's candidate
uses (variability flag, aggregate-vs-leaf marker) are deferred — the leaf-vs-aggregate
distinction is already recoverable from the owning node's `level`, so no hot-path marker
bit is needed yet. Encode must write them zero; decode must ignore them.

**LUT quantizers + named-constant ranges (the plan chooses: named constants in the
format module, asserted against the data at encode time with a counted-clamp log):**

```ts
export const STAR_ABSMAG_LEVELS = 128;   // 7-bit index
export const STAR_ABSMAG_STEP = 0.19;    // mag/step ⇒ 128 × 0.19 = 24.32 mag span
export const STAR_ABSMAG_MIN: number;    // measured span floor (frozen constant — see below)
export const STAR_COLORIDX_LEVELS = 64;  // 6-bit index
export const STAR_COLORIDX_MIN: number;  // measured BP−RP floor (frozen constant)
export const STAR_COLORIDX_MAX: number;  // measured BP−RP ceiling (frozen constant)

export function absMagToLutIndex(absMag: number): number;   // clamp → 0..127
export function lutIndexToAbsMag(i: number): number;        // bin centre, mag
export function bpRpToColorIdx(bpRp: number): number;       // clamp → 0..63
export function colorIdxToBpRp(i: number): number;          // bin centre, BP−RP

export function packStarRecord(
  offset: Vec3,       // integer in-cell offsets, each 0..1023
  absMagIdx: number,  // 0..127
  colorIdx: number,   // 0..63
): Uint8Array;        // length 6, little-endian bit layout above
export function unpackStarRecord(rec: Uint8Array, at: number): {
  offset: Vec3;
  absMagIdx: number;
  colorIdx: number;
};
```

**Range endpoints are a build-time MEASURED decision, then frozen.** The implementer
derives `STAR_ABSMAG_MIN` (with the fixed 24.32-mag span) and
`STAR_COLORIDX_MIN`/`_MAX` from the actual data distribution (Gaia G<14 + GCNS M dwarfs
+ Hipparcos bright), then writes them as the named constants above. Starting windows to
verify against the data: absMag ≈ `−6.0 … +18.32` (24.32 span); BP−RP ≈ `−0.6 … +4.4`.
At encode time (Task 11) the quantizers count + log every value that clamps (the
counted-clamp log), so a wrong endpoint surfaces loudly instead of silently saturating.

- [x] Add the format-module skeleton: magic (`"SKST"` → `0x54534b53`), `VERSION = 1`,
  `HEADER_BYTES = 64`, `NODE_BYTES = 16`, `RECORD_BYTES = 6`, the LUT constants, the
  quantizer fns, and `packStarRecord` / `unpackStarRecord`. Didactic module header in
  the `galaxyCatalogFormat.ts` style (why cell-quantized, why the mip, why sealed codec,
  the loud regenerate contract).
- [x] Test `pack/unpack round-trips a record` — `unpackStarRecord(packStarRecord(o, a, c), 0)`
  returns the same `offset` / `absMagIdx` / `colorIdx` across corner values (all-zero,
  all-max `[1023,1023,1023], 127, 63`, and an asymmetric mix). Packing is lossless on
  already-quantized inputs, so this pins the **bit layout**, not the quantization.
- [x] Test `packed record is 6 bytes and the spare bits are zero` — length 6; bits
  43–47 of the packed value are 0 (independent check of the reserved-bit contract).
- [x] Test `quantizers clamp out-of-range inputs` with **hand-computed** expectations:
  a value below `STAR_ABSMAG_MIN` → index 0, a value above the span → index 127; the
  same for `bpRpToColorIdx` at `STAR_COLORIDX_MIN`/`_MAX`. (These endpoints are a
  contract with the shipped bytes — testing.md keep-rule #1 — and `<`/`>` clamp is
  observationally distinguishable at saturation, so this is not a vacuous
  clamp-boundary test.)
- [x] Test `lutIndexToAbsMag returns bin centres` — a hand-computed mid-range index
  maps back within `STAR_ABSMAG_STEP/2` of a chosen magnitude (round-trip
  quantize→dequantize within tolerance).
- [x] `npm test -- starCatalogRecord` → green. Commit.

## Task 5 — Format module: `StarCatalog` types + `encodeStarCatalog` / `decodeStarCatalog` / `emptyStarCatalog`

**Files:** `src/@types/data/starCatalog/StarCatalog.d.ts` + `StarCatalogNode.d.ts`
(new, one type each), `src/data/starCatalog/starCatalogFormat.ts` (modify — add the
file-level encode/decode + empty), `tests/data/starCatalog/starCatalogFormat.test.ts` (new).

**File header (64 bytes, little-endian) — reproduced verbatim from spec §3:**

| Offset | Bytes | Field | Notes |
|---|---|---|---|
| 0 | 4 | `magic` = `"SKST"` | distinct from `"SKMP"` galaxy magic |
| 4 | 4 | `version` (uint32) | bump ⇒ loud regenerate error |
| 8 | 4 | `starCount` (uint32) | leaf star records |
| 12 | 4 | `nodeCount` (uint32) | octree nodes (leaf + aggregate) |
| 16 | 4 | `mortonBitsPerAxis` (uint32) | grid resolution (≈9 → 512³) |
| 20 | 4 | `cellEdgePc` (float32) | leaf-cell edge, parsecs |
| 24 | 8 | `gridOriginX` (float64) | grid corner, parsecs, heliocentric |
| 32 | 8 | `gridOriginY` (float64) | |
| 40 | 8 | `gridOriginZ` (float64) | |
| 48 | 16 | reserved (zeroed) | future header metadata |

**Octree node table (`nodeCount` entries, 16 bytes each) — verbatim from spec §3:**

| Offset | Bytes | Field | Notes |
|---|---|---|---|
| 0 | 4 | `mortonIndex` (uint32) | locates + sizes the node's box |
| 4 | 1 | `level` (uint8) | 0 = leaf; >0 = aggregate, box scales ×2^level |
| 5 | 3 | `childMask`/reserved | octree descent bits (leaf: 0) |
| 8 | 4 | `firstRecord` (uint32) | index into the record array |
| 12 | 4 | `recordCount` (uint32) | leaf: stars in cell; aggregate: 1 |

**On-disk order:** header (64 B) → node table (`nodeCount × 16` B) → packed record
array (`totalRecords × 6` B), then the whole thing runs through `compressStarBin`.
`totalRecords` is derivable from the node table (`max(firstRecord + recordCount)`), so
it is not a separate header field; the record blob extends to the end of the
decompressed buffer. `gridOrigin` is f64 (24-byte offset) so plan 03 can subtract it
from the camera CPU-side before upload (the precision story).

**Encode/decode:** `encodeStarCatalog` writes the header + node table + `cat.records`
into an `ArrayBuffer`, then `await compressStarBin(...)` → returns the compressed buffer.
`decodeStarCatalog` does `await decompressStarBin(...)`, checks magic (`bad magic — not
a SKST file`) and version (the documented `unsupported version: N — please regenerate
the .bin via "npm run build-stars"` error, mirror `galaxyCatalogFormat.ts:145-156`),
then parses the header + node table + record blob back into a `StarCatalog`. Mirror the
`DataView` + typed-view idiom of `galaxyCatalogFormat.ts:99-140`.

- [x] Add `StarCatalogNode.d.ts` + `StarCatalog.d.ts` (verbatim from the Interfaces
  section) with didactic docblocks.
- [x] Grow `starCatalogFormat.ts` with `encodeStarCatalog` / `decodeStarCatalog` /
  `emptyStarCatalog` against the header + node tables above.
- [x] Test `round-trips a synthetic catalog` — build a small hand-authored
  `StarCatalog` (a few nodes: one aggregate + two leaves, a handful of packed records
  via `packStarRecord`, a non-axis-aligned f64 `gridOrigin`); assert
  `await decodeStarCatalog(await encodeStarCatalog(cat))` deep-equals it field-for-field
  (header scalars exact; `gridOrigin` exact through f64; every node; `records` bytes
  equal). This is the load-bearing on-disk-format test (keep-rule #1).
- [x] Test `rejects a wrong magic` — corrupt the first 4 bytes (post-decompress) →
  `decodeStarCatalog` throws `/not a SKST file/`.
- [x] Test `rejects a stale version with the regenerate message` — encode, decompress,
  overwrite the version field with `VERSION + 1`, recompress, decode → throws
  `/regenerate the .bin via "npm run build-stars"/`.
- [x] Test `emptyStarCatalog encodes and decodes to an empty catalog` — `starCount`,
  `nodeCount` 0; `records.length` 0 (round-trip).
- [x] `npm test -- starCatalogFormat` → green. Commit.

## Task 6 — Hipparcos-2 fixed-width parser

**Files:** `tools/parsers/hipparcos2.ts` (new), `tests/tools/parsers/hipparcos2.test.ts` (new).

**`hip2.dat` byte layout — VizieR I/311, 276-byte records, 1-indexed inclusive ranges
(slice as `line.slice(N-1, M)` per the `twoMrs.ts` idiom, `tools/parsers/twoMrs.ts:8-19`):**

| Bytes | Field | Format | Meaning |
|---|---|---|---|
| 1–6 | `HIP` | I6 | Hipparcos identifier |
| 16–28 | `RArad` | F13.10 | RA, **radians**, ICRS Ep=1991.25 |
| 30–42 | `DErad` | F13.10 | Dec, **radians** |
| 44–50 | `Plx` | F7.2 | parallax, **mas** |
| 130–136 | `Hpmag` | F7.4 | Hipparcos magnitude |
| 153–158 | `B−V` | F6.3 | Johnson B−V, mag |
| 166–171 | `V−I` | F6.3 | Cousins V−I, mag (parsed; not currently consumed) |

**Output shape (pin a small `Hip2Row` type in the parser file — tool-local, so it may
co-locate; not a `src/@types` entry):** per accepted row `{ hip, raDeg, decDeg, distPc,
hpMag, bv }` where `raDeg = RArad·180/π`, `decDeg = DErad·180/π`, `distPc = 1000/Plx`.
Return `{ rows, skipped }` with `skipped` counting **non-positive parallax** rows (the
counted, logged drop — a parallax ≤ 0 has no physical distance). RA/Dec are converted to
degrees at the parser boundary so downstream feeds `raDecDistToCartesian` unchanged.

- [x] Add `hipparcos2.ts` with a didactic header documenting the byte table + the
  radians→degrees + mas→parsec conversions + the non-positive-parallax skip rule.
- [x] Test `parses a ReadMe-accurate fixed-width record` — feed one hand-built 276-char
  line with known field values at the exact byte columns; assert the decoded
  `hip`/`raDeg`/`decDeg`/`distPc`/`hpMag`/`bv` (hand-computed: `raDeg` from a known
  radian value, `distPc` from a known mas value). This is a contract-with-upstream-bytes
  parser test (keep-rule #3).
- [x] Test `skips a non-positive-parallax row and counts it` — a line with `Plx ≤ 0`
  is dropped and `skipped` increments.
- [x] `npm test -- hipparcos2` → green. Commit.

## Task 7 — FamousStar → Gaia `source_id` curated table

**Files:** `tools/catalog/famousStarGaiaIds.ts` (new), `tests/tools/catalog/famousStarGaiaIds.test.ts` (new).

**Shape:** a curated map from each `SCENE_STARS` id (`src/data/bodies/sceneBodies.ts:115-141`)
to its Gaia DR3 `source_id | null` (`null` = not in Gaia). Per-row provenance comment
(how each id was resolved — fetched-data lookup or SIMBAD). Positional matching is
**forbidden** (Resolved item #4).

```ts
// keyed by the SCENE_STARS `id` strings ('sun', 'proxima-centauri', 'sirius', …)
export const FAMOUS_STAR_GAIA_IDS: Readonly<Record<string, bigint | null>>;
```

**Implementer task:** resolve each of the ~25 ids against the fetched Gaia data or
SIMBAD; document provenance per row. Known nulls to expect: `'sun'` (no Gaia row);
Sirius / α Cen are likely absent too — record whatever the resolution finds.

- [x] Add `famousStarGaiaIds.ts` with per-row provenance comments.
- [x] Test `covers every SCENE_STARS id` — the table's keys are exactly the
  `SCENE_STARS.map(s => s.id)` set (a **structural invariant** — no missing/extra keys —
  which catches a curation drift bug, not a constant restatement). Import `SCENE_STARS`
  for the key set.
- [x] Test `the Sun maps to null` — `FAMOUS_STAR_GAIA_IDS['sun'] === null` (a pinned
  branch: the Sun has no Gaia row, so the dedup must not try to subtract one).
- [x] `npm test -- famousStarGaiaIds` → green. Commit.

## Task 8 — Position-source resolution (pure)

**Files:** `tools/stars/resolveStarDistancePc.ts` (new, one symbol),
`tests/tools/stars/resolveStarDistancePc.test.ts` (new).

**Signature + priority (spec §2, verbatim order):**

```ts
type StarDistanceInputs = {
  rMedPhotogeo: number | null;  // Bailer-Jones photogeometric (community default)
  rMedGeo: number | null;       // geometric fallback
  gcnsDistPc: number | null;    // GCNS vetted distance (parsecs)
};
export function resolveStarDistancePc(d: StarDistanceInputs): number | null;
// 1) rMedPhotogeo  2) rMedGeo  3) gcnsDistPc  4) null (counted, logged drop)
```

The empty-string `r_med_*` from the paged CSV parses to `null` upstream, so a Gaia row
with no Bailer-Jones join resolves to `null` here — the ~0.76 % drop.

- [x] Add `resolveStarDistancePc.ts` with a didactic docblock (why photogeo is the
  default, why null is a drop not a zero).
- [x] Test `prefers photogeo, then geo, then GCNS` — three cases each exercising one
  branch winning over the others present (hand-set inputs, assert the chosen value).
- [x] Test `returns null when no distance is available` — all three `null` → `null`.
- [x] `npm test -- resolveStarDistancePc` → green. Commit.

## Task 9 — Star selection + dedup set algebra (pure)

**Files:** `tools/stars/selectStars.ts` (new, one symbol),
`tests/tools/stars/selectStars.test.ts` (new).

**Contract (the §2 set formula, computed once):**
`stars = (gaiaSelected ∖ hipMatched) ∪ hipparcosBright ∖ famousStarSet`, where
`hipMatched` = the Gaia `source_id`s that a `Hpmag < 4.0` Hipparcos row cross-matches
via the `hip2_best_neighbour` HIP→source_id map, and `famousStarSet` = the non-null
values of `FAMOUS_STAR_GAIA_IDS`.

```ts
type SelectStarsInputs = {
  gaia: readonly GaiaSelectedRow[];       // Gaia rows already G-sorted + distance-resolved
  hipparcosBright: readonly HipBrightRow[]; // hip2 rows with Hpmag < 4.0, distance-resolved
  hipToSourceId: ReadonlyMap<number, bigint>; // from hip2_best_neighbour (HIP → source_id)
  famousGaiaIds: ReadonlySet<bigint>;      // non-null FAMOUS_STAR_GAIA_IDS values
};
type SelectStarsResult = {
  stars: StarInput[];       // merged, dedup'd (unpacked position + absMag + bpRp, pre-quantization)
  drops: {
    noBailerJones: number;  // Gaia rows with no resolvable distance (the ~0.76 %)
    hipNonPositivePlx: number; // Hipparcos bright rows dropped for Plx ≤ 0
    famousSubtracted: number;  // rows removed because they matched a FamousStar id
    hipGaiaSubtracted: number; // Gaia rows removed because a bright Hipparcos row wins
  };
};
export function selectStars(inputs: SelectStarsInputs): SelectStarsResult;
```

`StarInput` (tool-local) carries the pre-quantization fields the octree/pack stages
need: heliocentric position (parsecs, from `raDecDistToCartesian`), `absMag`, `bpRp`.
The `HIP < 4.0` cut and the Bailer-Jones/non-positive-plx drops are applied by the
callers that build `gaia` / `hipparcosBright` (Tasks 6, 8, 11); `selectStars` owns the
**set algebra + subtraction counters** only — keep the concerns un-braided.

- [x] Add `selectStars.ts` with a didactic docblock stating the set formula and why the
  subtraction happens once in the encoder (downstream never sees a duplicate).
- [x] Test `subtracts Hipparcos-matched Gaia rows` — a Gaia row whose `source_id` is in
  `hipToSourceId` is removed; the Hipparcos bright row replaces it; `hipGaiaSubtracted`
  counts it.
- [x] Test `subtracts famous-star Gaia rows` — a Gaia row in `famousGaiaIds` is removed;
  `famousSubtracted` counts it. A famous id that is `null` (absent from Gaia) subtracts
  nothing.
- [x] Test `unions Hipparcos-bright rows that Gaia lacks` — a bright Hipparcos row with
  no Gaia match appears in `stars`.
- [x] Test `a Hipparcos-bright row that is ALSO a famous star is subtracted` — exercises
  the `∖ famousStarSet` applying to the union, not just to `gaiaSelected` (the formula's
  outer subtraction).
- [x] `npm test -- selectStars` → green. Commit.

## Task 10 — Flux-mip aggregate math + octree assembly (pure)

**Files:** `tools/stars/mergeFluxAggregate.ts` (new, one symbol),
`tools/stars/buildStarOctree.ts` (new, one symbol),
`tests/tools/stars/mergeFluxAggregate.test.ts` + `buildStarOctree.test.ts` (new).

**`mergeFluxAggregate` (spec §3 aggregate rules):** flux-merge of ≤8 children →
position = **flux-weighted centroid**, `absMag` = magnitude of the **summed flux**,
`bpRp` = **flux-weighted mean colour**. Flux from absolute magnitude via the standard
`f ∝ 10^(−0.4·absMag)` relation (implementer picks a consistent zero-point; only ratios
matter for weighting + the sum→magnitude inverse).

```ts
type FluxNode = { position: Vec3; absMag: number; bpRp: number };
export function mergeFluxAggregate(children: readonly FluxNode[]): FluxNode;
```

**`buildStarOctree`:** given Morton-sorted leaf stars + the grid params, produce the
`{ nodes, records }` pair (leaf nodes + aggregate nodes with `level`/`childMask`,
records packed via `packStarRecord`, positions quantized to in-cell offsets via the LUT
constants). Signature is the implementer's to shape from the encode needs, but it MUST
emit a structure that satisfies `StarCatalog` (nodes reference records; aggregate nodes
carry `recordCount: 1`; Morton order preserved). Reuse `mortonEncode3`/`mortonDecode3`.

- [x] Add `mergeFluxAggregate.ts` with a didactic docblock (why flux-weighting, not
  magnitude-averaging — magnitudes are logarithmic so averaging them is wrong).
- [x] Test `sums flux to a brighter magnitude` — two equal-magnitude children merge to a
  magnitude exactly `2.5·log10(2)` (≈0.753) brighter (**hand-computed** from the flux
  sum). This fails on a magnitude-average bug; a mirror would not.
- [x] Test `centroid and colour are flux-weighted` — a bright child and a faint child at
  different positions/colours → the aggregate position + `bpRp` sit near the bright one,
  matching a hand-computed weighted mean (not the arithmetic mean).
- [x] Test (`buildStarOctree`) `builds nodes over a handful of synthetic stars` — a few
  stars in two adjacent cells → assert leaf node count, that aggregate nodes carry
  `recordCount === 1` and `level > 0`, that Morton order is non-decreasing across leaf
  nodes, and that the emitted `{ nodes, records }` round-trips through
  `encodeStarCatalog`/`decodeStarCatalog` (ties the assembly to the format contract
  without restating byte offsets).
- [x] `npm test -- mergeFluxAggregate buildStarOctree` → green. Commit.

## Task 11 — `buildStars.ts` orchestration + `build-stars` script + per-tier logging

**Files:** `tools/stars/buildStars.ts` (new), `package.json` (modify — add
`"build-stars": "tsx tools/stars/buildStars.ts"`, mirroring `build-mcpm`/`build-all`),
`tests/tools/stars/buildStars.test.ts` (new — over the composed pure stages on a small
synthetic in-memory fixture; **no real data, no network, no file I/O in the test**).

**Orchestration (composes Tasks 2–10; structural twin of `buildAllBins.ts`'s CF4-patch
+ per-tier write loop, `buildAllBins.ts:576-795`):**

1. Stream-parse the paged Gaia CSVs (`gaia.dir`), GCNS (`gaia.gcns`), the HIP→source_id
   xmatch (`gaia.hip-xmatch`), and `hip2.dat` (Task 6). Follow the streaming idiom for
   the large paged set (`loadGladeStream`, `buildAllBins.ts:429-485`) — the Gaia superset
   is far too large for a single `readFileSync` string.
2. Build `gaia` rows: G-sort, resolve distance (Task 8), position via
   `raDecDistToCartesian(raDeg, decDeg, distPc)` **in parsecs** (the function is
   unit-agnostic; the grid is parsec-based per the header's `cellEdgePc`/`gridOrigin`,
   and the direction/frame matches `SCENE_STARS` — `sceneBodies.ts:103`). GCNS rows join
   the Gaia set with their vetted `dist_50` + `phot_bp_mean_mag − phot_rp_mean_mag`.
3. Build `hipparcosBright`: `Hpmag < 4.0` (Resolved item #1), position from RArad/DErad +
   Plx→distance, `bpRp = bvToBpRp(bv)` (Task 3).
4. `selectStars` (Task 9) with `famousGaiaIds` from the non-null
   `FAMOUS_STAR_GAIA_IDS` values (Task 7).
5. Morton-sort the merged stars; derive `gridOrigin` / `cellEdgePc` / `mortonBitsPerAxis`
   (≈9 → 512³) from the population bounds.
6. **Per tier** (`small`/`medium`/`large`): truncate the G-sorted superset at the record
   count whose **measured compressed size** hits ≤ the 10 / 30 / 75 MB budget
   (Resolved item #6 — truncate, never re-fetch); the GCNS supplement rides every tier;
   build the octree flux mip (Task 10) over the tier's stars; `encodeStarCatalog` (which
   packs + compresses); write `public/data/stars-<tier>.bin`.
7. **Codec ratio gate (deferred from Task 1(b)):** if `STAR_BIN_CODEC === 'gzip'`,
   measure each tier's real compressed size against its budget. If any tier misses by
   **>20 %**, **STOP and report to the user** (escalation to zstd-wasm is user-gated,
   not a silent swap).

**Per-tier log line (spec §4 — the operator's eyes-on signal):** star count, G cut
reached, raw vs compressed bytes, and every drop/clamp counter —
`noBailerJones`, `hipNonPositivePlx`, `famousSubtracted`, `hipGaiaSubtracted`, and the
absMag / colorIdx counted-clamp totals from the quantizers (Task 4). Mirror the
`process.stderr.write(... .toLocaleString() ...)` reporting style of
`buildAllBins.ts:299-346, 745-793`.

**Testability:** keep `buildStars.ts` a thin composition so the test exercises the
**pure stages wired together** on a tiny hand-built in-memory fixture (a few Gaia rows,
one GCNS row, one Hipparcos-bright row, one famous match) — assert the resulting
`StarCatalog` round-trips and the drop counters are correct. The CSV/dat I/O + the
per-tier file write are driven only by the CLI entry (guarded by the
`import.meta.url === argv[1]` idiom, `buildAllBins.ts:803-812`), NOT by the test.

- [x] Add `buildStars.ts` composing the pure stages; guard the CLI entry so importing
  the module for the test doesn't run it or touch the filesystem.
- [x] Add the `build-stars` script to `package.json`.
- [x] Test `produces a round-trippable catalog from a synthetic fixture` — feed the
  in-memory stages a handful of rows; assert `decodeStarCatalog(encodeStarCatalog(cat))`
  matches and the star count is the expected post-dedup number.
- [x] Test `reports the drop counters` — the synthetic fixture includes one no-BJ Gaia
  row, one non-positive-plx Hipparcos row, one famous match, and one Hipparcos-wins
  subtraction; assert each counter equals its hand-counted value.
- [x] **Real-data build (logged-assertion task, NOT a vitest):** run `npm run build-stars`
  against plan-01 data; confirm the three `.bin` files appear, the per-tier logs show
  each budget met (Resolved item #6), the counted-clamp totals are near-zero (else
  retune the LUT endpoints in Task 4's constants), and the codec ratio gate passes.
  (Done via the Rust port of this pipeline — PR #443 — which built all three tiers
  from the real plan-01 data within their gzip budgets: 9.99/29.99/74.99 MB,
  large tier 12.85M stars; rebuild verified byte-identical to the shipping bins.
  T13's visual bring-up ran against exactly these bins.)
- [x] `npm test -- buildStars` → green. Commit.

## Task 12 — Pipeline docs + `add-data-source` skill refresh

**Files:** `README.md` (modify — repo root), `.claude/skills/add-data-source/SKILL.md`
(modify). Docs only — no code, no tests. Per plan-style: no implementation bodies;
this task's acceptance criteria are the named anchors below.

**Scope guard (the docs/skill split in the Goal section):** plan 01 (written in
parallel) owns the ATTRIBUTIONS.md entries and the README raw-data *download* table
rows — do NOT duplicate those here. This task covers the **build-step** docs only.
The user-facing functionality blurb (what the layer looks like on screen) is plan
03's, written when the layer actually renders — do NOT add one here.

**1. `README.md` — the star-bin build step.** Extend the data-pipeline documentation
with the star-bin build, alongside where the sibling build steps are documented
(`npm run build-all` under "### 2. Build the binary files", `README.md:136-148`;
`npm run build-mcpm` under "## Cosmic-web volumes", `README.md:370-451` — pick the
placement that reads most naturally, likely a short subsection following the volumes'
shape). Must name the exact script + input/output paths:

- `npm run build-stars` — consumes the fetched inputs in `data/raw/gaia/`
  (paged Gaia CSVs, `gcns_main.csv`, `hip2.dat`, `hip2_best_neighbour.csv`),
  emits `public/data/stars-{small,medium,large}.bin`.

Keep the README's existing voice (short imperative subsections, fenced command
blocks). No functionality blurb.

**2. `.claude/skills/add-data-source/SKILL.md` — pipeline edit surface.** Read the
skill file first and match its existing structure (Path A is the survey-catalog
checklist, `SKILL.md:56-70`) — this is a **surgical addition, not a rewrite**. Add
the star-catalog pipeline surface introduced by plans 01+02 as a third precedent
path (or a Path A sidebar — implementer's call, whichever fits the file's structure):

- the `gaia.*` `rawDataRegistry.ts` keys pattern — a TAP-paged fetch with an
  on-disk resume cache, `rawDataPath('gaia.dir')` + per-artifact keys;
- the `src/data/starCatalog/` format-module precedent — cell-quantized +
  compressed, a *distinct* format family from `galaxyCatalogFormat.ts`;
- the build entry `tools/stars/buildStars.ts` (`npm run build-stars`);
- the `tools/deploy/syncR2.ts` `ALLOW` extension step;
- an ATTRIBUTIONS.md checklist item (the entries themselves are plan 01's).

Note **inside the skill edit** that the runtime surface (the `starCatalog`
`SOURCE_REGISTRY` variant, loader, renderer) lands with plan 03 and the skill gets
a second pass then.

- [x] Extend `README.md` with the build-step docs — names `npm run build-stars`,
  `data/raw/gaia/` inputs, and the `public/data/stars-{small,medium,large}.bin`
  outputs. No download-table rows, no ATTRIBUTIONS edits, no functionality blurb.
- [x] Update `.claude/skills/add-data-source/SKILL.md` with the five pipeline-surface
  points above + the plan-03 second-pass note, matching the file's structure.
- [x] Grep-verify the skill edit: confirm `rawDataPath('gaia.` and `build-stars`
  both appear in `.claude/skills/add-data-source/SKILL.md` (use the Grep tool).
- [x] Commit (docs only — no test run needed beyond the final gate in Task 13).

## Task 13 — Extend the R2 `ALLOW` filter (final gate)

**Files:** `tools/deploy/syncR2.ts` (modify — extend `ALLOW`, `syncR2.ts:109-156`),
`tests/tools/deploy/syncR2.test.ts` (modify — the ALLOW test that already imports `ALLOW`).

**Change:** add `|| /^stars-(small|medium|large)\.bin$/.test(name)` to the `ALLOW`
predicate with a didactic comment (the star bins are tiered gitignored build artefacts,
shipped only via R2 — same rationale as the `sdss|glade` tier pattern immediately above).

- [x] Add the `stars-<tier>.bin` clause to `ALLOW` with a comment.
- [x] Test `ALLOW accepts stars-{small,medium,large}.bin and rejects stars-huge.bin` —
  the three valid names pass, an out-of-set tier name fails (an independent behavioural
  check of the regex, not a restatement of the filter list).
- [x] **Final gate:** `npm run typecheck` (both src + tools tsconfigs) + full `npm test`
  → green. Commit.

---

## Self-review checklist (before marking the plan done)

- Every in-scope spec requirement maps to a task: §2 selection → Tasks 7–9; §2 position
  → Task 8; §2 dedup → Task 9; §3 format (header/node/record byte tables + mip + codec +
  Morton) → Tasks 1, 2, 4, 5, 10; §4 build step + logging → Task 11; §5 tiers → Task 11;
  build-step docs + skill pipeline surface → Task 12 (per the docs/skill split in the
  Goal section); §4 R2 ALLOW → Task 13. Decode side (plan 03's consumer) → Task 5.
- The three byte tables (header 64 B, node 16 B, record 6 B) match spec §3 exactly;
  spare-bit decision pinned (5 bits reserved, zeroed, v1); LUT ranges are named constants
  in the format module with a counted-clamp assertion.
- Names/signatures plan 03 imports are pinned in the Interfaces section and reused
  verbatim across tasks: `StarCatalog`, `StarCatalogNode`, `encodeStarCatalog`,
  `decodeStarCatalog`, `emptyStarCatalog`, `mortonEncode3`, `mortonDecode3`.
- No test needs real fetched data or the network (real-data verification is the logged
  Task 11 build step); no test restates a byte-table constant back at itself; no mirror
  tests (flux-sum, Morton bit patterns, parser bytes all use hand-computed expectations).
- No implementation bodies pasted; existing code cited by `path:line`.
