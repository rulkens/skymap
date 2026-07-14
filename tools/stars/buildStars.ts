/**
 * buildStars — the Gaia star-bin build orchestrator.
 *
 * This is the thin composition layer that wires the already-landed pure
 * stages (parse → resolve distance → set-algebra dedup → Morton sort →
 * octree flux-mip → encode) into the three tiered `stars-{small,medium,
 * large}.bin` files the runtime fetches. Every non-trivial decision lives
 * in one of those pure stages; this module's job is only to feed them the
 * real inputs, tier the result to fit each transfer budget, and report the
 * drop/clamp counters an operator watches during a build.
 *
 * ── The pure/impure seam ──────────────────────────────────────────────────
 *
 * `buildStarCatalog` is a *pure function over parsed rows*: given the Gaia
 * main-catalog rows, the GCNS supplement, the Hipparcos-2 bright rows, the
 * HIP→source_id cross-match, and the famous-star id set, it returns the three
 * tier catalogs plus the counters — no file reads, no writes, no `process`.
 * The CSV/`.dat` I/O and the per-tier `.bin` writes live only in `runCli`,
 * behind the `import.meta.url === argv[1]` guard, so importing this module
 * from a test drives the composition on a tiny in-memory fixture without
 * touching disk or the network.
 *
 * The one asymmetry — Gaia main rows arrive as an already-parsed array
 * (streamed from the paged CSVs; the ~16.8 M-row superset is far too large to
 * hold as one `readFileSync` string), while `hipNonPositivePlx` is threaded in
 * as a bare count from the parser's own skip tally — is essential, not
 * accidental: the streaming boundary forces the array, and the count that a
 * parser owns is owned by the parser, surfaced here for the single report.
 *
 * ── How GCNS "rides every tier" ────────────────────────────────────────────
 *
 * The Gaia Catalogue of Nearby Stars supplies two distinct things. For a
 * main-catalog row that ALSO appears in GCNS (matched by source_id) it offers
 * a vetted distance, joined here as the lowest-priority fallback in
 * `resolveStarDistancePc` (photogeo → geo → GCNS). And for the *faint* nearby
 * stars GCNS covers that never made the G<14 main cut, it contributes brand-new
 * rows. Those GCNS-only rows are tagged `isSupplement` and are exempt from the
 * per-tier apparent-magnitude truncation — a 100 pc M-dwarf is faint on the sky
 * but scientifically load-bearing for a *local* star map, so it is never the
 * star a tier drops to hit its byte budget. Every other star is truncatable.
 *
 * ── Recovering per-star tags across `selectStars` ─────────────────────────
 *
 * The tier logic needs each surviving star's apparent magnitude (the truncation
 * sort key) and its supplement flag — but `selectStars` returns bare
 * `StarInput`s (position + absMag + bpRp), by design: it owns the set algebra,
 * not the build's bookkeeping. Rather than reimplement its dedup to re-derive
 * the tags (which would braid the set formula through two places), we exploit
 * that `selectStars` copies each surviving row's `position` array *by
 * reference* into its output. So a `Map` keyed on the position array's identity
 * recovers the tag for every output star without `selectStars` knowing the tag
 * exists. One owner for the dedup; one owner for the tags; a reference join
 * between them.
 */

import { createReadStream, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Vec3 } from '../../src/@types/math/Vec3';
import type { Tier } from '../../src/@types/data/Tier';
import type { StarCatalog } from '../../src/@types/data/starCatalog/StarCatalog';
import { parseHipparcos2, type Hip2Row } from '../parsers/hipparcos2';
import { resolveStarDistancePc } from './resolveStarDistancePc';
import {
  selectStars,
  type GaiaSelectedRow,
  type HipBrightRow,
  type StarInput,
} from './selectStars';
import {
  buildStarOctree,
  type OctreeLeafStar,
  type StarOctreeGrid,
} from './buildStarOctree';
import { FAMOUS_STAR_GAIA_IDS } from '../catalog/famousStarGaiaIds';
import { bvToBpRp } from '../utils/color/bvToBpRp';
import { mortonEncode3 } from '../../src/utils/math/mortonEncode3';
import { raDecDistToCartesian } from '../../src/utils/math/raDecDistToCartesian';
import {
  encodeStarCatalog,
  HEADER_BYTES,
  NODE_BYTES,
  STAR_ABSMAG_MIN,
  STAR_ABSMAG_STEP,
  STAR_ABSMAG_LEVELS,
  STAR_COLORIDX_MIN,
  STAR_COLORIDX_STEP,
  STAR_COLORIDX_LEVELS,
} from '../../src/data/starCatalog/starCatalogFormat';
import { STAR_BIN_CODEC } from '../../src/data/starCatalog/starBinCodec';
import { rawDataPath } from '../utils/io/rawDataRegistry';

