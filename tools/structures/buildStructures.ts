#!/usr/bin/env node
/**
 * buildStructures — assemble the featured-structure coverage layer.
 *
 * Reads:
 *   - `data/raw/mcxc/mcxc.dat`             (MCXC X-ray cluster catalog)
 *   - `data/raw/mscc/mscc.dat`             (MSCC supercluster catalog)
 *   - `data/seeds/structure_anchors.seed.json`     (featured curated anchors)
 *
 * Writes:
 *   - `public/data/structure-catalog/v1/structures.ccat`       (StructureCatalog binary, renderer input)
 *   - `public/data/structure-catalog/v1/structures_meta.json`  (per-localIdx id/names/abell/description)
 *
 * The two artefacts are index-parallel: record i in the .ccat corresponds
 * to entry i in the meta JSON, allowing the runtime to look up human-readable
 * metadata by the localIdx the pick-renderer returns.
 *
 * Run order: after `npm run build-tiers` (the structure build is independent of
 * the galaxy .bin files but shares the same `public/data/` output directory).
 * The npm script is `build-structures`.
 *
 * ## Filtering strategy
 *
 * Both MCXC and MSCC are filtered to a manageable display set before encoding:
 *
 *   MCXC: z ≤ Z_MAX AND M500 ≥ MCXC_M500_MIN
 *     → keeps the most massive X-ray clusters within the local universe volume
 *
 *   MSCC: z ≤ Z_MAX AND Nm ≥ MSCC_NM_MIN
 *     → keeps the richest superclusters by member-cluster count
 *
 * Featured anchors (from the seed JSON) win over catalog bulk entries: any
 * bulk entry within a featured anchor's exclusion sphere is dropped so the
 * same structure never appears twice (curated-wins rule).
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { parseMcxc, type McxcRow } from '../parsers/parseMcxc';
import { parseMscc, type MsccRow } from '../parsers/parseMscc';
import { parseStructureSeed, type StructureSeedEntry } from '../parsers/parseStructureSeed';
import {
  encodeStructureCatalog,
  STRUCTURE_CATALOG_DATA_PREFIX,
} from '../../src/data/structure/structureCatalogFormat';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { writeMetaSidecar } from '../curation/writeMetaSidecar';
import { dedupeByProximity } from '../curation/dedupeByProximity';
import { raDecDistToEqCart } from '../../src/utils/math/raDecDistToEqCart';
import { redshiftToDistanceMpc } from '../../src/utils/math/redshiftToDistanceMpc';
import { H0_KM_S_MPC } from '../../src/utils/math/constants';
import type { StructureCatalog } from '../../src/@types/data/structure/StructureCatalog';
import type { StructureCategoryByte } from '../../src/@types/data/structure/StructureCatalog';
import type { Vec3 } from '../../src/@types/math/Vec3';

// ── Tunable threshold constants ───────────────────────────────────────────────
//
// These constants control which catalog rows are included in the build output.
// Tuned from the actual M500 / Nm distributions in the MCXC and MSCC catalogs
// (the per-constant docs below record the surviving counts at each threshold).

/**
 * Minimum M500 mass (× 10^14 M☉) for an MCXC cluster to be included.
 *
 * 2.0 × 10^14 M☉ keeps the genuinely massive X-ray clusters within the
 * local-universe volume — ~282 clusters at z ≤ 0.15.  This is the rich-
 * cluster regime (Coma, Perseus, the Shapley / Hercules / Corona Borealis
 * members); the cluster/group dividing line sits lower (~1.0 × 10^14), and
 * cutting there pulls in group-scale systems that crowd the marker layer
 * without adding recognisable structure.  The full-sky count stays trivial
 * for the marker renderer (hundreds of instanced quads, orders of magnitude
 * below the galaxy path).
 */
const MCXC_M500_MIN = 2.0;

/**
 * Minimum member-cluster count (Nm) for an MSCC supercluster to be included.
 *
 * Tuning: all 601 MSCC rows fall within z ≤ 0.15. Nm spans [2, 42].
 * Nm ≥ 6 gives 91 superclusters (≈ top-75 target; the plan confirms ≈6
 * was expected to land ~75 — actual count is 91 due to the discrete
 * distribution). This covers the rich superclusters: Shapley, Perseus–Pisces,
 * Horologium–Reticulum, Corona Borealis, etc.
 */
const MSCC_NM_MIN = 6;

/**
 * Maximum redshift for structures in both catalogs.
 * Corresponds to ~600 Mpc — the local-universe volume where cluster and
 * supercluster structures are well-resolved in the renderer.
 */
const Z_MAX = 0.15;

