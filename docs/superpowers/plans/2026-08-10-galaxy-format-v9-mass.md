# Galaxy Catalog Format v9 (Pre-Baked Stellar Masses) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Every galaxy record carries a build-time `log10StellarMass` estimate in an aligned, flag-packed 64-byte v9 record; a version mismatch fails once with a user-legible splash; and every binary family's data lives under a version-epoch folder — with content-hashed filenames behind a boot-fetched manifest — so code and bins can never pair across a bump, and a same-version rebuild reaches the browser immediately instead of a day later.

**Architecture:** A `GALAXY_CATALOG_FIELD_SPECS` table in `galaxyCatalogFormat.ts` becomes the single declaration of the record layout and drives encode, decode, `emptyGalaxyCatalog`, and the worker transfer clone (prep, at v8). v9 then re-cuts the tail — two flag bytes collapse into one bit-packed byte at 54, `spectroscopicZ` moves to the aligned 56, `log10StellarMass` takes 60 — with the decoder re-expanding the flag bits into the two `Uint8Array` columns consumers already read. Masses come from one pure `tools/catalog/estimateLog10StellarMass.ts` dispatching on `ParsedRecord.source`. Separately, `decodeGalaxyCatalog` throws a typed `FormatVersionError` that the retry policy refuses to retry and the splash renders as "Skymap was updated — reload"; and each format module exports an epoch prefix (`galaxy-catalog/v9`, …) derived from its own `VERSION`, which fetchers, builders and the R2 sweep all read. The epoch buys compatibility, not freshness, so on top of it a language-agnostic post-pass (`tools/deploy/buildDataManifest.ts`) renames every tracked file to carry an 8-hex SHA-256 content infix and writes `public/data/manifest.json` last; the browser fetches that manifest once at boot and `dataUrl()` resolves logical → hashed, so a rebuilt file propagates immediately while unchanged bytes cache for a year.

**Tech Stack:** TypeScript, Vitest, Rust (the `tools/stars-rs` star builder), Node build scripts under `tools/`.

**Spec:** [`docs/superpowers/specs/2026-08-10-galaxy-format-v9-mass.md`](../specs/2026-08-10-galaxy-format-v9-mass.md)

## Global Constraints

- `type` aliases, never `interface`. One exported function per file in `src/utils/` and `tools/utils/`; one type per file in `src/@types/`; filename = symbol name; deep relative imports, no barrels.
- Comment budget: module header ≤ 10 lines, comment lines ≤ half the file's code lines. Comments record _why_ — a unit, a landmine, a cross-file contract — never _what_.
- Any file move or rename goes through `npm run move-files -- <from> <to>` (or `npm run refactor -- move <from> <to>`), never `git mv` plus hand-edited imports. No task in this plan is expected to move a file.
- Tests must be able to fail on a real bug no other test or compiler check catches. No runtime type tests, no constant/registry restatements, no mirror tests that re-derive the expected value with the code under test. On-disk byte-layout assertions are explicitly load-bearing and stay.
- Record stride stays **64 bytes**; file size stays `16 + count × 64`. Any change to the stride is a defect.
- `NaN` is the format's "absent" sentinel for `log10StellarMass` — never a fabricated default. Unit is log₁₀(M★/M☉) (dimensionless log), NOT the structure catalog's linear 10¹⁴ M☉ `significance`.
- From Task 11 on, `public/data/` holds **content-hashed** names in every environment — dev server, tools and R2 share one regime. The logical name is what code says; the hashed name is what the filesystem holds. Never hard-code or reconstruct a hashed name: resolve through the manifest (`resolveDataPath` in the browser, `resolveDataFile` in tools).
- `manifest.json` is written **last**, after every file it references. One manifest describes one coherent build; writing it earlier reintroduces the mixed-generation pairings (`famous.bin` against a newer `famous_galaxies_meta.json`, filaments against a catalog they were not traced from) it exists to prevent.
- The tracked set — which files get hashed, manifested and uploaded — is exactly what `allowDataFile` accepts. There is no second list.
- Stage specific paths in every commit; never `git add -A`. Format only the files you touched.
- `npm test` and `npm run typecheck` stay green at every commit.

**Execution note — where things can run.** This worktree has **no raw catalog data**: `data/raw/` holds only the committed `README.md` / `.sha256` sidecars (everything else is gitignored and exists only in the main checkout at `/Users/rulkens/Development/js/skymap`). `npm run build-tiers` therefore **cannot run here** — see Task 16. The main checkout's built v8 bins at `/Users/rulkens/Development/js/skymap/public/data/*.bin` are readable from here by absolute path, which Tasks 1 and 2 use for a decode-timing check and Task 7 uses for a manual splash check.

---

### Task 1: `GALAXY_CATALOG_FIELD_SPECS` drives encode + decode (prep, still v8)

The record layout is restated in ~10 places and `galaxyCatalogTransfer.ts:25-30` falsely claims to be the only one. This task makes one table the single declaration of the layout and drives the two hot paths from it. **Behaviour-neutral at v8** — the existing round-trip suite is the proof, and no test's expected value may change.

**Files:**

- Create: `src/@types/data/galaxyCatalog/GalaxyCatalogColumn.d.ts`
- Create: `src/@types/data/galaxyCatalog/GalaxyCatalogFieldSpec.d.ts`
- Modify: `src/data/galaxyCatalog/galaxyCatalogFormat.ts` (whole file: header, table, `encodeGalaxyCatalog`, `decodeGalaxyCatalog`)
- Test: `tests/data/galaxyCatalog/galaxyCatalogFormat.test.ts` (must pass unmodified)

**Interfaces:**

- Produces:

```ts
// GalaxyCatalogColumn.d.ts — every typed-array column of GalaxyCatalog.
export type GalaxyCatalogColumn = Exclude<keyof GalaxyCatalog, 'count' | 'medianAbsMag'>;

// GalaxyCatalogFieldSpec.d.ts — one column's in-memory view + its place on disk.
export type GalaxyCatalogFieldSpec = {
  readonly column: 'u64' | 'f32' | 'u8';
  readonly components: 1 | 3;
  readonly disk: { readonly kind: 'field'; readonly offset: number };
};

// galaxyCatalogFormat.ts
export const GALAXY_CATALOG_FIELD_SPECS: Readonly<
  Record<GalaxyCatalogColumn, GalaxyCatalogFieldSpec>
>;
```

The table is declared `as const satisfies Readonly<Record<GalaxyCatalogColumn, GalaxyCatalogFieldSpec>>` so **adding a column to `GalaxyCatalog` without a spec is a typecheck error**. That exhaustiveness is a compile-time fact — do NOT add a runtime test that restates the field list (`testing.md`, "no constant/registry restatements").

- `disk.kind` is a one-member union today. Task 3 adds a `'flagBit'` member; leaving the discriminant in place now is what makes that a growth rather than a rewrite. Do not add `'flagBit'` in this task.
- `components: 3` occurs exactly once (`positions`, interleaved xyz); every other column is `1`.

**v8 offsets for the table** (unchanged from the file's current header — copy them, don't re-derive):

| column                   | offset | column                       | offset |
| ------------------------ | ------ | ---------------------------- | ------ |
| `objIDs` (u64)           | 0      | `diameterKpc` (f32)          | 48     |
| `positions` (f32×3)      | 8      | `classByte` (u8)             | 52     |
| `magU` (f32)             | 20     | `parentSurveyByte` (u8)      | 53     |
| `magG` (f32)             | 24     | `spectroscopicZ` (f32)       | 54     |
| `magR` (f32)             | 28     | `orientationIsFallback` (u8) | 58     |
| `magI` (f32)             | 32     | `diameterIsFallback` (u8)    | 59     |
| `magZ` (f32)             | 36     |                              |        |
| `axisRatio` (f32)        | 40     |                              |        |
| `positionAngleDeg` (f32) | 44     |                              |        |

**Hot-loop constraint:** build the per-kind work lists **once per call, before the record loop**. Encode/decode run over up to 2.5 M records; a `switch (spec.disk.kind)` inside the per-record body would pay 15 branches per record. Prepare arrays like `[targetArray, floatSlotWithinRecord]` outside the loop and index them inside. `spectroscopicZ` at offset 54 is not 4-aligned within the record and must keep the `DataView.getFloat32` / `setFloat32` path; every other f32 keeps the `Float32Array` overlay.

**Error-message contract:** the per-field length checks must keep emitting `"<column> length mismatch"` verbatim — two existing tests match `/orientationIsFallback length mismatch/` and `/diameterKpc length mismatch/`, and both must still pass.

- [ ] Write `/private/tmp/claude-501/-Users-rulkens-Development-js-skymap/224c603a-65f2-413c-8bfa-65d52a970da8/scratchpad/decodeTiming.ts`: read `/Users/rulkens/Development/js/skymap/public/data/glade-large.bin` (v8, ~128 MB, 2 M records), `decodeGalaxyCatalog` it three times, print the best wall-clock ms. Run it with `npx tsx <path>` and record the baseline number in the task notes.
- [ ] Add the two `.d.ts` type files.
- [ ] Add `GALAXY_CATALOG_FIELD_SPECS` with a one-line doc per entry recording what the column is and its unit where non-obvious. The v8 rationale currently in the module header (why the two provenance bytes are persisted rather than reconstructed) moves onto those two entries.
- [ ] Trim the module header to ≤ 10 lines: what the file is, the stride, and a pointer to the table + the spec. The 50-line offset diagram is replaced by the table.
- [ ] Rewrite `encodeGalaxyCatalog` and `decodeGalaxyCatalog` to derive their allocations, offsets and views from the table, honouring the hot-loop constraint above.
- [ ] `npm test -- galaxyCatalog` → GREEN with **zero test edits**. If any assertion needs changing, the refactor changed behaviour: stop and find out why.
- [ ] `npm run typecheck` → GREEN.
- [ ] Re-run the timing script. Expect within +25 % of the baseline; if it is slower, the per-record loop is still branching on the table — fix it before committing.
- [ ] Commit `src/@types/data/galaxyCatalog/GalaxyCatalogColumn.d.ts`, `src/@types/data/galaxyCatalog/GalaxyCatalogFieldSpec.d.ts`, `src/data/galaxyCatalog/galaxyCatalogFormat.ts`.

