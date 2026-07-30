#!/usr/bin/env node
/**
 * buildEarthTiles — bake Earth's surface imagery into the `z/x/y` pyramid the
 * runtime virtual texture pages, under `public/data/images/earth-tiles/`.
 *
 * Its own tool rather than another loop inside `buildTextures`. The tiered
 * whole-globe textures build from raws every contributor fetches, in seconds;
 * this bake needs inputs most contributors will not have on disk and, at the
 * levels the shipped pyramid eventually reaches, runs for hours. Folding it in
 * would make `npm run build-textures` fail — or silently skip — for everyone.
 * The drift argument that justified emitting the boot atlas inside
 * `buildTextures` does not transfer either: these tiles derive from a
 * DIFFERENT source than the whole-globe tiers, so re-curating one cannot
 * silently stale the other.
 *
 * ## Orientation: row 0 of every tile is its NORTH edge
 *
 * The single most consequential line in this file is that tile `y` increases
 * SOUTH and the raster inside each tile is north-first. Tiles therefore upload
 * with `flipY: false`, unlike the whole-globe maps, whose `flipY: true` exists
 * to reconcile a north-first image with the mesh's south-first `v`. Here that
 * reconciliation happens once, in the tile-index arithmetic
 * (`earthTileXyForUv`), rather than being re-derived at every upload. Getting
 * it backwards produces a globe that is per-tile upside down, which does not
 * look like a bad flip — it looks like a shader bug, two phases away from the
 * line that caused it.
 *
 * ## Build order: deepest level first, coarser levels from disk
 *
 * The deepest level is produced from the imagery source, tile by tile,
 * streamed straight to disk. Every coarser level is then a 2 x 2 average of
 * four tiles from the level ABOVE, read back off disk. Nothing in the process
 * ever holds a whole-globe raster — which at z11 would be 1.6 TB — and nothing
 * holds a whole level either. A source that reaches only the bake floor — the
 * `--dev` whole-globe equirect — leaves the coarsening loop unexecuted; the
 * quadrant source's z7 runs it down to z5.
 *
 * The 2 x 2 average is `sharp`'s own resize at an exact factor of two, which
 * libvips serves with an integer block shrink — a plain average of each 2 x 2
 * group, no kernel weighting. Re-encoding a WebP per level does accumulate
 * generation loss down the pyramid, and that is the accepted price of never
 * materialising a level in memory; the coarse levels are also the ones the
 * planner requests when the ground is far away and small on screen.
 *
 * ## What lands on disk
 *
 * - `earth-tiles/surface/<z>/<x>/<y>.webp` — paths from `earthTilePath`, the
 *   SAME function the runtime fetcher builds its URL from. A name constructed
 *   twice is a name that eventually 404s, and here it 404s quietly: a missing
 *   tile degrades to the base texture and simply looks like the feature did
 *   nothing.
 * - `earth-tiles/manifest.json` — tile edge, baked level range, and the source
 *   the pixels came from, so a stale or mis-licensed bake is diagnosable from
 *   the deployed data rather than from the git log.
 * - `earth-tiles/index.txt` — one relative tile path per line. The deploy
 *   collector walks THIS, not the filesystem, so a half-finished bake cannot
 *   upload a partial pyramid that the runtime then treats as complete. It is
 *   emitted here, at the one site that knows what was actually written;
 *   retrofitting it later would mean re-baking.
 *
 * The whole `public/data/` tree is a build artefact and is gitignored, so
 * nothing this tool emits is ever committed.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import type { EarthTileKind } from '../../src/@types/data/EarthTileKind';
import type { EarthTileManifest } from '../../src/@types/scene/EarthTileManifest';
import { EARTH_TILE_PX } from '../../src/data/bodies/earthTileParams';
import { earthBaseLevelForTier } from '../../src/utils/scene/earthBaseLevelForTier';
import { earthTileColumns } from '../../src/utils/scene/earthTileColumns';
import { earthTilePath } from '../../src/utils/scene/earthTilePath';
import { parseFlags } from '../utils/cli/args';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { bmngQuadrantSource } from './bmngQuadrantSource';
import type { EarthImagerySource } from './EarthImagerySource';
import { equirectFileSource } from './equirectFileSource';
import type { LonLatBox } from './LonLatBox';

/**
 * Lossy WebP quality for surface tiles. JPEG cannot carry the alpha channel
 * that doubles as the land mask, and at the object counts a deep pyramid
 * reaches, WebP's ~25% saving over JPEG at matched quality is real money in
 * sync wall-clock rather than a rounding error.
 */
