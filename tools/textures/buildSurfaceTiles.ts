#!/usr/bin/env node
/**
 * buildSurfaceTiles — bake a body's surface imagery into the `z/x/y` pyramid
 * the runtime virtual texture pages, under `public/data/images/<manifestKey>/`.
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
 * Idempotent per tile (a re-run skips a tile whose output already exists,
 * bytes unchanged) and per invocation: `index.txt`/`manifest.json` are
 * written LAST, only once every tile the union of the prior index and this
 * run's bake promises is actually present on disk — see `bakeAll`.
 *
 * Lands on disk: `earth-tiles/v8/albedo/<z>/<x>/<y>.webp` (`surfaceTilePath`,
 * shared with the runtime fetcher's own URL builder — drift 404s quietly,
 * degrading to the base texture); `earth-tiles/manifest.json` (tile edge,
 * baked band list, source); `earth-tiles/index.txt` (one path per line,
 * walked by the deploy collector instead of the filesystem, so a
 * half-finished bake can't upload a partial pyramid as complete).
 * `public/data/` is gitignored — nothing here is committed.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp, { type Sharp } from 'sharp';

import type { SurfaceTileProduct } from '../../src/@types/data/SurfaceTileProduct';
import type { SurfaceTileManifest } from '../../src/@types/scene/SurfaceTileManifest';
import type { SurfaceTileManifestBand } from '../../src/@types/scene/SurfaceTileManifestBand';
import { EARTH_TILE_PX } from '../../src/data/bodies/earthTileParams';
import { TIER_LADDER } from '../../src/data/tierLadder';
import { earthBaseLevelForTier } from '../../src/utils/scene/earthBaseLevelForTier';
import { surfaceTilePath } from '../../src/utils/scene/surfaceTilePath';
import { SURFACE_TILE_REGISTRY } from '../../src/data/bodies/surfaceTileRegistry';
import { parseFlags } from '../utils/cli/args';
import { BMNG_QUADRANT_KEYS } from '../utils/io/bmngQuadrantKeys';
import { BMNG_VINTAGE } from '../utils/io/bmngVintage';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { earthTileBounds } from '../utils/scene/earthTileBounds';
import { earthTileIndicesForBounds } from '../utils/scene/earthTileIndicesForBounds';
import { bmngQuadrantSource, type BmngQuadrant } from './bmngQuadrantSource';
import { colourMatchedImagerySource } from './colourMatchedImagerySource';
import type { EarthImagerySource } from './EarthImagerySource';
import { equirectFileSource } from './equirectFileSource';
import { eoxTileSource } from './eoxTileSource';
import { geodanmarkTileSource } from './geodanmarkTileSource';
import { underfillImagerySource } from './underfillImagerySource';
import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';

/** Default coverage for a caller that doesn't clamp — degenerates
 *  `candidateTileIndices` back to the whole grid. */
const WHOLE_GLOBE: readonly LonLatBounds[] = [{ west: -180, east: 180, south: -90, north: 90 }];

/**
 * Every `(x, y)` a bake at level `z` needs to visit for `coverage`: the union
 * of each box's tile rect, deduped through a `Set` so overlapping or adjacent
 * boxes can't queue the same tile twice, in row-major order so `written`
 * stays deterministic before its final sort.
 */
function candidateTileIndices(
  coverage: ReadonlyArray<LonLatBounds>,
  z: number,
  tilePx: number,
): ReadonlyArray<{ readonly x: number; readonly y: number }> {
  const seen = new Set<string>();
  const indices: Array<{ x: number; y: number }> = [];
  for (const bounds of coverage) {
    const rect = earthTileIndicesForBounds(bounds, z, tilePx);
    for (let y = rect.yMin; y <= rect.yMax; y++) {
      for (let x = rect.xMin; x <= rect.xMax; x++) {
        const key = `${x},${y}`;
        if (seen.has(key)) continue;
        seen.add(key);
        indices.push({ x, y });
      }
    }
  }
  indices.sort((a, b) => a.y - b.y || a.x - b.x);
  return indices;
}

