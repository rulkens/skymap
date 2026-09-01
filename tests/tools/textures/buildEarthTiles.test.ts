import { describe, it, expect, afterAll } from 'vitest';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';

import sharp from 'sharp';

import { bakeAll, bakeCoarserLevel, TILE_PREFIX } from '../../../tools/textures/buildEarthTiles';
import { earthTilePath } from '../../../src/utils/scene/earthTilePath';
import type { EarthImagerySource } from '../../../tools/textures/EarthImagerySource';
import type { EarthTileManifest } from '../../../src/@types/scene/EarthTileManifest';
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';

const TILE_PX = 512;

const dirs: string[] = [];

/** A fresh temp dir, tracked for cleanup once the whole file is done. */
function tmpDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'build-earth-tiles-'));
  dirs.push(dir);
  return dir;
}

/** Write a solid-colour 512x512 child tile at `(z, x, y)`, the shape a real bake
 *  leaves on disk for `bakeCoarserLevel` to read back. */
async function writeChild(
  outDir: string,
  z: number,
  x: number,
  y: number,
  rgba: readonly [number, number, number, number],
): Promise<void> {
  const path = join(outDir, earthTilePath({ kind: 'surface', z, x, y }, TILE_PREFIX));
  mkdirSync(dirname(path), { recursive: true });
  await sharp({
    create: {
      width: TILE_PX,
      height: TILE_PX,
      channels: 4,
      background: { r: rgba[0], g: rgba[1], b: rgba[2], alpha: rgba[3] },
    },
  })
    .webp({ quality: 100 })
    .toFile(path);
}

/** Read one channel-4 pixel out of a raw RGBA buffer. */
function pixelAt(
  data: Buffer,
  width: number,
  x: number,
  y: number,
): readonly [number, number, number, number] {
  const i = (y * width + x) * 4;
  return [data[i]!, data[i + 1]!, data[i + 2]!, data[i + 3]!];
}

/** Tolerance for a WebP round-trip of a solid colour: generous enough to absorb
 *  lossy encoding, tight enough that a wrong quadrant (a whole different colour)
 *  still fails loudly. */
const CHANNEL_TOLERANCE = 8;

function expectPixelNear(
  actual: readonly [number, number, number, number],
  expected: readonly [number, number, number, number],
): void {
  for (let c = 0; c < 4; c++) {
    expect(Math.abs(actual[c]! - expected[c]!)).toBeLessThanOrEqual(CHANNEL_TOLERANCE);
  }
}

