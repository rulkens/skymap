# Milliquas Bin Class+Parent-Survey Byte Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bump the on-disk `.bin` galaxy catalog format from v4 to v5 to add two per-record bytes (`classByte` + `parentSurveyByte`), populate them for Milliquas, surface AGN class + parent-survey-prefixed display name in the InfoCard, and delete the Milliquas `_names.json` sidecar pipeline end-to-end.

**Architecture:** The 64-byte per-record stride is preserved; the two new bytes consume two slots of the existing tail padding (10 bytes remain reserved). `classByte` is per-source-interpreted via `sourceClassLabel(source, byte)`; `parentSurveyByte` is Milliquas-only and reconstructs the historical `"<PREFIX> J<RA><Dec>"` name format on hover by combining the new `iauRaDecSuffix(ra, dec)` helper with a static prefix table. Deleting the JSON sidecar removes ~34 MB of network transfer per session.

**Tech Stack:** TypeScript (`tsc --noEmit` strict), Vitest, Vite, Cloudflare R2 (`npx wrangler r2 object`), the existing `tools/catalog/buildAllBins.ts` pipeline.

---

## File Structure

**New:**
- `src/utils/math/iauRaDecSuffix.ts` — shared `J<RA><Dec>` suffix builder, extracted from `iauName`.
- `src/data/sourceClass.ts` — `sourceClassLabel` + `milliquasParentSurveyPrefix` lookup helpers and the Milliquas class-byte constants.
- `tests/utils/math/iauRaDecSuffix.test.ts` — regression test pinning the extracted helper against `iauName`'s historical output.
- `tests/data/sourceClass.test.ts` — coverage for both lookup helpers.
- `tests/data/galaxyCatalogFormat.test.ts` — v5 encode/decode round-trip + v4 rejection.

**Modified:**
- `src/utils/math/iauName.ts` — delegates the suffix portion to `iauRaDecSuffix`.
- `src/data/galaxyCatalogFormat.ts` — bump `VERSION` to 5, encode/decode the two new bytes, update docstring.
- `src/@types/data/GalaxyCatalog.d.ts` — two new `Uint8Array` fields (`classByte`, `parentSurveyByte`).
- `tools/parsers/common.ts` — add `classByte` + `parentSurveyByte` numeric fields to `ParsedRecord` (default `0`).
- `tools/parsers/milliquas.ts` — emit class + parent-survey byte per record; drop `names`/`classes` from the parse result.
- `tools/catalog/buildAllBins.ts` — plumb the two new bytes through `recordsToCloud`; delete the sidecar write block; delete `loadMilliquas`'s parallel-array bookkeeping.
- `src/services/loading/fetchers/milliquasNamesFetcher.ts` — **delete**.
- `src/services/loading/slots/milliquasNamesSlot.ts` — **delete**.
- `src/@types/loading/MilliquasNamesPayload.d.ts` — **delete**.
- `tests/services/loading/fetchers/milliquasNamesFetcher.test.ts` — **delete**.
- `src/@types/engine/wiring/GalaxyCatalogSourceConfig.d.ts` — drop `'milliquasNames'` from `GalaxyCatalogCompanionRef`.
- `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts` — drop the `companions: ['milliquasNames']` declaration.
- `src/@types/engine/state/EngineAssetSlots.d.ts` — drop the `milliquasNames` slot field + its import.
- `src/@types/engine/state/EngineSourceState.d.ts` — drop `milliquasNames` + `milliquasClasses` fields.
- `src/@types/engine/subsystems/CreateSelectionSubsystemInput.d.ts` — drop `getMilliquasNames`.
- `src/services/engine/subsystems/selectionSubsystem.ts` — drop the `getMilliquasNames` plumb-through.
- `src/services/engine/phases/wireSlots.ts` — drop the `createMilliquasNamesSlot` import + minting + registry registration.
- `src/services/engine/phases/wireInput.ts` — drop the `state.sources.milliquasNames` arg in the `buildGalaxyInfo` call.
- `src/services/engine/engine.ts` — drop `milliquasNames`/`milliquasClasses` init, the `getMilliquasNames` closure on the selection subsystem, the `milliquasNames: null` slot init, and the two `state.sources.milliquasNames` args on `buildGalaxyInfo` calls.
- `src/services/engine/helpers/galaxyInfoBuilder.ts` — drop the `milliquasNames` parameter; read `classByte` + `parentSurveyByte` from the cloud; reconstruct the Milliquas display name from `parentSurveyByte` + `iauRaDecSuffix(ra, dec)`; add `agnClass` to the returned `GalaxyInfo`.
- `src/@types/engine/GalaxyInfo.d.ts` — add `agnClass?: string`.
- `tests/services/engine/helpers/galaxyInfoBuilder.test.ts` — drop the `milliquasNames` arg in calls; rewrite the Milliquas branch to cover class + parent-survey-byte paths.
- `tests/@types/engineState.test.ts` — drop `milliquasNames`/`milliquasClasses` from the state fixtures (three occurrences) and drop `getMilliquasNames` from the `createSelectionSubsystem` calls (two occurrences) and the `assetSlots.milliquasNames` literal (two occurrences).
- `tests/services/engine/setSourceVisibleFade.test.ts` — drop `milliquasNames: null` from the `assetSlots` literal.
- `tests/parsers/milliquas.test.ts` — pivot from `{ names, classes }` parallel-array assertions to `classByte` + `parentSurveyByte` per-record assertions.
- `tools/deploy/syncR2.ts` — drop the `milliquas-*_names.json` line from the ALLOW filter; add a deletion step that removes any leftover `milliquas-*_names.json` keys from R2.

---

### Task 1: Extract `iauRaDecSuffix` helper

**Files:**
- Create: `src/utils/math/iauRaDecSuffix.ts`
- Create: `tests/utils/math/iauRaDecSuffix.test.ts`
- Modify: `src/utils/math/iauName.ts`
- Modify: `src/utils/math/index.ts`

- [ ] **Step 1: Write the suffix-helper regression test**

Create `tests/utils/math/iauRaDecSuffix.test.ts`:

```ts
/**
 * Regression test for `iauRaDecSuffix` — the coordinate-only portion of
 * an IAU designation, factored out of `iauName` so any survey prefix
 * (including the Milliquas parent-survey prefixes reconstructed from the
 * bin's parentSurveyByte) can share the same exact coord-string emitter.
 *
 * Every case below is paired with the historical `iauName(Source.SDSS,
 * ra, dec)` output: stripping `"SDSS "` from the front must yield the
 * suffix.  That equality is the contract these two functions must
 * preserve forever, so we pin it directly.
 */
import { describe, it, expect } from 'vitest';
import { iauRaDecSuffix } from '../../../src/utils/math/iauRaDecSuffix';
import { iauName } from '../../../src/utils/math/iauName';
import { Source } from '../../../src/data/sources';

describe('iauRaDecSuffix', () => {
  it('matches the historical SDSS designation suffix for a canonical RA/Dec', () => {
    expect(iauRaDecSuffix(188.7365, 1.396)).toBe('J123456.75+012345.5');
  });

  it('emits a leading + for Dec=0', () => {
    expect(iauRaDecSuffix(0, 0)).toBe('J000000.00+000000.0');
  });

  it('emits a leading - for negative declinations', () => {
    expect(iauRaDecSuffix(0, -45.5)).toContain('-453000.0');
  });

  it('wraps negative RA into [0, 360)', () => {
    expect(iauRaDecSuffix(-10, 0)).toMatch(/^J2320/);
  });

  it('agrees with iauName(SDSS, ...) after the "SDSS " prefix is stripped', () => {
    // The whole point of the extraction is that this equality is a
    // tautology of the new implementation — pin it so any future
    // refactor that drifts the two functions explodes here.
    const ra = 188.736500001;
    const dec = 1.396;
    expect(`SDSS ${iauRaDecSuffix(ra, dec)}`).toBe(iauName(Source.SDSS, ra, dec));
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `npx vitest run tests/utils/math/iauRaDecSuffix.test.ts`
Expected: FAIL with "Cannot find module '../../../src/utils/math/iauRaDecSuffix'".

- [ ] **Step 3: Implement `iauRaDecSuffix` by extracting from `iauName`**

Create `src/utils/math/iauRaDecSuffix.ts`:

```ts
/**
 * Build the coordinate-only portion of an IAU-style designation:
 * `J<RA><Dec>`, where RA is truncated to centisecond-of-time precision
 * and Dec to decisecond-of-arc precision.  Truncation (not rounding) is
 * the IAU rule — it keeps the name stable as catalog measurements are
 * refined.
 *
 * Factored out of `iauName(source, ra, dec)` so any string the engine
 * builds from `"<prefix> J<RA><Dec>"` can reuse the same exact emitter.
 * Today the consumers are:
 *
 *   - `iauName(source, ra, dec)` — survey-aware designation
 *     (`"SDSS J…"`, `"2MASX J…"`, etc.).
 *   - `galaxyInfoBuilder` — Milliquas display-name reconstruction
 *     from the bin's `parentSurveyByte` (`"SDSS J…"`, `"2MASX J…"`,
 *     `"GAIA J…"`, …) without going through the survey enum, since
 *     Milliquas rows can carry any of those parent prefixes.
 *
 * Sharing one suffix builder guarantees the historical IAU strings
 * (`"SDSS J123456.75+012345.5"`) stay byte-identical to the strings the
 * Milliquas branch now reconstructs from the bin, so existing
 * regression tests that lock the IAU format keep passing without
 * special-cased duplicate emitters.
 *
 * Reference: SDSS DR18 naming conventions,
 * https://www.sdss.org/dr18/help/glossary/#name
 */

import { pad } from './_sexagesimal';

/**
 * Compute `J<RA><Dec>` for the given sky coordinates in degrees.
 * Pure — no I/O, no globals.  Output is ASCII-safe for filename use.
 */
export function iauRaDecSuffix(raDeg: number, decDeg: number): string {
  // ── RA part ───────────────────────────────────────────────────────────────
  // Wrap into [0, 360) then convert to hours (24h = 360°, so divide by 15).
  const wrappedRa = ((raDeg % 360) + 360) % 360;

  // To avoid floating-point precision loss from dividing by 15 early, we
  // compute total centiseconds-of-time by multiplying degrees × 3600 × 100
  // first, then dividing by 15.  Division last minimises accumulated error
  // because 3600 × 100 = 360000 is exact in float64, and the final ÷15 is
  // the only lossy step.
  const raTotalCentisec = Math.trunc((wrappedRa * 3600 * 100) / 15);

  const raH = Math.floor(raTotalCentisec / (60 * 60 * 100));
  const raRemAfterH = raTotalCentisec % (60 * 60 * 100);
  const raM = Math.floor(raRemAfterH / (60 * 100));
  const raCentisec = raRemAfterH % (60 * 100);

  const raSecInt = Math.floor(raCentisec / 100);
  const raSecFrac = raCentisec % 100;
  const raSecFmt = `${pad(raSecInt, 2)}.${pad(raSecFrac, 2)}`;

  const raPart = `${pad(raH, 2)}${pad(raM, 2)}${raSecFmt}`;

  // ── Dec part ──────────────────────────────────────────────────────────────
  const clampedDec = Math.max(-90, Math.min(90, decDeg));
  const decSign = clampedDec < 0 ? '-' : '+';
  const absD = Math.abs(clampedDec);

  // Convert degrees to total deciseconds of arc by truncation (not rounding).
  // 1° = 3600 arcsec = 36000 deciseconds.
  const decTotalDecisec = Math.trunc(absD * 3600 * 10);

  const decD = Math.floor(decTotalDecisec / (60 * 60 * 10));
  const decRemAfterD = decTotalDecisec % (60 * 60 * 10);
  const decM = Math.floor(decRemAfterD / (60 * 10));
  const decDecisec = decRemAfterD % (60 * 10);

  const decSecInt = Math.floor(decDecisec / 10);
  const decSecFrac = decDecisec % 10;
  const decSecFmt = `${pad(decSecInt, 2)}.${decSecFrac}`;

  return `J${raPart}${decSign}${pad(decD, 2)}${pad(decM, 2)}${decSecFmt}`;
}
```

- [ ] **Step 4: Switch `iauName` to delegate to the new helper**

Edit `src/utils/math/iauName.ts`. Replace the `iauCoordPart` private function and its body with a single call to `iauRaDecSuffix`. The full new file body:

```ts
/**
 * Construct an IAU-style coordinate-based galaxy designation, prefixed by
 * the survey's canonical short name.
 *
 * IAU recommends survey name + "J" + truncated coords as a stable, source-
 * derived identifier when no internal catalog ID is preferred — that's the
 * convention SDSS, 2MASS, etc. all follow.  Reusing the format across our
 * surveys keeps the headline string visually consistent (same length, same
 * truncation rules) while still telling the user which catalog the row
 * actually came from.
 *
 * Designations by source:
 *   - SDSS:      "SDSS J<RA><Dec>"      e.g. "SDSS J123456.75+012345.5"
 *   - 2MRS:      "2MASX J<RA><Dec>"     (2MRS rows carry 2MASS XSC IDs)
 *   - GLADE:     "GLADE J<RA><Dec>"     (GLADE is a compilation; the prefix
 *                                         marks it as such even though the
 *                                         underlying provenance varies)
 *   - Synthetic: "Synth J<RA><Dec>"     (no real-world catalog; obvious tag)
 *   - Famous:    "Famous J<RA><Dec>"    (fallback when no curated name)
 *   - Milliquas: "MQ J<RA><Dec>"        (catalog's own short name)
 *
 * The coordinate part itself is identical across surveys and lives in
 * `iauRaDecSuffix.ts` so any consumer that needs to glue a non-survey
 * prefix (e.g. Milliquas's per-row `parentSurveyByte`-derived prefix)
 * onto the same coord string can share the emitter byte-for-byte.
 *
 * Reference: SDSS DR18 naming conventions,
 * https://www.sdss.org/dr18/help/glossary/#name
 */