/** Lossy WebP quality for surface tiles: JPEG can't carry the alpha channel
 *  that doubles as the land mask. */
const WEBP_QUALITY = 82;

/**
 * Shallowest level this bake emits: one finer than the COARSEST whole-globe
 * base, not the finest — pinning this to the `large` tier's z4 base would
 * leave `medium`/`small` sessions falling back to the base texture one or
 * two levels early (an unbaked level 404s like ocean does).
 */
const BAKE_MIN_LEVEL = Math.min(...TIER_LADDER.map(earthBaseLevelForTier)) + 1;

/**
 * Shallowest level the EOX regional band emits: one deeper than BMNG's OWN
 * max (z7), not derived from `BAKE_MIN_LEVEL` — a regional band's floor is a
 * different rule ("pick up where the global band stops"), not the global
 * band's own tier-derived floor.
 */
const EOX_MIN_LEVEL = 8;

/** Scale below which EOX's colour is pulled onto Blue Marble's, in degrees
 *  along a meridian: 2 km is about one Blue Marble texel, so the seam is
 *  matched at the finest scale the band underneath can resolve and everything
 *  finer stays EOX's own. */
const EOX_COLOUR_MATCH_SIGMA_DEG = 0.018;

/** GeoDanmark's own floor: one level deeper than EOX's own max (z13), same
 *  "pick up where the shallower band stops" rule as `EOX_MIN_LEVEL` — also
 *  the level the z19 harvest bbox is snapped to (`geodanmarkTileSource`'s
 *  `minLevel`), so this is the ladder's single source of truth for both. */
const GEODANMARK_MIN_LEVEL = 14;

/** The only product this tool bakes today — height is Task 9's bake. */
const PRODUCT: SurfaceTileProduct = 'albedo';

/** Stable location of the manifest and index — the pointer clients always fetch. */
const TILE_ROOT = 'earth-tiles';

/**
 * Versioned prefix for the tile bodies themselves. BUMP THIS on any re-bake
 * that changes pixels: the tiles are served `immutable` and never purged, so
 * reusing a version leaves the CDN answering with old imagery against a new
 * manifest for up to a day — mismatched, not merely stale. A new version is
 * new keys, which cost nothing extra and need no purge. v8: the `levels` →
 * `bands` manifest break plus the new `albedo/` path segment (Task 3).
 */
export const TILE_PREFIX = `${TILE_ROOT}/v8`;

/**
 * Encode a sharp pipeline to `outPath` atomically: write to `<outPath>.tmp`,
 * then rename over it. Without this, a bake killed mid-encode leaves a
 * truncated file that a LATER idempotent run's `existsSync` skip-check would
 * trust as already-baked and never retry.
 */
async function stageWrite(pipeline: Sharp, outPath: string): Promise<void> {
  mkdirSync(dirname(outPath), { recursive: true });
  const tmpPath = `${outPath}.tmp`;
  await pipeline.toFile(tmpPath);
  renameSync(tmpPath, outPath);
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
  await stageWrite(
    sharp(rgba, { raw: { width: tilePx, height: tilePx, channels: 4 } }).webp({
      quality: WEBP_QUALITY,
    }),
    outPath,
  );
}

/**
 * Bake the deepest level straight from the imagery source, one tile at a
 * time. A source that declines a box emits no tile at all — a land-only
 * pyramid is sparse, not full of empty files, and the runtime treats the
 * resulting 404 as a permanent miss.
 *
 * A tile whose output already exists is skipped without calling `readBox` —
 * the idempotent-bake fast path — and still counted as written, since it's
 * present on disk either way.
 */
