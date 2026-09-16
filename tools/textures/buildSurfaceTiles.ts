#!/usr/bin/env node
/**
 * buildSurfaceTiles — bake a body's surface imagery into the `z/x/y` pyramid
 * the runtime virtual texture pages, under `public/data/images/<manifestKey>/`.
 * `--body <id>` (default `earth`) selects a `SURFACE_BODY_BAKES` row; the
 * bands themselves (which sources, which floors) are that body's own concern.
 *
 * Its own tool rather than a loop inside `buildTextures`: the whole-globe
 * tiers build from raws every contributor already has, in seconds, while this
 * bake needs inputs most contributors lack and can run for hours at the
 * levels the shipped pyramid reaches; folding it in would break (or silently
 * skip) `build-textures` for everyone, and the two derive from DIFFERENT
 * sources, so re-curating one cannot stale the other.
 *
 * Row 0 of every tile is its NORTH edge (see `SurfaceImagerySource` for why).
 * The deepest albedo level bakes from the imagery source tile by tile,
 * straight to disk; every coarser level is a 2x2 average of the level above,
 * read back off disk (see `bakeCoarserLevel` for the sharp/libvips
 * composite-order landmine that governs how that average is built). Heights
 * decimate instead of averaging and are a level, not a tile, at a time —
 * `bakeHeightLevel` owns that operator and the reasons for it.
 *
 * Idempotent per tile (a re-run skips a tile whose output already exists,
 * bytes unchanged) and per invocation: `index.txt`/`manifest.json` are
 * written LAST, only once every tile the union of the prior index and this
 * run's bake promises is actually present on disk — see `bakeAll`.
 *
 * Lands on disk under the body's own `tileRoot`, e.g. `earth-tiles/v9/albedo/
 * <z>/<x>/<y>.webp` and, for a band declaring a height source, `earth-tiles/
 * v9/height/<z>/<x>/<y>.webp` (`surfaceTilePath`, shared with the runtime
 * fetcher's own URL builder — drift 404s quietly, degrading to the base
 * texture); `<tileRoot>/manifest.json` (tile edge, baked band list, source);
 * `<tileRoot>/index.txt` (one path per line, walked by the deploy collector
 * instead of the filesystem, so a half-finished bake can't upload a partial
 * pyramid as complete). `public/data/` is gitignored — nothing here is
 * committed.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import sharp, { type Sharp } from 'sharp';

import type { SurfaceTileProduct } from '../../src/@types/data/SurfaceTileProduct';
import type { SurfaceTileBodyId } from '../../src/@types/data/SurfaceTileBodyId';
import type { SurfaceTileManifest } from '../../src/@types/scene/SurfaceTileManifest';
import type { SurfaceTileManifestBand } from '../../src/@types/scene/SurfaceTileManifestBand';
import type { SurfaceTileBand } from '../../src/@types/scene/SurfaceTileBand';
import { SURFACE_TILE_PX } from '../../src/data/bodies/surfaceTileParams';
import { HEIGHT_POSTS_PER_TILE } from '../../src/data/scene/heightTileFormat';
import { surfaceTilePath } from '../../src/utils/surfaceTiles/surfaceTilePath';
import { surfaceTileBandFromBounds } from '../../src/utils/surfaceTiles/surfaceTileBandFromBounds';
import { surfaceTileColumns } from '../../src/utils/surfaceTiles/surfaceTileColumns';
import { surfaceTileInBand } from '../../src/utils/surfaceTiles/surfaceTileInBand';
import { parseFlags } from '../utils/cli/args';
import { heightLatticeStepDeg } from '../utils/textures/heightLatticeStepDeg';
import { mergeSurfaceTileManifest } from '../utils/textures/mergeSurfaceTileManifest';
import { readHeightTileFile } from '../utils/textures/readHeightTileFile';
import { surfaceTileBounds } from '../utils/scene/surfaceTileBounds';
import { surfaceTileIndicesForBounds } from '../utils/scene/surfaceTileIndicesForBounds';
import { bakeHeightLevel } from './bakeHeightLevel';
import { earthSurfaceBake } from './surfaceBodies/earthSurfaceBake';
import type { SurfaceBakeBand } from './SurfaceBakeBand';
import type { SurfaceBodyBake } from './SurfaceBodyBake';
import type { SurfaceImagerySource } from './SurfaceImagerySource';
import { underfillImagerySource } from './underfillImagerySource';
import type { LonLatBounds } from '../../src/@types/scene/LonLatBounds';

/** Default band for a caller that doesn't clamp — degenerates
 *  `candidateTileIndices` back to the whole grid at every level. */
