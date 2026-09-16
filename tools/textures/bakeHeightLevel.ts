/**
 * bakeHeightLevel — one level of one band's Terrain-RGB WebP pyramid. A post
 * covered by an on-disk child takes that child's post (R2); everything else
 * resamples the source on the GLOBAL lattice, so z7 global nests with z8's
 * children instead of needing its own deepest-level case. Assembled whole
 * before slicing (≈2.4 GB at z7) to label water across tile seams.
 */

import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';

import sharp from 'sharp';

import type { HeightSource } from './HeightSource';
import type { HeightTile } from './HeightTile';
import { voidFilledHeightSource } from './voidFilledHeightSource';
import { HEIGHT_POSTS_PER_TILE } from '../../src/data/scene/heightTileFormat';
import { surfaceTilePath } from '../../src/utils/scene/surfaceTilePath';
import { surfaceTileColumns } from '../../src/utils/scene/surfaceTileColumns';
import { encodeHeightTile } from '../utils/textures/encodeHeightTile';
import { decimateHeightGrid } from '../utils/textures/decimateHeightGrid';
import { flattenWaterComponents } from '../utils/textures/flattenWaterComponents';
import { heightTileBounds } from '../utils/textures/heightTileBounds';
import { heightLatticeStepDeg } from '../utils/textures/heightLatticeStepDeg';
import { quantizeHeightGrid } from '../utils/textures/quantizeHeightGrid';
import { readHeightTileFile } from '../utils/textures/readHeightTileFile';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { earthTileBounds } from '../utils/scene/earthTileBounds';
import { EARTH_TILE_PX } from '../../src/data/bodies/earthTileParams';

/** Post intervals per tile edge: 129 posts, 128 gaps, the 129th shared with
 *  the next tile (§5.4.1). */
const SPAN = HEIGHT_POSTS_PER_TILE - 1;

/** A rectangle of tiles assembled and resampled as one grid, with the tiles
 *  inside it this bake was actually asked for. */
type Region = {
  xMin: number;
  xMax: number;
  yMin: number;
  yMax: number;
  tiles: ReadonlyArray<{ x: number; y: number }>;
};

/**
 * `flattenWater` bands are global by construction, and the water pass needs
 * the whole globe in one grid; every other band is cut into per-row runs so a
 * band of scattered regional boxes never allocates its bounding rectangle.
 */
function regionsOf(
  tiles: ReadonlyArray<{ x: number; y: number }>,
  z: number,
  whole: boolean,
): Region[] {
  if (whole) {
    // Columns/rows come from the one place that owns tile-grid shape
    // (`heightLatticeStepDeg` assumes the same 2^z columns at EARTH_TILE_PX).
    const columns = surfaceTileColumns(z, EARTH_TILE_PX);
    return [{ xMin: 0, xMax: columns - 1, yMin: 0, yMax: columns / 2 - 1, tiles }];
  }

  const rows = new Map<number, number[]>();
  for (const { x, y } of tiles) {
    const row = rows.get(y);
    if (row === undefined) rows.set(y, [x]);
    else row.push(x);
  }
  const regions: Region[] = [];
  for (const [y, xs] of [...rows.entries()].sort((a, b) => a[0] - b[0])) {
    xs.sort((a, b) => a - b);
    let run: number[] = [];
    const flush = (): void => {
      if (run.length === 0) return;
      regions.push({
        xMin: run[0]!,
        xMax: run[run.length - 1]!,
        yMin: y,
        yMax: y,
        tiles: run.map((x) => ({ x, y })),
      });
      run = [];
    };
    for (const x of xs) {
      if (run.length > 0 && x !== run[run.length - 1]! + 1) flush();
      run.push(x);
    }
    flush();
  }
  return regions;
}

/** The NASA water mask (land 255, water 0) sampled nearest at every lattice
 *  post of the region — the classification R3's components are built from. */
