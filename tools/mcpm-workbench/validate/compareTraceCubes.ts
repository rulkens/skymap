/**
 * compareTraceCubes — CLI comparing two trace cubes (workbench vs fork
 * export) by TV distance on their histograms and max relative deviation on
 * their axis marginals. Reports numbers only — T23 sets acceptance bands
 * from a measured noise floor, not this task (spec §9, §13).
 *
 * Usage: see printUsage() below, or the module header in task-T22-brief.md.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { basename, dirname, extname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { readNpy } from '../../parsers/npyReader';
import { parsePolyphyTraceSidecar } from '../../parsers/polyphyTraceSidecar';
import { readTraceCube } from './readTraceCube';
import { decodeF16 } from './decodeF16';
import { cOrderToXFastest } from './cOrderToXFastest';
import { traceHistogram } from './traceHistogram';
import { dataPointHistogram } from './dataPointHistogram';
import { axisMarginals } from './axisMarginals';
import { totalVariation } from './totalVariation';
import { parseExportMetadata } from './parseExportMetadata';
import { readPackedCatalog } from './readPackedCatalog';
import type { Vec3 } from '../../../src/@types/math/Vec3';
import type { PackedTraceInputLayout } from '../../../src/utils/volume/packLogTraceVoxels';
import type { TraceStats } from '../@types/TraceStats';

const LOG_HISTOGRAM_BIN_COUNT = 64;
const DEFAULT_DATA_POINT_BINS = 17; // the fork's N_HISTOGRAM_BINS

export type CompareTraceCubesArgs = {
  readonly aPath: string;
  readonly bPath: string;
  readonly dims: Vec3; // applies to whichever side(s) are headerless .bin
  readonly metaPath?: string; // origin + voxel size for a headerless .bin side
  readonly pointsPath?: string; // fork's flat f32 [X, Y, Z, W] packed catalog
  readonly bins?: number; // dataPointHistogram bin count, default 17
  // .npy voxel order, overriding whatever the sidecar's own `voxel_order` says (if
  // anything) — see resolveNpyOrder. Meaningless for a .bin side, which is always
  // x-fastest (readTraceCube's own documented contract; no writer in this codebase
  // produces a C-order .bin).
  readonly aOrder?: PackedTraceInputLayout;
  readonly bOrder?: PackedTraceInputLayout;
};

export type ComparisonReport = {
  readonly dims: Vec3;
  readonly aStats: TraceStats;
  readonly bStats: TraceStats;
  readonly logHistogramTV: number;
  readonly dataPointHistogramTV: number;
  readonly marginalMaxRelDev: readonly [number, number, number];
};

type CubeShape = { readonly values: Float64Array | Float32Array; readonly dims: Vec3 };

function isNpy(path: string): boolean {
  return path.toLowerCase().endsWith('.npy');
}

// readNpy/readPackedCatalog take a single ArrayBuffer with no offset param,
// so a copy is required unless `raw` already spans its whole backing buffer
// at offset 0 — true for any real-size readFileSync (Node only pools small
// reads); at the anchor's multi-GB scale this is always the zero-copy path.
function wholeArrayBuffer(raw: Buffer): ArrayBuffer {
  if (raw.byteOffset === 0 && raw.buffer.byteLength === raw.byteLength) {
    return raw.buffer as ArrayBuffer;
  }
  return raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.byteLength) as ArrayBuffer;
}

// 4D PolyPhy raw exports carry a trailing singleton axis; squeezing it here
// (same rule buildRhizomeVolume.ts uses) keeps both raw and pre-squeezed
// .npy exports readable without a flag.
function squeezeTrailingSingleton(shape: readonly number[]): readonly number[] {
  return shape.length === 4 && shape[3] === 1 ? shape.slice(0, 3) : shape;
}

// X1 (final-review.md §A): every .npy this comparator ever read went straight into
// axisMarginals/dataPointHistogram, both of which index x-fastest — correct for a .bin
// (readTraceCube's own layout) but NOT for exportNpy.ts's C-order .npy output, silently
// transposing X and Z. A blanket "all .npy are C-order" fix would be equally wrong: the
// T23 downsample helper writes genuinely x-fastest .npy. So the order must come from
// somewhere explicit per file — the sidecar's own `voxel_order` (preferred; recorded by
// emitTraceSidecar.ts) or an explicit --a-order/--b-order override — never a default.
function resolveNpyOrder(
  path: string,
  explicit: PackedTraceInputLayout | undefined,
): PackedTraceInputLayout {
  if (explicit !== undefined) return explicit;
  let sidecarOrder: PackedTraceInputLayout | undefined;
  try {
    sidecarOrder = parsePolyphyTraceSidecar(readFileSync(sidecarPathFor(path), 'utf8')).voxelOrder;
  } catch {
    sidecarOrder = undefined; // no sidecar, or one that predates the voxel_order field
  }
  if (sidecarOrder !== undefined) return sidecarOrder;
  throw new Error(
    `compareTraceCubes: ${path} is a .npy with no voxel_order in its sidecar (or no sidecar at ` +
      "all) — pass --a-order/--b-order explicitly ('x-fastest' or 'c-order'). A silent default " +
      'is exactly the bug this flag exists to prevent (final-review.md §A/X1).',
  );
}

// Order-agnostic: reads the .npy/.bin bytes and its declared dims only, no sidecar touch —
// keeps the pre-existing "shape mismatch fails before any --meta/--points file is touched"
// fast-fail (compareTraceCubes calls assertSameDims on this BEFORE normalizeOrder runs).
function loadShape(path: string, dims: Vec3): CubeShape {
  if (!isNpy(path)) return { values: readTraceCube(path, dims), dims };

  const raw = readFileSync(path);
  const npy = readNpy(wholeArrayBuffer(raw));
  const shape = squeezeTrailingSingleton(npy.shape);
  if (shape.length !== 3) {
    throw new Error(`compareTraceCubes: ${path} is not a 3D cube (shape ${npy.shape.join('x')})`);
  }
  const npyDims: Vec3 = [shape[0]!, shape[1]!, shape[2]!];
  const values = npy.values instanceof Uint16Array ? decodeF16(npy.values) : npy.values;
  return { values, dims: npyDims };
}

// Applied AFTER the shape check (see loadShape). A no-op for .bin — always x-fastest already.
function normalizeOrder(
  path: string,
  shape: CubeShape,
  order: PackedTraceInputLayout | undefined,
): CubeShape {
  if (!isNpy(path)) return shape;
  if (resolveNpyOrder(path, order) !== 'c-order') return shape;
  return { values: cOrderToXFastest(shape.values, shape.dims), dims: shape.dims };
}

function assertSameDims(aPath: string, aDims: Vec3, bPath: string, bDims: Vec3): void {
  if (aDims[0] === bDims[0] && aDims[1] === bDims[1] && aDims[2] === bDims[2]) return;
  throw new Error(
    `compareTraceCubes: shape mismatch — ${aPath} is ${aDims.join('x')}, ${bPath} is ${bDims.join('x')}`,
  );
}

function sidecarPathFor(npyPath: string): string {
  return join(dirname(npyPath), basename(npyPath, extname(npyPath)) + '.json');
}

function resolveOrigin(
  path: string,
  metaPath: string | undefined,
): { originMpc: Vec3; voxelSizeMpc: Vec3 } {
  if (isNpy(path)) {
    const sidecar = parsePolyphyTraceSidecar(readFileSync(sidecarPathFor(path), 'utf8'));
    return { originMpc: sidecar.originMpc, voxelSizeMpc: sidecar.voxelSizeMpc };
  }
  if (metaPath === undefined) {
    throw new Error(
      `compareTraceCubes: --points was given but ${path} is a headerless .bin with no --meta ` +
        '(need origin + voxel size to map points into its voxel grid)',
    );
  }
  const raw = readFileSync(metaPath);
  const meta = parseExportMetadata(raw.toString('utf8'));
  return { originMpc: meta.originMpc, voxelSizeMpc: meta.voxelSizeMpc };
}

// Fork's flat f32 [X, Y, Z, W] packed catalog (T21's format) — W (weight) is
// unused here; meanLogTraceAtPoints is an unweighted mean per spec §9.
function loadPackedCatalogPositions(path: string): { positions: Float32Array; count: number } {
  const raw = readFileSync(path);
  const { positions, count } = readPackedCatalog(wholeArrayBuffer(raw));
  return { positions, count };
}

function statsFor(
  values: Float64Array | Float32Array,
  dims: Vec3,
  maxLogTrace: number,
  bins: number,
  points:
    | { positions: Float32Array; count: number; originMpc: Vec3; voxelSizeMpc: Vec3 }
    | undefined,
): TraceStats {
  const logHistogram = traceHistogram(values, LOG_HISTOGRAM_BIN_COUNT, maxLogTrace);
  // axisMarginals now accepts f32 directly (see its doc comment) — no widen,
  // no copy, load-bearing at the anchor's ~622M-voxel scale.
  const marginals = axisMarginals(values, dims);
  if (points === undefined) {
    return {
      logHistogram,
      dataPointHistogram: new Float64Array(bins),
      marginals,
      meanLogTraceAtPoints: NaN,
    };
  }
  const { histogram, meanLogTrace } = dataPointHistogram({
    values,
    dims,
    originMpc: points.originMpc,
    voxelSizeMpc: points.voxelSizeMpc,
    pointsMpc: points.positions,
    pointCount: points.count,
    binCount: bins,
    maxLogTrace,
  });
  return {
    logHistogram,
    dataPointHistogram: histogram,
    marginals,
    meanLogTraceAtPoints: meanLogTrace,
  };
}

function maxOf(values: Float64Array | Float32Array): number {
  let m = 0;
  for (let i = 0; i < values.length; i++) m = Math.max(m, Math.log1p(Math.max(values[i]!, 0)));
  return m;
}

function maxRelDev(a: Float64Array, b: Float64Array): number {
  let dev = 0;
  for (let i = 0; i < a.length; i++) {
    const denom = Math.max(Math.abs(a[i]!), Math.abs(b[i]!), 1e-12);
    dev = Math.max(dev, Math.abs(a[i]! - b[i]!) / denom);
  }
  return dev;
}

export async function compareTraceCubes(args: CompareTraceCubesArgs): Promise<ComparisonReport> {
  const bins = args.bins ?? DEFAULT_DATA_POINT_BINS;

  // Fail fast: shape check happens before any --meta/--points file is
  // touched, so a shape mismatch is reported in microseconds regardless of
  // whether those optional inputs even exist on disk.
  const aRaw = loadShape(args.aPath, args.dims);
  const bRaw = loadShape(args.bPath, args.dims);
  assertSameDims(args.aPath, aRaw.dims, args.bPath, bRaw.dims);
  const a = normalizeOrder(args.aPath, aRaw, args.aOrder);
  const b = normalizeOrder(args.bPath, bRaw, args.bOrder);

  const maxLogTrace = Math.max(maxOf(a.values), maxOf(b.values));

  let pointsA:
    | { positions: Float32Array; count: number; originMpc: Vec3; voxelSizeMpc: Vec3 }
    | undefined;
  let pointsB: typeof pointsA;
  if (args.pointsPath !== undefined) {
    const { positions, count } = loadPackedCatalogPositions(args.pointsPath);
    const originA = resolveOrigin(args.aPath, args.metaPath);
    const originB = resolveOrigin(args.bPath, args.metaPath);
    pointsA = { positions, count, ...originA };
    pointsB = { positions, count, ...originB };
  }

  const aStats = statsFor(a.values, a.dims, maxLogTrace, bins, pointsA);
  const bStats = statsFor(b.values, b.dims, maxLogTrace, bins, pointsB);

  const marginalMaxRelDev: [number, number, number] = [0, 0, 0];
  for (let axis = 0; axis < 3; axis++) {
    marginalMaxRelDev[axis] = maxRelDev(aStats.marginals[axis]!, bStats.marginals[axis]!);
  }

  return {
    dims: a.dims,
    aStats,
    bStats,
    logHistogramTV: totalVariation(aStats.logHistogram, bStats.logHistogram),
    dataPointHistogramTV:
      args.pointsPath !== undefined
        ? totalVariation(aStats.dataPointHistogram, bStats.dataPointHistogram)
        : NaN,
    marginalMaxRelDev,
  };
}

function statsToJson(s: TraceStats) {
  return {
    logHistogram: Array.from(s.logHistogram),
    dataPointHistogram: Array.from(s.dataPointHistogram),
    marginals: s.marginals.map((m) => Array.from(m)),
    meanLogTraceAtPoints: s.meanLogTraceAtPoints,
  };
}

function printUsage(): void {
  console.log(
    'Usage: npx tsx tools/mcpm-workbench/validate/compareTraceCubes.ts \\\n' +
      '  --a <cube.bin|cube.npy> --b <cube.bin|cube.npy> --dims Nx,Ny,Nz \\\n' +
      '  [--meta export_metadata.txt] [--points packed-catalog.bin] [--bins 17] [--json out.json] \\\n' +
      '  [--a-order x-fastest|c-order] [--b-order x-fastest|c-order]\n' +
      "--a-order/--b-order override a .npy side's sidecar `voxel_order`; required when that\n" +
      'side is a .npy with no sidecar (or a sidecar older than the voxel_order field).',
  );
}

function parseVoxelOrder(flag: string, raw: string | undefined): PackedTraceInputLayout {
  if (raw !== 'x-fastest' && raw !== 'c-order') {
    throw new Error(`compareTraceCubes: ${flag} must be "x-fastest" or "c-order", got "${raw}"`);
  }
  return raw;
}

function parseArgv(argv: readonly string[]): CompareTraceCubesArgs {
  let aPath: string | undefined;
  let bPath: string | undefined;
  let dimsRaw: string | undefined;
  let metaPath: string | undefined;
  let pointsPath: string | undefined;
  let bins: number | undefined;
  let aOrder: PackedTraceInputLayout | undefined;
  let bOrder: PackedTraceInputLayout | undefined;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--a') aPath = argv[++i];
    else if (a === '--b') bPath = argv[++i];
    else if (a === '--dims') dimsRaw = argv[++i];
    else if (a === '--meta') metaPath = argv[++i];
    else if (a === '--points') pointsPath = argv[++i];
    else if (a === '--bins') bins = Number(argv[++i]);
    else if (a === '--a-order') aOrder = parseVoxelOrder('--a-order', argv[++i]);
    else if (a === '--b-order') bOrder = parseVoxelOrder('--b-order', argv[++i]);
    else if (a === '--json') i++; // consumed by main(), not this fn
  }
  if (aPath === undefined || bPath === undefined || dimsRaw === undefined) {
    printUsage();
    throw new Error('compareTraceCubes: --a, --b, and --dims are required');
  }
  const dimsParts = dimsRaw.split(',').map(Number);
  if (dimsParts.length !== 3 || dimsParts.some((n) => !Number.isInteger(n) || n <= 0)) {
    throw new Error(
      `compareTraceCubes: --dims must be "Nx,Ny,Nz" of positive integers, got "${dimsRaw}"`,
    );
  }
  const dims: Vec3 = [dimsParts[0]!, dimsParts[1]!, dimsParts[2]!];
  return {
    aPath,
    bPath,
    dims,
    ...(metaPath !== undefined ? { metaPath } : {}),
    ...(pointsPath !== undefined ? { pointsPath } : {}),
    ...(bins !== undefined ? { bins } : {}),
    ...(aOrder !== undefined ? { aOrder } : {}),
    ...(bOrder !== undefined ? { bOrder } : {}),
  };
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const jsonFlagIndex = argv.indexOf('--json');
  const jsonPath = jsonFlagIndex >= 0 ? argv[jsonFlagIndex + 1] : undefined;

  const args = parseArgv(argv);
  const report = await compareTraceCubes(args);

  console.log(`dims: ${report.dims.join('x')}`);
  console.log(`logHistogram TV distance:      ${report.logHistogramTV.toFixed(4)}`);
  console.log(
    `dataPointHistogram TV distance: ${Number.isNaN(report.dataPointHistogramTV) ? 'n/a (no --points)' : report.dataPointHistogramTV.toFixed(4)}`,
  );
  console.log(
    `axis marginal max relative deviation: x=${report.marginalMaxRelDev[0].toFixed(4)}, ` +
      `y=${report.marginalMaxRelDev[1].toFixed(4)}, z=${report.marginalMaxRelDev[2].toFixed(4)}`,
  );
  console.log(
    `meanLogTraceAtPoints: a=${report.aStats.meanLogTraceAtPoints}, b=${report.bStats.meanLogTraceAtPoints}`,
  );

  if (jsonPath !== undefined) {
    writeFileSync(
      jsonPath,
      JSON.stringify(
        {
          dims: report.dims,
          a: statsToJson(report.aStats),
          b: statsToJson(report.bStats),
          logHistogramTV: report.logHistogramTV,
          dataPointHistogramTV: report.dataPointHistogramTV,
          marginalMaxRelDev: report.marginalMaxRelDev,
        },
        null,
        2,
      ),
    );
    console.log(`wrote ${jsonPath}`);
  }
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  });
}
