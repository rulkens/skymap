/**
 * buildFlowField.ts — convert the CF4++ mean *velocity* + *density* .npy
 * arrays into the runtime `flowfield.scfd` (SCFD v3, channels = 4,
 * value_kind = 1) consumed by the flow-field particle renderer.
 *
 * Data provenance:
 *   Upstream is `CF4pp_mean_std_grids.npz` (Courtois 2025) from
 *   https://projets.ip2i.in2p3.fr/cosmicflows/ — a numpy ZIP archive of six
 *   128³ arrays (mean + std for density, Cartesian velocity, radial velocity)
 *   over a 1000 Mpc supergalactic box.  The maintainer extracts the two mean
 *   entries once:
 *
 *       unzip -j CF4pp_mean_std_grids.npz v_mean_CF4pp.npy d_mean_CF4pp.npy
 *
 *   …and uploads them to R2.  Contributors curl those instead of the 167 MB
 *   .npz.  See `data/raw/cf4/README.md` for the full fetch + build recipe.
 *
 * This is the 4-channel velocity analogue of `buildCf4Density.ts`: same .npy
 * loading, same f16 packing, the same numpy-C-order → WebGPU-x-fastest axis
 * transpose, the same observer-centred origin.  The differences are (a) the
 * velocity array is 4-D — three Cartesian components per cell — so we emit
 * `channels = 4` voxels (vx, vy, vz, δ); and (b) a velocity field needs
 * cross-channel normalisation stats (speed magnitude, percentiles) that a
 * per-channel min/max can't express, so we fold those into the SCFD header's
 * `velocityStats`.
 *
 * Pure Node/TS — no Python required.  Idempotent; prints what it generated;
 * exits non-zero on missing inputs.  Output is gitignored and synced to R2.
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
import type { Vec3 } from '../../src/@types/math/Vec3';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { attractorVoxel } from './flowFieldFrame';

/**
 * Physical voxel edge length, derived from the box size and grid resolution.
 * CF4++ ships a 1000 Mpc box on a 128³ grid in *physical* Mpc — identical to
 * the density cube (see `buildCf4Density.ts`).  We compute it from the loaded
 * N rather than hardcoding 128 so the script tracks a future resolution bump
 * automatically; the 1000 Mpc box extent is the load-bearing constant.
 */
const CF4PP_BOX_SIZE_MPC = 1000;

/**
 * A flat C-order velocity field plus its derived per-axis resolution and a
 * component accessor that hides the (3,N,N,N) vs (N,N,N,3) layout difference.
 * Component order is always SG-Cartesian (R = vx = SGX, …) — see the
 * load-bearing note in `buildFlowField`.
 */
type VelocityField = {
  readonly n: number;
  /** Read component `c` (0=vx,1=vy,2=vz) at SG cell (i, j, k). */
  readonly at: (c: 0 | 1 | 2, i: number, j: number, k: number) => number;
};

/**
 * Normalise the loaded velocity .npy — which may ship as either
 * `(3, N, N, N)` (component-leading) or `(N, N, N, 3)` (component-trailing)
 * — to a single component-last accessor.  Both layouts occur in the wild
 * (numpy `stack(axis=0)` vs `stack(axis=-1)`); rather than force one upstream
 * convention we detect from the shape and index accordingly.  The values
 * array is flat C-order in both cases, so the only thing that changes is the
 * linear-offset arithmetic.
 */
function asVelocityField(
  shape: readonly number[],
  values: Float64Array | Float32Array,
): VelocityField {
  if (shape.length !== 4) {
    throw new Error(`buildFlowField: expected a 4D velocity array, got shape ${shape.join('x')}`);
  }
  const componentLeading = shape[0] === 3;
  const componentTrailing = shape[3] === 3;
  if (!componentLeading && !componentTrailing) {
    throw new Error(
      `buildFlowField: velocity array has no 3-component axis (shape ${shape.join('x')}); ` +
        `expected (3,N,N,N) or (N,N,N,3)`,
    );
  }
  // The three spatial axes must be a cube.  N is whichever axis is not the
  // component axis (they're all equal for CF4++, but assert squareness so a
  // ragged array fails loudly rather than producing a skewed cube).
  const n = componentLeading ? shape[1]! : shape[0]!;
  const spatial = componentLeading
    ? [shape[1]!, shape[2]!, shape[3]!]
    : [shape[0]!, shape[1]!, shape[2]!];
  if (spatial.some((s) => s !== n)) {
    throw new Error(
      `buildFlowField: expected cubic spatial dims, got ${spatial.join('x')} (shape ${shape.join('x')})`,
    );
  }

  if (componentLeading) {
    // (3, N, N, N), C-order: offset = c*N*N*N + i*N*N + j*N + k.
    const stride = n * n * n;
    return {
      n,
      at: (c, i, j, k) => values[c * stride + i * n * n + j * n + k]!,
    };
  }
  // (N, N, N, 3), C-order: offset = (i*N*N + j*N + k)*3 + c.
  return {
    n,
    at: (c, i, j, k) => values[(i * n * n + j * n + k) * 3 + c]!,
  };
}

