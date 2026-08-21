/**
 * buildDustVolume.ts — convert one resolution's mean+std `.npy` pair from
 * `tools/volumes/extractDustCube.py` into the runtime
 * `edenhofer-dust-<tier>.scfd` (spec:
 * docs/superpowers/specs/2026-08-20-edenhofer-dust-volume.md, "Data
 * product and builder").
 *
 * Pure Node/TS — no Python required. The two cubes collapse to one
 * per-voxel value via `logNormalMedian` (log-normal median from mean+std,
 * de-biasing the posterior mean's void-brightening — grill Q3), then pack
 * through the *same* `packLogTraceVoxels` MCPM and the rhizome importer
 * share: dust density is non-negative and heavy-tailed exactly like the
 * MCPM slime trace, so log(1+v)/log(1+max) applies unchanged — no third
 * near-duplicate normaliser.
 *
 * CLI:
 *   tsx tools/volumes/buildDustVolume.ts --res=128|256|384  → one tier
 *   tsx tools/volumes/buildDustVolume.ts --all              → all three tiers
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readNpy } from '../parsers/npyReader';
import { packLogTraceVoxels } from '../../src/utils/volume/packLogTraceVoxels';
import { logNormalMedian } from '../utils/volume/logNormalMedian';
import {
  encodeScalarField,
  SCALAR_FIELD_DATA_PREFIX,
} from '../../src/data/volume/scalarFieldFormat';
import type { ScalarCube } from '../../src/@types/data/volume/ScalarCube';
import type { Vec3 } from '../../src/@types/math/Vec3';
import { rawDataPath } from '../utils/io/rawDataRegistry';

/** Fixed Sun-centered box the resample step always produces (spec grill Q2). */
export const DUST_HALF_EXTENT_MPC = 1.25 / 1000; // ±1.25 kpc

/** Tier resolution → filename, mirroring MCPM's tier semantics exactly. */
export const DUST_TIER_FILENAME: Record<128 | 256 | 384, string> = {
  128: 'edenhofer-dust-small.scfd',
  256: 'edenhofer-dust-medium.scfd',
  384: 'edenhofer-dust-large.scfd',
};

/** Derived per-tier dims/origin/voxelSize for a Sun-centered ±1.25 kpc cube. */
export function dustTierAnchors(res: 128 | 256 | 384): {
  dims: Vec3;
  origin: Vec3;
  voxelSize: number;
} {
  return {
    dims: [res, res, res],
    origin: [-DUST_HALF_EXTENT_MPC, -DUST_HALF_EXTENT_MPC, -DUST_HALF_EXTENT_MPC],
    voxelSize: (2 * DUST_HALF_EXTENT_MPC) / res,
  };
}

