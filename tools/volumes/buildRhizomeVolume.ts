/**
 * buildRhizomeVolume.ts — convert one PolyPhy-exported MCPM trace `.npy` +
 * its `polyphy-trace` v1 sidecar into an SCFD v3 `.scfd`. Sidecar is
 * discovered at the npy's basename with a `.json` extension — no override
 * flag; a mismatched cube/sidecar pair is a provenance bug the tool
 * refuses to make expressible (spec Decision 2).
 *
 * Reuses `packLogTraceVoxels` (shared with `buildMcpmVolume.ts`) so the
 * calibration quick-look and the shipped MCPM reference render under
 * identical normalisation (spec Decision 1). CLI usage: see `printUsage()`.
 *
 * Spec: docs/superpowers/specs/2026-08-10-rhizome-scfd-importer-design.md
 */

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join, resolve } from 'node:path';
import { buildDataManifest } from '../deploy/buildDataManifest';
import { readNpy } from '../parsers/npyReader';
import { parsePolyphyTraceSidecar } from '../parsers/polyphyTraceSidecar';
import { packLogTraceVoxels } from '../../src/utils/volume/packLogTraceVoxels';
import { quickLookSentinelPath } from '../utils/volume/quickLookSentinelPath';
import { MCPM_TIER_FILENAME } from './buildMcpmVolume';
import {
  encodeScalarField,
  SCALAR_FIELD_DATA_PREFIX,
} from '../../src/data/volume/scalarFieldFormat';
import type { ScalarCube } from '../../src/@types/data/volume/ScalarCube';
import type { Vec3 } from '../../src/@types/math/Vec3';

function sidecarPathFor(npyPath: string): string {
  return join(dirname(npyPath), basename(npyPath, extname(npyPath)) + '.json');
}

// PolyPhy's raw exporter writes 4D (X, Y, Z, 1); the fork's pre-squeezed
// outputs are already 3D. Squeezing here — before the rank check and the
// dims-vs-sidecar check below — makes the importer robust to either shape
// (spec: ".npy contract"). A trailing-1 axis has stride 1 in C-order, so
// the flat `values` buffer needs no reshape: the 3D index arithmetic in
// `packLogTraceVoxels` reads it correctly as-is.
function squeezeTrailingSingleton(shape: readonly number[]): readonly number[] {
  return shape.length === 4 && shape[3] === 1 ? shape.slice(0, 3) : shape;
}

// Pure path comparison, split out of buildRhizomeVolume() so the R2-guard
// branch (item below) is pinnable by a test without touching the real
// public/data directory.
export function isQuickLookOutput(outPath: string): boolean {
  return (
    resolve(outPath) === resolve('public/data', SCALAR_FIELD_DATA_PREFIX, MCPM_TIER_FILENAME[2])
  );
}