/** Hipparcos-2 bright-star cut: Gaia saturates on stars brighter than this. */
const HP_BRIGHT_CUT = 4.0;

/** Octree grid resolution — 9 bits/axis = 512³ leaf cells. */
const DEFAULT_MORTON_BITS = 9;

/**
 * Per-tier compressed-transfer budgets, in *decimal* megabytes (matching the
 * fetch tooling's `bytes / 1e6` convention). A tier's stars are truncated
 * brightest-first until the measured gzip size fits its budget.
 */
export const TIER_BUDGET_BYTES: Readonly<Record<Tier, number>> = {
  small: 10_000_000,
  medium: 30_000_000,
  large: 75_000_000,
};

/** A tier whose mandatory content overshoots its budget by more than this is a
 * loud STOP-and-report: the codec is too weak and escalating is user-gated. */
const CODEC_MISS_TOLERANCE = 1.2;

const TIERS: readonly Tier[] = ['small', 'medium', 'large'];

/**
 * One parsed Gaia main-catalog row (the paged `gaia_page_*.csv` schema).
 * `rMedGeo`/`rMedPhotogeo` are `null` when the Bailer-Jones join found no row
 * (an empty CSV cell). Tool-local: the shape exists only to hand rows from the
 * CSV parse to `buildStarCatalog`, so it lives beside its one consumer.
 */
export type GaiaMainRow = {
  sourceId: bigint;
  raDeg: number;
  decDeg: number;
  gMag: number;
  bpRp: number;
  rMedGeo: number | null;
  rMedPhotogeo: number | null;
};

/** One parsed GCNS supplement row (the `gcns_main.csv` schema). */
export type GcnsRow = {
  sourceId: bigint;
  raDeg: number;
  decDeg: number;
  distPc: number; // dist_50
  gMag: number;
  bpRp: number; // phot_bp_mean_mag − phot_rp_mean_mag
};

/** The inputs `buildStarCatalog` composes — all already parsed, no I/O. */
export type BuildStarInputs = {
  gaia: readonly GaiaMainRow[];
  gcns: readonly GcnsRow[];
  hipparcos: readonly Hip2Row[]; // parseHipparcos2().rows (non-positive-plx already dropped)
  hipNonPositivePlx: number; // parseHipparcos2().skipped, threaded for the report
  hipToSourceId: ReadonlyMap<number, bigint>;
  famousGaiaIds: ReadonlySet<bigint>;
  mortonBitsPerAxis?: number;
  tierBudgets?: Readonly<Record<Tier, number>>;
};

/** Drop counters gathered across the parse/resolve/dedup stages. */
export type StarDropCounts = {
  noBailerJones: number; // Gaia rows with no distance from any source
  hipNonPositivePlx: number; // Hipparcos rows the parser dropped (non-positive plx / malformed)
  famousSubtracted: number; // rows removed as a famous-star duplicate
  hipGaiaSubtracted: number; // Gaia rows a bright Hipparcos row replaced
};

/** LUT-saturation counters — near-zero means the frozen windows fit the data. */
export type StarClampCounts = {
  absMag: number;
  colorIdx: number;
};