async function waterMaskAtLattice(
  z: number,
  i0: number,
  j0: number,
  nx: number,
  ny: number,
): Promise<Uint8Array> {
  const path = rawDataPath('textures.earthWaterMask');
  const { data, info } = await sharp(path, { limitInputPixels: false })
    .toColourspace('b-w')
    .raw()
    .toBuffer({ resolveWithObject: true });

  const step = heightLatticeStepDeg(z);
  const isWater = new Uint8Array(nx * ny);
  for (let jj = 0; jj < ny; jj++) {
    const lat = 90 - (j0 + jj) * step;
    const row = Math.min(
      info.height - 1,
      Math.max(0, Math.round(((90 - lat) / 180) * info.height - 0.5)),
    );
    for (let ii = 0; ii < nx; ii++) {
      const lon = -180 + (i0 + ii) * step;
      const col = Math.min(
        info.width - 1,
        Math.max(0, Math.round(((lon + 180) / 360) * info.width - 0.5)),
      );
      isWater[jj * nx + ii] =
        data[row * info.width * info.channels + col * info.channels]! < 128 ? 1 : 0;
    }
  }
  return isWater;
}

function childPath(
  outDir: string,
  prefix: string,
  z: number,
  x: number,
  y: number,
  q: number,
): string {
  return join(
    outDir,
    surfaceTilePath(
      { product: 'height', z: z + 1, x: 2 * x + (q % 2), y: 2 * y + (q - (q % 2)) / 2 },
      prefix,
    ),
  );
}

/**
 * How far this level's surface can be from the finest data under it, in
 * metres: the worst gap between this tile's bilinear and a child's own posts,
 * plus that child's own residual. An upper bound rather than a sweep of the
 * band's deepest grid — it needs only the four children, and erring high can
 * only ever pull refinement earlier (spec §6).
 */
function residualAgainstChildren(
  own: Float32Array,
  children: ReadonlyArray<HeightTile | null>,
): number {
  const posts = HEIGHT_POSTS_PER_TILE;
  let worst = 0;
  for (let q = 0; q < children.length; q++) {
    const child = children[q];
    if (child === undefined || child === null) continue;
    const qx = q % 2;
    const qy = (q - qx) / 2;
    let gap = 0;
    for (let cj = 0; cj < posts; cj++) {
      const py = qy * (SPAN / 2) + cj / 2;
      const y0 = Math.min(SPAN - 1, Math.floor(py));
      const fy = py - y0;
      for (let ci = 0; ci < posts; ci++) {
        const px = qx * (SPAN / 2) + ci / 2;
        const x0 = Math.min(SPAN - 1, Math.floor(px));
        const fx = px - x0;
        const interpolated =
          own[y0 * posts + x0]! * (1 - fx) * (1 - fy) +
          own[y0 * posts + x0 + 1]! * fx * (1 - fy) +
          own[(y0 + 1) * posts + x0]! * (1 - fx) * fy +
          own[(y0 + 1) * posts + x0 + 1]! * fx * fy;
        gap = Math.max(gap, Math.abs(interpolated - child.heightM[cj * posts + ci]!));
      }
    }
    worst = Math.max(worst, gap + child.geometricResidualM);
  }
  return worst;
}

