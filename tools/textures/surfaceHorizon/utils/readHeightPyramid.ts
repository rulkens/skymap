import { existsSync, openSync, readFileSync, readSync } from 'node:fs';
import { join } from 'node:path';

import sharp from 'sharp';

import { decodeSurfaceTileArchiveIndex } from '../../../../src/layers/body/surfaceTiles/archive/utils/decodeSurfaceTileArchiveIndex';
import { findSurfaceTileArchiveEntry } from '../../../../src/layers/body/surfaceTiles/archive/utils/findSurfaceTileArchiveEntry';
import { surfaceTileArchivePath } from '../../../../src/layers/body/surfaceTiles/archive/utils/surfaceTileArchivePath';
import { surfaceTileMortonKey } from '../../../../src/layers/body/surfaceTiles/archive/utils/surfaceTileMortonKey';
import {
  HEIGHT_POSTS_PER_TILE,
  HEIGHT_TILE_CHUNK_FOURCC,
} from '../../../../src/layers/body/surfaceTiles/format/data/heightTileFormat';
import { decodeHeightTileHeader } from '../../../../src/layers/body/surfaceTiles/format/utils/decodeHeightTileHeader';
import { readRiffChunk } from '../../../../src/utils/image/readRiffChunk';
import { decodeHeightTile } from '../../../utils/textures/decodeHeightTile';
import { heightLatticeStepDeg } from '../../../utils/textures/heightLatticeStepDeg';
import type { HeightArchiveLevel } from '../@types/HeightArchiveLevel';
import type { LazyHeightPyramid } from '../@types/LazyHeightPyramid';

const CELLS = HEIGHT_POSTS_PER_TILE - 1;
const RAD_TO_DEG = 180 / Math.PI;

// 20 bits per axis: Earth z19 has 2^19 columns.
const keyOf = (z: number, x: number, y: number): number => (z * 2 ** 20 + y) * 2 ** 20 + x;

/**
 * readHeightPyramid — a body's baked height archives as the march reads them. A read at level
 * z falls back to the deepest ancestor that has the tile, which is how a regional band (Jezero,
 * z10+) hands over to the global levels, and Mars's missing z8–9 land on z7. Where no level
 * from z down to 0 has the tile, heights and ceilings read 0 m (the datum): a gap in the
 * global base would otherwise make the march throw, and the base covers the globe on all
 * three bodies.
 *
 * Reads are synchronous (the march calls them in its inner loop) while WebP decode is not, so
 * a read of an undecoded tile returns 0 and records a miss; `loadMisses` decodes them and the
 * caller re-marches (`bakeHorizonTileResolved`). Headers (`subtreeMaxM`) read synchronously.
 */