import { iauRaDecSuffix } from './iauRaDecSuffix';
import { Source } from '../../data/sources';

/**
 * Survey-aware IAU designation.  Returns "<prefix> J<RA><Dec>" where the
 * prefix matches the source's canonical short name.
 */
export function iauName(source: Source, raDeg: number, decDeg: number): string {
  const coords = iauRaDecSuffix(raDeg, decDeg);
  switch (source) {
    case Source.SDSS:
      return `SDSS ${coords}`;
    case Source.TwoMRS:
      return `2MASX ${coords}`;
    case Source.Glade:
      return `GLADE ${coords}`;
    case Source.Synthetic:
      return `Synth ${coords}`;
    case Source.Famous:
      // Famous entries have proper catalogue names (e.g. "M31") stored in
      // the metadata sidecar.  The IAU designation is used as a fallback
      // when no curated name is available (e.g. for a new entry pending
      // metadata enrichment).  "Famous" matches the Source label.
      return `Famous ${coords}`;
    case Source.Milliquas:
      // Milliquas's own short-name convention.  Used when the row's
      // `parentSurveyByte` is the OTHER sentinel — i.e. neither a known
      // parent-survey prefix nor a curated literature name.  The
      // parentSurveyByte-aware reconstruction in `galaxyInfoBuilder`
      // takes precedence when set.
      return `MQ ${coords}`;
    case Source.Cluster:
    case Source.Supercluster:
    case Source.Void:
      // POI markers carry curated names (e.g. "Virgo Cluster") and are
      // not assigned IAU coordinate designations. Reaching here means
      // a POI pick result is being formatted by galaxy-headline code;
      // route POI picks through their dedicated info path instead.
      throw new Error(`iauName: POI source ${source} has no IAU designation`);
  }
}
```

- [ ] **Step 5: Re-export the new helper from the math barrel**

Edit `src/utils/math/index.ts`. After the existing `export * from './iauName';` line, add:

```ts
export * from './iauRaDecSuffix';
```

- [ ] **Step 6: Run the regression suite to confirm green**

Run: `npx vitest run tests/utils/math/iauRaDecSuffix.test.ts tests/utils/math/iauName.test.ts`
Expected: PASS.

- [ ] **Step 7: Typecheck both projects**

Run: `npm run typecheck`
Expected: no errors.

- [ ] **Step 8: Commit**

```bash
git add src/utils/math/iauRaDecSuffix.ts src/utils/math/iauName.ts src/utils/math/index.ts tests/utils/math/iauRaDecSuffix.test.ts
git commit -m "$(cat <<'EOF'
refactor(iauName): extract iauRaDecSuffix for shared use

Factor the J<RA><Dec> coord-suffix builder out of iauName so any
consumer that needs to glue a non-survey prefix onto an IAU coord
string can share one byte-identical emitter.  Pins the historical
output via a regression test against iauName.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 2: Add `classByte` + `parentSurveyByte` to the GalaxyCatalog type

**Files:**
- Modify: `src/@types/data/GalaxyCatalog.d.ts`

- [ ] **Step 1: Append the two new typed-array fields**

Edit `src/@types/data/GalaxyCatalog.d.ts`. After the existing `diameterKpc: Float32Array;` field (and its closing JSDoc), insert these two new fields before the closing `};`:

```ts
  /**
   * Per-record source-interpreted classification byte — length === count.
   *
   * The byte's meaning depends on which `Source` this catalog belongs
   * to: for `Source.Milliquas` it encodes the AGN class letter
   * (1=Q, 2=A, 3=B, 4=K, 5=N, 6=S), for every other source it is
   * always 0 ("unclassified") today.  Future morphology work on
   * SDSS or GLADE can re-use the same slot with a different lookup
   * table — the lookup helper `sourceClassLabel(source, byte)` in
   * `src/data/sourceClass.ts` is the single dispatch site.
   *
   * Stored as `Uint8Array` because the on-disk format gives each
   * record exactly one byte for this field (see
   * `galaxyCatalogFormat.ts` v5 layout).  Zero is a legal "no class
   * known" value for every source, so the typed array's default
   * zero-fill is the correct empty state.
   */
  classByte: Uint8Array;

  /**
   * Per-record parent-survey enum byte — length === count.
   *
   * Only meaningful for `Source.Milliquas` rows: Milliquas Names are
   * almost always shaped `"<PARENT_SURVEY> J<RA><Dec>"`, where
   * PARENT_SURVEY is one of a small fixed set (SDSS, 2MASX, GAIA,
   * WISEA, NVSS, FIRST, 6dFGS).  At parse time we detect the prefix
   * and write the matching enum value here so the InfoCard can
   * reconstruct the historical display name at hover time by
   * combining the prefix lookup with `iauRaDecSuffix(ra, dec)`.
   *
   * `0` means "no recognised parent-survey prefix" (literature
   * designation like `3C 273` or `M 87`); the InfoCard falls back to
   * the generic `MQ J<RA><Dec>` IAU name in that case.
   *
   * For every non-Milliquas source the build pipeline writes `0` and
   * `milliquasParentSurveyPrefix(byte)` returns `null`.
   */
  parentSurveyByte: Uint8Array;
```

- [ ] **Step 2: Typecheck — expect failures elsewhere**

Run: `npm run typecheck`
Expected: FAIL with errors in `galaxyCatalogFormat.ts`, `buildAllBins.ts`, `tests/services/engine/helpers/galaxyInfoBuilder.test.ts`, and a few other consumers — every place that constructs a `GalaxyCatalog` literal must now include the two new arrays.  These are wired up in later tasks; we expect the error list here so the task scope stays tight.

- [ ] **Step 3: Commit the type change alone**

```bash
git add src/@types/data/GalaxyCatalog.d.ts
git commit -m "$(cat <<'EOF'
feat(catalog): add classByte + parentSurveyByte to GalaxyCatalog

Two new per-record uint8 typed-array fields, ready to be threaded
through the binary format (Task 3) and the build pipeline (Task 4).
Standalone type-only commit so the format bump that follows is a
focused diff.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 3: Bump the on-disk format to v5

**Files:**
- Modify: `src/data/galaxyCatalogFormat.ts`
- Create: `tests/data/galaxyCatalogFormat.test.ts`

- [ ] **Step 1: Write the v5 round-trip + v4 rejection tests**

Create `tests/data/galaxyCatalogFormat.test.ts`:

```ts
/**
 * Format-level tests for the v5 galaxy-catalog binary.
 *
 * Two contracts under test:
 *
 *   1. encode → decode is a faithful round trip for every field,
 *      including the two new uint8 slots (`classByte`,
 *      `parentSurveyByte`).
 *   2. A v4 buffer (the previous on-disk shape) is rejected with the
 *      documented "regenerate" error — the on-disk format-version
 *      gate is the single source of truth for "do I understand this
 *      file?".
 */
import { describe, it, expect } from 'vitest';
import {
  encodeGalaxyCatalog,
  decodeGalaxyCatalog,
} from '../../src/data/galaxyCatalogFormat';
import type { GalaxyCatalog } from '../../src/@types/data/GalaxyCatalog';

function makeCatalog(count: number): GalaxyCatalog {
  return {
    count,
    objIDs: BigUint64Array.from({ length: count }, (_, i) => BigInt(i + 1)),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count),
    positionAngleDeg: new Float32Array(count),
    diameterKpc: new Float32Array(count),
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
  };
}

describe('encode/decode galaxy catalog v5', () => {
  it('round-trips classByte and parentSurveyByte for every record', () => {
    const cat = makeCatalog(3);
    cat.classByte[0] = 0;
    cat.classByte[1] = 1; // Milliquas Quasar
    cat.classByte[2] = 6; // Milliquas Candidate
    cat.parentSurveyByte[0] = 0; // literature
    cat.parentSurveyByte[1] = 1; // SDSS
    cat.parentSurveyByte[2] = 4; // WISEA

    const buf = encodeGalaxyCatalog(cat);
    const out = decodeGalaxyCatalog(buf);

    expect(Array.from(out.classByte)).toEqual([0, 1, 6]);
    expect(Array.from(out.parentSurveyByte)).toEqual([0, 1, 4]);
  });

  it('round-trips the other per-record fields untouched (regression vs v4)', () => {
    const cat = makeCatalog(2);
    cat.positions.set([10, 20, 30, -40, 50, -60]);
    cat.magG[0] = 17.25;
    cat.magG[1] = 19.5;
    cat.diameterKpc[0] = 25;
    cat.diameterKpc[1] = 18;
    cat.objIDs[0] = 123456789012345n;

    const out = decodeGalaxyCatalog(encodeGalaxyCatalog(cat));

    expect(Array.from(out.positions)).toEqual([10, 20, 30, -40, 50, -60]);
    expect(out.magG[0]).toBeCloseTo(17.25, 5);
    expect(out.magG[1]).toBeCloseTo(19.5, 5);
    expect(out.diameterKpc[0]).toBe(25);
    expect(out.diameterKpc[1]).toBe(18);
    expect(out.objIDs[0]).toBe(123456789012345n);
  });

  it('rejects a v4 header with the documented regenerate error', () => {
    // Construct a minimally-valid v4-shaped header (16 bytes): magic
    // "SKMP", version 4, count 0, reserved 0.  The body length is 0
    // so we don't have to fill any records.
    const buf = new ArrayBuffer(16);
    const dv = new DataView(buf);
    dv.setUint32(0, 0x504d4b53, true); // "SKMP"
    dv.setUint32(4, 4, true);
    dv.setUint32(8, 0, true);
    dv.setUint32(12, 0, true);

    expect(() => decodeGalaxyCatalog(buf)).toThrow(/regenerate/);
  });

  it('rejects a bogus magic with the "bad magic" error', () => {
    const buf = new ArrayBuffer(16);
    new DataView(buf).setUint32(0, 0xdeadbeef, true);
    expect(() => decodeGalaxyCatalog(buf)).toThrow(/bad magic/);
  });
});
```

- [ ] **Step 2: Run the failing tests**

Run: `npx vitest run tests/data/galaxyCatalogFormat.test.ts`
Expected: FAIL — the encoder doesn't yet handle `classByte`/`parentSurveyByte`, the decoder doesn't yet emit them, and the version check still wants 4.

- [ ] **Step 3: Bump the format to v5**

Edit `src/data/galaxyCatalogFormat.ts`.  Replace the module-level docstring and the `VERSION`/encoder/decoder/`emptyGalaxyCatalog` bodies with the v5 versions:

```ts
/**
 * Binary on-disk format for a `GalaxyCatalog` — version 5.
 *
 * v5 reuses the v4 64-byte record stride but consumes two of the
 * trailing-padding bytes for new per-record metadata:
 *
 *   - `classByte` (offset 52, uint8): source-interpreted
 *     classification.  For `Source.Milliquas` rows it carries the
 *     AGN class letter via a per-source enum
 *     (1=Q, 2=A, 3=B, 4=K, 5=N, 6=S; 0 = unknown).  For every other
 *     source the build pipeline writes 0 and the lookup helper
 *     `sourceClassLabel(source, byte)` returns null.  Future
 *     morphology work on SDSS / GLADE can reuse the same slot with
 *     a different lookup table — the byte is opaque to the format.
 *
 *   - `parentSurveyByte` (offset 53, uint8): Milliquas-only enum
 *     that records which parent survey the row's Milliquas Name
 *     came from (1=SDSS, 2=2MASX, 3=GAIA, 4=WISEA, 5=NVSS, 6=FIRST,
 *     7=6dFGS).  The InfoCard uses it to reconstruct the historical
 *     "<PARENT> J<RA><Dec>" display name at hover time without the
 *     dedicated names sidecar that v4 required.  0 = literature
 *     designation or unrecognised prefix, in which case the IAU
 *     fallback `MQ J<RA><Dec>` is used.
 *
 * Other than the two new bytes, the per-record layout is identical
 * to v4.  The remaining 10 bytes of tail padding stay reserved for
 * future per-record metadata that fits in the existing stride.
 *
 * v4 files are rejected with the documented "regenerate via
 * `npm run build-tiers`" error — the magic + version header is the
 * single source of truth for "do I understand this file?".
 *
 * Layout (little-endian):
 *
 *     ── HEADER (16 bytes) ──────────────────────────────────────────────────
 *     0       4     magic    = "SKMP" (0x504d4b53)
 *     4       4     version  = 5 (uint32)
 *     8       4     count    = number of galaxies (uint32)
 *     12      4     reserved = 0
 *
 *     ── PER-GALAXY RECORD (64 bytes) ───────────────────────────────────────
 *     0       8     objID            (uint64)
 *     8       4     x                (float32, Mpc)
 *     12      4     y                (float32)
 *     16      4     z                (float32)
 *     20      4     magU             (float32)
 *     24      4     magG             (float32)
 *     28      4     magR             (float32)
 *     32      4     magI             (float32)
 *     36      4     magZ             (float32)
 *     40      4     axisRatio        (float32) — b/a in [0,1] or NaN
 *     44      4     positionAngleDeg (float32) — PA in [0,180) or NaN
 *     48      4     diameterKpc      (float32) — physical diameter in kpc
 *     52      1     classByte        (uint8)  — per-source enum (NEW in v5)
 *     53      1     parentSurveyByte (uint8)  — Milliquas-only (NEW in v5)
 *     54      10    padding          (zeroed)
 *
 * Total file size: 16 + count × 64.
 */