/**
 * Factor that converts a cluster's physical R500 radius into its apparent
 * (named, visual) radius on screen.  R500 is the dense X-ray core (~1 Mpc for
 * our M500 ≥ 2e14 cut), but the structure a reader pictures when they see a
 * cluster name is the galaxy-membership cloud — roughly the R200 virial radius
 * (~1.5 × R500) out to the Abell / infall extent (~2–3 × R500).  2.5 puts the
 * ring in that R200→Abell band so it traces the visible cluster rather than
 * the core, and lands the catalog at a legible on-screen size (median ~5 px at
 * the 98–619 Mpc distances these clusters sit at) instead of a sub-readable
 * ~3 px.  `physicalRadiusMpc` stays at R500 for the membership/proximity math
 * — only the visual ring grows.
 */
const APPARENT_MULTIPLE = 2.5;

/**
 * Minimum proximity floor for the curated-vs-bulk dedup step (Mpc).
 *
 * Anchors with a tiny apparentRadiusMpc (e.g. very compact featured POIs)
 * still suppress bulk duplicates within this floor distance, preventing
 * a catalog entry 1 Mpc away from a curated anchor from sneaking through
 * just because the anchor's radius is small.
 */
const DEDUPE_FLOOR_MPC = 3;

// ── h70 unit-conversion factor ────────────────────────────────────────────────
//
// MSCC `dmaxMpc` is published in h70^-1 Mpc (h70 = H0 / 70).  A value in
// h70^-1 Mpc is physical Mpc divided by h70, so converting back to physical
// Mpc means dividing the catalogue number by h70.
//
// With H0 = 70 km/s/Mpc, h70 = 1.0, so the conversion is a no-op numerically.
// We compute it from the shared H0 constant anyway so the code stays correct
// if H0 is ever revised in constants.ts.
const H70 = H0_KM_S_MPC / 70;

// ── Public types ──────────────────────────────────────────────────────────────

/**
 * Intermediate build representation for a single cluster or supercluster
 * before it is encoded into the .ccat binary.  Carries human-readable
 * metadata alongside the numeric fields so callers can build the meta JSON
 * from the same objects, guaranteeing index alignment.
 */
export type StructureBuildEntry = {
  /** URL-safe slug of names[0] — becomes the localIdx lookup key at runtime. */
  id: string;
  /** Equatorial-Cartesian world position in Mpc. */
  worldPos: Vec3;
  /** Core radius (R500 for clusters; dmax/2 for superclusters). */
  physicalRadiusMpc: number;
  /** Visual / named extent radius (APPARENT_MULTIPLE × R500 for clusters). */
  apparentRadiusMpc: number;
  /** Raw mass proxy: M500 (10^14 M☉) for clusters, Nm for superclusters. */
  significance: number;
  /** 0 = cluster (MCXC), 1 = supercluster (MSCC). */
  category: StructureCategoryByte;
  /** Display names; names[0] is the primary label shown in the UI. */
  names: string[];
  /** Normalized Abell/ACO designation, e.g. 'A2670' or 'S0805', or null. */
  abell: string | null;
  /** Generated one-liner description shown in the POI info panel. */
  description: string;
};

// ── Helpers ───────────────────────────────────────────────────────────────────

/**
 * Derive an equatorial-Cartesian world position from RA in DEGREES and Dec
 * in degrees, at the comoving distance corresponding to redshift z.
 *
 * MCXC and MSCC publish RA in decimal degrees (unlike the raHours convention
 * in SkyCoord).  We apply the conversion manually rather than calling
 * raDecDistToEqCart (which expects raHours) to be explicit about the frame.
 *
 * Standard spherical → Cartesian (right-handed, J2000 equatorial frame):
 *   x = d · cos(RA_rad) · cos(Dec_rad)
 *   y = d · sin(RA_rad) · cos(Dec_rad)
 *   z = d · sin(Dec_rad)
 */
function raDegDecToWorldPos(raDeg: number, decDeg: number, z: number): Vec3 {
  const d = redshiftToDistanceMpc(z);
  const RAD = Math.PI / 180;
  const ra = raDeg * RAD;
  const dec = decDeg * RAD;
  const cosDec = Math.cos(dec);
  return [d * Math.cos(ra) * cosDec, d * Math.sin(ra) * cosDec, d * Math.sin(dec)];
}

/**
 * Convert a display name to a URL-safe slug: lowercase, spaces and
 * non-alphanumeric ASCII replaced with hyphens, duplicate hyphens collapsed,
 * leading/trailing hyphens stripped.
 *
 * Examples: 'A2670' → 'a2670', 'MSCC 42' → 'mscc-42',
 *           'RXC J0000.1+0816' → 'rxc-j0000-1-0816'.
 */
function toSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

/**
 * Return unique non-empty strings from `candidates` in input order,
 * skipping any that are blank after trimming.
 */
function uniqueNonEmpty(...candidates: string[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const s of candidates) {
    const t = s.trim();
    if (t && !seen.has(t)) {
      seen.add(t);
      out.push(t);
    }
  }
  return out;
}

// ── Exported pure functions ───────────────────────────────────────────────────

/**
 * Scan `aName` then `oName` for an Abell/ACO cluster designation and return
 * the normalized token (e.g. 'A2670', 'S805') or null.
 *
 * MCXC homogenises Abell designations in the AName column as 'ANNNN'
 * (rich northern Abell catalog) or 'SNNNN' (ACO southern supplement);
 * the OName column occasionally carries them too.  163 of 710 A/S rows
 * use zero-padded four-digit form ('A0007', 'S0026'); we strip the leading
 * zeros so the output matches the conventional astronomical form ('A7', 'S26')
 * and the non-zero-padded ids used in the featured seed ('A426', 'A1656').
 *
 * Matching: find the first token of the form `[AS]` followed by optional
 * spaces and 1–4 digits in `aName`, else in `oName`.  The `0*` quantifier
 * before `\d{1,4}` absorbs any leading zeros; spaces are removed.
 *
 * Preference: aName before oName — the AName column is the MCXC-curated
 * alternate name and more reliable as the primary designation.
 */
export function extractAbell(oName: string, aName: string): string | null {
  // Match [AS] optionally followed by whitespace, optional leading zeros,
  // then 1–4 significant digits.  Word boundary prevents matching 'GAS1234'.
  // Leading zeros are consumed by 0* so A0007 → 'A7', A2670 → 'A2670'.
  const RE = /\b([AS])\s*0*(\d{1,4})\b/;
  const fromAName = aName.match(RE);
  if (fromAName) return `${fromAName[1]}${fromAName[2]}`;
  const fromOName = oName.match(RE);
  if (fromOName) return `${fromOName[1]}${fromOName[2]}`;
  return null;
}

/**
 * Build the intermediate `StructureBuildEntry[]` from raw MCXC rows, raw MSCC
 * rows, and a curated featured-anchor seed.
 *
 * Steps:
 *   1. Filter and map MCXC → cluster entries (category 0).
 *   2. Filter and map MSCC → supercluster entries (category 1).
 *   3. Build featured anchor list from the seed (worldPos + apparentRadiusMpc).
 *   4. Dedup bulk entries against featured anchors (curated-wins rule).
 *   5. Return surviving entries in [clusters…, superclusters…] order.
 */
export function buildClusterEntries(
  mcxc: readonly McxcRow[],
  mscc: readonly MsccRow[],
  featuredSeed: readonly StructureSeedEntry[],
): StructureBuildEntry[] {
  // ── Step 1: MCXC → cluster entries ────────────────────────────────────────
  const clusterEntries: StructureBuildEntry[] = [];
  for (const row of mcxc) {
    if (row.z > Z_MAX || row.m500 < MCXC_M500_MIN) continue;

    const worldPos = raDegDecToWorldPos(row.raDeg, row.decDeg, row.z);
    const physicalRadiusMpc = row.r500Mpc;
    const apparentRadiusMpc = APPARENT_MULTIPLE * row.r500Mpc;
    const abell = extractAbell(row.oName, row.aName);

    // Name priority: Abell → aName → oName → MCXC id.
    // When an Abell designation is found it becomes names[0] (the displayed
    // label); the other non-empty names are appended as alternatives.
    let names: string[];
    if (abell) {
      names = [abell, ...uniqueNonEmpty(row.aName, row.oName).filter((n) => n !== abell)];
    } else {
      const best = uniqueNonEmpty(row.aName, row.oName)[0] ?? row.id;
      names = [best];
    }

    const id = toSlug(names[0]!);
    const description = `X-ray cluster · M500 = ${row.m500.toFixed(1)}×10¹⁴ M☉ · z = ${row.z.toFixed(3)}`;

    clusterEntries.push({
      id,
      worldPos,
      physicalRadiusMpc,
      apparentRadiusMpc,
      significance: row.m500,
      category: 0,
      names,
      abell,
      description,
    });
  }

  // ── Step 2: MSCC → supercluster entries ───────────────────────────────────
  const scEntries: StructureBuildEntry[] = [];
  for (const row of mscc) {
    if (row.z > Z_MAX || row.nm < MSCC_NM_MIN) continue;

    const worldPos = raDegDecToWorldPos(row.raDeg, row.decDeg, row.z);

    // dmax is in raw h70^-1 Mpc.  Convert to physical Mpc (÷ h70), then halve
    // to get a centroid radius (dmax is a diameter: max pair separation).
    const radiusMpc = row.dmaxMpc / H70 / 2;

    const id = toSlug(row.id);
    const description = `Supercluster · ${row.nm} member clusters · z = ${row.z.toFixed(3)}`;

    scEntries.push({
      id,
      worldPos,
      physicalRadiusMpc: radiusMpc,
      apparentRadiusMpc: radiusMpc,
      significance: row.nm,
      category: 1,
      names: [row.id],
      abell: null,
      description,
    });
  }

  // ── Step 3: featured anchor list from seed ────────────────────────────────
  const featuredAnchors = featuredSeed.map((e) => ({
    worldPos: raDecDistToEqCart(e),
    radiusMpc: e.apparentRadiusMpc,
  }));

  // ── Step 4: dedup bulk entries against featured anchors ───────────────────
  const allBulk = [...clusterEntries, ...scEntries];
  return dedupeByProximity(featuredAnchors, allBulk, DEDUPE_FLOOR_MPC);
}