const WEBP_QUALITY = 82;

/**
 * Shallowest level this bake emits: one finer than the base the LARGEST tier
 * delivers, so every tile on disk refines the finest whole-globe texture that
 * ships rather than re-serving it.
 *
 * A bake floor, and nothing else. The runtime learns it from the manifest's
 * `levels.min` and floors its own requests at one finer than the base ITS tier
 * bound, so lowering this — baking z3 and z4 so a `small` or `medium` session
 * gets a continuous ladder from its own base upward — is a re-bake with no code
 * change on the other side. Reading this same number as a runtime request floor
 * is what would make such a re-bake appear to do nothing, which is why it lives
 * here and not beside the ladder constants.
 */
const BAKE_MIN_LEVEL = earthBaseLevelForTier('large') + 1;

/**
 * The only kind this tool bakes. Surface albedo is where the resolution
 * shortfall is: relief stays whole-globe, and clouds, night lights and the
 * material map carry no fine structure worth streaming. `EarthTileKind` is
 * welded to `TextureKind`, so widening the bake to a second kind is a loop
 * over kinds here, not a type rewrite.
 */
const KIND: EarthTileKind = 'surface';

/**
 * The geographic extent of tile `(z, x, y)`. `x` increases east from longitude
 * -180 and `y` increases SOUTH from latitude +90, so row 0 spans the north
 * polar band — the same convention the emitted raster's row 0 follows.
 */
