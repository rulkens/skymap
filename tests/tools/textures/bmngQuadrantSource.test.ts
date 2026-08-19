/**
 * bmngQuadrantSource — the arithmetic that decides WHICH of eight files a box
 * comes out of, which way up the rows come back, and how many times a file is
 * decoded to serve a tile row.
 *
 * All three are invisible when wrong. A box read from the neighbouring quadrant
 * still produces a perfectly clean tile of perfectly real Earth in the wrong
 * place; a south-first raster produces a globe that is per-tile upside down and
 * reads as a shader bug; a mis-keyed band cache produces byte-identical output
 * twenty times slower. Nothing downstream can tell any of them from success.
 *
 * ## Synthetic quadrants, not the real ones
 *
 * The real set is 421 MB of gitignored raws that a worktree or CI checkout does
 * not have, so every test here builds its own eight-file grid: 1024 px square
 * quadrants, each a flat colour whose RED channel identifies the file it came
 * from, split into a bright northern half and a dark southern half so row order
 * is readable off the pixels. Identifying the file by colour is what turns "did
 * it pick the right quadrant" into an assertion about pixels rather than about
 * internals.
 */

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import sharp from 'sharp';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { bmngQuadrantSource, type BmngQuadrant } from '../../../tools/textures/bmngQuadrantSource';
import type { LonLatBounds } from '../../../src/@types/scene/LonLatBounds';

const QUADRANT_EDGE_PX = 1024;

/** Column-major so the index → red mapping is stated once. */
const NAMES: readonly BmngQuadrant[] = ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'D1', 'D2'];

/** Red channel of quadrant `name` — its identity in every assertion below. */
function redOf(name: BmngQuadrant): number {
  return 20 + 30 * NAMES.indexOf(name);
}

/** Which quadrant a raster came from, read back off its red channel. */
function quadrantOf(rgba: Uint8Array): BmngQuadrant | undefined {
  return NAMES.find((name) => redOf(name) === rgba[0]);
}

let dir: string;
let paths: Record<BmngQuadrant, string>;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), 'bmng-quadrants-'));
  paths = Object.fromEntries(NAMES.map((name) => [name, join(dir, `${name}.png`)])) as Record<
    BmngQuadrant,
    string
  >;
  await Promise.all(
    NAMES.map(async (name) => {
      const raw = new Uint8Array(QUADRANT_EDGE_PX * QUADRANT_EDGE_PX * 3);
      for (let y = 0; y < QUADRANT_EDGE_PX; y++) {
        // Northern half of the FILE (row 0 is its north edge) is bright.
        const green = y < QUADRANT_EDGE_PX / 2 ? 200 : 20;
        for (let x = 0; x < QUADRANT_EDGE_PX; x++) {
          const i = (y * QUADRANT_EDGE_PX + x) * 3;
          raw[i] = redOf(name);
          raw[i + 1] = green;
          raw[i + 2] = green;
        }
      }
      await sharp(raw, {
        raw: { width: QUADRANT_EDGE_PX, height: QUADRANT_EDGE_PX, channels: 3 },
      })
        .png()
        .toFile(paths[name]);
    }),
  );
});

afterAll(() => rmSync(dir, { recursive: true, force: true }));

/** A source over the synthetic grid, counting band decodes. */
async function makeSource(decodes?: BmngQuadrant[]) {
  return bmngQuadrantSource({
    id: 'synthetic',
    attribution: 'synthetic',
    quadrantPaths: paths,
    onBandDecode: (quadrant) => decodes?.push(quadrant),
  });
}

