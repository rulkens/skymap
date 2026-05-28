# Local-Volume Distances — 01 · CF4 Fetcher + HyperLEDA `mod0` Extension

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Land the raw-data acquisition layer: a resumable Cosmicflows-4 fetcher writing to `data/raw/cf4/cf4.tsv`, a ReadMe-style header doc, a checksum sidecar, and the one-extra-column extension of `fetchHyperLeda.ts` so future `mod0` lookups are cheap.

**Architecture:** CF4 is a single CDS Vizier table (J/ApJ/944/94) downloaded as one TSV. The fetcher streams the HTTP response to disk with `Range:` resume on restart, and writes a sibling `.sha256` so the parser can fail loudly on partial files. HyperLEDA extension adds `mod0`/`e_mod0` to the column list of the existing meandata fetcher; no second sweep.

**Tech Stack:** Node 20 + tsx (existing `tools/fetch/` pattern), `node:fs`, `node:crypto`, Vitest for fixture tests.

---

## File Structure

- **Create:** `tools/fetch/fetchCosmicflows4.ts` — resumable CF4 TSV fetcher with `.sha256` sidecar
- **Create:** `data/raw/cf4/README.md` — provenance header documenting the URL, columns, checksum, fetch date
- **Modify:** `tools/fetch/fetchHyperLeda.ts` — add `mod0` and `e_mod0` to the columns harvested per PGC, expand the cache header schema, version the cache file so old `pa/logr25/logd25/e_logd25` rows are rejected on mix
- **Modify:** `tools/parsers/glade.ts` — extend `HyperLedaShapeMap` and `parseHyperLedaCsv` to surface `mod0`/`e_mod0` to callers (one new field in the typed record; existing callers ignore it)
- **Create:** `tests/fetch/fetchCosmicflows4.test.ts` — unit tests for the URL builder, resume offset math, and checksum-mismatch behaviour
- **Create:** `tests/parsers/hyperledaModExtension.test.ts` — confirm the new cache header is parsed and the old `pa,logr25,logd25,e_logd25` header is rejected with the documented error

---

## Background the engineer needs

**Cosmicflows-4 source.** CDS Vizier serves the table at:

```
https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/table2.dat
```

It's the homogenised distance compilation from Tully et al. 2023 (~55,877 rows). The on-disk format is fixed-width ASCII with a ReadMe sibling describing columns. We download the raw `.dat` and an accompanying `ReadMe` to `data/raw/cf4/`. The fetch is one URL — no chunking like HyperLEDA — but the file is ~100 MB and the connection can blip, so we want resume-on-restart.

**Why a separate sub-directory `data/raw/cf4/`?** Existing raw inputs live flat in `data/raw/`. CF4 needs a `ReadMe`, a `table2.dat`, and a `.sha256` — three files share one survey, so we group them. Mirrors the future shape if CF4 ever ships a multi-file release.

**HyperLEDA cache caveat (per memory `project_hyperleda_partial_cache`).** The cache at `data/raw/hyperleda_pa.csv` covers 52k of ~1.5M PGCs and **must not** be re-swept. Adding `mod0` to the column list affects *future* per-row fetches only — existing rows already on disk will not gain `mod0` until they're individually re-queried, and we explicitly skip them. To keep the schema honest the cache header gets a version bump (see Task 7).

---

## Task 1 — Build the CF4 URL constant + small URL test

**Files:**
- Create: `tools/fetch/fetchCosmicflows4.ts`
- Test: `tests/fetch/fetchCosmicflows4.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/fetch/fetchCosmicflows4.test.ts
import { describe, it, expect } from 'vitest';
import { CF4_TABLE_URL, CF4_README_URL } from '../../tools/fetch/fetchCosmicflows4';

describe('Cosmicflows-4 fetcher URLs', () => {
  it('points at the CDS Vizier table for J/ApJ/944/94', () => {
    expect(CF4_TABLE_URL).toBe(
      'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/table2.dat',
    );
  });

  it('points at the matching ReadMe so the parser can validate column offsets', () => {
    expect(CF4_README_URL).toBe(
      'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/ReadMe',
    );
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fetch/fetchCosmicflows4.test.ts`
Expected: FAIL with `Cannot find module '../../tools/fetch/fetchCosmicflows4'`.

