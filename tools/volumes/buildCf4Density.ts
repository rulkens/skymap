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
 * accompanying `retrieve_CF4pp_grid_values.py` loader).
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

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { readNpy } from '../parsers/npyReader';
import { f32ToF16Bits } from '../utils/math/f32ToF16Bits';
import {
  encodeScalarField,
  SCALAR_FIELD_DATA_PREFIX,
} from '../../src/data/volume/scalarFieldFormat';
import type { ScalarCube } from '../../src/@types/data/volume/ScalarCube';
import { rawDataPath } from '../utils/io/rawDataRegistry';

/**
 * Physical voxel edge length in Mpc.  CF4++ ships a 1000 Mpc box on a
 * 128³ grid in *physical* Mpc (the upstream loader script's grid
 * conversion treats coordinates as plain Mpc, not Mpc/h).  This constant
 * is the load-bearing assumption; if a future CF-4 release switches
 * resolution or box size, change here and the `.scfd` output adapts.
 */
const CF4PP_VOXEL_SIZE_MPC = 1000 / 128;

/**
 * Build a SCFD scalar volume from a CF4++ `.npy` mean-density slice.
 *
 * Exported so tests can call it directly without spawning a child process.
 * The CLI wrapper below forwards the standard production paths.
 *
 * SCFD v2 is data-only: palette and `densityScale` are presentation
 * concerns and live in `src/data/volumeFieldDefaults.ts` keyed by the
 * `'cf4-density'` handle (coolwarm + 5.0), so this builder deliberately
 * takes no `--palette` flag.  To ship a magma variant for a paper or
 * similar one-off, point the runtime's wireSlots commit at a different
 * registry entry, or call `setFieldPalette` after the field registers.
 * The binary itself stays purely descriptive.
 *
 * @param args.npyPath        Path to the f32 .npy file (3D, C-order).
 * @param args.outPath        Destination .scfd path (created or overwritten).
 * @param args.voxelSizeMpc   Override the voxel size in Mpc (optional —
 *                            defaults to CF4PP_VOXEL_SIZE_MPC). Tests pass
 *                            a synthetic value matching their tmpdir cube.
 */