function loadCube(npyPath: string): { values: Float64Array | Float32Array; dims: Vec3 } {
  const buf = readFileSync(npyPath);
  const npy = readNpy(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  if (npy.shape.length !== 3) {
    throw new Error(`buildDustVolume: expected 3D array, got shape ${npy.shape.join('x')}`);
  }
  if (!(npy.values instanceof Float64Array) && !(npy.values instanceof Float32Array)) {
    throw new Error(`buildDustVolume: expected f64 or f32 .npy, got dtype ${npy.dtype}`);
  }
  return { values: npy.values, dims: [npy.shape[0]!, npy.shape[1]!, npy.shape[2]!] };
}

/**
 * Build one Edenhofer dust tier .scfd from a mean/std .npy pair.
 *
 * Exported for direct invocation from tests; the CLI wrapper at the
 * bottom routes the standard production paths.
 *
 * @param args.meanNpyPath  Path to the f32/f64 mean .npy (3D, C-order).
 * @param args.stdNpyPath   Path to the matching std .npy — same shape.
 * @param args.outPath      Destination .scfd path.
 * @param args.origin       Cube's lower-corner origin in equatorial-
 *                          cartesian Mpc. Production callers omit this —
 *                          the CLI fills in tier-derived values from
 *                          `dustTierAnchors`. Tests pass a synthetic value.
 * @param args.voxelSizeMpc Voxel edge length in Mpc. Same override-vs-
 *                          tier-derived pattern as `origin`.
 */
export async function buildDustVolume(args: {
  meanNpyPath: string;
  stdNpyPath: string;
  outPath: string;
  origin: Vec3;
  voxelSizeMpc: number;
}): Promise<void> {
  const { meanNpyPath, stdNpyPath, outPath, origin, voxelSizeMpc } = args;

  // ── 1. Load both cubes ──────────────────────────────────────────────
  const mean = loadCube(meanNpyPath);
  const std = loadCube(stdNpyPath);
  if (mean.dims.join('x') !== std.dims.join('x')) {
    throw new Error(
      `buildDustVolume: mean shape ${mean.dims.join('x')} does not match std shape ${std.dims.join('x')}`,
    );
  }
  if (mean.values.length !== std.values.length) {
    throw new Error('buildDustVolume: mean/std voxel counts do not match');
  }
  const dims = mean.dims;

  // ── 2. Log-normal median collapse, then the shared MCPM pack ────────
  const median = new Float64Array(mean.values.length);
  for (let i = 0; i < median.length; i++) {
    median[i] = logNormalMedian(mean.values[i]!, std.values[i]!);
  }
  const { voxels, valueMin, valueMax } = packLogTraceVoxels(median, dims);

  // ── 3. Build the data-only cube ──────────────────────────────────────
  const cube: ScalarCube = {
    dims,
    channels: 1,
    voxels,
    // Native frame is galactic — Edenhofer's HEALPix maps and
    // interp2box.py's cartesian box are both galactic, not equatorial.
    // `FRAME_TO_WORLD['galactic']` (buildCubeModelMatrix.ts) is an
    // unexercised identity stub today (no shipped cube used 'galactic'
    // before this one); it gets the real GAL→EQ rotation in the
    // renderer-slice PR, this cube's first consumer. `rotation` stays
    // identity regardless — it's reserved for per-cube tilt on top of
    // FRAME_TO_WORLD, and baking the frame rotation in here would
    // compound with FRAME_TO_WORLD once that entry is fixed (the
    // double-rotation bug buildCf4Density.ts's step 5 comment warns
    // about for the supergalactic case).
    frameKind: 'galactic',
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
    `[buildDustVolume] wrote ${outPath} ` +
      `(dims=${dims.join('x')}, voxelSize=${voxelSizeMpc.toFixed(6)} Mpc, ` +
      `min=${valueMin.toFixed(3)}, max=${valueMax.toFixed(3)}, ` +
      `${out.byteLength} bytes)`,
  );
}

/** Build a single tier from the resample cache dir's mean/std .npy pair. */
export async function buildDustTier(res: 128 | 256 | 384): Promise<void> {
  const a = dustTierAnchors(res);
  const cacheDir = rawDataPath('edenhofer.cache-dir');
  await buildDustVolume({
    meanNpyPath: join(cacheDir, `edenhofer_mean_${res}.npy`),
    stdNpyPath: join(cacheDir, `edenhofer_std_${res}.npy`),
    outPath: `public/data/${SCALAR_FIELD_DATA_PREFIX}/${DUST_TIER_FILENAME[res]}`,
    origin: a.origin,
    voxelSizeMpc: a.voxelSize,
  });
}

// ── CLI wrapper ────────────────────────────────────────────────────
async function main(): Promise<void> {
  const arg = process.argv[2] ?? '--all';
  if (arg === '--all') {
    for (const r of [128, 256, 384] as const) await buildDustTier(r);
    return;
  }
  const m = /^--res=(128|256|384)$/.exec(arg);
  if (!m) {
    console.error(`usage: tsx tools/volumes/buildDustVolume.ts [--all | --res=128|256|384]`);
    process.exit(1);
  }
  await buildDustTier(Number(m[1]) as 128 | 256 | 384);
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
