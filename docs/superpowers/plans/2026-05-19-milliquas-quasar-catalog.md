# Milliquas v8 Quasar Catalog Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add Milliquas v8 (Flesch 2023, ~880k spec-z quasars) as a new top-level survey source rendered alongside SDSS/2MRS/GLADE/Famous, with the standard tier system, off-by-default visibility toggle, and full deploy pipeline.

**Architecture:** Reuse the existing `GalaxyCatalog` v4 binary format (zeroing the galaxy-specific morphology slots — axisRatio, PA, diameter, vMaxWeight, schechterRatio, angularDensityWeight). Add a new source code in the append-only enum, a fixed-width text parser following the 2MRS house style, a tier definition matching the GLADE shape, an off-by-default visibility toggle in SettingsPanel, and an R2 ALLOW-filter entry. No new pipeline shapes, no new picking machinery, no cross-matching against GLADE/2MRS for v1.

**Tech Stack:** Vitest + TS strict + plain Node fs APIs for parsing/building; React for the toggle; existing WebGPU pipeline reused verbatim.

---

## Design decisions committed in this plan

These are locked. Re-litigating them is out of scope for the implementer.

1. **Catalog file format:** Parse the Milliquas v8 fixed-width text release (the `milliquas.txt`-style file linked from https://quasars.org/milliquas.htm). The published FITS file would force a new dependency (no FITS reader is in this codebase today) for no informational advantage — the text release carries the same columns. House style for fixed-width parsers is already established in `tools/parsers/twoMrs.ts`.
2. **Spec-z subset only:** Exclude rows whose primary z is a 0.1-rounded photometric estimate (Milliquas marks the ~66k pQSO≥99% candidates this way). Spec-z rows with an *additional* Gaia QSOC photo-z column populated are included, but the QSOC photo-z is ignored — we trust the spec-z.
3. **Binary format:** Reuse `GalaxyCatalog` v4 unchanged. Unused slots are zeroed; the parser encodes this rationale in its docstring (point-source AGN have no morphology; forking the format would multiply pipeline branches for ~30 MB of slot waste that gzips out on R2 anyway).
4. **Source code:** Append-only assignment per `src/data/sources.ts`'s documented rule. The implementer chooses the next free integer at task time (do not pre-pick — check the file when adding the entry).
5. **Magnitude slot for billboard sizing:** Use Milliquas' red optical magnitude (`Rmag` in the released schema) → `magR`. Rationale: closer to existing optical convention than the blue magnitude, comparable in band centre to SDSS r and GLADE J. Task 2's test will verify the column is non-empty on a fixture row.
6. **Colour index:** `magG` (blue optical, `Bmag` from Milliquas) and `magR` (red optical). The spec entry below maps `g-r` directly. Concrete `rangeMin`/`rangeMax` values are first-pass numbers calibrated against the colours of known type-I QSOs (typically B-R ≈ 0.3 for unobscured Q; 0.8-1.5 for reddened types) and are flagged for visual review.
7. **Object-class colourisation:** v1 stores the class as a single-character ASCII code preserved in the *raw* parser output for future use but does NOT reach the GPU — the colour ramp is driven entirely by the colour index above. Class-specific tinting (blazars bluer, type-IIs redder) is **deferred to a v2 plan**; doing it now requires either a new per-galaxy byte in the binary format or a class→synthetic-mag-bias hack, neither of which is appropriate for v1.
8. **Cosmology:** Reuse `src/utils/math/redshiftToDistanceMpc.ts`. Milliquas reaches z ≳ 7 in the long tail; the linear Hubble approximation breaks past z ≳ 0.3, but the existing helper is what every other parser uses and replacing it project-wide is a separate plan. Document the limitation in the parser docstring.
9. **Default visibility:** Off. Add a `Milliquas` toggle entry in `TOGGLEABLE_SOURCES` and clear its bit in the default visibility mask.
10. **Picking:** No changes to `selectionEncoding.ts`. New source code slots into the existing 0..4 galaxy band (code 5..7 are POI-only).
11. **Cross-matching:** None for v1. A Milliquas point and a GLADE host galaxy at the same sky position will overlap — acceptable because the AGN core sits inside its host's billboard and is hidden in normal viewing. This is a v1 simplification, not a permanent design choice.
12. **Tier targets:** small=excluded (0, matches SDSS small-tier pattern), medium=200_000, large=no cap. Numbers proposed by analogy to GLADE's `256_000`/`400_000`/no-cap shape; implementer should sanity-check by visualising the medium tier and revising before merging.
13. **Magnitude unit:** Apparent magnitude in the published Milliquas band. `pointRenderer.ts` already consumes `magR` as an apparent magnitude for SDSS r — the unit is unchanged.

---

## Open questions resolved during implementation

1. **Raw file location and committal:** ~31 MB zipped text — too big for git. Add `data/raw/milliquas/` to `.gitignore` and provide `tools/fetch/fetchMilliquas.ts` that curls the upstream zip, verifies a checksum, and unpacks to `data/raw/milliquas/milliquas.txt`. Resume-cache pattern from `fetchHyperLeda.ts` is overkill (single download, not millions of API calls) — a plain idempotent fetcher is correct.
2. **InfoCard title:** Milliquas has no PGC. Use the catalog's original `Name` column verbatim (e.g. `3C 273`, `SDSS J123456.78+012345.6`). Stored as a string sidecar (`milliquas_names.json`, keyed by `localIdx`) rather than in the binary format — adding a string column to the 64-byte record would force a format bump. The sidecar is parallel to `famous_meta.json`.
3. **Photo-z handling within spec-z rows:** When a row has both spec-z and a Gaia QSOC photo-z, the parser uses spec-z. The QSOC column is read but discarded.
4. **z=0 / negative z handling:** Mirror 2MRS' rule. Reject z=0 as the sentinel-row pattern; allow negative z if present (rare in QSOs but theoretically possible). Document the exact predicate in the parser.

---

## File Structure

**New files**

- `tools/parsers/milliquas.ts` — fixed-width parser → `ParsedRecord[]` plus `MilliquasParseResult.names: string[]` sidecar
- `tools/fetch/fetchMilliquas.ts` — one-shot downloader with checksum verification
- `tests/parsers/milliquas.test.ts` — parser unit tests + fixture
- `tests/fixtures/milliquas/sample.txt` — ~20-row hand-curated fixture covering all class codes, the spec-z/photo-z distinction, and the z=0 reject case
- `data/raw/milliquas/README.md` — short instructions: "run `npm run fetch-milliquas` to pull the upstream catalog"

**Modified files**

- `src/data/sources.ts` — add `Milliquas` enum entry (next free code), populate LABELS, ALL_SKY (`true` — Milliquas is sky-complete), MAX_DIST_MPC (~9000 Mpc for the z ≲ 2 bulk + tail; framing target), BAND_LABELS (`u: '—', g: 'B', r: 'R', i: '—', z: '—'`), append to `ALL_SOURCES`
- `src/data/colourIndex.ts` — add `[Source.Milliquas]: { slotA: 'g', slotB: 'r', rangeMin: -0.5, rangeMax: 2.0, kPerZ: 0.0 }` (first-pass numbers — flag for visual calibration)
- `src/data/tierTargets.ts` — add Milliquas to `BASE_FILENAMES` (`'milliquas'`), `TIERED_SOURCES` set, and per-tier `TIER_TARGETS` entries
- `tools/catalog/buildAllBins.ts` — add `--milliquas` CLI flag + default path, wire `parseMilliquas` through `loadOrEmpty`, route the resulting records to the per-source bucket without going through `crossMatch` (Milliquas has no priority-tier overlap with the three galaxy catalogs — see Task 5 for rationale)
- `tools/deploy/syncR2.ts` — extend the `ALLOW` regex to include `milliquas-(small|medium|large).bin` and add a single-file entry for the `milliquas_names.json` sidecar
- `src/components/SettingsPanel/SettingsPanel.tsx` — append `Source.Milliquas` to `TOGGLEABLE_SOURCES`
- `src/data/defaults.ts` (or wherever the default visibility mask is defined — implementer to locate) — clear Milliquas' bit in the initial mask
- `package.json` — add `fetch-milliquas` script
- `.gitignore` — add `data/raw/milliquas/`
- `README.md` — add Flesch 2023 citation block

---

# Phase 1: Parser

## Task 1: Fixture file

**Files:**
- Create: `tests/fixtures/milliquas/sample.txt`

- [ ] **Step 1: Download the Milliquas v8 readme/format spec**

The fixed-width column layout is published on https://quasars.org/milliquas.htm under "Description of the file". Read it before writing the fixture. Specifically note: the `Z` column position, the `Class` column position (single character: Q, A, K, N, B, 2, plus subtypes), the `Bmag`/`Rmag` columns, the `Name` column width, the `Rband` photometric-type flag, and the `qpct` photo-z confidence column.

- [ ] **Step 2: Construct a fixture with ~20 hand-picked rows**

Include at least: one Q (3C 273), one A, one K, one N, one B (blazar — e.g. Mrk 421), one 2 (type-II), one row with z=0.0000 (must be rejected), one row marked as a 0.1-rounded photo-z candidate (must be rejected), one row with both spec-z and Gaia QSOC populated, one row with blank/missing Bmag (Rmag-only), one row near the catalog's faint limit, one row at z > 4. Copy the byte alignment exactly from the upstream spec.

- [ ] **Step 3: Commit**

```bash
git add tests/fixtures/milliquas/sample.txt
git commit -m "test(milliquas): add hand-curated parser fixture"
```

**Acceptance criterion:** Fixture file exists and the byte layout matches the upstream spec exactly. No code yet — the next task writes the parser against this fixture.

---

## Task 2: Parser — happy path

**Files:**
- Create: `tools/parsers/milliquas.ts`
- Test: `tests/parsers/milliquas.test.ts`

- [ ] **Step 1: Write the failing happy-path test**

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseMilliquas } from '../../tools/parsers/milliquas';
import { Source } from '../../src/data/sources';

