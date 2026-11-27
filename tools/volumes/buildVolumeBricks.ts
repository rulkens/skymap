/**
 * buildVolumeBricks.ts <field> — level 0 of a density field's `volume-pyramid/v1/` as 48³ bricks
 * from its native `_d1.npy`, one archive (index + parts) per format (spec §4–§5). The file is read
 * in x-slabs one brick wide, never whole: both d1 files are over `readFileSync`'s 2 GiB. Each slab
 * is encoded like the pyramid's levels (`encodeVolumeLevel` against the native peak, then basisu as
 * z-slices), so a brick is on the same scale as L1–L3 and exactly one `writeTexture` box.
 *
 * Needs basisu v2.50.0 (`brew install basis_universal`). CLI: `npm run build-mcpm-bricks` /
 * `build-2mrs-bricks`. Runs on the owner's machine: the d1 inputs are only there.
 */

import { closeSync, mkdirSync, openSync, readSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { readNpyHeader } from '../parsers/readNpyHeader';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { encodeArchiveIndex } from '../utils/archive/encodeArchiveIndex';
import { planArchiveParts } from '../utils/archive/planArchiveParts';
import { basisuEncodeLevel } from './utils/basisuEncodeLevel';
import { brickEntryBytes } from './utils/brickEntryBytes';
import { cutBrick } from './utils/cutBrick';
import { encodeVolumeLevel } from './utils/encodeVolumeLevel';
import { npyPeak } from './utils/npyPeak';
import { readNpySlab } from './utils/readNpySlab';
import { VOLUME_PYRAMID_FIELDS } from './data/volumePyramidFields';
import { ARCHIVE_MAX_PART_BYTES } from '../../src/data/archive/archiveFormat';
import { TEXTURE_BYTES_PER_TEXEL } from '../../src/data/gpu/textureBytesPerTexel';
import { VOLUME_BRICK_EDGE as E } from '../../src/data/volume/volumeBrickEdge';
import { VOLUME_PYRAMID_FORMATS } from '../../src/data/volume/volumePyramidFormats';
import { levelByteLength } from '../../src/utils/gpu/memory/levelByteLength';
import { brickId } from '../../src/utils/volume/brickId';
import { volumeBrickArchivePath } from '../../src/utils/volume/volumeBrickArchivePath';
import type { VolumePyramidFieldRow } from '../@types/volumes/VolumePyramidFieldRow';
import type { Vec3 } from '../../src/@types/math/Vec3';

function writeOut(path: string, bytes: Uint8Array): void {
  const out = `public/data/${path}`;
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, bytes);
}