---

### Task 2: the table drives `emptyGalaxyCatalog` + the worker transfer clone (prep, still v8)

Two more restatements of the field list collapse. Still behaviour-neutral at v8.

**Files:**

- Modify: `src/data/galaxyCatalog/galaxyCatalogFormat.ts` (`emptyGalaxyCatalog`)
- Modify: `src/data/galaxyCatalog/galaxyCatalogTransfer.ts` (whole file)
- Test: `tests/data/galaxyCatalog/galaxyCatalogTransfer.test.ts`

**Interfaces:**

- Consumes: `GALAXY_CATALOG_FIELD_SPECS`, `GalaxyCatalogColumn` (Task 1).
- Produces: no signature change. `cloneGalaxyCatalogForTransfer(catalog: GalaxyCatalog): ClonedGalaxyCatalog` keeps its contract: `copy` is a structurally complete `GalaxyCatalog` with fresh buffers, `transfer` lists the copy's buffers in field-spec order. `medianAbsMag` is a scalar and rides by value — it is not in the table and gets no transfer entry.

**The count assertion must go.** `galaxyCatalogTransfer.test.ts:114-126` asserts `transfer.length === 15`. v9 adds `log10StellarMass` and folds two flag columns into one disk byte — but the two flag columns stay in memory, so the in-memory column count goes 15 → 16 and a naive count assertion would still catch that. The real hazard is a **stale count** in a test whose docblock advertises it as the guard against dropped fields. Replace it with an assertion that names the offending column when it fails, derived from the **copy object**, not from the field-spec table (deriving from the table would be a mirror test — it would pass while both table and clone were wrong together; deriving from `copy` cannot, because `copy` is typed as `GalaxyCatalog` and the compiler proves it complete).

- [ ] Replace the two `transfer.length` assertions with one test named `transfers exactly one buffer per typed-array column of the copy, in field order`:
      map each entry of `transfer` back to the `copy` key that owns that buffer, and assert the resulting **string array** equals the list of `copy` keys whose values are typed-array views (`ArrayBuffer.isView`), in `Object.keys` order. A dropped column fails with its name in the diff; a duplicated or foreign buffer fails too.
- [ ] Keep the existing "new underlying buffers", "preserves values", "transfer points to COPY buffers" and "count = 0" tests; the last one loses only its `transfer.length` line.
- [ ] `npm test -- galaxyCatalogTransfer` → GREEN. This step swaps one assertion for a stronger one rather than driving new behaviour: the clone is already correct at v8, and the new assertion's job starts at Task 3, where the column set changes under it. If it goes red now, the clone is dropping a column today — investigate before continuing.
- [ ] Drive `cloneGalaxyCatalogForTransfer`'s `copy` construction and `transfer` list from the table (view constructor chosen by `spec.column`).
- [ ] Drive `emptyGalaxyCatalog`'s typed-array allocations from the table. `count: 0` and `medianAbsMag: -20.5` (the count-0 sentinel `galaxyMedianAbsMag` returns) stay written by hand — they are not columns.
- [ ] Rewrite the `galaxyCatalogTransfer.ts` header: it may now truthfully claim single ownership of the transfer ceremony, and must point at `GALAXY_CATALOG_FIELD_SPECS` as the field list's owner. Keep it ≤ 10 lines; the BigUint64Array-is-not-Transferable note is load-bearing and stays.
- [ ] `npm test -- galaxyCatalog` → GREEN (both format and transfer suites, no other edits).
- [ ] `npm run typecheck` → GREEN.
- [ ] Re-run the Task 1 timing script → still within +25 % of the recorded baseline.
- [ ] Commit `src/data/galaxyCatalog/galaxyCatalogFormat.ts`, `src/data/galaxyCatalog/galaxyCatalogTransfer.ts`, `tests/data/galaxyCatalog/galaxyCatalogTransfer.test.ts`.

---

### Task 3: v9 record layout — one flags byte, aligned tail, `log10StellarMass`

The bump itself. Masses are all `NaN` after this task; Task 5 fills them.

**Files:**

- Modify: `src/data/galaxyCatalog/galaxyCatalogFormat.ts` (`VERSION`, table, encode/decode flag handling)
- Modify: `src/@types/data/galaxyCatalog/GalaxyCatalogFieldSpec.d.ts` (add the `flagBit` disk variant)
- Modify: `src/@types/data/galaxyCatalog/GalaxyCatalog.d.ts` (add `log10StellarMass`)
- Modify: `src/data/galaxyCatalog/synthetic.ts:189-215`, `tools/catalog/buildAllBins.ts:139-156`, `tools/famous/buildFamous.ts:137-159`, `tests/fixtures/makeGalaxyCatalog.ts` (each gains one column, NaN-filled)
- Test: `tests/data/galaxyCatalog/galaxyCatalogFormat.test.ts`

**Interfaces:**

- Consumes: `GALAXY_CATALOG_FIELD_SPECS` (Task 1).
- Produces:

```ts
// GalaxyCatalogFieldSpec.d.ts — disk placement grows a second variant.
readonly disk:
  | { readonly kind: 'field'; readonly offset: number }
  | { readonly kind: 'flagBit'; readonly offset: number; readonly bit: number };

// GalaxyCatalog.d.ts
/** log₁₀(M★/M☉); NaN = no estimate. Photometric, build-time. */
log10StellarMass: Float32Array;
```

**v9 record layout (64 B stride, header unchanged: `SKMP`, version = 9, count, reserved):**

| offset | size | type   | field                                                                               | change vs v8                 |
| ------ | ---- | ------ | ----------------------------------------------------------------------------------- | ---------------------------- |
| 0      | 8    | uint64 | `objID`                                                                             | —                            |
| 8      | 12   | 3×f32  | `x`,`y`,`z`                                                                         | —                            |
| 20     | 20   | 5×f32  | `magU`…`magZ`                                                                       | —                            |
| 40     | 4    | f32    | `axisRatio`                                                                         | —                            |
| 44     | 4    | f32    | `positionAngleDeg`                                                                  | —                            |
| 48     | 4    | f32    | `diameterKpc`                                                                       | —                            |
| 52     | 1    | u8     | `classByte`                                                                         | —                            |
| 53     | 1    | u8     | `parentSurveyByte`                                                                  | —                            |
| 54     | 1    | u8     | flags: bit 0 orientation-fallback, bit 1 diameter-fallback, bit 2 mass-is-estimated | was 2 bytes at 58/59         |
| 55     | 1    | —      | reserved, zeroed                                                                    | new                          |
| 56     | 4    | f32    | `spectroscopicZ`                                                                    | moved from 54, now 4-aligned |
| 60     | 4    | f32    | `log10StellarMass`                                                                  | new                          |

- `orientationIsFallback` → `{ kind: 'flagBit', offset: 54, bit: 0 }`; `diameterIsFallback` → `bit: 1`. Both stay `Uint8Array` columns in memory, so `buildPointInterleavedBuffer.ts:229/301`, `provenanceAxes.ts:38/46` and the InfoCard chips are untouched.
- **Bit 2 is derived, not a column.** Every v9 mass is a photometric estimate (spec non-goal: no measured masses yet), so the encoder sets bit 2 iff `Number.isFinite(log10StellarMass[i])`. Do NOT add a 16th in-memory column for it. The decoder ignores bit 2 — mass presence is already carried by the NaN. Document that on the mass field-spec entry: when NSA-measured masses land, bit 2 becomes a real column and this derivation is what changes.
- With every f32 now at a 4-aligned record offset, `spectroscopicZ` joins the `Float32Array` overlay path; the `DataView` special case from v8 disappears.
- Byte 55 stays zero for free (`new ArrayBuffer` zero-inits) — no write.

- [ ] Add the `flagBit` disk variant to `GalaxyCatalogFieldSpec`, and `log10StellarMass: Float32Array` to `GalaxyCatalog` with a doc noting the unit (log₁₀ M★/M☉), the NaN sentinel, and the contrast with `StructureCatalog.significance` (linear 10¹⁴ M☉) so nobody reads one as the other.
- [ ] Add the test `packs the three provenance bits into the flags byte at record offset 54`: build a 4-record catalog covering `(orientationIsFallback, diameterIsFallback) ∈ {0,1}²` with a finite mass, plus the same four with `NaN` mass; encode; read `new Uint8Array(buf)[16 + i*64 + 54]` and assert the eight expected values `0b100|…` (finite-mass rows carry bit 2, NaN rows don't); then decode and assert both `Uint8Array` columns come back unchanged.
- [ ] Add the test `writes spectroscopicZ at record offset 56 and log10StellarMass at 60`: encode one record with distinctive finite values and assert them via `new DataView(buf).getFloat32(16 + 56, true)` / `(16 + 60, true)`. This is the assertion that catches an encoder/decoder pair that agrees with itself at the wrong offsets.
- [ ] Add the test `round-trips log10StellarMass including the NaN absent sentinel` (finite value, negative value, NaN).
- [ ] Update the version-rejection tests: the "rejects v7" case becomes v8, and the loop becomes `[1, 2, 3, 4, 5, 6, 7, 8]`.
- [ ] `npm test -- galaxyCatalogFormat` → RED on the new cases.
- [ ] Set `VERSION = 9`, re-cut the table offsets per the layout above, and teach encode/decode the `flagBit` variant (OR the bits together into one byte write per record on encode; mask them back out on decode). Keep the flag work in the same prepared-list style as Task 1 — no per-record branch on `disk.kind`.
- [ ] Add `log10StellarMass: new Float32Array(count).fill(NaN)` to `synthetic.ts`, `recordsToCloud`, `buildFamous`'s cloud literal, and `makeGalaxyCatalog`. In the fixture, NaN (not the file's usual neutral zero) is deliberate: `0` would mean 1 M☉ **and** would set the estimated bit on every fixture row — record that in the fixture's docblock.
- [ ] `npm test && npm run typecheck` → GREEN. The existing round-trip and byte-length tests must pass untouched; `16 + count × 64` is unchanged.
- [ ] Commit the format module, the two type files, the four producer/fixture files, and the format test.

