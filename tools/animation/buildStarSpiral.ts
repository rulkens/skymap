/**
 * buildStarSpiral — bake the "star spiral" camera path.
 *
 * The runtime clip that flies the camera on an outward spiral from the Sun does
 * not want to reason about the Gaia catalogue at play time: it wants an ordered
 * list of real stars to visit. This script produces that list offline. It lays
 * an *ideal* geometric spiral over the neighbourhood (`sampleConicalSpiral`),
 * snaps the brightest real star in each corridor onto it (`pickSpiralCorridorStars`),
 * stamps any curated famous star it lands on, and writes the result as a
 * generated TS module the clip imports.
 *
 * ── The pipeline, and where each concern lives ─────────────────────────────
 *
 *   decode stars-<tier>.bin  →  reconstruct leaf-star positions (parsecs)
 *     →  merge curated famous stars as first-class candidates (dedup vs Gaia)
 *     →  sample the ideal spiral at a fixed ARC-LENGTH cadence
 *     →  corridor-snap the brightest per sample, min-leg apart
 *     →  stamp famous identity  →  drop duplicate famous ids  →  emit Mpc waypoints
 *
 * The two geometry decisions — the spiral shape and the snap rule — are pure
 * functions under `tools/utils/animation/`, tested in isolation. This script is
 * the impure composition: it owns the file read, the star-catalogue octree walk,
 * the famous-star merge, and the code-gen. Nothing here is clever; every
 * non-trivial rule is in one of the two helpers.
 *
 * ── Why famous stars are BOTH candidates and a post-hoc stamp ──────────────
 *
 * A curated famous star (Sirius, Vega, …) should be *visited with its identity*
 * when the spiral passes near it, not merely labelled if a nearby anonymous Gaia
 * point happened to get picked. So the famous stars are merged into the candidate
 * pool as first-class stars (carrying their id + name), and any Gaia candidate
 * sitting essentially on top of one is dropped first so the same star isn't in the
 * pool twice. Separately, a picked *anonymous* Gaia star that lands within a small
 * radius of a famous star still gets that identity stamped — the catalogue's own
 * measurement of the same star, matched back to the curated name.
 *
 * ── Determinism ────────────────────────────────────────────────────────────
 *
 * No randomness anywhere: the octree walk visits nodes and records in on-disk
 * order, the famous merge is seed order, and the picker's ties break by candidate
 * index. The same input `.bin` therefore emits a byte-identical waypoint file.
 *
 * Run via `npm run build-star-spiral`. It fails loudly (non-zero exit) if the bin
 * is missing/undecodable or fewer than `MIN_WAYPOINTS` stars snap onto the path —
 * a spiral that visits almost nothing is a broken parameter set, not a shippable
 * clip.
 *
 * ── Tier ────────────────────────────────────────────────────────────────────
 *
 * `--tier <small|medium|large>` selects which baked catalogue tier the corridor
 * snap draws from (default `medium` — the shipped clip is baked against it so the
 * runtime waypoints match a mid-density starfield the viewer actually sees). A
 * denser tier has more snap candidates, so the same corridor width picks more
 * stars; the tier is the only knob that changes the candidate pool, so it is a
 * CLI flag rather than a source edit.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import type { Vec3 } from '../../src/@types/math/Vec3';
import {
  decodeStarCatalog,
  unpackStarRecord,
  lutIndexToAbsMag,
  RECORD_BYTES,
  STAR_OFFSET_LEVELS,
} from '../../src/data/starCatalog/starCatalogFormat';
import { mortonDecode3 } from '../../src/utils/math/mortonDecode3';
import { raDecDistToCartesian } from '../../src/utils/math/raDecDistToCartesian';
import { SCALE_UNITS } from '../../src/data/scaleUnits';
import { FAMOUS_STARS_GENERATED } from '../../src/data/bodies/famousStars.generated';
import { sampleConicalSpiral } from '../utils/animation/sampleConicalSpiral';
import { pickSpiralCorridorStars } from '../utils/animation/pickSpiralCorridorStars';

// ── Spiral parameters ───────────────────────────────────────────────────────
// r0/r1 in parsecs; the path climbs from the inner edge out to the near-field
// edge. The inner edge is 10 pc, not a single parsec: the innermost turns are
// where the curvature demand is worst (tiny circumference, tightest bends), so
// starting the winding further out drops the camera into the spiral where it can
// already fly smoothly instead of clawing around a sub-parsec knot.
const R0_PC = 10;
const R1_PC = 400;
const TURNS = 7;
const INCLINE_RAD = (20 * Math.PI) / 180;
// Arc-length cadence: one sample every SPACING_PC of path. Chosen so the total
// spiral length (~a few thousand pc) yields a candidate-sample count that snaps
// into the 150–250-waypoint target band. Because samples are arc-length-uniform
// (not t-uniform), this is a genuine physical cadence — the same parsecs of path
// between every consecutive sample, inner turns included.
const SPACING_PC = 20;
const CORRIDOR_FRAC = 0.22;

// A pick must sit at least this far (pc) from the previous pick. Kills the
// sub-parsec cusp legs the old t-uniform bake produced (leg lengths ran down to
// 0.02 pc), and drops accidental near-duplicates — a famous star's own Gaia twin
// included — by construction rather than by a post-hoc filter.
const MIN_LEG_PC = 2;

/** Keep only stars within this factor of the outer radius as snap candidates. */
const CANDIDATE_RADIUS_FACTOR = 1.2;