describe('parseMilliquas', () => {
  const raw = readFileSync(resolve(__dirname, '../fixtures/milliquas/sample.txt'), 'utf8');

  it('parses 3C 273 with the expected fields', () => {
    const { records, names } = parseMilliquas(raw);
    const i = names.findIndex((n) => n === '3C 273');
    expect(i).toBeGreaterThanOrEqual(0);
    const r = records[i]!;
    expect(r.source).toBe(Source.Milliquas);
    expect(r.ra).toBeCloseTo(187.2779, 3);
    expect(r.dec).toBeCloseTo(2.0524, 3);
    expect(r.z).toBeCloseTo(0.158, 3);
    expect(r.magR).toBeCloseTo(12.85, 2);
    expect(Number.isFinite(r.magG)).toBe(true);
    expect(r.axisRatio).toBeNull();
    expect(r.positionAngleDeg).toBeNull();
    expect(r.diameterKpc).toBeNull();
    expect(r.objID).toBe(0n);
  });
});
```

- [ ] **Step 2: Run to confirm it fails**

Run: `npx vitest run tests/parsers/milliquas.test.ts`
Expected: FAIL ("Cannot find module 'tools/parsers/milliquas'" or similar).

- [ ] **Step 3: Write the minimal parser**

Implement `parseMilliquas(rawText: string): { records: ParsedRecord[]; names: string[]; skipped: number }`. Follow `twoMrs.ts` house style verbatim — module docstring with byte layout, named constants for sentinels, slice-based fixed-width extraction. Set `objID = 0n`, `axisRatio = null`, `positionAngleDeg = null`, `diameterKpc = null`. Map B-band → `magG`, R-band → `magR`, set `magU/magI/magZ = NaN`. Names array is parallel to records.

Module docstring must explain *why* axisRatio/PA/diameter are null (QSOs are unresolved point sources — there is no morphology to measure) and *why* we reuse the v4 binary format anyway (the unused 4-byte slots gzip out on R2, and forking the format would multiply downstream branches for negligible gain).

- [ ] **Step 4: Run to confirm pass**

Run: `npx vitest run tests/parsers/milliquas.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add tools/parsers/milliquas.ts tests/parsers/milliquas.test.ts
git commit -m "feat(milliquas): add fixed-width text parser"
```

---

## Task 3: Parser — skip rules

**Files:**
- Modify: `tools/parsers/milliquas.ts`
- Modify: `tests/parsers/milliquas.test.ts`

- [ ] **Step 1: Add failing tests for each skip case**

```ts
it('rejects z=0 sentinel rows', () => {
  const { records, skipped } = parseMilliquas(raw);
  expect(records.every((r) => r.z !== 0)).toBe(true);
  expect(skipped).toBeGreaterThan(0);
});

