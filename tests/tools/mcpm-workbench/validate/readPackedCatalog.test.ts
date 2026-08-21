import { describe, expect, it } from 'vitest';
import { readPackedCatalog } from '../../../../tools/mcpm-workbench/validate/readPackedCatalog';

describe('readPackedCatalog', () => {
  it('decodes a hand-built flat f32 [x, y, z, w] buffer into positions and weights', () => {
    // Two points: (1, 2, 3, w=0.5) and (-4.5, 6, -7.25, w=1.0).
    const buf = new Float32Array([1, 2, 3, 0.5, -4.5, 6, -7.25, 1.0]).buffer;

    const { positions, weights, count } = readPackedCatalog(buf);

    expect(count).toBe(2);
    expect(Array.from(positions)).toEqual([1, 2, 3, -4.5, 6, -7.25]);
    expect(Array.from(weights)).toEqual([0.5, 1.0]);
  });

  it('rejects a buffer whose length is not a multiple of 16 bytes', () => {
    const buf = new ArrayBuffer(10);
    expect(() => readPackedCatalog(buf)).toThrow(/not a multiple of 16/);
  });
});