function tileBox(z: number, x: number, y: number, tilePx: number): LonLatBox {
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
 * Encode one RGBA raster as a surface tile and write it, creating its `z/x`
 * directories on the way.
 *
 * The raster is four-channel even for a globally-covered source whose alpha is
 * uniformly 255: the runtime's blend is written against the presence of the
 * channel, not against its content. libwebp then drops the alpha PLANE from a
 * fully-opaque image, so such a tile is a 3-channel file on disk — which is
 * harmless, because `createImageBitmap` plus an `rgba8unorm-srgb` upload
 * yields alpha 1 either way. A land-only source's tiles carry real
 * transparency and keep the plane.
 */
async function writeTile(rgba: Uint8Array, tilePx: number, outPath: string): Promise<void> {
  mkdirSync(dirname(outPath), { recursive: true });
  await sharp(rgba, { raw: { width: tilePx, height: tilePx, channels: 4 } })
    .webp({ quality: WEBP_QUALITY })
    .toFile(outPath);
}

/**
 * Bake the deepest level straight from the imagery source, one tile at a time.
 * A source that declines a box (no coverage there) emits no tile at all, which
 * is what makes a land-only pyramid sparse rather than full of empty files;
 * the runtime treats the resulting 404 as a permanent miss and never re-asks.
 *
 * Returns the relative paths written.
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
      const relPath = earthTilePath({ kind: KIND, z, x, y });
      await writeTile(rgba, tilePx, join(outDir, relPath));
      written.push(relPath);
    }
  }
  return written;
}

/**
 * Bake one level as the 2 x 2 average of the level above, reading the children
 * back off disk so no level is ever resident.
 *
 * Child `(2x + i, 2y + j)` at `z + 1` occupies the `(i, j)` quadrant of the
 * parent, with `j = 0` on top: `y` increases south in the grid AND rows run
 * north-first inside a tile, so the two agree and the quadrant offsets are the
 * plain product of the child index and the tile edge.
 *
 * A parent with no children at all is not written. A parent with SOME children
 * is written with the missing quadrants transparent, so a coastal tile at a
 * coarse level still carries its land and lets the base texture through
 * everywhere else.
 *
 * Returns the relative paths written.
 */
async function bakeCoarserLevel(z: number, tilePx: number, outDir: string): Promise<string[]> {
  const columns = earthTileColumns(z, tilePx);
  const rows = columns / 2;
  const written: string[] = [];

  for (let y = 0; y < rows; y++) {
    for (let x = 0; x < columns; x++) {
      const quadrants = [
        { i: 0, j: 0 },
        { i: 1, j: 0 },
        { i: 0, j: 1 },
        { i: 1, j: 1 },
      ]
        .map(({ i, j }) => ({
          input: join(outDir, earthTilePath({ kind: KIND, z: z + 1, x: 2 * x + i, y: 2 * y + j })),
          left: i * tilePx,
          top: j * tilePx,
        }))
        .filter((quadrant) => existsSync(quadrant.input));
      if (quadrants.length === 0) continue;

      const relPath = earthTilePath({ kind: KIND, z, x, y });
      const outPath = join(outDir, relPath);
      mkdirSync(dirname(outPath), { recursive: true });
      await sharp({
        create: {
          width: 2 * tilePx,
          height: 2 * tilePx,
          channels: 4,
          background: { r: 0, g: 0, b: 0, alpha: 0 },
        },
      })
        .composite(quadrants)
        // An exact halving, which libvips serves as an integer block shrink:
        // each output texel is the plain average of its 2 x 2 group.
        .resize(tilePx, tilePx)
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

  // Levels at or below the largest tier's base ARE a whole-globe texture that
  // already ships, so a source that cannot beat it has nothing to contribute and
  // an empty pyramid would be indistinguishable from a broken one.
  if (maxLevel < minLevel) {
    throw new Error(
      `buildEarthTiles: source '${source.id}' reaches only z${maxLevel}, at or below the largest tier's whole-globe base at z${minLevel - 1} — nothing to bake`,
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

  const manifest: EarthTileManifest = {
    tilePx,
    levels: { [KIND]: { min: minLevel, max: maxLevel } },
    builtFrom: { [KIND]: `${source.id} — ${source.attribution}` },
  };
  writeFileSync(
    join(outDir, 'earth-tiles/manifest.json'),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  // Sorted so two bakes of the same pyramid produce the same index, which is
  // what lets a resumed sync diff one against the other.
  written.sort();
  writeFileSync(join(outDir, 'earth-tiles/index.txt'), `${written.join('\n')}\n`);

  process.stderr.write(`  ${written.length} tiles indexed\n`);
}

/**
 * The shipped source: BMNG's eight-file August 2004 quadrant set, which reaches
 * z7. Named here rather than inside the source module so the vintage and its
 * attribution string sit together at the one site that decides what gets baked.
 */
async function deepSource(): Promise<EarthImagerySource> {
  return bmngQuadrantSource({
    id: 'nasa-bmng-200408',
    attribution:
      'NASA Blue Marble Next Generation, August 2004 topography + bathymetry (public domain, credit NASA Earth Observatory).',
    quadrantPaths: {
      A1: rawDataPath('textures.nasaBmng200408A1'),
      A2: rawDataPath('textures.nasaBmng200408A2'),
      B1: rawDataPath('textures.nasaBmng200408B1'),
      B2: rawDataPath('textures.nasaBmng200408B2'),
      C1: rawDataPath('textures.nasaBmng200408C1'),
      C2: rawDataPath('textures.nasaBmng200408C2'),
      D1: rawDataPath('textures.nasaBmng200408D1'),
      D2: rawDataPath('textures.nasaBmng200408D2'),
    },
  });
}

/**
 * `--dev`: the whole-globe equirect, which reaches z5 and therefore bakes the
 * single shallowest level this tool emits. It needs only the raw every
 * contributor's `fetch-textures` already pulls, so it is the way to exercise the
 * pipeline end to end in seconds without the quadrant set's 421 MB.
 *
 * An explicit flag rather than "use the quadrants if they happen to be on disk":
 * a silent fall-back to the shallow source would emit a pyramid that is complete,
 * valid and four levels short, and nothing downstream can tell that from the
 * intended bake.
 */
async function devSource(): Promise<EarthImagerySource> {
  return equirectFileSource({
    id: 'nasa-bmng-200412',
    rawKey: 'textures.nasaBmng',
    attribution:
      'NASA Blue Marble Next Generation, December 2004 topography + bathymetry (public domain, credit NASA Earth Observatory).',
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