it('rejects 0.1-rounded photo-z candidate rows', () => {
  const { names } = parseMilliquas(raw);
  // The fixture row marked as pQSO≥99% photo-z must not appear.
  expect(names).not.toContain('FAKE_PHOTOZ_CANDIDATE');
});

it('prefers spec-z over Gaia QSOC photo-z when both present', () => {
  const { records, names } = parseMilliquas(raw);
  const i = names.findIndex((n) => n === 'FAKE_SPECZ_PLUS_QSOC');
  expect(records[i]!.z).toBeCloseTo(/* spec-z value from fixture */, 4);
});

it('accepts rows with blank Bmag (Rmag-only)', () => {
  const { records, names } = parseMilliquas(raw);
  const i = names.findIndex((n) => n === 'FAKE_RMAG_ONLY');
  expect(Number.isFinite(records[i]!.magR)).toBe(true);
  expect(Number.isNaN(records[i]!.magG)).toBe(true);
});
```

- [ ] **Step 2: Run to confirm failures**

Run: `npx vitest run tests/parsers/milliquas.test.ts`
Expected: the new four tests FAIL with assertion errors.

- [ ] **Step 3: Implement the skip rules**

In `parseMilliquas`, add (with named constants and docstring paragraphs explaining each):
- `if (z === 0) { skipped++; continue; }` (the sentinel-row pattern from 2MRS)
- Detect Milliquas' photo-z-rounded flag (the readme will name the column — `qpct` is the published 0..100 confidence; "0.1-rounded photo-z" rows have a specific marker, identify it from the readme and use the exact predicate)
- Treat blank `Bmag` as NaN (mirror 2MRS' J=99.999 sentinel translation)
- When both spec-z and Gaia QSOC z columns are populated, take the spec-z column unconditionally

- [ ] **Step 4: Run to confirm pass**

Run: `npx vitest run tests/parsers/milliquas.test.ts`
Expected: PASS, all six tests.

- [ ] **Step 5: Commit**

```bash
git add tools/parsers/milliquas.ts tests/parsers/milliquas.test.ts
git commit -m "feat(milliquas): apply spec-z-only and z=0 skip rules"
```

---

# Phase 2: Source enum + metadata

## Task 4: Append Milliquas to the source enum

**Files:**
- Modify: `src/data/sources.ts`
- Modify: `src/data/colourIndex.ts`
- Test: `tests/data/sources.test.ts` (if it exists — implementer to check)

- [ ] **Step 1: Open `src/data/sources.ts` and find the highest currently-allocated source code**

Read the file. The Source object lists codes 0..7. POI codes 5/6/7 are reserved. The next free survey code is whatever comes after the last `Famous = 4` survey entry — but POI codes are interleaved, so the implementer must pick the next integer that is NOT already used by Cluster/Supercluster/Void. Append-only rule: do NOT renumber any existing entry, do NOT recycle a code, even one that looks free.

- [ ] **Step 2: Write a failing test asserting the new source has a label**

```ts
import { sourceLabel, Source } from '../../src/data/sources';
it('labels Milliquas', () => {
  expect(sourceLabel(Source.Milliquas)).toBe('Milliquas');
});
```

- [ ] **Step 3: Run to confirm it fails (Source.Milliquas does not exist)**

Run: `npx vitest run tests/data/sources.test.ts`
Expected: TS compile failure.

- [ ] **Step 4: Add the enum entry**

Add `Milliquas: N` at the next available integer (implementer fills `N`). Populate `LABELS` with `'Milliquas'`, `ALL_SKY` with `true`, `MAX_DIST_MPC` with `9000` (the catalog has objects to z ≈ 7 but the bulk is z ≲ 2; 9000 Mpc frames the bulk while leaving the tail visible), `BAND_LABELS` with `{ u: '—', g: 'B', r: 'R', i: '—', z: '—' }`. Append `Source.Milliquas` to `ALL_SOURCES`.

Update the `unpackPick` predicate in `src/data/selectionEncoding.ts` to recognise the new code as a galaxy hit. Specifically: change the `if (sourceCode <= 4)` branch upper bound to include the new code, and update the docstring listing the survey codes.

Add `[Source.Milliquas]: { slotA: 'g', slotB: 'r', rangeMin: -0.5, rangeMax: 2.0, kPerZ: 0.0 }` to `SPEC` in `colourIndex.ts`. Document the rangeMin/rangeMax as first-pass values pending visual calibration.

- [ ] **Step 5: Run to confirm pass**

Run: `npx vitest run` (all tests)
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add src/data/sources.ts src/data/selectionEncoding.ts src/data/colourIndex.ts tests/data/sources.test.ts
git commit -m "feat(milliquas): register source enum entry, label, and colour spec"
```