export async function bakeHeightLevel(input: {
  readonly z: number;
  readonly tiles: ReadonlyArray<{ x: number; y: number }>;
  readonly source: HeightSource;
  readonly underfill: HeightSource | null;
  readonly outDir: string;
  readonly prefix: string;
  readonly flattenWater: boolean;
}): Promise<string[]> {
  const { z, source, underfill, outDir, prefix, flattenWater } = input;
  const posts = HEIGHT_POSTS_PER_TILE;
  // Voids take the underfill at EVERY level, deepest included: a tile with one
  // NaN post is a tile `encodeHeightTile` refuses to write at all.
  const fill = underfill === null ? source : voidFilledHeightSource(source, underfill);
  const written: string[] = [];

  for (const region of regionsOf(input.tiles, z, flattenWater)) {
    const pending: Array<{ x: number; y: number }> = [];
    for (const { x, y } of region.tiles) {
      const relPath = surfaceTilePath({ product: 'height', z, x, y }, prefix);
      if (existsSync(join(outDir, relPath))) written.push(relPath);
      else pending.push({ x, y });
    }
    // Idempotence (P5): a region whose tiles are all on disk costs one
    // `existsSync` each, never a resample.
    if (pending.length === 0) continue;

    // Every pending tile's four children are already baked, so the loop below
    // overwrites the whole region regardless — skip the resample and (on a
    // global band) the water pass entirely rather than throw them away.
    const fullyNested = pending.every(({ x, y }) =>
      [0, 1, 2, 3].every((q) => existsSync(childPath(outDir, prefix, z, x, y, q))),
    );

    const i0 = region.xMin * SPAN;
    const j0 = region.yMin * SPAN;
    const nx = (region.xMax - region.xMin + 1) * SPAN + 1;
    const ny = (region.yMax - region.yMin + 1) * SPAN + 1;
    const grid = fullyNested
      ? new Float32Array(nx * ny)
      : ((await fill.readGrid(z, i0, j0, nx, ny)) ?? new Float32Array(nx * ny).fill(NaN));

    // Before the children are laid over it, never after: a child's posts are
    // already at their own band's water treatment, and re-levelling them here
    // would break the parent's bit-identical nesting (§5.4.3).
    if (flattenWater && !fullyNested)
      flattenWaterComponents(grid, await waterMaskAtLattice(z, i0, j0, nx, ny), nx, ny);

    for (const { x, y } of pending) {
      const own = new Float32Array(posts * posts);
      const ox = (x - region.xMin) * SPAN;
      const oy = (y - region.yMin) * SPAN;
      for (let j = 0; j < posts; j++) {
        own.set(grid.subarray((oy + j) * nx + ox, (oy + j) * nx + ox + posts), j * posts);
      }

      const children = await Promise.all(
        [0, 1, 2, 3].map((q) => readHeightTileFile(childPath(outDir, prefix, z, x, y, q))),
      );
      for (let q = 0; q < children.length; q++) {
        const child = children[q];
        if (child === undefined || child === null) continue;
        const half = decimateHeightGrid(child.heightM, posts, posts);
        const qx = q % 2;
        const qy = (q - qx) / 2;
        const side = SPAN / 2 + 1;
        for (let j = 0; j < side; j++) {
          own.set(
            half.subarray(j * side, (j + 1) * side),
            (qy * (SPAN / 2) + j) * posts + qx * (SPAN / 2),
          );
        }
      }

      const bad = own.findIndex((value) => !Number.isFinite(value));
      if (bad >= 0) {
        throw new Error(
          `bakeHeightLevel: tile z${z}/${x}/${y} has a non-finite post at (${bad % posts}, ${Math.floor(bad / posts)}) — the band needs an underfill that covers it`,
        );
      }

      // Before bounds/residual, per quantizeHeightGrid's own contract.
      quantizeHeightGrid(own);

      const box = earthTileBounds(z, x, y, EARTH_TILE_PX);
      // Under water flattening the source's own range still describes the
      // bathymetry that was levelled away, so it would report every ocean tile
      // as 5 km deep — §4.4 wants the Dead Sea's −430 m to be Earth's floor.
      const sourceBounds = flattenWater ? null : await source.boundsInBox(box);
      const tile: HeightTile = {
        ...heightTileBounds(own, children, sourceBounds),
        geometricResidualM: residualAgainstChildren(own, children),
        heightM: own,
      };

      const relPath = surfaceTilePath({ product: 'height', z, x, y }, prefix);
      const outPath = join(outDir, relPath);
      mkdirSync(dirname(outPath), { recursive: true });
      // `.tmp` then rename: a bake killed mid-write must not leave a truncated
      // file that the next run's existsSync skip-check trusts as complete.
      writeFileSync(`${outPath}.tmp`, await encodeHeightTile(tile));
      renameSync(`${outPath}.tmp`, outPath);
      written.push(relPath);
    }
  }
  return written;
}
