/**
 * auditCf4Anchors.ts — one-off diagnostic: does the CF-4 cube's data
 * actually contain overdensities at the positions of well-known clusters
 * (Virgo, Coma, Perseus, Norma/Great Attractor, Hercules, Shapley)?
 *
 * Two questions:
 *
 *   1.  Under the *current* build pipeline's interpretation of axis order
 *       (numpy axis 0 = SGX, axis 1 = SGY, axis 2 = SGZ), does the cube
 *       value at each anchor's expected voxel rank in the upper percentile
 *       of the full distribution?
 *
 *   2.  If not, which of the 48 axis-permutation × sign-flip variants
 *       produces the *best* anchor percentile, on average?  That variant
 *       reveals the correct interpretation.
 *
 * Output is plain text on stdout — no SCFD writes, no GPU, no UI.  This
 * is intentionally a throwaway analysis, not a production code path.
 * Once we know the right transform, the fix goes into `buildCf4Density.ts`
 * and this file can be deleted (or kept around as a regression check).
 *
 * Usage:
 *   npx tsx tools/auditCf4Anchors.ts
 */
import { readFileSync } from 'node:fs';
import { readNpy } from './parsers/npyReader';
import { SG_TO_EQ_MATRIX } from '../src/data/superGalacticTransform';
import {
  CLUSTER_ANCHORS,
  raDecDistToEqCart,
  type ClusterAnchor,
} from '../src/data/clusterAnchors';

const VOXEL_SIZE_MPC = 1000 / 128; // CF4++ box size / N
const DIMS = 128;
const ORIGIN_MPC = -VOXEL_SIZE_MPC * (DIMS / 2); // -500 Mpc on each axis

/** Apply 3×3 matrix to a vec3.  Input is `readonly` so callers can pass
 *  the immutable tuple returned by `raDecDistToEqCart` without a copy. */
function applyMat3(m: ReturnType<typeof getSgToEqMatrix>, v: readonly [number, number, number]): [number, number, number] {
  return [
    m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
    m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
    m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
  ];
}

function getSgToEqMatrix() {
  return SG_TO_EQ_MATRIX as readonly [readonly [number, number, number], readonly [number, number, number], readonly [number, number, number]];
}

/** Transpose of a 3×3 orthonormal matrix is its inverse. */
function transpose3(m: ReturnType<typeof getSgToEqMatrix>): ReturnType<typeof getSgToEqMatrix> {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

const EQ_TO_SG_MATRIX = transpose3(getSgToEqMatrix());

/** Eq Cartesian → SG Cartesian (Mpc, length-preserving). */
function eqToSg(eq: readonly [number, number, number]): [number, number, number] {
  return applyMat3(EQ_TO_SG_MATRIX, eq);
}

/**
 * Convert SG Cartesian (Mpc) → continuous voxel indices (i, j, k) in
 * the cube's *native* numpy axis order.  i is the slowest-varying axis,
 * k the fastest.  Build pipeline's CURRENT assumption: i=SGX, j=SGY, k=SGZ.
 *
 * The conversion places voxel-corner 0 at -500 Mpc and voxel-corner 128
 * at +500 Mpc, matching the symmetric origin set by buildCf4Density.ts.
 */
function sgToVoxelIndex(sg: [number, number, number]): [number, number, number] {
  return [
    (sg[0] - ORIGIN_MPC) / VOXEL_SIZE_MPC,
    (sg[1] - ORIGIN_MPC) / VOXEL_SIZE_MPC,
    (sg[2] - ORIGIN_MPC) / VOXEL_SIZE_MPC,
  ];
}

/**
 * Sample the cube at integer voxel indices (i, j, k) under a permutation
 * + sign-flip variant.  `perm` is a 3-tuple of which SG axis populates each
 * numpy axis; `signs` flips each numpy axis (so we can test mirroring too).
 *
 * Returns the cube value at that voxel, or null if out of bounds.
 */
function sampleVariant(
  values: Float64Array,
  voxelIdx: [number, number, number],
  perm: [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2],
  signs: [1 | -1, 1 | -1, 1 | -1],
): number | null {
  // Map SG axis indices through the permutation: numpy axis a holds SG
  // axis perm[a].  So to get numpy-axis-a coordinate from SG coordinates,
  // we read voxelIdx[perm[a]], optionally flipped about the cube centre.
  const npyIdx: [number, number, number] = [
    signs[0] === 1 ? voxelIdx[perm[0]] : DIMS - voxelIdx[perm[0]],
    signs[1] === 1 ? voxelIdx[perm[1]] : DIMS - voxelIdx[perm[1]],
    signs[2] === 1 ? voxelIdx[perm[2]] : DIMS - voxelIdx[perm[2]],
  ];
  const i = Math.floor(npyIdx[0]);
  const j = Math.floor(npyIdx[1]);
  const k = Math.floor(npyIdx[2]);
  if (i < 0 || i >= DIMS || j < 0 || j >= DIMS || k < 0 || k >= DIMS) return null;
  // C-order: linear = i*Ny*Nz + j*Nz + k
  return values[i * DIMS * DIMS + j * DIMS + k] ?? null;
}

/**
 * Given a list of sample values from the cube and the full distribution's
 * sorted percentile breakpoints, return the percentile rank of each sample.
 * Uses linear interpolation between adjacent breakpoints — good enough
 * for ranking comparisons.
 */
function percentileOf(value: number, sortedAsc: Float64Array): number {
  // Binary search for the largest index <= value.
  let lo = 0;
  let hi = sortedAsc.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (sortedAsc[mid]! <= value) lo = mid;
    else hi = mid - 1;
  }
  return (lo / (sortedAsc.length - 1)) * 100;
}