async function buildVolumeBricks(row: VolumePyramidFieldRow): Promise<void> {
  const path = join(rawDataPath(row.npy.dir), `${row.npy.stem}_d1.npy`);
  const fd = openSync(path, 'r');
  try {
    const lead = new Uint8Array(10 + 0xffff); // the largest v1 header
    const header = readNpyHeader(lead.subarray(0, readSync(fd, lead, 0, lead.length, 0)));
    if (header.dtype !== '<f4' || header.shape.join('x') !== row.gridDims.join('x')) {
      throw new Error(
        `${path}: ${header.dtype} ${header.shape.join('x')}, expected <f4 ${row.gridDims.join('x')}`,
      );
    }
    const { originVox, dims } = row.dataBox;
    if (dims[0] % E !== 0 || dims[1] % E !== 0) {
      throw new Error(`dataBox ${dims.join('x')}: x and y must be multiples of ${E}`);
    }
    // The whole file, not the box: the grid's peak may sit outside it and still be the scale.
    const peak = npyPeak(fd, header);
    if (peak !== row.nativePeak) {
      throw new Error(`${path}: peak ${peak}, the field row's nativePeak is ${row.nativePeak}`);
    }

    const grid = dims.map((d) => Math.ceil(d / E)) as Vec3;
    const [nx, ny, nz] = grid;
    const [, dy, dz] = dims;
    const slabDims: Vec3 = [E, dy, nz * E];
    const layoutOf = (bpt: number) => ({
      sliceBytes: levelByteLength(E, dy, 1, bpt),
      brickSliceBytes: levelByteLength(E, E, 1, bpt),
    });
    // Per format, a brick's pack entry by its id; slabs run in x, the archive sorts by id.
    const bricks = new Map(
      VOLUME_PYRAMID_FORMATS.map((f) => [f.format, new Map<number, Uint8Array>()]),
    );
    const seconds = new Map(VOLUME_PYRAMID_FORMATS.map((f) => [f.format, 0]));

    for (let bx = 0; bx < nx; bx++) {
      console.log(`[buildVolumeBricks] ${row.id}: slab ${bx + 1}/${nx}`);
      const slab = readNpySlab(fd, header, originVox[0] + E * bx, E);
      const r8 = encodeVolumeLevel(
        slab,
        [E, row.gridDims[1], row.gridDims[2]],
        { originVox: [0, originVox[1], originVox[2]], dims: [E, dy, dz] },
        row.nativePeak,
        row.zeroBelowRaw,
      );
      const padded = new Uint8Array(E * dy * nz * E); // z padded with zero slices to the grid
      padded.set(r8);
      const r8Bricks = Array.from({ length: ny * nz }, (_, i) =>
        cutBrick(padded, layoutOf(1), i % ny, Math.floor(i / ny)),
      );

      for (const { format, gpuFormat } of VOLUME_PYRAMID_FORMATS) {
        const started = performance.now();
        const bpt = TEXTURE_BYTES_PER_TEXEL[gpuFormat]!;
        const bytes = format === 'r8' ? padded : await basisuEncodeLevel(padded, slabDims, format);
        const slabBytes = levelByteLength(...slabDims, bpt);
        if (bytes.length !== slabBytes) {
          throw new Error(`${format} slab ${bx}: ${bytes.length} B, expected ${slabBytes}`);
        }
        r8Bricks.forEach((r8Brick, i) => {
          const [by, bz] = [i % ny, Math.floor(i / ny)];
          const brick = cutBrick(bytes, layoutOf(bpt), by, bz);
          if (brick.length !== levelByteLength(E, E, E, bpt)) {
            throw new Error(`${format} brick ${bx},${by},${bz}: ${brick.length} B`);
          }
          bricks.get(format)!.set(brickId([bx, by, bz], grid), brickEntryBytes(r8Brick, brick));
        });
        seconds.set(format, seconds.get(format)! + (performance.now() - started) / 1000);
      }
    }

    const rows: Record<string, string | number>[] = [];
    for (const [format, byId] of bricks) {
      const sorted = [...byId].sort(([a], [b]) => a - b);
      const { entries, partCount } = planArchiveParts(
        sorted.map(([key, bytes]) => ({ key, length: bytes.length })),
        ARCHIVE_MAX_PART_BYTES,
      );
      for (let part = 0; part < partCount; part++) {
        const members = sorted.filter((_, i) => entries[i]!.part === part).map(([, b]) => b);
        writeOut(volumeBrickArchivePath(row.id, format, part), Buffer.concat(members));
      }
      writeOut(volumeBrickArchivePath(row.id, format), encodeArchiveIndex(entries, partCount));
      rows.push({
        format,
        bricks: sorted.length,
        occupied: entries.filter((e) => e.length > 0).length,
        packedBytes: entries.reduce((sum, e) => sum + e.length, 0),
        parts: partCount,
        seconds: Number(seconds.get(format)!.toFixed(1)),
      });
    }
    console.table(rows);
  } finally {
    closeSync(fd);
  }
}

async function main(): Promise<void> {
  const field = process.argv[2];
  if (field !== 'mcpm' && field !== 'polyphorm-2mrs') {
    console.error('usage: tsx tools/volumes/buildVolumeBricks.ts mcpm|polyphorm-2mrs');
    process.exit(1);
  }
  await buildVolumeBricks(VOLUME_PYRAMID_FIELDS[field]);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
