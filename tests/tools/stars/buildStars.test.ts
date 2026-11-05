import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  buildStarCatalog,
  seedToFamousGaiaIds,
  type GaiaMainRow,
  type GcnsRow,
} from '../../../tools/stars/buildStars';
import { parseHipparcos2 } from '../../../tools/parsers/hipparcos2';
import { decodeOctreeIndex } from '../../../src/data/octree/decodeOctreeIndex';
import { writeOctreeCatalog } from '../../../tools/octree/writeOctreeCatalog';

/**
 * These tests drive the *pure* composition (`buildStarCatalog`) on a tiny
 * hand-built, in-memory fixture — no real Gaia data, no network, no file I/O.
 * The CSV/`.dat` reads live behind the CLI guard in `buildStars.ts` and are
 * never touched here; the round-trip test writes to a temp dir.
 *
 * The fixture is engineered so every drop counter is exercised by exactly one
 * row, so each counter's expected value is 1 and is hand-countable from the
 * rows below.
 */

// A famous Gaia id (Proxima Centauri) — one Gaia row carries it, so it is
// subtracted as a famous-star duplicate.
const PROXIMA_ID = 5853498713190525696n;

/**
 * Assemble one 276-byte Hipparcos-2 fixed-width record. Byte ranges are the
 * 1-based inclusive columns the parser slices (see `parseHipparcos2`), and
 * every numeric field is right-justified into its column as the real file is.
 */
function hipLine(f: {
  hip: number;
  raRad: number;
  deRad: number;
  plxMas: number;
  hpMag: number;
  bv: number;
}): string {
  const buf = new Array<string>(160).fill(' ');
  const put = (start1: number, end1: number, text: string): void => {
    const width = end1 - start1 + 1;
    const s = text.slice(0, width).padStart(width);
    for (let i = 0; i < width; i++) buf[start1 - 1 + i] = s[i]!;
  };
  put(1, 6, String(f.hip));
  put(16, 28, f.raRad.toFixed(10));
  put(30, 42, f.deRad.toFixed(10));
  put(44, 50, f.plxMas.toFixed(2));
  put(130, 136, f.hpMag.toFixed(4));
  put(153, 158, f.bv.toFixed(3));
  return buf.join('');
}

function buildFixture() {
  const gaia: GaiaMainRow[] = [
    // Kept: normal photogeometric distance, no dedup match.
    {
      sourceId: 1001n,
      raDeg: 10,
      decDeg: 20,
      gMag: 8,
      bpRp: 0.7,
      rMedGeo: null,
      rMedPhotogeo: 50,
    },
    // Dropped: no Bailer-Jones distance and not in GCNS → no distance at all.
    {
      sourceId: 1002n,
      raDeg: 30,
      decDeg: -10,
      gMag: 9,
      bpRp: 0.9,
      rMedGeo: null,
      rMedPhotogeo: null,
    },
    // Subtracted: matches the famous-star id set.
    {
      sourceId: PROXIMA_ID,
      raDeg: 40,
      decDeg: 5,
      gMag: 11,
      bpRp: 2.0,
      rMedGeo: 1.3,
      rMedPhotogeo: 1.3,
    },
    // Subtracted: a bright Hipparcos row cross-matches this source_id and wins.
    {
      sourceId: 4004n,
      raDeg: 50,
      decDeg: 15,
      gMag: 3,
      bpRp: 0.0,
      rMedGeo: 100,
      rMedPhotogeo: 100,
    },
    // Dropped: a resolvable distance but no G magnitude (empty CSV cell parses
    // to NaN). Without the guard, absoluteMagnitude(NaN, d) is NaN, and the
    // absMag quantizer's NaN semantics land it in LUT index 0 — the brightest
    // bin — as a fake beacon star that is never counted as a clamp.
    {
      sourceId: 1003n,
      raDeg: 70,
      decDeg: 25,
      gMag: NaN,
      bpRp: 0.5,
      rMedGeo: null,
      rMedPhotogeo: 20,
    },
  ];

  // One GCNS-only row (source_id not in the main set) → an always-kept
  // supplement star, plus one with the same missing-photometry gap on the
  // supplement loop.
  const gcns: GcnsRow[] = [
    { sourceId: 2001n, raDeg: 60, decDeg: -20, distPc: 10, gMag: 15, bpRp: 2.5 },
    { sourceId: 2002n, raDeg: 65, decDeg: -25, distPc: 10, gMag: NaN, bpRp: 1.0 },
  ];

  // Two Hipparcos rows: one bright (kept, wins over Gaia 4004) and one with a
  // non-positive parallax the parser drops upstream.
  const hipText = [
    hipLine({ hip: 42, raRad: 0.5, deRad: 0.3, plxMas: 100, hpMag: 1.5, bv: 0.0 }),
    hipLine({ hip: 99, raRad: 0.6, deRad: 0.2, plxMas: -5, hpMag: 2.0, bv: 0.4 }),
  ].join('\n');
  const hip = parseHipparcos2(hipText);

  // HIP 42 resolves to Gaia source 4004 — the Hipparcos-wins cross-match.
  const hipToSourceId = new Map<number, bigint>([[42, 4004n]]);
  const famousGaiaIds = new Set<bigint>([PROXIMA_ID]);

  return { gaia, gcns, hip, hipToSourceId, famousGaiaIds };
}