export async function buildRhizomeVolume(args: {
  npyPath: string;
  outPath: string;
}): Promise<void> {
  const { npyPath, outPath } = args;

  // ── 1. Sidecar (rule 1; rules 2-5 are parsePolyphyTraceSidecar's job) ──
  const sidecarPath = sidecarPathFor(npyPath);
  if (!existsSync(sidecarPath)) {
    throw new Error(
      `buildRhizomeVolume: no sidecar at ${sidecarPath}; the exporter must write a ` +
        `polyphy-trace v1 JSON next to the .npy (same basename) — see ` +
        `docs/superpowers/specs/2026-08-10-rhizome-scfd-importer-design.md`,
    );
  }
  const sidecar = parsePolyphyTraceSidecar(readFileSync(sidecarPath, 'utf8'));
  if (sidecar.provenance !== undefined) {
    console.log('[buildRhizomeVolume] provenance:', sidecar.provenance);
  }
  if (sidecar.valueUnits !== undefined) {
    console.log(`[buildRhizomeVolume] value_units: ${sidecar.valueUnits}`);
  }

  // ── 2. Load .npy (same Buffer→ArrayBuffer slice as buildMcpmVolume) ──
  const npyBuf = readFileSync(npyPath);
  const npy = readNpy(
    npyBuf.buffer.slice(npyBuf.byteOffset, npyBuf.byteOffset + npyBuf.byteLength),
  );

  const squeezedShape = squeezeTrailingSingleton(npy.shape);
  if (squeezedShape.length !== 3) {
    throw new Error(
      `buildRhizomeVolume: expected 3D cube (or 4D with trailing singleton), got shape ${npy.shape.join('x')}`,
    );
  }
  const dims: Vec3 = [squeezedShape[0]!, squeezedShape[1]!, squeezedShape[2]!];

  // Rule 9 — readNpy happily decodes `<f2` to raw f16 bits; rejecting it is
  // ours to do. Half precision loses real information before block-average
  // + log-normalise (same reasoning as extractMcpmCube.py's f32 upcast).
  if (!(npy.values instanceof Float64Array) && !(npy.values instanceof Float32Array)) {
    throw new Error(
      `buildRhizomeVolume: expected f32/f64 .npy, got dtype ${npy.dtype} ` +
        `(f16 input loses precision before normalisation — export f32)`,
    );
  }
  const values: Float64Array | Float32Array = npy.values;

  if (dims[0] !== sidecar.dims[0] || dims[1] !== sidecar.dims[1] || dims[2] !== sidecar.dims[2]) {
    throw new Error(
      `buildRhizomeVolume: npy shape ${dims.join('x')} does not match sidecar dims ` +
        `${sidecar.dims.join('x')} — stale sidecar?`,
    );
  }

  // ── 3. Voxel-size spread assert + mean collapse (rule 6) — ahead of the
  // pack so a bad sidecar rejects in microseconds, not after 42M voxels of
  // pack work.
  //
  // SCFD's header stores a single cubic voxel_size (scalarFieldFormat.ts:40)
  // but PolyPhy rounds grid dims per axis, so the sidecar's triple can
  // disagree slightly. A small disagreement is exporter rounding noise and
  // collapsing to the mean is fine; a large one means the cube isn't really
  // cubic and averaging would silently squash it. If a real export trips
  // this, fix the exporter's grid rounding — don't raise the tolerance.
  const [vx, vy, vz] = sidecar.voxelSizeMpc;
  const meanVoxelSize = (vx + vy + vz) / 3;
  const spread = (Math.max(vx, vy, vz) - Math.min(vx, vy, vz)) / meanVoxelSize;
  if (spread > 0.005) {
    throw new Error(
      `buildRhizomeVolume: voxel_size_mpc spread ${(spread * 100).toFixed(2)}% exceeds 0.5% ` +
        `(sizes ${vx}, ${vy}, ${vz}); SCFD stores one cubic voxel size — fix the exporter's grid rounding`,
    );
  }
  const voxelSize = meanVoxelSize;

  // ── 4. Quick-look R2 guard — checked here, not just in the CLI's
  // --quick-look branch, so --out pointed at the same path is covered too
  // (both modes converge on this one call). Sentinel BEFORE the reference
  // write, not after: writeFileSync isn't atomic, so a mid-write failure
  // (ENOSPC, EIO) can leave outPath truncated. Setting early over-blocks
  // sync-r2 on an ordinary validation failure (annoying, recoverable with
  // build-mcpm); setting late would let a truncated reference ship with no
  // sentinel to catch it (dangerous, silent).
  if (isQuickLookOutput(outPath)) {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(
      quickLookSentinelPath('public/data'),
      `quick-look cube written by buildRhizomeVolume from ${npyPath}; ` +
        `run "npm run build-mcpm" to restore the shipped reference and clear this sentinel.\n`,
    );
  }

  // ── 5. Pack (shared with buildMcpmVolume.ts) ──
  const { voxels, valueMin, valueMax } = packLogTraceVoxels(values, dims);

  const cube: ScalarCube = {
    dims,
    channels: 1,
    voxels,
    frameKind: sidecar.frame,
    origin: sidecar.originMpc,
    voxelSize,
    // Identity — FRAME_TO_WORLD already applies the frame rotation; writing
    // it again here would compound it (buildCf4Density.ts:193-204).
    rotation: [0, 0, 0, 1],
    valueMin,
    valueMax,
  };

  const out = encodeScalarField(cube);
  writeFileSync(outPath, Buffer.from(out));

  console.log(
    `[buildRhizomeVolume] wrote ${outPath} ` +
      `(dims=${dims.join('x')}, voxelSize=${voxelSize.toFixed(4)} Mpc, ` +
      `min=${valueMin.toFixed(3)}, max=${valueMax.toFixed(3)}, ` +
      `${out.byteLength} bytes)`,
  );

  // The viewer resolves every data path through manifest.json, so a
  // quick-look write is invisible until the post-pass hashes it into
  // place and repoints the manifest entry (docs/DATA.md, "Content hash +
  // manifest"). Same isQuickLookOutput gate as the sentinel: only the
  // real guarded path triggers it — --out to a scratch dir never sweeps
  // public/data.
  if (isQuickLookOutput(outPath)) {
    buildDataManifest(resolve('public/data'));
  }
}

