/**
 * buildStars — the Gaia star build: parse → resolve distance → dedup (`selectStars`) → distance
 * cap → one `OctreeBuildInput` → `buildOctreeCatalog`, written once by `writeOctreeCatalog`.
 * One bake per catalog serves every tier; the runtime's per-tier budgets cut it.
 *
 * `buildStarCatalog` is pure over parsed rows, so tests drive it on an in-memory fixture; the
 * CSV reads and the writes live in `runCli` behind the direct-invocation guard. The real bake
 * holds the ~16.8 M-row Gaia superset in memory, hence the npm script's raised heap. Nothing
 * here may hold one Map or Set entry per star: V8 caps both at 2^24 entries.
 */

import { createReadStream, readFileSync, readdirSync, statSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Vec3 } from '../../src/@types/math/Vec3';
import type { OctreeGrid } from '../../src/@types/octree/OctreeGrid';
import type { OctreeStratify } from '../../src/@types/octree/OctreeStratify';
import type { OctreeCatalogMeta } from '../@types/octree/OctreeCatalogMeta';
import type { OctreeObjects } from '../@types/octree/OctreeObjects';
import { parseHipparcos2, type Hip2Row } from '../parsers/hipparcos2';
import { resolveStarDistancePc } from './resolveStarDistancePc';
import {
  selectStars,
  type GaiaSelectedRow,
  type HipBrightRow,
  type StarInput,
} from './selectStars';
import {
  parseFamousStarsSeed,
  selectDedupEntries,
  type FamousStarEntry,
} from '../parsers/famousStarsSeed';
import { keepStar } from './supplementTaper';
import { bvToBpRp } from '../utils/color/bvToBpRp';
import { raDecDistToCartesian } from '../../src/utils/math/raDecDistToCartesian';
import {
  absMagToLutIndex,
  bpRpToColorIdx,
  colorIdxToBpRp,
  lutIndexToAbsMag,
  STAR_ABSMAG_MIN,
  STAR_ABSMAG_STEP,
  STAR_ABSMAG_LEVELS,
  STAR_COLORIDX_MIN,
  STAR_COLORIDX_STEP,
  STAR_COLORIDX_LEVELS,
} from '../../src/data/starCatalog/starCatalogFormat';
import { STAR_COLUMN_SCHEMA, STAR_OCTREE_DATA_PREFIX } from '../../src/data/octree/octreeFormat';
import { initialState } from '../../src/layers/starCatalog/state/starCatalogs/initialState';
import { buildOctreeCatalog } from '../octree/buildOctreeCatalog';
import { writeOctreeCatalog } from '../octree/writeOctreeCatalog';
import { rawDataPath } from '../utils/io/rawDataRegistry';

/** Hipparcos-2 bright-star cut: Gaia saturates on stars brighter than this. */
const HP_BRIGHT_CUT = 4.0;

/**
 * Maximum heliocentric distance a star may sit at and still join the built
 * population; farther stars are dropped before the grid is derived.
 *
 * The quantization grid divides the population's bounding box into a fixed
 * `2^bits` cells per axis, so its leaf size is set by the FARTHEST star, not the
 * typical one. Measured on the real catalog the star-weighted radial
 * distribution is sharply peaked at the Sun — p50 ≈ 1 kpc, p99 ≈ 7.3 kpc,
 * p99.9 ≈ 11 kpc, farthest occupied leaf 63 kpc — yet a handful of LMC/SMC
 * members and bad-parallax junk stretch the box to ~98 kpc. Those outliers make
 * every leaf cell 4–8× larger than the local sample needs (192 pc, so the Sun's
 * own leaf holds 228 k stars and the renderer suffers giant LOD pops). Beyond
 * ~12 kpc the sample is dominated by those extragalactic contaminants and
 * parallax errors, so dropping (not clamping) them keeps the grid tight around
 * the population that matters. Positions are heliocentric parsecs, so a star's
 * distance is simply `|position|`.
 */
const MAX_STAR_DISTANCE_PC = 12_000;

/** Octree grid resolution: 10 bits/axis keeps a Morton key inside 30 bits of a u32. */
const DEFAULT_MORTON_BITS = 10;

/**
 * The bake writes the runtime's default `thr`, so stratification and the cut agree. mLim = 10:
 * at cellEdge ≈ 23 pc the brightest stars (M ≈ −6) land at level 7 and M ≈ −3 at level 5, above
 * typical chunk roots, so the zoomed-out sky draws from the index alone (plan ruling 3).
 */
export const GAIA_STRATIFY: OctreeStratify = {
  thr: initialState.refineThreshold,
  mLim: 10,
  refUnit: 10,
};

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

