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

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp from 'sharp';

import type { EarthTileKind } from '../../src/@types/data/EarthTileKind';
import type { EarthTileManifest } from '../../src/@types/scene/EarthTileManifest';
import { EARTH_TILE_PX } from '../../src/data/bodies/earthTileParams';
import { TIER_LADDER } from '../../src/data/tierLadder';
import { earthBaseLevelForTier } from '../../src/utils/scene/earthBaseLevelForTier';
import { earthTileColumns } from '../../src/utils/scene/earthTileColumns';
import { earthTilePath } from '../../src/utils/scene/earthTilePath';
import { parseFlags } from '../utils/cli/args';
import { BMNG_QUADRANT_KEYS } from '../utils/io/bmngQuadrantKeys';
import { BMNG_VINTAGE } from '../utils/io/bmngVintage';
import { rawDataPath } from '../utils/io/rawDataRegistry';
import { earthTileIndicesForBounds } from '../utils/scene/earthTileIndicesForBounds';
import { bmngQuadrantSource, type BmngQuadrant } from './bmngQuadrantSource';
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

/** GeoDanmark's own floor: one level deeper than EOX's own max (z13), same
 *  "pick up where the shallower band stops" rule as `EOX_MIN_LEVEL` — also
 *  the level the z19 harvest bbox is snapped to (`geodanmarkTileSource`'s
 *  `minLevel`), so this is the ladder's single source of truth for both. */
const GEODANMARK_MIN_LEVEL = 14;

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
export const TILE_PREFIX = `${TILE_ROOT}/v6`;

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
  const written: string[] = [];

  for (const { x, y } of candidateTileIndices(source.coverage, z, tilePx)) {
    const rgba = await source.readBox(tileBox(z, x, y, tilePx), tilePx, tilePx);
    if (rgba === null) continue;
    const relPath = earthTilePath({ kind: KIND, z, x, y }, TILE_PREFIX);
    await writeTile(rgba, tilePx, join(outDir, relPath));
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

    // Four children cover the whole canvas already — no filler read (the
    // common interior case). A filler decline (never happens for BMNG in
    // practice) falls back to the transparent canvas, no worse than today.
    const fillerRaster =
      underfill && childPaths.length < 4
        ? await underfill.readBox(tileBox(z, x, y, tilePx), tilePx, tilePx)
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

    await canvas.composite(quadrants).webp({ quality: WEBP_QUALITY }).toFile(outPath);
    written.push(relPath);
  }
  return written;
}

/** Per-band index path — local bake state read back by `--only` to stitch a
 *  skipped band forward; the deploy collector reads only the merged
 *  `index.txt` (`collectEarthTiles`), never these. */
function perBandIndexPath(outDir: string, sourceId: string): string {
  return join(outDir, TILE_ROOT, `index-${sourceId}.txt`);
}

function writePerBandIndex(outDir: string, sourceId: string, relPaths: readonly string[]): void {
  const sorted = [...relPaths].sort();
  writeFileSync(perBandIndexPath(outDir, sourceId), `${sorted.join('\n')}\n`);
}

/** The z a tile path encodes, read off the same `kind/z/x/y.webp` suffix
 *  `earthTilePath` writes — independent of `TILE_PREFIX`'s own depth, so a
 *  version bump between the stitched run and now can't misalign the parse. */
function zFromTilePath(relPath: string): number {
  const parts = relPath.split('/');
  return Number(parts[parts.length - 3]);
}

/**
 * Read back a band's own prior index and hand its lines to the merged index
 * unbaked — the `--only` fast path. Verified before trust: a manually deleted
 * tile, or a level range that drifted since the index was written, would
 * otherwise ship a manifest promising tiles that 404.
 */
