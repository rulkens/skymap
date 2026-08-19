#!/usr/bin/env node
/**
 * buildEarthTiles — bake Earth's surface imagery into the `z/x/y` pyramid the
 * runtime virtual texture pages, under `public/data/images/earth-tiles/`.
 *
 * Its own tool rather than a loop inside `buildTextures`: the whole-globe
 * tiers build from raws every contributor already has, in seconds, while this
 * bake needs inputs most contributors lack and can run for hours at the
 * levels the shipped pyramid reaches; folding it in would break (or silently
 * skip) `build-textures` for everyone, and the two derive from DIFFERENT
 * sources, so re-curating one cannot stale the other.
 *
 * Row 0 of every tile is its NORTH edge (see `EarthImagerySource` for why).
 * The deepest level bakes from the imagery source tile by tile, straight to
 * disk; every coarser level is a 2x2 average of the level above, read back
 * off disk (see `bakeCoarserLevel` for the sharp/libvips composite-order
 * landmine that governs how that average is built) — nothing here ever holds
 * a whole-globe raster (1.6 TB at z11) or a level.
 *
 * Lands on disk: `earth-tiles/surface/<z>/<x>/<y>.webp` (`earthTilePath`,
 * shared with the runtime fetcher's own URL builder — drift 404s quietly,
 * degrading to the base texture); `earth-tiles/manifest.json` (tile edge,
 * baked level range, source); `earth-tiles/index.txt` (one path per line,
 * walked by the deploy collector instead of the filesystem, so a
 * half-finished bake can't upload a partial pyramid as complete).
 * `public/data/` is gitignored — nothing here is committed.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import type { EarthTileKind } from '../../src/@types/data/EarthTileKind';
import type { Tier } from '../../src/@types/data/Tier';
import type { EarthTileManifest } from '../../src/@types/scene/EarthTileManifest';
import { EARTH_TILE_PX } from '../../src/data/bodies/earthTileParams';
import { earthBaseLevelForTier } from '../../src/utils/scene/earthBaseLevelForTier';
import { earthTileColumns } from '../../src/utils/scene/earthTileColumns';
import { earthTilePath } from '../../src/utils/scene/earthTilePath';
import { parseFlags } from '../utils/cli/args';
import { BMNG_QUADRANT_KEYS } from '../utils/io/bmngQuadrantKeys';
import { BMNG_VINTAGE } from '../utils/io/bmngVintage';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { bmngQuadrantSource, type BmngQuadrant } from './bmngQuadrantSource';
import type { EarthImagerySource } from './EarthImagerySource';
import { equirectFileSource } from './equirectFileSource';
import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';

/** Lossy WebP quality for surface tiles: JPEG can't carry the alpha channel
 *  that doubles as the land mask. */
const WEBP_QUALITY = 82;

/** Each builder keeps its own module-local tier ladder; the bake floor below
 *  moves with it rather than naming a tier. */
const TIER_LADDER: readonly Tier[] = ['small', 'medium', 'large'];

/**
 * Shallowest level this bake emits: one finer than the COARSEST whole-globe
 * base, not the finest — pinning this to the `large` tier's z4 base would
 * leave `medium`/`small` sessions falling back to the base texture one or
 * two levels early (an unbaked level 404s like ocean does).
 */
const BAKE_MIN_LEVEL = Math.min(...TIER_LADDER.map(earthBaseLevelForTier)) + 1;

/** The only kind this tool bakes — relief, clouds, night lights and the
 *  material map carry no fine structure worth streaming. */
const KIND: EarthTileKind = 'surface';

/** Stable location of the manifest and index — the pointer clients always fetch. */
const TILE_ROOT = 'earth-tiles';

/**
 * Versioned prefix for the tile bodies themselves. BUMP THIS on any re-bake
 * that changes pixels: the tiles are served `immutable` and never purged, so
 * reusing a version leaves the CDN answering with old imagery against a new
 * manifest for up to a day — mismatched, not merely stale. A new version is
 * new keys, which cost nothing extra and need no purge.
 */
export const TILE_PREFIX = `${TILE_ROOT}/v1`;

/** Geographic extent of tile `(z, x, y)`; `y` increases SOUTH, matching the
 *  raster's own north-first row order. */
function tileBox(z: number, x: number, y: number, tilePx: number): LonLatBounds {
  const columns = earthTileColumns(z, tilePx);
  const rows = columns / 2;
  const lonStep = 360 / columns;
  const latStep = 180 / rows;
  return {
    west: -180 + x * lonStep,
    east: -180 + (x + 1) * lonStep,
    north: 90 - y * latStep,
    south: 90 - (y + 1) * latStep,
  };
}

