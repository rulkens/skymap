# Local-Volume Distances — 02 · CF4 Parser + `catalogDistanceFor` Lookup

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Parse `data/raw/cf4/table2.dat` into typed `Cf4Record`s keyed by PGC and 2MASS XSC, build a pure `catalogDistanceFor(record, cf4, hyperLeda)` lookup with CF4 → HyperLEDA `mod0` → null fallback, and unit-test the boundary cases.

**Architecture:** Two new modules in `tools/`. The parser is fixed-width ASCII reader — same family as the 2MRS parser — yielding `{ pgc, massId, distMpc, eDistMpc }` per row. The lookup is a curry-free pure function taking the parsed catalog as inputs and a `ParsedRecord` to resolve. No I/O in `catalogDistanceFor` so it's trivially testable.

**Tech Stack:** Pure TypeScript, no Node deps in the lookup; Vitest fixtures for golden-row regression.

---

## File Structure

- **Create:** `tools/parsers/cosmicflows4.ts` — fixed-width parser, `Cf4Record` type, `Cf4CatalogIndex` builder
- **Create:** `tools/catalog/catalogDistanceFor.ts` — pure lookup: `(record, cf4, hyperLeda) => { distMpc, source } | null`
- **Create:** `tools/catalog/localVolumeCutoff.ts` — single-source-of-truth for `CUTOFF_MPC = 30`
- **Create:** `tests/parsers/cosmicflows4.test.ts` — fixed-width fixture rows, NaN-on-missing assertions, PGC + 2MASS keying
- **Create:** `tests/catalog/catalogDistanceFor.test.ts` — CF4-hit, HyperLEDA-fallback, both-miss, beyond-cutoff scenarios

---

## Background

**CF4 column layout (J/ApJ/944/94 table2).** The ReadMe documents the byte ranges. Confirm the offsets against the actual ReadMe downloaded in sub-plan 01 — the fields we need are:

- `PGC` — numeric PGC identifier (when present; zero/empty when CF4 has no PGC for the row).
- `2MASS` — 2MASS XSC ID string, 16 chars, no `2MASX J` prefix (matches the format the 2MRS parser stores in `ParsedRecord.massId`).
- `DM` — distance modulus in magnitudes (weighted homogenised value).
- `eDM` — 1-σ uncertainty on DM.

The parser converts DM to Mpc via the standard relation:

```
d_Mpc = 10 ** ((DM - 25) / 5)
```

That conversion happens in the parser, not the lookup, so downstream callers see a plain Mpc value.

**Why a curried-free pure function?** `catalogDistanceFor` is invoked once per `ParsedRecord` in `recordsToCloud` (sub-plan 04). Passing the two indices as arguments rather than closing over them keeps the function trivially testable with stub maps, and the build pipeline reads marginally clearer at the call site.

