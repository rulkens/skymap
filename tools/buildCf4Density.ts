/**
 * buildCf4Density.ts — convert the maintainer-produced .npy slice of the
 * Courtois 2025 CF4++ release into the runtime cf4_density.scfd consumed
 * by the scalar-volume renderer.
 *
 * Data provenance:
 *   Upstream is `CF4pp_mean_std_grids.npz` from
 *   https://projets.ip2i.in2p3.fr/cosmicflows/ — a numpy ZIP archive
 *   containing six 128³ arrays (mean + std for density, Cartesian velocity,
 *   and radial velocity) computed across 10 000 HMC posterior steps.
 *
 *   The maintainer extracts the mean density entry once:
 *
 *       unzip -j CF4pp_mean_std_grids.npz d_mean_CF4pp.npy
 *
 *   …and uploads `d_mean_CF4pp.npy` to R2.  Contributors curl that file
 *   instead of downloading the 167 MB .npz.
 *
 * Cosmology / grid constants are hard-coded below (the CF4++ release
 * doesn't ship a sidecar; the constants come from the paper / the
 * accompanying `retrieve_CF4pp_grid_values.py` loader).  Older drafts of
 * this script read a `.meta.json` sidecar; we dropped it once the data
 * source stabilised on CF4++ — one less file to keep in sync.
 *
 * Pure Node/TS — no Python required.  Mirrors the conventions of the
 * existing build scripts in tools/ (idempotent, prints what it generated,
 * exits non-zero on missing inputs).
 *
 * Output is gitignored and synced to R2 by `npm run sync-r2`.
 *
 * The script exports `buildCf4Density({ npyPath, outPath })` for direct
 * invocation from tests; the CLI wrapper at the bottom forwards the
 * standard paths in data/raw/cf4/ → public/data/.
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { readNpy } from './parsers/npyReader';
import { encodeScalarField } from '../src/data/scalarFieldFormat';
import { SG_TO_EQ_QUATERNION } from '../src/data/superGalacticTransform';
import type { ScalarCube, ScalarFieldPaletteId } from '../src/@types/ScalarCube';

/**
 * Physical voxel edge length in Mpc.  CF4++ ships a 1000 Mpc box on a
 * 128³ grid in *physical* Mpc (the upstream loader script's grid
 * conversion treats coordinates as plain Mpc, not Mpc/h).  This constant
 * is the load-bearing assumption; if a future CF-4 release switches
 * resolution or box size, change here and the `.scfd` output adapts.
 */
const CF4PP_VOXEL_SIZE_MPC = 1000 / 128;

/** Default palette for CF-4 DM density cubes. */
const DEFAULT_CF4_PALETTE: ScalarFieldPaletteId = 'magma';

/**
 * Convert a single f32 to its f16 raw bits using round-to-nearest-even.
 *
 * Why hand-roll: we need per-element conversion from a Float32Array into
 * Uint16 f16 bit patterns for the SCFD voxel array. Using the well-known
 * IEEE-754 bit-manipulation approach avoids importing a heavy f16 library
 * (or shelling out to Python) for what is fundamentally just a packing step.
 *
 * The algorithm extracts sign, exponent, and mantissa from the f32 bit
 * pattern and repacks them into the f16 5-bit exponent + 10-bit mantissa
 * layout, handling overflow to Inf, underflow to subnormal, and NaN passthrough.
 */
function f32ToF16Bits(value: number): number {
  const f32 = new Float32Array(1);
  f32[0] = value;
  const u32 = new Uint32Array(f32.buffer)[0]!;
  const sign = (u32 >>> 16) & 0x8000;
  let mant = u32 & 0x007fffff;
  let exp = (u32 >>> 23) & 0xff;
  if (exp === 255) {
    // Inf / NaN — preserve the bit pattern signal (NaN vs Inf).
    return sign | 0x7c00 | (mant ? 1 : 0);
  }
  exp = exp - 127 + 15;
  if (exp >= 31) return sign | 0x7c00; // overflow → Inf
  if (exp <= 0) {
    // Subnormal or zero — shift mantissa to fit the f16 subnormal field.
    if (exp < -10) return sign;
    mant = (mant | 0x00800000) >>> (1 - exp);
    if (mant & 0x00001000) mant += 0x00002000; // round up
    return sign | (mant >>> 13);
  }
  // Normal range: round-to-nearest-even via the guard bit at mantissa[12].
  if (mant & 0x00001000) {
    mant += 0x00002000;
    if (mant & 0x00800000) {
      mant = 0;
      exp += 1;
      if (exp >= 31) return sign | 0x7c00;
    }
  }
  return sign | (exp << 10) | (mant >>> 13);
}