describe('quadrant selection', () => {
  it('reads each quadrant from its own file', async () => {
    const source = await makeSource();
    // One box per quadrant, well inside it: 1 degree wide, at a latitude that
    // belongs to that hemisphere. A single output pixel averages a uniform
    // region, so the red channel comes back exactly.
    const lonOf: Record<'A' | 'B' | 'C' | 'D', number> = { A: -179, B: -89, C: 1, D: 91 };
    for (const name of NAMES) {
      const column = name[0] as 'A' | 'B' | 'C' | 'D';
      const west = lonOf[column];
      const north = name[1] === '1' ? 80 : -10;
      const rgba = await source.readBox({ west, east: west + 1, north, south: north - 1 }, 1, 1);
      expect(quadrantOf(rgba!), name).toBe(name);
    }
  });

  it('puts a box on the correct side of every seam', async () => {
    const source = await makeSource();
    // The failure this catches is an off-by-one-quadrant read, which produces a
    // wrong-but-plausible globe. Boxes just west and just east of each 90-degree
    // seam, boxes just north and just south of the equator, and — the case a
    // `floor`/`ceil` slip actually breaks — boxes whose edge sits exactly ON a
    // seam: a box ENDING at -90 belongs to A, one STARTING at -90 belongs to B.
    const cases: readonly (readonly [LonLatBounds, BmngQuadrant])[] = [
      [{ west: -90.5, east: -90.1, north: 60, south: 59 }, 'A1'],
      [{ west: -89.9, east: -89.5, north: 60, south: 59 }, 'B1'],
      [{ west: -135, east: -90, north: 90, south: 45 }, 'A1'],
      [{ west: -90, east: -45, north: 90, south: 45 }, 'B1'],
      [{ west: -0.5, east: -0.1, north: 60, south: 59 }, 'B1'],
      [{ west: 0.1, east: 0.5, north: 60, south: 59 }, 'C1'],
      [{ west: 89.5, east: 89.9, north: 60, south: 59 }, 'C1'],
      [{ west: 90.1, east: 90.5, north: 60, south: 59 }, 'D1'],
      [{ west: -45, east: -44, north: 0.5, south: 0.1 }, 'B1'],
      [{ west: -45, east: -44, north: -0.1, south: -0.5 }, 'B2'],
      [{ west: -45, east: -44, north: 45, south: 0 }, 'B1'],
      [{ west: -45, east: -44, north: 0, south: -45 }, 'B2'],
    ];
    for (const [box, expected] of cases) {
      const rgba = await source.readBox(box, 1, 1);
      expect(quadrantOf(rgba!), `${box.west}..${box.east}, ${box.south}..${box.north}`).toBe(
        expected,
      );
    }
  });

  it('refuses a box that spans two quadrants rather than reading one of them', async () => {
    const source = await makeSource();
    // Straddling cannot happen from z2 up, where the tile grid's steps divide 90
    // — so it means the caller's grid arithmetic broke, and reading whichever
    // file the west edge landed in would hide that behind real-looking imagery.
    await expect(
      source.readBox({ west: -100, east: -80, north: 60, south: 59 }, 4, 4),
    ).rejects.toThrow(/west -100/);
    await expect(
      source.readBox({ west: -45, east: -44, north: 10, south: -10 }, 4, 4),
    ).rejects.toThrow(/north 10/);
    await expect(
      source.readBox({ west: -190, east: -185, north: 60, south: 59 }, 4, 4),
    ).rejects.toThrow(/west -190/);
  });
});

describe('raster contract', () => {
  it('returns row 0 as the box NORTH edge', async () => {
    const source = await makeSource();
    // The fixture's bright half IS its northern half, so a full-quadrant box
    // sampled 2 x 2 must come back bright on top. A source that returned
    // south-first rows would pass every quadrant-selection test above and still
    // produce a per-tile upside-down globe.
    const rgba = (await source.readBox({ west: -180, east: -90, north: 90, south: 0 }, 2, 2))!;
    const green = (row: number) => rgba[row * 2 * 4 + 1]!;
    expect(green(0)).toBeGreaterThan(150);
    expect(green(1)).toBeLessThan(60);
  });

  it('returns four channels with alpha 255', async () => {
    const source = await makeSource();
    // BMNG covers the whole globe, so there is nothing to mask — but the
    // runtime's blend is written against the CHANNEL's presence, and the tile
    // writer reads the buffer as `width * height * 4`. A three-channel return
    // would be silently misread as a shifted image.
    const rgba = (await source.readBox({ west: -179, east: -178, north: 80, south: 79 }, 8, 4))!;
    expect(rgba.length).toBe(8 * 4 * 4);
    for (let i = 3; i < rgba.length; i += 4) expect(rgba[i]).toBe(255);
  });

  it('derives maxLevel from the composited grid, not from one quadrant', async () => {
    const source = await makeSource();
    // Four 1024 px quadrants composite to 4096 px, which is z3. A source that
    // measured a single file would answer z1 and bake two levels shallower than
    // its own pixels justify, with nothing to show for it but soft ground.
    expect(source.maxLevel).toBe(3);
  });
});

