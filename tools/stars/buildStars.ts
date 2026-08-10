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
 * ── Memory profile ─────────────────────────────────────────────────────────
 *
 * The real build holds the full parsed Gaia superset (~16.8 M rows at the
 * G<14 magnitude cut) plus the derived per-star structures — distance
 * resolution, dedup set algebra, Morton sort, octree flux-mip — all live in
 * memory at once, on the order of 10 GB. That is why the `build-stars` npm
 * script raises Node's `--max-old-space-size` above the default heap ceiling
 * rather than relying on it; without the raised ceiling the process OOMs
 * partway through. A machine without roughly that much free RAM should not
 * run the real build — use the tiny in-memory fixture below instead.
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
 * ── Carrying per-star tags through `selectStars` ──────────────────────────
 *
 * The tier logic needs each surviving star's apparent magnitude (the truncation
 * sort key) and its supplement flag. Those two tags ride *on the `StarInput`
 * row itself* (`appMag`/`isSupplement`), so they survive `selectStars`'s dedup
 * with no re-join: the same object that carries a star's position and photometry
 * carries its truncation tag. `selectStars` still owns the set algebra and never
 * interprets the tags — it only forwards them, exactly as it forwards
 * `absMag`/`bpRp`.
 *
 * An earlier design instead re-joined the tags after the fact via a `Map` keyed
 * on each output position array's identity. That crashed on the real catalog:
 * V8 caps both `Map` and `Set` at 2^24 = 16,777,216 entries, and the real build
 * deduplicates ~16.8 M stars — one entry per star overflows the cap. Any
 * collection whose size scales with the total star count is off the table here;
 * the tag-on-the-row form has no such collection at all.
 */

import { createReadStream, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
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
import { buildStarOctree, type OctreeLeafStar, type StarOctreeGrid } from './buildStarOctree';
import {
  parseFamousStarsSeed,
  selectDedupEntries,
  type FamousStarEntry,
} from '../parsers/famousStarsSeed';
import { keepStar } from './supplementTaper';
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
  STAR_CATALOG_DATA_PREFIX,
  STAR_COLORIDX_MIN,
  STAR_COLORIDX_STEP,
  STAR_COLORIDX_LEVELS,
} from '../../src/data/starCatalog/starCatalogFormat';
import { STAR_BIN_CODEC } from '../../src/data/starCatalog/starBinCodec';
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

/**
 * Octree grid resolution — 10 bits/axis = 1024³ leaf cells. This fits the
 * locked SKST format with no version bump: a node's `mortonIndex` is a uint32
 * and 3×10 = 30 bits stay inside it, and the runtime reads `mortonBitsPerAxis`
 * + `cellEdgePc` from the header rather than assuming a resolution.
 */