import type { GalaxyCatalog } from '../@types/data/GalaxyCatalog';

const MAGIC = 0x504d4b53;
const VERSION = 5;
const HEADER_BYTES = 16;
const BYTES_PER_GALAXY = 64;

export function encodeGalaxyCatalog(catalog: GalaxyCatalog): ArrayBuffer {
  const {
    count,
    objIDs,
    positions,
    magU,
    magG,
    magR,
    magI,
    magZ,
    axisRatio,
    positionAngleDeg,
    diameterKpc,
    classByte,
    parentSurveyByte,
  } = catalog;
  if (objIDs.length !== count) throw new Error('objIDs length mismatch');
  if (positions.length !== count * 3) throw new Error('positions length mismatch');
  if (magU.length !== count) throw new Error('magU length mismatch');
  if (magG.length !== count) throw new Error('magG length mismatch');
  if (magR.length !== count) throw new Error('magR length mismatch');
  if (magI.length !== count) throw new Error('magI length mismatch');
  if (magZ.length !== count) throw new Error('magZ length mismatch');
  if (axisRatio.length !== count) throw new Error('axisRatio length mismatch');
  if (positionAngleDeg.length !== count) throw new Error('positionAngleDeg length mismatch');
  if (diameterKpc.length !== count) throw new Error('diameterKpc length mismatch');
  if (classByte.length !== count) throw new Error('classByte length mismatch');
  if (parentSurveyByte.length !== count) throw new Error('parentSurveyByte length mismatch');

  const buf = new ArrayBuffer(HEADER_BYTES + count * BYTES_PER_GALAXY);
  const dv = new DataView(buf);
  dv.setUint32(0, MAGIC, true);
  dv.setUint32(4, VERSION, true);
  dv.setUint32(8, count, true);
  dv.setUint32(12, 0, true);

  const floatView = new Float32Array(buf);
  const byteView = new Uint8Array(buf);

  for (let i = 0; i < count; i++) {
    const byteBase = HEADER_BYTES + i * BYTES_PER_GALAXY;

    dv.setBigUint64(byteBase + 0, objIDs[i]!, true);

    const f = (byteBase + 8) / 4;
    floatView[f + 0] = positions[i * 3 + 0]!;
    floatView[f + 1] = positions[i * 3 + 1]!;
    floatView[f + 2] = positions[i * 3 + 2]!;
    floatView[f + 3] = magU[i]!;
    floatView[f + 4] = magG[i]!;
    floatView[f + 5] = magR[i]!;
    floatView[f + 6] = magI[i]!;
    floatView[f + 7] = magZ[i]!;
    floatView[f + 8] = axisRatio[i]!;
    floatView[f + 9] = positionAngleDeg[i]!;
    floatView[f + 10] = diameterKpc[i]!;

    // Two new uint8 slots at byteBase + 52 / + 53.  We index the
    // shared Uint8Array view directly rather than going through
    // DataView.setUint8 — one fewer call per byte and the alignment
    // is trivially 1.
    byteView[byteBase + 52] = classByte[i]!;
    byteView[byteBase + 53] = parentSurveyByte[i]!;
    // Tail padding (byteBase+54 … byteBase+63) stays zero because
    // `new ArrayBuffer` zero-inits.  No write needed.
  }
  return buf;
}

export function decodeGalaxyCatalog(buf: ArrayBuffer): GalaxyCatalog {
  const dv = new DataView(buf);
  if (dv.getUint32(0, true) !== MAGIC) throw new Error('bad magic — not a SKMP file');

  const version = dv.getUint32(4, true);
  if (version !== VERSION) {
    throw new Error(
      `unsupported version: ${version} — please regenerate the .bin via "npm run build-tiers"`,
    );
  }

  const count = dv.getUint32(8, true);

  const objIDs = new BigUint64Array(count);
  const positions = new Float32Array(count * 3);
  const magU = new Float32Array(count);
  const magG = new Float32Array(count);
  const magR = new Float32Array(count);
  const magI = new Float32Array(count);
  const magZ = new Float32Array(count);
  const axisRatio = new Float32Array(count);
  const positionAngleDeg = new Float32Array(count);
  const diameterKpc = new Float32Array(count);
  const classByte = new Uint8Array(count);
  const parentSurveyByte = new Uint8Array(count);

  const floatView = new Float32Array(buf);
  const byteView = new Uint8Array(buf);

  for (let i = 0; i < count; i++) {
    const byteBase = HEADER_BYTES + i * BYTES_PER_GALAXY;

    objIDs[i] = dv.getBigUint64(byteBase + 0, true);

    const f = (byteBase + 8) / 4;
    positions[i * 3 + 0] = floatView[f + 0]!;
    positions[i * 3 + 1] = floatView[f + 1]!;
    positions[i * 3 + 2] = floatView[f + 2]!;
    magU[i] = floatView[f + 3]!;
    magG[i] = floatView[f + 4]!;
    magR[i] = floatView[f + 5]!;
    magI[i] = floatView[f + 6]!;
    magZ[i] = floatView[f + 7]!;
    axisRatio[i] = floatView[f + 8]!;
    positionAngleDeg[i] = floatView[f + 9]!;
    diameterKpc[i] = floatView[f + 10]!;

    classByte[i] = byteView[byteBase + 52]!;
    parentSurveyByte[i] = byteView[byteBase + 53]!;
    // The remaining 10 padding bytes are ignored on decode.
  }

  return {
    count,
    objIDs,
    positions,
    magU,
    magG,
    magR,
    magI,
    magZ,
    axisRatio,
    positionAngleDeg,
    diameterKpc,
    classByte,
    parentSurveyByte,
  };
}

export function emptyGalaxyCatalog(): GalaxyCatalog {
  return {
    count: 0,
    objIDs: new BigUint64Array(0),
    positions: new Float32Array(0),
    magU: new Float32Array(0),
    magG: new Float32Array(0),
    magR: new Float32Array(0),
    magI: new Float32Array(0),
    magZ: new Float32Array(0),
    axisRatio: new Float32Array(0),
    positionAngleDeg: new Float32Array(0),
    diameterKpc: new Float32Array(0),
    classByte: new Uint8Array(0),
    parentSurveyByte: new Uint8Array(0),
  };
}
```

- [ ] **Step 4: Run the format tests + the rest of vitest filtered to format-adjacent files**

Run: `npx vitest run tests/data/galaxyCatalogFormat.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/data/galaxyCatalogFormat.ts tests/data/galaxyCatalogFormat.test.ts
git commit -m "$(cat <<'EOF'
feat(bin): bump galaxy-catalog format to v5 with class + parent-survey bytes

Two new per-record uint8 slots at offset 52/53, carved from the v4
tail padding without changing the 64-byte stride.  v4 files are now
rejected with the documented "regenerate via npm run build-tiers"
error.  classByte carries the per-source class enum (Milliquas
class letter today); parentSurveyByte carries the Milliquas
parent-survey enum so the InfoCard can reconstruct the historical
"<PARENT> J<RA><Dec>" display name without the JSON sidecar.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 4: Plumb the two new bytes through `recordsToCloud`

**Files:**
- Modify: `tools/parsers/common.ts`
- Modify: `tools/catalog/buildAllBins.ts`

- [ ] **Step 1: Add the two new fields to `ParsedRecord`**

Edit `tools/parsers/common.ts`.  After the `diameterKpc: number | null;` field (and its closing JSDoc), insert these two new fields before the `massId?: string;` field:

```ts
  /**
   * Per-source classification byte (see `src/data/sourceClass.ts`
   * for the per-source lookup tables).
   *
   * Defaults to `0` ("unknown / unclassified") for every parser
   * that doesn't carry a class signal — the build encoder writes
   * the byte straight through to the .bin's per-record `classByte`
   * slot.  Today only the Milliquas parser populates this field
   * (AGN class letter Q/A/B/K/N/S → enum 1..6); SDSS / 2MRS /
   * GLADE / Famous all leave it at 0.
   *
   * Why a flat byte rather than a tagged union per source?  The
   * on-disk format already commits to one byte per record (see
   * `src/data/galaxyCatalogFormat.ts` v5).  The build pipeline
   * never inspects the value — it just copies — so the parser is
   * the one place that knows how to translate its survey's class
   * signal into the byte, and a flat numeric field keeps the
   * pipeline blissfully ignorant of per-source semantics.
   */
  classByte: number;

  /**
   * Milliquas-only parent-survey enum byte (see
   * `milliquasParentSurveyPrefix` in `src/data/sourceClass.ts`).
   *
   * Every parser other than Milliquas leaves this at `0` (the
   * "no parent-survey prefix" sentinel).  The Milliquas parser
   * matches the Name column against the small fixed prefix set
   * (`SDSS`, `2MASX`, `GAIA`, `WISEA`, `NVSS`, `FIRST`, `6dFGS`)
   * and writes the matching enum value here so the runtime can
   * reconstruct `"<PARENT> J<RA><Dec>"` at hover time without a
   * companion JSON sidecar.
   *
   * Same plain-number-rather-than-tagged-union rationale as
   * `classByte`: the field is one byte at the binary boundary, and
   * the pipeline carries it through opaque.
   */
  parentSurveyByte: number;
```

- [ ] **Step 2: Thread the new fields through `recordsToCloud`**

Edit `tools/catalog/buildAllBins.ts`.  Locate the `recordsToCloud` body — specifically the `const cloud: GalaxyCatalog = { … };` literal — and add the two new typed-array slots so the literal stays type-complete:

Replace:

```ts
  const cloud: GalaxyCatalog = {
    count,
    objIDs: new BigUint64Array(count),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count),
    positionAngleDeg: new Float32Array(count),
    diameterKpc: new Float32Array(count),
  };
```

with:

```ts
  const cloud: GalaxyCatalog = {
    count,
    objIDs: new BigUint64Array(count),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count),
    positionAngleDeg: new Float32Array(count),
    diameterKpc: new Float32Array(count),
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
  };
```

Then, inside the `for (let i = 0; i < count; i++)` loop, after the existing `cloud.diameterKpc[i] = …` write, add the two new copies:

```ts
    // Per-source classification byte (e.g. Milliquas AGN class
    // letter → 1..6).  Every parser that doesn't carry a class
    // signal leaves r.classByte at 0, so we copy unconditionally.
    cloud.classByte[i] = r.classByte;
    // Milliquas-only parent-survey enum (1=SDSS, 2=2MASX, …).
    // Zero for every non-Milliquas parser.  See sourceClass.ts for
    // the full enum.
    cloud.parentSurveyByte[i] = r.parentSurveyByte;
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: the `ParsedRecord` consumers (every parser) now fail because they don't yet emit `classByte` / `parentSurveyByte`. Those defaults are wired up in Task 5.

- [ ] **Step 4: Commit**

```bash
git add tools/parsers/common.ts tools/catalog/buildAllBins.ts
git commit -m "$(cat <<'EOF'
feat(catalog-build): thread classByte/parentSurveyByte through recordsToCloud

Defaults are 0 across the board; the next task wires up each
parser to populate the new fields (zero for everyone except
Milliquas, which carries the AGN class + parent-survey prefix).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 5: Default `classByte` + `parentSurveyByte` to 0 in every non-Milliquas parser

**Files:**
- Modify: `tools/parsers/sdssCsv.ts`
- Modify: `tools/parsers/twoMrs.ts`
- Modify: `tools/parsers/glade.ts`
- Modify: `tools/parsers/famousSeed.ts`

- [ ] **Step 1: Run typecheck to enumerate the failing parser sites**

Run: `npm run typecheck` and read the failures.  Each parser builds a `ParsedRecord` literal that's now missing the two new fields.

- [ ] **Step 2: In each `ParsedRecord` constructor in `sdssCsv.ts`, add the two zero defaults**

