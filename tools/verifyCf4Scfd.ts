/**
 * verifyCf4Scfd.ts — read the built `cf4_density.scfd` and check four
 * things against known cosmography:
 *
 *   1.  Each cluster anchor (Virgo / Norma / Perseus / Coma / Hercules /
 *       Shapley) sits at a high-percentile voxel.
 *   2.  Each known void anchor (Local / Sculptor / Boötes) sits at a
 *       low-percentile voxel.
 *   3.  The TOP N density peaks have world-EQ positions that correspond
 *       to recognisable structures (not just "somewhere random").
 *   4.  The BOTTOM N density troughs sit in known underdense regions.
 *
 * One-off diagnostic, throwaway.  Imports `decodeScalarField` and
 * `raDecDistToEqCart` from src/ to share with the runtime; voids are
 * inlined here because they're verification-only (no runtime use yet).
 *
 * Usage:
 *   npx tsx tools/verifyCf4Scfd.ts
 */
import { readFileSync } from 'node:fs';
import { decodeScalarField } from '../src/data/scalarFieldFormat';
import { SG_TO_EQ_MATRIX } from '../src/data/superGalacticTransform';
import {
  CLUSTER_ANCHORS,
  raDecDistToEqCart,
  type SkyCoord,
} from '../src/data/clusterAnchors';

/** Sky anchor with a display name — voids only, inlined here. */
type NamedAnchor = SkyCoord & { readonly name: string };

/**
 * Well-known local voids inside CF-4's 500 Mpc box.  Distances and
 * centres are best-effort from the literature (Tully 2008, Pomarède 2020,
 * Kirshner 1987 for Boötes); ±20 % uncertainty is common, and CF-4's
 * Wiener-filter smoothing makes void centres a blob rather than a point
 * anyway.  These are sanity checks, not survey-grade anchors.
 */
const VOID_ANCHORS: readonly NamedAnchor[] = [
  // Local Void — adjacent to the Local Group, mostly above the galactic
  // plane.  Tully 2008 places its centre near (l=37°, b=15°) → eq (RA≈18h 38m,
  // Dec≈+18°) at ~25 Mpc.
  { name: 'Local Void',     raHours: 18 + 38 / 60, decDeg:  18,         distMpc:  25 },
  // Sculptor Void — closer, around (RA=0h, Dec=-30°), ~30-40 Mpc.
  { name: 'Sculptor Void',  raHours:  0,           decDeg: -30,         distMpc:  35 },
  // Boötes Void — the famous "Great Void" of Kirshner 1981; ~50 Mpc
  // radius centered at roughly (RA=14h 50m, Dec=+46°) at ~245 Mpc.  Near
  // the edge of CF-4's reliable volume.
  { name: 'Boötes Void',    raHours: 14 + 50 / 60, decDeg:  46,         distMpc: 245 },
];

function transpose3(m: typeof SG_TO_EQ_MATRIX): typeof SG_TO_EQ_MATRIX {
  return [
    [m[0][0], m[1][0], m[2][0]],
    [m[0][1], m[1][1], m[2][1]],
    [m[0][2], m[1][2], m[2][2]],
  ];
}

const EQ_TO_SG = transpose3(SG_TO_EQ_MATRIX);

function eqToSg(eq: readonly [number, number, number]): [number, number, number] {
  const m = EQ_TO_SG;
  return [
    m[0][0] * eq[0] + m[0][1] * eq[1] + m[0][2] * eq[2],
    m[1][0] * eq[0] + m[1][1] * eq[1] + m[1][2] * eq[2],
    m[2][0] * eq[0] + m[2][1] * eq[1] + m[2][2] * eq[2],
  ];
}

function sgToEq(sg: readonly [number, number, number]): [number, number, number] {
  const m = SG_TO_EQ_MATRIX;
  return [
    m[0][0] * sg[0] + m[0][1] * sg[1] + m[0][2] * sg[2],
    m[1][0] * sg[0] + m[1][1] * sg[1] + m[1][2] * sg[2],
    m[2][0] * sg[0] + m[2][1] * sg[1] + m[2][2] * sg[2],
  ];
}

/** Equatorial Cartesian → (RA hours, Dec deg, distance Mpc). */
function eqCartToRaDecDist(eq: readonly [number, number, number]): {
  raHours: number;
  decDeg: number;
  distMpc: number;
} {
  const d = Math.hypot(eq[0], eq[1], eq[2]);
  const decDeg = (Math.asin(eq[2] / d) * 180) / Math.PI;
  let raDeg = (Math.atan2(eq[1], eq[0]) * 180) / Math.PI;
  if (raDeg < 0) raDeg += 360;
  return { raHours: raDeg / 15, decDeg, distMpc: d };
}