export async function buildCf4Density(args: {
  npyPath: string;
  outPath: string;
  voxelSizeMpc?: number;
}): Promise<void> {
  const { npyPath, outPath } = args;
  const voxelSize = args.voxelSizeMpc ?? CF4PP_VOXEL_SIZE_MPC;

  // ── 1. Load .npy ─────────────────────────────────────────────────
  // CF4++ ships `d_mean_CF4pp` as f64; our smoke-test fixtures use f32.
  // Accept either — JS numbers are f64 internally, so upcasting f32 → f64
  // is a no-op for precision and lets the packing loop stay a single
  // code path.
  const npyBuf = readFileSync(npyPath);
  const npy = readNpy(
    npyBuf.buffer.slice(npyBuf.byteOffset, npyBuf.byteOffset + npyBuf.byteLength),
  );
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
  // (viridis / magma / blue-purple / yellow-green) the high tail
  // saturates as a min-max remap would; the low tail starts at 0.5
  // rather than 0, which crushes void contrast a bit but lets users
  // who want to see the FULL signed dynamic range flip to coolwarm
  // without re-encoding.
  //
  // Guard against a degenerate constant cube (would make the divisor
  // zero) by clamping `half` to a non-zero minimum.
  const half = Math.max(1e-9, Math.max(Math.abs(valueMin), Math.abs(valueMax)));
  const invTwoHalf = 1 / (2 * half);
  const voxels = new Uint16Array(values.length);

  // ── Axis transpose: numpy C-order → WebGPU x-fastest ─────────────────
  // The CF4++ .npy is C-order with shape (Nx, Ny, Nz) where the author's
  // convention puts axis 0 = SGX (slowest in memory), axis 1 = SGY,
  // axis 2 = SGZ (fastest).  Numpy stores npy[i, j, k] at linear offset
  // i*Ny*Nz + j*Nz + k — so the LAST index varies fastest.
  //
  // WebGPU's writeTexture, configured with `bytesPerRow = dims[0]*2`
  // and `rowsPerImage = dims[1]`, interprets the linear buffer as
  // x-FASTEST: texture coordinate (xt, yt, zt) reads from offset
  // zt*Ny*Nx + yt*Nx + xt.  The FIRST coordinate varies fastest.
  //
  // A straight-copy `voxels[i] = packed(values[i])` would therefore
  // place numpy axis 2 (SGZ) into WebGPU's x-axis and numpy axis 0
  // (SGX) into WebGPU's z-axis — visually swapping the cube's X and Z
  // directions vs. the model matrix's assumption that local-x = SGX.
  // The symptom: cluster labels rendered via raDecDistToEqCart sit at
  // the known cluster positions while the density blobs appear at
  // completely different locations.
  //
  // Fix: transpose axes 0 ↔ 2 at pack time so the WebGPU x-fastest
  // layout carries SGX data in its fastest axis.  For each input cell
  // npy[i, j, k] (representing SG position (i, j, k)), write into the
  // output buffer at the WebGPU-x-fastest offset that the shader will
  // later sample for SG-local coordinate (xt=i, yt=j, zt=k).
  for (let i = 0; i < dims[0]; i++) {
    for (let j = 0; j < dims[1]; j++) {
      for (let k = 0; k < dims[2]; k++) {
        const inputIdx = i * dims[1] * dims[2] + j * dims[2] + k;
        const outputIdx = k * dims[1] * dims[0] + j * dims[0] + i;
        const normalised = 0.5 + values[inputIdx]! * invTwoHalf;
        // Clamp protects against the slightly-out-of-range corner from
        // floating-point drift; the input from CF4++ is well within
        // [-half, +half] by construction.
        const clamped = normalised < 0 ? 0 : normalised > 1 ? 1 : normalised;
        voxels[outputIdx] = f32ToF16Bits(clamped);
      }
    }
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

  // ── 5. Build the data-only cube ────────────────────────────────────
  const cube: ScalarCube = {
    dims,
    channels: 1,
    voxels,
    frameKind: 'supergalactic-cartesian',
    origin,
    voxelSize,
    // Identity quaternion — NOT the SG→EQ rotation.  The renderer's
    // `buildCubeModelMatrix` already applies the SG→EQ rotation via
    // `FRAME_TO_WORLD[supergalactic-cartesian]` for any cube whose
    // `frameKind` is supergalactic; this `rotation` field is composed
    // ON TOP of that, so it must be identity for vanilla SG cubes.
    // Writing `SG_TO_EQ_QUATERNION` here would compound the rotation
    // and place cube features at SG_TO_EQ²·X instead of SG_TO_EQ·X —
    // cluster labels (which use the canonical eq-Cartesian) end up
    // rotated away from their cube overdensities.  The `rotation`
    // field is reserved for per-cube TILT offsets (e.g. align a cube
    // manually to a survey ROI); vanilla cubes ship identity.
    rotation: [0, 0, 0, 1],
    valueMin,
    valueMax,
  };

  // ── 6. Encode + write ────────────────────────────────────────────
  const out = encodeScalarField(cube);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, Buffer.from(out));

  console.log(
    `[buildCf4Density] wrote ${outPath} ` +
      `(dims=${dims.join('x')}, voxelSize=${voxelSize.toFixed(3)} Mpc, ` +
      `min=${valueMin.toFixed(3)}, max=${valueMax.toFixed(3)}, ` +
      `${out.byteLength} bytes)`,
  );
}

// ── CLI wrapper ────────────────────────────────────────────────────
// Standard production paths follow the same convention as other build
// scripts in tools/: raw source in data/raw/<catalog>/, output to
// public/data/ for serving via Vite dev or R2 in production.
async function main(): Promise<void> {
  await buildCf4Density({
    npyPath: rawDataPath('cf4.density-mean'),
    outPath: `public/data/${SCALAR_FIELD_DATA_PREFIX}/cf4_density.scfd`,
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