const DEFAULT_MORTON_BITS = 10;

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
  tierBudgets?: Readonly<Record<Tier, number>>;
  /**
   * Optional progress sink for the tier search. The tier phase is otherwise
   * silent for tens of minutes on the real catalog (every probe is a
   * multi-second octree-build + gzip), so `buildTier` emits one preformatted
   * line per probe and one per tier completion. It is threaded *in* rather than
   * writing `process.stderr` directly to keep `buildStarCatalog` pure over its
   * inputs — the CLI supplies a stderr sink, tests omit it and stay silent.
   */
  onProgress?: (line: string) => void;
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
    onProgress,
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
      appMag: row.gMag,
      isSupplement: false,
    });
  }

  // ── GCNS-only rows: the faint nearby stars the G<14 cut never saw ─────────
  // A GCNS row whose source_id is already a main row contributed only its
  // distance (joined above); here we add the ones with no main counterpart as
  // supplement stars, tagged so tier truncation never drops them.
  //
  // Before a supplement row joins the population it passes the outer-edge taper
  // (`keepStar`): the supplement stops abruptly at ~100 pc, so its members are
  // thinned probabilistically over the outer 30 pc to fade into the survey floor
  // rather than end in a hard shell (see supplementTaper.ts for the measured
  // step). The decision is a pure hash of `source_id`, so it is taken ONCE here —
  // before tier selection — and every tier sees the same tapered set. `distPc`
  // is the GCNS row's already-parsec distance, equal to `|position|`.
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
      appMag: row.gMag,
      isSupplement: true,
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
      appMag: row.hpMag,
      isSupplement: false,
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
  // The grid, the pre-quantized leaves, and every tier below are all built from
  // THIS `stars` array, so capping it here guarantees no surviving star can land
  // outside the tightened grid (see MAX_STAR_DISTANCE_PC for the measured
  // evidence). `filter` preserves order, which the later stable sorts observe.
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

  // ── Grid geometry from the population bounds (shared by every tier) ────────
  const grid = deriveGrid(stars, mortonBitsPerAxis);

  // Pre-quantize every star once; tiers select subsets of these leaf records.
  const quantized = stars.map((s) => quantizeStar(s, grid));

  // Partition into the always-kept supplement and the truncatable main set,
  // the latter sorted brightest-first so truncation drops the faintest.
  const supplement: OctreeLeafStar[] = [];
  const mainWithMag: { leaf: OctreeLeafStar; appMag: number }[] = [];
  for (let i = 0; i < stars.length; i++) {
    const star = stars[i]!;
    if (star.isSupplement) supplement.push(quantized[i]!);
    else mainWithMag.push({ leaf: quantized[i]!, appMag: star.appMag });
  }
  mainWithMag.sort((a, b) => a.appMag - b.appMag);
  const mainLeaves = mainWithMag.map((m) => m.leaf);

  // One `k → compressedBytes` probe cache shared across all three tier searches.
  // Compressed size is monotonic non-decreasing in `k`, so the three budgets are
  // three thresholds on a single `size(k)` curve; every search starts at the same
  // high midpoints and only narrows toward its own budget boundary near the end.
  // Sharing the cache means those expensive high-`k` probes (the multi-million-
  // star encodes each search would otherwise repeat) are measured once, not once
  // per tier — the bulk of the wall-clock saving. See `buildTier` for the
  // byte-determinism argument that this sharing is safe.
  const sizeCache = new Map<number, number>();
  const tiers: StarTierResult[] = [];
  for (const tier of TIERS) {
    tiers.push(
      await buildTier(
        tier,
        tierBudgets[tier],
        supplement,
        mainWithMag,
        mainLeaves,
        grid,
        sizeCache,
        onProgress,
      ),
    );
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
 *
 * ── The shared probe cache and why it is byte-identical ────────────────────
 *
 * The three tier searches are independent binary searches over the *same*
 * monotonic `size(k)` curve, so they re-probe many identical `k` — in
 * particular every search opens on the same high midpoints (`mainCount/2`,
 * `/4`, …) whose multi-million-star encodes are the single most expensive
 * probes in the whole build. `sizeCache` (keyed on `k`, shared across all three
 * tiers by the caller) measures each such `k` exactly once.
 *
 * This caches ONLY the measured byte size — a number — and the binary search
 * below is byte-for-byte the search that ran before: same range `[0, mainCount]`,
 * same `mid = (lo + hi) >> 1`, same `size(mid) <= budget` comparison, same
 * largest-passing-`k` result. `encodeFor` is a deterministic pure function of
 * `k`, so a cached size equals a freshly measured one; the search therefore
 * selects the identical `k` per tier and the emitted `.bin` bytes + reported
 * `gCutMag` are unchanged. The determinism guarantee rests on sharing only the
 * exact size at a given `k` — never a narrowed search range and never a cheaper
 * proxy codec (e.g. gzip level 1), either of which could pick a neighbouring
 * `k` at a gzip non-monotonicity and change the locked output bytes.
 */
async function buildTier(
  tier: Tier,
  budgetBytes: number,
  supplement: readonly OctreeLeafStar[],
  mainWithMag: readonly { leaf: OctreeLeafStar; appMag: number }[],
  mainLeaves: readonly OctreeLeafStar[],
  grid: StarOctreeGrid,
  sizeCache: Map<number, number>,
  onProgress?: (line: string) => void,
): Promise<StarTierResult> {
  const report = onProgress ?? (() => {});
  const encodeFor = async (k: number) => {
    const selection = [...supplement, ...mainLeaves.slice(0, k)];
    // buildStarOctree throws unless input is ascending by Morton code.
    const sorted = [...selection].sort((a, b) => a.mortonIndex - b.mortonIndex);
    const catalog = buildStarOctree(sorted, grid);
    const encoded = await encodeStarCatalog(catalog);
    const rawBytes = HEADER_BYTES + catalog.nodeCount * NODE_BYTES + catalog.records.length;
    return { catalog, encoded, rawBytes, compressedBytes: encoded.byteLength };
  };

  // Compressed size at brightest-`k`, memoized across every tier's search. A
  // miss pays the full octree-build + gzip to *measure* the size; only the size
  // is retained (the catalog + encoded blob for the chosen `k` is materialized
  // once after the search, keeping the cache to a handful of numbers rather than
  // multiple gigabytes of held-open catalogs at the real 16.5 M-star scale).
  const probeSize = async (k: number): Promise<number> => {
    const cached = sizeCache.get(k);
    if (cached !== undefined) return cached;
    const size = (await encodeFor(k)).compressedBytes;
    sizeCache.set(k, size);
    return size;
  };

  const mainCount = mainLeaves.length;
  let best = 0;
  let lo = 0;
  let hi = mainCount;
  let encodes = 0; // fresh octree+gzip probes this tier paid for (cache misses)
  let hits = 0; // probes served from the shared cross-tier cache
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const cached = sizeCache.has(mid);
    const t0 = performance.now();
    const size = await probeSize(mid);
    const ms = performance.now() - t0;
    if (cached) hits++;
    else encodes++;
    report(
      `  [stars ${tier}] probe k=${mid.toLocaleString()} → ` +
        `${size.toLocaleString()} B ${size <= budgetBytes ? '≤' : '>'} ` +
        `budget ${budgetBytes.toLocaleString()} B  ` +
        `[${cached ? 'cache-hit' : 'encode'} ${ms.toFixed(0)}ms]\n`,
    );
    if (size <= budgetBytes) {
      best = mid;
      lo = mid + 1;
    } else {
      hi = mid - 1;
    }
  }

  // Materialize the chosen `k` once: the search retained only measured sizes, so
  // the winner's catalog + encoded payload is produced here by a single encode
  // at `best` (a small, in-budget selection). `best = 0` reproduces the original
  // supplement-only floor when even the empty main set overshoots the budget.
  const bestEnc = await encodeFor(best);

  const gCutMag = best > 0 ? mainWithMag[best - 1]!.appMag : null;
  report(
    `  [stars ${tier}] selected k=${best.toLocaleString()}, ` +
      `${gCutMag === null ? 'supplement-only' : `G≤${gCutMag.toFixed(2)}`}, ` +
      `${bestEnc.compressedBytes.toLocaleString()} B ` +
      `(${encodes} encodes, ${hits} cache hits, +1 final encode)\n`,
  );
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

  process.stderr.write('building star catalog (dedup + octree + tiers)…\n');
  const result = await buildStarCatalog({
    gaia,
    gcns,
    hipparcos: hip.rows,
    hipNonPositivePlx: hip.skipped,
    hipToSourceId,
    famousGaiaIds,
    // Stream the tier-search progress to stderr so the minutes-long probe phase
    // is no longer silent. The sink lives here (the impure CLI), keeping
    // `buildStarCatalog` pure over its inputs.
    onProgress: (line) => process.stderr.write(line),
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
      `hipGaiaSubtracted ${drops.hipGaiaSubtracted.toLocaleString()}, ` +
      `farDistance ${drops.farDistance.toLocaleString()}, ` +
      `noPhotometry ${drops.noPhotometry.toLocaleString()}; ` +
      `clamps absMag ${clamps.absMag.toLocaleString()}, colorIdx ${clamps.colorIdx.toLocaleString()}\n`,
  );

  const starOutDir = join(outDir, STAR_CATALOG_DATA_PREFIX);
  mkdirSync(starOutDir, { recursive: true });

  let anyOverBudget = false;
  for (const t of result.tiers) {
    if (t.overBudget) anyOverBudget = true;
    const filename = `stars-${t.tier}.bin`;
    const outPath = resolve(starOutDir, filename);
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