function main(): void {
  const npyBuf = readFileSync('data/raw/cf4/d_mean_CF4pp.npy');
  const npy = readNpy(npyBuf.buffer.slice(npyBuf.byteOffset, npyBuf.byteOffset + npyBuf.byteLength));
  if (!(npy.values instanceof Float64Array)) {
    throw new Error(`expected f64 .npy, got ${npy.dtype}`);
  }
  const values = npy.values;
  console.log(`Loaded ${npy.shape.join('x')} ${npy.dtype} cube (${values.length} voxels)`);

  // Sort for percentile lookups — copy first to leave the cube unmodified
  // (we still need positional access).
  const sortedAsc = new Float64Array(values);
  sortedAsc.sort();
  const meanValue = (() => {
    let s = 0;
    for (let i = 0; i < values.length; i++) s += values[i]!;
    return s / values.length;
  })();
  console.log(
    `Distribution: min=${sortedAsc[0]!.toFixed(4)}, ` +
    `median=${sortedAsc[Math.floor(sortedAsc.length / 2)]!.toFixed(4)}, ` +
    `mean=${meanValue.toFixed(4)}, ` +
    `max=${sortedAsc[sortedAsc.length - 1]!.toFixed(4)}`,
  );
  console.log('');

  // Pre-compute each anchor's continuous voxel index from RA/Dec/distance.
  // The numpy axis order is what we vary below — the SG coords are fixed.
  const anchorSgIdx: { name: string; sgIdx: [number, number, number] }[] = CLUSTER_ANCHORS.map(
    (a: ClusterAnchor) => {
      const eq = raDecDistToEqCart(a);
      const sg = eqToSg(eq);
      const sgIdx = sgToVoxelIndex(sg);
      return { name: a.name, sgIdx };
    },
  );

  // ── Variant 1: current build-pipeline assumption ────────────────
  // numpy axis 0 = SGX, axis 1 = SGY, axis 2 = SGZ (i.e. perm = [0,1,2],
  // signs = [+,+,+]).  This is the "naive" reading where C-order indices
  // map directly to SG axes.
  console.log('── CURRENT BUILD PIPELINE (perm=[SGX,SGY,SGZ], signs=[+,+,+]) ──');
  printVariantResults(values, sortedAsc, anchorSgIdx, [0, 1, 2], [1, 1, 1]);
  console.log('');

  // ── Variant 2: WebGPU-x-fastest-aware reading ───────────────────
  // If the bug hypothesis is right, numpy's *last* (fastest) axis is what
  // ends up as WebGPU's x-axis after upload, which the renderer then
  // treats as SGX.  So numpy axis 2 = SGX, axis 1 = SGY, axis 0 = SGZ.
  console.log('── HYPOTHESIS: AXIS SWAP (perm=[SGZ,SGY,SGX], signs=[+,+,+]) ──');
  printVariantResults(values, sortedAsc, anchorSgIdx, [2, 1, 0], [1, 1, 1]);
  console.log('');

  // ── Sweep all 48 permutation × sign-flip variants ───────────────
  // Pick the variant that maximises the mean anchor percentile.
  const perms: [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2][] = [
    [0, 1, 2], [0, 2, 1], [1, 0, 2], [1, 2, 0], [2, 0, 1], [2, 1, 0],
  ];
  const signs: [1 | -1, 1 | -1, 1 | -1][] = [];
  for (const sx of [1, -1] as const) for (const sy of [1, -1] as const) for (const sz of [1, -1] as const) signs.push([sx, sy, sz]);

  type Result = { perm: typeof perms[number]; signs: typeof signs[number]; meanPct: number };
  const results: Result[] = [];
  for (const perm of perms) {
    for (const sign of signs) {
      const percentiles: number[] = [];
      for (const a of anchorSgIdx) {
        // Apply the same conversion the renderer pipeline implies for this variant.
        const intIdx: [number, number, number] = [
          Math.floor(a.sgIdx[0]),
          Math.floor(a.sgIdx[1]),
          Math.floor(a.sgIdx[2]),
        ];
        const v = sampleVariant(values, intIdx, perm, sign);
        if (v === null) continue;
        percentiles.push(percentileOf(v, sortedAsc));
      }
      const meanPct = percentiles.reduce((s, p) => s + p, 0) / percentiles.length;
      results.push({ perm, signs: sign, meanPct });
    }
  }
  results.sort((a, b) => b.meanPct - a.meanPct);
  console.log('── TOP 5 AXIS-PERMUTATION VARIANTS (by mean anchor percentile) ──');
  for (let i = 0; i < 5; i++) {
    const r = results[i]!;
    const permLabel = labelPerm(r.perm);
    const signLabel = r.signs.map((s) => (s === 1 ? '+' : '-')).join('');
    console.log(`  ${i + 1}. perm=${permLabel} signs=[${signLabel}] → mean pct ${r.meanPct.toFixed(1)}`);
  }
  console.log('');
  console.log('── BOTTOM 3 VARIANTS (worst alignment) ──');
  for (let i = results.length - 3; i < results.length; i++) {
    const r = results[i]!;
    const permLabel = labelPerm(r.perm);
    const signLabel = r.signs.map((s) => (s === 1 ? '+' : '-')).join('');
    console.log(`  ${i + 1}. perm=${permLabel} signs=[${signLabel}] → mean pct ${r.meanPct.toFixed(1)}`);
  }
}

