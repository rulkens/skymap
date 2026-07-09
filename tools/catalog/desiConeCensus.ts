#!/usr/bin/env node
/**
 * desiConeCensus — the designated ≤2°-nudge re-check for `DESI_CONE`.
 *
 * The cone center in `tools/catalog/desiPatches.ts` was chosen from a live
 * *sampling* spike against DESI's remote server (200 range-request windows
 * × 400 rows per file — see
 * `docs/superpowers/specs/2026-07-07-desi-deep-cone-design.md`), which
 * carries ±20-40% error from window clumping. Now that the four NGC
 * clustering files are local (`npm run fetch-desi`), this tool re-checks
 * that estimate with *exact* row counts: it walks every row of every
 * tracer file once and tallies how many fall inside a 2.5° cone at the
 * configured center and at a grid of nearby candidate centers, so an
 * operator can see at a glance whether the ±2° sampling error hid a
 * denser spot nearby.
 *
 * Usage:
 *   npm run desi-cone-census
 *
 * ## Memory approach
 *
 * The four files are 83-340 MB each (773 MB combined). This tool reads
 * them ONE AT A TIME — never concatenated, never held in memory
 * simultaneously — mirroring `loadDesiPatch` in `buildAllBins.ts`: read the
 * file, decode RA/DEC directly off the `DataView` (no per-row object
 * allocation, no `ParsedRecord[]` — we only need two f64s per row), tally
 * into a handful of integer counters, then let the file's buffer fall out
 * of scope before the next tracer is read. Peak transient memory is
 * bounded by roughly 2× the largest single file (~680 MB for BGS, from
 * the Buffer→ArrayBuffer slice's copy — see `loadDesiPatch`'s docstring for why
 * that slice is unavoidable), never the sum of all four.
 *
 * ## Why not call `makeConeFilter` per candidate?
 *
 * `makeConeFilter`'s returned predicate re-derives the query row's unit
 * vector (two `sin`/two `cos` calls) on every invocation, which is the
 * right tradeoff for a single-cone filter but wrong here: this tool tests
 * ~7 million total rows against 81 candidate centers, and the radius
 * (2.5°) never varies across candidates. So this module converts each
 * row's RA/Dec to a unit vector exactly once, then compares that one
 * vector against all 81 precomputed candidate-center vectors via a cheap
 * dot product — the same geometry `makeConeFilter` uses, just batched
 * across candidates instead of re-deriving the row vector 81 times.
 */
import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { parseFitsBinTable } from '../parsers/desiFits';
import type { DesiTracer, FitsColumn } from '../parsers/desiFits';
import { eqRaDecToUnitCart } from '../../src/utils/math/eqRaDecToUnitCart';
import type { Vec3 } from '../../src/@types/math/Vec3';
import { DESI_CONE, DESI_TRACER_FILE_KEYS } from './desiPatches';
import { rawDataPath } from '../utils/io/rawDataRegistry';

const RAD = Math.PI / 180;

const TRACERS: readonly DesiTracer[] = ['BGS', 'LRG', 'ELG', 'QSO'];

/** ±2° in 0.5° steps around the configured center, per the brief's grid spec. */
const OFFSET_STEP_DEG = 0.5;
const OFFSET_RANGE_DEG = 2;

type Candidate = {
  dRaDeg: number;
  dDecDeg: number;
  raDeg: number;
  decDeg: number;
  vec: Readonly<Vec3>;
  counts: Record<DesiTracer, number>;
};

function buildCandidateGrid(): Candidate[] {
  const offsets: number[] = [];
  for (let d = -OFFSET_RANGE_DEG; d <= OFFSET_RANGE_DEG + 1e-9; d += OFFSET_STEP_DEG) {
    offsets.push(Math.round(d * 10) / 10); // clean off binary-fraction drift (e.g. -0.49999999)
  }
  const candidates: Candidate[] = [];
  for (const dDecDeg of offsets) {
    for (const dRaDeg of offsets) {
      const raDeg = DESI_CONE.raDeg + dRaDeg;
      const decDeg = DESI_CONE.decDeg + dDecDeg;
      candidates.push({
        dRaDeg,
        dDecDeg,
        raDeg,
        decDeg,
        vec: eqRaDecToUnitCart(raDeg, decDeg),
        counts: { BGS: 0, LRG: 0, ELG: 0, QSO: 0 },
      });
    }
  }
  return candidates;
}

/** Case-insensitive column lookup, throwing a clear error on absence — the requireColumn idiom from `parseDesiClustering`. */
function requireColumn(columns: readonly FitsColumn[], name: string, tracer: DesiTracer): FitsColumn {
  const lower = name.toLowerCase();
  const col = columns.find((c) => c.name.toLowerCase() === lower);
  if (!col) {
    throw new Error(
      `desiConeCensus: ${tracer} table missing required column "${name}". ` +
        `Found: ${columns.map((c) => c.name).join(', ')}`,
    );
  }
  if (col.form !== 'D' && col.form !== '1D') {
    throw new Error(
      `desiConeCensus: ${tracer} column "${name}" has TFORM "${col.form}", expected scalar D — ` +
        'the census assumes RA/DEC are always f64, verified against every DR1 NGC tracer header.',
    );
  }
  return col;
}