/**
 * Choose a per-cube `densityScale` so that an "interesting" voxel value
 * yields a saturated alpha at intensity=1. For CF-4 delta values which
 * range over [~-1, +30], we pick scale such that a path through the
 * peak voxel saturates over ~10% of the cube diagonal — soft enough to
 * see structure, dense enough to read as fog.
 *
 * Heuristic only; can be retuned without invalidating the format.
 *
 * Why 0.1 of the diagonal: shorter (e.g. 1%) makes the density
 * field opaque and featureless; longer (e.g. 50%) leaves it washed out at
 * default intensity. 10% is the empirically pleasing midpoint for overdensity
 * fields with a high dynamic range.
 */
function chooseDensityScale(valueMax: number, voxelSizeMpc: number, dims: readonly [number, number, number]): number {
  const diagonalMpc = voxelSizeMpc * Math.hypot(dims[0], dims[1], dims[2]);
  const targetSaturationPathMpc = diagonalMpc * 0.1;
  // alpha_per_step ≈ palette.a × intensity × densityScale × stepLengthMpc
  // We want sum over targetSaturationPath/stepLength steps to ≈ 1 at value=valueMax.
  // Ignoring the per-step palette modulation (which is data-dependent), this
  // gives densityScale ≈ 1 / (valueMax × targetSaturationPathMpc).
  const scale = 1 / Math.max(1e-3, valueMax * targetSaturationPathMpc);
  // Clamp to a sane range so a degenerate stats block doesn't produce
  // NaN/Inf opacity. Floor of 1e-4 ensures the SCFD f32 slot is always
  // non-zero; the decoder treats zero as the legacy sentinel and substitutes
  // 1.0, which would give wrong opacity for newly-generated files.
  return Math.min(10, Math.max(1e-4, scale));
}

/**
 * Build a SCFD scalar volume from a CF4++ `.npy` mean-density slice.
 *
 * Exported so tests can call it directly without spawning a child process.
 * The CLI wrapper below forwards the standard production paths.
 *
 * @param args.npyPath        Path to the f32 .npy file (3D, C-order).
 * @param args.outPath        Destination .scfd path (created or overwritten).
 * @param args.paletteId      Override the default palette (optional).
 * @param args.voxelSizeMpc   Override the voxel size in Mpc (optional —
 *                            defaults to CF4PP_VOXEL_SIZE_MPC). Tests pass
 *                            a synthetic value matching their tmpdir cube.
 */
