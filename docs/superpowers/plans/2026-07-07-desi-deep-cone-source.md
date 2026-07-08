# DESI Deep Cone Data Source Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Each implementer subagent must be dispatched `run_in_background: true` per project convention; the main thread runs `npm test` / `npm run typecheck` and commits. Steps use checkbox (`- [ ]`) syntax for tracking.

**Spec:** `docs/superpowers/specs/2026-07-07-desi-deep-cone-design.md` — **plan 1 of 2 (data source only)**. The fly-through clip is plan 2 and is explicitly out of scope here.
**Research ground truth:** `docs/research/2026-06-05-desi-dr1-as-a-data-source.md` (verified FITS layout, column set, server behaviour).

**Goal:** A permanent new survey source — a 2.5° ultra-deep cone of DESI DR1 LSS spectroscopy through the Corona Borealis supercluster (≈56k rows, z up to ≈3.5 / ~7,100 Mpc) — fetched, parsed, cone-filtered, cross-matched, encoded to a tier-agnostic `desi-deep.bin`, wired into the runtime behind a Settings toggle, and added to the R2 deploy set.

**Architecture:** the Milliquas playbook with two deviations. Like Milliquas: append-only `Source` code, per-source entry module, far-tail display params (`intensityFloor`/`falloffHalfMpc`), neutral (no-Schechter-shaping) luminosity weighting. Unlike Milliquas: DESI rows are ordinary galaxies, so they go **through** `crossMatch` (lowest priority, so existing bins stay byte-stable) rather than bypassing it; and `tierTargets` is **empty**, so the source ships one tier-agnostic `desi-deep.bin` (like `2mrs.bin`), not per-tier variants. New build-side pieces: a minimal FITS binary-table parser (skymap has NPY/ND-skeleton but no FITS), a chunked range-request fetcher (the `fetchHyperLeda` resume pattern, adapted to binary chunks), and a pure angular-cone filter applied at parse time.

**Tech Stack:** TypeScript (tools + src), Vitest, Node `fetch` with injected transport for tests, no new dependencies.

## Global Constraints