/** One tier's built catalog plus its size accounting. */
export type StarTierResult = {
  tier: Tier;
  starCount: number;
  /** Faintest included main-star apparent G (the truncation boundary); `null`
   * when the tier holds only the always-included supplement. */
  gCutMag: number | null;
  rawBytes: number;
  compressedBytes: number;
  budgetBytes: number;
  /** Compressed size overshoots budget by >20% — the codec-ratio gate trips. */
  overBudget: boolean;
  catalog: StarCatalog;
  encoded: ArrayBuffer;
};

export type BuildStarResult = {
  tiers: StarTierResult[];
  drops: StarDropCounts;
  clamps: StarClampCounts;
  totalStars: number; // full deduped population (all tiers truncate from this)
  grid: StarOctreeGrid;
};

/** Absolute magnitude from apparent: M = m − 5·log10(d_pc) + 5. */
function absoluteMagnitude(apparentMag: number, distPc: number): number {
  return apparentMag - 5 * Math.log10(distPc) + 5;
}

/** A truncation tag carried alongside a star, recovered via position identity. */
type StarTag = { appMag: number; isSupplement: boolean };

/**
 * Build the three tiered star catalogs from parsed rows. Pure over its inputs
 * (no I/O, no `process`); async only because the format encoder compresses.
 */
export async function buildStarCatalog(inputs: BuildStarInputs): Promise<BuildStarResult> {
  const {
    gaia,
    gcns,
    hipparcos,
    hipNonPositivePlx,
    hipToSourceId,
    famousGaiaIds,
    mortonBitsPerAxis = DEFAULT_MORTON_BITS,
    tierBudgets = TIER_BUDGET_BYTES,
  } = inputs;

  // Position arrays double as the identity key that carries each star's
  // truncation tag across `selectStars` (see the module header).
  const tagByPosition = new Map<Vec3, StarTag>();

  // ── Gaia main rows: resolve distance, drop the placeless ones ─────────────
  const gcnsBySourceId = new Map<bigint, number>();
  for (const row of gcns) gcnsBySourceId.set(row.sourceId, row.distPc);

  const gaiaCandidates: GaiaSelectedRow[] = [];
  let noBailerJones = 0;
  const mainSourceIds = new Set<bigint>();
  for (const row of gaia) {
    mainSourceIds.add(row.sourceId);
    const distPc = resolveStarDistancePc({
      rMedPhotogeo: row.rMedPhotogeo,
      rMedGeo: row.rMedGeo,
      gcnsDistPc: gcnsBySourceId.get(row.sourceId) ?? null,
    });
    if (distPc === null) {
      // No distance from any source — cannot be placed in the scene.
      noBailerJones++;
      continue;
    }
    const position = raDecDistToCartesian(row.raDeg, row.decDeg, distPc);
    tagByPosition.set(position, { appMag: row.gMag, isSupplement: false });
    gaiaCandidates.push({
      sourceId: row.sourceId,
      position,
      absMag: absoluteMagnitude(row.gMag, distPc),
      bpRp: row.bpRp,
    });
  }

  // ── GCNS-only rows: the faint nearby stars the G<14 cut never saw ─────────
  // A GCNS row whose source_id is already a main row contributed only its
  // distance (joined above); here we add the ones with no main counterpart as
  // supplement stars, tagged so tier truncation never drops them.
  for (const row of gcns) {
    if (mainSourceIds.has(row.sourceId)) continue;
    const position = raDecDistToCartesian(row.raDeg, row.decDeg, row.distPc);
    tagByPosition.set(position, { appMag: row.gMag, isSupplement: true });
    gaiaCandidates.push({
      sourceId: row.sourceId,
      position,
      absMag: absoluteMagnitude(row.gMag, row.distPc),
      bpRp: row.bpRp,
    });
  }

  // ── Hipparcos-2 bright rows (Hp < 4.0), the Gaia-saturation patch ──────────
  const hipBright: HipBrightRow[] = [];
  for (const row of hipparcos) {
    if (row.hpMag >= HP_BRIGHT_CUT) continue;
    const position = raDecDistToCartesian(row.raDeg, row.decDeg, row.distPc);
    tagByPosition.set(position, { appMag: row.hpMag, isSupplement: false });
    hipBright.push({
      hip: row.hip,
      position,
      absMag: absoluteMagnitude(row.hpMag, row.distPc),
      bpRp: bvToBpRp(row.bv),
    });
  }

  // ── The set formula, evaluated once by its owner ──────────────────────────
  const selected = selectStars({
    gaia: gaiaCandidates,
    hipparcosBright: hipBright,
    hipToSourceId,
    famousGaiaIds,
  });
  const stars = selected.stars;

  const drops: StarDropCounts = {
    noBailerJones,
    hipNonPositivePlx,
    famousSubtracted: selected.drops.famousSubtracted,
    hipGaiaSubtracted: selected.drops.hipGaiaSubtracted,
  };

  // ── Counted-clamp totals over the whole deduped population ─────────────────
  // A saturated value is a wrong LUT endpoint caught, not silently clipped:
  // near-zero counts mean the frozen windows bracket the real population.
  const clamps = countClamps(stars);

  // ── Grid geometry from the population bounds (shared by every tier) ────────
  const grid = deriveGrid(stars, mortonBitsPerAxis);

  // Pre-quantize every star once; tiers select subsets of these leaf records.
  const quantized = stars.map((s) => quantizeStar(s, grid));

  // Partition into the always-kept supplement and the truncatable main set,
  // the latter sorted brightest-first so truncation drops the faintest.
  const supplement: OctreeLeafStar[] = [];
  const mainWithMag: { leaf: OctreeLeafStar; appMag: number }[] = [];
  for (let i = 0; i < stars.length; i++) {
    const tag = tagByPosition.get(stars[i]!.position)!;
    if (tag.isSupplement) supplement.push(quantized[i]!);
    else mainWithMag.push({ leaf: quantized[i]!, appMag: tag.appMag });
  }
  mainWithMag.sort((a, b) => a.appMag - b.appMag);
  const mainLeaves = mainWithMag.map((m) => m.leaf);

  const tiers: StarTierResult[] = [];
  for (const tier of TIERS) {
    tiers.push(await buildTier(tier, tierBudgets[tier], supplement, mainWithMag, mainLeaves, grid));
  }

  return { tiers, drops, clamps, totalStars: stars.length, grid };
}