/** A Gaia star within this distance (pc) of a famous star IS that star — drop it. */
const FAMOUS_DEDUP_PC = 0.1;

/** A picked Gaia star within this distance (pc) of a famous star inherits its id. */
const FAMOUS_MATCH_PC = 0.5;

/** Fewer picks than this means the parameters are broken — fail the build. */
const MIN_WAYPOINTS = 150;

/** A snap candidate: a star position + brightness, optionally a famous identity. */
type SpiralCandidate = {
  readonly posPc: Vec3;
  readonly absMag: number;
  readonly famousId?: string;
  readonly name?: string;
};

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const OUT_PATH = join(repoRoot, 'src/data/animation/clips/starSpiralWaypoints.generated.ts');

/** The catalogue tiers a bake can draw its snap candidates from. */
const TIERS = ['small', 'medium', 'large'] as const;
type StarTier = (typeof TIERS)[number];

/**
 * Read `--tier <small|medium|large>` from argv, defaulting to `medium` (the
 * shipped clip's tier). Hand-rolled rather than via `parseFlags` because that
 * helper is boolean-only by design — a string-valued flag stays in a bespoke
 * argv loop (see its module header). An unknown value fails loudly: silently
 * baking against the wrong tier would drift the clip from the starfield it ships
 * with.
 */
function parseTier(argv: readonly string[]): StarTier {
  const i = argv.indexOf('--tier');
  if (i === -1) return 'medium';
  const value = argv[i + 1];
  if (value === undefined || !TIERS.includes(value as StarTier)) {
    throw new Error(`--tier expects one of ${TIERS.join('|')}, got ${value ?? '(nothing)'}`);
  }
  return value as StarTier;
}

