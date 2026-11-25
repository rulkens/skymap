import { describe, expect, it } from 'vitest';

import { horizonAngleOfByte } from '../../../../src/layers/body/surfaceTiles/horizon/utils/horizonAngleOfByte';
import { horizonTexelOf } from '../../../../src/layers/body/surfaceTiles/horizon/utils/horizonTexelOf';
import type { HeightPyramid } from '../../../../tools/textures/surfaceHorizon/@types/HeightPyramid';
import { bakeHorizonTile } from '../../../../tools/textures/surfaceHorizon/bakeHorizonTile';

const MOON_RADIUS_M = 1_737_400;
const DEG = Math.PI / 180;
// z10: 1024 columns of 128 lattice cells; tile row 256 starts on the equator, column 512 at lon 0.
const Z = 10;
const STEP_RAD = (360 / (1024 * 128)) * DEG;
const POST_M = STEP_RAD * MOON_RADIUS_M;
const RIDGE_M = 100;
const RIDGE_DISTANCE_M = 10 * POST_M;
const EAST = 4;
const WEST = 12;
const ONE_BYTE_DEG = 30 / 204;

/** A north–south ridge: `RIDGE_M` high from `fromLonRad` eastward, flat datum elsewhere. */
function ridgePyramid(fromLonRad: number, ceilingM: (x: number) => number): HeightPyramid {
  return {
    radiusM: MOON_RADIUS_M,
    maxLevel: Z,
    heightAt: (_z, lonRad) => (lonRad >= fromLonRad && lonRad < fromLonRad + 0.01 ? RIDGE_M : 0),
    subtreeMaxM: (_z, x) => ceilingM(x),
  };
}

function byteAt(rgba: Uint8Array, i: number, j: number, sector: number): number {
  const { dx, dy, channel } = horizonTexelOf(sector);
  return rgba[((2 * j + dy) * 66 + 2 * i + dx) * 4 + channel]!;
}

const analyticDeg =
  Math.atan2(RIDGE_M - RIDGE_DISTANCE_M ** 2 / (2 * MOON_RADIUS_M), RIDGE_DISTANCE_M) / DEG;

describe('bakeHorizonTile', () => {
  it('a ridge on a sphere shades its anti-sun side at the analytic angle', () => {
    // Post (0,0) sits at lon 0 on the equator; the ridge's near face is 10 posts east of it,
    // half a post before the sample the march lands on.
    const tile = bakeHorizonTile(
      ridgePyramid((RIDGE_DISTANCE_M - POST_M / 2) / MOON_RADIUS_M, () => RIDGE_M),
      Z,
      512,
      256,
    );
    if (tile.kind !== 'image') throw new Error('expected an image tile');
    expect(Math.abs(horizonAngleOfByte(byteAt(tile.rgba, 0, 0, EAST)) - analyticDeg)).toBeLessThan(
      ONE_BYTE_DEG,
    );
    // Flat sphere: the first post west sits a hair under 0°, which is byte round(3/30·204) = 20.
    expect(byteAt(tile.rgba, 0, 0, WEST)).toBe(20);
  });

  it('a flat sphere bakes as flat', () => {
    const flat: HeightPyramid = {
      radiusM: MOON_RADIUS_M,
      maxLevel: Z,
      heightAt: () => -1200,
      subtreeMaxM: () => -1200,
    };
    expect(bakeHorizonTile(flat, Z, 512, 256)).toEqual({ kind: 'flat' });
  });

  it('the march reads past the tile edge', () => {
    // Tile x = 511 ends at lon 0, which is also its z3 ancestor's east edge. Post (30,0) sits
    // 8 lattice posts west of it; the ridge starts 10 posts east of the post, in the next tile
    // and the next z3 tile, which alone holds ground that high.
    const tile = bakeHorizonTile(
      ridgePyramid(1.5 * STEP_RAD, (x) => (x === 4 ? RIDGE_M : 0)),
      Z,
      511,
      256,
    );
    if (tile.kind !== 'image') throw new Error('expected an image tile');
    expect(Math.abs(horizonAngleOfByte(byteAt(tile.rgba, 30, 0, EAST)) - analyticDeg)).toBeLessThan(
      ONE_BYTE_DEG,
    );
  });
});