/** Decode a single f16 raw-bit value to a JS number. */
function f16BitsToFloat(bits: number): number {
  const sign = (bits & 0x8000) >> 15;
  const exp = (bits & 0x7c00) >> 10;
  const mant = bits & 0x03ff;
  if (exp === 0) return (sign ? -1 : 1) * (mant / 1024) * Math.pow(2, -14);
  if (exp === 31) return mant === 0 ? (sign ? -Infinity : Infinity) : NaN;
  return (sign ? -1 : 1) * (1 + mant / 1024) * Math.pow(2, exp - 15);
}

function sampleAtAnchor(
  decoded: Float64Array,
  sorted: Float64Array,
  anchor: NamedAnchor,
  dims: readonly [number, number, number],
  voxelSize: number,
): { vox: [number, number, number]; value: number; pct: number } | null {
  const [Nx, Ny, Nz] = dims;
  const eq = raDecDistToEqCart(anchor);
  const sg = eqToSg(eq);
  const xi = Math.floor(sg[0] / voxelSize + Nx / 2);
  const yi = Math.floor(sg[1] / voxelSize + Ny / 2);
  const zi = Math.floor(sg[2] / voxelSize + Nz / 2);
  if (xi < 0 || xi >= Nx || yi < 0 || yi >= Ny || zi < 0 || zi >= Nz) return null;
  // WebGPU x-fastest: offset = z * Ny * Nx + y * Nx + x.
  const off = zi * Ny * Nx + yi * Nx + xi;
  const value = decoded[off]!;
  const pct = percentileOf(value, sorted);
  return { vox: [xi, yi, zi], value, pct };
}

function percentileOf(value: number, sortedAsc: Float64Array): number {
  let lo = 0;
  let hi = sortedAsc.length - 1;
  while (lo < hi) {
    const mid = (lo + hi + 1) >>> 1;
    if (sortedAsc[mid]! <= value) lo = mid;
    else hi = mid - 1;
  }
  return (lo / (sortedAsc.length - 1)) * 100;
}

function voxelToEqCart(
  vox: readonly [number, number, number],
  dims: readonly [number, number, number],
  voxelSize: number,
): [number, number, number] {
  // Voxel centre in SG Mpc: (vox - dims/2 + 0.5) * voxelSize.
  const sgX = (vox[0] - dims[0] / 2 + 0.5) * voxelSize;
  const sgY = (vox[1] - dims[1] / 2 + 0.5) * voxelSize;
  const sgZ = (vox[2] - dims[2] / 2 + 0.5) * voxelSize;
  return sgToEq([sgX, sgY, sgZ]);
}