/**
 * Truncate one tier to its budget: keep every supplement star plus the
 * brightest `k` main stars, where `k` is the largest count whose *measured*
 * compressed size still fits. We binary-search on `k`, encoding at each probe,
 * because gzip's output size is only known by running the codec — and it grows
 * monotonically enough with record count for the search to converge on the
 * budget boundary in ~log₂(mainCount) encodes. The always-included supplement
 * means `k = 0` is a valid floor; if even that overshoots the budget by >20%
 * the tier is flagged over-budget for the codec-ratio gate.
 */
async function buildTier(
  tier: Tier,
  budgetBytes: number,
  supplement: readonly OctreeLeafStar[],
  mainWithMag: readonly { leaf: OctreeLeafStar; appMag: number }[],
  mainLeaves: readonly OctreeLeafStar[],
  grid: StarOctreeGrid,
): Promise<StarTierResult> {
  const encodeFor = async (k: number) => {
    const selection = [...supplement, ...mainLeaves.slice(0, k)];
    // buildStarOctree throws unless input is ascending by Morton code.
    const sorted = [...selection].sort((a, b) => a.mortonIndex - b.mortonIndex);
    const catalog = buildStarOctree(sorted, grid);
    const encoded = await encodeStarCatalog(catalog);
    const rawBytes = HEADER_BYTES + catalog.nodeCount * NODE_BYTES + catalog.records.length;
    return { catalog, encoded, rawBytes, compressedBytes: encoded.byteLength };
  };

  const mainCount = mainLeaves.length;
  let best = 0;
  let bestEnc = await encodeFor(0);
  let lo = 0;
  let hi = mainCount;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const enc = await encodeFor(mid);
    if (enc.compressedBytes <= budgetBytes) {
      best = mid;
      bestEnc = enc;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  const gCutMag = best > 0 ? mainWithMag[best - 1]!.appMag : null;
  return {
    tier,
    starCount: bestEnc.catalog.starCount,
    gCutMag,
    rawBytes: bestEnc.rawBytes,
    compressedBytes: bestEnc.compressedBytes,
    budgetBytes,
    overBudget: bestEnc.compressedBytes > budgetBytes * CODEC_MISS_TOLERANCE,
    catalog: bestEnc.catalog,
    encoded: bestEnc.encoded,
  };
}

/** Count values that saturate the frozen absMag / colour LUT windows. */
function countClamps(stars: readonly StarInput[]): StarClampCounts {
  let absMag = 0;
  let colorIdx = 0;
  for (const s of stars) {
    const iA = Math.floor((s.absMag - STAR_ABSMAG_MIN) / STAR_ABSMAG_STEP);
    if (iA < 0 || iA > STAR_ABSMAG_LEVELS - 1) absMag++;
    const iC = Math.floor((s.bpRp - STAR_COLORIDX_MIN) / STAR_COLORIDX_STEP);
    if (iC < 0 || iC > STAR_COLORIDX_LEVELS - 1) colorIdx++;
  }
  return { absMag, colorIdx };
}

/**
 * Derive the shared quantization grid from the population's bounding box: the
 * origin is the min corner, and the cell edge divides the largest axis span
 * into `2^bits` cells so every star lands inside the grid. An empty or
 * degenerate (single-point) population falls back to a unit cell — the octree
 * over it is empty or single-celled either way.
 */
function deriveGrid(stars: readonly StarInput[], mortonBitsPerAxis: number): StarOctreeGrid {
  if (stars.length === 0) {
    return { mortonBitsPerAxis, cellEdgePc: 1, gridOrigin: [0, 0, 0] };
  }
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const s of stars) {
    for (let a = 0; a < 3; a++) {
      if (s.position[a]! < min[a]!) min[a] = s.position[a]!;
      if (s.position[a]! > max[a]!) max[a] = s.position[a]!;
    }
  }
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  const cells = 2 ** mortonBitsPerAxis;
  // A hair of headroom so the max-corner star floors to cell < cells rather
  // than exactly cells (which clamping would otherwise catch anyway).
  const cellEdgePc = extent > 0 ? (extent * (1 + 1e-9)) / cells : 1;
  return { mortonBitsPerAxis, cellEdgePc, gridOrigin: [min[0], min[1], min[2]] };
}