---

### Task 4: `estimateLog10StellarMass` — one pure per-source estimator

Build-side only; no runtime consumer. Pure function, one file, unit-tested per source branch.

**Files:**

- Create: `tools/catalog/estimateLog10StellarMass.ts`
- Test: `tests/catalog/estimateLog10StellarMass.test.ts`

**Interfaces:**

- Consumes: `absoluteFromApparent(m: number, dMpc: number): number` from `src/utils/math/absoluteFromApparent.ts`; `Source` / `SourceType`.
- Produces:

```ts
export type StellarMassEstimateInput = {
  readonly source: SourceType;
  readonly magU: number;
  readonly magG: number;
  readonly magR: number;
  readonly magI: number;
  readonly magZ: number;
  /** Adopted distance in Mpc — the one the record's baked position uses. */
  readonly distMpc: number;
};

/** log₁₀(M★/M☉), or NaN when this source/photometry can't yield one. */
export function estimateLog10StellarMass(input: StellarMassEstimateInput): number;
```

**Relations (pin these exact constants; they are the contract).** Every branch is `log₁₀M★ = log₁₀(M/L_λ) + 0.4·(M_λ,☉ − M_λ)` with `M_λ = absoluteFromApparent(m_λ, distMpc)`. Bell et al. 2003 Table 7 colour–M/L coefficients are published for a "diet Salpeter" IMF; we subtract **0.15 dex** to put the stored masses on a Kroupa/Chabrier scale, because the downstream Moster et al. 2013 stellar-to-halo conversion (future MCPM-export work) assumes that scale. Record that reason on the constant — it is exactly the kind of offset a later reader would "fix" away.

| source                | bands used             | M/L relation                                                               | solar abs. mag |
| --------------------- | ---------------------- | -------------------------------------------------------------------------- | -------------- |
| `Source.SDSS`         | `magG` = g, `magR` = r | `log₁₀(M/L_r) = −0.306 + 1.097·(g−r) − 0.15`, luminosity in r              | `M_r,☉ = 4.65` |
| `Source.TwoMRS`       | `magI` = 2MASS K_s     | flat `M/L_K = 0.6` (McGaugh & Schombert 2014)                              | `M_K,☉ = 3.27` |
| `Source.FamousGalaxy` | `magG` = B, `magR` = V | both finite: `log₁₀(M/L_B) = −0.942 + 1.737·(B−V) − 0.15`, luminosity in B | `M_B,☉ = 5.44` |
| ″                     | only B finite          | same relation with an assumed `(B−V) = 0.75`                               | `M_B,☉ = 5.44` |
| ″                     | only V finite          | `log₁₀(M/L_V) = −0.628 + 1.305·0.75 − 0.15`, luminosity in V               | `M_V,☉ = 4.81` |
| `Source.Glade`        | `magZ` = 2MASS K_s     | K finite: flat `M/L_K = 0.6`, as 2MRS                                      | `M_K,☉ = 3.27` |
| ″                     | only B (`magG`) finite | Bell B relation with an assumed `(B−V) = 0.75`                             | `M_B,☉ = 5.44` |

> **Amended 2026-08-11 (final-review C1).** The original table put GLADE on the B−V branch with FamousGalaxy — but GLADE's `magR` slot holds 2MASS **J** (`tools/parsers/glade.ts`), not V; GLADE has no V band, and B−J through the B−V coefficients inflated the median mass ~3 dex. GLADE now runs K-first (its `magZ` = 2MASS K) with the B fallback; FamousGalaxy alone keeps B−V, its `magR` being real V from the seed.
> | every other source (Milliquas, the three DESI patches, Synthetic, …) | — | — | returns `NaN` |

- NaN in → NaN out, always. A non-finite required magnitude, or `distMpc <= 0`, returns `NaN` — never a fabricated default. (`absoluteFromApparent` already returns NaN for `dMpc <= 0`; the arithmetic propagates, but assert it rather than assume it.)
- The assumed 0.75 colour in the single-band fallback is the dominant error term for those rows (~0.3 dex). Say so in one comment; it is why the fallback exists at all rather than a second relation.
- Dispatch on `input.source` with a `switch` or a lookup keyed by `Source` — no `if` chain that silently treats an unknown source as SDSS.

- [ ] Write the failing tests, each with a **hand-computed** expected value (the arithmetic is spelled out here so it is not re-derived from the implementation):
  - `SDSS uses the Bell g−r relation on the r-band luminosity` — `magG = 17.5, magR = 16.8, distMpc = 100` → `M_r = −18.2`, `log₁₀(M/L_r) = 0.3119` → **9.452** (3 dp, `toBeCloseTo(9.452, 2)`).
  - `2MRS uses the flat K-band M/L on the magI slot` — `magI = 10.0, distMpc = 50` → `M_K = −23.4949` → **10.484**.
  - `GLADE uses the Bell B−V relation when both bands are real` — `magG = 13.0, magR = 12.3, distMpc = 20` → `M_B = −18.5051`, `log₁₀(M/L_B) = 0.1239` → **9.702**.
  - `GLADE falls back to an assumed colour when only B is real` — same row with `magR = NaN`: finite result, and **not** equal to the both-bands value (assert `Number.isFinite` plus a `not.toBeCloseTo` against 9.702).
  - `famous galaxies use the GLADE B/V branch` — `Source.FamousGalaxy` with the GLADE row returns the same 9.702.
  - `quasar sources yield no stellar mass` — `Source.Milliquas` and `Source.DesiDeep` with fully finite photometry both return `NaN`.
  - `missing photometry propagates NaN` — SDSS row with `magR = NaN`; and a finite SDSS row with `distMpc = 0`.
- [ ] `npm test -- estimateLog10StellarMass` → RED (module not found).
- [ ] Implement against the table above.
- [ ] `npm test -- estimateLog10StellarMass && npm run typecheck` → GREEN.
- [ ] Commit `tools/catalog/estimateLog10StellarMass.ts`, `tests/catalog/estimateLog10StellarMass.test.ts`.

---

### Task 5: wire the estimator into `recordsToCloud` and `buildFamous`

**Files:**

- Modify: `tools/catalog/buildAllBins.ts` (`recordsToCloud`, the per-record loop at `:158-274`)
- Modify: `tools/famous/buildFamous.ts` (the per-entry loop at `:160-209`)
- Test: `tests/catalog/buildAllBins.stellarMass.test.ts` (new)

**Interfaces:**

- Consumes: `estimateLog10StellarMass(input: StellarMassEstimateInput): number` (Task 4); `GalaxyCatalog.log10StellarMass` (Task 3).
- Produces: nothing new — both builders fill an existing column.

**Distance is the adopted one.** In `recordsToCloud`, the estimator must be fed `Math.hypot(x, y, z)` computed from the position the loop just baked — the local-volume override, the blueshift path and the cz path all funnel through it. The diameter branch at `:246` already computes that hypot inside an `if`; hoist it to one `const adoptedDistMpc` above both uses rather than computing it twice. In `buildFamous`, the same quantity comes from the `entryToXyz(e)` result.

- [ ] Write the failing test file with three cases built from hand-made `ParsedRecord`s (`source`, `objID`, `ra`, `dec`, `z`, `spectroscopicZ`, the five mags, `axisRatio: null`, `positionAngleDeg: null`, `diameterKpc: null`, `classByte: 0`, `parentSurveyByte: 0`):
  - `an SDSS row gets a finite stellar mass consistent with its baked distance` — assert `Number.isFinite` and that the value equals `estimateLog10StellarMass` fed the same mags and `Math.hypot(...cloud.positions.slice(0,3))`. (This one is allowed to call the estimator: the property under test is the **wiring** — that `recordsToCloud` uses the adopted distance and the right mag slots — not the formula, which Task 4 pins independently.)
  - `a Milliquas row gets NaN` — `Number.isNaN(cloud.log10StellarMass[0])`.
  - `the mass-is-estimated bit rides the encoded flags byte` — encode the two-row cloud and assert bit 2 of `new Uint8Array(buf)[16 + i*64 + 54]` is set for the SDSS row and clear for the Milliquas row.
- [ ] `npm test -- stellarMass` → RED.
- [ ] Hoist `adoptedDistMpc` in `recordsToCloud`, call the estimator, assign the column.
- [ ] Do the same in `buildFamous` (source `Source.FamousGalaxy`), after the B/V/K photometry assignment so the estimator sees the filled mags.
- [ ] `npm test -- catalog && npm test -- famous && npm run typecheck` → GREEN (the existing `buildAllBins.milliquas` / `desiDeep` / `localVolumeOverride` smokes must stay green untouched).
- [ ] Commit `tools/catalog/buildAllBins.ts`, `tools/famous/buildFamous.ts`, `tests/catalog/buildAllBins.stellarMass.test.ts`.

---

### Task 6: `FormatVersionError` + the retry policy stops re-downloading it

Today a version mismatch is an anonymous `Error` thrown inside the fetcher, so `defaultRetryPolicy` treats it as a transient failure and re-downloads the file twice more — up to three ~100 MB fetches before the user sees anything.

**Files:**