Edit `tools/parsers/sdssCsv.ts`.  For every `push({ source: Source.SDSS, … })` literal (typically one inside the main parse loop), append `classByte: 0,` and `parentSurveyByte: 0,` to the object — adjacent to the existing `diameterKpc: …,` field for readability.  Add this comment on the line above the two fields, exactly once at the construction site:

```ts
    // SDSS rows have no AGN class signal yet and never a Milliquas
    // parent-survey prefix; both bytes stay 0 here (see
    // `src/data/sourceClass.ts` for the lookup contract).
```

- [ ] **Step 3: Same edit in `twoMrs.ts`**

Edit `tools/parsers/twoMrs.ts`.  Add `classByte: 0,` and `parentSurveyByte: 0,` to the `ParsedRecord` literal, with this comment above:

```ts
      // 2MRS rows have no AGN class signal and no Milliquas
      // parent-survey prefix; both bytes stay 0.
```

- [ ] **Step 4: Same edit in `glade.ts`**

Edit `tools/parsers/glade.ts`.  Add the two zero defaults plus this comment:

```ts
    // GLADE rows have no AGN class signal and no Milliquas
    // parent-survey prefix; both bytes stay 0.
```

- [ ] **Step 5: Same edit in `famousSeed.ts`**

Edit `tools/parsers/famousSeed.ts`.  Add the two zero defaults plus this comment:

```ts
    // Famous rows have no AGN class signal and no Milliquas
    // parent-survey prefix; both bytes stay 0.
```

- [ ] **Step 6: Typecheck again**

Run: `npm run typecheck`
Expected: only the Milliquas parser still fails — addressed in Task 6.

- [ ] **Step 7: Run the parser tests to confirm no regression**

Run: `npx vitest run tests/parsers/sdssCsv.test.ts tests/parsers/twoMrs.test.ts tests/parsers/glade.test.ts tests/parsers/famousSeed.test.ts`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add tools/parsers/sdssCsv.ts tools/parsers/twoMrs.ts tools/parsers/glade.ts tools/parsers/famousSeed.ts
git commit -m "$(cat <<'EOF'
feat(parsers): default classByte/parentSurveyByte to 0 in non-Milliquas parsers

Every non-Milliquas parser emits the two new bytes as 0 — the
"unclassified / no parent-survey prefix" sentinels.  Future per-
survey class signals (e.g. GLADE morphology) can override these
defaults locally without touching the pipeline.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 6: Rewrite the Milliquas parser to emit the two bytes

**Files:**
- Modify: `tools/parsers/milliquas.ts`
- Modify: `tests/parsers/milliquas.test.ts`

- [ ] **Step 1: Rewrite the parser tests to assert per-record bytes**

Edit `tests/parsers/milliquas.test.ts`.  Replace the entire file body with:

```ts
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parseMilliquas } from '../../tools/parsers/milliquas';
import { Source } from '../../src/data/sources';

describe('parseMilliquas', () => {
  const raw = readFileSync(resolve(__dirname, '../fixtures/milliquas/sample.txt'), 'utf8');

  it('parses 3C 273 with the expected fields and a quasar class byte', () => {
    const { records } = parseMilliquas(raw);
    const i = records.findIndex(
      (r) => Math.abs(r.ra - 187.2779) < 1e-3 && Math.abs(r.dec - 2.0524) < 1e-3,
    );
    expect(i).toBeGreaterThanOrEqual(0);
    const r = records[i]!;
    expect(r.source).toBe(Source.Milliquas);
    expect(r.z).toBeCloseTo(0.158, 3);
    expect(r.magR).toBeCloseTo(12.85, 2);
    expect(r.magG).toBeCloseTo(13.05, 2);
    expect(r.axisRatio).toBeNull();
    expect(r.positionAngleDeg).toBeNull();
    expect(r.diameterKpc).toBeNull();
    expect(r.objID).toBe(0n);
    // Quasar class letter Q maps to enum 1.
    expect(r.classByte).toBe(1);
    // 3C 273 is a literature designation — no parent-survey prefix.
    expect(r.parentSurveyByte).toBe(0);
  });

  it('rejects z=0 sentinel rows', () => {
    const { records, skipped } = parseMilliquas(raw);
    expect(records.every((r) => r.z !== 0)).toBe(true);
    expect(skipped.zZero).toBeGreaterThan(0);
  });

  it('rejects 0.1-rounded photo-z candidate rows', () => {
    const { skipped } = parseMilliquas(raw);
    expect(skipped.photoZRounded).toBeGreaterThan(0);
  });

  it('rejects 0.01-rounded GAIA3 QSOC photo-z rows', () => {
    const { skipped } = parseMilliquas(raw);
    expect(skipped.qsocRounded).toBeGreaterThan(0);
  });

  it('maps each class letter to the correct enum value', () => {
    // The fixture file already contains one example per letter; pin
    // the bytes via the same RA-anchored row lookup used above.
    const { records } = parseMilliquas(raw);
    const byClassLetter: Record<string, number> = {
      Q: 1, // Quasar
      A: 2, // AGN type-1
      B: 3, // BL Lac
      K: 4, // Seyfert-1 narrow
      N: 5, // Seyfert-1 broad
      S: 6, // Candidate
    };
    // Every class letter that appears in the fixture must be
    // represented by at least one record with the expected byte.
    for (const [letter, expectedByte] of Object.entries(byClassLetter)) {
      const found = records.some((r) => r.classByte === expectedByte);
      expect(
        found,
        `expected at least one record with classByte=${expectedByte} (class ${letter})`,
      ).toBe(true);
    }
  });

  it('detects each parent-survey prefix and emits the matching enum byte', () => {
    // Walk the fixture and verify each canonical parent-survey prefix
    // lands on its expected enum value.  The OTHER sentinel (0) covers
    // literature designations like 3C 273 / M 87 / NGC 1275.
    const { records } = parseMilliquas(raw);
    const surveyBytes = new Set(records.map((r) => r.parentSurveyByte));
    // The fixture must cover at least the SDSS prefix path — sanity-
    // check that the byte was actually populated for some row.
    expect(surveyBytes.has(1)).toBe(true); // SDSS
    // 0 must always be present for the literature-name rows.
    expect(surveyBytes.has(0)).toBe(true);
  });
});
```

- [ ] **Step 2: Verify the new tests fail before implementation**

Run: `npx vitest run tests/parsers/milliquas.test.ts`
Expected: FAIL — current parser returns parallel arrays and doesn't expose `classByte`/`parentSurveyByte` on records.

- [ ] **Step 3: Rewrite the Milliquas parser**

Edit `tools/parsers/milliquas.ts`.  Replace the entire file body with this v5-aligned version (sidecar arrays gone, per-record bytes populated):

```ts
/**
 * Milliquas v8 (Million Quasars) parser — Flesch 2023, the compilation
 * AGN catalogue distributed as a single 188-character fixed-width text
 * file at <https://quasars.org/milliquas.htm>.
 *
 * The parser emits a `ParsedRecord[]` whose per-record `classByte` and
 * `parentSurveyByte` fields carry every InfoCard-visible Milliquas
 * datum (AGN class letter + parent-survey prefix).  Both fields are
 * persisted by the v5 .bin format, so the runtime reconstructs the
 * historical `"<PARENT> J<RA><Dec>"` display name purely from the
 * binary — no companion JSON sidecar required.
 *
 * ---
 * ### Skip rules (spec-z subset only)
 *
 * Unchanged from the v4 parser: drop rows whose Z column is blank,
 * literally `0.000`, rounded to `.X00` (generic photo-z candidate),
 * or rounded to `.XY0` with Zcite=GAIA3 (Gaia DR3 QSOC photo-z).  See
 * the per-rule comments below for the long form.
 *
 * ---
 * ### Why bytes, not strings
 *
 * Milliquas Name + Type[0] used to ride alongside the records in
 * parallel JSON sidecar arrays.  The .bin format now carries the
 * class letter as a per-record enum byte (`classByte`) and the
 * parent-survey prefix as a second per-record enum byte
 * (`parentSurveyByte`); see `src/data/sourceClass.ts` for the
 * lookup tables and `src/data/galaxyCatalogFormat.ts` for the
 * on-disk layout.  A small minority of Milliquas Names are
 * literature designations (`3C 273`, `M 87`); those map to
 * `parentSurveyByte = 0` and the runtime falls back to the generic
 * `MQ J<RA><Dec>` IAU name.
 */

import { Source } from '../../src/data/sources.js';
import {
  MILLIQUAS_CLASS_BYTE,
  MILLIQUAS_PARENT_SURVEY_BYTE,
} from '../../src/data/sourceClass.js';
import { nonCommentLines, type ParsedRecord } from './common.js';

// ─── Byte ranges (1-based inclusive, as published in the upstream ReadMe) ──

const RA_BYTES = [1, 11] as const;
const DEC_BYTES = [13, 23] as const;
const NAME_BYTES = [26, 50] as const;
const TYPE_BYTES = [52, 55] as const;
const RMAG_BYTES = [57, 61] as const;
const BMAG_BYTES = [63, 67] as const;
const Z_BYTES = [77, 82] as const;
const ZCITE_BYTES = [91, 96] as const;

const MIN_LINE_LEN = 188;
const ZCITE_GAIA_QSOC = 'GAIA3';
const PHOTO_Z_ROUNDED_TO_TENTH = /\.\d00\s*$/;
const PHOTO_Z_ROUNDED_TO_HUNDREDTH = /\.\d\d0\s*$/;

/**
 * Parent-survey prefixes we recognise in the Milliquas Name column.
 * Listed longest-first so the regex below can't match `2MASX` as a
 * prefix of `2MASS` (none of these is a prefix of any other, but
 * keeping the order intentional makes the regex review easier).
 */
const PARENT_PREFIX_BY_NAME: ReadonlyArray<readonly [string, number]> = [
  ['6dFGS', MILLIQUAS_PARENT_SURVEY_BYTE.SIXDFGS],
  ['WISEA', MILLIQUAS_PARENT_SURVEY_BYTE.WISEA],
  ['FIRST', MILLIQUAS_PARENT_SURVEY_BYTE.FIRST],
  ['2MASX', MILLIQUAS_PARENT_SURVEY_BYTE.TWOMASX],
  ['SDSS', MILLIQUAS_PARENT_SURVEY_BYTE.SDSS],
  ['GAIA', MILLIQUAS_PARENT_SURVEY_BYTE.GAIA],
  ['NVSS', MILLIQUAS_PARENT_SURVEY_BYTE.NVSS],
];

/**
 * Translate a Milliquas Type column (e.g. `"Q   "`, `"K2  "`) into
 * the per-record class enum byte.  Only the first non-space char is
 * inspected — the trailing flags (R/X/2) are association markers
 * recoverable from the dedicated X-ray and radio ID columns if a
 * future pass needs them.
 *
 * Unrecognised letters return 0 (the "unclassified" sentinel) rather
 * than throwing — Milliquas occasionally introduces new class codes,
 * and a missing class is strictly better than a build failure.
 */
function classByteFromType(typeRaw: string): number {
  const letter = typeRaw[0] ?? '';
  switch (letter) {
    case 'Q':
      return MILLIQUAS_CLASS_BYTE.Q;
    case 'A':
      return MILLIQUAS_CLASS_BYTE.A;
    case 'B':
      return MILLIQUAS_CLASS_BYTE.B;
    case 'K':
      return MILLIQUAS_CLASS_BYTE.K;
    case 'N':
      return MILLIQUAS_CLASS_BYTE.N;
    case 'S':
      return MILLIQUAS_CLASS_BYTE.S;
    default:
      return 0;
  }
}

/**
 * Match the trimmed Name column against the known parent-survey
 * prefixes.  Returns the matching enum byte, or 0 for literature
 * designations (`3C 273`, `M 87`, …) and any unrecognised prefix.
 *
 * The match is strict: the prefix must be followed by a space — we
 * never want to confuse `SDSS J…` (parent survey) with a name like
 * `SDSSFAKE` that happens to start with the same five characters.
 */
function parentSurveyByteFromName(nameTrimmed: string): number {
  for (const [prefix, byte] of PARENT_PREFIX_BY_NAME) {
    if (nameTrimmed.length > prefix.length && nameTrimmed.startsWith(prefix + ' ')) {
      return byte;
    }
  }
  return 0;
}

export type MilliquasParseResult = {
  records: ParsedRecord[];
  skipped: {
    zMissing: number;
    zZero: number;
    photoZRounded: number;
    qsocRounded: number;
  };
};

export function parseMilliquas(rawText: string): MilliquasParseResult {
  const lines = nonCommentLines(rawText);

  const records: ParsedRecord[] = [];
  const skipped = { zMissing: 0, zZero: 0, photoZRounded: 0, qsocRounded: 0 };

  for (const line of lines) {
    if (line.length < MIN_LINE_LEN) continue;

    const raStr = line.slice(RA_BYTES[0] - 1, RA_BYTES[1]).trim();
    const decStr = line.slice(DEC_BYTES[0] - 1, DEC_BYTES[1]).trim();
    const nameRaw = line.slice(NAME_BYTES[0] - 1, NAME_BYTES[1]);
    const typeRaw = line.slice(TYPE_BYTES[0] - 1, TYPE_BYTES[1]);
    const rmagStr = line.slice(RMAG_BYTES[0] - 1, RMAG_BYTES[1]).trim();
    const bmagStr = line.slice(BMAG_BYTES[0] - 1, BMAG_BYTES[1]).trim();
    const zRaw = line.slice(Z_BYTES[0] - 1, Z_BYTES[1]);
    const zciteTrimmed = line.slice(ZCITE_BYTES[0] - 1, ZCITE_BYTES[1]).trim();

    const ra = parseFloat(raStr);
    const dec = parseFloat(decStr);
    const z = parseFloat(zRaw);

    if (!Number.isFinite(ra) || !Number.isFinite(dec) || !Number.isFinite(z)) {
      skipped.zMissing++;
      continue;
    }
    if (z === 0) {
      skipped.zZero++;
      continue;
    }
    if (PHOTO_Z_ROUNDED_TO_TENTH.test(zRaw)) {
      skipped.photoZRounded++;
      continue;
    }
    if (PHOTO_Z_ROUNDED_TO_HUNDREDTH.test(zRaw) && zciteTrimmed === ZCITE_GAIA_QSOC) {
      skipped.qsocRounded++;
      continue;
    }

    const magR = rmagStr === '' ? NaN : parseFloat(rmagStr);
    const magG = bmagStr === '' ? NaN : parseFloat(bmagStr);

    const nameTrimmed = nameRaw.trimEnd().trimStart();
    const classByte = classByteFromType(typeRaw);
    const parentSurveyByte = parentSurveyByteFromName(nameTrimmed);

    records.push({
      source: Source.Milliquas,
      objID: 0n,
      ra,
      dec,
      z,
      magU: NaN,
      magG,
      magR,
      magI: NaN,
      magZ: NaN,
      axisRatio: null,
      positionAngleDeg: null,
      diameterKpc: null,
      // Per-record AGN class letter (Q/A/B/K/N/S → enum 1..6).
      classByte,
      // Per-record parent-survey prefix (SDSS/2MASX/GAIA/WISEA/NVSS/
      // FIRST/6dFGS → enum 1..7; literature designation → 0).
      parentSurveyByte,
    });
  }

  return { records, skipped };
}
```

