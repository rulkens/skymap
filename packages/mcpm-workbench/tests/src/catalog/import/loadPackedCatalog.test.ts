/**
 * loadPackedCatalog — parser against fixture bytes: interleaving of the
 * flat f32 [X, Y, Z, W] layout, and the length-vs-metadata guard.
 */
import { describe, expect, it } from 'vitest';
import { loadPackedCatalog } from '../../../../src/catalog/import/loadPackedCatalog';

/** Three points, each [X, Y, Z, W]: (1,2,3,4), (5,6,7,8), (9,10,11,12). */
function threePointBuffer(): ArrayBuffer {
  return new Float32Array([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]).buffer;
}

// The fork also writes "Mean weight"; nothing reads it, so it is not required.
const THREE_POINT_METADATA = 'Number of points = 3\n';

describe('loadPackedCatalog', () => {
  it('parses a flat f32 [X, Y, Z, W] buffer into interleaved positions and weights', () => {
    const points = loadPackedCatalog(threePointBuffer(), THREE_POINT_METADATA);

    expect(points.count).toBe(3);
    expect(Array.from(points.positions)).toEqual([1, 2, 3, 5, 6, 7, 9, 10, 11]);
    // Packed W plugs straight into the weight slot — deriveAgentWeights's
    // transform runs on it downstream unmodified.
    expect(Array.from(points.weight)).toEqual([4, 8, 12]);
  });

  it('rejects a buffer whose length disagrees with the metadata count, in words the dialog can show', () => {
    // Only 2 points' worth of bytes, but the metadata declares 3.
    const shortFlat = new Float32Array([1, 2, 3, 4, 5, 6, 7, 8]);
    const load = () => loadPackedCatalog(shortFlat.buffer, THREE_POINT_METADATA);
    expect(load).toThrow(/2.*3/);
    expect(load).not.toThrow(/loadPackedCatalog/);
  });

  it('rejects metadata without a point count, in words the dialog can show', () => {
    const load = () => loadPackedCatalog(threePointBuffer(), 'Mean weight = 8\n');
    expect(load).toThrow(/Number of points/);
    expect(load).not.toThrow(/loadPackedCatalog/);
  });
});