export async function buildCf4Density(args: {
  npyPath: string;
  outPath: string;
  paletteId?: ScalarFieldPaletteId;
  voxelSizeMpc?: number;
}): Promise<void> {
  const { npyPath, outPath } = args;
  const paletteId = args.paletteId ?? DEFAULT_CF4_PALETTE;
  const voxelSize = args.voxelSizeMpc ?? CF4PP_VOXEL_SIZE_MPC;

  // ── 1. Load .npy ─────────────────────────────────────────────────
  const npyBuf = readFileSync(npyPath);
  const npy = readNpy(npyBuf.buffer.slice(npyBuf.byteOffset, npyBuf.byteOffset + npyBuf.byteLength));
  if (npy.shape.length !== 3) {
    throw new Error(`buildCf4Density: expected 3D array, got shape ${npy.shape.join('x')}`);
  }
  if (!(npy.values instanceof Float32Array)) {
    throw new Error(`buildCf4Density: expected f32 .npy, got dtype ${npy.dtype}`);
  }
  const values = npy.values;
  const dims: [number, number, number] = [npy.shape[0]!, npy.shape[1]!, npy.shape[2]!];

  // ── 2. Compute stats ─────────────────────────────────────────────
  // Scan the raw f32 values for diagnostic min/max, embedded in the SCFD
  // header so consumers (and the densityScale heuristic below) can size
  // their dynamic range correctly.
  let valueMin = +Infinity;
  let valueMax = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < valueMin) valueMin = v;
    if (v > valueMax) valueMax = v;
  }

  // ── 3. Convert f32 → f16 bits ────────────────────────────────────
  // The SCFD voxel array stores raw Uint16 f16 bit patterns, matching
  // the r16float WebGPU 3D texture format. We convert per-element rather
  // than slicing because Float32Array and Float16Array share no direct
  // cast path in current JS runtimes.
  const voxels = new Uint16Array(values.length);
  for (let i = 0; i < values.length; i++) {
    voxels[i] = f32ToF16Bits(values[i]!);
  }

  // ── 4. Compute origin (voxel (0,0,0) corner in native SG frame, Mpc) ─
  // The CF4++ cube is centered on the observer (origin) in supergalactic
  // Cartesian, so voxel (dims/2, dims/2, dims/2) sits at (0, 0, 0) Mpc.
  // The lower corner of voxel (0, 0, 0) is therefore at -voxelSize × (dims/2)
  // per axis. CF4++ uses physical Mpc (not Mpc/h), so no h-rescale needed.
  const origin: [number, number, number] = [
    -voxelSize * (dims[0] / 2),
    -voxelSize * (dims[1] / 2),
    -voxelSize * (dims[2] / 2),
  ];

  // ── 5. Build the cube + densityScale ─────────────────────────────
  const densityScale = chooseDensityScale(Math.max(0.001, Math.abs(valueMax)), voxelSize, dims);

  const cube: ScalarCube = {
    dims,
    voxels,
    frameKind: 'supergalactic-cartesian',
    origin,
    voxelSize,
    // The rotation quaternion places the cube's native SG frame into
    // equatorial Cartesian world space. Both the renderer's model matrix
    // and the ray-AABB test operate in equatorial Cartesian, so this
    // quaternion must match the same transform used by all other
    // supergalactic-frame objects in the scene.
    rotation: [
      SG_TO_EQ_QUATERNION[0],
      SG_TO_EQ_QUATERNION[1],
      SG_TO_EQ_QUATERNION[2],
      SG_TO_EQ_QUATERNION[3],
    ],
    paletteId,
    densityScale,
    valueMin,
    valueMax,
  };

  // ── 6. Encode + write ────────────────────────────────────────────
  const out = encodeScalarField(cube);
  writeFileSync(outPath, Buffer.from(out));

  console.log(
    `[buildCf4Density] wrote ${outPath} ` +
      `(dims=${dims.join('x')}, voxelSize=${voxelSize.toFixed(3)} Mpc, ` +
      `min=${valueMin.toFixed(3)}, max=${valueMax.toFixed(3)}, ` +
      `palette=${paletteId}, densityScale=${densityScale.toExponential(2)}, ` +
      `${out.byteLength} bytes)`,
  );
}

// ── CLI wrapper ────────────────────────────────────────────────────
// Standard production paths follow the same convention as other build
// scripts in tools/: raw source in data/raw/<catalog>/, output to
// public/data/ for serving via Vite dev or R2 in production.
async function main(): Promise<void> {
  await buildCf4Density({
    npyPath: 'data/raw/cf4/d_mean_CF4pp.npy',
    outPath: 'public/data/cf4_density.scfd',
  });
}

// Only run main() when invoked directly via tsx, not when imported by tests.
// import.meta.url is the file:// URL of this module; process.argv[1] is the
// path tsx was asked to run. They match only when this is the entry point.
const invokedDirectly = (() => {
  try {
    return import.meta.url === `file://${process.argv[1]}`;
  } catch {
    return false;
  }
})();
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
