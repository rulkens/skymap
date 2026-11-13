/**
 * A tile lists every ring that can reach it and no far one: a missed tile cuts a rim or
 * a blanket at its edge, an over-full one costs the loop it was meant to save.
 */
import { describe, expect, it } from 'vitest';
import { mat4 } from 'wgpu-matrix';

import type { MoonCraterView } from '../../../../../src/layers/body/spheres/@types/MoonCraterView';
import { binMoonCraters } from '../../../../../src/layers/body/spheres/present/binMoonCraters';
import { moonCraterTable } from '../../../../../src/layers/body/spheres/present/moonCraterTable';
import { ANTIQUE_MOON_TILES } from '../../../../../src/layers/body/spheres/data/antiqueMoonPrint';

const [COLS, ROWS] = ANTIQUE_MOON_TILES;
const W = 1600;
const H = 900;

function view(distance: number): MoonCraterView {
  const fov = Math.PI / 3;
  return {
    eye: [distance, 0, 0],
    mvp: mat4.multiply(
      mat4.perspective(fov, W / H, 0.01, 100),
      mat4.lookAt([distance, 0, 0], [0, 0, 0], [0, 0, 1]),
    ),
    widthPx: W,
    heightPx: H,
    pxPerRad: H / 2 / Math.tan(fov / 2),
    unitPx: 1,
  };
}

const tilesOf = (out: Uint32Array, bit: number): number[] =>
  [...Array(COLS * ROWS).keys()].filter((t) => (out[2 * t + (bit >> 5)]! >>> (bit & 31)) & 1);

describe('binMoonCraters', () => {
  // A 100 km crater at the sub-eye point from 1.5 radii: ~170 px across at the centre.
  const table = moonCraterTable([0, 0, 50, 1], 1737.4);
  const centre = Math.floor(ROWS / 2) * COLS + Math.floor(COLS / 2);

  it("marks the tiles round a ring and not the frame's corners", () => {
    const out = new Uint32Array(COLS * ROWS * 2);
    const [tw, th] = binMoonCraters(table, [0], view(1.5), new Set(), new Set(), out);
    expect([tw, th]).toEqual([W / COLS, H / ROWS]);
    const tiles = tilesOf(out, 0);
    expect(tiles).toContain(centre);
    expect(tiles).not.toContain(0);
    expect(tiles).not.toContain(COLS * ROWS - 1);
  });

  it("reaches farther for a sea crater's blanket", () => {
    const plain = new Uint32Array(COLS * ROWS * 2);
    const sea = new Uint32Array(COLS * ROWS * 2);
    binMoonCraters(table, [0], view(4), new Set(), new Set(), plain);
    binMoonCraters(table, [0], view(4), new Set(), new Set([0]), sea);
    expect(tilesOf(sea, 0).length).toBeGreaterThan(tilesOf(plain, 0).length);
    expect(tilesOf(sea, 0)).toEqual(expect.arrayContaining(tilesOf(plain, 0)));
  });

  it("reaches farther for a rayed crater's ejecta", () => {
    const plain = new Uint32Array(COLS * ROWS * 2);
    const rayed = new Uint32Array(COLS * ROWS * 2);
    binMoonCraters(table, [0], view(1.5), new Set(), new Set(), plain);
    binMoonCraters(moonCraterTable([0, 0, 50, 1.3], 1737.4), [0], view(1.5), new Set(), new Set(), rayed);
    expect(tilesOf(rayed, 0).length).toBeGreaterThan(tilesOf(plain, 0).length);
  });

  it('puts a ring past the 32nd in the second word', () => {
    const out = new Uint32Array(COLS * ROWS * 2);
    binMoonCraters(table, [...Array(40).fill(0)], view(1.5), new Set(), new Set(), out);
    expect(out[2 * centre + 1]).toBe(0xff);
  });
});