- [ ] **Step 4: Verify the parser tests pass**

Run: `npx vitest run tests/parsers/milliquas.test.ts`
Expected: PASS.

- [ ] **Step 5: Run the broader vitest filter for any unaffected drift**

Run: `npm run typecheck`
Expected: PASS for both projects.  (Consumers of the old `names`/`classes` sidecar live elsewhere in the engine and are deleted in Task 8; for now this commit just isolates the parser surface.)

NOTE: the project's typecheck includes both `tsc --noEmit` and `tsc --noEmit --project tsconfig.tools.json`.  If the broader project typecheck still flags consumers of the deleted sidecar (e.g. `buildAllBins.ts`'s sidecar-write block), proceed to Task 7 — that block is removed there.  This task's commit captures only the parser rewrite.

- [ ] **Step 6: Commit**

```bash
git add tools/parsers/milliquas.ts tests/parsers/milliquas.test.ts
git commit -m "$(cat <<'EOF'
feat(milliquas-parser): emit classByte + parentSurveyByte per record

Drop the parallel names/classes sidecar return shape in favour of
per-record uint8 bytes that round-trip through the v5 .bin format.
The InfoCard reconstructs "<PARENT> J<RA><Dec>" at hover time from
the parentSurveyByte + iauRaDecSuffix(ra, dec), with the IAU
"MQ J<RA><Dec>" fallback for literature designations.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 7: Drop the sidecar-write block from `buildAllBins.ts`

**Files:**
- Modify: `tools/catalog/buildAllBins.ts`

- [ ] **Step 1: Trim `loadMilliquas` so it returns `MilliquasParseResult` without `names`/`classes`**

Edit `tools/catalog/buildAllBins.ts`.  The `loadMilliquas` helper currently builds an empty fallback shape containing `names` and `classes` arrays — those are gone now, so the helper simplifies.  Replace the entire `loadMilliquas` body with:

```ts
function loadMilliquas(path: string | undefined): MilliquasParseResult {
  const empty: MilliquasParseResult = {
    records: [],
    skipped: { zMissing: 0, zZero: 0, photoZRounded: 0, qsocRounded: 0 },
  };
  if (!path) return empty;
  const full = resolve(path);
  if (!existsSync(full)) {
    process.stderr.write(`  ${path} not present — Milliquas bin will be empty\n`);
    return empty;
  }
  const text = readFileSync(full, 'utf8');
  const result = parseMilliquas(text);
  const { records, skipped } = result;
  const skippedTotal =
    skipped.zMissing + skipped.zZero + skipped.photoZRounded + skipped.qsocRounded;
  process.stderr.write(
    `  loaded ${records.length.toLocaleString()} records ` +
      `(skipped ${skippedTotal.toLocaleString()}: ` +
      `z=blank ${skipped.zMissing.toLocaleString()}, ` +
      `z=0 ${skipped.zZero.toLocaleString()}, ` +
      `photo-z ${skipped.photoZRounded.toLocaleString()}, ` +
      `GAIA3 QSOC ${skipped.qsocRounded.toLocaleString()})\n`,
  );
  return result;
}
```

- [ ] **Step 2: Remove the sidecar-aware subsample branching + the JSON write**

Still in `tools/catalog/buildAllBins.ts`, locate the per-tier write loop (`for (const [source, records] of bySource)`).  Replace the `isMilliquas`-aware slice construction and the entire `if (isMilliquas) { … wrote … _names.json … }` block with the simpler subsample-only path.  Replace:

```ts
      // Milliquas owns parallel `names`/`classes` sidecars that must
      // reorder/subset in lockstep with the encoded records so the
      // runtime can look up `names[i]` by the same `localIdx` the
      // renderer uses.  We thread the kept-indices through
      // `subsampleIndicesByAbsMag` and re-zip; every other source
      // skips this branch and uses the value-returning variant.
      const isMilliquas = source === Source.Milliquas;
      const keptIndices =
        target === undefined
          ? null
          : isMilliquas
            ? subsampleIndicesByAbsMag(records, target)
            : null;
      const slice =
        target === undefined
          ? records
          : isMilliquas
            ? keptIndices!.map((i) => records[i]!)
            : subsampleByAbsMag(records, target);

      const cloud = recordsToCloud(slice);
      const buf = encodeGalaxyCatalog(cloud);
      const outPath = resolve(outDir, filename);
      writeFileSync(outPath, Buffer.from(buf));
      process.stderr.write(
        `wrote ${cloud.count.toLocaleString()} points to ${outPath} (${buf.byteLength.toLocaleString()} bytes)\n`,
      );

      // Milliquas sidecar: parallel-arrayed Name + class letter per
      // encoded record, written exactly once.  The sidecar is
      // tier-agnostic in shape (just JSON) but tier-specific in
      // content because each tier's subsample keeps a different
      // brightest-N slice — so we keep the file independent per tier
      // by suffixing it with the same tier the bin uses.  The
      // runtime fetcher pairs them by `<source>-<tier>.bin` and
      // `<source>-<tier>_names.json`.
      if (isMilliquas) {
        const indices =
          keptIndices ?? milliquasResult.records.map((_, i) => i);
        const names = indices.map((i) => milliquasResult.names[i]!);
        const classes = indices.map((i) => milliquasResult.classes[i]!);
        const sidecarName = filename.replace(/\.bin$/, '_names.json');
        const sidecarPath = resolve(outDir, sidecarName);
        writeFileSync(sidecarPath, JSON.stringify({ names, classes }));
        process.stderr.write(
          `wrote ${names.length.toLocaleString()} names+classes to ${sidecarPath}\n`,
        );
      }
```

with:

```ts
      // Milliquas needs no special-cased subsample path now that the
      // class + parent-survey bytes ride on the records themselves —
      // `subsampleByAbsMag` already preserves per-record fields when
      // it picks the brightest-N slice.
      const slice =
        target === undefined ? records : subsampleByAbsMag(records, target);

      const cloud = recordsToCloud(slice);
      const buf = encodeGalaxyCatalog(cloud);
      const outPath = resolve(outDir, filename);
      writeFileSync(outPath, Buffer.from(buf));
      process.stderr.write(
        `wrote ${cloud.count.toLocaleString()} points to ${outPath} (${buf.byteLength.toLocaleString()} bytes)\n`,
      );
```

- [ ] **Step 3: Remove the now-unused `subsampleIndicesByAbsMag` import**

In the imports near the top of `tools/catalog/buildAllBins.ts`, change:

```ts
import { subsampleByAbsMag, subsampleIndicesByAbsMag } from './subsampleByAbsMag.js';
```

to:

```ts
import { subsampleByAbsMag } from './subsampleByAbsMag.js';
```

- [ ] **Step 4: Typecheck**

Run: `npm run typecheck`
Expected: PASS (`MilliquasParseResult` is now the slim shape, parsers all default the two bytes, and the sidecar-write block is gone).

- [ ] **Step 5: Commit**

```bash
git add tools/catalog/buildAllBins.ts
git commit -m "$(cat <<'EOF'
feat(catalog-build): drop milliquas-*_names.json sidecar write path

Per-record classByte + parentSurveyByte now ride on the .bin (Task
6), so the build no longer emits the parallel JSON sidecar.
subsampleByAbsMag's value-returning variant preserves the bytes
through the brightest-N subset; the indices-returning variant
becomes dead code and its import goes too.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 8: Add `sourceClassLabel` + `milliquasParentSurveyPrefix` lookup helpers

**Files:**
- Create: `src/data/sourceClass.ts`
- Create: `tests/data/sourceClass.test.ts`

- [ ] **Step 1: Write the failing lookup-helper tests**

Create `tests/data/sourceClass.test.ts`:

```ts
/**
 * Unit tests for the per-source classification + parent-survey
 * lookup helpers.  These two functions are the only sites that know
 * how to interpret the `classByte` / `parentSurveyByte` slots on
 * the .bin's per-record layout; the rest of the engine is opaque
 * to the byte semantics.
 */
import { describe, it, expect } from 'vitest';
import {
  sourceClassLabel,
  milliquasParentSurveyPrefix,
  MILLIQUAS_CLASS_BYTE,
  MILLIQUAS_PARENT_SURVEY_BYTE,
} from '../../src/data/sourceClass';
import { Source } from '../../src/data/sources';

describe('sourceClassLabel', () => {
  it('maps each Milliquas class byte to the corresponding human label', () => {
    expect(sourceClassLabel(Source.Milliquas, MILLIQUAS_CLASS_BYTE.Q)).toBe('Quasar');
    expect(sourceClassLabel(Source.Milliquas, MILLIQUAS_CLASS_BYTE.A)).toBe('AGN type-1');
    expect(sourceClassLabel(Source.Milliquas, MILLIQUAS_CLASS_BYTE.B)).toBe('BL Lac');
    expect(sourceClassLabel(Source.Milliquas, MILLIQUAS_CLASS_BYTE.K)).toBe(
      'Seyfert-1 narrow',
    );
    expect(sourceClassLabel(Source.Milliquas, MILLIQUAS_CLASS_BYTE.N)).toBe(
      'Seyfert-1 broad',
    );
    expect(sourceClassLabel(Source.Milliquas, MILLIQUAS_CLASS_BYTE.S)).toBe('Candidate');
  });

  it('returns null for Milliquas byte 0 (unclassified)', () => {
    expect(sourceClassLabel(Source.Milliquas, 0)).toBeNull();
  });

  it('returns null for any non-Milliquas source today', () => {
    expect(sourceClassLabel(Source.SDSS, 0)).toBeNull();
    expect(sourceClassLabel(Source.SDSS, 1)).toBeNull();
    expect(sourceClassLabel(Source.TwoMRS, 5)).toBeNull();
    expect(sourceClassLabel(Source.Glade, 3)).toBeNull();
    expect(sourceClassLabel(Source.Famous, 2)).toBeNull();
    expect(sourceClassLabel(Source.Synthetic, 1)).toBeNull();
  });

  it('returns null for an unrecognised Milliquas class byte', () => {
    // Defensive: a future Milliquas release might introduce a new
    // class letter we don't recognise yet.  The function should
    // degrade to null rather than crash the InfoCard.
    expect(sourceClassLabel(Source.Milliquas, 99)).toBeNull();
  });
});

describe('milliquasParentSurveyPrefix', () => {
  it('maps each parent-survey byte to its display prefix', () => {
    expect(milliquasParentSurveyPrefix(MILLIQUAS_PARENT_SURVEY_BYTE.SDSS)).toBe('SDSS');
    expect(milliquasParentSurveyPrefix(MILLIQUAS_PARENT_SURVEY_BYTE.TWOMASX)).toBe('2MASX');
    expect(milliquasParentSurveyPrefix(MILLIQUAS_PARENT_SURVEY_BYTE.GAIA)).toBe('GAIA');
    expect(milliquasParentSurveyPrefix(MILLIQUAS_PARENT_SURVEY_BYTE.WISEA)).toBe('WISEA');
    expect(milliquasParentSurveyPrefix(MILLIQUAS_PARENT_SURVEY_BYTE.NVSS)).toBe('NVSS');
    expect(milliquasParentSurveyPrefix(MILLIQUAS_PARENT_SURVEY_BYTE.FIRST)).toBe('FIRST');
    expect(milliquasParentSurveyPrefix(MILLIQUAS_PARENT_SURVEY_BYTE.SIXDFGS)).toBe('6dFGS');
  });

  it('returns null for the OTHER sentinel (byte 0)', () => {
    expect(milliquasParentSurveyPrefix(0)).toBeNull();
  });

  it('returns null for an unrecognised byte', () => {
    expect(milliquasParentSurveyPrefix(99)).toBeNull();
  });
});
```