/**
 * Tally one tracer file's rows into every candidate's per-tracer counter,
 * mutating `candidates` in place. Reads the file once, decodes only RA/DEC
 * per row (no `ParsedRecord` allocation — see the module docstring's
 * memory-approach section), and lets `buf`/`arrayBuf` fall out of scope on
 * return so the caller's next iteration starts with a clean slate.
 */
function tallyTracer(tracer: DesiTracer, candidates: readonly Candidate[]): number {
  const path = rawDataPath(DESI_TRACER_FILE_KEYS[tracer]);
  const buf = readFileSync(path);
  // Buffer→ArrayBuffer gotcha (same as `loadDesiPatch` in buildAllBins.ts):
  // `readFileSync` returns a view over a possibly-pooled ArrayBuffer, so
  // slice down to exactly this file's bytes before handing it to the FITS
  // parser's DataView.
  const arrayBuf = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  const table = parseFitsBinTable(arrayBuf);
  const view = new DataView(arrayBuf);
  const raCol = requireColumn(table.columns, 'RA', tracer);
  const decCol = requireColumn(table.columns, 'DEC', tracer);
  const cosRadius = Math.cos(DESI_CONE.radiusDeg * RAD);

  for (let r = 0; r < table.rowCount; r++) {
    const rowStart = table.dataOffset + r * table.rowLengthBytes;
    const ra = view.getFloat64(rowStart + raCol.byteOffset, false);
    const dec = view.getFloat64(rowStart + decCol.byteOffset, false);
    const q = eqRaDecToUnitCart(ra, dec);
    for (const c of candidates) {
      const dot = c.vec[0] * q[0] + c.vec[1] * q[1] + c.vec[2] * q[2];
      if (dot > cosRadius) c.counts[tracer]++;
    }
  }
  return table.rowCount;
}

function totalOf(c: Candidate): number {
  return c.counts.BGS + c.counts.LRG + c.counts.ELG + c.counts.QSO;
}

/** The full, verbatim operator instruction the brief specifies — do not paraphrase. */
const RECENTER_INSTRUCTION =
  'If a candidate within 2° beats the configured center by a clear margin in BGS AND LRG ' +
  '(the finger-of-god tracers), update DESI_CONE raDeg/decDeg in tools/catalog/desiPatches.ts — one file — ' +
  'and re-run npm run build-all.';

export function main(): void {
  const missing = TRACERS.filter((t) => !existsSync(rawDataPath(DESI_TRACER_FILE_KEYS[t])));
  if (missing.length > 0) {
    console.error(
      `desi-cone-census: missing ${missing.join(', ')} clustering file(s) — run npm run fetch-desi first`,
    );
    process.exitCode = 1;
    return;
  }

  console.log(
    `DESI cone census — configured center RA ${DESI_CONE.raDeg}°, ` +
      `Dec ${DESI_CONE.decDeg}°, radius ${DESI_CONE.radiusDeg}°\n`,
  );

  const candidates = buildCandidateGrid();
  for (const tracer of TRACERS) {
    process.stdout.write(`scanning ${tracer}…`);
    const rowCount = tallyTracer(tracer, candidates);
    console.log(` ${rowCount.toLocaleString()} rows`);
  }
  console.log('');

  const configured = candidates.find((c) => c.dRaDeg === 0 && c.dDecDeg === 0)!;
  console.log('── Configured center ──');
  console.log(
    `  BGS ${configured.counts.BGS.toLocaleString()}  LRG ${configured.counts.LRG.toLocaleString()}  ` +
      `ELG ${configured.counts.ELG.toLocaleString()}  QSO ${configured.counts.QSO.toLocaleString()}  ` +
      `Total ${totalOf(configured).toLocaleString()}`,
  );
  console.log('');

  console.log(`── Full ±${OFFSET_RANGE_DEG}° grid (${OFFSET_STEP_DEG}° steps), sorted by total desc ──`);
  console.log(
    ['dRA', 'dDec', 'RA', 'Dec', 'BGS', 'LRG', 'ELG', 'QSO', 'Total']
      .map((h) => h.padStart(9))
      .join(''),
  );
  const sorted = [...candidates].sort((a, b) => totalOf(b) - totalOf(a));
  for (const c of sorted) {
    const isConfigured = c.dRaDeg === 0 && c.dDecDeg === 0;
    const cells = [
      c.dRaDeg.toFixed(1),
      c.dDecDeg.toFixed(1),
      c.raDeg.toFixed(2),
      c.decDeg.toFixed(2),
      c.counts.BGS.toLocaleString(),
      c.counts.LRG.toLocaleString(),
      c.counts.ELG.toLocaleString(),
      c.counts.QSO.toLocaleString(),
      totalOf(c).toLocaleString(),
    ];
    console.log(cells.map((cell) => cell.padStart(9)).join('') + (isConfigured ? '  ← configured' : ''));
  }
  console.log('');
  console.log(RECENTER_INSTRUCTION);
}

// Only run when this file is invoked directly (e.g. via tsx) — the same
// `invokedDirectly` idiom `buildAllBins.ts` uses, so importing this module
// (e.g. from a future smoke test) never triggers a 773 MB file scan as a
// side effect of the import itself.
const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main();
}