/**
 * One parsed GCNS supplement row (the `gcns_main.csv` schema).
 *
 * `distPc` is already converted to parsecs at parse time: the upstream
 * `dist_50` column is in *kiloparsecs* (verified against `parallax` for
 * several rows — e.g. source_id 41888816866304 has parallax 11.0285 mas ⇒
 * ~90.7 pc, and its `dist_50` cell reads `0.090678625`), while every other
 * distance in this pipeline (`GaiaMainRow.rMedGeo`/`rMedPhotogeo`, the
 * Hipparcos rows, the encoded `.bin` positions) is in parsecs. Converting
 * once in `parseGcns` — where the raw cell enters — means `distPc` on this
 * type is unconditionally in the pipeline's parsec frame, so every
 * consumer (the `gcnsBySourceId` distance fallback and the GCNS-only
 * supplement rows) can treat it like any other distance without carrying
 * a unit caveat past the parse boundary.
 */
export type GcnsRow = {
  sourceId: bigint;
  raDeg: number;
  decDeg: number;
  distPc: number; // dist_50, kpc → pc converted at parse time
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
};

/** Drop counters gathered across the parse/resolve/dedup stages. */
export type StarDropCounts = {
  noBailerJones: number; // Gaia rows with no distance from any source
  hipNonPositivePlx: number; // Hipparcos rows the parser dropped (non-positive plx / malformed)
  famousSubtracted: number; // rows removed as a famous-star duplicate
  hipGaiaSubtracted: number; // Gaia rows a bright Hipparcos row replaced
  farDistance: number; // stars past MAX_STAR_DISTANCE_PC, dropped before grid derivation
  noPhotometry: number; // resolvable distance but a missing (NaN) G magnitude
};

/** LUT-saturation counters — near-zero means the frozen windows fit the data. */
export type StarClampCounts = {
  absMag: number;
  colorIdx: number;
};

export type BuildStarResult = {
  readonly objects: OctreeObjects;
  /** Everything `writeOctreeCatalog` needs beyond the objects. */
  readonly meta: OctreeCatalogMeta;
  readonly drops: StarDropCounts;
  readonly clamps: StarClampCounts;
};

/** Absolute magnitude from apparent: M = m − 5·log10(d_pc) + 5. */
function absoluteMagnitude(apparentMag: number, distPc: number): number {
  return apparentMag - 5 * Math.log10(distPc) + 5;
}

/**
 * Encode the curated famous-star seed entries as the Gaia-dedup set: each
 * dedup-contributing entry's `gaiaDr3` as a `bigint`. The selection (which
 * entries contribute at all) lives in `selectDedupEntries` — its one home,
 * shared with the Rust-const encoder in `buildFamousStars.ts` — so this function
 * owns only the `bigint`-set encoding. The parameter is narrowed to the one field
 * the encoding depends on so the test can exercise it without a full entry.
 */
export function seedToFamousGaiaIds(
  entries: readonly Pick<FamousStarEntry, 'gaiaDr3'>[],
): ReadonlySet<bigint> {
  return new Set(selectDedupEntries(entries).map((e) => BigInt(e.gaiaDr3)));
}