const SHELL_NAMES = ['inner', 'middle', 'outer'] as const;

function printUsage(): void {
  console.error(
    'usage: tsx tools/volumes/buildRhizomeVolume.ts <cube.npy> --out <path.scfd>\n' +
      '       tsx tools/volumes/buildRhizomeVolume.ts <cube.npy> --quick-look\n' +
      '       tsx tools/volumes/buildRhizomeVolume.ts <cube.npy> --shell inner|middle|outer',
  );
}

// ── CLI wrapper ────────────────────────────────────────────────────
// Exactly one of --out / --quick-look / --shell (Decision 4) — scan for
// all three rather than just the first flag, so "both --out and
// --quick-look" is caught as a usage error instead of silently taking
// whichever came first.
async function main(): Promise<void> {
  const [npyPath, ...rest] = process.argv.slice(2);
  const outIndex = rest.indexOf('--out');
  const hasQuickLook = rest.includes('--quick-look');
  const shellIndex = rest.indexOf('--shell');
  const modeCount = [outIndex !== -1, hasQuickLook, shellIndex !== -1].filter(Boolean).length;

  if (!npyPath || modeCount !== 1) {
    printUsage();
    process.exit(1);
  }

  if (outIndex !== -1) {
    const outPath = rest[outIndex + 1];
    if (!outPath) {
      printUsage();
      process.exit(1);
    }
    await buildRhizomeVolume({ npyPath, outPath });
    return;
  }

  if (hasQuickLook) {
    // Composed from the imported tier map, never a restated literal —
    // the filename has exactly one home (quickLookSentinelPath.ts). The
    // sentinel write itself lives in buildRhizomeVolume() (keyed off
    // outPath), so --out targeting this same path is guarded too.
    const outPath = `public/data/${SCALAR_FIELD_DATA_PREFIX}/${MCPM_TIER_FILENAME[2]}`;
    await buildRhizomeVolume({ npyPath, outPath });
    console.log(
      `[buildRhizomeVolume] quick-look cube is only visible with the MCPM tier set to ` +
        `large — the viewer fetches mcpm-<tier>.scfd per the tier setting. Reload the ` +
        `viewer: the manifest is fetched at boot.`,
    );
    console.log(
      `[buildRhizomeVolume] run "npm run build-mcpm" to restore the shipped reference ` +
        `and clear the quick-look sentinel.`,
    );
    return;
  }

  // --shell
  const shellName = rest[shellIndex + 1];
  if (!shellName || !(SHELL_NAMES as readonly string[]).includes(shellName)) {
    printUsage();
    process.exit(1);
  }
  // Argument surface is stable now so the later rhizome-shells plan lands
  // without a CLI-shape change; wiring to blockAverageCube is out of scope
  // here (spec Decision 4, plan Task 8).
  throw new Error(
    'buildRhizomeVolume: --shell is not implemented yet — it lands with the rhizome-shells plan',
  );
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
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