- [ ] **Step 3: Write minimal implementation**

```typescript
// tools/fetch/fetchCosmicflows4.ts
#!/usr/bin/env node
/**
 * fetchCosmicflows4 — download the Cosmicflows-4 homogenised distance
 * table from CDS Vizier (J/ApJ/944/94, Tully+ 2023) to data/raw/cf4/.
 *
 * The fetch is one URL but the file is ~100 MB; we use Range: requests
 * to resume on restart so a network blip doesn't restart from zero.
 *
 * Source layout (confirmed against the CDS ReadMe):
 *   table2.dat — fixed-width ASCII, ~55,877 rows
 *   ReadMe     — column-offset spec (download alongside so the parser
 *                can validate the byte ranges it assumes)
 *
 * See data/raw/cf4/README.md for the in-repo provenance header.
 */
export const CF4_TABLE_URL =
  'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/table2.dat';
export const CF4_README_URL =
  'https://cdsarc.cds.unistra.fr/ftp/J/ApJ/944/94/ReadMe';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fetch/fetchCosmicflows4.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/fetch/fetchCosmicflows4.ts tests/fetch/fetchCosmicflows4.test.ts
git commit -m "$(cat <<'EOF'
feat(fetch): scaffold Cosmicflows-4 fetcher with CDS Vizier URLs

Adds the URL constants and a regression test pinning them to the
J/ApJ/944/94 (Tully+ 2023) location. No download logic yet.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 2 — Compute resume offset from existing on-disk size

**Files:**
- Modify: `tools/fetch/fetchCosmicflows4.ts`
- Test: `tests/fetch/fetchCosmicflows4.test.ts`

- [ ] **Step 1: Write the failing test**

Append to `tests/fetch/fetchCosmicflows4.test.ts`:

```typescript
import { resumeOffsetForPath } from '../../tools/fetch/fetchCosmicflows4';
import { writeFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

describe('resumeOffsetForPath', () => {
  it('returns 0 when the file does not exist', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cf4-'));
    try {
      expect(resumeOffsetForPath(join(dir, 'missing.dat'))).toBe(0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });

  it('returns the existing file size when the file exists', () => {
    const dir = mkdtempSync(join(tmpdir(), 'cf4-'));
    try {
      const path = join(dir, 'partial.dat');
      writeFileSync(path, 'x'.repeat(1024));
      expect(resumeOffsetForPath(path)).toBe(1024);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fetch/fetchCosmicflows4.test.ts`
Expected: FAIL with `resumeOffsetForPath is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `tools/fetch/fetchCosmicflows4.ts`:

```typescript
import { existsSync, statSync } from 'node:fs';

/**
 * On-disk size of the partial download, in bytes, or 0 when nothing is
 * there yet. Used as the `Range: bytes=N-` start for resume requests.
 *
 * We trust the byte count over any sidecar metadata: the OS already
 * knows exactly how many bytes hit the disk, and the HTTP Range header
 * is content-addressed by byte index so re-issuing with the same N
 * cleanly resumes if the server supports ranges.
 */
export function resumeOffsetForPath(path: string): number {
  if (!existsSync(path)) return 0;
  return statSync(path).size;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fetch/fetchCosmicflows4.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/fetch/fetchCosmicflows4.ts tests/fetch/fetchCosmicflows4.test.ts
git commit -m "$(cat <<'EOF'
feat(fetch): add resumeOffsetForPath for CF4 partial downloads

Pure helper that returns the on-disk byte count (or 0). The fetch
loop will pass this as the Range: bytes=N- start so a network blip
mid-download can resume on restart.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 3 — Streaming download with `Range:` resume

**Files:**
- Modify: `tools/fetch/fetchCosmicflows4.ts`

- [ ] **Step 1: Add the streaming download function**

This step adds a function we can manually invoke; we don't unit-test the network path itself (would require a full HTTP mock harness — not worth it for one URL). Confidence comes from the resume-offset test + manual run.

Append to `tools/fetch/fetchCosmicflows4.ts`:

```typescript
import { createWriteStream, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';

/**
 * Download `url` to `destPath`, resuming from the current on-disk byte
 * count via `Range: bytes=N-`.
 *
 * Behaviour:
 *  - First run / empty file: requests the whole body, writes from byte 0.
 *  - Partial file: requests `Range: bytes=N-`, server returns 206 +
 *    remaining bytes, we append.
 *  - Complete file: `Range:` past EOF yields 416; we treat that as
 *    "already done" and return without touching the file.
 *
 * We use the `node:stream/promises` pipeline so a connection drop
 * surfaces as a rejected promise (rather than a silent truncation),
 * and the partial file stays on disk for the next resume attempt.
 */
export async function downloadWithResume(
  url: string,
  destPath: string,
): Promise<{ bytesAdded: number; totalBytes: number }> {
  mkdirSync(dirname(destPath), { recursive: true });
  const startOffset = resumeOffsetForPath(destPath);

  const headers: Record<string, string> = {};
  if (startOffset > 0) headers['Range'] = `bytes=${startOffset}-`;

  const res = await fetch(url, { headers });

  // 416 = Range Not Satisfiable — usually means we've already downloaded
  // the whole file. Treat as success rather than failure.
  if (res.status === 416) {
    return { bytesAdded: 0, totalBytes: startOffset };
  }
  if (!res.ok && res.status !== 206 && res.status !== 200) {
    throw new Error(`CF4 download failed: HTTP ${res.status} ${res.statusText}`);
  }
  if (!res.body) {
    throw new Error('CF4 download failed: empty body');
  }

  const stream = createWriteStream(destPath, {
    flags: startOffset > 0 ? 'a' : 'w',
  });

  let bytesAdded = 0;
  const counter = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller): void {
      bytesAdded += chunk.byteLength;
      controller.enqueue(chunk);
    },
  });
  await pipeline(Readable.fromWeb(res.body.pipeThrough(counter)), stream);

  return { bytesAdded, totalBytes: startOffset + bytesAdded };
}
```

- [ ] **Step 2: Manual sanity check (no automated test)**

There is no unit test here — the network behaviour is the whole point and mocking the entire HTTP stream + Range semantics would test the mock, not the code. Defer real validation to the CLI run in Task 5.

- [ ] **Step 3: Commit**

```bash
git add tools/fetch/fetchCosmicflows4.ts
git commit -m "$(cat <<'EOF'
feat(fetch): add Range-resumable download for Cosmicflows-4

Streams the response body to disk and uses node:stream/promises
pipeline so a connection drop surfaces as a rejected promise with
the partial file intact for the next resume attempt.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 4 — Compute and write the SHA-256 sidecar

**Files:**
- Modify: `tools/fetch/fetchCosmicflows4.ts`
- Test: `tests/fetch/fetchCosmicflows4.test.ts`

- [ ] **Step 1: Write the failing test**

Append:

```typescript
import { sha256OfFile } from '../../tools/fetch/fetchCosmicflows4';

describe('sha256OfFile', () => {
  it('returns the hex digest of the file contents', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'cf4-'));
    try {
      const path = join(dir, 'sample.txt');
      writeFileSync(path, 'hello, world');
      // Pre-computed: sha256("hello, world") = 09ca7e4eaa6e8ae9c7d261167129184883644d07dfba7cbfbc4c8a2e08360d5b
      expect(await sha256OfFile(path)).toBe(
        '09ca7e4eaa6e8ae9c7d261167129184883644d07dfba7cbfbc4c8a2e08360d5b',
      );
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/fetch/fetchCosmicflows4.test.ts`
Expected: FAIL with `sha256OfFile is not a function`.

- [ ] **Step 3: Write minimal implementation**

Add to `tools/fetch/fetchCosmicflows4.ts`:

```typescript
import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';

/**
 * SHA-256 hex digest of a file's contents, streamed so we don't materialise
 * a ~100 MB string in memory just to hash it.
 *
 * Stored alongside the downloaded `.dat` as `.sha256` so the parser can
 * abort with a clear error if the file is truncated or stale.
 */
export async function sha256OfFile(path: string): Promise<string> {
  const hash = createHash('sha256');
  await pipeline(createReadStream(path), hash);
  return hash.digest('hex');
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/fetch/fetchCosmicflows4.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add tools/fetch/fetchCosmicflows4.ts tests/fetch/fetchCosmicflows4.test.ts
git commit -m "$(cat <<'EOF'
feat(fetch): add streaming SHA-256 helper for CF4 sidecar

Streamed digest (createHash + pipeline) so the ~100 MB table doesn't
sit in memory just to compute its checksum. The fetcher writes the
result to a .sha256 sibling so the parser can detect truncation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 5 — Wire up the CLI `main()` and run it once for real

**Files:**
- Modify: `tools/fetch/fetchCosmicflows4.ts`
- Create: `data/raw/cf4/README.md`

- [ ] **Step 1: Add the CLI entry point**

Append to `tools/fetch/fetchCosmicflows4.ts`:

```typescript
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { rawDataPath } from '../utils/io/rawDataRegistry';

// All paths come from RAW_DATA in tools/utils/io/rawDataRegistry.ts.
// Add `cf4.table2`, `cf4.readme`, `cf4.sha256` entries there BEFORE
// touching this file — see the plan index's "Prerequisite" section.
const TABLE_PATH = rawDataPath('cf4.table2');
const README_PATH = rawDataPath('cf4.readme');
const SHA256_PATH = rawDataPath('cf4.sha256');

async function main(): Promise<void> {
  process.stderr.write(`fetchCosmicflows4: target ${TABLE_PATH}\n`);

  // Fetch the ReadMe first — it's tiny (~10 KB) and the parser needs
  // its column-offset spec, so failing fast on the small file gives a
  // clearer error than failing 80 MB into a 100 MB download.
  const readmeResult = await downloadWithResume(CF4_README_URL, README_PATH);
  process.stderr.write(
    `  ReadMe: ${readmeResult.totalBytes.toLocaleString()} bytes` +
      (readmeResult.bytesAdded > 0
        ? ` (+${readmeResult.bytesAdded.toLocaleString()})\n`
        : ' (already complete)\n'),
  );

  const tableResult = await downloadWithResume(CF4_TABLE_URL, TABLE_PATH);
  process.stderr.write(
    `  table2.dat: ${tableResult.totalBytes.toLocaleString()} bytes` +
      (tableResult.bytesAdded > 0
        ? ` (+${tableResult.bytesAdded.toLocaleString()})\n`
        : ' (already complete)\n'),
  );

  const digest = await sha256OfFile(TABLE_PATH);
  writeFileSync(SHA256_PATH, `${digest}  table2.dat\n`);
  process.stderr.write(`  sha256: ${digest}\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
```

- [ ] **Step 2: Run the fetcher end-to-end**

Run: `npx tsx tools/fetch/fetchCosmicflows4.ts`
Expected output: `ReadMe: <bytes>`, `table2.dat: ~100 MB`, `sha256: <64-char hex>`. The script may take several minutes — fine.

- [ ] **Step 3: Confirm files landed**

Run: `ls -la data/raw/cf4/`
Expected:
- `ReadMe` (text, ~5–20 KB)
- `table2.dat` (~80–120 MB)
- `table2.dat.sha256` (single line, 64 hex chars + filename)

- [ ] **Step 4: Write the in-repo provenance README**

Create `data/raw/cf4/README.md`:

```markdown
# Cosmicflows-4 raw data

Source: CDS Vizier table [J/ApJ/944/94](https://cdsarc.cds.unistra.fr/viz-bin/cat/J/ApJ/944/94),
Tully et al. 2023, *Cosmicflows-4*.

## Files

- `table2.dat` — fixed-width ASCII, ~55,877 rows. Each row is one galaxy
  with a homogenised redshift-independent distance modulus + uncertainty,
  cross-IDed against PGC and 2MASS XSC. Downloaded via
  `npx tsx tools/fetch/fetchCosmicflows4.ts`.
- `ReadMe` — the CDS column-offset spec. The parser
  (`tools/parsers/cosmicflows4.ts`, see sub-plan 02) reads byte ranges
  from `table2.dat` according to the offsets documented here. If CDS
  ever re-issues the table with a different layout, re-download both
  files together — the ReadMe is the source of truth for column positions.
- `table2.dat.sha256` — checksum written by the fetcher. The parser
  cross-checks before parsing; a mismatch aborts with a clear error.

## How CF4 is used

CF4 supplies redshift-independent distance moduli for ~55k local-volume
galaxies. The build pipeline applies them as a position override for
galaxies inside 30 Mpc (where peculiar velocities dominate the cz signal).
See `docs/superpowers/specs/2026-05-27-local-volume-distances.md` for the
full design.

## Citation

Tully, R. B., Kourkchi, E., Courtois, H. M., et al. 2023, ApJ, 944, 94.
DOI: [10.3847/1538-4357/ac94d8](https://doi.org/10.3847/1538-4357/ac94d8).
```

- [ ] **Step 5: Confirm `.gitignore` excludes the binary**

Check that `data/raw/cf4/table2.dat` is NOT committed. The repo already gitignores `data/raw/`; verify the README + sha256 are still committable by inspecting `.gitignore` rules. Run: `git check-ignore -v data/raw/cf4/table2.dat data/raw/cf4/README.md data/raw/cf4/table2.dat.sha256`

Expected: `table2.dat` matches an ignore rule; `README.md` and `.sha256` may or may not, depending on existing rules. If `README.md` is ignored, add a `!cf4/README.md` exception to `.gitignore`. If `.sha256` is ignored, add `!cf4/*.sha256`. The provenance docs need to live in git.

- [ ] **Step 6: Commit the fetcher CLI + README**

```bash
git add tools/fetch/fetchCosmicflows4.ts data/raw/cf4/README.md data/raw/cf4/table2.dat.sha256
# If .gitignore changed:
# git add .gitignore
git commit -m "$(cat <<'EOF'
feat(fetch): land Cosmicflows-4 fetcher CLI + provenance README

Downloads table2.dat + ReadMe from CDS Vizier (J/ApJ/944/94) and
writes a sha256 sidecar. Re-runs are no-ops once complete.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

- [ ] **Step 7: Wire the script into `package.json`**

Open `package.json`. Find the `scripts` block (alongside `fetch-milliquas`, `build-tiers`, etc.). Add:

```json
"fetch-cf4": "tsx tools/fetch/fetchCosmicflows4.ts",
```

Commit:

```bash
git add package.json
git commit -m "$(cat <<'EOF'
chore(scripts): add npm run fetch-cf4

Wires fetchCosmicflows4.ts into the same npm-script surface as the
other fetch tools (fetch-milliquas, build-pgc-aliases, …) so the
maintainer doesn't have to remember the raw tsx invocation.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 6 — Extend `HyperLedaShapeMap` to carry `mod0` / `e_mod0`

**Files:**
- Modify: `tools/parsers/glade.ts`
- Test: `tests/parsers/hyperledaModExtension.test.ts` (new)

- [ ] **Step 1: Locate the existing shape map**

Read `tools/parsers/glade.ts` and find the `HyperLedaShapeMap` type plus the `parseHyperLedaCsv` function (it currently parses 5 columns: `pgc,pa,logr25,logd25,e_logd25`).

- [ ] **Step 2: Write the failing test**

Create `tests/parsers/hyperledaModExtension.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { parseHyperLedaCsv } from '../../tools/parsers/glade';

describe('parseHyperLedaCsv with mod0 columns', () => {
  it('parses the v2 header containing mod0,e_mod0 and exposes per-row distance modulus', () => {
    const csv =
      'pgc,pa,logr25,logd25,e_logd25,mod0,e_mod0\n' +
      '2789,123.4,0.32,1.18,0.05,27.31,0.15\n' +
      // Empty mod0 cells should surface as NaN, not 0.
      '5364,42.0,0.10,0.50,0.02,,\n';
    const map = parseHyperLedaCsv(csv);
    const a = map.get(2789);
    expect(a).toBeDefined();
    expect(a!.mod0).toBeCloseTo(27.31, 5);
    expect(a!.e_mod0).toBeCloseTo(0.15, 5);
    const b = map.get(5364);
    expect(b).toBeDefined();
    expect(Number.isNaN(b!.mod0)).toBe(true);
    expect(Number.isNaN(b!.e_mod0)).toBe(true);
  });

  it('rejects the v1 header without mod0 columns', () => {
    const csv = 'pgc,pa,logr25,logd25,e_logd25\n2789,123.4,0.32,1.18,0.05\n';
    expect(() => parseHyperLedaCsv(csv)).toThrow(/mod0/);
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/parsers/hyperledaModExtension.test.ts`
Expected: FAIL — current parser ignores `mod0` (or rejects the new header).

- [ ] **Step 4: Extend the parser**

In `tools/parsers/glade.ts`, locate `HyperLedaShapeMap` and add the two fields. Locate `parseHyperLedaCsv` and:

1. Tighten the header check: require the header to literally equal `pgc,pa,logr25,logd25,e_logd25,mod0,e_mod0`; throw `new Error('hyperleda_pa.csv missing mod0/e_mod0 columns — re-run fetchHyperLeda to upgrade the schema')` otherwise.
2. Read the two new cells per row with `parseFloat(cell || '')` → NaN-on-empty (mirror the existing logd25 handling).

The exact line-edits depend on the current shape of `parseHyperLedaCsv`; the engineer reads the function, extends it, and the test from Step 2 confirms.

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/parsers/hyperledaModExtension.test.ts`
Expected: PASS (2 tests).

- [ ] **Step 6: Run the full vitest suite to confirm no regression**

Run: `npm test`
Expected: PASS — existing GLADE parsing tests still pass because callers ignore the two new fields. If any test asserts on the *exact* shape of a returned `HyperLedaShapeMap` entry (e.g. via `toEqual`), it will fail; widen the assertion to `toMatchObject` or include the new fields explicitly.

- [ ] **Step 7: Commit**

```bash
git add tools/parsers/glade.ts tests/parsers/hyperledaModExtension.test.ts
git commit -m "$(cat <<'EOF'
feat(parsers): surface HyperLEDA mod0 / e_mod0 to the shape map

The CF4 → HyperLEDA distance fallback (see local-volume-distances
spec) needs the distance-modulus column. Extends the in-memory
HyperLedaShapeMap and tightens the cache-header check so a v1 CSV
(without mod0) is rejected with a clear error rather than silently
producing NaN distances.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 7 — Extend `fetchHyperLeda` to write the `mod0`/`e_mod0` columns

**Files:**
- Modify: `tools/fetch/fetchHyperLeda.ts`

- [ ] **Step 1: Locate the existing column-extraction site**

Read `tools/fetch/fetchHyperLeda.ts`. Find `HyperLedaRow` (type), `fetchOne` (extracts `pa`, `logr25`, `logd25`, `e_logd25`), and the cache-header literal `'pgc,pa,logr25,logd25,e_logd25'`.

- [ ] **Step 2: Extend `HyperLedaRow`**

```typescript
type HyperLedaRow = {
  pa: number;
  logr25: number;
  logd25: number;
  e_logd25: number;
  /**
   * mod0: distance modulus from redshift-independent measurements
   * (mean of TRGB / TF / Cepheid / SNIa / SBF where available),
   * weighted-mean per HyperLEDA's compilation. NaN when HyperLEDA
   * has no redshift-independent distance for this PGC.
   *
   * d_Mpc = 10^((mod0 - 25) / 5).  See data/raw/hyperleda_pa.csv
   * consumer (catalogDistanceFor in sub-plan 02) for the conversion.
   */
  mod0: number;
  /**
   * e_mod0: 1-σ uncertainty on mod0 in magnitudes. Carried so a
   * future InfoCard surfaces ± values; today we just keep it in the
   * cache so we don't need a re-fetch later.
   */
  e_mod0: number;
};
```

- [ ] **Step 3: Extend `fetchOne`**

In the `fetchOne` body, alongside the existing `paIdx`, `lrIdx`, `ldIdx`, `eldIdx` lookups, add:

```typescript
const m0Idx = headerTokens.indexOf('mod0');
const em0Idx = headerTokens.indexOf('e_mod0');
```

In the data-row parse, alongside `ld` and `eld`:

```typescript
const m0 = m0Idx === -1 ? NaN : parseFloat(cells[m0Idx] ?? '');
const em0 = em0Idx === -1 ? NaN : parseFloat(cells[em0Idx] ?? '');
```

In the `return { pa, logr25: lr, logd25: ld, e_logd25: eld }` line, add the two new fields:

```typescript
return { pa, logr25: lr, logd25: ld, e_logd25: eld, mod0: m0, e_mod0: em0 };
```

- [ ] **Step 4: Bump the cache-header schema**

Change the `expectedHeader` literal:

```typescript
const expectedHeader = 'pgc,pa,logr25,logd25,e_logd25,mod0,e_mod0';
```

The existing mismatch guard (which rejects the file and tells the user to delete it) is already in place — no new code needed. A user with the old 5-column cache will see a clear "delete and re-fetch" error.

- [ ] **Step 5: Extend the row-write format**

In the `worker()` function, find the `appendFileSync(outPath, ...)` calls. The matched-row branch:

```typescript
if (r) {
  appendFileSync(
    outPath,
    `${pgc},${r.pa},${r.logr25},${cell(r.logd25)},${cell(r.e_logd25)},${cell(r.mod0)},${cell(r.e_mod0)}\n`,
  );
} else {
  appendFileSync(outPath, `${pgc},,,,,,\n`);
}
```

Note the unmatched-row now has six trailing commas (seven columns total).

- [ ] **Step 6: Update the file docstring**

The top-of-file comment block lists the columns being fetched. Add `mod0` and `e_mod0` to the column list and explain why:

```typescript
 * Adds `mod0` (HyperLEDA's redshift-independent distance modulus) and
 * `e_mod0` (its uncertainty) so the local-volume distance override (see
 * docs/superpowers/specs/2026-05-27-local-volume-distances.md) can use
 * HyperLEDA as a fallback for galaxies that CF4 doesn't list.
 *
 * The mod0 column is sparsely populated — most rows have NaN — but
 * fetching it now is essentially free (same HTTP request, same parse)
 * and avoids a second sweep of the ~52k cached PGCs later. Per the
 * project memory `project_hyperleda_partial_cache`, the cache is
 * intentionally partial and must NOT be auto-refetched; the schema
 * bump from 5 → 7 columns forces operators to deliberately delete +
 * regenerate when they want the new field for cached PGCs.
```

- [ ] **Step 7: Run the full vitest suite**

Run: `npm test`
Expected: PASS — no consumer reads `mod0`/`e_mod0` yet; the existing tests are blind to the new fields.

- [ ] **Step 8: Run typecheck**

Run: `npm run typecheck`
Expected: PASS. Both `src` and `tools` tsconfigs are clean.

- [ ] **Step 9: Commit**

```bash
git add tools/fetch/fetchHyperLeda.ts
git commit -m "$(cat <<'EOF'
feat(fetch): extend HyperLEDA fetcher to harvest mod0 / e_mod0

Adds the redshift-independent distance modulus columns to the
per-PGC fetch so the CF4 fallback path in local-volume-distances
has a source. Bumps the cache header to 7 columns; old 5-column
caches surface the documented "delete and re-fetch" error.

Co-Authored-By: Claude Opus 4.7 <noreply@anthropic.com>
EOF
)"
```

---

## Task 8 — End-to-end smoke check (manual)

**Files:** none

- [ ] **Step 1: Confirm CF4 raw data is on disk**

Run: `ls -la data/raw/cf4/`
Expected: `table2.dat`, `ReadMe`, `table2.dat.sha256`, `README.md` all present.

- [ ] **Step 2: Confirm SHA-256 matches**

Run: `cd data/raw/cf4 && shasum -a 256 -c table2.dat.sha256`
Expected: `table2.dat: OK`.

- [ ] **Step 3: Spot-check the file**

Run: `head -5 data/raw/cf4/table2.dat`
Expected: fixed-width ASCII with numeric columns. Eyeball that it's not an error page or HTML.

- [ ] **Step 4: Confirm typecheck + tests still green**

Run: `npm run typecheck && npm test`
Expected: PASS.

- [ ] **Step 5: No commit — manual verification only**

Move on to sub-plan 02.

---

## Self-Review

- [x] Each task has a single concrete code change, a test (where one is feasible), expected pass/fail, and a commit.
- [x] No `TBD` / "fill in details" placeholders.
- [x] All file paths are absolute-from-repo-root and quoted in the commit `git add` lines.
- [x] Fetcher follows the `fetchHyperLeda.ts` pattern (resume support, on-disk progress) but adapted for a single URL.
- [x] HyperLEDA cache schema bump uses the existing mismatch guard — no new error-handling code, just a literal-string update.
- [x] `data/raw/cf4/README.md` is the on-disk provenance header demanded by the spec's "CF4 raw-data acquisition" task.
- [x] HyperLEDA partial-cache memory is honoured: the schema bump forces a deliberate delete-and-refetch rather than auto-sweeping all 1.5M PGCs.