/**
 * Encode one RGBA raster as a surface tile, creating its `z/x` directories.
 *
 * The raster is always four-channel, even when alpha is uniformly 255:
 * libwebp then drops the alpha PLANE from a fully-opaque image, leaving a
 * 3-channel file on disk — harmless, since `createImageBitmap` plus an
 * `rgba8unorm-srgb` upload yields alpha 1 either way, but nothing downstream
 * may assume 4 channels survive to disk. A land-only source's real
 * transparency does keep the plane.
 */
async function writeTile(rgba: Uint8Array, tilePx: number, outPath: string): Promise<void> {
  mkdirSync(dirname(outPath), { recursive: true });
  await sharp(rgba, { raw: { width: tilePx, height: tilePx, channels: 4 } })
    .webp({ quality: WEBP_QUALITY })
    .toFile(outPath);
}

/**
 * Bake the deepest level straight from the imagery source, one tile at a
 * time. A source that declines a box emits no tile at all — a land-only
 * pyramid is sparse, not full of empty files, and the runtime treats the
 * resulting 404 as a permanent miss.
 */
async function bakeDeepestLevel(
  source: EarthImagerySource,
  z: number,
  tilePx: number,
  outDir: string,
): Promise<readonly string[]> {
  const columns = earthTileColumns(z, tilePx);
  const rows = columns / 2;
  const written: string[] = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const rgba = await source.readBox(tileBox(z, x, y, tilePx), tilePx, tilePx);
      if (rgba === null) continue;
      const relPath = earthTilePath({ kind: KIND, z, x, y }, TILE_PREFIX);
      await writeTile(rgba, tilePx, join(outDir, relPath));
      written.push(relPath);
    }
  }
  return written;
}

/**
 * Bake one level as the 2x2 average of the level above, reading the children
 * back off disk so no level is ever resident. Child `(2x + i, 2y + j)` at
 * `z + 1` occupies the `(i, j)` quadrant of the parent (`j = 0` on top), so
 * its offset is the child index times the HALF tile edge — `y` increasing
 * south in the grid agrees with rows running north-first inside a tile.
 *
 * Each child is shrunk to `tilePx / 2` on its own BEFORE it meets the parent
 * canvas; the four are then composited with no `resize` anywhere in that
 * second pipeline. That ordering is a correctness requirement, not style:
 * sharp/libvips's `.composite()` applies over the ALREADY-PROCESSED image, so
 * a `.resize()` chained after a `.composite()` in one pipeline runs FIRST
 * regardless of call order, and every off-origin overlay lands outside the
 * now-shrunk canvas, clipped with no error. This was the cause of a full
 * debugging session: every coarse tile silently came out a 1:1 copy of its
 * north-west child. Per-child shrinking gives the same pixels as shrinking
 * the assembled mosaic only because the halving is exact — libvips's integer
 * block shrink never lets a 2x2 group straddle a child boundary.
 *
 * A parent with no children is not written; one with SOME children is
 * written with the missing quadrants transparent, so the base texture
 * shows through everywhere a coastal tile has none.
 */