- Create: `src/data/formatVersionError.ts`
- Modify: `src/data/galaxyCatalog/galaxyCatalogFormat.ts` (`decodeGalaxyCatalog`'s throw)
- Modify: `src/services/loading/retryPolicy.ts`
- Test: `tests/services/loading/retryPolicy.test.ts`, `tests/data/galaxyCatalog/galaxyCatalogFormat.test.ts`

**Interfaces:**

- Produces:

```ts
export class FormatVersionError extends Error {
  /** Which binary family — e.g. 'galaxy catalog'. */
  readonly format: string;
  readonly found: number;
  readonly expected: number;
  constructor(format: string, found: number, expected: number, message: string);
  // sets `this.name = 'FormatVersionError'` in the body, mirroring HttpError
  // (`fetchWithProgress.ts:35-44`) — a class-field initialiser for `name`
  // shadows Error's own property under `useDefineForClassFields`.
}
```

- Lives in `src/data/` (not `src/services/loading/`) because the throw sites are the format modules and `src/data` must not import from `src/services`. Only `galaxyCatalogFormat` throws it in this plan; the other four families keep their current plain `Error`s.
- **The message text does not change.** Keep `unsupported version: ${found} — please regenerate the .bin via "npm run build-tiers"`: `buildFilaments` and the four existing message-matching tests depend on it, and it stays the right message for tool-side callers. The user-legible copy is a presentation concern (Task 7), not a message rewrite.

- [ ] Add the test `rejects a stale version with a typed FormatVersionError carrying found/expected` in the format test: `expect(() => decodeGalaxyCatalog(v8Header)).toThrow(FormatVersionError)` plus a caught-error assertion on `.found === 8` and `.expected === 9`.
- [ ] Add the test `gives up immediately on a format-version mismatch (no re-download)` in the retry-policy test: `defaultRetryPolicy(0, new FormatVersionError('galaxy catalog', 8, 9, 'x'))` → `'give-up'`.
- [ ] `npm test -- retryPolicy galaxyCatalogFormat` → RED.
- [ ] Add the class; throw it from `decodeGalaxyCatalog`; add the `instanceof` branch to `defaultRetryPolicy` (after the `AbortError` check, before the `HttpError` branch) with a one-line note that a mismatch is deterministic — retrying re-downloads ~100 MB for the same answer.
- [ ] `npm test && npm run typecheck` → GREEN; the four existing regenerate-message assertions still pass.
- [ ] Commit `src/data/formatVersionError.ts`, `src/data/galaxyCatalog/galaxyCatalogFormat.ts`, `src/services/loading/retryPolicy.ts`, and the two test files.

---

### Task 7: a version mismatch reaches the user as "Skymap was updated — reload"

Today a galaxy-catalog slot error never becomes an engine error: `createSyntheticFallback` counts the slot as settled, arms the synthetic backstop, and the user gets a procedural cloud with no explanation. Two changes are needed and **both** are required — fixing only the splash mapping leaves the synthetic `ready` status overwriting the error a second later.

**Files:**

- Create: `src/services/engine/wiring/installFormatVersionAlert.ts`
- Modify: `src/services/engine/phases/wireSlots.ts` (call it), `src/services/engine/wiring/createSyntheticFallback.ts`
- Modify: `src/@types/engine/EngineStatus.d.ts`, `src/@types/splash/SplashError.d.ts`, `src/hooks/useSplash.ts:153-161`, `src/components/Splash/Splash.tsx:55,134-140`
- Test: `tests/services/engine/wiring/installFormatVersionAlert.test.ts` (new), `tests/hooks/useSplash.test.ts`

**Interfaces:**

- Consumes: `FormatVersionError` (Task 6); `AssetSlot` subscriptions; `engineStatusChanged`.
- Produces:

```ts
// EngineStatus.d.ts — the error variant gains a machine-readable cause.
| { kind: 'error'; message: string; cause?: 'format-version' }

// SplashError.d.ts — a third kind.
| { kind: 'data-version-mismatch'; message: string }

// installFormatVersionAlert.ts
export function installFormatVersionAlert(
  dispatch: (status: EngineStatus) => void,
  allSlots: ReadonlyMap<string, AssetSlot<unknown, unknown>>,
): void;
```

- `installFormatVersionAlert` mirrors `installSlotReadyWake` (same file, same shape, same `allSlots` rationale): subscribe every slot, and on a state of `kind: 'error'` whose `.error instanceof FormatVersionError` dispatch `{ kind: 'error', message: error.message, cause: 'format-version' }` **once** (guard with a module-local `alerted` flag per install — every family fails at the same time after a bump and one splash is enough).
- Call it in `wireSlots` **after** `installLoadProgress` (which is what populates `deps.allSlots`) and **before** `reevaluateDemand` (which is where loads start) — same window `installSlotReadyWake` already occupies.
- Discriminating on `status.cause` rather than re-sniffing the message string keeps this out of the `/webgpu/i` regex business. `useSplash` checks `cause` first, then falls through to the existing webgpu/catalog split.
- `Splash.tsx` now has three error kinds: replace the two-way ternary at `:136` with a `Record<SplashError['kind'], string>` copy table (the project's >2-way rule), and simplify `hardError` to `error !== null` — all three kinds render the error box + Reload. New copy, verbatim: **"Skymap was updated — reload the page to fetch matching data"**.
- In `createSyntheticFallback`, a `FormatVersionError` must **suppress** arming: track it in the per-slot subscriber and return early from `maybeArmSyntheticFallback`. A version mismatch is not "no data available", it is "this build cannot read this data" — falling back to a synthetic cloud hides exactly the failure we are trying to surface.

- [ ] Write `tests/services/engine/wiring/installFormatVersionAlert.test.ts` with a hand-rolled fake slot (`subscribe(fn)` storing the callback, plus a `emit(state)` helper — no real `AssetSlot`):
  - `dispatches a format-version error status when a slot fails to decode` — assert the dispatched payload equals `{ kind: 'error', message: <the error's message>, cause: 'format-version' }`.
  - `ignores non-version slot errors` — an `HttpError` state dispatches nothing.
  - `dispatches once even when every slot reports the same mismatch` — three slots emit; one dispatch.
- [ ] Add to `tests/hooks/useSplash.test.ts`: `returns error.kind=data-version-mismatch when the engine reports cause=format-version`, dispatching `engineStatusChanged({ kind: 'error', message: 'unsupported version: 8 …', cause: 'format-version' })` and asserting `{ kind: 'data-version-mismatch', message: … }`. The two existing webgpu / catalog-fetch cases must keep passing unchanged.
- [ ] `npm test -- installFormatVersionAlert useSplash` → RED.
- [ ] Implement: the two type widenings, the new wiring module + its `wireSlots` call, the `useSplash` branch, the `Splash.tsx` copy table + `hardError` simplification, and the `createSyntheticFallback` suppression.
- [ ] `npm test && npm run typecheck` → GREEN.
- [ ] Manual check (this is the one place the whole chain is observable): from this worktree run the `/link-data` skill (symlinks `public/data` at the main checkout's **v8** bins), start the dev server, load the page. Expect the splash to show "Skymap was updated — reload the page to fetch matching data" with a Reload button, exactly one request per catalog in the Network panel, and **no** synthetic cloud behind it. Remove the symlink afterwards.
- [ ] Commit the new wiring module + its test, `wireSlots.ts`, `createSyntheticFallback.ts`, the two `.d.ts` files, `useSplash.ts`, `Splash.tsx`, `useSplash.test.ts`.

---

### Task 8: per-family epoch prefixes, exported from the format modules and consumed by the fetchers

Stable URLs plus `max-age=86400` mean a browser can pair new code with 24 h of old bins. Each family gets a folder whose name carries its own format version, so that pairing becomes impossible.

**Files:**

- Modify: `src/data/galaxyCatalog/galaxyCatalogFormat.ts`, `src/data/starCatalog/starCatalogFormat.ts`, `src/data/structure/structureCatalogFormat.ts`, `src/data/volume/scalarFieldFormat.ts`, `src/data/filament/filamentBinaryFormat.ts`
- Modify: `src/data/tierTargets.ts:85-93` (`tierFilenameForSource`)
- Modify: `src/services/loading/fetchers/{starCatalogFetcher,structureCatalogFetcher,filamentFetcher,mcpmFetcher,cf4DensityFetcher,flowFieldFetcher}.ts`
- Test: `tests/data/tierTargets.test.ts`

**Interfaces:**

- Produces, one per format module, each a template literal over that module's own `VERSION` constant:

```ts
export const GALAXY_CATALOG_DATA_PREFIX = `galaxy-catalog/v${VERSION}`; // 'galaxy-catalog/v9'
export const STAR_CATALOG_DATA_PREFIX = `star-catalog/v${VERSION}`; //    'star-catalog/v1'
export const STRUCTURE_CATALOG_DATA_PREFIX = `structure-catalog/v${VERSION}`; // 'structure-catalog/v1'
export const SCALAR_FIELD_DATA_PREFIX = `scalar-field/v${VERSION}`; //    'scalar-field/v3'
export const FILAMENT_DATA_PREFIX = `filament/v${VERSION}`; //            'filament/v1'
```

- `tierFilenameForSource(source, tier)` now returns the **prefixed relative path** (`galaxy-catalog/v9/sdss-large.bin`, `galaxy-catalog/v9/2mrs.bin`). It is the single site both the browser fetcher and `buildAllBins` read, which is what keeps URL and disk layout from diverging. Update its docblock accordingly.
- `dataUrl()` (`fetchWithProgress.ts:24`) is unchanged **in this task** — it already joins `/data/` + whatever it is given. It grows manifest resolution in Task 12, and the cache-control regime changes in Task 14; the epoch alone fixes compatibility, not freshness, so `max-age=86400` is still what a rebuilt-but-same-version bin gets until then.
- Family → files (from the spec): galaxy-catalog = the survey/famous `.bin`s; star-catalog = `stars-{small,medium,large}.bin`; structure-catalog = `structures.ccat` **and** `structures_meta.json` (fetched as a pair, so they move together); scalar-field = `cf4_density.scfd`, `flowfield.scfd`, `mcpm-*.scfd`; filament = `filaments{,-small}.bin`.
- Loose JSON at the data root does **not** move: `famous_galaxies_meta.json`, `famous_stars_meta.json`, `constellations.json`, `pgc_aliases.json`. Their schemas evolve compatibly and they carry no version gate. Leave `famousGalaxiesMetaFetcher`, `famousStarsMetaFetcher`, `constellationsFetcher`, `pgcAliasFetcher`, `jsonFetcher` and the image/texture fetchers alone. (They are content-hashed from Task 11, but Task 12 puts the resolution inside `dataUrl`, so none of these fetchers is ever touched.)

- [ ] Update `tests/data/tierTargets.test.ts`'s six `tierFilenameForSource` expectations to the prefixed paths (`'galaxy-catalog/v9/sdss-small.bin'`, `'galaxy-catalog/v9/2mrs.bin'`, `'galaxy-catalog/v9/famous.bin'`, `'galaxy-catalog/v9/milliquas-medium.bin'`, …). Assert the literal string, not a computed one.
- [ ] `npm test -- tierTargets` → RED.
- [ ] Add the five prefix constants; each gets one comment line saying why the epoch is in the path (a CDN can never pair new code with old bytes) — the `images/earth-tiles/` `TILE_PREFIX` precedent.
- [ ] Prefix the six fetchers' filenames. In `structureCatalogFetcher`, both `CCAT_FILE` and `META_FILE` take the prefix.
- [ ] `npm test && npm run typecheck` → GREEN (the fetcher tests use `toContain` / an end-anchored regex and survive prefixing; if one asserts a whole URL, update it to the prefixed literal).
- [ ] Commit the five format modules, `tierTargets.ts`, the six fetchers, `tests/data/tierTargets.test.ts`.

---

### Task 9: the galaxy-family builders write and read under `galaxy-catalog/v9/`

**Files:**

- Modify: `tools/catalog/buildAllBins.ts:832-878` (the write loop)
- Modify: `tools/famous/buildFamous.ts:130-230` (the `famous.bin` write; the meta sidecar stays at the root)
- Modify: `tools/filaments/buildFilaments.ts:473-535` (input `.bin` reads + the version pre-check), `:181` and `:192` (default `--output`)
- Modify: `package.json` (`build-filaments-sdss`, `build-filaments-small` `--output` paths)
- Test: `tests/tools/buildFilaments.test.ts` (only if it asserts a path)

**Interfaces:**

- Consumes: `GALAXY_CATALOG_DATA_PREFIX`, `FILAMENT_DATA_PREFIX` (Task 8); `tierFilenameForSource` now returns a prefixed path (Task 8).

- Every write site must `mkdirSync(dirname(outPath), { recursive: true })` before `writeFileSync` — the epoch folder does not exist on a fresh checkout, and a missing-directory `ENOENT` two hours into a build is a bad way to find out.
- `buildAllBins`'s `resolve(outDir, filename)` needs no other change once `tierFilenameForSource` carries the prefix.
- `buildFilaments`'s `ALL_SOURCE_FILES` (`:473`) names the **un-tiered** `sdss.bin` / `2mrs.bin` / `glade.bin`. Only `2mrs.bin` is actually produced by the current pipeline (`sdss.bin` / `glade.bin` are pre-tier legacy artefacts, and `allowDataFile` deliberately keeps them out of R2) — that mismatch is **pre-existing and out of scope**. Prefix the read directory and change nothing else about the names. That split is also the pinned coverage boundary: `2mrs.bin` is tracked and gets hashed, `sdss.bin` / `glade.bin` stay logical-named local artefacts, so this read site becomes mixed and Task 13 gives it one resolver with an identity fallback.
- **Build-order guard (spec §Build-order):** after decoding each input `.bin`, `buildFilaments` must catch `FormatVersionError` and rethrow with a message naming the ordering rule — e.g. `` `${path} is format v${found}, this build reads v${expected} — run "npm run build-tiers" before "npm run build-filaments"` ``. Without it the operator gets a browser-flavoured "regenerate the .bin" string six hours into a DisPerSE run.

- [ ] Prefix the galaxy `.bin` read directory in `buildFilaments.readMergedPositions` and add the `FormatVersionError` catch + rethrow.
- [ ] Move the filament output default to `` `${FILAMENT_DATA_PREFIX}/filaments.bin` `` and update the two `--output` paths in `package.json` to the same folder.
- [ ] Add `mkdirSync(..., { recursive: true })` at the `buildAllBins`, `buildFamous` and `buildFilaments` write sites.
- [ ] Point `buildFamous`'s `famous.bin` write at the galaxy prefix; leave `famous_galaxies_meta.json` at the data root.
- [ ] Update the run-order/CLI docblocks in both `buildFilaments.ts` (`:1-50`) and `buildAllBins.ts` (`:1-12`) to the new paths — they name the old flat paths in prose.
- [ ] `npm test && npm run typecheck` → GREEN.
- [ ] Commit `tools/catalog/buildAllBins.ts`, `tools/famous/buildFamous.ts`, `tools/filaments/buildFilaments.ts`, `package.json`.

---

### Task 10: the star, structure, scalar-field builders write under their epoch folders

**Files:**

- Modify: `tools/stars/buildStars.ts:770-840`, `tools/stars-rs/src/main.rs:160-180`
- Modify: `tools/structures/buildStructures.ts:351,407-412`
- Modify: `tools/volumes/buildCf4Density.ts:224-230`, `tools/volumes/buildMcpmVolume.ts:198`, `tools/volumes/verifyCf4Scfd.ts:66`, `tools/flow/buildFlowField.ts:153`, `tools/flow/verifyFlowField.ts:181`
- Modify: `tools/flow-workbench/src/createFlowHarness.ts:63`

**Interfaces:**

- Consumes: `STAR_CATALOG_DATA_PREFIX`, `STRUCTURE_CATALOG_DATA_PREFIX`, `SCALAR_FIELD_DATA_PREFIX` (Task 8).

- The Rust builder cannot import the TS constant. It already duplicates the star format (`tools/stars-rs/src/format.rs:32`, `pub const VERSION: u32 = 1`), so derive the folder there the same way: `format!("star-catalog/v{}", format::VERSION)` joined onto `out_dir`. **`constellations.json` keeps writing to `out_dir` itself** — it is loose JSON at the data root, and it shares `out_dir` with the star bins in `main.rs`. Getting that wrong moves a file the runtime fetches from the root.
- Both `structures.ccat` and `structures_meta.json` move into the structure folder — the fetcher pairs them, so they must not split.
- `--out-dir` / `--out` / `outPath` CLI flags keep meaning "the data root"; each builder joins its own family prefix. Nobody passes a prefixed root by hand.
- `mkdirSync(..., { recursive: true })` / `create_dir_all` before every write, as in Task 9.

- [ ] Star bins: `buildStars.ts` and `tools/stars-rs/src/main.rs` (keep `constellations.json` at the root).
- [ ] Structure catalog: both artefacts, and the "regenerate via npm run build-structures" prose if it names a path.
- [ ] Scalar fields: the CF-4, MCPM and flow-field builders plus the two verify scripts' default read paths.
- [ ] Flow workbench `FIELD_URL` (`createFlowHarness.ts:63`) → the prefixed path (it serves the repo's `public/data`, so it breaks otherwise). Task 13 then makes it resolve through the manifest, which is where the hard-coded URL finally goes away.
- [ ] `npm test && npm run typecheck` → GREEN. Build `tools/stars-rs` with `cargo check --manifest-path tools/stars-rs/Cargo.toml` → clean.
- [ ] Commit the TS builders, the verify scripts, the workbench harness and `tools/stars-rs/src/main.rs`.

---

### Task 11: content-hashed filenames + `manifest.json`, as a post-pass over `public/data/`

The epoch guarantees _compatibility_, not _freshness_: a rebuild at the same format version reuses the URL and `max-age=86400` serves the old bytes for up to a day. Every tracked file therefore gains an 8-hex SHA-256 infix (`sdss-large.a3f19c2e.bin`) and the build emits a manifest mapping logical → hashed.

**Why a post-pass and not a shared write helper.** Threading hashing through every builder means duplicating the hasher _and_ a two-language manifest-merge protocol into `tools/stars-rs` (Rust). A pass that walks the finished `public/data/`, renames and emits the manifest keeps every builder — Rust included — writing plain logical names, and makes the manifest a pure function of the bytes on disk rather than of who ran what.

**Files:**

- Create: `src/@types/data/DataManifest.d.ts`
- Create: `tools/utils/data/contentHash8.ts`, `tools/utils/data/hashedDataName.ts`, `tools/utils/data/logicalDataName.ts`, `tools/utils/data/walkDataFiles.ts`
- Create: `tools/deploy/buildDataManifest.ts`
- Modify: `tools/deploy/r2/allowDataFile.ts` (accept hashed names; admit `pgc_aliases.json`)
- Modify: `package.json` (one new script + a uniform tail on every build script)
- Test: `tests/tools/utils/data/contentHash8.test.ts`, `tests/tools/utils/data/hashedDataName.test.ts`, `tests/tools/deploy/buildDataManifest.test.ts`, `tests/tools/deploy/r2/allowDataFile.test.ts`

**Interfaces:**

- Produces:

```ts
// DataManifest.d.ts — logical data path → the hashed path the build wrote.
export type DataManifest = Readonly<Record<string, string>>;

// contentHash8.ts — first 8 lowercase hex chars of the SHA-256 of `bytes`.
export function contentHash8(bytes: Uint8Array): string;

// hashedDataName.ts — ('sdss-large.bin', 'a3f19c2e') → 'sdss-large.a3f19c2e.bin'
export function hashedDataName(logicalName: string, hash: string): string;

// logicalDataName.ts — the inverse; identity for a name that carries no hash.
export function logicalDataName(name: string): string;

// walkDataFiles.ts — every file under `dataDir` except the images/ subtree,
// as posix-relative paths.
export function walkDataFiles(dataDir: string): string[];

// buildDataManifest.ts — hash + rename every tracked file under `dataDir`,
// then write `<dataDir>/manifest.json` LAST and return the map.
export function buildDataManifest(dataDir: string): DataManifest;
```

- **Coverage boundary.** Tracked = what `allowDataFile` accepts, at any depth below `public/data/` except `images/`. So: the five family folders' bins plus the root JSON (`famous_galaxies_meta.json`, `famous_stars_meta.json`, `constellations.json`, `pgc_aliases.json`). Explicitly **not** tracked and therefore permanently logical-named: the pre-tier DisPerSE inputs `sdss.bin` / `glade.bin` and the `filaments-sdss.bin` diagnostic — local artefacts no browser ever fetches. `images/` stays path-stable (thousands of lazily-fetched files, and `earth-tiles/` carries its own `TILE_PREFIX` epoch).
- `allowDataFile` normalizes its argument through `logicalDataName` before matching, so it answers identically for `2mrs.bin` and `2mrs.a3f19c2e.bin`. Task 14's drift guard is built on that equivalence.
- `pgc_aliases.json` joins the allow-list — the spec puts it in coverage. It reaches `public/data/` via `stage-pgc-aliases` (already wired into `predev`), and Task 14 drops the hand-rolled `collectExtraFiles` row that used to upload it straight from `data/`.
- **One file per logical name.** A logical file on disk is authoritative — a builder just wrote it: hash it, rename it into place, delete every _other_ hashed variant of that logical name. With no logical file present, the surviving hashed variant is re-verified against its own bytes (and renamed if a hand-edit made its name lie). Consequence: the pass is idempotent, and a second run over unchanged bytes renames nothing and emits a byte-identical manifest.
- **`manifest.json` is the last write of the pass**, after every rename. It is the index, never an entry in itself.
- npm wiring: `"build-data-manifest": "tsx tools/deploy/buildDataManifest.ts"`, appended as `&& npm run build-data-manifest` to **every** script that writes into `public/data/`: `build-all`, `build-tiers`, `build-famous`, `build-famous-stars`, `build-stars`, `build-stars-rs`, `build-structures`, `build-cf4-density`, `build-mcpm`, `build-flow-field`, `build-filaments`, `build-filaments-sdss`, `build-filaments-small`, `predev`. A uniform tail beats a per-script judgement about whose output happens to be tracked. The tails are convention; the **enforcement** is Task 14's drift guard, which turns a forgotten tail into a loud sync failure instead of a stale publish. (`predev` pays a full re-hash of the tree on every `npm run dev` — sub-second over ~280 MB at SHA-256 rates.)
- **The pass never touches a linked tree.** When `public/data` is itself a symlink (`lstatSync(...).isSymbolicLink()`), `buildDataManifest` returns without renaming anything and prints why: `/link-data` points a worktree at the **main checkout's** tree, and renaming files there would hash-convert data out from under a checkout whose code may predate (or postdate) this regime. A linked tree belongs to the checkout that built it; only that checkout's own builds may rewrite it.

**After this task the on-disk regime has flipped** — dev server, tools and R2 all see hashed names, and nothing reads through the manifest yet. Tasks 12 and 13 are the readers; land all three before any real build (Task 16).

- [ ] Add `tests/tools/utils/data/contentHash8.test.ts`: `is a pure function of the bytes` — the same bytes twice give the same 8-char lowercase-hex string; one flipped byte gives a different one.
- [ ] Add `tests/tools/utils/data/hashedDataName.test.ts`:
  - `logicalDataName inverts hashedDataName` across the tracked extensions (`.bin`, `.scfd`, `.ccat`, `.json`).
  - `logicalDataName leaves an un-hashed name alone`, including names whose stem already contains dots or hex-looking runs (`mcpm-small.scfd`, `desi-deep.bin`) — the infix must only be stripped when it is exactly 8 hex chars immediately before the extension. A regex that over-matches here makes Task 14's drift guard blind, which is the failure this test exists for.
- [ ] Add `tests/tools/deploy/buildDataManifest.test.ts` against `mkdtempSync` directories:
  - `maps every tracked file and renames it in place` — seed `galaxy-catalog/v9/2mrs.bin`, `star-catalog/v1/stars-small.bin`, `constellations.json`, plus the untracked `galaxy-catalog/v9/sdss.bin` and an `images/famous/x.webp`; assert the manifest's key set is exactly the three tracked logical paths, that every value exists on disk, and that the untracked bin and the image still sit at their original names.
  - `a rebuild with changed bytes replaces the hashed file` — run, rewrite `2mrs.bin` under its logical name with different bytes, run again; assert exactly one `2mrs.*.bin` survives, that its name carries the new bytes' hash, and that the manifest points at it.
  - `re-running over unchanged bytes changes nothing` — two runs; identical manifest and identical directory listing (this is what catches double-hashing, `2mrs.a3f19c2e.bin` → `2mrs.b7d0.a3f19c2e.bin`).
  - `manifest.json is not itself an entry`.
  - `leaves a symlinked data dir untouched` — point a symlink at a seeded tree, run the pass on the symlink path; assert no rename happened and no manifest was written through the link.
- [ ] Add to `tests/tools/deploy/r2/allowDataFile.test.ts`: `accepts a content-hashed name` (`2mrs.a3f19c2e.bin`) and `still rejects the pre-tier DisPerSE inputs when hashed-looking` (`sdss.a3f19c2e.bin`).
- [ ] `npm test -- contentHash8 hashedDataName buildDataManifest allowDataFile` → RED.
- [ ] Implement the four helpers and the pass, plus a CLI `main()` behind the `process.argv[1] === fileURLToPath(import.meta.url)` guard the other tools use (print entry / renamed / removed counts). Rewrite the `allowDataFile` docblock: it names the tracked set for hashing, manifesting **and** upload, and `public/data/` is no longer flat.
- [ ] Add the npm script and the fourteen tails.
- [ ] `npm test && npm run typecheck` → GREEN.
- [ ] Commit the type file, the four `tools/utils/data/` helpers, `tools/deploy/buildDataManifest.ts`, `tools/deploy/r2/allowDataFile.ts`, `package.json`, and the four test files.

---

### Task 12: the browser resolves logical → hashed through a boot-fetched manifest

**Files:**

- Create: `src/utils/network/dataBaseUrl.ts`
- Create: `src/services/loading/dataManifest.ts`
- Modify: `src/services/loading/fetchWithProgress.ts` (`dataUrl` only)
- Modify: `src/services/engine/phases/wireSlots.ts`
- Test: `tests/services/loading/dataManifest.test.ts` (new), `tests/services/loading/fetchWithProgress.test.ts`, `tests/services/engine/phases/wireSlots.test.ts`

**Interfaces:**

- Consumes: `DataManifest` (Task 11).
- Produces:

```ts
// dataBaseUrl.ts — VITE_DATA_BASE_URL with any trailing slash stripped; '' in dev.
export function dataBaseUrl(): string;

// dataManifest.ts
/**
 * Fetch `<base>/data/manifest.json` once, `cache: 'no-cache'`. Memoized on a
 * module-level promise; NEVER rejects — a missing or unparseable manifest
 * leaves resolution as identity.
 */
export function loadDataManifest(): Promise<void>;

/**
 * Logical data path → the hashed path the build wrote. Identity for anything
 * the manifest does not name (the whole `images/` tree, a worktree that never
 * ran the pass).
 */
export function resolveDataPath(logicalPath: string): string;
```

- `dataUrl(p)` becomes `` `${dataBaseUrl()}/data/${resolveDataPath(p)}` `` — one choke point, so **no fetcher changes**. Extracting `dataBaseUrl` out of `dataUrl` is what keeps the import graph acyclic: `fetchWithProgress → dataManifest → dataBaseUrl`, never back.
- The identity fallback **is** the spec's "missing manifest falls through to the existing missing-data path": the logical URL 404s, the slot errors, `createSyntheticFallback` arms exactly as it does in a data-less worktree today. Do not throw, and do not route it to the splash — Task 7's suppression is for `FormatVersionError` alone, and a version mismatch is a different failure from an absent file.
- Awaited in `wireSlots` immediately **before** `reevaluateDemand`, and after the `engineStatusChanged({ kind: 'loading' })` dispatch so the loading UI is already up during the round trip. `reevaluateDemand` is the only place loads start (`wireSlots.ts:139-144`); everything else the phase does is construction (`wireImpostorSubsystems`, the Earth tile subsystem, fades, projection) and issues no fetch. That is what makes "no data fetch can race the manifest" a structural fact rather than a hope.
- Tests reset the module-level memo with `vi.resetModules()` + a dynamic `import()`; do not add a production-only reset export.

- [ ] Write `tests/services/loading/dataManifest.test.ts` with a stubbed global `fetch`:
  - `dataUrl resolves a logical path to the hashed one the manifest names` — manifest `{ 'galaxy-catalog/v9/2mrs.bin': 'galaxy-catalog/v9/2mrs.a3f19c2e.bin' }`; assert the full URL ends in the hashed name.
  - `leaves paths the manifest does not name untouched` — `images/famous-hires/m31.webp` resolves to itself. This is the assertion that keeps the un-hashed image tree working.
  - `a missing manifest leaves resolution as identity and never rejects` — `fetch` rejects; `await loadDataManifest()` settles, and `dataUrl('galaxy-catalog/v9/2mrs.bin')` is the logical URL.
  - `fetches the manifest once for concurrent callers` — two un-awaited `loadDataManifest()` calls, one `fetch`. A per-slot fetch storm is the bug this catches.
- [ ] Add to `tests/services/engine/phases/wireSlots.test.ts`: `starts no load until the data manifest has resolved` — mock `dataManifest` with a deferred `loadDataManifest`, call `wireSlots` without awaiting, assert no fetcher mock has run; resolve, await, assert the default boot set loaded. The existing "returns without awaiting arrivals" and loading-status assertions must keep passing.
- [ ] `npm test -- dataManifest fetchWithProgress wireSlots` → RED.
- [ ] Implement: extract `dataBaseUrl`, add the manifest module, rewrite `dataUrl`, add the `await` in `wireSlots` with a one-line note naming `reevaluateDemand` as the reason it sits exactly there.
- [ ] `npm test && npm run typecheck` → GREEN — the three existing `dataUrl` env cases in `fetchWithProgress.test.ts` still pass unchanged (no manifest loaded ⇒ identity).
- [ ] Commit `src/utils/network/dataBaseUrl.ts`, `src/services/loading/dataManifest.ts`, `src/services/loading/fetchWithProgress.ts`, `src/services/engine/phases/wireSlots.ts`, and the two test files.

---

### Task 13: tool-side reads resolve through the same manifest

**Files:**

- Create: `tools/utils/data/resolveDataFile.ts`
- Modify: `tools/filaments/buildFilaments.ts:525` (the per-source read), `tools/volumes/verifyCf4Scfd.ts:66`, `tools/flow/verifyFlowField.ts:181`
- Modify: `tools/flow-workbench/src/createFlowHarness.ts:63,91`
- Test: `tests/tools/utils/data/resolveDataFile.test.ts` (new)

**Interfaces:**

- Consumes: `DataManifest` (Task 11); `GALAXY_CATALOG_DATA_PREFIX`, `SCALAR_FIELD_DATA_PREFIX` (Task 8).
- Produces:

```ts
// resolveDataFile.ts — the on-disk path of a logical data file: the manifest's
// hashed name where it names one, the logical path itself where it doesn't.
export function resolveDataFile(dataDir: string, logicalRelPath: string): string;
```

- The identity fallback is load-bearing, not defensive: `buildFilaments` reads a **mixed** set — `2mrs.bin` is tracked and hashed, `sdss.bin` / `glade.bin` are untracked and logical (Task 9). One resolver with an identity miss makes that a non-case instead of a branch at every read site.
- The flow workbench is a browser app that already imports from `src/` (`createFlowHarness.ts:50`): it awaits `loadDataManifest()` and builds its URL with ``dataUrl(`${SCALAR_FIELD_DATA_PREFIX}/flowfield.scfd`)`` rather than keeping a hard-coded `FIELD_URL`.

- [ ] Write `tests/tools/utils/data/resolveDataFile.test.ts` against `mkdtempSync` dirs: `returns the hashed path the manifest names`; `falls back to the logical path for a file the manifest does not name` (the `sdss.bin` case); `falls back to the logical path when there is no manifest at all` (a checkout that has never run the pass must still be able to run the verifiers).
- [ ] `npm test -- resolveDataFile` → RED.
- [ ] Implement the resolver, then route the three tool read sites through it and the workbench through `loadDataManifest` + `dataUrl`.
- [ ] `npm test && npm run typecheck` → GREEN.
- [ ] Commit `tools/utils/data/resolveDataFile.ts`, the three tool files, the workbench harness, and the new test.

---

### Task 14: the R2 sweep is manifest-driven, with a drift guard and the new cache policy

`collectDataFiles` is a non-recursive `readdirSync` of `public/data`. After Tasks 9–11 every uploadable file sits one epoch folder down under a hashed name, so an unchanged sweep would upload **nothing** but stale loose JSON — and `syncR2` would exit 0 on a partial publish. Rather than teach it to walk, invert it: the manifest already lists exactly what must ship.

**Files:**

- Modify: `tools/deploy/r2/collectDataFiles.ts`
- Create: `tools/deploy/r2/collectDataManifest.ts`
- Modify: `tools/deploy/syncR2.ts` (`buildGroups`), `tools/deploy/r2/collectExtraFiles.ts` (drop the `pgc_aliases.json` row)
- Modify: `public/_headers`
- Test: `tests/tools/deploy/r2/collectDataFiles.test.ts` (new), `tests/tools/deploy/r2/collectDataManifest.test.ts` (new)

**Interfaces:**

- Consumes: `DataManifest`, `allowDataFile`, `logicalDataName`, `walkDataFiles` (Task 11).
- Produces:

```ts
// collectDataFiles.ts — signature unchanged; the uploads ARE the manifest's values.
// Throws before any byte moves when disk and manifest disagree (see the drift guard).
export function collectDataFiles(sourceDir: string): R2Upload[];

// collectDataManifest.ts — the manifest as its own upload; [] when absent.
// Mirrors collectEarthTileManifest.
export function collectDataManifest(sourceDir: string): R2Upload[];
```

- **Drift guard**, all three throwing from `collectDataFiles` (called inside `buildGroups()`, which `syncR2.main` runs before the first upload — so this is a genuine preflight):
  1. no `manifest.json` → throw, naming `npm run build-data-manifest`;
  2. a manifest value with no file on disk → throw, naming it;
  3. a **tracked, logical-named** file on disk (`allowDataFile(base)` true and `logicalDataName(base) === base`) → throw, naming it. That one means a builder ran without its manifest tail; publishing now would ship a manifest that describes the previous generation.
- Groups in `buildGroups()`: the `public/data` group flips to `cacheControl: IMMUTABLE, purge: false` — a hashed name's bytes never change, so both the day-TTL and the purge become dead weight. A new group `'Data manifest'` goes **last**, `cacheControl: NO_CACHE` (`'public, max-age=0, must-revalidate'`, declared beside `DAY`/`IMMUTABLE`), `purge: true` — the same "pointer uploaded after everything it names" rule the Earth-tile manifest group already documents at `syncR2.ts:79-87`.
- `public/_headers` gains `/data/*` immutable plus an exact `/data/manifest.json` no-cache rule. Both match `manifest.json`, so put the exact-path rule **last** and confirm against Cloudflare's `_headers` precedence docs that it wins the duplicate `Cache-Control` before relying on it. This is belt-and-braces either way, and the file should say so: `npm run build` ends in `rm -rf dist/data`, so in production every data byte comes from R2 under the `buildGroups()` policy above — the group `cacheControl` is the load-bearing edit, and `_headers` only reaches data under a local `vite preview` against `public/data`.
- `collectExtraFiles` loses its `data/pgc_aliases.json` row: the file now ships hashed out of `public/data/`, and leaving both would publish an unreferenced logical copy alongside it.

- [ ] Write `tests/tools/deploy/r2/collectDataFiles.test.ts` against `mkdtempSync` directories seeded with a hand-written `manifest.json`:
  - `uploads exactly the hashed files the manifest names, keyed under data/` — assert `data/galaxy-catalog/v9/2mrs.a3f19c2e.bin` and `data/constellations.b1c2d3e4.json`.
  - `refuses to sync when a tracked file was never hashed` — a logical `galaxy-catalog/v9/2mrs.bin` on disk → throws, message names the file.
  - `refuses to sync when the manifest names a file that is not on disk`.
  - `refuses to sync when there is no manifest at all`.
  - `ignores untracked local artefacts` — `galaxy-catalog/v9/sdss.bin` present: no throw, not uploaded.
- [ ] Write `tests/tools/deploy/r2/collectDataManifest.test.ts`: `emits the manifest under data/manifest.json` and `emits nothing when the manifest is absent`. A silently-empty group would upload fresh data behind a stale pointer — the one failure this whole regime exists to prevent.
- [ ] `npm test -- collectDataFiles collectDataManifest` → RED.
- [ ] Implement both collectors, rewrite the `collectDataFiles` docblock (manifest-driven, and why the guard exists), edit `buildGroups()`, drop the extras row, update `public/_headers`.
- [ ] `npm test -- deploy && npm run typecheck` → GREEN.
- [ ] Commit `tools/deploy/r2/collectDataFiles.ts`, `tools/deploy/r2/collectDataManifest.ts`, `tools/deploy/r2/collectExtraFiles.ts`, `tools/deploy/syncR2.ts`, `public/_headers`, the two new tests.

---

### Task 15: documentation sweep

Every one of these is stale **today** and would be doubly wrong after the bump.

**Files:**

- Modify: `docs/DATA.md:12,16` (+ a new layout table + the manifest regime)
- Modify: `docs/DEPLOY.md` (deploy step order + the cache table)
- Modify: `README.md:672-686`
- Modify: `docs/adrs/0004-famous-calibration-on-meta-not-bin.md:37-38`
- Modify: `.claude/skills/add-data-source/SKILL.md`

- [ ] `docs/DATA.md:12`: says "v6" and points at the pre-rename `src/data/galaxyCatalogFormat.ts`. Correct to v9 and `src/data/galaxyCatalog/galaxyCatalogFormat.ts`. `:16` says the spectroscopic z sits at "v6, byte 54" — it is byte 56 in v9.
- [ ] Add to `docs/DATA.md` the family/epoch layout table (folder → files → format module + version) from the spec, with one line stating the rule: the folder name carries the family's format version, derived from that module's `VERSION`; loose JSON stays at the root.
- [ ] Add to `docs/DATA.md` a short "content hash + manifest" paragraph: `public/data/` holds hashed names in every environment, `manifest.json` is the only index, the tracked set is `allowDataFile`'s, `images/` is excluded, and every build script ends with `npm run build-data-manifest` — so a hand-run `tsx tools/…` invocation must be followed by the pass or `sync-r2` will refuse.
- [ ] `docs/DEPLOY.md`: the full-refresh step list gains the manifest pass (or notes that each `build-*` script already ends in it) and the "Cache-Control + CORS" section is now wrong in two ways — data objects are `immutable, max-age=31536000` and unpurged, and `manifest.json` is `no-cache` and purged, uploaded last. Also extend the `dataUrl()` paragraph (`:22`): the runtime resolves the logical name through the boot-fetched manifest before prefixing `VITE_DATA_BASE_URL`.
- [ ] `README.md:672-686` documents SKMP **v4** with a byte table that predates `classByte`, `spectroscopicZ` and both provenance flags. Replace the section with the v9 header + record table (the one in Task 3), and update the trailing "old v1/v2/v3 files are no longer accepted — re-run `npm run build-all`" line to name `npm run build-tiers`.
- [ ] `docs/adrs/0004…:37-38`: "Same v6 64-byte stride" → v9, and the link `../../src/data/galaxyCatalogFormat.ts` is a dead path — point it at `src/data/galaxyCatalog/galaxyCatalogFormat.ts`. Do not rewrite the decision itself; an ADR records what was decided.
- [ ] `.claude/skills/add-data-source/SKILL.md`: in Path A step 4, extend the "bump the `.bin` format only if the per-galaxy layout changes" line into the checklist a bump actually needs — **regenerate the bins, write them under the family's new `v<N>` epoch folder, re-sync R2, purge the CDN**. Add the family-folder rule for a new source (a new binary family gets its own `<family>/v<N>/` folder and its own prefix constant), and the manifest rule: a new runtime-fetched file must be added to `allowDataFile` or it is never hashed, never manifested and never uploaded. While there, fix the stale "`ALLOW` entries in `tools/deploy/syncR2.ts`" sidebar line — the predicate is `tools/deploy/r2/allowDataFile.ts`.
- [ ] `npm run format` on the touched markdown; commit the five files.

---

### Task 16: full rebuild smoke + mass sanity, from the main checkout

**This task cannot run in the worktree.** `data/raw/` here contains only committed `README.md`/`.sha256` sidecars; the actual catalogs (SDSS CSV, 2MRS, GLADE, HyperLEDA, CF-4, Milliquas, DESI, famous seed) are gitignored and live only in `/Users/rulkens/Development/js/skymap/data/raw/`. It is also the project rule that bins are regenerated from the main checkout (memory `project_worktree_data_isolation`). **Run it from `/Users/rulkens/Development/js/skymap` with this branch checked out there** — either post-merge, or by checking the branch out in the main checkout for the duration of the build. Do not symlink `data/raw` into the worktree; a half-populated raw tree produces a quietly wrong catalog.

**Files:** none (verification only). Any defect found here is fixed in the task that owns the code.

- [ ] From the main checkout on this branch: `npm run build-tiers`. Expect the bins to land under `public/data/galaxy-catalog/v9/`, the stderr line per file to name the prefixed path, and the script's manifest tail to report the renames.
- [ ] `npm run build-famous` → `public/data/galaxy-catalog/v9/famous.<hash>.bin` + `public/data/famous_galaxies_meta.<hash>.json` at the root.
- [ ] Manifest integrity, via a scratch `tsx` script: read `public/data/manifest.json`, assert every value exists on disk, that no key is itself a hashed name, and that no tracked logical-named file remains anywhere under `public/data/` (the Task 14 drift guard's own condition, checked before a sync is attempted). Then re-run `npm run build-data-manifest` and assert the manifest is byte-identical — idempotence on the real 280 MB tree, which the unit test can only prove on fixtures.
- [ ] Mass sanity, via a scratch `tsx` script that decodes `galaxy-catalog/v9/sdss-large.bin`, `2mrs.bin` and `glade-large.bin` — resolved with `resolveDataFile`, since the names on disk now carry hashes — and prints, per file: the finite-mass fraction and the 10th/50th/90th percentiles of `log10StellarMass`.
      Acceptance (re-derived 2026-08-11 from the real distributions after the final review's C1 fix — the original bands assumed GLADE `magR` held V; it holds 2MASS J): SDSS median in **10.0–10.9** (the bright M_abs cut skews the tier high; measured 10.84); 2MRS median in **10.0–11.0**; GLADE median in **10.2–11.0** (K-first-then-B estimator); percentiles are over the finite subset and must all be finite. Finite fraction > 0.9 for SDSS and 2MRS; GLADE finite fraction > **0.55** — its ceiling is 63.2 % because 36.8 % of GLADE rows carry neither a finite B nor a finite K, a property of the catalog, not a defect. `milliquas-large.bin` must be **0 %** finite.
- [ ] Load the app against the fresh bins (dev server from the main checkout): the galaxy field renders as before, no splash error, no synthetic fallback. In the Network panel, `manifest.json` is requested exactly once and before any `.bin`, and every catalog request carries a hashed filename.
- [ ] Rebuild the derived artefacts that consume the galaxy bins, in order: `npm run build-structures`, then `npm run build-filaments`. The filament build reads the v9 bins **through the manifest** (Task 13) — if the pre-check message from Task 9 fires, the ordering rule was violated, not the code; if a read 404s on a logical name, the manifest tail did not run.
- [ ] Dry-run the drift guard: touch a logical-named tracked file (e.g. copy one hashed bin back to its logical name) and confirm `npm run sync-r2` refuses with that filename in the message; delete it and re-run `npm run build-data-manifest`. This is the one place the guard's message is read by a human.
- [ ] `npm run sync-r2-secure` is **out of scope for this plan** — deploy is the user's call once the bins are verified. Note in the PR that the old flat R2 objects stay in place until a later prune, which is what keeps in-flight old clients working across the deploy, and that the same prune is what eventually removes superseded hashed objects (never before the manifest naming them stops being served).

---

## Definition of Done

**Deliverable inventory**

- `src/data/galaxyCatalog/galaxyCatalogFormat.ts` at `VERSION = 9`, exporting `GALAXY_CATALOG_FIELD_SPECS` as the single declaration of the record layout, with encode, decode, `emptyGalaxyCatalog` and `cloneGalaxyCatalogForTransfer` all driven by it.
- `src/@types/data/galaxyCatalog/GalaxyCatalogColumn.d.ts`, `…/GalaxyCatalogFieldSpec.d.ts`; `GalaxyCatalog.log10StellarMass: Float32Array`.
- `tools/catalog/estimateLog10StellarMass.ts` + its per-source test; the estimator wired into `recordsToCloud` and `buildFamous`.
- `src/data/formatVersionError.ts`; `defaultRetryPolicy` gives up on it; `src/services/engine/wiring/installFormatVersionAlert.ts` wired in `wireSlots`; `SplashError` kind `data-version-mismatch`.
- Five `*_DATA_PREFIX` constants, one per format module, each derived from that module's `VERSION`; every fetcher, builder (incl. `tools/stars-rs`) and the R2 sweep read them.
- `tools/deploy/buildDataManifest.ts` + the four `tools/utils/data/` helpers (`contentHash8`, `hashedDataName`, `logicalDataName`, `walkDataFiles`) and `resolveDataFile`; `npm run build-data-manifest` as the tail of every script that writes into `public/data/`.
- `src/services/loading/dataManifest.ts` (`loadDataManifest` + `resolveDataPath`), `src/utils/network/dataBaseUrl.ts`, and `dataUrl()` resolving through them; the manifest awaited in `wireSlots` before `reevaluateDemand`.
- Manifest-driven `collectDataFiles` with its three-condition drift guard, `collectDataManifest` as the last sync group, and the immutable/no-cache split in both `syncR2.buildGroups()` and `public/_headers`.
- Updated `docs/DATA.md` (v9 + family/epoch table + the manifest regime), `docs/DEPLOY.md` (step order + cache policy + `dataUrl` resolution), `README.md` binary-format section, ADR-0004 stride reference, `add-data-source` SKILL bump checklist.

**Named observable behaviours** (manual pass)

- Worktree + `/link-data` (v8 bins, v9 code): the splash reads "Skymap was updated — reload the page to fetch matching data" with a Reload button; the Network panel shows exactly one request per catalog; no synthetic cloud renders behind it.
- Main checkout after `npm run build-tiers`: `public/data/galaxy-catalog/v9/` holds the survey bins; `star-catalog/v1/`, `structure-catalog/v1/`, `scalar-field/v3/`, `filament/v1/` hold theirs; `constellations.json`, `pgc_aliases.json`, `famous_*_meta.json` are still at the data root. Every one of those carries a content hash in its filename, `manifest.json` names all of them, and only the untracked `sdss.bin` / `glade.bin` / `filaments-sdss.bin` keep logical names.
- The app against fresh v9 bins renders the galaxy field, thumbnails, disks and InfoCards exactly as at v8 — the fallback-provenance chips ("measured" vs "estimated" orientation/diameter) still read correctly, since the decoder re-expands the flag bits. The Network panel shows one `manifest.json` request, ahead of every hashed `.bin`, and unchanged `images/` URLs.
- Restoring a logical-named tracked file makes `npm run sync-r2` refuse by name before any upload; `npm run build-data-manifest` clears it and a second run of the pass changes nothing.
- Mass percentiles per source land in the Task 16 acceptance bands; Milliquas is 0 % finite.

**Deferral boundary**

- No InfoCard mass display, no `GalaxyRow` mass field — v9 delivers data only.
- No measured (NSA cross-match) masses; every v9 mass is photometric and carries bit 2.
- No halo masses on disk; the Moster conversion and the VAC-calibrated weight relation belong to the future MCPM-export path.
- No per-source variable layout; `magU`/`magZ` stay guaranteed-NaN slots for non-SDSS sources and the header's reserved word stays free.
- `buildFilaments` still names the un-tiered `sdss.bin` / `glade.bin` inputs that the tiered pipeline no longer produces — pre-existing, untouched here.
- `images/` (famous thumbnails, hi-res, planet textures, Earth tiles) stays path-stable and unhashed; `earth-tiles/` keeps its own `TILE_PREFIX` epoch.
- No subresource-integrity checking. The hash is a cache-busting name, not a verified digest — nothing re-hashes the bytes in the browser.
- R2 sync, the old-flat-object prune, and the prune of superseded hashed objects are deploy decisions, not plan tasks.