export function readHeightPyramid(
  imagesDir: string,
  prefix: string,
  radiusM: number,
): LazyHeightPyramid {
  const levels = new Map<number, HeightArchiveLevel | null>();
  const heights = new Map<number, Float32Array>();
  const bounds = new Map<number, number>();
  const inArchive = new Map<number, boolean>();
  const misses = new Set<number>();
  let missReads = 0;
  // A march's samples stay in one tile per level for long runs, so each level keeps its last
  // lookup: null = not in the archive, undefined = not decoded yet. Stale once `heights` changes.
  const lastKey: number[] = [];
  const lastTile: (Float32Array | null | undefined)[] = [];
  const forgetLastTiles = (): void => {
    lastKey.length = 0;
    lastTile.length = 0;
  };

  const levelOf = (z: number): HeightArchiveLevel | null => {
    if (!levels.has(z)) {
      const path = join(imagesDir, surfaceTileArchivePath(prefix, 'height', z));
      levels.set(
        z,
        existsSync(path)
          ? { index: decodeSurfaceTileArchiveIndex(readFileSync(path)), fds: new Map() }
          : null,
      );
    }
    return levels.get(z)!;
  };

  /** The tile's bytes, or null when the level or the entry is absent. */
  const bytesOf = (z: number, x: number, y: number): Buffer | null => {
    const level = levelOf(z);
    if (level === null) return null;
    const entry = findSurfaceTileArchiveEntry(level.index, surfaceTileMortonKey(x, y));
    if (entry === null || entry.length === 0) return null;
    let fd = level.fds.get(entry.part);
    if (fd === undefined) {
      fd = openSync(join(imagesDir, surfaceTileArchivePath(prefix, 'height', z, entry.part)), 'r');
      level.fds.set(entry.part, fd);
    }
    const bytes = Buffer.alloc(entry.length);
    readSync(fd, bytes, 0, entry.length, entry.offset);
    return bytes;
  };

  // The index never changes, so a tile's membership is searched for once.
  const hasTile = (z: number, x: number, y: number, key: number): boolean => {
    let has = inArchive.get(key);
    if (has === undefined) {
      const level = levelOf(z);
      const entry =
        level === null
          ? null
          : findSurfaceTileArchiveEntry(level.index, surfaceTileMortonKey(x, y));
      has = entry !== null && entry.length > 0;
      inArchive.set(key, has);
    }
    return has;
  };

  const chunkOf = (bytes: Buffer, z: number, x: number, y: number): Uint8Array => {
    const chunk = readRiffChunk(bytes, HEIGHT_TILE_CHUNK_FOURCC);
    if (chunk === null) throw new Error(`readHeightPyramid: ${z}/${x}/${y} has no SHGT chunk`);
    return chunk;
  };

  return {
    radiusM,

    heightAt(z, lonRad, latRad) {
      const lonDeg = lonRad * RAD_TO_DEG;
      const latDeg = latRad * RAD_TO_DEG;
      for (let level = z; level >= 0; level--) {
        const step = heightLatticeStepDeg(level);
        const wrapped = ((lonDeg + 180) / step) % (2 ** level * CELLS);
        const gi = wrapped < 0 ? wrapped + 2 ** level * CELLS : wrapped;
        // Clamped just inside the south edge, so the +1 post of the bilinear stays in the tile.
        const gj = Math.min(Math.max((90 - latDeg) / step, 0), 2 ** (level - 1) * CELLS - 1e-6);
        const x = Math.floor(gi / CELLS);
        const y = Math.floor(gj / CELLS);
        const key = keyOf(level, x, y);
        if (lastKey[level] !== key) {
          lastKey[level] = key;
          lastTile[level] = hasTile(level, x, y, key) ? heights.get(key) : null;
        }
        const tile = lastTile[level];
        if (tile === null) continue;
        if (tile === undefined) {
          misses.add(key);
          missReads++;
          return 0;
        }
        const i0 = Math.floor(gi - x * CELLS);
        const j0 = Math.floor(gj - y * CELLS);
        const fx = gi - x * CELLS - i0;
        const fy = gj - y * CELLS - j0;
        const p = j0 * HEIGHT_POSTS_PER_TILE + i0;
        const north = tile[p]! * (1 - fx) + tile[p + 1]! * fx;
        const south =
          tile[p + HEIGHT_POSTS_PER_TILE]! * (1 - fx) + tile[p + HEIGHT_POSTS_PER_TILE + 1]! * fx;
        return north * (1 - fy) + south * fy;
      }
      return 0;
    },

    subtreeMaxM(z, x, y) {
      const key = keyOf(z, x, y);
      let max = bounds.get(key);
      if (max === undefined) {
        const bytes = bytesOf(z, x, y);
        max = bytes === null ? 0 : decodeHeightTileHeader(chunkOf(bytes, z, x, y)).subtreeMaxM;
        bounds.set(key, max);
      }
      return max;
    },

    async loadMisses() {
      const pending = [...misses];
      misses.clear();
      for (const key of pending) {
        const x = key % 2 ** 20;
        const y = Math.floor(key / 2 ** 20) % 2 ** 20;
        const z = Math.floor(key / 2 ** 40);
        const bytes = bytesOf(z, x, y)!;
        const { data, info } = await sharp(bytes)
          .removeAlpha()
          .raw()
          .toBuffer({ resolveWithObject: true });
        const decoded = decodeHeightTile(
          { data, width: info.width, height: info.height },
          chunkOf(bytes, z, x, y),
        );
        heights.set(key, decoded.heightM);
      }
      forgetLastTiles();
      return pending.length;
    },

    missCount: () => missReads,

    trim(maxTiles) {
      if (heights.size > maxTiles) {
        heights.clear();
        forgetLastTiles();
      }
    },
  };
}