describe('buildStarCatalog', () => {
  it('produces a round-trippable catalog from a synthetic fixture', () => {
    const { gaia, gcns, hip, hipToSourceId, famousGaiaIds } = buildFixture();

    const result = buildStarCatalog({
      gaia,
      gcns,
      hipparcos: hip.rows,
      hipNonPositivePlx: hip.skipped,
      hipToSourceId,
      famousGaiaIds,
    });

    // The written index decodes and counts the post-dedup population: g1 (kept),
    // gc1 (supplement), HIP 42 (kept) = 3. g2 dropped (no distance), Proxima
    // subtracted (famous), Gaia 4004 subtracted (Hipparcos wins), g3/gc2 dropped
    // (no G magnitude).
    const dir = mkdtempSync(join(tmpdir(), 'stars-'));
    try {
      writeOctreeCatalog(result.objects, result.meta, dir, 'stars');
      const b = readFileSync(join(dir, 'stars.bin'));
      const index = decodeOctreeIndex(
        b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer,
      );
      expect(index.header.stats.starCount).toBe(3);
      const owned = [result.objects.index, ...result.objects.chunks].reduce(
        (sum, o) => sum + o.nodes.ownCount.reduce((x, y) => x + y, 0),
        0,
      );
      expect(owned).toBe(3);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }

    // The fixture's photometry sits inside the frozen LUT windows, so nothing
    // saturates — a nonzero count here would mean a clamp-detection sign error.
    expect(result.clamps).toEqual({ absMag: 0, colorIdx: 0 });
  });

  it('derives the famous-dedup set from the seed — a non-null gaiaDr3 is subtracted, a null contributes nothing', () => {
    // The seed is the single source of the dedup fact now (the standalone
    // FAMOUS_STAR_GAIA_IDS table is gone). A matched entry's DR3 id joins the
    // set as a bigint; a `null` entry (the Sun, saturated bright stars) is a
    // real "no row to subtract" value and must add nothing.
    const set = seedToFamousGaiaIds([{ gaiaDr3: PROXIMA_ID.toString() }, { gaiaDr3: null }]);

    expect(set.has(PROXIMA_ID)).toBe(true);
    expect(set.size).toBe(1);
  });

  it('reports the drop counters', () => {
    const { gaia, gcns, hip, hipToSourceId, famousGaiaIds } = buildFixture();

    const result = buildStarCatalog({
      gaia,
      gcns,
      hipparcos: hip.rows,
      hipNonPositivePlx: hip.skipped,
      hipToSourceId,
      famousGaiaIds,
    });

    expect(result.drops).toEqual({
      noBailerJones: 1, // Gaia 1002 — no distance from any source
      hipNonPositivePlx: 1, // HIP 99 — non-positive parallax, dropped by the parser
      famousSubtracted: 1, // Proxima — matched the famous-star set
      hipGaiaSubtracted: 1, // Gaia 4004 — replaced by bright HIP 42
      farDistance: 0, // every fixture star sits within MAX_STAR_DISTANCE_PC
      noPhotometry: 2, // Gaia 1003 + GCNS 2002 — resolvable distance, no G magnitude
    });
  });
});