function main(): void {
  const buf = readFileSync('public/data/cf4_density.scfd');
  const cube = decodeScalarField(
    buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  );
  const dims = cube.dims;
  const [Nx, Ny, Nz] = dims;
  const voxelSize = cube.voxelSize;
  console.log(`Loaded ${Nx}x${Ny}x${Nz} cube, voxelSize=${voxelSize.toFixed(3)} Mpc`);
  console.log(
    `Header: valueMin=${cube.valueMin.toFixed(3)}, valueMax=${cube.valueMax.toFixed(3)}, ` +
      `rotation=[${cube.rotation.map((r) => r.toFixed(3)).join(', ')}]`,
  );

  const half = Math.max(Math.abs(cube.valueMin), Math.abs(cube.valueMax));

  // Decode all voxels back to physical units.
  const decoded = new Float64Array(cube.voxels.length);
  for (let i = 0; i < cube.voxels.length; i++) {
    const f = f16BitsToFloat(cube.voxels[i]!);
    decoded[i] = (f - 0.5) * 2 * half;
  }
  const sorted = new Float64Array(decoded);
  sorted.sort();

  // ── 1. Cluster anchors should be HIGH percentile ─────────────────────
  console.log('');
  console.log('── CLUSTERS — expect high percentile (overdense) ──');
  for (const a of CLUSTER_ANCHORS) {
    const r = sampleAtAnchor(decoded, sorted, a, dims, voxelSize);
    if (!r) {
      console.log(`  ${a.name.padEnd(28)} OUT OF BOUNDS`);
      continue;
    }
    const sign = r.value >= 0 ? '+' : '-';
    console.log(
      `  ${a.name.padEnd(28)} → vox(${r.vox.join(',')}) → ${sign}${Math.abs(r.value).toFixed(3)} (${r.pct.toFixed(1)}th)`,
    );
  }

  // ── 2. Voids should be LOW percentile ────────────────────────────────
  console.log('');
  console.log('── VOIDS — expect low percentile (underdense) ──');
  for (const v of VOID_ANCHORS) {
    const r = sampleAtAnchor(decoded, sorted, v, dims, voxelSize);
    if (!r) {
      console.log(`  ${v.name.padEnd(28)} OUT OF BOUNDS`);
      continue;
    }
    const sign = r.value >= 0 ? '+' : '-';
    console.log(
      `  ${v.name.padEnd(28)} → vox(${r.vox.join(',')}) → ${sign}${Math.abs(r.value).toFixed(3)} (${r.pct.toFixed(1)}th)`,
    );
  }

  // ── 3. Top N density peaks: which world positions do they hit? ───────
  //
  // If the axis transpose and rotation fixes are both correct, the highest-
  // density voxels should sit near known clusters or filaments — not in
  // arbitrary directions.  Walking the top 20 raw values and reporting
  // their (RA, Dec, distance) lets us spot-check against well-known
  // structures by eye.
  console.log('');
  console.log('── TOP 15 DENSITY PEAKS (world EQ) ──');
  console.log('  Compare against: Virgo, Coma, Perseus, Norma, Hercules,');
  console.log('  Centaurus, Hydra, Pavo-Indus, Ophiuchus, Pisces-Perseus filament...');
  console.log('');
  const indexedDecoded: { value: number; off: number }[] = [];
  for (let i = 0; i < decoded.length; i++) indexedDecoded.push({ value: decoded[i]!, off: i });
  indexedDecoded.sort((a, b) => b.value - a.value);

  for (let n = 0; n < 15; n++) {
    const { value, off } = indexedDecoded[n]!;
    const zi = Math.floor(off / (Nx * Ny));
    const yi = Math.floor((off % (Nx * Ny)) / Nx);
    const xi = off % Nx;
    const eq = voxelToEqCart([xi, yi, zi], dims, voxelSize);
    const sky = eqCartToRaDecDist(eq);
    const raStr = `${Math.floor(sky.raHours).toString().padStart(2, '0')}h${Math.floor((sky.raHours % 1) * 60).toString().padStart(2, '0')}m`;
    const decStr = `${sky.decDeg >= 0 ? '+' : ''}${sky.decDeg.toFixed(1)}°`;
    console.log(
      `  ${(n + 1).toString().padStart(2)}. δ=+${value.toFixed(3)}  vox(${xi.toString().padStart(3)},${yi.toString().padStart(3)},${zi.toString().padStart(3)})  RA=${raStr}  Dec=${decStr}  d=${sky.distMpc.toFixed(0)} Mpc`,
    );
  }

  // ── 4. Bottom N density troughs ──────────────────────────────────────
  console.log('');
  console.log('── BOTTOM 10 DENSITY TROUGHS (world EQ) ──');
  console.log('  Compare against: Local Void, Sculptor Void, Boötes Void, etc.');
  console.log('');
  for (let n = 0; n < 10; n++) {
    const { value, off } = indexedDecoded[indexedDecoded.length - 1 - n]!;
    const zi = Math.floor(off / (Nx * Ny));
    const yi = Math.floor((off % (Nx * Ny)) / Nx);
    const xi = off % Nx;
    const eq = voxelToEqCart([xi, yi, zi], dims, voxelSize);
    const sky = eqCartToRaDecDist(eq);
    const raStr = `${Math.floor(sky.raHours).toString().padStart(2, '0')}h${Math.floor((sky.raHours % 1) * 60).toString().padStart(2, '0')}m`;
    const decStr = `${sky.decDeg >= 0 ? '+' : ''}${sky.decDeg.toFixed(1)}°`;
    console.log(
      `  ${(n + 1).toString().padStart(2)}. δ=${value.toFixed(3)}  vox(${xi.toString().padStart(3)},${yi.toString().padStart(3)},${zi.toString().padStart(3)})  RA=${raStr}  Dec=${decStr}  d=${sky.distMpc.toFixed(0)} Mpc`,
    );
  }
}

main();