---

# Phase 3: Encoder integration

## Task 5: Wire Milliquas through buildAllBins

**Files:**
- Modify: `tools/catalog/buildAllBins.ts`
- Modify: `src/data/tierTargets.ts`
- Test: `tests/data/tierTargets.test.ts` (if absent, create it)

- [ ] **Step 1: Failing test for tierFilenameForSource**

```ts
import { tierFilenameForSource } from '../../src/data/tierTargets';
import { Source } from '../../src/data/sources';
it('returns tier-suffixed filenames for Milliquas', () => {
  expect(tierFilenameForSource(Source.Milliquas, 'small')).toBe('milliquas-small.bin');
  expect(tierFilenameForSource(Source.Milliquas, 'medium')).toBe('milliquas-medium.bin');
  expect(tierFilenameForSource(Source.Milliquas, 'large')).toBe('milliquas-large.bin');
});
```

- [ ] **Step 2: Run to confirm failure**

Run: `npx vitest run tests/data/tierTargets.test.ts`
Expected: FAIL.

- [ ] **Step 3: Extend `tierTargets.ts`**

- Add `[Source.Milliquas]: 'milliquas'` to `BASE_FILENAMES`.
- Add `Source.Milliquas` to `TIERED_SOURCES`.
- Add tier targets: small=0 (excluded), medium=200_000, large=undefined (no cap). Document the choice (analogous to GLADE; revise after visualising medium tier).

