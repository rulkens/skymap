/**
 * A 129-post horizon tile is its 16 level-z+2 sub-tiles, each the 33-post march the bake always
 * ran. A wrong sub-tile, post, level or edge owner shifts shadows by a sub-tile or a post and still
 * looks plausible. The march is stubbed with a per-(sub-tile, level, post, sector) value, so the
 * two sub-tiles on a shared edge disagree, as real ones can (their march ceilings differ across a
 * z3 edge). Its own maths is in `bakeHorizonTile.test.ts`; what breaks here is where values land.
 */
import { describe, expect, it } from 'vitest';

import { horizonAngleOfByte } from '../../../../../src/layers/body/surfaceTiles/horizon/utils/horizonAngleOfByte';
import type { HeightPyramid } from '../../../../../tools/textures/surfaceHorizon/@types/HeightPyramid';
import { bakeHorizonTile } from '../../../../../tools/textures/surfaceHorizon/bakeHorizonTile';
import { assembleHorizonTile } from '../../../../../tools/textures/surfaceHorizon/utils/assembleHorizonTile';
import type { marchHorizonSector } from '../../../../../tools/textures/surfaceHorizon/utils/marchHorizonSector';

const FLAT: HeightPyramid = { radiusM: 1_737_400, heightAt: () => 0, subtreeMaxM: () => 0 };
const POSTS = 129;
const SUB_POSTS = 33;
const Z = 10;
const X = 517;
const Y = 260;

// Distinct bytes for neighbouring posts, sectors, levels and sub-tiles: a shift changes the value.
const stampedMarch =
  (x: number, y: number): typeof marchHorizonSector =>
  (_pyramid, z, lonRad, latRad, azimuthRad) =>
    horizonAngleOfByte(
      ((Math.round(3e5 * lonRad + 7e5 * latRad + 11 * azimuthRad + 17 * z + 5 * x + 23 * y) % 251) +
        251) %
        251,
    );

const bakeSub =
  (marchOf: (x: number, y: number) => typeof marchHorizonSector) =>
  (z: number, x: number, y: number) =>
    Promise.resolve(bakeHorizonTile(FLAT, z, x, y, marchOf(x, y)));

function block(rgba: Uint8Array, side: number, i: number, j: number): number[] {
  const texel = (dx: number, dy: number) => [
    ...rgba.subarray(
      ((2 * j + dy) * side + 2 * i + dx) * 4,
      ((2 * j + dy) * side + 2 * i + dx) * 4 + 4,
    ),
  ];
  return [...texel(0, 0), ...texel(1, 0), ...texel(0, 1), ...texel(1, 1)];
}

describe('assembleHorizonTile', () => {
  it("post (i, j) is sub-tile (i >> 5, j >> 5)'s post (i & 31, j & 31), the last row and column sub-tile 3's post 32", async () => {
    const tile = await assembleHorizonTile(bakeSub(stampedMarch), Z, X, Y);
    expect(tile.kind).toBe('image');
    if (tile.kind !== 'image') return;
    expect(tile.rgba.length).toBe(2 * POSTS * 2 * POSTS * 4);
    const subTiles = new Map<string, Uint8Array>();
    const subTile = (a: number, b: number) => {
      const key = `${a}/${b}`;
      if (!subTiles.has(key)) {
        const [x, y] = [4 * X + a, 4 * Y + b];
        subTiles.set(key, bakeHorizonTile(FLAT, Z + 2, x, y, stampedMarch(x, y)).rgba);
      }
      return subTiles.get(key)!;
    };
    const split = (p: number) => (p === POSTS - 1 ? [3, 32] : [p >> 5, p & 31]);
    for (let j = 0; j < POSTS; j++) {
      for (let i = 0; i < POSTS; i++) {
        const [a, si] = split(i);
        const [b, sj] = split(j);
        expect(block(tile.rgba, 2 * POSTS, i, j), `post ${i},${j}`).toEqual(
          block(subTile(a!, b!), 2 * SUB_POSTS, si!, sj!),
        );
      }
    }
  });

  it('is flat only when no marched post reaches 1°, in any sub-tile', async () => {
    const low: typeof marchHorizonSector = () => 0.9;
    expect(
      await assembleHorizonTile(
        bakeSub(() => low),
        Z,
        X,
        Y,
      ),
    ).toEqual({ kind: 'flat' });
    // The tile's east edge column, sub-tile 3's post 32, at 1°.
    const eastRad = -Math.PI + ((X + 1) * 2 * Math.PI) / 2 ** Z;
    const oneHigh: typeof marchHorizonSector = (pyramid, z, lonRad, ...rest) =>
      lonRad > eastRad - 1e-9 ? 1 : low(pyramid, z, lonRad, ...rest);
    expect(
      (
        await assembleHorizonTile(
          bakeSub(() => oneHigh),
          Z,
          X,
          Y,
        )
      ).kind,
    ).toBe('image');
  });
});