/** Build the chunked star octree from parsed rows. Pure over its inputs: no I/O, no `process`. */
export function buildStarCatalog(inputs: BuildStarInputs): BuildStarResult {
  const {
    gaia,
    gcns,
    hipparcos,
    hipNonPositivePlx,
    hipToSourceId,
    famousGaiaIds,
    mortonBitsPerAxis = DEFAULT_MORTON_BITS,
  } = inputs;

  // ── Gaia main rows: resolve distance, drop the placeless ones ─────────────
  const gcnsBySourceId = new Map<bigint, number>();
  for (const row of gcns) gcnsBySourceId.set(row.sourceId, row.distPc);

  const gaiaCandidates: GaiaSelectedRow[] = [];
  let noBailerJones = 0;
  let noPhotometry = 0;
  // The GCNS-only loop below must skip any GCNS row whose source_id already
  // appears as a main row. The obvious form — a Set of ALL ~16.8 M main ids —
  // overflows V8's 2^24-entry Set cap and crashes the real build. So invert the
  // membership: record only the GCNS ids (≤~331 k) that are ALSO seen among the
  // main rows. Same predicate at the skip site, ~50× smaller, and ~1 GB lighter.
  const gcnsSeenInMain = new Set<bigint>();
  for (const row of gaia) {
    if (gcnsBySourceId.has(row.sourceId)) gcnsSeenInMain.add(row.sourceId);
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
    if (!Number.isFinite(row.gMag)) {
      // A missing G magnitude (empty CSV cell) parses to NaN, and
      // `absoluteMagnitude(NaN, d)` is NaN. The absMag quantizer's documented
      // NaN semantics map NaN to LUT index 0 — the BRIGHTEST bin — so an
      // un-guarded row becomes a fake beacon star near Earth, and because it
      // lands *inside* the LUT's valid range it is never counted as a clamp.
      noPhotometry++;
      continue;
    }
    gaiaCandidates.push({
      sourceId: row.sourceId,
      position: raDecDistToCartesian(row.raDeg, row.decDeg, distPc),
      absMag: absoluteMagnitude(row.gMag, distPc),
      bpRp: row.bpRp,
    });
  }

  // ── GCNS-only rows: the faint nearby stars the G<14 cut never saw ─────────
  // A GCNS row whose source_id is already a main row contributed only its
  // distance (joined above); here we add the ones with no main counterpart as
  // supplement stars.
  //
  // Before a supplement row joins the population it passes the outer-edge taper
  // (`keepStar`): the supplement stops abruptly at ~100 pc, so its members are
  // thinned probabilistically over the outer 30 pc to fade into the survey floor
  // rather than end in a hard shell (see supplementTaper.ts for the measured
  // step). The decision is a pure hash of `source_id`, so every bake sees the
  // same tapered set. `distPc` is the GCNS row's already-parsec distance.
  for (const row of gcns) {
    if (gcnsSeenInMain.has(row.sourceId)) continue;
    if (!keepStar({ sourceId: row.sourceId, distPc: row.distPc, isSupplement: true })) continue;
    if (!Number.isFinite(row.gMag)) {
      // Same missing-photometry guard as the Gaia main loop above — a NaN G
      // magnitude here would quantize to the same fake-beacon LUT bin.
      noPhotometry++;
      continue;
    }
    gaiaCandidates.push({
      sourceId: row.sourceId,
      position: raDecDistToCartesian(row.raDeg, row.decDeg, row.distPc),
      absMag: absoluteMagnitude(row.gMag, row.distPc),
      bpRp: row.bpRp,
    });
  }

  // ── Hipparcos-2 bright rows (Hp < 4.0), the Gaia-saturation patch ──────────
  const hipBright: HipBrightRow[] = [];
  for (const row of hipparcos) {
    if (row.hpMag >= HP_BRIGHT_CUT) continue;
    hipBright.push({
      hip: row.hip,
      position: raDecDistToCartesian(row.raDeg, row.decDeg, row.distPc),
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

  // ── Distance cap: drop far outliers before the grid is derived ────────────
  // The grid and the octree are built from THIS `stars` array, so capping it here
  // guarantees no surviving star lands outside the tightened grid (see
  // MAX_STAR_DISTANCE_PC for the measured evidence).
  const maxDistSqPc = MAX_STAR_DISTANCE_PC * MAX_STAR_DISTANCE_PC;
  const stars = selected.stars.filter((s) => {
    const [x, y, z] = s.position;
    return x * x + y * y + z * z <= maxDistSqPc;
  });
  const farDistance = selected.stars.length - stars.length;

  const drops: StarDropCounts = {
    noBailerJones,
    hipNonPositivePlx,
    famousSubtracted: selected.drops.famousSubtracted,
    hipGaiaSubtracted: selected.drops.hipGaiaSubtracted,
    farDistance,
    noPhotometry,
  };

  // ── Counted-clamp totals over the whole deduped population ─────────────────
  // A saturated value is a wrong LUT endpoint caught, not silently clipped:
  // near-zero counts mean the frozen windows bracket the real population.
  const clamps = countClamps(stars);

  // ── One octree over the whole population ─────────────────────────────────
  // Magnitudes and colours enter snapped to their LUT bin centres: a blob's flux must sum what
  // its records will draw, and a star past the LUT floor draws at the floor, not its raw value.
  const grid = deriveGrid(stars, mortonBitsPerAxis);
  const positions = new Float64Array(stars.length * 3);
  const absMag = new Float32Array(stars.length);
  const colourIndex = new Float32Array(stars.length);
  stars.forEach((s, i) => {
    for (let a = 0; a < 3; a++) positions[3 * i + a] = s.position[a]! - grid.origin[a]!;
    absMag[i] = lutIndexToAbsMag(absMagToLutIndex(s.absMag));
    colourIndex[i] = colorIdxToBpRp(bpRpToColorIdx(s.bpRp));
  });
  const objects = buildOctreeCatalog({
    grid,
    stratify: GAIA_STRATIFY,
    positions,
    magnitudeColumn: 'absMag',
    columns: new Map([
      ['absMag', absMag],
      ['colourIndex', colourIndex],
    ]),
    schema: STAR_COLUMN_SCHEMA,
  });
  const meta: OctreeCatalogMeta = {
    family: 'star',
    grid,
    stratify: GAIA_STRATIFY,
    schema: STAR_COLUMN_SCHEMA,
    stats: { starCount: stars.length },
  };

  return { objects, meta, drops, clamps };
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
 * Derive the quantization grid from the population's bounding box: the origin is the min
 * corner, and the cell edge divides the largest axis span into `2^bits` cells so every star
 * lands inside the grid. An empty or single-point population falls back to a unit cell.
 */
function deriveGrid(stars: readonly StarInput[], bits: number): OctreeGrid {
  if (stars.length === 0) return { bits, cellEdge: 1, origin: [0, 0, 0] };
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const s of stars) {
    for (let a = 0; a < 3; a++) {
      if (s.position[a]! < min[a]!) min[a] = s.position[a]!;
      if (s.position[a]! > max[a]!) max[a] = s.position[a]!;
    }
  }
  const extent = Math.max(max[0] - min[0], max[1] - min[1], max[2] - min[2]);
  // A hair of headroom so the max-corner star floors to cell < 2^bits rather than exactly 2^bits.
  const cellEdge = extent > 0 ? (extent * (1 + 1e-9)) / 2 ** bits : 1;
  return { bits, cellEdge, origin: min };
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
    // dist_50 is in kiloparsecs upstream; convert to parsecs here, at the
    // point the raw cell enters the pipeline, so `GcnsRow.distPc` is in the
    // same unit as every other distance in the build (see the type's doc).
    const bp = numOrNull(f[6]);
    const rp = numOrNull(f[7]);
    rows.push({
      sourceId,
      raDeg: Number.parseFloat(f[1]!),
      decDeg: Number.parseFloat(f[2]!),
      distPc: Number.parseFloat(f[4]!) * 1000,
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

  // The curated seed is the single source of the Gaia-dedup fact now: subtract
  // each entry's Gaia DR3 source_id from the bin so a nearby named star isn't
  // drawn twice (once as a scene body, once as a Gaia point). A null gaiaDr3
  // (the Sun; saturated bright stars with no DR3 row) drops out.
  const famousSeed = parseFamousStarsSeed(readFileSync(rawDataPath('famous-stars.seed'), 'utf8'));
  const famousGaiaIds = seedToFamousGaiaIds(famousSeed);

  process.stderr.write('building star octree (dedup + stratify + chunk)…\n');
  const t0 = performance.now();
  const { objects, meta, drops, clamps } = buildStarCatalog({
    gaia,
    gcns,
    hipparcos: hip.rows,
    hipNonPositivePlx: hip.skipped,
    hipToSourceId,
    famousGaiaIds,
  });
  const t1 = performance.now();

  process.stderr.write(
    `population (${meta.stats.starCount?.toLocaleString()} stars): ` +
      `drops noBailerJones ${drops.noBailerJones.toLocaleString()}, ` +
      `hipNonPositivePlx ${drops.hipNonPositivePlx.toLocaleString()}, ` +
      `famousSubtracted ${drops.famousSubtracted.toLocaleString()}, ` +
      `hipGaiaSubtracted ${drops.hipGaiaSubtracted.toLocaleString()}, ` +
      `farDistance ${drops.farDistance.toLocaleString()}, ` +
      `noPhotometry ${drops.noPhotometry.toLocaleString()}; ` +
      `clamps absMag ${clamps.absMag.toLocaleString()}, colorIdx ${clamps.colorIdx.toLocaleString()}\n`,
  );

  const starOutDir = join(outDir, STAR_OCTREE_DATA_PREFIX);
  const header = writeOctreeCatalog(objects, meta, starOutDir, 'stars');
  const t2 = performance.now();
  process.stderr.write(
    `stars octree: ${header.stats.chunkCount?.toLocaleString()} chunks ` +
      `(${header.chunks.length.toLocaleString()} rooted in the index), ` +
      `chunkNodeCap ${header.chunkNodeCap.toLocaleString()}, ` +
      `index ${header.nodes.toLocaleString()} nodes / ${header.records.toLocaleString()} records / ` +
      `${statSync(join(starOutDir, 'stars.bin')).size.toLocaleString()} B; ` +
      `build ${((t1 - t0) / 1000).toFixed(1)} s, write ${((t2 - t1) / 1000).toFixed(1)} s\n` +
      `  wrote ${join(starOutDir, 'stars.bin')} + ${join(starOutDir, 'stars')}/\n`,
  );
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