describe('band cache', () => {
  /** Tile `x` of a 32-column level (11.25 degrees), in tile row `y`. */
  function tile(x: number, y: number): LonLatBounds {
    return {
      west: -180 + x * 11.25,
      east: -180 + (x + 1) * 11.25,
      north: 90 - y * 11.25,
      south: 90 - (y + 1) * 11.25,
    };
  }

  it('decodes one band per tile row of a quadrant, not one per tile', async () => {
    const decodes: BmngQuadrant[] = [];
    const source = await makeSource(decodes);
    // The eight tiles of row 0 that fall in A1 share a source rect that differs
    // only in `left`, which is exactly what the key must ignore. Keyed too
    // finely this is eight decodes and the deepest level takes twenty times
    // longer for identical output.
    for (let x = 0; x < 8; x++) await source.readBox(tile(x, 0), 4, 4);
    expect(decodes).toEqual(['A1']);

    // The next tile row is a different source rect, and the next quadrant
    // column a different file: both must miss.
    await source.readBox(tile(0, 1), 4, 4);
    await source.readBox(tile(8, 0), 4, 4);
    expect(decodes).toEqual(['A1', 'A1', 'B1']);
  });

  it('evicts the least recently used band, not the oldest', async () => {
    const decodes: BmngQuadrant[] = [];
    const source = await makeSource(decodes);
    // Four bands is one sweep of a tile row across all four quadrant columns.
    for (const x of [0, 8, 16, 24]) await source.readBox(tile(x, 0), 4, 4);
    expect(decodes).toHaveLength(4);

    // Re-reading A1's row-0 band is a hit AND makes it most-recently-used.
    await source.readBox(tile(1, 0), 4, 4);
    expect(decodes).toHaveLength(4);

    // A fifth band evicts B1's row 0 (now the least recently used) rather than
    // A1's row 0 (the oldest insert) — so B1 misses next and A1 still hits.
    await source.readBox(tile(0, 1), 4, 4);
    await source.readBox(tile(8, 0), 4, 4);
    expect(decodes).toHaveLength(6);
    await source.readBox(tile(2, 0), 4, 4);
    expect(decodes).toHaveLength(6);
  });
});

describe('grid validation', () => {
  it('names the missing file rather than failing inside a decode', async () => {
    await expect(
      bmngQuadrantSource({
        id: 'synthetic',
        attribution: 'synthetic',
        quadrantPaths: { ...paths, C2: join(dir, 'absent.png') },
      }),
    ).rejects.toThrow(/C2/);
  });

  it('rejects a grid whose files are not one size', async () => {
    // Eight files that are not the same square are not this tiling, and every
    // box in the odd one out would sample the wrong ground at the right-looking
    // coordinates.
    const oddPath = join(dir, 'odd.png');
    await sharp({
      create: { width: 512, height: 512, channels: 3, background: { r: 1, g: 2, b: 3 } },
    })
      .png()
      .toFile(oddPath);
    await expect(
      bmngQuadrantSource({
        id: 'synthetic',
        attribution: 'synthetic',
        quadrantPaths: { ...paths, D1: oddPath },
      }),
    ).rejects.toThrow(/D1/);
  });
});