- [ ] **Step 2: Verify the tests fail**

Run: `npx vitest run tests/data/sourceClass.test.ts`
Expected: FAIL — module does not exist.

- [ ] **Step 3: Implement the lookup module**

Create `src/data/sourceClass.ts`:

```ts
/**
 * Per-source classification + Milliquas parent-survey lookup helpers.
 *
 * Two slots on every `GalaxyCatalog` record carry per-row metadata
 * whose meaning depends on the source:
 *
 *   - `classByte` (uint8) — source-interpreted classification.
 *     Today only Milliquas populates it (AGN class letter →
 *     enum 1..6).  Every other source stores 0 and
 *     `sourceClassLabel` returns null.  Future per-survey class
 *     signals (e.g. GLADE morphology) add a new branch here
 *     without touching the .bin format.
 *
 *   - `parentSurveyByte` (uint8) — Milliquas-only enum that
 *     records which parent survey the row's Milliquas Name came
 *     from (SDSS/2MASX/GAIA/WISEA/NVSS/FIRST/6dFGS).  Used by the
 *     InfoCard to reconstruct the historical "<PARENT> J<RA><Dec>"
 *     display name from the bin without a sidecar JSON.
 *
 * Why a separate module rather than members on `sources.ts`?
 * `sources.ts` is the canonical "what's a survey?" file and is
 * imported almost everywhere; growing it with per-row interpretation
 * tables would blur the boundary between "survey identity" and "row
 * payload semantics".  Splitting them lets each module say one thing
 * cleanly.
 *
 * The byte values below are persisted in `.bin` files (see
 * `galaxyCatalogFormat.ts`).  Treat them like the `Source` enum
 * values — append, never renumber.
 */

import { Source } from './sources';

/**
 * Milliquas AGN class enum.  Letters Q/A/B/K/N/S come from the
 * Milliquas v8 Type column's leading non-space character; we map
 * each to a small contiguous integer that fits in a byte.  `0` is
 * reserved for "unknown / unclassified", which is the value every
 * non-Milliquas source writes.
 */
export const MILLIQUAS_CLASS_BYTE = {
  Q: 1,
  A: 2,
  B: 3,
  K: 4,
  N: 5,
  S: 6,
} as const;

/**
 * Milliquas parent-survey enum.  Each value corresponds to a prefix
 * that overwhelmingly appears at the start of the Milliquas Name
 * column (e.g. `"SDSS J012345.67+891234.5"`).  `0` is the catch-all
 * for literature designations (`3C 273`, `M 87`, `NGC 1275`) and any
 * unrecognised prefix.
 *
 * Naming: TWOMASX / SIXDFGS spell out the digit-prefix names that
 * would be invalid TypeScript identifiers otherwise.  The display
 * strings (`'2MASX'`, `'6dFGS'`) come from `PARENT_SURVEY_LABEL` below.
 */
export const MILLIQUAS_PARENT_SURVEY_BYTE = {
  SDSS: 1,
  TWOMASX: 2,
  GAIA: 3,
  WISEA: 4,
  NVSS: 5,
  FIRST: 6,
  SIXDFGS: 7,
} as const;

const MILLIQUAS_CLASS_LABEL: Record<number, string> = {
  [MILLIQUAS_CLASS_BYTE.Q]: 'Quasar',
  [MILLIQUAS_CLASS_BYTE.A]: 'AGN type-1',
  [MILLIQUAS_CLASS_BYTE.B]: 'BL Lac',
  [MILLIQUAS_CLASS_BYTE.K]: 'Seyfert-1 narrow',
  [MILLIQUAS_CLASS_BYTE.N]: 'Seyfert-1 broad',
  [MILLIQUAS_CLASS_BYTE.S]: 'Candidate',
};

const PARENT_SURVEY_LABEL: Record<number, string> = {
  [MILLIQUAS_PARENT_SURVEY_BYTE.SDSS]: 'SDSS',
  [MILLIQUAS_PARENT_SURVEY_BYTE.TWOMASX]: '2MASX',
  [MILLIQUAS_PARENT_SURVEY_BYTE.GAIA]: 'GAIA',
  [MILLIQUAS_PARENT_SURVEY_BYTE.WISEA]: 'WISEA',
  [MILLIQUAS_PARENT_SURVEY_BYTE.NVSS]: 'NVSS',
  [MILLIQUAS_PARENT_SURVEY_BYTE.FIRST]: 'FIRST',
  [MILLIQUAS_PARENT_SURVEY_BYTE.SIXDFGS]: '6dFGS',
};

/**
 * Human-readable label for this row's class byte, or null when the
 * source doesn't define one.  Used by the InfoCard's "AGN class"
 * row; non-Milliquas sources never display the row at all.
 */
export function sourceClassLabel(source: Source, classByte: number): string | null {
  if (source !== Source.Milliquas) return null;
  return MILLIQUAS_CLASS_LABEL[classByte] ?? null;
}

/**
 * Display prefix for a Milliquas parent-survey byte (`"SDSS"`,
 * `"2MASX"`, …), or null for the OTHER sentinel (byte 0) and any
 * unrecognised value.  The InfoCard prepends this to the
 * `iauRaDecSuffix(ra, dec)` to reconstruct the historical
 * `"<PARENT> J<RA><Dec>"` display name without a JSON sidecar.
 */
export function milliquasParentSurveyPrefix(byte: number): string | null {
  return PARENT_SURVEY_LABEL[byte] ?? null;
}
```

- [ ] **Step 4: Run the lookup-helper tests**

Run: `npx vitest run tests/data/sourceClass.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck**

Run: `npm run typecheck`
Expected: PASS — the Milliquas parser (Task 6) imports the two constants by name, and they now exist.

- [ ] **Step 6: Commit**

```bash
git add src/data/sourceClass.ts tests/data/sourceClass.test.ts
git commit -m "$(cat <<'EOF'
feat(sourceClass): add per-source class + Milliquas parent-survey lookups

sourceClassLabel(source, byte) maps the bin's classByte slot to a
human string (Milliquas Q/A/B/K/N/S today; null for every other
source).  milliquasParentSurveyPrefix(byte) maps the
parentSurveyByte to a display string (SDSS/2MASX/GAIA/…) for the
InfoCard's display-name reconstruction.  Constants are reused by
the Milliquas parser.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 9: Delete the Milliquas names sidecar pipeline

**Files:**
- Delete: `src/services/loading/fetchers/milliquasNamesFetcher.ts`
- Delete: `src/services/loading/slots/milliquasNamesSlot.ts`
- Delete: `src/@types/loading/MilliquasNamesPayload.d.ts`
- Delete: `tests/services/loading/fetchers/milliquasNamesFetcher.test.ts`
- Modify: `src/@types/engine/wiring/GalaxyCatalogSourceConfig.d.ts`
- Modify: `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts`
- Modify: `src/@types/engine/state/EngineAssetSlots.d.ts`
- Modify: `src/@types/engine/state/EngineSourceState.d.ts`
- Modify: `src/@types/engine/subsystems/CreateSelectionSubsystemInput.d.ts`
- Modify: `src/services/engine/subsystems/selectionSubsystem.ts`
- Modify: `src/services/engine/phases/wireSlots.ts`
- Modify: `src/services/engine/phases/wireInput.ts`
- Modify: `src/services/engine/engine.ts`
- Modify: `tests/@types/engineState.test.ts`
- Modify: `tests/services/engine/setSourceVisibleFade.test.ts`

- [ ] **Step 1: Delete the fetcher, slot, payload type, and the fetcher test**

```bash
rm src/services/loading/fetchers/milliquasNamesFetcher.ts
rm src/services/loading/slots/milliquasNamesSlot.ts
rm src/@types/loading/MilliquasNamesPayload.d.ts
rm tests/services/loading/fetchers/milliquasNamesFetcher.test.ts
```

- [ ] **Step 2: Drop `'milliquasNames'` from `GalaxyCatalogCompanionRef`**

Edit `src/@types/engine/wiring/GalaxyCatalogSourceConfig.d.ts`.  Replace the JSDoc and the union with the slim form:

```ts
/**
 * Names of the asset slots that may live alongside a galaxy-catalog
 * `.bin`.  Each value corresponds to a key on `state.assetSlots` whose
 * `.load()` is fired by `loadCompanionAssets` in lockstep with the main
 * bin — at boot (if the source is visible), on visibility toggle-on,
 * and on tier change.
 *
 *   - `famousMeta` — Famous-galaxy meta + xrefs JSON sidecar
 *                    (tier-agnostic; one load per session).
 */
export type GalaxyCatalogCompanionRef = 'famousMeta';
```

- [ ] **Step 3: Drop the `companions: ['milliquasNames']` row in the registry**

Edit `src/services/engine/wiring/galaxyCatalogSourceRegistry.ts`.  Locate the Milliquas registry entry and replace it with:

```ts
  {
    source: Source.Milliquas,
    shortName: 'milliquas',
    fetcher: galaxyCatalogFetcher,
    category: 'survey',
    // No companion sidecars: the v5 .bin format carries the AGN
    // class byte + parent-survey prefix byte per record, so the
    // InfoCard reconstructs the display name without an auxiliary
    // JSON fetch.
  },
```

- [ ] **Step 4: Strip the `milliquasNames` slot from the asset-slot type**

Edit `src/@types/engine/state/EngineAssetSlots.d.ts`.  Remove the `MilliquasNamesPayload` import (line ~34) and remove the entire `milliquasNames: AssetSlot<…> | null;` field (with its JSDoc).  The `Source` import stays — other fields use it.

- [ ] **Step 5: Strip `milliquasNames` + `milliquasClasses` from the source-state type**

Edit `src/@types/engine/state/EngineSourceState.d.ts`.  Remove the two fields and their JSDoc blocks.  The remaining `tier` field's JSDoc stays untouched.

- [ ] **Step 6: Strip `getMilliquasNames` from the selection subsystem input**

Edit `src/@types/engine/subsystems/CreateSelectionSubsystemInput.d.ts`.  Replace the file body with:

```ts
import type { EngineCallbacks } from '../EngineCallbacks';
import type { GalaxyCatalog } from '../../data/GalaxyCatalog';
import type { Source } from '../../../data/sources';
import type { FamousMetaEntry } from '../../loading/FamousMetaEntry';
import type { FamousXrefMap } from '../../loading/FamousXrefMap';

/**
 * Hooks the subsystem needs from the outside world.  All passed once
 * at construction; the cloud / sidecar accessors are CLOSURES (not
 * values) so the subsystem reads the live state at call time — see
 * the module header for why that matters.
 */
export type CreateSelectionSubsystemInput = {
  /** UI-callback sink — only `onHoverChange` / `onSelectChange` are read. */
  cb: EngineCallbacks;
  /** Live read of source catalogs; closure rather than snapshot so tier swaps land. */
  getCloud: (source: Source) => GalaxyCatalog | undefined;
  /** Live read of the famous-galaxy meta sidecar (curated names + thumbnail IDs). */
  getFamousMeta: () => readonly FamousMetaEntry[];
  /** Live read of the famous-galaxy xref sidecar (cross-survey ID joins). */
  getFamousXrefs: () => FamousXrefMap;
};
```

- [ ] **Step 7: Drop `getMilliquasNames` from `createSelectionSubsystem`**

Edit `src/services/engine/subsystems/selectionSubsystem.ts`.

Replace:

```ts
  const { cb, getCloud, getFamousMeta, getFamousXrefs, getMilliquasNames } = input;
```

with:

```ts
  const { cb, getCloud, getFamousMeta, getFamousXrefs } = input;
```

Then inside `galaxyInfoFor`, remove the trailing `getMilliquasNames(),` argument from the `buildGalaxyInfo(c, sel.localIdx, sel.source, getFamousMeta(), getFamousXrefs(), getMilliquasNames());` call:

```ts
    return buildGalaxyInfo(
      c,
      sel.localIdx,
      sel.source,
      getFamousMeta(),
      getFamousXrefs(),
    );
```

- [ ] **Step 8: Strip the slot from `wireSlots`**

Edit `src/services/engine/phases/wireSlots.ts`.

Remove the import line:

```ts
import { createMilliquasNamesSlot } from '../../loading/slots/milliquasNamesSlot';
```

Remove the entire `// ── Milliquas names sidecar slot ──` block (the comment and the `const milliquasNamesSlot = createMilliquasNamesSlot(state, cb);` line).