export async function bakeCoarserLevel(
  z: number,
  tilePx: number,
  outDir: string,
): Promise<string[]> {
  const columns = earthTileColumns(z, tilePx);
  const rows = columns / 2;
  const halfPx = tilePx / 2;
  const written: string[] = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const childPaths = [
        { i: 0, j: 0 },
        { i: 1, j: 0 },
        { i: 0, j: 1 },
        { i: 1, j: 1 },
      ]
        .map(({ i, j }) => ({
          input: join(
            outDir,
            earthTilePath({ kind: KIND, z: z + 1, x: 2 * x + i, y: 2 * y + j }, TILE_PREFIX),
          ),
          left: i * halfPx,
          top: j * halfPx,
        }))
        .filter((child) => existsSync(child.input));
      if (childPaths.length === 0) continue;

      // ensureAlpha restores a plane a fully-opaque WebP may have dropped (see
      // writeTile); resize happens here, per child, never after the composite below.
      const quadrants = await Promise.all(
        childPaths.map(async ({ input, left, top }) => ({
          input: await sharp(input).ensureAlpha().resize(halfPx, halfPx).raw().toBuffer(),
          raw: { width: halfPx, height: halfPx, channels: 4 as const },
          left,
          top,
        })),
      );

      const relPath = earthTilePath({ kind: KIND, z, x, y }, TILE_PREFIX);
      const outPath = join(outDir, relPath);
      mkdirSync(dirname(outPath), { recursive: true });
      await sharp({
        create: {
          width: tilePx,
          height: tilePx,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite(quadrants)
        .webp({ quality: WEBP_QUALITY })
        .toFile(outPath);
      written.push(relPath);
    }
  }
  return written;
}

/** Bake every level from `source.maxLevel` down to `BAKE_MIN_LEVEL` into `outDir`. */
export async function buildEarthTiles(source: EarthImagerySource, outDir: string): Promise<void> {
  const tilePx = EARTH_TILE_PX;
  const minLevel = BAKE_MIN_LEVEL;
  const maxLevel = source.maxLevel;

  // A whole-globe texture already ships at or below the coarsest tier's base;
  // a source that can't beat that has nothing to contribute.
  if (maxLevel < minLevel) {
    throw new Error(
      `buildEarthTiles: source '${source.id}' reaches only z${maxLevel}, at or below the coarsest tier's whole-globe base at z${minLevel - 1} — nothing to bake`,
    );
  }

  const written: string[] = [];

  process.stderr.write(`  z${maxLevel}: baking from ${source.id}\n`);
  written.push(...(await bakeDeepestLevel(source, maxLevel, tilePx, outDir)));
  process.stderr.write(`  z${maxLevel}: ${written.length} tiles\n`);

  for (let z = maxLevel - 1; z >= minLevel; z--) {
    const levelPaths = await bakeCoarserLevel(z, tilePx, outDir);
    written.push(...levelPaths);
    process.stderr.write(`  z${z}: ${levelPaths.length} tiles (2x2 average of z${z + 1})\n`);
  }

  // One world-spanning band today (BMNG); a source with partial coverage
  // would need one entry per box, which is a later task's concern.
  const manifest: EarthTileManifest = {
    prefix: TILE_PREFIX,
    tilePx,
    levels: {
      [KIND]: [
        {
          bounds: source.coverage[0],
          min: minLevel,
          max: maxLevel,
          builtFrom: {
            sourceId: source.id,
            attribution: source.attribution,
            vintage: BMNG_VINTAGE.label,
          },
        },
      ],
    },
  };

  // Sorted so two bakes of the same pyramid produce the same index, letting a
  // resumed sync diff one against the other.
  written.sort();
  writeFileSync(join(outDir, `${TILE_ROOT}/index.txt`), `${written.join('\n')}\n`);

  // Written LAST, after the index it implies: an interrupted bake then leaves
  // no manifest, so the runtime degrades to base-only and the sync's
  // index-driven collector finds nothing to upload. Both stand down together.
  writeFileSync(
    join(outDir, `${TILE_ROOT}/manifest.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  process.stderr.write(`  ${written.length} tiles indexed\n`);
}

/** Shared: the quadrants and the whole-globe equirect are the SAME BMNG month
 *  (see `BMNG_VINTAGE`). */
const BMNG_ATTRIBUTION = `NASA Blue Marble Next Generation, ${BMNG_VINTAGE.label} topography + bathymetry (public domain, credit NASA Earth Observatory).`;

/** The shipped source: BMNG's eight-file quadrant set, reaching z7. */
async function deepSource(): Promise<EarthImagerySource> {
  return bmngQuadrantSource({
    id: `nasa-bmng-${BMNG_VINTAGE.stamp}-quadrants`,
    attribution: BMNG_ATTRIBUTION,
    quadrantPaths: Object.fromEntries(
      Object.entries(BMNG_QUADRANT_KEYS).map(([quadrant, key]) => [quadrant, rawDataPath(key)]),
    ) as Record<BmngQuadrant, string>,
  });
}

/**
 * `--dev`: the whole-globe equirect, reaching z5 — built from what
 * `fetch-textures` already pulls (no 421 MB quadrant set). An explicit flag
 * rather than a silent fallback: the pyramid would otherwise be complete,
 * valid and four levels short with nothing downstream able to tell.
 */
async function devSource(): Promise<EarthImagerySource> {
  return equirectFileSource({
    id: `nasa-bmng-${BMNG_VINTAGE.stamp}-equirect`,
    rawKey: 'textures.nasaBmng',
    attribution: BMNG_ATTRIBUTION,
  });
}

async function main(): Promise<void> {
  const outDir = resolve('public/data/images');
  const { '--dev': dev } = parseFlags(process.argv.slice(2), { '--dev': 'bool' });
  const source = dev ? await devSource() : await deepSource();
  process.stderr.write(`buildEarthTiles: ${source.id} -> ${join(outDir, 'earth-tiles')}\n`);
  await buildEarthTiles(source, outDir);
  process.stderr.write(`done; tiles under ${join(outDir, 'earth-tiles')}\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