/** Quantize one star's world position into a leaf cell + in-cell offset. */
function quantizeStar(star: StarInput, grid: StarOctreeGrid): OctreeLeafStar {
  const cells = 2 ** grid.mortonBitsPerAxis;
  const cell: [number, number, number] = [0, 0, 0];
  const offset: Vec3 = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    const rel = (star.position[a]! - grid.gridOrigin[a]!) / grid.cellEdgePc;
    const c = clampInt(Math.floor(rel), 0, cells - 1);
    cell[a] = c;
    offset[a] = clampInt(Math.floor((rel - c) * 1024), 0, 1023);
  }
  return {
    mortonIndex: mortonEncode3(cell[0], cell[1], cell[2]),
    offset,
    absMag: star.absMag,
    bpRp: star.bpRp,
  };
}

function clampInt(v: number, lo: number, hi: number): number {
  if (v < lo) return lo;
  if (v > hi) return hi;
  return v;
}

// ───────────────────────── CLI-only: CSV/dat I/O + writes ──────────────────

/** Split a value out of the first field of a CSV line, tolerant of trailing \r. */
function csvFields(line: string): string[] {
  return line.replace(/\r$/, '').split(',');
}

/** Parse a real number cell, or `null` for an empty/whitespace cell. */
function numOrNull(cell: string | undefined): number | null {
  if (cell === undefined) return null;
  const t = cell.trim();
  if (t === '') return null;
  const n = Number.parseFloat(t);
  return Number.isFinite(n) ? n : null;
}