Remove the `allSlots.set(milliquasNamesSlot.name, …)` registration block:

```ts
  allSlots.set(
    milliquasNamesSlot.name,
    milliquasNamesSlot as unknown as AssetSlot<unknown, unknown>,
  );
```

- [ ] **Step 9: Strip the slot from `wireInput`'s `buildGalaxyInfo` call**

Edit `src/services/engine/phases/wireInput.ts`.

Replace the `buildGalaxyInfo` call inside `createClickResolver`:

```ts
    buildGalaxyInfo: (cloud, localIdx, src) =>
      buildGalaxyInfo(
        cloud,
        localIdx,
        src,
        state.sources.famousMeta,
        state.sources.famousXrefs,
        state.sources.milliquasNames,
      ),
```

with:

```ts
    buildGalaxyInfo: (cloud, localIdx, src) =>
      buildGalaxyInfo(
        cloud,
        localIdx,
        src,
        state.sources.famousMeta,
        state.sources.famousXrefs,
      ),
```

- [ ] **Step 10: Strip every reference from `engine.ts`**

Edit `src/services/engine/engine.ts`.

(a) In the `sources` literal (around line 451–458), delete the comment block that explains `milliquasNames` and the two fields themselves so the literal becomes:

```ts
      catalogs: new Map<Source, GalaxyCatalog>(),
      famousMeta: [],
      famousXrefs: {},
      tier: cb.initialTier ?? 'medium',
```

(b) In the `createSelectionSubsystem` call (around line 593), delete the `getMilliquasNames: () => state.sources.milliquasNames,` line.

(c) In the `assetSlots` literal (around line 709), delete the comment block + the `milliquasNames: null,` line so the literal ends at `mcpm: null,`.

(d) In both `selectFamous` and `selectByAlias`, drop the `state.sources.milliquasNames,` arg from the two `buildGalaxyInfo(…)` calls.

- [ ] **Step 11: Update `tests/@types/engineState.test.ts`**

Edit `tests/@types/engineState.test.ts`.  In every `EngineSourceState` fixture literal (three sites), remove the two lines:

```ts
      milliquasNames: [],
      milliquasClasses: [],
```

In every `createSelectionSubsystem({...})` call (two sites), remove the line:

```ts
        getMilliquasNames: () => [],
```

In every `assetSlots` literal (two sites), remove the line:

```ts
        milliquasNames: null,
```

- [ ] **Step 12: Update `tests/services/engine/setSourceVisibleFade.test.ts`**

Edit `tests/services/engine/setSourceVisibleFade.test.ts`.  In `makeFixture`, change:

```ts
    assetSlots: {
      points: new Map(),
      milliquasNames: null,
    },
```

to:

```ts
    assetSlots: {
      points: new Map(),
    },
```

- [ ] **Step 13: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 14: Run the affected vitest suites**

Run: `npx vitest run tests/@types/engineState.test.ts tests/services/engine/setSourceVisibleFade.test.ts tests/services/engine`
Expected: PASS.  (The `galaxyInfoBuilder.test.ts` will still fail on the Milliquas branch — that test gets rewritten in Task 11.)

- [ ] **Step 15: Commit**

```bash
git add -- \
  src/services/loading/fetchers/milliquasNamesFetcher.ts \
  src/services/loading/slots/milliquasNamesSlot.ts \
  src/@types/loading/MilliquasNamesPayload.d.ts \
  tests/services/loading/fetchers/milliquasNamesFetcher.test.ts \
  src/@types/engine/wiring/GalaxyCatalogSourceConfig.d.ts \
  src/services/engine/wiring/galaxyCatalogSourceRegistry.ts \
  src/@types/engine/state/EngineAssetSlots.d.ts \
  src/@types/engine/state/EngineSourceState.d.ts \
  src/@types/engine/subsystems/CreateSelectionSubsystemInput.d.ts \
  src/services/engine/subsystems/selectionSubsystem.ts \
  src/services/engine/phases/wireSlots.ts \
  src/services/engine/phases/wireInput.ts \
  src/services/engine/engine.ts \
  tests/@types/engineState.test.ts \
  tests/services/engine/setSourceVisibleFade.test.ts
git commit -m "$(cat <<'EOF'
refactor(engine): delete milliquas names sidecar pipeline end-to-end

The v5 .bin format carries the Milliquas display-name ingredients
(class byte + parent-survey byte) per record, so the JSON sidecar
+ fetcher + slot + EngineSourceState fields + companion-asset
registry row are all dead weight.  Drop them, leaving the
buildGalaxyInfo signature one parameter shorter — that parameter
is replaced by the byte-driven reconstruction in the next task.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 10: Update `buildGalaxyInfo` to drop the names arg and add class + parent-survey reconstruction

**Files:**
- Modify: `src/@types/engine/GalaxyInfo.d.ts`
- Modify: `src/services/engine/helpers/galaxyInfoBuilder.ts`

- [ ] **Step 1: Add `agnClass` to the `GalaxyInfo` type**

Edit `src/@types/engine/GalaxyInfo.d.ts`.  After the `iauName: string;` field and before the `displayName` field, insert:

```ts
  /**
   * Human-readable AGN classification for the row, or `undefined`
   * when the source doesn't define one.
   *
   * Today only `Source.Milliquas` populates this — values come from
   * `sourceClassLabel(source, classByte)` (e.g. `"Quasar"`,
   * `"BL Lac"`, `"Seyfert-1 broad"`).  For SDSS / 2MRS / GLADE /
   * Famous / Synthetic rows the field is `undefined` and the
   * InfoCard hides the row entirely.
   *
   * The field is optional rather than `string | null` because the
   * InfoCard already conditionally renders rows with `info.agnClass
   * && (…)`; an explicit `undefined` keeps the absent-row markup
   * identical to every other "this row doesn't apply" field.
   */
  agnClass?: string;
```

Also update the `displayName` JSDoc to drop the Milliquas-sidecar bullet that lives in it today, replacing it with a parent-survey bullet:

Change the existing block:

```ts
  /**
   * The single best human-readable name for this row, suitable as a
   * headline in the InfoCard / hover preview.  Derived from a small
   * priority ladder:
   *
   *   1. Famous rows → primary curated name from the seed JSON
   *      (e.g. "M31", "NGC 5128").
   *   2. 2MRS or GLADE rows with a real PGC (objID > 0n) → `PGC <n>`.
   *      PGC numbers are widely indexed by NED / SIMBAD and are
   *      shorter and more memorable than a coord-based name.  For
   *      GLADE the PGC comes directly from the source row; for 2MRS
   *      it's populated by the build-time GLADE→2MRS cross-match.
   *   3. Everything else → `iauName` (the coord-based fallback).
   *
   * Pre-computed in the builder rather than left to each surface
   * (FullCard, CompactCard, command palette) so the headline stays
   * consistent across the UI without each component duplicating the
   * priority rules.
   */
  displayName: string;
```

to:

```ts
  /**
   * The single best human-readable name for this row, suitable as a
   * headline in the InfoCard / hover preview.  Derived from a small
   * priority ladder:
   *
   *   1. Famous rows → primary curated name from the seed JSON
   *      (e.g. "M31", "NGC 5128").
   *   2. Milliquas rows with a known parent-survey prefix → the
   *      reconstructed "<PARENT> J<RA><Dec>" (e.g.
   *      "SDSS J012345.67+891234.5", "2MASX J…").  Built from the
   *      per-record `parentSurveyByte` slot in the .bin and the
   *      shared `iauRaDecSuffix(ra, dec)` emitter.
   *   3. 2MRS or GLADE rows with a real PGC (objID > 0n) → `PGC <n>`.
   *      PGC numbers are widely indexed by NED / SIMBAD and are
   *      shorter and more memorable than a coord-based name.  For
   *      GLADE the PGC comes directly from the source row; for 2MRS
   *      it's populated by the build-time GLADE→2MRS cross-match.
   *   4. Everything else → `iauName` (the coord-based fallback).
   *
   * Pre-computed in the builder rather than left to each surface
   * (FullCard, CompactCard, command palette) so the headline stays
   * consistent across the UI without each component duplicating the
   * priority rules.
   */
  displayName: string;