/** Load a flat C-order f32/f64 .npy, narrowing to a single numeric typed array. */
function loadNpyValues(path: string): {
  shape: number[];
  values: Float64Array | Float32Array;
} {
  const buf = readFileSync(path);
  const npy = readNpy(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  if (!(npy.values instanceof Float64Array) && !(npy.values instanceof Float32Array)) {
    throw new Error(`buildFlowField: expected f64 or f32 .npy at ${path}, got dtype ${npy.dtype}`);
  }
  return { shape: npy.shape, values: npy.values };
}

/**
 * The 99th-percentile value of an array.  Sorts a *copy* ascending and reads
 * index `floor(0.99 * (len - 1))`, the nearest-rank convention numpy's
 * `np.percentile(..., 99)` uses (linear interpolation aside — at 99% of ~2M
 * samples the interpolation weight is negligible).  A full sort over ~2M cells
 * is a one-off build cost; no need for a streaming selection algorithm.
 */
function percentile99(values: Float64Array): number {
  const sorted = values.slice();
  sorted.sort();
  return sorted[Math.floor(0.99 * (sorted.length - 1))]!;
}

/**
 * Build `flowfield.scfd` from the CF4++ mean velocity + density .npy arrays.
 *
 * Exported so tests can call it directly with synthetic tmpdir paths; the CLI
 * wrapper forwards the standard production paths.  All three arguments are
 * optional — omitting them targets the registered raw-data + public/data paths.
 */
export async function buildFlowField(args?: {
  vfieldNpyPath?: string;
  densityNpyPath?: string;
  outPath?: string;
}): Promise<void> {
  const vfieldNpyPath = args?.vfieldNpyPath ?? rawDataPath('cf4.vfield-mean');
  const densityNpyPath = args?.densityNpyPath ?? rawDataPath('cf4.density-mean');
  const outPath = args?.outPath ?? `public/data/${SCALAR_FIELD_DATA_PREFIX}/flowfield.scfd`;

  // ── 1. Load velocity (4D) + density (3D) ─────────────────────────────
  const vRaw = loadNpyValues(vfieldNpyPath);
  const vfield = asVelocityField(vRaw.shape, vRaw.values);
  const N = vfield.n;

  const dRaw = loadNpyValues(densityNpyPath);
  if (dRaw.shape.length !== 3 || dRaw.shape.some((s) => s !== N)) {
    throw new Error(
      `buildFlowField: density array shape ${dRaw.shape.join('x')} does not match the ` +
        `velocity cube's ${N}x${N}x${N}`,
    );
  }
  const density = dRaw.values;

  // ── 2. Stats ─────────────────────────────────────────────────────────
  // Speed is a *cross-channel* magnitude sqrt(vx²+vy²+vz²); per-cell speed and
  // δ feed the percentile helper.  These three stats (speed max, speed p99, δ
  // p99) are exactly what a per-channel min/max can't express — they ride in
  // the SCFD header's `velocityStats`.  δ min/max go in valueMin/valueMax.
  const speeds = new Float64Array(N * N * N);
  let speedKmsMax = 0;
  let deltaMin = +Infinity;
  let deltaMax = -Infinity;
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      for (let k = 0; k < N; k++) {
        const vx = vfield.at(0, i, j, k);
        const vy = vfield.at(1, i, j, k);
        const vz = vfield.at(2, i, j, k);
        const speed = Math.sqrt(vx * vx + vy * vy + vz * vz);
        speeds[i * N * N + j * N + k] = speed;
        if (speed > speedKmsMax) speedKmsMax = speed;
        const d = density[i * N * N + j * N + k]!;
        if (d < deltaMin) deltaMin = d;
        if (d > deltaMax) deltaMax = d;
      }
    }
  }
  // np.percentile(..., 99) over the flattened speed / δ arrays.
  const speedKmsP99 = percentile99(speeds);
  const deltaP99 = percentile99(new Float64Array(density));

  // ── 3. Pack 4-channel voxels with the C-order → x-fastest transpose ──
  // Identical axis transpose to buildCf4Density (numpy C-order axis 0 = SGX
  // slowest, axis 2 = SGZ fastest → WebGPU x-fastest), extended ×4 for the
  // interleaved (vx, vy, vz, δ) components.  See buildCf4Density's long
  // comment for why the transpose is required: a straight copy would swap the
  // cube's X and Z relative to the model matrix's local-x = SGX assumption.
  //
  // LOAD-BEARING ASSUMPTION: the velocity components stay in NATIVE SG order
  // with NO permutation and NO sign flip — vx → SGX (R), vy → SGY, vz → SGZ.
  // The npz velocity field is SG-Cartesian and aligned with the grid axes, so
  // a component already points along the same axis its index transposes into.
  // (Maintainer one-time check on real data: render the field and confirm
  // arrows flow *inward* toward the Great Attractor / Shapley, i.e. infall;
  // an outward flow would mean a global sign flip is needed here.)
  const voxels = new Uint16Array(N * N * N * 4);
  for (let i = 0; i < N; i++) {
    for (let j = 0; j < N; j++) {
      for (let k = 0; k < N; k++) {
        const outputIdx = k * N * N + j * N + i;
        const base = outputIdx * 4;
        voxels[base + 0] = f32ToF16Bits(vfield.at(0, i, j, k));
        voxels[base + 1] = f32ToF16Bits(vfield.at(1, i, j, k));
        voxels[base + 2] = f32ToF16Bits(vfield.at(2, i, j, k));
        voxels[base + 3] = f32ToF16Bits(density[i * N * N + j * N + k]!);
      }
    }
  }

  // ── 4. Geometry ──────────────────────────────────────────────────────
  // Observer-centred cube: voxel (N/2, N/2, N/2) sits at SG (0,0,0), so the
  // lower corner of voxel (0,0,0) is at -voxelSize × N/2 per axis.  Physical
  // Mpc (CF4++ is not Mpc/h), so no h-rescale.
  const voxelSizeMpc = CF4PP_BOX_SIZE_MPC / N;
  const origin: Vec3 = [-voxelSizeMpc * (N / 2), -voxelSizeMpc * (N / 2), -voxelSizeMpc * (N / 2)];

  // ── 5. Build the cube + encode ───────────────────────────────────────
  const cube: ScalarCube = {
    dims: [N, N, N],
    channels: 4,
    voxels,
    frameKind: 'supergalactic-cartesian',
    // Identity quaternion — the renderer composes the SG→EQ rotation from
    // frameKind; `rotation` is reserved for per-cube tilt offsets and ships
    // identity for vanilla SG cubes.  (See buildCf4Density's note.)
    origin,
    voxelSize: voxelSizeMpc,
    rotation: [0, 0, 0, 1],
    valueMin: deltaMin,
    valueMax: deltaMax,
    velocityStats: { speedKmsMax, speedKmsP99, deltaP99 },
  };

  const out = encodeScalarField(cube);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, Buffer.from(out));

  console.log(
    `[buildFlowField] wrote ${outPath} ` +
      `(dims=${N}x${N}x${N}, channels=4, voxelSize=${voxelSizeMpc.toFixed(3)} Mpc, ` +
      `speedMax=${speedKmsMax.toFixed(1)} km/s, speedP99=${speedKmsP99.toFixed(1)} km/s, ` +
      `δ=[${deltaMin.toFixed(3)}, ${deltaMax.toFixed(3)}], δP99=${deltaP99.toFixed(3)}, ` +
      `${out.byteLength} bytes)`,
  );

  // ── 6. Cheap frame self-check ────────────────────────────────────────
  // Confirm the cube's geometry places a known attractor inside its bounds —
  // a guard against an origin/voxelSize regression silently shipping a cube
  // whose voxel space no longer matches the SG anchors.  Logs only; does not
  // throw (the build still succeeded; this is operator signal, not a gate).
  const ga = attractorVoxel(
    { raHours: 16.25, decDeg: -60.84, distMpc: 68 },
    { origin, voxelSizeMpc, n: N },
  );
  console.log(
    `[buildFlowField] frame self-check: Great Attractor → voxel ` +
      `(${ga.voxel.map((v) => v.toFixed(1)).join(', ')}) ` +
      `${ga.inBounds ? 'IN BOUNDS' : 'OUT OF BOUNDS (frame mismatch!)'}`,
  );
}

// ── CLI wrapper ────────────────────────────────────────────────────────
async function main(): Promise<void> {
  await buildFlowField();
}

// Only run main() when invoked directly via tsx, not when imported by tests.
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
