/**
 * buildVolumePyramid.ts <field> — one density field's `volume-pyramid/v1/` files from its whole-grid
 * block-mean `.npy` levels: a sidecar plus L1–L3 as ASTC 6×6, BC4 and r8 (spec §4–§5). Mean first,
 * log second: the extractors average the raw trace, `encodeVolumeLevel` logs each level against the
 * native peak. The level files are checked against `volumePyramidLevels`, the loader's own sizes.
 *
 * Needs basisu v2.50.0 (`brew install basis_universal`). CLI: `npm run build-mcpm` / `build-2mrs`.
 */

import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readNpy } from '../parsers/npyReader';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { encodeVolumeLevel } from './utils/encodeVolumeLevel';
import { basisuEncodeLevel } from './utils/basisuEncodeLevel';
import { VOLUME_PYRAMID_FIELDS } from './data/volumePyramidFields';
import { MAX_CROP_LOSS } from './data/maxCropLoss';
import { PYRAMID_LEVELS } from './data/pyramidLevels';
import { VISIBLE_CODE } from './data/visibleCode';
import { VOLUME_PYRAMID_FORMATS } from '../../src/data/volume/volumePyramidFormats';
import { VOLUME_PYRAMID_DATA_PREFIX } from '../../src/data/volume/volumePyramidDataPrefix';
import { volumePyramidLevelPath } from '../../src/utils/volume/volumePyramidLevelPath';
import { volumePyramidLevels } from '../../src/utils/volume/volumePyramidLevels';
import type { VolumePyramidFieldRow } from '../@types/volumes/VolumePyramidFieldRow';
import type { VolumePyramidSidecar } from '../../src/@types/data/volume/VolumePyramidSidecar';
import type { Vec3 } from '../../packages/shared/src/@types/math/Vec3';

const shift = (v: Vec3, k: number): Vec3 => [v[0] >> k, v[1] >> k, v[2] >> k];

function readLevel(row: VolumePyramidFieldRow, k: 1 | 2 | 3): Float32Array | Float64Array {
  const path = join(rawDataPath(row.npy.dir), `${row.npy.stem}_d${2 ** k}.npy`);
  const buf = readFileSync(path);
  const npy = readNpy(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength));
  const want = shift(row.gridDims, k);
  if (npy.shape.join('x') !== want.join('x')) {
    throw new Error(`${path}: shape ${npy.shape.join('x')}, expected ${want.join('x')}`);
  }
  if (npy.values instanceof Uint16Array) throw new Error(`${path}: f16, expected f32 or f64`);
  return npy.values;
}

function peakOf(values: Float32Array | Float64Array): number {
  let peak = -Infinity;
  for (const v of values) if (v > peak) peak = v;
  return peak;
}

function visibleCount(codes: Uint8Array): number {
  let count = 0;
  for (const c of codes) if (c > VISIBLE_CODE) count++;
  return count;
}

// The crop rule (spec §4) makes every level a whole number of 6×6 and 4×4 blocks with integer dims.
function checkCropRule({ gridDims, dataBox: { originVox, dims } }: VolumePyramidFieldRow): void {
  const broken = [
    originVox.some((o) => o % 8 !== 0) && `origin ${originVox.join(',')} is not on the 8-grid`,
    (dims[0] % 96 !== 0 || dims[1] % 96 !== 0 || dims[2] % 8 !== 0) &&
      `dims ${dims.join('x')} are not 96 × 96 × 8 multiples`,
    originVox.some((o, a) => o < 0 || o + dims[a]! > gridDims[a]!) &&
      `box leaves the ${gridDims.join('x')} grid`,
  ].filter(Boolean);
  if (broken.length > 0) throw new Error(`crop rule: ${broken.join('; ')}`);
}

async function buildVolumePyramid(row: VolumePyramidFieldRow): Promise<void> {
  checkCropRule(row);
  const values = PYRAMID_LEVELS.map((k) => readLevel(row, k));
  const sidecar: VolumePyramidSidecar = {
    gridDims: row.gridDims,
    voxelMpc: row.voxelMpc,
    originMpc: row.originMpc,
    frame: row.frame,
    dataBox: row.dataBox,
    levelMax: [row.nativePeak, ...values.map(peakOf)] as [number, number, number, number],
  };
  const encode = (k: 1 | 2 | 3, box: VolumePyramidFieldRow['dataBox']): Uint8Array =>
    encodeVolumeLevel(
      values[k - 1]!,
      shift(row.gridDims, k),
      box,
      row.nativePeak,
      row.zeroBelowRaw,
    );
  const boxAt = (k: number) => ({
    originVox: shift(row.dataBox.originVox, k),
    dims: shift(row.dataBox.dims, k),
  });

  const r8 = PYRAMID_LEVELS.map((k) => encode(k, boxAt(k)));
  const wholeL1 = encode(1, { originVox: [0, 0, 0], dims: shift(row.gridDims, 1) });
  const visible = visibleCount(wholeL1);
  const loss = (visible - visibleCount(r8[0]!)) / visible;
  console.log(
    `[buildVolumePyramid] ${row.id}: ${(loss * 100).toFixed(3)}% of L1's visible voxels outside the box`,
  );
  // `!(<=)` also refuses a NaN loss: a field with no visible voxel is broken input.
  if (!(loss <= MAX_CROP_LOSS))
    throw new Error(`crop loss ${(loss * 100).toFixed(3)}% > ${MAX_CROP_LOSS * 100}%`);

  const rows: Record<string, string | number>[] = [];
  for (const { format, gpuFormat } of VOLUME_PYRAMID_FORMATS) {
    for (const level of volumePyramidLevels(sidecar, 1, gpuFormat)) {
      const started = performance.now();
      const levelR8 = r8[level.level - 1]!;
      const bytes =
        format === 'r8' ? levelR8 : await basisuEncodeLevel(levelR8, level.dims, format);
      if (bytes.length !== level.byteLength) {
        throw new Error(
          `${format} L${level.level}: ${bytes.length} B, expected ${level.byteLength}`,
        );
      }
      const out = `public/data/${volumePyramidLevelPath(row.id, format, level.level)}`;
      mkdirSync(dirname(out), { recursive: true });
      writeFileSync(out, bytes);
      rows.push({
        format,
        level: `L${level.level}`,
        dims: level.dims.join('x'),
        bytes: bytes.length,
        levelMax: sidecar.levelMax[level.level],
        seconds: Number(((performance.now() - started) / 1000).toFixed(1)),
      });
    }
  }
  writeFileSync(
    `public/data/${VOLUME_PYRAMID_DATA_PREFIX}/${row.id}.json`,
    JSON.stringify(sidecar),
  );
  console.table(rows);
  console.log(`[buildVolumePyramid] ${row.id}: levelMax ${sidecar.levelMax.join(', ')}`);
}

function basisuVersionLine(): string {
  try {
    return execFileSync('basisu', ['-version'], { encoding: 'utf8' }).split('\n')[0]!;
  } catch (err) {
    if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err;
    throw new Error('basisu not found: install with `brew install basis_universal` (v2.50.0)');
  }
}

async function main(): Promise<void> {
  const field = process.argv[2];
  if (field !== 'mcpm' && field !== 'polyphorm-2mrs') {
    console.error('usage: tsx tools/volumes/buildVolumePyramid.ts mcpm|polyphorm-2mrs');
    process.exit(1);
  }
  console.log(`[buildVolumePyramid] ${basisuVersionLine()}`);
  await buildVolumePyramid(VOLUME_PYRAMID_FIELDS[field]);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