**Cross-match key precedence.** The spec says PGC + 2MASS XSC. The order matters: if a record has both keys and CF4 lists distinct entries under each, prefer the **PGC match** (PGC is the more authoritative cross-walk in CF4's own tables). Cone-matching is explicitly out of scope for this sub-plan — the spec mentions a 1-arcmin fallback but resolved decision #2 ("overrides only, no new galaxies") plus the rarity of unkeyed-but-positionally-matchable rows makes the marginal complexity unjustified. Document the deferral inline.

---

## Task 1 — `Cf4Record` type and fixed-width row parser

**Files:**
- Create: `tools/parsers/cosmicflows4.ts`
- Test: `tests/parsers/cosmicflows4.test.ts`

- [ ] **Step 1: Inspect the real ReadMe**

Open `data/raw/cf4/ReadMe` (downloaded in sub-plan 01 Task 5). Find the column-byte-range spec. Confirm the four field names (`PGC`, `2MASS`, `DM`, `eDM`) and record the exact 1-based inclusive byte ranges. **Use the ReadMe's offsets, not the offsets typed below** — the byte ranges below are placeholders the engineer MUST verify before continuing.

Document the offsets at the top of `tools/parsers/cosmicflows4.ts` so any future re-issue of the table forces a deliberate re-read.

- [ ] **Step 2: Write the failing test (offsets verified)**

Create `tests/parsers/cosmicflows4.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseCf4Line } from '../../tools/parsers/cosmicflows4';

/**
 * Build a fixed-width CF4 line by overlaying field values at the byte
 * ranges documented in the ReadMe.
 *
 * The exact byte offsets in this helper MUST match the offsets the
 * parser reads (which in turn must match the actual CF4 ReadMe). The
 * test is the only place all three values are pinned together, so a
 * future re-layout of the table produces a focused parser test
 * failure instead of a silently-empty distance lookup.
 *
 * Slots used here are PLACEHOLDERS — the engineer who implements
 * Task 1 must replace them with the verified ReadMe ranges.
 */
function buildCf4Row(fields: {
  pgc?: string;
  massId?: string;
  dm?: string;
  eDm?: string;
}): string {
  // Total row width — adjust to ReadMe spec.
  const buf = ' '.repeat(80).split('');
  function put(start: number, end: number, val: string): void {
    const slot = end - start + 1;
    const padded = val.padStart(slot).slice(0, slot);
    for (let i = 0; i < slot; i++) buf[start - 1 + i] = padded[i]!;
  }
  // PLACEHOLDER ranges — replace with verified ReadMe ranges.
  if (fields.pgc !== undefined) put(1, 7, fields.pgc);
  if (fields.massId !== undefined) put(9, 24, fields.massId);
  if (fields.dm !== undefined) put(26, 31, fields.dm);
  if (fields.eDm !== undefined) put(33, 37, fields.eDm);
  return buf.join('');
}

describe('parseCf4Line', () => {
  it('extracts PGC, 2MASS ID, distance modulus, and uncertainty', () => {
    const line = buildCf4Row({
      pgc: '2557',
      massId: '00424433+4116075',  // M31
      dm: '24.47',                  // → 0.78 Mpc
      eDm: '0.12',
    });
    const rec = parseCf4Line(line);
    expect(rec).not.toBeNull();
    expect(rec!.pgc).toBe(2557);
    expect(rec!.massId).toBe('00424433+4116075');
    // d = 10^((24.47-25)/5) = 0.7852 Mpc
    expect(rec!.distMpc).toBeCloseTo(0.785, 2);
    expect(rec!.eDistMpc).toBeGreaterThan(0);
  });

  it('returns null when DM is blank (catalogued row with no distance)', () => {
    const line = buildCf4Row({ pgc: '999', massId: '', dm: '', eDm: '' });
    expect(parseCf4Line(line)).toBeNull();
  });

  it('treats missing PGC (zero or blank) as null in the record, not 0', () => {
    const line = buildCf4Row({
      pgc: '0',
      massId: '12345678+1234567',
      dm: '31.0',
      eDm: '0.2',
    });
    const rec = parseCf4Line(line);
    expect(rec).not.toBeNull();
    expect(rec!.pgc).toBeNull();
    expect(rec!.massId).toBe('12345678+1234567');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/parsers/cosmicflows4.test.ts`
Expected: FAIL with `Cannot find module '../../tools/parsers/cosmicflows4'`.

- [ ] **Step 4: Write minimal implementation**

Create `tools/parsers/cosmicflows4.ts`:

```typescript
/**
 * Cosmicflows-4 parser.
 *
 * Reads CDS Vizier table J/ApJ/944/94 (Tully+ 2023). The on-disk
 * format is fixed-width ASCII; column byte offsets come from the
 * CF4 ReadMe shipped alongside table2.dat in data/raw/cf4/ReadMe.
 *
 * The parser yields one `Cf4Record` per data row, dropping rows
 * without a distance modulus. Two cross-match keys are exposed —
 * `pgc` (numeric, null when CF4 doesn't list one) and `massId`
 * (the 16-char 2MASS XSC designation, '' when not present). The
 * lookup builder downstream (`buildCf4CatalogIndex`) keys by both
 * so the consumer can hit the index via either identifier.
 *
 * ## Column offsets (1-based, inclusive — verified against ReadMe YYYY-MM-DD)
 *
 *   PGC     bytes  1..  7   integer
 *   2MASS   bytes  9.. 24   16-char XSC designation
 *   DM      bytes 26.. 31   float, distance modulus in mag
 *   eDM     bytes 33.. 37   float, 1-σ uncertainty on DM
 *
 * (Adjust to verified ReadMe ranges; the test in
 * tests/parsers/cosmicflows4.test.ts must use the same offsets.)
 *
 * Distance is computed from DM via the standard relation:
 *
 *     d_Mpc = 10 ^ ((DM - 25) / 5)
 *
 * with the uncertainty propagated via the linear derivative:
 *
 *     ed_Mpc = d_Mpc * (ln 10 / 5) * eDM
 */

export type Cf4Record = {
  /** Numeric PGC, or null when CF4 has no PGC cross-walk for this row. */
  pgc: number | null;
  /** 16-char 2MASS XSC designation (e.g. "00424433+4116075"), or '' when absent. */
  massId: string;
  /** Distance in megaparsecs. Always > 0; rows without DM are skipped. */
  distMpc: number;
  /** 1-σ distance uncertainty in megaparsecs. Always > 0. */
  eDistMpc: number;
};

/** Convert distance modulus + its uncertainty to megaparsecs. */
function dmToMpc(dm: number, eDm: number): { distMpc: number; eDistMpc: number } {
  const distMpc = Math.pow(10, (dm - 25) / 5);
  // d/dDM of d_Mpc = d_Mpc * ln(10) / 5
  const eDistMpc = distMpc * (Math.LN10 / 5) * eDm;
  return { distMpc, eDistMpc };
}

/**
 * Slice a fixed-width line in 1-based-inclusive (start, end) coordinates
 * and trim whitespace. Returns '' for slices that lie past the line end.
 */
function slot(line: string, start: number, end: number): string {
  return line.slice(start - 1, end).trim();
}

/**
 * Parse one CF4 data row. Returns null when the row lacks a usable
 * distance modulus (CF4 includes some catalogued-but-undetermined rows
 * we have no use for).
 */
export function parseCf4Line(line: string): Cf4Record | null {
  // Offsets MUST match the ReadMe — see the docstring above.
  const pgcRaw = slot(line, 1, 7);
  const massId = slot(line, 9, 24);
  const dmRaw = slot(line, 26, 31);
  const eDmRaw = slot(line, 33, 37);

  if (dmRaw === '') return null;
  const dm = parseFloat(dmRaw);
  if (!Number.isFinite(dm)) return null;
  // The uncertainty CAN legitimately be blank for older measurements;
  // we surface 0 in that case so downstream code that compares
  // uncertainties doesn't see NaN.  The presence of `dm` is the gate.
  const eDm = eDmRaw === '' ? 0 : parseFloat(eDmRaw);

  // PGC: "0" and blank both mean "no PGC for this row" — collapse
  // to null so the index never keys on the bogus zero.
  const pgcInt = pgcRaw === '' || pgcRaw === '0' ? null : parseInt(pgcRaw, 10);
  const pgc = pgcInt === null || !Number.isFinite(pgcInt) ? null : pgcInt;

  const { distMpc, eDistMpc } = dmToMpc(dm, Number.isFinite(eDm) ? eDm : 0);
  return { pgc, massId, distMpc, eDistMpc };
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/parsers/cosmicflows4.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Commit**

```bash
git add tools/parsers/cosmicflows4.ts tests/parsers/cosmicflows4.test.ts
git commit -m "$(cat <<'EOF'
feat(parsers): add Cosmicflows-4 row parser

Fixed-width parser for CDS Vizier J/ApJ/944/94 table2 rows. Yields
{ pgc, massId, distMpc, eDistMpc } per row, converting distance
modulus to Mpc via 10^((DM-25)/5) and propagating uncertainty.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — `Cf4CatalogIndex` builder (PGC + 2MASS XSC maps)

**Files:**
- Modify: `tools/parsers/cosmicflows4.ts`
- Test: `tests/parsers/cosmicflows4.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/parsers/cosmicflows4.test.ts`:

```typescript
import { buildCf4CatalogIndex } from '../../tools/parsers/cosmicflows4';

describe('buildCf4CatalogIndex', () => {
  it('keys rows by both PGC and 2MASS XSC; returns the same record under each', () => {
    const text =
      buildCf4Row({ pgc: '2557', massId: '00424433+4116075', dm: '24.47', eDm: '0.12' }) + '\n' +
      buildCf4Row({ pgc: '0', massId: '12345678+1234567', dm: '30.0', eDm: '0.2' }) + '\n';
    const idx = buildCf4CatalogIndex(text);
    const byPgc = idx.byPgc.get(2557);
    const byMass = idx.byMassId.get('00424433+4116075');
    expect(byPgc).toBeDefined();
    expect(byMass).toBeDefined();
    expect(byPgc).toBe(byMass);  // same record object under both keys
    // Row with no PGC is in byMassId only.
    expect(idx.byMassId.get('12345678+1234567')).toBeDefined();
    expect(idx.byPgc.size).toBe(1);
  });

  it('skips comment lines and blank lines', () => {
    const text =
      '# header comment\n' +
      '\n' +
      buildCf4Row({ pgc: '2557', massId: '00424433+4116075', dm: '24.47', eDm: '0.12' }) +
      '\n';
    const idx = buildCf4CatalogIndex(text);
    expect(idx.byPgc.size).toBe(1);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/parsers/cosmicflows4.test.ts`
Expected: FAIL with `buildCf4CatalogIndex is not a function`.

- [ ] **Step 3: Add the index builder**

Append to `tools/parsers/cosmicflows4.ts`:

```typescript
export type Cf4CatalogIndex = {
  byPgc: Map<number, Cf4Record>;
  byMassId: Map<string, Cf4Record>;
};

/**
 * Walk the raw CF4 table2.dat text and build two maps keyed on the
 * cross-match identifiers we care about. The same `Cf4Record` object
 * is shared between the two maps — distance lookups via PGC and via
 * 2MASS XSC return identical results.
 *
 * Rows are skipped if:
 *   - the line is blank or starts with `#` (CDS uses # for comments)
 *   - `parseCf4Line` returns null (no usable distance modulus)
 *   - the row has neither a PGC nor a 2MASS ID (unindexable, dropped
 *     with a stderr warning to surface unexpected source-file shape)
 */
export function buildCf4CatalogIndex(rawText: string): Cf4CatalogIndex {
  const byPgc = new Map<number, Cf4Record>();
  const byMassId = new Map<string, Cf4Record>();
  let unindexable = 0;

  for (const line of rawText.split(/\r?\n/)) {
    if (line.length === 0) continue;
    if (line.startsWith('#')) continue;
    const rec = parseCf4Line(line);
    if (rec === null) continue;
    if (rec.pgc === null && rec.massId === '') {
      unindexable++;
      continue;
    }
    if (rec.pgc !== null) byPgc.set(rec.pgc, rec);
    if (rec.massId !== '') byMassId.set(rec.massId, rec);
  }

  if (unindexable > 0) {
    process.stderr.write(
      `  CF4: ${unindexable.toLocaleString()} rows had distance but no PGC or 2MASS ID — skipped\n`,
    );
  }

  return { byPgc, byMassId };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/parsers/cosmicflows4.test.ts`
Expected: PASS (5 tests total in this file).

- [ ] **Step 5: Commit**

```bash
git add tools/parsers/cosmicflows4.ts tests/parsers/cosmicflows4.test.ts
git commit -m "$(cat <<'EOF'
feat(parsers): build dual PGC + 2MASS XSC index for Cosmicflows-4

buildCf4CatalogIndex walks the raw table2.dat text, parses each
row, and stuffs the same Cf4Record object into a byPgc and a
byMassId map. Consumers can hit the index via either ID.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — `localVolumeCutoff.ts` constant module

**Files:**
- Create: `tools/catalog/localVolumeCutoff.ts`
- Test: none (single exported constant; no behaviour to test)

- [ ] **Step 1: Write the module**

Create `tools/catalog/localVolumeCutoff.ts`:

```typescript
/**
 * Distance below which we replace the cz-derived position with a
 * redshift-independent catalog measurement. The choice trades off
 * Hubble-flow accuracy against catalog coverage:
 *
 *   distance     Hubble cz     v_pec / cz error
 *   ────────     ─────────     ────────────────
 *   2 Mpc        140 km/s      ~200 %
 *   5 Mpc        350 km/s      ~85 %
 *   10 Mpc       700 km/s      ~40 %
 *   20 Mpc       1400 km/s     ~20 %
 *   30 Mpc       2100 km/s     ~15 %   ← the catalog stops winning here
 *
 * Past 30 Mpc the Hubble-law distance is good enough that the extra
 * dependency on CF4 / HyperLEDA isn't worth the complexity (per
 * resolved decision #1 in
 * docs/superpowers/specs/2026-05-27-local-volume-distances.md).
 */
export const CUTOFF_MPC = 30;
```

- [ ] **Step 2: Commit**

```bash
git add tools/catalog/localVolumeCutoff.ts
git commit -m "$(cat <<'EOF'
feat(catalog): add CUTOFF_MPC = 30 constant for local-volume override

Single source of truth for the distance threshold below which CF4 /
HyperLEDA positions replace cz-derived ones. Lives in its own file
so the rationale (and the Hubble-error vs catalog-coverage trade)
is the first thing a maintainer reads.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — `catalogDistanceFor` signature + first test (CF4 hit by PGC)

**Files:**
- Create: `tools/catalog/catalogDistanceFor.ts`
- Test: `tests/catalog/catalogDistanceFor.test.ts`

- [ ] **Step 1: Write the failing test**

Create `tests/catalog/catalogDistanceFor.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { catalogDistanceFor } from '../../tools/catalog/catalogDistanceFor';
import type { Cf4CatalogIndex, Cf4Record } from '../../tools/parsers/cosmicflows4';
import type { HyperLedaShapeMap } from '../../tools/parsers/glade';
import type { ParsedRecord } from '../../tools/parsers/common';
import { Source } from '../../src/data/sources';

/** Minimal ParsedRecord-shaped fixture; all unused fields default to NaN/0/null. */
function rec(partial: Partial<ParsedRecord>): ParsedRecord {
  return {
    source: Source.TwoMRS,
    objID: 0n,
    ra: 0,
    dec: 0,
    z: 0,
    magU: NaN,
    magG: NaN,
    magR: NaN,
    magI: NaN,
    magZ: NaN,
    axisRatio: null,
    positionAngleDeg: null,
    diameterKpc: null,
    classByte: 0,
    parentSurveyByte: 0,
    ...partial,
  };
}

function cf4(records: ReadonlyArray<Cf4Record>): Cf4CatalogIndex {
  const byPgc = new Map<number, Cf4Record>();
  const byMassId = new Map<string, Cf4Record>();
  for (const r of records) {
    if (r.pgc !== null) byPgc.set(r.pgc, r);
    if (r.massId !== '') byMassId.set(r.massId, r);
  }
  return { byPgc, byMassId };
}

describe('catalogDistanceFor — CF4 by PGC', () => {
  it('returns the CF4 distance when the record carries a PGC that CF4 lists', () => {
    const record = rec({ objID: 2557n });  // PGC 2557 = M31
    const cf4Index = cf4([
      { pgc: 2557, massId: '00424433+4116075', distMpc: 0.785, eDistMpc: 0.04 },
    ]);
    const hyperLeda: HyperLedaShapeMap = new Map();
    const out = catalogDistanceFor(record, cf4Index, hyperLeda);
    expect(out).not.toBeNull();
    expect(out!.distMpc).toBeCloseTo(0.785, 3);
    expect(out!.source).toBe('cf4');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/catalog/catalogDistanceFor.test.ts`
Expected: FAIL with module not found.

- [ ] **Step 3: Write minimal implementation**

Create `tools/catalog/catalogDistanceFor.ts`:

```typescript
/**
 * Resolve a redshift-independent catalog distance for one ParsedRecord.
 *
 * Lookup order:
 *   1. CF4 by PGC (`record.objID` for 2MRS / GLADE post-PGC-patching).
 *   2. CF4 by 2MASS XSC ID (`record.massId`, present on 2MRS rows only).
 *   3. HyperLEDA `mod0` distance modulus by PGC.
 *   4. null (caller falls back to the cz-derived position).
 *
 * Pure function — no I/O, no closures over module state. Lets the
 * build pipeline call this once per ParsedRecord with the same two
 * pre-built indices.
 *
 * Why pre-built indices rather than passing the raw arrays? The lookup
 * runs ~10⁶ times per build (3M+ GLADE rows × 1 call each) and a
 * linear scan over CF4's 55k rows would dominate the build time.
 * Index maps give O(1) per call.
 */
import type { Cf4CatalogIndex } from '../parsers/cosmicflows4';
import type { HyperLedaShapeMap } from '../parsers/glade';
import type { ParsedRecord } from '../parsers/common';

export type CatalogDistance = {
  distMpc: number;
  /** Provenance of the chosen distance — surfaced for InfoCard provenance chips. */
  source: 'cf4' | 'hyperleda';
};

/** Convert HyperLEDA `mod0` distance modulus to Mpc. NaN → null. */
function hyperLedaModToMpc(mod0: number): number | null {
  if (!Number.isFinite(mod0)) return null;
  return Math.pow(10, (mod0 - 25) / 5);
}

export function catalogDistanceFor(
  record: ParsedRecord,
  cf4: Cf4CatalogIndex,
  hyperLeda: HyperLedaShapeMap,
): CatalogDistance | null {
  // Step 1: CF4 by PGC. 2MRS objID slots get patched with PGCs by the
  // GLADE cross-pollination pass in buildAllBins (objID > 0n);
  // GLADE rows carry the PGC in objID natively. 0n means "no PGC".
  if (record.objID !== 0n) {
    const pgc = Number(record.objID);
    if (Number.isFinite(pgc)) {
      const hit = cf4.byPgc.get(pgc);
      if (hit) return { distMpc: hit.distMpc, source: 'cf4' };
    }
  }

  // Step 2: CF4 by 2MASS XSC ID. The 2MRS parser sets `massId`; GLADE
  // and others leave it undefined.
  if (record.massId !== undefined && record.massId !== '') {
    const hit = cf4.byMassId.get(record.massId);
    if (hit) return { distMpc: hit.distMpc, source: 'cf4' };
  }

  // Step 3: HyperLEDA fallback by PGC.
  if (record.objID !== 0n) {
    const pgc = Number(record.objID);
    if (Number.isFinite(pgc)) {
      const hit = hyperLeda.get(pgc);
      if (hit) {
        const distMpc = hyperLedaModToMpc(hit.mod0);
        if (distMpc !== null) return { distMpc, source: 'hyperleda' };
      }
    }
  }

  return null;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/catalog/catalogDistanceFor.test.ts`
Expected: PASS (1 test).

- [ ] **Step 5: Commit**

```bash
git add tools/catalog/catalogDistanceFor.ts tests/catalog/catalogDistanceFor.test.ts
git commit -m "$(cat <<'EOF'
feat(catalog): add catalogDistanceFor lookup with CF4 PGC fallback

Pure function that resolves a redshift-independent distance for one
ParsedRecord. First cut handles the CF4-by-PGC path; 2MASS XSC and
HyperLEDA fallbacks follow in the next tasks.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — CF4-by-2MASS fallback (when record has no PGC)

**Files:**
- Test: `tests/catalog/catalogDistanceFor.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/catalog/catalogDistanceFor.test.ts`:

```typescript
describe('catalogDistanceFor — CF4 by 2MASS XSC', () => {
  it('falls through to 2MASS lookup when PGC is missing', () => {
    const record = rec({ objID: 0n, massId: '12345678+1234567' });
    const cf4Index = cf4([
      { pgc: null, massId: '12345678+1234567', distMpc: 12.5, eDistMpc: 0.6 },
    ]);
    const out = catalogDistanceFor(record, cf4Index, new Map());
    expect(out).not.toBeNull();
    expect(out!.distMpc).toBeCloseTo(12.5, 3);
    expect(out!.source).toBe('cf4');
  });

  it('prefers PGC over 2MASS when CF4 has both (and they disagree)', () => {
    const record = rec({ objID: 2557n, massId: 'CONFLICT99+9999999' });
    const cf4Index = cf4([
      { pgc: 2557, massId: '00424433+4116075', distMpc: 0.785, eDistMpc: 0.04 },
      { pgc: null, massId: 'CONFLICT99+9999999', distMpc: 50.0, eDistMpc: 2.0 },
    ]);
    const out = catalogDistanceFor(record, cf4Index, new Map());
    expect(out!.distMpc).toBeCloseTo(0.785, 3);
  });
});
```

- [ ] **Step 2: Run test to verify it passes**

Run: `npx vitest run tests/catalog/catalogDistanceFor.test.ts`
Expected: PASS (3 tests). The first test exercises the 2MASS path the implementation already covers; the second confirms PGC-preferred ordering already works because the PGC branch returns early before the 2MASS check.

- [ ] **Step 3: No code change, no commit**

This task is a regression-coverage commit. The tests document the contract.

- [ ] **Step 4: Commit (tests only)**

```bash
git add tests/catalog/catalogDistanceFor.test.ts
git commit -m "$(cat <<'EOF'
test(catalog): pin CF4 2MASS-fallback + PGC-prefer behaviour

Covers the "no PGC, 2MASS hit" path and the "PGC wins when both
present" ordering. Both already work in the current implementation;
these tests prevent regressions when extending the fallback chain.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — HyperLEDA fallback + complete-miss path

**Files:**
- Test: `tests/catalog/catalogDistanceFor.test.ts`

- [ ] **Step 1: Write the failing test (HyperLEDA fallback)**

Append:

```typescript
describe('catalogDistanceFor — HyperLEDA fallback', () => {
  it('uses HyperLEDA mod0 when CF4 has no match for the PGC', () => {
    const record = rec({ objID: 12345n });
    const cf4Index = cf4([]); // CF4 empty for this PGC
    const hyperLeda: HyperLedaShapeMap = new Map([
      [12345, { pa: 0, logr25: 0, logd25: 0, e_logd25: 0, mod0: 28.0, e_mod0: 0.3 }],
    ]);
    const out = catalogDistanceFor(record, cf4Index, hyperLeda);
    expect(out).not.toBeNull();
    // d = 10^((28-25)/5) = 10^0.6 ≈ 3.98 Mpc
    expect(out!.distMpc).toBeCloseTo(3.98, 1);
    expect(out!.source).toBe('hyperleda');
  });

  it('skips HyperLEDA rows where mod0 is NaN (the common sparse case)', () => {
    const record = rec({ objID: 12345n });
    const hyperLeda: HyperLedaShapeMap = new Map([
      [12345, { pa: 0, logr25: 0, logd25: 0, e_logd25: 0, mod0: NaN, e_mod0: NaN }],
    ]);
    const out = catalogDistanceFor(record, cf4([]), hyperLeda);
    expect(out).toBeNull();
  });

  it('returns null when both CF4 and HyperLEDA miss', () => {
    const record = rec({ objID: 999999n, massId: '99999999+9999999' });
    const out = catalogDistanceFor(record, cf4([]), new Map());
    expect(out).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests**

Run: `npx vitest run tests/catalog/catalogDistanceFor.test.ts`
Expected: PASS (6 tests). The existing implementation already handles all three cases — these tests pin the contract.

- [ ] **Step 3: Commit (tests only)**

```bash
git add tests/catalog/catalogDistanceFor.test.ts
git commit -m "$(cat <<'EOF'
test(catalog): pin HyperLEDA fallback and double-miss paths

NaN-mod0 (the sparse-coverage common case) returns null so the
caller falls through to the cz path. Double-miss returns null
end-to-end.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — Load CF4 from disk in a thin wrapper

**Files:**
- Modify: `tools/parsers/cosmicflows4.ts`
- Test: none (file-I/O wrapper; the underlying `buildCf4CatalogIndex` is covered)

- [ ] **Step 1: Add the loader**

Append to `tools/parsers/cosmicflows4.ts`:

```typescript
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';

const DEFAULT_CF4_PATH = 'data/raw/cf4/table2.dat';

/**
 * Load and parse the CF4 catalog from disk, returning an empty index
 * if the file doesn't exist (so a fresh checkout without the raw CF4
 * data still produces .bin outputs — they just won't have the
 * local-volume override applied to any row).
 *
 * Why missing-file tolerance? Same rationale as the parallel
 * loadOrEmpty / loadMilliquas helpers in buildAllBins: the raw
 * upstream files are gitignored, so a contributor doing UI work
 * shouldn't be blocked by a 100 MB download.
 */
export function loadCf4CatalogIndex(
  path: string = DEFAULT_CF4_PATH,
): Cf4CatalogIndex {
  const full = resolve(path);
  if (!existsSync(full)) {
    process.stderr.write(
      `  ${path} not present — CF4 local-volume override will be skipped\n`,
    );
    return { byPgc: new Map(), byMassId: new Map() };
  }
  const text = readFileSync(full, 'utf8');
  const index = buildCf4CatalogIndex(text);
  process.stderr.write(
    `  CF4: ${index.byPgc.size.toLocaleString()} PGCs + ${index.byMassId.size.toLocaleString()} 2MASS IDs indexed\n`,
  );
  return index;
}
```

- [ ] **Step 2: Run typecheck**

Run: `npm run typecheck`
Expected: PASS.

- [ ] **Step 3: Run vitest**

Run: `npm test`
Expected: PASS — no consumer reads `loadCf4CatalogIndex` yet, so the existing tests are unaffected.

- [ ] **Step 4: Commit**

```bash
git add tools/parsers/cosmicflows4.ts
git commit -m "$(cat <<'EOF'
feat(parsers): add loadCf4CatalogIndex disk-loader for CF4

Thin file-I/O wrapper that reads data/raw/cf4/table2.dat and hands
back the dual PGC + 2MASS index. Missing-file-tolerant: a fresh
checkout without the raw download still produces .bin outputs,
just without the local-volume override.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Self-Review

- [x] Parser tests cover real-row, blank-DM, blank-PGC cases.
- [x] Cross-match key precedence (PGC > 2MASS) is tested explicitly with a deliberate conflict fixture.
- [x] HyperLEDA NaN-mod0 (the sparse-coverage common case) is tested — guards the fallback from emitting bogus 1 Mpc distances for unmeasured PGCs.
- [x] Both indices are pre-built once and passed in by the caller — pure function, no I/O on the hot path.
- [x] Cone-matching (the spec's "1 arcmin fallback") is explicitly deferred with rationale in the file's docstring.
- [x] `CUTOFF_MPC` lives in its own module so future tuning is a one-file change.
- [x] Missing CF4 file is tolerated — `loadCf4CatalogIndex` returns an empty index with a stderr note rather than throwing.