- **Cone center: RA 233.2°, Dec +32.3°, radius 2.5°** (Corona Borealis supercluster). The center constants may shift **≤ 2°** once the real files are local and exact counts are free — Task 7's census diagnostic is the designated re-check; the constants live in exactly one file (`tools/catalog/desiCone.ts`).
- **DESI server limits (verified in the spec's spike):** ~8 MB range-request chunks, **≤ 6 concurrent**, exponential backoff on 503/timeout. Long sequential reads stall after ~10 MB; 24 parallel requests → HTTP 503. These are fetcher requirements, not tuning suggestions.
- **NGC files only** — CrB is in the north galactic cap; the four SGC files are never fetched.
- **Append-only `Source` enum codes** — the next free integer is **18** (after `Flow: 17`; code 31 is the reserved pick sentinel, see `src/data/source.ts` + `src/data/selectionEncoding.ts` docstrings). Never renumber.
- **Project conventions:** `type` aliases never `interface`; one symbol per file in `utils/` and `@types/`; didactic comments (why + what the alternative was); deep relative imports, no barrels; tests mirror the src/tools tree.
- **No network in CI/tests.** The ~820 MB fetch and the full `build-all` are run by the human/main thread only (Task 11 documents the loop).
- **Keep the suite green:** `npm run typecheck` + `npm test` per task; prettier only on touched files; commits stage specific paths, never `git add -A`.

## Cross-task contracts (later tasks import, never re-declare)

- Task 1 → registry keys `'desi.bgs' | 'desi.lrg' | 'desi.elg' | 'desi.qso' | 'desi.readme' | 'desi.sha256'`.
- Task 2 → `Source.DesiDeep === 18`, `DESI_DEEP_ENTRY` (id `'desiDeep'`, `binBaseName: 'desi-deep'`, empty `tierTargets`).
- Task 3 → `parseFitsBinTable(buf): FitsBinTable` + the committed fixture `tests/fixtures/desi/qso_ngc_head6.fits`.
- Task 4 → `parseDesiClustering(buf, tracer, keep?): { records: ParsedRecord[]; skipped: number }` + `DesiTracer` + the tracer→`classByte` mapping in `sourceClass.ts`.
- Task 5 → `makeConeFilter(centerRaDeg, centerDecDeg, radiusDeg): (raDeg, decDeg) => boolean`.
- Task 6 → `planChunks` / `downloadChunked` / `RangeTransport` (exported for tests, `syncR2.ts`-style).
- Task 7 → `DESI_CONE` constant; `CrossMatchInputs` gains `desiDeep`.

---

## Task 1 — raw-data registry entries + provenance README

**Files**

- Modify: `tools/utils/io/rawDataRegistry.ts`
- Create: `data/raw/desi/README.md`
- Modify: `tests/tools/utils/io/rawDataRegistry.test.ts`

**Registry entries** (keys are the contract; follow the `cf4.*` entry shapes at `rawDataRegistry.ts:216-242`):

| Key           | path                                                | kind | source       | fetcher                   |
| ------------- | --------------------------------------------------- | ---- | ------------ | ------------------------- |
| `desi.bgs`    | `data/raw/desi/BGS_BRIGHT_NGC_clustering.dat.fits`  | file | `gitignored` | `tools/fetch/fetchDesi.ts` |
| `desi.lrg`    | `data/raw/desi/LRG_NGC_clustering.dat.fits`         | file | `gitignored` | `tools/fetch/fetchDesi.ts` |
| `desi.elg`    | `data/raw/desi/ELG_LOPnotqso_NGC_clustering.dat.fits` | file | `gitignored` | `tools/fetch/fetchDesi.ts` |
| `desi.qso`    | `data/raw/desi/QSO_NGC_clustering.dat.fits`         | file | `gitignored` | `tools/fetch/fetchDesi.ts` |
| `desi.readme` | `data/raw/desi/README.md`                           | file | `committed`  | —                         |
| `desi.sha256` | `data/raw/desi/desi_dr1_lss.sha256`                 | file | `committed`  | `tools/fetch/fetchDesi.ts` |

`upstream` for the four `.fits` entries: `https://data.desi.lbl.gov/public/dr1/survey/catalogs/dr1/LSS/iron/LSScats/v1.5/` + filename. One combined `.sha256` sidecar (four `<hex>  <filename>` lines, written by the fetcher on completion) rather than four sidecars — a single registry key, same verification role as `cf4.sha256`.

**README.md content:** upstream URL + DR1 (`iron`) / LSScats v1.5 provenance, CC BY 4.0, per-file row counts (BGS_BRIGHT 2,909,876 / LRG 1,476,135 / ELG_LOPnotqso 1,821,322 / QSO 793,219 — NGC), row stride 117 bytes / 18 columns, the columns skymap consumes (`TARGETID`, `RA`, `DEC`, `Z`, `FLUX_{G,R,Z}_DERED` nanomaggies), tracer z-ranges, the NGC-only + CrB-cone scoping rationale, fetch command (`npm run fetch-desi`), checksum sidecar note.

**Gitignore:** no edit expected — `data/raw/**/README.md` and `**/*.sha256` are already re-included by the functional globs; the `.fits` files fall under the existing `/data/**` ignore. Verify with `git check-ignore data/raw/desi/BGS_BRIGHT_NGC_clustering.dat.fits` (must be ignored) and `git check-ignore data/raw/desi/README.md` (must NOT be ignored).

**Steps**

- [ ] Extend `tests/tools/utils/io/rawDataRegistry.test.ts` (same shape as the mcxc/mscc block): `desi.qso resolves to an absolute path ending with the registered relative path`; `the four desi .fits entries are gitignored (fetcher-produced)`; `desi.readme is committed`; `desi.sha256 is committed`. Run — the key tests fail to compile (unknown keys).
- [ ] Add the six registry entries + write `data/raw/desi/README.md`.
- [ ] `npm test -- rawDataRegistry` → green; `npm run typecheck` → clean.
- [ ] Commit: `git add tools/utils/io/rawDataRegistry.ts data/raw/desi/README.md tests/tools/utils/io/rawDataRegistry.test.ts`

---

## Task 2 — `Source.DesiDeep` + `DESI_DEEP_ENTRY` + registry registration

The enum member and the registry row must land together: `SOURCE_REGISTRY` is `satisfies Readonly<Record<SourceType, SourceEntry>>`, so an enum append without a row fails typecheck — and the widened `GalaxyCatalogId` / `GalaxyCatalogSourceType` unions (both derived via `Extract` from the registry, zero `@types` edits needed) deliberately break every exhaustive `Record` in the tests. The red typecheck is the checklist.

**Files**

- Modify: `src/data/source.ts` (append `DesiDeep: 18` with a docstring following the `Milliquas: 8` style)
- Create: `src/data/sources/desiDeep.ts`
- Modify: `src/data/sources.ts` (import + `[Source.DesiDeep]: DESI_DEEP_ENTRY` + append to `GALAXY_CATALOG_SOURCES`)
- Modify: `src/utils/math/galaxyType.ts` (new `case Source.DesiDeep` — colour discriminator from g−r, SDSS-like branch)
- Modify (compile/test-driven): `tests/data/sources.test.ts`, `tests/data/tierTargets.test.ts`, `tests/utils/galaxyCatalogIdOf.test.ts`, `tests/services/biasCorrection/galaxyCatalogConstants.test.ts` (`SOURCE_NAME` record), `tests/@types/engineSettingsState.itemVisibility.test.ts`, `tests/@types/engineState.test.ts` (exhaustive `Record<GalaxyCatalogId, …>` literals), `tests/services/engine/wiring/demandTable.test.ts` (`BOOT_GALAXY_CATALOG_ITEMS` — `initialState` derives items from `GALAXY_CATALOG_IDS`, so the boot fixture gains `desiDeep`), `tests/services/engine/wiring/createSyntheticFallback.test.ts` (fixture source records)

**Entry contract** (model: `src/data/sources/milliquas.ts`; Milliquas is the copied precedent for far-tail + no-Schechter display params, per the spec):

```ts
export const DESI_DEEP_ENTRY = {
  type: 'galaxyCatalog',
  code: Source.DesiDeep,
  id: 'desiDeep',
  label: 'DESI Deep Field',
  binBaseName: 'desi-deep',
  allSky: false,
  bearsLabel: false,
  bearsMarker: false,
  visible: true, // Milliquas precedent; the GalaxiesSection toggle (Task 9) is the off switch
  maxDistMpc: 7100, // z ≈ 3.5 comoving; extends the camera clamp past Milliquas's 4000
  bandLabels: { u: '—', g: 'g', r: 'r', i: 'z', z: '—' }, // DESI g/r/z fluxes → magG/magR/magI slots
  colourSpec: { slotA: 'g', slotB: 'r', rangeMin: 0.2, rangeMax: 1.8, kPerZ: 0.0 }, // g−r; kPerZ 0 per Milliquas rationale (mixed z 0.03–3.5 would clamp the ramp)
  mLim: 19.5, // BGS_BRIGHT r-band limit; permissive stand-in across the four tracers
  schechter: { mStar: -21.18, alpha: -1.16, phiStar: 0.0093 }, // placeholder triple = neutral shaping (Milliquas precedent: one Schechter is meaningless across four tracer populations; display knob, not correctness)
  iauPrefix: 'DESI',
  tierTargets: {}, // EMPTY ⇒ tier-agnostic single desi-deep.bin, like 2mrs.bin
  intensityFloor: 0.15, // seeded from Milliquas; visual tuning knob
  falloffHalfMpc: 1e30, // disable distance fade — the z≈3.5 tail is the point
} as const satisfies GalaxyCatalogSourceEntry;
```

Every non-obvious value gets a didactic comment in the file (the sketch comments above are the seed, expand in Milliquas's voice).

**Pinned assertions**

- `tests/data/tierTargets.test.ts` — new describe block modelled on the Milliquas one at lines 63-86: `tierFilenameForSource(Source.DesiDeep, t) === 'desi-deep.bin'` for all three tiers (tier-agnostic); `tierTarget(Source.DesiDeep, t) === undefined` for all three.
- `tests/data/sources.test.ts:99` — `ALL_VISIBLE_MASK` gains bit 18: `0b100011111` → `0b1000000000100011111` (update the adjacent comment too).
- `tests/utils/galaxyCatalogIdOf.test.ts` — `expect(galaxyCatalogIdOf(Source.DesiDeep)).toBe('desiDeep')`.
- `tests/services/biasCorrection/galaxyCatalogConstants.test.ts` — `SOURCE_NAME` record gains `[Source.DesiDeep]`.

Do **not** touch the engine-wiring / SettingsPanel lists yet (`galaxyCatalogSourceRegistry.ts`, `assetWiring.ts`, `GalaxiesSection.tsx`) — those are Tasks 8–9; their own tests pin the 6-source shape until then and must still pass here.

**Steps**

- [ ] Add the tierTargets/mask/id assertions above (failing).
- [ ] Append `DesiDeep: 18` to `source.ts`; create `desiDeep.ts`; register in `sources.ts` (registry key + `GALAXY_CATALOG_SOURCES`).
- [ ] `npm run typecheck` — walk every red site (galaxyType switch, exhaustive test Records); fix each by adding the `desiDeep` arm/key, nothing else.
- [ ] `npm test` → green (including the previously-failing new assertions and the auto-derived boot-items fixtures).
- [ ] Commit: `git add src/data/source.ts src/data/sources/desiDeep.ts src/data/sources.ts src/utils/math/galaxyType.ts tests/…` (list each touched test file).

---

## Task 3 — FITS binary-table parser: header cards + column layout (+ real fixture)

**Files**

- Create: `tools/parsers/desiFits.ts` (header/layout half; the decode + `ParsedRecord` mapping is Task 4, same file)
- Create: `tests/tools/parsers/desiFits.test.ts`
- Create: `tests/fixtures/desi/qso_ngc_head6.fits` (committed binary fixture — precedent: `tests/fixtures/scalar-volume/tiny-8x8x8.scfd`)

**Fixture: ALREADY GENERATED (controller, 2026-07-07)** at `tests/fixtures/desi/qso_ngc_head6.fits` (9,270 bytes) from a live 32 KB range request against `QSO_NGC_clustering.dat.fits` — primary header + extension header + 6 data rows, `NAXIS2` card patched to `6` (value field bytes 10–29 of the card, right-justified). Commit it in this task; record the provenance (date + method) in the test file's header comment. **Verified fixture facts — pin these exact literals in the tests:**

- `dataOffset` 8640 (primary header 1 block + extension header 2 blocks), `rowLengthBytes` **105**, `rowCount` 6, **14** columns. (The plan's earlier 117 B / 18-col figures are BGS_BRIGHT's layout — column sets vary per tracer; see Task 4.)
- Column order: TARGETID `K`, NTILE `K`, RA `D`, DEC `D`, PHOTSYS `1A`, Z `D`, FRAC_TLOBS_TILES `D`, then 7 more `D` weight/NX columns; offsets contiguous, summing to 105.
- Row 0: `TARGETID` 39627540901396635n, `RA` 159.24049207286527, `DEC` −10.157311765959316, `Z` 3.31353326666703.

**Parser contract**

```ts
export type FitsColumn = {
  name: string;    // TTYPEn, verbatim
  form: string;    // TFORMn, verbatim (e.g. 'D', 'E', 'K', '8A', '2K')
  byteOffset: number; // within a row
  byteLength: number;
};
export type FitsBinTable = {
  dataOffset: number;     // absolute byte offset of the first data row
  rowLengthBytes: number; // NAXIS1
  rowCount: number;       // NAXIS2
  columns: readonly FitsColumn[]; // TFIELDS entries, in order
};
export function parseFitsBinTable(buf: ArrayBuffer): FitsBinTable;
```

**Behaviour:** parses the 80-char header cards (primary header, then the first `BINTABLE` extension); reads `NAXIS1`/`NAXIS2`/`TFIELDS` + per-column `TTYPEn`/`TFORMn`. Byte-length accounting supports an optional repeat count `r` on `rD` (8r) / `rE` (4r) / `rK` (8r) and `nA` (n) — enough to lay out any column the LSS files carry; **any other TFORM letter throws an `Error` whose message names the offending TFORM and TTYPE** (e.g. `unsupported TFORM "C" for column FOO`). Throws with a clear message when the buffer isn't FITS (`SIMPLE` missing) or has no `BINTABLE` extension. Big-endian throughout (`DataView` with `littleEndian: false` in Task 4).

**Test names + assertions** (`tests/tools/parsers/desiFits.test.ts`):

- `parses the QSO fixture header: rowLengthBytes 105, rowCount 6, 14 columns` — exact equality on all three.
- `column byte offsets are contiguous and sum to rowLengthBytes` — last column's `byteOffset + byteLength === 105`.
- `finds RA, DEC, Z as f64 (TFORM D), TARGETID as i64 (TFORM K), PHOTSYS as 1A` — asserts the forms of the named columns per the verified column table above.
- `throws naming the offending TFORM on an unsupported column type` — synthesized in-memory header (the `glade.test.ts` `makeFixture` idiom, but for 2880-byte blocks) with a `TFORM1 = 'C'` column; `expect(...).toThrow(/TFORM "C"/)`.
- `throws on a buffer with no BINTABLE extension`.

**Steps**

- [ ] Generate + commit the fixture (procedure above); pin row-0 literals.
- [ ] Write the failing tests; run.
- [ ] Implement `parseFitsBinTable`; run → green; `npm run typecheck`.
- [ ] Commit: `git add tools/parsers/desiFits.ts tests/tools/parsers/desiFits.test.ts tests/fixtures/desi/qso_ngc_head6.fits`

---

## Task 4 — column decode + `ParsedRecord` mapping

**Files**

- Modify: `tools/parsers/desiFits.ts`
- Modify: `src/data/galaxyCatalog/sourceClass.ts` (tracer `classByte` mapping + label — see below)
- Modify: `tests/tools/parsers/desiFits.test.ts`, plus the sourceClass test (`tests/data/galaxyCatalog/sourceClass.test.ts`)

**Contract**

```ts
export type DesiTracer = 'BGS' | 'LRG' | 'ELG' | 'QSO';
export function parseDesiClustering(
  buf: ArrayBuffer,
  tracer: DesiTracer,
  keep?: (raDeg: number, decDeg: number) => boolean,
): { records: ParsedRecord[]; skipped: number };
```

**Per-tracer column reality (verified live 2026-07-07, NGC headers):** BGS_BRIGHT 18 cols / 117 B including lowercase `flux_g/r/z/w1/w2_dered` (TFORM `E`); LRG 13 / 97, ELG_LOPnotqso 15 / 113, QSO 14 / 105 — **the latter three have NO flux columns** (positions + clustering weights only). Decision (user, 2026-07-07): BGS uses real fluxes; LRG/ELG/QSO synthesize display magnitudes from per-tracer constants.

**Tracer display table** — Create: `tools/parsers/desiTracerDisplay.ts` (one exported symbol):

```ts
/** Display-only synthetic photometry for the tracers whose LSS clustering
 *  catalogs carry no fluxes. absMagR ≈ the population's characteristic M_r;
 *  gMinusR paints the population's colour class. Tuning knobs, not physics. */
export const DESI_TRACER_DISPLAY: Record<'LRG' | 'ELG' | 'QSO', { absMagR: number; gMinusR: number }> = {
  LRG: { absMagR: -22.8, gMinusR: 1.4 }, // massive red ellipticals
  ELG: { absMagR: -20.8, gMinusR: 0.5 }, // blue star-formers
  QSO: { absMagR: -25.5, gMinusR: 0.3 }, // AGN outshine hosts
};
```

**Behaviour** (mirrors `parseSdssCsv`'s result shape; `ParsedRecord` per `tools/parsers/common.ts`):

- Column lookup by TTYPE name, **case-insensitive** (BGS flux columns are lowercase on disk), throwing (sdssCsv `requireColumn` style) when a required column is missing. Required for ALL tracers: `TARGETID`, `RA`, `DEC`, `Z`. Additionally required for **BGS only**: `flux_g_dered`, `flux_r_dered`, `flux_z_dered`.
- Decode scalar `D`/`E`/`K` cells big-endian via `DataView`; only the needed columns are ever read (others are offset-skipped, including `nA` / repeat-count columns).
- **Cone predicate first:** when `keep` is supplied, evaluate it on the decoded RA/DEC **before** building the record — the spec's "cheap, before any allocation-heavy work".
- **BGS, nanomaggy → mag:** `mag = 22.5 − 2.5·log10(flux)`. **Drop** (count in `skipped`) BGS rows with non-positive g **or** r flux; a non-positive z-band flux keeps the row with `magI = NaN`.
- **LRG/ELG/QSO, synthetic mags:** `magR = DESI_TRACER_DISPLAY[tracer].absMagR + 5·log10(dL·1e5)` where `dL = (1 + z) · redshiftToDistanceMpc(z)` (luminosity distance in Mpc; `·1e5` = the Mpc→10 pc distance-modulus factor); `magG = magR + gMinusR`; `magI = NaN`. The flux-drop rule does not apply (no fluxes ⇒ `skipped` counts nothing for these tracers).
- Field mapping: `objID = TARGETID` (bigint, from the `K` column); `ra`/`dec`/`z` passthrough; `spectroscopicZ = z`; `magG`/`magR`/`magI` from g/r/z fluxes; `magU = magZ = NaN`; **`axisRatio: null`, `positionAngleDeg: null`** — the GLADE no-orientation path (`tools/parsers/glade.ts:436-441`): the pipeline's `recordsToCloud` applies the deterministic `fallbackOrientation` (`buildAllBins.ts:174-181`); `diameterKpc: null` (pipeline default 30 kpc); `source: Source.DesiDeep`; `parentSurveyByte: 0`.
- **`classByte` carries the tracer** so the InfoCard can say what each population is (the spec's accepted-artifacts section): add to `src/data/galaxyCatalog/sourceClass.ts` a `DESI_TRACER_CLASS: Record<DesiTracer-shaped-keys, number>` mapping `BGS→1, LRG→2, ELG→3, QSO→4` (0 stays "unknown") plus a label lookup (wired into the InfoCard in Task 9). The parser reads the mapping from `sourceClass.ts` — one source of truth, no mirrored constants.

**Files (addition):** Create `tools/parsers/desiTracerDisplay.ts`; Modify `data/raw/desi/README.md` — correct the Task 1 README's "117 bytes / 18 columns" and consumed-columns claims to the verified per-tracer table above, and document the synthetic-mag decision for LRG/ELG/QSO.

**Test names + assertions**

- `decodes row 0 of the QSO fixture to the pinned RA/DEC/Z` — exact literals from Task 3's verified-fixture block.
- `QSO fixture row 0 synthesizes magnitudes from the tracer table` — `magR` equals `−25.5 + 5·log10((1+z)·redshiftToDistanceMpc(z)·1e5)` computed with the pinned Z literal; `magG − magR ≈ 0.3`; `magI` NaN.
- `converts nanomaggy flux to magnitude for BGS: flux 100 → mag 17.5` — synthesized single-row buffer (in-memory header builder from Task 3) with lowercase `flux_*_dered` column names (case-insensitive lookup is thereby asserted); `expect(rec.magG).toBeCloseTo(22.5 - 2.5 * Math.log10(100), 10)`.
- `drops BGS rows with non-positive g or r flux and counts them in skipped`.
- `keeps BGS rows with non-positive z-band flux, emitting magI = NaN`.
- `LRG and ELG rows synthesize magnitudes from their tracer-table entries` — synthesized buffers without flux columns parse successfully.
- `emits the GLADE no-orientation fallback shape: axisRatio null, positionAngleDeg null, diameterKpc null`.
- `applies the keep predicate before record construction` — predicate rejecting all rows ⇒ `records.length === 0`, and rejected rows are NOT counted in `skipped` (out-of-cone is scoping, not data quality; assert `skipped === 0`).
- `carries TARGETID as objID (bigint) and the tracer classByte` — `expect(rec.objID).toBeTypeOf('bigint')`; `QSO` tracer ⇒ `classByte === 4`.
- sourceClass test: the tracer labels round-trip (`classByte 1 → 'BGS'`-flavoured label etc.).

**Steps**

- [ ] Failing tests → run → implement → run → green; `npm run typecheck`.
- [ ] Commit: `git add tools/parsers/desiFits.ts src/data/galaxyCatalog/sourceClass.ts tests/tools/parsers/desiFits.test.ts tests/data/galaxyCatalog/sourceClass.test.ts`

---

## Task 5 — angular cone filter (pure tools util)

**Files**

- Create: `tools/utils/math/makeConeFilter.ts` (one exported function — the one-symbol-per-file rule)
- Create: `tests/tools/utils/math/makeConeFilter.test.ts`

**Contract**

```ts
export function makeConeFilter(
  centerRaDeg: number,
  centerDecDeg: number,
  radiusDeg: number,
): (raDeg: number, decDeg: number) => boolean;
```

Factory shape so the trig is hoisted: precompute the center **unit vector** and `cos(radius)` once; the returned predicate is `dot(unitVec(ra, dec), centerVec) > cosRadius` — no `acos`, no per-row `Math.sqrt`. **Reuse `eqRaDecToUnitCart`** (`src/utils/math/eqRaDecToUnitCart.ts`) rather than writing new spherical trig (search-before-writing-helpers; there is no existing angular-separation helper — the only cone search in the repo, `structureMembership.ts`, is 3-D Cartesian in Mpc, not angular).

**Test names + assertions**

- `accepts the cone center itself` and `accepts a point 1° off center in dec` (2.5° cone).
- `rejects a point 3° off center` and `rejects the antipode`.
- `boundary: accepts 2.49° and rejects 2.51° (pure-dec offsets)` — dec offsets make the angular separation exact.
- `handles RA wrap-around: center RA 0.5°, point RA 359.5° at the same dec is inside`.
- `handles a polar center (dec +89°) without RA-compression artifacts`.

**Steps**

- [ ] Failing tests → run → implement → run → green; `npm run typecheck`.
- [ ] Commit: `git add tools/utils/math/makeConeFilter.ts tests/tools/utils/math/makeConeFilter.test.ts`

---

## Task 6 — `tools/fetch/fetchDesi.ts`: chunked, resumable, rate-limited downloader

**Files**

- Create: `tools/fetch/fetchDesi.ts`
- Create: `tests/tools/fetch/fetchDesi.test.ts`
- Modify: `package.json` (`"fetch-desi": "tsx tools/fetch/fetchDesi.ts"` — mirrors `fetch-milliquas`)

**Exported contract** (exported for tests, the `syncR2.ts` `ALLOW`/`etagMatches` precedent):

```ts
export type RangeChunk = { index: number; start: number; endInclusive: number };
export function planChunks(totalBytes: number, chunkBytes?: number): RangeChunk[]; // default 8 * 1024 * 1024

/** Transport is injected so tests never touch the network. Errors it throws
 *  may carry `status?: number` (HTTP status); absent status = network/timeout. */
export type RangeTransport = (url: string, start: number, endInclusive: number) => Promise<Uint8Array>;

export type DownloadResult = { bytesWritten: number; chunksFetched: number; chunksResumed: number };
export function downloadChunked(opts: {
  url: string;
  destPath: string;
  totalBytes: number;      // caller probes via HEAD Content-Length
  transport: RangeTransport;
  concurrency?: number;    // default 6 — the server 503s above this
  chunkBytes?: number;     // default 8 MiB
  maxAttempts?: number;    // default 8
  baseDelayMs?: number;    // default 1000; exponential ×2 per attempt
}): Promise<DownloadResult>;
```

**Behaviour contract:**

- **Backoff:** retry a chunk on status 503/429/5xx **or** a status-less error (timeout/network), waiting `baseDelayMs · 2^attempt`; any other HTTP status (403/404) rethrows immediately — a wrong URL must fail loudly, not retry for minutes.
- **Resume (the `fetchHyperLeda` rule adapted to binary):** completed chunks are recorded durably as they land (part-file `<dest>.part` written at chunk offsets + a completed-chunk-index state sidecar `<dest>.chunks.json`); failed chunks are **never** recorded. A re-run fetches only missing chunks (`chunksResumed` reports the skips). On completion: rename `.part` → final, delete the state sidecar.
- **Worker-pool concurrency** (the `fetchHyperLeda` shared-cursor `worker()` idiom), never `Promise.all` over all chunks.
- **sha256 sidecar:** after each file completes, compute its SHA-256 and upsert the `<hex>  <filename>` line in `rawDataPath('desi.sha256')`. If the sidecar already pins a hash for that file and the fresh hash differs → exit non-zero with a stale/truncated warning (the CF4/structures verification role).
- `main()` (CLI-gated via the `invokedDirectly` idiom): HEAD each of the four NGC URLs for `Content-Length`, download sequentially (files are internally parallel at 6 chunks; two files × 6 chunks would double the server load), write into the Task 1 registry paths.

**Test names + assertions** (mock transport with **typed** `vi.fn` per project convention — e.g. `vi.fn<RangeTransport>()`; file I/O against a temp dir; zero network):

- `planChunks: 20 MiB at 8 MiB chunks → 3 chunks; last endInclusive === totalBytes − 1` — also assert chunk 0 is `{ start: 0, endInclusive: 8·2²⁰ − 1 }`.
- `planChunks: an exact multiple produces no zero-length tail chunk`.
- `downloads all chunks and assembles a byte-identical file` — transport returns deterministic per-chunk bytes; compare final file to expectation.
- `retries on 503 with exponential backoff, then succeeds` — transport fails twice with `status: 503` then succeeds; assert 3 calls for that chunk and (with fake timers or injected sleep) delays of base, 2×base.
- `rethrows immediately on 404 without retry` — exactly 1 call.
- `resumes: a second run fetches only the chunks the first (interrupted) run did not complete` — assert `chunksResumed` and that the transport was not re-called for completed chunk ranges.
- `never exceeds 6 chunks in flight` — instrumented transport counts concurrent invocations; `expect(maxInFlight).toBeLessThanOrEqual(6)`.
- `writes the sha256 sidecar line on completion` and `fails loudly when the sidecar pins a different hash`.

**Steps**

- [ ] Failing tests → run → implement → run → green; `npm run typecheck`.
- [ ] Add the npm script.
- [ ] Commit: `git add tools/fetch/fetchDesi.ts tests/tools/fetch/fetchDesi.test.ts package.json`

---

## Task 7 — build-pipeline integration: cone constant, crossMatch, `desi-deep.bin`, census

**Files**

- Create: `tools/catalog/desiCone.ts`
- Modify: `tools/catalog/crossMatch.ts` (`CrossMatchInputs` + concat order)
- Modify: `tools/catalog/buildAllBins.ts` (DESI load + logging)
- Create: `tools/catalog/desiConeCensus.ts`
- Modify: `package.json` (`"desi-cone-census": "tsx tools/catalog/desiConeCensus.ts"`)
- Modify: `tests/crossMatch.test.ts`; Create: `tests/catalog/buildAllBins.desiDeep.test.ts` (model: `tests/catalog/buildAllBins.milliquas.test.ts`)

**Cone constant** — the single source of truth both the build and the census read:

```ts
// tools/catalog/desiCone.ts
export const DESI_CONE = { raDeg: 233.2, decDeg: 32.3, radiusDeg: 2.5 } as const;
```

**crossMatch:** `CrossMatchInputs` gains `desiDeep: ParsedRecord[]` (required — existing call sites and tests add `desiDeep: []`, which the compiler enforces). Concat order becomes `[...sdss, ...twoMrs, ...glade, ...desiDeep]`: **DESI is lowest priority**, so (a) every existing bin stays byte-stable — SDSS/2MRS/GLADE keep their rows and DESI only contributes rows nobody else has — and (b) the low-z BGS overlap (≈15% already in GLADE/SDSS per the research doc) dedups away. Same-sightline cluster members survive by the existing both-gates rule (5 arcsec AND |Δz|/(1+z) < 1% must BOTH trip) — that is the finger-of-god preservation the whole feature rests on; do not touch the tolerances. Update the module docstring's priority line. **Why through crossMatch when Milliquas bypasses it:** Milliquas AGN cores are physically distinct objects from host-galaxy rows; DESI rows are the same galaxies the other surveys list, so skipping dedup would double-render the cone's low-z end.

**buildAllBins:** a `loadDesi` helper mirroring `loadMilliquas` (`buildAllBins.ts:313-338`): missing-file tolerant (fresh checkouts without the 820 MB fetch still build every other bin — log `desi-deep.bin will be empty/skipped`), reads each of the four registry paths, calls `parseDesiClustering(buf, tracer, makeConeFilter(DESI_CONE.raDeg, DESI_CONE.decDeg, DESI_CONE.radiusDeg))`, logs per-tracer kept/skipped counts (the operator's eyes-on signal). **Buffer→ArrayBuffer gotcha:** `readFileSync` returns a `Buffer` view over a possibly-pooled ArrayBuffer — slice explicitly (`buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength)`) before handing to the parser. Feed the concatenated records into `crossMatch` as `desiDeep`; the existing `bySource` bucketing + tier loop then writes `desi-deep.bin` exactly once (empty `tierTargets` ⇒ `tierFilenameForSource` returns the bare name for all tiers and the `written` set dedups). Positions come from the existing ΛCDM `redshiftToDistanceMpc` inside `raDecZToCartesian` — no new math. Add DESI to the `inputCounts` dedup report.

**Census diagnostic (the designated ≤2°-nudge re-check):** `tools/catalog/desiConeCensus.ts` streams the four local files (registry paths; errors with a "run npm run fetch-desi first" message when absent) and prints a table of exact per-tracer row counts inside a 2.5° cone at (a) the configured `DESI_CONE` center and (b) a grid of candidate centers at 0.5° steps within ±2° in RA/Dec. Output ends with the instruction printed verbatim: *"If a candidate within 2° beats the configured center by a clear margin in BGS AND LRG (the finger-of-god tracers), update raDeg/decDeg in tools/catalog/desiCone.ts — one file — and re-run npm run build-all."* No test beyond a smoke assertion that the module exports its `main` without side effects at import (the `invokedDirectly` idiom); the tool is operator-facing.

**Test names + assertions**

- `tests/crossMatch.test.ts` — existing calls gain `desiDeep: []`; new: `a DESI record within 5 arcsec and 1% z of an SDSS record is dropped (SDSS wins)`; `a DESI same-sightline pair with Δz beyond tolerance survives` (two records, same RA/Dec, z 0.07 vs 0.09 → both kept); `a DESI-only sky region passes through untouched`.
- `tests/catalog/buildAllBins.desiDeep.test.ts` — `recordsToCloud applies fallbackOrientation to DESI's null-orientation records` (finite axisRatio/PA out); `DESI records carry classByte through to the cloud` (tracer byte survives the SoA fill).

**Steps**

- [ ] Failing tests → run → implement (`desiCone.ts`, crossMatch change, `loadDesi`, census) → run → green; `npm run typecheck`.
- [ ] Smoke: `npm run build-all` on a checkout **without** the DESI files → every existing bin still builds, DESI logged as skipped.
- [ ] Commit: `git add tools/catalog/desiCone.ts tools/catalog/crossMatch.ts tools/catalog/buildAllBins.ts tools/catalog/desiConeCensus.ts package.json tests/crossMatch.test.ts tests/catalog/buildAllBins.desiDeep.test.ts`

---

## Task 8 — engine runtime wiring (slot registration + demand table)

The `/add-data-source` skill's Path-A surface, enumerated explicitly — implementer subagents do not load the skill. The loader itself (`galaxyCatalogFetcher.ts`) is registry-driven and needs **no** change; `tierFilenameForSource` already resolves `desi-deep.bin` and the empty `tierTargets` means no per-tier 404 short-circuit ever fires.

**Files**

- Modify: `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts` — add the row (match the existing row shape at lines 58-88): `{ source: Source.DesiDeep, shortName: 'desiDeep', fetcher: galaxyCatalogFetcher, category: 'survey' }`. The derived `GALAXY_CATALOG_POINT_SOURCES` / `TIER_FETCHED_POINT_SOURCES` lists update automatically. This is the site that mints the slot at `initGpu` and re-requests on tier switch.
- Modify: `src/services/engine/wiring/assetWiring.ts` — add `pointRow(Source.DesiDeep)` to `ASSET_WIRING` (lines 107-113); update the "5 galaxy catalogs" count comments here and at `buildSlotsFromRegistry.ts:14`.
- Modify (tests): `tests/services/engine/wiring/galaxyCatalogSourceRegistry.test.ts` — `'declares exactly the 6 expected sources'` → 7 + the three `toEqual` source lists (~lines 119-159); `tests/services/engine/wiring/assetWiring.test.ts` — expected point-key list, length assertion, `built: 'external'` list; `tests/services/engine/wiring/demandTable.test.ts` — `ALL_POINT_SOURCES` (line ~206) + the boot-default `toEqual` sets (~lines 315, 329, 356, 417, 493); `tests/services/engine/wiring/engineSliceDispatches.test.ts` if its fixtures enumerate point sources.

**Steps**

- [ ] Update the wiring tests to the 7-source shape (failing) → run.
- [ ] Add the registry row + `pointRow`; fix comments → run → green; `npm run typecheck`.
- [ ] Commit: `git add src/services/engine/wiring/galaxyCatalogSourceRegistry.ts src/services/engine/wiring/assetWiring.ts src/services/engine/wiring/buildSlotsFromRegistry.ts tests/services/engine/wiring/…`

---

## Task 9 — UI wiring: Settings toggle, InfoCard, credits

**Files**

- Modify: `src/components/SettingsPanel/GalaxiesSection.tsx` — append `Source.DesiDeep` to the hand-maintained `TOGGLEABLE_SOURCES` (lines 42-48; a **silent** site — nothing fails if missed, the source is just untoggleable). Label comes from the registry (`'DESI Deep Field'`).
- Modify: `src/services/engine/helpers/buildGalaxyInfo.ts` — the per-source chain (lines 77-197): DESI rows need (a) a display-name path — verify the IAU fallback (`iauPrefix: 'DESI'` → `DESI J<RA><Dec>`) already fires for unknown sources, add a branch only if it doesn't; (b) a type/class line from Task 4's tracer `classByte` label so the InfoCard says which population (BGS / LRG / ELG / QSO) the point belongs to — the spec's "the InfoCard says what each population is"; (c) for LRG/ELG/QSO rows (classByte 2–4), suppress the magnitude rows and show "no photometry in source catalog" instead — their mags are synthetic display constants (Task 4 decision) and must not be presented as measurements. `bandLabels` and the source label flow from the registry automatically.
- Modify: `src/components/Splash/Splash.tsx` (~line 220) — add a DESI DR1 credit line (CC BY 4.0, data.desi.lbl.gov), matching the existing credit style.
- Modify: `src/@types/data/SourceEntryBase.d.ts:34` — comment accuracy only (the bulk-catalog list gains desiDeep).
- Modify (tests): `tests/components/SettingsPanel/GalaxiesSection.test.ts` — `ALL_ON_MASK` (line 37), the "5 sources" comments, `toHaveBeenCalledTimes(5)` → 6; `tests/services/engine/helpers/buildGalaxyInfoBySource.test.ts` — new cases below.

**Test names + assertions**

- GalaxiesSection: `renders a checkbox row for DESI Deep Field` and the master tri-state count updated to 6.
- buildGalaxyInfo: `DESI row shows the IAU-style DESI J designation`; `DESI row surfaces the tracer population from classByte` (classByte 4 → the QSO label); `DESI BGS row band labels come from the registry (g/r/z in the G/R/I slots)`; `DESI LRG/ELG/QSO rows suppress magnitudes and show the no-photometry note` (classByte 2–4).

**Steps**

- [ ] Failing tests → run → implement → run → green; `npm run typecheck`.
- [ ] Commit: `git add src/components/SettingsPanel/GalaxiesSection.tsx src/services/engine/helpers/buildGalaxyInfo.ts src/components/Splash/Splash.tsx src/@types/data/SourceEntryBase.d.ts tests/…`

---

## Task 10 — deploy surface + docs

**Files**

- Modify: `tools/deploy/syncR2.ts` — add `name === 'desi-deep.bin'` to `ALLOW` (with the file's didactic comment style: tier-agnostic like `2mrs.bin`, built by `build-all` from the DESI raw files).
- Modify: `tests/tools/deploy/syncR2.test.ts` — `ALLOW accepts desi-deep.bin`; `ALLOW rejects tier-suffixed desi-deep-large.bin` (the existing test does NOT enumerate per-catalog names, so without these two assertions a filter typo ships silently).
- Modify: `CLAUDE.md` — the deploy-section variant list ("A complete R2 sync must include every variant…"): add `desi-deep.bin` to the tier-agnostic set; add a one-line "Re-run order when DESI raw data changes" mirroring the CF4 block (`fetch-desi` → `build-tiers` → `sync-r2-secure`).
- Modify: `docs/BACKLOG.md` — per the spec: the "DESI DR1 as a data source" item **stays** (the full survey remains blocked on the ~10× point ceiling); append a terse cross-reference clause on its index line pointing at the shipped cone spec (`docs/superpowers/specs/2026-07-07-desi-deep-cone-design.md`). Keep the line short per backlog hygiene.
- Modify: `ATTRIBUTIONS.md` — add a **"DESI DR1 — Dark Energy Spectroscopic Instrument"** subsection under "Catalogue data", matching the existing Use/Reference/Licence shape: Use = LSS clustering catalogs (4 NGC tracer files) cone-filtered to the CrB deep cone; Reference = DESI Collaboration et al. (2026), "Data Release 1 of the Dark Energy Spectroscopic Instrument", AJ 171, 285 (ads: 2026AJ....171..285D); Licence = CC BY 4.0. Include DESI's required acknowledgment VERBATIM (fetched from data.desi.lbl.gov/doc/acknowledgments 2026-07-09 — needed for the Zenodo DOI / JOSS): the full paragraph beginning "This research used data obtained with the Dark Energy Spectroscopic Instrument (DESI). DESI construction and operations is managed by the Lawrence Berkeley National Laboratory. This material is based upon work supported by the U.S. Department of Energy, Office of Science, Office of High-Energy Physics, under Contract No. DE–AC02–05CH11231, and by the National Energy Research Scientific Computing Center, a DOE Office of Science User Facility under the same contract. Additional support for DESI was provided by the U.S. National Science Foundation (NSF), Division of Astronomical Sciences under Contract No. AST-0950945 to the NSF's National Optical-Infrared Astronomy Research Laboratory; the Science and Technology Facilities Council of the United Kingdom; the Gordon and Betty Moore Foundation; the Heising-Simons Foundation; the French Alternative Energies and Atomic Energy Commission (CEA); the National Council of Humanities, Science and Technology of Mexico (CONAHCYT); the Ministry of Science and Innovation of Spain (MICINN), and by the DESI Member Institutions." ATTRIBUTIONS.md is the canonical copy.
- Modify: `data/raw/desi/README.md` — add a short "Required acknowledgment" note with the DR1 citation and a pointer to the ATTRIBUTIONS.md section (no duplicated paragraph). `CITATION.cff` and `README.md` intentionally unchanged (CITATION.cff cites skymap, not datasets; per-dataset credits live in ATTRIBUTIONS.md).

**Steps**

- [ ] Add the two failing ALLOW assertions → run → add the ALLOW line → run → green.
- [ ] CLAUDE.md + BACKLOG edits.
- [ ] Commit: `git add tools/deploy/syncR2.ts tests/tools/deploy/syncR2.test.ts CLAUDE.md docs/BACKLOG.md`

---

## Task 11 — full verification, real-data build, visual gate, DoD

The ~820 MB fetch and the real build are **human/main-thread steps, not CI and not subagent work** — document, run once, verify.

**Steps**

- [ ] `npm run typecheck` (both tsconfigs) → clean; `npm test` → whole suite green.
- [ ] **Human:** `npm run fetch-desi` (~820 MB, four NGC files; resumable — an interrupted run continues). On completion, commit the fetcher-written `data/raw/desi/desi_dr1_lss.sha256` (it's a committed registry entry that can only exist post-fetch).
- [ ] **Human:** `npm run desi-cone-census` — record the exact per-tracer counts at the configured center (spec estimates: BGS ~14.5k, LRG ~15.1k, ELG ~21.3k, QSO ~5.5k, ±20-40%). If a candidate ≤2° away is clearly better in BGS AND LRG, update `tools/catalog/desiCone.ts` (only file) and note it in the commit message.
- [ ] **Human:** `npm run build-all` — confirm the log shows per-tracer parse counts, the crossMatch dedup line for DESI, and `wrote N points to …/desi-deep.bin` with N ≈ census total minus dedup (~50-56k ⇒ ~3.5 MB at 64 B/galaxy).
- [ ] **Visual gate (dev server is already running — ask the user to look):** DESI Deep Field appears in Settings with a count; toggling it on shows the dense low-z CrB spike with visible fingers of god (radial spikes aimed at the origin) and the thinning ELG/QSO tail; the hard cone edge reads as a drill core; flying out to ~7 Gpc keeps camera + scale bar sane; clicking a cone point opens an InfoCard with the DESI J name, tracer population, and g/r/z band labels; toggling off removes the cone.
- [ ] **Human (main checkout only, per `project_worktree_data_isolation`):** `npm run sync-r2-secure` — confirm `desi-deep.bin` uploads + purges.
- [ ] Run the entanglement-radar lens over the full diff — expected clean points: one cone-constant file, one tracer-class source of truth, no mirrored source lists beyond the known pre-existing hand-maintained sites this plan already edits.
- [ ] DoD checklist:
  - [ ] All tasks committed; suite green; no stray TODOs in the diff.
  - [ ] `desi-deep.bin` built from real data and visually confirmed.
  - [ ] `data/raw/desi/README.md` + `.sha256` committed; raw `.fits` files correctly gitignored.
  - [ ] `buildFilaments` still ingests only 2MRS+GLADE (the spec's DisPerSE exclusion) — verify DESI cannot reach the density field via any "all sources" enumeration.
  - [ ] R2 synced; CLAUDE.md variant list + BACKLOG cross-reference updated.
  - [ ] The clip (plan 2) is NOT part of this plan's DoD.
- [ ] `/feature-done` audit → relocate this plan + the spec to `plans/completed/` + `specs/completed/` (the spec moves when plan 2 ships if the audit prefers keeping it live — note the two-plan split to the auditor).
