/**
 * buildMcpmVolume.ts — convert one downsampled `.npy` from
 * `tools/extractMcpmCube.py` into the runtime `mcpm-<tier>.scfd`
 * consumed by the scalar-volume renderer.
 *
 * Pure Node/TS — no Python required. Mirrors the conventions of
 * `tools/buildCf4Density.ts`; the f16 packing helper is shared via
 * `tools/utils/math/f32ToF16Bits.ts`.
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

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readNpy } from '../parsers/npyReader';
import { f32ToF16Bits } from '../utils/math/f32ToF16Bits';
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

  // ── 2. Compute stats ─────────────────────────────────────────────
  let valueMin = +Infinity;
  let valueMax = -Infinity;
  for (let i = 0; i < values.length; i++) {
    const v = values[i]!;
    if (v < valueMin) valueMin = v;
    if (v > valueMax) valueMax = v;
  }

  // ── 3. Log normalisation log(1+v) / log(1+max) → [0, 1] and pack as f16 ──
  // MCPM trace density is non-negative AND heavy-tailed: the SDSS cube
  // has min=0, max≈40000, mean≈16, p99≈320 — values span four decades
  // and 99% of voxels sit in the bottom 0.8% of the linear range.
  //
  // The CF-4 builder uses symmetric normalisation [−half, +half] → [0, 1]
  // because CF-4 carries signed density contrast (overdensity δ) where
  // 0 means "cosmic mean" and the divergent palette wants that as the
  // transparent midpoint.  Re-using that here would map nearly every
  // MCPM voxel to LUT t≈0.5 (a single warm-red colour) and the
  // contrast slider would become a knife-edge — the user's first
  // visual check confirmed exactly this: contrast 1.00 → solid red,
  // 1.05 → filaments visible, 1.10 → overlay disappears.
  //
  // Log mapping (Polyphorm / MCPM convention) compresses the heavy tail
  // so that representative voxels span the full LUT range:
  //   v=0     → log(1)/log(1+max) = 0       (transparent void)
  //   v=16    → log(17)/log(40430) ≈ 0.27   (dim warm)
  //   v=320   → log(321)/log(40430) ≈ 0.54  (mid orange)
  //   v=40k+  → log(40430)/log(40430) = 1   (bright cream peak)
  // Now contrast=1.0 already shows structure; the slider tunes
  // emphasis instead of being a load-bearing visibility gate.
  //
  // We clamp v to ≥0 before log to guard against any negative noise
  // floor a future MCPM release might ship; today every value is
  // non-negative by construction.
  const safeMax = Math.max(0, valueMax);
  const logMax = Math.log(1 + safeMax);
  const invLogMax = logMax > 0 ? 1 / logMax : 0;
  const voxels = new Uint16Array(values.length);

  // ── Axis transpose: numpy C-order → WebGPU x-fastest ─────────────
  // Same transpose buildCf4Density.ts performs (lines 178-215). The .npy
  // from extractMcpmCube.py is C-order with axis 0 = X (slowest), axis 2
  // = Z (fastest). WebGPU's writeTexture interprets the buffer as
  // x-fastest. A straight copy would visually swap X and Z; the
  // tier-anchors test (Task 3) doesn't catch this — only a visual smoke
  // test or a per-axis fixture would. Keep the transpose in place.
  for (let i = 0; i < dims[0]; i++) {
    for (let j = 0; j < dims[1]; j++) {
      for (let k = 0; k < dims[2]; k++) {
        const inputIdx = i * dims[1] * dims[2] + j * dims[2] + k;
        const outputIdx = k * dims[1] * dims[0] + j * dims[0] + i;
        const v = Math.max(0, values[inputIdx]!);
        const normalised = Math.log(1 + v) * invLogMax;
        const clamped = normalised < 0 ? 0 : normalised > 1 ? 1 : normalised;
        voxels[outputIdx] = f32ToF16Bits(clamped);
      }
    }
  }

  // ── 4. Build the data-only cube ────────────────────────────────────
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