// ── Meta sidecar type ─────────────────────────────────────────────────────────

type StructureMetaEntry = {
  id: string;
  names: string[];
  abell: string | null;
  description: string;
};

function toMeta(e: StructureBuildEntry): StructureMetaEntry {
  return { id: e.id, names: e.names, abell: e.abell, description: e.description };
}

// ── main ──────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const outDir = resolve('public/data', STRUCTURE_CATALOG_DATA_PREFIX);
  mkdirSync(outDir, { recursive: true });

  // ── Parse raw catalogs ─────────────────────────────────────────────────────
  process.stderr.write('parsing MCXC…\n');
  const mcxcRaw = readFileSync(rawDataPath('mcxc.table'), 'utf8');
  const mcxcRows = parseMcxc(mcxcRaw);
  process.stderr.write(`  parsed ${mcxcRows.length} MCXC rows\n`);

  process.stderr.write('parsing MSCC…\n');
  const msccRaw = readFileSync(rawDataPath('mscc.table'), 'utf8');
  const msccRows = parseMscc(msccRaw);
  process.stderr.write(`  parsed ${msccRows.length} MSCC rows\n`);

  process.stderr.write('parsing cluster seed…\n');
  const seedRaw = readFileSync(rawDataPath('structures.seed'), 'utf8');
  const seed = parseStructureSeed(seedRaw);
  process.stderr.write(`  loaded ${seed.length} featured seed entries\n`);

  // ── Build entries ──────────────────────────────────────────────────────────
  process.stderr.write('building cluster entries…\n');
  const entries = buildClusterEntries(mcxcRows, msccRows, seed);
  const nClusters = entries.filter((e) => e.category === 0).length;
  const nSC = entries.filter((e) => e.category === 1).length;
  process.stderr.write(
    `  ${entries.length} total (${nClusters} clusters, ${nSC} superclusters) after dedup\n`,
  );

  // ── Encode .ccat binary ────────────────────────────────────────────────────
  const count = entries.length;
  const positions = new Float32Array(count * 3);
  const physicalRadiusMpc = new Float32Array(count);
  const apparentRadiusMpc = new Float32Array(count);
  const significance = new Float32Array(count);
  const category = new Uint8Array(count);

  for (let i = 0; i < count; i++) {
    const e = entries[i]!;
    positions[i * 3 + 0] = e.worldPos[0];
    positions[i * 3 + 1] = e.worldPos[1];
    positions[i * 3 + 2] = e.worldPos[2];
    physicalRadiusMpc[i] = e.physicalRadiusMpc;
    apparentRadiusMpc[i] = e.apparentRadiusMpc;
    significance[i] = e.significance;
    category[i] = e.category;
  }

  const catalog: StructureCatalog = {
    count,
    positions,
    physicalRadiusMpc,
    apparentRadiusMpc,
    significance,
    category,
  };

  const buf = encodeStructureCatalog(catalog);
  writeFileSync(resolve(outDir, 'structures.ccat'), Buffer.from(buf));
  process.stderr.write(`wrote structures.ccat (${buf.byteLength} bytes, ${count} records)\n`);

  // ── Write meta sidecar ─────────────────────────────────────────────────────
  writeMetaSidecar(entries.map(toMeta), resolve(outDir, 'structures_meta.json'));
  process.stderr.write('wrote structures_meta.json\n');
}

// Allow the script to be both executed (CLI) and imported (tests).
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  main().catch((err: unknown) => {
    process.stderr.write(`error: ${err instanceof Error ? err.message : String(err)}\n`);
    process.exit(1);
  });
}