function labelPerm(perm: readonly [number, number, number]): string {
  const names = ['SGX', 'SGY', 'SGZ'];
  return `[${perm.map((p) => names[p]!).join(',')}]`;
}

function printVariantResults(
  values: Float64Array,
  sortedAsc: Float64Array,
  anchorSgIdx: { name: string; sgIdx: [number, number, number] }[],
  perm: [0 | 1 | 2, 0 | 1 | 2, 0 | 1 | 2],
  signs: [1 | -1, 1 | -1, 1 | -1],
): void {
  for (const a of anchorSgIdx) {
    const intIdx: [number, number, number] = [
      Math.floor(a.sgIdx[0]),
      Math.floor(a.sgIdx[1]),
      Math.floor(a.sgIdx[2]),
    ];
    const v = sampleVariant(values, intIdx, perm, signs);
    if (v === null) {
      console.log(`  ${a.name.padEnd(28)} OUT OF BOUNDS (SG voxel idx ${intIdx.join(',')})`);
      continue;
    }
    const pct = percentileOf(v, sortedAsc);
    const overdense = v > 0 ? '+' : '-';
    console.log(
      `  ${a.name.padEnd(28)} → value ${overdense}${Math.abs(v).toFixed(4)} (${pct.toFixed(1)}th percentile)`,
    );
  }
}

main();