/**
 * Stream every `gaia_page_*.csv` page under `dir` into `GaiaMainRow[]`. The
 * paged superset (~16.8 M rows) is read with `readline` over a file stream —
 * never `readFileSync` — so no single giant string is ever materialised. Each
 * page's header line is skipped; a row whose `source_id` won't parse as a
 * BigInt (the header, or a malformed line) is skipped.
 */
async function streamGaiaPages(dir: string): Promise<GaiaMainRow[]> {
  const pages = readdirSync(dir)
    .filter((name) => /^gaia_page_\d+\.csv$/.test(name))
    .sort();
  const rows: GaiaMainRow[] = [];
  for (const name of pages) {
    const rl = createInterface({
      input: createReadStream(join(dir, name)),
      crlfDelay: Infinity,
    });
    for await (const line of rl) {
      if (line.length === 0) continue;
      const f = csvFields(line);
      let sourceId: bigint;
      try {
        sourceId = BigInt(f[0]!.trim());
      } catch {
        continue; // header line or malformed row
      }
      // source_id, ra, dec, phot_g_mean_mag, bp_rp, r_med_geo, r_med_photogeo, random_index
      rows.push({
        sourceId,
        raDeg: Number.parseFloat(f[1]!),
        decDeg: Number.parseFloat(f[2]!),
        gMag: Number.parseFloat(f[3]!),
        bpRp: numOrNull(f[4]) ?? 0,
        rMedGeo: numOrNull(f[5]),
        rMedPhotogeo: numOrNull(f[6]),
      });
    }
  }
  process.stderr.write(`  streamed ${rows.length.toLocaleString()} Gaia main-catalog rows\n`);
  return rows;
}

/** Parse `gcns_main.csv` (small enough for a single read) into `GcnsRow[]`. */
function parseGcns(text: string): GcnsRow[] {
  const rows: GcnsRow[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.length === 0) continue;
    const f = csvFields(line);
    let sourceId: bigint;
    try {
      sourceId = BigInt(f[0]!.trim());
    } catch {
      continue; // header or malformed
    }
    // source_id, ra, dec, parallax, dist_50, phot_g_mean_mag, phot_bp_mean_mag, phot_rp_mean_mag
    const bp = numOrNull(f[6]);
    const rp = numOrNull(f[7]);
    rows.push({
      sourceId,
      raDeg: Number.parseFloat(f[1]!),
      decDeg: Number.parseFloat(f[2]!),
      distPc: Number.parseFloat(f[4]!),
      gMag: Number.parseFloat(f[5]!),
      bpRp: bp !== null && rp !== null ? bp - rp : 0,
    });
  }
  return rows;
}

/**
 * Parse `hip2_best_neighbour.csv` into the HIP→source_id map the dedup keys on.
 * Columns: `source_id, original_ext_source_id (HIP), …`; only the first two are
 * consumed.
 */
function parseHipXmatch(text: string): Map<number, bigint> {
  const map = new Map<number, bigint>();
  for (const line of text.split(/\r?\n/)) {
    if (line.length === 0) continue;
    const f = csvFields(line);
    let sourceId: bigint;
    try {
      sourceId = BigInt(f[0]!.trim());
    } catch {
      continue; // header or malformed
    }
    const hip = Number.parseInt(f[1]!.trim(), 10);
    if (Number.isFinite(hip)) map.set(hip, sourceId);
  }
  return map;
}

/** Minimal `--flag value` argv parser (buildAllBins spelling). */
function parseArgs(argv: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]!;
    if (a.startsWith('--')) {
      out[a.slice(2)] = argv[i + 1] ?? '';
      i++;
    }
  }
  return out;
}

