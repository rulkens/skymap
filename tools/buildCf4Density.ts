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

/**
 * Default palette for CF-4 DM density cubes.
 *
 * `coolwarm` is the natural fit: the field is symmetrically normalised
 * around the cosmic mean (LUT coord 0.5), and coolwarm's V-shaped alpha
 * makes that midpoint fully transparent — over-densities glow red,
 * under-densities glow blue, and the empty cosmic-mean background reads
 * as space.  Sequential palettes (magma / viridis) fight this by giving
 * the midpoint a visible colour, which makes the void regions wash the
 * whole cube out.
 */
const DEFAULT_CF4_PALETTE: ScalarFieldPaletteId = 'coolwarm';

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
 * Per-cube opacity multiplier baked into the SCFD header.  See
 * `ScalarCube.densityScale` for the shader-side semantics — it's the
 * factor that maps "voxel value at palette-LUT coordinate 1.0" onto
 * "fully saturated through a typical ray".  The synthetic Gaussian
 * generator in `src/data/syntheticScalarField.ts` uses 10.0; the
 * sparser cartesian-grid uses 4.0; we pick 5.0 for the CF-4 mean
 * density field (broader features than the Gaussian, denser than the
 * grids) and revisit if the user-facing intensity slider can't tune
 * away the gap.
 *
 * Why a constant, not a heuristic: an earlier version of this script
 * computed `densityScale` from `valueMax × cube-diagonal` under the
 * (wrong) assumption that the shader multiplies alpha by the sampled
 * voxel value.  It doesn't — voxel values only pick the palette colour
 * via LUT lookup, and the shader's per-step alpha is
 *
 *     palette.a × intensity × densityScale × stepLength
 *
 * The fix is upstream of densityScale: normalise the voxel values into
 * [0, 1] so the LUT lookup actually lands in the visible part of the
 * palette, then use a `densityScale` in the standard [1, 10] regime
 * the synthetic generators target.
 */
const CF4_DENSITY_SCALE = 5.0;

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
  // CF4++ ships `d_mean_CF4pp` as f64; older catalog fixtures and our
  // smoke tests use f32.  Accept either, narrow to a single Float64Array
  // for the f16-packing loop below — JS numbers are f64 internally, so
  // upcasting f32 → f64 here is a no-op for precision and lets the
  // packing loop stay a single code path.
  const npyBuf = readFileSync(npyPath);
  const npy = readNpy(npyBuf.buffer.slice(npyBuf.byteOffset, npyBuf.byteOffset + npyBuf.byteLength));
  if (npy.shape.length !== 3) {
    throw new Error(`buildCf4Density: expected 3D array, got shape ${npy.shape.join('x')}`);
  }
  if (!(npy.values instanceof Float64Array) && !(npy.values instanceof Float32Array)) {
    throw new Error(`buildCf4Density: expected f64 or f32 .npy, got dtype ${npy.dtype}`);
  }
  const values: Float64Array | Float32Array = npy.values;
  const dims: [number, number, number] = [npy.shape[0]!, npy.shape[1]!, npy.shape[2]!];

  // ── 2. Compute stats ─────────────────────────────────────────────
  // Scan the raw values for diagnostic min/max.  The SCFD header keeps
  // these as the *original* pre-normalisation range so a future consumer
  // can recover physical units (δ, log(1+δ), σ, …) from the f16 voxel
  // payload if it needs to.  The shader itself never reads them — its
  // palette LUT lookup assumes voxels are already in [0, 1].
  let valueMin = +Infinity;
  let valueMax = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < valueMin) valueMin = v;
    if (v > valueMax) valueMax = v;
  }

  // ── 3. Symmetric normalisation around 0 → [0, 1] and pack as f16 ──
  // CF4++ density values are signed (overdensity δ or a Gaussianised
  // equivalent) and the cosmic mean lives at value=0.  A naive linear
  // remap `(v - min) / (max - min)` lands 0 at LUT coord
  // |min| / (|min| + |max|) — typically ~0.52 for CF4++, not 0.5.  That
  // small asymmetry breaks the divergent `coolwarm` palette's
  // transparent-mean visual (the cosmic mean leaks a faint warm tint).
  //
  // Symmetric mapping: half = max(|min|, |max|), then
  //   normalised = clamp(0.5 + v / (2 × half), 0, 1)
  // This guarantees 0 → 0.5 (transparent for divergent palettes), and
  // the more-extreme tail saturates at one end while the less-extreme
  // tail does NOT reach the opposite end.  For sequential palettes
  // (viridis / magma / blue-purple / yellow-green) the effect is the
  // same as before for the high tail; the low tail now starts at 0.5
  // rather than 0, which crushes void contrast a bit but lets users
  // who want to see the FULL signed dynamic range flip to coolwarm
  // without re-encoding.
  //
  // Guard against a degenerate constant cube (would make the divisor
  // zero) by clamping `half` to a non-zero minimum.
  const half = Math.max(1e-9, Math.max(Math.abs(valueMin), Math.abs(valueMax)));
  const invTwoHalf = 1 / (2 * half);
  const voxels = new Uint16Array(values.length);
  for (let i = 0; i < values.length; i++) {
    const normalised = 0.5 + values[i]! * invTwoHalf;
    // Clamp protects against the slightly-out-of-range corner from
    // floating-point drift; the input from CF4++ is well within
    // [-half, +half] by construction.
    const clamped = normalised < 0 ? 0 : normalised > 1 ? 1 : normalised;
    voxels[i] = f32ToF16Bits(clamped);
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

  // ── 5. Build the cube with the fixed CF-4 densityScale ─────────────
  const densityScale = CF4_DENSITY_SCALE;

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