describe('bakeCoarserLevel', () => {
  // Children live at z=2 (4 columns x 2 rows), parent at z=1 (2 columns x 1 row) —
  // z=0 would make the parent level 1 column by 0.5 rows, not a real grid. The
  // level-1 loop therefore also visits parent (x=1, y=0); its children are absent,
  // so that iteration exercises the "a parent with no children is not written"
  // path for free. This test only asserts on parent (x=0, y=0), whose four
  // children are (0,0), (1,0), (0,1), (1,1) at z=2.
  const RED = [255, 0, 0, 255] as const; // NW: (i=0, j=0)
  const GREEN = [0, 255, 0, 255] as const; // NE: (i=1, j=0)
  const BLUE = [0, 0, 255, 255] as const; // SW: (i=0, j=1)
  const WHITE = [255, 255, 255, 255] as const; // SE: (i=1, j=1)

  // The bug this pins: sharp composites over the ALREADY-PROCESSED image, so a
  // `.resize()` chained after `.composite()` in the same pipeline runs first, not
  // last. The 1024x1024 canvas shrinks to 512 before the four 512x512 children are
  // laid down, so only the NW child (at offset 0,0) still overlaps the canvas —
  // the other three land at offset 512 on a now-512-wide canvas and are silently
  // clipped. Every quadrant of the output then reads NW's colour instead of its
  // own child's.
  it('gives each quadrant its own child colour when all four children are present', async () => {
    const dir = tmpDir();
    await writeChild(dir, 2, 0, 0, RED);
    await writeChild(dir, 2, 1, 0, GREEN);
    await writeChild(dir, 2, 0, 1, BLUE);
    await writeChild(dir, 2, 1, 1, WHITE);

    await bakeCoarserLevel(1, TILE_PX, dir);

    const parentPath = join(dir, earthTilePath({ kind: 'surface', z: 1, x: 0, y: 0 }, TILE_PREFIX));
    const { data } = await sharp(parentPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const nw = pixelAt(data, TILE_PX, 128, 128);
    const ne = pixelAt(data, TILE_PX, 384, 128);
    const sw = pixelAt(data, TILE_PX, 128, 384);
    const se = pixelAt(data, TILE_PX, 384, 384);

    expectPixelNear(nw, RED);
    expectPixelNear(ne, GREEN);
    expectPixelNear(sw, BLUE);
    expectPixelNear(se, WHITE);
  });

  // The coastal case the production docstring calls out: a parent with only SOME
  // children present must still carry the children it has. Under the bug this is
  // the worst case — every surviving child is off-origin, so all of them get
  // clipped and the tile written to disk is fully transparent everywhere.
  it('keeps the surviving child when only one of four is present, and leaves the rest transparent', async () => {
    const dir = tmpDir();
    await writeChild(dir, 2, 1, 1, WHITE); // SE only

    await bakeCoarserLevel(1, TILE_PX, dir);

    const parentPath = join(dir, earthTilePath({ kind: 'surface', z: 1, x: 0, y: 0 }, TILE_PREFIX));
    const { data } = await sharp(parentPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const nw = pixelAt(data, TILE_PX, 128, 128);
    const se = pixelAt(data, TILE_PX, 384, 384);

    expect(nw[3]).toBeLessThanOrEqual(CHANNEL_TOLERANCE); // NW quadrant: transparent, no child there
    expectPixelNear(se, WHITE);
  });

  // The Fix-1 "always opaque" invariant: a partial parent must not leave a
  // transparent hole once an underfill source is given.
  const ORANGE = [255, 128, 0, 255] as const;

  /** A stub `EarthImagerySource` whose `readBox` always returns a solid colour. */
  function stubFillerSource(rgba: readonly [number, number, number, number]): EarthImagerySource & {
    readBoxCalls: number;
  } {
    const stub = {
      id: 'stub-filler',
      attribution: 'stub-filler attribution',
      provenance: {
        sourceId: 'stub-filler',
        attribution: 'stub-filler attribution',
        vintage: 'stub',
      },
      maxLevel: 20,
      coverage: [{ west: -180, east: 180, south: -90, north: 90 }],
      readBoxCalls: 0,
      async readBox(_box: LonLatBounds, widthPx: number, heightPx: number) {
        stub.readBoxCalls++;
        const raster = new Uint8Array(widthPx * heightPx * 4);
        for (let i = 0; i < raster.length; i += 4) raster.set(rgba, i);
        return raster;
      },
    };
    return stub;
  }

  it('fills a missing quadrant from the underfill source instead of leaving it transparent', async () => {
    const dir = tmpDir();
    await writeChild(dir, 2, 1, 1, WHITE); // SE only — NW/NE/SW absent
    const filler = stubFillerSource(ORANGE);

    await bakeCoarserLevel(1, TILE_PX, dir, filler);

    const parentPath = join(dir, earthTilePath({ kind: 'surface', z: 1, x: 0, y: 0 }, TILE_PREFIX));
    const { data } = await sharp(parentPath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const nw = pixelAt(data, TILE_PX, 128, 128);
    const se = pixelAt(data, TILE_PX, 384, 384);

    expectPixelNear(nw, ORANGE); // filled by the underfill source, fully opaque
    expectPixelNear(se, WHITE); // the present child, untouched
    expect(filler.readBoxCalls).toBe(1);
  });

  it('does not call the underfill source when all four children are present', async () => {
    const dir = tmpDir();
    await writeChild(dir, 2, 0, 0, RED);
    await writeChild(dir, 2, 1, 0, GREEN);
    await writeChild(dir, 2, 0, 1, BLUE);
    await writeChild(dir, 2, 1, 1, WHITE);
    const filler = stubFillerSource(ORANGE);

    await bakeCoarserLevel(1, TILE_PX, dir, filler);

    expect(filler.readBoxCalls).toBe(0);
  });
});

describe('bakeAll', () => {
  // z=1 at TILE_PX=512 is the shallowest real grid (2 columns x 1 row) — the
  // smallest fixture that still exercises two disjoint one-tile-wide bands.
  const STUB_Z = 1;
  const BOX_WEST: LonLatBounds = { west: -180, east: 0, south: -90, north: 90 };
  const BOX_EAST: LonLatBounds = { west: 0, east: 180, south: -90, north: 90 };

  /** A minimal `EarthImagerySource` that answers only its own tile box —
   *  the other stub's box is outside its coverage, same as a real source. */
  function stubSource(
    id: string,
    coverage: LonLatBounds,
    rgba: readonly [number, number, number, number],
  ): EarthImagerySource {
    return {
      id,
      attribution: `${id} attribution`,
      provenance: { sourceId: id, attribution: `${id} attribution`, vintage: 'stub-vintage' },
      maxLevel: STUB_Z,
      coverage: [coverage],
      async readBox(box, widthPx, heightPx) {
        if (box.west !== coverage.west) return null;
        const raster = new Uint8Array(widthPx * heightPx * 4);
        for (let i = 0; i < raster.length; i += 4) raster.set(rgba, i);
        return raster;
      },
    };
  }

  // The Fix-1 "always opaque" invariant, exercised through `bakeAll` itself
  // rather than `underfillImagerySource`/`bakeCoarserLevel` in isolation —
  // pins the `effective = underfillImagerySource(source, underfill)` wiring
  // at the DEEPEST level (buildEarthTiles.ts's `bakeDeepestLevel` call),
  // which the two halves' own tests don't reach.
  const ORANGE = [255, 128, 0, 255] as const;

  it('fills a partial deepest-level primary read from the underfill source, fully opaque', async () => {
    const dir = tmpDir();
    // Primary answers only its own half of every tile's box (see the raster
    // below); the rest of each tile stays transparent unless underfilled.
    const primary: EarthImagerySource = {
      id: 'stub-primary',
      attribution: 'stub-primary attribution',
      provenance: {
        sourceId: 'stub-primary',
        attribution: 'stub-primary attribution',
        vintage: 'stub',
      },
      maxLevel: STUB_Z,
      coverage: [BOX_WEST],
      async readBox(box, widthPx, heightPx) {
        if (box.west !== BOX_WEST.west) return null;
        const raster = new Uint8Array(widthPx * heightPx * 4);
        // Opaque red in the left half only — the right half stays [0,0,0,0].
        for (let y = 0; y < heightPx; y++) {
          for (let x = 0; x < widthPx / 2; x++) {
            const i = (y * widthPx + x) * 4;
            raster.set([255, 0, 0, 255], i);
          }
        }
        return raster;
      },
    };
    const underfill = stubSource('stub-underfill', BOX_WEST, ORANGE);

    await bakeAll([{ source: primary, minLevel: STUB_Z, underfill }], dir);

    const tilePath = join(
      dir,
      earthTilePath({ kind: 'surface', z: STUB_Z, x: 0, y: 0 }, TILE_PREFIX),
    );
    const { data, info } = await sharp(tilePath)
      .ensureAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });

    const left = pixelAt(
      data,
      info.width,
      Math.floor(info.width * 0.25),
      Math.floor(info.height / 2),
    );
    const right = pixelAt(
      data,
      info.width,
      Math.floor(info.width * 0.75),
      Math.floor(info.height / 2),
    );

    expectPixelNear(left, [255, 0, 0, 255]); // primary, untouched
    expectPixelNear(right, ORANGE); // underfilled, fully opaque
  });

  // The perf fix this pins: bakeDeepestLevel must probe only the tile range a
  // band's coverage box implies, not the whole z-level grid.
  it('clamps the deepest-level bake to the band coverage instead of walking the whole grid', async () => {
    const dir = tmpDir();
    // At TILE_PX=512, z=3 is an 8x4 tile grid (lonStep=latStep=45); this box
    // is exactly tile (x=3, y=1)'s own span, so the clamped rect is 1x1 —
    // pre-fix, bakeDeepestLevel probes all 32 tiles of the z3 grid instead.
    const coverageBox: LonLatBounds = { west: -45, east: 0, north: 45, south: 0 };
    let readBoxCalls = 0;
    const regional: EarthImagerySource = {
      id: 'stub-regional',
      attribution: 'stub-regional attribution',
      provenance: {
        sourceId: 'stub-regional',
        attribution: 'stub-regional attribution',
        vintage: 'stub',
      },
      maxLevel: 3,
      coverage: [coverageBox],
      async readBox(_box, widthPx, heightPx) {
        readBoxCalls++;
        const raster = new Uint8Array(widthPx * heightPx * 4);
        raster.fill(255);
        return raster;
      },
    };

    await bakeAll([{ source: regional, minLevel: 3 }], dir);

    expect(readBoxCalls).toBe(1);
  });

  // Every OTHER bakeAll test uses minLevel === maxLevel, so the coarser-level
  // loop never runs and can't catch bakeAll dropping `source.coverage` off
  // its bakeCoarserLevel call. This one bakes a real coarser level and counts
  // underfill reads, the only observable side effect bakeCoarserLevel has.
  it('clamps the coarser-level bake to the band coverage too, not just the deepest level', async () => {
    const dir = tmpDir();
    // z3 (8x4) is the deepest level, z2 (4x2) the one coarser level baked.
    // This box is exactly z3 tile (x=3, y=1)'s span, whose z2 parent is
    // (x=1, y=0) (same lonStep/latStep=45/90 arithmetic as
    // earthTileIndicesForBounds's own tests).
    const coverageBox: LonLatBounds = { west: -45, east: 0, north: 45, south: 0 };
    let underfillCalls = 0;
    const underfill: EarthImagerySource = {
      id: 'stub-underfill-2',
      attribution: 'stub-underfill-2 attribution',
      provenance: {
        sourceId: 'stub-underfill-2',
        attribution: 'stub-underfill-2 attribution',
        vintage: 'stub',
      },
      maxLevel: 3,
      coverage: [{ west: -180, east: 180, north: 90, south: -90 }],
      async readBox(_box, widthPx, heightPx) {
        underfillCalls++;
        const raster = new Uint8Array(widthPx * heightPx * 4);
        raster.fill(200);
        return raster;
      },
    };
    const regional: EarthImagerySource = {
      id: 'stub-regional-2',
      attribution: 'stub-regional-2 attribution',
      provenance: {
        sourceId: 'stub-regional-2',
        attribution: 'stub-regional-2 attribution',
        vintage: 'stub',
      },
      maxLevel: 3,
      coverage: [coverageBox],
      async readBox(_box, widthPx, heightPx) {
        const raster = new Uint8Array(widthPx * heightPx * 4);
        raster.fill(255);
        return raster;
      },
    };

    // Orphan left over from an earlier, differently-shaped bake: a z3 child
    // at (0, 0), whose z2 parent (0, 0) sits OUTSIDE this band's coverage
    // (which clamps to parent (1, 0)). A coverage-clamped coarser loop never
    // visits parent (0, 0); an unclamped (full 4x2 z2 grid) loop would find
    // its one present child and call the underfill source to fill the rest.
    await writeChild(dir, 3, 0, 0, [9, 9, 9, 255]);

    await bakeAll([{ source: regional, minLevel: 2, underfill }], dir);

    // 1 underfill call from the deepest level's own clamped tile (z3, x=3,
    // y=1) + 1 from the coarser level's one clamped parent (z2, x=1, y=0).
    // Dropping `source.coverage` from bakeAll's bakeCoarserLevel call would
    // walk the full z2 grid instead, pick up the orphan's partial parent
    // too, and this becomes 3 — verified by temporarily making that drop
    // (see the report for the sabotage-run evidence).
    expect(underfillCalls).toBe(2);
  });

  it('writes two manifest entries and both sources tiles, in band order', async () => {
    const dir = tmpDir();
    const west = stubSource('stub-west', BOX_WEST, [255, 0, 0, 255]);
    const east = stubSource('stub-east', BOX_EAST, [0, 0, 255, 255]);

    await bakeAll(
      [
        { source: west, minLevel: STUB_Z },
        { source: east, minLevel: STUB_Z },
      ],
      dir,
    );

    const manifest = JSON.parse(
      readFileSync(join(dir, 'earth-tiles/manifest.json'), 'utf8'),
    ) as EarthTileManifest;
    const bands = manifest.levels.surface;
    expect(bands).toHaveLength(2);
    expect(bands?.[0]?.bounds).toEqual(BOX_WEST);
    // Each band's builtFrom is ITS OWN source's provenance, not a shared
    // module-level assumption — the bug this pins would stamp both bands
    // with whichever source's vintage happened to be hardcoded.
    expect(bands?.[0]?.builtFrom).toEqual(west.provenance);
    expect(bands?.[1]?.bounds).toEqual(BOX_EAST);
    expect(bands?.[1]?.builtFrom).toEqual(east.provenance);

    const index = readFileSync(join(dir, 'earth-tiles/index.txt'), 'utf8');
    expect(index).toContain(earthTilePath({ kind: 'surface', z: STUB_Z, x: 0, y: 0 }, TILE_PREFIX));
    expect(index).toContain(earthTilePath({ kind: 'surface', z: STUB_Z, x: 1, y: 0 }, TILE_PREFIX));
  });

  describe('--only', () => {
    /** Same shape as `stubSource`, plus a call counter — needed to prove a
     *  skipped band's `readBox` never runs. */
    function countingStub(
      id: string,
      coverage: LonLatBounds,
      rgba: readonly [number, number, number, number],
    ): EarthImagerySource & { readBoxCalls: number } {
      const stub = {
        id,
        attribution: `${id} attribution`,
        provenance: { sourceId: id, attribution: `${id} attribution`, vintage: 'stub-vintage' },
        maxLevel: STUB_Z,
        coverage: [coverage],
        readBoxCalls: 0,
        async readBox(box: LonLatBounds, widthPx: number, heightPx: number) {
          stub.readBoxCalls++;
          if (box.west !== coverage.west) return null;
          const raster = new Uint8Array(widthPx * heightPx * 4);
          for (let i = 0; i < raster.length; i += 4) raster.set(rgba, i);
          return raster;
        },
      };
      return stub;
    }

    it('writes a per-band index for every band on a full bake', async () => {
      const dir = tmpDir();
      const west = countingStub('stub-west', BOX_WEST, [255, 0, 0, 255]);
      const east = countingStub('stub-east', BOX_EAST, [0, 0, 255, 255]);

      await bakeAll(
        [
          { source: west, minLevel: STUB_Z },
          { source: east, minLevel: STUB_Z },
        ],
        dir,
      );

      const westIndex = readFileSync(join(dir, 'earth-tiles/index-stub-west.txt'), 'utf8');
      const eastIndex = readFileSync(join(dir, 'earth-tiles/index-stub-east.txt'), 'utf8');
      expect(westIndex).toContain(
        earthTilePath({ kind: 'surface', z: STUB_Z, x: 0, y: 0 }, TILE_PREFIX),
      );
      expect(eastIndex).toContain(
        earthTilePath({ kind: 'surface', z: STUB_Z, x: 1, y: 0 }, TILE_PREFIX),
      );
    });

    it('skips a band --only does not name: no readBox calls, its tile untouched, merged index and manifest still carry it', async () => {
      const dir = tmpDir();
      const west = countingStub('stub-west', BOX_WEST, [255, 0, 0, 255]);
      const east = countingStub('stub-east', BOX_EAST, [0, 0, 255, 255]);
      const bands = [
        { source: west, minLevel: STUB_Z },
        { source: east, minLevel: STUB_Z },
      ];
      await bakeAll(bands, dir);
      const eastTilePath = join(
        dir,
        earthTilePath({ kind: 'surface', z: STUB_Z, x: 1, y: 0 }, TILE_PREFIX),
      );
      const beforeMtime = statSync(eastTilePath).mtimeMs;
      east.readBoxCalls = 0;

      await bakeAll(bands, dir, { only: 'stub-west' });

      expect(east.readBoxCalls).toBe(0);
      expect(statSync(eastTilePath).mtimeMs).toBe(beforeMtime);

      const index = readFileSync(join(dir, 'earth-tiles/index.txt'), 'utf8');
      expect(index).toContain(
        earthTilePath({ kind: 'surface', z: STUB_Z, x: 0, y: 0 }, TILE_PREFIX),
      );
      expect(index).toContain(
        earthTilePath({ kind: 'surface', z: STUB_Z, x: 1, y: 0 }, TILE_PREFIX),
      );

      const manifest = JSON.parse(
        readFileSync(join(dir, 'earth-tiles/manifest.json'), 'utf8'),
      ) as EarthTileManifest;
      expect(manifest.levels.surface).toHaveLength(2);
    });

    it('throws naming the band when a stitched tile has been deleted from disk', async () => {
      const dir = tmpDir();
      const west = countingStub('stub-west', BOX_WEST, [255, 0, 0, 255]);
      const east = countingStub('stub-east', BOX_EAST, [0, 0, 255, 255]);
      const bands = [
        { source: west, minLevel: STUB_Z },
        { source: east, minLevel: STUB_Z },
      ];
      await bakeAll(bands, dir);
      const eastTilePath = join(
        dir,
        earthTilePath({ kind: 'surface', z: STUB_Z, x: 1, y: 0 }, TILE_PREFIX),
      );
      rmSync(eastTilePath);

      await expect(bakeAll(bands, dir, { only: 'stub-west' })).rejects.toThrow(/stub-east/);
    });

    it('throws naming the band when its minLevel drifted since the prior index', async () => {
      const dir = tmpDir();
      const west = countingStub('stub-west', BOX_WEST, [255, 0, 0, 255]);
      const east = countingStub('stub-east', BOX_EAST, [0, 0, 255, 255]);
      await bakeAll(
        [
          { source: west, minLevel: STUB_Z },
          { source: east, minLevel: STUB_Z },
        ],
        dir,
      );

      // Same band, now claiming a deeper floor than the run that wrote its
      // stitched index — that index still only has z1 lines, not z0.
      await expect(
        bakeAll(
          [
            { source: west, minLevel: STUB_Z },
            { source: east, minLevel: STUB_Z - 1 },
          ],
          dir,
          { only: 'stub-west' },
        ),
      ).rejects.toThrow(/stub-east/);
    });

    it('throws listing available ids when --only names an unknown band', async () => {
      const dir = tmpDir();
      const west = countingStub('stub-west', BOX_WEST, [255, 0, 0, 255]);

      await expect(
        bakeAll([{ source: west, minLevel: STUB_Z }], dir, { only: 'does-not-exist' }),
      ).rejects.toThrow(/stub-west/);
    });

    it('throws naming the band when its stitched index was written under a different TILE_PREFIX', async () => {
      const dir = tmpDir();
      const west = countingStub('stub-west', BOX_WEST, [255, 0, 0, 255]);
      const east = countingStub('stub-east', BOX_EAST, [0, 0, 255, 255]);
      const bands = [
        { source: west, minLevel: STUB_Z },
        { source: east, minLevel: STUB_Z },
      ];
      await bakeAll(bands, dir);

      // A stale per-band index left over from a run under an OLDER
      // TILE_PREFIX — tiles are immutable and the index is read verbatim off
      // disk, never rewritten, so a version bump between that run and now
      // must fail loudly rather than ship a manifest at today's prefix
      // pointing at index lines the new prefix never baked.
      const eastIndexPath = join(dir, 'earth-tiles/index-stub-east.txt');
      const stalePrefixed = readFileSync(eastIndexPath, 'utf8').replaceAll(
        TILE_PREFIX,
        'earth-tiles/v0',
      );
      writeFileSync(eastIndexPath, stalePrefixed);

      await expect(bakeAll(bands, dir, { only: 'stub-west' })).rejects.toThrow(/stub-east/);
    });
  });
});

afterAll(() => {
  for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
});