async function runCli(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const outDir = args['out-dir'] ?? 'public/data';

  process.stderr.write('streaming Gaia main catalog…\n');
  const gaia = await streamGaiaPages(rawDataPath('gaia.dir'));

  process.stderr.write('parsing GCNS supplement…\n');
  const gcns = parseGcns(readFileSync(rawDataPath('gaia.gcns'), 'utf8'));
  process.stderr.write(`  ${gcns.length.toLocaleString()} GCNS rows\n`);

  process.stderr.write('parsing Hipparcos-2 bright patch…\n');
  const hip = parseHipparcos2(readFileSync(rawDataPath('gaia.hipparcos'), 'utf8'));
  process.stderr.write(
    `  ${hip.rows.length.toLocaleString()} Hipparcos rows (skipped ${hip.skipped.toLocaleString()})\n`,
  );

  process.stderr.write('parsing Hipparcos↔Gaia cross-match…\n');
  const hipToSourceId = parseHipXmatch(readFileSync(rawDataPath('gaia.hip-xmatch'), 'utf8'));
  process.stderr.write(`  ${hipToSourceId.size.toLocaleString()} HIP→source_id pairs\n`);

  const famousGaiaIds = new Set(
    Object.values(FAMOUS_STAR_GAIA_IDS).filter((v): v is bigint => v !== null),
  );

  process.stderr.write('building star catalog (dedup + octree + tiers)…\n');
  const result = await buildStarCatalog({
    gaia,
    gcns,
    hipparcos: hip.rows,
    hipNonPositivePlx: hip.skipped,
    hipToSourceId,
    famousGaiaIds,
  });

  const { drops, clamps } = result;

  // These counters are tallied once over the whole deduped population (before
  // any tier's brightest-first truncation) — not per tier — so they are
  // reported once here rather than repeated under each tier's line below.
  process.stderr.write(
    `population (${result.totalStars.toLocaleString()} stars): ` +
      `drops noBailerJones ${drops.noBailerJones.toLocaleString()}, ` +
      `hipNonPositivePlx ${drops.hipNonPositivePlx.toLocaleString()}, ` +
      `famousSubtracted ${drops.famousSubtracted.toLocaleString()}, ` +
      `hipGaiaSubtracted ${drops.hipGaiaSubtracted.toLocaleString()}; ` +
      `clamps absMag ${clamps.absMag.toLocaleString()}, colorIdx ${clamps.colorIdx.toLocaleString()}\n`,
  );

  let anyOverBudget = false;
  for (const t of result.tiers) {
    if (t.overBudget) anyOverBudget = true;
    const filename = `stars-${t.tier}.bin`;
    const outPath = resolve(outDir, filename);
    writeFileSync(outPath, Buffer.from(t.encoded));
    const gCut = t.gCutMag === null ? 'supplement-only' : `G≤${t.gCutMag.toFixed(2)}`;
    process.stderr.write(
      `stars-${t.tier}: ${t.starCount.toLocaleString()} stars, ${gCut}, ` +
        `raw ${t.rawBytes.toLocaleString()} B → ${STAR_BIN_CODEC} ${t.compressedBytes.toLocaleString()} B ` +
        `(budget ${t.budgetBytes.toLocaleString()} B)` +
        (t.overBudget ? '  ⚠ OVER BUDGET' : '') +
        `\n` +
        `  wrote ${outPath}\n`,
    );
  }

  // ── Codec-ratio gate (deferred from the codec seal) ───────────────────────
  // A tier that misses its budget by >20% means gzip is too weak for the
  // mandatory (supplement) content. Escalating to a zstd-wasm decoder is a
  // ~200 kB runtime dependency and a user-gated decision, never a silent swap —
  // so we STOP loudly rather than ship an over-budget bin.
  if (anyOverBudget) {
    process.stderr.write(
      `\nSTOP: one or more tiers overshoot their transfer budget by >20% under the ` +
        `sealed '${STAR_BIN_CODEC}' codec. This is the deferred codec-ratio gate firing. ` +
        `Escalating to a zstd-wasm decoder is a deliberate, user-gated decision (a ~200 kB ` +
        `runtime dependency) — report this and get sign-off; do not flip the codec silently.\n`,
    );
    process.exit(1);
  }
}

// Only run the CLI when invoked directly (via tsx). A test importing this
// module for `buildStarCatalog` sees `import.meta.url` differ from argv[1], so
// no argv parse, no file read, no write, no `process.exit` fires.
const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  runCli().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