const WHOLE_GLOBE_BANDS: readonly SurfaceTileBand[] = [
  surfaceTileBandFromBounds({ west: -180, east: 180, south: -90, north: 90 }, 0, Infinity),
];

/**
 * Every `(x, y)` a bake at level `z` must visit for `bands` — R11's
 * sibling-closed set, so no baked tile is ever missing a sibling and the
 * runtime walk's "refine when every child's height is resident" rule can be
 * literal. `surfaceTileInBand` is the authority; the rect below is only a
 * superset to scan (hence the ±1 slack), deduped through a `Set` so
 * overlapping boxes can't queue a tile twice and sorted so `written` stays
 * deterministic.
 */
function candidateTileIndices(
  bands: readonly SurfaceTileBand[],
  z: number,
  tilePx: number,
): ReadonlyArray<{ readonly x: number; readonly y: number }> {
  const cols = surfaceTileColumns(z, tilePx);
  const rows = cols / 2;
  const seen = new Set<string>();
  const indices: Array<{ x: number; y: number }> = [];
  for (const band of bands) {
    if (z < band.min || z > band.max) continue;
    const xMin = Math.max(0, Math.floor(band.uBounds[0] * cols) - 1);
    const xMax = Math.min(cols - 1, Math.floor(band.uBounds[1] * cols) + 1);
    // Band `v` counts north from −90; tile rows count south from +90.
    const yMin = Math.max(0, Math.floor((1 - band.vBounds[1]) * rows) - 1);
    const yMax = Math.min(rows - 1, Math.floor((1 - band.vBounds[0]) * rows) + 1);
    for (let y = yMin; y <= yMax; y++) {
      for (let x = xMin; x <= xMax; x++) {
        const key = `${x},${y}`;
        if (seen.has(key) || !surfaceTileInBand(bands, tilePx, z, x, y)) continue;
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

/** The imagery product's own name — the height path is built from the literal
 *  `'height'` inside `bakeHeightLevel`, which owns that product end to end. */
const PRODUCT: SurfaceTileProduct = 'albedo';

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
  source: SurfaceImagerySource,
  bands: readonly SurfaceTileBand[],
  z: number,
  tilePx: number,
  outDir: string,
  tilePrefix: string,
): Promise<readonly string[]> {
  const written: string[] = [];

  for (const { x, y } of candidateTileIndices(bands, z, tilePx)) {
    const relPath = surfaceTilePath({ product: PRODUCT, z, x, y }, tilePrefix);
    const outPath = join(outDir, relPath);
    if (existsSync(outPath)) {
      written.push(relPath);
      continue;
    }
    const rgba = await source.readBox(surfaceTileBounds(z, x, y, tilePx), tilePx, tilePx);
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
 * A parent with SOME children, and no `underfill` source, is written with the
 * missing quadrants transparent, so the base texture shows through (the
 * global band's own coarser levels, and the future coastal-sparse case). With
 * `underfill`, the missing quadrants are filled from it instead — see
 * `underfillImagerySource` for why a baked tile must always end up fully
 * opaque. A parent with NO children (R11's halo tiles, baked only to close a
 * sibling group with nothing of their own beneath them) is read straight from
 * `deepSource` at this level instead — the same fallback shape as the height
 * path's `fill.readGrid` — and left unwritten only if that too declines.
 */
export async function bakeCoarserLevel(
  z: number,
  tilePx: number,
  outDir: string,
  tilePrefix: string,
  underfill?: SurfaceImagerySource,
  bands: readonly SurfaceTileBand[] = WHOLE_GLOBE_BANDS,
  deepSource?: SurfaceImagerySource,
): Promise<string[]> {
  const halfPx = tilePx / 2;
  const written: string[] = [];

  for (const { x, y } of candidateTileIndices(bands, z, tilePx)) {
    const relPath = surfaceTilePath({ product: PRODUCT, z, x, y }, tilePrefix);
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
          surfaceTilePath({ product: PRODUCT, z: z + 1, x: 2 * x + i, y: 2 * y + j }, tilePrefix),
        ),
        left: i * halfPx,
        top: j * halfPx,
      }))
      .filter((child) => existsSync(child.input));
    if (childPaths.length === 0) {
      const rgba = await deepSource?.readBox(surfaceTileBounds(z, x, y, tilePx), tilePx, tilePx);
      if (rgba != null) {
        await writeTile(rgba, tilePx, outPath);
        written.push(relPath);
      }
      continue;
    }

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
        ? await underfill.readBox(surfaceTileBounds(z, x, y, tilePx), tilePx, tilePx)
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
function readPriorIndex(outDir: string, tileRoot: string): ReadonlySet<string> {
  const indexPath = join(outDir, `${tileRoot}/index.txt`);
  if (!existsSync(indexPath)) return new Set();
  return new Set(
    readFileSync(indexPath, 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
  );
}

/** `manifest.json`'s prior contents, or `null` on a first bake — the merge
 *  base `mergeSurfaceTileManifest` folds this run's bands onto. A malformed
 *  file throws rather than reading as absent: a partially-written or hand-
 *  edited manifest silently treated as "no prior" would drop every band a
 *  `--product`-scoped run doesn't touch. */
function readPriorManifest(outDir: string, tileRoot: string): SurfaceTileManifest | null {
  const manifestPath = join(outDir, `${tileRoot}/manifest.json`);
  if (!existsSync(manifestPath)) return null;
  return JSON.parse(readFileSync(manifestPath, 'utf8')) as SurfaceTileManifest;
}

/**
 * Named water bodies R3 is judged by: the ocean must come out flat at 0, the
 * Dead Sea near −430, the Caspian near −28, and neither the Great Lakes nor
 * the Black Sea a pit. Printed, not asserted — the numbers are the user's
 * ruling on the rule, not a test's.
 */
const WATER_DIAGNOSTIC_BOXES: ReadonlyArray<readonly [string, LonLatBounds]> = [
  ['Dead Sea', { west: 35.3, east: 35.6, south: 31.1, north: 31.8 }],
  ['Caspian', { west: 47, east: 54, south: 36, north: 47 }],
  ['Lake Superior', { west: -92, east: -84, south: 46.4, north: 49 }],
  ['Black Sea', { west: 28, east: 41, south: 41, north: 47 }],
];

/**
 * The global range comes straight from each tile's own header (`subtreeMinM`
 * at the deepest baked level IS that tile's own post range) rather than a
 * 545M-post rescan; each named box only decodes the handful of tiles its own
 * `surfaceTileIndicesForBounds` rect touches.
 */
async function printWaterDiagnostics(
  outDir: string,
  z: number,
  bands: readonly SurfaceTileBand[],
  tilePrefix: string,
): Promise<void> {
  const posts = HEIGHT_POSTS_PER_TILE;
  const step = heightLatticeStepDeg(z);
  const ranges = new Map<string, [number, number]>();

  let globalMin = Infinity;
  let globalMax = -Infinity;
  for (const { x, y } of candidateTileIndices(bands, z, SURFACE_TILE_PX)) {
    const path = join(outDir, surfaceTilePath({ product: 'height', z, x, y }, tilePrefix));
    const tile = await readHeightTileFile(path);
    if (tile === null) continue;
    globalMin = Math.min(globalMin, tile.subtreeMinM);
    globalMax = Math.max(globalMax, tile.subtreeMaxM);
  }
  ranges.set('global', [globalMin, globalMax]);

  for (const [name, box] of WATER_DIAGNOSTIC_BOXES) {
    const rect = surfaceTileIndicesForBounds(box, z, SURFACE_TILE_PX);
    let min = Infinity;
    let max = -Infinity;
    for (let y = rect.yMin; y <= rect.yMax; y++) {
      for (let x = rect.xMin; x <= rect.xMax; x++) {
        const path = join(outDir, surfaceTilePath({ product: 'height', z, x, y }, tilePrefix));
        const tile = await readHeightTileFile(path);
        if (tile === null) continue;
        for (let j = 0; j < posts; j++) {
          const lat = 90 - (y * (posts - 1) + j) * step;
          if (lat < box.south || lat > box.north) continue;
          for (let i = 0; i < posts; i++) {
            const lon = -180 + (x * (posts - 1) + i) * step;
            if (lon < box.west || lon > box.east) continue;
            const value = tile.heightM[j * posts + i]!;
            min = Math.min(min, value);
            max = Math.max(max, value);
          }
        }
      }
    }
    ranges.set(name, [min, max]);
  }

  process.stderr.write(`  water diagnostics at z${z} (metres):\n`);
  for (const [name, [min, max]] of ranges) {
    process.stderr.write(`    ${name}: ${min.toFixed(1)} .. ${max.toFixed(1)}\n`);
  }
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
 * The manifest itself MERGES onto the prior one (`mergeSurfaceTileManifest`)
 * rather than replacing it outright, so a scoped `--product`/`bands` run
 * can't erase a band or a product's provenance it didn't touch this time.
 */
export async function bakeAll(
  body: Pick<SurfaceBodyBake, 'tileRoot' | 'tilePrefix'>,
  bands: readonly SurfaceBakeBand[],
  outDir: string,
  products: ReadonlySet<SurfaceTileProduct> = new Set<SurfaceTileProduct>(['albedo', 'height']),
): Promise<void> {
  const { tileRoot, tilePrefix } = body;
  const tilePx = SURFACE_TILE_PX;
  const written: string[] = [];
  const bandEntries: SurfaceTileManifestBand[] = [];

  // Deepest band first (R2): a height tile takes its posts from whatever
  // children already exist, so z7 global nests with the z8 skadi tiles under
  // it — which only works if those are already on disk.
  const ordered = [...bands].sort((a, b) => b.source.maxLevel - a.source.maxLevel);

  for (const { source, minLevel, underfill, height, heightUnderfill, flattenWater } of ordered) {
    const maxLevel = source.maxLevel;
    // The band as the runtime sees it — one entry per coverage box, so the
    // bake's tile set and the walk's request gate are the same predicate.
    const uvBands = source.coverage.map((box) =>
      surfaceTileBandFromBounds(box, minLevel, maxLevel),
    );

    // A source that can't beat its own band floor has nothing to contribute
    // — for the global band that floor is the coarsest tier's whole-globe
    // base; for a regional band it's the deeper level a caller chose.
    if (maxLevel < minLevel) {
      throw new Error(
        `bakeAll: source '${source.id}' reaches only z${maxLevel}, at or below its band floor z${minLevel} — nothing to bake`,
      );
    }

    if (products.has('albedo')) {
      process.stderr.write(`  z${maxLevel}: baking from ${source.id}\n`);
      const effective = underfill ? underfillImagerySource(source, underfill) : source;
      const deepest = await bakeDeepestLevel(
        effective,
        uvBands,
        maxLevel,
        tilePx,
        outDir,
        tilePrefix,
      );
      written.push(...deepest);
      process.stderr.write(`  z${maxLevel}: ${deepest.length} tiles\n`);

      for (let z = maxLevel - 1; z >= minLevel; z--) {
        // A parent's coverage box is the same as its children's (containment
        // of bounds), so the band's own boxes clamp every coarser level too.
        // `effective` (source blended with underfill) is also the childless
        // halo tile's own source — same object `bakeDeepestLevel` just used.
        const levelPaths = await bakeCoarserLevel(
          z,
          tilePx,
          outDir,
          tilePrefix,
          underfill,
          uvBands,
          effective,
        );
        written.push(...levelPaths);
        process.stderr.write(`  z${z}: ${levelPaths.length} tiles (2x2 average of z${z + 1})\n`);
      }
    }

    if (height !== undefined && products.has('height')) {
      // Heights ride the ALBEDO band's levels, not the height source's own
      // reach: §4.1 pairs the two products box for box and level for level,
      // and every height source clears the albedo ceiling over it natively.
      if (height.maxLevel < maxLevel) {
        throw new Error(
          `bakeAll: height source '${height.id}' reaches only z${height.maxLevel}, below the band's z${maxLevel}`,
        );
      }
      for (let z = maxLevel; z >= minLevel; z--) {
        const levelPaths = await bakeHeightLevel({
          z,
          tiles: candidateTileIndices(uvBands, z, tilePx),
          source: height,
          underfill: heightUnderfill ?? null,
          outDir,
          prefix: tilePrefix,
          flattenWater: flattenWater ?? false,
        });
        written.push(...levelPaths);
        process.stderr.write(`  z${z}: ${levelPaths.length} height tiles from ${height.id}\n`);
      }
      if (flattenWater === true) await printWaterDiagnostics(outDir, maxLevel, uvBands, tilePrefix);
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
        builtFrom: {
          // Gated on `products.has('albedo')`: a `--product height` run
          // still carries an imagery source (for coverage/levels) but bakes
          // none of its tiles, and must not restamp its provenance.
          ...(products.has('albedo') ? { [PRODUCT]: source.provenance } : {}),
          // Also gated on `products.has('height')`: a `--product albedo` run
          // still configures a height source but bakes none of its tiles.
          ...(height === undefined || !products.has('height') ? {} : { height: height.provenance }),
        },
      });
    }
  }

  const priorPaths = readPriorIndex(outDir, tileRoot);
  const finalPaths = new Set([...priorPaths, ...written]);

  const missing = [...priorPaths].filter((relPath) => !existsSync(join(outDir, relPath)));
  if (missing.length > 0) {
    throw new Error(
      `bakeAll: refusing to write index.txt/manifest.json — ${missing.length} tile(s) the prior ` +
        `index promised are missing on disk, e.g. '${missing[0]}'; the previous manifest is untouched`,
    );
  }

  const manifest = mergeSurfaceTileManifest(readPriorManifest(outDir, tileRoot), {
    prefix: tilePrefix,
    tilePx,
    bands: bandEntries,
  });

  // Sorted so two bakes of the same pyramid produce the same index, letting a
  // resumed sync diff one against the other.
  const sorted = [...finalPaths].sort();
  writeFileSync(join(outDir, `${tileRoot}/index.txt`), `${sorted.join('\n')}\n`);

  // Written LAST, after the index it implies and after the completeness
  // check above: an interrupted or now-incomplete bake then leaves the
  // PREVIOUS manifest in place, so the runtime keeps serving what it last
  // knew to be whole rather than a manifest naming tiles that 404.
  writeFileSync(
    join(outDir, `${tileRoot}/manifest.json`),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );

  process.stderr.write(`  ${sorted.length} tiles indexed\n`);
}

/** Every body this tool can bake, keyed the same way `SURFACE_TILE_REGISTRY`
 *  is — Mars's own row lands here, not a second switch elsewhere. */
const SURFACE_BODY_BAKES: Record<SurfaceTileBodyId, SurfaceBodyBake> = {
  earth: earthSurfaceBake,
};

/** `--product albedo|height`: `parseFlags` stays bool-only by design (see its
 *  own docstring), so this is a bespoke scan beside the `parseFlags` call —
 *  same shape as `fetchFamousImages`'s `--source-preference`. Absent, both
 *  products bake. */
function productFlag(argv: readonly string[]): SurfaceTileProduct | undefined {
  const idx = argv.indexOf('--product');
  if (idx < 0) return undefined;
  const value = argv[idx + 1];
  if (value !== 'albedo' && value !== 'height') {
    throw new Error(`buildSurfaceTiles: --product must be 'albedo' or 'height', got '${value}'`);
  }
  return value;
}

/** `--body <id>` (default `earth`): same bespoke-scan shape as `productFlag`. */
function bodyFlag(argv: readonly string[]): SurfaceTileBodyId {
  const idx = argv.indexOf('--body');
  const value = idx < 0 ? 'earth' : argv[idx + 1];
  if (value === undefined || !(value in SURFACE_BODY_BAKES)) {
    throw new Error(
      `buildSurfaceTiles: --body must be one of ${Object.keys(SURFACE_BODY_BAKES).join(', ')}, got '${value}'`,
    );
  }
  return value as SurfaceTileBodyId;
}

async function main(): Promise<void> {
  const outDir = resolve('public/data/images');
  const argv = process.argv.slice(2);
  const { '--dev': dev } = parseFlags(argv, { '--dev': 'bool' });
  const product = productFlag(argv);
  const products = new Set<SurfaceTileProduct>(product ? [product] : ['albedo', 'height']);
  const body = SURFACE_BODY_BAKES[bodyFlag(argv)];

  process.stderr.write(`buildSurfaceTiles: -> ${join(outDir, body.tileRoot)}\n`);
  const bands = await body.bands({ dev });
  await bakeAll(body, bands, outDir, products);
  process.stderr.write(`done; tiles under ${join(outDir, body.tileRoot)}\n`);
}

const invokedDirectly = process.argv[1] === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    process.stderr.write(`error: ${(err as Error).stack ?? (err as Error).message}\n`);
    process.exit(1);
  });
}