/** Squared euclidean distance between two parsec positions. */
function distSqPc(a: Vec3, b: Vec3): number {
  const dx = a[0] - b[0];
  const dy = a[1] - b[1];
  const dz = a[2] - b[2];
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Reconstruct every real (leaf) star inside `radiusPc` of the Sun as a candidate.
 * Aggregate records (interior nodes, `childMask !== 0`) are flux mips, not real
 * stars, so they're skipped. The position math is the exact inverse the renderer
 * and `resolveStarRecord` use: node box origin + in-cell offset, both scaled by
 * the node's `cellEdgePc · 2^level` box edge.
 */
function reconstructGaiaCandidates(
  catalog: Awaited<ReturnType<typeof decodeStarCatalog>>,
  radiusPc: number,
): SpiralCandidate[] {
  const { nodes, records, cellEdgePc, gridOrigin } = catalog;
  const [gx, gy, gz] = gridOrigin;
  const boundSq = radiusPc * radiusPc;
  const out: SpiralCandidate[] = [];

  for (const node of nodes) {
    if (node.childMask !== 0) continue; // aggregate flux mip, not a real star
    const boxEdgePc = cellEdgePc * 2 ** node.level;
    const [cx, cy, cz] = mortonDecode3(node.mortonIndex);
    const ox = gx + cx * boxEdgePc;
    const oy = gy + cy * boxEdgePc;
    const oz = gz + cz * boxEdgePc;

    const end = node.firstRecord + node.recordCount;
    for (let rec = node.firstRecord; rec < end; rec++) {
      const { offset, absMagIdx } = unpackStarRecord(records, rec * RECORD_BYTES);
      const px = ox + (offset[0] / STAR_OFFSET_LEVELS) * boxEdgePc;
      const py = oy + (offset[1] / STAR_OFFSET_LEVELS) * boxEdgePc;
      const pz = oz + (offset[2] / STAR_OFFSET_LEVELS) * boxEdgePc;
      if (px * px + py * py + pz * pz > boundSq) continue;
      out.push({ posPc: [px, py, pz], absMag: lutIndexToAbsMag(absMagIdx) });
    }
  }
  return out;
}

/**
 * The curated famous stars as candidates, in parsecs. The Sun (distance 0) is
 * dropped — it is the origin, not a star to fly to — as is anything past the
 * candidate radius. `raDecDistToCartesian` is unit-agnostic in its distance
 * argument, so feeding it parsecs returns parsecs (the star-catalogue frame).
 */
function famousCandidates(radiusPc: number): SpiralCandidate[] {
  const out: SpiralCandidate[] = [];
  for (const row of FAMOUS_STARS_GENERATED) {
    if (row.distancePc <= 0) continue; // the Sun / placeless rows
    if (row.distancePc > radiusPc) continue;
    out.push({
      posPc: raDecDistToCartesian(row.raDeg, row.decDeg, row.distancePc),
      absMag: row.absMag,
      famousId: row.id,
      name: row.commonName,
    });
  }
  return out;
}

/** Drop Gaia candidates that sit essentially on top of a famous star. */
function dedupGaiaAgainstFamous(
  gaia: readonly SpiralCandidate[],
  famous: readonly SpiralCandidate[],
): SpiralCandidate[] {
  const dedupSq = FAMOUS_DEDUP_PC * FAMOUS_DEDUP_PC;
  return gaia.filter((g) => !famous.some((f) => distSqPc(g.posPc, f.posPc) <= dedupSq));
}

/**
 * Stamp a famous identity onto a picked anonymous Gaia star when it lands within
 * `FAMOUS_MATCH_PC` of one. A candidate that already carries an id (it IS a famous
 * candidate) passes through untouched.
 */
function stampFamous(
  picked: readonly SpiralCandidate[],
  famous: readonly SpiralCandidate[],
): SpiralCandidate[] {
  const matchSq = FAMOUS_MATCH_PC * FAMOUS_MATCH_PC;
  return picked.map((p) => {
    if (p.famousId !== undefined) return p;
    let best: SpiralCandidate | undefined;
    let bestSq = matchSq;
    for (const f of famous) {
      const dsq = distSqPc(p.posPc, f.posPc);
      if (dsq <= bestSq) {
        bestSq = dsq;
        best = f;
      }
    }
    if (best === undefined) return p;
    return { ...p, famousId: best.famousId, name: best.name };
  });
}

/**
 * A famous identity may appear at most once across the final itinerary. Two
 * distinct picks can carry the same `famousId` — a curated famous candidate AND
 * a separate Gaia measurement of that star stamped back to it — and flying to the
 * "same" star twice reads as the path stalling. The min-leg guard already drops
 * most such twins (they sit sub-parsec apart), but this keeps the guarantee
 * absolute: walk the picks in flight order and drop any whose `famousId` was
 * already emitted, keeping the first (nearest-to-the-Sun) occurrence.
 */
function dedupeFamousIdentity(picked: readonly SpiralCandidate[]): SpiralCandidate[] {
  const seen = new Set<string>();
  const out: SpiralCandidate[] = [];
  for (const p of picked) {
    if (p.famousId !== undefined) {
      if (seen.has(p.famousId)) continue;
      seen.add(p.famousId);
    }
    out.push(p);
  }
  return out;
}

/** Compact, deterministic number formatting for the generated source. */
function fmt(n: number): string {
  return Number(n.toPrecision(6)).toString();
}

/** Single-quoted, escaped string literal for the generated source. */
function quote(s: string): string {
  return `'${s.replace(/\\/g, '\\\\').replace(/'/g, "\\'")}'`;
}

function emitWaypoints(picked: readonly SpiralCandidate[]): string {
  const pcToMpc = SCALE_UNITS.PC_TO_MPC;
  const rows = picked
    .map((p) => {
      const at = `[${fmt(p.posPc[0] * pcToMpc)}, ${fmt(p.posPc[1] * pcToMpc)}, ${fmt(
        p.posPc[2] * pcToMpc,
      )}]`;
      const id = p.famousId !== undefined ? `, famousId: ${quote(p.famousId)}` : '';
      const name = p.name !== undefined ? `, name: ${quote(p.name)}` : '';
      return `  { at: ${at}${id}${name} },`;
    })
    .join('\n');

  return `/**
 * starSpiralWaypoints — GENERATED by \`npm run build-star-spiral\`. DO NOT EDIT.
 *
 * An ordered outward spiral of real stars, snapped from the Gaia catalogue onto
 * an ideal geometric spiral (see \`tools/animation/buildStarSpiral.ts\` for the
 * shape, the snap rule, and the parameters). Positions are heliocentric world
 * space in Megaparsecs; \`famousId\`/\`name\` are present where a snapped star
 * coincides with a curated famous star. Regenerate rather than hand-edit — any
 * manual change is overwritten on the next build.
 */

import type { StarSpiralWaypoint } from '../../../@types/animation/StarSpiralWaypoint';

export const STAR_SPIRAL_WAYPOINTS: readonly StarSpiralWaypoint[] = [
${rows}
];
`;
}

async function main(): Promise<void> {
  const tier = parseTier(process.argv.slice(2));
  const binPath = join(repoRoot, `public/data/stars-${tier}.bin`);
  let bytes: Buffer;
  try {
    bytes = readFileSync(binPath);
  } catch (err) {
    throw new Error(
      `cannot read ${binPath}: ${(err as Error).message}\n` +
        `Build or link the star catalogs first (npm run build-stars, or /link-data in a worktree).`,
    );
  }

  const arrayBuf = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  const catalog = await decodeStarCatalog(arrayBuf as ArrayBuffer);

  const candidateRadiusPc = R1_PC * CANDIDATE_RADIUS_FACTOR;
  const gaiaRaw = reconstructGaiaCandidates(catalog, candidateRadiusPc);
  const famous = famousCandidates(candidateRadiusPc);
  const gaia = dedupGaiaAgainstFamous(gaiaRaw, famous);

  // Famous stars lead the candidate list so they win ties against a coincident
  // Gaia measurement of the same brightness. Order is otherwise deterministic.
  const candidates: SpiralCandidate[] = [...famous, ...gaia];

  const samples = sampleConicalSpiral({
    r0: R0_PC,
    r1: R1_PC,
    turns: TURNS,
    spacingPc: SPACING_PC,
    inclineRad: INCLINE_RAD,
  });

  const picked = dedupeFamousIdentity(
    stampFamous(
      pickSpiralCorridorStars({
        samples,
        candidates,
        corridorFrac: CORRIDOR_FRAC,
        minLegPc: MIN_LEG_PC,
      }),
      famous,
    ),
  );

  if (picked.length < MIN_WAYPOINTS) {
    throw new Error(
      `only ${picked.length} stars snapped onto the spiral (need ≥ ${MIN_WAYPOINTS}). ` +
        `Widen CORRIDOR_FRAC, shrink SPACING_PC, add TURNS, or check the catalogue.`,
    );
  }

  writeFileSync(OUT_PATH, emitWaypoints(picked));

  const famousMatches = picked.filter((p) => p.famousId !== undefined);
  const radiiPc = picked.map((p) => Math.hypot(p.posPc[0], p.posPc[1], p.posPc[2]));
  const names = famousMatches
    .map((p) => p.name)
    .slice(0, 8)
    .join(', ');
  process.stderr.write(
    `star spiral [${tier}]: ${picked.length} waypoints, ${famousMatches.length} famous ` +
      `(${names}${famousMatches.length > 8 ? ', …' : ''}), ` +
      `radius ${Math.min(...radiiPc).toFixed(1)}–${Math.max(...radiiPc).toFixed(1)} pc\n` +
      `  wrote ${OUT_PATH}\n`,
  );
}

main().catch((err) => {
  process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
  process.exit(1);
});
