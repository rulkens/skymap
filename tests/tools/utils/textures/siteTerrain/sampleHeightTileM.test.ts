import { describe, expect, it } from 'vitest';

import { sampleHeightTileM } from '../../../../../tools/utils/textures/siteTerrain/sampleHeightTileM';
import { HEIGHT_POSTS_PER_TILE } from '../../../../../src/data/scene/heightTileFormat';

const N = HEIGHT_POSTS_PER_TILE;
const CELL = 1 / (N - 1);

function makeTile(heightAt: (col: number, row: number) => number): Float32Array {
  const heightM = new Float32Array(N * N);
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) heightM[row * N + col] = heightAt(col, row);
  }
  return heightM;
}

describe('sampleHeightTileM', () => {
  it('interpolates along columns and rows without transposing them', () => {
    const tile = makeTile((col, row) => col * 10 + row * 1000);
    expect(sampleHeightTileM(tile, 3 * CELL, 0)).toBeCloseTo(30, 4);
    expect(sampleHeightTileM(tile, 0, 3 * CELL)).toBeCloseTo(3000, 4);
  });

  it('reads the drawn mesh, which skips the odd posts between its vertices', () => {
    const tile = makeTile((col) => (col === 1 ? 50 : 0));
    expect(sampleHeightTileM(tile, CELL, 0)).toBeCloseTo(0, 6);
  });
});