- [ ] **Step 4: Wire the CLI flag + parsing into buildAllBins**

In `buildAllBins.ts`:
- Add `args.milliquas` default = `'data/raw/milliquas/milliquas.txt'`.
- After parsing GLADE: `const milliquas = loadOrEmpty(args.milliquas, parseMilliquas);`. Note: `parseMilliquas` returns `{ records, names, skipped }` — the existing `loadOrEmpty` signature returns just records, so either (a) write a parallel `loadMilliquas` helper that returns records + names, or (b) extend `loadOrEmpty` to surface a sidecar payload. (a) is cleaner — Milliquas is the only catalog with a name sidecar.
- Route Milliquas records to its own bucket directly — do NOT pass them through `crossMatch`. Rationale: `crossMatch` deduplicates galaxies by position+redshift; a QSO at the centre of a GLADE host galaxy is a *distinct* physical entity (the AGN core, not the host's diffuse emission), so deduplicating would discard real data. Add a code comment explaining this.
- Write `milliquas_names.json` to the out-dir as `{ names: string[] }` mirroring `famous_meta.json`'s style. Match the encoded record order exactly (so `localIdx` indexes into `names` directly).

- [ ] **Step 5: Add a build-pipeline test**

```ts
// tests/catalog/buildAllBins.milliquas.test.ts
// Smoke-test that running parseMilliquas → recordsToCloud → encodeGalaxyCatalog
// → decodeGalaxyCatalog round-trips a fixture without throwing, and that the
// zeroed slots come back as zero.
```

The test should call `recordsToCloud(parsedMilliquas)` on the fixture-parsed records and assert: count > 0, magR is finite for the first record, axisRatio[0] === 0, positionAngleDeg[0] === 0, diameterKpc[0] === DEFAULT_GALAXY_DIAMETER_KPC (because the records-to-cloud helper applies the fallback). Round-trip through encode/decode and re-assert.

- [ ] **Step 6: Run all tests + typecheck**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src/data/tierTargets.ts tools/catalog/buildAllBins.ts tests/data/tierTargets.test.ts tests/catalog/buildAllBins.milliquas.test.ts
git commit -m "feat(milliquas): wire parser through buildAllBins and tier system"
```

---

# Phase 4: Fetcher

## Task 6: fetchMilliquas downloader

**Files:**
- Create: `tools/fetch/fetchMilliquas.ts`
- Create: `data/raw/milliquas/README.md`
- Modify: `.gitignore`
- Modify: `package.json`

- [ ] **Step 1: Add `data/raw/milliquas/` to `.gitignore`**

Append `data/raw/milliquas/` (with trailing slash to scope to the directory).

- [ ] **Step 2: Write the fetcher script**

`tools/fetch/fetchMilliquas.ts` curls the Milliquas v8 zip from https://quasars.org/, verifies the SHA-256 against a constant baked into the script (read the actual checksum from a fresh download once, paste into the source), unzips it to `data/raw/milliquas/milliquas.txt`. Idempotent: skip the download if the unpacked file already exists and its size matches the expected upstream size.

Match the docstring style of `fetchHyperLeda.ts` — explain why the upstream URL is what it is, why we verify the checksum (the file is unsigned and Milliquas releases are versioned by overwriting the same URL), and what to do if the checksum mismatches (manually inspect the new release before updating the constant).

- [ ] **Step 3: Add `fetch-milliquas` npm script**

In `package.json`, add `"fetch-milliquas": "tsx tools/fetch/fetchMilliquas.ts"` to the scripts block.

- [ ] **Step 4: Write `data/raw/milliquas/README.md`**

One-paragraph instructions: how to acquire the raw file (`npm run fetch-milliquas`), what version it points at, the upstream license (Flesch 2023 — public, citation required), and the expected file size for sanity-checking.

- [ ] **Step 5: Smoke-test the fetcher**

Run: `npm run fetch-milliquas` once locally. Verify the file appears at `data/raw/milliquas/milliquas.txt` and that the first few rows look right (use the Read tool, not cat).

- [ ] **Step 6: Commit**

```bash
git add tools/fetch/fetchMilliquas.ts data/raw/milliquas/README.md .gitignore package.json
git commit -m "feat(milliquas): add fetcher script with checksum verification"
```

---

# Phase 5: Runtime + UI

## Task 7: Settings panel toggle (default off)

**Files:**
- Modify: `src/components/SettingsPanel/SettingsPanel.tsx`
- Modify: the default visibility mask file (implementer locates: probably `src/data/defaults.ts` or a `state.ts`)
- Test: existing SettingsPanel test if present

- [ ] **Step 1: Locate the default visibility mask**

Grep for `ALL_VISIBLE_MASK` consumers to find where the initial mask is composed. The default-off pattern was established for CF-4 and MCPM — locate one of those (`grep -rn "cf4" src/` or search recent commits) and mirror it.

- [ ] **Step 2: Failing test asserting Milliquas is off by default**

Add (or extend) a test asserting `maskHas(defaultMask, Source.Milliquas) === false` while all other survey toggles match their current default.

- [ ] **Step 3: Run to confirm failure**

Expected: the new test FAILs because the mask currently has every bit set.

- [ ] **Step 4: Clear the Milliquas bit in the default mask**

Wherever the default is composed (likely `ALL_VISIBLE_MASK & ~ (1 << Source.Milliquas)` or an explicit per-source default list), exclude Milliquas. Match the exact pattern used for CF-4 / MCPM defaults — DO NOT introduce a new pattern.

- [ ] **Step 5: Append Milliquas to TOGGLEABLE_SOURCES in SettingsPanel.tsx**

Add `Source.Milliquas` to the ordered list in `SettingsPanel.tsx`. Order: place between SDSS and GLADE (the catalogue-size ordering is preserved). The toggle reuses the existing per-source row rendering — no new component is required.

- [ ] **Step 6: Run all tests + typecheck**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 7: Visual check**

Ask the user to verify in the browser: the Surveys section now lists Milliquas, unchecked by default; checking it triggers a `.bin` fetch and renders the points.

- [ ] **Step 8: Commit**

```bash
git add src/components/SettingsPanel/SettingsPanel.tsx <default-mask-file>
git commit -m "feat(milliquas): expose default-off visibility toggle"
```

---

## Task 8: InfoCard name lookup

**Files:**
- Modify: wherever the InfoCard resolves a galaxy's display name from `(source, localIdx)` (implementer locates via grep — likely `src/components/InfoCard/` or a hook)
- Modify: the cloudLoader's per-source loader (to fetch `milliquas_names.json` alongside the bin)

- [ ] **Step 1: Locate the InfoCard name-resolution pipeline**

Grep for `famous_meta.json` consumers — the same plumbing is the model: a parallel sidecar fetch when the Famous source is loaded, with the lookup-by-localIdx happening at hover/click time.

- [ ] **Step 2: Write a failing test**

```ts
it('resolves a Milliquas display name from localIdx', () => {
  const names = ['3C 273', 'PG 1116+080', /* ... */];
  expect(resolveMilliquasName(0, names)).toBe('3C 273');
});
```

- [ ] **Step 3: Implement the sidecar fetch + lookup**

Add a `milliquas_names.json` fetch to the cloudLoader's per-source pipeline (only when Milliquas is enabled). Cache the parsed names array alongside the decoded `GalaxyCatalog`. The InfoCard, on a Milliquas pick, reads `names[localIdx]` and renders it as the title.

- [ ] **Step 4: Run tests**

Run: `npm run typecheck && npx vitest run`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add <files>
git commit -m "feat(milliquas): wire name sidecar through InfoCard"
```

---

# Phase 6: Deploy plumbing

## Task 9: Extend R2 ALLOW filter

**Files:**
- Modify: `tools/deploy/syncR2.ts`

- [ ] **Step 1: Write a failing test (or extend the existing syncR2 test, if any)**

If `tests/deploy/syncR2.test.ts` exists, add a case asserting `ALLOW('milliquas-medium.bin') === true`. If no test exists, skip this step and rely on the build-and-inspect check below.

- [ ] **Step 2: Extend the ALLOW regex/predicate**

In `syncR2.ts`'s `ALLOW`, add a clause for `/^milliquas-(small|medium|large)\.bin$/` and another for the literal `milliquas_names.json`.

- [ ] **Step 3: Dry-run the sync locally**

After running `npm run build-tiers`, inspect `public/data/` and confirm Milliquas files are present. Then run `node -e "console.log(require('./tools/deploy/syncR2').ALLOW('milliquas-medium.bin'))"` (or equivalent) — should print `true`. Do NOT actually push to R2 in this task; that's the deploy step.

- [ ] **Step 4: Commit**

```bash
git add tools/deploy/syncR2.ts
git commit -m "feat(milliquas): extend R2 sync ALLOW filter"
```

---

## Task 10: README citation

**Files:**
- Modify: `README.md`

- [ ] **Step 1: Add the Flesch 2023 citation**

Add a one-line entry to the surveys/data-sources section of README.md citing Flesch 2023 (Milliquas v8, OJAp 6, 49). Follow the existing citation style used for SDSS / GLADE / 2MRS.

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs(milliquas): cite Flesch 2023 in README"
```

---

# Phase 7: Verification

## Task 11: End-to-end pipeline check

- [ ] **Step 1: Build all bins from scratch**

```bash
npm run fetch-milliquas
npm run build-tiers
```

Verify the following files exist in `public/data/`:
- `milliquas-medium.bin`
- `milliquas-large.bin`
- `milliquas_names.json`
- (no `milliquas-small.bin` — tier target is 0)

Check file sizes are reasonable (large should be roughly `880_000 * 64 + 16` bytes = ~56 MB before gzip).

- [ ] **Step 2: Full typecheck + tests**

```bash
npm run typecheck
npx vitest run
```

Expected: all green, including the new parser + tierTargets tests.

- [ ] **Step 3: Local dev visual check**

With `npm run dev` running, ask the user to:
- Open the SettingsPanel → Surveys
- Confirm Milliquas appears, unchecked
- Check it
- Observe the points appear (small bluish-white dots, distinct from GLADE galaxies' larger billboards)
- Click a Milliquas point → confirm the InfoCard shows the original Milliquas `Name`
- Switch tier small → medium → large, confirm only medium and large fetch a Milliquas bin (small should return 404 / skip cleanly)
- Toggle off; confirm Milliquas points disappear

- [ ] **Step 4: Validate colour-index calibration**

The colour-index rangeMin/rangeMax values in `colourIndex.ts` are first-pass numbers. Visually inspect: 3C 273 and a few well-known blue quasars should render visibly bluer than reddened type-IIs (if any are present nearby on screen). If the ramp looks washed out (everything the same colour), revise the range in a follow-up commit — do NOT block on this for the initial merge.

- [ ] **Step 5: Commit any final tuning**

```bash
git add <any tweaked files>
git commit -m "tune(milliquas): calibrate colour-index range from visual check"
```

- [ ] **Step 6: PR**

Open a PR per the project's branch+PR convention (see `~/.claude/projects/-Users-rulkens-Development-js-skymap/memory/feedback_branch_and_pr.md`). Summarise: new source, default off, tier shape mirrors GLADE, no cross-matching for v1, name sidecar pattern matches Famous.

---

# Out of scope (deferred to a v2 plan)

- Class-specific colourisation (Q vs B vs 2 vs K vs N): requires either a new per-galaxy byte in the binary format or a class→synthetic-bias hack. Deferred.
- Cross-matching against GLADE/2MRS to suppress AGN+host duplicates at close zoom. Deferred — visual overlap is acceptable for v1.
- Full ΛCDM comoving-distance integral (current linear Hubble approximation breaks past z ≳ 0.3, but the same limitation applies to every other catalog). Project-wide change, separate plan.
- High-z quasar visualisation (Milliquas reaches z ≈ 7; current camera framing tops out near GLADE's ~1500 Mpc). Likely needs a new "deep universe" framing mode.
- Photo-z-only candidate inclusion (the ~66k pQSO≥99% rounded-z rows). They'd need their own toggle and a clear UI distinction from spec-z entries.