```

- [ ] **Step 2: Rewrite `buildGalaxyInfo` to use the bytes**

Edit `src/services/engine/helpers/galaxyInfoBuilder.ts`.

(a) Replace the existing imports block with one that adds the two new helpers:

```ts
import type { GalaxyInfo } from '../../../@types/engine/GalaxyInfo';
import type { GalaxyCatalog } from '../../../@types/data/GalaxyCatalog';
import { Source, sourceLabel, bandLabels } from '../../../data/sources';
import {
  sourceClassLabel,
  milliquasParentSurveyPrefix,
} from '../../../data/sourceClass';
import type { FamousMetaEntry } from '../../../@types/loading/FamousMetaEntry';
import type { FamousXrefMap } from '../../../@types/loading/FamousXrefMap';
import { famousDisplayName } from './famousDisplayName';
import { fallbackOrientation } from '../../../utils/random/fallbackOrientation';
import {
  cartesianToRaDecZ,
  formatRaSexagesimal,
  formatDecSexagesimal,
  iauName,
  iauRaDecSuffix,
  lookbackTimeGyr,
  hubbleVelocityKmS,
  absoluteMagnitude,
  earthEraForLookback,
  galaxyType,
  sdssExplorerUrl,
  sdssThumbnailUrl,
  dssThumbnailUrl,
  nedByNameUrl,
  nedNearPositionUrl,
  DEFAULT_GALAXY_DIAMETER_KPC,
} from '../../../utils/math';
```

(b) Change the function signature.  Replace:

```ts
export function buildGalaxyInfo(
  cloud: GalaxyCatalog,
  idx: number,
  source: Source,
  famousMeta?: readonly FamousMetaEntry[],
  famousXrefs?: FamousXrefMap,
  milliquasNames?: readonly string[],
): GalaxyInfo {
```

with:

```ts
export function buildGalaxyInfo(
  cloud: GalaxyCatalog,
  idx: number,
  source: Source,
  famousMeta?: readonly FamousMetaEntry[],
  famousXrefs?: FamousXrefMap,
): GalaxyInfo {
```

(c) Just before the existing `// ── Famous-galaxy enrichment ──` block, add the bytes-driven reconstruction:

```ts
  // ── Per-record metadata bytes (v5 format) ──────────────────────────────────
  //
  // Both bytes are zero-default across every non-Milliquas source;
  // sourceClassLabel + milliquasParentSurveyPrefix gate on `source`
  // internally so it's safe to read them unconditionally here.
  const classByte = cloud.classByte[idx]!;
  const parentSurveyByte = cloud.parentSurveyByte[idx]!;
  const agnClass = sourceClassLabel(source, classByte) ?? undefined;
  const parentSurveyPrefix = milliquasParentSurveyPrefix(parentSurveyByte);

  // Milliquas "<PARENT> J<RA><Dec>" reconstruction.  When the bin
  // carries a recognised parent-survey byte (~98% of Milliquas
  // rows), produce the historical display name without the JSON
  // sidecar that v4 needed; otherwise leave the field undefined and
  // let the displayName ladder fall through to the IAU "MQ J…"
  // fallback.
  const milliquasDisplayName =
    source === Source.Milliquas && parentSurveyPrefix !== null
      ? `${parentSurveyPrefix} ${iauRaDecSuffix(ra, dec)}`
      : undefined;
```

(d) Update the `displayName` ladder to consult the reconstructed name in slot 2.  Replace the existing block:

```ts
    displayName:
      [
        famous ? famousDisplayName(famous) : undefined,
        source === Source.Milliquas && milliquasNames && milliquasNames[idx]
          ? milliquasNames[idx]
          : undefined,
        (source === Source.TwoMRS || source === Source.Glade) && cloud.objIDs[idx]! > 0n
          ? `PGC ${cloud.objIDs[idx]!}`
          : undefined,
        iauName(source, ra, dec),
      ].find((c) => c !== undefined && c.length > 0) ?? iauName(source, ra, dec),
```

with:

```ts
    displayName:
      [
        famous ? famousDisplayName(famous) : undefined,
        milliquasDisplayName,
        (source === Source.TwoMRS || source === Source.Glade) && cloud.objIDs[idx]! > 0n
          ? `PGC ${cloud.objIDs[idx]!}`
          : undefined,
        iauName(source, ra, dec),
      ].find((c) => c !== undefined && c.length > 0) ?? iauName(source, ra, dec),
```

(e) Add `agnClass` to the returned object literal.  Just after the existing `sourceLabel: sourceLabel(source),` line, insert:

```ts
    // Per-record AGN class string, or undefined when the source
    // doesn't define one (every non-Milliquas row today).
    agnClass,
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/@types/engine/GalaxyInfo.d.ts src/services/engine/helpers/galaxyInfoBuilder.ts
git commit -m "$(cat <<'EOF'
feat(galaxyInfo): reconstruct Milliquas display name from bin bytes

Drop the milliquasNames runtime parameter; instead, read the v5
.bin's per-record classByte (for the InfoCard's AGN class row) and
parentSurveyByte (for "<PARENT> J<RA><Dec>" display-name
reconstruction).  GalaxyInfo grows an optional `agnClass` field
for the AGN class row.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 11: Rewrite the `galaxyInfoBuilder` Milliquas tests

**Files:**
- Modify: `tests/services/engine/helpers/galaxyInfoBuilder.test.ts`

- [ ] **Step 1: Update the test cloud factory to include the two new typed arrays**

Edit `tests/services/engine/helpers/galaxyInfoBuilder.test.ts`.  Replace the `makeCloud` body so it also allocates the new byte slots:

```ts
function makeCloud(count: number): GalaxyCatalog {
  return {
    count,
    objIDs: BigUint64Array.from({ length: count }, (_, i) => BigInt(i + 1)),
    positions: new Float32Array(count * 3),
    magU: new Float32Array(count),
    magG: new Float32Array(count),
    magR: new Float32Array(count),
    magI: new Float32Array(count),
    magZ: new Float32Array(count),
    axisRatio: new Float32Array(count).fill(0.7),
    positionAngleDeg: new Float32Array(count).fill(45),
    diameterKpc: new Float32Array(count).fill(30),
    classByte: new Uint8Array(count),
    parentSurveyByte: new Uint8Array(count),
  };
}
```

- [ ] **Step 2: Replace the Milliquas branch with byte-driven tests**

Still in `tests/services/engine/helpers/galaxyInfoBuilder.test.ts`, locate the `describe('buildGalaxyInfo — Milliquas source', …)` block at the bottom of the file and replace its three `it` cases with:

```ts
describe('buildGalaxyInfo — Milliquas source', () => {
  it('reconstructs "<PARENT> J<RA><Dec>" when parentSurveyByte is set', () => {
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    // 1 = SDSS — see MILLIQUAS_PARENT_SURVEY_BYTE.SDSS.
    cloud.parentSurveyByte[0] = 1;
    // 1 = Quasar — see MILLIQUAS_CLASS_BYTE.Q.
    cloud.classByte[0] = 1;
    const info = buildGalaxyInfo(cloud, 0, Source.Milliquas);
    expect(info.displayName.startsWith('SDSS J')).toBe(true);
    // The suffix portion must be byte-identical to iauName's
    // (`MQ J…`) suffix — the whole point of iauRaDecSuffix is that
    // the two strings only differ by the prefix.
    expect(info.displayName.slice(5)).toBe(info.iauName.slice(3));
    expect(info.agnClass).toBe('Quasar');
  });

  it('falls back to the IAU "MQ J<RA><Dec>" headline when parentSurveyByte is 0', () => {
    // Literature designation row (3C 273, M 87, …) — both bytes
    // stay at the zero-fill default.
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    const info = buildGalaxyInfo(cloud, 0, Source.Milliquas);
    expect(info.displayName).toBe(info.iauName);
    expect(info.displayName.startsWith('MQ J')).toBe(true);
    expect(info.agnClass).toBeUndefined();
  });

  it('emits each parent-survey prefix correctly', () => {
    const cases: Array<[number, string]> = [
      [1, 'SDSS'],
      [2, '2MASX'],
      [3, 'GAIA'],
      [4, 'WISEA'],
      [5, 'NVSS'],
      [6, 'FIRST'],
      [7, '6dFGS'],
    ];
    for (const [byte, prefix] of cases) {
      const cloud = makeCloud(1);
      setPosition(cloud, 0, 100, 0, 0);
      cloud.parentSurveyByte[0] = byte;
      const info = buildGalaxyInfo(cloud, 0, Source.Milliquas);
      expect(info.displayName.startsWith(`${prefix} J`)).toBe(true);
    }
  });

  it('exposes the human AGN class label for each Milliquas class byte', () => {
    const cases: Array<[number, string]> = [
      [1, 'Quasar'],
      [2, 'AGN type-1'],
      [3, 'BL Lac'],
      [4, 'Seyfert-1 narrow'],
      [5, 'Seyfert-1 broad'],
      [6, 'Candidate'],
    ];
    for (const [byte, expected] of cases) {
      const cloud = makeCloud(1);
      setPosition(cloud, 0, 100, 0, 0);
      cloud.classByte[0] = byte;
      const info = buildGalaxyInfo(cloud, 0, Source.Milliquas);
      expect(info.agnClass).toBe(expected);
    }
  });

  it('leaves agnClass undefined for non-Milliquas sources even with classByte set', () => {
    const cloud = makeCloud(1);
    setPosition(cloud, 0, 100, 0, 0);
    cloud.classByte[0] = 1; // Would mean "Quasar" if source were Milliquas.
    const info = buildGalaxyInfo(cloud, 0, Source.SDSS);
    expect(info.agnClass).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run the file's tests**

Run: `npx vitest run tests/services/engine/helpers/galaxyInfoBuilder.test.ts`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tests/services/engine/helpers/galaxyInfoBuilder.test.ts
git commit -m "$(cat <<'EOF'
test(galaxyInfo): pivot Milliquas branch to byte-driven coverage

Replace the milliquasNames-arg assertions with classByte +
parentSurveyByte assertions that exercise the full v5 byte
vocabulary (six class letters, seven parent-survey prefixes, the
OTHER fallback, and the non-Milliquas no-op).

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 12: Update R2 sync to drop the names-JSON filter and delete leftover keys

**Files:**
- Modify: `tools/deploy/syncR2.ts`

- [ ] **Step 1: Drop the names-JSON pattern from the ALLOW filter**

Edit `tools/deploy/syncR2.ts`.  Locate the `ALLOW` regex set and replace it with the version that no longer matches `_names.json`:

```ts
const ALLOW = (name: string): boolean =>
  /^(sdss|glade)-(small|medium|large)\.bin$/.test(name) ||
  // Milliquas v8 (Flesch 2023): same tier-suffixed pattern as
  // SDSS/GLADE.  Class + parent-survey metadata rides on the bin
  // itself in v5 — no JSON sidecar to upload.
  /^milliquas-(small|medium|large)\.bin$/.test(name) ||
  name === '2mrs.bin' ||
  name === 'famous.bin' ||
  name === 'filaments.bin' ||
  name === 'filaments-small.bin' ||
  name === 'famous_meta.json' ||
  name === 'famous_xrefs.json' ||
  name === 'cf4_density.scfd' ||
  /^mcpm-(small|medium|large)\.scfd$/.test(name);
```

- [ ] **Step 2: Add a leftover-key deletion step after the main sync**

Still in `tools/deploy/syncR2.ts`, add a helper just above `main()`:

```ts
/**
 * Remove leftover Milliquas names-JSON sidecar keys from R2.
 *
 * The v5 .bin format folds Milliquas class + parent-survey metadata
 * into the binary, so `milliquas-{small,medium,large}_names.json`
 * are no longer produced or fetched.  Wrangler's `r2 object delete`
 * is idempotent (no error on a missing key), so this runs cleanly
 * on every sync — including the first sync after a fresh bucket
 * provision, where no leftover keys exist.
 *
 * Why delete rather than just stop uploading?  R2 keeps every object
 * that was ever PUT, so without explicit deletion the stale 34 MB of
 * `_names.json` would sit there indefinitely, paid for and served
 * for any old client that hard-coded the URL.
 */
function deleteOrphanedMilliquasNamesSidecars(): void {
  const orphans = [
    'data/milliquas-small_names.json',
    'data/milliquas-medium_names.json',
    'data/milliquas-large_names.json',
  ];
  for (const key of orphans) {
    console.log(`▶ delete r2://${BUCKET}/${key} (orphaned v4 sidecar)`);
    // `--remote` forces the deletion against the actual Cloudflare-
    // hosted bucket (not the local-dev simulator).  Missing keys are
    // a no-op in wrangler, so we don't even need a 404 swallow here.
    execSync(`npx wrangler r2 object delete ${BUCKET}/${key} --remote`, {
      stdio: 'inherit',
    });
  }
}
```

Then, near the bottom of `main()`, after the final `console.log` that prints `✓ Synced N file(s)…`, add:

```ts
  console.log('\n--- Orphaned sidecar cleanup ---\n');
  deleteOrphanedMilliquasNamesSidecars();
```

- [ ] **Step 3: Typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add tools/deploy/syncR2.ts
git commit -m "$(cat <<'EOF'
build(deploy): stop syncing milliquas-*_names.json and delete orphans

The v5 .bin format carries the Milliquas class + parent-survey
metadata per record, so the JSON sidecar is dead.  Drop it from
the ALLOW filter and add an idempotent delete step that removes
any leftover small/medium/large names.json keys from R2 on every
sync.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

### Task 13: End-to-end rebuild, R2 sync, and PR

**Files:** none modified by this task — it's the deploy + PR step.

- [ ] **Step 1: Full typecheck + test sweep on the worktree**

Run: `npm run typecheck && npm test`
Expected: both PASS.  Capture the test count and confirm it is ≥ the previous green baseline.

- [ ] **Step 2: Confirm raw Milliquas fixture is present, then rebuild every tier**

```bash
test -f data/raw/milliquas/milliquas.txt || npm run fetch-milliquas
npm run build-tiers
```

Expected: per-source rebuild logs land in `public/data/` for SDSS / 2MRS / GLADE / Famous / Milliquas at every tier, with no `milliquas-*_names.json` outputs.

- [ ] **Step 3: Sanity-check one of the new bins has v5 magic + version**

Run: `node -e "const f=require('node:fs');const b=f.readFileSync('public/data/milliquas-medium.bin');const dv=new DataView(b.buffer,b.byteOffset,16);console.log({magic:dv.getUint32(0,true).toString(16),version:dv.getUint32(4,true),count:dv.getUint32(8,true)});"`
Expected: `{ magic: '504d4b53', version: 5, count: <a positive int> }`.

- [ ] **Step 4: Sync to R2 (uploads new bins + deletes orphaned sidecars)**

Run: `npm run sync-r2`
Expected: upload log for every allowed file, followed by the "Orphaned sidecar cleanup" section that deletes the three `milliquas-*_names.json` keys.

- [ ] **Step 5: Push the branch and open the PR**

```bash
git push -u origin worktree-milliquas-bin-class-byte
gh pr create --title "feat(milliquas): fold AGN class + parent-survey into bin v5; drop names sidecar" --body "$(cat <<'EOF'
## Summary
- Bump on-disk galaxy-catalog format from v4 to v5 with two new per-record bytes (`classByte` + `parentSurveyByte`) carved from the existing tail padding; the 64-byte stride is unchanged.
- Populate the bytes for Milliquas in the parser (AGN class letter Q/A/B/K/N/S → enum 1..6; parent-survey prefix SDSS/2MASX/GAIA/WISEA/NVSS/FIRST/6dFGS → enum 1..7).
- Reconstruct the historical `"<PARENT> J<RA><Dec>"` Milliquas display name in the InfoCard purely from the bin, via a new shared `iauRaDecSuffix(ra, dec)` helper.
- Delete the Milliquas `_names.json` sidecar pipeline end-to-end (fetcher, slot, payload type, engine wiring, R2 ALLOW entry) and clean up the orphaned R2 keys on the next sync, saving ~34 MB of network transfer per session.

## Test plan
- [ ] `npm run typecheck` passes.
- [ ] `npm test` passes (vitest run, expect ≥ previous green baseline test count).
- [ ] `npm run build-tiers` regenerates every `public/data/*.bin` and emits no `_names.json` files.
- [ ] First 16 bytes of `public/data/milliquas-medium.bin` decode as magic `0x504d4b53` + version `5`.
- [ ] `npm run sync-r2` uploads new bins and deletes the three `milliquas-*_names.json` keys from R2.
- [ ] Manual smoke test on dev: hover a Milliquas point with a known parent survey (e.g. an SDSS-prefixed row) and confirm the InfoCard headline shows `"SDSS J<RA><Dec>"` rather than the IAU `"MQ J<RA><Dec>"` fallback.
- [ ] Manual smoke test on dev: hover a Milliquas row with a known class letter (Q) and confirm the InfoCard surfaces `"Quasar"` in the AGN class row.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

Expected: PR URL is printed. Save it for the report.

---

## Self-Review (against the brief)

- v4 → v5 bump with two new bytes inside the existing padding — Task 3.
- `classByte` per-source-interpreted via new helper — Task 8 + Task 10.
- `parentSurveyByte` populated by parser, consumed by InfoCard — Tasks 6, 10.
- `iauRaDecSuffix` extracted with regression test against `iauName` — Task 1.
- Delete sidecar pipeline (fetcher, slot, payload type, engine wiring, fetcher test) — Task 9.
- `agnClass` added to `GalaxyInfo` — Task 10.
- R2 ALLOW filter trimmed + orphaned-key deletion step — Task 12.
- Full rebuild + sync + PR — Task 13.
- Conventions: `type` aliases only (no `interface`); didactic comments preserved on every new module; tests live in `tests/` mirror tree; per-task commits via HEREDOC with `Co-Authored-By` trailer only; staged paths are explicit (no `git add -A`); plan is straightforwardly correct (no planted traps); no migration history or dates in module docstrings; branch + PR at the end rather than direct-push.