async function bakeDeepestLevel(
  source: EarthImagerySource,
  z: number,
  tilePx: number,
  outDir: string,
): Promise<readonly string[]> {
  const written: string[] = [];

  for (const { x, y } of candidateTileIndices(source.coverage, z, tilePx)) {
    const relPath = surfaceTilePath({ product: PRODUCT, z, x, y }, TILE_PREFIX);
    const outPath = join(outDir, relPath);
    if (existsSync(outPath)) {
      written.push(relPath);
      continue;
    }
    const rgba = await source.readBox(earthTileBounds(z, x, y, tilePx), tilePx, tilePx);
    if (rgba === null) continue;
    await writeTile(rgba, tilePx, outPath);
    written.push(relPath);
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
 * A parent with no children is not written. One with SOME children, and no
 * `underfill` source, is written with the missing quadrants transparent, so
 * the base texture shows through (the global band's own coarser levels, and
 * the future coastal-sparse case). With `underfill`, the missing quadrants
 * are filled from it instead — see `underfillImagerySource` for why a baked
 * tile must always end up fully opaque.
 */
export async function bakeCoarserLevel(
  z: number,
  tilePx: number,
  outDir: string,
  underfill?: EarthImagerySource,
  coverage: ReadonlyArray<LonLatBounds> = WHOLE_GLOBE,
): Promise<string[]> {
  const halfPx = tilePx / 2;
  const written: string[] = [];

  for (const { x, y } of candidateTileIndices(coverage, z, tilePx)) {
    const relPath = surfaceTilePath({ product: PRODUCT, z, x, y }, TILE_PREFIX);
    const outPath = join(outDir, relPath);
    if (existsSync(outPath)) {
      written.push(relPath);
      continue;
    }

    const childPaths = [
      { i: 0, j: 0 },
      { i: 1, j: 0 },
      { i: 0, j: 1 },
      { i: 1, j: 1 },
    ]
      .map(({ i, j }) => ({
        input: join(
          outDir,
          surfaceTilePath({ product: PRODUCT, z: z + 1, x: 2 * x + i, y: 2 * y + j }, TILE_PREFIX),
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

    // Four children cover the whole canvas already — no filler read (the
    // common interior case). A filler decline (never happens for BMNG in
    // practice) falls back to the transparent canvas, no worse than today.
    const fillerRaster =
      underfill && childPaths.length < 4
        ? await underfill.readBox(earthTileBounds(z, x, y, tilePx), tilePx, tilePx)
        : null;
    const canvas = fillerRaster
      ? sharp(Buffer.from(fillerRaster), { raw: { width: tilePx, height: tilePx, channels: 4 } })
      : sharp({
          create: {
            width: tilePx,
            height: tilePx,
            channels: 4,
            background: { r: 0, g: 0, b: 0, alpha: 0 },
          },
        });

    await stageWrite(canvas.composite(quadrants).webp({ quality: WEBP_QUALITY }), outPath);
    written.push(relPath);
  }
  return written;
}

/** `index.txt`'s prior lines, or an empty set on a first bake into a fresh
 *  `outDir` — the floor `bakeAll`'s completeness check holds every run to,
 *  and the other half of the new index's union (see `bakeAll`). */
function readPriorIndex(outDir: string): ReadonlySet<string> {
  const indexPath = join(outDir, `${TILE_ROOT}/index.txt`);
  if (!existsSync(indexPath)) return new Set();
  return new Set(
    readFileSync(indexPath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
}

/**
 * Bake every band's levels (`source.maxLevel` down to that band's own
 * `minLevel`) into `outDir`, then write ONE `index.txt` and ONE
 * `manifest.json` covering all bands — several imagery sources can share a
 * product at different geographic footprints and depths (EOX deep tiles over
 * BMNG; see `SurfaceTileManifest`).
 *
 * Idempotent: `bakeDeepestLevel`/`bakeCoarserLevel` skip a tile whose output
 * already exists, so a re-run over unchanged bands costs seconds, not hours.
 * The new index is the UNION of the prior `index.txt` and this run's writes
 * — a run given only some of the bands (or none, `bands: []`, to just
 * re-verify) must not drop the others' tiles from the merged index. Before
 * committing that union, every path the PRIOR index promised is checked
 * against disk; if any is missing (deleted by hand, a bad rsync, a source
 * that can no longer reproduce it), `bakeAll` throws and writes NEITHER
 * `index.txt` nor `manifest.json`, so a broken pyramid never looks complete.
 */
export async function bakeAll(
  bands: ReadonlyArray<{
    readonly source: EarthImagerySource;
    readonly minLevel: number;
    /** Global-band source to underfill this band's uncovered margins with,
     *  at every level — see `underfillImagerySource` for why a regional
     *  band's tiles must always come out fully opaque. */
    readonly underfill?: EarthImagerySource;
  }>,
  outDir: string,
): Promise<void> {
  const tilePx = EARTH_TILE_PX;
  const written: string[] = [];
  const bandEntries: SurfaceTileManifestBand[] = [];

  for (const { source, minLevel, underfill } of bands) {
    const maxLevel = source.maxLevel;

    // A source that can't beat its own band floor has nothing to contribute
    // — for the global band that floor is the coarsest tier's whole-globe
    // base; for a regional band it's the deeper level a caller chose.
    if (maxLevel < minLevel) {
      throw new Error(
        `bakeAll: source '${source.id}' reaches only z${maxLevel}, at or below its band floor z${minLevel} — nothing to bake`,
      );
    }

    process.stderr.write(`  z${maxLevel}: baking from ${source.id}\n`);
    const effective = underfill ? underfillImagerySource(source, underfill) : source;
    const deepest = await bakeDeepestLevel(effective, maxLevel, tilePx, outDir);
    written.push(...deepest);
    process.stderr.write(`  z${maxLevel}: ${deepest.length} tiles\n`);

    for (let z = maxLevel - 1; z >= minLevel; z--) {
      // A parent's coverage box is the same as its children's (containment
      // of bounds), so the band's own boxes clamp every coarser level too.
      const levelPaths = await bakeCoarserLevel(z, tilePx, outDir, underfill, source.coverage);
      written.push(...levelPaths);
      process.stderr.write(`  z${z}: ${levelPaths.length} tiles (2x2 average of z${z + 1})\n`);
    }

    // One entry per coverage box: a source spanning the antimeridian declares
    // two boxes rather than one that wraps (see `LonLatBounds`). `builtFrom`
    // is the source's OWN provenance — never a module-level assumption, or a
    // second band's manifest entry would carry the first band's identity.
    // Keyed by `PRODUCT`, not a bare value: a later product baking the SAME
    // box (Task 9's height) adds its own `builtFrom` entry to this band
    // rather than a second band row.
    for (const bounds of source.coverage) {
      bandEntries.push({
        bounds,
        min: minLevel,
        max: maxLevel,
        builtFrom: { [PRODUCT]: source.provenance },
      });
    }
  }

  const priorPaths = readPriorIndex(outDir);
  const finalPaths = new Set([...priorPaths, ...written]);

  const missing = [...priorPaths].filter((relPath) => !existsSync(join(outDir, relPath)));
  if (missing.length > 0) {
    throw new Error(
      `bakeAll: refusing to write index.txt/manifest.json — ${missing.length} tile(s) the prior ` +
        `index promised are missing on disk, e.g. '${missing[0]}'; the previous manifest is untouched`,
    );
  }

  const manifest: SurfaceTileManifest = {
    prefix: TILE_PREFIX,
    tilePx,
    bands: bandEntries,
  };

  // Sorted so two bakes of the same pyramid produce the same index, letting a
  // resumed sync diff one against the other.
  const sorted = [...finalPaths].sort();
  writeFileSync(join(outDir, `${TILE_ROOT}/index.txt`), `${sorted.join('\n')}\n`);

  // Written LAST, after the index it implies and after the completeness
  // check above: an interrupted or now-incomplete bake then leaves the
  // PREVIOUS manifest in place, so the runtime keeps serving what it last
  // knew to be whole rather than a manifest naming tiles that 404.
  writeFileSync(
    join(outDir, `${TILE_ROOT}/manifest.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  process.stderr.write(`  ${sorted.length} tiles indexed\n`);
}

/** Shared: the quadrants and the whole-globe equirect are the SAME BMNG month
 *  (see `BMNG_VINTAGE`). */
const BMNG_ATTRIBUTION = `NASA Blue Marble Next Generation, ${BMNG_VINTAGE.label} topography + bathymetry (public domain, credit NASA Earth Observatory).`;

/** The shipped source: BMNG's eight-file quadrant set, reaching z7. */
async function deepSource(): Promise<EarthImagerySource> {
  return bmngQuadrantSource({
    id: `nasa-bmng-${BMNG_VINTAGE.stamp}-quadrants`,
    attribution: BMNG_ATTRIBUTION,
    vintage: BMNG_VINTAGE.label,
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
    vintage: BMNG_VINTAGE.label,
  });
}

/** `--product albedo|height`: `parseFlags` stays bool-only by design (see its
 *  own docstring), so this is a bespoke scan beside the `parseFlags` call —
 *  same shape as `fetchFamousImages`'s `--source-preference`. Validated but
 *  not yet dispatched on: every band bakes `PRODUCT` ('albedo') regardless,
 *  since no band declares a height source until Task 9 wires one in. */
function productFlag(argv: readonly string[]): SurfaceTileProduct | undefined {
  const idx = argv.indexOf('--product');
  if (idx < 0) return undefined;
  const value = argv[idx + 1];
  if (value !== 'albedo' && value !== 'height') {
    throw new Error(`buildSurfaceTiles: --product must be 'albedo' or 'height', got '${value}'`);
  }
  return value;
}

/** `--body <id>`: validated against `SURFACE_TILE_REGISTRY` so an unknown
 *  body fails loudly rather than silently baking Earth's bands under its
 *  name. One row (`earth`) until F4 (R7) — the flag exists now so deploy
 *  scripts can name their body explicitly ahead of a second one landing. */
function bodyFlag(argv: readonly string[]): keyof typeof SURFACE_TILE_REGISTRY {
  const idx = argv.indexOf('--body');
  const value = idx >= 0 && idx + 1 < argv.length ? argv[idx + 1]! : 'earth';
  if (!(value in SURFACE_TILE_REGISTRY)) {
    throw new Error(
      `buildSurfaceTiles: --body '${value}' has no SURFACE_TILE_REGISTRY entry (only 'earth' until F4)`,
    );
  }
  return value as keyof typeof SURFACE_TILE_REGISTRY;
}

async function main(): Promise<void> {
  const outDir = resolve('public/data/images');
  const argv = process.argv.slice(2);
  const { '--dev': dev } = parseFlags(argv, { '--dev': 'bool' });
  productFlag(argv); // validated; see the function's own doc for why it's inert today
  bodyFlag(argv);
  process.stderr.write(`buildSurfaceTiles: -> ${join(outDir, 'earth-tiles')}\n`);
  if (dev) {
    // Whole-globe BMNG only — the EOX and GeoDanmark bands need real harvests
    // on disk, which `--dev` explicitly opts out of (see `devSource`).
    await bakeAll([{ source: await devSource(), minLevel: BAKE_MIN_LEVEL }], outDir);
  } else {
    // Shared instance, not two separate `deepSource()` calls: reuses BMNG's
    // band cache, and its `readBox` handles arbitrary small boxes (Copenhagen
    // sits wholly inside quadrant C1, no seam risk) — the same source can
    // serve both as the global band and as the EOX band's underfill.
    const bmng = await deepSource();
    await bakeAll(
      [
        { source: bmng, minLevel: BAKE_MIN_LEVEL },
        {
          source: colourMatchedImagerySource(
            await eoxTileSource({ coverageDir: rawDataPath('eox.dir') }),
            bmng,
            {
              sigmaDeg: EOX_COLOUR_MATCH_SIGMA_DEG,
              waterMaskPath: rawDataPath('textures.earthWaterMask'),
            },
          ),
          minLevel: EOX_MIN_LEVEL,
          underfill: bmng,
        },
        {
          source: await geodanmarkTileSource({
            coverageDir: rawDataPath('geodanmark.dir'),
            minLevel: GEODANMARK_MIN_LEVEL,
          }),
          minLevel: GEODANMARK_MIN_LEVEL,
          // No underfill: the harvest bbox is snapped to this band's own
          // minLevel grid (see `geodanmarkTileSource`), so every z14-18
          // parent inside coverage already has all four children.
        },
      ],
      outDir,
    );
  }
  process.stderr.write(`done; tiles under ${join(outDir, 'earth-tiles')}\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
