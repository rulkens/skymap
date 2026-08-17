/**
 * buildMcpmVolume.ts — convert one downsampled `.npy` from
 * `tools/extractMcpmCube.py` into the runtime `mcpm-<tier>.scfd`
 * consumed by the scalar-volume renderer.
 *
 * Pure Node/TS — no Python required. Mirrors the conventions of
 * `tools/buildCf4Density.ts`; the log-normalise + f16-pack step is
 * shared via `src/utils/volume/packLogTraceVoxels.ts`.
 *
 * Output is gitignored and synced to R2 by `npm run sync-r2`.
 *
 * CLI:
 *   tsx tools/buildMcpmVolume.ts --factor=8|4|2  → one tier
 *   tsx tools/buildMcpmVolume.ts --all           → all three tiers
 *
 * Origin / voxel size are derived from the constants below (sourced from
 * the upstream `export_metadata.txt`); see `tests/data/mcpmAnchors.test.ts`
 * for the anti-drift pin on those constants.
 */

import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readNpy } from '../parsers/npyReader';
import { packLogTraceVoxels } from '../../src/utils/volume/packLogTraceVoxels';
import { quickLookSentinelPath } from '../utils/volume/quickLookSentinelPath';
import {
  encodeScalarField,
  SCALAR_FIELD_DATA_PREFIX,
} from '../../src/data/volume/scalarFieldFormat';
import type { ScalarCube } from '../../src/@types/data/volume/ScalarCube';
import { rawDataPath } from '../utils/io/rawDataRegistry';

/** Native MCPM cube dims per export_metadata.txt (X, Y, Z). */
export const MCPM_BASE_DIMS: readonly [number, number, number] = [712, 1200, 728];

/** Native voxel edge length: 556.288 Mpc / 712 voxels = 0.78131 Mpc. */
export const MCPM_BASE_VOXEL_EDGE_MPC = 0.78131;

/** Grid center in equatorial-cartesian comoving Mpc (observer at origin). */
export const MCPM_GRID_CENTER_MPC: readonly [number, number, number] = [
  -239.469, -16.5618, 201.275,
];

/** Tier filename mapping — keep aligned with src/@types/Tier and syncR2 ALLOW. */
export const MCPM_TIER_FILENAME: Record<8 | 4 | 2, string> = {
  8: 'mcpm-small.scfd',
  4: 'mcpm-medium.scfd',
  2: 'mcpm-large.scfd',
};

/** Derived per-tier dims/origin/voxelSize. Origin is tier-independent. */
export function mcpmTierAnchors(factor: 8 | 4 | 2): {
  dims: [number, number, number];
  origin: [number, number, number];
  voxelSize: number;
} {
  const origin: [number, number, number] = [
    MCPM_GRID_CENTER_MPC[0] - 0.5 * MCPM_BASE_DIMS[0] * MCPM_BASE_VOXEL_EDGE_MPC,
    MCPM_GRID_CENTER_MPC[1] - 0.5 * MCPM_BASE_DIMS[1] * MCPM_BASE_VOXEL_EDGE_MPC,
    MCPM_GRID_CENTER_MPC[2] - 0.5 * MCPM_BASE_DIMS[2] * MCPM_BASE_VOXEL_EDGE_MPC,
  ];
  const dims: [number, number, number] = [
    Math.round(MCPM_BASE_DIMS[0] / factor),
    Math.round(MCPM_BASE_DIMS[1] / factor),
    Math.round(MCPM_BASE_DIMS[2] / factor),
  ];
  return { dims, origin, voxelSize: MCPM_BASE_VOXEL_EDGE_MPC * factor };
}

/**
 * Build one MCPM tier .scfd from a downsampled .npy.
 *
 * Exported for direct invocation from tests; the CLI wrapper at the
 * bottom routes the standard production paths.
 *
 * @param args.npyPath        Path to the f32 .npy (3D, C-order).
 * @param args.outPath        Destination .scfd path.
 * @param args.origin         Override the cube's lower-corner origin in
 *                            equatorial-cartesian Mpc. Production callers
 *                            omit this — the CLI fills in tier-derived
 *                            values from `mcpmTierAnchors`. Tests pass
 *                            a synthetic value matching their tmpdir cube.
 * @param args.voxelSizeMpc   Voxel edge length in Mpc. Same override-vs-
 *                            tier-derived pattern as `origin`.
 */