function stitchBandIndex(
  outDir: string,
  source: EarthImagerySource,
  minLevel: number,
): readonly string[] {
  const indexPath = perBandIndexPath(outDir, source.id);
  if (!existsSync(indexPath)) {
    throw new Error(
      `bakeAll: --only needs a prior index for '${source.id}' at ${indexPath} — run a full bake first`,
    );
  }
  const relPaths = readFileSync(indexPath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  for (const relPath of relPaths) {
    // A stitched path carries the PRIOR run's TILE_PREFIX baked in (it's read
    // verbatim off disk, never rewritten) — `--only` can only forward tiles
    // that already live under today's prefix. A prefix bump therefore always
    // needs a full bake; this catches the case loudly instead of writing a
    // manifest at the new prefix pointing at index lines the new prefix never baked.
    if (!relPath.startsWith(`${TILE_PREFIX}/`)) {
      throw new Error(
        `bakeAll: stitched band '${source.id}' index was written under a different TILE_PREFIX ` +
          `than today's ${TILE_PREFIX} — '--only' can't carry tiles across a prefix bump, run a full bake`,
      );
    }
    if (!existsSync(join(outDir, relPath))) {
      throw new Error(
        `bakeAll: stitched band '${source.id}' is missing '${relPath}' on disk — run a full bake to repair it`,
      );
    }
  }

  const indexedLevels = new Set(relPaths.map(zFromTilePath));
  for (let z = minLevel; z <= source.maxLevel; z++) {
    if (!indexedLevels.has(z)) {
      throw new Error(
        `bakeAll: stitched band '${source.id}' has no z${z} tiles — its level range drifted since the ` +
          `prior index was written (now z${minLevel}-z${source.maxLevel}) — run a full bake`,
      );
    }
  }

  return relPaths;
}

/**
 * Bake every band's levels (`source.maxLevel` down to that band's own
 * `minLevel`) into `outDir`, then write ONE `index.txt` and ONE
 * `manifest.json` covering all bands — several imagery sources can share a
 * kind at different geographic footprints and depths (EOX deep tiles over
 * BMNG; see `EarthTileManifest`).
 *
 * `opts.only` re-bakes a single band and stitches every other band's tiles
 * forward from its own prior per-band index (`writePerBandIndex`) instead of
 * re-baking them — the ~10 minute BMNG tax on every EOX-only iteration this
 * exists to cut. Manifest entries are still derived fresh for every band
 * (coverage/min/max are pre-bake data, never stale), only the tile BAKE is
 * skipped.
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
  opts?: { readonly only?: string },
): Promise<void> {
  const tilePx = EARTH_TILE_PX;
  const written: string[] = [];
  const bandEntries: NonNullable<EarthTileManifest['levels'][typeof KIND]>[number][] = [];

  if (opts?.only !== undefined && !bands.some((band) => band.source.id === opts.only)) {
    throw new Error(
      `bakeAll: --only '${opts.only}' matches no band — available: ${bands.map((band) => band.source.id).join(', ')}`,
    );
  }

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

    if (opts?.only !== undefined && source.id !== opts.only) {
      const stitched = stitchBandIndex(outDir, source, minLevel);
      written.push(...stitched);
      process.stderr.write(
        `  ${source.id}: stitched ${stitched.length} tiles from its prior index\n`,
      );
    } else {
      process.stderr.write(`  z${maxLevel}: baking from ${source.id}\n`);
      const effective = underfill ? underfillImagerySource(source, underfill) : source;
      const deepest = await bakeDeepestLevel(effective, maxLevel, tilePx, outDir);
      const bandWritten = [...deepest];
      process.stderr.write(`  z${maxLevel}: ${deepest.length} tiles\n`);

      for (let z = maxLevel - 1; z >= minLevel; z--) {
        // A parent's coverage box is the same as its children's (containment
        // of bounds), so the band's own boxes clamp every coarser level too.
        const levelPaths = await bakeCoarserLevel(z, tilePx, outDir, underfill, source.coverage);
        bandWritten.push(...levelPaths);
        process.stderr.write(`  z${z}: ${levelPaths.length} tiles (2x2 average of z${z + 1})\n`);
      }

      writePerBandIndex(outDir, source.id, bandWritten);
      written.push(...bandWritten);
    }

    // One entry per coverage box: a source spanning the antimeridian declares
    // two boxes rather than one that wraps (see `LonLatBounds`). `builtFrom`
    // is the source's OWN provenance — never a module-level assumption, or a
    // second band's manifest entry would carry the first band's identity.
    // Derived from `source`, not the stitched index, for every band alike —
    // the manifest is always fresh.
    for (const bounds of source.coverage) {
      bandEntries.push({ bounds, min: minLevel, max: maxLevel, builtFrom: source.provenance });
    }
  }

  const manifest: EarthTileManifest = {
    prefix: TILE_PREFIX,
    tilePx,
    levels: { [KIND]: bandEntries },
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

/** `--only <sourceId>`: the one string-valued flag this tool takes.
 *  `parseFlags` stays bool-only by design (see its own docstring), so this
 *  mirrors `fetchFamousImages`'s `--source-preference` — a bespoke scan
 *  beside the `parseFlags` call, not a change to its schema. */
function onlySourceId(argv: readonly string[]): string | undefined {
  const idx = argv.indexOf('--only');
  return idx >= 0 && idx + 1 < argv.length ? argv[idx + 1] : undefined;
}

async function main(): Promise<void> {
  const outDir = resolve('public/data/images');
  const argv = process.argv.slice(2);
  const { '--dev': dev } = parseFlags(argv, { '--dev': 'bool' });
  const only = onlySourceId(argv);
  process.stderr.write(`buildEarthTiles: -> ${join(outDir, 'earth-tiles')}\n`);
  if (dev) {
    // Whole-globe BMNG only — the EOX and GeoDanmark bands need real harvests
    // on disk, which `--dev` explicitly opts out of (see `devSource`).
    await bakeAll([{ source: await devSource(), minLevel: BAKE_MIN_LEVEL }], outDir, { only });
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
          source: await eoxTileSource({ coverageDir: rawDataPath('eox.dir') }),
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
      { only },
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
