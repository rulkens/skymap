import { describe, expect, it } from 'vitest';

import { sampleHeightTileM } from '../../../../tools/utils/textures/sampleHeightTileM';
import { HEIGHT_POSTS_PER_TILE } from '../../../../src/data/scene/heightTileFormat';

const N = HEIGHT_POSTS_PER_TILE;

function makeTile(heightAt: (col: number, row: number) => number): Float32Array {
  const heightM = new Float32Array(N * N);
  for (let row = 0; row < N; row++) {
    for (let col = 0; col < N; col++) heightM[row * N + col] = heightAt(col, row);
  }
  return heightM;
}

describe('sampleHeightTileM', () => {
  it('interpolates between adjacent posts, fractions tile-relative not cell-relative', () => {
    // A transposed row/col index reads a different post pair and misses both.
    const tile = makeTile((col, row) => (col === 0 ? 100 : 200) + (row === 0 ? 0 : 1000));
    expect(sampleHeightTileM(tile, 0.5 / (N - 1), 0)).toBeCloseTo(150, 6);
    expect(sampleHeightTileM(tile, 0, 0.5 / (N - 1))).toBeCloseTo(600, 6);
  });
});