export async function buildMcpmVolume(args: {
  npyPath: string;
  outPath: string;
  origin: [number, number, number];
  voxelSizeMpc: number;
}): Promise<void> {
  const { npyPath, outPath, origin, voxelSizeMpc } = args;

  // ── 1. Load .npy ─────────────────────────────────────────────────
  const npyBuf = readFileSync(npyPath);
  const npy = readNpy(
    npyBuf.buffer.slice(npyBuf.byteOffset, npyBuf.byteOffset + npyBuf.byteLength),
  );
  if (npy.shape.length !== 3) {
    throw new Error(`buildMcpmVolume: expected 3D array, got shape ${npy.shape.join('x')}`);
  }
  if (!(npy.values instanceof Float64Array) && !(npy.values instanceof Float32Array)) {
    throw new Error(`buildMcpmVolume: expected f64 or f32 .npy, got dtype ${npy.dtype}`);
  }
  const values: Float64Array | Float32Array = npy.values;
  const dims: [number, number, number] = [npy.shape[0]!, npy.shape[1]!, npy.shape[2]!];

  // ── 2. Stats + log-normalise + f16-pack (shared with the rhizome
  // importer — see packLogTraceVoxels for the normalisation derivation
  // and the C-order→x-fastest transpose it performs) ─────────────────
  const { voxels, valueMin, valueMax } = packLogTraceVoxels(values, dims);

  // ── 3. Build the data-only cube ────────────────────────────────────
  const cube: ScalarCube = {
    dims,
    channels: 1,
    voxels,
    // Equatorial-cartesian: the export_metadata.txt grid center is given
    // in equatorial-cartesian comoving Mpc with observer at origin —
    // same frame SDSS spectroscopic positions live in. The renderer's
    // FRAME_TO_WORLD['equatorial-cartesian'] is identity; no rotation
    // composed underneath, so this `rotation` field is identity too.
    frameKind: 'equatorial-cartesian',
    origin,
    voxelSize: voxelSizeMpc,
    rotation: [0, 0, 0, 1],
    valueMin,
    valueMax,
  };

  const out = encodeScalarField(cube);
  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, Buffer.from(out));

  console.log(
    `[buildMcpmVolume] wrote ${outPath} ` +
      `(dims=${dims.join('x')}, voxelSize=${voxelSizeMpc.toFixed(3)} Mpc, ` +
      `min=${valueMin.toFixed(3)}, max=${valueMax.toFixed(3)}, ` +
      `${out.byteLength} bytes)`,
  );
}

/** Build a single tier from data/raw/mcpm/mcpm_sdss_d{factor}.npy. */
export async function buildMcpmTier(factor: 8 | 4 | 2): Promise<void> {
  const a = mcpmTierAnchors(factor);
  await buildMcpmVolume({
    npyPath: join(rawDataPath('mcpm.dir'), `mcpm_sdss_d${factor}.npy`),
    outPath: `public/data/${SCALAR_FIELD_DATA_PREFIX}/${MCPM_TIER_FILENAME[factor]}`,
    origin: a.origin,
    voxelSizeMpc: a.voxelSize,
  });
  // A real large-tier rebuild retires any quick-look calibration cube left
  // at this same path — force: true because the sentinel is absent on
  // almost every run (written by buildRhizomeVolume when its output
  // targets this file).
  if (factor === 2) rmSync(quickLookSentinelPath('public/data'), { force: true });
}

// ── CLI wrapper ────────────────────────────────────────────────────
async function main(): Promise<void> {
  const arg = process.argv[2] ?? '--all';
  if (arg === '--all') {
    for (const f of [8, 4, 2] as const) await buildMcpmTier(f);
    return;
  }
  const m = /^--factor=(8|4|2)$/.exec(arg);
  if (!m) {
    console.error(`usage: tsx tools/buildMcpmVolume.ts [--all | --factor=8|4|2]`);
    process.exit(1);
  }
  await buildMcpmTier(Number(m[1]) as 8 | 4 | 2);
}

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
