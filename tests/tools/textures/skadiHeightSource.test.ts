import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { skadiHeightSource } from '../../../tools/textures/skadiHeightSource';

const POSTS = 3601;
const VOID = -32768;
/** Big-endian 0xFFF9; read little-endian it would decode as −1537. */
const GROUND_M = -7;
/** One post of the kind N28W081 carries over the lagoons by Cape Canaveral. */
const OVERFLOW_ROW = 3000; // lat 55.1667
const OVERFLOW_COL = 1000; // lon 12.2778

let dir = '';

/** One hand-written N55E012 cell: `GROUND_M` everywhere, void over the
 *  northern half (lat ≥ 55.5), which is row < 1800, and one int16-max post. */
function writeCell(): void {
  const buf = Buffer.alloc(POSTS * POSTS * 2);
  for (let row = 0; row < POSTS; row++) {
    const value = row < 1800 ? VOID : GROUND_M;
    for (let col = 0; col < POSTS; col++) buf.writeInt16BE(value, (row * POSTS + col) * 2);
  }
  buf.writeInt16BE(32767, (OVERFLOW_ROW * POSTS + OVERFLOW_COL) * 2);
  mkdirSync(join(dir, 'N55'), { recursive: true });
  writeFileSync(join(dir, 'N55', 'N55E012.hgt'), buf);
}

/** The global level-`z` lattice index whose post is nearest `(lon, lat)`. */
function latticeIndex(z: number, lon: number, lat: number): { i: number; j: number } {
  const step = 360 / (2 ** z * 128);
  return { i: Math.round((lon + 180) / step), j: Math.round((90 - lat) / step) };
}

describe('skadiHeightSource', () => {
  beforeAll(() => {
    dir = mkdtempSync(join(tmpdir(), 'skadi-'));
    writeCell();
  });
  afterAll(() => rmSync(dir, { recursive: true, force: true }));

  const source = () =>
    skadiHeightSource({
      dir,
      coverage: [{ west: 12, east: 14, south: 55, north: 56 }],
    });

  it('decodes big-endian signed posts', async () => {
    const { i, j } = latticeIndex(13, 12.4, 55.2);
    const grid = await source().readGrid(13, i, j, 2, 2);
    expect(grid).not.toBeNull();
    expect(Array.from(grid!)).toEqual([GROUND_M, GROUND_M, GROUND_M, GROUND_M]);
  });

  it('turns the −32768 void sentinel into NaN', async () => {
    const { i, j } = latticeIndex(13, 12.4, 55.8);
    const grid = await source().readGrid(13, i, j, 1, 1);
    expect(Number.isNaN(grid![0]!)).toBe(true);
  });

  it('turns an int16-max post into NaN, so it can never bake as a 32 km spike', async () => {
    const lon = 12 + OVERFLOW_COL / 3600;
    const lat = 56 - OVERFLOW_ROW / 3600;
    const { i, j } = latticeIndex(13, lon, lat);
    const grid = await source().readGrid(13, i, j, 1, 1);
    expect(Number.isNaN(grid![0]!)).toBe(true);
  });

  it('reads NaN where the cell is not on disk', async () => {
    const { i, j } = latticeIndex(13, 13.4, 55.2);
    const grid = await source().readGrid(13, i, j, 1, 1);
    expect(Number.isNaN(grid![0]!)).toBe(true);
  });

  it('reads a post by where it is, not by whether its tile overlaps the region box', async () => {
    const narrow = skadiHeightSource({
      dir,
      coverage: [{ west: 12.2, east: 12.3, south: 55.1, north: 55.2 }],
    });
    const { i, j } = latticeIndex(13, 12.8, 55.3);
    const grid = await narrow.readGrid(13, i, j, 1, 1);
    expect(grid).not.toBeNull();
    expect(grid![0]).toBe(GROUND_M);
  });

  it('declines a box entirely outside coverage', async () => {
    const { i, j } = latticeIndex(13, -30, -20);
    expect(await source().readGrid(13, i, j, 4, 4)).toBeNull();
  });

  it('reports native bounds over a box, ignoring voids', async () => {
    expect(
      await source().boundsInBox({ west: 12.2, east: 12.3, south: 55.1, north: 55.2 }),
    ).toEqual([GROUND_M, GROUND_M]);
    expect(await source().boundsInBox({ west: 12.2, east: 12.3, south: 55.6, north: 55.7 })).toBe(
      null,
    );
  });
});
